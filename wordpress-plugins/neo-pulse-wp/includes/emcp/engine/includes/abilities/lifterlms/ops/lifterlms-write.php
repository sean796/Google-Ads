<?php
/**
 * lifterlms-write operations. Row keys: desc, args (EMCP_Tools_Op_Args schema), cap (a cap_* rule
 * of EMCP_Tools_LifterLMS_Integration), run (handler method), confirm, dry_run, nullable
 * (arguments where an explicit null clears the field), undo (catalog note).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$course_fields = array(
	'content'                   => 'string',
	'excerpt'                   => 'string',
	'status'                    => 'enum:draft,pending,publish,private',
	'catalog_visibility'        => 'enum:catalog_search,catalog,search,hidden',
	'categories'                => 'array',
	'tags'                      => 'array',
	'difficulties'              => 'array',
	'tracks'                    => 'array',
	'instructors'               => 'array',
	'featured_media'            => 'uint',
	'video_embed'               => 'string',
	'audio_embed'               => 'string',
	'video_tile'                => 'bool',
	'length'                    => 'string',
	'capacity_enabled'          => 'bool',
	'capacity_limit'            => 'uint',
	'capacity_message'          => 'string',
	'prerequisite'              => 'int',
	'prerequisite_track'        => 'int',
	'restricted_message'        => 'string',
	'access_opens_date'         => 'string',
	'access_closes_date'        => 'string',
	'access_opens_message'      => 'string',
	'access_closes_message'     => 'string',
	'enrollment_opens_date'     => 'string',
	'enrollment_closes_date'    => 'string',
	'enrollment_opens_message'  => 'string',
	'enrollment_closes_message' => 'string',
	'sales_page_type'           => 'enum:none,content,page,url',
	'sales_page_page_id'        => 'int',
	'sales_page_url'            => 'string',
);

$lesson_fields = array(
	'content'        => 'string',
	'excerpt'        => 'string',
	'status'         => 'enum:draft,pending,publish,private',
	'video_embed'    => 'string',
	'audio_embed'    => 'string',
	'featured_media' => 'uint',
	'drip_method'    => 'enum:none,date,enrollment,start,prerequisite',
	'drip_days'      => 'uint',
	'drip_date'      => 'string',
	'prerequisite'   => 'int',
	'points'         => 'uint',
	'public'         => 'bool',
);

$plan_fields = array(
	'title'                     => 'string',
	'content'                   => 'string',
	'price'                     => 'number',
	'frequency'                 => 'uint',
	'length'                    => 'uint',
	'period'                    => 'enum:year,month,week,day',
	'trial_enabled'             => 'bool',
	'trial_price'               => 'number',
	'trial_length'              => 'uint',
	'trial_period'              => 'enum:year,month,week,day',
	'sale_enabled'              => 'bool',
	'sale_price'                => 'number',
	'sale_date_start'           => 'string',
	'sale_date_end'             => 'string',
	'access_expiration'         => 'enum:lifetime,limited-period,limited-date',
	'access_expires'            => 'string',
	'access_length'             => 'uint',
	'access_period'             => 'enum:year,month,week,day',
	'visibility'                => 'enum:visible,hidden,featured',
	'enroll_text'               => 'string',
	'availability_restrictions' => 'array',
);

$membership_fields = array(
	'content'             => 'string',
	'excerpt'             => 'string',
	'status'              => 'enum:draft,pending,publish,private',
	'auto_enroll'         => 'array',
	'catalog_visibility'  => 'enum:catalog_search,catalog,search,hidden',
	'categories'          => 'array',
	'tags'                => 'array',
	'instructors'         => 'array',
	'restriction_action'  => 'enum:none,custom,page,url',
	'restriction_message' => 'string',
	'restriction_page_id' => 'int',
	'restriction_url'     => 'string',
);

$course_ref = array( 'course_version' => 'string', 'force' => 'bool' );

return array(
	'create-course'      => array(
		'desc'    => 'Create a course (draft unless status says otherwise): title, content (HTML), excerpt, categories, tags, difficulties and tracks (term ids), instructors (user ids, administrators), featured_media, video_embed and audio_embed (URLs), video_tile, length, capacity, prerequisite, access and enrolment dates and messages, sales page. Then add sections, lessons, quizzes and an access plan.',
		'args'    => array( 'title' => 'string!' ) + $course_fields,
		'cap'     => 'cap_builder',
		'run'     => 'op_create_course',
		'dry_run' => true,
	),
	'update-course'      => array(
		'desc'    => 'Change a course: only the fields you pass change (LifterLMS keeps the rest); "" clears a text field. course_version from get-course; a course changed since is a conflict unless force.',
		'args'    => array( 'course_id' => 'int!', 'title' => 'string' ) + $course_ref + $course_fields,
		'cap'     => 'cap_course',
		'run'     => 'op_update_course',
		'dry_run' => true,
	),
	'set-course-status'  => array(
		'desc' => 'Publish, unpublish (draft), set pending or private. course_version.',
		'args' => array( 'course_id' => 'int!', 'status' => 'enum:draft,pending,publish,private!' ) + $course_ref,
		'cap'  => 'cap_course',
		'run'  => 'op_set_course_status',
	),
	'trash-course'       => array(
		'desc'    => 'Move a course to the trash (never deleted permanently: LifterLMS would delete its access plans with it, and refuses with active subscriptions). Its sections and lessons stay. Undo gives it back its earlier status. Needs confirm.',
		'args'    => array( 'course_id' => 'int!' ) + $course_ref,
		'cap'     => 'cap_course',
		'run'     => 'op_trash_course',
		'confirm' => true,
	),
	'create-section'     => array(
		'desc' => 'Add a section to a course: title, order (position, default last). course_version.',
		'args' => array( 'course_id' => 'int!', 'title' => 'string!', 'order' => 'uint' ) + $course_ref,
		'cap'  => 'cap_course',
		'run'  => 'op_create_section',
	),
	'update-section'     => array(
		'desc' => 'Rename a section or move it (order). course_version.',
		'args' => array( 'section_id' => 'int!', 'title' => 'string', 'order' => 'uint' ) + $course_ref,
		'cap'  => 'cap_section',
		'run'  => 'op_update_section',
	),
	'delete-section'     => array(
		'desc'    => 'Delete an empty section (move or trash its lessons first): LifterLMS deletes sections permanently. Undo brings it back with its id. Needs confirm.',
		'args'    => array( 'section_id' => 'int!' ) + $course_ref,
		'cap'     => 'cap_section',
		'run'     => 'op_delete_section',
		'confirm' => true,
	),
	'create-lesson'      => array(
		'desc' => 'Add a lesson to a section: title, content (HTML), excerpt, status, video_embed and audio_embed (URLs), featured_media, drip (method, days, date), prerequisite (lesson id), points, public (free preview), order (default last). course_version.',
		'args' => array( 'section_id' => 'int!', 'title' => 'string!', 'order' => 'uint' ) + $course_ref + $lesson_fields,
		'cap'  => 'cap_section',
		'run'  => 'op_create_lesson',
	),
	'update-lesson'      => array(
		'desc' => 'Change a lesson: only the fields you pass change; section_id and order move it (also to another section of the course). version from get-lesson.',
		'args' => array( 'lesson_id' => 'int!', 'version' => 'string', 'force' => 'bool', 'title' => 'string', 'section_id' => 'int', 'order' => 'uint' ) + $lesson_fields,
		'cap'  => 'cap_lesson',
		'run'  => 'op_update_lesson',
	),
	'trash-lesson'       => array(
		'desc'    => 'Move a lesson to the trash (trash its quiz first). Undo gives it back with its earlier status. Needs confirm.',
		'args'    => array( 'lesson_id' => 'int!', 'version' => 'string', 'force' => 'bool' ),
		'cap'     => 'cap_lesson',
		'run'     => 'op_trash_lesson',
		'confirm' => true,
	),
	'reorder-curriculum' => array(
		'desc' => 'Set the order of a course\'s sections and of the lessons in each: sections [{section_id, lessons: [lesson ids]}], every section and every lesson of the course (orphans included) exactly once; lessons may move between sections. course_version.',
		'args' => array( 'course_id' => 'int!', 'sections' => 'array!' ) + $course_ref,
		'cap'  => 'cap_course',
		'run'  => 'op_reorder_curriculum',
	),
	'save-quiz'          => array(
		'desc' => 'Create a quiz for a lesson (lesson_id, course_version) or replace a quiz (quiz_id, version): title, content, settings {passing_percent, limit_attempts, allowed_attempts (needs limit_attempts true), limit_time, time_limit (minutes, needs limit_time true), show_correct_answer, random_questions, can_be_resumed, disable_retake}, questions in order [{question_id (keep it for questions you keep), title, content, question_type (choice, picture_choice, true_false, content), points, multi_choices, clarifications, choices [{id (keep it), choice, correct}]}]. A question you leave out is removed; questions students have attempted cannot be removed or have their choices changed.',
		'args' => array( 'lesson_id' => 'int', 'quiz_id' => 'int', 'course_version' => 'string', 'version' => 'string', 'force' => 'bool', 'title' => 'string', 'content' => 'string', 'settings' => 'object', 'questions' => 'array' ),
		'cap'  => 'cap_quiz_target',
		'run'  => 'op_save_quiz',
	),
	'trash-quiz'         => array(
		'desc'    => 'Move a quiz with no attempts to the trash and detach it from its lesson (as LifterLMS\'s course builder does); its questions stay with it. Undo links it again. Needs confirm.',
		'args'    => array( 'quiz_id' => 'int!', 'version' => 'string', 'force' => 'bool' ),
		'cap'     => 'cap_quiz',
		'run'     => 'op_trash_quiz',
		'confirm' => true,
	),
	'save-access-plan'   => array(
		'desc' => 'Create (post_id: the course or membership) or change (plan_id) an access plan: title, price (0 = free), frequency (0 = one payment) with length and period, trial, sale, access expiration, visibility, enroll_text. Pass the course\'s course_version or the membership\'s membership_version; it covers every plan\'s contents.',
		'args' => array( 'post_id' => 'int', 'plan_id' => 'int', 'course_version' => 'string', 'membership_version' => 'string', 'force' => 'bool' ) + $plan_fields,
		'cap'  => 'cap_plan_target',
		'run'  => 'op_save_access_plan',
	),
	'delete-access-plan' => array(
		'desc'    => 'Delete an access plan no order uses (LifterLMS has no trash for plans). The parent\'s course_version or membership_version. Undo brings it back with its id. Needs confirm.',
		'args'    => array( 'plan_id' => 'int!', 'course_version' => 'string', 'membership_version' => 'string', 'force' => 'bool' ),
		'cap'     => 'cap_plan',
		'run'     => 'op_delete_access_plan',
		'confirm' => true,
	),
	'create-membership'  => array(
		'desc' => 'Create a membership: title, content, status, auto_enroll (course ids enrolled on joining), restriction settings, catalog visibility, categories, tags, instructors.',
		'args' => array( 'title' => 'string!' ) + $membership_fields,
		'cap'  => 'cap_builder',
		'run'  => 'op_create_membership',
	),
	'update-membership'  => array(
		'desc' => 'Change a membership: only the fields you pass change. membership_version from get-membership.',
		'args' => array( 'membership_id' => 'int!', 'membership_version' => 'string', 'force' => 'bool', 'title' => 'string' ) + $membership_fields,
		'cap'  => 'cap_membership',
		'run'  => 'op_update_membership',
	),
	'trash-membership'   => array(
		'desc'    => 'Move a membership to the trash. Undo gives it back with its earlier status. Needs confirm.',
		'args'    => array( 'membership_id' => 'int!', 'membership_version' => 'string', 'force' => 'bool' ),
		'cap'     => 'cap_membership',
		'run'     => 'op_trash_membership',
		'confirm' => true,
	),
	'enrol-student'      => array(
		'desc' => 'Enrol an existing user (user_id) in a course or membership (post_id). An existing enrolment is reported, not repeated; a cancelled one is set back to enrolled. For a membership LifterLMS also enrols them in its auto-enrol courses; the answer lists them.',
		'args' => array( 'post_id' => 'int!', 'user_id' => 'int!' ),
		'cap'  => 'cap_enrol',
		'run'  => 'op_enrol_student',
	),
	'cancel-enrolment'   => array(
		'desc'    => 'Cancel a student\'s enrolment in a course or membership (their progress is kept). For a membership LifterLMS also cancels the course enrolments it gave, or hands them to another membership that covers the course; the answer lists them. Needs confirm.',
		'args'    => array( 'post_id' => 'int!', 'user_id' => 'int!' ),
		'cap'     => 'cap_enrol',
		'run'     => 'op_cancel_enrolment',
		'confirm' => true,
	),
);
