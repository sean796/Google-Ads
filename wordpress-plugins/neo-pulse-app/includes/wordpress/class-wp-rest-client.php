<?php
/**
 * Outbound WordPress REST HTTP client (wp_remote_* + Basic auth + 429 retry).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Rest_Client {

	const CHROME_VERSION = '148.0.7778.56';

	const USER_AGENT =
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.56 Safari/537.36';

	/** @var array<string,string> */
	private static $origin_cookies = array();

	/**
	 * @param string               $method  HTTP method.
	 * @param string               $url     Full URL.
	 * @param string               $username WP user.
	 * @param string               $app_password App password.
	 * @param array<string,mixed>  $options timeout, body, params, headers, accept, referer, cookie, content_type.
	 * @return array{status:int,headers:array<string,string>,body:mixed,raw:string,is_wp_error:bool,error:string}
	 */
	public static function request( $method, $url, $username, $app_password, $options = array() ) {
		$max_attempts = isset( $options['max_attempts'] ) ? (int) $options['max_attempts'] : 5;
		$base_ms      = isset( $options['base_ms'] ) ? (int) $options['base_ms'] : 300;
		$last         = null;

		for ( $attempt = 0; $attempt < $max_attempts; $attempt++ ) {
			$response = self::request_once( $method, $url, $username, $app_password, $options );
			$last     = $response;
			if ( $response['is_wp_error'] ) {
				return $response;
			}
			if ( (int) $response['status'] !== 429 || $attempt >= $max_attempts - 1 ) {
				return $response;
			}
			$retry_ms = self::retry_after_ms( $response['headers'] );
			if ( $retry_ms === null ) {
				$retry_ms = min( $base_ms * ( 2 ** $attempt ), 20000 );
			}
			usleep( $retry_ms * 1000 );
		}

		return $last ? $last : array(
			'status'      => 0,
			'headers'     => array(),
			'body'        => null,
			'raw'         => '',
			'is_wp_error' => true,
			'error'       => 'Request failed',
		);
	}

	/**
	 * @param string              $normalized_url Site origin.
	 * @return array{cookie:string,warmup_status:int}
	 */
	public static function warm_origin_session( $normalized_url ) {
		$key = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $normalized_url );
		if ( Neo_Pulse_App_Ssrf_Guard::validate_public_url( $key, true ) !== null ) {
			return array(
				'cookie'        => '',
				'warmup_status' => 0,
			);
		}
		if ( isset( self::$origin_cookies[ $key ] ) ) {
			return array(
				'cookie'        => self::$origin_cookies[ $key ],
				'warmup_status' => 200,
			);
		}
		$response = wp_remote_get(
			$key . '/',
			array(
				'timeout'     => 15,
				'redirection' => 5,
				'headers'     => array(
					'User-Agent'      => self::USER_AGENT,
					'Accept'          => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
					'Accept-Language' => 'en-US,en;q=0.9',
				),
			)
		);
		$cookie = '';
		$status = 0;
		if ( ! is_wp_error( $response ) ) {
			$status  = (int) wp_remote_retrieve_response_code( $response );
			$headers = wp_remote_retrieve_headers( $response );
			$cookie  = self::cookie_from_set_cookie_header( $headers );
		}
		self::$origin_cookies[ $key ] = $cookie;
		return array(
			'cookie'        => $cookie,
			'warmup_status' => $status,
		);
	}

	/**
	 * @param string              $method HTTP method.
	 * @param string              $url    URL.
	 * @param string              $username User.
	 * @param string              $app_password Password.
	 * @param array<string,mixed> $options Options.
	 * @return array{status:int,headers:array<string,string>,body:mixed,raw:string,is_wp_error:bool,error:string}
	 */
	private static function request_once( $method, $url, $username, $app_password, $options ) {
		$params = isset( $options['params'] ) && is_array( $options['params'] ) ? $options['params'] : array();
		if ( $params ) {
			$url = add_query_arg( $params, $url );
		}

		// Wave 0 SSRF: caller-supplied site URLs must resolve to public hosts.
		$ssrf_error = Neo_Pulse_App_Ssrf_Guard::validate_public_url( (string) $url, true );
		if ( $ssrf_error !== null ) {
			return array(
				'status'      => 0,
				'headers'     => array(),
				'body'        => null,
				'raw'         => '',
				'is_wp_error' => true,
				'error'       => $ssrf_error,
			);
		}

		$timeout = isset( $options['timeout'] ) ? (int) $options['timeout'] : 30;
		$headers = self::auth_headers( $username, $app_password, $options );

		$args = array(
			'method'      => strtoupper( $method ),
			'timeout'     => $timeout,
			'redirection' => 5,
			'headers'     => $headers,
		);

		if ( array_key_exists( 'body', $options ) ) {
			$body = $options['body'];
			if ( is_array( $body ) ) {
				$args['body'] = wp_json_encode( $body );
			} else {
				$args['body'] = $body;
			}
		}

		$response = wp_remote_request( $url, $args );
		if ( is_wp_error( $response ) ) {
			return array(
				'status'      => 0,
				'headers'     => array(),
				'body'        => null,
				'raw'         => '',
				'is_wp_error' => true,
				'error'       => $response->get_error_message(),
			);
		}

		$status = (int) wp_remote_retrieve_response_code( $response );
		$raw    = (string) wp_remote_retrieve_body( $response );
		$parsed = self::parse_json_body( $raw );
		$hdrs   = self::flatten_headers( wp_remote_retrieve_headers( $response ) );

		return array(
			'status'      => $status,
			'headers'     => $hdrs,
			'body'        => $parsed,
			'raw'         => $raw,
			'is_wp_error' => false,
			'error'       => '',
		);
	}

	/**
	 * @param string              $username User.
	 * @param string              $app_password Password.
	 * @param array<string,mixed> $options Options.
	 * @return array<string,string>
	 */
	public static function auth_headers( $username, $app_password, $options = array() ) {
		$accept = isset( $options['accept'] ) ? (string) $options['accept'] : 'application/json';
		$headers = array(
			'Authorization'   => 'Basic ' . base64_encode( $username . ':' . $app_password ),
			'Accept'          => $accept,
			'User-Agent'      => isset( $options['user_agent'] ) ? (string) $options['user_agent'] : self::USER_AGENT,
			'Accept-Language' => isset( $options['accept_language'] ) ? (string) $options['accept_language'] : 'en-US,en;q=0.9',
		);
		if ( ! empty( $options['referer'] ) ) {
			$headers['Referer']         = (string) $options['referer'];
			$headers['Sec-Fetch-Site']  = 'same-origin';
			$headers['Sec-Fetch-Mode']  = 'cors';
			$headers['Sec-Fetch-Dest']  = 'empty';
		}
		if ( ! empty( $options['cookie'] ) ) {
			$headers['Cookie'] = (string) $options['cookie'];
		}
		if ( ! isset( $options['content_type'] ) || $options['content_type'] !== false ) {
			$headers['Content-Type'] = isset( $options['content_type'] ) ? (string) $options['content_type'] : 'application/json';
		}
		if ( ! empty( $options['headers'] ) && is_array( $options['headers'] ) ) {
			foreach ( $options['headers'] as $k => $v ) {
				$headers[ (string) $k ] = (string) $v;
			}
		}
		return $headers;
	}

	/**
	 * @param string $raw Raw response body.
	 * @return mixed
	 */
	public static function parse_json_body( $raw ) {
		if ( $raw === '' ) {
			return null;
		}
		$decoded = json_decode( $raw, true );
		if ( JSON_ERROR_NONE === json_last_error() ) {
			return $decoded;
		}
		return $raw;
	}

	/**
	 * @param mixed $headers Response headers.
	 * @return array<string,string>
	 */
	public static function flatten_headers( $headers ) {
		$out = array();
		if ( is_object( $headers ) && method_exists( $headers, 'getAll' ) ) {
			foreach ( $headers->getAll() as $name => $values ) {
				$out[ strtolower( (string) $name ) ] = is_array( $values ) ? implode( ', ', $values ) : (string) $values;
			}
			return $out;
		}
		if ( is_array( $headers ) ) {
			foreach ( $headers as $name => $values ) {
				$out[ strtolower( (string) $name ) ] = is_array( $values ) ? implode( ', ', $values ) : (string) $values;
			}
		}
		return $out;
	}

	/**
	 * @param mixed $headers Response headers.
	 * @return string
	 */
	private static function cookie_from_set_cookie_header( $headers ) {
		$flat = self::flatten_headers( $headers );
		$set  = isset( $flat['set-cookie'] ) ? $flat['set-cookie'] : '';
		if ( $set === '' ) {
			return '';
		}
		$parts = array();
		foreach ( explode( ',', $set ) as $chunk ) {
			$first = trim( explode( ';', $chunk )[0] );
			if ( strpos( $first, '=' ) !== false ) {
				$parts[] = $first;
			}
		}
		return implode( '; ', $parts );
	}

	/**
	 * @param array<string,string> $headers Response headers.
	 * @return int|null Milliseconds.
	 */
	private static function retry_after_ms( $headers ) {
		$key = isset( $headers['retry-after'] ) ? $headers['retry-after'] : '';
		if ( $key === '' ) {
			return null;
		}
		$sec = (int) $key;
		if ( $sec >= 0 ) {
			return min( $sec * 1000, 120000 );
		}
		return null;
	}

	/**
	 * Map transport errors to user-facing messages.
	 *
	 * @param array{is_wp_error:bool,error:string} $response Client response.
	 * @return string|null
	 */
	public static function transport_error_message( $response ) {
		if ( empty( $response['is_wp_error'] ) ) {
			return null;
		}
		$msg = strtolower( (string) $response['error'] );
		if ( strpos( $msg, 'could not resolve' ) !== false || strpos( $msg, 'connection refused' ) !== false ) {
			return 'Cannot reach WordPress site. Please check the URL.';
		}
		if ( strpos( $msg, 'timed out' ) !== false || strpos( $msg, 'timeout' ) !== false ) {
			return 'Connection timeout. The WordPress site may be slow or unreachable.';
		}
		return (string) $response['error'];
	}
}
