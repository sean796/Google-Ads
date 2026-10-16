<?php
/**
 * Export as plugin screen data (spec 8.15). The build itself stays the
 * module's admin_post download.
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Export as plugin: defaults, plan and build form.
 */
final class EMCP_Tools_Admin_Sandbox_Export_Data {

	const KINDS  = array( 'widgets', 'blocks', 'snippets' );
	const MARKER = 'exported from Neo EMCP';

	/**
	 * The module is on and the licence active.
	 *
	 * @return true|WP_Error
	 */
	public static function available() {
		if ( ! class_exists( 'EMCP_Tools_Plugin_Export_Module' ) || ! EMCP_Tools_Plugin_Export_Module::is_enabled() ) {
			return new WP_Error( 'emcp_export_off', __( 'The Sandbox Plugin Export module is switched off.', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		if ( ! function_exists( 'emcp_tools_fs' ) || ! emcp_tools_fs()->can_use_premium_code() ) {
			return new WP_Error( 'emcp_export_pro', __( 'Sandbox Plugin Export requires Neo EMCP.', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		EMCP_Tools_Plugin_Export_Module::load_classes();
		return true;
	}

	/**
	 * Plugins a previous export generated, from their header marker.
	 *
	 * @return array[] { file, name, version, active }.
	 */
	public static function installed_exports(): array {
		if ( ! function_exists( 'get_plugins' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$out = array();
		foreach ( (array) get_plugins() as $file => $p ) {
			if ( false !== stripos( (string) ( $p['Description'] ?? '' ), self::MARKER ) ) {
				$out[] = array(
					'file'    => (string) $file,
					'name'    => (string) ( $p['Name'] ?? $file ),
					'version' => (string) ( $p['Version'] ?? '' ),
					'active'  => function_exists( 'is_plugin_active' ) && is_plugin_active( (string) $file ),
				);
			}
		}
		return $out;
	}

	/**
	 * A plan with per-kind counts and the total.
	 *
	 * @param array $plan Planner output.
	 */
	private static function summarise( array $plan ): array {
		$counts = array();
		foreach ( self::KINDS as $kind ) {
			$counts[ $kind ] = count( (array) ( $plan[ $kind ] ?? array() ) );
		}
		return array(
			'plan'   => $plan,
			'counts' => $counts,
			'total'  => array_sum( $counts ),
		);
	}

	/**
	 * The plan for the chosen kinds.
	 *
	 * @param string[] $kinds Chosen kinds.
	 * @return array|WP_Error
	 */
	public function plan( array $kinds ) {
		$ok = self::available();
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$opts = array();
		foreach ( self::KINDS as $kind ) {
			$opts[ $kind ] = in_array( $kind, $kinds, true );
		}
		return self::summarise( EMCP_Tools_Plugin_Export_Planner::plan( $opts ) );
	}

	/** Boot payload: defaults, the full plan, the build form and any notices. */
	public function payload(): array {
		$ok = self::available();
		if ( is_wp_error( $ok ) ) {
			return array( 'error' => $ok->get_error_message() );
		}
		$all  = self::summarise( EMCP_Tools_Plugin_Export_Planner::plan( array() ) );
		$site = (string) get_bloginfo( 'name' );
		$user = wp_get_current_user();
		$temp = EMCP_Tools_Plugin_Export_Builder::private_temp_dir();
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only notice after the build redirect.
		$error = isset( $_GET['export_error'] ) ? sanitize_text_field( wp_unslash( $_GET['export_error'] ) ) : '';
		return array_merge(
			$all,
			array(
				'defaults'   => array(
					'name'    => $site . ' Custom Elements',
					'slug'    => sanitize_title( $site . ' custom elements' ),
					'author'  => $user && isset( $user->display_name ) ? (string) $user->display_name : '',
					'version' => '1.0.0',
				),
				'reserved'   => EMCP_Tools_Plugin_Export_Builder::RESERVED_SLUGS,
				'tempError'  => is_wp_error( $temp ) ? $temp->get_error_message() : '',
				'buildError' => $error,
				'existing'   => self::installed_exports(),
				'build'      => array(
					'url'    => admin_url( 'admin-post.php' ),
					'action' => EMCP_Tools_Plugin_Export_Module::ACTION_BUILD,
					'nonce'  => wp_create_nonce( EMCP_Tools_Plugin_Export_Module::NONCE ),
				),
				'backUrl'    => admin_url( 'admin.php?page=emcp-tools-widgets' ),
			)
		);
	}
}
