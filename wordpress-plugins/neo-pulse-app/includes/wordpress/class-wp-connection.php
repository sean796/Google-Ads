<?php
/**
 * WordPress connection test (POST /test-connection).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Connection {

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function test_connection( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';

		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return array(
				400,
				array(
					'success' => false,
					'message' => 'Missing required fields: siteUrl, username, appPassword',
				),
			);
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$warm       = Neo_Pulse_App_Wp_Rest_Client::warm_origin_session( $normalized );
		$api_url    = $normalized . '/wp-json/wp/v2/users/me';

		$response = Neo_Pulse_App_Wp_Rest_Client::request(
			'GET',
			$api_url,
			$username,
			$app_password,
			array(
				'timeout'  => 10,
				'referer'  => $normalized . '/',
				'cookie'   => $warm['cookie'],
			)
		);

		$transport = Neo_Pulse_App_Wp_Rest_Client::transport_error_message( $response );
		if ( $transport ) {
			return array( 200, array( 'success' => false, 'message' => $transport ) );
		}

		$status = (int) $response['status'];
		if ( $status === 200 ) {
			$site_info = array(
				'name'        => 'WordPress Site',
				'description' => '',
				'url'         => $normalized,
			);
			$site_resp = Neo_Pulse_App_Wp_Rest_Client::request(
				'GET',
				$normalized . '/wp-json/',
				$username,
				$app_password,
				array( 'timeout' => 5 )
			);
			if ( ! $site_resp['is_wp_error'] && (int) $site_resp['status'] === 200 && is_array( $site_resp['body'] ) ) {
				$d = $site_resp['body'];
				if ( ! empty( $d['name'] ) ) {
					$site_info['name']        = (string) $d['name'];
					$site_info['description'] = isset( $d['description'] ) ? (string) $d['description'] : '';
					$site_info['url']           = isset( $d['url'] ) ? (string) $d['url'] : $normalized;
				}
			} elseif ( is_array( $response['body'] ) && ! empty( $response['body']['name'] ) ) {
				$site_info['name'] = (string) $response['body']['name'] . "'s Site";
			}

			$capabilities = self::probe_capabilities( $normalized, $username, $app_password, $warm['cookie'] );

			return array(
				200,
				array(
					'success'      => true,
					'message'      => 'Connection successful',
					'siteInfo'     => $site_info,
					'capabilities' => $capabilities,
				),
			);
		}

		if ( $status === 401 ) {
			return array(
				200,
				array(
					'success' => false,
					'message' => 'Authentication failed. Please check your username and application password.',
				),
			);
		}
		if ( $status === 404 ) {
			return array(
				200,
				array(
					'success' => false,
					'message' => 'WordPress REST API not found. Is this a WordPress site?',
				),
			);
		}

		return array(
			200,
			array(
				'success' => false,
				'message' => 'WordPress API returned status ' . $status,
			),
		);
	}

	/**
	 * Lightweight capability probe (ping + types).
	 *
	 * @param string $normalized_url Site URL.
	 * @param string $username User.
	 * @param string $app_password Password.
	 * @param string $cookie Origin cookie.
	 * @return array<string,mixed>|null
	 */
	private static function probe_capabilities( $normalized_url, $username, $app_password, $cookie ) {
		$ping = Neo_Pulse_App_Wp_Rest_Client::request(
			'POST',
			$normalized_url . '/wp-json/neo-pulse/v1/tools/execute',
			$username,
			$app_password,
			array(
				'timeout' => 10,
				'cookie'  => $cookie,
				'referer' => $normalized_url . '/',
				'body'    => array(
					'tool'   => 'wp_ping',
					'params' => (object) array(),
				),
			)
		);
		$neo_pulse_ok = ! $ping['is_wp_error'] && (int) $ping['status'] >= 200 && (int) $ping['status'] < 300;
		$version      = null;
		if ( $neo_pulse_ok && is_array( $ping['body'] ) ) {
			if ( isset( $ping['body']['data']['version'] ) && is_string( $ping['body']['data']['version'] ) ) {
				$version = $ping['body']['data']['version'];
			} elseif ( isset( $ping['body']['version'] ) && is_string( $ping['body']['version'] ) ) {
				$version = $ping['body']['version'];
			}
		}

		$types_resp = Neo_Pulse_App_Wp_Rest_Client::request(
			'GET',
			$normalized_url . '/wp-json/wp/v2/types',
			$username,
			$app_password,
			array(
				'timeout' => 8,
				'cookie'  => $cookie,
				'referer' => $normalized_url . '/',
			)
		);
		$types = array();
		if ( ! $types_resp['is_wp_error'] && (int) $types_resp['status'] === 200 && is_array( $types_resp['body'] ) ) {
			$types = array_keys( $types_resp['body'] );
		}

		return array(
			'hasNeoPulseWp'        => $neo_pulse_ok,
			'neoPulseWp'           => $neo_pulse_ok,
			'neoPulseWpVersion'    => $version,
			'fieldsBackend'        => $neo_pulse_ok ? 'neo_pulse_fields' : 'none',
			'acfRestObjectPresent' => true,
			'postTypes'            => $types,
			'restRoot'             => $normalized_url . '/wp-json/',
		);
	}
}
