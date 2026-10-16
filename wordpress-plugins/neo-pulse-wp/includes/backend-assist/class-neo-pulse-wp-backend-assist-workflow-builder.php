<?php
/**
 * Backend Assist — workflow step list construction from decomposed plans
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Workflow_Builder {

	public static function expand_create_to_full_page( array $decomposed, string $message, array $classification = array() ): array {
		return Neo_Pulse_Wp_Backend_Assist_Workflow_Expand::expand_create_to_full_page( $decomposed, $message, $classification );
	}

	public static function build_workflow_steps( string $message, array $history, array $decomposed ): array {
		$steps                 = array();
		$outline               = array();
		$focus_keyword         = '';
		$post_title            = '';
		$needs_internal_links  = false;
		$expand_ctx    = array(
			'message'       => $message,
			'content_brief' => '',
		);

		$raw_steps = isset( $decomposed['steps'] ) && is_array( $decomposed['steps'] ) ? $decomposed['steps'] : array();

		foreach ( $raw_steps as $step ) {
			if ( ! is_array( $step ) ) {
				continue;
			}
			$step_kind = sanitize_key( (string) ( $step['step_kind'] ?? '' ) );
			if ( $step_kind === 'heading' ) {
				$steps[] = array(
					'tool'       => '',
					'label'      => isset( $step['label'] ) ? sanitize_text_field( (string) $step['label'] ) : '',
					'params'     => isset( $step['params'] ) && is_array( $step['params'] ) ? $step['params'] : array(),
					'status'     => 'pending',
					'result'     => null,
					'executable' => false,
					'step_kind'  => 'heading',
					'visible'    => true,
				);
				continue;
			}
			if ( empty( $step['tool'] ) ) {
				continue;
			}
			$tool   = sanitize_key( $step['tool'] );
			$params = isset( $step['params'] ) && is_array( $step['params'] ) ? $step['params'] : array();

			if ( in_array( $tool, array( 'create_post', 'create_page' ), true ) ) {
				if ( ! empty( $params['focus_keyword'] ) ) {
					$focus_keyword = sanitize_text_field( $params['focus_keyword'] );
				}
				if ( ! empty( $params['title'] ) ) {
					$post_title = sanitize_text_field( $params['title'] );
				}
			}

			if ( $tool === 'add_content' && self::should_expand_workflow_sections( $step, $message ) ) {
				if ( ! empty( $params['content_brief'] ) ) {
					$expand_ctx['content_brief'] = (string) $params['content_brief'];
				}
				$expand_ctx['focus_keyword'] = $focus_keyword;
				$expand_ctx['post_title']    = $post_title;
				continue;
			}

			if ( ! Neo_Pulse_Wp_Backend_Assist_Workflow::is_registered_executable_tool( $tool ) ) {
				continue;
			}

			$steps[] = array(
				'tool'       => $tool,
				'label'      => isset( $step['label'] ) ? sanitize_text_field( $step['label'] ) : str_replace( '_', ' ', $tool ),
				'params'     => $params,
				'status'     => 'pending',
				'result'     => null,
				'executable' => true,
			);
		}

		$needs_expand = false;
		foreach ( $raw_steps as $step ) {
			if ( is_array( $step ) && isset( $step['tool'] ) && sanitize_key( $step['tool'] ) === 'add_content' ) {
				if ( self::should_expand_workflow_sections( $step, $message ) ) {
					$needs_expand = true;
					break;
				}
			}
		}

		if ( $needs_expand ) {
			$outline = array();
			$planned = Neo_Pulse_Wp_Backend_Assist_Content::phase_plan_content_outline( $message, $expand_ctx, $history );
			if ( ! is_wp_error( $planned ) && ! empty( $planned['sections'] ) && is_array( $planned['sections'] ) ) {
				$outline = Neo_Pulse_Wp_Backend_Assist_Content::normalize_outline_sections( $planned['sections'] );

				if ( count( $outline ) < 1 ) {
					$planned = new WP_Error( 'neo-pulse_outline_empty', '' );
				}
			}

			if ( ! is_wp_error( $planned ) && ! empty( $outline ) ) {
				$steps[] = array(
					'tool'       => 'plan_outline',
					'label'      => __( 'Plan harness sections', 'neo-pulse-wp' ),
					'params'     => array(),
					'status'     => 'done',
					'result'     => null,
					'executable' => false,
					'step_kind'  => 'plan',
				);

				$needs_internal_links = self::workflow_needs_internal_links( $message, $outline );

				if ( $needs_internal_links ) {
					$steps[] = array(
						'tool'       => 'resolve_internal_links',
						'label'      => __( 'Find internal links from post library', 'neo-pulse-wp' ),
						'params'     => array(),
						'status'     => 'pending',
						'result'     => null,
						'executable' => true,
						'visible'    => true,
					);
				}

				foreach ( $outline as $idx => $section ) {
					$steps[] = array(
						'tool'           => 'micro_section',
						'label'          => isset( $section['label'] ) ? sanitize_text_field( $section['label'] ) : '',
						'params'         => array( 'section_index' => $idx, 'section' => $section ),
						'status'         => 'pending',
						'result'         => null,
						'executable'     => false,
						'step_kind'      => 'micro',
						'section_index'  => $idx,
					);
				}

				$steps[] = array(
					'tool'       => 'write_sections_batch',
					'label'      => __( 'Write all content sections', 'neo-pulse-wp' ),
					'params'     => array(),
					'status'     => 'pending',
					'result'     => null,
					'executable' => true,
					'step_kind'  => 'internal',
					'visible'    => false,
				);
			} else {
				foreach ( $raw_steps as $step ) {
					if ( ! is_array( $step ) || sanitize_key( $step['tool'] ?? '' ) !== 'add_content' ) {
						continue;
					}
					$steps[] = array(
						'tool'       => 'add_content',
						'label'      => isset( $step['label'] ) ? sanitize_text_field( $step['label'] ) : __( 'Add content', 'neo-pulse-wp' ),
						'params'     => isset( $step['params'] ) && is_array( $step['params'] ) ? $step['params'] : array(),
						'status'     => 'pending',
						'result'     => null,
						'executable' => true,
					);
					break;
				}
			}
		}

		return array(
			'steps'                => $steps,
			'outline'              => $outline,
			'focus_keyword'        => $focus_keyword,
			'post_title'           => $post_title,
			'needs_internal_links' => $needs_internal_links,
		);
	}
	public static function workflow_needs_internal_links( string $message, array $outline ): bool {
		$hay = strtolower( $message );
		if ( preg_match( '/\b(internal\s+link|link\s+to|related\s+post|cross[\s-]?link|linkable)\b/i', $hay ) ) {
			return true;
		}
		if ( preg_match( '/\b(link|links)\b/i', $hay ) && preg_match( '/\b(post|page|article|site)\b/i', $hay ) ) {
			return true;
		}
		foreach ( $outline as $section ) {
			if ( ! is_array( $section ) || empty( $section['features'] ) || ! is_array( $section['features'] ) ) {
				continue;
			}
			foreach ( $section['features'] as $f ) {
				if ( ! is_string( $f ) ) {
					continue;
				}
				$upper = strtoupper( trim( $f ) );
				if ( strpos( $upper, 'LINK' ) !== false && strpos( $upper, 'TABLE' ) === false ) {
					return true;
				}
			}
		}
		return false;
	}
	public static function build_link_grep_query( string $message, array $outline, string $focus_keyword, string $post_title ): string {
		$parts = array( $message, $focus_keyword, $post_title );
		foreach ( $outline as $section ) {
			if ( ! is_array( $section ) ) {
				continue;
			}
			if ( ! empty( $section['title'] ) ) {
				$parts[] = (string) $section['title'];
			}
			if ( ! empty( $section['brief'] ) ) {
				$parts[] = (string) $section['brief'];
			}
		}
		return trim( implode( ' ', array_filter( $parts ) ) );
	}
	public static function should_expand_workflow_sections( array $add_step, string $message ): bool {
		if ( ! empty( $add_step['params']['expand_sections'] ) ) {
			return true;
		}
		$brief = isset( $add_step['params']['content_brief'] ) ? (string) $add_step['params']['content_brief'] : '';
		$hay   = strtolower( $message . ' ' . $brief );
		if ( preg_match( '/\b(h2|h3|heading|section|table|list|faq|paragraph)\b/i', $hay ) ) {
			return true;
		}
		if ( preg_match( '/\b\d+\s*h2/i', $hay ) ) {
			return true;
		}
		return false;
	}
}
