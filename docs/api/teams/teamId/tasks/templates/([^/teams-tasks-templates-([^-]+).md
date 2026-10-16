---
title: "]+)"
slug: teams/teamId/tasks/templates/([^/]+)
section: Teams
method: DELETE
path: /api/teams/{teamId}/tasks/templates/([^/]+)
auth: session-team
order: 2370
---

DELETE `/api/teams/{teamId}/tasks/templates/([^/]+)`.

Removes ]+) through the Teams API. Requires a signed-in user who belongs to the team id in the path.

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
curl -X DELETE "https://neodigital.ca/api/teams/{teamId}/tasks/templates/([^/]+)" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/teams/{teamId}/tasks/templates/([^/]+)`, {
  method: "DELETE",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
