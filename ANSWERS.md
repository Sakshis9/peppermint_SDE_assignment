# Written answers

## 1. What holds the fleet's state as data arrives, and why that shape?

The single owner is the reducer in **`src/domain/fleetReducer.ts`**, holding the
`FleetState` defined in **`src/domain/types.ts`**. It is driven through one
action, `APPLY_TICK`, dispatched from **`src/state/FleetProvider.tsx`**.

The shape:

- **`robots: Record<RobotId, RobotSnapshot>`** — a dictionary keyed by id. The map
  and the list ask "where is `r6` now" on every frame, and each incoming event
  updates exactly one robot, so a keyed dictionary is the natural fit. Each
  `RobotSnapshot` also carries a *bounded* `trail` (last 24 positions) and
  `history` (last 256 `{t, battery, status}` samples) plus a `distance` odometer,
  so the map trails and the detail sparkline/timeline are ready without scanning a
  global event log, and memory stays flat during a long live run or a 60× replay.
- **`series: TrendSample[]`** — a *precomputed* array of fleet-wide aggregates,
  one entry appended per applied tick by `computeTrendSample`
  (**`src/domain/aggregates.ts`**). Trends are the common operator question, and
  computing the aggregate once on write is far cheaper than recomputing it from
  history on every animation frame. It is capped at 1000 samples.
- **`clock`** and **`taskEvents`** round it out.

Why this works for both drivers: replay and live both implement the `FleetSource`
interface in **`src/sources/types.ts`** and emit the same `Tick` objects, so the
reducer and every view are identical regardless of source. `FleetProvider` buffers
ticks and flushes them once per `requestAnimationFrame` (`onTick` → `flush` →
`dispatch`), which keeps React re-rendering at frame rate even when a 60× replay
is releasing events far faster than that.

## 2. One real tradeoff, and the argument for it

**The live feed is generated entirely in the browser (`src/sources/liveSource.ts`),
with no server or message broker.**

Argument for it: the deliverable has to be a link a reviewer can open with nothing
to set up, and it has to keep working indefinitely. A pure-static SPA on a CDN has
no cold start, no server to keep alive on a free tier, no deploy of a second
service, and no CORS/websocket plumbing. The simulator is ~200 lines, it is
deterministic (seeded PRNG), and because it produces the exact same `Tick` shape
as the replay, adding it cost almost nothing on the consumer side — the reducer,
the views and the tests did not change.

What it cost:

- It is not a real feed. There is no network, so it cannot demonstrate reconnect
  behaviour, backpressure, or multiple clients converging on one state. Two
  browser tabs run two independent simulations.
- State is lost on reload — the feed always restarts from the seed.
- The motion model is deliberately simple (waypoints, no obstacle avoidance), so
  robots sometimes track straight across a shelf.

If I needed a genuine live feed I would put a small WebSocket publisher behind the
same `FleetSource` interface and fall back to the in-browser generator when it is
unreachable — the seam for that already exists.

*(Secondary tradeoff, if useful: the trend `series` is aggregated eagerly in the
reducer rather than derived from history on render. That makes 60× replay cheap
but freezes the aggregation logic — changing what "working" means requires
replaying to rebuild the series rather than just recomputing a selector.)*

## 3. What I left out, and what I would build next

Left out:

- **Obstacle-aware motion** in the live feed — robots do not route around the
  shelves in `layout.png`.
- **Persistence** — reloading the page restarts playback / the simulation; there
  is no saved position or history.
- **Server-backed feed** — only the in-browser generator exists, so there is
  nothing to demonstrate reconnect/replay-on-reconnect against a real socket.
- **Richer trend panel** — one stacked-area chart with an optional battery line;
  no per-status breakdown chart, no brushing, no CSV export.
- **Bulk operations** — you can select one robot, not filter-and-act on several.
- **End-to-end tests** — the suite is unit-level (generator, reducer, replay,
  aggregates); there is no browser-driven test.

Next, roughly in priority order:

1. A delta-encoded WebSocket feed (server process) with the current in-browser
   generator kept as the automatic fallback, both behind `FleetSource`.
2. Per-robot store subscriptions (or a selector store) so the render path scales
   past a handful of robots without re-rendering every marker each frame.
3. A small settings panel to tune the attention thresholds
   (`LOW_BATTERY`, `STALE_AFTER` in `src/domain/status.ts`) live.
4. Drop stale/out-of-order events by comparing `ev.t` to the stored snapshot `t`
   in `applyEvent`, instead of always taking the last-received sample.
5. Persist the trend series and last positions to `localStorage` so a reload
   resumes where it was.
