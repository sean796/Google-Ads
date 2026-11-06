import { useCallback } from "react";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";

export function useOverviewSerpContext() {
  const serpDumpUrl = useCallback((filename: string) => {
    const base = (BACKEND_API_BASE || "").replace(/\/$/, "");
    if (base) return `${base}/api/dataforseo/serp-dump/${encodeURIComponent(filename)}`;
    return `/api/dataforseo/serp-dump/${encodeURIComponent(filename)}`;
  }, []);

  const getDfsSerpContext = useCallback(
    async (row: OverviewRow): Promise<string | undefined> => {
      if (!row.researchFileName) return undefined;
      try {
        const res = await fetch(serpDumpUrl(row.researchFileName));
        if (!res.ok) return undefined;
        const json = await res.json();
        const task = json?.tasks?.[0];
        const firstResult = Array.isArray(task?.result) ? task.result[0] : null;
        const items: unknown[] = Array.isArray(firstResult?.items) ? firstResult.items : [];

        const focus = (row.focusKeyword || "").toLowerCase();
        const serviceTerms = [
          "blind",
          "blinds",
          "shade",
          "shades",
          "shutter",
          "shutters",
          "curtain",
          "curtains",
          "drape",
          "drapes",
          "window treatment",
          "window treatments",
        ];

        const filteredItems = items.filter((item: Record<string, unknown>) => {
          const text = [item.title, item.description, item.snippet, item.question]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          if (!text) return false;
          if (focus && text.includes(focus)) return true;
          return serviceTerms.some((term) => text.includes(term));
        });

        if (!filteredItems.length) return undefined;

        const slim = {
          keyword: task?.data?.keyword ?? json.keyword ?? null,
          result_items: filteredItems,
        };
        return JSON.stringify(slim).slice(0, 8000);
      } catch {
        return undefined;
      }
    },
    [serpDumpUrl],
  );

  return {
    serpDumpUrl,
    getDfsSerpContext,
  };
}
