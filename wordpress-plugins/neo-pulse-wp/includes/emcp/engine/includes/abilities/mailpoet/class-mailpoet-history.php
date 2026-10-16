<?php
/**
 * History for the MailPoet tools (spec 6): one entry per write with the before-image of every row
 * it could touch, the after-state, the subscribers whose rows it holds (D15), and what it sent or
 * started; current hashes; undo through EMCP_Tools_MailPoet_Writer::undo(); blockers that force
 * does not override (D14); audit entries for what cannot be undone. Runtime: booted in
 * wire_runtime_hooks(), so an undo works from the admin History screen too, and MailPoet's own
 * deletes and WordPress privacy erasures redact History (D15).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_MailPoet_History {

	const TYPES = array(
		'mailpoet-subscriber'    => 'subscriber',
		'mailpoet-batch'         => 'batch',
		'mailpoet-list'          => 'list',
		'mailpoet-tag'           => 'tag',
		'mailpoet-custom-fields' => 'custom_fields',
		'mailpoet-newsletter'    => 'newsletter',
		'mailpoet-automation'    => 'automation',
	);

	const RECOVERY = 'mailpoet-recovery';

	/** The domain capability each kind of object needs (D4). */
	const KIND_CAPS = array(
		'subscriber'    => 'mailpoet_manage_subscribers',
		'tag'           => 'mailpoet_manage_subscribers',
		'custom_fields' => 'mailpoet_manage_subscribers',
		'list'          => 'mailpoet_manage_segments',
		'newsletter'    => 'mailpoet_manage_emails',
		'automation'    => 'mailpoet_manage_automations',
	);

	/**
	 * The MailPoet capabilities an undo needs: the domain's (D4), from the entry's objects for a
	 * recovery; unknown types need the settings capability.
	 *
	 * @return string[]
	 */
	public static function undo_permissions( array $rb ): array {
		if ( ! empty( $rb['perms'] ) && is_array( $rb['perms'] ) ) {
			return array_values( array_map( 'strval', $rb['perms'] ) );
		}
		$type = (string) ( $rb['type'] ?? '' );
		if ( 'mailpoet-batch' === $type ) {
			return array( 'mailpoet_manage_subscribers' );
		}
		if ( isset( self::TYPES[ $type ] ) ) {
			return array( self::KIND_CAPS[ self::TYPES[ $type ] ] );
		}
		if ( self::RECOVERY === $type ) {
			$caps = array();
			foreach ( (array) ( $rb['objects'] ?? array() ) as $o ) {
				$caps[] = self::KIND_CAPS[ (string) $o[0] ] ?? 'mailpoet_manage_settings';
			}
			return $caps ? array_values( array_unique( $caps ) ) : array( 'mailpoet_manage_settings' );
		}
		return array( 'mailpoet_manage_settings' );
	}

	/** @var EMCP_Tools_MailPoet_Api|null */
	private static $api = null;

	public static function use_api( ?EMCP_Tools_MailPoet_Api $api ): void {
		self::$api = $api;
	}

	public static function api(): EMCP_Tools_MailPoet_Api {
		if ( self::$api ) {
			return self::$api;
		}
		// An undo can run before the deferred MCP surface loads (an admin History request).
		foreach ( array( 'EMCP_Tools_MailPoet_Api' => 'class-mailpoet-api.php', 'EMCP_Tools_MailPoet_Writer' => 'class-mailpoet-writer.php', 'EMCP_Tools_MailPoet_Integration' => 'class-mailpoet-integration.php' ) as $class => $file ) {
			if ( ! class_exists( $class ) ) {
				require_once __DIR__ . '/' . $file;
			}
		}
		return EMCP_Tools_MailPoet_Integration::shared_api();
	}

	private static function writer(): EMCP_Tools_MailPoet_Writer {
		return new EMCP_Tools_MailPoet_Writer( self::api(), true );
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
		if ( method_exists( __CLASS__, 'boot_erasure' ) ) {
			self::boot_erasure();
		}
	}

	// Erasure (D15).

	const ERASER_KEY  = 'mailpet-subscriber';
	const OWN_ERASER  = 'emcp-mailpoet-history';

	/** MailPoet's deferred delete hooks and WordPress's privacy erasers. */
	public static function boot_erasure(): void {
		if ( ! has_action( 'mailpoet_subscriber_deleted', array( __CLASS__, 'on_deleted' ) ) ) {
			add_action( 'mailpoet_subscriber_deleted', array( __CLASS__, 'on_deleted' ), 10, 1 );
			add_action( 'mailpoet_multiple_subscribers_deleted', array( __CLASS__, 'on_deleted' ), 10, 1 );
			add_filter( 'wp_privacy_personal_data_erasers', array( __CLASS__, 'wrap_erasers' ), PHP_INT_MAX - 1 );
		}
	}

	/** @param mixed $ids MailPoet passes one id or a list. */
	public static function on_deleted( $ids ): void {
		self::redact_subscribers( (array) $ids );
	}

	/**
	 * WordPress runs erasers in list order, one request per eraser and page. MailPoet's eraser
	 * anonymizes the subscriber (the email changes), so History is redacted first: its callback is
	 * wrapped to redact, then call MailPoet's own; without it, EMCP's eraser goes first (D15).
	 */
	public static function wrap_erasers( $erasers ) {
		$erasers = is_array( $erasers ) ? $erasers : array();
		if ( isset( $erasers[ self::ERASER_KEY ]['callback'] ) && is_callable( $erasers[ self::ERASER_KEY ]['callback'] ) ) {
			$orig = $erasers[ self::ERASER_KEY ]['callback'];
			if ( ! ( is_array( $orig ) && $orig === array( __CLASS__, 'privacy_eraser' ) ) ) {
				$erasers[ self::ERASER_KEY ]['callback'] = static function ( $email, $page = 1 ) use ( $orig ) {
					self::privacy_eraser( (string) $email, (int) $page );
					return call_user_func( $orig, $email, $page );
				};
			}
			return $erasers;
		}
		return array(
			self::OWN_ERASER => array(
				'eraser_friendly_name' => __( 'EMCP History (MailPoet)', 'emcp-tools' ),
				'callback'             => array( __CLASS__, 'privacy_eraser' ),
			),
		) + $erasers;
	}

	/** @return array WordPress's eraser answer. */
	public static function privacy_eraser( string $email, int $page = 1 ): array {
		$removed = 0;
		$api     = self::api();
		if ( $api->active() ) {
			$id = $api->subscriber_by_email( $email );
			if ( null !== $id ) {
				$removed = self::redact_subscribers( array( $id ) );
			}
		}
		return array(
			'items_removed'  => $removed > 0,
			'items_retained' => false,
			'messages'       => array(),
			'done'           => true,
		);
	}

	/**
	 * Removes subscribers from every MailPoet History entry (D15) in one walk: entries about them
	 * alone lose their payload; batch, list and tag entries lose only their rows and ids and stay
	 * undoable for the others (stripped when none is left). Entries naming none of them are skipped
	 * before their blobs are read.
	 *
	 * @param int[] $ids
	 * @return int Entries changed.
	 */
	public static function redact_subscribers( array $ids ): int {
		$ids = array_values( array_filter( array_unique( array_map( 'intval', $ids ) ), static fn( $i ) => $i > 0 ) );
		if ( ! $ids || ! class_exists( 'EMCP_Tools_Change_Log' ) || ! method_exists( 'EMCP_Tools_Change_Log', 'redact' ) ) {
			return 0;
		}
		$names = static fn( array $rb ): array => array_values( array_intersect( array_map( 'intval', (array) ( $rb['subscribers'] ?? array() ) ), $ids ) );
		return EMCP_Tools_Change_Log::redact(
			'mailpoet',
			static function ( array $rb, ?array $heavy ) use ( $ids, $names ) {
				$gone = $names( $rb );
				if ( ! $gone ) {
					return array( 'keep' );
				}
				$left = array_values( array_diff( array_map( 'intval', (array) ( $rb['subscribers'] ?? array() ) ), $ids ) );
				if ( ! $left || ! in_array( (string) ( $rb['type'] ?? '' ), array( 'mailpoet-batch', 'mailpoet-list', 'mailpoet-tag' ), true ) ) {
					return array( 'strip' );
				}
				$before = (array) ( null !== $heavy ? ( $heavy['before'] ?? array() ) : ( $rb['before'] ?? array() ) );
				foreach ( $gone as $sid ) {
					$rb     = self::without_subscriber( $rb, $sid );
					$before = self::rows_without_subscriber( $before, $sid );
				}
				$rb['subscribers'] = $left;
				if ( null !== $heavy ) {
					$heavy['before'] = $before;
					return array( 'rewrite', $rb, $heavy );
				}
				$rb['before'] = $before;
				return array( 'rewrite', $rb, null );
			},
			__( 'The subscriber this change held was erased, so it cannot be undone.', 'emcp-tools' ),
			static fn( array $rb ): bool => (bool) $names( $rb )
		);
	}

	/** The bookkeeping of a batch, list or tag entry without one subscriber. */
	private static function without_subscriber( array $rb, int $sid ): array {
		$rb['objects'] = array_values( array_filter( (array) ( $rb['objects'] ?? array() ), static fn( $o ) => ! ( 'subscriber' === (string) $o[0] && (int) $o[1] === $sid ) ) );
		foreach ( array( 'row_hashes', 'after_status' ) as $k ) {
			if ( isset( $rb[ $k ] ) && is_array( $rb[ $k ] ) ) {
				unset( $rb[ $k ][ $sid ], $rb[ $k ][ (string) $sid ] );
			}
		}
		if ( isset( $rb['created_subscribers'] ) ) {
			$rb['created_subscribers'] = array_values( array_diff( array_map( 'intval', (array) $rb['created_subscribers'] ), array( $sid ) ) );
		}
		if ( isset( $rb['inserted']['subscribers'] ) ) {
			$rb['inserted']['subscribers'] = array_values( array_diff( array_map( 'intval', (array) $rb['inserted']['subscribers'] ), array( $sid ) ) );
		}
		return $rb;
	}

	/** Before-image sets without the subscriber's own set and without any row naming them. */
	private static function rows_without_subscriber( array $before, int $sid ): array {
		unset( $before[ 'subscriber:' . $sid ] );
		foreach ( $before as $key => $set ) {
			foreach ( (array) $set as $table => $rows ) {
				if ( '#' === substr( (string) $table, 0, 1 ) ) {
					continue;
				}
				foreach ( (array) $rows as $pk => $row ) {
					$row = (array) $row;
					if ( ( 'mailpoet_subscribers' === (string) $table && (int) $pk === $sid ) || ( isset( $row['subscriber_id'] ) && (int) $row['subscriber_id'] === $sid ) ) {
						unset( $before[ $key ][ $table ][ $pk ] );
					}
				}
			}
		}
		return $before;
	}

	/**
	 * Records one entry. Every reference names the subscribers whose rows it holds (D15); one that
	 * does not is refused, so an erasure can always find what to redact.
	 */
	public static function record_ref( string $action, string $target, string $summary, array $rb, array $heavy = array() ): string {
		if ( ! array_key_exists( 'subscribers', $rb ) || ! is_array( $rb['subscribers'] ) || ! class_exists( 'EMCP_Tools_Change_Log' ) ) {
			return '';
		}
		$rb['subscribers'] = array_values( array_unique( array_map( 'intval', $rb['subscribers'] ) ) );
		if ( 'irreversible' !== (string) ( $rb['type'] ?? '' ) && empty( $rb['perms'] ) ) {
			$rb['perms'] = self::undo_permissions( $rb );
		}
		return EMCP_Tools_Change_Log::record(
			array(
				'domain'   => 'mailpoet',
				'action'   => $action,
				'target'   => $target,
				'summary'  => $summary,
				'rollback' => $heavy ? ( class_exists( 'EMCP_Tools_Change_Recorder' ) ? EMCP_Tools_Change_Recorder::attach_before( $rb, $heavy ) : array_merge( $rb, $heavy ) ) : $rb,
			)
		);
	}

	public static function heavy( array $rb ): array {
		if ( class_exists( 'EMCP_Tools_Change_Recorder' ) && method_exists( 'EMCP_Tools_Change_Recorder', 'resolve_before' ) ) {
			return (array) EMCP_Tools_Change_Recorder::resolve_before( $rb );
		}
		return $rb;
	}

	/** Tables a captured write touched (real names). @return string[] */
	public static function tables( array $cap ): array {
		return array_values( array_unique( array_map( array( 'EMCP_Tools_MailPoet_Writer', 'real_table' ), array_merge( array_keys( (array) $cap['inserted'] ), (array) $cap['updated'], (array) $cap['deleted'] ) ) ) );
	}

	/** The inserted-ids map (capture names). */
	public static function created( array $cap ): array {
		$out = array();
		foreach ( (array) $cap['inserted'] as $t => $ids ) {
			$out[ (string) $t ] = array_map( 'intval', (array) $ids );
		}
		return $out;
	}

	/**
	 * One write.
	 *
	 * @param string $type        A TYPES key.
	 * @param string $mode        created, edit, deleted or another type-specific mode.
	 * @param array  $objects     [kind, id] pairs (ids filled in).
	 * @param array  $befores     "kind:id" => rows before ([] for what the write created).
	 * @param array  $cap         The capture answer.
	 * @param int[]  $subscribers Subscribers whose rows the entry holds (D15).
	 * @param array  $report      {emails, automations}.
	 */
	public static function record_write( string $type, string $mode, string $op, int $id, array $objects, array $befores, array $cap, array $subscribers, array $report, array $extra = array() ): string {
		$kind = self::TYPES[ $type ] ?? 'object';
		$rb   = array(
			'type'        => $type,
			'mode'        => $mode,
			'id'          => $id,
			'objects'     => array_values( $objects ),
			'tables'      => self::tables( $cap ),
			'inserted'    => self::created( $cap ),
			'subscribers' => $subscribers,
			'author'      => function_exists( 'get_current_user_id' ) ? (int) get_current_user_id() : 0,
			'emails'      => (array) ( $report['emails'] ?? array() ),
			'automations' => array_values( array_map( 'intval', (array) ( $report['automations'] ?? array() ) ) ),
			'after_hash'  => EMCP_Tools_MailPoet_Writer::state_hash( self::api(), $objects, (array) $cap['inserted'] ),
		) + $extra;
		if ( ! isset( $rb['after_status'] ) ) {
			$after = array();
			foreach ( $objects as $o ) {
				if ( 'subscriber' === (string) $o[0] && (int) $o[1] > 0 ) {
					$after[ (int) $o[1] ] = (string) ( self::api()->row( 'mailpoet_subscribers', (int) $o[1] )['status'] ?? '' );
				}
			}
			$rb['after_status'] = $after;
		}
		/* translators: 1: kind, 2: id, 3: operation. */
		$summary = sprintf( __( 'MailPoet: %1$s #%2$d (%3$s)', 'emcp-tools' ), str_replace( '_', ' ', $kind ), $id, $op );
		$sent    = (int) ( $report['emails']['sent'] ?? 0 ) + (int) ( $report['emails']['queued'] ?? 0 );
		if ( $sent > 0 || ! empty( $report['automations'] ) ) {
			$summary .= ' ' . __( '- it sent email or started automations; undo does not unsend or stop them', 'emcp-tools' );
		}
		return self::record_ref( $op, 'mailpoet-' . str_replace( '_', '-', $kind ) . ':' . $id, $summary, $rb, array( 'before' => $befores ) );
	}

	/** A write EMCP could not put back (D7): its undo puts every before-image back and removes what it added. */
	public static function record_recovery( array $objects, array $befores, array $cap, array $left ): string {
		$objects = array_values( array_filter( $objects, static fn( $o ) => (int) $o[1] > 0 || 'custom_fields' === (string) $o[0] ) );
		$subs    = EMCP_Tools_MailPoet_Writer::subscribers_in( $objects );
		foreach ( (array) ( $cap['inserted']['subscribers'] ?? array() ) as $sid ) {
			$subs[] = (int) $sid;
		}
		foreach ( EMCP_Tools_MailPoet_Writer::union( $befores ) as $table => $rows ) {
			foreach ( (array) $rows as $key => $row ) {
				if ( 'mailpoet_subscribers' === $table ) {
					$subs[] = (int) $key;
				} elseif ( isset( $row['subscriber_id'] ) ) {
					$subs[] = (int) $row['subscriber_id'];
				}
			}
		}
		$rb = array(
			'type'        => self::RECOVERY,
			'mode'        => 'recovery',
			'objects'     => $objects,
			'tables'      => self::tables( $cap ),
			'inserted'    => self::created( $cap ),
			'subscribers' => $subs,
			'left'        => array_values( $left ),
			'after_hash'  => EMCP_Tools_MailPoet_Writer::state_hash( self::api(), $objects, (array) $cap['inserted'] ),
		);
		return self::record_ref( 'recovery', 'mailpoet-recovery', __( 'MailPoet: a write that could not be put back', 'emcp-tools' ), $rb, array( 'before' => $befores ) );
	}

	/** A failure whose rows could not be attributed (D7): for the audit trail only. */
	public static function record_uncertain( array $tables, string $cause, array $subscribers ): string {
		// The entry may name no subscriber, so erasure would never reach an address in MailPoet's text.
		$cause = (string) preg_replace( '/[^\s@<>"\'(),;:]+@[^\s@<>"\'(),;:]+/', '[email]', $cause );
		/* translators: 1: tables, 2: MailPoet's error. */
		$reason = sprintf( __( 'MailPoet stopped half way (%2$s) and EMCP could not tell which rows it wrote in %1$s, so it changed nothing; check them in MailPoet.', 'emcp-tools' ), implode( ', ', $tables ), $cause );
		return self::record_ref( 'recovery', 'mailpoet-recovery', __( 'MailPoet: a write whose rows could not be attributed', 'emcp-tools' ), array( 'type' => 'irreversible', 'reason' => $reason, 'tables' => array_values( $tables ), 'subscribers' => $subscribers ) );
	}

	/** Something that cannot be undone (a send, an unsubscribe, an unschedule, an erasure). */
	public static function record_audit( string $action, string $target, string $summary, string $reason, array $subscribers, array $extra = array() ): string {
		return self::record_ref( $action, $target, $summary, array( 'type' => 'irreversible', 'reason' => $reason, 'subscribers' => $subscribers ) + $extra );
	}

	/**
	 * An audit note written by an undo itself (who it left alone). The change log suppresses
	 * record() while an undo runs; this note carries no payload and is irreversible, so it is let
	 * through.
	 */
	public static function record_undo_note( string $action, string $target, string $summary, string $reason, array $subscribers, array $extra = array() ): string {
		$was = class_exists( 'EMCP_Tools_Change_Log' ) ? EMCP_Tools_Change_Log::$suppress : false;
		if ( class_exists( 'EMCP_Tools_Change_Log' ) ) {
			EMCP_Tools_Change_Log::$suppress = false;
		}
		try {
			return self::record_audit( $action, $target, $summary, $reason, $subscribers, $extra );
		} finally {
			if ( class_exists( 'EMCP_Tools_Change_Log' ) ) {
				EMCP_Tools_Change_Log::$suppress = $was;
			}
		}
	}

	/** A created list that subscribers or newsletters use since (D14). @return true|WP_Error */
	public static function blocker_list( EMCP_Tools_MailPoet_Api $api, array $rb ) {
		$id = (int) ( $rb['id'] ?? 0 );
		if ( 'created' === (string) ( $rb['mode'] ?? '' ) && ( $api->count_where( 'mailpoet_subscriber_segment', array( 'segment_id' => $id ) ) || $api->count_where( 'mailpoet_newsletter_segment', array( 'segment_id' => $id ) ) ) ) {
			return new WP_Error( 'list_in_use', __( 'Subscribers or newsletters use this list since it was created, so its creation is not undone (force does not change this). Delete it instead.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		return true;
	}

	/** A newsletter whose sending has started since (D14); a schedule is decided by the cancel (D17). @return true|WP_Error */
	public static function blocker_newsletter( EMCP_Tools_MailPoet_Api $api, array $rb ) {
		if ( 'scheduled' === (string) ( $rb['mode'] ?? '' ) ) {
			return true;
		}
		$n = $api->row( 'mailpoet_newsletters', (int) ( $rb['id'] ?? 0 ) );
		if ( $n && 'draft' !== (string) $n['status'] ) {
			return new WP_Error( 'sending_started', __( 'This newsletter is scheduled, sending or sent since, so this is not undone (force does not change this).', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		return true;
	}

	/** An added custom field that subscribers have values for since (spec 4.2). @return true|WP_Error */
	public static function blocker_custom_fields( EMCP_Tools_MailPoet_Api $api, array $rb ) {
		if ( 'added' === (string) ( $rb['mode'] ?? '' ) && $api->count_where( 'mailpoet_subscriber_custom_field', array( 'custom_field_id' => (int) ( $rb['id'] ?? 0 ) ) ) ) {
			return new WP_Error( 'field_in_use', __( 'Subscribers have values for this custom field since it was added, so it is not taken away (force does not change this).', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		return true;
	}

	/** A created tag that subscribers hold since (D14). @return true|WP_Error */
	public static function blocker_tag( EMCP_Tools_MailPoet_Api $api, array $rb ) {
		if ( 'created' === (string) ( $rb['mode'] ?? '' ) && $api->count_where( 'mailpoet_subscriber_tag', array( 'tag_id' => (int) ( $rb['id'] ?? 0 ) ) ) ) {
			return new WP_Error( 'tag_in_use', __( 'Subscribers have been given this tag since it was created, so its creation is not undone (force does not change this). Delete it instead.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		return true;
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
		if ( 'mailpoet-batch' === $type || ( 'mailpoet-newsletter' === $type && 'scheduled' === (string) ( $rb['mode'] ?? '' ) ) ) {
			// A batch is undone row by row, each row checked against its own version inside the leases;
			// a schedule's undo is decided by the sending tables under the cancelling transaction (D17).
			return (string) ( $rb['after_hash'] ?? $hash );
		}
		$objects = array_map( static fn( $o ) => array( (string) $o[0], (int) $o[1] ), (array) ( $rb['objects'] ?? array() ) );
		return EMCP_Tools_MailPoet_Writer::state_hash( self::api(), $objects, (array) ( $rb['inserted'] ?? array() ) );
	}

	/**
	 * @param true|WP_Error|null $result null when unhandled.
	 * @param array              $rb     Rollback ref.
	 * @param bool               $force  Caller's force flag.
	 * @return true|WP_Error|null
	 */
	public static function filter_apply( $result, $rb, $force = false ) {
		if ( ! in_array( (string) ( $rb['type'] ?? '' ), self::types(), true ) ) {
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
	 * Later real work blocks an undo; force does not change this (D14). Checked by the change log
	 * outside any lease and again by the undo inside its leases.
	 *
	 * @return true|WP_Error
	 */
	public static function blocker( EMCP_Tools_MailPoet_Api $api, array $rb ) {
		if ( ! $api->active() ) {
			return new WP_Error( 'mailpoet_inactive', __( 'MailPoet is not active, so this change cannot be undone until it is switched on again.', 'emcp-tools' ) );
		}
		foreach ( self::undo_permissions( $rb ) as $cap ) {
			if ( ! $api->can( $cap ) ) {
				/* translators: %s: MailPoet capability. */
				return new WP_Error( 'forbidden', sprintf( __( 'Undoing this needs the MailPoet capability %s.', 'emcp-tools' ), $cap ), array( 'status' => 403 ) );
			}
		}
		$type = (string) ( $rb['type'] ?? '' );
		if ( 'mailpoet-batch' !== $type ) {
			$consent = self::consent_blocker( $api, $rb );
			if ( is_wp_error( $consent ) ) {
				return $consent;
			}
		}
		if ( 'mailpoet-subscriber' === $type && 'created' === (string) ( $rb['mode'] ?? '' ) ) {
			return self::created_blocker( $api, (int) ( $rb['id'] ?? 0 ), (array) ( $rb['inserted'] ?? array() ) );
		}
		$more = 'blocker_' . str_replace( '-', '_', substr( $type, 9 ) );
		if ( method_exists( __CLASS__, $more ) ) {
			return call_user_func( array( __CLASS__, $more ), $api, $rb );
		}
		return true;
	}

	/**
	 * A created subscriber that has since been sent an email, entered an automation, confirmed
	 * their subscription or been linked to a user (D14).
	 *
	 * @return true|WP_Error
	 */
	public static function created_blocker( EMCP_Tools_MailPoet_Api $api, int $id, array $inserted ) {
		$row = $api->row( 'mailpoet_subscribers', $id );
		if ( ! $row ) {
			return true;
		}
		// Deleting someone who unsubscribed, bounced or went inactive since would delete the record of
		// it, so a later import could add them again as subscribed (live smoke).
		if ( in_array( (string) ( $row['status'] ?? '' ), EMCP_Tools_MailPoet_Writer::SUPPRESSED, true ) ) {
			return new WP_Error( 'subscriber_opted_out', __( 'This subscriber unsubscribed, bounced or went inactive after being created, so the creation is not undone: that would delete the record of it (force does not change this).', 'emcp-tools' ), array( 'status' => 409, 'subscriber_id' => $id ) );
		}
		// A create subscribes to its lists, so a membership that says unsubscribed is the person's
		// choice since; deleting the subscriber would delete it (final review), force included.
		foreach ( $api->find( 'mailpoet_subscriber_segment', array( 'subscriber_id' => $id ) ) as $m ) {
			if ( 'unsubscribed' === (string) $m['status'] ) {
				return new WP_Error( 'subscriber_opted_out', __( 'This subscriber left one of their lists after being created, so the creation is not undone: that would delete the record of it (force does not change this).', 'emcp-tools' ), array( 'status' => 409, 'subscriber_id' => $id ) );
			}
		}
		// Undoing a create deletes the subscriber's rows: only those the create itself inserted, so a
		// membership, tag or value another write added since is never deleted unsnapshotted (security
		// review), force included.
		foreach ( array( 'subscriber_segment', 'subscriber_tag', 'subscriber_custom_field' ) as $t ) {
			$mine = array_map( 'intval', (array) ( $inserted[ $t ] ?? array() ) );
			foreach ( array_keys( $api->find( 'mailpoet_' . $t, array( 'subscriber_id' => $id ) ) ) as $key ) {
				if ( ! in_array( (int) $key, $mine, true ) ) {
					return new WP_Error( 'subscriber_in_use', __( 'Another change gave this subscriber a list, tag or custom field value since it was created, so its creation is not undone (force does not change this); undo that change first.', 'emcp-tools' ), array( 'status' => 409, 'table' => 'mailpoet_' . $t ) );
				}
			}
		}
		$c = $api->subscriber_counts( $id );
		if ( $c['emails'] || $c['runs'] || $c['confirmed'] || $c['wp_user_id'] > 0 || (int) ( $row['is_woocommerce_user'] ?? 0 ) > 0 ) {
			return new WP_Error( 'subscriber_in_use', __( 'This subscriber has been sent an email, entered an automation, confirmed their subscription or been linked to a user since it was created, so its creation is not undone (force does not change this).', 'emcp-tools' ), array( 'status' => 409, 'usage' => $c ) );
		}
		return true;
	}

	/**
	 * Consent (D14): a restore that would leave a subscriber sendable while they are now
	 * unsubscribed, bounced or inactive is refused, unless the write being undone itself left them
	 * in that state. Batches check this per row in their own undo.
	 *
	 * @return true|WP_Error
	 */
	public static function consent_blocker( EMCP_Tools_MailPoet_Api $api, array $rb ) {
		$tables = array_values( array_map( 'strval', (array) ( $rb['tables'] ?? array() ) ) );
		foreach ( (array) ( $rb['before'] ?? array() ) as $rows ) {
			foreach ( (array) ( $rows['mailpoet_subscribers'] ?? array() ) as $id => $row ) {
				$now   = (string) ( $api->row( 'mailpoet_subscribers', (int) $id )['status'] ?? '' );
				$after = $rb['after_status'] ?? '';
				$after = is_array( $after ) ? (string) ( $after[ $id ] ?? '' ) : (string) $after;
				$code  = self::status_restore_blocked( (string) ( $row['status'] ?? '' ), $now, $after, $tables );
				if ( null !== $code ) {
					return self::status_blocked( $code, (int) $id );
				}
			}
		}
		return true;
	}

	/**
	 * Whether putting a subscriber's earlier status back would change their consent (D14, security
	 * review): never sendable again after they unsubscribed, bounced or went inactive, and never
	 * subscribed again over any other status set since (an unconfirmed re-confirmation, for one),
	 * unless the write being undone itself left that status. Only when the restore writes the
	 * subscribers table ($tables empty: every table).
	 */
	public static function status_restore_blocked( string $before, string $now, string $after, array $tables ): ?string {
		if ( $now === $before || ( $tables && ! in_array( 'mailpoet_subscribers', $tables, true ) ) ) {
			return null;
		}
		$sup = EMCP_Tools_MailPoet_Writer::SUPPRESSED;
		if ( in_array( $now, $sup, true ) && ! in_array( $before, $sup, true ) && ! in_array( $after, $sup, true ) ) {
			return 'subscriber_opted_out';
		}
		if ( 'subscribed' === $before && $now !== $after ) {
			return 'consent_required';
		}
		return null;
	}

	public static function status_blocked( string $code, int $id ): WP_Error {
		if ( 'subscriber_opted_out' === $code ) {
			return new WP_Error( 'subscriber_opted_out', __( 'A subscriber in this change unsubscribed, bounced or went inactive after it, so it is not undone: undo never makes a subscriber sendable again (force does not change this).', 'emcp-tools' ), array( 'status' => 409, 'subscriber_id' => $id ) );
		}
		return new WP_Error( 'consent_required', __( 'A subscriber in this change is no longer subscribed (for example waiting to confirm again), so it is not undone: undo never makes a subscriber subscribed again (force does not change this).', 'emcp-tools' ), array( 'status' => 409, 'subscriber_id' => $id ) );
	}
}
