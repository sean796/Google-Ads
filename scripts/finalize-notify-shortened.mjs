#!/usr/bin/env node
/**
 * Merge MCP batch results, apply manual fixes for ≤48 chars, write notify-shortened.json
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const MAX = 48;
const source = JSON.parse(await readFile(join(ROOT, "docs/notify-to-shorten.json"), "utf8"));

/** id -> short (manual fixes for MCP over-length or banned phrases) */
const MANUAL = {
  NOTIFY_CONTENT_OPTIMIZATION_DISABLED_PROCEEDING: "Optimization off, uploading",
  NOTIFY_FAILED_TO_GENERATE_EXTRA_TEXT_CONTINUING: "Extra text failed, continuing",
  NOTIFY_FAILED_TO_GENERATE_EXTRA_IMAGE_CONTINUIN: "Extra image failed, continuing",
  NOTIFY_FAILED_TO_ENSURE_LINKS_IN_EXTRA_CONTENT_: "Extra content links failed, continuing",
  NOTIFY_POST_UPLOAD_COMPLETED_BUT_MAY_NOT_HAVE_B: "Upload done, success unclear",
  NOTIFY_CONTENT_OPTIMIZED_BUT_IMPLEMENTATION_REP: "Optimized, report generation failed",
  NOTIFY_CONTENT_SAVED_BUT_ORIGIN_FIELD_UPDATE_EN: "Saved, Origin field update failed",
  NOTIFY_CONTENT_SAVED_BUT_ACF_SEO_STEP_SKIPPED_C: "Saved, ACF SEO step skipped",
  NOTIFY_SEO_AI_RAN_BUT_NO_MATCHING_ACF_FIELDS_WE: "SEO AI ran, no ACF fields matched",
  NOTIFY_CONTENT_SAVED_BUT_ACF_SEO_OPTIMIZATION_E: "Saved, ACF SEO optimization failed",
  NOTIFY_IMAGE_GENERATED_BUT_MAY_NOT_HAVE_BEEN_IN: "Image generated, insert may have failed",
  NOTIFY_IN_CONTENT_IMAGE_WAS_NOT_PRESERVED_DURIN: "In-content image lost in conversion",
  NOTIFY_GOOGLE_MAPS_FEATURED_IMAGE_GENERATED_BUT: "Map image upload failed, continuing",
  NOTIFY_FEATURED_IMAGE_GENERATED_BUT_UPLOAD_FAIL: "Featured image upload failed",
  NOTIFY_FEATURED_IMAGE_GENERATION_FAILED_CONTINU: "Featured image failed, continuing",
  NOTIFY_STILL_INITIALIZING_THIS_ROW_TRY_AGAIN: "Row still loading",
  NOTIFY_SAVE_AN_ENTITY_URL_FOR_THIS_SITE_IN_INTE: "Save entity URL in Integrations",
  NOTIFY_DETECT_POSTS_FOR_THIS_PROPERTY_IN_INTEGR: "Detect posts in Integrations first",
  NOTIFY_POST_BATCH_DID_NOT_FINISH_SAP_ENTITY_BAT: "Post batch incomplete, SAP not started",
  NOTIFY_POST_BATCH_DID_NOT_FINISH_ENTITY_WAS_NOT: "Post batch incomplete, entity not started",
  NOTIFY_WORDPRESS_SITE_URL_USERNAME_AND_APPLICAT: "WordPress URL, user, password required",
  NOTIFY_OPENROUTER_API_KEY_REQUIRED_FOR_SEO_EXTR: "OpenRouter key needed for SEO text",
  NOTIFY_NO_TARGETS_COULD_RUN_CHECK_ROW_POST_IDS_: "No targets ran, check post IDs",
  NOTIFY_WORDPRESS_LINKS_UNAVAILABLE_CONTINUING_W: "WP links unavailable, continuing",
  NOTIFY_FAILED_TO_INITIALIZE_OPTIMIZATION_PLEASE: "Optimization init failed",
  NOTIFY_OPTIMIZATION_FUNCTION_NOT_READY_PLEASE_T: "Optimization not ready",
  NOTIFY_CONNECT_A_WORDPRESS_SITE_FIRST_IN_THE_IN: "Connect WordPress in Integrations",
  NOTIFY_NO_POST_ID_ON_GRID_ROWS_SCRAPE_OR_LOAD_T: "No post ID, load sitemap first",
  NOTIFY_NOTHING_TO_UPLOAD_ROWS_HAVE_NO_TITLE_MET: "Nothing to upload on these rows",
  NOTIFY_GENERATING_OPTIMIZED_BLUEPRINT_THIS_STEP: "Generating blueprint (30-60s)",
  NOTIFY_ANALYZING_KEYWORD_WITH_AI_ANALYZING_SERP: "Analyzing keyword and SERP",
  NOTIFY_SOME_FILES_WERE_REJECTED_ONLY_TEXT_PDF_J: "Some files rejected, see allowed types",
  NOTIFY_SET_GOOGLE_BUSINESS_PROFILE_LOCATION_ID_: "Set GBP Location ID in settings",
  NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_PLEASE_SE: "OpenRouter key required in Settings",
  NOTIFY_COULD_NOT_DETERMINE_GEOGRAPHIC_AREA_FROM: "Area unknown from URLs, add cities",
  NOTIFY_DATAFORSEO_SEARCH_FAILED_FALLING_BACK_TO: "DataForSEO failed, using Wikipedia",
  NOTIFY_COULD_NOT_SELECT_A_WIKIPEDIA_LIST_PAGE_P: "Wikipedia list page not found",
  NOTIFY_SEARCHING_FOR_MORE_ENTITIES_WITH_ALTERNA: "Searching entities, alt query",
  NOTIFY_SERVER_ERROR_WHILE_PARSING_SITEMAP_FOR_B: "Sitemap parse server error",
  NOTIFY_QUARTER_COUNTS_ARE_NOT_READY_USE_REFRESH: "Quarter counts not ready, refresh",
  NOTIFY_PLEASE_SELECT_A_TITLE_OPTION_OR_ENTER_A_: "Pick a title or enter custom",
  NOTIFY_INVALID_BLUEPRINT_FLOW_V2_JSON_REQUIRED_: "Invalid blueprint, need Flow v2 JSON",
  NOTIFY_THIS_BLUEPRINT_USES_A_RETIRED_FORMAT_CRE: "Retired blueprint format",
  NOTIFY_SELECTED_WIKIPEDIA_CATEGORIES_HAD_NO_PAG: "Wikipedia categories had no pages",
  NOTIFY_AGENTMAIL_API_KEY_SAVED_USED_FOR_COMMUNI: "AgentMail key saved",
  NOTIFY_CLIENT_ID_SHOULD_BE_THE_FULL_VALUE_FROM_: "Use full Google Cloud Client ID",
  NOTIFY_GSC_QUERIES_FETCHED_BUT_KEYWORD_ANALYSIS: "GSC fetched, keyword analysis failed",
  NOTIFY_NO_ANALYSIS_RESULTS_GENERATED_PLEASE_CHE: "No analysis results",
  NOTIFY_SCRAPER_FINISHED_BUT_NO_PAGES_WERE_STORE: "Scraper finished, no pages stored",
  NOTIFY_BLUEPRINT_RESET_SUCCESSFUL_READY_FOR_A_N: "Blueprint reset, ready for new",
  NOTIFY_WORKSPACE_RESET_SUCCESSFUL_ALL_CACHE_CLE: "Workspace reset, cache cleared",
  NOTIFY_DRAFT_IS_INVALID_OR_USES_A_RETIRED_FORMA: "Draft invalid or retired format",
  NOTIFY_CHECKLIST_GENERATED_PLEASE_REVIEW_AND_AP: "Checklist ready, review it",
  NOTIFY_KEYWORD_DATA_AND_H2_SECTIONS_ARE_REQUIRE: "Keyword data and H2 sections needed",
  NOTIFY_COULD_NOT_GENERATE_A_VALID_CHECKLIST_PLE: "Checklist generation failed",
  NOTIFY_FAILED_TO_GENERATE_CHECKLIST_PLEASE_TRY_: "Checklist generation failed",
  NOTIFY_FAILED_TO_UPDATE_DRAFT_REPORT_PLEASE_TRY: "Draft report update failed",
  NOTIFY_FAILED_TO_UPDATE_FINAL_REPORT_PLEASE_TRY: "Final report update failed",
  NOTIFY_FAILED_TO_UPDATE_PLAN_PLEASE_TRY_AGAIN: "Plan update failed",
  NOTIFY_PLEASE_SELECT_A_SECTION_TO_INSERT_THE_IM: "Select a section for the image",
  NOTIFY_ADD_AT_LEAST_ONE_TARGET_KEYWORD_OR_CONNE: "Add keyword or connect WordPress",
  NOTIFY_WORDPRESS_POST_LIBRARY_IS_EMPTY_ADD_KEYW: "WP library empty, add keywords",
  NOTIFY_ADD_SAP_BUDGET_ON_MEMBER_ROWS_OR_A_SINGL: "Add SAP budget on member rows",
  NOTIFY_ENTER_A_WHOLE_NUMBER_FOR_TOTAL_SAP_PAGES: "Enter whole number for SAP pages",
  NOTIFY_CONNECT_A_SITE_WITH_A_BUSINESS_NAME_IN_I: "Connect site with business name",
  NOTIFY_ENTER_A_WEBSITE_URL_OR_A_FOCUS_LOCATION_: "Enter site URL or focus location",
  NOTIFY_NO_WORDPRESS_POST_LIST_IN_THIS_RESPONSE_: "No WP post list in response",
  NOTIFY_INTERNAL_ERROR_ROW_INDEX_MAPPING_DOES_NO: "Row index mapping error",
  NOTIFY_INVALID_TARGET_SITE_EXAMPLE_COM_IS_NOT_A: "example.com not allowed as target",
  NOTIFY_SET_YOUR_OPENROUTER_API_KEY_IN_THE_MANAG: "Set OpenRouter key in Manager",
  NOTIFY_NO_CLARIFICATION_NEEDED_RUN_OUTLINE_OR_F: "No clarification needed",
  NOTIFY_ANSWER_CLARIFICATION_QUESTIONS_THEN_CLIC: "Answer clarifications, regenerate",
  NOTIFY_ALL_BLOG_IDEAS_ARE_ALREADY_SELECTED_PLEA: "Deselect blog ideas to regenerate",
  NOTIFY_FETCHING_FULL_WORDPRESS_INVENTORY_POSTS_: "Fetching WP inventory",
  NOTIFY_BROWSER_STORAGE_IS_FULL_SO_THE_INVENTORY: "Storage full, inventory not saved",
  NOTIFY_KNOWLEDGE_BASE_IS_EMPTY_BLOG_IDEAS_WILL_: "KB empty, ideas without context",
  NOTIFY_COULD_NOT_PARSE_BLOG_IDEAS_FROM_THE_RESP: "Blog ideas parse failed",
  NOTIFY_PLEASE_SET_YOUR_OPENROUTER_API_KEY_INSID: "Set OpenRouter key in Manager",
  NOTIFY_REQUEST_TOO_LARGE_REDUCE_KNOWLEDGE_BASE_: "Request too large, shrink KB",
  NOTIFY_RATE_LIMIT_EXCEEDED_WAIT_A_MOMENT_AND_TR: "Rate limited",
  NOTIFY_QUARTER_COUNTS_ARE_NOT_READY_OR_THERE_IS: "Quarter counts not ready",
  NOTIFY_ADD_YOUR_OPENROUTER_API_KEY_IN_SETTINGS_: "Add OpenRouter key in Settings",
  NOTIFY_WORDPRESS_CREDENTIALS_ARE_REQUIRED_FOR_S: "WordPress credentials required",
  NOTIFY_KNOWLEDGE_BASE_IS_EMPTY_IDEAS_WILL_USE_S: "KB empty, using inventory only",
  NOTIFY_COULD_NOT_PARSE_BLOG_IDEAS_FROM_THE_MODE: "Blog ideas parse failed",
  NOTIFY_COULD_NOT_PARSE_LOCAL_GEO_LANDING_IDEAS_: "Geo landing ideas parse failed",
  NOTIFY_COULD_NOT_PARSE_IDEAS_FROM_THE_MODEL_RES: "Ideas parse failed",
  NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_TO_EXTRAC: "OpenRouter key needed for PAA",
  NOTIFY_COULD_NOT_FIND_THAT_FILE_IN_KNOWLEDGE_BA: "File not found in Knowledge Base",
  NOTIFY_PLEASE_DESELECT_AT_LEAST_ONE_BLOG_IDEA_T: "Deselect a blog idea first",
  NOTIFY_LOCAL_EXPORT_GENERATING_FILES_ONLY_NO_WO: "Local export, files only",
  NOTIFY_SELECT_A_WORDPRESS_SITE_AND_SITEMAP_IN_T: "Select WP site and sitemap",
  NOTIFY_DATAFORSEO_API_KEY_IS_REQUIRED_DASHBOARD: "DataForSEO key required",
  NOTIFY_NO_PUBLISHED_POSTS_OR_PAGES_IN_INVENTORY: "No published posts in inventory",
  NOTIFY_COULD_NOT_FETCH_SERP_CHECK_DATAFORSEO_AN: "SERP fetch failed",
  NOTIFY_NO_EXTERNAL_ORGANIC_URL_FOR_THAT_SEARCH_: "No external organic URL",
  NOTIFY_NO_ORGANIC_RESULTS_FOR_THIS_SEARCH_TRY_A: "No organic results",
  NOTIFY_ENTER_AN_INDUSTRY_OR_RUN_A_SEARCH_FIRST_: "Enter industry or run search",
  NOTIFY_GOOGLE_BUSINESS_PROFILE_REQUEST_RETURNED: "GBP request returned no data",
  NOTIFY_EVERY_OVERLAPPING_DOMAIN_WAS_A_MEGA_PLAT: "No competitors after filtering",
  NOTIFY_NO_COMPETITOR_ROWS_RETURNED_FOR_THIS_DOM: "No competitor rows returned",
  NOTIFY_SET_A_PUBLIC_SITE_URL_FOR_THIS_PROPERTY_: "Set public site URL for GSC",
  NOTIFY_CONNECT_WORDPRESS_CREDENTIALS_IN_INTEGRA: "Connect WordPress credentials",
  NOTIFY_NO_REDIRECTS_TO_EXPORT_LEGACY_URLS_ALREA: "No redirects to export",
  NOTIFY_NO_REPLACEMENT_CONTENT_TO_EXPORT_RUN_ANA: "No content to export, run analyze",
  NOTIFY_AI_TITLES_APPLY_TO_POSTS_ONLY_PAGES_BUCK: "AI titles for posts only",
  NOTIFY_NO_RANK_MATH_REDIRECT_ROWS_TO_EXPORT_RUN: "No NEO Pulse redirect redirects to export",
  NOTIFY_NO_WORDPRESS_BODY_FOR_THIS_URL_KEYWORD_U: "No WP body for URL",
  NOTIFY_BACKEND_API_URL_IS_NOT_CONFIGURED_FOR_PR: "Backend API URL not configured",
  NOTIFY_NO_ROWS_HAVE_A_FOCUS_KEYWORD_RUN_KEYWORD: "No focus keywords on rows",
  NOTIFY_NO_ROWS_HAVE_A_POST_ID_FROM_LOADED_INVEN: "No post IDs on rows",
  NOTIFY_NO_WORDPRESS_POST_ID_FOR_THIS_URL_REFRES: "No WP post ID for URL",
  NOTIFY_SUGGESTED_URL_COULD_NOT_BE_PARSED_RUN_AI: "Suggested URL parse failed",
  NOTIFY_CONNECT_A_WORDPRESS_SITE_TO_SCRAPE_FROM_: "Connect WordPress to scrape",
  NOTIFY_LOAD_THIS_TAB_S_INVENTORY_FIRST_SCRAPE_R: "Load tab inventory first",
  NOTIFY_NO_PUBLISHED_URLS_FOUND_IN_WORDPRESS_INV: "No published URLs in inventory",
  NOTIFY_NO_TAGGED_CLIENTS_SELECTED_SET_BENCHMARK: "No tagged clients selected",
  NOTIFY_OPENROUTER_API_KEY_REQUIRED_FOR_BULK_CSV: "OpenRouter key needed for CSV",
  NOTIFY_UPLOAD_A_CSV_FILE_LOCAL_DOMINATOR_GRID_E: "Upload Local Dominator CSV",
  NOTIFY_GENERATE_THE_COMPETITOR_REPORT_FIRST_BUL: "Generate competitor report first",
  NOTIFY_NO_USABLE_ROWS_IN_THE_REPORT_OR_ONLY_BRA: "No usable report rows",
  NOTIFY_AI_ANALYZING_KNOWLEDGE_GRAPH_TO_CREATE_T: "Analyzing knowledge graph",
  NOTIFY_NO_SITEMAPS_FOUND_PLEASE_ENSURE_YOUR_SIT: "No sitemaps found",
  NOTIFY_FAILED_TO_DETECT_SITEMAPS_PLEASE_DETECT_: "Sitemap detection failed",
  NOTIFY_GSC_KEYWORDS_FOR_THIS_PAGE_URL_FAILED_SE: "GSC keywords failed, SERP saved",
  NOTIFY_SERP_RESPONSE_WAS_NOT_VALID_JSON_JSON_BR: "SERP JSON invalid, no brief",
  NOTIFY_COULD_NOT_SAVE_SEO_BRIEF_FILE_ON_SERVER_: "SEO brief save failed, in grid",
  NOTIFY_SEO_JSON_BRIEF_MERGE_FAILED_RESEARCH_FIL: "SEO brief merge failed",
  NOTIFY_DATAFORSEO_SERP_STORED_AND_JSON_CONTENT_: "SERP stored, brief merged",
  NOTIFY_SERP_CALL_COMPLETED_BUT_NO_BRIEF_WAS_SAV: "SERP done, no brief saved",
  NOTIFY_NO_CLIENTS_SELECTED_SELECT_AT_LEAST_ONE_: "Select at least one client",
  NOTIFY_NO_CLIENTS_WITH_SITE_CONTEXT_FOR_GRID_EN: "No clients with site context",
  NOTIFY_CHECKLIST_READY_REVIEW_AND_CLICK_CREATE_: "Checklist ready, create plan",
  NOTIFY_FAILED_TO_BUILD_LAYOUT_FROM_CHECKLIST_TR: "Layout build from checklist failed",
  NOTIFY_INVALID_KEYWORD_SELECTED_PLEASE_TRY_AGAI: "Invalid keyword selected",
  NOTIFY_OPENROUTER_API_KEY_IS_REQUIRED_SET_IT_IN: "OpenRouter key required",
  NOTIFY_ENABLE_THIS_WORDPRESS_SITE_TO_ADD_MASTER: "Enable WP site for master instructions",
  NOTIFY_SERVICE_AREA_KEYWORD_IS_REQUIRED_WHEN_GE: "Service area keyword required",
  NOTIFY_SERVICE_AREA_SITEMAP_SCRAPING_HAD_ISSUES: "Service area scrape had issues",
  NOTIFY_KEYWORD_ANALYSIS_HAD_ISSUES_CONTINUING_W: "Keyword analysis had issues",
  NOTIFY_NO_BLOG_POSTS_WERE_GENERATED_PLEASE_TRY_: "No blog posts generated",
  NOTIFY_SET_SITE_URL_WORDPRESS_REST_FIRST_THEN_T: "Set Site URL first, then match",
  NOTIFY_SAVE_THE_PROPERTY_FIRST_SO_IT_HAS_A_STAB: "Save property for stable site id",
  NOTIFY_SAVE_THE_PROPERTY_FIRST_SO_IT_HAS_A_STAB_2: "Save property for stable site ID",
  NOTIFY_WORDPRESS_CREDENTIALS_MISSING_PLEASE_UPD: "WordPress credentials missing",
  NOTIFY_NO_ENTITY_SITEMAP_CONFIGURED_PLEASE_SET_: "No entity sitemap configured",
  NOTIFY_ADD_GA4_PROPERTY_ID_FOR_THIS_SITE_CLICK_: "Add GA4 Property ID in Edit",
  NOTIFY_ALL_VISIBLE_SITE_NAMES_ALREADY_MATCHED_G: "All sites matched GBP",
  NOTIFY_FAILED_TO_CONTINUE_OPTIMIZATION_PLEASE_T: "Optimization continue failed",
  NOTIFY_THIS_SITEMAP_IS_AN_INDEX_CONTAINS_OTHER_: "Sitemap index, use child sitemaps",
  NOTIFY_NO_URLS_FOUND_IN_THIS_SITEMAP_PLEASE_CHE: "No URLs in sitemap",
  NOTIFY_CLEAR_ENTITY_SITEMAP_IN_THE_SITEMAP_MENU: "Clear entity sitemap first",
  NOTIFY_OPENROUTER_API_KEY_REQUIRED_IN_API_KEYS_: "OpenRouter key required",
  NOTIFY_OPENROUTER_API_KEY_NOT_FOUND_CONTENT_WIL: "OpenRouter key missing, no AI summary",
};

const BANNED = [/try again/i, /please try/i, /please check/i, /from the response/i, /from the model/i];

const out = [];
let failed = 0;
for (const row of source) {
  const short = MANUAL[row.id];
  if (!short) {
    console.error(`Missing manual short for ${row.id}`);
    failed++;
    continue;
  }
  if (short.length > MAX) {
    console.error(`Too long ${row.id}: ${short.length} ${short}`);
    failed++;
    continue;
  }
  if (short.endsWith("...")) {
    console.error(`Ellipsis ${row.id}`);
    failed++;
    continue;
  }
  for (const ban of BANNED) {
    if (ban.test(short)) {
      console.error(`Banned ${row.id}: ${short}`);
      failed++;
      break;
    }
  }
  out.push({ id: row.id, file: row.file, short });
}

await writeFile(join(ROOT, "docs/notify-shortened.json"), JSON.stringify(out, null, 2));
console.log(`Wrote ${out.length} entries, failed ${failed}`);
if (failed) process.exit(1);
