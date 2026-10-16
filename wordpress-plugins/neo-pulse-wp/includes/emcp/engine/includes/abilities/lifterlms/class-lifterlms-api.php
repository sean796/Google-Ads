<?php
/**
 * The only class that touches LifterLMS (spec 4.3). Every LifterLMS call runs one of LifterLMS's
 * own lifterlms/* abilities (D2): WordPress abilities over LifterLMS's REST controllers, so
 * LifterLMS validates, sanitizes, checks permissions and fires its hooks. Answers lose their
 * rendered fields (D8). The model reads LifterLMS's REST cannot give right (D10) and the direct
 * restores the spec allows live here too, so unit tests swap in a fake.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_LifterLMS_Api {

	/** LifterLMS's free question types (spike item 13); the "Advanced Questions" group is a paid add-on. */
	const FREE_QUESTION_TYPES = array( 'choice', 'picture_choice', 'true_false', 'content' );

	/** Abilities namespace (spike item 1). */
	const NS = 'lifterlms/';

	public function active(): bool {
		return function_exists( 'llms' );
	}

	public function version_string(): string {
		return function_exists( 'llms' ) ? (string) llms()->version : '';
	}

	/** LifterLMS 10.1 to 10.x, with its abilities registered. */
	public function supported(): bool {
		$v = $this->version_string();
		return '' !== $v && version_compare( $v, '10.1.0', '>=' ) && version_compare( $v, '11.0.0', '<' ) && $this->has_ability( 'get-course' );
	}

	public function has_ability( string $name ): bool {
		return function_exists( 'wp_get_ability' ) && null !== wp_get_ability( self::NS . $name );
	}

	/**
	 * Run one of LifterLMS's abilities.
	 *
	 * @return array|WP_Error The answer without rendered fields; lifterlms_unavailable for a
	 *                        missing ability, forbidden for LifterLMS's permission refusal,
	 *                        lifterlms_error for an exception.
	 */
	public function run( string $ability, array $input = array() ) {
		try {
			$r = $this->execute_ability( $ability, $input );
		} catch ( \Throwable $e ) {
			/* translators: 1: ability, 2: message. */
			return new WP_Error( 'lifterlms_error', sprintf( __( 'LifterLMS failed while running %1$s: %2$s', 'emcp-tools' ), $ability, $e->getMessage() ) );
		}
		if ( null === $r ) {
			/* translators: %s: ability name. */
			return new WP_Error( 'lifterlms_unavailable', sprintf( __( 'LifterLMS does not offer %s on this site.', 'emcp-tools' ), self::NS . $ability ) );
		}
		if ( is_wp_error( $r ) ) {
			if ( 'ability_invalid_permissions' === $r->get_error_code() ) {
				/* translators: %s: ability name. */
				return new WP_Error( 'forbidden', sprintf( __( 'LifterLMS does not allow you to run %s here.', 'emcp-tools' ), self::NS . $ability ), array( 'status' => 403 ) );
			}
			return $r;
		}
		return self::strip_rendered( $r );
	}

	/** @return mixed|null null when the ability does not exist. */
	protected function execute_ability( string $ability, array $input ) {
		$a = function_exists( 'wp_get_ability' ) ? wp_get_ability( self::NS . $ability ) : null;
		return $a ? $a->execute( $input ) : null;
	}

	/** Remove `rendered` wherever a `raw` sits beside it, at every depth (D8). */
	public static function strip_rendered( $data ) {
		if ( ! is_array( $data ) ) {
			return $data;
		}
		if ( array_key_exists( 'rendered', $data ) && array_key_exists( 'raw', $data ) ) {
			unset( $data['rendered'] );
		}
		foreach ( $data as $k => $v ) {
			$data[ $k ] = self::strip_rendered( $v );
		}
		return $data;
	}

	/** 16 hex characters of sha256 over the canonical JSON (keys sorted at every depth). */
	public static function version( array $canonical ): string {
		return substr( hash( 'sha256', (string) wp_json_encode( self::sort_keys( $canonical ) ) ), 0, 16 );
	}

	private static function sort_keys( $v ) {
		if ( is_object( $v ) ) {
			$v = (array) $v;
		}
		if ( ! is_array( $v ) ) {
			return $v;
		}
		if ( ! array_is_list( $v ) ) {
			ksort( $v );
		}
		foreach ( $v as $k => $x ) {
			$v[ $k ] = self::sort_keys( $x );
		}
		return $v;
	}

	// Posts and permissions.

	public function post_type( int $id ): string {
		return $id > 0 ? (string) get_post_type( $id ) : '';
	}

	public function post_status( int $id ): string {
		return $id > 0 ? (string) get_post_status( $id ) : '';
	}

	public function can( string $cap, ...$args ): bool {
		return current_user_can( $cap, ...$args );
	}

	/** LifterLMS maps edit_post for its post types to its own instructor rules. */
	public function can_edit( int $post ): bool {
		return $post > 0 && current_user_can( 'edit_post', $post );
	}

	/** Enrolling is LifterLMS's `enroll` capability (instructors do not have it, spike item 24). */
	public function can_enrol(): bool {
		return current_user_can( 'enroll' );
	}

	/** @return array{name: string, email: string, roles: string[]}|null */
	public function user( int $id ): ?array {
		$u = get_userdata( $id );
		return $u ? array( 'name' => (string) $u->display_name, 'email' => (string) $u->user_email, 'roles' => array_values( (array) $u->roles ) ) : null;
	}

	// Model reads (D10 and the blockers of D15).

	/** The enrolment status from LifterLMS's model, uncached (correct after same-second changes). */
	public function enrollment_status( int $user, int $post ): string {
		if ( ! class_exists( 'LLMS_Student' ) ) {
			return '';
		}
		$status = ( new LLMS_Student( $user ) )->get_enrollment_status( $post, false );
		return is_string( $status ) ? $status : '';
	}

	/** The latest trigger row; LifterLMS's own read orders by date only, so ties go to the row id (D10). */
	public function enrollment_trigger( int $user, int $post ): string {
		global $wpdb;
		return (string) $wpdb->get_var( $wpdb->prepare( "SELECT meta_value FROM {$wpdb->prefix}lifterlms_user_postmeta WHERE user_id = %d AND post_id = %d AND meta_key = '_enrollment_trigger' ORDER BY updated_date DESC, meta_id DESC LIMIT 1", $user, $post ) ); // phpcs:ignore WordPress.DB
	}

	/**
	 * Users with an enrolment record in a course or membership, their statuses read through the
	 * model (D10).
	 *
	 * @return array{items: int[], total: int}
	 */
	public function enrolled_users( int $post, ?string $status, int $page, int $per_page ): array {
		global $wpdb;
		$users = array_map( 'intval', (array) $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT user_id FROM {$wpdb->prefix}lifterlms_user_postmeta WHERE post_id = %d AND meta_key = '_status' ORDER BY user_id", $post ) ) ); // phpcs:ignore WordPress.DB
		if ( $status ) {
			$users = array_values( array_filter( $users, fn( $u ) => $status === $this->enrollment_status( $u, $post ) ) );
		}
		return array( 'items' => array_slice( $users, ( max( 1, $page ) - 1 ) * $per_page, $per_page ), 'total' => count( $users ) );
	}

	public function student_count( int $post ): int {
		return count( $this->enrolled_users( $post, 'enrolled', 1, 100000 )['items'] );
	}

	/** @return int[] users who completed the lesson */
	public function lesson_completed_by( int $lesson ): array {
		global $wpdb;
		return array_map( 'intval', (array) $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT user_id FROM {$wpdb->prefix}lifterlms_user_postmeta WHERE post_id = %d AND meta_key = '_is_complete' AND meta_value = 'yes'", $lesson ) ) ); // phpcs:ignore WordPress.DB
	}

	/** @return int[] the user's completed lessons in the course */
	public function completed_lessons( int $user, int $course ): array {
		global $wpdb;
		return array_map(
			'intval',
			(array) $wpdb->get_col( // phpcs:ignore WordPress.DB
				$wpdb->prepare(
					"SELECT DISTINCT u.post_id FROM {$wpdb->prefix}lifterlms_user_postmeta u JOIN {$wpdb->postmeta} m ON m.post_id = u.post_id AND m.meta_key = '_llms_parent_course' AND m.meta_value = %d WHERE u.user_id = %d AND u.meta_key = '_is_complete' AND u.meta_value = 'yes'",
					$course,
					$user
				)
			)
		);
	}

	/** Progress in a course: a completed lesson or a quiz attempt in it. */
	public function has_progress( int $user, int $course ): bool {
		if ( $this->completed_lessons( $user, $course ) ) {
			return true;
		}
		global $wpdb;
		return (bool) $wpdb->get_var( // phpcs:ignore WordPress.DB
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->prefix}lifterlms_quiz_attempts a JOIN {$wpdb->postmeta} m ON m.post_id = a.lesson_id AND m.meta_key = '_llms_parent_course' AND m.meta_value = %d WHERE a.student_id = %d",
				$course,
				$user
			)
		);
	}

	public function quiz_attempts( int $quiz, int $after = 0 ): int {
		global $wpdb;
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}lifterlms_quiz_attempts WHERE quiz_id = %d AND id > %d", $quiz, $after ) ); // phpcs:ignore WordPress.DB
	}

	public function max_attempt_id( int $quiz ): int {
		global $wpdb;
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT MAX(id) FROM {$wpdb->prefix}lifterlms_quiz_attempts WHERE quiz_id = %d", $quiz ) ); // phpcs:ignore WordPress.DB
	}

	/** @return int[] question ids students have attempted (the attempts' serialized `questions`, spike item 29) */
	public function attempted_question_ids( int $quiz ): array {
		global $wpdb;
		$ids = array();
		foreach ( (array) $wpdb->get_col( $wpdb->prepare( "SELECT questions FROM {$wpdb->prefix}lifterlms_quiz_attempts WHERE quiz_id = %d", $quiz ) ) as $raw ) { // phpcs:ignore WordPress.DB
			$list = is_string( $raw ) ? @unserialize( $raw, array( 'allowed_classes' => false ) ) : $raw; // phpcs:ignore WordPress.PHP.NoSilencedErrors, WordPress.PHP.DiscouragedPHPFunctions
			foreach ( (array) $list as $q ) {
				if ( is_array( $q ) && isset( $q['id'] ) ) {
					$ids[] = (int) $q['id'];
				}
			}
		}
		return array_values( array_unique( $ids ) );
	}

	/** Orders that bought through the plan (`_llms_plan_id`). */
	public function plan_order_count( int $plan ): int {
		global $wpdb;
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->postmeta} m JOIN {$wpdb->posts} p ON p.ID = m.post_id AND p.post_type = 'llms_order' WHERE m.meta_key = '_llms_plan_id' AND m.meta_value = %d", $plan ) ); // phpcs:ignore WordPress.DB
	}

	public function has_active_subscriptions( int $product ): bool {
		$p = function_exists( 'llms_get_product' ) ? llms_get_product( $product ) : null;
		return $p && method_exists( $p, 'has_active_subscriptions' ) && $p->has_active_subscriptions( false );
	}

	/** Lessons of the course whose section is gone (LifterLMS deletes sections permanently, spike item 16). */
	public function orphan_lessons( int $course ): array {
		global $wpdb;
		$rows = $wpdb->get_results( // phpcs:ignore WordPress.DB
			$wpdb->prepare(
				"SELECT p.ID, p.post_title FROM {$wpdb->posts} p JOIN {$wpdb->postmeta} c ON c.post_id = p.ID AND c.meta_key = '_llms_parent_course' AND c.meta_value = %d LEFT JOIN {$wpdb->postmeta} s ON s.post_id = p.ID AND s.meta_key = '_llms_parent_section' LEFT JOIN {$wpdb->posts} sp ON sp.ID = s.meta_value WHERE p.post_type = 'lesson' AND p.post_status <> 'trash' AND sp.ID IS NULL",
				$course
			)
		);
		return array_map( static fn( $r ) => array( 'id' => (int) $r->ID, 'title' => (string) $r->post_title ), (array) $rows );
	}

	/** @return array<string,string> question type => its group name */
	public function question_types(): array {
		$out = array();
		foreach ( function_exists( 'llms_get_question_types' ) ? (array) llms_get_question_types() : array() as $type => $def ) {
			$def          = (array) $def;
			$out[ $type ] = (string) ( $def['group']['name'] ?? '' );
		}
		return $out;
	}

	/** @return array<int, array{id: int, name: string}> */
	public function difficulties(): array {
		return $this->terms( 'course_difficulty' );
	}

	/** @return array<int, array{id: int, name: string}> */
	public function categories(): array {
		return $this->terms( 'course_cat' );
	}

	private function terms( string $tax ): array {
		$terms = get_terms( array( 'taxonomy' => $tax, 'hide_empty' => false ) );
		return is_array( $terms ) ? array_map( static fn( $t ) => array( 'id' => (int) $t->term_id, 'name' => (string) $t->name ), $terms ) : array();
	}

	// Direct writes the spec allows (D2): before-images back on undo and recovery.

	/** Post fields that make up an object's before-image (post_modified moves on every save, so it is left out). */
	const SNAPSHOT_FIELDS = array( 'post_title', 'post_content', 'post_excerpt', 'post_status', 'post_name', 'post_parent', 'menu_order', 'post_author', 'post_password', 'comment_status', 'ping_status', 'post_date', 'post_date_gmt', 'post_type', 'post_mime_type' );

	/** Meta keys WordPress writes on its own. */
	const SNAPSHOT_SKIP_META = array( '_edit_lock', '_edit_last', '_wp_old_slug' );

	/** @return array{id: int, post: array, meta: array, terms: array}|null */
	public function snapshot_post( int $id ): ?array {
		$p = $id > 0 ? get_post( $id ) : null;
		if ( ! $p ) {
			return null;
		}
		$post = array_intersect_key( $p->to_array(), array_flip( self::SNAPSHOT_FIELDS ) );
		ksort( $post );
		$meta = array();
		foreach ( (array) get_post_meta( $id ) as $k => $values ) {
			if ( in_array( $k, self::SNAPSHOT_SKIP_META, true ) ) {
				continue;
			}
			$meta[ $k ] = array_map( 'maybe_unserialize', (array) $values );
		}
		ksort( $meta );
		$terms = array();
		foreach ( get_object_taxonomies( $p->post_type ) as $tax ) {
			$ids = wp_get_object_terms( $id, $tax, array( 'fields' => 'ids' ) );
			if ( is_array( $ids ) ) {
				$ids = array_map( 'intval', $ids );
				sort( $ids );
				$terms[ $tax ] = $ids;
			}
		}
		ksort( $terms );
		return array( 'id' => $id, 'post' => $post, 'meta' => $meta, 'terms' => $terms );
	}

	/** Write a before-image back exactly (post fields directly, every meta row, terms). */
	public function restore_post( array $record ): bool {
		global $wpdb;
		$id = (int) $record['id'];
		if ( ! get_post( $id ) ) {
			return false;
		}
		$fields = array_intersect_key( (array) $record['post'], array_flip( self::SNAPSHOT_FIELDS ) );
		if ( false === $wpdb->update( $wpdb->posts, $fields, array( 'ID' => $id ) ) ) { // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			return false;
		}
		foreach ( array_keys( (array) get_post_meta( $id ) ) as $k ) {
			if ( ! in_array( $k, self::SNAPSHOT_SKIP_META, true ) && ! array_key_exists( $k, (array) $record['meta'] ) ) {
				delete_post_meta( $id, $k );
			}
		}
		foreach ( (array) $record['meta'] as $k => $values ) {
			delete_post_meta( $id, $k );
			foreach ( (array) $values as $v ) {
				add_post_meta( $id, $k, wp_slash( $v ) );
			}
		}
		foreach ( (array) $record['terms'] as $tax => $ids ) {
			wp_set_object_terms( $id, array_map( 'intval', (array) $ids ), $tax );
		}
		clean_post_cache( $id );
		return $this->snapshot_post( $id ) === $record;
	}

	/** Create the object again with its old id (D16), then write its before-image. */
	public function recreate_post( array $record ): bool {
		$id = (int) $record['id'];
		if ( get_post( $id ) ) {
			return false;
		}
		$new = wp_insert_post(
			array(
				'import_id'   => $id,
				'post_type'   => (string) ( $record['post']['post_type'] ?? 'post' ),
				'post_title'  => (string) ( $record['post']['post_title'] ?? '' ),
				'post_status' => 'draft',
			),
			true
		);
		if ( is_wp_error( $new ) || (int) $new !== $id ) {
			if ( ! is_wp_error( $new ) ) {
				wp_delete_post( (int) $new, true );
			}
			return false;
		}
		return $this->restore_post( $record );
	}

	/** wp_delete_post( force ): LifterLMS's relationships run (spike item 17). */
	public function delete_post_permanently( int $id ): bool {
		return $id > 0 && (bool) wp_delete_post( $id, true );
	}

	/** Untrash with an explicit status (WordPress would answer draft, spike item 18). */
	public function untrash( int $id, string $status ): bool {
		if ( 'trash' !== get_post_status( $id ) ) {
			return false;
		}
		$filter = static function ( $new, $post_id ) use ( $id, $status ) {
			return (int) $post_id === $id ? $status : $new;
		};
		add_filter( 'wp_untrash_post_status', $filter, PHP_INT_MAX, 2 );
		try {
			wp_untrash_post( $id );
		} finally {
			remove_filter( 'wp_untrash_post_status', $filter, PHP_INT_MAX );
		}
		clean_post_cache( $id );
		return get_post_status( $id ) === $status;
	}

	/** The course (or membership) a LifterLMS object belongs to. */
	public function owner_course( int $post ): int {
		switch ( $this->post_type( $post ) ) {
			case 'course':
			case 'llms_membership':
				return $post;
			case 'section':
			case 'lesson':
				return (int) get_post_meta( $post, '_llms_parent_course', true );
			case 'llms_quiz':
				return $this->owner_course( (int) get_post_meta( $post, '_llms_lesson_id', true ) );
			case 'llms_question':
				return $this->owner_course( (int) get_post_meta( $post, '_llms_parent_id', true ) );
			case 'llms_access_plan':
				return (int) get_post_meta( $post, '_llms_product_id', true );
		}
		return 0;
	}

	/** Clear the lesson-quiz link on both sides, as LifterLMS's course builder detaches (spike item 19). */
	public function detach_quiz( int $quiz, int $lesson ): bool {
		if ( $lesson > 0 && 'lesson' === get_post_type( $lesson ) ) {
			update_post_meta( $lesson, '_llms_quiz_enabled', 'no' );
			update_post_meta( $lesson, '_llms_quiz', '' );
			clean_post_cache( $lesson );
		}
		if ( $quiz > 0 ) {
			update_post_meta( $quiz, '_llms_lesson_id', 0 );
			clean_post_cache( $quiz );
		}
		return true;
	}

	/** Link a quiz and its lesson on both sides. */
	public function attach_quiz( int $quiz, int $lesson ): bool {
		if ( 'lesson' !== get_post_type( $lesson ) || 'llms_quiz' !== get_post_type( $quiz ) ) {
			return false;
		}
		update_post_meta( $lesson, '_llms_quiz', $quiz );
		update_post_meta( $lesson, '_llms_quiz_enabled', 'yes' );
		update_post_meta( $quiz, '_llms_lesson_id', $lesson );
		clean_post_cache( $lesson );
		clean_post_cache( $quiz );
		return true;
	}

	// Enrolment sets (D18): read and restored through these primitives (the test fake replaces them).

	/** @return int[] the user's membership levels (`_llms_restricted_levels`) */
	public function levels( int $user ): array {
		$levels = get_user_meta( $user, '_llms_restricted_levels', true );
		return array_values( array_map( 'intval', is_array( $levels ) ? $levels : array() ) );
	}

	/** @return int[] a membership's auto-enrol courses */
	public function auto_enroll( int $membership ): array {
		$ids = get_post_meta( $membership, '_llms_auto_enroll', true );
		return array_values( array_map( 'intval', is_array( $ids ) ? $ids : array() ) );
	}

	/** @return int[] posts with any trigger row naming the membership, as remove_membership_level() finds them */
	public function triggered_courses( int $user, int $membership ): array {
		global $wpdb;
		$ids = array_map( 'intval', (array) $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT post_id FROM {$wpdb->prefix}lifterlms_user_postmeta WHERE user_id = %d AND meta_key = '_enrollment_trigger' AND meta_value = %s", $user, 'membership_' . $membership ) ) ); // phpcs:ignore WordPress.DB
		sort( $ids );
		return $ids;
	}

	public function delete_enrolment_rows( int $user, int $post ): bool {
		return function_exists( 'llms_bulk_delete_user_postmeta' ) && ! is_array( llms_bulk_delete_user_postmeta( $user, $post, array( '_enrollment_trigger' => null, '_start_date' => null, '_status' => null ) ) );
	}

	public function append_status( int $user, int $post, string $status ): bool {
		if ( ! function_exists( 'llms_update_user_postmeta' ) ) {
			return false;
		}
		if ( '' === (string) llms_get_user_postmeta( $user, $post, '_start_date', true ) ) {
			llms_update_user_postmeta( $user, $post, '_start_date', llms_current_time( 'mysql' ), false );
		}
		return (bool) llms_update_user_postmeta( $user, $post, '_status', $status, false );
	}

	public function append_trigger( int $user, int $post, string $trigger ): bool {
		return function_exists( 'llms_update_user_postmeta' ) && (bool) llms_update_user_postmeta( $user, $post, '_enrollment_trigger', $trigger, false );
	}

	public function set_levels( int $user, array $levels ): bool {
		update_user_meta( $user, '_llms_restricted_levels', array_values( array_map( 'intval', $levels ) ) );
		return true;
	}

	/** Drop LLMS_Student's cached statuses and dates for these posts (group llms_user_{id}). */
	public function reset_student_cache( int $user, array $posts ): void {
		foreach ( $posts as $p ) {
			foreach ( array( 'enrollment_status_%d', 'date_enrolled_%d', 'date_updated_%d' ) as $k ) {
				wp_cache_delete( sprintf( $k, (int) $p ), 'llms_user_' . $user );
			}
		}
		clean_user_cache( $user );
	}

	/**
	 * Everything an enrolment into or out of $post can change (D18): its own status and trigger,
	 * for a membership every course it auto-enrols or triggered (deleted posts skipped, trashed
	 * courses kept because LifterLMS enrols into them), the user's levels, and the user's other
	 * memberships that auto-enrol a course of the set (LifterLMS can hand a course to them).
	 *
	 * @return array{post: int, status: string, trigger: string, courses: array[], others: int[], levels: int[]}
	 */
	public function enrolment_set( int $user, int $post ): array {
		$set = array(
			'post'    => $post,
			'status'  => $this->enrollment_status( $user, $post ),
			'trigger' => $this->enrollment_trigger( $user, $post ),
			'courses' => array(),
			'others'  => array(),
			'levels'  => $this->levels( $user ),
		);
		if ( 'llms_membership' !== $this->post_type( $post ) ) {
			return $set;
		}
		$ids = array_values( array_unique( array_merge( $this->auto_enroll( $post ), $this->triggered_courses( $user, $post ) ) ) );
		$ids = array_values( array_filter( $ids, fn( $c ) => 'course' === $this->post_type( (int) $c ) ) );
		sort( $ids );
		foreach ( $ids as $c ) {
			$set['courses'][] = array( 'id' => (int) $c, 'status' => $this->enrollment_status( $user, (int) $c ), 'trigger' => $this->enrollment_trigger( $user, (int) $c ) );
		}
		foreach ( array_unique( $set['levels'] ) as $m ) {
			if ( $m !== $post && 'llms_membership' === $this->post_type( $m ) && array_intersect( $ids, $this->auto_enroll( $m ) ) ) {
				$set['others'][] = $m;
			}
		}
		sort( $set['others'] );
		return $set;
	}

	/**
	 * Write an enrolment set back with direct rows (D18): statuses appended, triggers written back,
	 * enrolments the set did not have removed, the levels restored, LifterLMS's cache reset.
	 *
	 * @return true|WP_Error
	 */
	public function restore_enrolment_set( int $user, array $set ) {
		$entries = array_merge( array( array( 'id' => (int) $set['post'], 'status' => (string) $set['status'], 'trigger' => (string) $set['trigger'] ) ), (array) $set['courses'] );
		$ids     = array();
		foreach ( $entries as $e ) {
			$id = (int) $e['id'];
			if ( '' === $this->post_type( $id ) ) {
				continue;
			}
			$ids[] = $id;
			$now   = $this->enrollment_status( $user, $id );
			if ( '' === (string) $e['status'] ) {
				if ( '' !== $now && ! $this->delete_enrolment_rows( $user, $id ) ) {
					return new WP_Error( 'rollback_failed', __( 'An enrolment could not be removed.', 'emcp-tools' ) );
				}
				continue;
			}
			if ( $now !== (string) $e['status'] && ! $this->append_status( $user, $id, (string) $e['status'] ) ) {
				return new WP_Error( 'rollback_failed', __( 'An enrolment status could not be written back.', 'emcp-tools' ) );
			}
			if ( '' !== (string) $e['trigger'] && $this->enrollment_trigger( $user, $id ) !== (string) $e['trigger'] && ! $this->append_trigger( $user, $id, (string) $e['trigger'] ) ) {
				return new WP_Error( 'rollback_failed', __( 'An enrolment trigger could not be written back.', 'emcp-tools' ) );
			}
		}
		$levels = array_values( array_map( 'intval', (array) $set['levels'] ) );
		if ( $this->levels( $user ) !== $levels ) {
			$this->set_levels( $user, $levels );
		}
		$this->reset_student_cache( $user, $ids );
		return true;
	}
}
