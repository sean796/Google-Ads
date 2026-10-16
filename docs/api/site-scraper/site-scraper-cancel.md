---
title: "Cancel"
slug: site-scraper/cancel
section: Site Scraper
method: POST
path: /api/site-scraper/cancel
auth: open
order: 1100
---

POST `/api/site-scraper/cancel`.

Runs the cancel action in the Site Scraper API from a JSON request body. On success, returns `cancelled`, `message`.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| _(optional)_ | object | no | JSON body shape depends on the action. |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `cancelled` | varies | See handler response. |
| `message` | varies | See handler response. |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 4xx/5xx | varies | See HTTP status and `error` field in body. |

## Example

```bash
curl -X POST "https://neodigital.ca/api/site-scraper/cancel" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/site-scraper/cancel`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
