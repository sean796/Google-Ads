<?php
/**
 * Backup engine orchestrator.
 *
 * Coordinates the backup process with two strategies:
 * - Full backups: Stream files directly into a single .emcp archive (no ZIP).
 * - Other types: Export DB to SQL, archive files to ZIP chunks.
 *
 * @package EMCP_Tools
 * 
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class EMCP_Tools_Backup_Engine
 *
 * @since 1.0.0
 */
class EMCP_Tools_Backup_Engine extends EMCP_Tools_Background_Processor {

	/**
	 * Constructor.
	 */
	public function __construct() {
		parent::__construct( 'emcp_backup' );
	}

	/**
	 * Frontend-driven dispatch (like the restore engine).
	 *
	 * The admin backup is driven by the browser polling the `emcp_backup_chunk`
	 * AJAX endpoint, NOT by WP-Cron/Action Scheduler. Reasons:
	 * 1. Reliability — on hosts where the background tier resolves to 'ajax'
	 *    (no Action Scheduler + broken WP-Cron loopback), a queued job would
	 *    otherwise never start, sitting at "Queued 0%" forever.
	 * 2. Instant start — no waiting for a cron tick before the first chunk.
	 * 3. No double-processing — nothing runs the job in the background, so the
	 *    frontend is the single worker (no cron/ajax race on the same chunk).
	 * The MCP `create-backup` tool is unaffected — it drives run_chunk_sync
	 * directly. So this returns true without scheduling anything.
	 *
	 * @param string $job_id Job ID.
	 * @param array  $data   Initial job data.
	 * @return bool
	 */
	public function dispatch( $job_id, $data = array() ) {
		$this->job_id   = $job_id;
		$this->job_data = $data;
		EMCP_Tools_Logger::info( $this->get_context(), sprintf( 'Job %s ready for frontend-driven processing.', $job_id ) );
		return true;
	}

	/**
	 * Get logging context.
	 *
	 * @return string
	 */
	protected function get_context() {
		return 'backup';
	}

	const SOURCES = array( 'manual', 'scheduled', 'mcp' );

	/**
	 * Job arguments with defaults. Backups are local-only in 3.18.0 (spec
	 * 9.6): any requested remote destination is dropped.
	 *
	 * @param array $args Raw arguments.
	 * @return array
	 */
	public static function normalize_args( array $args ): array {
		$args                         = array_merge(
			array(
				'type'           => 'full',
				'name'           => '',
				'include_tables' => array(),
				'exclude_tables' => array(),
				'include_paths'  => array(),
				'exclude_paths'  => array(),
				'source'         => 'manual',
			),
			$args
		);
		$args['storage_destinations'] = array( 'local' );
		$args['source']               = in_array( $args['source'], self::SOURCES, true ) ? $args['source'] : 'manual';
		return $args;
	}

	/**
	 * Start a new backup.
	 *
	 * @param array $args Backup arguments.
	 * @return string|WP_Error Job ID or error.
	 */
	public function start( $args = array() ) {
		$args = self::normalize_args( (array) $args );

		// Generate backup ID.
		$backup_id = 'emcp_' . gmdate( 'Ymd_His' ) . '_' . substr( bin2hex( random_bytes( 4 ) ), 0, 8 );

		if ( empty( $args['name'] ) ) {
			$args['name'] = sprintf(
				/* translators: 1: Backup type, 2: Date */
				__( '%1$s Backup — %2$s', 'emcp-tools' ),
				ucfirst( $args['type'] ),
				wp_date( get_option( 'date_format' ) . ' ' . get_option( 'time_format' ) )
			);
		}

		// Create backup directory.
		$backup_dir = EMCP_Tools_Environment::get_backup_dir() . '/' . $backup_id;

		if ( ! EMCP_Tools_Helper::ensure_directory( $backup_dir ) ) {
			return new WP_Error( 'dir_create', __( 'Cannot create backup directory.', 'emcp-tools' ) );
		}

		// Create backup record in database.
		$this->create_backup_record( $backup_id, $args );

		// Build job data.
		$job_data = array(
			'backup_id'            => $backup_id,
			'backup_dir'           => $backup_dir,
			'type'                 => $args['type'],
			'name'                 => $args['name'],
			'storage_destinations' => $args['storage_destinations'],
			'source'               => $args['source'],
			'include_tables'       => $args['include_tables'],
			'exclude_tables'       => $args['exclude_tables'],
			'include_paths'        => $args['include_paths'],
			'exclude_paths'        => $args['exclude_paths'],
			'phase'                => 'init',
			'db_state'             => null,
			'file_state'           => null,
			// Streaming state for full backups.
			'package_state'        => null,
			'filelist_path'        => null,
			'list_offset'          => 0,
			'file_offset'          => 0,
			'total_files'          => 0,
		);

		// Create job.
		$job_id = EMCP_Tools_Job_Manager::create_job( array(
			'type' => 'backup',
			'data' => $job_data,
		) );

		if ( ! $job_id ) {
			return new WP_Error( 'job_create', __( 'Cannot create backup job.', 'emcp-tools' ) );
		}

		EMCP_Tools_Logger::info( 'backup', sprintf( 'Backup %s started (type: %s).', $backup_id, $args['type'] ) );

		// Dispatch for background processing.
		$this->dispatch( $job_id, $job_data );

		return $job_id;
	}

	/**
	 * Process a single chunk of backup work.
	 *
	 * @param array $data Current job state.
	 * @return true|array|WP_Error
	 */
	protected function process_chunk( $data ) {
		$phase = $data['phase'];

		switch ( $phase ) {
			case 'init':
				return $this->phase_init( $data );

			case 'database':
				return $this->phase_database( $data );

			case 'files':
				return $this->phase_files( $data );

			case 'stream_files':
				return $this->phase_stream_files( $data );

			case 'finalize':
				return $this->phase_finalize( $data );

			case 'manifest':
				return $this->phase_manifest( $data );

			default:
				return new WP_Error( 'unknown_phase', sprintf( 'Unknown backup phase: %s', $phase ) );
		}
	}

	// =========================================================================
	// Phases
	// =========================================================================

	/**
	 * Phase: Initialize backup.
	 *
	 * For full backups: enumerate files to CSV, init .emcp archive, then export DB.
	 * For other types: start DB export or file archiving as before.
	 *
	 * @param array $data Job data.
	 * @return array Updated data.
	 */
	private function phase_init( $data ) {
		$this->update_progress( 2, __( 'Initializing backup...', 'emcp-tools' ) );

		$type = $data['type'];

		if ( 'full' === $type ) {
			// ── Full backup: direct .emcp streaming ─────────────────
			// Step 1: Enumerate files to CSV.
			$filelist_path = $data['backup_dir'] . '/filelist.csv';
			$total_files   = EMCP_Tools_Packager::enumerate_files(
				$filelist_path,
				ABSPATH,
				$data['include_paths'],
				$data['exclude_paths']
			);

			$data['filelist_path'] = $filelist_path;
			$data['total_files']   = $total_files;

			// Step 2: Build initial manifest for .emcp header.
			$manifest = EMCP_Tools_Backup_Manifest::generate( array(
				'backup_id' => $data['backup_id'],
				'name'      => $data['name'],
				'type'      => 'full',
			) );

			// Step 3: Init the .emcp archive (writes header + manifest).
			$emcp_filename = EMCP_Tools_Packager::get_filename( $data['backup_id'], 'full' );
			$emcp_path     = $data['backup_dir'] . '/' . $emcp_filename;

			$package_state = EMCP_Tools_Packager::init_stream( $emcp_path, $manifest );

			if ( is_wp_error( $package_state ) ) {
				return $package_state;
			}

			$data['package_state']  = $package_state;
			$data['package_file']   = $emcp_path;
			$data['package_name']   = $emcp_filename;

			// Start with DB export, then stream files.
			$data['phase'] = 'database';

			$db_file = $data['backup_dir'] . '/' . $data['backup_id'] . '-database.sql';
			$data['db_state'] = EMCP_Tools_DB_Exporter::init_export_state(
				$db_file,
				$data['include_tables'],
				$data['exclude_tables']
			);

			return $data;
		}

		// ── Non-full backups (database / files / custom) ─────────────
		if ( 'files' === $type ) {
			$data['phase'] = 'files';
			$data['file_state'] = EMCP_Tools_File_Archiver::init_archive_state(
				$data['backup_dir'],
				$data['backup_id'],
				ABSPATH,
				$data['include_paths'],
				$data['exclude_paths']
			);
		} else {
			// database or custom — start with DB export.
			$data['phase'] = 'database';

			$db_file = $data['backup_dir'] . '/' . $data['backup_id'] . '-database.sql';
			$data['db_state'] = EMCP_Tools_DB_Exporter::init_export_state(
				$db_file,
				$data['include_tables'],
				$data['exclude_tables']
			);
		}

		return $data;
	}

	/**
	 * Phase: Export database.
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error Updated data.
	 */
	private function phase_database( $data ) {
		$db_state = $data['db_state'];
		$total    = $db_state['total_tables'];
		$done     = $db_state['tables_done'] ?? 0;

		$this->update_progress(
			5 + (int) ( ( $done / max( $total, 1 ) ) * 25 ),
			sprintf(
				/* translators: 1: Tables done, 2: Total tables */
				__( 'Exporting database (%1$d/%2$d tables)...', 'emcp-tools' ),
				$done,
				$total
			)
		);

		$result = EMCP_Tools_DB_Exporter::export_chunk( $db_state );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		if ( true === $result ) {
			// DB export complete.
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
			file_put_contents( $db_state['output_file'], "\nCOMMIT;\n", FILE_APPEND );

			$data['db_state'] = $db_state;

			if ( 'full' === $data['type'] ) {
				// Full backup: add SQL to .emcp archive, then stream files.
				$data['package_state'] = EMCP_Tools_Packager::add_file(
					$data['package_state'],
					$db_state['output_file'],
					'database.sql'
				);

				// Remove the intermediate SQL file.
				@unlink( $db_state['output_file'] ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged

				$data['phase'] = 'stream_files';
				return $data;
			}

			if ( 'database' === $data['type'] ) {
				$data['phase'] = 'manifest';
			} else {
				// custom — proceed to ZIP-based file archiving.
				$data['phase'] = 'files';
				$data['file_state'] = EMCP_Tools_File_Archiver::init_archive_state(
					$data['backup_dir'],
					$data['backup_id'],
					ABSPATH,
					$data['include_paths'],
					$data['exclude_paths']
				);
			}

			return $data;
		}

		$data['db_state'] = $db_state;
		return $data;
	}

	/**
	 * Phase: Archive files into ZIP chunks (non-full backups only).
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error Updated data.
	 */
	private function phase_files( $data ) {
		$file_state = $data['file_state'];
		$total      = $file_state['total_files'];
		$done       = $file_state['files_done'];

		$base_percent = ( 'files' === $data['type'] ) ? 10 : 45;
		$range        = ( 'files' === $data['type'] ) ? 80 : 40;

		$this->update_progress(
			$base_percent + (int) ( ( $done / max( $total, 1 ) ) * $range ),
			sprintf(
				/* translators: 1: Files done, 2: Total files */
				__( 'Archiving files (%1$d/%2$d)...', 'emcp-tools' ),
				$done,
				$total
			)
		);

		$result = EMCP_Tools_File_Archiver::archive_chunk( $file_state );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		if ( true === $result ) {
			$data['file_state'] = $file_state;
			$data['phase']      = 'manifest';
			return $data;
		}

		$data['file_state'] = is_array( $result ) ? $result : $file_state;
		return $data;
	}

	/**
	 * Phase: Stream files directly into .emcp archive (full backups only).
	 *
	 * No ZIP, no compression — raw file concatenation like AIOWPM.
	 * Time-based chunking with exact resume from byte offsets.
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error Updated data.
	 */
	private function phase_stream_files( $data ) {
		$total_files = $data['total_files'];
		$entries     = $data['package_state']['entry_count'] ?? 0;

		// entry_count includes the DB file, so subtract 1 for file progress.
		$files_done = max( 0, $entries - 1 );

		$this->update_progress(
			35 + (int) ( ( $files_done / max( $total_files, 1 ) ) * 55 ),
			sprintf(
				/* translators: 1: Files done, 2: Total files */
				__( 'Streaming files (%1$d/%2$d)...', 'emcp-tools' ),
				$files_done,
				$total_files
			)
		);

		$result = EMCP_Tools_Packager::stream_chunk(
			$data['package_state'],
			$data['filelist_path'],
			ABSPATH,
			$data['list_offset'],
			$data['file_offset'],
			// Stream for the host's safe execution window (often ~25s) instead of a
			// flat 10s — fewer background chunks means fewer wp-cron/AJAX round-trips.
			EMCP_Tools_Environment::get_safe_execution_time()
		);

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		if ( true === $result ) {
			// All files streamed. Move to finalize.
			// stream_chunk() returns true without the final state, so archive_offset
			// in package_state is stale. Use the actual file size to ensure the
			// footer is written at the correct position (after all file data).
			$data['package_state']['archive_offset'] = filesize( $data['package_state']['output_path'] );
			$data['phase'] = 'finalize';
			return $data;
		}

		// Update state for next chunk.
		$data['package_state'] = $result['state'];
		$data['list_offset']   = $result['list_offset'];
		$data['file_offset']   = $result['file_offset'];

		return $data;
	}

	/**
	 * Phase: Finalize .emcp archive (write footer, clean up temp files).
	 *
	 * @param array $data Job data.
	 * @return array|WP_Error Updated data.
	 */
	private function phase_finalize( $data ) {
		$this->update_progress( 92, __( 'Finalizing archive...', 'emcp-tools' ) );

		$result = EMCP_Tools_Packager::finalize( $data['package_state'] );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		// Clean up temp file list.
		if ( ! empty( $data['filelist_path'] ) && file_exists( $data['filelist_path'] ) ) {
			@unlink( $data['filelist_path'] ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}

		$emcp_path = $data['package_file'];
		$total_size = file_exists( $emcp_path ) ? filesize( $emcp_path ) : 0;

		EMCP_Tools_Logger::info( 'backup', sprintf(
			'Archive finalized: %s (%s).',
			$data['package_name'],
			size_format( $total_size )
		) );

		// Update backup record.
		$db_size    = ! empty( $data['db_state'] ) ? ( $data['db_state']['total_size'] ?? 0 ) : 0;
		$files_size = ( $data['package_state']['total_bytes'] ?? 0 ) - $db_size;

		$manifest = EMCP_Tools_Backup_Manifest::generate( array(
			'backup_id'  => $data['backup_id'],
			'name'       => $data['name'],
			'type'       => 'full',
			'db_size'    => $db_size,
			'files_size' => $files_size,
			'tables'     => ! empty( $data['db_state'] ) ? ( $data['db_state']['tables'] ?? array() ) : array(),
		) );

		// Save manifest.json alongside .emcp for reference.
		$manifest_path = $data['backup_dir'] . '/manifest.json';
		EMCP_Tools_Backup_Manifest::save( $manifest, $manifest_path );

		self::update_backup_record( $data['backup_id'], array(
			'status'       => 'completed',
			'total_size'   => $total_size,
			'db_size'      => $db_size,
			'files_size'   => max( 0, $files_size ),
			'chunk_count'  => 1,
			'manifest'     => wp_json_encode( $manifest ),
			'file_paths'   => wp_json_encode( array( $data['package_name'] ) ),
			'completed_at' => current_time( 'mysql', true ),
		) );
		/** Fires when a backup finished writing; retention runs on it. */
		do_action( 'emcp_tools_backup_completed', $data['backup_id'] );

		return true;
	}

	/**
	 * Phase: Generate manifest and finalize (non-full backups).
	 *
	 * @param array $data Job data.
	 * @return array Updated data.
	 */
	private function phase_manifest( $data ) {
		$this->update_progress( 90, __( 'Generating manifest...', 'emcp-tools' ) );

		$db_file     = ! empty( $data['db_state'] ) ? $data['db_state']['output_file'] : '';
		$file_chunks = ! empty( $data['file_state'] ) ? ( $data['file_state']['chunk_paths'] ?? array() ) : array();
		$db_size     = $db_file && file_exists( $db_file ) ? filesize( $db_file ) : 0;
		$files_size  = ! empty( $data['file_state'] ) ? ( $data['file_state']['total_size'] ?? 0 ) : 0;
		$tables      = ! empty( $data['db_state'] ) ? ( $data['db_state']['tables'] ?? array() ) : array();

		$manifest = EMCP_Tools_Backup_Manifest::generate( array(
			'backup_id'   => $data['backup_id'],
			'name'        => $data['name'],
			'type'        => $data['type'],
			'db_file'     => $db_file,
			'file_chunks' => $file_chunks,
			'tables'      => $tables,
			'db_size'     => $db_size,
			'files_size'  => $files_size,
		) );

		$manifest_path = $data['backup_dir'] . '/manifest.json';
		EMCP_Tools_Backup_Manifest::save( $manifest, $manifest_path );

		self::update_backup_record( $data['backup_id'], array(
			'status'       => 'completed',
			'total_size'   => $manifest['total_size'],
			'db_size'      => $db_size,
			'files_size'   => $files_size,
			'chunk_count'  => count( $file_chunks ),
			'manifest'     => wp_json_encode( $manifest ),
			'file_paths'   => wp_json_encode( array_merge(
				$db_file ? array( basename( $db_file ) ) : array(),
				array_map( 'basename', $file_chunks ),
				array( 'manifest.json' )
			) ),
			'completed_at' => current_time( 'mysql', true ),
		) );
		/** This hook is documented in the full-backup branch above. */
		do_action( 'emcp_tools_backup_completed', $data['backup_id'] );

		return true;
	}

	// =========================================================================
	// Database Record Helpers
	// =========================================================================

	/**
	 * Create backup record in the database.
	 *
	 * @param string $backup_id Backup ID.
	 * @param array  $args      Backup arguments.
	 */
	private function create_backup_record( $backup_id, $args ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$wpdb->insert(
			$wpdb->prefix . 'emcp_migrate_backups',
			array(
				'backup_id'            => $backup_id,
				'name'                 => $args['name'],
				'type'                 => $args['type'],
				'status'               => 'running',
				'source'               => $args['source'],
				'storage_destinations' => wp_json_encode( $args['storage_destinations'] ),
				'started_at'           => current_time( 'mysql', true ),
				'created_at'           => current_time( 'mysql', true ),
			),
			array( '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s' )
		);
	}

	/**
	 * Update backup record.
	 *
	 * @param string $backup_id Backup ID.
	 * @param array  $data      Fields to update.
	 */
	private static function update_backup_record( $backup_id, $data ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->update(
			$wpdb->prefix . 'emcp_migrate_backups',
			$data,
			array( 'backup_id' => $backup_id )
		);
	}

	/**
	 * Delete a backup's files, keeping its record.
	 *
	 * @param string $backup_id Backup id.
	 */
	public static function delete_backup_files( $backup_id ) {
		$backup_id = (string) $backup_id;
		if ( '' === $backup_id || 1 !== preg_match( '/^[A-Za-z0-9_]+$/', $backup_id ) ) {
			return;
		}
		$backup_dir = EMCP_Tools_Environment::get_backup_dir() . '/' . $backup_id;
		if ( is_dir( $backup_dir ) ) {
			require_once ABSPATH . 'wp-admin/includes/file.php';
			WP_Filesystem();
			global $wp_filesystem;
			if ( $wp_filesystem ) {
				$wp_filesystem->delete( $backup_dir, true );
			}
		}
	}

	/**
	 * Whether a backup is still being written: an unfinished job references
	 * it and someone drives it (its lease is held, or it moved in the last
	 * five minutes). A record left `running` by a cancelled, crashed or
	 * abandoned job is not busy and can be deleted.
	 *
	 * @param string $backup_id Backup id.
	 * @return bool
	 */
	public static function is_backup_busy( string $backup_id ): bool {
		foreach ( (array) EMCP_Tools_Job_Manager::get_active_jobs() as $job ) {
			$data = json_decode( (string) $job->data, true );
			if ( ! is_array( $data ) || ( $data['backup_id'] ?? '' ) !== $backup_id ) {
				continue;
			}
			if ( EMCP_Tools_Backup_Lease::lease()->active( EMCP_Tools_Backup_Lease::name( (string) $job->job_id ) ) ) {
				return true;
			}
			$at = ! empty( $job->heartbeat ) ? strtotime( $job->heartbeat . ' UTC' ) : 0;
			if ( $at && time() - $at < 5 * MINUTE_IN_SECONDS ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * A cancelled backup job cancels its record too.
	 *
	 * @param string $job_id Job id.
	 */
	public static function on_job_cancelled( $job_id ) {
		$job  = EMCP_Tools_Job_Manager::get_job( (string) $job_id );
		$data = $job ? json_decode( (string) $job->data, true ) : array();
		if ( $job && 'backup' === $job->type && ! empty( $data['backup_id'] ) ) {
			self::mark_backup( (string) $data['backup_id'], 'cancelled' );
		}
	}

	/**
	 * Set a backup record's status.
	 *
	 * @param string $backup_id Backup id.
	 * @param string $status    Status.
	 */
	public static function mark_backup( string $backup_id, string $status ): void {
		self::update_backup_record( $backup_id, array( 'status' => $status ) );
	}

	/**
	 * A job that fails for good also fails its backup record (it stayed
	 * `running` before, and retention and health read `completed` only).
	 *
	 * @param WP_Error $error Error.
	 */
	protected function handle_failure( $error ) {
		parent::handle_failure( $error );
		$job  = EMCP_Tools_Job_Manager::get_job( $this->job_id );
		$data = $job ? json_decode( (string) $job->data, true ) : array();
		if ( $job && 'failed' === $job->status && ! empty( $data['backup_id'] ) ) {
			self::mark_backup( (string) $data['backup_id'], 'failed' );
		}
	}

	/**
	 * Backup jobs run under one lease each (spec 9.6).
	 *
	 * @param string $job_id Job id.
	 * @return string
	 */
	protected function lease_name( string $job_id ): string {
		return EMCP_Tools_Backup_Lease::name( $job_id );
	}

	/**
	 * Backups are driven by the browser, the MCP loop or the scheduled tick,
	 * each holding the job lease; never queue a lease-less worker.
	 *
	 * @param string $job_id Job id.
	 */
	protected function reschedule( $job_id ) {}

	// =========================================================================
	// Static Helpers
	// =========================================================================

	/**
	 * Get all backup records.
	 *
	 * @param array $args Query arguments (status, per_page, page, order).
	 * @return array
	 */
	public static function get_backups( $args = array() ) {
		global $wpdb;

		$defaults = array(
			'status'   => '',
			'per_page' => 20,
			'page'     => 1,
			'order'    => 'DESC',
		);

		$args  = wp_parse_args( $args, $defaults );
		$table = $wpdb->prefix . 'emcp_migrate_backups';
		$where = '1=1';
		$values = array();

		if ( ! empty( $args['status'] ) ) {
			$where   .= ' AND status = %s';
			$values[] = $args['status'];
		}

		$order  = 'ASC' === strtoupper( $args['order'] ) ? 'ASC' : 'DESC';
		$offset = ( max( 1, (int) $args['page'] ) - 1 ) * (int) $args['per_page'];

		$sql = "SELECT * FROM {$table} WHERE {$where} ORDER BY created_at {$order} LIMIT %d OFFSET %d";
		$values[] = (int) $args['per_page'];
		$values[] = $offset;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return $wpdb->get_results( $wpdb->prepare( $sql, $values ) );
	}

	/**
	 * Get a single backup record.
	 *
	 * @param string $backup_id Backup ID.
	 * @return object|null
	 */
	public static function get_backup( $backup_id ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		return $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$wpdb->prefix}emcp_migrate_backups WHERE backup_id = %s",
				$backup_id
			)
		);
	}

	/**
	 * Delete a backup and its files.
	 *
	 * @param string $backup_id Backup ID.
	 * @return bool
	 */
	public static function delete_backup( $backup_id ) {
		global $wpdb;

		$backup = self::get_backup( $backup_id );

		if ( ! $backup ) {
			return false;
		}

		self::delete_backup_files( $backup_id );

		// Delete DB record.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$wpdb->delete(
			$wpdb->prefix . 'emcp_migrate_backups',
			array( 'backup_id' => $backup_id ),
			array( '%s' )
		);

		EMCP_Tools_Logger::info( 'backup', sprintf( 'Backup %s deleted.', $backup_id ) );

		return true;
	}

	/**
	 * Get backup count.
	 *
	 * @param string $status Optional status filter.
	 * @return int
	 */
	public static function get_count( $status = '' ) {
		global $wpdb;

		$table = $wpdb->prefix . 'emcp_migrate_backups';

		if ( $status ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
			return (int) $wpdb->get_var(
				$wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE status = %s", $status )
			);
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
	}

	// =========================================================================
	// AJAX Handlers
	// =========================================================================

	/**
	 * Register AJAX handlers.
	 */
	public function register_ajax() {
		add_action( 'wp_ajax_emcp_tools_migrate_start_backup', array( $this, 'ajax_start_backup' ) );
		add_action( 'wp_ajax_emcp_tools_migrate_download_backup', array( $this, 'ajax_download_backup' ) );
	}

	/**
	 * AJAX: Start a backup.
	 */
	public function ajax_start_backup() {
		check_ajax_referer( 'emcp_tools_migrate_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', 'emcp-tools' ) ) );
		}

		$type = isset( $_POST['type'] ) ? sanitize_text_field( wp_unslash( $_POST['type'] ) ) : 'full';
		$name = isset( $_POST['name'] ) ? sanitize_text_field( wp_unslash( $_POST['name'] ) ) : '';

		$destinations = array( 'local' );
		if ( isset( $_POST['destinations'] ) && is_array( $_POST['destinations'] ) ) {
			$destinations = array_map( 'sanitize_text_field', wp_unslash( $_POST['destinations'] ) );
		}

		$result = $this->start( array(
			'type'                 => $type,
			'name'                 => $name,
			'storage_destinations' => $destinations,
		) );

		if ( is_wp_error( $result ) ) {
			wp_send_json_error( array( 'message' => $result->get_error_message() ) );
		}

		wp_send_json_success( array(
			'message' => __( 'Backup started.', 'emcp-tools' ),
			'job_id'  => $result,
		) );
	}

	/**
	 * AJAX: Download a backup file.
	 *
	 * Streams the backup file to the browser. Uses GET for direct download link.
	 */
	public function ajax_download_backup() {
		check_ajax_referer( 'emcp_tools_migrate_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Permission denied.', 'emcp-tools' ), 403 );
		}

		$backup_id = isset( $_GET['backup_id'] ) ? sanitize_text_field( wp_unslash( $_GET['backup_id'] ) ) : '';

		if ( empty( $backup_id ) ) {
			wp_die( esc_html__( 'No backup ID provided.', 'emcp-tools' ), 400 );
		}

		$backup = self::get_backup( $backup_id );

		if ( ! $backup || 'completed' !== $backup->status ) {
			wp_die( esc_html__( 'Backup not found or not complete.', 'emcp-tools' ), 404 );
		}

		$backup_dir = EMCP_Tools_Environment::get_backup_dir() . '/' . $backup_id;
		$file_paths = json_decode( $backup->file_paths, true );

		if ( empty( $file_paths ) ) {
			wp_die( esc_html__( 'No files in this backup.', 'emcp-tools' ), 404 );
		}

		// Find the main downloadable file.
		$download_file = '';
		$download_name = '';

		foreach ( $file_paths as $filename ) {
			$full_path = $backup_dir . '/' . $filename;
			if ( file_exists( $full_path ) && 'manifest.json' !== $filename ) {
				$download_file = $full_path;
				$download_name = $filename;
				break;
			}
		}

		if ( ! $download_file || ! file_exists( $download_file ) ) {
			wp_die( esc_html__( 'Backup file not found on disk.', 'emcp-tools' ), 404 );
		}

		$file_size = filesize( $download_file );

		// Determine content type.
		$ext = strtolower( pathinfo( $download_name, PATHINFO_EXTENSION ) );
		$content_type = 'application/octet-stream';
		if ( 'sql' === $ext ) {
			$content_type = 'application/sql';
		} elseif ( 'zip' === $ext ) {
			$content_type = 'application/zip';
		}

		// Stream the file. CRITICAL: discard every active output buffer first —
		// admin-ajax runs with a WP output buffer, so a plain `echo fread(); flush()`
		// would accumulate the whole archive in memory (stalling the browser at 0/N
		// and risking OOM on a 400MB+ file). Also turn off compression so a large
		// binary isn't gzipped in one pass, and lift the time limit.
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		@ini_set( 'zlib.output_compression', 'Off' );
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged,Squiz.PHP.DiscouragedFunctions
		@set_time_limit( 0 );
		if ( function_exists( 'apache_setenv' ) ) {
			@apache_setenv( 'no-gzip', '1' ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}
		while ( ob_get_level() > 0 ) {
			@ob_end_clean(); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}

		nocache_headers();
		header( 'Content-Type: ' . $content_type );
		header( 'Content-Disposition: attachment; filename="' . $download_name . '"' );
		header( 'Content-Length: ' . $file_size );
		header( 'Content-Transfer-Encoding: binary' );
		header( 'X-Accel-Buffering: no' ); // nginx: stream, don't buffer.

		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fopen
		$fh = fopen( $download_file, 'rb' );
		if ( $fh ) {
			while ( ! feof( $fh ) ) {
				// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fread
				echo fread( $fh, 1048576 ); // 1MB blocks.
				flush();
				if ( connection_aborted() ) {
					break;
				}
			}
			// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_fclose
			fclose( $fh );
		}

		exit;
	}

}
