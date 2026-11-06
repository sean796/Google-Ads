import type { Args } from "@/hooks/overview/overview-tab-keywords-dates-types";
import { useOverviewKeywordBulk } from "@/hooks/overview/use-overview-keyword-bulk";
import { useOverviewTabDateModifiers } from "@/hooks/overview/use-overview-tab-date-modifiers";

export function useOverviewTabKeywordsDates(args: Args) {
  const { ensureOverviewKeywordsForMissingRows, handleKeywordsAll, handleAiKeywordRow } =
    useOverviewKeywordBulk(args);
  const {
    handleSetDateToday,
    handleSetAllDatesToday,
    patchRowDateModifierByUrl,
    commitRowDateModifierByUrl,
    commitRowDateModifier,
  } = useOverviewTabDateModifiers(args);

  return {
    ensureOverviewKeywordsForMissingRows,
    handleKeywordsAll,
    handleAiKeywordRow,
    handleSetDateToday,
    handleSetAllDatesToday,
    patchRowDateModifierByUrl,
    commitRowDateModifierByUrl,
    commitRowDateModifier,
  };
}
