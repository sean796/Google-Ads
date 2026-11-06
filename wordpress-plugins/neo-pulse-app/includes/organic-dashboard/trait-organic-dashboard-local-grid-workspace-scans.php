<?php
/**
 * Local grid workspace, saved scan, and map snapshot storage.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Organic_Dashboard_Local_Grid_Trait_Workspace_Scans {

	/**
	 * @param string $site_id Optional site ID for client-scoped workspace.
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function load_workspace( string $site_id = '' ): array {
		$site_id = trim( $site_id );
		$path    = self::workspace_path( $site_id );
		$data    = Neo_Pulse_App_Json_File_Store::read( $path );
		if ( ! is_array( $data ) && $site_id !== '' ) {
			// Fallback to legacy global workspace if client-specific does not exist yet
			$global_data = Neo_Pulse_App_Json_File_Store::read( self::workspace_path() );
			if ( is_array( $global_data ) && ! empty( $global_data['panels'] ) ) {
				$site_panels = array_values(
					array_filter(
						$global_data['panels'],
						function ( $p ) use ( $site_id ) {
							return is_array( $p ) && ( $p['siteId'] ?? '' ) === $site_id;
						}
					)
				);
				if ( ! empty( $site_panels ) ) {
					$data = array(
						'version'       => 1,
						'updatedAt'     => gmdate( 'c' ),
						'activePanelId' => $site_panels[0]['id'] ?? '',
						'panels'        => $site_panels,
					);
				}
			}
		}
		if ( ! is_array( $data ) ) {
			return array(
				'statusCode' => 200,
				'body'       => array(
					'ok'        => true,
					'workspace' => null,
				),
			);
		}
		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'        => true,
				'workspace' => $data,
			),
		);
	}

	/**
	 * @param array<string,mixed> $body Request payload.
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function save_workspace( array $body ): array {
		$site_id   = isset( $body['siteId'] ) ? trim( (string) $body['siteId'] ) : '';
		$workspace = isset( $body['workspace'] ) && is_array( $body['workspace'] ) ? $body['workspace'] : null;
		if ( $workspace === null ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'workspace object is required.',
				),
			);
		}
		if ( ( $workspace['version'] ?? null ) !== 1 ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'Unsupported workspace version.',
				),
			);
		}
		$panels = isset( $workspace['panels'] ) && is_array( $workspace['panels'] ) ? $workspace['panels'] : array();
		if ( empty( $panels ) || count( $panels ) > 12 ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'Workspace must include 1–12 panels.',
				),
			);
		}
		$active_panel_id = isset( $workspace['activePanelId'] ) ? trim( (string) $workspace['activePanelId'] ) : '';
		$normalized      = array();
		foreach ( $panels as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$id = isset( $row['id'] ) ? trim( (string) $row['id'] ) : '';
			if ( $id === '' ) {
				continue;
			}
			$row_site_id = isset( $row['siteId'] ) ? trim( (string) $row['siteId'] ) : '';
			if ( $row_site_id === '' ) {
				continue;
			}
			if ( $site_id === '' ) {
				$site_id = $row_site_id;
			}
			$normalized[] = array(
				'id'             => substr( $id, 0, 64 ),
				'siteId'         => substr( $row_site_id, 0, 96 ),
				'layoutLocked'   => ! empty( $row['layoutLocked'] ),
				'layoutSnapshot' => isset( $row['layoutSnapshot'] ) && is_array( $row['layoutSnapshot'] ) ? $row['layoutSnapshot'] : null,
			);
		}
		if ( empty( $normalized ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'No valid panels in workspace.',
				),
			);
		}
		$active_ok = false;
		foreach ( $normalized as $panel ) {
			if ( $panel['id'] === $active_panel_id ) {
				$active_ok = true;
				break;
			}
		}
		if ( ! $active_ok ) {
			$active_panel_id = $normalized[0]['id'];
		}
		$doc = array(
			'version'       => 1,
			'updatedAt'     => gmdate( 'c' ),
			'activePanelId' => $active_panel_id,
			'panels'        => $normalized,
		);
		Neo_Pulse_App_Json_File_Store::write( self::workspace_path( $site_id ), $doc );
		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'        => true,
				'workspace' => $doc,
			),
		);
	}

	public static function list_history( string $site_id ): array {
		$site_id = trim( $site_id );
		if ( $site_id === '' ) {
			return array( 'statusCode' => 400, 'body' => array( 'ok' => false, 'error' => 'siteId is required.' ) );
		}
		$index = Neo_Pulse_App_Json_File_Store::read( self::index_path( $site_id ) );
		$scans = is_array( $index ) && isset( $index['scans'] ) && is_array( $index['scans'] ) ? $index['scans'] : array();
		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'    => true,
				'scans' => array_values( $scans ),
			),
		);
	}

	public static function load_scan( string $site_id, string $scan_id ): array {
		$site_id = trim( $site_id );
		$scan_id = trim( $scan_id );
		if ( $site_id === '' || $scan_id === '' ) {
			return array( 'statusCode' => 400, 'body' => array( 'ok' => false, 'error' => 'siteId and scanId are required.' ) );
		}
		$doc = Neo_Pulse_App_Json_File_Store::read( self::scan_path( $site_id, $scan_id ) );
		if ( ! is_array( $doc ) ) {
			return array( 'statusCode' => 404, 'body' => array( 'ok' => false, 'error' => 'Scan not found.' ) );
		}
		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'   => true,
				'scan' => $doc,
			),
		);
	}

	public static function save_scan( array $body ): array {
		$site_id = isset( $body['siteId'] ) ? trim( (string) $body['siteId'] ) : '';
		$scan    = isset( $body['scan'] ) && is_array( $body['scan'] ) ? $body['scan'] : null;
		if ( $site_id === '' || $scan === null || empty( $scan['scanId'] ) ) {
			return array( 'statusCode' => 400, 'body' => array( 'ok' => false, 'error' => 'siteId and scan with scanId are required.' ) );
		}
		$scan_id = (string) $scan['scanId'];
		Neo_Pulse_App_Json_File_Store::write( self::scan_path( $site_id, $scan_id ), $scan );

		$summary = array(
			'scanId'          => $scan_id,
			'siteId'          => $site_id,
			'scanDateIso'     => (string) ( $scan['scanDateIso'] ?? gmdate( 'c' ) ),
			'scanDateLabel'   => (string) ( $scan['scanDateLabel'] ?? gmdate( 'M j, Y g:i A' ) ),
			'keyword'         => (string) ( $scan['keyword'] ?? '' ),
			'scanSize'        => (string) ( $scan['scanSize'] ?? '1x1' ),
			'shape'           => (string) ( $scan['shape'] ?? 'circle' ),
			'distance'        => isset( $scan['distance'] ) ? (float) $scan['distance'] : 1.0,
			'distanceMeasure' => (string) ( $scan['distanceMeasure'] ?? 'mile' ),
			'targetBusiness'  => (string) ( $scan['targetBusiness']['business'] ?? '' ),
			'pointCount'      => isset( $scan['points'] ) && is_array( $scan['points'] ) ? count( $scan['points'] ) : 0,
			'avgRank'         => isset( $scan['summary']['avgRank'] ) && is_numeric( $scan['summary']['avgRank'] ) ? (float) $scan['summary']['avgRank'] : null,
			'tarp'            => isset( $scan['summary']['tarp'] ) && is_numeric( $scan['summary']['tarp'] ) ? (float) $scan['summary']['tarp'] : null,
		);

		$index_file = self::index_path( $site_id );
		$index      = Neo_Pulse_App_Json_File_Store::read( $index_file );
		$existing   = is_array( $index ) && isset( $index['scans'] ) && is_array( $index['scans'] ) ? $index['scans'] : array();
		$next       = array( $summary );
		foreach ( $existing as $row ) {
			if ( is_array( $row ) && ( $row['scanId'] ?? '' ) !== $scan_id ) {
				$next[] = $row;
			}
		}
		usort(
			$next,
			static function ( $a, $b ) {
				return strcmp( (string) ( $b['scanDateIso'] ?? '' ), (string) ( $a['scanDateIso'] ?? '' ) );
			}
		);
		Neo_Pulse_App_Json_File_Store::write( $index_file, array( 'scans' => array_slice( $next, 0, 100 ) ) );

		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'          => true,
				'scanSummary' => $summary,
			),
		);
	}

	/**
	 * Persist a PNG snapshot of the Local Grid map (base64 data URL from the browser).
	 *
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function save_map_image( array $body ): array {
		$site_id = isset( $body['siteId'] ) ? trim( (string) $body['siteId'] ) : '';
		$scan_id = isset( $body['scanId'] ) ? trim( (string) $body['scanId'] ) : '';
		$data_url = isset( $body['imageDataUrl'] ) ? trim( (string) $body['imageDataUrl'] ) : '';
		if ( $site_id === '' || $scan_id === '' || $data_url === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'siteId, scanId, and imageDataUrl are required.',
				),
			);
		}
		if ( ! preg_match( '#^data:image/(png|jpeg);base64,(.+)$#', $data_url, $m ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'imageDataUrl must be a PNG or JPEG data URL.',
				),
			);
		}
		$raw = base64_decode( $m[2], true );
		if ( $raw === false || strlen( $raw ) < 32 ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'Could not decode map snapshot.',
				),
			);
		}
		if ( strlen( $raw ) > 4 * 1024 * 1024 ) {
			return array(
				'statusCode' => 413,
				'body'       => array(
					'ok'    => false,
					'error' => 'Map snapshot is too large.',
				),
			);
		}
		$path = self::map_image_path( $site_id, $scan_id );
		$dir  = dirname( $path );
		if ( ! is_dir( $dir ) && ! wp_mkdir_p( $dir ) ) {
			return array(
				'statusCode' => 500,
				'body'       => array(
					'ok'    => false,
					'error' => 'Could not store map snapshot.',
				),
			);
		}
		if ( file_put_contents( $path, $raw ) === false ) {
			return array(
				'statusCode' => 500,
				'body'       => array(
					'ok'    => false,
					'error' => 'Could not write map snapshot.',
				),
			);
		}
		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok' => true,
			),
		);
	}

	/**
	 * @return array{statusCode:int,body?:array<string,mixed>,file?:string,contentType?:string}
	 */
	public static function serve_map_image( string $site_id, string $scan_id ): array {
		$site_id = trim( $site_id );
		$scan_id = trim( $scan_id );
		if ( $site_id === '' || $scan_id === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'siteId and scanId are required.',
				),
			);
		}
		$path = self::map_image_path( $site_id, $scan_id );
		if ( ! is_readable( $path ) ) {
			return array(
				'statusCode' => 404,
				'body'       => array(
					'ok'    => false,
					'error' => 'Map snapshot not found.',
				),
			);
		}
		return array(
			'statusCode'  => 200,
			'file'        => $path,
			'contentType' => 'image/png',
		);
	}

	public static function delete_scan( array $body ): array {
		$site_id = isset( $body['siteId'] ) ? trim( (string) $body['siteId'] ) : '';
		$scan_id = isset( $body['scanId'] ) ? trim( (string) $body['scanId'] ) : '';
		if ( $site_id === '' || $scan_id === '' ) {
			return array( 'statusCode' => 400, 'body' => array( 'ok' => false, 'error' => 'siteId and scanId are required.' ) );
		}
		$path = self::scan_path( $site_id, $scan_id );
		if ( file_exists( $path ) ) {
			@unlink( $path );
		}
		$map_png = self::map_image_path( $site_id, $scan_id );
		if ( file_exists( $map_png ) ) {
			@unlink( $map_png );
		}
		$index_file = self::index_path( $site_id );
		$index      = Neo_Pulse_App_Json_File_Store::read( $index_file );
		$existing   = is_array( $index ) && isset( $index['scans'] ) && is_array( $index['scans'] ) ? $index['scans'] : array();
		$filtered   = array_values(
			array_filter(
				$existing,
				static function ( $row ) use ( $scan_id ) {
					return is_array( $row ) && ( $row['scanId'] ?? '' ) !== $scan_id;
				}
			)
		);
		Neo_Pulse_App_Json_File_Store::write( $index_file, array( 'scans' => $filtered ) );
		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'    => true,
				'scans' => $filtered,
			),
		);
	}
}
