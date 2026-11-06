<?php
/**
 * Automation recipe task normalizers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Tasks_Store_Trait_Recipe_Normalizers {

	/**
	 * @param array<string,mixed>      $task
	 * @param array<string,mixed>|null $project
	 * @return array<string,mixed>
	 */
	private static function normalize_post_creator_task( array $task, ?array $project ): array {
		$recipe_kw = '';
		if ( is_array( $project ) ) {
			$recipe_kw = sanitize_title( (string) ( $project['sourceTemplateKeyword'] ?? '' ) );
			if ( $recipe_kw === '' ) {
				$recipe_kw = sanitize_title( (string) ( $project['keyword'] ?? '' ) );
			}
		}
		$task_kw = sanitize_title( (string) ( $task['keyword'] ?? '' ) );
		$kind    = self::sanitize_execution_kind( $task['executionKind'] ?? '' );

		$is_editorial = in_array( $recipe_kw, self::editorial_post_creator_recipe_keywords(), true )
			|| in_array( $task_kw, self::editorial_post_creator_task_keywords(), true );

		if ( ! $is_editorial && $kind !== 'post_creator' ) {
			return $task;
		}

		$recipe_for_defaults = 'monthly-post-creator';
		if ( $recipe_kw === 'monthly-3-posts-editorial' || $task_kw === 'monthly-3-posts-run' ) {
			$recipe_for_defaults = 'monthly-3-posts-editorial';
		}

		$defaults = self::default_post_creator_payload_for_recipe( $recipe_for_defaults );
		$existing = is_array( $task['executionPayload'] ?? null ) ? $task['executionPayload'] : array();

		$task['executionKind']     = 'post_creator';
		$task['scheduleMode']      = 'calendar';
		$task['executionPayload']  = self::ensure_post_creator_payload( array_merge( $defaults, $existing ) );
		if ( (string) ( $task['recurrenceRule'] ?? 'none' ) === 'none' ) {
			$task['recurrenceRule'] = 'monthly';
		}
		$task['triggerConfig'] = null;

		return $task;
	}

	/**
	 * @param array<string,mixed>      $task
	 * @param array<string,mixed>|null $project
	 * @return array<string,mixed>
	 */
	private static function normalize_gsc_reporting_task( array $task, ?array $project ): array {
		$recipe_kw = '';
		if ( is_array( $project ) ) {
			$recipe_kw = sanitize_title( (string) ( $project['sourceTemplateKeyword'] ?? '' ) );
			if ( $recipe_kw === '' ) {
				$recipe_kw = sanitize_title( (string) ( $project['keyword'] ?? '' ) );
			}
		}
		$task_kw = sanitize_title( (string) ( $task['keyword'] ?? '' ) );
		$kind    = self::sanitize_execution_kind( $task['executionKind'] ?? '' );

		$is_gsc = in_array( $recipe_kw, self::gsc_reporting_recipe_keywords(), true )
			|| in_array( $task_kw, self::gsc_reporting_task_keywords(), true );

		if ( ! $is_gsc && $kind !== 'gsc_reporting' ) {
			return $task;
		}

		$recipe_for_defaults = 'gsc-monthly-mom-report';
		if ( $recipe_kw === 'gsc-monthly-yoy-report' || $task_kw === 'gsc-yoy-report' ) {
			$recipe_for_defaults = 'gsc-monthly-yoy-report';
		}

		$defaults = self::default_gsc_reporting_payload_for_recipe( $recipe_for_defaults );
		$existing = is_array( $task['executionPayload'] ?? null ) ? $task['executionPayload'] : array();

		$task['executionKind']    = 'gsc_reporting';
		$task['scheduleMode']       = 'calendar';
		$task['executionPayload']   = self::ensure_gsc_reporting_payload( array_merge( $defaults, $existing ) );
		if ( (string) ( $task['recurrenceRule'] ?? 'none' ) === 'none' ) {
			$task['recurrenceRule'] = 'monthly';
		}
		$task['triggerConfig'] = null;

		return $task;
	}

	/**
	 * @param array<string,mixed>      $task
	 * @param array<string,mixed>|null $project
	 * @return array<string,mixed>
	 */
	private static function normalize_ads_reporting_task( array $task, ?array $project ): array {
		$recipe_kw = '';
		if ( is_array( $project ) ) {
			$recipe_kw = sanitize_title( (string) ( $project['sourceTemplateKeyword'] ?? '' ) );
			if ( $recipe_kw === '' ) {
				$recipe_kw = sanitize_title( (string) ( $project['keyword'] ?? '' ) );
			}
		}
		$task_kw = sanitize_title( (string) ( $task['keyword'] ?? '' ) );
		$kind    = self::sanitize_execution_kind( $task['executionKind'] ?? '' );

		$is_ads = in_array( $recipe_kw, self::ads_reporting_recipe_keywords(), true )
			|| in_array( $task_kw, self::ads_reporting_task_keywords(), true );

		if ( ! $is_ads && $kind !== 'ads_reporting' ) {
			return $task;
		}

		$recipe_for_defaults = 'ads-monthly-mom-report';
		if ( $recipe_kw === 'ads-monthly-yoy-report' || $task_kw === 'ads-yoy-report' ) {
			$recipe_for_defaults = 'ads-monthly-yoy-report';
		}

		$defaults = self::default_ads_reporting_payload_for_recipe( $recipe_for_defaults );
		$existing = is_array( $task['executionPayload'] ?? null ) ? $task['executionPayload'] : array();

		$task['executionKind']    = 'ads_reporting';
		$task['scheduleMode']     = 'calendar';
		$task['executionPayload'] = self::ensure_ads_reporting_payload( array_merge( $defaults, $existing ) );
		if ( (string) ( $task['recurrenceRule'] ?? 'none' ) === 'none' ) {
			$task['recurrenceRule'] = 'monthly';
		}
		$task['triggerConfig'] = null;

		return $task;
	}

	/**
	 * @param array<string,mixed>      $task
	 * @param array<string,mixed>|null $project
	 * @return array<string,mixed>
	 */
	private static function normalize_research_local_dominator_task( array $task, ?array $project ): array {
		$recipe_kw = '';
		if ( is_array( $project ) ) {
			$recipe_kw = sanitize_title( (string) ( $project['sourceTemplateKeyword'] ?? '' ) );
			if ( $recipe_kw === '' ) {
				$recipe_kw = sanitize_title( (string) ( $project['keyword'] ?? '' ) );
			}
		}
		$task_kw = sanitize_title( (string) ( $task['keyword'] ?? '' ) );
		$kind    = self::sanitize_execution_kind( $task['executionKind'] ?? '' );

		$is_research = in_array( $recipe_kw, self::research_local_dominator_recipe_keywords(), true )
			|| in_array( $task_kw, self::research_local_dominator_task_keywords(), true );

		if ( ! $is_research && $kind !== 'local_dominator_export' ) {
			return $task;
		}

		$existing = is_array( $task['executionPayload'] ?? null ) ? $task['executionPayload'] : array();

		$task['executionKind'] = 'local_dominator_export';
		$task['scheduleMode']  = 'calendar';
		if ( $is_research ) {
			$defaults                 = self::default_research_local_dominator_payload();
			$task['executionPayload'] = self::ensure_research_local_dominator_payload( array_merge( $defaults, $existing ) );
		} else {
			$task['executionPayload'] = self::ensure_workflow_local_dominator_payload( $existing );
		}
		if ( ! isset( $task['recurrenceRule'] ) || (string) $task['recurrenceRule'] === '' ) {
			$task['recurrenceRule'] = 'none';
		}
		$task['triggerConfig'] = null;

		return $task;
	}

	/**
	 * @param array<string,mixed> $stored_payload
	 * @param array<string,mixed> $normalized_task
	 */
	private static function maybe_persist_research_local_dominator_task(
		int $team_id,
		int $task_id,
		array $stored_payload,
		array $normalized_task
	): void {
		if ( self::sanitize_execution_kind( $normalized_task['executionKind'] ?? '' ) !== 'local_dominator_export' ) {
			return;
		}
		$stored_kind = self::sanitize_execution_kind( $stored_payload['executionKind'] ?? '' );
		$stored_mode = self::sanitize_schedule_mode( $stored_payload['scheduleMode'] ?? 'calendar' );
		if ( $stored_kind === 'local_dominator_export' && $stored_mode === 'calendar' ) {
			return;
		}

		$stored_payload['executionKind']    = 'local_dominator_export';
		$stored_payload['scheduleMode']     = 'calendar';
		$stored_payload['executionPayload'] = $normalized_task['executionPayload'];
		$stored_payload['recurrenceRule']   = 'none';
		unset( $stored_payload['triggerConfig'] );

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$wpdb->update(
			$table,
			array(
				'payload_json' => self::encode_payload( $stored_payload ),
				'updated_at'   => gmdate( 'Y-m-d H:i:s' ),
			),
			array(
				'id'      => $task_id,
				'team_id' => $team_id,
			),
			array( '%s', '%s' ),
			array( '%d', '%d' )
		);
	}

	/**
	 * @param array<string,mixed>      $task
	 * @param array<string,mixed>|null $project
	 * @return array<string,mixed>
	 */
	private static function normalize_research_chatgpt_audit_task( array $task, ?array $project ): array {
		$recipe_kw = '';
		if ( is_array( $project ) ) {
			$recipe_kw = sanitize_title( (string) ( $project['sourceTemplateKeyword'] ?? '' ) );
			if ( $recipe_kw === '' ) {
				$recipe_kw = sanitize_title( (string) ( $project['keyword'] ?? '' ) );
			}
		}
		$task_kw = sanitize_title( (string) ( $task['keyword'] ?? '' ) );
		$kind    = self::sanitize_execution_kind( $task['executionKind'] ?? '' );

		$is_research = in_array( $recipe_kw, self::research_chatgpt_audit_recipe_keywords(), true )
			|| in_array( $task_kw, self::research_chatgpt_audit_task_keywords(), true );

		if ( ! $is_research && $kind !== 'chatgpt_website_audit' ) {
			return $task;
		}

		$defaults = self::default_research_chatgpt_audit_payload();
		$existing = is_array( $task['executionPayload'] ?? null ) ? $task['executionPayload'] : array();

		$task['executionKind']    = 'chatgpt_website_audit';
		$task['scheduleMode']     = 'calendar';
		$task['executionPayload'] = self::ensure_research_chatgpt_audit_payload( array_merge( $defaults, $existing ) );
		if ( ! isset( $task['recurrenceRule'] ) || (string) $task['recurrenceRule'] === '' ) {
			$task['recurrenceRule'] = 'none';
		}
		$task['triggerConfig'] = null;

		return $task;
	}

	/**
	 * @param array<string,mixed> $stored_payload
	 * @param array<string,mixed> $normalized_task
	 */
	private static function maybe_persist_research_chatgpt_audit_task(
		int $team_id,
		int $task_id,
		array $stored_payload,
		array $normalized_task
	): void {
		if ( self::sanitize_execution_kind( $normalized_task['executionKind'] ?? '' ) !== 'chatgpt_website_audit' ) {
			return;
		}
		$stored_kind = self::sanitize_execution_kind( $stored_payload['executionKind'] ?? '' );
		$stored_mode = self::sanitize_schedule_mode( $stored_payload['scheduleMode'] ?? 'calendar' );
		if ( $stored_kind === 'chatgpt_website_audit' && $stored_mode === 'calendar' ) {
			return;
		}

		$stored_payload['executionKind']    = 'chatgpt_website_audit';
		$stored_payload['scheduleMode']     = 'calendar';
		$stored_payload['executionPayload'] = $normalized_task['executionPayload'];
		$stored_payload['recurrenceRule']   = 'none';
		unset( $stored_payload['triggerConfig'] );

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$wpdb->update(
			$table,
			array(
				'payload_json' => self::encode_payload( $stored_payload ),
				'updated_at'   => gmdate( 'Y-m-d H:i:s' ),
			),
			array(
				'id'      => $task_id,
				'team_id' => $team_id,
			),
			array( '%s', '%s' ),
			array( '%d', '%d' )
		);
	}

	/**
	 * @param array<string,mixed> $stored_payload
	 * @param array<string,mixed> $normalized_task
	 */
	private static function maybe_persist_gsc_reporting_task(
		int $team_id,
		int $task_id,
		array $stored_payload,
		array $normalized_task
	): void {
		if ( self::sanitize_execution_kind( $normalized_task['executionKind'] ?? '' ) !== 'gsc_reporting' ) {
			return;
		}
		$stored_kind    = self::sanitize_execution_kind( $stored_payload['executionKind'] ?? '' );
		$stored_mode    = self::sanitize_schedule_mode( $stored_payload['scheduleMode'] ?? 'calendar' );
		$stored_preset  = sanitize_key( (string) ( $stored_payload['executionPayload']['comparePreset'] ?? '' ) );
		$target_preset  = sanitize_key( (string) ( $normalized_task['executionPayload']['comparePreset'] ?? '' ) );
		if ( $stored_kind === 'gsc_reporting' && $stored_mode === 'calendar' && $stored_preset === $target_preset ) {
			return;
		}

		$stored_payload['executionKind']    = 'gsc_reporting';
		$stored_payload['scheduleMode']     = 'calendar';
		$stored_payload['executionPayload']   = $normalized_task['executionPayload'];
		if ( (string) ( $stored_payload['recurrenceRule'] ?? 'none' ) === 'none' ) {
			$stored_payload['recurrenceRule'] = 'monthly';
		}
		unset( $stored_payload['triggerConfig'] );

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$wpdb->update(
			$table,
			array(
				'payload_json' => self::encode_payload( $stored_payload ),
				'updated_at'   => gmdate( 'Y-m-d H:i:s' ),
			),
			array(
				'team_id' => $team_id,
				'id'      => $task_id,
			),
			array( '%s', '%s' ),
			array( '%d', '%d' )
		);
	}

	/**
	 * @param array<string,mixed> $stored_payload
	 * @param array<string,mixed> $normalized_task
	 */
	private static function maybe_persist_ads_reporting_task(
		int $team_id,
		int $task_id,
		array $stored_payload,
		array $normalized_task
	): void {
		if ( self::sanitize_execution_kind( $normalized_task['executionKind'] ?? '' ) !== 'ads_reporting' ) {
			return;
		}
		$stored_kind   = self::sanitize_execution_kind( $stored_payload['executionKind'] ?? '' );
		$stored_mode   = self::sanitize_schedule_mode( $stored_payload['scheduleMode'] ?? 'calendar' );
		$stored_preset = sanitize_key( (string) ( $stored_payload['executionPayload']['comparePreset'] ?? '' ) );
		$target_preset = sanitize_key( (string) ( $normalized_task['executionPayload']['comparePreset'] ?? '' ) );
		if ( $stored_kind === 'ads_reporting' && $stored_mode === 'calendar' && $stored_preset === $target_preset ) {
			return;
		}

		$stored_payload['executionKind']    = 'ads_reporting';
		$stored_payload['scheduleMode']     = 'calendar';
		$stored_payload['executionPayload'] = $normalized_task['executionPayload'];
		if ( (string) ( $stored_payload['recurrenceRule'] ?? 'none' ) === 'none' ) {
			$stored_payload['recurrenceRule'] = 'monthly';
		}
		unset( $stored_payload['triggerConfig'] );

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$wpdb->update(
			$table,
			array(
				'payload_json' => self::encode_payload( $stored_payload ),
				'updated_at'   => gmdate( 'Y-m-d H:i:s' ),
			),
			array(
				'team_id' => $team_id,
				'id'      => $task_id,
			),
			array( '%s', '%s' ),
			array( '%d', '%d' )
		);
	}

	/**
	 * @param array<string,mixed> $stored_payload
	 * @param array<string,mixed> $normalized_task
	 */
	private static function maybe_persist_post_creator_task(
		int $team_id,
		int $task_id,
		array $stored_payload,
		array $normalized_task
	): void {
		if ( self::sanitize_execution_kind( $normalized_task['executionKind'] ?? '' ) !== 'post_creator' ) {
			return;
		}
		$stored_kind   = self::sanitize_execution_kind( $stored_payload['executionKind'] ?? '' );
		$stored_mode   = self::sanitize_schedule_mode( $stored_payload['scheduleMode'] ?? 'calendar' );
		$stored_bucket = self::sanitize_execution_target_bucket( $stored_payload['executionPayload']['targetBucket'] ?? '' );
		if ( $stored_kind === 'post_creator' && $stored_mode === 'calendar' && $stored_bucket === 'posts' ) {
			return;
		}

		$stored_payload['executionKind']     = 'post_creator';
		$stored_payload['scheduleMode']      = 'calendar';
		$stored_payload['executionPayload']  = $normalized_task['executionPayload'];
		if ( (string) ( $stored_payload['recurrenceRule'] ?? 'none' ) === 'none' ) {
			$stored_payload['recurrenceRule'] = 'monthly';
		}
		unset( $stored_payload['triggerConfig'] );

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$wpdb->update(
			$table,
			array(
				'payload_json' => self::encode_payload( $stored_payload ),
				'updated_at'   => gmdate( 'Y-m-d H:i:s' ),
			),
			array(
				'id'      => $task_id,
				'team_id' => $team_id,
			),
			array( '%s', '%s' ),
			array( '%d', '%d' )
		);
	}
}
