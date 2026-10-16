<?php
/**
 * Redirect storage, matching, and front-end execution.
 *
 * Matching modes follow Rank Math's comparison types: exact, contains, start,
 * end and regex. Exact rows are stored normalised (lowercase, trailing slash,
 * no leading slash, optional "?query") and looked up with one indexed query;
 * every other active row is loaded once into a transient that is cleared on
 * every write.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Redirects {

	const TABLE_VERSION = '1.0';
	const OPTION_KEY    = 'neo_pulse_wp_redirects_settings';

	/** Transient holding all active non-exact rows. */
	const NON_EXACT_CACHE_KEY = 'neo_pulse_wp_redirects_non_exact';

	/** Supported matching modes (same names as Rank Math comparisons). */
	const MATCH_TYPES = array( 'exact', 'contains', 'start', 'end', 'regex' );

	/** Supported HTTP status codes. */
	const STATUS_CODES = array( 301, 302, 307, 308, 410, 451 );

	/** Status codes that need no destination (content gone). */
	const GONE_CODES = array( 410, 451 );

	/** @var array<string, true>|null Active exact sources, loaded once per request by is_redirected(). */
	private static $active_exact = null;

	/**
	 * @return string
	 */
	public static function table_name(): string {
		global $wpdb;
		return $wpdb->prefix . 'neo_pulse_wp_redirects';
	}

	public static function init(): void {
		add_action( 'template_redirect', array( __CLASS__, 'maybe_redirect' ), 1 );
		add_action( 'template_redirect', array( __CLASS__, 'maybe_fallback_home' ), 20 );
		add_action( 'plugins_loaded', array( __CLASS__, 'maybe_install' ), 20 );
	}

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
	 * Count non-trash redirects in a category (e.g. imported from Rank Math).
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
	 * Whether a path (+ query) is the source of an active redirect. Cheap to call in a loop: the
	 * exact sources are loaded once per request and the other rows come from the cached list.
	 */
	public static function is_redirected( string $path, string $query = '' ): bool {
		if ( null === self::$active_exact ) {
			global $wpdb;
			$table = self::table_name();
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$col                = $wpdb->get_col( "SELECT source FROM {$table} WHERE status = 'active' AND matching IN ('exact', '')" );
			self::$active_exact = array();
			foreach ( is_array( $col ) ? $col : array() as $src ) {
				self::$active_exact[ (string) $src ] = true;
				if ( false !== strpos( (string) $src, '%' ) ) {
					// Older rows kept percent-encoding; index their decoded form too.
					$decoded = self::normalize_source( (string) $src, 'exact' );
					if ( $decoded ) {
						self::$active_exact[ $decoded ] = true;
					}
				}
			}
		}
		if ( '' !== $query ) {
			$with_query = self::normalize_source( $path . '?' . $query, 'exact' );
			if ( $with_query && isset( self::$active_exact[ $with_query ] ) ) {
				return true;
			}
		}
		$plain = self::normalize_source( $path, 'exact' );
		if ( $plain && isset( self::$active_exact[ $plain ] ) ) {
			return true;
		}
		foreach ( self::non_exact_rows() as $row ) {
			if ( null !== self::match_row( $row, $path, $query ) ) {
				return true;
			}
		}
		return false;
	}

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
	 * Compile a stored regex pattern; null when invalid.
	 */
	private static function compile_regex( string $pattern, bool $ignore_case ): ?string {
		if ( '' === $pattern ) {
			return null;
		}
		$body = preg_replace( '/(?<!\\\\)~/', '\\~', $pattern );
		if ( ! is_string( $body ) ) {
			return null;
		}
		$re = '~' . $body . '~u' . ( $ignore_case ? 'i' : '' );
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		if ( false === @preg_match( $re, '' ) ) {
			return null;
		}
		return $re;
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

	/**
	 * All active non-exact rows, cached until the next write.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	private static function non_exact_rows(): array {
		$cached = get_transient( self::NON_EXACT_CACHE_KEY );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		global $wpdb;
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			"SELECT id, source, matching, destination, type, ignore_case FROM {$table} WHERE status = 'active' AND matching NOT IN ('exact', '') ORDER BY id ASC",
			ARRAY_A
		);
		$rows = is_array( $rows ) ? $rows : array();
		set_transient( self::NON_EXACT_CACHE_KEY, $rows, DAY_IN_SECONDS );
		return $rows;
	}

	/**
	 * Test one non-exact row against the request.
	 *
	 * @param array<string, mixed> $row   Row (source, matching, ignore_case).
	 * @param string               $path  Decoded request path.
	 * @param string               $query Raw query string ('' when none).
	 * @return array<int|string, string>|null Regex captures (or array()) on match, null otherwise.
	 */
	public static function match_row( array $row, string $path, string $query ): ?array {
		$pattern  = (string) ( $row['source'] ?? '' );
		$matching = self::normalize_matching( $row['matching'] ?? 'exact' );
		$ic       = ! empty( $row['ignore_case'] );
		if ( '' === $pattern ) {
			return null;
		}

		$trimmed   = trim( $path, '/' );
		$canonical = '' === $trimmed ? '/' : '/' . $trimmed . '/';

		if ( 'regex' === $matching ) {
			$re = self::compile_regex( $pattern, $ic );
			if ( null === $re ) {
				return null;
			}
			$subjects = array( $trimmed, '/' . $trimmed );
			if ( '' !== $query ) {
				$subjects[] = $trimmed . '?' . $query;
				$subjects[] = '/' . $trimmed . '?' . $query;
			}
			foreach ( $subjects as $subject ) {
				// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
				if ( 1 === @preg_match( $re, $subject, $m ) ) {
					return $m;
				}
			}
			return null;
		}

		$has_query = false !== strpos( $pattern, '?' );
		if ( $has_query ) {
			if ( '' === $query ) {
				return null;
			}
			$base     = '' === $trimmed ? '/' : '/' . $trimmed;
			$subjects = array( $base . '?' . $query, $canonical . '?' . $query );
		} else {
			$subjects = array( $canonical );
		}

		if ( $ic ) {
			$pattern  = strtolower( $pattern );
			$subjects = array_map( 'strtolower', $subjects );
		}

		foreach ( $subjects as $subject ) {
			switch ( $matching ) {
				case 'contains':
					if ( false !== strpos( $subject, $pattern ) ) {
						return array();
					}
					break;
				case 'start':
					$p = '/' . ltrim( $pattern, '/' );
					if ( 0 === strpos( $subject, $p ) ) {
						return array();
					}
					break;
				case 'end':
					$p = $has_query ? $pattern : rtrim( $pattern, '/' );
					$s = $has_query ? $subject : rtrim( $subject, '/' );
					if ( '' !== $p && strlen( $s ) >= strlen( $p ) && substr( $s, -strlen( $p ) ) === $p ) {
						return array();
					}
					break;
				case 'exact':
					$norm = self::normalize_source( $pattern, 'exact' );
					if ( null !== $norm && $norm === self::normalize_source( ltrim( $subject, '/' ), 'exact' ) ) {
						return array();
					}
					break;
			}
		}
		return null;
	}

	/**
	 * Find the active redirect for a request path (+ query). Exact rows win.
	 *
	 * @return array{row: object|array<string, mixed>, captures: array<int|string, string>}|null
	 */
	public static function find_match( string $path, string $query = '', string $raw_path = '' ): ?array {
		global $wpdb;
		$table = self::table_name();

		$candidates = array();
		if ( '' !== $query ) {
			$with_query = self::normalize_source( $path . '?' . $query, 'exact' );
			if ( $with_query ) {
				$candidates[] = $with_query;
			}
		}
		$plain = self::normalize_source( $path, 'exact' );
		if ( $plain ) {
			$candidates[] = $plain;
		}
		// Rows saved before 0.9.249 kept percent-encoding as typed (e.g. "what%e2%80%99s-new/").
		if ( '' !== $raw_path && false !== strpos( $raw_path, '%' ) ) {
			$legacy = Neo_Pulse_Wp_Redirects_Csv::normalize_relative_path( $raw_path );
			if ( $legacy ) {
				$candidates[] = $legacy;
			}
		}

		foreach ( array_unique( $candidates ) as $source ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE source = %s AND status = 'active' AND matching IN ('exact', '') LIMIT 1", $source ) );
			if ( $row ) {
				return array(
					'row'      => $row,
					'captures' => array(),
				);
			}
		}

		foreach ( self::non_exact_rows() as $row ) {
			$captures = self::match_row( $row, $path, $query );
			if ( null !== $captures ) {
				return array(
					'row'      => (object) $row,
					'captures' => $captures,
				);
			}
		}
		return null;
	}

	public static function maybe_redirect(): void {
		if ( is_admin() || wp_doing_ajax() || wp_doing_cron() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
			return;
		}

		$request_uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
		if ( $request_uri === '' ) {
			return;
		}

		$raw_path = wp_parse_url( $request_uri, PHP_URL_PATH );
		if ( ! is_string( $raw_path ) || $raw_path === '' ) {
			return;
		}
		$path  = rawurldecode( $raw_path );
		$query = wp_parse_url( $request_uri, PHP_URL_QUERY );
		$query = is_string( $query ) ? $query : '';

		$match = self::find_match( $path, $query, $raw_path );
		if ( null === $match ) {
			return;
		}
		$row = $match['row'];

		$code = isset( $row->type ) ? (int) $row->type : 301;
		if ( ! in_array( $code, self::STATUS_CODES, true ) ) {
			$code = 301;
		}

		if ( in_array( $code, self::GONE_CODES, true ) ) {
			self::record_hit( (int) $row->id );
			self::send_gone( $code );
		}

		$destination = (string) $row->destination;
		if ( ! empty( $match['captures'] ) && false !== strpos( $destination, '$' ) ) {
			$captures    = $match['captures'];
			$destination = (string) preg_replace_callback(
				'/\$(\d+)/',
				static function ( array $m ) use ( $captures ): string {
					return isset( $captures[ (int) $m[1] ] ) ? (string) $captures[ (int) $m[1] ] : '';
				},
				$destination
			);
		}

		$target = Neo_Pulse_Wp_Redirects_Csv::resolve_destination_url( $destination );
		if ( ! $target ) {
			return;
		}
		$target = esc_url_raw( $target, array( 'http', 'https' ) );
		if ( '' === $target || ! preg_match( '#^https?://#i', $target ) ) {
			return;
		}

		$current = home_url( '/' . ltrim( $path, '/' ) ) . ( '' !== $query ? '?' . $query : '' );
		$same    = static function ( string $url ): string {
			return untrailingslashit( strtolower( rawurldecode( $url ) ) );
		};
		if ( $same( $current ) === $same( $target ) ) {
			return;
		}

		self::record_hit( (int) $row->id );

		// Admin-entered destinations may point at other hosts; wp_safe_redirect
		// would send those to /wp-admin/, so validate the scheme and use wp_redirect.
		// phpcs:ignore WordPress.Security.SafeRedirect.wp_redirect_wp_redirect
		wp_redirect( $target, $code, 'NEO Pulse WP' );
		exit;
	}

	private static function record_hit( int $id ): void {
		global $wpdb;
		if ( $id < 1 ) {
			return;
		}
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->query(
			$wpdb->prepare(
				"UPDATE {$table} SET hits = hits + 1, last_accessed_at = %s WHERE id = %d",
				current_time( 'mysql', true ),
				$id
			)
		);
	}

	/**
	 * 410 Gone / 451 Unavailable: send the status and render the 404 template.
	 */
	private static function send_gone( int $code ): void {
		global $wp_query;
		if ( $wp_query instanceof WP_Query ) {
			$wp_query->set_404();
		}
		status_header( $code );
		nocache_headers();

		$template = get_404_template();
		if ( '' === $template ) {
			$template = get_index_template();
		}
		$template = apply_filters( 'template_include', $template );
		if ( is_string( $template ) && '' !== $template && file_exists( $template ) ) {
			include $template;
		}
		exit;
	}

	/**
	 * Redirect unmatched 404 requests to the site homepage when enabled in settings.
	 */
	public static function maybe_fallback_home(): void {
		if ( is_admin() || wp_doing_ajax() || wp_doing_cron() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
			return;
		}

		$settings = self::get_settings();
		if ( empty( $settings['fallback_home_enabled'] ) ) {
			return;
		}

		if ( ! is_404() ) {
			return;
		}

		$request_uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
		$path        = is_string( $request_uri ) ? wp_parse_url( $request_uri, PHP_URL_PATH ) : '';
		if ( ! is_string( $path ) || $path === '' || $path === '/' ) {
			return;
		}

		$normalized = Neo_Pulse_Wp_Redirects_Csv::normalize_relative_path( $path );
		if ( ! $normalized ) {
			return;
		}

		$home_url = home_url( '/' );
		$current  = home_url( $path );
		if ( untrailingslashit( strtolower( $current ) ) === untrailingslashit( strtolower( $home_url ) ) ) {
			return;
		}

		$code = isset( $settings['fallback_home_type'] ) ? (int) $settings['fallback_home_type'] : 301;
		if ( ! in_array( $code, array( 301, 302 ), true ) ) {
			$code = 301;
		}

		wp_safe_redirect( $home_url, $code );
		exit;
	}
}
