# Progress

Running ledger of finished phases, deferrals and deviations from [implementation-plan.md](implementation-plan.md).

## Phase 0 — Foundations — done 2026-10-05

- Exit criteria:
  - A PR shows green checks and a working preview URL within 8 minutes: PR #1, commit `bcc4139`. Pushed at
    04:42:05 UTC. The sticky preview comment was updated at 04:42 and all checks (`checks`, `audit`, `deploy`, CodeQL
    ×2) were green by 04:43:08, about 1 minute. On the first push the preview comment arrived 29 s after the PR opened.
    `https://pr-1.fastlane-e6g.pages.dev` serves the shell, and its `/config.json` points at
    `https://pr-1-fastlane-api-preview.leewsimpson.workers.dev`. That URL's `/healthz` returns
    `X-Fastlane-Version: <PR head SHA>` and CORS-allows the Pages origin. The preview job smoke-tests both.
  - Initial bundle size is reported and enforced against 300 KB gz: `pnpm size` (size-limit on
    `apps/web/dist/assets/index-*.js`) reports 68.57 kB gzipped against the 300 kB limit and writes it to the CI job
    summary. With the limit lowered to 50 kB it exits 1 ("Package size limit has exceeded by 18.57 kB").
- Deferred:
  - CI-02 (affected-only builds, **S**) → when CI time warrants it. The full pipeline takes about 1 min today.
  - CI-05 Lighthouse CI → Phase 5 (plan puts Lighthouse budgets on the preview URL there).
  - CD-09 preview cleanup (**C**) → Phase 10.
  - `main` and production deploy workflows → Phase 6 as planned. D1/KV/Worker envs for them already exist.
- Deviations:
  - Repo made **public** (user decision) so rulesets, CodeQL and secret-scanning push protection work on the free plan.
  - Worker config is `apps/api/wrangler.jsonc`, not `wrangler.toml`: it's the current wrangler default and has a JSON schema.
  - **Two environments, not three** (user decision): `preview` (PRs, and later `main` under a stable alias) and
    `production`. Staging was removed from GitHub, Cloudflare (D1/KV deleted while empty), `wrangler.jsonc` and the
    docs. CD-02 now deploys `main` to the preview env, and production promotes that build.
  - Preview and production share one Cloudflare token (user decision). This departs from OPS-01's separate tokens.
    The token is set in both GitHub environments. `production` requires a reviewer and allows only `main`/`v*`.
  - Preview has its own D1 (`fastlane-db-preview`) and KV namespace, separate from production.
  - Wrangler runs through `pnpm exec wrangler` (pinned in the lockfile) instead of `cloudflare/wrangler-action`.
    That's one less third-party action, and the version always matches local dev.
  - Fonts are self-hosted via the `@fontsource-variable/*` npm packages. Vite bundles the woff2 files into the build,
    no Google Fonts link. Renovate keeps them current.
  - Web source maps are off until Sentry upload (CD-08), so none are served publicly.
  - `CLOUDFLARE_ACCOUNT_ID` is an environment *variable*, not a secret. It isn't sensitive, and keeping it out of
    secrets keeps it out of log masking.
- Notes for later phases:
  - Cloudflare names: Pages project `fastlane` → `fastlane-e6g.pages.dev`. Workers are `fastlane-api-<env>` on
    `leewsimpson.workers.dev`. PR aliases: `pr-<n>.fastlane-e6g.pages.dev` and
    `pr-<n>-fastlane-api-preview.leewsimpson.workers.dev`.
  - Runtime config: each deploy writes `dist/config.json` (`{ environment, apiBase }`), so production can
    promote the build that passed on `main` (CD-03). The API CORS allow-list is in `apps/api/src/app.ts`. Update it when a custom domain lands.
  - Toolchain at start: Node 24 LTS, pnpm 12.9 (Corepack), TypeScript 7.0, Vite 8, Vitest 5, Biome 2.5,
    Tailwind 4.3, React 19.3. pnpm 12 needs build scripts allow-listed in `pnpm-workspace.yaml` (`allowBuilds`).
  - The `main` ruleset was removed on 2026-10-05 (user decision); current rule: ci-cd.md CI-07.
  - Engine purity is not enforced mechanically yet. That's Phase 1.

## Phase 1 — Engine core — done 2026-10-05

- Exit criteria:
  - A Node script plays 52 weeks of random legal actions with no crash, and replaying the log gives an identical
    state hash: `pnpm sim` (default 20 games, 1 random human + 1 engine-played AI, 52-week limit) reports 0 replay
    mismatches. CI runs it after the tests, and `packages/sim/src/random-play.test.ts` covers the same check.
- What exists: the engine as specified in [engine-design.md](engine-design.md), `ENGINE_VERSION` 0.2.0. The first
  implementation predated the design doc and was realigned to it the same day: integer minutes, cents and basis
  points; `reduce` returns rule errors as values; `listActions`/`preview` return plans with availability; handler
  kinds; streams keyed by name, scope and week; AI turns inside the engine with a human-only log; phase state machine
  with pausable steps; week limit; save format with engine version and content hash; copy moved to
  `locales/en.json`. engine-design §17 records where the code's approach was kept instead.
- Deviations:
  - The engine takes content through `createEngine(content)` instead of a bare `reduce(state, action)`, so content
    stays out of saves and tests can use small fixture content (`src/__fixtures__/content.ts`).
  - Location ID for UpSkill U is `upskill-u` from the start (the art file is still `hitech-u`, per the Phase 6 IP task).
  - GigHub isn't a board location. It's an anywhere-action in Phase 2 (§16 MVP scope).
  - No Zod schema for saves yet (engine-design §14).
- Notes for later phases:
  - Engine purity is enforced by `packages/engine/src/purity.test.ts` (engine-design §5). Shared constants come from
    the Zod-free `@fastlane/content/keys` so the client bundle never pulls in Zod through the engine.
  - Phase 2 jobs and study should set `outputTarget: "workOutput"` / `"studyOutput"` so low-energy and later item
    modifiers apply (engine-design §8.3).
  - The weekend event (Phase 3) returns `{ pause }` from its step; the mechanism is tested (engine-design §11).
  - The pinned RNG output in `rng/rng.test.ts` and the golden hashes in `core/golden.test.ts` change only on purpose,
    with an `ENGINE_VERSION` bump.

## Phase 2 — Economy, jobs & goals — done 2026-10-05

- Exit criteria:
  - A scripted "sensible" strategy can win a Standard game: `packages/sim/src/sensible.test.ts` (agreed bar: wins on
    at least 8 of 10 seeds within 52 weeks, and every game replays to the same hash). It wins 10/10, in week 24–25.
    `pnpm sim --bots sensible --games 10` reports 10/10 wins, median week 24.
  - Property tests for money conservation and no-softlock pass: `packages/engine/src/core/economy.properties.test.ts`
    on fixture and shipped content (also run at 600 cases each locally). Money conservation uses the definition agreed
    with the user, recorded in engine-design §10.1.
  - All ~20 MVP jobs and ~15 items exist as validated content: 20 jobs across 7 ladders, 15 durable items plus
    groceries, 8 courses, 5 housing tiers, 5 subscriptions. `content/src/schemas.test.ts` pins the counts, and
    `pnpm content:validate` passes.
- Deferred:
  - FR-44 surge pricing as its own mechanic → Phase 3. Gig pay is a rolled hourly rate within a range; news-driven
    surges fit the news ticker.
  - FR-57 theft, the smart lock's anti-theft effect and the air fryer's cheaper meals (FR-60) → Phase 5 content pass.
    Both items have simple weekly buffs for now.
  - Utility-bot quality → Phase 3. `balanced` scores about 80% on Standard but rarely wins: it plans careers
    myopically. Its tuning constants (`ai/utility.ts`: buff weeks, energy comfort, future-pay weight, value cap)
    should become persona or balance data then. It runs at about 0.5 s per game, far below SIM-02's 50 games/s.
  - Code-review judgement calls (duplicated banking and travel-projection steps, debt-kind special cases) are left
    for when Phase 3 touches those files.
- Deviations:
  - No save migration for the state change (user default): `SAVE_VERSION` 2 with no migration, so Phase 1 saves are
    refused with a clear error. None existed outside tests.
  - A city profile is a folder of files (`city.json`, `jobs.json`, `courses.json`, `housing.json`, `items.json`,
    `subscriptions.json`) merged into one `City`, not one file (engine-design §13).
  - Beyond the agreed shortfall rules: unpaid subscriptions are cancelled instead of becoming arrears; a missed rent
    and an eviction each cost credit score too; card limits are banded by credit score. Arrears are due in full the
    week they appear, so the first missed rent counts as one of the three misses before collections.
  - The job score is called `rating`: `performance` is a banned word in the engine purity scan.
  - Career stability uses the player's exposure after the AI-tools cut (FR-42's "personal exposure").
  - Items count at resale value of their launch price, not the inflated price paid.
  - The AI assistant subscription is taken at Your Place (online), not bought at Circuit Planet.
  - Extra persona `casual` (simulator §3 lists it) and a `pnpm sim --bots` subset of the Phase 3 CLI.
  - Engine AI players (Jones) still use the random policy; the utility policy is ready for Phase 3.
- Notes for later phases:
  - `ENGINE_VERSION` 0.3.0, state schema 2, `SAVE_VERSION` 2.
  - Add balance rules to `balance.json` and prices to the city folder; `checkContent` cross-checks both.
  - The sensible bot wins Standard by week 24, before simulator §5's 30–45-week band for `balanced`. Expect to raise
    Standard targets when Phase 3 sets the bands.

## Phase 3 — Jones, events & hooks — done 2026-10-05

- Review of Phases 0–2 first (same branch, user decision): plans list their ledger moves (`Plan.transfers`), so a
  student loan or deposit never hides in a preview (FR-03); moving house counts the old deposit; changing jobs keeps
  the week's hours; setup config is validated; paying rent on time builds credit; the content schema rejects
  negative cash effects, returns below −100%, zero-time trips and jobs no work action can reach (FR-14); founder
  hoodie and cashier rebalanced. New tests: ledger moves match the preview, and the world stream is the same whatever
  players do (NFR-12).
- Exit criteria:
  - A full game, human-scripted vs Jones, runs headless with events, news and teasers:
    `packages/sim/src/jones.test.ts` plays the sensible bot against Standard Jones on shipped content on 3 seeds. Each
    game ends and shows weekend events (Jones resolving its own), news, teasers, quests, standings and Jones's posts,
    and replays to the same hash.
  - The balance sim runs in CI under the 8-minute budget with initial KPI bands: the `balance` job in `ci.yml`
    (parallel to `checks`, `timeout-minutes: 8`) runs `pnpm sim run --games 2000`. Locally on 4 workers it takes
    121 s; on 16 workers, 54 s. Bands are in `packages/content/sim/kpi-bands.json`, set from the baseline run
    (2001 games, seed `fastlane`, engine 0.4.0, content hash `1f9130ce7ef6`). Every hard band passes. The soft-band
    misses are recorded below and in each band's note.
- Initial KPI baseline (soft-band misses marked ⚠): balanced vs Standard Jones wins 69.0%, median week 22 ⚠ (target
  30–45). Jones wins 9.3% on Chill ⚠ (10–25), 31.0% on Standard ⚠ (35–55) and 46.1% on Hustle Culture ⚠ (55–75).
  Dominance is 7.9 points. Careerist wins 76.9% ⚠ (< 20): Career is the critical path. Hardship is 0.4% ⚠
  (30–60%). Casual on Chill wins 22.0% ⚠. Gigger, idle and random win 0%. First paycheck comes in week 1. Event reach
  is 97.6% and news reach 100%. Seat gap is 15.4 points ⚠ on about 180 pair games; a 600-game check gave 49/51, so
  this is noise.
- Bot checks (implementation-plan note): balanced beats random on every seed; it scores 99.7% on Standard. The
  scorer was reworked before the bands were set. It now uses a concave goal value with a bottleneck bonus, and counts
  actual and expected progress separately. It plans promotions from the effort still needed, values a job as it
  will stand after this week's job check, keeps a cash cushion, and prefers longer shifts. All tuning is in
  `content/data/ai.json`. Before the rework, a more random Jones beat a greedier one. After it, a higher best-move
  rate plays better again, and the difficulty curve runs Chill < Standard < Hustle.
- Deferred:
  - Luck share and week of first goal milestone (simulator §5), `sim assess/sweep/trace`, HTML report → Phase 5
    (plan row "Sim choice assessment…").
  - Balance tuning for the soft-band misses → Phase 5 content fill and Phase 6 playtest tuning. A first sweep of
    Standard targets moved the KPIs erratically (careerist 0–94%), so content was left as Phase 2 shipped it.
  - SIM-02 throughput (≥ 50 games/s per core) is not met: about 4 games/s per core with two utility players. The
    pool and the CI budget make 2k games fit. Faster projections → when CI time warrants it.
  - The throughput regression only warns in the summary; it has no band, because it depends on the runner.
  - Jones posts about milestones, not about weekend events (a viral post, say) → Phase 5 copy pass.
  - Event chains (FR-73, S) → Phase 8 as planned. Jones has one personality (FR-81) → Phase 8.
  - Delivered meals count at the food check even if the subscription is cancelled for non-payment that week (Phase 2
    review, low) → Phase 5 content pass.
- Deviations:
  - CI-04 runs on `main` and manual dispatch, not per PR, and posts to the job summary (user decision; CI-07). The
    compare base is the last green `main` run's report, not the merge base; reports pair only when plan, seed and
    game count match.
  - Rule changes found by the sim: a new hire keeps the old job's rating (bots re-applied to dodge being let go);
    week-limit score ties go to the bigger overshoot (ties were common with goals capped at 100% and handed seat 1
    the win); a "Drop the course" action at UpSkill U (bots got stuck enrolled in a course they no longer needed).
    Recorded in engine-design §17.
  - Difficulty has two persona levers: best-move rate and how many runners-up the fallback picks from (FR-83: still
    strategy, never rules). The rate alone barely moved Jones's win rate.
  - Jones's personas ship in game content (`data/ai.json`), not `sim/personas.json`.
  - The event deck has 41 cards; three have a single choice (FR-70: "many give the player a choice").
  - Rival-feed lines are numbered copy variants (`feed.<moment>.<n>`); the engine picks the moment and slots, and
    the UI picks the line.
  - `SAVE_VERSION` 3 and state schema 3 with no migration (no saves exist outside tests); `ENGINE_VERSION` 0.4.0.
  - Rules tests (`economy.properties`) and the random-play check use the random AI policy, so they stay fast and
    games run their full length.
- Notes for later phases:
  - `pnpm sim run --base <report.json>` shows paired deltas for any change; use it for every balance tweak. Paths
    are relative to where you run `pnpm`.
  - The utility scorer is about 200 ms per player-game. A 2-player game with Jones costs about 0.4 s, so client-side
    Jones turns are fine, but sim game counts drive CI time.
  - Gotchas from building the bot: optional calls skip their arguments (`f?.(++x)` doesn't increment when `f` is
    undefined); arrival values must be computed per transport mode; any chained step (withdraw → pay, enrol →
    study, drop → enrol) needs explicit credit in the valuation or the bot never starts it.
