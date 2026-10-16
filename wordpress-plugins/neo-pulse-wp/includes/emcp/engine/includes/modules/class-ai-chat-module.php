<?php
/**
 * AI Chat as a Pro module.
 *
 * Owns all AI Chat wiring (REST controller, conversation CPT, model-list cron,
 * admin page assets, Elementor editor FAB). register() is called by the modules
 * registry on `init` only when the module is active — so turning it off is a
 * true kill switch. On by default for Pro; free builds never load this file.
 *
 * @package EMCP_Tools
 * @since   3.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * AI Chat module.
 *
 * @since 3.1.0
 */
class EMCP_Tools_AI_Chat_Module extends EMCP_Tools_Module {

	public function id(): string {
		return 'ai-chat';
	}

	public function title(): string {
		return __( 'AI Chat', 'emcp-tools' );
	}

	public function description(): string {
		return __( 'Chat with any AI model in the admin and the Elementor editor to build and edit pages using the EMCP tools.', 'emcp-tools' );
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
		return 'message-square';
	}

	public function default_active(): bool {
		return true;
	}

	/** Requires an active Pro license. */
	public function is_available(): bool {
		return function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code();
	}

	/** No overlay settings — AI Chat configures on its own admin page (settings_url). */
	public function render_settings(): void {}

	/** The dedicated AI Chat admin tab is the config surface. */
	public function settings_url(): string {
		$page = class_exists( 'EMCP_Tools_AI_Chat_Page' ) ? EMCP_Tools_AI_Chat_Page::PAGE : 'emcp-tools-ai-chat';
		return admin_url( 'admin.php?page=' . $page );
	}

	/**
	 * Wire every AI Chat hook. Called on `init` (priority 5) only when active +
	 * available. Each unit is guarded by class_exists so a partial build no-ops
	 * instead of fataling.
	 */
	public function register(): void {
		// Runtime (all contexts).
		if ( class_exists( 'EMCP_Tools_AI_Chat_Controller' ) ) {
			( new EMCP_Tools_AI_Chat_Controller() )->register_hooks();
		}
		if ( class_exists( 'EMCP_Tools_AI_Chat_Provider' ) ) {
			add_action(
				EMCP_Tools_AI_Chat_Provider::REFRESH_HOOK,
				array( 'EMCP_Tools_AI_Chat_Provider', 'cron_refresh' )
			);
		}
		if ( class_exists( 'EMCP_Tools_AI_Chat_Store' ) ) {
			// We are already inside `init`, so register the CPT immediately.
			EMCP_Tools_AI_Chat_Store::register_post_type();
		}

		// Elementor editor FAB (class only present in admin builds).
		if ( class_exists( 'EMCP_Tools_Elementor_Editor' ) ) {
			( new EMCP_Tools_Elementor_Editor() )->init();
		}

		// Gutenberg (block editor) FAB (class only present in admin builds).
		if ( class_exists( 'EMCP_Tools_Gutenberg_Editor' ) ) {
			( new EMCP_Tools_Gutenberg_Editor() )->init();
		}
	}
}
