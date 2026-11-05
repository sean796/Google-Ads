import { useState, useEffect, useRef } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ActionButton, Button, Field, RowButton } from "@/ui";
import { Building2, CheckCircle, ChevronRight, Copy, Download, Save } from "lucide-react";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { NOTIFY_CLIENT_ID_SHOULD_BE_THE_FULL_VALUE_FROM_, NOTIFY_GMB_STATS_ADDED_TO_KNOWLEDGE_BASE, NOTIFY_NO_GMB_PERFORMANCE_DATA_RETURNED, NOTIFY_REDIRECT_URI_COPIED } from "@/lib/notify-messages";
import { KB_FILES_STORAGE_KEY, type StoredFile } from "./integrations/types";
import { getGMBPullDateRanges } from "@/lib/gmb-date-helpers";
import { BACKEND_API_BASE as MCP_DERIVED_BACKEND } from "@/lib/wordpress-api/connection";
import { NEO_PULSE_CA_DEPLOY } from "@/lib/neo-pulse-deploy";

const SAVE_STATES = ["Test and save", "Testing and saving"] as const;
const TEST_STATES = ["Test connection", "Testing"] as const;
const PULL_STATES = ["Pull stats to KB", "Pulling"] as const;

const GMB_CALLBACK_EXAMPLE = NEO_PULSE_CA_DEPLOY
  ? "https://neodigital.ca/api/gmb/callback"
  : "http://localhost:3001/api/gmb/callback";

const GMB_FRONTEND_URL_EXAMPLE = NEO_PULSE_CA_DEPLOY
  ? "https://neodigital.ca/neo-pulse/"
  : "http://localhost:5173/";

/** Same base as WordPress/AgentMail: VITE_MCP_API_BASE minus /api/mcp, unless overridden. */
const BACKEND_API_BASE =
  (typeof import.meta.env.VITE_BACKEND_API_BASE === "string" ? import.meta.env.VITE_BACKEND_API_BASE : "").trim() ||
  MCP_DERIVED_BACKEND ||
  "";

export function GMBSettingsContent() {
  const [connected, setConnected] = useState(false);
  const [configConfigured, setConfigConfigured] = useState(false);
  const [redirectUri, setRedirectUri] = useState<string>("");
  const [frontendUrl, setFrontendUrl] = useState<string>("");
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [testing, setTesting] = useState(false);
  const [pullingStats, setPullingStats] = useState(false);
  const pullStatsInProgressRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");

  const clientIdTrimmed = clientId.trim();
  const clientIdLooksValid =
    clientIdTrimmed.length >= 20 && clientIdTrimmed.includes(".apps.googleusercontent.com");

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const cacheBust = `_=${Date.now()}`;
      const [statusRes, configRes] = await Promise.all([
        fetch(`${BACKEND_API_BASE}/api/gmb/status?${cacheBust}`, { credentials: "include", cache: "no-store" }),
        fetch(`${BACKEND_API_BASE}/api/gmb/config-status?${cacheBust}`, { credentials: "include", cache: "no-store" }),
      ]);
      const statusData = await statusRes.json().catch(() => ({}));
      const configData = await configRes.json().catch(() => ({}));
      setConnected(Boolean(statusData?.connected));
      setConfigConfigured(Boolean(configData?.configured));
      setRedirectUri(typeof configData?.redirectUri === "string" ? configData.redirectUri : "");
      setFrontendUrl(typeof configData?.frontendUrl === "string" ? configData.frontendUrl : "");
    } catch {
      setConnected(false);
      setConfigConfigured(false);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleTestAndSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (clientIdTrimmed && !clientIdLooksValid) {
      notify.error(
        "Client ID should be the full value from Google Cloud (long, ending in .apps.googleusercontent.com)."
      );
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`${BACKEND_API_BASE}/api/gmb/test-and-save`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setConfigConfigured(true);
        setShowForm(false);
        setClientSecret("");
        notify.success(data?.message ?? "GMB credentials validated and saved.");
        fetchStatus();
      } else {
        notify.error(data?.error ?? response.statusText ?? "Test and save failed");
      }
    } catch (err) {
      notifyHeaderError("GMB test and save failed", err);
    } finally {
      setSaving(false);
    }
  };

  const handlePullStats = async () => {
    if (pullStatsInProgressRef.current) return;
    pullStatsInProgressRef.current = true;
    const dates = getGMBPullDateRanges();
    setPullingStats(true);
    try {
      const response = await fetch(`${BACKEND_API_BASE}/api/gmb/performance`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dates),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.error(data?.error ?? response.statusText ?? "Failed to pull GMB stats");
        return;
      }
      if (!data.success || !data.currentPeriod) {
        notify.error(NOTIFY_NO_GMB_PERFORMANCE_DATA_RETURNED);
        return;
      }
      const cur = data.currentPeriod;
      const comp = data.comparisonPeriod;
      const curTotal = (cur.calls ?? 0) + (cur.directions ?? 0) + (cur.websiteClicks ?? 0);
      const compTotal = (comp?.calls ?? 0) + (comp?.directions ?? 0) + (comp?.websiteClicks ?? 0);
      const allZero = curTotal === 0 && compTotal === 0;
      const footnote = allZero
        ? "\n\n*All metrics are 0 for these periods (no recorded activity in GBP for these dates, or data not yet available).*\n"
        : "";
      const content = `# Google Business Profile – Performance snapshot
Pulled: ${new Date().toISOString().slice(0, 19)}Z | Locations: ${data.locationCount ?? 0}

## Current period (${cur.startDate} – ${cur.endDate})
| Metric | Count |
| --- | --- |
| Call clicks | ${cur.calls?.toLocaleString() ?? 0} |
| Direction requests | ${cur.directions?.toLocaleString() ?? 0} |
| Website clicks | ${cur.websiteClicks?.toLocaleString() ?? 0} |

## Comparison period (${comp?.startDate} – ${comp?.endDate})
| Metric | Count |
| --- | --- |
| Call clicks | ${comp?.calls?.toLocaleString() ?? 0} |
| Direction requests | ${comp?.directions?.toLocaleString() ?? 0} |
| Website clicks | ${comp?.websiteClicks?.toLocaleString() ?? 0} |
${footnote}`;
      const timestamp = Date.now();
      const newFile: StoredFile = {
        name: `gmb-stats-${timestamp}.md`,
        size: content.length,
        content,
        starred: false,
        timestamp,
      };
      const stored = localStorage.getItem(KB_FILES_STORAGE_KEY) || "[]";
      const files: StoredFile[] = JSON.parse(stored);
      localStorage.setItem(KB_FILES_STORAGE_KEY, JSON.stringify([...files, newFile]));
      window.dispatchEvent(new CustomEvent("kb-files-updated", { detail: { files: [...files, newFile] } }));
      notify.success(NOTIFY_GMB_STATS_ADDED_TO_KNOWLEDGE_BASE);
    } catch (err) {
      notifyHeaderError("GMB stats pull failed", err);
    } finally {
      pullStatsInProgressRef.current = false;
      setPullingStats(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const response = await fetch(`${BACKEND_API_BASE}/api/gmb/test`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        notify.success(data?.message ?? "Google Business Profile connection OK");
        fetchStatus();
      } else {
        notify.error(data?.error ?? response.statusText ?? "Test failed");
      }
    } catch (err) {
      notifyHeaderError("GMB test failed", err);
    } finally {
      setTesting(false);
    }
  };

  const needsConfig = !configConfigured || showForm;
  const canSave = clientIdLooksValid && clientSecret.trim().length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Building2 className="w-5 h-5 text-primary" />
        <h3 id="gbp-heading" className="text-base font-semibold text-foreground">
          Google Business Profile
        </h3>
      </div>
      <p className="text-base text-foreground">
        OAuth sign-in for Business Profile. Add Client ID and secret from Google Cloud, then Connect and test.
      </p>

      {loadingStatus ? (
        <p className="flex h-8 items-center text-base text-muted-foreground">Checking</p>
      ) : needsConfig ? (
        <form onSubmit={handleTestAndSave} className="space-y-4">
          <div className="bg-ui-field p-4 space-y-3">
            <div className="font-semibold text-foreground">How to get Client ID and Client secret (Google Cloud)</div>
            <ol className="list-decimal list-inside space-y-2 text-base text-foreground">
              <li>
                Enable the API:{" "}
                <a href="https://console.cloud.google.com/apis/library" target="_blank" rel="noopener noreferrer" className="text-primary font-medium underline hover:opacity-90">API Library</a>
                {" "}→ search <strong className="text-foreground">Business Profile Account Management</strong> → <strong className="text-foreground">Enable</strong>.
              </li>
              <li>
                OAuth consent:{" "}
                <a href="https://console.cloud.google.com/apis/credentials/consent" target="_blank" rel="noopener noreferrer" className="text-primary font-medium underline hover:opacity-90">OAuth consent screen</a>
                {" "}→ External (or Internal) → app name and support email. Add scope <code className="bg-muted px-1 rounded text-foreground">https://www.googleapis.com/auth/business.manage</code> if asked.
              </li>
              <li>
                Create OAuth client:{" "}
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary font-medium underline hover:opacity-90">Credentials</a>
                {" "}→ <strong className="text-foreground">Create credentials</strong> → <strong className="text-foreground">OAuth client ID</strong> → Application type: <strong className="text-foreground">Web application</strong>. Under <strong className="text-foreground">Authorized redirect URIs</strong> click <strong className="text-foreground">Add URI</strong> and enter exactly <code className="bg-muted px-1 rounded text-foreground">{GMB_CALLBACK_EXAMPLE}</code>. Create.
              </li>
              <li>
                Copy <strong className="text-foreground">Client ID</strong> and <strong className="text-foreground">Client secret</strong> from the OAuth client card (or open the client again from{" "}
                <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary font-medium underline hover:opacity-90">Credentials</a>
                {" "}→ OAuth 2.0 Client IDs). Paste them into the fields below.
              </li>
            </ol>
          </div>
          <Field
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="Client ID (xxxxx.apps.googleusercontent.com)"
            required
          />
          <p className="text-base text-muted-foreground">
            Use the full value from Google Cloud (long string ending in <code className="bg-muted px-0.5 rounded">.apps.googleusercontent.com</code>). Short values like &quot;admin&quot; are not valid.
          </p>
          <p className="min-h-6 text-base text-semantic-warning">
            {clientIdTrimmed && !clientIdLooksValid
              ? "This doesn't look like a valid Client ID. Copy the full value from Credentials, your OAuth client."
              : ""}
          </p>
          <Field
            type="password"
            autoComplete="off"
            value={clientSecret}
            onChange={(e) => setClientSecret(e.target.value)}
            placeholder="Client secret (GOCSPX-...)"
            required
          />
          <p className="text-xs text-muted-foreground">
            {NEO_PULSE_CA_DEPLOY ? (
              <>
                Production reads credentials from{" "}
                <code className="bg-muted px-1 rounded">NEO_PULSE_APP_GMB_CLIENT_ID</code>,{" "}
                <code className="bg-muted px-1 rounded">NEO_PULSE_APP_GMB_CLIENT_SECRET</code>,{" "}
                <code className="bg-muted px-1 rounded">NEO_PULSE_APP_GMB_REDIRECT_URI</code>, and{" "}
                <code className="bg-muted px-1 rounded">NEO_PULSE_APP_FRONTEND_URL</code> in wp-config or{" "}
                <code className="bg-muted px-1 rounded">neo-pulse-app-secrets.php</code>.
              </>
            ) : (
              <>
                Redirect URI and Frontend URL default to localhost. Override with{" "}
                <code className="bg-muted px-1 rounded">GMB_REDIRECT_URI</code> and{" "}
                <code className="bg-muted px-1 rounded">FRONTEND_URL</code> in{" "}
                <code className="bg-muted px-1 rounded">.env</code> if needed.
              </>
            )}
          </p>
          <ActionButton
            icon={Save}
            states={SAVE_STATES}
            state={saving ? "Testing and saving" : "Test and save"}
            disabled={saving || !canSave}
            onClick={() => void handleTestAndSave()}
          />        </form>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-base text-foreground">
              <CheckCircle className="h-4 w-4 text-primary shrink-0" />
              <span>Credentials saved</span>
            </span>
            <Button onClick={() => setShowForm(true)}>Replace</Button>
            <ActionButton
              variant="tool"
              states={TEST_STATES}
              state={testing ? "Testing" : "Test connection"}
              disabled={testing || !connected}
              onClick={handleTest}
            />
            <ActionButton
              variant="tool"
              icon={Download}
              states={PULL_STATES}
              state={pullingStats ? "Pulling" : "Pull stats to KB"}
              disabled={pullingStats || !connected}
              onClick={handlePullStats}
            />
          </div>          {!connected && (
            <p className="text-base text-muted-foreground">
              Use <strong className="text-foreground">Connect Google Business</strong> on SEO → GBP Post to sign in with Google, then <strong className="text-foreground">Test connection</strong> here to verify a 200 response.
            </p>
          )}
          {redirectUri && (
            <div className="bg-ui-field p-2 space-y-1">
              <p className="text-xs font-medium text-foreground">Redirect URI (add this in Google Cloud)</p>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-background px-2 py-1 rounded flex-1 break-all" title={redirectUri}>
                  {redirectUri}
                </code>
                <Button
                  size="icon"
                  icon={Copy}
                  aria-label="Copy redirect URI"
                  onClick={() => {
                    navigator.clipboard.writeText(redirectUri);
                    notify.success(NOTIFY_REDIRECT_URI_COPIED);
                  }}
                />                            </div>
              {frontendUrl && (
                <>
                  <p className="text-xs font-medium text-foreground pt-1">Frontend URL (post-OAuth return)</p>
                  <code className="text-xs bg-background px-2 py-1 rounded block break-all" title={frontendUrl}>
                    {frontendUrl}
                  </code>
                </>
              )}
              <p className="text-xs text-semantic-warning">
                If you see &quot;The OAuth client was not found&quot; (401): use the <strong>same</strong> Client ID from Credentials, set Application type to <strong>Web application</strong>, and add the redirect URI above under Authorized redirect URIs.
              </p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {NEO_PULSE_CA_DEPLOY ? (
              <>
                On neodigital.ca, GBP uses the same-origin API at{" "}
                <code className="bg-muted px-1 rounded">/api/gmb/*</code>. Set OAuth credentials in{" "}
                <code className="bg-muted px-1 rounded">neo-pulse-app-secrets.php</code> or wp-config (
                <code className="bg-muted px-1 rounded">NEO_PULSE_APP_GMB_*</code>).
              </>
            ) : (
              <>
                Local dev uses <code className="bg-muted px-1 rounded">http://localhost:3001/api/gmb/*</code> unless{" "}
                <code className="bg-muted px-1 rounded">VITE_MCP_API_BASE</code> points elsewhere.
              </>
            )}
          </p>
        </div>
      )}

      <Collapsible open={instructionsOpen} onOpenChange={setInstructionsOpen} className="bg-ui-field">
        <CollapsibleTrigger asChild>
          <RowButton
            type="button"
          >
            <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${instructionsOpen ? "rotate-90" : ""}`} />
            More setup details (redirect URI in Google, env vars)
          </RowButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-3 text-base space-y-3 text-foreground">
            <p className="text-foreground">
              In the OAuth client, under <strong className="text-foreground">Authorized redirect URIs</strong>, add exactly <code className="bg-muted px-1 rounded">{GMB_CALLBACK_EXAMPLE}</code>.
            </p>
            <p className="text-foreground">
              After sign-in, NEO Pulse returns to <code className="bg-muted px-1 rounded">{GMB_FRONTEND_URL_EXAMPLE}</code> (Settings).
            </p>
            <p className="text-foreground">
              Then use <strong className="text-foreground">Connect Google Business</strong> on SEO → GBP Post and <strong className="text-foreground">Test connection</strong> here.
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
