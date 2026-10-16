---
title: "Discover Locations"
slug: seo/discover-locations
section: SEO
method: POST
path: /api/seo/discover-locations
auth: open
order: 1050
---

POST `/api/seo/discover-locations`.

Runs the discover locations action in the SEO API from a JSON request body. On success, returns `addresses`, `pagePaths`, `pagesFetched`, `primarySuggestion`, and related fields.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `siteUrl` | string | yes | Request body field |
| `entitySitemapUrl` | string | no | Request body field |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `error` | varies | See handler response. |
| `addresses` | varies | See handler response. |
| `pagePaths` | varies | See handler response. |
| `pagesFetched` | varies | See handler response. |
| `primarySuggestion` | varies | See handler response. |
| `areaLabels` | varies | See handler response. |
| `primaryAreaLabel` | varies | See handler response. |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 4xx/5xx | varies | See HTTP status and `error` field in body. |

## Example

```bash
curl -X POST "https://neodigital.ca/api/seo/discover-locations" \
  -H "Content-Type: application/json" \
  -d '{   "siteUrl": "..." }'
```

```javascript
const res = await fetch(`/api/seo/discover-locations`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  "siteUrl": "..."
}),
});
const data = await res.json();
```
