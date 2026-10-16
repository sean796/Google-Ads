---
title: "Notes"
slug: teams/teamId/tasks/tasks/(id)/notes
section: Teams
method: POST
path: /api/teams/{teamId}/tasks/tasks/({id})/notes
auth: session-team
order: 2280
---

POST `/api/teams/{teamId}/tasks/tasks/({id})/notes`.

Runs the notes action in the Teams API from a JSON request body. Requires a signed-in user who belongs to the team id in the path.

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
curl -X POST "https://neodigital.ca/api/teams/{teamId}/tasks/tasks/({id})/notes" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/teams/{teamId}/tasks/tasks/({id})/notes`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
