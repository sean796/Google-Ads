<?php
/**
 * Every Tutor LMS write (spec 4.4): a per-course lease, the before-image, the version check,
 * Tutor's own handler with the complete payload, explicit clears (D13), an exact check, recovery
 * and History. Undo runs the same path in undo mode (no record of its own, the version checked
 * again inside the lease).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_Tutor_Writer {

	const TTL = 60;

	/** The four text fields: agent name => [payload key, meta key]. */
	const TEXT_FIELDS = array(
		'benefits'        => array( 'course_benefits', '_tutor_course_benefits' ),
		'requirements'    => array( 'course_requirements', '_tutor_course_requirements' ),
		'target_audience' => array( 'course_target_audience', '_tutor_course_target_audience' ),
		'materials'       => array( 'course_material_includes', '_tutor_course_material_includes' ),
	);

	/** Video sources and the key that holds the address. */
	const VIDEO_KEYS = array( 'youtube' => 'source_youtube', 'vimeo' => 'source_vimeo', 'external_url' => 'source_external_url', 'embedded' => 'source_embedded', 'shortcode' => 'source_shortcode', 'html5' => 'source_video_id' );

	/** @var EMCP_Tools_Lease|null */
	private static $lease = null;

	/** @var callable|null Test seam: runs once the lease is held, before anything is read. */
	public static $on_lease = null;

	/** @var EMCP_Tools_Tutor_Api */
	private $api;

	public function __construct( EMCP_Tools_Tutor_Api $api ) {
		$this->api = $api;
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

	/** Run $fn holding the lease $key. @return mixed|WP_Error */
	public function locked( string $key, callable $fn ) {
		$owner = 'tutor-' . bin2hex( random_bytes( 6 ) );
		if ( ! self::lease()->acquire( $key, $owner, self::TTL ) ) {
			return new WP_Error( 'tutor_busy', __( 'Another change to this course is running. Try again in a moment.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		try {
			if ( self::$on_lease ) {
				( self::$on_lease )();
			}
			$this->api->reset_cache();
			return $fn();
		} finally {
			self::lease()->release( $key, $owner );
		}
	}

	public static function course_lease( int $id ): string {
		return 'tutor-course-' . $id;
	}

	// Pure helpers.

	/** The video as Tutor stores it: {source, source_type, source_<kind>: url, runtime}. */
	public static function video_payload( ?array $video ): ?array {
		if ( null === $video || array() === $video ) {
			return null;
		}
		$source = (string) ( $video['source'] ?? '' );
		$out    = array_diff_key( $video, array( 'url' => 1 ) );
		if ( isset( $video['url'] ) && isset( self::VIDEO_KEYS[ $source ] ) ) {
			$out[ self::VIDEO_KEYS[ $source ] ] = (string) $video['url'];
		}
		return $out;
	}

	/** The stored fields with the call's changes applied. */
	public static function merge_fields( array $fields, array $changes ): array {
		foreach ( $changes as $k => $v ) {
			if ( 'video' === $k ) {
				$fields['video'] = null === $v ? null : self::video_payload( (array) $v );
				continue;
			}
			if ( 'max_students' === $k ) {
				$fields['max_students'] = (int) $v;
				$fields['settings']     = array( 'maximum_students' => (int) $v ) + (array) ( $fields['settings'] ?? array() );
				continue;
			}
			if ( in_array( $k, array( 'categories', 'tags' ), true ) ) {
				$ids = array_values( array_unique( array_map( 'intval', (array) $v ) ) );
				sort( $ids );
				$fields[ $k ] = $ids;
				continue;
			}
			$fields[ $k ] = $v;
		}
		return $fields;
	}

	/** Meta keys the call clears (D13). */
	public static function cleared_meta( array $changes ): array {
		$keys = array();
		foreach ( self::TEXT_FIELDS as $name => $pair ) {
			if ( array_key_exists( $name, $changes ) && '' === trim( (string) $changes[ $name ] ) ) {
				$keys[] = $pair[1];
			}
		}
		if ( array_key_exists( 'video', $changes ) && null === $changes['video'] ) {
			$keys[] = '_video';
		}
		return $keys;
	}

	/**
	 * Tutor's course builder payload for complete fields (the shape its builder sends). Under REST
	 * Tutor validates video.source_type instead of video.source (validate_video_source()).
	 */
	public static function course_payload( array $f, bool $rest = false ): array {
		$settings = array_filter( (array) ( $f['settings'] ?? array() ), 'is_string', ARRAY_FILTER_USE_KEY ); // Numeric keys would append on every save.
		if ( isset( $f['max_students'] ) ) {
			$settings['maximum_students'] = (int) $f['max_students'];
		}
		$additional = array();
		foreach ( self::TEXT_FIELDS as $name => $pair ) {
			$additional[ $pair[0] ] = (string) ( $f[ $name ] ?? '' );
		}
		$duration                      = (array) ( $f['duration'] ?? array() );
		$additional['course_duration'] = array( 'hours' => (int) ( $duration['hours'] ?? 0 ), 'minutes' => (int) ( $duration['minutes'] ?? 0 ) );
		$payload                       = array(
			'post_title'                         => (string) $f['title'],
			'post_content'                       => (string) ( $f['content'] ?? '' ),
			'post_status'                        => (string) ( $f['status'] ?? 'draft' ),
			'post_author'                        => (int) $f['author'],
			'course_level'                       => (string) ( $f['level'] ?? '' ),
			'course_categories'                  => array_values( array_map( 'intval', (array) ( $f['categories'] ?? array() ) ) ),
			'course_tags'                        => array_values( array_map( 'intval', (array) ( $f['tags'] ?? array() ) ) ),
			'pricing'                            => array( 'type' => (string) ( $f['price_type'] ?? 'free' ), 'product_id' => '-1' ),
			'course_price'                       => (string) ( $f['price'] ?? '' ),
			'course_sale_price'                  => (string) ( $f['sale_price'] ?? '' ),
			'enable_qna'                         => ! empty( $f['enable_qna'] ) ? 'yes' : 'no',
			'is_public_course'                   => ! empty( $f['is_public'] ) ? 'yes' : 'no',
			'course_settings'                    => $settings,
			'additional_content'                 => $additional,
			'thumbnail_id'                       => (int) ( $f['thumbnail_id'] ?? 0 ),
			'_tutor_course_additional_data_edit' => true,
		);
		// Tutor answers 422 to an empty term list and clears the terms when the key is absent.
		foreach ( array( 'course_categories', 'course_tags' ) as $k ) {
			if ( array() === $payload[ $k ] ) {
				unset( $payload[ $k ] );
			}
		}
		if ( ! empty( $f['video'] ) ) {
			$payload['video'] = (array) $f['video'];
			if ( $rest ) {
				$payload['video']['source_type'] = (string) ( $payload['video']['source'] ?? '' );
			}
		}
		return $payload;
	}

	/** What Tutor should store for these fields, through Tutor's own sanitizers. */
	public static function expected( array $f, bool $instructor_pending ): array {
		$out = array(
			'title'        => sanitize_text_field( (string) $f['title'] ),
			'content'      => wp_kses_post( (string) ( $f['content'] ?? '' ) ),
			'status'       => $instructor_pending && 'publish' === $f['status'] ? 'pending' : (string) $f['status'],
			'author'       => (int) $f['author'],
			'level'        => (string) ( $f['level'] ?? '' ),
			'categories'   => (array) ( $f['categories'] ?? array() ),
			'tags'         => (array) ( $f['tags'] ?? array() ),
			'price_type'   => (string) ( $f['price_type'] ?? 'free' ),
			'enable_qna'   => ! empty( $f['enable_qna'] ),
			'is_public'    => ! empty( $f['is_public'] ),
			'thumbnail_id' => (int) ( $f['thumbnail_id'] ?? 0 ),
		);
		foreach ( array_keys( self::TEXT_FIELDS ) as $name ) {
			$out[ $name ] = sanitize_textarea_field( (string) ( $f[ $name ] ?? '' ) );
		}
		return $out;
	}

	/** The stored fields compared with expected(); a list of the names that differ. */
	public static function mismatches( array $expected, array $stored, ?array $video ): array {
		$bad = array();
		foreach ( $expected as $k => $v ) {
			if ( ( $stored[ $k ] ?? null ) !== $v ) {
				$bad[] = $k;
			}
		}
		$stored_video = $stored['video'] ?? null;
		if ( empty( $video ) ) {
			if ( ! empty( $stored_video ) && '' !== (string) ( $stored_video['source'] ?? '' ) ) {
				$bad[] = 'video';
			}
		} elseif ( ! self::video_matches( $video, $stored_video ) ) {
			$bad[] = 'video';
		}
		return $bad;
	}

	/**
	 * The stored video carries the requested source and an address. The address itself is compared
	 * loosely: Tutor sanitizes it on save (Review Focus 4), so the check reads its value back.
	 */
	public static function video_matches( array $video, $stored ): bool {
		$source = (string) ( $video['source'] ?? '' );
		if ( ! is_array( $stored ) || (string) ( $stored['source'] ?? '' ) !== $source ) {
			return false;
		}
		$key = self::VIDEO_KEYS[ $source ] ?? '';
		return '' === $key || ! isset( $video[ $key ] ) || '' !== trim( (string) ( $stored[ $key ] ?? '' ) );
	}

	private static function same_record( ?array $a, ?array $b ): bool {
		if ( null === $a || null === $b ) {
			return $a === $b;
		}
		$keep = static fn( array $r ) => array( 'post' => $r['post'], 'meta' => $r['meta'], 'terms' => $r['terms'] );
		return wp_json_encode( $keep( $a ) ) === wp_json_encode( $keep( $b ) );
	}

	// Course writes.

	/** @return array|WP_Error */
	private function state( int $id ) {
		return EMCP_Tools_Tutor_Integration::state_of( $this->api, $id );
	}

	private function pending_rule(): bool {
		return ! $this->api->is_admin() && ! $this->api->option( 'instructor_can_publish_course', false );
	}

	/**
	 * Change a course: $changes holds only the fields the call names (null video = clear).
	 *
	 * @return array|WP_Error
	 */
	public function update_course( int $id, ?string $version, bool $force, array $changes, string $op, bool $dry_run = false ) {
		return $this->locked(
			self::course_lease( $id ),
			function () use ( $id, $version, $force, $changes, $op, $dry_run ) {
				$state = $this->state( $id );
				if ( is_wp_error( $state ) ) {
					return $state;
				}
				if ( ! $force ) {
					if ( null === $version || '' === $version ) {
						return new WP_Error( 'missing_version', __( 'Pass the version from get-course as course_version, or force:true.', 'emcp-tools' ) );
					}
					if ( ! hash_equals( $state['version'], $version ) ) {
						return new WP_Error( 'conflict', __( 'The course changed since it was read. Read it again, or pass force:true to overwrite.', 'emcp-tools' ), array( 'current_version' => $state['version'] ) );
					}
				}
				$merged = self::merge_fields( $state['fields'], $changes );
				if ( ! $this->api->user( (int) $merged['author'] ) ) {
					return new WP_Error( 'author_missing', __( 'The course\'s author no longer exists, and Tutor refuses to save a course without one. Pass author (the user id of an administrator or instructor).', 'emcp-tools' ), array( 'author' => (int) $merged['author'] ) );
				}
				if ( $dry_run ) {
					$changed = array();
					foreach ( $merged as $k => $v ) {
						if ( ( $state['fields'][ $k ] ?? null ) !== $v ) {
							$changed[ $k ] = array( 'from' => $state['fields'][ $k ] ?? null, 'to' => $v );
						}
					}
					return array( 'dry_run' => true, 'id' => $id, 'changes' => $changed, 'version' => $state['version'] );
				}
				$before = $this->api->course_record( $id );
				return $this->commit_update( $id, $before, $merged, self::cleared_meta( $changes ), $op );
			}
		);
	}

	/** Tutor's update, the clears, the check, History; recovery on any failure. @return array|WP_Error */
	private function commit_update( int $id, array $before, array $merged, array $clears, string $op ) {
		$failure = null;
		try {
			$saved = $this->api->update_course( array( 'course_id' => $id ) + self::course_payload( $merged, $this->api->is_rest() ) );
		} catch ( \Throwable $e ) {
			$saved = new WP_Error( 'tutor_error', $e->getMessage() );
		}
		if ( is_wp_error( $saved ) ) {
			$failure = array( 'save_failed', $saved );
		} else {
			$this->api->delete_meta( $id, $clears );
			$now = $this->state( $id );
			$bad = is_wp_error( $now ) ? array( 'course' ) : self::mismatches( self::expected( $merged, $this->pending_rule() ), $now['fields'], $merged['video'] ?? null );
			if ( $bad ) {
				$failure = array( 'save_incomplete', new WP_Error( 'save_incomplete', __( 'Tutor did not store the course as written.', 'emcp-tools' ), array( 'fields' => $bad ) ) );
			}
		}
		if ( $failure ) {
			if ( self::same_record( $before, $this->api->course_record( $id ) ) ) {
				// Tutor refused before writing anything (a validation error): pass its answer on.
				return 'save_failed' === $failure[0] ? $failure[1] : $failure[1];
			}
			$restored = $this->api->restore_course( $before ) && self::same_record( $before, $this->api->course_record( $id ) );
			$data     = array( 'restored' => $restored, 'detail' => $failure[1]->get_error_message() );
			if ( ! $restored ) {
				$data['change_id'] = EMCP_Tools_Tutor_History::record_course( 'edit', $op, $id, $before, $this->state( $id ) );
			}
			return new WP_Error( $failure[0], $restored ? __( 'Tutor could not save the course, so it was put back as it was.', 'emcp-tools' ) : __( 'Tutor could not save the course and it could not be put back; History holds the earlier state to undo once the cause is fixed.', 'emcp-tools' ), $data );
		}
		$change = EMCP_Tools_Tutor_History::record_course( 'edit', $op, $id, $before, $now );
		if ( '' === $change ) {
			$restored = $this->api->restore_course( $before ) && self::same_record( $before, $this->api->course_record( $id ) );
			return new WP_Error( 'history_unavailable', $restored ? __( 'History could not record this change, so the course was put back as it was (a change is never kept without its undo).', 'emcp-tools' ) : __( 'History could not record this change and the course could not be put back.', 'emcp-tools' ), array( 'restored' => $restored ) );
		}
		return $this->answer( $id, $now, $change, $merged );
	}

	private function answer( int $id, array $state, string $change, array $merged = array() ): array {
		$out = array(
			'id'             => $id,
			'status'         => (string) $state['fields']['status'],
			'version'        => $state['version'],
			'course_version' => $state['version'],
			'url'            => $this->api->permalink( $id ),
			'change'         => array( 'change_id' => $change, 'undo' => array( 'available' => '' !== $change ) ),
		);
		if ( isset( $merged['status'] ) && 'publish' === $merged['status'] && 'pending' === $out['status'] ) {
			$out['status_note'] = __( 'Tutor set the course to pending: instructors may not publish courses on this site (an administrator publishes it, or allows instructors to in Tutor\'s settings).', 'emcp-tools' );
		}
		return $out;
	}

	/** @return array|WP_Error */
	public function create_course( array $fields, bool $dry_run = false ) {
		$defaults = array( 'title' => '', 'content' => '', 'status' => 'draft', 'author' => get_current_user_id(), 'level' => 'all_levels', 'categories' => array(), 'tags' => array(), 'price_type' => 'free', 'price' => '', 'sale_price' => '', 'duration' => array(), 'enable_qna' => true, 'is_public' => false, 'settings' => array(), 'thumbnail_id' => 0, 'video' => null );
		foreach ( array_keys( self::TEXT_FIELDS ) as $name ) {
			$defaults[ $name ] = '';
		}
		$merged = self::merge_fields( $defaults, $fields );
		if ( $dry_run ) {
			return array( 'dry_run' => true, 'fields' => $merged );
		}
		return $this->locked(
			'tutor-new-course',
			function () use ( $merged ) {
				try {
					$id = $this->api->create_course( self::course_payload( $merged, $this->api->is_rest() ) );
				} catch ( \Throwable $e ) {
					$id = new WP_Error( 'tutor_error', $e->getMessage() );
				}
				if ( is_wp_error( $id ) ) {
					return $id;
				}
				$id = (int) $id;
				// Spike item 7: the create runs sanitize_text_field on the text fields; the update keeps line breaks.
				try {
					$saved = $this->api->update_course( array( 'course_id' => $id ) + self::course_payload( $merged, $this->api->is_rest() ) );
				} catch ( \Throwable $e ) {
					$saved = new WP_Error( 'tutor_error', $e->getMessage() );
				}
				$now = is_wp_error( $saved ) ? $saved : $this->state( $id );
				$bad = is_wp_error( $now ) ? array( 'course' ) : self::mismatches( self::expected( $merged, $this->pending_rule() ), $now['fields'], $merged['video'] );
				if ( $bad ) {
					$this->api->delete_course( $id );
					return new WP_Error( 'save_incomplete', __( 'Tutor did not store the new course as written, so it was removed again.', 'emcp-tools' ), array( 'fields' => $bad, 'cleaned_up' => null === $this->api->course_record( $id ) ) );
				}
				$change = EMCP_Tools_Tutor_History::record_course( 'created', 'create-course', $id, null, $now );
				if ( '' === $change ) {
					$this->api->delete_course( $id );
					return new WP_Error( 'history_unavailable', __( 'History could not record the new course, so it was removed again (a change is never kept without its undo).', 'emcp-tools' ), array( 'cleaned_up' => null === $this->api->course_record( $id ) ) );
				}
				return $this->answer( $id, $now, $change, $merged );
			}
		);
	}

	/** @return array|WP_Error */
	public function trash_course( int $id, ?string $version, bool $force ) {
		return $this->locked(
			self::course_lease( $id ),
			function () use ( $id, $version, $force ) {
				$state = $this->state( $id );
				if ( is_wp_error( $state ) ) {
					return $state;
				}
				if ( ! $force && ( null === $version || ! hash_equals( $state['version'], (string) $version ) ) ) {
					return null === $version ? new WP_Error( 'missing_version', __( 'Pass the version from get-course as course_version, or force:true.', 'emcp-tools' ) ) : new WP_Error( 'conflict', __( 'The course changed since it was read.', 'emcp-tools' ), array( 'current_version' => $state['version'] ) );
				}
				if ( 'trash' === $state['fields']['status'] ) {
					return new WP_Error( 'already_trashed', __( 'The course is already in the trash.', 'emcp-tools' ) );
				}
				$before = $this->api->course_record( $id );
				if ( ! $this->api->trash_course( $id ) ) {
					return new WP_Error( 'trash_failed', __( 'WordPress could not move the course to the trash.', 'emcp-tools' ) );
				}
				$now    = $this->state( $id );
				$change = EMCP_Tools_Tutor_History::record_course( 'trashed', 'trash-course', $id, $before, $now );
				if ( '' === $change ) {
					$this->api->untrash_course( $id, (string) $before['post']['post_status'] );
					return new WP_Error( 'history_unavailable', __( 'History could not record this change, so the course was taken out of the trash again.', 'emcp-tools' ) );
				}
				$out             = $this->answer( $id, $now, $change );
				$out['enrolled'] = (int) $before['enrolled'];
				return $out;
			}
		);
	}

	// Undo mode (History). No record of its own; the after-version checked inside the lease.

	private function undo_version_check( int $id, string $after, bool $force ) {
		$state = $this->state( $id );
		if ( is_wp_error( $state ) ) {
			return new WP_Error( 'conflict', __( 'The course is gone, so the change is not undone.', 'emcp-tools' ) );
		}
		if ( ! $force && ! hash_equals( $after, $state['version'] ) ) {
			return new WP_Error( 'conflict', __( 'The course changed after this History entry, so it is not undone.', 'emcp-tools' ), array( 'current_version' => $state['version'] ) );
		}
		return $state;
	}

	/** @return true|WP_Error */
	public function restore_course( int $id, string $after, bool $force, array $before ) {
		return $this->locked(
			self::course_lease( $id ),
			function () use ( $id, $after, $force, $before ) {
				$state = $this->undo_version_check( $id, $after, $force );
				if ( is_wp_error( $state ) ) {
					return $state;
				}
				$pre = $this->api->course_record( $id );
				if ( $this->api->restore_course( $before ) && self::same_record( $before, $this->api->course_record( $id ) ) ) {
					return true;
				}
				$this->api->restore_course( $pre );
				return new WP_Error( 'rollback_failed', __( 'The course could not be put back as it was; it is unchanged.', 'emcp-tools' ) );
			}
		);
	}

	/** @return true|WP_Error */
	public function undo_create_course( int $id, string $after, bool $force ) {
		return $this->locked(
			self::course_lease( $id ),
			function () use ( $id, $after, $force ) {
				$state = $this->undo_version_check( $id, $after, $force );
				if ( is_wp_error( $state ) ) {
					return $state;
				}
				if ( $this->api->has_content( $id ) ) {
					return new WP_Error( 'conflict', __( 'The course has topics or students now, so it is not deleted (Tutor would delete them with it). Move it to the trash instead.', 'emcp-tools' ) );
				}
				return $this->api->delete_course( $id ) ? true : new WP_Error( 'rollback_failed', __( 'The course could not be deleted.', 'emcp-tools' ) );
			}
		);
	}

	/** @return true|WP_Error */
	public function untrash_course( int $id, string $status, bool $force ) {
		return $this->locked(
			self::course_lease( $id ),
			function () use ( $id, $status ) {
				$rec = $this->api->course_record( $id );
				if ( ! $rec || 'trash' !== $rec['post']['post_status'] ) {
					return new WP_Error( 'conflict', __( 'The course is no longer in the trash, so the change is not undone.', 'emcp-tools' ) );
				}
				if ( ! $this->api->untrash_course( $id, $status ) ) {
					return new WP_Error( 'rollback_failed', __( 'WordPress could not take the course out of the trash.', 'emcp-tools' ) );
				}
				$now = $this->api->course_record( $id );
				return ( $now && $status === $now['post']['post_status'] ) ? true : new WP_Error( 'rollback_failed', __( 'The course left the trash but did not get its earlier status back.', 'emcp-tools' ) );
			}
		);
	}

	// Curriculum writes (spec 4.2). Every one holds its course's lease.

	/** Check a course version where the call gives one (creations), or always (edits). @return array|WP_Error state */
	private function course_checked( int $course, ?string $version, bool $force, bool $required ) {
		$state = $this->state( $course );
		if ( is_wp_error( $state ) ) {
			return $state;
		}
		if ( $force || ( ! $required && ( null === $version || '' === $version ) ) ) {
			return $state;
		}
		if ( null === $version || '' === $version ) {
			return new WP_Error( 'missing_version', __( 'Pass the version from get-course as course_version, or force:true.', 'emcp-tools' ) );
		}
		if ( ! hash_equals( $state['version'], $version ) ) {
			return new WP_Error( 'conflict', __( 'The course changed since it was read. Read it again, or pass force:true.', 'emcp-tools' ), array( 'current_version' => $state['version'] ) );
		}
		return $state;
	}

	public static function topic_version( array $rec ): string {
		return EMCP_Tools_Tutor_Api::version( array( 'post' => $rec['post'] ) );
	}

	private function content_answer( string $kind, int $id, int $course, string $version, string $change, array $extra = array() ): array {
		$state = $this->state( $course );
		return array(
			'id'             => $id,
			'kind'           => $kind,
			'version'        => $version,
			'course_version' => is_wp_error( $state ) ? '' : $state['version'],
			'change'         => array( 'change_id' => $change, 'undo' => array( 'available' => '' !== $change ) ),
		) + $extra;
	}

	/** Contents (lessons, quizzes) a topic holds. */
	private function topic_contents( int $course, int $topic ): array {
		$state = $this->state( $course );
		if ( is_wp_error( $state ) ) {
			return array();
		}
		foreach ( $state['curriculum'] as $t ) {
			if ( (int) $t['id'] === $topic ) {
				return (array) $t['contents'];
			}
		}
		return array();
	}

	/** @return array|WP_Error */
	public function create_topic( int $course, ?string $version, bool $force, string $title, string $summary ) {
		return $this->locked(
			self::course_lease( $course ),
			function () use ( $course, $version, $force, $title, $summary ) {
				$state = $this->course_checked( $course, $version, $force, false );
				if ( is_wp_error( $state ) ) {
					return $state;
				}
				$id = $this->api->save_topic( array( 'course_id' => $course, 'title' => $title, 'summary' => $summary ) );
				if ( is_wp_error( $id ) ) {
					return $id;
				}
				$rec = $this->api->topic( (int) $id );
				if ( ! $rec || sanitize_text_field( $title ) !== $rec['post']['post_title'] || $course !== (int) $rec['post']['post_parent'] ) {
					$this->api->delete_topic( (int) $id );
					return new WP_Error( 'save_incomplete', __( 'Tutor did not store the topic as written, so it was removed again.', 'emcp-tools' ) );
				}
				$change = EMCP_Tools_Tutor_History::record_content( 'created', 'create-topic', 'topic', (int) $id, $course, null, self::topic_version( $rec ) );
				if ( '' === $change ) {
					$this->api->delete_topic( (int) $id );
					return new WP_Error( 'history_unavailable', __( 'History could not record the new topic, so it was removed again.', 'emcp-tools' ) );
				}
				return $this->content_answer( 'topic', (int) $id, $course, self::topic_version( $rec ), $change );
			}
		);
	}

	/** @return array|WP_Error */
	public function update_topic( int $topic, ?string $version, bool $force, array $changes ) {
		$rec = $this->api->topic( $topic );
		if ( ! $rec ) {
			return new WP_Error( 'not_found', __( 'There is no such topic.', 'emcp-tools' ) );
		}
		$course = (int) $rec['course_id'];
		return $this->locked(
			self::course_lease( $course ),
			function () use ( $topic, $course, $version, $force, $changes ) {
				$state = $this->course_checked( $course, $version, $force, true );
				if ( is_wp_error( $state ) ) {
					return $state;
				}
				$before  = $this->api->topic( $topic );
				$title   = array_key_exists( 'title', $changes ) ? (string) $changes['title'] : (string) $before['post']['post_title'];
				$summary = array_key_exists( 'summary', $changes ) ? (string) $changes['summary'] : (string) $before['post']['post_content'];
				$saved   = $this->api->save_topic( array( 'course_id' => $course, 'topic_id' => $topic, 'title' => $title, 'summary' => $summary ) );
				$now     = $this->api->topic( $topic );
				if ( is_wp_error( $saved ) || ! $now || sanitize_text_field( $title ) !== $now['post']['post_title'] || wp_kses_post( $summary ) !== $now['post']['post_content'] ) {
					$restored = $this->api->restore_post( 'topic', $before );
					return new WP_Error( is_wp_error( $saved ) ? 'save_failed' : 'save_incomplete', __( 'Tutor could not save the topic; it was put back as it was.', 'emcp-tools' ), array( 'restored' => $restored ) );
				}
				$change = EMCP_Tools_Tutor_History::record_content( 'edit', 'update-topic', 'topic', $topic, $course, $before, self::topic_version( $now ) );
				if ( '' === $change ) {
					$this->api->restore_post( 'topic', $before );
					return new WP_Error( 'history_unavailable', __( 'History could not record this change, so the topic was put back as it was.', 'emcp-tools' ), array( 'restored' => true ) );
				}
				return $this->content_answer( 'topic', $topic, $course, self::topic_version( $now ), $change );
			}
		);
	}

	/** @return array|WP_Error */
	public function delete_topic( int $topic, ?string $version, bool $force ) {
		$rec = $this->api->topic( $topic );
		if ( ! $rec ) {
			return new WP_Error( 'not_found', __( 'There is no such topic.', 'emcp-tools' ) );
		}
		$course = (int) $rec['course_id'];
		return $this->locked(
			self::course_lease( $course ),
			function () use ( $topic, $course, $version, $force ) {
				$state = $this->course_checked( $course, $version, $force, true );
				if ( is_wp_error( $state ) ) {
					return $state;
				}
				if ( $this->topic_contents( $course, $topic ) ) {
					return new WP_Error( 'topic_not_empty', __( 'The topic still holds lessons or quizzes. Move them with reorder-contents or delete them first (Tutor would leave them without a topic).', 'emcp-tools' ) );
				}
				$before = $this->api->topic( $topic );
				$done   = $this->api->delete_topic( $topic );
				if ( is_wp_error( $done ) ) {
					return $done;
				}
				$change = EMCP_Tools_Tutor_History::record_content( 'deleted', 'delete-topic', 'topic', $topic, $course, $before, 'absent' );
				if ( '' === $change ) {
					$this->api->recreate_post( 'topic', $before );
					return new WP_Error( 'history_unavailable', __( 'History could not record this change, so the topic was created again.', 'emcp-tools' ) );
				}
				return $this->content_answer( 'topic', $topic, $course, 'absent', $change );
			}
		);
	}

	/** The fields of a lesson write merged over the stored lesson. */
	private static function lesson_fields( ?array $view, array $changes ): array {
		$f = $view ? array(
			'title'        => (string) $view['title'],
			'content'      => (string) $view['content'],
			'video'        => $view['video'],
			'attachments'  => (array) $view['attachments'],
			'thumbnail_id' => (int) $view['thumbnail_id'],
		) : array( 'title' => '', 'content' => '', 'video' => null, 'attachments' => array(), 'thumbnail_id' => 0 );
		foreach ( $changes as $k => $v ) {
			if ( 'video' === $k ) {
				$f['video'] = null === $v ? null : self::video_payload( (array) $v );
			} elseif ( 'attachments' === $k ) {
				$f['attachments'] = array_values( array_unique( array_map( 'intval', (array) $v ) ) );
			} else {
				$f[ $k ] = $v;
			}
		}
		return $f;
	}

	/** Tutor's lesson handler payload. Thumbnail and attachments are always sent (the lesson guard and save_lesson_meta() read them). */
	private static function lesson_payload( int $topic, int $lesson, array $f ): array {
		$p = array(
			'topic_id'          => $topic,
			'title'             => (string) $f['title'],
			'description'       => (string) $f['content'],
			'tutor_attachments' => array_values( array_map( 'intval', (array) $f['attachments'] ) ),
			'thumbnail_id'      => (int) $f['thumbnail_id'],
			'video'             => $f['video'] ? (array) $f['video'] : array( 'source' => '-1' ),
		);
		if ( $lesson ) {
			$p['lesson_id'] = $lesson;
		}
		return $p;
	}

	private static function lesson_mismatch( array $f, ?array $rec ): bool {
		if ( ! $rec ) {
			return true;
		}
		$v = EMCP_Tools_Tutor_Integration::lesson_view( $rec );
		if ( sanitize_text_field( (string) $f['title'] ) !== $v['title'] || wp_kses_post( (string) $f['content'] ) !== $v['content'] ) {
			return true;
		}
		$want = array_values( array_map( 'intval', (array) $f['attachments'] ) );
		$have = $v['attachments'];
		sort( $want );
		sort( $have );
		if ( $want !== $have || (int) $f['thumbnail_id'] !== $v['thumbnail_id'] ) {
			return true;
		}
		return $f['video'] ? ! self::video_matches( (array) $f['video'], $v['video'] ) : ! empty( $v['video'] );
	}

	/** @return array|WP_Error */
	public function create_lesson( int $topic, ?string $version, bool $force, array $changes ) {
		$t = $this->api->topic( $topic );
		if ( ! $t ) {
			return new WP_Error( 'not_found', __( 'There is no such topic.', 'emcp-tools' ) );
		}
		$course = (int) $t['course_id'];
		return $this->locked(
			self::course_lease( $course ),
			function () use ( $topic, $course, $version, $force, $changes ) {
				$state = $this->course_checked( $course, $version, $force, false );
				if ( is_wp_error( $state ) ) {
					return $state;
				}
				$f  = self::lesson_fields( null, $changes );
				$id = $this->api->save_lesson( self::lesson_payload( $topic, 0, $f ) );
				if ( is_wp_error( $id ) ) {
					return $id;
				}
				$rec = $this->api->lesson( (int) $id );
				if ( self::lesson_mismatch( $f, $rec ) ) {
					$this->api->delete_lesson( (int) $id );
					return new WP_Error( 'save_incomplete', __( 'Tutor did not store the lesson as written, so it was removed again.', 'emcp-tools' ) );
				}
				$change = EMCP_Tools_Tutor_History::record_content( 'created', 'create-lesson', 'lesson', (int) $id, $course, null, EMCP_Tools_Tutor_Integration::lesson_version( $rec ) );
				if ( '' === $change ) {
					$this->api->delete_lesson( (int) $id );
					return new WP_Error( 'history_unavailable', __( 'History could not record the new lesson, so it was removed again.', 'emcp-tools' ) );
				}
				return $this->content_answer( 'lesson', (int) $id, $course, EMCP_Tools_Tutor_Integration::lesson_version( $rec ), $change, array( 'url' => (string) $rec['url'] ) );
			}
		);
	}

	/** @return array|WP_Error */
	public function update_lesson( int $lesson, ?string $version, bool $force, array $changes ) {
		$rec = $this->api->lesson( $lesson );
		if ( ! $rec ) {
			return new WP_Error( 'not_found', __( 'There is no such lesson.', 'emcp-tools' ) );
		}
		$course = (int) $rec['course_id'];
		return $this->locked(
			self::course_lease( $course ),
			function () use ( $lesson, $course, $version, $force, $changes ) {
				$before = $this->api->lesson( $lesson );
				$check  = $this->object_checked( EMCP_Tools_Tutor_Integration::lesson_version( $before ), $version, $force, 'get-lesson' );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				$f     = self::lesson_fields( EMCP_Tools_Tutor_Integration::lesson_view( $before ), $changes );
				$saved = $this->api->save_lesson( self::lesson_payload( (int) $before['topic_id'], $lesson, $f ) );
				$now   = $this->api->lesson( $lesson );
				if ( is_wp_error( $saved ) || self::lesson_mismatch( $f, $now ) ) {
					$restored = $this->api->restore_post( 'lesson', $before );
					return new WP_Error( is_wp_error( $saved ) ? 'save_failed' : 'save_incomplete', __( 'Tutor could not save the lesson; it was put back as it was.', 'emcp-tools' ), array( 'restored' => $restored ) );
				}
				$change = EMCP_Tools_Tutor_History::record_content( 'edit', 'update-lesson', 'lesson', $lesson, $course, $before, EMCP_Tools_Tutor_Integration::lesson_version( $now ) );
				if ( '' === $change ) {
					$this->api->restore_post( 'lesson', $before );
					return new WP_Error( 'history_unavailable', __( 'History could not record this change, so the lesson was put back as it was.', 'emcp-tools' ), array( 'restored' => true ) );
				}
				return $this->content_answer( 'lesson', $lesson, $course, EMCP_Tools_Tutor_Integration::lesson_version( $now ), $change );
			}
		);
	}

	/** @return true|WP_Error */
	private function object_checked( string $current, ?string $version, bool $force, string $read ) {
		if ( $force ) {
			return true;
		}
		if ( null === $version || '' === $version ) {
			/* translators: %s: read operation. */
			return new WP_Error( 'missing_version', sprintf( __( 'Pass the version from %s, or force:true.', 'emcp-tools' ), $read ) );
		}
		return hash_equals( $current, $version ) ? true : new WP_Error( 'conflict', __( 'It changed since it was read. Read it again, or pass force:true.', 'emcp-tools' ), array( 'current_version' => $current ) );
	}

	/** @return array|WP_Error */
	public function delete_lesson( int $lesson, ?string $version, bool $force ) {
		$rec = $this->api->lesson( $lesson );
		if ( ! $rec ) {
			return new WP_Error( 'not_found', __( 'There is no such lesson.', 'emcp-tools' ) );
		}
		$course = (int) $rec['course_id'];
		return $this->locked(
			self::course_lease( $course ),
			function () use ( $lesson, $course, $version, $force ) {
				$before = $this->api->lesson( $lesson );
				$check  = $this->object_checked( EMCP_Tools_Tutor_Integration::lesson_version( $before ), $version, $force, 'get-lesson' );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				$completed = count( $this->api->lesson_completed_by( $lesson ) );
				$done      = $this->api->delete_lesson( $lesson );
				if ( is_wp_error( $done ) ) {
					return $done;
				}
				$change = EMCP_Tools_Tutor_History::record_content( 'deleted', 'delete-lesson', 'lesson', $lesson, $course, $before, 'absent' );
				if ( '' === $change ) {
					$this->api->recreate_post( 'lesson', $before );
					return new WP_Error( 'history_unavailable', __( 'History could not record this change, so the lesson was created again.', 'emcp-tools' ) );
				}
				return $this->content_answer( 'lesson', $lesson, $course, 'absent', $change, array( 'completed_by' => $completed ) );
			}
		);
	}

	/** The current order as Tutor's sorting payload. */
	private static function sorting_of( array $curriculum ): array {
		return array_map( static fn( $t ) => array( 'topic_id' => (int) $t['id'], 'lesson_ids' => array_map( static fn( $c ) => (int) $c['id'], (array) $t['contents'] ) ), $curriculum );
	}

	/** @return array|WP_Error */
	public function reorder( int $course, ?string $version, bool $force, array $topics ) {
		return $this->locked(
			self::course_lease( $course ),
			function () use ( $course, $version, $force, $topics ) {
				$state = $this->course_checked( $course, $version, $force, true );
				if ( is_wp_error( $state ) ) {
					return $state;
				}
				$want_topics   = array_map( static fn( $t ) => (int) $t['id'], $state['curriculum'] );
				$want_contents = array();
				foreach ( $state['curriculum'] as $t ) {
					foreach ( (array) $t['contents'] as $c ) {
						$want_contents[] = (int) $c['id'];
					}
				}
				foreach ( $state['orphans'] as $o ) {
					$want_contents[] = (int) $o['id'];
				}
				$sorting = array();
				$given_t = array();
				$given_c = array();
				foreach ( $topics as $t ) {
					if ( ! is_array( $t ) || ! isset( $t['topic_id'] ) ) {
						return new WP_Error( 'invalid_argument', __( 'topics must be a list of {topic_id, contents}.', 'emcp-tools' ) );
					}
					$ids       = array_map( 'intval', (array) ( $t['contents'] ?? array() ) );
					$given_t[] = (int) $t['topic_id'];
					$given_c   = array_merge( $given_c, $ids );
					$sorting[] = array( 'topic_id' => (int) $t['topic_id'], 'lesson_ids' => $ids );
				}
				$sorted = static function ( array $a ): array {
					sort( $a );
					return $a;
				};
				if ( $sorted( $given_t ) !== $sorted( $want_topics ) || $sorted( $given_c ) !== $sorted( $want_contents ) || count( $given_c ) !== count( array_unique( $given_c ) ) ) {
					return new WP_Error( 'order_mismatch', __( 'List every topic of the course once, and every lesson and quiz (orphans included) exactly once.', 'emcp-tools' ), array( 'topics' => $want_topics, 'contents' => $want_contents ) );
				}
				$before    = self::sorting_of( $state['curriculum'] );
				$positions = $this->api->positions( array_merge( $want_topics, $want_contents ) );
				$done      = $this->api->reorder( $sorting );
				$now    = $this->state( $course );
				if ( is_wp_error( $done ) || is_wp_error( $now ) || self::sorting_of( $now['curriculum'] ) !== $sorting ) {
					$this->api->reorder( $before );
					return new WP_Error( is_wp_error( $done ) ? 'save_failed' : 'save_incomplete', __( 'Tutor could not set the order; it was put back.', 'emcp-tools' ) );
				}
				$change = EMCP_Tools_Tutor_History::record_order( $course, $before, $now['version'], $positions );
				if ( '' === $change ) {
					$this->api->reorder( $before );
					return new WP_Error( 'history_unavailable', __( 'History could not record this change, so the order was put back.', 'emcp-tools' ) );
				}
				return array(
					'id'             => $course,
					'version'        => $now['version'],
					'course_version' => $now['version'],
					'curriculum'     => $now['curriculum'],
					'change'         => array( 'change_id' => $change, 'undo' => array( 'available' => true ) ),
				);
			}
		);
	}

	// Curriculum undo (undo mode).

	/** Current version of a topic or lesson, or absent. */
	public function content_version( string $kind, int $id ): string {
		if ( 'topic' === $kind ) {
			$rec = $this->api->topic( $id );
			return $rec ? self::topic_version( $rec ) : 'absent';
		}
		$rec = $this->api->lesson( $id );
		return $rec ? EMCP_Tools_Tutor_Integration::lesson_version( $rec ) : 'absent';
	}

	/** @return true|WP_Error */
	public function undo_content( string $mode, string $kind, int $id, int $course, string $after, bool $force, ?array $before ) {
		return $this->locked(
			self::course_lease( $course ),
			function () use ( $mode, $kind, $id, $course, $after, $force, $before ) {
				$current = $this->content_version( $kind, $id );
				if ( 'deleted' === $mode ) {
					if ( 'absent' !== $current || $this->api->post_exists( $id ) ) {
						return new WP_Error( 'conflict', __( 'Something else uses that id now, so it is not created again.', 'emcp-tools' ) );
					}
					$parent = (int) ( $before['post']['post_parent'] ?? 0 );
					if ( 'topic' === $kind ? ! $this->api->course_record( $parent ) : ! $this->api->topic( $parent ) ) {
						return new WP_Error( 'conflict', __( 'The course or topic it belonged to is gone, so it is not created again.', 'emcp-tools' ) );
					}
					return $this->api->recreate_post( $kind, (array) $before ) ? true : new WP_Error( 'rollback_failed', __( 'It could not be created again with its old id.', 'emcp-tools' ) );
				}
				if ( 'absent' === $current ) {
					return new WP_Error( 'conflict', __( 'It is gone, so the change is not undone.', 'emcp-tools' ) );
				}
				if ( 'created' === $mode && 'lesson' === $kind && $this->api->lesson_completed_by( $id ) ) {
					return new WP_Error( 'has_progress', __( 'Students have completed this lesson, so it is not deleted (force does not change this).', 'emcp-tools' ) );
				}
				if ( ! $force && ! hash_equals( $after, $current ) ) {
					return new WP_Error( 'conflict', __( 'It changed after this History entry, so it is not undone.', 'emcp-tools' ), array( 'current_version' => $current ) );
				}
				if ( 'created' === $mode ) {
					if ( 'topic' === $kind && $this->topic_contents( $course, $id ) ) {
						return new WP_Error( 'conflict', __( 'The topic holds lessons or quizzes now, so it is not deleted.', 'emcp-tools' ) );
					}
					$done = 'topic' === $kind ? $this->api->delete_topic( $id ) : $this->api->delete_lesson( $id );
					return is_wp_error( $done ) ? $done : true;
				}
				return $this->api->restore_post( $kind, (array) $before ) ? true : new WP_Error( 'rollback_failed', __( 'It could not be put back as it was.', 'emcp-tools' ) );
			}
		);
	}

	/** @return true|WP_Error */
	public function undo_order( int $course, string $after, bool $force, array $before, array $positions = array() ) {
		return $this->locked(
			self::course_lease( $course ),
			function () use ( $course, $after, $force, $before, $positions ) {
				$state = $this->undo_version_check( $course, $after, $force );
				if ( is_wp_error( $state ) ) {
					return $state;
				}
				// The exact earlier positions: Tutor's order handler numbers from 0 and creation from 1,
				// so going through the handler would change every item's version (an older entry
				// without positions still does).
				$done = $positions ? $this->api->set_positions( $positions ) : $this->api->reorder( $before );
				return is_wp_error( $done ) ? $done : true;
			}
		);
	}


	// Quizzes (spec 4.2 save-quiz, D11, D14, D15).

	/** Settings Tutor's quiz builder expects on every question. */
	private static function question_settings( array $q, array $stored = array() ): array {
		return array_merge(
			array( 'answer_required' => '0', 'randomize_question' => '0', 'show_question_mark' => '0' ),
			$stored,
			(array) ( $q['settings'] ?? array() ),
			array( 'question_type' => (string) $q['type'], 'question_mark' => (float) ( $q['mark'] ?? 1 ) )
		);
	}

	/**
	 * The save_quiz() payload questions for the requested questions against the stored quiz.
	 *
	 * @param array|null $stored  quiz_view() of the stored quiz (null for a new quiz).
	 * @param array      $wanted  Requested questions [{question_id?, title, description, type, mark, settings, answers: [{answer_id?, title, is_correct}]}].
	 * @param string[]   $types   Allowed question types.
	 * @return array|WP_Error {questions, deleted_questions, deleted_answers, touched (question ids changed or removed)}
	 */
	public static function quiz_diff( ?array $stored, array $wanted, array $types ) {
		$by_id = array();
		foreach ( (array) ( $stored['questions'] ?? array() ) as $q ) {
			$by_id[ (int) $q['question_id'] ] = $q;
		}
		$out     = array();
		$seen_q  = array();
		$del_a   = array();
		$touched = array();
		foreach ( array_values( $wanted ) as $i => $q ) {
			if ( ! is_array( $q ) || '' === trim( (string) ( $q['title'] ?? '' ) ) ) {
				return new WP_Error( 'invalid_argument', __( 'Every question needs a title.', 'emcp-tools' ) );
			}
			$type = (string) ( $q['type'] ?? '' );
			if ( ! in_array( $type, $types, true ) ) {
				/* translators: 1: question type, 2: allowed types. */
				return new WP_Error( 'unsupported_question_type', sprintf( __( 'Question type "%1$s" is not available here; use one of: %2$s.', 'emcp-tools' ), $type, implode( ', ', $types ) ) );
			}
			$qid  = isset( $q['question_id'] ) ? (int) $q['question_id'] : 0;
			$prev = null;
			if ( $qid ) {
				if ( ! isset( $by_id[ $qid ] ) || isset( $seen_q[ $qid ] ) ) {
					/* translators: %d: question id. */
					return new WP_Error( 'unknown_question', sprintf( __( 'Question %d is not in this quiz (get-quiz lists the question ids).', 'emcp-tools' ), $qid ) );
				}
				$prev           = $by_id[ $qid ];
				$seen_q[ $qid ] = true;
			}
			$fields_changed = ! $prev || $prev['title'] !== (string) $q['title'] || (string) ( $prev['description'] ?? '' ) !== (string) ( $q['description'] ?? (string) ( $prev['description'] ?? '' ) ) || $prev['type'] !== $type || (float) $prev['mark'] !== (float) ( $q['mark'] ?? $prev['mark'] ) || ( isset( $q['settings'] ) && self::question_settings( $q, (array) $prev['settings'] ) !== (array) $prev['settings'] );
			$prev_answers   = array();
			foreach ( (array) ( $prev['answers'] ?? array() ) as $a ) {
				$prev_answers[ (int) $a['answer_id'] ] = $a;
			}
			$answers     = array();
			$seen_a      = array();
			$any_answer  = false;
			foreach ( array_values( (array) ( $q['answers'] ?? array() ) ) as $j => $a ) {
				$aid = isset( $a['answer_id'] ) ? (int) $a['answer_id'] : 0;
				if ( $aid && ( ! isset( $prev_answers[ $aid ] ) || isset( $seen_a[ $aid ] ) ) ) {
					/* translators: %d: answer id. */
					return new WP_Error( 'unknown_answer', sprintf( __( 'Answer %d is not one of this question\'s answers.', 'emcp-tools' ), $aid ) );
				}
				$correct = ! empty( $a['is_correct'] ) ? 1 : 0;
				if ( $aid ) {
					$seen_a[ $aid ] = true;
					$changed        = (string) $prev_answers[ $aid ]['title'] !== (string) ( $a['title'] ?? '' ) || (int) (bool) $prev_answers[ $aid ]['is_correct'] !== $correct;
					$status         = $changed ? 'update' : 'no_change';
				} else {
					$status = 'new';
				}
				$any_answer = $any_answer || 'no_change' !== $status;
				$answers[]  = array( '_data_status' => $status, 'answer_id' => $aid ? $aid : 'temp_a_' . $i . '_' . $j, 'answer_title' => (string) ( $a['title'] ?? '' ), 'is_correct' => $correct );
			}
			foreach ( array_keys( $prev_answers ) as $aid ) {
				if ( ! isset( $seen_a[ $aid ] ) ) {
					$del_a[]    = $aid;
					$any_answer = true;
				}
			}
			if ( $prev && ( $fields_changed || $any_answer ) ) {
				$touched[] = $qid;
			}
			$out[] = array(
				'_data_status'         => $prev ? ( $fields_changed ? 'update' : 'no_change' ) : 'new',
				'question_id'          => $prev ? $qid : 'temp_q_' . $i,
				'question_title'       => (string) $q['title'],
				'question_description' => (string) ( $q['description'] ?? ( $prev['description'] ?? '' ) ),
				'question_type'        => $type,
				'question_mark'        => (float) ( $q['mark'] ?? ( $prev['mark'] ?? 1 ) ),
				'question_settings'    => self::question_settings( $q, (array) ( $prev['settings'] ?? array() ) ),
				'question_answers'     => $answers,
			);
		}
		$del_q = array();
		foreach ( array_keys( $by_id ) as $qid ) {
			if ( ! isset( $seen_q[ $qid ] ) ) {
				$del_q[]   = $qid;
				$touched[] = $qid;
				foreach ( (array) $by_id[ $qid ]['answers'] as $a ) {
					$del_a[] = (int) $a['answer_id'];
				}
			}
		}
		return array( 'questions' => $out, 'deleted_questions' => $del_q, 'deleted_answers' => array_values( array_unique( $del_a ) ), 'touched' => array_values( array_unique( $touched ) ) );
	}

	/** The stored quiz's questions as a save-quiz request (keeps everything as it is). */
	private static function as_request( array $view ): array {
		$out = array();
		foreach ( (array) $view['questions'] as $q ) {
			$out[] = array( 'question_id' => $q['question_id'], 'title' => $q['title'], 'description' => $q['description'], 'type' => $q['type'], 'mark' => $q['mark'], 'answers' => array_map( static fn( $a ) => array( 'answer_id' => $a['answer_id'], 'title' => $a['title'], 'is_correct' => $a['is_correct'] ), (array) $q['answers'] ) );
		}
		return $out;
	}

	/** The parts of a quiz the check compares: titles, types and answers, in order. */
	private static function quiz_shape( array $view ): array {
		return array_map( static fn( $q ) => array( sanitize_text_field( $q['title'] ), $q['type'], array_map( static fn( $a ) => array( sanitize_text_field( (string) $a['title'] ), (bool) $a['is_correct'] ), (array) $q['answers'] ) ), (array) $view['questions'] );
	}

	/** @return array|WP_Error */
	public function save_quiz( ?int $topic, ?int $quiz, ?string $version, bool $force, array $req ) {
		$rec    = $quiz ? $this->api->quiz( $quiz ) : null;
		$t      = $quiz ? ( $rec ? $this->api->topic( (int) $rec['topic_id'] ) : null ) : $this->api->topic( (int) $topic );
		$course = $t ? (int) $t['course_id'] : 0;
		if ( ! $t || ( $quiz && ! $rec ) ) {
			return new WP_Error( 'not_found', __( 'There is no such quiz or topic.', 'emcp-tools' ) );
		}
		return $this->locked(
			self::course_lease( $course ),
			function () use ( $quiz, $course, $t, $version, $force, $req ) {
				if ( class_exists( 'EMCP_Tools_Change_Log' ) && EMCP_Tools_Change_Log::in_transaction() ) {
					return new WP_Error( 'transaction_open', __( 'Tutor\'s quiz builder commits its own transaction, so it is not run inside another one.', 'emcp-tools' ) );
				}
				$before = $quiz ? $this->api->quiz( $quiz ) : null;
				if ( $quiz ) {
					$check = $this->object_checked( EMCP_Tools_Tutor_Integration::quiz_version( $before ), $version, $force, 'get-quiz' );
				} else {
					$check = $this->course_checked( $course, $version, $force, false );
					if ( '' === trim( (string) ( $req['title'] ?? '' ) ) ) {
						$check = new WP_Error( 'missing_argument', __( 'A new quiz needs a title.', 'emcp-tools' ) );
					}
				}
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				$view   = $before ? EMCP_Tools_Tutor_Integration::quiz_view( $before ) : null;
				$wanted = array_key_exists( 'questions', $req ) ? (array) $req['questions'] : ( $view ? self::as_request( $view ) : array() );
				$diff   = self::quiz_diff( $view, $wanted, $this->api->question_types() );
				if ( is_wp_error( $diff ) ) {
					return $diff;
				}
				if ( $diff['deleted_questions'] && ! $this->api->quiz_schema_ready() ) {
					return new WP_Error( 'tutor_update_pending', __( 'Tutor LMS has not finished its database update on this site, and until it does it cannot remove quiz questions. Open any wp-admin page once (Tutor runs the update there), then try again.', 'emcp-tools' ) );
				}
				if ( $quiz && array_intersect( $diff['touched'], $this->api->attempted_question_ids( $quiz ) ) ) {
					return new WP_Error( 'has_attempts', __( 'Students have answered some of the questions this would remove or change; those stay as they are (force does not change this).', 'emcp-tools' ) );
				}
				$payload = array(
					'post_title'   => (string) ( $req['title'] ?? $view['title'] ?? '' ),
					'post_content' => (string) ( $req['summary'] ?? $view['summary'] ?? '' ),
					'quiz_option'  => array_merge( (array) ( $view['options'] ?? array() ), (array) ( $req['options'] ?? array() ) ),
					'questions'    => $diff['questions'],
				);
				if ( $quiz ) {
					$payload['ID'] = $quiz;
				}
				$id = $this->api->save_quiz( (int) $t['id'], $payload, $diff['deleted_questions'], $diff['deleted_answers'] );
				if ( is_wp_error( $id ) ) {
					return $id;
				}
				$now  = $this->api->quiz( (int) $id );
				$want = self::quiz_shape( array( 'questions' => array_map( static fn( $q ) => array( 'title' => $q['question_title'], 'type' => $q['question_type'], 'answers' => array_map( static fn( $a ) => array( 'title' => $a['answer_title'], 'is_correct' => (bool) $a['is_correct'] ), $q['question_answers'] ) ), $diff['questions'] ) ) );
				if ( ! $now || self::quiz_shape( EMCP_Tools_Tutor_Integration::quiz_view( $now ) ) !== $want || sanitize_text_field( $payload['post_title'] ) !== (string) $now['post']['post_title'] ) {
					$restored = $quiz ? $this->api->restore_quiz( $before ) : ( $this->api->delete_quiz( (int) $id ) && true );
					return new WP_Error( 'save_incomplete', __( 'Tutor did not store the quiz as written; it was put back (a new quiz was removed).', 'emcp-tools' ), array( 'restored' => (bool) $restored ) );
				}
				$change = EMCP_Tools_Tutor_History::record_quiz( $quiz ? 'edit' : 'created', 'save-quiz', (int) $id, $course, $before, EMCP_Tools_Tutor_Integration::quiz_version( $now ), $this->api->max_attempt_id( (int) $id ) );
				if ( '' === $change ) {
					$quiz ? $this->api->restore_quiz( $before ) : $this->api->delete_quiz( (int) $id );
					return new WP_Error( 'history_unavailable', __( 'History could not record this change, so the quiz was put back (a new quiz was removed).', 'emcp-tools' ) );
				}
				return $this->content_answer( 'quiz', (int) $id, $course, EMCP_Tools_Tutor_Integration::quiz_version( $now ), $change, array( 'questions' => count( $now['questions'] ) ) );
			}
		);
	}

	/** @return array|WP_Error */
	public function delete_quiz( int $quiz, ?string $version, bool $force ) {
		$rec = $this->api->quiz( $quiz );
		if ( ! $rec ) {
			return new WP_Error( 'not_found', __( 'There is no such quiz.', 'emcp-tools' ) );
		}
		$course = (int) $rec['course_id'];
		return $this->locked(
			self::course_lease( $course ),
			function () use ( $quiz, $course, $version, $force ) {
				$before = $this->api->quiz( $quiz );
				$check  = $this->object_checked( EMCP_Tools_Tutor_Integration::quiz_version( $before ), $version, $force, 'get-quiz' );
				if ( is_wp_error( $check ) ) {
					return $check;
				}
				if ( $this->api->quiz_attempts( $quiz ) ) {
					return new WP_Error( 'has_attempts', __( 'Students have taken this quiz; Tutor would delete their attempts with it, so it is not deleted.', 'emcp-tools' ) );
				}
				$done = $this->api->delete_quiz( $quiz );
				if ( is_wp_error( $done ) ) {
					return $done;
				}
				$change = EMCP_Tools_Tutor_History::record_quiz( 'deleted', 'delete-quiz', $quiz, $course, $before, 'absent', 0 );
				if ( '' === $change ) {
					$this->api->recreate_quiz( $before );
					return new WP_Error( 'history_unavailable', __( 'History could not record this change, so the quiz was created again.', 'emcp-tools' ) );
				}
				return $this->content_answer( 'quiz', $quiz, $course, 'absent', $change );
			}
		);
	}

	public function quiz_version_of( int $quiz ): string {
		$rec = $this->api->quiz( $quiz );
		return $rec ? EMCP_Tools_Tutor_Integration::quiz_version( $rec ) : 'absent';
	}

	/** Question and answer ids of a quiz record. */
	private static function quiz_ids( array $rec ): array {
		$q = array();
		$a = array();
		foreach ( (array) $rec['questions'] as $x ) {
			$q[] = (int) $x['question_id'];
			foreach ( (array) $x['answers'] as $y ) {
				$a[] = (int) $y['answer_id'];
			}
		}
		return array( $q, $a );
	}

	/** @return true|WP_Error */
	public function undo_quiz( string $mode, int $quiz, int $course, string $after, bool $force, ?array $before, int $max_attempt ) {
		return $this->locked(
			self::course_lease( $course ),
			function () use ( $mode, $quiz, $after, $force, $before, $max_attempt ) {
				$now = $this->api->quiz( $quiz );
				if ( 'deleted' === $mode ) {
					if ( $now || $this->api->post_exists( $quiz ) ) {
						return new WP_Error( 'conflict', __( 'Something else uses that id now, so the quiz is not created again.', 'emcp-tools' ) );
					}
					if ( ! $this->api->topic( (int) ( $before['post']['post_parent'] ?? 0 ) ) ) {
						return new WP_Error( 'conflict', __( 'The topic the quiz belonged to is gone, so it is not created again.', 'emcp-tools' ) );
					}
					list( $qids, $aids ) = self::quiz_ids( (array) $before );
					if ( $this->api->question_ids_exist( $qids ) || $this->api->answer_ids_exist( $aids ) ) {
						return new WP_Error( 'conflict', __( 'Some of the quiz\'s question ids are used again, so it is not created again.', 'emcp-tools' ) );
					}
					return $this->api->recreate_quiz( (array) $before ) ? true : new WP_Error( 'rollback_failed', __( 'The quiz could not be created again with its old ids.', 'emcp-tools' ) );
				}
				if ( ! $now ) {
					return new WP_Error( 'conflict', __( 'The quiz is gone, so the change is not undone.', 'emcp-tools' ) );
				}
				// D15, before anything is written and whatever force says.
				if ( 'created' === $mode ? $this->api->quiz_attempts( $quiz ) > 0 : $this->api->quiz_attempts( $quiz, $max_attempt ) > 0 ) {
					return new WP_Error( 'has_attempts', __( 'Students have taken this quiz since, so the change is not undone (force does not change this).', 'emcp-tools' ) );
				}
				if ( ! $force && ! hash_equals( $after, EMCP_Tools_Tutor_Integration::quiz_version( $now ) ) ) {
					return new WP_Error( 'conflict', __( 'The quiz changed after this History entry, so it is not undone.', 'emcp-tools' ) );
				}
				if ( 'created' === $mode ) {
					$done = $this->api->delete_quiz( $quiz );
					return is_wp_error( $done ) ? $done : true;
				}
				list( $before_q, $before_a ) = self::quiz_ids( (array) $before );
				list( $now_q, $now_a )       = self::quiz_ids( $now );
				$view_before                 = EMCP_Tools_Tutor_Integration::quiz_view( (array) $before );
				$view_now                    = EMCP_Tools_Tutor_Integration::quiz_view( $now );
				$changed                     = array();
				foreach ( $view_now['questions'] as $q ) {
					foreach ( $view_before['questions'] as $b ) {
						if ( $b['question_id'] === $q['question_id'] && $b !== $q ) {
							$changed[] = (int) $q['question_id'];
						}
					}
				}
				$would_touch = array_merge( array_diff( $now_q, $before_q ), $changed );
				if ( array_intersect( $would_touch, $this->api->attempted_question_ids( $quiz ) ) ) {
					return new WP_Error( 'has_attempts', __( 'Students have answered questions this would remove or change, so it is not undone (force does not change this).', 'emcp-tools' ) );
				}
				// D14 step 2: the removed ids must still be free.
				if ( $this->api->question_ids_exist( array_diff( $before_q, $now_q ) ) || $this->api->answer_ids_exist( array_diff( $before_a, $now_a ) ) ) {
					return new WP_Error( 'conflict', __( 'An id of a removed question or answer is used again, so the quiz is not undone.', 'emcp-tools' ) );
				}
				if ( $this->api->restore_quiz( (array) $before ) ) {
					$after_undo = $this->api->quiz( $quiz );
					if ( $after_undo && EMCP_Tools_Tutor_Integration::quiz_view( $after_undo ) === $view_before ) {
						return true;
					}
				}
				$this->api->restore_quiz( $now );
				return new WP_Error( 'rollback_failed', __( 'The quiz could not be put back as it was; it is unchanged.', 'emcp-tools' ) );
			}
		);
	}


	// Enrolments (spec 4.2).

	/** @return array|WP_Error */
	public function enrol_student( int $course, int $user ) {
		return $this->locked(
			self::course_lease( $course ),
			function () use ( $course, $user ) {
				$rec = $this->api->course_record( $course );
				if ( ! $rec ) {
					return new WP_Error( 'not_found', __( 'There is no such course.', 'emcp-tools' ) );
				}
				if ( ! $this->api->user( $user ) ) {
					return new WP_Error( 'not_found', __( 'There is no such user.', 'emcp-tools' ) );
				}
				if ( 'publish' !== $rec['post']['post_status'] ) {
					return new WP_Error( 'not_published', __( 'Students can be enrolled only in a published course.', 'emcp-tools' ) );
				}
				if ( 'paid' === $this->api->price( $course )['type'] || $this->api->price( $course )['purchasable'] ) {
					return new WP_Error( 'paid_course', __( 'This is a paid course; students are enrolled when they buy it (manual enrolment of paid courses is a Tutor Pro feature).', 'emcp-tools' ) );
				}
				$existing = $this->api->enrolment( $course, $user );
				if ( $existing && 'cancel' !== $existing['status'] ) {
					return array( 'already_enrolled' => true, 'enrolment_id' => $existing['enrolment_id'], 'status' => $existing['status'], 'change' => array( 'change_id' => '', 'undo' => array( 'available' => false ) ) );
				}
				if ( $existing ) {
					// A cancelled enrolment comes back; Tutor's do_enroll() would add a second one.
					if ( ! $this->api->set_enrolment_status( $existing['enrolment_id'], 'completed' ) ) {
						return new WP_Error( 'save_failed', __( 'Tutor could not restore the enrolment.', 'emcp-tools' ) );
					}
					$change = EMCP_Tools_Tutor_History::record_enrolment( 'status', 'enrol-student', $existing['enrolment_id'], $course, $user, 'cancel', 'completed' );
					if ( '' === $change ) {
						$this->api->set_enrolment_status( $existing['enrolment_id'], 'cancel' );
						return new WP_Error( 'history_unavailable', __( 'History could not record this change, so the enrolment stays cancelled.', 'emcp-tools' ) );
					}
					return array( 'enrolment_id' => $existing['enrolment_id'], 'status' => 'completed', 'reactivated' => true, 'change' => array( 'change_id' => $change, 'undo' => array( 'available' => true ) ) );
				}
				$id = $this->api->enrol( $course, $user );
				if ( is_wp_error( $id ) ) {
					return $id;
				}
				$now = $this->api->enrolment( $course, $user );
				if ( ! $now || (int) $now['enrolment_id'] !== (int) $id ) {
					$this->api->delete_enrolment( (int) $id );
					return new WP_Error( 'save_incomplete', __( 'Tutor did not store the enrolment as expected, so it was removed again.', 'emcp-tools' ) );
				}
				$change = EMCP_Tools_Tutor_History::record_enrolment( 'enrolled', 'enrol-student', (int) $id, $course, $user, '', (string) $now['status'] );
				if ( '' === $change ) {
					$this->api->delete_enrolment( (int) $id );
					return new WP_Error( 'history_unavailable', __( 'History could not record the enrolment, so it was removed again.', 'emcp-tools' ) );
				}
				return array( 'enrolment_id' => (int) $id, 'status' => (string) $now['status'], 'change' => array( 'change_id' => $change, 'undo' => array( 'available' => true ) ) );
			}
		);
	}

	/** @return array|WP_Error */
	public function cancel_enrolment( int $course, int $user ) {
		return $this->locked(
			self::course_lease( $course ),
			function () use ( $course, $user ) {
				$e = $this->api->enrolment( $course, $user );
				if ( ! $e || 'cancel' === $e['status'] ) {
					return new WP_Error( 'not_found', __( 'This user has no active enrolment in this course.', 'emcp-tools' ) );
				}
				if ( ! $this->api->set_enrolment_status( $e['enrolment_id'], 'cancel' ) ) {
					return new WP_Error( 'save_failed', __( 'Tutor could not cancel the enrolment.', 'emcp-tools' ) );
				}
				$change = EMCP_Tools_Tutor_History::record_enrolment( 'status', 'cancel-enrolment', $e['enrolment_id'], $course, $user, (string) $e['status'], 'cancel' );
				if ( '' === $change ) {
					$this->api->set_enrolment_status( $e['enrolment_id'], (string) $e['status'] );
					return new WP_Error( 'history_unavailable', __( 'History could not record this change, so the enrolment was left as it was.', 'emcp-tools' ) );
				}
				return array( 'enrolment_id' => $e['enrolment_id'], 'status' => 'cancel', 'change' => array( 'change_id' => $change, 'undo' => array( 'available' => true ) ) );
			}
		);
	}

	public function enrolment_state( int $course, int $user, int $enrolment_id ): string {
		$e = $this->api->enrolment( $course, $user );
		return ( $e && (int) $e['enrolment_id'] === $enrolment_id ) ? (string) $e['status'] : 'absent';
	}

	/** @return true|WP_Error */
	public function undo_enrolment( string $mode, int $enrolment_id, int $course, int $user, string $before, string $after ) {
		return $this->locked(
			self::course_lease( $course ),
			function () use ( $mode, $enrolment_id, $course, $user, $before, $after ) {
				if ( $this->enrolment_state( $course, $user, $enrolment_id ) !== $after ) {
					return new WP_Error( 'conflict', __( 'The enrolment changed after this History entry, so it is not undone.', 'emcp-tools' ) );
				}
				if ( 'enrolled' === $mode ) {
					return $this->api->delete_enrolment( $enrolment_id ) ? true : new WP_Error( 'rollback_failed', __( 'The enrolment could not be removed.', 'emcp-tools' ) );
				}
				return $this->api->set_enrolment_status( $enrolment_id, $before ) ? true : new WP_Error( 'rollback_failed', __( 'The enrolment status could not be put back.', 'emcp-tools' ) );
			}
		);
	}

}
