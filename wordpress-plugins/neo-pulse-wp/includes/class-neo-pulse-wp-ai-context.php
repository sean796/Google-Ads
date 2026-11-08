<?php
/**
 * Post context + field reads for AI wands.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Ai_Context {

	/**
	 * @return array<string,string>
	 */
	public static function read_context( int $post_id ): array {
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return array(
				'title'       => '',
				'excerpt'     => '',
				'focusKeyword' => '',
				'faq'         => '',
				'seoResearch' => '',
				'pageUrl'     => '',
				'url'         => '',
			);
		}

		$url = get_permalink( $post ) ?: '';

		return array(
			'title'        => get_the_title( $post ),
			'excerpt'      => self::read_excerpt( $post ),
			'focusKeyword' => self::read_focus_keyword( $post_id ),
			'faq'          => self::read_post_field_or_meta( $post_id, array( 'faq', 'seo_faq' ) ),
			'seoResearch'  => self::read_post_field_or_meta( $post_id, array( 'seo_research' ) ),
			'pageUrl'      => self::read_post_field_or_meta( $post_id, array( 'page_url' ) ),
			'url'          => is_string( $url ) ? $url : '',
		);
	}

	public static function read_excerpt( WP_Post $post ): string {
		$excerpt = $post->post_excerpt;
		return is_string( $excerpt ) ? trim( $excerpt ) : '';
	}

	public static function read_seo_title( int $post_id ): string {
		$rm = get_post_meta( $post_id, 'neo_pulse_seo_title', true );
		if ( is_string( $rm ) && trim( $rm ) !== '' ) {
			return trim( $rm );
		}
		$post = get_post( $post_id );
		return $post instanceof WP_Post ? get_the_title( $post ) : '';
	}

	public static function read_meta_description( int $post_id ): string {
		$rm = get_post_meta( $post_id, 'neo_pulse_seo_description', true );
		if ( is_string( $rm ) && trim( $rm ) !== '' ) {
			return trim( $rm );
		}
		$post = get_post( $post_id );
		return $post instanceof WP_Post ? self::read_excerpt( $post ) : '';
	}

	/**
	 * @return array<string,string>
	 */
	public static function meta_hub_values( int $post_id ): array {
		$page_url = self::read_post_field_or_meta( $post_id, array( 'page_url' ) );
		if ( $page_url === '' ) {
			$link = get_permalink( $post_id );
			$page_url = is_string( $link ) ? $link : '';
		}

		return array(
			'seoTitle'        => self::read_seo_title( $post_id ),
			'metaDescription' => self::read_meta_description( $post_id ),
			'focusKeyword'    => self::read_focus_keyword( $post_id ),
			'seoResearch'     => self::read_post_field_or_meta( $post_id, array( 'seo_research' ) ),
			'faq'             => self::read_post_field_or_meta( $post_id, array( 'faq', 'seo_faq' ) ),
			'pageUrl'         => $page_url,
		);
	}

	public static function read_focus_keyword( int $post_id ): string {
		$candidates = array(
			self::primary_focus_phrase( get_post_meta( $post_id, 'neo_pulse_seo_focus_keyword', true ) ),
			self::primary_focus_phrase( get_post_meta( $post_id, '_neo_pulse_focus_keyword', true ) ),
			self::read_post_field_or_meta( $post_id, array( 'keyword_focus' ) ),
		);
		$post  = get_post( $post_id );
		$title = $post instanceof WP_Post ? trim( (string) $post->post_title ) : '';
		$is_blog = $post instanceof WP_Post && $post->post_type === 'post';

		if ( $is_blog && $title !== '' ) {
			foreach ( $candidates as $candidate ) {
				if ( $candidate !== '' && self::keyword_matches_title( $candidate, $title ) ) {
					return $candidate;
				}
			}
			return self::infer_keyword_from_title( $title );
		}

		foreach ( $candidates as $candidate ) {
			if ( $candidate !== '' ) {
				return $candidate;
			}
		}
		return $title !== '' ? self::infer_keyword_from_title( $title ) : '';
	}

	public static function keyword_matches_title( string $keyword, string $title ): bool {
		$kw  = self::significant_tokens( $keyword );
		$hay = self::significant_tokens( $title );
		if ( ! $kw || ! $hay ) {
			return false;
		}
		$hay_set = array_fill_keys( $hay, true );
		$hits    = 0;
		foreach ( $kw as $token ) {
			if ( isset( $hay_set[ $token ] ) ) {
				++$hits;
			}
		}
		return $hits === count( $kw ) || $hits >= 2;
	}

	public static function infer_keyword_from_title( string $title ): string {
		$primary = trim( explode( '|', $title )[0] ?? '' );
		if ( $primary === '' ) {
			return '';
		}
		$colon = strpos( $primary, ':' );
		$base  = ( $colon !== false && $colon >= 8 ) ? trim( substr( $primary, 0, $colon ) ) : $primary;
		$base  = rtrim( $base, '?' );
		return strtolower( trim( preg_replace( '/\s+/', ' ', $base ) ) );
	}

	/**
	 * @return array<int,string>
	 */
	private static function significant_tokens( string $text ): array {
		$norm = strtolower( trim( preg_replace( '/[^a-z0-9\s]/i', ' ', $text ) ) );
		$norm = trim( preg_replace( '/\s+/', ' ', $norm ) );
		if ( $norm === '' ) {
			return array();
		}
		$stop = array(
			'a' => true, 'an' => true, 'the' => true, 'and' => true, 'or' => true, 'for' => true,
			'to' => true, 'of' => true, 'in' => true, 'on' => true, 'how' => true, 'it' => true,
			'its' => true, 'is' => true, 'does' => true, 'do' => true, 'what' => true, 'with' => true,
			'your' => true, 'which' => true,
		);
		$out = array();
		foreach ( explode( ' ', $norm ) as $token ) {
			if ( strlen( $token ) > 1 && empty( $stop[ $token ] ) ) {
				$out[] = $token;
			}
		}
		return $out;
	}

	/**
	 * NEO Pulse redirect stores "primary, secondary". Use the primary phrase only.
	 *
	 * @param mixed $raw Meta value.
	 */
	public static function primary_focus_phrase( $raw ): string {
		if ( ! is_string( $raw ) ) {
			return '';
		}
		$text = trim( $raw );
		if ( $text === '' ) {
			return '';
		}
		$comma = strpos( $text, ',' );
		if ( $comma !== false ) {
			$text = trim( substr( $text, 0, $comma ) );
		}
		return $text;
	}

	/**
	 * @param array<int,string> $keys
	 */
	public static function read_post_field_or_meta( int $post_id, array $keys ): string {
		foreach ( $keys as $key ) {
			if ( function_exists( 'get_field' ) ) {
				$acf = get_field( $key, $post_id, false );
				if ( is_string( $acf ) || is_numeric( $acf ) ) {
					$text = trim( (string) $acf );
					if ( $text !== '' ) {
						return $text;
					}
				}
			}
			$meta = get_post_meta( $post_id, $key, true );
			if ( is_string( $meta ) && trim( $meta ) !== '' ) {
				return trim( $meta );
			}
		}
		return '';
	}

	public static function read_field_value( int $post_id, string $field ): string {
		switch ( $field ) {
			case 'title':
				$post = get_post( $post_id );
				return $post instanceof WP_Post ? self::read_seo_title( $post_id ) : '';
			case 'excerpt':
				return self::read_meta_description( $post_id );
			case 'focus_keyword':
				return self::read_focus_keyword( $post_id );
			case 'seo_research':
				return self::read_post_field_or_meta( $post_id, array( 'seo_research' ) );
			case 'faq':
				return self::read_post_field_or_meta( $post_id, array( 'faq', 'seo_faq' ) );
			case 'page_url':
				$val = self::read_post_field_or_meta( $post_id, array( 'page_url' ) );
				if ( $val !== '' ) {
					return $val;
				}
				$url = get_permalink( $post_id );
				return is_string( $url ) ? $url : '';
			default:
				return '';
		}
	}

	/**
	 * @param array<int,string> $keys
	 */
	public static function resolve_write_key( int $post_id, array $keys ): string {
		foreach ( $keys as $key ) {
			if ( function_exists( 'get_field_object' ) ) {
				$obj = get_field_object( $key, $post_id, false, false );
				if ( is_array( $obj ) && ! empty( $obj['key'] ) ) {
					return $key;
				}
			}
			$meta = get_post_meta( $post_id, $key, true );
			if ( $meta !== '' && $meta !== false ) {
				return $key;
			}
		}
		return $keys[0];
	}
}
