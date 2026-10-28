<?php
/**
 * Semrush Analytics API client.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Semrush_Client {

	const API_BASE = 'https://api.semrush.com/';

	const DISPLAY_LIMIT = 50;

	/** @var string */
	private static $request_api_key = '';

	/**
	 * @param array<string,mixed> $body
	 */
	public static function bind_api_key_for_request( array $body ): void {
		self::$request_api_key = Neo_Pulse_App_Secrets::semrush_api_key_for_request( $body );
	}

	public static function clear_request_api_key(): void {
		self::$request_api_key = '';
	}

	public static function has_api_key(): bool {
		return self::api_key() !== '';
	}

	public static function api_key(): string {
		if ( self::$request_api_key !== '' ) {
			return self::$request_api_key;
		}
		return Neo_Pulse_App_Secrets::semrush_api_key();
	}

	/**
	 * v4 / MCP-style keys use Authorization: Apikey. Classic v3 keys use ?key= query param.
	 *
	 * @param array<string,string|int> $params
	 * @return array{params:array<string,string|int>,headers:array<string,string>}
	 */
	public static function auth_for_get( string $key, array $params ): array {
		$headers = array(
			'Accept' => 'text/plain, */*',
		);
		if ( self::key_uses_apikey_header( $key ) ) {
			$headers['Authorization'] = 'Apikey ' . $key;
		} else {
			$params['key'] = $key;
		}
		return array(
			'params'  => $params,
			'headers' => $headers,
		);
	}

	public static function key_uses_apikey_header( string $key ): bool {
		return str_starts_with( $key, 'semrtkn-' );
	}

	/**
	 * @param array<string,string|int> $params
	 * @return string|WP_Error
	 */
	public static function request_report( array $params ) {
		$key = self::api_key();
		if ( $key === '' ) {
			return new WP_Error( 'neo-pulse_semrush_missing', 'SEMRUSH_API_KEY is not set' );
		}

		$auth = self::auth_for_get( $key, $params );
		$url  = add_query_arg( $auth['params'], self::API_BASE );

		$response = Neo_Pulse_App_Http_Transient_Retry::remote_get(
			$url,
			array(
				'timeout' => 60,
				'headers' => $auth['headers'],
			),
			3
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		if ( $code < 200 || $code >= 300 ) {
			return new WP_Error( 'neo-pulse_semrush_http', $raw !== '' ? $raw : sprintf( 'HTTP %d', $code ) );
		}

		if ( stripos( $raw, 'ERROR' ) === 0 ) {
			return new WP_Error( 'neo-pulse_semrush_api', trim( $raw ) );
		}

		return (string) $raw;
	}

	/**
	 * Run multiple Semrush report GETs concurrently (curl_multi).
	 *
	 * @param array<string,array<string,string|int>> $keyed_params
	 * @return array<string,string|WP_Error>
	 */
	public static function request_reports_parallel( array $keyed_params, int $timeout_seconds = 60 ): array {
		if ( count( $keyed_params ) === 0 ) {
			return array();
		}

		$key = self::api_key();
		if ( $key === '' ) {
			$missing = new WP_Error( 'neo-pulse_semrush_missing', 'SEMRUSH_API_KEY is not set' );
			$out     = array();
			foreach ( array_keys( $keyed_params ) as $id ) {
				$out[ $id ] = $missing;
			}
			return $out;
		}

		$timeout_seconds = max( 10, min( 120, $timeout_seconds ) );

		if ( count( $keyed_params ) === 1 || ! function_exists( 'curl_multi_init' ) ) {
			$out = array();
			foreach ( $keyed_params as $id => $params ) {
				$out[ $id ] = self::request_report( $params );
			}
			return $out;
		}

		$mh      = curl_multi_init();
		$handles = array();
		$results = array();

		foreach ( $keyed_params as $id => $params ) {
			$auth = self::auth_for_get( $key, $params );
			$url  = add_query_arg( $auth['params'], self::API_BASE );
			$ch   = curl_init( $url );
			curl_setopt_array(
				$ch,
				array(
					CURLOPT_HTTPGET        => true,
					CURLOPT_HTTPHEADER     => self::curl_headers_from_assoc( $auth['headers'] ),
					CURLOPT_RETURNTRANSFER => true,
					CURLOPT_TIMEOUT        => $timeout_seconds,
				)
			);
			curl_multi_add_handle( $mh, $ch );
			$handles[ $id ] = $ch;
		}

		$running = null;
		do {
			$status = curl_multi_exec( $mh, $running );
			if ( $running ) {
				curl_multi_select( $mh, 1.0 );
			}
		} while ( $running && $status === CURLM_OK );

		foreach ( $handles as $id => $ch ) {
			$raw  = curl_multi_getcontent( $ch );
			$code = (int) curl_getinfo( $ch, CURLINFO_HTTP_CODE );
			curl_multi_remove_handle( $mh, $ch );
			curl_close( $ch );

			if ( $code < 200 || $code >= 300 ) {
				$results[ $id ] = new WP_Error(
					'neo-pulse_semrush_http',
					$raw !== '' ? (string) $raw : sprintf( 'HTTP %d', $code )
				);
				continue;
			}
			if ( stripos( (string) $raw, 'ERROR' ) === 0 ) {
				$results[ $id ] = new WP_Error( 'neo-pulse_semrush_api', trim( (string) $raw ) );
				continue;
			}
			$results[ $id ] = (string) $raw;
		}

		curl_multi_close( $mh );
		return $results;
	}

	/**
	 * @param array<string,string> $headers
	 * @return array<int,string>
	 */
	private static function curl_headers_from_assoc( array $headers ): array {
		$out = array();
		foreach ( $headers as $name => $value ) {
			$out[] = $name . ': ' . $value;
		}
		return $out;
	}

	public static function normalize_url( string $page_url ): string {
		$s = trim( $page_url );
		if ( $s === '' ) {
			return '';
		}
		if ( ! preg_match( '#^https?://#i', $s ) ) {
			$s = 'https://' . ltrim( $s, '/' );
		}
		return $s;
	}

	/**
	 * @return array<int,string>
	 */
	public static function keywords_from_csv( string $csv ): array {
		$lines = preg_split( '/\r\n|\r|\n/', trim( $csv ) );
		if ( ! is_array( $lines ) || count( $lines ) < 2 ) {
			return array();
		}

		$header = self::split_csv_line( $lines[0] );
		$ph_col = -1;
		foreach ( $header as $i => $col ) {
			if ( strcasecmp( trim( $col ), 'Ph' ) === 0 || strcasecmp( trim( $col ), 'Keyword' ) === 0 ) {
				$ph_col = (int) $i;
				break;
			}
		}
		if ( $ph_col < 0 ) {
			$ph_col = 0;
		}

		$out  = array();
		$seen = array();
		for ( $i = 1; $i < count( $lines ); $i++ ) {
			$row = self::split_csv_line( $lines[ $i ] );
			if ( ! isset( $row[ $ph_col ] ) ) {
				continue;
			}
			$kw = trim( (string) $row[ $ph_col ] );
			if ( $kw === '' ) {
				continue;
			}
			$k = strtolower( $kw );
			if ( isset( $seen[ $k ] ) ) {
				continue;
			}
			$seen[ $k ] = true;
			$out[]      = $kw;
		}

		return $out;
	}

	/**
	 * @return array<int,string>
	 */
	public static function urls_from_csv( string $csv ): array {
		$lines = preg_split( '/\r\n|\r|\n/', trim( $csv ) );
		if ( ! is_array( $lines ) || count( $lines ) < 1 ) {
			return array();
		}

		$header  = self::split_csv_line( $lines[0] );
		$url_col = -1;
		foreach ( $header as $i => $col ) {
			$c = trim( $col );
			if ( strcasecmp( $c, 'Ur' ) === 0 || strcasecmp( $c, 'Url' ) === 0 || strcasecmp( $c, 'URL' ) === 0 ) {
				$url_col = (int) $i;
				break;
			}
		}

		$out  = array();
		$seen = array();
		$start = $url_col >= 0 ? 1 : 0;
		for ( $i = $start; $i < count( $lines ); $i++ ) {
			$row = self::split_csv_line( $lines[ $i ] );
			if ( $url_col >= 0 ) {
				$cell = $row[ $url_col ] ?? '';
			} else {
				$cell = $lines[ $i ];
			}
			$url = self::normalize_http_url( (string) $cell );
			if ( $url === null ) {
				continue;
			}
			$k = strtolower( $url );
			if ( isset( $seen[ $k ] ) ) {
				continue;
			}
			$seen[ $k ] = true;
			$out[]      = $url;
		}

		return $out;
	}

	/**
	 * @return array<int,string>
	 */
	private static function split_csv_line( string $line ): array {
		if ( strpos( $line, ';' ) !== false ) {
			return array_map( 'trim', explode( ';', $line ) );
		}
		return array_map( 'trim', explode( ',', $line ) );
	}

	private static function normalize_http_url( string $cell ): ?string {
		$t = trim( preg_replace( '/[),.;]+$/', '', $cell ) );
		if ( $t === '' ) {
			return null;
		}
		if ( preg_match( '#^https?://[^\s;"\'\]]+#i', $t, $m ) ) {
			return $m[0];
		}
		return null;
	}

	/**
	 * @param string $site_url
	 */
	public static function database_from_site_url( string $site_url ): string {
		$s = trim( $site_url );
		if ( $s === '' ) {
			return 'us';
		}
		if ( ! preg_match( '#^https?://#i', $s ) ) {
			$s = 'https://' . $s;
		}
		$host = wp_parse_url( $s, PHP_URL_HOST );
		if ( ! is_string( $host ) ) {
			return 'us';
		}
		$host = strtolower( preg_replace( '/^www\./', '', $host ) );
		if ( substr( $host, -3 ) === '.ca' ) {
			return 'ca';
		}
		if ( substr( $host, -6 ) === '.co.uk' ) {
			return 'uk';
		}
		if ( substr( $host, -6 ) === '.com.au' ) {
			return 'au';
		}
		if ( substr( $host, -3 ) === '.de' ) {
			return 'de';
		}
		if ( substr( $host, -3 ) === '.fr' ) {
			return 'fr';
		}
		return 'us';
	}
}
