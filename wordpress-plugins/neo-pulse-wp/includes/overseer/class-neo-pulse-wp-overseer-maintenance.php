<?php
/**
 * Overseer — visit deletes and retention prune
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Overseer_Maintenance {

	public static function delete_visit( int $id ): bool {
		global $wpdb;
		if ( $id < 1 ) {
			return false;
		}
		$table = Neo_Pulse_Wp_Overseer_Context::table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$deleted = (bool) $wpdb->delete( $table, array( 'id' => $id ), array( '%d' ) );
		Neo_Pulse_Wp_Overseer_Query::forget_count();
		return $deleted;
	}

	/**
	 * Empty the events table.
	 *
	 * @return int Number of events removed (TRUNCATE itself reports 0 rows).
	 */
	public static function delete_all_visits(): int {
		global $wpdb;
		$table = Neo_Pulse_Wp_Overseer_Context::table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$ok = $wpdb->query( "TRUNCATE TABLE {$table}" );
		Neo_Pulse_Wp_Overseer_Query::forget_count();
		return false === $ok ? 0 : $count;
	}

	/**
	 * Daily retention prune (cron hook neo_pulse_wp_overseer_prune).
	 */
	public static function prune_retention(): void {
		$settings = Neo_Pulse_Wp_Overseer_Settings::get_settings();
		$days     = (int) $settings['retention_days'];
		if ( $days < 1 ) {
			return;
		}
		$cutoff = gmdate( 'Y-m-d H:i:s', time() - ( $days * DAY_IN_SECONDS ) );
		global $wpdb;
		$table = Neo_Pulse_Wp_Overseer_Context::table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$removed = $wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE created_at < %s", $cutoff ) );
		if ( $removed ) {
			Neo_Pulse_Wp_Overseer_Query::forget_count();
		}
	}
}
