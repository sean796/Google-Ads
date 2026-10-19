import type { ProductViewId } from "@/lib/video-generator/video-generator-types";
import { VideoStudioPlaceholderSplash } from "./VideoStudioPlaceholderSplash";

type VideoProductViewSplashProps = {
  viewId: ProductViewId;
  label: string;
  shortLabel: string;
  breathing: boolean;
  className?: string;
};

/** Product turntable cell splash (shared Elementor placeholder). */
export function VideoProductViewSplash({
  viewId: _viewId,
  label,
  shortLabel,
  breathing,
  className,
}: VideoProductViewSplashProps) {
  return (
    <VideoStudioPlaceholderSplash
      title={shortLabel}
      subtitle={label}
      breathing={breathing}
      variant="stage"
      className={className}
    />
  );
}
