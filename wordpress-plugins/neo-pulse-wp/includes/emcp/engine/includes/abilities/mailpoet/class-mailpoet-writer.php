<?php
/**
 * Every MailPoet write (spec 4.4): leases in one fixed order (D13), the EntityManager cleared (D8),
 * before-images of every row the write can touch, MailPoet's call while this process's statements
 * are recorded and its automations held unless asked (D5, D7), the drain of the subscriber events
 * the write queued, the read-back, the email and automation report (D6), reconciliation after a
 * failure, recovery, and History. Undo (D14) takes the write's leases, rechecks the after-version,
 * the blockers and the live constraints inside them, and puts the rows back in one transaction
 * without calling MailPoet.
 *
 * An object is [kind, id]: subscriber, list, tag, custom_fields (id 0), newsletter, automation.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_MailPoet_Writer {

	const TTL = 60;

	/** Lease order (D13). */
	const ORDER = array( 'custom_fields', 'tag', 'list', 'newsletter', 'automation', 'subscriber' );

	/** Statuses after which no undo makes a subscriber sendable again (D14). */
	const SUPPRESSED = array( 'unsubscribed', 'bounced', 'inactive' );

	/** @var EMCP_Tools_Lease|null */
	private static $lease = null;

	/** @var callable|null Test seam: runs once every lease is held. */
	public static $on_lease = null;

	/** @var callable|null Test seam: runs as an undo starts, before it takes its leases. */
	public static $before_undo = null;

	/** @var EMCP_Tools_MailPoet_Api */
	protected $api;

	/** @var bool Undo mode: no History record of its own. */
	protected $undo;

	/** @var array The objects of the transact() in progress. */
	protected $objects = array();

	public function __construct( EMCP_Tools_MailPoet_Api $api, bool $undo = false ) {
		$this->api  = $api;
		$this->undo = $undo;
	}

	public static function use_lease( ?EMCP_Tools_Lease $lease ): void {
		self::$lease = $lease;
	}

	private static function lease(): EMCP_Tools_Lease {
		if ( null === self::$lease ) {
			self::$lease = new EMCP_Tools_Lease();
		}
		return self::$lease;
	}

	public static function lease_key( string $kind, int $id ): string {
		return 'custom_fields' === $kind ? 'mailpoet-custom-fields' : 'mailpoet-' . $kind . '-' . $id;
	}

	/** The lease two parallel creates of the same person share (Review Focus 1). */
	public static function new_subscriber_key( string $email ): string {
		return 'mailpoet-new-subscriber-' . md5( strtolower( trim( $email ) ) );
	}

	/**
	 * Kinds in ORDER, ids ascending, then the new-subscriber keys of 'new' (emails).
	 *
	 * @param array<string,array> $ids_by_kind
	 * @return string[]
	 */
	public static function lock_order( array $ids_by_kind ): array {
		$keys = array();
		foreach ( self::ORDER as $kind ) {
			if ( ! array_key_exists( $kind, $ids_by_kind ) ) {
				continue;
			}
			if ( 'custom_fields' === $kind ) {
				$keys[] = self::lease_key( $kind, 0 );
				continue;
			}
			$ids = array_values( array_unique( array_filter( array_map( 'intval', (array) $ids_by_kind[ $kind ] ) ) ) );
			sort( $ids );
			foreach ( $ids as $id ) {
				$keys[] = self::lease_key( $kind, $id );
			}
		}
		$new = array();
		foreach ( (array) ( $ids_by_kind['new'] ?? array() ) as $email ) {
			$new[ self::new_subscriber_key( (string) $email ) ] = true;
		}
		$new = array_keys( $new );
		sort( $new );
		return array_merge( $keys, $new );
	}

	/**
	 * Runs $fn holding every lease in $keys, in that order, never waiting.
	 *
	 * @return mixed|WP_Error
	 */
	public function locked( array $keys, callable $fn ) {
		$owner = 'mailpoet-' . bin2hex( random_bytes( 6 ) );
		$held  = array();
		foreach ( $keys as $key ) {
			if ( ! self::lease()->acquire( $key, $owner, self::TTL ) ) {
				foreach ( array_reverse( $held ) as $h ) {
					self::lease()->release( $h, $owner );
				}
				return new WP_Error( 'mailpoet_busy', __( 'Another change to this MailPoet object, or to one it is linked to, is running. Try again in a moment.', 'emcp-tools' ), array( 'status' => 409, 'lease' => $key ) );
			}
			$held[] = $key;
		}
		try {
			if ( self::$on_lease ) {
				( self::$on_lease )();
			}
			return $fn();
		} finally {
			foreach ( array_reverse( $held ) as $h ) {
				self::lease()->release( $h, $owner );
			}
		}
	}

	// Rows and hashes.

	public static function ref_key( string $kind, int $id ): string {
		return $kind . ':' . $id;
	}

	/** Capture's table name (mailpoet_ dropped) to the rows' table name. */
	public static function real_table( string $captured ): string {
		return in_array( $captured, EMCP_Tools_MailPoet_Api::SCOPE['tables'], true ) ? $captured : 'mailpoet_' . $captured;
	}

	/** @return array<string,array> "kind:id" => rows */
	public static function rows_of( EMCP_Tools_MailPoet_Api $api, array $objects ): array {
		$out = array();
		foreach ( $objects as $o ) {
			if ( (int) $o[1] > 0 || 'custom_fields' === (string) $o[0] ) {
				$out[ self::ref_key( (string) $o[0], (int) $o[1] ) ] = $api->rows( (string) $o[0], (int) $o[1] );
			}
		}
		return $out;
	}

	/** The rows of an inserted-ids map (capture names) that still exist. @return array<string,array> */
	public static function present( EMCP_Tools_MailPoet_Api $api, array $inserted ): array {
		$out = array();
		foreach ( $inserted as $table => $ids ) {
			$real = self::real_table( (string) $table );
			$cols = EMCP_Tools_MailPoet_Api::pk_cols( $real );
			if ( 1 !== count( $cols ) ) {
				continue;
			}
			$rows = $api->find( $real, array( $cols[0] => array_map( 'intval', (array) $ids ) ) );
			if ( $rows ) {
				$out[ $real ] = $rows;
			}
		}
		return $out;
	}

	/** The state History compares: every object's rows, and the inserted rows still there. */
	public static function state_hash( EMCP_Tools_MailPoet_Api $api, array $objects, array $inserted = array() ): string {
		return EMCP_Tools_MailPoet_Api::version(
			array(
				'objects'  => self::rows_of( $api, $objects ),
				'inserted' => self::present( $api, $inserted ),
			)
		);
	}

	/** Every row of several objects' row maps, table => key => row; synthetic # keys dropped. */
	public static function union( array $maps, ?array $tables = null ): array {
		$out = array();
		foreach ( $maps as $rows ) {
			foreach ( (array) $rows as $table => $list ) {
				if ( '#' === substr( (string) $table, 0, 1 ) || ( null !== $tables && ! in_array( $table, $tables, true ) ) ) {
					continue;
				}
				$out[ $table ] = ( $out[ $table ] ?? array() ) + (array) $list;
			}
		}
		return $out;
	}

	/** @return array<string,int[]> */
	protected static function ids_of( array $objects ): array {
		$out = array();
		foreach ( $objects as $o ) {
			$out[ (string) $o[0] ][] = (int) $o[1];
		}
		return $out;
	}

	/** The objects rows point at, by kind, for an undo's leases. @return array<string,int[]> */
	protected static function refs_in( array $maps ): array {
		$out = array();
		foreach ( self::union( $maps ) as $table => $rows ) {
			foreach ( $rows as $key => $r ) {
				switch ( $table ) {
					case 'mailpoet_subscribers':
						$out['subscriber'][] = (int) $key;
						break;
					case 'mailpoet_subscriber_segment':
						$out['subscriber'][] = (int) $r['subscriber_id'];
						$out['list'][]       = (int) $r['segment_id'];
						break;
					case 'mailpoet_subscriber_tag':
						$out['subscriber'][] = (int) $r['subscriber_id'];
						$out['tag'][]        = (int) $r['tag_id'];
						break;
					case 'mailpoet_subscriber_custom_field':
						$out['subscriber'][] = (int) $r['subscriber_id'];
						break;
					case 'mailpoet_segments':
						$out['list'][] = (int) $key;
						break;
					case 'mailpoet_tags':
						$out['tag'][] = (int) $key;
						break;
					case 'mailpoet_newsletters':
						$out['newsletter'][] = (int) $key;
						break;
					case 'mailpoet_newsletter_segment':
						$out['newsletter'][] = (int) $r['newsletter_id'];
						$out['list'][]       = (int) $r['segment_id'];
						break;
					case 'mailpoet_custom_fields':
						$out['custom_fields'] = array( 0 );
						break;
					case 'mailpoet_automations':
						$out['automation'][] = (int) $key;
						break;
				}
			}
		}
		return $out;
	}

	protected static function merge_ids( array ...$sets ): array {
		$out = array();
		foreach ( $sets as $set ) {
			foreach ( $set as $kind => $ids ) {
				$out[ $kind ] = array_merge( $out[ $kind ] ?? array(), (array) $ids );
			}
		}
		return $out;
	}

	/** @return int[] subscriber ids among the objects. */
	public static function subscribers_in( array $objects ): array {
		$out = array();
		foreach ( $objects as $o ) {
			if ( 'subscriber' === (string) $o[0] && (int) $o[1] > 0 ) {
				$out[] = (int) $o[1];
			}
		}
		return array_values( array_unique( $out ) );
	}

	/** The newsletter posts a write may change (D7). @return int[] */
	protected function leased_posts( array $befores ): array {
		$out = array();
		foreach ( self::union( $befores ) as $table => $rows ) {
			if ( 'posts' === $table ) {
				$out = array_merge( $out, array_map( 'intval', array_keys( $rows ) ) );
			}
		}
		return $out;
	}

	/** meta_id => post_id of the postmeta rows in the before-images. @return array<int,int> */
	protected function leased_metas( array $befores ): array {
		$out = array();
		foreach ( self::union( $befores ) as $table => $rows ) {
			if ( 'postmeta' === $table ) {
				foreach ( $rows as $mid => $m ) {
					$out[ (int) $mid ] = (int) $m['post_id'];
				}
			}
		}
		return $out;
	}

	// The write template (D5, D7, D8).

	/**
	 * @param array           $objects         [kind, id] pairs the write may change (id 0 for the one it creates).
	 * @param callable        $do              Runs MailPoet; returns ['id' => int, ...] or a WP_Error.
	 * @param callable        $verify          ( int $id ) => string[] fields that differ, or a WP_Error.
	 * @param callable        $record          ( array $result, array $befores, array $captured, array $report ) => change id.
	 * @param bool            $run_automations False holds MailPoet's automations for the call (D5).
	 * @param int[]           $subscribers     Subscribers whose queued events the write drains (D5).
	 * @param string|callable $primary         The captured table whose first insert is a create's object, or ( array $captured ) => its id.
	 * @return array|WP_Error {result, change, emails, automations, captured, warning?, warnings?}
	 */
	public function transact( array $objects, callable $do, callable $verify, callable $record, bool $run_automations, array $subscribers = array(), $primary = '' ) {
		if ( ! $this->api->entities_open() ) {
			return self::unavailable();
		}
		$subscriber_write = (bool) $subscribers;
		foreach ( $objects as $o ) {
			$subscriber_write = $subscriber_write || 'subscriber' === (string) $o[0];
		}
		if ( $subscriber_write && ! $this->api->notifier_ok() ) {
			return new WP_Error( 'automation_hold_unavailable', __( 'EMCP could not reach MailPoet\'s queue of subscriber events, so it cannot keep this write\'s automations from starting later; nothing was written.', 'emcp-tools' ) );
		}
		$this->objects = $objects;
		$this->api->clear_entities();
		$befores = self::rows_of( $this->api, $objects );
		$mark    = $this->api->mail_mark();
		$body    = function () use ( $do, $verify, $record, $befores, $mark, $subscribers, $primary ) {
			$state = array( 'dispatched' => false, 'mode' => 'fire', 'ids' => array_map( 'intval', $subscribers ) );
			try {
				// (1) MailPoet's call under capture; an open transaction rolled back.
				$cap = $this->api->without_side_effects( $this->api->capture( $do ) );
				$this->api->rollback_open();
				$state['ids'] = array_values( array_unique( array_merge( $state['ids'], array_map( 'intval', (array) ( $cap['inserted']['subscribers'] ?? array() ) ) ) ) );
				// (2) After an error: the outcome and any restore, nothing recorded yet.
				$outcome = null;
				if ( $cap['error'] ) {
					$outcome = $this->reconcile_decide( $befores, $cap, $verify, $primary, $state );
					if ( in_array( $outcome['kind'], array( 'recovered', 'nothing' ), true ) ) {
						$state['mode'] = 'drop';
					}
				}
				// (3) The events the write queued, under their own capture.
				$ev                  = $this->dispatch_events( $state['ids'], $state['mode'] );
				$state['dispatched'] = true;
				$report              = $this->report( $mark, $cap, $ev );
				if ( $outcome ) {
					return $this->reconcile_finish( $outcome, $befores, $cap, $record, $report );
				}
				// (4) The read-back; (5) History and the answer.
				return $this->finish( $befores, $cap, $verify, $record, $primary, $report );
			} finally {
				if ( ! $state['dispatched'] ) {
					$this->api->drain_events( $state['ids'], $state['mode'] );
				}
			}
		};
		return $run_automations ? $body() : $this->api->hold_automations( $body );
	}

	public static function unavailable(): WP_Error {
		return new WP_Error( 'mailpoet_unavailable', __( 'MailPoet\'s database layer stopped after an earlier error in this process, so nothing was written. Reconnect your AI client (it restarts EMCP\'s server) and try again.', 'emcp-tools' ), array( 'status' => 503 ) );
	}

	/** @return array{cap: array, errors: array<int,string>} */
	protected function dispatch_events( array $ids, string $mode ): array {
		$errors = array();
		$cap    = $this->api->capture(
			function () use ( $ids, $mode, &$errors ) {
				foreach ( $this->api->drain_events( $ids, $mode ) as $id => $e ) {
					$errors[ (int) $id ] = $e->getMessage();
				}
				return true;
			}
		);
		$this->api->rollback_open();
		return array( 'cap' => $this->api->without_side_effects( $cap ), 'errors' => $errors );
	}

	/** @return array{emails: array{sent: int, queued: int}, automations: int[], warnings: array[]} */
	protected function report( int $mark, array $cap, array $ev ): array {
		$runs = array_merge( (array) ( $cap['inserted']['automation_runs'] ?? array() ), (array) ( $ev['cap']['inserted']['automation_runs'] ?? array() ) );
		$out  = array(
			'emails'      => array( 'sent' => $this->api->mails_since( $mark ), 'queued' => 0 ),
			'automations' => array_values( array_unique( array_map( 'intval', $runs ) ) ),
			'warnings'    => array(),
		);
		if ( $ev['errors'] ) {
			$out['warnings'][] = array(
				'code'        => 'mailpoet_event_error',
				'message'     => __( 'A plugin listening to MailPoet\'s subscriber events failed after the change was saved; the change is kept. Its message is included.', 'emcp-tools' ),
				'subscribers' => $ev['errors'],
			);
		}
		return $out;
	}

	/** The answer's shape: warnings folded in. */
	protected static function answer( array $base, array $report ): array {
		$warnings = (array) $report['warnings'];
		unset( $report['warnings'] );
		$out = $base + $report;
		if ( $warnings ) {
			$out['warning']  = $warnings[0];
			$out['warnings'] = $warnings;
		}
		return $out;
	}

	/** @return array|WP_Error the success path: attribution, read-back, History. */
	protected function finish( array $befores, array $cap, callable $verify, callable $record, $primary, array $report ) {
		$result = is_array( $cap['result'] ) ? $cap['result'] : array();
		if ( empty( $result['id'] ) ) {
			$result['id'] = $this->primary_id( $cap, $primary );
		}
		$attributed = $this->api->wp_rows_attributed( $cap, $this->leased_posts( $befores ), $this->leased_metas( $befores ) );
		if ( is_wp_error( $attributed ) ) {
			return $this->uncertain( $cap, (array) ( $attributed->get_error_data()['tables'] ?? array() ), $attributed->get_error_message(), $report );
		}
		$bad = $verify( (int) ( $result['id'] ?? 0 ) );
		if ( is_wp_error( $bad ) ) {
			return $this->fail( $bad->get_error_code(), $bad->get_error_message(), $befores, $cap, (array) $bad->get_error_data() + $report );
		}
		if ( $bad ) {
			return $this->fail( 'save_incomplete', __( 'MailPoet did not store the change as written; it was put back.', 'emcp-tools' ), $befores, $cap, array( 'fields' => array_values( $bad ) ) + $report );
		}
		if ( $this->undo ) {
			return self::answer( array( 'result' => $result, 'change' => '', 'captured' => $cap ), $report );
		}
		$change = (string) $record( $result, $befores, $cap, $report );
		if ( '' === $change ) {
			return $this->fail( 'history_unavailable', __( 'History could not record this change, so it was put back.', 'emcp-tools' ), $befores, $cap, $report );
		}
		return self::answer( array( 'result' => $result, 'change' => $change, 'captured' => $cap ), $report );
	}

	protected function primary_id( array $cap, $primary ): int {
		if ( is_callable( $primary ) ) {
			return (int) $primary( $cap );
		}
		if ( '' !== $primary && ! empty( $cap['inserted'][ $primary ] ) ) {
			return (int) $cap['inserted'][ $primary ][0];
		}
		if ( is_array( $cap['result'] ) && ! empty( $cap['result']['id'] ) ) {
			return (int) $cap['result']['id'];
		}
		return isset( $this->objects[0][1] ) ? (int) $this->objects[0][1] : 0;
	}

	/**
	 * D7 after an error: what happened, decided from this process's own statements, and the restore
	 * of a partial write. Nothing is recorded here (review round 5).
	 *
	 * @return array{kind: string, id?: int, left?: string[], tables?: string[], cause?: string}
	 */
	protected function reconcile_decide( array $befores, array $cap, callable $verify, $primary, array &$state ): array {
		$error = $cap['error'];
		if ( $cap['uncertain'] ) {
			return array( 'kind' => 'uncertain', 'tables' => array(), 'cause' => $error->get_error_message() );
		}
		$attributed = $this->api->wp_rows_attributed( $cap, $this->leased_posts( $befores ), $this->leased_metas( $befores ) );
		if ( is_wp_error( $attributed ) ) {
			return array( 'kind' => 'uncertain', 'tables' => (array) ( $attributed->get_error_data()['tables'] ?? array() ), 'cause' => $error->get_error_message() );
		}
		if ( ! $cap['inserted'] && ! $cap['updated'] && ! $cap['deleted'] ) {
			return array( 'kind' => 'nothing' );
		}
		$id  = $this->primary_id( $cap, $primary );
		$bad = $id > 0 ? $verify( $id ) : array( 'unknown' );
		if ( ! is_wp_error( $bad ) && ! $bad && ! $this->undo ) {
			return array( 'kind' => 'kept', 'id' => $id );
		}
		$left = $this->recover( $befores, $cap );
		if ( ! $left ) {
			$state['mode'] = 'drop';
			return array( 'kind' => 'recovered' );
		}
		return array( 'kind' => 'partial', 'left' => $left );
	}

	/** @return array|WP_Error the answer for a reconciled error, History recorded now. */
	protected function reconcile_finish( array $outcome, array $befores, array $cap, callable $record, array $report ) {
		$error = $cap['error'];
		$code  = 'capture_throw' === $error->get_error_code() ? 'mailpoet_error' : $error->get_error_code();
		switch ( $outcome['kind'] ) {
			case 'uncertain':
				return $this->uncertain( $cap, (array) $outcome['tables'], (string) $outcome['cause'], $report );
			case 'nothing':
				$warn = $report['warnings'];
				unset( $report['warnings'] );
				return new WP_Error( $code, $error->get_error_message(), array_merge( (array) $error->get_error_data(), $report, $warn ? array( 'warnings' => $warn ) : array() ) );
			case 'kept':
				$change = (string) $record( array( 'id' => $outcome['id'] ), $befores, $cap, $report );
				if ( '' !== $change ) {
					$report['warnings'] = array_merge(
						array( array( 'code' => 'mailpoet_after_save_error', 'message' => $error->get_error_message() ) ),
						(array) $report['warnings']
					);
					return self::answer( array( 'result' => array( 'id' => $outcome['id'] ), 'change' => $change, 'captured' => $cap ), $report );
				}
				$left = $this->recover( $befores, $cap );
				if ( $left ) {
					return $this->partial( $befores, $cap, $left, $code, self::flat( $report ) );
				}
				return new WP_Error( 'history_unavailable', __( 'History could not record this change, so it was put back.', 'emcp-tools' ), self::flat( $report ) + array( 'restored' => true ) );
			case 'recovered':
				return new WP_Error( $code, $error->get_error_message(), array_merge( (array) $error->get_error_data(), array( 'recovered' => true ), self::flat( $report ) ) );
		}
		return $this->partial( $befores, $cap, (array) $outcome['left'], $code, self::flat( $report ) );
	}

	private static function flat( array $report ): array {
		$warn = (array) ( $report['warnings'] ?? array() );
		unset( $report['warnings'] );
		return $report + ( $warn ? array( 'warnings' => $warn ) : array() );
	}

	/** @return WP_Error nothing touched, a non-undoable entry left (D7). */
	protected function uncertain( array $cap, array $tables, string $cause, array $report ): WP_Error {
		$tables = array_values( array_unique( array_merge( $tables, (array) $cap['uncertain'] ) ) );
		$subs   = self::subscribers_in( $this->objects );
		foreach ( (array) ( $cap['inserted']['subscribers'] ?? array() ) as $sid ) {
			$subs[] = (int) $sid;
		}
		$change = $this->undo ? '' : EMCP_Tools_MailPoet_History::record_uncertain( $tables, $cause, $subs );
		return new WP_Error( 'mailpoet_error', __( 'MailPoet stopped half way and EMCP could not tell which rows it wrote, so it changed nothing. Check the tables named here in MailPoet.', 'emcp-tools' ), array( 'attribution_uncertain' => true, 'tables' => $tables, 'change_id' => $change, 'cause' => $cause ) + self::flat( $report ) );
	}

	/**
	 * Puts back the rows the call updated or deleted (from the before-images) and deletes the rows
	 * it inserted; nothing else.
	 *
	 * @return string[] "table:key" still different
	 */
	protected function recover( array $befores, array $cap ): array {
		$tables   = array_map( array( __CLASS__, 'real_table' ), array_values( array_unique( array_merge( (array) $cap['updated'], (array) $cap['deleted'] ) ) ) );
		$before   = self::union( $befores, $tables );
		$inserted = self::present( $this->api, (array) $cap['inserted'] );
		if ( $before || $inserted ) {
			$this->api->restore_rows( $before, $inserted );
		}
		$left = array();
		foreach ( $before as $table => $rows ) {
			foreach ( $rows as $key => $row ) {
				$now = $this->api->find( $table, self::pk_where( $table, (array) $row ) );
				if ( current( $now ) != $row ) {
					$left[] = $table . ':' . $key;
				}
			}
		}
		foreach ( self::present( $this->api, (array) $cap['inserted'] ) as $table => $rows ) {
			foreach ( array_keys( $rows ) as $key ) {
				if ( ! isset( $before[ $table ][ $key ] ) ) {
					$left[] = $table . ':' . $key;
				}
			}
		}
		return $left;
	}

	protected static function pk_where( string $table, array $row ): array {
		$w = array();
		foreach ( EMCP_Tools_MailPoet_Api::pk_cols( $table ) as $c ) {
			$w[ $c ] = $row[ $c ];
		}
		return $w;
	}

	protected function fail( string $code, string $message, array $befores, array $cap, array $data ): WP_Error {
		$data = self::flat( $data );
		$left = $this->recover( $befores, $cap );
		if ( ! $left ) {
			return new WP_Error( $code, $message, $data + array( 'restored' => true, 'status' => 409 ) );
		}
		return $this->partial( $befores, $cap, $left, $code, $data );
	}

	protected function partial( array $befores, array $cap, array $left, string $cause, array $data ): WP_Error {
		$change = $this->undo ? '' : EMCP_Tools_MailPoet_History::record_recovery( $this->objects, $befores, $cap, $left );
		return new WP_Error( 'partial_write', __( 'MailPoet stopped half way and EMCP could not put everything back. History holds the earlier rows; undo the entry there once the cause is fixed.', 'emcp-tools' ), array( 'rows' => $left, 'change_id' => $change, 'cause' => $cause, 'status' => 500 ) + $data );
	}

	// Checks.

	/** @return true|WP_Error */
	public static function version_check( string $current, ?string $given, bool $force, string $read ) {
		if ( $force ) {
			return true;
		}
		if ( null === $given || '' === $given ) {
			/* translators: %s: read operation. */
			return new WP_Error( 'missing_version', sprintf( __( 'Pass the version from %s as version (or force:true to overwrite whatever is there).', 'emcp-tools' ), $read ) );
		}
		if ( ! hash_equals( $current, $given ) ) {
			/* translators: %s: read operation. */
			return new WP_Error( 'conflict', sprintf( __( 'It changed since you read it. Read it again with %s and redo the change, or pass force:true.', 'emcp-tools' ), $read ), array( 'status' => 409, 'current_version' => $current ) );
		}
		return true;
	}

	protected static function invalid( string $message, array $data = array() ): WP_Error {
		return new WP_Error( 'invalid_argument', $message, $data );
	}

	// Subscribers (D5, D6, D9, D10, D11).

	protected function view(): EMCP_Tools_MailPoet_Integration {
		return new EMCP_Tools_MailPoet_Integration();
	}

	public static function linked( array $row ): bool {
		return (int) ( $row['wp_user_id'] ?? 0 ) > 0 || (int) ( $row['is_woocommerce_user'] ?? 0 ) > 0;
	}

	protected function subscriber_row( int $id ): ?array {
		$r = $this->api->row( 'mailpoet_subscribers', $id );
		return $r && null === $r['deleted_at'] ? $r : null;
	}

	/**
	 * MailPoet's subscribeToLists() restores a trashed subscriber and makes anyone not subscribed
	 * `unconfirmed` (double opt-in on) or `subscribed` (off) (MP\v1\Subscribers::subscribeToLists()),
	 * so lists are added only to subscribed people, or to unconfirmed ones while double opt-in keeps
	 * them unconfirmed; adding a list never changes anyone's consent.
	 *
	 * @return true|WP_Error
	 */
	protected function can_add_lists( array $row ) {
		if ( null !== $row['deleted_at'] ) {
			return new WP_Error( 'subscriber_trashed', __( 'This subscriber is in MailPoet\'s trash; adding a list would restore them. Restore them in MailPoet first.', 'emcp-tools' ), array( 'status' => 409, 'subscriber_ids' => array( (int) $row['id'] ) ) );
		}
		$status = (string) $row['status'];
		if ( 'subscribed' === $status || ( 'unconfirmed' === $status && $this->double_optin() ) ) {
			return true;
		}
		if ( 'unconfirmed' === $status ) {
			return new WP_Error( 'consent_required', __( 'This subscriber has not confirmed, and with double opt-in off MailPoet would confirm them when a list is added. Confirm them first (set-subscriber-status subscribed with confirm), or add the list in MailPoet.', 'emcp-tools' ), array( 'status' => 409, 'subscriber_ids' => array( (int) $row['id'] ) ) );
		}
		return new WP_Error( 'consent_required', __( 'This subscriber unsubscribed, bounced or went inactive, and adding a list would make them sendable again; only they can subscribe again.', 'emcp-tools' ), array( 'status' => 409, 'subscriber_ids' => array( (int) $row['id'] ) ) );
	}

	/** can_add_lists() over several subscribers: one refusal naming every one it applies to. @return true|WP_Error */
	protected function can_add_lists_all( array $rows ) {
		$bad = null;
		$ids = array();
		foreach ( $rows as $row ) {
			$ok = $this->can_add_lists( $row );
			if ( is_wp_error( $ok ) ) {
				$bad   = $bad ?? $ok;
				$ids[] = (int) $row['id'];
			}
		}
		if ( ! $bad ) {
			return true;
		}
		/* translators: %d: subscriber count. */
		return new WP_Error( $bad->get_error_code(), sprintf( __( '%d of these subscribers cannot be added to a list without changing their consent (unsubscribed, bounced, inactive, trashed, or unconfirmed with double opt-in off); nothing was written. Leave them out, for example with a filter on status subscribed.', 'emcp-tools' ), count( $ids ) ), array( 'status' => 409, 'subscriber_ids' => $ids ) );
	}

	protected function double_optin(): bool {
		return '1' === (string) ( ( (array) $this->api->settings( 'signup_confirmation' ) )['enabled'] ?? '' );
	}

	protected static function no_subscriber(): WP_Error {
		return EMCP_Tools_MailPoet_Integration::not_found( 'subscriber' );
	}

	/** Lists exist, are not trashed and are not system or dynamic lists (D11). @return true|WP_Error */
	protected function check_lists( array $ids ) {
		foreach ( $ids as $id ) {
			$l = $this->api->row( 'mailpoet_segments', (int) $id );
			if ( ! $l || null !== $l['deleted_at'] ) {
				/* translators: %d: list id. */
				return new WP_Error( 'not_found', sprintf( __( 'There is no MailPoet list %d.', 'emcp-tools' ), (int) $id ), array( 'status' => 404, 'list_id' => (int) $id ) );
			}
			if ( in_array( (string) $l['type'], EMCP_Tools_MailPoet_Api::SYSTEM_LISTS, true ) ) {
				/* translators: %s: list name. */
				return new WP_Error( 'system_list', sprintf( __( 'MailPoet keeps the list "%s" in step with WordPress users or WooCommerce customers itself, so EMCP does not write it.', 'emcp-tools' ), (string) $l['name'] ), array( 'status' => 400 ) );
			}
			if ( 'default' !== (string) $l['type'] ) {
				return new WP_Error( 'invalid_argument', __( 'Only ordinary MailPoet lists can be written; segments are read only.', 'emcp-tools' ) );
			}
		}
		return true;
	}

	/** @return true|WP_Error */
	protected function check_tags( array $ids ) {
		foreach ( $ids as $id ) {
			if ( ! $this->api->row( 'mailpoet_tags', (int) $id ) ) {
				/* translators: %d: tag id. */
				return new WP_Error( 'not_found', sprintf( __( 'There is no MailPoet tag %d.', 'emcp-tools' ), (int) $id ), array( 'status' => 404, 'tag_id' => (int) $id ) );
			}
		}
		return true;
	}

	/**
	 * Custom field values by cf_{id}, checked against each field's type before anything is written
	 * (Review Focus 3): '' clears; select and radio take one of their values; checkbox 1 or ''; date
	 * Y-m-d (with an optional time).
	 *
	 * @return array<int,string>|WP_Error field id => value
	 */
	protected function custom_values( array $cf ) {
		$defs = $this->view()->field_defs();
		$out  = array();
		foreach ( $cf as $key => $value ) {
			if ( ! preg_match( '/^cf_(\d+)$/', (string) $key, $m ) || ! isset( $defs[ (int) $m[1] ] ) ) {
				/* translators: %s: key. */
				return self::invalid( sprintf( __( 'There is no MailPoet custom field %s (use the cf_{id} keys list-custom-fields gives).', 'emcp-tools' ), (string) $key ) );
			}
			$def = $defs[ (int) $m[1] ];
			if ( is_bool( $value ) ) {
				$value = $value ? '1' : '';
			}
			if ( null === $value ) {
				$value = '';
			}
			if ( ! is_scalar( $value ) ) {
				/* translators: %s: field name. */
				return self::invalid( sprintf( __( 'The value of %s must be text.', 'emcp-tools' ), $def['name'] ) );
			}
			$v = (string) $value;
			if ( '' !== $v ) {
				switch ( $def['type'] ) {
					case 'select':
					case 'radio':
						$allowed = array_map( static fn( $o ) => (string) ( is_array( $o ) ? ( $o['value'] ?? '' ) : $o ), (array) ( $def['params']['values'] ?? array() ) );
						if ( ! in_array( $v, $allowed, true ) ) {
							/* translators: 1: field name, 2: allowed values. */
							return self::invalid( sprintf( __( '%1$s takes one of: %2$s.', 'emcp-tools' ), $def['name'], implode( ', ', $allowed ) ) );
						}
						break;
					case 'checkbox':
						if ( '0' === $v ) {
							$v = '';
						} elseif ( '1' !== $v ) {
							/* translators: %s: field name. */
							return self::invalid( sprintf( __( '%s is a checkbox: pass 1 (or true) to tick it and "" to clear it.', 'emcp-tools' ), $def['name'] ) );
						}
						break;
					case 'date':
						if ( ! preg_match( '/^(\d{4})-(\d{2})-(\d{2})( \d{2}:\d{2}:\d{2})?$/', $v, $d ) || ! checkdate( (int) $d[2], (int) $d[3], (int) $d[1] ) ) {
							/* translators: %s: field name. */
							return self::invalid( sprintf( __( '%s is a date: pass it as Y-m-d.', 'emcp-tools' ), $def['name'] ) );
						}
						break;
				}
			}
			$out[ (int) $m[1] ] = $v;
		}
		return $out;
	}

	/** MailPoet's quiet options unless asked (D5, D6). */
	protected static function options( bool $run_automations, bool $send_confirmation ): array {
		return array(
			'send_confirmation_email'      => $send_confirmation,
			'schedule_welcome_email'       => $run_automations,
			'skip_subscriber_notification' => ! $run_automations,
		);
	}

	/** What differs between a subscriber and what was asked. @return string[] */
	protected function subscriber_mismatches( int $id, array $want ): array {
		$rows = $this->api->rows( 'subscriber', $id );
		$r    = current( $rows['mailpoet_subscribers'] );
		if ( ! $r ) {
			return array( 'subscriber' );
		}
		$bad = array();
		if ( isset( $want['email'] ) && strtolower( trim( (string) $r['email'] ) ) !== strtolower( trim( (string) $want['email'] ) ) ) {
			$bad[] = 'email';
		}
		foreach ( array( 'first_name', 'last_name', 'status' ) as $k ) {
			if ( isset( $want[ $k ] ) && (string) $r[ $k ] !== (string) $want[ $k ] ) {
				$bad[] = $k;
			}
		}
		$member = array();
		foreach ( $rows['mailpoet_subscriber_segment'] as $m ) {
			$member[ (int) $m['segment_id'] ] = (string) $m['status'];
		}
		foreach ( (array) ( $want['lists_in'] ?? array() ) as $l ) {
			if ( 'subscribed' !== ( $member[ (int) $l ] ?? '' ) ) {
				$bad[] = 'list:' . (int) $l;
			}
		}
		foreach ( (array) ( $want['lists_out'] ?? array() ) as $l ) {
			if ( 'subscribed' === ( $member[ (int) $l ] ?? '' ) ) {
				$bad[] = 'list:' . (int) $l;
			}
		}
		$tags = array_map( static fn( $t ) => (int) $t['tag_id'], $rows['mailpoet_subscriber_tag'] );
		foreach ( (array) ( $want['tags_in'] ?? array() ) as $t ) {
			if ( ! in_array( (int) $t, $tags, true ) ) {
				$bad[] = 'tag:' . (int) $t;
			}
		}
		foreach ( (array) ( $want['tags_out'] ?? array() ) as $t ) {
			if ( in_array( (int) $t, $tags, true ) ) {
				$bad[] = 'tag:' . (int) $t;
			}
		}
		$values = array();
		foreach ( $rows['mailpoet_subscriber_custom_field'] as $v ) {
			$values[ (int) $v['custom_field_id'] ] = (string) $v['value'];
		}
		foreach ( (array) ( $want['custom'] ?? array() ) as $f => $v ) {
			if ( (string) ( $values[ (int) $f ] ?? '' ) !== (string) $v ) {
				$bad[] = 'cf_' . (int) $f;
			}
		}
		return $bad;
	}

	/** The answer of a subscriber write. */
	protected function subscriber_answer( int $id, array $t ): array {
		$out = array(
			'subscriber'  => $this->view()->subscriber_view( $id ),
			'change_id'   => (string) $t['change'],
			'emails'      => $t['emails'],
			'automations' => $t['automations'],
		);
		foreach ( array( 'warning', 'warnings' ) as $k ) {
			if ( isset( $t[ $k ] ) ) {
				$out[ $k ] = $t[ $k ];
			}
		}
		return $out;
	}

	protected function record_subscriber( string $mode, string $op ): callable {
		return static function ( array $result, array $befores, array $cap, array $report ) use ( $mode, $op ) {
			$id = (int) $result['id'];
			return EMCP_Tools_MailPoet_History::record_write( 'mailpoet-subscriber', $mode, $op, $id, array( array( 'subscriber', $id ) ), $befores, $cap, array( $id ), $report );
		};
	}

	protected static function synced(): WP_Error {
		return new WP_Error( 'synced_subscriber', __( 'This subscriber belongs to a WordPress user or WooCommerce customer: MailPoet takes its email and names from there, so change them on the user. Lists, tags, custom fields and status can be changed here.', 'emcp-tools' ), array( 'status' => 409 ) );
	}

	/** @return array|WP_Error */
	public function create_subscriber( array $a, bool $confirmed ) {
		$email = trim( (string) $a['email'] );
		if ( ! is_email( $email ) ) {
			return self::invalid( __( 'That is not a valid email address.', 'emcp-tools' ) );
		}
		$send = ! empty( $a['send_confirmation'] );
		if ( $send && ! $confirmed ) {
			return EMCP_Tools_MailPoet_Integration::confirm_required();
		}
		$lists = array_map( 'intval', (array) ( $a['list_ids'] ?? array() ) );
		$tags  = array_map( 'intval', (array) ( $a['tag_ids'] ?? array() ) );
		foreach ( array( $this->check_lists( $lists ), $this->check_tags( $tags ) ) as $ok ) {
			if ( is_wp_error( $ok ) ) {
				return $ok;
			}
		}
		$custom = $this->custom_values( (array) ( $a['custom_fields'] ?? array() ) );
		if ( is_wp_error( $custom ) ) {
			return $custom;
		}
		$run   = ! empty( $a['run_automations'] );
		$names = array_intersect_key( $a, array( 'first_name' => 1, 'last_name' => 1 ) );
		return $this->locked(
			self::lock_order( array( 'list' => $lists, 'tag' => $tags, 'new' => array( $email ) ) ),
			function () use ( $email, $send, $lists, $tags, $custom, $run, $names ) {
				$existing = $this->api->subscriber_by_email( $email );
				if ( null !== $existing ) {
					return new WP_Error( 'subscriber_exists', __( 'A MailPoet subscriber has this email already (in any case); update that subscriber instead.', 'emcp-tools' ), array( 'status' => 409, 'subscriber_id' => $existing ) );
				}
				$data = array( 'email' => $email ) + $names;
				foreach ( $custom as $f => $v ) {
					if ( '' !== $v ) {
						$data[ 'cf_' . $f ] = $v;
					}
				}
				$want = array( 'email' => $email, 'lists_in' => $lists, 'tags_in' => $tags, 'custom' => array_filter( $custom, static fn( $v ) => '' !== $v ) ) + $names;
				$t    = $this->transact(
					array( array( 'subscriber', 0 ) ),
					function () use ( $data, $lists, $tags, $run, $send ) {
						$r = $this->api->mp( 'addSubscriber', array( $data, $lists, self::options( $run, $send ) ) );
						if ( is_wp_error( $r ) ) {
							return $r;
						}
						$id = (int) $r['id'];
						foreach ( $tags as $tag ) {
							$x = $this->api->mp( 'tagSubscriber', array( $id, $tag ) );
							if ( is_wp_error( $x ) ) {
								return $x;
							}
						}
						return array( 'id' => $id );
					},
					fn( int $id ) => $this->subscriber_mismatches( $id, $want ),
					$this->record_subscriber( 'created', 'create-subscriber' ),
					$run,
					array(),
					'subscribers'
				);
				return is_wp_error( $t ) ? $t : $this->subscriber_answer( (int) $t['result']['id'], $t );
			}
		);
	}

	/** @return array|WP_Error */
	public function update_subscriber( int $id, ?string $version, bool $force, array $a ) {
		$row = $this->subscriber_row( $id );
		if ( ! $row ) {
			return self::no_subscriber();
		}
		$core = array_intersect_key( $a, array( 'email' => 1, 'first_name' => 1, 'last_name' => 1 ) );
		if ( $core && self::linked( $row ) ) {
			return self::synced();
		}
		if ( isset( $core['email'] ) ) {
			$core['email'] = trim( (string) $core['email'] );
			if ( ! is_email( $core['email'] ) ) {
				return self::invalid( __( 'That is not a valid email address.', 'emcp-tools' ) );
			}
		}
		$add_l = array_map( 'intval', (array) ( $a['add_lists'] ?? array() ) );
		$rem_l = array_map( 'intval', (array) ( $a['remove_lists'] ?? array() ) );
		$add_t = array_map( 'intval', (array) ( $a['add_tags'] ?? array() ) );
		$rem_t = array_map( 'intval', (array) ( $a['remove_tags'] ?? array() ) );
		foreach ( array( $this->check_lists( array_merge( $add_l, $rem_l ) ), $this->check_tags( array_merge( $add_t, $rem_t ) ) ) as $ok ) {
			if ( is_wp_error( $ok ) ) {
				return $ok;
			}
		}
		$custom = $this->custom_values( (array) ( $a['custom_fields'] ?? array() ) );
		if ( is_wp_error( $custom ) ) {
			return $custom;
		}
		if ( ! $core && ! $custom && ! $add_l && ! $rem_l && ! $add_t && ! $rem_t ) {
			return self::invalid( __( 'Nothing to change: pass at least one field.', 'emcp-tools' ) );
		}
		$run = ! empty( $a['run_automations'] );
		$ids = array( 'list' => array_merge( $add_l, $rem_l ), 'tag' => array_merge( $add_t, $rem_t ), 'subscriber' => array( $id ) );
		if ( isset( $core['email'] ) ) {
			$ids['new'] = array( $core['email'] );
		}
		return $this->locked(
			self::lock_order( $ids ),
			function () use ( $id, $version, $force, $core, $custom, $add_l, $rem_l, $add_t, $rem_t, $run ) {
				$ok = self::version_check( $this->api->version_of( 'subscriber', $id ), $version, $force, 'get-subscriber' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$row = $this->subscriber_row( $id );
				if ( ! $row ) {
					return self::no_subscriber();
				}
				if ( $core && self::linked( $row ) ) {
					return self::synced();
				}
				if ( $add_l ) {
					$ok = $this->can_add_lists( $row );
					if ( is_wp_error( $ok ) ) {
						return $ok;
					}
				}
				if ( isset( $core['email'] ) ) {
					$other = $this->api->subscriber_by_email( $core['email'] );
					if ( null !== $other && $other !== $id ) {
						return new WP_Error( 'email_exists', __( 'Another MailPoet subscriber has this email (in any case).', 'emcp-tools' ), array( 'status' => 409 ) );
					}
				}
				$want = $core + array( 'status' => (string) $row['status'], 'lists_in' => $add_l, 'lists_out' => $rem_l, 'tags_in' => $add_t, 'tags_out' => $rem_t, 'custom' => $custom );
				$t    = $this->transact(
					array( array( 'subscriber', $id ) ),
					function () use ( $id, $core, $custom, $add_l, $rem_l, $add_t, $rem_t, $run ) {
						if ( $core ) {
							$this->api->save_subscriber( $id, $core );
						}
						if ( $custom ) {
							$this->api->set_custom_values( $id, $custom );
						}
						$steps = array();
						if ( $add_l ) {
							$steps[] = array( 'subscribeToLists', array( $id, $add_l, self::options( $run, false ) ) );
						}
						if ( $rem_l ) {
							$steps[] = array( 'unsubscribeFromLists', array( $id, $rem_l ) );
						}
						foreach ( $add_t as $tag ) {
							$steps[] = array( 'tagSubscriber', array( $id, $tag ) );
						}
						foreach ( $rem_t as $tag ) {
							$steps[] = array( 'untagSubscriber', array( $id, $tag ) );
						}
						foreach ( $steps as $s ) {
							$r = $this->api->mp( $s[0], $s[1] );
							if ( is_wp_error( $r ) ) {
								return $r;
							}
						}
						return array( 'id' => $id );
					},
					fn( int $sid ) => $this->subscriber_mismatches( $sid, $want ),
					$this->record_subscriber( 'edit', 'update-subscriber' ),
					$run,
					array( $id )
				);
				return is_wp_error( $t ) ? $t : $this->subscriber_answer( $id, $t );
			}
		);
	}

	/** @return array|WP_Error */
	public function set_subscriber_status( int $id, ?string $version, bool $force, string $status, bool $confirmed, bool $run ) {
		$row = $this->subscriber_row( $id );
		if ( ! $row ) {
			return self::no_subscriber();
		}
		if ( 'unsubscribed' === $status ) {
			if ( 'unsubscribed' === (string) $row['status'] ) {
				return new WP_Error( 'already_unsubscribed', __( 'This subscriber is unsubscribed already.', 'emcp-tools' ), array( 'status' => 409 ) );
			}
			$lists = array_values( array_map( static fn( $m ) => (int) $m['segment_id'], $this->api->find( 'mailpoet_subscriber_segment', array( 'subscriber_id' => $id ) ) ) );
			return $this->locked(
				self::lock_order( array( 'list' => $lists, 'subscriber' => array( $id ) ) ),
				function () use ( $id, $version, $force, $run ) {
					$ok = self::version_check( $this->api->version_of( 'subscriber', $id ), $version, $force, 'get-subscriber' );
					if ( is_wp_error( $ok ) ) {
						return $ok;
					}
					$t = $this->transact(
						array( array( 'subscriber', $id ) ),
						fn() => $this->api->mp( 'unsubscribe', array( $id ) ),
						fn( int $sid ) => $this->subscriber_mismatches( $id, array( 'status' => 'unsubscribed' ) ),
						static function ( array $result, array $befores, array $cap, array $report ) use ( $id ) {
							/* translators: %d: subscriber id. */
							return EMCP_Tools_MailPoet_History::record_audit( 'set-subscriber-status', 'mailpoet-subscriber:' . $id, sprintf( __( 'MailPoet: subscriber #%d unsubscribed', 'emcp-tools' ), $id ), __( 'An unsubscribe is the record of the person\'s choice; EMCP never resubscribes anyone.', 'emcp-tools' ), array( $id ), array( 'automations' => $report['automations'], 'emails' => $report['emails'] ) );
						},
						$run,
						array( $id )
					);
					return is_wp_error( $t ) ? $t : $this->subscriber_answer( $id, $t );
				}
			);
		}
		if ( in_array( (string) $row['status'], self::SUPPRESSED, true ) ) {
			return new WP_Error( 'consent_required', __( 'This subscriber unsubscribed, bounced or went inactive; only they can subscribe again (through a form or the confirmation link).', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		if ( 'subscribed' === (string) $row['status'] ) {
			return new WP_Error( 'already_subscribed', __( 'This subscriber is subscribed already.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		if ( ! $confirmed ) {
			return EMCP_Tools_MailPoet_Integration::confirm_required();
		}
		return $this->locked(
			self::lock_order( array( 'subscriber' => array( $id ) ) ),
			function () use ( $id, $version, $force, $run ) {
				$ok = self::version_check( $this->api->version_of( 'subscriber', $id ), $version, $force, 'get-subscriber' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$row = $this->subscriber_row( $id );
				if ( ! $row || 'unconfirmed' !== (string) $row['status'] ) {
					return new WP_Error( 'consent_required', __( 'Only an unconfirmed subscriber can be confirmed by hand.', 'emcp-tools' ), array( 'status' => 409 ) );
				}
				$t = $this->transact(
					array( array( 'subscriber', $id ) ),
					function () use ( $id ) {
						$this->api->save_subscriber( $id, array( 'status' => 'subscribed' ) );
						return array( 'id' => $id );
					},
					fn( int $sid ) => $this->subscriber_mismatches( $id, array( 'status' => 'subscribed' ) ),
					$this->record_subscriber( 'edit', 'set-subscriber-status' ),
					$run,
					array( $id )
				);
				return is_wp_error( $t ) ? $t : $this->subscriber_answer( $id, $t );
			}
		);
	}

	/** @return array|WP_Error */
	public function send_confirmation_email( int $id ) {
		$row = $this->subscriber_row( $id );
		if ( ! $row ) {
			return self::no_subscriber();
		}
		if ( 'unconfirmed' !== (string) $row['status'] ) {
			return new WP_Error( 'not_unconfirmed', __( 'Only an unconfirmed subscriber gets the confirmation email.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		return $this->locked(
			self::lock_order( array( 'subscriber' => array( $id ) ) ),
			function () use ( $id ) {
				$t = $this->transact(
					array( array( 'subscriber', $id ) ),
					function () use ( $id ) {
						$this->api->send_confirmation( $id );
						return array( 'id' => $id );
					},
					static fn( int $sid ) => array(),
					static function ( array $result, array $befores, array $cap, array $report ) use ( $id ) {
						/* translators: %d: subscriber id. */
						return EMCP_Tools_MailPoet_History::record_audit( 'send-confirmation-email', 'mailpoet-subscriber:' . $id, sprintf( __( 'MailPoet: confirmation email sent to subscriber #%d', 'emcp-tools' ), $id ), __( 'A sent email cannot be taken back.', 'emcp-tools' ), array( $id ), array( 'emails' => $report['emails'] ) );
					},
					false,
					array( $id )
				);
				return is_wp_error( $t ) ? $t : $this->subscriber_answer( $id, $t );
			}
		);
	}

	// Batches (D13, spec 4.2).

	const BATCH_CAP  = 200;
	const MEMBER_CAP = 500;

	protected static function too_many( int $count, int $cap ): WP_Error {
		/* translators: 1: count, 2: cap. */
		return new WP_Error( 'too_many_subscribers', sprintf( __( 'This would touch %1$d subscribers; EMCP does at most %2$d in one call, so nothing was written. Split the work.', 'emcp-tools' ), $count, $cap ), array( 'status' => 400, 'count' => $count, 'cap' => $cap ) );
	}

	protected function batch_after( array $ids ): array {
		$out = array( 'row_hashes' => array(), 'after_status' => array() );
		foreach ( $ids as $id ) {
			$out['row_hashes'][ $id ]   = $this->api->version_of( 'subscriber', (int) $id );
			$out['after_status'][ $id ] = (string) ( $this->api->row( 'mailpoet_subscribers', (int) $id )['status'] ?? '' );
		}
		return $out;
	}

	/** One History entry for a batch, undone per row (spec 4.2). */
	protected function record_batch( string $op, array $all, array $created, array $befores, array $cap, array $report ): string {
		$all = array_values( array_unique( array_map( 'intval', $all ) ) );
		return EMCP_Tools_MailPoet_History::record_write(
			'mailpoet-batch',
			'batch',
			$op,
			0,
			array_map( static fn( $id ) => array( 'subscriber', $id ), $all ),
			$befores,
			$cap,
			$all,
			$report,
			$this->batch_after( $all ) + array( 'created_subscribers' => array_values( array_map( 'intval', $created ) ) )
		);
	}

	protected function batch_answer( array $t, array $extra ): array {
		$out = $extra + array(
			'emails'      => $t['emails'],
			'automations' => $t['automations'],
			'change_id'   => (string) $t['change'],
		);
		foreach ( array( 'warning', 'warnings' ) as $k ) {
			if ( isset( $t[ $k ] ) ) {
				$out[ $k ] = $t[ $k ];
			}
		}
		return $out;
	}

	/** @return array|WP_Error */
	public function import_subscribers( array $rows, string $if_exists, bool $run ) {
		if ( count( $rows ) > self::BATCH_CAP ) {
			return self::too_many( count( $rows ), self::BATCH_CAP );
		}
		$prep  = array();
		$segs  = array( 'list' => array(), 'tag' => array() );
		$new   = array();
		$exist = array();
		foreach ( array_values( $rows ) as $i => $row ) {
			$email = is_array( $row ) ? trim( (string) ( $row['email'] ?? '' ) ) : '';
			if ( ! is_email( $email ) ) {
				/* translators: %d: row number. */
				return self::invalid( sprintf( __( 'Row %d has no valid email; nothing was written.', 'emcp-tools' ), $i + 1 ) );
			}
			$lists  = array_map( 'intval', (array) ( $row['list_ids'] ?? array() ) );
			$tags   = array_map( 'intval', (array) ( $row['tag_ids'] ?? array() ) );
			$custom = $this->custom_values( (array) ( $row['custom_fields'] ?? array() ) );
			foreach ( array( $this->check_lists( $lists ), $this->check_tags( $tags ), $custom ) as $ok ) {
				if ( is_wp_error( $ok ) ) {
					/* translators: 1: row number, 2: message. */
					return new WP_Error( $ok->get_error_code(), sprintf( __( 'Row %1$d: %2$s Nothing was written.', 'emcp-tools' ), $i + 1, $ok->get_error_message() ), $ok->get_error_data() );
				}
			}
			$id            = $this->api->subscriber_by_email( $email );
			$segs['list']  = array_merge( $segs['list'], $lists );
			$segs['tag']   = array_merge( $segs['tag'], $tags );
			if ( null === $id ) {
				$new[] = $email;
			} else {
				$exist[] = $id;
			}
			$prep[] = array( 'email' => $email, 'id' => $id, 'names' => array_intersect_key( (array) $row, array( 'first_name' => 1, 'last_name' => 1 ) ), 'lists' => $lists, 'tags' => $tags, 'custom' => $custom );
		}
		$exist = array_values( array_unique( $exist ) );
		// An existing match is never restored from the trash or resubscribed (can_add_lists()); checked
		// here and again inside the leases, before anything is written.
		$consent = function () use ( $prep, $if_exists ) {
			$rows = array();
			foreach ( $prep as $p ) {
				$id  = $this->api->subscriber_by_email( $p['email'] );
				$row = null === $id ? null : $this->api->row( 'mailpoet_subscribers', $id );
				if ( ! $row ) {
					continue;
				}
				if ( null !== $row['deleted_at'] ) {
					return $this->can_add_lists( $row );
				}
				if ( 'merge' === $if_exists && $p['lists'] ) {
					$rows[ $id ] = $row;
				}
			}
			return $this->can_add_lists_all( $rows );
		};
		$ok = $consent();
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		return $this->locked(
			self::lock_order( array( 'list' => $segs['list'], 'tag' => $segs['tag'], 'subscriber' => $exist, 'new' => $new ) ),
			function () use ( $prep, $exist, $if_exists, $run, $consent ) {
				$ok = $consent();
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$status = array();
				foreach ( $exist as $id ) {
					$status[ $id ] = (string) ( $this->api->row( 'mailpoet_subscribers', $id )['status'] ?? '' );
				}
				$answer  = array( 'created' => array(), 'updated' => array(), 'skipped' => array() );
				$objects = array_map( static fn( $id ) => array( 'subscriber', $id ), $exist );
				$t       = $this->transact(
					$objects ? $objects : array( array( 'subscriber', 0 ) ),
					function () use ( $prep, $if_exists, $run, &$answer ) {
						foreach ( $prep as $p ) {
							$id = $this->api->subscriber_by_email( $p['email'] );
							if ( null !== $id && 'skip' === $if_exists ) {
								$answer['skipped'][] = $id;
								continue;
							}
							if ( null === $id ) {
								$data = array( 'email' => $p['email'] ) + $p['names'];
								foreach ( $p['custom'] as $f => $v ) {
									if ( '' !== $v ) {
										$data[ 'cf_' . $f ] = $v;
									}
								}
								$r = $this->api->mp( 'addSubscriber', array( $data, $p['lists'], self::options( $run, false ) ) );
								if ( is_wp_error( $r ) ) {
									return $r;
								}
								$id                  = (int) $r['id'];
								$answer['created'][] = $id;
							} else {
								$row   = $this->api->row( 'mailpoet_subscribers', $id );
								$names = $row && self::linked( $row ) ? array() : $p['names'];
								if ( $names ) {
									$this->api->save_subscriber( $id, $names );
								}
								if ( $p['custom'] ) {
									$this->api->set_custom_values( $id, $p['custom'] );
								}
								if ( $p['lists'] ) {
									$r = $this->api->mp( 'subscribeToLists', array( $id, $p['lists'], self::options( $run, false ) ) );
									if ( is_wp_error( $r ) ) {
										return $r;
									}
								}
								$answer['updated'][] = $id;
							}
							foreach ( $p['tags'] as $tag ) {
								$r = $this->api->mp( 'tagSubscriber', array( $id, $tag ) );
								if ( is_wp_error( $r ) ) {
									return $r;
								}
							}
						}
						return array( 'id' => 0 );
					},
					function () use ( &$answer, $status ) {
						$bad = array();
						foreach ( array_merge( $answer['created'], $answer['updated'] ) as $id ) {
							$row = $this->subscriber_row( (int) $id );
							if ( ! $row ) {
								$bad[] = 'subscriber:' . (int) $id;
							} elseif ( isset( $status[ (int) $id ] ) && $status[ (int) $id ] !== (string) $row['status'] ) {
								$bad[] = 'subscriber:' . (int) $id . ':status';
							}
						}
						return $bad;
					},
					function ( array $result, array $befores, array $cap, array $report ) use ( &$answer ) {
						return $this->record_batch( 'import-subscribers', array_merge( $answer['created'], $answer['updated'] ), $answer['created'], $befores, $cap, $report );
					},
					$run,
					$exist,
					static fn() => 0
				);
				if ( is_wp_error( $t ) ) {
					return $t;
				}
				return $this->batch_answer( $t, $answer );
			}
		);
	}

	/** @return array|WP_Error */
	public function tag_subscribers( array $a ) {
		$by_ids = array_key_exists( 'subscriber_ids', $a );
		if ( $by_ids === array_key_exists( 'filter', $a ) ) {
			return self::invalid( __( 'Pass subscriber_ids or filter, not both.', 'emcp-tools' ) );
		}
		$add_t = array_map( 'intval', (array) ( $a['add_tags'] ?? array() ) );
		$rem_t = array_map( 'intval', (array) ( $a['remove_tags'] ?? array() ) );
		$add_l = array_map( 'intval', (array) ( $a['add_lists'] ?? array() ) );
		$rem_l = array_map( 'intval', (array) ( $a['remove_lists'] ?? array() ) );
		$dry   = ! empty( $a['dry_run'] );
		if ( ! $add_t && ! $rem_t && ! $add_l && ! $rem_l ) {
			return self::invalid( __( 'Nothing to change: pass add_tags, remove_tags, add_lists or remove_lists.', 'emcp-tools' ) );
		}
		if ( $by_ids ) {
			$ids = array_values( array_unique( array_map( 'intval', (array) $a['subscriber_ids'] ) ) );
			if ( count( $ids ) > self::BATCH_CAP ) {
				return self::too_many( count( $ids ), self::BATCH_CAP );
			}
			foreach ( $ids as $id ) {
				if ( ! $this->subscriber_row( $id ) ) {
					return self::no_subscriber();
				}
			}
		} else {
			$f    = array_intersect_key( (array) $a['filter'], array_flip( array( 'search', 'status', 'list_id', 'tag_id' ) ) );
			$page = $this->api->subscribers_page( $f + array( 'limit' => self::BATCH_CAP + 1, 'offset' => 0 ) );
			if ( (int) $page['total'] > self::BATCH_CAP ) {
				return self::too_many( (int) $page['total'], self::BATCH_CAP );
			}
			$ids = array_values( array_map( static fn( $r ) => (int) $r['id'], $page['rows'] ) );
		}
		foreach ( array( $this->check_lists( array_merge( $add_l, $rem_l ) ), $this->check_tags( array_merge( $add_t, $rem_t ) ) ) as $ok ) {
			if ( is_wp_error( $ok ) ) {
				return $ok;
			}
		}
		if ( $dry ) {
			return array( 'dry_run' => true, 'count' => count( $ids ), 'subscriber_ids' => $ids );
		}
		if ( ! $ids ) {
			return array( 'count' => 0, 'subscriber_ids' => array() );
		}
		$run = ! empty( $a['run_automations'] );
		return $this->locked(
			self::lock_order( array( 'list' => array_merge( $add_l, $rem_l ), 'tag' => array_merge( $add_t, $rem_t ), 'subscriber' => $ids ) ),
			function () use ( $ids, $add_t, $rem_t, $add_l, $rem_l, $run ) {
				$rows = array();
				foreach ( $ids as $id ) {
					$row = $this->subscriber_row( $id );
					if ( ! $row ) {
						return self::no_subscriber();
					}
					$rows[ $id ] = $row;
				}
				if ( $add_l ) {
					$ok = $this->can_add_lists_all( $rows );
					if ( is_wp_error( $ok ) ) {
						return $ok;
					}
				}
				$status = array_map( static fn( $r ) => (string) $r['status'], $rows );
				$want   = array( 'lists_in' => $add_l, 'lists_out' => $rem_l, 'tags_in' => $add_t, 'tags_out' => $rem_t );
				$t    = $this->transact(
					array_map( static fn( $id ) => array( 'subscriber', $id ), $ids ),
					function () use ( $ids, $add_t, $rem_t, $add_l, $rem_l, $run ) {
						foreach ( $ids as $id ) {
							$steps = array();
							if ( $add_l ) {
								$steps[] = array( 'subscribeToLists', array( $id, $add_l, self::options( $run, false ) ) );
							}
							if ( $rem_l ) {
								$steps[] = array( 'unsubscribeFromLists', array( $id, $rem_l ) );
							}
							foreach ( $add_t as $tag ) {
								$steps[] = array( 'tagSubscriber', array( $id, $tag ) );
							}
							foreach ( $rem_t as $tag ) {
								$steps[] = array( 'untagSubscriber', array( $id, $tag ) );
							}
							foreach ( $steps as $s ) {
								$r = $this->api->mp( $s[0], $s[1] );
								if ( is_wp_error( $r ) ) {
									return $r;
								}
							}
						}
						return array( 'id' => 0 );
					},
					function () use ( $ids, $want, $status ) {
						$bad = array();
						foreach ( $ids as $id ) {
							foreach ( $this->subscriber_mismatches( $id, $want + array( 'status' => $status[ $id ] ) ) as $m ) {
								$bad[] = $id . ':' . $m;
							}
						}
						return $bad;
					},
					function ( array $result, array $befores, array $cap, array $report ) use ( $ids ) {
						return $this->record_batch( 'tag-subscribers', $ids, array(), $befores, $cap, $report );
					},
					$run,
					$ids,
					static fn() => 0
				);
				return is_wp_error( $t ) ? $t : $this->batch_answer( $t, array( 'count' => count( $ids ), 'subscriber_ids' => $ids ) );
			}
		);
	}

	/** Undo of a batch, row by row (spec 4.2): rows changed, opted out or in use since are left. @return true|WP_Error */
	protected function undo_batch( array $rb, bool $force ) {
		$befores = (array) ( $rb['before'] ?? array() );
		$created = array_map( 'intval', (array) ( $rb['created_subscribers'] ?? array() ) );
		$all     = array_map( static fn( $o ) => (int) $o[1], (array) ( $rb['objects'] ?? array() ) );
		$tables  = array_values( array_map( 'strval', (array) ( $rb['tables'] ?? array() ) ) );
		return $this->locked(
			self::lock_order( self::merge_ids( array( 'subscriber' => $all ), self::refs_in( $befores ) ) ),
			function () use ( $rb, $force, $befores, $created, $all, $tables ) {
				$blocker = EMCP_Tools_MailPoet_History::blocker( $this->api, $rb );
				if ( is_wp_error( $blocker ) ) {
					return $blocker;
				}
				$skipped = array();
				$done    = 0;
				foreach ( $all as $id ) {
					$now = $this->api->rows( 'subscriber', $id );
					if ( ! $force && ! hash_equals( (string) ( $rb['row_hashes'][ $id ] ?? '' ), EMCP_Tools_MailPoet_Api::version( $now ) ) ) {
						$skipped[] = $id;
						continue;
					}
					if ( in_array( $id, $created, true ) ) {
						if ( is_wp_error( EMCP_Tools_MailPoet_History::created_blocker( $this->api, $id, (array) ( $rb['inserted'] ?? array() ) ) ) ) {
							$skipped[] = $id;
							continue;
						}
						$this->api->restore_rows( array(), $now );
						++$done;
						continue;
					}
					$status = (string) ( current( $now['mailpoet_subscribers'] )['status'] ?? '' );
					$was    = (string) ( current( (array) ( $befores[ self::ref_key( 'subscriber', $id ) ]['mailpoet_subscribers'] ?? array() ) )['status'] ?? '' );
					if ( null !== EMCP_Tools_MailPoet_History::status_restore_blocked( $was, $status, (string) ( $rb['after_status'][ $id ] ?? '' ), $tables ) ) {
						$skipped[] = $id;
						continue;
					}
					$before = self::union( array( (array) ( $befores[ self::ref_key( 'subscriber', $id ) ] ?? array() ) ), $tables ? $tables : null );
					$here   = self::union( array( $now ), $tables ? $tables : null );
					if ( ! self::list_consent_ok( $before, $here ) || is_wp_error( $this->restore_checks( $before, $here ) ) ) {
						$skipped[] = $id;
						continue;
					}
					$this->api->restore_rows( $before, $here );
					++$done;
				}
				if ( $skipped ) {
					/* translators: %s: subscriber ids. */
					EMCP_Tools_MailPoet_History::record_undo_note( 'batch-undo-skipped', 'mailpoet-batch:0', sprintf( __( 'MailPoet: a batch undo left subscribers %s as they are (changed, opted out or in use since)', 'emcp-tools' ), implode( ', ', array_map( static fn( $i ) => '#' . $i, $skipped ) ) ), __( 'These subscribers changed, opted out or were used after the batch, so the undo left them alone.', 'emcp-tools' ), $skipped, array( 'skipped' => $skipped ) );
				}
				if ( 0 === $done && $all ) {
					return new WP_Error( 'nothing_undone', __( 'Every subscriber of this batch changed, opted out or was used since, so nothing was undone.', 'emcp-tools' ), array( 'status' => 409, 'skipped' => $skipped ) );
				}
				return true;
			}
		);
	}

	// Lists and tags (D11, D12, D13).

	protected function segment_answer( string $kind, int $id, array $t ): array {
		$view = 'list' === $kind ? $this->view()->list_view( $id ) : $this->view()->tag_view( $id );
		return array( $kind => $view, 'change_id' => (string) $t['change'] );
	}

	protected function record_segment( string $kind, string $mode, string $op, array $subscribers = array() ): callable {
		return static function ( array $result, array $befores, array $cap, array $report ) use ( $kind, $mode, $op, $subscribers ) {
			$id      = (int) $result['id'];
			$objects = 'deleted' === $mode ? array( array( $kind, $id ), array( $kind . '_members', $id ) ) : array( array( $kind, $id ) );
			return EMCP_Tools_MailPoet_History::record_write( 'mailpoet-' . $kind, $mode, $op, $id, $objects, $befores, $cap, $subscribers, $report );
		};
	}

	/** @return true|WP_Error */
	protected function writable_list( int $id ) {
		$l = $this->api->row( 'mailpoet_segments', $id );
		if ( ! $l || null !== $l['deleted_at'] ) {
			return EMCP_Tools_MailPoet_Integration::not_found( 'list' );
		}
		return $this->check_lists( array( $id ) );
	}

	/** @return array|WP_Error */
	public function create_segment( string $kind, array $a ) {
		$name = trim( (string) $a['name'] );
		if ( '' === $name ) {
			return self::invalid( __( 'A name is needed.', 'emcp-tools' ) );
		}
		$in = array( 'name' => $name, 'description' => (string) ( $a['description'] ?? '' ) );
		$t  = $this->transact(
			array( array( $kind, 0 ) ),
			function () use ( $kind, $in ) {
				$r = $this->api->mp( 'list' === $kind ? 'addList' : 'addTag', array( $in ) );
				return is_wp_error( $r ) ? $r : array( 'id' => (int) $r['id'] );
			},
			fn( int $id ) => $this->segment_mismatches( $kind, $id, $in ),
			$this->record_segment( $kind, 'created', 'create-' . $kind ),
			false,
			array(),
			'list' === $kind ? 'segments' : 'tags'
		);
		return is_wp_error( $t ) ? $t : $this->segment_answer( $kind, (int) $t['result']['id'], $t );
	}

	/** @return string[] */
	protected function segment_mismatches( string $kind, int $id, array $want ): array {
		$r = $this->api->row( 'list' === $kind ? 'mailpoet_segments' : 'mailpoet_tags', $id );
		if ( ! $r ) {
			return array( $kind );
		}
		$bad = array();
		foreach ( $want as $k => $v ) {
			if ( (string) $r[ $k ] !== (string) $v ) {
				$bad[] = $k;
			}
		}
		return $bad;
	}

	/** @return array|WP_Error */
	public function update_segment( string $kind, int $id, ?string $version, bool $force, array $a ) {
		$table = 'list' === $kind ? 'mailpoet_segments' : 'mailpoet_tags';
		if ( 'list' === $kind ) {
			$ok = $this->writable_list( $id );
			if ( is_wp_error( $ok ) ) {
				return $ok;
			}
		} elseif ( ! $this->api->row( $table, $id ) ) {
			return EMCP_Tools_MailPoet_Integration::not_found( 'tag' );
		}
		$in = array_intersect_key( $a, array( 'name' => 1, 'description' => 1 ) );
		if ( isset( $in['name'] ) ) {
			$in['name'] = trim( (string) $in['name'] );
		}
		if ( ! $in ) {
			return self::invalid( __( 'Nothing to change: pass name or description.', 'emcp-tools' ) );
		}
		return $this->locked(
			self::lock_order( array( $kind => array( $id ) ) ),
			function () use ( $kind, $table, $id, $version, $force, $in ) {
				$ok = self::version_check( $this->api->version_of( $kind, $id ), $version, $force, 'list' === $kind ? 'list-lists' : 'list-tags' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$row = $this->api->row( $table, $id );
				$t   = $this->transact(
					array( array( $kind, $id ) ),
					function () use ( $kind, $id, $in, $row ) {
						$r = $this->api->mp( 'list' === $kind ? 'updateList' : 'updateTag', array( array( 'id' => (string) $id, 'name' => (string) ( $in['name'] ?? $row['name'] ) ) + $in ) );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					fn( int $sid ) => $this->segment_mismatches( $kind, $id, $in ),
					$this->record_segment( $kind, 'edit', 'update-' . $kind ),
					false
				);
				return is_wp_error( $t ) ? $t : $this->segment_answer( $kind, $id, $t );
			}
		);
	}

	/** @return array|WP_Error */
	public function delete_segment( string $kind, int $id, ?string $version, bool $force ) {
		if ( 'list' === $kind ) {
			$ok = $this->writable_list( $id );
			if ( is_wp_error( $ok ) ) {
				return $ok;
			}
		} elseif ( ! $this->api->row( 'mailpoet_tags', $id ) ) {
			return EMCP_Tools_MailPoet_Integration::not_found( 'tag' );
		}
		$members = $this->members( $kind, $id );
		if ( count( $members ) > self::MEMBER_CAP ) {
			return self::too_many( count( $members ), self::MEMBER_CAP );
		}
		$news = 'list' === $kind ? array_values( array_map( static fn( $r ) => (int) $r['newsletter_id'], $this->api->find( 'mailpoet_newsletter_segment', array( 'segment_id' => $id ) ) ) ) : array();
		return $this->locked(
			self::lock_order( array( $kind => array( $id ), 'newsletter' => $news, 'subscriber' => $members ) ),
			function () use ( $kind, $id, $version, $force ) {
				$ok = self::version_check( $this->api->version_of( $kind, $id ), $version, $force, 'list' === $kind ? 'list-lists' : 'list-tags' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$members = $this->members( $kind, $id );
				if ( count( $members ) > self::MEMBER_CAP ) {
					return self::too_many( count( $members ), self::MEMBER_CAP );
				}
				$t = $this->transact(
					array( array( $kind, $id ), array( $kind . '_members', $id ) ),
					function () use ( $kind, $id ) {
						$r = $this->api->mp( 'list' === $kind ? 'deleteList' : 'deleteTag', array( (string) $id ) );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					fn( int $sid ) => $this->api->row( 'list' === $kind ? 'mailpoet_segments' : 'mailpoet_tags', $id ) ? array( $kind ) : array(),
					$this->record_segment( $kind, 'deleted', 'delete-' . $kind, $members ),
					false
				);
				return is_wp_error( $t ) ? $t : array( 'deleted' => $id, 'members' => count( $members ), 'change_id' => (string) $t['change'] );
			}
		);
	}

	/** @return int[] subscriber ids of a list's memberships or a tag's holders */
	protected function members( string $kind, int $id ): array {
		$rows = 'list' === $kind ? $this->api->find( 'mailpoet_subscriber_segment', array( 'segment_id' => $id ) ) : $this->api->find( 'mailpoet_subscriber_tag', array( 'tag_id' => $id ) );
		return array_values( array_unique( array_map( static fn( $r ) => (int) $r['subscriber_id'], $rows ) ) );
	}

	/** @return true|WP_Error */
	protected function undo_list( array $rb, bool $force ) {
		return $this->undo_segment( 'list', $rb, $force );
	}

	/** @return true|WP_Error */
	protected function undo_tag( array $rb, bool $force ) {
		return $this->undo_segment( 'tag', $rb, $force );
	}

	/**
	 * A deleted list or tag comes back with its links and memberships, without the memberships of
	 * subscribers erased since and never as subscribed for someone who unsubscribed since (D14).
	 *
	 * @return true|WP_Error
	 */
	protected function undo_segment( string $kind, array $rb, bool $force ) {
		if ( 'deleted' !== (string) ( $rb['mode'] ?? '' ) ) {
			return $this->undo_rows( $rb, $force );
		}
		$table   = 'list' === $kind ? 'mailpoet_segments' : 'mailpoet_tags';
		$link    = 'list' === $kind ? 'mailpoet_subscriber_segment' : 'mailpoet_subscriber_tag';
		$skipped = array();
		$befores = (array) ( $rb['before'] ?? array() );
		foreach ( $befores as $key => $rows ) {
			foreach ( (array) ( $rows[ $link ] ?? array() ) as $pk => $m ) {
				$s      = $this->api->row( 'mailpoet_subscribers', (int) $m['subscriber_id'] );
				$gone   = ! $s || null !== $s['deleted_at'];
				$optout = $s && 'list' === $kind && in_array( (string) $s['status'], self::SUPPRESSED, true ) && 'unsubscribed' !== (string) $m['status'];
				if ( $gone || $optout ) {
					$skipped[] = (int) $m['subscriber_id'];
					unset( $befores[ $key ][ $link ][ $pk ] );
				}
			}
		}
		$name = (string) ( current( (array) ( $befores[ self::ref_key( $kind, (int) ( $rb['id'] ?? 0 ) ) ][ $table ] ?? array() ) )['name'] ?? '' );
		foreach ( $this->api->find( $table, array( 'name' => $name ) ) as $other => $r ) {
			if ( (int) $other !== (int) ( $rb['id'] ?? 0 ) && null === ( $r['deleted_at'] ?? null ) ) {
				return new WP_Error( 'name_exists', __( 'Another list or tag has taken this name since; it is not undone.', 'emcp-tools' ), array( 'status' => 409 ) );
			}
		}
		$rb['before'] = $befores;
		$done         = $this->undo_rows( $rb, $force );
		if ( true === $done && $skipped ) {
			/* translators: %s: subscriber ids. */
			EMCP_Tools_MailPoet_History::record_undo_note( $kind . '-undo-skipped', 'mailpoet-' . $kind . ':' . (int) ( $rb['id'] ?? 0 ), sprintf( __( 'MailPoet: the undo left out subscribers %s (erased or unsubscribed since)', 'emcp-tools' ), implode( ', ', array_map( static fn( $i ) => '#' . $i, array_unique( $skipped ) ) ) ), __( 'These subscribers were erased or unsubscribed after the delete, so the undo did not put them back.', 'emcp-tools' ), array_values( array_unique( $skipped ) ), array( 'skipped' => array_values( array_unique( $skipped ) ) ) );
		}
		return $done;
	}

	// Custom field definitions (spec 4.2, Review Focus 3).

	const FIELD_TYPES = array( 'text', 'textarea', 'date', 'select', 'radio', 'checkbox' );

	/** Options a choice field needs, checked before MailPoet is called. @return true|WP_Error */
	protected static function field_params_ok( string $type, array $params ) {
		if ( in_array( $type, array( 'select', 'radio', 'checkbox' ), true ) ) {
			$values = array_values( array_filter( (array) ( $params['values'] ?? array() ), static fn( $v ) => is_array( $v ) && '' !== trim( (string) ( $v['value'] ?? '' ) ) ) );
			if ( ! $values ) {
				/* translators: %s: field type. */
				return self::invalid( sprintf( __( 'A %s field needs params.values: [{value}, ...].', 'emcp-tools' ), $type ) );
			}
			if ( 'checkbox' === $type && 1 !== count( $values ) ) {
				return self::invalid( __( 'A checkbox field takes exactly one value in params.values.', 'emcp-tools' ) );
			}
		}
		return true;
	}

	protected function field_name_taken( string $name, int $except = 0 ): bool {
		foreach ( $this->view()->field_defs() as $id => $f ) {
			if ( (int) $id !== $except && strtolower( $f['name'] ) === strtolower( $name ) ) {
				return true;
			}
		}
		return false;
	}

	protected function field_answer( int $id, array $t ): array {
		return array(
			'field'     => $this->view()->field_defs()[ $id ] ?? null,
			'version'   => $this->api->version_of( 'custom_fields', 0 ),
			'change_id' => (string) $t['change'],
		);
	}

	protected function record_fields( string $mode, string $op ): callable {
		return static function ( array $result, array $befores, array $cap, array $report ) use ( $mode, $op ) {
			return EMCP_Tools_MailPoet_History::record_write( 'mailpoet-custom-fields', $mode, $op, (int) $result['id'], array( array( 'custom_fields', 0 ) ), $befores, $cap, array(), $report );
		};
	}

	/** @return array|WP_Error */
	public function add_custom_field( array $a, ?string $version, bool $force ) {
		$name   = trim( (string) $a['name'] );
		$type   = (string) $a['type'];
		$params = (array) ( $a['params'] ?? array() );
		if ( '' === $name ) {
			return self::invalid( __( 'A name is needed.', 'emcp-tools' ) );
		}
		$ok = self::field_params_ok( $type, $params );
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		return $this->locked(
			self::lock_order( array( 'custom_fields' => array( 0 ) ) ),
			function () use ( $name, $type, $params, $version, $force ) {
				if ( null !== $version ) {
					$ok = self::version_check( $this->api->version_of( 'custom_fields', 0 ), $version, $force, 'list-custom-fields' );
					if ( is_wp_error( $ok ) ) {
						return $ok;
					}
				}
				if ( $this->field_name_taken( $name ) ) {
					return new WP_Error( 'field_exists', __( 'A custom field with this name exists already.', 'emcp-tools' ), array( 'status' => 409 ) );
				}
				$t = $this->transact(
					array( array( 'custom_fields', 0 ) ),
					function () use ( $name, $type, $params ) {
						$r = $this->api->mp( 'addSubscriberField', array( array( 'name' => $name, 'type' => $type, 'params' => $params ) ) );
						return is_wp_error( $r ) ? $r : array( 'id' => (int) substr( (string) $r['id'], 3 ) );
					},
					function ( int $id ) use ( $name, $type ) {
						$f = $this->view()->field_defs()[ $id ] ?? null;
						return $f && $f['name'] === $name && $f['type'] === $type ? array() : array( 'field' );
					},
					$this->record_fields( 'added', 'add-custom-field' ),
					false,
					array(),
					'custom_fields'
				);
				return is_wp_error( $t ) ? $t : $this->field_answer( (int) $t['result']['id'], $t );
			}
		);
	}

	/** @return array|WP_Error */
	public function update_custom_field( int $id, ?string $version, bool $force, array $a ) {
		$f = $this->view()->field_defs()[ $id ] ?? null;
		if ( ! $f ) {
			return EMCP_Tools_MailPoet_Integration::not_found( 'custom field' );
		}
		if ( isset( $a['type'] ) && (string) $a['type'] !== $f['type'] ) {
			return new WP_Error( 'type_change', __( 'A custom field\'s type never changes here: values stored for the old type would no longer fit. Add a new field instead.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		if ( ! isset( $a['name'] ) && ! isset( $a['params'] ) ) {
			return self::invalid( __( 'Nothing to change: pass name or params.', 'emcp-tools' ) );
		}
		$name   = isset( $a['name'] ) ? trim( (string) $a['name'] ) : $f['name'];
		$params = array_merge( $f['params'], (array) ( $a['params'] ?? array() ) );
		$ok     = self::field_params_ok( $f['type'], $params );
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		return $this->locked(
			self::lock_order( array( 'custom_fields' => array( 0 ) ) ),
			function () use ( $id, $f, $name, $params, $version, $force ) {
				$ok = self::version_check( $this->api->version_of( 'custom_fields', 0 ), $version, $force, 'list-custom-fields' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				if ( $this->field_name_taken( $name, $id ) ) {
					return new WP_Error( 'field_exists', __( 'A custom field with this name exists already.', 'emcp-tools' ), array( 'status' => 409 ) );
				}
				$t = $this->transact(
					array( array( 'custom_fields', 0 ) ),
					function () use ( $id, $f, $name, $params ) {
						$r = $this->api->rest( 'PUT', 'custom-fields/' . $id, array( 'name' => $name, 'type' => $f['type'], 'params' => $params ) );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					function ( int $fid ) use ( $id, $name ) {
						$now = $this->view()->field_defs()[ $id ] ?? null;
						return $now && $now['name'] === $name ? array() : array( 'name' );
					},
					$this->record_fields( 'edit', 'update-custom-field' ),
					false
				);
				return is_wp_error( $t ) ? $t : $this->field_answer( $id, $t );
			}
		);
	}

	// Newsletters and sending (D6, D16, D17).

	protected function newsletter_row( int $id ): ?array {
		$r = $this->api->row( 'mailpoet_newsletters', $id );
		return $r && null === $r['deleted_at'] ? $r : null;
	}

	protected static function no_newsletter(): WP_Error {
		return EMCP_Tools_MailPoet_Integration::not_found( 'newsletter' );
	}

	protected static function not_a_draft(): WP_Error {
		return new WP_Error( 'not_a_draft', __( 'Only a draft newsletter can be changed, deleted or sent; this one is scheduled, sending or sent.', 'emcp-tools' ), array( 'status' => 409 ) );
	}

	protected static function limit_reached(): WP_Error {
		return new WP_Error( 'mailpoet_limit_reached', __( 'MailPoet refuses to send: the site is over its plan\'s subscriber limit.', 'emcp-tools' ), array( 'status' => 403 ) );
	}

	/** JSON errors of SendingQueue: MailPoet answers forbidden for its subscriber limit. */
	protected static function sending_error( WP_Error $e ): WP_Error {
		return 'forbidden' === $e->get_error_code() ? self::limit_reached() : $e;
	}

	/** The fields of a newsletter save, MailPoet's names. */
	protected static function newsletter_fields( array $a ): array {
		$out = array_intersect_key( $a, array_flip( array( 'subject', 'preheader', 'sender_name', 'sender_address', 'reply_to_name', 'reply_to_address' ) ) );
		if ( ! empty( $a['list_ids'] ) ) {
			$out['segments'] = array_map( static fn( $id ) => array( 'id' => (int) $id ), (array) $a['list_ids'] );
		}
		return $out;
	}

	/**
	 * Writes the campaign name (the email post's title). MailPoet's Newsletters save takes no name
	 * for block-editor emails and creates the post as "New Email". @return true|WP_Error
	 */
	protected function put_name( int $newsletter, string $name ) {
		$post = (int) ( $this->newsletter_row( $newsletter )['wp_post_id'] ?? 0 );
		if ( ! $post ) {
			return new WP_Error( 'legacy_editor', __( 'This newsletter was made in MailPoet\'s legacy editor, which lists it by its subject; it has no separate name.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		$r = $this->api->write_post_title( $post, $name );
		return is_wp_error( $r ) ? $r : true;
	}

	/** @return string[] */
	protected function newsletter_mismatches( int $id, array $want, ?string $content, ?string $name = null ): array {
		$n = $this->newsletter_row( $id );
		if ( ! $n ) {
			return array( 'newsletter' );
		}
		$bad = array();
		foreach ( array( 'subject', 'preheader', 'sender_name', 'sender_address', 'reply_to_name', 'reply_to_address' ) as $k ) {
			if ( isset( $want[ $k ] ) && (string) $n[ $k ] !== (string) $want[ $k ] ) {
				$bad[] = $k;
			}
		}
		if ( isset( $want['segments'] ) ) {
			$have = $this->view()->newsletter_lists( $id );
			sort( $have );
			$need = array_map( static fn( $s ) => (int) $s['id'], $want['segments'] );
			sort( $need );
			if ( $have !== $need ) {
				$bad[] = 'list_ids';
			}
		}
		if ( null !== $content ) {
			$post = (int) ( $n['wp_post_id'] ?? 0 );
			if ( ! $post || (string) ( $this->api->row( 'posts', $post )['post_content'] ?? '' ) !== $content ) {
				$bad[] = 'content';
			}
		}
		if ( null !== $name ) {
			$post = (int) ( $n['wp_post_id'] ?? 0 );
			if ( ! $post || (string) ( $this->api->row( 'posts', $post )['post_title'] ?? '' ) !== $name ) {
				$bad[] = 'name';
			}
		}
		return $bad;
	}

	protected function newsletter_answer( int $id, array $t, array $extra = array() ): array {
		$out = array(
			'newsletter'  => $this->view()->newsletter_view( $id ),
			'change_id'   => (string) $t['change'],
			'emails'      => $t['emails'],
			'automations' => $t['automations'],
		) + $extra;
		foreach ( array( 'warning', 'warnings' ) as $k ) {
			if ( isset( $t[ $k ] ) ) {
				$out[ $k ] = $t[ $k ];
			}
		}
		return $out;
	}

	protected function record_newsletter( string $mode, string $op, array $extra = array() ): callable {
		return static function ( array $result, array $befores, array $cap, array $report ) use ( $mode, $op, $extra ) {
			$id = (int) $result['id'];
			return EMCP_Tools_MailPoet_History::record_write( 'mailpoet-newsletter', $mode, $op, $id, array( array( 'newsletter', $id ) ), $befores, $cap, array(), $report, $extra );
		};
	}

	/** Writes the content; '' when it was stored as given, else what WordPress stored. @return string|WP_Error */
	protected function put_content( int $newsletter, string $content, ?string &$stored ) {
		$post = (int) ( $this->newsletter_row( $newsletter )['wp_post_id'] ?? 0 );
		if ( ! $post ) {
			return new WP_Error( 'legacy_editor', __( 'This newsletter was made in MailPoet\'s legacy editor, whose body EMCP does not write; change it in MailPoet.', 'emcp-tools' ) );
		}
		$r = $this->api->write_post_content( $post, $content );
		if ( is_wp_error( $r ) ) {
			return $r;
		}
		$stored = (string) $r;
		return $stored;
	}

	protected static function filtered_warning( string $stored ): array {
		return array(
			'code'    => 'content_filtered',
			'message' => __( 'WordPress filtered the markup as it filters your posts (you cannot publish unfiltered HTML); what it stored is in body.', 'emcp-tools' ),
			'stored'  => $stored,
		);
	}

	/** @return array|WP_Error */
	public function create_newsletter( array $a ) {
		$lists = array_map( 'intval', (array) ( $a['list_ids'] ?? array() ) );
		$ok    = $this->check_lists( $lists );
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$fields  = self::newsletter_fields( $a );
		$content = isset( $a['content'] ) ? (string) $a['content'] : null;
		$name    = trim( (string) ( $a['name'] ?? '' ) );
		$name    = '' !== $name ? $name : (string) ( $fields['subject'] ?? '' );
		$stored  = null;
		$t       = $this->transact(
			array( array( 'newsletter', 0 ) ),
			function () use ( $fields, $content, $name, &$stored ) {
				$r = $this->api->json( 'Newsletters', 'create', array( 'type' => 'standard', 'subject' => (string) ( $fields['subject'] ?? '' ), 'new_editor' => true ) );
				if ( is_wp_error( $r ) ) {
					return $r;
				}
				$id = (int) ( $r['data']['id'] ?? 0 );
				if ( count( $fields ) > 1 || isset( $fields['segments'] ) ) {
					$s = $this->api->json( 'Newsletters', 'save', array( 'id' => $id ) + $fields );
					if ( is_wp_error( $s ) ) {
						return $s;
					}
				}
				if ( null !== $content ) {
					$c = $this->put_content( $id, $content, $stored );
					if ( is_wp_error( $c ) ) {
						return $c;
					}
				}
				if ( '' !== $name ) {
					$n = $this->put_name( $id, $name );
					if ( is_wp_error( $n ) ) {
						return $n;
					}
				}
				return array( 'id' => $id );
			},
			fn( int $id ) => $this->newsletter_mismatches( $id, $fields, $stored, '' !== $name ? $name : null ),
			$this->record_newsletter( 'created', 'create-newsletter' ),
			false,
			array(),
			'newsletters'
		);
		if ( is_wp_error( $t ) ) {
			return $t;
		}
		$out = $this->newsletter_answer( (int) $t['result']['id'], $t );
		if ( null !== $content && $stored !== $content ) {
			$out['warning'] = self::filtered_warning( (string) $stored );
		}
		return $out;
	}

	/** @return array|WP_Error */
	public function update_newsletter( int $id, ?string $version, bool $force, array $a ) {
		$n = $this->newsletter_row( $id );
		if ( ! $n ) {
			return self::no_newsletter();
		}
		if ( 'draft' !== (string) $n['status'] ) {
			return self::not_a_draft();
		}
		$content = isset( $a['content'] ) ? (string) $a['content'] : null;
		if ( null !== $content && ! (int) $n['wp_post_id'] ) {
			return new WP_Error( 'legacy_editor', __( 'This newsletter was made in MailPoet\'s legacy editor, whose body EMCP does not write; its subject, preheader, sender and lists can still change.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		$lists = array_map( 'intval', (array) ( $a['list_ids'] ?? array() ) );
		$ok    = $this->check_lists( $lists );
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$fields = self::newsletter_fields( $a );
		$name   = array_key_exists( 'name', $a ) ? trim( (string) $a['name'] ) : null;
		if ( '' === $name ) {
			return self::invalid( __( 'name cannot be empty; leave it out to keep the current one.', 'emcp-tools' ) );
		}
		if ( null !== $name && ! (int) $n['wp_post_id'] ) {
			return new WP_Error( 'legacy_editor', __( 'This newsletter was made in MailPoet\'s legacy editor, which lists it by its subject; it has no separate name.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		if ( ! $fields && null === $content && null === $name ) {
			return self::invalid( __( 'Nothing to change: pass at least one field.', 'emcp-tools' ) );
		}
		return $this->locked(
			self::lock_order( array( 'newsletter' => array( $id ), 'list' => $lists ) ),
			function () use ( $id, $version, $force, $fields, $content, $name ) {
				$ok = self::version_check( $this->api->version_of( 'newsletter', $id ), $version, $force, 'get-newsletter' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				if ( 'draft' !== (string) ( $this->newsletter_row( $id )['status'] ?? '' ) ) {
					return self::not_a_draft();
				}
				$stored = null;
				$t      = $this->transact(
					array( array( 'newsletter', $id ) ),
					function () use ( $id, $fields, $content, $name, &$stored ) {
						if ( null !== $name ) {
							$r = $this->put_name( $id, $name );
							if ( is_wp_error( $r ) ) {
								return $r;
							}
						}
						if ( $fields ) {
							$s = $this->api->json( 'Newsletters', 'save', array( 'id' => $id ) + $fields );
							if ( is_wp_error( $s ) ) {
								return $s;
							}
						}
						if ( null !== $content ) {
							$c = $this->put_content( $id, $content, $stored );
							if ( is_wp_error( $c ) ) {
								return $c;
							}
						}
						return array( 'id' => $id );
					},
					fn( int $nid ) => $this->newsletter_mismatches( $id, $fields, $stored, $name ),
					$this->record_newsletter( 'edit', 'update-newsletter' ),
					false
				);
				if ( is_wp_error( $t ) ) {
					return $t;
				}
				$out = $this->newsletter_answer( $id, $t );
				if ( null !== $content && $stored !== $content ) {
					$out['warning'] = self::filtered_warning( (string) $stored );
				}
				return $out;
			}
		);
	}

	/** @return array|WP_Error */
	public function duplicate_newsletter( int $id ) {
		if ( ! $this->newsletter_row( $id ) ) {
			return self::no_newsletter();
		}
		$t = $this->transact(
			array( array( 'newsletter', 0 ) ),
			fn() => array( 'id' => $this->api->duplicate_newsletter( $id ) ),
			fn( int $nid ) => $this->newsletter_row( $nid ) ? array() : array( 'newsletter' ),
			$this->record_newsletter( 'created', 'duplicate-newsletter' ),
			false
		);
		return is_wp_error( $t ) ? $t : $this->newsletter_answer( (int) $t['result']['id'], $t );
	}

	/** @return array|WP_Error */
	public function delete_newsletter( int $id, ?string $version, bool $force ) {
		$n = $this->newsletter_row( $id );
		if ( ! $n ) {
			return self::no_newsletter();
		}
		if ( 'draft' !== (string) $n['status'] ) {
			return self::not_a_draft();
		}
		return $this->locked(
			self::lock_order( array( 'newsletter' => array( $id ) ) ),
			function () use ( $id, $version, $force ) {
				$ok = self::version_check( $this->api->version_of( 'newsletter', $id ), $version, $force, 'get-newsletter' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$t = $this->transact(
					array( array( 'newsletter', $id ) ),
					function () use ( $id ) {
						$r = $this->api->json( 'Newsletters', 'delete', array( 'id' => $id ) );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					fn( int $nid ) => $this->api->row( 'mailpoet_newsletters', $id ) ? array( 'newsletter' ) : array(),
					$this->record_newsletter( 'deleted', 'delete-newsletter' ),
					false
				);
				return is_wp_error( $t ) ? $t : array( 'deleted' => $id, 'change_id' => (string) $t['change'] );
			}
		);
	}

	/** @return array|WP_Error a preview to the current user's own address only (D6). */
	public function send_test_email( int $id ) {
		if ( ! $this->newsletter_row( $id ) ) {
			return self::no_newsletter();
		}
		$to = $this->api->user_email();
		if ( ! is_email( $to ) ) {
			return self::invalid( __( 'Your WordPress user has no email address to send the test to.', 'emcp-tools' ) );
		}
		$t = $this->transact(
			array( array( 'newsletter', $id ) ),
			function () use ( $id, $to ) {
				$r = $this->api->json( 'Newsletters', 'sendPreview', array( 'id' => $id, 'subscriber' => $to ) );
				return is_wp_error( $r ) ? $r : array( 'id' => $id );
			},
			static fn( int $nid ) => array(),
			static function ( array $result, array $befores, array $cap, array $report ) use ( $id ) {
				/* translators: %d: newsletter id. */
				return EMCP_Tools_MailPoet_History::record_audit( 'send-test-email', 'mailpoet-newsletter:' . $id, sprintf( __( 'MailPoet: a test of newsletter #%d sent to you', 'emcp-tools' ), $id ), __( 'A sent email cannot be taken back.', 'emcp-tools' ), array(), array( 'emails' => $report['emails'] ) );
			},
			false
		);
		return is_wp_error( $t ) ? $t : $this->newsletter_answer( $id, $t, array( 'sent_to' => $to ) );
	}

	/**
	 * A site-local Y-m-d H:i in the future (Review Focus 2).
	 *
	 * @return array{local: string, utc: string}|WP_Error
	 */
	protected function schedule_time( string $at ) {
		$zone = wp_timezone();
		$d    = DateTime::createFromFormat( '!Y-m-d H:i', trim( $at ), $zone );
		if ( ! $d || $d->format( 'Y-m-d H:i' ) !== trim( $at ) ) {
			return self::invalid( __( 'scheduled_at is the site\'s local time as Y-m-d H:i.', 'emcp-tools' ) );
		}
		$now = new DateTime( $this->api->site_now(), $zone );
		if ( $d->getTimestamp() <= $now->getTimestamp() ) {
			return new WP_Error( 'past_time', __( 'scheduled_at is not in the future (it is read in the site\'s time zone).', 'emcp-tools' ), array( 'status' => 400, 'site_now' => $now->format( 'Y-m-d H:i:s' ) ) );
		}
		$local = $d->format( 'Y-m-d H:i:s' );
		$d->setTimezone( new DateTimeZone( 'UTC' ) );
		return array( 'local' => $local, 'utc' => $d->format( 'Y-m-d H:i:s' ) );
	}

	/** @return array|WP_Error */
	public function send_newsletter( int $id, ?string $version, bool $force, ?string $at, int $expected ) {
		$n = $this->newsletter_row( $id );
		if ( ! $n ) {
			return self::no_newsletter();
		}
		if ( 'draft' !== (string) $n['status'] ) {
			return self::not_a_draft();
		}
		$when = null;
		if ( null !== $at && '' !== $at ) {
			$when = $this->schedule_time( $at );
			if ( is_wp_error( $when ) ) {
				return $when;
			}
		}
		$lists = $this->view()->newsletter_lists( $id );
		if ( ! $lists ) {
			return self::invalid( __( 'This newsletter has no lists to send to; set list_ids first.', 'emcp-tools' ) );
		}
		$ok = $this->api->countable( $lists, $id );
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		if ( $this->api->subscriber_limit()['reached'] ) {
			return self::limit_reached();
		}
		return $this->locked(
			self::lock_order( array( 'newsletter' => array( $id ), 'list' => $lists ) ),
			function () use ( $id, $version, $force, $when, $expected, $lists ) {
				$ok = self::version_check( $this->api->version_of( 'newsletter', $id ), $version, $force, 'get-newsletter' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$ok = $this->api->countable( $this->view()->newsletter_lists( $id ), $id );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$count = $this->api->recipient_count( $lists );
				if ( $count !== $expected ) {
					/* translators: 1: live count, 2: expected. */
					return new WP_Error( 'recipients_mismatch', sprintf( __( 'This send would reach %1$d subscribers, not %2$d; nothing was queued. Check get-recipient-count and send again with that number.', 'emcp-tools' ), $count, $expected ), array( 'status' => 409, 'count' => $count ) );
				}
				// MailPoet's block editor stores scheduledAt in UTC, and SendingQueue::add reads it as UTC
				// for the task (EmailApiController::toUtcOptionValue(), SendingQueue.php:192).
				$options = $when ? array( 'isScheduled' => '1', 'scheduledAt' => $when['utc'] ) : array( 'isScheduled' => '0' );
				$queued  = 0;
				$t       = $this->transact(
					array( array( 'newsletter', $id ) ),
					function () use ( $id, $options ) {
						$s = $this->api->json( 'Newsletters', 'save', array( 'id' => $id, 'options' => $options ) );
						if ( is_wp_error( $s ) ) {
							return $s;
						}
						$r = $this->api->json( 'SendingQueue', 'add', array( 'newsletter_id' => $id ) );
						return is_wp_error( $r ) ? self::sending_error( $r ) : array( 'id' => $id );
					},
					function ( int $nid ) use ( $id, $when ) {
						$status = (string) ( $this->newsletter_row( $id )['status'] ?? '' );
						return ( $when ? 'scheduled' : 'sending' ) === $status ? array() : array( 'status' );
					},
					function ( array $result, array $befores, array $cap, array $report ) use ( $id, $when, &$queued ) {
						if ( $when ) {
							return EMCP_Tools_MailPoet_History::record_write( 'mailpoet-newsletter', 'scheduled', 'send-newsletter', $id, array( array( 'newsletter', $id ) ), $befores, $cap, array(), $report, array( 'scheduled_at' => $when['local'] ) );
						}
						$queued                     = $this->api->queued_count( $id );
						$report['emails']['queued'] = $queued;
						/* translators: 1: newsletter id, 2: recipients. */
						return EMCP_Tools_MailPoet_History::record_audit( 'send-newsletter', 'mailpoet-newsletter:' . $id, sprintf( __( 'MailPoet: newsletter #%1$d sent to %2$d subscribers', 'emcp-tools' ), $id, $queued ), __( 'MailPoet queued every recipient at once; a send cannot be taken back.', 'emcp-tools' ), array(), array( 'emails' => $report['emails'] ) );
					},
					false
				);
				if ( is_wp_error( $t ) ) {
					return $t;
				}
				$t['emails']['queued'] = $queued;
				return $this->newsletter_answer( $id, $t, $when ? array( 'scheduled_at_utc' => $when['utc'] ) : array() );
			}
		);
	}

	/** @return array|WP_Error EMCP's own cancelling transaction (D17); irreversible. */
	public function unschedule_newsletter( int $id ) {
		$n = $this->newsletter_row( $id );
		if ( ! $n ) {
			return self::no_newsletter();
		}
		if ( in_array( (string) $n['status'], array( 'sending', 'sent' ), true ) ) {
			return new WP_Error( 'sending_started', __( 'MailPoet has started sending this newsletter, so it cannot be taken back. Pause it instead.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		if ( 'scheduled' !== (string) $n['status'] ) {
			return new WP_Error( 'not_scheduled', __( 'This newsletter is not scheduled.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		return $this->locked(
			self::lock_order( array( 'newsletter' => array( $id ) ) ),
			function () use ( $id ) {
				$r = $this->api->cancel_sending( $id );
				if ( is_wp_error( $r ) ) {
					return $r;
				}
				/* translators: %d: newsletter id. */
				$change = EMCP_Tools_MailPoet_History::record_audit( 'unschedule-newsletter', 'mailpoet-newsletter:' . $id, sprintf( __( 'MailPoet: newsletter #%d taken back to draft', 'emcp-tools' ), $id ), __( 'Undoing an unschedule would schedule a send again without confirm and a recipient count; schedule it again with send-newsletter.', 'emcp-tools' ), array() );
				return array( 'newsletter' => $this->view()->newsletter_view( $id ), 'change_id' => $change );
			}
		);
	}

	/** @return array|WP_Error pause or resume through MailPoet's SendingQueue (irreversible entries). */
	public function sending_action( int $id, string $action ) {
		if ( ! $this->newsletter_row( $id ) ) {
			return self::no_newsletter();
		}
		if ( 'resume' === $action && $this->api->subscriber_limit()['reached'] ) {
			return self::limit_reached();
		}
		return $this->locked(
			self::lock_order( array( 'newsletter' => array( $id ) ) ),
			function () use ( $id, $action ) {
				$t = $this->transact(
					array( array( 'newsletter', $id ) ),
					function () use ( $id, $action ) {
						$r = $this->api->json( 'SendingQueue', $action, array( 'newsletter_id' => $id ) );
						return is_wp_error( $r ) ? self::sending_error( $r ) : array( 'id' => $id );
					},
					static fn( int $nid ) => array(),
					static function ( array $result, array $befores, array $cap, array $report ) use ( $id, $action ) {
						/* translators: 1: action, 2: newsletter id. */
						return EMCP_Tools_MailPoet_History::record_audit( $action . '-newsletter', 'mailpoet-newsletter:' . $id, sprintf( __( 'MailPoet: newsletter #%2$d %1$s', 'emcp-tools' ), 'pause' === $action ? __( 'paused', 'emcp-tools' ) : __( 'resumed', 'emcp-tools' ), $id ), __( 'Undoing a pause or a resume would stop or restart sending; use pause-newsletter or resume-newsletter.', 'emcp-tools' ), array() );
					},
					false
				);
				return is_wp_error( $t ) ? $t : $this->newsletter_answer( $id, $t );
			}
		);
	}

	/** Undo of a newsletter write: a schedule is cancelled in the cancelling transaction (D17). @return true|WP_Error */
	protected function undo_newsletter( array $rb, bool $force ) {
		if ( 'scheduled' !== (string) ( $rb['mode'] ?? '' ) ) {
			return $this->undo_rows( $rb, $force );
		}
		$id = (int) ( $rb['id'] ?? 0 );
		return $this->locked(
			self::lock_order( array( 'newsletter' => array( $id ) ) ),
			function () use ( $rb, $id ) {
				$blocker = EMCP_Tools_MailPoet_History::blocker( $this->api, $rb );
				if ( is_wp_error( $blocker ) ) {
					return $blocker;
				}
				return $this->api->cancel_sending( $id );
			}
		);
	}

	// Automations (D18).

	/** @return array|WP_Error */
	public function set_automation_status( int $id, ?string $version, bool $force, string $status, bool $confirmed ) {
		$a = $this->api->row( 'mailpoet_automations', $id );
		if ( ! $a || null !== $a['deleted_at'] || 'trash' === (string) $a['status'] ) {
			return EMCP_Tools_MailPoet_Integration::not_found( 'automation' );
		}
		if ( $status === (string) $a['status'] ) {
			/* translators: %s: status. */
			return new WP_Error( 'already_' . $status, sprintf( __( 'This automation is %s already.', 'emcp-tools' ), $status ), array( 'status' => 409 ) );
		}
		if ( 'active' === $status && ! $confirmed ) {
			return EMCP_Tools_MailPoet_Integration::confirm_required();
		}
		return $this->locked(
			self::lock_order( array( 'automation' => array( $id ) ) ),
			function () use ( $id, $version, $force, $status ) {
				$ok = self::version_check( $this->api->version_of( 'automation', $id ), $version, $force, 'get-automation' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$a     = $this->api->row( 'mailpoet_automations', $id );
				$steps = $this->view()->automation_view( $id, true )['steps'] ?? array();
				$t     = $this->transact(
					array( array( 'automation', $id ) ),
					function () use ( $id, $a, $steps, $status ) {
						$r = $this->api->rest( 'PUT', 'automations/' . $id, array( 'name' => (string) $a['name'], 'steps' => $steps, 'status' => $status ) );
						if ( is_wp_error( $r ) ) {
							if ( 'mailpoet_refused' === $r->get_error_code() ) {
								$msgs = array();
								foreach ( (array) ( $r->get_error_data()['errors'] ?? array() ) as $e ) {
									$msgs[] = is_array( $e ) ? (string) ( $e['message'] ?? wp_json_encode( $e ) ) : (string) $e;
								}
								/* translators: %s: MailPoet's messages. */
								return new WP_Error( 'automation_invalid', sprintf( __( 'MailPoet refused the automation: %s', 'emcp-tools' ), implode( ' ', array_filter( array_merge( array( $r->get_error_message() ), $msgs ) ) ) ), array( 'status' => 400, 'errors' => $r->get_error_data()['errors'] ?? null ) );
							}
							return $r;
						}
						return array( 'id' => $id );
					},
					fn( int $aid ) => (string) ( $this->api->row( 'mailpoet_automations', $id )['status'] ?? '' ) === $status ? array() : array( 'status' ),
					static function ( array $result, array $befores, array $cap, array $report ) use ( $id, $status ) {
						if ( 'active' === $status ) {
							return EMCP_Tools_MailPoet_History::record_write( 'mailpoet-automation', 'activated', 'set-automation-status', $id, array( array( 'automation', $id ) ), $befores, $cap, array(), $report );
						}
						/* translators: 1: automation id, 2: status. */
						return EMCP_Tools_MailPoet_History::record_audit( 'set-automation-status', 'mailpoet-automation:' . $id, sprintf( __( 'MailPoet: automation #%1$d set to %2$s', 'emcp-tools' ), $id, $status ), __( 'Undoing this would switch the automation on again; EMCP never reactivates an automation by undo.', 'emcp-tools' ), array() );
					},
					false
				);
				if ( is_wp_error( $t ) ) {
					return $t;
				}
				$out = array(
					'automation' => $this->view()->automation_view( $id ),
					'change_id'  => (string) $t['change'],
				);
				if ( 'active' === $status ) {
					$out['note'] = __( 'MailPoet registers an automation\'s trigger when a request starts, so it is live from the next request (and not in a long-running process that is already started).', 'emcp-tools' );
				}
				return $out;
			}
		);
	}

	// Erasure (D15).

	/** @return array|WP_Error */
	public function delete_subscriber( int $id ) {
		$row = $this->subscriber_row( $id );
		if ( ! $row ) {
			return self::no_subscriber();
		}
		if ( self::linked( $row ) ) {
			return new WP_Error( 'synced_subscriber', __( 'This subscriber belongs to a WordPress user or WooCommerce customer; MailPoet keeps it in step with the user, so it is not deleted here.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		$rows = $this->api->rows( 'subscriber', $id );
		return $this->locked(
			self::lock_order( self::merge_ids( array( 'subscriber' => array( $id ) ), self::refs_in( array( $rows ) ) ) ),
			function () use ( $id ) {
				$t = $this->transact(
					array( array( 'subscriber', $id ) ),
					function () use ( $id ) {
						$this->api->bulk_delete( array( $id ) );
						return array( 'id' => $id );
					},
					fn( int $sid ) => $this->api->row( 'mailpoet_subscribers', $id ) ? array( 'subscriber' ) : array(),
					/* translators: %d: subscriber id. */
					fn() => EMCP_Tools_MailPoet_History::record_audit( 'delete-subscriber', 'mailpoet-subscriber:' . $id, sprintf( __( 'MailPoet: subscriber #%d erased', 'emcp-tools' ), $id ), __( 'An erased subscriber cannot be brought back, and earlier History entries no longer hold their data.', 'emcp-tools' ), array(), array( 'erased' => $id ) ),
					false,
					array( $id )
				);
				if ( is_wp_error( $t ) ) {
					return $t;
				}
				$n = EMCP_Tools_MailPoet_History::redact_subscribers( array( $id ) );
				return array( 'deleted' => true, 'subscriber_id' => $id, 'history_redacted' => $n, 'change_id' => (string) $t['change'] );
			}
		);
	}

	// Undo (D14).

	/** @return true|WP_Error */
	public function undo( array $rb, bool $force ) {
		if ( self::$before_undo ) {
			( self::$before_undo )();
		}
		if ( ! $this->api->entities_open() ) {
			return self::unavailable();
		}
		$custom = 'undo_' . str_replace( '-', '_', substr( (string) ( $rb['type'] ?? '' ), 9 ) );
		if ( method_exists( $this, $custom ) ) {
			return $this->$custom( $rb, $force );
		}
		return $this->undo_rows( $rb, $force );
	}

	/** @return true|WP_Error */
	protected function undo_rows( array $rb, bool $force, ?callable $before_restore = null ) {
		$objects  = array_map( static fn( $o ) => array( (string) $o[0], (int) $o[1] ), (array) ( $rb['objects'] ?? array() ) );
		$befores  = (array) ( $rb['before'] ?? array() );
		$inserted = (array) ( $rb['inserted'] ?? array() );
		$tables   = array_values( array_map( 'strval', (array) ( $rb['tables'] ?? array() ) ) );
		$keys     = self::lock_order( self::merge_ids( self::ids_of( $objects ), self::refs_in( $befores ), self::refs_in( self::rows_of( $this->api, $objects ) ) ) );
		return $this->locked(
			$keys,
			function () use ( $rb, $force, $objects, $befores, $inserted, $tables, $before_restore ) {
				if ( ! $force && ! hash_equals( (string) ( $rb['after_hash'] ?? '' ), self::state_hash( $this->api, $objects, $inserted ) ) ) {
					return new WP_Error( 'conflict', __( 'This changed after the History entry, so it is not undone.', 'emcp-tools' ), array( 'status' => 409 ) );
				}
				$blocker = EMCP_Tools_MailPoet_History::blocker( $this->api, $rb );
				if ( is_wp_error( $blocker ) ) {
					return $blocker;
				}
				$before  = self::union( $befores, $tables ? $tables : null );
				$current = self::union( array( self::union( self::rows_of( $this->api, $objects ), $tables ? $tables : null ), self::present( $this->api, $inserted ) ) );
				$checks  = $this->restore_checks( $before, $current );
				if ( is_wp_error( $checks ) ) {
					return $checks;
				}
				if ( ! self::list_consent_ok( $before, $current ) ) {
					return self::list_opted_out();
				}
				if ( $before_restore ) {
					$pre = $before_restore( $before, $current );
					if ( is_wp_error( $pre ) ) {
						return $pre;
					}
				}
				if ( ! $this->api->restore_rows( $before, $current ) ) {
					return new WP_Error( 'rollback_failed', __( 'MailPoet\'s earlier rows could not be written back.', 'emcp-tools' ) );
				}
				if ( self::present( $this->api, $inserted ) ) {
					return new WP_Error( 'rollback_failed', __( 'Rows the write added are still there.', 'emcp-tools' ) );
				}
				return true;
			}
		);
	}

	/**
	 * A restore never changes a list membership that says unsubscribed now (D14): it neither writes
	 * it back as subscribed nor deletes it because the before-image has no such membership (the
	 * record of the person's choice, final review), force included.
	 */
	protected static function list_consent_ok( array $before, array $current ): bool {
		$was = array();
		foreach ( (array) ( $before['mailpoet_subscriber_segment'] ?? array() ) as $m ) {
			$was[ (int) $m['subscriber_id'] . ':' . (int) $m['segment_id'] ] = (string) $m['status'];
		}
		foreach ( (array) ( $current['mailpoet_subscriber_segment'] ?? array() ) as $m ) {
			if ( 'unsubscribed' === (string) $m['status'] && 'unsubscribed' !== ( $was[ (int) $m['subscriber_id'] . ':' . (int) $m['segment_id'] ] ?? null ) ) {
				return false;
			}
		}
		return true;
	}

	protected static function list_opted_out(): WP_Error {
		return new WP_Error( 'subscriber_opted_out', __( 'A subscriber in this change has unsubscribed from one of its lists since, so it is not undone: undo never puts a subscriber back on a list they left (force does not change this).', 'emcp-tools' ), array( 'status' => 409 ) );
	}

	/**
	 * The live constraints a direct restore bypasses (D14): the lists, tags, custom fields and
	 * subscribers restored rows name still exist, and a restored email is not another subscriber's.
	 *
	 * @return true|WP_Error
	 */
	protected function restore_checks( array $before, array $current ) {
		$gone  = array();
		$exist = function ( string $table, int $id, string $label ) use ( $before, &$gone ) {
			if ( $id > 0 && ! isset( $before[ $table ][ $id ] ) ) {
				$row = $this->api->row( $table, $id );
				if ( ! $row || ( array_key_exists( 'deleted_at', $row ) && null !== $row['deleted_at'] ) ) {
					$gone[] = $label . ':' . $id;
				}
			}
		};
		foreach ( (array) ( $before['mailpoet_subscriber_segment'] ?? array() ) as $m ) {
			$exist( 'mailpoet_subscribers', (int) $m['subscriber_id'], 'subscriber' );
			$exist( 'mailpoet_segments', (int) $m['segment_id'], 'list' );
		}
		foreach ( (array) ( $before['mailpoet_subscriber_tag'] ?? array() ) as $m ) {
			$exist( 'mailpoet_subscribers', (int) $m['subscriber_id'], 'subscriber' );
			$exist( 'mailpoet_tags', (int) $m['tag_id'], 'tag' );
		}
		foreach ( (array) ( $before['mailpoet_subscriber_custom_field'] ?? array() ) as $m ) {
			$exist( 'mailpoet_subscribers', (int) $m['subscriber_id'], 'subscriber' );
			$exist( 'mailpoet_custom_fields', (int) $m['custom_field_id'], 'custom_field' );
		}
		foreach ( (array) ( $before['mailpoet_newsletter_segment'] ?? array() ) as $m ) {
			$exist( 'mailpoet_newsletters', (int) $m['newsletter_id'], 'newsletter' );
			$exist( 'mailpoet_segments', (int) $m['segment_id'], 'list' );
		}
		if ( $gone ) {
			return new WP_Error( 'linked_unavailable', __( 'A list, tag, custom field, newsletter or subscriber the earlier rows point at is gone; it is not undone.', 'emcp-tools' ), array( 'status' => 409, 'missing' => array_values( array_unique( $gone ) ) ) );
		}
		foreach ( (array) ( $before['mailpoet_subscribers'] ?? array() ) as $id => $s ) {
			$other = $this->api->subscriber_by_email( (string) $s['email'] );
			if ( null !== $other && (int) $other !== (int) $id && ! isset( $current['mailpoet_subscribers'][ $other ] ) ) {
				return new WP_Error( 'email_exists', __( 'Another MailPoet subscriber has taken this email since; it is not undone.', 'emcp-tools' ), array( 'status' => 409 ) );
			}
		}
		return true;
	}
}
