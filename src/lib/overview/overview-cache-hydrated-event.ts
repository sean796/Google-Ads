export const NEO_PULSE_OVERVIEW_CACHE_HYDRATED_EVENT = "neo-pulse-overview-cache-hydrated";

export type OverviewCacheHydratedDetail = { siteId: string };

export function dispatchOverviewCacheHydrated(siteId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<OverviewCacheHydratedDetail>(NEO_PULSE_OVERVIEW_CACHE_HYDRATED_EVENT, {
      detail: { siteId },
    }),
  );
}
