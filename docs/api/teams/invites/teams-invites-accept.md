---
title: "Accept"
slug: teams/invites/accept
section: Teams
method: GET
path: /api/teams/invites/accept
auth: public
order: 2440
---

GET `/api/teams/invites/accept`.

Reads accept from the Teams API. No existing session is required.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| _(none)_ | — | — | No JSON body for GET requests. |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `success` / `ok` | boolean | Operation status when present |
| `error` | string | Error message on failure |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 4xx/5xx | varies | See HTTP status and `error` field in body. |

## Example

```bash
curl -X GET "https://neodigital.ca/api/teams/invites/accept" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/teams/invites/accept`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
