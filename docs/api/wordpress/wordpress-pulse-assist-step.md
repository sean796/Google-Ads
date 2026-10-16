---
title: "Pulse Assist Step"
slug: wordpress/pulse-assist-step
section: WordPress
method: POST
path: /api/wordpress/pulse-assist-step
auth: open
order: 3060
---

POST `/api/wordpress/pulse-assist-step`.

Runs the pulse assist step action in the WordPress API from a JSON request body.

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
curl -X POST "https://neodigital.ca/api/wordpress/pulse-assist-step" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/wordpress/pulse-assist-step`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
