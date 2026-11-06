import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import type { CompetitorGridPlaceRow } from "@/lib/competitor-research/local-dominator-grid-parse";
import type { CompetitorComparisonHarnessGroup } from "@/lib/competitor-research/competitor-comparison-harness-state";
import type { WordPressSite } from "@/components/integrations/types";

export type CompetitorGenerationProgress = {
  currentMessage: string;
  stepLog: string[];
  harnessGroups?: CompetitorComparisonHarnessGroup[];
};

export type CompetitorGenerationPhase = "find" | "generate" | "full";

export type CompetitorWorkspaceMode = "connected" | "temp";

export type CompetitorWorkspaceControls = {
  mode: CompetitorWorkspaceMode;
  onModeChange: (m: CompetitorWorkspaceMode) => void;
  tempSeedUrl: string;
  onTempSeedUrlChange: (v: string) => void;
  showConnectedToggle: boolean;
  connectedSiteUrl: string | null;
  onPickTempFromConnected: () => void;
};

export type GeneratedCompetitorRow = CSVRow & {
  domain?: string | null;
};

export interface UseCompetitorGenerationOptions {
  onComplete?: (storageKey: string, rows: GeneratedCompetitorRow[], suggestedTitleFormat: string) => void;
}
