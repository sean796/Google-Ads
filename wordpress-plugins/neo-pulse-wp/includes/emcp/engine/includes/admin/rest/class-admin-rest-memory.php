<?php
/**
 * Project Memory screen REST (spec 8.10). Replaces the ajax handlers
 * memory_set_status, memory_save_guidance and memory_save_settings.
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class EMCP_Tools_Admin_REST_Memory extends EMCP_Tools_Admin_REST_Controller {

	public function register_routes(): void {
		$this->route(
			'memory',
			array(
				array(
					'methods'  => 'GET',
					'callback' => array( $this, 'get' ),
					'args'     => array( 'tab' => array( 'type' => 'string', 'default' => 'active' ) ),
				),
				array(
					'methods'  => 'POST',
					'callback' => array( $this, 'create' ),
				),
			)
		);
		$this->route( 'memory/settings', array( 'methods' => 'POST', 'callback' => array( $this, 'save_settings' ) ) );
		$this->route(
			'memory/(?P<id>\d+)',
			array(
				array(
					'methods'  => 'POST',
					'callback' => array( $this, 'act' ),
				),
				array(
					'methods'  => 'DELETE',
					'callback' => array( $this, 'remove' ),
				),
			)
		);
	}

	public static function register_screen(): void {
		EMCP_Tools_Admin_Screens::register(
			'memory',
			array(
				'script' => 'screen-memory',
				'root'   => 'pro',
				'tabs'   => array( 'memory' ),
				'boot'   => static function (): array {
					return ( new EMCP_Tools_Admin_Memory_Data() )->payload();
				},
			)
		);
	}

	/** @return true|WP_Error */
	private static function licensed() {
		if ( ! class_exists( 'EMCP_Tools_Memory_Store' ) || ! EMCP_Tools_Memory_Store::user_has_access() ) {
			return new WP_Error( 'emcp_no_license', __( 'Project Memory needs an active Neo EMCP licence.', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		return true;
	}

	private static function respond( $result ) {
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		// The sidebar's pending-review badge reads a 5-minute cache.
		delete_transient( 'emcp_tools_nav_counts' );
		if ( class_exists( 'EMCP_Tools_Attention' ) ) {
			EMCP_Tools_Attention::flush();
		}
		return new WP_REST_Response( $result );
	}

	public function get( $request ) {
		$ok = self::licensed();
		return true === $ok ? new WP_REST_Response( ( new EMCP_Tools_Admin_Memory_Data() )->payload( sanitize_key( (string) $request->get_param( 'tab' ) ) ) ) : $ok;
	}

	public function create( $request ) {
		$ok = self::licensed();
		if ( true !== $ok ) {
			return $ok;
		}
		return self::respond( ( new EMCP_Tools_Admin_Memory_Data() )->create( sanitize_key( (string) $request->get_param( 'type' ) ), (string) $request->get_param( 'text' ) ) );
	}

	public function act( $request ) {
		$ok = self::licensed();
		if ( true !== $ok ) {
			return $ok;
		}
		$args = array();
		foreach ( array( 'enabled', 'type', 'text' ) as $key ) {
			if ( null !== $request->get_param( $key ) ) {
				$args[ $key ] = 'type' === $key ? sanitize_key( (string) $request->get_param( $key ) ) : $request->get_param( $key );
			}
		}
		return self::respond(
			( new EMCP_Tools_Admin_Memory_Data() )->act(
				(int) self::route_param( $request, 'id' ),
				sanitize_key( (string) $request->get_param( 'action' ) ),
				$args
			)
		);
	}

	public function remove( $request ) {
		$ok = self::licensed();
		if ( true !== $ok ) {
			return $ok;
		}
		if ( ! rest_sanitize_boolean( $request->get_param( 'confirm' ) ) ) {
			return new WP_Error( 'emcp_confirm_required', __( 'Confirm the deletion first.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		return self::respond( ( new EMCP_Tools_Admin_Memory_Data() )->delete( (int) self::route_param( $request, 'id' ) ) );
	}

	public function save_settings( $request ) {
		$ok = self::licensed();
		if ( true !== $ok ) {
			return $ok;
		}
		$diff = array();
		foreach ( array( 'requireApproval', 'autoSummarize' ) as $key ) {
			if ( null !== $request->get_param( $key ) ) {
				$diff[ $key ] = $request->get_param( $key );
			}
		}
		return new WP_REST_Response( ( new EMCP_Tools_Admin_Memory_Data() )->save_settings( $diff ) );
	}
}
