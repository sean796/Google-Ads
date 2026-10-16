<?php
/**
 * Body harness orchestration (plan, preview, apply).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Ai_Body {

	/**
	 * OpenRouter for body harness: wp-config, env, or agency settings only.
	 *
	 * @return string
	 */
	public static function body_openrouter_configured(): bool {
		return Neo_Pulse_Wp_OpenRouter::get_body_api_key() !== '';
	}

	/**
	 * @return true|WP_Error
	 */
	public static function validate_prerequisites( int $post_id ) {
		$reasons = array();
		if ( ! Neo_Pulse_Wp_Ai_Gate::can_preview( $post_id ) ) {
			$status = Neo_Pulse_Wp_Ai_Gate::get_status( $post_id );
			$reasons = isset( $status['reasons'] ) && is_array( $status['reasons'] ) ? $status['reasons'] : array();
		}
		if ( ! self::body_openrouter_configured() ) {
			$reasons[] = __( 'Body optimizer requires an OpenRouter API key in wp-config, environment, or NEO Pulse WP → Settings. Cloud-only sync is not used for body harness.', 'neo-pulse-wp' );
		}
		$brief = Neo_Pulse_Wp_Ai_Context::read_acf_or_meta( $post_id, array( 'seo_research' ) );
		if ( trim( $brief ) === '' || self::is_empty_json_brief( $brief ) ) {
			$reasons[] = __( 'Run SEO research first or paste a research brief before using the body optimizer.', 'neo-pulse-wp' );
		}
		$focus = Neo_Pulse_Wp_Ai_Context::read_focus_keyword( $post_id );
		if ( trim( $focus ) === '' ) {
			$reasons[] = __( 'Set a focus keyword before using the body optimizer.', 'neo-pulse-wp' );
		}
		if ( ! empty( $reasons ) ) {
			return new WP_Error( 'neo-pulse_body_prereq', implode( ' ', $reasons ) );
		}
		return true;
	}

	private static function is_empty_json_brief( string $brief ): bool {
		$trim = trim( $brief );
		if ( $trim === '' || '{}' === $trim || '[]' === $trim ) {
			return true;
		}
		$decoded = json_decode( $trim, true );
		if ( is_array( $decoded ) && empty( $decoded ) ) {
			return true;
		}
		return false;
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	public static function plan( int $post_id ) {
		Neo_Pulse_Wp_OpenRouter::maybe_extend_time_limit();
		$check = self::validate_prerequisites( $post_id );
		if ( is_wp_error( $check ) ) {
			return $check;
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'neo-pulse_post', __( 'Post not found.', 'neo-pulse-wp' ) );
		}

		$urls  = Neo_Pulse_Wp_Ai_Backend::resolve_urls( $post_id );
		$ctx   = self::build_context( $post_id, $post, $urls );
		$built = Neo_Pulse_Wp_Harness_Blueprint::build( $ctx );
		if ( is_wp_error( $built ) ) {
			return $built;
		}

		$blueprint = $built['blueprint'];
		$outline   = Neo_Pulse_Wp_Harness_Outline::from_agents(
			isset( $blueprint['agents'] ) && is_array( $blueprint['agents'] ) ? $blueprint['agents'] : array()
		);
		$sections  = array();
		foreach ( $outline as $row ) {
			$sections[] = array(
				'index'   => (int) $row['index'],
				'title'   => (string) $row['displayTitle'],
				'keyword' => isset( $row['keyword'] ) ? (string) $row['keyword'] : '',
				'status'  => 'waiting',
			);
		}

		$session = array(
			'sessionId'    => wp_generate_uuid4(),
			'postId'       => $post_id,
			'phase'        => 'ready',
			'plannedCount' => count( $sections ),
			'activeIndex'  => -1,
			'blueprint'    => $blueprint,
			'outline'      => $outline,
			'checklist'    => $built['checklist'],
			'sections'     => $sections,
			'ctx'          => $ctx,
		);
		Neo_Pulse_Wp_Harness_Session::save( $post_id, $session );

		$shape = Neo_Pulse_Wp_Harness_Session::public_shape( $session );
		$shape['ok'] = true;
		return $shape;
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	public static function get_session( int $post_id ) {
		$session = Neo_Pulse_Wp_Harness_Session::get( $post_id );
		if ( ! $session ) {
			return array(
				'ok'       => true,
				'hasSession' => false,
				'phase'    => 'idle',
				'sections' => array(),
			);
		}
		$shape = Neo_Pulse_Wp_Harness_Session::public_shape( $session );
		$shape['hasSession'] = true;
		return $shape;
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	public static function preview_section( int $post_id, int $section_index, string $session_id = '' ) {
		Neo_Pulse_Wp_OpenRouter::maybe_extend_time_limit();
		$check = self::validate_prerequisites( $post_id );
		if ( is_wp_error( $check ) ) {
			return $check;
		}

		$session = Neo_Pulse_Wp_Harness_Session::get( $post_id );
		if ( ! $session ) {
			return new WP_Error( 'neo-pulse_body_session', __( 'No body harness session. Run Plan first.', 'neo-pulse-wp' ) );
		}
		if ( $session_id !== '' && isset( $session['sessionId'] ) && (string) $session['sessionId'] !== $session_id ) {
			return new WP_Error( 'neo-pulse_body_session', __( 'Session mismatch. Run Plan again.', 'neo-pulse-wp' ) );
		}

		$session['phase']       = 'generating';
		$session['activeIndex'] = $section_index;
		Neo_Pulse_Wp_Harness_Session::patch_section( $session, $section_index, array( 'status' => 'generating' ) );
		Neo_Pulse_Wp_Harness_Session::save( $post_id, $session );

		$ctx = isset( $session['ctx'] ) && is_array( $session['ctx'] ) ? $session['ctx'] : self::build_context( $post_id, get_post( $post_id ), Neo_Pulse_Wp_Ai_Backend::resolve_urls( $post_id ) );

		$result = Neo_Pulse_Wp_Harness_Runner::preview_section( $session, $section_index, $ctx );
		if ( is_wp_error( $result ) ) {
			Neo_Pulse_Wp_Harness_Session::patch_section( $session, $section_index, array( 'status' => 'error', 'error' => $result->get_error_message() ) );
			$session['phase'] = 'ready';
			Neo_Pulse_Wp_Harness_Session::save( $post_id, $session );
			return $result;
		}

		$post = get_post( $post_id );
		$current_html = '';
		if ( $post instanceof WP_Post ) {
			$current_html = Neo_Pulse_Wp_Content_Sections::extract_section_html( (string) $post->post_content, $result['title'] );
		}

		Neo_Pulse_Wp_Harness_Session::patch_section(
			$session,
			$section_index,
			array(
				'status'    => 'done',
				'html'      => $result['html'],
				'truncated' => ! empty( $result['truncated'] ),
				'error'     => '',
			)
		);
		$session['phase']       = 'ready';
		$session['activeIndex'] = $section_index;
		Neo_Pulse_Wp_Harness_Session::save( $post_id, $session );

		return array(
			'ok'           => true,
			'sectionIndex' => $section_index,
			'title'        => $result['title'],
			'html'         => $result['html'],
			'currentHtml'  => $current_html,
			'truncated'    => ! empty( $result['truncated'] ),
			'session'      => Neo_Pulse_Wp_Harness_Session::public_shape( $session ),
		);
	}

	/**
	 * Server-side apply (classic fallback); block editor applies via client + optional this path.
	 *
	 * @return array<string,mixed>|WP_Error
	 */
	public static function apply_section( int $post_id, int $section_index, string $session_id = '', string $html_override = '', bool $editor_applied = false, string $section_title_override = '' ) {
		if ( ! Neo_Pulse_Wp_Ai_Gate::can_apply( $post_id ) ) {
			return new WP_Error( 'neo-pulse_body_apply', __( 'Apply is not allowed for this post.', 'neo-pulse-wp' ) );
		}

		$session = Neo_Pulse_Wp_Harness_Session::get( $post_id );
		if ( ! $session ) {
			return new WP_Error( 'neo-pulse_body_session', __( 'No body harness session.', 'neo-pulse-wp' ) );
		}
		if ( $session_id !== '' && isset( $session['sessionId'] ) && (string) $session['sessionId'] !== $session_id ) {
			return new WP_Error( 'neo-pulse_body_session', __( 'Session mismatch.', 'neo-pulse-wp' ) );
		}

		$title = trim( $section_title_override );
		$html  = trim( $html_override );
		foreach ( $session['sections'] as $s ) {
			if ( is_array( $s ) && (int) ( $s['index'] ?? -1 ) === $section_index ) {
				if ( $title === '' ) {
					$title = isset( $s['title'] ) ? (string) $s['title'] : '';
				}
				if ( $html === '' && ! empty( $s['html'] ) ) {
					$html = (string) $s['html'];
				}
				break;
			}
		}
		if ( $html === '' ) {
			return new WP_Error( 'neo-pulse_body_apply', __( 'Preview this section before applying.', 'neo-pulse-wp' ) );
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'neo-pulse_post', __( 'Post not found.', 'neo-pulse-wp' ) );
		}

		$new_content = Neo_Pulse_Wp_Content_Sections::replace_section_html( (string) $post->post_content, $title, $html );
		$new_content = wp_kses_post( $new_content );

		$updated = wp_update_post(
			array(
				'ID'           => $post_id,
				'post_content' => $new_content,
			),
			true
		);
		if ( is_wp_error( $updated ) ) {
			return $updated;
		}

		Neo_Pulse_Wp_Ai_Apply::stamp_date_modifier( $post_id );

		Neo_Pulse_Wp_Harness_Session::patch_section(
			$session,
			$section_index,
			array(
				'status'  => 'applied',
				'applied' => true,
			)
		);
		Neo_Pulse_Wp_Harness_Session::save( $post_id, $session );

		return array(
			'ok'           => true,
			'sectionIndex' => $section_index,
			'session'      => Neo_Pulse_Wp_Harness_Session::public_shape( $session ),
		);
	}

	public static function clear_session( int $post_id ): array {
		Neo_Pulse_Wp_Harness_Session::delete( $post_id );
		return array( 'ok' => true );
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	public static function get_posts_inventory( int $exclude_post_id = 0 ): array {
		$posts = Neo_Pulse_Wp_Harness_Blueprint::fetch_linkable_posts();
		$out   = array();
		foreach ( $posts as $p ) {
			if ( $exclude_post_id > 0 && isset( $p['id'] ) && (int) $p['id'] === $exclude_post_id ) {
				continue;
			}
			$out[] = array(
				'id'    => isset( $p['id'] ) ? (int) $p['id'] : 0,
				'title' => isset( $p['title'] ) ? (string) $p['title'] : '',
				'url'   => isset( $p['link'] ) ? (string) $p['link'] : '',
			);
		}
		return array( 'ok' => true, 'posts' => $out );
	}

	/**
	 * AI-powered link suggestion: returns top 5 best-match posts for highlighted text.
	 *
	 * @return array<string,mixed>|WP_Error
	 */
	public static function suggest_link( int $post_id, string $selected_text, string $context = '' ) {
		if ( ! self::body_openrouter_configured() ) {
			return new WP_Error( 'neo-pulse_body_key', __( 'OpenRouter API key required.', 'neo-pulse-wp' ) );
		}

		$selected_text = trim( $selected_text );
		if ( $selected_text === '' ) {
			return new WP_Error( 'neo-pulse_body_link', __( 'No text selected.', 'neo-pulse-wp' ) );
		}

		$posts = Neo_Pulse_Wp_Harness_Blueprint::fetch_linkable_posts();
		$inventory = array();
		foreach ( $posts as $p ) {
			if ( isset( $p['id'] ) && (int) $p['id'] === $post_id ) {
				continue;
			}
			$inventory[] = $p;
		}

		if ( empty( $inventory ) ) {
			return array( 'ok' => true, 'suggestions' => array(), 'reason' => 'No posts in inventory.' );
		}

		$lines = array();
		foreach ( $inventory as $i => $p ) {
			$title   = isset( $p['title'] ) ? (string) $p['title'] : '';
			$excerpt = isset( $p['excerpt'] ) ? (string) $p['excerpt'] : '';
			$entry   = ( $i + 1 ) . '. "' . $title . '"';
			if ( $excerpt !== '' ) {
				$entry .= ' — ' . mb_substr( $excerpt, 0, 120 );
			}
			$lines[] = $entry;
		}
		$list = implode( "\n", $lines );

		$system = "You are an internal-linking assistant. The user has highlighted text in a blog post and wants to link it to the most relevant pages on their site.\n"
			. "You will receive the highlighted text, optional surrounding context, and a numbered inventory of pages.\n"
			. "Return ONLY a comma-separated list of up to 5 page numbers, ranked from most to least relevant.\n"
			. "Example: 3,7,12,1,5\n"
			. "If absolutely no pages are relevant, return 0. Do not explain. Just the numbers.";

		$user = "Highlighted text: \"{$selected_text}\"\n";
		if ( trim( $context ) !== '' ) {
			$user .= "Surrounding context: \"" . mb_substr( trim( $context ), 0, 500 ) . "\"\n";
		}
		$user .= "\nAvailable pages:\n{$list}";

		$result = Neo_Pulse_Wp_OpenRouter::complete_chat( $system, $user, 30, 0.0 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$answer  = trim( (string) $result['content'] );
		$nums    = array_filter( array_map( 'intval', preg_split( '/[,\s]+/', $answer ) ) );
		$seen    = array();
		$suggestions = array();

		foreach ( $nums as $pick ) {
			if ( $pick < 1 || $pick > count( $inventory ) || isset( $seen[ $pick ] ) ) {
				continue;
			}
			$seen[ $pick ] = true;
			$matched = $inventory[ $pick - 1 ];
			$suggestions[] = array(
				'title' => isset( $matched['title'] ) ? (string) $matched['title'] : '',
				'url'   => isset( $matched['link'] ) ? (string) $matched['link'] : '',
			);
			if ( count( $suggestions ) >= 5 ) {
				break;
			}
		}

		return array( 'ok' => true, 'suggestions' => $suggestions );
	}

	/**
	 * AI-powered element generation: returns HTML for a table, list, or custom element.
	 *
	 * @return array<string,mixed>|WP_Error
	 */
	public static function generate_element( int $post_id, string $section_title, string $section_html, string $element_type, string $custom_prompt = '' ) {
		if ( ! self::body_openrouter_configured() ) {
			return new WP_Error( 'neo-pulse_body_key', __( 'OpenRouter API key required.', 'neo-pulse-wp' ) );
		}

		$type_labels = array(
			'table'    => 'an HTML table',
			'bullet'   => 'an HTML unordered (bullet) list',
			'numbered' => 'an HTML ordered (numbered) list',
			'custom'   => 'the requested HTML element',
		);

		if ( ! isset( $type_labels[ $element_type ] ) ) {
			return new WP_Error( 'neo-pulse_element_type', __( 'Invalid element type.', 'neo-pulse-wp' ) );
		}

		$system = "You are a content formatting assistant for a blog post.\n"
			. "Return ONLY raw HTML for " . $type_labels[ $element_type ] . ".\n"
			. "Do NOT wrap in code fences, markdown, or extra explanation.\n"
			. "The content must be relevant to the section topic and fit naturally into the existing text.\n"
			. "Use semantic HTML tags only (table, thead, tbody, tr, th, td, ul, ol, li, p, strong, em).";

		$context = mb_substr( wp_strip_all_tags( $section_html ), 0, 800 );
		$user = "Section heading: \"{$section_title}\"\n"
			. "Existing content (excerpt): \"{$context}\"\n\n"
			. "Generate " . $type_labels[ $element_type ] . " that adds value to this section.";

		if ( $element_type === 'custom' && trim( $custom_prompt ) !== '' ) {
			$user .= "\n\nUser instruction: " . mb_substr( trim( $custom_prompt ), 0, 500 );
		}

		$result = Neo_Pulse_Wp_OpenRouter::complete_chat( $system, $user, 1024, 0.7 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$html = trim( (string) $result['content'] );
		$html = preg_replace( '/^```(?:html)?\s*/i', '', $html );
		$html = preg_replace( '/\s*```$/', '', $html );

		return array( 'ok' => true, 'html' => $html );
	}

	/**
	 * @param WP_Post                              $post
	 * @param array{siteUrl:string,pageUrl:string,companyName:string} $urls
	 * @return array<string,mixed>
	 */
	private static function build_context( int $post_id, $post, array $urls ): array {
		$ctx = Neo_Pulse_Wp_Ai_Context::read_context( $post_id );
		$posts = Neo_Pulse_Wp_Harness_Blueprint::fetch_linkable_posts();
		$site_name = $urls['companyName'] !== '' ? $urls['companyName'] : get_bloginfo( 'name' );
		$gsc_json  = '';
		$gsc = Neo_Pulse_Wp_Ai_Gsc::get_suggestions( $post_id, $ctx['focusKeyword'] );
		if ( is_array( $gsc ) && ! empty( $gsc['queries'] ) && is_array( $gsc['queries'] ) ) {
			$gsc_json = wp_json_encode(
				array(
					'gsc_keywords_for_url' => array_slice( $gsc['queries'], 0, 40 ),
				)
			);
		}

		return array(
			'title'              => $ctx['title'],
			'focusKeyword'       => $ctx['focusKeyword'],
			'seoResearch'        => $ctx['seoResearch'],
			'url'                => $urls['pageUrl'] !== '' ? $urls['pageUrl'] : $ctx['url'],
			'siteName'           => $site_name,
			'siteUrl'            => $urls['siteUrl'] !== '' ? $urls['siteUrl'] : home_url( '/' ),
			'posts'              => $posts,
			'postsBlock'         => Neo_Pulse_Wp_Harness_Prompts::wordpress_posts_block( $posts, $site_name ),
			'gscKeywordsContext' => is_string( $gsc_json ) ? $gsc_json : '',
			'flowTitle'          => $ctx['title'],
		);
	}
}
