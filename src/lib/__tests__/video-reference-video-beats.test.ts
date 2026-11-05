import { describe, expect, it } from "vitest";
import { extractReferenceVideoBeatsTimes } from "@/components/video-generator/useVideoGenerator";
import type { VideoPlan } from "@/lib/video-generator/video-generator-types";

describe("Reference Video Beat Extraction", () => {
  it("calculates proportional timestamp splits across scenes matching reference video duration", () => {
    const plan: VideoPlan = {
      title: "Industrial Walkthrough",
      logline: "Factory Tour",
      continuity: {
        heroSubject: "Warehouse",
        screenDirection: "left_to_right",
        cameraSide: "center",
        palette: "industrial",
        lightArc: "day",
      },
      voice: "none",
      fadeInSeconds: 0,
      fadeOutSeconds: 0,
      audio: { backingTrack: "none" },
      scenes: [
        { id: "s1", order: 1, title: "Exterior Approach", durationSeconds: 6, sceneInstructions: "", storyboardPrompt: "", motionPrompt: "", continuityNotes: "", narration: "", referenceIndexes: [] },
        { id: "s2", order: 2, title: "Initial Interior", durationSeconds: 6, sceneInstructions: "", storyboardPrompt: "", motionPrompt: "", continuityNotes: "", narration: "", referenceIndexes: [] },
        { id: "s3", order: 3, title: "Complex Area", durationSeconds: 6, sceneInstructions: "", storyboardPrompt: "", motionPrompt: "", continuityNotes: "", narration: "", referenceIndexes: [] },
        { id: "s4", order: 4, title: "Assembly Bay", durationSeconds: 6, sceneInstructions: "", storyboardPrompt: "", motionPrompt: "", continuityNotes: "", narration: "", referenceIndexes: [] },
        { id: "s5", order: 5, title: "Final Process", durationSeconds: 6, sceneInstructions: "", storyboardPrompt: "", motionPrompt: "", continuityNotes: "", narration: "", referenceIndexes: [] },
      ],
    };

    // 84 second source video mapped across a 30s plan
    const times = extractReferenceVideoBeatsTimes(plan, 84);
    expect(times).toHaveLength(5);
    expect(times[0]).toBe(0);
    expect(times[1]).toBe(16.8);
    expect(times[2]).toBe(33.6);
    expect(times[3]).toBe(50.4);
    expect(times[4]).toBe(67.2);
  });
});
