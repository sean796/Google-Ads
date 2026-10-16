<?php
/**
 * Overseer — tracking settings storage
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Overseer_Settings {

	public static function get_settings(): array {
		$raw = get_option( Neo_Pulse_Wp_Overseer_Context::OPTION_KEY, array() );
		if ( ! is_array( $raw ) ) {
			$raw = array();
		}
		$days = isset( $raw['retention_days'] ) ? (int) $raw['retention_days'] : 90;
		if ( $days < 1 ) {
			$days = 90;
		}
		if ( $days > 3650 ) {
			$days = 3650;
		}
		return array(
			'tracking_enabled'    => ! empty( $raw['tracking_enabled'] ),
			'retention_days'      => $days,
			'anonymize_ip'        => ! empty( $raw['anonymize_ip'] ),
			'exclude_admins'      => ! array_key_exists( 'exclude_admins', $raw ) || ! empty( $raw['exclude_admins'] ),
			'track_interactions'  => ! array_key_exists( 'track_interactions', $raw ) || ! empty( $raw['track_interactions'] ),
			'track_outbound_only' => ! empty( $raw['track_outbound_only'] ),
			'include_gsc'         => ! array_key_exists( 'include_gsc', $raw ) || ! empty( $raw['include_gsc'] ),
		);
	}
	public static function save_settings( array $settings ): void {
		$days = isset( $settings['retention_days'] ) ? (int) $settings['retention_days'] : 90;
		if ( $days < 1 ) {
			$days = 90;
		}
		if ( $days > 3650 ) {
			$days = 3650;
		}
		update_option(
			Neo_Pulse_Wp_Overseer_Context::OPTION_KEY,
			array(
				'tracking_enabled'    => ! empty( $settings['tracking_enabled'] ),
				'retention_days'      => $days,
				'anonymize_ip'        => ! empty( $settings['anonymize_ip'] ),
				'exclude_admins'      => ! empty( $settings['exclude_admins'] ),
				'track_interactions'  => ! empty( $settings['track_interactions'] ),
				'track_outbound_only' => ! empty( $settings['track_outbound_only'] ),
				'include_gsc'         => ! empty( $settings['include_gsc'] ),
			),
			true // Small and read on every front-end request (beacon, Script Manager filter).
		);

		// Create or repair the built-in tag here rather than on every request.
		if ( class_exists( 'Neo_Pulse_Wp_Overseer_Beacon', false ) ) {
			Neo_Pulse_Wp_Overseer_Beacon::ensure_builtin_script();
		}
	}
	public static function is_tracking_active(): bool {
		$settings = self::get_settings();
		return ! empty( $settings['tracking_enabled'] );
	}
	public static function should_load_beacon_on_frontend(): bool {
		if ( is_admin() || wp_doing_ajax() || wp_doing_cron() || is_feed() ) {
			return false;
		}
		if ( defined( 'REST_REQUEST' ) && REST_REQUEST ) {
			return false;
		}
		if ( ! self::is_tracking_active() ) {
			return false;
		}
		if ( ! class_exists( 'Neo_Pulse_Wp_Script_Manager', false ) ) {
			return false;
		}

		$builtin_id = Neo_Pulse_Wp_Overseer_Beacon::get_builtin_script_id();
		if ( $builtin_id < 1 ) {
			return false;
		}

		$row = Neo_Pulse_Wp_Script_Manager::get( $builtin_id );
		if ( ! $row ) {
			return false;
		}
		if ( isset( $row->status ) && 'active' !== (string) $row->status ) {
			return false;
		}

		$rules = Neo_Pulse_Wp_Script_Manager_Rules::decode(
			isset( $row->display_rules ) ? (string) $row->display_rules : ''
		);

		return Neo_Pulse_Wp_Script_Manager_Rules::matches_current_request( $rules );
	}
}
