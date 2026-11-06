<?php
/**
 * Post body HTML generation for Backend Assist content preparation.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep_Trait_Body_Gen {

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
}
