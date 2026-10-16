<?php
/**
 * Overseer — dashboard aggregates and analysis queries
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Overseer_Aggregates {

	public static function aggregate_summary( string $date_from, string $date_to ): array {
		$empty = array(
			'sessions'              => 0,
			'pageviews'             => 0,
			'page_exits'            => 0,
			'avg_time_on_page_sec'  => 0,
			'avg_active_time_sec'   => 0,
			'avg_scroll_pct'        => 0,
			'avg_page_load_ms'      => 0,
			'bounce_rate_pct'       => 0,
			'avg_session_duration_sec' => 0,
			'clicks'                => 0,
			'form_submits'          => 0,
			'conversions'           => 0,
			'exit_capture_rate_pct' => 0,
		);

		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_from ) || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_to ) ) {
			return $empty;
		}

		global $wpdb;
		$table     = Neo_Pulse_Wp_Overseer_Context::table_name();
		$from_sql  = $date_from . ' 00:00:00';
		$to_sql    = $date_to . ' 23:59:59';

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$counts = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT
					COUNT(DISTINCT session_id) AS sessions,
					SUM(CASE WHEN event_type = 'pageview' THEN 1 ELSE 0 END) AS pageviews,
					SUM(CASE WHEN event_type = 'page_exit' THEN 1 ELSE 0 END) AS page_exits,
					SUM(CASE WHEN event_type IN ('click','outbound_click') THEN 1 ELSE 0 END) AS clicks,
					SUM(CASE WHEN event_type = 'form_submit' THEN 1 ELSE 0 END) AS form_submits,
					SUM(CASE WHEN event_type = 'conversion' THEN 1 ELSE 0 END) AS conversions,
					AVG(CASE WHEN event_type = 'pageview' AND page_load_ms > 0 THEN page_load_ms ELSE NULL END) AS avg_page_load_ms,
					AVG(CASE WHEN event_type = 'page_exit' AND scroll_depth_pct > 0 THEN scroll_depth_pct ELSE NULL END) AS avg_scroll_pct
				FROM {$table}
				WHERE created_at >= %s AND created_at <= %s",
				$from_sql,
				$to_sql
			)
		);

		$sessions   = $counts && isset( $counts->sessions ) ? (int) $counts->sessions : 0;
		$pageviews  = $counts && isset( $counts->pageviews ) ? (int) $counts->pageviews : 0;
		$page_exits = $counts && isset( $counts->page_exits ) ? (int) $counts->page_exits : 0;
		$clicks     = $counts && isset( $counts->clicks ) ? (int) $counts->clicks : 0;
		$forms      = $counts && isset( $counts->form_submits ) ? (int) $counts->form_submits : 0;
		$conversions = $counts && isset( $counts->conversions ) ? (int) $counts->conversions : 0;
		$avg_load   = $counts && isset( $counts->avg_page_load_ms ) ? (int) round( (float) $counts->avg_page_load_ms ) : 0;
		$avg_scroll = $counts && isset( $counts->avg_scroll_pct ) ? (int) round( (float) $counts->avg_scroll_pct ) : 0;

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$engagement = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT
					AVG(best_duration) AS avg_duration_ms,
					AVG(best_active) AS avg_active_ms
				FROM (
					SELECT parent_visit_uid,
						MAX(duration_ms) AS best_duration,
						MAX(active_duration_ms) AS best_active
					FROM {$table}
					WHERE created_at >= %s AND created_at <= %s
					AND event_type IN ('page_exit','page_heartbeat')
					AND parent_visit_uid != ''
					GROUP BY parent_visit_uid
				) eng",
				$from_sql,
				$to_sql
			)
		);

		$avg_time_sec   = $engagement && isset( $engagement->avg_duration_ms ) ? (int) round( (float) $engagement->avg_duration_ms / 1000 ) : 0;
		$avg_active_sec = $engagement && isset( $engagement->avg_active_ms ) ? (int) round( (float) $engagement->avg_active_ms / 1000 ) : 0;

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$bounce_row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT
					COUNT(*) AS total_sessions,
					SUM(CASE WHEN pageviews = 1 THEN 1 ELSE 0 END) AS bounce_sessions
				FROM (
					SELECT session_id, SUM(CASE WHEN event_type = 'pageview' THEN 1 ELSE 0 END) AS pageviews
					FROM {$table}
					WHERE created_at >= %s AND created_at <= %s
					GROUP BY session_id
				) s",
				$from_sql,
				$to_sql
			)
		);

		$total_sessions  = $bounce_row && isset( $bounce_row->total_sessions ) ? (int) $bounce_row->total_sessions : 0;
		$bounce_sessions = $bounce_row && isset( $bounce_row->bounce_sessions ) ? (int) $bounce_row->bounce_sessions : 0;
		$bounce_rate     = $total_sessions > 0 ? (int) round( ( $bounce_sessions / $total_sessions ) * 100 ) : 0;

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$session_span = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT AVG(span_sec) AS avg_session_sec FROM (
					SELECT session_id,
						TIMESTAMPDIFF(SECOND, MIN(created_at), MAX(created_at)) AS span_sec
					FROM {$table}
					WHERE created_at >= %s AND created_at <= %s
					GROUP BY session_id
				) spans",
				$from_sql,
				$to_sql
			)
		);
		$avg_session_sec = $session_span && isset( $session_span->avg_session_sec ) ? (int) round( (float) $session_span->avg_session_sec ) : 0;

		$exit_capture = $pageviews > 0 ? (int) round( ( $page_exits / $pageviews ) * 100 ) : 0;

		return array(
			'sessions'                 => $sessions,
			'pageviews'                => $pageviews,
			'page_exits'               => $page_exits,
			'avg_time_on_page_sec'     => $avg_time_sec,
			'avg_active_time_sec'      => $avg_active_sec,
			'avg_scroll_pct'           => $avg_scroll,
			'avg_page_load_ms'         => $avg_load,
			'bounce_rate_pct'          => $bounce_rate,
			'avg_session_duration_sec' => $avg_session_sec,
			'clicks'                   => $clicks,
			'form_submits'             => $forms,
			'conversions'              => $conversions,
			'exit_capture_rate_pct'    => $exit_capture,
		);
	}
	public static function aggregate_by_page( string $date_from, string $date_to ): array {
		global $wpdb;
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_from ) || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_to ) ) {
			return array();
		}
		$table    = Neo_Pulse_Wp_Overseer_Context::table_name();
		$from_sql = $date_from . ' 00:00:00';
		$to_sql   = $date_to . ' 23:59:59';
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT pv.page_url,
					COUNT(*) AS pageviews,
					AVG(CASE WHEN pv.page_load_ms > 0 THEN pv.page_load_ms ELSE NULL END) AS avg_page_load_ms,
					AVG(eng.best_duration_ms) AS avg_duration_ms,
					AVG(eng.best_active_ms) AS avg_active_ms,
					AVG(eng.best_scroll_pct) AS avg_scroll_pct,
					SUM(CASE WHEN eng.best_duration_ms > 0 THEN 1 ELSE 0 END) AS exits_captured
				FROM {$table} pv
				LEFT JOIN (
					SELECT parent_visit_uid,
						MAX(duration_ms) AS best_duration_ms,
						MAX(active_duration_ms) AS best_active_ms,
						MAX(scroll_depth_pct) AS best_scroll_pct
					FROM {$table}
					WHERE event_type IN ('page_exit','page_heartbeat')
					AND parent_visit_uid != ''
					AND created_at >= %s AND created_at <= %s
					GROUP BY parent_visit_uid
				) eng ON eng.parent_visit_uid = pv.visit_uid
				WHERE pv.event_type = 'pageview'
				AND pv.created_at >= %s AND pv.created_at <= %s
				GROUP BY pv.page_url
				ORDER BY pageviews DESC
				LIMIT 50",
				$from_sql,
				$to_sql,
				$from_sql,
				$to_sql
			)
		);
		if ( ! is_array( $rows ) ) {
			return array();
		}

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$interaction_rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT page_url,
					SUM(CASE WHEN event_type IN ('click','outbound_click') THEN 1 ELSE 0 END) AS clicks,
					SUM(CASE WHEN event_type = 'form_submit' THEN 1 ELSE 0 END) AS form_submits
				FROM {$table}
				WHERE created_at >= %s AND created_at <= %s
				AND event_type IN ('click','outbound_click','form_submit')
				GROUP BY page_url",
				$from_sql,
				$to_sql
			)
		);
		$interactions = array();
		if ( is_array( $interaction_rows ) ) {
			foreach ( $interaction_rows as $ir ) {
				$interactions[ (string) $ir->page_url ] = $ir;
			}
		}

		foreach ( $rows as $row ) {
			$url = (string) $row->page_url;
			if ( isset( $interactions[ $url ] ) ) {
				$row->clicks       = (int) $interactions[ $url ]->clicks;
				$row->form_submits = (int) $interactions[ $url ]->form_submits;
			} else {
				$row->clicks       = 0;
				$row->form_submits = 0;
			}
			$pageviews = isset( $row->pageviews ) ? (int) $row->pageviews : 0;
			$captured  = isset( $row->exits_captured ) ? (int) $row->exits_captured : 0;
			$row->exit_rate_pct = $pageviews > 0 ? (int) round( ( $captured / $pageviews ) * 100 ) : 0;
		}
		return $rows;
	}
	public static function aggregate_paths( string $date_from, string $date_to ): array {
		global $wpdb;
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_from ) || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_to ) ) {
			return array();
		}
		$table = Neo_Pulse_Wp_Overseer_Context::table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$sessions = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT DISTINCT session_id FROM {$table}
				WHERE created_at >= %s AND created_at <= %s
				AND event_type = 'pageview'
				ORDER BY session_id ASC
				LIMIT 500",
				$date_from . ' 00:00:00',
				$date_to . ' 23:59:59'
			)
		);
		if ( ! is_array( $sessions ) || empty( $sessions ) ) {
			return array();
		}

		$path_counts = array();
		foreach ( $sessions as $session_id ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$urls = $wpdb->get_col(
				$wpdb->prepare(
					"SELECT page_url FROM {$table}
					WHERE session_id = %s AND event_type = 'pageview'
					ORDER BY created_at ASC, id ASC
					LIMIT 5",
					$session_id
				)
			);
			if ( ! is_array( $urls ) || count( $urls ) < 2 ) {
				continue;
			}
			$paths = array();
			for ( $i = 0; $i < count( $urls ) - 1; $i++ ) {
				$paths[] = self::normalize_path_url( (string) $urls[ $i ] ) . ' → ' . self::normalize_path_url( (string) $urls[ $i + 1 ] );
			}
			if ( count( $urls ) >= 3 ) {
				$paths[] = self::normalize_path_url( (string) $urls[0] ) . ' → ' . self::normalize_path_url( (string) $urls[1] ) . ' → ' . self::normalize_path_url( (string) $urls[2] );
			}
			foreach ( $paths as $path ) {
				if ( ! isset( $path_counts[ $path ] ) ) {
					$path_counts[ $path ] = 0;
				}
				++$path_counts[ $path ];
			}
		}

		arsort( $path_counts );
		$out = array();
		foreach ( array_slice( $path_counts, 0, 30, true ) as $path => $count ) {
			$out[] = array(
				'path'  => $path,
				'count' => (int) $count,
			);
		}
		return $out;
	}
	public static function fetch_events_for_analysis( string $date_from, string $date_to ): array {
		// Newest MAX_ANALYSIS events in the range (the list query caps pages at 200), oldest first.
		return Neo_Pulse_Wp_Overseer_Query::query_for_analysis( $date_from, $date_to );
	}
	public static function count_sessions_in_range( string $date_from, string $date_to ): int {
		global $wpdb;
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_from ) || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_to ) ) {
			return 0;
		}
		$table = Neo_Pulse_Wp_Overseer_Context::table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(DISTINCT session_id) FROM {$table} WHERE created_at >= %s AND created_at <= %s",
				$date_from . ' 00:00:00',
				$date_to . ' 23:59:59'
			)
		);
	}
	public static function normalize_path_url( string $url ): string {
		$path = wp_parse_url( $url, PHP_URL_PATH );
		if ( ! is_string( $path ) || $path === '' ) {
			return '/';
		}
		return $path;
	}
	public static function top_clicked_links( string $date_from, string $date_to ): array {
		global $wpdb;
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_from ) || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_to ) ) {
			return array();
		}
		$table = Neo_Pulse_Wp_Overseer_Context::table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT element_href, element_text, page_url, COUNT(*) AS click_count
				FROM {$table}
				WHERE created_at >= %s AND created_at <= %s
				AND event_type IN ('click','outbound_click')
				AND element_href != ''
				GROUP BY element_href, element_text, page_url
				ORDER BY click_count DESC
				LIMIT 30",
				$date_from . ' 00:00:00',
				$date_to . ' 23:59:59'
			)
		);
		return is_array( $rows ) ? $rows : array();
	}
}
