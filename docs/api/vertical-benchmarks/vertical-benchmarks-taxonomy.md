---
title: "Taxonomy"
slug: vertical-benchmarks/taxonomy
section: Vertical Benchmarks
method: GET
path: /api/vertical-benchmarks/taxonomy
auth: open
order: 2470
---

GET `/api/vertical-benchmarks/taxonomy`.

Classifies managed WordPress sites into vertical benchmark client tags using taxonomy rules and optional Gemini labeling via OpenRouter. On success, returns `clients`.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| _(none)_ | — | — | No JSON body for GET requests. |

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
curl -X GET "https://neodigital.ca/api/vertical-benchmarks/taxonomy" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/vertical-benchmarks/taxonomy`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
