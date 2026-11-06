<?php
/**
 * Delivery folder resolution for client workspaces.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Google_Drive_Upload_Trait_Delivery_Folder {

	/**
	 * Resolve delivery target: exact client folder name, or create it, then purpose/year/month.
	 *
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function resolve_delivery_folder( array $body ): array {
		$source     = self::normalize_folder_source( (string) ( $body['googleDriveFolderSource'] ?? 'client_root' ) );
		$site_name  = sanitize_text_field( (string) ( $body['siteName'] ?? '' ) );
		$site_url   = esc_url_raw( (string) ( $body['siteUrl'] ?? '' ) );
		$or_model   = sanitize_text_field( (string) ( $body['openRouterModel'] ?? '' ) );

		if ( $source === 'manual' ) {
			$folder_id = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) ( $body['googleDriveFolderId'] ?? '' ) );
			$client_hint_name = sanitize_text_field( (string) ( $body['googleDriveFolderLabel'] ?? '' ) );
			$want_name        = self::normalize_client_folder_name( $site_name, $site_url );
			$manual_is_this_client = $want_name === ''
				|| self::drive_folder_names_match( $client_hint_name, $want_name )
				|| self::drive_label_belongs_to_client( $client_hint_name, $want_name );
			if ( strlen( $folder_id ) >= 10 && $manual_is_this_client ) {
				$settings    = Neo_Pulse_App_Google_Drive_Settings::get();
				$aliases     = isset( $settings['folderAliases'] ) && is_array( $settings['folderAliases'] ) ? $settings['folderAliases'] : array();
				$purpose_key = self::resolve_delivery_purpose_key( $body, $source, $aliases );
				return self::finalize_delivery_folder_resolution(
					$folder_id,
					$client_hint_name !== '' ? $client_hint_name : 'Client folder',
					$purpose_key,
					$aliases,
					$site_name,
					$site_url,
					$or_model,
					array()
				);
			}
			if ( $want_name === '' ) {
				return array(
					'statusCode' => 400,
					'body'       => array( 'success' => false, 'error' => 'Google Drive folder ID is required.' ),
				);
			}
		}

		if ( $site_name === '' ) {
			$site_name = self::normalize_client_folder_name( '', $site_url );
		}
		if ( $site_name === '' && $site_url === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'Client name is required to resolve the Google Drive folder.' ),
			);
		}

		$settings  = Neo_Pulse_App_Google_Drive_Settings::get();
		$team_root = self::resolve_team_root_folder_id( $settings );
		$workspace = self::resolve_folder_path(
			array(
				'rootFolderId'  => $team_root,
				'segments'      => array( self::NEO_PULSE_WORKSPACE_FOLDER_NAME ),
				'createMissing' => true,
			)
		);
		if ( (int) ( $workspace['statusCode'] ?? 500 ) !== 200 ) {
			return $workspace;
		}
		$workspace_body = isset( $workspace['body'] ) && is_array( $workspace['body'] ) ? $workspace['body'] : array();
		$workspace_id   = (string) ( $workspace_body['folderId'] ?? '' );
		if ( strlen( $workspace_id ) < 10 ) {
			return array(
				'statusCode' => 502,
				'body'       => array( 'success' => false, 'error' => 'Could not resolve NEO Pulse workspace folder.' ),
			);
		}

		$created = isset( $workspace_body['created'] ) && is_array( $workspace_body['created'] ) ? $workspace_body['created'] : array();

		$list = self::list_folder_children( array( 'folderId' => $workspace_id ) );
		if ( (int) ( $list['statusCode'] ?? 500 ) !== 200 ) {
			return $list;
		}
		$list_body   = isset( $list['body'] ) && is_array( $list['body'] ) ? $list['body'] : array();
		$candidates  = isset( $list_body['children'] ) && is_array( $list_body['children'] ) ? $list_body['children'] : array();
		$aliases     = isset( $settings['folderAliases'] ) && is_array( $settings['folderAliases'] ) ? $settings['folderAliases'] : array();
		$purpose_key = self::resolve_delivery_purpose_key( $body, $source, $aliases );

		$pick = self::pick_or_create_client_folder( $candidates, $site_name, $site_url );
		if ( (int) ( $pick['statusCode'] ?? 500 ) !== 200 ) {
			return $pick;
		}
		$pick_body = isset( $pick['body'] ) && is_array( $pick['body'] ) ? $pick['body'] : array();
		$want_name = self::normalize_client_folder_name( $site_name, $site_url );

		$client_folder_id   = '';
		$client_folder_name = '';
		if ( ( $pick_body['action'] ?? '' ) === 'use_existing' ) {
			$picked_id = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) ( $pick_body['folderId'] ?? '' ) );
			foreach ( $candidates as $candidate ) {
				if ( ! is_array( $candidate ) ) {
					continue;
				}
				if ( (string) ( $candidate['folderId'] ?? '' ) === $picked_id ) {
					$picked_name = (string) ( $candidate['name'] ?? '' );
					if ( self::drive_folder_names_match( $picked_name, $want_name ) ) {
						$client_folder_id   = $picked_id;
						$client_folder_name = $picked_name;
					}
					break;
				}
			}
		}
		if ( $client_folder_id === '' ) {
			$create_name = $want_name;
			if ( $create_name === '' ) {
				return array(
					'statusCode' => 400,
					'body'       => array( 'success' => false, 'error' => 'Client folder name is required.' ),
				);
			}
			$created_client = self::resolve_folder_path(
				array(
					'rootFolderId'  => $workspace_id,
					'segments'      => array( $create_name ),
					'createMissing' => true,
				)
			);
			if ( (int) ( $created_client['statusCode'] ?? 500 ) !== 200 ) {
				return $created_client;
			}
			$created_client_body = isset( $created_client['body'] ) && is_array( $created_client['body'] ) ? $created_client['body'] : array();
			$client_folder_id    = (string) ( $created_client_body['folderId'] ?? '' );
			$client_folder_name  = $create_name;
			if ( ! empty( $created_client_body['created'] ) && is_array( $created_client_body['created'] ) ) {
				$created = array_merge( $created, $created_client_body['created'] );
			}
		}

		if ( strlen( $client_folder_id ) < 10 ) {
			return array(
				'statusCode' => 502,
				'body'       => array( 'success' => false, 'error' => 'Could not resolve client Google Drive folder.' ),
			);
		}

		return self::finalize_delivery_folder_resolution(
			$client_folder_id,
			$client_folder_name,
			$purpose_key,
			$aliases,
			$site_name,
			$site_url,
			$or_model,
			$created
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $aliases
	 * @param array<int,string>              $created
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	private static function finalize_delivery_folder_resolution(
		string $client_folder_id,
		string $client_folder_name,
		string $purpose_key,
		array $aliases,
		string $site_name,
		string $site_url,
		string $openrouter_model,
		array $created
	): array {
		if ( $purpose_key === 'client_root' ) {
			return array(
				'statusCode' => 200,
				'body'       => array(
					'success'          => true,
					'folderId'         => $client_folder_id,
					'label'            => implode( ' / ', array( self::NEO_PULSE_WORKSPACE_FOLDER_NAME, $client_folder_name ) ),
					'webViewLink'      => 'https://drive.google.com/drive/folders/' . rawurlencode( $client_folder_id ),
					'created'          => $created,
					'clientFolderId'   => $client_folder_id,
					'clientFolderName' => $client_folder_name,
				),
			);
		}

		$subfolder = self::gemini_pick_delivery_subfolder(
			$client_folder_id,
			$client_folder_name,
			$purpose_key,
			$aliases,
			$site_name,
			$site_url,
			$openrouter_model
		);
		if ( (int) ( $subfolder['statusCode'] ?? 500 ) !== 200 ) {
			return $subfolder;
		}
		$subfolder_body = isset( $subfolder['body'] ) && is_array( $subfolder['body'] ) ? $subfolder['body'] : array();
		$target_id      = (string) ( $subfolder_body['folderId'] ?? '' );
		$tail_segments  = isset( $subfolder_body['segments'] ) && is_array( $subfolder_body['segments'] ) ? $subfolder_body['segments'] : array();
		if ( strlen( $target_id ) < 10 && ! empty( $tail_segments ) ) {
			$resolved = self::resolve_folder_path(
				array(
					'rootFolderId'  => $client_folder_id,
					'segments'      => $tail_segments,
					'createMissing' => true,
				)
			);
			if ( (int) ( $resolved['statusCode'] ?? 500 ) !== 200 ) {
				return $resolved;
			}
			$resolved_body = isset( $resolved['body'] ) && is_array( $resolved['body'] ) ? $resolved['body'] : array();
			$target_id     = (string) ( $resolved_body['folderId'] ?? '' );
			if ( ! empty( $resolved_body['created'] ) && is_array( $resolved_body['created'] ) ) {
				$created = array_merge( $created, $resolved_body['created'] );
			}
		}
		if ( strlen( $target_id ) < 10 ) {
			return array(
				'statusCode' => 502,
				'body'       => array( 'success' => false, 'error' => 'Could not resolve Google Drive delivery subfolder.' ),
			);
		}

		$label_parts = array( self::NEO_PULSE_WORKSPACE_FOLDER_NAME, $client_folder_name );
		if ( ! empty( $tail_segments ) ) {
			$label_parts = array_merge( $label_parts, $tail_segments );
		} elseif ( ! empty( $subfolder_body['pathLabel'] ) ) {
			$label_parts[] = (string) $subfolder_body['pathLabel'];
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'          => true,
				'folderId'         => $target_id,
				'label'            => implode( ' / ', $label_parts ),
				'webViewLink'      => 'https://drive.google.com/drive/folders/' . rawurlencode( $target_id ),
				'created'          => $created,
				'clientFolderId'   => $client_folder_id,
				'clientFolderName' => $client_folder_name,
			),
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $aliases
	 */
	private static function resolve_delivery_purpose_key( array $body, string $source, array $aliases ): string {
		if ( $source === 'client_root' ) {
			return 'client_root';
		}
		$path = trim( (string) ( $body['googleDriveFolderPath'] ?? '' ) );
		if ( $path !== '' ) {
			return $path;
		}
		$execution_kind = sanitize_text_field( (string) ( $body['executionKind'] ?? '' ) );
		if ( $execution_kind === 'gsc_reporting' || $execution_kind === 'ads_reporting' ) {
			return 'reporting';
		}
		if ( $execution_kind === 'chatgpt_audit' ) {
			return 'audits';
		}
		if ( $execution_kind === 'local_dominator_export' ) {
			return 'grids';
		}
		return 'reporting';
	}

	/**
	 * @param array<int,array<string,mixed>> $candidates
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	private static function is_delivery_folder_resolve_request( array $body ): bool {
		if ( ! empty( $body['deliveryResolve'] ) ) {
			return true;
		}
		$site_name = trim( (string) ( $body['siteName'] ?? '' ) );
		$root_id   = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) ( $body['rootFolderId'] ?? '' ) );
		return $site_name !== '' && strlen( $root_id ) < 10;
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	private static function resolve_test_step_folder(
		array $body,
		string $source,
		string $site_name,
		string $site_url
	): array {
		$settings = Neo_Pulse_App_Google_Drive_Settings::get();
		$aliases  = isset( $settings['folderAliases'] ) && is_array( $settings['folderAliases'] ) ? $settings['folderAliases'] : array();
		if ( trim( (string) ( $body['googleDriveFolderPath'] ?? '' ) ) === '' ) {
			$body['googleDriveFolderPath'] = self::resolve_delivery_purpose_key( $body, 'path', $aliases );
		}
		$delivery_body = array_merge(
			$body,
			array(
				'siteName'                => $site_name,
				'siteUrl'                 => $site_url,
				'googleDriveFolderSource' => $source,
			)
		);
		$result        = self::resolve_delivery_folder( $delivery_body );
		if ( (int) ( $result['statusCode'] ?? 500 ) !== 200 ) {
			return $result;
		}
		$result_body = isset( $result['body'] ) && is_array( $result['body'] ) ? $result['body'] : array();
		if ( ! empty( $result_body['label'] ) ) {
			$result_body['folderLabel'] = (string) $result_body['label'];
		}
		return array(
			'statusCode' => 200,
			'body'       => $result_body,
		);
	}
}
