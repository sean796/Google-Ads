---
name: emcp-fluentcrm
description: Run FluentCRM through EMCP's fluentcrm-read and fluentcrm-write tools - contacts and their custom fields, tags, lists and notes, imports and bulk tagging, email templates and campaigns, test sends, schedules, and automations. Covers FluentCRM's own MCP server, versions and conflicts, automations (run_automations), who gets emailed (confirm, expected_recipients), clearing fields, consent, erasure, the batch caps, and what History can undo.
---

# FluentCRM

EMCP drives FluentCRM 3.x through FluentCRM's own abilities (the ones its own MCP server offers) and its REST API, in-process, so FluentCRM checks its permissions and runs its own validation. EMCP adds versions, a read-back of every write, a report of every email and automation the call started, History undo, and erasure of a contact's data from History.

| Tool | Default |
|---|---|
| `fluentcrm-read` | on |
| `fluentcrm-write` | off: the site owner enables it under Neo EMCP > Tools > Plugins > FluentCRM |

Call either tool with no operation to list its operations and their arguments. Pass arguments as `{operation, arguments}`. Every operation checks FluentCRM's own permission for it (`fcrm_*`), so a FluentCRM manager can do only what FluentCRM lets them.

## Two servers, one switch

FluentCRM has its own MCP server (`/wp-json/fluent-crm/mcp`) behind its switch FluentCRM > Settings > MCP. EMCP respects that switch: while it is off every operation except `get-setup` answers `fluentcrm_mcp_disabled`. Use EMCP's tools for anything that needs versions, History or the safeguards below; `get-setup` names FluentCRM's endpoint when it is on.

## Read first

- `get-setup`: version and support, whether FluentCRM's AI access is on, the live automation triggers and goals, whether user sync is on, double opt-in and sender settings, contact statuses, the number of custom fields, and the write operations you may run.
- `list-contacts` (search, emails, tags, lists, statuses, contact_type, created_after, created_before, or `advanced_filters`: see `get-contact-filter-schema`), `get-contact` (by `contact_id` or `email`; `include` picks notes, emails, automations).
- `list-tags`, `list-lists` (`ids` resolves ids, slugs or titles), `list-custom-fields`.
- `list-campaigns`, `get-campaign` (`include: ["recipients_estimate"]` gives the count `schedule-campaign` needs), `list-templates`, `get-template`, `preview-email` (renders against a contact).
- `list-automations`, `get-automation` (its steps, with the step ids `set-contact-automation` takes), `list-automation-contacts`.

Every contact, tag, list, campaign, template, automation and the custom field list answers a **version**. Pass it to every write on that object: a different version answers `conflict` (read again and redo the change), a missing one `missing_version`, and `force: true` writes anyway. Every write answers the new version.

## Contacts

- `create-contact`: `email`, fields, `address` {line_1, line_2, city, state, postal_code, country}, `custom_fields` {slug: value}, `tags` and `lists` (ids, slugs or titles). An email that exists in any case is `contact_exists`. `double_optin: true` sends FluentCRM's confirmation email to a contact that is not subscribed.
- `update-contact`: only the fields you pass change. **Clearing:** `""` or `null` clears a field, a custom field included; `[]` clears a multiple choice. `new_email` renames the contact (`email_exists` when another contact has it). `add_tags`, `remove_tags`, `add_lists`, `remove_lists`; `status_change_reason` adds FluentCRM's audit note.
- **Linked WordPress users.** FluentCRM syncs a linked user's name and email. EMCP refuses a write that would change an administrator's name or email (`linked_admin_user`), move the contact to another user (`would_relink_user`) or let FluentCRM change the user's email (`wp_user_email_sync`), even when the email in the request is unchanged.
- `add-note`, `update-note`, `delete-note`.
- `add-custom-field` (`label`, `slug`, `type`, `options`, `group`; `field_exists` for a taken slug) and `update-custom-field` (label, options, group; slug and type never change). Both name the custom field list version.

## Automations do not run unless you ask

Tag, list and user writes can enter contacts into automations, and an automation can send email in the same call. EMCP holds FluentCRM's automation triggers for every write. Pass `run_automations: true` to let them run; the answer then lists the `automations` entered and the `emails` sent. EMCP refuses with `automation_hold_unavailable` when it cannot hold a live trigger.

## Batches and caps

- `import-contacts`: up to 200 rows, each `{ email, first_name, last_name, phone, ..., address, custom_fields, tags, lists }`: contact fields sit on the row itself, never under a `fields` key, and a row with a key EMCP does not know is refused (`invalid_argument`, nothing written); `if_exists` merge (default) or skip; missing tags and lists are created only with `create_missing: true` (`unknown_segment` otherwise). One History entry, undone row by row.
- `tag-contacts`: up to 200 contacts as `contact_ids` or a `filter` (the list-contacts filters); `dry_run: true` gives FluentCRM's count first.
- Tags and lists: `create-tag`, `update-tag`, `delete-tag`, `merge-tags`, `create-list`, `update-list`, `delete-list`, `merge-lists`. Deletes and merges need `confirm: true` and touch up to 500 attached contacts.
- Over a cap the answer is `too_many_contacts` with the count; nothing is written. Split the work.

## Email: confirm and expected_recipients

Nothing is emailed without `confirm: true`.

- `create-template`, `update-template`, `delete-template` (confirm).
- `create-campaign` and `update-campaign` write drafts only (`not_a_draft` otherwise): subject, pre-header, body, design template, `recipients` and `exclude_recipients` {tags, lists}, settings, A/B subjects. `duplicate-campaign` copies one as a draft; `delete-campaign` (confirm) deletes a draft.
- `schedule-campaign` (confirm): `expected_recipients` must equal the `recipients_estimate` count from `get-campaign`, or the answer is `recipients_mismatch` with the live `estimate` and nothing is queued. `scheduled_at` is a **site-local** time `Y-m-d H:i` in the future; without it the campaign sends now.
- `unschedule-campaign` takes a scheduled campaign back to draft while none of its emails has left the queue (`emails_sent` otherwise; `not_scheduled` for a campaign that is not scheduled). `pause-campaign` and `resume-campaign` (confirm) pause and resume sending.
- `send-test-email` (confirm) goes to your own address only. `send-email-to-contact` (confirm) sends one email now.
- `fluentcrm_busy` means FluentCRM or another EMCP call is working on that object right now (for a campaign, FluentCRM's sender holds it): try again in a minute.

## Automations

- `set-automation-status`: `published` needs `confirm: true` (its triggers go live and enrolled contacts continue from their due steps); the answer lists the triggers and the active, waiting and due enrolments. `draft` cannot be undone, because undoing it would publish again.
- `set-contact-automation`: `cancel`, or `resume` and `advance` (to `advance_to_sequence_id`) with `confirm: true`. An advanced step is due at once and FluentCRM's processor runs it on its next minute pass (`due_now`). None of these can be undone.

## Consent

Undo never makes a contact sendable again: an undo that would restore a contact who unsubscribed, bounced, complained or was marked as spam after the write is refused with `contact_opted_out`, and a list membership the contact left is never restored. `force` does not change this. Unsubscribing a contact also cancels FluentCRM's queued emails and automations for them, and undo does not bring those back.

## Erasure

`delete-contact` (confirm) erases the contact with everything FluentCRM keeps about them. It cannot be undone. EMCP also removes the contact's data from every earlier FluentCRM History entry: entries about that contact alone become not undoable (`redacted`), and batch, tag and list entries lose only that contact and stay undoable for the others (a tag or list entry may then need `force`). A delete in FluentCRM's own admin erases the History copy too.

## History

Most writes can be undone in History. Undo checks the version (`force` skips only that) and refuses when later real work happened: a created contact that has since received email, entered an automation, been linked to a user or given someone else's notes (`contact_in_use`), a tag or list in use (`segment_in_use`), a campaign whose emails left the queue (`emails_sent`) or that is no longer a draft (`campaign_in_use`). Undo never sends, never runs automations, and cannot unsend what a write sent; History says so on such an entry. Sends, unschedules, pauses, resumes, unpublishing, contact automation moves and erasures are recorded for the audit trail only.

History keeps contacts' data (the before-images) for its retention period, 90 days by default (Neo EMCP > History). Summaries name contacts by id only.

If FluentCRM fails half way, EMCP puts back what it can and answers `partial_write` with a recovery entry, or `fluentcrm_error` with `attribution_uncertain` when it cannot tell which rows FluentCRM wrote: then it changes nothing and names the tables to check.
