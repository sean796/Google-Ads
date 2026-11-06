<?php
/**
 * Prompt trace persistence (bulk run prompt/response logs).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Prompt_Traces_Store {

	public static function install_tables(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset = $wpdb->get_charset_collate();
		$table   = $wpdb->prefix . 'neo_pulse_prompt_traces';

		dbDelta(
			"CREATE TABLE {$table} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				site_url varchar(255) NOT NULL DEFAULT '',
				run_label varchar(255) NOT NULL DEFAULT '',
				created_by bigint(20) unsigned NOT NULL DEFAULT 0,
				call_count int(11) NOT NULL DEFAULT 0,
				trace_json longtext NOT NULL,
				created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				KEY site_url (site_url),
				KEY created_at (created_at)
			) {$charset};"
		);
	}

	/**
	 * @param array<string,mixed> $trace
	 */
	public static function insert_trace( int $user_id, string $site_url, string $run_label, array $trace ): int {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_prompt_traces';

		$calls = isset( $trace['calls'] ) && is_array( $trace['calls'] ) ? $trace['calls'] : array();

		$inserted = $wpdb->insert(
			$table,
			array(
				'site_url'   => $site_url,
				'run_label'  => $run_label,
				'created_by' => $user_id,
				'call_count' => count( $calls ),
				'trace_json' => (string) wp_json_encode( $trace ),
				'created_at' => current_time( 'mysql', true ),
			),
			array( '%s', '%s', '%d', '%d', '%s', '%s' )
		);

		return $inserted ? (int) $wpdb->insert_id : 0;
	}
}
