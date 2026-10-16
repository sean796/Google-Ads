<?php
/**
 * Overseer — visit queries and session timelines
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Overseer_Query {

	/** Row caps: admin list pages, AI analysis, CSV export. */
	const MAX_PER_PAGE     = 200;
	const MAX_ANALYSIS     = 5000;
	const MAX_EXPORT       = 50000;
	const COUNT_TRANSIENT  = 'neo_pulse_wp_overseer_visit_count';
	const COUNT_TTL        = 600;

	/**
	 * One page of events for the admin list (at most MAX_PER_PAGE rows).
	 *
	 * @param array<string,mixed> $args Filters, order and paging.
	 * @return array{items: array<int, object>, total: int}
	 */
	public static function query( array $args = array() ): array {
		return self::run_query( $args, self::MAX_PER_PAGE, true );
	}

	/**
	 * Newest events in a date range for AI analysis (at most MAX_ANALYSIS), returned oldest first.
	 *
	 * @return array<int, object>
	 */
	public static function query_for_analysis( string $date_from, string $date_to ): array {
		$result = self::run_query(
			array(
				'date_from' => $date_from,
				'date_to'   => $date_to,
				'per_page'  => self::MAX_ANALYSIS,
				'page'      => 1,
				'orderby'   => 'created_at',
				'order'     => 'desc',
			),
			self::MAX_ANALYSIS,
			false
		);
		return array_reverse( $result['items'] );
	}

	/**
	 * @param array<string,mixed> $args      Filters, order and paging.
	 * @param int                 $max       Largest page size allowed.
	 * @param bool                $with_total Also count matching rows.
	 * @return array{items: array<int, object>, total: int}
	 */
	private static function run_query( array $args, int $max, bool $with_total ): array {
		global $wpdb;

		$table  = Neo_Pulse_Wp_Overseer_Context::table_name();
		$where  = array( '1=1' );
		$params = array();

		$session = isset( $args['session_id'] ) ? sanitize_text_field( (string) $args['session_id'] ) : '';
		if ( $session !== '' ) {
			$where[]  = 'session_id LIKE %s';
			$params[] = '%' . $wpdb->esc_like( $session ) . '%';
		}

		$date_from = isset( $args['date_from'] ) ? sanitize_text_field( (string) $args['date_from'] ) : '';
		if ( $date_from !== '' && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_from ) ) {
			$where[]  = 'created_at >= %s';
			$params[] = $date_from . ' 00:00:00';
		}

		$date_to = isset( $args['date_to'] ) ? sanitize_text_field( (string) $args['date_to'] ) : '';
		if ( $date_to !== '' && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_to ) ) {
			$where[]  = 'created_at <= %s';
			$params[] = $date_to . ' 23:59:59';
		}

		$search = isset( $args['search'] ) ? sanitize_text_field( (string) $args['search'] ) : '';
		if ( $search !== '' ) {
			$like     = '%' . $wpdb->esc_like( $search ) . '%';
			$where[]  = '(page_url LIKE %s OR page_title LIKE %s OR ip_address LIKE %s OR session_id LIKE %s)';
			$params[] = $like;
			$params[] = $like;
			$params[] = $like;
			$params[] = $like;
		}

		$event_type = isset( $args['event_type'] ) ? sanitize_key( (string) $args['event_type'] ) : '';
		if ( $event_type !== '' && in_array( $event_type, Neo_Pulse_Wp_Overseer_Context::ALLOWED_EVENT_TYPES, true ) ) {
			$where[]  = 'event_type = %s';
			$params[] = $event_type;
		}

		$where_sql = implode( ' AND ', $where );

		$total = 0;
		if ( $with_total ) {
			$count_sql = "SELECT COUNT(*) FROM {$table} WHERE {$where_sql}";
			if ( ! empty( $params ) ) {
				// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
				$total = (int) $wpdb->get_var( $wpdb->prepare( $count_sql, $params ) );
			} else {
				// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
				$total = (int) $wpdb->get_var( $count_sql );
			}
		}

		$orderby = isset( $args['orderby'] ) ? sanitize_key( (string) $args['orderby'] ) : 'created_at';
		$allowed = array(
			'session_id' => 'session_id',
			'page_url'   => 'page_url',
			'device'     => 'device',
			'created_at' => 'created_at',
		);
		$order_col = isset( $allowed[ $orderby ] ) ? $allowed[ $orderby ] : 'created_at';
		$order     = isset( $args['order'] ) && 'asc' === strtolower( (string) $args['order'] ) ? 'ASC' : 'DESC';

		$per_page = isset( $args['per_page'] ) ? max( 1, min( $max, (int) $args['per_page'] ) ) : 20;
		$page     = isset( $args['page'] ) ? max( 1, (int) $args['page'] ) : 1;
		$offset   = ( $page - 1 ) * $per_page;

		$list_sql    = "SELECT * FROM {$table} WHERE {$where_sql} ORDER BY {$order_col} {$order} LIMIT %d OFFSET %d";
		$list_params = array_merge( $params, array( $per_page, $offset ) );

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		$items = $wpdb->get_results( $wpdb->prepare( $list_sql, $list_params ) );

		$items = is_array( $items ) ? $items : array();

		return array(
			'items' => $items,
			'total' => $with_total ? $total : count( $items ),
		);
	}

	/**
	 * Rows for CSV export (at most MAX_EXPORT).
	 *
	 * @param array<string,mixed> $args Filters and order.
	 * @return array<int, object>
	 */
	public static function query_for_export( array $args = array() ): array {
		$args['per_page'] = isset( $args['per_page'] ) ? (int) $args['per_page'] : self::MAX_EXPORT;
		$args['page']     = 1;
		$result           = self::run_query( $args, self::MAX_EXPORT, false );
		return $result['items'];
	}

	/**
	 * Total stored events (cached for 10 minutes; cleared when visits are deleted).
	 */
	public static function count_visits(): int {
		$cached = get_transient( self::COUNT_TRANSIENT );
		if ( false !== $cached && is_numeric( $cached ) ) {
			return (int) $cached;
		}
		global $wpdb;
		$table = Neo_Pulse_Wp_Overseer_Context::table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
		set_transient( self::COUNT_TRANSIENT, $count, self::COUNT_TTL );
		return $count;
	}

	/**
	 * Drop the cached count_visits() value.
	 */
	public static function forget_count(): void {
		delete_transient( self::COUNT_TRANSIENT );
	}
	public static function get_session_timeline( string $session_id ): array {
		global $wpdb;
		$session_id = sanitize_text_field( $session_id );
		if ( $session_id === '' || ! Neo_Pulse_Wp_Overseer_Context::is_valid_session_id( $session_id ) ) {
			return array();
		}
		$table = Neo_Pulse_Wp_Overseer_Context::table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$items = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE session_id = %s ORDER BY created_at ASC, id ASC",
				$session_id
			)
		);
		return is_array( $items ) ? $items : array();
	}
	public static function get_session_summary( string $session_id ) {
		$timeline = self::get_session_timeline( $session_id );
		if ( empty( $timeline ) ) {
			return null;
		}
		$first     = $timeline[0];
		$pageviews = array_filter(
			$timeline,
			static function ( $row ) {
				return isset( $row->event_type ) && 'pageview' === (string) $row->event_type;
			}
		);
		$pages_viewed = count( $pageviews );

		$engagement_by_parent = self::build_engagement_map_from_events( $timeline );

		$total_duration_ms = 0;
		$active_duration_ms = 0;
		foreach ( $pageviews as $pv ) {
			$uid = isset( $pv->visit_uid ) ? (string) $pv->visit_uid : '';
			if ( $uid === '' || ! isset( $engagement_by_parent[ $uid ] ) ) {
				continue;
			}
			$eng = $engagement_by_parent[ $uid ];
			$total_duration_ms  += (int) $eng['duration_ms'];
			$active_duration_ms += (int) $eng['active_duration_ms'];
		}

		$started_ts = isset( $first->created_at ) ? strtotime( $first->created_at . ' UTC' ) : false;
		$last       = $timeline[ count( $timeline ) - 1 ];
		$ended_ts   = isset( $last->created_at ) ? strtotime( $last->created_at . ' UTC' ) : false;
		$session_span_sec = 0;
		if ( $started_ts && $ended_ts && $ended_ts >= $started_ts ) {
			$session_span_sec = (int) ( $ended_ts - $started_ts );
		}

		$total_duration_sec  = $total_duration_ms > 0 ? (int) round( $total_duration_ms / 1000 ) : $session_span_sec;
		$active_duration_sec = (int) round( $active_duration_ms / 1000 );
		$avg_time_per_page_sec = $pages_viewed > 0 && $total_duration_ms > 0
			? (int) round( ( $total_duration_ms / 1000 ) / $pages_viewed )
			: 0;

		return (object) array(
			'session_id'            => $session_id,
			'first_event'           => $first,
			'event_count'           => count( $timeline ),
			'pageviews'             => $pages_viewed,
			'pages_viewed'          => $pages_viewed,
			'device'                => isset( $first->device ) ? (string) $first->device : '',
			'ip_address'            => isset( $first->ip_address ) ? (string) $first->ip_address : '',
			'started_at'            => isset( $first->created_at ) ? (string) $first->created_at : '',
			'ended_at'              => isset( $last->created_at ) ? (string) $last->created_at : '',
			'total_duration_sec'    => $total_duration_sec,
			'active_duration_sec'   => $active_duration_sec,
			'avg_time_per_page_sec' => $avg_time_per_page_sec,
			'is_bounce'             => 1 === $pages_viewed,
		);
	}
	public static function build_engagement_map_from_events( array $events ): array {
		$map = array();
		foreach ( $events as $row ) {
			if ( ! is_object( $row ) ) {
				continue;
			}
			$type = isset( $row->event_type ) ? (string) $row->event_type : '';
			if ( ! in_array( $type, array( 'page_exit', 'page_heartbeat' ), true ) ) {
				continue;
			}
			$parent = isset( $row->parent_visit_uid ) ? (string) $row->parent_visit_uid : '';
			if ( $parent === '' || ! Neo_Pulse_Wp_Overseer_Context::is_valid_uuid( $parent ) ) {
				continue;
			}
			$duration = isset( $row->duration_ms ) ? (int) $row->duration_ms : 0;
			$active   = isset( $row->active_duration_ms ) ? (int) $row->active_duration_ms : 0;
			$scroll   = isset( $row->scroll_depth_pct ) ? (int) $row->scroll_depth_pct : 0;
			if ( ! isset( $map[ $parent ] ) ) {
				$map[ $parent ] = array(
					'duration_ms'        => 0,
					'active_duration_ms' => 0,
					'scroll_depth_pct'   => 0,
				);
			}
			if ( $duration > $map[ $parent ]['duration_ms'] ) {
				$map[ $parent ]['duration_ms'] = $duration;
			}
			if ( $active > $map[ $parent ]['active_duration_ms'] ) {
				$map[ $parent ]['active_duration_ms'] = $active;
			}
			if ( $scroll > $map[ $parent ]['scroll_depth_pct'] ) {
				$map[ $parent ]['scroll_depth_pct'] = $scroll;
			}
		}
		return $map;
	}
	public static function get_engagement_by_visit_uids( array $visit_uids ): array {
		global $wpdb;
		$visit_uids = array_values(
			array_filter(
				array_map(
					static function ( $uid ) {
						$uid = sanitize_text_field( (string) $uid );
						return Neo_Pulse_Wp_Overseer_Context::is_valid_uuid( $uid ) ? $uid : '';
					},
					$visit_uids
				)
			)
		);
		if ( empty( $visit_uids ) ) {
			return array();
		}

		$table    = Neo_Pulse_Wp_Overseer_Context::table_name();
		$placeholders = implode( ',', array_fill( 0, count( $visit_uids ), '%s' ) );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared, WordPress.DB.PreparedSQLPlaceholders.UnfinishedPlaceholder
		$sql = "SELECT event_type, parent_visit_uid, duration_ms, active_duration_ms, scroll_depth_pct
			FROM {$table}
			WHERE parent_visit_uid IN ({$placeholders})
			AND event_type IN ('page_exit','page_heartbeat')";

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, $visit_uids ) );
		if ( ! is_array( $rows ) ) {
			return array();
		}
		return self::build_engagement_map_from_events( $rows );
	}
}
