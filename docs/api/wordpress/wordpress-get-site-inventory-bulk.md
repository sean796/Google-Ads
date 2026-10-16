---
title: "Get Site Inventory Bulk"
slug: wordpress/get-site-inventory-bulk
section: WordPress
method: POST
path: /api/wordpress/get-site-inventory-bulk
auth: open
order: 2900
---

POST `/api/wordpress/get-site-inventory-bulk`.

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
curl -X POST "https://neodigital.ca/api/wordpress/get-site-inventory-bulk" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/wordpress/get-site-inventory-bulk`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
