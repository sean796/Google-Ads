<?php
/**
 * Overseer REST collector for front-end pageview beacons.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Overseer_Collect {

	const REST_NAMESPACE = 'neo-pulse/v1';
	const RATE_LIMIT_TTL = 60;
	const RATE_LIMIT_MAX = 120;

	/** Most events accepted in one request (the beacon batches at most 10). */
	const MAX_EVENTS = 20;

	/** UTM keys kept from the beacon, and their maximum length. */
	const UTM_KEYS    = array( 'source', 'medium', 'campaign', 'term', 'content' );
	const UTM_MAX_LEN = 200;

	/** Event types the browser may send ('conversion' is recorded server-side only). */
	const CLIENT_EVENT_TYPES = array( 'pageview', 'page_exit', 'page_heartbeat', 'click', 'form_submit', 'outbound_click' );

	public static function init(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	public static function register_routes(): void {
		register_rest_route(
			self::REST_NAMESPACE,
			'/overseer/collect',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'handle_collect' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_collect( WP_REST_Request $request ) {
		if ( ! Neo_Pulse_Wp_Overseer::is_tracking_active() ) {
			return new WP_REST_Response(
				array( 'ok' => false, 'error' => 'tracking_disabled' ),
				403
			);
		}

		// Logged-out visitors usually get a cached page whose nonce has expired, so their beacons are
		// accepted without one (rate limit and the per-request limits below apply). Logged-in requests
		// still need a valid REST nonce.
		if ( is_user_logged_in() ) {
			$nonce = $request->get_header( 'X-WP-Nonce' );
			if ( ! is_string( $nonce ) || $nonce === '' ) {
				$nonce = $request->get_param( '_wpnonce' );
			}
			if ( ! is_string( $nonce ) || ! wp_verify_nonce( $nonce, 'wp_rest' ) ) {
				return new WP_Error(
					'neo-pulse_overseer_invalid_nonce',
					__( 'Invalid security token.', 'neo-pulse-wp' ),
					array( 'status' => 403 )
				);
			}
		}

		if ( self::is_rate_limited() ) {
			return new WP_Error(
				'neo-pulse_overseer_rate_limited',
				__( 'Too many requests. Please wait a moment.', 'neo-pulse-wp' ),
				array( 'status' => 429 )
			);
		}
		self::mark_rate_limited();

		$body = $request->get_json_params();
		if ( ! is_array( $body ) || empty( $body ) ) {
			$raw = $request->get_body();
			if ( is_string( $raw ) && $raw !== '' ) {
				$decoded = json_decode( $raw, true );
				if ( is_array( $decoded ) ) {
					$body = $decoded;
				}
			}
		}
		if ( ! is_array( $body ) ) {
			$body = array();
		}

		$events = array();
		if ( isset( $body['events'] ) && is_array( $body['events'] ) ) {
			foreach ( $body['events'] as $event ) {
				if ( is_array( $event ) ) {
					$events[] = $event;
				}
				if ( count( $events ) >= self::MAX_EVENTS ) {
					break;
				}
			}
		} else {
			$events[] = $body;
		}

		$client_meta = array();
		$utm         = self::sanitize_utm( isset( $body['utm'] ) ? $body['utm'] : null );
		if ( ! empty( $utm ) ) {
			$client_meta['utm'] = $utm;
		}
		$platform = self::str( $body, 'platform', 64 );
		if ( $platform !== '' ) {
			$client_meta['platform'] = $platform;
		}

		$session_id  = '';
		$visit_uid   = '';
		$last_error  = '';

		foreach ( $events as $event ) {
			if ( ! is_array( $event ) ) {
				continue;
			}

			$event_type = self::str( $event, 'event_type', 32 );
			$event_type = $event_type !== '' ? sanitize_key( $event_type ) : 'pageview';
			if ( ! in_array( $event_type, self::CLIENT_EVENT_TYPES, true ) ) {
				// Conversions are recorded by the server (form hooks), never taken from the browser.
				$last_error = 'invalid_event_type';
				continue;
			}

			$event_meta = $client_meta;
			if ( isset( $event['utm'] ) ) {
				$event_utm = self::sanitize_utm( $event['utm'] );
				if ( ! empty( $event_utm ) ) {
					$event_meta['utm'] = $event_utm;
				}
			}
			$event_platform = self::str( $event, 'platform', 64 );
			if ( $event_platform !== '' ) {
				$event_meta['platform'] = $event_platform;
			}

			$result = Neo_Pulse_Wp_Overseer_Ingest::record_event(
				array(
					'event_type'         => $event_type,
					'session_id'         => self::str_or( $event, $body, 'session_id', 64 ),
					'page_url'           => self::str_or( $event, $body, 'page_url', 2048 ),
					'page_title'         => self::str_or( $event, $body, 'page_title', 512 ),
					'referrer'           => self::str_or( $event, $body, 'referrer', 2048 ),
					'post_id'            => self::int_or( $event, $body, 'post_id' ),
					'screen_width'       => self::int_or( $event, $body, 'screen_width' ),
					'screen_height'      => self::int_or( $event, $body, 'screen_height' ),
					'language'           => self::str_or( $event, $body, 'language', 32 ),
					'timezone'           => self::str_or( $event, $body, 'timezone', 64 ),
					'duration_ms'        => self::int( $event, 'duration_ms' ),
					'active_duration_ms' => self::int( $event, 'active_duration_ms' ),
					'page_load_ms'       => self::int_or( $event, $body, 'page_load_ms' ),
					'scroll_depth_pct'   => self::int( $event, 'scroll_depth_pct' ),
					'parent_visit_uid'   => self::str( $event, 'parent_visit_uid', 36 ),
					'element_tag'        => self::str( $event, 'element_tag', 32 ),
					'element_text'       => self::str( $event, 'element_text', 256 ),
					'element_href'       => self::str( $event, 'element_href', 512 ),
					'client_meta'        => $event_meta,
				)
			);

			if ( ! empty( $result['ok'] ) ) {
				if ( ! empty( $result['session_id'] ) ) {
					$session_id = (string) $result['session_id'];
				}
				if ( ! empty( $result['visit_uid'] ) ) {
					$visit_uid = (string) $result['visit_uid'];
				}
			} elseif ( isset( $result['error'] ) ) {
				$last_error = (string) $result['error'];
				if ( in_array( $last_error, array( 'excluded_admin', 'tracking_disabled', 'interactions_disabled' ), true ) ) {
					break;
				}
			}
		}

		if ( $session_id === '' && $visit_uid === '' ) {
			$error  = $last_error !== '' ? $last_error : 'unknown';
			$status = in_array( $error, array( 'excluded_admin', 'tracking_disabled', 'interactions_disabled' ), true ) ? 403 : 400;
			return new WP_REST_Response(
				array(
					'ok'    => false,
					'error' => $error,
				),
				$status
			);
		}

		return new WP_REST_Response(
			array(
				'ok'         => true,
				'session_id' => $session_id,
				'visit_uid'  => $visit_uid,
			),
			200
		);
	}

	/**
	 * Keep only the known UTM keys, as plain text of at most UTM_MAX_LEN characters.
	 *
	 * @param mixed $raw Client utm object.
	 * @return array<string,string>
	 */
	private static function sanitize_utm( $raw ): array {
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$out = array();
		foreach ( self::UTM_KEYS as $key ) {
			$value = self::str( $raw, $key, self::UTM_MAX_LEN );
			if ( $value !== '' ) {
				$out[ $key ] = $value;
			}
		}
		return $out;
	}

	/**
	 * A scalar field as a trimmed, length-capped string ('' for missing or non-scalar values).
	 *
	 * @param array<string,mixed> $src Source array.
	 */
	private static function str( array $src, string $key, int $max ): string {
		if ( ! isset( $src[ $key ] ) || ! is_scalar( $src[ $key ] ) ) {
			return '';
		}
		$value = sanitize_text_field( (string) $src[ $key ] );
		return function_exists( 'mb_substr' ) ? mb_substr( $value, 0, $max ) : substr( $value, 0, $max );
	}

	/**
	 * Event field, falling back to the request body.
	 *
	 * @param array<string,mixed> $event Event.
	 * @param array<string,mixed> $body  Request body.
	 */
	private static function str_or( array $event, array $body, string $key, int $max ): string {
		$value = self::str( $event, $key, $max );
		return $value !== '' ? $value : self::str( $body, $key, $max );
	}

	/**
	 * @param array<string,mixed> $src Source array.
	 */
	private static function int( array $src, string $key ): int {
		return isset( $src[ $key ] ) && is_numeric( $src[ $key ] ) ? (int) $src[ $key ] : 0;
	}

	/**
	 * @param array<string,mixed> $event Event.
	 * @param array<string,mixed> $body  Request body.
	 */
	private static function int_or( array $event, array $body, string $key ): int {
		return isset( $event[ $key ] ) && is_numeric( $event[ $key ] ) ? (int) $event[ $key ] : self::int( $body, $key );
	}

	private static function is_rate_limited(): bool {
		$ip  = Neo_Pulse_Wp_Overseer::get_client_ip();
		$key = 'neo-pulse_ov_rl_' . md5( $ip !== '' ? $ip : 'unknown' );
		$hit = get_transient( $key );
		return is_numeric( $hit ) && (int) $hit >= self::RATE_LIMIT_MAX;
	}

	private static function mark_rate_limited(): void {
		$ip  = Neo_Pulse_Wp_Overseer::get_client_ip();
		$key = 'neo-pulse_ov_rl_' . md5( $ip !== '' ? $ip : 'unknown' );
		$hit = get_transient( $key );
		$count = is_numeric( $hit ) ? (int) $hit : 0;
		set_transient( $key, $count + 1, self::RATE_LIMIT_TTL );
	}
}
