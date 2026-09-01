# System design

These answer with reference to the frontend in this repo (Assignment 1). The
system is a static SPA: a `FleetSource` (`src/sources/`) emits `Tick`s, a reducer
(`src/domain/fleetReducer.ts`) folds them into `FleetState`, selector hooks
(`src/state/useFleet.ts`) feed the views (`src/components/`).

## 1. Adding a new feature later

**Design accommodates it**, as long as the feature is a new *view* or a new
*derivation* of robot state. The views never touch a source; they read
`RobotSnapshot` and `series` through selectors.

Worked example — *"alert when a robot enters a restricted zone on the map"*:

- Add the zone polygons and a `zoneViolation(snapshot)` predicate to
  `src/domain/status.ts`, next to `needsAttention`.
- Fold it into the attention check in `attention()` (one new reason string) so it
  shows up in `RobotList` and `RobotDetail` for free.
- Add a `<polygon>` layer to the single SVG in `src/components/MapView.tsx`; it is
  already in image pixel space, so no coordinate work.
- Optionally add a `zoneViolations` count to `computeTrendSample` in
  `src/domain/aggregates.ts` and a band to `TrendChart`.

Nothing in `sources/` or the reducer's action shape changes. The one place a
feature *would* force a rework is if it needs **per-robot history older than the
256-sample cap** (e.g. "show me r3's whole shift") — that needs a real history
store, not the bounded arrays in `RobotSnapshot`.

## 2. Growing from 8 to 500 robots

**First thing that breaks: the per-frame full-fleet render path.**

Concretely: `FleetProvider.flush()` dispatches one `APPLY_TICK`; `fleetReducer`
builds a fresh `robots` map and runs `computeTrendSample` over every robot on
every tick; `useRobots()` returns a new array, so every component subscribed to
the context re-renders. With 8 robots reporting every ~5 s this is free. With 500
robots that is ~100 events/s, a 500-iteration aggregate per tick, and — the real
cliff — **500 SVG markers, each with two `<text>` labels and a trail polyline,
re-rendered every animation frame**. The map goes from ~40 nodes to ~2500+ and
frame time blows past 16 ms. `series` and the stacked-area path (one point per
sample) degrade more gently but also grow.

Why that specifically: the whole architecture leans on "the fleet is small enough
that recomputing everything each frame is fine". That assumption is load-bearing
in three places at once (reducer aggregate, context array identity, SVG marker
count).

Fixes: normalize state and give each marker its own subscription (Zustand/Redux
selector or `useSyncExternalStore` per id) so only changed robots re-render;
virtualize / cull markers to the viewport; move `computeTrendSample` to a Web
Worker or compute it incrementally; decimate `series` to ~1 sample/second;
switch the map to canvas above a few hundred robots.

## 3. Limited bandwidth between robots and backend

This is a frontend, so the lever is **what the feed emits** (today,
`src/sources/liveSource.ts`; with a server, the same `Tick` shape).

- **Send deltas, not snapshots.** Only fields that changed since the last frame
  for that robot. `applyEvent` in `fleetReducer.ts` already merges partial updates
  cleanly (it spreads over the previous snapshot).
- **Quantize.** Round `x`/`y` to integers (the map can't show sub-pixel anyway)
  and `battery` to whole percent; send `battery` only when it moves ≥ 1 %.
- **Drop cadence and interpolate.** Emit every 2–5 s instead of sub-second; the
  client already keeps a `trail`, so it can tween positions between updates.
- **Coalesce framing.** One compact binary/CSV frame per fleet tick instead of a
  JSON object per robot.
- **Widen the staleness window.** `STALE_AFTER` in `src/domain/status.ts` would
  need to grow to match the slower cadence so robots don't all show "no recent
  update".

Detail carried per message drops from ~6 JSON fields to a delta of 1–3 quantized
values, cadence drops several-fold, and the operator loses very little because the
UI is already smoothing motion and thresholding battery.

## 4. A robot goes down mid-task and stops responding

**How the system finds out:** absence of signal. The robot stops emitting, so its
`RobotSnapshot.lastUpdateT` stops advancing while `FleetProvider` keeps advancing
`clock` from other robots' ticks (and from the clock-only branch of `APPLY_TICK`).
`isStale()` in `src/domain/status.ts` flips once `clock - lastUpdateT > 30`, and
`attention()` adds the reason `"no recent update"`.

**What the rest of the system does:** `RobotList` floats it to the top (attention
sort) with a red badge; `MapView` draws the dashed attention ring on its
last-known position; `computeTrendSample` counts it in the **attention** bucket,
not **working**, so the trend line reflects the loss immediately. If it had an
unpaired `task_started` (no matching `task_completed`), that stays visible in
`RobotDetail`'s task list as a dangling task. Nothing tries to reassign the task —
that would be a backend concern.

## 5. Slow / unreliable link: late, out-of-order, or missing updates

**What the rest sees during the gap:** the robot holds its last-known position and
status and ages into "stale" → attention (Q4). The rest of the fleet is
unaffected, and because the trend chart samples on every tick, the fleet-level
view stays live and simply shows one more robot in the attention band.

**Out-of-order:** `applyEvent` in `src/domain/fleetReducer.ts` guards the odometer
(`distance += moved only if ev.t >= prev.t`), but it still writes whatever event
arrived last, so a delayed older sample would briefly snap the marker backwards.
The intended fix is to discard events with `ev.t < snapshot.t` outright — a small
change in `applyEvent`.

**Recovery once healthy:** the replay path already implements the pattern a live
reconnect would use — `replaySource.seek()` emits a single synthetic `Tick`
containing the latest sample per robot (`stateAt(t)`), which the reducer folds in
without needing the events it missed. A reconnecting live client would request the
same "current state" catch-up frame. After it lands, `lastUpdateT` advances,
`isStale()` returns false, and `attention()` clears the robot on the next tick.
