<?php
/**
 * Workspace context blocks, system prompts, and history helpers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Pulse_Assist_Ask_Trait_Context_Prompts {

	/**
	 * @param array<string,mixed> $body
	 */
	private static function properties_context_block( array $body ): string {
		$ctx = isset( $body['properties_context'] ) && is_array( $body['properties_context'] ) ? $body['properties_context'] : null;
		if ( ! $ctx ) {
			return '';
		}

		$count = isset( $ctx['count'] ) ? (int) $ctx['count'] : 0;
		$lines = array(
			'Connected client roster (client = each WordPress property saved under Dashboard → Properties):',
			'- Total connected clients: ' . $count,
			'- This count is the full Properties list, not the header active property alone.',
		);

		if ( ! empty( $ctx['activePropertyId'] ) && is_scalar( $ctx['activePropertyId'] ) ) {
			$lines[] = '- Header active property id (one selected workspace): ' . sanitize_text_field( (string) $ctx['activePropertyId'] );
		}

		$props = isset( $ctx['properties'] ) && is_array( $ctx['properties'] ) ? $ctx['properties'] : array();
		$names = array();
		foreach ( $props as $p ) {
			if ( ! is_array( $p ) ) {
				continue;
			}
			$name = isset( $p['name'] ) ? sanitize_text_field( (string) $p['name'] ) : '';
			$id   = isset( $p['id'] ) ? sanitize_text_field( (string) $p['id'] ) : '';
			$url  = isset( $p['siteUrl'] ) ? esc_url_raw( (string) $p['siteUrl'] ) : '';
			$enabled = ! isset( $p['enabled'] ) || $p['enabled'];
			if ( $name === '' ) {
				continue;
			}
			$names[] = $name;
			$line = '- ' . $name;
			if ( $id !== '' ) {
				$line .= ' (id: ' . $id . ')';
			}
			if ( ! $enabled ) {
				$line .= ' [disabled]';
			}
			if ( $url !== '' ) {
				$line .= ' — ' . $url;
			}
			$lines[] = $line;
		}

		if ( count( $names ) > 0 ) {
			$lines[] = '- Client names: ' . implode( ', ', $names );
		}

		$lines[] = 'When the user asks how many clients or properties they have, answer using Total connected clients and list every name in Client names. Never answer 1 because only one property is active in the header.';
		$lines[] = 'Never say you cannot access client information when this roster is present.';
		if ( $count === 0 ) {
			$lines[] = 'Zero properties: tell them to add one via [Dashboard → Properties](pulse:nav/dashboard/properties).';
		}

		return implode( "\n", $lines );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function pulse_assigned_tasks_block( array $body ): string {
		$ctx   = isset( $body['team_context'] ) && is_array( $body['team_context'] ) ? $body['team_context'] : array();
		$tasks = isset( $ctx['pulseAssignedTasks'] ) && is_array( $ctx['pulseAssignedTasks'] ) ? $ctx['pulseAssignedTasks'] : array();
		if ( count( $tasks ) === 0 ) {
			return '';
		}

		$today = gmdate( 'Y-m-d' );
		$lines = array(
			'Tasks assigned to Pulse AI. Use executions_start in Build when the user asks to run a task. executions_get and executions_list_for_task poll job status:',
		);
		foreach ( $tasks as $task ) {
			if ( ! is_array( $task ) ) {
				continue;
			}
			$title = sanitize_text_field( (string) ( $task['title'] ?? '' ) );
			if ( $title === '' ) {
				continue;
			}
			$due        = sanitize_text_field( (string) ( $task['dueDate'] ?? '' ) );
			$due_day    = $due !== '' ? substr( $due, 0, 10 ) : '';
			$recurrence = sanitize_key( (string) ( $task['recurrenceRule'] ?? 'none' ) );
			$status     = sanitize_key( (string) ( $task['status'] ?? 'todo' ) );
			$project    = sanitize_text_field( (string) ( $task['projectTitle'] ?? '' ) );
			$client     = sanitize_text_field( (string) ( $task['wordpressSiteId'] ?? '' ) );
			$exec_kind  = sanitize_key( (string) ( $task['executionKind'] ?? '' ) );
			$exec_status = sanitize_key( (string) ( $task['lastExecutionStatus'] ?? '' ) );
			$line       = '- ' . $title;
			if ( ! empty( $task['id'] ) ) {
				$line .= ' (taskId ' . (int) $task['id'] . ')';
			}
			if ( $project !== '' ) {
				$line .= ' (' . $project . ')';
			}
			if ( $status !== '' && $status !== 'todo' ) {
				$line .= ' [' . $status . ']';
			}
			if ( $due_day !== '' ) {
				$line .= ' due ' . $due_day;
				if ( $due_day < $today ) {
					$line .= ' (overdue)';
				} elseif ( $due_day === $today ) {
					$line .= ' (today)';
				}
			}
			if ( $recurrence !== '' && $recurrence !== 'none' ) {
				$line .= ', repeats ' . $recurrence;
			}
			if ( $client !== '' ) {
				$line .= ', client id ' . $client;
			}
			if ( $exec_kind !== '' ) {
				$line .= ', executionKind ' . $exec_kind;
			}
			if ( $exec_status !== '' ) {
				$line .= ', lastExecution ' . $exec_status;
			}
			$lines[] = $line;
		}
		if ( count( $lines ) <= 1 ) {
			return '';
		}
		return implode( "\n", $lines );
	}

	/**
	 * @param array<string,mixed>      $body
	 * @param array<string,mixed>|null $research
	 * @param array<string,mixed>|null $data_research
	 */
	private static function ask_system_prompt( array $body, ?array $research = null, ?array $data_research = null ): string {
		$researched = ( $research !== null && ! empty( $research['block'] ) ) ? (string) $research['block'] : '';
		$data_block = ( $data_research !== null && ! empty( $data_research['block'] ) ) ? (string) $data_research['block'] : '';
		return implode(
			"\n",
			array_filter(
				array(
					'You are NEO Pulse Assist, a read-only helper inside the NEO Pulse manager app (neodigital.ca/app).',
					'Answer using the Pulse workspace context and researched module docs below. Suggest concrete in-app actions instead of WordPress plugin steps unless the user asks about their connected site.',
					'Never claim you changed content, published posts, or ran bulk jobs.',
					self::certainty_rules(),
					self::minimal_global_ui_rules(),
					$researched !== '' ? $researched : '',
					$data_block !== '' ? $data_block : '',
					$data_block !== '' ? self::data_tool_rules() : '',
					self::feature_playbook_rules(),
					self::markdown_format_rules(),
					self::navigation_link_rules(),
					self::followup_topic_rules(),
					self::context_block( $body ),
					self::properties_context_block( $body ),
					self::pulse_assigned_tasks_block( $body ),
					'Respond with JSON only: {"title":"short topic headline or empty","body":"markdown answer with linked destinations","relatedTopics":["topic-specific follow-up 1","topic-specific follow-up 2","topic-specific follow-up 3"],"links":[{"label":"Teams → Chat","url":"pulse:nav/chat","action":"navigate"}]}. relatedTopics and links are top-level JSON fields only. Never put relatedTopics:, links:, or JSON objects inside body.',
				)
			)
		);
	}

	private static function data_tool_rules(): string {
		return Neo_Pulse_App_Data_Tool_Grounding::rules();
	}

	/**
	 * @param array<string,mixed>      $body
	 * @param array<string,mixed>|null $research
	 * @param array<string,mixed>|null $data_research
	 */
	private static function plan_system_prompt( array $body, ?array $research = null, ?array $data_research = null ): string {
		$researched = ( $research !== null && ! empty( $research['block'] ) ) ? (string) $research['block'] : '';
		$data_block = ( $data_research !== null && ! empty( $data_research['block'] ) ) ? (string) $data_research['block'] : '';
		return implode(
			"\n",
			array_filter(
				array(
					'You are NEO Pulse Assist in Plan mode for the NEO Pulse manager app.',
					'Produce a read-only plan preview: numbered steps the user could take inside NEO Pulse. Do not execute writes.',
					self::certainty_rules(),
					self::minimal_global_ui_rules(),
					$researched !== '' ? $researched : '',
					$data_block !== '' ? $data_block : '',
					$data_block !== '' ? self::data_tool_rules() : '',
					self::feature_playbook_rules(),
					self::markdown_format_rules(),
					self::navigation_link_rules(),
					self::followup_topic_rules(),
					self::context_block( $body ),
					self::properties_context_block( $body ),
					self::pulse_assigned_tasks_block( $body ),
					'Respond with JSON only: {"title":"Plan preview","body":"markdown plan with numbered steps and linked destinations","relatedTopics":["topic-specific follow-up 1","topic-specific follow-up 2"],"links":[{"label":"Teams → Chat","url":"pulse:nav/chat","action":"navigate"}]}',
				)
			)
		);
	}

	/**
	 * @param array<string,mixed> $body
	 */
	private static function context_block( array $body ): string {
		$pulse = isset( $body['pulse_context'] ) && is_array( $body['pulse_context'] ) ? $body['pulse_context'] : array();
		$lines = array( 'Pulse context:' );

		$map = array(
			'managerTab'              => 'Manager tab',
			'generatorSection'        => 'Generator section',
			'dashboardCluster'        => 'Dashboard cluster',
			'locationSummary'         => 'Current location',
			'researchSection'         => 'Research section',
			'sitemapMode'             => 'Sitemap optimizer mode',
			'contentOptimizerSection' => 'Content optimizer section',
			'sitemapSource'           => 'Sitemap source',
			'siteName'                => 'Header active property (workspace selection, not total client count)',
			'siteId'                  => 'Property id',
			'expandedPageTitle'       => 'Focused page title',
			'expandedPageUrl'         => 'Focused page URL',
			'pulseAppUrl'             => 'Current app URL',
		);
		foreach ( $map as $key => $label ) {
			if ( ! empty( $pulse[ $key ] ) && is_scalar( $pulse[ $key ] ) ) {
				$lines[] = '- ' . $label . ': ' . sanitize_text_field( (string) $pulse[ $key ] );
			}
		}

		$scope = isset( $body['target_scope'] ) ? sanitize_key( (string) $body['target_scope'] ) : 'page';
		$lines[] = '- Target scope: ' . $scope;
		if ( $scope === 'page' && ! empty( $body['page_title'] ) ) {
			$lines[] = '- Page title: ' . sanitize_text_field( (string) $body['page_title'] );
		}
		if ( $scope === 'page' && ! empty( $body['page_url'] ) ) {
			$lines[] = '- Page URL: ' . esc_url_raw( (string) $body['page_url'] );
		}
		if ( $scope === 'page' && ! empty( $body['post_id'] ) && (int) $body['post_id'] > 0 ) {
			$lines[] = '- Post id: ' . (int) $body['post_id'];
		}
		if ( ! empty( $body['siteUrl'] ) ) {
			$lines[] = '- Connected site URL: ' . esc_url_raw( (string) $body['siteUrl'] );
		}

		return implode( "\n", $lines );
	}

	/**
	 * @param array<int,mixed> $history
	 * @return array<int,array{role:string,content:string}>
	 */
	private static function normalize_history( array $history ) {
		$out = array();
		foreach ( $history as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$role = isset( $row['role'] ) ? sanitize_key( (string) $row['role'] ) : '';
			if ( $role !== 'user' && $role !== 'assistant' ) {
				continue;
			}
			$content = isset( $row['content'] ) ? trim( (string) $row['content'] ) : '';
			if ( $content === '' && $role === 'assistant' && ! empty( $row['card']['body'] ) ) {
				$content = trim( (string) $row['card']['body'] );
			}
			if ( $content === '' ) {
				continue;
			}
			$out[] = array(
				'role'    => $role,
				'content' => mb_substr( $content, 0, 4000 ),
			);
		}
		return array_slice( $out, -12 );
	}

	/**
	 * @param array<int,array{role:string,content:string}> $history
	 * @return array<int,array{role:string,content:string}>
	 */
	private static function chat_messages( string $system_prompt, array $history, string $message ) {
		$messages = array(
			array(
				'role'    => 'system',
				'content' => $system_prompt,
			),
		);
		foreach ( $history as $row ) {
			$messages[] = $row;
		}
		$messages[] = array(
			'role'    => 'user',
			'content' => $message,
		);
		return $messages;
	}

	/**
	 * @param mixed $topics
	 * @return array<int,string>
	 */
	private static function sanitize_topics( $topics ) {
		if ( ! is_array( $topics ) ) {
			return array();
		}
		$out = array();
		foreach ( $topics as $topic ) {
			if ( ! is_scalar( $topic ) ) {
				continue;
			}
			$t = trim( sanitize_text_field( (string) $topic ) );
			if ( $t !== '' ) {
				$out[] = $t;
			}
			if ( count( $out ) >= 4 ) {
				break;
			}
		}
		return $out;
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function error_card( string $message ) {
		return array(
			'type'       => 'error',
			'title'      => 'NEO Pulse Assist error',
			'body'       => $message,
			'confidence' => 'low',
		);
	}

	private static function normalize_submode( string $submode ): string {
		$submode = sanitize_key( $submode );
		if ( in_array( $submode, array( 'ask', 'plan', 'build' ), true ) ) {
			return $submode;
		}
		return 'ask';
	}
}
