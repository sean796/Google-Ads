<?php
/**
 * polylang-read operations. Row keys: desc, args (EMCP_Tools_Op_Args schema), cap (a cap_* rule
 * of EMCP_Tools_Polylang_Integration), run (handler method).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

return array(
	'get-setup'         => array(
		'desc' => 'Languages (slug, locale, name, order, default, post count), the default language, the URL mode, hide_default, rewrite, browser detection, media translation, translated post types and taxonomies, the sync list and the menu assigned to each theme location per language.',
		'args' => array(),
		'cap'  => 'cap_manage',
		'run'  => 'op_get_setup',
	),
	'list-translations' => array(
		'desc' => 'The translation group of a post (post_id) or a term (term_id): {lang: id}, plus the item\'s own language.',
		'args' => array( 'post_id' => 'int', 'term_id' => 'int' ),
		'cap'  => 'cap_list_translations',
		'run'  => 'op_list_translations',
	),
	'find-missing'      => array(
		'desc' => 'Posts of a type (default page) and status (default publish) that have a language other than lang and no translation into it. Paged (per_page max 100).',
		'args' => array( 'lang' => 'lang!', 'post_type' => 'slug', 'status' => 'enum:publish,draft,pending,private,any', 'page' => 'int', 'per_page' => 'int' ),
		'cap'  => 'cap_edit_posts',
		'run'  => 'op_find_missing',
	),
	'get-page-text'     => array(
		'desc' => 'Every translatable string of a post as a numbered list of segments {key, kind, text, where}: title, excerpt, SEO title and description, Elementor widget text and links, and the text of supported Gutenberg blocks. Returns the page-wide hash to pass as based_on to apply-page-text. 200 segments per call; pass next_cursor as cursor for more.',
		'args' => array( 'post_id' => 'int!', 'cursor' => 'string', 'limit' => 'int' ),
		'cap'  => 'cap_edit_post',
		'run'  => 'op_get_page_text',
	),
	'list-strings'      => array(
		'desc' => 'Polylang string translations: each string with its name, group and translation per language. Strings that themes and plugins register appear only after a wp-admin page load has registered them; strings already present in a language table are always listed.',
		'args' => array( 'lang' => 'lang', 'search' => 'string', 'group' => 'string', 'page' => 'int' ),
		'cap'  => 'cap_manage',
		'run'  => 'op_list_strings',
	),
);
