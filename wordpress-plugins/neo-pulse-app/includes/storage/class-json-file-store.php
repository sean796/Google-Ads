<?php
/**
 * Atomic JSON read/write for neo-pulse-data files.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Json_File_Store {

	/**
	 * @return array<string,mixed>|array<int,mixed>|null
	 */
	public static function read( string $path ) {
		if ( ! is_readable( $path ) ) {
			return null;
		}
		$raw = file_get_contents( $path );
		if ( $raw === false || $raw === '' ) {
			return null;
		}
		$data = json_decode( $raw, true );
		return is_array( $data ) ? $data : null;
	}

	/**
	 * Locked read-modify-write. The mutator receives the current decoded
	 * value (null when the file is missing or unreadable) and returns the
	 * array to store; returning anything else aborts without writing.
	 * Writers serialize on a sidecar lock file, so a value computed from
	 * the current contents can never be overwritten by a stale read.
	 * Use write() instead when the new value does not depend on the old.
	 *
	 * @param callable $mutator fn(array|null): mixed
	 */
	public static function update( string $path, callable $mutator ): bool {
		$dir = dirname( $path );
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		$lock = fopen( $path . '.lock', 'c' );
		if ( $lock === false ) {
			return false;
		}
		try {
			if ( ! flock( $lock, LOCK_EX ) ) {
				return false;
			}
			$next = $mutator( self::read( $path ) );
			if ( ! is_array( $next ) ) {
				return false;
			}
			return self::write( $path, $next );
		} finally {
			flock( $lock, LOCK_UN );
			fclose( $lock );
		}
	}

	/**
	 * @param mixed $data
	 */
	public static function write( string $path, $data ): bool {
		$dir = dirname( $path );
		if ( ! is_dir( $dir ) ) {
			wp_mkdir_p( $dir );
		}
		$json = wp_json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES );
		if ( $json === false ) {
			return false;
		}
		$tmp = $path . '.tmp.' . wp_generate_password( 8, false );
		if ( file_put_contents( $tmp, $json ) === false ) {
			return false;
		}
		return rename( $tmp, $path );
	}
}
