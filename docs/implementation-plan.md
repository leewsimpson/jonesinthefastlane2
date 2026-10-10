# Implementation Plan — Fast Lane 2026

This plan turns [game-requirements.md](game-requirements.md), [tech-stack.md](tech-stack.md), [ci-cd.md](ci-cd.md),
[simulator.md](simulator.md) and [art-direction.md](art-direction.md) into an ordered build. Requirement IDs refer to those docs.

## Guiding approach

- **Engine first, headless.** The pure, deterministic engine (`packages/engine`) is built and tested without any UI.
  The client is a view over it. This matches tech-stack §2 and means rules can be balanced by simulation before
  anyone draws a screen.
- **Playable end to end early.** Phase 4 produces an ugly but complete MVP loop. Polish comes after the loop is proven fun.
- **Pipeline from day one.** CI, the bundle budget (CI-05) and preview deploys exist before feature code, so they
  never have to be retrofitted.
- **Art runs in parallel.** The art track (§ Art track) only depends on the style anchor, not on code. Code uses
  placeholder shapes until art lands.
- **Content is data.** Every phase that adds a system also adds its Zod schema and content files (NFR-15, FR-74).

### Phase overview

| Phase | Name | Output | Release |
|---|---|---|---|
| 0 | Foundations | Monorepo, tooling, CI, preview deploys, empty app shell | — |
| 1 | Engine core | Deterministic turn loop, time, travel, locations, actions, end-of-week pipeline | — |
| 2 | Economy, jobs & goals | Jobs, AI disruption, housing, banking, debt, items, goals, scoring | — |
| 3 | Jones, events & hooks | AI rival, weekend events, news, teasers, quests, balance sim in CI | — |
| 4 | Playable client | React + Pixi client playing the full MVP loop, saves, hotseat | Internal alpha |
| 5 | Polish & content | Juice, final art, tutorial, run summary, a11y, PWA, full MVP content | Closed beta |
| 6 | MVP hardening & launch | Main/prod pipeline, E2E, perf, playtest balance, IP check | **MVP** |
| 7 | Online: Daily Run | Worker API, replay verification, leaderboard, share card | v1.0 |
| 8 | Depth & retention | Meta-progression, achievements, backgrounds, new locations, side hustles, audio | v1.0 |
| 9 | Life stages & relationships | Ageing, dating, partners, marriage, homes, pets, divorce | **v1.0** |
| 10 | Post-launch | StartupGarage, taxes, seasons, async multiplayer, kids, localisation | Post-launch |

```
Phase 0 ─► 1 ─► 2 ─► 3 ─┬─► 4 ─► 5 ─► 6 (MVP) ─┬─► 7 ─┐
                        │                       ├─► 8 ─┼─► v1.0 ─► 10
Art track: anchor ─► cast ─► locations ─► items/events ─► backdrops   └─► 9 ─┘
```

Phases 7, 8 and 9 are independent of each other and can run in parallel or in any order.

Each phase is built with the `/buildaphase` skill. Each phase's **Notes** hold human-only steps, open questions and gotchas;
`docs/progress.md` records what each finished phase delivered, deferred and changed.

---

## Phase 0 — Foundations

**Goal:** a repo where a trivial change goes from PR → checks → preview URL.

| Task | Refs |
|---|---|
| pnpm workspaces, Node LTS in `.nvmrc`, Corepack | tech-stack §7 |
| Scaffold `apps/web` (Vite + React 19 + Tailwind v4), `apps/api` (Hono Worker stub with `/healthz`), `packages/engine`, `packages/content`, `packages/sim` | tech-stack §3 |
| TypeScript strict, Biome, Vitest, fast-check, shared tsconfig | tech-stack §7 |
| Palette tokens in Tailwind (light/dark), fonts self-hosted (Bricolage Grotesque, Atkinson Hyperlegible Next) | art-direction §2–3 |
| `ci.yml`: install, lint, typecheck, test, build, bundle-size check | CI-01, CI-05 |
| Security: CodeQL, `pnpm audit`, secret scanning, Renovate | CI-06 |
| Branch protection / rulesets on `main`, actions pinned to SHAs, minimal permissions, concurrency groups | CI-07, OPS-02, OPS-03 |
| Cloudflare one-time setup (Pages project, Worker envs, D1/KV per env, scoped tokens) | ci-cd §5, OPS-01 |
| `preview.yml`: Pages preview + Worker preview alias per PR, sticky comment with URL | CD-01 |
| Runtime config (`/config.json` or hostname) so the web build has no baked-in env values | CD-03 |

**Exit criteria**
- A PR shows green checks and a working preview URL within 8 minutes.
- Initial bundle size is reported and enforced against 300 KB gz.

**Notes**
- **Human-only:** Cloudflare account and resources, scoped API tokens, GitHub Environments and secrets, rulesets, secret scanning / push protection / Dependabot alerts. Collect these first; the exit criterion can't pass without them.
- Pin action SHAs by looking them up, never from memory.
- Verify the size check by lowering the budget and watching it fail.

---

## Phase 1 — Engine core

**Goal:** a headless game where players can move, act and end weeks, deterministically.

| Task | Refs |
|---|---|
| Game state model + `reduce(state, action) → { state, events[] }`. No `Math.random`, `Date.now` or DOM | NFR-12, tech-stack §2 |
| Seeded PRNG stored in state, with named streams split from the run seed (engine-design §6) | NFR-12 |
| Turn & round model: weekly Time budget (60 h), Energy, turn order, rounds for hotseat | FR-01, FR-05a, FR-06 |
| Board + travel: data-driven location loop, travel cost by distance and transport mode | FR-02, FR-30 |
| Action framework: legal-action listing, **side-effect-free previews** (time, money, stat effects, modifiers like "−20% low energy") | FR-03, FR-21 |
| End Week + leftover-time rest bonus | FR-04 |
| End-of-week pipeline as ordered, pluggable steps (per-player steps, then per-round steps). Initially stubs | FR-05 |
| Core stats with ranges and clamping: Cash, Time, Energy, Health, Happiness, Social, Hunger, Wardrobe, Credit Score | FR-20 |
| Food check (Hunger penalty), basic eat actions | §4 |
| `packages/content` Zod schemas for locations, actions and balance constants; build fails on invalid content | FR-74, NFR-15 |
| Save format: versioned schema + migration hook (serialise state + action log) | tech-stack §4 |
| Tests: unit tests per rule; property tests for "stats stay in range", "replay(seed, actions) is stable", "preview never consumes RNG" | tech-stack §6 |
| Sim skeleton: `packages/sim` runner, `random` + `idle` policies, `GameRecord`; engine API per engine-design §3 | simulator §2, §10 |

**Exit criteria**
- A Node script plays 52 weeks of random legal actions with no crash, and replaying the log gives an identical state hash.

**Notes**
- Enforce engine purity mechanically: a lint rule or test that fails on `Math.random`, `Date.now`, `new Date`, `window` or `document` in `packages/engine`.
- Define the state hash (canonical JSON → hash) now; the sim and Daily Run replay verification reuse it.
- Deriving one RNG stream must not consume another stream's state. Test it.
- The exit-criterion script is the first sim run (`random` policy), so CI can run it.

---

## Phase 2 — Economy, jobs & goals

**Goal:** all MVP systems that make money move, plus a way to win.

| Area | Tasks | Refs |
|---|---|---|
| Jobs | Job schema (wage, level, requirements, dress tier, experience, AI Exposure, benefits, remote); apply/hire; shifts pay at end of shift; experience; career ladders and promotions | FR-40, FR-41, FR-43 |
| AI disruption | Weekly roll = base rate × exposure × news modifiers → hours cut / restructure / layoff, with warning teaser; AI-tools skill lowers exposure | FR-42 |
| Gig work | GigHub anywhere, variable surge pay, deactivation risk, no ladder XP | FR-44 |
| Education | UpSkill U: enrol, study hours, credentials, skill tracks with diminishing returns, student loans | §5, §3 Skills |
| Housing | 5 housing tiers, LeaseLord rent/move/renew, deposits, credit checks, rent hikes on renewal, eviction → Parents' Basement | FR-51, FR-14 |
| City profile | Prices, wages, rents and board layout load from one city profile (`content/cities/<id>/`) | FR-33 |
| Inflation | Weekly price-index drift on the `world` stream, wage lag | FR-50 |
| Subscriptions | Weekly auto-charge, buffs, Subscription Audit action | FR-52 |
| Banking | Savings APY, index fund, crypto (with rug-pull events); market random walk with regimes | FR-53, FR-55 |
| Debt | Credit card (APR, minimum payment), student loan; credit score effects; collections | FR-54, FR-14 |
| Items & shops | FreshMart, ThriftUp, Circuit Planet, Burger Bot; ~15 MVP items with buffs and resale value | FR-60, §5 |
| Social (MVP) | *Hang out* at Burger Bot, *Host friends* at Your Place | §16 MVP |
| Goals | Wealth (net worth, items at resale value), Wellbeing (MVP: Happiness/Health/Social with low-part penalty), Skills, Career (level × stability + reputation bonus); difficulty presets + custom targets | §3, FR-10, FR-13 |
| Win/score | Round-end win check with overshoot tiebreak; score formula (shared with Daily Run) | FR-11, FR-12 |
| No-softlock | Property test: from any reachable state there is at least one money-earning action | FR-14 |
| Sim bots | Utility scorer in the engine (shared with Jones), `balanced` + single-goal personas as content, override files | simulator §3, §7 |

**Exit criteria**
- A scripted "sensible" strategy can win a Standard game; property tests for money conservation and no-softlock pass.
- All ~20 MVP jobs and ~15 items exist as validated content (placeholder copy is fine).

**Notes**
- Largest phase: consider one PR per area row.
- Agree a precise definition of "money conservation" with the user before writing the property test (e.g. every cash change goes through a ledger with a named source or sink).
- Placeholder job and item copy is fine; the local LLM can draft it.
- The scripted "sensible" strategy is a test, not a manual run.

---

## Phase 3 — Jones, events & hooks

**Goal:** the opponent and the "one more week" machinery, plus automated balancing.

| Task | Refs |
|---|---|
| Jones utility AI over legal actions, same rules as humans; difficulty = how often it picks the best move | FR-80, FR-83 |
| Jones highlight-reel feed: event → templated smug post; reactions to player milestones. Line variants are LLM-written during development, reviewed and committed | FR-82, FR-84 |
| Weekend event deck: weighted, condition-filtered, 2–3 choices, effects as data; ~40 MVP events across FR-71 categories | FR-70, FR-71, FR-74 |
| News ticker: global modifiers for N weeks on the `world` stream; ~10 MVP news events | FR-72 |
| Next-week teasers generated from pending state (lease renewal, layoff warning, trending post) | ENG-10 |
| Micro-goals/quests: 1–3 active, rewards | ENG-11 |
| Near-miss and rival-progress data exposed as engine events | ENG-13, ENG-14 |
| `packages/sim`: Jones personas, worker pool, MVP KPIs with bands in content, `sim compare` against the merge base, Markdown summary, throughput benchmark | simulator §5, §7, §8 |
| CI-04: 2k games on `main` (and manual dispatch) with KPI bands, table in the job summary; content cross-reference test (all event IDs resolve) | CI-04 |

**Exit criteria**
- A full game (human-scripted vs Jones) runs headless with events, news and teasers.
- Balance sim runs in CI under the 8-minute budget and has initial KPI bands.

**Notes**
- Decided with the user: Claude writes Jones's lines and the event, news and teaser copy during development; the
  user reviews them in the PR diff (FR-84).
- Record the initial KPI bands and the runs they came from in `docs/progress.md`.
- Check the bots before trusting their numbers: if `balanced` loses to `random` or has high regret, the bot is broken, not the game.

---

## Phase 4 — Playable client (internal alpha)

**Goal:** the full MVP loop playable in a browser with placeholder art.

| Task | Refs |
|---|---|
| Zustand store wrapping the engine: `dispatch(action)`, selectors, domain-event queue for the UI | tech-stack §2 |
| Screen states: title → new game setup (goals, difficulty, players) → game → summary | §16, FR-10 |
| Pixi board (`@pixi/react`): code-drawn ring road and pads from palette tokens, placeholder buildings, player tokens with colour + shape | art-direction §4, NFR-04 |
| Token movement along the loop with travel-time display | FR-02 |
| HUD: compact stats, Time and Energy bars, four goal rings, Jones progress; tap for detail | FR-13, FR-20, ENG-14 |
| Location panels (Radix dialogs): action list with previews, job board, shops, NeoBank, LeaseLord | FR-03 |
| End-of-week sequence UI: event card with choices (only when there is one), then one recap page: Jones's feed first, goal progress, bills and stat changes, news (only when there is any), teaser; the Next / Start-week button stays pinned in place | FR-05, ENG-10 |
| Hotseat: player handoff screen | FR-06 |
| Persistence: Dexie save slots, autosave after every action and week end | NFR-13 |
| Responsive layouts: portrait (board top, action sheet bottom), landscape (board centre, side panels) | NFR-02 |
| Keyboard shortcuts for all actions, focus management | NFR-03 |
| i18n plumbing (`i18next`) from the start; all strings in resources | NFR-06 |
| Lazy-load NeoBank charts, summary screen and non-critical libs | NFR-10 |
| First Playwright test: start → play a week → save/reload | CI-03 |
| Sim decision traces, `sim trace`, client debug route that replays a sim game on the board, HTML report | simulator §4, §8 |

**Exit criteria**
- The team can play a full game vs Jones on desktop and phone; saves survive a reload.
- Bundle stays under budget; E2E runs against the PR preview.

**Notes**
- Use placeholder shapes unless art track A2/A3 have landed (check `art/`).
- Verify in a real browser at phone portrait and desktop landscape: play at least one week and a save/reload.
- **Human-only:** the full game vs Jones in the exit criterion is played by the user.
- Weekend-event choices arrive as a pending `Decision` whose `plans` hold each option's preview; the card's copy is
  `event.<id>`, `event.<id>.text` and `event.<id>.<choice>` (engine-design §11, §13).
- Jones's posts carry a moment and slot values (`rivalPost`); the UI picks one of the `feed.<moment>.<n>` lines.
  Teasers, standings, overtakes and near misses are domain events too; show at least the first teaser each week.

---

## Phase 5 — Polish & content (closed beta)

**Goal:** the MVP feels good, looks finished and teaches itself.

| Task | Refs |
|---|---|
| Event → presentation mapping in `src/fx`: number pop-ups, coin bursts (Pixi `ParticleContainer`), counter springs, screen shake | ENG-01 |
| Reveal animations (≤1.5 s, skippable) for event cards, market moves, promotions | ENG-03 |
| Paper-puppet motion: idle bob, squash on arrival, emotion swaps; all respect reduced motion | art-direction §4 |
| Integrate final art from the art track: key-sprite script, WebP export, spritesheet packing | art-direction §6 |
| Dark theme: board colour-matrix tint, lit windows | art-direction §4 |
| Tutorial woven into week 1: first job + first paycheck in under 3 minutes | ENG-20, FR-43 |
| Run summary: timeline, best/worst week, net-worth chart, "your 2026 in review" | ENG-21 |
| Turn-pacing pass: one-tap smart defaults ("Work full shift"); measure 60–120 s weeks | ENG-02 |
| Copy pass with tone guide; NPC flavour lines where cheap | NFR-07 |
| Accessibility pass: WCAG 2.2 AA contrast, colour + icon stats, scalable text, screen-reader labels, reduced-motion setting | NFR-04 |
| PWA: offline after first load, install prompt | NFR-11 |
| Content fill to MVP counts: ~20 jobs, ~15 items, ~40 events, ~10 news | §16 |
| Sim choice assessment (no-brainers, traps, dead content), `sim sweep`, scenario starts; use them to tune the content fill | simulator §6, §7 |
| Opt-in analytics (PostHog, lazy) and Sentry (lazy, seed + action log attached) | NFR-14, NFR-16 |

**Exit criteria**
- New testers reach the first paycheck in under 3 minutes without help.
- Lighthouse performance and accessibility budgets pass on the preview URL.

**Notes**
- Final art needs art track A2–A5; generate missing assets with the `codex-image` skill and confirm batch sizes with the user first (quota cost).
- **Human-only:** the first-paycheck exit criterion needs real testers. Instrument time-to-first-paycheck so their runs report it.
- Fix every no-brainer, trap and dead choice that `sim assess` reports, or record why it stays.
- Phase 3 left soft-band misses for this balance pass (`docs/progress.md`, Phase 3): Standard is won too early and
  Standard Jones is too weak, Career is the critical path so `careerist` wins most games, `balanced` almost never
  hits a setback, and `casual` struggles on Chill. Tune through content (targets, wages, event pressure) and
  re-run `pnpm sim run --base` to see each change.
- Still to add to the sim: luck share, week of first goal milestone (simulator §5), `assess`, `sweep`, `trace`, plus
  Phase 4's deferred decision traces, the client debug route that replays a sim game on the board, and the HTML
  report (simulator §4, §8). The client can already replay a save: `engine.replay(setup, log)` gives the state, and
  the board draws any `GameState`.
- The client shows what Phase 4 built as plain readouts: the ticker under the action sheet and the week wrap-up
  pages are where number pop-ups, coin bursts and reveals plug in (ENG-01, ENG-03). Domain events reach the UI in
  `store/game.ts` (`lastEvents`, `report.events`).
- UI copy lives in `apps/web/src/i18n/ui.en.json`; game copy stays in `packages/content/locales/en.json`. Event
  category names are UI copy for now (`category.<id>`).
- Jones's feed posts about milestones only; a moment for a good weekend event (a viral post) fits the copy pass.
- Done 2026-10-07 (`docs/progress.md`): client polish, then the sim tooling, content, copy and balance pass. The
  first-paycheck tester criterion moved to Phase 6's playtest rounds.

---

## Phase 6 — MVP hardening & launch

**Goal:** a shippable, operable MVP.

| Task | Refs |
|---|---|
| `main.yml`: deploy on merge to `main` to the preview env's `main` alias, D1 migrations first, smoke E2E; upload `web-dist-<sha>` artifact | CD-02, CD-04 |
| `production.yml`: release-triggered, approval gate, promote the `main` artifact (no rebuild), smoke test | CD-03, CD-06 |
| `rollback.yml` + runbook | CD-05 |
| Security headers (CSP, HSTS) via `_headers`, SPA fallback (Pages default, no `_redirects`); Cloudflare Web Analytics | ci-cd §5 |
| Full E2E matrix (Chromium + mobile WebKit), visual snapshots light/dark | CI-03, tech-stack §6 |
| Performance on a mid-range 2022 phone: 60 fps board, ≤3 s first load on 4G | NFR-10 |
| Playtest rounds → balance tuning through content data only; tighten sim KPI bands; nightly `optimizer` exploit search | NFR-15, CI-04, simulator §3 |
| Save migration test: a save from the beta loads in the release build | tech-stack §4 |
| **IP check:** rename "Hi-Tech U" art/IDs to the final name (requirements already say "UpSkill U Online"); legal review of title and names | README, art-direction §9.1 |
| Privacy notice, consent flow, "about real financial help" credits link | NFR-14, ENG-35 |
| Monetization spec: rewarded-video rewards, caps, excluded modes, ad provider and consent | ENG-31 |
| Ethical guardrail review against ENG-30…33 | §13.3 |
| Progressive unlock of home extras: `unlockWeek` on actions and subscriptions (engine gate `NOT_UNLOCKED`, data in `city.json`/`subscriptions.json`); the UI hides locked rows. Prices step in 5 cents so inflation never shows a stray cent | FR-15, FR-50 |

**Exit criteria**
- Production deploy and rollback both rehearsed (rollback first on the preview env's `main` alias).
- All **M** requirements in game-requirements, ci-cd and tech-stack are met or explicitly deferred with a reason.

**Notes**
- Put the **M** requirement audit table in `docs/progress.md`.
- **Human-only:** production reviewers, playtest rounds, legal/IP review, privacy notice wording, ad provider choice.
- Record the staging rehearsal run links as evidence for the deploy and rollback exit criterion.
- The save migration test needs a real beta save: capture one from the Phase 5 build before changing the schema.
- Built early, in the Phase 5 branch (user decision: deploy to production now): `main.yml`, `production.yml`,
  `rollback.yml`, the runbook (ci-cd.md §6) and `_headers`. Left from those rows: the deploy and rollback rehearsal,
  and Cloudflare Web Analytics (**human-only**: turn it on in the dashboard; the CSP already allows its beacon).
- Phase 5 left for the playtest rounds: first paycheck in under 3 minutes with new testers (ENG-20), hardship (the
  bots dodge every setback), the one-goal persona and gambler bands, and the overlap between `balanced`'s band and
  Standard Jones's (`docs/progress.md`, Phase 5). Weekend choices are mostly flat in `sim assess`: decide with
  playtesters whether they should bite harder.
- Built 2026-10-08 (`docs/progress.md`, Phase 6): save fixture test, `upskill-u` rename, About & privacy with
  consent and help links, monetization spec (§13.4), visual snapshots (`visual.yml`), NFR-10 budgets, `optimizer`
  and `nightly.yml`, the M audit. Open: the deploy and rollback rehearsal and every human-only step above.
- `sim optimize` found the utility scorer short-sighted in weeks 1–6 (optimizer 19/20 vs `balanced` 8/20 on the same
  seeds): consider a longer early horizon in `ai.json` during playtest tuning, then re-check Jones's bands.

---

## Phase 7 — Online: Daily Run (v1.0)

| Task | Refs |
|---|---|
| Worker API (Hono): `GET /daily` (seed + modifiers in KV), `POST /runs` (replay verification with the shared engine), `GET /leaderboard/:date`, `GET /share/:runId.png` | tech-stack §5 |
| D1 schema + migrations (expand/migrate/contract) | CD-04 |
| Daily Run mode: 26-week limit, score, same world stream for all players | §12, NFR-12 |
| Wordle-style share card + "beat my score" links; OG image rendering (satori + resvg-wasm) | ENG-17 |
| Anonymous device ID; rate limiting / WAF on `POST /runs` | tech-stack §5 |
| Gentle streaks with freezes | ENG-18 |
| Sentry releases + private source maps | CD-08 |
| Add `/daily` to the smoke test once the endpoint exists | CD-06 |
| Release automation (release-please or Changesets) | CD-07 |

**Notes**
- Include the engine and content version in each run submission and reject mismatches, so replay uses the exact rules the client ran.
- **Human-only:** WAF rate-limit rules, Sentry project and auth token.

## Phase 8 — Depth & retention (v1.0)

| Task | Refs |
|---|---|
| Career Mode meta-progression: XP, unlocks (backgrounds, perks, cosmetics, rivals, event packs) | ENG-15, §12 |
| Character backgrounds with different starting stats and debt | FR-22 |
| Achievements (50+) | ENG-16 |
| Jones personalities: Grinder, Crypto, Wellness, Influencer (+ art variants) | FR-81 |
| New locations: Pulse Gym & Clinic, The Daily Grind, CreatorLab Studio, ResaleIt; NPC owners and dialogue | §5, FR-32 |
| Side hustles, event chains, scam job offers, theft/scams, remote jobs, item breakage/resale | FR-45, FR-73, FR-47, FR-57, FR-46, FR-61 |
| Audio: Howler, lo-fi adaptive soundtrack, SFX, volume sliders | NFR-05 |
| Session reminder; opt-in "Daily Run is ready" notification (max one per day) | ENG-34, ENG-33 |
| Nightly workflow: `nightly.yml` exists (Phase 6, manual dispatch); schedule it, raise to 10k games | OPS-04 |
| Rewarded video for credits, per the monetization spec; ad consent | ENG-31, MON-01…07 |
| Grow the event deck towards 100+ (event packs are an unlock) | FR-70 |
| Location actions the MVP left out: LeaseLord renew / dispute a hike and bidding wars, JobLink networking events, ThriftUp's random thrift finds | §5, ENG-12 |
| Car transport mode (needs a car item, running costs) | FR-02 |
| Reputation/Clout as a simulated stat (with CreatorLab) | FR-20 |
| Meme stocks, BNPL and personal loans | FR-53, FR-54 |

**Notes**
- Many small features: one PR per row is reasonable.
- **Ask the user** where audio comes from.
- Test the notification caps (ENG-33, ENG-34).

## Phase 9 — Life stages & relationships (v1.0)

Build in this order, since each step depends on the one before:

1. **Age & game length:** age, Sprint/Standard/Long Life settings, turn-length factor for recurring values, life stages (FR-90…92).
2. **Relationship model:** status machine, partner NPC generator (name pools, traits, wants, hidden compatibility), relationship meter, inclusive terms (FR-93…97).
3. **Meeting & actions:** dating apps, meet-cute events, date night, gifts, trips, deep talk (FR-95, FR-98).
4. **Milestones:** moving in, engagement, Vows & Venues weddings, marriage with joint/separate finances, buying a home with a mortgage, pets (§9.3).
5. **Pressure & endings:** requests/ultimatums, breakups, separation risk, divorce settlement, recovery arc (FR-99…104).
6. **Integration:** Relationships part of Wellbeing (friends or pets count), relationship event decks, partner job simulation, Jones's love life, life timeline in the run summary (FR-106, FR-108…111).
7. **Guardrail review:** content rating, no "correct" path, sensitive-event exclusions and settings toggle (FR-112…115).

**Notes**
- Each step is its own PR, merged before the next starts.
- Step 7: present guardrail findings to the user; the content rating is their call.

## Phase 10 — Post-launch backlog

StartupGarage, Civic Center and taxes, seasonal scenarios, opening hours, async online multiplayer (Durable Objects),
home decoration and collections, localisation beyond English, kids and parenting stages, daycare, custody, ageing
parents, prenups, optional "Family & Love" goal, PR preview cleanup (CD-09). Prioritise from telemetry and player feedback.

**Notes**
- Not built as one phase: pick one item, using telemetry and player feedback, and build it as the phase scope.

---

## Art track (runs alongside Phases 0–5)

Follows art-direction §7. Each step needs review against the §8 checklist before the next batch.

| Step | Assets | Needed by |
|---|---|---|
| A1 | Style anchor (player + Jones + Burger Bot + 3 items) — iterate until approved | Before any other art |
| A2 | Cast: 6 player avatars + Jones, full body + emotion sheets | Phase 4 (tokens) |
| A3 | MVP locations (15 buildings incl. 5 housing tiers) | Phase 4 |
| A4 | Items + outfits (12), event category cards (7) | Phase 5 |
| A5 | Backdrop + 5 Your Place interiors | Phase 5 |
| A6 | Sprite pipeline script (`pnpm sprites`: key, WebP, spritesheet pack) | Before A2 lands in code |
| v1.0 | NPC owner busts, Jones variants, new location buildings | Phase 8 |

~55 images for the MVP plus retries; confirm batch sizes before generating (quota cost per image).

---

## Decisions (from game-requirements §17)

| Question | Decision | Impact |
|---|---|---|
| Setting | One fictional city; city-specific data in a city profile (FR-33) | Phase 2: prices, wages, rents and board layout load from `content/cities/<id>/`, not one global table |
| Jones and NPC dialogue | LLM-generated during development, reviewed, committed as content (FR-84) | Phase 3: generate and review the line variants as a content task; no generation pipeline in the build |
| Monetization | Opt-in rewarded video for extra credits; details TBD (ENG-31) | Phase 6: design reward rules, ad SDK vs. PWA/offline and bundle budget, guardrail review |
| Long Life as Career Mode default | Yes | Phase 8/9: meta-progression pacing assumes monthly turns |
| Partners as co-op characters | No, partners are NPCs only | Phase 9: no change to the hotseat model |

Art style (open question 2): flat vector (art-direction §1).

## Risks

| Risk | Mitigation |
|---|---|
| Bundle budget (300 KB) squeezed by React + Pixi + Motion | Enforced from Phase 0; lazy-load everything non-critical; `zod/mini` in client |
| Game isn't fun once the systems are in | Phase 4 alpha is deliberately ugly so fun is tested early; tune through data, not code |
| Balance sim too slow for the 8-minute PR budget | Smaller PR game count, full runs nightly; keep the engine allocation-light. More sim risks in simulator §11 |
| Image generation style drift | Style anchor attached to every prompt; acceptance checklist; prompts saved next to images |
| Determinism bugs break Daily Run verification | Replay-stability property tests from Phase 1; state hash checked in CI |
| IP exposure from original names | Original names only; rename Hi-Tech U art IDs; legal check before public launch |
