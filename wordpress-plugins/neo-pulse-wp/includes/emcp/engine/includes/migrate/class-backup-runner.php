<?php
/**
 * The engine seen by the scheduled-backup worker: a thin adapter so the
 * worker's scheduling, retry and retention logic unit-tests against a fake.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Backup runner.
 */
class EMCP_Tools_Backup_Runner {

	/** @var EMCP_Tools_Backup_Engine|null */
	private $engine = null;

	private function engine(): EMCP_Tools_Backup_Engine {
		if ( null === $this->engine ) {
			$this->engine = new EMCP_Tools_Backup_Engine();
		}
		return $this->engine;
	}

	public function start( array $args ) {
		return $this->engine()->start( $args );
	}

	public function step( string $job_id, string $owner ) {
		$job  = EMCP_Tools_Job_Manager::get_job( $job_id );
		$data = $job ? json_decode( (string) $job->data, true ) : null;
		if ( ! is_array( $data ) ) {
			return new WP_Error( 'job_missing', __( 'The backup job is gone.', 'emcp-tools' ) );
		}
		return $this->engine()->run_chunk_sync( $job_id, $data, $owner );
	}

	public function state( string $job_id ): ?array {
		$job = EMCP_Tools_Job_Manager::get_job( $job_id );
		if ( ! $job ) {
			return null;
		}
		$data = json_decode( (string) $job->data, true );
		return array(
			'status'       => (string) $job->status,
			'data'         => is_array( $data ) ? $data : array(),
			'current_step' => (string) $job->current_step,
			'percent'      => (int) $job->progress_percent,
		);
	}

	public function set_data( string $job_id, array $data ): void {
		EMCP_Tools_Job_Manager::update_job( $job_id, array( 'data' => wp_json_encode( $data ) ) );
	}

	public function fail( string $job_id, string $message ): void {
		$state = $this->state( $job_id );
		EMCP_Tools_Job_Manager::update_job(
			$job_id,
			array(
				'status'       => 'failed',
				'current_step' => substr( $message, 0, 191 ),
			)
		);
		if ( $state && ! empty( $state['data']['backup_id'] ) ) {
			EMCP_Tools_Backup_Engine::mark_backup( (string) $state['data']['backup_id'], 'failed' );
			// Keep the record for History; drop the partial archive so a schedule
			// that keeps failing cannot fill the disk.
			EMCP_Tools_Backup_Engine::delete_backup_files( (string) $state['data']['backup_id'] );
		}
	}

	/**
	 * When the job last did anything (its heartbeat, GMT).
	 *
	 * @param string $job_id Job id.
	 * @return int Unix time, 0 when unknown.
	 */
	public function last_activity( string $job_id ): int {
		$job = EMCP_Tools_Job_Manager::get_job( $job_id );
		$at  = $job && ! empty( $job->heartbeat ) ? strtotime( $job->heartbeat . ' UTC' ) : false;
		return $at ? (int) $at : 0;
	}

	public function unfinished_scheduled(): array {
		$out = array();
		foreach ( (array) EMCP_Tools_Job_Manager::get_active_jobs() as $job ) {
			$data = json_decode( (string) $job->data, true );
			if ( 'backup' === $job->type && is_array( $data ) && 'scheduled' === ( $data['source'] ?? '' ) ) {
				$out[] = (string) $job->job_id;
			}
		}
		return $out;
	}

	public function backups(): array {
		global $wpdb;
		$rows = $wpdb->get_results( 'SELECT backup_id, status, source, created_at, completed_at FROM ' . $wpdb->prefix . 'emcp_migrate_backups ORDER BY created_at DESC, id DESC', ARRAY_A ); // phpcs:ignore WordPress.DB
		return is_array( $rows ) ? $rows : array();
	}

	public function delete( string $backup_id ): bool {
		return (bool) EMCP_Tools_Backup_Engine::delete_backup( $backup_id );
	}
}
