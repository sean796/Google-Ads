<?php
/**
 * Chat list line link helpers.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Links_Trait_List_Lines {

	/**
	 * True when phrase appears only after the label colon on a list line (never link these).
	 */
	private static function phrase_is_list_description_only( string $body, string $phrase ): bool {
		$phrase = trim( $phrase );
		if ( $phrase === '' ) {
			return false;
		}

		$phrase_norm = self::normalize_for_link_match( $phrase );
		if ( $phrase_norm === '' ) {
			return false;
		}

		$in_label = false;
		$in_desc  = false;

		foreach ( preg_split( '/\r\n|\r|\n/', $body ) as $line ) {
			if ( ! preg_match( '/^\s*(?:[-*]|\d+\.)\s+(.+)$/', $line, $match ) ) {
				continue;
			}

			$content = (string) $match[1];
			$parts   = self::parse_list_line_parts( $content );
			if ( $parts['desc'] === '' ) {
				continue;
			}

			$label_part = (string) $parts['label'];
			$desc_part  = ltrim( (string) $parts['desc'], ': ' );
			$label_text = self::plain_list_label_text( $label_part );

			if ( self::segment_contains_phrase( $label_part, $phrase, $phrase_norm ) ) {
				$in_label = true;
			}
			if ( self::segment_contains_phrase( $desc_part, $phrase, $phrase_norm ) ) {
				$in_desc = true;
			}
		}

		return $in_desc && ! $in_label;
	}

	private static function segment_contains_phrase( string $segment, string $phrase, string $phrase_norm ): bool {
		if ( $segment === '' || $phrase === '' ) {
			return false;
		}

		if ( stripos( $segment, $phrase ) !== false ) {
			return true;
		}

		$pattern = self::phrase_to_flexible_pattern( $phrase );
		return $pattern !== '' && preg_match( $pattern, $segment ) === 1;
	}

	private static function phrase_matches_any_unlinked_list_label( string $body, string $phrase ): bool {
		$phrase = trim( $phrase );
		if ( $phrase === '' ) {
			return false;
		}

		foreach ( preg_split( '/\r\n|\r|\n/', $body ) as $line ) {
			if ( ! preg_match( '/^\s*(?:[-*]|\d+\.)\s+(.+)$/', $line, $match ) ) {
				continue;
			}

			$content = (string) $match[1];
			if ( self::list_line_label_is_linked( $content ) || ! str_contains( $content, ':' ) ) {
				continue;
			}

			$label = self::plain_list_label_text( self::list_line_label_segment( $content ) );
			if ( $label !== '' && self::phrase_matches_list_label( $label, $phrase ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * @return array<int,string>
	 */
	public static function unlinked_list_labels( string $body ): array {
		if ( $body === '' ) {
			return array();
		}

		$labels = array();
		foreach ( preg_split( '/\r\n|\r|\n/', $body ) as $line ) {
			if ( ! preg_match( '/^\s*(?:[-*]|\d+\.)\s+(.+)$/', $line, $match ) ) {
				continue;
			}

			$content = trim( (string) $match[1] );
			if ( $content === '' || self::list_line_label_is_linked( $content ) ) {
				continue;
			}

			$label = self::plain_list_label_text( self::list_line_label_segment( $content ) );
			if ( $label !== '' && strlen( $label ) >= 3 ) {
				$labels[] = $label;
			}
		}

		return array_values( array_unique( $labels ) );
	}

	/**
	 * Link a phrase when it is the label on an unlinked list line (label only, never description).
	 */
	private static function link_phrase_on_unlinked_list_lines( string $body, string $phrase, string $url ): string {
		if ( $body === '' || trim( $phrase ) === '' ) {
			return $body;
		}

		$lines   = preg_split( '/\r\n|\r|\n/', $body );
		$changed = false;

		foreach ( $lines as $i => $line ) {
			if ( ! preg_match( '/^(\s*(?:[-*]|\d+\.)\s+)(.+)$/', $line, $match ) ) {
				continue;
			}

			$prefix  = (string) $match[1];
			$content = (string) $match[2];
			if ( self::list_line_label_is_linked( $content ) ) {
				continue;
			}

			$linked = self::link_list_line_label( $content, $phrase, $url );
			if ( $linked !== $content ) {
				$lines[ $i ] = $prefix . $linked;
				$changed     = true;
			}
		}

		return $changed ? implode( "\n", $lines ) : $body;
	}

	private static function list_line_label_is_linked( string $content ): bool {
		$label_part = self::list_line_label_segment( $content );
		if ( $label_part === '' ) {
			return false;
		}

		$label_text = self::plain_list_label_text( $label_part );
		return $label_text !== '' && preg_match( '/^\[[^\]]+\]\(/', $label_part ) === 1;
	}

	/**
	 * Split list item text into label and description at the label colon.
	 *
	 * @return array{label:string,desc:string}
	 */
	private static function parse_list_line_parts( string $content ): array {
		$content = trim( $content );
		if ( $content === '' ) {
			return array(
				'label' => '',
				'desc'  => '',
			);
		}

		if ( preg_match( '/^(\*\*(.+?):\*\*)\s*(.*)$/s', $content, $match ) ) {
			return array(
				'label' => (string) $match[1],
				'desc'  => ': ' . (string) $match[3],
			);
		}

		if ( preg_match( '/^(\*\*.+?\*\*):\s*(.*)$/s', $content, $match ) ) {
			return array(
				'label' => (string) $match[1],
				'desc'  => ': ' . (string) $match[2],
			);
		}

		if ( preg_match( '/^(\[[^\]]+\]\([^)]+\)):\s*(.*)$/s', $content, $match ) ) {
			return array(
				'label' => (string) $match[1],
				'desc'  => ': ' . (string) $match[2],
			);
		}

		$colon = strpos( $content, ':' );
		if ( $colon === false ) {
			return array(
				'label' => $content,
				'desc'  => '',
			);
		}

		return array(
			'label' => substr( $content, 0, $colon ),
			'desc'  => substr( $content, $colon ),
		);
	}

	private static function plain_list_label_text( string $label_part ): string {
		$label_part = trim( $label_part );
		if ( $label_part === '' ) {
			return '';
		}

		if ( preg_match( '/^\*\*(.+?):\*\*$/', $label_part, $match ) ) {
			return trim( (string) $match[1] );
		}

		if ( preg_match( '/^\[([^\]]+)\]\(/', $label_part, $match ) ) {
			return trim( (string) $match[1] );
		}

		return trim( (string) preg_replace( '/^\*\*|\*\*$/', '', $label_part ) );
	}

	private static function list_line_label_segment( string $content ): string {
		$parts = self::parse_list_line_parts( $content );
		return (string) $parts['label'];
	}

	private static function list_line_description_segment( string $content ): string {
		$parts = self::parse_list_line_parts( $content );
		return (string) $parts['desc'];
	}

	private static function phrase_matches_list_label( string $label, string $phrase ): bool {
		if ( $label === '' || $phrase === '' ) {
			return false;
		}

		$label_norm  = self::normalize_for_link_match( $label );
		$phrase_norm = self::normalize_for_link_match( $phrase );
		if ( $label_norm === $phrase_norm ) {
			return true;
		}

		return stripos( $label, $phrase ) === 0 || stripos( $phrase, $label ) === 0;
	}

	/**
	 * Replace list label (before `:`) with a markdown link; leave description plain.
	 */
	private static function link_list_line_label( string $content, string $phrase, string $url ): string {
		$label_part = self::list_line_label_segment( $content );
		$desc_part  = self::list_line_description_segment( $content );
		if ( $label_part === '' ) {
			return $content;
		}

		$label_text = self::plain_list_label_text( $label_part );
		if ( $label_text === '' || ! self::phrase_matches_list_label( $label_text, $phrase ) ) {
			return $content;
		}

		if ( preg_match( '/^\[[^\]]+\]\(/', $label_part ) ) {
			return $content;
		}

		$linked_label = '[' . $label_text . '](' . $url . ')';
		if ( $desc_part === '' ) {
			return $linked_label;
		}

		return $linked_label . $desc_part;
	}

	/**
	 * Merge label-only bullets with the description bullet that follows.
	 */
	public static function merge_split_list_bullets( string $body ): string {
		if ( $body === '' ) {
			return $body;
		}

		$lines = preg_split( '/\r\n|\r|\n/', $body );
		$out   = array();
		$count = count( $lines );

		for ( $i = 0; $i < $count; $i++ ) {
			$line = $lines[ $i ];
			if ( ! preg_match( '/^(\s*(?:[-*]|\d+\.)\s+)(.+)$/', $line, $match ) ) {
				$out[] = $line;
				continue;
			}

			$prefix  = (string) $match[1];
			$content = trim( (string) $match[2] );
			if ( ! self::list_line_is_label_only( $content ) || $i + 1 >= $count ) {
				$out[] = $line;
				continue;
			}

			$next = $lines[ $i + 1 ];
			if ( ! preg_match( '/^\s*(?:[-*]|\d+\.)\s+(.+)$/', $next, $next_match ) ) {
				$out[] = $line;
				continue;
			}

			$next_content = trim( (string) $next_match[1] );
			if ( $next_content === '' || self::list_line_is_label_only( $next_content ) ) {
				$out[] = $line;
				continue;
			}

			$label_part = self::list_line_label_segment( $content );
			$label_part = self::fix_colon_inside_markdown_label( $label_part );
			$desc_text  = self::plain_text_from_markdown_segment( $next_content );
			if ( $desc_text === '' ) {
				$out[] = $line;
				continue;
			}

			$merged = $label_part . ': ' . $desc_text;
			$out[]  = $prefix . $merged;
			$i++;
		}

		return implode( "\n", $out );
	}

	/**
	 * Unwrap markdown links on bullets that are not label:description lines.
	 */
	public static function strip_links_from_labelless_bullets( string $body ): string {
		if ( $body === '' ) {
			return $body;
		}

		$lines = preg_split( '/\r\n|\r|\n/', $body );
		foreach ( $lines as $i => $line ) {
			if ( ! preg_match( '/^(\s*(?:[-*]|\d+\.)\s+)(.+)$/', $line, $match ) ) {
				continue;
			}

			$content = (string) $match[2];
			if ( self::list_line_has_label_colon( $content ) ) {
				continue;
			}

			$plain = self::plain_text_from_markdown_segment( $content );
			if ( $plain !== $content ) {
				$lines[ $i ] = (string) $match[1] . $plain;
			}
		}

		return implode( "\n", $lines );
	}

	private static function list_line_is_label_only( string $content ): bool {
		$content = trim( $content );
		if ( $content === '' ) {
			return false;
		}

		if ( preg_match( '/^\[[^\]]+\]\((https?:\/\/[^)]+)\)\s*$/', $content ) ) {
			return true;
		}

		$parts = self::parse_list_line_parts( $content );
		if ( $parts['desc'] !== '' && trim( $parts['desc'], ': ' ) !== '' ) {
			return false;
		}

		return str_ends_with( rtrim( $content ), ':' );
	}

	private static function list_line_has_label_colon( string $content ): bool {
		$content = trim( $content );
		if ( $content === '' ) {
			return false;
		}

		$parts = self::parse_list_line_parts( $content );
		return $parts['desc'] !== '' && trim( $parts['desc'], ': ' ) !== '';
	}

	private static function fix_colon_inside_markdown_label( string $label_part ): string {
		$fixed = preg_replace( '/\[([^\]]+):\]\((https?:\/\/[^)]+)\)/i', '[$1]($2)', $label_part );
		return is_string( $fixed ) ? $fixed : $label_part;
	}

	private static function plain_text_from_markdown_segment( string $segment ): string {
		$plain = preg_replace( '/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i', '$1', $segment );
		$plain = is_string( $plain ) ? $plain : $segment;
		$plain = preg_replace( '/^\*\*|\*\*$/', '', trim( $plain ) );
		return is_string( $plain ) ? trim( $plain ) : trim( $segment );
	}

	/**
	 * Fix list-line markdown where bold markers survived link injection.
	 */
	public static function normalize_list_line_markdown( string $body ): string {
		if ( $body === '' ) {
			return $body;
		}

		$lines = preg_split( '/\r\n|\r|\n/', $body );
		foreach ( $lines as $i => $line ) {
			if ( ! preg_match( '/^(\s*(?:[-*]|\d+\.)\s+)(.+)$/', $line, $match ) ) {
				continue;
			}

			$content = (string) $match[2];
			$content = self::fix_colon_inside_markdown_label( $content );
			$fixed   = preg_replace( '/^\*\*(\[[^\]]+\]\([^)]+\)):\*\*\s*/', '$1: ', $content );
			if ( is_string( $fixed ) ) {
				$content = $fixed;
			}

			$fixed = preg_replace( '/^(\[[^\]]+\]\([^)]+\)):\*\*\s*/', '$1: ', $content );
			if ( is_string( $fixed ) ) {
				$content = $fixed;
			}

			$fixed = preg_replace( '/^\*\*(.+?):\*\*\s*/', '$1: ', $content );
			if ( is_string( $fixed ) ) {
				$content = $fixed;
			}

			$fixed = preg_replace( '/^(.+?)!\*\*\s*$/', '$1', $content );
			if ( is_string( $fixed ) ) {
				$content = $fixed;
			}

			$lines[ $i ] = (string) $match[1] . $content;
		}

		return implode( "\n", $lines );
	}

	/**
	 * List lines are label-linked only; unwrap every markdown link after the first `:`.
	 */
	public static function strip_links_from_list_descriptions( string $body ): string {
		if ( $body === '' ) {
			return $body;
		}

		$lines = preg_split( '/\r\n|\r|\n/', $body );
		foreach ( $lines as $i => $line ) {
			if ( ! preg_match( '/^(\s*(?:[-*]|\d+\.)\s+)(.+)$/', $line, $match ) ) {
				continue;
			}

			$content = (string) $match[2];
			$desc    = self::list_line_description_segment( $content );
			if ( $desc === '' ) {
				continue;
			}

			$desc_clean = preg_replace( '/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/i', '$1', $desc );
			if ( is_string( $desc_clean ) && $desc_clean !== $desc ) {
				$lines[ $i ] = (string) $match[1] . self::list_line_label_segment( $content ) . $desc_clean;
			}
		}

		return implode( "\n", $lines );
	}

	/**
	 * When a list label is linked, unwrap duplicate links for the same URL in that line's description.
	 */
	public static function strip_duplicate_links_in_list_descriptions( string $body ): string {
		return self::strip_links_from_list_descriptions( $body );
	}
}
