<?php
/**
 * Backend Assist — Cursor-style Plan mode preview bodies.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Plan_Preview {

	/** @var array<int, string> */
	private static $strip_param_keys = array(
		'content',
		'content_brief',
		'faq',
		'seoResearch',
		'seo_research',
		'metaDescription',
		'meta_description',
		'seoTitle',
		'seo_title',
		'focusKeyword',
		'focus_keyword',
		'prompt',
	);

	/**
	 * @param array<int, array<string, mixed>> $history
	 * @param array<string, mixed>             $options tool, params, workflow, steps, ops, intent_restatement
	 */
	public static function build_body( string $message, array $history, array $options ): string {
		$context = self::build_context( $message, $history, $options );
		$narrative = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_plan_narrative( $message, $history, $context );
		if ( is_array( $narrative ) && ! empty( $narrative['goal'] ) && ! empty( $narrative['plan_description'] ) ) {
			return self::format_template( $message, $narrative, $context );
		}
		return self::format_fallback_template( $message, $context );
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	public static function sanitize_params_for_preview( array $params ): array {
		$out = array();
		foreach ( $params as $key => $value ) {
			$key_str = is_string( $key ) ? $key : (string) $key;
			if ( in_array( $key_str, self::$strip_param_keys, true ) ) {
				continue;
			}
			if ( is_array( $value ) ) {
				$out[ $key_str ] = self::sanitize_params_for_preview( $value );
				continue;
			}
			if ( is_string( $value ) && strlen( $value ) > 200 ) {
				$out[ $key_str ] = substr( $value, 0, 200 ) . '...';
				continue;
			}
			$out[ $key_str ] = $value;
		}
		return $out;
	}

	/**
	 * @param array<string, mixed> $narrative
	 * @param array<string, mixed> $context
	 */
	public static function format_template( string $message, array $narrative, array $context ): string {
		$goal  = trim( (string) ( $narrative['goal'] ?? '' ) );
		$plan  = trim( (string) ( $narrative['plan_description'] ?? '' ) );
		$tasks = isset( $narrative['tasks'] ) && is_array( $narrative['tasks'] ) ? $narrative['tasks'] : array();
		if ( ! empty( $context['task_labels'] ) && is_array( $context['task_labels'] ) ) {
			$tasks = $context['task_labels'];
		}

		$lines   = array();
		$lines[] = '**' . __( 'Your request', 'neo-pulse-wp' ) . '**';
		$lines[] = '> ' . trim( $message );
		$lines[] = '';
		$lines[] = '**' . __( 'Goal', 'neo-pulse-wp' ) . '**';
		$lines[] = $goal !== '' ? $goal : __( 'Complete the requested backend change on the target post or site.', 'neo-pulse-wp' );
		$lines[] = '';
		$lines[] = '**' . __( 'Plan', 'neo-pulse-wp' ) . '**';
		$lines[] = $plan !== '' ? $plan : __( 'Review the task list, then switch to Build to execute.', 'neo-pulse-wp' );
		$lines[] = '';
		$lines[] = '**' . __( 'Tasks', 'neo-pulse-wp' ) . '**';
		$i       = 1;
		foreach ( $tasks as $task ) {
			$label = trim( (string) $task );
			if ( $label === '' ) {
				continue;
			}
			$lines[] = $i . '. ' . $label;
			++$i;
		}
		if ( $i === 1 ) {
			$lines[] = '1. ' . __( 'Run the classified backend action.', 'neo-pulse-wp' );
		}

		$unchanged = isset( $narrative['unchanged'] ) && is_array( $narrative['unchanged'] ) ? $narrative['unchanged'] : array();
		$unchanged = array_values(
			array_filter(
				array_map(
					static function ( $row ) {
						return trim( (string) $row );
					},
					$unchanged
				)
			)
		);
		if ( ! empty( $unchanged ) ) {
			$lines[] = '';
			$lines[] = '**' . __( 'Unchanged', 'neo-pulse-wp' ) . '**';
			foreach ( $unchanged as $row ) {
				$lines[] = '- ' . $row;
			}
		}

		$lines[] = '';
		$lines[] = '**' . __( 'Approval', 'neo-pulse-wp' ) . '**';
		$lines[] = __( 'Switch to Build to run this plan.', 'neo-pulse-wp' );

		return implode( "\n", $lines );
	}

	/**
	 * @param array<int, array<string, mixed>> $history
	 * @param array<string, mixed>             $options
	 * @return array<string, mixed>
	 */
	public static function build_context( string $message, array $history, array $options ): array {
		$tool   = isset( $options['tool'] ) ? sanitize_key( (string) $options['tool'] ) : '';
		$params = isset( $options['params'] ) && is_array( $options['params'] ) ? $options['params'] : array();
		$params = self::sanitize_params_for_preview( $params );
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;

		$post_context = '';
		if ( $post_id > 0 ) {
			$post_context = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::build_post_context_for_plan( $post_id );
		}

		$task_labels = array();
		if ( ! empty( $options['steps'] ) && is_array( $options['steps'] ) ) {
			foreach ( $options['steps'] as $step ) {
				if ( ! is_array( $step ) ) {
					continue;
				}
				$label = trim( (string) ( $step['label'] ?? '' ) );
				if ( $label !== '' ) {
					$task_labels[] = $label;
				}
			}
		}

		$op_summaries = array();
		if ( ! empty( $options['ops'] ) && is_array( $options['ops'] ) ) {
			if ( class_exists( 'Neo_Pulse_Wp_Backend_Assist_Body_Ops', false ) ) {
				$op_summaries = Neo_Pulse_Wp_Backend_Assist_Body_Ops::describe_ops_for_plan( $options['ops'] );
			}
		}

		$workflow_title = '';
		if ( ! empty( $options['workflow'] ) && is_array( $options['workflow'] ) ) {
			$workflow_title = trim( (string) ( $options['workflow']['title'] ?? '' ) );
			if ( empty( $task_labels ) && ! empty( $options['workflow']['steps'] ) && is_array( $options['workflow']['steps'] ) ) {
				foreach ( $options['workflow']['steps'] as $step ) {
					if ( ! is_array( $step ) ) {
						continue;
					}
					$label = trim( (string) ( $step['label'] ?? '' ) );
					if ( $label !== '' ) {
						$task_labels[] = $label;
					}
				}
			}
		}

		return array(
			'tool'               => $tool,
			'params'             => $params,
			'post_id'            => $post_id,
			'post_context'       => $post_context,
			'task_labels'        => $task_labels,
			'op_summaries'       => $op_summaries,
			'workflow_title'     => $workflow_title,
			'intent_restatement' => trim( (string) ( $options['intent_restatement'] ?? '' ) ),
			'meta_constraints'   => Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::extract_meta_copy_constraints( $message ),
			'meta_fields_requested' => Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::fields_requested_for_meta_write( $message ),
		);
	}

	/**
	 * @param array<string, mixed> $context
	 */
	private static function format_fallback_template( string $message, array $context ): string {
		$tool    = (string) ( $context['tool'] ?? '' );
		$params  = isset( $context['params'] ) && is_array( $context['params'] ) ? $context['params'] : array();
		$post_id = isset( $context['post_id'] ) ? absint( $context['post_id'] ) : 0;

		if ( $tool !== '' && $post_id > 0 ) {
			return Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::format_simple_write_plan_body( $message, $tool, $params );
		}

		$restatement = (string) ( $context['intent_restatement'] ?? '' );
		$goal        = $restatement !== ''
			? $restatement
			: __( 'Complete the requested backend change.', 'neo-pulse-wp' );

		$narrative = array(
			'goal'              => $goal,
			'plan_description'  => sprintf(
				/* translators: %s: tool name */
				__( 'Run `%s` with the resolved parameters. Build mode will generate deliverables; this plan only describes the approach.', 'neo-pulse-wp' ),
				$tool !== '' ? $tool : 'action'
			),
			'tasks'             => $context['task_labels'] ?? array(),
			'unchanged'         => array(),
		);

		return self::format_template( $message, $narrative, $context );
	}
}
