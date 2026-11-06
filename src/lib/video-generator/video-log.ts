import { logger } from "@/lib/logger";

/** Stage tracing for every Video Generator stage: `[video:<stage>] <event> {data}`. Never pass data URLs; log byte counts and names. */
export function videoLog(stage: string, event: string, data?: unknown): void {
  if (data === undefined) logger.debug(`[video:${stage}] ${event}`);
  else logger.debug(`[video:${stage}] ${event}`, data);
}

export function videoLogError(stage: string, event: string, error: unknown): void {
  logger.error(`[video:${stage}] ${event}`, error instanceof Error ? error.message : error);
}

/** Returns a function that reports whole seconds elapsed since it was created. */
export function videoTimer(): () => number {
  const startedAt = Date.now();
  return () => Math.round((Date.now() - startedAt) / 1000);
}
