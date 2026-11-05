<?php
/**
 * Change post slug / URL (POST /change-post-url).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Change_Post_Url {

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function change( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$post_id      = Neo_Pulse_App_Wp_Url_Normalize::normalize_post_id( isset( $body['postId'] ) ? $body['postId'] : null );
		$slug_trim    = isset( $body['slug'] ) ? trim( (string) $body['slug'] ) : '';
		$post_type    = isset( $body['postType'] ) ? (string) $body['postType'] : 'post';
		$endpoint     = isset( $body['postTypeEndpoint'] ) ? $body['postTypeEndpoint'] : null;
		$create_redirect = ! empty( $body['createRedirect'] );

		if ( $site_url === '' || $username === '' || $app_password === '' || $post_id === null || $slug_trim === '' ) {
			return array(
				400,
				array(
					'ok'    => false,
					'error' => 'Missing required fields: siteUrl, username, appPassword, postId, slug',
				),
			);
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$neo_pulse_url = $normalized . '/wp-json/neo-pulse/v1/ai/change-url';

		$neo_pulse_res = Neo_Pulse_App_Wp_Rest_Client::request(
			'POST',
			$neo_pulse_url,
			$username,
			$app_password,
			array(
				'timeout' => 60,
				'body'    => array(
					'post_id'         => $post_id,
					'slug'            => $slug_trim,
					'create_redirect' => $create_redirect,
				),
				'max_attempts' => 3,
			)
		);

		if ( ! $neo_pulse_res['is_wp_error'] ) {
			$st = (int) $neo_pulse_res['status'];
			if ( $st >= 200 && $st < 300 ) {
				$data = is_array( $neo_pulse_res['body'] ) ? $neo_pulse_res['body'] : array();
				return array( 200, array_merge( array( 'ok' => true, 'method' => 'neo-pulse' ), $data ) );
			}
			if ( $st !== 404 ) {
				$err_data = is_array( $neo_pulse_res['body'] ) ? $neo_pulse_res['body'] : array();
				$err_code = isset( $err_data['code'] ) && is_string( $err_data['code'] ) ? $err_data['code'] : '';
				$can_use_core_rest = in_array(
					$err_code,
					array( 'neo-pulse_unchanged_slug', 'neo-pulse_not_published' ),
					true
				);
				if ( ! $can_use_core_rest ) {
					$err_msg = '';
					if ( ! empty( $err_data['message'] ) && is_string( $err_data['message'] ) ) {
						$err_msg = $err_data['message'];
					} elseif ( ! empty( $err_data['error'] ) && is_string( $err_data['error'] ) ) {
						$err_msg = $err_data['error'];
					} else {
						$err_msg = 'NEO Pulse change-url failed (HTTP ' . $st . ')';
					}
					return array(
						$st,
						array(
							'ok'    => false,
							'error' => $err_msg,
							'code'  => $err_code !== '' ? $err_code : null,
						),
					);
				}
			}
		}

		$collection = Neo_Pulse_App_Wp_Url_Normalize::resolve_wp_v2_collection_endpoint( $endpoint, $post_type );
		$api_url    = $normalized . '/wp-json/wp/v2/' . rawurlencode( $collection ) . '/' . $post_id;

		$core_res = Neo_Pulse_App_Wp_Rest_Client::request(
			'PUT',
			$api_url,
			$username,
			$app_password,
			array(
				'timeout'      => 60,
				'body'         => array( 'slug' => $slug_trim ),
				'max_attempts' => 3,
			)
		);

		if ( $core_res['is_wp_error'] ) {
			return array(
				500,
				array(
					'ok'    => false,
					'error' => $core_res['error'],
				),
			);
		}

		$cst = (int) $core_res['status'];
		if ( $cst >= 200 && $cst < 300 && is_array( $core_res['body'] ) ) {
			$link = isset( $core_res['body']['link'] ) ? (string) $core_res['body']['link'] : '';
			return array(
				200,
				array(
					'ok'        => true,
					'method'    => 'rest',
					'slug'      => isset( $core_res['body']['slug'] ) ? (string) $core_res['body']['slug'] : $slug_trim,
					'permalink' => $link,
				),
			);
		}

		$core_err = is_array( $core_res['body'] ) ? $core_res['body'] : array();
		$msg      = '';
		if ( ! empty( $core_err['message'] ) && is_string( $core_err['message'] ) ) {
			$msg = $core_err['message'];
		} elseif ( ! empty( $core_err['error'] ) && is_string( $core_err['error'] ) ) {
			$msg = $core_err['error'];
		} else {
			$msg = 'WordPress slug update failed (HTTP ' . $cst . ')';
		}

		return array( $cst ? $cst : 500, array( 'ok' => false, 'error' => $msg ) );
	}
}
