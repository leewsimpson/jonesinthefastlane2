# Simulator Design — Fast Lane 2026

The simulator (`packages/sim`) has bots play thousands of complete games headless, in seconds, and then assesses
both **the results** (who wins, how long it takes, what goes wrong) and **the choices** (which decisions mattered,
which were traps, which were never worth taking). It is how balance becomes testable: every content or rules change
gets a measured before/after, and CI fails when the game drifts out of its agreed shape.

Where each part gets built is in [implementation-plan.md](implementation-plan.md). It builds on the engine's guarantees (tech-stack §2): pure `reduce`, seeded named RNG streams, side-effect-free
previews and no DOM. The simulator adds no rules of its own. It only chooses actions and observes.

## 1. Goals

| ID | Goal | Pri |
|---|---|---|
| SIM-01 | Play complete games (Sprint/Standard, 1–4 players + Jones) headless with no UI and no I/O in the hot loop. | M |
| SIM-02 | **Fast:** ≥ 50 full 52-week, 2-player games per second per CPU core with utility bots. Parallel across cores with `worker_threads`. The PR run (CI-04) finishes in under 2 minutes on a GitHub runner. | M |
| SIM-03 | **Reproducible:** every game is fully described by `{engineVersion, contentHash, seed, settings, botConfigs}`. Any game can be replayed exactly, in the sim or in the client. | M |
| SIM-04 | **Bot personas:** a roster of strategies that cover how real players behave, from optimal to careless (§3). | M |
| SIM-05 | **Outcome KPIs** with configured bands. CI fails when a KPI leaves its band (CI-04) (§5). | M |
| SIM-06 | **Decision traces:** record what the bot could have done, what it scored each option, what it picked and what happened. Kept for sampled games (§4). | M |
| SIM-07 | **Choice assessment:** measure whether choices are *meaningful*: no dead options, no no-brainers, no traps (§6). | S |
| SIM-08 | **Experiments:** compare a baseline with a content/balance override on the same seeds, and sweep a balance value across a range (§7). | S |
| SIM-09 | **Exploit search:** a lookahead bot that tries hard to break the economy (§3, `Optimizer`). Nightly only. | S |
| SIM-10 | **Reports:** a JSON result, a Markdown summary for PR comments, and a self-contained HTML report with charts (§8). | M |
| SIM-11 | **LLM analyst:** an optional, advisory pass that reads a report and sampled traces and writes designer notes. Never a CI gate (§9). | C |

## 2. Architecture

```
                   sim CLI (Node)
                        │  config: games, seeds, settings, personas, overrides
                        ▼
        ┌──────── scheduler (main thread) ─────────┐
        │  splits seed range into shards            │
        ▼                ▼                ▼         │
   worker 1          worker 2  …      worker N      │   one engine + content instance per worker
   ┌─────────────────────────────────────────┐      │
   │ for each seed:                           │      │
   │   state = newGame(seed, settings)        │      │
   │   loop: policy.choose(view, legal) ──►   │      │
   │         reduce(state, action) → events   │      │
   │   collectors.observe(state, action, ev)  │      │
   │ emit GameRecord (+ trace if sampled)     │      │
   └─────────────────────────────────────────┘      │
        │                                           │
        ▼                                           │
   aggregator ─► KPIs ─► bands check ─► report.json / summary.md / report.html
```

- **Engine API the simulator needs:** see [engine-design §3](engine-design.md#3-public-api) (`newGame`,
  `listActions`, `preview`, `reduceInPlace`, `replay`, `hash`). Bots play the human seats; AI seats are played by the
  engine (engine-design §7). `smartDefaults` (the one-tap actions from ENG-02) joins the API with the turn-pacing
  pass.
- **Policies see what a player sees.** `policy.choose` gets a player view (own stats, public world state, previews),
  not hidden state such as the RNG or upcoming event draws. Bots can't play better than a human could.
- **Collectors** are small observers (cash curve, action counts, goal progress, events seen). They run inside the
  worker and fold into compact per-game aggregates, so a 10k run never holds 10k full traces in memory.
- **No new randomness.** Bot tie-breaks and exploration use the engine's `ai` stream (or a sim-only stream derived
  from the seed), never `Math.random`. The same seed and config always produce the same games.

## 3. Bots (policies)

Every bot implements one interface:

```ts
interface Policy {
  id: string;
  choose(view: PlayerView, legal: LegalAction[], rng: Rng): Action;
}
```

Most personas are **one utility scorer with different weights**: the same scorer that powers Jones (FR-80) lives in
`packages/engine`, and Jones's difficulty is how often the bot picks its top-scored move (FR-83). A persona is data:

```jsonc
// packages/content/sim/personas.json
{ "id": "careerist", "goalWeights": { "wealth": 0.2, "wellbeing": 0.1, "skills": 0.3, "career": 0.4 },
  "riskAppetite": 0.3, "horizonWeeks": 8, "bestMoveRate": 0.95, "notes": "Grinds the job ladder" }
```

| Persona | Plays like | Why it exists |
|---|---|---|
| `random` | A uniformly random legal action | Crash and softlock fuzzing, the floor for every KPI |
| `idle` | Ends the week at once, every week | Proves the no-softlock floor (FR-14): Parents' Basement and gig work keep it alive |
| `balanced` | Weights all four goals evenly | The reference "sensible player"; most bands are set against it |
| `careerist` / `scholar` / `saver` / `socialite` | Leans on one goal | Each goal must be winnable, but not alone |
| `gigger` | Only does GigHub work | Gig work must be a floor, not a winning strategy |
| `gambler` | High risk appetite: crypto, YOLO choices | Risky play should be swingy, not dominant |
| `spender` | Buys whatever raises Happiness now | Shows that consumerism and subscription creep hurt (the satire must land) |
| `casual` | `balanced` with `bestMoveRate` 0.6 and a short horizon | A careless human. Should still finish a Chill game |
| `jones-<difficulty>` | Jones's own config per difficulty preset | Sets the difficulty curve: humans vs Jones |
| `optimizer` | Lookahead: for each candidate, run *k* short rollouts from a cloned state and pick the best average | Exploit search (SIM-09). Slow, so nightly only |
| `llm-playtester` | An LLM picks actions from a text view and explains why | Optional, a handful of games. A "does this make sense to a newcomer?" probe, not a balance source |

**Granularity.** A week has many micro-actions (travel, then act). Bots choose from legal actions plus the engine's
smart defaults ("Work full shift at X" includes the travel), so the bots play at the same granularity a human
tapping smart defaults would. That keeps decisions per game in the low hundreds.

## 4. Records and traces

**GameRecord** (every game, small):

```ts
{ seed, settings, personas: string[], winner, endWeek, reason: 'win' | 'timeout',
  finalScores, goalProgressByWeek: number[][], netWorthByWeek: number[][],
  evictions, collections, burnouts, layoffs, actionCounts, contentUsed: { jobs, items, events, choices } }
```

**DecisionTrace** (sampled games: `--trace-rate`, default 1%, plus every game that trips an anomaly):

```ts
{ week, player, view: compactView, options: [{ action, preview, score }], chosen, events: DomainEvent[] }
```

Traces are written as gzipped JSONL, one file per game, named by seed. `sim trace <seed>` replays the game and
prints a readable week-by-week log ("W12 careerist: Work full shift @ Burger Bot (+$168, −22 Energy) … Weekend
event: Landlord sells building → chose *Negotiate* (+$0, −5 Happiness)"). The client gets a debug route that loads
`{seed, settings, actionLog}` and replays it on the board, so a strange game can be *watched*.

**Anomalies** flagged per game and always traced: crash or invariant failure, a stat out of range, money not
conserved, a game that hits the week limit with a score < 10%, an eviction loop (≥ 3 evictions), a weekly cash
swing > 5× median, and the same action chosen > 80% of the time.

## 5. Outcome KPIs

KPIs and their bands live in content (`packages/content/sim/kpi-bands.json`) so they are tuned like any balance
value (NFR-15). Each band names the persona(s) and settings it applies to. Starting set (the values are placeholders
until the first Phase 3 runs):

| KPI | Measures | Example band |
|---|---|---|
| Win rate by persona | Who can win, by preset | `balanced` on Standard: 55–80% within 52 weeks |
| Jones win rate vs `balanced` | The difficulty curve | Chill 10–25%, Standard 35–55%, Hustle Culture 55–75% |
| Game length | Weeks to win | `balanced`, Standard: median 30–45 |
| Dominance | Best persona's win rate − second best | ≤ 15 points. More means one strategy solves the game |
| Single-goal personas | Each one-goal persona | Wins < 20%. Balanced play must beat specialising |
| Floor | `gigger`, `idle` | Never a crash or softlock. `gigger` wins < 10% |
| Hardship | Evictions, collections, burnouts per game | `balanced`: ≥ 1 setback in 30–60% of games (pressure without misery) |
| Luck share | Variance in final score across seeds for the same persona vs variance across personas | Skill should explain more than luck |
| Seat fairness | Win rate by turn order | Within ±3 points (FR-05a, FR-11) |
| Early hook | Week of first paycheck, week of first goal milestone | First paycheck in week 1 for `balanced` (ENG-20) |
| Content reach | Share of jobs, items, events and event choices used at least once across the run | Unused content is listed in the report |
| Throughput | Games per second | Regression > 20% fails |

Bands have a **hard** range (CI fails) and an optional **soft** range (a warning in the PR comment).

## 6. Choice assessment

Outcome KPIs say *whether* the game is balanced. Choice assessment says *why*, by measuring decisions.

1. **Usage and outcome correlation.** For each action, job, item and event choice: how often it is picked, by which
   personas, and the win rate and final score of games that picked it vs comparable games that didn't (same persona,
   same week bucket).
2. **Counterfactual value.** For sampled decision points (weekend event choices by default, plus a random sample of
   other decisions), clone the state, force each alternative, and play out *n* rollouts with the same persona.
   Rollouts share seeds across alternatives (common random numbers), so the difference comes from the choice and not
   the dice. This gives each option an expected value and spread, and gives the bot's actual pick a **regret**
   (best option's value − chosen option's value).
3. **Classify each choice point** from those values:

| Class | Signal | Usually means |
|---|---|---|
| **Meaningful** | Best option differs by persona or situation, and values are close enough to matter | Healthy. This is the target |
| **No-brainer** | One option is best in > 90% of situations for every persona | Rebalance it, or make it automatic |
| **Trap** | Picked often (it looks good in preview) but has high regret | The preview misleads, or the cost is hidden. Check FR-03 |
| **Flat** | All options within noise of each other | The choice doesn't matter. Make it matter, or cut it |
| **Dead** | Never picked, or only by `random` | Too weak, too gated or never offered. Check its conditions |

4. **Bot quality check.** High average regret for `balanced` means the bot, not the game, is weak. Fix the scorer
   before trusting the balance numbers.

Costs are bounded by `--assess-rate` and `--rollouts`, and the full assessment runs nightly. PRs run usage and
correlation only, unless the PR touches events or balance values.

## 7. Experiments

- **Override files.** A JSON patch over content (`--override overrides/rent-plus-10.json`) changes any balance
  value, job, item or event weight without editing content.
- **A/B compare.** `sim compare --base <ref|override> --head <ref|override>` runs both on the **same seeds** and reports
  paired differences with confidence intervals. In CI the base is the PR's merge base, so every PR comment shows
  "this change moved win rate by +4.1 ± 1.2 points".
- **Sweep.** `sim sweep --param content.balance.aiDisruption.baseRate --from 0.01 --to 0.05 --steps 9` charts KPIs
  against the value and shows where each band holds. This is how starting values in game-requirements get tuned.
- **Scenario starts.** Start from a fixed save (e.g. "week 20, evicted, $-2k") to test recovery arcs (FR-14) without
  playing 20 weeks to get there.

## 8. CLI, CI and reports

```
pnpm sim run      --games 2000 --personas balanced,careerist,jones-standard --preset standard --weeks 52 --seed 1
pnpm sim compare  --base origin/main --head HEAD --games 2000
pnpm sim sweep    --param <path> --from <a> --to <b> --steps <n>
pnpm sim assess   --games 500 --rollouts 32           # choice assessment (§6)
pnpm sim trace    <seed> [--config run.json]          # readable replay of one game
pnpm sim explain  <report.json>                       # optional LLM analyst (§9)
```

Outputs go to `sim-out/<run-id>/`: `report.json` (machine-readable, the source for everything else),
`summary.md` (the PR comment), `report.html` (one self-contained file with charts: net worth fan charts, win-rate
matrix, game-length histogram, choice classification table, unused content list) and `traces/`.

| Where | What runs | Gate |
|---|---|---|
| Unit tests | Tiny runs (20 games) as Vitest tests: no crash, determinism, money conservation | Fails the test suite |
| PR (`ci.yml`, CI-04) | `run` across core personas + `compare` against the merge base | Hard bands fail; soft bands and deltas are posted as a sticky comment. Report uploaded as an artifact |
| Nightly (`nightly.yml`, OPS-04) | Full game count, all personas, `assess`, `optimizer` exploit search | Opens or updates a GitHub issue when anything is out of band or a new exploit is found |
| Local | Any command; `report.html` opens in a browser | — |

## 9. LLM analyst (optional)

`sim explain` sends `report.json`, the anomaly list and a few sampled traces to an LLM (the local model or the Claude
API, configurable) and asks for designer notes: the biggest balance risks, which choices are traps and why, and
which values to change, phrased as override files that can be fed straight into `sim compare`. It is advisory only:
its suggestions are verified by running them, never trusted directly. It never runs in the PR gate, so CI stays
deterministic and free.

`llm-playtester` (§3) is the slow sibling: an LLM plays a few games from a text rendering of the player view and
narrates its reasoning. It is a cheap stand-in for "would a newcomer understand this?" between human playtests.

## 10. Risks

| Risk | Mitigation |
|---|---|
| Bots are worse players than people, so balance is tuned for bots | Regret checks on the bots (§6.4); bands re-anchored against playtest telemetry in Phase 6 |
| Bands are tuned to whatever the sim says, so the game gets "balanced" but dull | Bands describe the intended feel (pressure without misery, no dominant strategy) and are reviewed with playtest notes, not just auto-fitted |
| Rollout cost explodes in `assess` / `optimizer` | Sample rates and rollout counts are flags; both run nightly |
| Bots peek at hidden state | Policies get a `PlayerView` only; a test proves the view has no RNG or future draws |
