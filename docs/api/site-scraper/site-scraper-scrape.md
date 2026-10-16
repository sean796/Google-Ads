---
title: "Scrape"
slug: site-scraper/scrape
section: Site Scraper
method: POST
path: /api/site-scraper/scrape
auth: open
order: 1110
---

POST `/api/site-scraper/scrape`.

Runs the scrape action in the Site Scraper API from a JSON request body.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | string | yes | Request body field |
| `maxPages` | string | no | Request body field |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `error` | varies | See handler response. |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 4xx/5xx | varies | See HTTP status and `error` field in body. |

## Example

```bash
curl -X POST "https://neodigital.ca/api/site-scraper/scrape" \
  -H "Content-Type: application/json" \
  -d '{   "url": "..." }'
```

```javascript
const res = await fetch(`/api/site-scraper/scrape`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  "url": "..."
}),
});
const data = await res.json();
```
