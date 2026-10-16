<?php
/**
 * REST CRUD for NEO Pulse redirects (MCP + agents).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Redirects_Rest {

	public static function init(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	public static function register_routes(): void {
		$perm = function () {
			return current_user_can( 'manage_options' );
		};

		register_rest_route(
			'neo-pulse/v1',
			'/redirects',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'list_redirects' ),
					'permission_callback' => $perm,
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'create_redirect' ),
					'permission_callback' => $perm,
				),
			)
		);

		register_rest_route(
			'neo-pulse/v1',
			'/redirects/(?P<id>\d+)',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'get_redirect' ),
					'permission_callback' => $perm,
				),
				array(
					'methods'             => 'PUT',
					'callback'            => array( __CLASS__, 'update_redirect' ),
					'permission_callback' => $perm,
				),
				array(
					'methods'             => 'DELETE',
					'callback'            => array( __CLASS__, 'delete_redirect' ),
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
		return array(
			'id'          => (int) $row->id,
			'source'      => (string) $row->source,
			'destination' => (string) $row->destination,
			'type'        => (int) $row->type,
			'matching'    => (string) $row->matching,
			'ignore_case' => ! empty( $row->ignore_case ),
			'category'    => (string) $row->category,
			'status'      => (string) $row->status,
			'hits'        => (int) $row->hits,
		);
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function list_redirects( WP_REST_Request $request ): WP_REST_Response {
		$result = Neo_Pulse_Wp_Redirects::query(
			array(
				'page'     => (int) $request->get_param( 'page' ) ?: 1,
				'per_page' => (int) $request->get_param( 'per_page' ) ?: 50,
				'search'   => (string) $request->get_param( 'search' ),
				'status'   => (string) $request->get_param( 'status' ),
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
	public static function get_redirect( WP_REST_Request $request ) {
		$id  = (int) $request['id'];
		$row = Neo_Pulse_Wp_Redirects::get( $id );
		if ( ! $row ) {
			return new WP_Error( 'neo-pulse_redirect', __( 'Redirect not found.', 'neo-pulse-wp' ), array( 'status' => 404 ) );
		}
		return new WP_REST_Response( array( 'ok' => true, 'redirect' => self::format_row( $row ) ), 200 );
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function create_redirect( WP_REST_Request $request ): WP_REST_Response {
		$body   = $request->get_json_params();
		$params = is_array( $body ) ? $body : array();
		$result = Neo_Pulse_Wp_Redirects::save( $params );
		if ( empty( $result['ok'] ) ) {
			return new WP_REST_Response(
				array( 'ok' => false, 'error' => $result['error'] ?? __( 'Save failed.', 'neo-pulse-wp' ) ),
				400
			);
		}
		$row = Neo_Pulse_Wp_Redirects::get( (int) $result['id'] );
		return new WP_REST_Response(
			array(
				'ok'       => true,
				'redirect' => $row ? self::format_row( $row ) : array( 'id' => (int) $result['id'] ),
			),
			201
		);
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function update_redirect( WP_REST_Request $request ): WP_REST_Response {
		$id       = (int) $request['id'];
		$existing = Neo_Pulse_Wp_Redirects::get( $id );
		if ( ! $existing ) {
			return new WP_REST_Response(
				array( 'ok' => false, 'error' => __( 'Redirect not found.', 'neo-pulse-wp' ) ),
				404
			);
		}
		$body = $request->get_json_params();
		if ( ! is_array( $body ) || empty( $body ) ) {
			$body = $request->get_body_params();
		}
		$body = is_array( $body ) ? $body : array();

		// Partial update: start from the stored row so omitted fields (status,
		// matching, type, category, ignore-case) keep their current values.
		$params = array(
			'source'      => (string) $existing->source,
			'destination' => (string) $existing->destination,
			'type'        => (int) $existing->type,
			'matching'    => (string) $existing->matching,
			'category'    => (string) $existing->category,
			'status'      => (string) $existing->status,
			'ignore'      => ! empty( $existing->ignore_case ) ? 1 : 0,
		);
		foreach ( array( 'source', 'destination', 'type', 'matching', 'category', 'status' ) as $key ) {
			if ( array_key_exists( $key, $body ) ) {
				$params[ $key ] = $body[ $key ];
			}
		}
		if ( array_key_exists( 'ignore_case', $body ) ) {
			$params['ignore'] = ! empty( $body['ignore_case'] ) ? 1 : 0;
		} elseif ( array_key_exists( 'ignore', $body ) ) {
			$params['ignore'] = ! empty( $body['ignore'] ) ? 1 : 0;
		}
		$params['id'] = $id;
		$result       = Neo_Pulse_Wp_Redirects::save( $params );
		if ( empty( $result['ok'] ) ) {
			return new WP_REST_Response(
				array( 'ok' => false, 'error' => $result['error'] ?? __( 'Save failed.', 'neo-pulse-wp' ) ),
				400
			);
		}
		$row = Neo_Pulse_Wp_Redirects::get( (int) $result['id'] );
		return new WP_REST_Response(
			array( 'ok' => true, 'redirect' => $row ? self::format_row( $row ) : null ),
			200
		);
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function delete_redirect( WP_REST_Request $request ): WP_REST_Response {
		$id    = (int) $request['id'];
		$force = rest_sanitize_boolean( $request->get_param( 'force' ) );
		if ( ! Neo_Pulse_Wp_Redirects::get( $id ) ) {
			return new WP_REST_Response( array( 'ok' => false, 'error' => __( 'Redirect not found.', 'neo-pulse-wp' ) ), 404 );
		}
		if ( $force ) {
			$deleted = Neo_Pulse_Wp_Redirects::delete( $id );
			return new WP_REST_Response( array( 'ok' => $deleted, 'deleted' => $deleted ), $deleted ? 200 : 500 );
		}
		// Without force: move to trash, keeping every other field.
		$changed = Neo_Pulse_Wp_Redirects::bulk_action( array( $id ), 'trash' ) > 0;
		return new WP_REST_Response( array( 'ok' => $changed, 'trashed' => $changed ), $changed ? 200 : 500 );
	}
}
