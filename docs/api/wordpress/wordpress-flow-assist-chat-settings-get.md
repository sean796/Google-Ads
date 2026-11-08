---
title: "Flow Assist Chat Settings Get"
slug: wordpress/flow-assist-chat-settings-get
section: WordPress
method: POST
path: /api/wordpress/flow-assist-chat-settings-get
auth: open
order: 2670
---

POST `/api/wordpress/flow-assist-chat-settings-get`.

Runs the flow assist chat settings get action in the WordPress API from a JSON request body.

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
curl -X POST "https://neodigital.ca/api/wordpress/flow-assist-chat-settings-get" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/wordpress/flow-assist-chat-settings-get`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
