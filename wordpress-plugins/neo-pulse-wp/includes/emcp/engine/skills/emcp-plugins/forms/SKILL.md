---
name: emcp-plugins/forms
description: >-
  Load this skill whenever the user wants to read or manage WordPress form
  plugins over the Neo EMCP MCP, recognizable by a paired
  `emcp-tools-{plugin}-read` / `emcp-tools-{plugin}-write` tool for a form plugin
  being available. Covers Contact Form 7 (`emcp-tools-cf7-*`), WPForms
  (`emcp-tools-wpforms-*`), Gravity Forms (`emcp-tools-gravityforms-*`), Fluent
  Forms (`emcp-tools-fluentforms-*`), Ninja Forms (`emcp-tools-ninjaforms-*`),
  Formidable Forms (`emcp-tools-formidable-*`), MetForm (`emcp-tools-metform-*`),
  and SureForms (`emcp-tools-sureforms-*`). Each plugin exposes the same two
  dispatcher tools: one Read, one Write, each bundling named operations. Reads
  cover forms, fields, notifications, and entries (submissions); writes manage
  settings/notifications and entries. Trigger even when the user doesn't say
  "operation" or "dispatcher", if a paired form-plugin read/write tool is
  available and the request is about that plugin's forms or submissions, this
  skill applies.
---

# emcp-plugins/forms, WordPress form plugins over MCP

Six form plugins, one consistent shape. Each active form plugin registers **two
dispatcher tools**, `emcp-tools-<plugin>-read` and `emcp-tools-<plugin>-write`, that bundle named operations. **Discover, then act:** call a dispatcher with **no
operation** to get its catalog (operation name + description + whether it needs
`confirm`), then call again with `{ operation, arguments }`.

```
emcp-tools-fluentforms-read({})                              → { mode:"read", operations:[ {operation, description, confirm}, ... ] }
emcp-tools-fluentforms-read({operation:"list-forms"})        → runs it
emcp-tools-fluentforms-read({operation:"get-entry", arguments:{ entry_id: 5 }})
```

## The plugins

| Plugin | Tools | Tier | Entries? |
|---|---|---|---|
| Contact Form 7 | `emcp-tools-cf7-read` / `-write` | **Free** | No (CF7 stores no submissions) |
| WPForms | `emcp-tools-wpforms-read` / `-write` | Pro | Yes, **requires WPForms Pro** (Lite has none) |
| Gravity Forms | `emcp-tools-gravityforms-read` / `-write` | Pro | Yes |
| Fluent Forms | `emcp-tools-fluentforms-read` / `-write` | Pro | Yes |
| Ninja Forms | `emcp-tools-ninjaforms-read` / `-write` | Pro | Yes |
| Formidable Forms | `emcp-tools-formidable-read` / `-write` | Pro | Yes |
| MetForm | `emcp-tools-metform-read` / `-write` | Pro | Yes (Elementor-based) |
| SureForms | `emcp-tools-sureforms-read` / `-write` | Pro | Yes (Gutenberg-based) |

Each pair registers **only when its plugin is active**. If a tool isn't in your
list, that plugin isn't active (or, for the five Pro plugins, there's no Neo EMCP
license). CF7 is free; the other five are Neo EMCP.

## Defaults & safety

- **Reads are enabled by default; writes ship disabled by default.** If a
  `-write` tool is unavailable, ask the user to enable it under **Neo EMCP →
  Tools → Plugins → Forms**. Never try to route a write through the read tool.
- **`delete-entry` requires `confirm: true`** in its arguments, it is
  irreversible. Call it once to see the `confirmation_required` error, confirm
  with the user, then call again with `confirm: true`.
- **Entries are personal data (names, emails, messages).** Treat submission
  contents as sensitive; don't echo them unnecessarily.

## Operation reference (per plugin)

The catalog returned by each dispatcher is authoritative, these are the
operations each plugin actually supports. Not every plugin has every operation.

### Contact Form 7 (`cf7`), free, no entries
- **read:** `list-forms`, `get-form` (fields + mail templates + messages),
  `list-notifications` (the `mail` / `mail_2` templates), `get-settings`.
- **write:** `update-notification` (`{ form_id, notification: "mail"|"mail_2", mail: { subject?, recipient?, body?, ... } }`), `update-messages` (`{ form_id, messages: {...} }`), `update-form-settings` (`{ form_id, additional_settings: string }`).

### WPForms (`wpforms`), Pro; entries need WPForms Pro
- **read:** `list-forms`, `get-form`, `list-notifications`, `list-entries`*, `get-entry`*.
- **write:** `update-notification` (`{ form_id, notification_id, fields: {...} }`), `update-entry-status`*, `delete-entry`* (`confirm`).
- *Entry operations return `requires_wpforms_pro` on WPForms Lite (Lite stores no entries). Forms/notifications work on Lite.

### Gravity Forms (`gravityforms`), Pro
- **read:** `list-forms`, `get-form`, `list-notifications`, `list-entries`, `get-entry`.
- **write:** `update-entry-status` (`{ entry_id, status: "active"|"spam"|"trash" }`), `delete-entry` (`confirm`; permanent, not trashed).

### Fluent Forms (`fluentforms`), Pro
- **read:** `list-forms`, `get-form`, `list-entries`, `get-entry`.
- **write:** `update-entry-status` (`{ entry_id, status }` e.g. `read`, `unread`, `trashed`), `delete-entry` (`confirm`; also removes the entry's detail rows).

### Ninja Forms (`ninjaforms`), Pro
- **read:** `list-forms`, `get-form`, `list-entries`, `get-entry`.
- **write:** `delete-entry` (`confirm`).

### Formidable Forms (`formidable`), Pro
- **read:** `list-forms`, `get-form`, `list-notifications`, `list-entries`, `get-entry`.
- **write:** `delete-entry` (`confirm`).

### MetForm (`metform`), Pro; Elementor-based
- **read:** `list-forms`, `get-form` (fields parsed from the form's Elementor layout), `list-entries`, `get-entry`.
- **write:** `delete-entry` (`confirm`).

### SureForms (`sureforms`), Pro; Gutenberg-based
- **read:** `list-forms`, `get-form` (fields parsed from the form's blocks), `list-entries`, `get-entry`.
- **write:** `update-entry-status` (`{ entry_id, status }` e.g. `read`, `unread`, `trash`), `delete-entry` (`confirm`).

## Common flows

Read a form's structure before working with it:
```
emcp-tools-gravityforms-read { "operation":"list-forms" }
emcp-tools-gravityforms-read { "operation":"get-form", "arguments":{ "form_id": 28 } }
```

Review then triage submissions:
```
emcp-tools-fluentforms-read  { "operation":"list-entries", "arguments":{ "form_id": 1, "limit": 20 } }
emcp-tools-fluentforms-read  { "operation":"get-entry",   "arguments":{ "entry_id": 5 } }
emcp-tools-fluentforms-write { "operation":"update-entry-status", "arguments":{ "entry_id": 5, "status":"read" } }
emcp-tools-fluentforms-write { "operation":"delete-entry", "arguments":{ "entry_id": 5, "confirm": true } }
```

Tune a CF7 mail template (free):
```
emcp-tools-cf7-read  { "operation":"list-notifications", "arguments":{ "form_id": 510 } }
emcp-tools-cf7-write { "operation":"update-notification", "arguments":{ "form_id": 510, "notification":"mail", "mail":{ "subject":"New enquiry from {your-name}" } } }
```

## Gotchas

- **CF7 has no entries.** If asked for CF7 submissions, explain CF7 doesn't store
  them (a separate plugin like Flamingo would be needed), there is no entry
  operation on the CF7 tools.
- **WPForms Lite vs Pro.** Forms and notifications work on Lite; any entry
  operation returns `requires_wpforms_pro`. Don't retry, tell the user Pro is
  needed for entries.
- **Field values are keyed by the plugin's own field ids/keys**, not friendly
  names. Use `get-form` to map ids/keys → labels when presenting an entry.
- **Building a form's *design*** (adding fields/layout) is out of scope, these
  tools read and manage forms + submissions, they don't author form structure.

## Forminator (`forminator-read` / `forminator-write`)

Read: `list-forms` (id, name, shortcode), `get-form` `{ form_id }` (name,
shortcode, fields), `list-entries` `{ form_id, limit? }`, `get-entry`
`{ form_id, entry_id }`. Write: `delete-entry` `{ form_id, entry_id, confirm:true }`.

Get a form's shortcode to place it on a page:
```
emcp-tools-forminator-read { "operation":"list-forms" }
# → { "forms":[ { "id":634, "name":"Contact", "shortcode":"[forminator_form id=\"634\"]" } ] }
```

- **Entry ops take BOTH `form_id` and `entry_id`** (Forminator scopes entries to
  a form). `get-entry`/`delete-entry` need both.
- **`name` is the display name** (Forminator's `settings.formName`), not the slug.
- Field values in an entry are keyed by Forminator field id (e.g. `text-1`); use
  `get-form` to map ids → labels.
