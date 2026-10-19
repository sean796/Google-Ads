import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  PRODUCT_VIEW_DEFINITIONS,
  formatProductSpecPromptBlock,
  generateProductView,
  initialProductViews,
  parseProductSpec,
} from "@/lib/video-generator/video-product-agent";
import {
  briefBlock,
  integerSceneSplits,
  parseScene,
  parseTransition,
  parseVideoPlan,
} from "@/lib/video-generator/video-director-agent";
import { runVideoDirectorReviseScene } from "@/lib/video-generator/video-director-revise";
import * as imageApi from "@/lib/image-api";
import {
  generateEnvironmentPlate,
  generateStoryboardFrame,
  resolveProductAnchorForScene,
} from "@/lib/video-generator/video-storyboard-agent";
import {
  DEFAULT_VIDEO_MODEL,
  defaultResolutionForVideoModel,
} from "@/lib/video-generator/video-model-defaults";
import { writeSceneVideoPrompt } from "@/lib/video-generator/video-cinematographer-agent";
import {
  exportVideoProjectZip,
  parseVideoProjectJson,
  rerenderVideoScene,
  restitchVideoRender,
  saveVideoProject,
  serializeVideoProjectJson,
} from "@/lib/video-generator/video-render-api";
import { VideoStagePanel } from "@/components/video-generator/VideoStagePanel";
import { VideoTimelineDock } from "@/components/video-generator/VideoTimelineDock";
import { VideoPostCutPanel } from "@/components/video-generator/VideoPostCutPanel";
import { VideoProjectsPanel } from "@/components/video-generator/VideoProjectsPanel";
import type { ProductSpec, VideoBrief, VideoPlan, VideoProjectSnapshot } from "@/lib/video-generator/video-generator-types";

const callAgentCategoryOpenRouterChatMock = vi.fn();
const postOpenRouterAppChatMock = vi.fn();

vi.mock("@/lib/openrouter-app-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openrouter-app-api")>();
  return {
    ...actual,
    postOpenRouterAppChat: (...args: unknown[]) => postOpenRouterAppChatMock(...args),
  };
});

vi.mock("@/lib/openrouter-agent-category-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/openrouter-agent-category-api")>();
  return {
    ...actual,
    callAgentCategoryOpenRouterChat: (...args: unknown[]) =>
      callAgentCategoryOpenRouterChatMock(...args),
  };
});

const SAMPLE_SPEC: ProductSpec = {
  name: "Spa Mod",
  summary: "A prefabricated modular cabin.",
  faces: [
    { face: "front long side", photos: [1, 3], where: "Photo 1: near long wall; Photo 3: door side", inventory: "Left half full-height glass in two panes, glass entry door, right half charcoal and cedar vertical slats." },
    { face: "rear long side", photos: [], where: "", inventory: "not visible" },
    { face: "left end", photos: [2], where: "Photo 2: glass end wall at left", inventory: "Full-height glass panel, no door." },
    { face: "right end", photos: [], where: "", inventory: "not visible" },
    { face: "roof", photos: [1], where: "Photo 1: top edge", inventory: "Flat, slim dark fascia." },
    { face: "base", photos: [1, 2], where: "Photo 1 and 2: below the walls", inventory: "Black steel skid with four corner lifting lugs." },
  ],
  mustNotChange: ["Two glazing bays", "Flat roof line"],
};

const PHOTOS = [
  { fileName: "p1.jpg", dataUrl: "data:image/png;base64,PHOTO_1" },
  { fileName: "p2.jpg", dataUrl: "data:image/png;base64,PHOTO_2" },
  { fileName: "p3.jpg", dataUrl: "data:image/png;base64,PHOTO_3" },
];

describe("parseProductSpec and formatProductSpecPromptBlock", () => {
  it("accepts a complete survey and formats the Locked Product Bible block with faces and their photos", () => {
    const spec = parseProductSpec(SAMPLE_SPEC, 3);
    expect(spec.name).toBe("Spa Mod");
    expect(spec.mustNotChange).toHaveLength(2);

    const block = formatProductSpecPromptBlock(spec);
    expect(block).toContain("Locked Product Bible");
    expect(block).toContain("- front long side (Photo 1, 3; Photo 1: near long wall; Photo 3: door side): Left half full-height glass");
    expect(block).toContain("- right end (not in any photo): not visible");
    expect(block).toContain("Two glazing bays; Flat roof line");
  });

  it("rejects missing fields, unknown faces, and missing faces", () => {
    expect(() => parseProductSpec({ name: "X" })).toThrow(/faces/i);
    expect(() => parseProductSpec({ ...SAMPLE_SPEC, faces: SAMPLE_SPEC.faces.slice(1) })).toThrow(/missing the "front long side"/);
    expect(() => parseProductSpec({ ...SAMPLE_SPEC, faces: [...SAMPLE_SPEC.faces, { face: "porch", photos: [] }] })).toThrow(/unknown name/);
  });
});

describe("product views contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("defaults video model to x-ai/grok-imagine-video-1.5 at 720p instead of HeyGen 480p", () => {
    expect(DEFAULT_VIDEO_MODEL).toBe("x-ai/grok-imagine-video-1.5");
    expect(defaultResolutionForVideoModel(DEFAULT_VIDEO_MODEL)).toBe("720p");
  });

  it("defines four views, each naming the faces it shows", () => {
    expect(PRODUCT_VIEW_DEFINITIONS.map((d) => d.id)).toEqual(["front_elevation", "three_quarter", "side_elevation", "glazing_detail"]);
    expect(PRODUCT_VIEW_DEFINITIONS.map((d) => d.faces)).toEqual([
      ["front long side"],
      ["front long side", "right end"],
      ["front long side", "left end"],
      ["front long side"],
    ]);
    expect(initialProductViews()).toHaveLength(4);
    expect(initialProductViews().every((v) => v.status === "waiting")).toBe(true);
  });

  it("draws one studio view directly from all subject photos and attaches masterFrontDataUrl on angle views", async () => {
    const spy = vi
      .spyOn(imageApi, "generateImage")
      .mockResolvedValueOnce({ imageBase64: "data:image/png;base64,RENDER_1" });

    const out = await generateProductView({
      apiKey: "sk-or-test",
      imageModel: "google/gemini-3.1-flash-image-preview",
      spec: SAMPLE_SPEC,
      viewId: "side_elevation",
      aspectRatio: "16:9",
      subjectPhotos: PHOTOS,
      masterFrontDataUrl: "data:image/png;base64,MASTER_FRONT",
      currentViewDataUrl: "data:image/png;base64,CURRENT_SIDE",
      revisionNotes: ["Remove the upper right wall vent and make glass fully mirrored"],
    });

    expect(out).toBe("data:image/png;base64,RENDER_1");
    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0][0];
    expect(call.referenceImageDataUrls).toEqual([
      ...PHOTOS.map((p) => p.dataUrl),
      "data:image/png;base64,MASTER_FRONT",
      "data:image/png;base64,CURRENT_SIDE",
    ]);
    expect(call.maxReferenceImages).toBe(5);
    expect(call.prompt).toContain("Photo 1 to Photo 3");
    expect(call.prompt).toContain("Master 0-Degree Reference");
    expect(call.prompt).toContain("Current View Reference");
    expect(call.prompt).toContain("Remove the upper right wall vent and make glass fully mirrored");
    expect(call.prompt).toContain("Do not substitute a different product type");
    expect(call.prompt).not.toContain("Cladding Strip Between Glass Bay");
    expect(call.prompt).toContain("- left end (Photo 2; Photo 2: glass end wall at left): Full-height glass panel, no door.");
    expect(call.prompt).not.toContain("rear long side");
    spy.mockRestore();
  });
});

describe("Director briefBlock, productView, and Instagram-style transitions", () => {
  it("computes balanced integer duration splits without fractional averages", () => {
    const splits = integerSceneSplits(30);
    expect(splits).toContain("6 scenes [5, 5, 5, 5, 5, 5]");
    expect(splits).toContain("5 scenes [6, 6, 6, 6, 6]");
    expect(splits).toContain("4 scenes [8, 8, 7, 7]");
    expect(splits).toContain("3 scenes [10, 10, 10]");
    expect(splits).not.toContain("7.5");
  });

  it("includes Locked Product Bible in briefBlock when productSpec is present", () => {
    const brief: VideoBrief = {
      prompt: "Showcase the Spa Mod in a snowy forest.",
      lengthSeconds: 15,
      aspect: "16:9",
      resolution: "768p",
      references: [],
      subject: null,
      productSpec: SAMPLE_SPEC,
    };
    const text = briefBlock(brief);
    expect(text).toContain("Locked Product Bible");
    expect(text).toContain("charcoal and cedar vertical slats");
  });

  it("parses cut, continue, dissolve, fade_black, fade_white, wipe_left, wipe_right, and zoom_in transitions plus environmentId", () => {
    expect(parseTransition({ type: "fade_black", seconds: 0.8 }, 1)).toEqual({ type: "fade_black", seconds: 0.8 });
    expect(parseTransition({ type: "fade_white", seconds: 0.7 }, 1)).toEqual({ type: "fade_white", seconds: 0.7 });
    expect(parseTransition({ type: "wipe_left", seconds: 0.6 }, 1)).toEqual({ type: "wipe_left", seconds: 0.6 });
    expect(parseTransition({ type: "wipe_right", seconds: 0.6 }, 1)).toEqual({ type: "wipe_right", seconds: 0.6 });
    expect(parseTransition({ type: "zoom_in", seconds: 0.6 }, 1)).toEqual({ type: "zoom_in", seconds: 0.6 });

    const rawPlan = JSON.stringify({
      title: "Spa Mod Film",
      logline: "Modular luxury in the pines.",
      voice: "none",
      fadeInSeconds: 0.8,
      fadeOutSeconds: 1.0,
      continuity: {
        heroSubject: "Spa Mod",
        screenDirection: "left_to_right",
        cameraSide: "south",
        palette: "charcoal and cedar",
        lightArc: "dusk to warm glow",
      },
      scenes: [
        {
          id: "s1",
          order: 1,
          title: "Establishing Three-Quarter",
          durationSeconds: 5,
          sceneInstructions: "Wide shot in snow.",
          environmentId: "forest_clearing_piers",
          environmentPrompt: "Flat gravel pad with six concrete piers in a snowy pine clearing.",
          storyboardPrompt: "Three-quarter view facing screen right.",
          motionPrompt: "Slow dolly right.",
          continuityNotes: "Keep cedar slats.",
          narration: "",
          referenceIndexes: [],
          productView: "three_quarter",
          transitionIn: null,
        },
        {
          id: "s2",
          order: 2,
          title: "Front Elevation Cut",
          durationSeconds: 5,
          sceneInstructions: "Front angle.",
          environmentId: "forest_clearing_piers",
          environmentPrompt: "Flat gravel pad with six concrete piers in a snowy pine clearing.",
          storyboardPrompt: "Front elevation centered.",
          motionPrompt: "Slow push in.",
          continuityNotes: "Keep two glazing bays.",
          narration: "",
          referenceIndexes: [],
          productView: "front_elevation",
          transitionIn: { type: "cut", seconds: 0 },
        },
        {
          id: "s3",
          order: 3,
          title: "Glazing Dissolve",
          durationSeconds: 5,
          sceneInstructions: "Close-up on glazing.",
          environmentId: "forest_clearing_piers",
          environmentPrompt: "Flat gravel pad with six concrete piers at dusk.",
          storyboardPrompt: "Glazing detail.",
          motionPrompt: "Pan right across glass.",
          continuityNotes: "Amber interior glow.",
          narration: "",
          referenceIndexes: [],
          productView: "glazing_detail",
          transitionIn: { type: "dissolve", seconds: 0.7 },
        },
      ],
    });

    const plan = parseVideoPlan(rawPlan, 15, 0);
    expect(plan.scenes).toHaveLength(3);
    expect(plan.fadeInSeconds).toBe(0.8);
    expect(plan.fadeOutSeconds).toBe(1.0);
    expect(plan.scenes[0].environmentId).toBe("forest_clearing_piers");
    expect(plan.scenes[0].productView).toBe("three_quarter");
    expect(plan.scenes[1].productView).toBe("front_elevation");
    expect(plan.scenes[1].transitionIn).toEqual({ type: "cut", seconds: 0 });
    expect(plan.scenes[2].productView).toBe("glazing_detail");
    expect(plan.scenes[2].transitionIn).toEqual({ type: "dissolve", seconds: 0.7 });
  });
});

describe("resolveProductAnchorForScene", () => {
  it("returns no anchor when productView is omitted even if studio views exist", () => {
    const scene = parseScene(
      {
        id: "s1",
        order: 1,
        title: "Sunrise Sidewalk",
        durationSeconds: 6,
        sceneInstructions: "Woman walks dog on suburban sidewalk.",
        storyboardPrompt: "Golden retriever on leash, suburban houses.",
        motionPrompt: "Slow tracking shot.",
        continuityNotes: "",
        narration: "",
        referenceIndexes: [],
        transitionIn: null,
      },
      0,
      0,
    );
    const anchor = resolveProductAnchorForScene({
      scene,
      subjectDataUrl: "data:image/png;base64,HARNESS",
      productViews: {
        front_elevation: "data:image/png;base64,FRONT",
        three_quarter: "data:image/png;base64,THREE_Q",
      },
    });
    expect(anchor.dataUrl).toBeUndefined();
    expect(anchor.label).toBe("none");
  });
});

describe("Storyboard angle-matched product view anchor & harnessed Environment Plate", () => {
  it("attaches BOTH the angle-matched productView and the master 0 deg Front Elevation view while omitting Scene 1 heroFrameDataUrl", async () => {
    const scene = parseScene(
      {
        id: "s4",
        order: 4,
        title: "Highway Transport",
        durationSeconds: 5,
        sceneInstructions: "Semi-truck carrying completed module along mountain highway.",
        storyboardPrompt: "Module co-linear on flatbed deck.",
        motionPrompt: "Camera tracks right alongside truck.",
        continuityNotes: "",
        narration: "",
        referenceIndexes: [1],
        productView: "side_elevation",
        transitionIn: { type: "cut", seconds: 0 },
      },
      3,
      1,
    );

    const anchor = resolveProductAnchorForScene({
      scene,
      subjectDataUrl: "data:image/png;base64,HARNESS",
      productViews: {
        front_elevation: "data:image/png;base64,FRONT_MASTER",
        three_quarter: "data:image/png;base64,THREE_QUARTER_RIGHT",
        side_elevation: "data:image/png;base64,THREE_QUARTER_LEFT",
        glazing_detail: "data:image/png;base64,GLAZING",
      },
    });
    expect(anchor.dataUrl).toBe("data:image/png;base64,THREE_QUARTER_LEFT");
    expect(anchor.secondaryDataUrl).toBe("data:image/png;base64,FRONT_MASTER");
    expect(anchor.label).toContain("side_elevation");

    const spy = vi.spyOn(imageApi, "generateImage").mockResolvedValueOnce({
      imageBase64: "data:image/png;base64,SCENE4_FRAME",
    });

    const plan: VideoPlan = {
      title: "Spa Mod Film",
      logline: "Modular luxury.",
      voice: "none",
      continuity: {
        heroSubject: "Spa Mod",
        screenDirection: "left_to_right",
        cameraSide: "south",
        palette: "charcoal and cedar",
        lightArc: "daylight",
      },
      scenes: [scene],
    };

    await generateStoryboardFrame({
      apiKey: "sk-or-test",
      imageModel: "google/gemini-3.1-flash-image-preview",
      plan,
      scene,
      aspect: "16:9",
      productSpec: SAMPLE_SPEC,
      productViews: {
        front_elevation: "data:image/png;base64,FRONT_MASTER",
        three_quarter: "data:image/png;base64,THREE_QUARTER_RIGHT",
        side_elevation: "data:image/png;base64,THREE_QUARTER_LEFT",
      },
      sceneReferenceDataUrls: ["data:image/png;base64,SKETCH_BEAT"],
      heroFrameDataUrl: "data:image/png;base64,FACTORY_SCENE_1_POLLUTION",
    });

    const callArg = spy.mock.calls[0][0];
    expect(callArg.referenceImageDataUrls).toEqual([
      "data:image/png;base64,THREE_QUARTER_LEFT",
      "data:image/png;base64,SKETCH_BEAT",
    ]);
    expect(callArg.maxReferenceImages).toBe(3);
    expect(callArg.referenceImageDataUrls).not.toContain("data:image/png;base64,FACTORY_SCENE_1_POLLUTION");
    expect(callArg.prompt).toContain("Product fidelity");
    expect(callArg.prompt).toContain("Scene fidelity");
    expect(callArg.prompt).not.toMatch(/Flatbed Truck|modular unit|glass panes and mullions/);
    spy.mockRestore();
  });

  it("renders Environment Plate anchored to master location plate and composites keyframe in 3 non-redundant slots (no 400 error)", async () => {
    const spy = vi
      .spyOn(imageApi, "generateImage")
      .mockResolvedValueOnce({ imageBase64: "data:image/png;base64,ENV_PLATE_S4" })
      .mockResolvedValueOnce({ imageBase64: "data:image/png;base64,COMPOSITE_S4" });

    const scene = parseScene(
      {
        id: "s4",
        order: 4,
        title: "Module Settles onto Piers",
        durationSeconds: 5,
        sceneInstructions: "Module lowers onto six concrete piers.",
        environmentId: "forest_clearing_piers",
        environmentPrompt: "Level grey gravel pad with six square concrete piers in an evergreen clearing below rocky peaks.",
        storyboardPrompt: "Front elevation lowering onto the six concrete piers.",
        motionPrompt: "Slow vertical settle.",
        continuityNotes: "Same piers and gravel pad.",
        narration: "",
        referenceIndexes: [],
        productView: "front_elevation",
        transitionIn: { type: "dissolve", seconds: 0.7 },
        revisionNotes: ["Remove flatbed trailer from foreground"],
      },
      3,
      0,
    );

    const plan: VideoPlan = {
      title: "Spa Mod Film",
      logline: "Modular luxury.",
      voice: "none",
      continuity: {
        heroSubject: "Spa Mod",
        screenDirection: "left_to_right",
        cameraSide: "south",
        palette: "charcoal and cedar",
        lightArc: "golden hour",
      },
      scenes: [scene],
    };

    const envPlate = await generateEnvironmentPlate({
      apiKey: "sk-or-test",
      imageModel: "google/gemini-3.1-flash-image-preview",
      plan,
      scene,
      aspect: "16:9",
      masterEnvironmentDataUrl: "data:image/png;base64,MASTER_ENV_CLEARING",
    });
    expect(envPlate).toBe("data:image/png;base64,ENV_PLATE_S4");
    expect(spy.mock.calls[0][0].referenceImageDataUrls).toEqual(["data:image/png;base64,MASTER_ENV_CLEARING"]);
    expect(spy.mock.calls[0][0].prompt).toContain("DO NOT render people, pets, products");

    await generateStoryboardFrame({
      apiKey: "sk-or-test",
      imageModel: "google/gemini-3.1-flash-image-preview",
      plan,
      scene,
      aspect: "16:9",
      subjectDataUrl: "data:image/png;base64,STUDIO_HARNESS",
      productSpec: SAMPLE_SPEC,
      productViews: {
        front_elevation: "data:image/png;base64,FRONT_MASTER",
        three_quarter: "data:image/png;base64,THREE_QUARTER_RIGHT",
      },
      environmentDataUrl: envPlate,
      sameLocationFrameDataUrl: "data:image/png;base64,PREV_CLEARING_FRAME",
      sceneReferenceDataUrls: [],
    });

    const compositeCall = spy.mock.calls[1][0];
    expect(compositeCall.maxReferenceImages).toBe(3);
    expect(compositeCall.referenceImageDataUrls).toEqual([
      "data:image/png;base64,FRONT_MASTER",
      "data:image/png;base64,PREV_CLEARING_FRAME",
      "data:image/png;base64,THREE_QUARTER_RIGHT",
    ]);
    expect(compositeCall.prompt).toContain("Remove flatbed trailer from foreground");
    spy.mockRestore();
  });
});

describe("Cinematographer camera-motion adaptation and persistent scene revisions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adapts camera motion instead of throwing when facingMatchesDirection is false and injects revisionNotes", async () => {
    callAgentCategoryOpenRouterChatMock.mockResolvedValueOnce({
      content: JSON.stringify({
        facing: "three-quarter left",
        facingMatchesDirection: false,
        videoPrompt: "The modular cabin sits among pines as warm light glows through two floor-to-ceiling glazing bays.",
      }),
    });

    const plan: VideoPlan = {
      title: "Spa Mod Film",
      logline: "Modular luxury.",
      voice: "none",
      continuity: {
        heroSubject: "Spa Mod",
        screenDirection: "left_to_right",
        cameraSide: "south",
        palette: "charcoal and cedar",
        lightArc: "dusk",
      },
      scenes: [
        {
          id: "s1",
          order: 1,
          title: "Forest Clearing",
          durationSeconds: 6,
          sceneInstructions: "Cabin in forest.",
          storyboardPrompt: "Three-quarter cabin.",
          motionPrompt: "Slow dolly right.",
          continuityNotes: "",
          narration: "",
          referenceIndexes: [],
          productView: "three_quarter",
          revisionNotes: ["No trailer in frame; rest directly on concrete piers"],
        },
      ],
    };

    const prompt = await writeSceneVideoPrompt({
      apiKey: "sk-or-test",
      plan,
      scene: plan.scenes[0],
      frameDataUrl: "data:image/png;base64,AAA",
      productSpec: SAMPLE_SPEC,
    });

    expect(prompt).toContain("Smooth left to right camera tracking shot");
    expect(prompt).toContain("two floor-to-ceiling glazing bays");

    callAgentCategoryOpenRouterChatMock.mockResolvedValueOnce({
      content: JSON.stringify({
        id: "s1",
        order: 1,
        title: "Forest Clearing on Piers",
        durationSeconds: 6,
        sceneInstructions: "Cabin on concrete piers.",
        environmentId: "forest_clearing_piers",
        environmentPrompt: "Gravel pad with concrete piers.",
        storyboardPrompt: "Three-quarter cabin on concrete piers.",
        motionPrompt: "Slow dolly right.",
        continuityNotes: "",
        narration: "",
        referenceIndexes: [],
        productView: "three_quarter",
        transitionIn: null,
      }),
    });

    const revised = await runVideoDirectorReviseScene({
      apiKey: "sk-or-test",
      brief: {
        prompt: "Showcase Spa Mod.",
        lengthSeconds: 15,
        aspect: "16:9",
        resolution: "720p",
        references: [],
        subject: null,
      },
      plan,
      sceneId: "s1",
      instruction: "Add warm interior sconce glow",
    });
    expect(revised.revisionNotes).toEqual([
      "No trailer in frame; rest directly on concrete piers",
      "Add warm interior sconce glow",
    ]);
  });
});

describe("Non-destructive single-scene rerender and restitch API", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        render: {
          id: "20261015-120000-abcd1234",
          status: "rendering",
          scenes: [{ sceneId: "s2", status: "generating" }],
        },
      }),
    });
  });

  it("posts single-scene rerender payload to /video/render/{id}/scene/{sceneId}/rerender", async () => {
    const snap = await rerenderVideoScene({
      apiKey: "sk-or-test",
      renderId: "20261015-120000-abcd1234",
      sceneId: "s2",
      dataUrl: "data:image/png;base64,NEWFRAME",
      videoPrompt: "Updated camera dolly right.",
      transitionIn: { type: "cut", seconds: 0 },
    });
    expect(snap.status).toBe("rendering");
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain("/video/render/20261015-120000-abcd1234/scene/s2/rerender");
    expect(JSON.parse(init.body)).toEqual({
      dataUrl: "data:image/png;base64,NEWFRAME",
      videoPrompt: "Updated camera dolly right.",
      transitionIn: { type: "cut", seconds: 0 },
    });

    await restitchVideoRender({
      apiKey: "sk-or-test",
      renderId: "20261015-120000-abcd1234",
      fadeInSeconds: 0.6,
      fadeOutSeconds: 0.8,
      scenes: [{ id: "s2", transitionIn: { type: "fade_black", seconds: 0.8 } }],
    });
    const [url2, init2] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(String(url2)).toContain("/video/render/20261015-120000-abcd1234/restitch");
    expect(JSON.parse(init2.body)).toEqual({
      fadeInSeconds: 0.6,
      fadeOutSeconds: 0.8,
      scenes: [{ id: "s2", transitionIn: { type: "fade_black", seconds: 0.8 } }],
    });
    globalThis.fetch = originalFetch;
  });

  it("renders VideoStagePanel, VideoTimelineDock, and VideoPostCutPanel with multi-track lanes and Post-Cut controls", () => {
    const plan: VideoPlan = {
      title: "Spa Mod Showcase",
      logline: "Luxury modular cabin.",
      voice: "nadine",
      fadeInSeconds: 0.6,
      fadeOutSeconds: 0.8,
      continuity: {
        heroSubject: "Spa Mod",
        screenDirection: "left_to_right",
        cameraSide: "south",
        palette: "charcoal and cedar",
        lightArc: "dusk",
      },
      scenes: [
        {
          id: "s1",
          order: 1,
          title: "Opening Hero",
          durationSeconds: 8,
          sceneInstructions: "Wide shot.",
          environmentId: "factory_bay",
          environmentPrompt: "Clean concrete factory floor.",
          storyboardPrompt: "Three-quarter view.",
          motionPrompt: "Dolly right.",
          continuityNotes: "",
          narration: "Meet the Spa Mod.",
          referenceIndexes: [],
          productView: "three_quarter",
        },
        {
          id: "s2",
          order: 2,
          title: "Front Cut",
          durationSeconds: 7,
          sceneInstructions: "Front angle.",
          environmentId: "forest_clearing_piers",
          environmentPrompt: "Gravel pad with six concrete piers.",
          storyboardPrompt: "Front view.",
          motionPrompt: "Push in.",
          continuityNotes: "",
          narration: "Built for year-round comfort.",
          referenceIndexes: [],
          productView: "front_elevation",
          transitionIn: { type: "cut", seconds: 0 },
          revisionNotes: ["Remove trailer from foreground"],
        },
      ],
    };

    const frames = [
      {
        sceneId: "s1",
        status: "done" as const,
        environmentDataUrl: "data:image/png;base64,ENV1",
        imageDataUrl: "data:image/png;base64,AAA",
        videoPrompt: "Dolly right",
      },
      {
        sceneId: "s2",
        status: "done" as const,
        environmentDataUrl: "data:image/png;base64,ENV2",
        imageDataUrl: "data:image/png;base64,BBB",
        videoPrompt: "Push in",
      },
    ];
    const render = {
      id: "20261015-120000-abcd1234",
      status: "done" as const,
      finalUrl: "https://example.com/final.mp4",
      scenes: [
        { sceneId: "s1", status: "done" as const, clipUrl: "https://example.com/s1.mp4" },
        { sceneId: "s2", status: "done" as const, clipUrl: "https://example.com/s2.mp4" },
      ],
    };

    const turntableHtml = renderToStaticMarkup(
      React.createElement(VideoStagePanel, {
        activeTab: "product",
        plan: null,
        aspect: "16:9",
        frames: [],
        selectedSceneId: null,
        render: null,
        hasSubjectPhotos: true,
        productLock: {
          spec: SAMPLE_SPEC,
          locked: false,
          views: initialProductViews().map((v) => ({
            ...v,
            status: "done" as const,
            imageDataUrl: "data:image/png;base64,VIEW",
            revisionNotes: ["Make glass mirrored"],
          })),
        },
        onRegenerateProductView: () => {},
        onReviseProductView: () => {},
      }),
    );
    expect(turntableHtml).toContain("Prompt AI to change 1. Front");
    expect(turntableHtml).toContain("Prompt AI to change 2. Front-right 3/4");
    expect(turntableHtml).toContain("Prompt AI to change 3. Front-left 3/4");
    expect(turntableHtml).toContain("Prompt AI to change 4. Detail");
    expect(turntableHtml).toContain("1 edit");

    const generatingTurntableHtml = renderToStaticMarkup(
      React.createElement(VideoStagePanel, {
        activeTab: "product",
        plan: null,
        aspect: "16:9",
        frames: [],
        selectedSceneId: null,
        render: null,
        hasSubjectPhotos: true,
        productViewsBatchBusy: true,
        productLock: {
          spec: SAMPLE_SPEC,
          locked: false,
          views: initialProductViews().map((v) => ({
            ...v,
            status: "generating" as const,
            imageDataUrl: undefined,
          })),
        },
        onRegenerateProductView: () => {},
        onReviseProductView: () => {},
      }),
    );
    expect(generatingTurntableHtml).toContain("/video-studio/elementor-placeholder.png");
    expect(generatingTurntableHtml).toContain("animate-video-product-splash-breathe");
    expect(generatingTurntableHtml).not.toContain("animate-spin");

    const generatingStageHtml = renderToStaticMarkup(
      React.createElement(VideoStagePanel, {
        plan,
        aspect: "16:9",
        frames: [{ sceneId: "s1", status: "generating" as const, environmentStatus: "waiting" as const }],
        selectedSceneId: "s1",
        render: null,
      }),
    );
    expect(generatingStageHtml).toContain("/video-studio/elementor-placeholder.png");
    expect(generatingStageHtml).not.toContain("animate-spin");

    const clipGeneratingTimelineHtml = renderToStaticMarkup(
      React.createElement(VideoTimelineDock, {
        plan,
        totalSeconds: 15,
        frames: [
          {
            sceneId: "s1",
            status: "done" as const,
            imageDataUrl: "data:image/png;base64,KEY",
            environmentStatus: "done" as const,
            videoPrompt: "Dolly right",
          },
        ],
        renderScenes: [{ sceneId: "s1", status: "generating" as const }],
        selectedSceneId: "s1",
        disabled: false,
        onSelectScene: () => {},
        onRegenerateFrame: () => {},
        onRerenderSceneClip: () => {},
        onUpdateSceneTransition: () => {},
      }),
    );
    expect(clipGeneratingTimelineHtml).toContain("animate-video-product-splash-breathe");
    expect(clipGeneratingTimelineHtml).not.toContain("animate-spin");

    const preApproveHtml = renderToStaticMarkup(
      React.createElement(VideoStagePanel, {
        plan,
        aspect: "16:9",
        frames: [],
        selectedSceneId: "s1",
        render: null,
        onToggleSceneApproved: () => {},
        onApprovePlanAndBeginStoryboard: () => {},
        onSendSceneInstruction: () => {},
      }),
    );
    expect(preApproveHtml).toContain("Scene Brief Review");
    expect(preApproveHtml).not.toContain("Approve &amp; generate storyboard");
    expect(preApproveHtml).toContain("Type what to change in Scene 1");

    const stageHtml = renderToStaticMarkup(
      React.createElement(VideoStagePanel, {
        plan,
        aspect: "16:9",
        frames,
        selectedSceneId: "s2",
        render,
        onRerenderSceneClip: () => {},
      }),
    );
    expect(stageHtml).toContain("Final cut");
    expect(stageHtml).toContain("Scene 2 clip");
    expect(stageHtml).toContain("Scene 2 frame");
    expect(stageHtml).toContain("Scene 2 env");
    expect(stageHtml).toContain("Re-render scene 2 clip");

    const timelineHtml = renderToStaticMarkup(
      React.createElement(VideoTimelineDock, {
        plan,
        totalSeconds: 15,
        frames,
        renderScenes: render.scenes,
        selectedSceneId: "s2",
        disabled: false,
        onSelectScene: () => {},
        onRegenerateFrame: () => {},
        onRerenderSceneClip: () => {},
        onUpdateSceneTransition: () => {},
      }),
    );
    expect(timelineHtml).toContain("VIDEO 1");
    expect(timelineHtml).toContain("VOICE 1");
    expect(timelineHtml).toContain("Opening Hero");
    expect(timelineHtml).toContain("Front Cut");
    expect(timelineHtml).toContain("Cut");
    expect(timelineHtml).toContain("1 edit");
    expect(timelineHtml).toContain("Built for year-round comfort.");

    const postCutHtml = renderToStaticMarkup(
      React.createElement(VideoPostCutPanel, {
        plan,
        frames,
        render,
        selectedSceneId: "s2",
        disabled: false,
        onSelectScene: () => {},
        onSendSceneInstruction: () => {},
        onRegenerateEnvironmentPlate: () => {},
        onRegenerateFrame: () => {},
        onRerenderSceneClip: () => {},
        onUpdateSceneTransition: () => {},
        onUpdatePlanFades: () => {},
        onUpdateScenePrompts: () => {},
        onRestitch: () => {},
      }),
    );
    expect(postCutHtml).toContain("Post-Cut Scene Studio");
    expect(postCutHtml).toContain("Remove trailer from foreground");
    expect(postCutHtml).toContain("Transitions &amp; Fades");
    expect(postCutHtml).toContain("Re-render Scene 2 Video Clip");

    const projectSnapshot: VideoProjectSnapshot = {
      version: 1,
      id: "proj-12345",
      name: "Spa Mod Showcase",
      updatedAt: "2026-10-15T22:00:00.000Z",
      step: "render",
      maxStep: "render",
      videoModel: "x-ai/grok-imagine-video-1.5",
      prompt: "Showcase Spa Mod.",
      lengthSeconds: 15,
      aspect: "16:9",
      resolution: "720p",
      references: [],
      subjectPhotos: [],
      subject: null,
      productLock: {
        spec: SAMPLE_SPEC,
        views: initialProductViews(),
        locked: true,
      },
      questions: null,
      answers: {},
      plan,
      frames,
      render,
      selectedSceneId: "s2",
    };

    const json = serializeVideoProjectJson(projectSnapshot);
    const restored = parseVideoProjectJson(json);
    expect(restored.id).toBe("proj-12345");
    expect(restored.name).toBe("Spa Mod Showcase");
    expect(restored.plan?.scenes).toHaveLength(2);
    expect(restored.frames).toHaveLength(2);
    expect(restored.render?.finalUrl).toBe("https://example.com/final.mp4");

    const projectsHtml = renderToStaticMarkup(
      React.createElement(VideoProjectsPanel, {
        projectId: "proj-12345",
        projectName: "Spa Mod Showcase",
        onProjectNameChange: () => {},
        savedProjects: [
          {
            id: "proj-12345",
            name: "Spa Mod Showcase",
            updatedAt: "2026-10-15T22:00:00.000Z",
            step: "render",
            sceneCount: 2,
            renderId: "20261015-120000-abcd1234",
            finalUrl: "https://example.com/final.mp4",
          },
        ],
        storedRenders: [
          {
            id: "20261015-120000-abcd1234",
            status: "done",
            model: "x-ai/grok-imagine-video-1.5",
            resolution: "720p",
            aspect: "16:9",
            createdAt: "2026-10-15T22:00:00.000Z",
            finalUrl: "https://example.com/final.mp4",
            clips: [
              { sceneId: "s1", order: 1, durationSeconds: 8, status: "done", clipUrl: "https://example.com/s1.mp4" },
              { sceneId: "s2", order: 2, durationSeconds: 7, status: "done", clipUrl: "https://example.com/s2.mp4" },
            ],
          },
        ],
        plan,
        frames,
        render,
        disabled: false,
        onSaveProject: () => {},
        onLoadProject: () => {},
        onDeleteProject: () => {},
        onExportJson: () => {},
        onImportJson: () => {},
        onExportZip: () => {},
        onRefresh: () => {},
      }),
    );
    expect(projectsHtml).toContain("Save JSON");
    expect(projectsHtml).toContain("Load JSON");
    expect(projectsHtml).toContain("Export Project ZIP (Full Video + Clips + JSON)");
    expect(projectsHtml).toContain("Local Clips Storage (1)");
    expect(projectsHtml).toContain("Clip MP4");
  });

  it("posts project save and export-zip requests to /video/projects and /video/export-zip", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          summary: {
            id: "proj-12345",
            name: "Spa Mod Showcase",
            updatedAt: "2026-10-15T22:00:00.000Z",
            step: "storyboard",
            sceneCount: 2,
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          zipUrl: "https://example.com/exports/spa-mod-showcase.zip",
          fileName: "spa-mod-showcase.zip",
        }),
      });
    globalThis.fetch = mockFetch;

    const projectSnapshot: VideoProjectSnapshot = {
      version: 1,
      id: "proj-12345",
      name: "Spa Mod Showcase",
      updatedAt: "2026-10-15T22:00:00.000Z",
      step: "storyboard",
      maxStep: "storyboard",
      videoModel: "x-ai/grok-imagine-video-1.5",
      prompt: "Showcase Spa Mod.",
      lengthSeconds: 15,
      aspect: "16:9",
      resolution: "720p",
      references: [],
      subjectPhotos: [],
      subject: null,
      productLock: {
        spec: SAMPLE_SPEC,
        views: initialProductViews(),
        locked: true,
      },
      questions: null,
      answers: {},
      plan: null,
      frames: [],
      render: null,
      selectedSceneId: null,
    };

    const summary = await saveVideoProject({ apiKey: "sk-or-test", project: projectSnapshot });
    expect(summary.id).toBe("proj-12345");
    expect(String(mockFetch.mock.calls[0][0])).toContain("/video/projects");

    const zip = await exportVideoProjectZip({ apiKey: "sk-or-test", project: projectSnapshot });
    expect(zip.fileName).toBe("spa-mod-showcase.zip");
    expect(String(mockFetch.mock.calls[1][0])).toContain("/video/export-zip");
    globalThis.fetch = originalFetch;
  });
});
