<?php
/**
 * AI Search query log storage and aggregates.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_wp_search_logs_dir = __DIR__ . '/';
require_once $neo_pulse_wp_search_logs_dir . 'trait-neo-pulse-wp-search-logs-events.php';
require_once $neo_pulse_wp_search_logs_dir . 'trait-neo-pulse-wp-search-logs-popular-terms.php';
require_once $neo_pulse_wp_search_logs_dir . 'trait-neo-pulse-wp-search-logs-display-and-popular-pages.php';

class Neo_Pulse_Wp_Search_Logs {

	const TABLE_VERSION     = '1.0';
	const OPTION_KEY        = 'neo_pulse_wp_search_logs_settings';
	const DB_VERSION_OPTION = 'neo_pulse_wp_search_logs_db_version';
	const SESSION_PATTERN   = '/^csess_[0-9]+_[a-z0-9]{6}$/';

	use Neo_Pulse_Wp_Search_Logs_Trait_Events;
	use Neo_Pulse_Wp_Search_Logs_Trait_Popular_Terms;
	use Neo_Pulse_Wp_Search_Logs_Trait_Display_And_Popular_Pages;

	/**
	 * @return string
	 */
	public static function table_name(): string {
		global $wpdb;
		return $wpdb->prefix . 'neo_pulse_wp_search_events';
	}

	public static function init(): void {
		add_action( 'plugins_loaded', array( __CLASS__, 'maybe_install' ), 20 );
	}

	public static function maybe_install(): void {
		if ( get_option( self::DB_VERSION_OPTION, '' ) !== self::TABLE_VERSION ) {
			self::install();
		}
	}

	public static function install(): void {
		global $wpdb;

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset = $wpdb->get_charset_collate();
		$table   = self::table_name();

		$sql = "CREATE TABLE {$table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			event_uid varchar(36) NOT NULL,
			session_id varchar(64) NOT NULL,
			page_url varchar(512) DEFAULT NULL,
			query text NOT NULL,
			query_normalized varchar(255) NOT NULL DEFAULT '',
			result_count int(11) unsigned NOT NULL DEFAULT 0,
			intent varchar(32) DEFAULT NULL,
			sentiment varchar(20) DEFAULT NULL,
			results_json longtext DEFAULT NULL,
			accepted_url varchar(512) DEFAULT NULL,
			accepted_title varchar(255) DEFAULT NULL,
			accepted_rank int(11) unsigned DEFAULT NULL,
			accepted_at datetime DEFAULT NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY event_uid (event_uid),
			KEY session_id (session_id),
			KEY query_normalized (query_normalized),
			KEY created_at (created_at),
			KEY accepted_url (accepted_url(191))
		) {$charset};";

		dbDelta( $sql );
		update_option( self::DB_VERSION_OPTION, self::TABLE_VERSION, false );

		if ( get_option( self::OPTION_KEY, null ) === null ) {
			add_option(
				self::OPTION_KEY,
				array(
					'logging_enabled' => true,
					'retention_days'  => 90,
				),
				'',
				false
			);
		}
	}

	/**
	 * @return array{logging_enabled: bool, retention_days: int}
	 */
	public static function get_settings(): array {
		$raw = get_option( self::OPTION_KEY, array() );
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
			'logging_enabled' => ! array_key_exists( 'logging_enabled', $raw ) || ! empty( $raw['logging_enabled'] ),
			'retention_days'  => $days,
		);
	}

	/**
	 * @param array<string, mixed> $settings Settings.
	 */
	public static function save_settings( array $settings ): void {
		$days = isset( $settings['retention_days'] ) ? (int) $settings['retention_days'] : 90;
		if ( $days < 1 ) {
			$days = 90;
		}
		if ( $days > 3650 ) {
			$days = 3650;
		}
		update_option(
			self::OPTION_KEY,
			array(
				'logging_enabled' => ! empty( $settings['logging_enabled'] ),
				'retention_days'  => $days,
			),
			false
		);
	}

	public static function is_logging_active(): bool {
		$settings = self::get_settings();
		return ! empty( $settings['logging_enabled'] );
	}

	public static function is_valid_session_id( string $session_id ): bool {
		return (bool) preg_match( self::SESSION_PATTERN, $session_id );
	}

	public static function normalize_query( string $query ): string {
		$normalized = strtolower( trim( preg_replace( '/\s+/', ' ', $query ) ) );
		if ( strlen( $normalized ) > 255 ) {
			$normalized = substr( $normalized, 0, 255 );
		}
		return $normalized;
	}

	/**
	 * Delete rows older than the retention period. No cron covers this table, so it runs from
	 * insert(), but at most once every 12 hours instead of on every logged search.
	 */
	public static function maybe_prune_retention(): void {
		$settings = self::get_settings();
		$days     = (int) $settings['retention_days'];
		if ( $days < 1 ) {
			return;
		}
		if ( get_transient( 'neo_pulse_search_logs_pruned' ) ) {
			return;
		}
		set_transient( 'neo_pulse_search_logs_pruned', 1, 12 * HOUR_IN_SECONDS );
		$cutoff = gmdate( 'Y-m-d H:i:s', time() - ( $days * DAY_IN_SECONDS ) );
		global $wpdb;
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE created_at < %s", $cutoff ) );
	}

	/** @var bool */
	private static $import_context = false;

	public static function set_import_context( bool $enabled ): void {
		self::$import_context = $enabled;
	}

	private static function is_import_context(): bool {
		return self::$import_context;
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

	private static function is_valid_uuid( string $uuid ): bool {
		return (bool) preg_match(
			'/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
			$uuid
		);
	}
}
