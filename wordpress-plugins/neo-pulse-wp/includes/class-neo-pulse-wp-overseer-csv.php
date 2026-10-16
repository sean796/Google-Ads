<?php
/**
 * Overseer visit CSV export.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/class-neo-pulse-wp-csv.php';

class Neo_Pulse_Wp_Overseer_Csv {

	const HEADER = 'visit_uid,session_id,event_type,page_url,page_title,referrer,post_id,device,ip_address,language,timezone,screen_width,screen_height,duration_ms,active_duration_ms,page_load_ms,scroll_depth_pct,parent_visit_uid,element_tag,element_text,element_href,client_meta,is_logged_in,wp_user_id,user_agent,created_at';

	/**
	 * @param array<int, object> $rows Visit rows.
	 */
	public static function build( array $rows ): string {
		$lines = array( self::HEADER );
		foreach ( $rows as $row ) {
			if ( ! is_object( $row ) ) {
				continue;
			}
			$lines[] = Neo_Pulse_Wp_Csv::row(
				array(
					(string) $row->visit_uid,
					(string) $row->session_id,
					(string) $row->event_type,
					(string) $row->page_url,
					(string) $row->page_title,
					(string) $row->referrer,
					(string) $row->post_id,
					(string) $row->device,
					(string) $row->ip_address,
					(string) $row->language,
					(string) $row->timezone,
					(string) $row->screen_width,
					(string) $row->screen_height,
					isset( $row->duration_ms ) ? (string) $row->duration_ms : '0',
					isset( $row->active_duration_ms ) ? (string) $row->active_duration_ms : '0',
					isset( $row->page_load_ms ) ? (string) $row->page_load_ms : '0',
					isset( $row->scroll_depth_pct ) ? (string) $row->scroll_depth_pct : '0',
					isset( $row->parent_visit_uid ) ? (string) $row->parent_visit_uid : '',
					isset( $row->element_tag ) ? (string) $row->element_tag : '',
					isset( $row->element_text ) ? (string) $row->element_text : '',
					isset( $row->element_href ) ? (string) $row->element_href : '',
					isset( $row->client_meta ) ? (string) $row->client_meta : '',
					! empty( $row->is_logged_in ) ? '1' : '0',
					(string) $row->wp_user_id,
					(string) $row->user_agent,
					(string) $row->created_at,
				)
			);
		}
		return implode( "\n", $lines ) . "\n";
	}
}
