<?php
/**
 * Project Memory as a module.
 *
 * The single runtime kill switch for the memory feature. When active, register()
 * (booted by the modules registry on init) registers the emcp_memory CPT, wires
 * the guidance injector into the discovery-context filter, hooks the rollup
 * cron, and schedules it. Turning the module off removes all of that.
 *
 * Pro tier, on by default. The ability registrar and injector gating read
 * is_enabled() statically (it runs before the module's init boot).
 *
 * @package EMCP_Tools
 * @since   3.7.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Project Memory module.
 *
 * @since 3.7.0
 */
class EMCP_Tools_Memory_Module extends EMCP_Tools_Module {

	public function id(): string {
		return 'memory';
	}

	public function title(): string {
		return __( 'Project Memory', 'emcp-tools' );
	}

	public function description(): string {
		return __( 'Let the plugin remember your site across agent sessions: capture what each session did, curate trusted guidance behind a human approval gate, and feed approved guardrails and facts back into every new agent session. Turn off to disable capture, injection, and the memory tools.', 'emcp-tools' );
	}

	public function tier(): string {
		return 'pro';
	}

	/** Modules screen group. */
	public function group(): string {
		return 'ai';
	}

	/** Modules screen icon. */
	public function icon(): string {
		return 'brain';
	}

	public function default_active(): bool {
		return true;
	}

	/** Requires an active Pro license. */
	public function is_available(): bool {
		return function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code();
	}

	/** The Memory tab hosts all settings + curation. */
	public function settings_url(): string {
		return admin_url( 'admin.php?page=' . EMCP_Tools_Admin::PAGE_SLUG . '-memory' );
	}

	/** No overlay knobs — the Memory tab is the whole control surface. */
	public function render_settings(): void {}

	/**
	 * Boots the feature (registry calls this on init when active).
	 *
	 * @since 3.7.0
	 */
	public function register(): void {
		if ( class_exists( 'EMCP_Tools_Memory_Store' ) ) {
			// register() already runs during `init`, so register the CPT directly.
			EMCP_Tools_Memory_Store::register_post_type();
		}
		if ( class_exists( 'EMCP_Tools_Memory_Injector' ) ) {
			( new EMCP_Tools_Memory_Injector() )->register();
		}
		if ( class_exists( 'EMCP_Tools_Memory_Enforcer' ) ) {
			( new EMCP_Tools_Memory_Enforcer() )->register();
		}
		if ( class_exists( 'EMCP_Tools_Memory_Summarizer' ) ) {
			$summarizer = new EMCP_Tools_Memory_Summarizer();
			add_action( EMCP_Tools_Memory_Summarizer::CRON_HOOK, array( $summarizer, 'run_rollup' ) );
			$summarizer->schedule();
		}
	}

	/**
	 * Whether the module is active. Static helper for the ability registrar
	 * (runs on wp_abilities_api_init, before the module's init boot) and the
	 * injector gating. Reads the active-modules option directly.
	 *
	 * @since 3.7.0
	 *
	 * @return bool
	 */
	public static function is_enabled(): bool {
		$active = (array) get_option( EMCP_Tools_Module::OPTION_ACTIVE, array() );
		return in_array( 'memory', $active, true );
	}
}
