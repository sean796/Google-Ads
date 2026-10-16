<?php
/**
 * The only class that touches Tutor LMS (free). Tutor's write paths are its course builder's
 * wp_ajax_* handlers, which read $_POST, check Tutor's nonce and answer with wp_send_json();
 * call_handler() runs them in-process (spec 4.3). Unit tests replace this class with a fake.
 *
 * Every call resets TutorCache before and after: it is a static per-process cache with no delete,
 * so a long-lived MCP server would otherwise answer from stale state (spike item 12).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'EMCP_Tools_Captured_Json' ) ) {
	require_once dirname( __DIR__ ) . '/class-captured-json.php';
}

/** @since 3.19.0 */
class EMCP_Tools_Tutor_Api {

	/** The free question types (QuizModel::get_question_types(), is_pro false). */
	const FREE_QUESTION_TYPES = array( 'true_false', 'single_choice', 'multiple_choice', 'open_ended', 'fill_in_the_blank' );

	/** Course meta that belongs to a course's before-image (spec 4.4 step 1). */
	const COURSE_META = array( '_tutor_course_level', '_tutor_course_price_type', 'tutor_course_price', 'tutor_course_sale_price', '_course_duration', '_tutor_course_benefits', '_tutor_course_requirements', '_tutor_course_target_audience', '_tutor_course_material_includes', '_tutor_course_settings', '_tutor_enable_qa', '_tutor_is_public_course', '_video', '_thumbnail_id', '_tutor_course_product_id' );

	/** Lesson meta that belongs to a lesson's before-image. */
	const LESSON_META = array( '_video', '_tutor_attachments', '_thumbnail_id', '_lesson_thumbnail_id' );

	public function active(): bool {
		return function_exists( 'tutor' ) && defined( 'TUTOR_VERSION' );
	}

	public function version_string(): string {
		return defined( 'TUTOR_VERSION' ) ? (string) TUTOR_VERSION : '';
	}

	/** tutor_is_rest(): an HTTP MCP call, where Tutor validates video.source_type and keeps cleared fields. */
	public function is_rest(): bool {
		return function_exists( 'tutor_is_rest' ) ? (bool) tutor_is_rest() : ( defined( 'REST_REQUEST' ) && REST_REQUEST );
	}

	/** Tutor 4.x (the builder handlers this adapter was written against). */
	public function supported(): bool {
		return 4 === (int) strtok( $this->version_string(), '.' );
	}

	/** A tutor() config value (nonce, nonce_action, post types, instructor_role). */
	public function config( string $key ) {
		// TUTOR\Config exposes its values through __get only (no __isset), so isset() reads every
		// key as missing; read the value and treat null (an unknown key) as empty.
		$value = $this->tutor_config()->$key;
		return null === $value ? '' : $value;
	}

	/** Tutor's config object (a seam for the unit tests). */
	protected function tutor_config() {
		return tutor();
	}

	/** Drop everything in TutorCache (private static instance, private $data, no delete). */
	public function reset_cache(): void {
		if ( ! class_exists( '\Tutor\Cache\TutorCache' ) ) {
			return;
		}
		$instance = \Tutor\Cache\TutorCache::getInstance();
		\Closure::bind(
			function () {
				$this->data = array();
			},
			$instance,
			get_class( $instance )
		)();
	}

	/**
	 * Run $fn with $_POST and $_REQUEST set to $post, $_FILES empty and REQUEST_METHOD POST, the
	 * cache reset before and after, everything put back afterwards (also on an exception).
	 *
	 * @return mixed What $fn returns.
	 */
	public function with_post( array $post, callable $fn ) {
		$saved = array( $_POST, $_REQUEST, $_FILES, $_SERVER['REQUEST_METHOD'] ?? null ); // phpcs:ignore WordPress.Security.NonceVerification
		$_POST                     = $post;
		$_REQUEST                  = $post;
		$_FILES                    = array();
		$_SERVER['REQUEST_METHOD'] = 'POST';
		$this->reset_cache();
		try {
			return $fn();
		} finally {
			list( $_POST, $_REQUEST, $_FILES, $method ) = $saved;
			if ( null === $method ) {
				unset( $_SERVER['REQUEST_METHOD'] );
			} else {
				$_SERVER['REQUEST_METHOD'] = $method;
			}
			$this->reset_cache();
		}
	}

	/**
	 * Run one of Tutor's wp_ajax handlers and return its answer.
	 *
	 * @return array|WP_Error {status, message, data}; tutor_error for a 4xx/5xx status_code or
	 *                        success false; tutor_unexpected_output for anything else.
	 */
	public function call_handler( string $action, array $post ) {
		$post[ (string) $this->config( 'nonce' ) ] = wp_create_nonce( (string) $this->config( 'nonce_action' ) );
		$out = $this->with_post(
			$post,
			static function () use ( $action ) {
				return EMCP_Tools_Captured_Json::run(
					static function () use ( $action ) {
						do_action( 'wp_ajax_' . $action );
					}
				);
			}
		);
		if ( is_wp_error( $out ) || empty( $out['sent'] ) ) {
			return new WP_Error( 'tutor_unexpected_output', __( 'Tutor LMS did not answer this request as expected. Tutor may have changed; check that it is version 4.x.', 'emcp-tools' ), array( 'action' => $action ) );
		}
		return self::answer( (array) $out['data'], $action );
	}

	/** @return array|WP_Error */
	public static function answer( array $data, string $action = '' ) {
		if ( array_key_exists( 'status_code', $data ) ) {
			$status = (int) $data['status_code'];
			if ( $status >= 400 ) {
				return new WP_Error( 'tutor_error', (string) ( $data['message'] ?? __( 'Tutor LMS refused the request.', 'emcp-tools' ) ), array( 'status' => $status, 'data' => $data['data'] ?? null ) );
			}
			return array( 'status' => $status, 'message' => (string) ( $data['message'] ?? '' ), 'data' => $data['data'] ?? null );
		}
		if ( array_key_exists( 'success', $data ) ) {
			if ( ! $data['success'] ) {
				$d   = $data['data'] ?? null;
				$msg = is_string( $d ) ? $d : ( is_array( $d ) && isset( $d['message'] ) ? (string) $d['message'] : (string) ( $data['message'] ?? '' ) );
				return new WP_Error( 'tutor_error', '' !== trim( $msg ) ? trim( $msg ) : __( 'Tutor LMS refused the request.', 'emcp-tools' ), array( 'status' => 400, 'data' => $d ) );
			}
			return array( 'status' => 200, 'message' => (string) ( $data['message'] ?? '' ), 'data' => $data['data'] ?? null );
		}
		return new WP_Error( 'tutor_unexpected_output', __( 'Tutor LMS answered in a shape EMCP does not know. Tutor may have changed; check that it is version 4.x.', 'emcp-tools' ), array( 'action' => $action ) );
	}

	/** 16 hex characters of sha256 over the canonical JSON of what a read returns. */
	public static function version( array $canonical ): string {
		return substr( hash( 'sha256', (string) wp_json_encode( self::sort_keys( $canonical ) ) ), 0, 16 );
	}

	private static function sort_keys( $v ) {
		if ( ! is_array( $v ) ) {
			return is_object( $v ) ? self::sort_keys( (array) $v ) : $v;
		}
		if ( ! array_is_list( $v ) ) {
			ksort( $v );
		}
		foreach ( $v as $k => $x ) {
			$v[ $k ] = self::sort_keys( $x );
		}
		return $v;
	}

	// Permissions: Tutor's own rules (spike item 14).

	/** May open the course builder at all: an administrator or an approved instructor. */
	public function builder_access(): bool {
		return \TUTOR\User::is_admin() || \TUTOR\User::is_instructor();
	}

	public function is_admin(): bool {
		return \TUTOR\User::is_admin();
	}

	public function can_edit_course( int $course_id ): bool {
		return $course_id > 0 && tutor_utils()->can_user_edit_course( get_current_user_id(), $course_id );
	}

	/** @param string $type course, topic, lesson or quiz. */
	public function can_manage( string $type, int $id ): bool {
		return $id > 0 && tutor_utils()->can_user_manage( $type, $id );
	}

	public function can( string $cap, ...$args ): bool {
		return current_user_can( $cap, ...$args );
	}

	public function option( string $key, $default = null ) {
		return tutor_utils()->get_option( $key, $default );
	}

	/** @return string[] */
	public function statuses(): array {
		return array_values( (array) \Tutor\Models\CourseModel::get_status_list() );
	}

	/** @return array level => label */
	public function levels(): array {
		return (array) tutor_utils()->course_levels();
	}

	/** @return string[] The free question types Tutor knows. */
	public function question_types(): array {
		$all = array_keys( (array) \Tutor\Models\QuizModel::get_question_types() );
		return array_values( array_intersect( self::FREE_QUESTION_TYPES, $all ) );
	}

	// Writes (spec 4.3 and 4.4). Course writes go through Tutor's builder handlers; the before-image
	// is written back directly on undo and recovery (spec D2).

	/** @return int|WP_Error The new course id. */
	public function create_course( array $payload ) {
		$r = $this->call_handler( 'tutor_create_course', $payload );
		return is_wp_error( $r ) ? $r : (int) $r['data'];
	}

	/** @return int|WP_Error */
	public function update_course( array $payload ) {
		$r = $this->call_handler( 'tutor_update_course', $payload );
		return is_wp_error( $r ) ? $r : (int) $r['data'];
	}

	/** Delete meta keys the call cleared and Tutor left (spec D13). */
	public function delete_meta( int $post_id, array $keys ): void {
		foreach ( $keys as $k ) {
			delete_post_meta( $post_id, (string) $k );
		}
	}

	/** Write a course's before-image back: post fields, the course meta and the terms, exactly. */
	public function restore_course( array $rec ): bool {
		$id = (int) $rec['id'];
		try {
			return (bool) $this->with_post(
				array(),
				function () use ( $id, $rec ) {
					$post = array( 'ID' => $id );
					foreach ( array( 'post_title', 'post_content', 'post_excerpt', 'post_status', 'post_author', 'post_name' ) as $k ) {
						if ( array_key_exists( $k, (array) $rec['post'] ) ) {
							$post[ $k ] = $rec['post'][ $k ];
						}
					}
					$saved = wp_update_post( wp_slash( $post ), true );
					if ( is_wp_error( $saved ) || ! $saved ) {
						return false;
					}
					foreach ( self::COURSE_META as $k ) {
						if ( array_key_exists( $k, (array) $rec['meta'] ) ) {
							update_post_meta( $id, $k, wp_slash( $rec['meta'][ $k ] ) );
						} else {
							delete_post_meta( $id, $k );
						}
					}
					foreach ( (array) $rec['terms'] as $tax => $ids ) {
						wp_set_object_terms( $id, array_map( 'intval', (array) $ids ), (string) $tax );
					}
					return true;
				}
			);
		} catch ( \Throwable $e ) {
			return false;
		}
	}

	/**
	 * Run $fn with Tutor's trashed_post redirect removed: Course::redirect_to_course_list_page()
	 * calls wp_safe_redirect() and exit for a course unless enable_gutenberg_course_edit is on
	 * (spec D16), which would end the MCP request. Put back afterwards.
	 *
	 * @return mixed What $fn returns.
	 */
	public function without_trash_redirect( callable $fn ) {
		$cb       = 'TUTOR\Course::redirect_to_course_list_page';
		$priority = has_filter( 'trashed_post', $cb );
		if ( false !== $priority ) {
			remove_action( 'trashed_post', $cb, (int) $priority );
		}
		try {
			return $fn();
		} finally {
			if ( false !== $priority ) {
				add_action( 'trashed_post', $cb, (int) $priority );
			}
		}
	}

	public function trash_course( int $course_id ): bool {
		return (bool) $this->with_post(
			array(),
			function () use ( $course_id ) {
				return $this->without_trash_redirect(
					static function () use ( $course_id ) {
						return (bool) wp_trash_post( $course_id );
					}
				);
			}
		);
	}

	/** Untrash with the recorded status (core gives every untrashed post draft, spec D16). */
	public function untrash_course( int $course_id, string $status ): bool {
		$filter = static function ( $new_status, $post_id ) use ( $course_id, $status ) {
			return (int) $post_id === $course_id ? $status : $new_status;
		};
		add_filter( 'wp_untrash_post_status', $filter, PHP_INT_MAX, 2 );
		try {
			return (bool) $this->with_post(
				array(),
				static function () use ( $course_id ) {
					return (bool) wp_untrash_post( $course_id );
				}
			);
		} finally {
			remove_filter( 'wp_untrash_post_status', $filter, PHP_INT_MAX );
		}
	}

	/** Permanently delete a course that has no topics or enrolments (undo of a create). */
	public function delete_course( int $course_id ): bool {
		return (bool) $this->with_post(
			array(),
			static function () use ( $course_id ) {
				return (bool) wp_delete_post( $course_id, true );
			}
		);
	}

	// Curriculum writes.

	/** @return int|WP_Error Tutor's topic handler (create, or update with topic_id). */
	public function save_topic( array $post ) {
		$r = $this->call_handler( 'tutor_save_topic', $post );
		return is_wp_error( $r ) ? $r : (int) $r['data'];
	}

	/** @return true|WP_Error */
	public function delete_topic( int $topic_id ) {
		$r = $this->call_handler( 'tutor_delete_topic', array( 'topic_id' => $topic_id ) );
		return is_wp_error( $r ) ? $r : true;
	}

	/** @return int|WP_Error Tutor's lesson handler (create, or update with lesson_id). */
	public function save_lesson( array $post ) {
		$r = $this->call_handler( 'tutor_save_lesson', $post );
		return is_wp_error( $r ) ? $r : (int) $r['data'];
	}

	/** @return true|WP_Error */
	public function delete_lesson( int $lesson_id ) {
		$r = $this->call_handler( 'tutor_delete_lesson', array( 'lesson_id' => $lesson_id ) );
		return is_wp_error( $r ) ? $r : true;
	}

	/**
	 * Tutor's content order handler. It writes post_parent and menu_order with direct SQL, so the
	 * post cache of every topic and content is cleaned afterwards.
	 *
	 * @param array $sorting [{topic_id, lesson_ids: int[]}] (lesson_ids hold lessons and quizzes).
	 * @return true|WP_Error
	 */
	public function reorder( array $sorting ) {
		$r   = $this->call_handler( 'tutor_update_course_content_order', array( 'tutor_topics_lessons_sorting' => wp_json_encode( $sorting ) ) );
		$ids = array();
		foreach ( $sorting as $t ) {
			$ids[] = (int) $t['topic_id'];
			$ids   = array_merge( $ids, array_map( 'intval', (array) ( $t['lesson_ids'] ?? array() ) ) );
		}
		foreach ( array_unique( $ids ) as $id ) {
			clean_post_cache( $id );
		}
		return is_wp_error( $r ) ? $r : true;
	}

	/** @return array<int, array{0: int, 1: int}> id => [post_parent, menu_order] of the given posts. */
	public function positions( array $ids ): array {
		$out = array();
		foreach ( array_unique( array_map( 'intval', $ids ) ) as $id ) {
			$p = get_post( $id );
			if ( $p ) {
				$out[ $id ] = array( (int) $p->post_parent, (int) $p->menu_order );
			}
		}
		return $out;
	}

	/** Put posts back at exact positions (post_parent, menu_order), as reorder() writes them: directly. */
	public function set_positions( array $positions ) {
		global $wpdb;
		foreach ( $positions as $id => $pos ) {
			$ok = $wpdb->update( $wpdb->posts, array( 'post_parent' => (int) $pos[0], 'menu_order' => (int) $pos[1] ), array( 'ID' => (int) $id ), array( '%d', '%d' ), array( '%d' ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			clean_post_cache( (int) $id );
			if ( false === $ok ) {
				return new WP_Error( 'save_failed', __( 'The earlier order could not be written back.', 'emcp-tools' ) );
			}
		}
		$this->reset_cache();
		return true;
	}

	/** Write a topic's or lesson's before-image back (post fields, and a lesson's meta exactly). */
	public function restore_post( string $kind, array $rec ): bool {
		$id = (int) $rec['id'];
		try {
			return (bool) $this->with_post(
				array(),
				function () use ( $id, $kind, $rec ) {
					$saved = wp_update_post( wp_slash( array( 'ID' => $id ) + (array) $rec['post'] ), true );
					if ( is_wp_error( $saved ) || ! $saved ) {
						return false;
					}
					if ( 'lesson' === $kind ) {
						$this->write_meta( $id, self::LESSON_META, (array) $rec['meta'] );
					}
					clean_post_cache( $id );
					return true;
				}
			);
		} catch ( \Throwable $e ) {
			return false;
		}
	}

	/** Create a deleted topic or lesson again with its old id (import_id), fields and meta. */
	public function recreate_post( string $kind, array $rec ): bool {
		$id   = (int) $rec['id'];
		$type = 'topic' === $kind ? 'topics' : (string) $this->config( 'lesson_post_type' );
		if ( get_post( $id ) ) {
			return false;
		}
		try {
			return (bool) $this->with_post(
				array(),
				function () use ( $id, $type, $kind, $rec ) {
					$new = wp_insert_post( wp_slash( array( 'import_id' => $id, 'post_type' => $type, 'post_status' => 'publish' ) + (array) $rec['post'] ), true );
					if ( is_wp_error( $new ) || $id !== (int) $new ) {
						if ( ! is_wp_error( $new ) && $new ) {
							wp_delete_post( (int) $new, true );
						}
						return false;
					}
					if ( 'lesson' === $kind ) {
						$this->write_meta( $id, self::LESSON_META, (array) $rec['meta'] );
					}
					return true;
				}
			);
		} catch ( \Throwable $e ) {
			return false;
		}
	}

	private function write_meta( int $id, array $keys, array $meta ): void {
		foreach ( $keys as $k ) {
			if ( array_key_exists( $k, $meta ) ) {
				update_post_meta( $id, $k, wp_slash( $meta[ $k ] ) );
			} else {
				delete_post_meta( $id, $k );
			}
		}
	}

	public function post_exists( int $id ): bool {
		return null !== get_post( $id );
	}

	// Quizzes (spike item 11).

	/**
	 * QuizBuilder::save_quiz(), as Tutor's quiz builder handler calls it. It runs its own
	 * START TRANSACTION / COMMIT on the shared connection, so it must never run inside an EMCP
	 * transaction (D11); deleted ids are read from $_POST.
	 *
	 * @return int|WP_Error The quiz id.
	 */
	public function save_quiz( int $topic_id, array $payload, array $deleted_questions, array $deleted_answers ) {
		$result = $this->with_post(
			array( 'deleted_question_ids' => array_values( $deleted_questions ), 'deleted_answer_ids' => array_values( $deleted_answers ) ),
			static function () use ( $topic_id, $payload ) {
				return ( new \TUTOR\QuizBuilder( false ) )->save_quiz( $topic_id, wp_slash( $payload ) );
			}
		);
		if ( ! is_object( $result ) || empty( $result->success ) ) {
			$errors = is_object( $result ) ? (array) ( $result->errors ?? array() ) : array();
			$flat   = array();
			array_walk_recursive(
				$errors,
				static function ( $v ) use ( &$flat ) {
					$flat[] = (string) $v;
				}
			);
			return new WP_Error( 'tutor_error', $flat ? implode( ' ', $flat ) : __( 'Tutor could not save the quiz.', 'emcp-tools' ), array( 'status' => 400, 'data' => $errors ) );
		}
		return (int) $result->data;
	}

	/**
	 * Whether Tutor's database update has run: QuizBuilder deletes questions only WHERE content_id
	 * IS NULL, a column Tutor's Upgrader adds on admin_init, so a site where Tutor was activated or
	 * updated from WP-CLI and wp-admin was not opened since cannot delete questions.
	 */
	public function quiz_schema_ready(): bool {
		global $wpdb;
		return (bool) $wpdb->get_var( $wpdb->prepare( 'SHOW COLUMNS FROM ' . $wpdb->prefix . 'tutor_quiz_questions LIKE %s', 'content_id' ) ); // phpcs:ignore WordPress.DB
	}

	/** @return true|WP_Error */
	public function delete_quiz( int $quiz_id ) {
		$r = $this->call_handler( 'tutor_quiz_delete', array( 'quiz_id' => $quiz_id ) );
		return is_wp_error( $r ) ? $r : true;
	}

	/** @return string[] The columns of one of Tutor's quiz tables. */
	private static function columns( string $table ): array {
		static $cache = array();
		global $wpdb;
		if ( ! isset( $cache[ $table ] ) ) {
			$cache[ $table ] = (array) $wpdb->get_col( "DESCRIBE {$table}", 0 ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		}
		return $cache[ $table ];
	}

	/** A row as the table stores it (settings serialized, unknown keys dropped). */
	private static function db_row( string $table, array $row ): array {
		$out = array_intersect_key( $row, array_flip( self::columns( $table ) ) );
		foreach ( array( 'question_settings', 'answer_settings' ) as $k ) {
			if ( isset( $out[ $k ] ) && is_array( $out[ $k ] ) ) {
				$out[ $k ] = maybe_serialize( $out[ $k ] );
			}
		}
		return $out;
	}

	/**
	 * Write a quiz's before-image back (D14): post fields and options; rows the record does not have
	 * deleted, rows it has updated in place or inserted again with their original ids.
	 */
	public function restore_quiz( array $rec ): bool {
		global $wpdb;
		$id = (int) $rec['id'];
		$qt = $wpdb->prefix . 'tutor_quiz_questions';
		$at = $wpdb->prefix . 'tutor_quiz_question_answers';
		try {
			$ok = $this->with_post(
				array(),
				static function () use ( $id, $rec ) {
					$saved = wp_update_post( wp_slash( array( 'ID' => $id ) + (array) $rec['post'] ), true );
					if ( is_wp_error( $saved ) || ! $saved ) {
						return false;
					}
					update_post_meta( $id, 'tutor_quiz_option', wp_slash( (array) $rec['options'] ) );
					return true;
				}
			);
			if ( ! $ok ) {
				return false;
			}
			$keep_q = array();
			$keep_a = array();
			foreach ( (array) $rec['questions'] as $q ) {
				$keep_q[] = (int) $q['question_id'];
				foreach ( (array) $q['answers'] as $a ) {
					$keep_a[] = (int) $a['answer_id'];
				}
			}
			$now = (array) ( $this->quiz( $id )['questions'] ?? array() );
			foreach ( $now as $q ) {
				foreach ( (array) $q['answers'] as $a ) {
					if ( ! in_array( (int) $a['answer_id'], $keep_a, true ) ) {
						$wpdb->delete( $at, array( 'answer_id' => (int) $a['answer_id'] ) );
					}
				}
				if ( ! in_array( (int) $q['question_id'], $keep_q, true ) ) {
					$wpdb->delete( $at, array( 'belongs_question_id' => (int) $q['question_id'] ) );
					$wpdb->delete( $qt, array( 'question_id' => (int) $q['question_id'] ) );
				}
			}
			foreach ( (array) $rec['questions'] as $q ) {
				$row  = self::db_row( $qt, array( 'quiz_id' => $id ) + (array) $q['row'] );
				$have = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$qt} WHERE question_id = %d", (int) $q['question_id'] ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
				if ( false === ( $have ? $wpdb->update( $qt, $row, array( 'question_id' => (int) $q['question_id'] ) ) : $wpdb->insert( $qt, $row ) ) ) {
					return false;
				}
				foreach ( (array) $q['answers'] as $a ) {
					$arow = self::db_row( $at, (array) $a['row'] );
					$has  = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$at} WHERE answer_id = %d", (int) $a['answer_id'] ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
					if ( false === ( $has ? $wpdb->update( $at, $arow, array( 'answer_id' => (int) $a['answer_id'] ) ) : $wpdb->insert( $at, $arow ) ) ) {
						return false;
					}
				}
			}
			clean_post_cache( $id );
			return true;
		} catch ( \Throwable $e ) {
			return false;
		}
	}

	/** Create a deleted quiz again with its old id, options, and question and answer rows with their ids. */
	public function recreate_quiz( array $rec ): bool {
		$id = (int) $rec['id'];
		if ( get_post( $id ) ) {
			return false;
		}
		$new = $this->with_post(
			array(),
			function () use ( $id, $rec ) {
				return wp_insert_post( wp_slash( array( 'import_id' => $id, 'post_type' => (string) $this->config( 'quiz_post_type' ), 'post_status' => 'publish' ) + (array) $rec['post'] ), true );
			}
		);
		if ( is_wp_error( $new ) || $id !== (int) $new ) {
			if ( ! is_wp_error( $new ) && $new ) {
				wp_delete_post( (int) $new, true );
			}
			return false;
		}
		return $this->restore_quiz( $rec );
	}

	/** @return int[] Which of these question ids exist in Tutor's questions table. */
	public function question_ids_exist( array $ids ): array {
		return $this->ids_in( 'tutor_quiz_questions', 'question_id', $ids );
	}

	/** @return int[] Which of these answer ids exist in Tutor's answers table. */
	public function answer_ids_exist( array $ids ): array {
		return $this->ids_in( 'tutor_quiz_question_answers', 'answer_id', $ids );
	}

	private function ids_in( string $table, string $col, array $ids ): array {
		global $wpdb;
		$ids = array_values( array_filter( array_map( 'intval', $ids ) ) );
		if ( ! $ids ) {
			return array();
		}
		$in = implode( ',', $ids );
		return array_map( 'intval', (array) $wpdb->get_col( "SELECT {$col} FROM {$wpdb->prefix}{$table} WHERE {$col} IN ({$in})" ) ); // phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
	}

	// Enrolments (spike items 12, 17).

	/** @return int|WP_Error The enrolment post id (EnrollmentModel::do_enroll()). */
	public function enrol( int $course_id, int $user_id ) {
		$id = (int) $this->with_post(
			array(),
			static function () use ( $course_id, $user_id ) {
				return \Tutor\Models\EnrollmentModel::do_enroll( $course_id, 0, $user_id );
			}
		);
		return $id ? $id : new WP_Error( 'tutor_error', __( 'Tutor did not enrol the student (the course may be full or closed).', 'emcp-tools' ) );
	}

	/**
	 * EnrollmentModel::update_enrollments(), the bulk action of Tutor's enrolment list (its own
	 * statuses completed, pending, cancel). Never cancel_course_enrol(): with Tutor's cancel status
	 * it calls die(). It writes with direct SQL, so the post cache is cleaned.
	 */
	public function set_enrolment_status( int $enrolment_id, string $status ): bool {
		$ok = (bool) $this->with_post(
			array(),
			static function () use ( $enrolment_id, $status ) {
				return \Tutor\Models\EnrollmentModel::update_enrollments( $status, array( $enrolment_id ) );
			}
		);
		clean_post_cache( $enrolment_id );
		return $ok;
	}

	/** Delete one enrolment post (undo of an enrolment; progress meta is not touched). */
	public function delete_enrolment( int $enrolment_id ): bool {
		$ok = (bool) $this->with_post(
			array(),
			static function () use ( $enrolment_id ) {
				return (bool) wp_delete_post( $enrolment_id, true );
			}
		);
		$this->reset_cache();
		return $ok;
	}

	/** Whether a course has topics or any enrolment (it is then never deleted). */
	public function has_content( int $course_id ): bool {
		global $wpdb;
		$topics = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = 'topics' AND post_parent = %d", $course_id ) );
		$enrol  = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = %s AND post_parent = %d", (string) $this->config( 'enrollment_post_type' ), $course_id ) );
		return $topics + $enrol > 0;
	}

	// Reads.

	/** @return array|WP_Error The builder's own course details. */
	public function course_details( int $course_id ) {
		$r = $this->call_handler( 'tutor_course_details', array( 'course_id' => $course_id ) );
		return is_wp_error( $r ) ? $r : (array) $r['data'];
	}

	/** @return array|WP_Error Topics with their contents, in order (the builder's own read). */
	public function course_contents( int $course_id ) {
		$r = $this->call_handler( 'tutor_course_contents', array( 'course_id' => $course_id ) );
		if ( is_wp_error( $r ) ) {
			return $r;
		}
		$topics = array();
		foreach ( (array) $r['data'] as $t ) {
			$t        = (array) $t;
			$contents = array();
			foreach ( (array) ( $t['contents'] ?? array() ) as $c ) {
				$c          = (array) $c;
				$contents[] = array( 'id' => (int) $c['ID'], 'type' => self::content_type( (string) $c['post_type'] ), 'title' => (string) $c['post_title'], 'order' => (int) $c['menu_order'] );
			}
			$topics[] = array( 'id' => (int) $t['id'], 'title' => (string) $t['title'], 'summary' => (string) $t['summary'], 'contents' => $contents );
		}
		return $topics;
	}

	private static function content_type( string $post_type ): string {
		$map = array( 'lesson' => 'lesson', 'tutor_quiz' => 'quiz', 'tutor_assignments' => 'assignment', 'tutor_zoom_meeting' => 'zoom', 'tutor-google-meet' => 'meet' );
		return $map[ $post_type ] ?? $post_type;
	}

	/** @return array Lessons and quizzes of the course that no topic holds (orphaned by a topic delete). */
	public function orphans( int $course_id ): array {
		$posts = get_posts(
			array(
				'post_type'      => array( (string) $this->config( 'lesson_post_type' ), (string) $this->config( 'quiz_post_type' ) ),
				'post_status'    => 'any',
				'post_parent'    => 0,
				'posts_per_page' => 200,
				'meta_key'       => '_tutor_course_id_for_lesson', // phpcs:ignore WordPress.DB.SlowDBQuery
				'meta_value'     => (string) $course_id, // phpcs:ignore WordPress.DB.SlowDBQuery
			)
		);
		$out = array();
		foreach ( $posts as $p ) {
			$out[] = array( 'id' => (int) $p->ID, 'type' => self::content_type( (string) $p->post_type ), 'title' => (string) $p->post_title );
		}
		return $out;
	}

	/** @return array{ids: int[], total: int} */
	public function course_ids( array $q ): array {
		$args = array(
			'post_type'      => (string) $this->config( 'course_post_type' ),
			'post_status'    => ! empty( $q['status'] ) ? (string) $q['status'] : array( 'publish', 'draft', 'pending', 'private', 'future' ),
			'posts_per_page' => (int) ( $q['per_page'] ?? 20 ),
			'paged'          => max( 1, (int) ( $q['page'] ?? 1 ) ),
			'orderby'        => 'ID',
			'order'          => 'DESC',
			'fields'         => 'ids',
		);
		if ( ! empty( $q['search'] ) ) {
			$args['s'] = (string) $q['search'];
		}
		if ( ! empty( $q['category'] ) ) {
			$args['tax_query'] = array( array( 'taxonomy' => 'course-category', 'field' => 'term_id', 'terms' => array( (int) $q['category'] ) ) ); // phpcs:ignore WordPress.DB.SlowDBQuery
		}
		if ( ! empty( $q['ids'] ) ) {
			$args['post__in'] = array_map( 'intval', (array) $q['ids'] );
		}
		$query = new WP_Query( $args );
		return array( 'ids' => array_map( 'intval', (array) $query->posts ), 'total' => (int) $query->found_posts );
	}

	/** @return int[] Courses the user instructs (user meta _tutor_instructor_course_id). */
	public function instructor_course_ids( int $user_id ): array {
		return array_map( 'intval', (array) get_user_meta( $user_id, '_tutor_instructor_course_id' ) );
	}

	/** @return array{id:int, display_name:string}[] */
	public function instructors( int $course_id ): array {
		$out = array();
		foreach ( (array) tutor_utils()->get_instructors_by_course( $course_id ) as $i ) {
			$out[] = array( 'id' => (int) $i->ID, 'display_name' => (string) $i->display_name );
		}
		return $out;
	}

	/** Post fields, meta and terms of a course (its before-image, spec 4.4 step 1). */
	public function course_record( int $course_id ): ?array {
		$p = get_post( $course_id );
		if ( ! $p || (string) $this->config( 'course_post_type' ) !== $p->post_type ) {
			return null;
		}
		$meta = array();
		foreach ( self::COURSE_META as $k ) {
			if ( metadata_exists( 'post', $course_id, $k ) ) {
				$meta[ $k ] = get_post_meta( $course_id, $k, true );
			}
		}
		$terms = array();
		foreach ( array( 'course-category', 'course-tag' ) as $tax ) {
			$ids            = wp_get_object_terms( $course_id, $tax, array( 'fields' => 'ids' ) );
			$terms[ $tax ] = is_wp_error( $ids ) ? array() : array_map( 'intval', $ids );
			sort( $terms[ $tax ] );
		}
		return array(
			'id'           => $course_id,
			'post'         => array( 'post_title' => $p->post_title, 'post_content' => $p->post_content, 'post_excerpt' => $p->post_excerpt, 'post_status' => $p->post_status, 'post_author' => (int) $p->post_author, 'post_name' => $p->post_name ),
			'meta'         => $meta,
			'terms'        => $terms,
			'enrolled'     => $this->enrolment_count( $course_id ),
			'trash_status' => (string) get_post_meta( $course_id, '_wp_trash_meta_status', true ),
		);
	}

	/** Post fields and meta of a lesson, with its topic and course. */
	public function lesson( int $lesson_id ): ?array {
		$p = get_post( $lesson_id );
		if ( ! $p || (string) $this->config( 'lesson_post_type' ) !== $p->post_type ) {
			return null;
		}
		$meta = array();
		foreach ( self::LESSON_META as $k ) {
			if ( metadata_exists( 'post', $lesson_id, $k ) ) {
				$meta[ $k ] = get_post_meta( $lesson_id, $k, true );
			}
		}
		$topic = (int) $p->post_parent;
		return array(
			'id'         => $lesson_id,
			'post'       => array( 'post_title' => $p->post_title, 'post_content' => $p->post_content, 'post_status' => $p->post_status, 'post_parent' => $topic, 'menu_order' => (int) $p->menu_order, 'post_name' => $p->post_name ),
			'meta'       => $meta,
			'topic_id'   => $topic,
			'course_id'  => $topic ? (int) wp_get_post_parent_id( $topic ) : (int) get_post_meta( $lesson_id, '_tutor_course_id_for_lesson', true ),
			'url'        => (string) get_permalink( $lesson_id ),
		);
	}

	/** A topic's post fields. */
	public function topic( int $topic_id ): ?array {
		$p = get_post( $topic_id );
		if ( ! $p || 'topics' !== $p->post_type ) {
			return null;
		}
		return array( 'id' => $topic_id, 'post' => array( 'post_title' => $p->post_title, 'post_content' => $p->post_content, 'post_parent' => (int) $p->post_parent, 'menu_order' => (int) $p->menu_order ), 'course_id' => (int) $p->post_parent );
	}

	/** @return array|null Tutor's quiz details (options, questions with answers). */
	public function quiz( int $quiz_id ): ?array {
		$p = get_post( $quiz_id );
		if ( ! $p || (string) $this->config( 'quiz_post_type' ) !== $p->post_type ) {
			return null;
		}
		$d = (array) \Tutor\Models\QuizModel::get_quiz_details( $quiz_id );
		$q = array();
		foreach ( (array) ( $d['questions'] ?? array() ) as $question ) {
			$question = (array) $question;
			$answers  = array();
			foreach ( (array) ( $question['question_answers'] ?? array() ) as $a ) {
				$a         = (array) $a;
				$answers[] = array( 'answer_id' => (int) $a['answer_id'], 'title' => (string) $a['answer_title'], 'is_correct' => (int) $a['is_correct'], 'order' => (int) $a['answer_order'], 'row' => $a );
			}
			$q[] = array( 'question_id' => (int) $question['question_id'], 'title' => (string) $question['question_title'], 'description' => (string) $question['question_description'], 'type' => (string) $question['question_type'], 'mark' => (float) $question['question_mark'], 'settings' => (array) maybe_unserialize( $question['question_settings'] ), 'order' => (int) $question['question_order'], 'answers' => $answers, 'row' => array_diff_key( $question, array( 'question_answers' => 1 ) ) );
		}
		$topic = (int) $p->post_parent;
		return array(
			'id'        => $quiz_id,
			'post'      => array( 'post_title' => $p->post_title, 'post_content' => $p->post_content, 'post_parent' => $topic, 'menu_order' => (int) $p->menu_order ),
			'options'   => (array) get_post_meta( $quiz_id, 'tutor_quiz_option', true ),
			'questions' => $q,
			'topic_id'  => $topic,
			'course_id' => $topic ? (int) wp_get_post_parent_id( $topic ) : 0,
		);
	}

	/** Attempts on a quiz with an id above $after_attempt_id (D15 compares attempt ids, not times). */
	public function quiz_attempts( int $quiz_id, int $after_attempt_id = 0 ): int {
		global $wpdb;
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}tutor_quiz_attempts WHERE quiz_id = %d AND attempt_id > %d", $quiz_id, $after_attempt_id ) );
	}

	public function max_attempt_id( int $quiz_id ): int {
		global $wpdb;
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT MAX(attempt_id) FROM {$wpdb->prefix}tutor_quiz_attempts WHERE quiz_id = %d", $quiz_id ) );
	}

	/** @return int[] Questions of the quiz that attempt answers point at. */
	public function attempted_question_ids( int $quiz_id ): array {
		global $wpdb;
		return array_map( 'intval', (array) $wpdb->get_col( $wpdb->prepare( "SELECT DISTINCT question_id FROM {$wpdb->prefix}tutor_quiz_attempt_answers WHERE quiz_id = %d", $quiz_id ) ) );
	}

	/** @return array{quiz_id: int, result: string, earned_marks: float, total_marks: float, ended_at: string}[] The last attempt of each quiz the student took in the course. */
	public function quiz_results( int $course_id, int $user_id ): array {
		global $wpdb;
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT a.quiz_id, a.result, a.earned_marks, a.total_marks, a.attempt_ended_at FROM {$wpdb->prefix}tutor_quiz_attempts a INNER JOIN ( SELECT quiz_id, MAX(attempt_id) AS last FROM {$wpdb->prefix}tutor_quiz_attempts WHERE course_id = %d AND user_id = %d GROUP BY quiz_id ) l ON l.last = a.attempt_id", $course_id, $user_id ) );
		$out  = array();
		foreach ( (array) $rows as $r ) {
			$out[] = array( 'quiz_id' => (int) $r->quiz_id, 'result' => (string) $r->result, 'earned_marks' => (float) $r->earned_marks, 'total_marks' => (float) $r->total_marks, 'ended_at' => (string) $r->attempt_ended_at );
		}
		return $out;
	}

	/** @return int[] Users who completed the lesson (user meta _tutor_completed_lesson_id_{id}). */
	public function lesson_completed_by( int $lesson_id ): array {
		global $wpdb;
		return array_map( 'intval', (array) $wpdb->get_col( $wpdb->prepare( "SELECT user_id FROM {$wpdb->usermeta} WHERE meta_key = %s", '_tutor_completed_lesson_id_' . $lesson_id ) ) );
	}

	public function enrolment_count( int $course_id ): int {
		global $wpdb;
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type = %s AND post_parent = %d AND post_status = 'completed'", (string) $this->config( 'enrollment_post_type' ), $course_id ) );
	}

	/** @return array{items: array, total: int} */
	public function enrolments( int $course_id, ?string $status, int $page, int $per_page ): array {
		// Direct SQL: Tutor registers none of its enrolment statuses (completed, pending, cancel),
		// and WP_Query drops a post_status that is not registered, so it found nothing.
		global $wpdb;
		$statuses = $status ? array( $status ) : array( 'completed', 'pending', 'cancel' );
		$in       = implode( ',', array_fill( 0, count( $statuses ), '%s' ) );
		$args     = array_merge( array( (string) $this->config( 'enrollment_post_type' ), $course_id ), $statuses );
		$from     = "FROM {$wpdb->posts} WHERE post_type = %s AND post_parent = %d AND post_status IN ($in)";
		$total    = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) $from", $args ) ); // phpcs:ignore WordPress.DB
		$rows     = $wpdb->get_results( $wpdb->prepare( "SELECT ID, post_author, post_status, post_date_gmt $from ORDER BY ID ASC LIMIT %d OFFSET %d", array_merge( $args, array( $per_page, ( max( 1, $page ) - 1 ) * $per_page ) ) ) ); // phpcs:ignore WordPress.DB
		$items    = array();
		foreach ( (array) $rows as $r ) {
			$items[] = array( 'enrolment_id' => (int) $r->ID, 'user_id' => (int) $r->post_author, 'status' => (string) $r->post_status, 'enrolled_at' => (string) $r->post_date_gmt );
		}
		return array( 'items' => $items, 'total' => $total );
	}

	/** The enrolment post of a user in a course, any status. */
	public function enrolment( int $course_id, int $user_id ): ?array {
		global $wpdb;
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT ID, post_status, post_date_gmt FROM {$wpdb->posts} WHERE post_type = %s AND post_parent = %d AND post_author = %d ORDER BY ID DESC LIMIT 1", (string) $this->config( 'enrollment_post_type' ), $course_id, $user_id ) );
		return $row ? array( 'enrolment_id' => (int) $row->ID, 'status' => (string) $row->post_status, 'enrolled_at' => (string) $row->post_date_gmt ) : null;
	}

	/** @return array{percent: int, completed_lessons: int[], completed_at: string} */
	public function progress( int $course_id, int $user_id ): array {
		$this->reset_cache();
		$lessons   = array();
		$completed = array();
		foreach ( (array) tutor_utils()->get_course_content_ids_by( (string) $this->config( 'lesson_post_type' ), (string) $this->config( 'course_post_type' ), $course_id ) as $lid ) {
			$lessons[] = (int) $lid;
			if ( get_user_meta( $user_id, '_tutor_completed_lesson_id_' . (int) $lid, true ) ) {
				$completed[] = (int) $lid;
			}
		}
		$done = tutor_utils()->is_completed_course( $course_id, $user_id );
		return array(
			'percent'           => (int) tutor_utils()->get_course_completed_percent( $course_id, $user_id ),
			'completed_lessons' => $completed,
			'lessons'           => $lessons,
			'completed_at'      => is_object( $done ) && isset( $done->completion_date ) ? (string) $done->completion_date : '',
		);
	}

	/** @return array{display_name: string, email: string}|null */
	public function user( int $user_id ): ?array {
		$u = get_userdata( $user_id );
		return $u ? array( 'display_name' => (string) $u->display_name, 'email' => (string) $u->user_email ) : null;
	}

	public function permalink( int $id ): string {
		return (string) get_permalink( $id );
	}

	public function price( int $course_id ): array {
		return array(
			'type'       => (string) get_post_meta( $course_id, '_tutor_course_price_type', true ),
			'price'      => (string) get_post_meta( $course_id, 'tutor_course_price', true ),
			'sale_price' => (string) get_post_meta( $course_id, 'tutor_course_sale_price', true ),
			'purchasable' => (bool) tutor_utils()->is_course_purchasable( $course_id ),
		);
	}
}
