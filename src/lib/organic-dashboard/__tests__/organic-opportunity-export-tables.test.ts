import { describe, expect, it } from "vitest";
import {
  buildOpportunityFlatPeriodTable,
  deckOpportunityShowCompare,
  planOpportunityExportTable,
} from "@/lib/organic-dashboard/organic-opportunity-export-tables";
import type { OrganicPeriodProgressTables } from "@/lib/organic-dashboard/organic-dashboard-period-progress";

const gscPeriodTable = {
  title: "Search visibility (GSC) by month",
  monthLabels: ["Jul", "Aug", "Sep"],
  periodTotalColumnLabel: "Total",
  rows: [
    { label: "Total clicks", values: ["926", "853", "881"], periodTotal: "2.7K" },
    { label: "Total impressions", values: ["83.1K", "91.2K", "73.4K"], periodTotal: "247.8K" },
    { label: "Average position", values: ["16.1", "16.2", "13.2"], periodTotal: "15.3" },
  ],
};

const tables: OrganicPeriodProgressTables = {
  ga4: null,
  gsc: gscPeriodTable,
  semrush: null,
};

describe("organic-opportunity-export-tables", () => {
  it("hides compare when compare values are n/a", () => {
    expect(
      deckOpportunityShowCompare(true, [
        { metric: "Clicks", comparePeriodValue: "n/a", primaryPeriodValue: "55" },
      ]),
    ).toBe(false);
    expect(
      deckOpportunityShowCompare(true, [
        { metric: "Clicks", comparePeriodValue: "40", primaryPeriodValue: "55" },
      ]),
    ).toBe(true);
  });

  it("maps site GSC metrics to monthly period table", () => {
    const table = buildOpportunityFlatPeriodTable(
      [
        { metric: "Clicks", comparePeriodValue: "n/a", primaryPeriodValue: "55" },
        { metric: "Impressions", comparePeriodValue: "n/a", primaryPeriodValue: "3.4K" },
        { metric: "Average position", comparePeriodValue: "n/a", primaryPeriodValue: "8.6" },
      ],
      tables,
    );
    expect(table?.monthLabels).toEqual(["Jul", "Aug", "Sep"]);
    expect(table?.rows.map((r) => r.label)).toEqual([
      "Total clicks",
      "Total impressions",
      "Average position",
    ]);
  });

  it("plans period table instead of compare-flat when compare is empty", () => {
    const plan = planOpportunityExportTable(
      {
        metrics: "",
        comparisonRows: [
          { metric: "Organic Search sessions", comparePeriodValue: "n/a", primaryPeriodValue: "2,539" },
          { metric: "Engagement rate", comparePeriodValue: "n/a", primaryPeriodValue: "97.5%" },
        ],
      },
      true,
      {
        ga4: {
          title: "Website traffic (GA4) by month",
          monthLabels: ["Jul", "Aug", "Sep"],
          periodTotalColumnLabel: "Total",
          rows: [
            { label: "Organic Search sessions", values: ["356", "983", "1,200"], periodTotal: "2,539" },
            { label: "Engagement rate", values: ["89.0%", "97.9%", "99.7%"], periodTotal: "97.5%" },
          ],
        },
        gsc: null,
        semrush: null,
      },
    );
    expect(plan.kind).toBe("period");
  });
});
