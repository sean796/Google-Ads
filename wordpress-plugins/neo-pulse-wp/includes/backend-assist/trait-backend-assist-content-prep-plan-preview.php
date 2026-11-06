<?php
/**
 * Write plan preview helpers for Backend Assist content preparation.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep_Trait_Plan_Preview {

	/**
	 * @param array<string, mixed> $classification
	 * @return array<string, mixed>
	 */
	public static function resolve_plan_action_params( string $message, array $history, array $classification, bool $preview_only = false ): array {
		if ( Neo_Pulse_Wp_Backend_Assist_Meta_Compound::message_requests_meta_compound( $message ) ) {
			$tool   = 'save_post_meta';
			$params = isset( $classification['params'] ) && is_array( $classification['params'] ) ? $classification['params'] : array();
			$params = self::apply_frontend_page_context( $message, $params, $tool );
			return Neo_Pulse_Wp_Backend_Assist_Meta_Compound::plan_cache_params( $params, $message );
		}

		$tool   = isset( $classification['tool'] ) ? sanitize_key( (string) $classification['tool'] ) : '';
		$tool   = self::resolve_write_tool_for_message( $message, $tool );
		$params = isset( $classification['params'] ) && is_array( $classification['params'] ) ? $classification['params'] : array();
		$params = self::apply_frontend_page_context( $message, $params, $tool );

		if ( $tool === 'save_post_meta' || self::message_requests_date_modifier( $message ) || self::message_clear_meta_field_hub_key( $message ) !== '' ) {
			return self::prepare_save_post_meta_params( $message, $history, $params );
		}

		if ( $tool === 'run_seo_research_brief' || self::message_requests_seo_research_brief( $message ) ) {
			return self::prepare_run_seo_research_brief_params( $message, $history, $params );
		}

		if ( ! $preview_only && empty( $params['post_id'] ) ) {
			$plan   = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_plan( $message, $history, $tool, $params );
			$params = is_array( $plan['params'] ) ? array_merge( $params, $plan['params'] ) : $params;
		}

		return $params;
	}

	/**
	 * Plan preview body for non-body-op write tools.
	 *
	 * @param array<string, mixed> $params
	 */
	public static function format_simple_write_plan_body( string $message, string $tool, array $params ): string {
		if ( self::message_requests_date_modifier( $message ) ) {
			$tool = 'save_post_meta';
		}
		$clear_hub = self::message_clear_meta_field_hub_key( $message );
		if ( $clear_hub !== '' ) {
			$tool = 'save_post_meta';
		}
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		$post    = $post_id > 0 ? get_post( $post_id ) : null;
		$title   = $post instanceof WP_Post ? $post->post_title : '';

		$lines   = array();
		$lines[] = '**' . __( 'Your request', 'neo-pulse-wp' ) . '**';
		$lines[] = '> ' . trim( $message );
		$lines[] = '';
		$lines[] = '**' . __( 'What I understood', 'neo-pulse-wp' ) . '**';
		if ( $tool === 'save_post_meta' && ( self::message_requests_meta_refresh( $message ) || self::message_requests_meta_only_write( $message ) ) ) {
			$lines[] = __( 'Refresh SEO title and meta description on the current post with new copy grounded in the post topic.', 'neo-pulse-wp' );
			$constraints = self::extract_meta_copy_constraints( $message );
			if ( ! empty( $constraints['requires_em_dash'] ) || ! empty( $constraints['min_exclamations'] ) ) {
				$format_parts = array();
				if ( ! empty( $constraints['requires_em_dash'] ) ) {
					$format_parts[] = __( 'em dash (—)', 'neo-pulse-wp' );
				}
				if ( ! empty( $constraints['min_exclamations'] ) ) {
					$format_parts[] = sprintf(
						'%d exclamation marks',
						(int) $constraints['min_exclamations']
					);
				}
				$lines[] = __( 'Formatting:', 'neo-pulse-wp' ) . ' ' . implode( ', ', $format_parts );
			}
		} elseif ( $tool === 'save_post_meta' && self::message_targets_acf_meta_fields( $message ) ) {
			$lines[] = __( 'Write SEO meta (keyword focus + meta description) into the ACF fields on the current post, grounded in that post\'s topic.', 'neo-pulse-wp' );
		} elseif ( $tool === 'save_post_meta' && self::message_requests_date_modifier( $message ) ) {
			$lines[] = __( 'Set the ACF date modifier field on the current post to today.', 'neo-pulse-wp' );
		} elseif ( $tool === 'save_post_meta' && $clear_hub !== '' ) {
			$lines[] = sprintf(
				/* translators: %s: meta field name */
				__( 'Clear the ACF %s field on the current post.', 'neo-pulse-wp' ),
				$clear_hub
			);
		} elseif ( $tool === 'run_seo_research_brief' || self::message_requests_seo_research_brief( $message ) ) {
			$lines[] = __( 'Build SeoContentBriefV1 from DataForSEO SERP, Semrush enrichment, and GSC page queries (when connected), then auto-save to ACF seo_research.', 'neo-pulse-wp' );
			$sources = array( 'DataForSEO SERP' );
			if ( class_exists( 'Neo_Pulse_Wp_Research_Keys', false ) && Neo_Pulse_Wp_Research_Keys::semrush_api_key() !== '' ) {
				$sources[] = 'Semrush';
			}
			if ( class_exists( 'Neo_Pulse_Wp_Gsc_Prompt', false ) && Neo_Pulse_Wp_Gsc_Prompt::is_available() ) {
				$sources[] = 'GSC page queries';
			}
			$lines[] = __( 'Data sources:', 'neo-pulse-wp' ) . ' ' . implode( ', ', $sources );
			if ( $post_id > 0 ) {
				$focus = trim( Neo_Pulse_Wp_Ai_Context::read_focus_keyword( $post_id ) );
				if ( $focus !== '' ) {
					$lines[] = __( 'Focus keyword:', 'neo-pulse-wp' ) . ' `' . esc_html( $focus ) . '`';
				}
				$urls = Neo_Pulse_Wp_Ai_Backend::resolve_urls( $post_id );
				if ( ! empty( $urls['pageUrl'] ) ) {
					$lines[] = __( 'Page URL:', 'neo-pulse-wp' ) . ' `' . esc_html( (string) $urls['pageUrl'] ) . '`';
				}
			}
		} else {
			$lines[] = sprintf(
				/* translators: %s: tool name */
				__( 'Run `%s` on the target post with the parameters below.', 'neo-pulse-wp' ),
				$tool !== '' ? $tool : 'action'
			);
		}
		$lines[] = '';
		$lines[] = '**' . __( 'Tools', 'neo-pulse-wp' ) . '**';
		$lines[] = '- `' . esc_html( $tool !== '' ? $tool : 'action' ) . '`';
		if ( $title !== '' && $post_id > 0 ) {
			$lines[] = '- ' . sprintf(
				/* translators: 1: post title, 2: post ID */
				__( 'Target post: %1$s (ID %2$d)', 'neo-pulse-wp' ),
				$title,
				$post_id
			);
		}
		$param_keys = array( 'mode', 'title', 'metaDescription', 'seoTitle', 'focusKeyword', 'dateModifier', 'slot', 'action' );
		foreach ( $param_keys as $key ) {
			if ( empty( $params[ $key ] ) ) {
				continue;
			}
			$lines[] = '- ' . $key . ': `' . esc_html( (string) $params[ $key ] ) . '`';
		}
		$lines[] = '';
		$lines[] = '**' . __( 'Approval', 'neo-pulse-wp' ) . '**';
		$lines[] = __( 'Switch to Build to run exactly this plan.', 'neo-pulse-wp' );

		return implode( "\n", $lines );
	}

	/**
	 * @return array<string, mixed>|WP_Error
	 */
	public static function build_body_ops_plan_preview( string $message, array $history, array $classification ) {
		$params  = self::resolve_plan_action_params( $message, $history, $classification, true );
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		$tool    = isset( $classification['tool'] ) ? sanitize_key( (string) $classification['tool'] ) : 'add_content';

		if ( $post_id < 1 || ! self::should_use_body_ops( $message, $post_id, $params ) ) {
			return new WP_Error( 'neo-pulse_plan_preview', __( 'Could not plan body ops for this request.', 'neo-pulse-wp' ) );
		}

		$intent = self::classify_body_edit_intent( $message, $post_id, $history );
		if ( is_wp_error( $intent ) ) {
			return $intent;
		}

		$ops = self::build_body_ops_from_intent( $message, $post_id, $intent, $history );
		if ( is_wp_error( $ops ) ) {
			return $ops;
		}

		$ops = self::normalize_body_ops_for_message( $message, $ops );

		$valid = self::validate_body_ops_plan( $message, $post_id, $ops );
		if ( is_wp_error( $valid ) ) {
			return $valid;
		}

		Neo_Pulse_Wp_Backend_Assist_Plan_Cache::save(
			$message,
			$post_id,
			array(
				'tool'        => $tool,
				'intent'      => $intent,
				'ops'         => $ops,
				'restatement' => (string) ( $intent['restatement'] ?? '' ),
			)
		);

		$steps = array(
			array(
				'label'      => sprintf(
					/* translators: %s: tool name */
					__( 'Tool: %s (ops mode)', 'neo-pulse-wp' ),
					$tool !== '' ? $tool : 'add_content'
				),
				'status'     => 'pending',
				'tool'       => $tool,
				'executable' => true,
				'visible'    => true,
			),
		);
		foreach ( Neo_Pulse_Wp_Backend_Assist_Body_Ops::describe_ops_for_plan( $ops ) as $op_line ) {
			$steps[] = array(
				'label'      => $op_line,
				'status'     => 'pending',
				'tool'       => $tool,
				'executable' => true,
				'visible'    => true,
			);
		}

		$body = Neo_Pulse_Wp_Backend_Assist_Plan_Preview::build_body(
			$message,
			$history,
			array(
				'tool'               => $tool,
				'params'             => $params,
				'ops'                => $ops,
				'intent_restatement' => (string) ( $intent['restatement'] ?? '' ),
				'steps'              => $steps,
			)
		);

		return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_plan_card(
			array(
				'type'              => 'plan',
				'workflow'          => false,
				'title'             => __( 'Proposed plan', 'neo-pulse-wp' ),
				'body'              => $body,
				'steps'             => $steps,
				'workflow_complete' => false,
				'links'             => array(),
				'submode_switch'    => 'build',
				'confidence'        => 'high',
				'plan_intent'       => sanitize_key( (string) ( $intent['intent'] ?? '' ) ),
				'planned_tool'      => $tool,
				'planned_ops'       => $ops,
			),
			$post_id,
			$tool,
			$message
		);
	}

	public static function count_same_site_links( string $html ): int {
		if ( $html === '' || ! preg_match( '/<a\s/i', $html ) ) {
			return 0;
		}
		$site_url  = home_url( '/' );
		$base_host = strtolower( (string) wp_parse_url( $site_url, PHP_URL_HOST ) );
		$base_host = preg_replace( '/^www\./', '', $base_host );
		if ( $base_host === '' ) {
			return 0;
		}
		$count = 0;
		if ( preg_match_all( '/<a\s+[^>]*href=(["\'])(.*?)\1/is', $html, $matches ) ) {
			foreach ( $matches[2] as $href ) {
				$href = html_entity_decode( trim( (string) $href ), ENT_QUOTES | ENT_HTML5, 'UTF-8' );
				if ( $href === '' || $href === '#' ) {
					continue;
				}
				if ( ! preg_match( '#^https?://#i', $href ) ) {
					++$count;
					continue;
				}
				$host = strtolower( (string) wp_parse_url( $href, PHP_URL_HOST ) );
				$host = preg_replace( '/^www\./', '', $host );
				if ( $host === $base_host ) {
					++$count;
				}
			}
		}
		return $count;
	}

	public static function strip_ai_html_fences( string $text ): string {
		$text = trim( $text );
		$text = preg_replace( '/^```(?:html)?\s*/i', '', $text );
		$text = preg_replace( '/\s*```$/', '', $text );
		return trim( $text );
	}

	public static function build_post_context_for_plan( int $post_id ): string {
		if ( $post_id < 1 ) {
			return '';
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return '';
		}

		$lines = array(
			'POST CONTEXT (read before finalizing any field on this post):',
			'site: ' . get_bloginfo( 'name' ),
			'post_id: ' . $post_id,
			'post_title: ' . Neo_Pulse_Wp_Display_Text::decode( (string) $post->post_title ),
			'post_status: ' . (string) $post->post_status,
			'slug: ' . (string) $post->post_name,
		);

		if ( class_exists( 'Neo_Pulse_Wp_Ai_Context' ) ) {
			$meta = Neo_Pulse_Wp_Ai_Context::meta_hub_values( $post_id );
			if ( ! empty( $meta['focusKeyword'] ) ) {
				$lines[] = 'focus_keyword: ' . sanitize_text_field( (string) $meta['focusKeyword'] );
			}
			if ( ! empty( $meta['seoTitle'] ) ) {
				$lines[] = 'seo_title: ' . sanitize_text_field( (string) $meta['seoTitle'] );
			}
			if ( ! empty( $meta['metaDescription'] ) ) {
				$lines[] = 'meta_description: ' . sanitize_textarea_field( wp_trim_words( (string) $meta['metaDescription'], 40, '...' ) );
			}
		}

		$body = trim( wp_strip_all_tags( $post->post_content ) );
		if ( $body !== '' ) {
			if ( strlen( $body ) > 2000 ) {
				$body = substr( $body, 0, 2000 ) . '...';
			}
			$lines[] = 'body_excerpt: ' . $body;
		}

		return implode( "\n", $lines ) . "\n";
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function apply_frontend_page_context( string $message, array $params, string $tool = '' ): array {
		if ( self::message_requests_new_page_or_post( $message ) ) {
			return $params;
		}
		if ( ! empty( $params['post_id'] ) || ! empty( $params['title'] ) ) {
			return $params;
		}

		$ctx = Neo_Pulse_Wp_Backend_Assist_Context::$builder_context;
		if ( is_array( $ctx ) && isset( $ctx['target_scope'] ) && sanitize_key( (string) $ctx['target_scope'] ) === 'site' ) {
			return $params;
		}

		$post_id = self::resolve_frontend_post_id();
		if ( $post_id < 1 || ! current_user_can( 'edit_post', $post_id ) ) {
			return $params;
		}

		if ( self::message_names_explicit_post_id( $message, $post_id ) ) {
			return $params;
		}

		$deictic = Neo_Pulse_Wp_Chat_Page_Context::message_targets_current_page( $message );
		$implicit = $tool !== '' && self::tool_defaults_to_builder_post( $tool );
		$contextual = $implicit || $deictic || self::message_implies_current_page_edit( $message );
		if ( ! $contextual ) {
			return $params;
		}

		$params['post_id'] = $post_id;
		$ctx               = Neo_Pulse_Wp_Backend_Assist_Context::$builder_context;
		if ( is_array( $ctx ) && ! empty( $ctx['frontend_page']['title'] ) ) {
			$params['title'] = sanitize_text_field( (string) $ctx['frontend_page']['title'] );
		}

		return $params;
	}

	public static function resolve_frontend_post_id(): int {
		$ctx = Neo_Pulse_Wp_Backend_Assist_Context::$builder_context;
		if ( ! is_array( $ctx ) || empty( $ctx['frontend_page'] ) || ! is_array( $ctx['frontend_page'] ) ) {
			return 0;
		}
		return absint( $ctx['frontend_page']['post_id'] ?? 0 );
	}

	/**
	 * @param array<int, array<string, mixed>> $history
	 */
	public static function build_planner_history_block( array $history, int $limit = 6 ): string {
		$recent = array_slice( $history, -$limit );
		if ( $recent === array() ) {
			return '';
		}
		$lines = array( 'CONVERSATION HISTORY (recent turns inform follow-up edit targets):' );
		foreach ( $recent as $entry ) {
			$content = trim( (string) ( $entry['content'] ?? '' ) );
			if ( $content === '' ) {
				continue;
			}
			$role  = sanitize_key( (string) ( $entry['role'] ?? 'user' ) );
			$label = $role === 'assistant' ? 'Assistant' : 'User';
			$lines[] = "{$label}: {$content}";
		}
		if ( count( $lines ) === 1 ) {
			return '';
		}
		return implode( "\n", $lines ) . "\n\n";
	}
}
