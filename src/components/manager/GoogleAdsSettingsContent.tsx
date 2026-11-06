import { useEffect, useState, type FormEvent } from "react";
import { CheckCircle, Copy, Megaphone, Save } from "lucide-react";
import { ActionButton, Button, Field } from "@/ui";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { NOTIFY_REDIRECT_URI_COPIED } from "@/lib/notify-messages";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import {
  openGoogleAdsAuthorize,
  useGoogleAdsConnectionStatus,
} from "@/hooks/use-google-ads-connection-status";

const SAVE_STATES = ["Save", "Saving"] as const;
const TEST_STATES = ["Test connection", "Testing"] as const;

export function GoogleAdsSettingsContent() {
  const {
    connected,
    loading,
    configured,
    hasDeveloperToken,
    hasMccId,
    mccId,
    redirectUri,
    authUrl,
    connectionError,
    refresh,
  } = useGoogleAdsConnectionStatus();
  const [developerToken, setDeveloperToken] = useState("");
  const [mccInput, setMccInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testMessage, setTestMessage] = useState<string | null>(null);

  useEffect(() => {
    if (mccId && !mccInput.trim()) setMccInput(mccId);
  }, [mccId, mccInput]);

  const handleSave = async (e?: FormEvent) => {
    e?.preventDefault();
    setSaving(true);
    setTestError(null);
    try {
      const response = await fetch(backendApiUrl("/google-ads/test-and-save"), {
        method: "POST",
        credentials: "include",
        headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          developerToken: developerToken.trim(),
          mccId: mccInput.trim(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        notify.error(typeof data?.error === "string" ? data.error : "Save failed");
        return;
      }
      setDeveloperToken("");
      refresh();
    } catch (err) {
      notifyHeaderError("Google Ads save failed", err);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestError(null);
    setTestMessage(null);
    try {
      const response = await fetch(backendApiUrl("/google-ads/test"), {
        method: "POST",
        credentials: "include",
        headers: neoPulseApiHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({}),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.success) {
        setTestMessage(typeof data.message === "string" ? data.message : "Google Ads connection OK.");
        refresh();
        return;
      }
      const message = typeof data?.error === "string" ? data.error : "Test failed";
      setTestError(message);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Google Ads test failed";
      setTestError(message);
      notifyHeaderError("Google Ads test failed", err);
    } finally {
      setTesting(false);
    }
  };

  const copyRedirectUri = () => {
    if (!redirectUri) return;
    void navigator.clipboard.writeText(redirectUri);
    notify.success(NOTIFY_REDIRECT_URI_COPIED);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5 text-foreground" aria-hidden />
        <h3 id="ads-heading" className="text-base font-semibold text-foreground">
          Google Ads
        </h3>
      </div>

      <form onSubmit={handleSave} className="grid gap-2 sm:grid-cols-2">
        <Field
          type="password"
          autoComplete="off"
          value={developerToken}
          onChange={(e) => setDeveloperToken(e.target.value)}
          placeholder={hasDeveloperToken ? "Developer token (optional, saved)" : "Developer token (optional)"}
          aria-label="Developer token"
        />
        <Field
          value={mccInput}
          onChange={(e) => setMccInput(e.target.value)}
          placeholder="MCC ID (393-713-6350)"
          aria-label="MCC ID"
        />
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <ActionButton
            icon={Save}
            states={SAVE_STATES}
            state={saving ? "Saving" : "Save"}
            disabled={saving}
            onClick={() => void handleSave()}
          />
          <Button icon={Copy} reserved={!redirectUri} onClick={copyRedirectUri}>
            Copy redirect URI
          </Button>
        </div>
      </form>

      {loading ? (
        <p className="flex h-8 items-center text-base text-muted-foreground">Checking</p>
      ) : (
        <div className="flex min-h-8 flex-wrap items-center gap-2">
          {connected ? (
            <span className="inline-flex h-8 items-center gap-1.5 bg-ui-field px-3 text-base font-medium text-primary">
              <CheckCircle className="h-4 w-4 shrink-0" aria-hidden />
              Connected{hasMccId ? " (MCC)" : ""}
            </span>
          ) : (
            <Button
              variant="run"
              onClick={() => openGoogleAdsAuthorize(authUrl)}
              disabled={!configured || !authUrl}
            >
              Connect Google Ads
            </Button>
          )}
          <ActionButton
            variant="tool"
            states={TEST_STATES}
            state={testing ? "Testing" : "Test connection"}
            disabled={testing || !configured || !hasMccId}
            onClick={handleTest}
          />
        </div>
      )}

      <p className="min-h-6 text-base text-ui-danger">{connectionError}</p>
      <p className="min-h-6 text-base text-ui-danger">{testError}</p>
      <p className="min-h-6 text-base text-primary">{testMessage}</p>
    </div>
  );
}