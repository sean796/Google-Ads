import { describe, expect, it } from "vitest";
import { buildLocationSummary } from "@/lib/pulse-assist/app-module-catalog";
import { buildPropertiesContext, buildTeamContext } from "@/lib/pulse-assist/context";
import type { WordPressSite } from "@/components/integrations/types";
import { forgeContextFromPath } from "@/lib/pulse-assist/navigation";
import type { TeamSummary } from "@/lib/teams-types";
import type { TaskProject } from "@/lib/tasks-types";

function project(partial: Pick<TaskProject, "id" | "title" | "keyword" | "sortOrder">): TaskProject {
  return {
    teamId: 7,
    status: "active",
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    archivedAt: null,
    payload: {},
    description: "",
    ...partial,
  };
}

describe("buildTeamContext", () => {
  it("returns undefined without team", () => {
    expect(buildTeamContext({ team: null, teamMembers: [], taskProjects: [] })).toBeUndefined();
  });

  it("builds capped team context payload", () => {
    const team: TeamSummary = {
      id: 7,
      name: "Neo Digital Inc.",
      slug: "neo-digital",
      seatLimit: 10,
      seatsUsed: 3,
      accessRole: "owner",
      jobTitle: "Lead",
      permissions: {},
      createdAt: "2026-01-01",
    };
    const projects: TaskProject[] = Array.from({ length: 35 }, (_, i) =>
      project({
        id: i + 1,
        title: `Project ${i + 1}`,
        keyword: `project-${i + 1}`,
        sortOrder: i,
      }),
    );

    const ctx = buildTeamContext({
      team,
      teamMembers: [
        {
          userId: 42,
          email: "pio@example.com",
          displayName: "PIO",
          accessRole: "editor",
          jobTitle: "SEO Specialist",
          permissions: {},
          profile: {},
          joinedAt: "2026-01-01",
        },
      ],
      taskProjects: projects,
      activeTaskProjectId: 12,
      activeTaskProjectTitle: "Advance Blinds",
    });

    expect(ctx).toMatchObject({
      teamId: 7,
      teamName: "Neo Digital Inc.",
      activeProjectId: 12,
      activeProjectTitle: "Advance Blinds",
    });
    expect(ctx?.members).toHaveLength(1);
    expect(ctx?.members[0]?.userId).toBe(42);
    expect(ctx?.projects).toHaveLength(30);
  });

  it("infers active project from site display name when Tasks tab is closed", () => {
    const team: TeamSummary = {
      id: 1,
      name: "Neo Digital Inc.",
      slug: "neo-digital-inc",
      seatLimit: 10,
      seatsUsed: 1,
      accessRole: "owner",
      jobTitle: "",
      permissions: {},
      createdAt: "2026-01-01",
    };
    const projects: TaskProject[] = [
      project({ id: 1, title: "dsfasdf", keyword: "", sortOrder: 0 }),
      project({ id: 9, title: "Advance Blinds", keyword: "advance-blinds", sortOrder: 1 }),
    ];

    const ctx = buildTeamContext({
      team,
      teamMembers: [],
      taskProjects: projects,
      siteDisplayName: "Advance Blinds",
    });

    expect(ctx?.activeProjectId).toBe(9);
    expect(ctx?.activeProjectTitle).toBe("Advance Blinds");
  });
});

describe("buildPropertiesContext", () => {
  it("forwards the 10-digit Google Ads customer ID", () => {
    const site = {
      id: "site-1",
      name: "You Junk It",
      siteUrl: "https://example.com",
      username: "admin",
      appPassword: "x",
      connectedAt: 1,
      googleAdsCustomerId: "629-330-5294",
    } as WordPressSite;

    const ctx = buildPropertiesContext([site], "site-1");
    expect(ctx.activePropertyId).toBe("site-1");
    expect(ctx.properties[0]?.googleAdsCustomerId).toBe("6293305294");
  });
});

describe("buildPulseContext forge route", () => {
  it("adds forge section and workflow id from the path", () => {
    const forge = forgeContextFromPath("/pulse-forge/workflows/12");
    expect(forge.forgeSection).toBe("workflows");
    expect(forge.forgeWorkflowId).toBe(12);
    expect(buildLocationSummary({ managerTab: "pulse-forge", forgeSection: "workflows" })).toContain(
      "Workflows",
    );
  });
});
