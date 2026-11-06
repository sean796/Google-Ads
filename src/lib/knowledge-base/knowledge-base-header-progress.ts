import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import { SCRAPER_STEP_LABELS } from "@/lib/knowledge-base/scraper-constants";

export function buildKnowledgeBaseMicroSnapshot(args: {
  isUploading: boolean;
  uploadProgress: number;
  isScraping: boolean;
  scraperProgress: number;
  scraperStep: string | null;
}): MetaBulkMicroSnapshot | null {
  if (args.isUploading) {
    return {
      label: "Uploading files",
      completed: args.uploadProgress,
      total: 100,
      progressPct: args.uploadProgress,
      statusMessage: `Chunking ${args.uploadProgress}%`,
    };
  }
  if (args.isScraping) {
    const stepLabel = args.scraperStep
      ? SCRAPER_STEP_LABELS[args.scraperStep] || "Scraping"
      : "Scraping";
    return {
      label: stepLabel,
      completed: args.scraperProgress,
      total: 100,
      progressPct: args.scraperProgress,
    };
  }
  return null;
}
