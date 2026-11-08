<?php
/**
 * WordPress URL / REST helpers (ported from server/wordpress/utils.js).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Url_Normalize {

	const SITEGROUND_REST_BLOCKED_MESSAGE =
		'SiteGround security blocked the WordPress REST API (sgcaptcha). In Site Tools, allowlist the IP of the machine running NEO Pulse, or relax bot protection for /wp-json/. Headers alone cannot bypass this.';

	const CLOUDFLARE_REST_BLOCKED_MESSAGE =
		'Cloudflare blocked the WordPress REST API (challenge or Attention Required page), not a WordPress error. In Cloudflare → Security → WAF (or Rules), allow or skip challenge for /wp-json/* (and /wp-json/batch/v1), or whitelist the IP of the machine running NEO Pulse.';

	/**
	 * @param string $site_url Raw site URL.
	 * @return string
	 */
	public static function normalize_url( $site_url ) {
		$normalized = trim( (string) $site_url );
		if ( $normalized === '' ) {
			return '';
		}
		if ( ! preg_match( '#^https?://#i', $normalized ) ) {
			$normalized = 'https://' . $normalized;
		}
		return rtrim( $normalized, '/' );
	}

	/**
	 * @param mixed $post_id Post ID from JSON body.
	 * @return int|null
	 */
	public static function normalize_post_id( $post_id ) {
		if ( $post_id === null || $post_id === '' ) {
			return null;
		}
		if ( is_int( $post_id ) && $post_id > 0 ) {
			return $post_id;
		}
		if ( is_float( $post_id ) && (int) $post_id === $post_id && $post_id > 0 ) {
			return (int) $post_id;
		}
		$parsed = (int) trim( (string) $post_id );
		if ( $parsed <= 0 ) {
			return null;
		}
		return $parsed;
	}

	/**
	 * @param string|null $post_type Post type slug.
	 * @return string REST collection name.
	 */
	public static function get_rest_endpoint( $post_type = 'post' ) {
		$map = array(
			'post'  => 'posts',
			'page'  => 'pages',
			'posts' => 'posts',
			'pages' => 'pages',
		);
		$key            = strtolower( (string) ( $post_type ?: 'post' ) );
		$endpoint_name  = isset( $map[ $key ] ) ? $map[ $key ] : (string) $post_type;
		return ( $endpoint_name === 'post' ) ? 'posts' : $endpoint_name;
	}

	/**
	 * @param string $url_str URL or path.
	 * @return string
	 */
	public static function extract_slug( $url_str ) {
		$url_str = (string) $url_str;
		$parsed  = wp_parse_url( $url_str );
		if ( ! empty( $parsed['path'] ) ) {
			$pathname = rtrim( $parsed['path'], '/' );
			$parts    = explode( '/', $pathname );
			$slug     = end( $parts );
			if ( is_string( $slug ) ) {
				return preg_replace( '/\.(html?|php)$/i', '', $slug );
			}
		}
		$parts = explode( '/', rtrim( $url_str, '/' ) );
		$last  = end( $parts );
		return is_string( $last ) ? preg_replace( '/\.(html?|php)$/i', '', $last ) : '';
	}

	/**
	 * @param mixed $data Response body.
	 * @return string
	 */
	public static function body_to_probe_text( $data ) {
		if ( $data === null ) {
			return '';
		}
		if ( is_string( $data ) ) {
			return $data;
		}
		if ( is_array( $data ) && isset( $data['message'] ) && is_string( $data['message'] ) ) {
			return $data['message'];
		}
		$json = wp_json_encode( $data );
		return is_string( $json ) ? $json : (string) $data;
	}

	/**
	 * @param mixed $data Response body.
	 * @return bool
	 */
	public static function rest_looks_like_cloudflare_challenge( $data ) {
		$raw   = self::body_to_probe_text( $data );
		$lower = strtolower( $raw );
		if ( $lower === '' ) {
			return false;
		}
		if ( strpos( $lower, 'attention required' ) !== false && strpos( $lower, 'cloudflare' ) !== false ) {
			return true;
		}
		if ( strpos( $lower, 'just a moment' ) !== false && strpos( $lower, 'cloudflare' ) !== false ) {
			return true;
		}
		$needles = array( '_cf_chl_opt', 'cf-browser-verification', 'cdn-cgi/challenge' );
		foreach ( $needles as $needle ) {
			if ( strpos( $lower, $needle ) !== false ) {
				return true;
			}
		}
		if ( strpos( $lower, 'cloudflare' ) !== false && ( strpos( $lower, 'challenge' ) !== false || strpos( $lower, 'cf-error' ) !== false ) ) {
			return true;
		}
		return false;
	}

	/**
	 * @param int   $status HTTP status.
	 * @param mixed $data   Response body.
	 * @return bool
	 */
	public static function rest_looks_like_siteground_captcha( $status, $data ) {
		if ( (int) $status !== 202 ) {
			return false;
		}
		return is_string( $data ) && strpos( $data, 'sgcaptcha' ) !== false;
	}

	/**
	 * @param string|null $entity_sitemap_url Entity sitemap URL.
	 * @return string|null
	 */
	public static function endpoint_from_entity_sitemap_url( $entity_sitemap_url ) {
		if ( ! $entity_sitemap_url || trim( (string) $entity_sitemap_url ) === '' ) {
			return null;
		}
		$parts    = explode( '/', (string) $entity_sitemap_url );
		$filename = end( $parts );
		$endpoint = preg_replace( '/-sitemap\.xml$/i', '', (string) $filename );
		return ( $endpoint !== '' ) ? $endpoint : null;
	}

	/**
	 * REST collection for entity/SAP counts (manual endpoint or entity sitemap URL).
	 *
	 * @param string|null $manual_endpoint    Explicit wp/v2 collection.
	 * @param string|null $entity_sitemap_url Entity sitemap URL.
	 * @return string|null
	 */
	public static function resolve_secondary_rest_collection( $manual_endpoint, $entity_sitemap_url ) {
		$generic = array( 'posts', 'post', 'pages', 'page' );
		$manual  = is_string( $manual_endpoint ) ? trim( $manual_endpoint ) : '';
		$candidate = '';
		if ( $manual !== '' ) {
			$candidate = trim( $manual, '/' );
		} elseif ( is_string( $entity_sitemap_url ) && trim( $entity_sitemap_url ) !== '' ) {
			$parts    = explode( '/', trim( $entity_sitemap_url ) );
			$filename = end( $parts );
			$lower    = strtolower( (string) $filename );
			if ( substr( $lower, -strlen( '-sitemap.xml' ) ) === '-sitemap.xml' ) {
				$candidate = substr( $filename, 0, -strlen( '-sitemap.xml' ) );
			} elseif ( substr( $lower, -strlen( '_sitemap.xml' ) ) === '_sitemap.xml' ) {
				$candidate = substr( $filename, 0, -strlen( '_sitemap.xml' ) );
			} elseif ( substr( $lower, -4 ) === '.xml' ) {
				$candidate = substr( $filename, 0, -4 );
			} else {
				$candidate = (string) $filename;
			}
			$candidate = trim( $candidate );
		}
		if ( $candidate === '' ) {
			return null;
		}
		if ( in_array( strtolower( $candidate ), $generic, true ) ) {
			return null;
		}
		return $candidate;
	}

	/**
	 * Resolve wp/v2 collection (posts/pages/CPT).
	 *
	 * @param string|null $post_type_endpoint Explicit endpoint.
	 * @param string|null $post_type          Post type slug.
	 * @return string
	 */
	public static function resolve_wp_v2_collection_endpoint( $post_type_endpoint, $post_type = 'post' ) {
		$name = $post_type_endpoint ? (string) $post_type_endpoint : self::get_rest_endpoint( $post_type );
		if ( $name === 'page' ) {
			return 'pages';
		}
		if ( $name === 'post' ) {
			return 'posts';
		}
		return $name;
	}

	/**
	 * Strip bracket placeholders (not markdown links) from content before WP writes.
	 *
	 * @param mixed $str Input string.
	 * @return mixed
	 */
	public static function clean_placeholders_and_markdown( $str ) {
		if ( $str === null || ! is_string( $str ) || $str === '' ) {
			return $str;
		}
		$out = preg_replace( '/\[[^\]]+\](?!\s*\()/u', ' ', $str );
		$out = preg_replace( '/[ \t]{2,}/', ' ', $out );
		$out = preg_replace( '/\n{3,}/', "\n\n", $out );
		return trim( $out );
	}

	/**
	 * @param mixed $field WP REST title/content/excerpt field.
	 * @return string
	 */
	public static function rendered_text( $field ) {
		if ( $field === null ) {
			return '';
		}
		if ( is_string( $field ) ) {
			return $field;
		}
		if ( is_array( $field ) && isset( $field['rendered'] ) && is_string( $field['rendered'] ) ) {
			return $field['rendered'];
		}
		return '';
	}

	/**
	 * @param array<string,mixed>|object|null $post Post payload.
	 * @return array<string,mixed>|null
	 */
	public static function rest_post_fields_from_post( $post ) {
		if ( ! is_array( $post ) ) {
			return null;
		}
		if ( ! array_key_exists( 'neo_pulse_fields', $post ) ) {
			return null;
		}
		$plugin = is_array( $post['neo_pulse_fields'] ) ? $post['neo_pulse_fields'] : array();
		return $plugin !== array() ? $plugin : null;
	}

	/**
	 * Plugin fields win when they have a non-empty value (NEO Pulse redirect / NEO Pulse over stale ACF).
	 *
	 * @param array<string,mixed> $acf    Native ACF object.
	 * @param array<string,mixed> $plugin neo_pulse_fields object.
	 * @return array<string,mixed>
	 */
	public static function merge_rest_field_objects( $acf, $plugin ) {
		$merged = is_array( $acf ) ? $acf : array();
		if ( ! is_array( $plugin ) ) {
			return $merged;
		}
		foreach ( $plugin as $key => $value ) {
			$plugin_text   = ( is_string( $value ) || is_numeric( $value ) ) ? trim( (string) $value ) : '';
			$existing      = $merged[ $key ] ?? null;
			$existing_text = ( is_string( $existing ) || is_numeric( $existing ) ) ? trim( (string) $existing ) : '';
			if ( $plugin_text !== '' || $existing_text === '' ) {
				$merged[ $key ] = $value;
			}
		}
		return $merged;
	}
}
