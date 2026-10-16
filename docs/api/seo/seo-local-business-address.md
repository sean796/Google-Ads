---
title: "Local Business Address"
slug: seo/local-business-address
section: SEO
method: POST
path: /api/seo/local-business-address
auth: open
order: 1080
---

POST `/api/seo/local-business-address`.

Runs the local business address action in the SEO API from a JSON request body. On success, returns `label`, `source`, `message`, `lat`, and related fields.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `url` | string | yes | Request body field |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `error` | varies | See handler response. |
| `label` | varies | See handler response. |
| `source` | varies | See handler response. |
| `message` | varies | See handler response. |
| `lat` | varies | See handler response. |
| `lng` | varies | See handler response. |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 4xx/5xx | varies | See HTTP status and `error` field in body. |

## Example

```bash
curl -X POST "https://neodigital.ca/api/seo/local-business-address" \
  -H "Content-Type: application/json" \
  -d '{   "url": "..." }'
```

```javascript
const res = await fetch(`/api/seo/local-business-address`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  "url": "..."
}),
});
const data = await res.json();
```
