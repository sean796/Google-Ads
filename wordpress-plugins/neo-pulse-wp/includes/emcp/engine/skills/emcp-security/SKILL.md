---
name: emcp-security
description: >-
  Use this skill whenever the user wants to assess or harden a WordPress site's
  security through the Neo EMCP MCP, recognizable by an
  `emcp-tools-scan-security` tool being available, or by the user asking for a
  security audit, a malware scan, "is my site hacked?", hardening advice, or
  help cleaning an infection. Covers running the security scanner, confirming
  each finding by reading the real files with the Filesystem tools, remediating
  confirmed issues with the gated write tools, and re-scanning. Trigger even
  when the user doesn't say "scan-security", if the tool is available and the
  task is WordPress security or malware, this skill applies.
---

# emcp-security, WordPress security & malware work over MCP

This skill pairs **one scanner** (`scan-security`) with the **Filesystem tools** to run a real investigation, not just a report dump:

**Scan → confirm (read the real files) → remediate (gated) → re-scan.**

`scan-security` is **heuristic**. Its findings are *leads to confirm*, never verdicts, that is exactly why this skill always reads the flagged files before acting. Treat a "critical" as "go look at this file," not "this is malware."

---

## 1. Scan

`scan-security`, all params optional:

| Param | Type | Default | Notes |
|---|---|---|---|
| `checks` | string[] | all four | Subset of `malware` / `integrity` / `hardening` / `software`. Omit = run all. |
| `deep` | boolean | `false` | `false` = uploads + **active** plugins/themes; `true` = the whole tree (slower). |
| `max_files` | integer | 2000 | Malware file-count cap (ceiling 20000). |
| `max_seconds` | integer | 20 | Malware time budget (ceiling 120). |

```
# Fast baseline
scan-security()

# Just the config posture (no file walk, instant)
scan-security(checks=["hardening"])

# Thorough malware hunt across everything
scan-security(checks=["malware"], deep=true, max_seconds=60)
```

Output:

```jsonc
{
  "summary": { "score": 0-100, "grade": "A|B|C|D|F", "counts": {...} },
  "sections": {
    "malware":   [ finding, ... ],   // value.location = "path:line", value.snippet = short excerpt
    "integrity": [ finding, ... ],   // modified→critical, missing→warning core files
    "hardening": [ finding, ... ],   // file editor, debug, admin user, XML-RPC, version disclosure, HTTPS, headers
    "software":  [ finding, ... ]    // outdated core/plugins/themes, closed/abandoned plugins, inactive
  },
  "scan_meta": {
    "files_scanned": n, "files_skipped_size": n,
    "truncated": false, "truncated_reason": null,        // "max_files" | "time_budget" when a cap was hit
    "deep": false, "checks_run": [...],
    "integrity_api": { "ok": true, "error": null },       // wordpress.org checksum fetch
    "headers_fetch": { "ok": true, "error": null },       // loopback header GET
    "elapsed_ms": n
  },
  "top_recommendations": [ "[Label] line", ... ]          // ranked critical → warning
}
```

Start shallow, read `top_recommendations`, then narrow with `checks`/`deep` when you need to dig. If `scan_meta.truncated` is `true`, the malware walk hit a cap, raise `max_files`/`max_seconds` or scan a narrower scope to cover the rest (don't assume "clean"). If `integrity_api.ok` or `headers_fetch.ok` is `false`, that check degraded (offline / blocked loopback), note it; it's not a clean result.

**Malware findings never contain full file contents**: only `value.location` (`path:line`) and a short `value.snippet`. That is by design: you read the actual file next.

---

## 2. Confirm with the Filesystem tools (the heart of this skill)

Never remediate off a raw finding. For each one, read the real file:

- **malware finding** → `read-file` the path from `value.location`; read around the line and judge true- vs false-positive. A genuine `eval(base64_decode('...'))` backdoor reads very differently from a library that legitimately ships packed code.
- **`search-files`** to widen the blast radius, hunt the same signature in other files, find sibling droppers, and locate recently-touched PHP under `uploads/`. One infected file usually has company.
- **`list-directory`** to inspect a suspicious directory the scan surfaced (unexpected PHP folders, odd names in uploads).
- **integrity** "modified / missing core file" → `read-file` to see *what* changed (rule out a legit localized core build), then plan a core re-install rather than hand-editing core.

**Worked example, `malware_eval_obfuscation` (critical):**
1. `read-file(path="wp-content/themes/acme/inc/helper.php")` (the path from `value.location`) → read the obfuscated block in full context.
2. Confirm it's a backdoor (request-driven `eval`, base64/gzinflate chain, writes to other files).
3. Copy the first ~20 chars of the payload and `search-files(query="<that string>")` across the install → every file the same injector touched.
4. Now you have the full list to remediate, not just the one line the scan happened to surface.

> The scanner already **self-excludes the Neo EMCP plugin's own directory and its `uploads/emcp-widgets` snippet sandbox**, and **skips benign empty/comment-only PHP guards** (the ubiquitous "Silence is golden" `index.php`). So a malware finding under those paths would be unexpected, investigate, but don't be surprised it's clean.

---

## 3. Remediate, GATED and careful

Only after you've confirmed a finding by reading the file.

> ⚠️ **The Filesystem write tools (`write-file`, `edit-file`, `delete-file`) are disabled-by-default and effectively remote code execution.** They are confined to the WordPress install, **refuse `wp-config.php` and `.htaccess`**, honor `DISALLOW_FILE_EDIT`, auto-back-up the original before every change, and audit-log every write; `delete-file` also requires `confirm:true`. If they aren't available in the session, they're off, tell the admin to enable them on **Neo EMCP → Tools** rather than guessing another path. Treat every write as serious: the only undo is the auto-backup.

- **Injected code in an otherwise-legit file** → `edit-file` with a precise find-and-replace that removes exactly the malicious block (verify with `read-file` after).
- **A confirmed dropper / webshell file** → `delete-file(path="…", confirm=true)`.
- **Clean every file** `search-files` found, not just the one the scan reported.
- **hardening findings:**
  - File editor enabled, `WP_DEBUG_DISPLAY` on → these live in `wp-config.php`, which the write tools **refuse**; hand the admin the exact edit (`define('DISALLOW_FILE_EDIT', true);`, set `WP_DEBUG_DISPLAY` false).
  - `admin` username present → guide creating a new admin + removing/demoting `admin` (no user-delete tool over MCP by design).
  - XML-RPC, version disclosure (`readme.html`, generator meta), missing security headers, non-HTTPS → guidance / server config; `readme.html` can be removed with `delete-file(confirm=true)` after confirming.
- **software findings** → `update-plugin` / `update-theme`; a plugin closed or removed from wordpress.org → replace it, then `delete-plugin`.

---

## 4. Re-scan

Re-run `scan-security` with the same `checks` and confirm the finding is gone, `counts.critical` dropped, and the score improved. For malware cleanups, re-scan `deep=true` to be sure no sibling file was missed.

---

## 5. Safety & judgment

- **Heuristics ≠ proof.** Always `read-file`-confirm before `delete-file`. False positives are expected and acceptable; a wrong deletion is not.
- **A scan can't prove a site is clean**: it can only surface what its signatures catch. Absence of findings is reassuring, not a guarantee.
- **If the site is actively compromised**, file edits alone aren't enough. Recommend: a full offline backup first, then rotate all passwords + the `wp-config.php` salts, audit users/admins, check scheduled tasks and the database, and involve the host or a professional. Reinfection from a missed backdoor is the norm when you only clean what the first scan showed.
- **Backups + audit log exist** (`edit-file`/`write-file`/`delete-file` snapshot the original and log every write), but they're a safety net, not a license to act before confirming.

---

## 6. Tool reference

| Purpose | Tool |
|---|---|
| Run the security/malware audit | `emcp-tools-scan-security` (`checks` / `deep` / `max_files` / `max_seconds`) |
| Read a flagged file in full context | `emcp-tools-read-file` |
| Hunt related artifacts / signatures | `emcp-tools-search-files` |
| Inspect a suspicious directory | `emcp-tools-list-directory` |
| Strip injected code from a file | `emcp-tools-edit-file` (write, disabled-by-default; refuses wp-config/.htaccess; auto-backup + audit log) |
| Delete a dropper / webshell / readme.html | `emcp-tools-delete-file` (write, disabled-by-default; needs `confirm:true`) |
| Create a clean replacement file | `emcp-tools-write-file` (write, disabled-by-default) |
| Update / replace vulnerable software | `emcp-tools-update-plugin` · `emcp-tools-update-theme` · `emcp-tools-delete-plugin` |
| Confirm settings posture | `emcp-tools-get-settings` |

> Read = `read-file` / `list-directory` / `search-files` are enabled by default. Write = `write-file` / `edit-file` / `delete-file` are disabled by default and admin-gated; if missing from the session, ask the admin to enable them.

> This skill ships in the Neo EMCP premium build.
