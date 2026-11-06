<?php
/**
 * Redirect matching and front-end execution.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Redirects_Trait_Matching {

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
