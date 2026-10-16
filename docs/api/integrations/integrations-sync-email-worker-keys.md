---
title: "Sync Email Worker Keys"
slug: integrations/sync-email-worker-keys
section: Integrations
method: POST
path: /api/integrations/sync-email-worker-keys
auth: open
order: 590
---

POST `/api/integrations/sync-email-worker-keys`.

Runs the sync email worker keys action in the Integrations API from a JSON request body.

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
curl -X POST "https://neodigital.ca/api/integrations/sync-email-worker-keys" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/integrations/sync-email-worker-keys`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
