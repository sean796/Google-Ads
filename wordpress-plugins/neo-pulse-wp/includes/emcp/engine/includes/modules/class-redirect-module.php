<?php
/**
 * Redirect Manager module.
 *
 * Wraps the Redirect Manager (301/302 store + front-end handler + MCP tools +
 * broken-link scan + suggest-on-delete/rename) as a toggleable module so an
 * admin can turn the whole feature off from the Modules tab. On by default, so
 * disabling it is a true kill switch: the front-end redirect handler stops, the
 * MCP tools drop (gated in the ability registrar), the Redirects admin tab
 * hides, and delete/rename stops emitting redirect suggestions.
 *
 * The abilities register on `wp_abilities_api_init` (before this module boots on
 * init:5), so the registrar gates the redirect group on the static is_enabled()
 * rather than on register() below — same pattern as Neo EMCP Themer.
 *
 * @package EMCP_Tools
 * @since   3.11.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Redirect Manager module.
 *
 * @since 3.11.0
 */
class EMCP_Tools_Redirect_Module extends EMCP_Tools_Module {

	const ID = 'redirects';

	public function id(): string {
		return self::ID;
	}

	public function title(): string {
		return __( 'Redirect Manager', 'emcp-tools' );
	}

	public function description(): string {
		return __( 'Create and manage 301/302 redirects so a deleted or renamed page never leaves a dead URL. Suggests a redirect when a page is removed or its slug changes, scans for broken internal links, and every redirect is reversible from History.', 'emcp-tools' );
	}

	public function tier(): string {
		return 'free';
	}

	/** Modules screen group. */
	public function group(): string {
		return 'site';
	}

	/** Modules screen icon. */
	public function icon(): string {
		return 'shuffle';
	}

	/** On by default — a safety feature; disabling it is an explicit opt-out. */
	public function default_active(): bool {
		return false;
	}

	public function is_available(): bool {
		return false;
	}

	/** The dedicated Redirects admin tab is this module's config surface. */
	public function settings_url(): string {
		return '';
	}

	/**
	 * Disabled in standalone Neo EMCP.
	 *
	 * @return bool
	 */
	public static function is_enabled(): bool {
		return false;
	}

	/**
	 * Disabled in standalone Neo EMCP.
	 */
	public function register(): void {
		return;
		if ( class_exists( 'EMCP_Tools_Redirect_Store' ) ) {
			EMCP_Tools_Redirect_Store::init();
		}
		if ( class_exists( 'EMCP_Tools_Redirect_Handler' ) ) {
			EMCP_Tools_Redirect_Handler::init();
		}
	}

	/** No inline knobs — the card links to the Redirects tab via settings_url(). */
	public function render_settings(): void {}
}
