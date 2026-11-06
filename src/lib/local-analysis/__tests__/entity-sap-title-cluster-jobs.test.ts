import { describe, expect, it, vi, afterEach } from "vitest";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import {
  buildEntityTitleClusterJobs,
  type EntityTitleClusterKeywordTarget,
} from "@/lib/local-analysis/entity-sap-title-cluster-jobs";
import {
  fillSapRowTitlesFromOpenRouter,
  isValidEntitySapTitle,
  resolveEntitySapPostTitle,
  resolveEntitySapTitleFromTemplate,
} from "@/lib/local-analysis/entity-sap-title-agent";

function sapRow(kw: string, entity: string): CSVRow {
  return { keyword: kw, entity, title: "", modifier: "", featuredImage: "google-maps" };
}

function isOpenRouterAppUrl(url: unknown): boolean {
  const u = String(url);
  return u.includes("/openrouter/chat-completion") || u.includes("chat/completions");
}

function appChatResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      content,
      raw: { choices: [{ message: { content } }] },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

describe("buildEntityTitleClusterJobs", () => {
  it("groups seed + members into one job with combined row indices", () => {
    const targets: EntityTitleClusterKeywordTarget[] = [
      { id: "s1", keyword: "custom shutters", entityHint: "Folsom, CA", sapPages: 0, clusterId: "c1", clusterRole: "seed" },
      { id: "m1", keyword: "blackout shades", entityHint: "", sapPages: 2, clusterId: "c1", clusterRole: "member" },
      { id: "m2", keyword: "motorized blinds", entityHint: "", sapPages: 1, clusterId: "c1", clusterRole: "member" },
    ];
    const sapRows = [
      sapRow("blackout shades", "Old Town, Folsom, CA"),
      sapRow("blackout shades", "Historic, Folsom, CA"),
      sapRow("motorized blinds", "Russell Ranch, Folsom, CA"),
    ];
    const jobs = buildEntityTitleClusterJobs(targets, sapRows, 50);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.seedKeyword).toBe("custom shutters");
    expect(jobs[0]!.rowIndices).toEqual([0, 1, 2]);
  });

  it("creates separate jobs for two lone seeds", () => {
    const targets: EntityTitleClusterKeywordTarget[] = [
      { id: "a", keyword: "Hunter Douglas blinds", entityHint: "", sapPages: 2, clusterRole: "seed", clusterId: "ca" },
      { id: "b", keyword: "custom shutters", entityHint: "", sapPages: 1, clusterRole: "seed", clusterId: "cb" },
    ];
    const sapRows = [
      sapRow("Hunter Douglas blinds", "Folsom Lake, Folsom, CA"),
      sapRow("Hunter Douglas blinds", "Old Town, Folsom, CA"),
      sapRow("custom shutters", "Rancho Cordova, CA"),
    ];
    const jobs = buildEntityTitleClusterJobs(targets, sapRows, 50);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]!.rowIndices).toEqual([0, 1]);
    expect(jobs[1]!.rowIndices).toEqual([2]);
  });
});

describe("fillSapRowTitlesFromOpenRouter", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls OpenRouter once with all rows in one JSON batch", async () => {
    let openRouterCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        if (isOpenRouterAppUrl(url)) {
          openRouterCalls += 1;
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            messages?: Array<{ role: string; content: string }>;
          };
          const user = body.messages?.find((m) => m.role === "user")?.content ?? "";
          const payload = JSON.parse(user) as {
            rows: Array<{ keyword: string; entity: string; path: string }>;
            gridLocations: string[];
          };
          return appChatResponse(
            JSON.stringify({
              titles: payload.rows.map((r) => `Custom Blinds in ${r.entity}`),
            }),
          );
        }
        return new Response("", { status: 500 });
      }),
    );

    const rows = [
      { ...sapRow("custom blinds", "A, City, CA"), target_slug: "custom-blinds-a-city-ca" },
      { ...sapRow("custom blinds", "B, City, CA"), target_slug: "custom-blinds-b-city-ca" },
    ];
    const filled = await fillSapRowTitlesFromOpenRouter(rows, {
      apiKey: "test-key",
      model: "google/gemini-2.5-flash-lite",
      siteName: "",
      gridLocations: ["Winkler, MB"],
    });

    expect(openRouterCalls).toBe(1);
    expect(filled[0]!.title).toBe("Custom Blinds In A, City");
    expect(filled[1]!.title).toBe("Custom Blinds In B, City");
  });

  it("retries the batch until all titles are returned", async () => {
    let openRouterCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url) => {
        if (!isOpenRouterAppUrl(url)) {
          return new Response("", { status: 500 });
        }
        openRouterCalls += 1;
        if (openRouterCalls === 1) {
          return new Response(JSON.stringify({ ok: false, error: "rate limit" }), {
            status: 429,
            headers: { "Content-Type": "application/json" },
          });
        }
        return appChatResponse(
          JSON.stringify({
            titles: ["Title in A, City, CA", "Title in B, City, CA"],
          }),
        );
      }),
    );

    const rows = [sapRow("custom blinds", "A, City, CA"), sapRow("custom blinds", "B, City, CA")];
    const filled = await fillSapRowTitlesFromOpenRouter(rows, {
      apiKey: "test-key",
      model: "google/gemini-2.5-flash-lite",
      siteName: "",
      gridLocations: ["Winkler, MB"],
    });

    expect(openRouterCalls).toBe(2);
    expect(filled.every((r) => r.title?.trim())).toBe(true);
    expect(filled[0]!.title).toBe("Custom Blinds Near A, City");
  });

  it("calls OpenRouter when forceRewrite is true even if title is prefilled", async () => {
    let openRouterCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, init) => {
        if (isOpenRouterAppUrl(url)) {
          openRouterCalls += 1;
          const body = JSON.parse(String(init?.body ?? "{}")) as {
            messages?: Array<{ role: string; content: string }>;
          };
          const user = body.messages?.find((m) => m.role === "user")?.content ?? "";
          const payload = JSON.parse(user) as {
            rows: Array<{ keyword: string; entity: string }>;
            titleTemplate?: string;
          };
          expect(payload.titleTemplate).toBe("{keyword} Near {entity}");
          return appChatResponse(
            JSON.stringify({
              titles: payload.rows.map((r) => `Advanced Window Coverings Near ${r.entity}`),
            }),
          );
        }
        return new Response("", { status: 500 });
      }),
    );

    const rows = [
      {
        ...sapRow("advanced window coverings", "Plum Coulee, MB"),
        title: "Advanced Window Coverings Plum Coulee: Advanced Window Coverings In Plum Coulee",
      },
    ];
    const filled = await fillSapRowTitlesFromOpenRouter(rows, {
      apiKey: "test-key",
      model: "google/gemini-2.5-flash-lite",
      siteName: "",
      gridLocations: ["Plum Coulee, MB"],
      titleTemplate: "{keyword} Near {entity}",
      forceRewrite: true,
    });

    expect(openRouterCalls).toBe(1);
    expect(filled[0]!.title).toBe("Advanced Window Coverings Near Plum Coulee, Mb");
    expect(filled[0]!.title).not.toContain(":");
  });

  it("falls back to titleTemplate when agent returns colon titles", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        appChatResponse(
          JSON.stringify({
            titles: [
              "Advanced Window Coverings Plum Coulee: Advanced Window Coverings In Plum Coulee",
            ],
          }),
        ),
      ),
    );

    const filled = await fillSapRowTitlesFromOpenRouter(
      [sapRow("advanced window coverings", "Plum Coulee, MB")],
      {
        apiKey: "test-key",
        model: "google/gemini-2.5-flash-lite",
        siteName: "",
        gridLocations: ["Plum Coulee, MB"],
        titleTemplate: "{keyword} Near {entity}",
      },
    );

    expect(filled[0]!.title).toBe("Advanced Window Coverings Near Plum Coulee, Mb");
    expect(filled[0]!.title).not.toContain(":");
  });
});

describe("entity SAP title helpers", () => {
  it("rejects colon titles in validation", () => {
    expect(
      isValidEntitySapTitle(
        "Advanced Window Coverings Plum Coulee: Advanced Window Coverings In Plum Coulee",
        "advanced window coverings",
        "Plum Coulee, MB",
      ),
    ).toBe(false);
  });

  it("resolveEntitySapTitleFromTemplate applies keyword Near entity pattern", () => {
    expect(
      resolveEntitySapTitleFromTemplate("advanced window coverings", "Plum Coulee, MB"),
    ).toBe("Advanced Window Coverings Near Plum Coulee, Mb");
  });

  it("resolveEntitySapPostTitle prefers valid existing title", () => {
    expect(
      resolveEntitySapPostTitle(
        "advanced window coverings",
        "Plum Coulee, MB",
        "Advanced Window Coverings Near Plum Coulee, MB",
      ),
    ).toBe("Advanced Window Coverings Near Plum Coulee, Mb");
  });

  it("resolveEntitySapPostTitle replaces invalid colon title with template", () => {
    expect(
      resolveEntitySapPostTitle(
        "advanced window coverings",
        "Plum Coulee, MB",
        "Advanced Window Coverings Plum Coulee: Advanced Window Coverings In Plum Coulee",
      ),
    ).toBe("Advanced Window Coverings Near Plum Coulee, Mb");
  });
});
