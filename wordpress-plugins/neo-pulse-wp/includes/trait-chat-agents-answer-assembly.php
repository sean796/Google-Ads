<?php
/**
 * Answer link resolution, reason rules, and card title and body assembly.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Agents_Trait_AnswerAssembly {

	/**
	 * OpenRouter: pick inline body link spans and URLs from the site page pool.
	 *
	 * @param array<int,array<string,mixed>> $pool Index items with title + url.
	 */
	public static function resolve_inline_body_links( string $body, string $user_message, array $pool ): string {
		if ( $body === '' || empty( $pool ) ) {
			return $body;
		}

		$pages_lines = array();
		$allowed     = array();
		foreach ( array_slice( $pool, 0, 48 ) as $item ) {
			if ( empty( $item['url'] ) || empty( $item['title'] ) ) {
				continue;
			}
			$url = (string) $item['url'];
			$pages_lines[] = '- ' . (string) $item['title'] . ' → ' . $url;
			$allowed[ strtolower( rtrim( $url, '/' ) ) ] = $url;
		}

		if ( empty( $pages_lines ) ) {
			return $body;
		}

		$pages_block = implode( "\n", $pages_lines );

		$system = <<<'PROMPT'
You add inline markdown links to a website chat answer.

Return ONLY valid JSON:
{
  "links": [
    { "phrase": "exact text from the body", "url": "https://..." }
  ]
}

Rules:
- REQUIRED: For every `-`, `*`, or numbered list line, include a link entry for the list label. The label is the text before the first `:` when present (e.g. phrase "Service name" for `- Service name: description`).
- Link the first unlinked occurrence of each brand, product, service, or page topic when PAGES AVAILABLE has a match. If a later mention is already linked, still link the earlier plain-text mention.
- Link the brand or topic name in the first sentence under each `###` section heading when it appears plain (e.g. `[Service name](url) help clients with...`). Never link text inside the `###` heading line itself.
- On list lines, link only the label before the first `:`. Never link any text after the colon on the same line, even if it repeats the label word.
- Skip only text already inside markdown [text](url).
- Bullet labels always get linked even when they share a URL. The same URL may appear again in a different section paragraph.
- phrase must appear verbatim in the body (including ® when present).
- url must be copied exactly from PAGES AVAILABLE.
- Prefer the most specific product page over a broad category hub when both exist.
- Return {"links":[]} only when the body has no unlinked phrases.
- Output ONLY JSON, no markdown fences.
PROMPT;

		$unlinked = Neo_Pulse_Wp_Chat_Links::unlinked_list_labels( $body );
		$unlinked_block = '';
		if ( ! empty( $unlinked ) ) {
			$unlinked_block = "\n\nUNLINKED LIST LABELS (every one needs a link entry):\n- " . implode( "\n- ", $unlinked );
		}

		$user = "USER QUESTION:\n{$user_message}\n\nANSWER BODY:\n{$body}\n\nPAGES AVAILABLE:\n{$pages_block}{$unlinked_block}";

		$result = self::call_openrouter( self::FAST_MODEL, $system, $user, self::LINK_RESOLVE_MAX_TOKENS, 0.1 );
		if ( is_wp_error( $result ) ) {
			return $body;
		}

		$parsed = self::parse_json_response( $result );
		if ( null === $parsed || empty( $parsed['links'] ) || ! is_array( $parsed['links'] ) ) {
			return $body;
		}

		$links = array();
		foreach ( $parsed['links'] as $link ) {
			if ( ! is_array( $link ) || empty( $link['phrase'] ) || empty( $link['url'] ) ) {
				continue;
			}
			$url_norm = strtolower( rtrim( (string) $link['url'], '/' ) );
			if ( ! isset( $allowed[ $url_norm ] ) ) {
				continue;
			}
			$links[] = array(
				'phrase' => (string) $link['phrase'],
				'url'    => $allowed[ $url_norm ],
			);
		}

		if ( empty( $links ) ) {
			return $body;
		}

		$body = Neo_Pulse_Wp_Chat_Links::apply_resolved_link_map( $body, $links );
		$body = Neo_Pulse_Wp_Chat_Links::repair_malformed_markdown_links( $body );

		return $body;
	}

	/**
	 * Merge Phase A ID picks with keyword retrieval on the user message.
	 */
	public static function select_relevant_items( array $classification, array $site_index, string $user_message = '', array $chat_settings = array(), ?array $page_context = null ): array {
		$merged = array();
		$scores = array();

		$ids = isset( $classification['relevant_ids'] ) ? array_map( 'intval', (array) $classification['relevant_ids'] ) : array();
		if ( ! empty( $ids ) ) {
			$id_set = array_flip( $ids );
			foreach ( $site_index as $item ) {
				if ( isset( $id_set[ $item['id'] ] ) ) {
					$id                = (int) $item['id'];
					$merged[ $id ]     = $item;
					$scores[ $id ]     = ( $scores[ $id ] ?? 0 ) + 10.0;
				}
			}
		}

		$query = trim( $user_message );
		if (
			$query !== ''
			&& is_array( $page_context )
			&& Neo_Pulse_Wp_Chat_Page_Context::message_targets_current_page( $user_message )
			&& ! empty( $page_context['title'] )
		) {
			$query .= ' ' . (string) $page_context['title'];
		}
		if ( $query === '' && ! empty( $classification['search_terms'] ) ) {
			$query = implode( ' ', (array) $classification['search_terms'] );
		}
		if ( $query !== '' ) {
			foreach ( Neo_Pulse_Wp_Chat_Rag::retrieve( $query, Neo_Pulse_Wp_Chat_Rag::MAX_RESULTS, $chat_settings ) as $item ) {
				$id            = (int) $item['id'];
				$merged[ $id ] = isset( $merged[ $id ] ) ? array_merge( $merged[ $id ], $item ) : $item;
				$scores[ $id ] = ( $scores[ $id ] ?? 0 ) + (float) ( $item['score'] ?? 0 );
			}
		}

		if ( Neo_Pulse_Wp_Chat_Links::resolve_lead_action( $user_message, $site_index ) ) {
			foreach ( Neo_Pulse_Wp_Chat_Links::find_lead_pages( $user_message, $site_index, 3 ) as $item ) {
				$id            = (int) $item['id'];
				$merged[ $id ] = isset( $merged[ $id ] ) ? array_merge( $merged[ $id ], $item ) : $item;
				$scores[ $id ] = ( $scores[ $id ] ?? 0 ) + 15.0;
			}
		}

		if ( empty( $merged ) ) {
			$ordered = array();
		} else {
			arsort( $scores, SORT_NUMERIC );
			$ordered = array();
			foreach ( array_keys( $scores ) as $id ) {
				if ( isset( $merged[ $id ] ) ) {
					$ordered[] = $merged[ $id ];
				}
			}
			$ordered = array_slice( $ordered, 0, Neo_Pulse_Wp_Chat_Rag::MAX_RESULTS );
			$extra   = isset( $classification['search_terms'] ) ? array_values( (array) $classification['search_terms'] ) : array();
			$ordered = Neo_Pulse_Wp_Chat_Rag::ensure_topic_pages_in_items( $user_message, $ordered, $site_index, 3, $extra );
		}

		return Neo_Pulse_Wp_Chat_Page_Context::merge_into_items( $ordered, $page_context, $user_message );
	}

	/**
	 * Map classify intent to semantic card type.
	 */
	private static function intent_to_card_type( string $intent ): string {
		$type_map = array(
			'question'       => 'answer',
			'navigation'     => 'navigation',
			'recommendation' => 'recommendation',
			'support'        => 'answer',
		);
		return isset( $type_map[ $intent ] ) ? $type_map[ $intent ] : 'answer';
	}

	/**
	 * Intent-aware answer length guidance for Phase B.
	 */
	private static function reason_length_rule( string $intent, string $message, array $history ): string {
		if ( $intent === 'navigation' || Neo_Pulse_Wp_Chat_Links::detect_lead_action( $message ) || Neo_Pulse_Wp_Chat_Links::is_callback_request( $message ) ) {
			return "- LENGTH: 1-2 sentences with one prominent inline link.\n";
		}
		if ( Neo_Pulse_Wp_Chat_Links::is_service_coverage_query( $message ) ) {
			return "- LENGTH: 1-2 sentences with one prominent inline link to contact or consultation.\n";
		}
		if ( Neo_Pulse_Wp_Chat_Rag::is_site_blog_discovery_query( $message ) ) {
			return "- LENGTH: Short intro (1-2 sentences) plus a bullet list of 3-5 recommended blog posts from SITE CONTENT, each with an inline link and one-line reason.\n";
		}
		if ( $intent === 'recommendation' ) {
			return "- LENGTH: Short comparison of options (2-4 sentences) plus one inline link.\n";
		}

		$narrow = preg_match( '/^tell me about\s+/i', trim( $message ) ) === 1;
		if ( $narrow || ! empty( $history ) ) {
			return "- LENGTH: Structured answer focused on the specific topic (short intro + bullets or table as needed). Pull product names, features, and details from SITE CONTENT. Add information not already covered in CONVERSATION HISTORY.\n";
		}

		return "- LENGTH: Structured answer for broad questions (short intro + bullets or table as needed). Include specific product names, features, and details from SITE CONTENT. Do not give a one-paragraph generic overview when SITE CONTENT has real detail.\n";
	}

	/**
	 * Markdown formatting guidance for Phase B answer bodies.
	 */
	private static function reason_format_rule(): string {
		return <<<'RULE'
FORMATTING (markdown body):
- Open with 1-2 direct sentences, then structure the rest for scanability.
- Keep prose tight. Do not repeat the same brand or product name in every sentence.
- Use `-` bullet lists for 3+ products, features, benefits, or options.
- Use `1.` numbered lists for steps or ordered processes.
- Do not use **bold** for product or service names.
- Use **bold** only for non-link emphasis (not product/service names).
- Use `### Section title` when the answer covers multiple distinct topics.
- Use a markdown table when comparing 2+ items across 2+ attributes (max 4 columns, keep cells short).
- Never output one long paragraph when bullets or a table would be clearer.
- Every bullet must be one line: `- Label: description`. Never split the label and description across separate bullets.
- Do not add markdown links inside bullet lists. Use plain `Label: description`; links are added to labels automatically.
- Never use `**Label:**` list formatting. Use plain `Label:` only.
- In the opening paragraph, link every brand or product name from SITE CONTENT on first mention when a matching URL is available.
- Under each `###` section heading, link the brand name in the first sentence of that section. Never put links inside the `###` heading line.

RULE;
	}

	/**
	 * Card title + body from Phase B answer. Title = blog-style response headline.
	 *
	 * @return array{title:string,body:string}
	 */
	private static function split_answer_title_body( string $answer, string $user_message = '' ): array {
		$answer = trim( $answer );
		if ( $answer === '' ) {
			return array(
				'title' => __( 'Answer', 'neo-pulse-wp' ),
				'body'  => '',
			);
		}

		return array(
			'title' => self::response_title_from_answer( $answer, $user_message ),
			'body'  => $answer,
		);
	}

	/**
	 * Blog-style headline from answer content; strip duplicate title/filler from body.
	 *
	 * @param array<string,mixed> $card
	 * @return array<string,mixed>
	 */
	public static function normalize_card_title_body( array $card, string $user_message = '' ): array {
		$body = isset( $card['body'] ) ? (string) $card['body'] : '';
		if ( $body === '' ) {
			return $card;
		}

		$title = trim( (string) ( $card['title'] ?? '' ) );
		if ( $title === '' || self::is_weak_card_title( $title ) || self::title_echoes_user_message( $title, $user_message ) ) {
			$title = self::response_title_from_answer( $body, $user_message );
		}

		$body  = self::strip_leading_title_from_body( $title, $body );
		$body  = self::strip_leading_filler_from_body( $body );

		$card['title'] = $title;
		$card['body']  = $body;

		return $card;
	}

	/**
	 * Blog-style headline summarizing the assistant answer (not the user question).
	 */
	private static function response_title_from_answer( string $answer, string $user_message = '' ): string {
		$answer = trim( $answer );
		if ( $answer === '' ) {
			return __( 'Answer', 'neo-pulse-wp' );
		}

		if ( preg_match( '/^###\s+(.+)$/m', $answer, $matches ) ) {
			$heading = trim( self::plain_text_from_markdown( $matches[1] ) );
			if ( $heading !== '' && ! self::is_weak_card_title( $heading ) ) {
				return $heading;
			}
		}

		$generated = self::generate_response_title_openrouter( $answer, $user_message );
		if ( $generated !== '' ) {
			return $generated;
		}

		return '';
	}

	/**
	 * Fast-model blog headline from answer excerpt.
	 */
	private static function generate_response_title_openrouter( string $answer, string $user_message = '' ): string {
		$snippet = substr( self::plain_text_from_markdown( $answer ), 0, 2400 );
		if ( $snippet === '' ) {
			return '';
		}

		$system = <<<'PROMPT'
Write ONE short blog-style headline (4-10 words) that summarizes what this assistant answer covers.
The headline describes the response content, NOT the user's question.
Use sentence case: capitalize only the first word and proper nouns or acronyms from the site. Do not capitalize every word.
Never use filler openers (Certainly, Sure, Of course, Absolutely, Happy to help).
Never echo or paraphrase the user's question wording.
Output ONLY the headline text with no quotes, markdown, or explanation.
PROMPT;

		$user = $snippet;
		if ( $user_message !== '' ) {
			$user = "User question (context only, do not echo): {$user_message}\n\nAnswer:\n{$snippet}";
		}

		$result = self::call_openrouter( self::FAST_MODEL, $system, $user, self::TITLE_MAX_TOKENS, 0.2 );
		if ( is_wp_error( $result ) ) {
			return '';
		}

		$title = trim( self::plain_text_from_markdown( trim( (string) $result ) ), " \t\n\r\0\x0B\"'" );
		if ( $title === '' || self::is_weak_card_title( $title ) || self::title_echoes_user_message( $title, $user_message ) ) {
			return '';
		}
		if ( strlen( $title ) > 72 ) {
			$title = rtrim( substr( $title, 0, 72 ), ' .,;:-' );
		}

		return $title;
	}

	private static function title_echoes_user_message( string $title, string $user_message ): bool {
		if ( $user_message === '' ) {
			return false;
		}

		$title_terms = Neo_Pulse_Wp_Chat_Rag::extract_terms( strtolower( self::plain_text_from_markdown( $title ) ) );
		$user_terms  = Neo_Pulse_Wp_Chat_Rag::extract_terms( strtolower( $user_message ) );
		if ( empty( $title_terms ) || empty( $user_terms ) ) {
			return false;
		}

		$overlap = count( array_intersect( $title_terms, $user_terms ) );
		$ratio   = $overlap / max( 1, count( $title_terms ) );

		return $overlap >= 2 && $ratio >= 0.55;
	}

	private static function is_weak_card_title( string $title ): bool {
		$plain = strtolower( rtrim( self::plain_text_from_markdown( $title ), '.!?' ) );
		if ( $plain === '' ) {
			return true;
		}
		if ( strlen( $plain ) > 72 ) {
			return true;
		}

		$weak = array(
			'certainly',
			'sure',
			'sure thing',
			'of course',
			'absolutely',
			'great question',
			'good question',
			'happy to help',
			"here's what i found",
			'answer',
			'response',
			'here you go',
			'please list',
			'sure help',
		);

		if ( in_array( $plain, $weak, true ) ) {
			return true;
		}

		if ( preg_match( '/^(sure|please|happy to help|good question|certainly|of course|absolutely)\b/i', $plain ) ) {
			return true;
		}

		return false;
	}

	private static function strip_leading_title_from_body( string $title, string $body ): string {
		$title_plain = self::plain_text_from_markdown( $title );
		if ( $title_plain === '' ) {
			return $body;
		}

		$body_trim = ltrim( $body );
		$body_plain_start = self::plain_text_from_markdown( $body_trim );
		if ( stripos( $body_plain_start, $title_plain ) !== 0 ) {
			return $body;
		}

		$len = strlen( $title_plain );
		if ( strlen( $body_plain_start ) === $len ) {
			return '';
		}

		if ( isset( $body_plain_start[ $len ] ) && ! in_array( $body_plain_start[ $len ], array( ' ', '.', '!', '?', ',', ':', ';', '-' ), true ) ) {
			return $body;
		}

		$pattern = '/^' . preg_quote( $title_plain, '/' ) . '[.!?,:\s-]*/iu';
		$stripped = preg_replace( $pattern, '', $body_trim, 1 );

		return is_string( $stripped ) ? ltrim( $stripped ) : $body;
	}

	private static function strip_leading_filler_from_body( string $body ): string {
		$trimmed = ltrim( $body );
		if ( $trimmed === '' ) {
			return $body;
		}

		$fillers = array(
			'Certainly!',
			'Certainly.',
			'Sure!',
			'Sure.',
			'Of course!',
			'Of course.',
			'Absolutely!',
			'Absolutely.',
			'Great question!',
			'Good question!',
		);

		foreach ( $fillers as $filler ) {
			if ( stripos( $trimmed, $filler ) === 0 ) {
				$trimmed = ltrim( substr( $trimmed, strlen( $filler ) ) );
				$trimmed = ltrim( $trimmed, " \t\n\r\0\x0B.,!-" );
				break;
			}
		}

		return $trimmed;
	}

	/**
	 * Strip markdown syntax for card titles (keep full visible text).
	 */
	private static function plain_text_from_markdown( string $text ): string {
		$text = preg_replace( '/\[([^\]]+)\]\([^)]+\)/', '$1', $text );
		$text = str_replace( array( '**', '__' ), '', $text );
		$text = preg_replace( '/\*([^*]+)\*/', '$1', $text );
		$text = preg_replace( '/_([^_]+)_/', '$1', $text );
		return trim( preg_replace( '/\s+/', ' ', $text ) );
	}
}
