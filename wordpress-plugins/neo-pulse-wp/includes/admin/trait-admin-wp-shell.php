<?php
/**
 * Admin assets, menu, and global notice.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Wp_Shell {

	/**
	 * Screen hook names of every NEO Pulse admin page, derived from the menu registry so new
	 * screens are covered automatically. The menu title "NEO Pulse WP" makes the submenu hooks
	 * `neo-pulse-wp_page_<slug>`; admin_hook_matches() treats `-` and `_` as the same.
	 *
	 * @return array<int, string>
	 */
	private static function neo_pulse_admin_screen_ids(): array {
		$ids = array( 'toplevel_page_' . Neo_Pulse_Wp_Admin_Menu::PARENT_SLUG );
		foreach ( array_keys( Neo_Pulse_Wp_Admin_Menu::pages() ) as $slug ) {
			$ids[] = 'neo-pulse-wp_page_' . $slug;
		}
		return $ids;
	}

	/**
	 * WordPress 6.8+ / 7.x keep hyphens in plugin page hook names
	 * (`neo-pulse-wp_page_neo-pulse-wp-chat`). Older lists used an underscore
	 * after `neo` (`neo_pulse-wp-chat`). Compare them as the same screen.
	 *
	 * @param array<int, string> $ids
	 */
	public static function admin_hook_matches( string $hook_suffix, array $ids ): bool {
		if ( $hook_suffix === '' ) {
			return false;
		}
		$want = str_replace( '-', '_', strtolower( $hook_suffix ) );
		foreach ( $ids as $id ) {
			if ( str_replace( '-', '_', strtolower( (string) $id ) ) === $want ) {
				return true;
			}
		}
		return false;
	}

	public static function is_neo_pulse_plugin_screen( string $hook_suffix = '' ): bool {
		if ( $hook_suffix !== '' && self::admin_hook_matches( $hook_suffix, self::neo_pulse_admin_screen_ids() ) ) {
			return true;
		}
		$page = isset( $_GET['page'] ) ? sanitize_key( (string) wp_unslash( $_GET['page'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		return $page !== '' && str_starts_with( $page, 'neo-pulse-wp' );
	}

	/**
	 * @param string|mixed $classes Space-separated admin body classes.
	 * @return string|mixed
	 */
	public static function admin_body_class( $classes ) {
		if ( ! is_string( $classes ) ) {
			return $classes;
		}
		$screen = function_exists( 'get_current_screen' ) ? get_current_screen() : null;
		$hook   = $screen ? (string) $screen->id : '';
		if ( self::is_neo_pulse_plugin_screen( $hook ) ) {
			$classes .= ' neo-pulse-wp-admin-screen';
		}
		return $classes;
	}

	/**
	 * Strip third-party WP admin notices on NEO Pulse screens (ACF, SEO plugins, etc.).
	 */
	public static function suppress_foreign_admin_notices(): void {
		if ( ! is_admin() ) {
			return;
		}

		$page = isset( $_GET['page'] ) ? sanitize_key( (string) wp_unslash( $_GET['page'] ) ) : ''; // phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( $page === '' || strpos( $page, 'neo-pulse-wp' ) !== 0 ) {
			return;
		}

		remove_all_actions( 'admin_notices' );
		remove_all_actions( 'all_admin_notices' );
		remove_all_actions( 'network_admin_notices' );
		remove_all_actions( 'user_admin_notices' );
	}

	/**
	 * @param string|mixed $hook_suffix Current admin page hook.
	 */
	public static function enqueue_admin_assets( $hook_suffix ): void {
		$hook_suffix = is_string( $hook_suffix ) ? $hook_suffix : '';
		if ( class_exists( 'Neo_Pulse_Wp_Emcp_Admin' ) && Neo_Pulse_Wp_Emcp_Admin::is_emcp_screen() ) {
			return;
		}
		if ( ! self::is_neo_pulse_plugin_screen( $hook_suffix ) ) {
			return;
		}

		wp_enqueue_style( 'dashicons' );
		// Bundled Poppins replaces the old Google Fonts Lato request. The "neo-pulse-wp-lato" handle
		// stays registered (no source) because other admin styles list it as a dependency.
		Neo_Pulse_Wp_Admin_Menu::register_font_style();
		wp_register_style( 'neo-pulse-wp-lato', false, array( 'neo-pulse-wp-admin-fonts' ), null );
		wp_enqueue_style( 'neo-pulse-wp-lato' );

		$css_files = array(
			'neo-pulse-wp-admin-tokens'         => 'admin-tokens.css',
			'neo-pulse-wp-admin-dashboard'      => 'admin-dashboard.css',
			'neo-pulse-wp-admin-settings'       => 'admin-settings.css',
			'neo-pulse-wp-admin-panel'          => 'admin-panel.css',
			'neo-pulse-wp-admin-analytics'      => 'admin-analytics.css',
			'neo-pulse-wp-admin-redirects'       => 'admin-redirects.css',
			'neo-pulse-wp-admin-chat-logs'       => 'admin-chat-logs.css',
			'neo-pulse-wp-admin-overseer'        => 'admin-overseer.css',
			'neo-pulse-wp-admin-script-manager'  => 'admin-script-manager.css',
			'neo-pulse-wp-admin-typography'      => 'admin-typography-enforce.css',
			'neo-pulse-wp-admin-buttons'         => 'admin-buttons.css',
			'neo-pulse-wp-admin-search'          => 'admin-search.css',
			'neo-pulse-wp-admin-tool-library'    => 'admin-tool-library.css',
			'neo-pulse-wp-admin-contrast'        => 'admin-contrast-enforce.css',
			'neo-pulse-wp-admin-site-schema'    => 'admin-site-schema.css',
			'neo-pulse-wp-admin-seo'            => 'admin-seo.css',
			// Neo Tools look (header bar, frame, cards, buttons, tables). Keep last.
			'neo-pulse-wp-admin-neo-theme'      => 'admin-neo-theme.css',
		);

		// Sheets whose selectors are all scoped to one screen's wrapper class load only there.
		// admin-seo.css also styles the 404 log, which renders on the Redirects screen.
		// (admin-image-seo.css is enqueued by enqueue_image_seo_assets() on its own screen.)
		$screen_only = array(
			'neo-pulse-wp-admin-redirects'    => array( 'neo-pulse-wp-redirects' ),
			'neo-pulse-wp-admin-chat-logs'    => array( 'neo-pulse-wp-chat-logs' ),
			'neo-pulse-wp-admin-overseer'     => array( 'neo-pulse-wp-overseer' ),
			'neo-pulse-wp-admin-tool-library' => array( 'neo-pulse-wp-tool-library' ),
			'neo-pulse-wp-admin-seo'          => array( 'neo-pulse-wp-seo', 'neo-pulse-wp-redirects' ),
		);
		$current_page = Neo_Pulse_Wp_Admin_Menu::current_page();

		$deps = array( 'neo-pulse-wp-lato' );
		foreach ( $css_files as $handle => $file ) {
			if ( isset( $screen_only[ $handle ] ) && ! in_array( $current_page, $screen_only[ $handle ], true ) ) {
				continue;
			}
			$rel = 'assets/admin/' . $file;
			$abs = NEO_PULSE_WP_PLUGIN_DIR . $rel;
			$ver = defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '0.5.0';
			if ( is_readable( $abs ) ) {
				$ver .= '.' . (string) filemtime( $abs );
			}
			wp_enqueue_style(
				$handle,
				plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . $rel,
				$deps,
				$ver
			);
			$deps[] = $handle;
		}

		if (
			self::admin_hook_matches(
				$hook_suffix,
				array( 'neo-pulse-wp_page_neo_pulse-wp-backend-assist', 'neo-pulse-wp_page_neo_pulse-wp-chat' )
			)
			&& Neo_Pulse_Wp_OpenRouter::get_api_key() !== ''
		) {
			// Head load so inline page scripts can use NeoPulseVoice / safe unlock helpers.
			Neo_Pulse_Wp_Voice::enqueue_assets( array(), false );
		}

		if ( self::admin_hook_matches( $hook_suffix, array( 'neo-pulse-wp_page_neo_pulse-wp-backend-assist' ) ) ) {
			self::enqueue_backend_assist_script();
		}

		if ( self::admin_hook_matches( $hook_suffix, array( 'neo-pulse-wp_page_neo_pulse-wp-chat' ) ) ) {
			self::enqueue_chat_demo_assets();
		}
	}

	/**
	 * Chat admin demo: inline sidebar preview styles (matches frontend widget).
	 */
	private static function enqueue_chat_demo_assets(): void {
		$base = plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE );
		$ver  = defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '0.9.33';

		Neo_Pulse_Wp_Voice::enqueue_thinking_card_assets( true );
		wp_enqueue_script( 'neo-pulse-display-text' );
		wp_enqueue_script( 'neo-pulse-markdown' );

		wp_enqueue_style( 'neo-pulse-ai-sidebar-shell', $base . 'assets/shared/neo-pulse-ai-sidebar-shell.css', array( 'neo-pulse-wp-lato' ), $ver );
		wp_enqueue_style( 'neo-pulse-chat-widget', $base . 'assets/frontend/neo-pulse-chat-widget.css', array( 'neo-pulse-wp-lato' ), $ver );
		wp_enqueue_style( 'neo-pulse-chat-chrome', $base . 'assets/frontend/neo-pulse-chat-chrome.css', array( 'neo-pulse-chat-widget' ), $ver );

		$demo_css = NEO_PULSE_WP_PLUGIN_DIR . 'assets/admin/admin-chat-demo.css';
		if ( is_readable( $demo_css ) ) {
			$ver .= '.' . (string) filemtime( $demo_css );
		}
		wp_enqueue_style(
			'neo-pulse-chat-demo',
			$base . 'assets/admin/admin-chat-demo.css',
			array( 'neo-pulse-chat-chrome', 'neo-pulse-ai-sidebar-shell', 'neo-pulse-wp-admin-contrast' ),
			$ver
		);

		$demo_js = NEO_PULSE_WP_PLUGIN_DIR . 'assets/admin/admin-chat-demo.js';
		$js_ver  = $ver;
		if ( is_readable( $demo_js ) ) {
			$js_ver .= '.' . (string) filemtime( $demo_js );
		}
		$demo_deps = array( 'neo-pulse-thinking-card', 'neo-pulse-chat-stream', 'neo-pulse-chat-prefetch', 'neo-pulse-chat-debug-log', 'neo-pulse-display-text', 'neo-pulse-markdown' );
		wp_enqueue_script(
			'neo-pulse-chat-demo',
			$base . 'assets/admin/admin-chat-demo.js',
			$demo_deps,
			$js_ver,
			true
		);

		$chat_settings = Neo_Pulse_Wp_Chat::get_settings();
		wp_localize_script(
			'neo-pulse-chat-demo',
			'neoPulseChatDemo',
			array(
				'ajaxUrl'       => admin_url( 'admin-ajax.php' ),
				'streamNonce'   => wp_create_nonce( 'neo_pulse_chat_stream' ),
				'greetingStyle' => isset( $chat_settings['greeting_style'] ) ? (string) $chat_settings['greeting_style'] : 'friendly',
				'brainSvg'      => self::brand_icon_svg( '#4285f4', 24 ),
				'ui'            => Neo_Pulse_Wp_Ai_Widget_Design::get_settings()['chat_ui'] ?? array(),
			)
		);
	}
}
