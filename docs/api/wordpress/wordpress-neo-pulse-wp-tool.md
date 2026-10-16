---
title: "Neo Pulse Wp Tool"
slug: wordpress/neo-pulse-wp-tool
section: WordPress
method: POST
path: /api/wordpress/neo-pulse-wp-tool
auth: open
order: 2960
---

POST `/api/wordpress/neo-pulse-wp-tool`.

Runs the neo pulse wp tool action in the WordPress API from a JSON request body.

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
curl -X POST "https://neodigital.ca/api/wordpress/neo-pulse-wp-tool" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/wordpress/neo-pulse-wp-tool`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
