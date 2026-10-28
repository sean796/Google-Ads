import { describe, expect, it } from "vitest";
import { buildGridToEntityToSapWorkflowDraft } from "@/lib/workflow/templates/grid-to-entity-pages-workflow";

describe("buildGridToEntityToSapWorkflowDraft", () => {
  it("builds three chained agent steps: grid, entity generator, SAP", () => {
    const draft = buildGridToEntityToSapWorkflowDraft(1, "site-kwb");
    const agents = draft.nodes.filter((node) => node.kind === "action_agent");
    expect(agents).toHaveLength(3);

    expect((agents[0]?.config as { executionKind?: string }).executionKind).toBe(
      "local_dominator_export",
    );
    expect((agents[1]?.config as { executionKind?: string }).executionKind).toBe("entity_generator");
    expect((agents[2]?.config as { executionKind?: string }).executionKind).toBe("sap_generator");

    const entityConfig = agents[1]?.config as {
      executionPayload?: { gridInputSource?: string; ragInputKeys?: string[] };
      ragInputKeys?: string[];
    };
    expect(entityConfig.executionPayload?.gridInputSource).toBe("workflow");
    expect(entityConfig.ragInputKeys).toEqual(["local_dominator_export_1"]);

    const sapConfig = agents[2]?.config as {
      executionPayload?: { entityCsvInputSource?: string };
      ragInputKeys?: string[];
    };
    expect(sapConfig.executionPayload?.entityCsvInputSource).toBe("workflow");
    expect(sapConfig.ragInputKeys).toEqual(["entity_generator_2"]);
  });
});
