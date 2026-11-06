import type { WordPressSite } from "@/components/integrations/types";

export type UsePpcGoogleWorkspaceOptions = {
  site: WordPressSite;
  apiKey: string;
  selectedModel: string;
};

export type PpcGoogleSortColumn = "title" | "date" | null;
