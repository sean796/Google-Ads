<?php
/**
 * Section indexing, removal, and section chunk helpers.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Backend_Assist_Body_Ops_Trait_Sections {

	/**
	 * @return array<int, array{index: int, level: int, heading_text: string, start: int, end: int, has_table: bool}>
	 */
	public static function index_html_sections( string $html ): array {
		$html = (string) $html;
		if ( trim( $html ) === '' ) {
			return array();
		}

		if ( ! preg_match_all( '/<h([23])[^>]*>(.*?)<\/h\1>/is', $html, $matches, PREG_OFFSET_CAPTURE ) ) {
			return array(
				array(
					'index'        => 0,
					'level'        => 0,
					'heading_text' => '',
					'start'        => 0,
					'end'          => strlen( $html ),
					'has_table'    => stripos( $html, '<table' ) !== false,
				),
			);
		}

		$sections = array();
		$first    = (int) $matches[0][0][1];
		if ( $first > 0 ) {
			$intro = substr( $html, 0, $first );
			$sections[] = array(
				'index'        => 0,
				'level'        => 0,
				'heading_text' => '(intro)',
				'start'        => 0,
				'end'          => $first,
				'has_table'    => stripos( $intro, '<table' ) !== false,
			);
		}

		$count = count( $matches[0] );
		for ( $i = 0; $i < $count; $i++ ) {
			$start = (int) $matches[0][ $i ][1];
			$end   = ( $i + 1 < $count ) ? (int) $matches[0][ $i + 1 ][1] : strlen( $html );
			$chunk = substr( $html, $start, $end - $start );
			$sections[] = array(
				'index'        => count( $sections ),
				'level'        => (int) $matches[1][ $i ][0],
				'heading_text' => trim( wp_strip_all_tags( (string) $matches[2][ $i ][0] ) ),
				'start'        => $start,
				'end'          => $end,
				'has_table'    => stripos( $chunk, '<table' ) !== false,
			);
		}

		return $sections;
	}

	/**
	 * First H2/H3 section after optional lead-in copy (the "intro" heading block).
	 *
	 * @return array<string, mixed>|null
	 */
	public static function resolve_intro_heading_section( string $html ): ?array {
		$sections = self::index_html_sections( $html );
		if ( $sections === array() ) {
			return null;
		}
		if ( ( $sections[0]['heading_text'] ?? '' ) === '(intro)' ) {
			return isset( $sections[1] ) ? $sections[1] : null;
		}
		if ( (int) ( $sections[0]['level'] ?? 0 ) > 0 ) {
			return $sections[0];
		}
		return null;
	}

	/**
	 * @param array<int, array{index: int, level: int, heading_text: string, start: int, end: int, has_table: bool}> $sections
	 * @return array<int, array<string, mixed>>
	 */
	public static function sections_summary_for_planner( array $sections, string $html = '' ): array {
		$out = array();
		foreach ( $sections as $sec ) {
			$ends_with_table = false;
			if ( $html !== '' && ! empty( $sec['has_table'] ) ) {
				$chunk = substr( $html, (int) $sec['start'], (int) $sec['end'] - (int) $sec['start'] );
				$ends_with_table = (bool) preg_match( '/<\/table>\s*$/is', trim( $chunk ) );
			}
			$out[] = array(
				'section_index'   => (int) $sec['index'],
				'heading'         => (string) $sec['heading_text'],
				'level'           => (int) $sec['level'],
				'has_table'       => ! empty( $sec['has_table'] ),
				'ends_with_table' => $ends_with_table,
			);
		}
		return $out;
	}

	public static function remove_section( string $html, int $index ): string {
		$sections = self::index_html_sections( $html );
		if ( ! isset( $sections[ $index ] ) ) {
			return $html;
		}
		$sec = $sections[ $index ];
		$out = substr( $html, 0, $sec['start'] ) . substr( $html, $sec['end'] );
		return trim( (string) preg_replace( "/\n{3,}/", "\n\n", $out ) );
	}

	public static function remove_section_by_heading( string $html, string $heading_match ): string {
		$heading_match = trim( $heading_match );
		if ( $heading_match === '' ) {
			return $html;
		}
		$needle = strtolower( $heading_match );
		foreach ( self::index_html_sections( $html ) as $sec ) {
			if ( $sec['heading_text'] === '(intro)' ) {
				continue;
			}
			if ( str_contains( strtolower( $sec['heading_text'] ), $needle ) ) {
				return self::remove_section( $html, (int) $sec['index'] );
			}
		}
		return $html;
	}

	/**
	 * @param array<string, mixed> $op
	 */
	public static function truncate_after_table( string $html, array $op ): string {
		$which = sanitize_key( (string) ( $op['which'] ?? 'last' ) );
		if ( ! in_array( $which, array( 'first', 'last' ), true ) ) {
			$which = 'last';
		}

		$scope        = $html;
		$scope_offset = 0;
		$sec          = self::resolve_section( $html, $op );
		if ( $sec !== null ) {
			$scope_offset = (int) $sec['start'];
			$scope        = substr( $html, $scope_offset, (int) $sec['end'] - (int) $sec['start'] );
		}

		if ( ! preg_match_all( '/<table[^>]*>[\s\S]*?<\/table>/is', $scope, $matches, PREG_OFFSET_CAPTURE ) ) {
			if ( $sec !== null ) {
				return $html;
			}
			$scope        = $html;
			$scope_offset = 0;
			if ( ! preg_match_all( '/<table[^>]*>[\s\S]*?<\/table>/is', $scope, $matches, PREG_OFFSET_CAPTURE ) ) {
				return $html;
			}
		}

		$tables = $matches[0];
		$target = $which === 'first' ? $tables[0] : $tables[ count( $tables ) - 1 ];
		$end    = $scope_offset + (int) $target[1] + strlen( (string) $target[0] );

		return trim( substr( $html, 0, $end ) );
	}

	/**
	 * @param array<string, mixed> $op
	 */
	public static function remove_sections_after( string $html, array $op ): string {
		$sec = null;
		if ( isset( $op['after_section_index'] ) ) {
			$sections = self::index_html_sections( $html );
			$idx      = (int) $op['after_section_index'];
			$sec      = isset( $sections[ $idx ] ) ? $sections[ $idx ] : null;
		} elseif ( ! empty( $op['after_heading_match'] ) ) {
			$needle = strtolower( trim( (string) $op['after_heading_match'] ) );
			foreach ( self::index_html_sections( $html ) as $candidate ) {
				if ( $candidate['heading_text'] === '(intro)' ) {
					continue;
				}
				if ( str_contains( strtolower( (string) $candidate['heading_text'] ), $needle ) ) {
					$sec = $candidate;
					break;
				}
			}
		}

		if ( $sec === null ) {
			return $html;
		}

		return trim( substr( $html, 0, (int) $sec['end'] ) );
	}

	/**
	 * Parse a section chunk with optional Gutenberg heading block comments.
	 *
	 * @return array{heading_prefix: string, heading_html: string, heading_suffix: string, body_html: string}|null
	 */
	private static function parse_section_chunk( string $chunk ): ?array {
		if ( preg_match(
			'/^(?P<prefix>(?:<!--\s*wp:heading[^>]*-->\s*)?)(?P<heading><h[23][^>]*>.*?<\/h[23]>)(?P<suffix>\s*(?:<!--\s*\/wp:heading\s*-->)?)(?P<body>[\s\S]*)$/is',
			$chunk,
			$match
		) ) {
			return array(
				'heading_prefix' => (string) $match['prefix'],
				'heading_html'   => (string) $match['heading'],
				'heading_suffix' => (string) $match['suffix'],
				'body_html'      => (string) $match['body'],
			);
		}

		return null;
	}

	/**
	 * @param array{heading_prefix: string, heading_html: string, heading_suffix: string, body_html: string} $parts
	 */
	private static function rebuild_section_chunk( array $parts, string $body_html ): string {
		return $parts['heading_prefix'] . $parts['heading_html'] . $parts['heading_suffix'] . $body_html;
	}

	/** @return array<string, mixed>|null */
	private static function resolve_section( string $html, array $op ): ?array {
		$sections = self::index_html_sections( $html );
		if ( isset( $op['section_index'] ) ) {
			$idx = (int) $op['section_index'];
			return isset( $sections[ $idx ] ) ? $sections[ $idx ] : null;
		}
		if ( ! empty( $op['heading_match'] ) ) {
			$needle = strtolower( trim( (string) $op['heading_match'] ) );
			foreach ( $sections as $sec ) {
				if ( $sec['heading_text'] === '(intro)' ) {
					continue;
				}
				if ( str_contains( strtolower( (string) $sec['heading_text'] ), $needle ) ) {
					return $sec;
				}
			}
		}
		return null;
	}
}
