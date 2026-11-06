<?php
/**
 * Core task CRUD and notes.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Tasks_Store_Trait_Crud {

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_tasks( int $team_id, int $project_id, bool $top_level_only = true ): array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$sql   = "SELECT * FROM {$table} WHERE team_id = %d AND project_id = %d";
		if ( $top_level_only ) {
			$sql .= ' AND parent_task_id = 0';
		}
		$sql .= ' ORDER BY sort_order ASC, id ASC';
		$rows  = $wpdb->get_results( $wpdb->prepare( $sql, $team_id, $project_id ), ARRAY_A );
		if ( ! is_array( $rows ) ) {
			return array();
		}
		$out = array();
		foreach ( $rows as $row ) {
			$formatted = self::format_task( $row );
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
	public static function create_task( int $team_id, int $project_id, int $user_id, array $body ): ?array {
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

		$status = isset( $body['status'] ) ? sanitize_text_field( (string) $body['status'] ) : 'todo';
		if ( ! in_array( $status, self::STATUSES, true ) ) {
			$status = 'todo';
		}

		$assignee_ids = self::filter_team_assignee_ids(
			$team_id,
			is_array( $body['assigneeIds'] ?? null ) ? array_map( 'intval', $body['assigneeIds'] ) : array()
		);

		$tag_ids = array();
		if ( ! empty( $body['tagIds'] ) && is_array( $body['tagIds'] ) ) {
			foreach ( $body['tagIds'] as $tag ) {
				$tag = sanitize_text_field( (string) $tag );
				if ( $tag !== '' ) {
					$tag_ids[] = $tag;
				}
			}
		}

		$section_id     = isset( $body['sectionId'] ) ? (int) $body['sectionId'] : 0;
		$parent_task_id = isset( $body['parentTaskId'] ) ? (int) $body['parentTaskId'] : 0;

		$payload = array(
			'keyword'      => $keyword,
			'kind'         => 'task',
			'title'        => $title,
			'status'       => $status,
			'assigneeIds'  => $assignee_ids,
			'tagIds'       => $tag_ids,
			'description'  => isset( $body['description'] ) ? sanitize_textarea_field( (string) $body['description'] ) : '',
			'dueDate'        => isset( $body['dueDate'] ) ? sanitize_text_field( (string) $body['dueDate'] ) : '',
			'dueTime'        => self::sanitize_due_time( $body['dueTime'] ?? '' ),
			'recurrenceRule' => self::sanitize_recurrence_rule( $body['recurrenceRule'] ?? 'none' ),
			'createdBy'      => $user_id,
		);
		if ( isset( $body['executionKind'] ) ) {
			$payload['executionKind'] = self::sanitize_execution_kind( $body['executionKind'] );
		}
		if ( isset( $body['executionPayload'] ) && is_array( $body['executionPayload'] ) ) {
			$existing_ep = is_array( $payload['executionPayload'] ?? null ) ? $payload['executionPayload'] : array();
			$merged_ep   = array_merge( $existing_ep, $body['executionPayload'] );
			$payload['executionPayload'] = self::sanitize_execution_payload( $merged_ep );
		}
		if ( isset( $body['scheduleMode'] ) ) {
			$payload['scheduleMode'] = self::sanitize_schedule_mode( $body['scheduleMode'] );
		}
		if ( isset( $body['triggerConfig'] ) && is_array( $body['triggerConfig'] ) ) {
			$payload['triggerConfig'] = self::sanitize_trigger_config( $body['triggerConfig'] );
		}

		$project = self::get_project( $team_id, $project_id );
		$payload = self::merge_automation_pulse_assignee_into_payload( $team_id, $payload, $project );

		$sort_order = isset( $body['sortOrder'] ) ? (int) $body['sortOrder'] : 0;
		$completed  = $status === 'done' ? gmdate( 'Y-m-d H:i:s' ) : null;

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$wpdb->insert(
			$table,
			array(
				'team_id'        => $team_id,
				'project_id'     => $project_id,
				'section_id'     => $section_id,
				'parent_task_id' => $parent_task_id,
				'payload_json'   => self::encode_payload( $payload ),
				'status'         => $status,
				'sort_order'     => $sort_order,
				'completed_at'   => $completed,
			),
			array( '%d', '%d', '%d', '%d', '%s', '%s', '%d', '%s' )
		);
		$id = (int) $wpdb->insert_id;
		if ( $id <= 0 ) {
			return null;
		}
		$task = self::get_task( $team_id, $id );
		if ( is_array( $task ) && class_exists( 'Neo_Pulse_App_Tasks_Assignments' ) ) {
			Neo_Pulse_App_Tasks_Assignments::notify_new_assignees( $team_id, $user_id, $task, array() );
		}
		return $task;
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function get_task( int $team_id, int $task_id ): ?array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$row   = $wpdb->get_row(
			$wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d AND team_id = %d", $task_id, $team_id ),
			ARRAY_A
		);
		return is_array( $row ) ? self::format_task( $row ) : null;
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|null
	 */
	public static function update_task( int $team_id, int $task_id, array $body, int $actor_user_id = 0 ): ?array {
		$row = self::get_task_row( $team_id, $task_id );
		if ( ! $row ) {
			return null;
		}
		$payload = self::decode_payload( $row['payload_json'] );
		$status  = (string) $row['status'];
		$previous_assignee_ids = is_array( $payload['assigneeIds'] ?? null )
			? array_map( 'intval', $payload['assigneeIds'] )
			: array();

		if ( isset( $body['keyword'] ) ) {
			$payload['keyword'] = sanitize_text_field( (string) $body['keyword'] );
		}
		if ( isset( $body['title'] ) ) {
			$payload['title'] = sanitize_text_field( (string) $body['title'] );
		}
		if ( isset( $body['description'] ) ) {
			$payload['description'] = sanitize_textarea_field( (string) $body['description'] );
		}
		if ( isset( $body['dueDate'] ) ) {
			$payload['dueDate'] = sanitize_text_field( (string) $body['dueDate'] );
		}
		if ( array_key_exists( 'dueTime', $body ) ) {
			$payload['dueTime'] = self::sanitize_due_time( $body['dueTime'] );
		}
		if ( isset( $body['assigneeIds'] ) && is_array( $body['assigneeIds'] ) ) {
			$payload['assigneeIds'] = self::filter_team_assignee_ids(
				$team_id,
				array_map( 'intval', $body['assigneeIds'] )
			);
		}
		if ( isset( $body['recurrenceRule'] ) ) {
			$payload['recurrenceRule'] = self::sanitize_recurrence_rule( $body['recurrenceRule'] );
		}
		if ( isset( $body['executionKind'] ) ) {
			$payload['executionKind'] = self::sanitize_execution_kind( $body['executionKind'] );
		}
		if ( isset( $body['executionPayload'] ) && is_array( $body['executionPayload'] ) ) {
			$existing_ep = is_array( $payload['executionPayload'] ?? null ) ? $payload['executionPayload'] : array();
			$merged_ep   = array_merge( $existing_ep, $body['executionPayload'] );
			$payload['executionPayload'] = self::sanitize_execution_payload( $merged_ep );
		}
		if ( isset( $body['scheduleMode'] ) ) {
			$payload['scheduleMode'] = self::sanitize_schedule_mode( $body['scheduleMode'] );
		}
		if ( isset( $body['triggerConfig'] ) && is_array( $body['triggerConfig'] ) ) {
			$payload['triggerConfig'] = self::sanitize_trigger_config( $body['triggerConfig'] );
		}
		if ( isset( $body['tagIds'] ) && is_array( $body['tagIds'] ) ) {
			$tag_ids = array();
			foreach ( $body['tagIds'] as $tag ) {
				$tag = sanitize_text_field( (string) $tag );
				if ( $tag !== '' ) {
					$tag_ids[] = $tag;
				}
			}
			$payload['tagIds'] = $tag_ids;
		}
		if ( isset( $body['sectionId'] ) ) {
			$section_id = (int) $body['sectionId'];
		} else {
			$section_id = (int) ( $row['section_id'] ?? 0 );
		}
		if ( isset( $body['sortOrder'] ) ) {
			$sort_order = (int) $body['sortOrder'];
		} else {
			$sort_order = (int) ( $row['sort_order'] ?? 0 );
		}
		if ( isset( $body['status'] ) ) {
			$new_status = sanitize_text_field( (string) $body['status'] );
			if ( in_array( $new_status, self::STATUSES, true ) ) {
				$status           = $new_status;
				$payload['status'] = $new_status;
			}
		}

		$completed = $status === 'done' ? gmdate( 'Y-m-d H:i:s' ) : null;

		$project = self::get_project( $team_id, (int) ( $row['project_id'] ?? 0 ) );
		$payload = self::merge_automation_pulse_assignee_into_payload( $team_id, $payload, $project );

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$wpdb->update(
			$table,
			array(
				'payload_json' => self::encode_payload( $payload ),
				'status'       => $status,
				'section_id'   => $section_id,
				'sort_order'   => $sort_order,
				'completed_at' => $completed,
				'updated_at'   => gmdate( 'Y-m-d H:i:s' ),
			),
			array( 'id' => $task_id, 'team_id' => $team_id ),
			array( '%s', '%s', '%d', '%d', '%s', '%s' ),
			array( '%d', '%d' )
		);
		$task = self::get_task( $team_id, $task_id );
		if ( is_array( $task ) && class_exists( 'Neo_Pulse_App_Tasks_Assignments' ) ) {
			Neo_Pulse_App_Tasks_Assignments::notify_new_assignees(
				$team_id,
				$actor_user_id,
				$task,
				$previous_assignee_ids
			);
		}
		return $task;
	}

	public static function delete_task( int $team_id, int $task_id ): bool {
		global $wpdb;
		$tasks = $wpdb->prefix . 'neo_pulse_team_tasks';
		$notes = $wpdb->prefix . 'neo_pulse_team_task_notes';
		$files = $wpdb->prefix . 'neo_pulse_team_task_files';

		$file_rows = $wpdb->get_results(
			$wpdb->prepare( "SELECT storage_path FROM {$files} WHERE team_id = %d AND task_id = %d", $team_id, $task_id ),
			ARRAY_A
		);
		if ( is_array( $file_rows ) ) {
			foreach ( $file_rows as $fr ) {
				$rel = (string) ( $fr['storage_path'] ?? '' );
				if ( $rel !== '' ) {
					foreach ( Neo_Pulse_App_Data_Paths::rel_abs_candidates( $rel ) as $abs ) {
						if ( is_readable( $abs ) ) {
							wp_delete_file( $abs );
						}
					}
				}
			}
		}

		$wpdb->delete( $notes, array( 'team_id' => $team_id, 'task_id' => $task_id ), array( '%d', '%d' ) );
		$wpdb->delete( $files, array( 'team_id' => $team_id, 'task_id' => $task_id ), array( '%d', '%d' ) );
		$n = $wpdb->delete( $tasks, array( 'id' => $task_id, 'team_id' => $team_id ), array( '%d', '%d' ) );
		return $n !== false && $n > 0;
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_notes( int $team_id, int $task_id ): array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_task_notes';
		$rows  = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE team_id = %d AND task_id = %d ORDER BY id ASC",
				$team_id,
				$task_id
			),
			ARRAY_A
		);
		if ( ! is_array( $rows ) ) {
			return array();
		}
		$out = array();
		foreach ( $rows as $row ) {
			$formatted = self::format_note( $row );
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
	public static function add_note( int $team_id, int $task_id, int $user_id, array $body ): ?array {
		if ( ! self::get_task_row( $team_id, $task_id ) ) {
			return null;
		}
		$body_text = isset( $body['body'] ) ? sanitize_textarea_field( (string) $body['body'] ) : '';
		if ( $body_text === '' ) {
			return null;
		}
		$keyword = isset( $body['keyword'] ) ? sanitize_text_field( (string) $body['keyword'] ) : 'note';
		$mention_ids = array();
		if ( ! empty( $body['mentionUserIds'] ) && is_array( $body['mentionUserIds'] ) ) {
			foreach ( $body['mentionUserIds'] as $uid ) {
				$uid = (int) $uid;
				if ( $uid > 0 ) {
					$mention_ids[] = $uid;
				}
			}
		}
		$payload = array(
			'keyword'         => $keyword,
			'kind'            => 'note',
			'body'            => $body_text,
			'authorId'        => $user_id,
			'mentionUserIds'  => $mention_ids,
		);

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_task_notes';
		$wpdb->insert(
			$table,
			array(
				'team_id'      => $team_id,
				'task_id'      => $task_id,
				'payload_json' => self::encode_payload( $payload ),
			),
			array( '%d', '%d', '%s' )
		);
		$id = (int) $wpdb->insert_id;
		if ( $id <= 0 ) {
			return null;
		}
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ), ARRAY_A );
		return is_array( $row ) ? self::format_note( $row ) : null;
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>|null
	 */
	private static function format_task( array $row ): ?array {
		$payload = self::decode_payload( $row['payload_json'] ?? '' );
		$project = self::get_project( (int) $row['team_id'], (int) $row['project_id'] );
		$task    = array(
			'id'           => (int) $row['id'],
			'teamId'       => (int) $row['team_id'],
			'projectId'    => (int) $row['project_id'],
			'sectionId'    => (int) ( $row['section_id'] ?? 0 ),
			'parentTaskId' => (int) ( $row['parent_task_id'] ?? 0 ),
			'status'       => (string) $row['status'],
			'sortOrder'    => (int) $row['sort_order'],
			'completedAt'  => $row['completed_at'],
			'createdAt'    => (string) $row['created_at'],
			'updatedAt'    => (string) $row['updated_at'],
			'payload'      => $payload,
			'keyword'      => (string) ( $payload['keyword'] ?? '' ),
			'title'        => (string) ( $payload['title'] ?? '' ),
			'description'  => (string) ( $payload['description'] ?? '' ),
			'dueDate'      => (string) ( $payload['dueDate'] ?? '' ),
			'dueTime'      => self::sanitize_due_time( $payload['dueTime'] ?? '' ),
			'assigneeIds'  => is_array( $payload['assigneeIds'] ?? null ) ? array_map( 'intval', $payload['assigneeIds'] ) : array(),
			'tagIds'          => is_array( $payload['tagIds'] ?? null ) ? array_map( 'strval', $payload['tagIds'] ) : array(),
			'projectTitle'    => is_array( $project ) ? (string) ( $project['title'] ?? '' ) : '',
			'wordpressSiteId' => self::project_wordpress_site_id( $project ),
			'recurrenceRule'  => self::sanitize_recurrence_rule( $payload['recurrenceRule'] ?? 'none' ),
			'scheduleMode'    => self::sanitize_schedule_mode( $payload['scheduleMode'] ?? 'calendar' ),
			'triggerConfig'   => is_array( $payload['triggerConfig'] ?? null )
				? self::sanitize_trigger_config( $payload['triggerConfig'] )
				: null,
			'triggerMeta'     => is_array( $payload['triggerMeta'] ?? null )
				? self::sanitize_trigger_meta( $payload['triggerMeta'] )
				: null,
			'scheduleMeta'    => is_array( $payload['scheduleMeta'] ?? null ) ? $payload['scheduleMeta'] : null,
			'executionKind'   => self::sanitize_execution_kind( $payload['executionKind'] ?? '' ),
			'executionPayload'=> is_array( $payload['executionPayload'] ?? null )
				? self::sanitize_execution_payload( $payload['executionPayload'] )
				: array(),
			'lastExecutionId' => isset( $payload['lastExecutionId'] ) ? (int) $payload['lastExecutionId'] : null,
			'lastExecutionStatus' => isset( $payload['lastExecutionStatus'] )
				? sanitize_key( (string) $payload['lastExecutionStatus'] )
				: null,
		);
		$task = self::normalize_post_creator_task( $task, $project );
		self::maybe_persist_post_creator_task( (int) $row['team_id'], (int) $row['id'], $payload, $task );
		$task = self::normalize_gsc_reporting_task( $task, $project );
		self::maybe_persist_gsc_reporting_task( (int) $row['team_id'], (int) $row['id'], $payload, $task );
		$task = self::normalize_ads_reporting_task( $task, $project );
		self::maybe_persist_ads_reporting_task( (int) $row['team_id'], (int) $row['id'], $payload, $task );
		$task = self::normalize_research_local_dominator_task( $task, $project );
		self::maybe_persist_research_local_dominator_task( (int) $row['team_id'], (int) $row['id'], $payload, $task );
		$task = self::normalize_research_chatgpt_audit_task( $task, $project );
		self::maybe_persist_research_chatgpt_audit_task( (int) $row['team_id'], (int) $row['id'], $payload, $task );
		$task = self::normalize_automation_pulse_assignee( $task, $project, (int) $row['team_id'], (int) $row['id'] );
		return $task;
	}

	/**
	 * @param array<string,mixed> $task
	 */
	public static function task_has_pulse_assignee( array $task ): bool {
		$pulse_id = self::pulse_bot_user_id();
		if ( $pulse_id <= 0 ) {
			return false;
		}
		$assignees = isset( $task['assigneeIds'] ) && is_array( $task['assigneeIds'] )
			? array_map( 'intval', $task['assigneeIds'] )
			: array();
		return in_array( $pulse_id, $assignees, true );
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>|null
	 */
	private static function format_note( array $row ): ?array {
		$payload = self::decode_payload( $row['payload_json'] ?? '' );
		return array(
			'id'        => (int) $row['id'],
			'teamId'    => (int) $row['team_id'],
			'taskId'    => (int) $row['task_id'],
			'createdAt' => (string) $row['created_at'],
			'payload'   => $payload,
			'body'      => (string) ( $payload['body'] ?? '' ),
			'authorId'       => (int) ( $payload['authorId'] ?? 0 ),
			'keyword'        => (string) ( $payload['keyword'] ?? '' ),
			'mentionUserIds' => is_array( $payload['mentionUserIds'] ?? null ) ? array_map( 'intval', $payload['mentionUserIds'] ) : array(),
		);
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>|null
	 */
	public static function format_file( array $row ): ?array {
		$payload = self::decode_payload( $row['payload_json'] ?? '' );
		return array(
			'id'          => (int) $row['id'],
			'teamId'      => (int) $row['team_id'],
			'taskId'      => (int) $row['task_id'],
			'storagePath' => (string) $row['storage_path'],
			'createdAt'   => (string) $row['created_at'],
			'payload'     => $payload,
			'fileName'    => (string) ( $payload['fileName'] ?? '' ),
			'mime'        => (string) ( $payload['mime'] ?? '' ),
			'uploadedBy'  => (int) ( $payload['uploadedBy'] ?? 0 ),
			'keyword'     => (string) ( $payload['keyword'] ?? '' ),
		);
	}
}
