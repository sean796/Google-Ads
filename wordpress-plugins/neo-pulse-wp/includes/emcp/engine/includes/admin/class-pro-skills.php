<?php
/**
 * Premium Skills download — bundles every skill folder under the plugin's
 * skills/ tree (emcp-skills, emcp-performance, emcp-security) on the fly and
 * streams them as emcp-skills.zip for licensed Pro users.
 *
 * The skills/ folder ships only in the premium build (.emcp-pro marker
 * file present); the free zip excludes it. Even on a premium install the
 * download is also gated by emcp_tools_fs()->can_use_premium_code() so a
 * leaked premium zip on a non-licensed site can't serve the skill.
 *
 * @package EMCP_Tools
 * @since   1.7.1
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class EMCP_Tools_Pro_Skills {

	/**
	 * Relative path (inside the plugin directory) to the skill source folder.
	 * Folder contents get zipped and streamed.
	 */
	const SOURCE_RELATIVE = 'skills';

	/**
	 * Filename sent to the user (folder bundle — one folder per skill).
	 */
	const DOWNLOAD_FILENAME = 'emcp-skills.zip';

	/**
	 * Filename for the Claude Desktop bundle — a zip of individual skill zips,
	 * because Claude Desktop uploads ONE zip per skill.
	 */
	const DOWNLOAD_FILENAME_CD = 'emcp-skills-claude-desktop.zip';

	/**
	 * Action name used by admin-post.php — single source of truth.
	 */
	const ACTION = 'emcp_tools_download_skills';

	public function init(): void {
		// admin-post.php handles both logged-in and logged-out cases. Skills
		// download is admin-only, so register the authed handler only.
		add_action( 'admin_post_' . self::ACTION, array( $this, 'handle_download' ) );
	}

	/**
	 * Site can serve the skills zip iff:
	 *   1. Freemius license grants Pro access on this site, AND
	 *   2. The skills folder is actually present (premium build).
	 */
	public static function user_has_access(): bool {
		if ( ! function_exists( 'emcp_tools_fs' ) ) {
			return false;
		}
		if ( ! emcp_tools_fs()->can_use_premium_code() ) {
			return false;
		}
		return self::skills_dir_exists();
	}

	/**
	 * Whether the skills folder is present on disk. True on premium builds
	 * (where `pro/skills` is overlaid to `<plugin>/skills`) and on Pro dev
	 * checkouts (where it lives at `<plugin>/pro/skills`).
	 */
	public static function skills_dir_exists(): bool {
		$path = self::source_path();
		return is_dir( $path ) && is_readable( $path );
	}

	/**
	 * Returns the absolute path to the skill source folder. Resolved dual-root
	 * via the Pro loader — the premium build overlays `pro/skills` onto
	 * `<plugin>/skills`, while a dev checkout keeps it at `<plugin>/pro/skills`.
	 * Matches how EMCP_Tools_Skill_Catalog resolves the same folder.
	 */
	private static function source_path(): string {
		if ( class_exists( 'EMCP_Tools_Pro_Loader' ) ) {
			return EMCP_Tools_Pro_Loader::path( self::SOURCE_RELATIVE );
		}
		return EMCP_TOOLS_DIR . self::SOURCE_RELATIVE;
	}

	/**
	 * URL for the download action — used by the buttons on the Skills tab.
	 *
	 * @param string $format 'folders' (default, one folder per skill) or
	 *                       'claude-desktop' (a zip of individual skill zips).
	 */
	public static function download_url( string $format = 'folders' ): string {
		$url = admin_url( 'admin-post.php?action=' . self::ACTION );
		if ( 'claude-desktop' === $format ) {
			$url = add_query_arg( 'format', 'claude-desktop', $url );
		}
		return wp_nonce_url( $url, self::ACTION, '_emcp_nonce' );
	}

	/**
	 * admin-post.php callback. Validates auth + license, builds a zip in
	 * a temp file, streams it to the client. Halts execution at the end —
	 * standard for file-download handlers.
	 */
	public function handle_download(): void {
		// Nonce + cap check.
		if (
			! isset( $_GET['_emcp_nonce'] )
			|| ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_GET['_emcp_nonce'] ) ), self::ACTION )
		) {
			wp_die( esc_html__( 'Invalid request.', 'emcp-tools' ), '', array( 'response' => 403 ) );
		}
		if ( ! current_user_can( 'edit_posts' ) ) {
			wp_die( esc_html__( 'You do not have permission to download this.', 'emcp-tools' ), '', array( 'response' => 403 ) );
		}
		if ( ! self::user_has_access() ) {
			wp_die( esc_html__( 'A valid Neo EMCP license is required to download the skills bundle.', 'emcp-tools' ), '', array( 'response' => 403 ) );
		}
		if ( ! class_exists( 'ZipArchive' ) ) {
			wp_die( esc_html__( 'The ZipArchive PHP extension is required to build the skill bundle. Please contact your host to enable it.', 'emcp-tools' ), '', array( 'response' => 500 ) );
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- nonce verified above.
		$format = isset( $_GET['format'] ) ? sanitize_key( wp_unslash( $_GET['format'] ) ) : 'folders';
		$is_cd  = ( 'claude-desktop' === $format );

		$source   = self::source_path();
		$filename = $is_cd ? self::DOWNLOAD_FILENAME_CD : self::DOWNLOAD_FILENAME;
		$tmp      = wp_tempnam( $filename );
		if ( ! $tmp ) {
			wp_die( esc_html__( 'Could not create a temporary file for the skill bundle.', 'emcp-tools' ), '', array( 'response' => 500 ) );
		}

		$zip = new ZipArchive();
		if ( true !== $zip->open( $tmp, ZipArchive::OVERWRITE | ZipArchive::CREATE ) ) {
			@unlink( $tmp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
			wp_die( esc_html__( 'Could not open the temporary zip archive for writing.', 'emcp-tools' ), '', array( 'response' => 500 ) );
		}

		// Inner temp zips created for the Claude Desktop bundle; cleaned up after
		// the outer zip is finalized (ZipArchive reads addFile sources at close).
		$inner_temps = array();

		if ( $is_cd ) {
			$inner_temps = self::add_claude_desktop_bundle( $zip, $source );
		} else {
			self::add_folder_bundle( $zip, $source );
		}
		$zip->close();

		foreach ( $inner_temps as $inner_tmp ) {
			@unlink( $inner_tmp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
		}

		// Stream the file.
		nocache_headers();
		header( 'Content-Type: application/zip' );
		header( 'Content-Disposition: attachment; filename="' . $filename . '"' );
		header( 'Content-Length: ' . filesize( $tmp ) );
		header( 'X-Content-Type-Options: nosniff' );

		// flush any output buffers WP started so the binary doesn't get
		// corrupted by stray whitespace from autoload.
		while ( ob_get_level() > 0 ) {
			ob_end_clean();
		}

		readfile( $tmp );
		@unlink( $tmp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
		exit;
	}

	/**
	 * Add the complete skills tree to the standard folder download.
	 *
	 * Kept as a separate operation so release tests can inspect the exact
	 * archive builder used by the download handler.
	 *
	 * @param ZipArchive $zip    Destination archive.
	 * @param string     $source Absolute skills/ path.
	 */
	private static function add_folder_bundle( ZipArchive $zip, string $source ): void {
		$iterator = new RecursiveIteratorIterator(
			new RecursiveDirectoryIterator( $source, RecursiveDirectoryIterator::SKIP_DOTS ),
			RecursiveIteratorIterator::SELF_FIRST
		);
		foreach ( $iterator as $file_info ) {
			$abs_path = $file_info->getPathname();
			$rel_path = ltrim( substr( $abs_path, strlen( $source ) ), DIRECTORY_SEPARATOR . '/' );
			if ( '' === $rel_path ) {
				continue;
			}
			$zip_path = str_replace( DIRECTORY_SEPARATOR, '/', $rel_path );
			if ( $file_info->isDir() ) {
				$zip->addEmptyDir( $zip_path );
			} else {
				$zip->addFile( $abs_path, $zip_path );
			}
		}
	}

	/**
	 * Every skill root (a directory containing a SKILL.md), relative to $source,
	 * with forward slashes. Sorted so parents precede their nested children.
	 *
	 * @param string $source Absolute skills/ path.
	 * @return string[] e.g. ['emcp-plugins', 'emcp-plugins/addons', 'emcp-skills', …]
	 */
	private static function skill_roots( string $source ): array {
		$roots    = array();
		$iterator = new RecursiveIteratorIterator(
			new RecursiveDirectoryIterator( $source, RecursiveDirectoryIterator::SKIP_DOTS )
		);
		foreach ( $iterator as $file_info ) {
			if ( ! $file_info->isFile() || 'SKILL.md' !== $file_info->getFilename() ) {
				continue;
			}
			$dir = dirname( $file_info->getPathname() );
			$rel = ltrim( substr( $dir, strlen( $source ) ), DIRECTORY_SEPARATOR . '/' );
			if ( '' === $rel ) {
				continue; // A SKILL.md at the skills/ root itself is not a skill.
			}
			$roots[] = str_replace( DIRECTORY_SEPARATOR, '/', $rel );
		}
		sort( $roots );
		return $roots;
	}

	/**
	 * Builds the Claude Desktop bundle: one individual zip per skill, added into
	 * the outer $zip. Claude Desktop uploads ONE zip per skill (each must contain
	 * a SKILL.md), so a flat folder bundle will not import.
	 *
	 * Each inner zip contains the skill's own files under a single top folder
	 * named after the skill. Nested sub-skills are packaged as their OWN zips and
	 * excluded from their parent. A skill slug that contains '/' (a nested skill
	 * like emcp-themes/astra) is flattened to a hyphen everywhere — the zip name,
	 * the inner folder, and the `name:` line in its SKILL.md — because Claude
	 * Desktop skill names cannot contain a slash.
	 *
	 * @param ZipArchive $zip    The outer archive to add each skill zip into.
	 * @param string     $source Absolute skills/ path.
	 * @return string[] Temp inner-zip paths to unlink after the outer zip closes.
	 */
	private static function add_claude_desktop_bundle( ZipArchive $zip, string $source ): array {
		$roots       = self::skill_roots( $source );
		$inner_temps = array();

		foreach ( $roots as $root ) {
			$flat = str_replace( '/', '-', $root );

			// Nested skill roots that live inside this one — their files belong to
			// their own zip, not this parent's.
			$child_rel = array();
			foreach ( $roots as $other ) {
				if ( $other !== $root && 0 === strpos( $other, $root . '/' ) ) {
					$child_rel[] = substr( $other, strlen( $root ) + 1 );
				}
			}

			$root_abs  = $source . DIRECTORY_SEPARATOR . str_replace( '/', DIRECTORY_SEPARATOR, $root );
			$inner_tmp = wp_tempnam( $flat . '.zip' );
			if ( ! $inner_tmp ) {
				continue;
			}
			$inner = new ZipArchive();
			if ( true !== $inner->open( $inner_tmp, ZipArchive::OVERWRITE | ZipArchive::CREATE ) ) {
				@unlink( $inner_tmp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors
				continue;
			}

			$files = new RecursiveIteratorIterator(
				new RecursiveDirectoryIterator( $root_abs, RecursiveDirectoryIterator::SKIP_DOTS ),
				RecursiveIteratorIterator::SELF_FIRST
			);
			foreach ( $files as $file_info ) {
				if ( $file_info->isDir() ) {
					continue; // Directories are implied by their files' paths.
				}
				$rel = ltrim( substr( $file_info->getPathname(), strlen( $root_abs ) ), DIRECTORY_SEPARATOR . '/' );
				$rel = str_replace( DIRECTORY_SEPARATOR, '/', $rel );

				// Skip anything belonging to a nested skill.
				$belongs_to_child = false;
				foreach ( $child_rel as $cr ) {
					if ( 0 === strpos( $rel, $cr . '/' ) ) {
						$belongs_to_child = true;
						break;
					}
				}
				if ( $belongs_to_child ) {
					continue;
				}

				$entry = $flat . '/' . $rel;

				// Rewrite this skill's own SKILL.md name to the flattened slug so
				// Claude Desktop accepts it (no '/' allowed in a skill name).
				if ( 'SKILL.md' === $rel ) {
					$body = file_get_contents( $file_info->getPathname() ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
					if ( false !== $body ) {
						$body = preg_replace( '/^name:[ \t]*.*$/m', 'name: ' . $flat, $body, 1 );
						$inner->addFromString( $entry, $body );
						continue;
					}
				}
				$inner->addFile( $file_info->getPathname(), $entry );
			}
			$inner->close();

			$zip->addFile( $inner_tmp, $flat . '.zip' );
			$inner_temps[] = $inner_tmp;
		}

		return $inner_temps;
	}
}
