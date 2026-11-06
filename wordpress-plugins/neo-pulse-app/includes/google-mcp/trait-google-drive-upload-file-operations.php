<?php
/**
 * Drive file move, rename, and trash operations with list helpers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Google_Drive_Upload_Trait_File_Operations {

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function move_file( array $body ): array {
		$file_id            = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) ( $body['fileId'] ?? '' ) );
		$destination_folder = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) ( $body['destinationFolderId'] ?? '' ) );
		if ( strlen( $file_id ) < 10 || strlen( $destination_folder ) < 10 ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'fileId and destinationFolderId are required.' ),
			);
		}

		$access_token = self::access_token_or_error();
		if ( isset( $access_token['statusCode'] ) ) {
			return $access_token;
		}

		$get_url      = self::DRIVE_FILES_URL . '/' . rawurlencode( $file_id ) . '?fields=parents&supportsAllDrives=true';
		$get_response = wp_remote_get(
			$get_url,
			array(
				'timeout' => 20,
				'headers' => array( 'Authorization' => 'Bearer ' . $access_token ),
			)
		);
		if ( is_wp_error( $get_response ) ) {
			return array(
				'statusCode' => 502,
				'body'       => array( 'success' => false, 'error' => $get_response->get_error_message() ),
			);
		}
		$get_data = json_decode( wp_remote_retrieve_body( $get_response ), true );
		$parents  = is_array( $get_data ) && isset( $get_data['parents'] ) && is_array( $get_data['parents'] )
			? array_map( 'strval', $get_data['parents'] )
			: array();

		$patch_url = add_query_arg(
			array(
				'addParents'        => $destination_folder,
				'removeParents'     => implode( ',', $parents ),
				'supportsAllDrives' => 'true',
				'fields'            => 'id,name,webViewLink,parents',
			),
			self::DRIVE_FILES_URL . '/' . rawurlencode( $file_id )
		);
		$response  = wp_remote_request(
			$patch_url,
			array(
				'method'  => 'PATCH',
				'timeout' => 20,
				'headers' => array(
					'Authorization' => 'Bearer ' . $access_token,
					'Content-Type'  => 'application/json; charset=UTF-8',
				),
				'body'    => '{}',
			)
		);
		if ( is_wp_error( $response ) ) {
			return array(
				'statusCode' => 502,
				'body'       => array( 'success' => false, 'error' => $response->get_error_message() ),
			);
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $data ) ) {
			$msg = is_array( $data ) && ! empty( $data['error']['message'] )
				? (string) $data['error']['message']
				: 'Google Drive move failed.';
			return array(
				'statusCode' => $code > 0 ? $code : 502,
				'body'       => array( 'success' => false, 'error' => $msg ),
			);
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'     => true,
				'fileId'      => (string) ( $data['id'] ?? $file_id ),
				'name'        => (string) ( $data['name'] ?? '' ),
				'webViewLink' => (string) ( $data['webViewLink'] ?? '' ),
			),
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function rename_file( array $body ): array {
		$file_id  = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) ( $body['fileId'] ?? '' ) );
		$new_name = sanitize_text_field( (string) ( $body['newName'] ?? '' ) );
		if ( strlen( $file_id ) < 10 || $new_name === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'fileId and newName are required.' ),
			);
		}

		$access_token = self::access_token_or_error();
		if ( isset( $access_token['statusCode'] ) ) {
			return $access_token;
		}

		$response = wp_remote_request(
			self::DRIVE_FILES_URL . '/' . rawurlencode( $file_id ) . '?supportsAllDrives=true&fields=id,name,webViewLink',
			array(
				'method'  => 'PATCH',
				'timeout' => 20,
				'headers' => array(
					'Authorization' => 'Bearer ' . $access_token,
					'Content-Type'  => 'application/json; charset=UTF-8',
				),
				'body'    => wp_json_encode( array( 'name' => $new_name ) ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return array(
				'statusCode' => 502,
				'body'       => array( 'success' => false, 'error' => $response->get_error_message() ),
			);
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $data ) ) {
			$msg = is_array( $data ) && ! empty( $data['error']['message'] )
				? (string) $data['error']['message']
				: 'Google Drive rename failed.';
			return array(
				'statusCode' => $code > 0 ? $code : 502,
				'body'       => array( 'success' => false, 'error' => $msg ),
			);
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success'     => true,
				'fileId'      => (string) ( $data['id'] ?? $file_id ),
				'name'        => (string) ( $data['name'] ?? $new_name ),
				'webViewLink' => (string) ( $data['webViewLink'] ?? '' ),
			),
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function trash_file( array $body ): array {
		$file_id = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) ( $body['fileId'] ?? '' ) );
		if ( strlen( $file_id ) < 10 ) {
			return array(
				'statusCode' => 400,
				'body'       => array( 'success' => false, 'error' => 'fileId is required.' ),
			);
		}

		$access_token = self::access_token_or_error();
		if ( isset( $access_token['statusCode'] ) ) {
			return $access_token;
		}

		$response = wp_remote_request(
			self::DRIVE_FILES_URL . '/' . rawurlencode( $file_id ) . '?supportsAllDrives=true&fields=id,name,trashed',
			array(
				'method'  => 'PATCH',
				'timeout' => 20,
				'headers' => array(
					'Authorization' => 'Bearer ' . $access_token,
					'Content-Type'  => 'application/json; charset=UTF-8',
				),
				'body'    => wp_json_encode( array( 'trashed' => true ) ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return array(
				'statusCode' => 502,
				'body'       => array( 'success' => false, 'error' => $response->get_error_message() ),
			);
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $data ) ) {
			$msg = is_array( $data ) && ! empty( $data['error']['message'] )
				? (string) $data['error']['message']
				: 'Google Drive trash failed.';
			return array(
				'statusCode' => $code > 0 ? $code : 502,
				'body'       => array( 'success' => false, 'error' => $msg ),
			);
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'success' => true,
				'fileId'  => (string) ( $data['id'] ?? $file_id ),
				'name'    => (string) ( $data['name'] ?? '' ),
				'trashed' => ! empty( $data['trashed'] ),
			),
		);
	}

	/**
	 * @return string|array{statusCode:int,body:array<string,mixed>}
	 */
	private static function access_token_or_error() {
		$access_token = Neo_Pulse_App_Google_Mcp_Tokens::get_valid_access_token();
		if ( is_wp_error( $access_token ) ) {
			return array(
				'statusCode' => 401,
				'body'       => array( 'success' => false, 'error' => $access_token->get_error_message() ),
			);
		}
		return $access_token;
	}

	/**
	 * @param string $access_token
	 * @param string $query
	 * @param int    $page_size
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	private static function list_files_query( string $access_token, string $query, int $page_size ): array {
		$list_url = add_query_arg(
			array(
				'q'                         => $query,
				'fields'                    => 'files(id,name,webViewLink,createdTime)',
				'supportsAllDrives'         => 'true',
				'includeItemsFromAllDrives' => 'true',
				'pageSize'                  => max( 1, min( 100, $page_size ) ),
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
		if ( $list_code < 200 || $list_code >= 300 || ! is_array( $list_data ) ) {
			$msg = is_array( $list_data ) && ! empty( $list_data['error']['message'] )
				? (string) $list_data['error']['message']
				: 'Google Drive list failed.';
			return array(
				'statusCode' => $list_code > 0 ? $list_code : 502,
				'body'       => array( 'success' => false, 'error' => $msg ),
			);
		}
		return array(
			'statusCode' => 200,
			'body'       => $list_data,
		);
	}

	/**
	 * @return array{statusCode:int,body:array<string,mixed>,files?:array<int,array{id:string,name:string,webViewLink:string,createdTime:string}>}
	 */
	private static function named_files_in_folder( string $access_token, string $folder_id, string $file_name ): array {
		$escaped_name = str_replace( "'", "\\'", $file_name );
		$query        = sprintf(
			"'%s' in parents and name = '%s' and trashed = false",
			$folder_id,
			$escaped_name
		);
		$list = self::list_files_query( $access_token, $query, 100 );
		if ( (int) ( $list['statusCode'] ?? 500 ) !== 200 ) {
			return $list;
		}
		$list_body = isset( $list['body'] ) && is_array( $list['body'] ) ? $list['body'] : array();
		$files     = isset( $list_body['files'] ) && is_array( $list_body['files'] ) ? $list_body['files'] : array();
		$named     = array();
		foreach ( $files as $file ) {
			if ( ! is_array( $file ) || empty( $file['id'] ) ) {
				continue;
			}
			$named[] = array(
				'id'          => (string) $file['id'],
				'name'        => (string) ( $file['name'] ?? $file_name ),
				'webViewLink' => (string) ( $file['webViewLink'] ?? '' ),
				'createdTime' => (string) ( $file['createdTime'] ?? '' ),
			);
		}
		usort(
			$named,
			static function ( array $left, array $right ): int {
				return strcmp( (string) $left['createdTime'], (string) $right['createdTime'] );
			}
		);
		return array(
			'statusCode' => 200,
			'body'       => array( 'success' => true ),
			'files'      => $named,
		);
	}
}
