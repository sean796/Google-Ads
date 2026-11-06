import { useCallback } from "react";
import { notify } from "@/lib/app-notifications";
import { notifySetDateModifierToXForAllRows } from "@/lib/notify-messages";
import { initBulkSliceWithStatus } from "@/lib/overview/overview-bulk-inline-status";
import { overviewRowInBulkScope } from "@/lib/overview/overview-bulk-row-scope";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";
import {
  overviewDateModifierTodayIso,
  pushOverviewDateModifiersToAcfForUrls,
  pushOverviewRowDateModifierToAcf,
} from "@/lib/overview/overview-bulk-seo-payload";
import type { Args } from "@/hooks/overview/overview-tab-keywords-dates-types";

export function useOverviewTabDateModifiers({
  site,
  rows,
  setRows,
  bindings,
  resolveBindings,
  updateRow,
  setBulkActionProgress,
  bulkScopeUrlKeys,
}: Args) {
  const pushDateModifierToAcfForRow = useCallback(
    async (rowIndex: number, dateIso?: string) => {
      if (!site?.username?.trim() || !site.appPassword?.trim()) return;
      const row = rows[rowIndex];
      if (!row) return;
      const iso = (dateIso ?? row.dateModifier ?? "").trim();
      if (!iso) return;
      const bindingMap = await resolveBindings([row.url], site);
      const binding = bindingMap[row.url];
      if (!binding?.postId) return;
      await pushOverviewRowDateModifierToAcf(site, binding, iso);
    },
    [site, rows, resolveBindings],
  );

  const patchRowDateModifierByUrl = useCallback(
    (url: string, dateIso: string) => {
      const key = normalizePageUrlKey(url);
      const idx = rows.findIndex((r) => normalizePageUrlKey(r.url) === key);
      if (idx >= 0) updateRow(idx, { dateModifier: dateIso });
    },
    [rows, updateRow],
  );

  const commitRowDateModifierByUrl = useCallback(
    (url: string) => {
      const key = normalizePageUrlKey(url);
      const idx = rows.findIndex((r) => normalizePageUrlKey(r.url) === key);
      if (idx >= 0) void pushDateModifierToAcfForRow(idx);
    },
    [rows, pushDateModifierToAcfForRow],
  );

  const commitRowDateModifier = useCallback(
    (rowIndex: number) => {
      void pushDateModifierToAcfForRow(rowIndex);
    },
    [pushDateModifierToAcfForRow],
  );

  const handleSetDateToday = useCallback(
    (rowIndex: number) => {
      const iso = overviewDateModifierTodayIso();
      updateRow(rowIndex, { dateModifier: iso });
      void pushDateModifierToAcfForRow(rowIndex, iso);
    },
    [updateRow, pushDateModifierToAcfForRow],
  );

  const handleSetAllDatesToday = useCallback(() => {
    if (bulkScopeUrlKeys.size === 0) return;
    setBulkActionProgress((p) => ({
      ...p,
      dates: initBulkSliceWithStatus("dates", 1, 0),
    }));
    const iso = overviewDateModifierTodayIso();
    const scopedUrls = rows
      .filter((row) => overviewRowInBulkScope(row.url, bulkScopeUrlKeys))
      .map((row) => row.url);
    setRows((prev) =>
      prev.map((row) =>
        overviewRowInBulkScope(row.url, bulkScopeUrlKeys) ? { ...row, dateModifier: iso } : row,
      ),
    );
    if (site && scopedUrls.length > 0) {
      void pushOverviewDateModifiersToAcfForUrls(site, bindings, rows, scopedUrls, iso);
    }
    setBulkActionProgress((p) => ({
      ...p,
      dates: initBulkSliceWithStatus("dates", 1, 1),
    }));
    notify.success(notifySetDateModifierToXForAllRows(iso));
    window.setTimeout(() => {
      setBulkActionProgress((p) => {
        const next = { ...p };
        delete next.dates;
        return next;
      });
    }, 400);
  }, [bulkScopeUrlKeys, setRows, setBulkActionProgress, site, bindings, rows]);

  return {
    handleSetDateToday,
    handleSetAllDatesToday,
    patchRowDateModifierByUrl,
    commitRowDateModifierByUrl,
    commitRowDateModifier,
  };
}
