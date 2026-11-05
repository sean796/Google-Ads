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

  it("extracts valid plan when reasoning contains an incomplete JSON scratchpad before the final code block", () => {
    const rawWithThoughts = `
I'm thinking about the scenes:
\`\`\`json
{
  "title": "Incomplete thought",
  "scenes": [
    { "id": "incomplete"
\`\`\`

Here is the final verified plan:
\`\`\`json
{
  "title": "Blind Magic Showroom Flythrough",
  "logline": "Showroom flythrough.",
  "voice": "none",
  "continuity": {
    "heroSubject": "Showroom",
    "screenDirection": "left_to_right",
    "cameraSide": "center",
    "palette": "clean",
    "lightArc": "daylight"
  },
  "scenes": [
    {
      "id": "exterior_approach",
      "order": 1,
      "title": "Approaching Showroom",
      "durationSeconds": 15,
      "sceneInstructions": "Smooth fly-through approach.",
      "environmentId": "exterior",
      "environmentPrompt": "Showroom front.",
      "storyboardPrompt": "Wide establishing angle.",
      "motionPrompt": "Smooth push-in.",
      "continuityNotes": "Clean architecture.",
      "narration": "",
      "referenceIndexes": [],
      "transitionIn": null
    }
  ]
}
\`\`\`
    `;

    const plan = parseVideoPlan(rawWithThoughts, 15, 0);
    expect(plan.title).toBe("Blind Magic Showroom Flythrough");
    expect(plan.scenes.length).toBe(1);
    expect(plan.scenes[0].id).toBe("exterior_approach");
  });
});

