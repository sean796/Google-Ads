<?php
/**
 * Task projects and sections.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Tasks_Store_Trait_Projects_Sections {

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function normalize_automation_visibility( $value ): string {
		$key = sanitize_key( (string) $value );
		return $key === 'private' ? 'private' : 'public';
	}

	/**
	 * @param array<string,mixed> $project
	 */
	public static function project_visible_to_user( array $project, int $viewer_user_id ): bool {
		if ( empty( $project['isAutomation'] ) ) {
			return true;
		}
		if ( $viewer_user_id <= 0 ) {
			return true;
		}
		if ( self::normalize_automation_visibility( $project['automationVisibility'] ?? 'public' ) !== 'private' ) {
			return true;
		}
		$created_by = (int) ( $project['createdBy'] ?? 0 );
		if ( $created_by <= 0 ) {
			return true;
		}
		return $created_by === $viewer_user_id;
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_projects( int $team_id, bool $include_archived = false, int $viewer_user_id = 0 ): array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_task_projects';
		$sql   = "SELECT * FROM {$table} WHERE team_id = %d";
		if ( ! $include_archived ) {
			$sql .= " AND archived_at IS NULL";
		}
		$sql .= ' ORDER BY sort_order ASC, id ASC';
		$rows  = $wpdb->get_results( $wpdb->prepare( $sql, $team_id ), ARRAY_A );
		if ( ! is_array( $rows ) ) {
			return array();
		}
		$out = array();
		foreach ( $rows as $row ) {
			$formatted = self::format_project( $row );
			if ( $formatted && self::project_visible_to_user( $formatted, $viewer_user_id ) ) {
				$out[] = $formatted;
			}
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|null
	 */
	public static function create_project( int $team_id, int $user_id, array $body ): ?array {
		$keyword = isset( $body['keyword'] ) ? sanitize_text_field( (string) $body['keyword'] ) : '';
		$title   = isset( $body['title'] ) ? sanitize_text_field( (string) $body['title'] ) : '';
		if ( $title === '' ) {
			return null;
		}
		if ( $keyword === '' ) {
			$keyword = sanitize_title( $title );
		}

		$payload = array(
			'keyword'     => $keyword,
			'kind'        => 'project',
			'title'       => $title,
			'description' => isset( $body['description'] ) ? sanitize_textarea_field( (string) $body['description'] ) : '',
			'status'      => 'active',
			'createdBy'   => $user_id,
		);
		if ( ! empty( $body['wordpressSiteId'] ) ) {
			$payload['wordpressSiteId'] = sanitize_text_field( (string) $body['wordpressSiteId'] );
		}
		if ( ! empty( $body['isAutomation'] ) ) {
			$payload['isAutomation'] = true;
		} elseif ( ! empty( $body['templateKeyword'] ) && class_exists( 'Neo_Pulse_App_Automation_Recipe_Registry' ) ) {
			$tpl_kw = sanitize_title( (string) $body['templateKeyword'] );
			if ( Neo_Pulse_App_Automation_Recipe_Registry::is_automation_keyword( $tpl_kw ) ) {
				$payload['isAutomation'] = true;
			}
		}
		if ( ! empty( $body['sourceTemplateKeyword'] ) ) {
			$payload['sourceTemplateKeyword'] = sanitize_title( (string) $body['sourceTemplateKeyword'] );
		} elseif ( ! empty( $body['templateKeyword'] ) ) {
			$payload['sourceTemplateKeyword'] = sanitize_title( (string) $body['templateKeyword'] );
		}
		if ( ! empty( $payload['isAutomation'] ) ) {
			$payload['automationVisibility'] = self::normalize_automation_visibility( $body['automationVisibility'] ?? 'private' );
		}

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_task_projects';
		$wpdb->insert(
			$table,
			array(
				'team_id'      => $team_id,
				'payload_json' => self::encode_payload( $payload ),
				'status'       => 'active',
				'sort_order'   => 0,
			),
			array( '%d', '%s', '%s', '%d' )
		);
		$id = (int) $wpdb->insert_id;
		if ( $id <= 0 ) {
			return null;
		}

		$default_section = self::create_section(
			$team_id,
			$id,
			array(
				'keyword' => 'recently-assigned',
				'title'   => 'Recently assigned',
			)
		);
		$default_section_id = is_array( $default_section ) ? (int) $default_section['id'] : 0;

		$body['_teamId']     = $team_id;
		$prepared_tasks      = self::prepare_default_tasks_for_create( $body );
		if ( count( $prepared_tasks ) > 0 ) {
			foreach ( $prepared_tasks as $idx => $task_def ) {
				self::create_task(
					$team_id,
					$id,
					$user_id,
					array_merge(
						$task_def,
						array(
							'sortOrder' => $idx,
							'sectionId' => $default_section_id,
						)
					)
				);
			}
		}

		return self::get_project( $team_id, $id );
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function get_project( int $team_id, int $project_id ): ?array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_task_projects';
		$row   = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d AND team_id = %d", $project_id, $team_id ),
			ARRAY_A
		);
		return is_array( $row ) ? self::format_project( $row ) : null;
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|null
	 */
	public static function update_project( int $team_id, int $project_id, array $body ): ?array {
		$row = self::get_project_row( $team_id, $project_id );
		if ( ! $row ) {
			return null;
		}
		$payload = self::decode_payload( $row['payload_json'] );
		if ( isset( $body['keyword'] ) ) {
			$payload['keyword'] = sanitize_text_field( (string) $body['keyword'] );
		}
		if ( isset( $body['title'] ) ) {
			$payload['title'] = sanitize_text_field( (string) $body['title'] );
		}
		if ( isset( $body['description'] ) ) {
			$payload['description'] = sanitize_textarea_field( (string) $body['description'] );
		}
		if ( array_key_exists( 'wordpressSiteId', $body ) ) {
			$payload['wordpressSiteId'] = sanitize_text_field( (string) $body['wordpressSiteId'] );
		}
		if ( array_key_exists( 'automationVisibility', $body ) ) {
			$payload['automationVisibility'] = self::normalize_automation_visibility( $body['automationVisibility'] );
		}

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_task_projects';
		$wpdb->update(
			$table,
			array( 'payload_json' => self::encode_payload( $payload ), 'updated_at' => gmdate( 'Y-m-d H:i:s' ) ),
			array( 'id' => $project_id, 'team_id' => $team_id ),
			array( '%s', '%s' ),
			array( '%d', '%d' )
		);
		return self::get_project( $team_id, $project_id );
	}

	public static function archive_project( int $team_id, int $project_id ): bool {
		foreach ( self::list_tasks( $team_id, $project_id, false ) as $task ) {
			$task_id = (int) ( $task['id'] ?? 0 );
			if ( $task_id > 0 ) {
				self::delete_task( $team_id, $task_id );
			}
		}

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_task_projects';
		$n     = $wpdb->update(
			$table,
			array( 'archived_at' => gmdate( 'Y-m-d H:i:s' ), 'status' => 'archived' ),
			array( 'id' => $project_id, 'team_id' => $team_id ),
			array( '%s', '%s' ),
			array( '%d', '%d' )
		);
		return $n !== false;
	}

	/**
	 * @param array<string,mixed>|null $project
	 */
	public static function project_is_automation( ?array $project ): bool {
		if ( ! is_array( $project ) ) {
			return false;
		}
		if ( ! empty( $project['isAutomation'] ) ) {
			return true;
		}
		$kw = sanitize_title( (string) ( $project['sourceTemplateKeyword'] ?? '' ) );
		if ( $kw === '' ) {
			$kw = sanitize_title( (string) ( $project['keyword'] ?? '' ) );
		}
		if ( $kw === '' ) {
			return false;
		}
		return class_exists( 'Neo_Pulse_App_Automation_Recipe_Registry' )
			&& Neo_Pulse_App_Automation_Recipe_Registry::is_automation_keyword( $kw );
	}

	/**
	 * @param array<string,mixed> $patch
	 * @return array<string,mixed>|null
	 */
	public static function patch_task_schedule_meta( int $team_id, int $task_id, array $patch ): ?array {
		$row = self::get_task_row( $team_id, $task_id );
		if ( ! $row ) {
			return null;
		}
		$payload = self::decode_payload( $row['payload_json'] );
		$meta    = is_array( $payload['scheduleMeta'] ?? null ) ? $payload['scheduleMeta'] : array();
		foreach ( $patch as $key => $value ) {
			$meta[ sanitize_key( (string) $key ) ] = is_scalar( $value ) ? (string) $value : wp_json_encode( $value );
		}
		$payload['scheduleMeta'] = $meta;

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$wpdb->update(
			$table,
			array(
				'payload_json' => self::encode_payload( $payload ),
				'updated_at'   => gmdate( 'Y-m-d H:i:s' ),
			),
			array( 'id' => $task_id, 'team_id' => $team_id ),
			array( '%s', '%s' ),
			array( '%d', '%d' )
		);
		return self::get_task( $team_id, $task_id );
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|null
	 */
	public static function create_section( int $team_id, int $project_id, array $body ): ?array {
		if ( ! self::get_project_row( $team_id, $project_id ) ) {
			return null;
		}
		$keyword = isset( $body['keyword'] ) ? sanitize_text_field( (string) $body['keyword'] ) : '';
		$title   = isset( $body['title'] ) ? sanitize_text_field( (string) $body['title'] ) : '';
		if ( $title === '' ) {
			return null;
		}
		if ( $keyword === '' ) {
			$keyword = sanitize_title( $title );
		}
		$payload = array(
			'keyword' => $keyword,
			'kind'    => 'section',
			'title'   => $title,
		);
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_task_sections';
		$wpdb->insert(
			$table,
			array(
				'team_id'      => $team_id,
				'project_id'   => $project_id,
				'payload_json' => self::encode_payload( $payload ),
				'sort_order'   => isset( $body['sortOrder'] ) ? (int) $body['sortOrder'] : 0,
			),
			array( '%d', '%d', '%s', '%d' )
		);
		$id = (int) $wpdb->insert_id;
		return $id > 0 ? self::get_section( $team_id, $id ) : null;
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function get_section( int $team_id, int $section_id ): ?array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_task_sections';
		$row   = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d AND team_id = %d", $section_id, $team_id ),
			ARRAY_A
		);
		return is_array( $row ) ? self::format_section( $row ) : null;
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_sections( int $team_id, int $project_id ): array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_task_sections';
		$rows  = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE team_id = %d AND project_id = %d ORDER BY sort_order ASC, id ASC",
				$team_id,
				$project_id
			),
			ARRAY_A
		);
		if ( ! is_array( $rows ) ) {
			return array();
		}
		$out = array();
		foreach ( $rows as $row ) {
			$formatted = self::format_section( $row );
			if ( $formatted ) {
				$out[] = $formatted;
			}
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|null
	 */
	public static function update_section( int $team_id, int $section_id, array $body ): ?array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_task_sections';
		$row   = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d AND team_id = %d", $section_id, $team_id ),
			ARRAY_A
		);
		if ( ! is_array( $row ) ) {
			return null;
		}
		$payload = self::decode_payload( $row['payload_json'] );
		if ( isset( $body['title'] ) ) {
			$payload['title'] = sanitize_text_field( (string) $body['title'] );
		}
		if ( isset( $body['keyword'] ) ) {
			$payload['keyword'] = sanitize_text_field( (string) $body['keyword'] );
		}
		$sort_order = isset( $body['sortOrder'] ) ? (int) $body['sortOrder'] : (int) $row['sort_order'];
		$wpdb->update(
			$table,
			array(
				'payload_json' => self::encode_payload( $payload ),
				'sort_order'   => $sort_order,
			),
			array( 'id' => $section_id, 'team_id' => $team_id ),
			array( '%s', '%d' ),
			array( '%d', '%d' )
		);
		return self::get_section( $team_id, $section_id );
	}

	public static function delete_section( int $team_id, int $section_id ): bool {
		global $wpdb;
		$tasks_table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$table       = $wpdb->prefix . 'neo_pulse_team_task_sections';

		$parent_rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT id FROM {$tasks_table} WHERE team_id = %d AND section_id = %d AND parent_task_id = 0",
				$team_id,
				$section_id
			),
			ARRAY_A
		);
		if ( is_array( $parent_rows ) ) {
			foreach ( $parent_rows as $row ) {
				$task_id = (int) ( $row['id'] ?? 0 );
				if ( $task_id <= 0 ) {
					continue;
				}
				$subtasks = self::list_subtasks( $team_id, $task_id );
				foreach ( $subtasks as $sub ) {
					self::delete_task( $team_id, (int) $sub['id'] );
				}
				self::delete_task( $team_id, $task_id );
			}
		}

		$remaining = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT id FROM {$tasks_table} WHERE team_id = %d AND section_id = %d",
				$team_id,
				$section_id
			)
		);
		if ( is_array( $remaining ) ) {
			foreach ( $remaining as $task_id ) {
				self::delete_task( $team_id, (int) $task_id );
			}
		}

		$n = $wpdb->delete( $table, array( 'id' => $section_id, 'team_id' => $team_id ), array( '%d', '%d' ) );
		return $n !== false && $n > 0;
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>|null
	 */
	private static function format_section( array $row ): ?array {
		$payload = self::decode_payload( $row['payload_json'] ?? '' );
		return array(
			'id'        => (int) $row['id'],
			'teamId'    => (int) $row['team_id'],
			'projectId' => (int) $row['project_id'],
			'sortOrder' => (int) $row['sort_order'],
			'createdAt' => (string) $row['created_at'],
			'payload'   => $payload,
			'keyword'   => (string) ( $payload['keyword'] ?? '' ),
			'title'     => (string) ( $payload['title'] ?? '' ),
		);
	}

	/**
	 * @param mixed $raw
	 */
	public static function sanitize_recurrence_rule( $raw ): string {
		$rule = sanitize_key( (string) $raw );
		return in_array( $rule, self::RECURRENCE_RULES, true ) ? $rule : 'none';
	}

	/**
	 * @param mixed $raw
	 */
	public static function sanitize_due_time( $raw ): string {
		$time = sanitize_text_field( (string) $raw );
		if ( $time === '' ) {
			return '';
		}
		if ( ! preg_match( '/^(\d{1,2}):(\d{2})(?::\d{2})?$/', $time, $m ) ) {
			return '';
		}
		$hour   = (int) $m[1];
		$minute = (int) $m[2];
		if ( $hour < 0 || $hour > 23 || $minute < 0 || $minute > 59 ) {
			return '';
		}
		return sprintf( '%02d:%02d', $hour, $minute );
	}

	/**
	 * @param mixed $raw
	 */
	public static function sanitize_schedule_mode( $raw ): string {
		$mode = sanitize_key( (string) $raw );
		return in_array( $mode, self::SCHEDULE_MODES, true ) ? $mode : 'calendar';
	}
}
