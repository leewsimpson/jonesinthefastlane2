---
name: buildaphase
description: Build one phase of the Fast Lane 2026 implementation plan end to end — scope, build, verify exit criteria, record, PR. Usage: /buildaphase <phase number>
disable-model-invocation: true
---

# Build a phase

`docs/implementation-plan.md` owns *what* each phase contains: tasks, exit criteria and **Notes** (human-only steps, open questions, gotchas). This skill is the *process* for building one phase. `docs/progress.md` is the running ledger of finished phases, deferrals and deviations — create it on first use.

## 1. Pick the phase

- Phase = the argument. With no argument, take the lowest phase that `docs/progress.md` does not mark done, and confirm it with the user.
- **Gate:** every phase this one depends on (the dependency diagram in the plan) is marked done in `docs/progress.md`, with its exit criteria evidenced. If a dependency is missing or a criterion was waived, stop and ask the user whether to proceed.
- Phase 10 is a backlog, not a phase: ask the user which item to build, then treat that item as the phase.

Done when: phase number confirmed and the gate passes.

## 2. Build the checklist

1. Read the phase's section of the plan, including its **Notes**, and any open deferrals in `docs/progress.md` that land in this phase.
2. For every requirement ID the phase references (`FR-`, `NFR-`, `ENG-`, `CI-`, `CD-`, `OPS-`, `SIM-`, `§n`, `tech-stack §n`, `simulator §n`, `art-direction §n`), read its full text in `docs/`. The table row is a summary; the requirement is the spec.
3. Write the checklist as tasks (TaskCreate or a list in the reply): one per plan row, split where a row hides several deliverables, each tagged with its requirement IDs. Add each exit criterion as its own task.
4. Separate out **human-only steps** — accounts, secrets, dashboards, approvals, playtests, legal review. Present them to the user now, not at the end; offer the `mattpocock-skills:wizard` skill for multi-step setup.
5. Show the user the checklist and any open questions (ambiguous requirements, decisions the docs leave open). Wait for answers before writing code.

Done when: every plan row and every exit criterion maps to at least one task, and the user has approved the checklist.

## 3. Build

- Branch from up-to-date `main`: `phase-<n>-<slug>` (e.g. `phase-1-engine-core`).
- Work task by task. One Conventional Commit per task or coherent group (`feat(engine): …`), ending with the attribution line.
- Engine, content and sim code: test-first with the `mattpocock-skills:tdd` skill. Property tests (fast-check) for every invariant the phase names.
- Keep the plan's guiding approach: engine stays pure (no `Math.random`, `Date.now`, DOM); content is data with a Zod schema; non-critical client code is lazy-loaded.
- Placeholder content and boilerplate are good candidates for the local LLM (`/ask-local`) — review what comes back.
- When a task cannot be done as written, note the deviation for step 5 rather than silently reshaping it.

Done when: every non-human task on the checklist is complete and `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` (or the phase-0 equivalents) pass locally.

## 4. Verify exit criteria

For each exit criterion, produce **evidence**: the command run and its output, a test name, a screenshot, a preview URL. Client phases: drive the real app with the `run` skill or Claude in Chrome, at phone and desktop sizes.

Then run the `mattpocock-skills:code-review` skill against `main` to check the branch against the phase's requirements. Fix what it finds or record it as a deferral.

Done when: every exit criterion has evidence or an explicit, user-approved deferral.

## 5. Record and ship

1. Append the phase entry to `docs/progress.md`:

   ```markdown
   ## Phase <n> — <name> — done <YYYY-MM-DD>
   - Exit criteria: <criterion> — <evidence>
   - Deferred: <task / requirement ID> → Phase <m> — <reason>
   - Deviations: <what changed from the plan and why>
   - Notes for later phases: <gotchas discovered>
   ```

2. If a deviation changes the plan itself (a decision, a new risk, a moved task), update `docs/implementation-plan.md` in the same branch. Gotchas that a later phase needs go in that phase's **Notes**, not only in the ledger.
3. Push and open a PR with `gh pr create`: summary, checklist with requirement IDs, exit-criteria evidence, deferrals. Wait for CI to go green (from Phase 0 on).
4. Ask the user before merging.

Done when: PR is open with green checks and the user has been told what is left for them (human-only steps, merge).
