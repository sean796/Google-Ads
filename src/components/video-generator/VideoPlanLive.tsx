import type { OpenRouterAppStreamDelta } from "@/lib/openrouter-app-api";
import { VideoStudioPlaceholderSplash } from "./VideoStudioPlaceholderSplash";

/**
 * Live Director stream rendered inside the Center Stage Monitor while the scene plan is being drafted.
 * Renders the pulsing green circle with the breathing Neo Pulse logo and NO extra text.
 */
export function VideoPlanLive({ live: _live }: { live: OpenRouterAppStreamDelta }) {
  return (
    <div className="relative flex h-full w-full min-h-0 flex-col items-center justify-center overflow-hidden bg-black select-none">
      <VideoStudioPlaceholderSplash breathing variant="stage" />
    </div>
  );
}
