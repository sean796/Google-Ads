import type { BulkGeneratorStudioVariant } from "@/lib/bulk/bulk-generator-studio-rows";

export function bulkGeneratorDetailsPanelId(variant: BulkGeneratorStudioVariant): string {
  if (variant === "prompt") return "bulk-prompt-details-panel";
  if (variant === "blog-import") return "blog-import-details-panel";
  return "bulk-csv-details-panel";
}
