<?php
/**
 * Overseer + Google Search Console correlation for AI analysis.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Overseer_Gsc {

	const GSC_CLICK_THRESHOLD = 5;

	/**
	 * @return array{merged: array<int, array<string, mixed>>, flags: array<int, array<string, mixed>>, gsc: array<string, mixed>|null, error: string}
	 */
	public static function merge_page_stats( string $date_from, string $date_to ): array {
		$overseer_by_path = array();
		foreach ( Neo_Pulse_Wp_Overseer::aggregate_by_page( $date_from, $date_to ) as $row ) {
			$path = Neo_Pulse_Wp_Overseer_Aggregates::normalize_path_url( (string) $row->page_url );
			$overseer_by_path[ $path ] = array(
				'on_site_views'    => (int) $row->pageviews,
				'avg_time_sec'     => isset( $row->avg_duration_ms ) ? (int) round( (float) $row->avg_duration_ms / 1000 ) : 0,
				'avg_active_sec'   => isset( $row->avg_active_ms ) ? (int) round( (float) $row->avg_active_ms / 1000 ) : 0,
				'avg_scroll_pct'   => isset( $row->avg_scroll_pct ) ? (int) round( (float) $row->avg_scroll_pct ) : 0,
				'exit_rate_pct'    => isset( $row->exit_rate_pct ) ? (int) $row->exit_rate_pct : 0,
				'on_site_clicks'   => (int) $row->clicks,
				'form_submits'     => (int) $row->form_submits,
			);
		}

		$gsc_data = Neo_Pulse_Wp_Gsc::fetch_stats_for_range( $date_from, $date_to, 30 );
		if ( is_wp_error( $gsc_data ) ) {
			return array(
				'merged' => self::build_merged_from_overseer_only( $overseer_by_path ),
				'flags'  => array(),
				'gsc'    => null,
				'error'  => $gsc_data->get_error_message(),
			);
		}

		$gsc_by_path = array();
		if ( ! empty( $gsc_data['topPages'] ) && is_array( $gsc_data['topPages'] ) ) {
			foreach ( $gsc_data['topPages'] as $page_row ) {
				if ( ! is_array( $page_row ) || empty( $page_row['page'] ) ) {
					continue;
				}
				$path = Neo_Pulse_Wp_Overseer_Aggregates::normalize_path_url( (string) $page_row['page'] );
				$gsc_by_path[ $path ] = array(
					'gsc_clicks'      => isset( $page_row['clicks'] ) ? (int) $page_row['clicks'] : 0,
					'gsc_impressions' => isset( $page_row['impressions'] ) ? (int) $page_row['impressions'] : 0,
					'gsc_position'    => isset( $page_row['position'] ) ? (float) $page_row['position'] : 0.0,
				);
			}
		}

		$all_paths = array_unique( array_merge( array_keys( $overseer_by_path ), array_keys( $gsc_by_path ) ) );
		$merged    = array();
		$flags     = array();

		foreach ( $all_paths as $path ) {
			$ov  = isset( $overseer_by_path[ $path ] ) ? $overseer_by_path[ $path ] : array(
				'on_site_views'  => 0,
				'avg_time_sec'   => 0,
				'avg_active_sec' => 0,
				'avg_scroll_pct' => 0,
				'exit_rate_pct'  => 0,
				'on_site_clicks' => 0,
				'form_submits'   => 0,
			);
			$gsc = isset( $gsc_by_path[ $path ] ) ? $gsc_by_path[ $path ] : array(
				'gsc_clicks'      => 0,
				'gsc_impressions' => 0,
				'gsc_position'    => 0.0,
			);

			$row = array_merge(
				array( 'path' => $path ),
				$gsc,
				$ov
			);
			$merged[] = $row;

			$flag = self::classify_mismatch( $row );
			if ( $flag !== '' ) {
				$flags[] = array(
					'path'  => $path,
					'flag'  => $flag,
					'row'   => $row,
				);
			}
		}

		usort(
			$merged,
			static function ( $a, $b ) {
				return ( $b['gsc_clicks'] ?? 0 ) <=> ( $a['gsc_clicks'] ?? 0 );
			}
		);

		return array(
			'merged' => $merged,
			'flags'  => $flags,
			'gsc'    => $gsc_data,
			'error'  => '',
		);
	}

	/**
	 * @param array<string, mixed> $merged  Merged rows.
	 * @param array<int, array<string, mixed>> $flags   Flagged rows.
	 * @param array<string, mixed>|null $gsc_data GSC payload.
	 */
	public static function format_gsc_context_for_prompt( array $merged, array $flags, ?array $gsc_data ): string {
		if ( empty( $gsc_data ) || empty( $gsc_data['ok'] ) ) {
			return "## Google Search Console\nGSC data unavailable for this range.\n";
		}

		$lines   = array( '## Google Search Console (search performance)' );
		$range   = isset( $gsc_data['dateRange'] ) && is_array( $gsc_data['dateRange'] ) ? $gsc_data['dateRange'] : array();
		$start   = isset( $range['start'] ) ? (string) $range['start'] : '';
		$end     = isset( $range['end'] ) ? (string) $range['end'] : '';
		$lines[] = 'Date range (lag-adjusted): ' . $start . ' to ' . $end;
		if ( ! empty( $range['note'] ) ) {
			$lines[] = (string) $range['note'];
		}

		$summary = isset( $gsc_data['summary'] ) && is_array( $gsc_data['summary'] ) ? $gsc_data['summary'] : array();
		$lines[] = sprintf(
			'Site totals: %d clicks, %d impressions, CTR %.2f%%, avg position %.1f',
			isset( $summary['clicks'] ) ? (int) $summary['clicks'] : 0,
			isset( $summary['impressions'] ) ? (int) $summary['impressions'] : 0,
			isset( $summary['ctr'] ) ? round( (float) $summary['ctr'] * 100, 2 ) : 0,
			isset( $summary['avgPosition'] ) ? (float) $summary['avgPosition'] : 0
		);

		$lines[] = '';
		$lines[] = 'Top search queries:';
		$queries = isset( $gsc_data['topQueries'] ) && is_array( $gsc_data['topQueries'] ) ? $gsc_data['topQueries'] : array();
		if ( empty( $queries ) ) {
			$lines[] = '- (none)';
		} else {
			foreach ( array_slice( $queries, 0, 25 ) as $q ) {
				if ( ! is_array( $q ) ) {
					continue;
				}
				$lines[] = sprintf(
					'- "%s" | %d clicks | %d impressions | pos %.1f',
					isset( $q['query'] ) ? (string) $q['query'] : '',
					isset( $q['clicks'] ) ? (int) $q['clicks'] : 0,
					isset( $q['impressions'] ) ? (int) $q['impressions'] : 0,
					isset( $q['position'] ) ? (float) $q['position'] : 0
				);
			}
		}

		$lines[] = '';
		$lines[] = 'Per-page search vs on-site engagement:';
		$count = 0;
		foreach ( $merged as $row ) {
			++$count;
			if ( $count > 40 ) {
				$lines[] = '… additional pages omitted …';
				break;
			}
			$lines[] = sprintf(
				'- %s | GSC: %d clicks, %d impr, pos %.1f | On-site: %d views, %ds avg, %ds active, %d%% scroll, %d%% exit capture, %d clicks',
				(string) $row['path'],
				(int) $row['gsc_clicks'],
				(int) $row['gsc_impressions'],
				(float) $row['gsc_position'],
				(int) $row['on_site_views'],
				(int) $row['avg_time_sec'],
				(int) $row['avg_active_sec'],
				(int) $row['avg_scroll_pct'],
				(int) $row['exit_rate_pct'],
				(int) $row['on_site_clicks']
			);
		}

		if ( ! empty( $flags ) ) {
			$lines[] = '';
			$lines[] = 'Flagged mismatches:';
			foreach ( array_slice( $flags, 0, 20 ) as $flag_row ) {
				$lines[] = '- ' . (string) $flag_row['path'] . ': ' . (string) $flag_row['flag'];
			}
		}

		return implode( "\n", $lines ) . "\n";
	}

	/**
	 * @param array<string, mixed> $overseer_by_path Paths keyed by path.
	 * @return array<int, array<string, mixed>>
	 */
	private static function build_merged_from_overseer_only( array $overseer_by_path ): array {
		$merged = array();
		foreach ( $overseer_by_path as $path => $ov ) {
			$merged[] = array_merge(
				array(
					'path'            => $path,
					'gsc_clicks'      => 0,
					'gsc_impressions' => 0,
					'gsc_position'    => 0.0,
				),
				$ov
			);
		}
		return $merged;
	}

	/**
	 * @param array<string, mixed> $row Merged row.
	 */
	private static function classify_mismatch( array $row ): string {
		$gsc_clicks = (int) ( $row['gsc_clicks'] ?? 0 );
		$views      = (int) ( $row['on_site_views'] ?? 0 );
		$time       = (int) ( $row['avg_time_sec'] ?? 0 );
		$active     = (int) ( $row['avg_active_sec'] ?? 0 );
		$scroll     = (int) ( $row['avg_scroll_pct'] ?? 0 );

		if ( $gsc_clicks >= self::GSC_CLICK_THRESHOLD && $views > 0 && ( $time < 10 || $active < 8 || $scroll < 20 ) ) {
			return 'high_gsc_low_engagement';
		}
		if ( $gsc_clicks >= self::GSC_CLICK_THRESHOLD && $views < 1 ) {
			return 'gsc_only';
		}
		if ( $gsc_clicks < 2 && $views >= 3 && $time >= 30 && $active >= 20 && $scroll >= 40 ) {
			return 'high_engagement_low_gsc';
		}
		return '';
	}
}
