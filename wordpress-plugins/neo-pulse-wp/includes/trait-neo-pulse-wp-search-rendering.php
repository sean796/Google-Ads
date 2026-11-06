<?php
/**
 * Search shortcode rendering and front-end assets.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Search_Trait_Rendering {

	// ── Shortcode ────────────────────────────────────────────────

	/**
	 * @param array<string,string>|string $atts Shortcode attributes.
	 * @return string
	 */
	public static function render_shortcode( $atts = array() ): string {
		$atts = shortcode_atts(
			array(
				'layout' => '',
				'slot'   => '',
			),
			is_array( $atts ) ? $atts : array(),
			'neo-pulse_search'
		);

		return self::render_instance( $atts );
	}

	/**
	 * Render a search instance (shortcode, Elementor widget, or programmatic).
	 *
	 * @param array<string,mixed> $instance Per-instance overrides.
	 * @return string
	 */
	public static function render_instance( array $instance = array() ): string {
		$settings   = self::merge_instance_settings( $instance );
		$sidebar    = Neo_Pulse_Wp_Ai_Widget_Design::resolve_sidebar_config( 'search', $instance );
		$insights   = Neo_Pulse_Wp_Ai_Widget_Design::resolve_search_insights( $instance );
		$options    = Neo_Pulse_Wp_Search_Render::options( $instance, $settings, $sidebar, $insights );
		$rest_url   = rest_url( self::REST_NAMESPACE . '/search' );
		// Logged-out visitors get no REST nonce: search is public, and a nonce baked into a cached
		// page (or a tab left open) expires after 12-24 h, after which WordPress refuses the request.
		$nonce      = is_user_logged_in() ? wp_create_nonce( 'wp_rest' ) : '';

		self::enqueue_search_assets(
			array(
				'display_mode' => $options['mode'] === 'icon' ? 'icon_only' : 'inline',
				'icon_open_as' => $options['open_as'],
			)
		);

		return Neo_Pulse_Wp_Search_Render::render( $options, $rest_url, $nonce );
	}

	/**
	 * Merge global search settings with per-instance overrides.
	 *
	 * @param array<string,mixed> $instance
	 * @return array<string,mixed>
	 */
	private static function merge_instance_settings( array $instance ): array {
		$global    = self::get_search_settings();
		$use_global = ! isset( $instance['use_global_settings'] )
			|| $instance['use_global_settings'] === 'yes'
			|| $instance['use_global_settings'] === true;

		if ( $use_global ) {
			$merged = $global;
		} else {
			$merged = wp_parse_args( $instance, $global );
		}

		$content_keys = array( 'placeholder', 'button_label', 'max_results' );
		foreach ( $content_keys as $key ) {
			if ( isset( $instance[ $key ] ) && $instance[ $key ] !== '' ) {
				$merged[ $key ] = $instance[ $key ];
			}
		}

		// Only content keys are used by the renderer; styling comes from the widget's --nps-* variables.
		$merged['placeholder']  = sanitize_text_field( (string) $merged['placeholder'] );
		$merged['button_label'] = sanitize_text_field( (string) $merged['button_label'] );
		$merged['max_results']  = max( 1, min( 20, (int) $merged['max_results'] ) );

		return $merged;
	}


	/**
	 * Register shared sidebar shell assets.
	 */
	public static function register_sidebar_assets(): void {
		$base_url = plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE );
		$ver      = self::search_asset_version();

		wp_register_style(
			'neo-pulse-ai-sidebar-shell',
			$base_url . 'assets/shared/neo-pulse-ai-sidebar-shell.css',
			array(),
			$ver
		);

		wp_register_script(
			'neo-pulse-ai-sidebar-shell',
			$base_url . 'assets/shared/neo-pulse-ai-sidebar-shell.js',
			array(),
			$ver,
			true
		);

		wp_register_style(
			'neo-pulse-ai-sidebar-unify',
			$base_url . 'assets/shared/neo-pulse-ai-sidebar-unify.css',
			array( 'neo-pulse-ai-sidebar-shell' ),
			$ver
		);

		wp_register_script(
			'neo-pulse-ai-sidebar-unify',
			$base_url . 'assets/shared/neo-pulse-ai-sidebar-unify.js',
			array( 'neo-pulse-ai-sidebar-shell' ),
			$ver,
			true
		);
	}

	/**
	 * Register front-end search assets (for Elementor depends + lazy enqueue).
	 */
	public static function register_search_assets(): void {
		$asset_ver = self::search_asset_version();
		$base_url  = plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE );

		self::register_sidebar_assets();

		wp_register_style(
			'neo-pulse-search',
			$base_url . 'assets/search/neo-pulse-search.css',
			array( 'neo-pulse-ai-sidebar-shell' ),
			$asset_ver
		);

		wp_register_script(
			'neo-pulse-search',
			$base_url . 'assets/search/neo-pulse-search.js',
			array(),
			$asset_ver,
			true
		);
	}

	/**
	 * Enqueue registered search assets.
	 *
	 * @param array<string,mixed> $sidebar Optional sidebar config.
	 */
	public static function enqueue_search_assets( array $sidebar = array() ): void {
		$display_mode = ! empty( $sidebar['display_mode'] ) ? (string) $sidebar['display_mode'] : '';
		$is_sidebar   = $display_mode === 'sidebar';
		$icon_open_as = (string) ( $sidebar['icon_open_as'] ?? 'sidebar_right' );
		$needs_shell  = $is_sidebar || ( $display_mode === 'icon_only' && $icon_open_as !== 'expand_inline' );
		self::register_search_assets();
		if ( $needs_shell ) {
			self::register_sidebar_assets();
			wp_deregister_script( 'neo-pulse-search' );
			wp_register_script(
				'neo-pulse-search',
				plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . 'assets/search/neo-pulse-search.js',
				array( 'neo-pulse-ai-sidebar-shell', 'neo-pulse-ai-sidebar-unify' ),
				self::search_asset_version(),
				true
			);
		}
		wp_enqueue_style( 'neo-pulse-search' );
		if ( $needs_shell ) {
			wp_enqueue_style( 'neo-pulse-ai-sidebar-shell' );
			wp_enqueue_script( 'neo-pulse-ai-sidebar-shell' );
			wp_enqueue_script( 'neo-pulse-ai-sidebar-unify' );
		}
		wp_enqueue_script( 'neo-pulse-search' );
	}

	/**
	 * Cache-bust front-end search assets when files change.
	 */
	public static function search_asset_version(): string {
		$css = NEO_PULSE_WP_PLUGIN_DIR . 'assets/search/neo-pulse-search.css';
		$js  = NEO_PULSE_WP_PLUGIN_DIR . 'assets/search/neo-pulse-search.js';
		$ver = defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '1';
		if ( is_readable( $css ) ) {
			$ver .= '.' . (string) filemtime( $css );
		}
		if ( is_readable( $js ) ) {
			$ver .= '.' . (string) filemtime( $js );
		}
		return $ver;
	}

	/**
	 * Admin "try it" demo on the Search screen: a plain search bar with the site settings.
	 * The renderer builds its own wrapper and styles.
	 *
	 * @param string              $rest_url Search REST endpoint.
	 * @param string              $nonce    wp_rest nonce.
	 * @param array<string,mixed> $settings Search settings.
	 * @param array<string,mixed> $instance Widget instance overrides.
	 * @param array<string,mixed> $sidebar  Sidebar config (resolved from $instance when empty).
	 * @param array<string,mixed> $insights Insights config (resolved from $instance when empty).
	 */
	public static function render_search_markup( string $rest_url, string $nonce, array $settings, array $instance = array(), array $sidebar = array(), array $insights = array() ): string {
		$sidebar  = $sidebar ? $sidebar : Neo_Pulse_Wp_Ai_Widget_Design::resolve_sidebar_config( 'search', $instance );
		$insights = $insights ? $insights : Neo_Pulse_Wp_Ai_Widget_Design::resolve_search_insights( $instance );
		$options  = Neo_Pulse_Wp_Search_Render::options( array_merge( array( 'display_mode' => 'inline' ), $instance ), $settings, $sidebar, $insights );
		return Neo_Pulse_Wp_Search_Render::render( $options, $rest_url, $nonce );
	}
}
