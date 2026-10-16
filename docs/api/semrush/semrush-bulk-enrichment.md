---
title: "Bulk Enrichment"
slug: semrush/bulk-enrichment
section: Semrush
method: POST
path: /api/semrush/bulk-enrichment
auth: open
order: 980
---

POST `/api/semrush/bulk-enrichment`.

Runs a bulk semrush operation from a JSON request body.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `pageUrl` | string | no | Request body field |
| `seedKeyword` | string | no | Request body field |
| `database` | string | no | Request body field |
| `portfolioBlockedHosts` | string | no | Request body field |

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
curl -X POST "https://neodigital.ca/api/semrush/bulk-enrichment" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/semrush/bulk-enrichment`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
