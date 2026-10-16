---
title: "Fetch External Sitemap"
slug: seo/fetch-external-sitemap
section: SEO
method: POST
path: /api/seo/fetch-external-sitemap
auth: open
order: 1070
---

POST `/api/seo/fetch-external-sitemap`.

Fetches fetch external sitemap from the SEO API. On success, returns `urls`, `sitemapUrl`, `origin`.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | string | yes | Request body field |
| `domain` | string | no | Request body field |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `error` | varies | See handler response. |
| `urls` | varies | See handler response. |
| `sitemapUrl` | varies | See handler response. |
| `origin` | varies | See handler response. |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 4xx/5xx | varies | See HTTP status and `error` field in body. |

## Example

```bash
curl -X POST "https://neodigital.ca/api/seo/fetch-external-sitemap" \
  -H "Content-Type: application/json" \
  -d '{   "url": "..." }'
```

```javascript
const res = await fetch(`/api/seo/fetch-external-sitemap`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  "url": "..."
}),
});
const data = await res.json();
```
