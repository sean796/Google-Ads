<?php
/**
 * SERP JSON dump read/write under the private neo-pulse-data root (serp-dumps/).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Dataforseo_Serp_Dumps {

	/** @var string[] Keys dropped before persist (layout noise, huge blobs). */
	const STRIP_KEYS = array(
		'xpath',
		'rectangle',
		'rectangles',
		'spell',
		'highlighted',
		'about_this_result',
	);

	public static function dir(): string {
		return Neo_Pulse_App_Data_Paths::subdir( 'serp-dumps' );
	}

	public static function is_safe_filename( string $filename ): bool {
		return $filename !== '' && (bool) preg_match( '/^[a-zA-Z0-9._-]+$/', $filename );
	}

	public static function path_for( string $filename ): string {
		$filename = sanitize_file_name( $filename );
		return self::dir() . '/' . $filename;
	}

	/**
	 * @param mixed $data
	 * @return mixed
	 */
	private static function strip_serp_noise( $data ) {
		if ( ! is_array( $data ) ) {
			return $data;
		}
		$is_list = array_keys( $data ) === range( 0, count( $data ) - 1 );
		if ( $is_list ) {
			$out = array();
			foreach ( $data as $item ) {
				$out[] = self::strip_serp_noise( $item );
			}
			return $out;
		}
		$out = array();
		foreach ( $data as $key => $val ) {
			if ( is_string( $key ) && in_array( $key, self::STRIP_KEYS, true ) ) {
				continue;
			}
			$out[ $key ] = self::strip_serp_noise( $val );
		}
		return $out;
	}

	/**
	 * Compact JSON write tuned for large SERP payloads.
	 *
	 * @param array<string,mixed>|array<int,mixed> $payload
	 */
	private static function write_json_file( string $path, array $payload ): bool {
		$dir = dirname( $path );
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		if ( ! is_dir( $dir ) || ! is_writable( $dir ) ) {
			error_log( 'neo-pulse serp dump dir not writable: ' . $dir );
			return false;
		}

		$json = json_encode(
			$payload,
			JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE,
			1024
		);
		if ( $json === false ) {
			error_log( 'neo-pulse serp dump json_encode failed: ' . json_last_error_msg() );
			return false;
		}

		$tmp = $path . '.tmp.' . wp_generate_password( 8, false );
		if ( file_put_contents( $tmp, $json ) === false ) {
			error_log( 'neo-pulse serp dump temp write failed: ' . $tmp );
			return false;
		}
		if ( ! rename( $tmp, $path ) ) {
			@unlink( $tmp );
			error_log( 'neo-pulse serp dump rename failed: ' . $path );
			return false;
		}
		return is_readable( $path ) && filesize( $path ) > 0;
	}

	/**
	 * @return string|null Stored filename or null on failure.
	 */
	public static function write( string $keyword_hint, array $payload ): ?string {
		$safe = preg_replace( '/[^a-z0-9\-_.]+/i', '_', trim( $keyword_hint ) );
		$safe = substr( $safe !== '' ? $safe : 'keyword', 0, 80 );
		$ts   = gmdate( 'Y-m-d\TH-i-s-\Z' );
		$suffix = bin2hex( random_bytes( 4 ) );
		$name = $safe . '__' . $ts . '__' . $suffix . '.json';
		$path = self::path_for( $name );

		$trimmed = self::strip_serp_noise( $payload );
		if ( ! is_array( $trimmed ) ) {
			$trimmed = $payload;
		}

		if ( ! self::write_json_file( $path, $trimmed ) ) {
			return null;
		}
		return $name;
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function read( string $filename ): ?array {
		if ( ! self::is_safe_filename( $filename ) ) {
			return null;
		}
		$path = self::path_for( $filename );
		$real = realpath( $path );
		$base = realpath( self::dir() );
		if ( $real === false || $base === false || strpos( $real, $base ) !== 0 ) {
			return null;
		}
		$data = Neo_Pulse_App_Json_File_Store::read( $real );
		return is_array( $data ) ? $data : null;
	}

	public static function exists( string $filename ): bool {
		return self::read( $filename ) !== null;
	}
}
