# Engine Design — Fast Lane 2026

Design for `packages/engine`, the pure, deterministic rules engine. It covers everything Phase 1 of the
[implementation plan](implementation-plan.md) builds, and fixes the shapes that later phases plug into (jobs, events,
Jones, Daily Run verification), so those phases add code without reworking the core.

**Status:** Phases 1–3 implemented (`ENGINE_VERSION` 0.4.0, state schema 3). Decisions and open questions are
listed in §17.

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
packages/engine/src/
├─ index.ts               # createEngine() and public types only
├─ version.ts             # ENGINE_VERSION, state schema version
├─ types/                 # GameState, Action, Plan, Preview, DomainEvent
├─ core/
│  ├─ reduce.ts           # createEngine: dispatch, validation, the advance loop (§7)
│  ├─ phase.ts            # turn / end-of-turn / end-of-round state machine
│  ├─ context.ts          # what plans, handlers and steps may see (§8, §11)
│  ├─ clone.ts            # fast clone for plain-JSON state
│  └─ hash.ts             # canonical JSON + state hash
├─ math/                  # fixed-point helpers: basis points, ppm, clamping
├─ rng/                   # xoshiro128**, cyrb128 seeding, stream keys
├─ stats/                 # changeStat(), threshold modifiers
├─ board/                 # loop distances, travel cost
├─ actions/               # previews, listActions, one handler per kind
├─ pipeline/              # step order and the real steps
├─ hooks/                 # condition matching and news effects for events, quests and the ticker
├─ ai/                    # AI policies: random legal, and the utility scorer with personas (§7)
├─ money/                 # the ledger: the one write path for money (§10.1)
├─ economy/               # prices and wages through the world's indices (FR-50)
├─ jobs/                  # qualification, pay, AI exposure, ladders
├─ goals/                 # goal values, progress, score, win and tiebreak (§3, FR-11, FR-12)
└─ save/                  # save format, migrations (separate entry point, §14)
```

Tests sit next to the code they cover (`*.test.ts`), with fixture content in `src/__fixtures__/`.

`packages/engine` depends on `packages/content` for **types only** (`import type`), plus the Zod-free constants in
`@fastlane/content/keys`. Zod runs in `content` and, from Phase 4, in `engine/save` at load time (§14), never in the
engine's main entry point, so it stays out of the hot path and the initial bundle.

## 3. Public API

```ts
export function createEngine(content: GameContent, options?: { pipeline?: Pipeline; ai?: AiPolicy }): Engine

export interface Engine {
  readonly content: GameContent
  readonly contentHash: string                           // pinned in saves (§14)
  newGame(setup: GameSetup): { state: GameState; events: DomainEvent[] }
  reduce(state: GameState, action: Action): ReduceResult
  reduceInPlace(state: GameState, action: Action): ReduceResult   // simulator only
  listActions(state: GameState): Preview[]               // for the active player
  preview(state: GameState, action: Action): Preview     // never changes state or RNG
  replay(setup: GameSetup, log: readonly Action[]): GameState      // throws ReplayError on an illegal action
  hash(state: GameState): string
}

export type ReduceResult =
  | { ok: true; state: GameState; events: DomainEvent[] }
  | { ok: false; error: RuleError }                      // input state is untouched
```

- **Content is bound once** in `createEngine`, so every call site doesn't pass it around, and tests can build an engine
  from a small fixture content set. `options` swaps the pipeline or AI policy for tests and the sim. The default
  policy is `rivalPolicy`: each AI seat plays the utility scorer with its own persona from `content.ai.rivals` (§7).
- **`newGame` returns events too.** If AI players come before the first human, the engine plays their turns straight
  away (§7), and the UI needs those events.
- **Rule violations are values, bugs are exceptions.** Trying to travel without enough time returns
  `{ ok: false, error: { code: 'NOT_ENOUGH_TIME' } }`. A broken invariant (a stat out of range, an unknown id in
  state, cash going negative) throws, because it means the engine is wrong, not the player.
- **Immutability at the boundary.** `reduce` validates against the input, then clones it with a hand-written
  plain-JSON clone and changes the copy. Callers can rely on the input never changing (a property test deep-freezes
  it). The sim uses `reduceInPlace`, which skips the clone. Immer was considered and rejected: it costs bundle size and
  adds proxy overhead to millions of sim actions.
- **Performance budget:** a 52-week, 2-player game (1 human-scripted + 1 AI) runs in under 50 ms in Node. That keeps
  2k CI games under 2 minutes on one core. `pnpm sim` prints the time per game.

## 4. Game state

State is **plain JSON**: no classes, `Map`, `Set`, `undefined` values, functions or cycles. That makes it trivially
cloneable, hashable, storable in IndexedDB and sendable to the Worker.

```ts
interface GameState {
  schemaVersion: number
  seed: string                      // run seed (Daily Run: from GET /daily)
  config: GameConfig                // week limit, turnLengthWeeks, difficulty and goal targets (FR-10)
  week: number                      // 1-based calendar week, shared by all players (FR-05a)
  phase: Phase
  players: PlayerState[]            // in turn order
  world: WorldState                 // shared: price and wage index, market regime, job openings; round steps only
  rng: Record<string, RngState>     // live stream states for the current week (§6)
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
  id: PlayerId                      // p1, p2, …
  name: string
  controller: 'human' | 'ai'
  location: LocationId
  timeLeft: number                  // minutes
  stats: Stats                      // §10; cash in cents, wardrobe as a tier index
  mealsThisWeek: number
  items: ItemId[]
  // Phase 2: job, experience per ladder, gig ban, enrolment, credentials, study minutes per track, housing and
  // lease, holdings (savings and market assets), debts, subscriptions, stored meals.
  // Phase 3: AI persona, burnout flag, next week's time adjustment, event and quest cooldowns, active quests.
  // See types/state.ts.
}
```

Rules:

- **Players are an array in turn order**, not a `Record` plus a separate `turnOrder`. There are at most a handful,
  lookups by id are cheap, and one list can't disagree with itself.
- **Ids are strings.** Content ids are kebab-case (`burger-bot`, `burger-combo`). Instance ids (a decision, later an
  item you bought or a loan) come from `nextId` (`decision-3`), never from time or randomness. Ids that look like
  integers are not allowed as `Record` keys, because JS orders integer-like keys differently from other keys.
- **`world` is read-only during a player's turn.** Handlers and per-player steps get it as `Readonly<WorldState>` and
  no access to the rest of the state, so a player step can't change prices for players who go later (FR-05a). Only
  per-round steps get the writable state. Phase 1's world is empty.
- **`turnLengthWeeks`** (default 1) is in `config` from day one, so Long Life (FR-91) is a balance change later, not a
  state migration. Rent, subscriptions, interest, minimum payments and the disruption chance multiply by it.

## 5. Numbers and determinism

Basic IEEE-754 arithmetic (`+ − × ÷`, `Math.sqrt`) gives the same result in every JS engine. Functions like
`Math.pow`, `Math.exp` and `Math.sin` don't: the spec lets each engine approximate them. V8 (Chrome, Node, Workers)
and JavaScriptCore (Safari, every iPhone browser) can differ in the last bit, which is enough to break Daily Run
verification for every iPhone player. So the engine uses integers and fixed-point values only.

| Quantity | Unit in state and content | Notes |
|---|---|---|
| Money | integer **cents** | 2^53 cents is far beyond any reachable balance |
| Time | integer **minutes** | Content uses multiples of 15 (schema-enforced). UI shows hours |
| Stats | integers within their range | §10 |
| Probabilities, modifiers | integer **basis points** (10 000 = 100% or ×1) | `chance(250)` = 2.5% |
| Weekly interest rates | integer **parts per million** | Annual → weekly conversion happens in the content build, not at runtime |

- One rounding helper: `applyBp(x, bp) = Math.round(x * bp / 10_000)`. All percentage maths goes through it (and its
  ppm twin), so rounding behaviour lives in one place.
- **Units are in the names**, not in branded types: `timeLeft`, `minutes`, `cost`/`money` (cents). Branding was
  dropped because cash lives in the `stats` record with the other stats, and content types come from Zod, so brands
  would mean casts at every boundary for little protection. `changeStat` throws on a non-integer delta, which catches
  most unit slips.

**Banned in `packages/engine/src`** (checked by `purity.test.ts`, since Biome can't ban individual `Math` methods):

| Banned | Why |
|---|---|
| `Math.random`, `Date`, `performance`, `crypto` | Non-deterministic |
| `Math.pow/exp/log*/sin/cos/tan/a*/cbrt/hypot/expm1/fround`, `**` | Results can differ between JS engines |
| `localeCompare`, `Intl`, `toLocale*` | Depend on the runtime's locale data |
| `async`, `await`, `Promise`, timers | The engine is synchronous |
| DOM and host globals, Node built-ins, runtime imports of `@fastlane/content` | Must run in the browser, Node and Workers without pulling in Zod |

Allowed: `Math.floor/ceil/round/trunc/min/max/abs/sign/sqrt/imul`. `Array.prototype.sort` is fine (stable since
ES2019), but comparators must be total, with an id tie-break.

## 6. Random numbers

**Generator:** xoshiro128** (4 × uint32 state, ~20 lines, written in-repo rather than taken as a dependency, so the
state format is ours and can't change in a library upgrade). Seeds come from hashing a string key with cyrb128, which
only uses `Math.imul` and bit operations, straight into the four state words.

**Streams are keyed by name, scope and week:**

```
streamKey = `${name}:${scope}:${week}`        e.g. "world::12", "events:p1:12", "ai:p2:12"
streamSeed = cyrb128(`${runSeed}|${streamKey}`)
```

| Stream | Scope | Used for | Phase |
|---|---|---|---|
| `world` | round | Inflation, market moves, news, job openings. Week 0 seeds the starting world | 2–3 |
| `action` | player | Random outcomes of the player's own actions (ranged effects, gig pay and deactivation, thrift finds, exam results) | 1 |
| `job` | player | AI-disruption rolls (FR-42) | 2 |
| `bills` | player | Rent hikes at lease renewal (FR-51) | 2 |
| `events` | player | Weekend event draws and outcomes | 3 |
| `quests` | player | Issuing micro-goals (ENG-11); week 0 issues the first ones | 3 |
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
  int(min: number, max: number): number                   // inclusive; span up to 2^21 so the maths stays exact
  chance(bp: number): boolean
  pick<T>(items: readonly { weight: number; value: T }[]): T  // integer weights
}
ctx.rng('events')   // stream for the current player and week; 'world' only in per-round steps
```

There is no `float()` in the API. Probabilities are basis points and weights are integers, so content authors never
write a float that could round differently. `createRng(key)` gives code outside the game state (simulator bots) its
own generator with the same API.

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
- **AI turns run inside the engine, and the log holds only human actions** (decided, §17). The AI policy picks among
  the available options using the `ai` stream, so a replay recomputes Jones exactly. It also gets the state
  read-only, as a player would see it: the utility scorer (`ai/utility.ts`) values positions from it. This means a client can't submit
  fake Jones moves in a Daily Run. The cost: changing the AI policy changes old replays, which is fine because saves
  and Daily Runs pin the engine version (§14). A turn with more than `weekMinutes / 15 + 1` AI actions throws, so a
  buggy policy can't loop forever.
- **Jones (FR-80, FR-83).** Each AI seat has a persona (`PlayerSetup.persona`, by default the rival
  `content.ai.byDifficulty` names for the game's difficulty). Difficulty is how often it takes its top-scored move
  (`bestMoveRateBp`) and how many of the next best it picks from otherwise (`runnersUp`); the rules never bend. Event
  choices are scored the same way, with risk appetite setting where in a rolled range it expects to land.
- **Players (FR-06).** 1–4 humans plus any number of AI players. A game with no humans must have a week limit,
  because nothing else stops the advance loop (the Phase 3 AI-vs-AI sim uses this).
- **Turn end (FR-04).** The turn ends when the player sends `endWeek`, or automatically when `timeLeft` reaches 0 or
  Energy reaches 0 (forced rest, reason `exhausted`). Leftover time becomes the rest bonus.
- **Hotseat (FR-06).** Moving to another human's turn emits `turnStarted`, which the UI uses for the handoff screen.

## 8. Actions

### 8.1 Commands

```ts
type Action =
  | { type: 'travel'; to: LocationId; mode: TransportModeId }
  | { type: 'perform'; actionId: ActionDefId }
  | { type: 'endWeek' }
  | { type: 'decide'; decisionId: string; optionId: string }
```

The command set stays this small. New gameplay comes from new **action definitions** in content and new **handler
kinds** in code, not from new command types. `travel` always names its mode, so the log is explicit. `perform` takes
optional parameters: a `target` (job, course, item, housing tier, subscription, account or debt), `minutes` for
actions with `durations` (work, gigs, study), and an `amount` in cents for money actions. Unset parameters are left
out, never `undefined`, so logs stay plain JSON.

### 8.2 Definitions (content) and handlers (code)

An action definition says *where*, *which handler* and *with which numbers*:

```jsonc
{
  "id": "hang-out",
  "location": "burger-bot",
  "kind": "basic",
  "minutes": 180,
  "cost": 1800,
  "effects": { "social": { "min": 4, "max": 8 }, "happiness": 3, "energy": -3 }
}
```

An effect is a fixed integer or a `{ min, max }` range rolled on the `action` stream. An optional `outputTarget` says
which modifiers scale its gains (§8.3). Its label is the copy key `action.<id>` (§13).

A handler is the code for one `kind`, split into two halves:

```ts
interface ActionHandler {
  options?(ctx: PlanCtx, def: LocationAction): PerformParams[]                     // one per target, length, amount
  plan(ctx: PlanCtx, def: LocationAction, params: PerformParams): Plan | RuleError  // pure, no RNG
  apply(ctx: PlayerCtx, def: LocationAction, plan: Plan, params: PerformParams): void // may use ctx.rng
}

interface Plan {
  time: number                     // minutes
  money: number                    // cents paid up front
  effects: StatDelta[]             // the deterministic part, already scaled by modifiers
  modifiers: AppliedModifier[]     // e.g. { source: 'modifier.low-energy', target: 'workOutput', bp: -2000 }
  outcomes: OutcomeRange[]         // the random part, as ranges ("+4–8 Social")
  transfers: PlannedTransfer[]     // ledger moves off cash (savings, deposit, a loan, §10.1), so none hides
}

type Preview =
  | { action: Action; available: true; plan: Plan }
  | { action: Action; available: false; reason: RuleError; plan: Plan | null }   // e.g. NOT_ENOUGH_MONEY
```

- **Previews are plans.** `preview()` and `listActions()` call `plan` and return its result. `PlanCtx` has no `rng`
  member, so "previews never consume RNG" is enforced by the type checker, not just by tests.
- **Preview and outcome can't drift.** `apply` receives the same `Plan` the player saw, so the shown cost is the
  charged cost, and random outcomes roll inside the range shown.
- **Legality lives in `plan`.** `listActions` returns every action at the current location, every travel destination
  by every mode, and `endWeek`, each marked available or not with a reason, so the UI can grey actions out and say why.
  An unavailable option keeps its plan when it could be worked out ("costs $12, you have $5"). `reduce` refuses
  anything the preview marks unavailable, so the UI and the rules can't disagree.
- **Energy is an effect**, not a separate cost: travel's energy use is an `energy` effect like any other.
- **Handler kinds:** `basic` (fixed time, cost and effects from data; rest actions are `basic`), `eat`, `eat-stored`,
  `work-shift`, `gig`, `apply-job`, `enroll`, `drop-course`, `study`, `buy`, `rent-home`, `subscribe`, `unsubscribe`,
  `subscription-audit`, `deposit`, `withdraw`, `borrow` and `repay`. A handler can list its parameter `options` (one
  per job, item, duration or amount preset, plus "all of it"); `listActions` offers each one.
- **Data rules for every kind:** costs follow the price index (FR-50). For actions with `durations`, effects and cost
  are per `minutes` block and scale with the chosen length. `location: "*"` is available everywhere (GigHub).
  `requires` gates an action on an owned item or a minimum housing tier.

### 8.3 Modifiers

A modifier changes a target quantity by basis points (FR-21). Its `source` is the copy key of its cause:

```ts
interface AppliedModifier { source: string; target: ModifierTarget; bp: number }
type ModifierTarget = 'workOutput' | 'studyOutput' | 'travelTime'
```

`collectModifiers(content, player, target)` gathers them from every source in a fixed order: stat thresholds
(`balance.statModifiers`, e.g. Energy < 25 → work output −20%), then items, then subscriptions, then the AI-tools
skill (FR-42). News adds no modifiers: its effects apply where each quantity is worked out (§11). Sources are
`modifier.<id>`, `item.<id>`, `subscription.<id>` and `track.<id>`. They are summed in basis points and applied once
with `applyBp`, so stacking order never changes the result. An action's `outputTarget` says which modifiers scale its positive effects; losses are never scaled. Travel time always takes
`travelTime` modifiers.

## 9. Board and travel

The board is part of the city profile (`cities/<id>/city.json`, FR-33):

```jsonc
"board": {
  "home": "your-place",
  "locations": [{ "id": "your-place" }, { "id": "leaselord" }, …],   // in loop order
  "segments": [1, 1, …],             // distance from locations[i] to the next one, wrapping
  "transportModes": [{ "id": "transit", "minutesBase": 30, "minutesPerStep": 30, "costBase": 300, … }]
}
```

- Players can travel either way round the loop, and distance is always the shorter way (decided, §17).
- Travel time = `minutesBase + distance × minutesPerStep`, then travel-time modifiers. Money =
  `costBase + distance × costPerStep`. Energy = `distance × energyPerStep`.
- Transport modes are city data, each optionally needing an item (`requiresItem: "e-scooter"`). The content check
  requires at least one mode with no item.
- Travel is illegal if the player can't afford its time or money, or is already there. You can't start a trip you can't
  finish, and `endWeek` is always legal, so this never strands anyone.
- Everyone starts each week at `home`.
- GigHub isn't a loop location. Its actions have `location: '*'` and are available everywhere (FR-44).

## 10. Stats

| Stat | Phase 1 storage | Range | Notes |
|---|---|---|---|
| Cash | `stats.cash`, cents | ≥ 0 | Never negative (below) |
| Time | `timeLeft`, minutes | 0 – budget | Budget is `balance.weekMinutes`; reset each week |
| Energy | int | 0–100 | 0 ends the turn (forced rest). The burnout event card comes in Phase 3 |
| Health, Happiness, Social | int | 0–100 | |
| Credit score | int | 300–850 | Moves with debt payments, missed rent, collections and eviction |
| Hunger | `mealsThisWeek` count | ≥ 0 | 0 at the food check → penalty |
| Wardrobe | `stats.wardrobe`, tier index | 0 – last tier | Tiers named in `balance.wardrobeTiers`; checked by jobs in Phase 2 |

Ranges, starting values and every number below come from `balance.json`.

- **One write path.** All stat changes except cash go through `changeStat(ctx, player, stat, delta, cause)`. It clamps
  to the range, emits `statChanged` with the real `from` and `to`, and returns the *applied* delta (which may be
  smaller than requested). Code never writes `player.stats.x = …` directly, and the range property test (§15) catches
  any slip. Cash goes through the ledger (§10.1); `changeStat` throws if asked to move it.
- **Cash never goes negative.** Actions you can't afford are unavailable. End-of-week charges cash can't cover become
  debt: unpaid rent becomes arrears, missed minimum payments add a late fee, a debt missed `collectionsAfter` weeks in
  a row goes to collections, and rent missed `evictAfterMissed` weeks in a row evicts to the free first housing tier
  (FR-14). Unpaid subscriptions are cancelled instead. Clamping cash at 0 would silently create money, so a change
  that would make it negative throws.
- **Rest bonus (FR-04):** `floor(leftover minutes × restBonusEnergyPerHour / 60)`, applied when the turn ends.
- **Food (§4 of the requirements):** `eat` actions count meals. Stored groceries and the fridge come with items in
  Phase 2.
- **No-softlock floor (FR-14):** there is always a legal action (`endWeek`), GigHub works anywhere, and the content
  check requires an entry job that needs nothing and is always open. A property test makes a reachable state broke,
  jobless and banned from GigHub, and still finds wages or gig pay within this week or the next.

### 10.1 Money ledger

Every change to a player's money is a `transfer(from, to, amount, reason)` between two **places**: `cash`, `deposit`
(held by LeaseLord), `hold:<id>` (savings and each market asset) and `debt:<kind>` (card, student, arrears), or
`outside`, the rest of the world. Each transfer emits `moneyMoved`; one touching cash also emits `statChanged`.

- An asset place giving money goes down; a debt place "giving" money means more is owed. So borrowing
  (`debt:card` → `cash`) and repaying leave net worth unchanged, and only flows to or from `outside` change it.
- Reasons are named. External: `wage`, `gig`, `income`, `interest`, `market`, `spend`, `travel`, `rent`,
  `subscription`, `tuition`, `fee`. Internal: `save`, `withdraw`, `borrow`, `repay`, `lease-deposit`.
- **Money conservation** (the definition agreed in Phase 2): replaying the `moneyMoved` events over the books before an
  action gives exactly the books after it, for every place; every flow has a reason of the right kind; and financial
  net worth changes by exactly the external flows. A property test checks this for random legal play on fixture and
  shipped content. Items are outside the ledger: buying one is `spend`, and goals count it at resale value.

## 11. End-of-week pipeline

The order is fixed by FR-05 and lives in one file, `pipeline/order.ts`. Phase 1 builds the whole mechanism with stub
steps, so later phases only fill steps in.

| # | Step | Scope | Phase 1 | Filled in |
|---|---|---|---|---|
| P1 | Food check | player | **Real**: hunger penalty, reset meal count | — |
| P2 | Bills, rent, subscriptions | player | stub | **2**: rent, renewal hikes, arrears, eviction, subscriptions |
| P3 | Interest and debt payments | player | stub | **2**: savings and debt interest, payments due, collections |
| P4 | Job and AI-disruption checks | player | stub | **2**: disruption roll, layoff warning, rating, promotion |
| P5 | Stat decay and recovery | player | **Real**: basic weekly Energy recovery and drift | **2**: home, item and subscription buffs; 9 (relationships) |
| P6 | Weekend event | player | stub (can pause) | **3**: deck draw, burnout cards, choices that pause |
| P7 | Quest progress | player | stub | **3**: rewards, failures, new quests |
| R1 | Market move | round | stub | **2**: inflation, regimes, returns, crashes, job openings |
| R2 | News | round | stub | **3**: running stories count down; a new one may break |
| R3 | Goal check (may end the game, FR-11/12) | round | week limit only | **2**: win check, overshoot tiebreak, scores. **3**: score ties by overshoot, final near misses |
| R4 | Rival feed | round | — | **3**: standings, overtakes, near misses, Jones's posts |
| R5 | Next-week teasers | round | stub | **3** |
| R6 | Roll over: `week + 1`, reset time (plus event adjustments) and location, clear RNG streams | engine | **Real** | — |

```ts
interface PipelineStep<Ctx> {
  id: string
  run(ctx: Ctx): { done: true } | { pause: Decision }
  resolve?(ctx: Ctx, decision: Decision, optionId: string): void
}
```

- **Roll over is built in**, not a pipeline step, so a test pipeline can't forget it.
- **History** gets one `WeekRecord` per player when their end-of-turn steps finish, so the final week is recorded even
  when R3 ends the game.
- **Weekend events (FR-70).** With `balance.events.chanceBp` a card is drawn from those whose condition holds and
  whose cooldown has passed; a turn that ended at 0 Energy draws a burnout card instead. Choices the player can't
  afford or doesn't qualify for are left out. One choice left applies at once; more pause. Each option's plan is
  stored on the decision (`Decision.plans`), so previewing a `decide` shows it (FR-03).
- **News (FR-72)** lives in `world.news`. `hooks/news.ts` sums each effect over the running stories, and it is added
  where the quantity is worked out: the disruption roll (rate and ladder exposure), gig pay, inflation, renewal
  hikes, savings and card rates, job openings; a story can switch the market regime. Exposure news moves the
  disruption roll only, not the Career goal's stability, so goal values stay a function of the player alone.
- **Rival feed and teasers** are read off `state.history` and pending state, so they are pure functions of the state.
  `WeekRecord` carries what they compare week to week (score, job and level, home, credentials, items, quests done).
- **Pausing.** A per-player step that needs a choice (weekend events, later partner ultimatums) returns
  `{ pause: decision }`. The engine stores it in `state.pending`, keeps the step index in `phase`, emits
  `decisionRequired` and returns to the caller. While a decision is pending, the only legal action is `decide`, which
  calls the step's `resolve` and continues the pipeline. For an AI player, the AI policy resolves the decision on the
  spot. Round steps can't pause: there is no player to ask.
- A test-only step exercises the pause mechanism in Phase 1, so Phase 3 doesn't discover it is broken.
- A snapshot test pins the step order, so reordering FR-05 is a deliberate, reviewed change.

## 12. Domain events

The engine reports what happened as events. The UI turns them into presentation (tech-stack §2). The engine never
reads events back, and they are not saved (a replay regenerates them).

```ts
type DomainEvent =
  | { type: 'turnStarted'; player: PlayerId; week: number }
  | { type: 'travelled'; player: PlayerId; from: LocationId; to: LocationId; mode: TransportModeId; minutes: number; money: number }
  | { type: 'actionPerformed'; player: PlayerId; actionId: ActionDefId; minutes: number; money: number }
  | { type: 'statChanged'; player: PlayerId; stat: StatKey; from: number; to: number; cause: Cause }
  | { type: 'restBonus'; player: PlayerId; minutes: number; energy: number }
  | { type: 'mealSkipped'; player: PlayerId }
  | { type: 'turnEnded'; player: PlayerId; reason: 'endWeek' | 'outOfTime' | 'exhausted' }
  | { type: 'decisionRequired'; decision: Decision }
  | { type: 'decisionMade'; decision: Decision; optionId: string }
  | { type: 'roundEnded'; week: number }
  | { type: 'gameOver'; result: GameResult }
  // Phase 2: moneyMoved (§10.1), jobChanged, gigDeactivated, enrolled, credentialEarned, itemBought, subscribed,
  // unsubscribed, subscriptionAudit, moved, leaseRenewed, rentMissed, evicted, paymentMissed, collections,
  // marketMoved.
  // Phase 3: courseDropped, weekendEvent, eventResolved, newsStarted, newsEnded, questIssued, questCompleted,
  // questFailed, teaser, rivalPost, standings, overtaken, nearMiss. See types/events.ts.
```

- Events are in the order things happened, with enough data to animate (`from`/`to`, not just a delta). An action's
  `travelled` or `actionPerformed` comes first, then its `statChanged` events.
- `cause` (`{ kind: 'action', id }`, `{ kind: 'travel', mode }`, `{ kind: 'restBonus' }`, `{ kind: 'step', id }`,
  `{ kind: 'event', id }`, `{ kind: 'quest', id }`) lets
  the UI say *why* a stat moved, and later feeds the run summary.
- Data the run summary needs after the game (net worth per week, best and worst week) lives in `state.history`, not in
  events, because events aren't saved.

## 13. Content

Content in `packages/content`. The rule of thumb: prices, wages and rents in cents are city data; rates, odds and
rules are balance data.

| File | Holds |
|---|---|
| `data/meta.json` | Content version, default city |
| `data/balance.json` | Rules: week minutes, stat ranges and starting values, wardrobe tiers, rest bonus, stat-threshold modifiers, hunger penalty, weekly drift, job and AI-disruption rules, gig risk, skill tracks, leases, inflation, finance rates, market regimes, goal presets |
| `data/cities/<id>/` | The city profile (FR-33), one folder: `city.json` (board, transport modes, action definitions, gig pay), `jobs.json`, `courses.json`, `housing.json`, `items.json`, `subscriptions.json`, merged into one `City` |
| `data/events.json`, `data/news.json`, `data/quests.json` | Weekend event deck, news stories and micro-goals: conditions, weights, effects (FR-74) |
| `data/ai.json` | Utility scorer tuning and Jones's personas by difficulty (FR-80, FR-83) |
| `locales/en.json` | English copy |
| `sim/personas.json`, `sim/kpi-bands.json` | Simulator bot personas and KPI bands (`@fastlane/content/sim`, never in the game bundle) |

- **Validation.** Zod schemas in `content/src/schemas.ts`. `pnpm content:validate` (CI) and the package's own import
  both validate every file, then run cross-reference checks (unique ids; every action's location exists; one segment
  per location; home is a location; a mode with no item requirement; every copy key exists). Invalid content fails CI
  (FR-74, CI-01).
- **The engine never imports content files.** It receives a `GameContent` object in `createEngine`, so tests use small
  fixture content and the sim can run balance variants side by side. The engine hashes that object into
  `contentHash`, so the hash always matches what the engine actually runs.
- **Copy is not content.** Content holds ids only. Copy keys are derived from them (`city.<id>`, `location.<id>`,
  `transport.<id>`, `action.<id>`, `wardrobe.<tier>`, `modifier.<id>`, `decision.<stepId>.<option>`, and the
  rest that `contentStringKeys` lists), and English text lives in `locales/en.json`, ready for `i18next` in Phase 4
  (NFR-06). Weekend events use `event.<id>`, `event.<id>.text` and `event.<id>.<choice>`; teasers `teaser.<id>`;
  Jones's lines are numbered variants `feed.<moment>.<n>` (FR-84). Their `{{slot}}`s are checked against the slots
  the engine fills (`TEASERS` and `FEED_MOMENTS` in `content/src/keys.ts`).

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

- **Loading uses the snapshot.** Check the format and version, run migrations (`migrations[n]` turns version `n`
  into `n + 1`, each with a fixture test), and continue from the snapshot. The Zod save schema arrives with IndexedDB
  persistence in Phase 4; until then `loadSave` does structural checks only.
- **Replaying uses the log**, and only when `engineVersion` and `contentHash` match. `verifySave` returns `ok`, or why
  not: `incompatible` (other engine or content), `illegal` (the log breaks a rule) or `diverged` (a different state).
  Replays are for tests, bug reports (Sentry gets `seed + log`) and Daily Run verification. A migration can fix a
  snapshot, but it can't make an old log replay under new rules, so after an update the log is diagnostic only.
- **Daily Run (Phase 7)** has to replay on the server with exactly the engine and content the client used. That means
  pinning each day's run to a version, or keeping recent versions deployable. Not needed for Phase 1, but it's why the
  versions are in the save from the start.
- **Hash:** canonical JSON (sorted keys) → two cyrb53 hashes with different seeds, as hex (~106 bits). It detects
  divergence; it isn't a security feature (the server re-runs the log rather than trusting a hash).
- The save format and migrations are a separate entry point (`@fastlane/engine/save`), so the client can lazy-load
  them, and Zod with them from Phase 4.

## 15. Testing

| Kind | What |
|---|---|
| Unit | Travel costs and distances, previews and rule errors, clamping, rest bonus, food check, turn and round flow, AI turns, week limit, pause/resume, RNG streams, saves |
| Property (fast-check) | For any seed, player mix and sequence of legal actions: stats stay in range; `timeLeft` and cash never go negative; `replay(setup, log)` gives the same state; `preview` and `listActions` leave state deep-equal (RNG included); `reduce` never mutates its (deep-frozen) input; an available option is accepted and an unavailable one returns `ok: false`; each stat lands inside the previewed range; End Week is always available. Runs on fixture and shipped content; money is conserved (§10.1) and no state softlocks (§10) |
| Pipeline order | Inline snapshot of the FR-05 step order |
| Golden | `core/golden.test.ts`: seed + chooser → hash, as inline snapshots. Catch accidental determinism changes. Updated deliberately, with an engine version bump |
| Source scan | No banned APIs in `packages/engine/src` (§5) |
| Smoke (Phase 1 exit) | `pnpm sim`: 52 weeks of random legal actions, 1 human plus AI, no crash, replay gives an identical hash |
| Cross-runtime (Phase 4) | Golden fixtures replayed in Playwright on Chromium and WebKit must match Node's hashes |

## 16. Phase 1 build order

All done in Phase 1; kept as a record of the dependency order.

1. Units and ids; `math/` helpers.
2. `rng/`: cyrb128, xoshiro128**, stream keys. Pinned output for a known key.
3. Content schemas and a minimal fixture content set (5 locations, 5 actions, 3 transport modes).
4. `GameState`, `newGame`, clone, hash.
5. Phase machine and the advance loop, with `endWeek` only.
6. `changeStat`, ranges, threshold modifiers.
7. Board and travel.
8. Action framework (`plan`/`apply`, `listActions`, `preview`) with `basic` and `eat`.
9. Pipeline with stubs, the real food check, decay/recovery and roll-over, and the pause mechanism.
10. Random AI policy.
11. Save format and the migration chain (no migrations yet: there is no older version).
12. Property tests, the source scan, golden fixtures and the 52-week smoke script.
13. Real Phase 1 content: the 10 MVP locations, eat and rest actions, transport modes, English copy.

## 17. Decisions and open questions

### Decided

| Question | Decision |
|---|---|
| Travel both ways round the loop, or one way like the original? | Both ways; travel takes the shorter way round (§9) |
| Do AI turns run inside the engine, or get logged as actions? | Inside the engine. The save log holds only human actions, and replays recompute Jones's moves (§7) |
| Is anything finer than 15 minutes needed? | No. Minutes are the unit; content uses multiples of 15, enforced by the schema (§5) |
| Energy 0: end the turn immediately, or allow actions with heavy penalties? | End the turn (forced rest), as in §4 of the requirements (§7) |
| Branded unit types? | No; units are in field names (§5) |
| Separate content files for board, locations, actions and transport? | No; they are one city profile, per FR-33 (§13) |
| Content hash from the content build, or computed by the engine? | Computed by `createEngine` from the content object it runs (§13) |
| 64-bit FNV-1a for the state hash? | No; two cyrb53 hashes, faster and no 64-bit emulation (§14) |
| Can cash go into overdraft? | No. Shortfalls become arrears, then collections and eviction (§10; decided with the user in Phase 2) |
| New command types for jobs, shops and banking? | No; `perform` takes optional `target`, `minutes` and `amount` (§8.1) |
| How is money conservation defined? | A ledger with a named reason per flow; internal flows keep net worth (§10.1; agreed with the user) |
| One file for the city profile, or several? | A folder per city, one file per section, merged into one `City` (§13). Still one profile, per FR-33 |
| Does changing jobs reset the job rating? | No: a new hire keeps the old job's rating (Phase 3; the balance sim found bots re-applying to dodge being let go). Promotions start fresh |
| Who wins a week-limit tie on score? | The bigger total overshoot, as for a win (FR-11), then seat order (Phase 3) |
| Where do Jones's personas live? | Game content (`data/ai.json`), so Jones ships with the game; the sim reads them too (§13) |

### Open

| # | Question | Proposed | Needed by |
|---|---|---|---|
| 2 | How does the server replay a Daily Run after an engine update? | Pin each day's run to an engine + content version | Phase 7 |
