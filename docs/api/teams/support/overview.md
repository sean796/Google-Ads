---
title: Support overview
slug: teams/support/overview
section: Teams
order: 6
---

Team-scoped **Support tickets** capture Pulse Assist issues with attached chat logs, manual comments, and AI-generated title/summary metadata.

## Concepts

| Term | API surface |
| --- | --- |
| Ticket | `GET/POST/DELETE /api/teams/{teamId}/support/tickets` |
| Ticket detail | `GET/PATCH/DELETE /api/teams/{teamId}/support/tickets/{ticketId}` |
| AI prefill | `POST /api/teams/{teamId}/support/tickets/preview-ai` |
| Comment | `POST /api/teams/{teamId}/support/tickets/{ticketId}/comments` |
| Chat log file | `GET /api/teams/{teamId}/support/tickets/{ticketId}/chat-log` |
| Export bundle | `GET /api/teams/{teamId}/support/export` |

## Access

Active team membership is required (same gate as Tasks). Tickets are stored per team in WordPress MySQL and chat logs are written under the private neo-pulse-data root (`support/teams/{teamId}/`, above the web root).

## Create flow (Pulse Assist)

1. User opens Pulse Assist and clicks **Create a ticket**.
2. Client builds the same debug JSON used by **Download debug log**.
3. User writes a **description of the issue** first.
4. `POST .../support/tickets/preview-ai` returns suggested title and summary from that description plus the chat log (OpenRouter).
5. User edits title and summary, then submits `POST .../support/tickets`.
6. Server stores the ticket, writes the chat log file, and saves the description as the initial comment when provided.

## Export bundle

`GET /api/teams/{teamId}/support/export` returns a JSON attachment containing every ticket, comments, workspace snapshot fields, and embedded chat logs. Use this file for engineering handoff or Cursor debugging sessions.

## Delete

| Action | Method | Path |
| --- | --- | --- |
| Delete one ticket | `DELETE` | `/api/teams/{teamId}/support/tickets/{ticketId}` |
| Delete all tickets | `DELETE` | `/api/teams/{teamId}/support/tickets` |

Deleting a ticket removes its comments and unlinks the stored chat log file when present. `DELETE .../tickets` returns `{ ok: true, deletedCount: N }`.
