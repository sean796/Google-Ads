/** Persisted active section inside the manager Dashboard tab (Properties + keys + services). */
export const MANAGER_SETTINGS_CLUSTER_KEY = "neo-pulse-manager-settings-cluster";

export type ManagerSettingsClusterId =
  | "properties"
  | "api-keys"
  | "master-rules"
  | "ai-generation"
  | "decision-tree"
  | "google";

const CLUSTER_IDS: readonly ManagerSettingsClusterId[] = [
  "properties",
  "api-keys",
  "master-rules",
  "ai-generation",
  "decision-tree",
  "google",
];

export function readStoredManagerSettingsCluster(): ManagerSettingsClusterId {
  try {
    const t = localStorage.getItem(MANAGER_SETTINGS_CLUSTER_KEY);
    if (t && (CLUSTER_IDS as readonly string[]).includes(t)) {
      return t as ManagerSettingsClusterId;
    }
  } catch {
    /* ignore */
  }
  return "properties";
}

export function writeStoredManagerSettingsCluster(section: ManagerSettingsClusterId): void {
  try {
    localStorage.setItem(MANAGER_SETTINGS_CLUSTER_KEY, section);
  } catch {
    /* ignore */
  }
}
