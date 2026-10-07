# Tech Stack — Fast Lane 2026

## 1. Summary

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** (strict) | One language for engine, UI and backend. Type-safe content data |
| Build/dev | **Vite** | Fast HMR, simple config, great PWA plugin |
| Package mgmt | **pnpm workspaces** (monorepo) | Shared engine package across web + API |
| UI (menus, panels, HUD) | **React 19** | Most of the game is UI-heavy (shops, stats, dialogs) and React handles that well |
| Board rendering & animation | **PixiJS v8** via `@pixi/react` | WebGL/WebGPU 2D renderer for the city board, characters and particles at 60 fps |
| Styling | **Tailwind CSS v4** | Fast, consistent theming (light/dark tokens) |
| UI animation | **Motion** (formerly Framer Motion) | Panel transitions, number tickers, spring "juice" |
| State | **Zustand** wrapping a pure game engine | Small, fast, works with React and outside it |
| Validation | **Zod** | Schemas for all content files and save files |
| Audio | **Howler.js** | Cross-browser audio sprites, mobile unlock handling |
| Local persistence | **IndexedDB via Dexie** | Save slots, settings, meta-progression |
| Offline/install | **vite-plugin-pwa** (Workbox) | NFR-11 offline play |
| Backend (v1.0) | **Cloudflare Workers + D1 + KV** | Daily seeds, leaderboards, share links. The edge runs the same TS engine |
| Hosting | **Cloudflare Pages** (static) + Workers | Global CDN, cheap, same platform as the API |
| CI/CD | **GitHub Actions** → Cloudflare | See [ci-cd.md](ci-cd.md) |
| Testing | **Vitest**, **fast-check**, **Playwright** | Unit, property-based simulation and E2E tests |
| Lint/format | **Biome** | A single fast tool for lint + format |
| Analytics | **PostHog** (opt-in, EU hosting option) | Funnels, balance telemetry, feature flags for A/B tuning. Loaded only after consent, outside the initial bundle |
| Errors | **Sentry** | Crash reporting with seed + action log attached. Lazy-loaded so it stays out of the initial bundle |

> **Bundle budget (NFR-10, 300 KB gz):** React + Pixi + Motion use up most of the budget. Keep PostHog, Sentry, Howler, charts and
> the NeoBank/summary screens out of the initial chunk (dynamic `import()`), and use Zod's tree-shakable `zod/mini` in the client.
> CI-05 enforces this from the first PR, so the budget never has to be won back later.

> Use the latest stable versions at project start, and pin them in `pnpm-lock.yaml`. Renovate keeps them current.

### Why not Phaser / Godot / Unity?
- **Phaser 4** is a solid alternative, but this game is about 70% UI (shops, menus, finance screens) and only about 30%
  board animation. React handles the UI better, and Pixi is the leanest renderer for the board.
- **Godot/Unity web exports** have large bundles (10–40 MB), slow first loads, and weaker DOM accessibility (fails NFR-04, NFR-10).

---

## 2. Architecture

```
┌──────────────────────────── apps/web (browser) ────────────────────────────┐
│  React UI (HUD, panels, dialogs)     PixiJS Board (city, tokens, FX)       │
│              │                                  │                          │
│              └──────── Zustand store (view state, selectors) ──────────────┤
│                                   │ dispatch(action)                       │
│              ┌────────────────────▼─────────────────────┐                  │
│              │  packages/engine  (pure TS, no DOM)      │                  │
│              │  state' = reduce(state, action, rng)     │◄── packages/content
│              │  seeded RNG · rules · AI rival · events  │    (JSON + Zod)  │
│              └────────────────────┬─────────────────────┘                  │
│        Dexie (IndexedDB saves)    │      Howler (audio)  · PostHog · Sentry │
└───────────────────────────────────┼────────────────────────────────────────┘
                                    │ HTTPS (Daily Run, leaderboard)
┌───────────────────────────────────▼──── apps/api (Cloudflare Worker) ──────┐
│  Hono router · same packages/engine to REPLAY & verify submitted runs      │
│  D1 (leaderboards, runs)  ·  KV (daily seed, share cards cache)            │
└────────────────────────────────────────────────────────────────────────────┘
```

### Key principles

1. **The engine is pure and deterministic** (NFR-12).
   - `reduce(state, action) → { state, events[] }`. No `Math.random`, no `Date.now`, no DOM.
   - RNG: a seeded PRNG (e.g. `pure-rand` / xoshiro128**) stored *inside* the state, so saves and replays are exact.
   - Separate named streams (`world`, `events`, `ai`, …) split from the run seed, so the market doesn't change based on what a player
     does (needed for Daily Runs), and adding a new random call in one system doesn't shift every other outcome.
   - Action previews (FR-03) are worked out without using up RNG, so looking at an action never changes the result.
   - Benefits: Daily Runs are identical for every player, the server can verify leaderboard submissions by replaying
     the action log, bug reports include `seed + actions`, and tests are trivial.
2. **The engine emits domain events. The UI turns them into presentation.** For example, the engine emits
   `{type:'PAYCHECK', amount:420}` and the UI plays a coin burst, a counter tick and a sound. This keeps "juice" out of the rules.
3. **Content is data.** Locations, jobs, items, events, news and balance constants are JSON/TS files validated by Zod
   at build time (CI fails on invalid content). Designers can tune values without touching engine code (NFR-15).
4. **The AI rival lives in the engine** as a utility-scoring function over the legal actions. It is deterministic, testable, and
   fast enough to simulate thousands of games in CI for balance checks.
5. **Rendering split:** Pixi owns the board canvas, and React owns everything else as DOM overlays. DOM UI gives
   accessibility (screen readers, keyboard focus) and crisp text.

---

## 3. Repository Structure

```
/
├─ apps/
│  ├─ web/                 # Vite + React + Pixi client (PWA)
│  │  ├─ src/ui/           # React components: HUD, panels, dialogs
│  │  ├─ src/board/        # Pixi scene: map, tokens, particles
│  │  ├─ src/fx/           # event → animation/sound mapping ("juice")
│  │  ├─ src/store/        # Zustand stores
│  │  ├─ src/persistence/  # Dexie save/load, migrations
│  │  └─ public/assets/    # spritesheets, audio sprites, fonts
│  └─ api/                 # Cloudflare Worker (Hono) — daily seeds, leaderboards
├─ packages/
│  ├─ engine/              # pure game rules, RNG, AI rival, scoring
│  ├─ content/             # cities/<id>/ (board, prices, wages), jobs.json, events/*.json, items.json, partners/ (name pools, traits, wants), life-stages.json, schemas.ts
│  └─ sim/                 # headless batch simulator for balancing (Node CLI), see simulator.md
├─ e2e/                    # Playwright tests
├─ docs/
└─ .github/workflows/      # CI/CD (see ci-cd.md)
```

---

## 4. Key Library Details

| Concern | Detail |
|---|---|
| **Pixi board** | Spritesheets packed with TexturePacker or free-tex-packer. Coin bursts and confetti use Pixi v8's built-in `ParticleContainer` with a small custom emitter (`@pixi/particle-emitter` hasn't been updated for v8). Tweens with `gsap` (free for all uses since 2025) or Motion's `animate`. Respect `prefers-reduced-motion` |
| **React UI** | Radix UI primitives for accessible dialogs, menus and tooltips. Lucide icons. Variable fonts self-hosted |
| **Number juice** | Animated counters (Motion springs) for cash and stats. Floating `+$420` labels positioned over the board |
| **Charts** | Net worth and market charts on the run summary and NeoBank screens: lightweight `uPlot` or hand-made SVG |
| **Routing** | Minimal, with screen states in Zustand (title, game, summary). A router isn't needed |
| **i18n** | `i18next` with JSON resources. `Intl.NumberFormat` for currency |
| **Saves** | Versioned save schema (Zod) with migration functions, so old saves keep working after updates |
| **Share card** | Worker endpoint renders an OG image (`@vercel/og`-style via `satori` + `resvg-wasm`) for Daily Run results |

---

## 5. Backend (v1.0)

| Endpoint | Purpose |
|---|---|
| `GET /daily` | Today's seed + scenario modifiers (cached in KV, rotates at 00:00 UTC) |
| `POST /runs` | Submit `{seed, actions[], claimedScore}`. The Worker replays it with the engine and stores it only if the score matches |
| `GET /leaderboard/:date` | Top N + the player's rank (D1) |
| `GET /share/:runId.png` | Generated share image |

- **Identity:** anonymous device ID by default. Optional sign-in later (Cloudflare Access is not for players, so use passkeys
  or OAuth through a lightweight auth library) when cross-device sync is added.
- **Anti-cheat:** server-side replay verification + per-IP rate limiting (Cloudflare WAF / rate-limit rules).
- **Async multiplayer (post-launch):** Durable Objects, one per game room, storing the action log.

---

## 6. Testing Strategy

| Level | Tool | What |
|---|---|---|
| Unit | Vitest | Engine rules, economy maths, event conditions |
| Property-based | fast-check | Invariants: money is conserved, stats stay in range, no softlocks, replay(seed, actions) is stable |
| Content | Zod + Vitest | Every content file validates. Every event's referenced IDs exist |
| Balance | `packages/sim` | Headless bot games with KPI bands (CI-04). See [simulator.md](simulator.md) |
| Component | Vitest + Testing Library | Key UI panels |
| E2E | Playwright | Start game → week 1 tutorial → end week → save/reload. Mobile + desktop viewports |
| Accessibility | Playwright + axe (`@axe-core/playwright`) | WCAG 2.2 A/AA on the main screens, light/dark (NFR-04) |
| Visual | Playwright screenshots | Main screens, light/dark |
| Performance | Lighthouse CI | Performance and accessibility scores on the PR preview (CI-05); budgets in `lighthouserc.json` |

---

## 7. Tooling & Conventions

- Node LTS (pinned in `.nvmrc`), pnpm via Corepack.
- Biome for lint + format. `tsc --noEmit` type-check in CI.
- Conventional Commits. Changesets or release-please for versioning and changelog.
- Renovate for dependency updates. GitHub Dependabot security alerts on.
- Asset pipeline: Aseprite/Figma source → exported PNG → packed spritesheets (script in `apps/web/scripts`).
  Audio: `.ogg` + `.m4a` audio sprites.
- Feature flags through PostHog for A/B testing engagement features (e.g. teaser copy, quest frequency).

---

## 8. Hosting & Environments

| Env | Where | Trigger |
|---|---|---|
| Preview | Cloudflare Pages preview URL per PR (+ Worker preview env) | Pull request |
| Preview (`main`) | `main.<pages-host>` — stable alias in the preview env, same Worker/D1/KV as PR previews | Merge to `main` |
| Production | `<domain>` — Pages production + Worker `production` env | Git tag / GitHub Release (manual approval) |

Full pipeline: [ci-cd.md](ci-cd.md).
