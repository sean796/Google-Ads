---
title: "Status"
slug: manager-cloud-settings/status
section: Manager Cloud Settings
method: GET
path: /api/manager-cloud-settings/status
auth: open
order: 680
---

GET `/api/manager-cloud-settings/status`.

Merge one API key into workspace manager settings (server-side Semrush, DataForSEO, etc.).

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
curl -X GET "https://neodigital.ca/api/manager-cloud-settings/status" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/manager-cloud-settings/status`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
