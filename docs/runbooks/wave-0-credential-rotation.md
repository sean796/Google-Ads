# Wave 0 Credential Rotation Runbook

Purpose: rotate every credential exposed through the repo, the browser, or the hub uploads folder, in an order that does not take production down. Owners execute the rotations in their own accounts. The agent prepares and verifies, and never changes a live client site or a production credential.

Rule for every row: rotate first, deploy the Wave 0 code that reads the new home second, verify third, delete the old home last. Never paste a secret value into chat, a ticket, a commit, or this file.

## Owners

- Hub owner: Sean (Render hub, hub WordPress, OpenRouter, DataForSEO, Semrush, AgentMail, Slack app, Google Cloud OAuth client, service accounts)
- Repo owner: Sean, with Matt approval for any history rewrite or force push
- Client site owner: Sean or the client contact named in Integrations for that property (WordPress app passwords are per site)
- Hosting owner: Sean (Render `pulse-host-api` and hub token pair)

## Rotation checklist

### 1. WordPress app passwords, 17 seeded sites

Owner: client site owner per property.
Steps per site: WordPress admin, Users, Profile, Application Passwords. Revoke the existing Neo Pulse app password, create a new one with the same label, put the new value only into the server-side sites value (`NEO_PULSE_APP_SITES_JSON` on the hub, see the Wave 0 plan), and run a hub test-connection for that site.
Done when: the old password fails, the new one passes test-connection, and no browser needs the value.

### 2. Demo account

Owner: Sean.
Steps: change or disable the demo account password on the hub, confirm the old password no longer logs in, then ship the code that removes the hardcoded demo credential and the placeholder login.
Done when: a fresh browser lands on the login page with no auto login.

### 3. OpenRouter

Owner: Sean.
Steps: create a new key in OpenRouter, set `NEO_PULSE_APP_OPENROUTER_API_KEY` in the hub env and in local wp-config constants, run one keyless chat completion against staging, then revoke the old key and remove any key ever pasted into a browser. Also revoke the key whose fingerprint is denylisted in the secrets loader.
Done when: generation works with no client key and the old key returns 401 from OpenRouter.

### 4. DataForSEO and Semrush

Owner: Sean.
Steps: rotate in each provider dashboard, set `NEO_PULSE_APP_DATAFORSEO_LOGIN`, `NEO_PULSE_APP_DATAFORSEO_PASSWORD`, and `NEO_PULSE_APP_SEMRUSH_API_KEY` on the hub, run one staging research call per provider, revoke the old credentials.
Done when: staging calls succeed on env values alone with the uploads files renamed away on staging.

### 5. Google service accounts (GSC and GA)

Owner: Sean.
Decision recorded 2026-11-05: the canonical home is the wp-config constant `NEO_PULSE_APP_GSC_SERVICE_ACCOUNT_JSON` (and the GA equivalent) in the hub secrets file, not a Render env var. A typical service account JSON is a few KB, but constants remove the env size question entirely and match the existing secrets file pattern. Env of the same name is still accepted by code as a secondary source.
Steps: create a new service account key in Google Cloud, grant it the same Search Console and Analytics access, put the JSON only in the hub secrets file, run staging GSC and GA reports, then delete the old key in Google Cloud.
Done when: reports run with the uploads service account files absent on staging.

### 6. Google OAuth client and refresh tokens (GMB, Google Ads, Drive)

Owner: Sean.
Steps: keep the existing OAuth client unless it is suspected exposed, in which case rotate its secret and update `NEO_PULSE_APP_GMB_CLIENT_SECRET`. After the state-verification code ships, reconnect each service once so a fresh refresh token is captured into `NEO_PULSE_APP_GMB_OAUTH_REFRESH_TOKEN`, `NEO_PULSE_APP_GOOGLE_ADS_OAUTH_REFRESH_TOKEN`, and `NEO_PULSE_APP_GOOGLE_MCP_OAUTH_REFRESH_TOKEN`. Revoke old tokens in the Google account security page.
Done when: each service works with its token JSON file absent on staging.

### 7. AgentMail

Owner: Sean.
Steps: rotate the AgentMail API key, set `NEO_PULSE_APP_AGENTMAIL_API_KEY`, `NEO_PULSE_APP_AGENTMAIL_INBOX`, and `NEO_PULSE_APP_AGENTMAIL_WEBHOOK_SECRET` on the hub, copy the webhook signing secret from the AgentMail dashboard into the hub env, send a test email, confirm one workflow run, revoke the old key.
Done when: a test email processes once and a replay is treated as a duplicate.

### 8. Slack app

Owner: Sean.
Steps: rotate the bot token, client secret, and signing secret in the Slack app settings, set `NEO_PULSE_APP_SLACK_BOT_TOKEN`, `NEO_PULSE_APP_SLACK_CLIENT_SECRET`, and `NEO_PULSE_APP_SLACK_SIGNING_SECRET` on the hub, reinstall the app to the workspace if Slack requires it, revoke old tokens.
Done when: Slack features work without any Slack secret in a browser.

### 9. Hosting API token pair

Owner: Sean.
Steps: generate one new token, set it on both Render services (`pulse-host-api` and `pulse-host-wp-hub`) in the same change window, confirm the hub proxy still reaches the hosting API and cron still returns 200, then retire the old value. Confirm the pair match before deploying the token-only auth code.
Done when: spoofed headers get 401 and the PHP proxy path still works.

### 9b. Google Maps embed API key

Owner: Sean.
Found 2026-11-05 by the extended secret scanner: one Maps embed key was hardcoded in two tracked files (`src/fixtures/hello-elementor-child-functions.example.php` and `wordpress-plugins/.deploy/neodigital-fatal/ygency-functions.php`). Both repo copies now carry a placeholder. Rotate the key in Google Cloud, confirm it is referrer-restricted to the client domains that use it, and set the new value on the live theme only, never back into this repo.
Done when: the old key is deleted or restricted in Google Cloud and live maps still load.

### 10. Session secret and setup key

Owner: Sean.
Steps: set `NEO_PULSE_APP_SESSION_SECRET` explicitly on the hub (rotating it logs every user out, so do it inside the Wave 0 deploy window), set `NEO_PULSE_APP_SETUP_KEY`, confirm login works.
Done when: old session cookies are rejected and fresh login succeeds.

## Git history purge (separate operation, scheduled with repo owners)

After every rotation above is done and verified:

1. Agree a window with Sean and Matt. A history rewrite force-pushes `main` and invalidates every existing clone and open branch based on it.
2. Remove `src/components/integrations/default-properties-seed.json` and the tracked credential backup under `wordpress-plugins/.deploy` from all history with a dedicated history tool, on a fresh clone.
3. Force push, then every collaborator re-clones. Old clones must be deleted, not merged back.
4. Confirm the extended secret scanner passes on all tracked files on the rewritten history.

Until the purge is scheduled, treat the rotated values as the protection: the history contains old values that no longer work.

## Wave 0 findings and owner handoff

Finding, 2026-11-05, seed removal mirror check: the local hub mirror (`/api/manager-wordpress-properties/load` with a session) returns all properties with editorial fields on the server rows and no credential fields, so the bundled seed was deleted from the repo. Owner (Sean): run the same load against the production hub before deploying Wave 0 and confirm the full property list is present there too. If the hub mirror is short, do a one-time server-side migration first. The fresh-profile behavior after this change is an empty visible site list until the mirror loads, which is intended.

Finding, 2026-11-05, agent-library preflight: this checkout references `includes/agent-library/class-agent-library-route-handlers.php` in the loader and the dispatcher, but the file has never been tracked in git history. Either the deployed hub carries a copy from outside this repo, or `/api/agent-library/*` routes fail on the deployed hub today. Owner (Sean): confirm which is true on the deployed hub before the Wave 0 dispatcher change ships. Not fixed inside Wave 0, by plan.

Owner actions that only account holders can do, scheduled from this runbook:

- Every rotation in sections 1 to 10 above, in the order given. The agent does not rotate production credentials or touch live client sites.
- Populate the hub env names declared in render.yaml (hub service, sync false) and the wp-config constants, per section. Code reads constants and env first from this release.
- Provision the Chekkit webhook token URL per client site (existing webhook URL option) before the token path enforcement deploys, or contact forms fail visibly. Set `NEO_PULSE_APP_CHEKKIT_WEBHOOK_TOKEN` on the hub.
- Confirm the registered AgentMail webhook carries the Bearer header before both factors are enforced. The Svix signing secret is `NEO_PULSE_APP_AGENTMAIL_SIGNING_SECRET`.
- Confirm the hosting token pair matches on both Render services before the token-only auth deploys (section 9).
- Run the production staging matrix that needs real accounts: OAuth connect round trips for GMB, Ads, and Drive with state tamper and replay, one keyless generation run, webhook live sends, and a real client staging site test-connection.
- Schedule the git history purge below with Sean and Matt as its own operation. It is not executed as part of the Wave 0 code change.

## Verification the agent runs after owners finish

- Staging curl matrix and browser checks from the Wave 0 plan
- One keyless generation run per provider path
- Scanner in all-tracked mode
- A fresh browser profile: login, site list from the server mirror, no secrets in local storage
