---
title: "Sync Openrouter"
slug: manager-wordpress-properties/sync-openrouter
section: Manager WordPress Properties
method: POST
path: /api/manager-wordpress-properties/sync-openrouter
auth: open
order: 720
---

POST `/api/manager-wordpress-properties/sync-openrouter`.

Runs the sync openrouter action in the Manager WordPress Properties API from a JSON request body.

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
curl -X POST "https://neodigital.ca/api/manager-wordpress-properties/sync-openrouter" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/manager-wordpress-properties/sync-openrouter`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
