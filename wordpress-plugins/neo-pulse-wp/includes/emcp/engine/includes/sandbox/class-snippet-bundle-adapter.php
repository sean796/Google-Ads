<?php
/**
 * Snippet Bundle Adapter — presents the existing PHP Snippet store
 * (`EMCP_Tools_PHP_Snippet_Store`) as a portable, cloud-ready
 * `EMCP_Tools_Sandbox_Artifact`, without changing the store's internals.
 *
 * @package EMCP_Tools
 * @since   3.7.0
 */

if ( ! defined( 'ABSPATH' ) ) { exit; }

/**
 * Thin adapter: reads/writes go through `EMCP_Tools_PHP_Snippet_Store`'s
 * existing static API; this class only shapes the result into (and out of)
 * the `EMCP_Tools_Sandbox_Bundle` envelope. `apply_bundle()` always imports as
 * an inactive DRAFT — the human-approval activation gate is unchanged.
 *
 * @since 3.7.0
 */
class EMCP_Tools_Snippet_Bundle_Adapter implements EMCP_Tools_Sandbox_Artifact {

	const META_UUID = '_emcp_uuid';

	/**
	 * @since 3.7.0
	 * @return string
	 */
	public function kind(): string {
		return 'snippet';
	}

	/**
	 * Mints (once) and returns the shared cross-kind UUID for a snippet post.
	 *
	 * @since 3.7.0
	 *
	 * @param int $id Snippet post ID.
	 * @return string
	 */
	public function uuid( int $id ): string {
		$u = (string) get_post_meta( $id, self::META_UUID, true );
		if ( '' === $u ) {
			$u = wp_generate_uuid4();
			update_post_meta( $id, self::META_UUID, $u );
		}
		return $u;
	}

	/**
	 * @since 3.7.0
	 *
	 * @param int $id Snippet post ID.
	 * @return array
	 */
	public function sync_meta( int $id ): array {
		return array(
			'uuid'       => $this->uuid( $id ),
			'origin'     => (string) get_post_meta( $id, '_emcp_origin', true ) ?: 'local',
			'remote_id'  => (string) get_post_meta( $id, '_emcp_remote_id', true ),
			'sync_state' => (string) get_post_meta( $id, '_emcp_sync_state', true ) ?: 'dirty',
			'version'    => (int) get_post_meta( $id, '_emcp_version', true ),
			'updated_at' => (string) get_post_meta( $id, '_emcp_updated_at', true ),
		);
	}

	/**
	 * @since 3.7.0
	 *
	 * @param int $id Snippet post ID.
	 * @return string
	 */
	public function checksum( int $id ): string {
		return EMCP_Tools_Sandbox_Bundle::checksum( $this->assets( $id ) );
	}

	/**
	 * The snippet's portable asset: its raw (unwrapped) source. Deliberately
	 * NOT the compiled/wrapped executable — the sandbox's function-wrapping +
	 * hash-manifest is store-local machinery, re-derived on import by
	 * create_draft()/the eventual activation step, not part of the portable
	 * artifact.
	 *
	 * @param int $id Snippet post ID.
	 * @return array<string,string>
	 */
	private function assets( int $id ): array {
		$rec  = EMCP_Tools_PHP_Snippet_Store::get( $id );
		$code = is_wp_error( $rec ) ? '' : (string) ( $rec['code'] ?? '' );
		return array( 'code.php' => $code );
	}

	/**
	 * @since 3.7.0
	 *
	 * @param int $id Snippet post ID.
	 * @return array|WP_Error
	 */
	public function to_bundle( int $id ) {
		$rec = EMCP_Tools_PHP_Snippet_Store::get( $id );
		if ( is_wp_error( $rec ) ) {
			return $rec;
		}
		$sm   = $this->sync_meta( $id );
		$spec = array(
			'code'     => (string) ( $rec['code'] ?? '' ),
			'context'  => (string) ( $rec['context'] ?? '' ),
			'hook'     => (string) ( $rec['hook'] ?? '' ),
			'priority' => (int) ( $rec['priority'] ?? 10 ),
			'title'    => (string) ( $rec['title'] ?? '' ),
		);
		return EMCP_Tools_Sandbox_Bundle::build(
			'snippet',
			$sm['uuid'],
			array(
				'title'       => (string) ( $rec['title'] ?? '' ),
				'description' => '',
				'author'      => (string) ( wp_get_current_user()->user_login ?? '' ),
				'license'     => 'GPL-2.0-or-later',
			),
			$spec,
			array( 'code.php' => $spec['code'] ),
			max( 1, $sm['version'] ),
			$sm['updated_at'] ?: gmdate( 'c' )
		);
	}

	/**
	 * Imports a bundle as a NEW inactive draft snippet (never overwrites an
	 * existing one, and never activates — activation stays a human-only step
	 * on the Sandbox admin screen).
	 *
	 * @since 3.7.0
	 *
	 * @param array $bundle Bundle as produced by to_bundle()/validate()-shaped.
	 * @return int|WP_Error New local snippet post ID.
	 */
	public function apply_bundle( array $bundle ) {
		$valid = EMCP_Tools_Sandbox_Bundle::validate( $bundle );
		if ( is_wp_error( $valid ) ) {
			return $valid;
		}
		if ( 'snippet' !== $bundle['kind'] ) {
			return new WP_Error( 'kind_mismatch', __( 'Bundle is not a snippet.', 'emcp-tools' ) );
		}
		$spec = is_array( $bundle['spec'] ) ? $bundle['spec'] : array();
		$res  = EMCP_Tools_PHP_Snippet_Store::create_draft(
			array(
				'title'    => (string) ( $spec['title'] ?? ( $bundle['meta']['title'] ?? '' ) ),
				'code'     => (string) ( $spec['code'] ?? '' ),
				'context'  => (string) ( $spec['context'] ?? 'shortcode' ),
				'hook'     => (string) ( $spec['hook'] ?? '' ),
				'priority' => (int) ( $spec['priority'] ?? 10 ),
			)
		);
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$new_id = (int) $res['snippet_id'];
		update_post_meta( $new_id, self::META_UUID, sanitize_text_field( (string) $bundle['uuid'] ) );
		update_post_meta( $new_id, '_emcp_origin', 'imported' );
		return $new_id;
	}
}
