<?php
/**
 * /api/prompt-traces/* route handlers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Prompt_Trace_Route_Handlers {

	/**
	 * @param string              $subpath Route after prompt-traces/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$user = Neo_Pulse_App_Auth_Session::require_user();
		if ( ! $user ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Unauthorized' ), 401 );
			return;
		}

		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( $subpath === '' && $method === 'POST' ) {
			self::create_trace( $body, (int) ( $user['id'] ?? 0 ) );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Not found' ), 404 );
	}

	/**
	 * @param array<string,mixed> $body JSON body.
	 */
	private static function create_trace( array $body, int $user_id ): void {
		$trace = isset( $body['trace'] ) && is_array( $body['trace'] ) ? $body['trace'] : null;
		if ( $trace === null || ! isset( $trace['calls'] ) || ! is_array( $trace['calls'] ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'trace.calls is required' ), 400 );
			return;
		}

		$site_url  = esc_url_raw( (string) ( $body['siteUrl'] ?? '' ) );
		$run_label = sanitize_text_field( (string) ( $body['runLabel'] ?? '' ) );
		if ( $run_label === '' ) {
			$run_label = sanitize_text_field( (string) ( $trace['label'] ?? 'Bulk run' ) );
		}

		Neo_Pulse_App_Prompt_Traces_Store::install_tables();
		$id = Neo_Pulse_App_Prompt_Traces_Store::insert_trace( $user_id, $site_url, $run_label, $trace );
		if ( $id <= 0 ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => false, 'error' => 'Prompt trace save failed' ), 500 );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'        => true,
				'id'        => $id,
				'callCount' => count( $trace['calls'] ),
			)
		);
	}
}
