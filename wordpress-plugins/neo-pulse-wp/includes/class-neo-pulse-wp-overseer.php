<?php
/**
 * Overseer: first-party pageview tracking storage and built-in Script Manager tag.
 *
 * Public facade used by the rest of the plugin — implementation lives in includes/overseer/.
 * Constants live on Neo_Pulse_Wp_Overseer_Context.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Overseer {

	public static function init(): void {
		self::load_dependencies();
		add_action( 'plugins_loaded', array( Neo_Pulse_Wp_Overseer_Install::class, 'maybe_install' ), 20 );
		// The built-in Script Manager tag is created/repaired by Install::install() (install and version
		// change) and when the Overseer settings are saved, not on every request.
		add_action( 'wp_enqueue_scripts', array( Neo_Pulse_Wp_Overseer_Beacon::class, 'maybe_enqueue_beacon_fallback' ), 20 );
		add_filter( 'neo_pulse_wp_script_manager_render_code', array( Neo_Pulse_Wp_Overseer_Beacon::class, 'filter_script_code' ), 10, 2 );
		add_action( Neo_Pulse_Wp_Overseer_Context::CRON_HOOK, array( Neo_Pulse_Wp_Overseer_Maintenance::class, 'prune_retention' ) );
		if ( ! wp_next_scheduled( Neo_Pulse_Wp_Overseer_Context::CRON_HOOK ) ) {
			wp_schedule_event( time(), 'daily', Neo_Pulse_Wp_Overseer_Context::CRON_HOOK );
		}
		Neo_Pulse_Wp_Overseer_Conversions::init();
	}

	private static function load_dependencies(): void {
		static $loaded = false;
		if ( $loaded ) {
			return;
		}
		$loaded = true;

		$dir = NEO_PULSE_WP_PLUGIN_DIR . 'includes/overseer/';
		require_once $dir . 'class-neo-pulse-wp-overseer-context.php';
		require_once $dir . 'class-neo-pulse-wp-overseer-settings.php';
		require_once $dir . 'class-neo-pulse-wp-overseer-install.php';
		require_once $dir . 'class-neo-pulse-wp-overseer-beacon.php';
		require_once $dir . 'class-neo-pulse-wp-overseer-ingest.php';
		require_once $dir . 'class-neo-pulse-wp-overseer-query.php';
		require_once $dir . 'class-neo-pulse-wp-overseer-aggregates.php';
		require_once $dir . 'class-neo-pulse-wp-overseer-maintenance.php';
	}

	/** @return string */
	public static function table_name(): string {
		return Neo_Pulse_Wp_Overseer_Context::table_name();
	}

	public static function reports_table_name(): string {
		return Neo_Pulse_Wp_Overseer_Context::reports_table_name();
	}

	public static function tasks_table_name(): string {
		return Neo_Pulse_Wp_Overseer_Context::tasks_table_name();
	}

	public static function install(): void {
		self::load_dependencies();
		Neo_Pulse_Wp_Overseer_Install::install();
	}

	public static function get_settings(): array {
		return Neo_Pulse_Wp_Overseer_Settings::get_settings();
	}

	public static function save_settings( array $settings ): void {
		Neo_Pulse_Wp_Overseer_Settings::save_settings( $settings );
	}

	public static function is_tracking_active(): bool {
		return Neo_Pulse_Wp_Overseer_Settings::is_tracking_active();
	}

	public static function get_builtin_script_id(): int {
		return Neo_Pulse_Wp_Overseer_Beacon::get_builtin_script_id();
	}

	public static function is_builtin_script_id( int $id ): bool {
		return Neo_Pulse_Wp_Overseer_Beacon::is_builtin_script_id( $id );
	}

	public static function is_builtin_protected(): bool {
		return Neo_Pulse_Wp_Overseer_Beacon::is_builtin_protected();
	}

	public static function sync_builtin_script(): void {
		Neo_Pulse_Wp_Overseer_Beacon::sync_builtin_script();
	}

	public static function get_client_ip(): string {
		return Neo_Pulse_Wp_Overseer_Ingest::get_client_ip();
	}

	public static function is_valid_uuid( string $uuid ): bool {
		return Neo_Pulse_Wp_Overseer_Context::is_valid_uuid( $uuid );
	}

	/**
	 * @param array<string, mixed> $data Event payload.
	 * @return array{ok: bool, visit_uid?: string, session_id?: string, error?: string}
	 */
	public static function record_event( array $data ) {
		return Neo_Pulse_Wp_Overseer_Ingest::record_event( $data );
	}

	/**
	 * @param array<string, mixed> $args Query args.
	 * @return array{items: array<int, object>, total: int}
	 */
	public static function query( array $args = array() ): array {
		return Neo_Pulse_Wp_Overseer_Query::query( $args );
	}

	/**
	 * @param array<string, mixed> $args Query args.
	 * @return array<int, object>
	 */
	public static function query_for_export( array $args = array() ): array {
		return Neo_Pulse_Wp_Overseer_Query::query_for_export( $args );
	}

	public static function count_visits(): int {
		return Neo_Pulse_Wp_Overseer_Query::count_visits();
	}

	public static function get_session_timeline( string $session_id ): array {
		return Neo_Pulse_Wp_Overseer_Query::get_session_timeline( $session_id );
	}

	/** @return object|null */
	public static function get_session_summary( string $session_id ) {
		return Neo_Pulse_Wp_Overseer_Query::get_session_summary( $session_id );
	}

	public static function get_engagement_by_visit_uids( array $visit_uids ): array {
		return Neo_Pulse_Wp_Overseer_Query::get_engagement_by_visit_uids( $visit_uids );
	}

	public static function aggregate_summary( string $date_from, string $date_to ): array {
		return Neo_Pulse_Wp_Overseer_Aggregates::aggregate_summary( $date_from, $date_to );
	}

	public static function aggregate_by_page( string $date_from, string $date_to ): array {
		return Neo_Pulse_Wp_Overseer_Aggregates::aggregate_by_page( $date_from, $date_to );
	}

	public static function aggregate_paths( string $date_from, string $date_to ): array {
		return Neo_Pulse_Wp_Overseer_Aggregates::aggregate_paths( $date_from, $date_to );
	}

	public static function fetch_events_for_analysis( string $date_from, string $date_to ): array {
		return Neo_Pulse_Wp_Overseer_Aggregates::fetch_events_for_analysis( $date_from, $date_to );
	}

	public static function count_sessions_in_range( string $date_from, string $date_to ): int {
		return Neo_Pulse_Wp_Overseer_Aggregates::count_sessions_in_range( $date_from, $date_to );
	}

	public static function normalize_path_url( string $url ): string {
		return Neo_Pulse_Wp_Overseer_Aggregates::normalize_path_url( $url );
	}

	public static function top_clicked_links( string $date_from, string $date_to ): array {
		return Neo_Pulse_Wp_Overseer_Aggregates::top_clicked_links( $date_from, $date_to );
	}

	public static function delete_visit( int $id ): bool {
		return Neo_Pulse_Wp_Overseer_Maintenance::delete_visit( $id );
	}

	public static function delete_all_visits(): int {
		return Neo_Pulse_Wp_Overseer_Maintenance::delete_all_visits();
	}

	public static function new_uuid(): string {
		return Neo_Pulse_Wp_Overseer_Context::new_uuid();
	}
}
