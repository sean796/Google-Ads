import type { ProductViewId } from "./video-generator-types";

/** Vendored Elementor default placeholder (see Elementor get_placeholder_image_src docs). */
export const ELEMENTOR_PRODUCT_SPLASH_PATH = "/video-studio/elementor-placeholder.png";

const SPLASH_BY_VIEW: Record<ProductViewId, string> = {
  front_elevation: ELEMENTOR_PRODUCT_SPLASH_PATH,
  three_quarter: ELEMENTOR_PRODUCT_SPLASH_PATH,
  side_elevation: ELEMENTOR_PRODUCT_SPLASH_PATH,
  glazing_detail: ELEMENTOR_PRODUCT_SPLASH_PATH,
};

export function getProductViewSplashSrc(viewId: ProductViewId): string {
  return SPLASH_BY_VIEW[viewId];
}
