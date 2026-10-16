<?php
/**
 * Semrush Analytics API for SEO research briefs.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Semrush {

	const API_BASE = 'https://api.semrush.com/';

	const DISPLAY_LIMIT = 50;

	/**
	 * Full bulk enrichment for SeoContentBriefV1 merge (mirrors neo-pulse-app bulk enrichment).
	 *
	 * @param array<string,mixed> $opts pageUrl, seedKeyword, database, portfolioBlockedHosts
	 * @return array<string,mixed>
	 */
	public static function fetch_bulk_enrichment( array $opts ): array {
		$page_url = isset( $opts['pageUrl'] ) ? (string) $opts['pageUrl'] : '';
		$seed     = isset( $opts['seedKeyword'] ) ? (string) $opts['seedKeyword'] : '';
		$database = ! empty( $opts['database'] ) ? (string) $opts['database'] : 'us';
		$blocked  = self::sanitize_blocked_hosts( $opts['portfolioBlockedHosts'] ?? null );

		$empty = array(
			'skipped'               => false,
			'urlOrganicKeywords'    => array(),
			'phraseRelatedKeywords' => array(),
			'urlOrganicUrls'        => array(),
			'phraseRelatedUrls'     => array(),
			'phraseOrganicUrls'     => array(),
			'externalSemrushUrls'   => array(),
			'keywordOverview'       => null,
			'errors'                => array(),
		);

		$key = Neo_Pulse_Wp_Research_Keys::semrush_api_key();
		if ( $key === '' ) {
			$empty['skipped'] = true;
			$empty['reason']  = 'no_api_key';
			$empty['errors'][] = 'semrush_not_configured';
			return $empty;
		}

		$url = self::normalize_url( $page_url );
		if ( $url === '' ) {
			$empty['errors'][] = 'invalid_page_url';
			return $empty;
		}

		$errors = array();

		$url_organic = self::request_report(
			$key,
			array(
				'type'           => 'url_organic',
				'database'       => $database,
				'url'            => $url,
				'display_limit'  => self::DISPLAY_LIMIT,
				'export_columns' => 'Ph,Ur',
			)
		);
		if ( is_wp_error( $url_organic ) ) {
			$errors[] = 'url_organic:' . $url_organic->get_error_message();
		}

		$url_organic_keywords = is_string( $url_organic ) ? self::keywords_from_csv( $url_organic ) : array();
		$url_organic_urls     = is_string( $url_organic ) ? self::urls_from_csv( $url_organic ) : array();

		$phrase_related_keywords = array();
		$phrase_related_urls     = array();
		$phrase_organic_urls     = array();
		$keyword_overview        = null;

		$phrase = trim( $seed );
		if ( $phrase !== '' ) {
			$phrase_params = array(
				'database'       => $database,
				'phrase'         => $phrase,
				'display_limit'  => self::DISPLAY_LIMIT,
				'export_columns' => 'Ph,Ur',
			);

			$phrase_related = self::request_report(
				$key,
				array_merge( $phrase_params, array( 'type' => 'phrase_related' ) )
			);
			if ( is_wp_error( $phrase_related ) ) {
				$errors[] = 'phrase_related:' . $phrase_related->get_error_message();
			} else {
				$phrase_related_keywords = self::keywords_from_csv( $phrase_related );
				$phrase_related_urls     = self::urls_from_csv( $phrase_related );
			}

			$phrase_organic = self::request_report(
				$key,
				array_merge( $phrase_params, array( 'type' => 'phrase_organic' ) )
			);
			if ( is_wp_error( $phrase_organic ) ) {
				$errors[] = 'phrase_organic:' . $phrase_organic->get_error_message();
			} else {
				$phrase_organic_urls = self::urls_from_csv( $phrase_organic );
			}

			$phrase_this_params = array(
				'type'     => 'phrase_this',
				'database' => $database,
				'phrase'   => $phrase,
			);
			$phrase_this        = self::request_report( $key, $phrase_this_params );
			if ( is_wp_error( $phrase_this ) ) {
				$errors[] = 'phrase_this:' . $phrase_this->get_error_message();
			}

			$phrase_kdi = self::request_report(
				$key,
				array_merge( $phrase_this_params, array( 'type' => 'phrase_kdi' ) )
			);
			if ( is_wp_error( $phrase_kdi ) ) {
				$errors[] = 'phrase_kdi:' . $phrase_kdi->get_error_message();
			}

			if ( ! is_wp_error( $phrase_this ) || ! is_wp_error( $phrase_kdi ) ) {
				$keyword_overview = array(
					'phraseThis' => is_wp_error( $phrase_this ) ? null : $phrase_this,
					'phraseKdi'  => is_wp_error( $phrase_kdi ) ? null : $phrase_kdi,
				);
			}
		}

		$filtered = self::filter_reference_urls(
			$url_organic_urls,
			$phrase_related_urls,
			$phrase_organic_urls,
			$page_url,
			$blocked
		);

		return array(
			'skipped'               => false,
			'urlOrganicKeywords'    => $url_organic_keywords,
			'phraseRelatedKeywords' => $phrase_related_keywords,
			'urlOrganicUrls'        => $filtered['urlOrganicUrls'],
			'phraseRelatedUrls'     => $filtered['phraseRelatedUrls'],
			'phraseOrganicUrls'     => $filtered['phraseOrganicUrls'],
			'externalSemrushUrls'   => $filtered['externalSemrushUrls'],
			'keywordOverview'       => $keyword_overview,
			'errors'                => $errors,
		);
	}

	/**
	 * Phrase-related keywords for an outline seed. Empty when the key or report is missing.
	 *
	 * @return array<int, string>
	 */
	public static function fetch_related_keywords( string $phrase, string $database = 'ca' ): array {
		$phrase = trim( $phrase );
		if ( $phrase === '' ) {
			return array();
		}

		$key = Neo_Pulse_Wp_Research_Keys::semrush_api_key();
		if ( $key === '' ) {
			return array();
		}

		$csv = self::request_report(
			$key,
			array(
				'type'           => 'phrase_related',
				'database'       => $database !== '' ? $database : 'ca',
				'phrase'         => $phrase,
				'display_limit'  => self::DISPLAY_LIMIT,
				'export_columns' => 'Ph',
			)
		);
		if ( is_wp_error( $csv ) || ! is_string( $csv ) ) {
			return array();
		}

		return self::keywords_from_csv( $csv );
	}

	/**
	 * @param array<string,string|int> $params
	 * @return string|WP_Error
	 */
	private static function request_report( string $api_key, array $params ) {
		$params['key'] = $api_key;
		$url           = add_query_arg( $params, self::API_BASE );

		$response = wp_remote_get(
			$url,
			array(
				'timeout' => 60,
				'headers' => array(
					'Accept' => 'text/plain, */*',
				),
			)
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
	 * @return array<int,string>
	 */
	private static function keywords_from_csv( string $csv ): array {
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
	private static function urls_from_csv( string $csv ): array {
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

		$out   = array();
		$seen  = array();
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

	private static function normalize_url( string $page_url ): string {
		$s = trim( $page_url );
		if ( $s === '' ) {
			return '';
		}
		if ( ! preg_match( '#^https?://#i', $s ) ) {
			$s = 'https://' . ltrim( $s, '/' );
		}
		return $s;
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
	 * @param mixed $raw
	 * @return string[]|null
	 */
	private static function sanitize_blocked_hosts( $raw ): ?array {
		if ( ! is_array( $raw ) || $raw === array() ) {
			return null;
		}
		$out = array();
		foreach ( array_slice( $raw, 0, 200 ) as $item ) {
			if ( ! is_string( $item ) ) {
				continue;
			}
			$t = trim( $item );
			if ( $t === '' || strlen( $t ) > 253 ) {
				continue;
			}
			$out[] = $t;
		}
		return $out !== array() ? $out : null;
	}

	/**
	 * @param string[]      $url_organic_urls
	 * @param string[]      $phrase_related_urls
	 * @param string[]      $phrase_organic_urls
	 * @param string        $page_url
	 * @param string[]|null $blocked_hosts
	 * @return array{urlOrganicUrls:string[],phraseRelatedUrls:string[],phraseOrganicUrls:string[],externalSemrushUrls:string[]}
	 */
	private static function filter_reference_urls(
		array $url_organic_urls,
		array $phrase_related_urls,
		array $phrase_organic_urls,
		string $page_url,
		?array $blocked_hosts
	): array {
		$page_host = '';
		$norm      = self::normalize_url( $page_url );
		if ( $norm !== '' ) {
			$h = wp_parse_url( $norm, PHP_URL_HOST );
			if ( is_string( $h ) ) {
				$page_host = strtolower( preg_replace( '/^www\./', '', $h ) );
			}
		}

		$blocked = array();
		if ( is_array( $blocked_hosts ) ) {
			foreach ( $blocked_hosts as $h ) {
				$blocked[ strtolower( $h ) ] = true;
			}
		}

		$filter = static function ( array $urls ) use ( $page_host, $blocked ): array {
			$out = array();
			foreach ( $urls as $u ) {
				$host = wp_parse_url( $u, PHP_URL_HOST );
				if ( ! is_string( $host ) ) {
					continue;
				}
				$host = strtolower( preg_replace( '/^www\./', '', $host ) );
				if ( $page_host !== '' && $host === $page_host ) {
					continue;
				}
				if ( isset( $blocked[ $host ] ) ) {
					continue;
				}
				$out[] = $u;
			}
			return $out;
		};

		$uo = $filter( $url_organic_urls );
		$pr = $filter( $phrase_related_urls );
		$po = $filter( $phrase_organic_urls );

		return array(
			'urlOrganicUrls'      => $uo,
			'phraseRelatedUrls'   => $pr,
			'phraseOrganicUrls'   => $po,
			'externalSemrushUrls' => array_values( array_unique( array_merge( $pr, $po ) ) ),
		);
	}
}
