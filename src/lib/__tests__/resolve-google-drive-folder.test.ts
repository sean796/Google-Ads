import { describe, expect, it } from "vitest";
import {
  appendDriveDateSegments,
  formatDriveMonthSegment,
  formatDriveYearSegment,
  googleDriveDeliveryFolderIsMonthLeaf,
  googleDrivePurposeFolderLabel,
  inferGoogleDriveDeliveryPath,
  listDrivePurposeSelectOptions,
  normalizeCustomDrivePurposeName,
  presetPurposeValueFromName,
  rememberCustomDrivePurposePreset,
  resolveWorkflowDriveFolderPath,
  normalizeClientFolderName,
  driveFolderNamesMatch,
  driveLabelClientSegment,
  driveFolderBelongsToClient,
  pickExactDriveClientFolder,
  normalizeGoogleDriveTeamSettings,
  resolvePathSegments,
  resolvePurposeFolderName,
  defaultGoogleDriveTeamSettings,
  buildDeliverySubfolderSegments,
  driveFolderMonthLeafName,
  driveFolderDisplayName,
} from "@/lib/google-drive/google-drive-folder-hierarchy";
import {
  buildAutoDriveFolderSegments,
  extractFolderIdFromStepOutput,
  googleDriveFolderIsConfigured,
} from "@/lib/google-drive/resolve-google-drive-folder";
import { readConfiguredGoogleDriveTargetFolder } from "@/lib/automation-google-drive-delivery";
import type { WorkflowStepOutput } from "@/lib/workflow/workflow-types";

describe("google-drive-folder-hierarchy", () => {
  it("normalizes client folder name from site name", () => {
    expect(normalizeClientFolderName("Advanced Blinds")).toBe("Advanced Blinds");
  });

  it("resolves purpose aliases to canonical folder names", () => {
    expect(resolvePurposeFolderName("reporting")).toBe("Reporting");
    expect(resolvePurposeFolderName("audit")).toBe("Audits");
    expect(resolvePurposeFolderName("Audits/2026")).toBe("2026");
  });

  it("builds path segments from purpose input", () => {
    expect(resolvePathSegments("reporting")).toEqual(["Reporting"]);
    expect(resolvePathSegments("audit")).toEqual(["Audits"]);
  });

  it("normalizes team settings with defaults", () => {
    const settings = normalizeGoogleDriveTeamSettings({
      teamRootFolderId: "abc123456789",
      folderAliases: [{ key: "reporting", folderName: "GSC Reports", aliases: ["reporting"] }],
    });
    expect(settings.teamRootFolderId).toBe("abc123456789");
    expect(settings.folderAliases.find((item) => item.key === "reporting")?.folderName).toBe("GSC Reports");
  });

  it("defaults team shared drive root when unset", () => {
    expect(defaultGoogleDriveTeamSettings().teamRootFolderId).toBe("0AHAVAVW8TixdUk9PVA");
    expect(normalizeGoogleDriveTeamSettings({}).teamRootFolderId).toBe("0AHAVAVW8TixdUk9PVA");
  });

  it("reads the month leaf from a Drive path or log line", () => {
    expect(
      driveFolderMonthLeafName("NEO Pulse / Acme / Reporting / 2026 / September"),
    ).toBe("September");
    expect(
      driveFolderMonthLeafName(
        "Google Drive: resolving folder (NEO Pulse / Acme / Reporting / 2026 / September) · single",
      ),
    ).toBe("September");
    expect(driveFolderDisplayName("NEO Pulse / Acme / Reporting / 2026 / September")).toBe(
      "September",
    );
    expect(driveFolderDisplayName("Reporting")).toBe("Reporting");
  });

  it("appends current year and month after purpose segments", () => {
    const fixedDate = new Date("2026-08-20T18:00:00.000Z");
    expect(appendDriveDateSegments(["Reporting"], fixedDate)).toEqual(["Reporting", "2026", "August"]);
  });

  it("leaves explicit year and month segments unchanged", () => {
    const fixedDate = new Date("2026-08-20T18:00:00.000Z");
    expect(appendDriveDateSegments(["Reporting", "2026", "July"], fixedDate)).toEqual([
      "Reporting",
      "2026",
      "July",
    ]);
  });

  it("appends month when year segment is already present", () => {
    const fixedDate = new Date("2026-08-20T18:00:00.000Z");
    expect(appendDriveDateSegments(["Reporting", "2026"], fixedDate)).toEqual([
      "Reporting",
      "2026",
      "August",
    ]);
  });

  it("infers Drive folder from the workflow agent kind", () => {
    expect(inferGoogleDriveDeliveryPath("gsc_reporting")).toBe("reporting");
    expect(inferGoogleDriveDeliveryPath("ads_reporting")).toBe("reporting");
    expect(inferGoogleDriveDeliveryPath("chatgpt_website_audit")).toBe("audits");
    expect(inferGoogleDriveDeliveryPath("chatgpt_audit")).toBe("audits");
    expect(inferGoogleDriveDeliveryPath("dfs_llm_article_audit")).toBe("audits");
    expect(inferGoogleDriveDeliveryPath("local_dominator_export")).toBe("grids");
    expect(inferGoogleDriveDeliveryPath("content_optimizer")).toBe("reporting");
  });

  it("infers Drive folder from the deliverable name when the agent kind is missing", () => {
    expect(inferGoogleDriveDeliveryPath("", "site-audit.md")).toBe("audits");
    expect(inferGoogleDriveDeliveryPath(undefined, "grid-export.csv")).toBe("grids");
    expect(inferGoogleDriveDeliveryPath("", "gsc-report.md")).toBe("reporting");
  });

  it("keeps a manual Drive folder override and infers when the user did not pick one", () => {
    expect(
      resolveWorkflowDriveFolderPath(
        { googleDriveFolderPath: "reporting" },
        "chatgpt_website_audit",
      ),
    ).toBe("audits");
    expect(
      resolveWorkflowDriveFolderPath(
        { googleDriveFolderPath: "grids", googleDriveFolderPathManual: true },
        "gsc_reporting",
      ),
    ).toBe("grids");
    expect(
      resolveWorkflowDriveFolderPath(
        { googleDriveFolderPath: "grids", googleDriveFolderPathManual: false },
        "gsc_reporting",
      ),
    ).toBe("reporting");
    expect(
      resolveWorkflowDriveFolderPath(
        { googleDriveFolderPath: "PPC", googleDriveFolderPathManual: true },
        "ads_reporting",
      ),
    ).toBe("PPC");
  });

  it("keeps a custom purpose name and maps known aliases", () => {
    expect(normalizeCustomDrivePurposeName(" PPC / extra ")).toBe("PPC");
    expect(presetPurposeValueFromName("Reports")).toBe("reporting");
    expect(presetPurposeValueFromName("PPC")).toBeNull();
    expect(googleDrivePurposeFolderLabel("PPC")).toBe("PPC");
    expect(resolvePathSegments("PPC")).toEqual(["PPC"]);
    expect(rememberCustomDrivePurposePreset("PPC")).toBe("PPC");
    expect(listDrivePurposeSelectOptions("PPC").some((item) => item.value === "PPC")).toBe(true);
  });

  it("treats any purpose year month path as a delivery month folder", () => {
    expect(googleDriveDeliveryFolderIsMonthLeaf("NEO Pulse / Acme / Reporting / 2026 / September")).toBe(
      true,
    );
    expect(googleDriveDeliveryFolderIsMonthLeaf("NEO Pulse / Acme / PPC / 2026 / September")).toBe(true);
    expect(googleDriveDeliveryFolderIsMonthLeaf("NEO Pulse / Acme")).toBe(false);
    expect(googleDriveDeliveryFolderIsMonthLeaf("NEO Pulse / Acme / PPC")).toBe(false);
  });
});

describe("resolve-google-drive-folder helpers", () => {
  it("detects configured manual folder ids", () => {
    expect(
      googleDriveFolderIsConfigured({
        saveToGoogleDrive: true,
        googleDriveFolderId: "abc123456789",
      }),
    ).toBe(true);
  });

  it("detects configured path and client sources", () => {
    expect(
      googleDriveFolderIsConfigured(
        {
          saveToGoogleDrive: true,
          googleDriveFolderSource: "client_root",
        },
        "Acme Roofing",
      ),
    ).toBe(true);
    expect(
      googleDriveFolderIsConfigured({
        saveToGoogleDrive: true,
        googleDriveFolderSource: "path",
        googleDriveFolderPath: "reporting",
      }),
    ).toBe(true);
    expect(
      googleDriveFolderIsConfigured({
        saveToGoogleDrive: true,
        googleDriveFolderSource: "variable",
        googleDriveFolderVariable: "upstream_folder",
      }),
    ).toBe(true);
  });

  it("builds delivery subfolders as purpose, year, then month", () => {
    const fixedDate = new Date("2026-08-20T18:00:00.000Z");
    expect(buildDeliverySubfolderSegments(["Reporting"], fixedDate)).toEqual([
      "Reporting",
      "2026",
      "August",
    ]);
  });

  it("uses the selected year and month instead of the current calendar", () => {
    const fixedDate = new Date("2026-08-20T18:00:00.000Z");
    expect(
      buildDeliverySubfolderSegments(["Reporting"], fixedDate, {
        year: "2026",
        month: "September",
      }),
    ).toEqual(["Reporting", "2026", "September"]);
    expect(
      buildAutoDriveFolderSegments({
        siteName: "Advance Blinds",
        pathSegments: resolvePathSegments("reporting"),
        teamSettings: defaultGoogleDriveTeamSettings(),
        date: fixedDate,
        year: "2026",
        month: "September",
      }),
    ).toEqual(["Advance Blinds", "Reporting", "2026", "September"]);
  });

  it("builds auto folder segments from client and purpose path", () => {
    const settings = defaultGoogleDriveTeamSettings();
    const fixedDate = new Date("2026-08-20T18:00:00.000Z");
    expect(
      buildAutoDriveFolderSegments({
        siteName: "Acme Roofing",
        pathSegments: resolvePathSegments("reporting", settings.folderAliases),
        teamSettings: settings,
        date: fixedDate,
      }),
    ).toEqual(["Acme Roofing", "Reporting", "2026", "August"]);
  });

  it("builds client-only segments without year or month", () => {
    const settings = defaultGoogleDriveTeamSettings();
    expect(
      buildAutoDriveFolderSegments({
        siteName: "Acme Roofing",
        pathSegments: [],
        teamSettings: settings,
      }),
    ).toEqual(["Acme Roofing"]);
  });

  it("extracts folder ids from workflow outputs", () => {
    const output: WorkflowStepOutput = {
      id: 1,
      runId: 1,
      nodeId: "node-1",
      createdAt: "2026-01-01T00:00:00.000Z",
      variableKey: "upstream_folder",
      label: "Folder",
      scope: "run",
      textPreview: "https://drive.google.com/drive/folders/abc123456789",
      fileRefs: [],
    };
    expect(extractFolderIdFromStepOutput(output)).toBe("abc123456789");
  });

  it("matches the exact client folder name only", () => {
    expect(driveFolderNamesMatch("Ridgeline Solar", "ridgeline  solar")).toBe(true);
    expect(driveFolderNamesMatch("Ridgeline Solar", "Posh Outdoors")).toBe(false);
    expect(
      pickExactDriveClientFolder(
        [
          { folderId: "posh", name: "Posh Outdoors" },
          { folderId: "ridge", name: "Ridgeline Solar" },
        ],
        "Ridgeline Solar",
      )?.folderId,
    ).toBe("ridge");
    expect(
      pickExactDriveClientFolder([{ folderId: "posh", name: "Posh Outdoors" }], "Ridgeline Solar"),
    ).toBeNull();
  });

  it("reads the client segment from a Drive label", () => {
    expect(
      driveLabelClientSegment("NEO Pulse / Posh Outdoors / Audits / 2026 / September"),
    ).toBe("Posh Outdoors");
    expect(
      driveFolderBelongsToClient(
        "NEO Pulse / Posh Outdoors / Audits / 2026 / September",
        "Ridgeline Solar",
      ),
    ).toBe(false);
    expect(
      driveFolderBelongsToClient(
        "NEO Pulse / Ridgeline Solar / Reporting / 2026 / September",
        "Ridgeline Solar",
      ),
    ).toBe(true);
  });

  it("rejects a pinned folder that belongs to a different client", () => {
    expect(
      readConfiguredGoogleDriveTargetFolder(
        {
          googleDriveFolderSource: "manual",
          googleDriveTargetFolderId: "1zU3kOEwSwLDE59wWrxISPTJ4HIB00HPY",
          googleDriveFolderLabel: "NEO Pulse / Posh Outdoors / Audits / 2026 / September",
        },
        "Ridgeline Solar",
      ),
    ).toBeNull();
  });

  it("ignores pinned month folder ids unless the source is manual", () => {
    expect(
      readConfiguredGoogleDriveTargetFolder({
        googleDriveFolderSource: "path",
        googleDriveTargetFolderId: "1YrbOxNXBkYBp7GLGIUoSd07WGU8e0VEd",
        googleDriveFolderLabel: "NEO Pulse / Acme / Reporting / 2026 / August",
      }),
    ).toBeNull();
    expect(
      readConfiguredGoogleDriveTargetFolder({
        googleDriveFolderSource: "client_root",
        googleDriveTargetFolderId: "1YrbOxNXBkYBp7GLGIUoSd07WGU8e0VEd",
        googleDriveFolderLabel: "NEO Pulse / Acme / Reporting / 2026 / August",
      }),
    ).toBeNull();
    expect(
      readConfiguredGoogleDriveTargetFolder({
        googleDriveFolderSource: "manual",
        googleDriveTargetFolderId: "1YrbOxNXBkYBp7GLGIUoSd07WGU8e0VEd",
        googleDriveFolderLabel: "Custom folder",
      }),
    ).toEqual({
      folderId: "1YrbOxNXBkYBp7GLGIUoSd07WGU8e0VEd",
      label: "Custom folder",
      webViewLink: "https://drive.google.com/drive/folders/1YrbOxNXBkYBp7GLGIUoSd07WGU8e0VEd",
    });
  });
});
