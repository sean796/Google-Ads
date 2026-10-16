<?php
/**
 * Sandbox Plugin Export Pro module.
 *
 * Exports every active Sandbox artifact (Elementor widgets, Gutenberg blocks,
 * PHP snippets) as a standalone WordPress plugin ZIP that keeps working with
 * Neo EMCP deactivated. Admin-only: nothing here runs on the front end, and
 * the export is read-only with respect to the Sandbox.
 *
 * Design: docs/superpowers/specs/2026-09-21-sandbox-plugin-export-design.md
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @since 3.18.0
 */
class EMCP_Tools_Plugin_Export_Module extends EMCP_Tools_Module {

	const ID           = 'plugin-export';
	const NONCE        = 'emcp_tools_export_plugin';
	const ACTION_BUILD = 'emcp_tools_export_plugin_build';

	public function id(): string {
		return self::ID;
	}

	public function title(): string {
		return __( 'Sandbox Plugin Export', 'emcp-tools' );
	}

	public function description(): string {
		return __( 'Package every active Sandbox widget, block and PHP snippet as a standalone plugin, so they keep working after Neo EMCP is removed.', 'emcp-tools' );
	}

	public function tier(): string {
		return 'pro';
	}

	/** Modules screen group. */
	public function group(): string {
		return 'site';
	}

	/** Modules screen icon. */
	public function icon(): string {
		return 'package';
	}

	public function default_active(): bool {
		return true;
	}

	public function is_available(): bool {
		return function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code();
	}

	/**
	 * Kill switch readable before the module boots (admin views, handlers).
	 */
	public static function is_enabled(): bool {
		return in_array( self::ID, (array) get_option( EMCP_Tools_Module::OPTION_ACTIVE, array() ), true );
	}

	public function settings_url(): string {
		return self::export_view_url();
	}

	/**
	 * The Sandbox export screen.
	 */
	public static function export_view_url(): string {
		return admin_url( 'admin.php?page=' . EMCP_Tools_Admin::PAGE_SLUG . '-widgets&view=export' );
	}

	public function render_settings(): void {}

	/**
	 * Called on `init` (priority 5) only when active + available.
	 */
	public function register(): void {
		self::load_classes();
		add_action( 'admin_post_' . self::ACTION_BUILD, array( $this, 'handle_build' ) );
	}

	/**
	 * Requires the planner + builder (dual-root, guarded). Safe to call more than once.
	 */
	public static function load_classes(): void {
		foreach ( array( 'includes/export/class-plugin-export-planner.php', 'includes/export/class-plugin-export-builder.php' ) as $rel ) {
			$p = EMCP_Tools_Pro_Loader::path( $rel );
			if ( '' !== $p ) {
				require_once $p;
			}
		}
	}

	/**
	 * The four checks every handler runs, in this order: capability, nonce,
	 * module enabled, premium licence.
	 *
	 * @return true|WP_Error
	 */
	public static function authorize() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new WP_Error( 'forbidden', __( 'You do not have permission to do that.', 'emcp-tools' ) );
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- this IS the nonce check.
		$nonce = isset( $_REQUEST['_wpnonce'] ) ? sanitize_text_field( wp_unslash( $_REQUEST['_wpnonce'] ) ) : '';
		if ( ! wp_verify_nonce( $nonce, self::NONCE ) ) {
			return new WP_Error( 'bad_nonce', __( 'Your session expired. Reload the page and try again.', 'emcp-tools' ) );
		}
		if ( ! self::is_enabled() ) {
			return new WP_Error( 'module_off', __( 'The Sandbox Plugin Export module is switched off.', 'emcp-tools' ) );
		}
		if ( ! function_exists( 'emcp_tools_fs' ) || ! emcp_tools_fs()->can_use_premium_code() ) {
			return new WP_Error( 'premium_required', __( 'Sandbox Plugin Export requires Neo EMCP.', 'emcp-tools' ) );
		}
		return true;
	}

	/**
	 * Reads the export options from the request (build form or plan AJAX).
	 * Fields carry an emcp_ prefix so they can never collide with WordPress
	 * query vars such as `name` and `author`.
	 *
	 * @return array{name:string,slug:string,author:string,version:string,embed_keys:bool,widgets:bool,blocks:bool,snippets:bool}
	 */
	public static function options_from_request(): array {
		// phpcs:disable WordPress.Security.NonceVerification.Recommended -- authorize() runs first.
		$kinds = isset( $_REQUEST['emcp_kinds'] ) && is_array( $_REQUEST['emcp_kinds'] ) ? array_map( 'sanitize_key', wp_unslash( $_REQUEST['emcp_kinds'] ) ) : array( 'widgets', 'blocks', 'snippets' );
		$name  = isset( $_REQUEST['emcp_name'] ) ? sanitize_text_field( wp_unslash( $_REQUEST['emcp_name'] ) ) : '';
		$slug  = isset( $_REQUEST['emcp_slug'] ) ? sanitize_text_field( wp_unslash( $_REQUEST['emcp_slug'] ) ) : '';
		$auth  = isset( $_REQUEST['emcp_author'] ) ? sanitize_text_field( wp_unslash( $_REQUEST['emcp_author'] ) ) : '';
		$ver   = isset( $_REQUEST['emcp_version'] ) ? sanitize_text_field( wp_unslash( $_REQUEST['emcp_version'] ) ) : '1.0.0';
		$embed = ! empty( $_REQUEST['emcp_embed_keys'] );
		// phpcs:enable
		return array(
			'name'       => '' !== $name ? $name : get_bloginfo( 'name' ) . ' Custom Elements',
			'slug'       => '' !== $slug ? $slug : sanitize_title( get_bloginfo( 'name' ) . ' custom elements' ),
			'author'     => $auth,
			'version'    => '' !== $ver ? $ver : '1.0.0',
			'embed_keys' => $embed,
			'widgets'    => in_array( 'widgets', $kinds, true ),
			'blocks'     => in_array( 'blocks', $kinds, true ),
			'snippets'   => in_array( 'snippets', $kinds, true ),
		);
	}

	/**
	 * admin-post: build the ZIP and stream it, or redirect back with the error.
	 */
	public function handle_build(): void {
		$ok = self::authorize();
		if ( is_wp_error( $ok ) ) {
			wp_die( esc_html( $ok->get_error_message() ), '', array( 'response' => 403 ) );
		}
		self::load_classes();
		$opts = self::options_from_request();
		$plan = EMCP_Tools_Plugin_Export_Planner::plan( $opts );
		$zip  = EMCP_Tools_Plugin_Export_Builder::build( $plan, $opts );
		if ( is_wp_error( $zip ) ) {
			wp_safe_redirect( add_query_arg( 'export_error', rawurlencode( $zip->get_error_message() ), self::export_view_url() ) );
			exit;
		}
		$slug = EMCP_Tools_Plugin_Export_Builder::sanitize_slug( $opts['slug'] );
		$slug = is_wp_error( $slug ) ? 'emcp-export' : $slug;
		EMCP_Tools_Plugin_Export_Builder::stream( $zip, $slug . '-' . sanitize_file_name( $opts['version'] ) . '.zip' );
	}

}
