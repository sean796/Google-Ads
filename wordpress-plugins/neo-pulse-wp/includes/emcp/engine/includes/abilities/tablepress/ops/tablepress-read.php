<?php
/**
 * tablepress-read operations. Row keys: desc, args (EMCP_Tools_Op_Args schema), cap (a cap_* rule
 * of EMCP_Tools_TablePress_Integration), run (handler method).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

return array(
	'get-setup'      => array(
		'desc' => 'TablePress version, number of tables, which operations you may run, whether custom CSS is on, the default table options and the shortcode parameters (for render-table and place-table) with their defaults. Cells starting with = are formulas and cells run shortcodes when shown.',
		'args' => array(),
		'cap'  => 'cap_list',
		'run'  => 'op_get_setup',
	),
	'list-tables'    => array(
		'desc' => 'Tables {id, name, description, rows, columns, author, last_modified, shortcode}; search matches name and description. 50 per page.',
		'args' => array( 'search' => 'string', 'page' => 'int' ),
		'cap'  => 'cap_list',
		'run'  => 'op_list_tables',
	),
	'get-table'      => array(
		'desc' => 'One table: name, description, data (rows of cell strings, numbered from 1 in other operations), visibility, options, rows, columns and version. Pass the version to every write. 500 rows per call; pass next_cursor as cursor for more.',
		'args' => array( 'table_id' => 'table_id!', 'cursor' => 'string', 'limit' => 'int' ),
		'cap'  => 'cap_edit_table',
		'run'  => 'op_get_table',
	),
	'export-table'   => array(
		'desc' => 'A table as CSV (delimiter , ; or tab), HTML or JSON (the whole table with options and visibility).',
		'args' => array( 'table_id' => 'table_id!', 'format' => 'enum:csv,html,json!', 'delimiter' => 'enum:comma,semicolon,tab' ),
		'cap'  => 'cap_export_table',
		'run'  => 'op_export_table',
	),
	'render-table'   => array(
		'desc' => 'The table HTML visitors get, with formulas worked out. parameters: shortcode parameters from get-setup, e.g. {"hide_columns": "3", "print_name": true}.',
		'args' => array( 'table_id' => 'table_id!', 'parameters' => 'object' ),
		'cap'  => 'cap_preview_table',
		'run'  => 'op_render_table',
	),
	'find-usage'     => array(
		'desc' => 'Posts and pages (not in the trash) that show the table: its shortcode, the TablePress block or the TablePress Elementor widget.',
		'args' => array( 'table_id' => 'table_id!' ),
		'cap'  => 'cap_list',
		'run'  => 'op_find_usage',
	),
	'get-custom-css' => array(
		'desc' => 'The site-wide table CSS from TablePress\'s options screen, whether it is on, and whether it is served from a file.',
		'args' => array(),
		'cap'  => 'cap_options_screen',
		'run'  => 'op_get_custom_css',
	),
);
