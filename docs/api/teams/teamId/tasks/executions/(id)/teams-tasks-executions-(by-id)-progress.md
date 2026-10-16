---
title: "Progress"
slug: teams/teamId/tasks/executions/(id)/progress
section: Teams
method: PATCH
path: /api/teams/{teamId}/tasks/executions/({id})/progress
auth: session-team
order: 1880
---

PATCH `/api/teams/{teamId}/tasks/executions/({id})/progress`.

Updates progress through the Teams API. Requires a signed-in user who belongs to the team id in the path.

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
curl -X PATCH "https://neodigital.ca/api/teams/{teamId}/tasks/executions/({id})/progress" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/teams/{teamId}/tasks/executions/({id})/progress`, {
  method: "PATCH",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
