<?php
/**
 * Backend Assist — multi-step workflow engine and transients
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Workflow {

	public static function workflow_transient_key( string $workflow_id ): string {
		return 'neo-pulse_ba_wf_' . get_current_user_id() . '_' . sanitize_key( $workflow_id );
	}
	public static function save_workflow( string $message, array $history, array $decomposed ): string {
		$workflow_id = 'wf_' . time() . '_' . wp_generate_password( 8, false, false );
		$built       = Neo_Pulse_Wp_Backend_Assist_Workflow_Builder::build_workflow_steps( $message, $history, $decomposed );

		if ( empty( $built['steps'] ) ) {
			return '';
		}

		$data = array(
			'message'               => $message,
			'history'               => $history,
			'title'                 => isset( $decomposed['title'] ) ? sanitize_text_field( $decomposed['title'] ) : '',
			'steps'                 => $built['steps'],
			'outline'               => isset( $built['outline'] ) ? $built['outline'] : array(),
			'last_post_id'          => 0,
			'last_elementor_sections' => array(),
			'step_results'          => array(),
			'focus_keyword'         => isset( $built['focus_keyword'] ) ? $built['focus_keyword'] : '',
			'post_title'            => isset( $built['post_title'] ) ? $built['post_title'] : '',
			'needs_internal_links'  => ! empty( $built['needs_internal_links'] ),
			'linkable_posts'        => array(),
		);

		set_transient( self::workflow_transient_key( $workflow_id ), $data, Neo_Pulse_Wp_Backend_Assist_Context::WORKFLOW_TTL );

		return $workflow_id;
	}
	public static function is_registered_executable_tool( string $tool ): bool {
		return isset( Neo_Pulse_Wp_Backend_Assist_Context::$tool_registry[ $tool ] );
	}
	public static function is_step_executable( array $step_def ): bool {
		if ( isset( $step_def['executable'] ) ) {
			return (bool) $step_def['executable'];
		}
		return self::is_registered_executable_tool( $step_def['tool'] ?? '' );
	}
	public static function load_workflow( string $workflow_id ): ?array {
		$data = get_transient( self::workflow_transient_key( $workflow_id ) );
		return is_array( $data ) ? $data : null;
	}
	public static function persist_workflow( string $workflow_id, array $data ): void {
		set_transient( self::workflow_transient_key( $workflow_id ), $data, Neo_Pulse_Wp_Backend_Assist_Context::WORKFLOW_TTL );
	}
	public static function workflow_plan_card( string $workflow_id ): array {
		$workflow = self::load_workflow( $workflow_id );
		$title    = ( null !== $workflow && ! empty( $workflow['title'] ) )
			? $workflow['title']
			: __( 'Working on your request', 'neo-pulse-wp' );

		$steps = ( null !== $workflow && ! empty( $workflow['steps'] ) )
			? self::workflow_steps_for_card( $workflow['steps'] )
			: array();

		return array(
			'type'              => 'workflow',
			'workflow'          => true,
			'workflow_id'       => $workflow_id,
			'title'             => $title,
			'body'              => __( 'Running through the checklist below.', 'neo-pulse-wp' ),
			'steps'             => $steps,
			'workflow_complete' => false,
			'links'             => array(),
			'suggested_actions' => array(),
			'confidence'        => 'high',
		);
	}
	public static function execute_workflow_step( string $workflow_id, int $step_index, string $message, array $history ): array {
		if ( function_exists( 'set_time_limit' ) ) {
			@set_time_limit( 300 );
		}
		Neo_Pulse_Wp_OpenRouter::maybe_extend_time_limit();

		$workflow = self::load_workflow( $workflow_id );
		if ( null === $workflow ) {
			return array(
				'error'       => __( 'Workflow expired or not found. Please send your request again.', 'neo-pulse-wp' ),
				'http_status' => 404,
			);
		}

		if ( ! isset( $workflow['steps'][ $step_index ] ) ) {
			return array(
				'error'       => __( 'Invalid workflow step.', 'neo-pulse-wp' ),
				'http_status' => 400,
			);
		}

		$step_def = $workflow['steps'][ $step_index ];
		$tool     = isset( $step_def['tool'] ) ? $step_def['tool'] : '';

		if ( ! self::is_step_executable( $step_def ) ) {
			return array(
				'step_index'        => $step_index,
				'status'            => isset( $step_def['status'] ) ? $step_def['status'] : 'done',
				'label'             => isset( $step_def['label'] ) ? $step_def['label'] : '',
				'result'            => array( 'success' => true, 'skipped' => true ),
				'workflow_complete' => false,
				'skipped'           => true,
			);
		}

		if ( $tool === 'resolve_internal_links' ) {
			return Neo_Pulse_Wp_Backend_Assist_Content::execute_resolve_internal_links_step( $workflow_id, $step_index, $workflow );
		}

		if ( $tool === 'write_sections_batch' ) {
			return Neo_Pulse_Wp_Backend_Assist_Content::execute_write_sections_batch_step( $workflow_id, $step_index, $message, $history, $workflow );
		}

		$params = is_array( $step_def['params'] ) ? $step_def['params'] : array();

		$new_page = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::message_requests_new_page_or_post( $message );
		if ( $new_page && ! empty( $workflow['last_post_id'] ) ) {
			$params['post_id'] = (int) $workflow['last_post_id'];
		} elseif ( empty( $params['post_id'] ) && ! empty( $workflow['last_post_id'] ) ) {
			$params['post_id'] = (int) $workflow['last_post_id'];
		}

		if ( $tool === 'compose_elementor_page_sections' ) {
			if ( empty( $params['prompt'] ) && ! empty( $workflow['message'] ) ) {
				$params['prompt'] = (string) $workflow['message'];
			}
		}

		if ( $tool === 'add_content' && empty( $params['focus_keyword'] ) && ! empty( $workflow['step_results'] ) ) {
			foreach ( $workflow['step_results'] as $prior ) {
				if ( is_array( $prior ) && ! empty( $prior['focus_keyword'] ) ) {
					$params['focus_keyword'] = $prior['focus_keyword'];
					break;
				}
			}
		}

		if ( $tool === 'add_content' ) {
			if ( empty( $params['content_brief'] ) && ! empty( $workflow['message'] ) ) {
				$params['content_brief'] = $workflow['message'];
			}
			foreach ( $workflow['step_results'] as $prior ) {
				if ( is_array( $prior ) && ! empty( $prior['title'] ) && empty( $params['title'] ) ) {
					$params['title'] = $prior['title'];
					break;
				}
			}
		}

		$prepared = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::prepare_tool_params( $message, $history, $tool, $params, $workflow );
		$tool     = $prepared['tool'];
		$params   = $prepared['params'];
		$result   = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_execute( $tool, $params );

		$workflow['steps'][ $step_index ]['status'] = ! empty( $result['success'] ) ? 'done' : 'error';
		$workflow['steps'][ $step_index ]['result'] = $result;
		$workflow['step_results'][ $step_index ]     = $result;

		if ( ! empty( $result['post_id'] ) ) {
			$workflow['last_post_id'] = (int) $result['post_id'];
		}
		if ( ! empty( $result['sections'] ) && is_array( $result['sections'] ) ) {
			$existing = isset( $workflow['last_elementor_sections'] ) && is_array( $workflow['last_elementor_sections'] )
				? $workflow['last_elementor_sections']
				: array();
			$workflow['last_elementor_sections'] = Neo_Pulse_Wp_Backend_Assist_Tools_Elementor_Sections::merge_sections(
				$existing,
				$result['sections']
			);
		}
		if ( ! empty( $result['focus_keyword'] ) ) {
			$workflow['focus_keyword'] = sanitize_text_field( $result['focus_keyword'] );
		}
		if ( ! empty( $result['title'] ) ) {
			$workflow['post_title'] = sanitize_text_field( $result['title'] );
		}

		self::persist_workflow( $workflow_id, $workflow );

		$total_steps = count( $workflow['steps'] );
		$is_last     = ( $step_index >= $total_steps - 1 );
		$complete    = $is_last;
		$failed      = empty( $result['success'] );

		$response = array(
			'step_index'        => $step_index,
			'status'            => $workflow['steps'][ $step_index ]['status'],
			'label'             => $workflow['steps'][ $step_index ]['label'],
			'result'            => $result,
			'workflow_complete' => false,
		);

		if ( $failed ) {
			$response['workflow_complete'] = true;
			$response['card']              = self::workflow_failure_card( $workflow, $result, $tool );
			delete_transient( self::workflow_transient_key( $workflow_id ) );
			return $response;
		}

		if ( ! $complete ) {
			return $response;
		}

		$final_result = $result;
		foreach ( array_reverse( $workflow['step_results'] ) as $step_result ) {
			if ( ! empty( $step_result['success'] ) ) {
				$final_result = $step_result;
				break;
			}
		}

		$card = self::finalize_workflow_card( $message, $history, $workflow, $final_result );
		delete_transient( self::workflow_transient_key( $workflow_id ) );

		$response['workflow_complete'] = true;
		$response['card']              = $card;

		return $response;
	}
	public static function workflow_failure_card( array $workflow, array $result, string $tool ): array {
		$card = Neo_Pulse_Wp_Backend_Assist_Cards::action_card( $result, $tool );
		$card['type']              = 'workflow';
		$card['workflow']          = true;
		$card['workflow_complete'] = true;
		$card['steps']             = self::workflow_steps_for_card( $workflow['steps'] );
		$card['suggested_actions'] = array();
		return $card;
	}
	public static function workflow_steps_for_card( array $steps ): array {
		$out = array();
		foreach ( $steps as $step ) {
			$visible = true;
			if ( isset( $step['visible'] ) && false === $step['visible'] ) {
				$visible = false;
			}
			$out[] = array(
				'label'      => isset( $step['label'] ) ? $step['label'] : '',
				'status'     => isset( $step['status'] ) ? $step['status'] : 'pending',
				'step_kind'  => isset( $step['step_kind'] ) ? $step['step_kind'] : '',
				'executable' => self::is_step_executable( is_array( $step ) ? $step : array() ),
				'tool'       => isset( $step['tool'] ) ? $step['tool'] : '',
				'visible'    => $visible,
			);
		}
		return $out;
	}
	public static function finalize_workflow_card( string $message, array $history, array $workflow, array $final_result ): array {
		$steps_summary = array();
		foreach ( $workflow['steps'] as $step ) {
			$steps_summary[] = '- ' . $step['label'] . ': ' . ( isset( $step['status'] ) ? $step['status'] : 'done' );
		}

		$answer = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_reason_action(
			$message,
			$history,
			'workflow',
			array( 'title' => $workflow['title'] ),
			$final_result,
			true,
			implode( "\n", $steps_summary )
		);

		if ( is_wp_error( $answer ) ) {
			$card = Neo_Pulse_Wp_Backend_Assist_Cards::action_card( $final_result, 'workflow' );
		} else {
			$card = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_format( $answer, 'action', true );
			if ( is_wp_error( $card ) ) {
				$card = Neo_Pulse_Wp_Backend_Assist_Cards::action_card( $final_result, 'workflow' );
			}
		}

		$card['type']              = 'workflow';
		$card['workflow']          = true;
		$card['workflow_complete'] = true;
		$card['workflow_id']       = '';
		$card['steps']             = self::workflow_steps_for_card( $workflow['steps'] );
		$card['action_result']     = $final_result;

		if ( $card['workflow_complete'] && ! empty( $final_result['success'] ) ) {
			$card['suggested_actions'] = self::optional_post_workflow_actions( $final_result );
		}

		return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_card( $card, 'workflow', $final_result );
	}
	/**
	 * @param array<int, array<string, mixed>> $history
	 */
	public static function workflow_id_from_history( array $history ): string {
		for ( $i = count( $history ) - 1; $i >= 0; $i-- ) {
			$turn = $history[ $i ];
			if ( ! is_array( $turn ) ) {
				continue;
			}
			$card = isset( $turn['card'] ) && is_array( $turn['card'] ) ? $turn['card'] : array();
			$id   = isset( $card['workflow_id'] ) ? sanitize_text_field( (string) $card['workflow_id'] ) : '';
			if ( $id !== '' ) {
				return $id;
			}
		}
		return '';
	}

	/**
	 * Bind a newly created page onto a saved plan and run remaining steps (compose, save, apply).
	 *
	 * @param array<int, array<string, mixed>> $history
	 * @return array<string, mixed>
	 */
	public static function bind_new_page_and_run( string $workflow_id, int $post_id, string $title, string $keyword, string $message, array $history ): array {
		$workflow = self::load_workflow( $workflow_id );
		if ( ! is_array( $workflow ) ) {
			return array(
				'error' => __( 'Workflow expired or not found. Please send your request again.', 'neo-pulse-wp' ),
			);
		}

		$workflow['last_post_id'] = $post_id;
		$workflow['post_title']   = $title;
		if ( $keyword !== '' ) {
			$workflow['focus_keyword'] = $keyword;
		}
		$steps = isset( $workflow['steps'] ) && is_array( $workflow['steps'] ) ? $workflow['steps'] : array();
		foreach ( $steps as $index => $step ) {
			$tool = sanitize_key( (string) ( $step['tool'] ?? '' ) );
			if ( ! in_array( $tool, array( 'create_page', 'create_post' ), true ) ) {
				continue;
			}
			$workflow['steps'][ $index ]['status'] = 'done';
			$workflow['step_results'][ $index ]    = array(
				'success' => true,
				'post_id' => $post_id,
				'title'   => $title,
				'skipped' => true,
			);
		}
		self::persist_workflow( $workflow_id, $workflow );

		$last = null;
		foreach ( array_keys( $workflow['steps'] ) as $index ) {
			$tool = sanitize_key( (string) ( $workflow['steps'][ $index ]['tool'] ?? '' ) );
			if ( in_array( $tool, array( 'create_page', 'create_post' ), true ) ) {
				continue;
			}
			$last = self::execute_workflow_step( $workflow_id, (int) $index, $message, $history );
			if ( ! empty( $last['error'] ) ) {
				return $last;
			}
			if ( empty( $last['skipped'] ) && empty( $last['result']['success'] ) ) {
				return $last;
			}
			if ( ! empty( $last['workflow_complete'] ) ) {
				return $last;
			}
		}

		return is_array( $last ) ? $last : array(
			'error' => __( 'Build did not finish the page changes.', 'neo-pulse-wp' ),
		);
	}

	public static function optional_post_workflow_actions( array $result ): array {
		$actions = array();
		if ( ! empty( $result['edit_url'] ) ) {
			$actions[] = __( 'Open in editor', 'neo-pulse-wp' );
		}
		$actions[] = __( 'Create another post', 'neo-pulse-wp' );
		return array_slice( $actions, 0, 3 );
	}
}
