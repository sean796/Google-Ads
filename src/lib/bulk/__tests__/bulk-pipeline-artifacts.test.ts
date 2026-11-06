import { describe, expect, it } from "vitest";
import { BulkFileManager } from "@/lib/bulk-file-manager";
import { buildBulkSelectedKeywordArtifactPayload } from "@/lib/bulk-auto-generate";
import {
  resolvePipelineSectionDownloadable,
} from "@/components/shared/bulk-details-tile-sections-helpers";

describe("bulk pipeline artifact filenames", () => {
  const rowData = {
    keyword: "smart blinds edmonton",
    title: "Smart Blinds Edmonton",
    entity: "Edmonton",
  };

  it("generates selected-keyword artifact name", () => {
    const ts = 1788537869792;
    expect(BulkFileManager.generateFileName(rowData, "selected_keyword", ts)).toBe(
      "selected-keyword-Smart-Blinds-Edmonton-1788537869792.json",
    );
  });

  it("builds selected-keyword JSON contract", () => {
    const json = buildBulkSelectedKeywordArtifactPayload(
      "smart blinds edmonton",
      ["smart blinds edmonton", "motorized blinds"],
      ["How much do smart blinds cost?"],
    );
    const parsed = JSON.parse(json) as {
      primaryKeyword: string;
      selectedKeywords: string[];
      selectedPeopleAlsoAsk: string[];
      generatedAt: string;
    };
    expect(parsed.primaryKeyword).toBe("smart blinds edmonton");
    expect(parsed.selectedKeywords).toEqual(["smart blinds edmonton", "motorized blinds"]);
    expect(parsed.selectedPeopleAlsoAsk).toEqual(["How much do smart blinds cost?"]);
    expect(parsed.generatedAt).toBeTruthy();
  });
});

describe("bulk pipeline download linking", () => {
  it("enables Selected keyword when artifact exists under requireDoneStatus", () => {
    const file = {
      name: "selected-keyword-smart-blinds-edmonton-1788537869792.json",
      content: "{}",
      mimeType: "application/json",
    };
    const waiting = { sectionIndex: 1, title: "Selected keyword", status: "waiting" as const };
    expect(
      resolvePipelineSectionDownloadable(waiting, 1, [file], new Set(), null, {
        noFallback: true,
        requireDoneStatus: true,
      })?.name,
    ).toBe(file.name);
  });

  it("enables Google Image when maps file exists", () => {
    const file = {
      name: "edmonton-google-maps.jpg",
      content: "data:image/jpeg;base64,abc",
      mimeType: "image/jpeg",
    };
    const waiting = { sectionIndex: 0, title: "Google Image", status: "waiting" as const };
    expect(
      resolvePipelineSectionDownloadable(waiting, 0, [file], new Set(), null, {
        noFallback: true,
        requireDoneStatus: true,
      })?.name,
    ).toBe(file.name);
  });

  it("enables WordPress upload from wordpress.json", () => {
    const file = {
      name: "wordpress.json",
      content: '{"success":true,"postId":42}',
      mimeType: "application/json",
    };
    const waiting = { sectionIndex: 16, title: "WordPress upload", status: "waiting" as const };
    expect(
      resolvePipelineSectionDownloadable(waiting, 16, [file], new Set(), null, {
        noFallback: true,
        requireDoneStatus: true,
      })?.name,
    ).toBe(file.name);
  });

  it("prefers content html for Post content step", () => {
    const html = {
      name: "content-smart-blinds-edmonton-123.html",
      content: "<h2>Intro</h2>",
      mimeType: "text/html",
    };
    const md = {
      name: "content-smart-blinds-edmonton-123.md",
      content: "## Intro",
      mimeType: "text/markdown",
    };
    const waiting = { sectionIndex: 10, title: "Post content", status: "done" as const };
    expect(
      resolvePipelineSectionDownloadable(waiting, 10, [md, html], new Set(), null, {
        noFallback: true,
        requireDoneStatus: true,
      })?.name,
    ).toBe(html.name);
  });
});
