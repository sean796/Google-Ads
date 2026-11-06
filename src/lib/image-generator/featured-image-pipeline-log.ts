import { logger } from "@/lib/logger";

const PREFIX = "[Featured Image Pipeline]";

export function logFeaturedImagePipeline(
  message: string,
  details?: Record<string, unknown>,
): void {
  if (details && Object.keys(details).length > 0) {
    logger.debug(`${PREFIX} ${message}`, details);
  } else {
    logger.debug(`${PREFIX} ${message}`);
  }
}
