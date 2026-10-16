<?php
/**
 * Serialization-safe search and replace.
 *
 * Handles URL and path replacement in the WordPress database,
 * correctly updating serialized data with recalculated string lengths.
 *
 * @package EMCP_Tools
 * 
 * @since      1.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class EMCP_Tools_Search_Replace
 *
 * @since 1.0.0
 */
class EMCP_Tools_Search_Replace {

	/**
	 * Run search-replace on the database.
	 *
	 * @param string $search     String to search for.
	 * @param string $replace    String to replace with.
	 * @param array  $tables     Tables to process (empty = all WP tables).
	 * @param bool   $dry_run    If true, only count matches without changing data.
	 * @return array Report with tables processed, rows affected, changes made.
	 */
	public static function run( $search, $replace, $tables = array(), $dry_run = false ) {
		global $wpdb;

		if ( $search === $replace ) {
			return array(
				'tables'       => 0,
				'rows_affected' => 0,
				'changes'      => 0,
				'errors'       => array(),
			);
		}

		if ( empty( $tables ) ) {
			$tables = EMCP_Tools_Helper::get_wp_tables();
		}

		$report = array(
			'tables'        => 0,
			'rows_affected' => 0,
			'changes'       => 0,
			'errors'        => array(),
		);

		$batch_size = EMCP_Tools_Environment::get_db_batch_size();

		foreach ( $tables as $table ) {
			$result = self::process_table( $table, $search, $replace, $batch_size, $dry_run );

			if ( is_wp_error( $result ) ) {
				$report['errors'][] = array(
					'table' => $table,
					'error' => $result->get_error_message(),
				);
				continue;
			}

			++$report['tables'];
			$report['rows_affected'] += $result['rows'];
			$report['changes']       += $result['changes'];
		}

		EMCP_Tools_Logger::info(
			'restore',
			sprintf(
				'Search-replace complete: %d tables, %d rows affected, %d changes.',
				$report['tables'],
				$report['rows_affected'],
				$report['changes']
			),
			array( 'search' => $search, 'replace' => $replace, 'dry_run' => $dry_run )
		);

		return $report;
	}

	/**
	 * Run multiple search-replace pairs.
	 *
	 * @param array $pairs   Array of [ 'search' => '...', 'replace' => '...' ].
	 * @param array $tables  Tables to process.
	 * @return array Combined report.
	 */
	public static function run_multiple( $pairs, $tables = array() ) {
		$total_report = array(
			'tables'        => 0,
			'rows_affected' => 0,
			'changes'       => 0,
			'errors'        => array(),
		);

		foreach ( $pairs as $pair ) {
			$report = self::run( $pair['search'], $pair['replace'], $tables );

			$total_report['rows_affected'] += $report['rows_affected'];
			$total_report['changes']       += $report['changes'];
			$total_report['errors']         = array_merge( $total_report['errors'], $report['errors'] );
			$total_report['tables']         = max( $total_report['tables'], $report['tables'] );
		}

		return $total_report;
	}

	/**
	 * Process a single table.
	 *
	 * @param string $table      Table name.
	 * @param string $search     Search string.
	 * @param string $replace    Replace string.
	 * @param int    $batch_size Rows per batch.
	 * @param bool   $dry_run    Dry run flag.
	 * @return array|WP_Error
	 */
	private static function process_table( $table, $search, $replace, $batch_size, $dry_run ) {
		global $wpdb;

		// Get primary key column.
		$primary_key = self::get_primary_key( $table );

		if ( ! $primary_key ) {
			return new WP_Error( 'no_primary_key', sprintf( 'Table %s has no primary key.', $table ) );
		}

		// Get all columns.
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$columns = $wpdb->get_col( "DESCRIBE `{$table}`", 0 );

		if ( empty( $columns ) ) {
			return array( 'rows' => 0, 'changes' => 0 );
		}

		$result = array( 'rows' => 0, 'changes' => 0 );
		$offset = 0;

		do {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$rows = $wpdb->get_results(
				"SELECT * FROM `{$table}` ORDER BY `{$primary_key}` LIMIT {$batch_size} OFFSET {$offset}",
				ARRAY_A
			);

			if ( empty( $rows ) ) {
				break;
			}

			foreach ( $rows as $row ) {
				$updates  = array();
				$row_changes = 0;

				foreach ( $columns as $col ) {
					if ( $col === $primary_key ) {
						continue;
					}

					$value = $row[ $col ];

					if ( null === $value || '' === $value ) {
						continue;
					}

					// Check if value contains the search string.
					if ( strpos( $value, $search ) === false ) {
						continue;
					}

					$new_value = self::replace_in_value( $value, $search, $replace );

					if ( $new_value !== $value ) {
						$updates[ $col ] = $new_value;
						++$row_changes;
					}
				}

				if ( ! empty( $updates ) && ! $dry_run ) {
					// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
					$wpdb->update(
						$table,
						$updates,
						array( $primary_key => $row[ $primary_key ] )
					);
				}

				if ( $row_changes > 0 ) {
					++$result['rows'];
					$result['changes'] += $row_changes;
				}
			}

			$offset += $batch_size;
		} while ( count( $rows ) === $batch_size );

		return $result;
	}

	/**
	 * Replace a search string in a value, handling serialized data.
	 *
	 * @param string $value   The original value.
	 * @param string $search  Search string.
	 * @param string $replace Replace string.
	 * @return string
	 */
	public static function replace_in_value( $value, $search, $replace ) {
		// Only strings can contain the search term; skip everything else, and
		// fast-skip values that don't contain it at all (big speedup on large tables).
		if ( ! is_string( $value ) || '' === $value || false === strpos( $value, $search ) ) {
			return $value;
		}

		// Serialized data: rewrite the string payloads in place, fixing each
		// `s:<len>:"…"` byte length. This never unserializes, so it survives
		// serialized objects whose source-site class is not loaded on the target
		// (they would otherwise deserialize to __PHP_Incomplete_Class and either
		// fatal or corrupt on re-serialization) — a normal migration condition.
		if ( is_serialized( $value ) ) {
			return self::fix_serialized_strings( $value, $search, $replace );
		}

		// Everything else — including JSON (e.g. Elementor's `_elementor_data`) —
		// is a plain string replacement on the raw value. JSON has no length
		// prefixes, so a raw replace is safe, and it must NOT be decoded first:
		// decoding unescapes `https:\/\/host` to `https://host`, after which the
		// caller's JSON-escaped pair no longer matches and the URL is missed.
		// The escaped + unescaped pair variants from get_migration_pairs() cover
		// both encodings against the raw string.
		return str_replace( $search, $replace, $value );
	}

	/**
	 * Serialization-safe string replacement.
	 *
	 * Walks a serialized blob byte-accurately: for every `s:<len>:"<bytes>";`
	 * token it reads exactly `<len>` bytes (so payloads containing `";` are
	 * handled correctly), replaces inside them, and re-emits the token with the
	 * corrected byte length. Object (`O:`) and structural tokens are copied
	 * through untouched — class names and element counts never change — so this
	 * rewrites URLs inside serialized objects without instantiating any class.
	 *
	 * @param string $value   Serialized string.
	 * @param string $search  Search string.
	 * @param string $replace Replace string.
	 * @return string Rewritten serialized string.
	 */
	private static function fix_serialized_strings( $value, $search, $replace ) {
		$out    = '';
		$offset = 0;
		$length = strlen( $value );

		while ( $offset < $length ) {
			// Find the next string token at or after the current offset.
			if ( ! preg_match( '/s:(\d+):"/', $value, $m, PREG_OFFSET_CAPTURE, $offset ) ) {
				$out .= substr( $value, $offset );
				break;
			}

			$token_pos = $m[0][1];
			$token_len = strlen( $m[0][0] );
			$str_len   = (int) $m[1][0];
			$str_start = $token_pos + $token_len;

			// Copy everything before the token unchanged.
			$out .= substr( $value, $offset, $token_pos - $offset );

			// Read exactly $str_len bytes as the payload (length-accurate).
			$str = substr( $value, $str_start, $str_len );
			$new = str_replace( $search, $replace, $str );

			$out .= 's:' . strlen( $new ) . ':"' . $new . '";';

			// Advance past the payload and its closing `";`.
			$offset = $str_start + $str_len + 2;
		}

		return $out;
	}

	/**
	 * Get the primary key column of a table.
	 *
	 * @param string $table Table name.
	 * @return string|false
	 */
	private static function get_primary_key( $table ) {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( "SHOW KEYS FROM `{$table}` WHERE Key_name = 'PRIMARY'" );

		return $row ? $row->Column_name : false;
	}

	/**
	 * Generate standard search-replace pairs for migration.
	 *
	 * @param string $old_url  Old site URL.
	 * @param string $new_url  New site URL.
	 * @param string $old_path Old file path (optional).
	 * @param string $new_path New file path (optional).
	 * @return array Array of pairs.
	 */
	public static function get_migration_pairs( $old_url, $new_url, $old_path = '', $new_path = '' ) {
		$pairs = array();

		// URL replacements (multiple variations).
		$old_url = untrailingslashit( $old_url );
		$new_url = untrailingslashit( $new_url );

		// https://old.com → https://new.com
		$pairs[] = array( 'search' => $old_url, 'replace' => $new_url );

		// //old.com → //new.com (protocol-relative).
		$old_no_scheme = preg_replace( '#^https?:#', '', $old_url );
		$new_no_scheme = preg_replace( '#^https?:#', '', $new_url );
		if ( $old_no_scheme !== $new_no_scheme ) {
			$pairs[] = array( 'search' => $old_no_scheme, 'replace' => $new_no_scheme );
		}

		// JSON-escaped URLs (with \/).
		$old_escaped = str_replace( '/', '\\/', $old_url );
		$new_escaped = str_replace( '/', '\\/', $new_url );
		if ( $old_escaped !== $new_escaped ) {
			$pairs[] = array( 'search' => $old_escaped, 'replace' => $new_escaped );
		}

		// File paths.
		if ( $old_path && $new_path ) {
			$old_path = untrailingslashit( wp_normalize_path( $old_path ) );
			$new_path = untrailingslashit( wp_normalize_path( $new_path ) );

			if ( $old_path !== $new_path ) {
				$pairs[] = array( 'search' => $old_path, 'replace' => $new_path );

				// Windows backslash paths.
				$old_win = str_replace( '/', '\\', $old_path );
				$new_win = str_replace( '/', '\\', $new_path );
				if ( $old_win !== $new_win ) {
					$pairs[] = array( 'search' => $old_win, 'replace' => $new_win );
				}
			}
		}

		return $pairs;
	}
}
