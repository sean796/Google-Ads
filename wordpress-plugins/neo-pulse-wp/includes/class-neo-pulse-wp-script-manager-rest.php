<?php
/**
 * REST CRUD for Script Manager (MCP + agents).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Script_Manager_Rest {

	public static function init(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	public static function register_routes(): void {
		$perm = function () {
			return current_user_can( 'manage_options' );
		};
		// Saving raw script code needs the same right as posting unfiltered HTML (off for
		// non-super admins on multisite and where DISALLOW_UNFILTERED_HTML is set).
		$write_perm = function () {
			return current_user_can( 'manage_options' ) && current_user_can( 'unfiltered_html' );
		};

		register_rest_route(
			'neo-pulse/v1',
			'/scripts',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'list_scripts' ),
					'permission_callback' => $perm,
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'create_script' ),
					'permission_callback' => $write_perm,
				),
			)
		);

		register_rest_route(
			'neo-pulse/v1',
			'/scripts/(?P<id>\d+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_script' ),
					'permission_callback' => $perm,
				),
				array(
					'methods'             => 'PUT',
					'callback'            => array( __CLASS__, 'update_script' ),
					'permission_callback' => $write_perm,
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( __CLASS__, 'delete_script' ),
					'permission_callback' => $perm,
				),
			)
		);
	}

	/**
	 * @param object $row DB row.
	 * @return array<string, mixed>
	 */
	private static function format_row( $row ): array {
		$rules = Neo_Pulse_Wp_Script_Manager_Rules::decode( isset( $row->display_rules ) ? (string) $row->display_rules : '' );
		return array(
			'id'            => (int) $row->id,
			'name'          => (string) $row->name,
			'placement'     => (string) $row->placement,
			'code'          => (string) $row->code,
			'status'        => (string) $row->status,
			'priority'      => (int) $row->priority,
			'category'      => (string) $row->category,
			'display_rules' => $rules,
			'created_at'    => (string) $row->created_at,
			'updated_at'    => (string) $row->updated_at,
		);
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function list_scripts( WP_REST_Request $request ): WP_REST_Response {
		$result = Neo_Pulse_Wp_Script_Manager::query(
			array(
				'page'     => (int) $request->get_param( 'page' ) ?: 1,
				'per_page' => (int) $request->get_param( 'per_page' ) ?: 50,
				'search'   => (string) $request->get_param( 'search' ),
				'status'   => (string) $request->get_param( 'status' ),
				'category' => (string) $request->get_param( 'category' ),
				'placement'=> (string) $request->get_param( 'placement' ),
			)
		);

		$items = array();
		foreach ( $result['items'] as $row ) {
			$items[] = self::format_row( $row );
		}

		return new WP_REST_Response(
			array(
				'ok'    => true,
				'items' => $items,
				'total' => (int) $result['total'],
			),
			200
		);
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function get_script( WP_REST_Request $request ) {
		$id  = (int) $request['id'];
		$row = Neo_Pulse_Wp_Script_Manager::get( $id );
		if ( ! $row ) {
			return new WP_Error( 'neo-pulse_script', __( 'Script not found.', 'neo-pulse-wp' ), array( 'status' => 404 ) );
		}
		return new WP_REST_Response( array( 'ok' => true, 'script' => self::format_row( $row ) ), 200 );
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function create_script( WP_REST_Request $request ): WP_REST_Response {
		$body   = $request->get_json_params();
		$params = is_array( $body ) ? $body : array();
		$result = Neo_Pulse_Wp_Script_Manager::save( $params );
		if ( empty( $result['ok'] ) ) {
			return new WP_REST_Response(
				array( 'ok' => false, 'error' => $result['error'] ?? __( 'Save failed.', 'neo-pulse-wp' ) ),
				400
			);
		}
		$row = Neo_Pulse_Wp_Script_Manager::get( (int) $result['id'] );
		return new WP_REST_Response(
			array(
				'ok'     => true,
				'script' => $row ? self::format_row( $row ) : array( 'id' => (int) $result['id'] ),
			),
			201
		);
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function update_script( WP_REST_Request $request ): WP_REST_Response {
		$body   = $request->get_json_params();
		$params = is_array( $body ) ? $body : array();
		$params['id'] = (int) $request['id'];
		$result       = Neo_Pulse_Wp_Script_Manager::save( $params );
		if ( empty( $result['ok'] ) ) {
			return new WP_REST_Response(
				array( 'ok' => false, 'error' => $result['error'] ?? __( 'Save failed.', 'neo-pulse-wp' ) ),
				400
			);
		}
		$row = Neo_Pulse_Wp_Script_Manager::get( (int) $result['id'] );
		return new WP_REST_Response(
			array( 'ok' => true, 'script' => $row ? self::format_row( $row ) : null ),
			200
		);
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function delete_script( WP_REST_Request $request ): WP_REST_Response {
		$id    = (int) $request['id'];
		$force = (bool) $request->get_param( 'force' );
		if ( $force ) {
			$deleted = Neo_Pulse_Wp_Script_Manager::delete( $id );
			return new WP_REST_Response( array( 'ok' => (bool) $deleted ), $deleted ? 200 : 404 );
		}
		$changed = Neo_Pulse_Wp_Script_Manager::bulk_action( array( $id ), 'trash' );
		return new WP_REST_Response( array( 'ok' => $changed > 0 ), $changed > 0 ? 200 : 400 );
	}
}
