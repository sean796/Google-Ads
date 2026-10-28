import {
  WORKSPACE_PILL_ACTIVE,
  WORKSPACE_PILL_INACTIVE,
  WORKSPACE_PILL_SQUARE_BASE,
} from "@/components/shared/workspace-pill-styles";
import type { ContentOptimizerSectionId } from "@/components/content-optimizer/content-optimizer-sections";
import { cn } from "@/lib/utils";

export type ContentOptimizerSectionPillsProps = {
  activeSection: ContentOptimizerSectionId;
  onSectionChange: (id: ContentOptimizerSectionId) => void;
  disabled?: boolean;
};

/** Multi-site in Content Optimizer is deprecated; tasks live in Task Forge. */
export function ContentOptimizerSectionPills(_props: ContentOptimizerSectionPillsProps) {
  return null;
}
