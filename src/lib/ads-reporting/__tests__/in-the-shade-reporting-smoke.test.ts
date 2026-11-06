import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { setPostCreatorWorkerApiBase } from "@/lib/wordpress-api/connection";
import { computeCompareRangesForSpan } from "@/lib/reporting/reporting-date-presets";
import { fetchAdsReportingBundle } from "@/lib/ads-reporting/ads-reporting-fetch";
import { runAdsReportingPipeline } from "@/lib/ads-reporting/ads-reporting-pipeline";
import { getAdsModel } from "@/lib/optimization-settings-storage";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import { setSessionToken } from "@/lib/auth-device";

const IN_THE_SHADE_CUSTOMER_ID = "3177712331";
const REFERENCE = new Date("2026-10-05T18:00:00Z");

// Live smoke test: runs only when hub credentials and an OpenRouter key are
// provided via env (NEO_PULSE_SMOKE_EMAIL, NEO_PULSE_SMOKE_PASSWORD,
// OPENROUTER_API_KEY). Without them it skips, so default suite runs stay
// green; the hub key endpoint it used before was deleted on purpose (C3),
// so the key now comes from the environment like every other secret.
const SMOKE_EMAIL = (process.env.NEO_PULSE_SMOKE_EMAIL ?? "").trim();
const SMOKE_PASSWORD = process.env.NEO_PULSE_SMOKE_PASSWORD ?? "";
const SMOKE_OPENROUTER_KEY = (process.env.OPENROUTER_API_KEY ?? "").trim();
const smokeConfigured = Boolean(SMOKE_EMAIL && SMOKE_PASSWORD && SMOKE_OPENROUTER_KEY);

describe.skipIf(!smokeConfigured)("In the Shade PPC reporting smoke", () => {
  beforeAll(async () => {
    setPostCreatorWorkerApiBase(process.env.NEO_PULSE_SMOKE_API_BASE ?? "http://127.0.0.1:8080");
    const res = await fetch(backendApiUrl("/auth/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: SMOKE_EMAIL, password: SMOKE_PASSWORD }),
    });
    const data = (await res.json().catch(() => ({}))) as { sessionToken?: string; error?: string };
    if (!res.ok || !data.sessionToken) {
      throw new Error(`Smoke login failed (${res.status}): ${data.error ?? "no session token"}`);
    }
    setSessionToken(data.sessionToken);
  });

  it(
    "loads Jul-Sep 2026 Ads bundle and produces markdown",
    async () => {
      const ranges = computeCompareRangesForSpan(3, "previous_period", REFERENCE);
      expect(ranges.primary.startDate).toBe("2026-07-01");
      expect(ranges.primary.endDate).toBe("2026-09-30");

      const bundle = await fetchAdsReportingBundle(IN_THE_SHADE_CUSTOMER_ID, ranges, {
        reportStructure: "period_progress",
        compareKind: "period_progress",
        compareLabel: "Jul 1 - Sep 30, 2026",
      });
      expect(bundle.files.length).toBeGreaterThan(0);

      const result = await runAdsReportingPipeline({
        apiKey: SMOKE_OPENROUTER_KEY,
        model: getAdsModel("in-the-shade-smoke"),
        siteName: "In the Shade",
        siteUrl: "https://intheshadeflorida.com",
        files: bundle.files,
        compareKind: "period_progress",
        compareLabel: "Jul 1 - Sep 30, 2026",
      });

      expect(result.markdown.trim().length).toBeGreaterThan(500);
      expect(result.sectionResults.length).toBeGreaterThan(0);

      const outDir = path.join(process.cwd(), "tmp");
      await mkdir(outDir, { recursive: true });
      await writeFile(path.join(outDir, "in-the-shade-ppc-report.md"), result.markdown.trim(), "utf8");
    },
    600_000,
  );
});
