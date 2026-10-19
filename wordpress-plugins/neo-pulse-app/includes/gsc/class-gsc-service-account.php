<?php
/**
 * GSC service account auth, property resolution, and Search Analytics API.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Gsc_Service_Account {

	const TOKEN_URL      = 'https://oauth2.googleapis.com/token';
	const WEBMASTERS     = 'https://www.googleapis.com/webmasters/v3';
	const SCOPE_READONLY = 'https://www.googleapis.com/auth/webmasters.readonly';
	const SCOPE_FULL     = 'https://www.googleapis.com/auth/webmasters';
	const TOKEN_TTL              = 3000;
	const PROPERTY_CACHE_TTL     = 900;
	const EMAIL_FALLBACK         = 'neopulse@neopulse-505422.iam.gserviceaccount.com';

	public static function service_account_email(): string {
		$creds = self::get_credentials();
		if ( is_array( $creds ) && ! empty( $creds['client_email'] ) ) {
			return (string) $creds['client_email'];
		}
		return self::EMAIL_FALLBACK;
	}

	/**
	 * @return array<string,string>|WP_Error
	 */
	/** @var array<string,string>|null */
	private static $credential_cache = null;

	public static function clear_credentials_cache(): void {
		self::$credential_cache = null;
	}

	public static function get_credentials() {
		if ( is_array( self::$credential_cache ) ) {
			return self::$credential_cache;
		}

		$raw = Neo_Pulse_App_Secrets::gsc_service_account_json();
		if ( $raw === '' ) {
			return new WP_Error(
				'neo-pulse_gsc_missing',
				'GSC service account JSON is not configured.',
				array( 'clientEmail' => self::EMAIL_FALLBACK )
			);
		}

		$data = json_decode( trim( $raw ), true );
		if ( ! is_array( $data ) ) {
			return new WP_Error( 'neo-pulse_gsc_bad_json', 'GSC service account JSON is invalid.' );
		}

		$email = isset( $data['client_email'] ) ? trim( (string) $data['client_email'] ) : '';
		$key   = isset( $data['private_key'] ) ? (string) $data['private_key'] : '';
		$key   = str_replace( '\\n', "\n", $key );

		if ( $email === '' || $key === '' ) {
			return new WP_Error(
				'neo-pulse_gsc_incomplete',
				'GSC service account JSON must include client_email and private_key.'
			);
		}

		self::$credential_cache = array(
			'client_email' => $email,
			'private_key'  => $key,
			'project_id'   => isset( $data['project_id'] ) ? (string) $data['project_id'] : '',
		);
		return self::$credential_cache;
	}

	/**
	 * @return string|WP_Error
	 */
	public static function get_access_token( bool $require_write = false ) {
		$creds = self::get_credentials();
		if ( is_wp_error( $creds ) ) {
			return $creds;
		}

		$scope     = $require_write ? self::SCOPE_FULL : self::SCOPE_READONLY;
		$cache_key = 'neo-pulse_app_gsc_token_' . md5( $creds['client_email'] . '|' . $scope . '|' . NEO_PULSE_APP_VERSION );
		$cached    = get_transient( $cache_key );
		if ( is_string( $cached ) && $cached !== '' ) {
			return $cached;
		}

		$jwt = self::build_jwt( $creds['client_email'], $creds['private_key'], $scope );
		if ( is_wp_error( $jwt ) ) {
			return $jwt;
		}

		$response = Neo_Pulse_App_Http_Transient_Retry::remote_post(
			self::TOKEN_URL,
			array(
				'timeout' => 30,
				'headers' => array( 'Content-Type' => 'application/x-www-form-urlencoded' ),
				'body'    => array(
					'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
					'assertion'  => $jwt,
				),
			),
			3
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );

		if ( $code < 200 || $code >= 300 || ! is_array( $data ) || empty( $data['access_token'] ) ) {
			$msg = is_array( $data ) && ! empty( $data['error_description'] )
				? (string) $data['error_description']
				: ( $raw !== '' ? $raw : 'HTTP ' . $code );
			return new WP_Error( 'neo-pulse_gsc_token', $msg );
		}

		$token = (string) $data['access_token'];
		set_transient( $cache_key, $token, self::TOKEN_TTL );
		return $token;
	}

	/**
	 * @return string|WP_Error
	 */
	private static function build_jwt( string $client_email, string $private_key, string $scope ) {
		$now    = time();
		$header = self::base64url_encode( wp_json_encode( array( 'alg' => 'RS256', 'typ' => 'JWT' ) ) );
		$claim  = self::base64url_encode(
			wp_json_encode(
				array(
					'iss'   => $client_email,
					'scope' => $scope,
					'aud'   => self::TOKEN_URL,
					'exp'   => $now + 3600,
					'iat'   => $now,
				)
			)
		);

		$input = $header . '.' . $claim;
		$key   = openssl_pkey_get_private( $private_key );
		if ( false === $key ) {
			return new WP_Error( 'neo-pulse_gsc_key', 'Could not read GSC service account private key.' );
		}

		$signature = '';
		$signed    = openssl_sign( $input, $signature, $key, OPENSSL_ALGO_SHA256 );
		if ( function_exists( 'openssl_free_key' ) ) {
			openssl_free_key( $key );
		}
		if ( ! $signed ) {
			return new WP_Error( 'neo-pulse_gsc_sign', 'Could not sign GSC JWT.' );
		}

		return $input . '.' . self::base64url_encode( $signature );
	}

	/**
	 * @return array{valid:bool,error?:string,startDateStr?:string,endDateStr?:string}
	 */
	public static function validate_dates( $start_date, $end_date ): array {
		if ( ! $start_date || ! $end_date ) {
			return array( 'valid' => false, 'error' => 'Both startDate and endDate are required (YYYY-MM-DD format)' );
		}

		$start = (string) $start_date;
		$end   = (string) $end_date;
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $start ) || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $end ) ) {
			return array( 'valid' => false, 'error' => 'Dates must be in YYYY-MM-DD format' );
		}

		$start_ts = strtotime( $start . ' UTC' );
		$end_ts   = strtotime( $end . ' UTC' );
		$today_ts = strtotime( gmdate( 'Y-m-d' ) . ' UTC' );

		if ( false === $start_ts || false === $end_ts ) {
			return array( 'valid' => false, 'error' => 'Invalid date format' );
		}
		if ( $end_ts > $today_ts ) {
			return array( 'valid' => false, 'error' => 'endDate cannot be in the future' );
		}
		if ( $start_ts >= $end_ts ) {
			return array( 'valid' => false, 'error' => 'startDate must be before endDate' );
		}

		return array(
			'valid'        => true,
			'startDateStr' => $start,
			'endDateStr'   => $end,
		);
	}

	public static function requested_domain_from_site_url( string $site_url ): string {
		$normalized = strtolower( trim( $site_url ) );
		$without    = preg_replace( '#^https?://#', '', $normalized );
		$without    = is_string( $without ) ? rtrim( $without, '/' ) : '';
		$domain     = explode( '/', $without )[0];
		return preg_replace( '/^www\./', '', $domain );
	}

	/**
	 * @return array{match:?string,accessibleSiteUrls:array<int,string>,requestedDomain:string,listError?:string}
	 */
	public static function find_matching_property( string $site_url ): array {
		$requested = self::requested_domain_from_site_url( $site_url );
		$empty     = array(
			'match'               => null,
			'accessibleSiteUrls'  => array(),
			'requestedDomain'     => $requested,
		);

		if ( $requested === '' ) {
			return $empty;
		}

		$cache_key = 'neo-pulse_app_gsc_prop_' . md5( $requested );
		$cached    = get_transient( $cache_key );
		if ( is_array( $cached ) && ! empty( $cached['match'] ) ) {
			return $cached;
		}

		$sites = self::list_sites();
		if ( is_wp_error( $sites ) ) {
			$empty['listError'] = $sites->get_error_message();
			return $empty;
		}

		$accessible = array();
		foreach ( $sites as $site ) {
			if ( ! empty( $site['siteUrl'] ) ) {
				$accessible[] = (string) $site['siteUrl'];
			}
		}

		foreach ( $sites as $site ) {
			$raw = isset( $site['siteUrl'] ) ? (string) $site['siteUrl'] : '';
			if ( $raw === '' ) {
				continue;
			}
			if ( self::property_domain( $raw ) === $requested ) {
				$body = array(
					'match'              => $raw,
					'accessibleSiteUrls' => $accessible,
					'requestedDomain'    => $requested,
				);
				set_transient( $cache_key, $body, self::PROPERTY_CACHE_TTL );
				return $body;
			}
		}

		return array(
			'match'              => null,
			'accessibleSiteUrls' => $accessible,
			'requestedDomain'    => $requested,
		);
	}

	/**
	 * @return array<int,string>
	 */
	public static function generate_property_candidates( string $site_url ): array {
		$url = trim( $site_url );
		if ( $url === '' ) {
			return array();
		}
		if ( ! preg_match( '#^https?://#i', $url ) ) {
			$url = 'https://' . $url;
		}

		$candidates   = array();
		$with_slash   = substr( $url, -1 ) === '/' ? $url : $url . '/';
		$no_slash     = rtrim( $url, '/' );
		$candidates[] = $with_slash;
		if ( $no_slash !== $with_slash ) {
			$candidates[] = $no_slash;
		}

		$host = wp_parse_url( $url, PHP_URL_HOST );
		if ( is_string( $host ) && $host !== '' ) {
			$candidates[] = 'sc-domain:' . $host;
			if ( 0 !== strpos( $host, 'www.' ) ) {
				$candidates[] = 'sc-domain:www.' . $host;
				$candidates[] = 'https://www.' . $host . '/';
				$candidates[] = 'https://www.' . $host;
			} else {
				$bare = substr( $host, 4 );
				$candidates[] = 'sc-domain:' . $bare;
				$candidates[] = 'https://' . $bare . '/';
				$candidates[] = 'https://' . $bare;
			}
		}

		return array_values( array_unique( $candidates ) );
	}

	/**
	 * @return array{property:?string,matchDetails:array<string,mixed>}
	 */
	public static function resolve_or_fallback( string $site_url, string $start, string $end, string $dim = 'query' ): array {
		$fm    = self::find_matching_property( $site_url );
		$exact = $fm['match'];

		$candidates = array();
		if ( $exact ) {
			if ( 0 === strpos( $exact, 'sc-domain:' ) ) {
				$domain       = substr( $exact, strlen( 'sc-domain:' ) );
				$candidates[] = $exact;
				$candidates[] = 'https://' . $domain . '/';
				$candidates[] = 'https://' . $domain;
			} else {
				$candidates[] = $exact;
			}
		}

		foreach ( $candidates as $property ) {
			$probe = self::search_analytics_query(
				$property,
				array(
					'startDate'  => $start,
					'endDate'    => $end,
					'dimensions' => array( 'query' ),
					'rowLimit'   => 1,
				)
			);
			if ( ! is_wp_error( $probe ) ) {
				return array( 'property' => $property, 'matchDetails' => $fm );
			}
		}

		foreach ( self::generate_property_candidates( $site_url ) as $property ) {
			$probe = self::search_analytics_query(
				$property,
				array(
					'startDate'  => $start,
					'endDate'    => $end,
					'dimensions' => array( $dim ),
					'rowLimit'   => 1,
				)
			);
			if ( ! is_wp_error( $probe ) ) {
				return array( 'property' => $property, 'matchDetails' => $fm );
			}
		}

		return array( 'property' => null, 'matchDetails' => $fm );
	}

	/** @param array<string,mixed>|null $match_details */
	public static function property_error_payload( $match_details = null ): array {
		$email = self::service_account_email();
		$payload = array(
			'success' => false,
			'error' => 'Failed to find valid GSC property. Please verify the site URL and service account permissions.',
			'serviceAccountEmail' => $email, 'hint' => 'In Google Search Console, add ' . $email . ' under Settings → Users and permissions.', 'credentialsInUse' => $email,
		);
		if ( is_array( $match_details ) && ! empty( $match_details['requestedDomain'] ) && isset( $match_details['accessibleSiteUrls'] ) ) {
			$n = count( $match_details['accessibleSiteUrls'] );
			$payload['requestedDomain'] = $match_details['requestedDomain'];
			$payload['accessiblePropertyCount'] = $n;
			$payload['accessiblePropertiesPreview'] = array_slice( $match_details['accessibleSiteUrls'], 0, 40 );
		}
		return $payload;
	}

	/**
	 * @return array<int,array<string,mixed>>|WP_Error
	 */
	public static function list_sites() {
		$token = self::get_access_token( false );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$response = Neo_Pulse_App_Http_Transient_Retry::remote_get(
			self::WEBMASTERS . '/sites',
			array(
				'timeout' => 45,
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Accept'        => 'application/json',
				),
			),
			3
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );

		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $data ) && ! empty( $data['error']['message'] )
				? (string) $data['error']['message']
				: ( $raw !== '' ? $raw : 'HTTP ' . $code );
			return new WP_Error( 'neo-pulse_gsc_sites', $msg, array( 'status' => $code ) );
		}

		$entries = array();
		if ( is_array( $data ) && ! empty( $data['siteEntry'] ) && is_array( $data['siteEntry'] ) ) {
			foreach ( $data['siteEntry'] as $site ) {
				if ( ! is_array( $site ) || empty( $site['siteUrl'] ) ) {
					continue;
				}
				$entries[] = array(
					'siteUrl'         => (string) $site['siteUrl'],
					'permissionLevel' => isset( $site['permissionLevel'] ) ? (string) $site['permissionLevel'] : '',
				);
			}
		}

		return $entries;
	}

	public static function normalize_gsc_site_url( string $site_url ): string {
		$normalized = trim( $site_url );
		if ( preg_match( '/^sc-domain\s*:/i', $normalized ) ) {
			$normalized = preg_replace( '/^sc-domain\s*:\s*/i', '', $normalized );
		}
		$normalized = preg_replace( '#^https?://#i', '', $normalized );
		$normalized = trim( $normalized, '/' );
		$domain     = explode( '/', $normalized )[0];
		$domain     = explode( '?', $domain )[0];
		$domain     = explode( '#', $domain )[0];
		return $domain !== '' ? 'https://' . $domain . '/' : $site_url;
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	public static function test_connection() {
		$creds = self::get_credentials();
		if ( is_wp_error( $creds ) ) {
			return array( 'success' => false, 'connected' => false, 'error' => $creds->get_error_message() );
		}
		$sites = self::list_sites();
		if ( is_wp_error( $sites ) ) {
			$status = (int) ( $sites->get_error_data()['status'] ?? 500 );
			return array(
				'success' => false, 'connected' => false, 'error' => $sites->get_error_message(),
				'serviceAccount' => self::service_account_email(), 'credentialsInUse' => $creds['client_email'],
			) + ( 403 === $status ? array() : array() );
		}
		$normalized_sites = array_map(
			static function ( $site ) {
				$original = (string) ( $site['siteUrl'] ?? '' );
				return array(
					'siteUrl'         => self::normalize_gsc_site_url( $original ),
					'permissionLevel' => $site['permissionLevel'] ?? '',
					'originalFormat'  => $original,
				);
			},
			$sites
		);
		$email = $creds['client_email'];
		$count = count( $normalized_sites );
		return array(
			'success' => true, 'connected' => true, 'siteCount' => $count, 'sites' => $normalized_sites,
			'serviceAccount' => $email, 'credentialsInUse' => $email,
			'message' => $count > 0 ? "Successfully connected! Found {$count} site(s) in Google Search Console." : 'Connected successfully, but no sites found. Please verify the service account has access to properties in GSC.',
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|WP_Error
	 */
	public static function search_analytics_query( string $property, array $body ) {
		$token = self::get_access_token( false );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$url = self::WEBMASTERS . '/sites/' . rawurlencode( $property ) . '/searchAnalytics/query';
		$response = Neo_Pulse_App_Http_Transient_Retry::remote_post(
			$url,
			array(
				'timeout' => 90,
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
					'Accept'        => 'application/json',
				),
				'body'    => wp_json_encode( $body ),
			),
			3
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );

		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $data ) && ! empty( $data['error']['message'] )
				? (string) $data['error']['message']
				: ( $raw !== '' ? $raw : 'HTTP ' . $code );
			return new WP_Error( 'neo-pulse_gsc_query', $msg, array( 'status' => $code ) );
		}

		return is_array( $data ) ? $data : array();
	}

	/**
	 * Run multiple Search Analytics queries concurrently (curl_multi).
	 *
	 * @param array<string,array<string,mixed>> $keyed_bodies Request bodies keyed by caller id.
	 * @return array<string,array<string,mixed>|WP_Error>
	 */
	public static function search_analytics_query_parallel( string $property, array $keyed_bodies ): array {
		if ( count( $keyed_bodies ) === 0 ) {
			return array();
		}

		$token = self::get_access_token( false );
		if ( is_wp_error( $token ) ) {
			$out = array();
			foreach ( array_keys( $keyed_bodies ) as $key ) {
				$out[ $key ] = $token;
			}
			return $out;
		}

		$url = self::WEBMASTERS . '/sites/' . rawurlencode( $property ) . '/searchAnalytics/query';
		$headers = array(
			'Authorization: Bearer ' . $token,
			'Content-Type: application/json',
			'Accept: application/json',
		);

		if ( ! function_exists( 'curl_multi_init' ) ) {
			$out = array();
			foreach ( $keyed_bodies as $key => $body ) {
				$out[ $key ] = self::search_analytics_query( $property, $body );
			}
			return $out;
		}

		$mh           = curl_multi_init();
		$handles      = array();
		$handle_index = array();
		$results      = array();

		foreach ( $keyed_bodies as $key => $body ) {
			$ch = curl_init( $url );
			curl_setopt_array(
				$ch,
				array(
					CURLOPT_POST           => true,
					CURLOPT_POSTFIELDS     => wp_json_encode( $body ),
					CURLOPT_HTTPHEADER     => $headers,
					CURLOPT_RETURNTRANSFER => true,
					CURLOPT_TIMEOUT        => 90,
				)
			);
			curl_multi_add_handle( $mh, $ch );
			$handles[ $key ]                      = $ch;
			$handle_index[ spl_object_id( $ch ) ] = $key;
		}

		$running = null;
		do {
			$status = curl_multi_exec( $mh, $running );
			if ( $running ) {
				curl_multi_select( $mh, 0.5 );
			}
		} while ( $running && $status === CURLM_OK );

		foreach ( $handles as $key => $ch ) {
			$raw  = curl_multi_getcontent( $ch );
			$code = (int) curl_getinfo( $ch, CURLINFO_HTTP_CODE );
			curl_multi_remove_handle( $mh, $ch );
			curl_close( $ch );

			$data = json_decode( (string) $raw, true );
			if ( $code < 200 || $code >= 300 ) {
				$msg = is_array( $data ) && ! empty( $data['error']['message'] )
					? (string) $data['error']['message']
					: ( $raw !== '' ? (string) $raw : 'HTTP ' . $code );
				$results[ $key ] = new WP_Error( 'neo-pulse_gsc_query', $msg, array( 'status' => $code ) );
				continue;
			}
			$results[ $key ] = is_array( $data ) ? $data : array();
		}

		curl_multi_close( $mh );
		return $results;
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	public static function list_sitemaps( string $property ) {
		$token = self::get_access_token( false );
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$url = self::WEBMASTERS . '/sites/' . rawurlencode( $property ) . '/sitemaps';
		$response = Neo_Pulse_App_Http_Transient_Retry::remote_get(
			$url,
			array(
				'timeout' => 45,
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Accept'        => 'application/json',
				),
			),
			3
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );

		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $data ) && ! empty( $data['error']['message'] )
				? (string) $data['error']['message']
				: ( $raw !== '' ? $raw : 'HTTP ' . $code );
			return new WP_Error( 'neo-pulse_gsc_sitemaps', $msg, array( 'status' => $code ) );
		}

		return is_array( $data ) ? $data : array();
	}

	public static function write_report_date_range( array $range ): void {
		$path = Neo_Pulse_App_Data_Paths::file( 'gsc', 'report-date-range.json' );
		Neo_Pulse_App_Json_File_Store::write( $path, $range );
	}

	private static function property_domain( string $property_url ): string {
		$property_url = strtolower( trim( $property_url ) );
		if ( 0 === strpos( $property_url, 'sc-domain:' ) ) {
			$domain = substr( $property_url, strlen( 'sc-domain:' ) );
		} else {
			$domain = wp_parse_url( $property_url, PHP_URL_HOST );
			if ( ! is_string( $domain ) || $domain === '' ) {
				$domain = preg_replace( '#^https?://#', '', $property_url );
				$domain = is_string( $domain ) ? explode( '/', $domain )[0] : '';
			}
		}
		$domain = strtolower( trim( (string) $domain ) );
		return preg_replace( '/^www\./', '', $domain );
	}

	private static function base64url_encode( string $data ): string {
		return rtrim( strtr( base64_encode( $data ), '+/', '-_' ), '=' );
	}
}
