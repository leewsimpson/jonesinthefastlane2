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
