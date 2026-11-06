import type { VideoScenePlan } from "@/lib/video-generator/video-generator-types";
import type { StoryboardFrame } from "@/lib/video-generator/video-generator-types";

export function getInitialScenePrompt(
  frame?: StoryboardFrame,
  activeScene?: VideoScenePlan | null,
): string {
  return (frame?.videoPrompt || activeScene?.motionPrompt || "").trim();
}

export function getInitialInstructionText(activeScene?: VideoScenePlan | null): string {
  if (activeScene?.revisionNotes?.length) {
    return activeScene.revisionNotes[activeScene.revisionNotes.length - 1] ?? "";
  }
  return "";
}
