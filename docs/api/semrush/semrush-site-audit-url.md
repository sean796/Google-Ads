---
title: "Site Audit Url"
slug: semrush/site-audit-url
section: Semrush
method: POST
path: /api/semrush/site-audit-url
auth: open
order: 1040
---

POST `/api/semrush/site-audit-url`.

Runs the site audit url action in the Semrush API from a JSON request body.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `pageUrl` | string | no | Request body field |
| `projectId` | string | no | Request body field |

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
curl -X POST "https://neodigital.ca/api/semrush/site-audit-url" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/semrush/site-audit-url`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
