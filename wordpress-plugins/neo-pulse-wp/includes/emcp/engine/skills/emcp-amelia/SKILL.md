---
name: emcp-amelia
description: Run the Amelia booking system (Lite or premium) through EMCP's amelia-read and amelia-write tools - set up service categories, services, employees with their working hours and days off, and customers, read free time slots, book, reschedule, approve and cancel appointments, create, open and cancel events and book attendees. Covers site-local times and minutes, versions and conflicts, who gets emailed (notify), what Amelia Lite does not store, deletes, and what History can undo.
---

# Amelia

EMCP drives Amelia 2.4 or later through Amelia's own controllers, the ones its admin uses, so Amelia checks permissions, working hours and slots and runs its own integrations. EMCP adds validation, versions, a read-back of every write, a report of every message Amelia sends, and History undo.

| Tool | Default |
|---|---|
| `amelia-read` | on |
| `amelia-write` | off: the site owner enables it under Neo EMCP > Tools > Plugins > Amelia |

Call either tool with no operation to list its operations and their arguments. Pass arguments as `{operation, arguments}`. Amelia administrators and managers work on everything Amelia lets them; an Amelia employee works on their own appointments and profile only (their schedule only when Amelia's settings let employees configure it); Amelia customers are refused.

## Units and times

- Every time is **site-local**, `Y-m-d H:i` (dates `Y-m-d`), in and out. `get-setup` gives the site time zone. Amelia stores UTC; EMCP converts both ways, across daylight-saving changes too.
- Durations, buffers and slot lengths are **minutes** (Amelia stores seconds).
- Prices are numbers (`40.5` or `"40.50"`).

## Read first

- `get-setup`: version, edition (`Lite` or a premium licence), the time zone, currency, default appointment status, slot length, booking window, whether a mail sender is configured (without one Amelia sends no email at all), the channels set up, the MCP Adapter copy that is loaded, and the write operations you may run.
- `list-categories`, `list-services` / `get-service` (its employees with their own price and capacity), `list-employees` / `get-employee` (the working week: days `monday` to `sunday` with `start`, `end`, `periods` and `breaks`; a missing day is closed; and days off), `list-customers` / `get-customer` (counts of appointments and event bookings).
- `list-appointments` (from and to, default today to 30 days; filters employee, service, customer, status), `get-appointment` (bookings with persons, price and payment status, each booking with its own **version**).
- `get-availability`: free start times per day for a service (`from`, `to`, optional `employee_id`, `persons`), computed by Amelia from the working hours, breaks, days off and booked appointments.
- `list-events` / `get-event` (periods with ids, places left), `list-event-bookings` (attendees with their **version**).

Every object answers a **version**. Pass it to every write on that object; a different version answers `conflict` (read again and redo the change), and `force: true` writes anyway. Every write answers the new version.

## Set up

1. `create-category` (`name`, `color`, `position`); `update-category` changes it.
2. `create-employee` (`first_name`, `last_name`, `email`, optional `phone`, `description`, `services`); `update-employee` changes the profile or services and leaves the week alone. No WordPress user is created or linked.
3. `set-working-hours` for each employee: `week` is the whole week, `[{day, start, end, breaks: [{start, end}]}]`; a day you leave out is closed. **Without working hours an employee has no free slots and bookings answer `time_slot_unavailable`.** `set-days-off` replaces the days off (`[{name, start, end, repeat}]`).
4. `create-service` (`name`, `category_id`, `duration` in minutes, `price`, optional `description`, `color`, `employees`: ids, or `{id, price, min_capacity, max_capacity}` for an employee's own price). `update-service` changes only what you pass; `employees` replaces the list and keeps each employee's own price unless you give one; `apply_to_employees: true` pushes the service price to every employee.
5. `create-customer` (`first_name`, `last_name`, optional `email`, `phone`, `note`, `birthday`, `gender`). `update-customer` changes only what you pass. An email another employee or customer has answers `email_exists`. An empty `phone` or `note` clears it.

**Amelia Lite** stores no buffer times (`time_before`, `time_after`), deposits, hidden services or service capacities above 1, and no event tags; EMCP answers `not_in_lite` naming the fields instead of writing what Lite would drop. Premium editions store them.

## Appointments

- `create-appointment`: `service_id`, `employee_id` (who performs the service), `customer_id`, `start`, optional `persons`, `internal_notes`, `status` (`approved` or `pending`). Amelia refuses a taken slot or a time outside the working hours: `time_slot_unavailable`. A second customer in a group service's booked slot joins that appointment: the answer says `merged: true` and gives the `booking_id`.
- `reschedule-appointment` (`start`, optional `employee_id`), `set-appointment-status` (`approved`, `pending`, `canceled`, `rejected`; Amelia stores a cancelled appointment with its end equal to its start, and approving it again restores the end), `update-appointment` (`internal_notes`, `persons`), `set-booking-status` (one booking of a group appointment, or an event attendee).
- Payments are created by Amelia as for its admin (on site, pending). EMCP reads payment status and never changes payments.

## Who gets emailed

- `notify` defaults to **false** on every write: EMCP holds every message to customers through Amelia's own mail filter. Pass `notify: true` to let Amelia email the customer.
- Amelia still emails the **employee** about bookings and status changes when a mail sender is configured.
- Every answer lists `notified`: what Amelia actually sent during the call (`[{recipient: customer | employee, channel}]`). Without a sender it is empty.
- Undo never sends anything, and it cannot unsend what a write sent; History says so on such an entry.

## Events

- `create-event` (`name`, `periods: [{start, end}]`, optional `description`, `price`, `max_capacity`, `color`, `visible`, `employees`, `booking_opens`, `booking_closes`). `update-event` changes only what you pass; `periods` replaces the list, so give a period's `id` to keep it.
- `set-event-status`: `open` or `cancelled`. With `notify: true` Amelia emails the attendees about a cancellation.
- `add-event-booking` (`event_id`, `customer_id`, `persons`): EMCP checks the places left first (`event_full`), because Amelia does not check them for back-end bookings; the event must be open (`event_closed` otherwise).

## Deletes

`delete-category`, `delete-service`, `delete-employee`, `delete-customer`, each with `confirm: true`, only when nothing uses them: `in_use` for a category with services (Amelia would delete the services with it), a service with any appointment, or a person with any appointment or event booking, past ones included. Hide services and employees instead (`set-service-status`, `set-employee-status`). Appointments and events are never deleted: cancel them. A deleted person's WordPress user, if any, stays.

## Errors

`amelia_busy` (another change to the object or one it is linked to is running: retry), `conflict`, `missing_version`, `invalid_argument`, `not_found`, `forbidden`, `time_slot_unavailable`, `email_exists`, `event_full`, `in_use`, `not_in_lite`, `save_incomplete` (Amelia did not store what was sent; it was put back), `partial_write` (it could not all be put back; History holds the earlier rows), `amelia_error` (Amelia threw; with `recovered: true` its rows were put back, with `attribution_uncertain` nothing was touched). A success that carries `warning: amelia_after_save_error` was saved by Amelia, whose own follow-up hook then failed.

## History

Every write is one History entry and can be undone there (or with `rollback-change`). Undo puts Amelia's rows back as they were, with their ids, and notifies nobody. It is refused when the object changed since (`conflict`, `force` overrides), or always, whatever `force` says, when later real work depends on it: a created service, employee or customer that has appointments or event bookings now (`in_use`), another customer booked into it since (`bookings_since`), a payment that moved on (`payment_moved`), a slot taken since (`time_slot_unavailable`), an event with no places left (`event_full`), an email someone else took (`email_exists`), or something it points at that is gone (`linked_unavailable`).
