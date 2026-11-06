import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";

export interface BulkBlogGenerationTabProps {
  variant: "csv" | "prompt" | "blog-import" | "press-release";
  activeSection: BlogGeneratorSectionId;
  onSectionChange: (id: BlogGeneratorSectionId) => void;
  openRouterApiKey?: string;
  dataForSEOApiKey?: string;
  /** @deprecated Use dataForSEOApiKey */
  pressReleaseDataForSeoApiKey?: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  flowPurpose?: string;
}
