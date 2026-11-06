import type { WordPressSite } from "@/components/integrations/types";

export type UseSocialCreatorWorkspaceOptions = {
  site: WordPressSite;
  apiKey: string;
  selectedModel: string;
};

export type SocialCreatorSortColumn = "title" | "date" | null;
