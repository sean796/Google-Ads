import { Gauge } from "lucide-react";
import type { ProposalSiteAuditResult } from "@/lib/research/proposal-site-audit-types";
import {
  ORGANIC_DASHBOARD_ICON_BADGE_CLASS,
  ORGANIC_DASHBOARD_SECTION_PANEL_CLASS,
  ORGANIC_DASHBOARD_SECTION_TITLE_CLASS,
} from "@/components/organic-dashboard/organic-dashboard-styles";

function fmtScore(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(Math.round(n));
}

function fmtMs(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${Math.round(n)} ms`;
}

export type OrganicReportingSpeedSectionProps = {
  loading: boolean;
  audit: ProposalSiteAuditResult | null;
  targetUrl: string;
};

export function OrganicReportingSpeedSection({
  loading,
  audit,
  targetUrl,
}: OrganicReportingSpeedSectionProps) {
  const desktop = audit?.performance.desktop;
  const mobile = audit?.performance.mobile;

  return (
    <section className={ORGANIC_DASHBOARD_SECTION_PANEL_CLASS}>
      <div className="flex items-center gap-2">
        <span className={ORGANIC_DASHBOARD_ICON_BADGE_CLASS}>
          <Gauge className="h-4 w-4" aria-hidden />
        </span>
        <h2 className={ORGANIC_DASHBOARD_SECTION_TITLE_CLASS}>Speed scores</h2>
      </div>

      <p className="text-base text-muted-foreground tabular-nums">{targetUrl}</p>

      {loading ? (
        <p className="text-base text-muted-foreground">Running Lighthouse…</p>
      ) : !audit ? (
        <p className="text-base text-muted-foreground">
          Use Refresh in the toolbar to run a speed audit for the property homepage.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[24rem] text-base">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-normal">Metric</th>
                  <th className="pb-2 pr-4 font-normal tabular-nums">Desktop</th>
                  <th className="pb-2 font-normal tabular-nums">Mobile</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-white/5">
                  <td className="py-2 pr-4 text-white">Performance</td>
                  <td className="py-2 pr-4 tabular-nums text-white">{fmtScore(desktop?.performanceScore)}</td>
                  <td className="py-2 tabular-nums text-muted-foreground">{fmtScore(mobile?.performanceScore)}</td>
                </tr>
                <tr className="border-t border-white/5">
                  <td className="py-2 pr-4 text-white">Accessibility</td>
                  <td className="py-2 pr-4 tabular-nums text-white">{fmtScore(desktop?.accessibilityScore)}</td>
                  <td className="py-2 tabular-nums text-muted-foreground">{fmtScore(mobile?.accessibilityScore)}</td>
                </tr>
                <tr className="border-t border-white/5">
                  <td className="py-2 pr-4 text-white">Best practices</td>
                  <td className="py-2 pr-4 tabular-nums text-white">{fmtScore(desktop?.bestPracticesScore)}</td>
                  <td className="py-2 tabular-nums text-muted-foreground">{fmtScore(mobile?.bestPracticesScore)}</td>
                </tr>
                <tr className="border-t border-white/5">
                  <td className="py-2 pr-4 text-white">SEO</td>
                  <td className="py-2 pr-4 tabular-nums text-white">{fmtScore(desktop?.seoScore)}</td>
                  <td className="py-2 tabular-nums text-muted-foreground">{fmtScore(mobile?.seoScore)}</td>
                </tr>
                <tr className="border-t border-white/5">
                  <td className="py-2 pr-4 text-white">LCP</td>
                  <td className="py-2 pr-4 tabular-nums text-white">{fmtMs(desktop?.lcpMs)}</td>
                  <td className="py-2 tabular-nums text-muted-foreground">{fmtMs(mobile?.lcpMs)}</td>
                </tr>
                <tr className="border-t border-white/5">
                  <td className="py-2 pr-4 text-white">CLS</td>
                  <td className="py-2 pr-4 tabular-nums text-white">
                    {desktop?.cls != null ? String(desktop.cls) : "—"}
                  </td>
                  <td className="py-2 tabular-nums text-muted-foreground">
                    {mobile?.cls != null ? String(mobile.cls) : "—"}
                  </td>
                </tr>
                <tr className="border-t border-white/5">
                  <td className="py-2 pr-4 text-white">TBT</td>
                  <td className="py-2 pr-4 tabular-nums text-white">{fmtMs(desktop?.tbtMs)}</td>
                  <td className="py-2 tabular-nums text-muted-foreground">{fmtMs(mobile?.tbtMs)}</td>
                </tr>
                <tr className="border-t border-white/5">
                  <td className="py-2 pr-4 text-white">Speed index</td>
                  <td className="py-2 pr-4 tabular-nums text-white">{fmtMs(desktop?.speedIndexMs)}</td>
                  <td className="py-2 tabular-nums text-muted-foreground">{fmtMs(mobile?.speedIndexMs)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {audit.performance.worstPages.length > 0 ? (
            <div className="overflow-x-auto">
              <p className="mb-2 text-base text-white">Lowest performance pages</p>
              <table className="w-full min-w-[20rem] text-base">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-normal">URL</th>
                    <th className="pb-2 pr-4 font-normal">Device</th>
                    <th className="pb-2 font-normal tabular-nums">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.performance.worstPages.slice(0, 10).map((row) => (
                    <tr key={`${row.url}-${row.device}`} className="border-t border-white/5">
                      <td className="max-w-[24rem] break-words py-2 pr-4 text-white">{row.url}</td>
                      <td className="py-2 pr-4 capitalize text-muted-foreground">{row.device}</td>
                      <td className="py-2 tabular-nums text-white">{fmtScore(row.performanceScore)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
