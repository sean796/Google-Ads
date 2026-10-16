---
name: emcp-tutor
description: Build Tutor LMS (free) courses through EMCP's tutor-read and tutor-write tools - create a course with its details, add topics, lessons (with video and attachments) and quizzes (with questions and answers), set the curriculum order, publish or trash courses, enrol students in free courses and read their progress. Covers versions and conflicts, partial updates, the free question types, what students' work protects, and what History can undo.
---

# Tutor LMS

EMCP drives Tutor LMS free 4.x through Tutor's own course builder code, so Tutor validates, sanitizes and stores every change the way its builder does.

| Tool | Default |
|---|---|
| `tutor-read` | on |
| `tutor-write` | off: the site owner enables it under Neo EMCP > Tools > Plugins > Tutor LMS |

Call either tool with no operation to list its operations and their arguments. Pass arguments as `{operation, arguments}`. Administrators can work on every course; an instructor only on the courses they teach.

## Read first

- `get-setup`: the Tutor version, how courses are sold (`monetize_by`), the course levels and statuses, the free question types, whether instructors may publish or trash courses, and the write operations you may run.
- `list-courses`: courses with their status, level, price, counts and links (20 per page; `search`, `status`, `category`, `instructor`).
- `get-course`: the course's fields (the same names `create-course` takes), its curriculum (topics with their lessons and quizzes, in order), any orphans (lessons or quizzes no topic holds), and the course **version**.
- `get-lesson` and `get-quiz` give a lesson's or quiz's own **version**.

## Build a course

1. `create-course` with `title` and the details you have: `content` (HTML), `level`, `categories` and `tags` (term ids), `benefits`, `requirements`, `target_audience`, `materials` (one item per line), `duration` `{hours, minutes}`, `max_students`, `thumbnail_id`, `video` `{source, url}`. It starts as a draft. The answer gives the `id` and the `course_version`.
2. `create-topic` for each section (pass the latest `course_version`).
3. `create-lesson` in a topic: `title`, `content`, `video` `{source: youtube|vimeo|external_url|html5|embedded|shortcode, url}`, `attachments` (attachment ids), `thumbnail_id`.
4. `save-quiz` with `topic_id`, `title`, `options` (`passing_grade`, `attempts_allowed`, `time_limit`, ...) and `questions`. Each question has `title`, `type`, `mark` and `answers` `[{title, is_correct}]`.
5. `get-course` to check the curriculum, then `set-course-status` with `publish`.

## Question types

The free edition has `true_false`, `single_choice`, `multiple_choice`, `open_ended` and `fill_in_the_blank`. Other types are Tutor Pro and are refused (`unsupported_question_type`).

- `true_false`: two answers, "True" and "False", one with `is_correct: true`.
- `single_choice`: several answers, exactly one correct.
- `multiple_choice`: several answers, one or more correct.
- `open_ended`: no answers; a teacher reviews the reply.
- `fill_in_the_blank`: the question text holds the blanks; Tutor's builder explains its format.

## Change things

- `update-course` changes only the fields you pass; everything else stays as it is. `""` clears a text field, `video: null` removes the video.
- `update-topic`, `update-lesson` work the same way. On a lesson, `video: null`, `attachments: []` and `thumbnail_id: 0` remove those.
- `save-quiz` with `quiz_id` describes the whole quiz: keep each `question_id` and `answer_id` for what you keep; a question or answer you leave out is removed.
- `reorder-contents` sets the whole order: every topic once, and every lesson and quiz (orphans included) exactly once. Contents may move between topics.

## Versions and conflicts

Every write to an existing course passes `course_version` (from `get-course`); `update-lesson`, `delete-lesson`, `save-quiz` (an existing quiz) and `delete-quiz` pass that object's `version`. If someone changed it since you read it, the write is a `conflict` and nothing is written: read again and redo the change, or pass `force: true` to overwrite on purpose. Every answer gives the new versions.

## Students' work is protected

- Questions students have answered cannot be removed or changed, and a quiz with attempts cannot be deleted (`has_attempts`).
- A course is never deleted, only moved to the trash with `trash-course` (Tutor would delete its quiz attempts and enrolments with it).
- Undoing a lesson's creation once a student completed it is refused (`has_progress`), and so is undoing a quiz change after students took the quiz (`has_attempts`). `force` does not change either.
- `tutor_update_pending` on `save-quiz` means Tutor has not finished its own database update on this site (it runs when someone opens wp-admin). Ask the site owner to open any wp-admin page, then try again; nothing was changed.

## Students

- `enrol-student` enrols an existing user in a published free course; a paid course is refused (`paid`: students are enrolled when they buy it). An existing enrolment is reported, not duplicated.
- `cancel-enrolment` (needs `confirm: true`) cancels it; their progress is kept.
- `list-enrolments` and `get-student-progress` show who is enrolled and how far they got. Emails appear only for users who may list users.

## Deleting

`trash-course`, `delete-topic` (only an empty topic), `delete-lesson`, `delete-quiz` and `cancel-enrolment` need `confirm: true`.

## History

Every write can be undone in Neo EMCP > History: an edit comes back as it was, a new course, topic, lesson or quiz is removed, a deleted lesson or quiz comes back with its old id, a trashed course gets its earlier status back, an order change is reversed and an enrolment is removed or reinstated. An undo never writes over a newer change unless forced, and never touches students' work.
