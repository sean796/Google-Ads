<?php
/**
 * Every LifterLMS write (spec 4.4): leases in one fixed order (D20), before-images, the version
 * check, LifterLMS's abilities with a journal of what they created, an exact check of what
 * LifterLMS stored, History, and recovery from the before-images on any failure after a change
 * (D21). Undo runs the same template in undo mode, which records nothing.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_LifterLMS_Writer {

	const TTL = 60;

	/** Lease for creating a course or membership. */
	const NEW_LEASE = 'lifterlms-new';

	/** @var EMCP_Tools_Lease|null */
	private static $lease = null;

	/** @var callable|null Test seam: runs once every lease is held, before anything is read. */
	public static $on_lease = null;

	/** @var EMCP_Tools_LifterLMS_Api */
	protected $api;

	/** @var bool Undo mode: no History record of its own. */
	protected $undo;

	/** @var int[] Objects the current call created (journal, D21). */
	protected $created = array();

	public function __construct( EMCP_Tools_LifterLMS_Api $api, bool $undo = false ) {
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

	public static function course_lease( int $id ): string {
		return 'lifterlms-course-' . $id;
	}

	public static function membership_lease( int $id ): string {
		return 'lifterlms-membership-' . $id;
	}

	public static function student_lease( int $id ): string {
		return 'lifterlms-student-' . $id;
	}

	/** D20: memberships ascending, then courses ascending, then the student. @return string[] */
	public static function lock_order( array $memberships, array $courses, int $student ): array {
		$m = array_values( array_unique( array_map( 'intval', $memberships ) ) );
		$c = array_values( array_unique( array_map( 'intval', $courses ) ) );
		sort( $m );
		sort( $c );
		$keys = array_merge( array_map( array( __CLASS__, 'membership_lease' ), $m ), array_map( array( __CLASS__, 'course_lease' ), $c ) );
		if ( $student > 0 ) {
			$keys[] = self::student_lease( $student );
		}
		return $keys;
	}

	/**
	 * Run $fn holding every lease in $keys, taken in that order and never waiting: a lease held
	 * elsewhere releases the ones taken so far and answers lifterlms_busy (D20).
	 *
	 * @return mixed|WP_Error
	 */
	public function locked( array $keys, callable $fn ) {
		$owner = 'lifterlms-' . bin2hex( random_bytes( 6 ) );
		$held  = array();
		foreach ( $keys as $key ) {
			if ( ! self::lease()->acquire( $key, $owner, self::TTL ) ) {
				foreach ( array_reverse( $held ) as $h ) {
					self::lease()->release( $h, $owner );
				}
				return new WP_Error( 'lifterlms_busy', __( 'Another change to this LifterLMS content or student is running. Try again in a moment.', 'emcp-tools' ), array( 'status' => 409, 'lease' => $key ) );
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

	// The write template (D21).

	/** The journal: an object this call created. */
	protected function created( int $id ): void {
		$this->created[] = $id;
	}

	/**
	 * @param int[]    $ids     Objects the write may change (their before-images are taken here).
	 * @param callable $do      Runs LifterLMS's abilities; returns its result or a WP_Error.
	 * @param callable $verify  ( $result ) => string[] fields that differ (empty when right).
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
			$result = new WP_Error( 'lifterlms_error', $e->getMessage() );
		}
		if ( is_wp_error( $result ) ) {
			if ( ! $this->created && ! $this->changed( $befores ) ) {
				return $result;
			}
			return $this->fail( 'save_failed', __( 'LifterLMS refused part of this change; what was written was put back.', 'emcp-tools' ), $befores, array( 'lifterlms_error' => $result->get_error_code(), 'message' => $result->get_error_message() ) );
		}
		$bad = $verify( $result );
		if ( $bad ) {
			/* translators: %s: field names. */
			return $this->fail( 'save_incomplete', sprintf( __( 'LifterLMS did not store the change as written (%s); it was put back.', 'emcp-tools' ), implode( ', ', array_unique( array_map( 'strval', $bad ) ) ) ), $befores, array( 'fields' => array_values( $bad ) ) );
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

	/** Put everything back (journal backwards, then the before-images); answer $code or partial_write. */
	protected function fail( string $code, string $message, array $befores, array $data ): WP_Error {
		$left = $this->recover( $befores );
		if ( ! $left ) {
			return new WP_Error( $code, $message, $data + array( 'restored' => true, 'status' => 409 ) );
		}
		$change = $this->undo ? '' : EMCP_Tools_LifterLMS_History::record_recovery( $befores, $left, self::snapshot_hash( $this->api, array_keys( $befores ) ) );
		if ( defined( 'WP_DEBUG' ) && WP_DEBUG ) {
			error_log( 'EMCP LifterLMS: recovery left objects changed: ' . implode( ',', $left ) ); // phpcs:ignore WordPress.PHP.DevelopmentFunctions
		}
		return new WP_Error( 'partial_write', __( 'LifterLMS stopped half way and EMCP could not put everything back. History holds the earlier state of every object this changed; undo it there once the cause is fixed.', 'emcp-tools' ), array( 'objects' => $left, 'change_id' => $change, 'cause' => $code, 'status' => 500 ) + $data );
	}

	/** @return int[] objects still different after recovery */
	protected function recover( array $befores ): array {
		foreach ( array_reverse( $this->created ) as $id ) {
			if ( ! array_key_exists( $id, $befores ) ) {
				$this->api->delete_post_permanently( $id );
			}
		}
		foreach ( $befores as $id => $before ) {
			$now = $this->api->snapshot_post( (int) $id );
			if ( $now === $before ) {
				continue;
			}
			if ( null === $before ) {
				$this->api->delete_post_permanently( (int) $id );
			} elseif ( null === $now ) {
				$this->api->recreate_post( $before );
			} else {
				$this->api->restore_post( $before );
			}
		}
		$left = $this->changed( $befores );
		foreach ( $this->created as $id ) {
			if ( ! array_key_exists( $id, $befores ) && null !== $this->api->snapshot_post( $id ) ) {
				$left[] = $id;
			}
		}
		return array_values( array_unique( $left ) );
	}

	/** Version over the snapshots of a set of objects (recovery entries). */
	public static function snapshot_hash( EMCP_Tools_LifterLMS_Api $api, array $ids ): string {
		$s = array();
		foreach ( $ids as $id ) {
			$s[ (int) $id ] = $api->snapshot_post( (int) $id );
		}
		ksort( $s );
		return EMCP_Tools_LifterLMS_Api::version( array( 'snapshots' => $s ) );
	}

	// Checks.

	/** @return true|WP_Error */
	protected static function version_check( string $current, ?string $given, bool $force, string $read, string $arg ) {
		if ( $force ) {
			return true;
		}
		if ( null === $given || '' === $given ) {
			/* translators: 1: read operation, 2: argument name. */
			return new WP_Error( 'missing_version', sprintf( __( 'Pass the version from %1$s as %2$s (or force:true to overwrite whatever is there).', 'emcp-tools' ), $read, $arg ) );
		}
		if ( ! hash_equals( $current, $given ) ) {
			/* translators: %s: read operation. */
			return new WP_Error( 'conflict', sprintf( __( 'It changed since you read it. Read it again with %s and redo the change, or pass force:true.', 'emcp-tools' ), $read ), array( 'status' => 409, 'current_version' => $current ) );
		}
		return true;
	}

	/** Text compared as text: markup and entities LifterLMS's sanitizing changes are not a mismatch (Review Focus 1). */
	public static function text( $v ): string {
		$s = html_entity_decode( (string) $v, ENT_QUOTES, 'UTF-8' );
		$s = (string) preg_replace( '/<!--.*?-->/s', ' ', $s );
		return trim( (string) preg_replace( '/\s+/u', ' ', wp_strip_all_tags( $s ) ) );
	}

	/** @return string[] the sent fields LifterLMS did not store */
	public static function mismatches( array $sent, array $stored ): array {
		$bad = array();
		foreach ( $sent as $k => $v ) {
			$have = $stored[ $k ] ?? null;
			if ( is_array( $v ) ) {
				$a = array_map( 'strval', $v );
				$b = array_map( 'strval', (array) $have );
				sort( $a );
				sort( $b );
				$ok = $a === $b;
			} elseif ( is_bool( $v ) ) {
				$ok = (bool) $have === $v;
			} elseif ( is_int( $v ) || is_float( $v ) ) {
				$ok = (float) $have === (float) $v;
			} else {
				$ok = self::text( $v ) === self::text( $have );
			}
			if ( ! $ok ) {
				$bad[] = $k;
			}
		}
		return $bad;
	}

	protected function answer( array $base, string $change ): array {
		return $base + array( 'change' => array( 'change_id' => $change, 'undo' => array( 'available' => '' !== $change ) ) );
	}

	// Courses and memberships (spec 4.2).

	/** @return array|WP_Error */
	public function create_product( string $type, array $fields, bool $dry_run ) {
		$fields += array( 'content' => '', 'status' => 'draft' );
		if ( $dry_run ) {
			return array( 'dry_run' => true, 'fields' => $fields );
		}
		$ability = 'course' === $type ? 'create-course' : 'create-membership';
		return $this->locked(
			array( self::NEW_LEASE ),
			function () use ( $type, $fields, $ability ) {
				$t = $this->transact(
					array(),
					function () use ( $fields, $ability ) {
						$r = $this->api->run( $ability, $fields );
						if ( is_wp_error( $r ) ) {
							return $r;
						}
						$this->created( (int) $r['id'] );
						return (int) $r['id'];
					},
					function ( $id ) use ( $type, $fields ) {
						$state = $this->state( $type, (int) $id );
						return is_wp_error( $state ) ? array( 'id' ) : self::mismatches( $fields, $state['fields'] );
					},
					function ( $id ) use ( $type ) {
						return EMCP_Tools_LifterLMS_History::record_product( $type, 'created', 'course' === $type ? 'create-course' : 'create-membership', (int) $id, null, $this->version_of( $type, (int) $id ) );
					}
				);
				return is_wp_error( $t ) ? $t : $this->product_answer( $type, (int) $t['result'], $t['change'] );
			}
		);
	}

	/** @return array|WP_Error */
	public function update_product( string $type, int $id, ?string $version, bool $force, array $changes, string $op, bool $dry_run ) {
		return $this->locked(
			array( 'course' === $type ? self::course_lease( $id ) : self::membership_lease( $id ) ),
			function () use ( $type, $id, $version, $force, $changes, $op, $dry_run ) {
				$state = $this->state( $type, $id );
				if ( is_wp_error( $state ) ) {
					return $state;
				}
				$check = self::version_check( $state['version'], $version, $force, 'course' === $type ? 'get-course' : 'get-membership', 'course' === $type ? 'course_version' : 'membership_version' );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				if ( $dry_run ) {
					return array( 'dry_run' => true, 'id' => $id, 'changes' => $changes, 'version' => $state['version'] );
				}
				$t = $this->transact(
					array( $id ),
					fn() => $this->api->run( 'course' === $type ? 'update-course' : 'update-membership', array( 'id' => $id ) + $changes ),
					function () use ( $type, $id, $changes ) {
						$now = $this->state( $type, $id );
						return is_wp_error( $now ) ? array_keys( $changes ) : self::mismatches( $changes, $now['fields'] + array( 'status' => $this->api->post_status( $id ) ) );
					},
					fn( $r, $befores ) => EMCP_Tools_LifterLMS_History::record_product( $type, 'edit', $op, $id, $befores[ $id ], $this->version_of( $type, $id ) )
				);
				return is_wp_error( $t ) ? $t : $this->product_answer( $type, $id, $t['change'] );
			}
		);
	}

	/** Trash only (D6). @return array|WP_Error */
	public function trash_product( string $type, int $id, ?string $version, bool $force ) {
		return $this->locked(
			array( 'course' === $type ? self::course_lease( $id ) : self::membership_lease( $id ) ),
			function () use ( $type, $id, $version, $force ) {
				$state = $this->state( $type, $id );
				if ( is_wp_error( $state ) ) {
					return $state;
				}
				$check = self::version_check( $state['version'], $version, $force, 'course' === $type ? 'get-course' : 'get-membership', 'course' === $type ? 'course_version' : 'membership_version' );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				$status = $this->api->post_status( $id );
				$t      = $this->transact(
					array( $id ),
					fn() => $this->api->run( 'course' === $type ? 'delete-course' : 'delete-membership', array( 'id' => $id ) ),
					fn() => 'trash' === $this->api->post_status( $id ) ? array() : array( 'status' ),
					fn( $r, $befores ) => EMCP_Tools_LifterLMS_History::record_product( $type, 'trashed', 'course' === $type ? 'trash-course' : 'trash-membership', $id, $befores[ $id ], 'trashed', array( 'status' => $status ) )
				);
				return is_wp_error( $t ) ? $t : $this->answer( array( 'id' => $id, 'status' => 'trash', 'earlier_status' => $status ), $t['change'] );
			}
		);
	}

	/** @return array|WP_Error state of a course or membership */
	protected function state( string $type, int $id ) {
		return 'course' === $type ? EMCP_Tools_LifterLMS_Integration::state_of( $this->api, $id ) : EMCP_Tools_LifterLMS_Integration::membership_state( $this->api, $id );
	}

	public function version_of( string $type, int $id ): string {
		if ( 'trash' === $this->api->post_status( $id ) ) {
			return 'trashed';
		}
		$s = $this->state( $type, $id );
		return is_wp_error( $s ) ? 'absent' : (string) $s['version'];
	}

	protected function product_answer( string $type, int $id, string $change ): array {
		$v    = $this->version_of( $type, $id );
		$base = array( 'id' => $id, 'status' => $this->api->post_status( $id ), 'course' === $type ? 'course_version' : 'membership_version' => $v, 'version' => $v, 'edit_url' => admin_url( 'post.php?post=' . $id . '&action=edit' ) );
		$s    = $this->state( $type, $id );
		$note = is_wp_error( $s ) ? null : self::block_note( $type, (string) ( $s['fields']['content'] ?? '' ) );
		return $this->answer( $base + ( $note ? array( 'note' => $note ) : array() ), $change );
	}

	/**
	 * LifterLMS treats a course or membership whose content holds blocks as built with its block
	 * editor the first time someone opens it there (LLMS_Blocks_Migrate::migrate_post()), and then
	 * shows only the blocks in the content: without its own blocks the syllabus and pricing table
	 * disappear from the page. Found live; EMCP never rewrites the content, it says so.
	 */
	public static function block_note( string $type, string $content ): ?string {
		if ( false === strpos( $content, '<!-- wp:' ) ) {
			return null;
		}
		if ( 'course' === $type && false === strpos( $content, '<!-- wp:llms/' ) ) {
			return __( 'The content uses blocks but none of LifterLMS\'s, so once the course is opened in the block editor LifterLMS shows no course information, pricing or syllabus. Add them to the content: <!-- wp:llms/course-information /--> <!-- wp:llms/instructors /--> <!-- wp:llms/pricing-table /--> <!-- wp:llms/course-progress /--> <!-- wp:llms/course-syllabus /--> (or send plain HTML without block comments).', 'emcp-tools' );
		}
		if ( 'membership' === $type && false === strpos( $content, '<!-- wp:llms/pricing-table' ) ) {
			return __( 'The content uses blocks but no LifterLMS pricing table, so once the membership is opened in the block editor LifterLMS shows no plans. Add <!-- wp:llms/pricing-table /--> to the content (or send plain HTML without block comments).', 'emcp-tools' );
		}
		return null;
	}

	// Undo mode (spec 6).

	/** An edit's before-image back. @return true|WP_Error */
	public function undo_edit( string $type, int $id, string $after, bool $force, array $before ) {
		return $this->locked(
			array( 'course' === $type ? self::course_lease( $id ) : self::membership_lease( $id ) ),
			function () use ( $type, $id, $after, $force, $before ) {
				$check = $this->undo_check( $this->version_of( $type, $id ), $after, $force );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				return $this->restore_one( $id, $before );
			}
		);
	}

	/** @return true|WP_Error */
	protected function restore_one( int $id, array $before ) {
		$t = $this->transact(
			array( $id ),
			fn() => $this->api->restore_post( $before ) ? true : new WP_Error( 'rollback_failed', __( 'The earlier state could not be written back.', 'emcp-tools' ) ),
			fn() => $this->api->snapshot_post( $id ) === $before ? array() : array( 'before_image' ),
			fn() => ''
		);
		return is_wp_error( $t ) ? $t : true;
	}

	/** @return true|WP_Error */
	protected function undo_check( string $current, string $after, bool $force ) {
		if ( ! $force && ! hash_equals( $after, $current ) ) {
			return new WP_Error( 'conflict', __( 'This changed after the History entry, so it is not undone.', 'emcp-tools' ), array( 'status' => 409, 'current_version' => $current ) );
		}
		return true;
	}

	/** Undo a create: delete it permanently (D15 blockers ran first; checked again here). @return true|WP_Error */
	public function undo_create_product( string $type, int $id, string $after, bool $force ) {
		return $this->locked(
			array( 'course' === $type ? self::course_lease( $id ) : self::membership_lease( $id ) ),
			function () use ( $type, $id, $after, $force ) {
				if ( '' === $this->api->post_type( $id ) ) {
					return new WP_Error( 'conflict', __( 'It is gone already.', 'emcp-tools' ) );
				}
				if ( $this->api->enrolled_users( $id, null, 1, 1 )['total'] > 0 || $this->api->has_active_subscriptions( $id ) ) {
					return new WP_Error( 'has_students', __( 'Students are enrolled, so it is not deleted (force does not change this).', 'emcp-tools' ) );
				}
				if ( 'course' === $type ) {
					$cur = EMCP_Tools_LifterLMS_Integration::curriculum( $this->api, $id );
					if ( is_wp_error( $cur ) || $cur ) {
						return new WP_Error( 'conflict', __( 'The course holds sections now; remove them first.', 'emcp-tools' ) );
					}
				}
				$check = $this->undo_check( $this->version_of( $type, $id ), $after, $force );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				return $this->api->delete_post_permanently( $id ) ? true : new WP_Error( 'rollback_failed', __( 'It could not be deleted.', 'emcp-tools' ) );
			}
		);
	}

	/** Undo a trash with the recorded status (D14). @return true|WP_Error */
	public function undo_trash( string $lease, int $id, string $status ) {
		return $this->locked(
			array( $lease ),
			function () use ( $id, $status ) {
				if ( 'trash' !== $this->api->post_status( $id ) ) {
					return new WP_Error( 'conflict', __( 'It is no longer in the trash.', 'emcp-tools' ) );
				}
				return $this->api->untrash( $id, $status ) ? true : new WP_Error( 'rollback_failed', __( 'It could not be taken out of the trash.', 'emcp-tools' ) );
			}
		);
	}

	/** Undo a lifterlms-recovery entry: every before-image back. @return true|WP_Error */
	public function undo_recovery( array $befores, string $after, bool $force ) {
		$check = $this->undo_check( self::snapshot_hash( $this->api, array_keys( $befores ) ), $after, $force );
		if ( is_wp_error( $check ) ) {
			return $check;
		}
		$this->created = array();
		$left          = $this->recover( $befores );
		return $left ? new WP_Error( 'rollback_failed', __( 'Some objects could not be put back yet.', 'emcp-tools' ), array( 'objects' => $left ) ) : true;
	}

	// Curriculum: sections, lessons and order (spec 4.2, D12, D17).

	/** Every section and lesson of the course, orphans included (LifterLMS renumbers siblings, so all of them may change). @return int[] */
	public function content_ids( int $course ): array {
		$ids = array();
		$cur = EMCP_Tools_LifterLMS_Integration::curriculum( $this->api, $course );
		foreach ( is_wp_error( $cur ) ? array() : $cur as $s ) {
			$ids[] = (int) $s['id'];
			foreach ( $s['lessons'] as $l ) {
				$ids[] = (int) $l['id'];
			}
		}
		foreach ( $this->api->orphan_lessons( $course ) as $o ) {
			$ids[] = (int) $o['id'];
		}
		return array_values( array_unique( $ids ) );
	}

	/** The before-images of what changed (null for what this call created) and their hash after the write. */
	protected function changed_set( array $befores ): array {
		$set = array();
		foreach ( $this->changed( $befores ) as $id ) {
			$set[ $id ] = $befores[ $id ];
		}
		foreach ( $this->created as $id ) {
			$set[ $id ] = null;
		}
		ksort( $set );
		return array( 'befores' => $set, 'after' => self::snapshot_hash( $this->api, array_keys( $set ) ) );
	}

	/**
	 * A curriculum write under the course lease: course version check, then $do inside the template,
	 * recorded as a lifterlms-content entry holding every changed object's before-image.
	 *
	 * @param array|null $lesson_check [lesson id, version] when the lesson's own version is checked instead.
	 * @return array|WP_Error {result, change, course}
	 */
	protected function content_write( int $course, ?string $cv, bool $force, ?array $lesson_check, string $op, string $kind, callable $do, callable $verify, callable $target ) {
		return $this->locked(
			array( self::course_lease( $course ) ),
			function () use ( $course, $cv, $force, $lesson_check, $op, $kind, $do, $verify, $target ) {
				if ( $lesson_check ) {
					$ls = EMCP_Tools_LifterLMS_Integration::lesson_state( $this->api, (int) $lesson_check[0] );
					if ( is_wp_error( $ls ) ) {
						return $ls;
					}
					$check = self::version_check( $ls['version'], $lesson_check[1], $force, 'get-lesson', 'version' );
				} else {
					$state = EMCP_Tools_LifterLMS_Integration::state_of( $this->api, $course );
					if ( is_wp_error( $state ) ) {
						return $state;
					}
					$check = self::version_check( $state['version'], $cv, $force, 'get-course', 'course_version' );
				}
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				$t = $this->transact(
					$this->content_ids( $course ),
					$do,
					$verify,
					function ( $r ) use ( $op, $kind, $course, $target ) {
						$set = $this->changed_set( $this->last_befores );
						return EMCP_Tools_LifterLMS_History::record_content( $op, $kind, (int) $target( $r ), $course, $set['befores'], $set['after'] );
					}
				);
				return is_wp_error( $t ) ? $t : $t + array( 'course' => $course );
			}
		);
	}

	/** @var array The before-images of the current transact() call (for changed_set()). */
	protected $last_befores = array();

	protected function content_answer( string $kind, int $id, int $course, string $change ): array {
		$state   = EMCP_Tools_LifterLMS_Integration::state_of( $this->api, $course );
		$version = '';
		if ( 'lesson' === $kind && 'trash' !== $this->api->post_status( $id ) ) {
			$ls      = EMCP_Tools_LifterLMS_Integration::lesson_state( $this->api, $id );
			$version = is_wp_error( $ls ) ? '' : $ls['version'];
		}
		return $this->answer( array( 'id' => $id, 'kind' => $kind, 'version' => $version, 'course_version' => is_wp_error( $state ) ? '' : $state['version'] ), $change );
	}

	/** @return array|WP_Error */
	public function create_section( int $course, ?string $cv, bool $force, array $fields ) {
		$t = $this->content_write(
			$course,
			$cv,
			$force,
			null,
			'create-section',
			'section',
			function () use ( $course, $fields ) {
				$r = $this->api->run( 'create-section', array( 'parent_id' => $course ) + $fields );
				if ( is_wp_error( $r ) ) {
					return $r;
				}
				$this->created( (int) $r['id'] );
				return (int) $r['id'];
			},
			fn( $id ) => $this->section_mismatches( (int) $id, $fields ),
			fn( $id ) => $id
		);
		return is_wp_error( $t ) ? $t : $this->content_answer( 'section', (int) $t['result'], $course, $t['change'] );
	}

	/** @return string[] */
	protected function section_mismatches( int $id, array $fields ): array {
		$s = $this->api->run( 'get-section', array( 'id' => $id ) );
		if ( is_wp_error( $s ) ) {
			return array( 'id' );
		}
		$f = EMCP_Tools_LifterLMS_Integration::fields( $s );
		unset( $fields['order'] ); // LifterLMS renumbers; the position is checked through the curriculum.
		return self::mismatches( $fields, $f );
	}

	/** @return array|WP_Error */
	public function update_section( int $section, ?string $cv, bool $force, array $changes ) {
		$course = $this->api->owner_course( $section );
		$t      = $this->content_write(
			$course,
			$cv,
			$force,
			null,
			'update-section',
			'section',
			fn() => $this->api->run( 'update-section', array( 'id' => $section ) + $changes ),
			fn() => $this->section_mismatches( $section, $changes ),
			fn() => $section
		);
		return is_wp_error( $t ) ? $t : $this->content_answer( 'section', $section, $course, $t['change'] );
	}

	/** An empty section only (D12). @return array|WP_Error */
	public function delete_section( int $section, ?string $cv, bool $force ) {
		$course = $this->api->owner_course( $section );
		foreach ( (array) EMCP_Tools_LifterLMS_Integration::curriculum( $this->api, $course ) as $s ) {
			if ( (int) $s['id'] === $section && $s['lessons'] ) {
				return new WP_Error( 'section_not_empty', __( 'The section still holds lessons; move or trash them first (LifterLMS deletes sections permanently and would leave them without a section).', 'emcp-tools' ) );
			}
		}
		$t = $this->content_write(
			$course,
			$cv,
			$force,
			null,
			'delete-section',
			'section',
			fn() => $this->api->run( 'delete-section', array( 'id' => $section ) ),
			fn() => '' === $this->api->post_type( $section ) ? array() : array( 'id' ),
			fn() => $section
		);
		return is_wp_error( $t ) ? $t : $this->content_answer( 'section', $section, $course, $t['change'] );
	}

	/** @return string[] */
	protected function lesson_mismatches( int $id, array $fields ): array {
		$ls = EMCP_Tools_LifterLMS_Integration::lesson_state( $this->api, $id );
		if ( is_wp_error( $ls ) ) {
			return array( 'id' );
		}
		unset( $fields['order'] );
		return self::mismatches( $fields, $ls['fields'] + array( 'status' => $this->api->post_status( $id ) ) );
	}

	/** @return array|WP_Error */
	public function create_lesson( int $section, ?string $cv, bool $force, array $fields ) {
		$course  = $this->api->owner_course( $section );
		$fields += array( 'content' => '' );
		$t       = $this->content_write(
			$course,
			$cv,
			$force,
			null,
			'create-lesson',
			'lesson',
			function () use ( $section, $fields ) {
				$r = $this->api->run( 'create-lesson', array( 'parent_id' => $section ) + $fields );
				if ( is_wp_error( $r ) ) {
					return $r;
				}
				$this->created( (int) $r['id'] );
				return (int) $r['id'];
			},
			fn( $id ) => $this->lesson_mismatches( (int) $id, $fields + array( 'parent_id' => $section ) ),
			fn( $id ) => $id
		);
		return is_wp_error( $t ) ? $t : $this->content_answer( 'lesson', (int) $t['result'], $course, $t['change'] );
	}

	/** @return array|WP_Error */
	public function update_lesson( int $lesson, ?string $version, bool $force, array $changes ) {
		$course = $this->api->owner_course( $lesson );
		if ( isset( $changes['section_id'] ) ) {
			$to = (int) $changes['section_id'];
			if ( 'section' !== $this->api->post_type( $to ) || $this->api->owner_course( $to ) !== $course ) {
				return new WP_Error( 'not_found', __( 'section_id must be a section of the same course.', 'emcp-tools' ), array( 'status' => 404 ) );
			}
			$changes['parent_id'] = $to;
			unset( $changes['section_id'] );
		}
		$t = $this->content_write(
			$course,
			null,
			$force,
			array( $lesson, $version ),
			'update-lesson',
			'lesson',
			fn() => $this->api->run( 'update-lesson', array( 'id' => $lesson ) + $changes ),
			fn() => $this->lesson_mismatches( $lesson, $changes ),
			fn() => $lesson
		);
		return is_wp_error( $t ) ? $t : $this->content_answer( 'lesson', $lesson, $course, $t['change'] );
	}

	/** @return array|WP_Error */
	public function trash_lesson( int $lesson, ?string $version, bool $force ) {
		$course = $this->api->owner_course( $lesson );
		$ls     = EMCP_Tools_LifterLMS_Integration::lesson_state( $this->api, $lesson );
		if ( ! is_wp_error( $ls ) && ! empty( $ls['fields']['quiz']['enabled'] ) && (int) ( $ls['fields']['quiz']['id'] ?? 0 ) ) {
			return new WP_Error( 'lesson_has_quiz', __( 'The lesson has a quiz; trash the quiz first.', 'emcp-tools' ) );
		}
		$t = $this->content_write(
			$course,
			null,
			$force,
			array( $lesson, $version ),
			'trash-lesson',
			'lesson',
			fn() => $this->api->run( 'delete-lesson', array( 'id' => $lesson ) ),
			fn() => 'trash' === $this->api->post_status( $lesson ) ? array() : array( 'status' ),
			fn() => $lesson
		);
		return is_wp_error( $t ) ? $t : $this->content_answer( 'lesson', $lesson, $course, $t['change'] );
	}

	/** @param array $sections [{section_id, lessons: int[]}] @return array|WP_Error */
	public function reorder( int $course, ?string $cv, bool $force, array $sections ) {
		$want_s = array();
		$want_l = array();
		$plan   = array();
		foreach ( $sections as $s ) {
			if ( ! is_array( $s ) || ! isset( $s['section_id'] ) ) {
				return new WP_Error( 'invalid_argument', __( 'sections must be a list of {section_id, lessons}.', 'emcp-tools' ) );
			}
			$sid      = (int) $s['section_id'];
			$lessons  = array_map( 'intval', (array) ( $s['lessons'] ?? array() ) );
			$want_s[] = $sid;
			$want_l   = array_merge( $want_l, $lessons );
			$plan[]   = array( $sid, $lessons );
		}
		$have_s = array();
		$have_l = array();
		foreach ( (array) EMCP_Tools_LifterLMS_Integration::curriculum( $this->api, $course ) as $s ) {
			$have_s[] = (int) $s['id'];
			$have_l   = array_merge( $have_l, array_column( $s['lessons'], 'id' ) );
		}
		$have_l = array_merge( $have_l, array_column( $this->api->orphan_lessons( $course ), 'id' ) );
		$sorted = static function ( array $a ): array {
			$a = array_map( 'intval', $a );
			sort( $a );
			return $a;
		};
		if ( $sorted( $want_s ) !== $sorted( $have_s ) || $sorted( $want_l ) !== $sorted( $have_l ) || count( $want_l ) !== count( array_unique( $want_l ) ) ) {
			return new WP_Error( 'order_mismatch', __( 'List every section of the course once and every lesson (orphans included) exactly once.', 'emcp-tools' ), array( 'sections' => $have_s, 'lessons' => $have_l ) );
		}
		$t = $this->content_write(
			$course,
			$cv,
			$force,
			null,
			'reorder-curriculum',
			'order',
			function () use ( $plan ) {
				foreach ( $plan as $i => $p ) {
					$r = $this->api->run( 'update-section', array( 'id' => $p[0], 'order' => $i + 1 ) );
					if ( is_wp_error( $r ) ) {
						return $r;
					}
					foreach ( $p[1] as $j => $lid ) {
						$r = $this->api->run( 'update-lesson', array( 'id' => $lid, 'parent_id' => $p[0], 'order' => $j + 1 ) );
						if ( is_wp_error( $r ) ) {
							return $r;
						}
					}
				}
				return true;
			},
			function () use ( $course, $plan ) {
				$now = array();
				foreach ( (array) EMCP_Tools_LifterLMS_Integration::curriculum( $this->api, $course ) as $s ) {
					$now[] = array( (int) $s['id'], array_map( 'intval', array_column( $s['lessons'], 'id' ) ) );
				}
				return $now === $plan ? array() : array( 'order' );
			},
			fn() => $course
		);
		return is_wp_error( $t ) ? $t : $this->content_answer( 'order', $course, $course, $t['change'] );
	}

	/**
	 * Undo a lifterlms-content entry: the recorded before-images back (D16, D17), under the course
	 * lease, after the conflict check and the structural checks.
	 *
	 * @return true|WP_Error
	 */
	public function undo_content( int $course, array $befores, string $after, bool $force ) {
		return $this->locked(
			array( self::course_lease( $course ) ),
			function () use ( $befores, $after, $force ) {
				foreach ( $befores as $id => $before ) {
					if ( null !== $before ) {
						continue;
					}
					// Created by the write: refuse while it holds children, force or not.
					$type = $this->api->post_type( (int) $id );
					if ( 'section' === $type ) {
						$lessons = $this->api->run( 'list-lessons', array( 'parent' => (int) $id, 'per_page' => 1, 'status' => 'any' ) );
						if ( is_array( $lessons ) && $lessons ) {
							return new WP_Error( 'conflict', __( 'The section holds lessons now, so it is not deleted.', 'emcp-tools' ) );
						}
					}
					if ( 'lesson' === $type ) {
						$ls = EMCP_Tools_LifterLMS_Integration::lesson_state( $this->api, (int) $id );
						if ( ! is_wp_error( $ls ) && ! empty( $ls['fields']['quiz']['enabled'] ) ) {
							return new WP_Error( 'conflict', __( 'The lesson has a quiz now, so it is not deleted.', 'emcp-tools' ) );
						}
					}
				}
				$check = $this->undo_check( self::snapshot_hash( $this->api, array_keys( $befores ) ), $after, $force );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				$this->created = array();
				$left          = $this->recover( $befores );
				return $left ? new WP_Error( 'rollback_failed', __( 'Some objects could not be put back.', 'emcp-tools' ), array( 'objects' => $left ) ) : true;
			}
		);
	}

	// Quizzes (spec 4.2, D7, D13, D16).

	/** Quiz settings save-quiz passes to LifterLMS. */
	const QUIZ_SETTINGS = array( 'passing_percent', 'limit_attempts', 'allowed_attempts', 'limit_time', 'time_limit', 'show_correct_answer', 'random_questions', 'can_be_resumed', 'disable_retake' );

	/** Each value LifterLMS keeps only while its switch is on (LLMS_REST_Quizzes_Controller). */
	const QUIZ_LIMITS = array( 'allowed_attempts' => 'limit_attempts', 'time_limit' => 'limit_time' );

	/**
	 * LifterLMS drops allowed_attempts and time_limit when their switch is off and reads them back
	 * as null unless it is on, so a value sent without its switch never sticks: refuse it up front,
	 * naming the switch, rather than writing and putting it back. $stored: the quiz's current fields.
	 *
	 * @return true|WP_Error
	 */
	public static function quiz_limit_pairs( array $settings, array $stored ) {
		foreach ( self::QUIZ_LIMITS as $value => $switch ) {
			if ( ! array_key_exists( $value, $settings ) || null === $settings[ $value ] ) {
				continue;
			}
			$on = array_key_exists( $switch, $settings ) ? ! empty( $settings[ $switch ] ) : ! empty( $stored[ $switch ] );
			if ( ! $on ) {
				return new WP_Error(
					'invalid_argument',
					/* translators: 1: setting, 2: its switch. */
					sprintf( __( 'settings.%1$s is kept only while settings.%2$s is true. Pass %2$s: true with it.', 'emcp-tools' ), $value, $switch ),
					array( 'fields' => array( $value, $switch ) )
				);
			}
		}
		return true;
	}

	/** Question fields compared and sent. */
	const QUESTION_FIELDS = array( 'title', 'content', 'question_type', 'points', 'multi_choices', 'clarifications' );

	/** @return array[] [{id, choice, correct}] */
	protected static function choices( array $list ): array {
		$out = array();
		foreach ( $list as $c ) {
			$row = array( 'choice' => (string) ( $c['choice'] ?? '' ), 'correct' => ! empty( $c['correct'] ) );
			if ( isset( $c['id'] ) && '' !== (string) $c['id'] ) {
				$row = array( 'id' => (string) $c['id'] ) + $row;
			}
			$out[] = $row;
		}
		return $out;
	}

	protected static function field_same( string $k, $a, $b ): bool {
		if ( in_array( $k, array( 'title', 'content', 'clarifications' ), true ) ) {
			return self::text( $a ) === self::text( $b );
		}
		if ( 'multi_choices' === $k ) {
			return (bool) $a === (bool) $b;
		}
		if ( 'points' === $k ) {
			return (int) $a === (int) $b;
		}
		return (string) $a === (string) $b;
	}

	/**
	 * What save-quiz must create, update and delete (pure).
	 *
	 * @param array    $stored    quiz_state() questions.
	 * @param array    $requested The requested questions in order.
	 * @param string[] $free      The free question types (D7).
	 * @param int[]    $attempted Question ids students have attempted.
	 * @return array|WP_Error {create: array[], update: array<int, array>, delete: int[], expected: array[]}
	 */
	public static function quiz_plan( array $stored, array $requested, array $free, array $attempted ) {
		$by = array();
		foreach ( $stored as $q ) {
			$by[ (int) $q['id'] ] = $q;
		}
		$seen     = array();
		$create   = array();
		$update   = array();
		$expected = array();
		foreach ( array_values( $requested ) as $i => $q ) {
			if ( ! is_array( $q ) ) {
				return new WP_Error( 'invalid_argument', __( 'questions must be a list of objects.', 'emcp-tools' ) );
			}
			$qid     = (int) ( $q['question_id'] ?? 0 );
			$order   = $i + 1;
			$choices = array_key_exists( 'choices', $q ) ? self::choices( (array) $q['choices'] ) : null;
			if ( $qid ) {
				if ( ! isset( $by[ $qid ] ) || isset( $seen[ $qid ] ) ) {
					/* translators: %d: question id. */
					return new WP_Error( 'unknown_question', sprintf( __( 'Question %d is not in this quiz (get-quiz lists the question ids).', 'emcp-tools' ), $qid ) );
				}
				$seen[ $qid ] = true;
				$prev         = $by[ $qid ];
				$payload      = array();
				foreach ( self::QUESTION_FIELDS as $k ) {
					if ( array_key_exists( $k, $q ) && ! self::field_same( $k, $q[ $k ], $prev[ $k ] ?? null ) ) {
						$payload[ $k ] = $q[ $k ];
					}
				}
				$prev_choices = self::choices( (array) ( $prev['choices'] ?? array() ) );
				$changed      = false;
				if ( null !== $choices ) {
					$known = array_column( $prev_choices, 'id' );
					foreach ( $choices as $c ) {
						if ( isset( $c['id'] ) && ! in_array( $c['id'], $known, true ) ) {
							/* translators: %s: choice id. */
							return new WP_Error( 'unknown_choice', sprintf( __( 'Choice %s is not one of this question\'s choices.', 'emcp-tools' ), $c['id'] ) );
						}
					}
					$changed = $choices !== $prev_choices;
				}
				$type = (string) ( $payload['question_type'] ?? $prev['question_type'] );
				if ( ( $payload || $changed ) && ( ! in_array( $type, $free, true ) || ! in_array( (string) $prev['question_type'], $free, true ) ) ) {
					return new WP_Error( 'unsupported_question_type', __( 'This question uses a type from a paid LifterLMS add-on; it can stay as it is, but EMCP changes only the free types (choice, picture_choice, true_false, content).', 'emcp-tools' ) );
				}
				if ( in_array( $qid, $attempted, true ) && ( $changed || isset( $payload['question_type'] ) ) ) {
					return new WP_Error( 'has_attempts', __( 'Students have answered this question; its choices stay as they are (force does not change this).', 'emcp-tools' ) );
				}
				if ( $changed ) {
					$payload['choices'] = $choices;
				}
				if ( (int) ( $prev['menu_order'] ?? 0 ) !== $order ) {
					$payload['menu_order'] = $order;
				}
				if ( $payload ) {
					$update[ $qid ] = $payload;
				}
				$expected[] = array( self::text( $payload['title'] ?? $prev['title'] ), $type, array_map( static fn( $c ) => array( self::text( $c['choice'] ), $c['correct'] ), $changed ? $choices : $prev_choices ) );
				continue;
			}
			$type = (string) ( $q['question_type'] ?? 'choice' );
			if ( '' === trim( (string) ( $q['title'] ?? '' ) ) ) {
				return new WP_Error( 'invalid_argument', __( 'Every new question needs a title.', 'emcp-tools' ) );
			}
			if ( ! in_array( $type, $free, true ) ) {
				return new WP_Error( 'unsupported_question_type', __( 'Use a free question type: choice, picture_choice, true_false or content.', 'emcp-tools' ) );
			}
			$payload = array( 'question_type' => $type, 'menu_order' => $order, 'choices' => array_map( static fn( $c ) => array( 'choice' => $c['choice'], 'correct' => $c['correct'] ), (array) $choices ) );
			foreach ( self::QUESTION_FIELDS as $k ) {
				if ( array_key_exists( $k, $q ) ) {
					$payload[ $k ] = $q[ $k ];
				}
			}
			$create[]   = $payload;
			$expected[] = array( self::text( $q['title'] ), $type, array_map( static fn( $c ) => array( self::text( $c['choice'] ), $c['correct'] ), (array) $choices ) );
		}
		$delete = array_values( array_diff( array_keys( $by ), array_keys( $seen ) ) );
		if ( array_intersect( $delete, $attempted ) ) {
			return new WP_Error( 'has_attempts', __( 'Students have answered a question this would remove; it stays (force does not change this).', 'emcp-tools' ) );
		}
		return array( 'create' => $create, 'update' => $update, 'delete' => $delete, 'expected' => $expected );
	}

	/** @return array[] the quiz's questions as quiz_plan()'s expected rows */
	protected function quiz_shape( int $quiz ): array {
		$s = EMCP_Tools_LifterLMS_Integration::quiz_state( $this->api, $quiz );
		if ( is_wp_error( $s ) ) {
			return array();
		}
		return array_map( static fn( $q ) => array( self::text( $q['title'] ), (string) $q['question_type'], array_map( static fn( $c ) => array( self::text( $c['choice'] ), ! empty( $c['correct'] ) ), (array) $q['choices'] ) ), $s['questions'] );
	}

	/** @return array|WP_Error */
	public function save_quiz( ?int $lesson, ?int $quiz, ?string $cv, ?string $version, bool $force, array $req ) {
		$course = $quiz ? $this->api->owner_course( $quiz ) : $this->api->owner_course( (int) $lesson );
		return $this->locked(
			array( self::course_lease( $course ) ),
			function () use ( $lesson, $quiz, $cv, $version, $force, $req, $course ) {
				$stored = array();
				if ( $quiz ) {
					$qs = EMCP_Tools_LifterLMS_Integration::quiz_state( $this->api, $quiz );
					if ( is_wp_error( $qs ) ) {
						return $qs;
					}
					$check = self::version_check( $qs['version'], $version, $force, 'get-quiz', 'version' );
					if ( is_wp_error( $check ) ) {
						return $check;
					}
					$stored = $qs['questions'];
					$lesson = (int) ( $qs['fields']['lesson_id'] ?? 0 );
				} else {
					$state = EMCP_Tools_LifterLMS_Integration::state_of( $this->api, $course );
					if ( is_wp_error( $state ) ) {
						return $state;
					}
					$check = self::version_check( $state['version'], $cv, $force, 'get-course', 'course_version' );
					if ( is_wp_error( $check ) ) {
						return $check;
					}
					$ls = EMCP_Tools_LifterLMS_Integration::lesson_state( $this->api, (int) $lesson );
					if ( is_wp_error( $ls ) ) {
						return $ls;
					}
					if ( ! empty( $ls['fields']['quiz']['enabled'] ) && (int) ( $ls['fields']['quiz']['id'] ?? 0 ) ) {
						return new WP_Error( 'lesson_has_quiz', __( 'The lesson already has a quiz; change it with its quiz_id.', 'emcp-tools' ) );
					}
					if ( '' === trim( (string) ( $req['title'] ?? '' ) ) ) {
						return new WP_Error( 'missing_argument', __( 'A new quiz needs a title.', 'emcp-tools' ) );
					}
				}
				$plan = array_key_exists( 'questions', $req )
					? self::quiz_plan( $stored, (array) $req['questions'], EMCP_Tools_LifterLMS_Api::FREE_QUESTION_TYPES, $quiz ? $this->api->attempted_question_ids( $quiz ) : array() )
					: array( 'create' => array(), 'update' => array(), 'delete' => array(), 'expected' => null );
				if ( is_wp_error( $plan ) ) {
					return $plan;
				}
				$settings = array_intersect_key( (array) ( $req['settings'] ?? array() ), array_flip( self::QUIZ_SETTINGS ) );
				$paired   = self::quiz_limit_pairs( $settings, $quiz ? (array) ( $qs['fields'] ?? array() ) : array() );
				if ( is_wp_error( $paired ) ) {
					return $paired;
				}
				foreach ( array( 'title', 'content' ) as $k ) {
					if ( array_key_exists( $k, $req ) ) {
						$settings[ $k ] = $req[ $k ];
					}
				}
				$ids = array_merge( array( (int) $lesson ), $quiz ? array( $quiz ) : array(), array_map( static fn( $q ) => (int) $q['id'], $stored ) );
				$id  = $quiz;
				$t   = $this->transact(
					$ids,
					function () use ( &$id, $lesson, $settings, $plan ) {
						if ( ! $id ) {
							$r = $this->api->run( 'create-quiz', array( 'lesson_id' => (int) $lesson ) + $settings );
							if ( is_wp_error( $r ) ) {
								return $r;
							}
							$id = (int) $r['id'];
							$this->created( $id );
						} elseif ( $settings ) {
							$r = $this->api->run( 'update-quiz', array( 'id' => $id ) + $settings );
							if ( is_wp_error( $r ) ) {
								return $r;
							}
						}
						foreach ( $plan['update'] as $qid => $payload ) {
							$r = $this->api->run( 'update-question', array( 'id' => (int) $qid ) + $payload );
							if ( is_wp_error( $r ) ) {
								return $r;
							}
						}
						foreach ( $plan['create'] as $payload ) {
							$r = $this->api->run( 'create-question', array( 'parent_id' => $id ) + $payload );
							if ( is_wp_error( $r ) ) {
								return $r;
							}
							$this->created( (int) $r['id'] );
						}
						foreach ( $plan['delete'] as $qid ) {
							$r = $this->api->run( 'delete-question', array( 'id' => (int) $qid, 'force' => true ) );
							if ( is_wp_error( $r ) ) {
								return $r;
							}
						}
						return $id;
					},
					function ( $qid ) use ( $plan, $settings ) {
						$bad = array();
						if ( null !== $plan['expected'] && $this->quiz_shape( (int) $qid ) !== $plan['expected'] ) {
							$bad[] = 'questions';
						}
						$s = EMCP_Tools_LifterLMS_Integration::quiz_state( $this->api, (int) $qid );
						return is_wp_error( $s ) ? array( 'quiz' ) : array_merge( $bad, self::mismatches( $settings, $s['fields'] ) );
					},
					function ( $qid ) use ( $quiz, $course ) {
						$set = $this->changed_set( $this->last_befores );
						return EMCP_Tools_LifterLMS_History::record_quiz( $quiz ? 'edit' : 'created', 'save-quiz', (int) $qid, $course, $set['befores'], $set['after'], $this->api->max_attempt_id( (int) $qid ) );
					}
				);
				if ( is_wp_error( $t ) ) {
					return $t;
				}
				$qs = EMCP_Tools_LifterLMS_Integration::quiz_state( $this->api, (int) $t['result'] );
				return $this->answer( array( 'id' => (int) $t['result'], 'version' => is_wp_error( $qs ) ? '' : $qs['version'], 'questions' => is_wp_error( $qs ) ? 0 : count( $qs['questions'] ) ), $t['change'] );
			}
		);
	}

	/** To the trash with the lesson link cleared on both sides (D13). @return array|WP_Error */
	public function trash_quiz( int $quiz, ?string $version, bool $force ) {
		$course = $this->api->owner_course( $quiz );
		return $this->locked(
			array( self::course_lease( $course ) ),
			function () use ( $quiz, $version, $force, $course ) {
				$qs = EMCP_Tools_LifterLMS_Integration::quiz_state( $this->api, $quiz );
				if ( is_wp_error( $qs ) ) {
					return $qs;
				}
				$check = self::version_check( $qs['version'], $version, $force, 'get-quiz', 'version' );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				if ( $this->api->quiz_attempts( $quiz ) > 0 ) {
					return new WP_Error( 'has_attempts', __( 'Students have taken this quiz, so it stays (force does not change this).', 'emcp-tools' ) );
				}
				$lesson = (int) ( $qs['fields']['lesson_id'] ?? 0 );
				$status = $this->api->post_status( $quiz );
				$t      = $this->transact(
					array( $quiz, $lesson ),
					function () use ( $quiz, $lesson ) {
						$r = $this->api->run( 'delete-quiz', array( 'id' => $quiz ) );
						if ( is_wp_error( $r ) ) {
							return $r;
						}
						return $this->api->detach_quiz( $quiz, $lesson ) ? true : new WP_Error( 'save_failed', __( 'The quiz could not be detached from its lesson.', 'emcp-tools' ) );
					},
					function () use ( $quiz, $lesson ) {
						$ls = EMCP_Tools_LifterLMS_Integration::lesson_state( $this->api, $lesson );
						$ok = 'trash' === $this->api->post_status( $quiz ) && ( is_wp_error( $ls ) || empty( $ls['fields']['quiz']['enabled'] ) );
						return $ok ? array() : array( 'quiz' );
					},
					fn() => EMCP_Tools_LifterLMS_History::record_quiz_trash( $quiz, $lesson, $course, $status )
				);
				return is_wp_error( $t ) ? $t : $this->answer( array( 'id' => $quiz, 'status' => 'trash', 'lesson_id' => $lesson ), $t['change'] );
			}
		);
	}

	/** Undo a quiz trash: the lesson must still exist and still be detached (D13). @return true|WP_Error */
	public function undo_trash_quiz( int $course, int $quiz, int $lesson, string $status ) {
		return $this->locked(
			array( self::course_lease( $course ) ),
			function () use ( $quiz, $lesson, $status ) {
				if ( 'lesson' !== $this->api->post_type( $lesson ) ) {
					return new WP_Error( 'conflict', __( 'The quiz\'s lesson is gone, so the quiz is not linked again.', 'emcp-tools' ) );
				}
				$ls = EMCP_Tools_LifterLMS_Integration::lesson_state( $this->api, $lesson );
				if ( is_wp_error( $ls ) || ! empty( $ls['fields']['quiz']['enabled'] ) || (int) ( $ls['fields']['quiz']['id'] ?? 0 ) ) {
					return new WP_Error( 'conflict', __( 'The lesson has another quiz now, so this one is not linked again.', 'emcp-tools' ) );
				}
				if ( 'trash' !== $this->api->post_status( $quiz ) ) {
					return new WP_Error( 'conflict', __( 'The quiz is no longer in the trash.', 'emcp-tools' ) );
				}
				if ( ! $this->api->untrash( $quiz, $status ) ) {
					return new WP_Error( 'rollback_failed', __( 'The quiz could not be taken out of the trash.', 'emcp-tools' ) );
				}
				return $this->api->attach_quiz( $quiz, $lesson ) ? true : new WP_Error( 'rollback_failed', __( 'The quiz could not be linked to its lesson again.', 'emcp-tools' ) );
			}
		);
	}

	// Access plans (spec 4.2, D19): part of their course's or membership's version.

	/** @return array{0: string, 1: string, 2: string}|WP_Error [kind, version argument, read operation] */
	protected function plan_parent( int $product ) {
		$type = $this->api->post_type( $product );
		if ( 'course' === $type ) {
			return array( 'course', 'course_version', 'get-course' );
		}
		if ( 'llms_membership' === $type ) {
			return array( 'membership', 'membership_version', 'get-membership' );
		}
		/* translators: %d: post id. */
		return new WP_Error( 'not_found', sprintf( __( 'Post %d is not a LifterLMS course or membership.', 'emcp-tools' ), $product ), array( 'status' => 404 ) );
	}

	/** @return array|WP_Error the plan's raw fields */
	protected function plan_fields( int $plan ) {
		$r = $this->api->run( 'get-access-plan', array( 'id' => $plan ) );
		return is_wp_error( $r ) ? $r : EMCP_Tools_LifterLMS_Integration::fields( $r );
	}

	/**
	 * Create (product) or change (plan) an access plan; $versions holds course_version and membership_version.
	 *
	 * @return array|WP_Error
	 */
	public function save_plan( ?int $product, ?int $plan, array $versions, bool $force, array $fields ) {
		$product = $plan ? $this->api->owner_course( $plan ) : (int) $product;
		$parent  = $this->plan_parent( $product );
		if ( is_wp_error( $parent ) ) {
			return $parent;
		}
		list( $kind, $arg, $read ) = $parent;
		if ( ! $plan ) {
			if ( '' === trim( (string) ( $fields['title'] ?? '' ) ) ) {
				return new WP_Error( 'missing_argument', __( 'A new access plan needs a title.', 'emcp-tools' ) );
			}
			$fields += array( 'price' => 0 );
		} elseif ( ! $fields ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		return $this->locked(
			array( 'course' === $kind ? self::course_lease( $product ) : self::membership_lease( $product ) ),
			function () use ( $kind, $arg, $read, $product, $plan, $versions, $force, $fields ) {
				$check = self::version_check( $this->version_of( $kind, $product ), $versions[ $arg ] ?? null, $force, $read, $arg );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				$t = $this->transact(
					$plan ? array( $plan ) : array(),
					function () use ( $plan, $product, $fields ) {
						if ( $plan ) {
							$r = $this->api->run( 'update-access-plan', array( 'id' => $plan ) + $fields );
							return is_wp_error( $r ) ? $r : $plan;
						}
						$r = $this->api->run( 'create-access-plan', array( 'post_id' => $product ) + $fields );
						if ( is_wp_error( $r ) ) {
							return $r;
						}
						$this->created( (int) $r['id'] );
						return (int) $r['id'];
					},
					function ( $id ) use ( $fields ) {
						$stored = $this->plan_fields( (int) $id );
						return is_wp_error( $stored ) ? array( 'plan' ) : self::mismatches( $fields, $stored );
					},
					function ( $id, $befores ) use ( $plan, $product, $kind ) {
						return EMCP_Tools_LifterLMS_History::record_plan( $plan ? 'edit' : 'created', 'save-access-plan', (int) $id, $product, $kind, $plan ? $befores : array( (int) $id => null ), $this->version_of( $kind, $product ) );
					}
				);
				return is_wp_error( $t ) ? $t : $this->plan_answer( (int) $t['result'], $kind, $arg, $product, $t['change'], array() );
			}
		);
	}

	/** Delete a plan permanently (LifterLMS has no trash for plans); refused while orders use it. @return array|WP_Error */
	public function delete_plan( int $plan, array $versions, bool $force ) {
		$product = $this->api->owner_course( $plan );
		$parent  = $this->plan_parent( $product );
		if ( is_wp_error( $parent ) ) {
			return $parent;
		}
		list( $kind, $arg, $read ) = $parent;
		return $this->locked(
			array( 'course' === $kind ? self::course_lease( $product ) : self::membership_lease( $product ) ),
			function () use ( $kind, $arg, $read, $product, $plan, $versions, $force ) {
				$check = self::version_check( $this->version_of( $kind, $product ), $versions[ $arg ] ?? null, $force, $read, $arg );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				if ( $this->api->plan_order_count( $plan ) > 0 ) {
					return new WP_Error( 'has_orders', __( 'Orders use this access plan, so it stays (force does not change this). Hide it with visibility hidden instead.', 'emcp-tools' ) );
				}
				$t = $this->transact(
					array( $plan ),
					function () use ( $plan ) {
						$r = $this->api->run( 'delete-access-plan', array( 'id' => $plan ) );
						return is_wp_error( $r ) ? $r : true;
					},
					fn() => '' === $this->api->post_type( $plan ) ? array() : array( 'plan' ),
					fn( $r, $befores ) => EMCP_Tools_LifterLMS_History::record_plan( 'deleted', 'delete-access-plan', $plan, $product, $kind, $befores, $this->version_of( $kind, $product ) )
				);
				return is_wp_error( $t ) ? $t : $this->plan_answer( $plan, $kind, $arg, $product, $t['change'], array( 'deleted' => true ) );
			}
		);
	}

	protected function plan_answer( int $plan, string $kind, string $arg, int $product, string $change, array $extra ): array {
		$v = $this->version_of( $kind, $product );
		return $this->answer( array( 'id' => $plan, 'post_id' => $product ) + $extra + array( $arg => $v ), $change );
	}

	/** Undo a plan write: the before-image back, a created plan deleted, a deleted one re-created with its id. @return true|WP_Error */
	public function undo_plan( string $kind, int $product, int $plan, array $befores, string $after, bool $force ) {
		return $this->locked(
			array( 'course' === $kind ? self::course_lease( $product ) : self::membership_lease( $product ) ),
			function () use ( $kind, $product, $plan, $befores, $after, $force ) {
				if ( null === ( $befores[ $plan ] ?? null ) && $this->api->post_type( $plan ) && $this->api->plan_order_count( $plan ) > 0 ) {
					return new WP_Error( 'has_orders', __( 'Orders use this access plan now, so it is not deleted (force does not change this).', 'emcp-tools' ) );
				}
				if ( '' === $this->api->post_type( $product ) ) {
					return new WP_Error( 'conflict', __( 'The plan\'s course or membership is gone.', 'emcp-tools' ) );
				}
				$check = $this->undo_check( $this->version_of( $kind, $product ), $after, $force );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				$this->created = array();
				$left          = $this->recover( $befores );
				return $left ? new WP_Error( 'rollback_failed', __( 'The access plan could not be put back.', 'emcp-tools' ), array( 'objects' => $left ) ) : true;
			}
		);
	}

	// Enrolments (spec 4.2, D10, D11, D18, D20).

	/** The leases a set and its earlier reading need, in the D20 order. @return string[] */
	public function set_keys( int $user, array ...$sets ): array {
		$memberships = array();
		$courses     = array();
		foreach ( $sets as $set ) {
			$post = (int) $set['post'];
			if ( 'course' === $this->api->post_type( $post ) ) {
				$courses[] = $post;
			} else {
				$memberships[] = $post;
			}
			$memberships = array_merge( $memberships, (array) $set['others'] );
			$courses     = array_merge( $courses, array_column( (array) $set['courses'], 'id' ) );
		}
		return self::lock_order( $memberships, $courses, $user );
	}

	public static function set_hash( array $set ): string {
		return EMCP_Tools_LifterLMS_Api::version( $set );
	}

	/** Courses (and the post itself) a write moved into enrolled: what an undo would take away (D15). @return int[] */
	public static function granted( array $before, array $after ): array {
		$out = array();
		if ( 'enrolled' !== $before['status'] && 'enrolled' === $after['status'] ) {
			$out[] = (int) $after['post'];
		}
		$was = array_column( (array) $before['courses'], 'status', 'id' );
		foreach ( (array) $after['courses'] as $c ) {
			if ( 'enrolled' === $c['status'] && 'enrolled' !== ( $was[ $c['id'] ] ?? '' ) ) {
				$out[] = (int) $c['id'];
			}
		}
		return $out;
	}

	/** @return array[] the courses whose status or trigger changed, with what they were */
	protected static function course_changes( array $before, array $after ): array {
		$was = array();
		foreach ( (array) $before['courses'] as $c ) {
			$was[ (int) $c['id'] ] = $c;
		}
		$out = array();
		foreach ( (array) $after['courses'] as $c ) {
			$b = $was[ (int) $c['id'] ] ?? array( 'status' => '', 'trigger' => '' );
			if ( $b['status'] !== $c['status'] || $b['trigger'] !== $c['trigger'] ) {
				$out[] = array( 'id' => (int) $c['id'], 'status' => $c['status'], 'trigger' => $c['trigger'], 'was' => array( 'status' => $b['status'], 'trigger' => $b['trigger'] ) );
			}
		}
		return $out;
	}

	/** @return array|WP_Error */
	public function enrol( int $post, int $user ) {
		return $this->enrolment_write(
			'enrol-student',
			$post,
			$user,
			function ( array $before ) use ( $post, $user ) {
				if ( 'enrolled' === $before['status'] ) {
					return new WP_Error( 'already_enrolled', __( 'The student is enrolled already.', 'emcp-tools' ), array( 'status' => 409 ) );
				}
				return '' === $before['status']
					? array( 'enroll-student', array( 'id' => $user, 'post_id' => $post ) )
					: array( 'update-enrollment', array( 'id' => $user, 'post_id' => $post, 'status' => 'enrolled' ) );
			},
			'enrolled'
		);
	}

	/** @return array|WP_Error */
	public function cancel( int $post, int $user ) {
		return $this->enrolment_write(
			'cancel-enrolment',
			$post,
			$user,
			function ( array $before ) use ( $post, $user ) {
				if ( 'enrolled' !== $before['status'] ) {
					return new WP_Error( 'not_enrolled', __( 'The student is not enrolled, so there is nothing to cancel.', 'emcp-tools' ), array( 'status' => 409 ) );
				}
				return array( 'update-enrollment', array( 'id' => $user, 'post_id' => $post, 'status' => 'cancelled' ) );
			},
			'cancelled'
		);
	}

	/**
	 * Lock the set (D20), read it again inside the locks, run one ability, check the status the
	 * model reads (D10), record the set before and after; put the set back on any failure (D21).
	 *
	 * @param callable $plan ( array $before ) => [ability, input] or a WP_Error refusal.
	 * @return array|WP_Error
	 */
	protected function enrolment_write( string $op, int $post, int $user, callable $plan, string $want ) {
		if ( ! in_array( $this->api->post_type( $post ), array( 'course', 'llms_membership' ), true ) ) {
			/* translators: %d: post id. */
			return new WP_Error( 'not_found', sprintf( __( 'Post %d is not a LifterLMS course or membership.', 'emcp-tools' ), $post ), array( 'status' => 404 ) );
		}
		$first = $this->api->enrolment_set( $user, $post );
		$keys  = $this->set_keys( $user, $first );
		return $this->locked(
			$keys,
			function () use ( $op, $post, $user, $plan, $want, $keys ) {
				$before = $this->api->enrolment_set( $user, $post );
				if ( array_diff( $this->set_keys( $user, $before ), $keys ) ) {
					return self::set_grew();
				}
				$step = $plan( $before );
				if ( is_wp_error( $step ) ) {
					return $step;
				}
				try {
					$r = $this->api->run( $step[0], $step[1] );
				} catch ( \Throwable $e ) {
					$r = new WP_Error( 'lifterlms_error', $e->getMessage() );
				}
				$after = $this->api->enrolment_set( $user, $post );
				if ( is_wp_error( $r ) || $want !== $after['status'] ) {
					if ( $after === $before ) {
						return is_wp_error( $r ) ? $r : new WP_Error( 'save_incomplete', __( 'LifterLMS did not change the enrolment.', 'emcp-tools' ), array( 'status' => 409 ) );
					}
					return $this->enrolment_fail( $op, $user, $post, $before, is_wp_error( $r ) ? 'save_failed' : 'save_incomplete', is_wp_error( $r ) ? array( 'lifterlms_error' => $r->get_error_code(), 'message' => $r->get_error_message() ) : array( 'status_read' => $after['status'] ) );
				}
				$change = EMCP_Tools_LifterLMS_History::record_enrolment( $op, $user, $post, $before, $after, self::granted( $before, $after ) );
				if ( '' === $change ) {
					return $this->enrolment_fail( $op, $user, $post, $before, 'history_unavailable', array() );
				}
				return $this->answer( array( 'post_id' => $post, 'user_id' => $user, 'status' => $after['status'], 'courses' => self::course_changes( $before, $after ) ), $change );
			}
		);
	}

	protected static function set_grew(): WP_Error {
		return new WP_Error( 'lifterlms_busy', __( 'The courses this enrolment covers changed while it was starting. Try again.', 'emcp-tools' ), array( 'status' => 409 ) );
	}

	/** Put the set back after a failed enrolment write; partial_write with a History entry when it stays different. */
	protected function enrolment_fail( string $op, int $user, int $post, array $before, string $code, array $data ): WP_Error {
		$this->api->restore_enrolment_set( $user, $before );
		$now = $this->api->enrolment_set( $user, $post );
		if ( $now === $before ) {
			return new WP_Error( $code, __( 'LifterLMS refused part of this enrolment change; what was written was put back.', 'emcp-tools' ), $data + array( 'restored' => true, 'status' => 409 ) );
		}
		$change = EMCP_Tools_LifterLMS_History::record_enrolment( 'recovery', $user, $post, $before, $now, array() );
		return new WP_Error( 'partial_write', __( 'LifterLMS stopped half way and EMCP could not put the enrolments back. History holds the earlier enrolments; undo it there once the cause is fixed.', 'emcp-tools' ), array( 'change_id' => $change, 'cause' => $code, 'status' => 500 ) + $data );
	}

	/**
	 * Undo an enrolment write: the set back to $before (D18) under the same locks (D20).
	 *
	 * @param int[] $granted Courses whose access the undo takes away; progress in any blocks it (D15).
	 * @return true|WP_Error
	 */
	public function undo_enrolment( int $user, int $post, array $before, string $after, bool $force, array $granted ) {
		$first = $this->api->enrolment_set( $user, $post );
		$keys  = $this->set_keys( $user, $before, $first );
		return $this->locked(
			$keys,
			function () use ( $user, $post, $before, $after, $force, $granted, $keys ) {
				$now = $this->api->enrolment_set( $user, $post );
				if ( array_diff( $this->set_keys( $user, $before, $now ), $keys ) ) {
					return self::set_grew();
				}
				foreach ( $granted as $c ) {
					if ( $this->api->has_progress( $user, (int) $c ) ) {
						return new WP_Error( 'has_progress', __( 'The student has made progress there since, so the enrolment is not undone (force does not change this).', 'emcp-tools' ) );
					}
				}
				$check = $this->undo_check( self::set_hash( $now ), $after, $force );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				// The post's own enrolment through LifterLMS (its hooks run), then the rest of the set directly.
				$steps = array();
				if ( '' === $before['status'] && '' !== $now['status'] ) {
					$steps[] = array( 'unenroll-student', array( 'id' => $user, 'post_id' => $post ) );
				} elseif ( '' !== $before['status'] && $before['status'] !== $now['status'] ) {
					if ( '' === $now['status'] ) {
						$steps[] = array( 'enroll-student', array( 'id' => $user, 'post_id' => $post ) );
					}
					if ( '' !== $now['status'] || 'enrolled' !== $before['status'] ) {
						$steps[] = array( 'update-enrollment', array( 'id' => $user, 'post_id' => $post, 'status' => $before['status'] ) );
					}
				}
				foreach ( $steps as $step ) {
					$r = $this->api->run( $step[0], $step[1] );
					if ( is_wp_error( $r ) ) {
						$this->api->restore_enrolment_set( $user, $now );
						return $r;
					}
				}
				$restored = $this->api->restore_enrolment_set( $user, $before );
				if ( true === $restored && $this->api->enrolment_set( $user, $post ) === $before ) {
					return true;
				}
				$this->api->restore_enrolment_set( $user, $now );
				return new WP_Error( 'rollback_failed', __( 'The enrolments could not be put back as they were; they were left as before the undo.', 'emcp-tools' ) );
			}
		);
	}
}
