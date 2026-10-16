<?php
/**
 * Weekly running totals behind the search widget's "Popular searches".
 *
 * Once a day (WP-Cron) every finished week (Monday to Sunday, site time zone) that isn't stored yet
 * is added up from the search log and kept as a small weekly total, so the counts survive the log's
 * retention clean-up. "Popular searches" is then built from the last WINDOW_WEEKS weeks added
 * together, once per new week, so visitors see what people search for over months rather than
 * whatever was searched last, and the list stays the same for the whole week.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

final class Neo_Pulse_Wp_Search_Weekly {

	const OPTION_WEEKS = 'neo_pulse_search_weekly_terms';
	const OPTION_LIST  = 'neo_pulse_search_popular_list';
	const CRON_HOOK    = 'neo_pulse_wp_search_weekly_terms';

	/** Weeks added together for the running total. */
	const WINDOW_WEEKS = 12;
	/** Weekly totals kept (older ones are dropped). */
	const KEEP_WEEKS = 26;
	/** Searches kept per week (the most popular). */
	const PER_WEEK = 100;
	/** Size of the stored list (widgets show up to this many). */
	const LIST_SIZE = 12;

	public static function init(): void {
		add_action( self::CRON_HOOK, array( __CLASS__, 'run' ) );
		add_action( 'init', array( __CLASS__, 'maybe_schedule' ) );
	}

	public static function maybe_schedule(): void {
		if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
			// First run soon after install/update, then daily.
			wp_schedule_event( time() + MINUTE_IN_SECONDS, 'daily', self::CRON_HOOK );
		}
	}

	/**
	 * Store any finished weeks not stored yet; rebuild the list when a new week arrived or none exists.
	 */
	public static function run(): void {
		if ( ! class_exists( 'Neo_Pulse_Wp_Search_Logs' ) ) {
			return;
		}
		$added = self::store_finished_weeks();
		$list  = get_option( self::OPTION_LIST );
		if ( $added || ! is_array( $list ) ) {
			self::rebuild_list();
		}
	}

	/**
	 * The stored list, or null until the first finished week has been stored.
	 *
	 * @return array<int, array{query: string, count: int}>|null
	 */
	public static function popular_terms( int $limit ): ?array {
		$list = get_option( self::OPTION_LIST );
		if ( ! is_array( $list ) || empty( $list['terms'] ) || ! is_array( $list['terms'] ) ) {
			return null;
		}
		return array_slice( $list['terms'], 0, max( 1, $limit ) );
	}

	/**
	 * Monday 00:00 (site time zone) of the week holding $now.
	 */
	private static function week_start( DateTimeImmutable $now ): DateTimeImmutable {
		$day = (int) $now->format( 'N' ); // 1 = Monday.
		return $now->setTime( 0, 0 )->modify( '-' . ( $day - 1 ) . ' days' );
	}

	/**
	 * @return bool Whether any week was added.
	 */
	public static function store_finished_weeks(): bool {
		global $wpdb;
		$table  = Neo_Pulse_Wp_Search_Logs::table_name();
		$oldest = $wpdb->get_var( "SELECT MIN(created_at) FROM {$table}" ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		if ( ! $oldest ) {
			return false;
		}
		$oldest_ts = strtotime( $oldest . ' UTC' );

		$weeks   = get_option( self::OPTION_WEEKS );
		$weeks   = is_array( $weeks ) ? $weeks : array();
		$utc     = new DateTimeZone( 'UTC' );
		$current = self::week_start( new DateTimeImmutable( 'now', wp_timezone() ) );
		$added   = false;

		for ( $i = 1; $i <= self::WINDOW_WEEKS; $i++ ) {
			$start = $current->modify( '-' . $i . ' weeks' );
			$key   = $start->format( 'Y-m-d' );
			if ( isset( $weeks[ $key ] ) ) {
				continue;
			}
			$end = $start->modify( '+1 week' );
			if ( $end->getTimestamp() <= $oldest_ts ) {
				break; // The log doesn't reach back this far.
			}
			$weeks[ $key ] = self::week_totals(
				$start->setTimezone( $utc )->format( 'Y-m-d H:i:s' ),
				$end->setTimezone( $utc )->format( 'Y-m-d H:i:s' )
			);
			$added = true;
		}

		if ( $added ) {
			krsort( $weeks );
			$weeks = array_slice( $weeks, 0, self::KEEP_WEEKS, true );
			update_option( self::OPTION_WEEKS, $weeks, false );
		}
		return $added;
	}

	/**
	 * One week's totals per search: different visitors, result clicks and searches.
	 *
	 * @return array<string, array{q: string, v: int, c: int, n: int}>
	 */
	private static function week_totals( string $from_utc, string $to_utc ): array {
		global $wpdb;
		$table = Neo_Pulse_Wp_Search_Logs::table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT MIN(query) AS query, query_normalized,
					COUNT(DISTINCT session_id) AS visitors,
					SUM(CASE WHEN accepted_url IS NOT NULL AND accepted_url != '' THEN 1 ELSE 0 END) AS clicks,
					COUNT(*) AS searches
				FROM {$table}
				WHERE created_at >= %s AND created_at < %s AND query_normalized != '' AND result_count > 0
				GROUP BY query_normalized
				ORDER BY (COUNT(DISTINCT session_id) + SUM(CASE WHEN accepted_url IS NOT NULL AND accepted_url != '' THEN 1 ELSE 0 END)) DESC, searches DESC
				LIMIT %d",
				$from_utc,
				$to_utc,
				self::PER_WEEK
			)
		);
		$out = array();
		foreach ( (array) $rows as $row ) {
			$out[ (string) $row->query_normalized ] = array(
				'q' => (string) $row->query,
				'v' => (int) $row->visitors,
				'c' => (int) $row->clicks,
				'n' => (int) $row->searches,
			);
		}
		return $out;
	}

	/**
	 * Running totals over the last WINDOW_WEEKS stored weeks, most popular first.
	 *
	 * @return array<int, array{query: string, visitors: int, clicks: int, searches: int, weeks: int}>
	 */
	public static function running_totals(): array {
		$weeks = get_option( self::OPTION_WEEKS );
		if ( ! is_array( $weeks ) || $weeks === array() ) {
			return array();
		}
		krsort( $weeks );
		$totals = array();
		foreach ( array_slice( $weeks, 0, self::WINDOW_WEEKS, true ) as $week ) {
			foreach ( (array) $week as $norm => $row ) {
				if ( ! isset( $totals[ $norm ] ) ) {
					$totals[ $norm ] = array( 'query' => (string) $row['q'], 'visitors' => 0, 'clicks' => 0, 'searches' => 0, 'weeks' => 0 );
				}
				$totals[ $norm ]['visitors'] += (int) $row['v'];
				$totals[ $norm ]['clicks']   += (int) $row['c'];
				$totals[ $norm ]['searches'] += (int) $row['n'];
				++$totals[ $norm ]['weeks'];
			}
		}
		$totals = array_values( $totals );
		usort(
			$totals,
			static function ( $a, $b ) {
				$sa = $a['visitors'] + $a['clicks'];
				$sb = $b['visitors'] + $b['clicks'];
				return $sb <=> $sa ?: $b['searches'] <=> $a['searches'];
			}
		);
		return $totals;
	}

	/**
	 * Build and store the list shown all week (AI check and sentence case happen here, once).
	 */
	public static function rebuild_list(): void {
		$candidates = array();
		foreach ( array_slice( self::running_totals(), 0, 40 ) as $row ) {
			$candidates[] = array(
				'query' => $row['query'],
				'count' => $row['visitors'],
			);
		}
		$terms = $candidates === array() ? array() : Neo_Pulse_Wp_Search_Logs::curate_candidates( $candidates, self::LIST_SIZE );
		update_option(
			self::OPTION_LIST,
			array(
				'built' => time(),
				'weeks' => self::WINDOW_WEEKS,
				'terms' => $terms,
			),
			false
		);
	}
}
