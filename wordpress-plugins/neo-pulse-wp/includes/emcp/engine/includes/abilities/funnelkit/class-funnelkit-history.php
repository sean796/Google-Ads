<?php
/**
 * History for FunnelKit writes: parts resolved before the write, exact and proven-new created IDs,
 * locked and verified undo, and atomic records for jobs that finish after the call returns.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_FunnelKit_History {

	const MAX_SNAPSHOT_BYTES = 8388608;
	const JOB_PREFIX         = 'emcp_tools_funnelkit_job_';
	const JOBS_CRON          = 'emcp_tools_funnelkit_jobs';
	const JOB_EXPIRY         = DAY_IN_SECONDS;
	const CLAIM_TTL          = 600;

	/** @var EMCP_Tools_FunnelKit_History|null */
	private static $instance = null;

	/** @var bool */
	private static $booted = false;

	/** @var EMCP_Tools_Lease_Store|null */
	private static $job_store = null;

	/** @var array|null created-ids.php, or a map a test supplies. */
	private static $created_map = null;

	/** @internal Tests: use this created-ID map instead of created-ids.php (null restores the file). */
	public static function use_created_ids( ?array $map ): void {
		self::$created_map = $map;
	}

	private static function created_map(): array {
		return self::$created_map ?? ( self::$created_map = (array) require __DIR__ . '/created-ids.php' );
	}

	/** Register the undo handlers and the job cron. Called on every request by the Pro loader. */
	public static function boot(): void {
		if ( self::$booted ) {
			return;
		}
		self::$booted = true;
		add_filter( 'emcp_tools_change_current_hash', array( __CLASS__, 'filter_hash' ), 10, 2 );
		add_filter( 'emcp_tools_change_apply_rollback', array( __CLASS__, 'filter_apply' ), 10, 3 );
		add_action( self::JOBS_CRON, array( __CLASS__, 'run_jobs' ) );
	}

	/** @internal Tests: forget the instance and the hooks, as at the start of a request. */
	public static function reset_for_tests(): void {
		remove_filter( 'emcp_tools_change_current_hash', array( __CLASS__, 'filter_hash' ), 10 );
		remove_filter( 'emcp_tools_change_apply_rollback', array( __CLASS__, 'filter_apply' ), 10 );
		remove_action( self::JOBS_CRON, array( __CLASS__, 'run_jobs' ) );
		self::$instance = null;
		self::$booted   = false;
	}

	public static function use_job_store( ?EMCP_Tools_Lease_Store $store ): void {
		self::$job_store = $store;
	}

	private static function jobs_store(): EMCP_Tools_Lease_Store {
		return self::$job_store ?? ( self::$job_store = new EMCP_Tools_Lease_Options_Store() );
	}

	public static function instance(): EMCP_Tools_FunnelKit_History {
		return self::$instance ?? ( self::$instance = new self() );
	}

	private function graph(): EMCP_Tools_FunnelKit_Graph {
		return new EMCP_Tools_FunnelKit_Graph();
	}

	/** Resolve the parts and record the state before the write. @return array Ticket. */
	public function before( string $op, array $history, array $args ): array {
		if ( isset( $history['irreversible'] ) ) {
			return array( 'irreversible' => (string) $history['irreversible'] );
		}
		$scope  = (string) $history['scope'];
		$ticket = array( 'scope' => $scope, 'parts' => array(), 'before' => null, 'marks' => array(), 'error' => '' );
		$rows   = EMCP_Tools_FunnelKit_Rows::get();
		try {
			if ( ! empty( $history['create'] ) ) {
				$def = EMCP_Tools_FunnelKit_Graph::SCOPES[ $scope ];
				$ticket['marks'][ $def['root'][0] ] = $rows->max_id( $def['root'][0] );
				if ( isset( $def['posts'] ) ) {
					$ticket['marks']['posts'] = $rows->max_id( 'posts' );
				}
				if ( isset( $def['also'] ) && empty( $history['context'] ) ) {
					throw new RuntimeException( __( 'This creates a record linked to existing ones, and no context was declared to snapshot them, so it is not undone automatically.', 'emcp-tools' ) );
				}
				foreach ( (array) ( $history['context'] ?? array() ) as $context_scope => $arg ) {
					$ticket['context'] = array_merge( $ticket['context'] ?? array(), $this->graph()->resolve( (string) $context_scope, (int) ( $args[ $arg ] ?? 0 ) ) );
				}
				if ( ! empty( $ticket['context'] ) ) {
					$ticket['before'] = $this->graph()->read( $ticket['context'] );
					foreach ( $this->graph()->tables( $ticket['context'] ) as $table ) {
						if ( ! in_array( $table, array( 'postmeta', 'term_relationships', 'options' ), true ) ) {
							$ticket['marks'][ $table ] = $rows->max_id( $table );
						}
					}
				}
				return $ticket;
			}
			$key              = isset( $history['key'] ) ? (int) ( $args[ $history['key'] ] ?? 0 ) : 0; // settings has no key.
			$ticket['parts']  = $this->graph()->resolve( $scope, $key );
			$ticket['before'] = $this->graph()->read( $ticket['parts'] );
			foreach ( $this->graph()->tables( $ticket['parts'] ) as $table ) {
				if ( ! in_array( $table, array( 'postmeta', 'term_relationships', 'options' ), true ) ) {
					$ticket['marks'][ $table ] = $rows->max_id( $table );
				}
			}
		} catch ( Throwable $e ) {
			$ticket['error'] = $e->getMessage();
		}
		return $ticket;
	}

	/** Record the write. $message is FunnelKit's envelope message (Rest::last_message()). */
	public function after( array $ticket, string $op, array $history, array $args, $result, string $message = '' ): array {
		$entry = array(
			'domain'  => (string) ( $history['domain'] ?? ( in_array( $ticket['scope'] ?? '', array( 'funnel', 'step', 'experiment' ), true ) ? 'funnelkit' : 'funnelkit-automations' ) ),
			'action'  => $op,
			'target'  => (string) ( $ticket['scope'] ?? '' ) . ( isset( $ticket['parts'][0][1] ) ? ' #' . $ticket['parts'][0][1] : '' ) . ( isset( $ticket['job'] ) ? ' job:' . $ticket['job'] : '' ),
			'summary' => sprintf( 'FunnelKit: %s', $op ),
		);
		if ( isset( $ticket['irreversible'] ) ) {
			return $this->record_irreversible( $entry, $ticket['irreversible'] );
		}
		$created = self::created_ids( $op, $result );
		try {
			if ( '' !== $ticket['error'] ) {
				throw new RuntimeException( $ticket['error'] );
			}
			if ( ( ! empty( $history['create'] ) || ! empty( $history['creates'] ) ) && ! self::proven( $op, $message ) ) {
				throw new RuntimeException( __( 'Could not confirm that FunnelKit created this rather than returning an existing record, so it is not undone automatically.', 'emcp-tools' ) );
			}
			if ( ! empty( $history['create'] ) ) {
				$def  = EMCP_Tools_FunnelKit_Graph::SCOPES[ $ticket['scope'] ];
				$root = self::root_id( $ticket['scope'], $created );
				if ( $root <= (int) ( $ticket['marks'][ $def['root'][0] ] ?? PHP_INT_MAX ) ) {
					throw new RuntimeException( __( 'FunnelKit returned a record that already existed, so nothing new was created and there is nothing to undo.', 'emcp-tools' ) );
				}
				$ticket['parts'] = $this->graph()->resolve( $ticket['scope'], $root );
				$entry['target'] .= ' #' . $root;
				if ( ! empty( $ticket['context'] ) ) {
					// The root's own links must be exactly the context that was snapshotted.
					$linked = array_values( array_filter( $ticket['parts'], static fn( $part ) => $part[0] !== $ticket['scope'] ) );
					if ( $linked != $ticket['context'] ) { // phpcs:ignore Universal.Operators.StrictComparisons
						throw new RuntimeException( __( 'The new record is linked to something other than the context that was snapshotted, so it is not undone automatically.', 'emcp-tools' ) );
					}
				} else {
					$ticket['before'] = array( 'rows' => array(), 'posts' => array() );
				}
			}
			if ( ! $this->graph()->transactional( $ticket['parts'] ) ) {
				throw new RuntimeException( __( 'This data is stored in a table that cannot roll back a failed restore, so it is not undone automatically.', 'emcp-tools' ) );
			}
			$after = $this->graph()->read( $ticket['parts'] );
			if ( ! empty( $history['create'] ) ) {
				list( $root_table, ) = EMCP_Tools_FunnelKit_Graph::SCOPES[ $ticket['scope'] ]['root'];
				if ( ! isset( $after['rows'][ $root_table ][ (string) $root ] ) ) {
					throw new RuntimeException( __( 'FunnelKit reported a new record that cannot be found, so there is nothing to undo.', 'emcp-tools' ) );
				}
			}
			if ( empty( $history['create'] ) || ! empty( $ticket['context'] ) ) {
				self::check_new_members( $ticket, $after, $created );
			}
			$heavy = array( 'before' => $ticket['before'] );
			if ( strlen( (string) wp_json_encode( $heavy ) ) > self::MAX_SNAPSHOT_BYTES ) {
				throw new RuntimeException( __( 'This change is too large to snapshot for undo.', 'emcp-tools' ) );
			}
		} catch ( Throwable $e ) {
			return $this->record_irreversible( $entry, $e->getMessage() );
		}
		$rb = array(
			'type'       => 'funnelkit-snapshot',
			'parts'      => $ticket['parts'],
			'members'    => EMCP_Tools_FunnelKit_Graph::members( $after ),
			'after_hash' => EMCP_Tools_FunnelKit_Graph::fingerprint( $after ),
		);
		$entry['rollback'] = EMCP_Tools_Change_Recorder::attach_before( $rb, $heavy );
		return array( 'change_id' => EMCP_Tools_Change_Log::record( $entry ), 'undo' => array( 'available' => true ) );
	}

	/**
	 * Every member that appeared during a keyed write must be reported for its own table
	 * (or as a post) and be newer than that table's watermark.
	 */
	private static function check_new_members( array $ticket, array $after, array $created ): void {
		$reported = array();
		foreach ( $created as $kind => $ids ) {
			$table = isset( EMCP_Tools_FunnelKit_Graph::SCOPES[ $kind ]['root'] ) ? EMCP_Tools_FunnelKit_Graph::SCOPES[ $kind ]['root'][0] : ( 'post' === $kind ? 'posts' : $kind );
			$reported[ $table ] = array_map( 'strval', $ids );
		}
		$b = EMCP_Tools_FunnelKit_Graph::members( $ticket['before'] );
		$a = EMCP_Tools_FunnelKit_Graph::members( $after );
		$new = array( 'posts' => array_diff( $a['posts'], $b['posts'] ) );
		foreach ( $a['rows'] as $table => $ids ) {
			$new[ $table ] = array_diff( $ids, $b['rows'][ $table ] ?? array() );
		}
		foreach ( $new as $table => $ids ) {
			if ( in_array( $table, EMCP_Tools_FunnelKit_Graph::META_TABLES, true ) ) {
				continue; // the parent's own metadata, written by this write.
			}
			foreach ( $ids as $id ) {
				if ( ! in_array( (string) $id, $reported[ $table ] ?? array(), true ) ) {
					throw new RuntimeException( __( 'Another change happened to the same record while this ran, so this cannot be undone safely.', 'emcp-tools' ) );
				}
				if ( (int) $id <= (int) ( $ticket['marks'][ $table ] ?? PHP_INT_MAX ) ) {
					throw new RuntimeException( __( 'This attached a record that already existed, so undo could delete it; it is not undone automatically.', 'emcp-tools' ) );
				}
			}
		}
	}

	/** @return array<string,int[]> kind => IDs FunnelKit reported, from created-ids.php. */
	private static function created_ids( string $op, $result ): array {
		$out = array();
		foreach ( (array) ( self::created_map()[ $op ] ?? array() ) as $kind => $paths ) {
			if ( '_proof' === $kind ) {
				continue;
			}
			foreach ( (array) $paths as $path ) {
				// A list of paths is one alternative whose results are joined (a step and the sample offer created with it).
				$ids = array();
				foreach ( (array) $path as $one ) {
					$value = self::dig( $result, (string) $one );
					$ids   = array_merge( $ids, array_filter( array_map( 'intval', is_array( $value ) ? $value : array( $value ) ) ) );
				}
				$ids = array_values( array_unique( $ids ) );
				if ( $ids ) {
					$out[ $kind ] = $ids;
					break;
				}
			}
		}
		return $out;
	}

	/** Whether FunnelKit's own answer proves this call created what it reported (created-ids.php _proof). */
	private static function proven( string $op, string $message ): bool {
		$proof = self::created_map()[ $op ]['_proof'] ?? null;
		if ( 'insert' === $proof ) {
			return true;
		}
		if ( is_array( $proof ) && isset( $proof['message'] ) ) {
			list( $text, $domain ) = $proof['message'];
			return '' !== $message && $message === __( $text, $domain ); // phpcs:ignore WordPress.WP.I18n
		}
		return false;
	}

	private static function root_id( string $scope, array $created ): int {
		$ids = $created[ $scope ] ?? array();
		if ( count( $ids ) > 1 ) {
			throw new RuntimeException( __( 'This created several records at once, so it is not undone automatically. Remove them in FunnelKit if needed.', 'emcp-tools' ) );
		}
		if ( 1 !== count( $ids ) ) {
			throw new RuntimeException( __( 'FunnelKit did not report the ID it created, so this cannot be undone safely.', 'emcp-tools' ) );
		}
		return (int) $ids[0];
	}

	/** Dotted path into a response; `*` collects that field from every element of a list. */
	private static function dig( $data, string $path ) {
		$parts = explode( '.', $path );
		foreach ( $parts as $i => $part ) {
			if ( '*' === $part ) {
				$rest = implode( '.', array_slice( $parts, $i + 1 ) );
				$out  = array();
				foreach ( is_array( $data ) ? $data : array() as $item ) {
					$value = '' === $rest ? $item : self::dig( $item, $rest );
					if ( null !== $value && ! is_array( $value ) ) {
						$out[] = $value;
					}
				}
				return $out;
			}
			if ( ! is_array( $data ) || ! array_key_exists( $part, $data ) ) {
				return null;
			}
			$data = $data[ $part ];
		}
		return $data;
	}

	private function record_irreversible( array $entry, string $reason ): array {
		$entry['rollback'] = array( 'type' => 'irreversible', 'reason' => $reason );
		return array( 'change_id' => EMCP_Tools_Change_Log::record( $entry ), 'undo' => array( 'available' => false, 'reason' => $reason ) );
	}

	public function hash( array $rb ): string {
		try {
			return EMCP_Tools_FunnelKit_Graph::fingerprint( $this->graph()->read( (array) $rb['parts'] ) );
		} catch ( Throwable $e ) {
			return '';
		}
	}

	/** @return true|WP_Error */
	public function restore( array $rb, bool $force ) {
		if ( ! isset( $rb['before'], $rb['parts'] ) || ! is_array( $rb['before'] ) ) {
			return new WP_Error( 'snapshot_missing', __( 'The recorded state for this change is missing.', 'emcp-tools' ) );
		}
		try {
			$this->graph()->restore( (array) $rb['parts'], $rb['before'], $force ? null : (string) $rb['after_hash'] );
		} catch ( EMCP_Tools_FunnelKit_Conflict $e ) {
			return new WP_Error( 'conflict', __( 'This target has changed since the recorded change. Roll back anyway with force to overwrite the newer state.', 'emcp-tools' ) );
		} catch ( Throwable $e ) {
			if ( 'not_transactional' === $e->getMessage() ) {
				return new WP_Error( 'not_transactional', __( 'This data is now stored in a table that cannot roll back a failed restore, so it is not undone automatically.', 'emcp-tools' ) );
			}
			return new WP_Error( 'rollback_failed', $e->getMessage() );
		}
		return true;
	}

	/** @internal */
	public static function filter_hash( $hash, $rb ) {
		return ( is_array( $rb ) && 'funnelkit-snapshot' === ( $rb['type'] ?? '' ) ) ? self::instance()->hash( $rb ) : $hash;
	}

	/** @internal */
	public static function filter_apply( $result, $rb, $force = false ) {
		return ( is_array( $rb ) && 'funnelkit-snapshot' === ( $rb['type'] ?? '' ) ) ? self::instance()->restore( $rb, (bool) $force ) : $result;
	}

	// Jobs: one option per job, every state change a compare-and-swap.

	/** @return string Job token. */
	public function start_job( array $ticket, string $op, array $history, array $args, $result, string $status_operation, string $message = '' ): string {
		$token = wp_generate_uuid4();
		$job   = array(
			'state'   => 'pending',
			'op'      => $op,
			'history' => $history,
			'args'    => $args,
			'ticket'  => $ticket + array( 'job' => $token ),
			'message' => $message,
			'result'  => is_wp_error( $result ) ? $result->get_error_message() : $result,
			'status'  => $status_operation,
			'user'    => get_current_user_id(),
			'started' => time(),
		);
		if ( ! self::jobs_store()->insert( self::JOB_PREFIX . $token, (string) wp_json_encode( $job ) ) ) {
			throw new RuntimeException( 'Could not store the job.' );
		}
		if ( ! wp_next_scheduled( self::JOBS_CRON ) ) {
			wp_schedule_single_event( time() + 5 * MINUTE_IN_SECONDS, self::JOBS_CRON );
		}
		return $token;
	}

	/**
	 * Finish a job once its status says it is done (or it expired). Exactly one caller records it;
	 * every later caller gets the same answer.
	 *
	 * @return array|null The recorded answer, or null while the job runs or another process holds it.
	 */
	/** The stored job, or null. */
	public function job( string $token ): ?array {
		$raw = self::jobs_store()->get( self::JOB_PREFIX . $token );
		$job = null === $raw ? null : json_decode( $raw, true );
		return is_array( $job ) ? $job : null;
	}

	public function finalize_job( string $token ): ?array {
		$store = self::jobs_store();
		$key   = self::JOB_PREFIX . $token;
		$raw   = $store->get( $key );
		$job   = null === $raw ? null : json_decode( $raw, true );
		if ( ! is_array( $job ) ) {
			return null;
		}
		if ( 'finalized' === $job['state'] ) {
			return $job['answer'];
		}
		if ( 'finalizing' === $job['state'] && time() - (int) $job['claimed'] < self::CLAIM_TTL ) {
			return null;
		}
		// Ask about the resource the stored job names; a caller never supplies the status.
		$status  = apply_filters( 'emcp_tools_funnelkit_job_status', null, $job );
		$done    = is_array( $status ) && ! empty( $status['__done'] );
		$expired = time() - (int) $job['started'] >= self::JOB_EXPIRY;
		if ( ! $done && ! $expired ) {
			return null;
		}
		$owner   = wp_generate_uuid4();
		$claimed = array_merge( $job, array( 'state' => 'finalizing', 'owner' => $owner, 'claimed' => time() ) );
		$claim   = (string) wp_json_encode( $claimed );
		if ( ! $store->swap( $key, $raw, $claim ) ) {
			return null; // another caller claimed it first.
		}
		$answer = self::existing_answer( $token );
		if ( null === $answer ) {
			$answer = $done
				? $this->after( $job['ticket'], $job['op'], $job['history'], $job['args'], $job['result'], (string) ( $job['message'] ?? '' ) )
				: $this->record_irreversible(
					array( 'domain' => 'funnelkit', 'action' => $job['op'], 'target' => 'job:' . $token, 'summary' => sprintf( 'FunnelKit: %s', $job['op'] ) ),
					__( 'This import did not finish within a day, so its result was not recorded for undo.', 'emcp-tools' )
				);
		}
		$store->swap( $key, $claim, (string) wp_json_encode( array_merge( $claimed, array( 'state' => 'finalized', 'answer' => $answer, 'finished' => time() ) ) ) );
		return $answer;
	}

	/** A History entry already recorded for this job by a process that died before marking it finalized. */
	private static function existing_answer( string $token ): ?array {
		foreach ( (array) ( EMCP_Tools_Change_Log::query( array( 'search' => 'job:' . $token, 'limit' => 5 ) )['items'] ?? array() ) as $entry ) {
			if ( false !== strpos( (string) ( $entry['target'] ?? '' ), 'job:' . $token ) ) {
				$blocker = EMCP_Tools_Change_Log::rollback_blocker( $entry );
				return array( 'change_id' => (string) $entry['id'], 'undo' => is_wp_error( $blocker ) ? array( 'available' => false, 'reason' => $blocker->get_error_message() ) : array( 'available' => true ) );
			}
		}
		return null;
	}

	/** Cron: check every pending job as the user who started it; drop finalized jobs after a day. */
	public static function run_jobs(): void {
		global $wpdb;
		$store = self::jobs_store();
		$keys  = $wpdb->get_col( $wpdb->prepare( "SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like( self::JOB_PREFIX ) . '%' ) ); // phpcs:ignore
		$open  = false;
		foreach ( (array) $keys as $key ) {
			$raw = $store->get( (string) $key );
			$job = null === $raw ? null : json_decode( $raw, true );
			if ( ! is_array( $job ) ) {
				continue;
			}
			if ( 'finalized' === $job['state'] ) {
				if ( time() - (int) ( $job['finished'] ?? 0 ) > DAY_IN_SECONDS ) {
					$store->remove( (string) $key, $raw );
				}
				continue;
			}
			$open     = true;
			$previous = get_current_user_id();
			wp_set_current_user( (int) $job['user'] );
			try {
				self::instance()->finalize_job( substr( (string) $key, strlen( self::JOB_PREFIX ) ) );
			} finally {
				wp_set_current_user( $previous );
			}
		}
		if ( $open && ! wp_next_scheduled( self::JOBS_CRON ) ) {
			wp_schedule_single_event( time() + 5 * MINUTE_IN_SECONDS, self::JOBS_CRON );
		}
	}
}
