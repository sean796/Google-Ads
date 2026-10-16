---
name: emcp-mailpoet
description: Run MailPoet through EMCP's mailpoet-read and mailpoet-write tools - subscribers with their lists, tags and custom fields, imports and bulk tagging, lists, tags and custom field definitions, block-editor newsletters, test sends, sending, schedules, pauses and automation status. Covers versions and conflicts, automations and welcome emails (run_automations), who gets emailed (send_confirmation, confirm, expected_recipients), MailPoet's consent record, subscribers of WordPress users, status rules, unscheduling and sending_imminent, erasure, the caps, and what History can undo.
---

# MailPoet

EMCP drives MailPoet 5.x through MailPoet's own code, in-process: its public PHP API for lists, tags, custom fields and memberships, its subscriber save controller for profile and status changes, its JSON endpoints for newsletters and sending, and its REST routes for automations and custom field edits. MailPoet keeps its own rules; EMCP adds versions, a read-back of every write, a report of every email and automation run the call caused, History undo, and erasure of a subscriber's data from History.

| Tool | Default |
|---|---|
| `mailpoet-read` | on |
| `mailpoet-write` | off: the site owner enables it under Neo EMCP > Tools > Plugins > MailPoet |

Call either tool with no operation to list its operations and their arguments. Pass arguments as `{operation, arguments}`.

## Who may do what

Every operation checks MailPoet's own capability for its domain, as MailPoet's admin does, for reads and writes alike:

| Domain | Capability |
|---|---|
| subscribers, tags, custom fields (definitions and values) | `mailpoet_manage_subscribers` |
| lists | `mailpoet_manage_segments` |
| newsletters and sending | `mailpoet_manage_emails` |
| automations | `mailpoet_manage_automations` |
| forms (read only) | `mailpoet_manage_forms` |
| `get-setup` | `mailpoet_access_plugin_admin` |

An editor (emails and automations only) cannot list or read subscribers, tags or custom fields; a refusal answers `forbidden` and names the capability.

## Read first

- `get-setup`: version and support, double opt-in, the sending method's name, sender and reply-to, the subscriber limit, the system lists, the active automations and their triggers, and the write operations you may run.
- `list-subscribers` (search, status, list_id, tag_id, created_after, created_before, sort, page), `get-subscriber` (by `subscriber_id` or `email`, any case): profile, status, custom fields as `cf_{id}`, lists with the membership status, tags, emails sent, automation runs.
- `list-lists`, `list-tags`, `list-custom-fields`.
- `list-newsletters`, `get-newsletter` (subject, sender, lists, status, schedule in site time, editor `block` or `legacy`, body, sending status, statistics), `get-recipient-count`.
- `list-automations`, `get-automation`, `list-forms`.

Every subscriber, list, tag, newsletter, automation and the custom field definitions answer a **version**. Pass it to every write on that object: a different version answers `conflict` (read again and redo the change), a missing one `missing_version`, and `force: true` writes anyway. A list's version covers its members and their statuses, its newsletter links and its filters, so a list changed since you read it is a conflict even at the same member count.

## Subscribers

- `create-subscriber`: email, `first_name`, `last_name`, `custom_fields` `{cf_{id}: value}`, `list_ids`, `tag_ids`. The status is MailPoet's (`unconfirmed` while double opt-in is on). An email that exists in any case or with spaces answers `subscriber_exists`.
- `update-subscriber`: only the fields you pass change. `""` or null clears a name or a custom field value. `add_lists`, `remove_lists`, `add_tags`, `remove_tags` change memberships one by one, never by replacement. Moving an email to another subscriber's address (any case) answers `email_exists`.
- Adding a list never changes anyone's consent. MailPoet's own list add makes anyone not subscribed sendable (or unconfirmed with double opt-in on) and restores a trashed subscriber, so a list is added only to subscribed people, or to unconfirmed ones while double opt-in is on. Anyone else answers `consent_required` (unsubscribed, bounced, inactive, or unconfirmed with double opt-in off) with the `subscriber_ids` it applies to, and nothing is written. Tags are not consent and still apply.
- Custom field values are checked before anything is written: select and radio take one of their values, a checkbox `1` (or true) or `""`, a date `Y-m-d`; anything else is `invalid_argument`.
- MailPoet's consent record (`source`, the subscribed and confirmed IPs, `confirmed_at`, the tracking consent method and copy) is never written.
- Subscribers of WordPress users and WooCommerce customers take their email and names from the user: changing those answers `synced_subscriber`; lists, tags, custom fields and status can change. They cannot be deleted here. The `WordPress Users` and `WooCommerce Customers` lists cannot be written (`system_list`).

### Status

- `set-subscriber-status: unsubscribed` runs MailPoet's own unsubscribe from every list. It cannot be undone: EMCP never resubscribes anyone.
- `set-subscriber-status: subscribed` only from `unconfirmed`, with `confirm: true` (a manual confirmation, as MailPoet's admin allows). For someone who unsubscribed, bounced or went inactive it answers `consent_required`: only they can subscribe again.
- `send-confirmation-email` sends the double opt-in email again to an unconfirmed subscriber, with `confirm: true`.

## Automations, welcome emails and confirmation emails

Nothing starts and nothing is emailed unless you ask:

- Every write that can subscribe, tag or change a status takes `run_automations` (default false). While false, EMCP holds MailPoet's automation triggers for the call, schedules no welcome email and sends no "new subscriber" notice. MailPoet also queues subscriber events until the request ends; EMCP fires the ones its write queued inside the call, still held, so nothing starts later in a long-running process either. With `run_automations: true` MailPoet behaves as in its admin, and the answer lists the automation runs (`automations`) the write and its events started.
- If EMCP cannot tell whether a MailPoet listener starts automations, or cannot reach MailPoet's event queue, the write answers `automation_hold_unavailable` and nothing is written; pass `run_automations: true` if that is what you want.
- `send_confirmation: true` (with `confirm: true`) on `create-subscriber` sends MailPoet's confirmation email.
- Every answer carries `emails: {sent, queued}`. A listener of another plugin that fails after a change was saved is reported as `warning: mailpoet_event_error`; the change is kept.

## Batches

- `import-subscribers`: up to 200 rows `{email, first_name, last_name, custom_fields, list_ids, tag_ids}`; `if_exists` `merge` (default) or `skip`. A row matching a subscriber in MailPoet's trash answers `subscriber_trashed`, and merging lists onto someone who opted out answers `consent_required`; either way nothing is written, so leave those rows out.
- `tag-subscribers`: up to 200 `subscriber_ids`, or a `filter` `{search, status, list_id, tag_id}`; add or remove tags and lists; `dry_run: true` answers the count and the ids only.
- Over the cap answers `too_many_subscribers` with the count, and nothing is written: split the work. One History entry per batch, undone row by row; rows changed, opted out or in use since are left and reported.

## Lists, tags and custom fields

- `create-list`, `update-list`, `delete-list` (with `confirm: true`, up to 500 members, else `too_many_subscribers`; MailPoet refuses a list an active email or a form uses). Undoing a delete puts the list, its newsletter links and the memberships back, never one of a subscriber who was erased or unsubscribed since.
- `create-tag`, `update-tag`, `delete-tag` (with `confirm: true`, up to 500 holders).
- `add-custom-field` (text, textarea, date, select, radio, checkbox; select and radio need `params.values`, a checkbox exactly one value), `update-custom-field` (name and params; the type never changes, `type_change`). Undoing an add only works while no subscriber has a value for the field (`field_in_use`).

## Newsletters and sending

- `create-newsletter`, `update-newsletter`: standard newsletters in MailPoet's block email editor; `name` is the campaign name MailPoet lists it by (it defaults to the subject, where MailPoet alone would call it "New Email"); `content` is block markup, written to the newsletter's post as WordPress writes your posts. If WordPress filtered it, the answer carries `warning: content_filtered` with what was stored. Only drafts change (`not_a_draft`). A newsletter made in MailPoet's legacy editor keeps its body (`legacy_editor`); its subject, preheader, sender and lists can still change.
- `duplicate-newsletter`, `delete-newsletter` (drafts, `confirm: true`).
- `send-test-email` (with `confirm: true`) sends a preview to your own WordPress email address only; any other address is ignored.
- `send-newsletter` (with `confirm: true`): now, or at `scheduled_at` (the site's local time as `Y-m-d H:i`, in the future, else `past_time`; MailPoet stores it in UTC and answers give it in site time, with `scheduled_at_utc`). `expected_recipients` must equal `get-recipient-count` (globally subscribed, untrashed members of the lists, each once), else `recipients_mismatch` with the live count and nothing queued. A newsletter to a dynamic segment, or with a segment filter, cannot be counted and answers `recipients_uncountable` for both the count and the send: send it from MailPoet. A site over its plan's subscriber limit answers `mailpoet_limit_reached`. A send now queues every recipient at once and cannot be undone; a schedule can be undone like an unschedule.
- `unschedule-newsletter` takes a scheduled newsletter back to draft in one locked transaction of its own. It answers `sending_started` once MailPoet has started sending, and `sending_imminent` when the send is less than 120 seconds away (MailPoet may be picking it up): pause it instead. An unschedule cannot be undone; schedule again with `send-newsletter`.
- `pause-newsletter`, and `resume-newsletter` with `confirm: true`: they cannot be undone; use the other one.

## Automations

`set-automation-status`: `active` needs `confirm: true`; MailPoet checks every step and refuses with its own message (`automation_invalid`, for example an empty sender name). An activated automation is live from the next request, not in a process that is already running. Undoing an activation puts it back to draft. `deactivating` (running runs finish) and `draft` cannot be undone, since that would switch it on again. Building automation steps is MailPoet's editor's job.

## Leases

Writes take short leases on what they touch (the custom field definitions, tags, lists, newsletters, automations, subscribers, and a new subscriber's email). A busy lease answers `mailpoet_busy`: try again in a moment.

## Erasure and History

- `delete-subscriber` (with `confirm: true`) erases a subscriber with their memberships, custom field values and tags. It cannot be undone, and every earlier MailPoet History entry about them loses their data (`redacted`); batch and list entries keep the other subscribers. A delete in MailPoet's own admin and a WordPress privacy erasure request redact History too.
- Before-images in History hold subscribers' personal data for the History retention period (90 days by default).
- Undo never makes a subscriber who unsubscribed, bounced or went inactive sendable again (`subscriber_opted_out`), never puts `subscribed` back over another status set since, such as waiting to confirm again (`consent_required`), never puts them back on a list they left, never deletes or changes a list membership that says unsubscribed now (`subscriber_opted_out`), never undoes a create of a subscriber who has been sent an email, entered an automation, confirmed or been linked to a user since (`subscriber_in_use`) or who unsubscribed, bounced, went inactive or left a list since (`subscriber_opted_out`: deleting them would delete the record of it), never undoes anything about a newsletter that has started sending, and never reactivates an automation. `force` does not change these.

## Errors

- `mailpoet_error` with `recovered: true`: MailPoet stopped half way and EMCP put the rows back.
- `warning: mailpoet_after_save_error`: MailPoet failed after it saved the change, which matched what was asked; the change is kept.
- `mailpoet_error` with `attribution_uncertain`: EMCP could not tell which rows MailPoet wrote, so it changed nothing; check MailPoet.
- `partial_write`: EMCP could not put everything back; History holds the earlier rows.
- `mailpoet_unavailable`: MailPoet's database layer stopped after an earlier error in this process; ask the user to reconnect their AI client.
- `mailpoet_unsupported_version`: only `get-setup` answers.
