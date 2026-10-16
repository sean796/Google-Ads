<?php
/**
 * translatepress-read operations. Row keys: desc, args (EMCP_Tools_Op_Args schema), cap (a cap_*
 * rule of EMCP_Tools_TranslatePress_Integration), run (handler method).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

return array(
	'get-setup'        => array(
		'desc' => 'The default language, the translation language, published languages, the URL slug of each language, how many translation languages the free edition allows, and whether automatic translation is switched on and with which engine (never a key).',
		'args' => array(),
		'cap'  => 'cap_manage',
		'run'  => 'op_get_setup',
	),
	'get-page-strings' => array(
		'desc' => 'Every translatable string of a page as TranslatePress shows it in lang: {id, kind (text or url), accessor, original, text, translated, status, version, occurrences, context} in page order, plus gettext strings (theme and plugin text, include_gettext default true). context is the whole sentence or element a fragment belongs to, so translate fragments as one sentence. Strings are shared by every page that shows the same text (menus, footer). Pass each version back to translate-strings. 200 strings per call; pass next_cursor as cursor for more.',
		'args' => array( 'post_id' => 'int!', 'lang' => 'locale!', 'cursor' => 'string', 'limit' => 'int', 'include_gettext' => 'bool' ),
		'cap'  => 'cap_page',
		'run'  => 'op_get_page_strings',
	),
	'search-strings'   => array(
		'desc' => 'Find strings of lang by text in the original or the translation, by status (untranslated, machine, reviewed, any; default any) and, with gettext:true, among theme and plugin strings by domain. 50 per page. Each row carries its version for translate-strings.',
		'args' => array( 'lang' => 'locale!', 'search' => 'string', 'status' => 'enum:untranslated,machine,reviewed,any', 'gettext' => 'bool', 'domain' => 'string', 'page' => 'int' ),
		'cap'  => 'cap_translate',
		'run'  => 'op_search_strings',
	),
	'get-progress'     => array(
		'desc' => 'How many strings of each translation language (or of lang) are untranslated, machine translated and human reviewed, page strings and gettext strings separately.',
		'args' => array( 'lang' => 'locale' ),
		'cap'  => 'cap_translate',
		'run'  => 'op_get_progress',
	),
);
