<?php
/**
 * REST: NEO Pulse tools list + execute (MCP bridge).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Tools_Rest {

	const REST_NAMESPACE = 'neo-pulse/v1';

	public static function init(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	public static function register_routes(): void {
		$auth = function () {
			return is_user_logged_in();
		};

		register_rest_route(
			self::REST_NAMESPACE,
			'/tools/list',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'list_tools' ),
				'permission_callback' => $auth,
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/tools/execute',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'execute_tool' ),
				'permission_callback' => $auth,
			)
		);
	}

	/**
	 * @return WP_REST_Response
	 */
	public static function list_tools(): WP_REST_Response {
		$tools = array();
		foreach ( Neo_Pulse_Wp_Tools::get_registry() as $name => $def ) {
			$tools[] = array(
				'name'        => $name,
				'description' => $def['description'],
				'risk'        => $def['risk'],
				'inputSchema' => isset( $def['schema'] ) ? $def['schema'] : array( 'type' => 'object' ),
			);
		}

		return new WP_REST_Response(
			array(
				'ok'      => true,
				'version' => Neo_Pulse_Wp_Tools::VERSION,
				'tools'   => $tools,
			),
			200,
			array( 'X-NEO Pulse-Tools-Version' => (string) Neo_Pulse_Wp_Tools::VERSION )
		);
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function execute_tool( WP_REST_Request $request ): WP_REST_Response {
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}

		$tool_name = isset( $body['tool'] ) ? sanitize_key( (string) $body['tool'] ) : '';
		$params    = isset( $body['params'] ) && is_array( $body['params'] ) ? $body['params'] : array();
		$idempotency_key = isset( $body['idempotency_key'] ) ? sanitize_text_field( (string) $body['idempotency_key'] ) : '';

		if ( $tool_name === '' ) {
			return self::error( __( 'Tool name is required.', 'neo-pulse-wp' ), 400 );
		}

		if ( $idempotency_key !== '' ) {
			// Check permission before serving any cached result.
			$perm = Neo_Pulse_Wp_Tools::check_tool_permission( $tool_name, $params );
			if ( is_wp_error( $perm ) ) {
				$data   = $perm->get_error_data();
				$status = is_array( $data ) && isset( $data['status'] ) ? (int) $data['status'] : 403;
				return self::error( $perm->get_error_message(), $status, $perm->get_error_code() );
			}
			$cached = Neo_Pulse_Wp_Tools::get_idempotent_result( $idempotency_key, $tool_name, $params );
			if ( is_array( $cached ) ) {
				return new WP_REST_Response( $cached, 200, array( 'X-NEO Pulse-Tools-Version' => (string) Neo_Pulse_Wp_Tools::VERSION ) );
			}
		}

		$result = Neo_Pulse_Wp_Tools::execute( $tool_name, $params );

		if ( is_wp_error( $result ) ) {
			$data   = $result->get_error_data();
			$status = is_array( $data ) && isset( $data['status'] ) ? (int) $data['status'] : 400;
			Neo_Pulse_Wp_Tools_Audit::log( $tool_name, $params, false );
			return self::error( $result->get_error_message(), $status, $result->get_error_code() );
		}

		$audit_id = Neo_Pulse_Wp_Tools_Audit::log( $tool_name, $params, ! empty( $result['ok'] ) );
		$payload  = array(
			'ok'       => ! empty( $result['ok'] ),
			'data'     => isset( $result['data'] ) ? $result['data'] : $result,
			'audit_id' => $audit_id,
		);

		if ( $idempotency_key !== '' ) {
			Neo_Pulse_Wp_Tools::store_idempotent_result( $idempotency_key, $tool_name, $params, $payload );
		}

		return new WP_REST_Response( $payload, 200, array( 'X-NEO Pulse-Tools-Version' => (string) Neo_Pulse_Wp_Tools::VERSION ) );
	}

	/**
	 * @param string $message Message.
	 * @param int    $status  HTTP status.
	 * @param string $code    Error code.
	 * @return WP_REST_Response
	 */
	private static function error( string $message, int $status = 400, string $code = 'neo-pulse_tools_error' ): WP_REST_Response {
		return new WP_REST_Response(
			array(
				'ok'    => false,
				'error' => $message,
				'code'  => $code,
			),
			$status
		);
	}
}
