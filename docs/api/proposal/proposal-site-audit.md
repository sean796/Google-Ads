---
title: "Site Audit"
slug: proposal/site-audit
section: Proposal
method: POST
path: /api/proposal/site-audit
auth: open
order: 950
---

POST `/api/proposal/site-audit`.

Runs the site audit action in the Proposal API from a JSON request body.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `urls` | string | no | Request body field |

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
curl -X POST "https://neodigital.ca/api/proposal/site-audit" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/proposal/site-audit`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
