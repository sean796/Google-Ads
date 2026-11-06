<?php
/**
 * Automation recipe payload defaults.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Tasks_Store_Trait_Recipe_Defaults {

	/**
	 * @param array<string,mixed> $body
	 * @return array<int,array<string,mixed>>
	 */
	private static function prepare_default_tasks_for_create( array $body ): array {
		$team_id = (int) ( $body['_teamId'] ?? 0 );
		if ( ! empty( $body['templateKeyword'] ) ) {
			$task_clients = isset( $body['taskClients'] ) && is_array( $body['taskClients'] ) ? $body['taskClients'] : array();
			return self::resolve_template_tasks( $team_id, (string) $body['templateKeyword'], $task_clients, $body );
		}
		if ( empty( $body['defaultTasks'] ) || ! is_array( $body['defaultTasks'] ) ) {
			return array();
		}
		$project_client = sanitize_text_field( (string) ( $body['wordpressSiteId'] ?? '' ) );
		$client_name    = $project_client !== '' ? self::resolve_site_display_name( $body, $project_client ) : '';
		$out            = array();
		foreach ( $body['defaultTasks'] as $task_def ) {
			if ( ! is_array( $task_def ) ) {
				continue;
			}
			$title = sanitize_text_field( (string) ( $task_def['title'] ?? '' ) );
			if ( $title === '' ) {
				continue;
			}
			if ( $client_name !== '' ) {
				$title = self::apply_client_to_task_title( $title, $client_name );
			}
			$out[] = self::template_task_row_from_def(
				$team_id,
				array_merge( $task_def, array( 'title' => $title ) ),
				''
			);
		}
		return $out;
	}

	/**
	 * @return array<int,string>
	 */
	private static function editorial_post_creator_recipe_keywords(): array {
		return array( 'monthly-post-creator', 'monthly-3-posts-editorial' );
	}

	/**
	 * @return array<int,string>
	 */
	private static function editorial_post_creator_task_keywords(): array {
		return array( 'monthly-post-creator-run', 'monthly-3-posts-run' );
	}

	/**
	 * @return array<int,string>
	 */
	private static function gsc_reporting_recipe_keywords(): array {
		return array( 'gsc-monthly-mom-report', 'gsc-monthly-yoy-report' );
	}

	/**
	 * @return array<int,string>
	 */
	private static function gsc_reporting_task_keywords(): array {
		return array( 'gsc-mom-report', 'gsc-yoy-report' );
	}

	/**
	 * @return array<int,string>
	 */
	private static function ads_reporting_recipe_keywords(): array {
		return array( 'ads-monthly-mom-report', 'ads-monthly-yoy-report' );
	}

	/**
	 * @return array<int,string>
	 */
	private static function ads_reporting_task_keywords(): array {
		return array( 'ads-mom-report', 'ads-yoy-report' );
	}

	/**
	 * @return array<int,string>
	 */
	private static function research_local_dominator_recipe_keywords(): array {
		return array( 'research-local-dominator-grid-export' );
	}

	/**
	 * @return array<int,string>
	 */
	private static function research_local_dominator_task_keywords(): array {
		return array( 'research-local-dominator-export' );
	}

	/**
	 * @return array<int,string>
	 */
	private static function research_chatgpt_audit_recipe_keywords(): array {
		return array( 'chatgpt-website-audit' );
	}

	/**
	 * @return array<int,string>
	 */
	private static function research_chatgpt_audit_task_keywords(): array {
		return array( 'chatgpt-website-audit-run' );
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_research_chatgpt_audit_payload(): array {
		return array(
			'saveLocalArchive' => true,
			'saveToDisk'       => true,
		);
	}

	/**
	 * @param array<string,mixed> $payload
	 * @return array<string,mixed>
	 */
	private static function ensure_research_chatgpt_audit_payload( array $payload ): array {
		if ( ! isset( $payload['saveLocalArchive'] ) ) {
			$payload['saveLocalArchive'] = true;
		}
		if ( ! isset( $payload['saveToDisk'] ) ) {
			$payload['saveToDisk'] = true;
		}
		return $payload;
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function default_research_local_dominator_payload(): array {
		return array(
			'businessName'     => 'Advance Blinds & Drapery',
			'keyword'          => 'auto',
			'saveLocalArchive' => true,
			'saveToDisk'       => true,
		);
	}

	/**
	 * @param array<string,mixed> $payload
	 * @return array<string,mixed>
	 */
	private static function ensure_research_local_dominator_payload( array $payload ): array {
		if ( empty( $payload['businessName'] ) ) {
			$payload['businessName'] = 'Advance Blinds & Drapery';
		}
		if ( ! array_key_exists( 'keyword', $payload ) ) {
			$payload['keyword'] = 'auto';
		}
		if ( ! isset( $payload['saveLocalArchive'] ) ) {
			$payload['saveLocalArchive'] = true;
		}
		if ( ! isset( $payload['saveToDisk'] ) ) {
			$payload['saveToDisk'] = true;
		}
		return $payload;
	}

	/**
	 * Workflow Local Dominator export: empty keyword means auto (first grid scan).
	 *
	 * @param array<string,mixed> $payload
	 * @return array<string,mixed>
	 */
	private static function ensure_workflow_local_dominator_payload( array $payload ): array {
		if ( ! isset( $payload['saveLocalArchive'] ) ) {
			$payload['saveLocalArchive'] = true;
		}
		if ( ! isset( $payload['saveToDisk'] ) ) {
			$payload['saveToDisk'] = true;
		}
		return $payload;
	}

	/**
	 * @param string $recipe_keyword
	 * @return array<string,mixed>
	 */
	private static function default_gsc_reporting_payload_for_recipe( string $recipe_keyword ): array {
		$compare = $recipe_keyword === 'gsc-monthly-yoy-report' ? 'yoy' : 'mom';
		$payload = array(
			'comparePreset'      => $compare,
			'gscComparePresetId' => $compare,
			'saveToDisk'         => true,
		);
		if ( $compare !== 'yoy' ) {
			$payload['gscTrailingMonthCount'] = 1;
		}
		return $payload;
	}

	/**
	 * @param array<string,mixed> $payload
	 * @return array<string,mixed>
	 */
	private static function ensure_gsc_reporting_payload( array $payload ): array {
		$count = isset( $payload['gscTrailingMonthCount'] ) ? (int) $payload['gscTrailingMonthCount'] : 0;
		if ( $count >= 1 && $count <= 36 ) {
			$payload['gscTrailingMonthCount'] = $count;
			$preset_id                        = self::gsc_compare_preset_id_for_trailing_count( $count );
		} else {
			$preset_id = sanitize_key( (string) ( $payload['gscComparePresetId'] ?? $payload['comparePreset'] ?? 'mom' ) );
			if ( ! in_array( $preset_id, self::gsc_compare_preset_ids(), true ) ) {
				$preset_id = 'mom';
			}
		}
		$payload['gscComparePresetId'] = $preset_id;
		$payload['comparePreset']      = $preset_id === 'yoy' ? 'yoy' : 'mom';
		if ( ! isset( $payload['saveToDisk'] ) ) {
			$payload['saveToDisk'] = true;
		}
		return $payload;
	}

	/**
	 * @param string $recipe_keyword
	 * @return array<string,mixed>
	 */
	private static function default_ads_reporting_payload_for_recipe( string $recipe_keyword ): array {
		$compare = $recipe_keyword === 'ads-monthly-yoy-report' ? 'yoy' : 'mom';
		return array(
			'comparePreset' => $compare,
			'saveToDisk'    => true,
		);
	}

	/**
	 * @param array<string,mixed> $payload
	 * @return array<string,mixed>
	 */
	private static function ensure_ads_reporting_payload( array $payload ): array {
		$preset = sanitize_key( (string) ( $payload['comparePreset'] ?? 'mom' ) );
		$payload['comparePreset'] = $preset === 'yoy' ? 'yoy' : 'mom';
		if ( ! isset( $payload['saveToDisk'] ) ) {
			$payload['saveToDisk'] = true;
		}
		return $payload;
	}

	/**
	 * @return list<string>
	 */
	public static function gsc_compare_preset_ids(): array {
		return array( 'mom', 'yoy', 'custom_compare', 'm3', 'm6', 'm12' );
	}

	public static function gsc_compare_preset_id_for_trailing_count( int $month_count ): string {
		if ( $month_count === 1 ) {
			return 'mom';
		}
		if ( $month_count === 3 ) {
			return 'm3';
		}
		if ( $month_count === 6 ) {
			return 'm6';
		}
		if ( $month_count === 12 ) {
			return 'm12';
		}
		return 'custom_compare';
	}

	/**
	 * @param mixed $raw
	 */
	public static function sanitize_gsc_trailing_month_count( $raw ): ?int {
		if ( $raw === null || $raw === '' ) {
			return null;
		}
		$n = (int) $raw;
		if ( $n < 1 || $n > 36 ) {
			return null;
		}
		return $n;
	}

	/**
	 * @param string $recipe_keyword
	 * @return array<string,mixed>
	 */
	private static function default_post_creator_payload_for_recipe( string $recipe_keyword ): array {
		if ( $recipe_keyword === 'monthly-3-posts-editorial' ) {
			return array(
				'postCount'                => 3,
				'keywordSource'            => 'prompt',
				'featuredImage'            => true,
				'sitemapType'              => 'post',
				'postDestination'          => 'wordpress',
				'scheduleTimesPerMonth'    => 3,
				'scheduleStartDay'         => 1,
				'scheduleStartTime'        => '09:00',
				'scheduleStaggerOptimized' => true,
				'targetBucket'             => 'posts',
			);
		}

		return array(
			'postCount'                => 1,
			'keywordSource'            => 'prompt',
			'featuredImage'            => true,
			'sitemapType'              => 'post',
			'postDestination'          => 'wordpress',
			'scheduleTimesPerMonth'    => 1,
			'scheduleStartDay'         => 1,
			'scheduleStartTime'        => '09:00',
			'scheduleStaggerOptimized' => true,
			'targetBucket'             => 'posts',
		);
	}

	/**
	 * @param array<string,mixed> $raw
	 * @return array<string,mixed>
	 */
	public static function ensure_post_creator_payload( array $raw ): array {
		$defaults = self::default_post_creator_payload_for_recipe( 'monthly-post-creator' );
		$merged   = array_merge( $defaults, $raw );
		$out      = self::sanitize_execution_payload( $merged );
		$out['targetBucket'] = 'posts';
		$out['sitemapType']  = 'post';
		if ( ! isset( $out['postCount'] ) ) {
			$out['postCount'] = 1;
		}
		if ( ! isset( $out['scheduleTimesPerMonth'] ) ) {
			$out['scheduleTimesPerMonth'] = (int) $out['postCount'];
		}
		return $out;
	}

	/**
	 * @param array<string,mixed>      $task
	 * @param array<string,mixed>|null $project
	 * @return array<string,mixed>
	 */
	private static function normalize_automation_pulse_assignee(
		array $task,
		?array $project,
		int $team_id,
		int $task_id
	): array {
		if ( ! self::project_is_automation( $project ) ) {
			return $task;
		}
		$kind = self::sanitize_execution_kind( $task['executionKind'] ?? '' );
		if ( $kind === '' ) {
			return $task;
		}
		$pulse_id = self::pulse_bot_user_id();
		if ( $pulse_id <= 0 ) {
			return $task;
		}
		$assignees = isset( $task['assigneeIds'] ) && is_array( $task['assigneeIds'] )
			? array_map( 'intval', $task['assigneeIds'] )
			: array();
		if ( in_array( $pulse_id, $assignees, true ) ) {
			return $task;
		}
		$assignees[] = $pulse_id;
		$task['assigneeIds'] = $assignees;

		$row = self::get_task_row( $team_id, $task_id );
		if ( ! $row ) {
			return $task;
		}
		$payload = self::decode_payload( $row['payload_json'] );
		$payload = self::merge_automation_pulse_assignee_into_payload( $team_id, $payload, $project );

		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_team_tasks';
		$wpdb->update(
			$table,
			array(
				'payload_json' => self::encode_payload( $payload ),
				'updated_at'   => gmdate( 'Y-m-d H:i:s' ),
			),
			array(
				'id'      => $task_id,
				'team_id' => $team_id,
			),
			array( '%s', '%s' ),
			array( '%d', '%d' )
		);

		$task['assigneeIds'] = is_array( $payload['assigneeIds'] ?? null )
			? array_map( 'intval', $payload['assigneeIds'] )
			: array();

		return $task;
	}

	/**
	 * @param array<string,mixed>      $payload
	 * @param array<string,mixed>|null $project
	 * @return array<string,mixed>
	 */
	public static function merge_automation_pulse_assignee_into_payload(
		int $team_id,
		array $payload,
		?array $project
	): array {
		if ( ! self::project_is_automation( $project ) ) {
			return $payload;
		}
		$kind = self::sanitize_execution_kind( $payload['executionKind'] ?? '' );
		if ( $kind === '' ) {
			return $payload;
		}
		$pulse_id = self::pulse_bot_user_id();
		if ( $pulse_id <= 0 ) {
			return $payload;
		}
		$assignees = is_array( $payload['assigneeIds'] ?? null )
			? array_map( 'intval', $payload['assigneeIds'] )
			: array();
		if ( in_array( $pulse_id, $assignees, true ) ) {
			return $payload;
		}
		$assignees[] = $pulse_id;
		$payload['assigneeIds'] = self::filter_team_assignee_ids( $team_id, $assignees );
		return $payload;
	}

	/**
	 * @param mixed $raw
	 * @return array<string,array<string,string>>|null
	 */
	private static function sanitize_gsc_compare_ranges( $raw ) {
		if ( ! is_array( $raw ) ) {
			return null;
		}
		$primary = is_array( $raw['primary'] ?? null ) ? $raw['primary'] : array();
		$compare = is_array( $raw['compare'] ?? null ) ? $raw['compare'] : array();
		$primary_start = sanitize_text_field( (string) ( $primary['startDate'] ?? '' ) );
		$primary_end   = sanitize_text_field( (string) ( $primary['endDate'] ?? '' ) );
		$compare_start = sanitize_text_field( (string) ( $compare['startDate'] ?? '' ) );
		$compare_end   = sanitize_text_field( (string) ( $compare['endDate'] ?? '' ) );
		if (
			! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $primary_start ) ||
			! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $primary_end ) ||
			! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $compare_start ) ||
			! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $compare_end )
		) {
			return null;
		}
		return array(
			'primary' => array(
				'startDate' => $primary_start,
				'endDate'   => $primary_end,
			),
			'compare' => array(
				'startDate' => $compare_start,
				'endDate'   => $compare_end,
			),
		);
	}
}
