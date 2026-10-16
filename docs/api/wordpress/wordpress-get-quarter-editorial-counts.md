---
title: "Get Quarter Editorial Counts"
slug: wordpress/get-quarter-editorial-counts
section: WordPress
method: POST
path: /api/wordpress/get-quarter-editorial-counts
auth: open
order: 2860
---

POST `/api/wordpress/get-quarter-editorial-counts`.

Runs the get quarter editorial counts action in the WordPress API from a JSON request body.

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
curl -X POST "https://neodigital.ca/api/wordpress/get-quarter-editorial-counts" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/wordpress/get-quarter-editorial-counts`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
