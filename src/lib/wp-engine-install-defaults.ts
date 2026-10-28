import type { WordPressSite } from "@/components/integrations/types";

/** Neo Digital WP Engine account that owns every client install. */
export const WP_ENGINE_ACCOUNT_ID = "ed80c554-dc67-4796-a9b8-805665019c16";

/** First hostname label (www stripped) -> WP Engine install name, per the SFTP catalog. */
export const WP_ENGINE_INSTALL_BY_HOST_LABEL: Record<string, string> = {
  advanceblindsanddrapery: "advanceblinds",
  blindmagic: "blindmagic",
  blindmagic1stg: "blindmagic1stg",
  blindswest: "blindswestcgy",
  dminteriorsanddesign: "dminteriors",
  eliteshadings: "eliteshadings",
  interiorsbylaura: "interiorsbyla",
  intheshadeflorida: "intheshade",
  kwbllp: "kwbllp",
  lindseyblindsetc: "lindseyblinds",
  neodigital: "neodigital",
  phoenixpainting: "phoenixpaint",
  "posh-outdoors": "poshoutdoors",
  shutterspot: "shuterspot",
  superiorblinds: "superiorblinds",
  superiortentrentals: "superiortents",
  tailoredinteriors: "tailoredint",
  youjunkit: "youjunkit",
};

/** First hostname label of the site (www stripped), e.g. blindmagic.com -> blindmagic. */
export function siteHostLabel(site: WordPressSite): string {
  try {
    const raw = (site.productionSiteUrl || site.siteUrl || "").trim();
    if (!raw) return "";
    const host = new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.toLowerCase();
    return host.replace(/^www\./, "").split(".")[0] ?? "";
  } catch {
    return "";
  }
}

/** Fill WP Engine install + account ID for known installs; never overwrites an existing account ID. */
export function applyWpEngineHostingDefaults(site: WordPressSite): WordPressSite {
  if (site.wpEngineAccountId?.trim()) return site;
  const install = WP_ENGINE_INSTALL_BY_HOST_LABEL[siteHostLabel(site)];
  if (!install) return site;
  return { ...site, wpEngineInstall: install, wpEngineAccountId: WP_ENGINE_ACCOUNT_ID };
}
