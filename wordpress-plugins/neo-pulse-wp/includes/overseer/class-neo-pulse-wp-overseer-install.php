<?php
/**
 * Overseer — database install and schema upgrades
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Overseer_Install {

	public static function maybe_install(): void {
		if ( get_option( Neo_Pulse_Wp_Overseer_Context::DB_VERSION_OPTION, '' ) !== Neo_Pulse_Wp_Overseer_Context::TABLE_VERSION ) {
			self::install();
		}
	}
	public static function install(): void {
		global $wpdb;

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$table   = Neo_Pulse_Wp_Overseer_Context::table_name();
		$charset = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE {$table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			visit_uid varchar(36) NOT NULL,
			session_id varchar(64) NOT NULL,
			event_type varchar(32) NOT NULL DEFAULT 'pageview',
			page_url varchar(512) NOT NULL DEFAULT '',
			page_title varchar(512) NOT NULL DEFAULT '',
			referrer varchar(512) NOT NULL DEFAULT '',
			post_id bigint(20) unsigned NOT NULL DEFAULT 0,
			screen_width smallint(5) unsigned NOT NULL DEFAULT 0,
			screen_height smallint(5) unsigned NOT NULL DEFAULT 0,
			language varchar(32) NOT NULL DEFAULT '',
			timezone varchar(64) NOT NULL DEFAULT '',
			client_meta longtext NOT NULL,
			duration_ms bigint(20) unsigned NOT NULL DEFAULT 0,
			active_duration_ms bigint(20) unsigned NOT NULL DEFAULT 0,
			page_load_ms int(11) unsigned NOT NULL DEFAULT 0,
			scroll_depth_pct tinyint(3) unsigned NOT NULL DEFAULT 0,
			parent_visit_uid varchar(36) NOT NULL DEFAULT '',
			element_tag varchar(32) NOT NULL DEFAULT '',
			element_text varchar(256) NOT NULL DEFAULT '',
			element_href varchar(512) NOT NULL DEFAULT '',
			ip_address varchar(45) NOT NULL DEFAULT '',
			user_agent varchar(512) NOT NULL DEFAULT '',
			device varchar(20) NOT NULL DEFAULT 'unknown',
			wp_user_id bigint(20) unsigned NOT NULL DEFAULT 0,
			is_logged_in tinyint(1) NOT NULL DEFAULT 0,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY visit_uid (visit_uid),
			KEY session_id (session_id),
			KEY created_at (created_at),
			KEY page_url (page_url(191)),
			KEY post_id (post_id),
			KEY event_type (event_type),
			KEY parent_visit_uid (parent_visit_uid)
		) {$charset};";

		$reports = Neo_Pulse_Wp_Overseer_Context::reports_table_name();
		$sql_reports = "CREATE TABLE {$reports} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			report_uid varchar(36) NOT NULL,
			date_from date NOT NULL,
			date_to date NOT NULL,
			session_count int(11) unsigned NOT NULL DEFAULT 0,
			event_count int(11) unsigned NOT NULL DEFAULT 0,
			model varchar(80) NOT NULL DEFAULT '',
			body longtext NOT NULL,
			gsc_included tinyint(1) NOT NULL DEFAULT 0,
			gsc_date_from date DEFAULT NULL,
			gsc_date_to date DEFAULT NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY report_uid (report_uid),
			KEY created_at (created_at)
		) {$charset};";

		$tasks = Neo_Pulse_Wp_Overseer_Context::tasks_table_name();
		$sql_tasks = "CREATE TABLE {$tasks} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			task_uid varchar(36) NOT NULL,
			report_id bigint(20) unsigned NOT NULL DEFAULT 0,
			title varchar(512) NOT NULL DEFAULT '',
			description longtext NOT NULL,
			category varchar(32) NOT NULL DEFAULT 'content',
			priority tinyint(3) unsigned NOT NULL DEFAULT 3,
			status varchar(20) NOT NULL DEFAULT 'pending',
			evidence_json longtext NOT NULL,
			assist_message longtext NOT NULL,
			assist_result_json longtext NOT NULL,
			created_at datetime NOT NULL,
			updated_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY task_uid (task_uid),
			KEY report_id (report_id),
			KEY status (status),
			KEY priority (priority)
		) {$charset};";

		dbDelta( $sql );
		dbDelta( $sql_reports );
		dbDelta( $sql_tasks );
		// Autoloaded: maybe_install() compares it on every request.
		update_option( Neo_Pulse_Wp_Overseer_Context::DB_VERSION_OPTION, Neo_Pulse_Wp_Overseer_Context::TABLE_VERSION, true );

		if ( get_option( Neo_Pulse_Wp_Overseer_Context::OPTION_KEY, null ) === null ) {
			add_option(
				Neo_Pulse_Wp_Overseer_Context::OPTION_KEY,
				array(
					'tracking_enabled'    => false,
					'retention_days'      => 90,
					'anonymize_ip'        => false,
					'exclude_admins'      => true,
					'track_interactions'  => true,
					'track_outbound_only' => false,
					'include_gsc'         => true,
				),
				'',
				true
			);
		}

		// Built-in Script Manager tag: created/repaired on install and plugin version change only.
		Neo_Pulse_Wp_Overseer_Beacon::ensure_builtin_script();
	}
}
