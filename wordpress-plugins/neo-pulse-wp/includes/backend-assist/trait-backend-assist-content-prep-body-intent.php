<?php
/**
 * Body edit intent detection for Backend Assist content preparation.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep_Trait_Body_Intent {

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
}
