<?php
/**
 * Backup & Migrate screen data (spec 8.20): backups, health, schedule,
 * paired targets and the connector download.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Backup & Migrate data.
 */
final class EMCP_Tools_Admin_Backup_Data {

	/** No progress for a cron tick plus the lease TTL (EMCP_Tools_Scheduled_Backup::NEXT_TICK + EMCP_Tools_Backup_Lease::TTL). */
	const STALL_SECONDS = 90;

	const MAX_BACKUPS = 100;

	/**
	 * One backup as the screen shows it. A download link only once complete.
	 *
	 * @param array|object $b Backups table row.
	 * @return array
	 */
	public static function row( $b ): array {
		$b      = (array) $b;
		$id     = (string) ( $b['backup_id'] ?? '' );
		$status = (string) ( $b['status'] ?? '' );
		$size   = (int) ( $b['total_size'] ?? 0 );
		$url    = '';
		if ( 'completed' === $status && '' !== $id ) {
			$url = html_entity_decode(
				wp_nonce_url( admin_url( 'admin-ajax.php?action=emcp_tools_migrate_download_backup&backup_id=' . rawurlencode( $id ) ), 'emcp_tools_migrate_nonce', 'nonce' )
			);
		}
		return array(
			'id'          => $id,
			'name'        => (string) ( $b['name'] ?? '' ),
			'type'        => (string) ( $b['type'] ?? 'full' ),
			'source'      => (string) ( $b['source'] ?? 'manual' ),
			'status'      => $status,
			'size'        => $size,
			'sizeLabel'   => (string) size_format( $size ),
			'created'     => (string) ( $b['created_at'] ?? '' ),
			'completed'   => (string) ( $b['completed_at'] ?? '' ),
			'downloadUrl' => $url,
		);
	}

	/**
	 * A job as the screen shows it (pure).
	 *
	 * @param array  $state  Runner state { status, data, current_step, percent? }.
	 * @param string $id     Job id.
	 * @param bool   $leased  Whether someone holds its lease.
	 * @param bool   $stalled Whether it stopped moving (spec 9.6: offer to continue).
	 * @return array
	 */
	public static function job_view( array $state, string $id, bool $leased, bool $stalled = false ): array {
		return array(
			'id'      => $id,
			'status'  => (string) ( $state['status'] ?? '' ),
			'percent' => (int) ( $state['percent'] ?? 0 ),
			'step'    => (string) ( $state['current_step'] ?? '' ),
			'leased'  => $leased,
			'stalled' => $stalled,
		);
	}

	/**
	 * The newest unfinished scheduled job, for the screen's read-only view and
	 * its "Continue in this tab" handover (spec 9.6).
	 *
	 * @param EMCP_Tools_Backup_Runner $runner Runner.
	 * @return array|null
	 */
	public function active_job( EMCP_Tools_Backup_Runner $runner ): ?array {
		$open = $runner->unfinished_scheduled();
		if ( ! $open ) {
			return null;
		}
		$id    = (string) end( $open );
		$state = $runner->state( $id );
		if ( ! $state ) {
			return null;
		}
		$leased = EMCP_Tools_Backup_Lease::lease()->active( EMCP_Tools_Backup_Lease::name( $id ) );
		// The scheduler releases the lease between ticks, so an unleased job is
		// only stalled once nothing moved for a tick plus the lease TTL.
		$stalled = ! $leased && $runner->last_activity( $id ) < time() - self::STALL_SECONDS;
		return self::job_view( $state, $id, $leased, $stalled );
	}

	/**
	 * The screen payload.
	 *
	 * @return array
	 */
	/**
	 * The backup folder, its web check, the limits and the disk used.
	 *
	 * @return array
	 */
	public static function storage(): array {
		$usage = class_exists( 'EMCP_Tools_Backup_Retention' ) ? EMCP_Tools_Backup_Retention::usage() : 0;
		return EMCP_Tools_Backup_Location::summary() + array(
			'retention'  => class_exists( 'EMCP_Tools_Backup_Retention' ) ? EMCP_Tools_Backup_Retention::get() : array( 'keep' => 10, 'max_gb' => 0 ),
			'usage'      => $usage,
			'usageLabel' => (string) size_format( $usage ),
		);
	}

	public function payload(): array {
		$backups = (array) EMCP_Tools_Backup_Engine::get_backups( array( 'per_page' => self::MAX_BACKUPS ) );
		$targets = array();
		if ( class_exists( 'EMCP_Tools_Migrate_Targets' ) ) {
			foreach ( (array) EMCP_Tools_Migrate_Targets::all() as $t ) {
				$t         = (array) $t;
				$targets[] = array(
					'id'       => (int) ( $t['id'] ?? 0 ),
					'url'      => (string) ( $t['live_url'] ?? '' ),
					'lastSync' => (string) ( $t['last_sync'] ?? '' ),
					'created'  => (string) ( $t['created_at'] ?? '' ),
				);
			}
		}
		return array(
			'backups'        => array_map( array( __CLASS__, 'row' ), $backups ),
			'health'         => EMCP_Tools_Scheduled_Backup::health(),
			'schedule'       => EMCP_Tools_Scheduled_Backup::get(),
			'targets'        => $targets,
			'connectorUrl'   => html_entity_decode( EMCP_Tools_Migrate_Module::connector_download_url() ),
			'cloudConnected' => class_exists( 'EMCP_Tools_Cloud' ) && EMCP_Tools_Cloud::is_connected(),
			'cloudUrl'       => 'https://emcptools.com/cloud',
			// The chunked jobs keep their admin-ajax transport (spec 8.20).
			'ajax'           => array(
				'url'             => admin_url( 'admin-ajax.php' ),
				'nonce'           => wp_create_nonce( 'emcp_tools_migrate_nonce' ),
				'uploadChunkSize' => EMCP_Tools_Migrate_Module::upload_chunk_size(),
			),
			'limits'         => EMCP_Tools_Migrate_Module::server_limits(),
			'uploadDir'      => EMCP_Tools_Backup_Location::summary()['path'] . '/uploads/',
			'storage'        => self::storage(),
			'docsUrl'        => EMCP_Tools_Migrate_Module::docs_url(),
			'activeJob'      => $this->active_job( new EMCP_Tools_Backup_Runner() ),
		);
	}
}
