---
title: "([a ZA Z0 9 ]+)"
slug: knowledge-model/progress/([a-zA-Z0-9-]+)
section: Knowledge Model
method: GET
path: /api/knowledge-model/progress/([a-zA-Z0-9-]+)
auth: open
order: 650
---

GET `/api/knowledge-model/progress/([a-zA-Z0-9-]+)`.

Reads ([a za z0 9 ]+) from the Knowledge Model API. On success, returns `progress`.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| _(none)_ | — | — | No JSON body for GET requests. |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `success` | varies | See handler response. |
| `progress` | varies | See handler response. |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 4xx/5xx | varies | See HTTP status and `error` field in body. |

## Example

```bash
curl -X GET "https://neodigital.ca/api/knowledge-model/progress/([a-zA-Z0-9-]+)" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/knowledge-model/progress/([a-zA-Z0-9-]+)`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
