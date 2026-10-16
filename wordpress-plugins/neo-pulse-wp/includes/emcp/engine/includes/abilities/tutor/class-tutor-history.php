<?php
/**
 * History for the Tutor LMS tools (3.19.0), on the free emcp_tools_change_apply_rollback /
 * emcp_tools_change_current_hash seams. Booted from the Pro loader's wire_runtime_hooks(), so the
 * admin History screen, its REST routes and WP-CLI can undo these entries. Every undo runs through
 * EMCP_Tools_Tutor_Writer in undo mode, inside the course lease, checking the recorded after-version
 * again there (History's own check runs before the handler, outside the lease).
 *
 *  - tutor-course: mode edit (restore the before-image), created (delete the course while it has no
 *    topics or students), trashed (untrash with the recorded status), order (the earlier curriculum
 *    order back through Tutor's order handler).
 *  - tutor-content: a topic or lesson; mode created (delete it while it is unchanged; a lesson students
 *    completed is never deleted), edit (restore the before-image), deleted (create it again with its
 *    old id and place).
 *  - tutor-quiz: mode created (delete it while nobody took it), edit (D14: rows back with their
 *    original ids, added rows removed; refused while students took it since, D15), deleted (create
 *    it again with its quiz, question and answer ids).
 *  - tutor-enrolment: mode enrolled (delete that one enrolment post) or status (the earlier status
 *    back through Tutor's update_enrollments()).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_Tutor_History {

	const COURSE  = 'tutor-course';
	const CONTENT = 'tutor-content';
	const QUIZ    = 'tutor-quiz';
	const ENROL   = 'tutor-enrolment';

	/** @var EMCP_Tools_Tutor_Api|null */
	private static $api = null;

	public static function use_api( ?EMCP_Tools_Tutor_Api $api ): void {
		self::$api = $api;
	}

	private static function api(): EMCP_Tools_Tutor_Api {
		if ( self::$api ) {
			return self::$api;
		}
		// An undo can run before the deferred MCP surface loads (an admin History request).
		foreach ( array( 'EMCP_Tools_Tutor_Api' => 'class-tutor-api.php', 'EMCP_Tools_Tutor_Writer' => 'class-tutor-writer.php', 'EMCP_Tools_Tutor_Integration' => 'class-tutor-integration.php' ) as $class => $file ) {
			if ( ! class_exists( $class ) ) {
				require_once __DIR__ . '/' . $file;
			}
		}
		return EMCP_Tools_Tutor_Integration::shared_api();
	}

	private static function writer(): EMCP_Tools_Tutor_Writer {
		return new EMCP_Tools_Tutor_Writer( self::api() );
	}

	public static function boot(): void {
		if ( ! has_filter( 'emcp_tools_change_apply_rollback', array( __CLASS__, 'filter_apply' ) ) ) {
			add_filter( 'emcp_tools_change_current_hash', array( __CLASS__, 'filter_hash' ), 10, 2 );
			add_filter( 'emcp_tools_change_apply_rollback', array( __CLASS__, 'filter_apply' ), 10, 3 );
			add_filter( 'emcp_tools_change_rollback_blocker', array( __CLASS__, 'filter_blocker' ), 10, 2 );
		}
	}

	/**
	 * Students' work blocks an undo before the change log's conflict check, so force cannot reach
	 * it and History shows the entry as not undoable (D15): a quiz students took since the entry,
	 * a lesson a student completed. The handlers check again under the lease.
	 *
	 * @param true|WP_Error $blocker
	 * @return true|WP_Error
	 */
	public static function filter_blocker( $blocker, array $entry ) {
		$rb = (array) ( $entry['rollback'] ?? array() );
		if ( is_wp_error( $blocker ) || ! in_array( $rb['type'] ?? '', array( self::COURSE, self::CONTENT, self::QUIZ, self::ENROL ), true ) ) {
			return $blocker;
		}
		// Every Tutor undo runs Tutor's own code; with Tutor switched off it cannot run (and must not
		// reach tutor()), so the entry waits until Tutor is active again.
		if ( ! self::api()->active() ) {
			return new WP_Error( 'tutor_inactive', __( 'Tutor LMS is not active, so this change cannot be undone until it is switched on again.', 'emcp-tools' ) );
		}
		if ( ! in_array( $rb['type'], array( self::QUIZ, self::CONTENT ), true ) ) {
			return $blocker;
		}
		$mode = (string) ( $rb['mode'] ?? '' );
		$id   = (int) ( $rb['id'] ?? 0 );
		if ( self::QUIZ === $rb['type'] && in_array( $mode, array( 'created', 'edit' ), true ) ) {
			$after = 'created' === $mode ? 0 : (int) ( $rb['max_attempt'] ?? 0 );
			if ( self::api()->quiz_attempts( $id, $after ) > 0 ) {
				return new WP_Error( 'has_attempts', __( 'Students have taken this quiz since, so the change is not undone (force does not change this).', 'emcp-tools' ) );
			}
		}
		if ( self::CONTENT === $rb['type'] && 'created' === $mode && 'lesson' === ( $rb['kind'] ?? '' ) && self::api()->lesson_completed_by( $id ) ) {
			return new WP_Error( 'has_progress', __( 'Students have completed this lesson, so it is not deleted (force does not change this).', 'emcp-tools' ) );
		}
		return $blocker;
	}

	private static function record( string $action, string $target, string $summary, array $rb, array $heavy = array() ): string {
		if ( ! class_exists( 'EMCP_Tools_Change_Log' ) ) {
			return '';
		}
		return EMCP_Tools_Change_Log::record(
			array(
				'domain'   => 'tutor',
				'action'   => $action,
				'target'   => $target,
				'summary'  => $summary,
				'rollback' => $heavy ? ( class_exists( 'EMCP_Tools_Change_Recorder' ) ? EMCP_Tools_Change_Recorder::attach_before( $rb, $heavy ) : array_merge( $rb, $heavy ) ) : $rb,
			)
		);
	}

	/**
	 * @param string             $mode   edit, created or trashed.
	 * @param array|null         $before The course record before the write (edit and trashed).
	 * @param array|WP_Error     $now    The course state after the write.
	 */
	public static function record_course( string $mode, string $op, int $id, ?array $before, $now ): string {
		$after = is_array( $now ) ? (string) $now['version'] : 'absent';
		$title = is_array( $now ) ? (string) $now['fields']['title'] : (string) ( $before['post']['post_title'] ?? '' );
		$rb    = array( 'type' => self::COURSE, 'mode' => $mode, 'course_id' => $id, 'after_hash' => $after );
		$heavy = array();
		if ( 'edit' === $mode && $before ) {
			$heavy['before'] = $before;
		}
		if ( 'trashed' === $mode && $before ) {
			$rb['status'] = (string) $before['post']['post_status'];
		}
		$summaries = array(
			/* translators: 1: course title, 2: operation. */
			'edit'    => __( 'Tutor LMS: course "%1$s" (%2$s)', 'emcp-tools' ),
			/* translators: 1: course title, 2: operation. */
			'created' => __( 'Tutor LMS: course "%1$s" created (%2$s)', 'emcp-tools' ),
			/* translators: 1: course title, 2: operation. */
			'trashed' => __( 'Tutor LMS: course "%1$s" moved to the trash (%2$s)', 'emcp-tools' ),
		);
		return self::record( $op, 'tutor course ' . $id, sprintf( $summaries[ $mode ], $title, $op ), $rb, $heavy );
	}

	/** The earlier curriculum order (reorder-contents). */
	public static function record_order( int $id, array $before_sorting, string $after, array $positions = array() ): string {
		/* translators: %d: course id. */
		return self::record( 'reorder-contents', 'tutor course ' . $id, sprintf( __( 'Tutor LMS: order of course %d', 'emcp-tools' ), $id ), array( 'type' => self::COURSE, 'mode' => 'order', 'course_id' => $id, 'after_hash' => $after, 'sorting' => $before_sorting, 'positions' => $positions ) );
	}

	/**
	 * @param string     $mode   created, edit or deleted.
	 * @param string     $kind   topic or lesson.
	 * @param array|null $before The record before the write (edit and deleted).
	 * @param string     $after  The object's version after the write ('absent' after a delete).
	 */
	public static function record_content( string $mode, string $op, string $kind, int $id, int $course, ?array $before, string $after ): string {
		$title = (string) ( $before['post']['post_title'] ?? '' );
		if ( '' === $title ) {
			$rec   = 'topic' === $kind ? self::api()->topic( $id ) : self::api()->lesson( $id );
			$title = (string) ( $rec['post']['post_title'] ?? '' );
		}
		$rb    = array( 'type' => self::CONTENT, 'kind' => $kind, 'mode' => $mode, 'id' => $id, 'course_id' => $course, 'after_hash' => $after );
		$heavy = $before ? array( 'before' => $before ) : array();
		/* translators: 1: topic or lesson, 2: title, 3: operation. */
		return self::record( $op, 'tutor ' . $kind . ' ' . $id, sprintf( __( 'Tutor LMS: %1$s "%2$s" (%3$s)', 'emcp-tools' ), $kind, $title, $op ), $rb, $heavy );
	}

	/** @param string $mode enrolled (undo deletes that enrolment post) or status (undo sets $before back). */
	public static function record_enrolment( string $mode, string $op, int $enrolment_id, int $course, int $user, string $before, string $after ): string {
		$rb = array( 'type' => self::ENROL, 'mode' => $mode, 'id' => $enrolment_id, 'course_id' => $course, 'user_id' => $user, 'before_status' => $before, 'after_status' => $after, 'after_hash' => $after );
		/* translators: 1: user id, 2: course id, 3: operation. */
		return self::record( $op, 'tutor enrolment ' . $enrolment_id, sprintf( __( 'Tutor LMS: enrolment of user %1$d in course %2$d (%3$s)', 'emcp-tools' ), $user, $course, $op ), $rb );
	}

	/** @param int $max_attempt The quiz's highest attempt id when the write happened (D15). */
	public static function record_quiz( string $mode, string $op, int $id, int $course, ?array $before, string $after, int $max_attempt ): string {
		$title = (string) ( $before['post']['post_title'] ?? '' );
		if ( '' === $title ) {
			$rec   = self::api()->quiz( $id );
			$title = (string) ( $rec['post']['post_title'] ?? '' );
		}
		$rb    = array( 'type' => self::QUIZ, 'mode' => $mode, 'id' => $id, 'course_id' => $course, 'after_hash' => $after, 'max_attempt' => $max_attempt );
		$heavy = $before ? array( 'before' => $before ) : array();
		/* translators: 1: quiz title, 2: operation. */
		return self::record( $op, 'tutor quiz ' . $id, sprintf( __( 'Tutor LMS: quiz "%1$s" (%2$s)', 'emcp-tools' ), $title, $op ), $rb, $heavy );
	}

	/**
	 * @param string $hash '' when unknown.
	 * @param array  $rb   Rollback ref.
	 */
	public static function filter_hash( $hash, $rb ) {
		if ( self::COURSE === (string) ( $rb['type'] ?? '' ) ) {
			$state = EMCP_Tools_Tutor_Integration::state_of( self::api(), (int) $rb['course_id'] );
			return is_wp_error( $state ) ? 'absent' : (string) $state['version'];
		}
		if ( self::CONTENT === (string) ( $rb['type'] ?? '' ) ) {
			return self::writer()->content_version( (string) $rb['kind'], (int) $rb['id'] );
		}
		if ( self::QUIZ === (string) ( $rb['type'] ?? '' ) ) {
			return self::writer()->quiz_version_of( (int) $rb['id'] );
		}
		if ( self::ENROL === (string) ( $rb['type'] ?? '' ) ) {
			return self::writer()->enrolment_state( (int) $rb['course_id'], (int) $rb['user_id'], (int) $rb['id'] );
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
		if ( self::ENROL === (string) ( $rb['type'] ?? '' ) ) {
			return self::writer()->undo_enrolment( (string) $rb['mode'], (int) $rb['id'], (int) $rb['course_id'], (int) $rb['user_id'], (string) $rb['before_status'], (string) $rb['after_status'] );
		}
		if ( self::QUIZ === (string) ( $rb['type'] ?? '' ) ) {
			return self::writer()->undo_quiz( (string) $rb['mode'], (int) $rb['id'], (int) $rb['course_id'], (string) $rb['after_hash'], (bool) $force, isset( $rb['before'] ) ? (array) $rb['before'] : null, (int) ( $rb['max_attempt'] ?? 0 ) );
		}
		if ( self::CONTENT === (string) ( $rb['type'] ?? '' ) ) {
			return self::writer()->undo_content( (string) $rb['mode'], (string) $rb['kind'], (int) $rb['id'], (int) $rb['course_id'], (string) $rb['after_hash'], (bool) $force, isset( $rb['before'] ) ? (array) $rb['before'] : null );
		}
		if ( self::COURSE !== (string) ( $rb['type'] ?? '' ) ) {
			return $result;
		}
		$id    = (int) $rb['course_id'];
		$force = (bool) $force;
		switch ( (string) ( $rb['mode'] ?? '' ) ) {
			case 'edit':
				return self::writer()->restore_course( $id, (string) $rb['after_hash'], $force, (array) ( $rb['before'] ?? array() ) );
			case 'created':
				return self::writer()->undo_create_course( $id, (string) $rb['after_hash'], $force );
			case 'trashed':
				return self::writer()->untrash_course( $id, (string) ( $rb['status'] ?? 'draft' ), $force );
			case 'order':
				return self::writer()->undo_order( $id, (string) $rb['after_hash'], $force, (array) ( $rb['sorting'] ?? array() ), (array) ( $rb['positions'] ?? array() ) );
		}
		return new WP_Error( 'rollback_failed', __( 'Unknown Tutor LMS History entry.', 'emcp-tools' ) );
	}
}
