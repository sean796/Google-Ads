/**
 * Publish a last-3-months, no-compare organic client report deck for every client on the Render hub
 * and write client name + Render-live share link to tmp/organic-last-3-months-share.csv.
 *
 * Local Grid scans come from the local server (NEO_PULSE_BASE, default http://127.0.0.1:8080) and are
 * embedded in each deck. Dashboard data, highlights and the deck itself use the Render hub.
 *
 * Usage: npx tsx scripts/publish-all-organic-last-3-months-share.ts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { setPostCreatorWorkerApiBase } from "../src/lib/wordpress-api/connection";
import { buildGa4ReportingRanges } from "../src/lib/reporting/ga4-analytics-date-ranges";
import { buildOrganicDashboardFetchParams } from "../src/lib/organic-dashboard/organic-dashboard-fetch-params";
import { fetchOrganicDashboardBundle } from "../src/lib/organic-dashboard/organic-dashboard-fetch";
import { buildOrganicDashboardViewModel } from "../src/lib/organic-dashboard/organic-dashboard-view-model";
import {
  buildOrganicReportingHighlightsSnapshot,
  normalizeOrganicReportingHighlights,
} from "../src/lib/organic-dashboard/organic-reporting-highlights";
import { publishOrganicClientReportDeckAndBuildShareUrl } from "../src/lib/organic-dashboard/organic-client-report-deck-publish";
import { fetchAllLocalGridScansForSite } from "../src/lib/organic-dashboard/local-grid-client-report";
import type { LocalGridScanDocument } from "../src/lib/local-grid-studio/local-grid-types";
import type { Ga4ReportingDateHarness } from "../src/components/research/reporting/Ga4ReportingDateRangePopover";
import type { WordPressSite } from "../src/components/integrations/types";
import { resolveOrganicClientReportClientLogoUrl } from "../src/lib/integrations/client-site-logo";
import { normalizeClientLogoBoxTheme } from "../src/lib/organic-dashboard/organic-client-report-property-branding";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEED_PATH = path.join(REPO_ROOT, "src/components/integrations/default-properties-seed.json");
const OUT_PATH = path.join(REPO_ROOT, "tmp/organic-last-3-months-share.csv");
const LOCAL = (process.env.NEO_PULSE_BASE || "http://127.0.0.1:8080").replace(/\/$/, "");
const HUB = "https://pulse-host-wp-hub.onrender.com";
const STATIC = "https://neo-pulse-static.onrender.com";

function loadDotEnv(filePath: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(filePath)) return out;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function loadHubApiToken(): string {
  const fromEnv = (process.env.PULSE_HOST_API_TOKEN || "").trim();
  if (fromEnv) return fromEnv;
  const dotenv = loadDotEnv(path.join(REPO_ROOT, ".env"));
  const dotenvLocal = loadDotEnv(path.join(REPO_ROOT, ".env.local"));
  return (dotenvLocal.PULSE_HOST_API_TOKEN || dotenv.PULSE_HOST_API_TOKEN || "").trim();
}

const HUB_API_TOKEN = loadHubApiToken();

const dateHarness: Ga4ReportingDateHarness = {
  primaryPreset: "last_3_months",
  compareBaseline: "previous_period",
  compareEnabled: false,
  compareRangeDraft: buildGa4ReportingRanges({
    primaryPreset: "last_3_months",
    primaryCustom: { startDate: "", endDate: "" },
    compareEnabled: false,
    compareBaseline: "previous_period",
    compareCustom: { startDate: "", endDate: "" },
  }),
};

async function loadSites(): Promise<WordPressSite[]> {
  const seed = (JSON.parse(fs.readFileSync(SEED_PATH, "utf8")).sites ?? []) as WordPressSite[];
  const res = (await fetch(`${HUB}/api/manager-wordpress-properties/load?_=${Date.now()}`).then((r) =>
    r.json(),
  )) as { sites?: WordPressSite[] };
  const sites = res.sites ?? [];
  for (const s of seed) {
    if (!sites.some((x) => x.id === s.id)) sites.push(s);
  }
  return sites.filter((s) => !/staging/i.test(`${s.name} ${s.siteUrl}`));
}

async function publishOne(site: WordPressSite, gridScans: LocalGridScanDocument[]): Promise<string> {
  setPostCreatorWorkerApiBase(HUB);
  const fetchParams = buildOrganicDashboardFetchParams(
    site,
    dateHarness,
    site.ga4PropertyId ?? "",
    site.googleAdsCustomerId,
  );
  if (!fetchParams) throw new Error("Invalid reporting date harness for last_3_months.");

  const bundle = await fetchOrganicDashboardBundle(fetchParams);
  const viewModel = buildOrganicDashboardViewModel(bundle, {
    showCompare: false,
    googleAdsCustomerIdForReporting: site.googleAdsCustomerId,
  });

  const snapshot = buildOrganicReportingHighlightsSnapshot(viewModel, site.name, site.siteUrl, false, null);
  const hlRes = await fetch(`${HUB}/api/organic-dashboard/reporting-highlights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ siteId: site.id, snapshot: { ...snapshot, periods: undefined } }),
  });
  const hlData = (await hlRes.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    highlights?: unknown;
  };
  if (!hlRes.ok || hlData.success === false) {
    throw new Error(hlData.error ?? `Highlights HTTP ${hlRes.status}`);
  }
  const highlights = normalizeOrganicReportingHighlights(hlData.highlights);
  if (!highlights) throw new Error("Highlights model returned empty content.");

  const { shareUrl } = await publishOrganicClientReportDeckAndBuildShareUrl({
    siteId: site.id,
    siteDisplayName: site.name,
    sitePublicUrl: site.siteUrl,
    shareState: { section: "performance", ...dateHarness },
    viewModel,
    readyHighlights: highlights,
    showCompare: false,
    localGridScans: gridScans,
    clientLogoUrl: resolveOrganicClientReportClientLogoUrl(site.id, site.clientLogoUrl ?? null, STATIC),
    clientLogoBoxTheme: normalizeClientLogoBoxTheme(site.clientLogoBoxTheme),
    origin: STATIC,
    hubApiToken: HUB_API_TOKEN,
  });
  if (!shareUrl.startsWith(`${STATIC}/`)) throw new Error(`Share link is not on ${STATIC}: ${shareUrl}`);
  return shareUrl;
}

function csvCell(v: string): string {
  return `"${v.replace(/"/g, '""')}"`;
}

async function main() {
  if (!HUB_API_TOKEN) {
    throw new Error("PULSE_HOST_API_TOKEN is required to publish decks on the Render hub.");
  }
  const sites = await loadSites();
  const rows: string[] = [];
  const failures: string[] = [];

  for (const site of sites) {
    try {
      setPostCreatorWorkerApiBase(LOCAL);
      const gridScans = await fetchAllLocalGridScansForSite(site.id);
      const withPins = gridScans.filter(
        (g) =>
          g.points.length >= 49 &&
          g.points.some((p) => p.items.length > 0) &&
          g.points.filter((p) => p.items.length > 0).length >= 49,
      ).length;
      if (gridScans.length === 0 || withPins !== gridScans.length) {
        throw new Error(
          `Local Grid incomplete: ${withPins}/${gridScans.length} locations have full 49-pin scan results.`,
        );
      }
      let shareUrl = "";
      for (let attempt = 1; ; attempt++) {
        try {
          shareUrl = await publishOne(site, gridScans);
          break;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (attempt >= 3 || !/\b50[234]\b/.test(msg)) throw err;
          console.warn(`[RETRY ${attempt}/2] ${site.name}: ${msg}`);
          await new Promise((r) => setTimeout(r, 5000 * attempt));
        }
      }
      const box = normalizeClientLogoBoxTheme(site.clientLogoBoxTheme);
      rows.push(`${csvCell(site.name)},${csvCell(shareUrl)},${csvCell(box)}`);
      console.log(`[OK] ${site.name} (${gridScans.length} grids, ${box} box) -> ${shareUrl}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`${site.name}: ${msg}`);
      console.error(`[FAIL] ${site.name}: ${msg}`);
    }
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, ["Client Name,Share Link,Logo Box", ...rows].join("\n") + "\n", "utf8");
  console.log(`\nWrote ${rows.length}/${sites.length} rows to ${OUT_PATH}`);
  if (failures.length) {
    console.error(`\n${failures.length} failure(s):\n${failures.join("\n")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
