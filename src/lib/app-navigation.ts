import type { NavigateFunction } from "react-router-dom";

/**
 * Bridge so non-component modules (route helper setters) can navigate
 * through React Router. Registered once by the app root (Index / AppMobile).
 */
let navigateFn: NavigateFunction | null = null;

export function registerAppNavigate(fn: NavigateFunction | null): void {
  navigateFn = fn;
}

export function appNavigate(to: string, opts?: { replace?: boolean }): void {
  if (navigateFn) {
    navigateFn(to, { replace: opts?.replace ?? true });
    return;
  }
  if (typeof window !== "undefined") {
    window.location.assign(to);
  }
}
