<?php
/**
 * tutor-read operations. Row keys: desc, args (EMCP_Tools_Op_Args schema), cap (a cap_* rule
 * of EMCP_Tools_Tutor_Integration), run (handler method).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

return array(
	'get-setup'            => array(
		'desc' => 'Tutor LMS version, how courses are sold (monetize_by: tutor, wc, edd or free), course levels and statuses, the free quiz question types, whether instructors may publish and trash courses, the course and lesson URL bases, and the write operations you may run.',
		'args' => array(),
		'cap'  => 'cap_builder',
		'run'  => 'op_get_setup',
	),
	'list-courses'         => array(
		'desc' => 'Courses {id, title, status, level, price_type, price, categories, instructors, topics, lessons, quizzes, enrolled, url, edit_url}; search matches title and description; status (default every status but trash); category (term id); instructor (user id). Instructors see their own courses. 20 per page.',
		'args' => array( 'search' => 'string', 'status' => 'enum:publish,draft,pending,private,future,trash', 'category' => 'int', 'instructor' => 'int', 'page' => 'int' ),
		'cap'  => 'cap_builder',
		'run'  => 'op_list_courses',
	),
	'get-course'           => array(
		'desc' => 'One course: its fields (the same names create-course and update-course take), the curriculum (topics with their lessons and quizzes, in order), orphans (lessons or quizzes no topic holds), instructors, enrolled count, url, edit_url (Tutor\'s course builder) and version. Pass the version as course_version to writes on this course.',
		'args' => array( 'course_id' => 'int!' ),
		'cap'  => 'cap_course',
		'run'  => 'op_get_course',
	),
	'get-lesson'           => array(
		'desc' => 'One lesson: title, content, topic, course, video, attachments (attachment ids), thumbnail_id, url and version. Pass the version to update-lesson and delete-lesson.',
		'args' => array( 'lesson_id' => 'int!' ),
		'cap'  => 'cap_lesson',
		'run'  => 'op_get_lesson',
	),
	'get-quiz'             => array(
		'desc' => 'One quiz: title, summary, options, questions with their answers (and which are correct), the number of attempts, and version. Pass the version to save-quiz and delete-quiz.',
		'args' => array( 'quiz_id' => 'int!' ),
		'cap'  => 'cap_quiz',
		'run'  => 'op_get_quiz',
	),
	'list-enrolments'      => array(
		'desc' => 'Students of a course {enrolment_id, user_id, display_name, email (only for users who may list users), status (completed, pending, cancel), enrolled_at, progress_percent}. 50 per page.',
		'args' => array( 'course_id' => 'int!', 'status' => 'enum:completed,pending,cancel', 'page' => 'int' ),
		'cap'  => 'cap_course',
		'run'  => 'op_list_enrolments',
	),
	'get-student-progress' => array(
		'desc' => 'One student in one course: the enrolment, completed lessons, the last result of each quiz they took, and progress percent.',
		'args' => array( 'course_id' => 'int!', 'user_id' => 'int!' ),
		'cap'  => 'cap_course',
		'run'  => 'op_get_student_progress',
	),
);
