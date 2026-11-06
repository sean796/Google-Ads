import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getAllApiDocSlugs, loadAllApiDocArticles, apiDocsManifest } from "@/lib/api-docs";

const DISPATCHER = readFileSync(
  resolve("wordpress-plugins/neo-pulse-app/includes/router/class-api-dispatcher.php"),
  "utf8",
);

const DISPATCHER_MARKERS = [
  "Neo_Pulse_App_Wp_Route_Handlers::handle",
  "Neo_Pulse_App_Gsc_Route_Handlers::dispatch_http",
  "Neo_Pulse_App_Auth_Route_Handlers::dispatch",
  "Neo_Pulse_App_Teams_Route_Handlers::dispatch",
  "Neo_Pulse_App_Dataforseo_Route_Handlers::dispatch_http",
  "Neo_Pulse_App_Entity_Maps_Image::generate",
];

describe("api docs manifest", () => {
  // Sequentially imports every docs/api markdown module; needs more than the
  // default 5s when the full suite saturates CPU.
  it("loads articles for every manifest slug", { timeout: 30_000 }, async () => {
    await loadAllApiDocArticles();
    const slugs = new Set(getAllApiDocSlugs());
    for (const section of apiDocsManifest.sections) {
      for (const item of section.items) {
        expect(slugs.has(item.slug), `missing article: ${item.slug}`).toBe(true);
      }
    }
  });

  it("documents at least as many routes as the generator reported", () => {
    expect(apiDocsManifest.routeCount).toBeGreaterThan(100);
    const endpointItems = apiDocsManifest.sections
      .flatMap((s) => s.items)
      .filter((i) => i.path);
    expect(endpointItems.length).toBeGreaterThanOrEqual(apiDocsManifest.routeCount);
  });

  it("dispatcher handlers remain represented in docs generation sources", () => {
    for (const marker of DISPATCHER_MARKERS) {
      expect(DISPATCHER.includes(marker), marker).toBe(true);
    }
  });
});
