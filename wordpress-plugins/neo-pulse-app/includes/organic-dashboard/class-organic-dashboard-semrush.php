<?php
/**
 * Semrush domain overview payload for organic Performance reporting.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Organic_Dashboard_Semrush {

	const HISTORY_LIMIT = 24;

	const KEYWORDS_LIMIT = 25;

	/** @var string[] */
	private static $allowed_databases = array(
		'us',
		'uk',
		'ca',
		'au',
		'de',
		'fr',
		'es',
		'it',
		'br',
		'mx',
		'nl',
		'pl',
		'se',
		'in',
		'jp',
	);

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}|null Null when validation fails (caller returns 400).
	 */
	public static function validate_database_param( array $body ): ?array {
		if ( ! isset( $body['semrushDatabase'] ) ) {
			return null;
		}
		$raw = trim( (string) $body['semrushDatabase'] );
		if ( $raw === '' ) {
			return null;
		}
		$db = strtolower( $raw );
		if ( ! preg_match( '/^[a-z0-9-]{2,24}$/', $db ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'success' => false,
					'error'   => 'Invalid semrushDatabase',
				),
			);
		}
		if ( ! in_array( $db, self::$allowed_databases, true ) && ! preg_match( '/^(mobile-[a-z]{2}|[a-z]{2}-ext)$/', $db ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'success' => false,
					'error'   => 'Unsupported semrushDatabase: ' . $db,
				),
			);
		}
		return null;
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{payload:array<string,mixed>,status:'ok'|'skipped'|'error'}
	 */
	public static function fetch( array $body ): array {
		Neo_Pulse_App_Semrush_Client::bind_api_key_for_request( $body );
		try {
			return self::fetch_with_bound_key( $body );
		} finally {
			Neo_Pulse_App_Semrush_Client::clear_request_api_key();
		}
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{payload:array<string,mixed>,status:'ok'|'skipped'|'error'}
	 */
	private static function fetch_with_bound_key( array $body ): array {
		$site_url = isset( $body['siteUrl'] ) ? trim( (string) $body['siteUrl'] ) : '';
		$project_id = isset( $body['semrushProjectId'] ) ? trim( (string) $body['semrushProjectId'] ) : '';
		$database = Neo_Pulse_App_Semrush_Competitor_Shared::resolve_database(
			$body['semrushDatabase'] ?? null,
			$site_url,
			'us'
		);

		$include_compare = trim( (string) ( $body['reportStructure'] ?? '' ) ) !== 'period_progress';
		$compare_end     = trim( (string) ( $body['compareEndDate'] ?? '' ) );

		if ( ! Neo_Pulse_App_Semrush_Client::has_api_key() ) {
			return array(
				'status'  => 'skipped',
				'payload' => self::payload_with_project_context(
					array(
						'skipped' => true,
						'reason'  => 'no_api_key',
						'error'   => 'SEMRUSH_API_KEY is not set',
					),
					$project_id,
					$database,
					''
				),
			);
		}

		$host   = Neo_Pulse_App_Semrush_Competitor_Shared::domain_from_site_url( $site_url );
		$domain = Neo_Pulse_App_Semrush_Competitor_Shared::registrable_guess( $host );
		if ( $domain === '' ) {
			return array(
				'status'  => 'skipped',
				'payload' => self::payload_with_project_context(
					array(
						'skipped' => true,
						'reason'  => 'missing_domain',
						'error'   => 'Site URL is required for Semrush domain overview.',
					),
					$project_id,
					$database,
					''
				),
			);
		}

		$errors = array();

		$parallel_params = array(
			'current:domain_rank' => array(
				'type'           => 'domain_rank',
				'database'       => $database,
				'domain'         => $domain,
				'display_limit'  => 1,
				'export_columns' => Neo_Pulse_App_Semrush_Competitor_Shared::EXPORT_SEED_RANK,
			),
			'domain_rank_history' => array(
				'type'           => 'domain_rank_history',
				'database'       => $database,
				'domain'         => $domain,
				'display_limit'  => self::HISTORY_LIMIT,
				'display_sort'   => 'date_asc',
				'export_columns' => 'Dt,Or,Ot,Oc',
			),
			'domain_organic'      => array(
				'type'           => 'domain_organic',
				'database'       => $database,
				'domain'         => $domain,
				'display_limit'  => self::KEYWORDS_LIMIT,
				'display_sort'   => 'tr_desc',
				'export_columns' => Neo_Pulse_App_Semrush_Competitor_Shared::EXPORT_DOMAIN_ORGANIC_KW,
			),
		);

		$compare_rank_csv = null;
		if ( $include_compare && $compare_end !== '' ) {
			$display_date = self::semrush_display_date_from_ymd( $compare_end );
			if ( $display_date !== '' ) {
				$parallel_params['compare:domain_rank'] = array(
					'type'           => 'domain_rank',
					'database'       => $database,
					'domain'         => $domain,
					'display_limit'  => 1,
					'display_date'   => $display_date,
					'export_columns' => Neo_Pulse_App_Semrush_Competitor_Shared::EXPORT_SEED_RANK,
				);
			}
		}

		$timeout = 60;
		if ( isset( $body['requestTimeoutSeconds'] ) ) {
			$timeout = max( 10, min( 120, (int) $body['requestTimeoutSeconds'] ) );
		}
		$parallel_results = Neo_Pulse_App_Semrush_Client::request_reports_parallel( $parallel_params, $timeout );

		$rank_csv = self::csv_from_parallel_result( $parallel_results, 'current:domain_rank', $errors );
		if ( $include_compare && isset( $parallel_params['compare:domain_rank'] ) ) {
			$compare_rank_csv = self::csv_from_parallel_result( $parallel_results, 'compare:domain_rank', $errors );
		}
		$history_csv = self::csv_from_parallel_result( $parallel_results, 'domain_rank_history', $errors );
		$kw_csv      = self::csv_from_parallel_result( $parallel_results, 'domain_organic', $errors );

		$current_row = is_string( $rank_csv ) ? self::pick_rank_row( $rank_csv, $domain ) : null;
		$compare_row = is_string( $compare_rank_csv ) ? self::pick_rank_row( $compare_rank_csv, $domain ) : null;

		$current  = self::metrics_from_rank_row( $current_row );
		$compare  = self::metrics_from_rank_row( $compare_row );
		$history  = is_string( $history_csv ) ? self::extract_history_from_csv( $history_csv ) : array();
		$keywords = is_string( $kw_csv )
			? Neo_Pulse_App_Semrush_Competitor_Shared::extract_top_keywords_from_csv( $kw_csv, self::KEYWORDS_LIMIT )
			: array();

		$has_data = $current !== null || $history !== array() || $keywords !== array();
		if ( ! $has_data && $errors !== array() ) {
			$first = $errors[0]['message'] ?? 'Semrush fetch failed';
			return array(
				'status'  => 'error',
				'payload' => self::payload_with_project_context(
					array(
						'skipped' => true,
						'reason'  => 'semrush_error',
						'error'   => (string) $first,
						'database' => $database,
						'domain'   => $domain,
						'errors'   => $errors,
					),
					$project_id,
					$database,
					$domain
				),
			);
		}

		$comparisons = self::build_comparisons( $current, $compare );

		return array(
			'status'  => $has_data ? 'ok' : 'skipped',
			'payload' => self::payload_with_project_context(
				array(
					'success'      => $has_data,
					'database'     => $database,
					'domain'       => $domain,
					'overviewUrl'  => self::overview_url( $domain, $database ),
					'current'      => $current,
					'compare'      => $compare,
					'comparisons'  => $comparisons,
					'history'      => $history,
					'topKeywords'  => $keywords,
					'errors'       => $errors,
				),
				$project_id,
				$database,
				$domain
			),
		);
	}

	/**
	 * @param array<string,mixed> $payload
	 * @return array<string,mixed>
	 */
	private static function payload_with_project_context(
		array $payload,
		string $project_id,
		string $database,
		string $domain
	): array {
		if ( $project_id !== '' ) {
			$payload['projectId'] = $project_id;
			$payload['projectDashboardUrl'] = self::seo_project_dashboard_url( $project_id );
		}
		if ( ! isset( $payload['overviewUrl'] ) || trim( (string) ( $payload['overviewUrl'] ?? '' ) ) === '' ) {
			if ( $domain !== '' ) {
				$payload['overviewUrl'] = self::overview_url( $domain, $database );
			} elseif ( $project_id !== '' ) {
				$payload['overviewUrl'] = self::seo_project_dashboard_url( $project_id );
			}
		}
		return $payload;
	}

	private static function seo_project_dashboard_url( string $project_id ): string {
		$id = trim( $project_id );
		if ( $id === '' ) {
			return '';
		}
		return 'https://www.semrush.com/seo/' . rawurlencode( $id ) . '/';
	}

	/**
	 * @param array<string,mixed>|null $current
	 * @param array<string,mixed>|null $compare
	 * @return array<string,?float>
	 */
	private static function build_comparisons( ?array $current, ?array $compare ): array {
		if ( $current === null || $compare === null ) {
			return array();
		}
		return array(
			'keywordsChangePercent'   => self::pct_change( $current['organicKeywords'] ?? null, $compare['organicKeywords'] ?? null ),
			'trafficChangePercent'    => self::pct_change( $current['organicTraffic'] ?? null, $compare['organicTraffic'] ?? null ),
			'trafficCostChangePercent' => self::pct_change( $current['trafficCost'] ?? null, $compare['trafficCost'] ?? null ),
		);
	}

	/**
	 * @param float|int|null $current
	 * @param float|int|null $previous
	 */
	private static function pct_change( $current, $previous ): ?float {
		if ( $current === null || $previous === null || ! is_numeric( $current ) || ! is_numeric( $previous ) ) {
			return null;
		}
		$prev = (float) $previous;
		$cur  = (float) $current;
		if ( $prev === 0.0 ) {
			return null;
		}
		return ( ( $cur - $prev ) / $prev ) * 100.0;
	}

	/**
	 * @param array{domain:string,organicTraffic:?float,trafficCost:?float,organicKeywords:?float,adsKeywords:?float}|null $row
	 * @return array<string,?float>|null
	 */
	private static function metrics_from_rank_row( ?array $row ): ?array {
		if ( $row === null ) {
			return null;
		}
		$branded = isset( $row['brandedTraffic'] ) ? $row['brandedTraffic'] : null;
		$non     = isset( $row['nonBrandedTraffic'] ) ? $row['nonBrandedTraffic'] : null;
		$out     = array(
			'organicKeywords' => $row['organicKeywords'] ?? null,
			'organicTraffic'  => $row['organicTraffic'] ?? null,
			'trafficCost'     => $row['trafficCost'] ?? null,
		);
		if ( $branded !== null ) {
			$out['brandedTraffic'] = $branded;
		}
		if ( $non !== null ) {
			$out['nonBrandedTraffic'] = $non;
		}
		return $out;
	}

	/**
	 * @return array{domain:string,competitionLevel:?float,commonKeywords:?float,organicTraffic:?float,trafficCost:?float,organicKeywords:?float,adsKeywords:?float,brandedTraffic:?float,nonBrandedTraffic:?float}|null
	 */
	private static function pick_rank_row( string $csv, string $seed_domain ): ?array {
		$rows = Neo_Pulse_App_Semrush_Competitor_Shared::extract_competitor_rows( $csv );
		$sd   = Neo_Pulse_App_Semrush_Competitor_Shared::clean_domain_key( $seed_domain );
		foreach ( $rows as $row ) {
			if ( Neo_Pulse_App_Semrush_Competitor_Shared::clean_domain_key( $row['domain'] ) === $sd ) {
				return self::enrich_rank_row_branded( $row, $csv );
			}
		}
		$first = $rows[0] ?? null;
		return $first !== null ? self::enrich_rank_row_branded( $first, $csv ) : null;
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>
	 */
	private static function enrich_rank_row_branded( array $row, string $csv ): array {
		$parsed = Neo_Pulse_App_Semrush_Table_Parse::rows_from_csv_text( $csv );
		if ( $parsed === array() ) {
			return $row;
		}
		$m = Neo_Pulse_App_Semrush_Table_Parse::record_keys_lower( $parsed[0] );
		$branded = Neo_Pulse_App_Semrush_Table_Parse::num(
			$m['serp_features_branded_traffic'] ?? $m['sfb'] ?? $m['branded_traffic'] ?? null
		);
		$non_branded = Neo_Pulse_App_Semrush_Table_Parse::num(
			$m['non_branded_traffic'] ?? $m['nonbranded_traffic'] ?? null
		);
		if ( $branded !== null ) {
			$row['brandedTraffic'] = $branded;
		}
		if ( $non_branded !== null ) {
			$row['nonBrandedTraffic'] = $non_branded;
		}
		return $row;
	}

	/**
	 * @param array<string,string|WP_Error> $parallel_results
	 * @param array<int,array{step:string,message:string}> $errors
	 */
	private static function csv_from_parallel_result( array $parallel_results, string $step, array &$errors ): ?string {
		if ( ! isset( $parallel_results[ $step ] ) ) {
			return null;
		}
		$result = $parallel_results[ $step ];
		if ( is_wp_error( $result ) ) {
			$errors[] = array(
				'step'    => $step,
				'message' => $result->get_error_message(),
			);
			return null;
		}
		return (string) $result;
	}

	/**
	 * @param array<int,array{step:string,message:string}> $errors
	 */
	private static function request_report(
		string $type,
		string $database,
		string $domain,
		array $extra,
		array &$errors,
		string $step
	): ?string {
		$params = array_merge(
			array(
				'type'     => $type,
				'database' => $database,
				'domain'   => $domain,
			),
			$extra
		);
		$result = Neo_Pulse_App_Semrush_Client::request_report( $params );
		if ( is_wp_error( $result ) ) {
			$errors[] = array(
				'step'    => $step,
				'message' => $result->get_error_message(),
			);
			return null;
		}
		return (string) $result;
	}

	/**
	 * @return array<int,array{month:string,organicTraffic:?float,organicKeywords:?float,trafficCost:?float}>
	 */
	private static function extract_history_from_csv( string $csv ): array {
		$rows = Neo_Pulse_App_Semrush_Table_Parse::rows_from_csv_text( $csv );
		$out  = array();
		foreach ( $rows as $row ) {
			$m = Neo_Pulse_App_Semrush_Table_Parse::record_keys_lower( $row );
			$date_raw = '';
			foreach ( array( 'dt', 'date', 'month' ) as $k ) {
				if ( ! empty( $m[ $k ] ) ) {
					$date_raw = trim( (string) $m[ $k ] );
					break;
				}
			}
			if ( $date_raw === '' ) {
				continue;
			}
			$month = self::normalize_history_month( $date_raw );
			if ( $month === '' ) {
				continue;
			}
			$traffic  = self::history_metric_num(
				$m,
				array( 'or', 'organic_traffic', 'organic traffic', 'traffic' )
			);
			$cost     = self::history_metric_num(
				$m,
				array( 'ot', 'traffic_cost', 'organic cost', 'organic traffic_cost', 'traffic_value' )
			);
			$keywords = self::history_metric_num(
				$m,
				array( 'oc', 'organic_keywords', 'organic keywords' )
			);
			$out[]    = array(
				'month'           => $month,
				'organicTraffic'  => $traffic,
				'organicKeywords' => $keywords,
				'trafficCost'     => $cost,
			);
		}
		usort(
			$out,
			static function ( $a, $b ) {
				return strcmp( (string) $a['month'], (string) $b['month'] );
			}
		);
		return $out;
	}

	/**
	 * @param array<string,string> $row_lower
	 * @param string[]             $keys
	 */
	private static function history_metric_num( array $row_lower, array $keys ): ?float {
		foreach ( $keys as $k ) {
			$kk = strtolower( $k );
			if ( ! isset( $row_lower[ $kk ] ) || trim( (string) $row_lower[ $kk ] ) === '' ) {
				$us = str_replace( ' ', '_', $kk );
				if ( ! isset( $row_lower[ $us ] ) || trim( (string) $row_lower[ $us ] ) === '' ) {
					continue;
				}
				return Neo_Pulse_App_Semrush_Table_Parse::num( $row_lower[ $us ] );
			}
			return Neo_Pulse_App_Semrush_Table_Parse::num( $row_lower[ $kk ] );
		}
		return null;
	}

	private static function normalize_history_month( string $raw ): string {
		if ( preg_match( '/^(\d{4})-(\d{2})/', $raw, $m ) ) {
			return $m[1] . '-' . $m[2];
		}
		if ( preg_match( '/^(\d{4})(\d{2})(\d{2})$/', $raw, $m ) ) {
			return $m[1] . '-' . $m[2];
		}
		return '';
	}

	private static function semrush_display_date_from_ymd( string $end_ymd ): string {
		if ( ! preg_match( '/^(\d{4})-(\d{2})-\d{2}$/', $end_ymd, $m ) ) {
			return '';
		}
		// Classic Analytics API expects YYYYMM15 (mid-month snapshot for compare period).
		return sprintf( '%s%s15', $m[1], $m[2] );
	}

	private static function overview_url( string $domain, string $database ): string {
		$q = rawurlencode( preg_replace( '/^www\./i', '', trim( $domain ) ) );
		$d = rawurlencode( trim( $database ) );
		return 'https://www.semrush.com/analytics/overview/?searchType=domain&q=' . $q . '&db=' . $d;
	}
}
