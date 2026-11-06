<?php
/**
 * Task list queries and trigger helpers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Tasks_Store_Trait_Queries_Triggers {

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_my_tasks( int $team_id, int $user_id ): array {
		global $wpdb;
		$table    = $wpdb->prefix . 'neo_pulse_team_tasks';
		$projects = $wpdb->prefix . 'neo_pulse_team_task_projects';
		$rows     = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT t.* FROM {$table} t
				INNER JOIN {$projects} p ON p.id = t.project_id AND p.team_id = t.team_id
				WHERE t.team_id = %d AND t.parent_task_id = 0 AND p.archived_at IS NULL
				ORDER BY t.sort_order ASC, t.id ASC",
				$team_id
			),
			ARRAY_A
		);
		if ( ! is_array( $rows ) ) {
			return array();
		}
		$out    = array();
		$seen   = array();
		$flo_id = self::pulse_bot_user_id();

		foreach ( $rows as $row ) {
			$formatted = self::format_task( $row );
			if ( ! $formatted ) {
				continue;
			}
			$id = (int) ( $formatted['id'] ?? 0 );
			if ( $id <= 0 ) {
				continue;
			}
			$assignees = $formatted['assigneeIds'];
			if ( ! in_array( $user_id, $assignees, true ) ) {
				continue;
			}
			$out[]        = $formatted;
			$seen[ $id ] = true;
		}

		if ( $flo_id > 0 ) {
			foreach ( $rows as $row ) {
				$formatted = self::format_task( $row );
				if ( ! $formatted ) {
					continue;
				}
				$id = (int) ( $formatted['id'] ?? 0 );
				if ( $id <= 0 || isset( $seen[ $id ] ) ) {
					continue;
				}
				$assignees = $formatted['assigneeIds'];
				if ( ! in_array( $flo_id, $assignees, true ) ) {
					continue;
				}
				$out[] = $formatted;
			}
		}

		return $out;
	}

	/**
	 * Tasks assigned to the Pulse AI bot user (read-only context for Assist).
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_pulse_assigned_tasks( int $team_id ): array {
		$flo_id = self::pulse_bot_user_id();
		if ( $flo_id <= 0 ) {
			return array();
		}
		$tasks = self::list_my_tasks( $team_id, $flo_id );
		$out   = array();
		foreach ( $tasks as $task ) {
			if ( ! is_array( $task ) ) {
				continue;
			}
			$desc = (string) ( $task['description'] ?? '' );
			if ( strlen( $desc ) > 240 ) {
				$desc = substr( $desc, 0, 237 ) . '...';
			}
			$out[] = array(
				'id'                  => (int) ( $task['id'] ?? 0 ),
				'title'               => (string) ( $task['title'] ?? '' ),
				'keyword'             => (string) ( $task['keyword'] ?? '' ),
				'projectId'           => (int) ( $task['projectId'] ?? 0 ),
				'projectTitle'        => (string) ( $task['projectTitle'] ?? '' ),
				'dueDate'             => (string) ( $task['dueDate'] ?? '' ),
				'dueTime'             => self::sanitize_due_time( $task['dueTime'] ?? '' ),
				'recurrenceRule'      => self::sanitize_recurrence_rule( $task['recurrenceRule'] ?? 'none' ),
				'scheduleMode'        => self::sanitize_schedule_mode( $task['scheduleMode'] ?? 'calendar' ),
				'triggerConfig'       => is_array( $task['triggerConfig'] ?? null )
					? self::sanitize_trigger_config( $task['triggerConfig'] )
					: null,
				'triggerMeta'         => is_array( $task['triggerMeta'] ?? null )
					? self::sanitize_trigger_meta( $task['triggerMeta'] )
					: null,
				'wordpressSiteId'     => (string) ( $task['wordpressSiteId'] ?? '' ),
				'status'              => (string) ( $task['status'] ?? 'todo' ),
				'description'         => $desc,
				'executionKind'       => self::sanitize_execution_kind( $task['executionKind'] ?? '' ),
				'executionPayload'    => is_array( $task['executionPayload'] ?? null )
					? self::sanitize_execution_payload( $task['executionPayload'] )
					: array(),
				'lastExecutionId'     => isset( $task['lastExecutionId'] ) ? (int) $task['lastExecutionId'] : null,
				'lastExecutionStatus' => isset( $task['lastExecutionStatus'] )
					? sanitize_key( (string) $task['lastExecutionStatus'] )
					: null,
			);
		}
		return $out;
	}

	public static function pulse_bot_user_id(): int {
		if ( ! class_exists( 'Neo_Pulse_App_Chat_Flo' ) ) {
			return 0;
		}
		return Neo_Pulse_App_Chat_Flo::ensure_global_user();
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function search_tasks( int $team_id, string $query ): array {
		$query = trim( $query );
		if ( $query === '' ) {
			return array();
		}
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$like  = '%' . $wpdb->esc_like( $query ) . '%';
		$rows  = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE team_id = %d AND parent_task_id = 0 AND payload_json LIKE %s ORDER BY id DESC LIMIT 100",
				$team_id,
				$like
			),
			ARRAY_A
		);
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
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_subtasks( int $team_id, int $parent_task_id ): array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$rows  = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE team_id = %d AND parent_task_id = %d ORDER BY sort_order ASC, id ASC",
				$team_id,
				$parent_task_id
			),
			ARRAY_A
		);
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
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_project_files( int $team_id, int $project_id ): array {
		global $wpdb;
		$tasks_table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$files_table = $wpdb->prefix . 'neo_pulse_team_task_files';
		$rows        = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT f.* FROM {$files_table} f
				INNER JOIN {$tasks_table} t ON t.id = f.task_id AND t.team_id = f.team_id
				WHERE f.team_id = %d AND t.project_id = %d
				ORDER BY f.id DESC",
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
			$formatted = self::format_file( $row );
			if ( $formatted ) {
				$task = self::get_task( $team_id, (int) $row['task_id'] );
				if ( $task ) {
					$formatted['taskTitle'] = (string) $task['title'];
				}
				$out[] = $formatted;
			}
		}
		return $out;
	}

	/**
	 * @return int
	 */
	public static function count_completed_today( int $team_id ): int {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$today = gmdate( 'Y-m-d' );
		$count = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$table} WHERE team_id = %d AND status = 'done' AND DATE(completed_at) = %s",
				$team_id,
				$today
			)
		);
		return is_numeric( $count ) ? (int) $count : 0;
	}

	/**
	 * @param array<string,mixed> $raw
	 * @return array<string,mixed>
	 */
	public static function sanitize_trigger_config( array $raw ): array {
		$sources = array();
		if ( ! empty( $raw['sources'] ) && is_array( $raw['sources'] ) ) {
			foreach ( $raw['sources'] as $source ) {
				$source = sanitize_key( (string) $source );
				if ( in_array( $source, self::TRIGGER_SOURCES, true ) ) {
					$sources[] = $source;
				}
			}
		}
		if ( count( $sources ) === 0 ) {
			$sources = array( 'gsc' );
		}
		$match = sanitize_key( (string) ( $raw['match'] ?? 'any' ) );
		if ( ! in_array( $match, self::TRIGGER_MATCH_MODES, true ) ) {
			$match = 'any';
		}
		$conditions = array();
		if ( ! empty( $raw['conditions'] ) && is_array( $raw['conditions'] ) ) {
			foreach ( $raw['conditions'] as $cond ) {
				if ( ! is_array( $cond ) ) {
					continue;
				}
				$signal = sanitize_key( (string) ( $cond['signal'] ?? '' ) );
				if ( ! in_array( $signal, self::TRIGGER_SIGNALS, true ) ) {
					continue;
				}
				$operator = sanitize_key( (string) ( $cond['operator'] ?? 'gte' ) );
				if ( ! in_array( $operator, array( 'gte', 'lte' ), true ) ) {
					$operator = 'gte';
				}
				$row = array(
					'signal'   => $signal,
					'operator' => $operator,
					'value'    => (float) ( $cond['value'] ?? 0 ),
				);
				if ( isset( $cond['minImpressions'] ) ) {
					$row['minImpressions'] = max( 0, (int) $cond['minImpressions'] );
				}
				$conditions[] = $row;
			}
		}
		return array(
			'sources'       => array_values( array_unique( $sources ) ),
			'match'         => $match,
			'conditions'    => $conditions,
			'lookbackDays'  => max( 1, min( 365, (int) ( $raw['lookbackDays'] ?? 28 ) ) ),
			'compareDays'   => max( 1, min( 365, (int) ( $raw['compareDays'] ?? 28 ) ) ),
			'pollHours'     => max( 1, min( 720, (int) ( $raw['pollHours'] ?? 24 ) ) ),
			'cooldownHours' => max( 1, min( 720, (int) ( $raw['cooldownHours'] ?? 72 ) ) ),
			'maxUrls'       => max( 1, min( 50, (int) ( $raw['maxUrls'] ?? 5 ) ) ),
		);
	}

	/**
	 * @param array<string,mixed> $raw
	 * @return array<string,mixed>
	 */
	public static function sanitize_trigger_meta( array $raw ): array {
		$out = array();
		foreach ( array( 'lastEvaluatedAt', 'lastFiredAt' ) as $key ) {
			if ( ! empty( $raw[ $key ] ) ) {
				$out[ $key ] = sanitize_text_field( (string) $raw[ $key ] );
			}
		}
		if ( isset( $raw['lastScannedCount'] ) ) {
			$out['lastScannedCount'] = max( 0, (int) $raw['lastScannedCount'] );
		}
		if ( isset( $raw['lastMatchedCount'] ) ) {
			$out['lastMatchedCount'] = max( 0, (int) $raw['lastMatchedCount'] );
		}
		if ( ! empty( $raw['lastSimulated'] ) ) {
			$out['lastSimulated'] = true;
		}
		if ( ! empty( $raw['urlCooldowns'] ) && is_array( $raw['urlCooldowns'] ) ) {
			$cooldowns = array();
			foreach ( $raw['urlCooldowns'] as $url => $iso ) {
				$url = esc_url_raw( (string) $url );
				$iso = sanitize_text_field( (string) $iso );
				if ( $url !== '' && $iso !== '' ) {
					$cooldowns[ $url ] = $iso;
				}
			}
			$out['urlCooldowns'] = $cooldowns;
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $meta_patch
	 */
	public static function patch_task_trigger_meta( int $team_id, int $task_id, array $meta_patch ): ?array {
		$row = self::get_task_row( $team_id, $task_id );
		if ( ! $row ) {
			return null;
		}
		$payload = self::decode_payload( $row['payload_json'] );
		$existing = is_array( $payload['triggerMeta'] ?? null ) ? $payload['triggerMeta'] : array();
		$payload['triggerMeta'] = self::sanitize_trigger_meta( array_merge( $existing, $meta_patch ) );
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
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_calendar_automation_tasks( int $team_id ): array {
		$out = array();
		foreach ( self::list_projects( $team_id ) as $project ) {
			if ( ! is_array( $project ) || ! self::project_is_automation( $project ) ) {
				continue;
			}
			$project_id = (int) ( $project['id'] ?? 0 );
			if ( $project_id <= 0 ) {
				continue;
			}
			foreach ( self::list_tasks( $team_id, $project_id, true ) as $task ) {
				if ( ! is_array( $task ) ) {
					continue;
				}
				if ( self::sanitize_schedule_mode( $task['scheduleMode'] ?? 'calendar' ) !== 'calendar' ) {
					continue;
				}
				if ( (string) ( $task['status'] ?? '' ) === 'done' ) {
					continue;
				}
				$desc = (string) ( $task['description'] ?? '' );
				if ( strlen( $desc ) > 240 ) {
					$desc = substr( $desc, 0, 237 ) . '...';
				}
				$out[] = array(
					'id'                  => (int) ( $task['id'] ?? 0 ),
					'title'               => (string) ( $task['title'] ?? '' ),
					'keyword'             => (string) ( $task['keyword'] ?? '' ),
					'projectId'           => (int) ( $task['projectId'] ?? 0 ),
					'projectTitle'        => (string) ( $task['projectTitle'] ?? '' ),
					'dueDate'             => (string) ( $task['dueDate'] ?? '' ),
					'dueTime'             => self::sanitize_due_time( $task['dueTime'] ?? '' ),
					'recurrenceRule'      => self::sanitize_recurrence_rule( $task['recurrenceRule'] ?? 'none' ),
					'scheduleMode'        => 'calendar',
					'triggerConfig'       => null,
					'triggerMeta'         => is_array( $task['triggerMeta'] ?? null )
						? self::sanitize_trigger_meta( $task['triggerMeta'] )
						: null,
					'wordpressSiteId'     => (string) ( $task['wordpressSiteId'] ?? '' ),
					'status'              => (string) ( $task['status'] ?? 'todo' ),
					'description'         => $desc,
					'executionKind'       => self::sanitize_execution_kind( $task['executionKind'] ?? '' ),
					'executionPayload'    => is_array( $task['executionPayload'] ?? null )
						? self::sanitize_execution_payload( $task['executionPayload'] )
						: array(),
					'lastExecutionId'     => isset( $task['lastExecutionId'] ) ? (int) $task['lastExecutionId'] : null,
					'lastExecutionStatus' => isset( $task['lastExecutionStatus'] )
						? sanitize_key( (string) $task['lastExecutionStatus'] )
						: null,
				);
			}
		}
		return $out;
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_trigger_tasks( int $team_id ): array {
		$out = array();
		foreach ( self::list_projects( $team_id ) as $project ) {
			if ( ! is_array( $project ) ) {
				continue;
			}
			$project_id = (int) ( $project['id'] ?? 0 );
			if ( $project_id <= 0 ) {
				continue;
			}
			foreach ( self::list_tasks( $team_id, $project_id, true ) as $task ) {
				if ( ! is_array( $task ) ) {
					continue;
				}
				if ( self::sanitize_schedule_mode( $task['scheduleMode'] ?? 'calendar' ) !== 'trigger' ) {
					continue;
				}
				if ( ! self::task_has_pulse_assignee( $task ) ) {
					continue;
				}
				if ( (string) ( $task['status'] ?? '' ) === 'done' ) {
					continue;
				}
				$out[] = $task;
			}
		}
		return $out;
	}
}
