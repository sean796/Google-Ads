<?php
/**
 * WordPress post CRUD (create, update, delete).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Post_Crud {

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function create_post( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$title        = isset( $body['title'] ) ? (string) $body['title'] : '';
		$content      = isset( $body['content'] ) ? (string) $body['content'] : '';

		if ( $site_url === '' || $username === '' || $app_password === '' || $title === '' || $content === '' ) {
			return array( 400, array( 'success' => false, 'error' => 'Missing required fields: siteUrl, username, appPassword, title, content' ) );
		}

		$normalized   = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$post_slug_ep = ! empty( $body['postTypeEndpoint'] ) ? (string) $body['postTypeEndpoint'] : 'posts';
		$api_url      = $normalized . '/wp-json/wp/v2/' . rawurlencode( $post_slug_ep );

		$post_data = array(
			'title'   => $title,
			'content' => $content,
			'status'  => isset( $body['status'] ) ? (string) $body['status'] : 'draft',
		);

		$slug = isset( $body['slug'] ) ? (string) $body['slug'] : '';
		$slug = self::normalize_slug( $slug );
		if ( $slug !== '' ) {
			$post_data['slug'] = $slug;
			$existing = self::find_post_by_slug( $normalized, $username, $app_password, $post_slug_ep, $slug );
			if ( $existing ) {
				$body['postId']            = (int) $existing['id'];
				$body['postTypeEndpoint']  = $post_slug_ep;
				$body['slug']              = $slug;
				return self::update_post( $body );
			}
		}

		if ( ! empty( $body['excerpt'] ) ) {
			$post_data['excerpt'] = (string) $body['excerpt'];
		}

		$status = $post_data['status'];
		if ( ! empty( $body['date_gmt'] ) && $status !== 'draft' ) {
			$post_data['date_gmt'] = (string) $body['date_gmt'];
			if ( strtotime( $post_data['date_gmt'] . ' UTC' ) > time() ) {
				$post_data['status'] = 'future';
			}
		}

		if ( ! empty( $body['featuredImageId'] ) ) {
			$post_data['featured_media'] = (int) $body['featuredImageId'];
		}
		if ( ! empty( $body['categories'] ) && is_array( $body['categories'] ) ) {
			$post_data['categories'] = array_map( 'intval', $body['categories'] );
		}
		if ( ! empty( $body['tags'] ) && is_array( $body['tags'] ) ) {
			$post_data['tags'] = array_map( 'intval', $body['tags'] );
		}
		if ( isset( $body['author'] ) ) {
			$author_id = is_array( $body['author'] ) && isset( $body['author']['id'] ) ? (int) $body['author']['id'] : (int) $body['author'];
			if ( $author_id > 0 ) {
				$post_data['author'] = $author_id;
			}
		}

		$timeout = self::write_timeout_ms( $content );
		$resp    = self::request_with_transient_retry(
			'POST',
			$api_url,
			$username,
			$app_password,
			$post_data,
			$timeout
		);

		return self::map_write_response( $resp, $title, $post_slug_ep, $api_url, $slug );
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function update_post( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$post_id      = Neo_Pulse_App_Wp_Url_Normalize::normalize_post_id( isset( $body['postId'] ) ? $body['postId'] : null );
		$title        = isset( $body['title'] ) ? (string) $body['title'] : '';
		$content      = isset( $body['content'] ) ? (string) $body['content'] : '';
		$post_type    = isset( $body['postType'] ) ? (string) $body['postType'] : 'post';

		if ( $site_url === '' || $username === '' || $app_password === '' || $post_id === null || $title === '' || $content === '' ) {
			return array( 400, array( 'success' => false, 'error' => 'Missing required fields for update' ) );
		}

		if ( ! empty( $body['existingPost'] ) && is_array( $body['existingPost'] ) ) {
			$existing = $body['existingPost'];
			if ( ! empty( $existing['parent'] ) && (int) $existing['parent'] > 0 ) {
				return array( 200, array( 'success' => false, 'error' => 'Cannot update revision. Use canonical post ID.' ) );
			}
			if ( ( $existing['type'] ?? '' ) === 'revision' || ( $existing['post_type'] ?? '' ) === 'revision' ) {
				return array( 200, array( 'success' => false, 'error' => 'Cannot update revision.' ) );
			}
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$endpoint   = ! empty( $body['postTypeEndpoint'] )
			? Neo_Pulse_App_Wp_Url_Normalize::resolve_wp_v2_collection_endpoint( $body['postTypeEndpoint'], $post_type )
			: Neo_Pulse_App_Wp_Url_Normalize::resolve_wp_v2_collection_endpoint( null, $post_type );
		$api_url    = $normalized . '/wp-json/wp/v2/' . rawurlencode( $endpoint ) . '/' . $post_id;

		$post_data = array(
			'title'   => Neo_Pulse_App_Wp_Url_Normalize::clean_placeholders_and_markdown( $title ),
			'content' => Neo_Pulse_App_Wp_Url_Normalize::clean_placeholders_and_markdown( $content ),
		);
		if ( ! empty( $body['excerpt'] ) ) {
			$post_data['excerpt'] = Neo_Pulse_App_Wp_Url_Normalize::clean_placeholders_and_markdown( (string) $body['excerpt'] );
		}
		if ( ! empty( $body['status'] ) ) {
			$post_data['status'] = (string) $body['status'];
		}
		if ( array_key_exists( 'featuredImageId', $body ) ) {
			$post_data['featured_media'] = (int) $body['featuredImageId'];
		}
		if ( array_key_exists( 'categories', $body ) ) {
			$post_data['categories'] = is_array( $body['categories'] ) ? array_map( 'intval', $body['categories'] ) : array();
		}
		if ( array_key_exists( 'tags', $body ) ) {
			$post_data['tags'] = is_array( $body['tags'] ) ? array_map( 'intval', $body['tags'] ) : array();
		}
		if ( array_key_exists( 'slug', $body ) ) {
			$post_data['slug'] = (string) $body['slug'];
		}
		if ( ! empty( $body['date_gmt'] ) ) {
			$post_data['date_gmt'] = (string) $body['date_gmt'];
			if ( strtotime( $post_data['date_gmt'] . ' UTC' ) > time() ) {
				$post_data['status'] = 'future';
			}
		}

		$timeout = self::write_timeout_ms( $post_data['content'] );
		$resp    = self::request_with_transient_retry(
			'PUT',
			$api_url,
			$username,
			$app_password,
			$post_data,
			$timeout
		);

		if ( $resp['is_wp_error'] ) {
			$transport = Neo_Pulse_App_Wp_Rest_Client::transport_error_message( $resp );
			return array( 200, array( 'success' => false, 'error' => $transport ? $transport : $resp['error'] ) );
		}

		$status = (int) $resp['status'];
		if ( $status === 200 && is_array( $resp['body'] ) ) {
			$post = $resp['body'];
			$link = (string) ( $post['link'] ?? '' );
			$got  = isset( $post['slug'] ) ? self::normalize_slug( (string) $post['slug'] ) : '';
			if ( $got === '' && $link !== '' ) {
				$got = self::normalize_slug( Neo_Pulse_App_Wp_Url_Normalize::extract_slug( $link ) );
			}
			$wanted = isset( $body['slug'] ) ? self::normalize_slug( (string) $body['slug'] ) : '';
			$clone  = self::numbered_slug_clone_error( $wanted, $got, $link, isset( $post['id'] ) ? (int) $post['id'] : $post_id );
			if ( $clone ) {
				return $clone;
			}
			return array(
				200,
				array(
					'success' => true,
					'postId'  => (int) ( $post['id'] ?? $post_id ),
					'link'    => $link,
					'status'  => (string) ( $post['status'] ?? '' ),
					'date'    => (string) ( $post['date_gmt'] ?? $post['date'] ?? '' ),
					'title'   => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['title'] ?? $title ),
				),
			);
		}

		if ( $status === 403 && Neo_Pulse_App_Wp_Url_Normalize::rest_looks_like_cloudflare_challenge( $resp['body'] ) ) {
			return array( 200, array( 'success' => false, 'error' => Neo_Pulse_App_Wp_Url_Normalize::CLOUDFLARE_REST_BLOCKED_MESSAGE ) );
		}

		$wp_msg = is_array( $resp['body'] ) && ! empty( $resp['body']['message'] ) ? (string) $resp['body']['message'] : '';
		$errors = array(
			401 => 'Authentication failed.',
			403 => 'Permission denied (403). ' . $wp_msg,
			404 => 'Post not found (ID: ' . $post_id . ').',
			400 => 'WordPress API validation error: ' . $wp_msg,
		);
		if ( isset( $errors[ $status ] ) ) {
			return array( 200, array( 'success' => false, 'error' => $errors[ $status ], 'details' => $resp['body'] ) );
		}

		return array( 200, array( 'success' => false, 'error' => 'WordPress API error: HTTP ' . $status ) );
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function delete_post( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$post_id      = Neo_Pulse_App_Wp_Url_Normalize::normalize_post_id( isset( $body['postId'] ) ? $body['postId'] : null );
		$post_type    = isset( $body['postType'] ) ? (string) $body['postType'] : 'post';
		$force        = ! empty( $body['force'] );

		if ( $site_url === '' || $username === '' || $app_password === '' || $post_id === null ) {
			return array( 400, array( 'success' => false, 'error' => 'Missing required fields: siteUrl, username, appPassword, postId' ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$endpoint   = Neo_Pulse_App_Wp_Url_Normalize::resolve_wp_v2_collection_endpoint(
			isset( $body['postTypeEndpoint'] ) ? $body['postTypeEndpoint'] : null,
			$post_type
		);
		$api_url = $normalized . '/wp-json/wp/v2/' . rawurlencode( $endpoint ) . '/' . $post_id;
		if ( $force ) {
			$api_url = add_query_arg( 'force', 'true', $api_url );
		}

		$resp = Neo_Pulse_App_Wp_Rest_Client::request(
			'DELETE',
			$api_url,
			$username,
			$app_password,
			array( 'timeout' => 30 )
		);

		if ( $resp['is_wp_error'] ) {
			return array( 200, array( 'success' => false, 'error' => $resp['error'] ) );
		}

		$status = (int) $resp['status'];
		if ( $status === 200 || $status === 204 ) {
			$deleted = is_array( $resp['body'] ) ? $resp['body'] : array();
			return array(
				200,
				array(
					'success'  => true,
					'postId'   => $post_id,
					'deleted'  => $force,
					'trashed'  => ! $force,
					'previous' => array(
						'link'   => (string) ( $deleted['link'] ?? '' ),
						'status' => (string) ( $deleted['status'] ?? '' ),
						'title'  => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $deleted['title'] ?? '' ),
					),
				),
			);
		}

		$map = array(
			401 => 'Authentication failed.',
			403 => 'Permission denied.',
			404 => 'Post not found or already deleted.',
		);
		if ( isset( $map[ $status ] ) ) {
			return array( 200, array( 'success' => false, 'error' => $map[ $status ] ) );
		}

		return array( 200, array( 'success' => false, 'error' => 'WordPress API error: HTTP ' . $status ) );
	}

	/**
	 * Existing post that already owns this slug, including trash.
	 * WordPress still reserves trashed slugs and appends -2 on create.
	 *
	 * @param string $site_url Normalized site URL.
	 * @param string $username User.
	 * @param string $app_password App password.
	 * @param string $endpoint REST collection.
	 * @param string $slug Normalized slug.
	 * @return array<string,mixed>|null
	 */
	private static function find_post_by_slug( $site_url, $username, $app_password, $endpoint, $slug ) {
		$url  = $site_url . '/wp-json/wp/v2/' . rawurlencode( $endpoint )
			. '?slug=' . rawurlencode( $slug )
			. '&status=publish,future,draft,pending,private,trash'
			. '&per_page=20'
			. '&context=edit';
		$resp = Neo_Pulse_App_Wp_Rest_Client::request(
			'GET',
			$url,
			$username,
			$app_password,
			array( 'timeout' => 30 )
		);
		if ( $resp['is_wp_error'] || ! is_array( $resp['body'] ) ) {
			return null;
		}
		foreach ( $resp['body'] as $post ) {
			if ( ! is_array( $post ) ) {
				continue;
			}
			$post_slug = isset( $post['slug'] ) ? self::normalize_slug( (string) $post['slug'] ) : '';
			$id        = isset( $post['id'] ) ? (int) $post['id'] : 0;
			if ( $id > 0 && $post_slug === $slug ) {
				return $post;
			}
		}
		return null;
	}

	/**
	 * @param string $requested Requested slug.
	 * @param string $got Returned slug.
	 * @return bool
	 */
	private static function is_numbered_slug_clone( $requested, $got ) {
		if ( $requested === '' || $got === '' || $got === $requested ) {
			return false;
		}
		$prefix = $requested . '-';
		if ( strpos( $got, $prefix ) !== 0 ) {
			return false;
		}
		$suffix = substr( $got, strlen( $prefix ) );
		return $suffix !== '' && ctype_digit( $suffix );
	}

	/**
	 * @param string $requested Requested slug.
	 * @param string $got Returned slug.
	 * @param string $link Permalink.
	 * @param int    $post_id Post ID.
	 * @return array{0:int,1:array<string,mixed>}|null
	 */
	private static function numbered_slug_clone_error( $requested, $got, $link, $post_id ) {
		if ( ! self::is_numbered_slug_clone( $requested, $got ) ) {
			return null;
		}
		return array(
			200,
			array(
				'success' => false,
				'error'   => 'WordPress assigned numbered slug /' . $got . ' instead of /' . $requested . '. Restore or permanently delete the original (including trash), then Play again.',
				'postId'  => $post_id,
				'link'    => $link,
			),
		);
	}

	/**
	 * @param string $slug Raw slug.
	 * @return string
	 */
	private static function normalize_slug( $slug ) {
		if ( $slug === '' ) {
			return '';
		}
		if ( strpos( $slug, 'http://' ) !== false || strpos( $slug, 'https://' ) !== false ) {
			$slug = Neo_Pulse_App_Wp_Url_Normalize::extract_slug( $slug );
		}
		if ( $slug !== '' && preg_match( '/^[a-z0-9-]+$/', $slug ) ) {
			return $slug;
		}
		if ( $slug !== '' ) {
			$sanitized = strtolower( preg_replace( '/[^a-z0-9-]+/', '-', $slug ) );
			$sanitized = trim( preg_replace( '/-+/', '-', $sanitized ), '-' );
			return $sanitized;
		}
		return '';
	}

	/**
	 * @param string $content Post HTML.
	 * @return int Timeout seconds.
	 */
	private static function write_timeout_ms( $content ) {
		$len = is_string( $content ) ? strlen( $content ) : 0;
		return (int) min( 180, max( 45, 30 + (int) floor( $len / 2000 ) ) );
	}

	/**
	 * @param string              $method HTTP method.
	 * @param string              $url URL.
	 * @param string              $username User.
	 * @param string              $app_password Password.
	 * @param array<string,mixed> $post_data Body.
	 * @param int                 $timeout Timeout seconds.
	 * @return array{status:int,headers:array<string,string>,body:mixed,raw:string,is_wp_error:bool,error:string}
	 */
	private static function request_with_transient_retry( $method, $url, $username, $app_password, $post_data, $timeout ) {
		$resp = Neo_Pulse_App_Wp_Rest_Client::request(
			$method,
			$url,
			$username,
			$app_password,
			array(
				'timeout' => $timeout,
				'body'    => $post_data,
			)
		);
		if ( ! $resp['is_wp_error'] || ! self::is_transient_error( $resp['error'] ) ) {
			return $resp;
		}
		return Neo_Pulse_App_Wp_Rest_Client::request(
			$method,
			$url,
			$username,
			$app_password,
			array(
				'timeout' => min( 240, $timeout * 2 ),
				'body'    => $post_data,
			)
		);
	}

	/**
	 * @param string $message Error message.
	 * @return bool
	 */
	private static function is_transient_error( $message ) {
		$lower = strtolower( $message );
		foreach ( array( 'timeout', 'timed out', 'connection reset', 'broken pipe', 'unreachable' ) as $needle ) {
			if ( strpos( $lower, $needle ) !== false ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array{status:int,body:mixed,is_wp_error:bool,error:string} $resp Response.
	 * @param string $title Title fallback.
	 * @param string $endpoint Endpoint slug.
	 * @param string $api_url API URL.
	 * @param string $slug Slug.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	private static function map_write_response( $resp, $title, $endpoint, $api_url, $slug ) {
		if ( $resp['is_wp_error'] ) {
			$transport = Neo_Pulse_App_Wp_Rest_Client::transport_error_message( $resp );
			return array( 200, array( 'success' => false, 'error' => $transport ? $transport : $resp['error'] ) );
		}
		$status = (int) $resp['status'];
		if ( ( $status === 201 || $status === 200 ) && is_array( $resp['body'] ) ) {
			$post = $resp['body'];
			$link = (string) ( $post['link'] ?? '' );
			$got  = isset( $post['slug'] ) ? self::normalize_slug( (string) $post['slug'] ) : '';
			if ( $got === '' && $link !== '' ) {
				$got = self::normalize_slug( Neo_Pulse_App_Wp_Url_Normalize::extract_slug( $link ) );
			}
			$clone = self::numbered_slug_clone_error( $slug, $got, $link, isset( $post['id'] ) ? (int) $post['id'] : 0 );
			if ( $clone ) {
				return $clone;
			}
			return array(
				200,
				array(
					'success' => true,
					'postId'  => (int) ( $post['id'] ?? 0 ),
					'link'    => $link,
					'status'  => (string) ( $post['status'] ?? '' ),
					'date'    => (string) ( $post['date_gmt'] ?? $post['date'] ?? '' ),
					'title'   => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['title'] ?? $title ),
				),
			);
		}
		if ( $status === 404 ) {
			return array( 200, array( 'success' => false, 'error' => 'WordPress API endpoint not found (404): ' . $api_url ) );
		}
		$wp_msg = is_array( $resp['body'] ) && ! empty( $resp['body']['message'] ) ? (string) $resp['body']['message'] : '';
		return array( 200, array( 'success' => false, 'error' => 'WordPress API error: HTTP ' . $status . ( $wp_msg ? ' - ' . $wp_msg : '' ) ) );
	}

	/**
	 * Reschedule a scheduled post by id (loads title/content, sets date_gmt + future).
	 *
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function reschedule_post_date( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$post_id      = Neo_Pulse_App_Wp_Url_Normalize::normalize_post_id( isset( $body['postId'] ) ? $body['postId'] : null );
		$date_gmt     = isset( $body['date_gmt'] ) ? trim( (string) $body['date_gmt'] ) : '';
		$post_type    = isset( $body['postType'] ) ? (string) $body['postType'] : 'post';

		if ( $site_url === '' || $username === '' || $app_password === '' || $post_id === null || $date_gmt === '' ) {
			return array( 400, array( 'success' => false, 'error' => 'Missing required fields for reschedule' ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$endpoint   = ! empty( $body['postTypeEndpoint'] )
			? Neo_Pulse_App_Wp_Url_Normalize::resolve_wp_v2_collection_endpoint( $body['postTypeEndpoint'], $post_type )
			: Neo_Pulse_App_Wp_Url_Normalize::resolve_wp_v2_collection_endpoint( null, $post_type );
		$api_url    = $normalized . '/wp-json/wp/v2/' . rawurlencode( $endpoint ) . '/' . $post_id;

		$warm = Neo_Pulse_App_Wp_Rest_Client::warm_origin_session( $normalized );
		$get  = Neo_Pulse_App_Wp_Rest_Client::request(
			'GET',
			$api_url,
			$username,
			$app_password,
			array(
				'timeout' => 30,
				'referer' => $normalized . '/',
				'cookie'  => $warm['cookie'],
			)
		);
		if ( $get['is_wp_error'] || (int) $get['status'] !== 200 || ! is_array( $get['body'] ) ) {
			$transport = Neo_Pulse_App_Wp_Rest_Client::transport_error_message( $get );
			return array( 200, array( 'success' => false, 'error' => $transport ? $transport : 'Could not load post for reschedule.' ) );
		}

		$existing = $get['body'];
		$title    = Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $existing['title'] ?? '' );
		$content  = isset( $existing['content']['rendered'] ) ? (string) $existing['content']['rendered'] : (string) ( $existing['content'] ?? '' );
		if ( $title === '' ) {
			return array( 200, array( 'success' => false, 'error' => 'Post has no title.' ) );
		}

		return self::update_post(
			array(
				'siteUrl'           => $site_url,
				'username'          => $username,
				'appPassword'       => $app_password,
				'postId'            => $post_id,
				'title'             => $title,
				'content'           => $content,
				'postType'          => $post_type,
				'postTypeEndpoint'  => isset( $body['postTypeEndpoint'] ) ? $body['postTypeEndpoint'] : null,
				'date_gmt'          => $date_gmt,
				'status'            => 'future',
			)
		);
	}
}
