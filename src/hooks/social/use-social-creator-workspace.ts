import { useSocialCreatorWorkspaceCore } from "@/hooks/social/use-social-creator-workspace-core";
import type { UseSocialCreatorWorkspaceOptions } from "@/hooks/social/social-creator-workspace-types";

export type { SocialCreatorSortColumn, UseSocialCreatorWorkspaceOptions } from "@/hooks/social/social-creator-workspace-types";

export function useSocialCreatorWorkspace({ site, apiKey, selectedModel }: UseSocialCreatorWorkspaceOptions) {
  return useSocialCreatorWorkspaceCore({ site, apiKey, selectedModel });
}

export type SocialCreatorWorkspaceController = ReturnType<typeof useSocialCreatorWorkspace>;
