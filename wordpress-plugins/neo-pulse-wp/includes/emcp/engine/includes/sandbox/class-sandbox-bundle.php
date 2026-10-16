<?php
if ( ! defined( 'ABSPATH' ) ) { exit; }

class EMCP_Tools_Sandbox_Bundle {
	const SCHEMA_VERSION = 1;
	const KINDS = array( 'block', 'widget', 'snippet' );

	public static function build( string $kind, string $uuid, array $meta, array $spec, array $assets, int $version, string $updated_at ): array {
		return array(
			'schema_version' => self::SCHEMA_VERSION,
			'kind'           => $kind,
			'uuid'           => $uuid,
			'meta'           => $meta,
			'spec'           => $spec,
			'assets'         => $assets,
			'version'        => $version,
			'updated_at'     => $updated_at,
			'checksum'       => self::checksum( $assets ),
		);
	}

	public static function checksum( array $assets ): string {
		ksort( $assets );
		return 'sha256:' . hash( 'sha256', (string) wp_json_encode( $assets ) );
	}

	public static function validate( array $bundle ) {
		$sv = isset( $bundle['schema_version'] ) ? (int) $bundle['schema_version'] : 0;
		if ( $sv < 1 || $sv > self::SCHEMA_VERSION ) {
			return new WP_Error( 'bundle_schema', __( 'Unsupported bundle schema version.', 'emcp-tools' ) );
		}
		if ( empty( $bundle['kind'] ) || ! in_array( $bundle['kind'], self::KINDS, true ) ) {
			return new WP_Error( 'bundle_kind', __( 'Unknown or missing bundle kind.', 'emcp-tools' ) );
		}
		foreach ( array( 'uuid', 'meta', 'spec', 'assets', 'checksum' ) as $k ) {
			if ( ! array_key_exists( $k, $bundle ) ) {
				/* translators: %s: bundle key */
				return new WP_Error( 'bundle_incomplete', sprintf( __( 'Bundle is missing "%s".', 'emcp-tools' ), $k ) );
			}
		}
		if ( ! is_array( $bundle['assets'] ) ) {
			return new WP_Error( 'bundle_assets', __( 'Bundle assets must be an object.', 'emcp-tools' ) );
		}
		if ( self::checksum( $bundle['assets'] ) !== (string) $bundle['checksum'] ) {
			return new WP_Error( 'bundle_checksum', __( 'Bundle checksum does not match its assets (tampered or corrupt).', 'emcp-tools' ) );
		}
		return true;
	}
}
