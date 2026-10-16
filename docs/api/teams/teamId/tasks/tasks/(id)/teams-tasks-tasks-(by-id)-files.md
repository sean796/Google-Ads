---
title: "Files"
slug: teams/teamId/tasks/tasks/(id)/files
section: Teams
method: POST
path: /api/teams/{teamId}/tasks/tasks/({id})/files
auth: session-team
order: 2200
---

POST `/api/teams/{teamId}/tasks/tasks/({id})/files`.

Runs the files action in the Teams API from a JSON request body. Requires a signed-in user who belongs to the team id in the path. On success, returns `file`.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `fileName` | string | yes | Request body field |
| `mime` | string | no | Request body field |
| `dataBase64` | string | yes | Request body field |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `ok` | varies | See handler response. |
| `file` | varies | See handler response. |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 400 | `fileName and dataBase64 required` | Returned when validation or auth fails. |
| 400 | `Invalid base64` | Returned when validation or auth fails. |
| 400 | `Upload failed` | Returned when validation or auth fails. |

## Example

```bash
curl -X POST "https://neodigital.ca/api/teams/{teamId}/tasks/tasks/({id})/files" \
  -H "Content-Type: application/json" \
  -d '{   "fileName": "...",   "dataBase64": "..." }'
```

```javascript
const res = await fetch(`/api/teams/{teamId}/tasks/tasks/({id})/files`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  "fileName": "...",
  "dataBase64": "..."
}),
});
const data = await res.json();
```
