<?php
/**
 * Secretary gate and Phase A classification helpers.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Agents_Trait_GateClassify {

	/**
	 * Secretary gate: brief ack or deny before content lookup (stream + run paths).
	 *
	 * @param array<string,mixed> $training Assistant name + tone settings.
	 * @param array<int,array<string,mixed>> $history
	 * @param array<string,mixed> $settings Chat settings (for site subject inventory).
	 * @return array{action:string,text:string}|WP_Error action is continue|deny
	 */
	public static function phase_ack( string $message, string $site_name, array $training = array(), array $history = array(), array $settings = array() ) {
		$assistant = isset( $training['assistant_name'] ) && $training['assistant_name'] !== ''
			? (string) $training['assistant_name']
			: 'Pulse Assist';

		$greeting_style = isset( $training['greeting_style'] ) ? (string) $training['greeting_style'] : 'friendly';
		$tone_map       = array(
			'professional' => 'Warm but polished, like a receptionist at a professional office.',
			'friendly'     => 'Casual and approachable, like a helpful teammate in chat.',
			'casual'       => 'Relaxed and conversational, like texting a knowledgeable friend.',
		);
		$tone = isset( $tone_map[ $greeting_style ] ) ? $tone_map[ $greeting_style ] : $tone_map['friendly'];

		$subjects_block = Neo_Pulse_Wp_Chat_Rag::build_gate_subjects_block( $settings );
		$subjects_section = $subjects_block !== ''
			? "\n\nSITE SUBJECTS (published pages and posts on this website — all are in scope):\n{$subjects_block}\n"
			: '';

		$recent_user = array();
		foreach ( array_slice( $history, -4 ) as $entry ) {
			if ( ! is_array( $entry ) || ( $entry['role'] ?? '' ) !== 'user' ) {
				continue;
			}
			$content = trim( (string) ( $entry['content'] ?? '' ) );
			if ( $content !== '' ) {
				$recent_user[] = $content;
			}
		}
		$context_block = '';
		if ( ! empty( $recent_user ) ) {
			$context_block = "Recent visitor messages:\n- " . implode( "\n- ", $recent_user ) . "\n";
		}

		$prior_chips = Neo_Pulse_Wp_Chat_History::collect_seen_topics( $history );
		if ( ! empty( $prior_chips ) ) {
			$context_block .= "Suggestion chips already shown in this chat (always in scope if the visitor clicks one):\n- "
				. implode( "\n- ", array_slice( $prior_chips, 0, 12 ) ) . "\n";
		}

		$system = <<<PROMPT
You are {$assistant} at {$site_name}.
The visitor just sent a chat message. Output ONLY valid JSON:
{"action":"continue","text":"..."}
or
{"action":"deny","text":"..."}

Tone: {$tone}

Use "deny" ONLY for illegal, harmful, violent, explicit, or bad-faith troll messages with no genuine question.

Use "continue" for everything else. Be permissive: questions about {$site_name}, this website's published pages and posts, the current page (including summarize-this-page requests), services, blog, locations, booking, pricing, or any topic listed in SITE SUBJECTS must "continue". Do not assume a product vertical. Do not deny a message because it is unrelated to a brand or industry.

When the visitor clicks a suggestion chip or asks about a blog post title from this site, always "continue" even if the wording sounds broad or unrelated at first glance.

If the message matches or resembles any SITE SUBJECT title or slug, always "continue".

When unsure, choose "continue".{$subjects_section}
For "continue": "text" is 6-12 words acknowledging what the visitor asked about. Mirror their request. Do not answer the question. Do not say you are looking anything up.

For "deny": "text" is 6-12 words politely refusing. Do not echo harmful content.

Output only JSON. No markdown fences. No emoji.
PROMPT;

		$user = trim( "Visitor message: \"{$message}\"\n{$context_block}" );
		if ( null !== Neo_Pulse_Wp_Chat_Links::resolve_lead_action( $message, Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings ) ) ) {
			$user .= "\nVisitor intent: connect with the business (contact, booking, pricing, service-area coverage, callback/call-me, or speak with a person). Acknowledge that intent directly.\n";
		}
		if ( Neo_Pulse_Wp_Chat_Links::is_callback_request( $message ) ) {
			$user .= "\nVisitor asked to be called. Acknowledge their issue; do not offer to call them or ask for a phone number.\n";
		}

		$result = self::call_openrouter( self::FAST_MODEL, $system, $user, self::ACK_MAX_TOKENS, 0.2 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		return self::normalize_gate_response( $result );
	}

	/**
	 * Card for denied secretary gate (no RAG / Phase B).
	 *
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<string,mixed>
	 */
	public static function build_denial_card( string $ack_text, string $user_message, string $site_name, array $site_index, array $history = array() ): array {
		$title = trim( $ack_text ) !== '' ? trim( $ack_text ) : 'I cannot help with that.';
		$body  = 'I cannot help with that request.';

		$card = array(
			'type'       => 'answer',
			'title'      => $title,
			'body'       => $body,
			'links'      => array(),
			'confidence' => 'high',
		);

		$classification = array(
			'intent'       => 'question',
			'search_terms' => array(),
		);

		$seen_urls   = Neo_Pulse_Wp_Chat_History::collect_seen_urls( $history );
		$seen_topics = Neo_Pulse_Wp_Chat_History::collect_seen_topics( $history );

		return Neo_Pulse_Wp_Chat_Links::attach_to_card( $card, $user_message, $body, array(), $classification, $site_index, $seen_urls, $seen_topics );
	}

	/**
	 * @return array{action:string,text:string}
	 */
	private static function normalize_gate_response( string $raw ): array {
		$parsed = self::parse_json_response( $raw );
		if ( is_array( $parsed ) && isset( $parsed['action'], $parsed['text'] ) ) {
			$action = (string) $parsed['action'] === 'deny' ? 'deny' : 'continue';
			$text   = self::sanitize_ack_text( (string) $parsed['text'] );
			if ( $text !== '' ) {
				return array(
					'action' => $action,
					'text'   => $text,
				);
			}
		}

		$text = self::sanitize_ack_text( $raw );
		return array(
			'action' => 'continue',
			'text'   => $text,
		);
	}

	/**
	 * Trim model ack output to a single human line.
	 */
	private static function sanitize_ack_text( string $text ): string {
		$text = trim( $text );
		$text = trim( $text, "\"'“”‘’" );
		$text = preg_replace( '/\s+/', ' ', $text );
		if ( $text === '' ) {
			return '';
		}
		if ( ! preg_match( '/[.!?]$/', $text ) ) {
			$text .= '.';
		}
		return $text;
	}

	/**
	 * Synthesize Phase A from high-confidence keyword retrieval (skip LLM classify).
	 *
	 * @param array<int,array<string,mixed>> $retrieved
	 * @return array|null
	 */
	public static function synthesize_classification_from_retrieve( string $message, array $retrieved ): ?array {
		if ( empty( $retrieved ) ) {
			return null;
		}

		$top = $retrieved[0];
		$score = (float) ( $top['score'] ?? 0 );
		if ( $score < self::FAST_PATH_SCORE ) {
			return null;
		}

		$slug_hits = Neo_Pulse_Wp_Chat_Rag::count_slug_path_term_hits( $message, $top );
		if ( $slug_hits < 1 ) {
			return null;
		}

		$ids = array();
		$terms = Neo_Pulse_Wp_Chat_Rag::extract_terms( $message );
		foreach ( $retrieved as $item ) {
			$item_score = (float) ( $item['score'] ?? 0 );
			if ( $item_score < self::FAST_PATH_SCORE * 0.5 ) {
				continue;
			}
			$ids[] = (int) $item['id'];
			if ( count( $ids ) >= Neo_Pulse_Wp_Chat_Rag::MAX_RESULTS ) {
				break;
			}
		}

		return array(
			'intent'       => ( Neo_Pulse_Wp_Chat_Links::detect_lead_action( $message ) || Neo_Pulse_Wp_Chat_Links::is_service_coverage_query( $message ) ) ? 'navigation' : 'question',
			'relevant_ids' => $ids,
			'search_terms' => array_values( $terms ),
		);
	}

	/**
	 * Build narrowed candidate list for Phase A from instant retrieval.
	 *
	 * @param array<int,array<string,mixed>> $site_index
	 * @param array<int,array<string,mixed>> $retrieved
	 * @return array<int,array<string,mixed>>
	 */
	public static function build_narrow_candidate_items( array $site_index, string $message, array $retrieved, array $chat_settings = array() ): array {
		$by_id = array();
		foreach ( $retrieved as $item ) {
			if ( isset( $item['id'] ) ) {
				$by_id[ (int) $item['id'] ] = $item;
			}
		}
		foreach ( Neo_Pulse_Wp_Chat_Rag::find_fuzzy_topic_pages( $message, $site_index, 10 ) as $item ) {
			$id = (int) ( $item['id'] ?? 0 );
			if ( $id > 0 && ! isset( $by_id[ $id ] ) ) {
				$by_id[ $id ] = $item;
			}
		}
		if ( empty( $by_id ) && ! empty( $retrieved ) ) {
			foreach ( $retrieved as $item ) {
				$by_id[ (int) $item['id'] ] = $item;
			}
		}
		if ( empty( $by_id ) ) {
			return array_slice( $site_index, 0, self::NARROW_INVENTORY_LIMIT );
		}

		$items = array_values( $by_id );
		usort(
			$items,
			function ( $a, $b ) use ( $message ) {
				$sa = isset( $a['score'] ) ? (float) $a['score'] : Neo_Pulse_Wp_Chat_Rag::score_message_item( $message, $a );
				$sb = isset( $b['score'] ) ? (float) $b['score'] : Neo_Pulse_Wp_Chat_Rag::score_message_item( $message, $b );
				return $sb <=> $sa;
			}
		);

		return array_slice( $items, 0, self::NARROW_INVENTORY_LIMIT );
	}

	/**
	 * Build a compact inventory summary for Phase A (IDs, titles, URLs, keywords, excerpt).
	 */
	private static function build_inventory_summary( array $index ): string {
		$lines = array();
		foreach ( $index as $item ) {
			$cats = ! empty( $item['categories'] ) ? ' [' . implode( ', ', $item['categories'] ) . ']' : '';
			$kw   = ! empty( $item['focus_keyword'] ) ? ' | kw:' . $item['focus_keyword'] : '';
			$preview = '';
			if ( ! empty( $item['excerpt'] ) ) {
				$preview = ' | excerpt:' . substr( (string) $item['excerpt'], 0, 80 );
				if ( strlen( (string) $item['excerpt'] ) > 80 ) {
					$preview .= '…';
				}
			}
			$lines[] = "ID:{$item['id']} | {$item['title']} | {$item['url']} | {$item['type']}{$cats}{$kw}{$preview}";
		}
		return implode( "\n", $lines );
	}
}
