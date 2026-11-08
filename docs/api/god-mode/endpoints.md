---
title: Endpoints
slug: god-mode/endpoints
section: God Mode
order: 40
---

<!-- manual -->

God Mode traffic uses WordPress REST and admin-ajax on the **site origin** (not the NEO Pulse Node `/api/*` base URL).

## Primary chat stream

| Property | Value |
| --- | --- |
| URL | `POST /wp-admin/admin-ajax.php?action=neo_pulse_chat_stream` |
| Auth | WordPress logged-in session + nonce |
| Format | NDJSON stream |

### Request body (JSON)

| Field | Required | Description |
| --- | --- | --- |
| `admin_mode` | yes | `backend` for God Mode |
| `admin_submode` | yes | `ask`, `plan`, or `build` |
| `target_scope` | no | `page` (default) or `site`. Site skips auto current-page binding. |
| `message` | yes | User message |
| `history` | no | Conversation turns |
| `post_id` | no | Current post context |
| `page_url` | no | Current page URL |
| `page_title` | no | Current page title |
| `page_context_key` | no | RAG context key |

Stream events include `ack`, `searching`, `thinking`, and `done` with a card payload.

Handler: `Neo_Pulse_Wp_Chat::ajax_chat_stream()` → `Neo_Pulse_Wp_Chat_Super_Admin::stream_pipeline()`

## Backend Assist REST

Namespace: `neo-pulse/v1`. Permission: `edit_posts`. OpenRouter key required for `POST /backend-assist`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/neo-pulse/v1/backend-assist` | Run pipeline (message + history) |
| POST | `/neo-pulse/v1/backend-assist/step` | Execute workflow step |
| GET | `/neo-pulse/v1/backend-assist/workflow/{workflow_id}/status` | Workflow status |
| POST | `/neo-pulse/v1/backend-assist/undo` | Undo card action (restore revision) |
| GET | `/neo-pulse/v1/backend-assist/sessions` | List saved sessions |
| POST | `/neo-pulse/v1/backend-assist/sessions` | Save session |
| DELETE | `/neo-pulse/v1/backend-assist/sessions` | Clear sessions |
| GET | `/neo-pulse/v1/backend-assist/sessions/{id}` | Get session |
| DELETE | `/neo-pulse/v1/backend-assist/sessions/{id}` | Delete session |

Registered in `class-neo-pulse-wp-backend-assist-rest.php`.

Build mode POST body accepts the same context fields as the stream: `target_scope` (`page` | `site`), `post_id`, `page_url`, `page_title`, and `page_context_key`. Site scope omits auto current-page binding in builder context.

## Site inventory

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/neo-pulse/v1/chat/site-inventory` | Warm cache, return count |
| GET | `/neo-pulse/v1/chat/site-inventory?format=csv&include_drafts=1` | CSV export (God Mode toolbar) |

## Widget config URLs

Localized in `neo-pulseChatConfig`:

| Key | Use |
| --- | --- |
| `backendAssistUrl` | Direct REST pipeline |
| `backendAssistUndoUrl` | Card undo |
| `siteInventoryUrl` | Inventory warm |
| `siteInventoryCsvUrl` | CSV download |

## MCP wrappers

Exposed via neo-pulse-wp MCP tools registry:

| MCP tool | Proxies |
| --- | --- |
| `wp_assist_chat` | `POST /neo-pulse/v1/backend-assist` |
| `wp_assist_workflow_status` | Workflow status GET |
| `wp_assist_workflow_step` | Workflow step POST |

Source: `class-REMOVED_NEO_PULSE_WP_TOOLs-handlers.php`

## Card payload fields (stream done)

| Field | Description |
| --- | --- |
| `type` | answer, action, plan, prompt, error |
| `title` | Card headline |
| `body` | Markdown body |
| `links` | Edit, view, undo links |
| `submode_switch` | Suggested submode (`build`, `plan`, `ask`) |
| `relatedTopics` | Follow-up chip labels |
| `steps` | Workflow step list |
| `confidence` | high, medium, low |
