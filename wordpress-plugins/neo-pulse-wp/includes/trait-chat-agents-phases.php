<?php
/**
 * Phase A/B orchestration and deterministic card building.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Agents_Trait_Phases {

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
}
