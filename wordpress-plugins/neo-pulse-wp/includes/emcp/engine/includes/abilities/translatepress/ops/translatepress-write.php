<?php
/**
 * translatepress-write operations. Row keys: desc, args (EMCP_Tools_Op_Args schema), cap (a cap_*
 * rule of EMCP_Tools_TranslatePress_Integration), run (handler method), confirm, dry_run, undo.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

return array(
	'translate-strings'    => array(
		'desc' => 'Write translations: strings [{id, translated, version}] with the id and version from get-page-strings or search-strings (gettext:true for gettext rows). Saved as machine translated, or human reviewed with reviewed:true. A reviewed translation is never overwritten without overwrite_reviewed:true. A row that changed since it was read is a conflict; force:true writes anyway. post_id checks that every id is on that page. All or nothing: one bad entry writes nothing. At most 200 per call. dry_run:true shows each row before and after.',
		'args' => array( 'lang' => 'locale!', 'strings' => 'array!', 'gettext' => 'bool', 'post_id' => 'int', 'reviewed' => 'bool', 'overwrite_reviewed' => 'bool', 'force' => 'bool' ),
		'cap'  => 'cap_translate',
		'run'  => 'op_translate_strings',
		'dry_run' => true,
		'undo' => 'undoable',
	),
	'review-strings'       => array(
		'desc' => 'Mark machine translations as human reviewed: strings [{id, version}]. Rows that are not machine translated are reported and left alone. Same version check and force as translate-strings.',
		'args' => array( 'lang' => 'locale!', 'strings' => 'array!', 'gettext' => 'bool', 'post_id' => 'int', 'force' => 'bool' ),
		'cap'  => 'cap_translate',
		'run'  => 'op_review_strings',
		'undo' => 'undoable',
	),
	'add-language'         => array(
		'desc' => 'Add the translation language (language_code like fr_FR, optional URL slug like fr) through TranslatePress. The free edition allows one translation language.',
		'args' => array( 'language_code' => 'locale!', 'slug' => 'string' ),
		'cap'  => 'cap_manage',
		'run'  => 'op_add_language',
		'undo' => 'undoable',
	),
	'update-language'      => array(
		'desc' => 'Change a language\'s URL slug and whether it is published on the front end.',
		'args' => array( 'language_code' => 'locale!', 'slug' => 'string!', 'published' => 'bool!' ),
		'cap'  => 'cap_manage',
		'run'  => 'op_update_language',
		'undo' => 'undoable',
	),
	'remove-language'      => array(
		'desc' => 'Remove a translation language from TranslatePress. Its translations stay in the database but are no longer used. dry_run:true reports how many strings it has. Needs confirm:true.',
		'args' => array( 'language_code' => 'locale!' ),
		'cap'  => 'cap_manage',
		'run'  => 'op_remove_language',
		'confirm' => true,
		'dry_run' => true,
		'undo' => 'irreversible: TranslatePress keeps the table, but adding the language back cannot be shown to restore everything',
	),
	'set-default-language' => array(
		'desc' => 'Make a configured language the site default. The dictionary tables are keyed on the default language, so existing translations stop applying. Needs confirm:true.',
		'args' => array( 'language_code' => 'locale!' ),
		'cap'  => 'cap_manage',
		'run'  => 'op_set_default_language',
		'confirm' => true,
		'undo' => 'undoable',
	),
);
