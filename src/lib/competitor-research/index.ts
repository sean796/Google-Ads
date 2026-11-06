export { runCompetitorOrchestrator } from "@/lib/competitor-research/orchestrator";
export type {
  CompetitorGenerationOptions,
  CompetitorOrchestratorResult,
  CompetitorProgressCallback,
  CompetitorWithRow,
  ConnectedSiteProfile,
} from "@/lib/competitor-research/types";
export { fetchExternalSitemap } from "@/lib/competitor-research/fetch-external-sitemap";

import { runCompetitorOrchestrator } from "@/lib/competitor-research/orchestrator";
import type {
  CompetitorGenerationOptions,
  CompetitorOrchestratorResult,
  CompetitorProgressCallback,
} from "@/lib/competitor-research/types";

export async function generateCompetitors(
  options: CompetitorGenerationOptions,
  onProgress?: CompetitorProgressCallback,
): Promise<CompetitorOrchestratorResult> {
  return runCompetitorOrchestrator(options, onProgress);
}
