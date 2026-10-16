<?php
/**
 * Scheduled backups (spec 9.6): a recurring event starts a job, and a worker
 * tick drives it chunk by chunk under the job lease, retries failures, keeps
 * the newest scheduled backups, and reports backup health.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Scheduled backups.
 */
final class EMCP_Tools_Scheduled_Backup {

	const OPTION       = 'emcp_tools_backup_schedule';
	const LAST_RUN     = 'emcp_tools_backup_schedule_last_run';
	const START        = 'emcp_tools_scheduled_backup';
	const WORKER       = 'emcp_tools_backup_worker';
	const RECOVERY     = 'emcp_tools_backup_recovery';
	const BUDGET       = 20;
	const NEXT_TICK    = 30;
	const REFUSED_TICK = 60;
	const RETRY_DELAYS = array( 30, 120, 600 );
	const STALE_DAYS   = 14;
	const WATCHDOG     = 120;
	const STALL_LIMIT  = 4;
	const STALLED_AFTER = 7200;
	const TYPES        = array( 'full' => 'full', 'database' => 'database', 'db' => 'database', 'files' => 'files' );

	/** @var EMCP_Tools_Backup_Runner|null */
	private static $runner = null;
	/** @var callable|null */
	private static $clock = null;

	public static function use_runner( ?EMCP_Tools_Backup_Runner $r ): void {
		self::$runner = $r;
	}

	public static function use_clock( ?callable $c ): void {
		self::$clock = $c;
	}

	private static function runner(): EMCP_Tools_Backup_Runner {
		if ( null === self::$runner ) {
			self::$runner = new EMCP_Tools_Backup_Runner();
		}
		return self::$runner;
	}

	private static function now(): int {
		return self::$clock ? (int) ( self::$clock )() : time();
	}

	/** Hooks (from the Migrate module's register()). */
	public static function init(): void {
		add_action( self::START, array( __CLASS__, 'on_start' ) );
		add_action( self::WORKER, array( __CLASS__, 'tick' ) );
		add_action( self::RECOVERY, array( __CLASS__, 'recover' ) );
		if ( ! wp_next_scheduled( self::RECOVERY ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'hourly', self::RECOVERY );
		}
	}

	/**
	 * A valid schedule or an error.
	 *
	 * @param mixed $raw Raw input.
	 * @return array|WP_Error
	 */
	public static function sanitize( $raw ) {
		$raw  = is_array( $raw ) ? $raw : array();
		$freq = (string) ( $raw['frequency'] ?? 'daily' );
		$time = (string) ( $raw['time'] ?? '02:00' );
		$type = (string) ( $raw['type'] ?? 'full' );
		if ( ! in_array( $freq, array( 'daily', 'weekly' ), true ) ) {
			return new WP_Error( 'invalid_frequency', __( 'Choose daily or weekly.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		if ( 1 !== preg_match( '/^([01]\d|2[0-3]):[0-5]\d$/', $time ) ) {
			return new WP_Error( 'invalid_time', __( 'Enter a time such as 02:00.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		if ( ! isset( self::TYPES[ $type ] ) ) {
			return new WP_Error( 'invalid_type', __( 'Choose a full, database or files backup.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		return array(
			'enabled'   => is_bool( $raw['enabled'] ?? false ) ? (bool) ( $raw['enabled'] ?? false ) : filter_var( $raw['enabled'], FILTER_VALIDATE_BOOLEAN ),
			'frequency' => $freq,
			'time'      => $time,
			'type'      => self::TYPES[ $type ],
			'keep'      => max( 1, min( 30, (int) ( $raw['keep'] ?? 7 ) ) ),
		);
	}

	/** The stored schedule (defaults: off, daily 02:00, full, keep 7). */
	public static function get(): array {
		$s = self::sanitize( get_option( self::OPTION, array() ) );
		return is_wp_error( $s ) ? self::sanitize( array() ) : $s;
	}

	/**
	 * Validate, store and apply a schedule.
	 *
	 * @param array $raw Raw input.
	 * @return array|WP_Error
	 */
	public static function save( array $raw ) {
		$s = self::sanitize( $raw );
		if ( is_wp_error( $s ) ) {
			return $s;
		}
		update_option( self::OPTION, $s, false );
		self::apply( $s );
		return $s;
	}

	/**
	 * The next run at or after $now, at the schedule's local time in $tz.
	 *
	 * @param array        $s   Schedule.
	 * @param int          $now Unix time.
	 * @param DateTimeZone $tz  Site zone.
	 * @return int
	 */
	public static function next_run( array $s, int $now, DateTimeZone $tz ): int {
		list( $h, $m ) = array_map( 'intval', explode( ':', $s['time'] ) );
		$local         = ( new DateTimeImmutable( '@' . $now ) )->setTimezone( $tz );
		$at            = $local->setTime( $h, $m, 0 );
		if ( $at->getTimestamp() <= $now ) {
			$at = $at->modify( '+1 day' )->setTime( $h, $m, 0 );
		}
		return $at->getTimestamp();
	}

	/**
	 * Replace the recurring start event.
	 *
	 * @param array $s Schedule.
	 */
	public static function apply( array $s, ?int $from = null ): void {
		wp_clear_scheduled_hook( self::START );
		if ( empty( $s['enabled'] ) ) {
			return;
		}
		$tz = function_exists( 'wp_timezone' ) ? wp_timezone() : new DateTimeZone( 'UTC' );
		wp_schedule_event( self::next_run( $s, null === $from ? self::now() : $from, $tz ), $s['frequency'], self::START );
	}

	/** The recurring event: start a scheduled job unless one is still running. */
	public static function on_start(): void {
		$s = self::get();
		if ( empty( $s['enabled'] ) ) {
			return; // A leftover event (restored cron, a reset option) never runs a backup.
		}
		update_option( self::LAST_RUN, self::now(), false );
		// WP-Cron repeats a fixed 86400 or 604800 seconds; anchor the next run to
		// the local time again so DST and time zone changes do not drift it.
		self::apply( $s, self::now() + MINUTE_IN_SECONDS );
		// A run a tab completed never reached the tick's prune.
		self::prune( $s['keep'] );
		$open = self::runner()->unfinished_scheduled();
		if ( $open ) {
			foreach ( $open as $job_id ) {
				self::queue( $job_id, 0 );
			}
			return;
		}
		$job_id = self::runner()->start(
			array(
				'type'   => $s['type'],
				/* translators: %s: date and time. */
				'name'   => sprintf( __( 'Scheduled backup, %s', 'emcp-tools' ), wp_date( 'Y-m-d H:i', self::now() ) ),
				'source' => 'scheduled',
			)
		);
		if ( ! is_wp_error( $job_id ) ) {
			self::queue( (string) $job_id, 0 );
		}
	}

	/**
	 * Queue one tick for a job, unless one is already queued.
	 *
	 * @param string $job_id Job id.
	 * @param int    $delay  Seconds from now.
	 */
	private static function queue( string $job_id, int $delay ): void {
		if ( ! wp_next_scheduled( self::WORKER, array( $job_id ) ) ) {
			wp_schedule_single_event( self::now() + $delay, self::WORKER, array( $job_id ) );
		}
	}

	/**
	 * One worker tick.
	 *
	 * @param string $job_id Job id.
	 */
	public static function tick( $job_id ): void {
		$job_id = (string) $job_id;
		$state  = self::runner()->state( $job_id );
		if ( ! $state || ! in_array( $state['status'], array( 'queued', 'running' ), true ) ) {
			return;
		}
		$owner = 'cron-' . wp_generate_password( 12, false );
		// A tab or another tick drives the job: do no work, come back later.
		if ( ! EMCP_Tools_Backup_Lease::lease()->acquire( EMCP_Tools_Backup_Lease::name( $job_id ), $owner, EMCP_Tools_Backup_Lease::TTL ) ) {
			self::queue( $job_id, self::REFUSED_TICK );
			return;
		}
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged,Squiz.PHP.DiscouragedFunctions
		@set_time_limit( 0 );
		// If this process dies (a fatal, a host time limit), its successor is
		// already queued, and the stall count below eventually fails the job.
		self::queue( $job_id, self::WATCHDOG );
		$begin = self::now();
		$done  = false;
		$next  = self::NEXT_TICK;
		try {
			$data  = self::runner()->state( $job_id )['data'] ?? array();
			$stall = (int) ( $data['sched_stall'] ?? 0 );
			if ( $stall >= self::STALL_LIMIT ) {
				self::runner()->fail( $job_id, __( 'The scheduled backup stopped making progress.', 'emcp-tools' ) );
				$next = null;
			} else {
				$data['sched_stall'] = $stall + 1;
				self::runner()->set_data( $job_id, $data );
				while ( self::now() - $begin < self::BUDGET ) {
					try {
						$r = self::runner()->step( $job_id, $owner );
					} catch ( Throwable $e ) {
						$r = new WP_Error( 'chunk_exception', $e->getMessage() );
					}
					if ( is_wp_error( $r ) ) {
						if ( in_array( $r->get_error_code(), array( 'lease_busy', 'lease_lost' ), true ) ) {
							$next = self::REFUSED_TICK;
							break;
						}
						$next = self::retry_or_fail( $job_id, $r );
						break;
					}
					self::reset_retries( $job_id );
					if ( true === $r ) {
						$done = true;
						break;
					}
				}
			}
		} finally {
			EMCP_Tools_Backup_Lease::release( $job_id, $owner );
		}
		wp_clear_scheduled_hook( self::WORKER, array( $job_id ) ); // The watchdog.
		if ( $done ) {
			self::prune( self::get()['keep'] );
			return;
		}
		if ( null !== $next ) {
			self::queue( $job_id, $next );
		}
	}

	/**
	 * The next retry delay, or null after the job was failed.
	 *
	 * @param string   $job_id Job id.
	 * @param WP_Error $error  Chunk error.
	 * @return int|null
	 */
	private static function retry_or_fail( string $job_id, WP_Error $error ): ?int {
		$state = self::runner()->state( $job_id );
		$data  = $state ? $state['data'] : array();
		$n     = (int) ( $data['sched_retry'] ?? 0 );
		if ( $n >= count( self::RETRY_DELAYS ) ) {
			self::runner()->fail( $job_id, $error->get_error_message() );
			return null;
		}
		$data['sched_retry'] = $n + 1;
		self::runner()->set_data( $job_id, $data );
		return self::RETRY_DELAYS[ $n ];
	}

	/**
	 * Progress clears the retry ladder.
	 *
	 * @param string $job_id Job id.
	 */
	private static function reset_retries( string $job_id ): void {
		$state = self::runner()->state( $job_id );
		if ( $state && ( ! empty( $state['data']['sched_retry'] ) || ! empty( $state['data']['sched_stall'] ) ) ) {
			$data = $state['data'];
			unset( $data['sched_retry'], $data['sched_stall'] );
			self::runner()->set_data( $job_id, $data );
		}
	}

	/** Hourly: give an orphaned scheduled job its tick back. */
	public static function recover(): void {
		foreach ( self::runner()->unfinished_scheduled() as $job_id ) {
			if ( wp_next_scheduled( self::WORKER, array( $job_id ) ) || EMCP_Tools_Backup_Lease::lease()->active( EMCP_Tools_Backup_Lease::name( $job_id ) ) ) {
				continue;
			}
			self::queue( $job_id, 0 );
		}
	}

	/**
	 * Scheduled completed backups beyond $keep, oldest last in the input
	 * (newest first), returned oldest first as they should go.
	 *
	 * @param array $backups Rows, newest first.
	 * @param int   $keep    How many scheduled backups to keep.
	 * @return string[]
	 */
	public static function to_prune( array $backups, int $keep ): array {
		$scheduled = array_values(
			array_filter(
				$backups,
				static fn( $b ) => 'scheduled' === ( $b['source'] ?? '' ) && 'completed' === ( $b['status'] ?? '' )
			)
		);
		usort( $scheduled, static fn( $a, $b ) => strcmp( (string) $b['created_at'], (string) $a['created_at'] ) );
		return array_column( array_slice( $scheduled, max( 1, $keep ) ), 'backup_id' );
	}

	/**
	 * Delete scheduled backups beyond $keep.
	 *
	 * @param int $keep Keep.
	 * @return int Deleted.
	 */
	public static function prune( int $keep ): int {
		$n = 0;
		foreach ( self::to_prune( self::runner()->backups(), $keep ) as $id ) {
			$n += self::runner()->delete( $id ) ? 1 : 0;
		}
		return $n;
	}

	/**
	 * Whether scheduled backups look stopped because WP-Cron is off.
	 *
	 * @param bool|null $cron_disabled Override (tests); default DISABLE_WP_CRON.
	 * @return bool
	 */
	public static function cron_warning( ?bool $cron_disabled = null ): bool {
		$off = null === $cron_disabled ? ( defined( 'DISABLE_WP_CRON' ) && DISABLE_WP_CRON ) : $cron_disabled;
		$s   = self::get();
		if ( ! $off || empty( $s['enabled'] ) ) {
			return false;
		}
		$interval = 'weekly' === $s['frequency'] ? WEEK_IN_SECONDS : DAY_IN_SECONDS;
		$last     = (int) get_option( self::LAST_RUN, 0 );
		return self::now() - $last > 2 * $interval;
	}

	/**
	 * The newest scheduled backup record (id + status), or null.
	 *
	 * @return array{backup_id: string, status: string}|null
	 */
	public static function last_scheduled(): ?array {
		$newest = null;
		foreach ( self::runner()->backups() as $b ) {
			if ( 'scheduled' !== ( $b['source'] ?? '' ) ) {
				continue;
			}
			if ( null === $newest || (string) ( $b['created_at'] ?? '' ) > (string) ( $newest['created_at'] ?? '' ) ) {
				$newest = $b;
			}
		}
		return null === $newest ? null : array(
			'backup_id' => (string) ( $newest['backup_id'] ?? '' ),
			'status'    => (string) ( $newest['status'] ?? '' ),
		);
	}

	/**
	 * Backup health for the screen and "Needs your attention" (9.7).
	 *
	 * @return array
	 */
	public static function health(): array {
		$last = '';
		foreach ( self::runner()->backups() as $b ) {
			if ( 'completed' === ( $b['status'] ?? '' ) ) {
				$at = (string) ( $b['completed_at'] ?? '' ) ?: (string) ( $b['created_at'] ?? '' );
				if ( $at > $last ) {
					$last = $at;
				}
			}
		}
		$s   = self::get();
		$ts  = '' !== $last ? strtotime( $last . ' UTC' ) : 0;
		$tz  = function_exists( 'wp_timezone' ) ? wp_timezone() : new DateTimeZone( 'UTC' );
		$stalled = false;
		foreach ( self::runner()->unfinished_scheduled() as $job_id ) {
			if ( self::now() - self::runner()->last_activity( $job_id ) > self::STALLED_AFTER ) {
				$stalled = true;
			}
		}
		return array(
			'stalled'      => $stalled,
			'last_success' => $last,
			'stale'        => ! $ts || self::now() - $ts > self::STALE_DAYS * DAY_IN_SECONDS,
			'cron_warning' => self::cron_warning(),
			'schedule'     => $s,
			'next_run'     => $s['enabled'] ? ( wp_next_scheduled( self::START ) ?: self::next_run( $s, self::now(), $tz ) ) : 0,
		);
	}
}
