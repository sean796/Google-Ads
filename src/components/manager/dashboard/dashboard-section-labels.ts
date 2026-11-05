import type { ManagerSettingsClusterId } from "@/components/manager/manager-settings-cluster";

export const DASHBOARD_SECTION_ORDER: readonly ManagerSettingsClusterId[] = [
  "properties",
  "api-keys",
  "master-rules",
  "ai-generation",
  "decision-tree",
  "google",
] as const;

export const DASHBOARD_SECTION_LABELS: Record<ManagerSettingsClusterId, string> = {
  properties: "Properties",
  "api-keys": "API Keys",
  "master-rules": "Master Rules",
  "ai-generation": "AI & Models",
  "decision-tree": "Decision Tree",
  google: "Google",
};
