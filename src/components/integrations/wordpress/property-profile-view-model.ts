import { formatDateTime } from "@/components/hosting/site-profile/site-profile-view-model";
import type { WordPressSite } from "../types";

export type PropertyConnectionTone = { label: string; dot: string; text: string };

export function propertyConnectionTone(site: WordPressSite): PropertyConnectionTone {
  if (site.enabled === false) return { label: "Disabled", dot: "bg-ui-field-hover", text: "text-muted-foreground" };
  if (isWpEngineHosted(site)) return { label: "Hosted on WP Engine", dot: "bg-primary", text: "text-primary" };
  return propertyConnectionStatusTone(site.connectionStatus);
}

/** WP Engine account ID present means the site is hosted on WP Engine; otherwise it runs on Pulse Host. */
export function isWpEngineHosted(site: WordPressSite): boolean {
  return Boolean(site.wpEngineAccountId?.trim());
}

export function propertyHostingLabel(site: WordPressSite): "WP Engine" | "Pulse Host" {
  return isWpEngineHosted(site) ? "WP Engine" : "Pulse Host";
}

/** Note under the WordPress hosting cell: install name on WP Engine, Pulse connection result otherwise. */
export function propertyHostingNote(site: WordPressSite): string {
  return isWpEngineHosted(site) ? propertyWpEngineInstall(site) : propertyConnectionStatusTone(site.connectionStatus).label;
}

export function propertyConnectionStatusTone(status: WordPressSite["connectionStatus"]): PropertyConnectionTone {
  switch (status) {
    case "success":
      return { label: "Connected", dot: "bg-primary", text: "text-primary" };
    case "failed":
      return { label: "Connection failed", dot: "bg-ui-danger/20", text: "text-ui-danger-hover" };
    case "testing":
      return { label: "Testing", dot: "bg-semantic-analysis/80", text: "text-semantic-analysis-foreground" };
    default:
      return { label: "Not tested", dot: "bg-ui-field-hover", text: "text-muted-foreground" };
  }
}

export function formatLastTested(ts: number | undefined): string {
  return ts ? formatDateTime(new Date(ts).toISOString()) : "Not tested";
}

/** WP Engine install name: explicit field, else the first label of the site hostname (blindmagic.com -> blindmagic). */
export function propertyWpEngineInstall(site: WordPressSite): string {
  const explicit = site.wpEngineInstall?.trim() ?? "";
  if (explicit) return explicit;
  try {
    return new URL(site.siteUrl?.trim() ?? "").hostname.replace(/^www\./, "").split(".")[0] ?? "";
  } catch {
    return "";
  }
}

/** WP Engine portal "Launch WP Admin" URL when an account id is set; otherwise the site's own /wp-admin/. */
export function propertyWpAdminUrl(site: WordPressSite): string {
  const accountId = site.wpEngineAccountId?.trim() ?? "";
  const install = accountId ? propertyWpEngineInstall(site) : "";
  if (install && accountId) {
    return `https://my.wpengine.com/installs/${encodeURIComponent(install)}/launch_wp_admin?account_id=${encodeURIComponent(accountId)}`;
  }
  const siteUrl = site.siteUrl?.trim() ?? "";
  return siteUrl ? `${siteUrl.replace(/\/$/, "")}/wp-admin/` : "";
}
