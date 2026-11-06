<?php
/**
 * Search result ranking and match scoring.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Search_Trait_Ranking {

	// ── Ranking ──────────────────────────────────────────────────

	/**
	 * Boost pages and service-area URLs over blog posts (filterable).
	 *
	 * @param array<string,mixed> $item Result row with type, slug, url.
	 * @return int
	 */
	private static function content_priority_boost( array $item ): int {
		$type = isset( $item['type'] ) ? (string) $item['type'] : '';
		$slug = isset( $item['slug'] ) ? strtolower( (string) $item['slug'] ) : '';

		// The order set in Search → General: the top level gets +45, the bottom -18, levels in
		// between are spread evenly (the same range the fixed page/post bonuses used before).
		$levels = self::priority_levels();
		$level  = self::priority_level( $type );
		$count  = count( $levels );
		$boost  = $count > 1 ? (int) round( 45 - ( 63 * $level / ( $count - 1 ) ) ) : 0;

		if ( $type === 'page' && self::is_money_page_slug( $slug ) ) {
			$boost += 25;
		}

		/**
		 * Adjust content-type priority boost for a search result.
		 *
		 * @param int                 $boost Points added to relevance score.
		 * @param array<string,mixed> $item  Result row.
		 */
		return (int) apply_filters( 'neo_pulse_wp_search_content_boost', $boost, $item );
	}

	/**
	 * Default place in the result order for a content type: pages first, blog posts last.
	 */
	private static function type_priority_default( string $type ): int {
		if ( 'page' === $type ) {
			return 1;
		}
		return 'post' === $type ? 9 : 5;
	}

	/**
	 * Place in the result order (1 first … 9 last) for a content type.
	 */
	public static function type_priority( string $type ): int {
		$set = self::get_search_settings()['type_priority'] ?? array();
		return is_array( $set ) && isset( $set[ $type ] ) ? (int) $set[ $type ] : self::type_priority_default( $type );
	}

	/**
	 * The distinct priority numbers used by the searched content types, best first.
	 *
	 * @return array<int,int>
	 */
	private static function priority_levels(): array {
		static $levels = null;
		if ( null === $levels ) {
			$levels = array();
			foreach ( (array) self::get_search_settings()['post_types'] as $type ) {
				$levels[] = self::type_priority( (string) $type );
			}
			$levels = array_values( array_unique( $levels ) );
			sort( $levels );
		}
		return $levels;
	}

	/**
	 * 0 for the best level, 1 for the next, and so on.
	 */
	private static function priority_level( string $type ): int {
		$index = array_search( self::type_priority( $type ), self::priority_levels(), true );
		return false === $index ? max( 0, count( self::priority_levels() ) - 1 ) : (int) $index;
	}

	/**
	 * @param string $slug Post slug.
	 */
	private static function is_money_page_slug( string $slug ): bool {
		if ( $slug === '' ) {
			return false;
		}

		$money_slugs = apply_filters(
			'neo_pulse_wp_search_money_page_slugs',
			array(
				'contact',
				'about',
				'about-us',
				'services',
				'our-services',
				'service',
				'pricing',
				'quote',
				'get-started',
				'locations',
				'team',
				'careers',
				'work-with-us',
				'portfolio',
				'our-work',
			)
		);

		foreach ( $money_slugs as $needle ) {
			$needle = strtolower( (string) $needle );
			if ( $needle === '' ) {
				continue;
			}
			if ( $slug === $needle || strpos( $slug, $needle ) !== false ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * @param string $url  Permalink.
	 * @param string $slug Post slug.
	 */
	private static function is_service_area_url( string $url, string $slug ): bool {
		if ( strpos( $url, '/service-area/' ) !== false || strpos( $url, '/service-areas/' ) !== false ) {
			return true;
		}
		if ( strpos( $slug, 'service-area' ) !== false || strpos( $slug, 'service_area' ) !== false ) {
			return true;
		}
		return false;
	}

	/**
	 * @param array<int,array<string,mixed>> $wp_results
	 * @param array{intent:string,keywords:array<string>,sentiment:string} $ai
	 * @param int    $limit
	 * @param string $query What the visitor typed (for the match percentage).
	 * @return array<int,array<string,mixed>>
	 */
	private static function rank_results( array $wp_results, array $ai, int $limit, string $query = '' ): array {
		if ( empty( $wp_results ) ) {
			return array();
		}

		$keywords = array_map( 'strtolower', $ai['keywords'] );
		$intent   = $ai['intent'];
		$terms    = self::match_terms( $query !== '' ? $query : implode( ' ', $keywords ) );

		foreach ( $wp_results as &$item ) {
			$score       = max( 0, 100 - ( (int) $item['base_rank'] * 3 ) );
			$title_lower = strtolower( (string) $item['title'] );
			$url_lower   = isset( $item['url'] ) ? strtolower( (string) $item['url'] ) : '';
			$slug_lower  = isset( $item['slug'] ) ? strtolower( (string) $item['slug'] ) : '';
			$haystack    = $title_lower . ' ' . strtolower( (string) $item['excerpt'] ) . ' ' . $slug_lower;

			$score += self::content_priority_boost( $item );

			foreach ( $keywords as $kw ) {
				if ( $kw === '' ) {
					continue;
				}
				if ( stripos( $title_lower, $kw ) !== false ) {
					$score += 40;
				}
				if ( stripos( $haystack, $kw ) !== false ) {
					$score += 15;
				}
				if ( stripos( $url_lower, $kw ) !== false ) {
					$score += 20;
				}
			}

			if ( $intent === 'navigational' ) {
				if ( $item['type'] === 'page' || self::is_service_area_url( $url_lower, $slug_lower ) ) {
					$score += 25;
				}
				if ( $item['type'] === 'post' ) {
					$score -= 12;
				}
				foreach ( $keywords as $kw ) {
					if ( $kw !== '' && stripos( $title_lower, $kw ) !== false ) {
						$score += 30;
					}
				}
			}

			if ( $intent === 'transactional' ) {
				if ( $item['type'] === 'page' || self::is_service_area_url( $url_lower, $slug_lower ) ) {
					$score += 22;
				}
				if ( in_array( $item['type'], array( 'product', 'download' ), true ) ) {
					$score += 25;
				}
				if ( $item['type'] === 'post' ) {
					$score -= 10;
				}
			}

			if ( $intent === 'informational' && $item['type'] === 'post' ) {
				$score += 8;
			}

			// How closely the result matches what was typed (0-100), shown as "95% match".
			// It also counts towards the ranking, so better matches sit higher.
			$item['match'] = self::match_percent( $terms, $title_lower, $slug_lower . ' ' . $url_lower, strtolower( (string) $item['excerpt'] ) );
			$item['score'] = $score + $item['match'];
			unset( $item['base_rank'] );
		}
		unset( $item );

		$strict = 'strict' === ( self::get_search_settings()['priority_mode'] ?? 'balanced' );
		usort( $wp_results, static function ( $a, $b ) use ( $strict ) {
			if ( $strict ) {
				$by_type = self::priority_level( (string) $a['type'] ) - self::priority_level( (string) $b['type'] );
				if ( 0 !== $by_type ) {
					return $by_type;
				}
			}
			return (int) $b['score'] - (int) $a['score'];
		} );

		$wp_results = array_slice( $wp_results, 0, $limit );

		// Keep the percentages in step with the order: a lower result never shows a higher match.
		$ceiling = 100;
		foreach ( $wp_results as &$item ) {
			$item['match'] = min( $ceiling, (int) $item['match'] );
			$ceiling       = $item['match'];
		}
		unset( $item );

		return $wp_results;
	}

	/**
	 * Words in the search that carry meaning (lowercase, no filler words, no repeats).
	 *
	 * @return array<int,string>
	 */
	private static function match_terms( string $query ): array {
		static $filler = array(
			'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for', 'from', 'get', 'how', 'i',
			'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'our', 'the', 'to', 'we', 'what', 'where', 'which', 'who',
			'why', 'with', 'you', 'your',
		);
		$query = function_exists( 'mb_strtolower' ) ? mb_strtolower( $query ) : strtolower( $query );
		$words = preg_split( '/[^\p{L}\p{N}]+/u', $query, -1, PREG_SPLIT_NO_EMPTY );
		$terms = array();
		foreach ( (array) $words as $word ) {
			if ( ( strlen( $word ) < 2 && ! ctype_digit( $word ) ) || in_array( $word, $filler, true ) ) {
				continue;
			}
			$terms[ $word ] = true;
		}
		if ( empty( $terms ) ) {
			foreach ( (array) $words as $word ) {
				$terms[ $word ] = true;
			}
		}
		return array_keys( $terms );
	}

	/**
	 * Match percentage for one result: each search word scores by where it appears (title best, then
	 * the address, then the description; a shared word stem counts for less), averaged over the words.
	 * Every result returned matched the search somehow, so the floor is 20%.
	 *
	 * @param array<int,string> $terms
	 */
	private static function match_percent( array $terms, string $title, string $address, string $excerpt ): int {
		if ( empty( $terms ) ) {
			return 0;
		}
		$total = 0.0;
		foreach ( $terms as $term ) {
			$stem = self::match_stem( $term );
			if ( self::has_word( $title, $term ) ) {
				$weight = 1.0;
			} elseif ( self::has_word( $address, $term ) ) {
				$weight = 0.85;
			} elseif ( self::has_word( $excerpt, $term ) ) {
				$weight = 0.7;
			} elseif ( $stem !== '' && strpos( $title, $stem ) !== false ) {
				$weight = 0.6;
			} elseif ( $stem !== '' && ( strpos( $address, $stem ) !== false || strpos( $excerpt, $stem ) !== false ) ) {
				$weight = 0.4;
			} else {
				$weight = 0.0;
			}
			$total += $weight;
		}
		$coverage = $total / count( $terms );
		return (int) round( 20 + 80 * $coverage );
	}

	/**
	 * Whole-word (or word-start) match, so "blind" counts in "blinds" but "art" doesn't count in "start".
	 */
	private static function has_word( string $text, string $term ): bool {
		return $text !== '' && (bool) preg_match( '/(?<![\p{L}\p{N}])' . preg_quote( $term, '/' ) . '/u', $text );
	}

	/**
	 * Rough word stem ("motorized" → "motoriz", "blinds" → "blind") for partial credit.
	 */
	private static function match_stem( string $term ): string {
		if ( strlen( $term ) < 5 ) {
			return '';
		}
		$stem = preg_replace( '/(ing|ed|es|s|er|ers|ly)$/', '', $term );
		return strlen( (string) $stem ) >= 4 ? (string) $stem : '';
	}
}
