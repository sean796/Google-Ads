---
title: "GET overview/seo-brief/{filename}"
slug: overview/seo-brief/filename
section: Overview
method: GET
path: /api/overview/seo-brief/{filename}
auth: open
order: 940
---

GET `/api/overview/seo-brief/{filename}`.

Fetches a single seo brief item from the Overview API.

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
curl -X GET "https://neodigital.ca/api/overview/seo-brief/{filename}" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/overview/seo-brief/{filename}`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
