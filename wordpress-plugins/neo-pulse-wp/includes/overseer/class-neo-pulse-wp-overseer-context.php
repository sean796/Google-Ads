<?php
/**
 * Overseer — constants, table names, session and uuid helpers
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Overseer_Context {

	/** Schema version of the visits, reports and tasks tables (all created by Install::install()). */
	const TABLE_VERSION            = '2.2';

	/** @var array<int, string> */
	const ALLOWED_EVENT_TYPES = array(
		'pageview',
		'page_exit',
		'page_heartbeat',
		'click',
		'form_submit',
		'outbound_click',
		'conversion',
	);
	const DB_VERSION_OPTION        = 'neo_pulse_wp_overseer_db_version';
	const OPTION_KEY               = 'neo_pulse_wp_overseer_settings';
	const BUILTIN_SCRIPT_ID_OPTION = 'neo_pulse_wp_overseer_builtin_script_id';
	const BUILTIN_SCRIPT_NAME      = 'NEO Pulse Page View';
	const BUILTIN_SCRIPT_CATEGORY  = 'NEO Pulse Tags';
	const CONFIG_PLACEHOLDER       = '%%NEO_PULSE_OVERSEER_CONFIG%%';
	const JS_URL_PLACEHOLDER       = '%%NEO_PULSE_OVERSEER_JS_URL%%';
	const CONFIG_SCRIPT_ID         = 'neo-pulse-overseer-config';
	const SESSION_ID_PATTERN       = '/^ovsess_[0-9]+_[a-z0-9]{6,32}$/';
	const CRON_HOOK                = 'neo_pulse_wp_overseer_prune';
	const SCRIPT_TEMPLATE_VERSION  = '4';
	const SCRIPT_TEMPLATE_OPTION   = 'neo_pulse_wp_overseer_script_template_version';

	public static function table_name(): string {
		global $wpdb;
		return $wpdb->prefix . 'neo_pulse_wp_overseer_visits';
	}
	public static function reports_table_name(): string {
		global $wpdb;
		return $wpdb->prefix . 'neo_pulse_wp_overseer_reports';
	}
	public static function tasks_table_name(): string {
		global $wpdb;
		return $wpdb->prefix . 'neo_pulse_wp_overseer_tasks';
	}
	public static function new_uuid(): string {
		if ( function_exists( 'wp_generate_uuid4' ) ) {
			return wp_generate_uuid4();
		}
		return sprintf(
			'%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
			wp_rand( 0, 0xffff ),
			wp_rand( 0, 0xffff ),
			wp_rand( 0, 0xffff ),
			wp_rand( 0, 0x0fff ) | 0x4000,
			wp_rand( 0, 0x3fff ) | 0x8000,
			wp_rand( 0, 0xffff ),
			wp_rand( 0, 0xffff ),
			wp_rand( 0, 0xffff )
		);
	}
	public static function is_valid_uuid( string $uuid ): bool {
		return (bool) preg_match(
			'/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
			$uuid
		);
	}
	public static function is_valid_session_id( string $session_id ): bool {
		return (bool) preg_match( Neo_Pulse_Wp_Overseer_Context::SESSION_ID_PATTERN, $session_id );
	}
	public static function new_session_id(): string {
		return 'ovsess_' . time() . '_' . strtolower( wp_generate_password( 8, false, false ) );
	}
}
