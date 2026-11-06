<?php
/**
 * Redirect loop checks and write operations (save, import, bulk actions, delete).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Redirects_Trait_Writes {

	/**
	 * Destination as an exact source key when it points at this site, else null.
	 */
	private static function internal_destination_key( string $destination ): ?string {
		$destination = trim( $destination );
		if ( '' === $destination ) {
			return null;
		}
		if ( preg_match( '#^https?://#i', $destination ) ) {
			$host = wp_parse_url( $destination, PHP_URL_HOST );
			$home = wp_parse_url( home_url( '/' ), PHP_URL_HOST );
			if ( ! is_string( $host ) || ! is_string( $home ) ) {
				return null;
			}
			$strip = static function ( string $h ): string {
				$h = strtolower( $h );
				return 0 === strpos( $h, 'www.' ) ? substr( $h, 4 ) : $h;
			};
			if ( $strip( $host ) !== $strip( $home ) ) {
				return null;
			}
		} elseif ( preg_match( '#^[a-z][a-z0-9+.\-]*:#i', $destination ) || 0 === strpos( $destination, '//' ) ) {
			return null;
		}
		return self::normalize_source( $destination, 'exact' );
	}

	/**
	 * Error message when saving this exact rule would create a loop, else ''.
	 */
	private static function loop_error( string $source, string $destination, int $id ): string {
		global $wpdb;

		$dest_key = self::internal_destination_key( $destination );
		if ( null === $dest_key ) {
			return '';
		}
		if ( $dest_key === $source ) {
			return __( 'Source and destination are the same page.', 'neo-pulse-wp' );
		}

		$table = self::table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$other = $wpdb->get_row(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE source = %s AND status = 'active' AND matching IN ('exact', '') AND id != %d LIMIT 1",
				$dest_key,
				$id
			)
		);
		if ( ! $other || in_array( (int) $other->type, self::GONE_CODES, true ) ) {
			return '';
		}
		if ( self::internal_destination_key( (string) $other->destination ) === $source ) {
			return sprintf(
				/* translators: %s: source path of the other redirect */
				__( 'This would create a redirect loop: /%s already redirects back to this source.', 'neo-pulse-wp' ),
				$dest_key
			);
		}
		return '';
	}

	/**
	 * @param array<string, mixed> $data Redirect data.
	 * @return array{ok: bool, id?: int, error?: string}
	 */
	public static function save( array $data ) {
		global $wpdb;

		$matching = self::normalize_matching( $data['matching'] ?? 'exact' );
		$source   = isset( $data['source'] ) ? self::normalize_source( (string) $data['source'], $matching ) : null;
		if ( ! $source ) {
			return array(
				'ok'    => false,
				'error' => __( 'Source path is required.', 'neo-pulse-wp' ),
			);
		}

		$ignore = ( ! empty( $data['ignore'] ) || ! empty( $data['ignore_case'] ) ) ? 1 : 0;

		if ( 'regex' === $matching && null === self::compile_regex( $source, (bool) $ignore ) ) {
			return array(
				'ok'    => false,
				'error' => __( 'The source is not a valid regular expression.', 'neo-pulse-wp' ),
			);
		}

		$type = isset( $data['type'] ) ? (int) $data['type'] : self::get_settings()['default_type'];
		if ( ! in_array( $type, self::STATUS_CODES, true ) ) {
			$type = 301;
		}
		$is_gone = in_array( $type, self::GONE_CODES, true );

		$destination = isset( $data['destination'] ) ? trim( (string) $data['destination'] ) : '';
		if ( ! $is_gone && ( $destination === '' || ! Neo_Pulse_Wp_Redirects_Csv::destination_path_key( $destination ) ) ) {
			return array(
				'ok'    => false,
				'error' => __( 'Destination URL or path is required.', 'neo-pulse-wp' ),
			);
		}
		if ( $is_gone ) {
			$destination = '';
		}

		$category = isset( $data['category'] ) ? sanitize_text_field( (string) $data['category'] ) : __( 'Uncategorized', 'neo-pulse-wp' );
		if ( $category === '' ) {
			$category = __( 'Uncategorized', 'neo-pulse-wp' );
		}

		$status = isset( $data['status'] ) ? sanitize_key( (string) $data['status'] ) : 'active';
		if ( ! in_array( $status, array( 'active', 'inactive', 'trash' ), true ) ) {
			$status = 'active';
		}

		$now   = current_time( 'mysql', true );
		$table = self::table_name();
		$id    = isset( $data['id'] ) ? (int) $data['id'] : 0;

		if ( 'active' === $status && 'exact' === $matching && ! $is_gone ) {
			$loop = self::loop_error( $source, $destination, $id );
			if ( '' !== $loop ) {
				return array(
					'ok'    => false,
					'error' => $loop,
				);
			}
		}

		$row = array(
			'source'      => $source,
			'matching'    => $matching,
			'destination' => $destination,
			'type'        => $type,
			'category'    => $category,
			'status'      => $status,
			'ignore_case' => $ignore,
			'updated_at'  => $now,
		);

		if ( $id > 0 ) {
			$existing = self::get( $id );
			if ( ! $existing ) {
				return array(
					'ok'    => false,
					'error' => __( 'Redirect not found.', 'neo-pulse-wp' ),
				);
			}
			$conflict = self::get_by_source( $source, $matching );
			if ( $conflict && (int) $conflict->id !== $id ) {
				return array(
					'ok'    => false,
					'error' => __( 'Another redirect already uses this source path.', 'neo-pulse-wp' ),
				);
			}
			$wpdb->update( $table, $row, array( 'id' => $id ) );
			self::flush_cache();
			return array(
				'ok' => true,
				'id' => $id,
			);
		}

		$conflict = self::get_by_source( $source, $matching );
		if ( $conflict ) {
			return array(
				'ok'    => false,
				'error' => __( 'Another redirect already uses this source path.', 'neo-pulse-wp' ),
			);
		}

		$row['created_at'] = $now;
		$row['hits']       = 0;
		$wpdb->insert( $table, $row );
		$new_id = (int) $wpdb->insert_id;
		self::flush_cache();

		return array(
			'ok' => $new_id > 0,
			'id' => $new_id,
		);
	}

	/**
	 * Merge import rows by source path.
	 *
	 * @param array<int, array<string, mixed>> $rows Parsed CSV rows.
	 * @return array{added: int, updated: int, skipped: int}
	 */
	public static function merge_import( array $rows ): array {
		$added   = 0;
		$updated = 0;
		$skipped = 0;

		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				++$skipped;
				continue;
			}
			$existing = self::get_by_source(
				isset( $row['source'] ) ? (string) $row['source'] : '',
				self::normalize_matching( $row['matching'] ?? 'exact' )
			);
			if ( $existing ) {
				$row['id'] = (int) $existing->id;
				$result    = self::save( $row );
				if ( ! empty( $result['ok'] ) ) {
					++$updated;
				} else {
					++$skipped;
				}
			} else {
				$result = self::save( $row );
				if ( ! empty( $result['ok'] ) ) {
					++$added;
				} else {
					++$skipped;
				}
			}
		}

		return array(
			'added'   => $added,
			'updated' => $updated,
			'skipped' => $skipped,
		);
	}

	/**
	 * Insert rows whose source is not stored yet; never touches existing rows.
	 * Running it twice adds nothing the second time.
	 *
	 * @param array<int, array<string, mixed>> $rows Rows (source, matching, destination, type, ...).
	 * @return array{added: int, updated: int, existing: int, skipped: int, errors: int}
	 */
	public static function import_missing( array $rows ): array {
		$map   = self::existing_sources_map();
		$stats = array(
			'added'    => 0,
			'updated'  => 0,
			'existing' => 0,
			'skipped'  => 0,
			'errors'   => 0,
		);

		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				++$stats['skipped'];
				continue;
			}
			$matching = self::normalize_matching( $row['matching'] ?? 'exact' );
			$source   = self::normalize_source( isset( $row['source'] ) ? (string) $row['source'] : '', $matching );
			if ( ! $source ) {
				++$stats['skipped'];
				continue;
			}
			if ( isset( $map[ $source ] ) ) {
				++$stats['existing'];
				continue;
			}
			$row['matching'] = $matching;
			$result          = self::save( $row );
			if ( ! empty( $result['ok'] ) ) {
				++$stats['added'];
				$map[ $source ] = true;
			} else {
				++$stats['errors'];
			}
		}

		$stats['skipped'] += $stats['existing'];
		return $stats;
	}

	/**
	 * @param array<int, int> $ids Redirect IDs.
	 * @param string          $action Bulk action.
	 * @return int
	 */
	public static function bulk_action( array $ids, string $action ): int {
		global $wpdb;
		$table   = self::table_name();
		$ids     = array_values( array_filter( array_map( 'intval', $ids ) ) );
		$changed = 0;
		if ( empty( $ids ) ) {
			return 0;
		}
		$now = current_time( 'mysql', true );
		foreach ( $ids as $id ) {
			if ( $id < 1 ) {
				continue;
			}
			switch ( $action ) {
				case 'trash':
					$wpdb->update( $table, array( 'status' => 'trash', 'updated_at' => $now ), array( 'id' => $id ) );
					++$changed;
					break;
				case 'restore':
					$wpdb->update( $table, array( 'status' => 'active', 'updated_at' => $now ), array( 'id' => $id ) );
					++$changed;
					break;
				case 'activate':
					$wpdb->update( $table, array( 'status' => 'active', 'updated_at' => $now ), array( 'id' => $id ) );
					++$changed;
					break;
				case 'deactivate':
					$wpdb->update( $table, array( 'status' => 'inactive', 'updated_at' => $now ), array( 'id' => $id ) );
					++$changed;
					break;
				case 'delete':
					$wpdb->delete( $table, array( 'id' => $id ) );
					++$changed;
					break;
			}
		}
		self::flush_cache();
		return $changed;
	}

	public static function delete( int $id ): bool {
		global $wpdb;
		if ( $id < 1 ) {
			return false;
		}
		$table  = self::table_name();
		$result = $wpdb->delete( $table, array( 'id' => $id ) );
		self::flush_cache();
		return false !== $result && $result > 0;
	}
}
