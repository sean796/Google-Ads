import { logger } from "@/lib/logger";

/** Console-visible bulk post-generation tracer (uses warn so DevTools shows it by default). */
export function logBulkRunStep(message: string, detail?: Record<string, unknown>): void {
  if (detail && Object.keys(detail).length > 0) {
    logger.warn(`[Bulk] ${message}`, detail);
  } else {
    logger.warn(`[Bulk] ${message}`);
  }
}
