<?php
/**
 * tablepress-write operations. Row keys: desc, args (EMCP_Tools_Op_Args schema), cap (a cap_* rule
 * of EMCP_Tools_TablePress_Integration), run (handler method), confirm, dry_run, undo.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$edit = array( 'table_id' => 'table_id!', 'version' => 'string', 'force' => 'bool' );

return array(
	'create-table'      => array(
		'desc' => 'Create a table: name, description, data (rows of cell strings; the first row is the header unless options.table_head is 0) or rows and columns for an empty grid, options (keys from get-setup), visibility {rows: [1|0...], columns: [...]}. Returns the id, shortcode and version.',
		'args' => array( 'name' => 'string', 'description' => 'string', 'data' => 'array', 'rows' => 'int', 'columns' => 'int', 'options' => 'object', 'visibility' => 'object' ),
		'cap'  => 'cap_add',
		'run'  => 'op_create_table',
		'dry_run' => true,
	),
	'update-table'      => array(
		'desc' => 'Change any of name, description, data (the whole grid), visibility and options of a table; fields left out keep their values. Pass the version from get-table; a table that changed since is a conflict unless force:true.',
		'args' => $edit + array( 'name' => 'string', 'description' => 'string', 'data' => 'array', 'visibility' => 'object', 'options' => 'object' ),
		'cap'  => 'cap_edit_table',
		'run'  => 'op_update_table',
		'dry_run' => true,
	),
	'edit-cells'        => array(
		'desc' => 'Change cells: cells [{row, column, value}] numbered from 1 (at most 5000). Same version check as update-table.',
		'args' => $edit + array( 'cells' => 'array!' ),
		'cap'  => 'cap_edit_table',
		'run'  => 'op_edit_cells',
		'dry_run' => true,
	),
	'insert-rows'       => array(
		'desc' => 'Insert rows at row number at (rows + 1 appends): rows [[cell, ...], ...] or count empty rows; hidden:true hides them.',
		'args' => $edit + array( 'at' => 'int!', 'rows' => 'array', 'count' => 'int', 'hidden' => 'bool' ),
		'cap'  => 'cap_edit_table',
		'run'  => 'op_insert_rows',
	),
	'delete-rows'       => array(
		'desc' => 'Delete rows by number: rows [n, ...].',
		'args' => $edit + array( 'rows' => 'array!' ),
		'cap'  => 'cap_edit_table',
		'run'  => 'op_delete_rows',
	),
	'insert-columns'    => array(
		'desc' => 'Insert columns at column number at (columns + 1 appends): columns [[top cell, ..., bottom cell], ...] or count empty columns; hidden:true hides them.',
		'args' => $edit + array( 'at' => 'int!', 'columns' => 'array', 'count' => 'int', 'hidden' => 'bool' ),
		'cap'  => 'cap_edit_table',
		'run'  => 'op_insert_columns',
	),
	'delete-columns'    => array(
		'desc' => 'Delete columns by number: columns [n, ...].',
		'args' => $edit + array( 'columns' => 'array!' ),
		'cap'  => 'cap_edit_table',
		'run'  => 'op_delete_columns',
	),
	'copy-table'        => array(
		'desc' => 'Copy a table (TablePress names it "Copy of ..." unless name is given).',
		'args' => array( 'table_id' => 'table_id!', 'name' => 'string' ),
		'cap'  => 'cap_copy_table',
		'run'  => 'op_copy_table',
	),
	'change-table-id'   => array(
		'desc' => 'Change a table\'s id (letters, digits, - and _). Pages that show the table by its old id stop showing it: the answer lists them. Needs confirm:true.',
		'args' => array( 'table_id' => 'table_id!', 'new_id' => 'table_id!' ),
		'cap'  => 'cap_edit_table_id',
		'run'  => 'op_change_table_id',
		'confirm' => true,
	),
	'delete-table'      => array(
		'desc' => 'Delete a table. dry_run:true lists the pages that show it. Needs confirm:true. Undo in History brings it back under the same id.',
		'args' => $edit,
		'cap'  => 'cap_delete_table',
		'run'  => 'op_delete_table',
		'confirm' => true,
		'dry_run' => true,
	),
	'import-table'      => array(
		'desc' => 'Import one CSV, HTML, JSON, XLSX or ODS file from data (the file content, at most 5 MB) or url (http or https). mode add (default) creates a table; replace swaps the cells of table_id (keeping its name); append adds the imported rows to table_id (send them without a header row). replace and append need the version. Archives are refused; an id inside a JSON file is ignored.',
		'args' => array( 'data' => 'string', 'url' => 'string', 'mode' => 'enum:add,replace,append', 'table_id' => 'table_id', 'version' => 'string', 'force' => 'bool', 'name' => 'string', 'description' => 'string' ),
		'cap'  => 'cap_import',
		'run'  => 'op_import_table',
	),
	'update-custom-css' => array(
		'desc' => 'Set TablePress\'s site-wide table CSS (custom_css) and whether it is used (use_custom_css). TablePress sanitizes and minifies it.',
		'args' => array( 'custom_css' => 'string', 'use_custom_css' => 'bool' ),
		'cap'  => 'cap_edit_options',
		'run'  => 'op_update_custom_css',
	),
	'place-table'       => array(
		'desc' => 'Put a table on a page: the TablePress widget on an Elementor page (in container_id, or a new container), the TablePress block on any other page. position append (default) or prepend. parameters: shortcode parameters from get-setup.',
		'args' => array( 'table_id' => 'table_id!', 'post_id' => 'int!', 'position' => 'enum:append,prepend', 'container_id' => 'string', 'parameters' => 'object' ),
		'cap'  => 'cap_place',
		'run'  => 'op_place_table',
	),
);
