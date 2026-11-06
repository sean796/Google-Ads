<?php
/**
 * Chat markdown link repair helpers.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Links_Trait_Markdown_Repair {

	/**
	 * Rewrite inline markdown links that point at off-topic pages to the primary topic URL.
	 */
	private static function replace_non_topic_markdown_urls( string $body, string $primary_url, string $user_message, array $items, array $site_index, array $extra_phrases = array() ): string {
		$primary_norm = strtolower( rtrim( $primary_url, '/' ) );
		$replaced     = preg_replace_callback(
			'/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i',
			function ( array $matches ) use ( $primary_norm, $primary_url, $user_message, $items, $site_index, $extra_phrases ) {
				$url_norm = strtolower( rtrim( $matches[2], '/' ) );
				if ( $url_norm === $primary_norm ) {
					return $matches[0];
				}
				$item = self::link_to_item(
					array(
						'label' => $matches[1],
						'url'   => $matches[2],
					),
					$items,
					$site_index
				);
				if (
					Neo_Pulse_Wp_Chat_Rag::item_has_topic_slug_match( $user_message, $item, $extra_phrases )
					&& (
						Neo_Pulse_Wp_Chat_Rag::count_slug_path_term_hits( $user_message, $item, $extra_phrases ) >= 2
						|| self::has_strong_single_slug_match( $user_message, $item, $extra_phrases )
					)
				) {
					return $matches[0];
				}
				return '[' . $matches[1] . '](' . $primary_url . ')';
			},
			$body
		);
		return is_string( $replaced ) ? $replaced : $body;
	}

	/**
	 * Link plain-text page mentions in the body (e.g. "contact us page") when no markdown link exists yet.
	 *
	 * @param array<int,array<string,mixed>>                         $lead_pages
	 * @param array<int,array{label:string,url:string,icon:string}> $links
	 */
	private static function link_body_page_mentions( string $body, array $lead_pages, array $links ): string {
		if ( $body === '' || empty( $links ) ) {
			return $body;
		}

		$phrases = array(
			'contact us page',
			'contact page',
			'contact us',
			'book an appointment',
			'book a consultation',
			'schedule a consultation',
			'get a quote',
			'request a quote',
		);

		foreach ( $lead_pages as $item ) {
			$title = trim( wp_strip_all_tags( (string) ( $item['title'] ?? '' ) ) );
			if ( $title !== '' ) {
				$phrases[] = strtolower( $title );
			}
		}

		foreach ( $links as $link ) {
			if ( empty( $link['url'] ) ) {
				continue;
			}
			$url = (string) $link['url'];
			if ( ! empty( $link['label'] ) ) {
				$phrases[] = strtolower( (string) $link['label'] );
			}
			foreach ( $phrases as $phrase ) {
				if ( self::body_has_markdown_link_for_phrase( $body, $phrase ) ) {
					break;
				}
				$linked = self::link_first_phrase( $body, $phrase, $url );
				if ( $linked !== $body ) {
					$body = $linked;
					break;
				}
			}
		}

		return $body;
	}

	/**
	 * Remove inline markdown links that are not slug/path matched (no substitute URL).
	 *
	 * @param array<int,array<string,mixed>> $lead_pages Lead page items whose URLs are preserved.
	 */
	private static function strip_non_topic_markdown_urls( string $body, string $user_message, array $items, array $site_index, array $extra_phrases = array(), array $lead_pages = array() ): string {
		$lead_url_norms = array();
		foreach ( $lead_pages as $page ) {
			if ( empty( $page['url'] ) ) {
				continue;
			}
			$lead_url_norms[ strtolower( rtrim( (string) $page['url'], '/' ) ) ] = true;
		}

		$replaced = preg_replace_callback(
			'/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i',
			function ( array $matches ) use ( $user_message, $items, $site_index, $extra_phrases, $lead_url_norms ) {
				$url_norm = strtolower( rtrim( $matches[2], '/' ) );
				if ( isset( $lead_url_norms[ $url_norm ] ) ) {
					return $matches[0];
				}
				$item = self::link_to_item(
					array(
						'label' => $matches[1],
						'url'   => $matches[2],
					),
					$items,
					$site_index
				);
				if (
					Neo_Pulse_Wp_Chat_Rag::item_has_topic_slug_match( $user_message, $item, $extra_phrases )
					&& (
						Neo_Pulse_Wp_Chat_Rag::count_slug_path_term_hits( $user_message, $item, $extra_phrases ) >= 2
						|| self::has_strong_single_slug_match( $user_message, $item, $extra_phrases )
					)
				) {
					return $matches[0];
				}
				return $matches[1];
			},
			$body
		);
		return is_string( $replaced ) ? $replaced : $body;
	}

	private static function body_contains_url( string $body, string $url ): bool {
		return stripos( $body, $url ) !== false;
	}

	/**
	 * Normalize corrupted inline markdown produced by double-wrapping.
	 */
	public static function repair_malformed_markdown_links( string $body ): string {
		if ( $body === '' ) {
			return $body;
		}

		$repaired = preg_replace(
			'/\[([^\]]+)\]\((https?:\/\/[^)]+)\)([a-z]{1,3})(?=\s|:|,|\.|$|\))/i',
			'[$1$3]($2)',
			$body
		);
		if ( ! is_string( $repaired ) ) {
			return $body;
		}

		$repaired = preg_replace(
			'/\[\[([^\]]+)\]\((https?:\/\/[^)]+)\)\]\((https?:\/\/[^)]+)\)/i',
			'[$1]($2)',
			$body
		);
		if ( ! is_string( $repaired ) ) {
			return $body;
		}

		$repaired = preg_replace(
			'/\[([^\]]+)\]\((https?:\/\/[^)]+)\)\]\((https?:\/\/[^)]+)\)/i',
			'[$1]($2)',
			$repaired
		);
		if ( ! is_string( $repaired ) ) {
			return $body;
		}

		$repaired = preg_replace(
			'/\[([^\]]+)\]\((https?:\/\/[^)]+)\)\((https?:\/\/[^)]+)\)/i',
			'[$1]($2)',
			$repaired
		);
		if ( ! is_string( $repaired ) ) {
			return $body;
		}

		$repaired = preg_replace(
			'/\*\*\[([^\]]+)\*\*\]\((https?:\/\/[^)]+)\)/i',
			'[$1]($2)',
			$repaired
		);
		if ( ! is_string( $repaired ) ) {
			return $body;
		}

		$repaired = preg_replace(
			'/\*\*\[([^\]]+)\]\((https?:\/\/[^)]+)\)\*\*/i',
			'[$1]($2)',
			$repaired
		);
		if ( ! is_string( $repaired ) ) {
			return $body;
		}

		$repaired = preg_replace(
			'/\*\*(\[[^\]]+\]\((https?:\/\/[^)]+)\)):\*\*/i',
			'$1:',
			$repaired
		);
		if ( ! is_string( $repaired ) ) {
			return $body;
		}

		$repaired = preg_replace(
			'/(\[[^\]]+\]\((https?:\/\/[^)]+)\)):\*\*\s*/i',
			'$1: ',
			$repaired
		);
		if ( ! is_string( $repaired ) ) {
			return $body;
		}

		$repaired = preg_replace(
			'/\[([^\[\]]*)\[([^\]]+)\]\((https?)(?:\/\/[^\)]*)?\]\((https?:\/\/[^)]+)\)([^\]]*)\]/i',
			'[$2]($4)',
			$repaired
		);
		if ( ! is_string( $repaired ) ) {
			return $body;
		}

		$repaired = preg_replace(
			'/(\[[^\]]+\]\((https?:\/\/[^)]+)\))!\*\*/i',
			'$1',
			$repaired
		);
		if ( ! is_string( $repaired ) ) {
			return $body;
		}

		return self::normalize_list_line_markdown( is_string( $repaired ) ? $repaired : $body );
	}

	/**
	 * Remove markdown links from ### headings (keep visible text only).
	 */
	public static function strip_heading_markdown_links( string $body ): string {
		if ( $body === '' ) {
			return $body;
		}

		$lines = preg_split( '/\r\n|\r|\n/', $body );
		foreach ( $lines as $i => $line ) {
			if ( ! preg_match( '/^###\s+/', $line ) ) {
				continue;
			}

			$stripped = preg_replace( '/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i', '$1', $line );
			if ( is_string( $stripped ) ) {
				$lines[ $i ] = $stripped;
			}
		}

		return implode( "\n", $lines );
	}

	private static function body_has_markdown_link_for_phrase( string $body, string $phrase ): bool {
		$phrase = trim( $phrase );
		if ( $phrase === '' ) {
			return false;
		}

		$phrase_norm = self::normalize_for_link_match( $phrase );
		if ( preg_match_all( '/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/i', $body, $matches, PREG_SET_ORDER ) ) {
			foreach ( $matches as $match ) {
				$label_norm = self::normalize_for_link_match( (string) $match[1] );
				if ( $label_norm === '' || $phrase_norm === '' ) {
					continue;
				}
				if ( $label_norm === $phrase_norm ) {
					return true;
				}
			}
		}

		return false;
	}

	private static function link_first_phrase( string $body, string $phrase, string $url ): string {
		$phrase = trim( $phrase );
		if ( $phrase === '' || strlen( $phrase ) < 3 ) {
			return $body;
		}

		$lines = preg_split( '/\r\n|\r|\n/', $body );
		foreach ( $lines as $i => $line ) {
			if ( preg_match( '/^###\s+/', $line ) ) {
				continue;
			}

			if ( preg_match( '/^(\s*(?:[-*]|\d+\.)\s+)(.+)$/', $line, $match ) ) {
				$content = (string) $match[2];
				if ( str_contains( $content, ':' ) ) {
					if ( self::list_line_label_is_linked( $content ) ) {
						continue;
					}

					$linked = self::link_list_line_label( $content, $phrase, $url );
					if ( $linked !== $content ) {
						$lines[ $i ] = (string) $match[1] . $linked;
						return implode( "\n", $lines );
					}

					$label_only = self::list_line_label_segment( $content );
					if ( $label_only !== '' ) {
						$linked_label = self::link_first_phrase_in_segment( $label_only, $phrase, $url );
						if ( $linked_label !== $label_only ) {
							$lines[ $i ] = (string) $match[1] . $linked_label . self::list_line_description_segment( $content );
							return implode( "\n", $lines );
						}
					}
					continue;
				}
			}

			$linked_line = self::link_first_phrase_in_segment( $line, $phrase, $url );
			if ( $linked_line !== $line ) {
				$lines[ $i ] = $linked_line;
				return implode( "\n", $lines );
			}
		}

		return $body;
	}

	private static function link_first_phrase_in_segment( string $segment, string $phrase, string $url ): string {
		$phrase = trim( $phrase );
		if ( $phrase === '' || $segment === '' ) {
			return $segment;
		}

		$bold_pattern = self::phrase_to_bold_wrapped_pattern( $phrase );
		if ( $bold_pattern !== '' && preg_match( $bold_pattern, $segment, $match, PREG_OFFSET_CAPTURE ) ) {
			$full_start = (int) $match[0][1];
			$full_len   = strlen( (string) $match[0][0] );
			$label      = trim( (string) $match[1][0] );
			if ( $full_len > 0 && $label !== '' && ! self::phrase_overlaps_markdown_link( $segment, $full_start, $full_start + $full_len ) ) {
				return substr( $segment, 0, $full_start ) . '[' . $label . '](' . $url . ')' . substr( $segment, $full_start + $full_len );
			}
		}

		$offset     = 0;
		$lower      = strtolower( $segment );
		$needle     = strtolower( $phrase );
		$needle_len = strlen( $needle );

		while ( $offset < strlen( $segment ) ) {
			$pos = strpos( $lower, $needle, $offset );
			if ( $pos === false ) {
				break;
			}
			if ( self::phrase_inside_bold_list_label( $segment, $pos, $pos + $needle_len ) ) {
				$offset = $pos + $needle_len;
				continue;
			}
			if ( ! self::phrase_overlaps_markdown_link( $segment, $pos, $pos + $needle_len ) ) {
				$match_end = self::extend_phrase_match_end( $segment, $pos, $needle_len );
				$matched   = substr( $segment, $pos, $match_end - $pos );
				return substr( $segment, 0, $pos ) . '[' . $matched . '](' . $url . ')' . substr( $segment, $match_end );
			}
			$offset = $pos + $needle_len;
		}

		$pattern = self::phrase_to_flexible_pattern( $phrase );
		if ( $pattern !== '' && preg_match( $pattern, $segment, $match, PREG_OFFSET_CAPTURE ) ) {
			$start = (int) $match[1][1];
			$len   = strlen( (string) $match[1][0] );
			if ( $len > 0 && ! self::phrase_inside_bold_list_label( $segment, $start, $start + $len ) && ! self::phrase_overlaps_markdown_link( $segment, $start, $start + $len ) ) {
				$matched = substr( $segment, $start, $len );
				return substr( $segment, 0, $start ) . '[' . $matched . '](' . $url . ')' . substr( $segment, $start + $len );
			}
		}

		return $segment;
	}

	/**
	 * When a shorter anchor phrase matches inside a longer word, include common suffix letters (e.g. plural s).
	 */
	private static function extend_phrase_match_end( string $segment, int $pos, int $needle_len ): int {
		$end = $pos + $needle_len;
		if ( $end >= strlen( $segment ) ) {
			return $end;
		}

		$rest = substr( $segment, $end );
		if ( preg_match( '/^(s|es|ed|ing)(?=\s|:|,|\.|$|\))/i', $rest, $match ) ) {
			return $end + strlen( (string) $match[1] );
		}

		return $end;
	}

	private static function phrase_inside_bold_list_label( string $segment, int $start, int $end ): bool {
		if ( preg_match( '/^\*\*(.+?):\*\*$/', trim( $segment ), $match ) ) {
			$label_start = 2;
			$label_end   = $label_start + strlen( (string) $match[1] );
			return $start >= $label_start && $end <= $label_end;
		}

		return false;
	}

	private static function phrase_overlaps_markdown_link( string $body, int $start, int $end ): bool {
		$before = substr( $body, 0, $start );
		$open   = strrpos( $before, '[' );
		if ( $open !== false ) {
			$close_bracket = strpos( $body, ']', $open );
			if (
				$close_bracket !== false
				&& $start >= $open + 1
				&& $end <= $close_bracket
				&& $close_bracket + 2 <= strlen( $body )
				&& substr( $body, $close_bracket, 2 ) === ']('
			) {
				return true;
			}
		}

		$offset = 0;
		while ( preg_match( '/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/', $body, $match, PREG_OFFSET_CAPTURE, $offset ) ) {
			$full_start = (int) $match[0][1];
			$full_end   = $full_start + strlen( $match[0][0] );
			if ( $start < $full_end && $end > $full_start ) {
				return true;
			}
			$offset = $full_end;
		}

		return false;
	}

	private static function phrase_inside_markdown_link( string $body, int $start, int $end ): bool {
		return self::phrase_overlaps_markdown_link( $body, $start, $end );
	}
}
