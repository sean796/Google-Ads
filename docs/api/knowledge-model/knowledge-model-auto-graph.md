---
title: "Auto Graph"
slug: knowledge-model/auto-graph
section: Knowledge Model
method: POST
path: /api/knowledge-model/auto-graph
auth: open
order: 610
---

POST `/api/knowledge-model/auto-graph`.

Runs the auto graph action in the Knowledge Model API from a JSON request body. On success, returns `jobId`, `message`.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `siteId` | string | no | Request body field |
| `siteUrl` | string | no | Request body field |
| `username` | string | no | Request body field |
| `appPassword` | string | no | Request body field |
| `jobId` | string | no | Request body field |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `success` | varies | See handler response. |
| `jobId` | varies | See handler response. |
| `message` | varies | See handler response. |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 4xx/5xx | varies | See HTTP status and `error` field in body. |

## Example

```bash
curl -X POST "https://neodigital.ca/api/knowledge-model/auto-graph" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/knowledge-model/auto-graph`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
