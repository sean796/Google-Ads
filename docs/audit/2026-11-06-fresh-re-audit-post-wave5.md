# Neo Pulse Repo Audit: Fresh Re-Audit From Scratch, 2026-11-06 (Post Wave 5)

Date: 2026-11-06
Scope: full repo at `B:\Neo Pulse`, audited from scratch after Waves 1 to 5 of the road-to-10/10 program closed. This audit re-ran the complete battery fresh on commit `5e874624`; it does not carry forward any number from the prior audit without re-measuring it.
Method: fresh runs of the full test suite (both Vitest projects), both typechecks, ESLint (`--max-warnings 0`), gate baseline check, UI check, circular import check, secret scan (all tracked files), production build, Storybook build, WordPress hub plugin tests, hosting API tests, publishing eval lane, the three standalone PHP test suites, plus line-count and residue scans over every production file.
Status labels: **Fixed** (verified in current code), **Partially fixed** (mechanism changed, residue remains), **Open** (not addressed).

## 1. Executive verdict

**The repo holds at 9.5 / 10, grade B, with every blocking gate green from a cold run:**

1. **No production `src` file exceeds 500 lines:** 3,258 production files scanned, **0 over 500** (largest: `src/components/research/competitor/CompetitorResearchControls.tsx` and `src/lib/sitemap-optimizer/grid-prefilled-group-cluster.ts`, both 499). The 1,000-line god-file era and the 500-line mid band are both closed for `src`.
2. **PHP is the remaining file-size frontier:** 586 first-party PHP files, 0 over 2,000 lines, **17 over 1,000** (largest `class-neo-pulse-wp-chat-agents.php` at 1,847), 96 over 500. Wave 6 owns this.
3. **Every safety net passes cold:** full suite 4,885 tests pass with 0 failed (2 opt-in live tests skip without credentials; both were verified passing live earlier today), typecheck app and node both 0 errors and blocking, ESLint 0 errors and 0 warnings blocking in CI, `ui:check` green, circular imports clean, gate baseline empty, secret scan clean across 6,292 tracked files, production and Storybook builds pass.
4. **Security and agent contracts stay at 10:** C1 to C10 all fixed and test-pinned; the data root lives above the web root behind the locked migration; browser API keys are runtime-only; every model-output parse goes through the strict `model-json` door with per-flow zod schemas (the JSON repair utility is deleted); the Wave 4 factuality judge grades article claims against their source pack with deterministic citation checking.

What remains open:

1. **17 first-party PHP files over 1,000 lines** (Wave 6).
2. **Bundle follow-through:** the main chunk measured 5.73 MB fresh (5,733,259 bytes), vendor-docs-pdf (pdf.js) 2.36 MB. Feature-domain app chunking is Wave 7. Static tab imports are kept: 0 `React.lazy` and 0 `<Suspense` in production `src`, zero loading screens.
3. **Residue sweep (Wave 8):** 1,189 `console.*` calls across 264 `src` files, 2 files with `animate-spin`, 2 files with `text-[10px|11px]`, and `class-json-file-store.php` read-modify-write without `flock`.
4. **Three CI jobs still report-only** (debt ratchet, Storybook, publishing evals carry `continue-on-error: true`): Wave 9 makes them blocking.
5. **Known deploy blocker (unchanged):** the plugin loader requires `includes/agent-library/class-agent-library-route-handlers.php`, a file that was never committed, so a clean repo sync of `neo-pulse-app` cannot boot WordPress. Production is unaffected (older deploy). This must be implemented or the require removed before the next plugin deploy; it is the top backlog item.
6. **Owner-only items (unchanged):** credential rotation attestation, and promoting `sandbox/full-app-snapshot-2026-11-06` to `origin/main` on Sean's word.

## 2. Measured today (fresh runs, commit `5e874624`)

| Measure | Prior audit (2026-11-06, architecture split) | Today (fresh re-audit) |
| :---- | :---- | :---- |
| Full test suite | 0 failed; 4,808 pass, 1 opt-in skipped | **0 failed; 4,885 pass, 2 opt-in live skipped (both verified passing live when configured)** |
| Typecheck (app) | 0 errors, blocking | **0 errors, blocking** |
| Typecheck (node) | 0 errors, blocking | **0 errors, blocking** |
| Lint | 0 errors / 0 warnings, blocking in CI | **0 errors / 0 warnings, blocking in CI (`--max-warnings 0`)** |
| Gate check (`npm run check:gates`) | Green (baseline emptied) | **Green (baseline holds only the zeroed tests gate)** |
| UI check (`npm run ui:check`) | Green, 54 entries in sync | **Green: exit 0 (0 violations, 1 documented exception; 54 entries in sync)** |
| Hub plugin tests | 69 of 69 pass | **69 of 69 pass** |
| Hosting API tests | 23 of 23 pass | **23 of 23 pass** |
| Publishing eval lane | 14 of 14 pass | **30 of 31 pass (1 opt-in live judge test skipped; verified live)** |
| PHP standalone suites | MCP/guard ALL PASS | **Data paths ALL PASS; wave0 security PASSED; MCP and guard ALL PASS** |
| Production build | Passes, main chunk 5.67 MB | **Passes, main chunk 5.73 MB plus semantic vendor chunks** |
| Storybook build | Passes | **Passes** |
| Tracked files | 5,898 | **6,292 (secret scan clean across all 6,292)** |
| Production `src` files over 500 lines | 168 (29 over 1,000) | **0 (largest 499)** |
| First-party PHP files over 1,000 lines | 17 (0 over 2,000) | **17 (0 over 2,000; largest 1,847)** |
| Main bundle chunk | 5.67 MB | **5.73 MB; pdf.js vendor chunk 2.36 MB** |
| `React.lazy` / `<Suspense` in production `src` | 0 | **0 (static tab imports kept)** |
| Browser-direct `openrouter.ai` in production `src` | 0 files | **0 files** |
| Agent registry | 47 entries, contract test green | **47 entries, contract test green** |
| JSON repair utility | Deleted in Wave 2 | **Still deleted; strict `model-json` door is the only parse path** |
| `console.*` in production `src` | 1,179 calls in 237 files | **1,189 calls in 264 files (Wave 8 sweep)** |
| Circular imports | Green | **Green (0 circular imports, 0 forbidden TDZ edges)** |
| Working tree | Clean, flattened on `main` at `8ae8e154` | **Clean at `5e874624` (only dev-stack runtime files and Sean's untracked audit prompt differ); pushed to `sandbox/full-app-snapshot-2026-11-06`** |

Typing escape hatches, counted fresh today: 10 `as any` casts and 12 `eslint-disable` comments in production `src`, all pre-existing (zero added across Waves 1 to 5; the Wave 5 diff review measured net-zero on both). ESLint and both typechecks pass with them because they sit at documented legacy boundaries; sweeping them is optional hardening, not a gate failure.

## 3. Scorecard (each category out of 10)

| # | Category | Prior | Now | Basis |
| :---- | :---- | :---- | :---- | :---- |
| 1 | Type safety | 10/10 | **10/10** | 0 app and 0 node errors, blocking in `npm run build` and CI; 607 explicit `any` replaced with concrete types in the lint waves; 10 legacy `as any` casts and 12 `eslint-disable` comments remain, all pre-dating the waves, none added by them |
| 2 | Test health | 10/10 | **10/10** | 4,885 tests pass, 0 failures; 2 opt-in live tests skip unless configured (both verified passing live: hub smoke and the real-model factuality judge); 43 interaction and tab-logic tests from Wave 3; 69/69 hub plugin, 23/23 hosting, 30/31 eval lane |
| 3 | Failure safety (publishing) | 9/10 | **9/10** | Fail-visible gates and the Wave 4 factuality judge (contradicted or unsupported claims fail the report, citation-checked deterministically); remaining point is the JSON store write lock (Wave 8) |
| 4 | SEO doctrine and evals | 10/10 | **10/10** | Doctrine intact; deterministic evals pass; the decision-model factuality judge grades every article claim against its source pack, with citation verification so a judge cannot cite the article as its own evidence |
| 5 | Security and server-side only | 10/10 | **10/10** | C1 to C10 fixed and test-pinned; data root above the web root with locked counted migration and deny rules on the old folder; browser keys runtime-only, never in localStorage; secret scan clean across 6,292 tracked files; 0 browser-direct OpenRouter calls |
| 6 | Agent contracts and structured output | 10/10 | **10/10** | 47 registered agents, contract test green; every model parse goes through the strict `model-json` helper with a per-flow zod schema; the JSON repair utility (439 lines) and its test are deleted; the brand gate fails loudly instead of keeping everything |
| 7 | Gates and CI enforcement | 9/10 | **9/10** | ESLint, typecheck, `ui:check`, secrets, circular imports, plugin and host tests, and build all blocking and green; gate baseline empty; only the debt ratchet, Storybook, and evals jobs remain report-only in CI (Wave 9) |
| 8 | Architecture and performance | 9/10 | **9/10** | 0 production `src` files over 500 lines (largest 499) after the god-file, monolith, and mid-band splits; 8 semantic vendor chunks with static tab imports and no loading screens; remaining: 17 PHP files over 1,000 lines (Wave 6), feature-domain app chunking (Wave 7), pdf.js vendor chunk at 2.36 MB |
| 9 | Lint and code-quality debt | 9/10 | **9/10** | ESLint is 0 errors and 0 warnings (`--max-warnings 0`), no rule downgrades; documented UI exceptions at 1; remaining non-ESLint residue is 1,189 `console.*` calls in 264 files and 2 component files each with `animate-spin` / `text-[10px\|11px]` (Wave 8) |
| 10 | Repo hygiene and delivery | 9/10 | **9/10** | Working tree clean at `5e874624`, pushed to `sandbox/full-app-snapshot-2026-11-06`; `origin/main` held back intentionally by sandbox-only policy; the missing agent-library route handlers class still blocks the next clean plugin deploy |

**Overall: 9.5 / 10, letter grade B** (unchanged from the Wave 5 closeout; this fresh audit confirms it from cold runs)

Grade convention for this program: the letter stays B until the 10.0 finish (as in every wave closeout), C at 6.0 or above, D at 4.5 or above, F below 4.5.

## 4. Critical findings, rechecked from scratch

- **C1. Seeded client credentials (Fixed):** seed absent; secret scanner green across all 6,292 tracked files. External rotation attestation remains owner-only.
- **C2. API auth gate (Fixed):** covered by passing guard and plugin tests (69 of 69).
- **C3. Key-returning endpoints (Fixed):** absent, pinned by plugin tests.
- **C4. Secrets in web-readable uploads folder (Fixed, Wave 1):** `Neo_Pulse_App_Data_Paths::root()` resolves above the web root, never uploads; the locked migration copies with per-file size verify, deny rules on the old folder; no HTTP readers of the old path remain. `tests/test-data-paths.php` passes fresh today, including lock contention.
- **C5. Browser credential vault (Fixed, Wave 1):** key helpers read an in-memory runtime hydrated from the cloud snapshot at boot; localStorage is never written for credentials and legacy copies are scrubbed on hydration. 0 production files reference `openrouter.ai` directly.
- **C6. Hosting API identity (Fixed):** fail-closed; hosting tests 23 of 23.
- **C7. Fail-open publishing (Fixed):** validators throw; eval lane 30 of 31 (live judge opt-in); the factuality judge fails contradicted or unsupported claims.
- **C8. Gates (Fixed):** typecheck (app and node), ESLint (`--max-warnings 0`), `ui:check`, `check:circular`, `check:no-secrets:all`, plugin tests, hosting tests, and `npm run build` are green and blocking. `docs/gates/baseline.json` holds only the zeroed tests gate. The debt ratchet, Storybook, and evals CI jobs remain report-only (Wave 9).
- **C9. Hardcoded demo credential (Fixed):** absent.
- **C10. SSRF and OAuth/webhook surface (Fixed):** covered by passing tests.

## 5. Remaining backlog (priority order)

1. **Missing agent-library class (deploy blocker).** `includes/agent-library/class-agent-library-route-handlers.php` is required by the loader but was never committed; a clean repo sync of `neo-pulse-app` cannot boot WordPress. Implement the class or remove the require before the next plugin deploy.
2. **PHP mid band (Wave 6).** 17 first-party PHP files over 1,000 lines (largest `class-neo-pulse-wp-chat-agents.php` 1,847; `class-google-drive-upload.php` 1,814; `class-pulse-assist-ask.php` 1,711) get the trait-split treatment under 500 lines.
3. **Bundle follow-through (Wave 7).** Feature-domain `manualChunks` for app code to shrink the 5.73 MB main chunk, keeping static tab imports and zero loading screens; keep the 2.36 MB pdf.js chunk out of first-load paths where possible.
4. **Residue sweep (Wave 8).** 1,189 `console.*` calls across 264 `src` files, `animate-spin` in `AgentLibraryWorkspaceHeader.tsx` and `DecisionTreeManagerContent.tsx`, `text-[10px|11px]` in `DecisionAuditRowBadge.tsx` and `DecisionTreeManagerContent.tsx`, legacy `localStorage` OpenRouter key reads, and `flock` for `class-json-file-store.php` read-modify-write.
5. **Make every net mandatory (Wave 9).** Remove `continue-on-error` from the debt ratchet, Storybook, and publishing evals CI jobs; final re-audit; promote sandbox to `origin/main` on Sean's word.
6. **Owner-only.** Credential rotation attestation; the Wave 1 live-site migration runs itself when the updated plugin deploys.
7. **Grow component test coverage.** Add a `.test.tsx` file per new surface as waves proceed.

## 6. Verification log (fresh audit, 2026-11-06, on `5e874624`)

- Full test suite (`npm run test`): 4,885 passed, 2 skipped (opt-in live smoke and live factuality judge), 0 failed.
- Typecheck app (`npm run typecheck`): exit 0. Typecheck node (`npm run typecheck:node`): exit 0.
- Lint (`npx eslint . --max-warnings 0`): exit 0, 0 errors, 0 warnings.
- UI check (`npm run ui:check`): exit 0; 0 violations, 1 documented exception; 54 catalog entries in sync.
- Gate check (`npm run check:gates`): exit 0, all gate counts at or below baseline (baseline holds only the zeroed tests gate).
- Circular imports (`npm run check:circular`): exit 0; no circular imports, no forbidden TDZ edges.
- Secret scan (`npm run check:no-secrets:all`): exit 0; 6,292 tracked files clean.
- Hub plugin tests (`npm run test:neo-pulse-app`): 69 of 69 pass. Hosting API tests (`npm run test:neo-host-api`): 23 of 23 pass.
- Publishing eval lane (`npx vitest run src/lib/evals`): 30 of 31 pass; the live judge test skips without hub credentials.
- PHP suites: `test-data-paths.php` ALL DATA PATHS TESTS PASSED; `test-wave0-security.php` PASSED; `test-neo-pulse-wp-mcp.php` ALL NEO PULSE MCP and GUARD TESTS PASSED.
- Production build (`npm run build`): exit 0 (26.6s); main `index` chunk 5,733,259 bytes; `vendor-docs-pdf` 2,361,123 bytes. Storybook build: exit 0.
- Line-count scan: 3,258 production `src` files, 0 over 500 lines (largest 499); 586 first-party PHP files, 0 over 2,000, 17 over 1,000 (largest 1,847).
- Residue scan: 1,189 `console.*` calls in 264 `src` files; `animate-spin` in 2 files; `text-[10px|11px]` in 2 files; 0 files with `React.lazy`, 0 with `<Suspense`; 0 files referencing `openrouter.ai`; 10 `as any` casts and 12 `eslint-disable` comments, all pre-existing.

## 7. Bottom line

Five waves in, the fresh numbers confirm the closeout score: **9.5 / 10, grade B**. Type safety, tests, publishing safety nets, SEO, security, and agent contracts sit at 9 to 10 with cold-run proof; the four remaining waves are mechanical: split the 17 large PHP files (Wave 6), shrink the download (Wave 7), sweep the residue and lock the JSON store (Wave 8), and make every CI check blocking before shipping (Wave 9). The one item that outranks the waves is the missing agent-library route handlers class, needed before the next plugin deploy.