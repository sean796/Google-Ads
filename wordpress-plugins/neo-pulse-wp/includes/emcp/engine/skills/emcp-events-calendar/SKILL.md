---
name: emcp-events-calendar
description: Build The Events Calendar (free) events through EMCP's events-calendar-read and events-calendar-write tools - create venues and organizers, create events with their dates, time zone, venue, organizers, categories and tags, publish them, mark them cancelled or postponed, and move them to the trash. Covers dates and time zones, versions and conflicts, partial updates, why trash is the only delete and when a venue cannot be trashed, and what History can undo.
---

# The Events Calendar

EMCP drives The Events Calendar (TEC) 6.x through TEC's own PHP layer, the one its calendar views use, so TEC stores every change the way its editor does, including the calendar tables its month and list views read.

| Tool | Default |
|---|---|
| `events-calendar-read` | on |
| `events-calendar-write` | off: the site owner enables it under Neo EMCP > Tools > Plugins > The Events Calendar |

Call either tool with no operation to list its operations and their arguments. Pass arguments as `{operation, arguments}`. Administrators and editors work on every event; authors on their own events (and can publish them); contributors create drafts of their own only.

TEC also has REST APIs (`tribe/events/v1`, and the experimental `tec/v1`). Use EMCP's tools instead: a partial update through `tribe/events/v1` deletes an event's cost, organizers and featured flag, resets its time zone and publishes a draft, and EMCP adds versions, checks and History undo on top.

## Read first

- `get-setup`: the TEC version and whether EMCP supports it, the time zone mode and site time zone, the enabled views and default view, events per page, the date formats, whether you may create and publish events, and the write operations you may run.
- `list-events`: events by start date with `start_after`, `end_before` (`Y-m-d` or `Y-m-d H:i`), `status`, `search`, `category`, `venue_id`, `organizer_id`, `featured`; 20 per page with `total`. Other authors' drafts appear only for users who may edit them.
- `get-event`: the event's fields (the names `create-event` and `update-event` take), its venue and organizers, categories, tags, event status and reason, and its **version**. A venue deleted outside EMCP shows as `{id, missing: true}`.
- `list-venues` / `get-venue`, `list-organizers` / `get-organizer`: their fields, how many events link to them, and their **version**. On TEC free venues and organizers have no pages of their own (Events Calendar Pro adds them), so their `url` is empty; they show on the event page.
- `list-categories`: event categories with their **version**.

## Build an event

1. `create-venue` with `title` and the address you have (`address`, `city`, `state_province`, `zip`, `country`, `phone`, `website`, `show_map`). It starts as a draft; pass `status: publish` to publish it.
2. `create-organizer` with `title`, `email`, `phone`, `website`.
3. `create-category` with `name` if the event needs a new category.
4. `create-event` with `title`, `start_date`, `end_date`, `timezone` and the details: `content` (HTML), `excerpt`, `cost`, `website`, `currency_symbol` and `currency_position` (`prefix` or `suffix`), `featured_image` (an image's attachment id), `featured`, `categories` (ids), `tags` (names or ids), `venue_id`, `organizer_ids`. It starts as a draft.
5. `get-event` to check, then `update-event` with `status: publish`.

## Dates and time zones

- `start_date` and `end_date` are `Y-m-d H:i` in the event's own time zone. For an all-day event pass `all_day: true` with `Y-m-d` dates; TEC stores them as the whole days (00:00:00 to 23:59:59).
- `timezone` is an identifier such as `Europe/Paris` or `America/New_York`, `UTC`, or an offset such as `UTC+2` (what TEC stores on sites set to an offset). Anything else is `invalid_timezone`.
- An end before the start is refused (`invalid_dates`); TEC itself would ignore it silently.
- Changing only the dates keeps the event's time zone.

## Change things

- `update-event` changes only the fields you pass; everything else stays as it is. `venue_id: 0` unlinks the venue, `organizer_ids: []` removes the organizers, `featured_image: 0` removes the image, `cost: ""` clears the cost.
- `update-venue`, `update-organizer` and `update-category` work the same way.
- `set-event-status` with `event_status` `cancelled` or `postponed` (and a `reason` shown on the event page), or `scheduled` to clear it.
- A venue or organizer you link must exist and be outside the trash (`linked_unavailable` otherwise).

## Versions and conflicts

Every write to an existing event, venue, organizer or category passes its `version` (from `get-event`, `get-venue`, `get-organizer` or `list-categories`). If someone changed it since you read it, the write is a `conflict` and nothing is written: read again and redo the change, or pass `force: true` to overwrite on purpose. Every answer gives the new version. `tec_busy` means another change to the same object is running; try again in a moment.

## Trash, not delete

Events, venues and organizers are only ever moved to the trash (`trash-event`, `trash-venue`, `trash-organizer`, each with `confirm: true`). A venue or organizer that events outside the trash still link to is not trashed (`in_use`, with the event ids): unlink it from them first. Categories are never deleted. A recurring event of Events Calendar Pro is read but never written (`recurring_event_unsupported`).

## History

Every write can be undone in Neo EMCP > History: an edit comes back as it was (dates included in TEC's calendar tables), a new event, venue, organizer or category is removed, and a trashed one gets its earlier status back. An undo never writes over a newer change unless forced. An event is never restored onto a venue or organizer that is gone or in the trash since (`linked_unavailable`: restore that venue or organizer first), and a venue, organizer or category that events use is not removed (`in_use`).
