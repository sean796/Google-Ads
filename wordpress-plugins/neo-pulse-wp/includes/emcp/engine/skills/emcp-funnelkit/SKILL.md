---
name: emcp-funnelkit
description: Build and run FunnelKit sales funnels and email automations through EMCP's four FunnelKit tools (funnelkit-read, funnelkit-write, funnelkit-automations-read, funnelkit-automations-write). Covers funnels, steps, checkout products, order bumps, upsells, A/B tests, automations, contacts, tags, lists and broadcasts, plus what History can and cannot undo.
---

# FunnelKit

EMCP drives FunnelKit through FunnelKit's own REST controllers, so every write goes through the same validation as the FunnelKit admin.

| Tool | Plugin | Default |
|---|---|---|
| `funnelkit-read` | Funnel Builder | on |
| `funnelkit-write` | Funnel Builder | off until an admin enables it on the Tools screen |
| `funnelkit-automations-read` | FunnelKit Automations | on |
| `funnelkit-automations-write` | FunnelKit Automations | off until an admin enables it |

Order bumps, upsells and A/B tests need Funnel Builder Pro. Broadcasts, templates, form feeds, link triggers, audiences and bulk actions need Automations Pro. Operations for an inactive add-on are left out of the catalog.

## Discover first

Call each tool with no `operation`. The answer lists every operation with its arguments, which arguments are required, whether it needs `confirm`, whether it accepts `dry_run`, and whether History can undo it. Trust that list over memory.

- Arguments go in `arguments`. Unknown arguments are refused.
- Writes that delete, send or cannot be undone need `confirm: true`.
- Most creates and updates accept `dry_run: true`: they validate, show the exact request and write nothing.
- Every write answers with a `change` block. `undo.available` says whether History can roll it back; `undo.reason` says why not.

## Build a funnel end to end

1. `create-funnel` with `funnel_name`. Keep the funnel ID from the answer. `funnel_steps` can add blank steps at once, as a list of step types (`["landing", "wc_checkout", "wc_thankyou"]`, from `landing`, `wc_checkout`, `upsell`, `wc_thankyou`, `optin`, `optin_ty`); FunnelKit gives them default titles, so rename them with `save-step-state`.
2. Or `create-step` once per step, in order. `type` is one of `landing`, `optin`, `optin_ty`, `wc_checkout`, `wc_upsells`, `wc_thankyou`. A new `wc_upsells` step comes with one sample offer. Pass `builder` and `template` (from `list-templates`) to start from a design. A Block Editor (`gutenberg`) template needs FunnelKit's SlingBlocks plugin: without it the answer is `builder_unavailable` and nothing is created. If an import fails or a hook throws and new steps appear, the answer is `partial_write` with observed step IDs and `attribution: unverified`. A concurrent request may have created them. Inspect the funnel and establish ownership before any recovery or retry; EMCP neither deletes them nor offers automatic undo. A throw with no observed new steps answers `funnelkit_request_failed`, also requiring inspection before retry.
   A checkout step with no design cannot be shown on FunnelKit free under PHP 8 (FunnelKit's fallback embed form stops the page with a PHP error). Give every checkout step a design before publishing; the simplest is `update-step-design` with `type: checkout` and `design: { "builder": "embed_forms", "template": "embed_forms_1" }`. The checkout's embed form templates (`embed_forms_*`, `custom_funnel_form_*`) are listed under `wp_editor` but are sent as `embed_forms`; EMCP does that for you.
3. `set-checkout-products` on the checkout step with `dry_run: true` first. Each product is `{ id, quantity, discount_type, discount_amount }`; discount types are `percent_discount_reg`, `percent_discount_sale`, `fixed_discount_reg`, `fixed_discount_sale` and `flat_price`. The dry run reports the effective price of each line. Show it to the user, then run it without `dry_run`.
4. Order bump: `create-order-bump` (`funnel_id`, `step_id` of the checkout, `type: wc_order_bump`, `title`), then `set-order-bump-products` on the bump ID with WooCommerce product IDs. Quantity and discount go through `set-order-bump-product-layout`.
5. Upsell: `create-offer` on the upsell step, then `set-offer-products` on the offer ID with product IDs. Price and quantity go through `set-offer-product-layout`. `set-upsell-path` decides where accept and reject lead.
6. `publish-all-steps` with the funnel ID.
7. Verify with `get-funnel` and `get-checkout-products`, which reports the price a buyer pays.

Ready-made designs: `list-templates`, then `import-template` (needs `confirm`). FunnelKit finishes the import in the background; when the answer is `pending`, call `import-status` with the arguments it gives. A checkout template can bring FunnelKit's sample order bump with no products (shown as "No Products" in the funnel's steps): after the import, `list-order-bumps` and either give it products or delete it.

Moving funnels between sites: `export-funnels` gives JSON that `import-funnels` takes back (new funnels only). Pass the export as it is; an entry that names an existing funnel `id` is refused.

## Edit page design

Funnel steps are WordPress pages. A step built with Elementor is edited with the Elementor tools, using the step ID as the post ID. `get-step-design` reports which builder and template a step uses; `update-step-design` switches it with `design: { builder, template }` (the step type is `checkout`, `landing`, `optin`, `optin-ty`, `thankyou` or `upsell`). Switching a design imports the template, which replaces the step page's content. The FunnelKit tools never edit page content otherwise: `update-step` switches a step on or off, and `save-step-state` renames it or changes its slug.

## Automations

1. `list-events` and `list-actions` to see what can start an automation and what a step can do.
2. `create-automation` with a `title`. It starts off.
3. `update-automation` with `data` holding the event, its rules and settings, in the shape `get-automation` returns.
4. `add-step` once per step (`type` is `wait` for a delay, `action`, `conditional`, `split`), keeping each `step_id`. Then `update-step` for each step with:
   - `data`: for an action, `{ "action": { "action": "wp_sendemail", "intergration": "wp" } }` (FunnelKit spells it `intergration`; adding a tag is `crm_add_tag` with `autonami`) plus its settings under `data.sidebarData`; for a delay, `{ "data": { "sidebarData": { "type": 1, "data": { "day_delay": { "unit": "min", "text": "1" } } } } }`;
   - `steps`, `links` and `count`: the whole flow. Nodes are `{ id, type, stepId }` with `start` and `end` nodes; links are `{ id, source, target }` from `start` through each node to `end`; `count` is the number of nodes.
   An email needs the `{{unsubscribe_link}}`, `{{business_name}}` and `{{business_address}}` merge tags unless it is transactional. Read an existing automation with `get-automation` before writing one by hand.
5. `toggle-automation` with `state: 1` turns it on. Undo turns it off again, but messages it sent meanwhile are not recalled. Ask before turning it on.

Contacts:

- `list-contacts` answers compact rows (id, email, tags, lists). Use `get-contact` for one contact in full.
- `create-contact` never creates a WordPress user.
- Tags and lists are assigned by existing ID: `create-tags` (one request per name) or `create-list` first, then `assign-tags` or `assign-lists`. Adding a tag or list can start automations that listen for it.

## Broadcasts (Automations Pro)

1. `create-broadcast` with a `title` and `type` (1 email, 2 SMS, 3 WhatsApp). It is a draft.
2. `update-broadcast` with `step` 1 (details), 2 (audience filters) and 3 (content and sender).
3. `send-broadcast` with `dry_run: true`. It reports how many contacts would receive it.
4. Tell the user the recipient count and wait for an explicit yes. Only then call `send-broadcast` (or `schedule-broadcast` with a `schedule_time`) with `confirm: true`.

`send-test-email` goes to one address only, with `confirm`.

## What cannot be undone

History records these but cannot roll them back. Say so before you ask for confirmation.

- Sending or scheduling a broadcast, and test emails.
- Putting contacts into an automation, taking them out, or changing their run status; declaring a split winner.
- Deleting automations (their contact runs go with them) or an automation step (contacts waiting at it move on).
- Deleting contacts, unsubscribing and resubscribing.
- Deleting a contact field (every contact's value for it goes) or a field group.
- Deleting broadcasts, email templates and link triggers; copying templates, link triggers and bulk actions.
- Running a bulk action, and contact exports (they are logged as personal data access).
- Adding a note and creating a list: remove them with `delete-note` or `delete-list`.
- Resetting funnel analytics or an A/B test, and declaring an A/B winner.
- Creating, deleting or importing the store checkout, and importing several funnels at once.

Everything else can be undone from Neo EMCP > History.

## Not available

- Importing a recipe and importing contacts from CSV: use the FunnelKit admin.
- Funnel and contact CSV downloads: `export-funnels` and `export-contacts` return the data inline instead (contact exports need `confirm`).

## Never

- Never create WordPress users or set passwords through contacts.
- Never send, schedule or start a bulk action without the user's explicit go-ahead in this conversation.
- Never try to reach API keys, connectors, licences or plugin installs: those routes are blocked, and settings outside the allowlist are refused.
