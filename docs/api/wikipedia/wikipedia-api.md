---
title: "Api"
slug: wikipedia/api
section: Wikipedia
method: GET
path: /api/wikipedia/api
auth: open
order: 2480
---

GET `/api/wikipedia/api`.

Reads api from the Wikipedia API.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| _(none)_ | — | — | No JSON body for GET requests. |

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
curl -X GET "https://neodigital.ca/api/wikipedia/api" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/wikipedia/api`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
