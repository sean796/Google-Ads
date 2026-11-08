<?php
/**
 * Redirect table setup, settings, source normalisation, and stored-row queries.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Redirects_Trait_Storage {

	public static function maybe_install(): void {
		if ( get_option( 'neo_pulse_wp_redirects_db_version', '' ) !== self::TABLE_VERSION ) {
			self::install();
		}
	}

	public static function install(): void {
		global $wpdb;

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$table   = self::table_name();
		$charset = $wpdb->get_charset_collate();

		$sql = "CREATE TABLE {$table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			source varchar(512) NOT NULL,
			matching varchar(20) NOT NULL DEFAULT 'exact',
			destination varchar(512) NOT NULL,
			type smallint(5) unsigned NOT NULL DEFAULT 301,
			category varchar(100) NOT NULL DEFAULT 'Uncategorized',
			status varchar(20) NOT NULL DEFAULT 'active',
			ignore_case tinyint(1) NOT NULL DEFAULT 0,
			hits bigint(20) unsigned NOT NULL DEFAULT 0,
			created_at datetime NOT NULL,
			updated_at datetime NOT NULL,
			last_accessed_at datetime DEFAULT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY source (source(191)),
			KEY status (status),
			KEY category (category(50))
		) {$charset};";

		dbDelta( $sql );
		update_option( 'neo_pulse_wp_redirects_db_version', self::TABLE_VERSION, false );

		if ( get_option( self::OPTION_KEY, null ) === null ) {
			add_option(
				self::OPTION_KEY,
				array(
					'default_type' => 301,
				),
				'',
				false
			);
		}
	}

	/**
	 * @return array<string, mixed>
	 */
	public static function get_settings(): array {
		$raw = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $raw ) ) {
			$raw = array();
		}
		$type = isset( $raw['default_type'] ) ? (int) $raw['default_type'] : 301;
		if ( ! in_array( $type, array( 301, 302 ), true ) ) {
			$type = 301;
		}
		$fallback_type = isset( $raw['fallback_home_type'] ) ? (int) $raw['fallback_home_type'] : $type;
		if ( ! in_array( $fallback_type, array( 301, 302 ), true ) ) {
			$fallback_type = $type;
		}
		return array(
			'default_type'          => $type,
			'fallback_home_enabled' => ! empty( $raw['fallback_home_enabled'] ),
			'fallback_home_type'    => $fallback_type,
		);
	}

	/**
	 * @param array<string, mixed> $settings Settings.
	 */
	public static function save_settings( array $settings ): void {
		$type = isset( $settings['default_type'] ) ? (int) $settings['default_type'] : 301;
		if ( ! in_array( $type, array( 301, 302 ), true ) ) {
			$type = 301;
		}
		$fallback_type = isset( $settings['fallback_home_type'] ) ? (int) $settings['fallback_home_type'] : $type;
		if ( ! in_array( $fallback_type, array( 301, 302 ), true ) ) {
			$fallback_type = $type;
		}
		update_option(
			self::OPTION_KEY,
			array(
				'default_type'          => $type,
				'fallback_home_enabled' => ! empty( $settings['fallback_home_enabled'] ),
				'fallback_home_type'    => $fallback_type,
			),
			false
		);
	}

	/**
	 * Matching mode, defaulting to exact for anything unknown.
	 *
	 * @param mixed $matching Raw value.
	 */
	public static function normalize_matching( $matching ): string {
		$matching = sanitize_key( (string) $matching );
		return in_array( $matching, self::MATCH_TYPES, true ) ? $matching : 'exact';
	}

	/**
	 * Storage form of a source pattern.
	 *
	 * Exact sources are normalised (lowercase, trailing slash, "?query" kept).
	 * Other modes keep the pattern as written (no lowercasing, no trailing
	 * slash); only an absolute URL is reduced to its path and query, and the
	 * path is URL-decoded. Regex patterns are stored untouched.
	 */
	public static function normalize_source( string $raw, string $matching = 'exact' ): ?string {
		$matching = self::normalize_matching( $matching );
		$raw      = trim( trim( $raw ), " \t\n\r\0\x0B\"'" );
		if ( '' === $raw ) {
			return null;
		}
		if ( 'regex' === $matching ) {
			return $raw;
		}
		if ( preg_match( '#^https?://#i', $raw ) ) {
			$parts = wp_parse_url( $raw );
			if ( ! is_array( $parts ) ) {
				return null;
			}
			$raw = ( isset( $parts['path'] ) ? (string) $parts['path'] : '' )
				. ( isset( $parts['query'] ) && '' !== $parts['query'] ? '?' . $parts['query'] : '' );
		}
		$raw = self::decode_path_part( $raw );
		if ( 'exact' === $matching ) {
			return Neo_Pulse_Wp_Redirects_Csv::normalize_relative_path( $raw );
		}
		return '' === $raw ? null : $raw;
	}

	/**
	 * rawurldecode the path part only, so an encoded "?" in a query stays put.
	 */
	private static function decode_path_part( string $value ): string {
		$q = strpos( $value, '?' );
		if ( false === $q ) {
			return rawurldecode( $value );
		}
		return rawurldecode( substr( $value, 0, $q ) ) . substr( $value, $q );
	}

	/**
	 * @param array<string, mixed> $args Query args.
	 * @return array{items: array<int, object>, total: int}
	 */
	public static function query( array $args = array() ): array {
		global $wpdb;

		$table  = self::table_name();
		$where  = array( '1=1' );
		$params = array();

		$status = isset( $args['status'] ) ? sanitize_key( (string) $args['status'] ) : '';
		if ( $status === 'all' || $status === '' ) {
			$where[] = "status != 'trash'";
		} elseif ( in_array( $status, array( 'active', 'inactive', 'trash' ), true ) ) {
			$where[]  = 'status = %s';
			$params[] = $status;
		} else {
			$where[] = "status != 'trash'";
		}

		$category = isset( $args['category'] ) ? sanitize_text_field( (string) $args['category'] ) : '';
		if ( $category !== '' ) {
			$where[]  = 'category = %s';
			$params[] = $category;
		}

		$search = isset( $args['search'] ) ? sanitize_text_field( (string) $args['search'] ) : '';
		if ( $search !== '' ) {
			$like     = '%' . $wpdb->esc_like( $search ) . '%';
			$where[]  = '(source LIKE %s OR destination LIKE %s)';
			$params[] = $like;
			$params[] = $like;
		}

		$where_sql = implode( ' AND ', $where );

		$count_sql = "SELECT COUNT(*) FROM {$table} WHERE {$where_sql}";
		if ( ! empty( $params ) ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			$total = (int) $wpdb->get_var( $wpdb->prepare( $count_sql, $params ) );
		} else {
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			$total = (int) $wpdb->get_var( $count_sql );
		}

		$orderby = isset( $args['orderby'] ) ? sanitize_key( (string) $args['orderby'] ) : 'created_at';
		$allowed = array(
			'source'           => 'source',
			'destination'      => 'destination',
			'type'             => 'type',
			'hits'             => 'hits',
			'created_at'       => 'created_at',
			'last_accessed_at' => 'last_accessed_at',
		);
		$order_col = isset( $allowed[ $orderby ] ) ? $allowed[ $orderby ] : 'created_at';
		$order     = isset( $args['order'] ) && 'asc' === strtolower( (string) $args['order'] ) ? 'ASC' : 'DESC';

		$per_page = isset( $args['per_page'] ) ? max( 1, min( 200, (int) $args['per_page'] ) ) : 20;
		$page     = isset( $args['page'] ) ? max( 1, (int) $args['page'] ) : 1;
		$offset   = ( $page - 1 ) * $per_page;

		$list_sql    = "SELECT * FROM {$table} WHERE {$where_sql} ORDER BY {$order_col} {$order} LIMIT %d OFFSET %d";
		$list_params = array_merge( $params, array( $per_page, $offset ) );

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		$items = $wpdb->get_results( $wpdb->prepare( $list_sql, $list_params ) );

		return array(
			'items' => is_array( $items ) ? $items : array(),
			'total' => $total,
		);
	}

	/**
	 * @return object|null
	 */
	public static function get( int $id ) {
		global $wpdb;
		if ( $id < 1 ) {
			return null;
		}
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ) );
		return $row ? $row : null;
	}

	/**
	 * Row that already uses this source pattern (any status, any matching mode).
	 *
	 * @return object|null
	 */
	public static function get_by_source( string $source, string $matching = 'exact' ) {
		global $wpdb;
		$norm = self::normalize_source( $source, $matching );
		if ( ! $norm ) {
			return null;
		}
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE source = %s", $norm ) );
		return $row ? $row : null;
	}

	/**
	 * Every stored source string (all statuses) as a lookup map.
	 *
	 * @return array<string, true>
	 */
	public static function existing_sources_map(): array {
		global $wpdb;
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$col = $wpdb->get_col( "SELECT source FROM {$table}" );
		$map = array();
		if ( is_array( $col ) ) {
			foreach ( $col as $src ) {
				$map[ (string) $src ] = true;
			}
		}
		return $map;
	}

	/**
	 * @return array<string, int>
	 */
	public static function status_counts(): array {
		global $wpdb;
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results( "SELECT status, COUNT(*) AS cnt FROM {$table} GROUP BY status", ARRAY_A );
		$counts = array(
			'active'   => 0,
			'inactive' => 0,
			'trash'    => 0,
		);
		if ( is_array( $rows ) ) {
			foreach ( $rows as $row ) {
				$st = isset( $row['status'] ) ? (string) $row['status'] : '';
				if ( isset( $counts[ $st ] ) ) {
					$counts[ $st ] = (int) $row['cnt'];
				}
			}
		}
		$counts['all'] = $counts['active'] + $counts['inactive'];
		return $counts;
	}

	/**
	 * @return array<int, string>
	 */
	public static function distinct_categories(): array {
		global $wpdb;
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_col( "SELECT DISTINCT category FROM {$table} WHERE status != 'trash' ORDER BY category ASC" );
		return is_array( $rows ) ? array_values( array_filter( array_map( 'strval', $rows ) ) ) : array();
	}

	/**
	 * Count non-trash redirects in a category (e.g. imported from NEO Pulse redirect).
	 */
	public static function count_by_category( string $category ): int {
		global $wpdb;

		$category = sanitize_text_field( $category );
		if ( $category === '' ) {
			return 0;
		}

		$table = self::table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$table} WHERE category = %s AND status != 'trash'",
				$category
			)
		);
	}

	/**
	 * Drop the cached list of non-exact rows (call after every write).
	 */
	public static function flush_cache(): void {
		delete_transient( self::NON_EXACT_CACHE_KEY );
		self::$active_exact = null;
		// Redirected URLs drop out of the sitemap.
		if ( class_exists( 'Neo_Pulse_Wp_Sitemap_Cache', false ) ) {
			Neo_Pulse_Wp_Sitemap_Cache::bump();
		}
	}

	/**
	 * @return array<int, object>
	 */
	public static function export_rows(): array {
		global $wpdb;
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results( "SELECT * FROM {$table} WHERE status != 'trash' ORDER BY source ASC" );
		return is_array( $rows ) ? $rows : array();
	}
}
