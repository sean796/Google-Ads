---
title: "Sync Semrush"
slug: manager-wordpress-properties/sync-semrush
section: Manager WordPress Properties
method: POST
path: /api/manager-wordpress-properties/sync-semrush
auth: open
order: 730
---

POST `/api/manager-wordpress-properties/sync-semrush`.

Merge one API key into workspace manager settings (server-side Semrush, DataForSEO, etc.).

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
curl -X POST "https://neodigital.ca/api/manager-wordpress-properties/sync-semrush" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/manager-wordpress-properties/sync-semrush`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
