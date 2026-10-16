<?php
/**
 * EMCP Packager — the `.emcp` binary archive format with chunked streaming.
 *
 * Single-file backups: files are streamed directly into the archive with no
 * intermediate ZIP compression, in resumable time-bounded chunks. Ported from
 * the 5dp `FiveDPBR_Packager` (format preserved; magic/footer/ext re-branded).
 *
 * Format (v1): magic (5B "EMCP1") + version (1B) + manifest_len (4B uint32 LE)
 * + manifest JSON + entries [prefix_len(2) + prefix + name_len(2) + name +
 * size(8 uint64 LE) + raw data] + footer (8B "EMCP-END").
 *
 * @package EMCP_Tools
 * @since   3.12.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @since 3.12.0
 */
class EMCP_Tools_Packager {

	const MAGIC     = 'EMCP1';
	const VERSION   = 1;
	const FOOTER    = 'EMCP-END';
	const EXTENSION = '.emcp';

	/** Stream copy buffer size — 2 MB (fewer read/write syscalls for large files). */
	const BUFFER_SIZE = 2097152;

	/** Fallback per-chunk time limit (seconds) when the caller passes none. */
	const CHUNK_TIMEOUT = 10;

	// ---------------------------------------------------------------------
	// Chunked streaming API (for the backup engine)
	// ---------------------------------------------------------------------

	/**
	 * Initialize a new `.emcp` archive and write header + manifest.
	 *
	 * @param string $output_path Full path for the .emcp file.
	 * @param array  $manifest    Manifest array (JSON-encoded into the header).
	 * @return array|WP_Error Initial packaging state.
	 */
	public static function init_stream( $output_path, $manifest ) {
		$fh = fopen( $output_path, 'wb' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( ! $fh ) {
			return new \WP_Error( 'emcp_open', __( 'Cannot create .emcp package file.', 'emcp-tools' ) );
		}
		$manifest_json = self::json( $manifest );
		fwrite( $fh, self::MAGIC );                            // 5 bytes
		fwrite( $fh, pack( 'C', self::VERSION ) );             // 1 byte
		fwrite( $fh, pack( 'V', strlen( $manifest_json ) ) );  // 4 bytes uint32 LE
		fwrite( $fh, $manifest_json );                         // variable
		$data_offset = ftell( $fh );
		fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		return array(
			'output_path'    => $output_path,
			'data_offset'    => $data_offset,
			'archive_offset' => $data_offset,
			'entry_count'    => 0,
			'total_bytes'    => 0,
		);
	}

	/**
	 * Stream files from a CSV list into the archive (one time-bounded chunk).
	 *
	 * @param array  $state       Packaging state.
	 * @param string $filelist    Path to a CSV file list (relative path per line).
	 * @param string $source_dir  Source root (e.g. ABSPATH).
	 * @param int    $list_offset Byte offset into the file list.
	 * @param int    $file_offset Byte offset into the current file.
	 * @return array|true|WP_Error Updated {state,list_offset,file_offset}, or true when done.
	 */
	public static function stream_chunk( $state, $filelist, $source_dir, $list_offset = 0, $file_offset = 0, $max_seconds = null ) {
		$source_dir = trailingslashit( $source_dir );
		$start_time = microtime( true );
		// How long to stream before yielding this chunk. The caller passes the
		// host's safe execution time (often 25s) so we make FEWER, longer chunks
		// — each background chunk is a wp-cron/AJAX round-trip, so halving the
		// count roughly halves the dispatch + poll overhead. Falls back to the
		// conservative 10s const for callers that don't pass it.
		$timeout = ( null !== $max_seconds && $max_seconds > 0 ) ? (float) $max_seconds : (float) self::CHUNK_TIMEOUT;

		$archive_fh = fopen( $state['output_path'], 'r+b' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( ! $archive_fh ) {
			return new \WP_Error( 'emcp_open', __( 'Cannot open .emcp archive for writing.', 'emcp-tools' ) );
		}
		fseek( $archive_fh, $state['archive_offset'] );

		$list_fh = fopen( $filelist, 'rb' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( ! $list_fh ) {
			fclose( $archive_fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			return new \WP_Error( 'emcp_list', __( 'Cannot open file list.', 'emcp-tools' ) );
		}
		if ( $list_offset > 0 ) {
			fseek( $list_fh, $list_offset );
		}

		$completed       = true;
		$new_list_offset = $list_offset;

		while ( ( $line = fgets( $list_fh ) ) !== false ) {
			$relative = trim( $line );
			if ( '' === $relative ) {
				$new_list_offset = ftell( $list_fh );
				continue;
			}
			$full_path = $source_dir . $relative;
			if ( ! is_file( $full_path ) || ! is_readable( $full_path ) ) {
				$new_list_offset = ftell( $list_fh );
				continue;
			}
			$file_size = filesize( $full_path );
			$name      = basename( $relative );
			$prefix    = dirname( $relative );
			if ( '.' === $prefix ) {
				$prefix = '';
			}

			if ( $file_offset > 0 ) {
				$remaining = $file_size - $file_offset;
			} else {
				// Write the whole entry header in a single fwrite (one syscall
				// instead of five, per file — adds up across tens of thousands).
				fwrite(
					$archive_fh,
					pack( 'v', strlen( $prefix ) ) . $prefix . pack( 'v', strlen( $name ) ) . $name . pack( 'P', $file_size )
				);
				$remaining   = $file_size;
				$file_offset = 0;
			}

			$sfh = fopen( $full_path, 'rb' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			if ( $sfh ) {
				if ( $file_offset > 0 ) {
					fseek( $sfh, $file_offset );
				}
				while ( $remaining > 0 ) {
					$data = fread( $sfh, min( self::BUFFER_SIZE, $remaining ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions
					if ( false === $data || '' === $data ) {
						break;
					}
					fwrite( $archive_fh, $data );
					$bytes_read            = strlen( $data );
					$remaining            -= $bytes_read;
					$file_offset          += $bytes_read;
					$state['total_bytes'] += $bytes_read;

					if ( ( microtime( true ) - $start_time ) > $timeout ) {
						fclose( $sfh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
						$state['archive_offset'] = ftell( $archive_fh );
						// Capture the list position BEFORE closing the handle — the
						// file-finished branch below needs it, and ftell() on a closed
						// resource is a fatal ("supplied resource is not a valid stream
						// resource") that crashes the whole chunk and stalls the job.
						$list_after = ftell( $list_fh );
						fclose( $archive_fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
						fclose( $list_fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
						if ( $remaining > 0 ) {
							return array( 'state' => $state, 'list_offset' => $new_list_offset, 'file_offset' => $file_offset );
						}
						++$state['entry_count'];
						return array( 'state' => $state, 'list_offset' => $list_after, 'file_offset' => 0 );
					}
				}
				fclose( $sfh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			}

			++$state['entry_count'];
			$file_offset     = 0;
			$new_list_offset = ftell( $list_fh );
			if ( ( microtime( true ) - $start_time ) > $timeout ) {
				$completed = false;
				break;
			}
		}

		$state['archive_offset'] = ftell( $archive_fh );
		fclose( $archive_fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		fclose( $list_fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions

		if ( $completed ) {
			return true;
		}
		return array( 'state' => $state, 'list_offset' => $new_list_offset, 'file_offset' => 0 );
	}

	/**
	 * Append a single file entry to an open archive (e.g. the SQL dump).
	 *
	 * @param array  $state     Packaging state.
	 * @param string $file_path Absolute path.
	 * @param string $name      Entry name.
	 * @param string $prefix    Entry prefix.
	 * @return array Updated state.
	 */
	public static function add_file( $state, $file_path, $name, $prefix = '' ) {
		if ( ! file_exists( $file_path ) || ! is_readable( $file_path ) ) {
			return $state;
		}
		$fh = fopen( $state['output_path'], 'r+b' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( ! $fh ) {
			return $state;
		}
		fseek( $fh, $state['archive_offset'] );
		$file_size = filesize( $file_path );
		fwrite( $fh, pack( 'v', strlen( $prefix ) ) );
		fwrite( $fh, $prefix );
		fwrite( $fh, pack( 'v', strlen( $name ) ) );
		fwrite( $fh, $name );
		fwrite( $fh, pack( 'P', $file_size ) );
		$sfh = fopen( $file_path, 'rb' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( $sfh ) {
			while ( ! feof( $sfh ) ) {
				$chunk = fread( $sfh, self::BUFFER_SIZE ); // phpcs:ignore WordPress.WP.AlternativeFunctions
				if ( false !== $chunk && '' !== $chunk ) {
					fwrite( $fh, $chunk );
				}
			}
			fclose( $sfh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		}
		$state['archive_offset'] = ftell( $fh );
		++$state['entry_count'];
		$state['total_bytes'] += $file_size;
		fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		return $state;
	}

	/**
	 * Finalize the archive by writing the footer.
	 *
	 * @param array $state Packaging state.
	 * @return true|WP_Error
	 */
	public static function finalize( $state ) {
		$fh = fopen( $state['output_path'], 'r+b' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( ! $fh ) {
			return new \WP_Error( 'emcp_finalize', __( 'Cannot finalize .emcp archive.', 'emcp-tools' ) );
		}
		fseek( $fh, $state['archive_offset'] );
		fwrite( $fh, self::FOOTER );
		fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		return true;
	}

	// ---------------------------------------------------------------------
	// File-list helper
	// ---------------------------------------------------------------------

	/**
	 * Enumerate files under $source_dir into a CSV list; returns the count.
	 *
	 * @param string $output_file CSV list path to write.
	 * @param string $source_dir  Directory to scan.
	 * @param array  $include     Include patterns (empty = all).
	 * @param array  $exclude     Extra excludes.
	 * @return int
	 */
	public static function enumerate_files( $output_file, $source_dir, $include = array(), $exclude = array() ) {
		$source_dir   = trailingslashit( wp_normalize_path( $source_dir ) );
		$count        = 0;
		$all_excludes = class_exists( 'EMCP_Tools_File_Archiver' ) ? EMCP_Tools_File_Archiver::DEFAULT_EXCLUDES : array( 'wp-content/cache', 'wp-content/emcp-backups', 'node_modules', '.git' );
		$all_excludes = array_merge( $all_excludes, class_exists( 'EMCP_Tools_Backup_Location' ) ? EMCP_Tools_Backup_Location::excludes() : array(), (array) $exclude );

		$settings = get_option( 'emcp_tools_migrate_settings', array() );
		if ( ! empty( $settings['exclude_paths'] ) ) {
			$all_excludes = array_merge( $all_excludes, array_filter( array_map( 'trim', explode( "\n", $settings['exclude_paths'] ) ) ) );
		}

		$fh = fopen( $output_file, 'wb' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( ! $fh ) {
			return 0;
		}
		try {
			$iterator = new \RecursiveIteratorIterator(
				new \RecursiveDirectoryIterator( $source_dir, \RecursiveDirectoryIterator::SKIP_DOTS | \RecursiveDirectoryIterator::FOLLOW_SYMLINKS ),
				\RecursiveIteratorIterator::SELF_FIRST
			);
			foreach ( $iterator as $file ) {
				if ( ! $file->isFile() ) {
					continue;
				}
				$relative = str_replace( $source_dir, '', wp_normalize_path( $file->getPathname() ) );
				if ( ! empty( $include ) ) {
					$matched = false;
					foreach ( $include as $pattern ) {
						$pattern = trim( $pattern );
						if ( '' !== $pattern && ( 0 === strpos( $relative, $pattern ) || fnmatch( $pattern, $relative ) ) ) {
							$matched = true;
							break;
						}
					}
					if ( ! $matched ) {
						continue;
					}
				}
				if ( self::path_excluded( $relative, $all_excludes ) ) {
					continue;
				}
				fwrite( $fh, $relative . "\n" );
				++$count;
			}
		} catch ( \Exception $e ) {
			// Best-effort enumeration; skip on iterator error.
		}
		fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		return $count;
	}

	// ---------------------------------------------------------------------
	// Read / extract / validate
	// ---------------------------------------------------------------------

	/**
	 * Read the manifest from an `.emcp` file without extracting.
	 *
	 * @param string $package_path Path.
	 * @return array|WP_Error
	 */
	public static function read_manifest( $package_path ) {
		$fh = fopen( $package_path, 'rb' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( ! $fh ) {
			return new \WP_Error( 'emcp_read', __( 'Cannot open .emcp package.', 'emcp-tools' ) );
		}
		$magic = fread( $fh, 5 ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( self::MAGIC !== $magic ) {
			fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			return new \WP_Error( 'emcp_magic', __( 'Not a valid .emcp package.', 'emcp-tools' ) );
		}
		fread( $fh, 1 ); // version // phpcs:ignore WordPress.WP.AlternativeFunctions
		$header        = unpack( 'Vmanifest_len', fread( $fh, 4 ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		$manifest_json = fread( $fh, $header['manifest_len'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		$manifest = json_decode( $manifest_json, true );
		if ( null === $manifest ) {
			return new \WP_Error( 'emcp_manifest', __( 'Corrupt manifest in .emcp package.', 'emcp-tools' ) );
		}
		return $manifest;
	}

	/**
	 * Extract an `.emcp` package to a directory. Writes manifest.json + files.
	 *
	 * @param string $package_path Path.
	 * @param string $extract_dir  Destination directory.
	 * @return array|WP_Error Manifest.
	 */
	public static function extract( $package_path, $extract_dir ) {
		$fh = fopen( $package_path, 'rb' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( ! $fh ) {
			return new \WP_Error( 'emcp_read', __( 'Cannot open .emcp package.', 'emcp-tools' ) );
		}
		$magic = fread( $fh, 5 ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( self::MAGIC !== $magic ) {
			fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			return new \WP_Error( 'emcp_magic', __( 'Not a valid .emcp package.', 'emcp-tools' ) );
		}
		fread( $fh, 1 ); // version // phpcs:ignore WordPress.WP.AlternativeFunctions
		$header        = unpack( 'Vmanifest_len', fread( $fh, 4 ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		$manifest_json = fread( $fh, $header['manifest_len'] ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		$manifest      = json_decode( $manifest_json, true );

		$extract_dir = trailingslashit( $extract_dir );
		wp_mkdir_p( $extract_dir );
		file_put_contents( $extract_dir . 'manifest.json', $manifest_json ); // phpcs:ignore WordPress.WP.AlternativeFunctions

		// The footer's first two + remaining six bytes ("EMCP-END").
		$foot_head = substr( self::FOOTER, 0, 2 );
		$foot_rest = substr( self::FOOTER, 2 );

		while ( ! feof( $fh ) ) {
			$peek = fread( $fh, 2 ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			if ( false === $peek || strlen( $peek ) < 2 ) {
				break;
			}
			if ( $foot_head === $peek ) {
				$rest = fread( $fh, strlen( $foot_rest ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions
				if ( $foot_rest === $rest ) {
					break; // Footer reached.
				}
				fseek( $fh, -( 2 + strlen( $foot_rest ) ), SEEK_CUR );
				$peek = fread( $fh, 2 ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			}
			$prefix_len = unpack( 'vlen', $peek )['len'];
			$prefix     = $prefix_len > 0 ? fread( $fh, $prefix_len ) : ''; // phpcs:ignore WordPress.WP.AlternativeFunctions
			$name_len   = unpack( 'vlen', fread( $fh, 2 ) )['len']; // phpcs:ignore WordPress.WP.AlternativeFunctions
			$name       = fread( $fh, $name_len ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			$file_size  = unpack( 'Psize', fread( $fh, 8 ) )['size']; // phpcs:ignore WordPress.WP.AlternativeFunctions

			$relative  = ( '' !== $prefix ) ? $prefix . '/' . $name : $name;
			$safe_name = ltrim( str_replace( '..', '', $relative ), '/' );
			$dest_path = $extract_dir . $safe_name;
			wp_mkdir_p( dirname( $dest_path ) );

			$out = fopen( $dest_path, 'wb' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			if ( $out ) {
				$remaining = $file_size;
				while ( $remaining > 0 ) {
					$data = fread( $fh, min( self::BUFFER_SIZE, $remaining ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions
					if ( false === $data ) {
						break;
					}
					fwrite( $out, $data );
					$remaining -= strlen( $data );
				}
				fclose( $out ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			} else {
				fseek( $fh, $file_size, SEEK_CUR );
			}
		}
		fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		return $manifest;
	}

	/**
	 * Validate magic bytes + footer.
	 *
	 * @param string $package_path Path.
	 * @return true|WP_Error
	 */
	public static function validate( $package_path ) {
		if ( ! file_exists( $package_path ) ) {
			return new \WP_Error( 'emcp_missing', __( 'Package file not found.', 'emcp-tools' ) );
		}
		$fh = fopen( $package_path, 'rb' ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( ! $fh ) {
			return new \WP_Error( 'emcp_read', __( 'Cannot open package.', 'emcp-tools' ) );
		}
		$magic = fread( $fh, 5 ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( self::MAGIC !== $magic ) {
			fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			return new \WP_Error( 'emcp_magic', __( 'Not a valid .emcp package.', 'emcp-tools' ) );
		}
		fseek( $fh, -strlen( self::FOOTER ), SEEK_END );
		$footer = fread( $fh, strlen( self::FOOTER ) ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		fclose( $fh ); // phpcs:ignore WordPress.WP.AlternativeFunctions
		if ( self::FOOTER !== $footer ) {
			return new \WP_Error( 'emcp_footer', __( 'Package file appears truncated or corrupt.', 'emcp-tools' ) );
		}
		return true;
	}

	/**
	 * Output filename for a backup.
	 *
	 * @param string $backup_id Backup id.
	 * @param string $type      Backup type.
	 * @return string
	 */
	public static function get_filename( $backup_id, $type = 'full' ) {
		$site = sanitize_file_name( str_replace( array( 'http://', 'https://', 'www.' ), '', home_url() ) );
		return sprintf( '%s-%s-%s%s', $site, gmdate( 'Y-m-d' ), $type, self::EXTENSION );
	}

	/**
	 * JSON-encode (wp_json_encode when available).
	 *
	 * @param mixed $data Data.
	 * @return string
	 */
	private static function json( $data ) {
		return function_exists( 'wp_json_encode' ) ? (string) wp_json_encode( $data ) : (string) json_encode( $data ); // phpcs:ignore WordPress.WP.AlternativeFunctions
	}

	/**
	 * Whether a relative path matches any exclude (prefix or fnmatch).
	 *
	 * @param string   $relative Relative path.
	 * @param string[] $excludes Excludes.
	 * @return bool
	 */
	private static function path_excluded( $relative, $excludes ) {
		foreach ( (array) $excludes as $ex ) {
			$ex = trim( (string) $ex );
			if ( '' === $ex ) {
				continue;
			}
			if ( 0 === strpos( $relative, $ex ) || false !== strpos( $relative, '/' . $ex ) || fnmatch( $ex, $relative ) ) {
				return true;
			}
		}
		return false;
	}
}
