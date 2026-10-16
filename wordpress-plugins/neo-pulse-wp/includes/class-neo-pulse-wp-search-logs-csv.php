<?php
/**
 * Search log CSV import/export.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/class-neo-pulse-wp-csv.php';

class Neo_Pulse_Wp_Search_Logs_Csv {

	const HEADER = 'event_uid,session_id,page_url,query,result_count,intent,sentiment,accepted_url,accepted_title,accepted_rank,accepted_at,created_at';

	/**
	 * @param array<int, object|array<string, mixed>> $rows DB rows.
	 */
	public static function build( array $rows ): string {
		$lines = array( self::HEADER );
		foreach ( $rows as $row ) {
			$r = is_object( $row ) ? (array) $row : $row;
			$lines[] = implode(
				',',
				array(
					Neo_Pulse_Wp_Csv::cell( isset( $r['event_uid'] ) ? (string) $r['event_uid'] : '' ),
					Neo_Pulse_Wp_Csv::cell( isset( $r['session_id'] ) ? (string) $r['session_id'] : '' ),
					Neo_Pulse_Wp_Csv::cell( isset( $r['page_url'] ) ? (string) $r['page_url'] : '' ),
					Neo_Pulse_Wp_Csv::cell( isset( $r['query'] ) ? (string) $r['query'] : '' ),
					Neo_Pulse_Wp_Csv::cell( isset( $r['result_count'] ) ? (string) $r['result_count'] : '0' ),
					Neo_Pulse_Wp_Csv::cell( isset( $r['intent'] ) ? (string) $r['intent'] : '' ),
					Neo_Pulse_Wp_Csv::cell( isset( $r['sentiment'] ) ? (string) $r['sentiment'] : '' ),
					Neo_Pulse_Wp_Csv::cell( isset( $r['accepted_url'] ) ? (string) $r['accepted_url'] : '' ),
					Neo_Pulse_Wp_Csv::cell( isset( $r['accepted_title'] ) ? (string) $r['accepted_title'] : '' ),
					Neo_Pulse_Wp_Csv::cell( isset( $r['accepted_rank'] ) ? (string) $r['accepted_rank'] : '' ),
					Neo_Pulse_Wp_Csv::cell( isset( $r['accepted_at'] ) ? (string) $r['accepted_at'] : '' ),
					Neo_Pulse_Wp_Csv::cell( isset( $r['created_at'] ) ? (string) $r['created_at'] : '' ),
				)
			);
		}
		return implode( "\n", $lines );
	}
}
