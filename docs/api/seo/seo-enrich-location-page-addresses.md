---
title: "Enrich Location Page Addresses"
slug: seo/enrich-location-page-addresses
section: SEO
method: POST
path: /api/seo/enrich-location-page-addresses
auth: open
order: 1060
---

POST `/api/seo/enrich-location-page-addresses`.

Runs the enrich location page addresses action in the SEO API from a JSON request body. On success, returns `results`.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `siteUrl` | string | no | Request body field |
| `pages` | string | no | Request body field |
| `model` | string | no | Request body field |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `error` | varies | See handler response. |
| `results` | varies | See handler response. |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 4xx/5xx | varies | See HTTP status and `error` field in body. |

## Example

```bash
curl -X POST "https://neodigital.ca/api/seo/enrich-location-page-addresses" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/seo/enrich-location-page-addresses`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
