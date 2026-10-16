<?php
/**
 * The final "Popular searches" list: pinned searches first, then the most popular searches
 * (weekly running totals), minus any hidden searches.
 *
 * Pinned and hidden searches are set per site under NEO Pulse → Search → Popular searches.
 * When nothing is pinned and the site has no search data yet, the AI suggests a couple of
 * pinned searches from the site's own content so the section isn't empty on a new site.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

final class Neo_Pulse_Wp_Search_Popular {

	const OPTION_AI_PINS = 'neo_pulse_search_ai_pins';
	const AI_PINS_TTL    = WEEK_IN_SECONDS;
	const MAX_PINNED     = 12;
	const MAX_HIDDEN     = 200;

	/**
	 * @return array<int, array{query: string, count: int, pinned?: bool}>
	 */
	public static function terms( int $days, int $limit, bool $with_pinned = true ): array {
		$limit  = max( 1, min( 12, $limit ) );
		$hidden = self::hidden();

		$out  = array();
		$seen = array();
		if ( $with_pinned ) {
			foreach ( self::pinned() as $term ) {
				$key = Neo_Pulse_Wp_Search_Logs::normalize_query( $term );
				if ( $key === '' || isset( $seen[ $key ] ) ) {
					continue;
				}
				$seen[ $key ] = true;
				$out[]        = array( 'query' => $term, 'count' => 0, 'pinned' => true );
			}
		}

		foreach ( Neo_Pulse_Wp_Search_Logs::aggregate_popular_terms_curated( $days, min( 20, $limit + count( $out ) + 4 ) ) as $row ) {
			if ( count( $out ) >= $limit ) {
				break;
			}
			$query = (string) $row['query'];
			$key   = Neo_Pulse_Wp_Search_Logs::normalize_query( $query );
			if ( $key === '' || isset( $seen[ $key ] ) || self::is_hidden( $key, $hidden ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$out[]        = array( 'query' => $query, 'count' => (int) $row['count'] );
		}

		return array_slice( $out, 0, $limit );
	}

	/**
	 * Pinned searches: the site's own list, or (only when that's empty and there's no search data
	 * yet) a couple suggested by the AI.
	 *
	 * @return array<int,string>
	 */
	public static function pinned(): array {
		$own = self::list_setting( 'pinned_terms' );
		if ( $own !== array() ) {
			return $own;
		}
		return self::has_search_data() ? array() : self::ai_pins();
	}

	/**
	 * @return array<int,string> Normalised hidden phrases.
	 */
	public static function hidden(): array {
		return array_values( array_filter( array_map( array( 'Neo_Pulse_Wp_Search_Logs', 'normalize_query' ), self::list_setting( 'hidden_terms' ) ) ) );
	}

	/**
	 * A search is hidden when it contains a hidden phrase as whole words, so hiding "acme" also hides
	 * "acme blinds" but not "acmeville".
	 *
	 * @param array<int,string> $hidden
	 */
	public static function is_hidden( string $normalized, array $hidden ): bool {
		foreach ( $hidden as $phrase ) {
			if ( $phrase !== '' && preg_match( '/(?<![\p{L}\p{N}])' . preg_quote( $phrase, '/' ) . '(?![\p{L}\p{N}])/u', $normalized ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @return array<int,string>
	 */
	private static function list_setting( string $key ): array {
		$settings = Neo_Pulse_Wp_Search::get_search_settings();
		return isset( $settings[ $key ] ) && is_array( $settings[ $key ] ) ? array_values( array_map( 'strval', $settings[ $key ] ) ) : array();
	}

	/**
	 * Clean a pinned or hidden list from the admin form (one per line) or an array.
	 *
	 * @param mixed $value
	 * @return array<int,string>
	 */
	public static function sanitize_list( $value, int $max ): array {
		$lines = is_array( $value ) ? $value : preg_split( '/\r\n|\r|\n|,/', (string) $value );
		$out   = array();
		$seen  = array();
		foreach ( (array) $lines as $line ) {
			$line = trim( preg_replace( '/\s+/', ' ', sanitize_text_field( (string) $line ) ) );
			if ( $line === '' ) {
				continue;
			}
			$line = function_exists( 'mb_substr' ) ? mb_substr( $line, 0, 80 ) : substr( $line, 0, 80 );
			$key  = Neo_Pulse_Wp_Search_Logs::normalize_query( $line );
			if ( isset( $seen[ $key ] ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$out[]        = $line;
			if ( count( $out ) >= $max ) {
				break;
			}
		}
		return $out;
	}

	/**
	 * Whether visitors have made any searches that found something (stored weeks or recent log).
	 */
	public static function has_search_data(): bool {
		if ( class_exists( 'Neo_Pulse_Wp_Search_Weekly' ) && Neo_Pulse_Wp_Search_Weekly::running_totals() !== array() ) {
			return true;
		}
		return Neo_Pulse_Wp_Search_Logs::widget_term_candidates( 90, 1 ) !== array();
	}

	/**
	 * AI-suggested pinned searches, generated from the site's content and kept for a week.
	 *
	 * @return array<int,string>
	 */
	public static function ai_pins(): array {
		if ( Neo_Pulse_Wp_License::ai_needs_upgrade( false ) ) {
			return array(); // NEO Pulse Pro: no AI suggestions (kept for an upgrade).
		}
		$stored = get_option( self::OPTION_AI_PINS );
		if ( is_array( $stored ) && isset( $stored['terms'], $stored['built'] ) && ( time() - (int) $stored['built'] ) < self::AI_PINS_TTL ) {
			return (array) $stored['terms'];
		}
		// One attempt at a time, and at most one an hour when the AI is unavailable.
		if ( get_transient( 'neo_pulse_search_ai_pins_lock' ) ) {
			return is_array( $stored ) && isset( $stored['terms'] ) ? (array) $stored['terms'] : array();
		}
		set_transient( 'neo_pulse_search_ai_pins_lock', 1, HOUR_IN_SECONDS );

		$terms = self::generate_ai_pins();
		if ( $terms === null ) {
			return is_array( $stored ) && isset( $stored['terms'] ) ? (array) $stored['terms'] : array();
		}
		update_option( self::OPTION_AI_PINS, array( 'built' => time(), 'terms' => $terms ), false );
		delete_transient( 'neo_pulse_search_ai_pins_lock' );
		return $terms;
	}

	/**
	 * @return array<int,string>|null Null when the AI couldn't be reached.
	 */
	private static function generate_ai_pins(): ?array {
		if ( ! class_exists( 'Neo_Pulse_Wp_OpenRouter' ) || Neo_Pulse_Wp_OpenRouter::get_api_key() === '' ) {
			return null;
		}

		$titles = array();
		$posts  = get_posts(
			array(
				'post_type'      => 'page',
				'post_status'    => 'publish',
				'posts_per_page' => 40,
				'orderby'        => 'menu_order modified',
				'order'          => 'ASC',
				'no_found_rows'  => true,
			)
		);
		foreach ( $posts as $post ) {
			$title = trim( wp_strip_all_tags( get_the_title( $post ) ) );
			if ( $title !== '' ) {
				$titles[] = $title;
			}
		}
		$keywords = array();
		foreach ( Neo_Pulse_Wp_Search_Logs::aggregate_popular_terms_from_sitemap( 15 ) as $row ) {
			$keywords[] = (string) $row['query'];
		}

		$system = 'You suggest the "Popular searches" shown in a website\'s search box before anyone has searched. Respond with ONLY valid JSON (no markdown): {"terms":["...","..."]}. Give 3 short searches (2 to 4 words each) that a customer of this business is most likely to want, such as a main service, pricing or booking a consultation. Each must be clearly covered by the pages listed. Use sentence case: capitalise the first word and brand names only. No punctuation, no questions, no business name on its own.';
		$user   = 'Business: ' . get_bloginfo( 'name' ) . ' — ' . get_bloginfo( 'description' ) . "\nPages: " . implode( '; ', array_slice( $titles, 0, 40 ) )
			. ( $keywords !== array() ? "\nFocus keywords: " . implode( '; ', $keywords ) : '' );

		$result = Neo_Pulse_Wp_OpenRouter::complete( $system, $user, 200, 0.3, Neo_Pulse_Wp_Search::get_openrouter_model() );
		if ( is_wp_error( $result ) ) {
			return null;
		}
		$text = trim( (string) preg_replace( '/```(?:json)?/i', '', (string) $result ) );
		$data = json_decode( $text, true );
		if ( ! is_array( $data ) || ! isset( $data['terms'] ) || ! is_array( $data['terms'] ) ) {
			return null;
		}
		$terms = array();
		foreach ( self::sanitize_list( $data['terms'], 3 ) as $term ) {
			$term = trim( $term, " \t.?!" );
			if ( $term !== '' && str_word_count( $term ) <= 6 ) {
				// Keep the AI's casing (it knows brand names); just make sure it starts with a capital.
				$first   = function_exists( 'mb_substr' ) ? mb_substr( $term, 0, 1 ) : substr( $term, 0, 1 );
				$rest    = function_exists( 'mb_substr' ) ? mb_substr( $term, 1 ) : substr( $term, 1 );
				$terms[] = ( function_exists( 'mb_strtoupper' ) ? mb_strtoupper( $first ) : strtoupper( $first ) ) . $rest;
			}
		}
		return array_slice( $terms, 0, 3 );
	}
}
