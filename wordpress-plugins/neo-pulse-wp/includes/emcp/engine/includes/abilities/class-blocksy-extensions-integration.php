<?php
/**
 * Blocksy Companion extensions integration (Pro).
 *
 * `blocksy-extensions-read`  : list-extensions (available extensions + active status)
 * `blocksy-extensions-write` : activate-extension / deactivate-extension
 *
 * Registers when Blocksy Companion is active AND the license allows Pro code.
 * Extensions are managed through Blocksy's own `Blocksy\ExtensionsManager`
 * (get_extensions() = locally available; get_preliminary_exts_info() = name/desc/pro;
 * activate_extension()/deactivate_extension()). Active state is the slug's presence
 * in the `blocksy_active_extensions` option. Verified live on Blocksy Companion.
 *
 * @package EMCP_Tools
 * @since   3.9.1
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Manage Blocksy Companion extensions over MCP (Pro).
 */
class EMCP_Tools_Blocksy_Extensions_Integration extends EMCP_Tools_Theme_Integration {

	const MANAGER       = '\\Blocksy\\ExtensionsManager';
	const ACTIVE_OPTION = 'blocksy_active_extensions';

	public function id(): string {
		return 'blocksy-extensions';
	}

	public function label(): string {
		return __( 'Blocksy Extensions', 'emcp-tools' );
	}

	public function is_available(): bool {
		if ( function_exists( 'emcp_tools_fs' ) && ! emcp_tools_fs()->can_use_premium_code() ) {
			return false;
		}
		return class_exists( self::MANAGER ) || isset( $GLOBALS['_blocksy_extensions'] );
	}

	// Site-wide feature toggles.
	public function can_read(): bool {
		return current_user_can( 'manage_options' );
	}
	public function can_write(): bool {
		return current_user_can( 'manage_options' );
	}

	protected function operations(): array {
		return array(
			'list-extensions'     => array(
				'mode' => 'read',
				'run'  => array( $this, 'execute_list_extensions' ),
				'perm' => array( $this, 'can_read' ),
				'desc' => __( 'List the Blocksy Companion extensions available on this site with name, description, pro flag, and active status. Optional { active_only }.', 'emcp-tools' ),
			),
			'activate-extension'   => array(
				'mode' => 'write',
				'run'  => array( $this, 'execute_activate' ),
				'perm' => array( $this, 'can_write' ),
				'desc' => __( 'Activate a Blocksy Companion extension by slug ({ slug }). Pro extensions require a Blocksy Pro license.', 'emcp-tools' ),
			),
			'deactivate-extension' => array(
				'mode' => 'write',
				'run'  => array( $this, 'execute_deactivate' ),
				'perm' => array( $this, 'can_write' ),
				'desc' => __( 'Deactivate a Blocksy Companion extension by slug ({ slug }).', 'emcp-tools' ),
			),
		);
	}

	/**
	 * @param array $input { active_only? }.
	 * @return array
	 */
	public function execute_list_extensions( $input ): array {
		$active_only = ! empty( $input['active_only'] );
		$active      = $this->active_slugs();
		$info        = $this->preliminary_info();

		$out = array();
		foreach ( $this->available_slugs() as $slug ) {
			$is_active = in_array( $slug, $active, true );
			if ( $active_only && ! $is_active ) {
				continue;
			}
			$meta  = isset( $info[ $slug ] ) ? (array) $info[ $slug ] : array();
			$out[] = array(
				'slug'        => $slug,
				'name'        => (string) ( $meta['name'] ?? $slug ),
				'description' => (string) ( $meta['description'] ?? '' ),
				'pro'         => ! empty( $meta['pro'] ),
				'active'      => $is_active,
			);
		}
		return array( 'count' => count( $out ), 'extensions' => $out );
	}

	/**
	 * @param array $input { slug }.
	 * @return array|WP_Error
	 */
	public function execute_activate( $input ) {
		return $this->toggle( $input, true );
	}

	/**
	 * @param array $input { slug }.
	 * @return array|WP_Error
	 */
	public function execute_deactivate( $input ) {
		return $this->toggle( $input, false );
	}

	// ── helpers ────────────────────────────────────────────────────────────────

	/**
	 * @param array $input { slug }.
	 * @param bool  $on    Activate (true) or deactivate (false).
	 * @return array|WP_Error
	 */
	private function toggle( array $input, bool $on ) {
		if ( ! $this->is_available() || ! $this->can_write() ) {
			return new WP_Error( 'forbidden', __( 'Companion extension access is unavailable.', 'emcp-tools' ) );
		}
		$slug = isset( $input['slug'] ) ? sanitize_key( (string) $input['slug'] ) : '';
		if ( '' === $slug ) {
			return new WP_Error( 'missing_slug', __( 'Provide an extension "slug".', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		if ( ! in_array( $slug, $this->available_slugs(), true ) ) {
			return new WP_Error( 'unknown_extension', sprintf( /* translators: %s: extension name. */ __( 'Unknown extension: %s', 'emcp-tools' ), $slug ), array( 'status' => 404 ) );
		}
		$mgr = $this->manager();
		if ( null === $mgr ) {
			return new WP_Error( 'unavailable', __( 'The Blocksy extensions manager is not available.', 'emcp-tools' ), array( 'status' => 501 ) );
		}
		$method = $on ? 'activate_extension' : 'deactivate_extension';
		if ( method_exists( $mgr, 'can' ) && ! $mgr->can() ) {
			return new WP_Error( 'forbidden', __( 'Blocksy does not permit this user to manage extensions.', 'emcp-tools' ) );
		}
		if ( ! method_exists( $mgr, $method ) ) {
			return new WP_Error( 'unsupported', __( 'This Blocksy version does not support toggling extensions here.', 'emcp-tools' ), array( 'status' => 501 ) );
		}
		try {
			$res = $mgr->$method( $slug );
		} catch ( \Throwable $e ) {
			return new WP_Error( 'toggle_failed', $e->getMessage(), array( 'status' => 500 ) );
		}
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		return array(
			'slug'   => $slug,
			'active' => in_array( $slug, $this->active_slugs(), true ),
		);
	}

	/**
	 * The ExtensionsManager instance (or a test double).
	 *
	 * @return object|null
	 */
	private function manager() {
		if ( isset( $GLOBALS['_blocksy_extensions_manager'] ) && is_object( $GLOBALS['_blocksy_extensions_manager'] ) ) {
			return $GLOBALS['_blocksy_extensions_manager'];
		}
		if ( ! class_exists( self::MANAGER ) ) {
			return null;
		}
		$cls = self::MANAGER;
		try {
			return new $cls();
		} catch ( \Throwable $e ) {
			return null;
		}
	}

	/**
	 * Locally-available extension slugs. Tests seed $GLOBALS['_blocksy_extensions'].
	 *
	 * @return string[]
	 */
	private function available_slugs(): array {
		if ( isset( $GLOBALS['_blocksy_extensions'] ) ) {
			return array_keys( (array) $GLOBALS['_blocksy_extensions'] );
		}
		$mgr = $this->manager();
		if ( $mgr && method_exists( $mgr, 'get_extensions' ) ) {
			return array_keys( (array) $mgr->get_extensions() );
		}
		return array();
	}

	/**
	 * name/description/pro info keyed by slug. Tests seed $GLOBALS['_blocksy_extensions'].
	 *
	 * @return array<string,array>
	 */
	private function preliminary_info(): array {
		if ( isset( $GLOBALS['_blocksy_extensions'] ) ) {
			return (array) $GLOBALS['_blocksy_extensions'];
		}
		$mgr = $this->manager();
		if ( $mgr && method_exists( $mgr, 'get_preliminary_exts_info' ) ) {
			return (array) $mgr->get_preliminary_exts_info();
		}
		return array();
	}

	/**
	 * Active extension slugs (the blocksy_active_extensions option).
	 *
	 * @return string[]
	 */
	private function active_slugs(): array {
		$opt = get_option( self::ACTIVE_OPTION, array() );
		return is_array( $opt ) ? array_values( array_map( 'strval', $opt ) ) : array();
	}
}
