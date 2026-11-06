<?php
/**
 * Search Console date ranges, stats fetches, and cache flushing.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Gsc_Trait_Stats {

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
}
