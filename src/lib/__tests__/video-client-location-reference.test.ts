import { describe, expect, it } from "vitest";
import { sceneBeatReferenceDataUrls } from "@/lib/video-generator/video-client-location-reference";
import type { VideoScenePlan } from "@/lib/video-generator/video-generator-types";

const baseScene: VideoScenePlan = {
  id: "s1",
  order: 1,
  title: "Exterior",
  durationSeconds: 6,
  sceneInstructions: "",
  storyboardPrompt: "",
  motionPrompt: "",
  continuityNotes: "",
  narration: "",
  referenceIndexes: [2],
};

describe("sceneBeatReferenceDataUrls", () => {
  it("prefers Post-Cut reference over brief referenceIndexes", () => {
    const urls = sceneBeatReferenceDataUrls(
      {
        ...baseScene,
        postCutReferenceDataUrl: "data:image/png;base64,abc",
        postCutReferenceFileName: "storefront.jpg",
      },
      [{ dataUrl: "data:image/png;base64,brief" } as never],
    );
    expect(urls).toEqual(["data:image/png;base64,abc"]);
  });

  it("falls back to brief referenceIndexes", () => {
    const urls = sceneBeatReferenceDataUrls(baseScene, [
      { dataUrl: "data:image/png;base64,one" } as never,
      { dataUrl: "data:image/png;base64,two" } as never,
    ]);
    expect(urls).toEqual(["data:image/png;base64,two"]);
  });
});
