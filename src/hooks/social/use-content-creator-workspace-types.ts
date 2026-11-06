import type { WordPressSite } from "@/components/integrations/types";
export type UseContentCreatorWorkspaceOptions = {
  site: WordPressSite;
  apiKey: string;
  selectedModel: string;
};

export type ContentCreatorSortColumn = "title" | "date" | null;
