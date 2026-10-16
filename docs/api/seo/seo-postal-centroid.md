---
title: "Postal Centroid"
slug: seo/postal-centroid
section: SEO
method: POST
path: /api/seo/postal-centroid
auth: open
order: 1090
---

POST `/api/seo/postal-centroid`.

Runs the postal centroid action in the SEO API from a JSON request body. On success, returns `lat`, `lng`, `placeName`, `source`, and related fields.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `postalCode` | string | no | Request body field |
| `city` | string | yes | Request body field |
| `region` | string | no | Request body field |
| `countryCode` | string | no | Request body field |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `error` | varies | See handler response. |
| `lat` | varies | See handler response. |
| `lng` | varies | See handler response. |
| `placeName` | varies | See handler response. |
| `source` | varies | See handler response. |
| `message` | varies | See handler response. |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 4xx/5xx | varies | See HTTP status and `error` field in body. |

## Example

```bash
curl -X POST "https://neodigital.ca/api/seo/postal-centroid" \
  -H "Content-Type: application/json" \
  -d '{   "city": "..." }'
```

```javascript
const res = await fetch(`/api/seo/postal-centroid`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  "city": "..."
}),
});
const data = await res.json();
```
