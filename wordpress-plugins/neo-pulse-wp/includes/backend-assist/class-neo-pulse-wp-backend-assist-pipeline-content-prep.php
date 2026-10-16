<?php
/**
 * Backend Assist — tool param preparation and post body generation
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep {

	public static function prepare_tool_params( string $message, array $history, string $tool, array $params, ?array $workflow = null ): array {
		if ( in_array( $tool, array( 'create_page', 'create_post' ), true ) ) {
			$topic = self::create_page_title_from_message( $message );
			if ( empty( $params['title'] ) ) {
				$params['title'] = $topic['title'];
			}
			if ( empty( $params['focus_keyword'] ) && $topic['keyword'] !== '' ) {
				$params['focus_keyword'] = $topic['keyword'];
			}
			return array(
				'tool'   => $tool,
				'params' => $params,
			);
		}

		if ( $tool === 'design_page_with_novamira' && self::message_requests_new_page_or_post( $message ) ) {
			$pid = 0;
			if ( is_array( $workflow ) && ! empty( $workflow['last_post_id'] ) ) {
				$pid = (int) $workflow['last_post_id'];
			}
			if ( $pid > 0 ) {
				$params['post_id'] = $pid;
			} else {
				unset( $params['post_id'] );
			}
			$params['content_mode'] = 'elementor_widgets';
			if ( is_array( $workflow ) && ! empty( $workflow['last_elementor_sections'] ) && is_array( $workflow['last_elementor_sections'] ) ) {
				$params['elementor_sections'] = $workflow['last_elementor_sections'];
			}
			unset( $params['block_ids'], $params['block_id'] );
			return array(
				'tool'   => 'design_page_with_novamira',
				'params' => $params,
			);
		}

		if ( $tool === 'add_content' && self::message_is_undo_or_correction( $message ) ) {
			$tool = 'restore_post_revision';
		}

		if ( self::message_requests_date_modifier( $message ) ) {
			$params = self::apply_frontend_page_context( $message, $params, 'save_post_meta' );
			$params = self::prepare_save_post_meta_params( $message, $history, $params );
			return array(
				'tool'   => 'save_post_meta',
				'params' => $params,
			);
		}

		if ( self::message_clear_meta_field_hub_key( $message ) !== '' ) {
			$params = self::apply_frontend_page_context( $message, $params, 'save_post_meta' );
			$params = self::prepare_save_post_meta_params( $message, $history, $params );
			return array(
				'tool'   => 'save_post_meta',
				'params' => $params,
			);
		}

		if ( self::message_requests_seo_research_brief( $message ) ) {
			$params = self::apply_frontend_page_context( $message, $params, 'run_seo_research_brief' );
			$params = self::prepare_run_seo_research_brief_params( $message, $history, $params );
			return array(
				'tool'   => 'run_seo_research_brief',
				'params' => $params,
			);
		}

		if ( self::message_requests_meta_only_write( $message ) ) {
			if ( Neo_Pulse_Wp_Backend_Assist_Meta_Compound::message_requests_meta_compound( $message ) ) {
				$params = self::apply_frontend_page_context( $message, $params, 'save_post_meta' );
				return array(
					'tool'   => 'save_post_meta',
					'params' => Neo_Pulse_Wp_Backend_Assist_Meta_Compound::plan_cache_params( $params, $message ),
				);
			}
			$params = self::apply_frontend_page_context( $message, $params, 'save_post_meta' );
			$params = self::prepare_save_post_meta_params( $message, $history, $params );
			return array(
				'tool'   => 'save_post_meta',
				'params' => $params,
			);
		}

		if (
			$tool === 'add_content'
			&& self::message_requests_faq_schema( $message )
			&& ! self::message_requests_faq_table( $message )
			&& ! self::message_requests_body_schema_cleanup( $message )
		) {
			$params = self::apply_frontend_page_context( $message, $params, 'save_post_meta' );
			$params = self::prepare_save_post_meta_params( $message, $history, $params );
			return array(
				'tool'   => 'save_post_meta',
				'params' => $params,
			);
		}

		$params = self::apply_frontend_page_context( $message, $params, $tool );

		if ( $tool === 'update_post' ) {
			$params = self::prepare_update_post_params( $message, $history, $params );
			return array(
				'tool'   => 'update_post',
				'params' => $params,
			);
		}

		if ( $tool === 'restore_post_revision' ) {
			$params = self::prepare_restore_post_revision_params( $message, $history, $params );
			return array(
				'tool'   => 'restore_post_revision',
				'params' => $params,
			);
		}

		if ( $tool === 'save_post_meta' ) {
			$params = self::prepare_save_post_meta_params( $message, $history, $params );
			return array(
				'tool'   => 'save_post_meta',
				'params' => $params,
			);
		}

		if ( $tool === 'run_seo_research_brief' ) {
			$params = self::prepare_run_seo_research_brief_params( $message, $history, $params );
			return array(
				'tool'   => 'run_seo_research_brief',
				'params' => $params,
			);
		}

		if ( in_array( $tool, Neo_Pulse_Wp_Backend_Assist_Submode::READ_ONLY_TOOLS, true ) ) {
			return array(
				'tool'   => $tool,
				'params' => $params,
			);
		}

		if ( $tool === 'add_content' ) {
			if ( self::message_is_field_instruction( $message ) ) {
				return array(
					'tool'   => 'restore_post_revision',
					'params' => self::prepare_restore_post_revision_params( $message, $history, $params ),
				);
			}

			if ( self::message_requests_faq_table_from_existing_meta( $message ) ) {
				$post_id = absint( $params['post_id'] ?? 0 );
				if ( $post_id < 1 ) {
					$post_id = self::resolve_frontend_post_id();
				}
				if ( $post_id > 0 ) {
					$table = self::faq_table_html_from_post_meta( $post_id );
					if ( $table !== '' ) {
						return array(
							'tool'   => 'add_content',
							'params' => array(
								'post_id' => $post_id,
								'mode'    => 'append',
								'content' => $table,
							),
						);
					}
				}
			}

			$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;

			if ( self::should_use_body_ops( $message, $post_id, $params ) ) {
				$prepared = self::prepare_body_ops_params( $message, $history, $params );
				if ( is_wp_error( $prepared ) ) {
					return array(
						'tool'   => 'add_content',
						'params' => array(
							'post_id'    => $post_id,
							'_prep_error' => $prepared->get_error_message(),
						),
					);
				}
				return array(
					'tool'   => 'add_content',
					'params' => $prepared,
				);
			}

			if ( self::message_requests_faq_table( $message ) && empty( $params['mode'] ) ) {
				$params['mode'] = 'append';
			}

			if ( empty( $params['mode'] ) ) {
				$params['mode'] = 'replace';
			}

			$needs_resolve = empty( $params['post_id'] ) && empty( $params['title'] );
			if ( $needs_resolve ) {
				$plan   = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_plan( $message, $history, $tool, $params );
				$tool   = $plan['tool'];
				$params = is_array( $plan['params'] ) ? $plan['params'] : $params;
			}

			$content = isset( $params['content'] ) ? trim( (string) $params['content'] ) : '';
			if ( $content !== '' && self::content_looks_like_user_instruction( $content, $message ) ) {
				$content = '';
				unset( $params['content'] );
			}
			if ( $content === '' ) {
				$generated = self::generate_post_body_html( $message, $history, $params, $workflow );
				if ( ! is_wp_error( $generated ) && $generated !== '' ) {
					$params['content'] = $generated;
				} elseif ( is_wp_error( $generated ) && $content === '' ) {
					$plan      = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_plan( $message, $history, $tool, $params );
					$params    = is_array( $plan['params'] ) ? array_merge( $params, $plan['params'] ) : $params;
					$generated = self::generate_post_body_html( $message, $history, $params, $workflow );
					if ( ! is_wp_error( $generated ) && $generated !== '' ) {
						$params['content'] = $generated;
					}
				}
			}

			if ( empty( $params['mode'] ) ) {
				$params['mode'] = 'replace';
			}

			return array(
				'tool'   => $tool,
				'params' => $params,
			);
		}

		if ( $tool !== 'add_content' ) {
			$plan = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_plan( $message, $history, $tool, $params );
			return array(
				'tool'   => $plan['tool'],
				'params' => $plan['params'],
			);
		}

		return array(
			'tool'   => $tool,
			'params' => $params,
		);
	}
	public static function generate_post_body_html( string $message, array $history, array $params, ?array $workflow = null ) {
		$site_name = get_bloginfo( 'name' );
		$site_url  = home_url( '/' );

		$fk = '';
		if ( ! empty( $params['focus_keyword'] ) ) {
			$fk = sanitize_text_field( $params['focus_keyword'] );
		}
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		if ( $fk === '' && $post_id > 0 ) {
			$fk = get_post_meta( $post_id, '_neo_pulse_focus_keyword', true );
		}

		$post_title = isset( $params['title'] ) ? sanitize_text_field( $params['title'] ) : '';
		if ( $post_title === '' && $post_id > 0 ) {
			$post = get_post( $post_id );
			if ( $post ) {
				$post_title = $post->post_title;
			}
		}

		$user_request = ( null !== $workflow && ! empty( $workflow['message'] ) )
			? $workflow['message']
			: $message;

		$brief_parts = array();
		if ( ! empty( $params['content_brief'] ) ) {
			$brief_parts[] = (string) $params['content_brief'];
		}
		if ( ! empty( $params['instructions'] ) ) {
			$brief_parts[] = (string) $params['instructions'];
		}
		$brief = implode( "\n", $brief_parts );
		if ( $brief === '' && ! self::message_is_field_instruction( $user_request ) ) {
			$brief = $user_request;
		}
		if ( $brief === '' || self::message_is_field_instruction( $brief ) ) {
			return new WP_Error( 'neo-pulse_backend_instruction', __( 'This message is a field correction, not body content to generate.', 'neo-pulse-wp' ) );
		}

		$system = <<<PROMPT
You are an expert SEO content writer for WordPress on "{$site_name}" ({$site_url}).
Write the COMPLETE post body the user asked for — publish-ready semantic HTML only.

OUTPUT RULES (non-negotiable):
- Return ONLY HTML. No markdown code fences. No JSON. No explanations before or after.
- Use <h2>, <h3>, <p>, <ul>/<li>, and <table> (with <thead>/<tbody>/<tr>/<th>/<td>) as appropriate.
- Fulfill EVERY structural requirement in the brief (exact H2 counts, lists under sections, tables, etc.).
- Write real, useful copy (2–4 sentences per section minimum) optimized for the focus keyword.
- Do not leave placeholders like "[insert content]" or "Lorem ipsum".
- Never include <script type="application/ld+json">, raw JSON-LD, or FAQPage objects. FAQ schema belongs in the ACF faq field only, not post body HTML.
PROMPT;

		$user = "USER REQUEST:\n{$user_request}\n\n";
		if ( $post_id > 0 ) {
			$post_context = self::build_post_context_for_plan( $post_id );
			if ( $post_context !== '' ) {
				$user .= $post_context . "\n";
			}
		}
		if ( $post_title !== '' ) {
			$user .= "POST TITLE: {$post_title}\n";
		}
		if ( $fk !== '' ) {
			$user .= "FOCUS KEYWORD: {$fk}\n";
		}
		$gsc_block = '';
		if ( $post_id > 0 ) {
			$gsc_block = Neo_Pulse_Wp_Gsc_Prompt::for_post( $post_id, $fk );
		}
		if ( $gsc_block !== '' ) {
			$user .= "\n{$gsc_block}\n";
		}
		if ( $brief !== $user_request ) {
			$user .= "\nCONTENT BRIEF:\n{$brief}\n";
		}

		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter( Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL, $system, $user, 8192, 0.55 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$html = self::strip_ai_html_fences( $result );
		if ( $html === '' ) {
			return new WP_Error( 'neo-pulse_backend_empty_html', __( 'Content generation returned empty HTML.', 'neo-pulse-wp' ) );
		}

		return self::strip_json_ld_from_html( $html );
	}

	/**
	 * In-place edit of existing post HTML (links, wording, formatting).
	 *
	 * @param array<string, mixed> $params
	 * @return string|WP_Error
	 */
	public static function generate_post_body_edit( string $message, array $history, array $params ) {
		unset( $history );

		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_backend_edit_post', __( 'post_id is required for body edits.', 'neo-pulse-wp' ) );
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'neo-pulse_backend_edit_post', __( 'Post not found.', 'neo-pulse-wp' ) );
		}

		$existing_html = trim( (string) $post->post_content );
		if ( $existing_html === '' ) {
			return new WP_Error( 'neo-pulse_backend_edit_post', __( 'Post body is empty; use add_content to generate new sections first.', 'neo-pulse-wp' ) );
		}

		$site_name = get_bloginfo( 'name' );
		$site_url  = home_url( '/' );

		$fk = '';
		if ( ! empty( $params['focus_keyword'] ) ) {
			$fk = sanitize_text_field( $params['focus_keyword'] );
		}
		if ( $fk === '' ) {
			$fk = get_post_meta( $post_id, '_neo_pulse_focus_keyword', true );
		}

		$post_title = Neo_Pulse_Wp_Display_Text::decode( (string) $post->post_title );
		$needs_links = self::message_requests_internal_links( $message )
			|| ! empty( $params['link_count'] );
		$link_count  = ! empty( $params['link_count'] ) ? absint( $params['link_count'] ) : self::parse_link_count_from_message( $message );
		if ( $needs_links && $link_count < 1 ) {
			$link_count = 20;
		}
		if ( $link_count > 30 ) {
			$link_count = 30;
		}

		$link_block    = '';
		$allowed_urls  = array();
		if ( $needs_links ) {
			if ( ! class_exists( 'Neo_Pulse_Wp_Harness_Blueprint' ) ) {
				require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/harness/class-neo-pulse-wp-harness-blueprint.php';
			}
			if ( ! class_exists( 'Neo_Pulse_Wp_Harness_Links' ) ) {
				require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/harness/class-neo-pulse-wp-harness-links.php';
			}
			$all_posts = Neo_Pulse_Wp_Harness_Blueprint::fetch_linkable_posts();
			$query     = Neo_Pulse_Wp_Backend_Assist_Workflow_Builder::build_link_grep_query( $message, array(), $fk, $post_title );
			$matched   = Neo_Pulse_Wp_Harness_Links::grep_linkable_posts( $all_posts, $query, max( $link_count, 25 ), $post_id );
			$allowed_urls = Neo_Pulse_Wp_Harness_Links::allowed_url_set( $matched, $site_url );
			$lines        = array();
			foreach ( array_slice( $matched, 0, max( $link_count, 25 ) ) as $i => $lp ) {
				$title = isset( $lp['title'] ) ? (string) $lp['title'] : '';
				$url   = isset( $lp['link'] ) ? (string) $lp['link'] : '';
				if ( $url === '' ) {
					continue;
				}
				$lines[] = ( $i + 1 ) . '. ' . $title . ' → ' . $url;
			}
			if ( ! empty( $lines ) ) {
				$link_block = "ALLOWED INTERNAL LINK TARGETS (use ONLY these URLs, up to {$link_count} new links):\n"
					. implode( "\n", $lines ) . "\n";
			}
		}

		$surgical_note = '';
		if ( self::message_requests_surgical_body_edit( $message, $post_id ) ) {
			$surgical_note = "\n- SURGICAL DELETE/REMOVE: Do NOT rewrite retained sections. Removed HTML must be gone verbatim. Kept sections must remain identical except whitespace. Never convert a table FAQ block into prose FAQ.\n";
		}

		$system = <<<PROMPT
You are an expert WordPress content editor for "{$site_name}" ({$site_url}).
Edit the EXISTING post body HTML in place according to the user's brief.

OUTPUT RULES (non-negotiable):
- Return ONLY the complete updated HTML for the full post body. No markdown fences. No JSON. No commentary.
- Preserve existing structure (headings, sections, order) unless the user asks to add new sections.
- Apply edits in place: internal links, new phrases, <strong>/<em>, lists, rewording, emphasis.
- Never paste the user's instruction text verbatim into visible copy.
- Never invent URLs. For internal links use ONLY URLs from the allowlist when provided.
- Wrap natural existing phrases with <a href="..."> for internal links; do not add a separate related-links section unless asked.
- Never include <script type="application/ld+json">, raw JSON-LD, or FAQPage objects in HTML. FAQ schema belongs in the ACF faq field only.{$surgical_note}
PROMPT;

		$user = "EDIT BRIEF:\n{$message}\n\n";
		$user .= self::build_post_context_for_plan( $post_id );
		if ( $fk !== '' ) {
			$user .= "FOCUS KEYWORD: {$fk}\n";
		}
		if ( $link_block !== '' ) {
			$user .= "\n{$link_block}\n";
		}
		$user .= "\nEXISTING POST BODY HTML (edit this in place):\n{$existing_html}\n";

		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter( Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL, $system, $user, 16384, 0.45 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$html = self::strip_ai_html_fences( $result );
		if ( $html === '' ) {
			return new WP_Error( 'neo-pulse_backend_empty_html', __( 'Body edit returned empty HTML.', 'neo-pulse-wp' ) );
		}

		if ( $needs_links && ! empty( $allowed_urls ) ) {
			$html = Neo_Pulse_Wp_Harness_Links::strip_unknown_internal_links( $html, $allowed_urls, $site_url );
		}

		return self::strip_json_ld_from_html( $html );
	}

	public static function message_requests_faq_schema( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		if ( preg_match( '/\bfaq\s+schema\b/i', $message ) ) {
			return true;
		}
		if ( preg_match( '/\b(json-ld|json ld|structured data)\b/i', $message ) && preg_match( '/\bfaq\b/i', $message ) ) {
			return true;
		}
		if ( preg_match( '/\badd\s+schema\b/i', $message ) && preg_match( '/\bfaq\b/i', $message ) ) {
			return true;
		}
		if ( preg_match( '/\bschema\b/i', $message ) && preg_match( '/\bfaq\b/i', $message ) ) {
			return true;
		}
		return false;
	}

	public static function message_requests_faq_table( string $message ): bool {
		if ( preg_match( '/\bfaq\s+table\b/i', $message ) ) {
			return true;
		}
		if ( preg_match( '/\btable\b/i', $message ) && preg_match( '/\bfaq\b/i', $message ) ) {
			return true;
		}
		if ( preg_match( '/\bappend\b/i', $message ) && preg_match( '/\btable\b/i', $message ) && preg_match( '/\bfaq\b/i', $message ) ) {
			return true;
		}
		return false;
	}

	public static function message_requests_faq_compound( string $message ): bool {
		return self::message_requests_faq_schema( $message ) && self::message_requests_faq_table( $message );
	}

	public static function message_requests_faq_table_from_existing_meta( string $message ): bool {
		if ( ! self::message_requests_faq_table( $message ) ) {
			return false;
		}
		return (bool) preg_match( '/schema in the (back|backend)|from the schema|existing schema|in the back/i', $message );
	}

	public static function message_requests_faq_table_append( string $message ): bool {
		if ( ! self::message_requests_faq_table( $message ) ) {
			return false;
		}
		if ( self::message_requests_faq_table_from_existing_meta( $message ) ) {
			return true;
		}
		return (bool) preg_match( '/\bat the end\b|\bappend\b/i', $message );
	}

	public static function resolve_effective_post_id( array $params = array(), string $message = '' ): int {
		if ( $message !== '' && self::message_requests_new_page_or_post( $message ) ) {
			return 0;
		}

		if ( ! empty( $params['post_id'] ) ) {
			$post_id = absint( $params['post_id'] );
			if ( $post_id > 0 ) {
				return $post_id;
			}
		}

		$ctx = Neo_Pulse_Wp_Backend_Assist_Context::$builder_context;
		if ( is_array( $ctx ) && isset( $ctx['target_scope'] ) && sanitize_key( (string) $ctx['target_scope'] ) === 'site' ) {
			return 0;
		}

		$from_ctx = self::resolve_frontend_post_id();
		if ( $from_ctx > 0 ) {
			return $from_ctx;
		}

		$ctx = Neo_Pulse_Wp_Backend_Assist_Context::$builder_context;
		if ( is_array( $ctx ) && ! empty( $ctx['frontend_page']['url'] ) ) {
			if ( ! class_exists( 'Neo_Pulse_Wp_Chat_Page_Context' ) ) {
				require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-page-context.php';
			}
			$url = (string) $ctx['frontend_page']['url'];
			$from_url = Neo_Pulse_Wp_Chat_Page_Context::post_id_from_url( $url );
			if ( $from_url > 0 ) {
				return $from_url;
			}
			if ( class_exists( 'Neo_Pulse_Wp_Chat' ) && ! empty( $ctx['frontend_page']['title'] ) ) {
				$settings   = Neo_Pulse_Wp_Chat::get_settings();
				$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
				$resolved   = Neo_Pulse_Wp_Chat_Page_Context::resolve_post_id(
					$url,
					0,
					$site_index,
					(string) $ctx['frontend_page']['title']
				);
				if ( $resolved > 0 ) {
					return $resolved;
				}
			}
		}

		return 0;
	}

	public static function resolve_write_tool_for_message( string $message, string $tool ): string {
		$tool = sanitize_key( $tool );

		if ( self::message_requests_new_page_or_post( $message ) ) {
			if ( in_array( $tool, array( 'create_page', 'create_post' ), true ) ) {
				return $tool;
			}
			return 'create_page';
		}

		if ( self::message_requests_date_modifier( $message ) || self::message_clear_meta_field_hub_key( $message ) !== '' ) {
			return 'save_post_meta';
		}
		if ( self::message_requests_seo_research_brief( $message ) ) {
			return 'run_seo_research_brief';
		}
		if ( self::message_requests_meta_only_write( $message ) ) {
			return 'save_post_meta';
		}

		return $tool;
	}

	public static function message_requests_meta_only_write( string $message ): bool {
		if ( self::message_requests_new_page_or_post( $message ) ) {
			return false;
		}
		if ( self::message_implies_body_content_edit( $message ) ) {
			return false;
		}
		return self::message_requests_meta_refresh( $message )
			|| self::message_requests_meta_description( $message )
			|| self::message_requests_focus_keyword( $message )
			|| self::message_targets_acf_meta_fields( $message );
	}

	private static function message_implies_body_content_edit( string $message ): bool {
		return (bool) preg_match(
			'/\b(intro|section|h2|h3|heading|paragraph|post body|body copy|internal links?|bold|table|faq table|append|rewrite the)\b/i',
			$message
		);
	}

	/**
	 * Build mode: execute obvious post-context writes when classifier would ask for the post again.
	 *
	 * @param array<int, array<string, mixed>> $history
	 * @return array<string, mixed>|null
	 */
	public static function try_execute_contextual_write( string $message, array $history ): ?array {
		if ( self::message_requests_new_page_or_post( $message ) || self::history_requests_new_page_or_post( $history ) ) {
			return null;
		}

		$post_id = self::resolve_effective_post_id( array(), $message );
		if ( $post_id < 1 ) {
			return null;
		}

		$tool = '';
		if ( Neo_Pulse_Wp_Backend_Assist_Meta_Compound::message_requests_meta_compound( $message ) ) {
			return Neo_Pulse_Wp_Backend_Assist_Meta_Compound::run(
				$message,
				$history,
				array( 'post_id' => $post_id )
			);
		}
		if ( self::message_requests_meta_only_write( $message ) ) {
			$tool = 'save_post_meta';
		} elseif ( self::message_requests_seo_research_brief( $message ) ) {
			$tool = 'run_seo_research_brief';
		} elseif ( self::message_requests_date_modifier( $message ) || self::message_clear_meta_field_hub_key( $message ) !== '' ) {
			$tool = 'save_post_meta';
		}

		if ( $tool === '' ) {
			return null;
		}

		$params = self::apply_frontend_page_context( $message, array( 'post_id' => $post_id ), $tool );
		return Neo_Pulse_Wp_Backend_Assist_Pipeline::execute_write_tool( $message, $history, $tool, $params );
	}

	/**
	 * @param array<int, array<string, mixed>> $history
	 * @return array<string, mixed>|null
	 */
	public static function try_faq_table_append_response( string $message, array $history, array $params = array() ) {
		if ( ! self::message_requests_faq_table_append( $message ) ) {
			return null;
		}

		$post_id = self::resolve_effective_post_id( $params );
		if ( $post_id < 1 ) {
			return Neo_Pulse_Wp_Backend_Assist_Cards::error_card(
				__( 'Could not resolve the current page. Open the post you want to edit, then retry.', 'neo-pulse-wp' )
			);
		}

		$entries = self::faq_entries_from_post_meta( $post_id );
		if ( $entries === array() ) {
			return Neo_Pulse_Wp_Backend_Assist_Cards::error_card(
				__( 'No FAQ schema found in post meta for this page. Add FAQ schema in the backend first, then retry.', 'neo-pulse-wp' )
			);
		}

		// Write guard first: only an explicit Build submode may write; a missing submode means Ask.
		$submode = 'ask';
		if (
			is_array( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context )
			&& isset( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['admin_submode'] )
			&& is_string( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['admin_submode'] )
		) {
			$submode = Neo_Pulse_Wp_Backend_Assist_Submode::normalize_submode(
				Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['admin_submode']
			);
		}
		$table_html = self::faq_entries_to_table_html( $entries );
		if ( $submode !== 'build' ) {
			return self::build_faq_table_append_plan_card( $message, $post_id, $entries, $table_html );
		}

		unset( $history );
		$content_result = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_execute(
			'add_content',
			array(
				'post_id' => $post_id,
				'mode'    => 'append',
				'content' => $table_html,
			)
		);

		if ( empty( $content_result['success'] ) ) {
			$error = (string) ( $content_result['error'] ?? __( 'FAQ table append failed.', 'neo-pulse-wp' ) );
			return Neo_Pulse_Wp_Backend_Assist_Cards::error_card( $error );
		}

		return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_card(
			Neo_Pulse_Wp_Backend_Assist_Cards::action_card( $content_result, 'add_content' ),
			'add_content',
			$content_result
		);
	}

	/**
	 * @param array<int, array{question: string, answer: string}> $entries
	 * @return array<string, mixed>
	 */
	private static function build_faq_table_append_plan_card( string $message, int $post_id, array $entries, string $table_html ): array {
		$post  = get_post( $post_id );
		$title = $post instanceof WP_Post ? $post->post_title : (string) $post_id;

		Neo_Pulse_Wp_Backend_Assist_Plan_Cache::save(
			$message,
			$post_id,
			array(
				'tool'    => 'add_content',
				'params'  => array(
					'post_id' => $post_id,
					'mode'    => 'append',
					'content' => $table_html,
				),
				'restatement' => __( 'Append a visible FAQ table at the end of this post using Q/A pairs from the backend FAQ schema.', 'neo-pulse-wp' ),
			)
		);

		$lines   = array();
		$lines[] = '**' . __( 'Your request', 'neo-pulse-wp' ) . '**';
		$lines[] = '> ' . trim( $message );
		$lines[] = '';
		$lines[] = '**' . __( 'What I understood', 'neo-pulse-wp' ) . '**';
		$lines[] = __( 'Append an FAQ table at the end of the current post. H2 and rows come from the FAQ schema already saved in post meta.', 'neo-pulse-wp' );
		$lines[] = '';
		$lines[] = '**' . __( 'Tools', 'neo-pulse-wp' ) . '**';
		$lines[] = '- `add_content` (' . __( 'mode: append', 'neo-pulse-wp' ) . ')';
		$lines[] = '- ' . sprintf(
			/* translators: 1: post title, 2: post ID, 3: entry count */
			__( 'Target post: %1$s (ID %2$d) — %3$d FAQ entries from schema', 'neo-pulse-wp' ),
			$title,
			$post_id,
			count( $entries )
		);
		$lines[] = '';
		$lines[] = '**' . __( 'Approval', 'neo-pulse-wp' ) . '**';
		$lines[] = __( 'Switch to Build to run exactly this plan.', 'neo-pulse-wp' );

		return Neo_Pulse_Wp_Backend_Assist_Cards::enrich_plan_card(
			array(
				'type'              => 'plan',
				'workflow'          => false,
				'title'             => __( 'Proposed plan', 'neo-pulse-wp' ),
				'body'              => implode( "\n", $lines ),
				'steps'             => array(
					array(
						'label'      => __( 'Tool: add_content (append FAQ table from schema)', 'neo-pulse-wp' ),
						'status'     => 'pending',
						'tool'       => 'add_content',
						'executable' => true,
						'visible'    => true,
					),
				),
				'workflow_complete' => false,
				'links'             => array(),
				'submode_switch'    => 'build',
				'confidence'        => 'high',
				'planned_tool'      => 'add_content',
			),
			$post_id,
			'add_content',
			$message
		);
	}

	/**
	 * @return array<int, array{question: string, answer: string}>
	 */
	public static function faq_entries_from_post_meta( int $post_id ): array {
		if ( $post_id < 1 ) {
			return array();
		}
		if ( ! class_exists( 'Neo_Pulse_Wp_Ai_Context' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-context.php';
		}
		if ( ! class_exists( 'Neo_Pulse_Wp_Faq_Parser' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/faq/class-neo-pulse-wp-faq-parser.php';
		}
		$raw = Neo_Pulse_Wp_Ai_Context::read_field_value( $post_id, 'faq' );
		return Neo_Pulse_Wp_Faq_Parser::parse( $raw );
	}

	/**
	 * @param array<int, array{question: string, answer: string}> $entries
	 */
	public static function faq_entries_to_table_html( array $entries, string $heading = '' ): string {
		$h2    = trim( $heading ) !== '' ? trim( $heading ) : 'Frequently Asked Questions';
		$html  = '<h2>' . esc_html( $h2 ) . '</h2>' . "\n";
		$html .= '<table><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody>';
		foreach ( $entries as $entry ) {
			$question = esc_html( (string) ( $entry['question'] ?? '' ) );
			$answer   = esc_html( (string) ( $entry['answer'] ?? '' ) );
			if ( $question === '' && $answer === '' ) {
				continue;
			}
			$html .= '<tr><td>' . $question . '</td><td>' . $answer . '</td></tr>';
		}
		$html .= '</tbody></table>';
		return $html;
	}

	public static function faq_table_html_from_post_meta( int $post_id ): string {
		$entries = self::faq_entries_from_post_meta( $post_id );
		if ( $entries === array() ) {
			return '';
		}
		return self::faq_entries_to_table_html( $entries );
	}

	public static function strip_json_ld_from_html( string $html ): string {
		$html = (string) preg_replace(
			'/<script[^>]*type\s*=\s*["\']application\/ld\+json["\'][^>]*>[\s\S]*?<\/script>/i',
			'',
			$html
		);
		$html = (string) preg_replace(
			'/\{\s*"@context"\s*:\s*"https:\/\/schema\.org"[\s\S]*?"@type"\s*:\s*"FAQPage"[\s\S]*?\}/i',
			'',
			$html
		);
		return trim( (string) preg_replace( "/\n{3,}/", "\n\n", $html ) );
	}

	/**
	 * @return array<int, array{question: string, answer: string}>|WP_Error
	 */
	public static function generate_faq_qa_pairs( int $post_id, string $message, array $history ) {
		unset( $history );

		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_faq_post', __( 'post_id is required for FAQ generation.', 'neo-pulse-wp' ) );
		}

		$post_context = self::build_post_context_for_plan( $post_id );
		$system       = <<<'PROMPT'
You produce FAQ question-and-answer pairs for a WordPress post. Output ONLY valid JSON with this shape:
{"entries":[{"question":"...","answer":"..."}]}
Rules:
- 4 to 6 entries grounded in the post topic and user request.
- Answers are 1-3 sentences of useful copy for site visitors.
- No markdown fences. No HTML in answers.
PROMPT;

		$user = "USER REQUEST:\n{$message}\n\n{$post_context}";
		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter(
			Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL,
			$system,
			$user,
			4096,
			0.45
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$parsed = Neo_Pulse_Wp_Backend_Assist_Ai::parse_json_response( $result );
		if ( ! is_array( $parsed ) || empty( $parsed['entries'] ) || ! is_array( $parsed['entries'] ) ) {
			return new WP_Error( 'neo-pulse_faq_parse', __( 'FAQ generation returned invalid JSON.', 'neo-pulse-wp' ) );
		}

		$entries = array();
		foreach ( $parsed['entries'] as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$question = trim( (string) ( $row['question'] ?? '' ) );
			$answer   = trim( (string) ( $row['answer'] ?? '' ) );
			if ( $question === '' && $answer === '' ) {
				continue;
			}
			$entries[] = array(
				'question' => $question,
				'answer'   => $answer,
			);
		}

		if ( $entries === array() ) {
			return new WP_Error( 'neo-pulse_faq_empty', __( 'FAQ generation returned no entries.', 'neo-pulse-wp' ) );
		}

		return $entries;
	}

	/**
	 * @param array<int, array{question: string, answer: string}> $entries
	 */
	public static function faq_entries_to_schema_json( array $entries ): string {
		if ( ! class_exists( 'Neo_Pulse_Wp_Faq_Schema' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/faq/class-neo-pulse-wp-faq-schema.php';
		}
		$schema = Neo_Pulse_Wp_Faq_Schema::build_faq_page( $entries );
		$json   = wp_json_encode( $schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
		return is_string( $json ) ? $json : '';
	}

	/**
	 * @return string|WP_Error
	 */
	public static function generate_faq_schema_for_meta( int $post_id, string $message, array $history ) {
		$entries = self::generate_faq_qa_pairs( $post_id, $message, $history );
		if ( is_wp_error( $entries ) ) {
			return $entries;
		}
		$json = self::faq_entries_to_schema_json( $entries );
		if ( $json === '' ) {
			return new WP_Error( 'neo-pulse_faq_schema', __( 'Could not build FAQ schema JSON.', 'neo-pulse-wp' ) );
		}
		return $json;
	}

	public static function message_requests_internal_links( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		if ( preg_match( '/\binternal\s+links?\b/i', $message ) ) {
			return true;
		}
		if ( preg_match( '/\b(link|links)\b/i', $lower ) && preg_match( '/\b(add|insert|put|weave)\b/i', $lower ) ) {
			return true;
		}
		return (bool) preg_match( '/\blink\s+to\b/i', $lower );
	}

	public static function parse_link_count_from_message( string $message ): int {
		if ( preg_match( '/\badd\s+(\d{1,2})\s+internal\s+links?\b/i', $message, $matches ) ) {
			return max( 1, min( 30, absint( $matches[1] ) ) );
		}
		if ( preg_match( '/\b(\d{1,2})\s+internal\s+links?\b/i', $message, $matches ) ) {
			return max( 1, min( 30, absint( $matches[1] ) ) );
		}
		return 0;
	}

	public static function message_requests_surgical_body_edit( string $message, int $post_id ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}

		if ( preg_match( '/\b(delete|remove)\b.*\b(section|faq|block|first|second|one)\b/i', $message ) ) {
			return true;
		}
		if ( preg_match( '/\bkeep\b.*\b(the\s+)?(first|second)\b/i', $message ) ) {
			return true;
		}
		if ( preg_match( '/\b(two\s+faq|duplicate|first\s+one|second\s+one)\b/i', $lower ) ) {
			return true;
		}
		if ( preg_match( '/\bstrip\b.*\bschema\b/i', $message ) && preg_match( '/\b(body|content|post)\b/i', $message ) ) {
			return true;
		}

		$markers = array(
			'first faq',
			'second faq',
			'first section',
			'second section',
		);
		foreach ( $markers as $marker ) {
			if ( str_contains( $lower, $marker ) ) {
				return true;
			}
		}

		return false;
	}

	public static function message_requests_body_schema_cleanup( string $message ): bool {
		if ( preg_match( '/\b(delete|remove|strip)\b.*\b(schema|json-ld|json ld)\b/i', $message ) ) {
			return true;
		}
		if ( preg_match( '/\bkeep\b.*\btable\b/i', $message ) && preg_match( '/\bschema\b/i', $message ) ) {
			return true;
		}
		return false;
	}

	/**
	 * Append a brand-new table block (e.g. FAQ at end), not an in-place section table edit.
	 */
	public static function message_requests_append_new_table( string $message ): bool {
		if ( ! preg_match( '/\b(append|add)\s+(?:a\s+)?(?:new\s+)?(?:faq\s+)?table\b/i', $message ) ) {
			return false;
		}
		if ( preg_match( '/\b(convert|edit|change|make)\b/i', $message ) ) {
			return false;
		}
		if ( self::message_targets_named_section( $message ) ) {
			return false;
		}
		return true;
	}

	/**
	 * User names a section/heading target (in-place edit), not a whole-post replace.
	 */
	public static function message_targets_named_section( string $message ): bool {
		if ( preg_match( '/\b(?:this|that|specific)\s+section\b/i', $message ) ) {
			return true;
		}
		if ( preg_match( '/\b(to|in|into|for|under|below|within|inside)\s+(?:the\s+)?(?:section|heading|h2|h3)\b/i', $message ) ) {
			return true;
		}
		if ( preg_match( '/\b(to|in|into|for|under|below|within|inside)\s+(?:the\s+)?["\']/i', $message ) ) {
			return true;
		}
		if ( preg_match( '/\btable\b.{0,48}\b(to|in|into|for|under|below|within|inside)\b/i', $message ) ) {
			return true;
		}
		if ( preg_match( '/\b(to|in|into|for|under|below|within|inside)\b.{0,48}\btable\b/i', $message ) ) {
			return true;
		}
		if ( preg_match( '/\bhere\b.{0,32}\b["\']?[A-Za-z]/i', $message ) && preg_match( '/\btable\b/i', $message ) ) {
			return true;
		}
		return false;
	}

	public static function message_requests_full_body_rewrite( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		if ( preg_match( '/\b(?:rewrite|redo|overhaul|refresh)\s+(?:the\s+)?(?:whole|entire|full\s+)?(?:blog|post|article|page|content|body)\b/i', $lower ) ) {
			return true;
		}
		if ( preg_match( '/\b(?:rewrite|redo|overhaul|refresh)\s+(?:the\s+)?(?:blog|post|article|page)\b/i', $lower ) ) {
			return true;
		}
		return (bool) preg_match( '/\b(?:full|entire|whole)\s+(?:blog|post|article|page|content|body)\s+(?:rewrite|refresh|overhaul)\b/i', $lower );
	}

	public static function should_use_body_ops( string $message, int $post_id, array $params ): bool {
		if ( self::message_requests_full_body_rewrite( $message ) ) {
			return false;
		}
		if ( $post_id > 0 && self::post_has_nonempty_body( $post_id ) && self::message_targets_named_section( $message ) ) {
			return true;
		}

		$mode = sanitize_key( (string) ( $params['mode'] ?? '' ) );
		if ( in_array( $mode, array( 'ops', 'surgical', 'edit' ), true ) ) {
			return $post_id > 0 && self::post_has_nonempty_body( $post_id );
		}
		if ( in_array( $mode, array( 'append', 'replace' ), true ) ) {
			return false;
		}
		if ( $post_id < 1 || ! self::post_has_nonempty_body( $post_id ) ) {
			return false;
		}
		if ( preg_match( '/\b(add|write|create|generate)\s+(?:\d+\s+)?(?:new\s+)?(?:h[23]s?|sections?|paragraphs?)\b/i', $message ) ) {
			return false;
		}
		if ( self::message_requests_append_new_table( $message ) ) {
			return false;
		}
		if ( preg_match( '/\b(full body|replace (?:the )?body|write (?:the )?(?:whole|entire)|rewrite (?:the )?(?:post|blog|article|page|content))\b/i', strtolower( $message ) ) ) {
			return false;
		}
		if ( self::message_requests_body_schema_cleanup( $message ) ) {
			return true;
		}
		if ( self::message_requests_internal_links( $message ) ) {
			return true;
		}
		if ( preg_match( '/\b(delete|remove|convert|strip|bold|italic|table|overview|keep|section|edit|format|reword|move|duplicate|change|chnge|rename|rewrite|update|shorten)\b/i', $message ) ) {
			return true;
		}
		if ( self::message_requests_heading_change( $message ) ) {
			return true;
		}
		return false;
	}

	private static function post_has_nonempty_body( int $post_id ): bool {
		if ( $post_id < 1 ) {
			return false;
		}
		$post = get_post( $post_id );
		return $post instanceof WP_Post && trim( (string) $post->post_content ) !== '';
	}

	/**
	 * @return array<int, string>
	 */
	public static function body_ops_allowed_names(): array {
		return array(
			'remove_section',
			'truncate_after_table',
			'remove_sections_after',
			'convert_section_to_table',
			'insert_table_in_section',
			'convert_list_in_section',
			'remove_table_in_section',
			'replace_section_html',
			'strip_json_ld',
			'wrap',
			'replace_text',
			'replace_heading',
			'add_internal_links',
			'insert_overview_links',
		);
	}

	/**
	 * @return array<string, mixed>|WP_Error
	 */
	public static function classify_body_edit_intent( string $message, int $post_id, array $history = array() ) {
		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_body_intent', __( 'post_id is required for intent classification.', 'neo-pulse-wp' ) );
		}

		if ( ! class_exists( 'Neo_Pulse_Wp_Backend_Assist_Body_Ops' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/backend-assist/class-neo-pulse-wp-backend-assist-body-ops.php';
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'neo-pulse_body_intent', __( 'Post not found.', 'neo-pulse-wp' ) );
		}

		$html         = (string) $post->post_content;
		$sections     = Neo_Pulse_Wp_Backend_Assist_Body_Ops::index_html_sections( $html );
		$summary      = Neo_Pulse_Wp_Backend_Assist_Body_Ops::sections_summary_for_planner( $sections, $html );
		$summary_json = wp_json_encode( $summary, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
		$post_context = self::build_post_context_for_plan( $post_id );

		$system = <<<'PROMPT'
You classify in-place WordPress post body edit intent. Output ONLY valid JSON:
{"intent":"insert_new_table","target_heading":"Section title substring","section_index":null,"table":{"columns":["Col1","Col2"],"row_source":"generate","placement":"after_intro"},"restatement":"Plain English summary of what the user wants."}

Allowed intent values:
- insert_new_table: user wants a NEW table added; existing section prose stays (verbs: add, insert, create, new)
- replace_section: user wants the ENTIRE section rewritten from scratch (verbs: rewrite the section, replace the whole section, redo this section)
- convert_section_to_table: user wants existing section content restructured into a table (verbs: convert, make into, reformat as, turn into)
- remove_content: delete, remove, truncate
- edit_text: wrap, bold, replace text, delete a table and swap list format, convert ul to ol, add internal links in one section, tweak list formatting
- links: internal links, overview links
- other: anything else that still uses body ops

Rules:
- add/insert/create/new + table → insert_new_table, NOT convert_section_to_table
- delete/remove table, change list type (ul/ol), add links in section, format tweaks → edit_text or other, NOT replace_section
- rewrite/replace the whole section / redo section copy → replace_section only when user clearly wants full section rewrite
- If user says "don't change anything else", "only", or "just the list/table" → NEVER replace_section; use edit_text ops only
- convert/make into/reformat/turn into + table → convert_section_to_table
- Match target_heading from user message to SECTION INDEX when possible; set section_index when confident
- When CONVERSATION HISTORY shows the assistant just added an intro/H2, follow-up requests like "change the intro h2" target that first intro heading section
- table.placement: after_heading | after_intro | section_end (default after_intro for insert)
- table.columns: infer 2-4 column headers from request or section topic
- restatement: one short paragraph in plain English, no markdown fences
PROMPT;

		$user = self::build_planner_history_block( $history ) . "USER REQUEST:\n{$message}\n\n{$post_context}\nSECTION INDEX:\n{$summary_json}\n";
		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter(
			Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL,
			$system,
			$user,
			1024,
			0.15
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$parsed = Neo_Pulse_Wp_Backend_Assist_Ai::parse_json_response( $result );
		if ( ! is_array( $parsed ) || empty( $parsed['intent'] ) ) {
			return new WP_Error( 'neo-pulse_body_intent', __( 'Could not classify body edit intent.', 'neo-pulse-wp' ) );
		}

		$allowed_intents = array(
			'insert_new_table',
			'replace_section',
			'convert_section_to_table',
			'remove_content',
			'edit_text',
			'links',
			'other',
		);
		$intent = sanitize_key( (string) $parsed['intent'] );
		if ( ! in_array( $intent, $allowed_intents, true ) ) {
			$intent = 'other';
		}

		if ( self::message_requests_surgical_only( $message ) && $intent === 'replace_section' ) {
			$intent = 'edit_text';
		}

		$out = array(
			'intent'          => $intent,
			'target_heading'  => isset( $parsed['target_heading'] ) ? sanitize_text_field( (string) $parsed['target_heading'] ) : '',
			'section_index'   => isset( $parsed['section_index'] ) && $parsed['section_index'] !== null ? absint( $parsed['section_index'] ) : null,
			'restatement'     => isset( $parsed['restatement'] ) ? sanitize_textarea_field( (string) $parsed['restatement'] ) : '',
			'table'           => array(),
		);

		if ( ! empty( $parsed['table'] ) && is_array( $parsed['table'] ) ) {
			$table = $parsed['table'];
			$cols  = array();
			if ( ! empty( $table['columns'] ) && is_array( $table['columns'] ) ) {
				foreach ( $table['columns'] as $col ) {
					$col = trim( (string) $col );
					if ( $col !== '' ) {
						$cols[] = sanitize_text_field( $col );
					}
				}
			}
			$placement = sanitize_key( (string) ( $table['placement'] ?? 'after_intro' ) );
			if ( ! in_array( $placement, array( 'after_heading', 'after_intro', 'section_end' ), true ) ) {
				$placement = 'after_intro';
			}
			$row_source = sanitize_key( (string) ( $table['row_source'] ?? 'generate' ) );
			$out['table'] = array(
				'columns'    => $cols,
				'row_source' => in_array( $row_source, array( 'generate', 'user_specified' ), true ) ? $row_source : 'generate',
				'placement'  => $placement,
			);
		}

		return $out;
	}

	/**
	 * @param array<int, string> $columns
	 * @return array<int, array<int, string>>|WP_Error
	 */
	public static function generate_table_rows_for_section( string $message, string $heading, array $columns, string $section_excerpt ) {
		$col_count = $columns !== array() ? count( $columns ) : 2;
		if ( $col_count < 1 ) {
			$col_count = 2;
		}
		$col_list = $columns !== array() ? implode( ', ', $columns ) : 'Topic, Details';
		$system   = <<<PROMPT
Generate table row content for ONE HTML table being inserted into a WordPress post section.
Output ONLY valid JSON: {"rows":[["cell1","cell2"],["cell1","cell2","cell3"]]}

Rules:
- 3-6 rows unless user specifies otherwise
- Each row has exactly {$col_count} cells matching the column count
- New factual content aligned with section heading and user request
- No markdown fences
PROMPT;
		$user = "USER REQUEST:\n{$message}\n\nSECTION HEADING:\n{$heading}\n\nCOLUMNS:\n{$col_list}\n\nSECTION EXCERPT:\n{$section_excerpt}\n";

		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter(
			Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL,
			$system,
			$user,
			1024,
			0.3
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$parsed = Neo_Pulse_Wp_Backend_Assist_Ai::parse_json_response( $result );
		if ( ! is_array( $parsed ) || empty( $parsed['rows'] ) || ! is_array( $parsed['rows'] ) ) {
			return new WP_Error( 'neo-pulse_table_rows', __( 'Could not generate table rows.', 'neo-pulse-wp' ) );
		}

		$rows = array();
		foreach ( $parsed['rows'] as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$cells = array_values( $row );
			$out   = array();
			for ( $i = 0; $i < $col_count; $i++ ) {
				$out[] = (string) ( $cells[ $i ] ?? '' );
			}
			if ( implode( '', $out ) !== '' ) {
				$rows[] = $out;
			}
		}

		return $rows !== array() ? $rows : new WP_Error( 'neo-pulse_table_rows', __( 'Could not generate table rows.', 'neo-pulse-wp' ) );
	}

	/**
	 * @return string|WP_Error
	 */
	public static function generate_section_html_for_replace( string $message, string $heading, string $current_section_html ) {
		$system = <<<'PROMPT'
Generate replacement BODY HTML for ONE WordPress post H2 section only.
Output ONLY the section body (paragraphs, lists, tables). No markdown fences. No JSON.

Rules:
- Do NOT include <h2> or heading block comments; the original heading is preserved by the server
- Keep the EXACT same heading meaning; do not rename the section in body copy
- Fulfill the user request (remove table, numbered list, internal links, etc.)
- Keep existing intro paragraphs unless the user asked to rewrite or remove them
- Publish-ready semantic HTML only
PROMPT;
		$user = "USER REQUEST:\n{$message}\n\nSECTION HEADING:\n{$heading}\n\nCURRENT SECTION HTML:\n{$current_section_html}\n";

		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter(
			Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL,
			$system,
			$user,
			4096,
			0.4
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$html = self::strip_ai_html_fences( $result );
		if ( trim( $html ) === '' ) {
			return new WP_Error( 'neo-pulse_section_html', __( 'Could not generate replacement section HTML.', 'neo-pulse-wp' ) );
		}

		return self::strip_json_ld_from_html( $html );
	}

	/**
	 * @param array<string, mixed> $intent_data
	 * @return array<int, array<string, mixed>>|WP_Error
	 */
	public static function build_body_ops_from_intent( string $message, int $post_id, array $intent_data, array $history = array() ) {
		$intent = sanitize_key( (string) ( $intent_data['intent'] ?? 'other' ) );

		if ( self::message_requests_surgical_only( $message ) && $intent === 'replace_section' ) {
			$intent = 'edit_text';
		}

		if ( $intent === 'insert_new_table' ) {
			$table = isset( $intent_data['table'] ) && is_array( $intent_data['table'] ) ? $intent_data['table'] : array();
			$op    = array(
				'op'            => 'insert_table_in_section',
				'generate_rows' => true,
				'user_message'  => $message,
				'placement'     => sanitize_key( (string) ( $table['placement'] ?? 'after_intro' ) ),
				'columns'       => ! empty( $table['columns'] ) && is_array( $table['columns'] ) ? $table['columns'] : array( 'Topic', 'Details' ),
			);
			return array( self::apply_section_target_to_op( $op, $message, $post_id, $intent_data ) );
		}

		if ( $intent === 'replace_section' && ! self::message_requests_surgical_only( $message ) ) {
			$op = array(
				'op'           => 'replace_section_html',
				'generate'     => true,
				'user_message' => $message,
			);
			return array( self::apply_section_target_to_op( $op, $message, $post_id, $intent_data ) );
		}

		if ( $intent === 'convert_section_to_table' ) {
			$table   = isset( $intent_data['table'] ) && is_array( $intent_data['table'] ) ? $intent_data['table'] : array();
			$columns = ! empty( $table['columns'] ) && is_array( $table['columns'] ) ? $table['columns'] : self::detect_table_columns_from_message( $message );
			if ( $columns === array() ) {
				$columns = array( 'Feature', 'Benefit' );
			}
			$op = array(
				'op'            => 'convert_section_to_table',
				'generate_rows' => count( $columns ) > 2 || preg_match( '/\b(example|real.?life|generate)\b/i', $message ),
				'user_message'  => $message,
				'layout'        => 'list',
				'columns'       => $columns,
			);
			return array( self::apply_section_target_to_op( $op, $message, $post_id, $intent_data ) );
		}

		if ( $intent === 'edit_text' ) {
			if ( preg_match( '/\b(delete|remove)\b.*\btable\b|\btable\b.*\b(delete|remove)\b/i', $message ) ) {
				$op = array( 'op' => 'remove_table_in_section' );
				return array( self::apply_section_target_to_op( $op, $message, $post_id, $intent_data ) );
			}
			if ( preg_match( '/\b(bullet|bulleted|unordered|numbered|ordered|list|ul|ol)\b/i', $message ) ) {
				$op = array(
					'op'        => 'convert_list_in_section',
					'list_type' => self::detect_list_type_from_message( $message ),
				);
				return array( self::apply_section_target_to_op( $op, $message, $post_id, $intent_data ) );
			}
		}

		if ( $intent === 'links' ) {
			$op = array(
				'op'         => 'add_internal_links',
				'link_count' => self::detect_link_count_from_message( $message ),
			);
			return array( self::apply_section_target_to_op( $op, $message, $post_id, $intent_data ) );
		}

		return self::plan_post_body_ops( $message, $post_id, $intent_data, $history );
	}

	/**
	 * First non-empty message line that fuzzy-matches an H2 on the post.
	 */
	public static function extract_heading_from_message( string $message, int $post_id ): string {
		if ( $post_id < 1 ) {
			return '';
		}
		if ( ! class_exists( 'Neo_Pulse_Wp_Backend_Assist_Body_Ops' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/backend-assist/class-neo-pulse-wp-backend-assist-body-ops.php';
		}
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return '';
		}
		$sections = Neo_Pulse_Wp_Backend_Assist_Body_Ops::index_html_sections( (string) $post->post_content );
		$lines    = preg_split( '/\r?\n/', trim( $message ) );
		if ( ! is_array( $lines ) ) {
			return '';
		}
		foreach ( $lines as $line ) {
			$line = trim( (string) $line );
			if ( $line === '' ) {
				continue;
			}
			$needle = strtolower( $line );
			foreach ( $sections as $sec ) {
				$heading = (string) ( $sec['heading_text'] ?? '' );
				if ( $heading === '' || $heading === '(intro)' ) {
					continue;
				}
				$h = strtolower( $heading );
				if ( $h === $needle || str_contains( $h, $needle ) || str_contains( $needle, $h ) ) {
					return $heading;
				}
			}
		}
		return '';
	}

	private static function message_requests_surgical_only( string $message ): bool {
		return (bool) preg_match(
			"/don['']t change anything else|do not change anything else|change nothing else|only change|only the list|just the list|only the table|just the table/i",
			$message
		);
	}

	/**
	 * @param array<string, mixed> $op
	 * @param array<string, mixed> $intent_data
	 * @return array<string, mixed>
	 */
	private static function apply_section_target_to_op( array $op, string $message, int $post_id, array $intent_data ): array {
		$heading = self::extract_heading_from_message( $message, $post_id );
		if ( $heading !== '' ) {
			$op['heading_match'] = $heading;
			unset( $op['section_index'] );
		} elseif ( ! empty( $intent_data['target_heading'] ) ) {
			$op['heading_match'] = sanitize_text_field( (string) $intent_data['target_heading'] );
			unset( $op['section_index'] );
		} elseif ( isset( $intent_data['section_index'] ) && $intent_data['section_index'] !== null ) {
			$op['section_index'] = (int) $intent_data['section_index'];
		}
		return $op;
	}

	private static function detect_list_type_from_message( string $message ): string {
		if ( preg_match( '/\b(numbered|ordered|\bol\b)\b/i', $message ) ) {
			return 'ol';
		}
		return 'ul';
	}

	private static function detect_link_count_from_message( string $message ): int {
		if ( preg_match( '/\b(\d+)\s+links?\b/i', $message, $m ) ) {
			return max( 1, (int) $m[1] );
		}
		return 3;
	}

	/**
	 * @return array<int, string>
	 */
	private static function detect_table_columns_from_message( string $message ): array {
		if ( preg_match( '/\b(three|3)\s+columns?\b/i', $message ) ) {
			if ( preg_match( '/\bfeature\b/i', $message ) && preg_match( '/\bbenefit\b/i', $message ) ) {
				return array( 'Feature', 'Benefit', 'Real-Life Example' );
			}
			return array( 'Column 1', 'Column 2', 'Column 3' );
		}
		if ( preg_match( '/\b(two|2)\s+columns?\b/i', $message ) ) {
			return array( 'Topic', 'Details' );
		}
		if ( preg_match( '/\bfeature\b/i', $message ) && preg_match( '/\bbenefit\b/i', $message ) && preg_match( '/\bexample\b/i', $message ) ) {
			return array( 'Feature', 'Benefit', 'Real-Life Example' );
		}
		return array();
	}

	/**
	 * @param array<int, array<string, mixed>> $ops
	 * @return array<int, array<string, mixed>>
	 */
	private static function normalize_body_ops_for_message( string $message, array $ops ): array {
		foreach ( $ops as $i => $op ) {
			if ( ! is_array( $op ) || sanitize_key( (string) ( $op['op'] ?? '' ) ) !== 'convert_section_to_table' ) {
				continue;
			}
			if ( empty( $op['user_message'] ) ) {
				$ops[ $i ]['user_message'] = $message;
			}
			$columns = ! empty( $op['columns'] ) && is_array( $op['columns'] ) ? $op['columns'] : self::detect_table_columns_from_message( $message );
			if ( $columns !== array() ) {
				$ops[ $i ]['columns'] = $columns;
			}
			if ( empty( $op['generate_rows'] ) && ( count( $columns ) > 2 || preg_match( '/\b(example|real.?life|generate)\b/i', $message ) ) ) {
				$ops[ $i ]['generate_rows'] = true;
			}
			if ( empty( $op['layout'] ) ) {
				$ops[ $i ]['layout'] = 'list';
			}
		}
		return $ops;
	}

	/**
	 * @param array<int, array<string, mixed>> $ops
	 * @return true|WP_Error
	 */
	private static function validate_body_ops_plan( string $message, int $post_id, array $ops ) {
		$named_section = self::extract_heading_from_message( $message, $post_id ) !== ''
			|| self::message_targets_named_section( $message );
		$section_ops = array(
			'convert_list_in_section',
			'remove_table_in_section',
			'insert_table_in_section',
			'replace_section_html',
			'convert_section_to_table',
		);
		if ( $named_section ) {
			foreach ( $ops as $op ) {
				if ( ! is_array( $op ) ) {
					continue;
				}
				$name = sanitize_key( (string) ( $op['op'] ?? '' ) );
				if ( in_array( $name, $section_ops, true ) && empty( $op['heading_match'] ) ) {
					return new WP_Error(
						'neo-pulse_plan_heading',
						__( 'Plan requires a verified section heading match. Could not target the named section.', 'neo-pulse-wp' )
					);
				}
			}
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return true;
		}

		$has_generate = false;
		foreach ( $ops as $op ) {
			if ( is_array( $op ) && ( ! empty( $op['generate_rows'] ) || ! empty( $op['generate'] ) ) ) {
				$has_generate = true;
				break;
			}
		}
		if ( $has_generate ) {
			return true;
		}

		$dry = Neo_Pulse_Wp_Backend_Assist_Body_Ops::apply_ops( (string) $post->post_content, $ops );
		if ( is_wp_error( $dry ) ) {
			return $dry;
		}
		if ( trim( (string) $dry ) === trim( (string) $post->post_content ) ) {
			return new WP_Error(
				'neo-pulse_plan_noop',
				__( 'Dry-run made no change. Verify the target heading matches a section on this post.', 'neo-pulse-wp' )
			);
		}

		return true;
	}

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

	/**
	 * @return array<int, array<string, mixed>>|WP_Error
	 */
	public static function plan_post_body_ops( string $message, int $post_id, array $intent_data = array(), array $history = array() ) {
		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_body_ops_post', __( 'post_id is required for body ops.', 'neo-pulse-wp' ) );
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'neo-pulse_body_ops_post', __( 'Post not found.', 'neo-pulse-wp' ) );
		}

		$html = (string) $post->post_content;
		if ( trim( $html ) === '' ) {
			return new WP_Error( 'neo-pulse_body_ops_empty', __( 'Post body is empty.', 'neo-pulse-wp' ) );
		}

		if ( ! class_exists( 'Neo_Pulse_Wp_Backend_Assist_Body_Ops' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/backend-assist/class-neo-pulse-wp-backend-assist-body-ops.php';
		}

		$sections     = Neo_Pulse_Wp_Backend_Assist_Body_Ops::index_html_sections( $html );
		$summary      = Neo_Pulse_Wp_Backend_Assist_Body_Ops::sections_summary_for_planner( $sections, $html );
		$summary_json = wp_json_encode( $summary, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
		$post_context = self::build_post_context_for_plan( $post_id );

		$system = <<<'PROMPT'
You plan WYSIWYG HTML body edits for a WordPress post. Output ONLY valid JSON:
{"ops":[{"op":"remove_section","section_index":0}]}

Allowed ops (Phase 1):
- remove_section: section_index OR heading_match (substring). Removes ONE section only.
- truncate_after_table: optional heading_match or section_index; optional which (last|first, default last). Keeps HTML through closing </table>; deletes everything after. Use for "delete all content after the FAQ table".
- remove_sections_after: after_section_index OR after_heading_match. Keeps through end of anchor section; deletes all following sections.
- convert_section_to_table: section_index OR heading_match; optional columns (string array, e.g. ["Question","Answer"]); optional layout (pairs|paragraphs|list). Preserves heading and restructures section body into table rows.
- insert_table_in_section: section_index OR heading_match; columns (string array); placement (after_heading|after_intro|section_end). Inserts NEW table; existing section prose stays.
- convert_list_in_section: section_index OR heading_match; list_type (ul|ol). Swaps list tags in section body only; heading and paragraphs stay.
- remove_table_in_section: section_index OR heading_match. Removes first table from section body only; prose and lists stay.
- replace_heading: section_index OR heading_match; new_heading (plain text). Use for rename/change H2/H3 only; body copy stays.
- replace_section_html: section_index OR heading_match; replaces entire section HTML in place (use for rewrite/replace/update section requests).
- strip_json_ld: no extra fields
- wrap: find (exact phrase), tag (strong|em|b|i|a), href when tag is a
- replace_text: find, replace (single occurrence)
- add_internal_links: link_count (integer); optional section_index
- insert_overview_links: optional label (default Overview)

Rules:
- Interpret natural language; map intent to one or more ops.
- "Delete/remove all content after [table/FAQ table]" → ONE truncate_after_table op (NOT multiple remove_section).
- "Delete everything after [section heading]" → ONE remove_sections_after op.
- Never emit multiple remove_section ops for bulk tail delete; use truncate_after_table or remove_sections_after.
- "Don't change any content" → format ops only on named section; never remove_section elsewhere.
- "Keep the second FAQ" → remove_section on first FAQ section_index only.
- "Convert to table" / "make into table" → convert_section_to_table with appropriate columns when implied.
- "Add/insert/create a table in [section/heading]" → insert_table_in_section ONLY (never convert_section_to_table for add/insert/create).
- "Change/rename/update the intro h2" or follow-up after assistant added intro → replace_heading on first intro heading section only
- List format change (bulleted/numbered, ul/ol) → convert_list_in_section, NEVER replace_section_html.
- Delete/remove table in one section → remove_table_in_section, NEVER replace_section_html.
- Never use truncate_after_table, remove_sections_after, or remove_section when user only asked to add a table to one section.
- Never replace or regenerate the full post body.
- Prefer section_index from SECTION INDEX; use ends_with_table to locate FAQ table sections.
- Never output full replacement HTML.
- Do not output markdown fences or commentary.
PROMPT;

		$user = self::build_planner_history_block( $history ) . "USER REQUEST:\n{$message}\n\n{$post_context}\nSECTION INDEX:\n{$summary_json}\n";
		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter(
			Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL,
			$system,
			$user,
			2048,
			0.2
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$parsed = Neo_Pulse_Wp_Backend_Assist_Ai::parse_json_response( $result );
		if ( ! is_array( $parsed ) || empty( $parsed['ops'] ) || ! is_array( $parsed['ops'] ) ) {
			return new WP_Error( 'neo-pulse_body_ops_parse', __( 'Body ops planner returned invalid JSON.', 'neo-pulse-wp' ) );
		}

		$allowed = self::body_ops_allowed_names();
		$ops     = array();
		foreach ( $parsed['ops'] as $row ) {
			if ( ! is_array( $row ) || empty( $row['op'] ) ) {
				continue;
			}
			$op_name = sanitize_key( (string) $row['op'] );
			if ( ! in_array( $op_name, $allowed, true ) ) {
				continue;
			}
			if ( $op_name === 'add_internal_links' ) {
				$row['post_id'] = $post_id;
				if ( empty( $row['link_count'] ) && self::message_requests_internal_links( $message ) ) {
					$parsed_count = self::parse_link_count_from_message( $message );
					$row['link_count'] = $parsed_count > 0 ? $parsed_count : 5;
				}
			}
			$ops[] = $row;
		}

		if ( $ops === array() ) {
			return new WP_Error( 'neo-pulse_body_ops_empty', __( 'Body ops planner returned no valid operations.', 'neo-pulse-wp' ) );
		}

		return $ops;
	}

	/**
	 * @return array<int, array<string, mixed>>|WP_Error
	 */
	private static function resolve_body_ops_for_message( string $message, int $post_id, array $history = array() ) {
		$cached = Neo_Pulse_Wp_Backend_Assist_Plan_Cache::load( $message, $post_id );
		if ( is_array( $cached ) && ! empty( $cached['ops'] ) && is_array( $cached['ops'] ) ) {
			return $cached['ops'];
		}

		if ( self::message_targets_named_section( $message ) || preg_match( '/\btable\b/i', $message ) ) {
			$intent = self::classify_body_edit_intent( $message, $post_id, $history );
			if ( ! is_wp_error( $intent ) ) {
				$ops = self::build_body_ops_from_intent( $message, $post_id, $intent, $history );
				if ( ! is_wp_error( $ops ) ) {
					return $ops;
				}
			}
		}

		return self::plan_post_body_ops( $message, $post_id, array(), $history );
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>|WP_Error
	 */
	private static function prepare_body_ops_params( string $message, array $history, array $params ) {
		$params['mode'] = 'ops';

		if ( empty( $params['post_id'] ) && ! empty( $params['title'] ) ) {
			Neo_Pulse_Wp_Site_Inventory::warm( true );
			$item = Neo_Pulse_Wp_Site_Inventory::find_item_by_title( sanitize_text_field( (string) $params['title'] ) );
			if ( is_array( $item ) && ! empty( $item['id'] ) ) {
				$params['post_id'] = (int) $item['id'];
			}
		}

		if ( empty( $params['post_id'] ) ) {
			$plan   = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_plan( $message, $history, 'add_content', $params );
			$params = is_array( $plan['params'] ) ? array_merge( $params, $plan['params'] ) : $params;
		}

		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		if ( $post_id < 1 ) {
			return $params;
		}

		if ( ! class_exists( 'Neo_Pulse_Wp_Backend_Assist_Body_Ops' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/backend-assist/class-neo-pulse-wp-backend-assist-body-ops.php';
		}

		$ops = null;
		if ( self::message_requests_heading_change( $message ) ) {
			$heading_ops = self::build_heading_change_ops( $message, $post_id, $history );
			if ( is_wp_error( $heading_ops ) ) {
				return $heading_ops;
			}
			$ops = $heading_ops;
		} elseif ( self::message_requests_body_schema_cleanup( $message ) && ! preg_match( '/\b(delete|remove|convert|table)\b/i', $message ) ) {
			$ops = array( array( 'op' => 'strip_json_ld' ) );
		} else {
			$planned = self::resolve_body_ops_for_message( $message, $post_id, $history );
			if ( is_wp_error( $planned ) && self::message_requests_body_schema_cleanup( $message ) ) {
				$ops = array( array( 'op' => 'strip_json_ld' ) );
			} elseif ( is_wp_error( $planned ) ) {
				return $planned;
			} else {
				$ops = $planned;
			}
			if ( is_array( $ops ) ) {
				$ops = self::normalize_body_ops_for_message( $message, $ops );
			}
			if ( is_array( $ops ) && self::message_requests_body_schema_cleanup( $message ) ) {
				$has_strip = false;
				foreach ( $ops as $op ) {
					if ( is_array( $op ) && sanitize_key( (string) ( $op['op'] ?? '' ) ) === 'strip_json_ld' ) {
						$has_strip = true;
						break;
					}
				}
				if ( ! $has_strip ) {
					$ops[] = array( 'op' => 'strip_json_ld' );
				}
			}
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return $params;
		}

		$original = (string) $post->post_content;
		$updated  = Neo_Pulse_Wp_Backend_Assist_Body_Ops::apply_ops( $original, $ops );
		if ( is_wp_error( $updated ) ) {
			return $updated;
		}
		if ( trim( (string) $updated ) === trim( $original ) ) {
			return new WP_Error(
				'neo-pulse_body_ops_noop',
				__( 'Could not apply body edit in place. The target section may not have been found, or block markup prevented the splice.', 'neo-pulse-wp' )
			);
		}

		$params['content']       = $updated;
		$params['mode']          = 'replace';
		$params['body_ops']      = true;
		$params['body_ops_list'] = $ops;
		$params['ops_summary']   = Neo_Pulse_Wp_Backend_Assist_Body_Ops::describe_ops( $ops );

		return $params;
	}

	/**
	 * @return array<string, mixed>|WP_Error
	 */
	public static function prepare_body_ops_params_public( string $message, array $history, array $params ) {
		return self::prepare_body_ops_params( $message, $history, $params );
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

	public static function message_requests_new_page_or_post( string $message ): bool {
		$lower = strtolower( $message );
		if (
			str_contains( $lower, 'create a page' )
			|| str_contains( $lower, 'create a post' )
			|| str_contains( $lower, 'create page' )
			|| str_contains( $lower, 'create post' )
			|| str_contains( $lower, 'new page' )
			|| str_contains( $lower, 'new post' )
			|| str_contains( $lower, 'make a page' )
			|| str_contains( $lower, 'make a new page' )
			|| str_contains( $lower, 'make new page' )
			|| str_contains( $lower, 'new content' )
		) {
			return true;
		}
		return false;
	}

	/**
	 * @param array<int, array<string, mixed>> $history
	 */
	public static function history_requests_new_page_or_post( array $history ): bool {
		for ( $i = count( $history ) - 1; $i >= 0; $i-- ) {
			$turn = $history[ $i ];
			if ( ! is_array( $turn ) || ( $turn['role'] ?? '' ) !== 'user' ) {
				continue;
			}
			$content = isset( $turn['content'] ) ? (string) $turn['content'] : '';
			if ( $content !== '' && self::message_requests_new_page_or_post( $content ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Title and focus keyword for a new page/post. Uses classifier params, then the words after "keyword".
	 *
	 * @param array<string, mixed> $classification
	 * @return array{title: string, keyword: string}
	 */
	public static function create_page_title_from_message( string $message, array $classification = array() ): array {
		$params  = isset( $classification['params'] ) && is_array( $classification['params'] ) ? $classification['params'] : array();
		$title   = isset( $params['title'] ) ? sanitize_text_field( (string) $params['title'] ) : '';
		$keyword = '';
		if ( ! empty( $params['focus_keyword'] ) ) {
			$keyword = sanitize_text_field( (string) $params['focus_keyword'] );
		} elseif ( ! empty( $params['focusKeyword'] ) ) {
			$keyword = sanitize_text_field( (string) $params['focusKeyword'] );
		}

		if ( $keyword === '' ) {
			$lower  = strtolower( $message );
			$marker = 'keyword ';
			$pos    = strpos( $lower, $marker );
			if ( $pos !== false ) {
				$rest = trim( substr( $message, $pos + strlen( $marker ) ) );
				$cut  = stripos( $rest, ' and ' );
				if ( $cut !== false ) {
					$rest = substr( $rest, 0, $cut );
				}
				$keyword = sanitize_text_field( $rest );
			}
		}

		if ( $title === '' ) {
			$title = $keyword !== '' ? $keyword : __( 'New page', 'neo-pulse-wp' );
		}

		return array(
			'title'   => $title,
			'keyword' => $keyword,
		);
	}

	private static function message_implies_current_page_edit( string $message ): bool {
		return (bool) preg_match(
			'/\b(add|append|insert|update|faq\s+table|at the end|end of the post|this section|in this section)\b/i',
			$message
		);
	}

	private static function tool_defaults_to_builder_post( string $tool ): bool {
		return in_array(
			$tool,
			array(
				'add_content',
				'update_post',
				'restore_post_revision',
				'save_post_meta',
				'get_post',
				'get_gsc_context',
			),
			true
		);
	}

	public static function message_is_field_instruction( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		$phrases = array(
			'undo',
			'revert',
			'wrong field',
			'not the body',
			'not post body',
			'not the post body',
			'i said title',
			'i meant title',
			'not the title',
			'that was wrong',
			'you wrote',
			'you put',
			'in the body',
			'into the body',
		);
		foreach ( $phrases as $phrase ) {
			if ( strpos( $lower, $phrase ) !== false ) {
				return true;
			}
		}
		return false;
	}

	public static function message_is_undo_or_correction( string $message ): bool {
		return self::message_is_field_instruction( $message );
	}

	private static function content_looks_like_user_instruction( string $content, string $message ): bool {
		$content = trim( wp_strip_all_tags( $content ) );
		$message = trim( $message );
		if ( $content === '' || $message === '' ) {
			return false;
		}
		if ( $content === $message ) {
			return true;
		}
		return self::message_is_field_instruction( $content );
	}

	public static function copy_value_needs_planning( string $proposed, string $message ): bool {
		$proposed_norm = strtolower( preg_replace( '/\s+/', ' ', trim( $proposed ) ) );
		$message_norm  = strtolower( preg_replace( '/\s+/', ' ', trim( $message ) ) );
		if ( $proposed_norm === '' ) {
			return false;
		}
		if ( Neo_Pulse_Wp_Ai_Seo_Limits::is_placeholder_copy( $proposed ) ) {
			return true;
		}
		if ( self::title_looks_instructional( $proposed ) ) {
			return true;
		}
		if ( $message_norm === '' ) {
			return false;
		}
		if ( str_contains( $proposed_norm, $message_norm ) || str_contains( $message_norm, $proposed_norm ) ) {
			return true;
		}
		if ( preg_match( '/\|\s*(.+)$/', $proposed, $matches ) ) {
			$suffix = strtolower( trim( $matches[1] ) );
			if ( $suffix !== '' && str_contains( $message_norm, $suffix ) ) {
				return true;
			}
		}
		return false;
	}

	public static function title_looks_instructional( string $title ): bool {
		$title_norm = strtolower( preg_replace( '/\s+/', ' ', trim( $title ) ) );
		if ( $title_norm === '' ) {
			return false;
		}
		if ( preg_match( '/\|\s*(cta|seo|h1|h2|faq|meta)\s*$/i', $title ) ) {
			return true;
		}
		$instruction_markers = array(
			'pipeline character',
			'pipe character',
			'with a cta',
			'add to the title',
			'call to action',
			'a cta',
		);
		foreach ( $instruction_markers as $marker ) {
			if ( str_contains( $title_norm, $marker ) ) {
				return true;
			}
		}
		return false;
	}

	private static function message_gives_explicit_copy( string $message, string $proposed ): bool {
		if ( preg_match( '/(?:rename|change\s+(?:the\s+)?title\s+to|title\s+to|new\s+title\s+(?:is\s+)?)\s*["\']?(.+?)["\']?\s*$/i', $message, $matches ) ) {
			return trim( $matches[1] ) === trim( $proposed );
		}
		return false;
	}

	private static function message_requests_title_edit( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		return $lower !== '' && str_contains( $lower, 'title' );
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function prepare_update_post_params( string $message, array $history, array $params ): array {
		if ( empty( $params['post_id'] ) && ! empty( $params['title'] ) ) {
			Neo_Pulse_Wp_Site_Inventory::warm( true );
			$item = Neo_Pulse_Wp_Site_Inventory::find_item_by_title( sanitize_text_field( (string) $params['title'] ) );
			if ( is_array( $item ) && ! empty( $item['id'] ) ) {
				$params['post_id'] = (int) $item['id'];
			}
		}

		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		if ( $post_id > 0 ) {
			$post = get_post( $post_id );
			if ( $post instanceof WP_Post && empty( $params['title'] ) ) {
				$params['current_title'] = $post->post_title;
			}
		}

		if ( ! empty( $params['title'] ) ) {
			$proposed = (string) $params['title'];
			$explicit = self::message_gives_explicit_copy( $message, $proposed );
			$needs_plan = self::copy_value_needs_planning( $proposed, $message )
				|| ( self::message_requests_title_edit( $message ) && ! $explicit );
			if ( $needs_plan ) {
				unset( $params['title'] );
			}
		} elseif ( $post_id > 0 && self::message_requests_title_edit( $message ) ) {
			unset( $params['title'] );
		}

		$has_field = ! empty( $params['title'] ) || ! empty( $params['status'] )
			|| ! empty( $params['excerpt'] ) || ! empty( $params['slug'] );
		if ( ! $has_field ) {
			$plan   = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_plan( $message, $history, 'update_post', $params );
			$params = is_array( $plan['params'] ) ? array_merge( $params, $plan['params'] ) : $params;
		}

		return $params;
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function prepare_restore_post_revision_params( string $message, array $history, array $params ): array {
		unset( $message );
		if ( empty( $params['post_id'] ) && ! empty( $params['title'] ) ) {
			Neo_Pulse_Wp_Site_Inventory::warm( true );
			$item = Neo_Pulse_Wp_Site_Inventory::find_item_by_title( sanitize_text_field( (string) $params['title'] ) );
			if ( is_array( $item ) && ! empty( $item['id'] ) ) {
				$params['post_id'] = (int) $item['id'];
			}
		}
		if ( empty( $params['post_id'] ) ) {
			foreach ( array_reverse( $history ) as $entry ) {
				if ( ! is_array( $entry ) || ( $entry['role'] ?? '' ) !== 'assistant' ) {
					continue;
				}
				if ( preg_match( '/\[post_id=(\d+)/', (string) ( $entry['content'] ?? '' ), $matches ) ) {
					$params['post_id'] = absint( $matches[1] );
					break;
				}
			}
		}
		return $params;
	}

	private static function message_names_explicit_post_id( string $message, int $current_post_id ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}

		if ( preg_match( '/post\s*(?:id|#)\s*(\d+)/', $lower, $matches ) ) {
			return absint( $matches[1] ) !== $current_post_id;
		}

		if ( preg_match_all( '/\b(\d{4,})\b/', $message, $matches ) ) {
			foreach ( $matches[1] as $num ) {
				$candidate = absint( $num );
				if ( $candidate > 0 && $candidate !== $current_post_id ) {
					return true;
				}
			}
		}

		return false;
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

	public static function message_requests_heading_change( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		if ( preg_match( '/\b(?:change|chnge|rename|rewrite|reword|update|shorten|edit)\b.*\b(?:h[23]|heading|intro)\b/i', $lower ) ) {
			return true;
		}
		return (bool) preg_match( '/\b(?:h[23]|heading|intro)\b.*\b(?:change|chnge|rename|rewrite|reword|update|shorten|edit)\b/i', $lower );
	}

	/**
	 * @param array<int, array<string, mixed>> $history
	 */
	private static function history_recently_created_intro( array $history ): bool {
		foreach ( array_reverse( array_slice( $history, -6 ) ) as $entry ) {
			if ( sanitize_key( (string) ( $entry['role'] ?? '' ) ) !== 'user' ) {
				continue;
			}
			$content = strtolower( trim( (string) ( $entry['content'] ?? '' ) ) );
			if ( $content === '' ) {
				continue;
			}
			if ( preg_match( '/\b(?:write|add|create)\b.*\bintro\b|\bintro\b.*\bh[23]\b|\bh[23]\b.*\bintro\b/i', $content ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array<int, array<string, mixed>> $history
	 * @return array<string, mixed>|null
	 */
	private static function resolve_heading_change_section( string $message, int $post_id, array $history ): ?array {
		if ( ! class_exists( 'Neo_Pulse_Wp_Backend_Assist_Body_Ops' ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/backend-assist/class-neo-pulse-wp-backend-assist-body-ops.php';
		}
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return null;
		}
		$html  = (string) $post->post_content;
		$lower = strtolower( trim( $message ) );

		if (
			preg_match( '/\b(?:the\s+)?intro\b|\bintro\s+h[23]\b|\bh[23]\b.*\bintro\b/i', $lower )
			|| (
				self::history_recently_created_intro( $history )
				&& preg_match( '/\b(?:it|that|this|the)\b|\bh[23]\b|\bheading\b/i', $lower )
			)
		) {
			return Neo_Pulse_Wp_Backend_Assist_Body_Ops::resolve_intro_heading_section( $html );
		}

		$heading = self::extract_heading_from_message( $message, $post_id );
		if ( $heading !== '' ) {
			foreach ( Neo_Pulse_Wp_Backend_Assist_Body_Ops::index_html_sections( $html ) as $sec ) {
				if ( strtolower( (string) $sec['heading_text'] ) === strtolower( $heading ) ) {
					return $sec;
				}
			}
		}

		$headed = array();
		foreach ( Neo_Pulse_Wp_Backend_Assist_Body_Ops::index_html_sections( $html ) as $sec ) {
			if ( ( $sec['heading_text'] ?? '' ) === '(intro)' || (int) ( $sec['level'] ?? 0 ) < 1 ) {
				continue;
			}
			$headed[] = $sec;
		}
		if ( count( $headed ) === 1 ) {
			return $headed[0];
		}

		return null;
	}

	/**
	 * @param array<int, array<string, mixed>> $history
	 * @return array<int, array<string, mixed>>|WP_Error
	 */
	public static function build_heading_change_ops_public( string $message, int $post_id, array $history ) {
		return self::build_heading_change_ops( $message, $post_id, $history );
	}

	/**
	 * @param array<int, array<string, mixed>> $history
	 * @return string|WP_Error
	 */
	private static function generate_heading_replacement( string $message, int $post_id, string $current_heading, array $history ) {
		$post_context  = self::build_post_context_for_plan( $post_id );
		$history_block = self::build_planner_history_block( $history );
		$system        = <<<'PROMPT'
You rewrite ONE WordPress post section heading (H2/H3) from the user request and conversation history.
Output ONLY the new heading text. No HTML tags. No quotes. No explanation.
PROMPT;
		$user = $history_block
			. "USER REQUEST:\n{$message}\n\nCURRENT HEADING:\n{$current_heading}\n\n{$post_context}\n\nWrite the replacement heading only.";
		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter(
			Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL,
			$system,
			$user,
			128,
			0.25
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$heading = trim( sanitize_text_field( (string) $result ) );
		if ( $heading === '' ) {
			return new WP_Error( 'neo-pulse_heading_replace', __( 'Could not generate a replacement heading.', 'neo-pulse-wp' ) );
		}
		return $heading;
	}

	/**
	 * @param array<int, array<string, mixed>> $history
	 * @return array<int, array<string, mixed>>|WP_Error
	 */
	private static function build_heading_change_ops( string $message, int $post_id, array $history ) {
		$sec = self::resolve_heading_change_section( $message, $post_id, $history );
		if ( $sec === null ) {
			return new WP_Error(
				'neo-pulse_heading_target',
				__( 'Could not find the intro heading to update. Name the section or retry after adding the intro.', 'neo-pulse-wp' )
			);
		}
		$current = (string) ( $sec['heading_text'] ?? '' );
		$new     = self::generate_heading_replacement( $message, $post_id, $current, $history );
		if ( is_wp_error( $new ) ) {
			return $new;
		}
		return array(
			array(
				'op'            => 'replace_heading',
				'section_index' => (int) ( $sec['index'] ?? 0 ),
				'new_heading'   => $new,
			),
		);
	}

	public static function message_requests_date_modifier( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		if ( str_contains( $lower, 'date modifier' ) || str_contains( $lower, 'date_modifier' ) ) {
			return true;
		}
		if ( preg_match( '/\bset(?:ting)?\s+(?:the\s+)?date\b/', $lower ) ) {
			return true;
		}
		if ( preg_match( '/\bdate\s+(?:to\s+)?today\b/', $lower ) ) {
			return true;
		}
		return str_contains( $lower, 'update the date' ) || str_contains( $lower, 'set today' );
	}

	public static function message_requests_seo_research_brief( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		if ( self::message_clear_meta_field_hub_key( $message ) === 'seoResearch' ) {
			return false;
		}
		if ( preg_match( '/\b(?:clear|empty|remove|delete|wipe|reset|blank)\b.*\b(?:seo research|seo_research|research brief)\b/', $lower ) ) {
			return false;
		}
		if ( preg_match( '/\b(?:run|build|refresh|generate|create|do)\s+(?:the\s+)?(?:seo\s+)?research(?:\s+brief)?\b/', $lower ) ) {
			return true;
		}
		if ( preg_match( '/\bresearch brief\b/', $lower ) && ! preg_match( '/\b(?:clear|empty|remove|delete)\b/', $lower ) ) {
			return true;
		}
		if ( preg_match( '/\bseo research\b/', $lower ) && ! preg_match( '/\b(?:clear|empty|remove|delete|write|set|save)\b/', $lower ) ) {
			return true;
		}
		return (bool) preg_match( '/\bbuild brief\b/', $lower );
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function prepare_run_seo_research_brief_params( string $message, array $history, array $params ): array {
		if ( empty( $params['post_id'] ) && ! empty( $params['title'] ) ) {
			Neo_Pulse_Wp_Site_Inventory::warm( true );
			$item = Neo_Pulse_Wp_Site_Inventory::find_item_by_title( sanitize_text_field( (string) $params['title'] ) );
			if ( is_array( $item ) && ! empty( $item['id'] ) ) {
				$params['post_id'] = (int) $item['id'];
			}
		}
		unset( $params['title'] );
		return $params;
	}

	public static function message_clear_meta_field_hub_key( string $message ): string {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return '';
		}
		if ( ! preg_match( '/\b(?:clear|empty|remove|delete|wipe|reset|blank)\b/', $lower ) ) {
			return '';
		}
		$field_map = array(
			'seo_research'    => 'seoResearch',
			'seo research'    => 'seoResearch',
			'focus_keyword'   => 'focusKeyword',
			'focus keyword'   => 'focusKeyword',
			'keyword focus'   => 'focusKeyword',
			'meta_description' => 'metaDescription',
			'meta description' => 'metaDescription',
			'seo_title'       => 'seoTitle',
			'seo title'       => 'seoTitle',
			'date_modifier'   => 'dateModifier',
			'date modifier'   => 'dateModifier',
			'faq'             => 'faq',
		);
		foreach ( $field_map as $needle => $hub_key ) {
			if ( str_contains( $lower, $needle ) ) {
				return $hub_key;
			}
		}
		return '';
	}

	private static function today_date_modifier_value(): string {
		return gmdate( 'Y-m-d' );
	}

	/**
	 * @return array{requires_em_dash: bool, min_exclamations: int}
	 */
	public static function extract_meta_copy_constraints( string $message ): array {
		$lower = strtolower( trim( $message ) );
		$requires_em_dash = str_contains( $lower, 'em dash' )
			|| str_contains( $lower, 'em-dash' )
			|| str_contains( $message, '—' );

		$min_exclamations = 0;
		if ( preg_match( '/\b(\d+)\s*exclamation/i', $message, $matches ) ) {
			$min_exclamations = max( 1, min( 5, absint( $matches[1] ) ) );
		} elseif ( preg_match( '/\b(two|2)\s*(?:of them|exclamation)/i', $lower ) || preg_match( '/!!+/', $message ) ) {
			$min_exclamations = 2;
		}

		return array(
			'requires_em_dash'  => $requires_em_dash,
			'min_exclamations'  => $min_exclamations,
		);
	}

	/**
	 * @param array{requires_em_dash?: bool, min_exclamations?: int} $constraints
	 */
	public static function meta_copy_meets_constraints( string $value, array $constraints ): bool {
		$value = trim( $value );
		if ( $value === '' ) {
			return false;
		}
		if ( ! empty( $constraints['requires_em_dash'] ) && ! str_contains( $value, '—' ) ) {
			return false;
		}
		$min = isset( $constraints['min_exclamations'] ) ? absint( $constraints['min_exclamations'] ) : 0;
		if ( $min > 0 && substr_count( $value, '!' ) < $min ) {
			return false;
		}
		return true;
	}

	/**
	 * @param array{requires_em_dash?: bool, min_exclamations?: int} $constraints
	 */
	public static function meta_copy_constraints_prompt_block( array $constraints, string $message = '' ): string {
		$is_meta_write = self::message_requests_meta_refresh( $message ) || self::message_requests_meta_only_write( $message );
		if (
			empty( $constraints['requires_em_dash'] )
			&& empty( $constraints['min_exclamations'] )
			&& ! $is_meta_write
		) {
			return '';
		}

		$lines   = array( 'USER FORMATTING REQUIREMENTS (mandatory in seoTitle AND metaDescription):' );
		if ( ! empty( $constraints['requires_em_dash'] ) ) {
			$lines[] = '- Include an em dash character (—) in both seoTitle and metaDescription.';
		}
		if ( ! empty( $constraints['min_exclamations'] ) ) {
			$lines[] = sprintf(
				'- Include at least %d exclamation mark(s) (!) in both seoTitle and metaDescription.',
				(int) $constraints['min_exclamations']
			);
		}
		if ( $is_meta_write ) {
			$lines[] = '- Output BOTH seoTitle and metaDescription with clearly new copy vs existing POST CONTEXT values.';
			$lines[] = '- Do NOT set focusKeyword unless the user explicitly asked for keyword work.';
		}

		return implode( "\n", $lines ) . "\n";
	}

	/**
	 * @return array<int, string>
	 */
	public static function fields_requested_for_meta_write( string $message ): array {
		$fields = array();
		if ( self::message_requests_meta_refresh( $message ) || self::message_requests_meta_only_write( $message ) ) {
			$fields = array( 'seoTitle', 'metaDescription' );
		}
		if ( self::message_requests_focus_keyword( $message ) ) {
			$fields[] = 'focusKeyword';
		}
		if ( self::message_requests_faq_schema( $message ) ) {
			$fields[] = 'faq';
		}
		if ( self::message_requests_seo_research_brief( $message ) ) {
			$fields[] = 'seoResearch';
		}
		if ( self::message_requests_date_modifier( $message ) ) {
			$fields[] = 'dateModifier';
		}

		return array_values( array_unique( $fields ) );
	}

	/**
	 * @param array<string, mixed> $params
	 */
	public static function meta_plan_output_valid( string $message, array $params ): bool {
		$title = trim( (string) ( $params['seoTitle'] ?? $params['seo_title'] ?? '' ) );
		$desc  = trim( (string) ( $params['metaDescription'] ?? $params['meta_description'] ?? '' ) );

		if ( self::message_requests_meta_refresh( $message ) || self::message_requests_meta_only_write( $message ) ) {
			if ( $title === '' || $desc === '' ) {
				return false;
			}
		}

		$constraints = self::extract_meta_copy_constraints( $message );
		if ( empty( $constraints['requires_em_dash'] ) && empty( $constraints['min_exclamations'] ) ) {
			return $title !== '' || $desc !== '' || self::save_post_meta_has_values( $params );
		}

		return self::meta_copy_meets_constraints( $title, $constraints )
			&& self::meta_copy_meets_constraints( $desc, $constraints );
	}

	/**
	 * @param array<string, mixed> $params
	 */
	public static function meta_plan_retry_note( string $message, array $params ): string {
		$constraints = self::extract_meta_copy_constraints( $message );
		$missing     = array();
		$title       = trim( (string) ( $params['seoTitle'] ?? $params['seo_title'] ?? '' ) );
		$desc        = trim( (string) ( $params['metaDescription'] ?? $params['meta_description'] ?? '' ) );

		if ( $title === '' ) {
			$missing[] = 'seoTitle is empty';
		}
		if ( $desc === '' ) {
			$missing[] = 'metaDescription is empty';
		}
		if ( ! empty( $constraints['requires_em_dash'] ) ) {
			if ( ! self::meta_copy_meets_constraints( $title, array( 'requires_em_dash' => true, 'min_exclamations' => 0 ) ) ) {
				$missing[] = 'seoTitle missing em dash (—)';
			}
			if ( ! self::meta_copy_meets_constraints( $desc, array( 'requires_em_dash' => true, 'min_exclamations' => 0 ) ) ) {
				$missing[] = 'metaDescription missing em dash (—)';
			}
		}
		if ( ! empty( $constraints['min_exclamations'] ) ) {
			$min_rule = array(
				'requires_em_dash' => false,
				'min_exclamations' => (int) $constraints['min_exclamations'],
			);
			if ( ! self::meta_copy_meets_constraints( $title, $min_rule ) ) {
				$missing[] = 'seoTitle missing required exclamation marks';
			}
			if ( ! self::meta_copy_meets_constraints( $desc, $min_rule ) ) {
				$missing[] = 'metaDescription missing required exclamation marks';
			}
		}

		if ( empty( $missing ) ) {
			return '';
		}

		return 'RETRY NOTE: Prior output failed validation. Fix: ' . implode( '; ', $missing ) . '.';
	}

	public static function message_requests_meta_refresh( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		if ( ! preg_match( '/\b(meta|seo title|meta title|meta description|seo description)\b/i', $lower ) ) {
			return false;
		}
		return (bool) preg_match( '/\b(refresh|update|rewrite|regenerate|redo|new|change)\b/i', $lower );
	}

	private static function message_targets_acf_meta_fields( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		if ( str_contains( $lower, 'acf field' ) || str_contains( $lower, 'acf fields' ) || str_contains( $lower, 'acf meta' ) ) {
			return true;
		}
		if ( preg_match( '/\b(?:for|to|in|into)\s+acf\b/', $lower ) ) {
			return true;
		}
		if ( preg_match( '/\b(?:meta|keyword|keywrod|description).{0,40}\bacf\b/', $lower ) ) {
			return true;
		}
		if ( preg_match( '/\bacf.{0,40}(?:meta|keyword|keywrod|description)\b/', $lower ) ) {
			return true;
		}
		return false;
	}

	private static function message_requests_meta_description( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		return $lower !== '' && str_contains( $lower, 'meta description' );
	}

	public static function message_requests_focus_keyword( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}
		if ( str_contains( $lower, 'focus keyword' ) || str_contains( $lower, 'keyword focus' ) ) {
			return true;
		}
		if ( str_contains( $lower, 'keywrod' ) || str_contains( $lower, 'a keyword' ) ) {
			return true;
		}
		return str_contains( $lower, 'keyword' )
			&& ( str_contains( $lower, 'add ' ) || str_contains( $lower, 'creat ' ) || str_contains( $lower, 'create ' ) || str_contains( $lower, 'set ' ) || str_contains( $lower, 'update ' ) );
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function strip_unusable_meta_params( string $message, array $params, int $post_id = 0 ): array {
		$meta_keys = array(
			'focusKeyword',
			'focus_keyword',
			'metaDescription',
			'meta_description',
			'seoTitle',
			'seo_title',
			'seoResearch',
			'seo_research',
			'faq',
		);
		foreach ( $meta_keys as $meta_key ) {
			if ( empty( $params[ $meta_key ] ) ) {
				continue;
			}
			$value = (string) $params[ $meta_key ];
			if (
				Neo_Pulse_Wp_Ai_Seo_Limits::is_placeholder_copy( $value )
				|| self::copy_value_needs_planning( $value, $message )
				|| ( $post_id > 0 && Neo_Pulse_Wp_Ai_Seo_Limits::meta_copy_drifts_from_post( $value, $post_id ) )
			) {
				unset( $params[ $meta_key ] );
			}
		}
		return $params;
	}

	/**
	 * @param array<string, mixed> $params
	 * @return bool
	 */
	private static function save_post_meta_has_values( array $params ): bool {
		if ( ! empty( $params['clearFields'] ) && is_array( $params['clearFields'] ) ) {
			return true;
		}
		foreach ( array( 'focusKeyword', 'focus_keyword', 'metaDescription', 'meta_description', 'seoTitle', 'seo_title', 'faq', 'seoResearch', 'seo_research', 'dateModifier', 'date_modifier' ) as $meta_key ) {
			if ( ! empty( $params[ $meta_key ] ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function prepare_save_post_meta_params( string $message, array $history, array $params ): array {
		if ( empty( $params['post_id'] ) && ! empty( $params['title'] ) ) {
			Neo_Pulse_Wp_Site_Inventory::warm( true );
			$item = Neo_Pulse_Wp_Site_Inventory::find_item_by_title( sanitize_text_field( (string) $params['title'] ) );
			if ( is_array( $item ) && ! empty( $item['id'] ) ) {
				$params['post_id'] = (int) $item['id'];
			}
		}

		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;

		$clear_hub = self::message_clear_meta_field_hub_key( $message );
		if ( $clear_hub !== '' && $post_id > 0 ) {
			$params['clearFields'] = array( $clear_hub );
		}

		if ( self::message_requests_date_modifier( $message ) && $post_id > 0 ) {
			$params['dateModifier'] = self::today_date_modifier_value();
		}

		if ( self::message_targets_acf_meta_fields( $message ) ) {
			foreach ( array( 'focusKeyword', 'focus_keyword', 'metaDescription', 'meta_description', 'seoTitle', 'seo_title', 'seoResearch', 'seo_research' ) as $meta_key ) {
				unset( $params[ $meta_key ] );
			}
		}

		$params     = self::strip_unusable_meta_params( $message, $params, $post_id );
		$has_values = self::save_post_meta_has_values( $params );

		if ( empty( $params['faq'] ) && self::message_requests_faq_schema( $message ) && $post_id > 0 ) {
			$generated = self::generate_faq_schema_for_meta( $post_id, $message, $history );
			if ( ! is_wp_error( $generated ) && $generated !== '' ) {
				$params['faq'] = $generated;
				$has_values    = true;
			}
		}

		if ( ! $has_values ) {
			$params = self::plan_save_post_meta_params( $message, $history, $params );
		} else {
			$params = self::finalize_save_post_meta_params( $message, $params );
		}

		if ( empty( $params['faq'] ) && self::message_requests_faq_schema( $message ) && $post_id > 0 ) {
			$generated = self::generate_faq_schema_for_meta( $post_id, $message, $history );
			if ( ! is_wp_error( $generated ) && $generated !== '' ) {
				$params['faq'] = $generated;
			}
		}

		return $params;
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function plan_save_post_meta_params( string $message, array $history, array $params ): array {
		$constraints  = self::extract_meta_copy_constraints( $message );
		$plan_options = array(
			'meta_constraints' => $constraints,
			'meta_only_write'  => self::message_requests_meta_only_write( $message ),
		);

		$plan   = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_plan( $message, $history, 'save_post_meta', $params, $plan_options );
		$params = is_array( $plan['params'] ) ? array_merge( $params, $plan['params'] ) : $params;
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		$params  = self::strip_unusable_meta_params( $message, $params, $post_id );
		$params  = self::finalize_save_post_meta_params( $message, $params );

		if ( ! self::meta_plan_output_valid( $message, $params ) ) {
			$retry_note = self::meta_plan_retry_note( $message, $params );
			if ( $retry_note !== '' ) {
				$retry_plan = Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases::phase_plan(
					$message . "\n\n" . $retry_note,
					$history,
					'save_post_meta',
					$params,
					$plan_options
				);
				$params = is_array( $retry_plan['params'] ) ? array_merge( $params, $retry_plan['params'] ) : $params;
				$params = self::strip_unusable_meta_params( $message, $params, $post_id );
				$params = self::finalize_save_post_meta_params( $message, $params );
			}
		}

		if ( ! self::meta_plan_output_valid( $message, $params ) ) {
			$params['_meta_constraint_warning'] = __( 'Saved meta may not include all requested formatting (em dash or exclamation marks).', 'neo-pulse-wp' );
		}

		return $params;
	}

	/**
	 * @param array<string, mixed> $params
	 * @return array<string, mixed>
	 */
	private static function finalize_save_post_meta_params( string $message, array $params ): array {
		$post_id = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;

		if ( self::message_requests_meta_only_write( $message ) && ! self::message_requests_focus_keyword( $message ) ) {
			unset( $params['focusKeyword'], $params['focus_keyword'] );
		}

		if ( self::message_requests_meta_only_write( $message ) ) {
			$params['seo_title_only'] = true;
		}

		if (
			$post_id > 0
			&& ( self::message_requests_focus_keyword( $message ) || self::message_targets_acf_meta_fields( $message ) )
			&& empty( $params['focusKeyword'] )
			&& empty( $params['focus_keyword'] )
		) {
			$inferred = Neo_Pulse_Wp_Ai_Seo_Limits::infer_focus_keyword_from_post( $post_id );
			if ( $inferred !== '' ) {
				$params['focusKeyword'] = $inferred;
			}
		}

		return $params;
	}
}
