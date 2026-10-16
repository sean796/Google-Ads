---
title: "Competitor Research"
slug: semrush/competitor-research
section: Semrush
method: POST
path: /api/semrush/competitor-research
auth: open
order: 990
---

POST `/api/semrush/competitor-research`.

Runs the competitor research action in the Semrush API from a JSON request body.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `siteUrl` | string | no | Request body field |
| `database` | string | no | Request body field |
| `displayLimit` | string | no | Request body field |
| `portfolioBlockedHosts` | string | no | Request body field |
| `enrichmentLimit` | string | no | Request body field |

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
curl -X POST "https://neodigital.ca/api/semrush/competitor-research" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/semrush/competitor-research`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
