<?php
/**
 * FAQ detection, table, and schema helpers for Backend Assist content preparation.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep_Trait_Faq {

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
}
