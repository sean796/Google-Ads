<?php
/**
 * HTTP session for NEO Pulse app users (signed cookie, no PHP session files).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Auth_Session {

	const COOKIE_NAME = 'neo_pulse_session';

	public static function start(): void {
		// Kept for callers; signed cookies do not need PHP sessions.
	}

	private static function secret(): string {
		if ( defined( 'NEO_PULSE_APP_SESSION_SECRET' ) && NEO_PULSE_APP_SESSION_SECRET !== '' ) {
			return (string) NEO_PULSE_APP_SESSION_SECRET;
		}
		if ( function_exists( 'wp_salt' ) ) {
			return wp_salt( 'neo-pulse_app_session' );
		}
		if ( defined( 'AUTH_KEY' ) && AUTH_KEY !== '' ) {
			return (string) AUTH_KEY;
		}
		return '';
	}

	/**
	 * WP REST permission callback: a valid app session (cookie or Bearer).
	 *
	 * @param mixed $request Unused.
	 */
	public static function rest_permission( $request ): bool {
		unset( $request );
		return self::require_user() !== null;
	}

	/**
	 * @return array{uid:int,tid:?int,exp:int}|null
	 */
	private static function decode_token( string $token ): ?array {
		$sep = strrpos( $token, '|' );
		if ( $sep === false ) {
			return null;
		}
		$b64 = substr( $token, 0, $sep );
		$sig = substr( $token, $sep + 1 );
		if ( $b64 === '' || $sig === '' ) {
			return null;
		}
		if ( ! hash_equals( hash_hmac( 'sha256', $b64, self::secret() ), $sig ) ) {
			return null;
		}
		$pad   = ( 4 - ( strlen( $b64 ) % 4 ) ) % 4;
		$json  = base64_decode( strtr( $b64, '-_', '+/' ) . str_repeat( '=', $pad ), true );
		$data  = is_string( $json ) ? json_decode( $json, true ) : null;
		if ( ! is_array( $data ) || empty( $data['uid'] ) || empty( $data['exp'] ) ) {
			return null;
		}
		if ( (int) $data['exp'] < time() ) {
			return null;
		}
		return array(
			'uid' => (int) $data['uid'],
			'tid' => isset( $data['tid'] ) ? (int) $data['tid'] : null,
			'exp' => (int) $data['exp'],
		);
	}

	private static function read_token_from_request(): string {
		$auth = isset( $_SERVER['HTTP_AUTHORIZATION'] ) ? (string) wp_unslash( $_SERVER['HTTP_AUTHORIZATION'] ) : '';
		if ( $auth === '' && isset( $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ) ) {
			$auth = (string) wp_unslash( $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] );
		}
		if ( preg_match( '/^Bearer\s+(\S+)/i', $auth, $m ) ) {
			return rawurldecode( $m[1] );
		}
		if ( isset( $_COOKIE[ self::COOKIE_NAME ] ) ) {
			return rawurldecode( (string) wp_unslash( $_COOKIE[ self::COOKIE_NAME ] ) );
		}
		$raw = isset( $_SERVER['HTTP_COOKIE'] ) ? (string) wp_unslash( $_SERVER['HTTP_COOKIE'] ) : '';
		if ( $raw === '' ) {
			return '';
		}
		foreach ( explode( ';', $raw ) as $part ) {
			$part = trim( $part );
			if ( strncmp( $part, self::COOKIE_NAME . '=', strlen( self::COOKIE_NAME ) + 1 ) === 0 ) {
				return rawurldecode( substr( $part, strlen( self::COOKIE_NAME ) + 1 ) );
			}
		}
		return '';
	}

	/**
	 * @return array{uid:int,tid:?int,exp:int}|null
	 */
	private static function read_payload(): ?array {
		$token = self::read_token_from_request();
		if ( $token === '' ) {
			return null;
		}
		return self::decode_token( $token );
	}

	private static function encode_token( int $user_id, ?int $team_id ): string {
		$payload = wp_json_encode(
			array(
				'uid' => $user_id,
				'tid' => $team_id,
				'exp' => time() + DAY_IN_SECONDS * 14,
			)
		);
		$b64 = rtrim( strtr( base64_encode( (string) $payload ), '+/', '-_' ), '=' );
		$sig = hash_hmac( 'sha256', $b64, self::secret() );
		return $b64 . '|' . $sig;
	}

	private static function write_cookie( int $user_id, ?int $team_id ): void {
		$value = self::encode_token( $user_id, $team_id );
		if ( headers_sent() ) {
			$_COOKIE[ self::COOKIE_NAME ] = $value;
			return;
		}
		setcookie(
			self::COOKIE_NAME,
			$value,
			array(
				// Persistent for the token lifetime (14 days, see encode_token):
				// browser callers that send only the cookie must stay signed in
				// across browser restarts, same as the stored Bearer token.
				'expires'  => time() + DAY_IN_SECONDS * 14,
				'path'     => '/',
				'domain'   => '',
				'secure'   => is_ssl(),
				'httponly' => true,
				'samesite' => 'Lax',
			)
		);
		$_COOKIE[ self::COOKIE_NAME ] = $value;
	}

	public static function user_id(): ?int {
		$data = self::read_payload();
		return $data ? $data['uid'] : null;
	}

	public static function active_team_id(): ?int {
		$data = self::read_payload();
		if ( ! $data || empty( $data['tid'] ) ) {
			return null;
		}
		return (int) $data['tid'];
	}

	public static function set_session( int $user_id, ?int $team_id ): void {
		self::write_cookie( $user_id, ( $team_id === null || $team_id <= 0 ) ? null : $team_id );
	}

	public static function current_token(): string {
		return self::read_token_from_request();
	}

	public static function set_user( int $user_id ): void {
		$team_id = self::active_team_id();
		self::write_cookie( $user_id, $team_id );
	}

	public static function set_active_team( ?int $team_id ): void {
		$user_id = self::user_id();
		if ( $user_id === null ) {
			$payload = self::read_payload();
			$user_id = $payload ? $payload['uid'] : null;
		}
		if ( $user_id === null ) {
			return;
		}
		self::write_cookie( $user_id, ( $team_id === null || $team_id <= 0 ) ? null : $team_id );
	}

	public static function clear(): void {
		if ( ! headers_sent() ) {
			setcookie(
				self::COOKIE_NAME,
				'',
				array(
					'expires'  => time() - DAY_IN_SECONDS,
					'path'     => '/',
					'domain'   => '',
					'secure'   => is_ssl(),
					'httponly' => true,
					'samesite' => 'Lax',
				)
			);
		}
		unset( $_COOKIE[ self::COOKIE_NAME ] );
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function require_user(): ?array {
		$user_id = self::user_id();
		if ( $user_id === null ) {
			return null;
		}
		return Neo_Pulse_App_Teams_Store::get_user_by_id( $user_id );
	}

	/**
	 * Short-lived bearer token for server worker API calls.
	 */
	public static function mint_bearer_token( int $user_id, ?int $team_id, int $ttl_seconds = 3600 ): string {
		$payload = wp_json_encode(
			array(
				'uid' => $user_id,
				'tid' => ( $team_id === null || $team_id <= 0 ) ? null : $team_id,
				'exp' => time() + max( 60, $ttl_seconds ),
			)
		);
		$b64 = rtrim( strtr( base64_encode( (string) $payload ), '+/', '-_' ), '=' );
		$sig = hash_hmac( 'sha256', $b64, self::secret() );
		return $b64 . '|' . $sig;
	}
}
