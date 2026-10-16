<?php
/**
 * History for the Amelia tools (spec 6): one entry per write with the before-image of every row
 * it could touch, the after-state, what Amelia created and who it notified; current hashes; undo
 * through EMCP_Tools_Amelia_Writer::undo(); blockers that force does not override (D13). Runtime:
 * booted in wire_runtime_hooks(), so an undo works from the admin History screen too.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_Amelia_History {

	const TYPES = array(
		'amelia-category'    => 'category',
		'amelia-service'     => 'service',
		'amelia-employee'    => 'employee',
		'amelia-customer'    => 'customer',
		'amelia-appointment' => 'appointment',
		'amelia-event'       => 'event',
		'amelia-booking'     => 'booking',
	);

	const RECOVERY = 'amelia-recovery';

	/** @var EMCP_Tools_Amelia_Api|null */
	private static $api = null;

	public static function use_api( ?EMCP_Tools_Amelia_Api $api ): void {
		self::$api = $api;
	}

	private static function api(): EMCP_Tools_Amelia_Api {
		if ( self::$api ) {
			return self::$api;
		}
		// An undo can run before the deferred MCP surface loads (an admin History request).
		foreach ( array( 'EMCP_Tools_Amelia_Api' => 'class-amelia-api.php', 'EMCP_Tools_Amelia_Writer' => 'class-amelia-writer.php', 'EMCP_Tools_Amelia_Integration' => 'class-amelia-integration.php' ) as $class => $file ) {
			if ( ! class_exists( $class ) ) {
				require_once __DIR__ . '/' . $file;
			}
		}
		return EMCP_Tools_Amelia_Integration::shared_api();
	}

	private static function writer(): EMCP_Tools_Amelia_Writer {
		return new EMCP_Tools_Amelia_Writer( self::api(), true );
	}

	/** @return string[] */
	private static function types(): array {
		return array_merge( array_keys( self::TYPES ), array( self::RECOVERY ) );
	}

	public static function boot(): void {
		if ( ! has_filter( 'emcp_tools_change_apply_rollback', array( __CLASS__, 'filter_apply' ) ) ) {
			add_filter( 'emcp_tools_change_current_hash', array( __CLASS__, 'filter_hash' ), 10, 2 );
			add_filter( 'emcp_tools_change_apply_rollback', array( __CLASS__, 'filter_apply' ), 10, 3 );
			add_filter( 'emcp_tools_change_rollback_blocker', array( __CLASS__, 'filter_blocker' ), 10, 2 );
		}
	}

	private static function record( string $action, string $target, string $summary, array $rb, array $heavy = array() ): string {
		if ( ! class_exists( 'EMCP_Tools_Change_Log' ) ) {
			return '';
		}
		return EMCP_Tools_Change_Log::record(
			array(
				'domain'   => 'amelia',
				'action'   => $action,
				'target'   => $target,
				'summary'  => $summary,
				'rollback' => $heavy ? ( class_exists( 'EMCP_Tools_Change_Recorder' ) ? EMCP_Tools_Change_Recorder::attach_before( $rb, $heavy ) : array_merge( $rb, $heavy ) ) : $rb,
			)
		);
	}

	private static function heavy( array $rb ): array {
		if ( class_exists( 'EMCP_Tools_Change_Recorder' ) && method_exists( 'EMCP_Tools_Change_Recorder', 'resolve_before' ) ) {
			return (array) EMCP_Tools_Change_Recorder::resolve_before( $rb );
		}
		return $rb;
	}

	/** Tables a captured write touched. @return string[] */
	private static function tables( array $cap ): array {
		return array_values( array_unique( array_merge( array_keys( (array) $cap['inserted'] ), (array) $cap['updated'], (array) $cap['deleted'] ) ) );
	}

	private static function label( string $kind, int $id, array $befores ): string {
		$api  = self::api();
		$row  = $api->row( EMCP_Tools_Amelia_Writer::PRIMARY[ $kind ] ?? '', $id );
		$name = '';
		if ( $row ) {
			$name = isset( $row['firstName'] ) ? trim( $row['firstName'] . ' ' . $row['lastName'] ) : (string) ( $row['name'] ?? '' );
		}
		return '' !== $name ? '"' . $name . '"' : '#' . $id;
	}

	/**
	 * One write.
	 *
	 * @param string $mode    created, edit or deleted.
	 * @param array  $objects [kind, id] pairs (ids filled in).
	 * @param array  $befores "kind:id" => rows before ([] for what the write created).
	 * @param array  $cap     EMCP_Tools_Amelia_Api::capture() answer.
	 */
	public static function record_write( string $kind, string $mode, string $op, int $id, array $objects, array $befores, array $cap, array $notified ): string {
		$type = array_search( $kind, self::TYPES, true );
		$rb   = array(
			'type'       => $type,
			'mode'       => $mode,
			'id'         => $id,
			'objects'    => array_values( $objects ),
			'tables'     => self::tables( $cap ),
			'created'    => (array) $cap['inserted'],
			'notified'   => array_values( $notified ),
			'after_hash' => EMCP_Tools_Amelia_Writer::state_hash( self::api(), $objects ),
		);
		$to   = array_values( array_unique( array_column( $notified, 'recipient' ) ) );
		/* translators: 1: kind, 2: name, 3: operation. */
		$summary = sprintf( __( 'Amelia: %1$s %2$s (%3$s)', 'emcp-tools' ), $kind, self::label( $kind, $id, $befores ), $op );
		if ( $to ) {
			/* translators: %s: who was notified. */
			$summary .= ' ' . sprintf( __( '- Amelia notified: %s (undo does not unsend it)', 'emcp-tools' ), implode( ', ', $to ) );
		}
		return self::record( $op, 'amelia ' . $kind . ' ' . $id, $summary, $rb, array( 'before' => $befores ) );
	}

	/** A write EMCP could not put back (D7): its undo puts every before-image back and removes what it added. */
	public static function record_recovery( array $objects, array $befores, array $cap, array $left ): string {
		$objects = array_values( array_filter( $objects, static fn( $o ) => (int) $o[1] > 0 ) );
		$rb      = array(
			'type'       => self::RECOVERY,
			'mode'       => 'recovery',
			'objects'    => $objects,
			'tables'     => self::tables( $cap ),
			'inserted'   => (array) $cap['inserted'],
			'left'       => array_values( $left ),
			'after_hash' => EMCP_Tools_Amelia_Writer::state_hash( self::api(), $objects, (array) $cap['inserted'] ),
		);
		return self::record( 'recovery', 'amelia recovery', __( 'Amelia: a write that could not be put back', 'emcp-tools' ), $rb, array( 'before' => $befores ) );
	}

	/** A throw whose inserts could not be attributed (D7): recorded for the audit trail only. */
	public static function record_uncertain( array $tables, string $cause ): string {
		/* translators: 1: tables, 2: Amelia's error. */
		$reason = sprintf( __( 'Amelia stopped half way (%2$s) and EMCP could not tell which rows it wrote in %1$s, so it changed nothing; check them in Amelia.', 'emcp-tools' ), implode( ', ', $tables ), $cause );
		return self::record( 'recovery', 'amelia recovery', __( 'Amelia: a write whose rows could not be attributed', 'emcp-tools' ), array( 'type' => 'irreversible', 'reason' => $reason, 'tables' => array_values( $tables ) ) );
	}

	/**
	 * @param string $hash '' when unknown.
	 * @param array  $rb   Rollback ref.
	 */
	public static function filter_hash( $hash, $rb ) {
		$type = (string) ( $rb['type'] ?? '' );
		if ( ! in_array( $type, self::types(), true ) || ! self::api()->active() ) {
			return $hash;
		}
		$objects = array_map( static fn( $o ) => array( (string) $o[0], (int) $o[1] ), (array) ( $rb['objects'] ?? array() ) );
		return EMCP_Tools_Amelia_Writer::state_hash( self::api(), $objects, (array) ( $rb['inserted'] ?? array() ) );
	}

	/**
	 * @param true|WP_Error|null $result null when unhandled.
	 * @param array              $rb     Rollback ref.
	 * @param bool               $force  Caller's force flag.
	 * @return true|WP_Error|null
	 */
	public static function filter_apply( $result, $rb, $force = false ) {
		$type = (string) ( $rb['type'] ?? '' );
		if ( ! in_array( $type, self::types(), true ) ) {
			return $result;
		}
		return self::writer()->undo( self::heavy( (array) $rb ), (bool) $force );
	}

	/**
	 * @param true|WP_Error $blocker
	 * @return true|WP_Error
	 */
	public static function filter_blocker( $blocker, array $entry ) {
		$rb = (array) ( $entry['rollback'] ?? array() );
		if ( is_wp_error( $blocker ) || ! in_array( (string) ( $rb['type'] ?? '' ), self::types(), true ) ) {
			return $blocker;
		}
		$b = self::blocker( self::api(), self::heavy( $rb ) );
		return is_wp_error( $b ) ? $b : $blocker;
	}

	/**
	 * Later real work blocks an undo; force does not change this (D13). Checked by the change log
	 * outside any lease and again by the undo inside its leases.
	 *
	 * @return true|WP_Error
	 */
	public static function blocker( EMCP_Tools_Amelia_Api $api, array $rb ) {
		if ( ! $api->active() ) {
			return new WP_Error( 'amelia_inactive', __( 'Amelia is not active, so this change cannot be undone until it is switched on again.', 'emcp-tools' ) );
		}
		$befores = (array) ( $rb['before'] ?? array() );
		foreach ( (array) ( $rb['objects'] ?? array() ) as $o ) {
			$kind    = (string) $o[0];
			$id      = (int) $o[1];
			$key     = EMCP_Tools_Amelia_Writer::ref_key( $kind, $id );
			$created = array_key_exists( $key, $befores ) && array() === (array) $befores[ $key ];
			if ( ! $created || ! in_array( $kind, array( 'service', 'employee', 'customer' ), true ) || ! $api->rows( $kind, $id ) ) {
				continue;
			}
			$used = 'service' === $kind ? $api->service_use( $id ) : array_sum( $api->usage( $kind, $id ) );
			if ( $used > 0 ) {
				/* translators: %s: kind. */
				return new WP_Error( 'in_use', sprintf( __( 'This %s has appointments or event bookings now, so its creation is not undone (force does not change this).', 'emcp-tools' ), $kind ), array( 'status' => 409 ) );
			}
		}
		return self::booking_blocker( $api, $rb );
	}

	/**
	 * Customers' real work since the write, among the rows the undo would delete or put back: a
	 * payment that moved on from what the write left, a booking nobody recorded here (another
	 * customer booked since).
	 *
	 * @return true|WP_Error
	 */
	private static function booking_blocker( EMCP_Tools_Amelia_Api $api, array $rb ) {
		$befores = (array) ( $rb['before'] ?? array() );
		$tables  = array_map( 'strval', (array) ( $rb['tables'] ?? array() ) );
		$created = array_map( 'intval', (array) ( $rb['created']['customer_bookings'] ?? array() ) );
		foreach ( (array) ( $rb['objects'] ?? array() ) as $o ) {
			$kind = (string) $o[0];
			if ( ! in_array( $kind, array( 'appointment', 'event', 'booking' ), true ) ) {
				continue;
			}
			$key    = EMCP_Tools_Amelia_Writer::ref_key( $kind, (int) $o[1] );
			$before = (array) ( $befores[ $key ] ?? array() );
			$fresh  = array_key_exists( $key, $befores ) && array() === $before;
			$now    = $api->rows( $kind, (int) $o[1] );
			if ( $fresh || in_array( 'payments', $tables, true ) || in_array( 'customer_bookings', $tables, true ) ) {
				foreach ( (array) ( $now['payments'] ?? array() ) as $pid => $p ) {
					$was = (string) ( $before['payments'][ $pid ]['status'] ?? 'pending' );
					if ( (string) $p['status'] !== $was ) {
						return new WP_Error( 'payment_moved', __( 'A payment of this booking moved on since (it is no longer what the write left), so it is not undone (force does not change this).', 'emcp-tools' ), array( 'status' => 409, 'payment_id' => (int) $pid ) );
					}
				}
			}
			if ( $fresh || in_array( 'customer_bookings', $tables, true ) ) {
				foreach ( array_keys( (array) ( $now['customer_bookings'] ?? array() ) ) as $bid ) {
					if ( ! isset( $before['customer_bookings'][ $bid ] ) && ! in_array( (int) $bid, $created, true ) ) {
						return new WP_Error( 'bookings_since', __( 'Another customer booked into this since, so it is not undone (force does not change this).', 'emcp-tools' ), array( 'status' => 409, 'booking_id' => (int) $bid ) );
					}
				}
			}
		}
		return true;
	}
}
