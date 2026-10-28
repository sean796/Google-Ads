<?php
/**
 * File-backed manager settings (workspace JSON on the API server).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Manager_Route_Handlers {

	/**
	 * Merge one API key into workspace manager settings (server-side Semrush, DataForSEO, etc.).
	 */
	private static function merge_manager_snapshot_api_key( string $key_id, string $value ): void {
		$path = Neo_Pulse_App_Data_Paths::manager_settings_path();
		$data = Neo_Pulse_App_Json_File_Store::read( $path );
		if ( ! is_array( $data ) ) {
			$data = array();
		}
		if ( ! isset( $data['snapshot'] ) || ! is_array( $data['snapshot'] ) ) {
			$data['snapshot'] = array(
				'version'     => 1,
				'collectedAt' => gmdate( 'c' ),
				'keys'        => array(),
			);
		}
		if ( ! isset( $data['snapshot']['keys'] ) || ! is_array( $data['snapshot']['keys'] ) ) {
			$data['snapshot']['keys'] = array();
		}
		if ( $value !== '' ) {
			$data['snapshot']['keys'][ $key_id ] = $value;
		} else {
			unset( $data['snapshot']['keys'][ $key_id ] );
		}
		$data['updatedAt'] = gmdate( 'c' );
		Neo_Pulse_App_Json_File_Store::write( $path, $data );
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
			$data  = Neo_Pulse_App_Sites_Sync::load_mirror();
			$sites = is_array( $data ) && isset( $data['sites'] ) && is_array( $data['sites'] ) ? $data['sites'] : array();
			$tokens = array();
			foreach ( $sites as $site ) {
				if ( ! is_array( $site ) ) {
					continue;
				}
				if ( ! empty( $site['pluginAccessToken'] ) && ! empty( $site['id'] ) ) {
					$tokens[] = array(
						'siteId'             => (string) $site['id'],
						'pluginAccessToken'  => (string) $site['pluginAccessToken'],
					);
				}
			}
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'     => true,
					'sites'  => $sites,
					'tokens' => $tokens,
				)
			);
			return;
		}

		if ( $subpath === 'sync-openrouter' && $method === 'POST' ) {
			$openrouter = isset( $body['openRouterApiKey'] ) ? trim( (string) $body['openRouterApiKey'] ) : '';
			if ( $openrouter !== '' && class_exists( 'Neo_Pulse_Wp_Api' ) ) {
				Neo_Pulse_Wp_Api::save_agency_openrouter_api_key( $openrouter );
			}
			if ( $openrouter !== '' ) {
				$keys_path = Neo_Pulse_App_Data_Paths::root() . '/email-worker-keys.json';
				$existing  = Neo_Pulse_App_Json_File_Store::read( $keys_path );
				if ( ! is_array( $existing ) ) {
					$existing = array();
				}
				$existing['openRouterApiKey'] = $openrouter;
				$existing['updatedAt']        = gmdate( 'c' );
				Neo_Pulse_App_Json_File_Store::write( $keys_path, $existing );
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'updated' => $openrouter !== '' ? 1 : 0 ) );
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

		if ( $subpath === 'sync-semrush' && $method === 'POST' ) {
			$semrush = isset( $body['semrushApiKey'] ) ? trim( (string) $body['semrushApiKey'] ) : '';
			if ( $semrush !== '' && str_starts_with( $semrush, 'semrtkn-' ) ) {
				$server = Neo_Pulse_App_Secrets::semrush_workspace_api_key();
				if ( $server !== '' ) {
					$semrush = $server;
				}
			}
			self::merge_manager_snapshot_api_key( 'semrush-api-key', $semrush );
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true, 'updated' => $semrush !== '' ? 1 : 0 ) );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => 'Not found' ), 404 );
	}
}
