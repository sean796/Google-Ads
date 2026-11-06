import type { OverviewTabContentProps } from "@/components/overview/overview-tab/overview-tab-content-types";
import { useOverviewTabWorkspace } from "@/hooks/overview/use-overview-tab-workspace";

export function useOverviewTabBase(props: OverviewTabContentProps) {
  return useOverviewTabWorkspace(props);
}

export type OverviewTabBase = ReturnType<typeof useOverviewTabBase>;
