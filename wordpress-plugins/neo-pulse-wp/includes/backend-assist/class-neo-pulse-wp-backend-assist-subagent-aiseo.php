<?php
/**
 * Backend Assist — AISEO sub-agent harness (meta / ACF field agents).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Subagent_Aiseo {

	/** @var array<string, string>|null Test stub keyed by agent creates field */
	public static $test_outputs = null;

	/**
	 * @return array<string, mixed>
	 */
	public static function build_context( int $post_id ): array {
		$ctx = array(
			'post_id'   => $post_id,
			'is_page'   => false,
			'post_title'=> '',
			'slug'      => '',
			'focus_keyword' => '',
			'seo_title' => '',
			'meta_description' => '',
			'seo_research' => '',
			'page_url'  => '',
			'body_excerpt' => '',
		);

		if ( $post_id < 1 ) {
			return $ctx;
		}

		$post = get_post( $post_id );
		if ( $post instanceof WP_Post ) {
			$ctx['is_page']    = $post->post_type === 'page';
			$ctx['post_title'] = Neo_Pulse_Wp_Display_Text::decode( (string) $post->post_title );
			$ctx['slug']       = (string) $post->post_name;
			$body              = trim( wp_strip_all_tags( (string) $post->post_content ) );
			if ( strlen( $body ) > 2000 ) {
				$body = substr( $body, 0, 2000 ) . '...';
			}
			$ctx['body_excerpt'] = $body;
		}

		if ( class_exists( 'Neo_Pulse_Wp_Ai_Context' ) ) {
			$hub = Neo_Pulse_Wp_Ai_Context::meta_hub_values( $post_id );
			$ctx['focus_keyword']    = trim( (string) ( $hub['focusKeyword'] ?? '' ) );
			$ctx['seo_title']        = trim( Neo_Pulse_Wp_Ai_Context::read_seo_title( $post_id ) );
			$ctx['meta_description'] = trim( Neo_Pulse_Wp_Ai_Context::read_meta_description( $post_id ) );
			$ctx['seo_research']     = trim( (string) ( $hub['seoResearch'] ?? '' ) );
			$ctx['page_url']         = trim( (string) ( $hub['pageUrl'] ?? '' ) );
		}

		if ( $ctx['page_url'] === '' && function_exists( 'get_permalink' ) ) {
			$link = get_permalink( $post_id );
			$ctx['page_url'] = is_string( $link ) ? $link : '';
		}

		if ( $ctx['focus_keyword'] === '' && class_exists( 'Neo_Pulse_Wp_Ai_Seo_Limits' ) ) {
			$inferred = Neo_Pulse_Wp_Ai_Seo_Limits::infer_focus_keyword_from_post( $post_id );
			if ( $inferred !== '' ) {
				$ctx['focus_keyword'] = $inferred;
			}
		}

		return $ctx;
	}

	public static function rewrite_intent_block( string $message ): string {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return '';
		}
		if ( ! preg_match( '/\b(refresh|update|rewrite|regenerate|redo|new|change|improve|optimize)\b/i', $lower ) ) {
			return '';
		}

		return "REWRITE INTENT (mandatory):\n"
			. "- The user wants materially better SEO copy for search CTR, not a paraphrase of post_title or current meta.\n"
			. "- Do NOT copy the WordPress post_title verbatim into seoTitle or metaDescription.\n"
			. "- Lead seoTitle with focus keyword near the start. Meta description must hook searchers with a benefit or question.\n\n";
	}

	public static function normalize_for_similarity( string $text ): string {
		$text = strtolower( trim( $text ) );
		$text = preg_replace( '/[\s|—–\-]+/u', ' ', $text );
		$text = preg_replace( '/[^\p{L}\p{N}\s]/u', '', $text );
		return trim( preg_replace( '/\s+/', ' ', $text ) );
	}

	public static function copy_too_similar( string $a, string $b, float $threshold = 0.85 ): bool {
		$a = self::normalize_for_similarity( $a );
		$b = self::normalize_for_similarity( $b );
		if ( $a === '' || $b === '' ) {
			return false;
		}
		$pct = 0.0;
		similar_text( $a, $b, $pct );
		return ( $pct / 100 ) >= $threshold;
	}

	/**
	 * @param array<string, mixed>           $ctx
	 * @param array<int, array<string, mixed>> $history
	 * @param array<string, mixed>             $prior
	 * @return array{artifact: string, field: string}|WP_Error
	 */
	public static function run_agent( string $agent_id, string $message, array $history, array $ctx, array $prior = array() ) {
		switch ( $agent_id ) {
			case 'seo_title':
				return self::run_seo_title( $message, $history, $ctx );
			case 'meta_description':
				$title = trim( (string) ( $prior['seoTitle'] ?? '' ) );
				return self::run_meta_description( $message, $history, $ctx, $title );
			case 'focus_keyword':
				return self::run_focus_keyword( $message, $history, $ctx );
			case 'faq_schema':
				return self::run_faq_schema( $message, $history, $ctx );
			default:
				return new WP_Error( 'neo-pulse_agent_unknown', __( 'Unknown AISEO agent.', 'neo-pulse-wp' ) );
		}
	}

	/**
	 * @param array<string, mixed>           $ctx
	 * @param array<int, array<string, mixed>> $history
	 * @return array{artifact: string, field: string}|WP_Error
	 */
	public static function run_seo_title( string $message, array $history, array $ctx, string $retry_note = '' ) {
		$post_id = (int) ( $ctx['post_id'] ?? 0 );
		if ( is_array( self::$test_outputs ) && isset( self::$test_outputs['seoTitle'] ) ) {
			$validated = self::validate_seo_title( $post_id, (string) self::$test_outputs['seoTitle'], $ctx, $message );
			return is_wp_error( $validated )
				? $validated
				: array( 'artifact' => $validated, 'field' => 'seoTitle' );
		}

		$constraints = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::extract_meta_copy_constraints( $message );
		$is_page     = ! empty( $ctx['is_page'] );
		$system      = 'You are an expert SEO specialist writing ONE NEO Pulse redirect SEO title for a WordPress '
			. ( $is_page ? 'page' : 'blog post' ) . ".\n"
			. "Output ONLY valid JSON: {\"seoTitle\":\"...\"}\n\n"
			. "RULES:\n"
			. "- MAXIMUM 60 characters (target 50-55). Count before returning.\n"
			. "- Place focus keyword near the BEGINNING (first few words).\n"
			. "- Compelling and click-worthy for SERPs. Do NOT prepend site or brand name.\n"
			. "- MUST differ materially from post_title and current seo_title in context.\n"
			. "- No markdown fences. No extra JSON keys.\n";

		$user = self::build_user_prompt( $message, $history, $ctx, $constraints, $retry_note );
		$result = self::complete_json( $system, $user, 512, 0.4 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$title = trim( (string) ( $result['seoTitle'] ?? '' ) );
		if ( $title === '' ) {
			return new WP_Error( 'neo-pulse_meta_title_parse', __( 'SEO title generation returned invalid JSON.', 'neo-pulse-wp' ) );
		}

		$validated = self::validate_seo_title( $post_id, $title, $ctx, $message, $constraints );
		if ( is_wp_error( $validated ) && $retry_note === '' ) {
			$note = $validated->get_error_message();
			return self::run_seo_title( $message, $history, $ctx, 'RETRY NOTE: ' . $note );
		}
		if ( is_wp_error( $validated ) ) {
			return $validated;
		}

		return array( 'artifact' => $validated, 'field' => 'seoTitle' );
	}

	/**
	 * @param array<string, mixed>           $ctx
	 * @param array<int, array<string, mixed>> $history
	 * @return array{artifact: string, field: string}|WP_Error
	 */
	public static function run_meta_description( string $message, array $history, array $ctx, string $seo_title, string $retry_note = '' ) {
		$post_id = (int) ( $ctx['post_id'] ?? 0 );
		if ( is_array( self::$test_outputs ) && isset( self::$test_outputs['metaDescription'] ) ) {
			$validated = self::validate_meta_description( $post_id, (string) self::$test_outputs['metaDescription'], $ctx, $message );
			return is_wp_error( $validated )
				? $validated
				: array( 'artifact' => $validated, 'field' => 'metaDescription' );
		}

		$constraints = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::extract_meta_copy_constraints( $message );
		$fk          = trim( (string) ( $ctx['focus_keyword'] ?? '' ) );
		$is_page     = ! empty( $ctx['is_page'] );
		$system      = 'You are an expert SEO specialist writing ONE meta description for a WordPress '
			. ( $is_page ? 'page' : 'blog post' ) . ".\n"
			. "Output ONLY valid JSON: {\"metaDescription\":\"...\"}\n\n"
			. "RULES:\n"
			. "- MAXIMUM 160 characters, target 150-160. Count before returning.\n"
			. ( $fk !== '' ? "- MUST include focus keyword \"{$fk}\" clearly.\n" : '' )
			. ( $is_page
				? "- You may reference the post title briefly if needed within 160 chars.\n"
				: "- Do NOT lead with or repeat the post_title. Start with a question hook or benefit statement.\n" )
			. "- Distinct from current meta_description. Subtle call to action.\n"
			. "- No markdown fences. No extra JSON keys.\n";

		$user = self::build_user_prompt( $message, $history, $ctx, $constraints, $retry_note );
		if ( $seo_title !== '' ) {
			$user .= "\nGENERATED SEO TITLE:\n{$seo_title}\n";
		}

		$result = self::complete_json( $system, $user, 768, 0.4 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$desc = trim( (string) ( $result['metaDescription'] ?? '' ) );
		if ( $desc === '' ) {
			return new WP_Error( 'neo-pulse_meta_desc_parse', __( 'Meta description generation returned invalid JSON.', 'neo-pulse-wp' ) );
		}

		$validated = self::validate_meta_description( $post_id, $desc, $ctx, $message, $constraints );
		if ( is_wp_error( $validated ) && $retry_note === '' ) {
			$note = $validated->get_error_message();
			return self::run_meta_description( $message, $history, $ctx, $seo_title, 'RETRY NOTE: ' . $note );
		}
		if ( is_wp_error( $validated ) ) {
			return $validated;
		}

		return array( 'artifact' => $validated, 'field' => 'metaDescription' );
	}

	/**
	 * @param array<string, mixed>           $ctx
	 * @param array<int, array<string, mixed>> $history
	 * @return array{artifact: string, field: string}|WP_Error
	 */
	public static function run_focus_keyword( string $message, array $history, array $ctx ) {
		if ( is_array( self::$test_outputs ) && isset( self::$test_outputs['focusKeyword'] ) ) {
			$kw = trim( sanitize_text_field( (string) self::$test_outputs['focusKeyword'] ) );
			return $kw === ''
				? new WP_Error( 'neo-pulse_focus_kw_empty', __( 'Focus keyword generation returned empty copy.', 'neo-pulse-wp' ) )
				: array( 'artifact' => $kw, 'field' => 'focusKeyword' );
		}

		$system = <<<'PROMPT'
You infer ONE focus keyword phrase for a WordPress post. Output ONLY valid JSON:
{"focusKeyword":"..."}
Rules:
- Lowercase phrase style (e.g. "window covering ideas").
- Grounded in post topic and user request.
- 2-6 words. No quotes in value.
PROMPT;

		$user = self::build_user_prompt( $message, $history, $ctx, array(), '' );
		$result = self::complete_json( $system, $user, 256, 0.3 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$kw = trim( sanitize_text_field( (string) ( $result['focusKeyword'] ?? '' ) ) );
		if ( $kw === '' || Neo_Pulse_Wp_Ai_Seo_Limits::is_placeholder_copy( $kw ) ) {
			return new WP_Error( 'neo-pulse_focus_kw_empty', __( 'Focus keyword generation returned empty copy.', 'neo-pulse-wp' ) );
		}

		return array( 'artifact' => $kw, 'field' => 'focusKeyword' );
	}

	/**
	 * @param array<string, mixed>           $ctx
	 * @param array<int, array<string, mixed>> $history
	 * @return array{artifact: string, field: string}|WP_Error
	 */
	public static function run_faq_schema( string $message, array $history, array $ctx ) {
		$post_id = (int) ( $ctx['post_id'] ?? 0 );
		$entries = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::generate_faq_qa_pairs( $post_id, $message, $history );
		if ( is_wp_error( $entries ) ) {
			return $entries;
		}

		$schema = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::faq_entries_to_schema_json( $entries );
		if ( $schema === '' ) {
			return new WP_Error( 'neo-pulse_faq_schema', __( 'FAQ schema generation failed.', 'neo-pulse-wp' ) );
		}

		return array( 'artifact' => $schema, 'field' => 'faq' );
	}

	/**
	 * @param array{requires_em_dash?: bool, min_exclamations?: int} $constraints
	 * @param array<string, mixed>                                  $ctx
	 * @param array<int, array<string, mixed>>                      $history
	 */
	private static function build_user_prompt( string $message, array $history, array $ctx, array $constraints, string $retry_note ): string {
		$user  = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::build_planner_history_block( $history );
		$user .= self::rewrite_intent_block( $message );
		if ( $retry_note !== '' ) {
			$user .= $retry_note . "\n\n";
		}
		$user .= "USER REQUEST:\n{$message}\n\n";
		$user .= Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::build_post_context_for_plan( (int) ( $ctx['post_id'] ?? 0 ) );

		$fk = trim( (string) ( $ctx['focus_keyword'] ?? '' ) );
		if ( $fk !== '' ) {
			$user .= "FOCUS KEYWORD: {$fk}\n";
		}

		$brief = trim( (string) ( $ctx['seo_research'] ?? '' ) );
		if ( $brief !== '' ) {
			if ( strlen( $brief ) > 4000 ) {
				$brief = substr( $brief, 0, 4000 ) . '...';
			}
			$user .= "\nSEO CONTENT BRIEF (parse for intent; do not copy verbatim into output):\n{$brief}\n";
		}

		if ( class_exists( 'Neo_Pulse_Wp_Gsc_Prompt' ) && ! empty( $ctx['post_id'] ) ) {
			$gsc = Neo_Pulse_Wp_Gsc_Prompt::for_post( (int) $ctx['post_id'], $fk );
			if ( $gsc !== '' ) {
				$user .= "\n{$gsc}\n";
			}
		}

		$constraint_block = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::meta_copy_constraints_prompt_block( $constraints, $message );
		if ( $constraint_block !== '' ) {
			$user .= "\n{$constraint_block}";
		}

		return $user;
	}

	/**
	 * @return array<string, mixed>|WP_Error
	 */
	private static function complete_json( string $system, string $user, int $max_tokens, float $temperature ) {
		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter(
			Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL,
			$system,
			$user,
			$max_tokens,
			$temperature
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$parsed = Neo_Pulse_Wp_Backend_Assist_Ai::parse_json_response( $result );
		return is_array( $parsed ) ? $parsed : new WP_Error( 'neo-pulse_agent_json', __( 'Agent returned invalid JSON.', 'neo-pulse-wp' ) );
	}

	/**
	 * @param array<string, mixed>                                  $ctx
	 * @param array{requires_em_dash?: bool, min_exclamations?: int} $constraints
	 * @return string|WP_Error
	 */
	public static function validate_seo_title( int $post_id, string $title, array $ctx, string $message = '', array $constraints = array() ) {
		if ( $message !== '' && $constraints === array() ) {
			$constraints = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::extract_meta_copy_constraints( $message );
		}

		$title = Neo_Pulse_Wp_Ai_Seo_Limits::normalize_title( trim( sanitize_text_field( $title ) ) );
		if ( $title === '' || Neo_Pulse_Wp_Ai_Seo_Limits::is_placeholder_copy( $title ) ) {
			return new WP_Error( 'neo-pulse_meta_title_empty', __( 'SEO title generation returned empty or placeholder copy.', 'neo-pulse-wp' ) );
		}

		$post_title = trim( (string) ( $ctx['post_title'] ?? '' ) );
		$current    = trim( (string) ( $ctx['seo_title'] ?? '' ) );
		if ( $current !== '' && strcasecmp( $current, $title ) === 0 ) {
			return new WP_Error( 'neo-pulse_meta_title_unchanged', __( 'SEO title must differ from the current saved title.', 'neo-pulse-wp' ) );
		}
		if ( $post_title !== '' && self::copy_too_similar( $title, $post_title ) ) {
			return new WP_Error( 'neo-pulse_meta_title_paraphrase', __( 'SEO title is too similar to the post title. Write distinct SERP copy with keyword near the start.', 'neo-pulse-wp' ) );
		}

		if ( $constraints !== array() && ! Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::meta_copy_meets_constraints( $title, $constraints ) ) {
			return new WP_Error( 'neo-pulse_meta_title_constraints', __( 'SEO title did not meet formatting constraints.', 'neo-pulse-wp' ) );
		}

		return $title;
	}

	/**
	 * @param array<string, mixed>                                  $ctx
	 * @param array{requires_em_dash?: bool, min_exclamations?: int} $constraints
	 * @return string|WP_Error
	 */
	public static function validate_meta_description( int $post_id, string $desc, array $ctx, string $message = '', array $constraints = array() ) {
		if ( $message !== '' && $constraints === array() ) {
			$constraints = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::extract_meta_copy_constraints( $message );
		}

		$fk   = trim( (string) ( $ctx['focus_keyword'] ?? '' ) );
		$desc = Neo_Pulse_Wp_Ai_Seo_Limits::normalize_description( trim( sanitize_textarea_field( $desc ) ), $fk );
		if ( $desc === '' || Neo_Pulse_Wp_Ai_Seo_Limits::is_placeholder_copy( $desc ) ) {
			return new WP_Error( 'neo-pulse_meta_desc_empty', __( 'Meta description generation returned empty or placeholder copy.', 'neo-pulse-wp' ) );
		}

		$post_title = trim( (string) ( $ctx['post_title'] ?? '' ) );
		$current    = trim( (string) ( $ctx['meta_description'] ?? '' ) );
		if ( $current !== '' && self::copy_too_similar( $desc, $current ) ) {
			return new WP_Error( 'neo-pulse_meta_desc_unchanged', __( 'Meta description must differ materially from the current saved description.', 'neo-pulse-wp' ) );
		}
		if ( $post_title !== '' && empty( $ctx['is_page'] ) && self::copy_too_similar( $desc, $post_title ) ) {
			return new WP_Error( 'neo-pulse_meta_desc_paraphrase', __( 'Meta description is too similar to the post title.', 'neo-pulse-wp' ) );
		}

		if ( ! Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::meta_copy_meets_constraints( $desc, $constraints ) ) {
			return new WP_Error( 'neo-pulse_meta_desc_constraints', __( 'Meta description did not meet formatting constraints.', 'neo-pulse-wp' ) );
		}

		return $desc;
	}
}
