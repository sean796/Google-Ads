<?php
/**
 * LifterLMS (free) integration: the lifterlms-read and lifterlms-write dispatcher tools. Operation
 * rows live in ops/lifterlms-read.php and ops/lifterlms-write.php; each row names its own rule
 * (cap_*) and handler (op_*). Every LifterLMS call goes through EMCP_Tools_LifterLMS_Api (which
 * runs LifterLMS's own lifterlms/* abilities, D2); every write goes through
 * EMCP_Tools_LifterLMS_Writer.
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
class EMCP_Tools_LifterLMS_Integration {

	/** Courses and memberships per page. */
	const PER_PAGE = 20;

	/** Enrolments per page. */
	const ENROLMENTS_PER_PAGE = 50;

	/** Fields that change on their own (dates, links) and never enter a version (spike item 8). */
	const VOLATILE = array( 'date_created', 'date_created_gmt', 'date_updated', 'date_updated_gmt', 'permalink', '_links', 'post_type', 'meta' );

	/** @var EMCP_Tools_LifterLMS_Api|null Test seam. */
	private static $api_override = null;

	/** @var string[] */
	private $ability_names = array();

	public static function use_api( ?EMCP_Tools_LifterLMS_Api $api ): void {
		self::$api_override = $api;
	}

	public static function lifterlms_active(): bool {
		return function_exists( 'llms' );
	}

	public static function shared_api(): EMCP_Tools_LifterLMS_Api {
		return self::$api_override ? self::$api_override : new EMCP_Tools_LifterLMS_Api();
	}

	protected function api(): EMCP_Tools_LifterLMS_Api {
		return self::shared_api();
	}

	/** @return string[] */
	public function get_ability_names(): array {
		return $this->ability_names;
	}

	public function check_permission(): bool {
		return $this->api()->can( 'edit_courses' ) || $this->api()->can( 'manage_lifterlms' );
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
			'emcp-tools/lifterlms-read'  => array(
				'label'       => __( 'LifterLMS Read', 'emcp-tools' ),
				'description' => __( 'Read LifterLMS: the setup and allowed operations, courses with their curriculum (sections, lessons, quizzes) and version, a lesson, a quiz with its questions, memberships, access plans, the students of a course or membership, and one student\'s progress. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_read',
				'operation'   => __( 'The read operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
			),
			'emcp-tools/lifterlms-write' => array(
				'label'       => __( 'LifterLMS Write', 'emcp-tools' ),
				'description' => __( 'Build LifterLMS courses: create and change courses (only the fields you pass change), publish them, move them to the trash, add and change sections, lessons and quizzes (with questions and choices), set the curriculum order, give courses and memberships access plans, create memberships, and enrol or un-enrol students. Every write to an existing course needs the version from get-course. Disabled by default; enable under Neo EMCP > Tools > Plugins > LifterLMS. Trashing, deleting and cancelling need confirm:true. Every write can be undone in History. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_write',
				'operation'   => __( 'The write operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => false, 'destructive' => true, 'idempotent' => false ),
			),
		);
		if ( ! $this->api()->supported() ) {
			unset( $tools['emcp-tools/lifterlms-write'] );
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
		$ops = (array) require __DIR__ . '/ops/lifterlms-' . $mode . '.php';
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
			return new WP_Error( 'lifterlms_inactive', __( 'LifterLMS is not active.', 'emcp-tools' ) );
		}
		$ops = $this->operations( $mode );
		if ( ! isset( $ops[ $name ] ) ) {
			if ( ! $this->api()->supported() ) {
				/* translators: %s: LifterLMS version. */
				return new WP_Error( 'lifterlms_unsupported_version', sprintf( __( 'This LifterLMS version (%s) is not supported yet; EMCP works with LifterLMS 10.1 to 10.x and its abilities.', 'emcp-tools' ), $this->api()->version_string() ) );
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

	// Rules (D5): LifterLMS's own, checked early here and again by its abilities.

	protected static function forbidden(): WP_Error {
		return new WP_Error( 'forbidden', __( 'You are not allowed to do this in LifterLMS.', 'emcp-tools' ), array( 'status' => 403 ) );
	}

	protected static function not_found( string $what, int $id ): WP_Error {
		/* translators: 1: what (course, lesson, ...), 2: id. */
		return new WP_Error( 'not_found', sprintf( __( 'There is no %1$s %2$d.', 'emcp-tools' ), $what, $id ), array( 'status' => 404 ) );
	}

	/** @return true|WP_Error */
	protected function cap_builder( array $args ) {
		return $this->check_permission() ? true : self::forbidden();
	}

	/** @return true|WP_Error */
	protected function cap_post( int $id, string $type, string $what ) {
		if ( $type !== $this->api()->post_type( $id ) || 'trash' === $this->api()->post_status( $id ) && 'course' !== $type ) {
			return self::not_found( $what, $id );
		}
		return $this->api()->can_edit( $id ) ? true : self::forbidden();
	}

	/** @return true|WP_Error */
	protected function cap_course( array $args ) {
		return $this->cap_post( (int) ( $args['course_id'] ?? 0 ), 'course', 'course' );
	}

	/** @return true|WP_Error */
	protected function cap_section( array $args ) {
		return $this->cap_post( (int) ( $args['section_id'] ?? 0 ), 'section', 'section' );
	}

	/** @return true|WP_Error */
	protected function cap_lesson( array $args ) {
		return $this->cap_post( (int) ( $args['lesson_id'] ?? 0 ), 'lesson', 'lesson' );
	}

	/** @return true|WP_Error */
	protected function cap_quiz( array $args ) {
		return $this->cap_post( (int) ( $args['quiz_id'] ?? 0 ), 'llms_quiz', 'quiz' );
	}

	/** save-quiz: the quiz when replacing, else the lesson it goes on. @return true|WP_Error */
	protected function cap_quiz_target( array $args ) {
		if ( isset( $args['quiz_id'] ) ) {
			return $this->cap_quiz( $args );
		}
		if ( ! isset( $args['lesson_id'] ) ) {
			return new WP_Error( 'missing_argument', __( 'Pass lesson_id to create a quiz, or quiz_id to change one.', 'emcp-tools' ) );
		}
		return $this->cap_lesson( $args );
	}

	/** @return true|WP_Error */
	protected function cap_membership( array $args ) {
		return $this->cap_post( (int) ( $args['membership_id'] ?? 0 ), 'llms_membership', 'membership' );
	}

	/** A course or a membership (post_id). @return true|WP_Error */
	protected function cap_product( array $args ) {
		$id   = (int) ( $args['post_id'] ?? 0 );
		$type = $this->api()->post_type( $id );
		if ( ! in_array( $type, array( 'course', 'llms_membership' ), true ) ) {
			return self::not_found( 'course or membership', $id );
		}
		return $this->cap_post( $id, $type, 'course' === $type ? 'course' : 'membership' );
	}

	/** @return true|WP_Error */
	protected function cap_plan( array $args ) {
		return $this->cap_post( (int) ( $args['plan_id'] ?? 0 ), 'llms_access_plan', 'access plan' );
	}

	/** save-access-plan: the plan when changing, else its course or membership. @return true|WP_Error */
	protected function cap_plan_target( array $args ) {
		if ( isset( $args['plan_id'] ) ) {
			return $this->cap_plan( $args );
		}
		if ( ! isset( $args['post_id'] ) ) {
			return new WP_Error( 'missing_argument', __( 'Pass post_id (a course or membership) to create a plan, or plan_id to change one.', 'emcp-tools' ) );
		}
		return $this->cap_product( $args );
	}

	/** LifterLMS's enroll capability on a course or membership (instructors have none, spike item 24). @return true|WP_Error */
	protected function cap_enrol( array $args ) {
		$can = $this->cap_product( $args );
		if ( is_wp_error( $can ) ) {
			return $can;
		}
		if ( ! $this->api()->can_enrol() ) {
			return self::forbidden();
		}
		return $this->api()->user( (int) ( $args['user_id'] ?? 0 ) ) ? true : self::not_found( 'user', (int) ( $args['user_id'] ?? 0 ) );
	}

	// Views and versions (spec section 3).

	/** A REST answer as agent-facing fields: raw values, volatile fields dropped. */
	public static function fields( array $rest ): array {
		$out = array();
		foreach ( $rest as $k => $v ) {
			if ( in_array( $k, self::VOLATILE, true ) ) {
				continue;
			}
			$out[ $k ] = ( is_array( $v ) && array_key_exists( 'raw', $v ) ) ? $v['raw'] : $v;
		}
		return $out;
	}

	/** @return array|WP_Error {fields, curriculum, orphans, plans, version} */
	public static function state_of( EMCP_Tools_LifterLMS_Api $api, int $course ) {
		$c = $api->run( 'get-course', array( 'id' => $course ) );
		if ( is_wp_error( $c ) ) {
			return 'llms_rest_not_found' === $c->get_error_code() ? self::not_found( 'course', $course ) : $c;
		}
		$fields     = self::fields( $c );
		$curriculum = self::curriculum( $api, $course );
		if ( is_wp_error( $curriculum ) ) {
			return $curriculum;
		}
		$orphans = $api->orphan_lessons( $course );
		$plans   = self::plans( $api, $course );
		if ( is_wp_error( $plans ) ) {
			return $plans;
		}
		return array(
			'fields'     => $fields,
			'curriculum' => $curriculum,
			'orphans'    => $orphans,
			'plans'      => $plans,
			'version'    => EMCP_Tools_LifterLMS_Api::version( array( 'fields' => $fields, 'curriculum' => $curriculum, 'orphans' => $orphans, 'plans' => $plans ) ),
		);
	}

	/** Sections in order with their lessons in order and each lesson's quiz id. @return array|WP_Error */
	public static function curriculum( EMCP_Tools_LifterLMS_Api $api, int $course ) {
		$sections = $api->run( 'get-course-content', array( 'id' => $course ) );
		if ( is_wp_error( $sections ) ) {
			return 'llms_rest_not_found' === $sections->get_error_code() ? array() : $sections;
		}
		$out = array();
		foreach ( (array) $sections as $s ) {
			$lessons = $api->run( 'list-lessons', array( 'parent' => (int) $s['id'], 'per_page' => 100, 'status' => 'any' ) );
			if ( is_wp_error( $lessons ) ) {
				if ( 'llms_rest_not_found' !== $lessons->get_error_code() ) {
					return $lessons;
				}
				$lessons = array();
			}
			$rows = array();
			foreach ( (array) $lessons as $l ) {
				$rows[] = array(
					'id'      => (int) $l['id'],
					'title'   => (string) self::raw( $l['title'] ?? '' ),
					'order'   => (int) ( $l['order'] ?? 0 ),
					'status'  => (string) ( $l['status'] ?? '' ),
					'quiz_id' => ! empty( $l['quiz']['enabled'] ) ? (int) ( $l['quiz']['id'] ?? 0 ) : 0,
				);
			}
			usort( $rows, static fn( $a, $b ) => array( $a['order'], $a['id'] ) <=> array( $b['order'], $b['id'] ) );
			$out[] = array( 'id' => (int) $s['id'], 'title' => (string) self::raw( $s['title'] ?? '' ), 'order' => (int) ( $s['order'] ?? 0 ), 'lessons' => $rows );
		}
		usort( $out, static fn( $a, $b ) => array( $a['order'], $a['id'] ) <=> array( $b['order'], $b['id'] ) );
		return $out;
	}

	/** Access plans of a course or membership with their full contents (D19). @return array|WP_Error */
	public static function plans( EMCP_Tools_LifterLMS_Api $api, int $product ) {
		$plans = $api->run( 'list-access-plans', array( 'post_id' => $product, 'per_page' => 100 ) );
		if ( is_wp_error( $plans ) ) {
			return 'llms_rest_not_found' === $plans->get_error_code() ? array() : $plans;
		}
		$out = array_map( array( __CLASS__, 'fields' ), (array) $plans );
		usort( $out, static fn( $a, $b ) => (int) $a['id'] <=> (int) $b['id'] );
		return $out;
	}

	private static function raw( $v ) {
		return is_array( $v ) && array_key_exists( 'raw', $v ) ? $v['raw'] : $v;
	}

	/** @return array|WP_Error {fields, version} */
	public static function lesson_state( EMCP_Tools_LifterLMS_Api $api, int $lesson ) {
		$l = $api->run( 'get-lesson', array( 'id' => $lesson ) );
		if ( is_wp_error( $l ) ) {
			return 'llms_rest_not_found' === $l->get_error_code() ? self::not_found( 'lesson', $lesson ) : $l;
		}
		$f = self::fields( $l );
		return array( 'fields' => $f, 'version' => EMCP_Tools_LifterLMS_Api::version( $f ) );
	}

	/** @return array|WP_Error {fields, questions, version} */
	public static function quiz_state( EMCP_Tools_LifterLMS_Api $api, int $quiz ) {
		$q = $api->run( 'get-quiz', array( 'id' => $quiz ) );
		if ( is_wp_error( $q ) ) {
			return 'llms_rest_not_found' === $q->get_error_code() ? self::not_found( 'quiz', $quiz ) : $q;
		}
		$questions = $api->run( 'get-quiz-questions', array( 'id' => $quiz, 'per_page' => 100 ) );
		if ( is_wp_error( $questions ) ) {
			if ( 'llms_rest_not_found' !== $questions->get_error_code() ) {
				return $questions;
			}
			$questions = array();
		}
		$f    = self::fields( $q );
		$list = array();
		foreach ( (array) $questions as $x ) {
			$x       = self::fields( $x );
			$choices = array();
			foreach ( (array) ( $x['choices'] ?? array() ) as $c ) {
				$choices[] = array( 'id' => (string) ( $c['id'] ?? '' ), 'choice' => $c['choice'] ?? '', 'correct' => ! empty( $c['correct'] ), 'choice_type' => (string) ( $c['choice_type'] ?? 'text' ) );
			}
			$x['choices'] = $choices;
			$list[]       = $x;
		}
		usort( $list, static fn( $a, $b ) => array( (int) ( $a['menu_order'] ?? 0 ), (int) $a['id'] ) <=> array( (int) ( $b['menu_order'] ?? 0 ), (int) $b['id'] ) );
		return array( 'fields' => $f, 'questions' => $list, 'version' => EMCP_Tools_LifterLMS_Api::version( array( 'fields' => $f, 'questions' => $list ) ) );
	}

	/** @return array|WP_Error {fields, plans, version} */
	public static function membership_state( EMCP_Tools_LifterLMS_Api $api, int $membership ) {
		$m = $api->run( 'get-membership', array( 'id' => $membership ) );
		if ( is_wp_error( $m ) ) {
			return 'llms_rest_not_found' === $m->get_error_code() ? self::not_found( 'membership', $membership ) : $m;
		}
		$f     = self::fields( $m );
		$plans = self::plans( $api, $membership );
		if ( is_wp_error( $plans ) ) {
			return $plans;
		}
		return array( 'fields' => $f, 'plans' => $plans, 'version' => EMCP_Tools_LifterLMS_Api::version( array( 'fields' => $f, 'plans' => $plans ) ) );
	}

	protected function edit_url( int $id ): string {
		return admin_url( 'post.php?post=' . $id . '&action=edit' );
	}

	// Read handlers.

	/** @return array */
	protected function op_get_setup( array $a ) {
		$api   = $this->api();
		$types = array_values( array_intersect( EMCP_Tools_LifterLMS_Api::FREE_QUESTION_TYPES, array_keys( $api->question_types() ) ) );
		$write = array();
		foreach ( (array) require __DIR__ . '/ops/lifterlms-write.php' as $name => $op ) {
			if ( 'cap_enrol' === $op['cap'] && ! $api->can_enrol() ) {
				continue;
			}
			$write[] = $name;
		}
		return array(
			'lifterlms_version'  => $api->version_string(),
			'supported'          => $api->supported(),
			'question_types'     => $types,
			'difficulties'       => $api->supported() ? $api->difficulties() : array(),
			'categories'         => $api->supported() ? $api->categories() : array(),
			'may_enrol'          => $api->can_enrol(),
			'allowed_operations' => $api->supported() ? $write : array(),
		);
	}

	/** @return array|WP_Error */
	protected function op_list_courses( array $a ) {
		$api   = $this->api();
		$query = array( 'per_page' => self::PER_PAGE, 'page' => (int) ( $a['page'] ?? 1 ) );
		foreach ( array( 'search', 'status' ) as $k ) {
			if ( isset( $a[ $k ] ) ) {
				$query[ $k ] = $a[ $k ];
			}
		}
		$rows = $api->run( 'list-courses', $query );
		if ( is_wp_error( $rows ) ) {
			return 'llms_rest_not_found' === $rows->get_error_code() ? array( 'courses' => array(), 'page' => $query['page'] ) : $rows;
		}
		$out = array();
		foreach ( (array) $rows as $r ) {
			$id = (int) $r['id'];
			if ( ! $api->can( 'manage_lifterlms' ) && ! $api->can_edit( $id ) ) {
				continue;
			}
			$cur      = self::curriculum( $api, $id );
			$sections = is_wp_error( $cur ) ? 0 : count( $cur );
			$lessons  = is_wp_error( $cur ) ? 0 : array_sum( array_map( static fn( $s ) => count( $s['lessons'] ), $cur ) );
			$out[]    = array(
				'id'          => $id,
				'title'       => (string) self::raw( $r['title'] ?? '' ),
				'status'      => (string) ( $r['status'] ?? '' ),
				'sections'    => $sections,
				'lessons'     => $lessons,
				'students'    => $api->student_count( $id ),
				'instructors' => array_map( 'intval', (array) ( $r['instructors'] ?? array() ) ),
				'url'         => (string) ( $r['permalink'] ?? '' ),
				'edit_url'    => $this->edit_url( $id ),
			);
		}
		return array( 'courses' => $out, 'page' => $query['page'], 'more' => count( (array) $rows ) === self::PER_PAGE );
	}

	/** @return array|WP_Error */
	protected function op_get_course( array $a ) {
		$id    = (int) $a['course_id'];
		$state = self::state_of( $this->api(), $id );
		if ( is_wp_error( $state ) ) {
			return $state;
		}
		return array(
			'course'       => $state['fields'],
			'curriculum'   => $state['curriculum'],
			'orphans'      => $state['orphans'],
			'access_plans' => $state['plans'],
			'instructors'  => array_map( 'intval', (array) ( $state['fields']['instructors'] ?? array() ) ),
			'students'     => $this->api()->student_count( $id ),
			'version'      => $state['version'],
			'url'          => get_permalink( $id ) ? (string) get_permalink( $id ) : '',
			'edit_url'     => $this->edit_url( $id ),
		);
	}

	/** @return array|WP_Error */
	protected function op_get_lesson( array $a ) {
		$state = self::lesson_state( $this->api(), (int) $a['lesson_id'] );
		if ( is_wp_error( $state ) ) {
			return $state;
		}
		$f    = $state['fields'];
		$view = $f + array(
			'section_id' => (int) ( $f['parent_id'] ?? 0 ),
			'quiz_id'    => ! empty( $f['quiz']['enabled'] ) ? (int) ( $f['quiz']['id'] ?? 0 ) : 0,
		);
		return array( 'lesson' => $view, 'version' => $state['version'] );
	}

	/** @return array|WP_Error */
	protected function op_get_quiz( array $a ) {
		$id    = (int) $a['quiz_id'];
		$state = self::quiz_state( $this->api(), $id );
		if ( is_wp_error( $state ) ) {
			return $state;
		}
		return array( 'quiz' => $state['fields'] + array( 'questions' => $state['questions'] ), 'attempts' => $this->api()->quiz_attempts( $id ), 'version' => $state['version'] );
	}

	/** @return array|WP_Error */
	protected function op_list_memberships( array $a ) {
		$api   = $this->api();
		$query = array( 'per_page' => self::PER_PAGE, 'page' => (int) ( $a['page'] ?? 1 ) );
		foreach ( array( 'search', 'status' ) as $k ) {
			if ( isset( $a[ $k ] ) ) {
				$query[ $k ] = $a[ $k ];
			}
		}
		$rows = $api->run( 'list-memberships', $query );
		if ( is_wp_error( $rows ) ) {
			return 'llms_rest_not_found' === $rows->get_error_code() ? array( 'memberships' => array(), 'page' => $query['page'] ) : $rows;
		}
		$out = array();
		foreach ( (array) $rows as $r ) {
			$id    = (int) $r['id'];
			$out[] = array( 'id' => $id, 'title' => (string) self::raw( $r['title'] ?? '' ), 'status' => (string) ( $r['status'] ?? '' ), 'auto_enroll' => array_map( 'intval', (array) ( $r['auto_enroll'] ?? array() ) ), 'students' => $api->student_count( $id ) );
		}
		return array( 'memberships' => $out, 'page' => $query['page'], 'more' => count( (array) $rows ) === self::PER_PAGE );
	}

	/** @return array|WP_Error */
	protected function op_get_membership( array $a ) {
		$id    = (int) $a['membership_id'];
		$state = self::membership_state( $this->api(), $id );
		if ( is_wp_error( $state ) ) {
			return $state;
		}
		return array( 'membership' => $state['fields'], 'access_plans' => $state['plans'], 'students' => $this->api()->student_count( $id ), 'version' => $state['version'], 'edit_url' => $this->edit_url( $id ) );
	}

	/** @return array|WP_Error */
	protected function op_list_access_plans( array $a ) {
		$plans = self::plans( $this->api(), (int) $a['post_id'] );
		return is_wp_error( $plans ) ? $plans : array( 'post_id' => (int) $a['post_id'], 'access_plans' => $plans );
	}

	/** Statuses through the model (D10). @return array */
	protected function op_list_enrolments( array $a ) {
		$api   = $this->api();
		$post  = (int) $a['post_id'];
		$page  = max( 1, (int) ( $a['page'] ?? 1 ) );
		$list  = $api->enrolled_users( $post, $a['status'] ?? null, $page, self::ENROLMENTS_PER_PAGE );
		$email = $api->can( 'list_users' );
		$rows  = array();
		foreach ( $list['items'] as $uid ) {
			$u   = $api->user( (int) $uid );
			$row = array( 'user_id' => (int) $uid, 'display_name' => (string) ( $u['name'] ?? '' ) );
			if ( $email ) {
				$row['email'] = (string) ( $u['email'] ?? '' );
			}
			$row['status']  = $api->enrollment_status( (int) $uid, $post );
			$row['trigger'] = $api->enrollment_trigger( (int) $uid, $post );
			$rows[]         = $row;
		}
		return array( 'post_id' => $post, 'enrolments' => $rows, 'total' => (int) $list['total'], 'page' => $page );
	}

	/** @return array|WP_Error */
	protected function op_get_student_progress( array $a ) {
		$api    = $this->api();
		$course = (int) $a['course_id'];
		$user   = (int) $a['user_id'];
		if ( ! $api->user( $user ) ) {
			return self::not_found( 'user', $user );
		}
		$p      = $api->run( 'get-progress', array( 'id' => $user, 'post_id' => $course ) );
		$grades = $api->run( 'get-student-grades', array( 'id' => $user, 'course' => $course ) );
		return array(
			'course_id'         => $course,
			'user_id'           => $user,
			'status'            => $api->enrollment_status( $user, $course ),
			'progress'          => is_wp_error( $p ) ? 0 : (int) ( $p['progress'] ?? 0 ),
			'completed_lessons' => $api->completed_lessons( $user, $course ),
			'grades'            => is_wp_error( $grades ) ? array() : $grades,
		);
	}

	// Write handlers: courses and memberships (spec 4.2).

	protected function writer(): EMCP_Tools_LifterLMS_Writer {
		return new EMCP_Tools_LifterLMS_Writer( $this->api() );
	}

	/** The fields a call names, without the control arguments. */
	protected static function changes( array $a, array $control ): array {
		return array_diff_key( $a, array_flip( array_merge( array( 'force', 'course_version', 'membership_version', 'version' ), $control ) ) );
	}

	/** @return array|WP_Error */
	protected function op_create_course( array $a, bool $dry_run ) {
		return $this->writer()->create_product( 'course', self::changes( $a, array() ), $dry_run );
	}

	/** @return array|WP_Error */
	protected function op_update_course( array $a, bool $dry_run ) {
		$changes = self::changes( $a, array( 'course_id' ) );
		if ( ! $changes ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		return $this->writer()->update_product( 'course', (int) $a['course_id'], $a['course_version'] ?? null, ! empty( $a['force'] ), $changes, 'update-course', $dry_run );
	}

	/** @return array|WP_Error */
	protected function op_set_course_status( array $a ) {
		return $this->writer()->update_product( 'course', (int) $a['course_id'], $a['course_version'] ?? null, ! empty( $a['force'] ), array( 'status' => $a['status'] ), 'set-course-status', false );
	}

	/** @return array|WP_Error */
	protected function op_trash_course( array $a ) {
		return $this->writer()->trash_product( 'course', (int) $a['course_id'], $a['course_version'] ?? null, ! empty( $a['force'] ) );
	}

	/** @return array|WP_Error */
	protected function op_create_membership( array $a ) {
		return $this->writer()->create_product( 'membership', self::changes( $a, array() ), false );
	}

	/** @return array|WP_Error */
	protected function op_update_membership( array $a ) {
		$changes = self::changes( $a, array( 'membership_id' ) );
		if ( ! $changes ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		return $this->writer()->update_product( 'membership', (int) $a['membership_id'], $a['membership_version'] ?? null, ! empty( $a['force'] ), $changes, 'update-membership', false );
	}

	/** @return array|WP_Error */
	protected function op_trash_membership( array $a ) {
		return $this->writer()->trash_product( 'membership', (int) $a['membership_id'], $a['membership_version'] ?? null, ! empty( $a['force'] ) );
	}

	// Write handlers: curriculum (spec 4.2).

	/** @return array|WP_Error */
	protected function op_create_section( array $a ) {
		return $this->writer()->create_section( (int) $a['course_id'], $a['course_version'] ?? null, ! empty( $a['force'] ), self::changes( $a, array( 'course_id' ) ) );
	}

	/** @return array|WP_Error */
	protected function op_update_section( array $a ) {
		$changes = self::changes( $a, array( 'section_id' ) );
		if ( ! $changes ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass title or order.', 'emcp-tools' ) );
		}
		return $this->writer()->update_section( (int) $a['section_id'], $a['course_version'] ?? null, ! empty( $a['force'] ), $changes );
	}

	/** @return array|WP_Error */
	protected function op_delete_section( array $a ) {
		return $this->writer()->delete_section( (int) $a['section_id'], $a['course_version'] ?? null, ! empty( $a['force'] ) );
	}

	/** @return array|WP_Error */
	protected function op_create_lesson( array $a ) {
		return $this->writer()->create_lesson( (int) $a['section_id'], $a['course_version'] ?? null, ! empty( $a['force'] ), self::changes( $a, array( 'section_id' ) ) );
	}

	/** @return array|WP_Error */
	protected function op_update_lesson( array $a ) {
		$changes = self::changes( $a, array( 'lesson_id' ) );
		if ( ! $changes ) {
			return new WP_Error( 'nothing_to_change', __( 'Pass at least one field to change.', 'emcp-tools' ) );
		}
		return $this->writer()->update_lesson( (int) $a['lesson_id'], $a['version'] ?? null, ! empty( $a['force'] ), $changes );
	}

	/** @return array|WP_Error */
	protected function op_trash_lesson( array $a ) {
		return $this->writer()->trash_lesson( (int) $a['lesson_id'], $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	/** @return array|WP_Error */
	protected function op_reorder_curriculum( array $a ) {
		return $this->writer()->reorder( (int) $a['course_id'], $a['course_version'] ?? null, ! empty( $a['force'] ), (array) $a['sections'] );
	}

	// Write handlers: quizzes (spec 4.2).

	/** @return array|WP_Error */
	protected function op_save_quiz( array $a ) {
		$req = array_intersect_key( $a, array_flip( array( 'title', 'content', 'settings', 'questions' ) ) );
		return $this->writer()->save_quiz( isset( $a['lesson_id'] ) ? (int) $a['lesson_id'] : null, isset( $a['quiz_id'] ) ? (int) $a['quiz_id'] : null, $a['course_version'] ?? null, $a['version'] ?? null, ! empty( $a['force'] ), $req );
	}

	/** @return array|WP_Error */
	protected function op_trash_quiz( array $a ) {
		return $this->writer()->trash_quiz( (int) $a['quiz_id'], $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	// Write handlers: access plans (spec 4.2, D19).

	/** @return array|WP_Error */
	protected function op_save_access_plan( array $a ) {
		$versions = array_intersect_key( $a, array( 'course_version' => 1, 'membership_version' => 1 ) );
		return $this->writer()->save_plan( isset( $a['post_id'] ) ? (int) $a['post_id'] : null, isset( $a['plan_id'] ) ? (int) $a['plan_id'] : null, $versions, ! empty( $a['force'] ), self::changes( $a, array( 'post_id', 'plan_id' ) ) );
	}

	/** @return array|WP_Error */
	protected function op_delete_access_plan( array $a ) {
		$versions = array_intersect_key( $a, array( 'course_version' => 1, 'membership_version' => 1 ) );
		return $this->writer()->delete_plan( (int) $a['plan_id'], $versions, ! empty( $a['force'] ) );
	}

	// Write handlers: enrolments (spec 4.2, D18).

	/** @return array|WP_Error */
	protected function op_enrol_student( array $a ) {
		return $this->writer()->enrol( (int) $a['post_id'], (int) $a['user_id'] );
	}

	/** @return array|WP_Error */
	protected function op_cancel_enrolment( array $a ) {
		return $this->writer()->cancel( (int) $a['post_id'], (int) $a['user_id'] );
	}
}
