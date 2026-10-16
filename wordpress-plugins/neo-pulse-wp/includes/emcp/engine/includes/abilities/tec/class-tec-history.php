<?php
/**
 * History for The Events Calendar tools (spec 6): records, current hashes, undo, and the blocker
 * that keeps every entry pending while TEC is off. Runtime: booted in wire_runtime_hooks(), so an
 * undo works from the admin History screen too.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_TEC_History {

	const EVENT     = 'tec-event';
	const VENUE     = 'tec-venue';
	const ORGANIZER = 'tec-organizer';
	const CATEGORY  = 'tec-category';
	const RECOVERY  = 'tec-recovery';

	const KINDS = array( self::EVENT => 'event', self::VENUE => 'venue', self::ORGANIZER => 'organizer', self::CATEGORY => 'category' );

	/** @var EMCP_Tools_TEC_Api|null */
	private static $api = null;

	public static function use_api( ?EMCP_Tools_TEC_Api $api ): void {
		self::$api = $api;
	}

	private static function api(): EMCP_Tools_TEC_Api {
		if ( self::$api ) {
			return self::$api;
		}
		// An undo can run before the deferred MCP surface loads (an admin History request).
		foreach ( array( 'EMCP_Tools_TEC_Api' => 'class-tec-api.php', 'EMCP_Tools_TEC_Writer' => 'class-tec-writer.php', 'EMCP_Tools_TEC_Integration' => 'class-tec-integration.php' ) as $class => $file ) {
			if ( ! class_exists( $class ) ) {
				require_once __DIR__ . '/' . $file;
			}
		}
		return EMCP_Tools_TEC_Integration::shared_api();
	}

	private static function writer(): EMCP_Tools_TEC_Writer {
		return new EMCP_Tools_TEC_Writer( self::api(), true );
	}

	/** @return string[] */
	private static function types(): array {
		return array( self::EVENT, self::VENUE, self::ORGANIZER, self::CATEGORY, self::RECOVERY );
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
				'domain'   => 'tec',
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

	/**
	 * An event, venue or organizer write.
	 *
	 * @param string     $kind   event, venue or organizer.
	 * @param string     $mode   created, edit or trashed.
	 * @param array|null $before The before-image (edit, trashed).
	 * @param string     $after  The version after the write ('trashed' for a trash).
	 * @param array      $extra  Extra rollback keys (the earlier status of a trash).
	 */
	public static function record_object( string $kind, string $mode, string $op, int $id, ?array $before, string $after, array $extra = array() ): string {
		$type  = array_search( $kind, self::KINDS, true );
		$rb    = array( 'type' => $type, 'mode' => $mode, 'id' => $id, 'after_hash' => $after ) + $extra;
		$title = (string) ( $before['post']['post_title'] ?? self::api()->title( $id ) );
		/* translators: 1: kind, 2: title, 3: operation. */
		$summary = sprintf( __( 'The Events Calendar: %1$s "%2$s" (%3$s)', 'emcp-tools' ), $kind, '' !== $title ? $title : '#' . $id, $op );
		return self::record( $op, 'tec ' . $kind . ' ' . $id, $summary, $rb, null === $before ? array() : array( 'before' => $before ) );
	}

	/** A category write (D23). */
	public static function record_category( string $mode, string $op, int $id, ?array $before, string $after ): string {
		$rb = array( 'type' => self::CATEGORY, 'mode' => $mode, 'id' => $id, 'after_hash' => $after );
		/* translators: 1: category id, 2: operation. */
		return self::record( $op, 'tec category ' . $id, sprintf( __( 'The Events Calendar: category %1$d (%2$s)', 'emcp-tools' ), $id, $op ), $rb, null === $before ? array() : array( 'before' => $before ) );
	}

	/** A failed recovery (D20): every before-image, so the entry's undo can put them back. */
	public static function record_recovery( array $befores, array $left, string $after ): string {
		$rb = array( 'type' => self::RECOVERY, 'mode' => 'recovery', 'ids' => array_map( 'intval', array_keys( $befores ) ), 'left' => array_values( $left ), 'after_hash' => $after );
		return self::record( 'recovery', 'tec recovery', __( 'The Events Calendar: a write that could not be put back', 'emcp-tools' ), $rb, array( 'befores' => $befores ) );
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
		if ( self::RECOVERY === $type ) {
			return EMCP_Tools_TEC_Writer::snapshot_hash( self::api(), (array) $rb['ids'] );
		}
		$id = (int) $rb['id'];
		if ( 'trashed' === (string) ( $rb['mode'] ?? '' ) ) {
			return 'trash' === self::api()->post_status( $id ) ? 'trashed' : 'not-trashed';
		}
		return self::writer()->version_of( self::KINDS[ $type ], $id );
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
		$force = (bool) $force;
		$rb    = self::heavy( (array) $rb );
		if ( self::RECOVERY === $type ) {
			$befores = array();
			foreach ( (array) ( $rb['befores'] ?? array() ) as $k => $v ) {
				$befores[ (int) $k ] = $v;
			}
			return self::writer()->undo_recovery( $befores, (string) $rb['after_hash'], $force );
		}
		$kind = self::KINDS[ $type ];
		$id   = (int) $rb['id'];
		$w    = self::writer();
		switch ( (string) $rb['mode'] ) {
			case 'created':
				return 'category' === $kind ? $w->undo_category_create( $id, (string) $rb['after_hash'], $force ) : $w->undo_create( $kind, $id, (string) $rb['after_hash'], $force );
			case 'edit':
				return 'category' === $kind ? $w->undo_category_edit( $id, (array) ( $rb['before'] ?? array() ), (string) $rb['after_hash'], $force ) : $w->undo_restore( $kind, $id, (array) ( $rb['before'] ?? array() ), (string) $rb['after_hash'], $force );
			case 'trashed':
				return $w->undo_trash( $kind, $id, (string) ( $rb['status'] ?? 'draft' ), (array) ( $rb['before'] ?? array() ) );
		}
		return new WP_Error( 'not_reversible', __( 'This The Events Calendar change cannot be undone.', 'emcp-tools' ) );
	}

	/**
	 * TEC switched off keeps every entry pending; a linked venue or organizer blocks its creation's
	 * undo (D19, force does not change this).
	 *
	 * @param true|WP_Error $blocker
	 * @return true|WP_Error
	 */
	public static function filter_blocker( $blocker, array $entry ) {
		$rb   = (array) ( $entry['rollback'] ?? array() );
		$type = (string) ( $rb['type'] ?? '' );
		if ( is_wp_error( $blocker ) || ! in_array( $type, self::types(), true ) ) {
			return $blocker;
		}
		$api = self::api();
		if ( ! $api->active() ) {
			return new WP_Error( 'tec_inactive', __( 'The Events Calendar is not active, so this change cannot be undone until it is switched on again.', 'emcp-tools' ) );
		}
		$id = (int) ( $rb['id'] ?? 0 );
		if ( 'created' === (string) ( $rb['mode'] ?? '' ) && in_array( $type, array( self::VENUE, self::ORGANIZER ), true ) && $api->linked_events( $id, self::KINDS[ $type ] ) ) {
			return new WP_Error( 'in_use', __( 'Events link to it, so it is not deleted (force does not change this).', 'emcp-tools' ), array( 'events' => $api->linked_events( $id, self::KINDS[ $type ] ) ) );
		}
		if ( self::CATEGORY === $type && 'created' === (string) ( $rb['mode'] ?? '' ) && $api->category( $id ) && $api->category_use( $id ) > 0 ) {
			return new WP_Error( 'in_use', __( 'Events use this category, so it is not deleted (force does not change this).', 'emcp-tools' ) );
		}
		return $blocker;
	}
}
