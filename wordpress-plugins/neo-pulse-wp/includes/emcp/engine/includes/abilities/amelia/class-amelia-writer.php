<?php
/**
 * Every Amelia write (spec 4.4): validation (D6), leases in one fixed order (D12), the version
 * check, before-images of every row the write can touch, Amelia's controller run while this
 * process's statements on Amelia's tables are recorded (D7), the read-back (D9), the notification
 * report (D10), reconciliation after a throw, recovery, and History. Undo (D13) takes the write's
 * leases, rechecks the version, the blockers and the live constraints inside them, and puts the
 * rows back in one transaction.
 *
 * An object is [kind, id]: category, service, employee, customer, appointment, event, booking.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_Amelia_Writer {

	const TTL = 60;

	/** Lease order (D12). */
	const ORDER = array( 'category', 'service', 'employee', 'customer', 'event', 'appointment', 'booking' );

	/** Amelia's primary table per kind. */
	const PRIMARY = array( 'category' => 'categories', 'service' => 'services', 'employee' => 'users', 'customer' => 'users', 'appointment' => 'appointments', 'event' => 'events', 'booking' => 'customer_bookings' );

	/** Columns that point at another object, checked before a restore puts them back (D13). */
	const LINKS = array(
		'services'              => array( 'categoryId' => 'categories' ),
		'providers_to_services' => array( 'userId' => 'users', 'serviceId' => 'services' ),
		'appointments'          => array( 'serviceId' => 'services', 'providerId' => 'users' ),
		'customer_bookings'     => array( 'customerId' => 'users' ),
		'events_to_providers'   => array( 'userId' => 'users' ),
	);

	/**
	 * Service fields Amelia Lite forces (DataModifier::serviceFactory(): capacities 1, no buffers,
	 * deposits or hiding) and its ServiceRepository never stores, with the value it keeps (D16).
	 */
	const LITE_SERVICE = array( 'time_before' => 0, 'time_after' => 0, 'deposit' => 0, 'visible' => true, 'min_capacity' => 1, 'max_capacity' => 1 );

	/** @var EMCP_Tools_Lease|null */
	private static $lease = null;

	/** @var callable|null Test seam: runs once every lease is held. */
	public static $on_lease = null;

	/** @var callable|null Test seam: runs as an undo starts, before it takes its leases (D13). */
	public static $before_undo = null;

	/** @var EMCP_Tools_Amelia_Api */
	protected $api;

	/** @var bool Undo mode: no History record of its own. */
	protected $undo;

	/** @var array The objects of the transact() in progress. */
	protected $objects = array();

	/** @var bool The write in progress may message customers (D10). */
	protected $notify = false;

	public function __construct( EMCP_Tools_Amelia_Api $api, bool $undo = false ) {
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
		return 'amelia-' . $kind . '-' . $id;
	}

	/**
	 * Kinds in ORDER, ids ascending, then 'new' kinds (amelia-new-{kind}).
	 *
	 * @param array<string,int[]> $ids_by_kind
	 * @return string[]
	 */
	public static function lock_order( array $ids_by_kind ): array {
		$keys = array();
		foreach ( self::ORDER as $kind ) {
			$ids = array_values( array_unique( array_filter( array_map( 'intval', (array) ( $ids_by_kind[ $kind ] ?? array() ) ) ) ) );
			sort( $ids );
			foreach ( $ids as $id ) {
				$keys[] = self::lease_key( $kind, $id );
			}
		}
		foreach ( array_unique( (array) ( $ids_by_kind['new'] ?? array() ) ) as $kind ) {
			$keys[] = 'amelia-new-' . $kind;
		}
		return $keys;
	}

	/**
	 * Runs $fn holding every lease in $keys, in that order, never waiting.
	 *
	 * @return mixed|WP_Error
	 */
	public function locked( array $keys, callable $fn ) {
		$owner = 'amelia-' . bin2hex( random_bytes( 6 ) );
		$held  = array();
		foreach ( $keys as $key ) {
			if ( ! self::lease()->acquire( $key, $owner, self::TTL ) ) {
				foreach ( array_reverse( $held ) as $h ) {
					self::lease()->release( $h, $owner );
				}
				return new WP_Error( 'amelia_busy', __( 'Another change to this Amelia object, or to one it is linked to, is running. Try again in a moment.', 'emcp-tools' ), array( 'status' => 409, 'lease' => $key ) );
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

	/** @return array<string,array> "kind:id" => rows */
	public static function rows_of( EMCP_Tools_Amelia_Api $api, array $objects ): array {
		$out = array();
		foreach ( $objects as $o ) {
			if ( (int) $o[1] > 0 ) {
				$out[ self::ref_key( (string) $o[0], (int) $o[1] ) ] = $api->rows( (string) $o[0], (int) $o[1] );
			}
		}
		return $out;
	}

	/** The rows of an inserted-ids map that still exist. @return array<string,array<int,array>> */
	public static function present( EMCP_Tools_Amelia_Api $api, array $inserted ): array {
		$out = array();
		foreach ( $inserted as $table => $ids ) {
			$rows = $api->rows_where( (string) $table, 'id', (array) $ids );
			if ( $rows ) {
				$out[ (string) $table ] = $rows;
			}
		}
		return $out;
	}

	/** The state History compares: every object's rows, and the inserted rows still there. */
	public static function state_hash( EMCP_Tools_Amelia_Api $api, array $objects, array $inserted = array() ): string {
		$state = array();
		foreach ( self::rows_of( $api, $objects ) as $k => $rows ) {
			$state[ $k ] = EMCP_Tools_Amelia_Api::strip_volatile( $rows );
		}
		$state['inserted'] = EMCP_Tools_Amelia_Api::strip_volatile( self::present( $api, $inserted ) );
		return EMCP_Tools_Amelia_Api::version( $state );
	}

	/** Every row of several objects' row maps, table => id => row. */
	protected static function union( array $maps, ?array $tables = null ): array {
		$out = array();
		foreach ( $maps as $rows ) {
			foreach ( (array) $rows as $table => $list ) {
				if ( null !== $tables && ! in_array( $table, $tables, true ) ) {
					continue;
				}
				$out[ $table ] = ( $out[ $table ] ?? array() ) + (array) $list;
			}
		}
		return $out;
	}

	/** The objects rows point at, by kind, for the leases of an undo. @return array<string,int[]> */
	protected static function refs_in( array $maps ): array {
		$out = array();
		foreach ( self::union( $maps ) as $table => $rows ) {
			foreach ( $rows as $id => $r ) {
				switch ( $table ) {
					case 'users':
						$out[ 'provider' === ( $r['type'] ?? '' ) ? 'employee' : 'customer' ][] = (int) $id;
						break;
					case 'services':
						$out['service'][]  = (int) $id;
						$out['category'][] = (int) $r['categoryId'];
						break;
					case 'providers_to_services':
						$out['employee'][] = (int) $r['userId'];
						$out['service'][]  = (int) $r['serviceId'];
						break;
					case 'appointments':
						$out['appointment'][] = (int) $id;
						$out['service'][]     = (int) $r['serviceId'];
						$out['employee'][]    = (int) $r['providerId'];
						break;
					case 'customer_bookings':
						$out['customer'][] = (int) $r['customerId'];
						break;
					case 'events':
						$out['event'][] = (int) $id;
						break;
					case 'events_to_providers':
						$out['employee'][] = (int) $r['userId'];
						break;
					case 'categories':
						$out['category'][] = (int) $id;
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

	/** @return array<string,int[]> */
	protected static function ids_of( array $objects ): array {
		$out = array();
		foreach ( $objects as $o ) {
			$out[ (string) $o[0] ][] = (int) $o[1];
		}
		return $out;
	}

	// The write template (D7, D9).

	/**
	 * @param array    $objects [kind, id] pairs the write may change (id 0 for the one it creates).
	 * @param callable $do      Runs Amelia; returns ['id' => int, ...] or a WP_Error.
	 * @param callable $verify  ( int $id ) => string[] fields that differ, or a WP_Error.
	 * @param callable $record  ( array $result, array $befores, array $captured, array $notified ) => change id.
	 * @param string|callable $primary The table whose first insert is the object a create made, or
	 *                                 ( array $captured ) => that object's id.
	 * @return array|WP_Error {result, change, notified, captured, warning?}
	 */
	protected function transact( array $objects, callable $do, callable $verify, callable $record, $primary = '' ) {
		$this->objects = $objects;
		$befores       = self::rows_of( $this->api, $objects );
		$mark          = $this->api->notification_mark();
		$run           = $this->notify ? $do : fn() => $this->api->hold_customer_messages( $do );
		$cap           = $this->api->capture( $run );
		$notified      = $this->api->notifications_since( $mark );
		if ( $cap['error'] ) {
			return $this->reconcile( $befores, $cap, $verify, $record, $primary, $notified );
		}
		$result = (array) $cap['result'];
		if ( empty( $result['id'] ) && is_callable( $primary ) ) {
			$result['id'] = (int) $primary( $cap );
		}
		$bad = $verify( (int) ( $result['id'] ?? 0 ) );
		if ( is_wp_error( $bad ) ) {
			return $this->fail( $bad->get_error_code(), $bad->get_error_message(), $befores, $cap, (array) $bad->get_error_data() + array( 'notified' => $notified ) );
		}
		if ( $bad ) {
			return $this->fail( 'save_incomplete', __( 'Amelia did not store the change as written; it was put back.', 'emcp-tools' ), $befores, $cap, array( 'fields' => array_values( $bad ), 'notified' => $notified ) );
		}
		if ( $this->undo ) {
			return array( 'result' => $result, 'change' => '', 'notified' => $notified, 'captured' => $cap );
		}
		$change = (string) $record( $result, $befores, $cap, $notified );
		if ( '' === $change ) {
			return $this->fail( 'history_unavailable', __( 'History could not record this change, so it was put back.', 'emcp-tools' ), $befores, $cap, array( 'notified' => $notified ) );
		}
		return array( 'result' => $result, 'change' => $change, 'notified' => $notified, 'captured' => $cap );
	}

	/**
	 * D7 after a throw or an Amelia refusal: only rows this process wrote during the call are its.
	 *
	 * @return array|WP_Error
	 */
	protected function reconcile( array $befores, array $cap, callable $verify, callable $record, $primary, array $notified ) {
		$error = $cap['error'];
		if ( $cap['uncertain'] ) {
			$change = $this->undo ? '' : EMCP_Tools_Amelia_History::record_uncertain( $cap['uncertain'], $error->get_error_message() );
			return new WP_Error( 'amelia_error', __( 'Amelia stopped half way and EMCP could not tell which rows it wrote, so it changed nothing. Check the tables named here in Amelia.', 'emcp-tools' ), array( 'attribution_uncertain' => true, 'tables' => $cap['uncertain'], 'notified' => $notified, 'change_id' => $change, 'cause' => $error->get_error_message() ) );
		}
		if ( ! $cap['inserted'] && ! $cap['updated'] && ! $cap['deleted'] ) {
			return new WP_Error( $error->get_error_code(), $error->get_error_message(), array_merge( (array) $error->get_error_data(), array( 'notified' => $notified ) ) );
		}
		$id = 0;
		if ( is_callable( $primary ) ) {
			$id = (int) $primary( $cap );
		} elseif ( '' !== $primary && ! empty( $cap['inserted'][ $primary ] ) ) {
			$id = (int) $cap['inserted'][ $primary ][0];
		} elseif ( isset( $this->objects[0][1] ) && (int) $this->objects[0][1] > 0 ) {
			$id = (int) $this->objects[0][1];
		}
		$bad = $id > 0 ? $verify( $id ) : array( 'unknown' );
		if ( ! is_wp_error( $bad ) && ! $bad && ! $this->undo && 'amelia_error' === $error->get_error_code() ) {
			$change = (string) $record( array( 'id' => $id ), $befores, $cap, $notified );
			if ( '' !== $change ) {
				return array( 'result' => array( 'id' => $id ), 'change' => $change, 'notified' => $notified, 'captured' => $cap, 'warning' => array( 'code' => 'amelia_after_save_error', 'message' => $error->get_error_message() ) );
			}
		}
		$left = $this->recover( $befores, $cap );
		if ( ! $left ) {
			return new WP_Error( $error->get_error_code(), $error->get_error_message(), array_merge( (array) $error->get_error_data(), array( 'recovered' => true, 'notified' => $notified ) ) );
		}
		return $this->partial( $befores, $cap, $left, $error->get_error_code(), array( 'notified' => $notified ) );
	}

	/**
	 * Puts back the rows the call updated or deleted (from the before-images) and deletes the
	 * rows it inserted; nothing else.
	 *
	 * @return string[] "table:id" still different
	 */
	protected function recover( array $befores, array $cap ): array {
		$tables   = array_values( array_unique( array_merge( (array) $cap['updated'], (array) $cap['deleted'] ) ) );
		$before   = self::union( $befores, $tables );
		$inserted = self::present( $this->api, (array) $cap['inserted'] );
		if ( $before || $inserted ) {
			$this->api->restore_rows( $before, $inserted );
		}
		$left = array();
		foreach ( $before as $table => $rows ) {
			foreach ( $rows as $id => $row ) {
				if ( $this->api->row( $table, (int) $id ) !== $row ) {
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
		$change = $this->undo ? '' : EMCP_Tools_Amelia_History::record_recovery( $this->objects, $befores, $cap, $left );
		return new WP_Error( 'partial_write', __( 'Amelia stopped half way and EMCP could not put everything back. History holds the earlier rows; undo the entry there once the cause is fixed.', 'emcp-tools' ), array( 'rows' => $left, 'change_id' => $change, 'cause' => $cause, 'status' => 500 ) + $data );
	}

	// Checks.

	/** @return true|WP_Error */
	protected static function version_check( string $current, ?string $given, bool $force, string $read ) {
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

	/**
	 * Text compared as text (Review Focus 5): entities decoded, tags dropped with their text kept
	 * (Amelia runs wp_kses() on text fields, which keeps a removed tag's text), spaces collapsed.
	 */
	public static function text( $v ): string {
		$s = html_entity_decode( (string) $v, ENT_QUOTES, 'UTF-8' );
		$s = (string) preg_replace( '/<!--.*?-->/s', ' ', $s );
		return trim( (string) preg_replace( '/\s+/u', ' ', strip_tags( $s ) ) );
	}

	/**
	 * The sent scalar fields the stored view does not match: numbers numerically (Review Focus 4),
	 * booleans as booleans, the rest as text (Review Focus 5). Arrays are checked by their writes.
	 *
	 * @return string[]
	 */
	public static function mismatches( array $sent, array $stored ): array {
		$bad = array();
		foreach ( $sent as $k => $v ) {
			if ( ! array_key_exists( $k, $stored ) || is_array( $v ) ) {
				continue;
			}
			$h = $stored[ $k ];
			if ( is_bool( $v ) ) {
				$ok = (bool) $h === $v;
			} elseif ( is_int( $v ) || is_float( $v ) ) {
				$ok = is_numeric( $h ) && abs( (float) $h - (float) $v ) < 0.000001;
			} else {
				$ok = self::text( $v ) === self::text( $h );
			}
			if ( ! $ok ) {
				$bad[] = (string) $k;
			}
		}
		return $bad;
	}

	protected static function invalid( string $message, array $data = array() ): WP_Error {
		return new WP_Error( 'invalid_argument', $message, $data );
	}

	protected static function color_ok( array $f ): bool {
		return ! array_key_exists( 'color', $f ) || (bool) preg_match( '/^#[0-9a-fA-F]{6}$/', (string) $f['color'] );
	}

	protected static function hm_ok( $s ): bool {
		return is_string( $s ) && (bool) preg_match( '/^([01]\d|2[0-3]):[0-5]\d$/', $s );
	}

	protected static function date_ok( $s ): bool {
		if ( ! is_string( $s ) || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $s ) ) {
			return false;
		}
		$d = DateTime::createFromFormat( '!Y-m-d', $s );
		return $d && $d->format( 'Y-m-d' ) === $s;
	}

	/** @return true|WP_Error */
	public static function validate_category( array $f, bool $create ) {
		if ( ( $create || array_key_exists( 'name', $f ) ) && '' === trim( (string) ( $f['name'] ?? '' ) ) ) {
			return self::invalid( __( 'name must not be empty.', 'emcp-tools' ) );
		}
		return self::color_ok( $f ) ? true : self::invalid( __( 'color must be #rrggbb.', 'emcp-tools' ) );
	}

	/**
	 * employees or services: ids, or {id, price, min_capacity, max_capacity}.
	 *
	 * @return array<int,array{price: ?float, min: ?int, max: ?int}>|WP_Error
	 */
	public static function link_list( $list, string $field ) {
		$out = array();
		foreach ( (array) $list as $one ) {
			$one = is_array( $one ) ? $one : array( 'id' => $one );
			$id  = EMCP_Tools_Op_Args::coerce( 'int', $one['id'] ?? null );
			if ( is_wp_error( $id ) || array_diff( array_keys( $one ), array( 'id', 'price', 'min_capacity', 'max_capacity' ) ) ) {
				/* translators: %s: argument. */
				return self::invalid( sprintf( __( '%s must be ids, or {id, price, min_capacity, max_capacity}.', 'emcp-tools' ), $field ) );
			}
			$price = array_key_exists( 'price', $one ) ? EMCP_Tools_Op_Args::coerce( 'number', $one['price'] ) : null;
			$min   = array_key_exists( 'min_capacity', $one ) ? EMCP_Tools_Op_Args::coerce( 'int', $one['min_capacity'] ) : null;
			$max   = array_key_exists( 'max_capacity', $one ) ? EMCP_Tools_Op_Args::coerce( 'int', $one['max_capacity'] ) : null;
			if ( is_wp_error( $price ) || is_wp_error( $min ) || is_wp_error( $max ) || ( null !== $min && null !== $max && $min > $max ) ) {
				/* translators: %s: argument. */
				return self::invalid( sprintf( __( 'In %s, price must not be negative and min_capacity must not exceed max_capacity.', 'emcp-tools' ), $field ) );
			}
			$out[ (int) $id ] = array( 'price' => null === $price ? null : (float) $price, 'min' => $min, 'max' => $max );
		}
		return $out;
	}

	/** @return true|WP_Error */
	protected function validate_service( array $f, ?array $stored ) {
		$create = null === $stored;
		if ( ( $create || array_key_exists( 'name', $f ) ) && '' === trim( (string) ( $f['name'] ?? '' ) ) ) {
			return self::invalid( __( 'name must not be empty.', 'emcp-tools' ) );
		}
		if ( isset( $f['category_id'] ) && ! $this->api->row( 'categories', (int) $f['category_id'] ) ) {
			/* translators: %d: category id. */
			return new WP_Error( 'not_found', sprintf( __( 'There is no Amelia category %d.', 'emcp-tools' ), (int) $f['category_id'] ), array( 'status' => 404 ) );
		}
		$min = (int) ( $f['min_capacity'] ?? ( $stored['min_capacity'] ?? 1 ) );
		$max = (int) ( $f['max_capacity'] ?? ( $stored['max_capacity'] ?? max( 1, $min ) ) );
		if ( $min > $max ) {
			return self::invalid( __( 'min_capacity must not exceed max_capacity.', 'emcp-tools' ) );
		}
		if ( ! self::color_ok( $f ) ) {
			return self::invalid( __( 'color must be #rrggbb.', 'emcp-tools' ) );
		}
		if ( array_key_exists( 'employees', $f ) ) {
			$list = self::link_list( $f['employees'], 'employees' );
			if ( is_wp_error( $list ) ) {
				return $list;
			}
			foreach ( array_keys( $list ) as $u ) {
				$row = $this->api->row( 'users', $u );
				if ( ! $row || 'provider' !== $row['type'] ) {
					/* translators: %d: id. */
					return self::invalid( sprintf( __( '%d is not an Amelia employee.', 'emcp-tools' ), $u ) );
				}
			}
			$lite = $this->lite_employees( array_keys( $list ) );
			if ( is_wp_error( $lite ) ) {
				return $lite;
			}
		}
		if ( 'Lite' === $this->api->edition() ) {
			$keep = self::LITE_SERVICE;
			$bad  = array();
			foreach ( $keep as $k => $v ) {
				if ( array_key_exists( $k, $f ) && ( is_bool( $v ) ? (bool) $f[ $k ] !== $v : abs( (float) $f[ $k ] - (float) $v ) > 0.000001 ) ) {
					$bad[] = $k;
				}
			}
			if ( $bad ) {
				return new WP_Error( 'not_in_lite', __( 'Amelia Lite does not store these service fields (buffer times, deposits, hiding, capacities above one); its premium editions do.', 'emcp-tools' ), array( 'status' => 409, 'fields' => $bad ) );
			}
		}
		return true;
	}

	/** @return true|WP_Error */
	/**
	 * Amelia Lite schedules and books one employee only, its first that is not disabled
	 * (ProviderRepository::applyLiteLicenseRestriction()): any other employee is invisible to its
	 * updates, slots and bookings, so EMCP refuses to use one there (D16).
	 *
	 * @param int[] $ids employees a write would use.
	 * @return true|WP_Error
	 */
	protected function lite_employees( array $ids ) {
		if ( 'Lite' !== $this->api->edition() ) {
			return true;
		}
		$lite = $this->api->lite_employee();
		$bad  = array_values( array_filter( array_map( 'intval', $ids ), static fn( $u ) => $u !== $lite ) );
		if ( $bad ) {
			/* translators: %d: the employee id. */
			return new WP_Error( 'not_in_lite', sprintf( __( 'Amelia Lite works with one employee only, its first (here %d); the others cannot be scheduled or booked. Amelia\'s premium editions take more employees.', 'emcp-tools' ), $lite ), array( 'status' => 409, 'employees' => $bad, 'lite_employee' => $lite ) );
		}
		return true;
	}

	protected function validate_person( array $f, bool $create, string $kind, int $id ) {
		if ( 'employee' === $kind && $create && 'Lite' === $this->api->edition() && $this->api->lite_employee() > 0 ) {
			return new WP_Error( 'not_in_lite', __( 'Amelia Lite works with one employee only, and it has one; Amelia\'s premium editions take more employees.', 'emcp-tools' ), array( 'status' => 409, 'lite_employee' => $this->api->lite_employee() ) );
		}
		foreach ( array( 'first_name', 'last_name' ) as $k ) {
			if ( ( $create || array_key_exists( $k, $f ) ) && '' === trim( (string) ( $f[ $k ] ?? '' ) ) ) {
				/* translators: %s: argument. */
				return self::invalid( sprintf( __( '%s must not be empty.', 'emcp-tools' ), $k ) );
			}
		}
		if ( array_key_exists( 'email', $f ) ) {
			$email = trim( (string) $f['email'] );
			if ( ( '' !== $email || 'employee' === $kind ) && ! is_email( $email ) ) {
				return self::invalid( __( 'email must be a valid email address.', 'emcp-tools' ) );
			}
			$holder = '' === $email ? 0 : $this->api->user_by_email( $email );
			if ( $holder && $holder !== $id ) {
				return new WP_Error( 'email_exists', __( 'Another Amelia employee or customer has this email.', 'emcp-tools' ), array( 'status' => 409 ) );
			}
		}
		if ( isset( $f['birthday'] ) && '' !== $f['birthday'] && ! self::date_ok( $f['birthday'] ) ) {
			return self::invalid( __( 'birthday must be Y-m-d.', 'emcp-tools' ) );
		}
		if ( array_key_exists( 'services', $f ) ) {
			$list = self::link_list( $f['services'], 'services' );
			if ( is_wp_error( $list ) ) {
				return $list;
			}
			foreach ( array_keys( $list ) as $sid ) {
				if ( ! $this->api->row( 'services', $sid ) ) {
					/* translators: %d: id. */
					return self::invalid( sprintf( __( '%d is not an Amelia service.', 'emcp-tools' ), $sid ) );
				}
			}
		}
		return true;
	}

	/**
	 * Review Focus 3: days monday to sunday once each, start before end (H:i), breaks inside the
	 * day and not overlapping.
	 *
	 * @return array|WP_Error Amelia's weekDayList
	 */
	public static function week_list( array $week ) {
		$index = array_flip( EMCP_Tools_Amelia_Integration::DAYS );
		$out   = array();
		foreach ( $week as $d ) {
			if ( ! is_array( $d ) || ! isset( $index[ $d['day'] ?? '' ] ) || ! self::hm_ok( $d['start'] ?? null ) || ! self::hm_ok( $d['end'] ?? null ) || $d['start'] >= $d['end'] ) {
				return self::invalid( __( 'week must be days {day (monday to sunday), start, end (H:i), breaks}, each starting before it ends.', 'emcp-tools' ) );
			}
			$i = $index[ $d['day'] ];
			if ( isset( $out[ $i ] ) ) {
				return self::invalid( __( 'Each day may appear once in week.', 'emcp-tools' ) );
			}
			$breaks = array();
			foreach ( (array) ( $d['breaks'] ?? array() ) as $b ) {
				if ( ! is_array( $b ) || ! self::hm_ok( $b['start'] ?? null ) || ! self::hm_ok( $b['end'] ?? null ) || $b['start'] >= $b['end'] || $b['start'] < $d['start'] || $b['end'] > $d['end'] ) {
					return self::invalid( __( 'Each break needs start before end (H:i), inside its day.', 'emcp-tools' ) );
				}
				$breaks[] = array( 'startTime' => $b['start'] . ':00', 'endTime' => $b['end'] . ':00' );
			}
			usort( $breaks, static fn( $a, $b ) => strcmp( $a['startTime'], $b['startTime'] ) );
			for ( $k = 1; $k < count( $breaks ); $k++ ) {
				if ( $breaks[ $k ]['startTime'] < $breaks[ $k - 1 ]['endTime'] ) {
					return self::invalid( __( 'Breaks must not overlap.', 'emcp-tools' ) );
				}
			}
			$out[ $i ] = array(
				'dayIndex'    => $i,
				'startTime'   => $d['start'] . ':00',
				'endTime'     => $d['end'] . ':00',
				'timeOutList' => $breaks,
				'periodList'  => array( array( 'startTime' => $d['start'] . ':00', 'endTime' => $d['end'] . ':00', 'serviceIds' => array(), 'locationId' => null, 'periodServiceList' => array(), 'periodLocationList' => array() ) ),
			);
		}
		ksort( $out );
		return array_values( $out );
	}

	/** @return array|WP_Error Amelia's dayOffList */
	public static function days_off_list( array $list ) {
		$out = array();
		foreach ( $list as $d ) {
			if ( ! is_array( $d ) || '' === trim( (string) ( $d['name'] ?? '' ) ) || ! self::date_ok( $d['start'] ?? null ) || ! self::date_ok( $d['end'] ?? null ) || $d['end'] < $d['start'] || ( isset( $d['repeat'] ) && ! is_bool( $d['repeat'] ) ) ) {
				return self::invalid( __( 'days_off must be {name, start, end (Y-m-d), repeat (true or false)}, ending on or after the start.', 'emcp-tools' ) );
			}
			$out[] = array( 'name' => trim( (string) $d['name'] ), 'startDate' => $d['start'], 'endDate' => $d['end'], 'repeat' => ! empty( $d['repeat'] ) ? 1 : 0 );
		}
		return $out;
	}

	// The generic write.

	/** The view of an object now (null when gone). */
	public function view( string $kind, int $id ): ?array {
		$fn = $kind . '_view';
		return method_exists( 'EMCP_Tools_Amelia_Integration', $fn ) ? EMCP_Tools_Amelia_Integration::$fn( $this->api, $id ) : null;
	}

	protected static function read_op( string $kind ): string {
		return 'category' === $kind ? 'list-categories' : ( 'booking' === $kind ? 'list-event-bookings or get-appointment' : 'get-' . $kind );
	}

	/**
	 * One write: leases, the version (an existing object), validation again inside the leases,
	 * transact(), the answer.
	 *
	 * @param array $w {kind, id, op, objects, keys, version, force, validate, do, verify, primary}
	 * @return array|WP_Error
	 */
	protected function write( array $w ) {
		$ok = ( $w['validate'] )();
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$kind         = (string) $w['kind'];
		$id           = (int) ( $w['id'] ?? 0 );
		$this->notify = ! empty( $w['notify'] );
		return $this->locked(
			$w['keys'],
			function () use ( $w, $kind, $id ) {
				if ( $id > 0 ) {
					$v = $this->view( $kind, $id );
					if ( ! $v ) {
						/* translators: 1: kind, 2: id. */
						return new WP_Error( 'not_found', sprintf( __( 'There is no Amelia %1$s %2$d.', 'emcp-tools' ), $kind, $id ), array( 'status' => 404 ) );
					}
					$check = self::version_check( (string) $v['version'], $w['version'] ?? null, ! empty( $w['force'] ), self::read_op( $kind ) );
					if ( is_wp_error( $check ) ) {
						return $check;
					}
				}
				$ok = ( $w['validate'] )();
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$objects = $w['objects'];
				$t       = $this->transact(
					$objects,
					$w['do'],
					$w['verify'],
					function ( array $result, array $befores, array $cap, array $notified ) use ( $w, $kind, $objects, $id ) {
						$new     = (int) $result['id'];
						$existed = $id > 0 || isset( $befores[ self::ref_key( $kind, $new ) ] );
						foreach ( $objects as $i => $o ) {
							if ( $o[0] === $kind && 0 === (int) $o[1] ) {
								if ( $existed ) {
									unset( $objects[ $i ] ); // a group booking joined an object that was there (D11)
								} else {
									$objects[ $i ][1]                        = $new;
									$befores[ self::ref_key( $kind, $new ) ] = array();
								}
							}
						}
						return EMCP_Tools_Amelia_History::record_write( $kind, $existed ? ( $w['mode'] ?? 'edit' ) : 'created', (string) $w['op'], $new, array_values( $objects ), $befores, $cap, $notified );
					},
					$w['primary'] ?? ''
				);
				if ( is_wp_error( $t ) ) {
					return $t;
				}
				return $this->answer( $kind, (int) $t['result']['id'], $t, $w['extra'] ?? null );
			}
		);
	}

	protected function answer( string $kind, int $id, array $t, ?callable $extra = null ): array {
		$v   = $this->view( $kind, $id );
		$out = array(
			'id'       => $id,
			'version'  => $v ? (string) $v['version'] : '',
			'notified' => array_values( array_map( static fn( $n ) => array( 'recipient' => $n['recipient'], 'channel' => $n['channel'] ), (array) $t['notified'] ) ),
			'change'   => array( 'change_id' => (string) $t['change'], 'undo' => array( 'available' => '' !== (string) $t['change'] ) ),
		);
		if ( isset( $t['warning'] ) ) {
			$out['warning'] = $t['warning'];
		}
		return $extra ? $extra( $out, $v, $t ) : $out;
	}

	/** The id a controller answered, or a WP_Error. */
	protected static function id_from( $data, string $entity ) {
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$id = (int) ( $data[ $entity ]['id'] ?? ( $data[ $entity . 's' ][0]['id'] ?? 0 ) );
		return $id > 0 ? array( 'id' => $id ) : new WP_Error( 'amelia_error', __( 'Amelia answered without the new id.', 'emcp-tools' ) );
	}

	/** Amelia's stored entity from its get controller (D8). @return array|WP_Error */
	protected function entity( string $controller, string $key, int $id ) {
		$r = $this->api->call( $controller, array(), array( 'id' => $id ), 'GET' );
		if ( is_wp_error( $r ) ) {
			return $r;
		}
		return isset( $r[ $key ] ) && is_array( $r[ $key ] ) ? $r[ $key ] : new WP_Error( 'amelia_error', __( 'Amelia answered without the stored object.', 'emcp-tools' ) );
	}

	// Categories (spec 4.2).

	/** @return array|WP_Error */
	public function create_category( array $f ) {
		$sent = array_intersect_key( $f, array( 'name' => 1, 'color' => 1, 'position' => 1 ) );
		return $this->write(
			array(
				'kind'     => 'category',
				'op'       => 'create-category',
				'objects'  => array( array( 'category', 0 ) ),
				'keys'     => self::lock_order( array( 'new' => array( 'category' ) ) ),
				'validate' => fn() => self::validate_category( $f, true ),
				'primary'  => 'categories',
				'do'       => fn() => self::id_from(
					$this->api->call(
						'add-category',
						array(
							'name'     => trim( (string) $f['name'] ),
							'status'   => 'visible',
							'color'    => (string) ( $f['color'] ?? '#1788FB' ),
							'position' => (int) ( $f['position'] ?? ( count( $this->api->category_ids() ) + 1 ) ),
						)
					),
					'category'
				),
				'verify'   => fn( int $id ) => self::mismatches( $sent, (array) $this->view( 'category', $id ) ),
			)
		);
	}

	/** @return array|WP_Error */
	public function update_category( int $id, ?string $version, bool $force, array $changes ) {
		if ( ! $changes ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		return $this->write(
			array(
				'kind'     => 'category',
				'id'       => $id,
				'op'       => 'update-category',
				'version'  => $version,
				'force'    => $force,
				'objects'  => array( array( 'category', $id ) ),
				'keys'     => self::lock_order( array( 'category' => array( $id ) ) ),
				'validate' => fn() => self::validate_category( $changes, false ),
				'do'       => function () use ( $id, $changes ) {
					$row = (array) $this->api->row( 'categories', $id );
					$r   = $this->api->call(
						'update-category',
						array(
							'status'           => (string) $row['status'],
							'name'             => array_key_exists( 'name', $changes ) ? trim( (string) $changes['name'] ) : (string) $row['name'],
							'position'         => (int) ( $changes['position'] ?? $row['position'] ),
							'color'            => (string) ( $changes['color'] ?? $row['color'] ),
							'translations'     => $row['translations'],
							'pictureFullPath'  => $row['pictureFullPath'],
							'pictureThumbPath' => $row['pictureThumbPath'],
						),
						array( 'id' => $id )
					);
					return is_wp_error( $r ) ? $r : array( 'id' => $id );
				},
				'verify'   => fn( int $x ) => self::mismatches( $changes, (array) $this->view( 'category', $id ) ),
			)
		);
	}

	// Services (spec 4.2, D8, D12).

	/** EMCP service fields as Amelia's. */
	protected static function service_params( array $f ): array {
		$out = array();
		$map = array( 'name' => 'name', 'category_id' => 'categoryId', 'description' => 'description', 'price' => 'price', 'min_capacity' => 'minCapacity', 'max_capacity' => 'maxCapacity', 'color' => 'color' );
		foreach ( $map as $k => $a ) {
			if ( array_key_exists( $k, $f ) ) {
				$out[ $a ] = 'name' === $k ? trim( (string) $f[ $k ] ) : $f[ $k ];
			}
		}
		foreach ( array( 'duration' => 'duration', 'time_before' => 'timeBefore', 'time_after' => 'timeAfter' ) as $k => $a ) {
			if ( array_key_exists( $k, $f ) ) {
				$out[ $a ] = EMCP_Tools_Amelia_Api::to_seconds( (int) $f[ $k ] );
			}
		}
		if ( array_key_exists( 'deposit', $f ) ) {
			$out['depositPayment'] = (float) $f['deposit'] > 0 ? 'fixed' : 'disabled';
			$out['deposit']        = (float) $f['deposit'];
		}
		if ( array_key_exists( 'visible', $f ) ) {
			$out['show'] = (bool) $f['visible'];
		}
		return $out;
	}

	/** Employees linked to a service now. @return int[] */
	protected function service_employees( int $sid ): array {
		return array_values( array_unique( array_map( 'intval', array_column( $this->api->rows_where( 'providers_to_services', 'serviceId', array( $sid ) ), 'userId' ) ) ) );
	}

	/**
	 * Gives employees their own price or capacity for a service through Amelia's employee update
	 * (the per-employee copy, spike item 10).
	 *
	 * @param array<int,array> $links employee id => {price, min, max}
	 * @return true|WP_Error
	 */
	protected function own_terms( int $sid, array $links ) {
		foreach ( $links as $u => $t ) {
			if ( null === $t['price'] && null === $t['min'] && null === $t['max'] ) {
				continue;
			}
			$user = $this->entity( 'get-employee', 'user', (int) $u );
			if ( is_wp_error( $user ) ) {
				return $user;
			}
			$list = array();
			foreach ( (array) ( $user['serviceList'] ?? array() ) as $s ) {
				if ( (int) $s['id'] === $sid ) {
					$s = array_merge( $s, array_filter( array( 'price' => $t['price'], 'minCapacity' => $t['min'], 'maxCapacity' => $t['max'] ), static fn( $v ) => null !== $v ) );
				}
				$list[] = $s;
			}
			$r = $this->api->call( 'update-employee', array_merge( $this->stored_profile( (int) $u ), array( 'serviceList' => $list ) ), array( 'id' => (int) $u ) );
			if ( is_wp_error( $r ) ) {
				return $r;
			}
		}
		return true;
	}

	/**
	 * The service read back: scalar fields, the employee set, the own terms asked for, and the
	 * employees' own prices left alone unless pushed to all (D9).
	 *
	 * @return string[]
	 */
	protected function verify_service( int $id, array $f, array $prices_before, bool $global ): array {
		$v = $this->view( 'service', $id );
		if ( ! $v ) {
			return array( 'service' );
		}
		$bad   = self::mismatches( array_diff_key( $f, array( 'employees' => 1, 'apply_to_employees' => 1 ) ), $v );
		$have  = array();
		foreach ( $v['employees'] as $e ) {
			$have[ $e['id'] ] = $e;
		}
		$links = array_key_exists( 'employees', $f ) ? (array) self::link_list( $f['employees'], 'employees' ) : null;
		if ( null !== $links && array_keys( $links ) != array_keys( $have ) ) {
			$bad[] = 'employees';
		}
		foreach ( $have as $u => $e ) {
			$t    = $links[ $u ] ?? array( 'price' => null, 'min' => null, 'max' => null );
			$want = null !== $t['price'] ? $t['price'] : ( $global || ! isset( $prices_before[ $u ] ) ? (float) $v['price'] : $prices_before[ $u ] );
			if ( abs( $e['price'] - $want ) > 0.000001 || ( null !== $t['min'] && $e['min_capacity'] !== $t['min'] ) || ( null !== $t['max'] && $e['max_capacity'] !== $t['max'] ) ) {
				$bad[] = 'employees';
			}
		}
		return array_values( array_unique( $bad ) );
	}

	/** @return array|WP_Error */
	public function create_service( array $f ) {
		$links = array_key_exists( 'employees', $f ) ? self::link_list( $f['employees'], 'employees' ) : array();
		if ( is_wp_error( $links ) ) {
			return $links;
		}
		$objects = array( array( 'service', 0 ) );
		foreach ( array_keys( $links ) as $u ) {
			$objects[] = array( 'employee', $u );
		}
		return $this->write(
			array(
				'kind'     => 'service',
				'op'       => 'create-service',
				'objects'  => $objects,
				'keys'     => self::lock_order( array( 'category' => array( (int) $f['category_id'] ), 'employee' => array_keys( $links ), 'new' => array( 'service' ) ) ),
				'validate' => fn() => $this->validate_service( $f, null ),
				'primary'  => 'services',
				'do'       => function () use ( $f, $links ) {
					$min    = (int) ( $f['min_capacity'] ?? 1 );
					$params = self::service_params( $f ) + array(
						'description'      => '',
						'minCapacity'      => $min,
						'maxCapacity'      => (int) ( $f['max_capacity'] ?? max( 1, $min ) ),
						'providers'        => array_keys( $links ),
						'color'            => '#1788FB',
						'status'           => 'visible',
						'show'             => true,
						'depositPayment'   => 'disabled',
						'deposit'          => 0,
						'recurringCycle'   => 'disabled',
						'recurringSub'     => 'future',
						'recurringPayment' => 0,
					);
					$r      = self::id_from( $this->api->call( 'add-service', $params ), 'service' );
					if ( is_wp_error( $r ) ) {
						return $r;
					}
					$own = $this->own_terms( (int) $r['id'], $links );
					return is_wp_error( $own ) ? $own : $r;
				},
				'verify'   => fn( int $id ) => $this->verify_service( $id, $f, array(), false ),
			)
		);
	}

	/** @return array|WP_Error */
	public function update_service( int $id, ?string $version, bool $force, array $changes ) {
		if ( ! $changes ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		$stored = $this->view( 'service', $id );
		if ( ! $stored ) {
			/* translators: %d: id. */
			return new WP_Error( 'not_found', sprintf( __( 'There is no Amelia service %d.', 'emcp-tools' ), $id ), array( 'status' => 404 ) );
		}
		$links = array_key_exists( 'employees', $changes ) ? self::link_list( $changes['employees'], 'employees' ) : null;
		if ( is_wp_error( $links ) ) {
			return $links;
		}
		$global    = ! empty( $changes['apply_to_employees'] );
		$employees = array_values( array_unique( array_merge( $this->service_employees( $id ), null === $links ? array() : array_keys( $links ) ) ) );
		$objects   = array( array( 'service', $id ) );
		foreach ( $employees as $u ) {
			$objects[] = array( 'employee', $u );
		}
		$prices = array();
		foreach ( $stored['employees'] as $e ) {
			$prices[ $e['id'] ] = $e['price'];
		}
		$fields = array_diff_key( $changes, array( 'apply_to_employees' => 1 ) );
		return $this->write(
			array(
				'kind'     => 'service',
				'id'       => $id,
				'op'       => 'update-service',
				'version'  => $version,
				'force'    => $force,
				'objects'  => $objects,
				'keys'     => self::lock_order( array( 'category' => array( $stored['category_id'], (int) ( $changes['category_id'] ?? 0 ) ), 'service' => array( $id ), 'employee' => $employees ) ),
				'validate' => fn() => $this->validate_service( $fields, (array) $this->view( 'service', $id ) ),
				'do'       => function () use ( $id, $fields, $links, $global ) {
					$entity = $this->entity( 'get-service', 'service', $id );
					if ( is_wp_error( $entity ) ) {
						return $entity;
					}
					$params = array_merge(
						$entity,
						self::service_params( $fields ),
						array(
							'providers'     => null === $links ? $this->service_employees( $id ) : array_keys( $links ),
							'applyGlobally' => $global,
						)
					);
					unset( $params['id'] );
					$r = $this->api->call( 'update-service', $params, array( 'id' => $id ) );
					if ( is_wp_error( $r ) ) {
						return $r;
					}
					$own = null === $links ? true : $this->own_terms( $id, $links );
					return is_wp_error( $own ) ? $own : array( 'id' => $id );
				},
				'verify'   => fn( int $x ) => $this->verify_service( $id, $fields, $prices, $global ),
			)
		);
	}

	/** @return array|WP_Error */
	public function set_service_status( int $id, ?string $version, bool $force, string $status ) {
		return $this->write(
			array(
				'kind'     => 'service',
				'id'       => $id,
				'op'       => 'set-service-status',
				'version'  => $version,
				'force'    => $force,
				'objects'  => array( array( 'service', $id ) ),
				'keys'     => self::lock_order( array( 'service' => array( $id ) ) ),
				'validate' => fn() => true,
				'do'       => function () use ( $id, $status ) {
					$r = $this->api->call( 'update-service-status', array( 'status' => $status ), array( 'id' => $id ) );
					return is_wp_error( $r ) ? $r : array( 'id' => $id );
				},
				'verify'   => fn( int $x ) => self::mismatches( array( 'status' => $status ), (array) $this->view( 'service', $id ) ),
			)
		);
	}

	// People (spec 4.2, D8, D17).

	/** EMCP person fields as Amelia's. */
	protected static function person_params( array $f ): array {
		$out = array();
		foreach ( array( 'first_name' => 'firstName', 'last_name' => 'lastName', 'email' => 'email', 'phone' => 'phone', 'note' => 'note', 'description' => 'description', 'birthday' => 'birthday', 'gender' => 'gender' ) as $k => $a ) {
			if ( array_key_exists( $k, $f ) ) {
				$v         = is_string( $f[ $k ] ) ? trim( $f[ $k ] ) : $f[ $k ];
				$out[ $a ] = ( 'email' === $k || 'birthday' === $k ) && '' === $v ? null : $v;
			}
		}
		return $out;
	}

	/** Amelia's serviceList for an employee: each service's stored entity with its own terms. @return array|WP_Error */
	protected function service_list( array $links, int $employee ) {
		$current = array();
		foreach ( $employee ? $this->api->rows_where( 'providers_to_services', 'userId', array( $employee ) ) : array() as $l ) {
			$current[ (int) $l['serviceId'] ] = $l;
		}
		$out = array();
		foreach ( $links as $sid => $t ) {
			$s = $this->entity( 'get-service', 'service', (int) $sid );
			if ( is_wp_error( $s ) ) {
				return $s;
			}
			$c     = $current[ $sid ] ?? null;
			$out[] = array_merge(
				$s,
				array(
					'id'          => (int) $sid,
					'price'       => null !== $t['price'] ? $t['price'] : ( $c ? (float) $c['price'] : (float) $s['price'] ),
					'minCapacity' => null !== $t['min'] ? $t['min'] : ( $c ? (int) $c['minCapacity'] : (int) $s['minCapacity'] ),
					'maxCapacity' => null !== $t['max'] ? $t['max'] : ( $c ? (int) $c['maxCapacity'] : (int) $s['maxCapacity'] ),
				)
			);
		}
		return $out;
	}

	/** @return string[] */
	protected function verify_person( string $kind, int $id, array $f ): array {
		$v = $this->view( $kind, $id );
		if ( ! $v ) {
			return array( $kind );
		}
		$bad = self::mismatches( array_diff_key( $f, array( 'services' => 1 ) ), $v );
		if ( array_key_exists( 'services', $f ) ) {
			$links = (array) self::link_list( $f['services'], 'services' );
			$have  = array();
			foreach ( $v['services'] as $s ) {
				$have[ $s['id'] ] = $s;
			}
			if ( array_keys( $links ) != array_keys( $have ) ) {
				$bad[] = 'services';
			}
			foreach ( $links as $sid => $t ) {
				if ( isset( $have[ $sid ] ) && null !== $t['price'] && abs( $have[ $sid ]['price'] - $t['price'] ) > 0.000001 ) {
					$bad[] = 'services';
				}
			}
		}
		return array_values( array_unique( $bad ) );
	}

	/** @return array|WP_Error */
	public function create_employee( array $f ) {
		$links = array_key_exists( 'services', $f ) ? self::link_list( $f['services'], 'services' ) : array();
		if ( is_wp_error( $links ) ) {
			return $links;
		}
		$objects = array( array( 'employee', 0 ) );
		foreach ( array_keys( $links ) as $sid ) {
			$objects[] = array( 'service', $sid );
		}
		return $this->write(
			array(
				'kind'     => 'employee',
				'op'       => 'create-employee',
				'objects'  => $objects,
				'keys'     => self::lock_order( array( 'service' => array_keys( $links ), 'new' => array( 'employee' ) ) ),
				'validate' => fn() => $this->validate_person( $f, true, 'employee', 0 ),
				'primary'  => 'users',
				'do'       => function () use ( $f, $links ) {
					$list = $this->service_list( $links, 0 );
					if ( is_wp_error( $list ) ) {
						return $list;
					}
					$params = self::person_params( array_diff_key( $f, array( 'services' => 1 ) ) ) + array(
						'type'                         => 'provider',
						'status'                       => 'visible',
						'serviceList'                  => $list,
						'weekDayList'                  => array(),
						'specialDayList'               => array(),
						'timeOutList'                  => array(),
						'periodList'                   => array(),
						'dayOffList'                   => array(),
						'sendEmployeePanelAccessEmail' => false,
					);
					return self::id_from( $this->api->call( 'add-employee', $params ), 'user' );
				},
				'verify'   => fn( int $id ) => $this->verify_person( 'employee', $id, $f ),
			)
		);
	}

	/** Services an employee has now. @return int[] */
	protected function employee_services( int $u ): array {
		return array_values( array_unique( array_map( 'intval', array_column( $this->api->rows_where( 'providers_to_services', 'userId', array( $u ) ), 'serviceId' ) ) ) );
	}

	/**
	 * An employee update through Amelia's merge (D8): only the given Amelia fields are sent.
	 *
	 * @param callable $params ( ) => array|WP_Error Amelia fields
	 * @param callable $verify ( ) => string[]
	 * @return array|WP_Error
	 */
	/** Profile columns sent on every person update (D8): Amelia's employee update clears a stored phone it is not given. */
	const PROFILE = array( 'firstName', 'lastName', 'email', 'phone', 'countryPhoneIso', 'note', 'description', 'birthday', 'gender' );

	/** The person's stored profile, in Amelia's names. */
	protected function stored_profile( int $id ): array {
		return array_intersect_key( (array) $this->api->row( 'users', $id ), array_flip( self::PROFILE ) );
	}

	/**
	 * The profile fields a write did not name are as they were (D9).
	 *
	 * @param array $before The view before the write.
	 * @return string[]
	 */
	protected function profile_kept( string $kind, int $id, array $before, array $changes ): array {
		$after = (array) $this->view( $kind, $id );
		$bad   = array();
		foreach ( array( 'first_name', 'last_name', 'email', 'phone', 'note', 'description', 'birthday', 'gender' ) as $k ) {
			if ( array_key_exists( $k, $before ) && ! array_key_exists( $k, $changes ) && (string) $before[ $k ] !== (string) ( $after[ $k ] ?? '' ) ) {
				$bad[] = $k;
			}
		}
		return $bad;
	}

	protected function employee_write( int $id, string $op, ?string $version, bool $force, array $more_services, callable $validate, callable $params, callable $verify, array $changes = array() ) {
		$before   = array();
		$services = array_values( array_unique( array_merge( $this->employee_services( $id ), $more_services ) ) );
		$objects  = array( array( 'employee', $id ) );
		foreach ( $services as $sid ) {
			$objects[] = array( 'service', $sid );
		}
		return $this->write(
			array(
				'kind'     => 'employee',
				'id'       => $id,
				'op'       => $op,
				'version'  => $version,
				'force'    => $force,
				'objects'  => $objects,
				'keys'     => self::lock_order( array( 'service' => $services, 'employee' => array( $id ) ) ),
				'validate' => function () use ( $id, $validate ) {
					$lite = $this->lite_employees( array( $id ) );
					return is_wp_error( $lite ) ? $lite : $validate();
				},
				'do'       => function () use ( $id, $params, &$before ) {
					$before = (array) $this->view( 'employee', $id );
					$p      = $params();
					if ( is_wp_error( $p ) ) {
						return $p;
					}
					$r = $this->api->call( 'update-employee', array_merge( $this->stored_profile( $id ), $p ), array( 'id' => $id ) );
					return is_wp_error( $r ) ? $r : array( 'id' => $id );
				},
				'verify'   => function ( int $x ) use ( $id, $verify, $changes, &$before ) {
					return array_values( array_unique( array_merge( $verify(), $this->profile_kept( 'employee', $id, (array) $before, $changes ) ) ) );
				},
			)
		);
	}

	/** @return array|WP_Error */
	public function update_employee( int $id, ?string $version, bool $force, array $changes ) {
		if ( ! $changes ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		$links = array_key_exists( 'services', $changes ) ? self::link_list( $changes['services'], 'services' ) : null;
		if ( is_wp_error( $links ) ) {
			return $links;
		}
		return $this->employee_write(
			$id,
			'update-employee',
			$version,
			$force,
			null === $links ? array() : array_keys( $links ),
			fn() => $this->validate_person( $changes, false, 'employee', $id ),
			function () use ( $id, $changes, $links ) {
				$p = self::person_params( array_diff_key( $changes, array( 'services' => 1 ) ) );
				if ( null !== $links ) {
					$list = $this->service_list( $links, $id );
					if ( is_wp_error( $list ) ) {
						return $list;
					}
					$p['serviceList'] = $list;
				}
				return $p;
			},
			fn() => $this->verify_person( 'employee', $id, $changes ),
			$changes
		);
	}

	/** @return array|WP_Error */
	public function set_employee_status( int $id, ?string $version, bool $force, string $status ) {
		return $this->write(
			array(
				'kind'     => 'employee',
				'id'       => $id,
				'op'       => 'set-employee-status',
				'version'  => $version,
				'force'    => $force,
				'objects'  => array( array( 'employee', $id ) ),
				'keys'     => self::lock_order( array( 'employee' => array( $id ) ) ),
				'validate' => fn() => true,
				'do'       => function () use ( $id, $status ) {
					$r = $this->api->call( 'update-employee-status', array( 'status' => $status ), array( 'id' => $id ) );
					return is_wp_error( $r ) ? $r : array( 'id' => $id );
				},
				'verify'   => fn( int $x ) => self::mismatches( array( 'status' => $status ), (array) $this->view( 'employee', $id ) ),
			)
		);
	}

	/** @return array|WP_Error */
	public function set_working_hours( int $id, ?string $version, bool $force, array $week ) {
		$list = self::week_list( $week );
		if ( is_wp_error( $list ) ) {
			return $list;
		}
		return $this->employee_write(
			$id,
			'set-working-hours',
			$version,
			$force,
			array(),
			fn() => true,
			fn() => array( 'weekDayList' => $list ),
			function () use ( $id, $list ) {
				$v    = $this->view( 'employee', $id );
				$want = array_map( static fn( $d ) => array( EMCP_Tools_Amelia_Integration::DAYS[ $d['dayIndex'] ], substr( $d['startTime'], 0, 5 ), substr( $d['endTime'], 0, 5 ), array_map( static fn( $b ) => array( substr( $b['startTime'], 0, 5 ), substr( $b['endTime'], 0, 5 ) ), $d['timeOutList'] ) ), $list );
				$have = array_map( static fn( $d ) => array( $d['day'], $d['start'], $d['end'], array_map( static fn( $b ) => array( $b['start'], $b['end'] ), $d['breaks'] ) ), (array) ( $v['week'] ?? array() ) );
				return $want === $have ? array() : array( 'week' );
			}
		);
	}

	/** @return array|WP_Error */
	public function set_days_off( int $id, ?string $version, bool $force, array $days ) {
		$list = self::days_off_list( $days );
		if ( is_wp_error( $list ) ) {
			return $list;
		}
		return $this->employee_write(
			$id,
			'set-days-off',
			$version,
			$force,
			array(),
			fn() => true,
			fn() => array( 'dayOffList' => $list ),
			function () use ( $id, $list ) {
				$v    = $this->view( 'employee', $id );
				$key  = static fn( $d ) => $d[0] . '|' . $d[1] . '|' . $d[2] . '|' . (int) $d[3];
				$want = array_map( static fn( $d ) => $key( array( $d['name'], $d['startDate'], $d['endDate'], $d['repeat'] ) ), $list );
				$have = array_map( static fn( $d ) => $key( array( $d['name'], $d['start'], $d['end'], $d['repeat'] ) ), (array) ( $v['days_off'] ?? array() ) );
				sort( $want );
				sort( $have );
				return $want === $have ? array() : array( 'days_off' );
			}
		);
	}

	/** @return array|WP_Error */
	public function create_customer( array $f ) {
		return $this->write(
			array(
				'kind'     => 'customer',
				'op'       => 'create-customer',
				'objects'  => array( array( 'customer', 0 ) ),
				'keys'     => self::lock_order( array( 'new' => array( 'customer' ) ) ),
				'validate' => fn() => $this->validate_person( $f, true, 'customer', 0 ),
				'primary'  => 'users',
				'do'       => fn() => self::id_from( $this->api->call( 'add-customer', self::person_params( $f ) + array( 'type' => 'customer', 'status' => 'visible' ) ), 'user' ),
				'verify'   => fn( int $id ) => $this->verify_person( 'customer', $id, $f ),
			)
		);
	}

	/** @return array|WP_Error */
	public function update_customer( int $id, ?string $version, bool $force, array $changes ) {
		if ( ! $changes ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		$before = array();
		return $this->write(
			array(
				'kind'     => 'customer',
				'id'       => $id,
				'op'       => 'update-customer',
				'version'  => $version,
				'force'    => $force,
				'objects'  => array( array( 'customer', $id ) ),
				'keys'     => self::lock_order( array( 'customer' => array( $id ) ) ),
				'validate' => fn() => $this->validate_person( $changes, false, 'customer', $id ),
				'do'       => function () use ( $id, $changes, &$before ) {
					$before = (array) $this->view( 'customer', $id );
					$r      = $this->api->call( 'update-customer', array_merge( $this->stored_profile( $id ), self::person_params( $changes ) ), array( 'id' => $id ) );
					return is_wp_error( $r ) ? $r : array( 'id' => $id );
				},
				'verify'   => function ( int $x ) use ( $id, $changes, &$before ) {
					return array_values( array_unique( array_merge( $this->verify_person( 'customer', $id, $changes ), $this->profile_kept( 'customer', $id, (array) $before, $changes ) ) ) );
				},
			)
		);
	}

	// Appointments (spec 4.2, D10 to D12).

	/** A site-local Y-m-d H:i, exactly. @return true|WP_Error */
	protected static function start_ok( $start ) {
		$ok = is_string( $start ) && preg_match( '/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/', $start ) && ! is_wp_error( EMCP_Tools_Amelia_Integration::local_bound( $start, false, 'start' ) );
		return $ok ? true : self::invalid( __( 'start must be a site-local time, Y-m-d H:i.', 'emcp-tools' ) );
	}

	/** The employee's own terms for a service, or null when they do not perform it. */
	protected function link( int $service, int $employee ): ?array {
		foreach ( $this->api->rows_where( 'providers_to_services', 'serviceId', array( $service ) ) as $l ) {
			if ( (int) $l['userId'] === $employee ) {
				return $l;
			}
		}
		return null;
	}

	protected function user_of( int $id, string $type ): ?array {
		$u = $this->api->row( 'users', $id );
		return $u && $type === $u['type'] ? $u : null;
	}

	protected static function missing( string $what, int $id ): WP_Error {
		/* translators: 1: what, 2: id. */
		return new WP_Error( 'not_found', sprintf( __( 'There is no Amelia %1$s %2$d.', 'emcp-tools' ), $what, $id ), array( 'status' => 404 ) );
	}

	/** The approved or pending appointment of an employee and service starting then, which a group booking joins. */
	protected function joinable( int $service, int $employee, string $start_utc ): int {
		foreach ( $this->api->rows_where( 'appointments', 'providerId', array( $employee ) ) as $id => $a ) {
			if ( (int) $a['serviceId'] === $service && (string) $a['bookingStart'] === $start_utc && in_array( (string) $a['status'], array( 'approved', 'pending' ), true ) ) {
				return (int) $id;
			}
		}
		return 0;
	}

	/** The customers booked into an appointment. @return int[] */
	protected function booked_customers( int $appointment ): array {
		return array_values( array_unique( array_map( 'intval', array_column( $this->api->rows_where( 'customer_bookings', 'appointmentId', array( $appointment ) ), 'customerId' ) ) ) );
	}

	/** The leases of a write to an existing appointment: its service, employees, customers (D12). */
	protected function appointment_keys( int $id, array $more_employees = array(), array $bookings = array() ): array {
		$a = (array) $this->api->row( 'appointments', $id );
		return self::lock_order(
			array(
				'service'     => array( (int) ( $a['serviceId'] ?? 0 ) ),
				'employee'    => array_merge( array( (int) ( $a['providerId'] ?? 0 ) ), $more_employees ),
				'customer'    => $this->booked_customers( $id ),
				'appointment' => array( $id ),
				'booking'     => $bookings,
			)
		);
	}

	/** Amelia's full appointment for UpdateAppointment (D8: id in the body too, spike item 8). @return array|WP_Error */
	protected function appointment_params( int $id, array $over ) {
		$e = $this->entity( 'get-appointment', 'appointment', $id );
		if ( is_wp_error( $e ) ) {
			return $e;
		}
		return array_merge(
			array(
				'id'                 => $id,
				'serviceId'          => (int) $e['serviceId'],
				'providerId'         => (int) $e['providerId'],
				'bookingStart'       => substr( (string) $e['bookingStart'], 0, 16 ),
				'notifyParticipants' => 0,
				'internalNotes'      => (string) ( $e['internalNotes'] ?? '' ),
				'locationId'         => $e['locationId'] ?? null,
				'bookings'           => array_values( (array) ( $e['bookings'] ?? array() ) ),
				'removedBookings'    => array(),
				'payment'            => null,
				'recurring'          => array(),
			),
			$over
		);
	}

	/** @return array|WP_Error */
	public function create_appointment( array $f ) {
		$svc     = (int) $f['service_id'];
		$emp     = (int) $f['employee_id'];
		$cust    = (int) $f['customer_id'];
		$persons = (int) ( $f['persons'] ?? 1 );
		$ok      = self::start_ok( $f['start'] ?? null );
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$start_utc = EMCP_Tools_Amelia_Api::local_to_utc( (string) $f['start'] );
		$join      = $this->joinable( $svc, $emp, $start_utc );
		$objects   = array( array( 'appointment', 0 ) );
		if ( $join ) {
			$objects[] = array( 'appointment', $join );
		}
		$status = (string) ( $f['status'] ?? $this->api->setting( 'general', 'defaultAppointmentStatus' ) );
		$sent   = array( 'start' => (string) $f['start'], 'service_id' => $svc, 'employee_id' => $emp );
		return $this->write(
			array(
				'kind'     => 'appointment',
				'op'       => 'create-appointment',
				'notify'   => ! empty( $f['notify'] ),
				'objects'  => $objects,
				'keys'     => self::lock_order( array( 'service' => array( $svc ), 'employee' => array( $emp ), 'customer' => array( $cust ), 'appointment' => array( $join ), 'new' => array( 'appointment' ) ) ),
				'validate' => function () use ( $svc, $emp, $cust, $persons ) {
					if ( ! $this->api->row( 'services', $svc ) ) {
						return self::missing( 'service', $svc );
					}
					if ( ! $this->user_of( $emp, 'provider' ) ) {
						return self::missing( 'employee', $emp );
					}
					$lite = $this->lite_employees( array( $emp ) );
					if ( is_wp_error( $lite ) ) {
						return $lite;
					}
					if ( ! $this->user_of( $cust, 'customer' ) ) {
						return self::missing( 'customer', $cust );
					}
					$link = $this->link( $svc, $emp );
					if ( ! $link ) {
						return self::invalid( __( 'This employee does not perform this service (update-service or update-employee links them).', 'emcp-tools' ) );
					}
					if ( $persons > (int) $link['maxCapacity'] ) {
						/* translators: %d: capacity. */
						return self::invalid( sprintf( __( 'persons is above the capacity of %d for this employee.', 'emcp-tools' ), (int) $link['maxCapacity'] ) );
					}
					return true;
				},
				'primary'  => static fn( array $cap ) => (int) ( $cap['inserted']['appointments'][0] ?? ( ! empty( $cap['inserted']['customer_bookings'] ) ? $join : 0 ) ),
				'do'       => function () use ( $f, $svc, $emp, $cust, $persons, $status ) {
					$r = $this->api->call(
						'add-appointment',
						array(
							'serviceId'          => $svc,
							'providerId'         => $emp,
							'bookingStart'       => (string) $f['start'],
							'notifyParticipants' => ! empty( $f['notify'] ) ? 1 : 0,
							'internalNotes'      => (string) ( $f['internal_notes'] ?? '' ),
							'locationId'         => null,
							'recurring'          => array(),
							'bookings'           => array( array( 'customerId' => $cust, 'persons' => $persons, 'status' => $status, 'customFields' => array() ) ),
						)
					);
					return self::id_from( $r, 'appointment' );
				},
				'verify'   => function ( int $id ) use ( $sent, $cust, $persons, $f ) {
					$v = $this->view( 'appointment', $id );
					if ( ! $v ) {
						return array( 'appointment' );
					}
					$bad = self::mismatches( $sent, $v );
					$hit = array_filter( $v['bookings'], static fn( $b ) => $b['customer_id'] === $cust && $b['persons'] === $persons && ( ! isset( $f['status'] ) || $b['status'] === $f['status'] ) );
					return $hit ? $bad : array_merge( $bad, array( 'bookings' ) );
				},
				'extra'    => static function ( array $out, ?array $v, array $t ) {
					$cap = (array) ( $t['captured'] ?? array() );
					return array(
						'appointment_id' => $out['id'],
						'booking_id'     => (int) ( $cap['inserted']['customer_bookings'][0] ?? 0 ),
						'merged'         => empty( $cap['inserted']['appointments'] ),
						'start'          => $v['start'] ?? '',
						'end'            => $v['end'] ?? '',
						'status'         => $v['status'] ?? '',
					) + $out;
				},
			)
		);
	}

	/** @return array|WP_Error */
	public function reschedule_appointment( int $id, ?string $version, bool $force, array $f ) {
		$a = $this->view( 'appointment', $id );
		if ( ! $a ) {
			return self::missing( 'appointment', $id );
		}
		$emp = (int) ( $f['employee_id'] ?? $a['employee_id'] );
		return $this->write(
			array(
				'kind'     => 'appointment',
				'id'       => $id,
				'op'       => 'reschedule-appointment',
				'version'  => $version,
				'force'    => $force,
				'notify'   => ! empty( $f['notify'] ),
				'objects'  => array( array( 'appointment', $id ) ),
				'keys'     => $this->appointment_keys( $id, array( $emp ) ),
				'validate' => function () use ( $f, $emp, $a ) {
					$ok = self::start_ok( $f['start'] ?? null );
					if ( is_wp_error( $ok ) ) {
						return $ok;
					}
					if ( ! $this->user_of( $emp, 'provider' ) ) {
						return self::missing( 'employee', $emp );
					}
					$lite = $this->lite_employees( array( $emp ) );
					if ( is_wp_error( $lite ) ) {
						return $lite;
					}
					return $this->link( (int) $a['service_id'], $emp ) ? true : self::invalid( __( 'This employee does not perform the appointment\'s service.', 'emcp-tools' ) );
				},
				'do'       => function () use ( $id, $f, $emp ) {
					$p = $this->appointment_params( $id, array( 'bookingStart' => (string) $f['start'], 'providerId' => $emp, 'notifyParticipants' => ! empty( $f['notify'] ) ? 1 : 0 ) );
					if ( is_wp_error( $p ) ) {
						return $p;
					}
					$r = $this->api->call( 'update-appointment', $p, array( 'id' => $id ) );
					return is_wp_error( $r ) ? $r : array( 'id' => $id );
				},
				'verify'   => fn( int $x ) => self::mismatches( array( 'start' => (string) $f['start'], 'employee_id' => $emp ), (array) $this->view( 'appointment', $id ) ),
				'extra'    => static fn( array $out, ?array $v ) => $out + array( 'start' => $v['start'] ?? '', 'end' => $v['end'] ?? '', 'employee_id' => $v['employee_id'] ?? 0 ),
			)
		);
	}

	/** @return array|WP_Error */
	public function set_appointment_status( int $id, ?string $version, bool $force, string $status, bool $notify ) {
		if ( ! $this->api->row( 'appointments', $id ) ) {
			return self::missing( 'appointment', $id );
		}
		return $this->write(
			array(
				'kind'     => 'appointment',
				'id'       => $id,
				'op'       => 'set-appointment-status',
				'version'  => $version,
				'force'    => $force,
				'notify'   => $notify,
				'objects'  => array( array( 'appointment', $id ) ),
				'keys'     => $this->appointment_keys( $id ),
				'validate' => fn() => true,
				'do'       => function () use ( $id, $status ) {
					$r = $this->api->call( 'update-appointment-status', array( 'status' => $status ), array( 'id' => $id ) );
					return is_wp_error( $r ) ? $r : array( 'id' => $id );
				},
				'verify'   => fn( int $x ) => self::mismatches( array( 'status' => $status ), (array) $this->view( 'appointment', $id ) ),
				'extra'    => static function ( array $out, ?array $v ) use ( $status ) {
					$out += array( 'status' => $v['status'] ?? '', 'start' => $v['start'] ?? '', 'end' => $v['end'] ?? '' );
					if ( in_array( $status, array( 'canceled', 'rejected' ), true ) ) {
						$out['note'] = __( 'Amelia stores a cancelled or rejected appointment with its end equal to its start; approving it again restores the end.', 'emcp-tools' );
					}
					return $out;
				},
			)
		);
	}

	/** @return array|WP_Error */
	public function update_appointment( int $id, ?string $version, bool $force, array $changes ) {
		if ( ! $changes ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		$a = $this->view( 'appointment', $id );
		if ( ! $a ) {
			return self::missing( 'appointment', $id );
		}
		return $this->write(
			array(
				'kind'     => 'appointment',
				'id'       => $id,
				'op'       => 'update-appointment',
				'version'  => $version,
				'force'    => $force,
				'objects'  => array( array( 'appointment', $id ) ),
				'keys'     => $this->appointment_keys( $id ),
				'validate' => function () use ( $id, $changes ) {
					if ( ! array_key_exists( 'persons', $changes ) ) {
						return true;
					}
					$v = (array) $this->view( 'appointment', $id );
					if ( 1 !== count( $v['bookings'] ?? array() ) ) {
						return self::invalid( __( 'This appointment has several bookings; change each with set-booking-status, or persons through Amelia.', 'emcp-tools' ) );
					}
					$link = $this->link( (int) $v['service_id'], (int) $v['employee_id'] );
					return $link && (int) $changes['persons'] <= (int) $link['maxCapacity'] ? true : self::invalid( __( 'persons is above the employee\'s capacity for this service.', 'emcp-tools' ) );
				},
				'do'       => function () use ( $id, $changes ) {
					$p = $this->appointment_params( $id, array() );
					if ( is_wp_error( $p ) ) {
						return $p;
					}
					if ( array_key_exists( 'internal_notes', $changes ) ) {
						$p['internalNotes'] = (string) $changes['internal_notes'];
					}
					if ( array_key_exists( 'persons', $changes ) ) {
						$p['bookings'][0]['persons'] = (int) $changes['persons'];
					}
					$r = $this->api->call( 'update-appointment', $p, array( 'id' => $id ) );
					return is_wp_error( $r ) ? $r : array( 'id' => $id );
				},
				'verify'   => function ( int $x ) use ( $id, $changes ) {
					$v   = (array) $this->view( 'appointment', $id );
					$bad = self::mismatches( array_intersect_key( $changes, array( 'internal_notes' => 1 ) ), $v );
					if ( array_key_exists( 'persons', $changes ) && (int) ( $v['bookings'][0]['persons'] ?? 0 ) !== (int) $changes['persons'] ) {
						$bad[] = 'persons';
					}
					return $bad;
				},
			)
		);
	}

	/** @return array|WP_Error */
	public function set_booking_status( int $booking, ?string $version, bool $force, string $status, bool $notify ) {
		$b = $this->view( 'booking', $booking );
		if ( ! $b ) {
			return self::missing( 'booking', $booking );
		}
		if ( ! $b['appointment_id'] ) {
			return $this->set_event_booking_status( $booking, $version, $force, $status, $notify );
		}
		$aid = (int) $b['appointment_id'];
		return $this->write(
			array(
				'kind'     => 'booking',
				'id'       => $booking,
				'op'       => 'set-booking-status',
				'version'  => $version,
				'force'    => $force,
				'notify'   => $notify,
				'objects'  => array( array( 'booking', $booking ), array( 'appointment', $aid ) ),
				'keys'     => $this->appointment_keys( $aid, array(), array( $booking ) ),
				'validate' => fn() => true,
				'do'       => function () use ( $booking, $status ) {
					$r = $this->api->call( 'update-booking-status', array( 'status' => $status ), array( 'id' => $booking ) );
					return is_wp_error( $r ) ? $r : array( 'id' => $booking );
				},
				'verify'   => fn( int $x ) => self::mismatches( array( 'status' => $status ), (array) $this->view( 'booking', $booking ) ),
				'extra'    => static fn( array $out, ?array $v ) => array( 'booking_id' => $out['id'], 'status' => $v['status'] ?? '' ) + $out,
			)
		);
	}

	// Events and attendees (spec 4.2, D8, D11).

	/** periods: [{id?, start, end}] site-local Y-m-d H:i, each starting before it ends. @return array|WP_Error Amelia's periods */
	protected static function period_list( $periods, array $own = array() ) {
		if ( ! is_array( $periods ) || ! $periods ) {
			return self::invalid( __( 'periods must list at least one {start, end}.', 'emcp-tools' ) );
		}
		$out = array();
		foreach ( $periods as $p ) {
			$ok = is_array( $p ) && ! is_wp_error( self::start_ok( $p['start'] ?? null ) ) && ! is_wp_error( self::start_ok( $p['end'] ?? null ) ) && $p['start'] < $p['end'];
			if ( ! $ok || ( isset( $p['id'] ) && ! in_array( (int) $p['id'], $own, true ) ) ) {
				return self::invalid( __( 'Each period needs start before end (site-local Y-m-d H:i), and an id only of one of this event\'s periods.', 'emcp-tools' ) );
			}
			$row = array( 'periodStart' => $p['start'] . ':00', 'periodEnd' => $p['end'] . ':00' );
			if ( isset( $p['id'] ) ) {
				$row = array( 'id' => (int) $p['id'] ) + $row;
			}
			$out[] = $row;
		}
		return $out;
	}

	/** @return true|WP_Error */
	protected function validate_event( array $f, ?array $stored ) {
		$create = null === $stored;
		if ( ( $create || array_key_exists( 'name', $f ) ) && '' === trim( (string) ( $f['name'] ?? '' ) ) ) {
			return self::invalid( __( 'name must not be empty.', 'emcp-tools' ) );
		}
		if ( array_key_exists( 'periods', $f ) ) {
			$p = self::period_list( $f['periods'], $stored ? array_column( $stored['periods'], 'id' ) : array() );
			if ( is_wp_error( $p ) ) {
				return $p;
			}
		}
		if ( ! self::color_ok( $f ) ) {
			return self::invalid( __( 'color must be #rrggbb.', 'emcp-tools' ) );
		}
		foreach ( array( 'booking_opens', 'booking_closes' ) as $k ) {
			if ( isset( $f[ $k ] ) && '' !== $f[ $k ] && is_wp_error( self::start_ok( $f[ $k ] ) ) ) {
				/* translators: %s: argument. */
				return self::invalid( sprintf( __( '%s must be a site-local time, Y-m-d H:i.', 'emcp-tools' ), $k ) );
			}
		}
		$opens  = (string) ( $f['booking_opens'] ?? ( $stored['booking_opens'] ?? '' ) );
		$closes = (string) ( $f['booking_closes'] ?? ( $stored['booking_closes'] ?? '' ) );
		if ( '' !== $opens && '' !== $closes && $closes <= $opens ) {
			return self::invalid( __( 'booking_closes must be after booking_opens.', 'emcp-tools' ) );
		}
		foreach ( (array) ( $f['employees'] ?? array() ) as $u ) {
			if ( ! is_int( $u ) && ! ( is_string( $u ) && ctype_digit( $u ) ) || ! $this->user_of( (int) $u, 'provider' ) ) {
				return self::invalid( __( 'employees must be ids of Amelia employees.', 'emcp-tools' ) );
			}
		}
		$lite = $this->lite_employees( (array) ( $f['employees'] ?? array() ) );
		if ( is_wp_error( $lite ) ) {
			return $lite;
		}
		foreach ( (array) ( $f['tags'] ?? array() ) as $t ) {
			if ( ! is_string( $t ) || '' === trim( $t ) ) {
				return self::invalid( __( 'tags must be names.', 'emcp-tools' ) );
			}
		}
		if ( ! empty( $f['tags'] ) && 'Lite' === $this->api->edition() ) {
			return new WP_Error( 'not_in_lite', __( 'Amelia Lite does not store event tags (its premium editions do).', 'emcp-tools' ), array( 'status' => 409, 'fields' => array( 'tags' ) ) );
		}
		return true;
	}

	/** EMCP event fields as Amelia's. @return array|WP_Error */
	protected function event_params( array $f, array $own_periods = array() ) {
		$out = array();
		foreach ( array( 'name' => 'name', 'description' => 'description', 'price' => 'price', 'max_capacity' => 'maxCapacity', 'color' => 'color' ) as $k => $a ) {
			if ( array_key_exists( $k, $f ) ) {
				$out[ $a ] = 'name' === $k ? trim( (string) $f[ $k ] ) : $f[ $k ];
			}
		}
		if ( array_key_exists( 'visible', $f ) ) {
			$out['show'] = (bool) $f['visible'];
		}
		foreach ( array( 'booking_opens' => 'bookingOpens', 'booking_closes' => 'bookingCloses' ) as $k => $a ) {
			if ( array_key_exists( $k, $f ) ) {
				$out[ $a ] = '' === (string) $f[ $k ] ? null : $f[ $k ] . ':00';
			}
		}
		if ( array_key_exists( 'periods', $f ) ) {
			$p = self::period_list( $f['periods'], $own_periods );
			if ( is_wp_error( $p ) ) {
				return $p;
			}
			$out['periods'] = $p;
		}
		if ( array_key_exists( 'tags', $f ) ) {
			$out['tags'] = array_map( static fn( $t ) => array( 'name' => trim( (string) $t ) ), (array) $f['tags'] );
		}
		if ( array_key_exists( 'employees', $f ) ) {
			$out['providers'] = array();
			foreach ( (array) $f['employees'] as $u ) {
				$row                = (array) $this->user_of( (int) $u, 'provider' );
				$out['providers'][] = array( 'id' => (int) $u, 'firstName' => (string) ( $row['firstName'] ?? '' ), 'lastName' => (string) ( $row['lastName'] ?? '' ), 'email' => (string) ( $row['email'] ?? '' ), 'type' => 'provider' );
			}
		}
		return $out;
	}

	/** The event read back (D9). @return string[] */
	protected function verify_event( int $id, array $f ): array {
		$v = $this->view( 'event', $id );
		if ( ! $v ) {
			return array( 'event' );
		}
		$bad = self::mismatches( array_diff_key( $f, array( 'periods' => 1, 'employees' => 1, 'tags' => 1 ) ), $v );
		if ( array_key_exists( 'periods', $f ) ) {
			$want = array_map( static fn( $p ) => $p['start'] . '|' . $p['end'], (array) $f['periods'] );
			$have = array_map( static fn( $p ) => $p['start'] . '|' . $p['end'], $v['periods'] );
			sort( $want );
			sort( $have );
			if ( $want !== $have ) {
				$bad[] = 'periods';
			}
		}
		if ( array_key_exists( 'employees', $f ) ) {
			$want = array_map( 'intval', (array) $f['employees'] );
			sort( $want );
			if ( $want !== $v['employees'] ) {
				$bad[] = 'employees';
			}
		}
		if ( array_key_exists( 'tags', $f ) ) {
			$want = array_map( static fn( $t ) => trim( (string) $t ), (array) $f['tags'] );
			$have = $v['tags'];
			sort( $want );
			sort( $have );
			if ( $want !== $have ) {
				$bad[] = 'tags';
			}
		}
		return $bad;
	}

	/** Employees and customers an event links to now. @return array<string,int[]> */
	protected function event_links( int $id ): array {
		$rows = $this->api->rows( 'event', $id );
		return array(
			'employee' => array_map( 'intval', array_column( (array) ( $rows['events_to_providers'] ?? array() ), 'userId' ) ),
			'customer' => array_map( 'intval', array_column( (array) ( $rows['customer_bookings'] ?? array() ), 'customerId' ) ),
		);
	}

	/** @return array|WP_Error */
	public function create_event( array $f ) {
		$employees = array_map( 'intval', (array) ( $f['employees'] ?? array() ) );
		return $this->write(
			array(
				'kind'     => 'event',
				'op'       => 'create-event',
				'objects'  => array( array( 'event', 0 ) ),
				'keys'     => self::lock_order( array( 'employee' => $employees, 'new' => array( 'event' ) ) ),
				'validate' => fn() => $this->validate_event( $f, null ),
				'primary'  => 'events',
				'do'       => function () use ( $f ) {
					$p = $this->event_params( $f );
					if ( is_wp_error( $p ) ) {
						return $p;
					}
					$p += array(
						'description'       => '',
						'price'             => 0,
						'maxCapacity'       => 1,
						'color'             => '#1788FB',
						'show'              => true,
						'bookingOpens'      => null,
						'bookingCloses'     => null,
						'providers'         => array(),
						'tags'              => array(),
						'depositPayment'    => 'disabled',
						'deposit'           => 0,
						'bringingAnyone'    => true,
						'bookMultipleTimes' => true,
					);
					return self::id_from( $this->api->call( 'add-event', $p ), 'event' );
				},
				'verify'   => fn( int $id ) => $this->verify_event( $id, $f ),
				'extra'    => static fn( array $out, ?array $v ) => $out + array( 'periods' => $v['periods'] ?? array(), 'status' => $v['status'] ?? '' ),
			)
		);
	}

	/** @return array|WP_Error */
	public function update_event( int $id, ?string $version, bool $force, array $changes ) {
		if ( ! $changes ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		$stored = $this->view( 'event', $id );
		if ( ! $stored ) {
			return self::missing( 'event', $id );
		}
		$links = $this->event_links( $id );
		return $this->write(
			array(
				'kind'     => 'event',
				'id'       => $id,
				'op'       => 'update-event',
				'version'  => $version,
				'force'    => $force,
				'objects'  => array( array( 'event', $id ) ),
				'keys'     => self::lock_order( array( 'employee' => array_merge( $links['employee'], array_map( 'intval', (array) ( $changes['employees'] ?? array() ) ) ), 'event' => array( $id ) ) ),
				'validate' => fn() => $this->validate_event( $changes, (array) $this->view( 'event', $id ) ),
				'do'       => function () use ( $id, $changes, $stored ) {
					$entity = $this->entity( 'get-event', 'event', $id );
					if ( is_wp_error( $entity ) ) {
						return $entity;
					}
					$over = $this->event_params( $changes, array_column( $stored['periods'], 'id' ) );
					if ( is_wp_error( $over ) ) {
						return $over;
					}
					$p = array_merge( $entity, $over, array( 'id' => $id, 'applyGlobally' => false ) );
					$r = $this->api->call( 'update-event', $p, array( 'id' => $id ) );
					return is_wp_error( $r ) ? $r : array( 'id' => $id );
				},
				'verify'   => fn( int $x ) => $this->verify_event( $id, $changes ),
			)
		);
	}

	/** @return array|WP_Error */
	public function set_event_status( int $id, ?string $version, bool $force, string $status, bool $notify ) {
		if ( ! $this->api->row( 'events', $id ) ) {
			return self::missing( 'event', $id );
		}
		$amelia = 'open' === $status ? 'approved' : 'rejected';
		$links  = $this->event_links( $id );
		return $this->write(
			array(
				'kind'     => 'event',
				'id'       => $id,
				'op'       => 'set-event-status',
				'version'  => $version,
				'force'    => $force,
				'notify'   => $notify,
				'objects'  => array( array( 'event', $id ) ),
				'keys'     => self::lock_order( array( 'employee' => $links['employee'], 'customer' => $links['customer'], 'event' => array( $id ) ) ),
				'validate' => fn() => true,
				'do'       => function () use ( $id, $amelia ) {
					$r = $this->api->call( 'update-event-status', array( 'status' => $amelia, 'applyGlobally' => false ), array( 'id' => $id ) );
					return is_wp_error( $r ) ? $r : array( 'id' => $id );
				},
				'verify'   => fn( int $x ) => self::mismatches( array( 'status' => $status ), (array) $this->view( 'event', $id ) ),
				'extra'    => static fn( array $out, ?array $v ) => $out + array( 'status' => $v['status'] ?? '' ),
			)
		);
	}

	/** EMCP's capacity check: Amelia checks free places for customers only, never for back-end bookings. @return true|WP_Error */
	protected function places_ok( int $event, int $persons, int $except = 0 ) {
		$v = $this->view( 'event', $event );
		if ( ! $v ) {
			return self::missing( 'event', $event );
		}
		$rows   = $this->api->rows( 'event', $event );
		$booked = self::persons( array_diff_key( (array) $rows['customer_bookings'], array( $except => 1 ) ) );
		if ( $booked + $persons > $v['max_capacity'] ) {
			/* translators: %d: places left. */
			return new WP_Error( 'event_full', sprintf( __( 'The event has %d places left.', 'emcp-tools' ), max( 0, $v['max_capacity'] - $booked ) ), array( 'status' => 409, 'places_left' => max( 0, $v['max_capacity'] - $booked ) ) );
		}
		return true;
	}

	/** @return array|WP_Error */
	public function add_event_booking( int $event, array $f ) {
		$cust    = (int) $f['customer_id'];
		$persons = (int) ( $f['persons'] ?? 1 );
		$notify  = ! empty( $f['notify'] );
		return $this->write(
			array(
				'kind'     => 'booking',
				'op'       => 'add-event-booking',
				'notify'   => $notify,
				'objects'  => array( array( 'booking', 0 ), array( 'event', $event ) ),
				'keys'     => self::lock_order( array( 'customer' => array( $cust ), 'event' => array( $event ), 'new' => array( 'booking' ) ) ),
				'validate' => function () use ( $event, $cust, $persons ) {
					$v = $this->view( 'event', $event );
					if ( ! $v ) {
						return self::missing( 'event', $event );
					}
					if ( 'open' !== $v['status'] ) {
						return new WP_Error( 'event_closed', __( 'The event is not open; open it with set-event-status first.', 'emcp-tools' ), array( 'status' => 409 ) );
					}
					if ( ! $this->user_of( $cust, 'customer' ) ) {
						return self::missing( 'customer', $cust );
					}
					return $this->places_ok( $event, $persons );
				},
				'primary'  => static fn( array $cap ) => (int) ( $cap['inserted']['customer_bookings'][0] ?? 0 ),
				'do'       => function () use ( $event, $cust, $persons, $notify ) {
					$r = $this->api->call(
						'add-booking',
						array(
							'type'                         => 'event',
							'eventId'                      => $event,
							'bookings'                     => array( array( 'customerId' => $cust, 'persons' => $persons, 'status' => 'approved', 'customFields' => array(), 'customer' => array( 'id' => $cust ) ) ),
							'payment'                      => array( 'gateway' => 'onSite' ),
							'locale'                       => function_exists( 'get_locale' ) ? get_locale() : 'en_US',
							'timeZone'                     => wp_timezone_string(),
							'notifyParticipants'           => $notify ? 1 : 0,
							'isBackendOrCabinet'           => true,
							'runInstantPostBookingActions' => true,
						)
					);
					if ( is_wp_error( $r ) ) {
						return $r;
					}
					return array( 'id' => (int) ( $r['booking']['id'] ?? 0 ) );
				},
				'verify'   => function ( int $bid ) use ( $cust, $persons, $event ) {
					$v = $this->view( 'booking', $bid );
					if ( ! $v || $v['customer_id'] !== $cust || $v['persons'] !== $persons || $v['event_id'] !== $event ) {
						return array( 'booking' );
					}
					$rows = $this->api->rows( 'booking', $bid );
					$bad  = count( $rows['customer_bookings_to_events_periods'] ) === count( $this->api->rows( 'event', $event )['events_periods'] ) ? array() : array( 'periods' );
					return 1 === (int) ( $rows['customer_bookings'][ $bid ]['actionsCompleted'] ?? 0 ) ? $bad : array_merge( $bad, array( 'post_booking_actions' ) );
				},
				'extra'    => function ( array $out, ?array $v ) use ( $event ) {
					$e = $this->view( 'event', $event );
					return array( 'booking_id' => $out['id'], 'event_id' => $event, 'places_left' => $e ? $e['places_left'] : 0 ) + $out;
				},
			)
		);
	}

	/** An event attendee's status; the attendee's own rows only, the event leased (D12). @return array|WP_Error */
	protected function set_event_booking_status( int $booking, ?string $version, bool $force, string $status, bool $notify ) {
		$b     = (array) $this->view( 'booking', $booking );
		$event = (int) $b['event_id'];
		return $this->write(
			array(
				'kind'     => 'booking',
				'id'       => $booking,
				'op'       => 'set-booking-status',
				'version'  => $version,
				'force'    => $force,
				'notify'   => $notify,
				'objects'  => array( array( 'booking', $booking ) ),
				'keys'     => self::lock_order( array( 'customer' => array( (int) $b['customer_id'] ), 'event' => array( $event ), 'booking' => array( $booking ) ) ),
				'validate' => function () use ( $status, $event, $booking, $b ) {
					$was = in_array( $b['status'], array( 'approved', 'pending' ), true );
					return ! $was && in_array( $status, array( 'approved', 'pending' ), true ) ? $this->places_ok( $event, (int) $b['persons'], $booking ) : true;
				},
				'do'       => function () use ( $booking, $status ) {
					$r = $this->api->call( 'update-event-booking', array( 'id' => $booking, 'type' => 'event', 'bookings' => array( array( 'id' => $booking, 'status' => $status ) ) ), array( 'id' => $booking ) );
					return is_wp_error( $r ) ? $r : array( 'id' => $booking );
				},
				'verify'   => fn( int $x ) => self::mismatches( array( 'status' => $status ), (array) $this->view( 'booking', $booking ) ),
				'extra'    => static fn( array $out, ?array $v ) => array( 'booking_id' => $out['id'], 'status' => $v['status'] ?? '' ) + $out,
			)
		);
	}

	// Deletes (D14).

	/** Amelia's delete controller and delete-effect route per kind. */
	const DELETES = array(
		'category' => array( 'delete-category', 'category-delete-effect' ),
		'service'  => array( 'delete-service', 'service-delete-effect' ),
		'employee' => array( 'delete-user', 'user-delete-effect' ),
		'customer' => array( 'delete-user', 'user-delete-effect' ),
	);

	/**
	 * Why a delete is refused (D14): services in a category (Amelia's category delete takes them
	 * with it), any appointment of a service, any appointment or event of a person, past ones
	 * included; then Amelia's own delete-effect check.
	 *
	 * @return true|WP_Error
	 */
	protected function deletable( string $kind, int $id ) {
		$used = 0;
		switch ( $kind ) {
			case 'category':
				$used = (int) ( $this->api->service_counts()[ $id ] ?? 0 );
				break;
			case 'service':
				$used = $this->api->service_use( $id );
				break;
			default:
				$used = array_sum( $this->api->usage( $kind, $id ) );
		}
		if ( $used > 0 ) {
			/* translators: %s: kind. */
			return new WP_Error( 'in_use', sprintf( __( 'This %s has services, appointments or event bookings (past ones count), so it is not deleted. Hide it instead.', 'emcp-tools' ), $kind ), array( 'status' => 409 ) );
		}
		$effect = $this->api->call( self::DELETES[ $kind ][1], array(), array( 'id' => $id ), 'GET' );
		if ( is_wp_error( $effect ) ) {
			return $effect;
		}
		if ( array_key_exists( 'valid', $effect ) && ! $effect['valid'] ) {
			return new WP_Error( 'in_use', __( 'Amelia refuses this delete.', 'emcp-tools' ), array( 'status' => 409, 'amelia' => (string) ( $effect['messageKey'] ?? '' ) ) );
		}
		return true;
	}

	/** @return array|WP_Error */
	public function delete( string $kind, int $id, ?string $version, bool $force ) {
		if ( ! isset( self::DELETES[ $kind ] ) ) {
			return new WP_Error( 'not_reversible', __( 'This cannot be deleted.', 'emcp-tools' ) );
		}
		if ( ! $this->view( $kind, $id ) ) {
			return self::missing( $kind, $id );
		}
		$objects = array( array( $kind, $id ) );
		$ids     = array( $kind => array( $id ) );
		if ( 'service' === $kind ) {
			foreach ( $this->service_employees( $id ) as $u ) {
				$objects[]         = array( 'employee', $u );
				$ids['employee'][] = $u;
			}
		} elseif ( 'employee' === $kind ) {
			foreach ( $this->employee_services( $id ) as $sid ) {
				$objects[]        = array( 'service', $sid );
				$ids['service'][] = $sid;
			}
		}
		$external = (int) ( $this->api->row( 'users', $id )['externalId'] ?? 0 );
		return $this->write(
			array(
				'kind'     => $kind,
				'id'       => $id,
				'op'       => 'delete-' . $kind,
				'mode'     => 'deleted',
				'version'  => $version,
				'force'    => $force,
				'objects'  => $objects,
				'keys'     => self::lock_order( $ids ),
				'validate' => fn() => $this->deletable( $kind, $id ),
				'do'       => function () use ( $kind, $id ) {
					$r = $this->api->call( self::DELETES[ $kind ][0], array(), array( 'id' => $id ) );
					return is_wp_error( $r ) ? $r : array( 'id' => $id );
				},
				'verify'   => fn( int $x ) => $this->api->rows( $kind, $id ) ? array( 'deleted' ) : array(),
				'extra'    => static function ( array $out ) use ( $external, $kind ) {
					unset( $out['version'] );
					$out['deleted'] = true;
					if ( $external && in_array( $kind, array( 'employee', 'customer' ), true ) ) {
						$out['wordpress_user_kept'] = $external;
					}
					return $out;
				},
			)
		);
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
				$blocker = EMCP_Tools_Amelia_History::blocker( $this->api, $rb );
				if ( is_wp_error( $blocker ) ) {
					return $blocker;
				}
				$before  = self::union( $befores, $tables );
				$current = self::union( array( self::union( self::rows_of( $this->api, $objects ), $tables ), self::present( $this->api, $inserted ) ) );
				$checks  = $this->restore_checks( $before, $current );
				if ( is_wp_error( $checks ) ) {
					return $checks;
				}
				if ( ! $this->api->restore_rows( $before, $current ) ) {
					return new WP_Error( 'rollback_failed', __( 'Amelia\'s earlier rows could not be written back.', 'emcp-tools' ) );
				}
				foreach ( $objects as $o ) {
					$want = self::union( array( (array) ( $befores[ self::ref_key( $o[0], $o[1] ) ] ?? array() ) ), $tables );
					$have = self::union( array( $this->api->rows( $o[0], $o[1] ) ), $tables );
					if ( array_filter( $want ) != array_filter( $have ) ) {
						return new WP_Error( 'rollback_failed', __( 'Amelia\'s earlier rows did not all come back.', 'emcp-tools' ), array( 'object' => $o ) );
					}
				}
				if ( self::present( $this->api, $inserted ) ) {
					return new WP_Error( 'rollback_failed', __( 'Rows the write added are still there.', 'emcp-tools' ) );
				}
				$this->api->rebuild_stash();
				return true;
			}
		);
	}

	/**
	 * The live constraints a direct restore bypasses (D13): links, the employee's slot, the
	 * event's places, unique emails.
	 *
	 * @return true|WP_Error
	 */
	protected function restore_checks( array $before, array $current ) {
		$gone = array();
		foreach ( self::LINKS as $table => $cols ) {
			foreach ( (array) ( $before[ $table ] ?? array() ) as $row ) {
				foreach ( $cols as $col => $target ) {
					$ref = (int) ( $row[ $col ] ?? 0 );
					if ( $ref > 0 && ! isset( $before[ $target ][ $ref ] ) && ! $this->api->row( $target, $ref ) ) {
						$gone[] = $target . ':' . $ref;
					}
				}
			}
		}
		if ( $gone ) {
			return new WP_Error( 'linked_unavailable', __( 'Something the earlier rows point at is gone (a service, employee, customer, category or event); it is not undone.', 'emcp-tools' ), array( 'status' => 409, 'missing' => array_values( array_unique( $gone ) ) ) );
		}
		foreach ( (array) ( $before['users'] ?? array() ) as $id => $u ) {
			$email = (string) ( $u['email'] ?? '' );
			$who   = '' === $email ? 0 : $this->api->user_by_email( $email );
			if ( $who && $who !== (int) $id && ! isset( $current['users'][ $who ] ) ) {
				return new WP_Error( 'email_exists', __( 'Another Amelia employee or customer has taken this email since; it is not undone.', 'emcp-tools' ), array( 'status' => 409, 'email' => $email ) );
			}
		}
		$mine = array_map( 'intval', array_keys( (array) ( $before['appointments'] ?? array() ) ) );
		foreach ( (array) ( $before['appointments'] ?? array() ) as $a ) {
			if ( in_array( (string) $a['status'], array( 'approved', 'pending' ), true ) && $this->api->overlapping( (int) $a['providerId'], (string) $a['bookingStart'], (string) $a['bookingEnd'], $mine ) ) {
				return new WP_Error( 'time_slot_unavailable', __( 'The employee has another appointment at that time now; it is not undone.', 'emcp-tools' ), array( 'status' => 409 ) );
			}
		}
		return $this->capacity_check( $before, $current );
	}

	/** The event a booking's period links point at (0 for none). */
	protected function event_of_links( array $links ): int {
		foreach ( $links as $l ) {
			$p = $this->api->row( 'events_periods', (int) $l['eventPeriodId'] );
			if ( $p ) {
				return (int) $p['eventId'];
			}
		}
		return 0;
	}

	/** Persons in approved or pending bookings. */
	protected static function persons( array $bookings ): int {
		$n = 0;
		foreach ( $bookings as $b ) {
			$n += in_array( (string) $b['status'], array( 'approved', 'pending' ), true ) ? (int) $b['persons'] : 0;
		}
		return $n;
	}

	/** D13: attendees a restore puts back must fit the event's places. @return true|WP_Error */
	protected function capacity_check( array $before, array $current ) {
		$events = array();
		foreach ( (array) ( $before['events'] ?? array() ) as $id => $e ) {
			$events[ (int) $id ] = (int) $e['maxCapacity'];
		}
		$links = (array) ( $before['customer_bookings_to_events_periods'] ?? array() );
		$ids   = array_map( 'intval', array_keys( (array) ( $before['customer_bookings'] ?? array() ) ) );
		$links = $links + ( $ids ? $this->api->rows_where( 'customer_bookings_to_events_periods', 'customerBookingId', $ids ) : array() );
		foreach ( $ids as $bid ) {
			$eid = $this->event_of_links( array_filter( $links, static fn( $l ) => (int) $l['customerBookingId'] === $bid ) );
			if ( $eid && ! isset( $events[ $eid ] ) ) {
				$events[ $eid ] = (int) ( $this->api->row( 'events', $eid )['maxCapacity'] ?? 0 );
			}
		}
		foreach ( $events as $eid => $max ) {
			$now   = (array) ( $this->api->rows( 'event', $eid )['customer_bookings'] ?? array() );
			$after = array_replace( $now, array_intersect_key( (array) ( $before['customer_bookings'] ?? array() ), $now ) );
			foreach ( (array) ( $before['customer_bookings'] ?? array() ) as $bid => $b ) {
				if ( ! isset( $after[ $bid ] ) && ( isset( $before['events'][ $eid ] ) || $this->event_of_links( array_filter( $links, static fn( $l ) => (int) $l['customerBookingId'] === (int) $bid ) ) === $eid ) ) {
					$after[ $bid ] = $b;
				}
			}
			$total = self::persons( $after );
			if ( $max > 0 && $total > $max && $total > self::persons( $now ) ) {
				return new WP_Error( 'event_full', __( 'The event has no places left for the attendees this would put back; it is not undone.', 'emcp-tools' ), array( 'status' => 409, 'event_id' => $eid ) );
			}
		}
		return true;
	}
}
