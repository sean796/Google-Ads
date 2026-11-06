export function googleAdsEntityStatusKey(
  status: string | undefined,
): "enabled" | "paused" | "removed" | "unknown" {
  const key = (status ?? "").trim().toUpperCase();
  if (key === "ENABLED") return "enabled";
  if (key === "PAUSED") return "paused";
  if (key === "REMOVED") return "removed";
  return "unknown";
}
