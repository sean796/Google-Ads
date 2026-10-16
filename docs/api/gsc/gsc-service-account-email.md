---
title: "Service Account Email"
slug: gsc/service-account-email
section: Google Search Console
method: GET
path: /api/gsc/service-account-email
auth: open
order: 510
---

GET `/api/gsc/service-account-email`.

Reads service account email from the Google Search Console API.

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
curl -X GET "https://neodigital.ca/api/gsc/service-account-email" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/gsc/service-account-email`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
