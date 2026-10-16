<?php
/**
 * Tutor LMS (free) integration: the tutor-read and tutor-write dispatcher tools. Operation rows
 * live in ops/tutor-read.php and ops/tutor-write.php; each row names its own rule (cap_*) and
 * handler (op_*). Every Tutor call goes through EMCP_Tools_Tutor_Api; every write goes through
 * EMCP_Tools_Tutor_Writer.
 *
 * Who may do what is Tutor's own rule, operation by operation (spike item 14).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'EMCP_Tools_Op_Args' ) ) {
	require_once dirname( __DIR__ ) . '/class-op-args.php';
}

/** @since 3.19.0 */
class EMCP_Tools_Tutor_Integration {

	/** Courses per list-courses page. */
	const PER_PAGE = 20;

	/** Enrolments per list-enrolments page. */
	const ENROLMENTS_PER_PAGE = 50;

	/** @var EMCP_Tools_Tutor_Api|null Test seam. */
	private static $api_override = null;

	/** @var string[] */
	private $ability_names = array();

	public static function use_api( ?EMCP_Tools_Tutor_Api $api ): void {
		self::$api_override = $api;
	}

	public static function tutor_active(): bool {
		return function_exists( 'tutor' ) && defined( 'TUTOR_VERSION' );
	}

	public static function shared_api(): EMCP_Tools_Tutor_Api {
		return self::$api_override ? self::$api_override : new EMCP_Tools_Tutor_Api();
	}

	protected function api(): EMCP_Tools_Tutor_Api {
		return self::shared_api();
	}

	/** @return string[] */
	public function get_ability_names(): array {
		return $this->ability_names;
	}

	public function check_permission(): bool {
		return $this->api()->can( 'edit_tutor_courses' ) || $this->api()->can( 'manage_tutor' );
	}

	public function register(): void {
		if ( ! ( function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code() ) ) {
			return;
		}
		$schema = static function ( string $what ): array {
			return array(
				'type'       => 'object',
				'properties' => array(
					'operation' => array( 'type' => 'string', 'description' => $what ),
					'arguments' => array( 'type' => 'object', 'description' => __( 'Arguments for the operation, plus confirm and dry_run where listed.', 'emcp-tools' ) ),
				),
			);
		};
		$tools = array(
			'emcp-tools/tutor-read'  => array(
				'label'       => __( 'Tutor LMS Read', 'emcp-tools' ),
				'description' => __( 'Read Tutor LMS courses: the setup and allowed operations, the list of courses, a course\'s fields and curriculum (topics, lessons, quizzes) with its version, a lesson, a quiz with its questions, the students of a course and one student\'s progress. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_read',
				'operation'   => __( 'The read operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
			),
			'emcp-tools/tutor-write' => array(
				'label'       => __( 'Tutor LMS Write', 'emcp-tools' ),
				'description' => __( 'Build Tutor LMS courses: create and change courses (only the fields you pass change), publish them, move them to the trash, add and change topics, lessons (with video and attachments) and quizzes (with questions and answers), set the order of the curriculum, and enrol or un-enrol students in free courses. Every write to an existing course needs the version from get-course. Disabled by default; enable under Neo EMCP > Tools > Plugins > Tutor LMS. trash-course, delete-topic, delete-lesson, delete-quiz and cancel-enrolment need confirm:true. Every write can be undone in History. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_write',
				'operation'   => __( 'The write operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => false, 'destructive' => true, 'idempotent' => false ),
			),
		);
		if ( ! $this->api()->supported() ) {
			unset( $tools['emcp-tools/tutor-write'] );
		}
		foreach ( $tools as $name => $t ) {
			$this->ability_names[] = $name;
			emcp_tools_register_ability(
				$name,
				array(
					'label'               => $t['label'],
					'description'         => $t['description'],
					'category'            => 'emcp-tools',
					'execute_callback'    => array( $this, $t['callback'] ),
					'permission_callback' => array( $this, 'check_permission' ),
					'input_schema'        => $schema( $t['operation'] ),
					'meta'                => array(
						'annotations'  => $t['annotations'],
						'show_in_rest' => true,
					),
				)
			);
		}
	}

	/** @return array|WP_Error */
	public function run_read( $input ) {
		return $this->run( 'read', $input );
	}

	/** @return array|WP_Error */
	public function run_write( $input ) {
		return $this->run( 'write', $input );
	}

	/** @return array<string,array> */
	protected function operations( string $mode ): array {
		$ops = (array) require __DIR__ . '/ops/tutor-' . $mode . '.php';
		if ( ! $this->api()->supported() ) {
			$ops = 'read' === $mode ? array_intersect_key( $ops, array( 'get-setup' => 1 ) ) : array();
		}
		return $ops;
	}

	/** @return array */
	public function catalog( string $mode ): array {
		$ops = array();
		foreach ( $this->operations( $mode ) as $name => $op ) {
			$args     = array();
			$required = array();
			foreach ( (array) $op['args'] as $arg => $type ) {
				$args[ $arg ] = rtrim( (string) $type, '!' );
				if ( '!' === substr( (string) $type, -1 ) ) {
					$required[] = $arg;
				}
			}
			$ops[] = array(
				'name'        => $name,
				'arguments'   => $args,
				'required'    => $required,
				'confirm'     => ! empty( $op['confirm'] ),
				'dry_run'     => ! empty( $op['dry_run'] ),
				'undo'        => 'write' === $mode ? (string) ( $op['undo'] ?? 'undoable' ) : 'read-only',
				'description' => $op['desc'],
			);
		}
		return array( 'mode' => $mode, 'operations' => $ops );
	}

	/** @return array|WP_Error */
	protected function run( string $mode, $input ) {
		$name = is_array( $input ) && isset( $input['operation'] ) ? str_replace( '_', '-', sanitize_key( (string) $input['operation'] ) ) : '';
		if ( '' === $name ) {
			return $this->catalog( $mode );
		}
		if ( ! $this->api()->active() ) {
			return new WP_Error( 'tutor_inactive', __( 'Tutor LMS is not active.', 'emcp-tools' ) );
		}
		$ops = $this->operations( $mode );
		if ( ! isset( $ops[ $name ] ) ) {
			if ( ! $this->api()->supported() ) {
				/* translators: %s: Tutor LMS version. */
				return new WP_Error( 'tutor_unsupported_version', sprintf( __( 'This Tutor LMS version (%s) is not supported yet; EMCP works with Tutor LMS 4.x.', 'emcp-tools' ), $this->api()->version_string() ) );
			}
			/* translators: %s: operation name. */
			return new WP_Error( 'unknown_operation', sprintf( __( 'Unknown operation "%s". Call the tool with no operation to list the available operations.', 'emcp-tools' ), $name ) );
		}
		$op   = $ops[ $name ];
		$args = is_array( $input ) && isset( $input['arguments'] ) && is_array( $input['arguments'] ) ? $input['arguments'] : array();

		$dry_run = false;
		if ( array_key_exists( 'dry_run', $args ) ) {
			if ( empty( $op['dry_run'] ) || ! is_bool( $args['dry_run'] ) ) {
				return new WP_Error( 'invalid_argument', __( 'dry_run must be a boolean and is only supported where the operation list says so.', 'emcp-tools' ) );
			}
			$dry_run = $args['dry_run'];
			unset( $args['dry_run'] );
		}
		$confirmed = array_key_exists( 'confirm', $args ) && true === $args['confirm'];
		unset( $args['confirm'] );

		$clean = EMCP_Tools_Op_Args::validate( (array) $op['args'], $args );
		if ( is_wp_error( $clean ) ) {
			return $clean;
		}
		// An explicit null clears a field where the row allows it (Op_Args drops nulls).
		foreach ( (array) ( $op['nullable'] ?? array() ) as $key ) {
			if ( array_key_exists( $key, $args ) && null === $args[ $key ] ) {
				$clean[ $key ] = null;
			}
		}
		if ( ! method_exists( $this, $op['cap'] ) || ! method_exists( $this, $op['run'] ) ) {
			return new WP_Error( 'not_ready', __( 'This operation is not available yet.', 'emcp-tools' ) );
		}
		$allowed = call_user_func( array( $this, $op['cap'] ), $clean );
		if ( is_wp_error( $allowed ) ) {
			return $allowed;
		}
		if ( ! empty( $op['confirm'] ) && ! $confirmed && ! $dry_run ) {
			return new WP_Error( 'confirmation_required', __( 'This operation removes something or takes it away from students. Pass confirm:true in arguments to proceed.', 'emcp-tools' ) );
		}
		return call_user_func( array( $this, $op['run'] ), $clean, $dry_run, $confirmed );
	}

	// Rules: Tutor's own (spike item 14). Each returns true or a WP_Error.

	protected static function forbidden(): WP_Error {
		return new WP_Error( 'forbidden', __( 'You are not allowed to do this in Tutor LMS.', 'emcp-tools' ), array( 'status' => 403 ) );
	}

	protected static function not_found( string $what, int $id ): WP_Error {
		/* translators: 1: what (course, lesson, ...), 2: id. */
		return new WP_Error( 'not_found', sprintf( __( 'There is no %1$s %2$d.', 'emcp-tools' ), $what, $id ), array( 'status' => 404 ) );
	}

	/** @return true|WP_Error An administrator or an instructor. */
	protected function cap_builder( array $args ) {
		return $this->api()->builder_access() ? true : self::forbidden();
	}

	/** @return true|WP_Error */
	protected function cap_course( array $args ) {
		$id = (int) ( $args['course_id'] ?? 0 );
		if ( ! $this->api()->course_record( $id ) ) {
			return self::not_found( 'course', $id );
		}
		return $this->api()->can_edit_course( $id ) ? true : self::forbidden();
	}

	/** @return true|WP_Error */
	protected function cap_topic( array $args ) {
		$id = (int) ( $args['topic_id'] ?? 0 );
		if ( ! $this->api()->topic( $id ) ) {
			return self::not_found( 'topic', $id );
		}
		return $this->api()->can_manage( 'topic', $id ) ? true : self::forbidden();
	}

	/** @return true|WP_Error */
	protected function cap_lesson( array $args ) {
		$id = (int) ( $args['lesson_id'] ?? 0 );
		if ( ! $this->api()->lesson( $id ) ) {
			return self::not_found( 'lesson', $id );
		}
		return $this->api()->can_manage( 'lesson', $id ) ? true : self::forbidden();
	}

	/** @return true|WP_Error */
	protected function cap_quiz( array $args ) {
		$id = (int) ( $args['quiz_id'] ?? 0 );
		if ( ! $this->api()->quiz( $id ) ) {
			return self::not_found( 'quiz', $id );
		}
		return $this->api()->can_manage( 'quiz', $id ) ? true : self::forbidden();
	}

	/** save-quiz: the quiz when updating, else the topic it goes into. @return true|WP_Error */
	protected function cap_quiz_target( array $args ) {
		if ( isset( $args['quiz_id'] ) ) {
			return $this->cap_quiz( $args );
		}
		if ( ! isset( $args['topic_id'] ) ) {
			return new WP_Error( 'missing_argument', __( 'Pass topic_id to create a quiz, or quiz_id to change one.', 'emcp-tools' ) );
		}
		return $this->cap_topic( $args );
	}

	/** Course rights plus list_users (student accounts). @return true|WP_Error */
	protected function cap_enrol( array $args ) {
		$can = $this->cap_course( $args );
		if ( is_wp_error( $can ) ) {
			return $can;
		}
		return $this->api()->can( 'list_users' ) ? true : self::forbidden();
	}

	// Shapes shared with the writer.

	/** Agent-facing course fields from Tutor's course details (the names create-course takes). */
	public static function course_fields( array $d ): array {
		$ids = static function ( $terms ): array {
			$out = array_map( static fn( $t ) => (int) ( is_array( $t ) ? ( $t['term_id'] ?? 0 ) : ( $t->term_id ?? 0 ) ), (array) $terms );
			sort( $out );
			return $out;
		};
		$author   = $d['post_author'] ?? 0;
		$author   = is_array( $author ) ? (int) ( $author['ID'] ?? 0 ) : ( is_object( $author ) ? (int) ( $author->ID ?? 0 ) : (int) $author );
		$pricing  = (array) ( $d['course_pricing'] ?? array() );
		$duration = (array) ( $d['course_duration'] ?? array() );
		// Named settings only: Tutor answers '' with none, and its save array_merge()s numeric keys in as new entries.
		$settings = is_array( $d['course_settings'] ?? null ) ? array_filter( $d['course_settings'], 'is_string', ARRAY_FILTER_USE_KEY ) : array();
		$video    = is_array( $d['video'] ?? null ) && '' !== (string) ( $d['video']['source'] ?? '' ) ? $d['video'] : array(); // Tutor answers '' with no video.
		return array(
			'title'           => (string) ( $d['post_title'] ?? '' ),
			'content'         => (string) ( $d['post_content'] ?? '' ),
			'status'          => (string) ( $d['post_status'] ?? '' ),
			'author'          => $author,
			'level'           => (string) ( $d['course_level'] ?? '' ),
			'categories'      => $ids( $d['course_categories'] ?? array() ),
			'tags'            => $ids( $d['course_tags'] ?? array() ),
			'price_type'      => (string) ( $pricing['type'] ?? 'free' ),
			'price'           => (string) ( $pricing['price'] ?? '' ),
			'sale_price'      => (string) ( $pricing['sale_price'] ?? '' ),
			'benefits'        => (string) ( $d['course_benefits'] ?? '' ),
			'requirements'    => (string) ( $d['course_requirements'] ?? '' ),
			'target_audience' => (string) ( $d['course_target_audience'] ?? '' ),
			'materials'       => (string) ( $d['course_material_includes'] ?? '' ),
			'duration'        => $duration ? array( 'hours' => (int) ( $duration['hours'] ?? 0 ), 'minutes' => (int) ( $duration['minutes'] ?? 0 ) ) : array(),
			'enable_qna'      => 'yes' === (string) ( $d['enable_qna'] ?? 'no' ),
			'is_public'       => 'yes' === (string) ( $d['is_public_course'] ?? 'no' ),
			'max_students'    => (int) ( $settings['maximum_students'] ?? 0 ),
			'settings'        => $settings,
			'thumbnail_id'    => (int) ( $d['thumbnail_id'] ?? 0 ),
			'video'           => $video ? $video : null,
		);
	}

	/** Version of a course: its fields, curriculum and orphans (spec section 3). */
	public static function course_version( array $fields, array $curriculum, array $orphans ): string {
		$topics = array();
		foreach ( $curriculum as $t ) {
			$topics[] = array( 'id' => (int) $t['id'], 'title' => (string) $t['title'], 'summary' => (string) $t['summary'], 'contents' => array_map( static fn( $c ) => array( (int) $c['id'], (string) $c['type'], (string) $c['title'] ), (array) $t['contents'] ) );
		}
		return EMCP_Tools_Tutor_Api::version( array( 'fields' => $fields, 'curriculum' => $topics, 'orphans' => array_map( 'intval', array_column( $orphans, 'id' ) ) ) );
	}

	/** @return array|WP_Error {fields, curriculum, orphans, version} */
	public function course_state( int $course_id ) {
		return self::state_of( $this->api(), $course_id );
	}

	/** @return array|WP_Error {fields, curriculum, orphans, version} */
	public static function state_of( EMCP_Tools_Tutor_Api $api, int $course_id ) {
		if ( ! $api->course_record( $course_id ) ) {
			return self::not_found( 'course', $course_id );
		}
		$details = $api->course_details( $course_id );
		if ( is_wp_error( $details ) ) {
			return $details;
		}
		$curriculum = $api->course_contents( $course_id );
		if ( is_wp_error( $curriculum ) ) {
			return $curriculum;
		}
		$orphans = $api->orphans( $course_id );
		$fields  = self::course_fields( $details );
		return array( 'fields' => $fields, 'curriculum' => $curriculum, 'orphans' => $orphans, 'version' => self::course_version( $fields, $curriculum, $orphans ) );
	}

	/** Agent-facing lesson and its version. */
	public static function lesson_view( array $rec ): array {
		$m = (array) $rec['meta'];
		return array(
			'id'           => (int) $rec['id'],
			'title'        => (string) $rec['post']['post_title'],
			'content'      => (string) $rec['post']['post_content'],
			'status'       => (string) $rec['post']['post_status'],
			'topic_id'     => (int) $rec['topic_id'],
			'course_id'    => (int) $rec['course_id'],
			'order'        => (int) $rec['post']['menu_order'],
			'video'        => ! empty( $m['_video'] ) ? (array) $m['_video'] : null,
			'attachments'  => array_values( array_map( 'intval', (array) ( $m['_tutor_attachments'] ?? array() ) ) ),
			'thumbnail_id' => (int) ( $m['_thumbnail_id'] ?? 0 ),
			'url'          => (string) ( $rec['url'] ?? '' ),
		);
	}

	public static function lesson_version( array $rec ): string {
		return EMCP_Tools_Tutor_Api::version( array( 'post' => $rec['post'], 'meta' => $rec['meta'] ) );
	}

	/** Agent-facing quiz (no raw table rows). */
	public static function quiz_view( array $rec ): array {
		$questions = array();
		foreach ( (array) $rec['questions'] as $q ) {
			$answers = array();
			foreach ( (array) $q['answers'] as $a ) {
				$answers[] = array( 'answer_id' => (int) $a['answer_id'], 'title' => (string) $a['title'], 'is_correct' => (bool) $a['is_correct'], 'order' => (int) $a['order'] );
			}
			$questions[] = array( 'question_id' => (int) $q['question_id'], 'title' => (string) $q['title'], 'description' => (string) $q['description'], 'type' => (string) $q['type'], 'mark' => (float) $q['mark'], 'settings' => (array) $q['settings'], 'order' => (int) $q['order'], 'answers' => $answers );
		}
		return array( 'id' => (int) $rec['id'], 'title' => (string) $rec['post']['post_title'], 'summary' => (string) $rec['post']['post_content'], 'topic_id' => (int) $rec['topic_id'], 'course_id' => (int) $rec['course_id'], 'options' => (array) $rec['options'], 'questions' => $questions );
	}

	public static function quiz_version( array $rec ): string {
		return EMCP_Tools_Tutor_Api::version( array( 'post' => $rec['post'], 'options' => $rec['options'], 'questions' => self::quiz_view( $rec )['questions'] ) );
	}

	protected function edit_url( int $course_id ): string {
		return admin_url( 'admin.php?page=create-course&course_id=' . $course_id );
	}

	// Read handlers.

	/** @return array */
	protected function op_get_setup( array $a ) {
		$api     = $this->api();
		$allowed = array();
		foreach ( array_keys( (array) require __DIR__ . '/ops/tutor-write.php' ) as $name ) {
			if ( ! $api->builder_access() ) {
				break;
			}
			if ( in_array( $name, array( 'enrol-student', 'cancel-enrolment' ), true ) && ! $api->can( 'list_users' ) ) {
				continue;
			}
			$allowed[] = $name;
		}
		return array(
			'tutor_version'           => $api->version_string(),
			'supported'               => $api->supported(),
			'monetize_by'             => (string) $api->option( 'monetize_by', 'free' ),
			'levels'                  => $api->supported() ? $api->levels() : array(),
			'statuses'                => $api->supported() ? $api->statuses() : array(),
			'question_types'          => $api->supported() ? $api->question_types() : array(),
			'instructors_may_publish' => (bool) $api->option( 'instructor_can_publish_course', false ),
			'instructors_may_trash'   => (bool) $api->option( 'instructor_can_delete_course', false ),
			'course_base'             => (string) $api->option( 'course_permalink_base', 'courses' ),
			'lesson_base'             => (string) $api->option( 'lesson_permalink_base', 'lessons' ),
			'allowed_operations'      => $api->supported() ? $allowed : array(),
		);
	}

	/** @return array */
	protected function op_list_courses( array $a ) {
		$api = $this->api();
		$q   = array( 'search' => $a['search'] ?? '', 'status' => $a['status'] ?? '', 'category' => $a['category'] ?? 0, 'page' => $a['page'] ?? 1, 'per_page' => self::PER_PAGE );
		if ( ! $api->is_admin() ) {
			$q['ids'] = $api->instructor_course_ids( get_current_user_id() );
		}
		if ( isset( $a['instructor'] ) ) {
			$mine     = $api->instructor_course_ids( (int) $a['instructor'] );
			$q['ids'] = isset( $q['ids'] ) ? array_values( array_intersect( $q['ids'], $mine ) ) : $mine;
		}
		if ( isset( $q['ids'] ) && ! $q['ids'] ) {
			return array( 'courses' => array(), 'total' => 0, 'page' => (int) $q['page'] );
		}
		$found = $api->course_ids( $q );
		$rows  = array();
		foreach ( $found['ids'] as $id ) {
			$rows[] = $this->course_row( $id );
		}
		return array( 'courses' => $rows, 'total' => (int) $found['total'], 'page' => (int) $q['page'] );
	}

	protected function course_row( int $id ): array {
		$api      = $this->api();
		$rec      = (array) $api->course_record( $id );
		$contents = $api->course_contents( $id );
		$contents = is_wp_error( $contents ) ? array() : $contents;
		$count    = array( 'lesson' => 0, 'quiz' => 0 );
		foreach ( $contents as $t ) {
			foreach ( (array) $t['contents'] as $c ) {
				if ( isset( $count[ $c['type'] ] ) ) {
					++$count[ $c['type'] ];
				}
			}
		}
		$price = $api->price( $id );
		return array(
			'id'          => $id,
			'title'       => (string) ( $rec['post']['post_title'] ?? '' ),
			'status'      => (string) ( $rec['post']['post_status'] ?? '' ),
			'level'       => (string) ( $rec['meta']['_tutor_course_level'] ?? '' ),
			'price_type'  => $price['type'],
			'price'       => $price['price'],
			'categories'  => (array) ( $rec['terms']['course-category'] ?? array() ),
			'instructors' => $api->instructors( $id ),
			'topics'      => count( $contents ),
			'lessons'     => $count['lesson'],
			'quizzes'     => $count['quiz'],
			'enrolled'    => (int) ( $rec['enrolled'] ?? 0 ),
			'url'         => $api->permalink( $id ),
			'edit_url'    => $this->edit_url( $id ),
		);
	}

	/** @return array|WP_Error */
	protected function op_get_course( array $a ) {
		$id    = (int) $a['course_id'];
		$state = $this->course_state( $id );
		if ( is_wp_error( $state ) ) {
			return $state;
		}
		$rec = (array) $this->api()->course_record( $id );
		return array(
			'course'      => $state['fields'],
			'curriculum'  => $state['curriculum'],
			'orphans'     => $state['orphans'],
			'instructors' => $this->api()->instructors( $id ),
			'enrolled'    => (int) ( $rec['enrolled'] ?? 0 ),
			'version'     => $state['version'],
			'url'         => $this->api()->permalink( $id ),
			'edit_url'    => $this->edit_url( $id ),
		);
	}

	/** @return array */
	protected function op_get_lesson( array $a ) {
		$rec = (array) $this->api()->lesson( (int) $a['lesson_id'] );
		return array( 'lesson' => self::lesson_view( $rec ), 'version' => self::lesson_version( $rec ) );
	}

	/** @return array */
	protected function op_get_quiz( array $a ) {
		$rec = (array) $this->api()->quiz( (int) $a['quiz_id'] );
		return array( 'quiz' => self::quiz_view( $rec ), 'attempts' => $this->api()->quiz_attempts( (int) $a['quiz_id'] ), 'version' => self::quiz_version( $rec ) );
	}

	/** One student as list-enrolments shows it (email only for users who may list users). */
	protected function student( int $user_id ): array {
		$u   = (array) $this->api()->user( $user_id );
		$out = array( 'user_id' => $user_id, 'display_name' => (string) ( $u['display_name'] ?? '' ) );
		if ( $this->api()->can( 'list_users' ) ) {
			$out['email'] = (string) ( $u['email'] ?? '' );
		}
		return $out;
	}

	/** @return array */
	protected function op_list_enrolments( array $a ) {
		$api  = $this->api();
		$id   = (int) $a['course_id'];
		$page = max( 1, (int) ( $a['page'] ?? 1 ) );
		$list = $api->enrolments( $id, $a['status'] ?? null, $page, self::ENROLMENTS_PER_PAGE );
		$rows = array();
		foreach ( $list['items'] as $e ) {
			$progress = $api->progress( $id, (int) $e['user_id'] );
			$rows[]   = array( 'enrolment_id' => (int) $e['enrolment_id'] ) + $this->student( (int) $e['user_id'] ) + array( 'status' => $e['status'], 'enrolled_at' => $e['enrolled_at'], 'progress_percent' => (int) $progress['percent'], 'completed_at' => (string) $progress['completed_at'] );
		}
		return array( 'enrolments' => $rows, 'total' => (int) $list['total'], 'page' => $page );
	}

	/** @return array|WP_Error */
	protected function op_get_student_progress( array $a ) {
		$api = $this->api();
		$id  = (int) $a['course_id'];
		$uid = (int) $a['user_id'];
		if ( ! $api->user( $uid ) ) {
			return self::not_found( 'user', $uid );
		}
		$progress = $api->progress( $id, $uid );
		return $this->student( $uid ) + array(
			'course_id'         => $id,
			'enrolment'         => $api->enrolment( $id, $uid ),
			'progress_percent'  => (int) $progress['percent'],
			'completed_lessons' => $progress['completed_lessons'],
			'lessons'           => $progress['lessons'],
			'quizzes'           => $api->quiz_results( $id, $uid ),
			'completed_at'      => (string) $progress['completed_at'],
		);
	}

	// Course writes (spec 4.2, 4.4).

	protected function writer(): EMCP_Tools_Tutor_Writer {
		return new EMCP_Tools_Tutor_Writer( $this->api() );
	}

	/** The course fields a call names, in the writer's names. */
	protected static function course_changes( array $a ): array {
		$keys = array( 'title', 'content', 'status', 'level', 'categories', 'tags', 'price_type', 'price', 'sale_price', 'benefits', 'requirements', 'target_audience', 'materials', 'duration', 'enable_qna', 'is_public', 'max_students', 'thumbnail_id', 'video', 'author' );
		return array_intersect_key( $a, array_flip( $keys ) );
	}

	/** @return true|WP_Error */
	protected function check_course_fields( array $c ) {
		if ( isset( $c['author'] ) && ! $this->api()->is_admin() ) {
			return new WP_Error( 'forbidden', __( 'Only administrators may set a course\'s author.', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		if ( isset( $c['level'] ) && ! array_key_exists( $c['level'], $this->api()->levels() ) ) {
			/* translators: %s: level list. */
			return new WP_Error( 'invalid_argument', sprintf( __( 'level must be one of: %s.', 'emcp-tools' ), implode( ', ', array_keys( $this->api()->levels() ) ) ) );
		}
		if ( 'paid' === ( $c['price_type'] ?? '' ) && 'tutor' !== (string) $this->api()->option( 'monetize_by', 'free' ) ) {
			return new WP_Error( 'paid_needs_tutor_shop', __( 'Paid courses can be set here only when Tutor sells courses itself (monetize_by tutor); with WooCommerce or EDD, link the product in Tutor\'s course builder.', 'emcp-tools' ) );
		}
		foreach ( array( 'categories', 'tags' ) as $k ) {
			if ( isset( $c[ $k ] ) ) {
				foreach ( (array) $c[ $k ] as $v ) {
					if ( ! is_int( $v ) && ! ( is_string( $v ) && ctype_digit( $v ) ) ) {
						/* translators: %s: argument name. */
						return new WP_Error( 'invalid_argument', sprintf( __( '%s must be a list of term ids.', 'emcp-tools' ), $k ) );
					}
				}
			}
		}
		if ( isset( $c['video'] ) && '' === (string) ( $c['video']['source'] ?? '' ) ) {
			return new WP_Error( 'invalid_argument', __( 'video needs a source (youtube, vimeo, external_url, html5, embedded, shortcode).', 'emcp-tools' ) );
		}
		return true;
	}

	/** @return array|WP_Error */
	protected function op_create_course( array $a, bool $dry_run ) {
		$c  = self::course_changes( $a );
		$ok = $this->check_course_fields( $c );
		return is_wp_error( $ok ) ? $ok : $this->writer()->create_course( $c, $dry_run );
	}

	/** @return array|WP_Error */
	protected function op_update_course( array $a, bool $dry_run ) {
		$c  = self::course_changes( $a );
		$ok = $this->check_course_fields( $c );
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		if ( ! $c ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		return $this->writer()->update_course( (int) $a['course_id'], $a['course_version'] ?? null, ! empty( $a['force'] ), $c, 'update-course', $dry_run );
	}

	/** @return array|WP_Error */
	protected function op_set_course_status( array $a ) {
		return $this->writer()->update_course( (int) $a['course_id'], $a['course_version'] ?? null, ! empty( $a['force'] ), array( 'status' => $a['status'] ), 'set-course-status' );
	}

	/** @return array|WP_Error */
	protected function op_trash_course( array $a ) {
		if ( ! $this->api()->is_admin() && ! $this->api()->option( 'instructor_can_delete_course', false ) ) {
			return new WP_Error( 'forbidden', __( 'Instructors may not move courses to the trash on this site (Tutor\'s setting).', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		return $this->writer()->trash_course( (int) $a['course_id'], $a['course_version'] ?? null, ! empty( $a['force'] ) );
	}


	// Curriculum writes.

	/** @return array|WP_Error */
	protected function op_create_topic( array $a ) {
		return $this->writer()->create_topic( (int) $a['course_id'], $a['course_version'] ?? null, ! empty( $a['force'] ), (string) $a['title'], (string) ( $a['summary'] ?? '' ) );
	}

	/** @return array|WP_Error */
	protected function op_update_topic( array $a ) {
		$c = array_intersect_key( $a, array_flip( array( 'title', 'summary' ) ) );
		if ( ! $c ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass title or summary.', 'emcp-tools' ) );
		}
		return $this->writer()->update_topic( (int) $a['topic_id'], $a['course_version'] ?? null, ! empty( $a['force'] ), $c );
	}

	/** @return array|WP_Error */
	protected function op_delete_topic( array $a ) {
		return $this->writer()->delete_topic( (int) $a['topic_id'], $a['course_version'] ?? null, ! empty( $a['force'] ) );
	}

	/** @return true|WP_Error */
	protected static function check_lesson_fields( array $c ) {
		if ( isset( $c['video'] ) && '' === (string) ( $c['video']['source'] ?? '' ) ) {
			return new WP_Error( 'invalid_argument', __( 'video needs a source (youtube, vimeo, external_url, html5, embedded, shortcode).', 'emcp-tools' ) );
		}
		foreach ( (array) ( $c['attachments'] ?? array() ) as $v ) {
			if ( ! is_int( $v ) && ! ( is_string( $v ) && ctype_digit( $v ) ) ) {
				return new WP_Error( 'invalid_argument', __( 'attachments must be a list of attachment ids.', 'emcp-tools' ) );
			}
		}
		return true;
	}

	/** @return array|WP_Error */
	protected function op_create_lesson( array $a ) {
		$c  = array_intersect_key( $a, array_flip( array( 'title', 'content', 'video', 'attachments', 'thumbnail_id' ) ) );
		$ok = self::check_lesson_fields( $c );
		return is_wp_error( $ok ) ? $ok : $this->writer()->create_lesson( (int) $a['topic_id'], $a['course_version'] ?? null, ! empty( $a['force'] ), $c );
	}

	/** @return array|WP_Error */
	protected function op_update_lesson( array $a ) {
		$c = array_intersect_key( $a, array_flip( array( 'title', 'content', 'video', 'attachments', 'thumbnail_id' ) ) );
		if ( ! $c ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		$ok = self::check_lesson_fields( $c );
		return is_wp_error( $ok ) ? $ok : $this->writer()->update_lesson( (int) $a['lesson_id'], $a['version'] ?? null, ! empty( $a['force'] ), $c );
	}

	/** @return array|WP_Error */
	protected function op_delete_lesson( array $a ) {
		return $this->writer()->delete_lesson( (int) $a['lesson_id'], $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	/** @return array|WP_Error */
	protected function op_reorder_contents( array $a ) {
		return $this->writer()->reorder( (int) $a['course_id'], $a['course_version'] ?? null, ! empty( $a['force'] ), (array) $a['topics'] );
	}


	// Quizzes.

	/** @return array|WP_Error */
	protected function op_save_quiz( array $a ) {
		if ( isset( $a['questions'] ) ) {
			foreach ( (array) $a['questions'] as $q ) {
				if ( ! is_array( $q ) || ( isset( $q['answers'] ) && ! is_array( $q['answers'] ) ) ) {
					return new WP_Error( 'invalid_argument', __( 'questions must be a list of {title, type, mark, answers: [...]}.', 'emcp-tools' ) );
				}
			}
		}
		$req   = array_intersect_key( $a, array_flip( array( 'title', 'summary', 'options', 'questions' ) ) );
		$quiz  = isset( $a['quiz_id'] ) ? (int) $a['quiz_id'] : null;
		$topic = isset( $a['topic_id'] ) ? (int) $a['topic_id'] : null;
		$ver   = $quiz ? ( $a['version'] ?? null ) : ( $a['course_version'] ?? null );
		return $this->writer()->save_quiz( $topic, $quiz, $ver, ! empty( $a['force'] ), $req );
	}

	/** @return array|WP_Error */
	protected function op_delete_quiz( array $a ) {
		return $this->writer()->delete_quiz( (int) $a['quiz_id'], $a['version'] ?? null, ! empty( $a['force'] ) );
	}


	// Enrolments.

	/** @return array|WP_Error */
	protected function op_enrol_student( array $a ) {
		return $this->writer()->enrol_student( (int) $a['course_id'], (int) $a['user_id'] );
	}

	/** @return array|WP_Error */
	protected function op_cancel_enrolment( array $a ) {
		return $this->writer()->cancel_enrolment( (int) $a['course_id'], (int) $a['user_id'] );
	}

}
