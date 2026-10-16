<?php
/**
 * Block Loader — safely loads active sandbox blocks into WordPress core.
 *
 * Loading is MANIFEST-ONLY: the loader never scans a directory looking for
 * blocks to register. It reads EMCP_Tools_Block_Store's manifest of active
 * blocks, hash-verifies each entry's four on-disk files against the checksum
 * recorded at write time (EMCP_Tools_Sandbox_Bundle::checksum(), the same
 * function the store used), and only then calls register_block_type() on the
 * verified directory. A tampered or corrupted block file changes the
 * recomputed checksum and is refused registration — the same tamper guard the
 * widget loader applies to generated Elementor widgets.
 *
 * @package EMCP_Tools
 * @since   3.7.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers the "EMCP Custom" block category and loads active generated
 * blocks.
 *
 * @since 3.7.0
 */
class EMCP_Tools_Block_Loader {

	/**
	 * Whether generated blocks may load on this site (Pro gate). Mirrors
	 * EMCP_Tools_Widget_Loader::has_access() verbatim — a site running the
	 * `pro/` overlay but with a lapsed/inactive Freemius license must not
	 * still register Pro-generated blocks.
	 *
	 * @since 3.7.0
	 *
	 * @return bool
	 */
	private function has_access(): bool {
		return function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code();
	}

	/**
	 * Registers WordPress hooks.
	 *
	 * @since 3.7.0
	 */
	public function register_hooks(): void {
		add_filter( 'block_categories_all', array( $this, 'add_block_category' ) );
		// Priority 20: after the block store's CPT registration (which runs at
		// the default priority on init).
		add_action( 'init', array( $this, 'register_active_blocks' ), 20 );
	}

	/**
	 * Prepends the "EMCP Custom" block category so generated blocks have a
	 * dedicated home in the block inserter. No-ops (returns the categories
	 * unchanged) when the Pro license gate fails.
	 *
	 * @since 3.7.0
	 *
	 * @param array $categories Existing block categories.
	 * @return array
	 */
	public function add_block_category( array $categories ): array {
		if ( ! $this->has_access() ) {
			return $categories;
		}
		array_unshift(
			$categories,
			array(
				'slug'  => 'emcp-custom',
				'title' => __( 'EMCP Custom', 'emcp-tools' ),
				'icon'  => null,
			)
		);
		return $categories;
	}

	/**
	 * Recomputes the checksum over a block's on-disk assets (reading exactly
	 * the files that exist, the same way EMCP_Tools_Block_Store built the
	 * assets map when it stored the checksum) and compares it to the
	 * manifest entry's recorded checksum.
	 *
	 * @since 3.7.0
	 *
	 * @param array $entry Manifest entry; must carry 'dir' (absolute path) and
	 *                     'checksum'.
	 * @return bool
	 */
	public function verify( array $entry ): bool {
		$dir = (string) ( $entry['dir'] ?? '' );
		if ( '' === $dir || ! is_dir( $dir ) ) {
			return false;
		}

		if ( ! class_exists( 'EMCP_Tools_Sandbox_Bundle' ) ) {
			return false;
		}

		$assets = array();
		foreach ( array( 'block.json', 'render.php', 'edit.js', 'style.css' ) as $file ) {
			$path = $dir . '/' . $file;
			if ( file_exists( $path ) ) {
				// phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
				$assets[ $file ] = (string) file_get_contents( $path );
			}
		}

		return EMCP_Tools_Sandbox_Bundle::checksum( $assets ) === (string) ( $entry['checksum'] ?? '' );
	}

	/**
	 * Reads the active-blocks manifest, hash-verifies each entry, and
	 * registers the verified ones as real Gutenberg blocks. A registration
	 * failure is caught and recorded against the offending block (which also
	 * demotes it back to draft) rather than allowed to fatal the request.
	 *
	 * @since 3.7.0
	 */
	public function register_active_blocks(): void {
		if ( ! $this->has_access() ) {
			return;
		}
		if ( ! function_exists( 'register_block_type' ) || ! class_exists( 'EMCP_Tools_Block_Store' ) ) {
			return;
		}

		$store = EMCP_Tools_Block_Store::instance();

		foreach ( $store->read_manifest() as $entry ) {
			$post_id = (int) ( $entry['post_id'] ?? 0 );
			if ( ! $post_id ) {
				continue;
			}

			$entry['dir'] = $store->artifact_dir( $post_id );

			if ( ! $this->verify( $entry ) ) {
				continue;
			}

			try {
				$block_type = register_block_type( $entry['dir'] );
				if ( $block_type instanceof \WP_Block_Type ) {
					$this->attach_assets( $block_type, $store, $post_id, $entry['dir'] );
				}
			} catch ( \Throwable $e ) {
				$store->mark_error( $post_id, $e->getMessage() );
			}
		}
	}

	/**
	 * Registers a block's editor script (and style, when present) with the
	 * correct uploads URL + real dependencies, and points the block type at
	 * those handles by setting its properties DIRECTLY after registration.
	 *
	 * WordPress's block.json `file:` asset resolution assumes a block lives in a
	 * plugin/theme and would compute a broken URL (prefixing the plugins dir onto
	 * the absolute uploads path) with NO dependencies — so the no-build editor
	 * script would 404 and, even if it loaded, run before wp.blocks / wp.blockEditor
	 * exist, and the block would never appear in the inserter. The generated
	 * block.json therefore omits editorScript/style, and we assign the handles
	 * here. We set the properties directly (rather than passing them as
	 * register_block_type() args) because metadata processing overrides same-named
	 * args, so a direct assignment is the only reliable override.
	 *
	 * @since 3.7.0
	 *
	 * @param WP_Block_Type            $block_type The registered block type.
	 * @param EMCP_Tools_Sandbox_Store $store      The block store.
	 * @param int                      $post_id    Block post ID.
	 * @param string                   $dir        Absolute block directory.
	 */
	private function attach_assets( \WP_Block_Type $block_type, $store, int $post_id, string $dir ): void {
		$url = $store->artifact_url( $post_id );

		$edit_path = $dir . '/edit.js';
		if ( file_exists( $edit_path ) ) {
			$handle = 'emcp-custom-' . $post_id . '-editor';
			wp_register_script(
				$handle,
				$url . '/edit.js',
				array( 'wp-blocks', 'wp-block-editor', 'wp-components', 'wp-element', 'wp-server-side-render' ),
				(string) filemtime( $edit_path ),
				true
			);
			$block_type->editor_script_handles = array( $handle );
		}

		$style_path = $dir . '/style.css';
		if ( file_exists( $style_path ) ) {
			$handle = 'emcp-custom-' . $post_id . '-style';
			wp_register_style( $handle, $url . '/style.css', array(), (string) filemtime( $style_path ) );
			$block_type->style_handles = array( $handle );
		}
	}
}
