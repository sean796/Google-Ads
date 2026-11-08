<?php
/**
 * Proxy Flow Assist chat widget settings via neo-pulse/v1/chat/settings REST.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Flow_Assist_Chat_Settings {

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get( $body ) {
		return self::request( $body, 'GET', null );
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function update( $body ) {
		$patch = array();
		if ( array_key_exists( 'enabled', $body ) ) {
			$patch['enabled'] = ! empty( $body['enabled'] );
		}
		if ( array_key_exists( 'logged_in_only', $body ) ) {
			$patch['logged_in_only'] = ! empty( $body['logged_in_only'] );
		}
		return self::request( $body, 'POST', $patch );
	}

	/**
	 * @param array<string,mixed>      $body   Credentials.
	 * @param string                   $method GET or POST.
	 * @param array<string,bool>|null $patch  Update payload.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	private static function request( $body, $method, $patch ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';

		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return array( 400, array( 'ok' => false, 'error' => 'Missing required fields: siteUrl, username, appPassword' ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$url        = $normalized . '/wp-json/neo-pulse/v1/chat/settings';
		$args       = array( 'timeout' => 30 );
		if ( $method === 'POST' && is_array( $patch ) ) {
			$args['body'] = $patch;
		}

		$resp = Neo_Pulse_App_Wp_Rest_Client::request( $method, $url, $username, $app_password, $args );
		if ( $resp['is_wp_error'] ) {
			return array( 502, array( 'ok' => false, 'error' => $resp['error'] ) );
		}

		$status = (int) $resp['status'];
		$data   = is_array( $resp['body'] ) ? $resp['body'] : array();
		if ( $status < 200 || $status >= 300 ) {
			$msg = isset( $data['message'] ) ? (string) $data['message'] : 'Chat settings request failed';
			return array( $status > 0 ? $status : 502, array( 'ok' => false, 'error' => $msg ) );
		}

		return array(
			200,
			array(
				'ok'             => true,
				'enabled'        => ! empty( $data['enabled'] ),
				'logged_in_only' => ! empty( $data['logged_in_only'] ),
			),
		);
	}
}
