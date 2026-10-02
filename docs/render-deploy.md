# Render deploy runbook

Flowbie One uses **Render** for the React UI (static site) and the **Local Dominator Puppeteer worker** (Docker web service). WordPress + `neo-pulse-app` stay on **WP Engine** at `https://neodigital.ca`.

## Architecture

| Layer | Host | URL |
|-------|------|-----|
| React UI (demo) | Render static | `https://flowbie-demo-static.onrender.com` |
| React UI (prod) | Render static | `https://app.neodigital.ca` |
| WP API | WP Engine | `https://neodigital.ca/api/mcp` |
| LD worker (demo) | Render Docker | `https://flowbie-demo-worker.onrender.com` |
| LD worker (prod) | Render Docker | `https://ld.neodigital.ca` |
| Ollama (demo) | Render Docker | `https://flowbie-demo-ollama.onrender.com` |
| Ollama (prod) | Render Docker | `https://flowbie-prod-ollama.onrender.com` |

## Production branch note

Prod services in [`render.yaml`](../render.yaml) target `main`. Until Render infra is merged to `main`, `scripts/render-provision.mjs` temporarily points prod services at `cursor/meta-ads-visual-settings-layout` (same commit as demo).

## DNS (production)

Custom domains are registered on Render:

| Host | Render service |
|------|----------------|
| `app.neodigital.ca` | `flowbie-prod-static` |
| `ld.neodigital.ca` | `flowbie-prod-worker` |

In your DNS provider, add CNAME records (targets shown in Render Dashboard → each service → **Custom Domains**):

| Host | Type | Target (until dashboard shows a custom target) |
|------|------|------------------------------------------------|
| `app` | CNAME | `flowbie-prod-static.onrender.com` |
| `ld` | CNAME | `flowbie-prod-worker.onrender.com` |

Verify HTTPS after DNS propagates (`verificationStatus` → verified in Render API).

## WP Engine worker constants

Add to `neo-pulse-app-secrets.php` on WP Engine (use the token printed once by `node scripts/render-provision.mjs`):

```php
define( 'NEO_PULSE_APP_LOCAL_DOMINATOR_WORKER_URL', 'https://ld.neodigital.ca' );
define( 'NEO_PULSE_APP_LOCAL_DOMINATOR_WORKER_AUTH', '<LD_WORKER_AUTH_TOKEN>' );
```

Until DNS is live, use `https://flowbie-prod-worker.onrender.com` as the worker URL.

## Live URLs (Neo Digital team Render)

| Service | URL |
|---------|-----|
| Demo static | https://flowbie-demo-static.onrender.com |
| Demo worker | https://flowbie-demo-worker.onrender.com |
| Prod static | https://flowbie-prod-static.onrender.com |
| Prod worker | https://flowbie-prod-worker.onrender.com |
| Prod static (DNS) | https://app.neodigital.ca |
| Prod worker (DNS) | https://ld.neodigital.ca |

## Cursor Render MCP

User-level config: `~/.cursor/mcp.json` (see [`.cursor/mcp.json.example`](../.cursor/mcp.json.example)).

After adding the server, reload Cursor MCP and run:

1. `list_workspaces`
2. Set workspace: `Set my Render workspace to <name>`
3. `list_services`

## Repo scripts

| Command | Purpose |
|---------|---------|
| `npm run build:render-static` | Production Vite build for Render (`RENDER_PROFILE=demo\|prod`) |
| `npm run start:ld-worker` | Standalone Local Dominator job API (port `PORT` or `10000`) |

Build env (set in Render static service):

- `RENDER_PROFILE` — `demo` or `prod`
- `VITE_MCP_API_BASE` — `https://neodigital.ca/api/mcp`
- `VITE_BASE_PATH` — `/`
- `VITE_OPENROUTER_API_KEY` — build-time secret (sync: false in Render)

Worker env (set in Render Docker service):

- `LOCAL_DOMINATOR_EMAIL` / `LOCAL_DOMINATOR_PASSWORD`
- `LD_WORKER_AUTH_TOKEN` — shared secret; must match WP Engine
- `PORT` — set automatically by Render

Ollama env (Render Docker `flowbie-*-ollama`):

- `OLLAMA_MODELS` — comma-separated pulls on start (e.g. `qwen3:8b`)
- `OLLAMA_AUTH_TOKEN` — bearer token for the auth proxy; must match WP `NEO_PULSE_APP_OLLAMA_AUTH`
- Persistent disk mounted at `/root/.ollama` (model cache)

## WP Engine (neo-pulse-app)

After prod worker is live, set in `neo-pulse-app-secrets.php` or environment:

```php
define( 'NEO_PULSE_APP_LOCAL_DOMINATOR_WORKER_URL', 'https://ld.neodigital.ca' );
define( 'NEO_PULSE_APP_LOCAL_DOMINATOR_WORKER_AUTH', '<same as LD_WORKER_AUTH_TOKEN>' );
```

Redeploy plugin:

```powershell
npm run deploy:neodigital-app
```

CORS: API responses allow `*.onrender.com` and `*.neodigital.ca` origins automatically.

## WP Engine (Ollama for local agent models)

Add to `neo-pulse-app-secrets.php` on WP Engine (use URLs from Render after deploy):

```php
define( 'NEO_PULSE_APP_OLLAMA_BASE_URL', 'https://flowbie-prod-ollama.onrender.com' );
define( 'NEO_PULSE_APP_OLLAMA_AUTH', '<OLLAMA_AUTH_TOKEN>' );
```

Local dev (`neo-pulse-app-secrets.php` beside local WP):

```php
define( 'NEO_PULSE_APP_OLLAMA_BASE_URL', 'http://host.docker.internal:11434' );
define( 'NEO_PULSE_APP_OLLAMA_AUTH', '' );
```

Run Ollama on the host and `ollama pull qwen3:8b`. Agent models from Ollama appear in Dashboard with a **Local** tag; type `local` in the model filter to list them only.

Smoke on host:

```powershell
node scripts/verify-ollama-chat.mjs
```

## Blueprint

[`render.yaml`](../render.yaml) defines static, LD worker, and Ollama services. Apply from Render Dashboard → **Blueprints** → connect `neodigitalca/flowbie1`.

Or provision via API:

```powershell
node scripts/render-provision.mjs
```

## DNS (production)

In your DNS provider for `neodigital.ca`:

| Record | Type | Target |
|--------|------|--------|
| `app` | CNAME | Render target for `flowbie-prod-static` |
| `ld` | CNAME | Render target for `flowbie-prod-worker` |

Enable custom domains in each Render service, then verify HTTPS.

## Demo validation

1. Open demo static URL: https://flowbie-demo-static.onrender.com (200, SPA `_redirects` in `dist/`).
2. Sign in; confirm API calls go to `neodigital.ca` (Network tab).
3. CORS preflight from `*.onrender.com` is allowed on `neodigital.ca/api/*`.
4. Run Local Dominator grid export from a workflow or task (WP proxies to prod worker when secrets are set).
5. Check worker logs in Render dashboard or via MCP.

## Provision / patch scripts

| Script | Purpose |
|--------|---------|
| `node scripts/render-provision.mjs` | Create or update Render static, worker, and Ollama services |
| `node scripts/render-patch-wp-worker-secrets.mjs` | Append LD worker URL + auth to WP Engine `neo-pulse-app-secrets.php` |

## Rollback

- **Static:** Redeploy previous commit from Render service → Deploys.
- **Worker:** Same; ensure `LD_WORKER_AUTH_TOKEN` unchanged.
- **WP Engine UI:** Keep SFTP deploy to `neodigital.ca/app/` as fallback until Render prod is verified.

## Local dev (unchanged)

```powershell
npm run dev
```

Uses local WP proxy; Render is additive.
