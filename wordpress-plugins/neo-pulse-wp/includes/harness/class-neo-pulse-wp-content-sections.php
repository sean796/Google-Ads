<?php
/**
 * Split/join post content by H2 for harness diff and apply.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Content_Sections {

	/**
	 * Normalize for fuzzy H2 match.
	 */
	public static function normalize_title( string $title ): string {
		$t = strtolower( trim( wp_strip_all_tags( $title ) ) );
		$t = preg_replace( '/\s+/', ' ', $t );
		return is_string( $t ) ? $t : '';
	}

	/**
	 * @param string               $needle
	 * @param array<int,string> $haystack
	 */
	public static function fuzzy_match_index( string $needle, array $haystack ): int {
		$n = self::normalize_title( $needle );
		if ( $n === '' ) {
			return -1;
		}
		foreach ( $haystack as $i => $h ) {
			if ( self::normalize_title( $h ) === $n ) {
				return (int) $i;
			}
		}
		foreach ( $haystack as $i => $h ) {
			$hn = self::normalize_title( $h );
			if ( $hn !== '' && ( strpos( $hn, $n ) !== false || strpos( $n, $hn ) !== false ) ) {
				return (int) $i;
			}
		}
		return -1;
	}

	/**
	 * Split HTML into sections keyed by h2 index.
	 *
	 * @return array<int,array{title:string,html:string}>
	 */
	public static function split_html_by_h2( string $html ): array {
		$html = trim( $html );
		if ( $html === '' ) {
			return array();
		}
		if ( ! preg_match( '#<h2[^>]*>#i', $html ) ) {
			return array(
				array(
					'title' => '',
					'html'  => $html,
				),
			);
		}
		$parts = preg_split( '#(?=(?:<!--\s*wp:heading[^>]*-->\s*)?<h2[^>]*>)#i', $html );
		if ( ! is_array( $parts ) ) {
			return array();
		}
		$sections = array();
		$idx      = 0;
		foreach ( $parts as $part ) {
			$part = trim( (string) $part );
			if ( $part === '' ) {
				continue;
			}
			$title = '';
			if ( preg_match( '#<h2[^>]*>(.*?)</h2>#is', $part, $m ) ) {
				$title = trim( wp_strip_all_tags( $m[1] ) );
			}
			$sections[] = array(
				'title' => $title,
				'html'  => $part,
			);
			++$idx;
		}
		return $sections;
	}

	/**
	 * Replace one H2 section in full HTML.
	 *
	 * @param bool $strict When true, return unchanged HTML if section title is not matched.
	 */
	public static function replace_section_html( string $full_html, string $section_title, string $new_section_html, bool $strict = false ): string {
		$sections = self::split_html_by_h2( $full_html );
		if ( empty( $sections ) ) {
			return $new_section_html;
		}
		$titles = array_map(
			static function ( $s ) {
				return $s['title'];
			},
			$sections
		);
		$match  = self::fuzzy_match_index( $section_title, $titles );
		if ( $match < 0 ) {
			if ( $strict ) {
				return $full_html;
			}
			return trim( $full_html ) . "\n\n" . trim( $new_section_html );
		}
		$sections[ $match ]['html'] = trim( $new_section_html );
		return self::stitch_sections( $sections );
	}

	/**
	 * @param array<int,array{title:string,html:string}> $sections
	 */
	public static function stitch_sections( array $sections ): string {
		$pieces = array();
		foreach ( $sections as $s ) {
			$h = trim( (string) $s['html'] );
			if ( $h !== '' ) {
				$pieces[] = $h;
			}
		}
		return implode( "\n\n", $pieces );
	}

	/**
	 * Get HTML for one section from full post content.
	 */
	public static function extract_section_html( string $full_html, string $section_title ): string {
		$sections = self::split_html_by_h2( $full_html );
		$titles   = array_map(
			static function ( $s ) {
				return $s['title'];
			},
			$sections
		);
		$match    = self::fuzzy_match_index( $section_title, $titles );
		if ( $match < 0 ) {
			return '';
		}
		return (string) $sections[ $match ]['html'];
	}
}
