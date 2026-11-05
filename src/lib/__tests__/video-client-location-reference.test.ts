import { describe, expect, it } from "vitest";
import {
  applyReferenceStillsFlythroughPlan,
  referenceStillSceneId,
} from "@/lib/video-generator/video-director-agent";
import {
  assertReferenceStillsSceneCount,
  isReferenceStillsFlythrough,
  isReferenceStillsFlythroughBrief,
  sceneBeatReferenceDataUrls,
  sceneBeatReferenceFileName,
  splitReferenceStillDurations,
} from "@/lib/video-generator/video-client-location-reference";
import type { VideoBrief, VideoPlan, VideoScenePlan } from "@/lib/video-generator/video-generator-types";

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

describe("reference stills fly-through helpers", () => {
  it("detects brief without product lock", () => {
    expect(
      isReferenceStillsFlythroughBrief({
        references: [{ fileName: "01.jpg" } as never],
        productSpec: null,
        subject: null,
      }),
    ).toBe(true);
    expect(
      isReferenceStillsFlythroughBrief({
        references: [{ fileName: "01.jpg" } as never],
        productSpec: { name: "X" } as never,
        subject: null,
      }),
    ).toBe(false);
  });

  it("referenceStillSceneId does not stack still_XX_ prefixes", () => {
    expect(referenceStillSceneId(8, "color_wall_final_hold")).toBe("still_08_color_wall_final_hold");
    expect(referenceStillSceneId(8, "still_08_color_wall_final_hold")).toBe("still_08_color_wall_final_hold");
    expect(referenceStillSceneId(8, "still_08_still_08_color_wall_final_hold")).toBe(
      "still_08_color_wall_final_hold",
    );
  });

  it("assigns unique scene ids when Director reuses anchor ids", () => {
    const brief: VideoBrief = {
      prompt: "fly-through",
      lengthSeconds: 12,
      aspect: "16:9",
      resolution: "720p",
      references: [
        { fileName: "01.jpg", dataUrl: "data:image/jpeg;base64,aa" } as never,
        { fileName: "02.jpg", dataUrl: "data:image/jpeg;base64,bb" } as never,
        { fileName: "03.jpg", dataUrl: "data:image/jpeg;base64,cc" } as never,
      ],
      subject: null,
    };
    const dupId = "alendel_sample_shelves";
    const plan: VideoPlan = {
      title: "Test",
      logline: "",
      continuity: {
        heroSubject: "Room",
        screenDirection: "left_to_right",
        cameraSide: "center",
        palette: "neutral",
        lightArc: "even",
      },
      voice: "none",
      scenes: [
        { ...baseScene, id: dupId, order: 1, referenceIndexes: [1] },
        { ...baseScene, id: dupId, order: 2, referenceIndexes: [3] },
      ],
    };
    const out = applyReferenceStillsFlythroughPlan(plan, brief);
    const ids = out.scenes.map((s) => s.id);
    expect(new Set(ids).size).toBe(3);
    expect(ids[0]).toBe(`still_01_${dupId}`);
    expect(ids[2]).toBe(`still_03_${dupId}`);
  });

  it("normalizes plan to scene N -> referenceIndexes [N]", () => {
    const brief: VideoBrief = {
      prompt: "fly-through",
      lengthSeconds: 30,
      aspect: "16:9",
      resolution: "720p",
      references: [
        { fileName: "01.jpg", dataUrl: "data:image/jpeg;base64,aa" } as never,
        { fileName: "02.jpg", dataUrl: "data:image/jpeg;base64,bb" } as never,
      ],
      subject: null,
    };
    const plan: VideoPlan = {
      title: "Test",
      logline: "",
      continuity: {
        heroSubject: "Room",
        screenDirection: "left_to_right",
        cameraSide: "center",
        palette: "neutral",
        lightArc: "even",
      },
      voice: "none",
      scenes: [
        { ...baseScene, id: "a", order: 1, referenceIndexes: [] },
        { ...baseScene, id: "b", order: 2, referenceIndexes: [99] },
      ],
    };
    const out = applyReferenceStillsFlythroughPlan(plan, brief);
    expect(out.referenceStillsFlythrough).toBe(true);
    expect(out.scenes[0].referenceIndexes).toEqual([1]);
    expect(out.scenes[1].referenceIndexes).toEqual([2]);
    expect(out.scenes[0].storyboardPrompt).toContain("Image 1");
    expect(out.scenes[1].storyboardPrompt).toContain("Image 2");
  });

  it("splitReferenceStillDurations splits 90 s across 22 stills", () => {
    const { durations, totalSeconds } = splitReferenceStillDurations(90, 22);
    expect(durations).toHaveLength(22);
    expect(totalSeconds).toBe(90);
    expect(durations.reduce((a, b) => a + b, 0)).toBe(90);
    expect(Math.min(...durations)).toBeGreaterThanOrEqual(4);
    expect(Math.max(...durations)).toBeLessThanOrEqual(15);
  });

  it("splitReferenceStillDurations raises short targets to fit every still", () => {
    const { durations, totalSeconds } = splitReferenceStillDurations(30, 22);
    expect(totalSeconds).toBe(88);
    expect(durations.reduce((a, b) => a + b, 0)).toBe(88);
  });

  it("expands Director plan to one scene per upload", () => {
    const refs = Array.from({ length: 22 }, (_, i) => ({
      fileName: `${String(i + 1).padStart(2, "0")}.jpg`,
      dataUrl: `data:image/jpeg;base64,${i}`,
    })) as VideoBrief["references"];
    const brief: VideoBrief = {
      prompt: "drone fly-through",
      lengthSeconds: 90,
      aspect: "16:9",
      resolution: "720p",
      references: refs,
      subject: null,
    };
    const plan: VideoPlan = {
      title: "Blind Magic Showroom Fly-Through",
      logline: "",
      continuity: {
        heroSubject: "Showroom",
        screenDirection: "left_to_right",
        cameraSide: "center",
        palette: "neutral",
        lightArc: "even",
      },
      voice: "none",
      scenes: [
        { ...baseScene, id: "a", order: 1, referenceIndexes: [1], durationSeconds: 15 },
        { ...baseScene, id: "b", order: 2, referenceIndexes: [9], durationSeconds: 15 },
        { ...baseScene, id: "c", order: 3, referenceIndexes: [12], durationSeconds: 15 },
        { ...baseScene, id: "d", order: 4, referenceIndexes: [18], durationSeconds: 15 },
        { ...baseScene, id: "e", order: 5, referenceIndexes: [20], durationSeconds: 15 },
        { ...baseScene, id: "f", order: 6, referenceIndexes: [22], durationSeconds: 15 },
      ],
    };
    const out = applyReferenceStillsFlythroughPlan(plan, brief);
    expect(out.scenes).toHaveLength(22);
    const ids = out.scenes.map((s) => s.id);
    expect(new Set(ids).size).toBe(22);
    expect(out.scenes.map((s) => s.referenceIndexes[0])).toEqual(Array.from({ length: 22 }, (_, i) => i + 1));
    expect(out.scenes.reduce((sum, s) => sum + s.durationSeconds, 0)).toBe(90);
    expect(out.scenes[8].title).toBe(baseScene.title);
    assertReferenceStillsSceneCount(out, 22);
    const expandedAgain = applyReferenceStillsFlythroughPlan(out, brief);
    expect(expandedAgain.scenes.map((s) => s.id)).toEqual(out.scenes.map((s) => s.id));
  });

  it("assertReferenceStillsSceneCount throws on mismatch", () => {
    expect(() =>
      assertReferenceStillsSceneCount(
        {
          title: "T",
          logline: "",
          continuity: {
            heroSubject: "",
            screenDirection: "left_to_right",
            cameraSide: "",
            palette: "",
            lightArc: "",
          },
          voice: "none",
          referenceStillsFlythrough: true,
          scenes: [baseScene, { ...baseScene, id: "s2", order: 2 }],
        },
        3,
      ),
    ).toThrow(/one scene per uploaded image/i);
  });

  it("sceneBeatReferenceFileName uses brief upload name", () => {
    const name = sceneBeatReferenceFileName(
      { ...baseScene, referenceIndexes: [1] },
      [{ fileName: "01.jpg", dataUrl: "data:image/jpeg;base64,x" } as never],
    );
    expect(name).toBe("01.jpg");
  });

  it("isReferenceStillsFlythrough combines brief and plan", () => {
    const brief = {
      references: [{ fileName: "01.jpg" } as never],
      productSpec: null,
      subject: null,
    };
    const plan: VideoPlan = {
      title: "T",
      logline: "",
      continuity: {
        heroSubject: "",
        screenDirection: "left_to_right",
        cameraSide: "",
        palette: "",
        lightArc: "",
      },
      voice: "none",
      referenceStillsFlythrough: true,
      scenes: [baseScene],
    };
    expect(isReferenceStillsFlythrough(brief, plan)).toBe(true);
  });
});
