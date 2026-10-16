---
title: "Reporting Chat Completion"
slug: gsc/reporting-chat-completion
section: Google Search Console
method: POST
path: /api/gsc/reporting-chat-completion
auth: open
order: 490
---

POST `/api/gsc/reporting-chat-completion`.

Runs the reporting chat completion action in the Google Search Console API from a JSON request body.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `system` | string | yes | Request body field |
| `user` | string | yes | Request body field |
| `model` | string | no | Request body field |
| `temperature` | string | no | Request body field |
| `maxTokens` | string | no | Request body field |
| `responseFormat` | string | no | Request body field |

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
curl -X POST "https://neodigital.ca/api/gsc/reporting-chat-completion" \
  -H "Content-Type: application/json" \
  -d '{   "system": "...",   "user": "..." }'
```

```javascript
const res = await fetch(`/api/gsc/reporting-chat-completion`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  "system": "...",
  "user": "..."
}),
});
const data = await res.json();
```
