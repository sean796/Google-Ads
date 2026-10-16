---
title: "Match Project For Site"
slug: semrush/match-project-for-site
section: Semrush
method: POST
path: /api/semrush/match-project-for-site
auth: open
order: 1010
---

POST `/api/semrush/match-project-for-site`.

Runs the match project for site action in the Semrush API from a JSON request body.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `siteUrl` | string | no | Request body field |

## Response

| Field | Type | Description |
| --- | --- | --- |
| `success` / `ok` | boolean | Operation status when present |
| `error` | string | Error message on failure |

## Errors

| Status | error | Cause |
| --- | --- | --- |
| 4xx/5xx | varies | See HTTP status and `error` field in body. |

## Example

```bash
curl -X POST "https://neodigital.ca/api/semrush/match-project-for-site" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/semrush/match-project-for-site`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
