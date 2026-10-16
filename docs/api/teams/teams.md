---
title: "PATCH teams/{teamId}"
slug: teams/teamId
section: Teams
method: PATCH
path: /api/teams/{teamId}
auth: session-team
order: 1160
---

PATCH `/api/teams/{teamId}`.

Updates teams item through the Teams API. Requires a signed-in user who belongs to the team id in the path.

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
curl -X PATCH "https://neodigital.ca/api/teams/{teamId}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/teams/{teamId}`, {
  method: "PATCH",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
