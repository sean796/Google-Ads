# Senior Dev Re-Audit Prompt for Claude (Neo Pulse)

Use 1: Give the short lead message below to your lead. He pastes the full prompt into his bot (Claude Code or any agentic Claude with repo access). His bot audits the repo on its own and returns the confirmation review.

Use 2: After you finish all nine waves, paste the same full prompt into your own Claude in the repo. It re-runs everything fresh and produces the same document, updated to 10/10 only if the proof supports it.

Source document this prompt reproduces, same stuff, same ordering:
https://docs.google.com/document/d/1v51ttzewPt0HqmzpVTqVuOpr6bQsvS0PaBHhG_9RPPQ/edit?tab=t.0#heading=h.h33oboyy8urj
Local source audit: `docs/audit/2026-11-06-re-audit.md` (8.3/10, grade B)

---

## Short message to send your lead

Copy and send this as-is:

> Can you ask your bot to audit my repo? Paste the prompt in `docs/audit/SENIOR-DEV-RE-AUDIT-PROMPT.md` (section: Full prompt to paste into Claude) into Claude with the repo open. It runs all the checks itself and returns a senior dev review in the exact same format and order as my 2026-11-06 audit (scorecard, nine waves, score path, proof, bottom line). Repo: `https://github.com/neodigitalca/neo-pulse.git`, branch/commit: [FILL IN]. No fixes, audit only, unless I say otherwise.

---

## Full prompt to paste into Claude

Copy everything between the lines below, nothing else needs editing except the two bracketed fields.

---

You are a senior software engineer doing an independent, agentic repo audit of Neo Pulse. Act like a senior dev reviewer, not a summarizer.

Repo: [PASTE REPO URL OR CONFIRM THE OPEN LOCAL REPO PATH]
Branch or commit to audit: [PASTE BRANCH OR COMMIT, OR SAY: audit the current checked-out HEAD and state it]

### Your job

Re-audit the repo from scratch and produce a confirmation review in the EXACT same format, same headings, same order, same scorecard rows, same nine waves, and same plain-words style as the reference audit below. This review confirms whether the work in the nine waves is actually done. Do not take the reference scores on faith. Measure everything fresh, then update the scores and wave statuses to match the evidence you collected in this run.

Audit only. Do not fix code, do not commit, do not push, unless I explicitly say to fix in a follow-up message.

### Reference audit you must reproduce (same stuff, same ordering)

Title pattern: `# Neo Pulse Repo Audit, [TODAY'S DATE]: The Score and the Road to 10/10`

Reference scores from 2026-11-06 (your starting baseline, re-measure all of them):
Overall 8.3 out of 10, grade B. Type safety 10/10, Tests 9/10, Publishing safety 8/10, SEO checks 8/10, Security 7/10, AI instructions 7/10, Safety nets 9/10, Speed and tidiness 7/10, Code cleanliness 9/10, Delivery 9/10.

### How to work (agentic, senior dev style)

1. Open the repo yourself. Confirm and state: repo path or URL, branch, commit hash, `git status` (clean or dirty count), tracked file count.
2. Run every check yourself with your tools. Do not ask me to run commands. Do not guess, estimate, or reuse numbers from the reference audit. Every number in your output must come from a command or file search you ran in this session.
3. If a check cannot run (missing credentials, missing PHP, missing dependency), say so in Proof, name the exact blocker, and score that area on the evidence you do have. Never invent a passing number.
4. Read the actual code for each wave item below. A wave is FIXED only when the code proves it, not when a commit message or comment says so. Search, do not assume.
5. Keep claims non-contradictory: if a check fails, the scorecard, waves, score path, and bottom line must all agree with that failure.
6. Plain words first, like the reference doc. Name the file, count, or command in parentheses or in Proof when you need precision. No jargon without a plain translation.
7. No silent fallbacks in your scoring. If something is partial, mark it Partially fixed and say exactly what remains, with counts.

### Checks you must run and report in Proof

Run these from the repo root (adapt only if `package.json` has renamed them, and note any change):

- `npm run typecheck` (app type errors, expect 0)
- `npm run typecheck:node` (node type errors, expect 0)
- `npx eslint . --max-warnings 0` (lint errors and warnings, expect 0 and 0)
- `npm run test` (full test suite: files pass/fail, tests pass/fail, name the single known live-credential smoke failure if it is still the only one: `src/lib/ads-reporting/__tests__/in-the-shade-reporting-smoke.test.ts`)
- `npm run test:neo-pulse-app` (hub plugin tests, baseline 69 of 69)
- `npm run test:neo-host-api` (hosting tests, baseline 23 of 23)
- `npx vitest run src/lib/evals` (publishing evals, baseline 14 of 14)
- `npm run ui:check`
- `npm run check:gates`
- `npm run check:no-secrets:all` (state tracked files scanned)
- `npm run check:circular`
- `npm run build` (report main chunk size and vendor chunks from the build output)
- `npm run build-storybook`
- PHP syntax check on changed or in-scope PHP files if PHP is available (`php -l`), plus the PHP test file if present: `wordpress-plugins/neo-pulse-wp/tests/test-neo-pulse-wp-mcp.php`
- Line counts: count production `src` files over 1,000 lines, over 500 lines, and the single longest file; count first-party PHP files over 1,000 and over 2,000 lines, and the single longest file
- Code searches with counts: importers of the JSON repair utility (`json-repair-utility`), `console.*` occurrences and file count in `src`, files still reading legacy `localStorage` OpenRouter key slots, `animate-spin` residue, sub-1rem text classes (`text-[10px`, `text-[11px`), component interaction tests (`*.test.tsx` count), browser-direct `openrouter.ai` references in production `src`
- Security checks in code: where `Neo_Pulse_App_Data_Paths::root()` (or its current equivalent) resolves, whether web-server deny rules exist for the old uploads path, whether any script still fetches private data files over HTTP
- Concurrency check in code: whether the JSON file store (`class-json-file-store.php` or current equivalent) uses `flock` (or equivalent locking) on read-modify-write
- CI check: read `.github/workflows/ci.yml` and state which jobs still use `continue-on-error` (report-only) versus blocking
- Delivery check: `git status`, current branch, whether the work is on the sandbox copy, on `origin/main`, or both

### Scoring rules (keep the same ten rows, in this order)

Score each row out of 10 from fresh evidence. Overall is the average of the ten rows, one decimal. Grade: A at 9.0 or above, B at 7.5 or above, C at 6.0 or above, D at 4.5 or above, F below 4.5. A 10/10 overall means every row is at 10.

1. Type safety: 10 only if both typechecks are 0 errors and blocking in build and CI.
2. Tests: 10 only if the full suite passes (except a named, tracked live-credential smoke test) AND component interaction tests (`.test.tsx` files that click and type) exist and pass for the areas named in Wave 3. Baseline gap: 0 such tests.
3. Publishing safety: 10 only if bad AI output is rejected loudly, publishing evals pass, AND file saves are locked so two saves cannot clash (Wave 8 locking). Baseline 8.
4. SEO checks: 10 only if the anti-formulaic content rules pass AND a fact-checker for AI claims exists and runs (Wave 4). Baseline 8.
5. Security: 10 only if private files live outside the public web folders or are firmly denied by the web server, the old folder is locked, helper scripts no longer read those files over the web, and legacy browser key slots are removed (Wave 1). Baseline 7. Secret scan must also be clean.
6. AI instructions: 10 only if every AI feature uses one strict answer shape, bad shapes are rejected and reported instead of patched, and the patch-up tool (JSON repair utility) is deleted with zero importers (Wave 2). Baseline: 21 importers.
7. Safety nets: 10 only if every automatic check blocks a bad release, with zero warning-only (`continue-on-error`) jobs left for storybook, evals, and ratchet (Wave 9). Baseline: 3 warning-only.
8. Speed and tidiness: 10 only if no production file is over 500 lines (program and server, Waves 5 and 6) AND the app download is split into named chunks with a materially smaller main file (Wave 7). Baseline: 140 program files at 500 to 988 lines, 17 server files over 1,000 lines, main file 5.7 MB.
9. Code cleanliness: 10 only if lint is 0 and 0, debug message residue is swept, and the banned spinner and tiny-text spots are gone (Wave 8). Baseline: 1,179 `console.*` calls, 2 flagged spots.
10. Delivery: 10 only if all work is committed, pushed, and on the main repo (`origin/main`), not only the sandbox copy (Wave 9). Baseline 9.

### Output format (mandatory, keep all the same stuff, in this exact order)

Produce a single Markdown document with these sections in this order. Do not add, remove, merge, or reorder sections. Do not change the wave order or wave titles.

#### 1. Title line

`# Neo Pulse Repo Audit, [date of your audit]: The Score and the Road to 10/10`
If every wave is verified fixed and overall is 10.0, the title may instead read: `# Neo Pulse Repo Audit, [date]: Confirmation Review, 10/10`

#### 2. `## The short version`

One short paragraph, plain words: the new overall score and grade, that the code checks pass or fail (with counts), what is left (or that nothing is left), and a one-line pointer to the scorecard and nine waves below. Keep the same sentence pattern as the reference: score first, code health second, what remains third, waves last.

#### 3. `## Scorecard in plain words`

A Markdown table with exactly these columns: `Area | Score | What it means`
Exactly these ten rows, in this order: Type safety, Tests, Publishing safety, SEO checks, Security, AI instructions, Safety nets, Speed and tidiness, Code cleanliness, Delivery.
Each Score cell is `X/10` from your fresh evidence. Each What it means cell is one plain sentence stating the evidence and, if below 10, the exact gap.
After the table, one bold line: `**Overall: X.X / 10, grade [letter].**` followed by the same closing sentence pattern as the reference: A 10/10 repo means every row above is at 10.

#### 4. `## The nine waves to 10/10`

Keep this heading even if all waves are done. In that case the intro under it states that all nine are verified complete and each wave below shows its proof.
Include all nine waves, in this order, with these exact wave titles. Keep the baseline score movement in the title, then add a status line directly under each heading: `**Status: FIXED / PARTIALLY FIXED / OPEN**, verified [date]: [one plain sentence of proof with counts or file names].`
If a wave is FIXED, its Steps become a verification checklist: restate each original step and mark it done with the evidence. If a wave is not fixed, keep the original Problem, Steps, and What you will notice so the remaining work reads exactly like the reference plan.

Wave 1: Lock the private files away (Security 7 to 10, overall 8.3 to 8.6)
Problem: private files (site settings, Google sign-in tokens) live in a folder whose web address anyone can guess. Only a placeholder file guards them today.
Steps: 1. Pick a private home for these files, outside the public web folders. 2. Teach the app the new address. 3. Move the existing files on the live site, counting them before and after so nothing goes missing. 4. Lock the old folder so the web gets a firm no. 5. Update the helper scripts that used to read those files over the web. 6. Remove the old leftover key slots from the browser side.
What you will notice: nothing on screen. This is purely behind the scenes. Needs you: the live-site move runs in a deploy window you pick. I prepare and test everything locally first.
Verify specifically: data root path in code, deny rules present, zero HTTP readers of the private files, zero legacy browser key slots (baseline 3 files).

Wave 2: Stop patching messy AI answers (AI instructions 7 to 10, overall 8.6 to 8.9)
Problem: in 21 places, the app fixes up sloppy AI replies after the fact instead of demanding a clean answer up front.
Steps: 1. Give each of the 21 AI features one strict answer shape. 2. Reject and report anything that does not fit, instead of quietly repairing it. 3. Delete the patch-up tool once nothing uses it anymore.
What you will notice: an occasional honest "the AI returned a bad answer, try again" instead of quietly wrong content. That is the point.
Verify specifically: importer count of the JSON repair utility (baseline 21, target 0 and the utility file deleted), strict schema validation present per flow.

Wave 3: Tests that click like a person (Tests 9 to 10, overall 8.9 to 9.0)
Problem: thousands of tests check the behind-the-scenes math, but none click buttons or type in fields the way you do.
Steps: 1. Add the standard click-and-type test tools. 2. Write tests for the main header and toolbars, the form fields, the tab system, the details side panel, and the blog idea rows. 3. Run the whole test set to confirm the new tests pass next to the existing ones.
What you will notice: nothing, until a future change breaks a screen and a test catches it before you do.
Verify specifically: `.test.tsx` count (baseline 0), which of the five named areas have passing interaction tests, full suite result.

Wave 4: A fact-checker for AI writing (SEO checks 8 to 10, Publishing safety 8 to 9, overall 9.0 to 9.3)
Problem: nothing checks whether AI-written articles make claims they cannot back up.
Steps: 1. Add a checker that reads each article claim by claim against its sources and flags the unsupported ones. 2. Run it on saved examples inside the automatic checks so results are steady every time. 3. Keep a live mode you can run by hand when you want a fresh opinion.
What you will notice: a new fact-check result alongside the other publishing checks.
Verify specifically: fact-checker exists in the evals, runs in the automatic checks on recorded examples, live mode present, eval pass counts.

Wave 5: Split the medium program files (Speed and tidiness 7 to 9, overall 9.3 to 9.5)
Problem: 140 program files are still 500 to 1,000 lines long. Long files are where bugs hide and where reviews slow down.
Steps: 1. Split the 25 longest files first (822 to 988 lines). 2. Split the next batch (650 to 822 lines). 3. Split the rest (500 to 650 lines). 4. Every piece ends under 500 lines with a name that says what it does, and every original file keeps its name so nothing else has to change. 5. Run the full checks after each batch.
What you will notice: nothing on screen. Future fixes and reviews get faster.
Verify specifically: production `src` files over 500 lines (baseline 140, target 0), longest file named with its line count, full checks green.

Wave 6: Split the medium server files (server half of the same job, overall stays 9.5)
Problem: 17 server files on the WordPress side are over 1,000 lines.
Steps: 1. Split each one into small add-on files under 500 lines, using the same pattern as the last round. 2. Check every file and run the server tests after each batch.
What you will notice: nothing. Same payoff as Wave 5, on the server side.
Verify specifically: first-party PHP files over 500 and over 1,000 lines (baseline 17 over 1,000, target 0 over 500), PHP syntax and plugin tests green.

Wave 7: Smaller downloads (Speed and tidiness 9 to 10, overall 9.5 to 9.6)
Problem: the app still arrives as one 5.7 MB main file. After each update, browsers re-download more than they should.
Steps: 1. Cut the main file into named chunks by feature area (bulk tools, overview, research, chat, and so on). 2. Tabs keep loading instantly with no loading screens, exactly as they do now. 3. Build the app and confirm the main file shrinks.
What you will notice: faster reloads after updates. The first visit stays the same.
Verify specifically: build output main chunk size versus 5.7 MB baseline, chunk names listed, no new loading screens or lazy tab shells introduced.

Wave 8: Sweep the leftovers (Code cleanliness 9 to 10, Publishing safety 9 to 10, overall 9.6 to 9.8)
Problem: 1,179 leftover debug messages sit in the code, two spots use a banned spinning icon or tiny text, and two saves landing at the same second can clash.
Steps: 1. Remove the debug noise and route real logging to the proper log tools. 2. Swap the two spinner and tiny-text spots for approved pieces. 3. Add a simple lock so file saves line up instead of overwriting each other.
What you will notice: a cleaner browser console, and the end of rare overwritten saves.
Verify specifically: `console.*` count (baseline 1,179 across 237 files, target swept or rerouted to proper logging), spinner and tiny-text residue counts (baseline 2 spots, target 0), file-save locking present in the JSON store with a passing test.

Wave 9: Make every net mandatory and ship it (Safety nets 9 to 10, Delivery 9 to 10, overall 9.8 to 10.0)
Problem: three automatic checks still only warn instead of blocking a bad release, and all this finished work lives on the sandbox copy, not the main repo.
Steps: 1. Turn the last three warning-only checks into release blockers. 2. Re-run this whole audit and refresh this document with the new scores. 3. Save everything and put it on the sandbox copy. 4. On your word, move it to the main repo.
Needs you: say go for the main repo move, confirm the old exposed passwords were rotated, and let the Wave 1 file move run on the live site.
Verify specifically: `continue-on-error` count in CI (baseline 3 jobs, target 0 for storybook, evals, ratchet), git state on sandbox and `origin/main`, and note owner-only items (credential rotation attestation, live Wave 1 migration) as confirmed or outstanding. Never claim an owner-only item is done without evidence stated in this session.

#### 5. `## The score path`

A Markdown table with exactly these columns: `After | Overall`
Exactly these rows, in this order: Today (use your audit date and your measured overall as the first row, labelled with the starting point you audited from), Wave 1, Wave 2, Wave 3, Wave 4, Wave 5, Wave 6, Wave 7, Wave 8, Wave 9.
Reference path to preserve: Today 8.3 (B), Wave 1 8.6, Wave 2 8.9, Wave 3 9.0, Wave 4 9.3, Wave 5 9.5, Wave 6 9.5, Wave 7 9.6, Wave 8 9.8, Wave 9 10.0 (A).
For a confirmation review after fixes, replace each row value with the verified overall after that wave, ending at 10.0 (A) only if every row above scored 10. If any wave is open, the path must show the real projected path from your measured scores, not the reference numbers copied blindly.

#### 6. `## Proof behind the scores (fresh checks, [date of your audit])`

A bullet list. One bullet per check from the Checks section, in the order listed there. Each bullet: the command or search, the exact result (pass/fail counts, error counts, file counts, sizes), and the name of any failing item. Include at minimum: full test result with the failing test named, type errors, lint result, build result with chunk sizes, hub plugin checks, hosting checks, publishing checks, secret scan with files scanned, circular dependency result, line-count extremes, working tree and push state. Fresh means run in this session. Do not copy the reference proof numbers (4,808 of 4,809, zero type errors, zero lint, 5,898 files, longest file 988) unless your run reproduces them.

#### 7. `## Bottom line`

One short paragraph, plain words, same pattern as the reference: what is done and verified, what stands between the current grade and 10/10 (or, if 10/10, an explicit confirmation sentence: "All nine waves verified complete. Nothing remains between this repo and 10/10."), and the next single step if anything remains. If owner-only items are outstanding (main repo move approval, credential rotation, live Wave 1 window), name them here as the only blockers.

### Final self-check before you reply

Before sending the document, re-read it once and confirm: every number came from this session, the scorecard overall equals the average of the ten rows, the score path ends where the scorecard says, every FIXED wave has proof in Proof, no wave is marked FIXED on a commit message alone, and no section was added, removed, or reordered. Fix any mismatch before replying.

Reply with the full Markdown document only, followed by one line stating where you saved it if you saved it as a file (suggested: `docs/audit/[YYYY-MM-DD]-re-audit.md`). Do not add commentary after Bottom line.

---

End of prompt.

---

## How Sean uses the result

1. Lead's bot returns the document: compare its Scorecard and wave statuses line by line against the Google Doc. Same order makes differences obvious.
2. After fixing all nine waves: run the same prompt in your Claude, save the output as the new audit in `docs/audit/`, and refresh the Google Doc with the new scores. At 10/10 the document is the confirmation of the work done.
