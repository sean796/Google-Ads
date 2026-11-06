<?php
/**
 * Delivery subfolder catalog and Gemini folder picking.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Google_Drive_Upload_Trait_Delivery_Subfolder {

	/**
	 * @param array<int,array<string,mixed>> $aliases
	 * @return array<int,array{folderId:string,path:string,segments:array<int,string>}>
	 */
	private static function build_client_delivery_path_catalog( string $client_folder_id ): array {
		$catalog  = array();
		$purposes = self::list_folder_children( array( 'folderId' => $client_folder_id ) );
		if ( (int) ( $purposes['statusCode'] ?? 500 ) !== 200 ) {
			return $catalog;
		}
		$purpose_body = isset( $purposes['body'] ) && is_array( $purposes['body'] ) ? $purposes['body'] : array();
		$purpose_rows = isset( $purpose_body['children'] ) && is_array( $purpose_body['children'] ) ? $purpose_body['children'] : array();
		foreach ( $purpose_rows as $purpose_row ) {
			if ( ! is_array( $purpose_row ) || empty( $purpose_row['folderId'] ) ) {
				continue;
			}
			$purpose_name = trim( (string) ( $purpose_row['name'] ?? '' ) );
			$purpose_id   = (string) $purpose_row['folderId'];
			if ( $purpose_name === '' ) {
				continue;
			}

			$years = self::list_folder_children( array( 'folderId' => $purpose_id ) );
			if ( (int) ( $years['statusCode'] ?? 500 ) !== 200 ) {
				continue;
			}
			$year_body = isset( $years['body'] ) && is_array( $years['body'] ) ? $years['body'] : array();
			$year_rows = isset( $year_body['children'] ) && is_array( $year_body['children'] ) ? $year_body['children'] : array();
			foreach ( $year_rows as $year_row ) {
				if ( ! is_array( $year_row ) || empty( $year_row['folderId'] ) ) {
					continue;
				}
				$year_name = trim( (string) ( $year_row['name'] ?? '' ) );
				$year_id   = (string) $year_row['folderId'];
				if ( $year_name === '' || ! preg_match( '/^\d{4}$/', $year_name ) ) {
					continue;
				}

				$months = self::list_folder_children( array( 'folderId' => $year_id ) );
				if ( (int) ( $months['statusCode'] ?? 500 ) !== 200 ) {
					continue;
				}
				$month_body = isset( $months['body'] ) && is_array( $months['body'] ) ? $months['body'] : array();
				$month_rows = isset( $month_body['children'] ) && is_array( $month_body['children'] ) ? $month_body['children'] : array();
				foreach ( $month_rows as $month_row ) {
					if ( ! is_array( $month_row ) || empty( $month_row['folderId'] ) ) {
						continue;
					}
					$month_name = trim( (string) ( $month_row['name'] ?? '' ) );
					$month_id   = (string) $month_row['folderId'];
					if ( $month_name === '' || ! self::is_drive_month_segment( $month_name ) ) {
						continue;
					}
					$catalog[] = array(
						'folderId' => $month_id,
						'path'     => $purpose_name . ' / ' . $year_name . ' / ' . $month_name,
						'segments' => array( $purpose_name, $year_name, $month_name ),
					);
				}
			}
		}
		return $catalog;
	}

	/**
	 * @param array<int,array<string,mixed>> $aliases
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	private static function gemini_pick_delivery_subfolder(
		string $client_folder_id,
		string $client_folder_name,
		string $purpose_key,
		array $aliases,
		string $site_name,
		string $site_url,
		string $openrouter_model = ''
	): array {
		$catalog = self::build_client_delivery_path_catalog( $client_folder_id );
		$purpose_segments = self::resolve_path_segments( $purpose_key, $aliases );
		$default_segments = self::build_delivery_subfolder_segments( $purpose_segments );
		$default_path     = implode( ' / ', $default_segments );

		if ( empty( $catalog ) ) {
			return array(
				'statusCode' => 200,
				'body'       => array(
					'folderId'  => '',
					'segments'  => $default_segments,
					'pathLabel' => $default_path,
					'reason'    => 'empty_client_tree',
				),
			);
		}

		if ( ! class_exists( 'Neo_Pulse_App_Chat_Openrouter' ) ) {
			return array(
				'statusCode' => 503,
				'body'       => array( 'success' => false, 'error' => 'OpenRouter is not available for Google Drive folder lookup.' ),
			);
		}

		$lines       = array();
		$allowed_ids = array();
		foreach ( $catalog as $index => $entry ) {
			$folder_id = (string) ( $entry['folderId'] ?? '' );
			$path      = (string) ( $entry['path'] ?? '' );
			if ( $folder_id === '' || $path === '' ) {
				continue;
			}
			$allowed_ids[ $folder_id ] = true;
			$lines[]                   = sprintf( '%d. id=%s path=%s', $index + 1, $folder_id, $path );
		}

		if ( empty( $lines ) ) {
			return array(
				'statusCode' => 200,
				'body'       => array(
					'folderId'  => '',
					'segments'  => $default_segments,
					'pathLabel' => $default_path,
					'reason'    => 'empty_client_tree',
				),
			);
		}

		$edmonton      = self::edmonton_now();
		$current_month = self::drive_month_segment( $edmonton );
		$current_year  = self::drive_year_segment( $edmonton );
		$example_json  = wp_json_encode( $default_segments );
		$model         = $openrouter_model !== '' ? $openrouter_model : 'google/gemini-2.5-flash';
		$system        = 'You pick the Google Drive upload folder inside a client workspace. Reply JSON only. '
			. 'Either {"action":"use_existing","folderId":"...","reason":"..."} when a listed path is the current calendar month folder, '
			. 'or {"action":"create_path","segments":' . $example_json . ',"reason":"..."} when that month folder does not exist yet. '
			. 'Never upload to the client root, a purpose-only folder, a year-only folder, or a previous month. '
			. 'Sort by the current calendar month from Today, not the report data period. A file named for last month still belongs in the current calendar month folder. '
			. 'folderId must match a listed id exactly. segments must be purpose, year, current calendar month.';

		$user_parts = array(
			'Today: ' . $edmonton->format( 'Y-m-d' ) . ' (America/Edmonton).',
			'Current calendar month folder: ' . $current_month . '.',
			'Current year: ' . $current_year . '.',
			'Client folder: ' . $client_folder_name,
			'Client site name: ' . $site_name,
			'Deliverable purpose: ' . $purpose_key,
			'Expected path: ' . $default_path,
			'Existing month folders (use_existing only if the path is the current calendar month):',
			implode( "\n", $lines ),
			'If the current month folder is not listed, return create_path with the expected path segments.',
		);
		if ( $site_url !== '' ) {
			array_splice( $user_parts, 5, 0, array( 'Site URL: ' . $site_url ) );
		}

		try {
			$parsed = Neo_Pulse_App_Chat_Openrouter::json_completion(
				array(
					array(
						'role'    => 'system',
						'content' => $system,
					),
					array(
						'role'    => 'user',
						'content' => implode( "\n", $user_parts ),
					),
				),
				array(
					'model'       => $model,
					'temperature' => 0,
					'maxTokens'   => 400,
				)
			);
		} catch ( Exception $e ) {
			return array(
				'statusCode' => 502,
				'body'       => array(
					'success' => false,
					'error'   => 'Gemini delivery subfolder lookup failed: ' . $e->getMessage(),
				),
			);
		}

		$action = sanitize_text_field( (string) ( $parsed['action'] ?? '' ) );
		if ( $action === 'use_existing' ) {
			$folder_id = preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) ( $parsed['folderId'] ?? '' ) );
			if ( $folder_id === '' || ! isset( $allowed_ids[ $folder_id ] ) ) {
				return array(
					'statusCode' => 502,
					'body'       => array( 'success' => false, 'error' => 'Gemini picked a delivery folder outside the subpath catalog.' ),
				);
			}
			$path_label = $default_path;
			foreach ( $catalog as $entry ) {
				if ( (string) ( $entry['folderId'] ?? '' ) === $folder_id ) {
					$path_label = (string) ( $entry['path'] ?? $default_path );
					break;
				}
			}
			if ( strtolower( trim( $path_label ) ) !== strtolower( trim( $default_path ) ) ) {
				return array(
					'statusCode' => 502,
					'body'       => array(
						'success' => false,
						'error'   => 'Google Drive folder sort picked ' . $path_label . ' instead of the current calendar month (' . $default_path . ').',
					),
				);
			}
			return array(
				'statusCode' => 200,
				'body'       => array(
					'folderId'  => $folder_id,
					'segments'  => array(),
					'pathLabel' => $path_label,
					'reason'    => sanitize_text_field( (string) ( $parsed['reason'] ?? '' ) ),
				),
			);
		}

		if ( $action === 'create_path' ) {
			$segments = isset( $parsed['segments'] ) && is_array( $parsed['segments'] ) ? $parsed['segments'] : array();
			$normalized_segments = array();
			foreach ( $segments as $segment ) {
				$name = sanitize_text_field( (string) $segment );
				if ( $name !== '' ) {
					$normalized_segments[] = $name;
				}
			}
			if ( empty( $normalized_segments ) ) {
				$normalized_segments = $default_segments;
			}
			if ( ! self::drive_segments_match( $normalized_segments, $default_segments ) ) {
				return array(
					'statusCode' => 502,
					'body'       => array(
						'success' => false,
						'error'   => 'Google Drive folder create_path must be the current calendar month (' . $default_path . ').',
					),
				);
			}
			return array(
				'statusCode' => 200,
				'body'       => array(
					'folderId'  => '',
					'segments'  => $default_segments,
					'pathLabel' => $default_path,
					'reason'    => sanitize_text_field( (string) ( $parsed['reason'] ?? '' ) ),
				),
			);
		}

		return array(
			'statusCode' => 502,
			'body'       => array(
				'success' => false,
				'error'   => 'Google Drive folder sort returned an invalid action.',
			),
		);
	}

	/**
	 * @param array<int,string> $purpose_segments
	 * @return array<int,string>
	 */
	private static function build_delivery_subfolder_segments( array $purpose_segments ): array {
		if ( empty( $purpose_segments ) ) {
			return array();
		}
		return self::append_drive_date_segments( $purpose_segments );
	}
}
