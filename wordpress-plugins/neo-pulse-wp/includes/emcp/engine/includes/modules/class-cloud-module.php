<?php
/**
 * Neo EMCP module (free, on by default). Boots the OAuth client admin flow.
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class EMCP_Tools_Cloud_Module extends EMCP_Tools_Module {
	public function id(): string {
		return 'cloud';
	}

	public function title(): string {
		return __( 'Neo EMCP', 'emcp-tools' );
	}

	public function description(): string {
		return __( 'Connect this site to your Neo EMCP account to back up and sync your work.', 'emcp-tools' );
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
		return 'cloud';
	}

	public function default_active(): bool {
		return false;
	}

	public function is_available(): bool {
		return false;
	}

	public function register(): void {}

	public function render_settings(): void {}

	public function settings_url(): string {
		return admin_url( 'admin.php?page=neo-pulse-wp-emcp' );
	}

	/**
	 * Static gate for the Connection-tab card (runs before init:5).
	 *
	 * @return bool
	 */
	public static function is_enabled(): bool {
		return false;
	}
}
