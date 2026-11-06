<?php
/**
 * Query term extraction, item scoring, cache invalidation, and agent site index for chat RAG.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Rag_Trait_Terms_Agent {

	/**
	 * Strip chip-style prefixes so retrieval focuses on the topic phrase.
	 */
	public static function normalize_retrieval_query( string $query ): string {
		$query = trim( $query );
		if ( preg_match( '/^tell me about\s+/i', $query ) ) {
			$query = preg_replace( '/^tell me about\s+/i', '', $query );
		}
		return trim( $query );
	}

	/**
	 * Extract meaningful search terms from a query string.
	 *
	 * @return array<int,string>
	 */
	public static function extract_terms( string $query ): array {
		$stop_words = array(
			'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'for',
			'of', 'and', 'or', 'but', 'not', 'with', 'this', 'that', 'from',
			'by', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
			'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
			'may', 'might', 'can', 'i', 'you', 'we', 'they', 'he', 'she',
			'me', 'my', 'your', 'what', 'where', 'when', 'how', 'which',
			'who', 'whom', 'about', 'up', 'out', 'so', 'if', 'then', 'than',
			'too', 'very', 'just', 'more', 'also', 'any', 'each', 'all',
		);

		$query  = self::normalize_retrieval_query( $query );
		$query  = strtolower( trim( $query ) );
		$query  = preg_replace( '/[^\w\s]/', ' ', $query );
		$words  = preg_split( '/\s+/', $query, -1, PREG_SPLIT_NO_EMPTY );
		$terms  = array();

		foreach ( $words as $w ) {
			if ( strlen( $w ) >= 2 && ! in_array( $w, $stop_words, true ) ) {
				$terms[] = $w;
			}
		}

		return array_unique( $terms );
	}

	/**
	 * Singles plus hyphenated/spaced bigrams for slug and URL path matching.
	 *
	 * @param array<int,string> $extra_phrases Phase A search_terms or other multi-word phrases.
	 * @return array<int,string>
	 */
	public static function extract_match_terms( string $query, array $extra_phrases = array() ): array {
		$stop_words = array(
			'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'for',
			'of', 'and', 'or', 'but', 'not', 'with', 'this', 'that', 'from',
			'by', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
			'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
			'may', 'might', 'can', 'i', 'you', 'we', 'they', 'he', 'she',
			'me', 'my', 'your', 'what', 'where', 'when', 'how', 'which',
			'who', 'whom', 'about', 'up', 'out', 'so', 'if', 'then', 'than',
			'too', 'very', 'just', 'more', 'also', 'any', 'each', 'all',
		);

		$terms   = self::extract_terms( $query );
		$normalized = strtolower( trim( self::normalize_retrieval_query( $query ) ) );
		$normalized = preg_replace( '/[^\w\s]/', ' ', $normalized );
		$words   = preg_split( '/\s+/', $normalized, -1, PREG_SPLIT_NO_EMPTY );

		for ( $i = 0; $i < count( $words ) - 1; $i++ ) {
			$w1 = $words[ $i ];
			$w2 = $words[ $i + 1 ];
			if ( strlen( $w1 ) < 2 || strlen( $w2 ) < 2 ) {
				continue;
			}
			if ( in_array( $w1, $stop_words, true ) || in_array( $w2, $stop_words, true ) ) {
				continue;
			}
			$terms[] = $w1 . '-' . $w2;
			$terms[] = $w1 . ' ' . $w2;
		}

		foreach ( $extra_phrases as $phrase ) {
			$phrase = strtolower( trim( (string) $phrase ) );
			if ( $phrase === '' ) {
				continue;
			}
			$terms[] = $phrase;
			$terms[] = str_replace( ' ', '-', $phrase );
			foreach ( self::extract_terms( $phrase ) as $part ) {
				$terms[] = $part;
			}
		}

		return array_values( array_unique( array_filter( $terms ) ) );
	}

	/**
	 * @param array<int,string> $match_terms
	 */
	public static function terms_hit_slug_or_path( array $item, array $match_terms ): bool {
		if ( empty( $match_terms ) ) {
			return false;
		}
		$slug_lower  = self::item_slug_lower( $item );
		$url_path    = self::item_url_path_lower( $item );
		$path_hyphen = self::item_url_path_hyphen_lower( $item );
		foreach ( $match_terms as $term ) {
			if ( $slug_lower !== '' && strpos( $slug_lower, $term ) !== false ) {
				return true;
			}
			if ( $url_path !== '' && strpos( $url_path, $term ) !== false ) {
				return true;
			}
			if ( $path_hyphen !== '' && strpos( $path_hyphen, $term ) !== false ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array<int,string> $match_terms
	 */
	public static function count_match_term_slug_path_hits( array $item, array $match_terms ): int {
		if ( empty( $match_terms ) ) {
			return 0;
		}
		$slug_lower  = self::item_slug_lower( $item );
		$url_path    = self::item_url_path_lower( $item );
		$path_hyphen = self::item_url_path_hyphen_lower( $item );
		$hits        = 0;
		foreach ( $match_terms as $term ) {
			$matched = ( $slug_lower !== '' && strpos( $slug_lower, $term ) !== false )
				|| ( $url_path !== '' && strpos( $url_path, $term ) !== false )
				|| ( $path_hyphen !== '' && strpos( $path_hyphen, $term ) !== false );
			if ( $matched ) {
				++$hits;
			}
		}
		return $hits;
	}

	/**
	 * Score a single index item against the extracted terms.
	 * Title 3x, excerpt 2x, slug/URL path 2x, focus keyword 2x, categories/tags 1x.
	 */
	private static function score_item( array $item, array $terms ): float {
		$score         = 0.0;
		$title_lower   = strtolower( (string) ( $item['title'] ?? '' ) );
		$excerpt_lower = strtolower( (string) ( $item['excerpt'] ?? '' ) );
		$cats_lower    = strtolower( implode( ' ', $item['categories'] ?? array() ) );
		$tags_lower    = strtolower( implode( ' ', $item['tags'] ?? array() ) );
		$slug_lower    = strtolower( (string) ( $item['slug'] ?? '' ) );
		$url_path      = '';
		if ( ! empty( $item['url'] ) ) {
			$parsed = wp_parse_url( (string) $item['url'], PHP_URL_PATH );
			if ( is_string( $parsed ) && $parsed !== '' ) {
				$url_path = strtolower( str_replace( '-', ' ', $parsed ) );
			}
		}
		$focus_lower = strtolower( (string) ( $item['focus_keyword'] ?? '' ) );

		foreach ( $terms as $term ) {
			if ( $title_lower !== '' && strpos( $title_lower, $term ) !== false ) {
				$score += 3.0;
			}
			if ( $excerpt_lower !== '' && strpos( $excerpt_lower, $term ) !== false ) {
				$score += 2.0;
			}
			if ( $slug_lower !== '' && strpos( $slug_lower, $term ) !== false ) {
				$score += 2.0;
			}
			if ( $url_path !== '' && strpos( $url_path, $term ) !== false ) {
				$score += 2.0;
			}
			if ( $focus_lower !== '' && strpos( $focus_lower, $term ) !== false ) {
				$score += 2.0;
			}
			if ( $cats_lower !== '' && strpos( $cats_lower, $term ) !== false ) {
				$score += 1.0;
			}
			if ( $tags_lower !== '' && strpos( $tags_lower, $term ) !== false ) {
				$score += 1.0;
			}
		}

		return $score;
	}

	/**
	 * Invalidate the cached index (call on post save, training save, etc.).
	 */
	public static function invalidate_cache(): void {
		delete_transient( self::CACHE_KEY );
		delete_transient( self::AGENT_INDEX_CACHE_KEY );
		delete_transient( self::AGENT_INDEX_CACHE_KEY . '_drafts' );
		Neo_Pulse_Wp_Chat_Starters::invalidate_cache();
		Neo_Pulse_Wp_Chat_Lead::invalidate_widget_contact_cache();
	}

	/**
	 * Site index for MCP/agents: published + optional drafts, with SEO fields.
	 *
	 * @param bool $include_drafts Include non-publish statuses.
	 * @return array<int, array<string, mixed>>
	 */
	public static function get_agent_site_index( bool $include_drafts = false ): array {
		$cache_key = self::AGENT_INDEX_CACHE_KEY . ( $include_drafts ? '_drafts' : '' );
		$cached    = get_transient( $cache_key );
		if ( is_array( $cached ) && ! empty( $cached ) ) {
			return $cached;
		}

		$statuses = $include_drafts
			? array( 'publish', 'draft', 'pending', 'future', 'private' )
			: array( 'publish' );

		$post_types = apply_filters( 'neo_pulse_wp_agent_index_post_types', array( 'post', 'page' ) );
		$index      = array();

		foreach ( $post_types as $pt ) {
			if ( ! post_type_exists( $pt ) ) {
				continue;
			}
			$page = 1;
			do {
				$items = get_posts(
					array(
						'post_type'      => $pt,
						'post_status'    => $statuses,
						'posts_per_page' => 100,
						'paged'          => $page,
						'orderby'        => 'modified',
						'order'          => 'DESC',
					)
				);
				foreach ( $items as $post ) {
					$focus = Neo_Pulse_Wp_Ai_Context::read_focus_keyword( $post->ID );
					$research = Neo_Pulse_Wp_Ai_Context::read_field_value( $post->ID, 'seo_research' );
					$index[] = array(
						'id'             => $post->ID,
						'title'          => get_the_title( $post ),
						'url'            => get_permalink( $post ),
						'excerpt'        => (string) $post->post_password !== ''
							? ''
							: ( has_excerpt( $post->ID )
								? wp_strip_all_tags( get_the_excerpt( $post ) )
								: wp_trim_words( wp_strip_all_tags( $post->post_content ), 40, '...' ) ),
						'type'           => $pt,
						'status'         => $post->post_status,
						'focus_keyword'  => $focus,
						'has_seo_research' => $research !== '',
						'modified'       => $post->post_modified_gmt,
					);
				}
				$page++;
			} while ( count( $items ) === 100 );
		}

		if ( ! empty( $index ) ) {
			set_transient( $cache_key, $index, self::CACHE_TTL );
		}

		return $index;
	}

	/**
	 * Search agent site index (same scoring as visitor RAG).
	 *
	 * @param string $query Query.
	 * @param int    $limit Max results.
	 * @return array<int, array<string, mixed>>
	 */
	public static function retrieve_agent( string $query, int $limit = self::MAX_RESULTS ): array {
		$index = self::get_agent_site_index( false );
		if ( empty( $index ) ) {
			return array();
		}

		$terms = self::extract_terms( $query );
		if ( empty( $terms ) ) {
			return array_slice( $index, 0, $limit );
		}

		$scored = array();
		foreach ( $index as $item ) {
			$score = self::score_item( $item, $terms );
			if ( $score > 0 ) {
				$item['score'] = $score;
				$scored[]      = $item;
			}
		}

		usort(
			$scored,
			function ( $a, $b ) {
				return ( $b['score'] ?? 0 ) <=> ( $a['score'] ?? 0 );
			}
		);

		return array_slice( $scored, 0, $limit );
	}
}
