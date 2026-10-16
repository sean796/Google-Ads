<?php
/**
 * AI Search query log storage and aggregates.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Search_Logs {

	const TABLE_VERSION     = '1.0';
	const OPTION_KEY        = 'neo_pulse_wp_search_logs_settings';
	const DB_VERSION_OPTION = 'neo_pulse_wp_search_logs_db_version';
	const SESSION_PATTERN   = '/^csess_[0-9]+_[a-z0-9]{6}$/';

	/**
	 * @return string
	 */
	public static function table_name(): string {
		global $wpdb;
		return $wpdb->prefix . 'neo_pulse_wp_search_events';
	}

	public static function init(): void {
		add_action( 'plugins_loaded', array( __CLASS__, 'maybe_install' ), 20 );
	}

	public static function maybe_install(): void {
		if ( get_option( self::DB_VERSION_OPTION, '' ) !== self::TABLE_VERSION ) {
			self::install();
		}
	}

	public static function install(): void {
		global $wpdb;

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset = $wpdb->get_charset_collate();
		$table   = self::table_name();

		$sql = "CREATE TABLE {$table} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			event_uid varchar(36) NOT NULL,
			session_id varchar(64) NOT NULL,
			page_url varchar(512) DEFAULT NULL,
			query text NOT NULL,
			query_normalized varchar(255) NOT NULL DEFAULT '',
			result_count int(11) unsigned NOT NULL DEFAULT 0,
			intent varchar(32) DEFAULT NULL,
			sentiment varchar(20) DEFAULT NULL,
			results_json longtext DEFAULT NULL,
			accepted_url varchar(512) DEFAULT NULL,
			accepted_title varchar(255) DEFAULT NULL,
			accepted_rank int(11) unsigned DEFAULT NULL,
			accepted_at datetime DEFAULT NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY event_uid (event_uid),
			KEY session_id (session_id),
			KEY query_normalized (query_normalized),
			KEY created_at (created_at),
			KEY accepted_url (accepted_url(191))
		) {$charset};";

		dbDelta( $sql );
		update_option( self::DB_VERSION_OPTION, self::TABLE_VERSION, false );

		if ( get_option( self::OPTION_KEY, null ) === null ) {
			add_option(
				self::OPTION_KEY,
				array(
					'logging_enabled' => true,
					'retention_days'  => 90,
				),
				'',
				false
			);
		}
	}

	/**
	 * @return array{logging_enabled: bool, retention_days: int}
	 */
	public static function get_settings(): array {
		$raw = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $raw ) ) {
			$raw = array();
		}
		$days = isset( $raw['retention_days'] ) ? (int) $raw['retention_days'] : 90;
		if ( $days < 1 ) {
			$days = 90;
		}
		if ( $days > 3650 ) {
			$days = 3650;
		}
		return array(
			'logging_enabled' => ! array_key_exists( 'logging_enabled', $raw ) || ! empty( $raw['logging_enabled'] ),
			'retention_days'  => $days,
		);
	}

	/**
	 * @param array<string, mixed> $settings Settings.
	 */
	public static function save_settings( array $settings ): void {
		$days = isset( $settings['retention_days'] ) ? (int) $settings['retention_days'] : 90;
		if ( $days < 1 ) {
			$days = 90;
		}
		if ( $days > 3650 ) {
			$days = 3650;
		}
		update_option(
			self::OPTION_KEY,
			array(
				'logging_enabled' => ! empty( $settings['logging_enabled'] ),
				'retention_days'  => $days,
			),
			false
		);
	}

	public static function is_logging_active(): bool {
		$settings = self::get_settings();
		return ! empty( $settings['logging_enabled'] );
	}

	public static function is_valid_session_id( string $session_id ): bool {
		return (bool) preg_match( self::SESSION_PATTERN, $session_id );
	}

	public static function normalize_query( string $query ): string {
		$normalized = strtolower( trim( preg_replace( '/\s+/', ' ', $query ) ) );
		if ( strlen( $normalized ) > 255 ) {
			$normalized = substr( $normalized, 0, 255 );
		}
		return $normalized;
	}

	/**
	 * @param array<string, mixed> $data Row data.
	 * @return array{ok: bool, event_uid?: string, id?: int, error?: string}
	 */
	public static function insert( array $data ) {
		if ( ! self::is_logging_active() && ! self::is_import_context() ) {
			return array( 'ok' => false, 'error' => 'logging_disabled' );
		}

		$session_id = isset( $data['session_id'] ) ? sanitize_text_field( (string) $data['session_id'] ) : '';
		if ( ! self::is_valid_session_id( $session_id ) ) {
			return array( 'ok' => false, 'error' => 'invalid_session' );
		}

		$query = isset( $data['query'] ) ? sanitize_text_field( (string) $data['query'] ) : '';
		if ( class_exists( 'Neo_Pulse_Wp_Search' ) ) {
			$query = Neo_Pulse_Wp_Search::clamp_query( $query );
		}
		if ( trim( $query ) === '' ) {
			return array( 'ok' => false, 'error' => 'empty_query' );
		}

		$event_uid = isset( $data['event_uid'] ) ? sanitize_text_field( (string) $data['event_uid'] ) : '';
		if ( $event_uid === '' || ! self::is_valid_uuid( $event_uid ) ) {
			$event_uid = self::new_uuid();
		}

		$page_url = isset( $data['page_url'] ) ? esc_url_raw( (string) $data['page_url'] ) : '';
		if ( strlen( $page_url ) > 512 ) {
			$page_url = substr( $page_url, 0, 512 );
		}

		$result_count = isset( $data['result_count'] ) ? max( 0, (int) $data['result_count'] ) : 0;
		$intent       = isset( $data['intent'] ) ? sanitize_key( (string) $data['intent'] ) : '';
		$sentiment    = isset( $data['sentiment'] ) ? sanitize_key( (string) $data['sentiment'] ) : '';

		$results_json = '';
		if ( isset( $data['results'] ) && is_array( $data['results'] ) ) {
			$snapshot = array();
			foreach ( array_slice( $data['results'], 0, 10 ) as $row ) {
				if ( ! is_array( $row ) ) {
					continue;
				}
				$snapshot[] = array(
					'title' => isset( $row['title'] ) ? sanitize_text_field( (string) $row['title'] ) : '',
					'url'   => isset( $row['url'] ) ? esc_url_raw( (string) $row['url'] ) : '',
				);
			}
			$results_json = wp_json_encode( $snapshot );
		}

		global $wpdb;
		$table = self::table_name();
		$now   = current_time( 'mysql', true );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$inserted = $wpdb->insert(
			$table,
			array(
				'event_uid'        => $event_uid,
				'session_id'       => $session_id,
				'page_url'         => $page_url !== '' ? $page_url : null,
				'query'            => $query,
				'query_normalized' => self::normalize_query( $query ),
				'result_count'     => $result_count,
				'intent'           => $intent !== '' ? $intent : null,
				'sentiment'        => $sentiment !== '' ? $sentiment : null,
				'results_json'     => $results_json !== '' ? $results_json : null,
				'created_at'       => $now,
			),
			array( '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s' )
		);

		if ( false === $inserted ) {
			return array( 'ok' => false, 'error' => __( 'Could not save search log.', 'neo-pulse-wp' ) );
		}

		self::maybe_prune_retention();

		return array(
			'ok'        => true,
			'id'        => (int) $wpdb->insert_id,
			'event_uid' => $event_uid,
		);
	}

	/**
	 * @param array<string, mixed> $data Accept data.
	 * @return array{ok: bool, error?: string}
	 */
	public static function record_accept( array $data ) {
		if ( ! self::is_logging_active() ) {
			return array( 'ok' => false, 'error' => 'logging_disabled' );
		}

		$event_uid = isset( $data['event_uid'] ) ? sanitize_text_field( (string) $data['event_uid'] ) : '';
		if ( ! self::is_valid_uuid( $event_uid ) ) {
			return array( 'ok' => false, 'error' => 'invalid_event' );
		}

		$url = isset( $data['url'] ) ? esc_url_raw( (string) $data['url'] ) : '';
		if ( $url === '' ) {
			return array( 'ok' => false, 'error' => 'empty_url' );
		}
		if ( strlen( $url ) > 512 ) {
			$url = substr( $url, 0, 512 );
		}

		$title = isset( $data['title'] ) ? sanitize_text_field( (string) $data['title'] ) : '';
		if ( strlen( $title ) > 255 ) {
			$title = substr( $title, 0, 255 );
		}

		$rank = isset( $data['rank'] ) ? max( 1, (int) $data['rank'] ) : null;

		global $wpdb;
		$table = self::table_name();
		$now   = current_time( 'mysql', true );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$updated = $wpdb->update(
			$table,
			array(
				'accepted_url'   => $url,
				'accepted_title' => $title !== '' ? $title : null,
				'accepted_rank'  => $rank,
				'accepted_at'    => $now,
			),
			array( 'event_uid' => $event_uid ),
			array( '%s', '%s', '%d', '%s' ),
			array( '%s' )
		);

		if ( false === $updated ) {
			return array( 'ok' => false, 'error' => __( 'Could not update search log.', 'neo-pulse-wp' ) );
		}

		return array( 'ok' => true );
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

		$session = isset( $args['session_id'] ) ? sanitize_text_field( (string) $args['session_id'] ) : '';
		if ( $session !== '' ) {
			$where[]  = 'session_id LIKE %s';
			$params[] = '%' . $wpdb->esc_like( $session ) . '%';
		}

		$date_from = isset( $args['date_from'] ) ? sanitize_text_field( (string) $args['date_from'] ) : '';
		if ( $date_from !== '' && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_from ) ) {
			$where[]  = 'created_at >= %s';
			$params[] = $date_from . ' 00:00:00';
		}

		$date_to = isset( $args['date_to'] ) ? sanitize_text_field( (string) $args['date_to'] ) : '';
		if ( $date_to !== '' && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_to ) ) {
			$where[]  = 'created_at <= %s';
			$params[] = $date_to . ' 23:59:59';
		}

		$search = isset( $args['search'] ) ? sanitize_text_field( (string) $args['search'] ) : '';
		if ( $search !== '' ) {
			$like     = '%' . $wpdb->esc_like( $search ) . '%';
			$where[]  = '(query LIKE %s OR accepted_url LIKE %s OR session_id LIKE %s)';
			$params[] = $like;
			$params[] = $like;
			$params[] = $like;
		}

		if ( ! empty( $args['accepted_only'] ) ) {
			$where[] = 'accepted_url IS NOT NULL AND accepted_url != %s';
			$params[] = '';
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
			'query'        => 'query',
			'result_count' => 'result_count',
			'intent'       => 'intent',
			'created_at'   => 'created_at',
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
	 * @param array<string, mixed> $args Query args.
	 * @return array<int, object>
	 */
	public static function query_for_export( array $args = array() ): array {
		$args['per_page'] = isset( $args['per_page'] ) ? (int) $args['per_page'] : 50000;
		$args['page']     = 1;
		$result           = self::query( $args );
		return $result['items'];
	}

	public static function count_events(): int {
		global $wpdb;
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
	}

	public static function delete_event( int $id ): bool {
		global $wpdb;
		if ( $id < 1 ) {
			return false;
		}
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		return (bool) $wpdb->delete( $table, array( 'id' => $id ), array( '%d' ) );
	}

	public static function delete_all_events(): int {
		global $wpdb;
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return (int) $wpdb->query( "TRUNCATE TABLE {$table}" );
	}

	/**
	 * @param int $days Lookback window.
	 * @param int $limit Max rows.
	 * @return array<int, array{query: string, count: int}>
	 */
	public static function aggregate_popular_terms( int $days = 30, int $limit = 5 ): array {
		global $wpdb;
		$table  = self::table_name();
		$cutoff = gmdate( 'Y-m-d H:i:s', time() - ( max( 1, $days ) * DAY_IN_SECONDS ) );
		$limit  = max( 1, min( 20, $limit ) );

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT query, query_normalized, COUNT(*) AS search_count
				FROM {$table}
				WHERE created_at >= %s AND query_normalized != ''
				GROUP BY query_normalized
				ORDER BY search_count DESC
				LIMIT %d",
				$cutoff,
				$limit
			)
		);

		$out = array();
		if ( is_array( $rows ) ) {
			foreach ( $rows as $row ) {
				$out[] = array(
					'query' => (string) $row->query,
					'count' => (int) $row->search_count,
				);
			}
		}
		return $out;
	}

	/**
	 * Candidates for the search widget's "Popular searches": only searches that found something,
	 * ranked by how many different visitors made them plus how often a result was clicked, so one
	 * person searching the same thing ten times doesn't push it to the top.
	 *
	 * @param int $days  Lookback window.
	 * @param int $limit Max rows.
	 * @return array<int, array{query: string, count: int}>
	 */
	public static function widget_term_candidates( int $days = 30, int $limit = 20 ): array {
		global $wpdb;
		$table  = self::table_name();
		$cutoff = gmdate( 'Y-m-d H:i:s', time() - ( max( 1, $days ) * DAY_IN_SECONDS ) );
		$limit  = max( 1, min( 40, $limit ) );

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT MIN(query) AS query, query_normalized,
					COUNT(DISTINCT session_id) AS visitors,
					SUM(CASE WHEN accepted_url IS NOT NULL AND accepted_url != '' THEN 1 ELSE 0 END) AS clicks,
					COUNT(*) AS search_count
				FROM {$table}
				WHERE created_at >= %s AND query_normalized != '' AND result_count > 0
				GROUP BY query_normalized
				ORDER BY (COUNT(DISTINCT session_id) + SUM(CASE WHEN accepted_url IS NOT NULL AND accepted_url != '' THEN 1 ELSE 0 END)) DESC, search_count DESC
				LIMIT %d",
				$cutoff,
				$limit
			)
		);

		$out = array();
		if ( is_array( $rows ) ) {
			foreach ( $rows as $row ) {
				$out[] = array(
					'query' => (string) $row->query,
					'count' => (int) $row->visitors,
				);
			}
		}
		return $out;
	}

	/**
	 * "Popular searches" for the search widget.
	 *
	 * Normally this is the list built once a week from the stored weekly totals (see
	 * Neo_Pulse_Wp_Search_Weekly), so it reflects many weeks of searches and stays the same all week.
	 * Until the first full week has been stored, it falls back to the last $days of searches.
	 *
	 * @param int $days  Lookback window for the fallback.
	 * @param int $limit Max rows returned.
	 * @return array<int, array{query: string, count: int}>
	 */
	public static function aggregate_popular_terms_curated( int $days = 30, int $limit = 5 ): array {
		$limit = max( 1, min( 20, $limit ) );
		$days  = max( 1, min( 365, $days ) );

		if ( class_exists( 'Neo_Pulse_Wp_Search_Weekly' ) ) {
			$weekly = Neo_Pulse_Wp_Search_Weekly::popular_terms( $limit );
			if ( $weekly !== null ) {
				return self::fill_with_seeds( $weekly, $limit );
			}
		}

		$cache_key = 'neo-pulse_search_popular_terms_v2_' . $days . '_' . $limit;
		$cached    = get_transient( $cache_key );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		$candidates = self::widget_term_candidates( $days, min( 20, $limit * 4 ) );
		$curated    = self::fill_with_seeds( self::curate_candidates( $candidates, $limit ), $limit );

		set_transient( $cache_key, $curated, HOUR_IN_SECONDS );
		return $curated;
	}

	/**
	 * Turn candidate searches into the shown list: the AI keeps real, correctly spelled searches and
	 * drops near-duplicates (without AI: searches at least two different visitors made), then each
	 * one is put in sentence case.
	 *
	 * @param array<int, array{query: string, count: int}> $candidates Most popular first.
	 * @param int                                          $limit      Max rows.
	 * @return array<int, array{query: string, count: int}>
	 */
	public static function curate_candidates( array $candidates, int $limit ): array {
		$curated = null;
		if (
			$candidates !== array()
			&& class_exists( 'Neo_Pulse_Wp_OpenRouter' )
			&& Neo_Pulse_Wp_OpenRouter::get_api_key() !== ''
			&& ! Neo_Pulse_Wp_License::ai_needs_upgrade( false )
		) {
			$curated = self::curate_popular_terms_with_openrouter( $candidates, $limit );
		}
		if ( null === $curated ) {
			$curated = array();
			foreach ( $candidates as $row ) {
				if ( count( $curated ) < $limit && (int) $row['count'] >= 2 ) {
					$curated[] = $row;
				}
			}
		}

		$out = array();
		foreach ( array_slice( $curated, 0, $limit ) as $row ) {
			$label = isset( $row['label'] ) ? (string) $row['label'] : '';
			$out[] = array(
				'query' => $label !== '' ? $label : self::display_case( (string) $row['query'] ),
				'count' => (int) ( $row['count'] ?? 0 ),
			);
		}
		return $out;
	}

	/**
	 * Top up a short list with the site's own focus keywords (sentence case too).
	 *
	 * @param array<int, array{query: string, count: int}> $terms
	 * @return array<int, array{query: string, count: int}>
	 */
	private static function fill_with_seeds( array $terms, int $limit ): array {
		$terms = array_slice( $terms, 0, $limit );
		if ( count( $terms ) >= $limit ) {
			return $terms;
		}
		$exclude = array();
		foreach ( $terms as $row ) {
			$key = self::normalize_query( (string) $row['query'] );
			if ( $key !== '' ) {
				$exclude[] = $key;
			}
		}
		foreach ( self::aggregate_popular_terms_from_sitemap( $limit - count( $terms ), $exclude ) as $seed ) {
			$terms[] = array(
				'query' => self::display_case( (string) $seed['query'] ),
				'count' => 0,
			);
		}
		return $terms;
	}

	/**
	 * Sitemap-scoped ACF keyword_focus seeds for Popular searches.
	 *
	 * @param int               $limit             Max rows returned.
	 * @param array<int,string> $exclude_normalized Normalized queries to skip.
	 * @return array<int, array{query: string, count: int}>
	 */
	public static function aggregate_popular_terms_from_sitemap( int $limit, array $exclude_normalized = array() ): array {
		if ( $limit < 1 ) {
			return array();
		}

		$pool = self::get_sitemap_keyword_pool();
		if ( $pool === array() ) {
			return array();
		}

		$exclude = array();
		foreach ( $exclude_normalized as $key ) {
			$norm = self::normalize_query( (string) $key );
			if ( $norm !== '' ) {
				$exclude[ $norm ] = true;
			}
		}

		$out = array();
		foreach ( $pool as $row ) {
			if ( count( $out ) >= $limit ) {
				break;
			}
			$query = isset( $row['query'] ) ? trim( (string) $row['query'] ) : '';
			if ( $query === '' ) {
				continue;
			}
			$key = self::normalize_query( $query );
			if ( $key === '' || isset( $exclude[ $key ] ) ) {
				continue;
			}
			$out[] = array(
				'query' => $query,
				'count' => 0,
			);
		}

		return $out;
	}

	/**
	 * @return array<int, array{query: string, count: int}>
	 */
	private static function get_sitemap_keyword_pool(): array {
		$cache_key = 'neo-pulse_search_popular_terms_sitemap_pool';
		$cached    = get_transient( $cache_key );
		if ( is_array( $cached ) ) {
			return $cached;
		}

		$pool = self::build_sitemap_keyword_pool( 20 );
		set_transient( $cache_key, $pool, HOUR_IN_SECONDS );
		return $pool;
	}

	/**
	 * @param int $max_pool Max unique keywords to collect.
	 * @return array<int, array{query: string, count: int}>
	 */
	private static function build_sitemap_keyword_pool( int $max_pool ): array {
		if (
			! class_exists( 'Neo_Pulse_Wp_Sitemap_Settings' )
			|| ! class_exists( 'Neo_Pulse_Wp_Sitemap_Generator' )
			|| ! class_exists( 'Neo_Pulse_Wp_Ai_Context' )
		) {
			return array();
		}

		$config     = Neo_Pulse_Wp_Sitemap_Settings::get_config();
		$post_types = Neo_Pulse_Wp_Sitemap_Generator::enabled_post_types( $config );
		if ( $post_types === array() ) {
			return array();
		}

		$excluded = Neo_Pulse_Wp_Sitemap_Settings::excluded_post_ids( $config );
		$seen     = array();
		$pool     = array();

		foreach ( $post_types as $post_type ) {
			if ( ! post_type_exists( $post_type ) ) {
				continue;
			}

			$page = 1;
			do {
				$items = get_posts(
					array(
						'post_type'              => $post_type,
						'post_status'            => 'publish',
						'posts_per_page'         => 100,
						'paged'                  => $page,
						'orderby'                => 'modified',
						'order'                  => 'DESC',
						'post__not_in'           => $excluded,
						'no_found_rows'          => true,
						'update_post_meta_cache' => true,
						'update_post_term_cache' => false,
					)
				);

				foreach ( $items as $post ) {
					if ( count( $pool ) >= $max_pool ) {
						break 2;
					}
					if ( ! $post instanceof WP_Post ) {
						continue;
					}
					if ( self::is_sitemap_noindex( $post->ID ) ) {
						continue;
					}

					$keyword = Neo_Pulse_Wp_Ai_Context::read_acf_or_meta( $post->ID, array( 'keyword_focus' ) );
					$keyword = trim( $keyword );
					if ( $keyword === '' ) {
						continue;
					}

					$key = self::normalize_query( $keyword );
					if ( $key === '' || isset( $seen[ $key ] ) ) {
						continue;
					}

					$seen[ $key ] = true;
					$pool[]       = array(
						'query' => $keyword,
						'count' => 0,
					);
				}

				++$page;
			} while ( count( $items ) === 100 && count( $pool ) < $max_pool );
		}

		return $pool;
	}

	/**
	 * @param int $post_id Post ID.
	 */
	private static function is_sitemap_noindex( int $post_id ): bool {
		$rm = get_post_meta( $post_id, 'rank_math_robots', true );
		if ( is_array( $rm ) && in_array( 'noindex', $rm, true ) ) {
			return true;
		}
		if ( is_string( $rm ) && stripos( $rm, 'noindex' ) !== false ) {
			return true;
		}

		$yoast = get_post_meta( $post_id, '_yoast_wpseo_meta-robots-noindex', true );
		return (string) $yoast === '1';
	}

	/**
	 * @param array<int, array{query: string, count: int}> $candidates Logged customer queries.
	 * @param int                                          $limit      Max rows.
	 * @return array<int, array{query: string, label: string, count: int}>|null Null when the AI couldn't be reached.
	 */
	private static function curate_popular_terms_with_openrouter( array $candidates, int $limit ): ?array {
		$by_normalized = array();
		foreach ( $candidates as $row ) {
			$query = isset( $row['query'] ) ? trim( (string) $row['query'] ) : '';
			if ( $query === '' ) {
				continue;
			}
			$key = self::normalize_query( $query );
			if ( $key === '' || isset( $by_normalized[ $key ] ) ) {
				continue;
			}
			$by_normalized[ $key ] = array(
				'query' => $query,
				'count' => isset( $row['count'] ) ? (int) $row['count'] : 0,
			);
		}

		if ( $by_normalized === array() ) {
			return array();
		}

		$lines = array();
		$index = 1;
		foreach ( $by_normalized as $row ) {
			$lines[] = $index . '. "' . $row['query'] . '" (count: ' . $row['count'] . ')';
			++$index;
		}

		$system = 'You filter on-site customer search queries for a WordPress search widget. Respond with ONLY valid JSON (no markdown): {"terms":[{"query":"...","label":"...","count":123}]}. Rules: return up to ' . $limit . ' items copied from the input list only, in the same popularity order. Include a query only when every word is a real, correctly spelled word (English or proper nouns). Exclude typos, gibberish, partial words, and random characters. When two queries ask for the same thing in different words, keep only the more popular one. Do not invent new phrases or SEO keywords. "query" must be copied exactly from the input. "label" is the same words in sentence case: capitalise the first letter, brand names and proper nouns (for example "Hunter Douglas"), keep acronyms in capitals, and lowercase everything else. Do not change, add or remove any words in "label". Count must match the input entry.';
		$user   = "Customer search queries:\n" . implode( "\n", $lines );

		$result = Neo_Pulse_Wp_OpenRouter::complete( $system, $user, 500, 0.1, Neo_Pulse_Wp_Search::get_openrouter_model() );
		if ( is_wp_error( $result ) ) {
			return null;
		}

		$text = trim( (string) $result );
		if ( strpos( $text, '```' ) !== false ) {
			$text = preg_replace( '/```(?:json)?\s*/i', '', $text );
			$text = preg_replace( '/```/', '', $text );
			$text = trim( (string) $text );
		}

		$parsed = json_decode( $text, true );
		if ( ! is_array( $parsed ) || ! isset( $parsed['terms'] ) || ! is_array( $parsed['terms'] ) ) {
			return null;
		}

		$out = array();
		foreach ( $parsed['terms'] as $term ) {
			if ( count( $out ) >= $limit ) {
				break;
			}
			if ( ! is_array( $term ) ) {
				continue;
			}
			$query = isset( $term['query'] ) ? trim( (string) $term['query'] ) : '';
			if ( $query === '' ) {
				continue;
			}
			$key = self::normalize_query( $query );
			if ( $key === '' || ! isset( $by_normalized[ $key ] ) ) {
				continue;
			}
			$source = $by_normalized[ $key ];
			$label  = isset( $term['label'] ) ? trim( (string) $term['label'] ) : '';
			// Use the AI's casing only when it changed nothing but the casing.
			if ( $label !== '' && self::normalize_query( $label ) !== $key ) {
				$label = '';
			}
			$out[] = array(
				'query' => $source['query'],
				'label' => $label,
				'count' => $source['count'],
			);
		}

		return $out;
	}

	/**
	 * Sentence case that keeps names: "hunter douglas prices" → "Hunter Douglas prices".
	 * A word keeps capitals when the site's own text writes it that way (brand names, places, products),
	 * when it's an acronym typed in capitals (LED, UV) or when it has inner capitals (PowerView).
	 */
	public static function display_case( string $term ): string {
		$term = trim( (string) preg_replace( '/\s+/u', ' ', $term ) );
		if ( $term === '' ) {
			return '';
		}
		$nouns = self::proper_noun_map();
		$parts = preg_split( '/([\s\/\-–—&+,()]+)/u', $term, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY );
		$out   = '';
		foreach ( (array) $parts as $part ) {
			if ( ! preg_match( '/\p{L}/u', $part ) ) {
				$out .= $part;
				continue;
			}
			$lower = self::lower( $part );
			if ( isset( $nouns[ $lower ] ) ) {
				$out .= $nouns[ $lower ];
			} elseif ( preg_match( '/^\p{Lu}{2,5}$/u', $part ) ) {
				$out .= $part; // Acronym typed in capitals.
			} elseif ( preg_match( '/^\p{L}+\p{Lu}/u', $part ) && preg_match( '/\p{Ll}/u', $part ) ) {
				$out .= $part; // Inner capitals (PowerView, iPhone).
			} else {
				$out .= $lower;
			}
		}
		$first = function_exists( 'mb_substr' ) ? mb_substr( $out, 0, 1 ) : substr( $out, 0, 1 );
		$rest  = function_exists( 'mb_substr' ) ? mb_substr( $out, 1 ) : substr( $out, 1 );
		return ( function_exists( 'mb_strtoupper' ) ? mb_strtoupper( $first ) : strtoupper( $first ) ) . $rest;
	}

	private static function lower( string $text ): string {
		return function_exists( 'mb_strtolower' ) ? mb_strtolower( $text ) : strtolower( $text );
	}

	/**
	 * Words the site writes with a capital letter in the middle of a sentence (names, brands, places),
	 * learned from its own pages and posts and the site name. Cached for 12 hours.
	 *
	 * @return array<string,string> lowercase word => how the site writes it
	 */
	private static function proper_noun_map(): array {
		static $memo = null;
		if ( is_array( $memo ) ) {
			return $memo;
		}
		$cached = get_transient( 'neo-pulse_search_proper_nouns' );
		if ( is_array( $cached ) ) {
			$memo = $cached;
			return $memo;
		}

		$tally = array(); // lower => [ 'caps' => n, 'lower' => n, 'forms' => [ form => n ] ]
		$posts = get_posts(
			array(
				'post_type'              => array_values( get_post_types( array( 'public' => true ) ) ),
				'post_status'            => 'publish',
				'has_password'           => false,
				'posts_per_page'         => 150,
				'orderby'                => 'modified',
				'order'                  => 'DESC',
				'no_found_rows'          => true,
				'update_post_meta_cache' => false,
				'update_post_term_cache' => false,
			)
		);
		foreach ( $posts as $post ) {
			if ( ! $post instanceof WP_Post ) {
				continue;
			}
			$text = $post->post_excerpt . "\n" . substr( (string) $post->post_content, 0, 40000 );
			$text = wp_strip_all_tags( strip_shortcodes( $text ), false );
			$text = html_entity_decode( $text, ENT_QUOTES, 'UTF-8' );
			// Split into sentences, then skip each sentence's first word (always capitalised).
			foreach ( preg_split( '/[.!?:;\n\r•|]+/u', $text ) as $sentence ) {
				$words = preg_split( '/[^\p{L}\p{N}\'’]+/u', $sentence, -1, PREG_SPLIT_NO_EMPTY );
				array_shift( $words );
				foreach ( (array) $words as $word ) {
					if ( ! preg_match( '/^\p{L}/u', $word ) || strlen( $word ) < 2 ) {
						continue;
					}
					$lower = self::lower( $word );
					if ( ! isset( $tally[ $lower ] ) ) {
						$tally[ $lower ] = array( 'caps' => 0, 'lower' => 0, 'forms' => array() );
					}
					if ( preg_match( '/^\p{Lu}/u', $word ) && ! preg_match( '/^\p{Lu}+$/u', $word ) ) {
						++$tally[ $lower ]['caps'];
						$tally[ $lower ]['forms'][ $word ] = ( $tally[ $lower ]['forms'][ $word ] ?? 0 ) + 1;
					} elseif ( $word === $lower ) {
						++$tally[ $lower ]['lower'];
					}
				}
			}
		}

		$map = array();
		foreach ( $tally as $lower => $t ) {
			if ( $t['caps'] < 1 ) {
				continue;
			}
			arsort( $t['forms'] );
			$form = (string) array_key_first( $t['forms'] );
			// Mostly written with a capital and seen that way at least twice, or a brand-style name with
			// inner capitals (PowerView) seen even once.
			$inner = (bool) preg_match( '/^\p{Lu}\p{Ll}+\p{Lu}/u', $form );
			if ( ( $t['caps'] >= 2 || $inner ) && $t['caps'] >= 3 * $t['lower'] ) {
				$map[ $lower ] = $form;
			}
		}
		foreach ( preg_split( '/\s+/u', (string) get_bloginfo( 'name' ) ) as $word ) {
			$word = trim( $word, " \t\n\r\0\x0B.,:;!?()\"'" );
			if ( preg_match( '/^\p{Lu}\p{L}+$/u', $word ) ) {
				$map[ self::lower( $word ) ] = $word;
			}
		}

		if ( count( $map ) > 800 ) {
			$map = array_slice( $map, 0, 800, true );
		}
		set_transient( 'neo-pulse_search_proper_nouns', $map, 12 * HOUR_IN_SECONDS );
		$memo = $map;
		return $memo;
	}

	/**
	 * @param int $days Lookback window.
	 * @param int $limit Max rows.
	 * @return array<int, array{url: string, title: string, count: int}>
	 */
	public static function aggregate_popular_pages_from_search( int $days = 30, int $limit = 5 ): array {
		global $wpdb;
		$table  = self::table_name();
		$cutoff = gmdate( 'Y-m-d H:i:s', time() - ( max( 1, $days ) * DAY_IN_SECONDS ) );
		$limit  = max( 1, min( 20, $limit ) );

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT accepted_url AS url, accepted_title AS title, COUNT(*) AS click_count
				FROM {$table}
				WHERE created_at >= %s AND accepted_url IS NOT NULL AND accepted_url != ''
				GROUP BY accepted_url, accepted_title
				ORDER BY click_count DESC
				LIMIT %d",
				$cutoff,
				$limit
			)
		);

		$out = array();
		if ( is_array( $rows ) ) {
			foreach ( $rows as $row ) {
				$out[] = array(
					'url'   => (string) $row->url,
					'title' => (string) $row->title,
					'count' => (int) $row->click_count,
				);
			}
		}
		return $out;
	}

	/**
	 * @param int $days Lookback window.
	 * @param int $limit Max rows.
	 * @return array<int, array{url: string, title: string, count: int}>
	 */
	public static function aggregate_popular_pages_overseer( int $days = 30, int $limit = 5 ): array {
		if ( ! class_exists( 'Neo_Pulse_Wp_Overseer_Aggregates' ) ) {
			return array();
		}
		$date_to   = gmdate( 'Y-m-d' );
		$date_from = gmdate( 'Y-m-d', time() - ( max( 1, $days ) * DAY_IN_SECONDS ) );
		$rows      = Neo_Pulse_Wp_Overseer_Aggregates::aggregate_by_page( $date_from, $date_to );
		$limit     = max( 1, min( 20, $limit ) );
		$out       = array();

		foreach ( array_slice( $rows, 0, $limit ) as $row ) {
			$url = isset( $row->page_url ) ? (string) $row->page_url : '';
			if ( $url === '' ) {
				continue;
			}
			$title = self::title_from_url( $url );
			$out[] = array(
				'url'   => $url,
				'title' => $title,
				'count' => isset( $row->pageviews ) ? (int) $row->pageviews : 0,
			);
		}
		return $out;
	}

	private static function title_from_url( string $url ): string {
		$post_id = url_to_postid( $url );
		if ( $post_id > 0 ) {
			$title = get_the_title( $post_id );
			if ( is_string( $title ) && trim( $title ) !== '' ) {
				return html_entity_decode( $title, ENT_QUOTES, 'UTF-8' );
			}
		}
		$path = wp_parse_url( $url, PHP_URL_PATH );
		if ( is_string( $path ) && $path !== '' && $path !== '/' ) {
			$slug = trim( basename( untrailingslashit( $path ) ), '/' );
			if ( $slug !== '' ) {
				return ucwords( str_replace( array( '-', '_' ), ' ', $slug ) );
			}
		}
		return $url;
	}

	/**
	 * Delete rows older than the retention period. No cron covers this table, so it runs from
	 * insert(), but at most once every 12 hours instead of on every logged search.
	 */
	public static function maybe_prune_retention(): void {
		$settings = self::get_settings();
		$days     = (int) $settings['retention_days'];
		if ( $days < 1 ) {
			return;
		}
		if ( get_transient( 'neo_pulse_search_logs_pruned' ) ) {
			return;
		}
		set_transient( 'neo_pulse_search_logs_pruned', 1, 12 * HOUR_IN_SECONDS );
		$cutoff = gmdate( 'Y-m-d H:i:s', time() - ( $days * DAY_IN_SECONDS ) );
		global $wpdb;
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE created_at < %s", $cutoff ) );
	}

	/** @var bool */
	private static $import_context = false;

	public static function set_import_context( bool $enabled ): void {
		self::$import_context = $enabled;
	}

	private static function is_import_context(): bool {
		return self::$import_context;
	}

	public static function new_uuid(): string {
		if ( function_exists( 'wp_generate_uuid4' ) ) {
			return wp_generate_uuid4();
		}
		return sprintf(
			'%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
			wp_rand( 0, 0xffff ),
			wp_rand( 0, 0xffff ),
			wp_rand( 0, 0xffff ),
			wp_rand( 0, 0x0fff ) | 0x4000,
			wp_rand( 0, 0x3fff ) | 0x8000,
			wp_rand( 0, 0xffff ),
			wp_rand( 0, 0xffff ),
			wp_rand( 0, 0xffff )
		);
	}

	private static function is_valid_uuid( string $uuid ): bool {
		return (bool) preg_match(
			'/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
			$uuid
		);
	}
}
