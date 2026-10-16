---
title: "Generate Graph"
slug: knowledge-model/generate-graph
section: Knowledge Model
method: POST
path: /api/knowledge-model/generate-graph
auth: open
order: 630
---

POST `/api/knowledge-model/generate-graph`.

Runs the generate graph action in the Knowledge Model API from a JSON request body. On success, returns `graph`.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| _(optional)_ | object | no | JSON body shape depends on the action. |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `success` | varies | See handler response. |
| `graph` | varies | See handler response. |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 4xx/5xx | varies | See HTTP status and `error` field in body. |

## Example

```bash
curl -X POST "https://neodigital.ca/api/knowledge-model/generate-graph" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/knowledge-model/generate-graph`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
