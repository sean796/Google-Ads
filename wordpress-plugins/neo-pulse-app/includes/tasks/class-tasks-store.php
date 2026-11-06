<?php
/**
 * Team tasks DB schema and data access.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_app_tasks_store_dir = __DIR__ . '/';
require_once $neo_pulse_app_tasks_store_dir . 'trait-tasks-store-templates.php';
require_once $neo_pulse_app_tasks_store_dir . 'trait-tasks-store-projects-sections.php';
require_once $neo_pulse_app_tasks_store_dir . 'trait-tasks-store-crud.php';
require_once $neo_pulse_app_tasks_store_dir . 'trait-tasks-store-recipe-defaults.php';
require_once $neo_pulse_app_tasks_store_dir . 'trait-tasks-store-recipe-normalizers.php';
require_once $neo_pulse_app_tasks_store_dir . 'trait-tasks-store-execution-payload.php';
require_once $neo_pulse_app_tasks_store_dir . 'trait-tasks-store-queries-triggers.php';

class Neo_Pulse_App_Tasks_Store {

	const STATUSES = array( 'todo', 'in_progress', 'done' );

	const RECURRENCE_RULES = array( 'none', 'daily', 'weekly', 'monthly', 'yearly' );

	const EXECUTION_KINDS = array( 'content_optimizer', 'content_optimizer_meta', 'content_gap_check', 'gsc_reporting', 'ads_reporting', 'post_creator', 'entity_page_creator', 'entity_generator', 'sap_generator', 'local_dominator_export', 'chatgpt_website_audit', 'dfs_llm_article_audit', 'browser_automation' );
	const EXECUTION_TARGET_BUCKETS = array( 'pages', 'posts', 'sap', 'all' );
	const SCHEDULE_MODES = array( 'calendar', 'trigger' );
	const TRIGGER_SOURCES = array( 'gsc', 'schedule', 'ga', 'semrush' );
	const TRIGGER_SIGNALS = array(
		'position_drop',
		'ctr_drop',
		'impressions_up_ctr_down',
		'clicks_drop',
		'quick_win_slipped',
	);
	const TRIGGER_MATCH_MODES = array( 'any', 'all' );

	use Neo_Pulse_App_Tasks_Store_Trait_Templates;
	use Neo_Pulse_App_Tasks_Store_Trait_Projects_Sections;
	use Neo_Pulse_App_Tasks_Store_Trait_Crud;
	use Neo_Pulse_App_Tasks_Store_Trait_Recipe_Defaults;
	use Neo_Pulse_App_Tasks_Store_Trait_Recipe_Normalizers;
	use Neo_Pulse_App_Tasks_Store_Trait_Execution_Payload;
	use Neo_Pulse_App_Tasks_Store_Trait_Queries_Triggers;

	public static function install_tables(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset  = $wpdb->get_charset_collate();
		$projects = $wpdb->prefix . 'neo_pulse_team_task_projects';
		$tasks    = $wpdb->prefix . 'neo_pulse_team_tasks';
		$sections = $wpdb->prefix . 'neo_pulse_team_task_sections';
		$notes    = $wpdb->prefix . 'neo_pulse_team_task_notes';
		$files    = $wpdb->prefix . 'neo_pulse_team_task_files';

		dbDelta(
			"CREATE TABLE {$projects} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				team_id bigint(20) unsigned NOT NULL,
				payload_json longtext NOT NULL,
				status varchar(32) NOT NULL DEFAULT 'active',
				sort_order int(11) NOT NULL DEFAULT 0,
				created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				archived_at datetime DEFAULT NULL,
				PRIMARY KEY (id),
				KEY team_id (team_id),
				KEY status (status)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$sections} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				team_id bigint(20) unsigned NOT NULL,
				project_id bigint(20) unsigned NOT NULL,
				payload_json longtext NOT NULL,
				sort_order int(11) NOT NULL DEFAULT 0,
				created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				KEY team_project (team_id, project_id)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$tasks} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				team_id bigint(20) unsigned NOT NULL,
				project_id bigint(20) unsigned NOT NULL,
				section_id bigint(20) unsigned NOT NULL DEFAULT 0,
				parent_task_id bigint(20) unsigned NOT NULL DEFAULT 0,
				payload_json longtext NOT NULL,
				status varchar(32) NOT NULL DEFAULT 'todo',
				sort_order int(11) NOT NULL DEFAULT 0,
				completed_at datetime DEFAULT NULL,
				created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				KEY team_project (team_id, project_id),
				KEY section_id (section_id),
				KEY parent_task_id (parent_task_id),
				KEY status (status)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$notes} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				team_id bigint(20) unsigned NOT NULL,
				task_id bigint(20) unsigned NOT NULL,
				payload_json longtext NOT NULL,
				created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				KEY team_task (team_id, task_id)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$files} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				team_id bigint(20) unsigned NOT NULL,
				task_id bigint(20) unsigned NOT NULL,
				storage_path varchar(512) NOT NULL,
				payload_json longtext NOT NULL,
				created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				KEY team_task (team_id, task_id)
			) {$charset};"
		);
	}

	/**
	 * @param array<string,mixed> $payload
	 */
	public static function encode_payload( array $payload ): string {
		$keyword = isset( $payload['keyword'] ) ? (string) $payload['keyword'] : '';
		$ordered = array( 'keyword' => $keyword );
		foreach ( $payload as $key => $value ) {
			if ( $key === 'keyword' ) {
				continue;
			}
			$ordered[ $key ] = $value;
		}
		$json = wp_json_encode( $ordered, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
		return is_string( $json ) ? $json : '{}';
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function decode_payload( ?string $json ): array {
		if ( ! is_string( $json ) || $json === '' ) {
			return array();
		}
		$data = json_decode( $json, true );
		return is_array( $data ) ? $data : array();
	}

	public static function is_active_member( array $member ): bool {
		return (string) ( $member['status'] ?? '' ) === 'active';
	}

	/**
	 * @return array<string,mixed>|null
	 */
	private static function get_project_row( int $team_id, int $project_id ): ?array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_task_projects';
		$row   = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d AND team_id = %d", $project_id, $team_id ),
			ARRAY_A
		);
		return is_array( $row ) ? $row : null;
	}

	/**
	 * @return array<string,mixed>|null
	 */
	private static function get_task_row( int $team_id, int $task_id ): ?array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$row   = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d AND team_id = %d", $task_id, $team_id ),
			ARRAY_A
		);
		return is_array( $row ) ? $row : null;
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>|null
	 */
	private static function format_project( array $row ): ?array {
		$payload = self::decode_payload( $row['payload_json'] ?? '' );
		return array(
			'id'         => (int) $row['id'],
			'teamId'     => (int) $row['team_id'],
			'status'     => (string) $row['status'],
			'sortOrder'  => (int) $row['sort_order'],
			'createdAt'  => (string) $row['created_at'],
			'updatedAt'  => (string) $row['updated_at'],
			'archivedAt' => $row['archived_at'],
			'payload'    => $payload,
			'keyword'    => (string) ( $payload['keyword'] ?? '' ),
			'title'      => (string) ( $payload['title'] ?? '' ),
			'description'=> (string) ( $payload['description'] ?? '' ),
			'wordpressSiteId' => (string) ( $payload['wordpressSiteId'] ?? '' ),
			'isAutomation' => ! empty( $payload['isAutomation'] ),
			'sourceTemplateKeyword' => (string) ( $payload['sourceTemplateKeyword'] ?? '' ),
			'createdBy' => (int) ( $payload['createdBy'] ?? 0 ),
			'automationVisibility' => ! empty( $payload['isAutomation'] )
				? self::normalize_automation_visibility( $payload['automationVisibility'] ?? 'public' )
				: 'public',
		);
	}
}
