---
title: "Neo Pulse Wp Tools List"
slug: wordpress/neo-pulse-wp-tools-list
section: WordPress
method: POST
path: /api/wordpress/neo-pulse-wp-tools-list
auth: open
order: 2980
---

POST `/api/wordpress/neo-pulse-wp-tools-list`.

Runs the neo pulse wp tools list action in the WordPress API from a JSON request body.

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
curl -X POST "https://neodigital.ca/api/wordpress/neo-pulse-wp-tools-list" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/wordpress/neo-pulse-wp-tools-list`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
