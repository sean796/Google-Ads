---
title: "Upload"
slug: manager-wordpress-properties/client-logo/upload
section: Manager WordPress Properties
method: POST
path: /api/manager-wordpress-properties/client-logo/upload
auth: open
order: 710
---

POST `/api/manager-wordpress-properties/client-logo/upload`.

Runs the upload action in the Manager WordPress Properties API from a JSON request body.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| _(optional)_ | object | no | JSON body shape depends on the action. |

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
curl -X POST "https://neodigital.ca/api/manager-wordpress-properties/client-logo/upload" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/manager-wordpress-properties/client-logo/upload`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
