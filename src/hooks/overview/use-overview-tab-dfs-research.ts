import { useCallback } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_COULD_NOT_DERIVE_A_FOCUS_KEYWORD_FOR_THI } from "@/lib/notify-messages";
import { runOverviewResearchForRow } from "@/lib/overview/overview-research-row";
import { ensureOverviewFocusKeyword } from "@/lib/overview/overview-ensure-focus-keyword";
import type { OverviewTabBase } from "@/hooks/overview/use-overview-tab-base";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { stripHtmlForKeywordContext } from "@/lib/overview/overview-row-helpers";

type Args = Pick<
  OverviewTabBase,
  | "rows"
  | "updateRow"
  | "gscQuickWinsFile"
  | "serpDumpUrl"
  | "deriveEntityKeyword"
  | "deriveFocusKeywordFromPageContext"
> & {
  site: WordPressSite | undefined;
  sitemapSource: OverviewSitemapSource;
  bindings: OverviewTabBase["bindings"];
  resolveBindings: OverviewTabBase["resolveBindings"];
  resolvePostBodyHtmlForSentiment: OverviewTabBase["resolvePostBodyHtmlForSentiment"];
};

export function useOverviewTabDfsResearch({
  rows,
  updateRow,
  site,
  gscQuickWinsFile,
  serpDumpUrl,
  sitemapSource,
  deriveEntityKeyword,
  deriveFocusKeywordFromPageContext,
  bindings,
  resolveBindings,
  resolvePostBodyHtmlForSentiment,
}: Args) {
  const resolveBodyPlainTextForRow = useCallback(
    async (row: OverviewRow): Promise<string | undefined> => {
      if (!site) return undefined;
      try {
        let binding = bindings[row.url];
        if (!binding) {
          const singleBindingMap = await resolveBindings([row.url], site, undefined, {
            inventoryOnly: true,
          });
          binding = singleBindingMap[row.url];
        }
        if (!binding?.postId) return undefined;
        const html = await resolvePostBodyHtmlForSentiment(row, binding);
        if (!html) return undefined;
        const plain = stripHtmlForKeywordContext(html);
        return plain.length > 0 ? plain.slice(0, 12000) : undefined;
      } catch {
        return undefined;
      }
    },
    [site, bindings, resolveBindings, resolvePostBodyHtmlForSentiment],
  );

  const handleDataForSeoResearch = useCallback(
    async (
      rowIndex: number,
      options?: { skipGsc?: boolean; silent?: boolean },
    ): Promise<Partial<OverviewRow> | null> => {
      const row = rows[rowIndex];
      if (!row) return null;

      const skipGsc = options?.skipGsc === true;
      const silent = options?.silent === true;

      updateRow(rowIndex, { status: "research-faq" });
      try {
        const ensured = await ensureOverviewFocusKeyword(row, {
          sitemapSource,
          deriveEntityKeyword,
          deriveFocusKeywordFromPageContext,
          resolveBodyPlainText: () => resolveBodyPlainTextForRow(row),
        });

        if (ensured.patch) {
          updateRow(rowIndex, ensured.patch);
        }

        if (!ensured.keyword) {
          if (!silent) {
            notify.error(NOTIFY_COULD_NOT_DERIVE_A_FOCUS_KEYWORD_FOR_THI);
          }
          updateRow(rowIndex, { status: "error" });
          return null;
        }

        const rowForResearch: OverviewRow = ensured.patch
          ? { ...row, ...ensured.patch }
          : row;

        const { patch } = await runOverviewResearchForRow({
          row: { ...rowForResearch, focusKeyword: ensured.keyword },
          rowIndex,
          site,
          gscQuickWinsFile,
          serpDumpUrl,
          skipGsc,
          silent,
        });
        if (!patch) {
          updateRow(rowIndex, { status: silent ? "error" : "idle" });
          return null;
        }
        updateRow(rowIndex, { status: "idle", ...patch });
        return patch;
      } catch {
        updateRow(rowIndex, { status: silent ? "error" : "idle" });
        return null;
      }
    },
    [
      rows,
      updateRow,
      site,
      gscQuickWinsFile,
      serpDumpUrl,
      sitemapSource,
      deriveEntityKeyword,
      deriveFocusKeywordFromPageContext,
      resolveBodyPlainTextForRow,
    ],
  );

  return { handleDataForSeoResearch, resolveBodyPlainTextForRow };
}
