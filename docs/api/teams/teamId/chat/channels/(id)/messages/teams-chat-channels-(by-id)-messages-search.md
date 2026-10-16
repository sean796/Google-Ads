---
title: "Search"
slug: teams/teamId/chat/channels/(id)/messages/search
section: Teams
method: GET
path: /api/teams/{teamId}/chat/channels/({id})/messages/search
auth: team-rbac-communication
order: 1470
---

GET `/api/teams/{teamId}/chat/channels/({id})/messages/search`.

Reads search from the Teams API. Requires a signed-in team member with communication permissions.

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
curl -X GET "https://neodigital.ca/api/teams/{teamId}/chat/channels/({id})/messages/search" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/teams/{teamId}/chat/channels/({id})/messages/search`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
