---
title: Tools reference
slug: god-mode/tools
section: God Mode
order: 20
---

<!-- manual -->

Backend Assist registers tools in `class-neo-pulse-wp-backend-assist-registry.php`. The classifier picks a tool; content prep may reroute before execution.

## Read-only tools (Ask-safe)

| Tool | Description | Notes |
| --- | --- | --- |
| `get_chat_insights` | Visitor chat log summary, knowledge gaps | Default 30 days; requires `manage_options` |
| `get_search_insights` | Site search popular and zero-result queries | |
| `get_overseer_summary` | Behavioral analytics (sessions, pageviews, engagement) | |
| `list_overseer_tasks` | Open Overseer actionable tasks | |
| `get_site_inventory` | Cached full-site content inventory | Optional post_type, query, limit |
| `analyze_content_gaps` | Blog inventory vs chat gaps for new content ideas | Not for duplicate-topic suggestions |
| `grade_post_library_seo` | Full post library SEO grading | On-page signals |
| `get_gsc_context` | GSC keyword/query data for post or site | |
| `list_posts` | Sample post list | Default 10, max 50; not full inventory |
| `get_post` | Single post details | Requires post_id or title |
| `list_seo_blocks` | Agent Hub SEO blocks list | id, title, focus keyword, status |
| `get_seo_block` | One Agent Hub block | block_id or exact title |

## Write tools (Plan preview / Build execute)

| Tool | Description | Key params |
| --- | --- | --- |
| `create_page` | New WordPress page | title (required), status, focus_keyword. Always a new page. Plan checklist: create page, then one Agent Hub Block Builder compose/save/apply triplet per H2 (new block each time). Build inserts the page, binds that post_id, and runs those Block Builder steps. Never post 9157 or an existing block. Novamira MCP is Elementor only, not H2 copy |
| `create_post` | New WordPress post | title (required), status, focus_keyword, categories. Plan always expands to save_post_meta plus add_content replace |
| `add_content` | Body HTML append/replace or mode `ops` | post_id, mode, content_brief |
| `update_post` | post_title, status, excerpt, slug | post_id; not body, not SEO meta |
| `save_post_meta` | ACF SEO fields | focusKeyword, metaDescription, seoTitle, faq, seoResearch, dateModifier; clear fields |
| `run_seo_research_brief` | SeoContentBriefV1 merge and auto-save | post_id, optional focusKeyword |
| `restore_post_revision` | Undo last agent body edit | post_id |
| `compose_seo_block` | Generate/optimize/analyze SEO block manifest | prompt, mode, user_copy |
| `compose_elementor_page_sections` | Section copy for native Elementor widgets (no Agent Hub) | prompt, section_h2, user_copy |
| `duplicate_seo_block` | New Agent Hub row from an existing block | block_id or title, optional user_copy |
| `modify_seo_block_slots` | Add/remove/update block slots | action, slot |
| `create_seo_block` | New empty draft SEO block | not enough for apply |
| `delete_seo_block` | Delete block | block_id |
| `save_seo_block` | Persist block manifest | block_id or manifest |
| `apply_seo_block_to_page` | Insert Elementor neo-pulse_seo_section widget | post_id, Agent Hub block_id with slots |
| `design_page_with_novamira` | Novamira-led Elementor page design | post_id; SEO blocks path needs saved slots; Elementor pill uses elementor_sections; Nov agent plus check-design; wp-cron when long-running |

Composer pill **SEO blocks** (default) vs **Elementor** sets `page_content_mode` on create_page workflows only.

## save_post_meta field map

| Hub key | ACF / use |
| --- | --- |
| focusKeyword | Focus keyword |
| metaDescription | Meta description |
| seoTitle | SEO title (NEO Pulse redirect / meta title) |
| faq | FAQ schema JSON (ACF only, not body) |
| seoResearch | SeoContentBriefV1 JSON |
| dateModifier | ACF date_modifier (YYYY-MM-DD) |

Clear phrasing ("clear seo research", "remove focus keyword") clears the named field without LLM copy.

## Compound runners (Build only)

These are not separate registry tools; the pipeline runs them for matched intents:

| Runner | Trigger | Steps |
| --- | --- | --- |
| FAQ compound | FAQ schema + table in same message | save_post_meta (faq) + add_content (table) |
| Body schema cleanup | Strip JSON-LD from body + FAQ schema | body ops + save_post_meta |
| Multi-step workflow | Create + content, create + SEO block, etc. | Decomposed steps with workflow_id |

## Classifier routing (natural language)

| User intent | Tool |
| --- | --- |
| Rename post title / pipe in headline | `update_post` |
| SEO title / meta title | `save_post_meta.seoTitle` |
| Focus keyword / meta description | `save_post_meta` |
| Date modifier / set date today | `save_post_meta.dateModifier` |
| Clear seo research or meta field | `save_post_meta` (clear) |
| Run/build SEO research brief | `run_seo_research_brief` |
| FAQ schema only | `save_post_meta.faq` |
| FAQ table in body | `add_content` append |
| In-place body edits | `add_content` mode ops |
| Publish / draft / status | `update_post.status` |
| Slug change | `update_post.slug` |
| Undo / revert body mistake | `restore_post_revision` |
| GSC keywords | `get_gsc_context` |
| Blog ideas / content gaps | `analyze_content_gaps` |
| Grade post library | `grade_post_library_seo` |
| Visitor questions | `get_chat_insights` |
| Site search analytics | `get_search_insights` |
| Apply SEO block to page | `apply_seo_block_to_page` |
| Create blocks / add pasted copy | `compose_seo_block` + `save_seo_block` then apply |
| Use existing Agent Hub template | `duplicate_seo_block` then apply |

## Early reroutes (content prep)

Before execution, these message patterns force a specific tool regardless of classifier output:

- Date modifier → `save_post_meta`
- Clear ACF meta field → `save_post_meta`
- SEO research brief → `run_seo_research_brief`
- FAQ schema-only (no table) → `save_post_meta`
- Undo / correction after body edit → `restore_post_revision`

Source: `class-neo-pulse-wp-backend-assist-pipeline-content-prep.php`
