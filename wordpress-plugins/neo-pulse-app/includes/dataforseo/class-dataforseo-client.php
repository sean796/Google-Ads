<?php
/**
 * DataForSEO REST client (credentials via Neo_Pulse_App_Secrets).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Dataforseo_Client {

	const API_BASE = 'https://api.dataforseo.com/v3';

	/** @var array<string,int> */
	const LOCATION_MAP = array(
		'United States'  => 2840,
		'United Kingdom' => 2826,
		'Canada'         => 2124,
		'Australia'      => 2036,
	);

	/** @var array<string,int> City token (lowercase) => DataForSEO location_code. */
	const CITY_LOCATION_MAP = array(
		'calgary'         => 1006350,
		'edmonton'        => 1006218,
		'toronto'         => 1000296,
		'vancouver'       => 1000268,
		'montreal'        => 1002444,
		'ottawa'          => 1000100,
		'winnipeg'        => 1000173,
		'sherwood park'   => 1006218,
		'winkler'         => 1000173,
		'red deer'        => 1006227,
	);

	/**
	 * @return array{login:string,password:string}
	 */
	public static function credentials(): array {
		return Neo_Pulse_App_Secrets::dataforseo();
	}

	public static function has_credentials(): bool {
		$c = self::credentials();
		return $c['login'] !== '' && $c['password'] !== '';
	}

	/**
	 * @param mixed $lang
	 */
	public static function ensure_language_code( $lang ): string {
		if ( is_string( $lang ) && $lang !== '' ) {
			return $lang;
		}
		if ( is_numeric( $lang ) ) {
			$legacy = array(
				1000 => 'en',
				1014 => 'es',
				1015 => 'fr',
				1011 => 'de',
			);
			$n = (int) $lang;
			return isset( $legacy[ $n ] ) ? $legacy[ $n ] : (string) $lang;
		}
		return 'en';
	}

	/**
	 * @param mixed $obj
	 * @return mixed
	 */
	public static function sanitize_payload( $obj ) {
		if ( $obj === null ) {
			return null;
		}
		if ( is_array( $obj ) ) {
			if ( array_keys( $obj ) === range( 0, count( $obj ) - 1 ) ) {
				$out = array();
				foreach ( $obj as $item ) {
					$out[] = self::sanitize_payload( $item );
				}
				return $out;
			}
			$out = array();
			foreach ( $obj as $key => $val ) {
				if ( $key === 'language_name' ) {
					continue;
				}
				$out[ $key ] = self::sanitize_payload( $val );
			}
			return $out;
		}
		return $obj;
	}

	/**
	 * @param mixed  $obj
	 * @param string $key_to_find
	 */
	public static function contains_key_deep( $obj, string $key_to_find ): bool {
		if ( $obj === null || ! is_array( $obj ) ) {
			return false;
		}
		if ( array_key_exists( $key_to_find, $obj ) ) {
			return true;
		}
		foreach ( $obj as $val ) {
			if ( is_array( $val ) && self::contains_key_deep( $val, $key_to_find ) ) {
				return true;
			}
		}
		return false;
	}

	public static function location_code_from_name( ?string $location_name ): int {
		$name = trim( preg_replace( '/\s+/u', ' ', (string) $location_name ) );
		if ( $name !== '' && isset( self::LOCATION_MAP[ $name ] ) ) {
			return (int) self::LOCATION_MAP[ $name ];
		}
		if ( $name === '' ) {
			return 2840;
		}

		$parts = array_values( array_filter( array_map( 'trim', explode( ',', $name ) ) ) );
		if ( ! empty( $parts[0] ) ) {
			$city_key = strtolower( $parts[0] );
			if ( isset( self::CITY_LOCATION_MAP[ $city_key ] ) ) {
				return (int) self::CITY_LOCATION_MAP[ $city_key ];
			}
		}

		$joined = strtolower( implode( ' ', $parts ) );
		if (
			strpos( $joined, 'canada' ) !== false
			|| preg_match( '/\b(ab|bc|mb|on|sk|qc|nl|nb|ns|pe|yt|nt|nu|alberta|manitoba|ontario|saskatchewan)\b/', $joined )
		) {
			return (int) self::LOCATION_MAP['Canada'];
		}
		if ( strpos( $joined, 'united kingdom' ) !== false || strpos( $joined, ' england' ) !== false ) {
			return (int) self::LOCATION_MAP['United Kingdom'];
		}
		if ( strpos( $joined, 'australia' ) !== false ) {
			return (int) self::LOCATION_MAP['Australia'];
		}

		return 2840;
	}

	/**
	 * @param array<string,mixed> $body
	 */
	public static function location_code_from_request_body( array $body ): int {
		if ( isset( $body['location_code'] ) && is_numeric( $body['location_code'] ) ) {
			$code = (int) $body['location_code'];
			if ( $code > 0 ) {
				return $code;
			}
		}
		$name = isset( $body['location_name'] ) ? (string) $body['location_name'] : '';
		return self::location_code_from_name( $name );
	}

	/**
	 * @param array<string,mixed> $task
	 */
	public static function is_benign_empty_task( array $task ): bool {
		if ( empty( $task['status_code'] ) || (int) $task['status_code'] === 20000 ) {
			return false;
		}
		$sm = strtolower( (string) ( $task['status_message'] ?? '' ) );
		return strpos( $sm, 'no search result' ) !== false
			|| strpos( $sm, 'no results' ) !== false
			|| strpos( $sm, 'no data' ) !== false
			|| strpos( $sm, 'not found' ) !== false;
	}

	/**
	 * @param string           $endpoint Path after /v3.
	 * @param array<int,mixed> $tasks
	 * @param array<string,mixed> $options
	 * @return array<string,mixed>|WP_Error
	 */
	public static function post( string $endpoint, array $tasks, array $options = array() ) {
		$creds = self::credentials();
		if ( $creds['login'] === '' || $creds['password'] === '' ) {
			return new WP_Error(
				'neo-pulse_dfs_missing',
				'DataForSEO credentials are not configured.'
			);
		}

		$timeout = isset( $options['timeout'] ) ? (int) $options['timeout'] : 60000;
		$timeout = max( 10, min( 300, (int) ceil( $timeout / 1000 ) ) );

		$payload = self::sanitize_payload( array_values( $tasks ) );
		if ( self::contains_key_deep( $payload, 'language_name' ) ) {
			return new WP_Error( 'neo-pulse_dfs_payload', 'language_name is not allowed in DataForSEO payload.' );
		}

		$endpoint = ltrim( $endpoint, '/' );
		$url      = self::API_BASE . '/' . $endpoint;

		$response = wp_remote_post(
			$url,
			array(
				'timeout' => $timeout,
				'headers' => array(
					'Authorization' => 'Basic ' . base64_encode( $creds['login'] . ':' . $creds['password'] ),
					'Content-Type'  => 'application/json; charset=utf-8',
					'Accept'        => 'application/json',
				),
				'body'    => wp_json_encode( $payload ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );

		$is_auth_err = ( $code === 401 )
			|| ( is_array( $data ) && ( (int) ( $data['status_code'] ?? 0 ) === 40100 || (int) ( $data['tasks'][0]['status_code'] ?? 0 ) === 40100 ) );

		// If a browser-supplied X-DataForSEO-Api-Key returned 401 / 40100, retry with server credentials when configured.
		if ( $is_auth_err && method_exists( 'Neo_Pulse_App_Secrets', 'server_dataforseo_credentials' ) ) {
			$server_creds = Neo_Pulse_App_Secrets::server_dataforseo_credentials();
			if (
				$server_creds['login'] !== '' &&
				$server_creds['password'] !== '' &&
				( $server_creds['login'] !== $creds['login'] || $server_creds['password'] !== $creds['password'] )
			) {
				$retry_response = wp_remote_post(
					$url,
					array(
						'timeout' => $timeout,
						'headers' => array(
							'Authorization' => 'Basic ' . base64_encode( $server_creds['login'] . ':' . $server_creds['password'] ),
							'Content-Type'  => 'application/json; charset=utf-8',
							'Accept'        => 'application/json',
						),
						'body'    => wp_json_encode( $payload ),
					)
				);
				if ( ! is_wp_error( $retry_response ) ) {
					$response = $retry_response;
					$code     = (int) wp_remote_retrieve_response_code( $response );
					$raw      = wp_remote_retrieve_body( $response );
					$data     = json_decode( $raw, true );
				}
			}
		}

		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $data ) && ! empty( $data['status_message'] )
				? (string) $data['status_message']
				: ( $raw !== '' ? $raw : sprintf( 'HTTP %d', $code ) );
			return new WP_Error( 'neo-pulse_dfs_http', $msg, array( 'status' => $code ) );
		}

		if ( ! is_array( $data ) ) {
			return new WP_Error( 'neo-pulse_dfs_bad_json', 'DataForSEO returned an unexpected response.' );
		}

		return $data;
	}

	/**
	 * @param string               $endpoint
	 * @param array<string,mixed>  $options
	 * @return array<string,mixed>|WP_Error
	 */
	public static function get( string $endpoint, array $options = array() ) {
		$creds = self::credentials();
		if ( $creds['login'] === '' || $creds['password'] === '' ) {
			return new WP_Error( 'neo-pulse_dfs_missing', 'DataForSEO credentials are not configured.' );
		}

		$timeout = isset( $options['timeout'] ) ? (int) $options['timeout'] : 60000;
		$timeout = max( 10, min( 300, (int) ceil( $timeout / 1000 ) ) );

		$endpoint = ltrim( $endpoint, '/' );
		$url      = self::API_BASE . '/' . $endpoint;

		$response = wp_remote_get(
			$url,
			array(
				'timeout' => $timeout,
				'headers' => array(
					'Authorization' => 'Basic ' . base64_encode( $creds['login'] . ':' . $creds['password'] ),
					'Content-Type'  => 'application/json; charset=utf-8',
					'Accept'        => 'application/json',
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );

		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $data ) && ! empty( $data['status_message'] )
				? (string) $data['status_message']
				: ( $raw !== '' ? $raw : sprintf( 'HTTP %d', $code ) );
			return new WP_Error( 'neo-pulse_dfs_http', $msg, array( 'status' => $code ) );
		}

		return is_array( $data ) ? $data : new WP_Error( 'neo-pulse_dfs_bad_json', 'DataForSEO returned an unexpected response.' );
	}

	/**
	 * @param array<string,mixed> $result
	 * @param bool                $allow_benign_empty
	 * @return true|WP_Error
	 */
	public static function assert_task_ok( array $result, bool $allow_benign_empty = false ) {
		if ( empty( $result['tasks'][0] ) || ! is_array( $result['tasks'][0] ) ) {
			return true;
		}
		$task = $result['tasks'][0];
		if ( empty( $task['status_code'] ) || (int) $task['status_code'] === 20000 ) {
			return true;
		}
		if ( $allow_benign_empty && self::is_benign_empty_task( $task ) ) {
			return true;
		}
		$msg = isset( $task['status_message'] ) ? (string) $task['status_message'] : 'DataForSEO task failed.';
		return new WP_Error( 'neo-pulse_dfs_task', $msg, array( 'status_code' => (int) $task['status_code'] ) );
	}
}
