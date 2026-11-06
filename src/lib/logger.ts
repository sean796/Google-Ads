/**
 * The one route for runtime diagnostics in the browser.
 *
 * Debug logging does not ship: `console.log`, `console.info`, and
 * `console.debug` are banned in app code (Wave 8 sweep). Warnings and
 * errors from failure paths go through here so they can be silenced or
 * forwarded in exactly one place.
 */
export const logger = {
  warn: (...args: unknown[]): void => {
    console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
};
