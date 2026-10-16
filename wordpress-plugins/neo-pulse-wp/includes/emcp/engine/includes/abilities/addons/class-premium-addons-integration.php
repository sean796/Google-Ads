<?php
/**
 * Premium Addons for Elementor widget-pack adapter.
 *
 * Same shape as Essential Addons: PA registers its widgets into Elementor's
 * registry, so placement already works via `add-free-widget` and this adapter
 * supplies discovery + curation only. See EMCP_Tools_Addon_Pack_Integration.
 *
 * @package EMCP_Tools
 * @since   3.6.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Premium Addons pack.
 *
 * @since 3.6.0
 */
class EMCP_Tools_PremiumAddons_Integration extends EMCP_Tools_Addon_Pack_Integration {

	/**
	 * @return string
	 */
	public function id(): string {
		return 'premium-addons';
	}

	/**
	 * @return string
	 */
	public function label(): string {
		return 'Premium Addons for Elementor';
	}

	/**
	 * PA registers widgets under `premium-` (free and pro tiers alike).
	 *
	 * @return string[]
	 */
	public function prefixes(): array {
		return array( 'premium-' );
	}

	/**
	 * @return bool
	 */
	public function is_active(): bool {
		return defined( 'PREMIUM_ADDONS_VERSION' )
			|| defined( 'PREMIUM_ADDONS_FILE' )
			|| class_exists( 'PremiumAddons\Includes\Addons_Integration' );
	}
}
