---
title: "([a ZA Z0 9 ]+)"
slug: knowledge-model/graph/([a-zA-Z0-9-]+)
section: Knowledge Model
method: GET
path: /api/knowledge-model/graph/([a-zA-Z0-9-]+)
auth: open
order: 640
---

GET `/api/knowledge-model/graph/([a-zA-Z0-9-]+)`.

Reads ([a za z0 9 ]+) from the Knowledge Model API. On success, returns `node`.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| _(none)_ | — | — | No JSON body for GET requests. |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `success` | varies | See handler response. |
| `node` | varies | See handler response. |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 4xx/5xx | varies | See HTTP status and `error` field in body. |

## Example

```bash
curl -X GET "https://neodigital.ca/api/knowledge-model/graph/([a-zA-Z0-9-]+)" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/knowledge-model/graph/([a-zA-Z0-9-]+)`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
