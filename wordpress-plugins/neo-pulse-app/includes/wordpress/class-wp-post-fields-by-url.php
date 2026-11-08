<?php
/**
 * ACF fetch by public URL (slug lookup).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Post_Fields_By_Url {

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_post_fields_by_url( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$url          = isset( $body['url'] ) ? (string) $body['url'] : '';

		if ( $site_url === '' || $username === '' || $app_password === '' || $url === '' ) {
			return array( 400, array( 'success' => false, 'error' => 'Missing required fields: siteUrl, username, appPassword, url' ) );
		}

		$include = ! isset( $body['includePostSnapshot'] ) || ( $body['includePostSnapshot'] !== false && $body['includePostSnapshot'] !== 'false' && $body['includePostSnapshot'] !== 0 );
		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		return array(
			200,
			self::fetch(
				$normalized,
				$username,
				$app_password,
				$url,
				isset( $body['postTypeEndpointHint'] ) ? $body['postTypeEndpointHint'] : null,
				$include
			),
		);
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_post_fields_by_url_batch( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$items        = isset( $body['items'] ) && is_array( $body['items'] ) ? $body['items'] : null;
		$batch_max    = Neo_Pulse_App_Wp_Post_Fields::BATCH_MAX;

		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return array( 400, array( 'error' => 'Missing required fields: siteUrl, username, appPassword' ) );
		}
		if ( ! is_array( $items ) || ! $items ) {
			return array( 400, array( 'error' => 'items must be a non-empty array' ) );
		}
		if ( count( $items ) > $batch_max ) {
			return array( 400, array( 'error' => 'items length must be <= ' . $batch_max ) );
		}

		$include    = ! isset( $body['includePostSnapshot'] ) || ( $body['includePostSnapshot'] !== false && $body['includePostSnapshot'] !== 'false' && $body['includePostSnapshot'] !== 0 );
		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$results    = array();
		foreach ( $items as $item ) {
			$item_url = is_array( $item ) && isset( $item['url'] ) ? $item['url'] : '';
			if ( ! is_string( $item_url ) || $item_url === '' ) {
				$results[] = array(
					'url'                  => is_string( $item_url ) ? $item_url : '',
					'success'              => false,
					'fields'               => array(),
					'postId'               => null,
					'postTypeEndpointUsed' => null,
					'error'                => 'missing or invalid url',
				);
				continue;
			}
			$hint      = is_array( $item ) && isset( $item['postTypeEndpointHint'] ) ? $item['postTypeEndpointHint'] : null;
			$payload   = self::fetch( $normalized, $username, $app_password, $item_url, $hint, $include );
			$results[] = array_merge( array( 'url' => $item_url ), $payload );
		}
		return array( 200, array( 'results' => $results ) );
	}

	/**
	 * @param string      $normalized Site URL.
	 * @param string      $username User.
	 * @param string      $app_password Password.
	 * @param string      $url Public URL.
	 * @param string|null $endpoint_hint REST collection hint.
	 * @param bool        $include_snapshot Include post snapshot.
	 * @return array<string,mixed>
	 */
	public static function fetch( $normalized, $username, $app_password, $url, $endpoint_hint, $include_snapshot ) {
		$slug = self::slug_from_url( $url );
		if ( $slug === '' ) {
			return array(
				'success'              => false,
				'fields'               => array(),
				'postId'               => null,
				'postTypeEndpointUsed' => null,
				'error'                => 'Could not extract slug from url',
			);
		}

		$endpoints = array();
		$hint      = self::normalize_endpoint_hint( $endpoint_hint );
		if ( $hint ) {
			$endpoints[] = $hint;
		}
		$endpoints[] = 'posts';
		$endpoints[] = 'pages';
		$endpoints   = array_values( array_unique( $endpoints ) );

		$found_id       = null;
		$found_endpoint = null;
		foreach ( $endpoints as $endpoint ) {
			$search_url = $normalized . '/wp-json/wp/v2/' . rawurlencode( $endpoint ) . '?slug=' . rawurlencode( $slug ) . '&per_page=1';
			$search_rs  = Neo_Pulse_App_Wp_Rest_Client::request( 'GET', $search_url, $username, $app_password, array( 'timeout' => 30 ) );
			if ( ! $search_rs['is_wp_error'] && (int) $search_rs['status'] === 200 && is_array( $search_rs['body'] ) && ! empty( $search_rs['body'][0]['id'] ) ) {
				$found_id       = (int) $search_rs['body'][0]['id'];
				$found_endpoint = $endpoint;
				break;
			}
		}

		if ( ! $found_id || ! $found_endpoint ) {
			return array(
				'success'              => false,
				'fields'               => array(),
				'postId'               => null,
				'postTypeEndpointUsed' => null,
				'error'                => sprintf( 'Post not found for slug "%s" on endpoints: %s', $slug, implode( ', ', $endpoints ) ),
			);
		}

		$get_url = $normalized . '/wp-json/wp/v2/' . rawurlencode( $found_endpoint ) . '/' . $found_id . '?context=edit';
		$resp    = Neo_Pulse_App_Wp_Rest_Client::request( 'GET', $get_url, $username, $app_password, array( 'timeout' => 30 ) );
		$fields  = array();
		$out     = array(
			'success'              => true,
			'fields'               => array(),
			'postId'               => $found_id,
			'postTypeEndpointUsed' => $found_endpoint,
		);

		if ( ! $resp['is_wp_error'] && (int) $resp['status'] === 200 && is_array( $resp['body'] ) ) {
			$d      = $resp['body'];
			$fields = isset( $d['acf'] ) && is_array( $d['acf'] ) ? $d['acf'] : array();
			if ( $include_snapshot ) {
				$subtype             = $found_endpoint === 'posts' ? 'post' : ( $found_endpoint === 'pages' ? 'page' : $found_endpoint );
				$out['postSnapshot'] = array(
					'id'               => (int) ( $d['id'] ?? $found_id ),
					'slug'             => (string) ( $d['slug'] ?? '' ),
					'title'            => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $d['title'] ?? null ),
					'content'          => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $d['content'] ?? null ),
					'excerpt'          => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $d['excerpt'] ?? null ),
					'date_gmt'         => (string) ( $d['date_gmt'] ?? ( $d['date'] ?? '' ) ),
					'status'           => (string) ( $d['status'] ?? 'publish' ),
					'link'             => (string) ( $d['link'] ?? ( $normalized . '/' . ( $d['slug'] ?? '' ) ) ),
					'postTypeEndpoint' => $found_endpoint,
					'postTypeSubtype'  => $subtype,
				);
			}
		}
		$out['fields'] = $fields;
		return $out;
	}

	/**
	 * @param string $url Public URL.
	 * @return string
	 */
	private static function slug_from_url( $url ) {
		$parsed = wp_parse_url( $url );
		if ( ! empty( $parsed['path'] ) ) {
			$segments = array_values( array_filter( explode( '/', $parsed['path'] ) ) );
			$slug     = end( $segments );
			return is_string( $slug ) ? trim( rawurldecode( $slug ) ) : '';
		}
		$segments = array_values( array_filter( explode( '/', (string) $url ) ) );
		$slug     = end( $segments );
		return is_string( $slug ) ? trim( rawurldecode( $slug ) ) : '';
	}

	/**
	 * @param mixed $hint Endpoint hint.
	 * @return string|null
	 */
	private static function normalize_endpoint_hint( $hint ) {
		if ( ! is_string( $hint ) ) {
			return null;
		}
		$h = trim( $hint );
		if ( $h === '' ) {
			return null;
		}
		if ( $h === 'post' ) {
			return 'posts';
		}
		if ( $h === 'page' ) {
			return 'pages';
		}
		return $h;
	}
}
