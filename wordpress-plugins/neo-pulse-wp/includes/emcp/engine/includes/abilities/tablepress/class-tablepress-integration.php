<?php
/**
 * TablePress (free) integration: the tablepress-read and tablepress-write dispatcher tools.
 * Operation rows live in ops/tablepress-read.php and ops/tablepress-write.php; each row names
 * its own capability rule (cap_*) and handler (op_*). Every TablePress call goes through
 * EMCP_Tools_TablePress_Api; every table write goes through EMCP_Tools_TablePress_Writer.
 *
 * Who may do what is TablePress's own capabilities, operation by operation.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'EMCP_Tools_Op_Args' ) ) {
	require_once dirname( __DIR__ ) . '/class-op-args.php';
}

/** @since 3.19.0 */
class EMCP_Tools_TablePress_Integration {

	/** Rows per get-table page. */
	const MAX_ROWS = 500;

	/** Tables per list-tables page. */
	const PER_PAGE = 50;

	/** @var EMCP_Tools_TablePress_Api|null Test seam. */
	private static $api_override = null;

	/** @var string[] */
	private $ability_names = array();

	public static function use_api( ?EMCP_Tools_TablePress_Api $api ): void {
		self::$api_override = $api;
	}

	public static function tablepress_active(): bool {
		return class_exists( 'TablePress' );
	}

	public static function shared_api(): EMCP_Tools_TablePress_Api {
		return self::$api_override ? self::$api_override : new EMCP_Tools_TablePress_Api();
	}

	protected function api(): EMCP_Tools_TablePress_Api {
		return self::shared_api();
	}

	/** @return string[] */
	public function get_ability_names(): array {
		return $this->ability_names;
	}

	public function check_permission(): bool {
		return $this->api()->can( 'tablepress_list_tables' );
	}

	public function register(): void {
		if ( ! ( function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code() ) ) {
			return;
		}
		$schema = static function ( string $what ): array {
			return array(
				'type'       => 'object',
				'properties' => array(
					'operation' => array( 'type' => 'string', 'description' => $what ),
					'arguments' => array( 'type' => 'object', 'description' => __( 'Arguments for the operation, plus confirm and dry_run where listed.', 'emcp-tools' ) ),
				),
			);
		};
		$tools = array(
			'emcp-tools/tablepress-read'  => array(
				'label'       => __( 'TablePress Read', 'emcp-tools' ),
				'description' => __( 'Read TablePress tables: the setup and allowed operations, the list of tables, a table\'s cells, options and version, an export as CSV, HTML or JSON, the rendered HTML with formulas worked out, the pages that show a table, and the site-wide table CSS. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_read',
				'operation'   => __( 'The read operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
			),
			'emcp-tools/tablepress-write' => array(
				'label'       => __( 'TablePress Write', 'emcp-tools' ),
				'description' => __( 'Build and edit TablePress tables: create a table, change it whole or cell by cell, insert and delete rows and columns, copy, rename and delete tables, import a CSV, HTML, JSON, XLSX or ODS file from pasted data or a URL, set the site-wide table CSS, and put a table on an Elementor or Gutenberg page. Every write to an existing table needs the version from get-table. Disabled by default; enable under Neo EMCP > Tools > Plugins > TablePress. change-table-id and delete-table need confirm:true. Every write can be undone in History. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_write',
				'operation'   => __( 'The write operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => false, 'destructive' => true, 'idempotent' => false ),
			),
		);
		foreach ( $tools as $name => $t ) {
			$this->ability_names[] = $name;
			emcp_tools_register_ability(
				$name,
				array(
					'label'               => $t['label'],
					'description'         => $t['description'],
					'category'            => 'emcp-tools',
					'execute_callback'    => array( $this, $t['callback'] ),
					'permission_callback' => array( $this, 'check_permission' ),
					'input_schema'        => $schema( $t['operation'] ),
					'meta'                => array(
						'annotations'  => $t['annotations'],
						'show_in_rest' => true,
					),
				)
			);
		}
	}

	/** @return array|WP_Error */
	public function run_read( $input ) {
		return $this->run( 'read', $input );
	}

	/** @return array|WP_Error */
	public function run_write( $input ) {
		return $this->run( 'write', $input );
	}

	/** @return array<string,array> */
	protected function operations( string $mode ): array {
		return (array) require __DIR__ . '/ops/tablepress-' . $mode . '.php';
	}

	/** @return array */
	public function catalog( string $mode ): array {
		$ops = array();
		foreach ( $this->operations( $mode ) as $name => $op ) {
			$args     = array();
			$required = array();
			foreach ( (array) $op['args'] as $arg => $type ) {
				$args[ $arg ] = rtrim( (string) $type, '!' );
				if ( '!' === substr( (string) $type, -1 ) ) {
					$required[] = $arg;
				}
			}
			$ops[] = array(
				'name'        => $name,
				'arguments'   => $args,
				'required'    => $required,
				'confirm'     => ! empty( $op['confirm'] ),
				'dry_run'     => ! empty( $op['dry_run'] ),
				'undo'        => 'write' === $mode ? (string) ( $op['undo'] ?? 'undoable' ) : 'read-only',
				'description' => $op['desc'],
			);
		}
		return array( 'mode' => $mode, 'operations' => $ops );
	}

	/** @return array|WP_Error */
	protected function run( string $mode, $input ) {
		$name = is_array( $input ) && isset( $input['operation'] ) ? str_replace( '_', '-', sanitize_key( (string) $input['operation'] ) ) : '';
		if ( '' === $name ) {
			return $this->catalog( $mode );
		}
		$ops = $this->operations( $mode );
		if ( ! isset( $ops[ $name ] ) ) {
			/* translators: %s: operation name. */
			return new WP_Error( 'unknown_operation', sprintf( __( 'Unknown operation "%s". Call the tool with no operation to list the available operations.', 'emcp-tools' ), $name ) );
		}
		if ( ! $this->api()->active() ) {
			return new WP_Error( 'tablepress_inactive', __( 'TablePress is not active.', 'emcp-tools' ) );
		}
		$op   = $ops[ $name ];
		$args = is_array( $input ) && isset( $input['arguments'] ) && is_array( $input['arguments'] ) ? $input['arguments'] : array();

		$dry_run = false;
		if ( array_key_exists( 'dry_run', $args ) ) {
			if ( empty( $op['dry_run'] ) || ! is_bool( $args['dry_run'] ) ) {
				return new WP_Error( 'invalid_argument', __( 'dry_run must be a boolean and is only supported where the operation list says so.', 'emcp-tools' ) );
			}
			$dry_run = $args['dry_run'];
			unset( $args['dry_run'] );
		}
		$confirmed = array_key_exists( 'confirm', $args ) && true === $args['confirm'];
		unset( $args['confirm'] );

		$clean = EMCP_Tools_Op_Args::validate( (array) $op['args'], $args );
		if ( is_wp_error( $clean ) ) {
			return $clean;
		}
		if ( ! method_exists( $this, $op['cap'] ) || ! method_exists( $this, $op['run'] ) ) {
			return new WP_Error( 'not_ready', __( 'This operation is not available yet.', 'emcp-tools' ) );
		}
		$allowed = call_user_func( array( $this, $op['cap'] ), $clean );
		if ( is_wp_error( $allowed ) ) {
			return $allowed;
		}
		if ( ! empty( $op['confirm'] ) && ! $confirmed && ! $dry_run ) {
			return new WP_Error( 'confirmation_required', __( 'This operation deletes a table or changes how pages find it. Pass confirm:true in arguments to proceed.', 'emcp-tools' ) );
		}
		return call_user_func( array( $this, $op['run'] ), $clean, $dry_run, $confirmed );
	}

	// Capability rules: TablePress's own capabilities. Each returns true or a WP_Error.

	protected static function forbidden(): WP_Error {
		return new WP_Error( 'forbidden', __( 'You are not allowed to do this in TablePress.', 'emcp-tools' ), array( 'status' => 403 ) );
	}

	/** @return true|WP_Error */
	protected function need( string $cap, ...$args ) {
		return $this->api()->can( $cap, ...$args ) ? true : self::forbidden();
	}

	/** @return true|WP_Error */
	protected function cap_list( array $args ) {
		return $this->need( 'tablepress_list_tables' );
	}

	/** @return true|WP_Error */
	protected function cap_edit_table( array $args ) {
		return $this->need( 'tablepress_edit_table', (string) ( $args['table_id'] ?? '' ) );
	}

	/** @return true|WP_Error */
	protected function cap_export_table( array $args ) {
		return $this->need( 'tablepress_export_table', (string) ( $args['table_id'] ?? '' ) );
	}

	/** @return true|WP_Error */
	protected function cap_preview_table( array $args ) {
		return $this->need( 'tablepress_preview_table', (string) ( $args['table_id'] ?? '' ) );
	}

	/** @return true|WP_Error */
	protected function cap_options_screen( array $args ) {
		return $this->need( 'tablepress_access_options_screen' );
	}

	/** @return true|WP_Error */
	protected function cap_edit_options( array $args ) {
		return $this->need( 'tablepress_edit_options' );
	}

	/** @return true|WP_Error */
	protected function cap_add( array $args ) {
		return $this->need( 'tablepress_add_tables' );
	}

	/** @return true|WP_Error */
	protected function cap_copy_table( array $args ) {
		return $this->need( 'tablepress_copy_table', (string) ( $args['table_id'] ?? '' ) );
	}

	/** @return true|WP_Error */
	protected function cap_edit_table_id( array $args ) {
		return $this->need( 'tablepress_edit_table_id', (string) ( $args['table_id'] ?? '' ) );
	}

	/** @return true|WP_Error */
	protected function cap_delete_table( array $args ) {
		return $this->need( 'tablepress_delete_table', (string) ( $args['table_id'] ?? '' ) );
	}

	/** Import, plus the URL capability for a URL and edit rights on the target for replace and append. @return true|WP_Error */
	protected function cap_import( array $args ) {
		$can = $this->need( 'tablepress_import_tables' );
		if ( is_wp_error( $can ) ) {
			return $can;
		}
		if ( isset( $args['url'] ) ) {
			$can = $this->need( 'tablepress_import_tables_url' );
			if ( is_wp_error( $can ) ) {
				return $can;
			}
		}
		$mode = (string) ( $args['mode'] ?? 'add' );
		if ( 'add' !== $mode ) {
			return $this->need( 'tablepress_edit_table', (string) ( $args['table_id'] ?? '' ) );
		}
		return true;
	}

	/** List rights, plus edit_post on the page. @return true|WP_Error */
	protected function cap_place( array $args ) {
		$can = $this->need( 'tablepress_list_tables' );
		if ( is_wp_error( $can ) || ! isset( $args['post_id'] ) ) {
			return $can;
		}
		if ( ! get_post( (int) $args['post_id'] ) ) {
			/* translators: %d: post ID. */
			return new WP_Error( 'not_found', sprintf( __( 'Post %d does not exist.', 'emcp-tools' ), (int) $args['post_id'] ) );
		}
		return $this->need( 'edit_post', (int) $args['post_id'] );
	}

	// Shared helpers.

	/** @return array|WP_Error */
	protected function table_or_error( string $id ) {
		$table = $this->api()->load( $id, true );
		if ( is_wp_error( $table ) ) {
			/* translators: %s: table id. */
			return new WP_Error( 'not_found', sprintf( __( 'There is no table "%s". list-tables shows the tables.', 'emcp-tools' ), $id ) );
		}
		return $table;
	}

	public static function shortcode( string $id ): string {
		return '[' . self::shortcode_tag() . ' id=' . $id . ' /]';
	}

	/** TablePress's shortcode name (filterable through tablepress_table_shortcode). */
	public static function shortcode_tag(): string {
		return class_exists( 'TablePress' ) && isset( TablePress::$shortcode ) ? (string) TablePress::$shortcode : 'table';
	}

	/**
	 * Shortcode parameters from an object: keys TablePress knows (minus the ones it keeps to
	 * itself), booleans as "true"/"false", scalars as strings.
	 *
	 * @return array|WP_Error
	 */
	public function parameters( array $params ) {
		$known = array_diff_key( $this->api()->render_defaults(), array_flip( EMCP_Tools_TablePress_Api::BLOCKED_PARAMETERS ) );
		$out   = array();
		foreach ( $params as $key => $value ) {
			$key = (string) $key;
			if ( ! array_key_exists( $key, $known ) ) {
				/* translators: %s: parameter name. */
				return new WP_Error( 'unknown_parameter', sprintf( __( '"%s" is not a TablePress shortcode parameter EMCP can set. get-setup lists them.', 'emcp-tools' ), $key ) );
			}
			if ( is_bool( $value ) ) {
				$value = $value ? 'true' : 'false';
			} elseif ( ! is_scalar( $value ) ) {
				/* translators: %s: parameter name. */
				return new WP_Error( 'invalid_argument', sprintf( __( 'Parameter "%s" must be a string, number or boolean.', 'emcp-tools' ), $key ) );
			}
			$out[ $key ] = (string) $value;
		}
		return $out;
	}

	/** Operations the current user may run (capability rules with a placeholder table). */
	protected function allowed_operations(): array {
		$out = array();
		foreach ( array( 'read', 'write' ) as $mode ) {
			foreach ( $this->operations( $mode ) as $name => $op ) {
				if ( method_exists( $this, $op['cap'] ) && true === call_user_func( array( $this, $op['cap'] ), array( 'table_id' => '1' ) ) ) {
					$out[] = $name;
				}
			}
		}
		return $out;
	}

	// Read handlers.

	/** @return array */
	protected function op_get_setup( array $args ) {
		$api      = $this->api();
		$template = $api->template();
		$options  = (array) $template['options'];
		unset( $options['last_editor'] );
		$params = array_diff_key( $api->render_defaults(), array_flip( EMCP_Tools_TablePress_Api::BLOCKED_PARAMETERS ) );
		$plugin = $api->plugin_options();
		return array(
			'tablepress_version'   => $api->version_string(),
			'tables'               => count( $api->table_ids() ),
			'allowed_operations'   => $this->allowed_operations(),
			'custom_css_on'        => ! empty( $plugin['use_custom_css'] ),
			'default_options'      => $options,
			'shortcode_parameters' => $params,
			'notes'                => array(
				__( 'Rows and columns are numbered from 1.', 'emcp-tools' ),
				__( 'A cell starting with = is a formula, worked out when the table is shown (=B2+B3, =SUM(B2:B9)); start it with \'= to show it as text.', 'emcp-tools' ),
				__( 'Shortcodes in cells run when the table is shown.', 'emcp-tools' ),
				__( 'Users without the unfiltered_html capability get their cells cleaned by TablePress, and DataTables custom commands stay as stored.', 'emcp-tools' ),
			),
		);
	}

	/** @return array */
	protected function op_list_tables( array $args ) {
		$api    = $this->api();
		$search = strtolower( (string) ( $args['search'] ?? '' ) );
		$rows   = array();
		foreach ( $api->table_ids() as $id ) {
			$t = $api->load( $id, true );
			if ( is_wp_error( $t ) ) {
				continue;
			}
			if ( '' !== $search && false === strpos( strtolower( $t['name'] . ' ' . $t['description'] ), $search ) ) {
				continue;
			}
			$data   = (array) ( $t['data'] ?? array() );
			$rows[] = array(
				'id'            => (string) $id,
				'name'          => (string) $t['name'],
				'description'   => (string) $t['description'],
				'rows'          => count( $data ),
				'columns'       => count( (array) ( $data[0] ?? array() ) ),
				'author'        => (int) ( $t['author'] ?? 0 ),
				'last_modified' => (string) ( $t['last_modified'] ?? '' ),
				'shortcode'     => self::shortcode( (string) $id ),
			);
		}
		$page = max( 1, (int) ( $args['page'] ?? 1 ) );
		return array(
			'total'    => count( $rows ),
			'page'     => $page,
			'per_page' => self::PER_PAGE,
			'tables'   => array_slice( $rows, ( $page - 1 ) * self::PER_PAGE, self::PER_PAGE ),
		);
	}

	/** @return array|WP_Error */
	protected function op_get_table( array $args ) {
		$id    = (string) $args['table_id'];
		$table = $this->table_or_error( $id );
		if ( is_wp_error( $table ) ) {
			return $table;
		}
		$cursor = (string) ( $args['cursor'] ?? '0' );
		if ( ! ctype_digit( $cursor ) ) {
			return new WP_Error( 'invalid_argument', __( 'cursor must be the next_cursor of an earlier call.', 'emcp-tools' ) );
		}
		$limit  = min( self::MAX_ROWS, max( 1, (int) ( $args['limit'] ?? self::MAX_ROWS ) ) );
		$offset = (int) $cursor;
		$data   = (array) $table['data'];
		$out    = array(
			'id'          => $id,
			'name'        => (string) $table['name'],
			'description' => (string) $table['description'],
			'rows'        => count( $data ),
			'columns'     => count( (array) ( $data[0] ?? array() ) ),
			'first_row'   => $offset + 1,
			'data'        => array_slice( $data, $offset, $limit ),
			'visibility'  => $table['visibility'],
			'options'     => $table['options'],
			'version'     => EMCP_Tools_TablePress_Api::version( $table ),
			'shortcode'   => self::shortcode( $id ),
			'next_cursor' => $offset + $limit < count( $data ) ? (string) ( $offset + $limit ) : null,
		);
		if ( ! empty( $table['is_corrupted'] ) ) {
			$out['is_corrupted'] = true;
		}
		return $out;
	}

	const DELIMITERS = array( 'comma' => ',', 'semicolon' => ';', 'tab' => 'tab' );

	/** @return array|WP_Error */
	protected function op_export_table( array $args ) {
		$table = $this->table_or_error( (string) $args['table_id'] );
		if ( is_wp_error( $table ) ) {
			return $table;
		}
		$format    = (string) $args['format'];
		$delimiter = 'csv' === $format ? self::DELIMITERS[ (string) ( $args['delimiter'] ?? 'comma' ) ] : '';
		return array(
			'table_id' => (string) $args['table_id'],
			'format'   => $format,
			'export'   => $this->api()->export( $table, $format, "\t" === $delimiter ? 'tab' : $delimiter ),
		);
	}

	/** @return array|WP_Error */
	protected function op_render_table( array $args ) {
		$id    = (string) $args['table_id'];
		$table = $this->table_or_error( $id );
		if ( is_wp_error( $table ) ) {
			return $table;
		}
		$params = $this->parameters( (array) ( $args['parameters'] ?? array() ) );
		if ( is_wp_error( $params ) ) {
			return $params;
		}
		$html = $this->api()->render( $id, $params );
		// TablePress adds an "Edit" link for logged-in editors; visitors never see it.
		$html = (string) preg_replace( '#<caption[^>]*>\s*<a [^>]*action=edit[^>]*>[^<]*</a>\s*</caption>\s*#i', '', $html );
		return array( 'table_id' => $id, 'html' => $html );
	}

	// Table writes, all through the writer.

	protected function writer(): EMCP_Tools_TablePress_Writer {
		return new EMCP_Tools_TablePress_Writer( $this->api() );
	}

	/** The pages showing a table, for change-table-id and delete-table answers. */
	protected function usage(): callable {
		return function ( string $id ): array {
			return class_exists( 'EMCP_Tools_TablePress_Placer' ) ? EMCP_Tools_TablePress_Placer::find_usage( $id ) : array();
		};
	}

	/** @return array|WP_Error */
	protected function op_create_table( array $args, bool $dry_run ) {
		if ( isset( $args['data'] ) ) {
			$data = (array) $args['data'];
		} elseif ( isset( $args['rows'], $args['columns'] ) ) {
			if ( $args['rows'] * $args['columns'] > EMCP_Tools_TablePress_Writer::MAX_CELLS ) {
				return new WP_Error( 'too_large', __( 'That grid is larger than one write allows.', 'emcp-tools' ) );
			}
			$data = array_fill( 0, (int) $args['rows'], array_fill( 0, (int) $args['columns'], '' ) );
		} else {
			return new WP_Error( 'invalid_argument', __( 'Pass data (rows of cells) or rows and columns for an empty table.', 'emcp-tools' ) );
		}
		$table = array(
			'name'        => (string) ( $args['name'] ?? '' ),
			'description' => (string) ( $args['description'] ?? '' ),
			'data'        => $data,
		);
		if ( isset( $args['options'] ) ) {
			$table['options'] = (array) $args['options'];
		}
		if ( isset( $args['visibility'] ) ) {
			$table['visibility'] = (array) $args['visibility'];
		}
		return $this->writer()->create( $table, 'create-table', $dry_run );
	}

	/** @return array|WP_Error */
	protected function op_update_table( array $args, bool $dry_run ) {
		$fields = array_intersect_key( $args, array_flip( array( 'name', 'description', 'data', 'visibility', 'options' ) ) );
		if ( ! $fields ) {
			return new WP_Error( 'invalid_argument', __( 'Pass at least one of name, description, data, visibility or options.', 'emcp-tools' ) );
		}
		return $this->writer()->update(
			(string) $args['table_id'],
			$args['version'] ?? null,
			! empty( $args['force'] ),
			static function ( array $table ) use ( $fields ) {
				foreach ( array( 'name', 'description' ) as $key ) {
					if ( isset( $fields[ $key ] ) ) {
						$table[ $key ] = (string) $fields[ $key ];
					}
				}
				if ( isset( $fields['options'] ) ) {
					$table['options'] = array_merge( (array) $table['options'], (array) $fields['options'] );
				}
				if ( isset( $fields['data'] ) ) {
					$data          = EMCP_Tools_TablePress_Writer::pad( (array) $fields['data'] );
					$same          = $data && count( $data ) === count( $table['data'] ) && count( $data[0] ) === count( $table['data'][0] );
					$table['data'] = $data;
					if ( ! isset( $fields['visibility'] ) && ! $same && $data ) {
						$table['visibility'] = array( 'rows' => array_fill( 0, count( $data ), 1 ), 'columns' => array_fill( 0, count( $data[0] ), 1 ) );
					}
				}
				if ( isset( $fields['visibility'] ) ) {
					$table['visibility'] = (array) $fields['visibility'];
				}
				return $table;
			},
			'update-table',
			$dry_run
		);
	}

	/** Run a grid helper on the table through the writer. @return array|WP_Error */
	private function grid_write( array $args, string $operation, callable $helper, bool $dry_run = false ) {
		return $this->writer()->update( (string) $args['table_id'], $args['version'] ?? null, ! empty( $args['force'] ), $helper, $operation, $dry_run );
	}

	/** @return array|WP_Error */
	protected function op_edit_cells( array $args, bool $dry_run ) {
		$cells = (array) $args['cells'];
		return $this->grid_write(
			$args,
			'edit-cells',
			static function ( array $table ) use ( $cells ) {
				return EMCP_Tools_TablePress_Writer::edit_cells( $table, $cells );
			},
			$dry_run
		);
	}

	/** @return array|WP_Error */
	protected function op_insert_rows( array $args ) {
		return $this->grid_write(
			$args,
			'insert-rows',
			static function ( array $table ) use ( $args ) {
				return EMCP_Tools_TablePress_Writer::insert_rows( $table, (int) $args['at'], isset( $args['rows'] ) ? (array) $args['rows'] : null, isset( $args['count'] ) ? (int) $args['count'] : null, ! empty( $args['hidden'] ) );
			}
		);
	}

	/** @return array|WP_Error */
	protected function op_delete_rows( array $args ) {
		return $this->grid_write(
			$args,
			'delete-rows',
			static function ( array $table ) use ( $args ) {
				return EMCP_Tools_TablePress_Writer::delete_rows( $table, (array) $args['rows'] );
			}
		);
	}

	/** @return array|WP_Error */
	protected function op_insert_columns( array $args ) {
		return $this->grid_write(
			$args,
			'insert-columns',
			static function ( array $table ) use ( $args ) {
				return EMCP_Tools_TablePress_Writer::insert_columns( $table, (int) $args['at'], isset( $args['columns'] ) ? (array) $args['columns'] : null, isset( $args['count'] ) ? (int) $args['count'] : null, ! empty( $args['hidden'] ) );
			}
		);
	}

	/** @return array|WP_Error */
	protected function op_delete_columns( array $args ) {
		return $this->grid_write(
			$args,
			'delete-columns',
			static function ( array $table ) use ( $args ) {
				return EMCP_Tools_TablePress_Writer::delete_columns( $table, (array) $args['columns'] );
			}
		);
	}

	/** @return array|WP_Error */
	protected function op_copy_table( array $args ) {
		return $this->writer()->copy( (string) $args['table_id'], isset( $args['name'] ) ? (string) $args['name'] : null );
	}

	/** @return array|WP_Error */
	protected function op_change_table_id( array $args ) {
		return $this->writer()->change_id( (string) $args['table_id'], (string) $args['new_id'], $this->usage() );
	}

	/** @return array|WP_Error */
	protected function op_delete_table( array $args, bool $dry_run ) {
		return $this->writer()->delete( (string) $args['table_id'], $args['version'] ?? null, ! empty( $args['force'] ), $dry_run, $this->usage() );
	}

	// Import: one file, TablePress's single-file parser, one target (D8).

	const MAX_IMPORT = 5242880;

	const IMPORT_EXTENSIONS = array( 'csv', 'tsv', 'txt', 'html', 'htm', 'json', 'xls', 'xlsx', 'ods' );

	private static function temp_path(): string {
		$dir = function_exists( 'get_temp_dir' ) ? get_temp_dir() : sys_get_temp_dir() . '/';
		return rtrim( $dir, '/\\' ) . '/emcp-tp-' . bin2hex( random_bytes( 6 ) );
	}

	/** @return array{path: string, extension: string}|WP_Error */
	private function import_file( array $args ) {
		if ( isset( $args['data'] ) ) {
			if ( strlen( (string) $args['data'] ) > self::MAX_IMPORT ) {
				return new WP_Error( 'too_large', __( 'Imports are limited to 5 MB.', 'emcp-tools' ) );
			}
			$path = self::temp_path();
			if ( false === file_put_contents( $path, (string) $args['data'] ) ) {
				return new WP_Error( 'import_failed', __( 'The data could not be written to a temporary file.', 'emcp-tools' ) );
			}
			return array( 'path' => $path, 'extension' => '' );
		}
		$url    = trim( (string) $args['url'] );
		$scheme = strtolower( (string) wp_parse_url( $url, PHP_URL_SCHEME ) );
		if ( ! in_array( $scheme, array( 'http', 'https' ), true ) || '' === (string) wp_parse_url( $url, PHP_URL_HOST ) || null !== wp_parse_url( $url, PHP_URL_USER ) || null !== wp_parse_url( $url, PHP_URL_PASS ) ) {
			return new WP_Error( 'invalid_url', __( 'The URL must be http or https, without a user name or password in it.', 'emcp-tools' ) );
		}
		$api = $this->api();
		if ( $api->metadata_blocked( $url ) ) {
			return new WP_Error( 'table_import_url_host_blocked', __( 'TablePress does not import from this address.', 'emcp-tools' ) );
		}
		$url  = $api->fix_url( $url );
		$path = $api->download( $url );
		if ( is_wp_error( $path ) ) {
			return new WP_Error( 'download_failed', $path->get_error_message() );
		}
		if ( (int) filesize( $path ) > self::MAX_IMPORT ) {
			@unlink( $path ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			return new WP_Error( 'too_large', __( 'Imports are limited to 5 MB.', 'emcp-tools' ) );
		}
		$extension = strtolower( (string) pathinfo( (string) wp_parse_url( $url, PHP_URL_PATH ), PATHINFO_EXTENSION ) );
		return array( 'path' => $path, 'extension' => in_array( $extension, self::IMPORT_EXTENSIONS, true ) ? $extension : '' );
	}

	/**
	 * Archives are refused unless they are an XLSX or ODS workbook (both ZIP files).
	 *
	 * @return string|WP_Error The extension to read the file as.
	 */
	public static function archive_check( string $path, string $extension ) {
		$head = (string) file_get_contents( $path, false, null, 0, 4 );
		$mime = function_exists( 'mime_content_type' ) ? (string) mime_content_type( $path ) : '';
		if ( "PK\x03\x04" !== $head && 'application/zip' !== $mime ) {
			return in_array( $extension, array( 'xlsx', 'ods' ), true ) ? '' : $extension;
		}
		if ( class_exists( 'ZipArchive' ) ) {
			$zip = new ZipArchive();
			if ( true === $zip->open( $path ) ) {
				$type = '';
				if ( false !== $zip->locateName( 'xl/workbook.xml' ) ) {
					$type = 'xlsx';
				} elseif ( 'application/vnd.oasis.opendocument.spreadsheet' === trim( (string) $zip->getFromName( 'mimetype' ) ) ) {
					$type = 'ods';
				}
				$zip->close();
				if ( '' !== $type ) {
					return $type;
				}
			}
		}
		return new WP_Error( 'archive_refused', __( 'Archives are not imported: send one CSV, HTML, JSON, XLSX or ODS file per call.', 'emcp-tools' ) );
	}

	/** @return array|WP_Error */
	protected function op_import_table( array $args ) {
		$mode = (string) ( $args['mode'] ?? 'add' );
		if ( isset( $args['data'] ) === isset( $args['url'] ) ) {
			return new WP_Error( 'invalid_argument', __( 'Pass exactly one of data or url.', 'emcp-tools' ) );
		}
		if ( 'add' !== $mode && ! isset( $args['table_id'] ) ) {
			return new WP_Error( 'missing_argument', __( 'replace and append need the table_id of the table to change.', 'emcp-tools' ) );
		}
		$file = $this->import_file( $args );
		if ( is_wp_error( $file ) ) {
			return $file;
		}
		try {
			$extension = self::archive_check( $file['path'], $file['extension'] );
			if ( is_wp_error( $extension ) ) {
				return $extension;
			}
			$parsed = $this->api()->parse_file( $file['path'], $extension );
		} finally {
			@unlink( $file['path'] ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}
		if ( is_wp_error( $parsed ) ) {
			return new WP_Error( 'import_failed', $this->api()->error_string( $parsed ) );
		}
		$data = EMCP_Tools_TablePress_Writer::pad( (array) ( $parsed['data'] ?? array() ) );
		if ( ! $data || ! $data[0] ) {
			return new WP_Error( 'import_failed', __( 'The file holds no table.', 'emcp-tools' ) );
		}
		// The file never chooses or renames a table.
		unset( $parsed['id'] );
		$vis_fits = isset( $parsed['visibility']['rows'], $parsed['visibility']['columns'] ) && count( (array) $parsed['visibility']['rows'] ) === count( $data ) && count( (array) $parsed['visibility']['columns'] ) === count( $data[0] );

		if ( 'add' === $mode ) {
			$table = array(
				'name'        => (string) ( $args['name'] ?? $parsed['name'] ?? __( 'Imported table', 'emcp-tools' ) ),
				'description' => (string) ( $args['description'] ?? $parsed['description'] ?? '' ),
				'data'        => $data,
			);
			if ( isset( $parsed['options'] ) && is_array( $parsed['options'] ) ) {
				$table['options'] = array_intersect_key( $parsed['options'], array_diff_key( (array) $this->api()->template()['options'], array( 'last_editor' => 1 ) ) );
			}
			if ( $vis_fits ) {
				$table['visibility'] = $parsed['visibility'];
			}
			return $this->writer()->create( $table, 'import-table' );
		}

		$options = isset( $parsed['options'] ) && is_array( $parsed['options'] ) ? $parsed['options'] : array();
		$known   = array_diff_key( (array) $this->api()->template()['options'], array( 'last_editor' => 1 ) );
		return $this->writer()->update(
			(string) $args['table_id'],
			$args['version'] ?? null,
			! empty( $args['force'] ),
			static function ( array $table ) use ( $mode, $data, $parsed, $options, $known, $vis_fits ) {
				if ( 'replace' === $mode ) {
					$table['data']       = $data;
					$table['visibility'] = $vis_fits ? $parsed['visibility'] : array( 'rows' => array_fill( 0, count( $data ), 1 ), 'columns' => array_fill( 0, count( $data[0] ), 1 ) );
					if ( $options ) {
						$table['options'] = array_merge( (array) $table['options'], array_intersect_key( $options, $known ) );
					}
					return $table;
				}
				// append: every imported row, the grid padded to the wider width.
				$width               = max( count( $table['data'][0] ), count( $data[0] ) );
				$table['data']       = EMCP_Tools_TablePress_Writer::pad( array_merge( $table['data'], $data ) );
				$table['data']       = array_map(
					static function ( $row ) use ( $width ) {
						return array_pad( $row, $width, '' );
					},
					$table['data']
				);
				$table['visibility'] = array(
					'rows'    => array_merge( $table['visibility']['rows'], array_fill( 0, count( $data ), 1 ) ),
					'columns' => array_pad( $table['visibility']['columns'], $width, 1 ),
				);
				return $table;
			},
			'import-table'
		);
	}

	/** @return array|WP_Error */
	protected function op_find_usage( array $args ) {
		$id = (string) $args['table_id'];
		return array( 'table_id' => $id, 'used_on' => EMCP_Tools_TablePress_Placer::find_usage( $id ) );
	}

	/** @return array|WP_Error */
	protected function op_place_table( array $args ) {
		$id = (string) $args['table_id'];
		if ( ! $this->api()->exists( $id ) ) {
			/* translators: %s: table id. */
			return new WP_Error( 'not_found', sprintf( __( 'There is no table "%s".', 'emcp-tools' ), $id ) );
		}
		$params = $this->parameters( (array) ( $args['parameters'] ?? array() ) );
		if ( is_wp_error( $params ) ) {
			return $params;
		}
		return EMCP_Tools_TablePress_Placer::place( $id, (int) $args['post_id'], (string) ( $args['position'] ?? 'append' ), isset( $args['container_id'] ) ? (string) $args['container_id'] : null, $params );
	}

	// Custom CSS: the steps of TablePress's options save (handle_post_action_options() and its
	// save_custom_css follow-up screen).

	/** Apply CSS settings; returns the options afterwards. */
	private function apply_css( array $new ): array {
		$api     = $this->api();
		$options = array();
		if ( array_key_exists( 'use_custom_css', $new ) ) {
			$options['use_custom_css'] = (bool) $new['use_custom_css'];
		}
		$write_files = false;
		$css         = null;
		if ( array_key_exists( 'custom_css', $new ) ) {
			$css                            = $api->prepare_css( (string) $new['custom_css'] );
			$options['custom_css']          = $css['css'];
			$options['custom_css_minified'] = $css['minified'];
			if ( $css['css'] !== $api->css_file_contents() ) {
				$write_files                    = true;
				$options['use_custom_css_file'] = false;
			}
		}
		$api->update_plugin_options( $options );
		$api->flush_caches();
		if ( $write_files && $api->filesystem_direct() && $api->save_css_files( $css['css'], $css['minified'] ) ) {
			$current = $api->plugin_options();
			$api->update_plugin_options(
				array(
					'use_custom_css_file' => true,
					'custom_css_version'  => (int) ( $current['custom_css_version'] ?? 0 ) + 1,
				)
			);
		}
		return $api->plugin_options();
	}

	/** @return array|WP_Error */
	protected function op_update_custom_css( array $args ) {
		if ( ! array_key_exists( 'custom_css', $args ) && ! array_key_exists( 'use_custom_css', $args ) ) {
			return new WP_Error( 'invalid_argument', __( 'Pass custom_css, use_custom_css or both.', 'emcp-tools' ) );
		}
		return $this->writer()->with_lease(
			function () use ( $args ) {
				$api    = $this->api();
				$before = $api->plugin_options();
				$after  = $this->apply_css( array_intersect_key( $args, array_flip( array( 'custom_css', 'use_custom_css' ) ) ) );
				$change = EMCP_Tools_TablePress_History::record_css( $before, $after );
				if ( '' === $change ) {
					$this->apply_css( array( 'custom_css' => (string) ( $before['custom_css'] ?? '' ), 'use_custom_css' => ! empty( $before['use_custom_css'] ) ) );
					return new WP_Error( 'history_unavailable', __( 'History could not record the CSS change, so it was put back.', 'emcp-tools' ), array( 'restored' => true ) );
				}
				return array(
					'use_custom_css'   => ! empty( $after['use_custom_css'] ),
					'custom_css'       => (string) ( $after['custom_css'] ?? '' ),
					'served_from_file' => ! empty( $after['use_custom_css_file'] ),
					'change'           => array( 'change_id' => $change, 'undo' => array( 'available' => true ) ),
				);
			}
		);
	}

	/** History's undo of update-custom-css. @return true|WP_Error */
	public function restore_css( array $before, string $after_hash, bool $force ) {
		return $this->writer()->with_lease(
			function () use ( $before, $after_hash, $force ) {
				if ( ! $force && ! hash_equals( $after_hash, EMCP_Tools_TablePress_History::css_hash( $this->api()->plugin_options() ) ) ) {
					return new WP_Error( 'conflict', __( 'The TablePress custom CSS changed after this change, so it is not undone.', 'emcp-tools' ) );
				}
				$this->apply_css( array( 'custom_css' => (string) ( $before['custom_css'] ?? '' ), 'use_custom_css' => ! empty( $before['use_custom_css'] ) ) );
				return true;
			}
		);
	}

	/** @return array */
	protected function op_get_custom_css( array $args ) {
		$o = $this->api()->plugin_options();
		return array(
			'use_custom_css'   => ! empty( $o['use_custom_css'] ),
			'custom_css'       => (string) ( $o['custom_css'] ?? '' ),
			'served_from_file' => ! empty( $o['use_custom_css_file'] ),
		);
	}
}
