<?php
/**
 * Builds the downloadable EMCP Migrate Connector ZIP.
 *
 * The source admin serves the connector as a one-file plugin ZIP the user
 * installs on the destination. The ZIP carries no secret — pairing happens
 * separately and out-of-band, so the same ZIP is safe for any destination.
 *
 * @package EMCP_Tools
 * @since   3.13.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Connector ZIP builder.
 *
 * @since 3.13.0
 */
class EMCP_Tools_Connector_Builder {

	const PLUGIN_SLUG = 'emcp-migrate-connector';

	/**
	 * Source path of the connector single-file plugin (dual-root).
	 *
	 * Stored as `emcp-connector.php.txt` (NOT `.php`) on purpose: it carries a
	 * `Plugin Name:` header, and a real `.php` file inside the plugin makes
	 * WordPress's upgrader detect it as a second plugin (`get_plugins('/emcp-pro')`
	 * scans one level into subdirs), producing a broken "Activate" link after an
	 * update. The `.php.txt` source is never scanned as a plugin; build() still
	 * writes the ZIP entry as `emcp-connector.php`, so the downloaded connector is
	 * a normal plugin.
	 *
	 * @return string
	 */
	public static function source_file() {
		foreach ( array( 'connector/emcp-connector.php.txt', 'connector/emcp-connector.php' ) as $rel ) {
			$p = EMCP_Tools_Pro_Loader::path( $rel );
			if ( '' !== $p ) {
				return $p;
			}
			// Premium build overlays pro/connector -> connector/ at the plugin root.
			if ( defined( 'EMCP_TOOLS_DIR' ) && is_readable( EMCP_TOOLS_DIR . $rel ) ) {
				return EMCP_TOOLS_DIR . $rel;
			}
		}
		return '';
	}

	/**
	 * Build the connector ZIP into a temp file.
	 *
	 * @return string|WP_Error Absolute path to the built ZIP, or error.
	 */
	public static function build() {
		$src = self::source_file();
		if ( '' === $src || ! is_readable( $src ) ) {
			return new WP_Error( 'emcp_connector_src', __( 'Connector source file not found.', 'emcp-tools' ) );
		}
		if ( ! class_exists( 'ZipArchive' ) ) {
			return new WP_Error( 'emcp_connector_zip', __( 'The ZipArchive PHP extension is required to build the connector.', 'emcp-tools' ) );
		}

		$tmp = wp_tempnam( self::PLUGIN_SLUG . '.zip' );
		if ( ! $tmp ) {
			return new WP_Error( 'emcp_connector_tmp', __( 'Could not create a temp file for the connector ZIP.', 'emcp-tools' ) );
		}

		$zip = new ZipArchive();
		if ( true !== $zip->open( $tmp, ZipArchive::CREATE | ZipArchive::OVERWRITE ) ) {
			return new WP_Error( 'emcp_connector_open', __( 'Could not open the connector ZIP for writing.', 'emcp-tools' ) );
		}
		// Ship under the plugin folder name so WordPress installs it cleanly.
		$zip->addFile( $src, self::PLUGIN_SLUG . '/emcp-connector.php' );
		$zip->close();

		return $tmp;
	}

	/**
	 * Stream the connector ZIP as a download (admin-post handler).
	 * Verifies nonce + capability, then sends the file and exits.
	 */
	public static function stream_download() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'Forbidden', 'emcp-tools' ), 403 );
		}
		check_admin_referer( 'emcp_tools_download_connector' );

		$zip = self::build();
		if ( is_wp_error( $zip ) ) {
			wp_die( esc_html( $zip->get_error_message() ) );
		}

		$size = filesize( $zip );
		nocache_headers();
		header( 'Content-Type: application/zip' );
		header( 'Content-Disposition: attachment; filename="' . self::PLUGIN_SLUG . '.zip"' );
		header( 'Content-Length: ' . (int) $size );
		// phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile
		readfile( $zip );
		@unlink( $zip ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		exit;
	}
}
