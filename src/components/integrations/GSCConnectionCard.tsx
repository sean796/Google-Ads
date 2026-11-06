import React, { useState, useCallback } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_FAILED_TO_COPY_EMAIL_TO_CLIPBOARD, NOTIFY_FAILED_TO_COPY_LIST, NOTIFY_GSC_EMAIL_COPIED_TO_CLIPBOARD, NOTIFY_GSC_NO_PROPERTIES_RETURNED, NOTIFY_PROPERTY_LIST_COPIED_TO_CLIPBOARD, NOTIFY_TESTING_GSC_CONNECTION, notifyGscConnectedXProperties } from "@/lib/notify-messages";
import { TestTube, Copy, Check, Search } from "lucide-react";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { neoPulseApiHeaders } from "@/lib/neo-pulse-api-headers";
import { Button } from "@/ui";
import {
  useGscServiceAccountIdentity,
  type GscServiceAccountIdentity,
} from "@/hooks/use-gsc-service-account-identity";
import { logger } from "@/lib/logger";
import type { GscTestSiteRow } from "./gsc-feature-types";

/** Service account email, copy, and test connection - use on Settings or inside {@link GSCFeature}. */
export const GSCConnectionCard: React.FC<{ identity: GscServiceAccountIdentity }> = ({ identity }) => {
  const { email: gscEmail } = identity;
  const [isTestingGSC, setIsTestingGSC] = useState(false);
  const [gscEmailCopied, setGscEmailCopied] = useState(false);
  /** Last successful test-connection payload so users see sites.list without opening DevTools */
  const [sitesListSnapshot, setSitesListSnapshot] = useState<{
    sites: GscTestSiteRow[];
    credentialsInUse?: string | null;
    siteCount: number;
  } | null>(null);

  const handleCopyGSCEmail = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(gscEmail);
      setGscEmailCopied(true);
      notify.success(NOTIFY_GSC_EMAIL_COPIED_TO_CLIPBOARD);
      setTimeout(() => setGscEmailCopied(false), 2000);
    } catch {
      notify.error(NOTIFY_FAILED_TO_COPY_EMAIL_TO_CLIPBOARD);
    }
  }, [gscEmail]);

  const handleCopySitesList = useCallback(async () => {
    if (!sitesListSnapshot) return;
    const lines: string[] = [];
    if (sitesListSnapshot.credentialsInUse) {
      lines.push(`API identity: ${sitesListSnapshot.credentialsInUse}`);
    }
    lines.push(`Property count: ${sitesListSnapshot.siteCount}`, "");
    sitesListSnapshot.sites.forEach((s) => {
      const raw = (s.originalFormat || s.siteUrl || "").trim();
      lines.push(s.permissionLevel ? `${raw}\t(${s.permissionLevel})` : raw);
    });
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      notify.success(NOTIFY_PROPERTY_LIST_COPIED_TO_CLIPBOARD);
    } catch {
      notify.error(NOTIFY_FAILED_TO_COPY_LIST);
    }
  }, [sitesListSnapshot]);

  const handleTestGSCConnection = useCallback(async () => {
    setIsTestingGSC(true);
    try {
      notify.info(NOTIFY_TESTING_GSC_CONNECTION);
      const response = await fetch(`${BACKEND_API_BASE}/api/gsc/test-connection`, {
        method: 'GET',
        credentials: "include",
        headers: neoPulseApiHeaders({ 'Content-Type': 'application/json' }),
      });
      if (!response.ok) {
        let errorData;
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}` };
        }
        logger.error('[GSC Test] API Error Response:', errorData);
        let errorMessage = errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
        if (errorData.details) {
          errorMessage += `\n\nDetails: ${errorData.details}`;
        }
        if (errorData.troubleshooting) {
          errorMessage += `\n\nTroubleshooting:\n`;
          Object.values(errorData.troubleshooting).forEach((step, i) => {
            errorMessage += `${i + 1}. ${step}\n`;
          });
        }
        throw new Error(errorMessage);
      }
      const data = await response.json();
      if (!data.success) {
        let errorMessage = data.error || data.message || 'GSC connection test failed';
        if (data.details) {
          errorMessage += `\n\nDetails: ${data.details}`;
        }
        logger.error('[GSC Test] API returned error:', data);
        throw new Error(errorMessage);
      }
      const credentialsInUse = (data as { credentialsInUse?: string | null }).credentialsInUse ?? null;
      const rawSites = Array.isArray(data.sites) ? (data.sites as GscTestSiteRow[]) : [];
      const siteCount =
        typeof data.siteCount === "number" ? data.siteCount : rawSites.length;
      setSitesListSnapshot({
        sites: rawSites,
        credentialsInUse,
        siteCount,
      });

      if (rawSites.length > 0) {
        const preview = rawSites.slice(0, 25).map((s) => {
          const label = (s.originalFormat || s.siteUrl || "").trim();
          const perm = s.permissionLevel ? ` (${s.permissionLevel})` : "";
          return `• ${label}${perm}`;
        });
        const descParts: string[] = [];
        if (credentialsInUse) descParts.push(`API identity:\n${credentialsInUse}`);
        descParts.push(preview.join("\n"));
        if (rawSites.length > 25) {
          descParts.push(`… +${rawSites.length - 25} more (full list in card below)`);
        }
        notify.success(notifyGscConnectedXProperties(siteCount), {
          duration: 25000,
          description: descParts.join("\n\n"),
        });
      } else {
        notify.warning(NOTIFY_GSC_NO_PROPERTIES_RETURNED, {
          duration: 14000,
          description: credentialsInUse
            ? `sites.list returned 0 rows for:\n${credentialsInUse}\n\nAdd this user under Search Console → Users for each property (Full).`
            : "sites.list returned 0 rows. Verify the service account is added in Search Console.",
        });
      }
    } catch (error) {
      logger.error('[GSC Test] Error testing connection:', error);
      let errorMessage = 'Failed to test GSC connection';
      let errorDetails = '';
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.message.includes('\n')) {
          const lines = error.message.split('\n');
          errorMessage = lines[0];
          errorDetails = lines.slice(1).join('\n');
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      if (errorDetails) logger.error('[GSC Test] Error details:', errorDetails);
      const shortErr =
        errorMessage.length > 120 ? `${errorMessage.slice(0, 117)}...` : errorMessage;
      notify.error(shortErr, { duration: 10000 });
      logger.error('[GSC Test] Full error details:', { message: errorMessage, details: errorDetails, error });
    } finally {
      setIsTestingGSC(false);
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Search className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <h3 id="gsc-heading" className="text-base font-semibold text-white">
          Google Search Console
        </h3>
      </div>
      <p className="text-base text-white">
        Add this email in Search Console → Settings → Users for each property (Full access).
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 max-w-full flex-1 items-center gap-2 rounded-lg border border-white/[0.08] bg-ui-field/50 px-3 py-2 sm:flex-initial sm:max-w-[min(100%,42rem)]">
          <span className="shrink-0 text-base text-white">API identity</span>
          <code className="min-w-0 flex-1 select-all break-words font-mono text-base text-white" title={gscEmail}>
            {gscEmail}
          </code>
          <Button
            variant="quiet"
            onClick={handleCopyGSCEmail}
            title="Copy email"
            type="button"
          >
            {gscEmailCopied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
          </Button>
        </div>
        <Button
          type="button"
          onClick={handleTestGSCConnection}
          disabled={isTestingGSC}
        >
          {isTestingGSC ? (
            <>
              
              Testing...
            </>
          ) : (
            <>
              <TestTube className="mr-2 h-4 w-4" />
              Test GSC Connection
            </>
          )}
        </Button>
      </div>
      {sitesListSnapshot ? (
        <div className="space-y-2 rounded-lg border border-white/[0.08] bg-ui-field/50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-base font-semibold text-white">
              Properties from Google ({sitesListSnapshot.siteCount})
            </span>
            <Button
              type="button"
              onClick={handleCopySitesList}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy list
            </Button>
          </div>
          {sitesListSnapshot.credentialsInUse ? (
            <p className="text-xs text-muted-foreground">
              JWT used for this call:{" "}
              <code className="break-all rounded bg-black/25 px-1 py-0.5 text-base">
                {sitesListSnapshot.credentialsInUse}
              </code>
            </p>
          ) : null}
          <ul
            className="max-h-52 list-none space-y-1 overflow-y-auto rounded border border-border/60 bg-background/60 p-2 text-xs font-mono leading-relaxed"
            aria-label="Google Search Console properties returned for this service account"
          >
            {sitesListSnapshot.sites.length === 0 ? (
              <li className="italic text-muted-foreground">
                No rows: Google returned an empty sites.list for this JWT. If a domain is missing, add this user in
                Search Console or align the deployed service account JSON.
              </li>
            ) : (
              sitesListSnapshot.sites.map((s, i) => (
                <li key={`${s.siteUrl}-${i}`} className="break-all border-b border-border/40 pb-1.5 last:border-0 last:pb-0">
                  <span className="text-foreground">{s.originalFormat || s.siteUrl}</span>
                  {s.permissionLevel ? (
                    <span className="ml-1 text-muted-foreground">({s.permissionLevel})</span>
                  ) : null}
                </li>
              ))
            )}
          </ul>
          <p className="text-base text-muted-foreground">
            Values above are Google&apos;s raw <code className="text-base">siteUrl</code> strings; the app normalizes
            them when matching your WordPress site URL.
          </p>
        </div>
      ) : null}
    </div>
  );
};

/** Settings page: connection card with its own service-account email fetch. */
export const GSCSettingsConnectionSection: React.FC = () => {
  const gscIdentity = useGscServiceAccountIdentity();
  return <GSCConnectionCard identity={gscIdentity} />;
};
