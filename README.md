# Fleet Management Dashboard — Frontend

Operator dashboard for a fleet of eight robots moving around a site. It plays back
the recorded log (`events.jsonl`) and can also run a **synthetic live feed** that
generates fresh events for the same fleet. One set of views serves both.

> Peppermint Robotics SDE-1 hiring challenge, Assignment 1 (Frontend).

## Quick start

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts:

| command | what it does |
|---|---|
| `npm test` | run the Vitest suite |
| `npm run build` | type-check + production build into `dist/` |
| `npm run preview` | serve the production build locally |

Requires Node 18+ (developed on Node 22).

## Deployed link

**https://sakshis9.github.io/peppermint_SDE_assignment/** — deployed to GitHub
Pages from `.github/workflows/deploy.yml` (builds on every push to `main` and
publishes `dist/`). The build is a fully static SPA with no backend, so any
static host works. `vite.config.ts` sets `base: './'` so it also works when
served from a sub-path (GitHub Pages project sites).

Deploy recipes:

- **Vercel / Netlify** — framework preset "Vite", build `npm run build`, output
  `dist`. No env vars.
- **GitHub Pages** — `npm run build`, publish the `dist/` folder (e.g. with the
  `actions/deploy-pages` workflow or `npx gh-pages -d dist`).

## How it works

### Two sources, one set of views

Everything the UI renders comes from a single reducer-backed store
(`src/domain/fleetReducer.ts`). Anything that can drive it implements the
`FleetSource` interface (`src/sources/types.ts`): it owns a clock, emits batches
of events, and can be played, paused and sped up.

- **Replay** (`src/sources/replaySource.ts`) advances a sim-clock by
  `realElapsed × speed` each animation frame and releases every recorded event
  whose `t` has come due. The scrubber calls `seek()`, which rebuilds state by
  replaying from the start (the whole window is only ~1450 events).
- **Live feed** (`src/sources/liveSource.ts`) is a small simulation: each robot
  moves toward a waypoint at a per-type speed, its battery drifts by status
  (work drains, `charging` fills, low battery sends it to a charger), and its
  status follows a weighted state machine over a fixed set of legal transitions.
  Everything routes through a seeded PRNG (`src/sources/prng.ts`) so a given seed
  always produces the same stream — which is what makes it testable.

**Live feed rate:** each robot emits once every **2 sim-seconds**, so the fleet
produces about **4 events/second at 1×**. The speed control scales sim-time per
real second, so higher speeds emit the same series faster rather than changing
its shape. Both the replay and the live feed are reachable from the top bar of
the deployed build.

### What counts as "working" / "needs attention"

The brief leaves this undefined on purpose. The call lives in one place —
`src/domain/status.ts` — so every view agrees:

- **Working** — `active`, `on_mission` (productively busy).
- **Available** — `idle`, `charging` (healthy, not on a job).
- **Needs attention** — `blocked`, `error`, `maintenance`, `offline`, **or**
  battery ≤ 20 % (will strand mid-aisle), **or** no update for more than 30
  sim-seconds (a silent robot is indistinguishable from a dead one).

### The three operator jobs

1. **See the site and all eight robots** — `src/components/MapView.tsx` draws the
   layout image and every robot in one `<svg>` whose viewBox is the image's own
   pixel space, so robot coordinates need no conversion. Speed control is 1×–60×
   plus a scrubber in replay.
2. **See how the fleet is trending** — `src/components/TrendChart.tsx` is a
   hand-rolled SVG stacked area of Working / Available / Needs-attention as a
   share of the fleet across the window, with an optional average-battery line.
   It fills left-to-right in replay and shows a rolling window in live. The stat
   cards above it are current-value readouts and deliberately do **not** stand in
   for the trend.
3. **Find a robot / the ones needing attention** — `src/components/RobotList.tsx`
   has search (id / type / status) and a "Needs attention" filter, sorted so
   problems float to the top. `src/components/RobotDetail.tsx` shows position,
   battery sparkline, a status timeline, distance travelled and recent task
   events — enough to decide what to do next.

## Tests

```bash
npm test
```

The trickiest part is the live generator, so most of the tests target it
(`src/sources/liveSource.test.ts`): determinism for a seed, battery stays in
`[0, 100]`, battery only ever rises while `charging`, robots stay inside the
world, every status transition is a legal edge, and a drained robot ends up
charging. The shared store and the replay engine are covered too
(`src/domain/fleetReducer.test.ts`, `src/sources/replaySource.test.ts`,
`src/domain/aggregates.test.ts`). 20 tests total.

## Project layout

```
src/
  domain/      types, the status model, fleet aggregates, the reducer
  sources/     FleetSource interface, replay engine, live simulator, PRNG
  state/       React context wiring + selector hooks
  components/  TopBar, MapView, TrendChart, StatCards, RobotList, RobotDetail, …
public/data/   layout.png, robots.json, events.jsonl (loaded at runtime)
```

## AI delegation notes

- Project scaffolding (Vite config, tsconfig, Tailwind wiring), the first pass of
  most component JSX, and the initial test cases were drafted with Claude
  (Anthropic) and then reviewed and edited by me.
- The design decisions are mine: the `FleetSource` abstraction, the fleet-state
  shape, the working/attention classification and thresholds, the live-feed
  motion / battery / status model and its rates, and the choice of a hand-rolled
  stacked-area trend over a chart library.

## What I left out / would do next

See `ANSWERS.md` (Q3) and `SYSTEM_DESIGN.md`. Short version: the live robots do
not avoid the shelves, history is not persisted across a reload, the trend panel
shows a single chart, and there is no server-backed feed option. Next I would add
a delta-encoded server feed with the in-browser generator as the fallback,
per-robot subscriptions so the render path scales past a handful of robots, and a
small settings panel for the attention thresholds.
