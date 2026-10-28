/** When active, Local Grid bulk wiki harvest logs MediaWiki + phase lines to the browser console. */

let traceDepth = 0;

export function isLocalGridWikiConsoleTraceActive(): boolean {
  return traceDepth > 0;
}

export function localGridWikiConsoleLog(message: string, detail?: unknown): void {
  if (traceDepth <= 0) return;
  if (detail !== undefined) {
    console.log(`[LocalGrid · Wiki] ${message}`, detail);
  } else {
    console.log(`[LocalGrid · Wiki] ${message}`);
  }
}

export function localGridWikiConsoleWarn(message: string, detail?: unknown): void {
  if (traceDepth <= 0) return;
  if (detail !== undefined) {
    console.warn(`[LocalGrid · Wiki] ${message}`, detail);
  } else {
    console.warn(`[LocalGrid · Wiki] ${message}`);
  }
}

export async function runWithLocalGridWikiConsoleTrace<T>(fn: () => Promise<T>): Promise<T> {
  traceDepth += 1;
  localGridWikiConsoleLog("Console trace ON (bulk Locations / wiki harvest)");
  try {
    return await fn();
  } finally {
    traceDepth -= 1;
    if (traceDepth === 0) {
      console.log("[LocalGrid · Wiki] Console trace OFF");
    }
  }
}
