import type { WordPressSite } from "@/components/integrations/types";

export type OrganicReportingPanelProps = {
  site: WordPressSite;
  /** Main Index tab: do not navigate to `/sites/.../organic`. */
  inAppTab?: boolean;
};

