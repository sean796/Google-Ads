# Neo Pulse Repo Audit

Date: 2026-11-05
Scope: full repo at `B:\Neo Pulse`, read-only code audit plus verification runs. No production code was changed for this audit.
Method: four parallel audit passes (architecture, backend, AI and SEO, frontend and quality), then every critical claim re-checked in its file, then lint, typecheck, tests, plugin tests, and scanners re-run on 2026-11-05.

## 1. Executive verdict

**Does the framework make sense? Yes, at the macro level.**
Vite + React 18 + TypeScript SPA, a WordPress PHP hub API (`neo-pulse-app`), a WordPress client plugin (`neo-pulse-wp`), a small Node hosting API, and Render hosting is a coherent fit for an authenticated internal AISEO operations tool: heavy editors, ReactFlow canvases, TipTap, bulk tables, streaming LLM output. SSR would add cost with no SEO benefit for a logged-in tool. Keep this foundation.

**Is it logically coherent as built? Partially.**
The core data path is coherent. The seams are not: two routing systems, two UI kits, three mobile paths, at least four server runtimes, and a dev server that reimplements the backend. This is accretion over time, not a wrong foundation.

**Is it safe to run as an internet-facing production system today? No.**
Unauthenticated API routes, secrets shipped in source and stored in the browser, secrets at rest in a web-readable uploads folder, and a fail-open publishing pipeline are ship blockers. These are fixable in waves (Section 9) without a rewrite.

**Is the SEO logic sound? Mixed.**
Research grounding and deterministic guardrails are strong. Content doctrine and failure handling are not.

Scorecard (auditor judgement from evidence below):

- Research grounding: 8/10
- GSC reporting: 8/10
- Link and schema mechanics: 7/10
- Agent contracts: 5/10
- Orchestration honesty and maintainability: 4/10
- Failure safety: 3/10

### First, a workspace fact

The folder opened for this workspace, `b:\Neo Pulse\pulse`, contains 0 files. The real git root is `B:\Neo Pulse` (verified: `git rev-parse --show-toplevel` returns `B:/Neo Pulse`, 6,162 tracked files). `.gitignore` lists `pulse/` as a nested clone folder. Any agent, script, or doc that trusts the `pulse` path is working on an empty folder. Fix the pointer wherever it is written down.

## 2. Architecture as found

- Boot: `index.html` to `src/main.tsx` to `src/App.tsx`. `main.tsx` seeds a runtime DataForSEO key and fires a studio inventory init before first paint (`src/main.tsx:1-15`).
- Provider stack in `App.tsx` is nine deep, with only 7 real React Router routes (`/login`, `/register`, `/huddle`, `/`, two organic routes, `/manager/hosting`, catch-all).
- The real router is inside the app: `src/pages/Index.tsx` (830 lines, verified) resolves about 23 workspaces from `window.location.hash` plus the `neo-pulse-manager-tab` localStorage key, then drills about 40 props into `src/components/manager/ManagerWorkspace.tsx` (597 lines, verified).
- API choke point: `backendApiUrl()` at `src/lib/wordpress-api/connection.ts:37-49` normalizes every browser call to same-origin `/api/*`. In dev, Vite proxies to a local WordPress at `neopulse.local` and `vite.config.ts` refuses non-local targets. In production the hub WordPress plugin dispatches `/api/*` early on `init` and exits (`wordpress-plugins/neo-pulse-app/includes/router/class-api-dispatcher.php`, `dispatch()` at line 103).
- Server runtimes: (1) PHP hub plugin, about 614 PHP files; (2) PHP client plugin `neo-pulse-wp`; (3) Node `hosting/neo-host-api/server.mjs` on raw `node:http` with Postgres; (4) Node job and worker servers in `scripts` and `apps/game-copilot`; (5) six Vite dev plugins that reimplement API behavior locally.
- Agent layer: `src/lib/agent-pipeline/index.ts` (about 383 lines) is a local, browser-safe reimplementation of Mastra-style `createPulseAgent`, `createStep`, and `createWorkflow` with zod schemas and category model routing. There is no `@mastra` dependency in `package.json`. `docs/api/mastra/overview.md` is candid about this, but the 308-file scraped upstream playbook in `docs/api/mastra/playbook/` describes memory, evals, harness, and suspend/resume that this engine does not have.
- Scale (verified 2026-11-05): `src` has 3,576 files and 516,050 lines of TS/TSX by line count of `*.ts` and `*.tsx` under `src`; `src/lib` alone is about 2,469 files. Plugins add about 896 PHP files. `scripts` has 285 files.

## 3. What is genuinely good

Keep and build on these:

1. **One API choke point.** `backendApiUrl()` (connection.ts:37-49) means deploy and base URL differences live in one place. The PHP side has a route registry parity test (`wordpress-plugins/neo-pulse-app/tests/route-registry.mjs`, re-run green, Section 8).
2. **Auth mechanics where auth exists.** HMAC-signed session cookie with `hash_equals` and httpOnly, `password_hash` and `password_verify`, team membership and role checks in the teams gateway, owner-only team delete. Sampled SQL uses `$wpdb->prepare`; the hosting API uses parameterized `pg` queries.
3. **External API discipline in places.** GSC service-account RS256 JWT with transient token caching, `curl_multi` parallel paths for GSC stats and Semrush reports, a DataForSEO MCP tool whitelist plus payload sanitizer, transient-error retry with backoff, WordPress inventory requesting only needed `_fields` at 100 per page.
4. **SEO grounding is real, not decorative.** DataForSEO SERP and PAA, Semrush clusters, GSC queries, GBP and master instructions, and WordPress inventory are assembled into a brief before generation. Prompts forbid invented counts, testimonials, neighborhoods, and URLs. A factual verification pass checks claims against official domains.
5. **Anti-hallucination link architecture.** Writers emit `[[LINK:query|anchor]]` placeholders only. Code resolves them against verified inventory, drops unresolvable ones, blocks self-links, and restricts external hrefs to Semrush and Wikipedia allowlists. This is the correct code and LLM split.
6. **Deterministic guardrails around the LLM where it matters most.** Sitemap clustering enforces 100 percent catalog coverage, geo cluster separation, and overlap resolution in code, with a reconcile retention floor. GSC reporting uses a strict JSON schema outline (`strict: true`, `additionalProperties: false`) and pins numbers from deterministic tables while the model only narrates prose.
7. **Some genuine fail-fast.** Checklist generation throws below a minimum item count, the harness has a token budget preflight, Answer sections have contract assertions, topic fan-out throws on malformed output, and the EMCP agents use real zod input and output schemas (`src/lib/emcp/neo-emcp-mastra-agents.ts:31,85,136`).
8. **UI primitives are well built.** `src/ui/registry.ts` and `src/ui/tokens.ts` hold one control vocabulary. Primitives enforce fixed-width state cycling and required aria labels for icon buttons. `UnifiedWorkspaceChrome` keeps three fixed bands and reserves title slots with invisible longest-label grids, which is correct zero-CLS practice. The 1rem type floor is mapped at the Tailwind token level (`tailwind.config.ts`), so `text-xs` and `text-sm` resolve to 1rem.
9. **Test volume.** 905 test files ran in the full suite (Section 8), almost all pure logic over `src/lib`. The circular import check is green. The WordPress client plugin keeps its version triple in sync (plugin header, `NEO_PULSE_WP_VERSION`, readme stable tag, all 0.9.267) and its standalone PHP test passes.

## 4. Critical findings

### C1. Client WordPress credentials are committed and shipped in the bundle

`src/components/integrations/default-properties-seed.json` contains `appPassword` entries for 17 client sites (verified by parsing the JSON on 2026-11-05; values are not reproduced here). It is imported by the integrations storage layer, so it ships in the static JS bundle, and the dev proxy can also serve it. These credentials allow post create, update, and delete through the WordPress proxy routes.
Treat all 17 as compromised: rotate every app password, delete the seed from source and from git history, and move site credentials server-side.
Why the guard missed it: `scripts/check-no-secrets.mjs` scans only staged files (`git diff --cached`, lines 44-52 and 94) and its content patterns (lines 30-43) cover only `GOCSPX-`, two GMB secret defines, `sk-or-`, and PEM keys. WordPress app passwords, Slack tokens, and service-account JSON content are invisible to it. The scanner re-ran green on 2026-11-05 while this file sits tracked in the repo, which proves the gap.

### C2. Most `/api/*` endpoints have no server-side auth

- The hub dispatcher performs no session check before routing (`class-api-dispatcher.php`, `dispatch()` at line 103).
- DataForSEO access control is a stub. Verified at `class-dataforseo-route-handlers.php:90-93`: `can_access()` unsets the request and returns `true`. Semrush has the same shape (`class-semrush-route-handlers.php:52`).
- GSC, WordPress, and overview REST registrations use `permission_callback => __return_true` (for example `class-gsc-route-handlers.php:49`, `class-wp-route-handlers.php:23`, seven occurrences in `class-overview-route-handlers.php`).
Consequence for any internet caller: read GSC, GA, and Ads data reachable by server credentials, burn OpenRouter, DataForSEO, and Semrush quota, and invoke writes, including Google Ads campaign publish with stored MCC tokens and WordPress post create, update, and delete. The hub is publicly reachable per `render.yaml`, so this is not a theoretical internal-only exposure. Section 10 lists what could not be verified about compensating controls.

### C3. Server secrets are returned to, and overwritable by, the browser

Verified at `class-integrations-route-handlers.php:47-56`: `GET /api/integrations/resolved-openrouter-key` returns the server OpenRouter key in plaintext, with no auth check in that path. The client then saves it to localStorage (`src/lib/openrouter-api-key-resolve.ts`). Manager load endpoints return all sites with plugin access tokens and the full keys snapshot, and sync endpoints (for example `sync-email-worker-keys` at line 67 of the same file, plus manager sync routes) overwrite server keys with no auth.

### C4. Secrets at rest in a web-readable uploads folder

Verified in `wordpress-plugins/neo-pulse-app/includes/storage/class-neo-pulse-data-paths.php`: the data root is `wp-content/uploads/neo-pulse-data` (lines 12-21), holding `sites.json` (line 86-88), `manager-settings.json` (line 90-92, all API keys), `ga-service-account.json` and `gsc-service-account.json` (lines 98-104, private keys), GMB and Google Ads OAuth configs and tokens (lines 106-128), and more. Protection is only an `index.php` silence file written at creation (lines 17-19). The WordPress Docker image in this repo adds no deny rules for that path. On a stock WP and Apache stack, predictable URLs such as `/wp-content/uploads/neo-pulse-data/manager-settings.json` are directly fetchable unless the production host adds rules outside this repo (unverified, Section 10).

### C5. The browser is the credential vault

localStorage holds OpenRouter, DataForSEO, Semrush, AgentMail, and Slack credentials (Slack bot token plus client secret and signing secret in `src/lib/api.ts`), WordPress sites including app passwords (`src/components/integrations/storage.ts`), and the user email plus account password in plaintext (`src/lib/auth-device.ts`). `vite.config.ts:20,49` also inlines `VITE_OPENROUTER_API_KEY` into the client bundle via `define`. Any XSS or bundle scrape is a full credential loss. This directly contradicts the workspace server-side-only rule. The PHP proxy exists and is the default path, but the direct path was never removed: 15 files under `src` reference `https://openrouter.ai/api/v1` (verified by search on 2026-11-05), and `src/lib/nap-extractor.ts` calls client sites' `/wp-json/` directly from the browser with Basic app passwords.

### C6. The hosting API trusts self-asserted identity

Verified in `hosting/neo-host-api/lib/auth.mjs:15-22`: without the service token, any caller supplying `X-Neo-Pulse-Team-Id` and `X-Neo-Pulse-User-Id` headers is authenticated, and `X-Neo-Pulse-Hosting-Write: 1` self-grants write. Tenant scoping keys off that spoofable team id, at least one job creation path skips the write check, and CORS is `*` in `server.mjs`. Direct callers can list, provision, and delete hosted sites and trigger Render deploys.

### C7. The publishing pipeline is fail-open and will publish invented filler

Verified at `src/lib/bulk/bulk-row-content-media-phase.ts:478-491`: on any markdown pipeline error, the code logs a warning about generating a resilient article synthesis so WP upload succeeds, then fabricates a templated article (generic overview plus one canned paragraph per blueprint section) and proceeds. Per-section, a failed or empty model call falls back to a generic paragraph in the harness, and HTML QC failure explicitly keeps the stitched HTML.
Verified at `src/lib/bulk/harness-section-validate.ts:212-221`: `validateHarnessSectionOrThrow` is an intentional no-op ("section HTML ships from the model as-is"), while strict assert functions next to it go unused in the harness path. The harness only warns when a section fails validity.
This is the single most important product defect: thin templated content can publish under client brands with no human-visible failure. Make generation fail visibly instead (Wave 2).

### C8. Every enforcement gate is broken, and nothing watches them

All re-run on 2026-11-05, full log in Section 8:

- `npm run lint` fails immediately: `eslint.config.js:5-13` imports five constants from `./eslint.pulse-ui-rules.js`, which does not exist in the repo (`git ls-files` confirms it was never tracked). `npm run ui:check` fails the same way via `scripts/pulse-ui-audit.mjs:10`, and `package.json` also points at a missing `scripts/generate-ui-catalog.mjs`. So the UI registry enforcement the workspace rules rely on cannot run.
- The build (`package.json:9`) is stamp, bundle catalog, `vite build`, write build info. No `tsc` anywhere. `tsconfig.app.json:19-23` sets `strict: false`, `noImplicitAny: false`, `noUnusedLocals` and `noUnusedParameters` false. Manual `tsc --noEmit` reports **1,236 errors** (TS2345 x363, TS2339 x222, TS2322 x136, TS2741 x103, TS2739 x102, TS2353 x95, TS2304 x66). Some are real bugs, for example a duplicate `inventoryRows` identifier and two undefined identifiers in components. SWC transpiles past all of them.
- Full test suite is red: **52 of 905 test files failed, 93 of 4,731 tests failed, 3 unhandled errors** (Section 8). One verified cause is mock drift against a renamed export in `entity-site-warm-cache`.
- Storybook 8 is declared with stories in `src/ui`, but there is no `.storybook` directory. There are no `.github/workflows` at the repo root. The only gate is a pre-commit secret scan that misses the worst case (C1).

### C9. A demo credential is hardcoded in source

`src/lib/auth-disabled.ts:5-8` defines `AUTH_DISABLED = false` plus a `LOCAL_DEMO_PASSWORD` constant (value not reproduced here). The auth context auto-saves device auth on first `checkAuth`. Remove the constant, rotate anything it ever unlocked, and delete the auto-save path.

### C10. Unauthenticated server-side fetch and callback surface

- `POST /api/proxy/fetch-text` fetches arbitrary https URLs server-side. Private-IP checks are literal-host only, so DNS names resolving internally and redirect targets (redirects are followed) bypass them. The WordPress proxy likewise fetches any caller-supplied `siteUrl` from the hub.
- Google Ads and GMB OAuth callbacks omit `state` (verified: no `state` handling in `class-google-ads-oauth.php`), so any code can be exchanged and stored tokens overwritten. Login CSRF and token substitution against agency Google tokens.
- Webhooks fail open: the AgentMail webhook accepts everything when no secret is configured, and the Chekkit webhook has no verification, appends unbounded attacker JSON to a log file, and relays attacker-named mail.

## 5. High findings

- **H1. Two routing systems.** React Router owns 7 routes. Everything else is hash strings, a localStorage key, and at least five separate hash parser modules, plus a hash auth redirect. Screens are not shareable URLs, back-button behavior is hand-maintained, and each new workspace registers in a `Set`, a hash parser, and the workspace switch separately.
- **H2. God files and prop drilling.** Verified by line count on 2026-11-05: 159 files over 500 lines, 51 over 800, 27 over 1,000 in `src`. Largest: `EntityGenerationFeature.tsx` 2,675, `useVideoGenerator.ts` 2,564, `LocalAnalysisPanel.tsx` 2,053, `MetaOptimizerPageRowDetails.tsx` 2,050, `CompetitorResearchTab.tsx` 2,014. `Index.tsx` (830) owns auth-adjacent state, all LLM settings, knowledge files, and navigation, then drills about 40 props into `ManagerWorkspace.tsx` (597).
- **H3. The agent registry is a descriptive catalog, not the system of record.** `pulse-agent-registry.ts` (468 lines by Get-Content count) holds 50 entries while `docs/api/mastra/agent-registry.md` says 37 and lists at least one agent that is not in the registry. Verified: only 7 agents actually call `createPulseAgent` (3 EMCP, AgentMail intake, Drive disambiguator, automation email intro, CSV questions extractor). The other 100-plus agent files call OpenRouter helpers directly with hand-built prompts and hand parsers. At least a dozen sitemap-optimizer agent files are unregistered. The framework contract test fails today (Section 8): 8 hardcoded model ID violations. Docs and UI labels still say Mastra, so a maintainer searching for `@mastra/core` memory, storage, or evals will find none.
- **H4. Structured output is the exception, not the contract.** Good islands: EMCP (zod) and GSC reporting (strict JSON schema). Elsewhere: framework default `json_object` (`agent-pipeline/index.ts:109-114`), hand parsers, a 411-line regex JSON repair utility (`src/lib/json-repair-utility.ts`, verified line count) used in 20-plus files, a duplicated copy of the same repair logic inside `keyword-ai-analyzer.ts`, balanced-brace slicing in sitemap parsers, fuzzy Levenshtein reassignment of competitor clusters, and a PHP proxy that manufactures a parsed `{text, content}` object when the model returns non-JSON (`class-openrouter-chat-completion-route.php`), masking contract failure before the client sees it. Meta batch parse failure returns an empty array and silently drops rows (`overview-ai-all-meta-batch-parse.ts`), so a failed batch looks like partial success. Fix at the prompt and schema level per wave, never with more repair code.
- **H5. Silent model fallback breaks category routing.** Verified: `src/lib/openrouter-app-api.ts:194` sets a hardcoded fallback model and the request sends a models array, so OpenRouter may silently serve a different model than the configured category model, at different cost and quality, while the prompt trace records only the requested model. Combined with retry loops and a hardcoded video-category substitution, which model wrote a given article is not actually knowable.
- **H6. Sitemap parse failure masquerades as no merges.** `parseClusterResultJson` returns empty clusters and singletons on any failure. Coverage enforcement then turns everything into singletons, indistinguishable from a legitimate no-merge result. A downstream human approve gate limits the blast radius, but the failure signal is lost. There is also a latent bug where standalone proposals force `action: "refresh"` regardless of the model output.
- **H7. Prompt contradictions in the core blog flow.** `blog-template-checklist-generate.ts` is about 1,200 lines with two mutually exclusive keyword regimes behind a flag: with first-party authority it demands semantic breadth and at most one exact phrase per H2; without it, it demands about 1.0 percent exact-phrase density and the exact keyword in every H2, while the same block says avoid keyword stuffing and natural language first. `blog-template-blueprint-generate.ts` states a 60 character title max in one section and exactly 50 or less, no exceptions, in another, then relies on the LLM counting characters before code truncates anyway. Both run at temperature 1.0. Same keyword, different incidental site state, materially different SEO doctrine.
- **H8. Outdated SEO tactics are codified.** Mandatory one table plus one bulleted list plus one numbered list in every article, a `[LINK]` in every section with per-H2 internal link minimums, SAP titles that must contain "near {entity}", and templated FAQ answers ("For expert guidance on {question}, contact our team...") emitted as FAQPage JSON-LD at scale in the WordPress uploader. The markup is syntactically valid, but templated non-answers and formulaic titles are the patterns scaled-content-abuse and helpful-content systems target, and FAQ rich results are now largely restricted to government and health sites, so the SERP value is mostly illusory. Also in this bucket: keyword intent classified by substring ladder (`keyword-api.ts`) instead of AI, competitor keyword filtering that returns keywords unfiltered on error (fail-open), and a 400-line word blacklist enforced by regex scrubbing finished HTML, which can leave broken grammar in published copy. Deterministic enforcement of banned words is fine; scrub-after-write instead of validate-and-reject is the problem.
- **H9. The Vite dev server is a shadow backend.** Six `scripts/vite-*-plugin.mjs` modules execute API behavior in dev; the local WP proxy plugin alone is 635 lines and special-cases studio snapshot, logo upload, MCP, agent runs, teams, and auth. Verified behavior from the audit pass: upstream 504 becomes `200 {ok: false, workflows: [], tasks: []}`, DataForSEO 400 and 422 become `200 {skipped: true}`, and on connection failure it returns a fake `auth/me` user, a fake login token, a fake Default Team, and the password-bearing seed file (C1). TLS verification to the upstream is disabled. The UI is trained to treat backend-down as empty success, and any behavior implemented only in the dev plugins is a dev/prod parity bug the route registry test cannot catch.
- **H10. Duplicated systems mid-migration.** UI: `src/components/ui` (about 50 shadcn files) still has about 272 imports versus about 414 for `@/ui`, `components.json` still aliases `ui` to `@/components/ui`, and 173 files outside the UI layers import `@/components/ui/*` directly, including controls that have registry equivalents (checkbox in 30 files despite `CheckField`, dialog in 24, button in 9, input in 8). Library domains: `lib/competitor` plus `lib/competitor-analysis` plus `lib/competitor-research`; `lib/content` plus `lib/content-generation` plus `lib/content-optimization` plus `lib/content-optimizer`; `lib/wordpress` (1 file) plus `lib/wordpress-api` (32). Retired EMCP is still live in client code, in PHP route handlers, and in a hash migration shim. Mobile: root Capacitor 7 with `android/` and a second Vite entry (`mobile.html` to `AppMobile.tsx`, a near-copy provider stack), a separate `neodigital-mobile-app` on Capacitor 6 wrapping a WebView, and the responsive web app itself. Hosting agent entry points exist as tiny `.ts` re-export shims over `.mjs` originals.
- **H11. Concurrency and fetch-shape risks.** The JSON file store write is crash-safe (tmp plus rename) but every read-modify-write (manager key merge, sites sync, email worker keys) is unlocked, so concurrent saves silently clobber. Agent run locking is a non-atomic get-then-set transient with a 300 second TTL while runs may execute 900 seconds, and the cron can re-enter processing. GSC per-page performance chunks by concurrency constants but executes sequentially in PHP, with multiple paginated candidate queries per page; one batched page-plus-query dimension query, as `site_wide_rows` already does, would replace it. WordPress inventory converts a 401 into `200 {error: "Authentication failed."}`, so HTTP monitoring sees success.
- **H12. Debug telemetry ships in production code.** Verified by search: 34 fetch calls to `http://127.0.0.1:7781/ingest/...` across 5 files (for example `src/lib/overview/overview-blog-local-image-generate.ts:656`, `src/lib/overview/sap-cross-site-image-search.ts:402`, `src/hooks/overview/use-overview-tab-blog-in-content-image.ts:115`). Payloads include entity names, row titles, focus keywords, and URLs, silently swallowed with `.catch(() => {})`. This ships to every user and leaks content metadata to any local listener on that port. Also: about 1,185 `console.*` calls in `src`.
- **H13. Repo hygiene contradicts its own rules.** Verified: 410 tracked files under `tmp` (screenshots, JSON dumps, one-off probes) while `.gitignore` says such dumps are never committed; also tracked pid and JSON dump files at root, and a 0-byte `UniversalStudioHeader.test.ts` at repo root that no vitest include pattern picks up. `neo-agent-hub` is a separate nested git repo (own workspaces, own `render.yaml`) with 1 file tracked in the parent. `apps/game-copilot` is an unrelated app with its own manifest. `scripts` has 285 files and `package.json` about 70 scripts, including duplicate provisioning aliases. It is not a monorepo (no workspaces in root `package.json`); it is several repos in one folder, so no single install, build, or test covers the tree.

## 6. Medium and low findings

- **State lives in three places at once.** React Query is configured in `App.tsx` but only about 10 files use it. Server state is hand-rolled `useEffect` plus fetch plus bespoke caches, alongside 14 React contexts and localStorage in 135 files (about 389 operations, 55 storage key constants). There is no single persistence contract, so where a setting lives is answered per feature.
- **Performance: almost no code splitting.** Exactly one lazy import in the app (the API docs tab), with a null Suspense fallback. `Index` and `ManagerWorkspace` eagerly import about 40 tab modules, pulling Recharts, D3, Leaflet, pdfjs, TipTap, and ReactFlow into the initial path. No manual chunks. One `React.memo` in components despite hundreds of memo hooks, and no list virtualization for long grids.
- **Chrome coverage gaps.** 13 of 19 workspace headers use `UnifiedWorkspaceChrome`. Six hand-roll their bands (video, workflow, proposal, SAP generator, competitor generator, press release), so heights and Details behavior diverge from the fixed band contract. These are backlog fixes under the existing chrome, not new layouts.
- **Component tests effectively do not exist.** Vitest runs in a node environment, includes only `src/**/*.test.ts`, and there is no DOM testing library and zero `.test.tsx` files. The 4,731 cases are logic tests. Only a handful render markup via `renderToStaticMarkup` string assertions. No interaction tests for any component, hook, or page, and no coverage measurement or thresholds anywhere.
- **Rule violations the broken lint should catch.** Spinners: `animate-spin` in the agent library header and decision tree content, a `Loader2` import in the image generator settings panel, `animate-pulse` skeleton. Sub-1rem text: `text-[10px]` and `text-[11px]` in decision audit badges and decision tree content, `0.9375rem` in the mobile theme. Stacked labels in legacy forms (102 label elements across about 43 files, worst in video script and entity generation). Exact duplicate components across the Meta Ads and Social Creator clusters (dark select, toolbar export menu, image references section are byte-equivalent after name normalization). These matter because the workspace rules forbid each pattern, and with lint broken (C8) they accumulate silently.
- **WordPress client plugin (`neo-pulse-wp`).** Version discipline is good and the standalone PHP test passes (Section 8), but that test pins a stale version constant (0.9.266 versus shipped 0.9.267), there is no composer or phpunit setup, and three PHP files exceed 2,400 lines (backend assist content prep at about 3,116, chat at about 2,493, chat links at about 2,454). Capability checks on its REST routes sampled correctly; it was not fully audited.
- **Local dev is Windows-locked and heavyweight.** `scripts/start-local.ps1` requires Docker Desktop, creates junctions into a WP staging install, and hardcodes temp job dirs. The mandated path is `npm run dev` via `scripts/dev.cjs`; raw `npx vite` is guarded against for good reason. It works, but onboarding is a four-process orchestration tied to this machine shape.
- **Observability and cost.** The prompt trace is in-memory only and holds full prompts and responses, which can include client data. There are no eval scorers for factuality, link validity, or density in CI; the one contract test that exists is failing. A single bulk row can trigger fan-out planning, SERP fetch, authority fetch, verification, claims extraction, checklist (16k tokens), blueprint, link planning, per-section calls, an LLM HTML QC pass, and meta, title, and image agents. Category model routing helps, but per-run budget enforcement does not exist; cost estimates are display-only.
- **Low:** vendored phpseclib committed inside the hub plugin (defensible for WP, but review surface); an empty `logBackendConnectionFailure()` in connection.ts; a try/catch that only rethrows in `App.tsx`; dead timeout-floor code (`class-http-timeouts.php`) never loaded, so intended timeout floors do not apply; exception messages echoed to API clients; invalid JSON bodies silently becoming empty arrays in the dispatcher; Semrush keys in URL query strings; a revoked OpenRouter key fingerprint hardcoded in the secrets loader; a legacy local Ollama field marked never used. Backend tests are mostly string-presence assertions over PHP sources, not behavior tests.

## 7. SEO soundness, feature by feature

- **Overview / AISEO grid:** strong batch discipline. Meta and keyword batches require one result per allowed URL and filter anything else. Weakness is downstream: the meta parser drops failures silently and length rules are prompt-only, never validated in code.
- **Bulk blog generator:** the best-researched flow and the least safe publisher. Grounding, checklist fail-fast, blueprint count enforcement, link-target planning from real inventory, and upload-prep QC are genuinely good. The fail-open synthesis (C7), no-op validator, silent model fallback (H5), and contradictory keyword regimes (H7) undo that at the last mile.
- **Keyword research:** DataForSEO overview plus GSC fallback plus AI suggestions is a sound shape. Intent by substring ladder and fail-open competitor filtering (H8) are the weak points. Both are AI-first candidates under the workspace rules.
- **Sitemap optimizer:** deterministic guardrails (coverage, geo separation, overlap, retention floor) are the model the rest of the system should copy. Parse failure signaling (H6) and the forced refresh bug are the fixes needed.
- **GSC reporting:** the best-contracted flow in the repo. Strict schema, fail-fast on missing GA4, deterministic numbers, resumable pipeline. Hold this up as the reference implementation for Wave 2.
- **Schema output:** FAQPage JSON-LD is syntactically valid, but templated answers at scale (H8) make it a policy risk with little current SERP upside. Internal-link mechanics (placeholders, inventory resolution, no self-links) are sound; per-section link quotas are not.
- **Client plugin SEO (`neo-pulse-wp`):** sampled permission callbacks and the overseer beacon (rate-limited) look correct. Not fully audited; treat as unknown, not as cleared.

## 8. Verification log (re-run 2026-11-05, agent background shell)

Commands run from `B:\Neo Pulse`. Pre-existing dirty files in `git status` (UI primitives, glossary, one tmp report) were not touched by this audit.

- `git rev-parse --show-toplevel` returns `B:/Neo Pulse`. Tracked files: 6,162. Tracked under `tmp`: 410. Files in `b:\Neo Pulse\pulse`: 0. `eslint.pulse-ui-rules.js`: absent and untracked. `scripts/generate-ui-catalog.mjs`: absent. `.storybook`: absent. `.github/workflows`: absent.
- `npm run lint` fails in about 3s: `ERR_MODULE_NOT_FOUND` for `eslint.pulse-ui-rules.js` imported from `eslint.config.js`. Exit 2.
- `npm run ui:check` fails the same way via `scripts/pulse-ui-audit.mjs`. Exit 1.
- `npx tsc --noEmit -p tsconfig.app.json` reports 1,236 errors: TS2345 x363, TS2339 x222, TS2322 x136, TS2741 x103, TS2739 x102, TS2353 x95, TS2304 x66, TS2367 x28, remainder spread. Note: the build never runs this.
- `npx vitest run src/lib/__tests__/universal-agent-contract.test.ts`: 3 passed, 1 failed. The failing test lists 8 hardcoded model ID violations across agent library, prompt bulk, decision tree, OpenRouter category and app APIs, and video agents.
- `npx vitest run` (full): 52 of 905 test files failed, 853 passed. 93 of 4,731 tests failed, 4,638 passed. 3 unhandled errors. Duration about 27s of test time. Example verified failure: `entity-site-warm-cache.test.ts` mock drift, the mocked module no longer exports `readWarmUrlMirrorSync` used at `entity-site-warm-cache.ts:484`.
- `php wordpress-plugins/neo-pulse-wp/tests/test-neo-pulse-wp-mcp.php`: ALL NEO PULSE MCP & GUARD TESTS PASSED. Exit 0.
- `node wordpress-plugins/neo-pulse-app/tests/route-registry.mjs`: exit 0, no output. The registry parity contract holds for routes. It cannot cover behavior parity (H9).
- `npm run check:no-secrets`: exit 0. Also proof of the C1 gap: it scans only staged files and only five content patterns.
- `npm run check:circular`: exit 0. No circular imports in prompt/content leaf modules, no forbidden TDZ edges.
- Seed credential count: parsed `default-properties-seed.json`, 17 `appPassword` entries. Values not printed or stored in this report.
- Line counts (Get-Content): `Index.tsx` 830, `ManagerWorkspace.tsx` 597, `EntityGenerationFeature.tsx` 2,675, `useVideoGenerator.ts` 2,564, `LocalAnalysisPanel.tsx` 2,053, `pulse-agent-registry.ts` 468, `json-repair-utility.ts` 411, `class-api-dispatcher.php` 430, `bulk-row-content-media-phase.ts` 463, `eslint.config.js` 46. Files in `src` over 500 lines: 159; over 800: 51; over 1,000: 27. `src` totals: 3,576 files, 516,050 TS/TSX lines.
- Direct OpenRouter references in `src`: 15 files match `openrouter.ai/api/v1`. Localhost debug ingest: 34 matches across 5 files.

## 9. Fix backlog (each wave separately approved, severity first)

No wave is authorized by this audit. Each wave gets its own plan with files and line counts measured at that time, its own verification, and the mandatory final review.

### Wave 0, stop the bleed (security, do first)

- Rotate all 17 seeded WordPress app passwords and any credential ever synced to `manager-settings.json` or returned to a browser. Assume compromise until rotation is proven.
- Delete `default-properties-seed.json` from source and purge from git history. Remove the `LOCAL_DEMO_PASSWORD` constant and its auto-save path, and rotate anything it unlocked.
- Require an authenticated session (and team membership where relevant) on every `/api/*` route in the dispatcher and every `__return_true` and stub `can_access` registration. Fail closed.
- Remove `GET /api/integrations/resolved-openrouter-key` and every endpoint that returns server keys, plugin tokens, or full credential snapshots to the browser. Server keys never leave the server.
- Move secrets out of `wp-content/uploads/neo-pulse-data`, or add server-level deny rules for that path in the Docker image and verify with a live fetch against staging. Never rely on a silence `index.php`.
- Fix hosting API identity: remove header-asserted auth, require the service token or a verified session, scope tenants server-side, and lock CORS to known origins.
- Add `state` to Google Ads and GMB OAuth flows and verify it on callback. Add webhook signature verification with fail-closed behavior. Constrain the URL fetch proxy: resolve and block private IPs after DNS, re-check after redirects, allowlist where possible.
- Murphy check for this wave: staging first (never a live client site), confirm no production compensating control already covers a route before changing it, and have credential rotation owners named per client.

### Wave 1, restore the gates

- Recreate `eslint.pulse-ui-rules.js` and `scripts/generate-ui-catalog.mjs` so `npm run lint` and `npm run ui:check` run. Fix what they surface in the files already violating rules (spinners, sub-1rem text, registry bypasses with existing equivalents).
- Add a typecheck script and run it in the build. Triage the 1,236 errors by category; fix the real bugs first (duplicate and undefined identifiers), then decide per category whether strict flags can be enabled incrementally. Do not flip `strict: true` blind.
- Triage the 93 failing tests: fix mock drift, delete or repair the 0-byte root test, and get the contract test green by removing the 8 hardcoded model IDs.
- Restore `.storybook` config so the UI catalog the rules point to can start. Add CI at the repo root that runs lint, typecheck, and tests so red is visible. Extend `check-no-secrets` to scan tracked files for app passwords, Slack tokens, and service-account JSON, not only staged files and five patterns.

### Wave 2, publish safety (prompt and contract level)

- Delete the resilient synthesis fallback in `bulk-row-content-media-phase.ts` and the per-section generic paragraph fallbacks. Generation failure stops the row with a visible error. Nothing templated reaches WordPress.
- Wire the existing strict validators as gates: the no-op `validateHarnessSectionOrThrow` either enforces or is removed, and HTML QC failure blocks upload. Meta batch parse failure surfaces as an error, not an empty result.
- Prompt-level strategy for this wave: one keyword doctrine across both regimes (delete the density and every-H2 regime), one title limit enforced by schema and code truncation rather than model counting, strict JSON schema or zod on every agent that feeds publishing, and sitemap parse failure as an explicit error state instead of silent singletons. Code parses, validates, and fails visibly. No new repair or substitution branches.
- Remove the fallback model array. Record the model that actually served in the prompt trace. Persist the trace server-side with client data handling decided explicitly.

### Wave 3, server-side only

- Remove all 15 browser-direct OpenRouter paths and the direct DataForSEO and client `wp-json` browser calls. Browser code calls `backendApiUrl('/…')` only; keys stay server-side, including removing the Vite `define` injection and the localStorage key vault.
- Remove the 34 localhost debug ingest calls.
- Remove fake success responses from the Vite dev plugins (fake auth, fake team, seed file serving, error-to-success conversions) and restore TLS verification. Dev must fail like production fails.
- Converge the duplicate Node and PHP API implementations (dev OpenRouter and DataForSEO shims) onto the PHP handlers, and retire dead clients such as the localhost service polling manager.

### Wave 4, architecture cleanup

- Pick one routing model: real React Router routes for workspaces (preferred for shareable URLs), and delete the hash parsers and localStorage tab routing. One registration point per workspace.
- Finish the `@/ui` migration for controls with registry equivalents, then delete `src/components/ui` imports outside the UI layer and fix the `components.json` alias. Six non-chrome workspace headers move onto `UnifiedWorkspaceChrome` as-is, with no new header designs.
- Pick one mobile path and delete the other. Merge duplicate library domains (competitor, content, wordpress) and remove live legacy EMCP from client and PHP. Decide explicitly whether `neo-agent-hub` and `apps/game-copilot` live here or in their own repos, and clear tracked `tmp` and root dump artifacts.
- Split the god files along their existing seams, starting with the five over 2,000 lines, and add route-level code splitting for heavy tabs. Keep each resulting module under about 500 lines.

### Wave 5, SEO doctrine and evals

- Remove mandatory list and table quotas and per-section link quotas from prompts and validators. Keep inventory-resolved linking and allowlists.
- Stop emitting templated FAQ answers as FAQPage JSON-LD. FAQ content must be a real answer per question or the schema is omitted.
- Replace keyword intent substring ladders and fail-open competitor filtering with OpenRouter plus schema classification that fails visibly.
- Change the word blacklist from scrub-after-write to validate-and-reject with a visible failure.
- Add output evals to CI: factuality spot checks against briefs, link resolution rate, and schema validity per publishing agent. Validate default model IDs against the OpenRouter catalog at startup, add per-run budget enforcement, and resolve the registry drift by either enforcing `PULSE_AGENT_REGISTRY` in tests or deleting it as documentation. Rename Mastra references to the local engine name, or adopt real Mastra deliberately. Do not leave the label drift.

## 10. Open questions (only production access can answer)

Stated as unknowns, not assumptions:

- Does production have compensating controls outside this repo (access proxy, WAF, private networking, uploads deny rules) that cover the unauthenticated routes and the `neo-pulse-data` path? None are in `render.yaml` or the Docker image.
- Have the 17 seeded app passwords, the demo credential, and any keys ever synced to `manager-settings.json` already been rotated? Git history says they were exposed; only credential owners can confirm rotation.
- Is `VITE_OPENROUTER_API_KEY` actually populated in the Render static build environment (`sync: false` in `render.yaml`)? If yes, that key is public and must rotate.
- Where is `neo-pulse-app` active besides the hub, and what are the production values and rotation state of the hosting API token and hub flags?
- How reliable is WP-Cron for agent runs in production, and has the non-atomic run lock ever double-executed a run?
- Runtime behavior of the local WordPress at `neopulse.local` and live parity between dev plugin shims and PHP handlers were assessed statically. No live probing, no staging writes, and no client site changes were performed.

## 11. Bottom line

Keep the stack. The Vite and React SPA, the WordPress hub API, the client plugin, the grounding-first SEO research, the inventory-resolved linking, the GSC reporting contract, and the sitemap guardrails are worth keeping and are better than typical for a codebase this size.

Do not trust bulk publish, the public API surface, or any credential that has touched this repo until Waves 0 to 2 land. The framework is valid. The current production posture is not.
