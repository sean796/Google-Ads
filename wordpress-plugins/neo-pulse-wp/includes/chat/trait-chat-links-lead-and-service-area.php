<?php
/**
 * Chat lead actions and service area link helpers.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Links_Trait_Lead_And_Service_Area {

	/**
	 * Keep only links whose URL exists in the filtered site index (+ optional retrieved items).
	 *
	 * @param array<int,array<string,mixed>>           $links
	 * @param array<int,array<string,mixed>>           $site_index
	 * @param array<int,array<string,mixed>>           $extra_items Additional allowlisted index rows (e.g. sitemap blog posts).
	 * @return array<int,array<string,mixed>>
	 */
	public static function filter_links_to_index( array $links, array $site_index, array $extra_items = array() ): array {
		if ( empty( $links ) || ( empty( $site_index ) && empty( $extra_items ) ) ) {
			return $links;
		}

		$allowed = array();
		foreach ( array_merge( $extra_items, $site_index ) as $item ) {
			if ( empty( $item['url'] ) ) {
				continue;
			}
			$allowed[ strtolower( rtrim( (string) $item['url'], '/' ) ) ] = true;
		}

		if ( empty( $allowed ) ) {
			return array();
		}

		$out = array();
		foreach ( $links as $link ) {
			$url = isset( $link['url'] ) ? (string) $link['url'] : '';
			if ( $url === '' ) {
				continue;
			}
			$norm = strtolower( rtrim( $url, '/' ) );
			if ( isset( $allowed[ $norm ] ) ) {
				$out[] = $link;
			}
		}

		return $out;
	}

	/**
	 * Whether an index row is a service-area / location page.
	 *
	 * @param array<string,mixed> $item
	 */
	public static function is_service_area_item( array $item ): bool {
		if ( isset( $item['type'] ) && (string) $item['type'] === 'service-area' ) {
			return true;
		}
		$url = isset( $item['url'] ) ? strtolower( (string) $item['url'] ) : '';
		if ( $url === '' ) {
			return false;
		}
		return str_contains( $url, '/service-area/' ) || str_contains( $url, '/service-areas/' );
	}

	/**
	 * Service-area pages from the chat site index.
	 *
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<int,array<string,mixed>>
	 */
	public static function service_area_items( array $site_index ): array {
		return array_values(
			array_filter(
				$site_index,
				static function ( $item ) {
					return is_array( $item ) && self::is_service_area_item( $item );
				}
			)
		);
	}

	/**
	 * Whether the visitor is asking if the business services a city/area.
	 */
	public static function is_service_coverage_query( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}

		$patterns = array(
			'/\b(do you|can you|will you|are you)\s+(service|serve|cover|deliver to|deliver in|install in|come to|travel to|work in|operate in|go to)\b/',
			'/\b(service|delivery|install(?:ation)?)\s+(area|in|to|for|near)\b/',
			'/\b(coverage|servicing)\s+(in|for|near|around)\b/',
			'/\bavailable\s+in\b/',
			'/\boutside\s+(of\s+)?(your\s+)?(area|city|service)\b/',
			'/\bdo\s+you\s+(go|travel)\b/',
		);
		foreach ( $patterns as $pattern ) {
			if ( preg_match( $pattern, $lower ) ) {
				return true;
			}
		}

		$term_set = array_flip( Neo_Pulse_Wp_Chat_Rag::extract_terms( $message ) );
		foreach ( array( 'service', 'serve', 'servicing', 'coverage', 'deliver', 'delivery', 'travel' ) as $term ) {
			if ( isset( $term_set[ $term ] ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Best matching indexed service-area page for the location in the message.
	 *
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<string,mixed>|null
	 */
	public static function find_listed_service_area( string $message, array $site_index ): ?array {
		$areas = self::service_area_items( $site_index );
		if ( empty( $areas ) ) {
			return null;
		}

		$matches = Neo_Pulse_Wp_Chat_Rag::find_fuzzy_topic_pages( $message, $areas, 1 );
		if ( empty( $matches[0] ) || ! is_array( $matches[0] ) ) {
			return null;
		}

		$score = (float) ( $matches[0]['fuzzy_score'] ?? 0 );
		if ( $score < Neo_Pulse_Wp_Chat_Rag::FUZZY_MIN_SCORE ) {
			return null;
		}

		return $matches[0];
	}

	/**
	 * Service-coverage question for a location with no matching service-area page.
	 *
	 * @param array<int,array<string,mixed>> $site_index
	 */
	public static function is_unlisted_service_area_query( string $message, array $site_index ): bool {
		if ( ! self::is_service_coverage_query( $message ) ) {
			return false;
		}
		return null === self::find_listed_service_area( $message, $site_index );
	}

	/**
	 * Resolve lead action including unlisted service-area coverage queries.
	 *
	 * @param array<int,array<string,mixed>> $site_index
	 * @return string|null booking|contact|pricing
	 */
	public static function resolve_lead_action( string $message, array $site_index = array() ): ?string {
		$action = self::detect_lead_action( $message );
		if ( null !== $action ) {
			return $action;
		}
		if ( ! empty( $site_index ) && self::is_unlisted_service_area_query( $message, $site_index ) ) {
			return 'contact';
		}
		return null;
	}

	/**
	 * Whether the visitor is asking the chat assistant to call them.
	 */
	public static function is_callback_request( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}

		$patterns = array(
			'/\b(call me|call us back|callback|call back|phone me|ring me|give me a call)\b/',
			'/\bplease call\b/',
			'/\bcall (?:me|my|us)\b/',
		);
		foreach ( $patterns as $pattern ) {
			if ( preg_match( $pattern, $lower ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Detect high-intent lead actions from the user message.
	 *
	 * @return string|null booking|contact|pricing
	 */
	public static function detect_lead_action( string $message ): ?string {
		$terms    = Neo_Pulse_Wp_Chat_Rag::extract_terms( $message );
		$term_set = array_flip( $terms );

		$booking = array( 'book', 'booking', 'appointment', 'schedule', 'scheduling', 'consultation', 'consult', 'reserve' );
		foreach ( $booking as $t ) {
			if ( isset( $term_set[ $t ] ) ) {
				return 'booking';
			}
		}

		$contact = array( 'contact', 'call', 'phone', 'email', 'reach', 'directions', 'location', 'hours', 'human', 'person', 'someone', 'representative', 'staff', 'speak', 'owner', 'team', 'policy', 'privacy', 'refund', 'warranty' );
		foreach ( $contact as $t ) {
			if ( isset( $term_set[ $t ] ) ) {
				return 'contact';
			}
		}

		$pricing = array( 'price', 'pricing', 'cost', 'quote', 'estimate', 'rate', 'rates' );
		foreach ( $pricing as $t ) {
			if ( isset( $term_set[ $t ] ) ) {
				return 'pricing';
			}
		}

		return null;
	}

	/**
	 * Money-page slug list (shared with Site Search + chat lead routing).
	 *
	 * @return array<int,string>
	 */
	public static function money_page_slug_hints(): array {
		$base = array(
			'contact',
			'contact-us',
			'about',
			'about-us',
			'services',
			'our-services',
			'service',
			'pricing',
			'quote',
			'get-started',
			'locations',
			'consultation',
			'book',
			'appointment',
			'schedule',
		);

		$filtered = apply_filters( 'neo_pulse_wp_search_money_page_slugs', $base );
		return is_array( $filtered ) ? array_values( array_unique( array_map( 'strval', $filtered ) ) ) : $base;
	}

	/**
	 * Slug hints prioritized for a lead action type.
	 *
	 * @return array<int,string>
	 */
	private static function lead_action_slug_hints( string $action ): array {
		$map = array(
			'booking' => array( 'contact', 'contact-us', 'consultation', 'book', 'appointment', 'schedule', 'get-started' ),
			'contact' => array( 'contact', 'contact-us', 'about', 'about-us', 'locations' ),
			'pricing' => array( 'pricing', 'quote', 'get-started', 'services', 'our-services' ),
		);

		$hints = isset( $map[ $action ] ) ? $map[ $action ] : array();
		return array_values( array_unique( array_merge( $hints, self::money_page_slug_hints() ) ) );
	}

	/**
	 * Find indexed pages for a lead-intent message (contact, book, quote, etc.).
	 *
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<int,array<string,mixed>>
	 */
	public static function find_lead_pages( string $message, array $site_index, int $limit = 3 ): array {
		$action = self::resolve_lead_action( $message, $site_index );
		if ( null === $action || empty( $site_index ) || $limit < 1 ) {
			return array();
		}

		$hints  = self::lead_action_slug_hints( $action );
		$scored = array();

		foreach ( $site_index as $item ) {
			$score = self::score_lead_page_item( $item, $hints, $action );
			if ( $score <= 0 ) {
				continue;
			}
			$item['lead_score'] = $score;
			$scored[]           = $item;
		}

		if ( empty( $scored ) ) {
			return array();
		}

		usort(
			$scored,
			function ( $a, $b ) {
				return ( $b['lead_score'] ?? 0 ) <=> ( $a['lead_score'] ?? 0 );
			}
		);

		return array_slice( $scored, 0, $limit );
	}

	/**
	 * @param array<string,mixed> $item
	 */
	private static function score_lead_page_item( array $item, array $hints, string $action ): float {
		if ( empty( $item['url'] ) ) {
			return 0.0;
		}

		$slug  = strtolower( (string) ( $item['slug'] ?? '' ) );
		$title = strtolower( wp_strip_all_tags( (string) ( $item['title'] ?? '' ) ) );
		$path  = strtolower( (string) wp_parse_url( (string) $item['url'], PHP_URL_PATH ) );
		$score = 0.0;

		foreach ( $hints as $hint ) {
			$hint = strtolower( (string) $hint );
			if ( $hint === '' ) {
				continue;
			}
			if ( self::slug_matches_hint( $slug, $hint ) ) {
				$score += 20.0;
			}
			if ( self::path_contains_hint( $path, $hint ) ) {
				$score += 15.0;
			}
			$hint_words = str_replace( '-', ' ', $hint );
			if ( $title !== '' && strpos( $title, $hint_words ) !== false ) {
				$score += 12.0;
			}
		}

		if ( $score <= 0 ) {
			return 0.0;
		}

		if ( isset( $item['type'] ) && (string) $item['type'] === 'page' ) {
			$score += 8.0;
		}

		if ( $action === 'booking' && ( self::slug_matches_hint( $slug, 'contact' ) || self::slug_matches_hint( $slug, 'consult' ) || strpos( $slug, 'consult' ) !== false ) ) {
			$score += 10.0;
		}

		return $score;
	}

	private static function slug_matches_hint( string $slug, string $hint ): bool {
		$slug = strtolower( trim( $slug, '/' ) );
		$hint = strtolower( trim( $hint, '/' ) );
		if ( $slug === '' || $hint === '' ) {
			return false;
		}
		if ( $slug === $hint ) {
			return true;
		}
		if ( str_starts_with( $slug, $hint . '-' ) || str_ends_with( $slug, '-' . $hint ) || strpos( $slug, '-' . $hint . '-' ) !== false ) {
			return true;
		}
		return in_array( $hint, explode( '-', $slug ), true );
	}

	private static function path_contains_hint( string $path, string $hint ): bool {
		$path = strtolower( trim( (string) $path, '/' ) );
		$hint = strtolower( trim( $hint, '/' ) );
		if ( $path === '' || $hint === '' ) {
			return false;
		}
		foreach ( explode( '/', $path ) as $segment ) {
			if ( self::slug_matches_hint( $segment, $hint ) ) {
				return true;
			}
		}
		return false;
	}
}
