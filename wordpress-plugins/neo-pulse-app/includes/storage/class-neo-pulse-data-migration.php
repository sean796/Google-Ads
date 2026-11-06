<?php
/**
 * One-time move of neo-pulse-data out of the web-readable uploads folder.
 *
 * Copies the legacy uploads tree to Neo_Pulse_App_Data_Paths::root(),
 * verifies every file arrived with the same size, locks the legacy folder
 * with a deny .htaccess, empties it, and records the done flag. A file lock
 * ensures one worker migrates while concurrent requests keep reading the
 * legacy folder, so a large tree never triggers parallel copies of itself.
 * Safe to run on every bootstrap until the flag is set; re-running after
 * success is a no-op. On any failure the request is pinned to the legacy
 * folder and an admin error is shown, so data is never silently stranded.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Data_Migration {

	const OPTION_FLAG = 'neo_pulse_data_migrated_v1';

	public static function maybe_migrate(): void {
		if ( get_option( self::OPTION_FLAG ) ) {
			return;
		}
		$legacy = Neo_Pulse_App_Data_Paths::legacy_root();
		if ( ! is_dir( $legacy ) ) {
			update_option( self::OPTION_FLAG, 1 );
			return;
		}
		$target = Neo_Pulse_App_Data_Paths::root();
		if ( self::same_dir( $legacy, $target ) ) {
			update_option( self::OPTION_FLAG, 1 );
			return;
		}

		// One worker migrates; concurrent requests keep reading the legacy
		// folder until the done flag is set, so a large tree never triggers
		// parallel copies of itself.
		$lock = fopen( $target . '/.migration.lock', 'c' );
		if ( $lock === false || ! flock( $lock, LOCK_EX | LOCK_NB ) ) {
			if ( $lock !== false ) {
				fclose( $lock );
			}
			Neo_Pulse_App_Data_Paths::use_legacy_root_for_request();
			return;
		}

		try {
			$files = self::list_files( $legacy );
			if ( $files === array() ) {
				self::lock_legacy_dir( $legacy );
				update_option( self::OPTION_FLAG, 1 );
				return;
			}

			foreach ( $files as $rel ) {
				$src = $legacy . '/' . $rel;
				$dst = $target . '/' . $rel;
				if ( is_readable( $dst ) && filesize( $dst ) === filesize( $src ) ) {
					continue;
				}
				$dir = dirname( $dst );
				if ( ! is_dir( $dir ) && ! wp_mkdir_p( $dir ) ) {
					self::fail_loudly( 'could not create ' . $dir );
					return;
				}
				if ( ! copy( $src, $dst ) || filesize( $dst ) !== filesize( $src ) ) {
					self::fail_loudly( 'copy verification failed for ' . $rel );
					return;
				}
			}

			self::lock_legacy_dir( $legacy );
			foreach ( $files as $rel ) {
				if ( $rel === 'index.php' ) {
					continue;
				}
				unlink( $legacy . '/' . $rel );
			}
			self::remove_empty_subdirs( $legacy );
			update_option( self::OPTION_FLAG, 1 );
			error_log( '[neo-pulse] data migration complete: ' . count( $files ) . ' file(s) moved out of uploads.' );
		} finally {
			flock( $lock, LOCK_UN );
			fclose( $lock );
		}
	}

	private static function same_dir( string $a, string $b ): bool {
		$norm = static function ( string $p ): string {
			return rtrim( str_replace( '\\', '/', $p ), '/' );
		};
		return $norm( $a ) === $norm( $b );
	}

	/**
	 * Relative file paths under $root, sorted for stable verification.
	 *
	 * @return string[]
	 */
	private static function list_files( string $root ): array {
		$out      = array();
		$iterator = new RecursiveIteratorIterator(
			new RecursiveDirectoryIterator( $root, FilesystemIterator::SKIP_DOTS )
		);
		foreach ( $iterator as $entry ) {
			if ( $entry->isFile() ) {
				$out[] = str_replace( '\\', '/', substr( $entry->getPathname(), strlen( $root ) + 1 ) );
			}
		}
		sort( $out );
		return $out;
	}

	private static function lock_legacy_dir( string $legacy ): void {
		$rules = "# NEO Pulse: data moved out of this folder. Nothing here is web-readable.\n"
			. "<IfModule mod_authz_core.c>\nRequire all denied\n</IfModule>\n"
			. "<IfModule !mod_authz_core.c>\nDeny from all\n</IfModule>\n";
		file_put_contents( $legacy . '/.htaccess', $rules );
		if ( ! file_exists( $legacy . '/index.php' ) ) {
			file_put_contents( $legacy . '/index.php', '<?php // silence' );
		}
	}

	private static function remove_empty_subdirs( string $root ): void {
		$dirs = array();
		$iterator = new RecursiveIteratorIterator(
			new RecursiveDirectoryIterator( $root, FilesystemIterator::SKIP_DOTS ),
			RecursiveIteratorIterator::CHILD_FIRST
		);
		foreach ( $iterator as $entry ) {
			if ( $entry->isDir() ) {
				$dirs[] = $entry->getPathname();
			}
		}
		foreach ( $dirs as $dir ) {
			$left = scandir( $dir );
			if ( is_array( $left ) && count( $left ) === 2 ) {
				rmdir( $dir );
			}
		}
	}

	private static function fail_loudly( string $reason ): void {
		Neo_Pulse_App_Data_Paths::use_legacy_root_for_request();
		error_log( '[neo-pulse] data migration failed: ' . $reason . '. Still reading from the legacy uploads folder for this request.' );
		add_action(
			'admin_notices',
			static function () use ( $reason ) {
				echo '<div class="notice notice-error"><p><strong>NEO Pulse data move failed:</strong> '
					. esc_html( $reason )
					. '. Data still reads from wp-content/uploads/neo-pulse-data. Make the folder above the web root writable (or define NEO_PULSE_DATA_DIR), then reload.</p></div>';
			}
		);
	}
}
