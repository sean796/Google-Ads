<?php
/**
 * Connection test and Drive folder lookup, resolution, and creation.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Google_Drive_Upload_Trait_Folders {

	/**
	 * Upload a markdown test file into a dedicated subfolder for Settings → Test connection.
	 *
	 * @param string $parent_folder_id Optional Drive folder ID; defaults to Advanced Blinds preset.
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function upload_connection_test( string $parent_folder_id = '' ): array {
		$parent = preg_replace( '/[^a-zA-Z0-9_-]/', '', $parent_folder_id );
		if ( strlen( $parent ) < 10 ) {
			$parent = self::TEST_PARENT_FOLDER_ID;
		}

		$folder_result = self::ensure_child_folder( $parent, self::TEST_SUBFOLDER_NAME );
		if ( (int) ( $folder_result['statusCode'] ?? 500 ) !== 200 ) {
			return $folder_result;
		}
		$folder_body = isset( $folder_result['body'] ) && is_array( $folder_result['body'] ) ? $folder_result['body'] : array();
		$folder_id   = (string) ( $folder_body['folderId'] ?? '' );
		if ( $folder_id === '' ) {
			return array(
				'statusCode' => 502,
				'body'       => array( 'success' => false, 'error' => 'Could not create test folder on Google Drive.' ),
			);
		}

		$file_name = 'flowbie-drive-test-' . gmdate( 'Y-m-d-His' ) . '.md';
		$content   = "# Flowbie Google Drive test\n\nIf you can open this file, Drive upload works.\n\nUploaded at " . gmdate( 'c' ) . " UTC.\n";
		$upload    = self::upload_deliverable(
			array(
				'fileName'           => $file_name,
				'content'            => $content,
				'folderId'           => $folder_id,
				'mime'               => 'text/markdown',
				'convertToGoogleDoc' => true,
			)
		);
		if ( (int) ( $upload['statusCode'] ?? 500 ) !== 200 ) {
			return $upload;
		}
		$upload_body = isset( $upload['body'] ) && is_array( $upload['body'] ) ? $upload['body'] : array();
		$upload_body['folderId']   = $folder_id;
		$upload_body['folderLink'] = 'https://drive.google.com/drive/folders/' . rawurlencode( $folder_id );
		return array(
			'statusCode' => 200,
			'body'       => $upload_body,
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function find_folder( array $body ): array {
		$parent_folder_id = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) ( $body['parentFolderId'] ?? '' ) );
		$name             = sanitize_text_field( (string) ( $body['name'] ?? '' ) );
		$fuzzy            = ! empty( $body['fuzzy'] );
		if ( strlen( $parent_folder_id ) < 10 ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'parentFolderId is required.' ),
			);
		}
		if ( $name === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'name is required.' ),
			);
		}

		$access_token = self::access_token_or_error();
		if ( isset( $access_token['statusCode'] ) ) {
			return $access_token;
		}

		$escaped_name = str_replace( "'", "\\'", $name );
		if ( $fuzzy ) {
			$query = sprintf(
				"'%s' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false and name contains '%s'",
				$parent_folder_id,
				$escaped_name
			);
		} else {
			$query = sprintf(
				"'%s' in parents and name = '%s' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
				$parent_folder_id,
				$escaped_name
			);
		}

		$list = self::list_files_query( $access_token, $query, 25 );
		if ( (int) ( $list['statusCode'] ?? 500 ) !== 200 ) {
			return $list;
		}
		$list_body = isset( $list['body'] ) && is_array( $list['body'] ) ? $list['body'] : array();
		$files     = isset( $list_body['files'] ) && is_array( $list_body['files'] ) ? $list_body['files'] : array();
		$matches   = array();
		foreach ( $files as $file ) {
			if ( ! is_array( $file ) || empty( $file['id'] ) ) {
				continue;
			}
			$matches[] = array(
				'folderId'    => (string) $file['id'],
				'name'        => (string) ( $file['name'] ?? '' ),
				'webViewLink' => (string) ( $file['webViewLink'] ?? '' ),
			);
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success' => true,
				'matches' => $matches,
			),
		);
	}

	/**
	 * @param array<string,mixed> $query
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function list_folder_children( array $query ): array {
		$folder_id = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) ( $query['folderId'] ?? '' ) );
		if ( strlen( $folder_id ) < 10 ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'folderId is required.' ),
			);
		}

		$access_token = self::access_token_or_error();
		if ( isset( $access_token['statusCode'] ) ) {
			return $access_token;
		}

		$drive_query = sprintf(
			"'%s' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
			$folder_id
		);
		$list        = self::list_files_query( $access_token, $drive_query, 100 );
		if ( (int) ( $list['statusCode'] ?? 500 ) !== 200 ) {
			return $list;
		}
		$list_body = isset( $list['body'] ) && is_array( $list['body'] ) ? $list['body'] : array();
		$files     = isset( $list_body['files'] ) && is_array( $list_body['files'] ) ? $list_body['files'] : array();
		$children  = array();
		foreach ( $files as $file ) {
			if ( ! is_array( $file ) || empty( $file['id'] ) ) {
				continue;
			}
			$children[] = array(
				'folderId'    => (string) $file['id'],
				'name'        => (string) ( $file['name'] ?? '' ),
				'webViewLink' => (string) ( $file['webViewLink'] ?? '' ),
			);
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'  => true,
				'children' => $children,
			),
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function resolve_folder_path( array $body ): array {
		if ( self::is_delivery_folder_resolve_request( $body ) ) {
			return self::resolve_delivery_folder( $body );
		}

		$root_folder_id = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) ( $body['rootFolderId'] ?? '' ) );
		$segments       = isset( $body['segments'] ) && is_array( $body['segments'] ) ? $body['segments'] : array();
		$create_missing = ! array_key_exists( 'createMissing', $body ) || ! empty( $body['createMissing'] );
		if ( strlen( $root_folder_id ) < 10 ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'rootFolderId is required.' ),
			);
		}

		$normalized_segments = array();
		foreach ( $segments as $segment ) {
			$name = sanitize_text_field( (string) $segment );
			if ( $name !== '' ) {
				$normalized_segments[] = $name;
			}
		}
		if ( empty( $normalized_segments ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'segments must include at least one folder name.' ),
			);
		}

		$current_id = $root_folder_id;
		$created      = array();
		foreach ( $normalized_segments as $segment_name ) {
			if ( $create_missing ) {
				$result = self::ensure_child_folder( $current_id, $segment_name );
			} else {
				$result = self::find_folder(
					array(
						'parentFolderId' => $current_id,
						'name'           => $segment_name,
					)
				);
				if ( (int) ( $result['statusCode'] ?? 500 ) !== 200 ) {
					return $result;
				}
				$result_body = isset( $result['body'] ) && is_array( $result['body'] ) ? $result['body'] : array();
				$matches     = isset( $result_body['matches'] ) && is_array( $result_body['matches'] ) ? $result_body['matches'] : array();
				if ( empty( $matches[0]['folderId'] ) ) {
					return array(
						'statusCode' => 404,
						'body'       => array(
							'success' => false,
							'error'   => sprintf( 'Folder "%s" not found.', $segment_name ),
						),
					);
				}
				$result = array(
					'statusCode' => 200,
					'body'       => array(
						'success'  => true,
						'folderId' => (string) $matches[0]['folderId'],
						'created'  => false,
					),
				);
			}

			if ( (int) ( $result['statusCode'] ?? 500 ) !== 200 ) {
				return $result;
			}
			$result_body = isset( $result['body'] ) && is_array( $result['body'] ) ? $result['body'] : array();
			$next_id       = (string) ( $result_body['folderId'] ?? '' );
			if ( $next_id === '' ) {
				return array(
					'statusCode' => 502,
					'body'       => array( 'success' => false, 'error' => 'Could not resolve folder path.' ),
				);
			}
			if ( ! empty( $result_body['created'] ) ) {
				$created[] = $segment_name;
			}
			$current_id = $next_id;
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'     => true,
				'folderId'    => $current_id,
				'webViewLink' => 'https://drive.google.com/drive/folders/' . rawurlencode( $current_id ),
				'created'     => $created,
			),
		);
	}

	/**
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function ensure_child_folder( string $parent_folder_id, string $folder_name ): array {
		$access_token = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
		if ( is_wp_error( $access_token ) ) {
			return array(
				'statusCode' => 401,
				'body'       => array( 'success' => false, 'error' => $access_token->get_error_message() ),
			);
		}

		$query = sprintf(
			"'%s' in parents and name = '%s' and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
			$parent_folder_id,
			str_replace( "'", "\\'", $folder_name )
		);
		$list_url = add_query_arg(
			array(
				'q'                 => $query,
				'fields'            => 'files(id,name,webViewLink)',
				'supportsAllDrives' => 'true',
				'includeItemsFromAllDrives' => 'true',
				'pageSize'          => 1,
			),
			self::DRIVE_FILES_URL
		);
		$list_response = wp_remote_get(
			$list_url,
			array(
				'timeout' => 20,
				'headers' => array( 'Authorization' => 'Bearer ' . $access_token ),
			)
		);
		if ( is_wp_error( $list_response ) ) {
			return array(
				'statusCode' => 502,
				'body'       => array( 'success' => false, 'error' => $list_response->get_error_message() ),
			);
		}
		$list_code = (int) wp_remote_retrieve_response_code( $list_response );
		$list_data = json_decode( wp_remote_retrieve_body( $list_response ), true );
		if ( $list_code >= 200 && $list_code < 300 && is_array( $list_data ) && ! empty( $list_data['files'][0]['id'] ) ) {
			$existing_id = (string) $list_data['files'][0]['id'];
			return array(
				'statusCode' => 200,
				'body'       => array(
					'success'  => true,
					'folderId' => $existing_id,
					'created'  => false,
				),
			);
		}

		$create_response = wp_remote_post(
			self::DRIVE_FILES_URL . '?supportsAllDrives=true&fields=id,name,webViewLink',
			array(
				'timeout' => 20,
				'headers' => array(
					'Authorization' => 'Bearer ' . $access_token,
					'Content-Type'  => 'application/json; charset=UTF-8',
				),
				'body'    => wp_json_encode(
					array(
						'name'     => $folder_name,
						'mimeType' => 'application/vnd.google-apps.folder',
						'parents'  => array( $parent_folder_id ),
					)
				),
			)
		);
		if ( is_wp_error( $create_response ) ) {
			return array(
				'statusCode' => 502,
				'body'       => array( 'success' => false, 'error' => $create_response->get_error_message() ),
			);
		}
		$create_code = (int) wp_remote_retrieve_response_code( $create_response );
		$create_data = json_decode( wp_remote_retrieve_body( $create_response ), true );
		if ( $create_code < 200 || $create_code >= 300 || ! is_array( $create_data ) || empty( $create_data['id'] ) ) {
			$msg = is_array( $create_data ) && ! empty( $create_data['error']['message'] )
				? (string) $create_data['error']['message']
				: 'Could not create test folder on Google Drive.';
			return array(
				'statusCode' => $create_code > 0 ? $create_code : 502,
				'body'       => array( 'success' => false, 'error' => $msg ),
			);
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'  => true,
				'folderId' => (string) $create_data['id'],
				'created'  => true,
			),
		);
	}
}
