---
title: "DataForSEO_business_data_business_listings_search"
slug: mcp/DataForSEO_business_data_business_listings_search
section: DataForSEO MCP
method: POST
path: /api/mcp/DataForSEO_business_data_business_listings_search
auth: open
order: 740
---

POST `/api/mcp/DataForSEO_business_data_business_listings_search`.

Runs the dataforseo_business_data_business_listings_search action in the DataForSEO MCP API from a JSON request body.

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
curl -X POST "https://neodigital.ca/api/mcp/DataForSEO_business_data_business_listings_search" \
  -H "Content-Type: application/json" \
  -d '{}'
```

```javascript
const res = await fetch(`/api/mcp/DataForSEO_business_data_business_listings_search`, {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({}),
});
const data = await res.json();
```
