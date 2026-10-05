# CI/CD Requirements — GitHub Actions → Cloudflare

## 1. Goals

- Checks run automatically on `main` only, to keep GitHub Actions minutes low. PRs run nothing by default: CI can be
  dispatched manually on a branch, and a PR gets a live preview URL when it carries the `preview` label.
- `main` is always deployable and auto-deploys to the **preview** environment under a stable `main` alias.
- Two environments only: **preview** (PRs + `main`) and **production**. There is no separate staging.
- Production deploys are one click, gated by approval, and easy to roll back.
- The pipeline is fast: checks should finish in **under 8 minutes**.

## 2. Targets

| Component | Cloudflare product | Deploy tool |
|---|---|---|
| Web client (static PWA build from `apps/web/dist`) | **Cloudflare Pages** (Direct Upload project) | `cloudflare/wrangler-action` → `wrangler pages deploy` |
| API (`apps/api`) | **Cloudflare Workers** (envs: `preview`, `production`) | `wrangler deploy --env <env>` |
| Database | **D1** (one DB per env) | `wrangler d1 migrations apply --env <env>` |
| Cache/config | **KV** namespaces per env | Bound in `wrangler.jsonc` |

> Use Pages **Direct Upload** from Actions (not Cloudflare's Git integration), so that GitHub Actions is the single source
> of truth for builds, checks and gating.

## 3. Requirements

| ID | Requirement | Pri |
|---|---|---|
| CI-01 | Run on every push to `main` (and on manual `workflow_dispatch` for any branch): install (pnpm, cached), Biome lint/format check, `tsc` type-check, content schema validation, unit + property tests, build. | M |
| CI-02 | Use Turborepo or `pnpm --filter ...[origin/main]` so only affected packages are built and tested. | S |
| CI-03 | E2E (Playwright, Chromium + mobile WebKit viewport) runs against the PR **preview URL** after it deploys (only labelled PRs deploy, CD-01). | M |
| CI-04 | Balance sim (`packages/sim`, 2k games on `main` and manual dispatch, 10k nightly), in a job parallel to the checks. Fails if KPIs leave their hard bands. Posts the band table, with a paired comparison against the last green `main` run's report, to the job summary, and uploads the report as an artifact. | S |
| CI-05 | Bundle size check: fails if the initial JS exceeds 300 KB gzipped (NFR-10). Lighthouse CI on the preview URL with performance/accessibility budgets. | M |
| CI-06 | Security: CodeQL scanning, `pnpm audit` (high+ fails), Dependabot alerts, secret scanning with push protection on. | M |
| CI-07 | `main` has no ruleset or branch protection (removed 2026-10-05, user decision). Direct pushes are allowed and no status checks are required, because CI runs on `main` itself (CI-01); a red `main` is fixed forward. | M |
| CD-01 | **Preview (opt-in):** a PR labelled `preview` deploys the web app to a Pages preview (`--branch=pr-<n>`). The URL is posted as a sticky PR comment. The Worker is uploaded with `wrangler versions upload --env preview --preview-alias pr-<n>`, which gives every PR its own Worker preview URL. (A single shared `preview` deploy would let parallel PRs overwrite each other mid-E2E.) The PR's web preview is built with that API URL. | M |
| CD-02 | **Main:** merging to `main` deploys web + API to the preview environment under the stable `main` alias (Pages `--branch=main`, Worker `--preview-alias main`), runs D1 migrations on the preview DB, runs smoke E2E, and uploads the web build as artifact `web-dist-<sha>` for production to promote. | M |
| CD-03 | **Production:** triggered by publishing a GitHub Release (tag `v*`) or a manual `workflow_dispatch`. Uses a GitHub **Environment `production`** with required reviewers. Deploys the *same build artifact* that passed on `main` (CD-02) (build once, promote). It doesn't rebuild. The web build must therefore not bake in environment-specific values: the API base URL and similar config are picked at runtime from the hostname or a `/config.json`. | M |
| CD-04 | D1 migrations run **before** the Worker deploy and must be backward-compatible (expand → migrate → contract) so a rollback is always safe. | M |
| CD-05 | Rollback: a `rollback.yml` workflow (manual) re-promotes a previous Pages deployment and runs `wrangler rollback` for the Worker. Documented in a runbook. | M |
| CD-06 | Post-deploy smoke test: hit `/`, `/daily` and `/healthz`, and check the version header matches the released SHA. On failure, auto-alert and suggest a rollback. | M |
| CD-07 | Release automation: release-please (or Changesets) creates the release PR, changelog and version tag. | S |
| CD-08 | Sentry release + source map upload on `main` and production deploys. Source maps are **not** served publicly. | S |
| CD-09 | Clean up PR preview Worker resources/aliases when the PR closes. | C |
| OPS-01 | Secrets live only in GitHub Environments: `CLOUDFLARE_API_TOKEN` (scoped: Pages Edit, Workers Scripts Edit, D1 Edit, KV Edit, for this account only), `CLOUDFLARE_ACCOUNT_ID`, `SENTRY_AUTH_TOKEN`, `POSTHOG_KEY`. Preview and production currently share one token (owner decision, 2026-10-05); split them if the blast radius ever matters. | M |
| OPS-02 | Pin third-party actions to a full commit SHA. Workflows default to `permissions: contents: read`, and each job adds scopes only as needed. | M |
| OPS-03 | `concurrency` groups: cancel superseded PR runs, and never run two production deploys at once. | M |
| OPS-04 | Nightly workflow: full balance sim, full E2E matrix, dependency audit. Results go to a GitHub issue/Slack. | S |

## 4. Workflows

```
.github/workflows/
├─ ci.yml           # main (+ manual): lint, typecheck, test, build, size, sim (CI-01..06)
├─ codeql.yml       # main + weekly: CodeQL (CI-06)
├─ preview.yml      # PR labelled `preview`: deploy Pages preview + Worker preview, comment URL, run E2E + Lighthouse
├─ main.yml         # push to main: migrate preview D1, deploy `main` alias (Worker + Pages), smoke, upload artifact
├─ production.yml   # release published / dispatch: approval gate → migrate → deploy → smoke
├─ rollback.yml     # manual: roll back Pages + Worker to a chosen version
└─ nightly.yml      # cron: full sim, full E2E matrix, audit
```

### Pipeline flow

```
PR + `preview` label ─► preview.yml ─► Pages preview + Worker preview ─► E2E + Lighthouse ─► PR comment
                                   │
merge to main ─► ci.yml ─► main.yml ─► D1 migrate ─► Worker ─► Pages (main alias) ─► smoke ─► artifact
                                   │
Release v1.2.0 ─► production.yml ─► [manual approval] ─► D1 migrate ─► Worker ─► Pages ─► smoke ─► Sentry release
```

### Reference: production deploy job (sketch)

```yaml
name: production
on:
  release: { types: [published] }
  workflow_dispatch:
permissions: { contents: read, actions: read }   # actions:read = download the main-build artifact
concurrency: { group: production, cancel-in-progress: false }

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: production          # required reviewers configured in repo settings
    steps:
      - uses: actions/checkout@<sha>
      - uses: pnpm/action-setup@<sha>
      - uses: actions/setup-node@<sha>
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile   # needed for wrangler + smoke tests, NOT for rebuilding
      # Promote the exact web build that passed on main (CD-03): main.yml uploads `web-dist-<sha>`.
      - name: Download main build
        uses: actions/download-artifact@<sha>
        with:
          name: web-dist-${{ github.sha }}
          path: apps/web/dist
          github-token: ${{ secrets.GITHUB_TOKEN }}
          run-id: <main.yml run id for this SHA, looked up via the API in a previous step>
      - name: Migrate D1
        uses: cloudflare/wrangler-action@<sha>
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/api
          command: d1 migrations apply fastlane-db --env production --remote
      - name: Deploy Worker
        uses: cloudflare/wrangler-action@<sha>
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          workingDirectory: apps/api
          command: deploy --env production
      - name: Deploy Pages
        uses: cloudflare/wrangler-action@<sha>
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: pages deploy apps/web/dist --project-name=fastlane --branch=production
      - run: pnpm smoke --base-url=https://<domain>
```

## 5. Cloudflare Setup Checklist (one-time)

1. Create the Pages project `fastlane` (Direct Upload) and attach the custom domain.
2. Create the Worker with `preview` / `production` envs in `apps/api/wrangler.jsonc`. Route `api.<domain>/*`.
3. Create D1 databases `fastlane-db-preview` and `fastlane-db` and KV namespaces per env, then bind them in `wrangler.jsonc`.
4. Create a scoped API token and store it in the `preview` and `production` GitHub Environments.
5. Set security headers (CSP, HSTS) via `apps/web/public/_headers`. Set the SPA fallback via `_redirects`.
6. Configure WAF rate-limit rules on `POST /runs`.
7. Turn on Cloudflare Web Analytics (cookieless) as a privacy-friendly baseline alongside opt-in PostHog.
