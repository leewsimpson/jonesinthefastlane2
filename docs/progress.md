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
    The token is set in both GitHub environments. `production` has no required reviewer (removed 2026-10-10) and allows only `main`/`v*`.
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

## Phase 4 — Playable client — done 2026-10-05

- The client in `apps/web`:
  - Zustand store around the engine (`store/game.ts`): `dispatch` runs `engine.reduce`, keeps the action log, and
    routes events: in-turn events to the ticker; everything from a turn's end to the end-of-week report.
  - Screens: title (save slots) → setup (1–4 humans, Jones on/off, Chill/Standard/Hustle Culture or custom targets,
    week limit, seed) → game → run summary (winner, scores, goal rings, net worth by week).
  - Pixi board through `@pixi/react`: a code-drawn stadium ring road and pads from the palette, the A3 building
    art on the pads, tokens with the A2 busts in a seat-colour ring (emotion from Energy and Happiness). Tokens glide
    the shorter way round the loop; reduced motion jumps. Clicking a building opens travel to it.
  - HUD: cash, Time and Energy bars, stat chips with icons, four goal rings, score, each rival's score ring; tap or
    D for full details (stats, job, home, money by place, education, items, subscriptions, quests, news).
  - Action sheet with every option's preview chips (time, cost, stat effects, random ranges, modifiers, ledger
    moves) and the reason when unavailable; wage, rent, fee and study time on job, home, subscription and course rows.
    Travel dialog with every destination by every mode.
  - End-of-week sequence: bills and life → weekend card with choices and their previews → news and market → goal
    rings for everyone with near misses → Jones's feed (overtakes, posts from `feed.<moment>.<n>`) → teasers.
  - Hotseat handoff screen between humans. Dexie save slots: autosave after every action and at week end; loading
    migrates, validates with Zod and resumes, reopening a pending weekend choice.
  - Portrait (HUD, board, action sheet stacked) and landscape (HUD | board | sheet) layouts. Keyboard: E end week,
    T travel, D details, numbers and letters on every action row, travel destinations and weekend choices; Enter
    moves the wrap-up on. i18next with all strings in resources; `Intl` money formatting.
  - Lazy chunks: the engine, content and Dexie load behind the title screen, Pixi with the board, the summary on
    game over.
- Exit criteria:
  - The team can play a full game vs Jones on desktop and phone; saves survive a reload: **human-only, for the
    user** (plan note). Evidence so far: played week 1 in Chrome at desktop size (apply for a job, travel, work,
    weekend choice, the full wrap-up), reloaded mid-game and continued; a scripted 25-week game in Chromium ran to
    Jones's win and the summary; iPhone 15 WebKit viewport screenshots show the portrait layout with no page
    scroll.
  - Bundle stays under budget: `pnpm size` → 88.61 kB gzipped initial JS against 300 kB.
  - E2E runs against the PR preview: `e2e/play-a-week.spec.ts` (start → act → travel → get hired → end week through
    the wrap-up → reload → continue) passes locally on `desktop-chromium` and `mobile-webkit` against a production
    build. `preview.yml` now runs it against the PR's preview URL after the smoke test; it runs once the PR carries
    the `preview` label.
  - Cross-runtime determinism (engine-design §15): the same test reads the browser's autosave and replays its log in
    Node; the hash matches the snapshot on Chromium and WebKit.
- Deferred:
  - Sim decision traces, `sim trace`, the client debug route that replays a sim game, and the HTML report (simulator
    §4, §8) → Phase 5, with the rest of the sim tooling (plan row "Sim choice assessment…"). Nothing in the
    playable loop needs them.
  - NeoBank charts: NeoBank has no charts yet, so there is nothing to lazy-load there; the net-worth chart on the
    summary is hand-made SVG in the lazy summary chunk → Phase 5 adds market charts.
  - Motion (springs, number tickers) isn't installed yet: Phase 5's juice brings it.
- Deviations:
  - Location panels are a docked action sheet (bottom in portrait, right in landscape), not modal dialogs, so the
    board stays visible (NFR-02). Radix dialogs carry travel, details and the week wrap-up.
  - Art: A2 and A3 had landed, so the board uses the generated buildings and busts instead of placeholder shapes.
    UpSkill U's building still uses the `hitech-u` art id (IP note in the Risks table).
  - The Zod save schema lives in the client (`apps/web/src/persistence/schema.ts`), not in `engine/save`, so Zod
    stays out of the engine (engine-design §14 updated).
  - Removed the Phase 0 API health readout from the title screen; `config.ts` stays for Phase 7.
- Notes for later phases:
  - `@pixi/react`'s `<Application>` renders the children it was given before its async init finished. Anything a
    scene needs from the first render (its size) must come from inside the scene, not a prop: `Board.tsx`
    measures its container in `Scene`.
  - Screen-reader-only text inside a scrolling list needs a positioned ancestor, or it stretches the page (the
    action list is `relative`).
  - Dialogs mark the keys they handle (`preventDefault`); `useHotkeys` ignores marked keys, because React re-adds the
    window listener before the same key press reaches it.
  - Root `devDependencies` link `@fastlane/engine` and `@fastlane/content` so E2E tests can replay in Node.

## Phase 5 — Polish & content — done 2026-10-07 (tester exit criterion moves to Phase 6 playtests)

### Playability pass — 2026-10-07

Compared the Phase 4 client with the original *Jones in the Fast Lane* (1990). In the original you click a building
and walk there; the board's centre holds the clock and messages; each shop shows a talking owner beside its menu.
Reviews' main complaint is hidden mechanics nobody explains. Playing a Phase 4 week turned up four problems:

- Every trip needed a dialog and a choice from four transport modes.
- Nothing warned before hunger, so week 1 usually ended with the hunger penalty.
- There was no hint of what to do next.
- Blocked rows ("You don't work here" ×3) crowded the action list.

Client-only changes, with no engine rule or content change, so sim KPIs and save hashes are untouched:

- **One-click travel (FR-02):** clicking a building goes there at once by the player's chosen mode (remembered per
  browser, default Transit). If that mode can't go, the cheapest mode that can is used; if none can, the travel dialog
  opens with the reasons. The T dialog stays for keyboard users and for comparing modes. Hovering a building shows the
  trip's time and fare.
- **Week panel in the board's centre (ENG-20, FR-03):** a clock for hours left, this week's needs (meal, rent due vs
  cash, shift hours left) and one suggested next step with a Go button (`game/guide.ts`). The step order is: get a
  job, then eat if food is on offer here or the week is nearly out (`HUNGRY_BY`), then work, rest, rent, study. On
  boards too small for the panel (phone portrait), a one-line version sits above the action list. The panel's spot
  comes from `innerRect` in `board/layout.ts`, which clears every building, label and token.
- **End-week check (FR-04):** ending the week with no meal, or with rent short, asks first and shows the hunger
  penalty from `balance.json`.
- **Location header (FR-32):** building art plus an owner line that rotates by week.
- **Action list:** a group whose rows are all blocked for one reason collapses to one line. Number keys go only to
  rows that can be taken, so 1–9 always do something.
- Evidence: unit tests for the guide, trip picking, shortcuts, owner lines and `innerRect`; `e2e/play-a-week` now
  travels with the Go button and confirms the hunger warning. It passes on desktop Chromium locally; WebKit isn't
  installed in that container, so mobile WebKit runs in CI. Initial JS is 90 kB gzipped.
- Deviations:
  - Owner lines started as UI copy; the copy pass moved them to content (`owner.<location>.<n>` in
    `packages/content/locales/en.json`, see "Sim tooling, content and balance" below). Owner busts stay art-track
    work (art-direction §6, `npc-<location>`); the header uses building art until then.
  - `weeklyCap` is now exported from `@fastlane/engine` so the guide reads shift hours left from the rule itself.
- Not done (still Phase 5): first-paycheck timing with testers (ENG-20 exit criterion), and the walk cost
  (`transportModes` in `city.json`) that makes Walk a poor default. That is a balance change, so it goes through
  `pnpm sim run --base`.

### Client polish — 2026-10-07

The client half of Phase 5 (user decision: client polish first, sim tooling and the content fill next). PR branch
`phase-5-client-polish`.

- **Juice (ENG-01):** `src/fx/map.ts` maps a batch of domain events to pop-ups, a coin count, a shake level and a
  "moment" (hired, promoted, first paycheck, credential, quest, moved, laid off, evicted). `FxLayer` plays it over the
  board with Motion: floating number chips, a banner with confetti, a light shake. The board bursts coins from the
  player's token on a Pixi `ParticleContainer`. HUD cash springs to its new value.
- **Reveals (ENG-03):** the weekend card flips from its back to its face with the category art; news, market moves,
  promotions and credentials stamp or rise in. All finish within `REVEAL_MAX_S` and a click on the page skips them.
- **Paper-puppet motion (art-direction §4):** idle bob, squash on arrival, a pop on every face change; the active
  token shows the proud or shocked bust for a moment after good or bad news.
- **Art (art-direction §6, §9):** event-card art on the weekend page, item and outfit art on shop rows and in
  details, the home interior above the sheet at Your Place, the skyline behind the board. App icons are cut from the
  locations atlas (`scripts/icons/build.ts`; the art sources are in Git LFS).
- **Dark theme (art-direction §4):** a colour-matrix night grade on the board, lit windows, labels drawn above the
  grade so they stay readable.
- **Week-1 coach (ENG-20):** five steps from a new game to the first paycheck (`game/coach.ts`, derived from state,
  so it follows clicks, keys and reloads), with the control it means outlined. It carries its own Go button, so it
  never points at a hint that goes elsewhere. Skip ends it for the game; Settings turns it off.
- **Instrumentation (ENG-20, ENG-02):** `game/pace.ts` records active play time (idle gaps capped at `IDLE_CAP_MS`)
  to each human's first paycheck and per week, saved next to the slot (never in engine state). The run summary shows
  it to testers.
- **Smart defaults (ENG-02):** `engine.smartDefaults(state)` (engine-design §3) offers eat-if-hungry, the longest
  shift and the longest study; the sheet shows them as a quick bar on Q, W and R ("Work full shift · 8h").
- **Run summary (ENG-21):** `game/review.ts` builds a timeline, best and worst week, peak net worth and a short story
  from `state.history`; best and worst weeks are marked on the net-worth chart.
- **Accessibility (NFR-04):** settings for theme, motion and text size (`src/settings`, on `<html>`); `good`/`bad`
  text tokens darken teal and coral on light surfaces to pass AA; `e2e/a11y.spec.ts` runs axe (WCAG 2.2 A/AA) on
  title, setup, game, details, settings, end-week check and wrap-up in both themes.
- **PWA (NFR-11):** vite-plugin-pwa precaches the app and all art (69 files, about 5.7 MB); `config.json` is
  network-first because deploys write it after the build. The service worker registers from a lazy chunk; the title
  screen offers "Install app" when the browser allows it.
- **Lighthouse (CI-05, deferred from Phase 0):** `preview.yml` runs Lighthouse CI on the PR preview after E2E, with
  budgets in `lighthouserc.json`, and writes the scores to the job summary.
- Evidence: `pnpm lint`, `typecheck`, `test` (288 tests), `build`, `content:validate` pass. `pnpm size`: 85.9 kB
  gzipped initial JS. Lighthouse on the local production build (3 runs): performance 96–97, accessibility 100, best
  practices 100. E2E (`play-a-week`, `first-paycheck`, `a11y`) passes locally on desktop Chromium and on the iPhone 15
  viewport in Chromium; WebKit isn't installed in this container, so mobile WebKit runs in CI. Offline: after one
  online load, a reload with the network off starts a game with all art.
- Deviations:
  - Lighthouse CI runs through `pnpm dlx @lhci/cli@0.15.1`, not as a dependency: its tree carries high audit
    advisories that would fail CI-06.
  - `pnpm-workspace.yaml` overrides `sharp@<0.35.5` to 0.35.5. Wrangler's miniflare pinned a release with a high
    advisory, which already failed `pnpm audit --audit-level high` on `main`.
  - The coach is UI state over engine state, not engine content; its copy is UI copy (`coach.*`).
  - Stat icons keep the palette colours; only text uses the darker `good`/`bad` tokens.
  - The `balance` job is gone from `ci.yml` (user decision: too many Actions minutes). The balance sim now runs
    locally (ci-cd.md CI-04); the 20-game random-play replay check stays in `checks`.
- Not done (still Phase 5): first-paycheck time with real testers (**human-only**: the summary's "Play time" line is
  what they report); copy pass on content strings and Jones's viral-post moment (NFR-07: content strings are in the
  content hash, so they go with the content fill); sim `assess`/`sweep`/`trace`, the content fill and the balance pass;
  analytics and Sentry (deferred by the user: no accounts yet); the walk cost from the playability pass. Unlocks on
  the run summary (ENG-21) wait for meta-progression in Phase 8.

### Sim tooling, content and balance — 2026-10-07

The rest of Phase 5 (user decision: finish Phase 5, then deploy). PR branch `phase-5-sim-content`.

- **Sim tooling (simulator §4–§8):** decision traces for 1% of games and every anomalous one, as gzipped JSONL under
  `sim-out/<run>/traces/`; `pnpm sim trace <seed>` prints a week-by-week log with the bot's top options and scores;
  `--replay` writes `{ setup, log }` for the client's debug route `#/replay`, which steps through a game on the real
  board and HUD (it also loads save files). `pnpm sim assess` plays counterfactual rollouts with common random
  numbers on sampled weekend decisions and classifies each event; `pnpm sim sweep` runs one value across a range;
  `--scenario` starts games from a set position (`packages/sim/scenarios/`); `--matchups` plays part of the plan;
  every run writes `report.html` (win rates, weeks-to-win histogram, net-worth fan chart, anomalies, unused content).
  New KPIs: luck share (with a band), week of the first goal milestone, anomaly count.
- **Content:** theft events `porch-pirate` and `wallet-lifted` (FR-57: cash on hand and cheap housing raise the
  risk; NeoBank or a smart lock avoid it); the air fryer unlocks a $5 healthy dinner (FR-60); Jones posts a
  `went-viral` line after a viral weekend card (FR-82). Fix: delivered meals count at the food check only when this
  week's bills will pay for them, including an eviction's deposit refund (FR-52); `ENGINE_VERSION` 0.5.0.
- **Copy (NFR-07):** a tone guide (game-requirements.md, Appendix) and an edit pass over both locale files; location
  owner lines moved to content. Locale strings aren't part of the content hash, so saves are unaffected.
- **Balance:** see the baseline below; values in `balance.json`, `ai.json` and `sim/personas.json`.
- **Exit criteria:**
  - New testers reach the first paycheck in under 3 minutes without help: **not evidenced** (human-only). The run
    summary's "Play time" line records it; moved to Phase 6's playtest rounds.
  - Lighthouse budgets on the preview URL: `preview.yml` runs Lighthouse CI on this PR's preview (the PR carries the
    `preview` label); the client-polish run on a local production build scored performance 96–97, accessibility 100.
- **Baseline** (2001 games, seed `fastlane`, engine 0.5.0, content `0cfaeef41225`, 425 s on 4 workers; compared with
  the start of this pass): `balanced` vs Standard Jones wins 52.8% (was 72.8%) in a median week 32 (was 22); Jones
  wins 11.0% on Chill, 47.2% on Standard and 63.2% on Hustle Culture (all in band; were 7.1/27.2/50.0); dominance
  4.4 points (was 17.3); careerist 59.3% (was 90.1%); casual on Chill 56.0% (was 26.4%); seat gap 5.5 points; luck
  share 5.0%; first paycheck week 1. No hard band fails. Soft misses: `balanced` 52.8% (its 55–80% band and
  Standard Jones's 35–55% only meet at 55/45: one of the two always wins), careerist 59.3%, socialite 25.3%,
  gambler 55.0%, hardship 0.2%.
- **Choice assessment** (300 games, 1 412 decisions, 6 rollouts × 8 weeks): 0 no-brainers, 0 traps. 6 dead: the two
  burnout cards (strategy bots never end a week at 0 Energy) and four housing cards for tiers the bots skip
  (`mould`, `roommate-drama`, `housewarming`, `smart-condo-glitch`). 29 flat: weekend choices move the score by
  under 1% over 8 weeks, so they are flavour more than strategy at today's magnitudes. Left as is until playtests
  say whether choices should bite harder. Bot regret 0.0–0.5% for every persona, so the bots are sound.
- **Deviations:**
  - The bottleneck bonus at 5 000 made a bot chase its weakest goal and lose time on the rest: `balanced` lost to
    every one-goal persona. `balanced`, `casual` and every Jones now use 2 000 (Phase 3 note: fix the bot before
    trusting its numbers). Jones's levers are now best-move rate, runners-up, bottleneck and, on Hustle Culture, a
    16-week horizon (FR-83: strategy only).
  - Wellbeing decays faster (happiness −4, social −5 a week) so it needs upkeep; it is still the easiest goal.
  - The anomaly check uses weekly net-worth swings, not cash: moving money into savings isn't a swing
    (simulator.md §4 updated).
  - `assess` rollouts play 8 weeks, not to the end of the game, so a sample of 1 400 decisions fits in 15 minutes.
  - `sim explain` (simulator §9, priority C) isn't built.
  - No `_redirects`: Pages' default SPA fallback is used (ci-cd.md §5).
- **Deferred:**
  - Hardship (0.2% vs 30–60%), the one-goal personas and gambler, and the `balanced`/Jones band overlap → Phase 6
    playtest tuning and band re-anchoring (simulator §10). The bots dodge every setback; people won't.
  - Analytics and Sentry (NFR-14, NFR-16) → when the user has PostHog and Sentry accounts (**human-only**).
  - Walk cost (playability pass) → Phase 6 playtests: walking stays slow and Transit stays the default mode. No
    balance change made.
- **Notes for later phases:**
  - `pnpm sim run` now takes about 7 minutes for 2 000 games on 4 cores: games last ~32 weeks instead of 22.
  - Use `--matchups` and `--override` for quick experiments, then a full run with `--base` for the record.
  - Career is stepped (level × 20 × stability): targets between levels behave like the next level down. Standard's
    55 means level 3 with low AI exposure; 65 was out of reach for every bot.


## Phone layout pass — 2026-10-07

User report from an iPhone Pro Max: text too small, board graphics overlapping, and the game screen couldn't be
scrolled properly. Most players will be on phones of that size, so portrait (NFR-02) was redesigned. These are
client-only changes, so sim KPIs and save hashes are untouched.

- **Causes:** the game screen was locked to the viewport height, with only a 40%-height strip under the board
  scrolling (and the HUD scrolling separately). Pixi's `touch-action: none` on the canvas swallowed swipes over the
  board. Eleven buildings shared a 430×378 board, so names landed on neighbouring roofs. Chips, reasons and HUD links
  were 10–13px, and the links were about 16px tall.
- **One scrolling page:** portrait is now a normal document. The HUD's top bar (name, week, cash, Time, Energy)
  sticks to the top. Travel / End week and the last-action ticker sit in a dock pinned to the bottom (`ActionDock`,
  safe-area aware). The first screen is that bar, the whole board and the dock. Stats, goals and Details / Settings /
  Quit come next, then the action sheet. The board canvas allows vertical panning, so a swipe over it scrolls and a
  tap still travels. Arriving somewhere scrolls that place's actions into view under the top bar. Each new screen
  opens at its top: Setup's Start button is below the fold, and the game used to open part-way down. Floating
  numbers and banners are fixed to the screen, above a dialog's backdrop so they're never dimmed (axe flagged their
  contrast behind the week wrap-up's backdrop).
- **Board:** on phones it fills the space between the top bar and the dock with the browser's toolbars showing
  (`clamp(340px, 135vw, 100svh − 10.5rem)`); the user's iPhone in Brave leaves about 430×735 CSS px. `boardLayout`
  shrinks buildings when the loop is too short for each to have 1.2× its width of road. Names are 14–17px, wrap to
  the building's width, and follow the text-size setting. The week panel always sits in the sheet on portrait, as a
  card with the needs, next step, Go and travel mode; the loop's centre shows the hours-left clock.
- **Text and touch (NFR-04):** under 768px wide, Tailwind's `xs`/`sm`/`base` steps move up one notch (smallest text
  14px). On touch screens, keyboard hints are hidden, buttons and inputs are at least 44px tall, and inputs are at
  least 16px, so iOS doesn't zoom on focus.
- **Evidence:** `e2e/phone-layout.spec.ts` (mobile project) checks no sideways overflow, a scrolling page,
  smallest text ≥14px, the dock staying on screen without covering the last action, and scroll-to-actions on
  arrival. `play-a-week` reads the ticker from the dock. All E2E specs pass locally on desktop Chromium and a
  430×735 Chromium phone viewport; mobile WebKit runs in CI. Checked by screenshot at 430×932, 430×735 and 384×832, and
  at 1366×800 for the desktop layout.


## Phase 6 — MVP hardening & launch — in progress 2026-10-08 (human-only steps open)

Branch `phase-6-mvp-hardening`. Built everything in the plan that doesn't need a person, an account or a device;
the open items are listed under "Left for the owner" below.

- **Save migration test (tech-stack §4):** `packages/sim/scripts/capture-save.ts` captured a v3 save from the beta
  build (engine 0.5.0, content `0cfaeef41225`), parked on a weekend choice:
  `apps/web/src/persistence/__fixtures__/save-v3-beta.json`. `persistence/beta-save.test.ts` loads every fixture,
  reopens the choice, plays three more weeks and round-trips through IndexedDB, and requires a fixture for the
  current `SAVE_VERSION`. Capture a new fixture before each schema bump.
- **IP check (art-direction §9.1):** the `hitech-u` art file, atlas frame, manifest and prompt are now `upskill-u`, and
  the frame alias is gone. The About dialog says the game is inspired by, and not affiliated with, the original.
  Legal review of the title and names is **human-only**.
- **Privacy, consent, credits (NFR-14, ENG-35):** About & privacy dialog on the title screen (privacy notice,
  "About real financial help" links for the US, UK, Australia, Canada and New Zealand, credits, IP note); a
  "Share anonymous play data" setting, off by default, that any analytics loader must check; one privacy line on the
  title screen. The link targets couldn't be fetched from the build container: check them before release.
- **Monetization spec (ENG-31):** game-requirements §13.4, MON-01…07. The MVP ships without ads; rewarded video for
  meta credits comes with Phase 8 meta-progression, never inside a run or the Daily Run, capped at 3 a day.
- **Visual snapshots (tech-stack §6, CI-03):** `e2e/visual.spec.ts`: title, setup, game, details and wrap-up in light
  and dark. Baselines come from `visual.yml` (dispatch) on CI's runner: fonts and rasterising differ between
  machines. Until a project has baselines its comparisons are skipped with a report note. The E2E matrix itself
  (desktop Chromium + mobile WebKit on the preview) was already in place.
- **Performance (NFR-10):** Lighthouse's mobile profile is a Moto G Power (2022) on slow 4G. On the local production
  build (3 runs) it gave LCP 1.97–2.42 s, time to interactive 2.17–2.47 s, performance 0.95–0.98. `lighthouserc.json` now fails above
  3 s for either. `e2e/perf.spec.ts` throttles the CPU 4× at 412×915: the board's JS is 2.0–6.1 ms per frame idle
  and 2.9–6.5 ms gliding (budget 10), a travel click 120–195 ms (budget 300). The headless frame rate (10–29 fps) is
  SwiftShader's software WebGL, not the game: with the canvas hidden it was 60 fps, and the JS profile is under
  1% of the time. Initial JS is now measured as the entry plus every modulepreloaded chunk (`apps/web/.size-limit.js`):
  94.2 kB gz, was 85.6 kB with the old glob.
- **Exploit search (SIM-09, OPS-04):** the `optimizer` bot and `pnpm sim optimize` (simulator §3). 20 games vs
  Standard Jones (top 4 × 3 rollouts × 4 weeks, 451 s on 4 workers): optimizer won 19/20 in a median week 31,
  `balanced` 8/20 in week 33 on the same seeds. 11 leads, none seen more than twice, all in weeks 1–6 (transport mode,
  social upkeep, an early gym pass): no hole in the economy, but the utility scorer is short-sighted early, which
  also makes Jones beatable by a careful player. Look at it with the playtest tuning. `nightly.yml` runs the balance run,
  `assess`, `optimize`, the full E2E matrix and the audit and opens a "Nightly report" issue. It is manual dispatch
  only (about 40 Actions minutes a run) until the owner turns on its schedule.
- **Earlier phases, fixed on the way:**
  - NFR-03: a NeoBank with every account open lists more than the 30 row keys, so its last rows had no shortcut.
    Rows past them take Shift+letter (`⇧A`); `ui/common/hotkeys.test.ts` checks a fully stocked NeoBank.
  - CD-06: `main.yml` opens an issue when the main deploy fails, like `production.yml`.
  - tech-stack §6 Component: Testing Library on happy-dom; `ui/panels/panels.test.tsx` covers the action sheet and
    the end-week check.
  - `runWorkers` (sim pool) put every job of a small run in the first worker's batch; batches are now an even share,
    so `assess` and `optimize` use every core.
  - Docs: FR-70 said 100+ events at launch while §16 said ~40; it now says ~40 at MVP and 100+ by v1.0 (Phase 8).
- **Guardrail review (ENG-30…33, §13.3):** no purchases, loot boxes or paid randomness (crypto and gambling-flavoured
  events use in-game cash only); the only clock is the in-game week, so no real-time energy or wait timers; no
  countdowns or FOMO copy in either locale file; no notification or push code. ENG-35: debt, layoffs and burnout copy
  aims at systems (tone guide, Appendix) and the credits link to real help.
- **Exit criteria:**
  - Production deploy and rollback rehearsed: **not yet**. Needs a `production` reviewer (**human-only**). Rehearse
    the rollback on the `main` alias first (ci-cd.md §6), then a production release and a production rollback;
    record the run links here.
  - All **M** requirements met or explicitly deferred: the table below. Six rows are Partly, each with its owner.
- **Left for the owner (human-only):** the deploy and rollback rehearsal; playtest rounds (first paycheck under
  3 min, 60–120 s weeks, hardship, the persona bands, flat weekend choices, the early-game scorer gap above) and the
  KPI band tightening that follows them; a try on a real 2022 mid-range phone; legal/IP review of the title and
  names; privacy notice wording; the ad provider; turning on Cloudflare Web Analytics; dispatching `visual.yml`
  after deliberate visual changes; scheduling `nightly.yml`; confirming Dependabot alerts are on (CI-06).
- **Deviations:**
  - The board's 60 fps can't be measured headless (no GPU); `e2e/perf.spec.ts` budgets the game's own main-thread
    work instead, and the real-device check stays human-only.
  - `nightly.yml` is manual dispatch, not a cron (Actions minutes, as with CI-04).
  - Deferred to Phase 8 rows: car transport (FR-02), LeaseLord renew/dispute and bidding wars, JobLink networking,
    random thrift finds (§5, ENG-12), Reputation/Clout (FR-20), meme stocks, BNPL and personal loans (FR-53, FR-54),
    sound (ENG-01 via NFR-05). `/daily` in the smoke test → Phase 7 (CD-06).
- **Notes for later phases:**
  - Local Playwright in the cloud container: its Chromium build may not match `@playwright/test`; link the
    installed one at the path the error names. Visual baselines made there would not match CI's.
  - `pnpm sim optimize` takes about 55 s a game at the defaults; `--candidates 2 --rollouts 1 --horizon 2` is a
    quick look.

### Progressive unlock and whole-nickel prices — 2026-10-10

- FR-15: `unlockWeek` on actions and subscriptions (host friends 3, subscription audit 4, gig shifts 2; streaming and gym 2, cloud storage 3, AI assistant 4, delivery pass 5). Locked options are unavailable with `NOT_UNLOCKED` and `reason.unlockWeek`. `ENGINE_VERSION` 0.5.1.
- Stray cent ($25.01): the price index drifted 2500 to 2501 by week 2. `price()` now rounds to 5 cents (FR-50).
- Sim (2001 games, seed `fastlane`, content `1900590ea5f1`): no hard band fails. `balanced` wins 53.4%, median week 32, Jones 9.3/46.6/81.9% on Chill/Standard/Hustle Culture, dominance 8.2 points, seat gap 14.3. Hustle Culture's 82% was already there before the gating (82.4% with exact-cent prices), so it is drift from earlier Phase 6 changes, not this work.

### M requirement audit (2026-10-08)

Scope rule: game-requirements §16. An M row that asks for more than the MVP is Deferred to the phase that owns it.

#### game-requirements.md

| ID | Status | Evidence / reason |
|---|---|---|
| FR-01 | Met | `balance.json` weekMinutes 3600; sleep through `weeklyDrift` + housing `weekly` in `pipeline/order.ts` statDrift |
| FR-02 | Deferred | walk, e-scooter, transit, rideshare in `city.json`; car → Phase 8 row (FR-02) |
| FR-03 | Met | `core/properties.test.ts` "applies what the preview promised", "never ... consumes RNG when previewing" |
| FR-04 | Met | `actions/plan.ts` restBonusEnergyPerHour; End Week always offered (`properties.test.ts`) |
| FR-05 | Met | `pipeline/order.ts` defaultPipeline; pinned by `pipeline/order.test.ts` |
| FR-05a | Met | per-round marketMove/news in `order.ts`; `core/world.test.ts` "same economy ... whatever they do" |
| FR-06 | Met | `Setup.tsx` MAX_HUMANS + Jones toggle; `ui/week/Handoff.tsx` |
| FR-10 | Met | `Setup.tsx` presets + custom sliders; `balance.json` goals.presets |
| FR-11 | Met | `pipeline/goalCheck.ts` round-end check, overshoot tiebreak; `goals/goals.test.ts` |
| FR-13 | Met | `ui/hud/GoalRings.tsx`; ring animation in `WeekSequence.tsx` |
| FR-14 | Met | `economy.properties.test.ts` "never softlocks"; `parents-basement` rent 0 in `housing.json` |
| FR-20 | Partly | MVP stats simulated and shown; Reputation/Clout → Phase 8 row, Age and Relationship → Phase 9 |
| FR-21 | Met | `balance.json` statModifiers low-energy -20%; modifiers chips in `PlanChips.tsx` |
| §5 Your Place | Met | `city.json` nap/wfh/eat-groceries/host-friends/subscription-audit |
| §5 LeaseLord | Deferred | rent/move + renewal hikes; renew/dispute and bidding wars → Phase 8 row (§5) |
| §5 JobLink Hub | Deferred | `apply-job` with screening and requirements; networking events → Phase 8 row (§5) |
| §5 UpSkill U | Met | enroll/enroll-loan/study/drop-course; credentials on completion (no separate exam action) |
| §5 Fulfillment | Met | `work-fulfillment`; fulfillment ladder in `jobs.json` |
| §5 Burger Bot | Met | burger-combo, hang-out, work, shop |
| §5 FreshMart | Met | groceries need fridge (`items.json`), ready-meal, prices via price index |
| §5 ThriftUp | Deferred | outfits for every dress tier; random thrift finds → Phase 8 row (§5, ENG-12) |
| §5 Circuit Planet | Met | laptop, headphones, e-scooter, fridge, air fryer, smart lock (`items.json`) |
| §5 NeoBank | Met | deposit/withdraw/borrow/repay over savings, index fund, crypto (MVP scope) |
| §5 GigHub | Met | `gig-shift` at location `*` (§16: "GigHub as an action") |
| FR-30 | Met | board, segments and transportModes in `cities/default/city.json` |
| FR-33 | Met | `content/data/cities/default/` merged into one City (`content/src/index.ts`); name pools come with Phase 9 |
| FR-40 | Met | `jobs.json` fields: wage, level, dressTier, minExperience, requires, aiExposureBp, benefits, remote |
| FR-41 | Met | 20 jobs over 7 ladders (`jobs.json`); pinned in `schemas.test.ts` |
| FR-42 | Met | `pipeline/jobChecks.ts` (base x exposure x news; hoursCut/restructure/layoff with warning); teaser `teaser.layoff` |
| FR-43 | Met | `actions/work.ts` pay per shift + rating; `e2e/first-paycheck.spec.ts` |
| FR-44 | Met | `actions/work.ts` gig: rolled pay, news surge (`gigPayBp`), deactivation, no ladder XP |
| FR-50 | Met | `balance.json` inflation weeklyDriftBp + wageCatchUpBp; `grocery-shock` news |
| FR-51 | Met | `housing.json` 5 tiers with weekly buffs; leaseWeeks + renewalHikeBp; theft cards keyed to cheap housing |
| FR-52 | Met | 5 subs in `subscriptions.json`, weekly charge in `pipeline/bills.ts`, `subscription-audit` action |
| FR-53 | Met (MVP) | savings, index fund, crypto with crash and rug-pull; meme stocks → Phase 8 row |
| FR-54 | Met (MVP) | card, student loan, collections (`pipeline/debts.ts`); BNPL and personal loans → Phase 8 row |
| FR-55 | Met | `balance.json` regimes steady/bull/bear/crash/ai-bubble; `pipeline/market.test.ts` |
| FR-60 | Met | `items.json` + `ai-assistant` sub; fridge gate, air-fryer dinner, smart lock `notItems` on `porch-pirate` |
| FR-70 | Met | 43 weighted, conditioned cards; FR-70 now says ~40 at MVP, 100+ by v1.0 (Phase 8 row) |
| FR-71 | Met | all 7 categories: work 7, money 8, life 7, health 7, housing 6, viral 4, climate 4 |
| FR-72 | Met | 11 news cards with N-week modifiers (`news.json`, `pipeline/news.ts`) |
| FR-74 | Met | `content/src/schemas.ts` + checkContent; `schemas.test.ts` "finds broken event, news, quest ... references" |
| FR-80 | Met | Jones uses `listActions`/`reduce` like humans (`core/reduce.ts`, `ai/utility.ts`) |
| FR-82 | Met | `pipeline/rivalFeed.ts` (own posts + react-* moments); 52 `feed.*` lines |
| FR-83 | Met | persona levers only (best-move rate, runners-up, bottleneck) in `data/ai.json` |
| FR-84 | Met | feed and owner lines committed in `content/locales/en.json`; no LLM client in apps |
| FR-112 | Deferred | relationships are Phase 9 (plan Phase 9 step 7); §16 puts §9 in v1.0 |
| FR-113 | Deferred | Phase 9 step 7 guardrail review |
| FR-114 | Deferred | Phase 9 step 7 (no sensitive events in today's deck; settings toggle comes with Phase 9) |
| FR-115 | Deferred | Phase 9 step 7 |
| §12 Classic | Met | `Setup.tsx` week limit optional; goals race vs Jones/hotseat |
| ENG-01 | Partly | `fx/map.ts`, `FxLayer.tsx`, coin bursts, shake; sound → Phase 8 audio (NFR-05) |
| ENG-02 | Partly | smart defaults Q/W/R, `game/pace.ts`; 60–120 s week needs playtesters (**human-only**) |
| ENG-03 | Met | `fx/Reveal.tsx` REVEAL_MAX_S = 1.5, click skips |
| ENG-10 | Met | `pipeline/teasers.ts` + 11 `teaser.*` lines; `teasers.test.ts` |
| ENG-11 | Met | `quests.json` 13 quests, `balance.json` quests.active 2; `pipeline/quests.test.ts` |
| ENG-12 | Met | weekend deck, viral cards, market regimes; (no random thrift finds, see §5 ThriftUp) |
| ENG-13 | Met | `nearMiss` events (rival.nearMissBp) shown in `WeekSequence.tsx` |
| ENG-14 | Met | rival score rings in `Hud.tsx`; `overtaken` events + feed overtook/fell-behind |
| ENG-20 | Partly | week-1 coach, `e2e/first-paycheck.spec.ts`; under 3 min with new testers needs playtesters (**human-only**) |
| ENG-21 | Met | `game/review.ts` + `Summary.tsx` (timeline, best/worst week, chart, story); unlocks wait for Phase 8 |
| ENG-30 | Met | guardrail review below: no purchases, loot boxes or paid randomness |
| ENG-31 | Met (spec) | game-requirements §13.4 MON-01…07; MVP ships without ads; provider is the owner's call |
| ENG-32 | Met | guardrail review below: no real-time timers or countdowns |
| ENG-33 | Met | guardrail review below: no notification or push code |
| NFR-01 | Met | `art/` assets on board and busts with emotion states; light/dark (`index.css`, board night grade) |
| NFR-02 | Met | portrait/landscape layouts; `e2e/phone-layout.spec.ts` |
| NFR-03 | Met | keys for every row, Shift+letter past 30 rows (`ui/common/hotkeys.test.ts`, stocked NeoBank) |
| NFR-04 | Met | `e2e/a11y.spec.ts` axe WCAG 2.2 A/AA light+dark; `settings.ts` motion/text size; `STAT_ICON` |
| NFR-07 | Met | tone guide (game-requirements Appendix); copy pass recorded in progress.md Phase 5 |
| NFR-10 | Partly | 94 kB gz initial JS (all preloaded chunks); LCP/TTI ≤ 3 s budgets on Lighthouse mobile; `e2e/perf.spec.ts` frame budget; a real 2022 phone not yet tried (**human-only**) |
| NFR-11 | Met | `vite.config.ts` VitePWA precache; Dexie saves (`persistence/saves.ts`) |
| NFR-12 | Met | `rng/streams.ts`; `core/world.test.ts`; replay property test; cross-runtime hash in `e2e/play-a-week.spec.ts` |
| NFR-13 | Met | `store/game.ts` save() after every dispatch and at week end; slots in `saves.test.ts` |
| NFR-14 | Met | no account; nothing sent; opt-in `shareData` setting; About & privacy notice (wording review **human-only**) |
| NFR-15 | Met | values in `balance.json`/`ai.json`/city files; no balance literals found in `packages/engine/src` |

#### ci-cd.md

| ID | Status | Evidence / reason |
|---|---|---|
| CI-01 | Met | `ci.yml` checks: install (cached), `biome ci`, typecheck, content:validate, test, build; push main + dispatch |
| CI-03 | Met | `preview.yml` E2E step against preview URL; `playwright.config.ts` desktop-chromium + mobile-webkit |
| CI-05 | Met | `apps/web/.size-limit.js` counts entry + modulepreloads; Lighthouse budgets incl. LCP/TTI |
| CI-06 | Met | `codeql.yml`; `pnpm audit --audit-level high` in `ci.yml`; secret scanning + push protection on (GitHub API); Dependabot alerts setting not readable through the proxy |
| CI-07 | Met | no ruleset by decision; CI runs on push to main (`ci.yml`) |
| CD-01 | Met | `preview.yml`: label gate, `versions upload --preview-alias pr-<n>`, Pages `--branch pr-<n>`, sticky comment |
| CD-02 | Met | `main.yml`: D1 migrate, Worker `--preview-alias main`, Pages `--branch main`, smoke + smoke E2E, `web-dist-<sha>` |
| CD-03 | Met | `production.yml`: release/dispatch, `environment: production`, downloads `web-dist-<sha>`, no rebuild, runtime `config.json` |
| CD-04 | Met | migrate step before Worker deploy in `main.yml`/`production.yml`; no migrations exist yet (`apps/api/migrations` absent) |
| CD-05 | Met | `rollback.yml`, runbook ci-cd.md §6; rehearsal is the open exit criterion |
| CD-06 | Partly | `smoke.sh` `/`, `/healthz` version; failure issues from `main.yml` and `production.yml`; `/daily` → Phase 7 row |
| OPS-01 | Met | Cloudflare token only in env-scoped jobs (`environment:` preview/production); Sentry/PostHog keys deferred with those tools |
| OPS-02 | Met | every `uses:` pinned to a 40-char SHA; every workflow has top-level `permissions: contents: read` |
| OPS-03 | Met | preview `cancel-in-progress: true`; `production` group shared with `rollback.yml`, never cancelled |

#### tech-stack.md (§4 Saves, §6 Testing Strategy)

| ID | Status | Evidence / reason |
|---|---|---|
| §4 Saves | Met | `engine/src/save/index.ts` SAVE_VERSION + SAVE_MIGRATIONS; Zod `persistence/schema.ts`; `persistence/beta-save.test.ts` with `save-v3-beta.json` |
| §6 Unit | Met | Vitest across engine/content/sim/web (310 tests) |
| §6 Property-based | Met | `economy.properties.test.ts` (money, no softlock), `properties.test.ts` (ranges, replay, preview purity) |
| §6 Content | Met | `content/src/schemas.test.ts` cross-reference tests; `pnpm content:validate` in CI |
| §6 Balance | Met | `packages/sim` KPI bands in `content/sim/kpi-bands.json`; run locally per CI-04 |
| §6 Component | Met | Testing Library on happy-dom: `ui/panels/panels.test.tsx` |
| §6 E2E | Met | `e2e/play-a-week.spec.ts` (week 1, end week, reload, continue) on desktop + mobile projects |
| §6 Accessibility | Met | `e2e/a11y.spec.ts` axe on main screens, light and dark |
| §6 Visual | Met | `e2e/visual.spec.ts` light/dark; baselines from `visual.yml` on CI's runner |
| §6 Performance | Met | Lighthouse CI budgets + `e2e/perf.spec.ts` |
