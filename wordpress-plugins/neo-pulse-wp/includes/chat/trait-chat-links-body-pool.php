<?php
/**
 * Chat body link pool helpers.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Links_Trait_Body_Pool {

	/**
	 * Remove inline markdown links, keeping visible label text.
	 */
	private static function strip_inline_markdown_links( string $body ): string {
		if ( $body === '' ) {
			return $body;
		}

		$stripped = preg_replace( '/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i', '$1', $body );
		return is_string( $stripped ) ? $stripped : $body;
	}

	/**
	 * Apply OpenRouter-resolved inline links (longest phrase first).
	 *
	 * @param array<int,array{phrase:string,url:string}> $links
	 */
	public static function apply_resolved_link_map( string $body, array $links ): string {
		if ( $body === '' || empty( $links ) ) {
			return $body;
		}

		usort(
			$links,
			function ( $a, $b ) use ( $body ) {
				$phrase_a = (string) ( $a['phrase'] ?? '' );
				$phrase_b = (string) ( $b['phrase'] ?? '' );
				$a_label  = self::phrase_matches_any_unlinked_list_label( $body, $phrase_a );
				$b_label  = self::phrase_matches_any_unlinked_list_label( $body, $phrase_b );
				if ( $a_label !== $b_label ) {
					return $b_label <=> $a_label;
				}
				$pos_a    = $phrase_a === '' ? PHP_INT_MAX : stripos( $body, $phrase_a );
				$pos_b    = $phrase_b === '' ? PHP_INT_MAX : stripos( $body, $phrase_b );
				if ( $pos_a === false ) {
					$pos_a = PHP_INT_MAX;
				}
				if ( $pos_b === false ) {
					$pos_b = PHP_INT_MAX;
				}
				if ( $pos_a !== $pos_b ) {
					return $pos_a <=> $pos_b;
				}
				return strlen( $phrase_b ) <=> strlen( $phrase_a );
			}
		);

		foreach ( $links as $link ) {
			if ( empty( $link['phrase'] ) || empty( $link['url'] ) ) {
				continue;
			}
			$phrase = (string) $link['phrase'];
			$url    = (string) $link['url'];
			if ( self::phrase_is_list_description_only( $body, $phrase ) ) {
				continue;
			}
			$next   = self::link_phrase_on_unlinked_list_lines( $body, $phrase, $url );
			if ( $next !== $body ) {
				$body = $next;
			}
		}

		return self::repair_malformed_markdown_links( self::strip_links_from_list_descriptions( $body ) );
	}

	/**
	 * Dedupe repeated URLs within each prose paragraph. Bullets and section blocks keep links.
	 */
	public static function dedupe_body_markdown_urls( string $body ): string {
		if ( $body === '' ) {
			return $body;
		}

		$lines = preg_split( '/\r\n|\r|\n/', $body );
		$seen  = array();
		$out   = array();

		foreach ( $lines as $line ) {
			$trimmed = trim( $line );
			if ( $trimmed === '' || preg_match( '/^###\s+/', $line ) ) {
				$seen  = array();
				$out[] = $line;
				continue;
			}

			if ( preg_match( '/^\s*(?:[-*]|\d+\.)\s+/', $line ) ) {
				$out[] = $line;
				continue;
			}

			$deduped = preg_replace_callback(
				'/\[([^\]]+)\]\(([^)]+)\)/',
				function ( array $matches ) use ( &$seen ) {
					$norm = strtolower( rtrim( trim( (string) $matches[2] ), '/' ) );
					if ( $norm === '' ) {
						return $matches[0];
					}
					if ( isset( $seen[ $norm ] ) ) {
						return (string) $matches[1];
					}
					$seen[ $norm ] = true;
					return $matches[0];
				},
				$line
			);

			$out[] = is_string( $deduped ) ? $deduped : $line;
		}

		return implode( "\n", $out );
	}

	/**
	 * OpenRouter inline links for product names and page topics in the body.
	 *
	 * @param array<int,array<string,mixed>> $items
	 * @param array<int,array<string,mixed>> $site_index
	 * @param array<int,array<string,mixed>> $lead_pages
	 * @param array<int,string>              $phrases
	 */
	private static function apply_body_product_links( string $body, string $user_message, array $items, array $site_index, array $lead_pages, array $phrases ): string {
		if ( $body === '' ) {
			return $body;
		}

		$pool = self::body_link_pool( $body, $user_message, $items, $site_index, $lead_pages, $phrases );
		$body = self::normalize_list_line_markdown( $body );
		$body = self::merge_split_list_bullets( $body );
		$body = self::strip_links_from_labelless_bullets( $body );
		$body = self::apply_deterministic_list_links( $body, $pool );
		$body = self::strip_links_from_list_descriptions( $body );
		$body = self::repair_malformed_markdown_links( $body );
		$body = self::strip_heading_markdown_links( $body );
		$body = self::strip_bracket_citations( $body );

		return self::dedupe_body_markdown_urls( $body );
	}

	/**
	 * Site index pages whose anchor phrases appear in the given text.
	 *
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<int,array<string,mixed>>
	 */
	public static function index_items_for_text( string $text, array $site_index ): array {
		return self::index_items_matching_body( $text, $site_index );
	}

	/**
	 * Widen the attach pool for template cards (summarize / tell-me-about).
	 *
	 * @param array<int,array<string,mixed>> $site_index
	 * @param array<int,array<string,mixed>> $base_items
	 * @return array<int,array<string,mixed>>
	 */
	public static function items_for_template_attach( string $source, string $body, string $page_title, array $site_index, array $base_items ): array {
		$combined = trim( $page_title . "\n" . $source . "\n" . $body );
		$fuzzy    = Neo_Pulse_Wp_Chat_Rag::find_fuzzy_topic_pages( $combined, $site_index, 16 );
		return self::dedupe_items_by_id(
			array_merge(
				$base_items,
				self::index_items_for_text( $source, $site_index ),
				self::index_items_for_text( $body, $site_index ),
				self::index_items_for_text( $combined, $site_index ),
				$fuzzy
			)
		);
	}

	/**
	 * Extract inline markdown links from a page outline.
	 *
	 * @return array<int,array{phrase:string,url:string}>
	 */
	public static function extract_markdown_link_map( string $text ): array {
		if ( $text === '' || ! preg_match_all( '/\[([^\]]+)\]\(([^)]+)\)/', $text, $matches, PREG_SET_ORDER ) ) {
			return array();
		}

		$links = array();
		$seen  = array();
		foreach ( $matches as $match ) {
			$phrase = trim( (string) $match[1] );
			$url    = trim( (string) $match[2] );
			if ( $phrase === '' || $url === '' ) {
				continue;
			}
			$key = strtolower( $phrase );
			if ( isset( $seen[ $key ] ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$links[]      = array(
				'phrase' => $phrase,
				'url'    => $url,
			);
		}

		usort(
			$links,
			function ( $a, $b ) {
				return strlen( (string) $b['phrase'] ) <=> strlen( (string) $a['phrase'] );
			}
		);

		return $links;
	}

	/**
	 * Re-apply link targets from the page outline onto formatted template bodies.
	 *
	 * @param array<int,array{phrase:string,url:string}> $hints
	 * @param array<int,array<string,mixed>>           $site_index
	 */
	public static function apply_outline_link_hints( string $body, array $hints, array $site_index = array() ): string {
		if ( $body === '' || empty( $hints ) ) {
			return $body;
		}

		$allowed_hosts = array();
		$site_host     = wp_parse_url( home_url( '/' ), PHP_URL_HOST );
		if ( is_string( $site_host ) && $site_host !== '' ) {
			$allowed_hosts[ strtolower( $site_host ) ] = true;
		}
		foreach ( $site_index as $item ) {
			if ( empty( $item['url'] ) ) {
				continue;
			}
			$host = wp_parse_url( (string) $item['url'], PHP_URL_HOST );
			if ( is_string( $host ) && $host !== '' ) {
				$allowed_hosts[ strtolower( $host ) ] = true;
			}
		}

		$links = array();
		foreach ( $hints as $hint ) {
			if ( empty( $hint['phrase'] ) || empty( $hint['url'] ) ) {
				continue;
			}
			$url = esc_url_raw( (string) $hint['url'] );
			if ( $url === '' ) {
				continue;
			}
			$host = wp_parse_url( $url, PHP_URL_HOST );
			if ( is_string( $host ) && $host !== '' && ! isset( $allowed_hosts[ strtolower( $host ) ] ) ) {
				continue;
			}
			$links[] = array(
				'phrase' => (string) $hint['phrase'],
				'url'    => $url,
			);
		}

		if ( empty( $links ) ) {
			return $body;
		}

		return self::apply_resolved_link_map( $body, $links );
	}

	/**
	 * Link unlinked list labels using the site page pool (no OpenRouter).
	 *
	 * @param array<int,array<string,mixed>> $pool
	 */
	private static function apply_deterministic_list_links( string $body, array $pool ): string {
		$labels = self::unlinked_list_labels( $body );
		if ( empty( $labels ) || empty( $pool ) ) {
			return $body;
		}

		$links = array();
		foreach ( $labels as $label ) {
			$match = self::best_pool_item_for_label( $label, $pool );
			if ( null === $match || empty( $match['url'] ) ) {
				continue;
			}
			$links[] = array(
				'phrase' => $label,
				'url'    => (string) $match['url'],
			);
		}

		if ( empty( $links ) ) {
			return $body;
		}

		return self::apply_resolved_link_map( $body, $links );
	}

	/**
	 * @param array<int,array<string,mixed>> $pool
	 * @return array<string,mixed>|null
	 */
	private static function best_pool_item_for_label( string $label, array $pool ): ?array {
		$label_norm = self::normalize_for_link_match( $label );
		if ( $label_norm === '' ) {
			return null;
		}

		$best       = null;
		$best_score = 0;

		foreach ( $pool as $item ) {
			if ( empty( $item['url'] ) ) {
				continue;
			}
			foreach ( self::anchor_phrases_for_item( $item ) as $phrase ) {
				$phrase_norm = self::normalize_for_link_match( $phrase );
				if ( $phrase_norm === '' ) {
					continue;
				}

				$score = 0;
				if ( $phrase_norm === $label_norm ) {
					$score = 100 + strlen( $phrase_norm );
				} elseif ( str_contains( $label_norm, $phrase_norm ) || str_contains( $phrase_norm, $label_norm ) ) {
					$score = 50 + strlen( $phrase_norm );
				}

				if ( $score > $best_score ) {
					$best_score = $score;
					$best       = $item;
				}
			}
		}

		return $best_score >= 50 ? $best : null;
	}

	private static function body_link_pool( string $body, string $user_message, array $items, array $site_index, array $lead_pages, array $phrases ): array {
		$fuzzy     = Neo_Pulse_Wp_Chat_Rag::find_fuzzy_topic_pages( $user_message, $site_index, 12, $phrases );
		$body_hits = self::index_items_matching_body( $body, $site_index );
		return self::dedupe_items_by_id( array_merge( $items, $fuzzy, $body_hits, $lead_pages ) );
	}

	/**
	 * Index pages whose title/slug phrases appear in the answer body.
	 *
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<int,array<string,mixed>>
	 */
	private static function index_items_matching_body( string $body, array $site_index ): array {
		if ( $body === '' || empty( $site_index ) ) {
			return array();
		}

		$hits = array();
		foreach ( $site_index as $item ) {
			if ( empty( $item['url'] ) ) {
				continue;
			}
			foreach ( self::anchor_phrases_for_item( $item ) as $phrase ) {
				if ( strlen( $phrase ) < 4 ) {
					continue;
				}
				if ( self::body_contains_phrase( $body, $phrase ) ) {
					$hits[] = $item;
					break;
				}
			}
		}

		return $hits;
	}

	private static function body_contains_phrase( string $body, string $phrase ): bool {
		if ( self::body_has_markdown_link_for_phrase( $body, $phrase ) ) {
			return false;
		}
		if ( stripos( $body, $phrase ) !== false ) {
			return true;
		}
		$pattern = self::phrase_to_flexible_pattern( $phrase );
		if ( $pattern !== '' && preg_match( $pattern, $body ) === 1 ) {
			return true;
		}
		$bold_pattern = self::phrase_to_bold_wrapped_pattern( $phrase );
		return $bold_pattern !== '' && preg_match( $bold_pattern, $body ) === 1;
	}

	private static function normalize_for_link_match( string $text ): string {
		$text = strtolower( $text );
		$text = preg_replace( '/[®™©]/u', '', $text );
		$text = preg_replace( '/[^\p{L}\p{N}\s]/u', ' ', $text );
		return trim( preg_replace( '/\s+/', ' ', (string) $text ) );
	}

	private static function phrase_to_flexible_pattern( string $phrase ): string {
		$words = preg_split( '/\s+/', self::normalize_for_link_match( $phrase ), -1, PREG_SPLIT_NO_EMPTY );
		if ( empty( $words ) ) {
			return '';
		}

		$parts = array();
		foreach ( $words as $i => $word ) {
			$quoted = preg_quote( $word, '/' );
			$parts[] = ( 0 === $i ) ? $quoted . '[®™©]?' : $quoted;
		}

		return '/\b(' . implode( '\s+', $parts ) . ')\b/iu';
	}

	private static function phrase_to_bold_wrapped_pattern( string $phrase ): string {
		$words = preg_split( '/\s+/', self::normalize_for_link_match( $phrase ), -1, PREG_SPLIT_NO_EMPTY );
		if ( empty( $words ) ) {
			return '';
		}

		$parts = array();
		foreach ( $words as $i => $word ) {
			$quoted = preg_quote( $word, '/' );
			$parts[] = ( 0 === $i ) ? $quoted . '[®™©]?' : $quoted;
		}

		return '/\*\*((' . implode( '\s+', $parts ) . '))(?::\*\*|\*\*:?)/iu';
	}

	private static function strip_bracket_citations( string $body ): string {
		$stripped = preg_replace( '/\s*\[\d+\]/', '', $body );
		return is_string( $stripped ) ? $stripped : $body;
	}
}
