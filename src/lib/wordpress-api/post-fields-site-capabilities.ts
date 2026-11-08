import type { WordPressSite } from "@/components/integrations/types";

export function siteHasNeoPulseWp(site: WordPressSite | null | undefined): boolean {
  if (!site) return false;
  if (site.capabilities?.hasNeoPulseWp === true) return true;
  return site.capabilities?.fieldsBackend === "neo_pulse_fields";
}
