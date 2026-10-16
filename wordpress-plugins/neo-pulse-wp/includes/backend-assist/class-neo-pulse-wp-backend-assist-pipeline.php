<?php
/**
 * Backend Assist — orchestrates single-shot and plan-mode pipelines
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Pipeline {

	public static function run_pipeline( string $message, array $history ): array {
		$context_card = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::try_execute_contextual_write( $message, $history );
		if ( is_array( $context_card ) ) {
			return $context_card;
		}

		$cached_card = self::try_execute_cached_plan( $message, $history );
		if ( is_array( $cached_card ) ) {
			return $cached_card;
		}

		$classification = Neo_Pulse_Wp_Backend_Assist_Pipeline_Classify::phase_classify( $message, $history );
		if ( is_wp_error( $classification ) ) {
			return Neo_Pulse_Wp_Backend_Assist_Cards::error_card( $classification->get_error_message() );
		}

		if ( Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::message_requests_new_page_or_post( $message ) ) {
			return self::run_create_page_build( $message, $history, $classification );
		}

		return self::run_from_classification( $classification, $message, $history );
	}

	/**
	 * Build a new page/post pack and execute it. Never writes to the open editor post.
	 *
	 * @param array<string, mixed>             $classification
	 * @param array<int, array<string, mixed>> $history
	 * @return array<string, mixed>
	 */
	public static function run_create_page_build( string $message, array $history, array $classification ): array {
		$tool = isset( $classification['tool'] ) ? sanitize_key( (string) $classification['tool'] ) : '';
		if ( ! in_array( $tool, array( 'create_page', 'create_post' ), true ) ) {
			$tool = str_contains( strtolower( $message ), 'post' ) ? 'create_post' : 'create_page';
		}

		$topic = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::create_page_title_from_message( $message, $classification );
		$classification['tool'] = $tool;
		if ( ! isset( $classification['params'] ) || ! is_array( $classification['params'] ) ) {
			$classification['params'] = array();
		}
		if ( $topic['title'] !== '' ) {
			$classification['params']['title'] = $topic['title'];
		}
		if ( $topic['keyword'] !== '' ) {
			$classification['params']['focus_keyword'] = $topic['keyword'];
		}

		$workflow_id = Neo_Pulse_Wp_Backend_Assist_Workflow::workflow_id_from_history( $history );
		$workflow    = $workflow_id !== '' ? Neo_Pulse_Wp_Backend_Assist_Workflow::load_workflow( $workflow_id ) : null;
		if ( ! is_array( $workflow ) ) {
			$decomposed = Neo_Pulse_Wp_Backend_Assist_Workflow_Builder::expand_create_to_full_page(
				array(
					'workflow' => false,
					'steps'    => array(),
				),
				$message,
				$classification
			);
			$workflow_id = Neo_Pulse_Wp_Backend_Assist_Workflow::save_workflow( $message, $history, $decomposed );
			if ( $workflow_id === '' ) {
				return Neo_Pulse_Wp_Backend_Assist_Cards::error_card( __( 'Could not start the page workflow.', 'neo-pulse-wp' ) );
			}
		}

		$create_card = self::execute_write_tool(
			$message,
			$history,
			$tool,
			array(
				'title'         => $topic['title'],
				'focus_keyword' => $topic['keyword'],
				'status'        => 'draft',
			)
		);
		$created = isset( $create_card['action_result'] ) && is_array( $create_card['action_result'] )
			? $create_card['action_result']
			: array();
		if ( empty( $created['success'] ) || empty( $created['post_id'] ) ) {
			$err = isset( $created['error'] ) ? (string) $created['error'] : __( 'Could not create the page.', 'neo-pulse-wp' );
			return Neo_Pulse_Wp_Backend_Assist_Cards::error_card( $err );
		}

		$last = Neo_Pulse_Wp_Backend_Assist_Workflow::bind_new_page_and_run(
			$workflow_id,
			(int) $created['post_id'],
			$topic['title'],
			$topic['keyword'],
			$message,
			$history
		);
		return self::action_card_from_workflow_run( $last, (int) $created['post_id'], $topic['title'] );
	}

	/**
	 * @param array<string, mixed> $last
	 * @return array<string, mixed>
	 */
	private static function action_card_from_workflow_run( array $last, int $post_id, string $title ): array {
		if ( ! empty( $last['error'] ) ) {
			return Neo_Pulse_Wp_Backend_Assist_Cards::error_card( (string) $last['error'] );
		}

		$card   = isset( $last['card'] ) && is_array( $last['card'] ) ? $last['card'] : array();
		$result = isset( $last['result'] ) && is_array( $last['result'] ) ? $last['result'] : array();
		$exec   = isset( $card['action_result'] ) && is_array( $card['action_result'] ) ? $card['action_result'] : $result;
		if ( empty( $exec['success'] ) ) {
			$err = isset( $exec['error'] ) ? (string) $exec['error'] : __( 'Build did not finish the page changes.', 'neo-pulse-wp' );
			return Neo_Pulse_Wp_Backend_Assist_Cards::error_card( $err );
		}

		$exec['success']           = true;
		$exec['post_id']           = $post_id;
		$exec['title']             = $title;
		$exec['build_executed']    = true;
		$exec['build_executed_at'] = gmdate( 'c' );
		$card['type']              = 'action';
		$card['action_result']     = $exec;
		return $card;
	}

	/**
	 * Execute a write tool and return an enriched action card.
	 *
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	public static function execute_write_tool( string $message, array $history, string $tool, array $params ): array {
		$tool = sanitize_key( $tool );
		if ( $tool === '' || ! isset( Neo_Pulse_Wp_Backend_Assist_Context::$tool_registry[ $tool ] ) ) {
			return Neo_Pulse_Wp_Backend_Assist_Cards::error_card( __( 'Could not run this action.', 'neo-pulse-wp' ) );
		}

		$prepared    = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::prepare_tool_params( $message, $history, $tool, $params );
		$tool        = $prepared['tool'];
		$params      = $prepared['params'];
		$exec_result = self::stamp_build_execution(
			Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_execute( $tool, $params )
		);
		$truthful_tools = array(
			'update_post',
			'add_content',
			'save_post_meta',
			'run_seo_research_brief',
			'restore_post_revision',
			'compose_elementor_page_sections',
			'design_page_with_novamira',
		);
		if ( ! empty( $exec_result['success'] ) && in_array( $tool, $truthful_tools, true ) ) {
			return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_card(
				Neo_Pulse_Wp_Backend_Assist_Cards::action_card( $exec_result, $tool ),
				$tool,
				$exec_result
			);
		}

		$answer = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_reason_action( $message, $history, $tool, $params, $exec_result );
		if ( is_wp_error( $answer ) ) {
			return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_card(
				Neo_Pulse_Wp_Backend_Assist_Cards::action_card( $exec_result, $tool ),
				$tool,
				$exec_result
			);
		}
		$card = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_format( $answer, 'action' );
		if ( is_wp_error( $card ) ) {
			return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_card(
				Neo_Pulse_Wp_Backend_Assist_Cards::action_card( $exec_result, $tool ),
				$tool,
				$exec_result
			);
		}
		$card['action_result'] = $exec_result;
		return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_card( $card, $tool, $exec_result );
	}

	/**
	 * Mark that phase_execute ran in this Build request (harness gating).
	 *
	 * @param array<string, mixed> $exec_result
	 * @return array<string, mixed>
	 */
	private static function stamp_build_execution( array $exec_result ): array {
		$exec_result['build_executed']    = true;
		$exec_result['build_executed_at'] = gmdate( 'c' );
		return $exec_result;
	}

	/**
	 * Build mode: run a cached Plan preview without re-classifying.
	 *
	 * @param array<int, array<string, mixed>> $history
	 * @return array<string, mixed>|null
	 */
	public static function try_execute_cached_plan( string $message, array $history ): ?array {
		if ( Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::message_requests_new_page_or_post( $message ) ) {
			return null;
		}

		$post_id = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::resolve_effective_post_id( array(), $message );
		$cached  = $post_id > 0 ? Neo_Pulse_Wp_Backend_Assist_Plan_Cache::load( $message, $post_id ) : null;
		if ( ! is_array( $cached ) || empty( $cached['tool'] ) ) {
			return null;
		}

		if ( $post_id < 1 && ! empty( $cached['post_id'] ) ) {
			$post_id = absint( $cached['post_id'] );
		}
		if ( $post_id < 1 ) {
			return null;
		}

		$cached_tool = sanitize_key( (string) $cached['tool'] );
		$tool        = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::resolve_write_tool_for_message( $message, $cached_tool );
		$params      = isset( $cached['params'] ) && is_array( $cached['params'] ) ? $cached['params'] : array();
		if ( $tool !== $cached_tool ) {
			$params = array( 'post_id' => $post_id );
		} elseif ( empty( $params['post_id'] ) ) {
			$params['post_id'] = $post_id;
		}
		if ( $tool === 'save_post_meta' ) {
			unset( $params['content'], $params['mode'] );
		}

		if ( ! empty( $params['faq_compound'] ) ) {
			$result = Neo_Pulse_Wp_Backend_Assist_Subagent_Registry::run_agents(
				$message,
				$history,
				$params,
				array( 'faq_schema', 'body_faq_table' )
			);
			$card = empty( $result['success'] )
				? Neo_Pulse_Wp_Backend_Assist_Cards::error_card( (string) ( $result['error'] ?? __( 'FAQ update failed.', 'neo-pulse-wp' ) ) )
				: Neo_Pulse_Wp_Backend_Assist_Cards::enrich_card(
					Neo_Pulse_Wp_Backend_Assist_Cards::action_card( $result, 'faq_compound' ),
					'faq_compound',
					$result
				);
			if ( ! empty( $card['type'] ) && sanitize_key( (string) $card['type'] ) === 'action' && ! empty( $card['action_result']['success'] ) ) {
				Neo_Pulse_Wp_Backend_Assist_Plan_Cache::clear( $message, $post_id );
			}
			return $card;
		}

		if ( ! empty( $params['meta_compound'] ) ) {
			$card = Neo_Pulse_Wp_Backend_Assist_Meta_Compound::run( $message, $history, $params );
			if ( ! empty( $card['type'] ) && sanitize_key( (string) $card['type'] ) === 'action' && ! empty( $card['action_result']['success'] ) ) {
				Neo_Pulse_Wp_Backend_Assist_Plan_Cache::clear( $message, $post_id );
			}
			return $card;
		}

		if ( ! empty( $params['agents'] ) && is_array( $params['agents'] ) ) {
			$result = Neo_Pulse_Wp_Backend_Assist_Subagent_Registry::run_agents( $message, $history, $params, $params['agents'] );
			$tool   = in_array( 'body_full_post', $params['agents'], true ) || self::agents_are_body_only( $params['agents'] )
				? 'add_content'
				: 'save_post_meta';
			$card = empty( $result['success'] )
				? Neo_Pulse_Wp_Backend_Assist_Cards::error_card( (string) ( $result['error'] ?? __( 'Build execution failed.', 'neo-pulse-wp' ) ) )
				: Neo_Pulse_Wp_Backend_Assist_Cards::enrich_card(
					Neo_Pulse_Wp_Backend_Assist_Cards::action_card( $result, $tool ),
					$tool,
					$result
				);
			if ( ! empty( $card['type'] ) && sanitize_key( (string) $card['type'] ) === 'action' && ! empty( $card['action_result']['success'] ) ) {
				Neo_Pulse_Wp_Backend_Assist_Plan_Cache::clear( $message, $post_id );
			}
			return $card;
		}

		$card = self::execute_write_tool( $message, $history, $tool, $params );
		if ( ! empty( $card['type'] ) && sanitize_key( (string) $card['type'] ) === 'action' && ! empty( $card['action_result']['success'] ) ) {
			Neo_Pulse_Wp_Backend_Assist_Plan_Cache::clear( $message, $post_id );
		}

		return $card;
	}

	/**
	 * @param array<string, mixed>           $classification
	 * @param array<int, array<string, mixed>> $history
	 * @return array<string, mixed>
	 */
	public static function run_from_classification( array $classification, string $message, array $history ): array {
		$intent = isset( $classification['intent'] ) ? $classification['intent'] : 'question';
		$tool   = isset( $classification['tool'] ) ? $classification['tool'] : '';
		$params = isset( $classification['params'] ) && is_array( $classification['params'] ) ? $classification['params'] : array();

		$faq_append = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::try_faq_table_append_response( $message, $history, $params );
		if ( is_array( $faq_append ) ) {
			return $faq_append;
		}

		if ( $intent === 'needs_info' && $tool !== '' ) {
			$missing = isset( $classification['missing'] ) && is_array( $classification['missing'] ) ? $classification['missing'] : array();
			return Neo_Pulse_Wp_Backend_Assist_Cards::needs_info_card( $tool, $missing );
		}

		if ( Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::message_requests_new_page_or_post( $message ) ) {
			return self::run_create_page_build( $message, $history, $classification );
		}

		if (
			$intent === 'action'
			&& Neo_Pulse_Wp_Backend_Assist_Meta_Compound::message_requests_meta_compound( $message )
		) {
			return Neo_Pulse_Wp_Backend_Assist_Meta_Compound::run( $message, $history, $params );
		}

		if ( $intent === 'action' && Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::message_requests_faq_compound( $message ) ) {
			$result = Neo_Pulse_Wp_Backend_Assist_Subagent_Registry::run_agents(
				$message,
				$history,
				$params,
				array( 'faq_schema', 'body_faq_table' )
			);
			if ( empty( $result['success'] ) ) {
				return Neo_Pulse_Wp_Backend_Assist_Cards::error_card( (string) ( $result['error'] ?? __( 'FAQ update failed.', 'neo-pulse-wp' ) ) );
			}
			return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_card(
				Neo_Pulse_Wp_Backend_Assist_Cards::action_card( $result, 'faq_compound' ),
				'faq_compound',
				$result
			);
		}

		if (
			$intent === 'action'
			&& Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::message_requests_body_schema_cleanup( $message )
			&& Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::message_requests_faq_schema( $message )
			&& ! Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::message_requests_faq_table( $message )
		) {
			return self::run_body_schema_cleanup( $message, $history, $params );
		}

		if ( $intent === 'action' && $tool !== '' && isset( Neo_Pulse_Wp_Backend_Assist_Context::$tool_registry[ $tool ] ) ) {
			$tool = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::resolve_write_tool_for_message( $message, $tool );
			return self::execute_write_tool( $message, $history, $tool, $params );
		}

		$answer = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_reason_question( $message, $history );
		if ( is_wp_error( $answer ) ) {
			return Neo_Pulse_Wp_Backend_Assist_Cards::error_card( $answer->get_error_message() );
		}

		$card = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_format( $answer, 'answer' );
		if ( is_wp_error( $card ) ) {
			return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_card(
				array(
					'type'       => 'answer',
					'title'      => __( 'Here\'s what I found', 'neo-pulse-wp' ),
					'body'       => $answer,
					'links'      => array(),
					'confidence' => 'medium',
				)
			);
		}

		return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_card( $card );
	}
	public static function run_plan( string $message, array $history ): array {
		$decomposed = Neo_Pulse_Wp_Backend_Assist_Pipeline_Classify::phase_decompose_workflow( $message, $history );
		if ( is_wp_error( $decomposed ) ) {
			return Neo_Pulse_Wp_Backend_Assist_Cards::error_card( $decomposed->get_error_message() );
		}

		$decomposed = Neo_Pulse_Wp_Backend_Assist_Workflow_Builder::expand_create_to_full_page( $decomposed, $message );

		$is_workflow = ! empty( $decomposed['workflow'] )
			&& ! empty( $decomposed['steps'] )
			&& is_array( $decomposed['steps'] )
			&& count( $decomposed['steps'] ) > 0;

		if ( ! $is_workflow ) {
			$card              = self::run_pipeline( $message, $history );
			$card['workflow']  = false;
			return $card;
		}

		$workflow_id = Neo_Pulse_Wp_Backend_Assist_Workflow::save_workflow( $message, $history, $decomposed );
		if ( $workflow_id === '' ) {
			return Neo_Pulse_Wp_Backend_Assist_Cards::error_card( __( 'Could not start workflow.', 'neo-pulse-wp' ) );
		}

		return Neo_Pulse_Wp_Backend_Assist_Workflow::workflow_plan_card( $workflow_id );
	}

	/**
	 * Plan preview for Super Admin Plan submode (no step execution).
	 *
	 * @param array<string, mixed>           $classification
	 * @param array<int, array<string, mixed>> $history
	 * @return array<string, mixed>
	 */
	public static function run_plan_preview( string $message, array $history, array $classification ): array {
		$params = isset( $classification['params'] ) && is_array( $classification['params'] ) ? $classification['params'] : array();
		$faq_append = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::try_faq_table_append_response( $message, $history, $params );
		if ( is_array( $faq_append ) ) {
			$faq_post_id = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::resolve_effective_post_id( $params );
			return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_plan_card( $faq_append, $faq_post_id, 'add_content' );
		}

		$tool    = isset( $classification['tool'] ) ? sanitize_key( (string) $classification['tool'] ) : '';
		$params  = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::resolve_plan_action_params( $message, $history, $classification, true );
		$tool    = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::resolve_write_tool_for_message( $message, $tool );
		if ( Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::message_requests_date_modifier( $message ) ) {
			$tool = 'save_post_meta';
		}
		if ( Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::message_clear_meta_field_hub_key( $message ) !== '' ) {
			$tool = 'save_post_meta';
		}
		if ( Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::message_requests_seo_research_brief( $message ) ) {
			$tool = 'run_seo_research_brief';
		}
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;

		if (
			$tool === 'add_content'
			&& $post_id > 0
			&& Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::should_use_body_ops( $message, $post_id, $params )
		) {
			$preview = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::build_body_ops_plan_preview( $message, $history, $classification );
			if ( ! is_wp_error( $preview ) ) {
				return $preview;
			}
		}

		$decomposed = Neo_Pulse_Wp_Backend_Assist_Pipeline_Classify::phase_decompose_workflow( $message, $history );
		if ( is_wp_error( $decomposed ) ) {
			return Neo_Pulse_Wp_Backend_Assist_Cards::error_card( $decomposed->get_error_message() );
		}

		$decomposed = Neo_Pulse_Wp_Backend_Assist_Workflow_Builder::expand_create_to_full_page( $decomposed, $message, $classification );

		$is_workflow = ! empty( $decomposed['workflow'] )
			&& ! empty( $decomposed['steps'] )
			&& is_array( $decomposed['steps'] )
			&& count( $decomposed['steps'] ) > 0;

		if ( $is_workflow ) {
			$workflow_id = Neo_Pulse_Wp_Backend_Assist_Workflow::save_workflow( $message, $history, $decomposed );
			if ( $workflow_id === '' ) {
				return Neo_Pulse_Wp_Backend_Assist_Cards::error_card( __( 'Could not build plan.', 'neo-pulse-wp' ) );
			}

			$workflow = Neo_Pulse_Wp_Backend_Assist_Workflow::load_workflow( $workflow_id );
			$title    = ( is_array( $workflow ) && ! empty( $workflow['title'] ) )
				? (string) $workflow['title']
				: __( 'Proposed plan', 'neo-pulse-wp' );
			$steps    = ( is_array( $workflow ) && ! empty( $workflow['steps'] ) )
				? Neo_Pulse_Wp_Backend_Assist_Workflow::workflow_steps_for_card( $workflow['steps'] )
				: array();

			foreach ( $steps as $i => $step ) {
				$steps[ $i ]['status'] = 'pending';
			}

			$body = Neo_Pulse_Wp_Backend_Assist_Plan_Preview::build_body(
				$message,
				$history,
				array(
					'tool'     => $tool,
					'params'   => $params,
					'workflow' => $decomposed,
					'steps'    => $steps,
				)
			);

			return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_plan_card(
				array(
					'type'              => 'plan',
					'workflow'          => true,
					'workflow_id'       => $workflow_id,
					'title'             => $title,
					'body'              => $body,
					'steps'             => $steps,
					'workflow_complete' => false,
					'links'             => array(),
					'submode_switch'    => 'build',
					'confidence'        => 'high',
				),
				Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::resolve_effective_post_id( $params, $message ),
				$tool,
				$message
			);
		}

		$label  = self::plan_step_label( $tool, $params, $message );
		$body   = Neo_Pulse_Wp_Backend_Assist_Plan_Preview::build_body(
			$message,
			$history,
			array(
				'tool'   => $tool,
				'params' => $params,
				'steps'  => array(
					array(
						'label' => $label,
					),
				),
			)
		);

		self::cache_plan_for_build( $message, $tool, $params );

		return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_plan_card(
			array(
				'type'              => 'plan',
				'workflow'          => false,
				'title'             => __( 'Proposed plan', 'neo-pulse-wp' ),
				'body'              => $body,
				'steps'             => array(
					array(
						'label'      => $label,
						'status'     => 'pending',
						'tool'       => $tool,
						'executable' => true,
						'visible'    => true,
					),
				),
				'workflow_complete' => false,
				'links'             => array(),
				'submode_switch'    => 'build',
				'confidence'        => 'high',
				'planned_tool'      => $tool,
			),
			Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::resolve_effective_post_id( $params, $message ),
			$tool,
			$message
		);
	}

	private static function cache_plan_for_build( string $message, string $tool, array $params ): void {
		$post_id = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::resolve_effective_post_id( $params, $message );
		if ( $post_id < 1 || $tool === '' ) {
			return;
		}

		if ( Neo_Pulse_Wp_Backend_Assist_Meta_Compound::message_requests_meta_compound( $message ) ) {
			$params = Neo_Pulse_Wp_Backend_Assist_Meta_Compound::plan_cache_params( $params, $message );
		} elseif ( Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::message_requests_faq_compound( $message ) ) {
			$params = Neo_Pulse_Wp_Backend_Assist_Subagent_Registry::plan_cache_params( $message, $params );
		}

		Neo_Pulse_Wp_Backend_Assist_Plan_Cache::save(
			$message,
			$post_id,
			array(
				'tool'   => sanitize_key( $tool ),
				'params' => $params,
			)
		);
	}

	/**
	 * @param array<int, string> $agents
	 */
	private static function agents_are_body_only( array $agents ): bool {
		$catalog = Neo_Pulse_Wp_Backend_Assist_Subagent_Registry::agent_catalog();
		foreach ( $agents as $agent_id ) {
			$id = sanitize_key( (string) $agent_id );
			if ( ! isset( $catalog[ $id ] ) ) {
				continue;
			}
			if ( $catalog[ $id ]['harness'] !== 'wysiwyg' ) {
				return false;
			}
		}
		return $agents !== array();
	}

	/**
	 * @param array<string, mixed> $params
	 */
	private static function plan_step_label( string $tool, array $params, string $message ): string {
		if ( ! empty( $params['title'] ) ) {
			return sprintf(
				/* translators: 1: tool label, 2: title */
				__( '%1$s: %2$s', 'neo-pulse-wp' ),
				ucwords( str_replace( '_', ' ', $tool ) ),
				sanitize_text_field( (string) $params['title'] )
			);
		}
		if ( ! empty( $params['post_id'] ) ) {
			$post_id = absint( $params['post_id'] );
			$post    = get_post( $post_id );
			$title   = $post instanceof WP_Post ? $post->post_title : (string) $post_id;
			return sprintf(
				/* translators: 1: tool label, 2: post title */
				__( '%1$s on %2$s', 'neo-pulse-wp' ),
				ucwords( str_replace( '_', ' ', $tool ) ),
				$title
			);
		}
		$trimmed = trim( $message );
		if ( $trimmed !== '' ) {
			return ucwords( str_replace( '_', ' ', $tool ) ) . ': ' . mb_substr( $trimmed, 0, 80 );
		}
		return ucwords( str_replace( '_', ' ', $tool ) );
	}

	/**
	 * Strip JSON-LD from post body and save FAQ schema to ACF meta.
	 *
	 * @param array<string, mixed>           $params
	 * @param array<int, array<string, mixed>> $history
	 * @return array<string, mixed>
	 */
	private static function run_body_schema_cleanup( string $message, array $history, array $params ): array {
		$content_prep = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::prepare_tool_params( $message, $history, 'add_content', $params );
		$post_id      = isset( $content_prep['params']['post_id'] ) ? absint( $content_prep['params']['post_id'] ) : 0;

		if ( $post_id < 1 ) {
			return Neo_Pulse_Wp_Backend_Assist_Cards::error_card( __( 'Could not resolve post for body schema cleanup.', 'neo-pulse-wp' ) );
		}

		$content_result = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_execute( 'add_content', $content_prep['params'] );

		$entries = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::generate_faq_qa_pairs( $post_id, $message, $history );
		if ( is_wp_error( $entries ) ) {
			if ( ! empty( $content_result['success'] ) ) {
				return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_card(
					Neo_Pulse_Wp_Backend_Assist_Cards::action_card( $content_result, 'add_content' ),
					'add_content',
					$content_result
				);
			}
			return Neo_Pulse_Wp_Backend_Assist_Cards::error_card( $entries->get_error_message() );
		}

		$schema_json = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::faq_entries_to_schema_json( $entries );
		$meta_prep   = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::prepare_tool_params( $message, $history, 'save_post_meta', array_merge( $params, array( 'post_id' => $post_id ) ) );
		$meta_params = array_merge(
			is_array( $meta_prep['params'] ) ? $meta_prep['params'] : array(),
			array(
				'post_id' => $post_id,
				'faq'     => $schema_json,
			)
		);
		$meta_result = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_execute( 'save_post_meta', $meta_params );

		$combined = array(
			'success'          => ! empty( $content_result['success'] ) && ! empty( $meta_result['success'] ),
			'body_schema_cleanup' => true,
			'post_id'          => $post_id,
			'title'            => $content_result['title'] ?? $meta_result['title'] ?? '',
			'edit_url'         => $content_result['edit_url'] ?? $meta_result['edit_url'] ?? '',
			'view_url'         => $content_result['view_url'] ?? $meta_result['view_url'] ?? '',
			'word_count'       => $content_result['word_count'] ?? null,
			'surgical_summary' => $content_result['ops_summary'] ?? $content_result['surgical_summary'] ?? __( 'stripped JSON-LD from body', 'neo-pulse-wp' ),
			'saved'            => $meta_result['saved'] ?? array(),
		);

		if ( ! $combined['success'] ) {
			$combined['error'] = $content_result['error'] ?? $meta_result['error'] ?? __( 'Body schema cleanup failed.', 'neo-pulse-wp' );
		}

		return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_card(
			Neo_Pulse_Wp_Backend_Assist_Cards::action_card( $combined, 'body_schema_cleanup' ),
			'body_schema_cleanup',
			$combined
		);
	}
}
