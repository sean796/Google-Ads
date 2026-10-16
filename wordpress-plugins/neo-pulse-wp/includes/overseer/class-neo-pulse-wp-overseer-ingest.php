<?php
/**
 * Overseer — event ingest and client meta sanitization
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Overseer_Ingest {

	public static function get_client_ip(): string {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? (string) $_SERVER['REMOTE_ADDR'] : '';
		$ip = sanitize_text_field( $ip );
		return apply_filters( 'neo_pulse_wp_overseer_client_ip', $ip );
	}
	public static function anonymize_ip( string $ip ): string {
		if ( $ip === '' ) {
			return '';
		}
		if ( filter_var( $ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4 ) ) {
			$parts = explode( '.', $ip );
			if ( count( $parts ) === 4 ) {
				$parts[3] = '0';
				return implode( '.', $parts );
			}
		}
		if ( filter_var( $ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6 ) ) {
			$parts = explode( ':', $ip );
			$keep  = min( 4, count( $parts ) );
			return implode( ':', array_slice( $parts, 0, $keep ) ) . '::';
		}
		return $ip;
	}
	public static function detect_device( string $user_agent ): string {
		$ua = strtolower( $user_agent );
		if ( $ua === '' ) {
			return 'unknown';
		}
		if ( preg_match( '/mobile|android|iphone|ipod|blackberry|iemobile|opera mini/i', $ua ) ) {
			return 'mobile';
		}
		return 'desktop';
	}
	public static function record_event( array $data ) {
		if ( ! Neo_Pulse_Wp_Overseer_Settings::is_tracking_active() ) {
			return array( 'ok' => false, 'error' => 'tracking_disabled' );
		}

		$settings = Neo_Pulse_Wp_Overseer_Settings::get_settings();
		if ( ! empty( $settings['exclude_admins'] ) && is_user_logged_in() && current_user_can( 'manage_options' ) ) {
			return array( 'ok' => false, 'error' => 'excluded_admin' );
		}

		$event_type = isset( $data['event_type'] ) ? sanitize_key( (string) $data['event_type'] ) : 'pageview';
		if ( ! in_array( $event_type, Neo_Pulse_Wp_Overseer_Context::ALLOWED_EVENT_TYPES, true ) ) {
			$event_type = 'pageview';
		}

		if ( in_array( $event_type, array( 'click', 'form_submit', 'outbound_click' ), true ) && empty( $settings['track_interactions'] ) ) {
			return array( 'ok' => false, 'error' => 'interactions_disabled' );
		}

		$session_id = isset( $data['session_id'] ) ? sanitize_text_field( (string) $data['session_id'] ) : '';
		if ( ! Neo_Pulse_Wp_Overseer_Context::is_valid_session_id( $session_id ) ) {
			$session_id = Neo_Pulse_Wp_Overseer_Context::new_session_id();
		}

		$page_url = isset( $data['page_url'] ) ? esc_url_raw( (string) $data['page_url'] ) : '';
		if ( strlen( $page_url ) > 512 ) {
			$page_url = substr( $page_url, 0, 512 );
		}
		if ( $page_url === '' && 'pageview' === $event_type ) {
			return array( 'ok' => false, 'error' => 'missing_page_url' );
		}
		if ( $page_url === '' ) {
			$page_url = isset( $data['current_page_url'] ) ? esc_url_raw( (string) $data['current_page_url'] ) : '';
			if ( strlen( $page_url ) > 512 ) {
				$page_url = substr( $page_url, 0, 512 );
			}
		}
		if ( $page_url === '' ) {
			return array( 'ok' => false, 'error' => 'missing_page_url' );
		}

		$page_title = isset( $data['page_title'] ) ? sanitize_text_field( (string) $data['page_title'] ) : '';
		if ( strlen( $page_title ) > 512 ) {
			$page_title = substr( $page_title, 0, 512 );
		}

		$referrer = isset( $data['referrer'] ) ? esc_url_raw( (string) $data['referrer'] ) : '';
		if ( strlen( $referrer ) > 512 ) {
			$referrer = substr( $referrer, 0, 512 );
		}

		// The beacon sends the page's post ID. Look it up from the URL only for pageviews and
		// interactions without one: url_to_postid() is slow, and heartbeat/exit events point back
		// at their pageview through parent_visit_uid anyway.
		$post_id = isset( $data['post_id'] ) && is_numeric( $data['post_id'] ) ? absint( $data['post_id'] ) : 0;
		if ( $post_id < 1 && ! in_array( $event_type, array( 'page_heartbeat', 'page_exit' ), true ) ) {
			$post_id = url_to_postid( $page_url );
		}

		$screen_width  = isset( $data['screen_width'] ) ? max( 0, min( 99999, (int) $data['screen_width'] ) ) : 0;
		$screen_height = isset( $data['screen_height'] ) ? max( 0, min( 99999, (int) $data['screen_height'] ) ) : 0;
		$language      = isset( $data['language'] ) ? sanitize_text_field( substr( (string) $data['language'], 0, 32 ) ) : '';
		$timezone      = isset( $data['timezone'] ) ? sanitize_text_field( substr( (string) $data['timezone'], 0, 64 ) ) : '';

		$duration_ms        = isset( $data['duration_ms'] ) ? max( 0, min( 86400000, (int) $data['duration_ms'] ) ) : 0;
		$active_duration_ms = isset( $data['active_duration_ms'] ) ? max( 0, min( 86400000, (int) $data['active_duration_ms'] ) ) : 0;
		$page_load_ms       = isset( $data['page_load_ms'] ) ? max( 0, min( 600000, (int) $data['page_load_ms'] ) ) : 0;
		$scroll_depth_pct   = isset( $data['scroll_depth_pct'] ) ? max( 0, min( 100, (int) $data['scroll_depth_pct'] ) ) : 0;
		$parent_visit_uid  = isset( $data['parent_visit_uid'] ) ? sanitize_text_field( (string) $data['parent_visit_uid'] ) : '';
		if ( $parent_visit_uid !== '' && ! Neo_Pulse_Wp_Overseer_Context::is_valid_uuid( $parent_visit_uid ) ) {
			$parent_visit_uid = '';
		}

		$element_tag  = isset( $data['element_tag'] ) ? sanitize_key( substr( (string) $data['element_tag'], 0, 32 ) ) : '';
		$element_text = isset( $data['element_text'] ) ? sanitize_text_field( substr( (string) $data['element_text'], 0, 256 ) ) : '';
		if ( 'conversion' === $event_type ) {
			$element_href = isset( $data['element_href'] ) ? sanitize_text_field( substr( (string) $data['element_href'], 0, 512 ) ) : '';
		} else {
			$element_href = isset( $data['element_href'] ) ? esc_url_raw( substr( (string) $data['element_href'], 0, 512 ) ) : '';
		}

		$client_meta = array();
		if ( isset( $data['client_meta'] ) && is_array( $data['client_meta'] ) ) {
			$client_meta = self::sanitize_client_meta( $data['client_meta'], $event_type );
		} elseif ( isset( $data['utm'] ) && is_array( $data['utm'] ) ) {
			$client_meta['utm'] = $data['utm'];
		}

		$ip = self::get_client_ip();
		if ( ! empty( $settings['anonymize_ip'] ) ) {
			$ip = self::anonymize_ip( $ip );
		}

		$user_agent = isset( $_SERVER['HTTP_USER_AGENT'] ) ? sanitize_text_field( substr( (string) $_SERVER['HTTP_USER_AGENT'], 0, 512 ) ) : '';
		$device     = self::detect_device( $user_agent );
		$wp_user_id = get_current_user_id();
		$logged_in  = $wp_user_id > 0 ? 1 : 0;

		$visit_uid = Neo_Pulse_Wp_Overseer_Context::new_uuid();
		$now       = current_time( 'mysql', true );
		$meta_json = wp_json_encode( $client_meta );
		if ( ! is_string( $meta_json ) ) {
			$meta_json = '{}';
		}

		global $wpdb;
		$table = Neo_Pulse_Wp_Overseer_Context::table_name();

		$row = array(
			'visit_uid'          => $visit_uid,
			'session_id'         => $session_id,
			'event_type'         => $event_type,
			'page_url'           => $page_url,
			'page_title'         => $page_title,
			'referrer'           => $referrer,
			'post_id'            => $post_id,
			'screen_width'       => $screen_width,
			'screen_height'      => $screen_height,
			'language'           => $language,
			'timezone'           => $timezone,
			'client_meta'        => $meta_json,
			'duration_ms'        => $duration_ms,
			'active_duration_ms' => $active_duration_ms,
			'page_load_ms'       => $page_load_ms,
			'scroll_depth_pct'   => $scroll_depth_pct,
			'parent_visit_uid'   => $parent_visit_uid,
			'element_tag'        => $element_tag,
			'element_text'       => $element_text,
			'element_href'       => $element_href,
			'ip_address'         => substr( $ip, 0, 45 ),
			'user_agent'         => $user_agent,
			'device'             => $device,
			'wp_user_id'         => $wp_user_id,
			'is_logged_in'       => $logged_in,
			'created_at'         => $now,
		);

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$inserted = $wpdb->insert(
			$table,
			$row,
			array( '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%d', '%s', '%s', '%s', '%d', '%d', '%d', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%s' )
		);

		if ( false === $inserted ) {
			return array( 'ok' => false, 'error' => __( 'Could not save visit.', 'neo-pulse-wp' ) );
		}

		do_action( 'neo_pulse_wp_overseer_event_recorded', $visit_uid, $event_type, (object) $row );

		// Retention is pruned by the daily neo_pulse_wp_overseer_prune cron, not on every insert.

		return array(
			'ok'         => true,
			'visit_uid'  => $visit_uid,
			'session_id' => $session_id,
		);
	}
	public static function sanitize_client_meta( array $meta, string $event_type = '' ): array {
		if ( 'conversion' !== $event_type ) {
			return $meta;
		}
		$out = array();
		if ( isset( $meta['conversion_goal_id'] ) ) {
			$out['conversion_goal_id'] = sanitize_key( (string) $meta['conversion_goal_id'] );
		}
		if ( isset( $meta['conversion_name'] ) ) {
			$out['conversion_name'] = sanitize_text_field( (string) $meta['conversion_name'] );
		}
		if ( isset( $meta['trigger_type'] ) ) {
			$out['trigger_type'] = sanitize_key( (string) $meta['trigger_type'] );
		}
		if ( isset( $meta['source_event_type'] ) ) {
			$out['source_event_type'] = sanitize_key( (string) $meta['source_event_type'] );
		}
		if ( isset( $meta['form_id'] ) ) {
			$out['form_id'] = absint( $meta['form_id'] );
		}
		if ( isset( $meta['entry_id'] ) ) {
			$out['entry_id'] = absint( $meta['entry_id'] );
		}
		if ( isset( $meta['field_signals'] ) && is_array( $meta['field_signals'] ) ) {
			$signals = array();
			foreach ( $meta['field_signals'] as $type => $present ) {
				$key = sanitize_key( (string) $type );
				if ( $key !== '' ) {
					$signals[ $key ] = (bool) $present;
				}
			}
			$out['field_signals'] = $signals;
		}
		if ( isset( $meta['matched_field_ids'] ) && is_array( $meta['matched_field_ids'] ) ) {
			$ids = array();
			foreach ( $meta['matched_field_ids'] as $field_id ) {
				$field_id = sanitize_key( (string) $field_id );
				if ( $field_id !== '' ) {
					$ids[] = $field_id;
				}
			}
			$out['matched_field_ids'] = array_values( array_unique( $ids ) );
		}
		return $out;
	}
}
