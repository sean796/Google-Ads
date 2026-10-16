<?php
/**
 * Essential Addons for Elementor (Lite and Pro) widget-pack adapter.
 *
 * EA registers its widgets into Elementor's widget registry under the `eael-`
 * prefix (63 widgets on a stock Lite install). Placement already works through
 * `add-free-widget`, so this adapter only supplies discovery and curation. See
 * EMCP_Tools_Addon_Pack_Integration for the reasoning.
 *
 * @package EMCP_Tools
 * @since   3.6.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Essential Addons pack.
 *
 * @since 3.6.0
 */
class EMCP_Tools_EssentialAddons_Integration extends EMCP_Tools_Addon_Pack_Integration {

	/**
	 * @return string
	 */
	public function id(): string {
		return 'essential-addons';
	}

	/**
	 * @return string
	 */
	public function label(): string {
		return 'Essential Addons for Elementor';
	}

	/**
	 * EA's widget-name prefix. Both the Lite and Pro widget sets use `eael-`,
	 * so a single prefix covers the whole pack and the registry filter picks up
	 * whichever tier is actually installed.
	 *
	 * @return string[]
	 */
	public function prefixes(): array {
		return array( 'eael-' );
	}

	/**
	 * True when Essential Addons (either tier) is active.
	 *
	 * @return bool
	 */
	public function is_active(): bool {
		return defined( 'EAEL_PLUGIN_VERSION' )
			|| class_exists( '\Essential_Addons_Elementor\Classes\Bootstrap' );
	}
}
