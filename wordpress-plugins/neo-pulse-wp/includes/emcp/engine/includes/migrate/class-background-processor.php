<?php
/**
 * Abstract background processor with 3-tier fallback.
 *
 * Tier 1: Action Scheduler (preferred)
 * Tier 2: WP Cron loopback
 * Tier 3: AJAX polling from the browser
 *
 * Subclasses implement process_chunk() for their specific work.
 *
 * @package EMCP_Tools
 * 
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class EMCP_Tools_Background_Processor
 *
 * @since 1.0.0
 */
abstract class EMCP_Tools_Background_Processor {

	/**
	 * Job ID being processed.
	 *
	 * @var string
	 */
	protected $job_id;

	/**
	 * Job data (persistent state between chunks).
	 *
	 * @var array
	 */
	protected $job_data;

	/**
	 * Time when processing started (microtime).
	 *
	 * @var float
	 */
	protected $start_time;

	/**
	 * Unique action identifier for hooks.
	 *
	 * @var string
	 */
	protected $action;

	/**
	 * Constructor.
	 *
	 * @param string $action Unique action identifier (e.g. 'emcp_migrate_backup').
	 */
	public function __construct( $action ) {
		$this->action = $action;
		$this->register_hooks();
	}

	/**
	 * Register WP hooks for all 3 processing tiers.
	 */
	protected function register_hooks() {
		// Action Scheduler hook.
		add_action( $this->action . '_process', array( $this, 'handle_process' ) );

		// WP Cron hook.
		add_action( $this->action . '_cron', array( $this, 'handle_process' ) );

		// AJAX hook (tier 3 fallback).
		add_action( 'wp_ajax_' . $this->action . '_chunk', array( $this, 'handle_ajax_chunk' ) );
	}

	/**
	 * Dispatch a job for background processing.
	 *
	 * @param string $job_id  Job ID.
	 * @param array  $data    Initial job data.
	 * @return bool True if dispatched.
	 */
	public function dispatch( $job_id, $data = array() ) {
		$this->job_id   = $job_id;
		$this->job_data = $data;

		$method = EMCP_Tools_Environment::get_background_method();

		EMCP_Tools_Logger::info(
			$this->get_context(),
			sprintf( 'Dispatching job %s via %s', $job_id, $method ),
			array( 'method' => $method )
		);

		switch ( $method ) {
			case 'action_scheduler':
				return $this->dispatch_action_scheduler( $job_id );

			case 'wp_cron':
				return $this->dispatch_wp_cron( $job_id );

			case 'ajax':
			default:
				// AJAX mode: return true, frontend will poll.
				return true;
		}
	}

	/**
	 * Dispatch via Action Scheduler.
	 *
	 * @param string $job_id Job ID.
	 * @return bool
	 */
	protected function dispatch_action_scheduler( $job_id ) {
		if ( ! function_exists( 'as_schedule_single_action' ) ) {
			// Fallback to WP Cron.
			return $this->dispatch_wp_cron( $job_id );
		}

		as_schedule_single_action(
			time(),
			$this->action . '_process',
			array( 'job_id' => $job_id ),
			'emcp_migrate'
		);

		return true;
	}

	/**
	 * Dispatch via WP Cron.
	 *
	 * @param string $job_id Job ID.
	 * @return bool
	 */
	protected function dispatch_wp_cron( $job_id ) {
		$scheduled = wp_schedule_single_event(
			time(),
			$this->action . '_cron',
			array( 'job_id' => $job_id )
		);

		// Trigger a loopback request to start cron immediately.
		$this->spawn_cron();

		return false !== $scheduled;
	}

	/**
	 * Trigger a non-blocking loopback to fire cron.
	 */
	protected function spawn_cron() {
		$url = add_query_arg( 'doing_wp_cron', time(), site_url( 'wp-cron.php' ) );

		wp_remote_post(
			$url,
			array(
				'timeout'   => 0.01,
				'blocking'  => false,
				'sslverify' => apply_filters( 'https_local_ssl_verify', false ),
			)
		);
	}

	/**
	 * Handle a processing tick (called by Action Scheduler or WP Cron).
	 *
	 * @param string $job_id Job ID.
	 */
	public function handle_process( $job_id = '' ) {
		if ( empty( $job_id ) ) {
			return;
		}

		$this->job_id     = $job_id;
		$this->start_time = microtime( true );
		$owner            = '' !== $this->lease_name( $job_id ) ? 'worker-' . wp_generate_password( 12, false ) : '';

		if ( ! $this->claim( $owner ) ) {
			return; // Driven elsewhere.
		}

		$job = EMCP_Tools_Job_Manager::get_job( $job_id );

		if ( ! $job || ! in_array( $job->status, array( 'queued', 'running' ), true ) ) {
			if ( '' !== $owner ) {
				EMCP_Tools_Backup_Lease::release( $job_id, $owner );
			}
			return;
		}

		$this->job_data = json_decode( $job->data, true ) ?: array();

		try {
			// Mark running.
			EMCP_Tools_Job_Manager::update_job( $job_id, array( 'status' => 'running' ) );

			// Process chunks until time limit.
			$continue = true;
			while ( $continue && ! $this->time_exceeded() && ! $this->memory_exceeded() ) {
				// Update heartbeat.
				EMCP_Tools_Job_Manager::heartbeat( $job_id );

				$result = $this->step( $owner );

				if ( self::is_lease_error( $result ) ) {
					return;
				}

				if ( is_wp_error( $result ) ) {
					$this->handle_failure( $result );
					return;
				}

				if ( true === $result ) {
					return; // Completed (step() ran handle_completion()).
				}

				if ( ! is_array( $result ) ) {
					$continue = false;
				}
			}

			// Save state and reschedule.
			EMCP_Tools_Job_Manager::update_job( $job_id, array(
				'data' => wp_json_encode( $this->job_data ),
			) );

			$this->reschedule( $job_id );
		} finally {
			if ( '' !== $owner ) {
				EMCP_Tools_Backup_Lease::release( $job_id, $owner );
			}
		}
	}

	/**
	 * Run a single chunk synchronously (no time limit, no reschedule).
	 *
	 * Used by migration package creation to drive the backup in a tight loop
	 * without the overhead of background dispatch, sleep, or time limits.
	 *
	 * @since 1.0.44
	 *
	 * @param string $job_id  Job ID.
	 * @param array  $data    Current job data.
	 * @return true|array|WP_Error Same as process_chunk().
	 */
	public function run_chunk_sync( $job_id, $data, string $owner = '' ) {
		$this->job_id   = $job_id;
		$this->job_data = $data;

		EMCP_Tools_Job_Manager::heartbeat( $job_id );

		return $this->step( $owner );
	}

	/**
	 * The lease this processor's jobs run under ('' for none). Backups have one
	 * (spec 9.6); restores do not.
	 *
	 * @param string $job_id Job id.
	 * @return string
	 */
	protected function lease_name( string $job_id ): string {
		return '';
	}

	/**
	 * One chunk of $this->job_data: process it, then persist the result (the
	 * completion, or the updated data). Under a lease the chunk runs only for
	 * the lease owner and is persisted only while the owner still holds it.
	 *
	 * @param string $owner Lease owner ('' when the processor has no lease).
	 * @return true|array|WP_Error
	 */
	protected function step( string $owner ) {
		$chunk   = function () {
			return $this->process_chunk( $this->job_data );
		};
		$persist = function ( $result ) {
			if ( true === $result ) {
				$this->handle_completion();
			} elseif ( is_array( $result ) ) {
				$this->job_data = $result;
				EMCP_Tools_Job_Manager::update_job( $this->job_id, array( 'data' => wp_json_encode( $result ) ) );
			}
		};
		if ( '' === $this->lease_name( (string) $this->job_id ) ) {
			$result = $chunk();
			if ( ! is_wp_error( $result ) ) {
				$persist( $result );
			}
			return $result;
		}
		if ( '' === $owner ) {
			return new WP_Error( 'lease_owner_required', 'A backup chunk needs a lease owner.' );
		}
		return EMCP_Tools_Backup_Lease::run( (string) $this->job_id, $owner, $chunk, $persist );
	}

	/**
	 * Whether $owner may drive this job now (always, without a lease).
	 *
	 * @param string $owner Owner.
	 * @return bool
	 */
	protected function claim( string $owner ): bool {
		if ( '' === $this->lease_name( (string) $this->job_id ) ) {
			return true;
		}
		return EMCP_Tools_Backup_Lease::lease()->acquire( $this->lease_name( (string) $this->job_id ), $owner, EMCP_Tools_Backup_Lease::TTL );
	}

	/**
	 * Whether a lease refusal (someone else drives the job) is this error.
	 *
	 * @param mixed $result Chunk result.
	 * @return bool
	 */
	protected static function is_lease_error( $result ): bool {
		return is_wp_error( $result ) && in_array( $result->get_error_code(), array( 'lease_busy', 'lease_lost' ), true );
	}

	/**
	 * Handle AJAX chunk processing (Tier 3).
	 */
	public function handle_ajax_chunk() {
		check_ajax_referer( 'emcp_tools_migrate_nonce', 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', 'emcp-tools' ) ) );
		}

		$job_id = isset( $_POST['job_id'] ) ? sanitize_text_field( wp_unslash( $_POST['job_id'] ) ) : '';

		if ( empty( $job_id ) ) {
			wp_send_json_error( array( 'message' => __( 'Missing job ID.', 'emcp-tools' ) ) );
		}

		$this->job_id     = $job_id;
		$this->start_time = microtime( true );
		$owner            = '' !== $this->lease_name( $job_id ) ? EMCP_Tools_Backup_Lease::owner_from_request() : '';

		// Someone else (a scheduled tick, another tab) drives this job: say so
		// without touching it, so the screen can switch to read-only progress.
		if ( ! $this->claim( $owner ) ) {
			wp_send_json_error( array(
				'code'    => 'lease_busy',
				'message' => __( 'This backup is being processed elsewhere.', 'emcp-tools' ),
				'status'  => 'elsewhere',
			) );
		}

		// Read the job only now: a snapshot taken before the claim may predate
		// the previous owner's last save.
		$job = EMCP_Tools_Job_Manager::get_job( $job_id );

		if ( ! $job || ! in_array( $job->status, array( 'queued', 'running' ), true ) ) {
			wp_send_json_error( array( 'message' => __( 'Job not found or not active.', 'emcp-tools' ) ) );
		}

		$this->job_data = json_decode( $job->data, true ) ?: array();

		EMCP_Tools_Job_Manager::update_job( $job_id, array( 'status' => 'running' ) );

		// Loop process_chunk for a full execution window per request (same as the
		// cron handler) — otherwise a frontend-driven job that does one small unit
		// of work per HTTP round-trip (e.g. a DB row batch) crawls under network
		// latency. Yields when the time/memory budget is hit; the browser then
		// fires the next request.
		$continue = true;
		while ( $continue && ! $this->time_exceeded() && ! $this->memory_exceeded() ) {
			EMCP_Tools_Job_Manager::heartbeat( $job_id );

			$result = $this->step( $owner );

			if ( self::is_lease_error( $result ) ) {
				wp_send_json_error( array(
					'code'    => $result->get_error_code(),
					'message' => $result->get_error_message(),
					'status'  => 'elsewhere',
				) );
			}

			if ( is_wp_error( $result ) ) {
				$this->handle_failure( $result );
				wp_send_json_error( array(
					'message' => $result->get_error_message(),
					'status'  => 'failed',
				) );
			}

			if ( true === $result ) {
				wp_send_json_success( array(
					'status'  => 'completed',
					'percent' => 100,
					'step'    => __( 'Complete', 'emcp-tools' ),
				) );
			}

			if ( ! is_array( $result ) ) {
				$continue = false;
			}
		}

		// Each chunk was saved by step(); this only re-saves the same data, and
		// only while this request still holds the lease.
		if ( '' === $owner || EMCP_Tools_Backup_Lease::lease()->holds( $this->lease_name( $job_id ), $owner ) ) {
			EMCP_Tools_Job_Manager::update_job( $job_id, array( 'data' => wp_json_encode( $this->job_data ) ) );
		}

		$progress = EMCP_Tools_Job_Manager::get_job( $job_id );

		wp_send_json_success( array(
			'status'  => 'running',
			'percent' => (int) $progress->progress_percent,
			'step'    => $progress->current_step,
		) );
	}

	/**
	 * Reschedule for the next processing tick.
	 *
	 * @param string $job_id Job ID.
	 */
	protected function reschedule( $job_id ) {
		$method = EMCP_Tools_Environment::get_background_method();

		if ( 'action_scheduler' === $method && function_exists( 'as_schedule_single_action' ) ) {
			as_schedule_single_action(
				time() + 1,
				$this->action . '_process',
				array( 'job_id' => $job_id ),
				'emcp_migrate'
			);
		} elseif ( 'wp_cron' === $method ) {
			wp_schedule_single_event(
				time() + 1,
				$this->action . '_cron',
				array( 'job_id' => $job_id )
			);
			$this->spawn_cron();
		}
		// AJAX: frontend polling handles rescheduling.
	}

	/**
	 * Handle job completion.
	 */
	protected function handle_completion() {
		EMCP_Tools_Job_Manager::update_job( $this->job_id, array(
			'status'           => 'completed',
			'progress_percent' => 100,
			'current_step'     => __( 'Completed', 'emcp-tools' ),
			'data'             => wp_json_encode( $this->job_data ),
		) );

		EMCP_Tools_Logger::info(
			$this->get_context(),
			sprintf( 'Job %s completed successfully.', $this->job_id )
		);

		do_action( 'emcp_tools_migrate_job_completed', $this->job_id, $this->action, $this->job_data );
	}

	/**
	 * Handle job failure.
	 *
	 * @param WP_Error $error The error.
	 */
	protected function handle_failure( $error ) {
		$job = EMCP_Tools_Job_Manager::get_job( $this->job_id );

		$attempts     = $job ? (int) $job->attempts + 1 : 1;
		$max_attempts = $job ? (int) $job->max_attempts : 3;

		if ( $attempts < $max_attempts ) {
			// Retry.
			EMCP_Tools_Job_Manager::update_job( $this->job_id, array(
				'status'   => 'queued',
				'attempts' => $attempts,
				'data'     => wp_json_encode( $this->job_data ),
			) );

			EMCP_Tools_Logger::warning(
				$this->get_context(),
				sprintf( 'Job %s failed (attempt %d/%d): %s — retrying.', $this->job_id, $attempts, $max_attempts, $error->get_error_message() )
			);

			$this->reschedule( $this->job_id );
		} else {
			// Give up.
			EMCP_Tools_Job_Manager::update_job( $this->job_id, array(
				'status'       => 'failed',
				'attempts'     => $attempts,
				'current_step' => $error->get_error_message(),
				'data'         => wp_json_encode( $this->job_data ),
			) );

			EMCP_Tools_Logger::error(
				$this->get_context(),
				sprintf( 'Job %s failed permanently: %s', $this->job_id, $error->get_error_message() )
			);

			do_action( 'emcp_tools_migrate_job_failed', $this->job_id, $this->action, $error );
		}
	}

	/**
	 * Check if time limit is approaching.
	 *
	 * @return bool
	 */
	protected function time_exceeded() {
		$elapsed = microtime( true ) - $this->start_time;
		$limit   = EMCP_Tools_Environment::get_safe_execution_time();

		return $elapsed >= $limit;
	}

	/**
	 * Check if memory usage is approaching the limit.
	 *
	 * @return bool
	 */
	protected function memory_exceeded() {
		$limit = EMCP_Tools_Environment::get_memory_limit();

		if ( $limit < 0 ) {
			return false; // Unlimited.
		}

		$used = memory_get_usage( true );

		// Stop at 80% of limit.
		return $used >= ( $limit * 0.8 );
	}

	/**
	 * Update job progress (convenience method for subclasses).
	 *
	 * @param int    $percent  Progress percentage (0-100).
	 * @param string $step     Current step description.
	 */
	protected function update_progress( $percent, $step = '' ) {
		$update = array( 'progress_percent' => max( 0, min( 100, (int) $percent ) ) );

		if ( $step ) {
			$update['current_step'] = $step;
		}

		EMCP_Tools_Job_Manager::update_job( $this->job_id, $update );
	}

	/**
	 * Get the logging context for this processor.
	 *
	 * @return string
	 */
	abstract protected function get_context();

	/**
	 * Process a single chunk of work.
	 *
	 * @param array $data Current job state.
	 * @return true|array|WP_Error True if completed, updated data array to continue, WP_Error on failure.
	 */
	abstract protected function process_chunk( $data );
}
