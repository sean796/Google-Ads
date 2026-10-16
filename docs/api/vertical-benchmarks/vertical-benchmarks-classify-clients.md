---
title: "Classify Clients"
slug: vertical-benchmarks/classify-clients
section: Vertical Benchmarks
method: POST
path: /api/vertical-benchmarks/classify-clients
auth: open
order: 2450
---

POST `/api/vertical-benchmarks/classify-clients`.

Classifies managed WordPress sites into vertical benchmark client tags using taxonomy rules and optional Gemini labeling via OpenRouter. On success, returns `clients`.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `apiKey` | string | yes | Request body field |
| `sites` | string | no | Request body field |
| `siteIds` | string | no | Request body field |
| `model` | string | no | Request body field |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `ok` | varies | See handler response. |
| `clients` | varies | See handler response. |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 400 | `OpenRouter API key required for Gemini client tags` | Returned when validation or auth fails. |
| 400 | `No sites to classify` | Returned when validation or auth fails. |

## Example

```bash
curl -X POST "https://neodigital.ca/api/vertical-benchmarks/classify-clients" \
  -H "Content-Type: application/json" \
  -d '{   "apiKey": "..." }'
```

```javascript
const res = await fetch(`/api/vertical-benchmarks/classify-clients`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  "apiKey": "..."
}),
});
const data = await res.json();
```
