<?php
/**
 * Bootstrap NEO Pulse App plugin modules and early /api/* dispatcher.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Loader {

	public static function init(): void {
		self::includes();
		Neo_Pulse_App_Gmb_Oauth::maybe_migrate_legacy_config();
		Neo_Pulse_App_Api_Dispatcher::init();
		Neo_Pulse_App_Webhook_Dispatcher::init();
		Neo_Pulse_App_Admin::init();
		Neo_Pulse_App_Front_Shell::init();
		Neo_Pulse_App_Gsc_Route_Handlers::register();
		Neo_Pulse_App_Overview_Route_Handlers::register();
		Neo_Pulse_App_Wp_Route_Handlers::register();
		Neo_Pulse_App_Dataforseo_Route_Handlers::register();
		Neo_Pulse_App_Semrush_Route_Handlers::register();
		Neo_Pulse_App_Proposal_Route_Handlers::register();
		Neo_Pulse_App_Task_Trigger_Cron::init();
		Neo_Pulse_App_Task_Schedule_Cron::init();
		Neo_Pulse_App_Workflow_Trigger_Cron::init();
		Neo_Pulse_App_Agent_Run_Worker_Cron::init();
		if ( class_exists( 'Neo_Pulse_App_Agent_Run_Worker_Cron' ) ) {
			Neo_Pulse_App_Agent_Run_Worker_Cron::activate();
		}
	}

	public static function activate(): void {
		self::includes();
		Neo_Pulse_App_Teams_Store::install_tables();
		Neo_Pulse_App_Chat_Store::install_tables();
		Neo_Pulse_App_Tasks_Store::install_tables();
		Neo_Pulse_App_Task_Execution_Store::install_tables();
		Neo_Pulse_App_Agent_Runs_Store::install_tables();
		Neo_Pulse_App_Workflows_Store::install_tables();
		Neo_Pulse_App_Support_Store::install_tables();
		if ( class_exists( 'Neo_Pulse_App_Chat_Flo' ) ) {
			Neo_Pulse_App_Chat_Flo::ensure_global_user();
			Neo_Pulse_App_Chat_Flo::ensure_all_teams();
		}
		Neo_Pulse_App_Data_Paths::root();
		Neo_Pulse_App_Data_Paths::subdir( 'gsc' );
		Neo_Pulse_App_Data_Paths::subdir( 'seo-briefs' );
		Neo_Pulse_App_Data_Paths::subdir( 'serp-dumps' );
		Neo_Pulse_App_Data_Paths::subdir( 'semrush' );
		Neo_Pulse_App_Data_Paths::subdir( 'vertical-benchmarks' );
		Neo_Pulse_App_Data_Paths::subdir( 'knowledge-model-jobs' );
		Neo_Pulse_App_Data_Paths::subdir( 'local-grid' );
		Neo_Pulse_App_Data_Paths::subdir( 'support' );
		Neo_Pulse_App_Api_Dispatcher::register_rewrites();
		Neo_Pulse_App_Task_Trigger_Cron::activate();
		Neo_Pulse_App_Task_Schedule_Cron::activate();
		Neo_Pulse_App_Workflow_Trigger_Cron::activate();
		Neo_Pulse_App_Agent_Run_Worker_Cron::activate();
		flush_rewrite_rules();
	}

	public static function deactivate(): void {
		Neo_Pulse_App_Task_Trigger_Cron::deactivate();
		Neo_Pulse_App_Task_Schedule_Cron::deactivate();
		Neo_Pulse_App_Workflow_Trigger_Cron::deactivate();
		Neo_Pulse_App_Agent_Run_Worker_Cron::deactivate();
		flush_rewrite_rules();
	}

	private static function includes(): void {
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/config/class-secrets-loader.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/config/class-openrouter-attribution.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/storage/class-neo-pulse-data-paths.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/storage/class-json-file-store.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/http/class-http-transient-retry.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/router/class-api-dispatcher.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/webhook/class-chekkit-webhook.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agentmail/class-agentmail-api.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agentmail/class-agentmail-inbound-store.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/webhook/class-agentmail-webhook.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/webhook/class-webhook-dispatcher.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/admin/class-neo-pulse-app-admin.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/front/class-neo-pulse-app-front-shell.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/class-neo-pulse-app-dataforseo.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/dataforseo/class-dataforseo-client.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/dataforseo/class-dataforseo-mcp-router.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/dataforseo/class-dataforseo-serp-dumps.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/dataforseo/class-dataforseo-google-images.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/dataforseo/class-dataforseo-ai-mode.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/dataforseo/class-dataforseo-organic-competitors-parse.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/dataforseo/class-dataforseo-organic-competitors.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/dataforseo/class-dataforseo-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/class-neo-pulse-app-semrush.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/semrush/class-semrush-client.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/semrush/class-semrush-table-parse.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/semrush/class-semrush-competitor-shared.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/semrush/class-semrush-bulk-enrichment.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/semrush/class-semrush-organic-competitors.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/semrush/class-semrush-projects-api.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/semrush/class-semrush-overview-json.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/semrush/class-semrush-position-tracking-compare.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/semrush/class-semrush-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/proposal/class-proposal-lighthouse-parse.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/proposal/class-proposal-faq-inventory.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/proposal/class-proposal-site-audit.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/proposal/class-proposal-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gsc/class-gsc-service-account.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gsc/class-gsc-credentials.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gsc/class-gsc-queries.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gsc/class-gsc-performance.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gsc/class-gsc-performance-batch.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gsc/class-gsc-entity-performance.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gsc/class-gsc-reporting-bundle.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gsc/class-gsc-query-daily.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gsc/class-gsc-indexing.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gsc/class-gsc-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/ga/class-ga-credentials.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/ga/class-ga-api.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/ga/class-ga-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/organic-dashboard/class-organic-dashboard-semrush.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/organic-dashboard/class-organic-dashboard-bundle.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/organic-dashboard/class-organic-dashboard-reporting-highlights.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/organic-dashboard/class-organic-dashboard-client-report-share.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/organic-dashboard/class-organic-dashboard-local-grid.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/organic-dashboard/class-organic-dashboard-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gmb/class-gmb-oauth.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gmb/class-gmb-tokens.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gmb/class-gmb-performance.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gmb/class-gmb-posts-api.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gmb/class-gmb-posts.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/gmb/class-gmb-route-handlers.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/google-ads/class-google-ads-oauth.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/google-ads/class-google-ads-tokens.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/google-ads/class-google-ads-credentials.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/google-ads/class-google-ads-api.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/google-ads/class-google-ads-reporting-bundle.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/google-ads/class-google-ads-campaign-publisher.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/google-ads/class-google-ads-ppc-research.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/google-ads/class-google-ads-campaign-insights.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/google-ads/class-google-ads-campaign-import.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/google-ads/class-google-ads-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/google-mcp/class-google-mcp-oauth.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/google-mcp/class-google-mcp-tokens.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/google-mcp/class-google-drive-settings.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/google-mcp/class-google-drive-upload.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/google-mcp/class-google-mcp-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/overview/class-overview-fetch-meta.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/overview/class-overview-meta-ai.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/overview/class-overview-seo-brief.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/overview/class-overview-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/integrations/class-sites-sync.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/integrations/class-integrations-route-handlers.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/integrations/class-property-client-logo.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/integrations/class-manager-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/teams/class-teams-store.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/chat/class-chat-typing.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/chat/class-chat-calls.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/chat/class-chat-mentions.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/chat/class-chat-preferences.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/chat/class-chat-openrouter.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/chat/class-chat-neo-pulse.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/chat/class-chat-store.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/chat/class-chat-activity-log.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/chat/class-chat-assets.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/chat/class-chat-link-unfurl.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/mail/class-neo-pulse-app-mail.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/teams/class-teams-invites.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/chat/class-chat-route-handlers.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/automation-recipes/class-automation-recipe-registry.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/automation-recipes/class-automation-trigger-registry.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/automation-recipes/class-automation-action-registry.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/tasks/class-tasks-store.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/tasks/class-tasks-assignments.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/tasks/class-tasks-assets.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/tasks/class-tasks-route-handlers.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-runs-recipe-registry.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-runs-store.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-runs-artifacts.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-runs-route-handlers.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-run-worker.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-run-worker-cron.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-run-harness-post-creator.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-run-harness-local-dominator-export.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-run-keyword-research.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-run-keyword-ai-analysis.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-run-article-length-policy.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-run-post-creator-inventory.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-run-post-creator-worker.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-run-post-creator-upload-complete.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-run-gsc-kw-inventory.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-run-gsc-keyword-select.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/agent-runs/class-agent-run-h2-select.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/class-task-execution-store.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/class-task-execution-progress.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/class-task-execution-site-resolver.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/class-task-execution-registry.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/class-task-execution-coordinator.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/runners/class-task-execution-runner-content-optimizer.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/runners/class-task-execution-runner-content-gap-check.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/runners/class-task-execution-runner-gsc-reporting.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/runners/class-task-execution-runner-ads-reporting.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/runners/class-task-execution-runner-post-creator.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/runners/class-task-execution-runner-entity-page-creator.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/runners/class-task-execution-runner-entity-generator.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/runners/class-task-execution-runner-sap-generator.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/runners/class-task-execution-runner-local-dominator-export.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/runners/class-task-execution-runner-chatgpt-audit.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/runners/class-task-execution-runner-dfs-article-audit.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-execution/runners/class-task-execution-runner-browser-automation.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/local-dominator/class-local-dominator-export.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/local-dominator/class-local-dominator-route-handlers.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/chatgpt-audit/class-chatgpt-audit.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/chatgpt-audit/class-chatgpt-audit-route-handlers.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/browser-automation/class-browser-automation.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/browser-automation/class-browser-automation-route-handlers.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-triggers/class-task-trigger-inventory.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-triggers/class-task-trigger-gsc.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-triggers/class-task-trigger-pending-store.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-triggers/class-task-trigger-evaluator.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-triggers/class-task-trigger-cron.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/task-triggers/class-task-schedule-cron.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/workflows/class-workflows-store.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/workflows/class-workflow-summarize.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/workflows/class-workflow-trigger-pending-store.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/workflows/class-workflow-cron-expression.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/workflows/class-workflow-trigger-evaluator.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/workflows/class-workflow-trigger-agent-done.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/workflows/class-workflow-ld-grid-deliverable.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/workflows/class-workflow-ld-continue-watchdog.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/workflows/class-workflow-server-dispatch.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/workflows/class-workflow-trigger-cron.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/workflows/class-workflows-route-handlers.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/support/class-support-store.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/support/class-support-ai.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/support/class-support-route-handlers.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/teams/class-teams-route-handlers.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/platform-data/class-platform-inventory.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/platform-data/class-inventory-seo-signals.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/platform-data/class-data-tool-grounding.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/platform-data/class-platform-data-intent-checklist.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/platform-data/class-platform-data-parallel-team.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/platform-data/class-platform-data-lead-agent.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/platform-data/class-platform-data-orchestrator.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/platform-data/class-platform-data-gsc-tools.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/platform-data/class-platform-data-gsc-reporting-tools.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/platform-data/class-platform-data-ads-reporting-tools.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/platform-data/class-platform-data-post-creator-tools.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/platform-data/class-platform-data-tools.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/class-pulse-assist-module-catalog.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/class-pulse-assist-data-tools.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/class-pulse-assist-secretary.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/action/class-pulse-assist-action-registry.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/action/class-pulse-assist-action-tools-tasks.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/action/class-pulse-assist-action-tools-executions.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/action/class-pulse-assist-action-tools-templates.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/action/class-pulse-assist-action-tools-recipes.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/action/class-pulse-assist-action-tools-forge.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/action/class-pulse-assist-action-executor.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/action/class-pulse-assist-action-intent.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/action/class-pulse-assist-automation-intent.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/action/class-pulse-assist-action-parallel-team.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/action/class-pulse-assist-action-lead-agent.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/action/class-pulse-assist-action-orchestrator.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/class-pulse-assist-ask.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/pulse-assist/class-pulse-assist-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/auth/class-auth-session.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/auth/class-auth-route-handlers.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/hosting/class-hosting-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/push/class-push-notification-actions.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/push/class-push-device-store.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/push/class-push-preferences.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/push/class-push-dispatcher.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/push/class-push-events.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/push/class-push-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/images/class-openrouter-image.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/images/class-images-route-handlers.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/video/class-openrouter-video.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/video/class-openrouter-speech.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/video/class-video-render-store.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/video/class-video-stitch.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/video/class-video-brainstorm.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/video/class-video-route-handlers.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/bulk/class-validate-internal-links.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/proxy/class-wikipedia-proxy.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/proxy/class-url-text-proxy.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/ollama/class-ollama-route.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/openrouter/class-openrouter-agent-models.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/openrouter/class-openrouter-models-catalog-route.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/openrouter/class-openrouter-chat-completion-route.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/maps/class-entity-maps-image.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/seo/class-local-business-schema-extract.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/seo/class-postal-geocode.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/seo/class-page-address-llm.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/seo/class-seo-http.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/seo/class-seo-route-handlers.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/emcp/class-emcp-site-client.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/emcp/class-emcp-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/vertical-benchmark/class-vertical-benchmark-taxonomy.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/vertical-benchmark/class-vertical-benchmark-client-tag.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/vertical-benchmark/class-vertical-benchmark-openrouter.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/vertical-benchmark/class-vertical-benchmark-sites.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/vertical-benchmark/class-vertical-benchmark-classify.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/vertical-benchmark/class-vertical-benchmark-sitemap-urls.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/vertical-benchmark/class-vertical-benchmark-gsc-export.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/vertical-benchmark/class-vertical-benchmark-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/site-scraper/class-site-scraper-route-handlers.php';

		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/knowledge-model/class-knowledge-model-progress.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/knowledge-model/class-knowledge-model-service.php';
		require_once NEO_PULSE_APP_PLUGIN_DIR . 'includes/knowledge-model/class-knowledge-model-route-handlers.php';

		self::includes_wordpress();
	}

	private static function includes_wordpress(): void {
		$wp = NEO_PULSE_APP_PLUGIN_DIR . 'includes/wordpress/';
		require_once $wp . 'class-wp-url-normalize.php';
		require_once $wp . 'class-wp-rest-client.php';
		require_once $wp . 'class-wp-connection.php';
		require_once $wp . 'class-wp-sitemap.php';
		require_once $wp . 'class-wp-inventory-collector.php';
		require_once $wp . 'class-wp-posts-inventory.php';
		require_once $wp . 'class-wp-post-content.php';
		require_once $wp . 'class-wp-url-resolver.php';
		require_once $wp . 'class-wp-post-crud.php';
		require_once $wp . 'class-wp-media.php';
		require_once $wp . 'class-wp-acf-protocol.php';
		require_once $wp . 'class-wp-neo-pulse-tools.php';
		require_once $wp . 'class-wp-pulse-assist.php';
		require_once $wp . 'class-wp-acf-by-url.php';
		require_once $wp . 'class-wp-acf-discovery.php';
		require_once $wp . 'class-wp-editorial-counts.php';
		require_once $wp . 'class-wp-overview-seo-item.php';
		require_once $wp . 'class-wp-meta.php';
		require_once $wp . 'class-wp-bulk-overview-seo.php';
		require_once $wp . 'class-wp-featured-media.php';
		require_once $wp . 'class-wp-change-post-url.php';
		require_once $wp . 'class-wp-author-resolver.php';
		require_once $wp . 'class-wp-route-handlers.php';
	}
}
