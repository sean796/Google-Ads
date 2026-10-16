---
title: "Load"
slug: manager-wordpress-properties/load
section: Manager WordPress Properties
method: GET
path: /api/manager-wordpress-properties/load
auth: open
order: 690
---

GET `/api/manager-wordpress-properties/load`.

Reads load from the Manager WordPress Properties API.

## Request

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| _(none)_ | — | — | No JSON body for GET requests. |

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
curl -X GET "https://neodigital.ca/api/manager-wordpress-properties/load" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/manager-wordpress-properties/load`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
