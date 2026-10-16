---
title: "Resolved Openrouter Key"
slug: integrations/resolved-openrouter-key
section: Integrations
method: GET
path: /api/integrations/resolved-openrouter-key
auth: open
order: 570
---

GET `/api/integrations/resolved-openrouter-key`.

Reads resolved openrouter key from the Integrations API.

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
curl -X GET "https://neodigital.ca/api/integrations/resolved-openrouter-key" \
  -H "Content-Type: application/json" \
```

```javascript
const res = await fetch(`/api/integrations/resolved-openrouter-key`, {
  method: "GET",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
});
const data = await res.json();
```
