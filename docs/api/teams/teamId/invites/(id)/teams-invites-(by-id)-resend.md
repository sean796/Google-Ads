---
title: "Resend"
slug: teams/teamId/invites/(id)/resend
section: Teams
method: POST
path: /api/teams/{teamId}/invites/({id})/resend
auth: session-team
order: 1670
---

POST `/api/teams/{teamId}/invites/({id})/resend`.

Runs the resend action in the Teams API from a JSON request body. Requires a signed-in user who belongs to the team id in the path.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| _(optional)_ | object | no | JSON body shape depends on the action. |

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
curl -X POST "https://neodigital.ca/api/teams/{teamId}/invites/({id})/resend" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/teams/{teamId}/invites/({id})/resend`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
