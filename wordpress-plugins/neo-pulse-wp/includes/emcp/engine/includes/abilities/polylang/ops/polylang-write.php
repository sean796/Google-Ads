<?php
/**
 * polylang-write operations. Row keys: desc, args (EMCP_Tools_Op_Args schema), cap (a cap_* rule
 * of EMCP_Tools_Polylang_Integration), run (handler method), confirm, dry_run, undo.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

return array(
	'add-language'            => array(
		'desc' => 'Add a language: locale (en_US, fr_FR), slug (en, fr), name, rtl, flag (flag code), order.',
		'args' => array( 'locale' => 'string!', 'slug' => 'lang!', 'name' => 'string!', 'rtl' => 'bool', 'flag' => 'string', 'order' => 'uint' ),
		'cap'  => 'cap_manage',
		'run'  => 'op_add_language',
		'undo' => 'undoable',
	),
	'update-language'         => array(
		'desc' => 'Change a language\'s locale, slug, name, rtl, flag or order.',
		'args' => array( 'lang' => 'lang!', 'locale' => 'string', 'slug' => 'lang', 'name' => 'string', 'rtl' => 'bool', 'flag' => 'string', 'order' => 'uint' ),
		'cap'  => 'cap_manage',
		'run'  => 'op_update_language',
		'undo' => 'undoable',
	),
	'delete-language'         => array(
		'desc' => 'Delete a language. Polylang removes it from every post and term that has it. dry_run:true reports how many. Needs confirm:true.',
		'args' => array( 'lang' => 'lang!' ),
		'cap'  => 'cap_manage',
		'run'  => 'op_delete_language',
		'confirm' => true,
		'dry_run' => true,
		'undo' => 'irreversible: Polylang removes the language from every post and term, which a snapshot cannot honestly put back',
	),
	'set-default-language'    => array(
		'desc' => 'Make a language the default.',
		'args' => array( 'lang' => 'lang!' ),
		'cap'  => 'cap_manage',
		'run'  => 'op_set_default_language',
		'undo' => 'undoable',
	),
	'assign-language'         => array(
		'desc' => 'Set the language of posts (post_ids) or terms (term_ids). Bulk mode: post_type with without_language:true assigns every post of that type that has no language, 500 per call, and reports how many remain.',
		'args' => array( 'lang' => 'lang!', 'post_ids' => 'ints', 'term_ids' => 'ints', 'post_type' => 'slug', 'without_language' => 'bool' ),
		'cap'  => 'cap_assign',
		'run'  => 'op_assign_language',
		'undo' => 'undoable',
	),
	'link-translations'       => array(
		'desc' => 'Join existing posts (post_ids) or terms (term_ids) into one translation group. Each must already have a language, and no two may share one.',
		'args' => array( 'post_ids' => 'ints', 'term_ids' => 'ints' ),
		'cap'  => 'cap_assign',
		'run'  => 'op_link_translations',
		'undo' => 'undoable',
	),
	'create-translation'      => array(
		'desc' => 'Copy a post into another language and link it: content, Elementor or block data, meta, password, template, terms mapped to their translations, featured image. Default status draft; slug {source-slug}-{lang}. dry_run:true writes nothing. Next: get-page-text on the new post.',
		'args' => array( 'post_id' => 'int!', 'lang' => 'lang!', 'title' => 'string', 'slug' => 'slug', 'status' => 'string' ),
		'cap'  => 'cap_create_translation',
		'run'  => 'op_create_translation',
		'dry_run' => true,
		'undo' => 'undoable',
	),
	'create-term-translation' => array(
		'desc' => 'Create a term in another language and link it to term_id: name, slug, description. The parent becomes the parent\'s translation when one exists.',
		'args' => array( 'term_id' => 'int!', 'lang' => 'lang!', 'name' => 'string!', 'slug' => 'slug', 'description' => 'string' ),
		'cap'  => 'cap_term_create',
		'run'  => 'op_create_term_translation',
		'undo' => 'undoable',
	),
	'apply-page-text'         => array(
		'desc' => 'Write translated segments back: {post_id, based_on (the hash get-page-text or the previous apply returned), segments: [{key, text}]}. Validates every segment first and writes nothing on any error. Returns the new hash for the next batch.',
		'args' => array( 'post_id' => 'int!', 'based_on' => 'string!', 'segments' => 'array!', 'force' => 'bool' ),
		'cap'  => 'cap_edit_post',
		'run'  => 'op_apply_page_text',
		'undo' => 'undoable',
	),
	'set-status'              => array(
		'desc' => 'Set a post\'s status: draft, pending, publish or private. Publishing needs the post type\'s publish capability.',
		'args' => array( 'post_id' => 'int!', 'status' => 'enum:draft,pending,publish,private' ),
		'cap'  => 'cap_set_status',
		'run'  => 'op_set_status',
		'undo' => 'undoable',
	),
	'update-strings'          => array(
		'desc' => 'Set string translations for one language: strings: [{string, translation}]. Only strings Polylang knows (registered, or already in that language\'s table).',
		'args' => array( 'lang' => 'lang!', 'strings' => 'array!' ),
		'cap'  => 'cap_manage',
		'run'  => 'op_update_strings',
		'undo' => 'undoable',
	),
	'set-menu-location'       => array(
		'desc' => 'Assign a menu to a theme location for one language (menu_id 0 clears it).',
		'args' => array( 'location' => 'slug!', 'lang' => 'lang!', 'menu_id' => 'string!' ),
		'cap'  => 'cap_manage',
		'run'  => 'op_set_menu_location',
		'undo' => 'undoable',
	),
	'update-settings'         => array(
		'desc' => 'Change Polylang settings: hide_default, force_lang (0 query, 1 directory, 2 subdomain), rewrite, redirect_lang, browser, media_support, post_types, taxonomies, sync. force_lang and rewrite change every URL on the site and need confirm:true.',
		'args' => array( 'hide_default' => 'bool', 'force_lang' => 'enum:0,1,2', 'rewrite' => 'bool', 'redirect_lang' => 'bool', 'browser' => 'bool', 'media_support' => 'bool', 'post_types' => 'array', 'taxonomies' => 'array', 'sync' => 'array' ),
		'cap'  => 'cap_manage',
		'run'  => 'op_update_settings',
		'undo' => 'undoable',
	),
);
