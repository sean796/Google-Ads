---
title: "Test Connection"
slug: gsc/test-connection
section: Google Search Console
method: GET
path: /api/gsc/test-connection
auth: open
order: 520
---

GET `/api/gsc/test-connection`.

Reads test connection from the Google Search Console API.

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
curl -X GET "https://neodigital.ca/api/gsc/test-connection" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/gsc/test-connection`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
