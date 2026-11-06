import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import type {
  CompetitorResearchSemrushResponse,
  TieredCompetitorsResult,
} from "@/lib/competitor-research/types";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import { filterEnrichmentWithAiClassifier } from "@/lib/competitor-research/competitor-keyword-ai-classify";
import { sortOnlyTopCompetitorsByCommonKeywords } from "@/lib/competitor-research/competitor-top-rows";
import { semrushDomainOverviewUrl } from "@/lib/competitor-research/semrush-domain-overview-url";
import { cn } from "@/lib/utils";
import {
  DEFAULT_AS_BAND,
  UNTIERED_FILTER_KEY,
  fmtAiRelevance,
  fmtMoney,
  fmtNum,
  isDirectCompetitorTier,
  tierBadgeClass,
  tierGroupKey,
  tierMetaKey,
} from "@/components/research/competitor/competitor-site-grid-helpers";
import { KeywordsMiniTable } from "@/components/research/competitor/CompetitorKeywordsMiniTable";
import { CompetitorTierFilterMenu } from "@/components/research/competitor/CompetitorTierFilterMenu";


import { Button, Checkbox } from "@/ui";

export function CompetitorSiteGrid({
  tiers,
  semrush,
  selectedKeys,
  onToggleDomain,
  onToggleAll,
}: {
  tiers: TieredCompetitorsResult | null;
  semrush: CompetitorResearchSemrushResponse | null;
  selectedKeys: Set<string>;
  onToggleDomain: (domainKey: string, selected: boolean) => void;
  onToggleAll: (selected: boolean) => void;
}) {
  const [openDomains, setOpenDomains] = useState<Set<string>>(() => new Set());
  const [selectedTierKeys, setSelectedTierKeys] = useState<Set<string>>(() => new Set());
  /** `null` = use default (match connected site AS band when available); explicit boolean after user toggles. */
  const [asFilterUserOverride, setAsFilterUserOverride] = useState<boolean | null>(null);

  /** Domains in a "direct" tier (for optional notice). */
  const directDomainSet = useMemo(() => {
    if (!tiers?.tiers?.length) return null;
    const set = new Set<string>();
    for (const g of tiers.tiers) {
      if (!isDirectCompetitorTier(g)) continue;
      for (const c of g.competitors) {
        set.add(normalizeCompetitorDomainKey(c.domain));
      }
    }
    return set;
  }, [tiers?.tiers]);

  const displayRows = useMemo(() => {
    const rows = semrush?.rows ?? [];
    if (rows.length === 0) return rows;
    /** Show every competitor row (no fixed cap); sorting still prioritizes traffic/common keywords. */
    return sortOnlyTopCompetitorsByCommonKeywords(rows, rows.length);
  }, [semrush?.rows]);

  const showTierColumn = Boolean(tiers?.tiers?.length);

  const tierFilterOptions = useMemo(
    () => (tiers?.tiers ?? []).map((g) => ({ key: tierGroupKey(g), label: g.label, tier: g.tier })),
    [tiers?.tiers],
  );

  const tierByDomain = useMemo(() => {
    const m = new Map<string, { tier: string; label: string }>();
    for (const g of tiers?.tiers ?? []) {
      for (const c of g.competitors) {
        m.set(normalizeCompetitorDomainKey(c.domain), { tier: g.tier, label: g.label });
      }
    }
    return m;
  }, [tiers?.tiers]);

  const rationaleByDomain = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of tiers?.tiers ?? []) {
      for (const c of g.competitors) {
        const r = c.rationale?.trim();
        if (r) m.set(normalizeCompetitorDomainKey(c.domain), r);
      }
    }
    return m;
  }, [tiers?.tiers]);

  const scoreByDomain = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of tiers?.tiers ?? []) {
      for (const c of g.competitors) {
        const dk = normalizeCompetitorDomainKey(c.domain);
        if (dk && typeof c.score === "number" && Number.isFinite(c.score)) {
          m.set(dk, c.score);
        }
      }
    }
    return m;
  }, [tiers?.tiers]);

  const hasUntieredRows = useMemo(() => {
    if (!showTierColumn) return false;
    for (const row of displayRows) {
      const dk = normalizeCompetitorDomainKey(row.domain);
      if (!tierByDomain.get(dk)) return true;
    }
    return false;
  }, [displayRows, tierByDomain, showTierColumn]);

  const tierOptionKeySet = useMemo(() => {
    const s = new Set<string>();
    for (const o of tierFilterOptions) s.add(o.key);
    if (hasUntieredRows) s.add(UNTIERED_FILTER_KEY);
    return s;
  }, [tierFilterOptions, hasUntieredRows]);

  const tiersFilterStableKey = useMemo(() => [...tierOptionKeySet].sort().join("|"), [tierOptionKeySet]);

  /** Same Authority Score as the “Connected site” strip (`seedOverview` from Analyze). */
  const seedAs = semrush?.seedOverview?.authorityScore;
  const seedAsFinite = typeof seedAs === "number" && Number.isFinite(seedAs);

  /** Reset AS filter when seed site or seed AS snapshot changes (new analyze / new data). */
  const semrushAsResetKey = useMemo(
    () => `${semrush?.seedDomain ?? ""}|${seedAsFinite ? String(seedAs) : "na"}`,
    [semrush?.seedDomain, seedAs, seedAsFinite],
  );

  useEffect(() => {
    setAsFilterUserOverride(null);
  }, [semrushAsResetKey]);

  /** Default-on uses connected `seedOverview` AS immediately (no one-frame delay vs `useEffect`). */
  const effectiveAsFilterOn = asFilterUserOverride ?? seedAsFinite;

  /**
   * When AI tier groups change: default the table to **direct competitors only** (tier `high` or
   * label "direct" without "indirect"). If there are no direct groups, show all tier rows.
   * Users can widen the filter via the Tier column menu.
   */
  useEffect(() => {
    const nextFull = new Set<string>();
    for (const o of tierFilterOptions) nextFull.add(o.key);
    if (hasUntieredRows) nextFull.add(UNTIERED_FILTER_KEY);

    setSelectedTierKeys(() => {
      if (nextFull.size === 0) {
        return new Set<string>();
      }
      const directOnly = new Set<string>();
      for (const g of tiers?.tiers ?? []) {
        if (!isDirectCompetitorTier(g)) continue;
        const k = tierGroupKey(g);
        if (nextFull.has(k)) directOnly.add(k);
      }
      if (directOnly.size > 0) {
        return directOnly;
      }
      return new Set(nextFull);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only reset when tier *options* change (stable key), not on every tiers prop identity change
  }, [tiersFilterStableKey]);

  const fullTierFilterKeySet = useMemo(() => new Set(tierOptionKeySet), [tierOptionKeySet]);

  const tierFilterActive = useMemo(() => {
    if (fullTierFilterKeySet.size === 0) return false;
    if (selectedTierKeys.size !== fullTierFilterKeySet.size) return true;
    for (const k of fullTierFilterKeySet) {
      if (!selectedTierKeys.has(k)) return true;
    }
    return false;
  }, [fullTierFilterKeySet, selectedTierKeys]);

  const tierFilteredRows = useMemo(() => {
    if (!showTierColumn) return displayRows;
    if (fullTierFilterKeySet.size === 0) return displayRows;
    return displayRows.filter((row) => {
      const dk = normalizeCompetitorDomainKey(row.domain);
      const meta = tierByDomain.get(dk);
      const k = tierMetaKey(meta);
      if (k == null) return selectedTierKeys.has(UNTIERED_FILTER_KEY);
      return selectedTierKeys.has(k);
    });
  }, [displayRows, showTierColumn, selectedTierKeys, tierByDomain, fullTierFilterKeySet]);

  /**
   * Row AS from Semrush only (no client fallback). When AS filter is on, rows without AS are hidden.
   * If the seed has AS but competitor rows were never enriched with AS, the band would hide **every** row and the
   * table looks empty (header only). In that case show all tier-filtered rows so the grid does not "disappear."
   */
  const filteredRows = useMemo(() => {
    if (!effectiveAsFilterOn || !seedAsFinite || seedAs == null) return tierFilteredRows;
    const lo = seedAs - DEFAULT_AS_BAND;
    const hi = seedAs + DEFAULT_AS_BAND;
    const banded = tierFilteredRows.filter((row) => {
      const as = row.authorityScore;
      if (as == null || !Number.isFinite(as)) return false;
      return as >= lo && as <= hi;
    });
    if (banded.length === 0 && tierFilteredRows.length > 0) {
      return tierFilteredRows;
    }
    return banded;
  }, [tierFilteredRows, effectiveAsFilterOn, seedAsFinite, seedAs]);

  const asFilterActive = Boolean(effectiveAsFilterOn && seedAsFinite);

  const asBandRangeLabel = useMemo(() => {
    if (!seedAsFinite || seedAs == null) return "";
    const lo = seedAs - DEFAULT_AS_BAND;
    const hi = seedAs + DEFAULT_AS_BAND;
    return `${lo}–${hi}`;
  }, [seedAsFinite, seedAs]);

  const toggleTierFilterKey = (key: string, checked: boolean) => {
    setSelectedTierKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const selectAllTierFilters = () => setSelectedTierKeys(new Set(fullTierFilterKeySet));

  const [enrichmentByDomain, setEnrichmentByDomain] = useState<
    NonNullable<CompetitorResearchSemrushResponse["enrichmentByDomain"]>
  >({});
  const [keywordFilterError, setKeywordFilterError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const raw = semrush?.enrichmentByDomain ?? {};
    void filterEnrichmentWithAiClassifier(raw, {
      seedDomain: semrush?.seedDomain ?? "",
      seedKeywordPhrases: (semrush?.seedTopKeywords ?? [])
        .map((k) => k.phrase || "")
        .filter(Boolean),
    })
      .then((next) => {
        if (cancelled) return;
        setEnrichmentByDomain(next ?? {});
        setKeywordFilterError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setEnrichmentByDomain({});
        setKeywordFilterError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [semrush]);
  const toggleDomain = (dk: string) => {
    setOpenDomains((prev) => {
      const next = new Set(prev);
      if (next.has(dk)) next.delete(dk);
      else next.add(dk);
      return next;
    });
  };

  if (!semrush) {
    return null;
  }

  const hasCompetitors = displayRows.length > 0;
  const noDirectButTiered =
    Boolean(tiers?.tiers?.length) && directDomainSet != null && directDomainSet.size === 0;

  const allSelected =
    hasCompetitors &&
    filteredRows.length > 0 &&
    filteredRows.every((r) => selectedKeys.has(normalizeCompetitorDomainKey(r.domain)));
  const someSelected = filteredRows.some((r) => selectedKeys.has(normalizeCompetitorDomainKey(r.domain)));

  return (
    <div className="space-y-4">
      {keywordFilterError ? (
        <p className="min-h-[1rem] text-base leading-normal text-destructive">
          Competitor keyword filtering failed: {keywordFilterError}
        </p>
      ) : null}
      {noDirectButTiered ? (
        <p className="min-h-[1rem] text-base leading-normal text-semantic-warning-foreground/90">
          No competitors in the direct tier. The table below includes partial or indirect overlap so you can review and uncheck rows.
        </p>
      ) : null}
      {!hasCompetitors ? (
        <p className="min-h-[1rem] text-base leading-normal text-muted-foreground">
          No competitor domains returned.
        </p>
      ) : (
        <div className="neo-pulse-zone-tile--analysis px-0 py-2 sm:px-1">
          <div className="overflow-x-auto rounded-md border border-border/50">
            <table className="w-full min-w-[1120px] border-collapse text-left text-base leading-normal">
              <thead>
                <tr className="border-b border-border/50 bg-black/30 text-muted-foreground">
                  <th className="w-10 px-1 py-2 text-center font-medium" aria-label="Include in exports">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={(v) => onToggleAll(v === true)}
                      title={
                        someSelected && !allSelected
                          ? "Some rows selected. Click to select all."
                          : "Select all rows for report and CSV"
                      }
                    />
                  </th>
                  <th className="px-2 py-2 font-medium">Domain</th>
                  {showTierColumn ? (
                    <th className="whitespace-nowrap px-2 py-2 font-medium">
                      <div className="flex items-center gap-1">
                        <span>Tier</span>
                            <CompetitorTierFilterMenu tierFilterOptions={tierFilterOptions} selectedTierKeys={selectedTierKeys} toggleTierFilterKey={toggleTierFilterKey} hasUntieredRows={hasUntieredRows} selectAllTierFilters={selectAllTierFilters} tierFilterActive={tierFilterActive} />
                      </div>
                    </th>
                  ) : null}
                  <th className="whitespace-nowrap px-2 py-2 font-medium" title="LLM relevance vs your site and GSC demand">
                    AI relevance
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 font-medium">Common</th>
                  <th className="whitespace-nowrap px-2 py-2 font-medium">Organic kw</th>
                  <th className="whitespace-nowrap px-2 py-2 font-medium">Traffic</th>
                  <th className="whitespace-nowrap px-2 py-2 font-medium">Traffic value</th>
                  <th className="whitespace-nowrap px-2 py-2 font-medium">Paid kw</th>
                  <th className="whitespace-nowrap px-2 py-2 font-medium" title="Authority Score (Semrush)">
                    <div className="flex items-center gap-1">
                      <span>AS</span>
                      {seedAsFinite && seedAs != null ? (
                        <Checkbox
                          checked={effectiveAsFilterOn}
                          onCheckedChange={(v) => setAsFilterUserOverride(v === true)}
                          className={cn(asFilterActive && "border-primary/60 data-[state=checked]:border-primary")}
                          title={`When on: rows with AS in ${asBandRangeLabel} (connected site ${seedAs}, band ±${DEFAULT_AS_BAND}). Rows without AS hidden.`}
                          aria-label={`Limit rows to Authority Score ${asBandRangeLabel}`}
                        />
                      ) : null}
                    </div>
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 font-medium">Ref. dom.</th>
                  <th className="whitespace-nowrap px-2 py-2 font-medium">Backlinks</th>
                  <th className="w-10 px-1 py-2 font-medium" aria-label="Expand details" />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const dk = normalizeCompetitorDomainKey(row.domain);
                  const tierMeta = tierByDomain.get(dk);
                  const href = dk ? semrushDomainOverviewUrl(dk, semrush.database) : "#";
                  const enr = enrichmentByDomain[dk] ?? enrichmentByDomain[row.domain.trim().toLowerCase()];
                  const open = openDomains.has(dk);
                  const aiScore = scoreByDomain.get(dk);
                  const barW = aiScore != null ? Math.min(100, Math.max(0, aiScore)) : 0;
                  const rationale = rationaleByDomain.get(dk);
                  const detailColSpan = showTierColumn ? 13 : 12;
                  const isRowSelected = selectedKeys.has(dk);

                  return (
                    <Fragment key={dk}>
                      <tr className="border-b border-border/35 bg-black/15 last:border-0">
                        <td className="w-10 px-1 py-2 text-center align-middle">
                          <Checkbox
                            checked={isRowSelected}
                            onCheckedChange={(v) => onToggleDomain(dk, v === true)}
                            aria-label={`Include ${dk}`}
                          />
                        </td>
                        <td className="max-w-[200px] px-2 py-2 align-middle">
                          <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="Open in Semrush Domain Overview"
                            className="inline-flex items-center gap-1 break-all font-medium text-primary underline-offset-2 hover:underline"
                          >
                            {dk}
                            <ExternalLink className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
                          </a>
                        </td>
                        {showTierColumn ? (
                          <td className="whitespace-nowrap px-2 py-2 align-middle">
                            {tierMeta ? (
                              <span
                                className={cn(
                                  "inline-block min-h-[1rem] rounded border px-1.5 py-0.5 text-base font-medium leading-normal",
                                  tierBadgeClass(tierMeta.tier),
                                )}
                              >
                                {tierMeta.label}
                              </span>
                            ) : (
                              "-"
                            )}
                          </td>
                        ) : null}
                        <td className="whitespace-nowrap px-2 py-2 align-middle">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-mono text-foreground/90">{fmtAiRelevance(aiScore)}</span>
                            {aiScore != null ? (
                              <div className="h-1 w-full max-w-[72px] overflow-hidden rounded-full bg-muted/60">
                                <div
                                  className="h-full rounded-full bg-primary/80"
                                  style={{ width: `${barW}%` }}
                                />
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono align-middle">{fmtNum(row.commonKeywords)}</td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono align-middle">{fmtNum(row.organicKeywords)}</td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono align-middle">{fmtNum(row.organicTraffic)}</td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono align-middle">{fmtMoney(row.trafficCost)}</td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono align-middle">{fmtNum(row.adsKeywords)}</td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono align-middle">{fmtNum(row.authorityScore)}</td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono align-middle">{fmtNum(row.referringDomains)}</td>
                        <td className="whitespace-nowrap px-2 py-2 font-mono align-middle">{fmtNum(row.backlinksTotal)}</td>
                        <td className="px-1 py-2 align-middle">
                          <Button
                            variant="quiet"
                            aria-expanded={open}
                            onClick={() => toggleDomain(dk)}
                            title={open ? "Hide keyword details" : "Show keyword details"}
                          >
                            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="border-b border-border/35 bg-black/25">
                          <td colSpan={detailColSpan} className="px-3 py-3">
                            <div className="space-y-3">
                              {rationale ? (
                                <p className="min-h-[1rem] text-base leading-normal text-muted-foreground">{rationale}</p>
                              ) : null}
                              {enr?.topKeywords?.length ? (
                                <KeywordsMiniTable title="Keywords" rows={enr.topKeywords} />
                              ) : (
                                <p className="min-h-[1rem] text-base leading-normal text-muted-foreground">
                                  No enriched keyword list for this domain (cap or timeout).
                                </p>
                              )}
                              {enr?.topPageUrl ? (
                                <p className="min-h-[1rem] text-base leading-normal text-muted-foreground">
                                  Top landing page:{" "}
                                  <a
                                    href={enr.topPageUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-primary underline-offset-2 hover:underline"
                                  >
                                    {enr.topPageUrl}
                                  </a>
                                  {enr.pageTitle ? (
                                    <>
                                      {" "}
                                      <span className="text-foreground/80">({enr.pageTitle})</span>
                                    </>
                                  ) : null}
                                </p>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

    </div>
  );
}
