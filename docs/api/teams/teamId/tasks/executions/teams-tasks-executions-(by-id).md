---
title: "GET teams/{teamId}/tasks/executions/({id})"
slug: teams/teamId/tasks/executions/(id)
section: Teams
method: GET
path: /api/teams/{teamId}/tasks/executions/({id})
auth: session-team
order: 1850
---

GET `/api/teams/{teamId}/tasks/executions/({id})`.

Fetches a single executions item from the Teams API. Requires a signed-in user who belongs to the team id in the path.

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
curl -X GET "https://neodigital.ca/api/teams/{teamId}/tasks/executions/({id})" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/teams/{teamId}/tasks/executions/({id})`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
