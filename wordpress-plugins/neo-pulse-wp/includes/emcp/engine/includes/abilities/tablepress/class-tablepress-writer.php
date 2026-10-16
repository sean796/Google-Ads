<?php
/**
 * Every TablePress table write EMCP makes (3.19.0): the site-wide registry lease, a fresh
 * registry, the before-image, the version and privileged-content checks, TablePress's own
 * prepare_table() and save(), an exact check of what was stored, recovery when TablePress left a
 * change half done, and History. Undo mode (History's handlers) runs the same path without
 * recording, because the change log suppresses recording during an undo and records the
 * completion itself.
 *
 * Also the pure grid helpers (rows and columns numbered from 1).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_TablePress_Writer {

	const LEASE     = 'tablepress-registry';
	const TTL       = 60;
	const MAX_CELLS = 100000;
	const MAX_EDITS = 5000;
	const MAX_DIFF  = 200;

	/** @var EMCP_Tools_Lease|null */
	private static $lease = null;

	/** @var callable|null Test seam: runs once the lease is held, before anything is read. */
	public static $on_lease = null;

	/** @var EMCP_Tools_TablePress_Api */
	private $api;

	public function __construct( EMCP_Tools_TablePress_Api $api ) {
		$this->api = $api;
	}

	public static function use_lease( ?EMCP_Tools_Lease $lease ): void {
		self::$lease = $lease;
	}

	private static function lease(): EMCP_Tools_Lease {
		if ( null === self::$lease ) {
			self::$lease = new EMCP_Tools_Lease();
		}
		return self::$lease;
	}

	/** Run $fn holding the registry lease, with the registry read fresh. @return mixed|WP_Error */
	private function locked( callable $fn ) {
		$owner = 'tp-' . bin2hex( random_bytes( 6 ) );
		if ( ! self::lease()->acquire( self::LEASE, $owner, self::TTL ) ) {
			return new WP_Error( 'tablepress_busy', __( 'Another TablePress change is running. Try again in a moment.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		try {
			if ( self::$on_lease ) {
				( self::$on_lease )();
			}
			$this->api->refresh_registry();
			return $fn();
		} finally {
			self::lease()->release( self::LEASE, $owner );
		}
	}

	/** Run $fn under the registry lease with fresh TablePress options (custom CSS writes). @return mixed|WP_Error */
	public function with_lease( callable $fn ) {
		return $this->locked( $fn );
	}

	private function unfiltered(): bool {
		return $this->api->can( 'unfiltered_html' );
	}

	// Pure grid helpers.

	/** @return array[] Rectangular grid of strings. */
	public static function pad( array $data ): array {
		$width = 0;
		foreach ( $data as $row ) {
			$width = max( $width, count( (array) $row ) );
		}
		$out = array();
		foreach ( $data as $row ) {
			$row   = array_map( 'strval', array_values( (array) $row ) );
			$out[] = array_pad( $row, $width, '' );
		}
		return $out;
	}

	private static function bad( string $code, string $message ): WP_Error {
		return new WP_Error( $code, $message );
	}

	/** @return array|WP_Error */
	public static function insert_rows( array $table, int $at, ?array $rows, ?int $count, bool $hidden ) {
		$data  = (array) $table['data'];
		$width = count( (array) ( $data[0] ?? array() ) );
		if ( $at < 1 || $at > count( $data ) + 1 ) {
			return self::bad( 'out_of_range', __( 'at must be a row number from 1 to the number of rows plus 1.', 'emcp-tools' ) );
		}
		if ( null === $rows ) {
			if ( null === $count || $count < 1 ) {
				return self::bad( 'invalid_argument', __( 'Pass rows or a count.', 'emcp-tools' ) );
			}
			$rows = array_fill( 0, $count, array() );
		}
		$new = array();
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) || count( $row ) > $width ) {
				return self::bad( 'too_wide', __( 'A new row has more cells than the table has columns; insert columns first.', 'emcp-tools' ) );
			}
			$new[] = array_pad( array_map( 'strval', array_values( $row ) ), $width, '' );
		}
		array_splice( $table['data'], $at - 1, 0, $new );
		array_splice( $table['visibility']['rows'], $at - 1, 0, array_fill( 0, count( $new ), $hidden ? 0 : 1 ) );
		return $table;
	}

	/** @return array|WP_Error */
	public static function delete_rows( array $table, array $numbers ) {
		$total   = count( (array) $table['data'] );
		$numbers = array_values( array_unique( array_map( 'intval', $numbers ) ) );
		foreach ( $numbers as $n ) {
			if ( $n < 1 || $n > $total ) {
				return self::bad( 'out_of_range', __( 'A row number is outside the table.', 'emcp-tools' ) );
			}
		}
		if ( count( $numbers ) >= $total ) {
			return self::bad( 'would_empty', __( 'A table keeps at least one row.', 'emcp-tools' ) );
		}
		rsort( $numbers );
		foreach ( $numbers as $n ) {
			array_splice( $table['data'], $n - 1, 1 );
			array_splice( $table['visibility']['rows'], $n - 1, 1 );
		}
		return $table;
	}

	/** @return array|WP_Error */
	public static function insert_columns( array $table, int $at, ?array $columns, ?int $count, bool $hidden ) {
		$data   = (array) $table['data'];
		$height = count( $data );
		$width  = count( (array) ( $data[0] ?? array() ) );
		if ( $at < 1 || $at > $width + 1 ) {
			return self::bad( 'out_of_range', __( 'at must be a column number from 1 to the number of columns plus 1.', 'emcp-tools' ) );
		}
		if ( null === $columns ) {
			if ( null === $count || $count < 1 ) {
				return self::bad( 'invalid_argument', __( 'Pass columns or a count.', 'emcp-tools' ) );
			}
			$columns = array_fill( 0, $count, array() );
		}
		$new = array();
		foreach ( $columns as $col ) {
			if ( ! is_array( $col ) || count( $col ) > $height ) {
				return self::bad( 'too_long', __( 'A new column has more cells than the table has rows; insert rows first.', 'emcp-tools' ) );
			}
			$new[] = array_pad( array_map( 'strval', array_values( $col ) ), $height, '' );
		}
		foreach ( $table['data'] as $r => $row ) {
			$cells = array();
			foreach ( $new as $col ) {
				$cells[] = $col[ $r ];
			}
			array_splice( $row, $at - 1, 0, $cells );
			$table['data'][ $r ] = $row;
		}
		array_splice( $table['visibility']['columns'], $at - 1, 0, array_fill( 0, count( $new ), $hidden ? 0 : 1 ) );
		return $table;
	}

	/** @return array|WP_Error */
	public static function delete_columns( array $table, array $numbers ) {
		$width   = count( (array) ( $table['data'][0] ?? array() ) );
		$numbers = array_values( array_unique( array_map( 'intval', $numbers ) ) );
		foreach ( $numbers as $n ) {
			if ( $n < 1 || $n > $width ) {
				return self::bad( 'out_of_range', __( 'A column number is outside the table.', 'emcp-tools' ) );
			}
		}
		if ( count( $numbers ) >= $width ) {
			return self::bad( 'would_empty', __( 'A table keeps at least one column.', 'emcp-tools' ) );
		}
		rsort( $numbers );
		foreach ( $numbers as $n ) {
			foreach ( $table['data'] as $r => $row ) {
				array_splice( $row, $n - 1, 1 );
				$table['data'][ $r ] = $row;
			}
			array_splice( $table['visibility']['columns'], $n - 1, 1 );
		}
		return $table;
	}

	/** @return array|WP_Error */
	public static function edit_cells( array $table, array $cells ) {
		if ( count( $cells ) > self::MAX_EDITS ) {
			/* translators: %d: maximum. */
			return self::bad( 'too_many_cells', sprintf( __( 'At most %d cells per call.', 'emcp-tools' ), self::MAX_EDITS ) );
		}
		$height = count( (array) $table['data'] );
		$width  = count( (array) ( $table['data'][0] ?? array() ) );
		foreach ( $cells as $c ) {
			$row = is_array( $c ) ? (int) ( $c['row'] ?? 0 ) : 0;
			$col = is_array( $c ) ? (int) ( $c['column'] ?? 0 ) : 0;
			if ( ! is_array( $c ) || ! array_key_exists( 'value', $c ) || ! is_scalar( $c['value'] ) ) {
				return self::bad( 'invalid_argument', __( 'Each cell needs row, column and a text value.', 'emcp-tools' ) );
			}
			if ( $row < 1 || $row > $height || $col < 1 || $col > $width ) {
				/* translators: 1: row, 2: column. */
				return self::bad( 'out_of_range', sprintf( __( 'Cell row %1$d, column %2$d is outside the table.', 'emcp-tools' ), $row, $col ) );
			}
			$table['data'][ $row - 1 ][ $col - 1 ] = (string) $c['value'];
		}
		return $table;
	}

	// Checks shared by every write.

	/** Cells (1-based) whose content TablePress's sanitizing would change. */
	private function unsafe_cells( array $table ): array {
		$clean = $this->api->sanitize( $table );
		$cells = array();
		foreach ( (array) $table['data'] as $r => $row ) {
			foreach ( (array) $row as $c => $cell ) {
				if ( (string) $cell !== (string) ( $clean['data'][ $r ][ $c ] ?? '' ) ) {
					$cells[] = array( 'row' => $r + 1, 'column' => $c + 1 );
				}
			}
		}
		if ( (string) $table['name'] !== (string) $clean['name'] || (string) $table['description'] !== (string) $clean['description'] ) {
			array_unshift( $cells, array( 'row' => 0, 'column' => 0, 'field' => 'name or description' ) );
		}
		return $cells;
	}

	/** D11: a user without unfiltered_html cannot write a table TablePress would strip. @return true|WP_Error */
	private function privileged_check( array $table ) {
		if ( $this->unfiltered() ) {
			return true;
		}
		$cells = $this->unsafe_cells( $table );
		if ( ! $cells ) {
			return true;
		}
		return new WP_Error(
			'privileged_content',
			__( 'This table holds content that only users with the unfiltered_html capability may save (TablePress would strip it from the whole table). Ask an administrator to make this change.', 'emcp-tools' ),
			array( 'cells' => array_slice( $cells, 0, 20 ) )
		);
	}

	/** Shape checks on a new table. @return true|WP_Error */
	private function shape( array $new ) {
		$data = $new['data'] ?? null;
		if ( ! is_array( $data ) || ! $data ) {
			return self::bad( 'invalid_argument', __( 'data must be a list of rows.', 'emcp-tools' ) );
		}
		$cells = 0;
		foreach ( $data as $row ) {
			if ( ! is_array( $row ) || ! $row ) {
				return self::bad( 'invalid_argument', __( 'Every row must be a non-empty list of cells.', 'emcp-tools' ) );
			}
			foreach ( $row as $cell ) {
				if ( ! is_scalar( $cell ) && null !== $cell ) {
					return self::bad( 'invalid_argument', __( 'Every cell must be text, a number or a boolean.', 'emcp-tools' ) );
				}
			}
			$cells += count( $row );
		}
		if ( $cells > self::MAX_CELLS ) {
			/* translators: %d: maximum. */
			return self::bad( 'too_large', sprintf( __( 'At most %d cells per write.', 'emcp-tools' ), self::MAX_CELLS ) );
		}
		$rows = count( $data );
		$cols = count( $data[0] );
		$vis  = $new['visibility'] ?? null;
		if ( ! is_array( $vis ) || ! isset( $vis['rows'], $vis['columns'] ) || ! is_array( $vis['rows'] ) || ! is_array( $vis['columns'] ) || count( $vis['rows'] ) !== $rows || count( $vis['columns'] ) !== $cols ) {
			return self::bad( 'invalid_visibility', __( 'visibility needs rows and columns lists of 1 (shown) or 0 (hidden), one per row and per column.', 'emcp-tools' ) );
		}
		foreach ( array_merge( $vis['rows'], $vis['columns'] ) as $flag ) {
			if ( ! in_array( $flag, array( 0, 1, '0', '1', true, false ), true ) ) {
				return self::bad( 'invalid_visibility', __( 'visibility values are 1 (shown) or 0 (hidden).', 'emcp-tools' ) );
			}
		}
		$known = array_keys( (array) $this->api->template()['options'] );
		foreach ( array_keys( (array) ( $new['options'] ?? array() ) ) as $key ) {
			if ( ! in_array( $key, $known, true ) || 'last_editor' === $key ) {
				/* translators: %s: option name. */
				return self::bad( 'unknown_option', sprintf( __( '"%s" is not a TablePress table option. get-setup lists them.', 'emcp-tools' ), $key ) );
			}
		}
		return true;
	}

	/** The table TablePress is expected to store for this user. */
	private function expected( array $prepared ): array {
		return $this->unfiltered() ? $prepared : $this->api->sanitize( $prepared );
	}

	private static function same( array $a, array $b ): bool {
		return EMCP_Tools_TablePress_Api::canonical( $a ) === EMCP_Tools_TablePress_Api::canonical( $b );
	}

	/** @return array|WP_Error The prepared table. */
	private function prepare_for( string $id, array $new ) {
		$existing = $this->api->load( $id, false );
		if ( is_wp_error( $existing ) ) {
			return new WP_Error( 'not_found', __( 'The table is gone.', 'emcp-tools' ) );
		}
		$new['id']     = $id;
		$new['number'] = array( 'rows' => count( $new['data'] ), 'columns' => count( $new['data'][0] ) );
		$prepared      = $this->api->prepare( $existing, $new, true );
		if ( is_wp_error( $prepared ) ) {
			return new WP_Error( 'invalid_table', $this->api->error_string( $prepared ) );
		}
		return $prepared;
	}

	/** Write a table state back and check it exactly. */
	private function put_back( string $id, array $state ): bool {
		$this->api->refresh_registry();
		$now = $this->api->load( $id, true );
		if ( ! is_wp_error( $now ) && self::same( $now, $state ) ) {
			return true;
		}
		$prepared = $this->prepare_for( $id, EMCP_Tools_TablePress_Api::canonical( $state ) );
		if ( is_wp_error( $prepared ) ) {
			return false;
		}
		try {
			$saved = $this->api->save( $prepared );
		} catch ( \Throwable $e ) {
			$saved = new WP_Error( 'save_threw', $e->getMessage() );
		}
		$this->api->refresh_registry();
		$now = $this->api->load( $id, true );
		return ! is_wp_error( $saved ) && ! is_wp_error( $now ) && self::same( $now, $state );
	}

	private static function diff( array $before, array $after ): array {
		$out = array();
		foreach ( (array) $after['data'] as $r => $row ) {
			foreach ( (array) $row as $c => $cell ) {
				$was = $before['data'][ $r ][ $c ] ?? null;
				if ( (string) $cell !== (string) $was || null === $was ) {
					$out[] = array( 'row' => $r + 1, 'column' => $c + 1, 'before' => $was, 'after' => (string) $cell );
					if ( count( $out ) >= self::MAX_DIFF ) {
						return $out;
					}
				}
			}
		}
		return $out;
	}

	private function answer( string $id, array $table, string $change = '' ): array {
		$data = (array) $table['data'];
		return array(
			'id'        => $id,
			'version'   => EMCP_Tools_TablePress_Api::version( $table ),
			'rows'      => count( $data ),
			'columns'   => count( (array) ( $data[0] ?? array() ) ),
			'shortcode' => EMCP_Tools_TablePress_Integration::shortcode( $id ),
			'change'    => array( 'change_id' => $change, 'undo' => array( 'available' => '' !== $change ) ),
		);
	}

	// Edits of an existing table.

	/**
	 * Change a table.
	 *
	 * @param callable   $change ( array $table ): array|WP_Error, the new {name, description, data, options, visibility}.
	 * @param array|null $undo   Undo mode: the state to restore (History's before-image).
	 * @return array|WP_Error
	 */
	public function update( string $id, ?string $version, bool $force, ?callable $change, string $operation, bool $dry_run = false, ?array $undo = null ) {
		return $this->locked(
			function () use ( $id, $version, $force, $change, $operation, $dry_run, $undo ) {
				$before = $this->api->load( $id, true );
				if ( is_wp_error( $before ) ) {
					return null === $undo
						/* translators: %s: table id. */
						? new WP_Error( 'not_found', sprintf( __( 'There is no table "%s".', 'emcp-tools' ), $id ) )
						: new WP_Error( 'conflict', __( 'The table is gone, so the change is not undone.', 'emcp-tools' ) );
				}
				if ( ! empty( $before['is_corrupted'] ) ) {
					return new WP_Error( 'table_corrupted', __( 'TablePress reports this table as corrupted; do not edit it (see https://tablepress.org/faq/corrupted-tables/).', 'emcp-tools' ) );
				}
				if ( ! $force ) {
					if ( null === $version || '' === $version ) {
						return new WP_Error( 'missing_version', __( 'Pass the version from get-table, or force:true.', 'emcp-tools' ) );
					}
					$current = EMCP_Tools_TablePress_Api::version( $before );
					if ( ! hash_equals( $current, $version ) ) {
						return new WP_Error(
							null === $undo ? 'conflict' : 'conflict',
							null === $undo ? __( 'The table changed since it was read. Read it again, or pass force:true to overwrite.', 'emcp-tools' ) : __( 'The table changed after this History entry, so it is not undone.', 'emcp-tools' ),
							array( 'current_version' => $current )
						);
					}
				}
				$ok = $this->privileged_check( $before );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				if ( null !== $undo ) {
					$new = EMCP_Tools_TablePress_Api::canonical( $undo );
					$ok  = $this->privileged_check( $new );
					if ( is_wp_error( $ok ) ) {
						return $ok;
					}
				} else {
					$new = $change( EMCP_Tools_TablePress_Api::canonical( $before ) + array( 'options' => $before['options'] ) );
					if ( is_wp_error( $new ) ) {
						return $new;
					}
				}
				$new['data'] = self::pad( (array) ( $new['data'] ?? array() ) );
				$shape       = $this->shape( $new );
				if ( is_wp_error( $shape ) ) {
					return $shape;
				}
				$kept = false;
				if ( null === $undo && ! $this->unfiltered() ) {
					$stored = (string) ( $before['options']['datatables_custom_commands'] ?? '' );
					if ( array_key_exists( 'datatables_custom_commands', (array) ( $new['options'] ?? array() ) ) && (string) $new['options']['datatables_custom_commands'] !== $stored ) {
						$kept = true;
					}
					$new['options']['datatables_custom_commands'] = $stored;
				}
				$prepared = $this->prepare_for( $id, $new );
				if ( is_wp_error( $prepared ) ) {
					return $prepared;
				}
				$expected = $this->expected( $prepared );
				if ( $dry_run ) {
					return array(
						'dry_run'       => true,
						'id'            => $id,
						'before'        => array( 'rows' => count( $before['data'] ), 'columns' => count( $before['data'][0] ) ),
						'after'         => array( 'rows' => count( $expected['data'] ), 'columns' => count( $expected['data'][0] ) ),
						'changed_cells' => self::diff( $before, $expected ),
						'version'       => EMCP_Tools_TablePress_Api::version( $expected ),
					);
				}
				return $this->commit_edit( $id, $before, $prepared, $expected, $operation, null !== $undo, $kept, $new );
			}
		);
	}

	/** Steps 8 to 10 of an edit, with recovery. @return array|WP_Error */
	private function commit_edit( string $id, array $before, array $prepared, array $expected, string $operation, bool $undo_mode, bool $kept, array $sent ) {
		try {
			$saved = $this->api->save( $prepared );
		} catch ( \Throwable $e ) {
			$saved = new WP_Error( 'save_threw', $e->getMessage() );
		}
		$failure = null;
		if ( is_wp_error( $saved ) ) {
			$failure = array( 'save_failed', $this->api->error_string( $saved ) );
		} else {
			$this->api->refresh_registry();
			$now = $this->api->load( $id, true );
			if ( is_wp_error( $now ) || ! self::same( $now, $expected ) ) {
				$failure = array( 'save_incomplete', __( 'TablePress did not store the table as written.', 'emcp-tools' ) );
			}
		}
		if ( $failure ) {
			$restored = $this->put_back( $id, $before );
			$data     = array( 'restored' => $restored, 'detail' => $failure[1] );
			if ( ! $restored && ! $undo_mode ) {
				$this->api->refresh_registry();
				$stored = $this->api->load( $id, true );
				if ( ! is_wp_error( $stored ) ) {
					$data['change_id'] = EMCP_Tools_TablePress_History::record_edit( $operation, $id, $before, $stored );
				}
			}
			$message = $restored ? __( 'TablePress could not save the table, so it was put back as it was.', 'emcp-tools' ) : __( 'TablePress could not save the table and it could not be put back; History holds the earlier state to undo once the cause is fixed.', 'emcp-tools' );
			return new WP_Error( $failure[0], $message, $data );
		}
		$change = '';
		if ( ! $undo_mode ) {
			$change = EMCP_Tools_TablePress_History::record_edit( $operation, $id, $before, $now );
			if ( '' === $change ) {
				$restored = $this->put_back( $id, $before );
				return new WP_Error(
					'history_unavailable',
					$restored ? __( 'History could not record this change, so the table was put back as it was (a change is never kept without its undo).', 'emcp-tools' ) : __( 'History could not record this change and the table could not be put back.', 'emcp-tools' ),
					array( 'restored' => $restored, 'version' => EMCP_Tools_TablePress_Api::version( $restored ? $before : $now ) )
				);
			}
		}
		$out = $this->answer( $id, $now, $change );
		if ( ! $this->unfiltered() ) {
			$sanitized = array();
			foreach ( (array) $sent['data'] as $r => $row ) {
				foreach ( (array) $row as $c => $cell ) {
					if ( (string) $cell !== (string) ( $now['data'][ $r ][ $c ] ?? '' ) ) {
						$sanitized[] = array( 'row' => $r + 1, 'column' => $c + 1 );
					}
				}
			}
			if ( $sanitized ) {
				$out['sanitized'] = array_slice( $sanitized, 0, self::MAX_DIFF );
			}
		}
		if ( $kept ) {
			$out['custom_commands_kept'] = true;
		}
		if ( $undo_mode ) {
			$out['note'] = __( 'Restored; TablePress added a revision.', 'emcp-tools' );
		}
		return $out;
	}

	// Creations.

	/** Clean up after a failed add(): its post exists without a table id. */
	private function clean_failed_add( WP_Error $error ): array {
		$post_id = $error->get_error_data();
		if ( ! is_int( $post_id ) && ! ( is_string( $post_id ) && ctype_digit( $post_id ) ) ) {
			return array( 'cleaned_up' => true );
		}
		$post_id = (int) $post_id;
		$this->api->refresh_registry();
		if ( $this->api->orphan_post( $post_id ) && $this->api->delete_post( $post_id ) ) {
			return array( 'cleaned_up' => true );
		}
		return array( 'cleaned_up' => false, 'post_id' => $post_id );
	}

	/** Finish a creation: exact check and History, deleting the table on failure. @return array|WP_Error */
	private function finish_creation( string $id, ?array $expected, string $operation ) {
		$this->api->refresh_registry();
		$now = $this->api->load( $id, true );
		if ( is_wp_error( $now ) || ( null !== $expected && ! self::same( $now, $expected ) ) ) {
			$this->api->delete( $id );
			return new WP_Error( 'create_failed', __( 'TablePress did not store the new table as written, so it was removed.', 'emcp-tools' ), array( 'cleaned_up' => ! $this->api->exists( $id ) ) );
		}
		$change = EMCP_Tools_TablePress_History::record_created( $operation, $id, $now );
		if ( '' === $change ) {
			$this->api->delete( $id );
			return new WP_Error( 'history_unavailable', __( 'History could not record the new table, so it was removed (a change is never kept without its undo).', 'emcp-tools' ), array( 'restored' => ! $this->api->exists( $id ), 'cleaned_up' => ! $this->api->exists( $id ) ) );
		}
		return $this->answer( $id, $now, $change );
	}

	/**
	 * Create a table from {name, description, data, options?, visibility?}.
	 *
	 * @return array|WP_Error
	 */
	public function create( array $table, string $operation, bool $dry_run = false ) {
		return $this->locked(
			function () use ( $table, $operation, $dry_run ) {
				$template      = $this->api->template();
				$table['data'] = self::pad( (array) ( $table['data'] ?? array() ) );
				if ( ! isset( $table['visibility'] ) && $table['data'] ) {
					$table['visibility'] = array( 'rows' => array_fill( 0, count( $table['data'] ), 1 ), 'columns' => array_fill( 0, count( $table['data'][0] ), 1 ) );
				}
				$shape = $this->shape( $table );
				if ( is_wp_error( $shape ) ) {
					return $shape;
				}
				$kept = false;
				if ( ! $this->unfiltered() && '' !== (string) ( $table['options']['datatables_custom_commands'] ?? '' ) ) {
					$kept = true;
				}
				if ( ! $this->unfiltered() ) {
					$table['options']['datatables_custom_commands'] = (string) ( $template['options']['datatables_custom_commands'] ?? '' );
				}
				$new      = array(
					'name'        => (string) ( $table['name'] ?? '' ),
					'description' => (string) ( $table['description'] ?? '' ),
					'data'        => $table['data'],
					'visibility'  => $table['visibility'],
				);
				if ( isset( $table['options'] ) ) {
					$new['options'] = (array) $table['options'];
				}
				$prepared = $this->api->prepare( $template, $new, false );
				if ( is_wp_error( $prepared ) ) {
					return new WP_Error( 'invalid_table', $this->api->error_string( $prepared ) );
				}
				$expected = $this->expected( $prepared );
				if ( $dry_run ) {
					return array( 'dry_run' => true, 'rows' => count( $expected['data'] ), 'columns' => count( $expected['data'][0] ), 'version' => EMCP_Tools_TablePress_Api::version( $expected ) );
				}
				try {
					$id = $this->api->add( $prepared );
				} catch ( \Throwable $e ) {
					$id = new WP_Error( 'add_threw', $e->getMessage() );
				}
				if ( is_wp_error( $id ) ) {
					return new WP_Error( 'create_failed', $this->api->error_string( $id ), $this->clean_failed_add( $id ) );
				}
				$out = $this->finish_creation( (string) $id, $expected, $operation );
				if ( is_array( $out ) && $kept ) {
					$out['custom_commands_kept'] = true;
				}
				return $out;
			}
		);
	}

	/** @return array|WP_Error */
	public function copy( string $id, ?string $name ) {
		return $this->locked(
			function () use ( $id, $name ) {
				$source = $this->api->load( $id, true );
				if ( is_wp_error( $source ) ) {
					/* translators: %s: table id. */
					return new WP_Error( 'not_found', sprintf( __( 'There is no table "%s".', 'emcp-tools' ), $id ) );
				}
				// TablePress sanitizes the copy for this user: refuse rather than copy it stripped (D11).
				$ok = $this->privileged_check( $source );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				try {
					$new = $this->api->copy( $id );
				} catch ( \Throwable $e ) {
					$new = new WP_Error( 'copy_threw', $e->getMessage() );
				}
				if ( is_wp_error( $new ) ) {
					return new WP_Error( 'create_failed', $this->api->error_string( $new ), $this->clean_failed_add( $new ) );
				}
				$new = (string) $new;
				if ( null !== $name && '' !== $name ) {
					$this->api->refresh_registry();
					$table = $this->api->load( $new, true );
					if ( ! is_wp_error( $table ) ) {
						$canon         = EMCP_Tools_TablePress_Api::canonical( $table );
						$canon['name'] = $name;
						$prepared      = $this->prepare_for( $new, $canon );
						if ( is_wp_error( $prepared ) || is_wp_error( $this->api->save( $prepared ) ) ) {
							$this->api->delete( $new );
							return new WP_Error( 'create_failed', __( 'The copy could not be renamed, so it was removed.', 'emcp-tools' ), array( 'cleaned_up' => ! $this->api->exists( $new ) ) );
						}
					}
				}
				return $this->finish_creation( $new, null, 'copy-table' );
			}
		);
	}

	// Registry changes.

	/** @return array|WP_Error */
	public function change_id( string $old, string $new, ?callable $usage = null ) {
		return $this->locked(
			function () use ( $old, $new, $usage ) {
				if ( ! $this->api->exists( $old ) ) {
					/* translators: %s: table id. */
					return new WP_Error( 'not_found', sprintf( __( 'There is no table "%s".', 'emcp-tools' ), $old ) );
				}
				if ( $this->api->exists( $new ) ) {
					/* translators: %s: table id. */
					return new WP_Error( 'id_taken', sprintf( __( 'A table with the id "%s" exists already.', 'emcp-tools' ), $new ) );
				}
				$used = $usage ? $usage( $old ) : array();
				$done = $this->api->change_id( $old, $new );
				if ( is_wp_error( $done ) ) {
					return new WP_Error( 'change_id_failed', $this->api->error_string( $done ) );
				}
				$this->api->refresh_registry();
				if ( ! $this->api->exists( $new ) || $this->api->exists( $old ) ) {
					return new WP_Error( 'change_id_failed', __( 'TablePress did not move the table to the new id.', 'emcp-tools' ) );
				}
				$change = EMCP_Tools_TablePress_History::record_id_change( $old, $new );
				if ( '' === $change ) {
					$this->api->change_id( $new, $old );
					return new WP_Error( 'history_unavailable', __( 'History could not record the id change, so it was changed back.', 'emcp-tools' ), array( 'restored' => $this->api->exists( $old ) ) );
				}
				$table = $this->api->load( $new, true );
				$out   = $this->answer( $new, is_wp_error( $table ) ? array( 'data' => array() ) : $table, $change );
				$out['old_id']             = $old;
				$out['pages_using_old_id'] = $used;
				return $out;
			}
		);
	}

	/** @return array|WP_Error */
	public function delete( string $id, ?string $version, bool $force, bool $dry_run, ?callable $usage = null ) {
		return $this->locked(
			function () use ( $id, $version, $force, $dry_run, $usage ) {
				$before = $this->api->load( $id, true );
				if ( is_wp_error( $before ) ) {
					/* translators: %s: table id. */
					return new WP_Error( 'not_found', sprintf( __( 'There is no table "%s".', 'emcp-tools' ), $id ) );
				}
				if ( ! $force ) {
					if ( null === $version || '' === $version ) {
						return new WP_Error( 'missing_version', __( 'Pass the version from get-table, or force:true.', 'emcp-tools' ) );
					}
					if ( ! hash_equals( EMCP_Tools_TablePress_Api::version( $before ), $version ) ) {
						return new WP_Error( 'conflict', __( 'The table changed since it was read.', 'emcp-tools' ), array( 'current_version' => EMCP_Tools_TablePress_Api::version( $before ) ) );
					}
				}
				$used = $usage ? $usage( $id ) : array();
				if ( $dry_run ) {
					return array( 'dry_run' => true, 'id' => $id, 'used_on' => $used );
				}
				$done = $this->api->delete( $id );
				if ( is_wp_error( $done ) ) {
					return new WP_Error( 'delete_failed', $this->api->error_string( $done ) );
				}
				$this->api->refresh_registry();
				$change = EMCP_Tools_TablePress_History::record_deleted( $id, $before );
				if ( '' === $change ) {
					$back = $this->readd( $id, $before );
					return new WP_Error( 'history_unavailable', __( 'History could not record the deletion, so the table was put back.', 'emcp-tools' ), array( 'restored' => true === $back ) );
				}
				return array(
					'id'      => $id,
					'deleted' => true,
					'used_on' => $used,
					'change'  => array( 'change_id' => $change, 'undo' => array( 'available' => true ) ),
				);
			}
		);
	}

	/** Add a before-image back and move it to its old id. @return true|WP_Error */
	private function readd( string $id, array $before ) {
		$canon = EMCP_Tools_TablePress_Api::canonical( $before );
		$new   = $this->api->prepare( $this->api->template(), $canon, false );
		if ( is_wp_error( $new ) ) {
			return new WP_Error( 'rollback_failed', $this->api->error_string( $new ) );
		}
		$added = $this->api->add( $new );
		if ( is_wp_error( $added ) ) {
			$this->clean_failed_add( $added );
			return new WP_Error( 'rollback_failed', $this->api->error_string( $added ) );
		}
		$added = (string) $added;
		if ( $added !== $id ) {
			$moved = $this->api->change_id( $added, $id );
			if ( is_wp_error( $moved ) ) {
				$this->api->delete( $added );
				return new WP_Error( 'rollback_failed', $this->api->error_string( $moved ) );
			}
		}
		$this->api->refresh_registry();
		$now = $this->api->load( $id, true );
		if ( is_wp_error( $now ) || ! self::same( $now, $before ) ) {
			return new WP_Error( 'rollback_failed', __( 'The table came back, but not exactly as it was.', 'emcp-tools' ) );
		}
		return true;
	}

	// Undo mode (History's handlers; nothing is recorded here).

	/** @return true|WP_Error */
	public function restore( string $id, string $after_version, bool $force, array $before ) {
		$out = $this->update( $id, $after_version, $force, null, 'undo', false, $before );
		return is_wp_error( $out ) ? $out : true;
	}

	/** @return true|WP_Error */
	public function undo_create( string $id, string $after_version, bool $force ) {
		return $this->locked(
			function () use ( $id, $after_version, $force ) {
				$now = $this->api->load( $id, true );
				if ( is_wp_error( $now ) ) {
					return true;
				}
				if ( ! $force && ! hash_equals( $after_version, EMCP_Tools_TablePress_Api::version( $now ) ) ) {
					return new WP_Error( 'conflict', __( 'The table changed after it was created, so it is not removed.', 'emcp-tools' ) );
				}
				$done = $this->api->delete( $id );
				return is_wp_error( $done ) ? new WP_Error( 'rollback_failed', $this->api->error_string( $done ) ) : true;
			}
		);
	}

	/** @return true|WP_Error */
	public function undo_delete( string $id, array $before, bool $force ) {
		return $this->locked(
			function () use ( $id, $before ) {
				if ( $this->api->exists( $id ) ) {
					return new WP_Error( 'conflict', __( 'A table with this id exists again, so the deleted table is not brought back over it.', 'emcp-tools' ) );
				}
				$ok = $this->privileged_check( EMCP_Tools_TablePress_Api::canonical( $before ) );
				if ( is_wp_error( $ok ) ) {
					return $ok;
				}
				return $this->readd( $id, $before );
			}
		);
	}

	/** @return true|WP_Error */
	public function undo_change_id( string $old, string $new, bool $force ) {
		return $this->locked(
			function () use ( $old, $new ) {
				if ( ! $this->api->exists( $new ) || $this->api->exists( $old ) ) {
					return new WP_Error( 'conflict', __( 'The table moved again, or the old id is taken, so the id is not changed back.', 'emcp-tools' ) );
				}
				$done = $this->api->change_id( $new, $old );
				return is_wp_error( $done ) ? new WP_Error( 'rollback_failed', $this->api->error_string( $done ) ) : true;
			}
		);
	}
}
