<?php
/**
 * Early /webhook dispatcher (Chekkit messaging + AgentMail inbound).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Webhook_Dispatcher {

	public static function init(): void {
		add_action( 'parse_request', array( __CLASS__, 'maybe_dispatch' ), 0 );
	}

	/**
	 * @param WP $wp WordPress environment.
	 */
	public static function maybe_dispatch( $wp ): void {
		unset( $wp );
		$path = self::request_path();
		if ( $path === null ) {
			return;
		}
		while ( ob_get_level() > 0 ) {
			ob_end_clean();
		}

		$method   = isset( $_SERVER['REQUEST_METHOD'] ) ? strtoupper( (string) $_SERVER['REQUEST_METHOD'] ) : 'GET';
		$raw_body = file_get_contents( 'php://input' );
		$body     = self::decode_json_body( is_string( $raw_body ) ? $raw_body : '' );

		if ( $path === '/webhook/agentmail' || $path === '/webhook/agentmail/' ) {
			Neo_Pulse_App_Agentmail_Webhook::handle( $method, $body, is_string( $raw_body ) ? $raw_body : '' );
			exit;
		}

		$token = '';
		if ( preg_match( '#^/webhook/chekkit/([^/]+)/?$#', $path, $m ) ) {
			$token = rawurldecode( $m[1] );
		}
		Neo_Pulse_App_Chekkit_Webhook::handle( $method, $body, $token, is_string( $raw_body ) ? strlen( $raw_body ) : 0 );
		exit;
	}

	private static function request_path(): ?string {
		$uri  = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
		$path = (string) parse_url( $uri, PHP_URL_PATH );
		if ( $path === '/webhook' || $path === '/webhook/' ) {
			return $path;
		}
		if ( preg_match( '#^/webhook/chekkit/[^/]+/?$#', $path ) ) {
			return $path;
		}
		if ( $path === '/webhook/agentmail' || $path === '/webhook/agentmail/' ) {
			return $path;
		}
		return null;
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function decode_json_body( string $raw ): array {
		if ( $raw === '' ) {
			return array();
		}
		$data = json_decode( $raw, true );
		return is_array( $data ) ? $data : array();
	}
}
