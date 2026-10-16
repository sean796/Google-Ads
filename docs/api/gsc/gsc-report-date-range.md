---
title: "Report Date Range"
slug: gsc/report-date-range
section: Google Search Console
method: POST
path: /api/gsc/report-date-range
auth: open
order: 480
---

POST `/api/gsc/report-date-range`.

Runs the report date range action in the Google Search Console API from a JSON request body.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `startDate` | string | no | Request body field |
| `endDate` | string | no | Request body field |
| `compareStartDate` | string | no | Request body field |
| `compareEndDate` | string | no | Request body field |

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
curl -X POST "https://neodigital.ca/api/gsc/report-date-range" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/gsc/report-date-range`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
