---
title: "Load"
slug: manager-cloud-settings/load
section: Manager Cloud Settings
method: GET
path: /api/manager-cloud-settings/load
auth: open
order: 660
---

GET `/api/manager-cloud-settings/load`.

Reads load from the Manager Cloud Settings API.

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
curl -X GET "https://neodigital.ca/api/manager-cloud-settings/load" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/manager-cloud-settings/load`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
