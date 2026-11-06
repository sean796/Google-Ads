<?php
/**
 * Popular search term aggregates and curation.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Search_Logs_Trait_Popular_Terms {

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
}
