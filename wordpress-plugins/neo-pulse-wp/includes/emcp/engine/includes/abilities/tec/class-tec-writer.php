<?php
/**
 * Every The Events Calendar write (spec 4.4): leases in one fixed order, validation (D6, D22),
 * before-images, the version check, TEC's ORM with a journal of what it created, the read-back
 * check (D7), the date check against TEC's custom tables (D11), History, and recovery from the
 * before-images on any failure after a change (D20). Undo runs the same template in undo mode,
 * which records nothing.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_TEC_Writer {

	const TTL       = 60;
	const NEW_LEASE = 'tec-new';

	/** @var EMCP_Tools_Lease|null */
	private static $lease = null;

	/** @var callable|null Test seam: runs once every lease is held. */
	public static $on_lease = null;

	/** @var EMCP_Tools_TEC_Api */
	protected $api;

	/** @var bool Undo mode: no History record of its own. */
	protected $undo;

	/** @var int[] Objects the current call created (journal, D20). */
	protected $created = array();

	/** @var array The before-images of the last transact(). */
	public $last_befores = array();

	public function __construct( EMCP_Tools_TEC_Api $api, bool $undo = false ) {
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
		return 'tec-' . $kind . '-' . $id;
	}

	/** Categories, venues, organizers ascending, then the event (spec 3). @return string[] */
	public static function lock_order( array $categories, array $venues, array $organizers, int $event ): array {
		$keys = array();
		foreach ( array( 'category' => $categories, 'venue' => $venues, 'organizer' => $organizers ) as $kind => $ids ) {
			$ids = array_values( array_unique( array_filter( array_map( 'intval', $ids ) ) ) );
			sort( $ids );
			foreach ( $ids as $id ) {
				$keys[] = self::lease_key( $kind, $id );
			}
		}
		if ( $event > 0 ) {
			$keys[] = self::lease_key( 'event', $event );
		}
		return $keys;
	}

	/**
	 * Run $fn holding every lease in $keys, taken in that order and never waiting: a lease held
	 * elsewhere releases the ones taken so far and answers tec_busy.
	 *
	 * @return mixed|WP_Error
	 */
	public function locked( array $keys, callable $fn ) {
		$owner = 'tec-' . bin2hex( random_bytes( 6 ) );
		$held  = array();
		foreach ( $keys as $key ) {
			if ( ! self::lease()->acquire( $key, $owner, self::TTL ) ) {
				foreach ( array_reverse( $held ) as $h ) {
					self::lease()->release( $h, $owner );
				}
				return new WP_Error( 'tec_busy', __( 'Another change to this event, venue, organizer or category is running. Try again in a moment.', 'emcp-tools' ), array( 'status' => 409, 'lease' => $key ) );
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

	// The write template (D20).

	protected function created( int $id ): void {
		$this->created[] = $id;
	}

	/**
	 * @param int[]    $ids     Objects the write may change (their before-images are taken here).
	 * @param callable $do      Runs TEC; returns its result or a WP_Error.
	 * @param callable $verify  ( $result ) => string[] fields that differ, or a WP_Error naming the failure.
	 * @param callable $record  ( $result, array $befores ) => History change id ('' when it could not record).
	 * @return array|WP_Error {result, change, befores}
	 */
	protected function transact( array $ids, callable $do, callable $verify, callable $record ) {
		$befores = array();
		foreach ( array_unique( array_map( 'intval', $ids ) ) as $id ) {
			$befores[ $id ] = $this->api->snapshot_post( $id );
		}
		$this->last_befores = $befores;
		$this->created      = array();
		try {
			$result = $do();
		} catch ( \Throwable $e ) {
			$result = new WP_Error( 'tec_error', $e->getMessage() );
		}
		if ( is_wp_error( $result ) ) {
			if ( ! $this->created && ! $this->changed( $befores ) ) {
				return $result;
			}
			return $this->fail( 'save_failed', __( 'The Events Calendar refused part of this change; what was written was put back.', 'emcp-tools' ), $befores, array( 'tec_error' => $result->get_error_code(), 'message' => $result->get_error_message() ) );
		}
		$bad = $verify( $result );
		if ( is_wp_error( $bad ) ) {
			return $this->fail( $bad->get_error_code(), $bad->get_error_message(), $befores, (array) $bad->get_error_data() );
		}
		if ( $bad ) {
			return $this->fail( 'save_incomplete', __( 'The Events Calendar did not store the change as written; it was put back.', 'emcp-tools' ), $befores, array( 'fields' => array_values( $bad ) ) );
		}
		if ( $this->undo ) {
			return array( 'result' => $result, 'change' => '', 'befores' => $befores );
		}
		$change = (string) $record( $result, $befores );
		if ( '' === $change ) {
			return $this->fail( 'history_unavailable', __( 'History could not record this change, so it was put back.', 'emcp-tools' ), $befores, array() );
		}
		return array( 'result' => $result, 'change' => $change, 'befores' => $befores );
	}

	/** @return int[] objects whose current state differs from their before-image */
	protected function changed( array $befores ): array {
		$out = array();
		foreach ( $befores as $id => $before ) {
			if ( $this->api->snapshot_post( (int) $id ) !== $before ) {
				$out[] = (int) $id;
			}
		}
		return $out;
	}

	/** Put everything back; answer $code or partial_write. */
	protected function fail( string $code, string $message, array $befores, array $data ): WP_Error {
		$left = $this->recover( $befores );
		if ( ! $left ) {
			return new WP_Error( $code, $message, $data + array( 'restored' => true, 'status' => 409 ) );
		}
		$change = $this->undo ? '' : EMCP_Tools_TEC_History::record_recovery( $befores, $left, self::snapshot_hash( $this->api, array_keys( $befores ) ) );
		return new WP_Error( 'partial_write', __( 'The Events Calendar stopped half way and EMCP could not put everything back. History holds the earlier state of every object this changed; undo it there once the cause is fixed.', 'emcp-tools' ), array( 'objects' => $left, 'change_id' => $change, 'cause' => $code, 'status' => 500 ) + $data );
	}

	/** Journal backwards, then the before-images, then the dates (D11). @return int[] objects still different */
	protected function recover( array $befores ): array {
		foreach ( array_reverse( $this->created ) as $id ) {
			if ( ! array_key_exists( $id, $befores ) ) {
				$this->api->delete_post_permanently( $id );
			}
		}
		foreach ( $befores as $id => $before ) {
			$now = $this->api->snapshot_post( (int) $id );
			if ( $now !== $before ) {
				if ( null === $before ) {
					$this->api->delete_post_permanently( (int) $id );
				} elseif ( null === $now ) {
					$this->api->recreate_post( $before );
				} else {
					$this->api->restore_post( $before );
				}
			}
			if ( null !== $before && EMCP_Tools_TEC_Api::EVENT === $this->api->post_type( (int) $id ) && ! $this->dates_match( (int) $id ) ) {
				$this->api->sync_dates( (int) $id );
			}
		}
		$left = $this->changed( $befores );
		foreach ( $befores as $id => $before ) {
			if ( null !== $before && EMCP_Tools_TEC_Api::EVENT === $this->api->post_type( (int) $id ) && ! $this->dates_match( (int) $id ) ) {
				$left[] = (int) $id;
			}
		}
		foreach ( $this->created as $id ) {
			if ( ! array_key_exists( $id, $befores ) && null !== $this->api->snapshot_post( $id ) ) {
				$left[] = $id;
			}
		}
		return array_values( array_unique( $left ) );
	}

	public static function snapshot_hash( EMCP_Tools_TEC_Api $api, array $ids ): string {
		$s = array();
		foreach ( $ids as $id ) {
			$s[ (int) $id ] = $api->snapshot_post( (int) $id );
		}
		ksort( $s );
		return EMCP_Tools_TEC_Api::version( array( 'snapshots' => $s ) );
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

	/** @return true|WP_Error */
	protected function undo_check( string $current, string $after, bool $force ) {
		if ( ! $force && ! hash_equals( $after, $current ) ) {
			return new WP_Error( 'conflict', __( 'This changed after the History entry, so it is not undone.', 'emcp-tools' ), array( 'status' => 409, 'current_version' => $current ) );
		}
		return true;
	}

	/** Text compared as text (Review Focus 3). */
	public static function text( $v ): string {
		$s = html_entity_decode( (string) $v, ENT_QUOTES, 'UTF-8' );
		$s = (string) preg_replace( '#<(script|style)\b[^>]*>.*?</\1>#is', ' ', $s );
		$s = (string) preg_replace( '/<!--.*?-->/s', ' ', $s );
		return trim( (string) preg_replace( '/\s+/u', ' ', wp_strip_all_tags( $s ) ) );
	}

	/** A date as TEC stores it (Review Focus 1), or null when it is not one. */
	public static function full_date( string $s, bool $end, bool $all_day ): ?string {
		$s = trim( $s );
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/', $s ) ) {
			return null;
		}
		$d = DateTime::createFromFormat( 'Y-m-d', substr( $s, 0, 10 ) );
		if ( ! $d || $d->format( 'Y-m-d' ) !== substr( $s, 0, 10 ) ) {
			return null;
		}
		if ( $all_day ) {
			return substr( $s, 0, 10 ) . ( $end ? ' 23:59:59' : ' 00:00:00' );
		}
		if ( 10 === strlen( $s ) ) {
			return $s . ' 00:00:00';
		}
		$t = 16 === strlen( $s ) ? $s . ':00' : $s;
		return DateTime::createFromFormat( 'Y-m-d H:i:s', $t ) && DateTime::createFromFormat( 'Y-m-d H:i:s', $t )->format( 'Y-m-d H:i:s' ) === $t ? $t : null;
	}

	/** An identifier, UTC, or TEC's own UTC offsets (Review Focus 2). */
	public static function valid_timezone( string $tz ): bool {
		if ( 'UTC' === $tz || in_array( $tz, timezone_identifiers_list(), true ) ) {
			return true;
		}
		return (bool) preg_match( '/^UTC[+-](\d|1[0-4])(:(00|15|30|45))?$/', $tz );
	}

	/**
	 * D6, D22, Review Focus 2 and 5, before anything is written.
	 *
	 * @param array|null $stored The event's current EMCP fields (an update), null for a create.
	 * @return true|WP_Error
	 */
	protected function validate_event( array $f, ?array $stored ) {
		$all_day = array_key_exists( 'all_day', $f ) ? (bool) $f['all_day'] : (bool) ( $stored['all_day'] ?? false );
		$start   = array_key_exists( 'start_date', $f ) ? self::full_date( (string) $f['start_date'], false, $all_day ) : ( null !== $stored ? self::full_date( (string) $stored['start_date'], false, $all_day ) : null );
		$end     = array_key_exists( 'end_date', $f ) ? self::full_date( (string) $f['end_date'], true, $all_day ) : ( null !== $stored ? self::full_date( (string) $stored['end_date'], true, $all_day ) : null );
		foreach ( array( 'start_date' => $start, 'end_date' => $end ) as $k => $v ) {
			if ( array_key_exists( $k, $f ) && null === $v ) {
				/* translators: %s: argument. */
				return new WP_Error( 'invalid_date', sprintf( __( '%s must be Y-m-d H:i (or Y-m-d for an all-day event).', 'emcp-tools' ), $k ) );
			}
		}
		if ( null !== $start && null !== $end && $end < $start ) {
			return new WP_Error( 'invalid_dates', __( 'The end is before the start; The Events Calendar would ignore the change silently.', 'emcp-tools' ) );
		}
		if ( array_key_exists( 'timezone', $f ) && ! self::valid_timezone( (string) $f['timezone'] ) ) {
			return new WP_Error( 'invalid_timezone', __( 'timezone must be a time zone identifier such as Europe/Paris, UTC, or an offset such as UTC+2.', 'emcp-tools' ) );
		}
		if ( ! empty( $f['featured_image'] ) && ! $this->api->is_image( (int) $f['featured_image'] ) ) {
			return new WP_Error( 'invalid_argument', __( 'featured_image must be the id of an image in the media library (0 removes the image).', 'emcp-tools' ) );
		}
		if ( ! empty( $f['venue_id'] ) ) {
			$ok = $this->linked_ok( (int) $f['venue_id'], EMCP_Tools_TEC_Api::VENUE, 'venue' );
			if ( is_wp_error( $ok ) ) {
				return $ok;
			}
		}
		if ( array_key_exists( 'organizer_ids', $f ) ) {
			foreach ( (array) $f['organizer_ids'] as $o ) {
				if ( ! is_int( $o ) && ! ( is_string( $o ) && ctype_digit( $o ) ) ) {
					return new WP_Error( 'invalid_argument', __( 'organizer_ids must be organizer ids.', 'emcp-tools' ) );
				}
				$ok = $this->linked_ok( (int) $o, EMCP_Tools_TEC_Api::ORGANIZER, 'organizer' );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
			}
		}
		foreach ( (array) ( $f['categories'] ?? array() ) as $c ) {
			if ( ! ( is_int( $c ) || ( is_string( $c ) && ctype_digit( $c ) ) ) || ! $this->api->category( (int) $c ) ) {
				return new WP_Error( 'invalid_argument', __( 'categories must be ids of event categories (list-categories).', 'emcp-tools' ) );
			}
		}
		foreach ( (array) ( $f['tags'] ?? array() ) as $t ) {
			if ( ! is_int( $t ) && ! ( is_string( $t ) && '' !== trim( $t ) ) ) {
				return new WP_Error( 'invalid_argument', __( 'tags must be tag names or ids.', 'emcp-tools' ) );
			}
		}
		return true;
	}

	/** A venue or organizer an event may point at (D22, and readable per D21). @return true|WP_Error */
	protected function linked_ok( int $id, string $type, string $what ) {
		$t = $this->api->post_type( $id );
		if ( '' !== $t && $type !== $t ) {
			/* translators: 1: id, 2: venue or organizer. */
			return new WP_Error( 'invalid_argument', sprintf( __( '%1$d is not a %2$s.', 'emcp-tools' ), $id, $what ) );
		}
		if ( '' === $t || 'trash' === $this->api->post_status( $id ) ) {
			return new WP_Error( 'linked_unavailable', __( 'A venue or organizer it would point at is gone or in the trash.', 'emcp-tools' ), array( 'status' => 409, 'ids' => array( $id ) ) );
		}
		return EMCP_Tools_TEC_Integration::can_read_object( $this->api, $id ) ? true : new WP_Error( 'forbidden', __( 'You are not allowed to use that venue or organizer.', 'emcp-tools' ), array( 'status' => 403 ) );
	}

	/** EMCP fields to TEC's ORM aliases (one table, spec 4.4). */
	public static function orm_args( string $kind, array $fields ): array {
		$out = array();
		foreach ( EMCP_Tools_TEC_Api::field_map( $kind ) as $field => $row ) {
			if ( ! array_key_exists( $field, $fields ) || 'featured_image' === $field && 0 === (int) $fields[ $field ] ) {
				continue;
			}
			$v = $fields[ $field ];
			if ( 'venue_id' === $field ) {
				$v = (int) $v ? (int) $v : null; // spike item 15: only null clears
			} elseif ( in_array( $field, array( 'organizer_ids', 'categories' ), true ) ) {
				$v = array_values( array_map( 'intval', (array) $v ) );
			} elseif ( 'tags' === $field ) {
				$v = array_values( array_map( static fn( $t ) => is_int( $t ) ? $t : (string) $t, (array) $v ) );
			}
			$out[ $row[2] ] = $v;
		}
		return $out;
	}

	/** @return string[] the sent fields TEC did not store (D7) */
	public function mismatches( string $kind, array $sent, array $stored ): array {
		$map     = EMCP_Tools_TEC_Api::field_map( $kind );
		$all_day = (bool) ( $stored['all_day'] ?? false );
		$bad     = array();
		foreach ( $sent as $k => $v ) {
			if ( ! isset( $map[ $k ] ) ) {
				continue;
			}
			$have = $stored[ $k ] ?? null;
			switch ( $map[ $k ][3] ) {
				case 'bool':
					$ok = (bool) $v === (bool) $have;
					break;
				case 'int':
					$ok = (int) $v === (int) $have;
					break;
				case 'ints':
					$ok = array_values( array_map( 'intval', (array) $v ) ) === array_values( array_map( 'intval', (array) $have ) );
					break;
				case 'terms':
					$ok = $this->terms_match( $k, (array) $v, (array) $have );
					break;
				case 'date':
					$ok = self::full_date( (string) $v, 'end_date' === $k, $all_day ) === (string) $have;
					break;
				case 'enum':
					$ok = (string) $v === (string) $have;
					break;
				default:
					$ok = self::text( $v ) === self::text( $have );
			}
			if ( ! $ok ) {
				$bad[] = $k;
			}
		}
		return $bad;
	}

	protected function terms_match( string $field, array $sent, array $have ): bool {
		if ( count( $sent ) !== count( $have ) ) {
			return false;
		}
		if ( 'categories' === $field ) {
			$a = array_map( 'intval', $sent );
			$b = array_map( 'intval', $have );
			sort( $a );
			sort( $b );
			return $a === $b;
		}
		$names = array();
		foreach ( $have as $id ) {
			$names[ (int) $id ] = strtolower( $this->api->tag_name( (int) $id ) );
		}
		foreach ( $sent as $t ) {
			if ( is_int( $t ) ? ! isset( $names[ $t ] ) : ! in_array( strtolower( trim( (string) $t ) ), $names, true ) ) {
				return false;
			}
		}
		return true;
	}

	/** The event's custom-table row equals its meta (D11). */
	protected function dates_match( int $id ): bool {
		$raw = $this->api->fields( $id );
		if ( ! $raw ) {
			return true;
		}
		$f   = EMCP_Tools_TEC_Integration::mapped( 'event', $raw );
		$occ = $this->api->occurrence( $id );
		return $occ && (string) $occ['start_date'] === (string) $f['start_date'] && (string) $occ['end_date'] === (string) $f['end_date'] && (string) $occ['timezone'] === (string) $f['timezone'];
	}

	/** D11: the row matches, or is repaired through TEC, or the write fails. @return true|WP_Error */
	protected function check_dates( int $id ) {
		if ( $this->dates_match( $id ) ) {
			return true;
		}
		$this->api->sync_dates( $id );
		return $this->dates_match( $id ) ? true : new WP_Error( 'dates_out_of_sync', __( 'The Events Calendar did not update its calendar tables for this event, so the change was put back.', 'emcp-tools' ), array( 'status' => 500, 'id' => $id ) );
	}

	protected function answer( array $base, string $change ): array {
		return $base + array( 'change' => array( 'change_id' => $change, 'undo' => array( 'available' => '' !== $change ) ) );
	}

	/** The version of an object now ('' when it is gone). */
	public function version_of( string $kind, int $id ): string {
		if ( 'event' === $kind ) {
			$v = EMCP_Tools_TEC_Integration::event_view( $this->api, $id );
		} elseif ( 'category' === $kind ) {
			$v = EMCP_Tools_TEC_Integration::category_view( $this->api, $id );
		} else {
			$v = EMCP_Tools_TEC_Integration::linked_view( $this->api, $kind, $id );
		}
		return $v ? (string) $v['version'] : '';
	}

	protected function fields_of( string $kind, int $id ): array {
		$raw = $this->api->fields( $id );
		return $raw ? EMCP_Tools_TEC_Integration::mapped( $kind, $raw ) : array();
	}

	/** Verify an event write: the read-back, then the dates. @return string[]|WP_Error */
	protected function verify_event( int $id, array $sent ) {
		$bad = $this->mismatches( 'event', $sent, $this->fields_of( 'event', $id ) );
		if ( $bad ) {
			return $bad;
		}
		$d = $this->check_dates( $id );
		return is_wp_error( $d ) ? $d : array();
	}

	protected static function recurring(): WP_Error {
		return new WP_Error( 'recurring_event_unsupported', __( 'This is a recurring event of Events Calendar Pro; change it in The Events Calendar, whose occurrences belong to Pro.', 'emcp-tools' ), array( 'status' => 409 ) );
	}

	// Events (spec 4.2).

	/** @return array|WP_Error */
	public function create_event( array $fields ) {
		$fields += array( 'status' => 'draft' ); // D8
		$ok      = $this->validate_event( $fields, null );
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$keys   = self::lock_order( array(), array( (int) ( $fields['venue_id'] ?? 0 ) ), (array) ( $fields['organizer_ids'] ?? array() ), 0 );
		$keys[] = self::NEW_LEASE;
		return $this->locked(
			$keys,
			function () use ( $fields ) {
				$ok = $this->validate_event( $fields, null );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$t = $this->transact(
					array(),
					function () use ( $fields ) {
						$id = $this->api->create( 'event', self::orm_args( 'event', $fields ) );
						if ( is_wp_error( $id ) ) {
							return $id;
						}
						$this->created( $id );
						return $id;
					},
					fn( $id ) => $this->verify_event( (int) $id, $fields ),
					fn( $id ) => EMCP_Tools_TEC_History::record_object( 'event', 'created', 'create-event', (int) $id, null, $this->version_of( 'event', (int) $id ) )
				);
				return is_wp_error( $t ) ? $t : $this->event_answer( (int) $t['result'], $t['change'] );
			}
		);
	}

	protected function event_answer( int $id, string $change ): array {
		$v = EMCP_Tools_TEC_Integration::event_view( $this->api, $id );
		return $this->answer( array( 'id' => $id, 'status' => $this->api->post_status( $id ), 'version' => $v ? $v['version'] : '', 'url' => $this->api->url( $id ), 'edit_url' => admin_url( 'post.php?post=' . $id . '&action=edit' ) ), $change );
	}

	/** @return array|WP_Error */
	public function update_event( int $id, ?string $version, bool $force, array $changes ) {
		if ( ! $changes ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		if ( $this->api->is_recurring( $id ) ) {
			return self::recurring();
		}
		$stored = $this->fields_of( 'event', $id );
		$ok     = $this->validate_event( $changes, $stored );
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		$keys = self::lock_order( array(), array( (int) ( $stored['venue_id'] ?? 0 ), (int) ( $changes['venue_id'] ?? 0 ) ), array_merge( (array) ( $stored['organizer_ids'] ?? array() ), (array) ( $changes['organizer_ids'] ?? array() ) ), $id );
		return $this->locked(
			$keys,
			function () use ( $id, $version, $force, $changes ) {
				$check = self::version_check( $this->version_of( 'event', $id ), $version, $force, 'get-event' );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				$ok = $this->validate_event( $changes, $this->fields_of( 'event', $id ) );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				$t = $this->transact(
					array( $id ),
					function () use ( $id, $changes ) {
						$args = self::orm_args( 'event', $changes );
						if ( $args ) {
							$r = $this->api->update( 'event', $id, $args );
							if ( is_wp_error( $r ) ) {
								return $r;
							}
						}
						if ( array_key_exists( 'featured_image', $changes ) && 0 === (int) $changes['featured_image'] && ! $this->api->remove_thumbnail( $id ) ) {
							return new WP_Error( 'save_failed', __( 'The featured image could not be removed.', 'emcp-tools' ) );
						}
						return $id;
					},
					fn() => $this->verify_event( $id, $changes ),
					fn( $r, $befores ) => EMCP_Tools_TEC_History::record_object( 'event', 'edit', 'update-event', $id, $befores[ $id ], $this->version_of( 'event', $id ) )
				);
				return is_wp_error( $t ) ? $t : $this->event_answer( $id, $t['change'] );
			}
		);
	}

	/** D14. @return array|WP_Error */
	public function set_event_status( int $id, ?string $version, bool $force, string $status, string $reason ) {
		if ( $this->api->is_recurring( $id ) ) {
			return self::recurring();
		}
		$raw = array( 'scheduled' => '', 'cancelled' => 'canceled', 'postponed' => 'postponed' )[ $status ] ?? null;
		if ( null === $raw ) {
			return new WP_Error( 'invalid_argument', __( 'event_status must be scheduled, cancelled or postponed.', 'emcp-tools' ) );
		}
		return $this->locked(
			array( self::lease_key( 'event', $id ) ),
			function () use ( $id, $version, $force, $raw, $reason ) {
				$check = self::version_check( $this->version_of( 'event', $id ), $version, $force, 'get-event' );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				$t = $this->transact(
					array( $id ),
					fn() => $this->api->set_event_status( $id, $raw, '' === $raw ? '' : $reason ) ? $id : new WP_Error( 'save_failed', __( 'The event status was not saved.', 'emcp-tools' ) ),
					function () use ( $id, $raw, $reason ) {
						$m = (array) ( $this->api->fields( $id )['meta'] ?? array() );
						$s = (string) ( $m[ EMCP_Tools_TEC_Api::STATUS_KEY ][0] ?? '' );
						$r = (string) ( $m[ EMCP_Tools_TEC_Api::REASON_KEY ][0] ?? '' );
						return ( $s === $raw && ( '' === $raw || self::text( $r ) === self::text( $reason ) ) ) ? array() : array( 'event_status' );
					},
					fn( $r, $befores ) => EMCP_Tools_TEC_History::record_object( 'event', 'edit', 'set-event-status', $id, $befores[ $id ], $this->version_of( 'event', $id ) )
				);
				return is_wp_error( $t ) ? $t : $this->event_answer( $id, $t['change'] );
			}
		);
	}

	// Undo (spec 6).

	/** Undo a create: delete it permanently (a linked venue or organizer stays, D19). @return true|WP_Error */
	public function undo_create( string $kind, int $id, string $after, bool $force ) {
		return $this->locked(
			array( self::lease_key( $kind, $id ) ),
			function () use ( $kind, $id, $after, $force ) {
				if ( '' === $this->api->post_type( $id ) ) {
					return new WP_Error( 'conflict', __( 'It is gone already.', 'emcp-tools' ) );
				}
				if ( 'event' !== $kind && $this->api->linked_events( $id, $kind ) ) {
					return new WP_Error( 'in_use', __( 'Events link to it, so it is not deleted (force does not change this).', 'emcp-tools' ), array( 'events' => $this->api->linked_events( $id, $kind ) ) );
				}
				$check = $this->undo_check( $this->version_of( $kind, $id ), $after, $force );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				return $this->api->delete_post_permanently( $id ) ? true : new WP_Error( 'rollback_failed', __( 'It could not be deleted.', 'emcp-tools' ) );
			}
		);
	}

	/** Undo an edit: the before-image back (links checked first for an event, D22), dates synced and checked. @return true|WP_Error */
	public function undo_restore( string $kind, int $id, array $before, string $after, bool $force ) {
		return $this->locked(
			$this->restore_keys( $kind, $id, $before ),
			function () use ( $kind, $id, $before, $after, $force ) {
				if ( 'event' === $kind ) {
					$links = $this->validate_links( $before );
					if ( is_wp_error( $links ) ) {
						return $links;
					}
				}
				$check = $this->undo_check( $this->version_of( $kind, $id ), $after, $force );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				return $this->restore_one( $id, $before );
			}
		);
	}

	/** The venue and organizer ids a raw before-image names. @return array{0: int[], 1: int[]} */
	protected static function record_links( array $record ): array {
		$meta = (array) ( $record['meta'] ?? array() );
		$v    = array_values( array_filter( array_map( 'intval', (array) ( $meta['_EventVenueID'] ?? array() ) ) ) );
		$o    = array_values( array_filter( array_map( 'intval', (array) ( $meta['_EventOrganizerID'] ?? array() ) ) ) );
		return array( $v, $o );
	}

	/** The leases of an event restore: the venue and organizers it restores and the current ones (D22). */
	protected function restore_keys( string $kind, int $id, array $before ): array {
		if ( 'event' !== $kind ) {
			return array( self::lease_key( $kind, $id ) );
		}
		list( $v, $o ) = self::record_links( $before );
		$now           = $this->fields_of( 'event', $id );
		return self::lock_order( array(), array_merge( $v, array( (int) ( $now['venue_id'] ?? 0 ) ) ), array_merge( $o, (array) ( $now['organizer_ids'] ?? array() ) ), $id );
	}

	/** D22: every venue and organizer a restore would point at exists and is outside the trash. @return true|WP_Error */
	public function validate_links( array $record ) {
		list( $v, $o ) = self::record_links( $record );
		$bad           = array();
		foreach ( array( EMCP_Tools_TEC_Api::VENUE => $v, EMCP_Tools_TEC_Api::ORGANIZER => $o ) as $type => $ids ) {
			foreach ( $ids as $id ) {
				if ( $type !== $this->api->post_type( $id ) || 'trash' === $this->api->post_status( $id ) ) {
					$bad[] = $id;
				}
			}
		}
		return $bad ? new WP_Error( 'linked_unavailable', __( 'A venue or organizer this would point the event at is gone or in the trash; restore it first.', 'emcp-tools' ), array( 'status' => 409, 'ids' => $bad ) ) : true;
	}

	/** @return true|WP_Error */
	protected function restore_one( int $id, array $before ) {
		$t = $this->transact(
			array( $id ),
			fn() => $this->api->restore_post( $before ) ? true : new WP_Error( 'rollback_failed', __( 'The earlier state could not be written back.', 'emcp-tools' ) ),
			function () use ( $id, $before ) {
				if ( $this->api->snapshot_post( $id ) !== $before ) {
					return array( 'before_image' );
				}
				if ( EMCP_Tools_TEC_Api::EVENT === $this->api->post_type( $id ) ) {
					$d = $this->check_dates( $id );
					if ( is_wp_error( $d ) ) {
						return $d;
					}
				}
				return array();
			},
			fn() => ''
		);
		return is_wp_error( $t ) ? $t : true;
	}

	/** Undo a tec-recovery entry: every before-image back. @return true|WP_Error */
	public function undo_recovery( array $befores, string $after, bool $force ) {
		$check = $this->undo_check( self::snapshot_hash( $this->api, array_keys( $befores ) ), $after, $force );
		if ( is_wp_error( $check ) ) {
			return $check;
		}
		$this->created = array();
		$left          = $this->recover( $befores );
		return $left ? new WP_Error( 'rollback_failed', __( 'Some objects could not be put back yet.', 'emcp-tools' ), array( 'objects' => $left ) ) : true;
	}

	// Trash (D9, D10).

	/** @return array|WP_Error */
	public function trash( string $kind, int $id, ?string $version, bool $force ) {
		if ( 'event' === $kind && $this->api->is_recurring( $id ) ) {
			return self::recurring();
		}
		return $this->locked(
			array( self::lease_key( $kind, $id ) ),
			function () use ( $kind, $id, $version, $force ) {
				$check = self::version_check( $this->version_of( $kind, $id ), $version, $force, 'get-' . $kind );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				if ( 'event' !== $kind ) {
					$linked = $this->api->linked_events( $id, $kind );
					if ( $linked ) {
						/* translators: %s: venue or organizer. */
						return new WP_Error( 'in_use', sprintf( __( 'Events outside the trash link to this %s; unlink it from them first (D10: The Events Calendar would leave them pointing at the trash).', 'emcp-tools' ), $kind ), array( 'status' => 409, 'events' => $linked ) );
					}
				}
				$status = $this->api->post_status( $id );
				$t      = $this->transact(
					array( $id ),
					fn() => $this->api->trash_post( $id ) ? $id : new WP_Error( 'save_failed', __( 'It could not be moved to the trash.', 'emcp-tools' ) ),
					fn() => 'trash' === $this->api->post_status( $id ) ? array() : array( 'status' ),
					fn( $r, $befores ) => EMCP_Tools_TEC_History::record_object( $kind, 'trashed', 'trash-' . $kind, $id, $befores[ $id ], 'trashed', array( 'status' => $status ) )
				);
				return is_wp_error( $t ) ? $t : $this->answer( array( 'id' => $id, 'status' => 'trash' ), $t['change'] );
			}
		);
	}

	/** Undo a trash: the recorded status back; for an event its links first (D22). @return true|WP_Error */
	public function undo_trash( string $kind, int $id, string $status, array $before ) {
		return $this->locked(
			$this->restore_keys( $kind, $id, $before ),
			function () use ( $kind, $id, $status, $before ) {
				if ( 'trash' !== $this->api->post_status( $id ) ) {
					return new WP_Error( 'conflict', __( 'It is no longer in the trash.', 'emcp-tools' ) );
				}
				if ( 'event' === $kind ) {
					$links = $this->validate_links( $before );
					if ( is_wp_error( $links ) ) {
						return $links;
					}
				}
				return $this->api->untrash( $id, $status ) ? true : new WP_Error( 'rollback_failed', __( 'It could not be taken out of the trash.', 'emcp-tools' ) );
			}
		);
	}

	// Venues and organizers (spec 4.2).

	/** @return array|WP_Error */
	public function create_linked( string $kind, array $fields ) {
		$fields += array( 'status' => 'draft' );
		return $this->locked(
			array( self::NEW_LEASE ),
			function () use ( $kind, $fields ) {
				$t = $this->transact(
					array(),
					function () use ( $kind, $fields ) {
						$id = $this->api->create( $kind, self::orm_args( $kind, $fields ) );
						if ( is_wp_error( $id ) ) {
							return $id;
						}
						$this->created( $id );
						return $id;
					},
					fn( $id ) => $this->mismatches( $kind, $fields, $this->fields_of( $kind, (int) $id ) ),
					fn( $id ) => EMCP_Tools_TEC_History::record_object( $kind, 'created', 'create-' . $kind, (int) $id, null, $this->version_of( $kind, (int) $id ) )
				);
				return is_wp_error( $t ) ? $t : $this->linked_answer( $kind, (int) $t['result'], $t['change'] );
			}
		);
	}

	/** @return array|WP_Error */
	public function update_linked( string $kind, int $id, ?string $version, bool $force, array $changes ) {
		if ( ! $changes ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		return $this->locked(
			array( self::lease_key( $kind, $id ) ),
			function () use ( $kind, $id, $version, $force, $changes ) {
				$check = self::version_check( $this->version_of( $kind, $id ), $version, $force, 'get-' . $kind );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				$t = $this->transact(
					array( $id ),
					function () use ( $kind, $id, $changes ) {
						$r = $this->api->update( $kind, $id, self::orm_args( $kind, $changes ) );
						return is_wp_error( $r ) ? $r : $id;
					},
					fn() => $this->mismatches( $kind, $changes, $this->fields_of( $kind, $id ) ),
					fn( $r, $befores ) => EMCP_Tools_TEC_History::record_object( $kind, 'edit', 'update-' . $kind, $id, $befores[ $id ], $this->version_of( $kind, $id ) )
				);
				return is_wp_error( $t ) ? $t : $this->linked_answer( $kind, $id, $t['change'] );
			}
		);
	}

	protected function linked_answer( string $kind, int $id, string $change ): array {
		return $this->answer( array( 'id' => $id, 'status' => $this->api->post_status( $id ), 'version' => $this->version_of( $kind, $id ), 'url' => $this->api->viewable( EMCP_Tools_TEC_Api::TYPES[ $kind ] ) ? $this->api->url( $id ) : '' ), $change );
	}

	// Categories (D16, D23): WordPress terms, versioned and leased like the posts.

	/** @return string[] the sent category fields WordPress did not store */
	protected function category_mismatches( int $id, array $sent ): array {
		$c   = $this->api->category( $id );
		$bad = array();
		foreach ( $sent as $k => $v ) {
			$have = $c[ $k ] ?? null;
			$ok   = 'parent' === $k ? (int) $v === (int) $have : ( 'slug' === $k ? strtolower( (string) $v ) === strtolower( (string) $have ) : self::text( $v ) === self::text( $have ) );
			if ( ! $ok ) {
				$bad[] = $k;
			}
		}
		return $bad;
	}

	/** @return true|WP_Error */
	protected function validate_category( array $f ) {
		if ( array_key_exists( 'name', $f ) && '' === trim( (string) $f['name'] ) ) {
			return new WP_Error( 'invalid_argument', __( 'name cannot be empty.', 'emcp-tools' ) );
		}
		if ( ! empty( $f['parent'] ) && ! $this->api->category( (int) $f['parent'] ) ) {
			return new WP_Error( 'invalid_argument', __( 'parent must be an event category id (list-categories).', 'emcp-tools' ) );
		}
		return true;
	}

	/** @return array|WP_Error */
	public function create_category( array $fields ) {
		$ok = $this->validate_category( $fields );
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		return $this->locked(
			array( self::NEW_LEASE ),
			function () use ( $fields ) {
				$id = $this->api->insert_category( $fields );
				if ( is_wp_error( $id ) ) {
					return $id;
				}
				$bad = $this->category_mismatches( (int) $id, $fields );
				if ( $bad ) {
					$this->api->delete_category( (int) $id );
					return new WP_Error( 'save_incomplete', __( 'WordPress did not store the category as written; it was removed.', 'emcp-tools' ), array( 'fields' => $bad, 'restored' => true, 'status' => 409 ) );
				}
				$change = $this->undo ? '' : EMCP_Tools_TEC_History::record_category( 'created', 'create-category', (int) $id, null, $this->version_of( 'category', (int) $id ) );
				if ( ! $this->undo && '' === $change ) {
					$this->api->delete_category( (int) $id );
					return new WP_Error( 'history_unavailable', __( 'History could not record this change, so it was put back.', 'emcp-tools' ), array( 'restored' => true ) );
				}
				return $this->answer( array( 'id' => (int) $id, 'version' => $this->version_of( 'category', (int) $id ) ), $change );
			}
		);
	}

	/** @return array|WP_Error */
	public function update_category( int $id, ?string $version, bool $force, array $changes ) {
		if ( ! $changes ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		$ok = $this->validate_category( $changes );
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		if ( ! empty( $changes['parent'] ) && (int) $changes['parent'] === $id ) {
			return new WP_Error( 'invalid_argument', __( 'A category cannot be its own parent.', 'emcp-tools' ) );
		}
		return $this->locked(
			array( self::lease_key( 'category', $id ) ),
			function () use ( $id, $version, $force, $changes ) {
				$check = self::version_check( $this->version_of( 'category', $id ), $version, $force, 'list-categories' );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				$before = $this->api->category( $id );
				$r      = $this->api->update_category( $id, $changes );
				$bad    = is_wp_error( $r ) ? null : $this->category_mismatches( $id, $changes );
				if ( is_wp_error( $r ) || $bad ) {
					$changed = $this->api->category( $id ) !== $before;
					if ( $changed ) {
						$this->api->restore_category( $before );
					}
					if ( is_wp_error( $r ) && ! $changed ) {
						return $r;
					}
					return new WP_Error( is_wp_error( $r ) ? 'save_failed' : 'save_incomplete', __( 'WordPress did not store the category as written; it was put back.', 'emcp-tools' ), array( 'fields' => (array) $bad, 'restored' => $this->api->category( $id ) === $before, 'status' => 409 ) );
				}
				$change = $this->undo ? '' : EMCP_Tools_TEC_History::record_category( 'edit', 'update-category', $id, $before, $this->version_of( 'category', $id ) );
				if ( ! $this->undo && '' === $change ) {
					$this->api->restore_category( $before );
					return new WP_Error( 'history_unavailable', __( 'History could not record this change, so it was put back.', 'emcp-tools' ), array( 'restored' => true ) );
				}
				return $this->answer( array( 'id' => $id, 'version' => $this->version_of( 'category', $id ) ), $change );
			}
		);
	}

	/** @return true|WP_Error */
	public function undo_category_create( int $id, string $after, bool $force ) {
		return $this->locked(
			array( self::lease_key( 'category', $id ) ),
			function () use ( $id, $after, $force ) {
				if ( ! $this->api->category( $id ) ) {
					return new WP_Error( 'conflict', __( 'It is gone already.', 'emcp-tools' ) );
				}
				if ( $this->api->category_use( $id ) > 0 ) {
					return new WP_Error( 'in_use', __( 'Events use this category, so it is not deleted (force does not change this).', 'emcp-tools' ) );
				}
				$check = $this->undo_check( $this->version_of( 'category', $id ), $after, $force );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				return $this->api->delete_category( $id ) ? true : new WP_Error( 'rollback_failed', __( 'It could not be deleted.', 'emcp-tools' ) );
			}
		);
	}

	/** @return true|WP_Error */
	public function undo_category_edit( int $id, array $before, string $after, bool $force ) {
		return $this->locked(
			array( self::lease_key( 'category', $id ) ),
			function () use ( $id, $before, $after, $force ) {
				$check = $this->undo_check( $this->version_of( 'category', $id ), $after, $force );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				$want = array_intersect_key( $before, array( 'id' => 1, 'name' => 1, 'slug' => 1, 'parent' => 1, 'description' => 1, 'meta' => 1 ) );
				if ( ! $this->api->restore_category( $before ) ) {
					return new WP_Error( 'rollback_failed', __( 'The category could not be put back.', 'emcp-tools' ) );
				}
				$now = (array) $this->api->category( $id );
				return array_intersect_key( $now, $want ) == $want ? true : new WP_Error( 'rollback_failed', __( 'The category could not be put back exactly.', 'emcp-tools' ) );
			}
		);
	}
}
