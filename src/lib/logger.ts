/**
 * The one route for runtime diagnostics in the browser.
 *
 * Direct `console.*` calls are banned in app code (Wave 8 sweep); every
 * diagnostic flows through here so it can be silenced or forwarded in
 * exactly one place. `debug` is for feature tracers (video stages, image
 * pipeline, cluster runs): it maps to `console.debug`, which devtools
 * hides unless verbose logging is on. Failures use `warn` and `error`.
 */
export const logger = {
  debug: (...args: unknown[]): void => {
    console.debug(...args);
  },
  warn: (...args: unknown[]): void => {
    console.warn(...args);
  },
  error: (...args: unknown[]): void => {
    console.error(...args);
  },
};
