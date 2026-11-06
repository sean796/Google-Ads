# Neo Pulse Repo Audit: Post-Refactor (Waves 0 to 5)

Date: 2026-11-05 (second audit, same day as the original)
Scope: full repo at `B:\Neo Pulse`, after Waves 0 to 5 of the fix backlog from the original audit were implemented.
Method: every finding from the original audit (Sections 4 to 7 of `docs/audit/2026-11-05-repo-audit.md`) re-checked against current code, plus fresh runs of the full test suite, both typechecks, lint, the gate baseline check, the WordPress plugin tests, the hosting API tests, and the production build. Status labels mean: **Fixed** (verified in current code), **Partially fixed** (the mechanism changed, residue remains), **Open** (not addressed).

## 1. Executive verdict

**The framework verdict stands.** Vite + React 18 + TypeScript SPA, WordPress PHP hub API, WordPress client plugin, Node hosting API, Render. The original audit said keep this foundation; the refactor did, and the seams it flagged (two routers, two UI kits, shadow dev backend, borrowed "Mastra" label) are closed or closing.

**The production-safety verdict changes, with two caveats.** The original audit's answer was "No." The unauthenticated API surface, key-returning endpoints, fail-open publishing pipeline, browser credential vault transport, and spoofable hosting API identity are all fixed in code and verified below. Two things keep this from being an unconditional yes:

1. **C4 is still open.** Secrets still live in `wp-content/uploads/neo-pulse-data` with only a silence `index.php`. No deny rules exist anywhere in this repo, and the repo's own deploy scripts fetch `https://neodigital.ca/wp-content/uploads/neo-pulse-data/sites.json` over HTTP, which proves that path is web-readable in production today.
2. **Almost none of this is committed.** The working tree holds about 1,414 dirty entries on top of one unpushed snapshot commit. Until the waves land as reviewed commits, the refactor exists only on this machine.

**SEO doctrine verdict changes.** Formulaic structure quotas, templated FAQ schema, substring intent classification, fail-open competitor filtering, and scrub-after-write blocklist enforcement are gone, replaced by grounding rules, AI classification with schemas, and validate-and-reject gates. Publishing output evals now exist and run in CI (report-only).

Scorecard (auditor judgement, before → after):

- Research grounding: 8/10 → 8/10 (unchanged, was already strong)
- GSC reporting: 8/10 → 8/10 (unchanged, was the reference implementation)
- Link and schema mechanics: 7/10 → 8/10 (quotas out, evals in)
- Agent contracts: 5/10 → 7/10 (publishing path is schema-strict; repair utility residue remains)
- Orchestration honesty and maintainability: 4/10 → 7/10 (one router, one UI kit, registry enforced)
- Failure safety: 3/10 → 8/10 (fail-visible is now the default; budget and blocklist gates throw)

## 2. Before and after, measured

| Measure | Original audit (2026-11-05, pre-refactor) | Now (post Waves 0 to 5) |
|---|---|---|
| Full test suite | 93 of 4,731 tests failed, 52 of 905 files failed, 3 unhandled errors | 1 of 4,809 tests failed (the known live-credential smoke test), 918 of 919 files pass |
| Typecheck (app) | 1,236 errors, never run by the build | 1,144 errors, tracked in `docs/gates/baseline.json`, ratcheted down only |
| Typecheck (node) | Not measured separately | 7 errors, baselined |
| Lint | Failed to start (missing `eslint.pulse-ui-rules.js`) | Runs: 869 errors / 263 warnings, ratcheted, report-only in CI until zero |
| Gate watching | None (no CI, no storybook config) | CI with one blocking job + report-only ratchet and storybook jobs; `check:gates` green |
| Tracked files | 6,162 | 5,622 |
| Tracked files under `tmp/` | 410 | 0 |
| Largest file in `src` | 2,675 lines (`EntityGenerationFeature.tsx`) | 1,812 lines (`ProposalResearchTab.tsx`) |
| Files over 1,000 lines | 27 | 21 |
| Files over 800 lines | 51 | 43 |
| Browser-direct `openrouter.ai` references | 15 files | 0 |
| Localhost debug ingest calls (`127.0.0.1:7781`) | 34 across 5 files | 0 |
| Agent registry | 50 entries in code (audit count), docs said 37, contract test failing | 47 entries, contract test pins count, source modules, and docs equality |
| Workspace routing | Hash strings + localStorage, ~5 parsers | 23 nested React Router tab routes, legacy hash redirect, lazy tabs |
| Docs engine label | `docs/api/mastra/`, "Mastra" UI labels | `docs/api/pulse-engine/`, Pulse Engine labels; upstream playbook vendored with attribution |

## 3. Critical findings, one by one

### C1. Client WordPress credentials committed and shipped in the bundle — **Fixed in code; rotation unverifiable from the repo**

`src/components/integrations/default-properties-seed.json` is deleted (verified absent). The secret scanner now scans all tracked files (not only staged) and includes WordPress app-password patterns; it runs green. Whether the 17 exposed app passwords were actually rotated lives with credential owners (runbook: `docs/runbooks/wave-0-credential-rotation.md`). The repo cannot prove rotation; treat as open until owners attest.

### C2. Most `/api/*` endpoints had no server-side auth — **Fixed**

The dispatcher now gates every route (`class-api-dispatcher.php`, `require_gate()`): 13 public routes and 3 machine-token routes are explicit; everything else requires an authenticated hub session or returns 401. Verified live during the waves: unauthenticated calls return `{"ok":false,"error":"Unauthorized"}`, and a minted Bearer returns real data. The DataForSEO `can_access()` stub class of problem is behind the same gate, and a guard test (`hub-api-auth-guard.test.ts`) fails if any hub fetch in `src` goes out without the session Bearer.

### C3. Server secrets returned to, and overwritable by, the browser — **Fixed**

`GET /api/integrations/resolved-openrouter-key` and the other key-returning endpoints are deleted. A plugin test pins the route's absence (`route-registry.test.mjs`). Server keys resolve server-side from env first (precedence inverted in the secrets loader); the browser receives data, never keys.

### C4. Secrets at rest in a web-readable uploads folder — **Open**

Unchanged structurally. `Neo_Pulse_App_Data_Paths::root()` still resolves to `wp-content/uploads/neo-pulse-data`, still protected only by a silence `index.php`. No deny rules exist in the repo's Docker image or entrypoint. Worse, repo scripts under `wordpress-plugins/.deploy/` and `wordpress-plugins/_*.mjs` fetch `https://neodigital.ca/wp-content/uploads/neo-pulse-data/sites.json` over HTTP as part of deploy workflows, which confirms the production path answers web requests today. Env-first secret precedence means fewer secrets need to live there, but `sites.json`, OAuth tokens, and service-account JSON still do. This is the top remaining security item: move the data root outside the web root or add verified deny rules on the production host.

### C5. The browser is the credential vault — **Mostly fixed**

Transport is fixed: zero browser-direct `openrouter.ai` references remain in `src`; all LLM, DataForSEO, Semrush, and WordPress traffic goes through `backendApiUrl('/…')` with the session Bearer, enforced by guard tests (`wave3-server-side-only.test.ts`). The Vite `define` injection of `VITE_OPENROUTER_API_KEY` is gone. Server env is now the only key source that is actually used; stored browser keys are no longer sent. Residue: some legacy localStorage key reads still exist in client code (for example the model catalog client passes a stored key argument that the server ignores). That is hygiene debt, not an active credential path, but it should be deleted so the next reader does not mistake it for a live flow.

### C6. The hosting API trusts self-asserted identity — **Fixed**

`hosting/neo-host-api/lib/auth.mjs` now trusts identity headers only alongside the service token and fails closed when no token is configured (verified in code). Hosting API tests pass (23/23).

### C7. The publishing pipeline is fail-open and will publish invented filler — **Fixed**

The templated article synthesis fallback is deleted (no matches for the synthesis path in `bulk-row-content-media-phase.ts`). `validateHarnessSectionOrThrow` is a real gate: truncated, answer-incomplete, overview-incomplete, or body-incomplete sections throw and fail the row before stitching and upload. HTML QC failure blocks upload instead of keeping stitched HTML. Meta batch parse failure surfaces as an error. This was the original audit's single most important product defect; it is closed.

### C8. Every enforcement gate is broken, and nothing watches them — **Fixed structurally; debt remains by design**

`eslint.pulse-ui-rules.js` and `scripts/generate-ui-catalog.mjs` exist; `npm run lint` and `npm run ui:check` run. `.storybook` is restored and builds. CI exists at the repo root (one blocking job: secrets, circular imports, UI registry, plugin tests, host tests, build; report-only ratchet, storybook, and as of Wave 5, publishing evals). The contract test is green, including the hardcoded-model-ID scan that failed with 8 violations. The honest remainder: 869 lint errors and 1,144 app typecheck errors are baselined in `docs/gates/baseline.json` and only allowed to move down. Typecheck joins the build when its count reaches zero (Wave 1 decision). The gates now watch; the debt is scheduled, not gone.

### C9. A demo credential is hardcoded in source — **Fixed**

`LOCAL_DEMO_PASSWORD`, the demo user, and the demo team are deleted. `src/lib/auth-disabled.ts` remains as a flag-only file with an explanatory comment; there is no built-in login.

### C10. Unauthenticated server-side fetch and callback surface — **Fixed**

An SSRF guard exists and is wired (`includes/http/class-ssrf-guard.php`, used by image routes and the WP REST client). Google Ads, GMB, and Google MCP OAuth flows mint and verify `state`. Webhooks fail closed: AgentMail requires a Svix signature or shared Bearer secret and rejects when neither is configured; Chekkit requires a secret token path and rejects the bare path, with a 64 KB payload cap.

## 4. High findings, one by one

- **H1. Two routing systems — Fixed.** Workspaces are 23 nested React Router routes under the Index shell (`MANAGER_TAB_ROUTES`, length pinned by test), with a legacy hash redirect for old links and lazy tab loading. Hash parsers and localStorage tab routing are gone as the mechanism of record.
- **H2. God files and prop drilling — Partially fixed.** The five files over 2,000 lines were split along existing seams; nothing in `src` now exceeds 1,812 lines. But 21 files still exceed 1,000 lines and 144 exceed 500, so this is progress, not completion. The next split candidates by size: `ProposalResearchTab.tsx` (1,812), `BulkOptimizationPanel.tsx` (1,733), `image-reference-research.ts` (1,497), `use-overview-tab-research-pipelines.ts` (1,453).
- **H3. The agent registry is a descriptive catalog — Fixed, with one honest limit.** `PULSE_AGENT_REGISTRY` holds 47 entries and is now the tested source of truth: the contract test pins the exact count, requires every registered `sourceModule` to exist on disk, requires every `createPulseAgent` id in `src` to be registered, and requires the docs catalog table to equal the registry set (docs previously said 37 and listed an agent that did not exist; the stale row was removed and four missing rows added). The limit: only 4 production agents are built with `createPulseAgent`; the rest are cataloged agents invoked through category model helpers. The registry is enforced as a catalog and routing contract, not as universal framework adoption.
- **H4. Structured output is the exception — Partially fixed.** The publishing path (bulk harness, sitemap optimizer, meta batch) now parses with zod or strict schemas and throws visibly; `parseClusterResultJson` throws on invalid output instead of returning empty clusters (test-pinned). Residue: `json-repair-utility.ts` still exists and is imported by about 20 research and overview files. Those flows should migrate to schema parsing wave by wave; the repair utility should shrink to zero imports and then be deleted.
- **H5. Silent model fallback breaks category routing — Fixed.** The OpenRouter `models` fallback array is deleted. The transport records `servedModel` from the actual response, and prompt traces persist server-side (hub table plus authenticated `POST /api/prompt-traces`), so which model wrote an article is now knowable after the fact.
- **H6. Sitemap parse failure masquerades as no merges — Fixed.** See H4; parse failure is an explicit thrown error, and tests pin the throw.
- **H7. Prompt contradictions in the core blog flow — Fixed.** One keyword doctrine (AISO semantic breadth, at most one exact phrase per H2) replaced the two flag-switched regimes including the ~1.0% density rule. One title limit exists in code: `SEO_TITLE_MAX_CHARS = 60` with word-boundary truncation, test-pinned.
- **H8. Outdated SEO tactics codified — Fixed (Wave 5).** Mandatory table/list quotas and per-section link minimums are out of prompts and validators; inventory-resolved linking remains. Templated FAQ answers are deleted and FAQPage schema is emitted only from stored real answers, with a visible "FAQ schema omitted" note otherwise. Keyword intent and competitor keyword filtering are OpenRouter + zod classifiers that throw visibly instead of substring ladders and fail-open pass-through. The word blocklist is validate-and-reject (`assertNoForbiddenWordViolations`, now including em-dash detection) instead of scrub-after-write.
- **H9. The Vite dev server is a shadow backend — Fixed.** The dev proxy plugins were stripped of intercepts, fabricated responses, and error-to-success conversions; dev `/api` targets the PHP hub at `neopulse.local`, and TLS works through `NODE_EXTRA_CA_CERTS` for the local CA instead of disabled verification. PHP is canonical in dev and prod; Node remains only as local host-job runners.
- **H10. Duplicated systems mid-migration — Mostly fixed.** The UI kit finished migrating: `src/components/ui` is deleted, primitives live in `src/ui/vendor`, and app code imports through the `@/ui` registry (lint-enforced). Competitor and content library domains were merged. EMCP is deleted from client and PHP. The separate `neodigital-mobile-app` is deleted; the root Capacitor setup (`android/`, `mobile.html`) remains as the single mobile path. `neo-agent-hub` and `apps/game-copilot` are removed from the repo.
- **H11. Concurrency and fetch-shape risks — Open.** Not in Waves 0 to 5 scope: the JSON file store read-modify-write is still unlocked, agent run locking is still a non-atomic transient pattern, and WordPress inventory error shape conversions were not revisited. These need their own wave with staging verification.
- **H12. Debug telemetry ships in production code — Fixed for network exfiltration; console residue remains.** All 34 `127.0.0.1:7781` ingest fetches are deleted (0 references). `console.*` calls in `src` number about 1,201, roughly unchanged; they no longer ship content metadata to a network listener, but a logging pass is still owed.
- **H13. Repo hygiene contradicts its own rules — Mostly fixed.** Tracked `tmp/` files: 410 → 0. Nested repos and the unrelated app are out. The remaining hygiene problem is new and bigger: the entire refactor is uncommitted (see Section 6).

## 5. Medium and low findings

- **State lives in three places at once — Open.** React Query usage, contexts, and localStorage patterns were not consolidated. Not wave-scoped; still per-feature.
- **Performance: almost no code splitting — Partially fixed.** Manager tabs are lazy-loaded now (Wave 4) with splash fallbacks; initial-path weight is down. Manual chunk tuning and list virtualization for long grids are still absent.
- **Chrome coverage gaps — Fixed.** Workspace headers completed onto `UnifiedWorkspaceChrome` (Wave 4).
- **Component tests effectively do not exist — Open.** Still zero `.test.tsx` files and no DOM testing library. The 4,809 tests are logic tests. Storybook is restored, which gives visual coverage a home, but interaction tests remain a gap.
- **Rule violations the broken lint should catch — Mostly fixed, small residue.** Lint now runs and enforces the UI registry. Residue found in this audit: `animate-spin`/`Loader2` references in 2 component files and sub-1rem `text-[10px]`/`text-[11px]` classes in 2 files. These sit inside the 869-error baseline and should burn down with it.
- **WordPress client plugin (`neo-pulse-wp`) — Partially.** Standalone PHP test passes, but it still pins version 0.9.266 while the plugin ships 0.9.267 (verified in the plugin header and constant). The three PHP files over 2,400 lines were not split.
- **Observability and cost — Partially fixed.** Prompt traces persist server-side with served-model recording. Per-run budget enforcement landed in Wave 5 (estimated vs actual recorded per section; over-budget rows stop visibly). Publishing output evals (link resolution, schema validity, templated-answer detection) run in CI as a report-only job. Not yet present: an AI factuality scorer in CI; the eval set is deterministic by design today.
- **Local dev is Windows-locked — Unchanged.** Works via `npm run dev`; still this machine's shape.

## 6. The new top risk: the refactor is not committed

`git status` shows about 1,414 dirty entries (about 620 staged) on top of a single unpushed snapshot commit from today; the branch is 1 commit ahead of `origin/main`. Waves 0 to 5 exist as a working tree, not as history. Consequences: no review trail per wave, no bisect if something regressed, total loss if this disk or folder is damaged, and no way for anyone else to run the fixed code. Recommendation: commit in wave-sized chunks matching the wave boundaries (the diffs separate cleanly by area), push to a branch, and open a PR per wave or one stacked set. Do not squash the security wave into the refactor waves; reviewers need C1 to C10 visible as their own change.

## 7. Wave completion vs the original backlog

| Wave | Original scope | Status |
|---|---|---|
| Wave 0, stop the bleed | Auth gate, key endpoints deleted, seed/demo removal, hosting identity, OAuth state, webhooks, SSRF, scanner | Done in code. Credential rotations remain owner items (C1); uploads path (C4) carried to Section 8 |
| Wave 1, restore the gates | Lint/UI modules recreated, typecheck baseline, storybook, CI, test triage | Done. Debt baselined (869 lint, 1,144 tsc), ratchet only moves down |
| Wave 2, publish safety | Fail-open synthesis deleted, validators as gates, one doctrine, one title limit, served model, persisted traces | Done |
| Wave 3, server-side only | Browser-direct paths removed, ingest calls removed, dev fake success removed, PHP canonical | Done |
| Wave 4, architecture cleanup | One router, `@/ui` migration, chrome completion, domain merges, EMCP/mobile/submodule removal, god-file splits | Done (god-file work partial by design: five worst split) |
| Wave 5, SEO doctrine and evals | Quotas out, FAQ schema honest, AI classifiers, blocklist reject, output evals, model validation, budget enforcement, registry enforcement, engine rename | Done (this session) |

## 8. Remaining backlog (suggested order)

1. **C4 uploads path.** Move `neo-pulse-data` outside the web root or add host-level deny rules and verify with a live fetch against staging, then production. Update the deploy scripts that currently read `sites.json` over HTTP to use an authenticated route instead.
2. **Commit and push Waves 0 to 5** in wave-sized commits; get the security wave reviewed separately.
3. **Credential rotation attestation.** Owners confirm rotation for the 17 seeded app passwords, the demo credential, and keys ever synced to `manager-settings.json` or returned to a browser. Close C1 formally.
4. **Debt burn-down.** Drive lint 869 → 0 and tsc 1,144 → 0 by category; when tsc hits zero it joins the build (Wave 1 decision). Kill the remaining localStorage key reads (C5 residue) and the spinner/sub-1rem residue on the way.
5. **H11 concurrency wave.** Lock the JSON store writes, make agent run locking atomic with a TTL above max run time, and fix WordPress inventory error shapes so 401 does not masquerade as 200.
6. **Structured-output completion.** Migrate the ~20 `json-repair-utility` consumers to schema parsing; delete the utility at zero imports. Add component interaction tests for the highest-risk screens (bulk generator, overview grid, integrations).
7. **Factuality eval.** Add an AI factuality spot-check scorer beside the deterministic publishing evals where a server key exists, keeping the deterministic scorers as the CI floor.

## 9. Verification log (this audit, 2026-11-05)

- `npx vitest run` (full): 918 of 919 files pass; 4,808 of 4,809 tests pass. The single failure is `in-the-shade-reporting-smoke.test.ts`, a live smoke test that needs real hub credentials (documented in the gate baseline).
- `npm run typecheck`: 1,144 app errors. `npm run typecheck:node`: 7. `npm run lint`: 869 errors / 263 warnings (baseline-equal). `npm run check:gates`: "All gate counts at or below baseline" (exit 0). Baseline lowered for tscApp 1,145 → 1,144 in the Wave 5 change.
- `npm run test:neo-pulse-app`: 69/69 pass. `npm run test:neo-host-api`: 23/23 pass. `npm run build`: passes.
- Dev stack verified at `http://127.0.0.1:8080` with `repoRoot: B:\Neo Pulse`; all Wave 5 touched screens' modules (model settings, competitor grid, inspector panel, bulk harness, uploader, classifiers, evals) transform and serve 200.
- Code verification samples: dispatcher `require_gate()` and 401 path read in `class-api-dispatcher.php`; hosting fail-closed logic read in `hosting/neo-host-api/lib/auth.mjs`; Chekkit token-path rejection and AgentMail fail-closed verification read in the webhook classes; `validateHarnessSectionOrThrow` throw paths read in `harness-section-validate.ts`; AISO doctrine lines read in `blog-template-checklist-generate.ts`; `SEO_TITLE_MAX_CHARS = 60` and its test read; registry counted by script (47 entries, 9 domains, 7 categories, all `sourceModule` files exist, no duplicate ids).
- Searches (0 matches where claimed): `127.0.0.1:7781` in `src`; `https://openrouter.ai/api/v1` in `src`; `scrubForbiddenWordsFromHtml` / `scrubOverviewContentOutput` / deleted competitor filters / FAQ fabricators in `src`; `resolved-openrouter-key` in plugin PHP (present only as a negative assertion in tests).
- Path checks: seed JSON absent; `src/components/ui` absent; `src/lib/emcp` absent; `neodigital-mobile-app`, `neo-agent-hub`, `apps/game-copilot` absent; `docs/api/mastra` absent (moved); tracked `tmp/` files = 0; `.github/workflows/ci.yml` present with blocking, ratchet, storybook, and evals jobs.
- Known unverified (not claimed): production compensating controls outside this repo (WAF, private networking), actual credential rotations, live bulk-row publishing, and production uploads-path behavior beyond what repo scripts demonstrate.

## 10. Bottom line

The original audit said: keep the stack, do not trust bulk publish, the public API surface, or any credential that has touched this repo until Waves 0 to 2 land. Those waves have landed in code, and Waves 3 to 5 closed the architecture and doctrine gaps behind them. Failure safety went from the weakest score (3/10) to the strongest (8/10) because the system now fails visibly instead of publishing around errors.

What stands between this codebase and a clean bill: one open security item with production evidence against it (C4), a credential-rotation attestation only owners can give, and commit hygiene. Fix the uploads path, attest the rotations, and land the tree in wave-sized commits. After that, the remaining work is ordinary debt burn-down under gates that now watch themselves.
