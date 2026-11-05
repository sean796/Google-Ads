import type { WordPressSite } from "@/components/integrations/types";
import { siteHostLabel } from "./wp-engine-install-defaults";

/** First hostname label (www stripped) -> canonical Benchmark category tag for portfolio properties. */
export const BENCHMARK_CATEGORY_TAG_BY_HOST_LABEL: Record<string, string> = {
  advanceblindsanddrapery: "Window treatments",
  blindmagic: "Window treatments",
  blindmagic1stg: "Window treatments",
  blindswest: "Window treatments",
  dminteriorsanddesign: "Window treatments",
  eliteshadings: "Window treatments",
  intheshadeflorida: "Window treatments",
  interiorsbylaura: "Interior design",
  kwbllp: "Accounting",
  lindseyblindsetc: "Window treatments",
  neodigital: "Digital marketing",
  phoenixpainting: "Painting",
  "posh-outdoors": "Outdoor living",
  shutterspot: "Window treatments",
  superiorblinds: "Window treatments",
  superiortentrentals: "Event rentals",
  tailoredinteriors: "Interior design",
  youjunkit: "Waste removal",
};

/** Fill Benchmark category tag for known client hosts; never overwrites an existing tag. */
export function applyBenchmarkCategoryTagDefaults(site: WordPressSite): WordPressSite {
  if (site.benchmarkCustomTag?.trim()) return site;
  const tag = BENCHMARK_CATEGORY_TAG_BY_HOST_LABEL[siteHostLabel(site)];
  if (!tag) return site;
  return { ...site, benchmarkCustomTag: tag };
}
