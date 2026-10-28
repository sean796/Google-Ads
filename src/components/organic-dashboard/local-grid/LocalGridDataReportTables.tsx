import { useMemo, useState } from "react";
import { Award, Building2, ExternalLink, Eye, Layers, MapPin, Star } from "lucide-react";
import { BULK_HEADER_FIELD, BULK_HEADER_TOOL_BTN } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import {
  ORGANIC_DASHBOARD_ICON_BADGE_CLASS,
  ORGANIC_DASHBOARD_SECTION_PANEL_CLASS,
  ORGANIC_DASHBOARD_SECTION_TITLE_CLASS,
} from "@/components/organic-dashboard/organic-dashboard-styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  LocalGridAggregatedView,
  LocalGridBusinessIdentity,
  LocalGridDistanceMeasure,
} from "@/lib/local-grid-studio/local-grid-types";
import { cn } from "@/lib/utils";

export type LocalGridDataReportTablesProps = {
  view: LocalGridAggregatedView;
  keyword: string;
  scanDateLabel: string;
  scanSize: string;
  distance: number;
  distanceMeasure: LocalGridDistanceMeasure;
  onSelectBusiness: (business: LocalGridBusinessIdentity) => void;
  onFocusPin: (pointId: string) => void;
};

export function LocalGridDataReportTables({
  view,
  keyword,
  scanDateLabel,
  scanSize,
  distance,
  distanceMeasure,
  onSelectBusiness,
  onFocusPin,
}: LocalGridDataReportTablesProps) {
  const [competitorFilter, setCompetitorFilter] = useState("");
  const { activeBusiness, summary, competitors, evaluatedPins, categoryBenchmarks, top3AvgReviews, top3AvgRating } =
    view;

  const filteredCompetitors = useMemo(() => {
    const q = competitorFilter.trim().toLowerCase();
    if (!q) return competitors;
    return competitors.filter(
      (c) =>
        c.business.toLowerCase().includes(q) ||
        c.address.toLowerCase().includes(q) ||
        c.primaryCategory.toLowerCase().includes(q) ||
        c.secondaryCategories.toLowerCase().includes(q) ||
        c.websiteUrl.toLowerCase().includes(q),
    );
  }, [competitors, competitorFilter]);

  return (
    <div className="space-y-4">
      {/* Executive Grid Summary & Category Benchmark Panel */}
      <section className={ORGANIC_DASHBOARD_SECTION_PANEL_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={ORGANIC_DASHBOARD_ICON_BADGE_CLASS}>
              <Award className="h-4 w-4" aria-hidden />
            </span>
            <h2 className={ORGANIC_DASHBOARD_SECTION_TITLE_CLASS}>
              Local Grid Data Report: {activeBusiness.business || keyword}
            </h2>
          </div>
          <div className="text-base text-muted-foreground tabular-nums">
            Scan: {scanDateLabel} · Keyword: <span className="text-white">{keyword}</span> · Grid:{" "}
            <span className="text-white">{scanSize}</span> ({summary.totalPoints} pins, {distance}{" "}
            {distanceMeasure})
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="bg-zinc-900 p-3">
            <div className="text-base text-muted-foreground">Avg. Rank</div>
            <div className="mt-1 text-base font-bold text-white tabular-nums">
              {summary.rankedPoints > 0 ? summary.avgRank.toFixed(2) : "20+"}
            </div>
          </div>
          <div className="bg-zinc-900 p-3">
            <div className="text-base text-muted-foreground">TARP (All Pins)</div>
            <div className="mt-1 text-base font-bold text-white tabular-nums">
              {summary.tarp.toFixed(2)}
            </div>
          </div>
          <div className="bg-zinc-900 p-3">
            <div className="text-base text-muted-foreground">Top 3 (High)</div>
            <div className="mt-1 text-base font-bold text-emerald-400 tabular-nums">
              {summary.highPct}% ({summary.highCount}/{summary.totalPoints})
            </div>
          </div>
          <div className="bg-zinc-900 p-3">
            <div className="text-base text-muted-foreground">Ranks 4-10 (Med)</div>
            <div className="mt-1 text-base font-bold text-amber-400 tabular-nums">
              {summary.medPct}% ({summary.medCount}/{summary.totalPoints})
            </div>
          </div>
          <div className="bg-zinc-900 p-3">
            <div className="text-base text-muted-foreground">Target Reviews vs Top 3</div>
            <div className="mt-1 text-base font-bold text-white tabular-nums">
              {activeBusiness.reviews ?? "-"} vs {top3AvgReviews || "-"} avg
            </div>
          </div>
          <div className="bg-zinc-900 p-3">
            <div className="text-base text-muted-foreground">Target Rating vs Top 3</div>
            <div className="mt-1 text-base font-bold text-white tabular-nums">
              {activeBusiness.rating ?? "-"} vs {top3AvgRating || "-"} avg
            </div>
          </div>
        </div>

        {categoryBenchmarks.length > 0 ? (
          <div className="overflow-x-auto pt-2">
            <div className="mb-2 flex items-center gap-2 text-base font-medium text-white">
              <Layers className="h-4 w-4 text-primary" aria-hidden />
              <span>Primary Category Dominance Across Grid</span>
            </div>
            <table className="w-full min-w-[36rem] text-base">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-normal">Primary Category</th>
                  <th className="pb-2 pr-4 font-normal tabular-nums">Competitors</th>
                  <th className="pb-2 pr-4 font-normal tabular-nums">Share of Top-3 Slots</th>
                  <th className="pb-2 pr-4 font-normal tabular-nums">Avg. Rating</th>
                  <th className="pb-2 font-normal tabular-nums">Avg. Reviews</th>
                </tr>
              </thead>
              <tbody>
                {categoryBenchmarks.slice(0, 8).map((cat) => (
                  <tr key={cat.category} className="border-t border-white/5">
                    <td className="py-2 pr-4 text-white">{cat.category}</td>
                    <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                      {cat.businessCount}
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-emerald-400">
                      {cat.top3SharePct.toFixed(1)}%
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-white">
                      {cat.avgRating != null ? cat.avgRating.toFixed(2) : "-"}
                    </td>
                    <td className="py-2 tabular-nums text-white">
                      {cat.avgReviews != null ? cat.avgReviews.toLocaleString() : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {/* Competitor Leaderboard Table */}
      <section className={ORGANIC_DASHBOARD_SECTION_PANEL_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={ORGANIC_DASHBOARD_ICON_BADGE_CLASS}>
              <Building2 className="h-4 w-4" aria-hidden />
            </span>
            <h2 className={ORGANIC_DASHBOARD_SECTION_TITLE_CLASS}>
              Competitor Leaderboard ({filteredCompetitors.length} of {competitors.length})
            </h2>
          </div>
          <Input
            type="text"
            aria-label="Filter competitors or categories"
            placeholder="Filter competitors, category, or domain"
            value={competitorFilter}
            onChange={(e) => setCompetitorFilter(e.target.value)}
            className={cn(BULK_HEADER_FIELD, "w-72 px-2.5 text-base")}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[64rem] text-base">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2 pr-3 font-normal tabular-nums">#</th>
                <th className="pb-2 pr-4 font-normal">Business & Address</th>
                <th className="pb-2 pr-4 font-normal">Categories</th>
                <th className="pb-2 pr-3 font-normal tabular-nums">Rating</th>
                <th className="pb-2 pr-3 font-normal tabular-nums">Reviews</th>
                <th className="pb-2 pr-3 font-normal tabular-nums">Avg. Rank</th>
                <th className="pb-2 pr-3 font-normal tabular-nums">TARP</th>
                <th className="pb-2 pr-3 font-normal tabular-nums">High %</th>
                <th className="pb-2 pr-3 font-normal tabular-nums">Med %</th>
                <th className="pb-2 pr-3 font-normal tabular-nums">Low %</th>
                <th className="pb-2 pr-3 font-normal tabular-nums">Out %</th>
                <th className="pb-2 font-normal text-right">Heatmap</th>
              </tr>
            </thead>
            <tbody>
              {filteredCompetitors.map((comp, idx) => {
                const isSelected = comp.key === activeBusiness.key;
                const webHref = comp.websiteUrl
                  ? comp.websiteUrl.startsWith("http")
                    ? comp.websiteUrl
                    : `https://${comp.websiteUrl}`
                  : null;
                return (
                  <tr
                    key={comp.key}
                    className={cn(
                      "border-t border-white/5 transition-colors hover:bg-white/[0.03]",
                      isSelected && "bg-primary/10",
                    )}
                  >
                    <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">{idx + 1}</td>
                    <td className="max-w-[18rem] py-2.5 pr-4">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium text-white">{comp.business}</span>
                        {webHref ? (
                          <a
                            href={webHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-muted-foreground hover:text-white"
                            title={comp.websiteUrl}
                          >
                            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          </a>
                        ) : null}
                      </div>
                      <div className="truncate text-base text-muted-foreground">{comp.address}</div>
                    </td>
                    <td className="max-w-[15rem] py-2.5 pr-4">
                      <div className="truncate text-white">{comp.primaryCategory || "-"}</div>
                      {comp.secondaryCategories ? (
                        <div className="truncate text-base text-muted-foreground">
                          {comp.secondaryCategories}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-white">
                      {comp.rating != null ? (
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                          {comp.rating.toFixed(1)}
                        </span>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-white">
                      {comp.reviews != null ? comp.reviews.toLocaleString() : "-"}
                    </td>
                    <td className="py-2.5 pr-3 font-medium tabular-nums text-white">
                      {comp.summary.avgRank.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">
                      {comp.summary.tarp.toFixed(2)}
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-emerald-400">
                      {comp.summary.highPct}%
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-amber-400">
                      {comp.summary.medPct}%
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-red-400">
                      {comp.summary.lowPct}%
                    </td>
                    <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">
                      {comp.summary.outPct}%
                    </td>
                    <td className="py-2.5 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onSelectBusiness(comp)}
                        className={cn(
                          BULK_HEADER_TOOL_BTN,
                          isSelected && "bg-primary text-black hover:bg-primary/90",
                        )}
                      >
                        <Eye className="mr-1.5 h-4 w-4" aria-hidden />
                        {isSelected ? "Active" : "View Map"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Grid Pin Coordinate Breakdown Table */}
      <section className={ORGANIC_DASHBOARD_SECTION_PANEL_CLASS}>
        <div className="flex items-center gap-2">
          <span className={ORGANIC_DASHBOARD_ICON_BADGE_CLASS}>
            <MapPin className="h-4 w-4" aria-hidden />
          </span>
          <h2 className={ORGANIC_DASHBOARD_SECTION_TITLE_CLASS}>
            Grid Pin Coordinate Breakdown ({evaluatedPins.length} pins)
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[56rem] text-base">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="pb-2 pr-4 font-normal">Coordinate (Lat, Lng)</th>
                <th className="pb-2 pr-4 font-normal tabular-nums">Distance</th>
                <th className="pb-2 pr-4 font-normal tabular-nums">Target Rank</th>
                <th className="pb-2 pr-4 font-normal">#1 Ranked Business</th>
                <th className="pb-2 pr-4 font-normal">#2 Ranked Business</th>
                <th className="pb-2 pr-4 font-normal">#3 Ranked Business</th>
                <th className="pb-2 font-normal text-right">Inspect</th>
              </tr>
            </thead>
            <tbody>
              {evaluatedPins.map((pin) => {
                const top1 = pin.items[0];
                const top2 = pin.items[1];
                const top3 = pin.items[2];
                return (
                  <tr key={pin.pointId} className="border-t border-white/5">
                    <td className="py-2 pr-4 tabular-nums text-white">
                      {pin.latitude.toFixed(5)}, {pin.longitude.toFixed(5)}
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-muted-foreground">
                      {pin.distanceFromCenter} {distanceMeasure}
                    </td>
                    <td className="py-2 pr-4 tabular-nums">
                      <span
                        className={cn(
                          "inline-flex min-w-[2.5rem] items-center justify-center px-2 py-0.5 text-base font-bold",
                          pin.bucket === "rank1" || pin.bucket === "high"
                            ? "bg-emerald-500 text-zinc-950"
                            : pin.bucket === "med"
                              ? "bg-amber-500 text-zinc-950"
                              : pin.bucket === "low"
                                ? "bg-red-500 text-white"
                                : "bg-zinc-700 text-zinc-200",
                        )}
                      >
                        {pin.targetRank ?? "20+"}
                      </span>
                    </td>
                    <td className="max-w-[14rem] truncate py-2 pr-4 text-white">
                      {top1 ? `${top1.business} (${top1.rating ?? "-"}★)` : "-"}
                    </td>
                    <td className="max-w-[14rem] truncate py-2 pr-4 text-muted-foreground">
                      {top2 ? `${top2.business} (${top2.rating ?? "-"}★)` : "-"}
                    </td>
                    <td className="max-w-[14rem] truncate py-2 pr-4 text-muted-foreground">
                      {top3 ? `${top3.business} (${top3.rating ?? "-"}★)` : "-"}
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => onFocusPin(pin.pointId)}
                        className={BULK_HEADER_TOOL_BTN}
                      >
                        Inspect Top 20
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
