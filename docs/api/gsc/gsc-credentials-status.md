---
title: "Credentials Status"
slug: gsc/credentials-status
section: Google Search Console
method: GET
path: /api/gsc/credentials-status
auth: open
order: 340
---

GET `/api/gsc/credentials-status`.

Reads credentials status from the Google Search Console API.

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
curl -X GET "https://neodigital.ca/api/gsc/credentials-status" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/gsc/credentials-status`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
