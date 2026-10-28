<?php
/**
 * Shared site inventory collection helpers (posts-list.js collectPublishedInventoryCollection).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Inventory_Collector {

	const INVENTORY_TIMEOUT = 120;

	/**
	 * @param string   $normalized Site URL.
	 * @param string   $username User.
	 * @param string   $app_password Password.
	 * @param string   $rest_collection Collection.
	 * @param bool     $include_content Include content.
	 * @param bool     $include_raw_acf Include raw ACF.
	 * @param bool     $include_page_heading Include H1.
	 * @param string   $wp_status WP status filter.
	 * @param int[]|null $include_ids Optional ID list.
	 * @param int|null $max_rows Row cap.
	 * @return array{ok:bool,rows?:array<int,array<string,mixed>>,error?:string,siteground?:bool,wpTotal?:int,truncated?:bool}
	 */
	public static function collect( $normalized, $username, $app_password, $rest_collection, $include_content, $include_raw_acf, $include_page_heading, $wp_status, $include_ids, $max_rows ) {
		$inventory = array();
		$page      = 1;
		$has_more  = true;
		$row_cap   = ( $max_rows !== null ) ? max( 0, (int) $max_rows ) : null;
		$wp_total  = null;
		$use_ids   = is_array( $include_ids ) && count( $include_ids ) > 0;
		$warm      = Neo_Pulse_App_Wp_Rest_Client::warm_origin_session( $normalized );
		$fields    = ( $include_content || $include_page_heading )
			? 'id,slug,title,link,neo_pulse_fields,content,excerpt,date_gmt,featured_media'
			: 'id,slug,title,link,neo_pulse_fields,excerpt,date_gmt,featured_media';

		while ( $has_more ) {
			$params = array(
				'status'   => $use_ids ? 'any' : $wp_status,
				'per_page' => $use_ids ? min( 100, count( $include_ids ) ) : 100,
				'page'     => $use_ids ? 1 : $page,
				'context'  => 'edit',
				'_fields'  => $fields,
			);
			if ( $use_ids ) {
				$params['include'] = implode( ',', $include_ids );
			}
			$resp = Neo_Pulse_App_Wp_Rest_Client::request(
				'GET',
				$normalized . '/wp-json/wp/v2/' . rawurlencode( $rest_collection ),
				$username,
				$app_password,
				array(
					'timeout' => self::INVENTORY_TIMEOUT,
					'referer' => $normalized . '/',
					'cookie'  => $warm['cookie'],
					'params'  => $params,
				)
			);
			if ( Neo_Pulse_App_Wp_Url_Normalize::rest_looks_like_siteground_captcha( (int) $resp['status'], $resp['body'] ) ) {
				return array( 'ok' => false, 'error' => Neo_Pulse_App_Wp_Url_Normalize::SITEGROUND_REST_BLOCKED_MESSAGE, 'siteground' => true );
			}
			$transport = Neo_Pulse_App_Wp_Rest_Client::transport_error_message( $resp );
			if ( $transport ) {
				return array( 'ok' => false, 'error' => $transport );
			}
			$extracted = self::extract_posts_array( $resp['body'], (int) $resp['status'] );
			if ( $extracted['rest_error'] ) {
				return array( 'ok' => false, 'error' => $extracted['rest_error'] );
			}
			if ( (int) $resp['status'] === 401 ) {
				return array( 'ok' => false, 'error' => 'Authentication failed.' );
			}
			if ( (int) $resp['status'] < 200 || (int) $resp['status'] >= 300 ) {
				return array( 'ok' => false, 'error' => 'WordPress API error: ' . (int) $resp['status'] );
			}
			$posts = $extracted['posts'];
			if ( ! $posts ) {
				break;
			}
			if ( $page === 1 ) {
				$wp_total = (int) ( $resp['headers']['x-wp-total'] ?? count( $posts ) );
			}
			foreach ( $posts as $post ) {
				$row = self::map_inventory_row( $post, $normalized, $include_content, $include_raw_acf, $include_page_heading, $rest_collection );
				if ( $row ) {
					$inventory[] = $row;
				}
				if ( $row_cap !== null && count( $inventory ) >= $row_cap ) {
					$has_more = false;
					break;
				}
			}
			if ( $use_ids ) {
				break;
			}
			$total_pages = (int) ( $resp['headers']['x-wp-totalpages'] ?? 1 );
			if ( $page >= $total_pages || count( $posts ) < 100 ) {
				$has_more = false;
			} else {
				++$page;
			}
		}

		return array(
			'ok'        => true,
			'rows'      => $inventory,
			'wpTotal'   => $wp_total,
			'truncated' => ( $row_cap !== null && count( $inventory ) >= $row_cap ),
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $a Rows.
	 * @param array<int,array<string,mixed>> $b Rows.
	 * @return array<int,array<string,mixed>>
	 */
	public static function merge_rows_by_id( $a, $b ) {
		$by_id = array();
		$no_id = array();
		foreach ( array_merge( $a, $b ) as $row ) {
			if ( ! empty( $row['id'] ) ) {
				$by_id[ (int) $row['id'] ] = $row;
			} else {
				$no_id[] = $row;
			}
		}
		return array_merge( array_values( $by_id ), $no_id );
	}

	/**
	 * @param array<int,array<string,mixed>> $rows Existing rows.
	 * @param array<int,array<string,mixed>> $future Future rows.
	 * @param string                         $coll Collection label.
	 * @return array<int,array<string,mixed>>
	 */
	public static function merge_rows_by_id_with_collection( $rows, $future, $coll ) {
		$by_id = array();
		foreach ( $rows as $row ) {
			if ( ( $row['collection'] ?? '' ) === $coll && ! empty( $row['id'] ) ) {
				$by_id[ (int) $row['id'] ] = true;
			}
		}
		foreach ( $future as $row ) {
			$id = (int) ( $row['id'] ?? 0 );
			if ( $id > 0 && empty( $by_id[ $id ] ) ) {
				$row['collection'] = $coll;
				$rows[]            = $row;
				$by_id[ $id ]      = true;
			}
		}
		return $rows;
	}

	/**
	 * @param mixed $data Response body.
	 * @param int   $http_status HTTP status.
	 * @return array{posts:array<int,array<string,mixed>>,rest_error:?string}
	 */
	private static function extract_posts_array( $data, $http_status ) {
		if ( is_array( $data ) && self::is_list( $data ) ) {
			return array( 'posts' => $data, 'rest_error' => null );
		}
		if ( is_array( $data ) && isset( $data['message'], $data['code'] ) ) {
			return array( 'posts' => array(), 'rest_error' => (string) $data['message'] );
		}
		if ( is_string( $data ) ) {
			$t = trim( $data );
			if ( $t === '' || $http_status === 202 ) {
				return array( 'posts' => array(), 'rest_error' => null );
			}
			$parsed = json_decode( $t, true );
			if ( is_array( $parsed ) && self::is_list( $parsed ) ) {
				return array( 'posts' => $parsed, 'rest_error' => null );
			}
			if ( $http_status === 202 ) {
				return array( 'posts' => array(), 'rest_error' => null );
			}
			return array( 'posts' => array(), 'rest_error' => 'WordPress returned a non-JSON body for the post list.' );
		}
		return array( 'posts' => array(), 'rest_error' => null );
	}

	/**
	 * @param array<mixed> $arr Array.
	 * @return bool
	 */
	private static function is_list( $arr ) {
		if ( ! is_array( $arr ) ) {
			return false;
		}
		return array_keys( $arr ) === range( 0, count( $arr ) - 1 );
	}

	/**
	 * @param array<string,mixed> $post WP post.
	 * @param string              $normalized Site URL.
	 * @param bool                $include_content Include content.
	 * @param bool                $include_raw_acf Include ACF.
	 * @param bool                $include_page_heading Include H1.
	 * @return array<string,mixed>|null
	 */
	private static function map_inventory_row( $post, $normalized, $include_content, $include_raw_acf, $include_page_heading, $rest_collection = 'posts' ) {
		$link = self::resolve_permalink( $post, $normalized );
		if ( $link === '' ) {
			return null;
		}
		$acf    = Neo_Pulse_App_Wp_Url_Normalize::rest_acf_from_post( $post );
		$acf    = is_array( $acf ) ? $acf : array();
		$title  = trim( wp_strip_all_tags( Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['title'] ?? '' ) ) );
		$fields = array(
			'title'   => $title,
			'meta'    => self::meta_from_acf( $acf ),
			'keyword' => self::keyword_aligned_to_title( self::keyword_from_acf( $acf ), $title, $rest_collection ),
		);
		$excerpt = trim( wp_strip_all_tags( Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['excerpt'] ?? '' ) ) );
		if ( $excerpt !== '' ) {
			$fields['excerpt'] = $excerpt;
		}
		$content_body = ( $include_content || $include_page_heading ) ? self::edit_raw_field( $post['content'] ?? null ) : '';
		if ( $include_page_heading && $content_body !== '' ) {
			$h1 = self::extract_h1( $content_body );
			if ( $h1 !== '' ) {
				$fields['pageHeading'] = $h1;
			}
		}
		if ( $include_content && $content_body !== '' ) {
			$fields['content'] = $content_body;
		}
		$row = array(
			'id'       => (int) ( $post['id'] ?? 0 ),
			'slug'     => (string) ( $post['slug'] ?? '' ),
			'date_gmt' => (string) ( $post['date_gmt'] ?? '' ),
			'url'      => $link,
			'status'   => sanitize_key( (string) ( $post['status'] ?? 'publish' ) ),
			'fields'   => $fields,
		);
		$fm = (int) ( $post['featured_media'] ?? 0 );
		if ( $fm > 0 ) {
			$row['featuredMediaId'] = $fm;
		}
		if ( ! empty( $post['neo_pulse_fields'] ) && is_array( $post['neo_pulse_fields'] ) ) {
			$row['neo_pulse_fields'] = $post['neo_pulse_fields'];
		}
		return $row;
	}

	/**
	 * @param array<string,mixed> $acf ACF fields.
	 * @return string
	 */
	private static function meta_from_acf( $acf ) {
		foreach ( array( 'meta_description', 'seo_meta_description' ) as $key ) {
			if ( ! empty( $acf[ $key ] ) ) {
				return trim( (string) $acf[ $key ] );
			}
		}
		return '';
	}

	/**
	 * @param array<string,mixed> $acf Merged ACF / plugin fields.
	 * @return string
	 */
	private static function keyword_from_acf( $acf ) {
		foreach ( array( 'keyword_focus', 'rank_math_focus_keyword', 'focus_keyword' ) as $key ) {
			if ( empty( $acf[ $key ] ) || ! is_string( $acf[ $key ] ) ) {
				continue;
			}
			$text  = trim( (string) $acf[ $key ] );
			$comma = strpos( $text, ',' );
			if ( $comma !== false ) {
				$text = trim( substr( $text, 0, $comma ) );
			}
			if ( $text !== '' ) {
				return $text;
			}
		}
		return '';
	}

	/**
	 * Blog posts: drop leftover Rank Math / ACF keywords that describe a different title.
	 *
	 * @param string $keyword Stored keyword.
	 * @param string $title   Post title.
	 * @param string $collection REST collection.
	 * @return string
	 */
	private static function keyword_aligned_to_title( $keyword, $title, $collection ) {
		$coll = strtolower( trim( (string) $collection ) );
		$is_blog = $coll === '' || $coll === 'post' || $coll === 'posts';
		if ( ! $is_blog || trim( $title ) === '' ) {
			return $keyword;
		}
		if ( $keyword !== '' && self::keyword_matches_title( $keyword, $title ) ) {
			return $keyword;
		}
		return self::infer_keyword_from_title( $title );
	}

	private static function keyword_matches_title( $keyword, $title ) {
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

	private static function infer_keyword_from_title( $title ) {
		$parts   = explode( '|', (string) $title );
		$primary = trim( $parts[0] ?? '' );
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
	private static function significant_tokens( $text ) {
		$norm = strtolower( trim( preg_replace( '/[^a-z0-9\s]/i', ' ', (string) $text ) ) );
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
	 * @param mixed $field Content field.
	 * @return string
	 */
	private static function edit_raw_field( $field ) {
		if ( is_string( $field ) ) {
			return $field;
		}
		if ( is_array( $field ) ) {
			$rendered = isset( $field['rendered'] ) ? (string) $field['rendered'] : '';
			$raw      = isset( $field['raw'] ) ? (string) $field['raw'] : '';
			if ( strlen( $rendered ) >= strlen( $raw ) && $rendered !== '' ) {
				return $rendered;
			}
			return $raw !== '' ? $raw : $rendered;
		}
		return '';
	}

	/**
	 * @param string $html HTML content.
	 * @return string
	 */
	private static function extract_h1( $html ) {
		if ( preg_match( '/<h1[^>]*class=["\'][^"\']*elementor-heading-title[^"\']*["\'][^>]*>([\s\S]*?)<\/h1>/i', $html, $m ) ) {
			$t = trim( wp_strip_all_tags( $m[1] ) );
			if ( $t !== '' ) {
				return $t;
			}
		}
		if ( preg_match( '/<h1[^>]*>([\s\S]*?)<\/h1>/i', $html, $m ) ) {
			return trim( wp_strip_all_tags( $m[1] ) );
		}
		return '';
	}

	/**
	 * @param array<string,mixed> $post Post.
	 * @param string              $normalized Site URL.
	 * @return string
	 */
	private static function resolve_permalink( $post, $normalized ) {
		$raw = isset( $post['link'] ) ? trim( (string) $post['link'] ) : '';
		if ( $raw !== '' && ! self::is_plain_or_pagination_url( $raw ) ) {
			return $raw;
		}
		$slug = isset( $post['slug'] ) ? trim( (string) $post['slug'] ) : '';
		if ( $slug !== '' ) {
			$from_slug = rtrim( $normalized, '/' ) . '/' . $slug . '/';
			if ( ! self::is_plain_or_pagination_url( $from_slug ) ) {
				return $from_slug;
			}
		}
		return '';
	}

	/**
	 * @param string $url URL.
	 * @return bool
	 */
	private static function is_plain_or_pagination_url( $url ) {
		$parsed = wp_parse_url( $url );
		if ( ! empty( $parsed['query'] ) ) {
			parse_str( $parsed['query'], $q );
			foreach ( array( 'p', 'paged', 'elementor_library', 'elementor-preview', 'elementor_library_id' ) as $key ) {
				if ( isset( $q[ $key ] ) ) {
					return true;
				}
			}
		}
		$path = strtolower( (string) ( $parsed['path'] ?? '' ) );
		if ( strpos( $path, '/elementor_library/' ) !== false || strpos( $path, '/elementor-snippet/' ) !== false ) {
			return true;
		}
		return (bool) preg_match( '#/page/\d+($|/)#', $path );
	}
}
