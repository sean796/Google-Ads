import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildPromptRemakerSystemPrompt,
  deduplicatePromptPhrases,
  fallbackHarmonizePrompt,
  reviseScenePromptWithAi,
} from "../video-generator/video-prompt-remaker-agent";

const mockPostOpenRouterAppChat = vi.fn();
vi.mock("@/lib/openrouter-app-api", () => ({
  postOpenRouterAppChat: (...args: unknown[]) => mockPostOpenRouterAppChat(...args),
}));

const mockCallAgentCategory = vi.fn();
vi.mock("@/lib/openrouter-agent-category-api", () => ({
  callAgentCategoryOpenRouterChat: (...args: unknown[]) => mockCallAgentCategory(...args),
}));

describe("video-prompt-remaker-agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds a system prompt commanding zero contradictions and 45-80 word budget", () => {
    const sys = buildPromptRemakerSystemPrompt();
    expect(sys).toContain("ZERO CONTRADICTIONS");
    expect(sys).toContain("45 TO 80 WORD BUDGET");
    expect(sys).toContain("RIGID ARCHITECTURE & ZERO-MORPHING LOCK");
    expect(sys).toContain("ZERO HUMANS");
  });

  describe("deduplicatePromptPhrases", () => {
    it("strips repeated sentences and identical boilerplate clauses", () => {
      const repetitive =
        "Rigid architecture lock: zero morphing, stationary walls, cabinetry, and fixtures. " +
        "Background wall matches reference photo. " +
        "Rigid architecture lock: zero morphing, stationary walls, cabinetry, and fixtures. " +
        "Background wall matches reference photo.";
      const deduped = deduplicatePromptPhrases(repetitive);
      expect(deduped).toBe(
        "Rigid architecture lock: zero morphing, stationary walls, cabinetry, and fixtures. Background wall matches reference photo.",
      );
    });
  });

  describe("fallbackHarmonizePrompt", () => {
    it("harmonizes opposing camera directions (pan left vs pan right)", () => {
      const currentPrompt =
        "Camera performs a gentle panning to the right across the executive lounge. Rigid architecture lock: zero morphing.";
      const instruction = "pan to the left instead of right and focus on the reception desk";

      const result = fallbackHarmonizePrompt(currentPrompt, instruction);
      expect(result.revisedPrompt.toLowerCase()).toContain("pan left");
      expect(result.revisedPrompt.toLowerCase()).not.toContain("panning to the right");
      expect(result.revisedPrompt).toContain("Rigid architecture lock");
    });

    it("synthesizes user right-to-left hallway direction with stationary door and reference wall", () => {
      const currentPrompt = "Camera glides smoothly through showroom.";
      const instruction =
        "Avoid the door to be moving or anything pan right TO left NOT LEFT OTO RIGHT sstya in the hall way swing left. Background wall and architecture strictly match the attached client reference photo behind the stationary display board.";

      const result = fallbackHarmonizePrompt(currentPrompt, instruction, true);
      expect(result.revisedPrompt.toLowerCase()).toContain("pan right to left");
      expect(result.revisedPrompt.toLowerCase()).toContain("swinging left");
      expect(result.revisedPrompt.toLowerCase()).toContain("stationary");
      expect(result.revisedPrompt).toContain("Background wall and architecture strictly match");
      expect(result.revisedPrompt).toContain("Rigid architecture lock");
      expect(result.revisedPrompt.split(/\s+/).length).toBeLessThanOrEqual(65);
    });

    it("eliminates old curtain focus when user orders fly through to desk", () => {
      const currentPrompt =
        "Camera performs one continuous slow push-in toward the gray curtain, then a gentle rightward lateral track to reveal the adjacent sheer curtain. Rigid architecture lock: zero morphing.";
      const instruction =
        "The curtain rod needs to be fixed to the wall, not floating away from it. Dont focus on the blinds, fly through to the desk in the background";

      const result = fallbackHarmonizePrompt(currentPrompt, instruction);
      expect(result.revisedPrompt).toContain("fly through to the desk");
      expect(result.revisedPrompt.toLowerCase()).not.toContain("push-in toward the gray curtain");
      expect(result.revisedPrompt).toContain("Rigid architecture lock");
    });

    it("enforces zero people constraint when requested", () => {
      const currentPrompt = "Camera pushes forward into the meeting room.";
      const instruction = "no people, completely empty showroom";

      const result = fallbackHarmonizePrompt(currentPrompt, instruction);
      expect(result.revisedPrompt.toLowerCase()).toContain("zero people");
    });

    it("keeps prompt within reasonable word count", () => {
      const longBase =
        "Camera moves forward through a long corridor lined with display walls, architectural finishes, sample textures, ceiling lighting fixtures, metallic panels, wooden trims, marble flooring, and recessed LED lights. " +
        "Rigid architecture lock: zero morphing, zero geometric drift, no shifting cabinets or walls, no dissolving objects, no floating text or phantom letters. Maintain strict 1:1 visual fidelity with the reference frame throughout the shot.";
      const instruction = "focus on the front pedestal only";

      const result = fallbackHarmonizePrompt(longBase, instruction);
      const wordCount = result.revisedPrompt.split(/\s+/).length;
      expect(wordCount).toBeLessThanOrEqual(85);
    });
  });

  describe("reviseScenePromptWithAi", () => {
    it("calls dedicated Gemini 2.5 Flash agent and parses synthesized JSON", async () => {
      mockPostOpenRouterAppChat.mockResolvedValueOnce({
        content: JSON.stringify({
          revisedPrompt:
            "Camera performs one continuous slow forward fly through to the desk in the background. The curtain rod stays firmly affixed to the wall with zero drift. Rigid architecture lock: walls, cabinets, and desk remain stationary with zero morphing. Empty showroom with zero people.",
          changesSummary:
            "Eliminated curtain tracking move; directed camera to fly through toward desk and anchored curtain rod rigidly.",
        }),
      });

      const res = await reviseScenePromptWithAi({
        apiKey: "test-key",
        currentPrompt:
          "Camera performs one continuous slow push-in toward the gray curtain, then a gentle rightward track. Rigid architecture lock: zero morphing.",
        instruction:
          "The curtain rod needs to be fixed to the wall, not floating away from it. Dont focus on the blinds, fly through to the desk in the background",
        sceneTitle: "Showroom Fly-through",
        sceneOrder: 1,
      });

      expect(mockPostOpenRouterAppChat).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "google/gemini-2.5-flash",
        }),
      );
      expect(res.revisedPrompt).toContain("fly through to the desk");
      expect(res.changesSummary).toContain("Eliminated curtain tracking move");
      expect(res.revisedPrompt.split(/\s+/).length).toBeGreaterThanOrEqual(25);
      expect(res.revisedPrompt.split(/\s+/).length).toBeLessThanOrEqual(85);
    });

    it("falls back gracefully when the API call fails", async () => {
      mockPostOpenRouterAppChat.mockRejectedValue(new Error("Network timeout"));
      mockCallAgentCategory.mockRejectedValue(new Error("Network timeout"));

      const res = await reviseScenePromptWithAi({
        apiKey: "test-key",
        currentPrompt: "Camera pans right across blinds.",
        instruction: "pan to the left instead of right",
        sceneTitle: "Lobby",
        sceneOrder: 2,
      });

      expect(res.revisedPrompt.toLowerCase()).toContain("pan left");
      expect(res.changesSummary).toBeTruthy();
    });
  });
});
