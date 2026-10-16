<?php
/**
 * REST API for Chekkit contact submissions from the chat sidebar.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Chekkit_Rest {

	const REST_NAMESPACE = 'neo-pulse/v1';

	const RATE_LIMIT_MAX = 10;

	const RATE_LIMIT_TTL = 60;

	public static function init(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	public static function register_routes(): void {
		register_rest_route(
			self::REST_NAMESPACE,
			'/chekkit/contact',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'handle_contact' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function handle_contact( WP_REST_Request $request ): WP_REST_Response {
		$settings = Neo_Pulse_Wp_Chat::get_settings();
		if (
			Neo_Pulse_Wp_Chat::is_off_everywhere()
			|| ! Neo_Pulse_Wp_License::is_licensed( false )
			|| ! Neo_Pulse_Wp_Chat_Lead::is_chekkit_available( $settings )
		) {
			return new WP_REST_Response(
				array(
					'success' => false,
					'message' => __( 'Contact requests are not available right now.', 'neo-pulse-wp' ),
				),
				503
			);
		}

		$nonce = $request->get_header( 'X-WP-Nonce' );
		if ( ! is_string( $nonce ) || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
			return new WP_REST_Response(
				array(
					'success' => false,
					'message' => __( 'Invalid security token. Please refresh the page.', 'neo-pulse-wp' ),
				),
				403
			);
		}

		$input = self::collect_input( $request );

		$honeypot = isset( $input['neo-pulse_hp'] ) ? trim( (string) $input['neo-pulse_hp'] ) : '';
		if ( $honeypot !== '' ) {
			return new WP_REST_Response(
				array(
					'success' => false,
					'message' => __( 'Submission rejected.', 'neo-pulse-wp' ),
				),
				400
			);
		}

		$ip = self::client_ip();
		if ( ! self::check_rate_limit( $ip ) ) {
			return new WP_REST_Response(
				array(
					'success' => false,
					'message' => __( 'Too many submissions. Please wait a moment and try again.', 'neo-pulse-wp' ),
				),
				429
			);
		}

		$errors = Neo_Pulse_Wp_Chekkit::validate_contact_input( $input );
		if ( null !== $errors ) {
			return new WP_REST_Response(
				array(
					'success' => false,
					'message' => __( 'Please correct the errors below.', 'neo-pulse-wp' ),
					'errors'  => $errors,
				),
				400
			);
		}

		$event_type = isset( $settings['chekkit_event_type'] ) ? (string) $settings['chekkit_event_type'] : 'contact_request';
		$payload    = Neo_Pulse_Wp_Chekkit::build_payload( $input, $event_type );

		$result = Neo_Pulse_Wp_Chekkit::send_contact( $payload );
		if ( is_wp_error( $result ) ) {
			return new WP_REST_Response(
				array(
					'success' => false,
					'message' => __( 'Unable to send your request. Please try again later.', 'neo-pulse-wp' ),
				),
				502
			);
		}

		return new WP_REST_Response(
			array(
				'success' => true,
				'message' => __( "Thanks! We'll be in touch soon.", 'neo-pulse-wp' ),
			),
			200
		);
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return array<string,mixed>
	 */
	private static function collect_input( WP_REST_Request $request ): array {
		$params = $request->get_json_params();
		if ( ! is_array( $params ) ) {
			$params = array();
		}
		return $params;
	}

	/**
	 * Rate-limit key: REMOTE_ADDR only. X-Forwarded-For is client-controlled and would let a
	 * sender pick a fresh "IP" for every request.
	 */
	private static function client_ip(): string {
		$ip = ! empty( $_SERVER['REMOTE_ADDR'] ) ? (string) wp_unslash( $_SERVER['REMOTE_ADDR'] ) : '';
		return sanitize_text_field( $ip );
	}

	private static function check_rate_limit( string $ip ): bool {
		if ( $ip === '' ) {
			return true;
		}
		$key   = 'neo-pulse_chekkit_rl_' . md5( $ip );
		$count = (int) get_transient( $key );
		if ( $count >= self::RATE_LIMIT_MAX ) {
			return false;
		}
		set_transient( $key, $count + 1, self::RATE_LIMIT_TTL );
		return true;
	}
}
