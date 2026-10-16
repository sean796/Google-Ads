---
title: "Bulk Update Overview Seo"
slug: wordpress/bulk-update-overview-seo
section: WordPress
method: POST
path: /api/wordpress/bulk-update-overview-seo
auth: open
order: 2500
---

POST `/api/wordpress/bulk-update-overview-seo`.

Runs a bulk wordpress operation from a JSON request body.

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
curl -X POST "https://neodigital.ca/api/wordpress/bulk-update-overview-seo" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/wordpress/bulk-update-overview-seo`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
