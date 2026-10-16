<?php
/**
 * Backend Assist — content outline, harness generation, batch section writes
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Content {

	public static function phase_plan_content_outline( string $message, array $ctx, array $history = array() ) {
		$site_name = get_bloginfo( 'name' );
		$fk        = isset( $ctx['focus_keyword'] ) ? sanitize_text_field( $ctx['focus_keyword'] ) : '';
		$title     = isset( $ctx['post_title'] ) ? sanitize_text_field( $ctx['post_title'] ) : '';
		$brief     = isset( $ctx['content_brief'] ) ? (string) $ctx['content_brief'] : '';

		$system = <<<PROMPT
You are a content outline planner for WordPress SEO posts on "{$site_name}".
From the user request, produce a detailed section-by-section writing plan.

Output ONLY valid JSON:
{
  "sections": [
    {
      "id": "s1",
      "type": "h2",
      "title": "Section heading text",
      "label": "Build section: Section heading text",
      "brief": "What this section must cover",
      "features": ["[LIST]"]
    }
  ]
}

RULES:
- Each H2 is its own section. Never one mega-section for the whole page.
- Each section is a harness fragment: opening heading (h2/h3) PLUS body content (paragraphs, lists, tables) in one generation step. Never heading-only.
- Match exact counts from the user (e.g. "5 h2s" → exactly 5 sections with type "h2").
- Use type "table" for table sections; label like "Build section: Topic (table)".
- Use type "h3" for H3 subsections nested under the previous H2 only.
- features: use [LIST], [TABLE], [FAQ], [LINK] from harness vocabulary when needed. Add [LINK] when the user wants internal links to other site posts.
- Never invent URLs in labels or briefs. Internal links are resolved from the WordPress post library at generation time.
- Each section needs a unique, specific title (not "Section 1").
- For a service page, titles must name the page topic and focus keyword (city, service). Never generic Overview, Introduction, or Our Services.
- Each H2 is a distinct subtopic for the focus keyword and page title.
- label: short checklist text starting with "Build section: " plus the title (e.g. "Build section: Local SEO on Whyte Ave"). Never use "Write H2" or heading-only labels.
- brief: 1-2 sentences the writer must follow for that section only.
PROMPT;

		$user = "USER REQUEST:\n{$message}\n";
		if ( $title !== '' ) {
			$user .= "POST TITLE: {$title}\n";
		}
		if ( $fk !== '' ) {
			$user .= "FOCUS KEYWORD: {$fk}\n";
		}
		if ( $brief !== '' && $brief !== $message ) {
			$user .= "CONTENT BRIEF:\n{$brief}\n";
		}

		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter( Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL, $system, $user, 2048, 0.25 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$parsed = Neo_Pulse_Wp_Backend_Assist_Ai::parse_json_response( $result );
		if ( null === $parsed || empty( $parsed['sections'] ) || ! is_array( $parsed['sections'] ) ) {
			return new WP_Error( 'neo-pulse_outline', __( 'Could not plan content sections.', 'neo-pulse-wp' ) );
		}

		return $parsed;
	}

	public static function harness_feature_hint_suffix( array $features, string $type ): string {
		$hints = array();
		foreach ( $features as $f ) {
			if ( ! is_string( $f ) ) {
				continue;
			}
			$upper = strtoupper( trim( $f ) );
			if ( str_contains( $upper, 'LIST' ) ) {
				$hints['list'] = true;
			}
			if ( str_contains( $upper, 'FAQ' ) ) {
				$hints['faq'] = true;
			}
			if ( 'table' !== $type && str_contains( $upper, 'TABLE' ) ) {
				$hints['table'] = true;
			}
		}
		if ( empty( $hints ) ) {
			return '';
		}
		$parts = array();
		if ( ! empty( $hints['list'] ) ) {
			$parts[] = 'list';
		}
		if ( ! empty( $hints['table'] ) ) {
			$parts[] = 'table';
		}
		if ( ! empty( $hints['faq'] ) ) {
			$parts[] = 'faq';
		}
		return ' (+' . implode( ', ', $parts ) . ')';
	}
	public static function harness_section_label( string $title, string $type, array $features, string $label = '' ): string {
		if ( $label !== '' ) {
			if ( preg_match( '/^Write H2:\s*/i', $label ) ) {
				$title = trim( (string) preg_replace( '/^Write H2:\s*/i', '', $label ) ) ?: $title;
				$label = '';
			} elseif ( preg_match( '/^Add table:\s*/i', $label ) ) {
				$title = trim( (string) preg_replace( '/^Add table:\s*/i', '', $label ) ) ?: $title;
				$type  = 'table';
				$label = '';
			} else {
				return $label;
			}
		}
		if ( 'table' === $type ) {
			$base = sprintf( __( 'Build section: %s (table)', 'neo-pulse-wp' ), $title );
		} else {
			$base = sprintf( __( 'Build section: %s', 'neo-pulse-wp' ), $title );
		}
		return $base . self::harness_feature_hint_suffix( $features, $type );
	}
	public static function normalize_outline_sections( array $sections ): array {
		$out = array();
		foreach ( $sections as $i => $section ) {
			if ( ! is_array( $section ) ) {
				continue;
			}
			$type  = isset( $section['type'] ) ? sanitize_key( $section['type'] ) : 'h2';
			$title = isset( $section['title'] ) ? sanitize_text_field( $section['title'] ) : 'Section ' . ( $i + 1 );
			$features = array();
			if ( ! empty( $section['features'] ) && is_array( $section['features'] ) ) {
				foreach ( $section['features'] as $f ) {
					if ( is_string( $f ) && trim( $f ) !== '' ) {
						$features[] = trim( $f );
					}
				}
			}
			if ( $type === 'table' && ! in_array( '[TABLE]', $features, true ) ) {
				$features[] = '[TABLE]';
			}
			$label = isset( $section['label'] ) ? sanitize_text_field( $section['label'] ) : '';
			$label = self::harness_section_label( $title, $type, $features, $label );
			$out[] = array(
				'id'       => isset( $section['id'] ) ? sanitize_key( $section['id'] ) : 's' . ( $i + 1 ),
				'type'     => $type,
				'title'    => $title,
				'label'    => $label,
				'brief'    => isset( $section['brief'] ) ? sanitize_textarea_field( $section['brief'] ) : '',
				'features' => $features,
			);
		}
		return $out;
	}
	public static function sections_to_harness_outline( array $sections ): array {
		$outline = array();
		foreach ( $sections as $i => $section ) {
			$is_faq = false;
			foreach ( $section['features'] as $f ) {
				if ( is_string( $f ) && stripos( $f, 'faq' ) !== false ) {
					$is_faq = true;
					break;
				}
			}
			$outline[] = array(
				'index'        => $i,
				'title'        => $section['title'],
				'displayTitle' => $is_faq ? 'Frequently Asked Questions' : $section['title'],
				'description'  => $section['brief'],
				'headingLevel' => ( isset( $section['type'] ) && $section['type'] === 'h3' ) ? 2 : 1,
				'keyword'      => '',
				'isFaq'        => $is_faq,
			);
		}
		return $outline;
	}
	public static function section_to_agent( array $section, int $index ): array {
		$type = isset( $section['type'] ) ? $section['type'] : 'h2';
		return array(
			'step'         => $index + 1,
			'title'        => $section['title'],
			'description'  => isset( $section['brief'] ) ? $section['brief'] : '',
			'headingLevel' => ( $type === 'h3' ) ? 2 : 1,
			'features'     => isset( $section['features'] ) ? $section['features'] : array(),
		);
	}
	public static function generate_section_html( array $section, array $ctx, array $harness_outline, int $index ) {
		$agent = self::section_to_agent( $section, $index );

		$other_titles = array();
		foreach ( $harness_outline as $j => $row ) {
			if ( (int) $j !== $index ) {
				$other_titles[] = isset( $row['displayTitle'] ) ? (string) $row['displayTitle'] : '';
			}
		}

		$flow_title           = isset( $ctx['flowTitle'] ) ? (string) $ctx['flowTitle'] : '';
		$site_name            = isset( $ctx['siteName'] ) ? (string) $ctx['siteName'] : '';
		$needs_internal_links = ! empty( $ctx['needs_internal_links'] );
		$posts_block          = '';
		$has_posts            = false;
		$forbid_all_links     = false;

		if ( $needs_internal_links ) {
			$pool = ! empty( $ctx['linkable_posts_full'] ) && is_array( $ctx['linkable_posts_full'] )
				? $ctx['linkable_posts_full']
				: ( ! empty( $ctx['linkable_posts_all'] ) && is_array( $ctx['linkable_posts_all'] ) ? $ctx['linkable_posts_all'] : array() );
			$exclude_id = ! empty( $ctx['exclude_post_id'] ) ? (int) $ctx['exclude_post_id'] : 0;
			$section_query = trim(
				( isset( $section['title'] ) ? (string) $section['title'] : '' ) . ' '
				. ( isset( $section['brief'] ) ? (string) $section['brief'] : '' ) . ' '
				. ( isset( $ctx['primaryKeyword'] ) ? (string) $ctx['primaryKeyword'] : '' )
			);
			$section_posts = Neo_Pulse_Wp_Harness_Links::grep_linkable_posts( $pool, $section_query, 8, $exclude_id );
			if ( ! empty( $section_posts ) ) {
				$posts_block = Neo_Pulse_Wp_Harness_Prompts::wordpress_posts_block( $section_posts, $site_name );
				$has_posts   = true;
			} else {
				$forbid_all_links = true;
			}
		} else {
			$forbid_all_links = true;
		}

		$system = Neo_Pulse_Wp_Harness_Prompts::harness_system_prompt(
			array(
				'siteName'       => $site_name,
				'siteUrl'        => isset( $ctx['siteUrl'] ) ? (string) $ctx['siteUrl'] : '',
				'primaryKeyword' => isset( $ctx['primaryKeyword'] ) ? (string) $ctx['primaryKeyword'] : '',
				'postsBlock'     => $posts_block,
			)
		);

		$gsc_block = '';
		$post_id_for_gsc = ! empty( $ctx['exclude_post_id'] ) ? (int) $ctx['exclude_post_id'] : 0;
		$gsc_keyword     = isset( $ctx['primaryKeyword'] ) ? (string) $ctx['primaryKeyword'] : '';
		if ( $post_id_for_gsc > 0 ) {
			$gsc_block = Neo_Pulse_Wp_Gsc_Prompt::for_post( $post_id_for_gsc, $gsc_keyword );
		}

		$user = Neo_Pulse_Wp_Harness_Prompts::harness_section_user_prompt(
			array(
				'flowTitle'           => $flow_title,
				'flowPurpose'         => isset( $ctx['flowPurpose'] ) ? (string) $ctx['flowPurpose'] : '',
				'singleSectionPrompt' => Neo_Pulse_Wp_Harness_Prompts::single_section_prompt( $agent, 'html' ),
				'outlineBlock'        => Neo_Pulse_Wp_Harness_Prompts::format_outline_for_prompt( $harness_outline ),
				'otherSectionTitles'  => $other_titles,
				'sectionIndex'        => $index,
				'totalSections'       => count( $harness_outline ),
				'acfBlock'            => '',
				'gscBlock'            => $gsc_block,
				'hasWordPressPosts'   => $has_posts,
				'forbidAllLinks'      => $forbid_all_links,
			)
		);

		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter( Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL, $system, $user, 2048, 0.55 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$html = Neo_Pulse_Wp_Harness_Outline::strip_footer_from_section_html( Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::strip_ai_html_fences( $result ) );
		if ( $html === '' ) {
			return new WP_Error( 'neo-pulse_section_empty', __( 'Section generation returned empty HTML.', 'neo-pulse-wp' ) );
		}

		return $html;
	}
	public static function execute_resolve_internal_links_step( string $workflow_id, int $step_index, array $workflow ): array {
		$outline       = ! empty( $workflow['outline'] ) && is_array( $workflow['outline'] ) ? $workflow['outline'] : array();
		$focus_keyword = ! empty( $workflow['focus_keyword'] ) ? (string) $workflow['focus_keyword'] : '';
		$post_title    = ! empty( $workflow['post_title'] ) ? (string) $workflow['post_title'] : '';
		$message       = ! empty( $workflow['message'] ) ? (string) $workflow['message'] : '';
		$exclude_id    = ! empty( $workflow['last_post_id'] ) ? (int) $workflow['last_post_id'] : 0;

		$all_posts = Neo_Pulse_Wp_Harness_Blueprint::fetch_linkable_posts();
		$query     = Neo_Pulse_Wp_Backend_Assist_Workflow_Builder::build_link_grep_query( $message, $outline, $focus_keyword, $post_title );
		$matched   = Neo_Pulse_Wp_Harness_Links::grep_linkable_posts( $all_posts, $query, 25, $exclude_id );

		$workflow['needs_internal_links'] = true;
		$workflow['linkable_posts']     = $matched;
		$workflow['steps'][ $step_index ]['status'] = 'done';
		$workflow['steps'][ $step_index ]['result'] = array(
			'success' => true,
			'count'   => count( $matched ),
		);
		Neo_Pulse_Wp_Backend_Assist_Workflow::persist_workflow( $workflow_id, $workflow );

		return array(
			'step_index'        => $step_index,
			'status'            => 'done',
			'result'            => $workflow['steps'][ $step_index ]['result'],
			'label'             => $workflow['steps'][ $step_index ]['label'],
			'workflow_complete' => false,
		);
	}
	public static function execute_write_sections_batch_step( string $workflow_id, int $step_index, string $message, array $history, array $workflow ): array {
		$post_id = ! empty( $workflow['last_post_id'] ) ? (int) $workflow['last_post_id'] : 0;
		if ( $post_id === 0 ) {
			$result = array( 'success' => false, 'error' => __( 'Post not created yet.', 'neo-pulse-wp' ) );
			$workflow['steps'][ $step_index ]['status'] = 'error';
			$workflow['steps'][ $step_index ]['result'] = $result;
			Neo_Pulse_Wp_Backend_Assist_Workflow::persist_workflow( $workflow_id, $workflow );
			return array(
				'step_index'        => $step_index,
				'status'            => 'error',
				'result'            => $result,
				'label'             => $workflow['steps'][ $step_index ]['label'],
				'workflow_complete' => true,
				'card'              => Neo_Pulse_Wp_Backend_Assist_Workflow::workflow_failure_card( $workflow, $result, 'write_sections_batch' ),
			);
		}

		$outline = ! empty( $workflow['outline'] ) && is_array( $workflow['outline'] ) ? $workflow['outline'] : array();
		if ( empty( $outline ) ) {
			$result = array( 'success' => false, 'error' => __( 'No content outline found.', 'neo-pulse-wp' ) );
			$workflow['steps'][ $step_index ]['status'] = 'error';
			Neo_Pulse_Wp_Backend_Assist_Workflow::persist_workflow( $workflow_id, $workflow );
			return array(
				'step_index'        => $step_index,
				'status'            => 'error',
				'result'            => $result,
				'workflow_complete' => true,
				'card'              => Neo_Pulse_Wp_Backend_Assist_Workflow::workflow_failure_card( $workflow, $result, 'write_sections_batch' ),
			);
		}

		$post = get_post( $post_id );
		if ( ! $post ) {
			$result = array( 'success' => false, 'error' => __( 'Post not found.', 'neo-pulse-wp' ) );
			return array(
				'step_index'        => $step_index,
				'status'            => 'error',
				'result'            => $result,
				'workflow_complete' => true,
				'card'              => Neo_Pulse_Wp_Backend_Assist_Workflow::workflow_failure_card( $workflow, $result, 'write_sections_batch' ),
			);
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			$result = array( 'success' => false, 'error' => __( 'You do not have permission to edit this post.', 'neo-pulse-wp' ) );
			$workflow['steps'][ $step_index ]['status'] = 'error';
			$workflow['steps'][ $step_index ]['result'] = $result;
			Neo_Pulse_Wp_Backend_Assist_Workflow::persist_workflow( $workflow_id, $workflow );
			return array(
				'step_index'        => $step_index,
				'status'            => 'error',
				'result'            => $result,
				'workflow_complete' => true,
				'card'              => Neo_Pulse_Wp_Backend_Assist_Workflow::workflow_failure_card( $workflow, $result, 'write_sections_batch' ),
			);
		}

		$harness_outline      = self::sections_to_harness_outline( $outline );
		$site_url             = home_url( '/' );
		$needs_internal_links = ! empty( $workflow['needs_internal_links'] );
		$linkable_all         = ( $needs_internal_links && ! empty( $workflow['linkable_posts'] ) && is_array( $workflow['linkable_posts'] ) )
			? $workflow['linkable_posts']
			: array();
		$allowed_urls         = $needs_internal_links
			? Neo_Pulse_Wp_Harness_Links::allowed_url_set( $linkable_all, $site_url )
			: array();

		$ctx = array(
			'siteName'             => get_bloginfo( 'name' ),
			'siteUrl'              => $site_url,
			'primaryKeyword'       => ! empty( $workflow['focus_keyword'] ) ? $workflow['focus_keyword'] : get_post_meta( $post_id, '_neo_pulse_focus_keyword', true ),
			'flowTitle'            => $post->post_title,
			'flowPurpose'          => sprintf(
				'SEO content for keyword: %s',
				! empty( $workflow['focus_keyword'] ) ? $workflow['focus_keyword'] : $post->post_title
			),
			'needs_internal_links' => $needs_internal_links,
			'linkable_posts_all'   => $linkable_all,
			'linkable_posts_full'  => $needs_internal_links ? Neo_Pulse_Wp_Harness_Blueprint::fetch_linkable_posts() : array(),
			'exclude_post_id'      => $post_id,
		);

		$pieces      = array();
		$last_error  = '';
		$total       = count( $outline );

		foreach ( $outline as $i => $section ) {
			$micro_idx = self::find_micro_step_index( $workflow['steps'], $i );
			if ( $micro_idx >= 0 ) {
				$workflow['steps'][ $micro_idx ]['status'] = 'running';
				Neo_Pulse_Wp_Backend_Assist_Workflow::persist_workflow( $workflow_id, $workflow );
			}

			$html = self::generate_section_html( $section, $ctx, $harness_outline, $i );
			if ( is_wp_error( $html ) ) {
				$last_error = $html->get_error_message();
				if ( $micro_idx >= 0 ) {
					$workflow['steps'][ $micro_idx ]['status'] = 'error';
					Neo_Pulse_Wp_Backend_Assist_Workflow::persist_workflow( $workflow_id, $workflow );
				}
				break;
			}

			if ( $needs_internal_links ) {
				$section_query = trim(
					( isset( $section['title'] ) ? (string) $section['title'] : '' ) . ' '
					. ( isset( $section['brief'] ) ? (string) $section['brief'] : '' ) . ' '
					. ( isset( $ctx['primaryKeyword'] ) ? (string) $ctx['primaryKeyword'] : '' )
				);
				$pool          = ! empty( $ctx['linkable_posts_full'] ) ? $ctx['linkable_posts_full'] : $linkable_all;
				$section_posts = Neo_Pulse_Wp_Harness_Links::grep_linkable_posts( $pool, $section_query, 8, $post_id );
				$allowed_urls  = array_merge(
					$allowed_urls,
					Neo_Pulse_Wp_Harness_Links::allowed_url_set( $section_posts, $site_url )
				);
			}

			$pieces[] = $html;
			if ( $micro_idx >= 0 ) {
				$workflow['steps'][ $micro_idx ]['status'] = 'done';
				Neo_Pulse_Wp_Backend_Assist_Workflow::persist_workflow( $workflow_id, $workflow );
			}
		}

		if ( empty( $pieces ) ) {
			$result = array(
				'success' => false,
				'error'   => $last_error !== '' ? $last_error : __( 'No sections were generated.', 'neo-pulse-wp' ),
			);
			$workflow['steps'][ $step_index ]['status'] = 'error';
			$workflow['steps'][ $step_index ]['result'] = $result;
			Neo_Pulse_Wp_Backend_Assist_Workflow::persist_workflow( $workflow_id, $workflow );
			delete_transient( Neo_Pulse_Wp_Backend_Assist_Workflow::workflow_transient_key( $workflow_id ) );
			return array(
				'step_index'        => $step_index,
				'status'            => 'error',
				'label'             => $workflow['steps'][ $step_index ]['label'],
				'result'            => $result,
				'workflow_complete' => true,
				'card'              => Neo_Pulse_Wp_Backend_Assist_Workflow::workflow_failure_card( $workflow, $result, 'write_sections_batch' ),
			);
		}

		$new_content = Neo_Pulse_Wp_Harness_Outline::stitch_sections( $pieces );
		if ( $needs_internal_links ) {
			$new_content = Neo_Pulse_Wp_Harness_Links::strip_unknown_internal_links( $new_content, $allowed_urls, $site_url );
		} else {
			$new_content = Neo_Pulse_Wp_Harness_Links::strip_all_internal_links( $new_content, $site_url );
		}
		// Model output: sanitize like add_content and keep an undo snapshot.
		$new_content = wp_kses_post( $new_content );
		Neo_Pulse_Wp_Backend_Assist_Tools_Wp::snapshot_agent_revision( $post_id );
		$update      = wp_update_post(
			array(
				'ID'           => $post_id,
				'post_content' => $new_content,
			),
			true
		);

		if ( is_wp_error( $update ) ) {
			$result = array( 'success' => false, 'error' => $update->get_error_message() );
			$workflow['steps'][ $step_index ]['status'] = 'error';
			Neo_Pulse_Wp_Backend_Assist_Workflow::persist_workflow( $workflow_id, $workflow );
			delete_transient( Neo_Pulse_Wp_Backend_Assist_Workflow::workflow_transient_key( $workflow_id ) );
			return array(
				'step_index'        => $step_index,
				'status'            => 'error',
				'result'            => $result,
				'workflow_complete' => true,
				'card'              => Neo_Pulse_Wp_Backend_Assist_Workflow::workflow_failure_card( $workflow, $result, 'write_sections_batch' ),
			);
		}

		$result = array(
			'success'    => true,
			'post_id'    => $post_id,
			'title'      => $post->post_title,
			'type'       => $post->post_type,
			'word_count' => str_word_count( wp_strip_all_tags( $new_content ) ),
			'edit_url'   => get_edit_post_link( $post_id, 'raw' ),
			'view_url'   => get_permalink( $post_id ),
		);

		$workflow['steps'][ $step_index ]['status'] = 'done';
		$workflow['steps'][ $step_index ]['result'] = $result;
		$workflow['step_results'][ $step_index ]     = $result;
		$workflow['last_post_id']                    = $post_id;

		$card = Neo_Pulse_Wp_Backend_Assist_Workflow::finalize_workflow_card( $message, $history, $workflow, $result );
		delete_transient( Neo_Pulse_Wp_Backend_Assist_Workflow::workflow_transient_key( $workflow_id ) );

		return array(
			'step_index'        => $step_index,
			'status'            => 'done',
			'label'             => $workflow['steps'][ $step_index ]['label'],
			'result'            => $result,
			'workflow_complete' => true,
			'card'              => $card,
		);
	}
	public static function find_micro_step_index( array $steps, int $section_index ): int {
		foreach ( $steps as $idx => $step ) {
			if ( ! is_array( $step ) ) {
				continue;
			}
			if ( isset( $step['tool'] ) && $step['tool'] === 'micro_section' && isset( $step['section_index'] ) && (int) $step['section_index'] === $section_index ) {
				return (int) $idx;
			}
		}
		return -1;
	}
}
