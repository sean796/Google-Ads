<?php
/**
 * Plugin Name:       NEO Pulse WP
 * Plugin URI:        https://neodigital.ca
 * Description:       NEO Pulse AI tools for WordPress — chat, search, SEO, and editor wands.
 * Version:           0.9.266
 * Requires at least: 6.8
 * Requires PHP:      8.2
 * Author:            Neo Digital
 * Author URI:        https://neodigital.ca
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       neo-pulse-wp
 * Update URI:        https://neodigital.ca/neo-pulse-wp
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

define( 'NEO_PULSE_WP_VERSION', '0.9.266' );
// Where "Powered by NEO Pulse" links (chat and search).
define( 'NEO_PULSE_WP_POWERED_URL', 'https://neodigital.ca/neo-pulse-platform/' );
define( 'NEO_PULSE_WP_PLUGIN_FILE', __FILE__ );
define( 'NEO_PULSE_WP_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );

/**
 * Require a plugin file when present (avoids fatals on partial deploys of newer builds).
 *
 * @param string $relative Path under the plugin root.
 */
function neo_pulse_wp_require_if_present( string $relative ): void {
	$path = NEO_PULSE_WP_PLUGIN_DIR . ltrim( $relative, '/' );
	if ( is_readable( $path ) ) {
		require_once $path;
	}
}

require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-brand.php';

require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-site.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-license.php';
Neo_Pulse_Wp_License::init();
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-lock.php';
Neo_Pulse_Wp_Lock::init();
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-plan.php';
Neo_Pulse_Wp_Plan::init();

/** This version reads and writes the shared Business details (option neo_business_details) with Neo Tools. */
define( 'NEO_PULSE_WP_BUSINESS_DETAILS', true );
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-business.php';
Neo_Pulse_Wp_Business::init();
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-updater.php';
Neo_Pulse_Wp_Updater::init();
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-mcp.php';
Neo_Pulse_Wp_Mcp::init();

/** Set true in wp-config to re-enable optimization cap on Apply. */
if ( ! defined( 'NEO_PULSE_WP_AI_CAP_ENFORCED' ) ) {
	define( 'NEO_PULSE_WP_AI_CAP_ENFORCED', false );
}

/** Legacy NEO Pulse Node API origin (optional; publish tooling only). */
if ( ! defined( 'NEO_PULSE_WP_DEFAULT_API_BASE' ) ) {
	define( 'NEO_PULSE_WP_DEFAULT_API_BASE', '' );
}

require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-gsc.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-gsc-insights.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-gsc-prompt.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-api.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-openrouter.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-voice.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-research-keys.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-dataforseo.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-semrush.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-brief-merge.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-llm-audit.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-fields.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-seo-limits.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-context.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-meta.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-backend.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-gsc.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-seo-research.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-enhance.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-apply.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/harness/class-neo-pulse-wp-harness-prompts.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/harness/class-neo-pulse-wp-harness-outline.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/harness/class-neo-pulse-wp-harness-session.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/harness/class-neo-pulse-wp-content-sections.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/harness/class-neo-pulse-wp-harness-blueprint.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/harness/class-neo-pulse-wp-harness-runner.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/harness/class-neo-pulse-wp-harness-links.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-body.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-editor-ai-settings.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-gate.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-url.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-rest.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-overview-seo-bulk.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-body-rest.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-editor.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-rest.php';
neo_pulse_wp_require_if_present( 'includes/class-neo-pulse-wp-index-rules.php' );
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-sitemap-settings.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-sitemap-cache.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-sitemap-generator.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-sitemap-style.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-sitemap.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-robots-txt.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-settings.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-vars.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-schema.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-compare.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-head.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-behaviours.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-404.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-meta-box.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-takeover.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-indexnow.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-breadcrumbs.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-faq.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-category-base.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-video.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-locations.php';
neo_pulse_wp_require_if_present( 'includes/class-neo-pulse-wp-frontend-seo.php' );
neo_pulse_wp_require_if_present( 'includes/class-neo-pulse-wp-llms-txt.php' );
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-csv.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-redirects-csv.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-redirects.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-script-manager-rules.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-script-manager.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-script-manager-csv.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-script-manager-import.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-script-manager-output.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-script-manager-rest.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-script-manager-hfcm.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-cache-flush.php';
neo_pulse_wp_require_if_present( 'includes/class-neo-pulse-wp-a11y-front.php' );
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-image-seo-gate.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-image-seo-ai.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-image-seo.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-image-seo-rest.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-gmb.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-gmb-rest.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/search/class-neo-pulse-wp-search-icons.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/search/class-neo-pulse-wp-search-render.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-search.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-ai-widget-design.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-rag.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-display-text.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-history.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-links.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-lead.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-starters.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-page-context.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-page-summary.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-suggestion-templates.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-agents.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-logs-csv.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-logs.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-logs-analysis.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-insights.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-site-inventory.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-logs-gap-csv.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat-super-admin.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-search-logs-csv.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-search-logs.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-search-weekly.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-search-popular.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-overseer.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-overseer-conversions.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-overseer-collect.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-overseer-csv.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-markdown.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-overseer-tasks.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-overseer-gsc.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-overseer-reports.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-overseer-analysis.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chat.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chekkit.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-chekkit-rest.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-tools-audit.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-tools-handlers.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-tools.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-tools-library.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-tools-rest.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-redirects-rest.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-backend-assist.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/faq/class-neo-pulse-wp-faq.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-elementor-text.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/admin/class-neo-pulse-wp-admin-menu.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-admin.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-content-tools.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-activation.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-competitor-post-type.php';

register_activation_hook(
	NEO_PULSE_WP_PLUGIN_FILE,
	array( 'Neo_Pulse_Wp_Activation', 'on_activate' )
);

register_deactivation_hook(
	NEO_PULSE_WP_PLUGIN_FILE,
	array( 'Neo_Pulse_Wp_Activation', 'deactivate' )
);

add_action(
	'plugins_loaded',
	static function () {
		load_plugin_textdomain( 'neo-pulse-wp', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );
		Neo_Pulse_Wp_Faq::init();
		Neo_Pulse_Wp_Competitor_Post_Type::init();
	},
	4
);

add_action( 'init', array( 'Neo_Pulse_Wp_Activation', 'maybe_run_pending' ), 5 );
add_action( 'init', array( 'Neo_Pulse_Wp_Activation', 'maybe_run_version_migration' ), 20 );
add_action( 'init', array( 'Neo_Pulse_Wp_Activation', 'maybe_run_settings_cleanup' ), 99 );

add_action(
	'plugins_loaded',
	static function () {
		Neo_Pulse_Wp_Admin::init();
		Neo_Pulse_Wp_Rest::init();
		Neo_Pulse_Wp_Sitemap::init();
		Neo_Pulse_Wp_Robots_Txt::init();
		Neo_Pulse_Wp_Seo_Head::init();
		Neo_Pulse_Wp_Seo_Behaviours::init();
		Neo_Pulse_Wp_Seo_404::init();
		Neo_Pulse_Wp_Seo_Meta_Box::init();
		Neo_Pulse_Wp_Seo_Takeover::init();
		Neo_Pulse_Wp_Seo_Indexnow::init();
		Neo_Pulse_Wp_Seo_Category_Base::init();
		Neo_Pulse_Wp_Seo_Video::init();
		Neo_Pulse_Wp_Seo_Faq::init();
		if ( class_exists( 'Neo_Pulse_Wp_Index_Rules', false ) ) {
			Neo_Pulse_Wp_Index_Rules::init();
		}
		// neodigital.ca only: four old-URL redirects. SEO tags come from Seo_Head (or Rank Math).
		if ( Neo_Pulse_Wp_Site::is_neo_digital() && class_exists( 'Neo_Pulse_Wp_Frontend_Seo', false ) ) {
			Neo_Pulse_Wp_Frontend_Seo::init_redirects();
		}
		if ( Neo_Pulse_Wp_Site::is_neo_digital() && class_exists( 'Neo_Pulse_Wp_A11y_Front', false ) ) {
			Neo_Pulse_Wp_A11y_Front::init();
		}
		if ( class_exists( 'Neo_Pulse_Wp_Llms_Txt', false ) ) {
			Neo_Pulse_Wp_Llms_Txt::init();
		}
		Neo_Pulse_Wp_Redirects::init();
		Neo_Pulse_Wp_Script_Manager::init();
		Neo_Pulse_Wp_Script_Manager_Output::init();
		Neo_Pulse_Wp_Script_Manager_Rest::init();
		Neo_Pulse_Wp_Cache_Flush::init();
		Neo_Pulse_Wp_Ai_Rest::init();
		Neo_Pulse_Wp_Overview_Seo_Bulk::init();
		Neo_Pulse_Wp_Ai_Body_Rest::init();
		Neo_Pulse_Wp_Editor::init();
		Neo_Pulse_Wp_Image_Seo::init();
		Neo_Pulse_Wp_Image_Seo_Rest::init();
		Neo_Pulse_Wp_Gmb::init();
		Neo_Pulse_Wp_Gmb_Rest::init();
		Neo_Pulse_Wp_Search::init();
		Neo_Pulse_Wp_Ai_Widget_Design::init();
		Neo_Pulse_Wp_Chat_Logs::init();
		Neo_Pulse_Wp_Search_Logs::init();
		Neo_Pulse_Wp_Search_Weekly::init();
		Neo_Pulse_Wp_Overseer::init();
		Neo_Pulse_Wp_Overseer_Collect::init();
		Neo_Pulse_Wp_Chat::init();
		Neo_Pulse_Wp_Chekkit_Rest::init();
		Neo_Pulse_Wp_Voice::init();
		Neo_Pulse_Wp_Backend_Assist::init();
		Neo_Pulse_Wp_Tools_Rest::init();
		Neo_Pulse_Wp_Redirects_Rest::init();
	},
	5
);
