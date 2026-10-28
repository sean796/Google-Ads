<?php
/**
 * Single overview SEO item write helpers (bulk-overview-seo.js).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Overview_Seo_Item {

	const WRITE_TIMEOUT = 300;

	/**
	 * @param array<string,mixed> $item Normalized item.
	 * @return array<string,mixed>|null Core PUT body or null.
	 */
	public static function build_core_put_body( $item ) {
		$put = array();
		$acf = self::direct_acf_from_client( isset( $item['acf'] ) ? $item['acf'] : array() );
		if ( ! empty( $item['postTitle'] ) && is_string( $item['postTitle'] ) && trim( $item['postTitle'] ) !== '' ) {
			$title = self::aligned_title( trim( $item['postTitle'] ), $acf );
			$put['title'] = Neo_Pulse_App_Wp_Url_Normalize::clean_placeholders_and_markdown( $title );
		}
		if ( ! empty( $item['postExcerpt'] ) && is_string( $item['postExcerpt'] ) && trim( $item['postExcerpt'] ) !== '' ) {
			$put['excerpt'] = Neo_Pulse_App_Wp_Url_Normalize::clean_placeholders_and_markdown( trim( $item['postExcerpt'] ) );
		}
		if ( ! empty( $item['postContent'] ) && is_string( $item['postContent'] ) && trim( $item['postContent'] ) !== '' ) {
			$put['content'] = trim( $item['postContent'] );
		}
		if ( ! $put ) {
			return null;
		}
		return $put;
	}

	/**
	 * @param array<string,mixed> $item Item.
	 * @return bool
	 */
	public static function has_acf_payload( $item ) {
		return count( self::direct_acf_from_client( isset( $item['acf'] ) ? $item['acf'] : array() ) ) > 0;
	}

	/**
	 * @param mixed $acf Client ACF map.
	 * @return array<string,string>
	 */
	public static function direct_acf_from_client( $acf ) {
		$out = array();
		if ( ! is_array( $acf ) ) {
			return $out;
		}
		foreach ( $acf as $key => $value ) {
			if ( $value === null || $value === '' ) {
				continue;
			}
			$text = is_string( $value ) ? trim( $value ) : trim( (string) $value );
			if ( $text !== '' ) {
				$out[ (string) $key ] = $text;
			}
		}
		return $out;
	}

	/**
	 * One WordPress core batch/v1 sub-request (title, excerpt, content, acf).
	 *
	 * @param array<string,mixed> $item Normalized item.
	 * @return array{method:string,path:string,body:array<string,mixed>}|null
	 */
	public static function to_batch_v1_request( $item ) {
		$body = self::build_core_put_body( $item );
		if ( ! is_array( $body ) ) {
			$body = array();
		}
		$acf = self::direct_acf_from_client( isset( $item['acf'] ) ? $item['acf'] : ( isset( $item['neo_pulse_fields'] ) ? $item['neo_pulse_fields'] : array() ) );
		if ( $acf ) {
			$body['neo_pulse_fields'] = $acf;
		}
		if ( ! $body ) {
			return null;
		}
		$endpoint = Neo_Pulse_App_Wp_Url_Normalize::resolve_wp_v2_collection_endpoint(
			isset( $item['postTypeEndpoint'] ) ? $item['postTypeEndpoint'] : null,
			isset( $item['postType'] ) ? $item['postType'] : 'post'
		);
		return array(
			'method' => 'POST',
			'path'   => '/wp/v2/' . rawurlencode( $endpoint ) . '/' . (int) $item['postId'],
			'body'   => $body,
		);
	}

	/**
	 * @param string              $normalized Site URL.
	 * @param string              $username User.
	 * @param string              $app_password Password.
	 * @param array<string,mixed> $item Item.
	 * @return array<string,mixed> Result row.
	 */
	public static function write_core_via_direct_put( $normalized, $username, $app_password, $item ) {
		$body = self::build_core_put_body( $item );
		if ( ! $body ) {
			return array(
				'postId'     => $item['postId'],
				'index'      => $item['index'],
				'ok'         => false,
				'error'      => 'Nothing to update (empty title, excerpt, content)',
				'method'     => 'direct_put',
				'httpStatus' => null,
			);
		}
		$endpoint = Neo_Pulse_App_Wp_Url_Normalize::resolve_wp_v2_collection_endpoint(
			isset( $item['postTypeEndpoint'] ) ? $item['postTypeEndpoint'] : null,
			isset( $item['postType'] ) ? $item['postType'] : 'post'
		);
		$post_id = (int) $item['postId'];
		$url     = $normalized . '/wp-json/wp/v2/' . rawurlencode( $endpoint ) . '/' . $post_id;
		$resp    = Neo_Pulse_App_Wp_Rest_Client::request(
			'PUT',
			$url,
			$username,
			$app_password,
			array(
				'timeout' => self::WRITE_TIMEOUT,
				'body'    => $body,
			)
		);
		if ( $resp['is_wp_error'] || (int) $resp['status'] < 200 || (int) $resp['status'] >= 300 ) {
			return array(
				'postId'     => $post_id,
				'index'      => $item['index'],
				'ok'         => false,
				'error'      => self::wp_put_error_message( $resp ),
				'method'     => 'direct_put',
				'httpStatus' => (int) $resp['status'],
			);
		}
		return array(
			'postId'     => $post_id,
			'index'      => $item['index'],
			'ok'         => true,
			'method'     => 'direct_put',
			'httpStatus' => (int) $resp['status'],
		);
	}

	/**
	 * @param string              $normalized Site URL.
	 * @param string              $username User.
	 * @param string              $app_password Password.
	 * @param array<string,mixed> $item Item.
	 * @return array{ok:bool,error?:string,httpStatus?:int|null,skipped?:bool}
	 */
	public static function write_acf_via_post( $normalized, $username, $app_password, $item ) {
		$acf_payload = self::direct_acf_from_client( isset( $item['acf'] ) ? $item['acf'] : array() );
		if ( ! $acf_payload ) {
			return array( 'ok' => true, 'skipped' => true );
		}
		$pulse_sync = Neo_Pulse_App_Wp_Acf_Protocol::write_via_pulse_overview_bulk(
			$normalized,
			$username,
			$app_password,
			(int) $item['postId'],
			$acf_payload
		);
		$endpoint = Neo_Pulse_App_Wp_Url_Normalize::resolve_wp_v2_collection_endpoint(
			isset( $item['postTypeEndpoint'] ) ? $item['postTypeEndpoint'] : null,
			isset( $item['postType'] ) ? $item['postType'] : 'post'
		);
		$url  = $normalized . '/wp-json/wp/v2/' . rawurlencode( $endpoint ) . '/' . (int) $item['postId'];
		$resp = Neo_Pulse_App_Wp_Rest_Client::request(
			'POST',
			$url,
			$username,
			$app_password,
			array(
				'timeout' => self::WRITE_TIMEOUT,
				'body'    => array( 'neo_pulse_fields' => $acf_payload ),
			)
		);
		if ( $resp['is_wp_error'] ) {
			if ( ! empty( $pulse_sync['ok'] ) ) {
				return array( 'ok' => true, 'httpStatus' => 200 );
			}
			return array( 'ok' => false, 'error' => $resp['error'], 'httpStatus' => null );
		}
		$st = (int) $resp['status'];
		if ( $st < 200 || $st >= 300 ) {
			if ( ! empty( $pulse_sync['ok'] ) ) {
				return array( 'ok' => true, 'httpStatus' => 200 );
			}
			return array( 'ok' => false, 'error' => 'ACF write HTTP ' . $st, 'httpStatus' => $st );
		}
		return array( 'ok' => true, 'httpStatus' => $st );
	}

	/**
	 * @param string              $normalized Site URL.
	 * @param string              $username User.
	 * @param string              $app_password Password.
	 * @param array<string,mixed> $item Item.
	 * @param array<string,mixed> $core_row Core write result.
	 * @return array<string,mixed>
	 */
	public static function finalize_with_optional_acf( $normalized, $username, $app_password, $item, $core_row ) {
		if ( empty( $core_row['ok'] ) ) {
			return $core_row;
		}
		if ( ! self::has_acf_payload( $item ) ) {
			return $core_row;
		}
		$acf_result = self::write_acf_via_post( $normalized, $username, $app_password, $item );
		if ( empty( $acf_result['ok'] ) ) {
			return array_merge(
				$core_row,
				array(
					'ok'         => false,
					'error'      => isset( $acf_result['error'] ) ? $acf_result['error'] : 'ACF fields failed to save',
					'method'     => 'direct_put+acf_post',
					'httpStatus' => $acf_result['httpStatus'] ?? $core_row['httpStatus'],
				)
			);
		}
		$core_row['method'] = 'direct_put+acf_post';
		return $core_row;
	}

	/**
	 * @param array{status?:int,body?:mixed,is_wp_error?:bool,error?:string} $resp Response.
	 * @return string
	 */
	public static function wp_put_error_message( $resp ) {
		if ( ! empty( $resp['is_wp_error'] ) ) {
			return (string) $resp['error'];
		}
		$data = isset( $resp['body'] ) ? $resp['body'] : null;
		if ( Neo_Pulse_App_Wp_Url_Normalize::rest_looks_like_cloudflare_challenge( $data ) ) {
			return Neo_Pulse_App_Wp_Url_Normalize::CLOUDFLARE_REST_BLOCKED_MESSAGE;
		}
		if ( is_string( $data ) ) {
			$trim = trim( $data );
			if ( stripos( $trim, '<!doctype' ) === 0 || stripos( $trim, '<html' ) === 0 ) {
				return 'WordPress host returned HTML (HTTP ' . (int) ( $resp['status'] ?? 0 ) . ') instead of JSON.';
			}
			return substr( $trim, 0, 500 );
		}
		if ( is_array( $data ) ) {
			if ( ! empty( $data['message'] ) ) {
				return (string) $data['message'];
			}
			if ( ! empty( $data['code'] ) ) {
				return (string) $data['code'];
			}
		}
		return 'HTTP ' . (int) ( $resp['status'] ?? 0 );
	}

	/**
	 * Use SEO research title when the incoming post title is not about this row's keyword.
	 *
	 * @param array<string,string> $acf ACF map.
	 */
	public static function aligned_title( $candidate, $acf ) {
		$candidate = trim( (string) $candidate );
		$kw        = '';
		$raw       = '';
		if ( is_array( $acf ) ) {
			$kw  = trim( (string) ( $acf['keyword_focus'] ?? $acf['keyword_focu'] ?? '' ) );
			$raw = trim( (string) ( $acf['seo_research'] ?? '' ) );
		}
		$research_title = '';
		$primary        = '';
		if ( $raw !== '' ) {
			$decoded = json_decode( $raw, true );
			if ( is_array( $decoded ) ) {
				$research_title = trim( (string) ( $decoded['title'] ?? '' ) );
				$primary        = trim( (string) ( $decoded['primary_keyword'] ?? '' ) );
			}
		}
		$focus = $kw !== '' ? $kw : $primary;
		if ( $focus === '' ) {
			return $candidate;
		}
		if ( $candidate !== '' && self::title_covers_keyword( $candidate, $focus ) ) {
			return $candidate;
		}
		if ( $research_title !== '' && self::title_covers_keyword( $research_title, $focus ) ) {
			return $research_title;
		}
		return $candidate;
	}

	public static function title_covers_keyword( $title, $keyword ) {
		$tokens = self::keyword_content_tokens( (string) $keyword );
		if ( $tokens === array() ) {
			return true;
		}
		$hay = strtolower( (string) $title );
		foreach ( $tokens as $w ) {
			if ( strpos( $hay, $w ) === false ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * @return array<int,string>
	 */
	private static function keyword_content_tokens( $phrase ) {
		$stop  = array( 'a' => true, 'an' => true, 'and' => true, 'for' => true, 'how' => true, 'in' => true, 'is' => true, 'of' => true, 'on' => true, 'or' => true, 'the' => true, 'to' => true, 'what' => true, 'why' => true );
		$parts = preg_split( '/\s+/', strtolower( (string) $phrase ) );
		if ( ! is_array( $parts ) ) {
			return array();
		}
		$out = array();
		foreach ( $parts as $w ) {
			$w = preg_replace( '/[^a-z0-9]+/', '', $w );
			if ( ! is_string( $w ) || strlen( $w ) < 2 || isset( $stop[ $w ] ) ) {
				continue;
			}
			$out[] = $w;
		}
		return $out;
	}
}
