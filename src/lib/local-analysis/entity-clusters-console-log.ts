import { logger } from "@/lib/logger";

const LOG_PREFIX = "[Neo Pulse Clusters]";

export type EntityClustersSurface = "locations" | "competitors";

const REDACT_KEY = /password|apikey|api_key|token|secret|authorization|apppassword/i;

function sanitizeForClustersLog(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[max depth]";
  if (value == null || typeof value !== "object") return value;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Set) return Array.from(value);
  if (value instanceof Map) return Object.fromEntries(value);
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForClustersLog(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (REDACT_KEY.test(key)) {
      out[key] = raw ? "[redacted]" : raw;
      continue;
    }
    out[key] = sanitizeForClustersLog(raw, depth + 1);
  }
  return out;
}

/** Synchronous log on Clusters click (browser devtools). */
export function logClustersButtonPress(
  surface: EntityClustersSurface,
  snapshot: Record<string, unknown>,
): void {
  const safe = sanitizeForClustersLog(snapshot) as Record<string, unknown>;
  logger.debug(`${LOG_PREFIX} ${surface} — Clusters button`);
  logger.debug("timestamp", new Date().toISOString());
  logger.debug("snapshot", safe);
  try {
    logger.debug("snapshot_json", JSON.stringify(safe, null, 2));
  } catch {
    logger.debug("snapshot_json", "[could not stringify]");
  }
}

/** Follow-up pipeline phases after the initial click log. */
export function logClustersPipeline(
  surface: EntityClustersSurface,
  phase: string,
  detail?: Record<string, unknown>,
): void {
  const safe = detail ? (sanitizeForClustersLog(detail) as Record<string, unknown>) : undefined;
  if (safe) {
    logger.debug(`${LOG_PREFIX} ${surface} — ${phase}`, safe);
    try {
      logger.debug(`${LOG_PREFIX} ${surface} — ${phase} (json)`, JSON.stringify(safe, null, 2));
    } catch {
      /* ignore */
    }
  } else {
    logger.debug(`${LOG_PREFIX} ${surface} — ${phase}`);
  }
}
