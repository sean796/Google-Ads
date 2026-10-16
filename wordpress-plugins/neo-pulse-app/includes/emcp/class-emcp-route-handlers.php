<?php
/**
 * Server-side `/api/emcp/*` Route Handlers for Neo EMCP Workspace.
 *
 * Routes:
 * - POST /api/emcp/catalog : Discover all tools + `neo-pulse/*` and `neo-tools/*` catalogs on a site
 * - POST /api/emcp/execute : Execute a single MCP tool or dispatcher operation (supports dry_run, expected_version, undo)
 * - POST /api/emcp/batch   : Execute a sequence of MCP operations across one or more steps
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

final class Neo_Pulse_App_Emcp_Route_Handlers {

	/**
	 * @param string              $subpath Route after `emcp/`.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    Parsed JSON request body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$subpath = trim( $subpath, '/' );
		if ( 'POST' !== strtoupper( $method ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Method not allowed' ), 405 );
			return;
		}

		@set_time_limit( 240 );

		switch ( $subpath ) {
			case 'catalog':
				self::handle_catalog( $body );
				return;
			case 'execute':
				self::handle_execute( $body );
				return;
			case 'batch':
				self::handle_batch( $body );
				return;
			default:
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Unknown EMCP route: ' . $subpath ), 404 );
				return;
		}
	}

	/**
	 * `POST /api/emcp/catalog`
	 *
	 * @param array<string,mixed> $body Request body.
	 */
	private static function handle_catalog( array $body ): void {
		$conn = Neo_Pulse_App_Emcp_Site_Client::resolve_connection( $body );
		if ( is_wp_error( $conn ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => $conn->get_error_message(),
				),
				400
			);
			return;
		}

		$catalog = Neo_Pulse_App_Emcp_Site_Client::fetch_catalog( $conn['mcp_url'], $conn['authorization'] );
		if ( is_wp_error( $catalog ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => $catalog->get_error_message(),
				),
				502
			);
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'      => true,
				'siteUrl' => $conn['site_url'],
				'catalog' => $catalog,
			)
		);
	}

	/**
	 * `POST /api/emcp/execute`
	 *
	 * @param array<string,mixed> $body Request body.
	 */
	private static function handle_execute( array $body ): void {
		$conn = Neo_Pulse_App_Emcp_Site_Client::resolve_connection( $body );
		if ( is_wp_error( $conn ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => $conn->get_error_message(),
				),
				400
			);
			return;
		}

		$tool      = isset( $body['tool'] ) ? trim( (string) $body['tool'] ) : '';
		$operation = isset( $body['operation'] ) ? trim( (string) $body['operation'] ) : '';
		$arguments = isset( $body['arguments'] ) && is_array( $body['arguments'] ) ? $body['arguments'] : array();

		if ( '' === $tool ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'tool is required.',
				),
				400
			);
			return;
		}

		$started = microtime( true );
		$res     = Neo_Pulse_App_Emcp_Site_Client::execute_tool(
			$conn['mcp_url'],
			$conn['authorization'],
			$tool,
			$operation,
			$arguments
		);
		$elapsed = (int) round( ( microtime( true ) - $started ) * 1000 );

		if ( is_wp_error( $res ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'         => false,
					'tool'       => $tool,
					'operation'  => $operation,
					'durationMs' => $elapsed,
					'error'      => $res->get_error_message(),
				),
				400
			);
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'         => true,
				'tool'       => $res['tool'],
				'operation'  => $res['operation'],
				'durationMs' => $elapsed,
				'data'       => $res['data'],
			)
		);
	}

	/**
	 * `POST /api/emcp/batch`
	 *
	 * @param array<string,mixed> $body Request body.
	 */
	private static function handle_batch( array $body ): void {
		$conn = Neo_Pulse_App_Emcp_Site_Client::resolve_connection( $body );
		if ( is_wp_error( $conn ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => $conn->get_error_message(),
				),
				400
			);
			return;
		}

		$steps         = isset( $body['steps'] ) && is_array( $body['steps'] ) ? $body['steps'] : array();
		$stop_on_error = ! isset( $body['stopOnError'] ) || ! empty( $body['stopOnError'] );
		if ( array() === $steps ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'steps array is required.',
				),
				400
			);
			return;
		}

		$results = array();
		$all_ok  = true;

		foreach ( $steps as $idx => $step ) {
			if ( ! is_array( $step ) ) {
				continue;
			}
			$step_id   = isset( $step['id'] ) ? (string) $step['id'] : 'step_' . ( $idx + 1 );
			$tool      = isset( $step['tool'] ) ? trim( (string) $step['tool'] ) : '';
			$operation = isset( $step['operation'] ) ? trim( (string) $step['operation'] ) : '';
			$arguments = isset( $step['arguments'] ) && is_array( $step['arguments'] ) ? $step['arguments'] : array();

			$started = microtime( true );
			$res     = Neo_Pulse_App_Emcp_Site_Client::execute_tool(
				$conn['mcp_url'],
				$conn['authorization'],
				$tool,
				$operation,
				$arguments
			);
			$elapsed = (int) round( ( microtime( true ) - $started ) * 1000 );

			if ( is_wp_error( $res ) ) {
				$all_ok    = false;
				$results[] = array(
					'id'         => $step_id,
					'tool'       => $tool,
					'operation'  => $operation,
					'ok'         => false,
					'durationMs' => $elapsed,
					'error'      => $res->get_error_message(),
				);
				if ( $stop_on_error ) {
					break;
				}
			} else {
				$results[] = array(
					'id'         => $step_id,
					'tool'       => $res['tool'],
					'operation'  => $res['operation'],
					'ok'         => true,
					'durationMs' => $elapsed,
					'data'       => $res['data'],
				);
			}
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'      => $all_ok,
				'siteUrl' => $conn['site_url'],
				'results' => $results,
			)
		);
	}
}
