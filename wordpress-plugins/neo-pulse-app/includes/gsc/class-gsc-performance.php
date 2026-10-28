<?php
/**
 * GSC performance stats, page queries, and Overview keyword CSV export.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Gsc_Performance {

	const CONTEXT_MAX_CHARS = 8000;
	const CONTEXT_MAX_ROWS  = 5000;

	/** Organic Performance dashboard: enough for top-query UI without 25k-row GSC pulls. */
	const ORGANIC_DASHBOARD_QUERY_ROW_LIMIT = 1500;

	const ORGANIC_DASHBOARD_TOP_KEYWORDS_CAP = 300;

	public static function gsc_dumps_dir(): string {
		return Neo_Pulse_App_Data_Paths::subdir( 'gsc' );
	}

	/** @param array<string,mixed> $body */
	public static function fetch_performance_stats( array $body ): array {
		$site_url = trim( (string) ( $body['siteUrl'] ?? '' ) );
		if ( $site_url === '' ) {
			return self::err( 400, 'Missing required field: siteUrl' );
		}
		if ( empty( $body['startDate'] ) || empty( $body['endDate'] ) ) {
			return self::err( 400, 'Missing required date fields: startDate, endDate' );
		}
		$include_compare = ! isset( $body['includeCompare'] ) || ! empty( $body['includeCompare'] );
		$cur             = Neo_Pulse_App_Gsc_Service_Account::validate_dates( $body['startDate'], $body['endDate'] );
		if ( empty( $cur['valid'] ) ) {
			return self::err( 400, 'Current period: ' . ( $cur['error'] ?? 'Invalid date range' ) );
		}
		$cmp = null;
		if ( $include_compare ) {
			if ( empty( $body['compareStartDate'] ) || empty( $body['compareEndDate'] ) ) {
				return self::err( 400, 'Missing required date fields: compareStartDate, compareEndDate' );
			}
			$cmp = Neo_Pulse_App_Gsc_Service_Account::validate_dates( $body['compareStartDate'], $body['compareEndDate'] );
			if ( empty( $cmp['valid'] ) ) {
				return self::err( 400, 'Comparison period: ' . ( $cmp['error'] ?? 'Invalid date range' ) );
			}
		}
		Neo_Pulse_App_Gsc_Service_Account::write_report_date_range(
			array(
				'startDate'        => $cur['startDateStr'],
				'endDate'          => $cur['endDateStr'],
				'compareStartDate' => $include_compare && is_array( $cmp ) ? $cmp['startDateStr'] : null,
				'compareEndDate'   => $include_compare && is_array( $cmp ) ? $cmp['endDateStr'] : null,
			)
		);
		$resolved = Neo_Pulse_App_Gsc_Service_Account::resolve_or_fallback( $site_url, $cur['startDateStr'], $cur['endDateStr'] );
		if ( ! $resolved['property'] ) {
			$email = Neo_Pulse_App_Gsc_Service_Account::service_account_email();
			return self::err( 200, "This site is not in the list of properties the service account can access.\n\nAdd {$email} as a user in GSC.", array( 'errorType' => 'site_not_in_list', 'originalSiteUrl' => $site_url, 'serviceAccountEmail' => $email ) );
		}
		$prop   = $resolved['property'];
		$include_pages     = ! isset( $body['includePagesCount'] ) || ! empty( $body['includePagesCount'] );
		$include_timeseries = ! empty( $body['includeTimeseries'] );
		$query_row_limit    = self::resolve_query_row_limit( $body );
		$top_keywords_cap   = self::resolve_top_keywords_cap( $body );
		if ( $include_timeseries ) {
			$timeout = self::resolve_request_timeout_seconds( $body );
			return self::fetch_performance_stats_parallel_batch(
				$prop,
				$cur['startDateStr'],
				$cur['endDateStr'],
				$include_compare && is_array( $cmp ) ? $cmp['startDateStr'] : null,
				$include_compare && is_array( $cmp ) ? $cmp['endDateStr'] : null,
				$include_compare,
				$query_row_limit,
				$top_keywords_cap,
				$timeout
			);
		}
		$now           = self::stats_for_range( $prop, $cur['startDateStr'], $cur['endDateStr'], $include_pages );
		if ( ! $include_compare ) {
			return array(
				'statusCode' => 200,
				'body'       => array(
					'success'  => true,
					'property' => $prop,
					'stats'    => array(
						'currentPeriod'    => self::period_payload( $cur['startDateStr'], $cur['endDateStr'], $now ),
						'comparisonPeriod' => self::period_payload( $cur['startDateStr'], $cur['endDateStr'], self::empty_stats() ),
						'comparisons'      => self::compare_stats( $now, self::empty_stats() ),
						'topKeywords'      => self::top_keywords( $now['queries'], array() ),
					),
				),
			);
		}
		$before = self::stats_for_range( $prop, $cmp['startDateStr'], $cmp['endDateStr'], $include_pages );
		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'  => true,
				'property' => $prop,
				'stats'    => array(
					'currentPeriod'    => self::period_payload( $cur['startDateStr'], $cur['endDateStr'], $now ),
					'comparisonPeriod' => self::period_payload( $cmp['startDateStr'], $cmp['endDateStr'], $before ),
					'comparisons'      => self::compare_stats( $now, $before ),
					'topKeywords'      => self::top_keywords( $now['queries'], $before['queries'] ),
				),
			),
		);
	}

	/** @param array<string,mixed> $body */
	public static function fetch_page_performance( array $body ): array {
		$site_url = trim( (string) ( $body['siteUrl'] ?? '' ) );
		$page_url = trim( (string) ( $body['pageUrl'] ?? '' ) );
		if ( $site_url === '' || $page_url === '' ) {
			return self::err( 400, 'Missing siteUrl or pageUrl' );
		}
		$range = self::page_perf_range( $body );
		$dv    = Neo_Pulse_App_Gsc_Service_Account::validate_dates( $range['start'], $range['end'] );
		if ( empty( $dv['valid'] ) ) {
			return self::err( 400, $dv['error'] ?? 'Invalid date range' );
		}
		$resolved = Neo_Pulse_App_Gsc_Service_Account::resolve_or_fallback( $site_url, $dv['startDateStr'], $dv['endDateStr'], 'page' );
		if ( ! $resolved['property'] ) {
			return array( 'statusCode' => 404, 'body' => Neo_Pulse_App_Gsc_Service_Account::property_error_payload( $resolved['matchDetails'] ) );
		}
		return array(
			'statusCode' => 200,
			'body'       => self::page_perf_payload(
				$page_url,
				$resolved['property'],
				$dv['startDateStr'],
				$dv['endDateStr'],
				! empty( $body['strictPageMatch'] )
			),
		);
	}

	/** @return array<string,mixed> */
	public static function page_perf_payload( string $page_url, string $prop, string $start, string $end, bool $strict_page_match = false ): array {
		$mapped = self::page_query_rows( $prop, $start, $end, $page_url, $strict_page_match );
		return self::page_perf_body( $page_url, $prop, $start, $end, $mapped );
	}

	/** @param array<string,mixed> $body */
	public static function page_perf_range_from_body( array $body ): array {
		return self::page_perf_range( $body );
	}

	/** @param array<string,mixed> $request_body */
	public static function fetch_all_search_analytics_rows( string $property, array $request_body, int $page_size = 25000, int $max_rows = 200000 ): array {
		$all = array();
		$start_row = 0;
		while ( count( $all ) < $max_rows ) {
			$request_body['rowLimit']  = $page_size;
			$request_body['startRow']  = $start_row;
			$res = Neo_Pulse_App_Gsc_Service_Account::search_analytics_query( $property, $request_body );
			if ( is_wp_error( $res ) ) {
				break;
			}
			$batch = isset( $res['rows'] ) && is_array( $res['rows'] ) ? $res['rows'] : array();
			$all   = array_merge( $all, $batch );
			if ( count( $batch ) < $page_size ) {
				break;
			}
			$start_row += $page_size;
		}
		return $all;
	}

	/** @param array<string,mixed> $body */
	public static function export_overview_quick_wins( array $body ): array {
		$site_url = trim( (string) ( $body['siteUrl'] ?? '' ) );
		if ( $site_url === '' ) {
			return self::err( 400, 'Missing siteUrl' );
		}
		$range = self::overview_export_range();
		$dv    = Neo_Pulse_App_Gsc_Service_Account::validate_dates( $range['start'], $range['end'] );
		if ( empty( $dv['valid'] ) ) {
			return self::err( 400, $dv['error'] ?? 'Invalid date range' );
		}
		$resolved = Neo_Pulse_App_Gsc_Service_Account::resolve_or_fallback( $site_url, $dv['startDateStr'], $dv['endDateStr'], 'page' );
		if ( ! $resolved['property'] ) {
			return array( 'statusCode' => 404, 'body' => Neo_Pulse_App_Gsc_Service_Account::property_error_payload( $resolved['matchDetails'] ) );
		}
		$page_urls      = isset( $body['pageUrls'] ) && is_array( $body['pageUrls'] ) ? $body['pageUrls'] : array();
		$want_site_wide = ! empty( $body['siteWideQueriesOnly'] ) || empty( $page_urls );
		$rows           = $want_site_wide
			? self::site_wide_rows( $resolved['property'], $dv['startDateStr'], $dv['endDateStr'] )
			: self::page_export_rows( $resolved['property'], $dv['startDateStr'], $dv['endDateStr'], $page_urls );
		if ( isset( $rows['error'] ) ) {
			return self::err( 400, $rows['error'] );
		}
		$ts          = str_replace( array( ':', '.' ), '-', gmdate( 'c' ) );
		$stored_file = ( $want_site_wide ? 'gsc_site_queries__' : 'gsc_page_keywords__' ) . $ts . '.csv';
		$csv         = self::rows_to_csv( $rows );
		file_put_contents( self::gsc_dumps_dir() . '/' . sanitize_file_name( $stored_file ), $csv );
		$line_count = max( 0, count( array_filter( explode( "\n", trim( $csv ) ) ) ) - 1 );
		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'    => true,
				'storedFile' => $stored_file,
				'dateRange'  => array( 'startDate' => $dv['startDateStr'], 'endDate' => $dv['endDateStr'] ),
				'rowCount'   => $line_count,
				'property'   => $resolved['property'],
			),
		);
	}

	/** @param array<string,mixed> $body */
	public static function quick_wins_context( array $body ): array {
		$page_url = trim( (string) ( $body['pageUrl'] ?? '' ) );
		$filename = (string) ( $body['filename'] ?? '' );
		if ( $page_url === '' ) {
			return self::err( 400, 'Missing pageUrl' );
		}
		if ( ! self::is_safe_csv_filename( $filename ) ) {
			return self::err( 400, 'Invalid filename' );
		}
		$path = self::gsc_dumps_dir() . '/' . sanitize_file_name( $filename );
		if ( ! is_readable( $path ) ) {
			return self::err( 404, 'File not found' );
		}
		$lines = array_values( array_filter( preg_split( '/\r\n|\r|\n/', (string) file_get_contents( $path ) ) ) );
		if ( count( $lines ) < 2 ) {
			return array( 'statusCode' => 200, 'body' => array( 'success' => true, 'context' => '', 'rowCount' => 0, 'queries' => array() ) );
		}
		$header  = array_map( 'strtolower', array_map( 'trim', str_getcsv( $lines[0] ) ) );
		$matched = array();
		for ( $i = 1; $i < count( $lines ); $i++ ) {
			$cols = str_getcsv( $lines[ $i ] );
			if ( ( $header[0] ?? '' ) === 'query' && ! empty( $cols[0] ) ) {
				$matched[] = array( 'query' => trim( (string) $cols[0] ) );
			} elseif ( ( $header[0] ?? '' ) === 'page' && ( $header[1] ?? '' ) === 'query' && ! empty( $cols[1] ) && self::gsc_page_matches_target( (string) ( $cols[0] ?? '' ), $page_url ) ) {
				$matched[] = array( 'query' => trim( (string) $cols[1] ) );
			}
		}
		$slim    = array_slice( $matched, 0, self::CONTEXT_MAX_ROWS );
		$queries = array_values( array_filter( array_map( static function ( $r ) {
			return trim( (string) ( $r['query'] ?? '' ) );
		}, $slim ) ) );
		$context = wp_json_encode( array( 'gsc_keywords_for_url' => $page_url, 'rows' => $slim ) );
		if ( is_string( $context ) && strlen( $context ) > self::CONTEXT_MAX_CHARS ) {
			$context = substr( $context, 0, self::CONTEXT_MAX_CHARS );
		}
		return array( 'statusCode' => 200, 'body' => array( 'success' => true, 'context' => $context, 'rowCount' => count( $matched ), 'queries' => $queries ) );
	}

	/** @return array{statusCode:int,body?:array<string,mixed>,file?:string,contentType?:string} */
	public static function serve_quick_wins_csv( string $filename ): array {
		if ( ! self::is_safe_csv_filename( $filename ) ) {
			return array( 'statusCode' => 400, 'body' => array( 'error' => 'Invalid filename' ) );
		}
		$path = self::gsc_dumps_dir() . '/' . sanitize_file_name( $filename );
		if ( ! is_readable( $path ) ) {
			return array( 'statusCode' => 404, 'body' => array( 'error' => 'File not found' ) );
		}
		return array( 'statusCode' => 200, 'file' => $path, 'contentType' => 'text/csv; charset=utf-8' );
	}

	public static function is_safe_csv_filename( string $filename ): bool {
		return (bool) preg_match( '/^gsc_(quick_wins|page_keywords|site_queries)__[a-zA-Z0-9._-]+\.csv$/', $filename );
	}

	/** @param array<int,array<string,mixed>>|null $mapped */
	private static function page_perf_body( string $page_url, string $prop, string $start, string $end, ?array $mapped = null ): array {
		if ( null === $mapped ) {
			$mapped = self::page_query_rows( $prop, $start, $end, $page_url );
		}
		$empty  = array(
			'success' => true, 'pageUrl' => $page_url, 'matchedUrl' => $page_url, 'pageExists' => false,
			'pageStats' => array( 'clicks' => 0, 'impressions' => 0, 'ctr' => 0, 'position' => 0 ),
			'dateRange' => array( 'startDate' => $start, 'endDate' => $end ), 'queries' => array(),
			'topKeyword' => null, 'totalQueries' => 0, 'property' => $prop,
		);
		if ( empty( $mapped ) ) {
			return $empty;
		}
		$queries = self::dedupe_queries( $mapped );
		$stats   = self::aggregate( $mapped );
		$top     = $queries[0] ?? null;
		return array(
			'success' => true, 'pageUrl' => $page_url, 'matchedUrl' => trim( (string) ( $mapped[0]['page'] ?? '' ) ) ?: $page_url,
			'pageExists' => true, 'pageStats' => $stats, 'dateRange' => array( 'startDate' => $start, 'endDate' => $end ),
			'queries' => $queries, 'topKeyword' => $top ? array( 'query' => $top['query'], 'clicks' => $top['clicks'], 'impressions' => $top['impressions'], 'ctr' => $top['ctr'], 'position' => $top['position'] ) : null,
			'totalQueries' => count( $queries ), 'property' => $prop,
		);
	}

	/**
	 * Organic dashboard: parallel Search Analytics (stats + optional compare + daily timeseries).
	 *
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	private static function fetch_performance_stats_parallel_batch(
		string $prop,
		string $cur_start,
		string $cur_end,
		?string $cmp_start,
		?string $cmp_end,
		bool $include_compare,
		int $query_row_limit = 25000,
		int $top_keywords_cap = 0,
		int $request_timeout_seconds = 60
	): array {
		$query_row_limit = max( 100, min( 25000, $query_row_limit ) );
		$timeseries_rows = max( 32, min( 400, self::inclusive_day_span( $cur_start, $cur_end ) + 7 ) );
		$bodies          = array(
			'cur_totals'  => array(
				'startDate' => $cur_start,
				'endDate'   => $cur_end,
			),
			'cur_queries' => self::query_dimension_request_body( $cur_start, $cur_end, $query_row_limit ),
			'timeseries'  => array(
				'startDate'  => $cur_start,
				'endDate'    => $cur_end,
				'dimensions' => array( 'date' ),
				'rowLimit'   => $timeseries_rows,
			),
		);
		if ( $include_compare && $cmp_start !== null && $cmp_end !== null ) {
			$bodies['cmp_totals']  = array(
				'startDate' => $cmp_start,
				'endDate'   => $cmp_end,
			);
			$bodies['cmp_queries'] = self::query_dimension_request_body( $cmp_start, $cmp_end, $query_row_limit );
		}

		$responses = Neo_Pulse_App_Gsc_Service_Account::search_analytics_query_parallel(
			$prop,
			$bodies,
			$request_timeout_seconds
		);
		foreach ( $responses as $response ) {
			if ( is_wp_error( $response ) ) {
				return self::err( 502, $response->get_error_message() );
			}
		}

		$now    = self::stats_from_analytics_responses(
			$responses['cur_totals'] ?? array(),
			$responses['cur_queries'] ?? array()
		);
		$before = self::empty_stats();
		if ( $include_compare && $cmp_start !== null && $cmp_end !== null ) {
			$before = self::stats_from_analytics_responses(
				$responses['cmp_totals'] ?? array(),
				$responses['cmp_queries'] ?? array()
			);
		}
		$timeseries = self::timeseries_from_analytics_response( $responses['timeseries'] ?? array() );

		$top_keywords = self::top_keywords( $now['queries'], $before['queries'] );
		if ( $top_keywords_cap > 0 ) {
			$top_keywords = array_slice( $top_keywords, 0, max( 50, min( 2500, $top_keywords_cap ) ) );
		}

		$stats_body = array(
			'currentPeriod'    => self::period_payload( $cur_start, $cur_end, $now ),
			'comparisonPeriod' => $include_compare && $cmp_start !== null && $cmp_end !== null
				? self::period_payload( $cmp_start, $cmp_end, $before )
				: self::period_payload( $cur_start, $cur_end, self::empty_stats() ),
			'comparisons'      => self::compare_stats( $now, $before ),
			'topKeywords'      => $top_keywords,
		);

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'    => true,
				'property'   => $prop,
				'stats'      => $stats_body,
				'timeseries' => $timeseries,
			),
		);
	}

	/**
	 * @param array<string,mixed> $totals_res
	 * @param array<string,mixed> $queries_res
	 * @return array<string,mixed>
	 */
	private static function stats_from_analytics_responses( array $totals_res, array $queries_res ): array {
		$stats = self::empty_stats();
		if ( ! empty( $totals_res['rows'][0] ) ) {
			$r                   = $totals_res['rows'][0];
			$stats['clicks']      = (int) ( $r['clicks'] ?? 0 );
			$stats['impressions'] = (int) ( $r['impressions'] ?? 0 );
			$stats['ctr']         = (float) ( $r['ctr'] ?? 0 );
			$stats['avgPosition'] = (float) ( $r['position'] ?? 0 );
		}
		if ( ! empty( $queries_res['rows'] ) ) {
			$stats['searchTermsCount'] = count( $queries_res['rows'] );
			foreach ( $queries_res['rows'] as $row ) {
				$stats['queries'][] = array(
					'query'       => (string) ( $row['keys'][0] ?? '' ),
					'clicks'      => (int) ( $row['clicks'] ?? 0 ),
					'impressions' => (int) ( $row['impressions'] ?? 0 ),
					'ctr'         => (float) ( $row['ctr'] ?? 0 ),
					'position'    => (float) ( $row['position'] ?? 0 ),
				);
			}
		}
		return $stats;
	}

	/**
	 * @param array<string,mixed> $res
	 * @return array<int,array{date:string,clicks:int,impressions:int,avgPosition:float}>
	 */
	private static function timeseries_from_analytics_response( array $res ): array {
		if ( empty( $res['rows'] ) ) {
			return array();
		}
		$points = array();
		foreach ( $res['rows'] as $row ) {
			$date = (string) ( $row['keys'][0] ?? '' );
			if ( $date === '' ) {
				continue;
			}
			$points[] = array(
				'date'        => $date,
				'clicks'      => (int) ( $row['clicks'] ?? 0 ),
				'impressions' => (int) ( $row['impressions'] ?? 0 ),
				'avgPosition' => (float) ( $row['position'] ?? 0 ),
			);
		}
		usort(
			$points,
			static function ( $a, $b ) {
				return strcmp( $a['date'], $b['date'] );
			}
		);
		return $points;
	}

	/** @return array<string,mixed> */
	private static function empty_stats(): array {
		return array(
			'clicks'            => 0,
			'impressions'       => 0,
			'ctr'               => 0.0,
			'avgPosition'       => 0.0,
			'pagesCount'        => 0,
			'searchTermsCount'  => 0,
			'queries'           => array(),
		);
	}

	/** @return array<string,mixed> */
	private static function stats_for_range( string $prop, string $start, string $end, bool $include_pages = true ): array {
		$stats = self::empty_stats();
		$totals = Neo_Pulse_App_Gsc_Service_Account::search_analytics_query( $prop, array( 'startDate' => $start, 'endDate' => $end ) );
		if ( ! is_wp_error( $totals ) && ! empty( $totals['rows'][0] ) ) {
			$r = $totals['rows'][0];
			$stats['clicks'] = (int) ( $r['clicks'] ?? 0 ); $stats['impressions'] = (int) ( $r['impressions'] ?? 0 );
			$stats['ctr'] = (float) ( $r['ctr'] ?? 0 ); $stats['avgPosition'] = (float) ( $r['position'] ?? 0 );
		}
		$q = Neo_Pulse_App_Gsc_Service_Account::search_analytics_query( $prop, array( 'startDate' => $start, 'endDate' => $end, 'dimensions' => array( 'query' ), 'rowLimit' => 25000 ) );
		if ( ! is_wp_error( $q ) && ! empty( $q['rows'] ) ) {
			$stats['searchTermsCount'] = count( $q['rows'] );
			foreach ( $q['rows'] as $row ) {
				$stats['queries'][] = array( 'query' => (string) ( $row['keys'][0] ?? '' ), 'clicks' => (int) ( $row['clicks'] ?? 0 ), 'impressions' => (int) ( $row['impressions'] ?? 0 ), 'ctr' => (float) ( $row['ctr'] ?? 0 ), 'position' => (float) ( $row['position'] ?? 0 ) );
			}
		}
		if ( $include_pages ) {
			$p = Neo_Pulse_App_Gsc_Service_Account::search_analytics_query( $prop, array( 'startDate' => $start, 'endDate' => $end, 'dimensions' => array( 'page' ), 'rowLimit' => 25000 ) );
			if ( ! is_wp_error( $p ) && ! empty( $p['rows'] ) ) {
				$stats['pagesCount'] = count( $p['rows'] );
			}
		}
		return $stats;
	}

	/** @param array<string,mixed> $s */
	private static function period_payload( string $start, string $end, array $s ): array {
		return array( 'startDate' => $start, 'endDate' => $end, 'clicks' => $s['clicks'], 'impressions' => $s['impressions'], 'ctr' => $s['ctr'], 'avgPosition' => $s['avgPosition'], 'pagesCount' => $s['pagesCount'], 'searchTermsCount' => $s['searchTermsCount'] );
	}

	/** @param array<string,mixed> $a @param array<string,mixed> $b */
	private static function compare_stats( array $a, array $b ): array {
		$pct = static function ( $c, $p ) { return $p > 0 ? ( ( $c - $p ) / $p ) * 100 : ( $c > 0 ? 100 : 0 ); };
		return array(
			'clicksChange' => $a['clicks'] - $b['clicks'], 'clicksChangePercent' => $pct( $a['clicks'], $b['clicks'] ),
			'impressionsChange' => $a['impressions'] - $b['impressions'], 'impressionsChangePercent' => $pct( $a['impressions'], $b['impressions'] ),
			'ctrChange' => $a['ctr'] - $b['ctr'], 'ctrChangePercent' => $pct( $a['ctr'], $b['ctr'] ),
			'avgPositionChange' => $a['avgPosition'] - $b['avgPosition'], 'avgPositionChangePercent' => $b['avgPosition'] > 0 ? ( ( $a['avgPosition'] - $b['avgPosition'] ) / $b['avgPosition'] ) * 100 : 0,
			'pagesChange' => $a['pagesCount'] - $b['pagesCount'], 'pagesChangePercent' => $pct( $a['pagesCount'], $b['pagesCount'] ),
			'searchTermsChange' => $a['searchTermsCount'] - $b['searchTermsCount'], 'searchTermsChangePercent' => $pct( $a['searchTermsCount'], $b['searchTermsCount'] ),
		);
	}

	private static function inclusive_day_span( string $start, string $end ): int {
		$start_ts = strtotime( $start . ' UTC' );
		$end_ts   = strtotime( $end . ' UTC' );
		if ( false === $start_ts || false === $end_ts || $end_ts < $start_ts ) {
			return 31;
		}
		return (int) floor( ( $end_ts - $start_ts ) / DAY_IN_SECONDS ) + 1;
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function resolve_request_timeout_seconds( array $body ): int {
		if ( ! isset( $body['requestTimeoutSeconds'] ) ) {
			return 60;
		}
		return max( 15, min( 120, (int) $body['requestTimeoutSeconds'] ) );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function resolve_query_row_limit( array $body ): int {
		if ( ! isset( $body['queryRowLimit'] ) ) {
			return 25000;
		}
		return max( 100, min( 25000, (int) $body['queryRowLimit'] ) );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function resolve_top_keywords_cap( array $body ): int {
		if ( ! isset( $body['topKeywordsCap'] ) ) {
			return 0;
		}
		return max( 0, min( 2500, (int) $body['topKeywordsCap'] ) );
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function query_dimension_request_body( string $start, string $end, int $row_limit ): array {
		$body = array(
			'startDate'  => $start,
			'endDate'    => $end,
			'dimensions' => array( 'query' ),
			'rowLimit'   => $row_limit,
		);
		if ( $row_limit < 25000 ) {
			$body['orderBy'] = array(
				array(
					'fieldName' => 'impressions',
					'sortOrder' => 'DESCENDING',
				),
			);
		}
		return $body;
	}

	/** @param array<int,array<string,mixed>> $cur @param array<int,array<string,mixed>> $prev */
	private static function top_keywords( array $cur, array $prev ): array {
		$index = static function ( $rows ) {
			$out = array();
			foreach ( $rows as $r ) { $out[ strtolower( (string) $r['query'] ) ] = $r; }
			return $out;
		};
		$a = $index( $cur ); $b = $index( $prev ); $top = array();
		foreach ( array_unique( array_merge( array_keys( $a ), array_keys( $b ) ) ) as $k ) {
			$c = $a[ $k ] ?? null; $p = $b[ $k ] ?? null;
			$top[] = array(
				'query' => ( $c ?? $p )['query'], 'currentRanking' => $c ? $c['position'] : 0, 'previousRanking' => $p ? $p['position'] : 0,
				'rankingChange' => ( $c && $p ) ? $p['position'] - $c['position'] : 0, 'currentClicks' => $c ? $c['clicks'] : 0,
				'previousClicks' => $p ? $p['clicks'] : 0, 'clicksChange' => ( $c ? $c['clicks'] : 0 ) - ( $p ? $p['clicks'] : 0 ),
				'currentImpressions' => $c ? $c['impressions'] : 0, 'previousImpressions' => $p ? $p['impressions'] : 0,
				'impressionsChange' => ( $c ? $c['impressions'] : 0 ) - ( $p ? $p['impressions'] : 0 ),
			);
		}
		usort( $top, static function ( $x, $y ) { return ( $y['currentImpressions'] ?? 0 ) <=> ( $x['currentImpressions'] ?? 0 ); } );
		return $top;
	}

	/** @return array<int,array<string,mixed>> */
	private static function page_query_rows( string $prop, string $start, string $end, string $page_url, bool $strict_page_match = false ): array {
		$base = array( 'startDate' => $start, 'endDate' => $end, 'dimensions' => array( 'page', 'query' ) );
		$rows = array();
		foreach ( self::page_url_equals_candidates( $page_url ) as $candidate ) {
			$batch = self::fetch_all_search_analytics_rows( $prop, array_merge( $base, array( 'dimensionFilterGroups' => array( array( 'filters' => array( array( 'dimension' => 'page', 'operator' => 'equals', 'expression' => $candidate ) ) ) ) ) ) );
			if ( $batch ) { $rows = $batch; break; }
		}
		if ( ! $rows && ! $strict_page_match ) {
			$path = wp_parse_url( trim( $page_url ), PHP_URL_PATH );
			$expr = is_string( $path ) && $path !== '' ? $path : ( 0 === strpos( trim( $page_url ), '/' ) ? trim( $page_url ) : '/' . trim( $page_url ) );
			$rows = self::fetch_all_search_analytics_rows( $prop, array_merge( $base, array( 'dimensionFilterGroups' => array( array( 'filters' => array( array( 'dimension' => 'page', 'operator' => 'contains', 'expression' => $expr ) ) ) ) ) ) );
		}
		$out = array();
		foreach ( $rows as $row ) {
			$q = trim( (string) ( $row['keys'][1] ?? '' ) );
			if ( $q === '' ) { continue; }
			$out[] = array( 'page' => (string) ( $row['keys'][0] ?? '' ), 'query' => $q, 'clicks' => (int) ( $row['clicks'] ?? 0 ), 'impressions' => (int) ( $row['impressions'] ?? 0 ), 'ctr' => (float) ( $row['ctr'] ?? 0 ), 'position' => (float) ( $row['position'] ?? 0 ) );
		}
		return $out;
	}

	/** @return array<int,array<string,mixed>>|array{error:string} */
	private static function page_export_rows( string $prop, string $start, string $end, array $page_urls ): array {
		$unique = array_values( array_unique( array_filter( array_map( 'trim', array_map( 'strval', $page_urls ) ) ) ) );
		if ( empty( $unique ) ) {
			return array( 'error' => 'No valid page URLs' );
		}
		$all = array();
		foreach ( $unique as $url ) {
			$all = array_merge( $all, self::page_query_rows( $prop, $start, $end, $url ) );
		}
		return $all;
	}

	/** @return array<int,array<string,mixed>> */
	private static function site_wide_rows( string $prop, string $start, string $end ): array {
		$rows = self::fetch_all_search_analytics_rows( $prop, array( 'startDate' => $start, 'endDate' => $end, 'dimensions' => array( 'query' ) ) );
		$out  = array();
		foreach ( $rows as $row ) {
			$q = trim( (string) ( $row['keys'][0] ?? '' ) );
			if ( $q === '' ) { continue; }
			$out[] = array( 'page' => '', 'query' => $q, 'clicks' => (int) ( $row['clicks'] ?? 0 ), 'impressions' => (int) ( $row['impressions'] ?? 0 ), 'ctr' => (float) ( $row['ctr'] ?? 0 ), 'position' => (float) ( $row['position'] ?? 0 ) );
		}
		return $out;
	}

	/** @param array<int,array<string,mixed>> $mapped */
	private static function dedupe_queries( array $mapped ): array {
		usort( $mapped, static function ( $a, $b ) { return ( $b['impressions'] ?? 0 ) <=> ( $a['impressions'] ?? 0 ); } );
		$seen = array(); $out = array();
		foreach ( $mapped as $r ) {
			$q = trim( (string) ( $r['query'] ?? '' ) );
			if ( $q === '' || isset( $seen[ $q ] ) ) { continue; }
			$seen[ $q ] = true;
			$out[] = array( 'query' => $q, 'clicks' => (int) ( $r['clicks'] ?? 0 ), 'impressions' => (int) ( $r['impressions'] ?? 0 ), 'ctr' => (float) ( $r['ctr'] ?? 0 ), 'position' => (float) ( $r['position'] ?? 0 ) );
		}
		return $out;
	}

	/** @param array<int,array<string,mixed>> $mapped @return array<string,float|int> */
	private static function aggregate( array $mapped ): array {
		$c = 0; $i = 0; $wp = 0.0; $wd = 0.0;
		foreach ( $mapped as $r ) {
			$c += (int) ( $r['clicks'] ?? 0 ); $im = (int) ( $r['impressions'] ?? 0 ); $i += $im;
			$wp += (float) ( $r['position'] ?? 0 ) * max( 1, $im ); $wd += max( 1, $im );
		}
		return array( 'clicks' => $c, 'impressions' => $i, 'ctr' => $i > 0 ? $c / $i : 0, 'position' => $wd > 0 ? $wp / $wd : 0 );
	}

	/** @param array<int,array<string,mixed>> $rows */
	private static function rows_to_csv( array $rows ): string {
		$queries = array();
		foreach ( $rows as $r ) {
			$q = trim( (string) ( $r['query'] ?? '' ) );
			if ( $q === '' ) { continue; }
			$im = (int) ( $r['impressions'] ?? 0 );
			if ( ! isset( $queries[ $q ] ) || $im > $queries[ $q ] ) { $queries[ $q ] = $im; }
		}
		arsort( $queries );
		$lines = array( 'query' );
		foreach ( array_keys( $queries ) as $q ) {
			$lines[] = preg_match( '/[",\n\r]/', $q ) ? '"' . str_replace( '"', '""', $q ) . '"' : $q;
		}
		return implode( "\n", $lines );
	}

	/** @param array<string,mixed> $body @return array{start:string,end:string} */
	private static function page_perf_range( array $body ): array {
		$def = self::page_perf_default_range();
		return array( 'start' => ! empty( $body['startDate'] ) ? (string) $body['startDate'] : $def['start'], 'end' => ! empty( $body['endDate'] ) ? (string) $body['endDate'] : $def['end'] );
	}

	/** @return array{start:string,end:string} */
	private static function page_perf_default_range(): array {
		$end = new DateTimeImmutable( '-3 days', new DateTimeZone( 'UTC' ) );
		return array( 'start' => $end->modify( '-27 days' )->format( 'Y-m-d' ), 'end' => $end->format( 'Y-m-d' ) );
	}

	/** @return array{start:string,end:string} */
	private static function overview_export_range(): array {
		$today = new DateTimeImmutable( 'now', new DateTimeZone( 'UTC' ) );
		$end   = $today->modify( 'first day of this month' )->modify( '-1 day' );
		$start = $end->modify( 'first day of previous month' );
		return array( 'start' => $start->format( 'Y-m-d' ), 'end' => $end->format( 'Y-m-d' ) );
	}

	/** @param array<string,mixed> $extra */
	private static function err( int $code, string $message, array $extra = array() ): array {
		return array( 'statusCode' => $code, 'body' => array_merge( array( 'success' => false, 'error' => $message ), $extra ) );
	}

	/** @return array<int,string> */
	private static function page_url_equals_candidates( string $page_url ): array {
		$out = array(); $t = trim( $page_url );
		if ( $t === '' ) { return $out; }
		$seen = array( $t => true ); $out[] = $t;
		$parts = wp_parse_url( $t );
		if ( is_array( $parts ) && ! empty( $parts['scheme'] ) && ! empty( $parts['host'] ) ) {
			$path = rtrim( $parts['path'] ?? '/', '/' ) ?: '/';
			$origin = $parts['scheme'] . '://' . $parts['host'];
			foreach ( array( $origin . $path, $path !== '/' ? $origin . $path . '/' : null ) as $candidate ) {
				if ( $candidate && ! isset( $seen[ $candidate ] ) ) { $seen[ $candidate ] = true; $out[] = $candidate; }
			}
		}
		return $out;
	}

	/**
	 * Daily clicks/impressions for a date range (Search Console date dimension).
	 *
	 * @return array<int,array{date:string,clicks:int,impressions:int,avgPosition:float}>
	 */
	public static function timeseries_for_range( string $property, string $start, string $end ): array {
		$res = Neo_Pulse_App_Gsc_Service_Account::search_analytics_query(
			$property,
			array(
				'startDate'  => $start,
				'endDate'    => $end,
				'dimensions' => array( 'date' ),
				'rowLimit'   => 25000,
			)
		);
		if ( is_wp_error( $res ) || empty( $res['rows'] ) ) {
			return array();
		}
		$points = array();
		foreach ( $res['rows'] as $row ) {
			$date = (string) ( $row['keys'][0] ?? '' );
			if ( $date === '' ) {
				continue;
			}
			$points[] = array(
				'date'        => $date,
				'clicks'      => (int) ( $row['clicks'] ?? 0 ),
				'impressions' => (int) ( $row['impressions'] ?? 0 ),
				'avgPosition' => (float) ( $row['position'] ?? 0 ),
			);
		}
		usort(
			$points,
			static function ( $a, $b ) {
				return strcmp( $a['date'], $b['date'] );
			}
		);
		return $points;
	}

	private static function gsc_page_matches_target( string $gsc_page, string $target ): bool {
		$norm = static function ( $url ) {
			$parts = wp_parse_url( trim( (string) $url ) );
			if ( ! is_array( $parts ) || empty( $parts['host'] ) ) { return strtolower( trim( (string) $url ) ); }
			$host = preg_replace( '/^www\./', '', strtolower( $parts['host'] ) );
			$path = rtrim( $parts['path'] ?? '/', '/' ) ?: '/';
			return $parts['scheme'] . '://' . $host . $path;
		};
		$a = $norm( $gsc_page ); $b = $norm( $target );
		return $a !== '' && $b !== '' && $a === $b;
	}
}
