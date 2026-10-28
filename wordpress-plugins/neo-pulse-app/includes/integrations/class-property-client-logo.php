<?php
/**
 * Uploaded Integrations property client logos (file-backed, not in sites JSON).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Property_Client_Logo {

	const MAX_BYTES = 3145728;

	/**
	 * @param string $site_id Property id from Integrations.
	 */
	public static function safe_site_id( string $site_id ): string {
		$site_id = trim( $site_id );
		$safe    = preg_replace( '/[^a-zA-Z0-9_-]/', '', $site_id );
		return is_string( $safe ) ? $safe : '';
	}

	/**
	 * @return string|null Absolute path to stored logo file.
	 */
	public static function file_path_for_site( string $site_id ): ?string {
		$safe = self::safe_site_id( $site_id );
		if ( $safe === '' ) {
			return null;
		}
		$dir = Neo_Pulse_App_Data_Paths::subdir( 'client-logos' );
		foreach ( array( 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg' ) as $ext ) {
			$path = $dir . '/' . $safe . '.' . $ext;
			if ( is_readable( $path ) ) {
				return $path;
			}
		}
		return null;
	}

	/**
	 * @return string Public API URL (relative /api/...).
	 */
	public static function public_api_path( string $site_id ): string {
		$safe = self::safe_site_id( $site_id );
		return '/api/manager-wordpress-properties/client-logo/' . rawurlencode( $safe );
	}

	/**
	 * @param array<string,mixed> $body Request JSON.
	 * @return array{status:int,body:array<string,mixed>}
	 */
	public static function upload( array $body ): array {
		$site_id = isset( $body['siteId'] ) ? self::safe_site_id( (string) $body['siteId'] ) : '';
		if ( $site_id === '' ) {
			return array( 'status' => 400, 'body' => array( 'ok' => false, 'error' => 'siteId is required' ) );
		}

		$data_url = isset( $body['dataUrl'] ) ? trim( (string) $body['dataUrl'] ) : '';
		if ( $data_url === '' || ! preg_match( '#^data:([^;]+);base64,(.+)$#', $data_url, $m ) ) {
			return array( 'status' => 400, 'body' => array( 'ok' => false, 'error' => 'dataUrl must be a base64 data image URL' ) );
		}

		$mime = strtolower( trim( $m[1] ) );
		$raw  = base64_decode( $m[2], true );
		if ( $raw === false || $raw === '' ) {
			return array( 'status' => 400, 'body' => array( 'ok' => false, 'error' => 'Invalid base64 image data' ) );
		}
		if ( strlen( $raw ) > self::MAX_BYTES ) {
			return array( 'status' => 413, 'body' => array( 'ok' => false, 'error' => 'Logo must be 3 MB or smaller' ) );
		}

		$ext = self::mime_to_ext( $mime );
		if ( $ext === null ) {
			return array( 'status' => 400, 'body' => array( 'ok' => false, 'error' => 'Unsupported image type' ) );
		}

		$dir  = Neo_Pulse_App_Data_Paths::subdir( 'client-logos' );
		$base = $dir . '/' . $site_id;
		foreach ( array( 'png', 'jpg', 'jpeg', 'webp', 'gif', 'svg' ) as $old_ext ) {
			$old = $base . '.' . $old_ext;
			if ( is_file( $old ) ) {
				wp_delete_file( $old );
			}
		}

		$path = $base . '.' . $ext;
		if ( file_put_contents( $path, $raw ) === false ) {
			return array( 'status' => 500, 'body' => array( 'ok' => false, 'error' => 'Could not save logo file' ) );
		}

		$logo_url = home_url( self::public_api_path( $site_id ) );
		return array(
			'status' => 200,
			'body'   => array(
				'ok'      => true,
				'logoUrl' => $logo_url,
			),
		);
	}

	/**
	 * @return array{status:int,body?:array<string,mixed>,headers?:array<string,string>,raw?:string}
	 */
	public static function serve( string $site_id ): array {
		$path = self::file_path_for_site( $site_id );
		if ( $path === null ) {
			return array( 'status' => 404, 'body' => array( 'error' => 'Logo not found' ) );
		}
		$raw  = file_get_contents( $path );
		$mime = wp_check_filetype( $path );
		$type = is_array( $mime ) && ! empty( $mime['type'] ) ? (string) $mime['type'] : 'application/octet-stream';
		if ( $raw === false ) {
			return array( 'status' => 500, 'body' => array( 'error' => 'Could not read logo file' ) );
		}
		return array(
			'status'  => 200,
			'headers' => array(
				'Content-Type'  => $type,
				'Cache-Control' => 'public, max-age=3600',
			),
			'raw'     => $raw,
		);
	}

	private static function mime_to_ext( string $mime ): ?string {
		switch ( $mime ) {
			case 'image/png':
				return 'png';
			case 'image/jpeg':
				return 'jpg';
			case 'image/webp':
				return 'webp';
			case 'image/gif':
				return 'gif';
			case 'image/svg+xml':
				return 'svg';
			default:
				return null;
		}
	}
}
