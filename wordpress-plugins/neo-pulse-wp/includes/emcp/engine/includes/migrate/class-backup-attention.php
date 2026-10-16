<?php
/**
 * Backup items for "Needs your attention" (spec 9.7), added through the
 * `emcp_tools_attention_checks` filter while the Migrate module is on.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class EMCP_Tools_Backup_Attention {

	/**
	 * Filter callback.
	 *
	 * @param array $checks Checks so far.
	 */
	public static function add( $checks ): array {
		$checks   = (array) $checks;
		$checks[] = new EMCP_Tools_Backup_Attention_Stale();
		$checks[] = new EMCP_Tools_Backup_Attention_Failed();
		$checks[] = new EMCP_Tools_Backup_Attention_Exposed();
		return $checks;
	}

	/** The Backup & Migrate screen. */
	public static function url(): string {
		return admin_url( 'admin.php?page=' . EMCP_Tools_Admin::PAGE_SLUG . '-migrate' );
	}
}

/** No completed backup in the last 14 days. */
final class EMCP_Tools_Backup_Attention_Stale extends EMCP_Tools_Attention_Base {
	public function id(): string {
		return 'no-backup';
	}
	public function applies(): bool {
		return (bool) EMCP_Tools_Scheduled_Backup::health()['stale'];
	}
	public function state(): string {
		return (string) EMCP_Tools_Scheduled_Backup::health()['last_success'];
	}
	public function item(): array {
		return $this->make( 'warning', 'database-backup', __( 'No backup in 14 days', 'emcp-tools' ), __( 'Create a snapshot before large AI edits.', 'emcp-tools' ), __( 'Back up now', 'emcp-tools' ), EMCP_Tools_Backup_Attention::url() );
	}
}

/** The newest scheduled backup failed. */
final class EMCP_Tools_Backup_Attention_Failed extends EMCP_Tools_Attention_Base {
	public function id(): string {
		return 'backup-failed';
	}
	public function applies(): bool {
		$last = EMCP_Tools_Scheduled_Backup::last_scheduled();
		return null !== $last && 'failed' === $last['status'];
	}
	public function state(): string {
		$last = EMCP_Tools_Scheduled_Backup::last_scheduled();
		return null === $last ? '' : $last['backup_id'];
	}
	public function item(): array {
		return $this->make( 'danger', 'database-backup', __( 'The last scheduled backup failed', 'emcp-tools' ), __( 'Check Backup & Migrate for the error and run it again.', 'emcp-tools' ), __( 'Open Backup & Migrate', 'emcp-tools' ), EMCP_Tools_Backup_Attention::url() );
	}
}

/** Backups can be downloaded over HTTP, or old backups could not be moved. */
final class EMCP_Tools_Backup_Attention_Exposed extends EMCP_Tools_Attention_Base {
	public function id(): string {
		return 'backups-exposed';
	}
	private static function check(): array {
		$check = get_option( EMCP_Tools_Backup_Location::CHECK_OPTION, array() );
		return is_array( $check ) ? $check : array();
	}
	public function applies(): bool {
		return 'exposed' === ( self::check()['state'] ?? '' ) || (int) get_option( EMCP_Tools_Backup_Location::MOVE_OPTION, 0 ) > 0;
	}
	public function state(): string {
		return ( self::check()['state'] ?? '' ) . '|' . (int) get_option( EMCP_Tools_Backup_Location::MOVE_OPTION, 0 );
	}
	public function item(): array {
		return 'exposed' === ( self::check()['state'] ?? '' )
			? $this->make( 'danger', 'database-backup', __( 'Backups can be downloaded from the web', 'emcp-tools' ), __( 'Your web server serves the backup folder. Block it, or set EMCP_BACKUP_DIR to a folder outside the web root.', 'emcp-tools' ), __( 'Fix it', 'emcp-tools' ), EMCP_Tools_Backup_Attention::url() . '&view=history' )
			: $this->make( 'warning', 'database-backup', __( 'Old backups could not be moved', 'emcp-tools' ), __( 'Some files are still in wp-content/emcp-backups, which may be readable from the web. Move or delete them.', 'emcp-tools' ), __( 'Open Backup & Migrate', 'emcp-tools' ), EMCP_Tools_Backup_Attention::url() . '&view=history' );
	}
}
