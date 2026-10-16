<?php
/**
 * Every FluentCRM write (spec 4.4): leases in one fixed order (D12), before-images of every row the
 * write can touch, FluentCRM's call while this process's statements are recorded (D9) and its
 * automations held unless asked (D7), the transaction level reset, the read-back, the email and
 * automation report (D8), reconciliation after a failure, recovery, and History. Undo (D13) takes
 * the write's leases, rechecks the after-version, the blockers and the live constraints inside
 * them, and puts the rows back in one transaction without calling FluentCRM.
 *
 * An object is [kind, id]: contact, tag, list, note, campaign, template, automation, enrolment,
 * custom_fields (id 0).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_FluentCRM_Writer {

	const TTL = 60;

	/** Lease order (D12). */
	const ORDER = array( 'custom_fields', 'tag', 'list', 'template', 'campaign', 'automation', 'contact' );

	/** Error codes after which FluentCRM may have committed (its ability wrapper turns a throw into failed, D9). */
	const MAYBE_COMMITTED = array( 'failed', 'fluentcrm_error', 'capture_throw' );

	/** @var EMCP_Tools_Lease|null */
	private static $lease = null;

	/** @var callable|null Test seam: runs once every lease is held. */
	public static $on_lease = null;

	/** @var callable|null Test seam: runs as an undo starts, before it takes its leases (D13). */
	public static $before_undo = null;

	/** @var EMCP_Tools_FluentCRM_Api */
	protected $api;

	/** @var bool Undo mode: no History record of its own. */
	protected $undo;

	/** @var array The objects of the transact() in progress. */
	protected $objects = array();

	public function __construct( EMCP_Tools_FluentCRM_Api $api, bool $undo = false ) {
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
		return 'custom_fields' === $kind ? 'fluentcrm-custom-fields' : 'fluentcrm-' . $kind . '-' . $id;
	}

	/** The lease two parallel creates of the same person share (Review Focus 2). */
	public static function new_contact_key( string $email ): string {
		return 'fluentcrm-new-contact-' . md5( strtolower( trim( $email ) ) );
	}

	/**
	 * Kinds in ORDER, ids ascending, then the new-contact keys of 'new' (emails).
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
			$new[ self::new_contact_key( (string) $email ) ] = true;
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
		$owner = 'fluentcrm-' . bin2hex( random_bytes( 6 ) );
		$held  = array();
		foreach ( $keys as $key ) {
			if ( ! self::lease()->acquire( $key, $owner, self::TTL ) ) {
				foreach ( array_reverse( $held ) as $h ) {
					self::lease()->release( $h, $owner );
				}
				return new WP_Error( 'fluentcrm_busy', __( 'Another change to this FluentCRM object, or to one it is linked to, is running. Try again in a moment.', 'emcp-tools' ), array( 'status' => 409, 'lease' => $key ) );
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

	/** Capture's table name (fc_ dropped) to the rows' table name. */
	public static function real_table( string $captured ): string {
		return in_array( $captured, EMCP_Tools_FluentCRM_Api::SCOPE['tables'], true ) ? $captured : 'fc_' . $captured;
	}

	/** @return array<string,array> "kind:id" => rows */
	public static function rows_of( EMCP_Tools_FluentCRM_Api $api, array $objects ): array {
		$out = array();
		foreach ( $objects as $o ) {
			if ( (int) $o[1] > 0 || 'custom_fields' === (string) $o[0] ) {
				$out[ self::ref_key( (string) $o[0], (int) $o[1] ) ] = $api->rows( (string) $o[0], (int) $o[1] );
			}
		}
		return $out;
	}

	/** The rows of an inserted-ids map (capture names) that still exist. @return array<string,array<int,array>> */
	public static function present( EMCP_Tools_FluentCRM_Api $api, array $inserted ): array {
		$out = array();
		foreach ( $inserted as $table => $ids ) {
			$real = self::real_table( (string) $table );
			$rows = $api->find( $real, array( EMCP_Tools_FluentCRM_Api::pk( $real ) => array_map( 'intval', (array) $ids ) ) );
			if ( $rows ) {
				$out[ $real ] = $rows;
			}
		}
		return $out;
	}

	/** The state History compares: every object's rows, and the inserted rows still there. */
	public static function state_hash( EMCP_Tools_FluentCRM_Api $api, array $objects, array $inserted = array() ): string {
		return EMCP_Tools_FluentCRM_Api::version(
			array(
				'objects'  => self::rows_of( $api, $objects ),
				'inserted' => self::present( $api, $inserted ),
			)
		);
	}

	/** Every row of several objects' row maps, table => id => row; synthetic # keys dropped. */
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
			foreach ( $rows as $id => $r ) {
				switch ( $table ) {
					case 'fc_subscribers':
						$out['contact'][] = (int) $id;
						break;
					case 'fc_subscriber_pivot':
						$out['contact'][] = (int) $r['subscriber_id'];
						if ( EMCP_Tools_FluentCRM_Api::TAG === $r['object_type'] ) {
							$out['tag'][] = (int) $r['object_id'];
						} elseif ( EMCP_Tools_FluentCRM_Api::LISTS === $r['object_type'] ) {
							$out['list'][] = (int) $r['object_id'];
						}
						break;
					case 'fc_subscriber_meta':
					case 'fc_subscriber_notes':
						$out['contact'][] = (int) $r['subscriber_id'];
						break;
					case 'fc_tags':
						$out['tag'][] = (int) $id;
						break;
					case 'fc_lists':
						$out['list'][] = (int) $id;
						break;
					case 'fc_campaigns':
						$out['campaign'][] = (int) $id;
						break;
					case 'fc_funnels':
						$out['automation'][] = (int) $id;
						break;
					case 'posts':
						$out['template'][] = (int) $id;
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

	/** What the write may change on WordPress tables (D9, D15): its templates and linked users. */
	protected function leased( array $objects, array $befores ): array {
		$out = array( 'template_ids' => array(), 'user_ids' => array(), 'meta_ids' => array(), 'umeta_ids' => array() );
		foreach ( $objects as $o ) {
			if ( 'template' === (string) $o[0] && (int) $o[1] > 0 ) {
				$out['template_ids'][] = (int) $o[1];
			}
		}
		foreach ( self::union( $befores ) as $table => $rows ) {
			foreach ( $rows as $id => $r ) {
				if ( 'fc_subscribers' === $table && (int) ( $r['user_id'] ?? 0 ) > 0 ) {
					$out['user_ids'][] = (int) $r['user_id'];
				} elseif ( 'postmeta' === $table ) {
					$out['meta_ids'][] = (int) $id;
				} elseif ( 'usermeta' === $table ) {
					$out['umeta_ids'][] = (int) $id;
				}
			}
		}
		return $out;
	}

	// The write template (D7, D9).

	/**
	 * @param array           $objects         [kind, id] pairs the write may change (id 0 for the one it creates).
	 * @param callable        $do              Runs FluentCRM; returns ['id' => int, ...] or a WP_Error.
	 * @param callable        $verify          ( int $id ) => string[] fields that differ, or a WP_Error.
	 * @param callable        $record          ( array $result, array $befores, array $captured, array $report ) => change id.
	 * @param bool            $run_automations False holds FluentCRM's automations for the call (D7).
	 * @param string|callable $primary         The captured table whose first insert is a create's object, or ( array $captured ) => its id.
	 * @return array|WP_Error {result, change, emails, automations, captured, warning?}
	 */
	public function transact( array $objects, callable $do, callable $verify, callable $record, bool $run_automations, $primary = '' ) {
		$this->objects = $objects;
		$befores       = self::rows_of( $this->api, $objects );
		$mark          = $this->api->mail_mark();
		$run           = $run_automations ? $do : fn() => $this->api->hold_automations( $do );
		$cap           = $this->api->capture( $run );
		$this->api->level_reset();
		$report = array(
			'emails'      => $this->api->email_report( $mark, $cap ),
			'automations' => $this->api->automations_entered( $cap ),
		);
		if ( $cap['error'] ) {
			return $this->reconcile( $befores, $cap, $verify, $record, $primary, $report );
		}
		$result = (array) $cap['result'];
		if ( empty( $result['id'] ) ) {
			$result['id'] = $this->primary_id( $cap, $primary );
		}
		$attributed = $this->api->wp_rows_attributed( $cap, $this->leased( $objects, $befores ) );
		if ( is_wp_error( $attributed ) ) {
			return $this->uncertain( $cap, $attributed->get_error_data()['tables'] ?? array(), $attributed->get_error_message(), $report );
		}
		$bad = $verify( (int) ( $result['id'] ?? 0 ) );
		if ( is_wp_error( $bad ) ) {
			return $this->fail( $bad->get_error_code(), $bad->get_error_message(), $befores, $cap, (array) $bad->get_error_data() + $report );
		}
		if ( $bad ) {
			return $this->fail( 'save_incomplete', __( 'FluentCRM did not store the change as written; it was put back.', 'emcp-tools' ), $befores, $cap, array( 'fields' => array_values( $bad ) ) + $report );
		}
		if ( $this->undo ) {
			return array( 'result' => $result, 'change' => '', 'captured' => $cap ) + $report;
		}
		$change = (string) $record( $result, $befores, $cap, $report );
		if ( '' === $change ) {
			return $this->fail( 'history_unavailable', __( 'History could not record this change, so it was put back.', 'emcp-tools' ), $befores, $cap, $report );
		}
		return array( 'result' => $result, 'change' => $change, 'captured' => $cap ) + $report;
	}

	protected function primary_id( array $cap, $primary ): int {
		if ( is_callable( $primary ) ) {
			return (int) $primary( $cap );
		}
		if ( '' !== $primary && ! empty( $cap['inserted'][ $primary ] ) ) {
			return (int) $cap['inserted'][ $primary ][0];
		}
		return isset( $this->objects[0][1] ) ? (int) $this->objects[0][1] : 0;
	}

	/** @return WP_Error nothing touched, a non-undoable entry left (D9). */
	protected function uncertain( array $cap, array $tables, string $cause, array $report ): WP_Error {
		$tables = array_values( array_unique( array_merge( $tables, (array) $cap['uncertain'] ) ) );
		$change = $this->undo ? '' : EMCP_Tools_FluentCRM_History::record_uncertain( $tables, $cause, self::contacts_in( $this->objects ) );
		return new WP_Error( 'fluentcrm_error', __( 'FluentCRM stopped half way and EMCP could not tell which rows it wrote, so it changed nothing. Check the tables named here in FluentCRM.', 'emcp-tools' ), array( 'attribution_uncertain' => true, 'tables' => $tables, 'change_id' => $change, 'cause' => $cause ) + $report );
	}

	/** @return int[] contact ids among the objects. */
	public static function contacts_in( array $objects ): array {
		$out = array();
		foreach ( $objects as $o ) {
			if ( 'contact' === (string) $o[0] && (int) $o[1] > 0 ) {
				$out[] = (int) $o[1];
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * D9 after an error: only rows this process wrote during the call are its.
	 *
	 * @return array|WP_Error
	 */
	protected function reconcile( array $befores, array $cap, callable $verify, callable $record, $primary, array $report ) {
		$error = $cap['error'];
		if ( $cap['uncertain'] ) {
			return $this->uncertain( $cap, array(), $error->get_error_message(), $report );
		}
		$attributed = $this->api->wp_rows_attributed( $cap, $this->leased( $this->objects, $befores ) );
		if ( is_wp_error( $attributed ) ) {
			return $this->uncertain( $cap, $attributed->get_error_data()['tables'] ?? array(), $error->get_error_message(), $report );
		}
		$code = 'capture_throw' === $error->get_error_code() ? 'fluentcrm_error' : $error->get_error_code();
		if ( ! $cap['inserted'] && ! $cap['updated'] && ! $cap['deleted'] ) {
			return new WP_Error( $code, $error->get_error_message(), array_merge( (array) $error->get_error_data(), $report ) );
		}
		$id  = $this->primary_id( $cap, $primary );
		$bad = $id > 0 ? $verify( $id ) : array( 'unknown' );
		if ( ! is_wp_error( $bad ) && ! $bad && ! $this->undo && in_array( $error->get_error_code(), self::MAYBE_COMMITTED, true ) ) {
			$change = (string) $record( array( 'id' => $id ), $befores, $cap, $report );
			if ( '' !== $change ) {
				return array( 'result' => array( 'id' => $id ), 'change' => $change, 'captured' => $cap, 'warning' => array( 'code' => 'fluentcrm_after_save_error', 'message' => $error->get_error_message() ) ) + $report;
			}
		}
		$left = $this->recover( $befores, $cap );
		if ( ! $left ) {
			return new WP_Error( $code, $error->get_error_message(), array_merge( (array) $error->get_error_data(), array( 'recovered' => true ), $report ) );
		}
		return $this->partial( $befores, $cap, $left, $code, $report );
	}

	/**
	 * Puts back the rows the call updated or deleted (from the before-images) and deletes the rows
	 * it inserted; nothing else.
	 *
	 * @return string[] "table:id" still different
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
			foreach ( $rows as $id => $row ) {
				if ( $this->api->row( $table, (int) $id ) != $row ) {
					$left[] = $table . ':' . $id;
				}
			}
		}
		foreach ( self::present( $this->api, (array) $cap['inserted'] ) as $table => $rows ) {
			foreach ( array_keys( $rows ) as $id ) {
				if ( ! isset( $before[ $table ][ $id ] ) ) {
					$left[] = $table . ':' . $id;
				}
			}
		}
		return $left;
	}

	protected function fail( string $code, string $message, array $befores, array $cap, array $data ): WP_Error {
		$left = $this->recover( $befores, $cap );
		if ( ! $left ) {
			return new WP_Error( $code, $message, $data + array( 'restored' => true, 'status' => 409 ) );
		}
		return $this->partial( $befores, $cap, $left, $code, $data );
	}

	protected function partial( array $befores, array $cap, array $left, string $cause, array $data ): WP_Error {
		$change = $this->undo ? '' : EMCP_Tools_FluentCRM_History::record_recovery( $this->objects, $befores, $cap, $left );
		return new WP_Error( 'partial_write', __( 'FluentCRM stopped half way and EMCP could not put everything back. History holds the earlier rows; undo the entry there once the cause is fixed.', 'emcp-tools' ), array( 'rows' => $left, 'change_id' => $change, 'cause' => $cause, 'status' => 500 ) + $data );
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

	// Contacts (D7, D8, D10, D15).

	const CORE      = array( 'first_name', 'last_name', 'prefix', 'phone', 'status', 'contact_type', 'date_of_birth', 'timezone', 'source' );
	const CLEARABLE = array( 'first_name', 'last_name', 'prefix', 'phone', 'date_of_birth', 'timezone' );
	const ADDRESS   = array( 'line_1' => 'address_line_1', 'line_2' => 'address_line_2', 'city' => 'city', 'state' => 'state', 'postal_code' => 'postal_code', 'country' => 'country' );
	const CHOICE    = array( 'single-select', 'multi-select', 'radio', 'checkbox' );
	const SUPPRESSED = array( 'unsubscribed', 'bounced', 'complained', 'spammed' );

	protected static function invalid( string $message, array $data = array() ): WP_Error {
		return new WP_Error( 'invalid_argument', $message, $data );
	}

	/** References to ids, or unknown_segment before anything is written (Review Focus 1). @return int[]|WP_Error */
	protected function segments( array $refs, string $kind ) {
		if ( ! $refs ) {
			return array();
		}
		$r = $this->api->resolve_refs( $kind, array_values( $refs ) );
		if ( $r['unknown'] ) {
			/* translators: 1: tags or lists, 2: references. */
			return new WP_Error( 'unknown_segment', sprintf( __( 'These %1$s do not exist: %2$s. Pass ids as numbers and titles or slugs as strings; nothing was written.', 'emcp-tools' ), 'tag' === $kind ? __( 'tags', 'emcp-tools' ) : __( 'lists', 'emcp-tools' ), implode( ', ', array_map( 'strval', $r['unknown'] ) ) ), array( 'kind' => $kind, 'unknown' => $r['unknown'] ) );
		}
		return $r['ids'];
	}

	/**
	 * Custom field values checked against the stored list (Review Focus 4): choice values must be
	 * options, numbers numeric; '' , null and [] clear.
	 *
	 * @return array{0: array, 1: string[]}|WP_Error [values to set, slugs to clear]
	 */
	protected function custom_values( array $values ) {
		$fields = array();
		foreach ( $this->api->custom_field_list() as $f ) {
			$fields[ (string) $f['slug'] ] = $f;
		}
		$set   = array();
		$clear = array();
		foreach ( $values as $slug => $v ) {
			$slug = (string) $slug;
			if ( ! isset( $fields[ $slug ] ) ) {
				/* translators: %s: slug. */
				return self::invalid( sprintf( __( 'There is no custom field "%s". list-custom-fields gives the slugs.', 'emcp-tools' ), $slug ), array( 'allowed' => array_keys( $fields ) ) );
			}
			if ( '' === $v || null === $v || array() === $v ) {
				$clear[] = $slug;
				continue;
			}
			$type = (string) ( $fields[ $slug ]['type'] ?? 'text' );
			if ( in_array( $type, self::CHOICE, true ) ) {
				$many = in_array( $type, array( 'multi-select', 'checkbox' ), true );
				$vals = is_array( $v ) ? array_values( $v ) : array( $v );
				$opts = array_map( 'strval', (array) ( $fields[ $slug ]['options'] ?? array() ) );
				if ( ! $many && count( $vals ) > 1 ) {
					/* translators: %s: slug. */
					return self::invalid( sprintf( __( 'Custom field "%s" takes one option.', 'emcp-tools' ), $slug ) );
				}
				foreach ( $vals as $x ) {
					if ( ! is_scalar( $x ) || ! in_array( (string) $x, $opts, true ) ) {
						/* translators: 1: value, 2: slug. */
						return self::invalid( sprintf( __( '"%1$s" is not an option of custom field "%2$s".', 'emcp-tools' ), is_scalar( $x ) ? (string) $x : '?', $slug ), array( 'options' => $opts ) );
					}
				}
				$set[ $slug ] = $many ? array_map( 'strval', $vals ) : (string) $vals[0];
			} elseif ( 'number' === $type ) {
				if ( ! is_numeric( $v ) ) {
					/* translators: %s: slug. */
					return self::invalid( sprintf( __( 'Custom field "%s" takes a number.', 'emcp-tools' ), $slug ) );
				}
				$set[ $slug ] = $v;
			} else {
				if ( ! is_scalar( $v ) ) {
					/* translators: %s: slug. */
					return self::invalid( sprintf( __( 'Custom field "%s" takes text.', 'emcp-tools' ), $slug ) );
				}
				$set[ $slug ] = (string) $v;
			}
		}
		return array( $set, $clear );
	}

	/** Text compared as text: entities decoded, tags dropped, spaces collapsed. */
	public static function text( $v ): string {
		$s = html_entity_decode( (string) $v, ENT_QUOTES, 'UTF-8' );
		return trim( (string) preg_replace( '/\s+/u', ' ', strip_tags( $s ) ) );
	}

	protected static function same( $want, $have ): bool {
		if ( is_array( $want ) || is_array( $have ) ) {
			$a = array_map( 'strval', (array) ( is_array( $want ) ? $want : maybe_unserialize( (string) $want ) ) );
			$b = array_map( 'strval', (array) ( is_array( $have ) ? $have : maybe_unserialize( (string) $have ) ) );
			sort( $a );
			sort( $b );
			return $a === $b;
		}
		if ( is_numeric( $want ) && is_numeric( $have ) ) {
			return (float) $want === (float) $have;
		}
		return self::text( $want ) === self::text( $have );
	}

	/** The fields the stored contact does not match. @return string[] */
	protected function contact_mismatches( int $id, array $want ): array {
		$rows = $this->api->rows( 'contact', $id );
		$s    = current( $rows['fc_subscribers'] );
		if ( ! $s ) {
			return array( 'contact' );
		}
		$bad = array();
		foreach ( (array) ( $want['cols'] ?? array() ) as $col => $v ) {
			if ( 'email' === $col ? strtolower( trim( (string) $s['email'] ) ) !== strtolower( trim( (string) $v ) ) : ! self::same( $v, $s[ $col ] ?? '' ) ) {
				$bad[] = $col;
			}
		}
		foreach ( (array) ( $want['cleared'] ?? array() ) as $col ) {
			if ( '' !== (string) ( $s[ $col ] ?? '' ) ) {
				$bad[] = $col;
			}
		}
		$meta = array();
		foreach ( $rows['fc_subscriber_meta'] as $m ) {
			$meta[ (string) $m['key'] ] = $m['value'];
		}
		foreach ( (array) ( $want['custom'] ?? array() ) as $slug => $v ) {
			if ( ! isset( $meta[ $slug ] ) || ! self::same( $v, $meta[ $slug ] ) ) {
				$bad[] = 'custom_fields.' . $slug;
			}
		}
		foreach ( (array) ( $want['custom_cleared'] ?? array() ) as $slug ) {
			if ( isset( $meta[ $slug ] ) && '' !== (string) $meta[ $slug ] ) {
				$bad[] = 'custom_fields.' . $slug;
			}
		}
		$have = array( 'tag' => array(), 'list' => array() );
		foreach ( $rows['fc_subscriber_pivot'] as $p ) {
			if ( EMCP_Tools_FluentCRM_Api::TAG === $p['object_type'] ) {
				$have['tag'][] = (int) $p['object_id'];
			} elseif ( EMCP_Tools_FluentCRM_Api::LISTS === $p['object_type'] ) {
				$have['list'][] = (int) $p['object_id'];
			}
		}
		foreach ( array( 'tag', 'list' ) as $kind ) {
			if ( array_diff( (array) ( $want[ 'add_' . $kind ] ?? array() ), $have[ $kind ] ) || array_intersect( (array) ( $want[ 'remove_' . $kind ] ?? array() ), $have[ $kind ] ) ) {
				$bad[] = $kind . 's';
			}
		}
		return $bad;
	}

	/** Fields the request names, split into what FluentCRM sets and what EMCP clears (D10). */
	protected static function contact_fields( array $a, bool $create ): array {
		$set   = array();
		$clear = array();
		foreach ( self::CORE as $f ) {
			if ( ! array_key_exists( $f, $a ) ) {
				continue;
			}
			if ( '' === $a[ $f ] || null === $a[ $f ] ) {
				if ( ! $create && in_array( $f, self::CLEARABLE, true ) ) {
					$clear[] = $f;
				}
				continue;
			}
			$set[ $f ] = $a[ $f ];
		}
		$address = array();
		foreach ( (array) ( $a['address'] ?? array() ) as $k => $v ) {
			if ( ! isset( self::ADDRESS[ $k ] ) ) {
				continue;
			}
			if ( '' === $v || null === $v ) {
				if ( ! $create ) {
					$clear[] = self::ADDRESS[ $k ];
				}
				continue;
			}
			$address[ $k ] = (string) $v;
		}
		return array( $set, $address, $clear );
	}

	protected function contact_answer( int $id, array $t ): array {
		$out = array(
			'contact_id'  => $id,
			'version'     => $this->api->version_of( 'contact', $id ),
			'emails'      => $t['emails'],
			'automations' => $t['automations'],
			'change_id'   => (string) $t['change'],
		);
		if ( isset( $t['warning'] ) ) {
			$out['warning'] = $t['warning'];
		}
		return $out;
	}

	/** @return array|WP_Error */
	public function create_contact( array $a ) {
		$email = trim( (string) ( $a['email'] ?? '' ) );
		if ( ! is_email( $email ) ) {
			return self::invalid( __( 'email must be a valid email address.', 'emcp-tools' ) );
		}
		$tags = $this->segments( (array) ( $a['tags'] ?? array() ), 'tag' );
		if ( is_wp_error( $tags ) ) {
			return $tags;
		}
		$lists = $this->segments( (array) ( $a['lists'] ?? array() ), 'list' );
		if ( is_wp_error( $lists ) ) {
			return $lists;
		}
		$custom = $this->custom_values( (array) ( $a['custom_fields'] ?? array() ) );
		if ( is_wp_error( $custom ) ) {
			return $custom;
		}
		list( $set, $address ) = self::contact_fields( $a, true );
		$exists                = static function ( EMCP_Tools_FluentCRM_Api $api, string $email ) {
			$id = $api->contact_by_email( $email );
			return $id ? new WP_Error( 'contact_exists', __( 'A contact with this email already exists (case and spaces do not matter); update it instead.', 'emcp-tools' ), array( 'status' => 409, 'contact_id' => $id ) ) : null;
		};
		$e = $exists( $this->api, $email );
		if ( $e ) {
			return $e;
		}
		$keys = self::lock_order( array( 'tag' => $tags, 'list' => $lists, 'new' => array( $email ) ) );
		return $this->locked(
			$keys,
			function () use ( $a, $email, $tags, $lists, $custom, $set, $address, $exists ) {
				$e = $exists( $this->api, $email );
				if ( $e ) {
					return $e;
				}
				$payload = array( 'email' => $email, 'if_exists' => 'error' ) + $set;
				if ( $address ) {
					$payload['address'] = $address;
				}
				if ( $custom[0] ) {
					$payload['custom_fields'] = $custom[0];
				}
				if ( $tags ) {
					$payload['add_tags'] = $tags;
				}
				if ( $lists ) {
					$payload['add_lists'] = $lists;
				}
				if ( ! empty( $a['double_optin'] ) ) {
					$payload['double_optin'] = true;
				}
				$want = array( 'cols' => $set + array( 'email' => $email ), 'custom' => $custom[0], 'add_tag' => $tags, 'add_list' => $lists );
				$t    = $this->transact(
					array( array( 'contact', 0 ) ),
					function () use ( $payload ) {
						$r = $this->api->ability( 'upsert-contact', $payload );
						return is_wp_error( $r ) ? $r : array( 'id' => (int) ( $r['contact']['id'] ?? 0 ) );
					},
					fn( int $id ) => $this->contact_mismatches( $id, $want ),
					function ( array $result, array $befores, array $cap, array $report ) {
						$id = (int) $result['id'];
						return EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-contact', 'created', 'create-contact', $id, array( array( 'contact', $id ) ), $befores, $cap, array( $id ), $report, array( 'author' => get_current_user_id() ) );
					},
					! empty( $a['run_automations'] ),
					'subscribers'
				);
				return is_wp_error( $t ) ? $t : $this->contact_answer( (int) $t['result']['id'], $t );
			}
		);
	}

	/** @return array|WP_Error */
	public function update_contact( int $id, ?string $version, bool $force, array $a ) {
		$row = $this->api->row( 'fc_subscribers', $id );
		if ( ! $row ) {
			/* translators: %d: contact id. */
			return new WP_Error( 'not_found', sprintf( __( 'There is no FluentCRM contact %d.', 'emcp-tools' ), $id ), array( 'status' => 404 ) );
		}
		$new_email = array_key_exists( 'new_email', $a ) ? trim( (string) $a['new_email'] ) : '';
		if ( '' !== $new_email && ! is_email( $new_email ) ) {
			return self::invalid( __( 'new_email must be a valid email address.', 'emcp-tools' ) );
		}
		$seg = array();
		foreach ( array( 'add_tags' => 'tag', 'remove_tags' => 'tag', 'add_lists' => 'list', 'remove_lists' => 'list' ) as $key => $kind ) {
			$seg[ $key ] = $this->segments( (array) ( $a[ $key ] ?? array() ), $kind );
			if ( is_wp_error( $seg[ $key ] ) ) {
				return $seg[ $key ];
			}
		}
		$custom = $this->custom_values( (array) ( $a['custom_fields'] ?? array() ) );
		if ( is_wp_error( $custom ) ) {
			return $custom;
		}
		list( $set, $address, $clear ) = self::contact_fields( $a, false );
		$taken                         = function () use ( $new_email, $id ) {
			if ( '' === $new_email ) {
				return null;
			}
			$other = $this->api->contact_by_email( $new_email );
			return $other && $other !== $id ? new WP_Error( 'email_exists', __( 'Another FluentCRM contact already uses that email (case and spaces do not matter).', 'emcp-tools' ), array( 'status' => 409, 'contact_id' => $other ) ) : null;
		};
		$e = $taken();
		if ( $e ) {
			return $e;
		}
		$keys = self::lock_order(
			array(
				'tag'     => array_merge( $seg['add_tags'], $seg['remove_tags'] ),
				'list'    => array_merge( $seg['add_lists'], $seg['remove_lists'] ),
				'contact' => array( $id ),
				'new'     => '' !== $new_email ? array( $new_email ) : array(),
			)
		);
		return $this->locked(
			$keys,
			function () use ( $id, $version, $force, $a, $new_email, $seg, $custom, $set, $address, $clear, $taken ) {
				$ok = self::version_check( $this->api->version_of( 'contact', $id ), $version, $force, 'get-contact' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$e = $taken();
				if ( $e ) {
					return $e;
				}
				$row   = (array) $this->api->row( 'fc_subscribers', $id );
				$after = array( 'email' => '' !== $new_email ? $new_email : (string) $row['email'] );
				foreach ( array( 'first_name', 'last_name' ) as $k ) {
					$after[ $k ] = in_array( $k, $clear, true ) ? '' : (string) ( $set[ $k ] ?? $row[ $k ] ?? '' );
				}
				$sync = $this->sync_refusal( $id, $after );
				if ( $sync ) {
					return $sync;
				}
				$payload = array( 'contact_id' => $id ) + $set;
				if ( $address ) {
					$payload['address'] = $address;
				}
				if ( '' !== $new_email ) {
					$payload['new_email'] = $new_email;
				}
				if ( $custom[0] ) {
					$payload['custom_fields'] = $custom[0];
				}
				foreach ( $seg as $key => $ids ) {
					if ( $ids ) {
						$payload[ $key ] = $ids;
					}
				}
				if ( ! empty( $a['status_change_reason'] ) ) {
					$payload['status_change_reason'] = (string) $a['status_change_reason'];
				}
				$want = array(
					'cols'           => $set + ( '' !== $new_email ? array( 'email' => $new_email ) : array() ),
					'cleared'        => $clear,
					'custom'         => $custom[0],
					'custom_cleared' => $custom[1],
					'add_tag'        => $seg['add_tags'],
					'remove_tag'     => $seg['remove_tags'],
					'add_list'       => $seg['add_lists'],
					'remove_list'    => $seg['remove_lists'],
				);
				foreach ( $address as $k => $v ) {
					$want['cols'][ self::ADDRESS[ $k ] ] = $v;
				}
				$t = $this->transact(
					array( array( 'contact', $id ) ),
					function () use ( $payload, $id, $clear, $custom ) {
						if ( count( $payload ) > 1 ) {
							$r = $this->api->ability( 'upsert-contact', $payload );
							if ( is_wp_error( $r ) ) {
								return $r;
							}
						}
						if ( $clear || $custom[1] ) {
							$c = $this->api->clear_fields( $id, $clear, $custom[1] );
							if ( is_wp_error( $c ) ) {
								return $c;
							}
						}
						return array( 'id' => $id );
					},
					fn( int $cid ) => $this->contact_mismatches( $cid, $want ),
					function ( array $result, array $befores, array $cap, array $report ) use ( $id ) {
						return EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-contact', 'edit', 'update-contact', $id, array( array( 'contact', $id ) ), $befores, $cap, array( $id ), $report, array( 'after_status' => (string) ( $this->api->row( 'fc_subscribers', $id )['status'] ?? '' ) ) );
					},
					! empty( $a['run_automations'] )
				);
				return is_wp_error( $t ) ? $t : $this->contact_answer( $id, $t );
			}
		);
	}

	/** D15: what FluentCRM's save callback would do to the linked WordPress user, refused when unsafe. */
	protected function sync_refusal( int $id, array $after ): ?WP_Error {
		$e = $this->api->sync_effect( $id, $after );
		if ( ! $e['user_id'] ) {
			return null;
		}
		if ( $e['relink'] ) {
			return new WP_Error( 'would_relink_user', __( 'With FluentCRM\'s user sync on, that email belongs to another WordPress user: FluentCRM would link the contact to them and rename them. Nothing was written.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		if ( $e['email_sync'] ) {
			return new WP_Error( 'wp_user_email_sync', __( 'FluentCRM is set to copy a contact\'s email to its WordPress user, so this save would change a login email. EMCP never changes those; nothing was written.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		if ( $e['admin'] && $e['names_change'] ) {
			return new WP_Error( 'linked_admin_user', __( 'This contact is linked to an administrator and FluentCRM\'s user sync would rename them on this save. Nothing was written.', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		return null;
	}

	// Batches (D12, Review Focus 5).

	const BATCH_CAP   = 200;
	const SEGMENT_CAP = 500;

	protected static function too_many( int $count, int $cap ): WP_Error {
		/* translators: 1: count, 2: cap. */
		return new WP_Error( 'too_many_contacts', sprintf( __( 'This would touch %1$d contacts; one call takes up to %2$d. Nothing was written; split it.', 'emcp-tools' ), $count, $cap ), array( 'status' => 413, 'count' => $count, 'cap' => $cap ) );
	}

	/** Each contact's version, status and rows the batch leaves (per-row undo). */
	protected function batch_after( array $ids ): array {
		$out = array( 'row_hashes' => array(), 'after_status' => array() );
		foreach ( $ids as $id ) {
			$out['row_hashes'][ $id ]   = $this->api->version_of( 'contact', $id );
			$out['after_status'][ $id ] = (string) ( $this->api->row( 'fc_subscribers', $id )['status'] ?? '' );
		}
		return $out;
	}

	/** @return array|WP_Error */
	public function import_contacts( array $rows, string $if_exists, bool $create_missing, bool $run_automations ) {
		if ( count( $rows ) > self::BATCH_CAP ) {
			return self::too_many( count( $rows ), self::BATCH_CAP );
		}
		$payload  = array();
		$existing = array();
		$new      = array();
		$segs     = array( 'tag' => array(), 'list' => array() );
		foreach ( array_values( $rows ) as $i => $row ) {
			$email = is_array( $row ) ? trim( (string) ( $row['email'] ?? '' ) ) : '';
			if ( ! is_email( $email ) ) {
				/* translators: %d: row number. */
				return self::invalid( sprintf( __( 'Row %d has no valid email; nothing was written.', 'emcp-tools' ), $i + 1 ) );
			}
			// Rows are not checked against the operation's argument schema, so a misplaced key
			// (a nested `fields` object, a typo) would otherwise be dropped without a word.
			$unknown = array_diff( array_keys( $row ), array_merge( array( 'email', 'address', 'custom_fields', 'tags', 'lists' ), self::CORE ) );
			if ( $unknown ) {
				return self::invalid(
					/* translators: 1: row number, 2: keys, 3: allowed keys. */
					sprintf( __( 'Row %1$d has unknown keys: %2$s; nothing was written. Contact fields sit on the row itself (%3$s), with address, custom_fields, tags and lists beside them.', 'emcp-tools' ), $i + 1, implode( ', ', $unknown ), implode( ', ', self::CORE ) ),
					array( 'row' => $i + 1, 'unknown' => array_values( $unknown ) )
				);
			}
			$bad_address = array_diff( array_keys( (array) ( $row['address'] ?? array() ) ), array_keys( self::ADDRESS ) );
			if ( $bad_address ) {
				/* translators: 1: row number, 2: keys, 3: allowed keys. */
				return self::invalid( sprintf( __( 'Row %1$d has unknown address keys: %2$s; nothing was written. Address keys: %3$s.', 'emcp-tools' ), $i + 1, implode( ', ', $bad_address ), implode( ', ', array_keys( self::ADDRESS ) ) ) );
			}
			$out = array( 'email' => $email );
			list( $set, $address ) = self::contact_fields( $row, true );
			$out += $set;
			if ( $address ) {
				$out['address'] = $address;
			}
			if ( ! empty( $row['custom_fields'] ) ) {
				$c = $this->custom_values( (array) $row['custom_fields'] );
				if ( is_wp_error( $c ) ) {
					return $c;
				}
				$out['custom_fields'] = $c[0];
			}
			foreach ( array( 'tags' => 'tag', 'lists' => 'list' ) as $key => $kind ) {
				$refs = array_values( (array) ( $row[ $key ] ?? array() ) );
				if ( ! $refs ) {
					continue;
				}
				$r = $this->api->resolve_refs( $kind, $refs );
				foreach ( $r['unknown'] as $u ) {
					if ( ! $create_missing || is_int( $u ) ) {
						return $this->segments( array( $u ), $kind );
					}
				}
				$segs[ $kind ] = array_merge( $segs[ $kind ], $r['ids'] );
				$out[ $key ]   = array_merge( $r['ids'], array_values( array_filter( $r['unknown'], 'is_string' ) ) );
			}
			$id = $this->api->contact_by_email( $email );
			if ( $id ) {
				$existing[] = $id;
			} else {
				$new[] = $email;
			}
			$payload[] = $out;
		}
		$existing = array_values( array_unique( $existing ) );
		$keys     = self::lock_order( array( 'tag' => $segs['tag'], 'list' => $segs['list'], 'contact' => $existing, 'new' => $new ) );
		return $this->locked(
			$keys,
			function () use ( $payload, $existing, $if_exists, $create_missing, $run_automations ) {
				$answer  = array();
				$objects = array_map( static fn( $id ) => array( 'contact', $id ), $existing );
				$t       = $this->transact(
					$objects ? $objects : array( array( 'contact', 0 ) ),
					function () use ( $payload, $if_exists, $create_missing, &$answer ) {
						$r = $this->api->ability( 'bulk-upsert-contacts', array( 'contacts' => $payload, 'if_exists' => 'skip' === $if_exists ? 'skip' : 'merge', 'double_optin' => false, 'auto_create_tags' => $create_missing, 'auto_create_lists' => $create_missing ) );
						if ( is_wp_error( $r ) ) {
							return $r;
						}
						$answer = $r;
						return array( 'id' => 0 );
					},
					function () use ( &$answer, $payload ) {
						$bad = array();
						foreach ( array_merge( (array) ( $answer['created'] ?? array() ), (array) ( $answer['updated'] ?? array() ) ) as $c ) {
							if ( ! $this->api->row( 'fc_subscribers', (int) $c['id'] ) ) {
								$bad[] = 'contact ' . (int) $c['id'];
							}
						}
						return $bad;
					},
					function ( array $result, array $befores, array $cap, array $report ) use ( &$answer, $existing ) {
						$created = array_map( static fn( $c ) => (int) $c['id'], (array) ( $answer['created'] ?? array() ) );
						$all     = array_values( array_unique( array_merge( $existing, $created ) ) );
						return $this->record_batch( 'import-contacts', $all, $created, $befores, $cap, $report );
					},
					$run_automations,
					static fn() => 0
				);
				if ( is_wp_error( $t ) ) {
					return $t;
				}
				return array(
					'summary'     => (array) ( $answer['summary'] ?? array() ),
					'created'     => (array) ( $answer['created'] ?? array() ),
					'updated'     => (array) ( $answer['updated'] ?? array() ),
					'skipped'     => (array) ( $answer['skipped'] ?? array() ),
					'emails'      => $t['emails'],
					'automations' => $t['automations'],
					'change_id'   => (string) $t['change'],
				) + ( isset( $t['warning'] ) ? array( 'warning' => $t['warning'] ) : array() );
			}
		);
	}

	/** One History entry for a batch, undone per row (spec 4.2). */
	protected function record_batch( string $op, array $all, array $created, array $befores, array $cap, array $report ): string {
		$objects = array_map( static fn( $id ) => array( 'contact', (int) $id ), $all );
		return EMCP_Tools_FluentCRM_History::record_write(
			'fluentcrm-batch',
			'batch',
			$op,
			0,
			$objects,
			$befores,
			$cap,
			$all,
			$report,
			$this->batch_after( $all ) + array(
				'created_contacts' => array_values( $created ),
				'author'           => get_current_user_id(),
			)
		);
	}

	/** @return array|WP_Error */
	public function tag_contacts( array $a ) {
		$by_ids = array_key_exists( 'contact_ids', $a );
		$by_f   = array_key_exists( 'filter', $a );
		if ( $by_ids === $by_f ) {
			return self::invalid( __( 'Pass contact_ids or filter, not both.', 'emcp-tools' ) );
		}
		$seg = array();
		foreach ( array( 'add_tags' => 'tag', 'remove_tags' => 'tag', 'add_lists' => 'list', 'remove_lists' => 'list' ) as $key => $kind ) {
			$seg[ $key ] = $this->segments( (array) ( $a[ $key ] ?? array() ), $kind );
			if ( is_wp_error( $seg[ $key ] ) ) {
				return $seg[ $key ];
			}
		}
		if ( ! array_filter( $seg ) ) {
			return self::invalid( __( 'Pass at least one of add_tags, remove_tags, add_lists, remove_lists.', 'emcp-tools' ) );
		}
		$changes = array_filter( $seg );
		if ( $by_f ) {
			$dry = $this->api->ability( 'apply-segments-to-contacts', array( 'filter' => (array) $a['filter'], 'dry_run' => true ) + $changes );
			if ( is_wp_error( $dry ) ) {
				return $dry;
			}
			$count = (int) ( $dry['matched_contacts'] ?? 0 );
			if ( ! empty( $a['dry_run'] ) ) {
				return $dry;
			}
			if ( $count > self::BATCH_CAP ) {
				return self::too_many( $count, self::BATCH_CAP );
			}
			$ids = array();
			for ( $page = 1; $page <= 3; $page++ ) {
				$l = $this->api->ability( 'list-contacts', (array) $a['filter'] + array( 'per_page' => 100, 'page' => $page ) );
				if ( is_wp_error( $l ) ) {
					return $l;
				}
				foreach ( (array) ( $l['items'] ?? array() ) as $c ) {
					$ids[] = (int) $c['id'];
				}
				if ( count( (array) ( $l['items'] ?? array() ) ) < 100 ) {
					break;
				}
			}
		} else {
			$ids = array_values( array_unique( array_map( 'intval', (array) $a['contact_ids'] ) ) );
			if ( ! empty( $a['dry_run'] ) ) {
				return $this->api->ability( 'apply-segments-to-contacts', array( 'contact_ids' => $ids, 'dry_run' => true ) + $changes );
			}
		}
		$ids = array_values( array_unique( $ids ) );
		if ( count( $ids ) > self::BATCH_CAP ) {
			return self::too_many( count( $ids ), self::BATCH_CAP );
		}
		foreach ( $ids as $id ) {
			if ( ! $this->api->row( 'fc_subscribers', $id ) ) {
				/* translators: %d: contact id. */
				return new WP_Error( 'not_found', sprintf( __( 'There is no FluentCRM contact %d; nothing was written.', 'emcp-tools' ), $id ), array( 'status' => 404 ) );
			}
		}
		$keys = self::lock_order( array( 'tag' => array_merge( $seg['add_tags'], $seg['remove_tags'] ), 'list' => array_merge( $seg['add_lists'], $seg['remove_lists'] ), 'contact' => $ids ) );
		return $this->locked(
			$keys,
			function () use ( $ids, $changes, $seg, $a ) {
				$t = $this->transact(
					array_map( static fn( $id ) => array( 'contact', $id ), $ids ),
					function () use ( $ids, $changes ) {
						$r = $this->api->ability( 'apply-segments-to-contacts', array( 'contact_ids' => $ids ) + $changes );
						return is_wp_error( $r ) ? $r : array( 'id' => 0 );
					},
					function () use ( $ids, $seg ) {
						$bad = array();
						foreach ( $ids as $id ) {
							$bad = array_merge( $bad, $this->contact_mismatches( $id, array( 'add_tag' => $seg['add_tags'], 'remove_tag' => $seg['remove_tags'], 'add_list' => $seg['add_lists'], 'remove_list' => $seg['remove_lists'] ) ) );
						}
						return array_values( array_unique( $bad ) );
					},
					fn( array $result, array $befores, array $cap, array $report ) => $this->record_batch( 'tag-contacts', $ids, array(), $befores, $cap, $report ),
					! empty( $a['run_automations'] ),
					static fn() => 0
				);
				return is_wp_error( $t ) ? $t : array( 'contact_ids' => $ids, 'applied_to_contacts' => count( $ids ), 'emails' => $t['emails'], 'automations' => $t['automations'], 'change_id' => (string) $t['change'] );
			}
		);
	}

	// Tags and lists.

	protected static function segment_table( string $kind ): string {
		return 'tag' === $kind ? 'fc_tags' : 'fc_lists';
	}

	protected static function segment_type( string $kind ): string {
		return 'tag' === $kind ? EMCP_Tools_FluentCRM_Api::TAG : EMCP_Tools_FluentCRM_Api::LISTS;
	}

	/** @return int[] contacts attached to these tags or lists. */
	protected function members( string $kind, array $ids ): array {
		$out = array();
		foreach ( $this->api->find( 'fc_subscriber_pivot', array( 'object_type' => self::segment_type( $kind ), 'object_id' => array_map( 'intval', $ids ) ) ) as $p ) {
			$out[] = (int) $p['subscriber_id'];
		}
		$out = array_values( array_unique( $out ) );
		sort( $out );
		return $out;
	}

	protected function segment_answer( string $kind, int $id, array $t ): array {
		return array( $kind . '_id' => $id, 'version' => $this->api->version_of( $kind, $id ), 'change_id' => (string) $t['change'] ) + ( isset( $t['warning'] ) ? array( 'warning' => $t['warning'] ) : array() );
	}

	/** @return array|WP_Error */
	public function create_segment( string $kind, array $a ) {
		$title = trim( (string) ( $a['title'] ?? '' ) );
		if ( '' === $title ) {
			return self::invalid( __( 'title is required.', 'emcp-tools' ) );
		}
		$in = array( 'action' => 'create', 'title' => $title ) + array_intersect_key( $a, array_flip( array( 'slug', 'description' ) ) );
		$t  = $this->transact(
			array( array( $kind, 0 ) ),
			function () use ( $in, $kind ) {
				$r = $this->api->ability( 'manage-' . $kind, $in );
				return is_wp_error( $r ) ? $r : array( 'id' => (int) ( $r[ $kind ]['id'] ?? 0 ) );
			},
			fn( int $id ) => ( $this->api->row( self::segment_table( $kind ), $id )['title'] ?? null ) === $title ? array() : array( 'title' ),
			fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-segment', 'created', 'create-' . $kind, (int) $result['id'], array( array( $kind, (int) $result['id'] ) ), $befores, $cap, array(), $report, array( 'kind' => $kind ) ),
			false,
			'tag' === $kind ? 'tags' : 'lists'
		);
		return is_wp_error( $t ) ? $t : $this->segment_answer( $kind, (int) $t['result']['id'], $t );
	}

	/** @return array|WP_Error */
	public function update_segment( string $kind, int $id, ?string $version, bool $force, array $a ) {
		if ( ! $this->api->row( self::segment_table( $kind ), $id ) ) {
			/* translators: 1: tag or list, 2: id. */
			return new WP_Error( 'not_found', sprintf( __( 'There is no FluentCRM %1$s %2$d.', 'emcp-tools' ), $kind, $id ), array( 'status' => 404 ) );
		}
		$in = array( 'action' => 'update', $kind . '_id' => $id ) + array_intersect_key( $a, array_flip( array( 'title', 'slug', 'description' ) ) );
		return $this->locked(
			self::lock_order( array( $kind => array( $id ) ) ),
			function () use ( $kind, $id, $version, $force, $in, $a ) {
				$ok = self::version_check( $this->api->version_of( $kind, $id ), $version, $force, 'list-' . $kind . 's' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$t = $this->transact(
					array( array( $kind, $id ) ),
					function () use ( $in, $kind, $id ) {
						$r = $this->api->ability( 'manage-' . $kind, $in );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					function () use ( $kind, $id, $a ) {
						$row = (array) $this->api->row( self::segment_table( $kind ), $id );
						return isset( $a['title'] ) && '' !== $a['title'] && self::text( $row['title'] ?? '' ) !== self::text( $a['title'] ) ? array( 'title' ) : array();
					},
					fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-segment', 'edit', 'update-' . $kind, $id, array( array( $kind, $id ) ), $befores, $cap, $this->members( $kind, array( $id ) ), $report, array( 'kind' => $kind ) ),
					false
				);
				return is_wp_error( $t ) ? $t : $this->segment_answer( $kind, $id, $t );
			}
		);
	}

	/** @return array|WP_Error */
	public function delete_segment( string $kind, int $id, ?string $version, bool $force ) {
		if ( ! $this->api->row( self::segment_table( $kind ), $id ) ) {
			/* translators: 1: tag or list, 2: id. */
			return new WP_Error( 'not_found', sprintf( __( 'There is no FluentCRM %1$s %2$d.', 'emcp-tools' ), $kind, $id ), array( 'status' => 404 ) );
		}
		$members = $this->members( $kind, array( $id ) );
		if ( count( $members ) > self::SEGMENT_CAP ) {
			return self::too_many( count( $members ), self::SEGMENT_CAP );
		}
		return $this->locked(
			self::lock_order( array( $kind => array( $id ), 'contact' => $members ) ),
			function () use ( $kind, $id, $version, $force ) {
				$ok = self::version_check( $this->api->version_of( $kind, $id ), $version, $force, 'list-' . $kind . 's' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$members = $this->members( $kind, array( $id ) );
				$t       = $this->transact(
					array( array( $kind, $id ) ),
					function () use ( $kind, $id ) {
						$r = $this->api->ability( 'manage-' . $kind, array( 'action' => 'delete', $kind . '_id' => $id, 'force' => true ) );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					fn() => $this->api->row( self::segment_table( $kind ), $id ) || $this->members( $kind, array( $id ) ) ? array( $kind ) : array(),
					fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-segment', 'deleted', 'delete-' . $kind, $id, array( array( $kind, $id ) ), $befores, $cap, $members, $report, array( 'kind' => $kind ) ),
					false
				);
				return is_wp_error( $t ) ? $t : array( 'deleted' => true, $kind . '_id' => $id, 'contacts' => count( $members ), 'change_id' => (string) $t['change'] );
			}
		);
	}

	/** @return array|WP_Error */
	public function merge_segments( string $kind, array $from, int $to, bool $run_automations ) {
		$from  = array_values( array_diff( array_unique( array_map( 'intval', $from ) ), array( $to ) ) );
		$table = self::segment_table( $kind );
		foreach ( array_merge( $from, array( $to ) ) as $id ) {
			if ( ! $this->api->row( $table, $id ) ) {
				/* translators: 1: tag or list, 2: id. */
				return new WP_Error( 'not_found', sprintf( __( 'There is no FluentCRM %1$s %2$d.', 'emcp-tools' ), $kind, $id ), array( 'status' => 404 ) );
			}
		}
		if ( ! $from ) {
			return self::invalid( __( 'Name at least one other tag or list to merge.', 'emcp-tools' ) );
		}
		$dry = $this->api->ability( 'manage-' . $kind, array( 'action' => 'merge', 'from_' . $kind . '_ids' => $from, 'to_' . $kind . '_id' => $to, 'dry_run' => true ) );
		if ( is_wp_error( $dry ) ) {
			return $dry;
		}
		$moving = (int) ( $dry['preflight']['unique_subscribers'] ?? 0 );
		$all    = $this->members( $kind, array_merge( $from, array( $to ) ) );
		if ( max( $moving, count( $all ) ) > self::SEGMENT_CAP ) {
			return self::too_many( max( $moving, count( $all ) ), self::SEGMENT_CAP );
		}
		return $this->locked(
			self::lock_order( array( $kind => array_merge( $from, array( $to ) ), 'contact' => $all ) ),
			function () use ( $kind, $from, $to, $run_automations ) {
				$all     = $this->members( $kind, array_merge( $from, array( $to ) ) );
				$objects = array_map( static fn( $id ) => array( $kind, $id ), array_merge( $from, array( $to ) ) );
				$t       = $this->transact(
					$objects,
					function () use ( $kind, $from, $to ) {
						$r = $this->api->ability( 'manage-' . $kind, array( 'action' => 'merge', 'from_' . $kind . '_ids' => $from, 'to_' . $kind . '_id' => $to ) );
						return is_wp_error( $r ) ? $r : array( 'id' => $to );
					},
					function () use ( $kind, $from, $to, $all ) {
						$bad = array();
						foreach ( $from as $f ) {
							if ( $this->api->row( self::segment_table( $kind ), $f ) ) {
								$bad[] = $kind . ':' . $f;
							}
						}
						return array_diff( $all, $this->members( $kind, array( $to ) ) ) ? array_merge( $bad, array( 'members' ) ) : $bad;
					},
					fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-segment', 'merged', 'merge-' . $kind . 's', $to, $objects, $befores, $cap, $all, $report, array( 'kind' => $kind ) ),
					$run_automations
				);
				return is_wp_error( $t ) ? $t : array( 'merged_into' => $to, 'removed' => $from, 'contacts' => count( $all ), 'emails' => $t['emails'], 'automations' => $t['automations'], 'change_id' => (string) $t['change'] );
			}
		);
	}

	// Custom fields (whole-list saves, Review Focus 4).

	/** @return array|WP_Error */
	public function add_custom_field( array $a, ?string $version, bool $force ) {
		$label = trim( (string) ( $a['label'] ?? '' ) );
		$type  = (string) ( $a['type'] ?? 'text' );
		$slug  = (string) ( $a['slug'] ?? '' );
		$slug  = '' !== $slug ? $slug : str_replace( '-', '_', sanitize_title( $label ) );
		if ( '' === $label || '' === $slug ) {
			return self::invalid( __( 'label is required.', 'emcp-tools' ) );
		}
		$field = array( 'slug' => $slug, 'label' => $label, 'type' => $type );
		if ( in_array( $type, self::CHOICE, true ) ) {
			$opts = array_values( array_filter( array_map( 'strval', (array) ( $a['options'] ?? array() ) ), 'strlen' ) );
			if ( ! $opts ) {
				return self::invalid( __( 'A choice field needs options.', 'emcp-tools' ) );
			}
			$field['options'] = $opts;
		}
		if ( isset( $a['group'] ) && '' !== $a['group'] ) {
			$field['group'] = (string) $a['group'];
		}
		return $this->save_field_list(
			$version,
			$force,
			'add-custom-field',
			function ( array $list ) use ( $field ) {
				if ( in_array( $field['slug'], array_column( $list, 'slug' ), true ) ) {
					/* translators: %s: slug. */
					return new WP_Error( 'field_exists', sprintf( __( 'A custom field "%s" already exists.', 'emcp-tools' ), $field['slug'] ), array( 'status' => 409 ) );
				}
				$list[] = $field;
				return $list;
			},
			$slug
		);
	}

	/** @return array|WP_Error */
	public function update_custom_field( string $slug, array $a, ?string $version, bool $force ) {
		return $this->save_field_list(
			$version,
			$force,
			'update-custom-field',
			function ( array $list ) use ( $slug, $a ) {
				foreach ( $list as $i => $f ) {
					if ( (string) $f['slug'] !== $slug ) {
						continue;
					}
					if ( isset( $a['label'] ) && '' !== trim( (string) $a['label'] ) ) {
						$list[ $i ]['label'] = trim( (string) $a['label'] );
					}
					if ( array_key_exists( 'options', $a ) ) {
						if ( ! in_array( (string) ( $f['type'] ?? '' ), self::CHOICE, true ) ) {
							return self::invalid( __( 'Only choice fields have options.', 'emcp-tools' ) );
						}
						$opts = array_values( array_filter( array_map( 'strval', (array) $a['options'] ), 'strlen' ) );
						if ( ! $opts ) {
							return self::invalid( __( 'A choice field needs options.', 'emcp-tools' ) );
						}
						$list[ $i ]['options'] = $opts;
					}
					if ( array_key_exists( 'group', $a ) ) {
						$list[ $i ]['group'] = (string) $a['group'];
					}
					return $list;
				}
				/* translators: %s: slug. */
				return new WP_Error( 'not_found', sprintf( __( 'There is no custom field "%s".', 'emcp-tools' ), $slug ), array( 'status' => 404 ) );
			},
			$slug
		);
	}

	/** Reads the stored list, changes it with $change, saves the whole list (FluentCRM's PUT replaces it). */
	protected function save_field_list( ?string $version, bool $force, string $op, callable $change, string $slug ) {
		return $this->locked(
			self::lock_order( array( 'custom_fields' => array( 0 ) ) ),
			function () use ( $version, $force, $op, $change, $slug ) {
				$ok = self::version_check( $this->api->version_of( 'custom_fields', 0 ), $version, $force, 'list-custom-fields' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$list = $change( $this->api->custom_field_list() );
				if ( is_wp_error( $list ) ) {
					return $list;
				}
				$t = $this->transact(
					array( array( 'custom_fields', 0 ) ),
					function () use ( $list ) {
						$r = $this->api->rest( 'PUT', 'custom-fields/contacts', array( 'fields' => $list ) );
						return is_wp_error( $r ) ? $r : array( 'id' => 0 );
					},
					fn() => $this->api->custom_field_list() == $list ? array() : array( 'fields' ),
					fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-custom-fields', 'edit', $op, 0, array( array( 'custom_fields', 0 ) ), $befores, $cap, array(), $report, array( 'slug' => $slug ) ),
					false,
					static fn() => 0
				);
				return is_wp_error( $t ) ? $t : array( 'slug' => $slug, 'version' => $this->api->version_of( 'custom_fields', 0 ), 'change_id' => (string) $t['change'] ) + ( isset( $t['warning'] ) ? array( 'warning' => $t['warning'] ) : array() );
			}
		);
	}

	// Notes.

	/** @return array|WP_Error */
	public function add_note( array $a ) {
		$cid = (int) $a['contact_id'];
		if ( ! $this->api->row( 'fc_subscribers', $cid ) ) {
			/* translators: %d: contact id. */
			return new WP_Error( 'not_found', sprintf( __( 'There is no FluentCRM contact %d.', 'emcp-tools' ), $cid ), array( 'status' => 404 ) );
		}
		$in = array( 'contact_id' => $cid, 'type' => (string) ( $a['type'] ?? 'note' ), 'title' => (string) $a['title'], 'description' => (string) $a['description'] );
		return $this->locked(
			self::lock_order( array( 'contact' => array( $cid ) ) ),
			function () use ( $in, $cid ) {
				$t = $this->transact(
					array( array( 'note', 0 ) ),
					function () use ( $in ) {
						$r = $this->api->ability( 'add-contact-note', $in );
						return is_wp_error( $r ) ? $r : array( 'id' => (int) ( $r['note']['id'] ?? $r['id'] ?? 0 ) );
					},
					fn( int $id ) => self::text( $this->api->row( 'fc_subscriber_notes', $id )['title'] ?? '' ) === self::text( $in['title'] ) ? array() : array( 'title' ),
					fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-note', 'created', 'add-note', (int) $result['id'], array( array( 'note', (int) $result['id'] ) ), $befores, $cap, array( $cid ), $report ),
					false,
					'subscriber_notes'
				);
				return is_wp_error( $t ) ? $t : array( 'note_id' => (int) $t['result']['id'], 'version' => $this->api->version_of( 'note', (int) $t['result']['id'] ), 'change_id' => (string) $t['change'] );
			}
		);
	}

	/** @return array|WP_Error */
	public function update_note( int $id, ?string $version, bool $force, array $a ) {
		$note = $this->api->row( 'fc_subscriber_notes', $id );
		if ( ! $note ) {
			/* translators: %d: note id. */
			return new WP_Error( 'not_found', sprintf( __( 'There is no FluentCRM note %d.', 'emcp-tools' ), $id ), array( 'status' => 404 ) );
		}
		$cid = (int) $note['subscriber_id'];
		return $this->locked(
			self::lock_order( array( 'contact' => array( $cid ) ) ),
			function () use ( $id, $cid, $version, $force, $a ) {
				$ok = self::version_check( $this->api->version_of( 'note', $id ), $version, $force, 'get-contact' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$stored = (array) $this->api->row( 'fc_subscriber_notes', $id );
				$merged = array();
				foreach ( array( 'title', 'description', 'type' ) as $k ) {
					$merged[ $k ] = array_key_exists( $k, $a ) && '' !== (string) $a[ $k ] ? (string) $a[ $k ] : (string) $stored[ $k ];
				}
				$t = $this->transact(
					array( array( 'note', $id ) ),
					function () use ( $cid, $id, $merged ) {
						$r = $this->api->rest( 'PUT', 'subscribers/' . $cid . '/notes/' . $id, array( 'note' => $merged ) );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					function () use ( $id, $merged ) {
						$row = (array) $this->api->row( 'fc_subscriber_notes', $id );
						$bad = array();
						foreach ( $merged as $k => $v ) {
							if ( self::text( $row[ $k ] ?? '' ) !== self::text( $v ) ) {
								$bad[] = $k;
							}
						}
						return $bad;
					},
					fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-note', 'edit', 'update-note', $id, array( array( 'note', $id ) ), $befores, $cap, array( $cid ), $report ),
					false
				);
				return is_wp_error( $t ) ? $t : array( 'note_id' => $id, 'version' => $this->api->version_of( 'note', $id ), 'change_id' => (string) $t['change'] );
			}
		);
	}

	/** @return array|WP_Error */
	public function delete_note( int $id, ?string $version, bool $force ) {
		$note = $this->api->row( 'fc_subscriber_notes', $id );
		if ( ! $note ) {
			/* translators: %d: note id. */
			return new WP_Error( 'not_found', sprintf( __( 'There is no FluentCRM note %d.', 'emcp-tools' ), $id ), array( 'status' => 404 ) );
		}
		$cid = (int) $note['subscriber_id'];
		return $this->locked(
			self::lock_order( array( 'contact' => array( $cid ) ) ),
			function () use ( $id, $cid, $version, $force ) {
				$ok = self::version_check( $this->api->version_of( 'note', $id ), $version, $force, 'get-contact' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$t = $this->transact(
					array( array( 'note', $id ) ),
					function () use ( $id ) {
						$r = $this->api->ability( 'delete-contact-note', array( 'note_id' => $id ) );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					fn() => $this->api->row( 'fc_subscriber_notes', $id ) ? array( 'note' ) : array(),
					fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-note', 'deleted', 'delete-note', $id, array( array( 'note', $id ) ), $befores, $cap, array( $cid ), $report ),
					false
				);
				return is_wp_error( $t ) ? $t : array( 'deleted' => true, 'note_id' => $id, 'change_id' => (string) $t['change'] );
			}
		);
	}

	// Email templates.

	/** The template as FluentCRM's REST controller takes it, from the stored post and meta. */
	protected function stored_template( int $id ): array {
		$rows = $this->api->rows( 'template', $id );
		$post = (array) current( $rows['posts'] );
		$meta = array();
		foreach ( $rows['postmeta'] as $m ) {
			$meta[ (string) $m['meta_key'] ] = maybe_unserialize( $m['meta_value'] );
		}
		return array(
			'post_title'      => (string) ( $post['post_title'] ?? '' ),
			'post_content'    => (string) ( $post['post_content'] ?? '' ),
			'post_excerpt'    => (string) ( $post['post_excerpt'] ?? '' ),
			'email_subject'   => (string) ( $meta['_email_subject'] ?? '' ),
			'edit_type'       => (string) ( $meta['_edit_type'] ?? 'html' ),
			'design_template' => (string) ( $meta['_design_template'] ?? '' ),
			'settings'        => array(
				'template_config' => (array) ( $meta['_template_config'] ?? array() ),
				'footer_settings' => (array) ( $meta['_footer_settings'] ?? array() ),
			),
		);
	}

	protected static function template_fields( array $a ): array {
		$out = array();
		foreach ( array( 'title' => 'post_title', 'body' => 'post_content', 'subject' => 'email_subject', 'design_template' => 'design_template' ) as $from => $to ) {
			if ( array_key_exists( $from, $a ) && '' !== (string) $a[ $from ] ) {
				$out[ $to ] = (string) $a[ $from ];
			}
		}
		if ( isset( $a['settings'] ) && is_array( $a['settings'] ) ) {
			$out['settings'] = array_intersect_key( $a['settings'], array_flip( array( 'template_config', 'footer_settings' ) ) );
		}
		return $out;
	}

	protected function template_mismatches( int $id, array $want ): array {
		$have = $this->stored_template( $id );
		$bad  = array();
		foreach ( array( 'post_title', 'post_content', 'email_subject' ) as $k ) {
			if ( isset( $want[ $k ] ) && self::text( $have[ $k ] ) !== self::text( $want[ $k ] ) ) {
				$bad[] = $k;
			}
		}
		return $bad;
	}

	/** @return array|WP_Error */
	public function create_template( array $a ) {
		$tpl = self::template_fields( $a ) + array( 'edit_type' => 'html' );
		$t   = $this->transact(
			array( array( 'template', 0 ) ),
			function () use ( $tpl ) {
				$r = $this->api->rest( 'POST', 'templates', array( 'template' => $tpl ) );
				return is_wp_error( $r ) ? $r : array( 'id' => (int) ( $r['template_id'] ?? 0 ) );
			},
			fn( int $id ) => $this->template_mismatches( $id, $tpl ),
			fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-template', 'created', 'create-template', (int) $result['id'], array( array( 'template', (int) $result['id'] ) ), $befores, $cap, array(), $report ),
			false,
			'posts'
		);
		return is_wp_error( $t ) ? $t : $this->template_answer( (int) $t['result']['id'], $t );
	}

	protected function template_answer( int $id, array $t ): array {
		return array( 'template_id' => $id, 'version' => $this->api->version_of( 'template', $id ), 'change_id' => (string) $t['change'] ) + ( isset( $t['warning'] ) ? array( 'warning' => $t['warning'] ) : array() );
	}

	/** @return array|WP_Error */
	public function update_template( int $id, ?string $version, bool $force, array $a ) {
		if ( ! $this->api->rows( 'template', $id )['posts'] ) {
			/* translators: %d: template id. */
			return new WP_Error( 'not_found', sprintf( __( 'There is no FluentCRM email template %d.', 'emcp-tools' ), $id ), array( 'status' => 404 ) );
		}
		return $this->locked(
			self::lock_order( array( 'template' => array( $id ) ) ),
			function () use ( $id, $version, $force, $a ) {
				$ok = self::version_check( $this->api->version_of( 'template', $id ), $version, $force, 'get-template' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$changes = self::template_fields( $a );
				$tpl     = array_replace_recursive( $this->stored_template( $id ), $changes );
				$t       = $this->transact(
					array( array( 'template', $id ) ),
					function () use ( $id, $tpl ) {
						$r = $this->api->rest( 'PUT', 'templates/' . $id, array( 'template' => $tpl ) );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					fn() => $this->template_mismatches( $id, $tpl ),
					fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-template', 'edit', 'update-template', $id, array( array( 'template', $id ) ), $befores, $cap, array(), $report ),
					false
				);
				return is_wp_error( $t ) ? $t : $this->template_answer( $id, $t );
			}
		);
	}

	/** @return array|WP_Error */
	public function delete_template( int $id, ?string $version, bool $force ) {
		if ( ! $this->api->rows( 'template', $id )['posts'] ) {
			/* translators: %d: template id. */
			return new WP_Error( 'not_found', sprintf( __( 'There is no FluentCRM email template %d.', 'emcp-tools' ), $id ), array( 'status' => 404 ) );
		}
		return $this->locked(
			self::lock_order( array( 'template' => array( $id ) ) ),
			function () use ( $id, $version, $force ) {
				$ok = self::version_check( $this->api->version_of( 'template', $id ), $version, $force, 'get-template' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				// wp_delete_post() detaches the template's attachments; the undo attaches them again.
				$attachments = array_map( 'intval', array_keys( $this->api->find( 'posts', array( 'post_parent' => $id, 'post_type' => 'attachment' ) ) ) );
				$t           = $this->transact(
					array( array( 'template', $id ) ),
					function () use ( $id ) {
						$r = $this->api->rest( 'DELETE', 'templates/' . $id );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					fn() => $this->api->rows( 'template', $id )['posts'] ? array( 'template' ) : array(),
					fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-template', 'deleted', 'delete-template', $id, array( array( 'template', $id ) ), $befores, $cap, array(), $report, array( 'attachments' => $attachments ) ),
					false
				);
				return is_wp_error( $t ) ? $t : array( 'deleted' => true, 'template_id' => $id, 'change_id' => (string) $t['change'] );
			}
		);
	}

	// Erasure (D14, D16).

	/**
	 * Erases a contact through FluentCRM (every row naming it goes), records an irreversible entry
	 * holding the id only, and removes the contact's data from every earlier History entry.
	 *
	 * @return array|WP_Error
	 */
	public function delete_contact( int $id, bool $confirm ) {
		if ( ! $confirm ) {
			return new WP_Error( 'confirmation_required', __( 'Erasing a contact cannot be undone. Pass confirm:true in arguments to proceed.', 'emcp-tools' ) );
		}
		$rows = $this->api->rows( 'contact', $id );
		if ( ! $rows['fc_subscribers'] ) {
			/* translators: %d: contact id. */
			return new WP_Error( 'not_found', sprintf( __( 'There is no FluentCRM contact %d.', 'emcp-tools' ), $id ), array( 'status' => 404 ) );
		}
		return $this->locked(
			self::lock_order( self::merge_ids( array( 'contact' => array( $id ) ), self::refs_in( array( $rows ) ) ) ),
			function () use ( $id ) {
				$t = $this->transact(
					array( array( 'contact', $id ) ),
					function () use ( $id ) {
						$r = $this->api->ability( 'delete-contact', array( 'contact_id' => $id, 'delete_emails' => true ) );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					fn() => $this->api->row( 'fc_subscribers', $id ) ? array( 'contact' ) : array(),
					/* translators: %d: contact id. */
					fn() => EMCP_Tools_FluentCRM_History::record_audit( 'delete-contact', 'fluentcrm-contact:' . $id, sprintf( __( 'FluentCRM: contact #%d erased', 'emcp-tools' ), $id ), __( 'An erased contact cannot be brought back, and earlier History entries no longer hold its data.', 'emcp-tools' ), array(), array( 'erased' => $id ) ),
					false,
					static fn() => $id
				);
				if ( is_wp_error( $t ) ) {
					return $t;
				}
				// FluentCRM's own hook has redacted already; this covers a delete path that skips it.
				$n = EMCP_Tools_FluentCRM_History::redact_contact( $id );
				return array( 'deleted' => true, 'contact_id' => $id, 'history_redacted' => EMCP_Tools_FluentCRM_History::$redacted + $n, 'change_id' => (string) $t['change'] );
			}
		);
	}

	// Campaigns and sends (D8, D18).

	const CAMPAIGN_FIELDS = array( 'title', 'email_subject', 'email_pre_header', 'email_body', 'design_template', 'settings', 'recipients', 'exclude_recipients', 'subjects', 'label_ids', 'utm' );

	protected function campaign_row( int $id ): ?array {
		$row = $this->api->row( 'fc_campaigns', $id );
		return $row && 'campaign' === (string) ( $row['type'] ?? 'campaign' ) ? $row : null;
	}

	protected static function no_campaign( int $id ): WP_Error {
		/* translators: %d: campaign id. */
		return new WP_Error( 'not_found', sprintf( __( 'There is no FluentCRM campaign %d.', 'emcp-tools' ), $id ), array( 'status' => 404 ) );
	}

	protected static function not_a_draft(): WP_Error {
		return new WP_Error( 'not_a_draft', __( 'Only a draft campaign can be changed or deleted this way; unschedule or pause it first.', 'emcp-tools' ), array( 'status' => 409 ) );
	}

	/** A site-local Y-m-d H:i in the future, as FluentCRM's admin stores it (Review Focus 3). @return string|WP_Error */
	public static function site_time( string $at ) {
		$d = DateTime::createFromFormat( '!Y-m-d H:i', $at, wp_timezone() );
		if ( ! $d || $d->format( 'Y-m-d H:i' ) !== $at ) {
			return self::invalid( __( 'scheduled_at must be a site-local time as Y-m-d H:i.', 'emcp-tools' ) );
		}
		if ( $d->getTimestamp() <= time() ) {
			return self::invalid( __( 'scheduled_at is in the past; nothing was scheduled.', 'emcp-tools' ) );
		}
		return $d->format( 'Y-m-d H:i:s' );
	}

	protected function campaign_mismatches( int $id, array $want ): array {
		$row = (array) $this->api->row( 'fc_campaigns', $id );
		$bad = array();
		foreach ( array( 'title', 'email_subject', 'email_pre_header' ) as $k ) {
			if ( isset( $want[ $k ] ) && self::text( $row[ $k ] ?? '' ) !== self::text( $want[ $k ] ) ) {
				$bad[] = $k;
			}
		}
		return $row ? $bad : array( 'campaign' );
	}

	/** @return array|WP_Error */
	public function create_campaign( array $a ) {
		$in = array_intersect_key( $a, array_flip( self::CAMPAIGN_FIELDS ) ) + array( 'if_exists' => 'error' );
		$t  = $this->transact(
			array( array( 'campaign', 0 ) ),
			function () use ( $in ) {
				$r = $this->api->ability( 'upsert-campaign', $in );
				return is_wp_error( $r ) ? $r : array( 'id' => (int) ( $r['campaign']['id'] ?? 0 ) );
			},
			fn( int $id ) => $this->campaign_mismatches( $id, $in ),
			fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-campaign', 'created', 'create-campaign', (int) $result['id'], array( array( 'campaign', (int) $result['id'] ) ), $befores, $cap, array(), $report ),
			false,
			'campaigns'
		);
		return is_wp_error( $t ) ? $t : $this->campaign_answer( (int) $t['result']['id'], $t );
	}

	protected function campaign_answer( int $id, array $t, array $extra = array() ): array {
		return array( 'campaign_id' => $id, 'version' => $this->api->version_of( 'campaign', $id ), 'emails' => $t['emails'], 'change_id' => (string) $t['change'] ) + $extra + ( isset( $t['warning'] ) ? array( 'warning' => $t['warning'] ) : array() );
	}

	/** @return array|WP_Error */
	public function update_campaign( int $id, ?string $version, bool $force, array $a ) {
		if ( ! $this->campaign_row( $id ) ) {
			return self::no_campaign( $id );
		}
		return $this->locked(
			self::lock_order( array( 'campaign' => array( $id ) ) ),
			function () use ( $id, $version, $force, $a ) {
				if ( 'draft' !== (string) ( $this->campaign_row( $id )['status'] ?? '' ) ) {
					return self::not_a_draft();
				}
				$ok = self::version_check( $this->api->version_of( 'campaign', $id ), $version, $force, 'get-campaign' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$in = array( 'campaign_id' => $id ) + array_intersect_key( $a, array_flip( self::CAMPAIGN_FIELDS ) );
				$t  = $this->transact(
					array( array( 'campaign', $id ) ),
					function () use ( $in, $id ) {
						$r = $this->api->ability( 'upsert-campaign', $in );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					fn() => $this->campaign_mismatches( $id, $in ),
					fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-campaign', 'edit', 'update-campaign', $id, array( array( 'campaign', $id ) ), $befores, $cap, array(), $report ),
					false
				);
				return is_wp_error( $t ) ? $t : $this->campaign_answer( $id, $t );
			}
		);
	}

	/** @return array|WP_Error */
	public function schedule_campaign( int $id, ?string $version, bool $force, ?string $at, int $expected ) {
		if ( ! $this->campaign_row( $id ) ) {
			return self::no_campaign( $id );
		}
		$when = null;
		if ( null !== $at && '' !== $at ) {
			$when = self::site_time( $at );
			if ( is_wp_error( $when ) ) {
				return $when;
			}
		}
		return $this->locked(
			self::lock_order( array( 'campaign' => array( $id ) ) ),
			function () use ( $id, $version, $force, $when, $expected ) {
				if ( 'draft' !== (string) ( $this->campaign_row( $id )['status'] ?? '' ) ) {
					return self::not_a_draft();
				}
				$ok = self::version_check( $this->api->version_of( 'campaign', $id ), $version, $force, 'get-campaign' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$c = $this->api->ability( 'get-campaign', array( 'campaign_id' => $id, 'include' => array( 'recipients_estimate' ) ) );
				if ( is_wp_error( $c ) ) {
					return $c;
				}
				$estimate = (int) ( $c['recipients_estimate']['count'] ?? -1 );
				if ( $estimate !== $expected ) {
					/* translators: 1: expected, 2: estimate. */
					return new WP_Error( 'recipients_mismatch', sprintf( __( 'You expected %1$d recipients but FluentCRM counts %2$d now, so nothing was scheduled. Check the recipients and pass the count get-campaign gives.', 'emcp-tools' ), $expected, $estimate ), array( 'status' => 409, 'estimate' => $estimate, 'expected' => $expected ) );
				}
				$in = array( 'campaign_id' => $id, 'action' => 'schedule' ) + ( $when ? array( 'scheduled_at' => $when, 'sending_type' => 'schedule' ) : array( 'sending_type' => 'instant' ) );
				$t  = $this->transact(
					array( array( 'campaign', $id ) ),
					function () use ( $in, $id ) {
						$r = $this->api->ability( 'change-campaign-status', $in );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					fn() => in_array( (string) ( $this->api->row( 'fc_campaigns', $id )['status'] ?? '' ), array( 'processing', 'pending-scheduled', 'scheduled', 'working' ), true ) ? array() : array( 'status' ),
					fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-campaign', 'scheduled', 'schedule-campaign', $id, array( array( 'campaign', $id ) ), $befores, $cap, array(), $report ),
					false
				);
				if ( is_wp_error( $t ) ) {
					return $t;
				}
				$stored = (string) ( $this->api->row( 'fc_campaigns', $id )['scheduled_at'] ?? '' );
				return $this->campaign_answer( $id, $t, array( 'status' => (string) $this->api->row( 'fc_campaigns', $id )['status'], 'scheduled_at' => $when && '' !== $stored ? substr( $stored, 0, 16 ) : null, 'recipients' => $estimate ) );
			}
		);
	}

	/** Runs $fn holding FluentCRM's campaign processing lock (D18), never waiting. */
	protected function with_campaign_lock( int $id, callable $fn ) {
		if ( ! $this->api->campaign_lock( $id ) ) {
			return new WP_Error( 'fluentcrm_busy', __( 'FluentCRM is processing this campaign right now. Try again in a minute.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		try {
			return $fn();
		} finally {
			$this->api->campaign_unlock( $id );
		}
	}

	/** @return array|WP_Error */
	public function unschedule_campaign( int $id ) {
		if ( ! $this->campaign_row( $id ) ) {
			return self::no_campaign( $id );
		}
		return $this->locked(
			self::lock_order( array( 'campaign' => array( $id ) ) ),
			function () use ( $id ) {
				if ( ! in_array( (string) ( $this->campaign_row( $id )['status'] ?? '' ), array( 'processing', 'pending-scheduled', 'scheduled', 'working' ), true ) ) {
					return new WP_Error( 'not_scheduled', __( 'This campaign is not scheduled.', 'emcp-tools' ), array( 'status' => 409 ) );
				}
				return $this->with_campaign_lock(
					$id,
					function () use ( $id ) {
						$t = $this->transact(
							array( array( 'campaign', $id ), array( 'campaign_queue', $id ) ),
							function () use ( $id ) {
								$r = $this->api->withdraw_queue_rows( $id );
								return is_wp_error( $r ) ? $r : array( 'id' => $id );
							},
							fn() => 'draft' === (string) ( $this->api->row( 'fc_campaigns', $id )['status'] ?? '' ) && ! $this->api->rows( 'campaign_queue', $id )['fc_campaign_emails'] ? array() : array( 'queue' ),
							/* translators: %d: campaign id. */
							fn() => EMCP_Tools_FluentCRM_History::record_audit( 'unschedule-campaign', 'fluentcrm-campaign:' . $id, sprintf( __( 'FluentCRM: campaign #%d unscheduled', 'emcp-tools' ), $id ), __( 'Unscheduling cannot be undone: schedule the campaign again with confirm.', 'emcp-tools' ), array() ),
							false
						);
						return is_wp_error( $t ) ? $t : array( 'campaign_id' => $id, 'status' => 'draft', 'change_id' => (string) $t['change'] );
					}
				);
			}
		);
	}

	/** pause or resume: irreversible entries (D18). @return array|WP_Error */
	public function campaign_action( int $id, string $action ) {
		if ( ! $this->campaign_row( $id ) ) {
			return self::no_campaign( $id );
		}
		return $this->locked(
			self::lock_order( array( 'campaign' => array( $id ) ) ),
			function () use ( $id, $action ) {
				$t = $this->transact(
					array( array( 'campaign', $id ) ),
					function () use ( $id, $action ) {
						$r = $this->api->ability( 'change-campaign-status', array( 'campaign_id' => $id, 'action' => $action ) );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					static fn() => array(),
					/* translators: 1: action, 2: campaign id. */
					fn() => EMCP_Tools_FluentCRM_History::record_audit( $action . '-campaign', 'fluentcrm-campaign:' . $id, sprintf( __( 'FluentCRM: campaign #%2$d %1$s', 'emcp-tools' ), 'pause' === $action ? 'paused' : 'resumed', $id ), __( 'Pausing and resuming cannot be undone: undoing them would stop or restart sending.', 'emcp-tools' ), array() ),
					false
				);
				return is_wp_error( $t ) ? $t : array( 'campaign_id' => $id, 'status' => (string) ( $this->api->row( 'fc_campaigns', $id )['status'] ?? '' ), 'emails' => $t['emails'], 'change_id' => (string) $t['change'] );
			}
		);
	}

	/** @return array|WP_Error */
	public function duplicate_campaign( int $id, string $title ) {
		if ( ! $this->campaign_row( $id ) ) {
			return self::no_campaign( $id );
		}
		$in = array( 'campaign_id' => $id, 'action' => 'duplicate' ) + ( '' !== $title ? array( 'new_title' => $title ) : array() );
		$t  = $this->transact(
			array( array( 'campaign', 0 ) ),
			function () use ( $in ) {
				$r = $this->api->ability( 'change-campaign-status', $in );
				return is_wp_error( $r ) ? $r : array( 'id' => (int) ( $r['campaign']['id'] ?? 0 ) );
			},
			fn( int $new ) => $this->campaign_row( $new ) ? array() : array( 'campaign' ),
			fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-campaign', 'created', 'duplicate-campaign', (int) $result['id'], array( array( 'campaign', (int) $result['id'] ) ), $befores, $cap, array(), $report ),
			false,
			'campaigns'
		);
		return is_wp_error( $t ) ? $t : $this->campaign_answer( (int) $t['result']['id'], $t );
	}

	/** @return array|WP_Error */
	public function delete_campaign( int $id, ?string $version, bool $force ) {
		if ( ! $this->campaign_row( $id ) ) {
			return self::no_campaign( $id );
		}
		return $this->locked(
			self::lock_order( array( 'campaign' => array( $id ) ) ),
			function () use ( $id, $version, $force ) {
				if ( 'draft' !== (string) ( $this->campaign_row( $id )['status'] ?? '' ) ) {
					return self::not_a_draft();
				}
				$ok = self::version_check( $this->api->version_of( 'campaign', $id ), $version, $force, 'get-campaign' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$t = $this->transact(
					array( array( 'campaign', $id ) ),
					function () use ( $id ) {
						$r = $this->api->ability( 'change-campaign-status', array( 'campaign_id' => $id, 'action' => 'delete' ) );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					fn() => $this->api->row( 'fc_campaigns', $id ) ? array( 'campaign' ) : array(),
					fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-campaign', 'deleted', 'delete-campaign', $id, array( array( 'campaign', $id ) ), $befores, $cap, array(), $report ),
					false
				);
				return is_wp_error( $t ) ? $t : array( 'deleted' => true, 'campaign_id' => $id, 'change_id' => (string) $t['change'] );
			}
		);
	}

	/** To the current user's own address only (D8): to_email is never passed. @return array|WP_Error */
	public function send_test_email( array $a ) {
		$cid = (int) ( $a['campaign_id'] ?? 0 );
		if ( $cid > 0 ) {
			// The campaign it renders is leased, so a concurrent delete or undo of it waits (checklist 1).
			return $this->locked( self::lock_order( array( 'campaign' => array( $cid ) ) ), fn() => $this->send_test_now( $a ) );
		}
		return $this->send_test_now( $a );
	}

	/** @return array|WP_Error */
	protected function send_test_now( array $a ) {
		$in = array_intersect_key( $a, array_flip( array( 'campaign_id', 'subject', 'body', 'pre_header', 'design_template', 'is_transactional', 'disable_footer' ) ) );
		$t  = $this->transact(
			array( array( 'campaign', (int) ( $a['campaign_id'] ?? 0 ) ) ),
			function () use ( $in ) {
				$r = $this->api->ability( 'send-test-email', $in );
				return is_wp_error( $r ) ? $r : array( 'id' => 0 );
			},
			static fn() => array(),
			fn() => EMCP_Tools_FluentCRM_History::record_audit( 'send-test-email', 'fluentcrm-campaign:' . (int) ( $a['campaign_id'] ?? 0 ), __( 'FluentCRM: a test email sent to the user', 'emcp-tools' ), __( 'Sent email cannot be taken back.', 'emcp-tools' ), array() ),
			false,
			static fn() => 0
		);
		return is_wp_error( $t ) ? $t : array( 'sent' => true, 'emails' => $t['emails'], 'change_id' => (string) $t['change'] );
	}

	/** @return array|WP_Error */
	public function send_email_to_contact( int $contact_id, array $a ) {
		if ( ! $this->api->row( 'fc_subscribers', $contact_id ) ) {
			/* translators: %d: contact id. */
			return new WP_Error( 'not_found', sprintf( __( 'There is no FluentCRM contact %d.', 'emcp-tools' ), $contact_id ), array( 'status' => 404 ) );
		}
		// The contact is leased, so an undo of its creation cannot pass its "no email" check while this sends.
		return $this->locked( self::lock_order( array( 'contact' => array( $contact_id ) ) ), fn() => $this->send_to_contact_now( $contact_id, $a ) );
	}

	/** @return array|WP_Error */
	protected function send_to_contact_now( int $contact_id, array $a ) {
		$in = array( 'contact_id' => $contact_id ) + array_intersect_key( $a, array_flip( array( 'subject', 'body', 'pre_header', 'design_template', 'is_transactional', 'disable_footer', 'title' ) ) );
		$t  = $this->transact(
			array( array( 'contact', $contact_id ) ),
			function () use ( $in ) {
				$r = $this->api->ability( 'send-email-to-contact', $in );
				return is_wp_error( $r ) ? $r : array( 'id' => 0 );
			},
			static fn() => array(),
			/* translators: %d: contact id. */
			fn() => EMCP_Tools_FluentCRM_History::record_audit( 'send-email-to-contact', 'fluentcrm-contact:' . $contact_id, sprintf( __( 'FluentCRM: an email sent to contact #%d', 'emcp-tools' ), $contact_id ), __( 'Sent email cannot be taken back.', 'emcp-tools' ), array( $contact_id ) ),
			false,
			static fn() => $contact_id
		);
		return is_wp_error( $t ) ? $t : array( 'sent' => true, 'contact_id' => $contact_id, 'emails' => $t['emails'], 'change_id' => (string) $t['change'] );
	}

	/**
	 * The undo of a schedule (D18): under the campaign lease and FluentCRM's processing lock, the
	 * queue is withdrawn exactly as unschedule-campaign does (emails_sent when any email left it),
	 * then the campaign row is put back as it was before the schedule.
	 *
	 * @return true|WP_Error
	 */
	protected function undo_schedule( array $rb, bool $force ) {
		$id = (int) ( $rb['id'] ?? 0 );
		return $this->locked(
			self::lock_order( array( 'campaign' => array( $id ) ) ),
			function () use ( $rb, $id ) {
				$blocker = EMCP_Tools_FluentCRM_History::blocker( $this->api, $rb );
				if ( is_wp_error( $blocker ) ) {
					return $blocker;
				}
				return $this->with_campaign_lock(
					$id,
					function () use ( $rb, $id ) {
						try {
							$w = $this->api->withdraw_queue_rows( $id );
						} catch ( \Throwable $e ) {
							return new WP_Error( 'rollback_failed', $e->getMessage() );
						}
						if ( is_wp_error( $w ) ) {
							return $w;
						}
						$tables = array( 'fc_campaigns', 'fc_meta' );
						$before = self::union( (array) ( $rb['before'] ?? array() ), $tables );
						$now    = self::union( array( $this->api->rows( 'campaign', $id ) ), $tables );
						return $this->api->restore_rows( $before, $now ) ? true : new WP_Error( 'rollback_failed', __( 'The campaign could not be put back as a draft.', 'emcp-tools' ) );
					}
				);
			}
		);
	}

	// Automations (D19).

	protected static function no_automation( int $id ): WP_Error {
		/* translators: %d: automation id. */
		return new WP_Error( 'not_found', sprintf( __( 'There is no FluentCRM automation %d.', 'emcp-tools' ), $id ), array( 'status' => 404 ) );
	}

	/** @return array|WP_Error */
	public function set_automation_status( int $id, ?string $version, bool $force, string $status, bool $confirm ) {
		if ( ! $this->api->row( 'fc_funnels', $id ) ) {
			return self::no_automation( $id );
		}
		if ( 'published' === $status && ! $confirm ) {
			return new WP_Error( 'confirmation_required', __( 'Publishing makes the triggers of this automation live and lets enrolled contacts continue from their due steps, which can send email. Pass confirm:true in arguments to proceed.', 'emcp-tools' ) );
		}
		return $this->locked(
			self::lock_order( array( 'automation' => array( $id ) ) ),
			function () use ( $id, $version, $force, $status ) {
				$ok = self::version_check( $this->api->version_of( 'automation', $id ), $version, $force, 'get-automation' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				if ( $status === (string) $this->api->row( 'fc_funnels', $id )['status'] ) {
					return array( 'funnel_id' => $id, 'status' => $status, 'unchanged' => true, 'version' => $this->api->version_of( 'automation', $id ) );
				}
				$publish = 'published' === $status;
				$record  = $publish
					? fn( array $result, array $befores, array $cap, array $report ) => EMCP_Tools_FluentCRM_History::record_write( 'fluentcrm-automation', 'edit', 'set-automation-status', $id, array( array( 'automation', $id ) ), $befores, $cap, array(), $report )
					/* translators: %d: automation id. */
					: fn() => EMCP_Tools_FluentCRM_History::record_audit( 'set-automation-status', 'fluentcrm-automation:' . $id, sprintf( __( 'FluentCRM: automation #%d set to draft', 'emcp-tools' ), $id ), __( 'Undoing this would publish the automation again and restart its sends. Publish it again with confirm instead.', 'emcp-tools' ), array() );
				$t       = $this->transact(
					array( array( 'automation', $id ) ),
					function () use ( $id, $status ) {
						$r = $this->api->rest( 'PUT', 'funnels/' . $id, array( 'status' => $status ) );
						return is_wp_error( $r ) ? $r : array( 'id' => $id );
					},
					fn() => $status === (string) ( $this->api->row( 'fc_funnels', $id )['status'] ?? '' ) ? array() : array( 'status' ),
					$record,
					false
				);
				if ( is_wp_error( $t ) ) {
					return $t;
				}
				$out = array( 'funnel_id' => $id, 'status' => $status, 'version' => $this->api->version_of( 'automation', $id ), 'emails' => $t['emails'], 'change_id' => (string) $t['change'] );
				if ( $publish ) {
					$out['triggers']   = $this->api->automation_triggers( $id );
					$out['enrolments'] = $this->api->enrolment_counts( $id );
					$out['note']       = __( 'The triggers are live from the next request on; the FluentCRM processor runs the due enrolments on its next minute pass.', 'emcp-tools' );
				}
				return $out + ( isset( $t['warning'] ) ? array( 'warning' => $t['warning'] ) : array() );
			}
		);
	}

	/** @return array|WP_Error */
	public function set_contact_automation( int $funnel, int $contact, string $action, ?int $sequence, bool $confirm ) {
		if ( ! $this->api->row( 'fc_funnels', $funnel ) ) {
			return self::no_automation( $funnel );
		}
		if ( 'advance' === $action && ! $sequence ) {
			return self::invalid( __( 'advance needs advance_to_sequence_id (a step id from get-automation).', 'emcp-tools' ) );
		}
		if ( 'cancel' !== $action && ! $confirm ) {
			return new WP_Error( 'confirmation_required', __( 'Resuming or advancing a contact makes the next step due, which can send email. Pass confirm:true in arguments to proceed.', 'emcp-tools' ) );
		}
		$find = fn() => array_key_first( $this->api->find( 'fc_funnel_subscribers', array( 'funnel_id' => $funnel, 'subscriber_id' => $contact ) ) );
		if ( null === $find() ) {
			/* translators: 1: contact id, 2: automation id. */
			return new WP_Error( 'not_found', sprintf( __( 'Contact %1$d is not in automation %2$d.', 'emcp-tools' ), $contact, $funnel ), array( 'status' => 404 ) );
		}
		return $this->locked(
			self::lock_order( array( 'automation' => array( $funnel ), 'contact' => array( $contact ) ) ),
			function () use ( $funnel, $contact, $action, $sequence, $find ) {
				$rid = (int) $find();
				$t   = $this->transact(
					array( array( 'enrolment', $rid ) ),
					function () use ( $funnel, $contact, $action, $sequence, $rid ) {
						$in = array( 'funnel_id' => $funnel, 'contact_id' => $contact, 'action' => 'advance' === $action ? 'advance_now' : $action ) + ( 'advance' === $action ? array( 'advance_to_sequence_id' => (int) $sequence ) : array() );
						$r  = $this->api->ability( 'update-contact-automation-status', $in );
						return is_wp_error( $r ) ? $r : array( 'id' => $rid );
					},
					function () use ( $rid, $action, $sequence ) {
						$row  = (array) $this->api->row( 'fc_funnel_subscribers', $rid );
						$want = 'cancel' === $action ? 'cancelled' : 'active';
						$bad  = $want === (string) ( $row['status'] ?? '' ) ? array() : array( 'status' );
						if ( 'advance' === $action && (int) ( $row['next_sequence_id'] ?? 0 ) !== (int) $sequence ) {
							$bad[] = 'next_sequence_id';
						}
						return $bad;
					},
					/* translators: 1: action, 2: contact id, 3: automation id. */
					fn() => EMCP_Tools_FluentCRM_History::record_audit( 'set-contact-automation', 'fluentcrm-automation:' . $funnel, sprintf( __( 'FluentCRM: %1$s for contact #%2$d in automation #%3$d', 'emcp-tools' ), $action, $contact, $funnel ), __( 'Contact moves in an automation cannot be undone: an undo could let FluentCRM send again without your confirm. Move the contact again instead.', 'emcp-tools' ), array( $contact ) ),
					false,
					static fn() => $contact
				);
				if ( is_wp_error( $t ) ) {
					return $t;
				}
				$row  = (array) $this->api->row( 'fc_funnel_subscribers', $rid );
				$step = $this->api->row( 'fc_funnel_sequences', (int) ( $row['next_sequence_id'] ?? 0 ) );
				$at   = (string) ( $row['next_execution_time'] ?? '' );
				return array(
					'funnel_id'           => $funnel,
					'contact_id'          => $contact,
					'status'              => (string) ( $row['status'] ?? '' ),
					'next_step'           => $step ? array( 'id' => (int) $step['id'], 'action' => (string) $step['action_name'], 'type' => (string) ( $step['type'] ?? '' ) ) : null,
					'next_execution_time' => '' !== $at ? $at : null,
					'due_now'             => 'active' === (string) ( $row['status'] ?? '' ) && '' !== $at && $at <= current_time( 'mysql' ),
					'emails'              => $t['emails'],
					'change_id'           => (string) $t['change'],
				);
			}
		);
	}

	// Batch and segment undo (per row).

	/**
	 * A batch undo goes row by row: a contact whose rows changed since (unless force), who opted out
	 * since, or (for a created one) who has real work since is left as it is; the rest are put back,
	 * and an audit entry lists who was skipped.
	 *
	 * @return true|WP_Error
	 */
	protected function undo_batch( array $rb, bool $force ) {
		$befores = (array) ( $rb['before'] ?? array() );
		$created = array_map( 'intval', (array) ( $rb['created_contacts'] ?? array() ) );
		$all     = array_map( static fn( $o ) => (int) $o[1], (array) ( $rb['objects'] ?? array() ) );
		$tables  = array_values( array_map( 'strval', (array) ( $rb['tables'] ?? array() ) ) );
		$keys    = self::lock_order( self::merge_ids( array( 'contact' => $all ), self::refs_in( $befores ) ) );
		return $this->locked(
			$keys,
			function () use ( $rb, $force, $befores, $created, $all, $tables ) {
				$skipped = array();
				$done    = 0;
				foreach ( $all as $id ) {
					$now = $this->api->rows( 'contact', $id );
					if ( in_array( $id, $created, true ) ) {
						$c = $this->api->contact_counts( $id, (int) ( $rb['author'] ?? 0 ) );
						if ( $c['emails'] || $c['automations'] || $c['user_id'] > 0 || $c['notes_by_others'] ) {
							$skipped[] = $id;
							continue;
						}
						$this->api->restore_rows( array(), $now );
						++$done;
						continue;
					}
					if ( ! $force && ! hash_equals( (string) ( $rb['row_hashes'][ $id ] ?? '' ), EMCP_Tools_FluentCRM_Api::version( $now ) ) ) {
						$skipped[] = $id;
						continue;
					}
					$status = (string) ( current( $now['fc_subscribers'] )['status'] ?? '' );
					if ( in_array( 'fc_subscribers', $tables, true ) && in_array( $status, self::SUPPRESSED, true ) && ! in_array( (string) ( $rb['after_status'][ $id ] ?? '' ), self::SUPPRESSED, true ) ) {
						$skipped[] = $id;
						continue;
					}
					$before = self::union( array( (array) ( $befores[ self::ref_key( 'contact', $id ) ] ?? array() ) ), $tables ? $tables : null );
					$here   = self::union( array( $now ), $tables ? $tables : null );
					if ( ! self::list_consent_ok( $before, $here ) ) {
						$skipped[] = $id;
						continue;
					}
					$this->api->restore_rows( $before, $here );
					++$done;
				}
				foreach ( array( 'tags' => 'tag', 'lists' => 'list' ) as $captured => $kind ) {
					$table = 'fc_' . $captured;
					foreach ( (array) ( $rb['inserted'][ $captured ] ?? array() ) as $sid ) {
						if ( $this->api->row( $table, (int) $sid ) && ! $this->members( $kind, array( (int) $sid ) ) ) {
							$this->api->delete_rows( array( $table => array( (int) $sid => array() ) ) );
						}
					}
				}
				if ( $skipped ) {
					/* translators: %s: contact ids. */
					EMCP_Tools_FluentCRM_History::record_undo_note( 'batch-undo-skipped', 'fluentcrm-batch:0', sprintf( __( 'FluentCRM: a batch undo left contacts %s as they are (changed, opted out or in use since)', 'emcp-tools' ), implode( ', ', array_map( static fn( $i ) => '#' . $i, $skipped ) ) ), __( 'These contacts changed, opted out or were used after the batch, so the undo left them alone.', 'emcp-tools' ), $skipped, array( 'skipped' => $skipped ) );
				}
				if ( 0 === $done && $all ) {
					return new WP_Error( 'nothing_undone', __( 'Every contact of this batch changed, opted out or was used since, so nothing was undone.', 'emcp-tools' ), array( 'status' => 409, 'skipped' => $skipped ) );
				}
				return true;
			}
		);
	}

	/** Pivot rows of contacts erased since are left out of a segment restore and reported (spec 4.2). */
	protected static function without_erased( EMCP_Tools_FluentCRM_Api $api, array $befores, array &$skipped ): array {
		foreach ( $befores as $key => $rows ) {
			foreach ( (array) ( $rows['fc_subscriber_pivot'] ?? array() ) as $pid => $p ) {
				if ( ! $api->row( 'fc_subscribers', (int) $p['subscriber_id'] ) ) {
					$skipped[] = (int) $p['subscriber_id'];
					unset( $befores[ $key ]['fc_subscriber_pivot'][ $pid ] );
				}
			}
		}
		$skipped = array_values( array_unique( $skipped ) );
		return $befores;
	}

	// Undo (D13).

	/**
	 * Puts an entry's rows back under the write's leases, after rechecking the after-state (force
	 * skips only this), the blockers and the live constraints a direct restore bypasses.
	 *
	 * @return true|WP_Error
	 */
	public function undo( array $rb, bool $force ) {
		if ( self::$before_undo ) {
			( self::$before_undo )();
		}
		if ( 'fluentcrm-batch' === (string) ( $rb['type'] ?? '' ) ) {
			return $this->undo_batch( $rb, $force );
		}
		if ( 'fluentcrm-campaign' === (string) ( $rb['type'] ?? '' ) && 'scheduled' === (string) ( $rb['mode'] ?? '' ) ) {
			return $this->undo_schedule( $rb, $force );
		}
		$skipped = array();
		if ( 'fluentcrm-segment' === (string) ( $rb['type'] ?? '' ) && in_array( (string) ( $rb['mode'] ?? '' ), array( 'deleted', 'merged' ), true ) ) {
			$rb['before'] = self::without_erased( $this->api, (array) ( $rb['before'] ?? array() ), $skipped );
		}
		$done = $this->undo_rows( $rb, $force );
		if ( true === $done && 'fluentcrm-template' === (string) ( $rb['type'] ?? '' ) && 'deleted' === (string) ( $rb['mode'] ?? '' ) ) {
			$this->reattach( (int) ( $rb['id'] ?? 0 ), array_map( 'intval', (array) ( $rb['attachments'] ?? array() ) ) );
		}
		if ( true === $done && 'fluentcrm-automation' === (string) ( $rb['type'] ?? '' ) ) {
			// The restored status changes which triggers are live, as the FluentCRM status change does.
			$this->api->reset_funnel_indexes();
		}
		if ( true === $done && $skipped ) {
			/* translators: %s: contact ids. */
			EMCP_Tools_FluentCRM_History::record_undo_note( 'segment-undo-skipped', 'fluentcrm-segment:' . (int) ( $rb['id'] ?? 0 ), sprintf( __( 'FluentCRM: a tag or list undo left out contacts %s (erased since)', 'emcp-tools' ), implode( ', ', array_map( static fn( $i ) => '#' . $i, $skipped ) ) ), __( 'These contacts were erased after the change, so the undo could not put them back in.', 'emcp-tools' ), $skipped, array( 'skipped' => $skipped ) );
		}
		return $done;
	}

	/** Attaches a restored template's images again, only those still attached to nothing. */
	protected function reattach( int $template, array $attachments ): void {
		$rows = array();
		foreach ( $attachments as $aid ) {
			$row = $this->api->row( 'posts', $aid );
			if ( $row && 'attachment' === (string) $row['post_type'] && 0 === (int) $row['post_parent'] ) {
				$rows[ $aid ] = array( 'post_parent' => $template ) + $row;
			}
		}
		if ( $rows ) {
			$this->api->restore_rows( array( 'posts' => $rows ) );
		}
	}

	/** @return true|WP_Error */
	protected function undo_rows( array $rb, bool $force ) {
		$objects  = array_map( static fn( $o ) => array( (string) $o[0], (int) $o[1] ), (array) ( $rb['objects'] ?? array() ) );
		$befores  = (array) ( $rb['before'] ?? array() );
		$inserted = (array) ( $rb['inserted'] ?? array() );
		$tables   = array_values( array_map( 'strval', (array) ( $rb['tables'] ?? array() ) ) );
		$keys     = self::lock_order( self::merge_ids( self::ids_of( $objects ), self::refs_in( $befores ), self::refs_in( self::rows_of( $this->api, $objects ) ) ) );
		return $this->locked(
			$keys,
			function () use ( $rb, $force, $objects, $befores, $inserted, $tables ) {
				if ( ! $force && ! hash_equals( (string) ( $rb['after_hash'] ?? '' ), self::state_hash( $this->api, $objects, $inserted ) ) ) {
					return new WP_Error( 'conflict', __( 'This changed after the History entry, so it is not undone.', 'emcp-tools' ), array( 'status' => 409 ) );
				}
				$blocker = EMCP_Tools_FluentCRM_History::blocker( $this->api, $rb );
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

				if ( ! $this->api->restore_rows( $before, $current ) ) {
					return new WP_Error( 'rollback_failed', __( 'FluentCRM\'s earlier rows could not be written back.', 'emcp-tools' ) );
				}
				if ( self::present( $this->api, $inserted ) ) {
					return new WP_Error( 'rollback_failed', __( 'Rows the write added are still there.', 'emcp-tools' ) );
				}
				return true;
			}
		);
	}

	/**
	 * List consent (security review): FluentCRM keeps a per-list status on list memberships
	 * (fc_subscriber_pivot.status). A restore must not write a membership back as anything but
	 * unsubscribed where the contact's current membership of that list says unsubscribed.
	 */
	protected static function list_consent_ok( array $before, array $current ): bool {
		$left = array();
		foreach ( (array) ( $current['fc_subscriber_pivot'] ?? array() ) as $p ) {
			if ( EMCP_Tools_FluentCRM_Api::LISTS === $p['object_type'] && 'unsubscribed' === (string) ( $p['status'] ?? '' ) ) {
				$left[ (int) $p['subscriber_id'] . ':' . (int) $p['object_id'] ] = true;
			}
		}
		foreach ( (array) ( $before['fc_subscriber_pivot'] ?? array() ) as $p ) {
			if ( EMCP_Tools_FluentCRM_Api::LISTS === $p['object_type'] && isset( $left[ (int) $p['subscriber_id'] . ':' . (int) $p['object_id'] ] ) && 'unsubscribed' !== (string) ( $p['status'] ?? '' ) ) {
				return false;
			}
		}
		return true;
	}

	protected static function list_opted_out(): WP_Error {
		return new WP_Error( 'contact_opted_out', __( 'A contact in this change has unsubscribed from one of its lists since, so it is not undone: undo never puts a contact back on a list they left (force does not change this).', 'emcp-tools' ), array( 'status' => 409 ) );
	}

	/**
	 * The live constraints a direct restore bypasses (D13): the tags, lists and contacts restored
	 * rows name still exist, and a restored email is not another contact's now.
	 *
	 * @return true|WP_Error
	 */
	protected function restore_checks( array $before, array $current ) {
		$gone = array();
		foreach ( (array) ( $before['fc_subscriber_pivot'] ?? array() ) as $p ) {
			$contact = (int) $p['subscriber_id'];
			if ( ! isset( $before['fc_subscribers'][ $contact ] ) && ! $this->api->row( 'fc_subscribers', $contact ) ) {
				$gone[] = 'contact:' . $contact;
			}
			$table = EMCP_Tools_FluentCRM_Api::TAG === $p['object_type'] ? 'fc_tags' : ( EMCP_Tools_FluentCRM_Api::LISTS === $p['object_type'] ? 'fc_lists' : '' );
			if ( '' !== $table && ! isset( $before[ $table ][ (int) $p['object_id'] ] ) && ! $this->api->row( $table, (int) $p['object_id'] ) ) {
				$gone[] = ( 'fc_tags' === $table ? 'tag:' : 'list:' ) . (int) $p['object_id'];
			}
		}
		foreach ( array( 'fc_subscriber_meta', 'fc_subscriber_notes' ) as $table ) {
			foreach ( (array) ( $before[ $table ] ?? array() ) as $r ) {
				$contact = (int) $r['subscriber_id'];
				if ( ! isset( $before['fc_subscribers'][ $contact ] ) && ! $this->api->row( 'fc_subscribers', $contact ) ) {
					$gone[] = 'contact:' . $contact;
				}
			}
		}
		if ( $gone ) {
			return new WP_Error( 'linked_unavailable', __( 'A tag, list or contact the earlier rows point at is gone; it is not undone.', 'emcp-tools' ), array( 'status' => 409, 'missing' => array_values( array_unique( $gone ) ) ) );
		}
		foreach ( (array) ( $before['fc_subscribers'] ?? array() ) as $id => $s ) {
			foreach ( $this->api->find( 'fc_subscribers', array( 'email' => (string) $s['email'] ) ) as $other_id => $other ) {
				if ( (int) $other_id !== (int) $id && ! isset( $current['fc_subscribers'][ $other_id ] ) ) {
					return new WP_Error( 'email_exists', __( 'Another FluentCRM contact has taken this email since; it is not undone.', 'emcp-tools' ), array( 'status' => 409 ) );
				}
			}
		}
		return true;
	}
}
