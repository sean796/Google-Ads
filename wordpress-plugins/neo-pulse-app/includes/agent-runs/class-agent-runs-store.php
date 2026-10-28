<?php
/**
 * Agent run persistence (automation jobs for Running Agents sidebar).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Agent_Runs_Store {

	const STATUSES = array( 'queued', 'running', 'done', 'failed', 'cancelled' );

	const SOURCES = array( 'pulse_assist', 'task_manager', 'workflow' );

	public static function install_tables(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset = $wpdb->get_charset_collate();
		$runs    = $wpdb->prefix . 'neo_pulse_agent_runs';
		$steps   = $wpdb->prefix . 'neo_pulse_agent_run_steps';

		dbDelta(
			"CREATE TABLE {$runs} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				team_id bigint(20) unsigned NOT NULL,
				created_by bigint(20) unsigned NOT NULL DEFAULT 0,
				title varchar(255) NOT NULL DEFAULT '',
				recipe_key varchar(64) NOT NULL DEFAULT '',
				status varchar(32) NOT NULL DEFAULT 'queued',
				source varchar(32) NOT NULL DEFAULT 'pulse_assist',
				task_id bigint(20) unsigned NOT NULL DEFAULT 0,
				context_json longtext NOT NULL,
				plan_json longtext NOT NULL,
				result_json longtext NULL,
				error_message text NULL,
				client_batch_key varchar(128) NOT NULL DEFAULT '',
				started_at datetime DEFAULT NULL,
				finished_at datetime DEFAULT NULL,
				created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				KEY team_status (team_id, status),
				KEY team_task (team_id, task_id),
				KEY created_at (created_at)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$steps} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				run_id bigint(20) unsigned NOT NULL,
				step_index int(11) NOT NULL DEFAULT 0,
				step_key varchar(128) NOT NULL DEFAULT '',
				label varchar(255) NOT NULL DEFAULT '',
				status varchar(32) NOT NULL DEFAULT 'pending',
				payload_json longtext NULL,
				created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				KEY run_id (run_id),
				KEY run_step (run_id, step_index),
				KEY run_step_key (run_id, step_key)
			) {$charset};"
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|null
	 */
	public static function create_run( int $team_id, int $user_id, array $body ): ?array {
		if ( $team_id <= 0 || $user_id <= 0 ) {
			return null;
		}

		$recipe_key = sanitize_key( (string) ( $body['recipeKey'] ?? $body['recipe_key'] ?? '' ) );
		if ( ! Neo_Pulse_App_Agent_Runs_Recipe_Registry::is_valid( $recipe_key ) ) {
			return null;
		}

		$source = sanitize_key( (string) ( $body['source'] ?? 'pulse_assist' ) );
		if ( ! in_array( $source, self::SOURCES, true ) ) {
			$source = 'pulse_assist';
		}

		$task_id = (int) ( $body['taskId'] ?? $body['task_id'] ?? 0 );
		if ( $task_id > 0 ) {
			$task = Neo_Pulse_App_Tasks_Store::get_task( $team_id, $task_id );
			if ( ! $task ) {
				return null;
			}
		}

		$title = sanitize_text_field( (string) ( $body['title'] ?? '' ) );
		if ( $title === '' ) {
			$title = Neo_Pulse_App_Agent_Runs_Recipe_Registry::title_for( $recipe_key );
		}

		$context = isset( $body['context'] ) && is_array( $body['context'] ) ? $body['context'] : array();
		$plan    = isset( $body['plan'] ) && is_array( $body['plan'] ) ? $body['plan'] : array();
		if ( isset( $body['planJson'] ) && is_array( $body['planJson'] ) ) {
			$plan = $body['planJson'];
		}
		if ( in_array( $recipe_key, array( 'post_creator' ), true ) && empty( $plan['executionMode'] ) ) {
			$plan['executionMode'] = 'server';
		}

		$site_id = trim( (string) ( $context['siteId'] ?? '' ) );
		if ( $site_id !== '' && in_array( $recipe_key, array( 'post_creator', 'content_gap_check' ), true ) ) {
			$existing = self::find_active_run_for_site( $team_id, $recipe_key, $site_id );
			if ( is_array( $existing ) ) {
				return $existing;
			}
		}

		$uses_server = in_array( $recipe_key, array( 'post_creator' ), true )
			|| ( sanitize_key( (string) ( $plan['executionMode'] ?? '' ) ) === 'server' );
		$initial_status = $uses_server ? 'running' : 'queued';

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_agent_runs';
		$now   = current_time( 'mysql', true );

		$inserted = $wpdb->insert(
			$table,
			array(
				'team_id'           => $team_id,
				'created_by'        => $user_id,
				'title'             => $title,
				'recipe_key'        => $recipe_key,
				'status'            => $initial_status,
				'source'            => $source,
				'task_id'           => $task_id,
				'context_json'      => wp_json_encode( $context ),
				'plan_json'         => wp_json_encode( $plan ),
				'result_json'       => null,
				'error_message'     => null,
				'client_batch_key'  => '',
				'started_at'        => $uses_server ? $now : null,
				'finished_at'       => null,
				'created_at'        => $now,
				'updated_at'        => $now,
			),
			array( '%d', '%d', '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s' )
		);

		if ( ! $inserted ) {
			return null;
		}

		return self::get_run( $team_id, (int) $wpdb->insert_id );
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	/**
	 * One active editorial agent per site (post creator or content gap check).
	 *
	 * @return array<string,mixed>|null
	 */
	public static function find_active_run_for_site( int $team_id, string $recipe_key, string $site_id ): ?array {
		$recipe_key = sanitize_key( $recipe_key );
		$site_id    = trim( $site_id );
		if ( $team_id <= 0 || $site_id === '' || ! in_array( $recipe_key, array( 'post_creator', 'content_gap_check' ), true ) ) {
			return null;
		}

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_agent_runs';
		$rows  = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE team_id = %d AND recipe_key = %s AND status IN ('queued','running') ORDER BY id DESC LIMIT 25",
				$team_id,
				$recipe_key
			),
			ARRAY_A
		);
		if ( ! is_array( $rows ) ) {
			return null;
		}

		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$context = array();
			if ( ! empty( $row['context_json'] ) ) {
				$decoded = json_decode( (string) $row['context_json'], true );
				if ( is_array( $decoded ) ) {
					$context = $decoded;
				}
			}
			if ( trim( (string) ( $context['siteId'] ?? '' ) ) !== $site_id ) {
				continue;
			}
			$formatted = self::format_run_row( $row );
			if ( is_array( $formatted ) ) {
				return $formatted;
			}
		}

		return null;
	}

	public static function list_runs( int $team_id, array $filters = array() ): array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_agent_runs';

		$where  = array( 'team_id = %d' );
		$values = array( $team_id );

		if ( ! empty( $filters['status'] ) ) {
			$status = sanitize_key( (string) $filters['status'] );
			if ( in_array( $status, self::STATUSES, true ) ) {
				$where[]  = 'status = %s';
				$values[] = $status;
			}
		}

		if ( ! empty( $filters['source'] ) ) {
			$source = sanitize_key( (string) $filters['source'] );
			if ( in_array( $source, self::SOURCES, true ) ) {
				$where[]  = 'source = %s';
				$values[] = $source;
			}
		}

		if ( ! empty( $filters['task_id'] ) ) {
			$where[]  = 'task_id = %d';
			$values[] = (int) $filters['task_id'];
		}

		$limit = isset( $filters['limit'] ) ? min( 100, max( 1, (int) $filters['limit'] ) ) : 50;

		$sql = "SELECT * FROM {$table} WHERE " . implode( ' AND ', $where ) . ' ORDER BY id DESC LIMIT %d';
		$values[] = $limit;

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		$rows = $wpdb->get_results( $wpdb->prepare( $sql, $values ), ARRAY_A );
		if ( ! is_array( $rows ) ) {
			return array();
		}

		$out = array();
		foreach ( $rows as $row ) {
			$formatted = self::format_run_row( $row );
			if ( $formatted ) {
				$out[] = $formatted;
			}
		}
		return $out;
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function get_run( int $team_id, int $run_id, bool $with_steps = true ): ?array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_agent_runs';

		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE id = %d AND team_id = %d LIMIT 1",
				$run_id,
				$team_id
			),
			ARRAY_A
		);

		if ( ! is_array( $row ) ) {
			return null;
		}

		$run = self::format_run_row( $row );
		if ( ! $run ) {
			return null;
		}

		if ( $with_steps ) {
			$run['steps'] = self::list_steps( $run_id );
		}

		return $run;
	}

	/**
	 * @param array<string,mixed> $patch
	 * @return array<string,mixed>|null
	 */
	public static function patch_run( int $team_id, int $run_id, array $patch ): ?array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_agent_runs';

		$row = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE id = %d AND team_id = %d LIMIT 1",
				$run_id,
				$team_id
			),
			ARRAY_A
		);

		if ( ! is_array( $row ) ) {
			return null;
		}

		$previous_status = (string) ( $row['status'] ?? '' );

		$updates = array(
			'updated_at' => current_time( 'mysql', true ),
		);
		$formats = array( '%s' );

		if ( isset( $patch['status'] ) ) {
			$status = sanitize_key( (string) $patch['status'] );
			if ( in_array( $status, self::STATUSES, true ) ) {
				$updates['status'] = $status;
				$formats[]         = '%s';
				if ( $status === 'running' && empty( $row['started_at'] ) ) {
					$updates['started_at'] = current_time( 'mysql', true );
					$formats[]             = '%s';
				}
				if ( in_array( $status, array( 'done', 'failed', 'cancelled' ), true ) ) {
					$updates['finished_at'] = current_time( 'mysql', true );
					$formats[]              = '%s';
				}
			}
		}

		if ( isset( $patch['errorMessage'] ) || isset( $patch['error_message'] ) ) {
			$updates['error_message'] = sanitize_text_field(
				(string) ( $patch['errorMessage'] ?? $patch['error_message'] ?? '' )
			);
			$formats[] = '%s';
		}

		if ( isset( $patch['result'] ) && is_array( $patch['result'] ) ) {
			$existing_result = array();
			if ( ! empty( $row['result_json'] ) ) {
				$decoded = json_decode( (string) $row['result_json'], true );
				if ( is_array( $decoded ) ) {
					$existing_result = $decoded;
				}
			}
			$incoming_result = $patch['result'];
			if ( isset( $incoming_result['checkpoint'] ) && is_array( $incoming_result['checkpoint'] ) ) {
				$existing_checkpoint = isset( $existing_result['checkpoint'] ) && is_array( $existing_result['checkpoint'] )
					? $existing_result['checkpoint']
					: array();
				$incoming_result['checkpoint'] = array_merge( $existing_checkpoint, $incoming_result['checkpoint'] );
			}
			$merged_result = array_merge( $existing_result, $incoming_result );
			$updates['result_json'] = wp_json_encode( $merged_result );
			$formats[]              = '%s';
		}

		if ( isset( $patch['clientBatchKey'] ) || isset( $patch['client_batch_key'] ) ) {
			$updates['client_batch_key'] = sanitize_text_field(
				(string) ( $patch['clientBatchKey'] ?? $patch['client_batch_key'] ?? '' )
			);
			$formats[] = '%s';
		}

		if ( isset( $patch['plan'] ) && is_array( $patch['plan'] ) ) {
			$existing_plan = array();
			if ( ! empty( $row['plan_json'] ) ) {
				$decoded = json_decode( (string) $row['plan_json'], true );
				if ( is_array( $decoded ) ) {
					$existing_plan = $decoded;
				}
			}
			$updates['plan_json'] = wp_json_encode( array_merge( $existing_plan, $patch['plan'] ) );
			$formats[]            = '%s';
		}

		if ( isset( $patch['step'] ) && is_array( $patch['step'] ) ) {
			self::upsert_step( $run_id, $patch['step'] );
		}

		$wpdb->update(
			$table,
			$updates,
			array(
				'id'      => $run_id,
				'team_id' => $team_id,
			),
			$formats,
			array( '%d', '%d' )
		);

		$updated = self::get_run( $team_id, $run_id );
		if ( $updated && class_exists( 'Neo_Pulse_App_Push_Events' ) ) {
			Neo_Pulse_App_Push_Events::on_agent_run_terminal( $updated, $previous_status );
		}
		if ( $updated && class_exists( 'Neo_Pulse_App_Workflow_Trigger_Agent_Done' ) ) {
			Neo_Pulse_App_Workflow_Trigger_Agent_Done::on_agent_run_terminal( $updated, $previous_status );
		}
		return $updated;
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function cancel_run( int $team_id, int $run_id ): ?array {
		$run = self::get_run( $team_id, $run_id, false );
		if ( ! $run ) {
			return null;
		}
		if ( in_array( $run['status'], array( 'done', 'failed', 'cancelled' ), true ) ) {
			return $run;
		}
		return self::patch_run(
			$team_id,
			$run_id,
			array(
				'status' => 'cancelled',
			)
		);
	}

	public static function delete_run( int $team_id, int $run_id ): bool {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_agent_runs';
		$steps = $wpdb->prefix . 'neo_pulse_agent_run_steps';

		$exists = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT id FROM {$table} WHERE id = %d AND team_id = %d",
				$run_id,
				$team_id
			)
		);
		if ( $exists <= 0 ) {
			return false;
		}

		$wpdb->delete( $steps, array( 'run_id' => $run_id ), array( '%d' ) );
		$wpdb->delete(
			$table,
			array(
				'id'      => $run_id,
				'team_id' => $team_id,
			),
			array( '%d', '%d' )
		);

		return true;
	}

	/**
	 * @param array<int,string> $statuses
	 */
	public static function clear_runs( int $team_id, array $statuses ): int {
		global $wpdb;
		if ( $team_id <= 0 ) {
			return 0;
		}

		$allowed = array();
		foreach ( $statuses as $status ) {
			$key = sanitize_key( (string) $status );
			if ( in_array( $key, array( 'done', 'failed', 'cancelled' ), true ) ) {
				$allowed[] = $key;
			}
		}
		if ( empty( $allowed ) ) {
			$allowed = array( 'done', 'failed', 'cancelled' );
		}

		$table = $wpdb->prefix . 'neo_pulse_agent_runs';
		$steps = $wpdb->prefix . 'neo_pulse_agent_run_steps';
		$placeholders = implode( ',', array_fill( 0, count( $allowed ), '%s' ) );

		$ids = $wpdb->get_col(
			$wpdb->prepare(
				"SELECT id FROM {$table} WHERE team_id = %d AND status IN ({$placeholders})",
				array_merge( array( $team_id ), $allowed )
			)
		);

		if ( ! is_array( $ids ) || empty( $ids ) ) {
			return 0;
		}

		foreach ( $ids as $run_id ) {
			$wpdb->delete( $steps, array( 'run_id' => (int) $run_id ), array( '%d' ) );
		}

		$deleted = $wpdb->query(
			$wpdb->prepare(
				"DELETE FROM {$table} WHERE team_id = %d AND status IN ({$placeholders})",
				array_merge( array( $team_id ), $allowed )
			)
		);

		return is_numeric( $deleted ) ? (int) $deleted : 0;
	}

	/**
	 * @param array<string,mixed> $step
	 */
	public static function upsert_step( int $run_id, array $step ): void {
		self::install_tables();
		global $wpdb;
		$table    = $wpdb->prefix . 'neo_pulse_agent_run_steps';
		$step_key = sanitize_key( (string) ( $step['stepKey'] ?? $step['step_key'] ?? '' ) );

		if ( $step_key !== '' ) {
			$existing_id = (int) $wpdb->get_var(
				$wpdb->prepare(
					"SELECT id FROM {$table} WHERE run_id = %d AND step_key = %s ORDER BY id DESC LIMIT 1",
					$run_id,
					$step_key
				)
			);
			if ( $existing_id > 0 ) {
				self::update_step( $existing_id, $step );
				return;
			}
		}

		self::append_step( $run_id, $step );
	}

	/**
	 * @param array<string,mixed> $step
	 */
	private static function update_step( int $step_id, array $step ): void {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_agent_run_steps';

		$row = $wpdb->get_row(
			$wpdb->prepare( "SELECT payload_json FROM {$table} WHERE id = %d LIMIT 1", $step_id ),
			ARRAY_A
		);
		$existing_payload = array();
		if ( is_array( $row ) && ! empty( $row['payload_json'] ) ) {
			$decoded = json_decode( (string) $row['payload_json'], true );
			if ( is_array( $decoded ) ) {
				$existing_payload = $decoded;
			}
		}

		$label  = sanitize_text_field( (string) ( $step['label'] ?? '' ) );
		$status = sanitize_key( (string) ( $step['status'] ?? 'running' ) );
		if ( ! in_array( $status, array( 'pending', 'running', 'done', 'error' ), true ) ) {
			$status = 'running';
		}

		$incoming_payload = isset( $step['payload'] ) && is_array( $step['payload'] ) ? $step['payload'] : array();
		$payload          = self::merge_step_payload( $existing_payload, $incoming_payload );

		$wpdb->update(
			$table,
			array(
				'label'        => $label,
				'status'       => $status,
				'payload_json' => wp_json_encode( $payload ),
				'updated_at'   => current_time( 'mysql', true ),
			),
			array( 'id' => $step_id ),
			array( '%s', '%s', '%s', '%s' ),
			array( '%d' )
		);
	}

	/**
	 * @param array<string,mixed> $existing
	 * @param array<string,mixed> $incoming
	 * @return array<string,mixed>
	 */
	private static function merge_step_payload( array $existing, array $incoming ): array {
		if ( empty( $incoming ) ) {
			return $existing;
		}
		$merged = array_merge( $existing, $incoming );
		if ( isset( $incoming['artifacts'] ) && is_array( $incoming['artifacts'] ) ) {
			$prev = isset( $existing['artifacts'] ) && is_array( $existing['artifacts'] ) ? $existing['artifacts'] : array();
			$by_name = array();
			foreach ( array_merge( $prev, $incoming['artifacts'] ) as $artifact ) {
				if ( ! is_array( $artifact ) ) {
					continue;
				}
				$name = sanitize_file_name( (string) ( $artifact['name'] ?? '' ) );
				$key  = $name !== '' ? $name : (string) ( $artifact['id'] ?? wp_generate_uuid4() );
				$by_name[ $key ] = $artifact;
			}
			$merged['artifacts'] = array_values( $by_name );
		}
		return $merged;
	}

	/**
	 * @param array<string,mixed> $step
	 */
	public static function append_step( int $run_id, array $step ): void {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_agent_run_steps';

		$step_index = isset( $step['stepIndex'] ) ? (int) $step['stepIndex'] : (int) ( $step['step_index'] ?? 0 );
		if ( $step_index <= 0 ) {
			$max = (int) $wpdb->get_var(
				$wpdb->prepare(
					"SELECT MAX(step_index) FROM {$table} WHERE run_id = %d",
					$run_id
				)
			);
			$step_index = $max + 1;
		}

		$label     = sanitize_text_field( (string) ( $step['label'] ?? '' ) );
		$status    = sanitize_key( (string) ( $step['status'] ?? 'running' ) );
		$step_key  = sanitize_key( (string) ( $step['stepKey'] ?? $step['step_key'] ?? '' ) );
		if ( ! in_array( $status, array( 'pending', 'running', 'done', 'error' ), true ) ) {
			$status = 'running';
		}

		$payload = isset( $step['payload'] ) && is_array( $step['payload'] ) ? $step['payload'] : array();
		$now     = current_time( 'mysql', true );

		$wpdb->insert(
			$table,
			array(
				'run_id'       => $run_id,
				'step_index'   => $step_index,
				'step_key'     => $step_key,
				'label'        => $label,
				'status'       => $status,
				'payload_json' => wp_json_encode( $payload ),
				'created_at'   => $now,
				'updated_at'   => $now,
			),
			array( '%d', '%d', '%s', '%s', '%s', '%s', '%s', '%s' )
		);
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	private static function list_steps( int $run_id ): array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_agent_run_steps';

		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE run_id = %d ORDER BY step_index ASC, id ASC",
				$run_id
			),
			ARRAY_A
		);

		if ( ! is_array( $rows ) ) {
			return array();
		}

		$out = array();
		foreach ( $rows as $row ) {
			$payload = array();
			if ( ! empty( $row['payload_json'] ) ) {
				$decoded = json_decode( (string) $row['payload_json'], true );
				if ( is_array( $decoded ) ) {
					$payload = $decoded;
				}
			}
			$out[] = array(
				'id'         => (int) $row['id'],
				'stepIndex'  => (int) $row['step_index'],
				'stepKey'    => (string) ( $row['step_key'] ?? '' ),
				'label'      => (string) $row['label'],
				'status'     => (string) $row['status'],
				'payload'    => $payload,
				'createdAt'  => (string) $row['created_at'],
				'updatedAt'  => (string) ( $row['updated_at'] ?? $row['created_at'] ),
			);
		}
		return $out;
	}

	/**
	 * Runs eligible for the server worker (all teams).
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_server_worker_runs( int $limit = 5 ): array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_agent_runs';
		$limit = max( 1, min( 20, $limit ) );

		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE status IN ('queued','running') ORDER BY updated_at ASC LIMIT %d",
				$limit
			),
			ARRAY_A
		);

		if ( ! is_array( $rows ) ) {
			return array();
		}

		$out = array();
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$formatted = self::format_run_row( $row );
			if ( ! $formatted ) {
				continue;
			}
			if ( ! self::run_uses_server_execution( $formatted ) ) {
				continue;
			}
			$out[] = $formatted;
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $run
	 */
	public static function run_uses_server_execution( array $run ): bool {
		$plan   = is_array( $run['plan'] ?? null ) ? $run['plan'] : array();
		$result = is_array( $run['result'] ?? null ) ? $run['result'] : array();
		$plan_mode   = sanitize_key( (string) ( $plan['executionMode'] ?? '' ) );
		$result_mode = sanitize_key( (string) ( $result['executionMode'] ?? '' ) );
		if ( $plan_mode === 'server' || $result_mode === 'server' ) {
			return true;
		}
		$recipe = sanitize_key( (string) ( $run['recipeKey'] ?? '' ) );
		return in_array( $recipe, array( 'post_creator' ), true );
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>|null
	 */
	private static function format_run_row( array $row ): ?array {
		$context = array();
		$plan    = array();
		$result  = null;

		if ( ! empty( $row['context_json'] ) ) {
			$decoded = json_decode( (string) $row['context_json'], true );
			if ( is_array( $decoded ) ) {
				$context = $decoded;
			}
		}
		if ( ! empty( $row['plan_json'] ) ) {
			$decoded = json_decode( (string) $row['plan_json'], true );
			if ( is_array( $decoded ) ) {
				$plan = $decoded;
			}
		}
		if ( ! empty( $row['result_json'] ) ) {
			$decoded = json_decode( (string) $row['result_json'], true );
			if ( is_array( $decoded ) ) {
				$result = $decoded;
			}
		}

		$task_title = '';
		$task_id    = (int) ( $row['task_id'] ?? 0 );
		if ( $task_id > 0 ) {
			$task = Neo_Pulse_App_Tasks_Store::get_task( (int) $row['team_id'], $task_id );
			if ( is_array( $task ) ) {
				$task_title = (string) ( $task['title'] ?? '' );
			}
		}

		return array(
			'id'              => (int) $row['id'],
			'teamId'          => (int) $row['team_id'],
			'createdBy'       => (int) $row['created_by'],
			'title'           => (string) $row['title'],
			'recipeKey'       => (string) $row['recipe_key'],
			'recipeTitle'     => Neo_Pulse_App_Agent_Runs_Recipe_Registry::title_for( (string) $row['recipe_key'] ),
			'status'          => (string) $row['status'],
			'source'          => (string) $row['source'],
			'taskId'          => $task_id,
			'taskTitle'       => $task_title,
			'context'         => $context,
			'plan'            => $plan,
			'result'          => $result,
			'errorMessage'    => (string) ( $row['error_message'] ?? '' ),
			'clientBatchKey'  => (string) ( $row['client_batch_key'] ?? '' ),
			'startedAt'       => $row['started_at'] ? (string) $row['started_at'] : null,
			'finishedAt'      => $row['finished_at'] ? (string) $row['finished_at'] : null,
			'createdAt'       => (string) $row['created_at'],
			'updatedAt'       => (string) $row['updated_at'],
		);
	}
}
