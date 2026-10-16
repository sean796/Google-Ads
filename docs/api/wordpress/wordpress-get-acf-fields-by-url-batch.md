---
title: "Get Acf Fields By Url Batch"
slug: wordpress/get-acf-fields-by-url-batch
section: WordPress
method: POST
path: /api/wordpress/get-acf-fields-by-url-batch
auth: open
order: 2700
---

POST `/api/wordpress/get-acf-fields-by-url-batch`.

Runs the get acf fields by url batch action in the WordPress API from a JSON request body.

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
curl -X POST "https://neodigital.ca/api/wordpress/get-acf-fields-by-url-batch" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/wordpress/get-acf-fields-by-url-batch`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
