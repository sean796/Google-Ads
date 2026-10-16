<?php
/**
 * Backend Assist: AI-powered WordPress admin tool-calling specialist.
 *
 * Public facade — implementation lives in includes/backend-assist/.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist {

	private static bool $dependencies_loaded = false;

	public static function init(): void {
		self::ensure_dependencies();
		Neo_Pulse_Wp_Backend_Assist_Novamira_Page::register_cron();
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * Load Backend Assist classes and register tools once per request.
	 */
	public static function ensure_dependencies(): void {
		if ( self::$dependencies_loaded ) {
			return;
		}
		self::$dependencies_loaded = true;
		self::load_dependencies();
		Neo_Pulse_Wp_Backend_Assist_Registry::register_default_tools();
	}

	private static function load_dependencies(): void {
		$dir = NEO_PULSE_WP_PLUGIN_DIR . 'includes/backend-assist/';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-context.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-ai.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-cards.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-tools-wp.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-tools-elementor-sections.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-novamira-page-design-rag.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-openrouter-agent.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-novamira-page-design-harness.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-novamira-page.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-tools-analytics.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-registry.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-content.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-workflow-expand.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-workflow-builder.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-workflow.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-pipeline-classify.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-body-ops.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-subagent-aiseo.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-subagent-wysiwyg.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-subagent-registry.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-meta-compound.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-plan-cache.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-pipeline-content-prep.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-pipeline-phases.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-plan-preview.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-pipeline.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-submode.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-build-harness.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-rest.php';
		require_once $dir . 'class-neo-pulse-wp-backend-assist-sessions.php';
	}

	public static function register_routes(): void {
		Neo_Pulse_Wp_Backend_Assist_Rest::register_routes();
	}

	public static function rest_handle( WP_REST_Request $request ): WP_REST_Response {
		return Neo_Pulse_Wp_Backend_Assist_Rest::rest_handle( $request );
	}

	public static function rest_step_handle( WP_REST_Request $request ): WP_REST_Response {
		return Neo_Pulse_Wp_Backend_Assist_Rest::rest_step_handle( $request );
	}

	public static function rest_undo_handle( WP_REST_Request $request ): WP_REST_Response {
		return Neo_Pulse_Wp_Backend_Assist_Rest::rest_undo_handle( $request );
	}

	public static function rest_workflow_status( WP_REST_Request $request ): WP_REST_Response {
		return Neo_Pulse_Wp_Backend_Assist_Rest::rest_workflow_status( $request );
	}

	public static function rest_sessions_list( WP_REST_Request $request ): WP_REST_Response {
		return Neo_Pulse_Wp_Backend_Assist_Sessions::rest_sessions_list( $request );
	}

	public static function rest_session_get( WP_REST_Request $request ): WP_REST_Response {
		return Neo_Pulse_Wp_Backend_Assist_Sessions::rest_session_get( $request );
	}

	public static function rest_sessions_save( WP_REST_Request $request ): WP_REST_Response {
		return Neo_Pulse_Wp_Backend_Assist_Sessions::rest_sessions_save( $request );
	}

	public static function rest_session_delete( WP_REST_Request $request ): WP_REST_Response {
		return Neo_Pulse_Wp_Backend_Assist_Sessions::rest_session_delete( $request );
	}

	public static function rest_sessions_clear( WP_REST_Request $request ): WP_REST_Response {
		return Neo_Pulse_Wp_Backend_Assist_Sessions::rest_sessions_clear( $request );
	}

	public static function tool_create_page( array $params ): array {
		return Neo_Pulse_Wp_Backend_Assist_Tools_Wp::tool_create_page( $params );
	}

	public static function tool_create_post( array $params ): array {
		return Neo_Pulse_Wp_Backend_Assist_Tools_Wp::tool_create_post( $params );
	}

	public static function tool_list_posts( array $params ): array {
		return Neo_Pulse_Wp_Backend_Assist_Tools_Wp::tool_list_posts( $params );
	}

	public static function tool_get_post( array $params ): array {
		return Neo_Pulse_Wp_Backend_Assist_Tools_Wp::tool_get_post( $params );
	}

	public static function tool_add_content( array $params ): array {
		return Neo_Pulse_Wp_Backend_Assist_Tools_Wp::tool_add_content( $params );
	}

	public static function tool_get_gsc_context( array $params ): array {
		return Neo_Pulse_Wp_Backend_Assist_Tools_Wp::tool_get_gsc_context( $params );
	}

	public static function tool_save_post_meta( array $params ): array {
		return Neo_Pulse_Wp_Backend_Assist_Tools_Wp::tool_save_post_meta( $params );
	}

	public static function tool_run_seo_research_brief( array $params ): array {
		return Neo_Pulse_Wp_Backend_Assist_Tools_Wp::tool_run_seo_research_brief( $params );
	}

	public static function tool_update_post( array $params ): array {
		return Neo_Pulse_Wp_Backend_Assist_Tools_Wp::tool_update_post( $params );
	}

	public static function tool_restore_post_revision( array $params ): array {
		return Neo_Pulse_Wp_Backend_Assist_Tools_Wp::tool_restore_post_revision( $params );
	}

	public static function tool_design_page_with_novamira( array $params ): array {
		return Neo_Pulse_Wp_Backend_Assist_Novamira_Page::tool_design_page_with_novamira( $params );
	}
}
