# Implementation Plan — Fast Lane 2026

This plan turns [game-requirements.md](game-requirements.md), [tech-stack.md](tech-stack.md), [ci-cd.md](ci-cd.md) and
[art-direction.md](art-direction.md) into an ordered build. Requirement IDs refer to those docs.

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
| 6 | MVP hardening & launch | Staging/prod pipeline, E2E, perf, playtest balance, IP check | **MVP** |
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

---

## Phase 0 — Foundations

**Goal:** a repo where a trivial change goes from PR → checks → preview URL.

| Task | Refs |
|---|---|
| `git init`, pnpm workspaces, Node LTS in `.nvmrc`, Corepack | tech-stack §7 |
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

---

## Phase 1 — Engine core

**Goal:** a headless game where players can move, act and end weeks, deterministically.

| Task | Refs |
|---|---|
| Game state model + `reduce(state, action) → { state, events[] }`. No `Math.random`, `Date.now` or DOM | NFR-12, tech-stack §2 |
| Seeded PRNG stored in state, with named streams (`world`, `events`, `ai`, `gig`…) split from the run seed | NFR-12 |
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

**Exit criteria**
- A Node script plays 52 weeks of random legal actions with no crash, and replaying the log gives an identical state hash.

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
| Inflation | Weekly price-index drift on the `world` stream, wage lag | FR-50 |
| Subscriptions | Weekly auto-charge, buffs, Subscription Audit action | FR-52 |
| Banking | Savings APY, index fund, crypto (with rug-pull events); market random walk with regimes | FR-53, FR-55 |
| Debt | Credit card (APR, minimum payment), student loan; credit score effects; collections | FR-54, FR-14 |
| Items & shops | FreshMart, ThriftUp, Circuit Planet, Burger Bot; ~15 MVP items with buffs and resale value | FR-60, §5 |
| Social (MVP) | *Hang out* at Burger Bot, *Host friends* at Your Place | §16 MVP |
| Goals | Wealth (net worth, items at resale value), Wellbeing (MVP: Happiness/Health/Social with low-part penalty), Skills, Career (level × stability + reputation bonus); difficulty presets + custom targets | §3, FR-10, FR-13 |
| Win/score | Round-end win check with overshoot tiebreak; score formula (shared with Daily Run) | FR-11, FR-12 |
| No-softlock | Property test: from any reachable state there is at least one money-earning action | FR-14 |

**Exit criteria**
- A scripted "sensible" strategy can win a Standard game; property tests for money conservation and no-softlock pass.
- All ~20 MVP jobs and ~15 items exist as validated content (placeholder copy is fine).

---

## Phase 3 — Jones, events & hooks

**Goal:** the opponent and the "one more week" machinery, plus automated balancing.

| Task | Refs |
|---|---|
| Jones utility AI over legal actions, same rules as humans; difficulty = how often it picks the best move | FR-80, FR-83 |
| Jones highlight-reel feed: event → templated smug post; reactions to player milestones | FR-82 |
| Weekend event deck: weighted, condition-filtered, 2–3 choices, effects as data; ~40 MVP events across FR-71 categories | FR-70, FR-71, FR-74 |
| News ticker: global modifiers for N weeks on the `world` stream; ~10 MVP news events | FR-72 |
| Next-week teasers generated from pending state (lease renewal, layoff warning, trending post) | ENG-10 |
| Micro-goals/quests: 1–3 active, rewards | ENG-11 |
| Near-miss and rival-progress data exposed as engine events | ENG-13, ENG-14 |
| `packages/sim`: headless AI-vs-AI batch runner, KPI report (win rate, game length, goal mix, bankruptcy rate) | tech-stack §6 |
| CI-04: 2k games per PR with KPI bands, PR comment table; content cross-reference test (all event IDs resolve) | CI-04 |

**Exit criteria**
- A full game (human-scripted vs Jones) runs headless with events, news and teasers.
- Balance sim runs in CI under the 8-minute budget and has initial KPI bands.

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
| End-of-week sequence UI: bills → event card with choices → news → goal progress → Jones recap → teaser | FR-05, ENG-10 |
| Hotseat: player handoff screen | FR-06 |
| Persistence: Dexie save slots, autosave after every action and week end | NFR-13 |
| Responsive layouts: portrait (board top, action sheet bottom), landscape (board centre, side panels) | NFR-02 |
| Keyboard shortcuts for all actions, focus management | NFR-03 |
| i18n plumbing (`i18next`) from the start; all strings in resources | NFR-06 |
| Lazy-load NeoBank charts, summary screen and non-critical libs | NFR-10 |
| First Playwright test: start → play a week → save/reload | CI-03 |

**Exit criteria**
- The team can play a full game vs Jones on desktop and phone; saves survive a reload.
- Bundle stays under budget; E2E runs against the PR preview.

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
| Opt-in analytics (PostHog, lazy) and Sentry (lazy, seed + action log attached) | NFR-14, NFR-16 |

**Exit criteria**
- New testers reach the first paycheck in under 3 minutes without help.
- Lighthouse performance and accessibility budgets pass on the preview URL.

---

## Phase 6 — MVP hardening & launch

**Goal:** a shippable, operable MVP.

| Task | Refs |
|---|---|
| `staging.yml`: deploy on merge to `main`, D1 migrations first, smoke E2E; upload `web-dist-<sha>` artifact | CD-02, CD-04 |
| `production.yml`: release-triggered, approval gate, promote the staging artifact (no rebuild), smoke test | CD-03, CD-06 |
| `rollback.yml` + runbook | CD-05 |
| Security headers (CSP, HSTS) via `_headers`, SPA fallback via `_redirects`; Cloudflare Web Analytics | ci-cd §5 |
| Full E2E matrix (Chromium + mobile WebKit), visual snapshots light/dark | CI-03, tech-stack §6 |
| Performance on a mid-range 2022 phone: 60 fps board, ≤3 s first load on 4G | NFR-10 |
| Playtest rounds → balance tuning through content data only; tighten sim KPI bands | NFR-15, CI-04 |
| Save migration test: a save from the beta loads in the release build | tech-stack §4 |
| **IP check:** rename "Hi-Tech U" art/IDs to the final name (requirements already say "UpSkill U Online"); legal review of title and names | README, art-direction §9.1 |
| Privacy notice, consent flow, "about real financial help" credits link | NFR-14, ENG-35 |
| Ethical guardrail review against ENG-30…33 | §13.3 |

**Exit criteria**
- Production deploy and rollback both rehearsed on staging.
- All **M** requirements in game-requirements, ci-cd and tech-stack are met or explicitly deferred with a reason.

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
| Release automation (release-please or Changesets) | CD-07 |

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
| Nightly workflow: 10k-game sim, full E2E, audit | OPS-04 |

## Phase 9 — Life stages & relationships (v1.0)

Build in this order, since each step depends on the one before:

1. **Age & game length:** age, Sprint/Standard/Long Life settings, turn-length factor for recurring values, life stages (FR-90…92).
2. **Relationship model:** status machine, partner NPC generator (name pools, traits, wants, hidden compatibility), relationship meter, inclusive terms (FR-93…97).
3. **Meeting & actions:** dating apps, meet-cute events, date night, gifts, trips, deep talk (FR-95, FR-98).
4. **Milestones:** moving in, engagement, Vows & Venues weddings, marriage with joint/separate finances, buying a home with a mortgage, pets (§9.3).
5. **Pressure & endings:** requests/ultimatums, breakups, separation risk, divorce settlement, recovery arc (FR-99…104).
6. **Integration:** Relationships part of Wellbeing (friends or pets count), relationship event decks, partner job simulation, Jones's love life, life timeline in the run summary (FR-106, FR-108…111).
7. **Guardrail review:** content rating, no "correct" path, sensitive-event exclusions and settings toggle (FR-112…115).

## Phase 10 — Post-launch backlog

StartupGarage, Civic Center and taxes, seasonal scenarios, opening hours, async online multiplayer (Durable Objects),
home decoration and collections, localisation beyond English, kids and parenting stages, daycare, custody, ageing
parents, prenups, optional "Family & Love" goal, PR preview cleanup (CD-09). Prioritise from telemetry and player feedback.

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
| A6 | Sprite pipeline script (`key-sprites`, WebP, spritesheet pack) | Before A2 lands in code |
| v1.0 | NPC owner busts, Jones variants, new location buildings | Phase 8 |

~55 images for the MVP plus retries; confirm batch sizes before generating (quota cost per image).

---

## Decisions needed (from game-requirements §17)

| Question | Needed by | Why |
|---|---|---|
| Setting: fictional city vs. selectable cost-of-living profiles | Phase 2 | Shapes balance data structure (one price table vs. several) |
| Jones dialogue: hand-written only vs. LLM-generated at build time | Phase 3 | Affects content pipeline for the feed |
| Monetization model | Phase 6 | Affects store/PWA packaging and the guardrails review |
| Long Life as default for Career Mode | Phase 8/9 | Affects meta-progression pacing |
| Partners as co-op characters in hotseat | Phase 9 | Large scope change to the relationship model |

Art style (open question 2) is already settled: flat vector (art-direction §1).

## Risks

| Risk | Mitigation |
|---|---|
| Bundle budget (300 KB) squeezed by React + Pixi + Motion | Enforced from Phase 0; lazy-load everything non-critical; `zod/mini` in client |
| Game isn't fun once the systems are in | Phase 4 alpha is deliberately ugly so fun is tested early; tune through data, not code |
| Balance sim too slow for the 8-minute PR budget | Smaller PR game count, full runs nightly; keep the engine allocation-light |
| Image generation style drift | Style anchor attached to every prompt; acceptance checklist; prompts saved next to images |
| Determinism bugs break Daily Run verification | Replay-stability property tests from Phase 1; state hash checked in CI |
| IP exposure from original names | Original names only; rename Hi-Tech U art IDs; legal check before public launch |
