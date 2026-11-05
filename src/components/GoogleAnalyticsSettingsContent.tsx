import { useState, useEffect, useRef } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ActionButton, FileInput, RowButton } from "@/ui";
import { BarChart3, ChevronRight, Upload, CheckCircle } from "lucide-react";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { BACKEND_API_BASE as MCP_DERIVED_BACKEND } from "@/lib/wordpress-api/connection";

const BACKEND_API_BASE =
  (typeof import.meta.env.VITE_BACKEND_API_BASE === "string" ? import.meta.env.VITE_BACKEND_API_BASE : "").trim() ||
  MCP_DERIVED_BACKEND ||
  "";

const REPLACE_STATES = ["Replace", "Uploading"] as const;
const UPLOAD_STATES = ["Upload service account file", "Uploading"] as const;

export function GoogleAnalyticsSettingsContent() {
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [savedEmail, setSavedEmail] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStatus = async () => {
    setLoadingStatus(true);
    try {
      const res = await fetch(`${BACKEND_API_BASE}/api/ga/credentials-status`);
      const data = await res.json().catch(() => ({}));
      setSavedEmail(data?.configured ? data?.client_email ?? "Saved" : null);
    } catch {
      setSavedEmail(null);
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setIsUploading(true);
    try {
      const text = await file.text();
      const response = await fetch(`${BACKEND_API_BASE}/api/ga/test-and-save`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceAccountJson: text }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setSavedEmail(data?.client_email ?? "Saved");
        notify.success(data?.message ?? "Credentials saved.");
      } else {
        notify.error(data?.error ?? `Failed (${response.status}).`);
      }
    } catch (err) {
      notifyHeaderError("Upload failed", err);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-primary" />
        <h3 id="ga4-heading" className="text-base font-semibold text-foreground">
          Google Analytics 4
        </h3>
      </div>
      <p className="text-base text-foreground">
        Upload the service account JSON once. Set the numeric GA4 Property ID per site in Properties → Edit site, then Test GA on the site tile.
      </p>
      {savedEmail ? (
        <p className="text-base text-semantic-warning">
          API access uses the service account{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">{savedEmail}</code>, not your personal
          Google login. In GA4, Admin → Property access management → Add users → paste that email → Viewer.
        </p>
      ) : null}

      <div className="space-y-2">
        <FileInput
          ref={fileInputRef}
          accept=".json,application/json"
          onChange={handleFileChange}
        />
        {loadingStatus ? (
          <p className="flex h-8 items-center text-base text-muted-foreground">Checking</p>
        ) : savedEmail ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-base text-foreground">
              <CheckCircle className="h-4 w-4 shrink-0 text-primary" />
              <span>Credentials saved: <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">{savedEmail}</code></span>
            </span>
            <ActionButton
              variant="tool"
              icon={Upload}
              states={REPLACE_STATES}
              state={isUploading ? "Uploading" : "Replace"}
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
            />
          </div>
        ) : (
          <ActionButton
            icon={Upload}
            states={UPLOAD_STATES}
            state={isUploading ? "Uploading" : "Upload service account file"}
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          />
        )}        <p className="text-base text-muted-foreground">
          Upload the JSON key file from Google Cloud (Credentials → Service account → Keys → Add key → JSON). On neodigital.ca it is stored on the WordPress server via the neo-pulse-app plugin.
        </p>
      </div>

      <Collapsible open={instructionsOpen} onOpenChange={setInstructionsOpen} className="bg-ui-field">
        <CollapsibleTrigger asChild>
          <RowButton
            type="button"
          >
            <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${instructionsOpen ? "rotate-90" : ""}`} />
            Setup instructions (Google Cloud, GA4, neodigital.ca)
          </RowButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-3 text-base space-y-3 text-foreground">
            <div>
              <span className="font-semibold text-foreground">1. Google Cloud</span>
              <span className="text-foreground"> - Open </span>
              <a href="https://console.cloud.google.com/apis/library" target="_blank" rel="noopener noreferrer" className="text-primary font-medium underline hover:opacity-90">API Library</a>
              <span className="text-foreground">, search for <strong className="text-foreground">Google Analytics Data API</strong>, open it and click <strong className="text-foreground">Enable</strong>.</span>
            </div>
            <div>
              <span className="font-semibold text-foreground">2. Service account</span>
              <span className="text-foreground"> - Go to </span>
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-primary font-medium underline hover:opacity-90">Credentials</a>
              <span className="text-foreground"> → Create credentials → Service account (or reuse your GSC one). Open it → Keys → Add key → JSON. Download and keep the file safe.</span>
            </div>
            <div>
              <span className="font-semibold text-foreground">3. GA4 property access</span>
              <span className="text-foreground"> - In </span>
              <a href="https://analytics.google.com/" target="_blank" rel="noopener noreferrer" className="text-primary font-medium underline hover:opacity-90">Google Analytics</a>
              <span className="text-foreground"> select your GA4 property → Admin (gear) → Property access management → Add users. Enter the service account </span>
              <code className="bg-muted px-1 rounded text-foreground">client_email</code>
              <span className="text-foreground"> from the JSON. Role: <strong className="text-foreground">Viewer</strong>. Save.</span>
            </div>
            <div>
              <span className="font-semibold text-foreground">4. Property ID per site</span>
              <span className="text-foreground"> - In GA4: Admin → Property settings. Copy the numeric <strong className="text-foreground">Property ID</strong>. When adding or editing a WordPress site, paste it in the <strong className="text-foreground">GA4 Property ID</strong> field for that site.</span>
            </div>
            <div>
              <span className="font-semibold text-foreground">5. neodigital.ca (production)</span>
              <span className="text-foreground"> - Upload the JSON here in Settings, or set </span>
              <code className="bg-muted px-1 rounded text-foreground">NEO_PULSE_APP_GA_SERVICE_ACCOUNT_JSON</code>
              <span className="text-foreground"> in wp-config or </span>
              <code className="bg-muted px-1 rounded text-foreground">neo-pulse-app-secrets.php</code>
              <span className="text-foreground"> on the WordPress host.</span>
            </div>
            <div>
              <span className="font-semibold text-foreground">6. Test</span>
              <span className="text-foreground"> - On each WordPress site tile, click <strong className="text-foreground">Test GA</strong>. It uses that site’s GA4 Property ID (set in Edit site).</span>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
