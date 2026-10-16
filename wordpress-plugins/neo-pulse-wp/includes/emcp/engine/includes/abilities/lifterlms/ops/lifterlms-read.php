<?php
/**
 * lifterlms-read operations. Row keys: desc, args (EMCP_Tools_Op_Args schema), cap (a cap_* rule
 * of EMCP_Tools_LifterLMS_Integration), run (handler method).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

return array(
	'get-setup'            => array(
		'desc' => 'LifterLMS version and whether EMCP supports it, the free quiz question types, course difficulties and categories, whether you may enrol students, and the write operations you may run.',
		'args' => array(),
		'cap'  => 'cap_builder',
		'run'  => 'op_get_setup',
	),
	'list-courses'         => array(
		'desc' => 'Courses {id, title, status, sections, lessons, students, instructors, url, edit_url}; search matches the title; status (default every status but trash). Instructors see the courses they teach. 20 per page.',
		'args' => array( 'search' => 'string', 'status' => 'enum:publish,draft,pending,private,future,trash', 'page' => 'int' ),
		'cap'  => 'cap_builder',
		'run'  => 'op_list_courses',
	),
	'get-course'           => array(
		'desc' => 'One course: its fields (the names create-course and update-course take), the curriculum (sections with their lessons and each lesson\'s quiz, in order), orphans (lessons whose section is gone), its access plans, instructors, student count, url, edit_url and version. Pass the version as course_version to every write on this course.',
		'args' => array( 'course_id' => 'int!' ),
		'cap'  => 'cap_course',
		'run'  => 'op_get_course',
	),
	'get-lesson'           => array(
		'desc' => 'One lesson: title, content, section, course, order, video and audio, drip, prerequisite, points, free preview, quiz and version. Pass the version to update-lesson and trash-lesson.',
		'args' => array( 'lesson_id' => 'int!' ),
		'cap'  => 'cap_lesson',
		'run'  => 'op_get_lesson',
	),
	'get-quiz'             => array(
		'desc' => 'One quiz: its settings (passing percent, attempts, time limit, randomise, show answers, resume, retake), its lesson, its questions in order with their choices (ids, text, correct), the number of attempts, and version. Pass the version to save-quiz and trash-quiz.',
		'args' => array( 'quiz_id' => 'int!' ),
		'cap'  => 'cap_quiz',
		'run'  => 'op_get_quiz',
	),
	'list-memberships'     => array(
		'desc' => 'Memberships {id, title, status, auto_enroll (course ids), students}; search; status. 20 per page.',
		'args' => array( 'search' => 'string', 'status' => 'enum:publish,draft,pending,private,future,trash', 'page' => 'int' ),
		'cap'  => 'cap_builder',
		'run'  => 'op_list_memberships',
	),
	'get-membership'       => array(
		'desc' => 'One membership: its fields (restriction settings, auto-enrolled courses), its access plans, student count and version. Pass the version as membership_version to writes on this membership.',
		'args' => array( 'membership_id' => 'int!' ),
		'cap'  => 'cap_membership',
		'run'  => 'op_get_membership',
	),
	'list-access-plans'    => array(
		'desc' => 'The access plans (pricing plans) of a course or membership: title, price (0 = free), frequency and length (recurring), trial, sale, access expiration, visibility, enrol button text.',
		'args' => array( 'post_id' => 'int!' ),
		'cap'  => 'cap_product',
		'run'  => 'op_list_access_plans',
	),
	'list-enrolments'      => array(
		'desc' => 'Students of a course or membership {user_id, display_name, email (only for users who may list users), status (enrolled, cancelled, expired), trigger}. status filters. 50 per page.',
		'args' => array( 'post_id' => 'int!', 'status' => 'enum:enrolled,cancelled,expired', 'page' => 'int' ),
		'cap'  => 'cap_product',
		'run'  => 'op_list_enrolments',
	),
	'get-student-progress' => array(
		'desc' => 'One student in one course: enrolment status, completed lessons, progress percent and grades.',
		'args' => array( 'course_id' => 'int!', 'user_id' => 'int!' ),
		'cap'  => 'cap_course',
		'run'  => 'op_get_student_progress',
	),
);
