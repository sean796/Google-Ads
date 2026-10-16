<?php
/**
 * A page's translatable text as numbered segments (extract) and the write-back of
 * translated segments (apply). Builder-level code with no dependency on any
 * translation plugin: every write runs through the emcp_tools_page_text_around
 * filter, which a translation integration uses to wrap it (Polylang's sync guard).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
final class EMCP_Tools_Page_Text {

	/** SEO title and description keys of Yoast, Rank Math and SEOPress. */
	const SEO_KEYS = array( '_yoast_wpseo_title', '_yoast_wpseo_metadesc', 'rank_math_title', 'rank_math_description', '_seopress_titles_title', '_seopress_titles_desc' );

	const MAX_LIMIT = 200;

	/** @var EMCP_Tools_Page_Text_Elementor|null */
	private static $elementor = null;

	/** @var EMCP_Tools_Page_Text_Blocks|null */
	private static $blocks = null;

	public static function use_walkers( ?EMCP_Tools_Page_Text_Elementor $elementor, ?EMCP_Tools_Page_Text_Blocks $blocks ): void {
		self::$elementor = $elementor;
		self::$blocks    = $blocks;
	}

	private static function elementor(): EMCP_Tools_Page_Text_Elementor {
		return self::$elementor ? self::$elementor : new EMCP_Tools_Page_Text_Elementor();
	}

	private static function blocks(): EMCP_Tools_Page_Text_Blocks {
		return self::$blocks ? self::$blocks : new EMCP_Tools_Page_Text_Blocks();
	}

	/**
	 * Page-wide hash over every place a segment can come from, whatever the cursor.
	 * Elementor data and page settings are hashed decoded, so a re-encoding by
	 * Elementor's save is not a change.
	 */
	public static function hash( int $post_id ): string {
		clean_post_cache( $post_id );
		wp_cache_delete( $post_id, 'post_meta' );
		$post = get_post( $post_id );
		if ( ! $post ) {
			return '';
		}
		$raw  = (string) get_post_meta( $post_id, '_elementor_data', true );
		$data = '' === $raw ? null : json_decode( $raw, true );
		$seo  = array();
		foreach ( self::SEO_KEYS as $key ) {
			$seo[ $key ] = metadata_exists( 'post', $post_id, $key ) ? (string) get_post_meta( $post_id, $key, true ) : null;
		}
		$state = array(
			'title'          => (string) $post->post_title,
			'excerpt'        => (string) $post->post_excerpt,
			'content'        => (string) $post->post_content,
			'elementor_data' => null === $data && '' !== $raw ? $raw : $data,
			'page_settings'  => get_post_meta( $post_id, '_elementor_page_settings', true ),
			'seo'            => $seo,
		);
		return hash( 'sha256', (string) wp_json_encode( $state ) );
	}

	public static function builder( int $post_id ): string {
		$post = get_post( $post_id );
		if ( 'builder' === get_post_meta( $post_id, '_elementor_edit_mode', true ) && '' !== (string) get_post_meta( $post_id, '_elementor_data', true ) ) {
			return 'elementor';
		}
		return ( $post && has_blocks( (string) $post->post_content ) ) ? 'gutenberg' : 'other';
	}

	/** @return array{builder:string,segments:array,skipped:array}|WP_Error */
	private static function all( int $post_id ) {
		clean_post_cache( $post_id );
		wp_cache_delete( $post_id, 'post_meta' );
		$post = get_post( $post_id );
		if ( ! $post ) {
			return new WP_Error( 'not_found', __( 'This post does not exist.', 'emcp-tools' ) );
		}
		$segments = array();
		if ( '' !== trim( (string) $post->post_title ) ) {
			$segments[] = array( 'key' => 'post:title', 'kind' => 'text', 'text' => (string) $post->post_title, 'where' => 'Title' );
		}
		if ( '' !== trim( (string) $post->post_excerpt ) ) {
			$segments[] = array( 'key' => 'post:excerpt', 'kind' => 'text', 'text' => (string) $post->post_excerpt, 'where' => 'Excerpt' );
		}
		foreach ( self::SEO_KEYS as $key ) {
			$value = (string) get_post_meta( $post_id, $key, true );
			if ( '' !== trim( $value ) ) {
				$segments[] = array( 'key' => 'meta:' . $key, 'kind' => 'text', 'text' => $value, 'where' => 'SEO ' . $key );
			}
		}
		$builder = self::builder( $post_id );
		$skipped = array();
		if ( 'elementor' === $builder ) {
			$tree = json_decode( (string) get_post_meta( $post_id, '_elementor_data', true ), true );
			$out  = self::elementor()->segments( is_array( $tree ) ? $tree : array() );
		} elseif ( 'gutenberg' === $builder ) {
			$out = self::blocks()->segments( (string) $post->post_content );
		} else {
			$out = array( 'segments' => array(), 'skipped' => array( array( 'where' => 'content', 'reason' => 'unsupported_builder' ) ) );
		}
		return array(
			'builder'  => $builder,
			'segments' => array_merge( $segments, $out['segments'] ),
			'skipped'  => array_merge( $skipped, $out['skipped'] ),
		);
	}

	/** @return array|WP_Error */
	public static function extract( int $post_id, ?string $cursor, int $limit = self::MAX_LIMIT ) {
		$all = self::all( $post_id );
		if ( is_wp_error( $all ) ) {
			return $all;
		}
		$limit  = min( self::MAX_LIMIT, max( 1, $limit ) );
		$offset = 0;
		if ( null !== $cursor && '' !== $cursor ) {
			$decoded = base64_decode( $cursor, true ); // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions
			if ( false === $decoded || ! ctype_digit( $decoded ) ) {
				return new WP_Error( 'invalid_argument', __( 'The cursor is not one get-page-text returned.', 'emcp-tools' ) );
			}
			$offset = (int) $decoded;
		}
		$total = count( $all['segments'] );
		$next  = $offset + $limit < $total ? base64_encode( (string) ( $offset + $limit ) ) : null; // phpcs:ignore WordPress.PHP.DiscouragedPHPFunctions
		return array(
			'post_id'     => $post_id,
			'builder'     => $all['builder'],
			'hash'        => self::hash( $post_id ),
			'segments'    => array_slice( $all['segments'], $offset, $limit ),
			'total'       => $total,
			'next_cursor' => $next,
			'skipped'     => $all['skipped'],
		);
	}

	/** True for an http(s) URL with a host, a root-relative path, an #anchor, a mailto: or a tel: link. */
	public static function valid_url( string $url ): bool {
		if ( '' === $url || preg_match( '/[\s<>"]/', $url ) ) {
			return false;
		}
		if ( '#' === $url[0] || ( '/' === $url[0] && ( ! isset( $url[1] ) || '/' !== $url[1] ) ) ) {
			return true;
		}
		if ( preg_match( '/^(mailto|tel):\S+$/i', $url ) ) {
			return true;
		}
		$parts = wp_parse_url( $url );
		return is_array( $parts ) && in_array( strtolower( (string) ( $parts['scheme'] ?? '' ) ), array( 'http', 'https' ), true ) && '' !== (string) ( $parts['host'] ?? '' );
	}

	/**
	 * @param array $segments [{key, text, kind?}].
	 * @return array|WP_Error {post_id, applied, page_after_hash, change}
	 */
	public static function apply( int $post_id, string $based_on, array $segments, bool $force ) {
		$all = self::all( $post_id );
		if ( is_wp_error( $all ) ) {
			return $all;
		}
		$known  = array();
		foreach ( $all['segments'] as $s ) {
			$known[ $s['key'] ] = $s;
		}
		$values = array();
		$errors = array();
		foreach ( $segments as $i => $s ) {
			if ( ! is_array( $s ) || ! isset( $s['key'], $s['text'] ) || ! is_string( $s['key'] ) || ! is_scalar( $s['text'] ) ) {
				$errors[] = array( 'index' => $i, 'code' => 'invalid_segment' );
				continue;
			}
			$key = $s['key'];
			if ( array_key_exists( $key, $values ) ) {
				$errors[] = array( 'key' => $key, 'code' => 'duplicate_segment' );
				continue;
			}
			if ( ! isset( $known[ $key ] ) ) {
				$errors[] = array( 'key' => $key, 'code' => 'unknown_segment' );
				continue;
			}
			if ( isset( $s['kind'] ) && $s['kind'] !== $known[ $key ]['kind'] ) {
				$errors[] = array( 'key' => $key, 'code' => 'kind_changed' );
				continue;
			}
			$text = (string) $s['text'];
			if ( 'url' === $known[ $key ]['kind'] && ! self::valid_url( $text ) ) {
				$errors[] = array( 'key' => $key, 'code' => 'invalid_url' );
				continue;
			}
			$values[ $key ] = $text;
		}
		if ( $errors ) {
			return new WP_Error(
				$errors[0]['code'],
				__( 'Some segments are invalid, so nothing was written. errors lists each one.', 'emcp-tools' ),
				array( 'errors' => $errors )
			);
		}
		if ( ! $values ) {
			return new WP_Error( 'invalid_argument', __( 'Pass at least one segment.', 'emcp-tools' ) );
		}
		$unfiltered = current_user_can( 'unfiltered_html' );
		foreach ( $values as $key => $text ) {
			if ( 'url' === $known[ $key ]['kind'] ) {
				$values[ $key ] = esc_url_raw( $text );
			} elseif ( ! $unfiltered ) {
				$values[ $key ] = wp_kses_post( $text );
			}
		}

		$target = self::target( $post_id, $all['builder'], $values );
		$keys   = array_merge( array_keys( (array) ( $target['fields'] ?? array() ) ), array_keys( (array) ( $target['meta'] ?? array() ) ), array_key_exists( 'elementor_data', $target ) ? array( '_elementor_data' ) : array() );
		$write  = static function () use ( $post_id, $target, $based_on, $force ) {
			return EMCP_Tools_Page_Text_Writer::commit( $post_id, $target, $based_on, $force );
		};
		$result = call_user_func( apply_filters( 'emcp_tools_page_text_around', $write, $post_id, $keys ) );
		if ( is_wp_error( $result ) ) {
			// A sync leak whose write could not be reversed: the write stands, so it is recorded.
			$data = $result->get_error_data();
			if ( 'sync_leak' === $result->get_error_code() && is_array( $data ) && empty( $data['target_recovered'] ) && isset( $data['result']['before'], $data['result']['page_after_hash'] ) ) {
				/* translators: %d: post ID. */
				$data['change_id'] = EMCP_Tools_Page_Text_History::record( $post_id, (array) $data['result']['before'], (string) $data['result']['page_after_hash'], sprintf( __( 'Page text of post %d', 'emcp-tools' ), $post_id ) );
				unset( $data['result'] );
				return new WP_Error( 'sync_leak', $result->get_error_message(), $data );
			}
			if ( is_array( $data ) && isset( $data['result'] ) ) {
				unset( $data['result'] );
				return new WP_Error( $result->get_error_code(), $result->get_error_message(), $data );
			}
			return $result;
		}
		/* translators: %d: post ID. */
		$change = EMCP_Tools_Page_Text_History::record( $post_id, (array) $result['before'], (string) $result['page_after_hash'], sprintf( __( 'Page text of post %d', 'emcp-tools' ), $post_id ) );
		return array(
			'post_id'         => $post_id,
			'applied'         => count( $values ),
			'page_after_hash' => (string) $result['page_after_hash'],
			'change'          => array( 'change_id' => $change, 'undo' => array( 'available' => '' !== $change ) ),
		);
	}

	/** The parts a set of values changes. */
	private static function target( int $post_id, string $builder, array $values ): array {
		$target    = array();
		$elementor = array();
		$blocks    = array();
		foreach ( $values as $key => $text ) {
			if ( 'post:title' === $key ) {
				$target['fields']['post_title'] = $text;
			} elseif ( 'post:excerpt' === $key ) {
				$target['fields']['post_excerpt'] = $text;
			} elseif ( 0 === strpos( $key, 'meta:' ) ) {
				$target['meta'][ substr( $key, 5 ) ] = $text;
			} elseif ( 0 === strpos( $key, 'elementor:' ) ) {
				$elementor[ $key ] = $text;
			} elseif ( 0 === strpos( $key, 'block:' ) ) {
				$blocks[ $key ] = $text;
			}
		}
		if ( $elementor && 'elementor' === $builder ) {
			$tree                     = json_decode( (string) get_post_meta( $post_id, '_elementor_data', true ), true );
			$target['elementor_data'] = self::elementor()->apply( is_array( $tree ) ? $tree : array(), $elementor );
		}
		if ( $blocks && 'gutenberg' === $builder ) {
			$target['fields']['post_content'] = self::blocks()->apply( (string) get_post( $post_id )->post_content, $blocks );
		}
		return $target;
	}
}
