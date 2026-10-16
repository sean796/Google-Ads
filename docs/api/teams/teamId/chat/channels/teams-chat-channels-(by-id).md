---
title: "PATCH teams/{teamId}/chat/channels/({id})"
slug: teams/teamId/chat/channels/(id)
section: Teams
method: PATCH
path: /api/teams/{teamId}/chat/channels/({id})
auth: team-rbac-communication
order: 1360
---

PATCH `/api/teams/{teamId}/chat/channels/({id})`.

Updates channels item through the Teams API. Requires a signed-in team member with communication permissions.

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
curl -X PATCH "https://neodigital.ca/api/teams/{teamId}/chat/channels/({id})" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/teams/{teamId}/chat/channels/({id})`, {
  method: "PATCH",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
