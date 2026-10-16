<?php
/**
 * Neo EMCP Admin Bridge: mounts EMCP inside Neo Pulse -> Neo EMCP and applies
 * the Neo Pulse Black & Green theme on all Neo EMCP screens.
 *
 * Works seamlessly whether the bundled EMCP engine or a standalone EMCP plugin
 * booted first in the current request.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

final class Neo_Pulse_Wp_Emcp_Admin {

	const MENU_SLUG = 'neo-pulse-wp-emcp';

	public static function init(): void {
		add_filter( 'admin_body_class', array( __CLASS__, 'filter_admin_body_class' ), 30 );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_theme_override' ), 99 );
		add_filter( 'emcp_tools_admin_nav', array( __CLASS__, 'filter_nav_entries' ) );
	}

	/**
	 * Whether the current admin request is a Neo EMCP screen.
	 */
	public static function is_emcp_screen(): bool {
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		$page = isset( $_GET['page'] ) ? sanitize_key( wp_unslash( (string) $_GET['page'] ) ) : '';
		return self::MENU_SLUG === $page || 0 === strpos( $page, 'emcp-tools' );
	}

	/**
	 * Retrieve the active EMCP_Tools_Admin singleton from EMCP_Tools_Plugin::instance().
	 */
	public static function get_emcp_admin_instance(): ?object {
		if ( ! class_exists( 'EMCP_Tools_Plugin' ) ) {
			return null;
		}
		$plugin = EMCP_Tools_Plugin::instance();
		if ( method_exists( $plugin, 'get_admin' ) ) {
			$admin = $plugin->get_admin();
			if ( is_object( $admin ) ) {
				return $admin;
			}
		}
		try {
			$ref = new ReflectionProperty( $plugin, 'admin' );
			$ref->setAccessible( true );
			$admin = $ref->getValue( $plugin );
			if ( is_object( $admin ) ) {
				return $admin;
			}
		} catch ( Throwable $e ) {
			unset( $e );
		}
		if ( class_exists( 'EMCP_Tools_Admin' ) ) {
			return new EMCP_Tools_Admin();
		}
		return null;
	}

	/**
	 * Ensure `emcp-admin-frame` is present on body when viewing `page=neo-pulse-wp-emcp`.
	 *
	 * @param string|mixed $classes Admin body classes.
	 * @return string|mixed
	 */
	public static function filter_admin_body_class( $classes ) {
		if ( ! is_string( $classes ) || ! self::is_emcp_screen() ) {
			return $classes;
		}
		if ( false === strpos( $classes, 'emcp-admin-frame' ) && class_exists( 'EMCP_Tools_Admin_Frame' ) ) {
			$classes = EMCP_Tools_Admin_Frame::body_class( $classes, (string) get_user_setting( 'mfold', '' ) );
		}
		$classes .= ' neo-emcp-dark-screen';
		return $classes;
	}

	/**
	 * Render callback for admin.php?page=neo-pulse-wp-emcp.
	 */
	public static function render_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to access Neo EMCP.', 'neo-pulse-wp' ) );
		}

		$admin = self::get_emcp_admin_instance();
		if ( null !== $admin && method_exists( $admin, 'render_page' ) ) {
			ob_start();
			$admin->render_page();
			$html = (string) ob_get_clean();
			// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- rebrands escaped EMCP frame markup.
			echo self::rebrand_frame_markup( $html );
			return;
		}

		echo '<div class="wrap emcp-app eui-frame"><div class="eui-frame__content">';
		echo '<div class="eui-card"><div class="eui-card__body">';
		echo '<h1>' . esc_html__( 'Neo EMCP', 'neo-pulse-wp' ) . '</h1>';
		echo '<p>' . esc_html__( 'Neo EMCP engine is initializing. Reload this screen to open the workspace.', 'neo-pulse-wp' ) . '</p>';
		echo '</div></div></div></div>';
	}

	/**
	 * Replace standalone EMCP branding and strip promo carousels in rendered frame HTML.
	 */
	public static function rebrand_frame_markup( string $html ): string {
		$np_ver = defined( 'NEO_PULSE_WP_VERSION' ) ? (string) NEO_PULSE_WP_VERSION : '0.9.266';
		$svg    = class_exists( 'Neo_Pulse_Wp_Admin_Menu' ) ? Neo_Pulse_Wp_Admin_Menu::menu_icon_svg( '#84bd00' ) : '';
		$logo   = '<span class="eui-frame-brand__logo eui-frame-brand__logo--neo" aria-hidden="true">' . $svg . '</span>';

		$html = (string) preg_replace(
			'#<img[^>]+class="eui-frame-brand__logo"[^>]*>#i',
			$logo,
			$html
		);
		$html = str_replace(
			'<span class="eui-frame-brand__name">EMCP Tools</span>',
			'<span class="eui-frame-brand__name">Neo EMCP</span>',
			$html
		);
		$html = (string) preg_replace(
			'#<span class="eui-frame-brand__version eui-mono">[^<]*</span>#i',
			'<span class="eui-frame-brand__version eui-mono">v' . esc_html( $np_ver ) . ' · Neo Pulse</span>',
			$html
		);
		return $html;
	}

	/**
	 * Ensure the EMCP frame bundles (`ui.css`, `shell.css`, screen bundle) AND the
	 * Neo Pulse Black & Green stylesheet load on every Neo EMCP screen.
	 */
	public static function enqueue_theme_override(): void {
		if ( ! self::is_emcp_screen() ) {
			return;
		}

		// If `page=neo-pulse-wp-emcp` was opened and EMCP's own enqueue_assets skipped
		// because the hook is `neo-pulse-wp_page_neo-pulse-wp-emcp`, trigger it with
		// `toplevel_page_emcp-tools` so `ui.css`, `shell.css`, and the active screen bundle load.
		if ( ! wp_style_is( 'emcp-admin-ui', 'enqueued' ) ) {
			$admin = self::get_emcp_admin_instance();
			if ( null !== $admin && method_exists( $admin, 'enqueue_assets' ) ) {
				$admin->enqueue_assets( 'toplevel_page_emcp-tools' );
			}
		}

		if ( class_exists( 'Neo_Pulse_Wp_Admin_Menu' ) ) {
			Neo_Pulse_Wp_Admin_Menu::register_font_style();
		}

		$rel = 'assets/admin/admin-neo-emcp.css';
		$abs = NEO_PULSE_WP_PLUGIN_DIR . $rel;
		if ( ! is_readable( $abs ) ) {
			return;
		}
		$deps = array();
		if ( wp_style_is( 'emcp-admin-ui', 'enqueued' ) || wp_style_is( 'emcp-admin-ui', 'registered' ) ) {
			$deps[] = 'emcp-admin-ui';
		}
		if ( wp_style_is( 'emcp-admin-shell', 'enqueued' ) || wp_style_is( 'emcp-admin-shell', 'registered' ) ) {
			$deps[] = 'emcp-admin-shell';
		}
		$ver = ( defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '1.0.0' ) . '.' . (string) filemtime( $abs );
		wp_enqueue_style(
			'neo-pulse-wp-admin-neo-emcp',
			plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . $rel,
			$deps,
			$ver
		);

		$svg_json = wp_json_encode( class_exists( 'Neo_Pulse_Wp_Admin_Menu' ) ? Neo_Pulse_Wp_Admin_Menu::menu_icon_svg( '#84bd00' ) : '' );
		$ver_json = wp_json_encode( 'v' . ( defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '0.9.266' ) . ' · Neo Pulse' );
		$inline_js = "(function(){var b=document.querySelector('.emcp-app .eui-frame-brand');if(!b)return;var n=b.querySelector('.eui-frame-brand__name');if(n)n.textContent='Neo EMCP';var v=b.querySelector('.eui-frame-brand__version');if(v)v.textContent={$ver_json};var img=b.querySelector('img.eui-frame-brand__logo');if(img){var s=document.createElement('span');s.className='eui-frame-brand__logo eui-frame-brand__logo--neo';s.innerHTML={$svg_json};img.replaceWith(s);}})();";
		if ( wp_script_is( 'emcp-admin-shell', 'enqueued' ) ) {
			wp_add_inline_script( 'emcp-admin-shell', $inline_js, 'after' );
		}
	}

	/**
	 * Keep the Dashboard link in the Neo EMCP sidebar pointed at neo-pulse-wp-emcp.
	 *
	 * @param array<int,array<string,mixed>> $entries Sidebar nav entries.
	 * @return array<int,array<string,mixed>>
	 */
	public static function filter_nav_entries( array $entries ): array {
		foreach ( $entries as $i => $entry ) {
			if ( isset( $entry['id'] ) && 'dashboard' === $entry['id'] ) {
				$entries[ $i ]['url'] = admin_url( 'admin.php?page=' . self::MENU_SLUG );
			}
		}
		return $entries;
	}
}
