<?php
/**
 * History for the LifterLMS tools (spec 6): records, current hashes, undo, and the blockers for
 * students' work (D15), which run on the free emcp_tools_change_rollback_blocker seam before the
 * change log's conflict check, so force cannot pass them.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_LifterLMS_History {

	const COURSE     = 'lifterlms-course';
	const MEMBERSHIP = 'lifterlms-membership';
	const CONTENT    = 'lifterlms-content';
	const QUIZ       = 'lifterlms-quiz';
	const PLAN       = 'lifterlms-plan';
	const ENROL      = 'lifterlms-enrolment';
	const RECOVERY   = 'lifterlms-recovery';

	/** @var EMCP_Tools_LifterLMS_Api|null */
	private static $api = null;

	public static function use_api( ?EMCP_Tools_LifterLMS_Api $api ): void {
		self::$api = $api;
	}

	private static function api(): EMCP_Tools_LifterLMS_Api {
		if ( self::$api ) {
			return self::$api;
		}
		// An undo can run before the deferred MCP surface loads (an admin History request).
		foreach ( array( 'EMCP_Tools_LifterLMS_Api' => 'class-lifterlms-api.php', 'EMCP_Tools_LifterLMS_Writer' => 'class-lifterlms-writer.php', 'EMCP_Tools_LifterLMS_Integration' => 'class-lifterlms-integration.php' ) as $class => $file ) {
			if ( ! class_exists( $class ) ) {
				require_once __DIR__ . '/' . $file;
			}
		}
		return EMCP_Tools_LifterLMS_Integration::shared_api();
	}

	private static function writer(): EMCP_Tools_LifterLMS_Writer {
		return new EMCP_Tools_LifterLMS_Writer( self::api(), true );
	}

	/** @return string[] */
	private static function types(): array {
		return array( self::COURSE, self::MEMBERSHIP, self::CONTENT, self::QUIZ, self::PLAN, self::ENROL, self::RECOVERY );
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
				'domain'   => 'lifterlms',
				'action'   => $action,
				'target'   => $target,
				'summary'  => $summary,
				'rollback' => $heavy ? ( class_exists( 'EMCP_Tools_Change_Recorder' ) ? EMCP_Tools_Change_Recorder::attach_before( $rb, $heavy ) : array_merge( $rb, $heavy ) ) : $rb,
			)
		);
	}

	/** Blob-stored parts of a rollback ref, resolved. */
	private static function heavy( array $rb ): array {
		if ( class_exists( 'EMCP_Tools_Change_Recorder' ) && method_exists( 'EMCP_Tools_Change_Recorder', 'resolve_before' ) ) {
			return (array) EMCP_Tools_Change_Recorder::resolve_before( $rb );
		}
		return $rb;
	}

	private static function title( ?array $snapshot, int $id ): string {
		$t = (string) ( $snapshot['post']['post_title'] ?? $snapshot['fields']['title'] ?? '' );
		return '' !== $t ? $t : '#' . $id;
	}

	/**
	 * A course or membership write.
	 *
	 * @param string     $mode   created, edit or trashed.
	 * @param array|null $before The before-image (edit, trashed).
	 * @param string     $after  The version after the write ('trashed' for a trash).
	 * @param array      $extra  Extra rollback keys (the earlier status of a trash).
	 */
	public static function record_product( string $type, string $mode, string $op, int $id, ?array $before, string $after, array $extra = array() ): string {
		$rb    = array( 'type' => 'course' === $type ? self::COURSE : self::MEMBERSHIP, 'mode' => $mode, 'id' => $id, 'after_hash' => $after ) + $extra;
		$heavy = ( $before && 'edit' === $mode ) ? array( 'before' => $before ) : array();
		$name  = self::title( $before ?? self::api()->snapshot_post( $id ), $id );
		/* translators: 1: course or membership, 2: title, 3: operation. */
		return self::record( $op, 'lifterlms ' . $type . ' ' . $id, sprintf( __( 'LifterLMS: %1$s "%2$s" (%3$s)', 'emcp-tools' ), $type, $name, $op ), $rb, $heavy );
	}

	/**
	 * A curriculum write: the before-image of every object it changed (null for one it created),
	 * and their hash after the write.
	 */
	public static function record_content( string $op, string $kind, int $id, int $course, array $befores, string $after ): string {
		$created = array_keys( array_filter( $befores, static fn( $b ) => null === $b ) );
		$rb      = array( 'type' => self::CONTENT, 'mode' => in_array( $id, $created, true ) ? 'created' : 'edit', 'kind' => $kind, 'id' => $id, 'course_id' => $course, 'ids' => array_map( 'intval', array_keys( $befores ) ), 'after_hash' => $after );
		/* translators: 1: section, lesson or order, 2: id, 3: operation. */
		return self::record( $op, 'lifterlms ' . $kind . ' ' . $id, sprintf( __( 'LifterLMS: %1$s %2$d (%3$s)', 'emcp-tools' ), $kind, $id, $op ), $rb, array( 'befores' => $befores ) );
	}

	/** A quiz save: before-images of the quiz, its questions and its lesson (null for what it created). */
	public static function record_quiz( string $mode, string $op, int $quiz, int $course, array $befores, string $after, int $max_attempt ): string {
		$rb = array( 'type' => self::QUIZ, 'mode' => $mode, 'id' => $quiz, 'course_id' => $course, 'ids' => array_map( 'intval', array_keys( $befores ) ), 'after_hash' => $after, 'max_attempt' => $max_attempt );
		/* translators: 1: quiz id, 2: operation. */
		return self::record( $op, 'lifterlms quiz ' . $quiz, sprintf( __( 'LifterLMS: quiz %1$d (%2$s)', 'emcp-tools' ), $quiz, $op ), $rb, array( 'befores' => $befores ) );
	}

	/** A quiz moved to the trash and detached from its lesson. */
	public static function record_quiz_trash( int $quiz, int $lesson, int $course, string $status ): string {
		$rb = array( 'type' => self::QUIZ, 'mode' => 'trashed', 'id' => $quiz, 'lesson_id' => $lesson, 'course_id' => $course, 'status' => $status, 'after_hash' => 'trashed' );
		/* translators: %d: quiz id. */
		return self::record( 'trash-quiz', 'lifterlms quiz ' . $quiz, sprintf( __( 'LifterLMS: quiz %d (trash-quiz)', 'emcp-tools' ), $quiz ), $rb );
	}

	/** An access plan write: its before-image (null when created), the parent's version after (D19). */
	public static function record_plan( string $mode, string $op, int $plan, int $product, string $kind, array $befores, string $after ): string {
		$rb = array( 'type' => self::PLAN, 'mode' => $mode, 'id' => $plan, 'product_id' => $product, 'kind' => $kind, 'after_hash' => $after );
		/* translators: 1: plan id, 2: operation. */
		return self::record( $op, 'lifterlms plan ' . $plan, sprintf( __( 'LifterLMS: access plan %1$d (%2$s)', 'emcp-tools' ), $plan, $op ), $rb, array( 'befores' => $befores ) );
	}

	/** An enrolment write: the whole set before and after (D18). */
	public static function record_enrolment( string $op, int $user, int $post, array $before, array $after, array $granted ): string {
		$rb = array( 'type' => self::ENROL, 'mode' => $op, 'id' => $post, 'user_id' => $user, 'granted' => array_values( array_map( 'intval', $granted ) ), 'after_hash' => EMCP_Tools_LifterLMS_Writer::set_hash( $after ) );
		/* translators: 1: user id, 2: post id, 3: operation. */
		return self::record( $op, 'lifterlms enrolment ' . $user . ':' . $post, sprintf( __( 'LifterLMS: student %1$d in %2$d (%3$s)', 'emcp-tools' ), $user, $post, $op ), $rb, array( 'before' => $before ) );
	}

	/** A failed recovery (D21): every before-image, so History can put them back. */
	public static function record_recovery( array $befores, array $left, string $after ): string {
		$rb = array( 'type' => self::RECOVERY, 'mode' => 'recovery', 'ids' => array_map( 'intval', array_keys( $befores ) ), 'left' => array_map( 'intval', $left ), 'after_hash' => $after );
		/* translators: %s: object ids. */
		return self::record( 'recovery', 'lifterlms objects ' . implode( ',', $rb['ids'] ), sprintf( __( 'LifterLMS: earlier state of %s after a write that stopped half way', 'emcp-tools' ), implode( ', ', $rb['ids'] ) ), $rb, array( 'befores' => $befores ) );
	}

	/**
	 * @param string $hash '' when unknown.
	 * @param array  $rb   Rollback ref.
	 */
	public static function filter_hash( $hash, $rb ) {
		$type = (string) ( $rb['type'] ?? '' );
		if ( ! in_array( $type, self::types(), true ) ) {
			return $hash;
		}
		if ( ! self::api()->active() ) {
			return $hash;
		}
		switch ( $type ) {
			case self::COURSE:
				return self::writer()->version_of( 'course', (int) $rb['id'] );
			case self::MEMBERSHIP:
				return self::writer()->version_of( 'membership', (int) $rb['id'] );
			case self::QUIZ:
				if ( 'trashed' === (string) ( $rb['mode'] ?? '' ) ) {
					return 'trash' === self::api()->post_status( (int) $rb['id'] ) ? 'trashed' : 'not-trashed';
				}
				return EMCP_Tools_LifterLMS_Writer::snapshot_hash( self::api(), (array) $rb['ids'] );
			case self::ENROL:
				return EMCP_Tools_LifterLMS_Writer::set_hash( self::api()->enrolment_set( (int) $rb['user_id'], (int) $rb['id'] ) );
			case self::PLAN:
				return '' === self::api()->post_type( (int) $rb['product_id'] ) ? '' : self::writer()->version_of( (string) $rb['kind'], (int) $rb['product_id'] );
			case self::RECOVERY:
			case self::CONTENT:
				return EMCP_Tools_LifterLMS_Writer::snapshot_hash( self::api(), (array) $rb['ids'] );
		}
		return $hash;
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
		$id    = (int) ( $rb['id'] ?? 0 );
		switch ( $type ) {
			case self::COURSE:
			case self::MEMBERSHIP:
				$kind  = self::COURSE === $type ? 'course' : 'membership';
				$lease = 'course' === $kind ? EMCP_Tools_LifterLMS_Writer::course_lease( $id ) : EMCP_Tools_LifterLMS_Writer::membership_lease( $id );
				switch ( (string) $rb['mode'] ) {
					case 'edit':
						return self::writer()->undo_edit( $kind, $id, (string) $rb['after_hash'], $force, (array) ( $rb['before'] ?? array() ) );
					case 'created':
						return self::writer()->undo_create_product( $kind, $id, (string) $rb['after_hash'], $force );
					case 'trashed':
						return self::writer()->undo_trash( $lease, $id, (string) ( $rb['status'] ?? 'draft' ) );
				}
				break;
			case self::QUIZ:
				if ( 'trashed' === (string) $rb['mode'] ) {
					return self::writer()->undo_trash_quiz( (int) $rb['course_id'], $id, (int) $rb['lesson_id'], (string) $rb['status'] );
				}
				$befores = array();
				foreach ( (array) ( $rb['befores'] ?? array() ) as $k => $v ) {
					$befores[ (int) $k ] = $v;
				}
				return self::writer()->undo_content( (int) $rb['course_id'], $befores, (string) $rb['after_hash'], $force );
			case self::CONTENT:
				$befores = array();
				foreach ( (array) ( $rb['befores'] ?? array() ) as $k => $v ) {
					$befores[ (int) $k ] = $v;
				}
				return self::writer()->undo_content( (int) $rb['course_id'], $befores, (string) $rb['after_hash'], $force );
			case self::ENROL:
				return self::writer()->undo_enrolment( (int) $rb['user_id'], $id, (array) ( $rb['before'] ?? array() ), (string) $rb['after_hash'], $force, (array) ( $rb['granted'] ?? array() ) );
			case self::PLAN:
				$befores = array();
				foreach ( (array) ( $rb['befores'] ?? array() ) as $k => $v ) {
					$befores[ (int) $k ] = $v;
				}
				return self::writer()->undo_plan( (string) $rb['kind'], (int) $rb['product_id'], $id, $befores, (string) $rb['after_hash'], $force );
			case self::RECOVERY:
				$befores = array();
				foreach ( (array) ( $rb['befores'] ?? array() ) as $k => $v ) {
					$befores[ (int) $k ] = $v;
				}
				return self::writer()->undo_recovery( $befores, (string) $rb['after_hash'], $force );
		}
		return new WP_Error( 'not_reversible', __( 'This LifterLMS change cannot be undone.', 'emcp-tools' ) );
	}

	/**
	 * Students' work and a switched-off LifterLMS block an undo before the conflict check (D15).
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
			return new WP_Error( 'lifterlms_inactive', __( 'LifterLMS is not active, so this change cannot be undone until it is switched on again.', 'emcp-tools' ) );
		}
		$mode = (string) ( $rb['mode'] ?? '' );
		$id   = (int) ( $rb['id'] ?? 0 );
		if ( in_array( $type, array( self::COURSE, self::MEMBERSHIP ), true ) && 'created' === $mode ) {
			if ( $api->post_type( $id ) && ( $api->enrolled_users( $id, null, 1, 1 )['total'] > 0 || $api->has_active_subscriptions( $id ) ) ) {
				return new WP_Error( 'has_students', __( 'Students are enrolled, so it is not deleted (force does not change this).', 'emcp-tools' ) );
			}
		}
		if ( self::QUIZ === $type && in_array( $mode, array( 'created', 'edit' ), true ) && $api->quiz_attempts( $id, 'created' === $mode ? 0 : (int) ( $rb['max_attempt'] ?? 0 ) ) > 0 ) {
			return new WP_Error( 'has_attempts', __( 'Students have taken this quiz since, so the change is not undone (force does not change this).', 'emcp-tools' ) );
		}
		if ( self::ENROL === $type ) {
			foreach ( (array) ( $rb['granted'] ?? array() ) as $c ) {
				if ( $api->has_progress( (int) ( $rb['user_id'] ?? 0 ), (int) $c ) ) {
					return new WP_Error( 'has_progress', __( 'The student has made progress there since, so the enrolment is not undone (force does not change this).', 'emcp-tools' ) );
				}
			}
		}
		if ( self::PLAN === $type && 'created' === $mode && $api->post_type( $id ) && $api->plan_order_count( $id ) > 0 ) {
			return new WP_Error( 'has_orders', __( 'Orders use this access plan now, so it is not deleted (force does not change this).', 'emcp-tools' ) );
		}
		if ( self::CONTENT === $type && 'created' === $mode && 'lesson' === ( $rb['kind'] ?? '' ) && $api->lesson_completed_by( $id ) ) {
			return new WP_Error( 'has_progress', __( 'Students have completed this lesson, so it is not deleted (force does not change this).', 'emcp-tools' ) );
		}
		return $blocker;
	}
}
