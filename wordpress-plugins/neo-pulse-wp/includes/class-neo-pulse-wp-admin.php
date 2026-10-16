<?php
/**
 * Main admin app.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_wp_admin_dir = __DIR__ . '/admin/';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-flash-redirect.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-panel-shell.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-handlers-settings.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-handlers-analytics.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-wp-shell.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-brand-icon.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-app.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-handlers-sitemap.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-handlers-robots-txt.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-handlers-seo.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-handlers-redirects.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-handlers-chat-logs.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-handlers-search-logs.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-handlers-overseer.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-handlers-script-manager.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-handlers-image-seo.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-sitemap.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-robots-txt.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-seo.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-redirects.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-chat-logs.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-search-logs.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-overseer.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-script-manager.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-image-seo.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-settings-placeholder.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-analytics.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-handlers-search.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-search.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-chat.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-backend-assist.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-render-tool-library.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-content-tools-handlers.php';
require_once $neo_pulse_wp_admin_dir . 'trait-admin-content-tools-ui.php';

/**
 * Top-level app UI.
 */
class Neo_Pulse_Wp_Admin {

	const ACTION_SAVE_OPENROUTER = 'neo_pulse_wp_save_openrouter';

	const ACTION_SAVE_DATAFORSEO = 'neo_pulse_wp_save_dataforseo';

	const ACTION_SAVE_GSC = 'neo_pulse_wp_save_gsc';

	use Neo_Pulse_Wp_Admin_Trait_Flash_Redirect;
	use Neo_Pulse_Wp_Admin_Trait_Render_Panel_Shell;
	use Neo_Pulse_Wp_Admin_Trait_Handlers_Settings;
	use Neo_Pulse_Wp_Admin_Trait_Handlers_Analytics;
	use Neo_Pulse_Wp_Admin_Trait_Handlers_Sitemap;
	use Neo_Pulse_Wp_Admin_Trait_Handlers_Robots_Txt;
	use Neo_Pulse_Wp_Admin_Trait_Handlers_Seo;
	use Neo_Pulse_Wp_Admin_Trait_Handlers_Redirects;
	use Neo_Pulse_Wp_Admin_Trait_Handlers_Chat_Logs;
	use Neo_Pulse_Wp_Admin_Trait_Handlers_Search_Logs;
	use Neo_Pulse_Wp_Admin_Trait_Handlers_Overseer;
	use Neo_Pulse_Wp_Admin_Trait_Handlers_Script_Manager;
	use Neo_Pulse_Wp_Admin_Trait_Handlers_Image_Seo;
	use Neo_Pulse_Wp_Admin_Trait_Wp_Shell;
	use Neo_Pulse_Wp_Admin_Trait_Brand_Icon;
	use Neo_Pulse_Wp_Admin_Trait_Render_App;
	use Neo_Pulse_Wp_Admin_Trait_Render_Settings_Placeholder;
	use Neo_Pulse_Wp_Admin_Trait_Render_Analytics;
	use Neo_Pulse_Wp_Admin_Trait_Render_Sitemap;
	use Neo_Pulse_Wp_Admin_Trait_Render_Robots_Txt;
	use Neo_Pulse_Wp_Admin_Trait_Render_Seo;
	use Neo_Pulse_Wp_Admin_Trait_Render_Redirects;
	use Neo_Pulse_Wp_Admin_Trait_Render_Chat_Logs;
	use Neo_Pulse_Wp_Admin_Trait_Render_Search_Logs;
	use Neo_Pulse_Wp_Admin_Trait_Render_Overseer;
	use Neo_Pulse_Wp_Admin_Trait_Render_Script_Manager;
	use Neo_Pulse_Wp_Admin_Trait_Render_Image_Seo;
	use Neo_Pulse_Wp_Admin_Trait_Handlers_Search;
	use Neo_Pulse_Wp_Admin_Trait_Render_Search;
	use Neo_Pulse_Wp_Admin_Trait_Render_Chat;
	use Neo_Pulse_Wp_Admin_Trait_Render_Backend_Assist;
	use Neo_Pulse_Wp_Admin_Trait_Render_Tool_Library;
	use Neo_Pulse_Wp_Admin_Trait_Content_Tools_Handlers;
	use Neo_Pulse_Wp_Admin_Trait_Content_Tools_Ui;

	public static function required_capability(): string {
		return apply_filters( 'neo_pulse_wp_capability', 'edit_posts' );
	}

	/**
	 * @param array<int,string>|mixed $links Existing action links.
	 * @return array<int,string>|mixed
	 */
	public static function plugin_action_links( $links ) {
		if ( ! is_array( $links ) ) {
			return $links;
		}
		$url = admin_url( 'admin.php?page=neo-pulse-wp-settings' );
		array_unshift(
			$links,
			'<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'neo-pulse-wp' ) . '</a>'
		);
		return $links;
	}

	public static function init(): void {
		add_filter( 'plugin_action_links_' . plugin_basename( NEO_PULSE_WP_PLUGIN_FILE ), array( __CLASS__, 'plugin_action_links' ) );
		Neo_Pulse_Wp_Admin_Menu::init();
		add_filter( 'admin_body_class', array( __CLASS__, 'admin_body_class' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_admin_assets' ) );
		add_action( 'admin_init', array( __CLASS__, 'suppress_foreign_admin_notices' ), 999 );
		add_action( 'admin_post_neo_pulse_wp_dashboard_toggle', array( __CLASS__, 'handle_dashboard_toggle' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE_OPENROUTER, array( __CLASS__, 'handle_save_openrouter' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE_DATAFORSEO, array( __CLASS__, 'handle_save_dataforseo' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE_GSC, array( __CLASS__, 'handle_save_gsc' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE_SITEMAP, array( __CLASS__, 'handle_save_sitemap' ) );
		add_action( 'admin_post_' . self::ACTION_RESET_SITEMAP, array( __CLASS__, 'handle_reset_sitemap' ) );
		add_action( 'admin_post_' . self::ACTION_FLUSH_SITEMAP, array( __CLASS__, 'handle_flush_sitemap' ) );
		add_action( 'admin_post_' . self::ACTION_REBUILD_SITEMAP_POST_TYPE, array( __CLASS__, 'handle_rebuild_sitemap_post_type' ) );
		add_action( 'admin_post_' . self::ACTION_REBUILD_SITEMAP_ALL_POST_TYPES, array( __CLASS__, 'handle_rebuild_sitemap_all_post_types' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE_ROBOTS_TXT, array( __CLASS__, 'handle_save_robots_txt' ) );
		add_action( 'admin_post_' . self::ACTION_RESET_ROBOTS_TXT, array( __CLASS__, 'handle_reset_robots_txt' ) );
		self::register_seo_handlers();
		add_action( 'admin_post_' . self::ACTION_REFRESH_ANALYTICS, array( __CLASS__, 'handle_refresh_analytics' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE_REDIRECT, array( __CLASS__, 'handle_save_redirect' ) );
		add_action( 'admin_post_' . self::ACTION_DELETE_REDIRECT, array( __CLASS__, 'handle_delete_redirect' ) );
		add_action( 'admin_post_' . self::ACTION_BULK_REDIRECTS, array( __CLASS__, 'handle_bulk_redirects' ) );
		add_action( 'admin_post_' . self::ACTION_IMPORT_REDIRECTS, array( __CLASS__, 'handle_import_redirects' ) );
		add_action( 'admin_post_' . self::ACTION_IMPORT_REDIRECTS_RANK_MATH_DB, array( __CLASS__, 'handle_import_redirects_rank_math_db' ) );
		add_action( 'admin_post_' . self::ACTION_EXPORT_REDIRECTS, array( __CLASS__, 'handle_export_redirects' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE_REDIRECT_SETTINGS, array( __CLASS__, 'handle_save_redirect_settings' ) );
		add_action( 'admin_post_' . self::ACTION_REDIRECT_ROW, array( __CLASS__, 'handle_redirect_row_action' ) );
		add_action( 'admin_post_' . self::ACTION_IMPORT_CHAT_LOGS, array( __CLASS__, 'handle_import_chat_logs' ) );
		add_action( 'admin_post_' . self::ACTION_EXPORT_CHAT_LOGS, array( __CLASS__, 'handle_export_chat_logs' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE_CHAT_LOG_SETTINGS, array( __CLASS__, 'handle_save_chat_log_settings' ) );
		add_action( 'admin_post_' . self::ACTION_RUN_CHAT_LOG_ANALYSIS, array( __CLASS__, 'handle_run_chat_log_analysis' ) );
		add_action( 'admin_post_' . self::ACTION_DELETE_CHAT_LOG, array( __CLASS__, 'handle_delete_chat_log' ) );
		add_action( 'admin_post_' . self::ACTION_BULK_CHAT_LOGS, array( __CLASS__, 'handle_bulk_chat_logs' ) );
		add_action( 'admin_post_' . self::ACTION_DELETE_CHAT_LOG_REPORT, array( __CLASS__, 'handle_delete_chat_log_report' ) );
		add_action( 'admin_post_' . self::ACTION_GENERATE_CHAT_LOG_POSTS_GAP_CSV, array( __CLASS__, 'handle_generate_chat_log_posts_gap_csv' ) );
		add_action( 'admin_post_' . self::ACTION_GENERATE_CHAT_LOG_PAGES_GAP_CSV, array( __CLASS__, 'handle_generate_chat_log_pages_gap_csv' ) );
		add_action( 'admin_post_' . self::ACTION_EXPORT_SEARCH_LOGS, array( __CLASS__, 'handle_export_search_logs' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE_SEARCH_LOG_SETTINGS, array( __CLASS__, 'handle_save_search_log_settings' ) );
		add_action( 'admin_post_' . self::ACTION_DELETE_SEARCH_LOG, array( __CLASS__, 'handle_delete_search_log' ) );
		add_action( 'admin_post_' . self::ACTION_BULK_SEARCH_LOGS, array( __CLASS__, 'handle_bulk_search_logs' ) );
		add_action( 'admin_post_' . self::ACTION_EXPORT_OVERSEER, array( __CLASS__, 'handle_export_overseer' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE_OVERSEER_SETTINGS, array( __CLASS__, 'handle_save_overseer_settings' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE_OVERSEER_CONVERSION, array( __CLASS__, 'handle_save_overseer_conversion' ) );
		add_action( 'admin_post_' . self::ACTION_DELETE_OVERSEER_CONVERSION, array( __CLASS__, 'handle_delete_overseer_conversion' ) );
		add_action( 'admin_post_' . self::ACTION_DELETE_OVERSEER_VISIT, array( __CLASS__, 'handle_delete_overseer_visit' ) );
		add_action( 'admin_post_' . self::ACTION_BULK_OVERSEER_VISITS, array( __CLASS__, 'handle_bulk_overseer_visits' ) );
		add_action( 'admin_post_' . self::ACTION_CLEAR_OVERSEER_VISITS, array( __CLASS__, 'handle_clear_overseer_visits' ) );
		add_action( 'admin_post_' . self::ACTION_RUN_OVERSEER_ANALYSIS, array( __CLASS__, 'handle_run_overseer_analysis' ) );
		add_action( 'admin_post_' . self::ACTION_DELETE_OVERSEER_REPORT, array( __CLASS__, 'handle_delete_overseer_report' ) );
		add_action( 'admin_post_' . self::ACTION_APPROVE_OVERSEER_TASK, array( __CLASS__, 'handle_approve_overseer_task' ) );
		add_action( 'admin_post_' . self::ACTION_DISMISS_OVERSEER_TASK, array( __CLASS__, 'handle_dismiss_overseer_task' ) );
		add_action( 'admin_post_' . self::ACTION_DONE_OVERSEER_TASK, array( __CLASS__, 'handle_done_overseer_task' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE_SCRIPT, array( __CLASS__, 'handle_save_script' ) );
		add_action( 'admin_post_' . self::ACTION_DELETE_SCRIPT, array( __CLASS__, 'handle_delete_script' ) );
		add_action( 'admin_post_' . self::ACTION_BULK_SCRIPTS, array( __CLASS__, 'handle_bulk_scripts' ) );
		add_action( 'admin_post_' . self::ACTION_IMPORT_SCRIPTS, array( __CLASS__, 'handle_import_scripts' ) );
		add_action( 'admin_post_' . self::ACTION_IMPORT_SCRIPTS_HFCM, array( __CLASS__, 'handle_import_scripts_hfcm' ) );
		add_action( 'admin_post_' . self::ACTION_IMPORT_SCRIPTS_HFCM_DB, array( __CLASS__, 'handle_import_scripts_hfcm_db' ) );
		add_action( 'admin_post_' . self::ACTION_EXPORT_SCRIPTS, array( __CLASS__, 'handle_export_scripts' ) );
		add_action( 'admin_post_' . self::ACTION_EXPORT_SCRIPTS_JSON, array( __CLASS__, 'handle_export_scripts_json' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE_SCRIPT_SETTINGS, array( __CLASS__, 'handle_save_script_settings' ) );
		add_action( 'admin_post_' . self::ACTION_SCRIPT_ROW, array( __CLASS__, 'handle_script_row_action' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE_IMAGE_SEO, array( __CLASS__, 'handle_save_image_seo' ) );
		add_action( 'admin_post_' . self::ACTION_BULK_IMAGE_SEO, array( __CLASS__, 'handle_bulk_image_seo' ) );
		add_action( 'admin_post_neo_pulse_wp_save_gmb', array( __CLASS__, 'handle_save_gmb' ) );
		add_action( 'admin_post_neo_pulse_wp_save_chat', array( __CLASS__, 'handle_save_chat' ) );
		add_action( 'admin_post_neo_pulse_wp_save_chat_training', array( __CLASS__, 'handle_save_chat_training' ) );
		add_action( 'admin_post_neo_pulse_wp_save_chat_knowledge_base', array( __CLASS__, 'handle_save_chat_knowledge_base' ) );
		add_action( 'admin_post_' . self::ACTION_SAVE_SEARCH, array( __CLASS__, 'handle_save_search' ) );
		add_action( 'admin_post_' . self::ACTION_RESET_SEARCH, array( __CLASS__, 'handle_reset_search' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_image_seo_assets' ) );
		self::register_content_tools_handlers();
		self::register_content_tools_ui();
	}
}
