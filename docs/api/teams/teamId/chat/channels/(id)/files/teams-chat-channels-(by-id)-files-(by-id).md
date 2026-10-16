---
title: "GET teams/{teamId}/chat/channels/({id})/files/({id})"
slug: teams/teamId/chat/channels/(id)/files/(id)
section: Teams
method: GET
path: /api/teams/{teamId}/chat/channels/({id})/files/({id})
auth: team-rbac-communication
order: 1400
---

GET `/api/teams/{teamId}/chat/channels/({id})/files/({id})`.

Fetches a single files item from the Teams API. Requires a signed-in team member with communication permissions.

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
curl -X GET "https://neodigital.ca/api/teams/{teamId}/chat/channels/({id})/files/({id})" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/teams/{teamId}/chat/channels/({id})/files/({id})`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
