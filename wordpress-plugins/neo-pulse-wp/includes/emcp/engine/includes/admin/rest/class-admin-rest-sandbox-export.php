<?php
/**
 * Export as plugin screen REST (spec 8.15).
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Export as plugin REST.
 */
final class EMCP_Tools_Admin_REST_Sandbox_Export extends EMCP_Tools_Admin_REST_Controller {

	public function register_routes(): void {
		$this->route(
			'sandbox/export/plan',
			array(
				'methods'  => 'GET',
				'callback' => array( $this, 'plan' ),
				'args'     => array(
					'kinds' => array(
						'type'    => 'string',
						'default' => '',
					),
				),
			)
		);
	}

	/** The `widgets:export` child screen, shown while the module is on. */
	public static function register_screen(): void {
		EMCP_Tools_Admin_Screens::register(
			'sandbox-export',
			array(
				'script' => 'screen-sandbox-export',
				'root'   => 'pro',
				'tabs'   => array( 'widgets:export' ),
				'when'   => static function (): bool {
					return class_exists( 'EMCP_Tools_Plugin_Export_Module' ) && EMCP_Tools_Plugin_Export_Module::is_enabled();
				},
				'boot'   => static function (): array {
					return ( new EMCP_Tools_Admin_Sandbox_Export_Data() )->payload();
				},
			)
		);
	}

	/**
	 * The plan for a comma list of kinds ('' means none).
	 *
	 * @param WP_REST_Request $request Request.
	 */
	public function plan( $request ) {
		$kinds = array_filter( array_map( 'sanitize_key', explode( ',', (string) $request->get_param( 'kinds' ) ) ) );
		$res   = ( new EMCP_Tools_Admin_Sandbox_Export_Data() )->plan( array_values( $kinds ) );
		return is_wp_error( $res ) ? $res : new WP_REST_Response( $res );
	}
}
