<?php
/**
 * File-backed manager settings (workspace JSON on the API server).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Manager_Route_Handlers {

	private const SNAPSHOT_SECRET_KEYS = array(
		'openrouter-api-key',
		'dataforseo-api-key',
		'semrush-api-key',
		'agentmail-api-key',
		'slack-bot-token',
		'slack-global-settings',
	);

	/**
	 * Remove secret material from a manager snapshot (public or unauthenticated responses only).
	 *
	 * @param mixed $snapshot
	 * @return mixed
	 */
	public static function strip_snapshot_secrets( $snapshot ) {
		if ( ! is_array( $snapshot ) || ! isset( $snapshot['keys'] ) || ! is_array( $snapshot['keys'] ) ) {
			return $snapshot;
		}
		foreach ( self::SNAPSHOT_SECRET_KEYS as $key ) {
			unset( $snapshot['keys'][ $key ] );
		}
		if ( isset( $snapshot['keys']['wordpress_sites'] ) && is_string( $snapshot['keys']['wordpress_sites'] ) ) {
			$sites = json_decode( $snapshot['keys']['wordpress_sites'], true );
			if ( is_array( $sites ) ) {
				$snapshot['keys']['wordpress_sites'] = wp_json_encode( Neo_Pulse_App_Sites_Sync::strip_site_secrets( $sites ) );
			}
		}
		return $snapshot;
	}

	private static function file_store_status(): array {
		return array(
			'ok'                  => true,
			'workspaceConfigured' => true,
			'urlHost'             => null,
			'canAutoCreateTable'  => false,
		);
	}

	/**
	 * @param string              $subpath Route after manager-cloud-settings/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_cloud( string $subpath, string $method, array $body ): void {
		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );
		$path    = Neo_Pulse_App_Data_Paths::manager_settings_path();

		if ( $subpath === 'status' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( self::file_store_status() );
			return;
		}

		if ( $subpath === 'save' && $method === 'POST' ) {
			$snapshot = isset( $body['snapshot'] ) ? $body['snapshot'] : null;
			$updated  = gmdate( 'c' );
			Neo_Pulse_App_Json_File_Store::write(
				$path,
				array(
					'snapshot'  => $snapshot,
					'updatedAt' => $updated,
				)
			);
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'updatedAt' => $updated ) );
			return;
		}

		if ( $subpath === 'load' && $method === 'GET' ) {
			$data = Neo_Pulse_App_Json_File_Store::read( $path );
			if ( ! is_array( $data ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'snapshot' => null, 'updatedAt' => null ) );
				return;
			}
			// Authenticated route: return stored keys so Dashboard fields repopulate after refresh.
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'        => true,
					'snapshot'  => $data['snapshot'] ?? null,
					'updatedAt' => $data['updatedAt'] ?? null,
				)
			);
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => 'Not found' ), 404 );
	}

	/**
	 * @param string              $subpath Route after manager-wordpress-properties/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_properties( string $subpath, string $method, array $body ): void {
		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( $subpath === 'status' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( self::file_store_status() );
			return;
		}

		if ( $subpath === 'save' && $method === 'POST' ) {
			$sites = isset( $body['sites'] ) && is_array( $body['sites'] ) ? $body['sites'] : array();
			Neo_Pulse_App_Sites_Sync::save_mirror( $sites );
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'count' => count( $sites ) ) );
			return;
		}

		if ( $subpath === 'load' && $method === 'GET' ) {
			$data  = Neo_Pulse_App_Sites_Sync::load_public_mirror();
			$sites = is_array( $data ) && isset( $data['sites'] ) && is_array( $data['sites'] ) ? $data['sites'] : array();
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'     => true,
					'sites'  => $sites,
					'tokens' => array(),
				)
			);
			return;
		}

		if ( $subpath === 'client-logo/upload' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Property_Client_Logo::upload( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['status'] );
			return;
		}

		if ( preg_match( '#^client-logo/([^/]+)$#', $subpath, $logo_match ) && $method === 'GET' ) {
			$site_id = rawurldecode( $logo_match[1] );
			$result  = Neo_Pulse_App_Property_Client_Logo::serve( $site_id );
			if ( isset( $result['raw'] ) ) {
				$headers = isset( $result['headers'] ) && is_array( $result['headers'] ) ? $result['headers'] : array();
				Neo_Pulse_App_Api_Dispatcher::send_raw( (int) $result['status'], $result['raw'], $headers );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'] ?? array( 'error' => 'Not found' ), (int) $result['status'] );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => 'Not found' ), 404 );
	}
}
