# Engine Design — Fast Lane 2026

Design for `packages/engine`, the pure, deterministic rules engine. It covers everything Phase 1 of the
[implementation plan](implementation-plan.md) builds, and fixes the shapes that later phases plug into (jobs, events,
Jones, Daily Run verification), so those phases add code without reworking the core.

**Status:** draft for review. Decisions marked **(open)** are listed in §17.

## 1. Constraints

| Constraint | Source | Consequence for the design |
|---|---|---|
| Same seed + same actions = same outcome, in every runtime | NFR-12 | Integer maths only, banned APIs (§5), RNG state inside game state (§6) |
| World randomness is separate from player-driven randomness | NFR-12, FR-05a | Named RNG streams, keyed by scope and week (§6) |
| Previews show exact costs and effects without changing anything | FR-03, FR-21 | Every action is split into a pure `plan` and an `apply` (§8) |
| End of week runs in a fixed order, per player then per round | FR-05 | An ordered, pausable pipeline of steps (§11) |
| The server replays runs with the same engine | tech-stack §2, §5 | No DOM, no Node APIs, no runtime dependencies beyond plain TS |
| Content is data and tuned without code changes | NFR-15, FR-74 | The engine receives content as an argument and never hard-codes balance values (§13) |
| No softlocks | FR-14 | Cash never goes negative; there is always a legal action (§10) |
| 2k-game balance sim fits in the 8-minute CI budget | CI-04 | Performance budget and an in-place reducer for the sim (§3) |

## 2. Package layout

```
packages/engine/
├─ src/
│  ├─ index.ts            # createEngine() and public types only
│  ├─ types/              # GameState, Action, DomainEvent, ids, units
│  ├─ core/
│  │  ├─ reduce.ts        # dispatch, validation, the advance loop (§7)
│  │  ├─ phase.ts         # turn / end-of-turn / end-of-round state machine
│  │  ├─ clone.ts         # fast clone for plain-JSON state
│  │  └─ hash.ts          # canonical JSON + 64-bit hash
│  ├─ math/               # fixed-point helpers: cents, basis points, clamping
│  ├─ rng/                # xoshiro128**, seed hashing, stream registry
│  ├─ stats/              # changeStat(), ranges, threshold modifiers
│  ├─ board/              # ring distances, travel cost
│  ├─ actions/            # action framework + one handler per kind
│  ├─ pipeline/           # step order, per-player and per-round steps
│  ├─ ai/                 # AI policy (Phase 1: random legal; Phase 3: utility)
│  └─ save/               # save schema, migrations (separate entry point, §14)
└─ test/
   ├─ unit/  property/  golden/
   └─ fixtures/           # seed + log → expected hash
```

`packages/engine` depends on `packages/content` for **types only** (`import type`). Zod is used in `content` at build
time and in `engine/save` at load time, never in the engine's main entry point, so it stays out of the hot path and the
initial bundle.

## 3. Public API

```ts
export function createEngine(content: Content): Engine

export interface Engine {
  newGame(setup: GameSetup): GameState
  reduce(state: GameState, action: Action): ReduceResult
  listActions(state: GameState): ActionOption[]          // for the active player
  preview(state: GameState, action: Action): Preview     // never changes state or RNG
  hash(state: GameState): string
}

export type ReduceResult =
  | { ok: true; state: GameState; events: DomainEvent[] }
  | { ok: false; error: RuleError }                      // input state is untouched
```

- **Content is bound once** in `createEngine`, so every call site doesn't pass it around, and tests can build an engine
  from a small fixture content set.
- **Rule violations are values, bugs are exceptions.** Trying to travel without enough time returns
  `{ ok: false, error: { code: 'NOT_ENOUGH_TIME', … } }`. A broken invariant (a stat out of range, an unknown id in
  state) throws, because it means the engine is wrong, not the player.
- **Immutability at the boundary.** `reduce` clones the input with a hand-written plain-JSON clone, then handlers mutate
  the copy. Callers can rely on the input never changing (tests deep-freeze it). The sim uses an internal
  `reduceInPlace` that skips the clone. Immer was considered and rejected: it costs bundle size and adds proxy overhead
  to millions of sim actions.
- **Performance budget:** a 52-week, 2-player game (1 human-scripted + 1 AI) runs in under 50 ms in Node. That keeps
  2k CI games under 2 minutes on one core.

## 4. Game state

State is **plain JSON**: no classes, `Map`, `Set`, `undefined` values, functions or cycles. That makes it trivially
cloneable, hashable, storable in IndexedDB and sendable to the Worker.

```ts
interface GameState {
  schemaVersion: number
  seed: string                      // run seed (Daily Run: from GET /daily)
  config: GameConfig                // difficulty, goal targets, week limit, turnLengthWeeks
  week: number                      // 1-based calendar week, shared by all players (FR-05a)
  phase: Phase
  turnOrder: PlayerId[]
  players: Record<PlayerId, PlayerState>
  world: WorldState                 // shared; only per-round steps may change it
  rng: RngState                     // live stream states for the current week (§6)
  pending: Decision | null          // a choice the active human must make (§11)
  nextId: number                    // deterministic counter for new instance ids
  history: WeekRecord[]             // compact per-player, per-week numbers for the run summary
}

type Phase =
  | { kind: 'turn'; player: PlayerId }
  | { kind: 'endOfTurn'; player: PlayerId; step: number }
  | { kind: 'endOfRound'; step: number }
  | { kind: 'gameOver'; result: GameResult }

interface PlayerState {
  id: PlayerId
  name: string
  controller: 'human' | 'ai'
  aiProfile?: AiProfileId
  location: LocationId
  timeLeft: Minutes
  stats: Stats                      // §10
  wardrobe: WardrobeTier
  mealsThisWeek: number
  // Phase 2+ adds: job, housing, accounts, debts, items, skills, goals progress …
}
```

Rules:

- **Ids are strings.** Content ids are kebab-case (`burger-bot`, `burger-bot.eat`). Instance ids (an item you bought,
  a loan) come from `nextId`, never from time or randomness. Ids that look like integers are not allowed as `Record`
  keys, because JS orders integer-like keys differently from other keys.
- **`world` is read-only during a player's turn.** The per-player context exposes it as `Readonly<WorldState>`, so a
  player step can't change prices for players who go later (FR-05a). Only per-round steps get a writable world.
- **`turnLengthWeeks`** (default 1) is in `config` from day one, so Long Life (FR-91) is a balance change later, not a
  state migration. Recurring steps multiply by it; Phase 1 only carries the field.

## 5. Numbers and determinism

Basic IEEE-754 arithmetic (`+ − × ÷`, `Math.sqrt`) gives the same result in every JS engine. Functions like
`Math.pow`, `Math.exp` and `Math.sin` don't: the spec lets each engine approximate them. V8 (Chrome, Node, Workers)
and JavaScriptCore (Safari, every iPhone browser) can differ in the last bit, which is enough to break Daily Run
verification for every iPhone player. So the engine uses integers and fixed-point values only.

| Quantity | Unit in state | Notes |
|---|---|---|
| Money | integer **cents** (`Cents`) | 2^53 cents is far beyond any reachable balance |
| Time | integer **minutes** (`Minutes`) | 60 h budget = 3600. UI shows hours. Allows 15-minute actions |
| Stats | integers within their range | §10 |
| Probabilities, modifiers | integer **basis points** (10 000 = 100% or ×1) | `chance(250)` = 2.5% |
| Weekly interest rates | integer **parts per million** | Annual → weekly conversion happens in the content build, not at runtime |

- One rounding helper: `applyBp(x, bp) = Math.round(x * bp / 10_000)`. All percentage maths goes through it (and its
  ppm twin), so rounding behaviour lives in one place.
- Branded types (`type Cents = number & { __unit: 'cents' }`) stop minutes being added to cents by accident.

**Banned in `packages/engine/src`** (checked by a source-scan test, since Biome can't ban individual `Math` methods):

| Banned | Why |
|---|---|
| `Math.random`, `Date`, `performance`, `crypto` | Non-deterministic |
| `Math.pow/exp/log*/sin/cos/tan/a*/cbrt/hypot/expm1`, `**` | Results can differ between JS engines |
| `localeCompare`, `Intl`, `toLocale*` | Depend on the runtime's locale data |
| `async`, `await`, timers | The engine is synchronous |
| DOM, Node built-ins | Must run in the browser, Node and Workers |

Allowed: `Math.floor/ceil/round/trunc/min/max/abs/sign/sqrt/imul`. `Array.prototype.sort` is fine (stable since
ES2019), but comparators must be total, with an id tie-break.

## 6. Random numbers

**Generator:** xoshiro128** (4 × uint32 state, ~20 lines, written in-repo rather than taken as a dependency, so the
state format is ours and can't change in a library upgrade). Seeds come from hashing a string key with cyrb128, which
only uses `Math.imul` and bit operations.

**Streams are keyed by name, scope and week:**

```
streamKey = `${name}:${scope}:${week}`        e.g. "world::12", "events:p1:12", "ai:jones:12"
streamSeed = cyrb128(`${runSeed}|${streamKey}`)
```

| Stream | Scope | Used for | Phase |
|---|---|---|---|
| `world` | round | Inflation, market moves, news, job openings | 2–3 |
| `action` | player | Random outcomes of the player's own actions (gig pay, thrift finds, exam results) | 2 |
| `job` | player | AI-disruption rolls (FR-42) | 2 |
| `events` | player | Weekend event draws and outcomes | 3 |
| `ai` | AI player | Jones's decisions (tie-breaks, "how often it picks the best move") | 1 (random policy), 3 |

Why key by week as well as by name:

- **Isolation in time.** If a content change makes week 3 draw one extra number, week 4 is unaffected. Balance tuning
  doesn't reshuffle the whole run, and golden tests break only where behaviour really changed.
- **Isolation between systems.** Taking an extra gig (`action`) doesn't change your weekend event (`events`), and nothing
  a player does changes the `world` stream (NFR-12).
- **Small state.** `rng` holds only the streams touched this week (`Record<streamKey, [u32, u32, u32, u32]>`). It is
  cleared when the round ends.

**API**, only available to `apply` code and pipeline steps (never to `plan`, §8):

```ts
interface Rng {
  int(min: number, max: number): number                   // inclusive
  chance(bp: number): boolean
  pick<T>(items: readonly { weight: number; value: T }[]): T  // integer weights
}
ctx.rng('events')   // stream for the current player and week; 'world' only in per-round steps
```

There is no `float()` in the public API. Probabilities are basis points and weights are integers, so content authors
never write a float that could round differently.

## 7. Turns, rounds and phases

```
newGame ─► turn(p1) ─endWeek─► endOfTurn(p1, steps…) ─► turn(p2) ─► … ─► endOfTurn(last)
              ▲                      │ may pause for a decision                     │
              │                      ▼                                               ▼
              └──────── week+1 ◄── endOfRound(steps…) ─── goal check may ──► gameOver
```

- **Actions carry no player id.** An action always applies to the active player (`phase.player`). That removes a whole
  class of "act as someone else" bugs and cheats.
- **The advance loop.** After every successful action, `reduce` keeps advancing until a human has to act: it runs
  pipeline steps, plays AI turns, and starts the next round. One `endWeek` from the last human can therefore return a
  long list of events (their end of turn, Jones's whole turn, the round end, the next human's `turnStarted`). The UI
  plays them back in order.
- **AI turns run inside the engine, and the log holds only human actions.** The AI policy picks actions using the `ai`
  stream, so a replay recomputes Jones exactly. This means a client can't submit fake Jones moves in a Daily Run. The
  cost: changing the AI policy changes old replays, which is fine because saves and Daily Runs pin the engine version
  (§14). A turn longer than 200 AI actions throws, so a buggy policy can't loop forever.
- **Turn end (FR-04).** The turn ends when the player sends `endWeek`, or automatically when `timeLeft` reaches 0 or
  Energy reaches 0 (forced rest). Leftover time becomes the rest bonus.
- **Hotseat (FR-06).** Moving to another human's turn emits `turnStarted`, which the UI uses for the handoff screen.

## 8. Actions

### 8.1 Commands

```ts
type Action =
  | { type: 'travel'; to: LocationId; mode?: TransportModeId }
  | { type: 'perform'; actionId: ActionDefId; hours?: number }   // hours for variable-length actions
  | { type: 'endWeek' }
  | { type: 'decide'; decisionId: string; optionId: string }
```

The command set stays this small. New gameplay comes from new **action definitions** in content and new **handler
kinds** in code, not from new command types.

### 8.2 Definitions (content) and handlers (code)

An action definition says *where*, *which handler* and *with which numbers*:

```jsonc
{
  "id": "burger-bot.eat",
  "location": "burger-bot",
  "kind": "eat",
  "labelKey": "action.burgerBot.eat",
  "time": { "fixed": 30 },
  "cost": 899,
  "effects": [{ "stat": "health", "delta": -1 }, { "stat": "happiness", "delta": 2 }],
  "params": { "meals": 1 }
}
```

A handler is the code for one `kind`, split into two halves:

```ts
interface ActionHandler<P> {
  kind: string
  plan(ctx: PlanCtx, def: ActionDef<P>, action: PerformAction): Plan | Unavailable   // pure, no RNG
  apply(ctx: ApplyCtx, plan: Plan): void                                            // may use ctx.rng
}

interface Plan {
  time: Minutes
  money: Cents
  energy: number
  effects: StatDelta[]             // the deterministic part
  modifiers: AppliedModifier[]     // e.g. { source: 'low-energy', target: 'workOutput', bp: -2000 }
  outcomes?: OutcomeRange[]        // the random part, as ranges and odds ("$80–$140", "35% chance")
}

type Unavailable = { available: false; reason: RuleError }   // e.g. NOT_ENOUGH_MONEY, CLOSED, NEEDS_LAPTOP
```

- **Previews are plans.** `preview()` and `listActions()` call `plan` and return its result. `PlanCtx` has no `rng`
  member, so "previews never consume RNG" is enforced by the type checker, not just by tests.
- **Preview and outcome can't drift.** `apply` receives the same `Plan` the player saw, so the shown cost is the
  charged cost.
- **Legality lives in `plan`.** `listActions` returns every action at the current location, every travel destination
  and `endWeek`, each marked available or not with a reason, so the UI can grey actions out and say why.
- **Phase 1 handler kinds:** `rest`, `eat`, and `basic` (fixed time, cost and effects from data). Phase 2 adds
  `work-shift`, `study`, `buy`, `apply-job` and the banking kinds.

### 8.3 Modifiers

A modifier changes a target quantity by basis points and carries a label key for the UI (FR-21):

```ts
interface Modifier { source: string; target: ModifierTarget; bp: number; labelKey: string }
type ModifierTarget = 'workOutput' | 'studyOutput' | 'travelTime' | 'energyCost' | …
```

`collectModifiers(ctx, target)` gathers them from every source in a fixed order: stat thresholds (Phase 1, from
balance data, e.g. Energy < 25 → work output −20%), then items (Phase 2), then news (Phase 3). They are summed in basis
points and applied once with `applyBp`, so stacking order never changes the result.

## 9. Board and travel

```jsonc
// board.json
{
  "ring": ["your-place", "leaselord", "joblink", "upskill-u", "fulfillment", "burger-bot",
           "freshmart", "thriftup", "circuit-planet", "neobank"],
  "segments": [2, 1, 2, 2, 1, 2, 1, 1, 2, 2],   // distance from ring[i] to ring[i+1], wrapping
  "bidirectional": true
}
```

- Distance is the shorter way round the ring (or clockwise only if `bidirectional` is false, **open**).
- Travel time = `distance × mode.minutesPerUnit + mode.overheadMinutes`, then travel-time modifiers. Money =
  `mode.costPerTrip`.
- Transport modes live in `transport.json`, each with requirements (`requires: { item: 'e-scooter' }`). Phase 1 ships
  **walk** and **transit**. E-scooter, car and rideshare arrive with items in Phase 2 (FR-02).
- Travel is illegal if the player can't afford its time or money, or is already there. You can't start a trip you can't
  finish, and `endWeek` is always legal, so this never strands anyone.
- GigHub isn't a ring location. Its actions have `location: '*'` and are available everywhere (FR-44).

## 10. Stats

| Stat | Phase 1 storage | Range | Notes |
|---|---|---|---|
| Cash | `Cents` | ≥ 0 | Never negative (below) |
| Time | `Minutes` (`timeLeft`) | 0 – budget | Budget from balance data (default 3600); reset each week |
| Energy | int | 0–100 | 0 ends the turn (forced rest). The burnout event card comes in Phase 3 |
| Health, Happiness, Social | int | 0–100 | |
| Credit score | int | 300–850 | Moves only from Phase 2 (debt, rent) |
| Hunger | `mealsThisWeek` count | ≥ 0 | 0 at the food check → penalty |
| Wardrobe | tier enum | Casual → Founder Hoodie | Checked by jobs in Phase 2 |

Ranges, starting values and every number below come from `balance.json`.

- **One write path.** All stat changes go through `changeStat(ctx, player, stat, delta, cause)`. It clamps to the range,
  records the *applied* delta (which may be smaller than requested) and emits `statChanged`. Code never writes
  `player.stats.x = …` directly, and the range property test (§15) catches any slip.
- **Cash never goes negative.** Actions you can't afford are unavailable. End-of-week charges that can't be covered go
  through missed-payment handling in Phase 2 (warning → debt/collections → eviction to Parents' Basement, FR-14), never
  a negative balance. Clamping cash at 0 would silently create money, so cash is *not* clamped: an apply that would
  make it negative throws.
- **Rest bonus (FR-04):** leftover minutes × `restBonusEnergyPerHour`, applied when the turn ends.
- **Food (§4 of the requirements):** Phase 1 ships two eat actions (a Burger Bot meal and a FreshMart ready meal).
  Stored groceries and the fridge come with items in Phase 2.
- **No-softlock floor (FR-14):** Phase 1 has no income yet, so the guarantee is "there is always a legal action"
  (`endWeek`). Phase 2 adds the money-earning half and its property test.

## 11. End-of-week pipeline

The order is fixed by FR-05 and lives in one file, `pipeline/order.ts`. Phase 1 builds the whole mechanism with stub
steps, so later phases only fill steps in.

| # | Step | Scope | Phase 1 | Filled in |
|---|---|---|---|---|
| P1 | Food check | player | **Real**: hunger penalty, reset meal count | — |
| P2 | Bills, rent, subscriptions | player | stub | 2 |
| P3 | Interest and debt payments | player | stub | 2 |
| P4 | Job and AI-disruption checks | player | stub | 2 |
| P5 | Stat decay and recovery | player | **Real**: basic weekly Energy recovery and drift | 2, 9 (relationships) |
| P6 | Weekend event | player | stub (can pause) | 3 |
| P7 | Quest progress | player | stub | 3 |
| R1 | Market move | round | stub | 2 |
| R2 | News | round | stub | 3 |
| R3 | Goal check (may end the game, FR-11/12) | round | week limit only | 2 |
| R4 | Next-week teasers | round | stub | 3 |
| R5 | Roll over: `week + 1`, reset time and meals, clear RNG streams, append `history` | round | **Real** | — |

```ts
interface PipelineStep<Ctx> {
  id: string
  run(ctx: Ctx): { done: true } | { pause: Decision }
  resolve?(ctx: Ctx, decision: Decision, optionId: string): void
}
```

- **Pausing.** A step that needs a choice (weekend events, later partner ultimatums) returns `{ pause: decision }`. The
  engine stores it in `state.pending`, keeps the step index in `phase`, and returns to the caller. While a decision is
  pending, the only legal action is `decide`, which calls the step's `resolve` and continues the pipeline. For an AI
  player, the AI policy resolves the decision on the spot.
- Phase 1 tests the pause mechanism with a test-only step, so Phase 3 doesn't discover it is broken.
- A snapshot test pins the step order, so reordering FR-05 is a deliberate, reviewed change.

## 12. Domain events

The engine reports what happened as events. The UI turns them into presentation (tech-stack §2). The engine never
reads events back, and they are not saved (a replay regenerates them).

```ts
type DomainEvent =
  | { type: 'turnStarted'; player: PlayerId; week: number }
  | { type: 'travelled'; player: PlayerId; from: LocationId; to: LocationId; minutes: Minutes; mode: TransportModeId }
  | { type: 'actionPerformed'; player: PlayerId; actionId: ActionDefId; minutes: Minutes; money: Cents }
  | { type: 'statChanged'; player: PlayerId; stat: StatId; from: number; to: number; cause: Cause }
  | { type: 'restBonus'; player: PlayerId; minutes: Minutes; energy: number }
  | { type: 'mealSkipped'; player: PlayerId }
  | { type: 'turnEnded'; player: PlayerId; reason: 'endWeek' | 'outOfTime' | 'exhausted' }
  | { type: 'decisionRequired'; decision: Decision }
  | { type: 'roundEnded'; week: number }
  | { type: 'gameOver'; result: GameResult }
```

- Events are in the order things happened, with enough data to animate (`from`/`to`, not just a delta).
- `cause` (`{ kind: 'action', id }`, `{ kind: 'step', id }`, `{ kind: 'modifier', id }`) lets the UI say *why* a stat
  moved, and later feeds the run summary.
- Data the run summary needs after the game (net worth per week, best and worst week) lives in `state.history`, not in
  events, because events aren't saved.

## 13. Content

Phase 1 content files in `packages/content`:

| File | Holds |
|---|---|
| `balance.json` | Time budget, stat ranges and starting values, rest bonus rate, hunger penalty, stat-threshold modifiers, weekly decay |
| `board.json` | Ring order, segment distances |
| `locations.json` | Id, name key, ring position, owner placeholder |
| `actions.json` | Action definitions (§8.2) |
| `transport.json` | Modes, speeds, costs, requirements |

- **Validation at build time.** Zod schemas in `content/src/schemas.ts`. The content build validates every file, runs
  cross-reference checks (every action's location exists; the ring lists every location exactly once; every
  modifier target is known), and emits typed `dist/content.json` plus a **content hash**. Invalid content fails CI
  (FR-74, CI-01).
- **The engine never imports content files.** It receives a `Content` object in `createEngine`, so tests use small
  fixture content and the sim can run balance variants side by side.
- **Copy is not content.** Content holds string keys (`labelKey`, `nameKey`). English text lives in
  `content/locales/en.json`, ready for `i18next` in Phase 4 (NFR-06).

## 14. Saves and replay

```ts
interface SaveFile {
  format: 'fastlane-save'
  saveVersion: number
  engineVersion: string
  contentHash: string
  setup: GameSetup
  log: Action[]             // human actions only, in order
  snapshot: GameState       // state after the last action
  snapshotHash: string
}
```

- **Loading uses the snapshot.** Validate with the Zod save schema, run migrations (`migrations[n]` turns version `n`
  into `n + 1`, each with a fixture test), and continue from the snapshot.
- **Replaying uses the log**, and only when `engineVersion` and `contentHash` match. Replays are for tests, bug reports
  (Sentry gets `seed + log`) and Daily Run verification. A migration can fix a snapshot, but it can't make an old log
  replay under new rules, so after an update the log is diagnostic only.
- **Daily Run (Phase 7)** has to replay on the server with exactly the engine and content the client used. That means
  pinning each day's run to a version, or keeping recent versions deployable. Not needed for Phase 1, but it's why the
  versions are in the save from the start.
- **Hash:** canonical JSON (sorted keys) → 64-bit FNV-1a as hex. It detects divergence; it isn't a security feature
  (the server re-runs the log rather than trusting a hash).
- The save schema and migrations are a separate entry point (`@fastlane/engine/save`), so the client can lazy-load
  Zod with them.

## 15. Testing

| Kind | What |
|---|---|
| Unit | Each handler's `plan` and `apply`, travel costs, clamping, rest bonus, food check, pipeline order snapshot, pause/resume |
| Property (fast-check) | For any seed and any sequence of legal actions: stats stay in range; `timeLeft` and cash never go negative; `replay(seed, log)` gives the same hash twice; `preview` and `listActions` leave state deep-equal (RNG included); `reduce` never mutates its input; an illegal action returns `ok: false` and the same state |
| Golden | Committed fixtures of `seed + log → hash`. Catch accidental determinism changes. Updated deliberately, with an engine version bump |
| Source scan | No banned APIs in `packages/engine/src` (§5) |
| Smoke (Phase 1 exit) | 52 weeks of random legal actions for 1–4 players plus an AI, no crash, replay gives an identical hash |
| Cross-runtime (Phase 4) | Golden fixtures replayed in Playwright on Chromium and WebKit must match Node's hashes |

## 16. Phase 1 build order

Everything here is plain TypeScript and only needs the Phase 0 workspace, TypeScript config and Vitest.

1. Units, ids and branded types; `math/` helpers and their tests.
2. `rng/`: cyrb128, xoshiro128**, stream registry. Golden tests for the first values of a known seed.
3. Content schemas and a minimal fixture content set (3 locations, 4 actions, 2 transport modes).
4. `GameState`, `newGame`, clone, hash.
5. Phase machine and the advance loop, with `endWeek` only.
6. `changeStat`, ranges, threshold modifiers.
7. Board and travel.
8. Action framework (`plan`/`apply`, `listActions`, `preview`) with `rest`, `eat` and `basic`.
9. Pipeline with stubs, the real food check, decay/recovery and roll-over steps, and the pause mechanism.
10. Random AI policy.
11. Save format and the first (identity) migration.
12. Property tests, the source scan and the 52-week smoke script.
13. Real Phase 1 content: the 10 MVP locations, eat and rest actions, walk and transit.

## 17. Open questions

| # | Question | Proposed | Needed by |
|---|---|---|---|
| 1 | Travel both ways round the ring, or one way like the original? | Both ways (`bidirectional` flag keeps it a data choice) | Phase 1, step 7 |
| 2 | Do AI turns run inside the engine (proposed) or get logged as actions? | Inside the engine, so Daily Run can't be fed fake Jones moves | Phase 1, step 5 |
| 3 | Is anything finer than 15 minutes needed? | No; minutes are the unit but content uses multiples of 15 | Phase 1, step 3 |
| 4 | Can cash go into overdraft, or does every shortfall become debt? | Never negative; shortfalls go through missed-payment handling | Phase 2 |
| 5 | Energy 0: end the turn immediately, or allow actions with heavy penalties? | End the turn (forced rest), as in §4 of the requirements | Phase 1, step 6 |
| 6 | How does the server replay a Daily Run after an engine update? | Pin each day's run to an engine + content version | Phase 7 |
