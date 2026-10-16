---
title: "Read"
slug: teams/teamId/chat/channels/(id)/read
section: Teams
method: POST
path: /api/teams/{teamId}/chat/channels/({id})/read
auth: team-rbac-communication
order: 1480
---

POST `/api/teams/{teamId}/chat/channels/({id})/read`.

Runs the read action in the Teams API from a JSON request body. Requires a signed-in team member with communication permissions.

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
curl -X POST "https://neodigital.ca/api/teams/{teamId}/chat/channels/({id})/read" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/teams/{teamId}/chat/channels/({id})/read`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
