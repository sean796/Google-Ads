import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VideoWorkspaceHeader } from "@/components/video-generator/VideoWorkspaceHeader";
import { DEFAULT_VIDEO_MODEL } from "@/lib/video-generator/video-model-defaults";

const noop = () => {};

describe("VideoWorkspaceHeader", () => {
  it("shows File and Settings menus without duplicating model name in idle status", () => {
    const modelLabel = "Grok Imagine Video 1.5 Lite";
    const costLabel = "~$0.42 for 30 s at 720p";
    const html = renderToStaticMarkup(
      React.createElement(VideoWorkspaceHeader, {
        step: "brief",
        maxStep: "render",
        onStepChange: noop,
        brief: {
          prompt: "",
          lengthSeconds: 30,
          aspect: "16:9",
          resolution: "720p",
          references: [],
        },
        videoModel: DEFAULT_VIDEO_MODEL,
        onVideoModelChange: noop,
        modelLabel,
        costLabel,
        working: false,
        status: "",
        plan: null,
        frames: [],
        render: null,
        renderActive: false,
        primaryAction: {
          label: "Generate product views",
          onClick: noop,
          disabled: false,
        },
        onLengthChange: noop,
        onAspectChange: noop,
        onResolutionChange: noop,
        onRegeneratePlan: noop,
        onRestitch: noop,
        onExportJson: noop,
        onImportJson: noop,
        onExportZip: noop,
        onReset: noop,
      }),
    );

    expect(html).toContain("File");
    expect(html).toContain("Settings");
    expect(html).toContain(costLabel);
    const modelOccurrences = html.split(modelLabel).length - 1;
    expect(modelOccurrences).toBeLessThanOrEqual(1);
  });
});
