---
title: "Expand Node"
slug: knowledge-model/expand-node
section: Knowledge Model
method: POST
path: /api/knowledge-model/expand-node
auth: open
order: 620
---

POST `/api/knowledge-model/expand-node`.

Runs the expand node action in the Knowledge Model API from a JSON request body. On success, returns `node`.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `keyword` | string | yes | Request body field |
| `gscData` | string | no | Request body field |

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
curl -X POST "https://neodigital.ca/api/knowledge-model/expand-node" \
  -H "Content-Type: application/json" \
  -d '{   "keyword": "..." }'
```

```javascript
const res = await fetch(`/api/knowledge-model/expand-node`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  "keyword": "..."
}),
});
const data = await res.json();
```
