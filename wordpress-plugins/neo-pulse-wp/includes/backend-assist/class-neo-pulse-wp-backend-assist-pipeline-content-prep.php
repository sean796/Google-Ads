<?php
/**
 * Backend Assist — tool param preparation and post body generation
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_wp_content_prep_dir = __DIR__ . '/';
require_once $neo_pulse_wp_content_prep_dir . 'trait-backend-assist-content-prep-body-gen.php';
require_once $neo_pulse_wp_content_prep_dir . 'trait-backend-assist-content-prep-faq.php';
require_once $neo_pulse_wp_content_prep_dir . 'trait-backend-assist-content-prep-body-intent.php';
require_once $neo_pulse_wp_content_prep_dir . 'trait-backend-assist-content-prep-body-ops-plan.php';
require_once $neo_pulse_wp_content_prep_dir . 'trait-backend-assist-content-prep-plan-preview.php';
require_once $neo_pulse_wp_content_prep_dir . 'trait-backend-assist-content-prep-post-fields.php';
require_once $neo_pulse_wp_content_prep_dir . 'trait-backend-assist-content-prep-meta.php';

class Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep {

	use Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep_Trait_Body_Gen;
	use Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep_Trait_Faq;
	use Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep_Trait_Body_Intent;
	use Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep_Trait_Body_Ops_Plan;
	use Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep_Trait_Plan_Preview;
	use Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep_Trait_Post_Fields;
	use Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep_Trait_Meta;

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
}
