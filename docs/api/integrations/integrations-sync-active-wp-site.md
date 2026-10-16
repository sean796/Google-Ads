---
title: "Sync Active Wp Site"
slug: integrations/sync-active-wp-site
section: Integrations
method: POST
path: /api/integrations/sync-active-wp-site
auth: open
order: 580
---

POST `/api/integrations/sync-active-wp-site`.

Runs the sync active wp site action in the Integrations API from a JSON request body.

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
curl -X POST "https://neodigital.ca/api/integrations/sync-active-wp-site" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/integrations/sync-active-wp-site`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
