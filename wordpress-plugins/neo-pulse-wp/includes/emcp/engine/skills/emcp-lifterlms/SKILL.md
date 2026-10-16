---
name: emcp-lifterlms
description: Build LifterLMS courses through EMCP's lifterlms-read and lifterlms-write tools - create a course with its details, add sections, lessons and quizzes (with questions and choices), set the curriculum order, give courses and memberships access plans, create memberships, enrol and un-enrol students and read their progress. Covers versions and conflicts, partial updates, the free question types, why trash is the only delete, membership enrolments, and what History can undo.
---

# LifterLMS

EMCP drives LifterLMS 10.x through LifterLMS's own `lifterlms/*` WordPress abilities, which run its REST controllers, so LifterLMS validates, sanitizes and stores every change the way its own API does.

| Tool | Default |
|---|---|
| `lifterlms-read` | on |
| `lifterlms-write` | off: the site owner enables it under Neo EMCP > Tools > Plugins > LifterLMS |

Call either tool with no operation to list its operations and their arguments. Pass arguments as `{operation, arguments}`. Administrators and LMS managers can work on every course; an instructor only on their own courses, and instructors cannot enrol students.

LifterLMS also registers its own `lifterlms/*` abilities (67 of them). They are not on any MCP server by default, and EMCP's tools are the safe path: they add versions, exact checks, recovery and History undo on top, and refuse what would remove students' work.

## Read first

- `get-setup`: the LifterLMS version and whether EMCP supports it, the free question types, the course difficulties and categories, whether you may enrol students (`may_enrol`), and the write operations you may run.
- `list-courses`: courses with their status, section, lesson and student counts and links (20 per page; `search`, `status`).
- `get-course`: the course's fields (the names `create-course` takes), its curriculum (sections with their lessons and each lesson's quiz, in order), `orphans` (lessons whose section is gone), its access plans, instructors, student count and the course **version**.
- `get-lesson` and `get-quiz` give a lesson's or quiz's own **version**; `get-quiz` also lists the questions with their choice ids and the number of attempts.
- `list-memberships`, `get-membership` (with its `version`) and `list-access-plans` show memberships, their `auto_enroll` courses and the plans of a course or membership.
- `list-enrolments` and `get-student-progress` show who is enrolled (status enrolled, cancelled or expired) and how far a student got. Emails appear only for users who may list users.

## Build a course

1. `create-course` with `title` and the details you have: `content` (HTML), `excerpt`, `categories`, `tags`, `difficulties`, `tracks` (term ids), `video_embed`, `length`, capacity, enrolment and access dates. It starts as a draft. The answer gives the `id` and the `course_version`. `dry_run: true` shows what would be sent.
2. `create-section` for each section (pass the latest `course_version`; `order` places it, default last).
3. `create-lesson` in a section: `title`, `content`, `video_embed`, `audio_embed`, `featured_media`, drip settings, `prerequisite`, `points`, `public` (free preview).
4. `save-quiz` with `lesson_id`, `course_version`, `title`, `settings` (`passing_percent`, `allowed_attempts`, `time_limit`, ...) and `questions`. `allowed_attempts` is kept only with `limit_attempts: true`, and `time_limit` (minutes) only with `limit_time: true`; pass the switch with the value, or the write is refused.
5. `save-access-plan` with `post_id` (the course), `course_version`, `title` and `price` (0 is free). A course needs a plan before visitors can enrol themselves.
6. `get-course` to check everything, then `set-course-status` with `publish`.

### Block content

Plain HTML in `content` is always safe. If you write block markup (`<!-- wp:paragraph -->`), also include LifterLMS's own blocks: the first time someone opens a course or membership whose content holds blocks in the block editor, LifterLMS treats it as built with its blocks and shows only what the content holds, so without them the course loses its information, pricing table and syllabus. For a course add `<!-- wp:llms/course-information /-->`, `<!-- wp:llms/instructors /-->`, `<!-- wp:llms/pricing-table /-->`, `<!-- wp:llms/course-progress /-->` and `<!-- wp:llms/course-syllabus /-->`; for a membership `<!-- wp:llms/pricing-table /-->`. The answer of `create-course`, `update-course`, `create-membership` and `update-membership` carries a `note` when they are missing.

## Question types

The free edition has `choice`, `picture_choice`, `true_false` and `content` (a text block with no answer). Other types come from a paid LifterLMS add-on and are refused (`unsupported_question_type`); a question of such a type that is already in a quiz is kept untouched when you name it by id and leave it unchanged.

Each question is `{title, question_type, points, multi_choices, choices: [{choice, correct}]}`. For `true_false` give two choices, "True" and "False", one with `correct: true`. `multi_choices: true` lets a `choice` question have several correct answers.

## Change things

- `update-course`, `update-section`, `update-lesson` and `update-membership` change only the fields you pass; LifterLMS keeps the rest. `""` clears a text field.
- `update-lesson` with `section_id` and `order` moves a lesson, also to another section of the course.
- `save-quiz` with `quiz_id` describes the whole quiz: keep each `question_id` and each choice `id` for what you keep, in the order you want; a question you leave out is removed, a new one has no `question_id`.
- `reorder-curriculum` sets the whole order: `sections: [{section_id, lessons: [lesson ids]}]` with every section and every lesson of the course (orphans included) exactly once; anything missing or extra is `order_mismatch`.
- `set-course-status` publishes or unpublishes a course.

## Versions and conflicts

Every write to an existing course passes `course_version` (from `get-course`), every write to a membership `membership_version` (from `get-membership`); `update-lesson`, `trash-lesson`, `save-quiz` on an existing quiz and `trash-quiz` pass that object's `version`. The course and membership versions cover their access plans' full contents, so a price, trial or frequency change made elsewhere also makes a stale plan write a `conflict`. If anything changed since you read it, the write is a `conflict` and nothing is written: read again and redo the change, or pass `force: true` to overwrite on purpose. Every answer gives the new version.

`lifterlms_busy` means another change to the same course, membership or student is running; try again in a moment.

## Trash, not delete

Courses, lessons, quizzes and memberships are only ever moved to the trash (`trash-course`, `trash-lesson`, `trash-quiz`, `trash-membership`): a permanent delete would take a course's access plans, or a quiz's questions and every student attempt, with it. A lesson with a quiz is trashed after its quiz (`lesson_has_quiz`), and `trash-quiz` detaches the quiz from its lesson the way LifterLMS's course builder does. A quiz students have taken stays (`has_attempts`).

`delete-section` (an empty section only, `section_not_empty` otherwise) and `delete-access-plan` (refused while orders use the plan, `has_orders`; hide it with `visibility: hidden` instead) are the only permanent deletes, because LifterLMS has no trash for them. History brings both back with their old ids.

All of these, and `cancel-enrolment`, need `confirm: true`.

## Students and memberships

- `enrol-student` enrols an existing user (`user_id`) in a course or membership (`post_id`). An enrolled student is reported as `already_enrolled`, nothing is sent; a cancelled enrolment is set back to enrolled.
- `cancel-enrolment` cancels it; their progress is kept.
- A membership's `auto_enroll` courses come with it: enrolling a student in the membership enrols them in those courses, and cancelling it cancels them, unless another membership of the student also covers a course, which then keeps the enrolment through that membership. The answers list every course that changed with what it was.
- `create-membership`, `update-membership` (with `auto_enroll` course ids and the restriction settings) and `trash-membership` manage memberships; `save-access-plan` gives them plans too (`post_id` the membership, `membership_version`).

## History

Every write can be undone in Neo EMCP > History: an edit comes back as it was, a new course, section, lesson, quiz, plan or membership is removed, a deleted section or plan comes back with its old id, a trashed item gets its earlier status back (a quiz is linked to its lesson again, unless the lesson has another quiz now), an order change is reversed, and an enrolment is put back exactly, for a membership with every course enrolment, trigger and level it touched. An undo never writes over a newer change unless forced, and never removes students' work, `force` or not: undoing a course's or membership's creation once anyone enrolled is refused (`has_students`), a lesson's creation once a student completed it or an enrolment once the student made progress (`has_progress`), and a quiz's creation or change once students took it (`has_attempts`).
