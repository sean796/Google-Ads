---
title: "Export Gsc Csv"
slug: vertical-benchmarks/export-gsc-csv
section: Vertical Benchmarks
method: POST
path: /api/vertical-benchmarks/export-gsc-csv
auth: open
order: 2460
---

POST `/api/vertical-benchmarks/export-gsc-csv`.

Builds a Google Search Console CSV export for vertical benchmark reporting across selected sites.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `apiKey` | string | yes | Request body field |
| `sites` | string | no | Request body field |
| `siteIds` | string | no | Request body field |
| `model` | string | no | Request body field |
| `contentKinds` | string | no | Request body field |
| `clientTagBySiteId` | string | no | Request body field |
| `clientTagLabelBySiteId` | string | no | Request body field |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `success` / `ok` | boolean | Operation status when present |
| `error` | string | Error message on failure |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 400 | `OpenRouter API key required for Gemini URL labeling` | Returned when validation or auth fails. |
| 400 | `No sites selected for export` | Returned when validation or auth fails. |

## Example

```bash
curl -X POST "https://neodigital.ca/api/vertical-benchmarks/export-gsc-csv" \
  -H "Content-Type: application/json" \
  -d '{   "apiKey": "..." }'
```

```javascript
const res = await fetch(`/api/vertical-benchmarks/export-gsc-csv`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  "apiKey": "..."
}),
});
const data = await res.json();
```
