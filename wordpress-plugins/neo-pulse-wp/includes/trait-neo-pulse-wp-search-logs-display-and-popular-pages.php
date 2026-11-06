<?php
/**
 * Display casing and popular page aggregates.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Search_Logs_Trait_Display_And_Popular_Pages {

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
}
