<?php
/**
 * Google Search Console client.
 *
 * Two ways in:
 *  - "agency" (the normal case): the site asks Neo Digital's update server with its site key. The
 *    Google key stays on neodigital.ca, so the client only adds Neo Digital's service account email
 *    as a user in Search Console. The server only answers for this key's own domain.
 *  - "own": a service account JSON saved under Settings → Search Console (Advanced) or in
 *    wp-config.php; the site then talks to Google directly. Takes priority when present.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Gsc {

	const TOKEN_URL     = 'https://oauth2.googleapis.com/token';
	const WEBMASTERS    = 'https://www.googleapis.com/webmasters/v3';
	const SCOPE         = 'https://www.googleapis.com/auth/webmasters.readonly';
	const TOKEN_TTL     = 3000;
	const STATS_TTL     = 900;
	const CONNECTION_TTL = HOUR_IN_SECONDS;
	const CONNECTION_ERROR_TTL = 600;
	const EMAIL_FALLBACK = 'neopulse@neopulse-505422.iam.gserviceaccount.com';

	/** Service account JSON pasted under Settings (not autoloaded). */
	const ACCOUNT_OPTION = 'neo_pulse_wp_gsc_service_account';

	/** Cached test_connection() result. */
	const CONNECTION_TRANSIENT = 'neo_pulse_wp_gsc_connection';

	/**
	 * Parsed credentials for this request (null = not resolved yet).
	 *
	 * @var array<string,string>|WP_Error|null
	 */
	private static $credentials = null;

	/**
	 * Where the credentials in use came from: constant, option, file, legacy_file or ''.
	 *
	 * @var string
	 */
	private static $credentials_source = '';

	/**
	 * @return array{start:string,end:string,label:string}
	 */
	public static function default_date_range(): array {
		$end   = gmdate( 'Y-m-d', strtotime( '-3 days' ) );
		$start = gmdate( 'Y-m-d', strtotime( $end . ' -27 days' ) );
		return array(
			'start' => $start,
			'end'   => $end,
			'label' => __( 'Last 28 days', 'neo-pulse-wp' ),
		);
	}

	/**
	 * Whether Search Console can be asked at all: an own key, or a site key for the Neo Digital relay.
	 * No request is made here (it runs on editor and admin page loads); fetch_* calls report a
	 * missing property or licence themselves.
	 */
	public static function is_available(): bool {
		return '' !== self::mode();
	}

	/**
	 * 'own' (service account key on this site), 'agency' (Neo Digital relay with the site key) or ''.
	 */
	public static function mode(): string {
		if ( self::has_service_account() ) {
			return 'own';
		}
		if ( class_exists( 'Neo_Pulse_Wp_License', false ) && '' !== Neo_Pulse_Wp_License::site_key() ) {
			return 'agency';
		}
		return '';
	}

	/**
	 * True when a usable service account JSON (client_email + private_key) is configured.
	 */
	public static function has_service_account(): bool {
		return ! is_wp_error( self::get_credentials() );
	}

	/**
	 * Store a service account JSON pasted under Settings. An empty string removes the stored one.
	 *
	 * @param mixed $json Raw JSON text.
	 * @return true|WP_Error
	 */
	public static function save_service_account_json( $json ) {
		$json = is_string( $json ) ? trim( $json ) : '';
		if ( $json === '' ) {
			delete_option( self::ACCOUNT_OPTION );
			self::reset_credentials();
			return true;
		}
		$parsed = self::parse_credentials_json( $json );
		if ( is_wp_error( $parsed ) ) {
			return $parsed;
		}
		$data = json_decode( $json, true );
		if ( ! is_array( $data ) || ( isset( $data['type'] ) && 'service_account' !== $data['type'] ) ) {
			return new WP_Error(
				'neo-pulse_gsc_bad_json',
				__( 'That JSON is not a Google service account key.', 'neo-pulse-wp' )
			);
		}
		// Store re-encoded JSON (validated, no stray whitespace); never autoloaded.
		$stored = wp_json_encode( $data );
		if ( ! is_string( $stored ) ) {
			return new WP_Error( 'neo-pulse_gsc_bad_json', __( 'GSC service account JSON is invalid.', 'neo-pulse-wp' ) );
		}
		if ( false === get_option( self::ACCOUNT_OPTION, false ) ) {
			add_option( self::ACCOUNT_OPTION, $stored, '', false );
		} else {
			update_option( self::ACCOUNT_OPTION, $stored, false );
		}
		self::reset_credentials();
		return true;
	}

	/**
	 * Where the active credentials come from: 'constant', 'option', 'file' (NEO_PULSE_WP_GSC_CREDENTIALS_FILE),
	 * 'legacy_file' (includes/credentials/ in the plugin folder) or '' when none.
	 */
	public static function credentials_source(): string {
		self::get_credentials();
		return self::$credentials_source;
	}

	/**
	 * Admin notice while credentials are still read from the old file inside the plugin folder.
	 * Call from an admin screen (manage_options only); prints nothing otherwise.
	 */
	public static function legacy_file_notice(): void {
		if ( ! current_user_can( 'manage_options' ) || 'legacy_file' !== self::credentials_source() ) {
			return;
		}
		printf(
			'<div class="notice notice-warning neo-pulse-wp-gsc-legacy-notice"><p><strong>%1$s</strong> %2$s</p></div>',
			esc_html__( 'Search Console key file found in the plugin folder.', 'neo-pulse-wp' ),
			esc_html__( 'Paste the service account JSON under Neo Pulse → Settings → Search Console (or define NEO_PULSE_WP_GSC_SERVICE_ACCOUNT_JSON in wp-config.php), then delete includes/credentials/gsc-service-account.json from the plugin folder. Files there can be downloaded by anyone and are removed by plugin updates.', 'neo-pulse-wp' )
		);
	}

	/**
	 * Forget resolved credentials and the cached connection test.
	 */
	private static function reset_credentials(): void {
		self::$credentials        = null;
		self::$credentials_source = '';
		delete_transient( self::CONNECTION_TRANSIENT );
	}

	/**
	 * Adjust date range for GSC reporting lag (~3 days).
	 *
	 * @return array{from: string, to: string, note: string}
	 */
	public static function clamp_date_range_for_gsc( string $from, string $to ): array {
		$max_end = gmdate( 'Y-m-d', strtotime( '-3 days' ) );
		$note    = '';

		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $from ) ) {
			$from = gmdate( 'Y-m-d', strtotime( '-30 days' ) );
		}
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $to ) ) {
			$to = $max_end;
		}

		if ( $to > $max_end ) {
			$note = sprintf(
				/* translators: %s: latest GSC date */
				__( 'GSC data ends %s due to Search Console reporting delay.', 'neo-pulse-wp' ),
				$max_end
			);
			$to = $max_end;
		}
		if ( $from > $to ) {
			$from = gmdate( 'Y-m-d', strtotime( $to . ' -27 days' ) );
		}

		return array(
			'from' => $from,
			'to'   => $to,
			'note' => $note,
		);
	}

	/**
	 * Fetch GSC overview stats for a custom date range (Overseer analysis).
	 *
	 * @return array<string,mixed>|WP_Error
	 */
	public static function fetch_stats_for_range( string $from, string $to, int $page_limit = 30 ) {
		$clamped = self::clamp_date_range_for_gsc( $from, $to );
		$start   = $clamped['from'];
		$end     = $clamped['to'];

		$host = wp_parse_url( Neo_Pulse_Wp_Api::get_site_url(), PHP_URL_HOST );
		$host = is_string( $host ) ? strtolower( $host ) : '';
		$key  = 'neo_pulse_wp_gsc_range_' . md5( $host . '|' . $start . '|' . $end . '|' . $page_limit . '|' . NEO_PULSE_WP_VERSION );
		$cached = get_transient( $key );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		$connection = self::test_connection();
		if ( is_wp_error( $connection ) ) {
			return $connection;
		}
		if ( empty( $connection['connected'] ) || empty( $connection['property'] ) ) {
			return new WP_Error(
				'neo-pulse_gsc_property',
				$connection['error'] !== '' ? $connection['error'] : $connection['message'],
				$connection
			);
		}

		$property = (string) $connection['property'];
		$stats    = self::fetch_overview_stats( $property, $start, $end, $page_limit );
		if ( is_wp_error( $stats ) ) {
			return $stats;
		}

		$payload = array_merge(
			$connection,
			$stats,
			array(
				'dateRange' => array(
					'start' => $start,
					'end'   => $end,
					'label' => $start . ' – ' . $end,
					'note'  => $clamped['note'],
				),
				'ok'        => true,
			)
		);

		set_transient( $key, $payload, self::STATS_TTL );
		return $payload;
	}

	/**
	 * Fetch search queries for a specific page URL.
	 *
	 * @return array{queries: array<int,array<string,mixed>>, dateRange: array<string,mixed>, pageUrl: string}|WP_Error
	 */
	public static function fetch_page_queries( string $page_url, string $from = '', string $to = '' ) {
		$range   = self::default_date_range();
		$clamped = self::clamp_date_range_for_gsc(
			$from !== '' ? $from : $range['start'],
			$to !== '' ? $to : $range['end']
		);
		$start   = $clamped['from'];
		$end     = $clamped['to'];

		$path_key = Neo_Pulse_Wp_Overseer::normalize_path_url( $page_url );
		$host     = wp_parse_url( Neo_Pulse_Wp_Api::get_site_url(), PHP_URL_HOST );
		$host     = is_string( $host ) ? strtolower( $host ) : '';
		$key      = 'neo_pulse_wp_gsc_page_' . md5( $host . '|' . $path_key . '|' . $start . '|' . $end . '|' . NEO_PULSE_WP_VERSION );
		$cached   = get_transient( $key );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		$connection = self::test_connection();
		if ( is_wp_error( $connection ) ) {
			return $connection;
		}
		if ( empty( $connection['connected'] ) || empty( $connection['property'] ) ) {
			return new WP_Error(
				'neo-pulse_gsc_property',
				$connection['error'] !== '' ? $connection['error'] : $connection['message'],
				$connection
			);
		}

		$property = (string) $connection['property'];
		$queries  = array();
		foreach ( self::page_filter_urls( $page_url ) as $filter_url ) {
			$result = self::search_analytics_query(
				$property,
				array(
					'startDate'  => $start,
					'endDate'    => $end,
					'dimensions' => array( 'query' ),
					'rowLimit'   => 25,
					'dimensionFilterGroups' => array(
						array(
							'filters' => array(
								array(
									'dimension'  => 'page',
									'operator'   => 'equals',
									'expression' => $filter_url,
								),
							),
						),
					),
				)
			);
			if ( is_wp_error( $result ) ) {
				continue;
			}
			if ( empty( $result['rows'] ) || ! is_array( $result['rows'] ) ) {
				continue;
			}
			foreach ( $result['rows'] as $row ) {
				if ( ! is_array( $row ) || empty( $row['keys'][0] ) ) {
					continue;
				}
				$queries[] = array(
					'query'       => (string) $row['keys'][0],
					'clicks'      => isset( $row['clicks'] ) ? (int) $row['clicks'] : 0,
					'impressions' => isset( $row['impressions'] ) ? (int) $row['impressions'] : 0,
					'position'    => isset( $row['position'] ) ? round( (float) $row['position'], 1 ) : 0.0,
				);
			}
			if ( ! empty( $queries ) ) {
				break;
			}
		}

		usort(
			$queries,
			static function ( $a, $b ) {
				return ( $b['clicks'] ?? 0 ) <=> ( $a['clicks'] ?? 0 );
			}
		);

		$payload = array(
			'queries'   => $queries,
			'pageUrl'   => esc_url_raw( $page_url ),
			'dateRange' => array(
				'start' => $start,
				'end'   => $end,
				'note'  => $clamped['note'],
			),
		);

		set_transient( $key, $payload, self::STATS_TTL );
		return $payload;
	}

	/**
	 * @return array<int,string>
	 */
	private static function page_filter_urls( string $page_url ): array {
		$page_url = trim( $page_url );
		if ( $page_url === '' ) {
			return array();
		}

		$site = rtrim( Neo_Pulse_Wp_Api::get_site_url(), '/' );
		if ( 0 !== strpos( $page_url, 'http://' ) && 0 !== strpos( $page_url, 'https://' ) ) {
			$page_url = $site . '/' . ltrim( $page_url, '/' );
		}

		$with    = substr( $page_url, -1 ) === '/' ? $page_url : $page_url . '/';
		$without = rtrim( $page_url, '/' );
		$urls    = array( $with );
		if ( $without !== $with ) {
			$urls[] = $without;
		}

		return array_values( array_unique( $urls ) );
	}

	/**
	 * Check the service account against Google. Cached for an hour (errors for 10 minutes);
	 * pass true, or flush_stats_cache(), to ask Google again.
	 *
	 * @param bool $force Skip the cache.
	 * @return array{connected:bool,clientEmail:string,property:?string,accessibleCount:int,message:string,error:string}|WP_Error
	 */
	public static function test_connection( $force = false ) {
		$mode = self::mode();
		if ( '' === $mode ) {
			return self::not_set_up_error();
		}

		$site_url = Neo_Pulse_Wp_Api::get_site_url();
		if ( 'own' === $mode ) {
			$creds = self::get_credentials();
			$who   = $creds['client_email'];
		} else {
			$who = 'agency:' . md5( Neo_Pulse_Wp_License::site_key() );
		}
		$cache_sig = md5( $who . '|' . $site_url );
		if ( ! $force ) {
			$cached = get_transient( self::CONNECTION_TRANSIENT );
			if ( is_array( $cached ) && isset( $cached['sig'], $cached['result'] ) && $cached['sig'] === $cache_sig ) {
				$result = $cached['result'];
				if ( is_array( $result ) && ! empty( $result['__error'] ) ) {
					return new WP_Error(
						isset( $result['code'] ) ? (string) $result['code'] : 'neo-pulse_gsc_error',
						isset( $result['message'] ) ? (string) $result['message'] : '',
						isset( $result['data'] ) ? $result['data'] : null
					);
				}
				if ( is_array( $result ) ) {
					return $result;
				}
			}
		}

		$client_email = self::EMAIL_FALLBACK;
		$domain       = '';
		if ( 'own' === $mode ) {
			$sites        = self::list_sites();
			$client_email = $creds['client_email'];
		} else {
			$relay = self::relay( 'sites', array( 'fresh' => (bool) $force ) );
			if ( is_wp_error( $relay ) ) {
				$sites = $relay;
			} else {
				$sites        = isset( $relay['properties'] ) && is_array( $relay['properties'] ) ? $relay['properties'] : array();
				$client_email = ! empty( $relay['clientEmail'] ) ? sanitize_email( (string) $relay['clientEmail'] ) : $client_email;
				$domain       = isset( $relay['domain'] ) ? sanitize_text_field( (string) $relay['domain'] ) : '';
			}
		}

		if ( is_wp_error( $sites ) ) {
			$data = $sites->get_error_data();
			$data = is_array( $data ) ? $data : array();
			$data['clientEmail'] = $client_email;
			$error = new WP_Error( $sites->get_error_code(), $sites->get_error_message(), $data );
			set_transient(
				self::CONNECTION_TRANSIENT,
				array(
					'sig'    => $cache_sig,
					'result' => array(
						'__error' => true,
						'code'    => $error->get_error_code(),
						'message' => $error->get_error_message(),
						'data'    => $data,
					),
				),
				self::CONNECTION_ERROR_TTL
			);
			return $error;
		}

		if ( 'agency' === $mode ) {
			// The relay only lists this key's own domain, so any of them is right; the domain
			// property is preferred as it covers www and non-www. Also works on staging, whose
			// address is not the live domain.
			$match = array(
				'property' => self::preferred_property( $sites ),
				'error'    => '',
			);
		} else {
			$match = self::resolve_property( $site_url, $sites );
		}

		if ( null !== $match['property'] ) {
			$message = 'agency' === $mode
				? __( 'Connected to Google Search Console through Neo Digital.', 'neo-pulse-wp' )
				: __( 'Connected to Google Search Console.', 'neo-pulse-wp' );
			$error   = '';
		} elseif ( 'agency' === $mode ) {
			$message = '';
			$error   = sprintf(
				/* translators: 1: domain, 2: service account email */
				__( 'Neo Digital cannot see a Search Console property for %1$s yet. Add %2$s as a user on that property in Search Console; it can take a few minutes to show up.', 'neo-pulse-wp' ),
				'' !== $domain ? $domain : self::requested_domain( $site_url ),
				$client_email
			);
		} else {
			$message = __( 'Service account is valid but no matching GSC property was found for this site.', 'neo-pulse-wp' );
			$error   = $match['error'];
		}

		$result = array(
			'connected'       => null !== $match['property'],
			'clientEmail'     => $client_email,
			'property'        => $match['property'],
			'accessibleCount' => count( $sites ),
			'mode'            => $mode,
			'message'         => $message,
			'error'           => $error,
		);
		set_transient(
			self::CONNECTION_TRANSIENT,
			array(
				'sig'    => $cache_sig,
				'result' => $result,
			),
			$result['connected'] ? self::CONNECTION_TTL : self::CONNECTION_ERROR_TTL
		);
		return $result;
	}

	/**
	 * Neither a key on this site nor a site key for the Neo Digital relay.
	 */
	private static function not_set_up_error(): WP_Error {
		return new WP_Error(
			'neo-pulse_gsc_missing',
			__( 'Search Console is not set up for this site yet.', 'neo-pulse-wp' ),
			array(
				'clientEmail' => self::EMAIL_FALLBACK,
				'hint'        => sprintf(
					/* translators: %s: service account email */
					__( 'Enter the Neo Digital site key under Settings → Licence, then add %s as a user on this site\'s property in Search Console (Settings → Users and permissions, Restricted is enough).', 'neo-pulse-wp' ),
					self::EMAIL_FALLBACK
				),
			)
		);
	}

	/**
	 * Domain property first, then https, then whatever is left.
	 *
	 * @param array<int,array<string,mixed>> $sites
	 */
	private static function preferred_property( array $sites ): ?string {
		$urls = array();
		foreach ( $sites as $site ) {
			if ( ! empty( $site['siteUrl'] ) ) {
				$urls[] = (string) $site['siteUrl'];
			}
		}
		foreach ( array( 'sc-domain:', 'https://', '' ) as $prefix ) {
			foreach ( $urls as $url ) {
				if ( '' === $prefix || 0 === strpos( $url, $prefix ) ) {
					return $url;
				}
			}
		}
		return null;
	}

	/**
	 * Ask Neo Digital's update server (Search Console relay) with this site's key.
	 *
	 * @param string              $endpoint 'sites' or 'query'.
	 * @param array<string,mixed> $body     JSON body.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function relay( string $endpoint, array $body ) {
		$key = class_exists( 'Neo_Pulse_Wp_License', false ) ? Neo_Pulse_Wp_License::site_key() : '';
		if ( '' === $key ) {
			return self::not_set_up_error();
		}
		$response = wp_remote_post(
			Neo_Pulse_Wp_License::server_url() . '/gsc/' . $endpoint,
			array(
				'timeout' => 'query' === $endpoint ? 60 : 30,
				'headers' => array(
					'Content-Type'   => 'application/json',
					'Accept'         => 'application/json',
					'X-Neo-Site-Key' => $key,
				),
				'body'    => wp_json_encode( $body ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'neo-pulse_gsc_relay', __( 'The Neo Digital server could not be reached for Search Console data. Try again in a few minutes.', 'neo-pulse-wp' ) );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $data ) ) {
			$server_code = is_array( $data ) && ! empty( $data['code'] ) ? sanitize_key( (string) $data['code'] ) : 'http_' . $code;
			$message     = is_array( $data ) && ! empty( $data['message'] ) ? sanitize_text_field( (string) $data['message'] ) : sprintf( 'HTTP %d', $code );
			return new WP_Error( 'neo-pulse_gsc_' . $server_code, $message );
		}
		return $data;
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	public static function fetch_analytics_overview() {
		$range = self::default_date_range();
		$host  = wp_parse_url( Neo_Pulse_Wp_Api::get_site_url(), PHP_URL_HOST );
		$host  = is_string( $host ) ? strtolower( $host ) : '';
		$key   = 'neo_pulse_wp_gsc_stats_' . md5( $host . '|' . $range['start'] . '|' . $range['end'] . '|' . NEO_PULSE_WP_VERSION );
		$cached = get_transient( $key );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		$connection = self::test_connection();
		if ( is_wp_error( $connection ) ) {
			return $connection;
		}
		if ( empty( $connection['connected'] ) || empty( $connection['property'] ) ) {
			return new WP_Error(
				'neo-pulse_gsc_property',
				$connection['error'] !== '' ? $connection['error'] : $connection['message'],
				$connection
			);
		}

		$property = (string) $connection['property'];
		$stats    = self::fetch_overview_stats( $property, $range['start'], $range['end'] );
		if ( is_wp_error( $stats ) ) {
			return $stats;
		}

		$payload = array_merge(
			$connection,
			$stats,
			array(
				'dateRange' => $range,
				'ok'        => true,
			)
		);

		set_transient( $key, $payload, self::STATS_TTL );
		return $payload;
	}

	/**
	 * Flush cached GSC data: overview stats, custom-range stats, per-page queries and the
	 * cached connection test.
	 */
	public static function flush_stats_cache(): void {
		delete_transient( self::CONNECTION_TRANSIENT );

		global $wpdb;
		if ( ! isset( $wpdb ) ) {
			return;
		}

		$prefixes = array( 'neo_pulse_wp_gsc_stats_', 'neo_pulse_wp_gsc_range_', 'neo_pulse_wp_gsc_page_', 'neo_pulse_wp_gsc_ins_' );
		$where    = array();
		$args     = array();
		foreach ( $prefixes as $prefix ) {
			$where[] = 'option_name LIKE %s';
			$args[]  = $wpdb->esc_like( '_transient_' . $prefix ) . '%';
			$where[] = 'option_name LIKE %s';
			$args[]  = $wpdb->esc_like( '_transient_timeout_' . $prefix ) . '%';
		}
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- placeholders only.
		$sql  = "SELECT option_name FROM {$wpdb->options} WHERE " . implode( ' OR ', $where );
		$rows = $wpdb->get_col( $wpdb->prepare( $sql, $args ) ); // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		if ( ! is_array( $rows ) ) {
			return;
		}

		foreach ( $rows as $option_name ) {
			$name = (string) $option_name;
			if ( 0 === strpos( $name, '_transient_timeout_' ) ) {
				delete_option( $name );
				continue;
			}
			if ( 0 === strpos( $name, '_transient_' ) ) {
				delete_transient( substr( $name, strlen( '_transient_' ) ) );
			}
		}
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	public static function fetch_overview_stats( string $property, string $start, string $end, int $page_limit = 10 ) {
		$page_limit = max( 1, min( 50, $page_limit ) );
		$totals = self::search_analytics_query(
			$property,
			array(
				'startDate' => $start,
				'endDate'   => $end,
			)
		);
		if ( is_wp_error( $totals ) ) {
			return $totals;
		}

		$summary = array(
			'clicks'      => 0,
			'impressions' => 0,
			'ctr'         => 0.0,
			'avgPosition' => 0.0,
		);
		if ( ! empty( $totals['rows'][0] ) && is_array( $totals['rows'][0] ) ) {
			$row                 = $totals['rows'][0];
			$summary['clicks']      = isset( $row['clicks'] ) ? (int) $row['clicks'] : 0;
			$summary['impressions'] = isset( $row['impressions'] ) ? (int) $row['impressions'] : 0;
			$summary['ctr']         = isset( $row['ctr'] ) ? (float) $row['ctr'] : 0.0;
			$summary['avgPosition'] = isset( $row['position'] ) ? round( (float) $row['position'], 1 ) : 0.0;
		}

		$queries = self::search_analytics_query(
			$property,
			array(
				'startDate'  => $start,
				'endDate'    => $end,
				'dimensions' => array( 'query' ),
				'rowLimit'   => 25,
			)
		);
		if ( is_wp_error( $queries ) ) {
			return $queries;
		}

		$query_rows = array();
		if ( ! empty( $queries['rows'] ) && is_array( $queries['rows'] ) ) {
			foreach ( $queries['rows'] as $row ) {
				if ( ! is_array( $row ) || empty( $row['keys'][0] ) ) {
					continue;
				}
				$query_rows[] = array(
					'query'       => (string) $row['keys'][0],
					'clicks'      => isset( $row['clicks'] ) ? (int) $row['clicks'] : 0,
					'impressions' => isset( $row['impressions'] ) ? (int) $row['impressions'] : 0,
					'position'    => isset( $row['position'] ) ? round( (float) $row['position'], 1 ) : 0.0,
				);
			}
			usort(
				$query_rows,
				static function ( $a, $b ) {
					return $b['clicks'] <=> $a['clicks'];
				}
			);
		}

		$pages = self::search_analytics_query(
			$property,
			array(
				'startDate'  => $start,
				'endDate'    => $end,
				'dimensions' => array( 'page' ),
				'rowLimit'   => $page_limit,
			)
		);
		if ( is_wp_error( $pages ) ) {
			return $pages;
		}

		$page_rows = array();
		if ( ! empty( $pages['rows'] ) && is_array( $pages['rows'] ) ) {
			foreach ( $pages['rows'] as $row ) {
				if ( ! is_array( $row ) || empty( $row['keys'][0] ) ) {
					continue;
				}
				$page_rows[] = array(
					'page'        => (string) $row['keys'][0],
					'clicks'      => isset( $row['clicks'] ) ? (int) $row['clicks'] : 0,
					'impressions' => isset( $row['impressions'] ) ? (int) $row['impressions'] : 0,
					'position'    => isset( $row['position'] ) ? round( (float) $row['position'], 1 ) : 0.0,
				);
			}
			usort(
				$page_rows,
				static function ( $a, $b ) {
					return $b['clicks'] <=> $a['clicks'];
				}
			);
		}

		return array(
			'summary'        => $summary,
			'keywordCount'   => count( $query_rows ),
			'topQueries'     => $query_rows,
			'topPages'       => $page_rows,
		);
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	private static function get_credentials() {
		if ( null !== self::$credentials ) {
			return self::$credentials;
		}

		// Order: wp-config constant → Settings (option) → explicit file path constant →
		// legacy file in the plugin folder (last resort only; see legacy_file_notice()).
		$sources = array(
			'constant'    => self::read_json_constant( 'NEO_PULSE_WP_GSC_SERVICE_ACCOUNT_JSON' ),
			'option'      => self::read_json_option(),
			'file'        => self::read_json_file( self::configured_file_path() ),
			'legacy_file' => self::read_json_file( self::legacy_file_path() ),
		);

		foreach ( $sources as $source => $raw ) {
			if ( $raw === null || $raw === '' ) {
				continue;
			}
			$parsed = self::parse_credentials_json( $raw );
			if ( ! is_wp_error( $parsed ) ) {
				self::$credentials        = $parsed;
				self::$credentials_source = $source;
				return self::$credentials;
			}
		}

		self::$credentials_source = '';
		self::$credentials        = new WP_Error(
			'neo-pulse_gsc_missing',
			__( 'GSC service account JSON is not configured for this plugin.', 'neo-pulse-wp' ),
			array(
				'clientEmail' => self::EMAIL_FALLBACK,
				'hint'        => sprintf(
					/* translators: %s: service account email */
					__( 'No service account key on this site. In Google Search Console, add %s under Settings → Users and permissions.', 'neo-pulse-wp' ),
					self::EMAIL_FALLBACK
				),
			)
		);
		return self::$credentials;
	}

	/**
	 * File named by NEO_PULSE_WP_GSC_CREDENTIALS_FILE (keep it outside the web root), or ''.
	 */
	private static function configured_file_path(): string {
		if ( defined( 'NEO_PULSE_WP_GSC_CREDENTIALS_FILE' ) && is_string( NEO_PULSE_WP_GSC_CREDENTIALS_FILE ) && NEO_PULSE_WP_GSC_CREDENTIALS_FILE !== '' ) {
			return (string) NEO_PULSE_WP_GSC_CREDENTIALS_FILE;
		}
		return '';
	}

	/**
	 * Old default location inside the plugin folder (web-readable; read only as a fallback).
	 */
	private static function legacy_file_path(): string {
		return NEO_PULSE_WP_PLUGIN_DIR . 'includes/credentials/gsc-service-account.json';
	}

	private static function read_json_option(): ?string {
		$value = get_option( self::ACCOUNT_OPTION, '' );
		if ( is_array( $value ) ) {
			$value = wp_json_encode( $value );
		}
		return is_string( $value ) && trim( $value ) !== '' ? trim( $value ) : null;
	}

	private static function read_json_constant( string $name ): ?string {
		if ( defined( $name ) ) {
			$value = constant( $name );
			if ( is_string( $value ) && trim( $value ) !== '' ) {
				return trim( $value );
			}
		}
		return null;
	}

	private static function read_json_file( string $path ): ?string {
		if ( $path === '' || ! is_readable( $path ) ) {
			return null;
		}
		$raw = file_get_contents( $path );
		return is_string( $raw ) && trim( $raw ) !== '' ? trim( $raw ) : null;
	}

	/**
	 * @return array<string,string>|WP_Error
	 */
	private static function parse_credentials_json( string $raw ) {
		$raw  = trim( $raw );
		$data = json_decode( $raw, true );
		if ( ! is_array( $data ) ) {
			return new WP_Error(
				'neo-pulse_gsc_bad_json',
				__( 'GSC service account JSON is invalid.', 'neo-pulse-wp' )
			);
		}

		$email = isset( $data['client_email'] ) ? trim( (string) $data['client_email'] ) : '';
		$key   = isset( $data['private_key'] ) ? (string) $data['private_key'] : '';
		$key   = str_replace( '\\n', "\n", $key );

		if ( $email === '' || $key === '' ) {
			return new WP_Error(
				'neo-pulse_gsc_incomplete',
				__( 'GSC service account JSON must include client_email and private_key.', 'neo-pulse-wp' )
			);
		}

		return array(
			'client_email' => $email,
			'private_key'  => $key,
			'project_id'   => isset( $data['project_id'] ) ? (string) $data['project_id'] : '',
		);
	}

	/**
	 * @return string|WP_Error
	 */
	private static function get_access_token() {
		$creds = self::get_credentials();
		if ( is_wp_error( $creds ) ) {
			return $creds;
		}

		$cache_key = 'neo_pulse_wp_gsc_token_' . md5( $creds['client_email'] . '|' . NEO_PULSE_WP_VERSION );
		$cached    = get_transient( $cache_key );
		if ( is_string( $cached ) && $cached !== '' ) {
			return $cached;
		}

		$jwt = self::build_jwt( $creds['client_email'], $creds['private_key'] );
		if ( is_wp_error( $jwt ) ) {
			return $jwt;
		}

		$response = wp_remote_post(
			self::TOKEN_URL,
			array(
				'timeout' => 30,
				'headers' => array(
					'Content-Type' => 'application/x-www-form-urlencoded',
				),
				'body'    => array(
					'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
					'assertion'  => $jwt,
				),
			)
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
				: ( $raw !== '' ? $raw : sprintf( 'HTTP %d', $code ) );
			return new WP_Error( 'neo-pulse_gsc_token', $msg );
		}

		$token = (string) $data['access_token'];
		set_transient( $cache_key, $token, self::TOKEN_TTL );
		return $token;
	}

	/**
	 * @return string|WP_Error
	 */
	private static function build_jwt( string $client_email, string $private_key ) {
		$now = time();
		$header = self::base64url_encode(
			wp_json_encode(
				array(
					'alg' => 'RS256',
					'typ' => 'JWT',
				)
			)
		);
		$claim = self::base64url_encode(
			wp_json_encode(
				array(
					'iss'   => $client_email,
					'scope' => self::SCOPE,
					'aud'   => self::TOKEN_URL,
					'exp'   => $now + 3600,
					'iat'   => $now,
				)
			)
		);

		$input = $header . '.' . $claim;
		$key   = openssl_pkey_get_private( $private_key );
		if ( false === $key ) {
			return new WP_Error(
				'neo-pulse_gsc_key',
				__( 'Could not read GSC service account private key.', 'neo-pulse-wp' )
			);
		}

		$signature = '';
		$signed    = openssl_sign( $input, $signature, $key, OPENSSL_ALGO_SHA256 );
		if ( PHP_VERSION_ID < 80000 && function_exists( 'openssl_free_key' ) ) { // Deprecated (and unnecessary) on PHP 8+.
			openssl_free_key( $key );
		}
		if ( ! $signed ) {
			return new WP_Error(
				'neo-pulse_gsc_sign',
				__( 'Could not sign GSC JWT.', 'neo-pulse-wp' )
			);
		}

		return $input . '.' . self::base64url_encode( $signature );
	}

	/**
	 * @return array<int,array<string,mixed>>|WP_Error
	 */
	private static function list_sites() {
		$token = self::get_access_token();
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$response = wp_remote_get(
			self::WEBMASTERS . '/sites',
			array(
				'timeout' => 45,
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
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
			$msg = is_array( $data ) && ! empty( $data['error']['message'] )
				? (string) $data['error']['message']
				: ( $raw !== '' ? $raw : sprintf( 'HTTP %d', $code ) );
			return new WP_Error( 'neo-pulse_gsc_sites', $msg );
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

	/**
	 * @param array<int,array<string,mixed>> $sites
	 * @return array{property:?string,error:string,requestedDomain:string}
	 */
	private static function resolve_property( string $site_url, array $sites ): array {
		$requested = self::requested_domain( $site_url );
		if ( $requested === '' ) {
			return array(
				'property'        => null,
				'error'           => __( 'Could not determine site hostname.', 'neo-pulse-wp' ),
				'requestedDomain' => '',
			);
		}

		foreach ( $sites as $site ) {
			$raw = isset( $site['siteUrl'] ) ? (string) $site['siteUrl'] : '';
			if ( $raw === '' ) {
				continue;
			}
			$property_domain = self::property_domain( $raw );
			if ( $property_domain !== '' && $property_domain === $requested ) {
				return array(
					'property'        => $raw,
					'error'           => '',
					'requestedDomain' => $requested,
				);
			}
		}

		$candidates = self::generate_property_candidates( $site_url );
		foreach ( $candidates as $candidate ) {
			foreach ( $sites as $site ) {
				if ( isset( $site['siteUrl'] ) && (string) $site['siteUrl'] === $candidate ) {
					return array(
						'property'        => $candidate,
						'error'           => '',
						'requestedDomain' => $requested,
					);
				}
			}
		}

		return array(
			'property'        => null,
			'error'           => sprintf(
				/* translators: 1: domain, 2: number of accessible properties */
				__( 'No GSC property matches %1$s. The service account can access %2$d properties.', 'neo-pulse-wp' ),
				$requested,
				count( $sites )
			),
			'requestedDomain' => $requested,
		);
	}

	private static function requested_domain( string $site_url ): string {
		$host = wp_parse_url( trim( $site_url ), PHP_URL_HOST );
		if ( ! is_string( $host ) || $host === '' ) {
			$host = preg_replace( '#^https?://#i', '', trim( $site_url ) );
			$host = is_string( $host ) ? explode( '/', $host )[0] : '';
		}
		$host = strtolower( trim( (string) $host ) );
		if ( 0 === strpos( $host, 'www.' ) ) {
			$host = substr( $host, 4 );
		}
		return $host;
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
		if ( 0 === strpos( $domain, 'www.' ) ) {
			$domain = substr( $domain, 4 );
		}
		return $domain;
	}

	/**
	 * @return array<int,string>
	 */
	private static function generate_property_candidates( string $site_url ): array {
		$url = trim( $site_url );
		if ( $url === '' ) {
			return array();
		}
		if ( ! preg_match( '#^https?://#i', $url ) ) {
			$url = 'https://' . $url;
		}

		$candidates = array();
		$with_slash = substr( $url, -1 ) === '/' ? $url : $url . '/';
		$no_slash   = substr( $url, -1 ) === '/' ? rtrim( $url, '/' ) : $url;
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
	 * Property of the current connection, or a WP_Error explaining why there is none.
	 *
	 * @return array<string,mixed>|WP_Error Connection (with 'property').
	 */
	public static function connected(): array|WP_Error {
		$connection = self::test_connection();
		if ( is_wp_error( $connection ) ) {
			return $connection;
		}
		if ( empty( $connection['connected'] ) || empty( $connection['property'] ) ) {
			return new WP_Error(
				'neo-pulse_gsc_property',
				'' !== (string) $connection['error'] ? (string) $connection['error'] : (string) $connection['message'],
				$connection
			);
		}
		return $connection;
	}

	/**
	 * Several search analytics queries for one property, sent in parallel where possible.
	 *
	 * @param array<string,array<string,mixed>> $bodies Request bodies keyed by name.
	 * @return array<string,array<string,mixed>|WP_Error> Results keyed like $bodies.
	 */
	public static function query_batch( string $property, array $bodies ): array {
		$results = array();
		if ( count( $bodies ) > 1 && class_exists( '\WpOrg\Requests\Requests' ) && apply_filters( 'neo_pulse_wp_gsc_parallel', true ) ) {
			$requests = self::batch_requests( $property, $bodies );
			if ( is_array( $requests ) ) {
				try {
					$responses = \WpOrg\Requests\Requests::request_multiple(
						$requests,
						array(
							'timeout'         => 60,
							'connect_timeout' => 10,
							'verify'          => ABSPATH . WPINC . '/certificates/ca-bundle.crt',
						)
					);
				} catch ( \Throwable $e ) {
					$responses = array();
				}
				foreach ( $bodies as $name => $body ) {
					$response = $responses[ $name ] ?? null;
					if ( $response instanceof \WpOrg\Requests\Response ) {
						$parsed = self::parse_query_response( (int) $response->status_code, (string) $response->body, 'agency' === self::mode() );
						// Network or server hiccup: one more try the ordinary way.
						$results[ $name ] = is_wp_error( $parsed ) && $response->status_code >= 500
							? self::search_analytics_query( $property, $body )
							: $parsed;
					} else {
						$results[ $name ] = self::search_analytics_query( $property, $body );
					}
				}
				return $results;
			}
		}
		foreach ( $bodies as $name => $body ) {
			$results[ $name ] = self::search_analytics_query( $property, $body );
		}
		return $results;
	}

	/**
	 * Requests::request_multiple() descriptors for query_batch(), or null to go one by one.
	 *
	 * @param array<string,array<string,mixed>> $bodies
	 * @return array<string,array<string,mixed>>|null
	 */
	private static function batch_requests( string $property, array $bodies ): ?array {
		if ( 'agency' === self::mode() ) {
			$url     = Neo_Pulse_Wp_License::server_url() . '/gsc/query';
			$headers = array(
				'Content-Type'   => 'application/json',
				'Accept'         => 'application/json',
				'X-Neo-Site-Key' => Neo_Pulse_Wp_License::site_key(),
			);
		} else {
			$token = self::get_access_token();
			if ( is_wp_error( $token ) ) {
				return null;
			}
			$url     = self::WEBMASTERS . '/sites/' . rawurlencode( $property ) . '/searchAnalytics/query';
			$headers = array(
				'Authorization' => 'Bearer ' . $token,
				'Content-Type'  => 'application/json',
				'Accept'        => 'application/json',
			);
		}
		$requests = array();
		foreach ( $bodies as $name => $body ) {
			$payload           = 'agency' === self::mode() ? array( 'property' => $property, 'request' => $body ) : $body;
			$requests[ $name ] = array(
				'url'     => $url,
				'type'    => 'POST',
				'headers' => $headers,
				'data'    => wp_json_encode( $payload ),
			);
		}
		return $requests;
	}

	/**
	 * Decode a search analytics answer (from Google, or from the relay with its {code,message} errors).
	 *
	 * @return array<string,mixed>|WP_Error
	 */
	private static function parse_query_response( int $code, string $raw, bool $from_relay ) {
		$data = json_decode( $raw, true );
		if ( $code >= 200 && $code < 300 && is_array( $data ) ) {
			return $data;
		}
		if ( $from_relay ) {
			$server_code = is_array( $data ) && ! empty( $data['code'] ) ? sanitize_key( (string) $data['code'] ) : 'http_' . $code;
			$message     = is_array( $data ) && ! empty( $data['message'] ) ? sanitize_text_field( (string) $data['message'] ) : sprintf( 'HTTP %d', $code );
			return new WP_Error( 'neo-pulse_gsc_' . $server_code, $message );
		}
		$message = is_array( $data ) && ! empty( $data['error']['message'] ) ? (string) $data['error']['message'] : sprintf( 'HTTP %d', $code );
		return new WP_Error( 'neo-pulse_gsc_query', $message );
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|WP_Error
	 */
	private static function search_analytics_query( string $property, array $body ) {
		if ( 'agency' === self::mode() ) {
			return self::relay(
				'query',
				array(
					'property' => $property,
					'request'  => $body,
				)
			);
		}

		$token = self::get_access_token();
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$url = self::WEBMASTERS . '/sites/' . rawurlencode( $property ) . '/searchAnalytics/query';
		$response = wp_remote_post(
			$url,
			array(
				'timeout' => 60,
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
					'Accept'        => 'application/json',
				),
				'body'    => wp_json_encode( $body ),
			)
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
				: ( $raw !== '' ? $raw : sprintf( 'HTTP %d', $code ) );
			return new WP_Error( 'neo-pulse_gsc_query', $msg );
		}

		return is_array( $data ) ? $data : array();
	}

	private static function base64url_encode( string $data ): string {
		return rtrim( strtr( base64_encode( $data ), '+/', '-_' ), '=' );
	}
}
