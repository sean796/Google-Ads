<?php
/**
 * Three-phase sub-agent orchestration for the NEO Pulse Chat widget.
 *
 * Phase A: Classify intent + select relevant content (fast model).
 * Phase B: Reason and draft an answer (capable model).
 * The card is then built deterministically (build_card_from_answer).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Chat_Agents {

	const FAST_MODEL              = 'google/gemini-2.5-flash-lite';
	const REASON_MODEL            = 'google/gemini-2.5-flash';
	const FAST_PATH_SCORE         = 8.0;
	const NARROW_INVENTORY_LIMIT  = 30;
	const MIN_RELATED_TOPICS      = 2;
	const MAX_RELATED_TOPICS      = 2;
	const ACK_MAX_TOKENS          = 128;
	const CLASSIFY_MAX_TOKENS     = 2048;
	const REASON_MAX_TOKENS       = 8192;
	const LINK_RESOLVE_MAX_TOKENS = 2048;
	const TITLE_MAX_TOKENS        = 64;
	const FOLLOWUP_MAX_TOKENS     = 512;
	const TEMPLATE_FORMAT_MAX_TOKENS = 2048;

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
	 * Deterministic card shell from Phase B answer (stream path, skips Phase C LLM).
	 *
	 * @param array<int,array<string,mixed>> $items
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array
	 */
	public static function build_card_from_answer( string $answer, array $classification, array $items, string $user_message, array $site_index, array $history = array() ): array {
		$intent    = isset( $classification['intent'] ) ? (string) $classification['intent'] : 'question';
		$card_type = ( Neo_Pulse_Wp_Chat_Links::detect_lead_action( $user_message ) || Neo_Pulse_Wp_Chat_Links::is_service_coverage_query( $user_message ) ) ? 'navigation' : self::intent_to_card_type( $intent );
		$split     = self::split_answer_title_body( $answer, $user_message );
		$title     = $split['title'];
		$body      = $split['body'];

		$card = array(
			'type'       => $card_type,
			'title'      => $title,
			'body'       => $body,
			'links'      => array(),
			'confidence' => 'high',
		);

		$card = self::normalize_card_title_body( $card, $user_message );

		$seen_urls = Neo_Pulse_Wp_Chat_History::collect_seen_urls( $history );

		return Neo_Pulse_Wp_Chat_Links::attach_to_card( $card, $user_message, $card['body'] !== '' ? $card['body'] : $answer, $items, $classification, $site_index, $seen_urls, array() );
	}

	/**
	 * OpenRouter format for template intents (page summary, tell-me-about chip).
	 *
	 * @return array<string,mixed>|WP_Error
	 */
	public static function format_template_card(
		string $intent,
		string $page_title,
		string $page_url,
		string $source_body,
		string $user_message,
		string $site_name
	) {
		$source_body = trim( $source_body );
		$page_title  = trim( $page_title );
		if ( $source_body === '' || $page_title === '' ) {
			return new WP_Error( 'neo-pulse_template_empty', 'Missing page content for template card.' );
		}

		if ( strlen( $source_body ) > Neo_Pulse_Wp_Chat_Page_Summary::SUMMARY_MD_MAX ) {
			$source_body = substr( $source_body, 0, Neo_Pulse_Wp_Chat_Page_Summary::SUMMARY_MD_MAX ) . '…';
		}

		$task = $intent === 'page_summary'
			? 'Summarize this page for a visitor who asked to summarize the page they are viewing.'
			: 'Introduce this page to a visitor who asked about it.';

		$system = <<<PROMPT
You format a chat card for {$site_name}.
Output ONLY valid JSON:
{"type":"answer","title":"short blog-style headline","body":"markdown answer","confidence":"high"}

{$task}

Rules:
- PAGE OUTLINE is a pre-structured markdown outline. Polish it into a visitor-facing answer; do not invent services, locations, or products beyond the outline.
- Ground every fact in PAGE OUTLINE only.
- "title" is a blog-style headline summarizing what the page covers. Do not echo command phrases like "summarize this page" or restate the visitor message verbatim.
- "body" uses clear markdown: short intro, then bullet lists or ### sections where helpful. Mention specific services, products, and page topics from the outline.
- Do not include markdown links in body. Use plain labels before a colon (e.g. `- Service: description`). Links are added automatically from the page outline.
- Do not wrap list labels in **bold**.
- Do not open "body" with a secretary-style acknowledgment. Start with substantive content.
- Do not include relatedTopics or links in JSON.
- Output only JSON, no markdown fences.
PROMPT;

		$user = "PAGE TITLE: {$page_title}\nPAGE URL: {$page_url}\nVISITOR MESSAGE: {$user_message}\n\nPAGE OUTLINE (pre-structured markdown):\n{$source_body}";

		$result = self::call_openrouter( self::FAST_MODEL, $system, $user, self::TEMPLATE_FORMAT_MAX_TOKENS, 0.2 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$parsed = self::parse_json_response( (string) $result );
		if ( null === $parsed || empty( $parsed['body'] ) ) {
			return new WP_Error( 'neo-pulse_template_format', 'Failed to format template card.' );
		}

		$card = array(
			'type'       => 'answer',
			'title'      => isset( $parsed['title'] ) ? (string) $parsed['title'] : $page_title,
			'body'       => (string) $parsed['body'],
			'links'      => array(),
			'confidence' => isset( $parsed['confidence'] ) ? (string) $parsed['confidence'] : 'high',
		);

		return self::normalize_card_title_body( $card, $user_message );
	}

	/**
	 * Phase A: classify intent and select relevant post IDs.
	 *
	 * @param array<int,array<string,mixed>>|null $candidate_items Narrow inventory subset; full index when null.
	 * @return array|WP_Error Parsed JSON with intent + relevant_ids.
	 */
	public static function phase_classify( string $message, string $site_name, array $site_index, ?array $candidate_items = null ) {
		$inventory_source = ( null !== $candidate_items && ! empty( $candidate_items ) ) ? $candidate_items : $site_index;
		$inventory_summary = self::build_inventory_summary( $inventory_source );

		$system = <<<PROMPT
You are a classification agent for the website "{$site_name}".
Given a user message and a list of site pages, output ONLY valid JSON with these fields:
- "intent": one of "question", "navigation", "recommendation", "support"
- "relevant_ids": array of up to 8 post IDs most relevant to the query (integers)
- "search_terms": array of key terms extracted from the query

INTENT RULES:
- Messages about booking, appointments, scheduling, consultation, contact, phone, quote, pricing, or speaking with a human/person should use "intent": "navigation"
- Messages asking whether the business services, delivers to, or installs in a city/area/location should use "intent": "navigation"
- When the visitor asks for blog posts, articles, or reading recommendations on this site, use "intent": "recommendation" and prioritize post-type IDs from the inventory

SITE CONTENT:
{$inventory_summary}
PROMPT;

		$result = self::call_openrouter( self::FAST_MODEL, $system, $message, self::CLASSIFY_MAX_TOKENS, 0.2 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$parsed = self::parse_json_response( $result );
		if ( null === $parsed ) {
			return array(
				'intent'       => 'question',
				'relevant_ids' => array(),
				'search_terms' => array(),
			);
		}

		return $parsed;
	}

	/**
	 * Phase B: reason and draft an answer with full context.
	 *
	 * @return string|WP_Error The drafted answer text.
	 */
	public static function phase_reason( string $message, array $history, string $site_name, array $items, array $classification, array $training = array(), array $site_index = array(), ?array $page_context = null ) {
		$knowledge_base = isset( $training['knowledge_base'] ) && is_array( $training['knowledge_base'] ) ? $training['knowledge_base'] : array();
		$context        = Neo_Pulse_Wp_Chat_Rag::format_context( $items, $knowledge_base );
		$page_block     = Neo_Pulse_Wp_Chat_Page_Context::format_for_prompt( $page_context );
		$links_block    = Neo_Pulse_Wp_Chat_Links::build_links_context_block_for_reason( $message, $items, $site_index );
		$intent         = isset( $classification['intent'] ) ? $classification['intent'] : 'question';
		$lead_action    = Neo_Pulse_Wp_Chat_Links::resolve_lead_action( $message, $site_index );
		$unlisted_area   = Neo_Pulse_Wp_Chat_Links::is_unlisted_service_area_query( $message, $site_index );
		$callback_request = Neo_Pulse_Wp_Chat_Links::is_callback_request( $message );
		$lead_rule       = ( $lead_action || $intent === 'navigation' )
			? "- User wants to take action. Lead with the real page URL from LINKS AVAILABLE in the first sentence as an inline markdown link. Name the page naturally (Book a consultation, Contact us, Get a quote).\n"
			: '';
		$callback_rule   = $callback_request
			? "- CALLBACK / CALL-ME REQUEST: The visitor wants a phone call. You are a chat assistant — you cannot place outbound calls and must never ask for their phone number. Briefly acknowledge their issue, then explain they can reach {$site_name} by contacting the store directly or sending a text through the contact form below. Link to the contact page from LINKS AVAILABLE.\n"
			: '';
		$service_area_rule = $unlisted_area
			? "- SERVICE AREA COVERAGE: The visitor asked about servicing a location that does NOT appear as a service-area page in SITE CONTENT. Do NOT guess yes or no and never say you cannot service an area. In the first sentence, invite them to speak with {$site_name} staff to confirm whether that area is covered, and link to the contact or consultation page from LINKS AVAILABLE.\n"
			: "- SERVICE AREA COVERAGE: When the visitor asks whether you service, deliver to, or install in a city/area, check SITE CONTENT for a matching service-area page (title, slug, or URL). If a match exists, answer from that page and link to it. If no match exists, do NOT guess yes or no and never say you cannot service an area — invite them to speak with {$site_name} staff to confirm coverage and link to contact or booking from LINKS AVAILABLE.\n";
		$unknown_rule      = <<<RULE
- UNKNOWN OR PARTIAL ANSWERS: When SITE CONTENT does not fully answer the question, never mention missing website content, knowledge gaps, or what the business "doesn't", "can't", or "won't" do.
- Never use phrasing like: "website doesn't (show/list/state/mention/explicitly)", "our website doesn't", "I don't have (information/details)", "we don't offer", "we can't", "we won't", "not over the phone", "I'm sorry" followed by a refusal, "in my knowledge base", "provided information", "while our website", or "while I don't have".
- Instead: share any helpful related facts from SITE CONTENT, then warmly invite the visitor to connect with {$site_name} staff who can help with their specific question. Link to contact or consultation from LINKS AVAILABLE.
- Frame staff contact as the natural next step for personalized help — not as a fallback because something is missing.
- Never imply the business cannot accommodate the request until staff have spoken with the customer.
- Exception: you MAY say you cannot place phone calls as a chat assistant when the visitor asks to be called (see CALLBACK rule). That is not the same as saying the business cannot help.

RULE;

		$assistant_name = isset( $training['assistant_name'] ) && $training['assistant_name'] !== '' ? $training['assistant_name'] : 'Pulse Assist';
		$custom_prompt  = isset( $training['system_prompt'] ) && $training['system_prompt'] !== '' ? $training['system_prompt'] : '';
		$greeting_style = isset( $training['greeting_style'] ) ? $training['greeting_style'] : 'friendly';

		$tone_map = array(
			'professional' => 'Use a polished, professional tone. Be precise and authoritative.',
			'friendly'     => 'Use a warm, friendly tone. Be approachable and helpful.',
			'casual'       => 'Use a casual, relaxed tone. Be conversational and easygoing.',
		);
		$tone_instruction = isset( $tone_map[ $greeting_style ] ) ? $tone_map[ $greeting_style ] : $tone_map['friendly'];

		$history_text = Neo_Pulse_Wp_Chat_History::format_for_prompt( $history );
		$length_rule  = self::reason_length_rule( $intent, $message, $history );
		$format_rule  = self::reason_format_rule();
		$blog_rule    = Neo_Pulse_Wp_Chat_Rag::is_site_blog_discovery_query( $message )
			? "- BLOG REQUEST: Recommend ONLY blog posts listed in SITE CONTENT (exact titles and URLs). Never invent post titles or URLs. Use `- Post title: one-line reason` bullets (3-5 posts). Mention the Blog index page when it appears in LINKS AVAILABLE.\n"
			: '';

		$identity = "You are \"{$assistant_name}\", the AI assistant for the website \"{$site_name}\".";
		if ( $custom_prompt !== '' ) {
			$identity .= "\n\nCUSTOM INSTRUCTIONS FROM SITE OWNER:\n{$custom_prompt}";
		}
		$identity .= "\n\nSCOPE: Answer from this website's published pages, posts, and knowledge base. Do not assume a product vertical. Do not refuse a topic that appears in SITE CONTENT, CURRENT PAGE, LINKS AVAILABLE, or SITE SUBJECTS. Custom instructions may set name and tone; they must not blacklist topics that exist on this site.";

		$page_rule = $page_block !== ''
			? "- When CURRENT PAGE or VISITOR URL is provided, treat it as the page the visitor is viewing now.\n- When the user refers to \"this page\", \"this blog\", \"this product\", \"here\", or similar, use CURRENT PAGE as the primary source.\n- For general site questions, use CURRENT PAGE as supporting context unless it clearly does not apply.\n"
			: '';

		$system = <<<PROMPT
{$identity}
The user's intent is: {$intent}.

TONE: {$tone_instruction}

RULES:
- Lead with a direct answer to the user's question in the first 1-2 sentences.
- Do not open with standalone filler acknowledgments (Certainly, Sure, Of course, Absolutely). The secretary ack already handled that; start with substantive content.
{$lead_rule}{$callback_rule}{$service_area_rule}{$unknown_rule}{$page_rule}{$blog_rule}- First synthesize from SITE CONTENT and HIGH PRIORITY knowledge base. Use those as the primary source whenever they contain relevant facts.
- When SITE CONTENT includes a page whose slug, URL, or title matches the topic, use that page's body as the main source for your answer.
- Only after using SITE CONTENT, add standard professional knowledge for parts the site copy does not cover.
- Use ALL SITE CONTENT blocks provided. Combine information from every matched page.
- Never refuse, defer, or replace an answer with "read this page instead." Links supplement the answer; they do not replace it.
- Knowledge base entries marked HIGH PRIORITY should be used verbatim when they match the question.
- Weave inline markdown links [natural phrase](url) from LINKS AVAILABLE into prose paragraphs naturally. Never add a bare URL or "click here" style link.
- In bullet lists use plain `- Label: description` on one line. Do not add markdown links inside bullets; list labels are linked automatically after formatting.
- In the opening paragraph, link every brand or product name from SITE CONTENT on first mention when LINKS AVAILABLE has a matching URL.
- Match each link to the most specific slug-matched page for that product or topic, not a generic homepage or broad blog post.
- When LINKS AVAILABLE has no page for a mention, still explain it but do not invent URLs.
- Do not use bracket citation numbers such as [1] or [2] in the answer.
- If the user asks for a link or URL, include the real URL from the content.
- Do not repeat CTAs or source links already shown in this conversation unless the user explicitly asks for that page again.
- Follow-ups on the same topic should go deeper (timing, cost, recovery), not re-introduce the same landing page.
- Do not repeat prior suggestion chips verbatim.
{$length_rule}{$format_rule}- Do not repeat the same URL twice in the same sentence. Each `###` section may link its brand again in the opening sentence below the heading (never inside the heading line).
- When SITE CONTENT has substantive copy for the topic, use it; do not substitute generic marketing filler.
- Complete every sentence; never trail off mid-thought.
- When referencing pages, always include their URL.

{$page_block}SITE CONTENT:
{$context}

LINKS AVAILABLE:
{$links_block}

CONVERSATION HISTORY:
{$history_text}
PROMPT;

		return self::call_openrouter( self::REASON_MODEL, $system, $message, self::REASON_MAX_TOKENS, 0.5 );
	}

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

	/**
	 * Hybrid follow-up chips: deterministic topic links first, OpenRouter backfill.
	 *
	 * @param array<int,array<string,mixed>> $items
	 * @param array<int,array<string,mixed>> $site_index
	 * @param array<string,mixed>|null       $page_context
	 * @return array<int,string>
	 */
	public static function generate_followup_topics(
		string $user_message,
		string $answer,
		array $items,
		array $site_index,
		array $history,
		?array $page_context = null,
		?array $card = null
	): array {
		$pool = ! empty( $items ) ? $items : $site_index;
		if ( empty( $pool ) && empty( $site_index ) ) {
			return array();
		}

		$snippet = substr( self::plain_text_from_markdown( $answer ), 0, 800 );
		if ( $snippet === '' ) {
			return array();
		}

		$context     = self::build_followup_context( $user_message, $items, $site_index, $history, $page_context, $card );
		$inventory   = self::build_followup_inventory_summary( $pool, $site_index, $context['exclude_urls'] );
		$topics      = self::request_followup_topics_openrouter(
			$user_message,
			$snippet,
			$inventory,
			self::MIN_RELATED_TOPICS,
			array(),
			$context,
			$site_index
		);

		if ( count( $topics ) < self::MIN_RELATED_TOPICS ) {
			$needed = self::MIN_RELATED_TOPICS - count( $topics );
			$topics = array_merge(
				$topics,
				self::deterministic_followup_topics(
					$user_message,
					$snippet,
					$pool,
					$site_index,
					$page_context,
					$context['exclude_urls'],
					$topics
				)
			);
			$topics = array_slice( $topics, 0, self::MAX_RELATED_TOPICS );
		}

		if ( count( $topics ) < self::MIN_RELATED_TOPICS ) {
			$needed = self::MIN_RELATED_TOPICS - count( $topics );
			$retry  = self::request_followup_topics_openrouter(
				$user_message,
				$snippet,
				$inventory,
				$needed,
				$topics,
				$context,
				$site_index
			);
			$topics = array_slice( array_merge( $topics, $retry ), 0, self::MAX_RELATED_TOPICS );
		}

		return array_slice( $topics, 0, self::MAX_RELATED_TOPICS );
	}

	/**
	 * @param array<int,array<string,mixed>>   $items
	 * @param array<int,array<string,mixed>>   $site_index
	 * @param array<int,array<string,mixed>>   $history
	 * @param array<string,mixed>|null         $page_context
	 * @param array<string,mixed>|null         $card
	 * @return array{exclude_urls:array<int,string>,history_block:string,prior_topics:array<int,string>}
	 */
	private static function build_followup_context(
		string $user_message,
		array $items,
		array $site_index,
		array $history,
		?array $page_context,
		?array $card
	): array {
		$exclude_urls = Neo_Pulse_Wp_Chat_History::collect_seen_urls( $history );
		$url_seen     = array();
		foreach ( $exclude_urls as $url ) {
			$norm = Neo_Pulse_Wp_Chat_History::normalize_url( (string) $url );
			if ( $norm !== '' ) {
				$url_seen[ $norm ] = true;
			}
		}

		$add_url = static function ( string $url ) use ( &$url_seen, &$exclude_urls ): void {
			$norm = Neo_Pulse_Wp_Chat_History::normalize_url( $url );
			if ( $norm === '' || isset( $url_seen[ $norm ] ) ) {
				return;
			}
			$url_seen[ $norm ]  = true;
			$exclude_urls[]     = $url;
		};

		if ( is_array( $page_context ) && ! empty( $page_context['url'] ) ) {
			$add_url( (string) $page_context['url'] );
		}

		foreach ( $items as $item ) {
			if ( ! empty( $item['url'] ) ) {
				$add_url( (string) $item['url'] );
			}
		}

		if ( is_array( $card ) ) {
			if ( ! empty( $card['cta']['url'] ) ) {
				$add_url( (string) $card['cta']['url'] );
			}
			if ( ! empty( $card['links'] ) && is_array( $card['links'] ) ) {
				foreach ( $card['links'] as $link ) {
					if ( is_array( $link ) && ! empty( $link['url'] ) ) {
						$add_url( (string) $link['url'] );
					}
				}
			}
		}

		$intent = Neo_Pulse_Wp_Chat_Suggestion_Templates::match_intent( $user_message, $page_context, $site_index );
		if ( is_array( $intent ) && ! empty( $intent['url'] ) ) {
			$add_url( (string) $intent['url'] );
		}

		$prior_topics = Neo_Pulse_Wp_Chat_History::collect_seen_topics( $history );
		$history_block = Neo_Pulse_Wp_Chat_History::format_for_prompt( array_slice( $history, -6 ) );

		return array(
			'exclude_urls'  => $exclude_urls,
			'history_block' => $history_block,
			'prior_topics'  => $prior_topics,
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $items
	 * @param array<int,array<string,mixed>> $site_index
	 * @param array<string,mixed>|null       $page_context
	 * @param array<int,string>              $exclude_urls
	 * @param array<int,string>              $existing
	 * @return array<int,string>
	 */
	private static function deterministic_followup_topics(
		string $user_message,
		string $answer_snippet,
		array $items,
		array $site_index,
		?array $page_context,
		array $exclude_urls,
		array $existing = array()
	): array {
		$query = trim( $user_message . ' ' . $answer_snippet );
		if ( $query === '' ) {
			return array();
		}

		$links  = Neo_Pulse_Wp_Chat_Links::pick_topic_links( $query, $items, 4, $site_index, true, array(), $exclude_urls );
		$topics = array();
		$seen   = array();
		foreach ( $existing as $topic ) {
			if ( is_string( $topic ) && trim( $topic ) !== '' ) {
				$seen[ strtolower( trim( $topic ) ) ] = true;
			}
		}

		foreach ( $links as $link ) {
			if ( count( $topics ) >= self::MAX_RELATED_TOPICS ) {
				break;
			}
			$item = self::followup_item_for_link( $link, $site_index );
			if ( ! is_array( $item ) ) {
				continue;
			}
			$text = self::contextual_chip_text( $item, $user_message, $answer_snippet );
			$key  = strtolower( trim( $text ) );
			if ( $text === '' || isset( $seen[ $key ] ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$topics[]     = $text;
		}

		if (
			count( $topics ) < self::MIN_RELATED_TOPICS
			&& is_array( $page_context )
			&& ! empty( $page_context['post_id'] )
			&& ! self::is_page_summary_request( $user_message )
		) {
			$topics[] = 'Summarize this page';
		}

		return $topics;
	}

	private static function is_page_summary_request( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === 'summarize this page' ) {
			return true;
		}
		if ( ! str_contains( $lower, 'summarize' ) && ! str_contains( $lower, 'summary' ) ) {
			return false;
		}
		return Neo_Pulse_Wp_Chat_Page_Context::message_targets_current_page( $lower );
	}

	/**
	 * @param array<int,string> $existing
	 * @return array<int,string>
	 */
	private static function request_followup_topics_openrouter(
		string $user_message,
		string $answer_snippet,
		string $inventory,
		int $need_more = 0,
		array $existing = array(),
		array $context = array(),
		array $site_index = array()
	): array {
		$history_block = isset( $context['history_block'] ) ? trim( (string) $context['history_block'] ) : '';
		$prior_topics  = isset( $context['prior_topics'] ) && is_array( $context['prior_topics'] ) ? $context['prior_topics'] : array();
		$exclude_urls  = isset( $context['exclude_urls'] ) && is_array( $context['exclude_urls'] ) ? $context['exclude_urls'] : array();

		$system = <<<'PROMPT'
You suggest follow-up chat chips for a website assistant.
Output ONLY valid JSON: {"chips":[{"text":"natural short question","page_id":123}]}

Rules:
- Each chip must be a natural next question a visitor would ask after the assistant answer (not "Tell me about {page title}").
- Write chips as concise questions (roughly 4–12 words). Use sentence case.
- Each chip must map to a distinct page_id from SITE PAGES.
- Do not suggest pages already covered in RECENT CONVERSATION or EXCLUDED URLS.
- Do not repeat chip text from PRIOR CHIPS or re-ask what the user just asked.
- For blog posts, ask about the article topic (e.g. "What should I know before I get started?"), never generic hub labels like "Blog".
- For service pages, suggest a logical adjacent service or FAQ (e.g. after repairs, suggest warranty or booking).
- Return exactly 2 chips when at least 2 distinct eligible pages exist.
PROMPT;

		$user = "User question:\n{$user_message}\n\nAssistant answer:\n{$answer_snippet}\n\nSITE PAGES:\n{$inventory}";
		if ( $history_block !== '' ) {
			$user .= "\n\nRECENT CONVERSATION:\n{$history_block}";
		}
		if ( ! empty( $prior_topics ) ) {
			$user .= "\n\nPRIOR CHIPS (do not repeat):\n" . implode( "\n", $prior_topics );
		}
		if ( ! empty( $exclude_urls ) ) {
			$user .= "\n\nEXCLUDED URLS (already shown; do not suggest):\n" . implode( "\n", $exclude_urls );
		}
		if ( $need_more > 0 && ! empty( $existing ) ) {
			$user .= "\n\nAlready chosen (do not duplicate these pages):\n" . implode( "\n", $existing );
			$user .= "\n\nReturn {$need_more} additional chip(s) to reach 2 total, each with a distinct page_id.";
		}

		$result = self::call_openrouter( self::FAST_MODEL, $system, $user, self::FOLLOWUP_MAX_TOKENS, 0.2 );
		if ( is_wp_error( $result ) ) {
			return array();
		}

		$parsed = self::parse_json_response( (string) $result );
		if ( null === $parsed ) {
			return array();
		}

		$chips = array();
		if ( ! empty( $parsed['chips'] ) && is_array( $parsed['chips'] ) ) {
			$chips = $parsed['chips'];
		} elseif ( ! empty( $parsed['relatedTopics'] ) && is_array( $parsed['relatedTopics'] ) ) {
			foreach ( $parsed['relatedTopics'] as $topic ) {
				if ( is_string( $topic ) && trim( $topic ) !== '' ) {
					$chips[] = array( 'text' => trim( $topic ) );
				}
			}
		}

		if ( empty( $chips ) ) {
			return array();
		}

		return self::normalize_followup_chips( $chips, $exclude_urls, $prior_topics, $user_message, $site_index );
	}

	/**
	 * @param array<int,array<string,mixed>> $chips
	 * @param array<int,string>              $exclude_urls
	 * @param array<int,string>              $prior_topics
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<int,string>
	 */
	private static function normalize_followup_chips(
		array $chips,
		array $exclude_urls,
		array $prior_topics,
		string $user_message,
		array $site_index
	): array {
		if ( empty( $site_index ) ) {
			$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index();
		}

		$by_id = array();
		foreach ( $site_index as $item ) {
			$id = isset( $item['id'] ) ? (int) $item['id'] : 0;
			if ( $id > 0 ) {
				$by_id[ $id ] = $item;
			}
		}

		$url_seen = array();
		foreach ( $exclude_urls as $url ) {
			$norm = Neo_Pulse_Wp_Chat_History::normalize_url( (string) $url );
			if ( $norm !== '' ) {
				$url_seen[ $norm ] = true;
			}
		}

		$text_seen = array();
		foreach ( $prior_topics as $topic ) {
			$key = strtolower( trim( (string) $topic ) );
			if ( $key !== '' ) {
				$text_seen[ $key ] = true;
			}
		}

		$out = array();
		foreach ( $chips as $chip ) {
			if ( ! is_array( $chip ) ) {
				continue;
			}
			$text = isset( $chip['text'] ) ? trim( wp_strip_all_tags( (string) $chip['text'] ) ) : '';
			if ( $text === '' ) {
				continue;
			}

			$item = null;
			$page_id = isset( $chip['page_id'] ) ? (int) $chip['page_id'] : 0;
			if ( $page_id > 0 && isset( $by_id[ $page_id ] ) ) {
				$item = $by_id[ $page_id ];
			}
			if ( ! is_array( $item ) ) {
				$item = self::followup_item_for_text( $text, $site_index );
			}
			if ( ! is_array( $item ) || empty( $item['url'] ) ) {
				continue;
			}
			if ( self::is_generic_hub_item( $item ) ) {
				continue;
			}

			$url_norm = Neo_Pulse_Wp_Chat_History::normalize_url( (string) $item['url'] );
			if ( $url_norm === '' || isset( $url_seen[ $url_norm ] ) ) {
				continue;
			}

			$text_key = strtolower( $text );
			if ( isset( $text_seen[ $text_key ] ) || self::should_skip_related_topic( $text, $user_message, array(), $text_seen ) ) {
				continue;
			}

			$url_seen[ $url_norm ]  = true;
			$text_seen[ $text_key ] = true;
			$out[]                  = $text;
			if ( count( $out ) >= self::MAX_RELATED_TOPICS ) {
				break;
			}
		}

		return $out;
	}

	/**
	 * Keep chips that resolve to indexed pages; at most one chip per URL.
	 *
	 * @param array<int,string>              $topics
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<int,string>
	 */
	public static function dedupe_followup_topics_by_url( array $topics, array $site_index ): array {
		$chips = array();
		foreach ( $topics as $topic ) {
			if ( is_string( $topic ) && trim( $topic ) !== '' ) {
				$chips[] = array( 'text' => trim( $topic ) );
			}
		}

		return self::normalize_followup_chips( $chips, array(), array(), '', $site_index );
	}

	/**
	 * @param array<int,array<string,mixed>> $items
	 * @param array<int,array<string,mixed>> $site_index
	 * @param array<int,string>              $exclude_urls
	 */
	private static function build_followup_inventory_summary( array $items, array $site_index, array $exclude_urls = array() ): string {
		$exclude_norm = array();
		foreach ( $exclude_urls as $url ) {
			$norm = Neo_Pulse_Wp_Chat_History::normalize_url( (string) $url );
			if ( $norm !== '' ) {
				$exclude_norm[ $norm ] = true;
			}
		}

		$by_id = array();
		foreach ( array_merge( $items, $site_index ) as $item ) {
			$id = isset( $item['id'] ) ? (int) $item['id'] : 0;
			if ( $id > 0 ) {
				$by_id[ $id ] = $item;
			}
		}
		$lines = array();
		$count = 0;
		foreach ( $by_id as $item ) {
			if ( $count >= 40 ) {
				break;
			}
			$title = isset( $item['title'] ) ? trim( (string) $item['title'] ) : '';
			$url   = isset( $item['url'] ) ? trim( (string) $item['url'] ) : '';
			if ( $title === '' || $url === '' ) {
				continue;
			}
			$url_norm = Neo_Pulse_Wp_Chat_History::normalize_url( $url );
			if ( $url_norm !== '' && isset( $exclude_norm[ $url_norm ] ) ) {
				continue;
			}
			if ( self::is_generic_hub_item( $item ) ) {
				continue;
			}
			$id   = isset( $item['id'] ) ? (int) $item['id'] : 0;
			$type = isset( $item['type'] ) ? (string) $item['type'] : 'page';
			$lines[] = "ID:{$id} | {$title} | {$url} | {$type}";
			++$count;
		}

		return implode( "\n", $lines );
	}

	/**
	 * @param array<int,array<string,mixed>> $site_index
	 */
	private static function resolve_followup_topic_url( string $topic, array $site_index ): string {
		$label = self::followup_topic_label( $topic, $site_index );
		if ( $label === '' ) {
			return '';
		}
		$label_norm = strtolower( $label );
		foreach ( $site_index as $item ) {
			$title = isset( $item['title'] ) ? trim( (string) $item['title'] ) : '';
			if ( $title !== '' && strtolower( $title ) === $label_norm && ! empty( $item['url'] ) ) {
				return (string) $item['url'];
			}
		}
		return '';
	}

	/**
	 * @param array<int,array<string,mixed>> $site_index
	 */
	private static function followup_topic_label( string $topic, array $site_index ): string {
		$topic = trim( wp_strip_all_tags( $topic ) );
		if ( $topic === '' ) {
			return '';
		}
		$prefix = 'tell me about ';
		if ( str_starts_with( strtolower( $topic ), $prefix ) ) {
			$topic = trim( substr( $topic, strlen( $prefix ) ) );
		}
		return $topic;
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

	/**
	 * Call OpenRouter with a specific model.
	 *
	 * @return string|WP_Error
	 */
	private static function call_openrouter( string $model, string $system_prompt, string $user_prompt, int $max_tokens = 8192, float $temperature = 0.5 ) {
		$key = Neo_Pulse_Wp_OpenRouter::get_api_key();
		if ( $key === '' ) {
			return new WP_Error(
				'neo-pulse_openrouter_key',
				__( 'OpenRouter API key is not configured. Add it in NEO Pulse WP Settings > Editor AI.', 'neo-pulse-wp' )
			);
		}

		Neo_Pulse_Wp_OpenRouter::maybe_extend_time_limit();

		$response = wp_remote_post(
			Neo_Pulse_Wp_OpenRouter::API_URL,
			array(
				'timeout' => Neo_Pulse_Wp_OpenRouter::get_timeout(),
				'headers' => Neo_Pulse_Wp_OpenRouter::request_headers( $key ),
				'body'    => wp_json_encode(
					array(
						'model'       => $model,
						'messages'    => array(
							array( 'role' => 'system', 'content' => $system_prompt ),
							array( 'role' => 'user', 'content' => $user_prompt ),
						),
						'temperature' => $temperature,
						'max_tokens'  => $max_tokens,
					)
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );

		if ( $code < 200 || $code >= 300 ) {
			$msg = '';
			if ( is_array( $data ) && isset( $data['error']['message'] ) ) {
				$msg = (string) $data['error']['message'];
			}
			if ( $msg === '' ) {
				$msg = sprintf( 'HTTP %d', $code );
			}
			return new WP_Error( 'neo_pulse_chat_ai', $msg );
		}

		$text          = '';
		$finish_reason = '';
		if ( is_array( $data ) && isset( $data['choices'][0]['message']['content'] ) ) {
			$text = trim( (string) $data['choices'][0]['message']['content'] );
			if ( isset( $data['choices'][0]['finish_reason'] ) ) {
				$finish_reason = strtolower( trim( (string) $data['choices'][0]['finish_reason'] ) );
			}
		}

		if ( $text === '' ) {
			return new WP_Error( 'neo_pulse_chat_empty', __( 'AI returned empty content.', 'neo-pulse-wp' ) );
		}

		if ( self::is_truncated_finish_reason( $finish_reason ) ) {
			return new WP_Error(
				'neo_pulse_chat_truncated',
				__( 'AI response was cut off before completion. Please try again.', 'neo-pulse-wp' )
			);
		}

		return $text;
	}

	/**
	 * OpenRouter/model finish reasons that mean output hit the token cap.
	 */
	private static function is_truncated_finish_reason( string $finish_reason ): bool {
		if ( $finish_reason === '' ) {
			return false;
		}
		if ( $finish_reason === 'length' ) {
			return true;
		}
		return str_contains( $finish_reason, 'max_tokens' ) || str_contains( $finish_reason, 'length' );
	}

	/**
	 * Parse a JSON string from an LLM response, stripping markdown fences.
	 *
	 * @return array|null
	 */
	private static function parse_json_response( string $text ): ?array {
		$text = trim( $text );
		$text = preg_replace( '/^```(?:json)?\s*/i', '', $text );
		$text = preg_replace( '/\s*```$/', '', $text );
		$text = trim( $text );

		$decoded = json_decode( $text, true );
		return is_array( $decoded ) ? $decoded : null;
	}

	/**
	 * Normalize related topics from the card; no backfill.
	 *
	 * @param array<string,mixed>              $card
	 * @param array<int,array<string,mixed>>     $items
	 * @param array<int,array<string,mixed>>     $site_index
	 * @param array<int,string>                $exclude_topics
	 * @return array<string,mixed>
	 */
	public static function ensure_minimum_related_topics( array $card, string $user_message, array $items, array $site_index, array $exclude_topics ): array {
		unset( $items, $site_index );

		$topics = isset( $card['relatedTopics'] ) && is_array( $card['relatedTopics'] ) ? $card['relatedTopics'] : array();
		$topics = self::normalize_related_topics( $topics, $user_message, $exclude_topics );

		if ( ! empty( $topics ) ) {
			$card['relatedTopics'] = array_slice( $topics, 0, self::MAX_RELATED_TOPICS );
		} else {
			unset( $card['relatedTopics'] );
		}

		return $card;
	}

	/**
	 * @param array<int,string> $topics
	 * @return array<int,string>
	 */
	private static function normalize_related_topics( array $topics, string $user_message, array $exclude_topics ): array {
		$out  = array();
		$seen = array();
		foreach ( $topics as $topic ) {
			if ( ! is_string( $topic ) ) {
				continue;
			}
			$topic = trim( $topic );
			if ( $topic === '' ) {
				continue;
			}
			$key = strtolower( $topic );
			if ( isset( $seen[ $key ] ) ) {
				continue;
			}
			if ( self::should_skip_related_topic( $topic, $user_message, $exclude_topics, $seen ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$out[]        = $topic;
		}
		return $out;
	}

	/**
	 * @param array<int,string> $topics
	 * @return array<string,bool>
	 */
	private static function related_topic_key_map( array $topics ): array {
		$map = array();
		foreach ( $topics as $topic ) {
			if ( ! is_string( $topic ) ) {
				continue;
			}
			$key = strtolower( trim( $topic ) );
			if ( $key !== '' ) {
				$map[ $key ] = true;
			}
		}
		return $map;
	}

	/**
	 * @param array<string,bool> $seen
	 */
	private static function should_skip_related_topic( string $topic, string $user_message, array $exclude_topics, array $seen, bool $relax_exclude = false ): bool {
		$key = strtolower( trim( $topic ) );
		if ( $key === '' || isset( $seen[ $key ] ) ) {
			return true;
		}
		if ( self::topic_matches_user_message( $topic, $user_message ) ) {
			return true;
		}
		if ( $relax_exclude ) {
			return false;
		}
		foreach ( $exclude_topics as $exclude ) {
			if ( ! is_string( $exclude ) ) {
				continue;
			}
			if ( strtolower( trim( $exclude ) ) === $key ) {
				return true;
			}
		}
		return false;
	}

	private static function topic_matches_user_message( string $topic, string $message ): bool {
		$topic_norm   = strtolower( trim( $topic ) );
		$message_norm = strtolower( trim( $message ) );
		if ( $topic_norm === '' || $message_norm === '' ) {
			return false;
		}
		if ( $topic_norm === $message_norm ) {
			return true;
		}
		$prefix = 'tell me about ';
		if ( str_starts_with( $topic_norm, $prefix ) ) {
			$label = trim( substr( $topic_norm, strlen( $prefix ) ) );
			if ( $label !== '' && ( $message_norm === $label || str_contains( $message_norm, $label ) || str_contains( $label, $message_norm ) ) ) {
				return true;
			}
		}
		if ( str_starts_with( $message_norm, $prefix ) ) {
			$label = trim( substr( $message_norm, strlen( $prefix ) ) );
			if ( $label !== '' && ( $topic_norm === $label || str_contains( $topic_norm, $label ) || str_contains( $label, $topic_norm ) ) ) {
				return true;
			}
		}
		return false;
	}

	private static function related_topic_from_label( string $label ): string {
		$label = trim( wp_strip_all_tags( $label ) );
		if ( $label === '' ) {
			return '';
		}
		return 'Tell me about ' . $label;
	}

	/**
	 * @param array{label?:string,url?:string} $link
	 * @param array<int,array<string,mixed>>  $site_index
	 * @return array<string,mixed>|null
	 */
	private static function followup_item_for_link( array $link, array $site_index ): ?array {
		$url = isset( $link['url'] ) ? trim( (string) $link['url'] ) : '';
		if ( $url !== '' ) {
			$url_norm = Neo_Pulse_Wp_Chat_History::normalize_url( $url );
			foreach ( $site_index as $item ) {
				if ( empty( $item['url'] ) ) {
					continue;
				}
				if ( Neo_Pulse_Wp_Chat_History::normalize_url( (string) $item['url'] ) === $url_norm ) {
					return $item;
				}
			}
		}

		$label = isset( $link['label'] ) ? trim( (string) $link['label'] ) : '';
		if ( $label !== '' ) {
			return self::followup_item_for_text( $label, $site_index );
		}

		return null;
	}

	/**
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<string,mixed>|null
	 */
	private static function followup_item_for_text( string $text, array $site_index ): ?array {
		$label = self::followup_topic_label( $text, $site_index );
		if ( $label === '' ) {
			$label = trim( wp_strip_all_tags( $text ) );
		}
		if ( $label === '' ) {
			return null;
		}

		$label_norm = strtolower( $label );
		foreach ( $site_index as $item ) {
			$title = isset( $item['title'] ) ? strtolower( trim( (string) $item['title'] ) ) : '';
			if ( $title !== '' && $title === $label_norm ) {
				return $item;
			}
		}

		$fuzzy = Neo_Pulse_Wp_Chat_Rag::find_fuzzy_topic_pages( $label, $site_index, 1 );
		if ( ! empty( $fuzzy[0] ) && is_array( $fuzzy[0] ) ) {
			return $fuzzy[0];
		}

		return null;
	}

	/**
	 * @param array<string,mixed> $item
	 */
	private static function contextual_chip_text( array $item, string $user_message, string $answer_snippet ): string {
		unset( $user_message, $answer_snippet );

		$title = isset( $item['title'] ) ? trim( (string) $item['title'] ) : '';
		if ( $title === '' || self::is_generic_hub_item( $item ) ) {
			return '';
		}

		$type = isset( $item['type'] ) ? (string) $item['type'] : 'page';
		$short = self::short_title_for_chip( $title );

		if ( $type === 'post' ) {
			if ( str_contains( strtolower( $title ), '?' ) ) {
				return $short;
			}
			if ( preg_match( '/\b(how|what|why|when|where|can|should|do|does|is|are)\b/i', $title ) ) {
				return $short;
			}
			return 'Can you summarize ' . $short . '?';
		}

		if ( preg_match( '/\b(repair|install|service|clean|consult|quote|book|warranty|maintenance)\b/i', $title ) ) {
			return 'What should I know about ' . $short . '?';
		}

		return 'What does ' . $short . ' cover?';
	}

	private static function short_title_for_chip( string $title ): string {
		$title = trim( wp_strip_all_tags( $title ) );
		$title = preg_replace( '/\s*[|\-:]\s*.+$/u', '', $title );
		return trim( (string) $title );
	}

	/**
	 * @param array<string,mixed> $item
	 */
	private static function is_generic_hub_item( array $item ): bool {
		$title = isset( $item['title'] ) ? strtolower( trim( (string) $item['title'] ) ) : '';
		if ( in_array( $title, array( 'blog', 'blogs', 'news', 'articles', 'resources' ), true ) ) {
			return true;
		}

		$url = isset( $item['url'] ) ? strtolower( rtrim( (string) $item['url'], '/' ) ) : '';
		if ( $url !== '' && preg_match( '#/(blog|news|articles?)$#', $url ) ) {
			$type = isset( $item['type'] ) ? (string) $item['type'] : '';
			return $type !== 'post';
		}

		return false;
	}

	/**
	 * @param array<string,mixed> $item
	 */
	private static function related_topic_from_item( array $item ): string {
		return self::contextual_chip_text( $item, '', '' );
	}

	/**
	 * @param array<int,array<string,mixed>> $items
	 * @return array<string,bool>
	 */
	private static function primary_item_url_map( array $items ): array {
		$map = array();
		foreach ( $items as $item ) {
			if ( empty( $item['url'] ) ) {
				continue;
			}
			$map[ strtolower( rtrim( (string) $item['url'], '/' ) ) ] = true;
		}
		return $map;
	}

	/**
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<int,array<string,mixed>>
	 */
	private static function sort_index_for_topic_backfill( array $site_index ): array {
		$pages = array();
		$rest  = array();
		foreach ( $site_index as $item ) {
			if ( isset( $item['type'] ) && (string) $item['type'] === 'page' ) {
				$pages[] = $item;
			} else {
				$rest[] = $item;
			}
		}
		return array_merge( $pages, $rest );
	}
}
