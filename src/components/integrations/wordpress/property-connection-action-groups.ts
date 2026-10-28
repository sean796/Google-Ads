export type PropertyConnectionActionGroupId = "wordpress" | "google" | "discovery";

export type PropertyConnectionActionKey =
  | "test"
  | "neo-fields"
  | "gmb"
  | "ga"
  | "nap"
  | "sitemaps"
  | "gmb-stats";

export const PROPERTY_CONNECTION_GROUP_LABELS: Record<PropertyConnectionActionGroupId, string> = {
  wordpress: "WordPress",
  google: "Google",
  discovery: "Discovery",
};

const GROUP_BY_KEY: Record<PropertyConnectionActionKey, PropertyConnectionActionGroupId> = {
  test: "wordpress",
  "neo-fields": "wordpress",
  gmb: "google",
  ga: "google",
  nap: "google",
  "gmb-stats": "google",
  sitemaps: "discovery",
};

export function groupPropertyConnectionActions<T extends { key: string }>(
  actions: T[],
): Record<PropertyConnectionActionGroupId, T[]> {
  const grouped: Record<PropertyConnectionActionGroupId, T[]> = {
    wordpress: [],
    google: [],
    discovery: [],
  };
  for (const action of actions) {
    const group = GROUP_BY_KEY[action.key as PropertyConnectionActionKey];
    if (group) {
      grouped[group].push(action);
    }
  }
  return grouped;
}

export const PROPERTY_CONNECTION_GROUP_ORDER: PropertyConnectionActionGroupId[] = [
  "wordpress",
  "google",
  "discovery",
];
