---
title: "Preferences"
slug: teams/teamId/chat/preferences
section: Teams
method: PATCH
path: /api/teams/{teamId}/chat/preferences
auth: team-rbac-communication
order: 1600
---

PATCH `/api/teams/{teamId}/chat/preferences`.

Updates preferences through the Teams API. Requires a signed-in team member with communication permissions.

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
curl -X PATCH "https://neodigital.ca/api/teams/{teamId}/chat/preferences" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/teams/{teamId}/chat/preferences`, {
  method: "PATCH",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
