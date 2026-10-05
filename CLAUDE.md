# Fast Lane 2026

## Documentation: single source of truth

Each fact lives in exactly one file. Every other file links to it (`see ci-cd.md CI-04`) instead of restating it.

- Owners: requirements → `docs/game-requirements.md`; libraries and architecture → `docs/tech-stack.md`; pipeline → `docs/ci-cd.md`; simulator → `docs/simulator.md`; visuals → `docs/art-direction.md`; phases, tasks, exit criteria and phase notes → `docs/implementation-plan.md`; phase outcomes → `docs/progress.md`. Skills hold process only and point at these docs for content.
- Numbers (budgets, game counts, KPI bands, balance values) appear once, in their owner. Elsewhere, cite the requirement ID.
- Before adding content to a doc or skill, search for where it already lives. If it exists, link to it. If it belongs elsewhere, put it there.
- When you change a fact, change it in its owner, then grep for stale copies and replace them with links.
