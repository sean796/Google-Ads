<?php
/**
 * tutor-write operations. Row keys: desc, args (EMCP_Tools_Op_Args schema), cap (a cap_* rule
 * of EMCP_Tools_Tutor_Integration), run (handler method), confirm, dry_run, nullable (arguments
 * where an explicit null means "clear this field"), undo (catalog note).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$fields = array(
	'content'         => 'string',
	'status'          => 'enum:draft,pending,publish,private',
	'level'           => 'slug',
	'categories'      => 'array',
	'tags'            => 'array',
	'price_type'      => 'enum:free,paid',
	'price'           => 'string',
	'sale_price'      => 'string',
	'benefits'        => 'string',
	'requirements'    => 'string',
	'target_audience' => 'string',
	'materials'       => 'string',
	'duration'        => 'object',
	'enable_qna'      => 'bool',
	'is_public'       => 'bool',
	'max_students'    => 'uint',
	'thumbnail_id'    => 'uint',
	'video'           => 'object',
	'author'          => 'int',
);

return array(
	'create-course'     => array(
		'desc'    => 'Create a course (draft unless status says otherwise). title, content (HTML), level (from get-setup), categories and tags (term ids of course-category and course-tag), price_type free or paid with price and sale_price (when Tutor sells courses itself), benefits, requirements, target_audience, materials (one item per line), duration {hours, minutes}, enable_qna, is_public, max_students (0 = no limit), thumbnail_id, video {source: youtube|vimeo|external_url|html5|embedded, url, runtime: {hours, minutes, seconds}}, author (administrators). Then add topics, lessons and quizzes.',
		'args'    => array( 'title' => 'string!' ) + $fields,
		'cap'     => 'cap_builder',
		'run'     => 'op_create_course',
		'dry_run' => true,
	),
	'update-course'     => array(
		'desc'     => 'Change a course: only the fields you pass change, every other field keeps its value. A text field given as "" and video: null clear that field. course_version from get-course; a course changed since is a conflict unless force.',
		'args'     => array( 'course_id' => 'int!', 'course_version' => 'string', 'force' => 'bool', 'title' => 'string' ) + $fields,
		'cap'      => 'cap_course',
		'run'      => 'op_update_course',
		'dry_run'  => true,
		'nullable' => array( 'video' ),
	),
	'set-course-status' => array(
		'desc' => 'Publish, unpublish (draft), set pending or private. Tutor turns an instructor\'s publish into pending unless instructors may publish (get-setup); the answer says so.',
		'args' => array( 'course_id' => 'int!', 'course_version' => 'string', 'force' => 'bool', 'status' => 'enum:draft,pending,publish,private!' ),
		'cap'  => 'cap_course',
		'run'  => 'op_set_course_status',
	),
	'trash-course'      => array(
		'desc'    => 'Move a course to the trash (never deleted permanently: Tutor would delete its curriculum, quiz attempts and enrolments with it). Undo gives it back its earlier status. Needs confirm.',
		'args'    => array( 'course_id' => 'int!', 'course_version' => 'string', 'force' => 'bool' ),
		'cap'     => 'cap_course',
		'run'     => 'op_trash_course',
		'confirm' => true,
	),
	'create-topic'      => array(
		'desc' => 'Add a topic (a section of the curriculum) at the end of a course.',
		'args' => array( 'course_id' => 'int!', 'course_version' => 'string', 'force' => 'bool', 'title' => 'string!', 'summary' => 'string' ),
		'cap'  => 'cap_course',
		'run'  => 'op_create_topic',
	),
	'update-topic'      => array(
		'desc' => 'Rename a topic or change its summary.',
		'args' => array( 'topic_id' => 'int!', 'course_version' => 'string', 'force' => 'bool', 'title' => 'string', 'summary' => 'string' ),
		'cap'  => 'cap_topic',
		'run'  => 'op_update_topic',
	),
	'delete-topic'      => array(
		'desc'    => 'Delete an empty topic (move or delete its lessons and quizzes first). Needs confirm.',
		'args'    => array( 'topic_id' => 'int!', 'course_version' => 'string', 'force' => 'bool' ),
		'cap'     => 'cap_topic',
		'run'     => 'op_delete_topic',
		'confirm' => true,
	),
	'create-lesson'     => array(
		'desc' => 'Add a lesson at the end of a topic: title, content (HTML), video {source, url, runtime}, attachments (attachment ids), thumbnail_id.',
		'args' => array( 'topic_id' => 'int!', 'course_version' => 'string', 'force' => 'bool', 'title' => 'string!', 'content' => 'string', 'video' => 'object', 'attachments' => 'array', 'thumbnail_id' => 'uint' ),
		'cap'  => 'cap_topic',
		'run'  => 'op_create_lesson',
	),
	'update-lesson'     => array(
		'desc'     => 'Change a lesson: only the fields you pass change. video: null removes the video; attachments: [] removes the attachments; thumbnail_id: 0 removes the thumbnail. version from get-lesson.',
		'args'     => array( 'lesson_id' => 'int!', 'version' => 'string', 'force' => 'bool', 'title' => 'string', 'content' => 'string', 'video' => 'object', 'attachments' => 'array', 'thumbnail_id' => 'uint' ),
		'cap'      => 'cap_lesson',
		'run'      => 'op_update_lesson',
		'nullable' => array( 'video' ),
	),
	'delete-lesson'     => array(
		'desc'    => 'Delete a lesson (the answer says how many students had completed it). Undo brings it back with the same id. Needs confirm.',
		'args'    => array( 'lesson_id' => 'int!', 'version' => 'string', 'force' => 'bool' ),
		'cap'     => 'cap_lesson',
		'run'     => 'op_delete_lesson',
		'confirm' => true,
	),
	'save-quiz'         => array(
		'desc' => 'Create a quiz in a topic (topic_id, course_version) or replace a quiz (quiz_id, version): title, summary, options {time_limit: {time_value, time_type}, attempts_allowed, passing_grade, feedback_mode, question_layout_view, questions_order, max_questions_for_answer}, questions [{question_id (keep it for questions you keep), title, description, type (free types from get-setup), mark, settings, answers [{answer_id (keep it), title, is_correct}]}]. A question you leave out is removed; questions students have answered cannot be removed or changed.',
		'args' => array( 'topic_id' => 'int', 'quiz_id' => 'int', 'course_version' => 'string', 'version' => 'string', 'force' => 'bool', 'title' => 'string', 'summary' => 'string', 'options' => 'object', 'questions' => 'array' ),
		'cap'  => 'cap_quiz_target',
		'run'  => 'op_save_quiz',
	),
	'delete-quiz'       => array(
		'desc'    => 'Delete a quiz that has no attempts. Undo brings it back with the same ids. Needs confirm.',
		'args'    => array( 'quiz_id' => 'int!', 'version' => 'string', 'force' => 'bool' ),
		'cap'     => 'cap_quiz',
		'run'     => 'op_delete_quiz',
		'confirm' => true,
	),
	'reorder-contents'  => array(
		'desc' => 'Set the order of a course\'s curriculum: topics [{topic_id, contents: [lesson and quiz ids]}], every topic and every lesson and quiz of the course exactly once; contents may move between topics.',
		'args' => array( 'course_id' => 'int!', 'course_version' => 'string', 'force' => 'bool', 'topics' => 'array!' ),
		'cap'  => 'cap_course',
		'run'  => 'op_reorder_contents',
	),
	'enrol-student'     => array(
		'desc' => 'Enrol an existing user in a published free course. An existing enrolment is reported, not duplicated.',
		'args' => array( 'course_id' => 'int!', 'user_id' => 'int!' ),
		'cap'  => 'cap_enrol',
		'run'  => 'op_enrol_student',
	),
	'cancel-enrolment'  => array(
		'desc'    => 'Cancel a student\'s enrolment (their progress is kept). Needs confirm.',
		'args'    => array( 'course_id' => 'int!', 'user_id' => 'int!' ),
		'cap'     => 'cap_enrol',
		'run'     => 'op_cancel_enrolment',
		'confirm' => true,
	),
);
