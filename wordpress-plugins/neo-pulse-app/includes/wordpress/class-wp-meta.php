<?php
/**
 * WordPress post meta routes (NEO Pulse native meta & custom fields).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Meta {

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_post_meta( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$post_id      = Neo_Pulse_App_Wp_Url_Normalize::normalize_post_id( isset( $body['postId'] ) ? $body['postId'] : null );
		$post_type    = isset( $body['postType'] ) ? (string) $body['postType'] : 'post';
		$endpoint     = isset( $body['postTypeEndpoint'] ) ? $body['postTypeEndpoint'] : null;

		if ( $site_url === '' || $username === '' || $app_password === '' || $post_id === null ) {
			return array( 400, array( 'success' => false, 'error' => 'Missing required fields: siteUrl, username, appPassword, postId' ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$collection = Neo_Pulse_App_Wp_Url_Normalize::resolve_wp_v2_collection_endpoint( $endpoint, $post_type );
		$url        = $normalized . '/wp-json/wp/v2/' . rawurlencode( $collection ) . '/' . $post_id . '?context=edit';

		$resp = Neo_Pulse_App_Wp_Rest_Client::request( 'GET', $url, $username, $app_password, array( 'timeout' => 30 ) );
		if ( $resp['is_wp_error'] ) {
			return array( 500, array( 'success' => false, 'error' => $resp['error'] ) );
		}

		$status = (int) $resp['status'];
		if ( $status === 401 ) {
			return array( 401, array( 'success' => false, 'error' => 'Authentication failed. Please verify your username and application password.' ) );
		}
		if ( $status === 404 ) {
			return array( 404, array( 'success' => false, 'error' => 'Post ID ' . $post_id . ' not found in ' . $collection . ' endpoint.' ) );
		}
		if ( $status === 403 ) {
			return array( 403, array( 'success' => false, 'error' => 'Permission denied.' ) );
		}
		if ( $status === 429 ) {
			return array( 429, array( 'success' => false, 'error' => 'WordPress still rate-limited (HTTP 429) after automatic retries.' ) );
		}
		if ( $status !== 200 || ! is_array( $resp['body'] ) ) {
			$msg = is_array( $resp['body'] ) && ! empty( $resp['body']['message'] ) ? (string) $resp['body']['message'] : 'WordPress API error';
			return array( $status, array( 'success' => false, 'error' => $msg ) );
		}

		$post = $resp['body'];
		$acf  = Neo_Pulse_App_Wp_Url_Normalize::rest_acf_from_post( $post );
		$acf  = is_array( $acf ) ? $acf : array();

		if ( empty( $acf['keyword_focus'] ) || empty( $acf['seo_research'] ) ) {
			$pulse_post = Neo_Pulse_App_Wp_NeoPulse_Tools::execute_tool(
				$normalized,
				$username,
				$app_password,
				'wp_get_post',
				array( 'post_id' => $post_id )
			);
			$meta_hub = isset( $pulse_post['data']['meta_hub'] ) && is_array( $pulse_post['data']['meta_hub'] )
				? $pulse_post['data']['meta_hub']
				: ( isset( $pulse_post['meta_hub'] ) && is_array( $pulse_post['meta_hub'] ) ? $pulse_post['meta_hub'] : array() );
			if ( $meta_hub !== array() ) {
				$acf = Neo_Pulse_App_Wp_Url_Normalize::merge_rest_field_objects(
					$acf,
					Neo_Pulse_App_Wp_Acf_Protocol::fields_from_pulse_meta_hub( $meta_hub )
				);
			}
		}

		return array(
			200,
			array(
				'success' => true,
				'postId'  => $post_id,
				'meta'    => isset( $post['meta'] ) && is_array( $post['meta'] ) ? $post['meta'] : array(),
				'acf'     => $acf,
				'title'   => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['title'] ?? '' ),
				'content' => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['content'] ?? '' ),
				'excerpt' => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['excerpt'] ?? '' ),
				'link'    => (string) ( $post['link'] ?? '' ),
			),
		);
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function update_post_meta( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$post_id      = Neo_Pulse_App_Wp_Url_Normalize::normalize_post_id( isset( $body['postId'] ) ? $body['postId'] : null );
		$post_type    = isset( $body['postType'] ) ? (string) $body['postType'] : 'post';
		$endpoint     = isset( $body['postTypeEndpoint'] ) ? $body['postTypeEndpoint'] : null;
		$meta         = isset( $body['meta'] ) && is_array( $body['meta'] ) ? $body['meta'] : null;
		$post_title   = isset( $body['postTitle'] ) ? $body['postTitle'] : null;
		$post_excerpt = isset( $body['postExcerpt'] ) ? $body['postExcerpt'] : null;

		if ( $site_url === '' || $username === '' || $app_password === '' || $post_id === null || ! is_array( $meta ) ) {
			return array( 400, array( 'success' => false, 'error' => 'Missing required fields: siteUrl, username, appPassword, postId, meta' ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$collection = Neo_Pulse_App_Wp_Url_Normalize::resolve_wp_v2_collection_endpoint( $endpoint, $post_type );
		$base_url   = $normalized . '/wp-json/wp/v2/' . rawurlencode( $collection ) . '/' . $post_id;

		$combined = $meta;
		if ( is_string( $post_title ) && trim( $post_title ) !== '' ) {
			$combined['seo_title'] = trim( $post_title );
		}
		if ( is_string( $post_excerpt ) && trim( $post_excerpt ) !== '' ) {
			$combined['meta_description'] = trim( $post_excerpt );
		}

		$pulse_res = Neo_Pulse_App_Wp_Acf_Protocol::write_via_pulse_overview_bulk(
			$normalized,
			$username,
			$app_password,
			$post_id,
			$combined
		);

		$update_data = array( 'meta' => $meta );
		if ( is_string( $post_title ) && trim( $post_title ) !== '' ) {
			$update_data['title'] = trim( $post_title );
		}
		if ( is_string( $post_excerpt ) && trim( $post_excerpt ) !== '' ) {
			$update_data['excerpt'] = trim( $post_excerpt );
		}

		$resp = Neo_Pulse_App_Wp_Rest_Client::request(
			'PUT',
			$base_url,
			$username,
			$app_password,
			array(
				'timeout' => 30,
				'body'    => $update_data,
			)
		);

		$wp_ok = ! $resp['is_wp_error'] && ( (int) $resp['status'] === 200 || (int) $resp['status'] === 201 );
		if ( ! $wp_ok && empty( $pulse_res['ok'] ) ) {
			$status = (int) $resp['status'];
			$msg    = is_array( $resp['body'] ) && ! empty( $resp['body']['message'] )
				? (string) $resp['body']['message']
				: ( $pulse_res['error'] ?? ( $resp['error'] ?: 'Update failed' ) );
			return array( $status >= 400 ? $status : 500, array( 'success' => false, 'error' => $msg ) );
		}

		$focus_sent = $combined['keyword_focus'] ?? $combined['focus_keyword'] ?? $combined['rank_math_focus_keyword'] ?? null;

		return array(
			200,
			array(
				'success'              => true,
				'postId'               => $post_id,
				'updated'              => true,
				'verifiedFocusKeyword' => is_string( $focus_sent ) ? trim( $focus_sent ) : null,
			),
		);
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function update_acf_field( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$post_id      = Neo_Pulse_App_Wp_Url_Normalize::normalize_post_id( isset( $body['postId'] ) ? $body['postId'] : null );
		$field_name   = isset( $body['fieldName'] ) ? (string) $body['fieldName'] : '';
		$field_value  = array_key_exists( 'fieldValue', $body ) ? $body['fieldValue'] : null;
		$post_type    = isset( $body['postType'] ) ? (string) $body['postType'] : 'post';
		$endpoint     = isset( $body['postTypeEndpoint'] ) ? $body['postTypeEndpoint'] : null;

		if ( $site_url === '' || $username === '' || $app_password === '' || $post_id === null || $field_name === '' || ! array_key_exists( 'fieldValue', $body ) ) {
			return array( 400, array( 'success' => false, 'error' => 'Missing required fields: siteUrl, username, appPassword, postId, fieldName, fieldValue' ) );
		}

		list( $status, $res ) = Neo_Pulse_App_Wp_Acf_Protocol::update_acf_fields(
			array(
				'siteUrl'          => $site_url,
				'username'         => $username,
				'appPassword'      => $app_password,
				'postId'           => $post_id,
				'postType'         => $post_type,
				'postTypeEndpoint' => $endpoint,
				'fields'           => array(
					$field_name => $field_value,
				),
			)
		);

		$serialized = Neo_Pulse_App_Wp_Acf_Protocol::serialize_acf_value( $field_value );
		return array(
			$status,
			array(
				'success'     => ! empty( $res['success'] ),
				'method'      => 'neo-pulse-fields',
				'fieldName'   => $field_name,
				'fieldValue'  => $serialized,
				'verified'    => ! empty( $res['success'] ),
				'actualValue' => $serialized,
				'error'       => $res['error'] ?? null,
			),
		);
	}
}
