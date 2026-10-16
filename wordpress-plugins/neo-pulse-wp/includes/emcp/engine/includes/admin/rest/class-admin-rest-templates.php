<?php
/**
 * Templates screen REST (spec 8.16).
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class EMCP_Tools_Admin_REST_Templates extends EMCP_Tools_Admin_REST_Controller {

	public function register_routes(): void {
		$this->route(
			'templates',
			array(
				'methods'  => 'GET',
				'callback' => array( $this, 'get' ),
				'args'     => array(
					'search'   => array( 'type' => 'string', 'default' => '' ),
					'category' => array( 'type' => 'string', 'default' => '' ),
					'builder'  => array( 'type' => 'string', 'default' => '' ),
					'sort'     => array( 'type' => 'string', 'default' => 'default' ),
					'page'     => array( 'type' => 'integer', 'default' => 1 ),
				),
			)
		);
		$this->route( 'templates/sync', array( 'methods' => 'POST', 'callback' => array( $this, 'sync' ) ) );
		$this->route( 'templates/(?P<category>[a-z0-9-]+)/(?P<slug>[a-z0-9-]+)/apply', array( 'methods' => 'POST', 'callback' => array( $this, 'apply' ) ) );
	}

	public static function register_screen(): void {
		EMCP_Tools_Admin_Screens::register(
			'templates',
			array(
				'script' => 'screen-templates',
				'root'   => 'pro',
				'tabs'   => array( 'templates' ),
				'boot'   => static function (): array {
					return ( new EMCP_Tools_Admin_Templates_Data() )->payload();
				},
			)
		);
	}

	private static function query( $request ): array {
		return array(
			'search'   => sanitize_text_field( (string) $request->get_param( 'search' ) ),
			'category' => sanitize_key( (string) $request->get_param( 'category' ) ),
			'builder'  => sanitize_key( (string) $request->get_param( 'builder' ) ),
			'sort'     => sanitize_key( (string) $request->get_param( 'sort' ) ),
			'page'     => max( 1, (int) $request->get_param( 'page' ) ),
		);
	}

	public function get( $request ) {
		return new WP_REST_Response( ( new EMCP_Tools_Admin_Templates_Data() )->payload( self::query( $request ) ) );
	}

	public function sync( $request ) {
		if ( ! EMCP_Tools_Admin_Templates_Data::pro_class() || ! EMCP_Tools_Pro_Templates::user_has_access() ) {
			return new WP_Error( 'emcp_no_license', __( 'Syncing the template library needs an active Neo EMCP licence.', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		// A manual sync refreshes the global usage counts along with the bundle.
		if ( class_exists( 'EMCP_Tools_Pro_Usage' ) ) {
			EMCP_Tools_Pro_Usage::flush_counts();
		}
		$bundle = EMCP_Tools_Pro_Templates::get_bundle( true );
		if ( is_wp_error( $bundle ) ) {
			return new WP_Error( 'emcp_sync_failed', $bundle->get_error_message(), array( 'status' => 400 ) );
		}
		delete_transient( 'emcp_tools_nav_counts' );
		if ( class_exists( 'EMCP_Tools_Attention' ) ) {
			EMCP_Tools_Attention::flush();
		}
		$payload = ( new EMCP_Tools_Admin_Templates_Data() )->payload();
		/* translators: 1: template count, 2: category count. */
		$payload['message'] = sprintf( __( 'Synced %1$d templates across %2$d categories.', 'emcp-tools' ), $payload['total'], count( $payload['categories'] ) );
		return new WP_REST_Response( $payload );
	}

	public function apply( $request ) {
		$mode   = sanitize_key( (string) $request->get_param( 'mode' ) );
		$result = ( new EMCP_Tools_Admin_Templates_Data() )->apply(
			sanitize_key( self::route_param( $request, 'category' ) ),
			sanitize_key( self::route_param( $request, 'slug' ) ),
			'' === $mode ? 'page' : $mode
		);
		return is_wp_error( $result ) ? $result : new WP_REST_Response( $result );
	}
}
