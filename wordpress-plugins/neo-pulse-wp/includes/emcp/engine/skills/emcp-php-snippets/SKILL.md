---
name: emcp-php-snippets
description: >-
  Use this skill whenever the user wants to add custom PHP behavior to a
  WordPress site through the Neo EMCP MCP, recognizable by an
  `emcp-tools-create-php-snippet` or `emcp-tools-validate-php-snippet` tool
  being available, or by the user asking to "add a code snippet", write a hook /
  filter / shortcode, or run custom PHP. Covers the sandbox workflow: validate
  code, save it as an inactive draft, and hand it to a human to activate, there
  is deliberately no activate tool, because activation is the human approval
  gate. Trigger even when the user doesn't name a tool, if the tools are
  available and the task is custom PHP / a code snippet, this skill applies.
---

# emcp-php-snippets, the human-gated PHP sandbox over MCP

Six tools let an AI **author and validate** custom PHP snippets, but **you can never make one run**. Activation is reserved for a human, in the WordPress admin. That gate is the entire point of the feature, and this skill exists to keep you working *with* it instead of getting confused by it.

**Workflow: validate → create a draft → tell the human to review + activate. Full stop.**

> These tools are **disabled by default** and require an admin to enable them (Neo EMCP → Tools tab → Sandbox) plus `manage_options` + `unfiltered_html`. If they're not available, the admin hasn't opted in, say so rather than looking for another way to run PHP.

---

## 1. The mental model (do not fight this)

- **There is NO `activate-php-snippet` tool.** A snippet you create is an **inactive draft** with no executable file on disk. It does nothing until a **human** activates it in Neo EMCP → Sandbox, which is the only thing that compiles and runs it.
- So the correct end state of your work is: *"I've created and validated a draft snippet #N. Review it in Neo EMCP → Sandbox and click Activate to enable it."* Never imply the code is live.
- **Static validation is a guardrail, not a guarantee.** The validator does a real parse + a security token-scan, but a human still reviews before it runs. Treat a clean validation as "safe enough to propose," not "safe to trust blindly."

---

## 2. Validate before (and as) you create

`validate-php-snippet(code)`, parse check + security scan; **no store, no run**. Returns `critical` and `warning` findings.

- **CRITICAL findings block creation.** The validator rejects: `exec`/`system`/backticks/`eval`, variable-functions, file writes, network calls, obfuscation decoders (`base64_decode` + `eval`, etc.), destructive SQL, and dynamic `include`/`require`. If you hit one, **rewrite to avoid it**: don't try to smuggle it past.
- **WARNING findings** are surfaced to the human reviewer; fix what you reasonably can and note the rest.

Write **plain, hook-based PHP**: register an `add_action` / `add_filter` / `add_shortcode`, keep it self-contained, no closing `?>` tag (the validator forbids it). Validate first to catch problems before you create the draft (`create-php-snippet` re-validates and rejects criticals anyway).

```
validate-php-snippet(code="add_shortcode('year', fn() => date('Y'));")
```

---

## 3. Create the draft

`create-php-snippet(...)`, creates an **inactive** draft (validated; criticals rejected). Give it a clear name, the code, and its run context (a hook, and/or expose it as a `[emcp_snippet id="N"]` shortcode). It will **not** run until a human activates it.

Then manage drafts with:
- `get-php-snippet(id)`, returns the code, status, shortcode, and the validation report.
- `list-php-snippets()`, all snippets with status + run context.
- `update-php-snippet(id, …)`, change the code/settings; **re-validates**.
- `delete-php-snippet(id)`, remove a snippet and its sandbox file.

---

## 4. Hand off to the human, clearly

Because you can't activate, your deliverable is a **review-ready draft plus instructions**. Always tell the user, explicitly:

1. What the snippet does and where it runs (which hook / shortcode).
2. The snippet **id** and that it's an **inactive draft**.
3. **How to activate it:** Neo EMCP → Sandbox → review the code → Activate.
4. Any warnings the validator surfaced, so their review is informed.

If a snippet ever fatals once active, the loader auto-deactivates it (a shutdown guard), mention that as a safety net, not a reason to skip review.

---

## 5. Tool reference

| Purpose | Tool |
|---|---|
| Validate code (no store/run) | `emcp-tools-validate-php-snippet` (`code`) |
| Create an inactive draft | `emcp-tools-create-php-snippet` (validated; criticals rejected) |
| Read a snippet + its validation report | `emcp-tools-get-php-snippet` (`id`) |
| List snippets + status | `emcp-tools-list-php-snippets` |
| Update code/settings (re-validates) | `emcp-tools-update-php-snippet` (`id`) |
| Delete a snippet | `emcp-tools-delete-php-snippet` (`id`) |

> There is no activate tool by design. Author + validate the draft, then hand it to a human to review and activate in Neo EMCP → Sandbox. The same human-approval model governs Themer PHP region templates (`emcp-themer`).

> This skill ships in the Neo EMCP premium build.

> Handing the site over without EMCP: an admin can package every ACTIVE snippet (with widgets and blocks) as a standalone plugin from Sandbox > Export as plugin once the Sandbox Plugin Export module (Pro) is enabled. Function names and the `[emcp_snippet id="N"]` shortcode are preserved. The export has no store, so a snippet that throws there is logged and skipped rather than deactivated.
