---
title: "Thread"
slug: teams/teamId/chat/channels/(id)/messages/(id)/thread
section: Teams
method: GET
path: /api/teams/{teamId}/chat/channels/({id})/messages/({id})/thread
auth: team-rbac-communication
order: 1460
---

GET `/api/teams/{teamId}/chat/channels/({id})/messages/({id})/thread`.

Reads thread from the Teams API. Requires a signed-in team member with communication permissions.

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
curl -X GET "https://neodigital.ca/api/teams/{teamId}/chat/channels/({id})/messages/({id})/thread" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/teams/{teamId}/chat/channels/({id})/messages/({id})/thread`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
