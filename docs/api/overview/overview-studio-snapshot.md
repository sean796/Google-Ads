---
title: "Studio Snapshot"
slug: overview/studio-snapshot
section: Overview
method: POST
path: /api/overview/studio-snapshot
auth: open
order: 970
---

POST `/api/overview/studio-snapshot`.

Runs the studio snapshot action in the Overview API from a JSON request body.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `siteId` | string | yes | Request body field |
| `source` | string | no | Request body field |
| `rows` | string | no | Request body field |
| `activeUrl` | string | no | Request body field |

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
curl -X POST "https://neodigital.ca/api/overview/studio-snapshot" \
  -H "Content-Type: application/json" \
  -d '{   "siteId": "..." }'
```

```javascript
const res = await fetch(`/api/overview/studio-snapshot`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
  "siteId": "..."
}),
});
const data = await res.json();
```
