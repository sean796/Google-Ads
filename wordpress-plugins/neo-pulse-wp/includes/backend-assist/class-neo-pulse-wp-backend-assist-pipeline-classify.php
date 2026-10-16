<?php
/**
 * Backend Assist — intent classification and workflow decomposition
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Pipeline_Classify {

	public static function phase_classify( string $message, array $history = array() ) {
		$tool_descriptions = Neo_Pulse_Wp_Backend_Assist_Registry::get_tool_descriptions();
		$site_name         = get_bloginfo( 'name' );

		$history_context = '';
		$recent = array_slice( $history, -6 );
		if ( ! empty( $recent ) ) {
			$lines = array();
			foreach ( $recent as $entry ) {
				$role    = isset( $entry['role'] ) ? ucfirst( $entry['role'] ) : 'User';
				$lines[] = "{$role}: {$entry['content']}";
			}
			$history_context = "CONVERSATION HISTORY:\n" . implode( "\n", $lines ) . "\n\n";
		}

		$system = <<<PROMPT
You are a WordPress backend operations classifier for "{$site_name}".
Given a user message (and conversation history if present), determine the user's intent.

AVAILABLE TOOLS:
{$tool_descriptions}

{$history_context}Output ONLY valid JSON:
{
  "intent": "action" or "needs_info" or "question",
  "tool": "tool_name" or "" if question,
  "params": { extracted parameters object },
  "missing": ["list of missing required params"] or [],
  "confidence": "high" or "medium" or "low"
}

INTENT RULES:
- "action": User wants a tool AND enough context exists to proceed (params given OR resolvable from history). Set this even if content needs generating.
- "needs_info": User wants a tool but CRITICAL info is truly unresolvable. Only use when history has NO relevant context.
- "question": User is asking a question, not requesting a tool action.

REQUIRED PARAMS:
- create_page REQUIRES: "title". Infer "focus_keyword" from the topic. OPTIONAL: "status" (default draft). A new page always means SEO meta and page content; the plan endpoint expands to that workflow.
- create_post REQUIRES: "title". Infer "focus_keyword" from the topic. OPTIONAL: "status" (default draft), "categories". A new post always means SEO meta and body content; the plan endpoint expands to that workflow.
- list_posts: no required params. OPTIONAL: "post_type", "count", "status". Sample only (default 10, max 50). NOT for full library audits.
- get_post REQUIRES at least one of: "post_id" or "title"
- add_content: needs a target (post_id or title) + content description. OPTIONAL: "mode" ("append" or "replace", default "append")
- update_post REQUIRES: post_id. OPTIONAL: title (full new post_title), status, excerpt, slug. NOT body HTML.
- restore_post_revision REQUIRES: post_id. Use for undo/revert after a mistaken body edit.

POST FIELD TARGET (mandatory — pick the correct tool):
- Change WordPress post title / rename / add pipe | / tweak headline → update_post with post_id only. Omit title in params; planning reads post context and outputs the full new post_title. NOT save_post_meta. NOT add_content.
- SEO title / meta title / Rank Math title → save_post_meta with seoTitle only. NOT update_post.
- Focus keyword → save_post_meta with focusKeyword.
- Meta description → save_post_meta with metaDescription.
- Date modifier / "set the date today" / update optimization date → save_post_meta with dateModifier set to today (ACF date_modifier field). NOT update_post.
- Clear / empty / remove an ACF meta field (seo research, focus keyword, meta description, faq, etc.) → save_post_meta. Omit value params; planning clears the named field.
- Run / build / refresh SEO research brief (DataForSEO + GSC + Semrush merge into ACF seo_research) → run_seo_research_brief with post_id. NOT save_post_meta with LLM text. Requires focus keyword on the post.
- FAQ schema / JSON-LD / structured FAQ data → save_post_meta with faq field only. NOT add_content. Schema is backend ACF only; never visible in post body.
- "for acf", "to acf", "acf fields", "keyword for acf", or similar on a post editor means save SEO meta INTO the ACF fields on the CURRENT POST. NOT content about the Advanced Custom Fields plugin. Omit focusKeyword and metaDescription from classifier params; planning writes copy from post context.
- FAQ table / visible FAQ section in post body → add_content with mode append. HTML table only; no script tags or raw JSON-LD in body.
- FAQ table AND schema in the same message → intent "action" with tool save_post_meta (compound runner handles both steps in Build mode).
- Body copy, H2s, paragraphs, tables, sections (new content blocks) → add_content with mode append or replace + content_brief. NEVER the user's raw message as content.
- In-place body edits on current post (internal links, format changes, bold/emphasis, convert section to table, delete section, strip schema from body, change/rename an H2/H3) → add_content with post_id, mode "ops", empty content. Deterministic body_ops only; do NOT full-body LLM regen.
- Follow-up edits ("change the intro h2", "rename that heading") use conversation history to target what the assistant just created on this post.
- Delete/remove/keep section, strip JSON-LD from body, convert prose to table, remove duplicate FAQ blocks → add_content with post_id, mode "ops", empty content.
- When user asks to delete or remove existing body content, NEVER use add_content append/replace generation.
- List site posts / inventory only (no write verbs like add/insert/change) → get_site_inventory read-only.
- Publish / draft / schedule / status → update_post with status.
- Slug / URL path → update_post with slug.
- Undo / revert / wrong field / "not the body" / "I said title" → restore_post_revision if undoing a body mistake; update_post if fixing title. NEVER add_content with the correction text.
- Inspect / show post details → get_post (read-only).
- Create new post/page → create_post or create_page. That request always includes focus keyword, SEO title, meta description, and content. Do not treat it as a title-only stub.
- Informal copy requests on the current post (title tweaks, action phrases, meta wording) → correct write tool with post_id set, but leave title/seoTitle/metaDescription/content values empty when they require interpretation from the post body. The planning phase reads full post context and generates reader-facing copy.

TITLE DISAMBIGUATION:
- In wp-admin post editor, "title" means WordPress post_title via update_post unless user says SEO title, meta title, or Rank Math title.
- Title suffixes, pipe separators, and rewrites are planned from full post context, not literal user jargon.

CORRECTION / UNDO:
- When user corrects a prior mistake (undo, revert, wrong field, not the body, I meant title), read conversation history. Do NOT treat the correction sentence as post body content.
- If the last assistant action was add_content on this post, prefer restore_post_revision.

CONTEXT RESOLUTION (VERY IMPORTANT):
- Assistant messages contain metadata like [post_id=123, title="My Page"]. This identifies the post that was just created or acted on.
- If the user says "it", "that post", "the page", "this one", "add to it", "add content", "add H2s", etc., resolve using the most recent [post_id=X, title="Y"] from history.
- When a recent [post_id=X] exists in history, the target IS known. Extract it into params.
- NEVER return "needs_info" for post_id/title if history contains [post_id=X, title="Y"].
- NEVER return "needs_info" for post_id when CURRENT POST CONTEXT is present in this prompt; use that post_id in params.

CRITICAL:
- If the user says "create a page" or "create a post" WITHOUT specifying a title, set intent to "needs_info" and list "title" in "missing".
- If conversation history shows user previously requested a tool and the CURRENT message provides the missing info (like a title), set intent to "action" and extract the params from the current message.
- For create_page/create_post, always set "focus_keyword" from the topic (e.g. "aiseo edmonton" for "create a page for aiseo edmonton").
- For add_content: ALWAYS set intent to "action" if the user indicates what to add (e.g. "add H2s", "add content", "write 5 headings", "add internal links", "bold key terms") — even if "content" param is empty. The planning phase generates it.
- For add_content with mode "ops": extract link_count when user says "add N internal links". Set post_id from CURRENT POST CONTEXT.
- For add_content with mode "edit" or "surgical": treat as mode "ops" (legacy alias).
- For add_content: ALWAYS set intent to "action" if a target post is identifiable from history metadata [post_id=X] — even if user just says "add to it".
- For add_content: only set "needs_info" if BOTH conditions are true: (1) no target post exists in history AND user doesn't name one, AND (2) user gives zero indication of what to write.
- CREATE PAGE/POST: Any request to create a page or post is intent "action" with create_page or create_post. ALWAYS create a NEW WordPress page/post. Never reuse, link to, or write onto the page the user is viewing. CURRENT POST CONTEXT is not the target. The plan expands to create + save_post_meta (focus keyword, SEO title, meta description) + content. Do not wait for the user to name meta or headings.
- COMPOUND CREATE PAGE: If the user asks to create a page with sections, blocks, or pasted copy, set intent "action" with create_page. The workflow composes native Elementor sections and designs the page.
- SECTIONS ON AN EXISTING ELEMENTOR PAGE: Adding Elementor sections or blocks to a page that already exists is not available (Block Builder was removed). Set intent "question" and tool "" so the answer can explain that new pages can be built here and existing Elementor pages are edited in Elementor. Blog posts still use add_content.
- GSC KEYWORDS: For "what keywords", "search console", "GSC data", or keyword research requests, use tool get_gsc_context with post_id when known.
- POST META / SEO FIELDS: For "add/set/update focus keyword", "add meta description", "fix SEO on post", or grading follow-up chips, use save_post_meta with post_id OR title.
- save_post_meta: at least one of post_id or title required. Optional: focusKeyword, metaDescription, seoTitle, faq, seoResearch. If keyword not given but user asks to add one, set intent "action" and omit focusKeyword (planning will infer).
- NEVER set focusKeyword, metaDescription, seoTitle, or seoResearch to placeholder text, field labels, or filler like "placeholder", "TBD", or "lorem ipsum". Omit those params so planning writes in-context copy from the post.
- CHAT INSIGHTS: For visitor questions, chat logs, knowledge gaps, unanswered topics, or "what are users asking", use get_chat_insights.
- SEARCH INSIGHTS: For site search queries, popular searches, or zero-result searches, use get_search_insights.
- OVERSEER: For engagement, pageviews, bounce rate, conversions, or behavioral analytics, use get_overseer_summary.
- OVERSEER TASKS: For open action items or Overseer recommendations, use list_overseer_tasks.
- SITE INVENTORY: For "what pages/posts do we have", URL coverage checks, or listing site content, use get_site_inventory. Do not use list_posts for full inventory scans.
- POST LIBRARY SEO: For "grade our posts", "audit post library", "how are our blogs for SEO", use grade_post_library_seo with post_type post. NOT list_posts.
- CONTENT GAPS / BLOG IDEAS: For blog post ideas, knowledge gaps for new customers, "based on our blogs/URLs", or content gap analysis, use analyze_content_gaps (NOT get_chat_insights alone). It loads the full cached blog inventory first, then chat logs.
- BLOG IDEATION (read-only): "blog post ideas", "10 blog ideas", "brainstorm titles", or "what should we write about" without create/publish language → analyze_content_gaps with intent "action". Do NOT use create_post for ideation-only requests.
- MODE SWITCH: "Switch to Build mode", "Switch to Plan mode", or "Switch to Ask mode" are UI commands, NOT tools. Set intent "question" and tool "".
- CHAT-ONLY QUESTIONS: Use get_chat_insights only when the user asks what visitors are asking with no content ideation request.
PROMPT;

		if (
			is_array( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context )
			&& ! empty( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['target_scope'] )
			&& sanitize_key( (string) Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['target_scope'] ) === 'site'
		) {
			$system .= "\nTARGET SCOPE: Site-wide. Do not assume a current post unless the user names one.\n";
		}

		if (
			is_array( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context )
			&& ( empty( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['target_scope'] )
				|| sanitize_key( (string) Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['target_scope'] ) !== 'site' )
			&& ! empty( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['frontend_page'] )
			&& is_array( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['frontend_page'] )
		) {
			$fp       = Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['frontend_page'];
			$fp_id    = absint( $fp['post_id'] ?? 0 );
			$fp_title = sanitize_text_field( (string) ( $fp['title'] ?? '' ) );
			$fp_url   = esc_url_raw( (string) ( $fp['url'] ?? '' ) );
			$fp_type  = sanitize_text_field( (string) ( $fp['type_label'] ?? 'page' ) );
			$fp_status = sanitize_key( (string) ( $fp['post_status'] ?? 'publish' ) );
			if ( $fp_id > 0 ) {
				$system .= <<<CTX

CURRENT POST CONTEXT (user is editing or viewing this post in wp-admin or on the live site):
post_id: {$fp_id}
title: {$fp_title}
url: {$fp_url}
type: {$fp_type}
status: {$fp_status}

Draft, scheduled, and future posts are valid targets when the user can edit them.
If the user asks to create a page or create a post, ignore this current post. Always output create_page or create_post. Do not apply or write to post_id {$fp_id}.
Default target for update_post, restore_post_revision, add_content, save_post_meta, get_post, get_gsc_context, focus keyword, meta description, and similar updates is post_id {$fp_id} only when the user is editing this page, not creating a new one.
When the user says "this post", "this page", "on this post", "the page im on", "add content to it", or similar, set post_id to {$fp_id} in params.
For FAQ table append requests on the current page, use add_content with post_id {$fp_id} and mode append; do not ask which page.
CTX;
			}
		}

		if (
			is_array( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context )
			&& ! empty( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['admin_submode'] )
		) {
			$submode = sanitize_key( (string) Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['admin_submode'] );
			if ( $submode === 'ask' ) {
				$system .= "\nGOD MODE SUBMODE: Ask (read-only). Classify write intents accurately, but the server will block execution. Prefer read-only tools for analytics and lookups.\n";
			} elseif ( $submode === 'plan' ) {
				$system .= "\nGOD MODE SUBMODE: Plan. Classify write intents accurately; execution is deferred and shown as a plan checklist.\n";
			} elseif ( $submode === 'build' ) {
				$system .= "\nGOD MODE SUBMODE: Build. Full tool execution is allowed when intent is action.\n";
			}
		}

		if (
			is_array( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context )
			&& ! empty( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['site_blog_inventory_summary'] )
		) {
			$blog_inv = (string) Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['site_blog_inventory_summary'];
			$system  .= <<<CTX

EXISTING BLOG POSTS (cached — do not suggest duplicate topics):
{$blog_inv}
CTX;
		}

		if (
			is_array( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context )
			&& ! empty( Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['site_inventory_summary'] )
		) {
			$inventory = (string) Neo_Pulse_Wp_Backend_Assist_Context::$builder_context['site_inventory_summary'];
			$system   .= <<<CTX

SITE INVENTORY (cached full sitemap — all post types):
{$inventory}
CTX;
		}

		$system .= "\n- Output ONLY the JSON object.\n";

		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter( Neo_Pulse_Wp_Backend_Assist_Context::FAST_MODEL, $system, $message, 512, 0.1 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$parsed = Neo_Pulse_Wp_Backend_Assist_Ai::parse_json_response( $result );
		if ( null === $parsed ) {
			return array(
				'intent' => 'question',
				'tool'   => '',
				'params' => array(),
			);
		}

		return $parsed;
	}
	public static function phase_decompose_workflow( string $message, array $history = array() ) {
		$tool_descriptions = Neo_Pulse_Wp_Backend_Assist_Registry::get_tool_descriptions();
		$site_name         = get_bloginfo( 'name' );
		$service_area_note = post_type_exists( 'service-area' )
			? 'The site has post_type "service-area" for service area / location posts.'
			: '';

		$history_context = '';
		foreach ( array_slice( $history, -6 ) as $entry ) {
			$role             = isset( $entry['role'] ) ? ucfirst( $entry['role'] ) : 'User';
			$history_context .= "{$role}: {$entry['content']}\n";
		}

		$system = <<<PROMPT
You are a workflow planner for WordPress Backend Assist on "{$site_name}".
Break the user request into an ordered checklist of tool steps, or return workflow:false for simple single-tool requests.

AVAILABLE TOOLS:
{$tool_descriptions}

{$service_area_note}

CONVERSATION:
{$history_context}

Output ONLY valid JSON:
{
  "workflow": true or false,
  "title": "short task title for the card",
  "steps": [
    { "tool": "create_post", "label": "human-readable step", "params": { } }
  ]
}

WORKFLOW TRUE when ANY of these apply:
- User asks to CREATE a page or post. Always. A new page/post always includes SEO meta and content. Never return a title-only create step.
- User asks to add FAQ schema AND FAQ table to an existing post in the same message (save_post_meta then add_content append).
- User asks for a multi-part deliverable in one message (e.g. create + write content + keyword, or create page + sections).

WORKFLOW FALSE when:
- User asks a question only.
- User wants list_posts, get_post, get_gsc_context, or add_content to an existing post from history only.
- Single in-place body edit on one section of an existing post (add/insert/create table in a section, convert section to table, bold/format one section, delete after FAQ table, internal links). One add_content step only — workflow false.

STEP RULES:
1. First step: create_post or create_page with title, focus_keyword, status, post_type if applicable.
2. Next step (always for a new page/post): save_post_meta with focusKeyword from the topic. Omit seoTitle and metaDescription so planning writes them.
3. New post body: add_content with mode "replace", "expand_sections": true, and content_brief. Do NOT put post_id in that step — filled after create.
4. New page content: native Elementor widgets. Use compose_elementor_page_sections (prompt = title, focus keyword and requested sections; user_copy = verbatim pasted copy when the user supplied it), then design_page_with_novamira. Post_id is filled after create. Never output Elementor library post IDs.
   create_page is always present when the user asked for a new page. Never omit it because they are viewing another page.
5. "service area post" → post_type "service-area" on create step when that type exists.
6. Each step needs a clear "label" for a UI checklist.
7. Infer title and focus_keyword from the user message when implied.

EXAMPLE (create page always includes meta and content):
User: "can you create a page for aiseo edmonton"
→ steps: [
  { "tool": "create_page", "label": "Create page AI SEO Edmonton", "params": { "title": "AI SEO Edmonton", "focus_keyword": "aiseo edmonton" } },
  { "tool": "save_post_meta", "label": "Save SEO meta", "params": { "focusKeyword": "aiseo edmonton" } },
  { "tool": "compose_elementor_page_sections", "label": "Compose Elementor sections", "params": { "prompt": "AI SEO Edmonton. Focus keyword aiseo edmonton." } },
  { "tool": "design_page_with_novamira", "label": "Design page with Novamira", "params": {} }
]

EXAMPLE (plain content workflow):
User: "Create a blog post titled seo near whyte ave, use that as keyword focus, add 5 h2's and content for each with a list and table"
→ steps: [
  { "tool": "create_post", "label": "Create blog post SEO Near Whyte Ave", "params": { "title": "SEO Near Whyte Ave", "focus_keyword": "seo near whyte ave" } },
  { "tool": "save_post_meta", "label": "Save SEO meta", "params": { "focusKeyword": "seo near whyte ave" } },
  { "tool": "add_content", "label": "Add 5 H2 sections with copy, lists, and table", "params": { "mode": "replace", "content_brief": "Write 5 H2 sections, each with paragraph content and a bullet list; include one HTML table; focus keyword seo near whyte ave; topic Whyte Ave Edmonton SEO." } }
]

EXAMPLE (FAQ schema + table on existing post):
User: "add a faq table and schema and append the table to the end of the post content"
→ steps: [
  { "tool": "save_post_meta", "label": "Save FAQ schema to post meta", "params": { "post_id": FROM_CONTEXT } },
  { "tool": "add_content", "label": "Append FAQ HTML table", "params": { "mode": "append", "content_brief": "Append an HTML FAQ table with question and answer columns only. No JSON-LD or script tags." } }
]

EXAMPLE (Elementor page with named sections):
User: "Create a page about window treatments in Edmonton, add sections for types, benefits, and FAQ"
→ steps: [
  { "tool": "create_page", "label": "Create page Window Treatments Edmonton", "params": { "title": "Window Treatments Edmonton", "focus_keyword": "window treatments edmonton" } },
  { "tool": "save_post_meta", "label": "Save SEO meta", "params": { "focusKeyword": "window treatments edmonton" } },
  { "tool": "compose_elementor_page_sections", "label": "Compose Elementor sections", "params": { "prompt": "Window treatments in Edmonton: H2 sections for types of window treatments, benefits, and FAQ. Focus keyword window treatments edmonton." } },
  { "tool": "design_page_with_novamira", "label": "Design page with Novamira", "params": {} }
]

Output ONLY the JSON object.
PROMPT;

		$result = Neo_Pulse_Wp_Backend_Assist_Ai::call_openrouter( Neo_Pulse_Wp_Backend_Assist_Context::FAST_MODEL, $system, $message, 1024, 0.15 );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$parsed = Neo_Pulse_Wp_Backend_Assist_Ai::parse_json_response( $result );
		if ( null === $parsed ) {
			return array( 'workflow' => false, 'steps' => array() );
		}

		return self::replace_removed_block_steps( $parsed );
	}

	/**
	 * Block Builder (SEO blocks) was removed in 0.9.232. If the planner still returns its old steps,
	 * turn a compose into native Elementor section copy and drop the save/apply/duplicate steps.
	 *
	 * @param array<string, mixed> $decomposed Planner output.
	 * @return array<string, mixed>
	 */
	public static function replace_removed_block_steps( array $decomposed ): array {
		if ( empty( $decomposed['steps'] ) || ! is_array( $decomposed['steps'] ) ) {
			return $decomposed;
		}
		$compose_like = array( 'compose_seo_block', 'duplicate_seo_block' );
		$removed      = array( 'save_seo_block', 'apply_seo_block_to_page', 'create_seo_block', 'list_seo_blocks', 'get_seo_block', 'delete_seo_block', 'modify_seo_block_slots' );
		$out          = array();
		foreach ( $decomposed['steps'] as $step ) {
			if ( ! is_array( $step ) ) {
				continue;
			}
			$tool = sanitize_key( (string) ( $step['tool'] ?? '' ) );
			if ( in_array( $tool, $removed, true ) ) {
				continue;
			}
			if ( in_array( $tool, $compose_like, true ) ) {
				$old    = isset( $step['params'] ) && is_array( $step['params'] ) ? $step['params'] : array();
				$params = array();
				foreach ( array( 'prompt', 'user_copy', 'section_h2' ) as $key ) {
					if ( isset( $old[ $key ] ) && '' !== (string) $old[ $key ] ) {
						$params[ $key ] = $old[ $key ];
					}
				}
				if ( empty( $params['prompt'] ) && ! empty( $old['title'] ) ) {
					$params['prompt'] = (string) $old['title'];
				}
				$step = array(
					'tool'   => 'compose_elementor_page_sections',
					'label'  => __( 'Compose Elementor sections', 'neo-pulse-wp' ),
					'params' => $params,
				);
			}
			$out[] = $step;
		}
		$decomposed['steps'] = $out;
		return $decomposed;
	}
}
