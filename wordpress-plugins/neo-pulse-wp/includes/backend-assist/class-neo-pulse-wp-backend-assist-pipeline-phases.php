<?php
/**
 * Backend Assist — plan, execute, reason, and format AI phases
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Pipeline_Phases {

	/**
	 * Shared God Mode voice: light, scannable, minimal markdown.
	 */
	private static function god_mode_copy_style_rules(): string {
		return <<<'STYLE'

GOD MODE COPY STYLE (mandatory):
- Be concise. Fewer words beat long reports. No filler intros or recap paragraphs.
- Emphasis: **bold** only. Never wrap titles, keywords, or phrases in quotation marks.
- No italics, blockquotes, ALL CAPS headers, or decorative punctuation.
- Lists: flat numbered (1. 2. 3.) or simple bullets. One level only. No nested sub-bullets.
- Section labels: **Label:** then content. Skip boilerplate headers like Key Observations or Next Steps unless the user asked for a formal report.
- Post and page titles: plain text (How To Measure Blinds), never quoted.
- URLs: real https links from tool RESULT or inventory only. Never example.com or # placeholders.
- When citing posts, include the real URL inline or as a markdown link.
STYLE;
	}

	/**
	 * Strip markdown noise from card title/body after format phase.
	 *
	 * @param array<string, mixed> $card
	 * @return array<string, mixed>
	 */
	private static function normalize_card_copy( array $card ): array {
		if ( isset( $card['title'] ) ) {
			$title = (string) $card['title'];
			$title = preg_replace( '/\*+/', '', $title );
			$title = trim( $title, " \t\n\r\0\x0B\"'" );
			$card['title'] = $title;
		}
		return $card;
	}

	public static function phase_plan( string $message, array $history, string $tool, array $params, array $options = array() ): array {
		$site_name         = get_bloginfo( 'name' );
		$tool_descriptions = Neo_Pulse_Wp_Backend_Assist_Registry::get_tool_descriptions();

		$history_text = '';
		foreach ( array_slice( $history, -6 ) as $entry ) {
			$role          = isset( $entry['role'] ) ? ucfirst( $entry['role'] ) : 'User';
			$history_text .= "{$role}: {$entry['content']}\n";
		}

		$params_json = wp_json_encode( $params, JSON_UNESCAPED_SLASHES );

		$post_id             = isset( $params['post_id'] ) ? absint( $params['post_id'] ) : 0;
		$post_context_block  = '';
		$focus_keyword_context = '';
		$fk                  = '';
		if ( $post_id > 0 ) {
			$post_context_block = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::build_post_context_for_plan( $post_id );
			$fk                 = get_post_meta( $post_id, '_neo_pulse_focus_keyword', true );
		}
		if ( $fk === '' && ! empty( $params['focus_keyword'] ) ) {
			$fk = sanitize_text_field( $params['focus_keyword'] );
		}
		if ( $fk !== '' && $post_context_block === '' ) {
			$focus_keyword_context = "FOCUS KEYWORD for this post: \"{$fk}\" — use this topic to guide content generation.\n";
		}
		if ( $post_id > 0 ) {
			$gsc_block = Neo_Pulse_Wp_Gsc_Prompt::for_post( $post_id, $fk );
			if ( $gsc_block !== '' ) {
				$post_context_block .= "Search Console queries (use naturally, do not keyword-stuff):\n{$gsc_block}\n";
			}
		}

		$interpretation_rules = '';
		if ( $post_context_block !== '' ) {
			$interpretation_rules = <<<'INTERP'

POST CONTEXT INTERPRETATION (mandatory when POST CONTEXT is present):
- Read the POST CONTEXT block before finalizing params.
- Interpret informal or marketing language from user intent plus post topic, not as literal text to paste into titles, meta, or body.
- Never output bare acronyms or internal field names (CTA, SEO, H1, FAQ, etc.) as user-facing copy unless the user explicitly quotes that exact string.
- Never paste the user's instruction sentence (or fragments like "pipeline character with a cta") into post_title, seoTitle, metaDescription, or body HTML.
- For update_post title edits: output the complete new post_title. Pipe suffixes must be short reader-facing phrases derived from the post content and site voice.
- For save_post_meta: seoTitle, metaDescription, and focusKeyword must be reader-facing copy grounded in the post.
- NEVER output placeholder, filler, or field-label text (e.g. "placeholder", "keyword focus", "TBD", "lorem ipsum") for seoTitle, metaDescription, focusKeyword, faq, or seoResearch. Infer real in-context copy from POST CONTEXT instead.
- When the user says "for acf", "to acf", or "acf fields", they mean the ACF SEO meta fields on THIS post (keyword focus, meta description), NOT a page about the Advanced Custom Fields plugin. Topic always comes from post_title and body_excerpt.
- For add_content: HTML must align with existing sections and the user's intent.
- For add_content with mode "ops": treat the user message as a WYSIWYG edit brief. Set mode "ops", leave content empty, set link_count when user specifies a number. Do not paste URLs into params.
- For add_content with mode "edit" or "surgical": same as mode "ops".

INTERP;
		}

		$meta_constraints_block = '';
		if ( $tool === 'save_post_meta' ) {
			$constraints = isset( $options['meta_constraints'] ) && is_array( $options['meta_constraints'] )
				? $options['meta_constraints']
				: Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::extract_meta_copy_constraints( $message );
			$meta_constraints_block = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::meta_copy_constraints_prompt_block( $constraints, $message );
		}

		$system = <<<PROMPT
You are the content reasoning engine for "Flow Assist", a WordPress backend specialist on "{$site_name}".

The classifier determined the user wants to run tool "{$tool}" with params: {$params_json}

YOUR JOB: Finalize the parameters so the tool can execute successfully. You MUST generate any content the user asks for.

CONVERSATION HISTORY:
{$history_text}

USER MESSAGE: {$message}

{$post_context_block}{$interpretation_rules}{$focus_keyword_context}{$meta_constraints_block}
AVAILABLE TOOLS:
{$tool_descriptions}

RULES:
1. RESOLVE REFERENCES: If params contain empty/missing values but the conversation history has the answer (e.g. a recent [post_id=X, title="Y"] tag), fill them in.
2. GENERATE CONTENT — THIS IS YOUR PRIMARY ROLE: When the tool is "add_content" and the "content" param is empty or the user asks you to write/generate/add content, YOU MUST produce the actual HTML content. Do NOT return empty content. Do NOT say you cannot generate content.
3. USE THE FOCUS KEYWORD: If a focus keyword is provided above, write content that is topically relevant, SEO-friendly, and centered on that keyword/topic.
4. USE GSC QUERIES: When Search Console query data is present, weave relevant queries naturally into headings and body copy.
4. CONTENT FORMAT: Generate well-structured semantic HTML. Use <h2>, <h3>, <p>, <ul>/<li> tags as appropriate. Write informative, useful paragraphs (2-4 sentences each).
5. If the user says "add paragraphs to each section" or "add content to each H2", generate a <p> paragraph under each existing <h2> on the page. Use the POST CONTEXT body_excerpt to see what headings exist.
6. If a post_id or title is missing but identifiable from history, fill it in.
7. For add_content with mode "ops": leave content empty; the server plans body_ops and applies them on existing HTML. Set link_count when the user requests internal links.
8. For other add_content: NEVER return empty "content" param when generating new sections. If the user wants content added, you MUST write it.
9. If "content_brief" is provided but "content" is empty (and mode is not ops), generate full HTML from the brief into "content".
10. Use mode "replace" when populating a newly created empty post or when replacing the full body. Use "append" only when adding to non-empty existing content without replacing it. Use mode "ops" for in-place WYSIWYG edits to existing HTML.
11. For tables use HTML <table>, <thead>, <tbody>, <tr>, <th>, <td>.
12. For tool "save_post_meta": infer focusKeyword from post title and GSC when missing. Use lowercase phrase style (e.g. "window covering blog ideas"). Include at least focusKeyword when user asks to add a focus keyword. Never save placeholder or field-label text.
13. For tool "update_post": set "title" to the FULL new WordPress post_title. Use current post_title from POST CONTEXT. Apply the user's edit using reader-facing copy from the post. Do NOT update post body.
14. For tool "add_content": NEVER set "content" to the user's raw message when they are giving instructions, corrections, field names, or undo requests.
15. For tool "restore_post_revision": only post_id is required. Use when user undoes a mistaken body edit.
16. For tool "save_post_meta" with faq: set "faq" to FAQPage JSON string only (plain JSON or script-wrapped JSON-LD for the ACF field). Never put FAQ schema in add_content.content.
17. For tool "add_content": never put FAQ schema, JSON-LD, or FAQPage objects in HTML body content.
18. For tool "save_post_meta" on meta refresh: you MUST output both seoTitle and metaDescription with new reader-facing copy. Do not set focusKeyword unless the user explicitly asked for keyword work. When USER FORMATTING REQUIREMENTS are present, both seoTitle and metaDescription must satisfy every rule.

OUTPUT only valid JSON:
{
  "tool": "{$tool}",
  "params": { ...fully resolved and complete params with generated HTML content... }
}
PROMPT;

		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter( Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL, $system, $message, 4096, 0.5 );
		if ( is_wp_error( $result ) ) {
			return array( 'tool' => $tool, 'params' => $params );
		}

		$parsed = Neo_Pulse_Wp_Backend_Assist_Ai::parse_json_response( $result );
		if ( ! is_array( $parsed ) || ! isset( $parsed['params'] ) ) {
			return array( 'tool' => $tool, 'params' => $params );
		}

		$resolved_tool   = isset( $parsed['tool'] ) ? $parsed['tool'] : $tool;
		$resolved_params = is_array( $parsed['params'] ) ? $parsed['params'] : $params;

		if ( ! isset( Neo_Pulse_Wp_Backend_Assist_Context::$tool_registry[ $resolved_tool ] ) ) {
			$resolved_tool = $tool;
		}

		return array( 'tool' => $resolved_tool, 'params' => $resolved_params );
	}
	/**
	 * @param mixed                $tool   Tool name (model output; validated here).
	 * @param array<string, mixed> $params Tool params.
	 * @return array<string, mixed>
	 */
	public static function phase_execute( $tool, array $params ): array {
		if ( ! is_string( $tool ) || $tool === '' || ! isset( Neo_Pulse_Wp_Backend_Assist_Context::$tool_registry[ $tool ] ) ) {
			return array(
				'success' => false,
				'error'   => sprintf(
					/* translators: %s: tool name */
					__( 'Unknown tool: %s', 'neo-pulse-wp' ),
					is_string( $tool ) ? sanitize_key( $tool ) : gettype( $tool )
				),
			);
		}
		$entry   = Neo_Pulse_Wp_Backend_Assist_Context::$tool_registry[ $tool ];
		$handler = is_array( $entry ) && isset( $entry['handler'] ) ? $entry['handler'] : null;
		if ( ! is_callable( $handler ) ) {
			return array(
				'success' => false,
				'error'   => __( 'Tool handler missing.', 'neo-pulse-wp' ),
			);
		}

		try {
			$result = call_user_func( $handler, $params );
			if ( is_wp_error( $result ) ) {
				return array(
					'success' => false,
					'error'   => $result->get_error_message(),
				);
			}
			return is_array( $result ) ? $result : array( 'success' => false, 'error' => __( 'Tool returned an invalid result.', 'neo-pulse-wp' ) );
		} catch ( \Throwable $e ) {
			return array(
				'success' => false,
				'error'   => $e->getMessage(),
			);
		}
	}
	public static function phase_reason_action( string $message, array $history, string $tool, array $params, array $result, bool $workflow_complete = false, string $steps_summary = '' ) {
		$result_json  = wp_json_encode( $result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
		$site_name    = get_bloginfo( 'name' );
		$params_label = isset( $params['title'] ) ? $params['title'] : wp_json_encode( $params );

		$history_text = '';
		foreach ( array_slice( $history, -4 ) as $entry ) {
			$role          = isset( $entry['role'] ) ? ucfirst( $entry['role'] ) : 'User';
			$history_text .= "{$role}: {$entry['content']}\n";
		}

		$workflow_rules = '';
		if ( $workflow_complete ) {
			$workflow_rules = <<<WF

MULTI-STEP WORKFLOW COMPLETED. All requested work from the user's original message is DONE.
Steps executed:
{$steps_summary}

RULES FOR WORKFLOW COMPLETION:
- Summarize everything that was completed in one cohesive answer.
- Do NOT list follow-up actions for work already requested (e.g. do not say "add H2s" if headings were part of the request).
- Do NOT suggest incomplete todos.
WF;
		}

		$system = <<<PROMPT
You are "Flow Assist", the backend technical specialist for "{$site_name}".
You just executed a WordPress operation. Summarize the result for the admin user.

TOOL EXECUTED: {$tool}
PARAMETERS: {$params_label}
RESULT:
{$result_json}

CONVERSATION:
{$history_text}
{$workflow_rules}

RULES:
- Be concise and direct.
- If successful, confirm what was created/done and provide the relevant URL(s).
- If failed, explain why clearly and suggest a fix.
- Include any edit or view links from the result.
- Use ONLY fields present in RESULT. Do not claim a title changed unless changed_fields includes title or the result title differs from previous_title.
- For update_post: report the new title from RESULT.title only.
- For add_content: report word_count from RESULT; do not claim title or SEO meta changed.
- For save_post_meta: list saved fields from RESULT.saved only.
- For restore_post_revision: confirm body was reverted; do not invent changes.
PROMPT;

		$system .= self::god_mode_copy_style_rules();

		if ( ! $workflow_complete ) {
			$system .= "\n- Suggest 2-3 logical next actions only when the user's original request may still be incomplete.";
		}

		$inventory_block = self::builder_inventory_prompt_block();
		if ( $inventory_block !== '' ) {
			$system .= "\n\n" . $inventory_block;
			if ( $tool === 'get_chat_insights' ) {
				$system .= "\n- Cross-check chat gaps against SITE INVENTORY. Do not recommend topics already covered by an existing URL or title.";
			}
		}

		if ( $tool === 'analyze_content_gaps' ) {
			$system .= <<<'GAP'

CONTENT GAP ANALYSIS RULES (mandatory):
- existing_blogs in RESULT is the authoritative list of blog posts already on this site.
- Do NOT suggest any blog idea whose topic is already covered by a title, URL slug, or focus_keyword in existing_blogs.
- Use chat_insights only to find visitor questions that existing_blogs do not answer.
- If a chat topic matches an existing post (e.g. Hunter Douglas vs Alta), skip it and cite the existing URL instead of suggesting a new post.
- Every idea must be net-new relative to existing_blogs. Prefer gaps where chat shows demand but no matching blog exists.
- Lead with what the site already covers, then list only genuine gaps.
- Format: numbered list of 10 ideas. One line each. **Idea title** then a short why in plain text. No sub-bullets.
GAP;
		}

		if ( $tool === 'grade_post_library_seo' ) {
			$system .= <<<'GRADE'

POST LIBRARY SEO GRADING RULES (mandatory):
- RESULT contains the full graded library (total posts). Grade the entire library. Never ask the user to pick a subset.
- Lead with aggregate summary counts from summary (A/B/C/D, missing_keyword, missing_meta).
- Highlight up to 10 posts needing work (grade D or C) with exact url from posts[].
- Highlight up to 5 strong posts (grade A) with exact url from posts[].
- Use site_top_queries only for optional recommendations, not to change per-post grades.
- Do not claim analysis is incomplete when total matches the library size.
GRADE;
		}

		if ( $tool === 'save_post_meta' ) {
			$system .= <<<'META'

SAVE POST META RULES (mandatory):
- Confirm which fields were saved using RESULT saved[] and values.
- Include edit_url and view_url from RESULT as links.
- Never give manual Yoast or Rank Math click-path instructions when the tool succeeded.
- If focusKeyword was inferred, state the keyword chosen and why.
- Saved meta must be in-context SEO copy, never placeholder or field-label filler.
META;
		}

		if ( in_array( $tool, array( 'create_post', 'create_page', 'add_content', 'save_post_meta' ), true ) ) {
			$system .= <<<'CREATE'

NEW OR UPDATED CONTENT RULES (mandatory):
- Always include edit_url and view_url from RESULT in links and in the body as markdown links.
- State the exact title and post_id from RESULT.
- For drafts, lead with the edit link. For published content, lead with the public view URL.
CREATE;
		}

		return Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter( Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL, $system, $message, 1536, 0.4 );
	}
	public static function phase_reason_question( string $message, array $history ) {
		$site_name = get_bloginfo( 'name' );
		$site_info = Neo_Pulse_Wp_Backend_Assist_Ai::build_site_context();

		$history_text = '';
		foreach ( array_slice( $history, -6 ) as $entry ) {
			$role          = isset( $entry['role'] ) ? ucfirst( $entry['role'] ) : 'User';
			$history_text .= "{$role}: {$entry['content']}\n";
		}

		$analytics_note = current_user_can( 'manage_options' )
			? "- You can analyze visitor chat logs, site search, Overseer engagement, and GSC data using the analytics tools.\n- Summarize knowledge gaps and suggest content or KB updates when relevant.\n"
			: "- Analytics tools (chat logs, search logs, Overseer) require site admin access.\n";

		$build_note = '';
		if (
			is_array( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context )
			&& ! empty( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['admin_submode'] )
			&& sanitize_key( (string) Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['admin_submode'] ) === 'build'
		) {
			$build_note = "- Build mode is active. Never claim you are read-only. If the user wants a site change, tell them to ask you to do it and you will execute it.\n";
		}

		$system = <<<PROMPT
You are "Flow Assist", the backend technical specialist for "{$site_name}".
You help WordPress administrators with backend operations, content management, and technical questions.

SITE CONTEXT:
{$site_info}

CONVERSATION:
{$history_text}

RULES:
- Answer questions about WordPress administration, content structure, and site configuration.
- Be concise and technical when appropriate.
- If the user wants to perform an action, tell them they can ask you to do it directly.
- Mention available capabilities: create pages, create posts, list content.
- God Mode uses Ask / Plan / Build submodes in the composer. You cannot switch modes yourself; the user uses the mode pill or the Switch to Build chip on blocked cards.
{$build_note}{$analytics_note}- Suggest relevant follow-up actions.
PROMPT;

		$system .= self::god_mode_copy_style_rules();

		$inventory_block = self::builder_inventory_prompt_block();
		if ( $inventory_block !== '' ) {
			$system .= "\n\n" . $inventory_block;
		}

		return Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter( Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL, $system, $message, 1536, 0.5 );
	}
	public static function phase_format( string $answer, string $card_type, bool $workflow_complete = false ) {
		$suggested_rules = $workflow_complete
			? '- "suggested_actions": optional extras only (e.g. "Open in editor", "Publish post", "Create another"). Use [] if nothing useful. NEVER repeat work already done.'
			: '- "suggested_actions" should be 2-4 short actionable follow-ups only for work NOT already covered in the answer.';

		$system = <<<PROMPT
Convert this assistant answer into ONLY valid JSON:
{
  "type": "{$card_type}",
  "title": "short plain summary",
  "body": "answer with light markdown",
  "links": [{"label": "text", "url": "https://...", "icon": "page|post|external|edit"}],
  "cta": {"label": "button text", "url": "https://..."},
  "suggested_actions": ["Create another page", "View all drafts", "Edit this post"],
  "confidence": "high|medium|low"
}

Rules:
- "title": plain text only. No markdown, no quotes, under 12 words.
- For type "answer" with no tool execution in the input: never use past-tense completion titles (Added, Updated, Created, Inserted). Use Suggested, Recommended, or Here are instead. State clearly when nothing was written to the post yet.
- "body": keep the answer short. Use **bold** for labels only. No quoted phrases. Flat lists only.
- "links" should contain every real URL from the answer. Never example.com or "#".
- Use exact https URLs from the answer or tool RESULT.
{$suggested_rules}
- Output ONLY the JSON object.
PROMPT;

		$system .= self::god_mode_copy_style_rules();

		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter( Neo_Pulse_Wp_Backend_Assist_Context::FAST_MODEL, $system, $answer, 1536, 0.1 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$parsed = Neo_Pulse_Wp_Backend_Assist_Ai::parse_json_response( $result );
		if ( null === $parsed || ! isset( $parsed['title'] ) ) {
			return new WP_Error( 'neo-pulse_backend_format', 'Format phase failed.' );
		}

		$parsed['type']       = isset( $parsed['type'] ) ? $parsed['type'] : $card_type;
		$parsed['confidence'] = isset( $parsed['confidence'] ) ? $parsed['confidence'] : 'medium';

		return self::normalize_card_copy( $parsed );
	}

	/**
	 * @return string
	 */
	private static function builder_inventory_prompt_block(): string {
		if ( ! is_array( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context ) ) {
			return '';
		}

		$blocks = array();
		if ( ! empty( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['site_blog_inventory_summary'] ) ) {
			$blog = (string) Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['site_blog_inventory_summary'];
			$blocks[] = "EXISTING BLOG POSTS (cached site inventory):\n{$blog}";
		}
		if ( ! empty( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['site_inventory_summary'] ) ) {
			$inventory = (string) Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['site_inventory_summary'];
			$blocks[]  = "SITE INVENTORY (all post types):\n{$inventory}";
		}

		return implode( "\n\n", $blocks );
	}

	/**
	 * Plan-mode narrative (no deliverables — approach only).
	 *
	 * @param array<int, array<string, mixed>> $history
	 * @param array<string, mixed>             $context From Plan_Preview::build_context()
	 * @return array<string, mixed>|null
	 */
	public static function phase_plan_narrative( string $message, array $history, array $context ) {
		$site_name         = get_bloginfo( 'name' );
		$tool              = isset( $context['tool'] ) ? sanitize_key( (string) $context['tool'] ) : '';
		$params            = isset( $context['params'] ) && is_array( $context['params'] ) ? $context['params'] : array();
		$params_json       = wp_json_encode( $params, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE );
		$post_context      = isset( $context['post_context'] ) ? (string) $context['post_context'] : '';
		$task_labels_json  = wp_json_encode( $context['task_labels'] ?? array(), JSON_UNESCAPED_UNICODE );
		$op_summaries_json = wp_json_encode( $context['op_summaries'] ?? array(), JSON_UNESCAPED_UNICODE );
		$workflow_title    = trim( (string) ( $context['workflow_title'] ?? '' ) );
		$intent_line       = trim( (string) ( $context['intent_restatement'] ?? '' ) );
		$meta_constraints  = isset( $context['meta_constraints'] ) && is_array( $context['meta_constraints'] )
			? $context['meta_constraints']
			: array();
		$meta_fields_json  = wp_json_encode( $context['meta_fields_requested'] ?? array(), JSON_UNESCAPED_UNICODE );
		$meta_format_block = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::meta_copy_constraints_prompt_block( $meta_constraints, $message );

		$history_text = '';
		foreach ( array_slice( $history, -6 ) as $entry ) {
			$role          = isset( $entry['role'] ) ? ucfirst( (string) $entry['role'] ) : 'User';
			$content       = isset( $entry['content'] ) ? (string) $entry['content'] : '';
			$history_text .= "{$role}: {$content}\n";
		}

		$system = <<<PROMPT
You are a WordPress backend planning assistant for "{$site_name}" in **Plan mode**.

The user will review your plan and switch to Build to execute. You must describe HOW the work will be done, not produce the final deliverable.

OUTPUT ONLY valid JSON:
{
  "goal": "One sentence outcome (max ~30 words).",
  "plan_description": "50-200 words explaining approach: tools, data sources, target post/sections, ops strategy, verification. Semantic reasoning only.",
  "tasks": ["Imperative step 1", "Step 2", "..."],
  "unchanged": ["What stays untouched, if relevant"]
}

MANDATORY RULES:
- NEVER output final HTML, heading copy, meta descriptions, FAQ Q&A, JSON-LD, seo titles, focus keyword phrases, or example sentences meant for the live post.
- NEVER paste or invent the user's deliverable text. Describe what Build will generate, not the generated text.
- Tasks must be the CHECKLIST LABELS when that list is non-empty. Do not replace them with a single create_page or create_post call.
- plan_description must be 50-200 words.
- If ambiguous, state assumptions in plan_description without inventing copy.
- For body ops paths, reference section targeting and op types, not rewritten prose.
- For workflows, explain step order and dependencies without slot HTML or section drafts.
- A new page or post always includes focus keyword, SEO title, meta description, and content. NEVER say meta or content was not requested.
- When checklist labels include Compose Elementor sections, plan_description MUST say Build will write the section copy and design THIS page with native Elementor widgets.
- When checklist labels include H2: or H3: rows, plan_description MUST name those headings. Those headings are the page sections. Do not hide them behind "structured content" or "relevant sections".

CLASSIFIED TOOL: {$tool}
RESOLVED PARAMS (sanitized, no body copy): {$params_json}
CHECKLIST LABELS: {$task_labels_json}
BODY OP SUMMARIES: {$op_summaries_json}
WORKFLOW TITLE: {$workflow_title}
INTENT RESTATEMENT: {$intent_line}
META FIELDS REQUESTED: {$meta_fields_json}
{$meta_format_block}
{$post_context}
PROMPT;

		$user = trim( $history_text ) !== ''
			? "CONVERSATION:\n{$history_text}\nUSER REQUEST:\n{$message}"
			: "USER REQUEST:\n{$message}";

		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter(
			Neo_Pulse_Wp_Backend_Assist_Context::REASON_MODEL,
			$system,
			$user,
			1024,
			0.2
		);
		if ( is_wp_error( $result ) ) {
			return null;
		}

		$parsed = Neo_Pulse_Wp_Backend_Assist_Ai::parse_json_response( $result );
		if ( ! is_array( $parsed ) ) {
			return null;
		}

		$goal = trim( (string) ( $parsed['goal'] ?? '' ) );
		$plan = trim( (string) ( $parsed['plan_description'] ?? '' ) );
		if ( $goal === '' || $plan === '' ) {
			return null;
		}

		$tasks = array();
		if ( ! empty( $parsed['tasks'] ) && is_array( $parsed['tasks'] ) ) {
			foreach ( $parsed['tasks'] as $task ) {
				$label = trim( (string) $task );
				if ( $label !== '' ) {
					$tasks[] = $label;
				}
			}
		}

		$unchanged = array();
		if ( ! empty( $parsed['unchanged'] ) && is_array( $parsed['unchanged'] ) ) {
			foreach ( $parsed['unchanged'] as $row ) {
				$label = trim( (string) $row );
				if ( $label !== '' ) {
					$unchanged[] = $label;
				}
			}
		}

		return array(
			'goal'             => $goal,
			'plan_description' => $plan,
			'tasks'            => $tasks,
			'unchanged'        => $unchanged,
		);
	}
}
