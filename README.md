# Fast Lane 2026 — Design Docs

A modern, 2D web-based reimagining of Sierra's *Jones in the Fast Lane* (1990), set in the economy of 2026:
AI job disruption, the housing crunch, gig work, side hustles, crypto swings, subscription creep and burnout.

| Doc | What it covers |
|---|---|
| [game-requirements.md](docs/game-requirements.md) | Vision, core loop, goals, stats, locations, jobs, economy, life stages & relationships, events, AI rival, modes, engagement design, UX, MVP scope |
| [art-direction.md](docs/art-direction.md) | Visual style, palette, typography, camera rules, image-gen prompts, asset pipeline, MVP asset list |
| [tech-stack.md](docs/tech-stack.md) | Architecture, libraries, project structure, persistence, backend, testing, tooling, hosting |
| [ci-cd.md](docs/ci-cd.md) | GitHub Actions pipelines, Cloudflare Pages/Workers/D1 deployment, environments, rollback, secrets |
| [implementation-plan.md](docs/implementation-plan.md) | Phased build plan from foundations to MVP, v1.0 and post-launch, with exit criteria, art track, decisions and risks |

## Working title & IP note

"Fast Lane 2026" is a working title. *Jones in the Fast Lane* and its location names (Monolith Burgers, Hi-Tech U,
Socket City, etc.) belong to the original rights holder. This project uses **original names and art**, and the
original is only a source of inspiration. Get a legal check before using the original name or assets in public.

## Requirement conventions

- IDs: `FR-` functional, `NFR-` non-functional, `ENG-` engagement, `CI-`/`CD-`/`OPS-` pipeline.
- Priority: **M** = Must (MVP), **S** = Should (v1.0), **C** = Could (post-launch).
- All numbers (prices, wages, hours) are **starting balance values**. They live in data files and get tuned in playtesting.
