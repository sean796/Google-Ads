<?php
/**
 * Search query building, WP_Query lookup, and AI query analysis.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Search_Trait_Query_Ai {

	// ── Build search queries from AI analysis ────────────────────

	/**
	 * Build multiple search queries: the AI keywords first, then the original.
	 *
	 * @param string $original_query
	 * @param array{intent:string,keywords:array<string>,sentiment:string} $ai
	 * @return array<int,string>
	 */
	private static function build_search_queries( string $original_query, array $ai ): array {
		$queries  = array();
		$keywords = isset( $ai['keywords'] ) ? $ai['keywords'] : array();

		if ( ! empty( $keywords ) ) {
			$queries[] = implode( ' ', $keywords );
		}

		$queries[] = $original_query;

		foreach ( $keywords as $kw ) {
			$kw = trim( $kw );
			if ( $kw !== '' && stripos( $original_query, $kw ) === false ) {
				$queries[] = $kw;
			}
		}

		return array_unique( $queries );
	}

	// ── WP_Query search ──────────────────────────────────────────

	/**
	 * @param string        $query
	 * @param int           $limit
	 * @param array<string> $post_types
	 * @return array<int,array<string,mixed>>
	 */
	private static function wp_query_search( string $query, int $limit, array $post_types ): array {
		$args = array(
			's'              => $query,
			'post_type'      => $post_types,
			'post_status'    => 'publish',
			'posts_per_page' => $limit,
			'orderby'        => 'relevance',
			'order'          => 'DESC',
			'no_found_rows'  => true,
		);

		$wp_query = new WP_Query( $args );
		$results  = array();
		$position = 0;

		$indexable_only = ! empty( self::get_search_settings()['indexable_only'] )
			&& class_exists( 'Neo_Pulse_Wp_Seo_Head' )
			&& method_exists( 'Neo_Pulse_Wp_Seo_Head', 'is_indexable_post' );

		foreach ( $wp_query->posts as $post ) {
			// Thank-you pages, noindex pages and pages that redirect or point their canonical elsewhere
			// aren't meant to be landed on, so search leaves them out.
			if ( $indexable_only && ! Neo_Pulse_Wp_Seo_Head::is_indexable_post( $post ) ) {
				continue;
			}
			++$position;
			$results[] = array(
				'id'         => $post->ID,
				'title'      => html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' ),
				'url'        => get_permalink( $post ),
				'slug'       => $post->post_name,
				// Password-protected posts never expose their text in results.
				'excerpt'    => (string) $post->post_password !== ''
					? ''
					: html_entity_decode( wp_trim_words( $post->post_excerpt !== '' ? $post->post_excerpt : $post->post_content, 30, '…' ), ENT_QUOTES, 'UTF-8' ),
				'type'       => $post->post_type,
				'type_label' => self::content_type_label( $post->post_type ),
				'thumb'      => (string) get_the_post_thumbnail_url( $post, 'thumbnail' ),
				'base_rank'  => $position,
			);
		}

		return $results;
	}

	// ── OpenRouter sentiment / intent ────────────────────────────

	/**
	 * AI intent and keywords for a search. A cached answer is always used. A new AI call needs
	 * $allow_ai, a free slot in today's site-wide cap and the visitor's daily allowance; otherwise
	 * the plain (no-AI) analysis is returned and the search still runs.
	 *
	 * @param string $query
	 * @param bool   $allow_ai Licensed site with an AI key.
	 * @return array{intent:string,keywords:array<string>,sentiment:string}
	 */
	private static function openrouter_analyze( string $query, bool $allow_ai = true ): array {
		$fallback = array(
			'intent'    => 'informational',
			'keywords'  => array_filter( explode( ' ', strtolower( $query ) ) ),
			'sentiment' => 'neutral',
		);

		if ( Neo_Pulse_Wp_OpenRouter::get_api_key() === '' ) {
			return $fallback;
		}

		$cache_key = 'neo_pulse_srch_ai_' . md5( Neo_Pulse_Wp_Search_Logs::normalize_query( $query ) . '|' . self::get_openrouter_model() );
		$cached    = get_transient( $cache_key );
		if ( is_array( $cached ) && isset( $cached['intent'], $cached['keywords'], $cached['sentiment'] ) ) {
			return $cached;
		}

		if ( ! $allow_ai ) {
			return $fallback;
		}
		// Per-visitor daily allowance first (it doesn't use a site slot), then the site-wide cap.
		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'search_day', self::RATE_LIMIT_DAY_MAX, DAY_IN_SECONDS ) ) {
			return $fallback;
		}
		if ( ! self::take_daily_ai_slot() ) {
			return $fallback;
		}

		$system = 'You are a WordPress site search assistant. Given a user search query, respond with ONLY valid JSON (no markdown, no explanation): {"intent":"informational|navigational|transactional","keywords":["keyword1","keyword2"],"sentiment":"positive|neutral|negative"}. Rules for keywords: extract 2-4 terms that should be used to FIND the right WordPress content. Prefer terms that match static PAGES and service/location URLs (contact, services, service-area city names), not blog post topics, unless the user clearly wants articles. For navigational queries like "contact page", keywords should be the page name (e.g. ["contact"]). For location queries, include city or "service area" terms. Think: page TITLE, SLUG, or URL path segment.';

		$result = Neo_Pulse_Wp_OpenRouter::complete( $system, $query, 150, 0.1, self::get_openrouter_model() );

		if ( is_wp_error( $result ) ) {
			return $fallback;
		}

		$text = trim( (string) $result );
		if ( strpos( $text, '```' ) !== false ) {
			$text = preg_replace( '/```(?:json)?\s*/i', '', $text );
			$text = preg_replace( '/```/', '', $text );
			$text = trim( $text );
		}

		$parsed = json_decode( $text, true );
		if ( ! is_array( $parsed ) ) {
			return $fallback;
		}

		$analysis = array(
			'intent'    => isset( $parsed['intent'] ) && is_string( $parsed['intent'] ) ? $parsed['intent'] : $fallback['intent'],
			'keywords'  => isset( $parsed['keywords'] ) && is_array( $parsed['keywords'] ) ? array_map( 'strval', $parsed['keywords'] ) : $fallback['keywords'],
			'sentiment' => isset( $parsed['sentiment'] ) && is_string( $parsed['sentiment'] ) ? $parsed['sentiment'] : $fallback['sentiment'],
		);
		set_transient( $cache_key, $analysis, self::AI_CACHE_TTL );

		return $analysis;
	}
}
