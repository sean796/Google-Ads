<?php
/**
 * Task templates, tags, and template task rows.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Tasks_Store_Trait_Templates {

	public static function templates_path( int $team_id ): string {
		return Neo_Pulse_App_Data_Paths::subdir( 'teams/' . (string) $team_id ) . '/task-templates.json';
	}

	public static function tags_path( int $team_id ): string {
		return Neo_Pulse_App_Data_Paths::subdir( 'teams/' . (string) $team_id ) . '/task-tags.json';
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function default_tags(): array {
		return array(
			array( 'keyword' => 'annual', 'kind' => 'tag', 'name' => 'Annual project', 'color' => '#7c3aed' ),
			array( 'keyword' => 'customer', 'kind' => 'tag', 'name' => 'Customer', 'color' => '#0891b2' ),
		);
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_tags( int $team_id ): array {
		$data = Neo_Pulse_App_Json_File_Store::read( self::tags_path( $team_id ) );
		if ( ! is_array( $data ) || ! isset( $data['tags'] ) || ! is_array( $data['tags'] ) ) {
			return self::default_tags();
		}
		return $data['tags'];
	}

	/**
	 * @param array<int,array<string,mixed>> $tags
	 */
	public static function save_tags( int $team_id, array $tags ): bool {
		return Neo_Pulse_App_Json_File_Store::write(
			self::tags_path( $team_id ),
			array(
				'tags'      => $tags,
				'updatedAt' => gmdate( 'c' ),
			)
		);
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function default_templates(): array {
		$regular = array(
			array(
				'keyword'      => 'seo-campaign',
				'kind'         => 'template',
				'name'         => 'SEO Campaign',
				'defaultTasks' => array(
					array( 'keyword' => 'kickoff', 'title' => 'Kickoff call', 'status' => 'todo' ),
					array( 'keyword' => 'audit', 'title' => 'Site audit', 'status' => 'todo' ),
					array( 'keyword' => 'content-plan', 'title' => 'Content plan', 'status' => 'todo' ),
				),
			),
			array(
				'keyword'      => 'client-onboarding',
				'kind'         => 'template',
				'name'         => 'Client Onboarding',
				'defaultTasks' => array(
					array( 'keyword' => 'access', 'title' => 'Collect site access', 'status' => 'todo' ),
					array( 'keyword' => 'brief', 'title' => 'Review client brief', 'status' => 'todo' ),
				),
			),
		);

		if ( class_exists( 'Neo_Pulse_App_Automation_Recipe_Registry' ) ) {
			return array_merge( $regular, Neo_Pulse_App_Automation_Recipe_Registry::as_task_templates() );
		}

		return $regular;
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_templates( int $team_id ): array {
		$path = self::templates_path( $team_id );
		$data = Neo_Pulse_App_Json_File_Store::read( $path );
		$stored = ( is_array( $data ) && isset( $data['templates'] ) && is_array( $data['templates'] ) )
			? $data['templates']
			: array();
		if ( count( $stored ) === 0 ) {
			return self::default_templates();
		}
		return self::merge_builtin_templates( $stored );
	}

	/**
	 * @param array<int,array<string,mixed>> $stored
	 * @return array<int,array<string,mixed>>
	 */
	private static function merge_builtin_templates( array $stored ): array {
		$keywords = array();
		foreach ( $stored as $template ) {
			if ( is_array( $template ) ) {
				$keywords[ sanitize_title( (string) ( $template['keyword'] ?? '' ) ) ] = true;
			}
		}
		$merged = $stored;
		foreach ( self::default_templates() as $builtin ) {
			$kw = sanitize_title( (string) ( $builtin['keyword'] ?? '' ) );
			if ( $kw === '' || isset( $keywords[ $kw ] ) ) {
				continue;
			}
			$merged[] = $builtin;
		}
		return $merged;
	}

	/**
	 * @param array<int,array<string,mixed>> $templates
	 */
	public static function save_templates( int $team_id, array $templates ): bool {
		return Neo_Pulse_App_Json_File_Store::write(
			self::templates_path( $team_id ),
			array(
				'templates' => $templates,
				'updatedAt' => gmdate( 'c' ),
			)
		);
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function get_template_by_keyword( int $team_id, string $keyword ): ?array {
		$keyword = sanitize_title( $keyword );
		if ( $keyword === '' ) {
			return null;
		}
		if ( class_exists( 'Neo_Pulse_App_Automation_Recipe_Registry' ) ) {
			$recipe = Neo_Pulse_App_Automation_Recipe_Registry::get_by_keyword( $keyword );
			if ( is_array( $recipe ) ) {
				return array(
					'keyword'      => (string) $recipe['keyword'],
					'kind'         => 'template',
					'name'         => (string) $recipe['name'],
					'defaultTasks' => is_array( $recipe['defaultTasks'] ?? null ) ? $recipe['defaultTasks'] : array(),
				);
			}
		}
		foreach ( self::list_templates( $team_id ) as $template ) {
			if ( ! is_array( $template ) ) {
				continue;
			}
			if ( sanitize_title( (string) ( $template['keyword'] ?? '' ) ) === $keyword ) {
				return $template;
			}
		}
		return null;
	}

	/**
	 * @param array<string,mixed> $template
	 */
	public static function upsert_template( int $team_id, array $template ): bool {
		$keyword = sanitize_title( (string) ( $template['keyword'] ?? '' ) );
		$name    = sanitize_text_field( (string) ( $template['name'] ?? '' ) );
		if ( $keyword === '' || $name === '' ) {
			return false;
		}
		$default_tasks = array();
		if ( ! empty( $template['defaultTasks'] ) && is_array( $template['defaultTasks'] ) ) {
			foreach ( $template['defaultTasks'] as $task ) {
				if ( ! is_array( $task ) ) {
					continue;
				}
				$title = sanitize_text_field( (string) ( $task['title'] ?? '' ) );
				if ( $title === '' ) {
					continue;
				}
				$row = self::template_task_row_from_def( $team_id, $task );
				if ( ! empty( $task['clientSiteId'] ) ) {
					$row['clientSiteId'] = sanitize_text_field( (string) $task['clientSiteId'] );
				}
				$default_tasks[] = $row;
			}
		}
		$entry = array(
			'keyword'      => $keyword,
			'kind'         => 'template',
			'name'         => $name,
			'defaultTasks' => $default_tasks,
		);
		$templates = self::list_templates( $team_id );
		$found     = false;
		foreach ( $templates as $i => $existing ) {
			if ( ! is_array( $existing ) ) {
				continue;
			}
			if ( sanitize_title( (string) ( $existing['keyword'] ?? '' ) ) === $keyword ) {
				$templates[ $i ] = $entry;
				$found           = true;
				break;
			}
		}
		if ( ! $found ) {
			$templates[] = $entry;
		}
		return self::save_templates( $team_id, $templates );
	}

	public static function delete_template( int $team_id, string $keyword ): bool {
		$keyword   = sanitize_title( $keyword );
		$templates = self::list_templates( $team_id );
		$next      = array();
		$removed   = false;
		foreach ( $templates as $template ) {
			if ( ! is_array( $template ) ) {
				continue;
			}
			if ( sanitize_title( (string) ( $template['keyword'] ?? '' ) ) === $keyword ) {
				$removed = true;
				continue;
			}
			$next[] = $template;
		}
		if ( ! $removed ) {
			return false;
		}
		return self::save_templates( $team_id, $next );
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function project_tasks_as_template( int $team_id, int $project_id, string $name, string $keyword ): ?array {
		$project = self::get_project( $team_id, $project_id );
		if ( ! $project ) {
			return null;
		}
		$name    = sanitize_text_field( $name );
		$keyword = sanitize_title( $keyword !== '' ? $keyword : $name );
		if ( $name === '' || $keyword === '' ) {
			return null;
		}
		$default_tasks = array();
		foreach ( self::list_tasks( $team_id, $project_id, true ) as $task ) {
			if ( ! is_array( $task ) ) {
				continue;
			}
			$title = trim( (string) ( $task['title'] ?? '' ) );
			if ( $title === '' ) {
				continue;
			}
			$row = array(
				'keyword' => sanitize_title( (string) ( $task['keyword'] ?? $title ) ),
				'title'   => $title,
				'status'  => in_array( (string) ( $task['status'] ?? 'todo' ), self::STATUSES, true ) ? (string) $task['status'] : 'todo',
			);
			$default_tasks[] = $row;
		}
		$template = array(
			'keyword'             => $keyword,
			'kind'                => 'template',
			'name'                => $name,
			'defaultTasks'        => $default_tasks,
			'defaultClientSiteId' => self::project_wordpress_site_id( $project ),
		);
		if ( ! self::upsert_template( $team_id, $template ) ) {
			return null;
		}
		return self::get_template_by_keyword( $team_id, $keyword );
	}

	private static function project_wordpress_site_id( ?array $project ): string {
		if ( ! is_array( $project ) ) {
			return '';
		}
		return trim( (string) ( $project['wordpressSiteId'] ?? '' ) );
	}

	public static function apply_client_to_task_title( string $title, string $client_name ): string {
		$title       = trim( $title );
		$client_name = trim( $client_name );
		if ( $title === '' || $client_name === '' ) {
			return $title;
		}
		if ( str_contains( $title, '{client}' ) ) {
			return str_replace( '{client}', $client_name, $title );
		}
		return $title . ' — ' . $client_name;
	}

	/**
	 * @param array<string,mixed> $body
	 */
	public static function resolve_site_display_name( array $body, string $site_id ): string {
		$site_id = trim( $site_id );
		if ( $site_id === '' ) {
			return '';
		}
		$sites = array();
		if ( ! empty( $body['wordpressSites'] ) && is_array( $body['wordpressSites'] ) ) {
			$sites = $body['wordpressSites'];
		} elseif ( ! empty( $body['team_context']['wordpressSites'] ) && is_array( $body['team_context']['wordpressSites'] ) ) {
			$sites = $body['team_context']['wordpressSites'];
		}
		foreach ( $sites as $site ) {
			if ( ! is_array( $site ) ) {
				continue;
			}
			if ( (string) ( $site['id'] ?? '' ) === $site_id ) {
				return trim( (string) ( $site['name'] ?? '' ) );
			}
		}
		return '';
	}

	/**
	 * @param array<int,array<string,mixed>> $task_clients
	 * @param array<string,mixed>            $body
	 * @return array<int,array<string,mixed>>
	 */
	public static function resolve_template_tasks( int $team_id, string $template_keyword, array $task_clients, array $body ): array {
		$template = self::get_template_by_keyword( $team_id, $template_keyword );
		if ( ! is_array( $template ) || empty( $template['defaultTasks'] ) || ! is_array( $template['defaultTasks'] ) ) {
			return array();
		}
		unset( $task_clients );
		$project_client = sanitize_text_field( (string) ( $body['wordpressSiteId'] ?? '' ) );
		$client_name    = $project_client !== '' ? self::resolve_site_display_name( $body, $project_client ) : '';
		$out            = array();
		foreach ( $template['defaultTasks'] as $task ) {
			if ( ! is_array( $task ) ) {
				continue;
			}
			$kw    = sanitize_title( (string) ( $task['keyword'] ?? '' ) );
			$title = sanitize_text_field( (string) ( $task['title'] ?? '' ) );
			if ( $title === '' ) {
				continue;
			}
			if ( $client_name !== '' ) {
				$title = self::apply_client_to_task_title( $title, $client_name );
			}
			$out[] = self::template_task_row_from_def(
				$team_id,
				array_merge(
					$task,
					array(
						'keyword' => $kw !== '' ? $kw : sanitize_title( $title ),
						'title'   => $title,
					)
				),
				''
			);
		}
		return $out;
	}

	/**
	 * @param array<int,int> $ids
	 * @return array<int,int>
	 */
	private static function filter_team_assignee_ids( int $team_id, array $ids ): array {
		$allowed = array();
		foreach ( Neo_Pulse_App_Teams_Store::list_members( $team_id ) as $member ) {
			if ( ! is_array( $member ) ) {
				continue;
			}
			$uid = (int) ( $member['userId'] ?? 0 );
			if ( $uid > 0 ) {
				$allowed[ $uid ] = true;
			}
		}
		$flo_id = self::pulse_bot_user_id();
		if ( $flo_id > 0 ) {
			$allowed[ $flo_id ] = true;
		}
		$out = array();
		foreach ( $ids as $uid ) {
			$uid = (int) $uid;
			if ( $uid > 0 && isset( $allowed[ $uid ] ) ) {
				$out[] = $uid;
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * @param array<string,mixed> $task_def
	 * @return array<int,int>
	 */
	public static function resolve_template_assignee_ids( int $team_id, array $task_def ): array {
		if ( ! empty( $task_def['assignPulse'] ) ) {
			$pulse_id = self::pulse_bot_user_id();
			if ( $pulse_id > 0 ) {
				return array( $pulse_id );
			}
		}
		if ( ! empty( $task_def['assigneeIds'] ) && is_array( $task_def['assigneeIds'] ) ) {
			return self::filter_team_assignee_ids( $team_id, array_map( 'intval', $task_def['assigneeIds'] ) );
		}
		if ( ! empty( $task_def['executionKind'] ) ) {
			$pulse_id = self::pulse_bot_user_id();
			if ( $pulse_id > 0 ) {
				return array( $pulse_id );
			}
		}
		return array();
	}

	/**
	 * @param array<string,mixed> $task_def
	 * @return array<string,mixed>
	 */
	public static function template_task_row_from_def( int $team_id, array $task_def, string $client_name = '' ): array {
		$kw    = sanitize_title( (string) ( $task_def['keyword'] ?? '' ) );
		$title = sanitize_text_field( (string) ( $task_def['title'] ?? '' ) );
		if ( $client_name !== '' ) {
			$title = self::apply_client_to_task_title( $title, $client_name );
		}
		$row = array(
			'keyword' => $kw !== '' ? $kw : sanitize_title( $title ),
			'title'   => $title,
			'status'  => in_array( (string) ( $task_def['status'] ?? 'todo' ), self::STATUSES, true ) ? (string) $task_def['status'] : 'todo',
		);
		if ( isset( $task_def['description'] ) && (string) $task_def['description'] !== '' ) {
			$row['description'] = sanitize_textarea_field( (string) $task_def['description'] );
		}
		if ( isset( $task_def['dueDate'] ) && (string) $task_def['dueDate'] !== '' ) {
			$row['dueDate'] = sanitize_text_field( (string) $task_def['dueDate'] );
		}
		if ( isset( $task_def['dueTime'] ) && (string) $task_def['dueTime'] !== '' ) {
			$row['dueTime'] = self::sanitize_due_time( $task_def['dueTime'] );
		}
		if ( isset( $task_def['recurrenceRule'] ) ) {
			$row['recurrenceRule'] = self::sanitize_recurrence_rule( $task_def['recurrenceRule'] );
		}
		if ( isset( $task_def['scheduleMode'] ) ) {
			$row['scheduleMode'] = self::sanitize_schedule_mode( $task_def['scheduleMode'] );
		}
		if ( isset( $task_def['triggerConfig'] ) && is_array( $task_def['triggerConfig'] ) ) {
			$row['triggerConfig'] = self::sanitize_trigger_config( $task_def['triggerConfig'] );
		}
		$assignees = self::resolve_template_assignee_ids( $team_id, $task_def );
		if ( count( $assignees ) > 0 ) {
			$row['assigneeIds'] = $assignees;
		}
		if ( ! empty( $task_def['tagIds'] ) && is_array( $task_def['tagIds'] ) ) {
			$tag_ids = array();
			foreach ( $task_def['tagIds'] as $tag ) {
				$tag = sanitize_text_field( (string) $tag );
				if ( $tag !== '' ) {
					$tag_ids[] = $tag;
				}
			}
			if ( count( $tag_ids ) > 0 ) {
				$row['tagIds'] = $tag_ids;
			}
		}
		if ( isset( $task_def['executionKind'] ) ) {
			$row['executionKind'] = self::sanitize_execution_kind( $task_def['executionKind'] );
		}
		if ( isset( $task_def['executionPayload'] ) && is_array( $task_def['executionPayload'] ) ) {
			$row['executionPayload'] = self::sanitize_execution_payload( $task_def['executionPayload'] );
		}
		if ( ( $row['executionKind'] ?? '' ) === 'post_creator' ) {
			$row['scheduleMode']     = 'calendar';
			$row['executionPayload'] = self::ensure_post_creator_payload(
				is_array( $row['executionPayload'] ?? null ) ? $row['executionPayload'] : array()
			);
			unset( $row['triggerConfig'] );
		}
		return $row;
	}
}
