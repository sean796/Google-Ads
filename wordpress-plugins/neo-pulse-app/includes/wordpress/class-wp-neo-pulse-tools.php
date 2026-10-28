<?php
/**
 * NEO Pulse WP plugin tools proxy (neo-pulse-wp-tools-routes.js).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_NeoPulse_Tools {

	/** @var array<int,string> */
	private static $confirm_tools = array(
		'wp_replace_content',
		'wp_delete_post',
		'wp_fields_update',
		'wp_ai_apply_field',
		'wp_ai_save_meta',
		'wp_ai_optimize_meta_bundle',
		'wp_body_section_apply',
		'wp_body_insert_element',
		'wp_image_seo_apply',
		'wp_image_seo_bulk',
		'wp_sitemap_put',
		'wp_redirects_create',
		'wp_redirects_update',
		'wp_redirects_delete',
		'wp_scripts_create',
		'wp_scripts_update',
		'wp_scripts_delete',
		'wp_gmb_create_post',
		'wp_revision_restore',
		'wp_theme_functions_put',
	);

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function neo_pulse_wp_tool( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$tool         = isset( $body['tool'] ) ? trim( (string) $body['tool'] ) : '';

		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return array( 400, array( 'ok' => false, 'error' => 'Missing required fields: siteUrl, username, appPassword' ) );
		}
		if ( $tool === '' ) {
			return array( 400, array( 'ok' => false, 'error' => 'tool is required' ) );
		}

		$params = isset( $body['params'] ) && is_array( $body['params'] ) ? $body['params'] : array();
		$trusted = ! isset( $body['trusted_agent'] ) || $body['trusted_agent'] !== false;
		if ( $trusted && in_array( $tool, self::$confirm_tools, true ) && empty( $params['confirm'] ) ) {
			$params['confirm'] = true;
		}

		$payload = array(
			'tool'   => $tool,
			'params' => $params,
		);
		if ( ! empty( $body['idempotency_key'] ) ) {
			$payload['idempotency_key'] = (string) $body['idempotency_key'];
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$url        = $normalized . '/wp-json/neo-pulse/v1/tools/execute';
		$resp       = Neo_Pulse_App_Wp_Rest_Client::request(
			'POST',
			$url,
			$username,
			$app_password,
			array(
				'timeout'      => 180,
				'body'         => $payload,
				'max_attempts' => 4,
			)
		);

		if ( $resp['is_wp_error'] ) {
			return array( 502, array( 'ok' => false, 'error' => $resp['error'], 'siteUrl' => $normalized ) );
		}

		$status = (int) $resp['status'];
		$data   = is_array( $resp['body'] ) ? $resp['body'] : array( 'data' => $resp['body'] );
		if ( $status >= 200 && $status < 300 ) {
			return array( 200, array_merge( $data, array( 'siteUrl' => $normalized ) ) );
		}

		$http = $status >= 400 ? $status : 502;
		return array(
			$http,
			array_merge(
				array(
					'ok'      => false,
					'status'  => $status,
					'error'   => self::format_tools_http_error( $status, $data ),
					'siteUrl' => $normalized,
				),
				is_array( $resp['body'] ) ? array( 'raw' => $resp['body'] ) : array()
			),
		);
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function neo_pulse_wp_tools_list( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';

		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return array( 400, array( 'ok' => false, 'error' => 'Missing required fields: siteUrl, username, appPassword' ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$url        = $normalized . '/wp-json/neo-pulse/v1/tools/list';
		$resp       = Neo_Pulse_App_Wp_Rest_Client::request(
			'POST',
			$url,
			$username,
			$app_password,
			array(
				'timeout'      => 60,
				'body'         => (object) array(),
				'max_attempts' => 3,
			)
		);

		if ( $resp['is_wp_error'] ) {
			return array( 502, array( 'ok' => false, 'error' => $resp['error'], 'siteUrl' => $normalized ) );
		}

		$status = (int) $resp['status'];
		$data   = is_array( $resp['body'] ) ? $resp['body'] : array();
		if ( $status >= 200 && $status < 300 ) {
			return array( 200, array_merge( $data, array( 'siteUrl' => $normalized ) ) );
		}

		return array(
			502,
			array(
				'ok'      => false,
				'status'  => $status,
				'error'   => self::format_tools_http_error( $status, $data ),
				'siteUrl' => $normalized,
			),
		);
	}

	/**
	 * @param string              $normalized Site URL.
	 * @param string              $username User.
	 * @param string              $app_password Password.
	 * @param string              $tool Tool name.
	 * @param array<string,mixed> $params Tool params.
	 * @return array<string,mixed>
	 */
	public static function execute_tool( $normalized, $username, $app_password, $tool, $params = array() ) {
		$body = array(
			'siteUrl'     => $normalized,
			'username'    => $username,
			'appPassword' => $app_password,
			'tool'        => $tool,
			'params'      => $params,
		);
		list( , $data ) = self::neo_pulse_wp_tool( $body );
		return $data;
	}

	/**
	 * @param string $normalized   Site URL.
	 * @param string $username     Optional username for authenticated wp_ping.
	 * @param string $app_password Optional application password for authenticated wp_ping.
	 * @return array{ok:bool,version?:string|null}
	 */
	public static function ping_public( $normalized, $username = '', $app_password = '' ) {
		$base = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $normalized );
		if ( $username !== '' && $app_password !== '' ) {
			$exec = self::execute_tool( $base, $username, $app_password, 'wp_ping', array() );
			if ( ! empty( $exec['ok'] ) ) {
				$ver = null;
				if ( isset( $exec['data']['version'] ) && is_string( $exec['data']['version'] ) ) {
					$ver = $exec['data']['version'];
				} elseif ( isset( $exec['version'] ) && is_string( $exec['version'] ) ) {
					$ver = $exec['version'];
				}
				return array(
					'ok'      => true,
					'version' => $ver,
				);
			}
		}

		$url  = $base . '/wp-json/neo-pulse/v1';
		$resp = wp_remote_get(
			$url,
			array(
				'timeout' => 8,
				'headers' => array( 'Accept' => 'application/json' ),
			)
		);
		if ( is_wp_error( $resp ) || (int) wp_remote_retrieve_response_code( $resp ) !== 200 ) {
			return array( 'ok' => false );
		}
		$body = json_decode( (string) wp_remote_retrieve_body( $resp ), true );
		if ( ! is_array( $body ) || ( $body['namespace'] ?? '' ) !== 'neo-pulse/v1' ) {
			return array( 'ok' => false );
		}
		return array(
			'ok'      => true,
			'version' => null,
		);
	}

	/**
	 * @param int                 $status HTTP status.
	 * @param array<string,mixed> $data Response body.
	 * @return string
	 */
	private static function format_tools_http_error( $status, $data ) {
		$code = isset( $data['code'] ) && is_string( $data['code'] ) ? $data['code'] : '';
		$raw  = '';
		if ( ! empty( $data['error'] ) && is_string( $data['error'] ) ) {
			$raw = $data['error'];
		} elseif ( ! empty( $data['message'] ) && is_string( $data['message'] ) ) {
			$raw = $data['message'];
		} else {
			$raw = 'NEO Pulse WP tool failed (HTTP ' . (int) $status . ')';
		}
		if ( (int) $status === 404 && ( $code === 'rest_no_route' || strpos( $raw, 'No route was found' ) !== false ) ) {
			return 'NEO Pulse WP plugin is not installed or not active on this site.';
		}
		return $raw;
	}
}
