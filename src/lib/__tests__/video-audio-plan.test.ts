import { describe, expect, it } from "vitest";
import { parseVideoPlan } from "@/lib/video-generator/video-director-agent";
import { parseVideoPlanAudio } from "@/lib/video-generator/video-audio-plan";

describe("parseVideoPlanAudio", () => {
  it("requires backingTrackPrompt when generated", () => {
    expect(() => parseVideoPlanAudio({ backingTrack: "generated" })).toThrow(/backingTrackPrompt/);
  });

  it("accepts generated with prompt", () => {
    expect(parseVideoPlanAudio({ backingTrack: "generated", backingTrackPrompt: "Warm piano, 90 BPM" })).toEqual({
      backingTrack: "generated",
      backingTrackPrompt: "Warm piano, 90 BPM",
    });
  });
});

describe("parseVideoPlan audio field", () => {
  it("defaults audio to none when omitted", () => {
    const raw = JSON.stringify({
      title: "T",
      logline: "L",
      voice: "none",
      continuity: {
        heroSubject: "X",
        screenDirection: "left_to_right",
        cameraSide: "north",
        palette: "neutral",
        lightArc: "day",
      },
      scenes: [
        {
          id: "s1",
          order: 1,
          title: "One",
          durationSeconds: 15,
          sceneInstructions: "Beat.",
          environmentId: "room",
          environmentPrompt: "Empty room.",
          storyboardPrompt: "Wide.",
          motionPrompt: "Dolly in.",
          continuityNotes: "",
          narration: "",
          referenceIndexes: [],
          transitionIn: null,
        },
      ],
    });
    const plan = parseVideoPlan(raw, 15, 0);
    expect(plan.audio).toEqual({ backingTrack: "none" });
  });
});
