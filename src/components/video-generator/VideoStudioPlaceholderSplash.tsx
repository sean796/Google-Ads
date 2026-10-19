import { ELEMENTOR_PRODUCT_SPLASH_PATH } from "@/lib/video-generator/video-product-view-splashes";
import { cn } from "@/lib/utils";

export type VideoStudioSplashVariant = "stage" | "tile";

type VideoStudioPlaceholderSplashProps = {
  title: string;
  subtitle?: string;
  breathing: boolean;
  variant?: VideoStudioSplashVariant;
  className?: string;
};

/** Elementor placeholder splash with optional breathe pulse (no spinners). */
export function VideoStudioPlaceholderSplash({
  title,
  subtitle,
  breathing,
  variant = "stage",
  className,
}: VideoStudioPlaceholderSplashProps) {
  const isTile = variant === "tile";

  const ariaLabel = subtitle ? `${title} · ${subtitle}` : title;

  return (
    <div
      className={cn("absolute inset-0 bg-black", className)}
      aria-busy={breathing || undefined}
      aria-label={breathing ? `Generating ${ariaLabel}` : ariaLabel}
    >
      <img
        src={ELEMENTOR_PRODUCT_SPLASH_PATH}
        alt=""
        className={cn(
          "absolute inset-0 h-full w-full opacity-90",
          isTile ? "object-cover" : "object-contain",
          breathing ? "animate-video-product-splash-breathe" : "",
        )}
      />
      <div className={cn("pointer-events-none absolute inset-0", isTile ? "bg-black/45" : "bg-black/35")} aria-hidden />
    </div>
  );
}
