<?php
/**
 * History for the FluentCRM tools (spec 6): one entry per write with the before-image of every row
 * it could touch, the after-state, the contacts whose rows it holds (D16), and what it sent or
 * started; current hashes; undo through EMCP_Tools_FluentCRM_Writer::undo(); blockers that force
 * does not override (D13); audit entries for what cannot be undone (D18, D19). Runtime: booted in
 * wire_runtime_hooks(), so an undo works from the admin History screen too.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_FluentCRM_History {

	const TYPES = array(
		'fluentcrm-contact'       => 'contact',
		'fluentcrm-batch'         => 'batch',
		'fluentcrm-segment'       => 'segment',
		'fluentcrm-custom-fields' => 'custom_fields',
		'fluentcrm-note'          => 'note',
		'fluentcrm-campaign'      => 'campaign',
		'fluentcrm-template'      => 'template',
		'fluentcrm-automation'    => 'automation',
	);

	const RECOVERY = 'fluentcrm-recovery';

	/**
	 * The FluentCRM permissions an undo needs (security review): the one the write needed, since
	 * undo writes FluentCRM's rows directly, and the delete permission too when the undo deletes
	 * what the write created. Unknown types need the settings permission.
	 *
	 * @return string[]
	 */
	public static function undo_permissions( array $rb ): array {
		if ( ! empty( $rb['perms'] ) && is_array( $rb['perms'] ) ) {
			return array_values( array_map( 'strval', $rb['perms'] ) );
		}
		$mode    = (string) ( $rb['mode'] ?? '' );
		$created = 'created' === $mode;
		switch ( (string) ( $rb['type'] ?? '' ) ) {
			case 'fluentcrm-contact':
			case 'fluentcrm-note':
				return $created ? array( 'fcrm_manage_contacts', 'fcrm_manage_contacts_delete' ) : array( 'fcrm_manage_contacts' );
			case 'fluentcrm-batch':
				return ! empty( $rb['created_contacts'] ) ? array( 'fcrm_manage_contacts', 'fcrm_manage_contacts_delete' ) : array( 'fcrm_manage_contacts' );
			case 'fluentcrm-segment':
				return $created || in_array( $mode, array( 'deleted', 'merged' ), true ) ? array( 'fcrm_manage_contact_cats', 'fcrm_manage_contact_cats_delete' ) : array( 'fcrm_manage_contact_cats' );
			case 'fluentcrm-campaign':
				return $created ? array( 'fcrm_manage_emails', 'fcrm_manage_email_delete' ) : array( 'fcrm_manage_emails' );
			case 'fluentcrm-template':
				return $created ? array( 'fcrm_manage_email_templates', 'fcrm_manage_email_delete' ) : array( 'fcrm_manage_email_templates' );
			case 'fluentcrm-automation':
				return array( 'fcrm_write_funnels' );
		}
		return array( 'fcrm_manage_settings' );
	}

	/** @var EMCP_Tools_FluentCRM_Api|null */
	private static $api = null;

	public static function use_api( ?EMCP_Tools_FluentCRM_Api $api ): void {
		self::$api = $api;
	}

	public static function api(): EMCP_Tools_FluentCRM_Api {
		if ( self::$api ) {
			return self::$api;
		}
		// An undo can run before the deferred MCP surface loads (an admin History request).
		foreach ( array( 'EMCP_Tools_FluentCRM_Api' => 'class-fluentcrm-api.php', 'EMCP_Tools_FluentCRM_Writer' => 'class-fluentcrm-writer.php', 'EMCP_Tools_FluentCRM_Integration' => 'class-fluentcrm-integration.php' ) as $class => $file ) {
			if ( ! class_exists( $class ) ) {
				require_once __DIR__ . '/' . $file;
			}
		}
		return EMCP_Tools_FluentCRM_Integration::shared_api();
	}

	private static function writer(): EMCP_Tools_FluentCRM_Writer {
		return new EMCP_Tools_FluentCRM_Writer( self::api(), true );
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
		if ( ! has_action( 'fluentcrm_before_subscribers_deleted', array( __CLASS__, 'on_contacts_deleted' ) ) ) {
			// A delete in the FluentCRM admin (or any other code) erases the History copy too (D16).
			add_action( 'fluentcrm_before_subscribers_deleted', array( __CLASS__, 'on_contacts_deleted' ), 10, 1 );
		}
	}

	/** @var int entries the last on_contacts_deleted() redacted (reported by delete-contact). */
	public static $redacted = 0;

	/** @param mixed $ids FluentCRM passes the contact ids. */
	public static function on_contacts_deleted( $ids ): void {
		self::$redacted = self::redact_contacts( (array) $ids );
	}

	/**
	 * Removes a contact from every FluentCRM History entry (D14, D16): entries about it alone
	 * (contact edits, notes, recoveries, sends) lose their payload; batch and tag or list entries
	 * lose only its rows and id and stay undoable for the others (stripped when none is left).
	 *
	 * @return int Entries changed.
	 */
	public static function redact_contact( int $cid ): int {
		return self::redact_contacts( array( $cid ) );
	}

	/**
	 * The same for several contacts in one walk of History (a bulk delete in FluentCRM's admin runs
	 * this inside its own request); entries that name none of them are skipped before their blobs
	 * are read.
	 *
	 * @param int[] $ids Contact ids.
	 * @return int Entries changed.
	 */
	public static function redact_contacts( array $ids ): int {
		$ids = array_values( array_filter( array_unique( array_map( 'intval', $ids ) ), static fn( $i ) => $i > 0 ) );
		if ( ! $ids || ! class_exists( 'EMCP_Tools_Change_Log' ) || ! method_exists( 'EMCP_Tools_Change_Log', 'redact' ) ) {
			return 0;
		}
		$names = static fn( array $rb ): array => array_values( array_intersect( array_map( 'intval', (array) ( $rb['contacts'] ?? array() ) ), $ids ) );
		return EMCP_Tools_Change_Log::redact(
			'fluentcrm',
			static function ( array $rb, ?array $heavy ) use ( $ids, $names ) {
				$gone = $names( $rb );
				if ( ! $gone ) {
					return array( 'keep' );
				}
				$left = array_values( array_diff( array_map( 'intval', (array) ( $rb['contacts'] ?? array() ) ), $ids ) );
				if ( ! $left || ! in_array( (string) ( $rb['type'] ?? '' ), array( 'fluentcrm-batch', 'fluentcrm-segment' ), true ) ) {
					return array( 'strip' );
				}
				$before = (array) ( null !== $heavy ? ( $heavy['before'] ?? array() ) : ( $rb['before'] ?? array() ) );
				foreach ( $gone as $cid ) {
					$rb     = self::without_contact( $rb, $cid );
					$before = self::rows_without_contact( $before, $cid );
				}
				$rb['contacts'] = $left;
				if ( null !== $heavy ) {
					$heavy['before'] = $before;
					return array( 'rewrite', $rb, $heavy );
				}
				$rb['before'] = $before;
				return array( 'rewrite', $rb, null );
			},
			__( 'The contact this change held was erased, so it cannot be undone.', 'emcp-tools' ),
			static fn( array $rb ): bool => (bool) $names( $rb )
		);
	}

	/** The bookkeeping of a batch or tag entry without one contact. */
	private static function without_contact( array $rb, int $cid ): array {
		$rb['objects'] = array_values( array_filter( (array) ( $rb['objects'] ?? array() ), static fn( $o ) => ! ( 'contact' === (string) $o[0] && (int) $o[1] === $cid ) ) );
		foreach ( array( 'row_hashes', 'after_status' ) as $k ) {
			if ( isset( $rb[ $k ] ) && is_array( $rb[ $k ] ) ) {
				unset( $rb[ $k ][ $cid ], $rb[ $k ][ (string) $cid ] );
			}
		}
		if ( isset( $rb['created_contacts'] ) ) {
			$rb['created_contacts'] = array_values( array_diff( array_map( 'intval', (array) $rb['created_contacts'] ), array( $cid ) ) );
		}
		foreach ( array( 'fc_subscribers', 'subscribers' ) as $t ) {
			if ( isset( $rb['inserted'][ $t ] ) ) {
				$rb['inserted'][ $t ] = array_values( array_diff( array_map( 'intval', (array) $rb['inserted'][ $t ] ), array( $cid ) ) );
			}
		}
		return $rb;
	}

	/** Before-image sets without the contact's own set and without any row naming it. */
	private static function rows_without_contact( array $before, int $cid ): array {
		unset( $before[ 'contact:' . $cid ] );
		foreach ( $before as $key => $set ) {
			foreach ( (array) $set as $table => $rows ) {
				foreach ( (array) $rows as $pk => $row ) {
					$row = (array) $row;
					if ( ( 'fc_subscribers' === (string) $table && (int) $pk === $cid ) || ( isset( $row['subscriber_id'] ) && (int) $row['subscriber_id'] === $cid ) ) {
						unset( $before[ $key ][ $table ][ $pk ] );
					}
				}
			}
		}
		return $before;
	}

	/**
	 * Records one entry. Every reference names the contacts whose rows it holds (D16); one that
	 * does not is refused, so an erasure can always find what to redact.
	 */
	public static function record_ref( string $action, string $target, string $summary, array $rb, array $heavy = array() ): string {
		if ( ! array_key_exists( 'contacts', $rb ) || ! is_array( $rb['contacts'] ) || ! class_exists( 'EMCP_Tools_Change_Log' ) ) {
			return '';
		}
		$rb['contacts'] = array_values( array_unique( array_map( 'intval', $rb['contacts'] ) ) );
		if ( 'irreversible' !== (string) ( $rb['type'] ?? '' ) && empty( $rb['perms'] ) ) {
			$rb['perms'] = self::undo_permissions( $rb );
		}
		return EMCP_Tools_Change_Log::record(
			array(
				'domain'   => 'fluentcrm',
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
	private static function tables( array $cap ): array {
		return array_values( array_unique( array_map( array( 'EMCP_Tools_FluentCRM_Writer', 'real_table' ), array_merge( array_keys( (array) $cap['inserted'] ), (array) $cap['updated'], (array) $cap['deleted'] ) ) ) );
	}

	/** The inserted-ids map with real table names. */
	private static function created( array $cap ): array {
		$out = array();
		foreach ( (array) $cap['inserted'] as $t => $ids ) {
			$out[ EMCP_Tools_FluentCRM_Writer::real_table( (string) $t ) ] = array_map( 'intval', (array) $ids );
		}
		return $out;
	}

	/**
	 * One write.
	 *
	 * @param string $type     A TYPES key.
	 * @param string $mode     created, edit or deleted.
	 * @param array  $objects  [kind, id] pairs (ids filled in).
	 * @param array  $befores  "kind:id" => rows before ([] for what the write created).
	 * @param array  $cap      The capture answer.
	 * @param int[]  $contacts Contacts whose rows the entry holds (D16).
	 * @param array  $report   {emails, automations}.
	 */
	public static function record_write( string $type, string $mode, string $op, int $id, array $objects, array $befores, array $cap, array $contacts, array $report, array $extra = array() ): string {
		$kind = self::TYPES[ $type ] ?? 'object';
		$rb   = array(
			'type'        => $type,
			'mode'        => $mode,
			'id'          => $id,
			'objects'     => array_values( $objects ),
			'tables'      => self::tables( $cap ),
			'inserted'    => self::created( $cap ),
			'contacts'    => $contacts,
			'emails'      => (array) ( $report['emails'] ?? array() ),
			'automations' => (array) ( $report['automations'] ?? array() ),
			'after_hash'  => EMCP_Tools_FluentCRM_Writer::state_hash( self::api(), $objects, (array) $cap['inserted'] ),
		) + $extra;
		/* translators: 1: kind, 2: id, 3: operation. */
		$summary = sprintf( __( 'FluentCRM: %1$s #%2$d (%3$s)', 'emcp-tools' ), $kind, $id, $op );
		$sent    = (int) ( $report['emails']['sent'] ?? 0 ) + (int) ( $report['emails']['queued'] ?? 0 );
		if ( $sent > 0 || ! empty( $report['automations'] ) ) {
			$summary .= ' ' . __( '- it sent email or started automations; undo does not unsend or stop them', 'emcp-tools' );
		}
		return self::record_ref( $op, 'fluentcrm-' . $kind . ':' . $id, $summary, $rb, array( 'before' => $befores ) );
	}

	/** A write EMCP could not put back (D9): its undo puts every before-image back and removes what it added. */
	public static function record_recovery( array $objects, array $befores, array $cap, array $left ): string {
		$objects  = array_values( array_filter( $objects, static fn( $o ) => (int) $o[1] > 0 || 'custom_fields' === (string) $o[0] ) );
		$contacts = EMCP_Tools_FluentCRM_Writer::contacts_in( $objects );
		foreach ( (array) ( $cap['inserted']['subscribers'] ?? array() ) as $cid ) {
			$contacts[] = (int) $cid;
		}
		$rb = array(
			'type'       => self::RECOVERY,
			'mode'       => 'recovery',
			'objects'    => $objects,
			'tables'     => self::tables( $cap ),
			'inserted'   => self::created( $cap ),
			'contacts'   => $contacts,
			'left'       => array_values( $left ),
			'after_hash' => EMCP_Tools_FluentCRM_Writer::state_hash( self::api(), $objects, (array) $cap['inserted'] ),
		);
		return self::record_ref( 'recovery', 'fluentcrm-recovery', __( 'FluentCRM: a write that could not be put back', 'emcp-tools' ), $rb, array( 'before' => $befores ) );
	}

	/** A failure whose rows could not be attributed (D9): for the audit trail only. */
	public static function record_uncertain( array $tables, string $cause, array $contacts ): string {
		/* translators: 1: tables, 2: FluentCRM's error. */
		$reason = sprintf( __( 'FluentCRM stopped half way (%2$s) and EMCP could not tell which rows it wrote in %1$s, so it changed nothing; check them in FluentCRM.', 'emcp-tools' ), implode( ', ', $tables ), $cause );
		return self::record_ref( 'recovery', 'fluentcrm-recovery', __( 'FluentCRM: a write whose rows could not be attributed', 'emcp-tools' ), array( 'type' => 'irreversible', 'reason' => $reason, 'tables' => array_values( $tables ), 'contacts' => $contacts ) );
	}

	/** Something that cannot be undone (a send, an unschedule, an automation move, an erasure). */
	public static function record_audit( string $action, string $target, string $summary, string $reason, array $contacts, array $extra = array() ): string {
		return self::record_ref( $action, $target, $summary, array( 'type' => 'irreversible', 'reason' => $reason, 'contacts' => $contacts ) + $extra );
	}

	/**
	 * An audit note written by an undo itself (who it left alone). The change log suppresses
	 * record() while an undo runs so an undo's own writes never become entries; this note carries
	 * no payload and is irreversible, so it is let through.
	 */
	public static function record_undo_note( string $action, string $target, string $summary, string $reason, array $contacts, array $extra = array() ): string {
		$was = class_exists( 'EMCP_Tools_Change_Log' ) ? EMCP_Tools_Change_Log::$suppress : false;
		if ( class_exists( 'EMCP_Tools_Change_Log' ) ) {
			EMCP_Tools_Change_Log::$suppress = false;
		}
		try {
			return self::record_audit( $action, $target, $summary, $reason, $contacts, $extra );
		} finally {
			if ( class_exists( 'EMCP_Tools_Change_Log' ) ) {
				EMCP_Tools_Change_Log::$suppress = $was;
			}
		}
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
		if ( 'fluentcrm-batch' === $type || ( 'fluentcrm-campaign' === $type && 'scheduled' === (string) ( $rb['mode'] ?? '' ) ) ) {
			// A batch is undone row by row, each row checked against its own version inside the leases;
			// a schedule's queue moves on its own, and its undo is decided by the queue under FluentCRM's locks (D18).
			return (string) ( $rb['after_hash'] ?? $hash );
		}
		$objects = array_map( static fn( $o ) => array( (string) $o[0], (int) $o[1] ), (array) ( $rb['objects'] ?? array() ) );
		$ins     = array();
		foreach ( (array) ( $rb['inserted'] ?? array() ) as $t => $ids ) {
			$ins[ 0 === strpos( (string) $t, 'fc_' ) ? substr( (string) $t, 3 ) : (string) $t ] = $ids;
		}
		return EMCP_Tools_FluentCRM_Writer::state_hash( self::api(), $objects, $ins );
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
		$rb  = self::heavy( (array) $rb );
		$ins = array();
		foreach ( (array) ( $rb['inserted'] ?? array() ) as $t => $ids ) {
			$ins[ 0 === strpos( (string) $t, 'fc_' ) ? substr( (string) $t, 3 ) : (string) $t ] = $ids;
		}
		$rb['inserted'] = $ins;
		return self::writer()->undo( $rb, (bool) $force );
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
	public static function blocker( EMCP_Tools_FluentCRM_Api $api, array $rb ) {
		if ( ! $api->active() ) {
			return new WP_Error( 'fluentcrm_inactive', __( 'FluentCRM is not active, so this change cannot be undone until it is switched on again.', 'emcp-tools' ) );
		}
		foreach ( self::undo_permissions( $rb ) as $perm ) {
			if ( ! $api->can( $perm ) ) {
				/* translators: %s: FluentCRM permission. */
				return new WP_Error( 'forbidden', sprintf( __( 'Undoing this needs the FluentCRM permission %s.', 'emcp-tools' ), $perm ), array( 'status' => 403 ) );
			}
		}
		if ( 'fluentcrm-batch' !== (string) ( $rb['type'] ?? '' ) ) {
			$consent = self::consent_blocker( $api, $rb );
			if ( is_wp_error( $consent ) ) {
				return $consent;
			}
		}
		if ( 'fluentcrm-contact' === (string) ( $rb['type'] ?? '' ) ) {
			return self::contact_blocker( $api, $rb );
		}
		if ( 'fluentcrm-campaign' === (string) ( $rb['type'] ?? '' ) ) {
			$id = (int) ( $rb['id'] ?? 0 );
			foreach ( $api->find( 'fc_campaign_emails', array( 'campaign_id' => $id ) ) as $e ) {
				if ( ! in_array( (string) $e['status'], EMCP_Tools_FluentCRM_Api::QUEUED, true ) ) {
					return new WP_Error( 'emails_sent', __( 'An email of this campaign has already left the queue, so this is not undone (force does not change this). Pause the campaign instead.', 'emcp-tools' ), array( 'status' => 409 ) );
				}
			}
			$row = $api->row( 'fc_campaigns', $id );
			if ( 'created' === (string) ( $rb['mode'] ?? '' ) && $row && 'draft' !== (string) $row['status'] ) {
				return new WP_Error( 'campaign_in_use', __( 'This campaign is no longer a draft, so its creation is not undone (force does not change this).', 'emcp-tools' ), array( 'status' => 409 ) );
			}
		}
		if ( 'fluentcrm-segment' === (string) ( $rb['type'] ?? '' ) && 'created' === (string) ( $rb['mode'] ?? '' ) ) {
			$kind = 'list' === (string) ( $rb['kind'] ?? '' ) ? 'list' : 'tag';
			if ( $api->find( 'fc_subscriber_pivot', array( 'object_type' => 'list' === $kind ? EMCP_Tools_FluentCRM_Api::LISTS : EMCP_Tools_FluentCRM_Api::TAG, 'object_id' => (int) ( $rb['id'] ?? 0 ) ) ) ) {
				return new WP_Error( 'segment_in_use', __( 'Contacts have been given this tag or list since it was created, so its creation is not undone (force does not change this). Delete it instead.', 'emcp-tools' ), array( 'status' => 409 ) );
			}
		}
		return true;
	}

	/**
	 * A created contact that has received email, entered an automation, been linked to a WordPress
	 * user or been given notes by someone else since; a contact who opted out after the write, so an
	 * undo would make them sendable again (D13).
	 *
	 * @return true|WP_Error
	 */
	private static function contact_blocker( EMCP_Tools_FluentCRM_Api $api, array $rb ) {
		$id  = (int) ( $rb['id'] ?? 0 );
		$row = $api->row( 'fc_subscribers', $id );
		if ( ! $row ) {
			return true;
		}
		if ( 'created' === (string) ( $rb['mode'] ?? '' ) ) {
			$c = $api->contact_counts( $id, (int) ( $rb['author'] ?? 0 ) );
			if ( $c['emails'] || $c['automations'] || $c['user_id'] > 0 || $c['notes_by_others'] ) {
				return new WP_Error( 'contact_in_use', __( 'This contact has received email, entered an automation, been linked to a WordPress user or been given notes since it was created, so its creation is not undone (force does not change this).', 'emcp-tools' ), array( 'status' => 409, 'usage' => $c ) );
			}
			return true;
		}
		return true;
	}

	/**
	 * Consent (D13, security review), for every entry that would write contact rows back: a restore
	 * that would leave a contact sendable while the contact is now unsubscribed, bounced,
	 * complained or marked as spam is refused, unless the write being undone itself left the contact
	 * in that state. An entry that does not record what the write left (a recovery) is refused:
	 * fail closed. Batches check this per row in their own undo.
	 *
	 * @return true|WP_Error
	 */
	private static function consent_blocker( EMCP_Tools_FluentCRM_Api $api, array $rb ) {
		foreach ( (array) ( $rb['before'] ?? array() ) as $rows ) {
			foreach ( (array) ( $rows['fc_subscribers'] ?? array() ) as $id => $row ) {
				$now = (string) ( $api->row( 'fc_subscribers', (int) $id )['status'] ?? '' );
				if ( ! in_array( $now, EMCP_Tools_FluentCRM_Writer::SUPPRESSED, true ) || in_array( (string) ( $row['status'] ?? '' ), EMCP_Tools_FluentCRM_Writer::SUPPRESSED, true ) ) {
					continue;
				}
				$after = $rb['after_status'] ?? '';
				$after = is_array( $after ) ? (string) ( $after[ $id ] ?? '' ) : (string) $after;
				if ( ! in_array( $after, EMCP_Tools_FluentCRM_Writer::SUPPRESSED, true ) ) {
					return new WP_Error( 'contact_opted_out', __( 'A contact in this change unsubscribed, bounced, complained or was marked as spam after it, so it is not undone: undo never makes a contact who opted out sendable again (force does not change this).', 'emcp-tools' ), array( 'status' => 409, 'contact_id' => (int) $id ) );
				}
			}
		}
		return true;
	}
}
