<?php
/**
 * Block Store — source-of-truth + sandbox for AI-generated Gutenberg blocks.
 *
 * Generated blocks are NEVER written into the plugin, theme, or core. The
 * canonical record is a private `emcp_block` custom post type whose
 * `_emcp_spec` meta holds the structured spec the four block files
 * (block.json/render.php/edit.js/style.css) are compiled from by
 * EMCP_Tools_Block_Generator — so the assets are always regenerable. The
 * compiled files live in an isolated sandbox under
 * `wp-content/emcp-sandbox/blocks/<id>/`, sharing the same
 * web-access-guarded base directory as the widget + snippet sandboxes
 * (EMCP_Tools_Sandbox_Store::ensure_sandbox()). A derived `blocks-manifest.json`
 * lists only ACTIVE blocks; a future loader reads it (fast, no DB query per
 * request) while the CPT stays authoritative.
 *
 * Post status is the activation flag: `publish` = active (registered as a
 * real Gutenberg block), `draft` = inactive.
 *
 * This store also implements the EMCP_Tools_Sandbox_Artifact contract
 * (to_bundle/apply_bundle/checksum), so a block is a first-class citizen of
 * the cloud-ready bundle round-trip alongside widgets and snippets.
 *
 * @package EMCP_Tools
 * @since   3.7.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Stores, compiles, and tracks AI-generated custom Gutenberg blocks.
 *
 * @since 3.7.0
 */
class EMCP_Tools_Block_Store extends EMCP_Tools_Sandbox_Store {

	const POST_TYPE       = 'emcp_block';
	const META_SPEC       = '_emcp_spec';
	const META_BLOCK_NAME = '_emcp_block_name';
	const META_CHECKSUM   = '_emcp_checksum';
	const META_LAST_ERROR = '_emcp_last_error';

	/**
	 * The four filenames every generated block writes into its artifact dir.
	 *
	 * @since 3.7.0
	 */
	const ASSET_FILES = array( 'block.json', 'render.php', 'edit.js', 'style.css' );

	/**
	 * Singleton instance.
	 *
	 * @var self|null
	 */
	private static $instance = null;

	/**
	 * Returns the singleton instance.
	 *
	 * @since 3.7.0
	 *
	 * @return self
	 */
	public static function instance(): self {
		return self::$instance ?? ( self::$instance = new self() );
	}

	/**
	 * @since 3.7.0
	 *
	 * @return string
	 */
	public function kind(): string {
		return 'block';
	}

	/**
	 * @since 3.7.0
	 *
	 * @return string
	 */
	protected function sandbox_subdir(): string {
		return 'blocks';
	}

	/**
	 * @since 3.7.0
	 *
	 * @return string
	 */
	protected function manifest_filename(): string {
		return 'blocks-manifest.json';
	}

	/**
	 * The registered block-type name for a given block post.
	 *
	 * @since 3.7.0
	 *
	 * @param int $id Block post ID.
	 * @return string
	 */
	public function block_name( int $id ): string {
		return 'emcp/custom-' . $id;
	}

	/**
	 * Registers the CPT. Hooked on `init`.
	 *
	 * @since 3.7.0
	 */
	public static function register_post_type(): void {
		register_post_type(
			self::POST_TYPE,
			array(
				'public'              => false,
				'publicly_queryable'  => false,
				'show_ui'             => false,
				'show_in_menu'        => false,
				'show_in_rest'        => false,
				'exclude_from_search' => true,
				'has_archive'         => false,
				'rewrite'             => false,
				'query_var'           => false,
				'capability_type'     => 'page',
				'map_meta_cap'        => true,
				'supports'            => array( 'title', 'author' ),
				'labels'              => array(
					'name' => __( 'EMCP Custom Blocks', 'emcp-tools' ),
				),
			)
		);
	}

	/**
	 * Whether the current user/site may manage generated blocks. Requires the
	 * Pro gate plus `manage_options`.
	 *
	 * @since 3.7.0
	 *
	 * @return bool
	 */
	public static function user_has_access(): bool {
		if ( ! function_exists( 'emcp_tools_fs' ) || ! emcp_tools_fs()->can_use_premium_code() ) {
			return false;
		}
		return current_user_can( 'manage_options' );
	}

	// -------------------------------------------------------------------------
	// CRUD
	// -------------------------------------------------------------------------

	/**
	 * Creates a new generated block from a validated spec.
	 *
	 * @since 3.7.0
	 *
	 * @param array $spec   The structured block spec (meta/attributes/html_template/styles).
	 * @param bool  $active Whether to activate immediately (default false — a
	 *                      new block always starts as a safe draft; the caller
	 *                      opts into activation explicitly).
	 * @return array|WP_Error Block summary on success.
	 */
	public function create( array $spec, bool $active = false ) {
		if ( ! self::user_has_access() ) {
			return new WP_Error( 'forbidden', __( 'You do not have permission to create blocks.', 'emcp-tools' ) );
		}

		$ensured = $this->ensure_sandbox();
		if ( is_wp_error( $ensured ) ) {
			return $ensured;
		}

		$title = isset( $spec['meta']['title'] ) ? sanitize_text_field( (string) $spec['meta']['title'] ) : __( 'Custom Block', 'emcp-tools' );

		// Insert the post first so the ID can seed the unique block name.
		$id = wp_insert_post(
			array(
				'post_type'   => self::POST_TYPE,
				'post_status' => $active ? 'publish' : 'draft',
				'post_title'  => $title,
				'post_author' => get_current_user_id(),
			),
			true
		);
		if ( is_wp_error( $id ) ) {
			return $id;
		}

		$written = $this->write_block( (int) $id, $spec );
		if ( is_wp_error( $written ) ) {
			wp_delete_post( (int) $id, true );
			return $written;
		}

		// Never let a block that would fatal on render go live.
		if ( $active ) {
			$this->safeguard_active( (int) $id );
		}

		$this->rebuild_manifest();

		return $this->summary( (int) $id );
	}

	/**
	 * Updates an existing block's spec and regenerates its four assets.
	 *
	 * @since 3.7.0
	 *
	 * @param int   $id   Block post ID.
	 * @param array $spec New spec.
	 * @return array|WP_Error
	 */
	public function update( int $id, array $spec ) {
		if ( ! self::user_has_access() ) {
			return new WP_Error( 'forbidden', __( 'You do not have permission to update blocks.', 'emcp-tools' ) );
		}

		$post = get_post( $id );
		if ( ! $post || self::POST_TYPE !== $post->post_type ) {
			return new WP_Error( 'not_found', __( 'Block not found.', 'emcp-tools' ) );
		}

		$ensured = $this->ensure_sandbox();
		if ( is_wp_error( $ensured ) ) {
			return $ensured;
		}

		$title = isset( $spec['meta']['title'] ) ? sanitize_text_field( (string) $spec['meta']['title'] ) : $post->post_title;
		wp_update_post(
			array(
				'ID'         => $id,
				'post_title' => $title,
			)
		);

		// A successful regenerate clears any prior fatal flag.
		delete_post_meta( $id, self::META_LAST_ERROR );

		$written = $this->write_block( $id, $spec );
		if ( is_wp_error( $written ) ) {
			return $written;
		}

		// If it was active, re-check the regenerated render; demote if now broken.
		$fresh = get_post( $id );
		if ( $fresh && 'publish' === $fresh->post_status ) {
			$this->safeguard_active( $id );
		}

		$this->rebuild_manifest();

		return $this->summary( $id );
	}

	/**
	 * Compiles + writes the block's four assets and persists its meta. Shared
	 * by create() and update().
	 *
	 * @since 3.7.0
	 *
	 * @param int   $id   Block post ID.
	 * @param array $spec The block spec.
	 * @return true|WP_Error
	 */
	private function write_block( int $id, array $spec ) {
		// The generator ships in the private Pro overlay. Guard defensively so a
		// free build (pro/ absent) returns a clean error instead of fataling.
		if ( ! class_exists( 'EMCP_Tools_Block_Generator' ) ) {
			return new WP_Error( 'emcp_pro_required', __( 'Block Builder requires Neo EMCP.', 'emcp-tools' ) );
		}

		$assets = EMCP_Tools_Block_Generator::generate( $spec, $id, array() );
		if ( is_wp_error( $assets ) ) {
			return $assets;
		}

		$dir = $this->artifact_dir( $id );
		$this->write_file( $dir . '/block.json', $assets['block.json'] );
		$this->write_file( $dir . '/render.php', $assets['render.php'] );
		$this->write_file( $dir . '/edit.js', $assets['edit.js'] );

		if ( '' !== $assets['style.css'] ) {
			$this->write_file( $dir . '/style.css', $assets['style.css'] );
		} else {
			$this->delete_file( $dir . '/style.css' );
			unset( $assets['style.css'] );
		}

		update_post_meta( $id, self::META_SPEC, wp_slash( wp_json_encode( $spec ) ) );
		update_post_meta( $id, self::META_BLOCK_NAME, $this->block_name( $id ) );
		update_post_meta( $id, self::META_CHECKSUM, EMCP_Tools_Sandbox_Bundle::checksum( $assets ) );

		$this->ensure_uuid( $id );
		$this->bump_version( $id );

		return true;
	}

	/**
	 * Runtime safety check: register the compiled render.php under a throwaway
	 * block name and invoke its render callback with the block's own default
	 * attributes (read from block.json), so a block that would fatal when
	 * Gutenberg/the block editor renders it is caught here instead of
	 * white-screening the editor or the front end.
	 *
	 * Best-effort — returns true (cannot validate, assume ok) when
	 * register_block_type()/unregister_block_type() aren't available, mirroring
	 * the widget store's runtime_validate() returning true when Elementor's
	 * Widget_Base is absent.
	 *
	 * @since 3.7.0
	 *
	 * @param int $id Block post ID.
	 * @return true|WP_Error
	 */
	private function runtime_validate( int $id ) {
		if ( ! function_exists( 'register_block_type' ) || ! function_exists( 'unregister_block_type' ) ) {
			return true;
		}

		$dir             = $this->artifact_dir( $id );
		$block_json_path = $dir . '/block.json';
		$render_path     = $dir . '/render.php';

		if ( ! is_file( $block_json_path ) || ! is_file( $render_path ) ) {
			return new WP_Error( 'missing_file', __( 'The generated block files are missing; update the block to regenerate them.', 'emcp-tools' ) );
		}

		$meta     = json_decode( $this->read_file( $block_json_path ), true );
		$defaults = array();
		foreach ( (array) ( is_array( $meta ) ? ( $meta['attributes'] ?? array() ) : array() ) as $name => $def ) {
			$defaults[ $name ] = is_array( $def ) && array_key_exists( 'default', $def ) ? $def['default'] : null;
		}

		$tmp_name = 'emcp-validate/tmp-' . $id;

		try {
			$registered = register_block_type(
				$tmp_name,
				array(
					'render_callback' => function ( $attributes ) use ( $render_path ) {
						// render.php ECHOES its markup (WordPress's block.json file-render
						// mechanism captures the echo, not a return value). Capture it in
						// an output buffer here too: using the include's return value would
						// miss the markup AND leak the echo to the output stream, which
						// corrupts the MCP stdio JSON-RPC channel during activation.
						$attributes = is_array( $attributes ) ? $attributes : array();
						ob_start();
						include $render_path;
						return (string) ob_get_clean();
					},
				)
			);
			if ( $registered && is_callable( $registered->render_callback ?? null ) ) {
				call_user_func( $registered->render_callback, $defaults );
			}
		} catch ( \Throwable $e ) {
			return new WP_Error( 'runtime_error', $e->getMessage() );
		} finally {
			unregister_block_type( $tmp_name );
		}

		return true;
	}

	/**
	 * Server-side render with the block's default attributes, for the Sandbox
	 * preview (spec 8.13). Works on drafts; refuses assets that no longer match
	 * the checksum recorded when the plugin compiled them.
	 *
	 * @since 3.18.0
	 *
	 * @param int $id Block post ID.
	 * @return array{html:string,css:string}|WP_Error
	 */
	public function preview( int $id ) {
		if ( ! self::user_has_access() ) {
			return new WP_Error( 'forbidden', __( 'You do not have permission to preview blocks.', 'emcp-tools' ) );
		}
		$post = get_post( $id );
		if ( ! $post || self::POST_TYPE !== $post->post_type ) {
			return new WP_Error( 'not_found', __( 'Block not found.', 'emcp-tools' ) );
		}
		$dir    = $this->artifact_dir( $id );
		$assets = array();
		foreach ( self::ASSET_FILES as $file ) {
			if ( is_file( $dir . '/' . $file ) ) {
				$assets[ $file ] = $this->read_file( $dir . '/' . $file );
			}
		}
		if ( ! isset( $assets['block.json'], $assets['render.php'] ) ) {
			return new WP_Error( 'missing_file', __( 'The generated block files are missing; update the block to regenerate them.', 'emcp-tools' ) );
		}
		if ( EMCP_Tools_Sandbox_Bundle::checksum( $assets ) !== (string) get_post_meta( $id, self::META_CHECKSUM, true ) ) {
			return new WP_Error( 'tampered', __( 'The block files changed on disk since the plugin compiled them. Update the block to regenerate them.', 'emcp-tools' ) );
		}
		$meta       = json_decode( $assets['block.json'], true );
		$attributes = array();
		foreach ( (array) ( is_array( $meta ) ? ( $meta['attributes'] ?? array() ) : array() ) as $name => $def ) {
			if ( is_array( $def ) && array_key_exists( 'default', $def ) ) {
				$attributes[ $name ] = $def['default'];
			}
		}
		$level = ob_get_level();
		try {
			$html = ( static function ( string $render_path, array $attributes ): string {
				$content = '';
				ob_start();
				include $render_path;
				return (string) ob_get_clean();
			} )( $dir . '/render.php', $attributes );
		} catch ( \Throwable $e ) {
			while ( ob_get_level() > $level ) {
				ob_end_clean();
			}
			return new WP_Error( 'runtime_error', $e->getMessage() );
		}
		return array(
			'html' => $html,
			'css'  => (string) ( $assets['style.css'] ?? '' ),
		);
	}

	/**
	 * If an active block fails the runtime check, demote it to draft and record
	 * the error so it never reaches the manifest (and never breaks the editor).
	 *
	 * @since 3.7.0
	 *
	 * @param int $id Block post ID.
	 */
	private function safeguard_active( int $id ): void {
		$rt = $this->runtime_validate( $id );
		if ( is_wp_error( $rt ) ) {
			wp_update_post(
				array(
					'ID'          => $id,
					'post_status' => 'draft',
				)
			);
			update_post_meta( $id, self::META_LAST_ERROR, sanitize_text_field( $rt->get_error_message() ) );
		}
	}

	/**
	 * Activates or deactivates a block.
	 *
	 * @since 3.7.0
	 *
	 * @param int    $id     Block post ID.
	 * @param string $status 'active' or 'draft'.
	 * @return array|WP_Error
	 */
	public function set_status( int $id, string $status ) {
		if ( ! self::user_has_access() ) {
			return new WP_Error( 'forbidden', __( 'You do not have permission to change block status.', 'emcp-tools' ) );
		}

		$post = get_post( $id );
		if ( ! $post || self::POST_TYPE !== $post->post_type ) {
			return new WP_Error( 'not_found', __( 'Block not found.', 'emcp-tools' ) );
		}

		$post_status = ( 'active' === $status ) ? 'publish' : 'draft';

		// Re-activating: confirm the files exist AND the block renders cleanly
		// before going live, so a broken block can never reach the manifest.
		if ( 'publish' === $post_status ) {
			if ( ! is_file( $this->artifact_dir( $id ) . '/block.json' ) ) {
				return new WP_Error( 'missing_file', __( 'The generated block files are missing; update the block to regenerate them.', 'emcp-tools' ) );
			}
			$rt = $this->runtime_validate( $id );
			if ( is_wp_error( $rt ) ) {
				update_post_meta( $id, self::META_LAST_ERROR, sanitize_text_field( $rt->get_error_message() ) );
				return new WP_Error(
					'activation_blocked',
					sprintf(
						/* translators: %s: error message */
						__( 'Cannot activate, the block errors when rendered: %s. Fix the spec and update the block.', 'emcp-tools' ),
						$rt->get_error_message()
					)
				);
			}
			delete_post_meta( $id, self::META_LAST_ERROR );
		}

		wp_update_post(
			array(
				'ID'          => $id,
				'post_status' => $post_status,
			)
		);

		$this->rebuild_manifest();

		return $this->summary( $id );
	}

	/**
	 * Deletes a block: removes the CPT post, sandbox files, and manifest entry.
	 *
	 * @since 3.7.0
	 *
	 * @param int $id Block post ID.
	 * @return array|WP_Error
	 */
	public function delete( int $id ) {
		if ( ! self::user_has_access() ) {
			return new WP_Error( 'forbidden', __( 'You do not have permission to delete blocks.', 'emcp-tools' ) );
		}

		$post = get_post( $id );
		if ( ! $post || self::POST_TYPE !== $post->post_type ) {
			return new WP_Error( 'not_found', __( 'Block not found.', 'emcp-tools' ) );
		}

		// Remove the block's whole directory (block.json/render.php/edit.js/style.css).
		$this->rmdir_recursive( $this->artifact_dir( $id ) );

		wp_delete_post( $id, true );
		$this->rebuild_manifest();

		return array(
			'success'  => true,
			'block_id' => $id,
		);
	}

	/**
	 * Flags a block as having crashed during load and deactivates it. Called by
	 * a future loader's shutdown handler.
	 *
	 * @since 3.7.0
	 *
	 * @param int    $id    Block post ID.
	 * @param string $error The captured error message.
	 */
	public function mark_error( int $id, string $error ): void {
		update_post_meta( $id, self::META_LAST_ERROR, sanitize_text_field( $error ) );
		wp_update_post(
			array(
				'ID'          => $id,
				'post_status' => 'draft',
			)
		);
		$this->rebuild_manifest();
	}

	// -------------------------------------------------------------------------
	// Read
	// -------------------------------------------------------------------------

	/**
	 * Returns the decoded spec for a block.
	 *
	 * @since 3.7.0
	 *
	 * @param int $id Block post ID.
	 * @return array|null
	 */
	public function get_spec( int $id ): ?array {
		$raw = get_post_meta( $id, self::META_SPEC, true );
		if ( empty( $raw ) ) {
			return null;
		}
		$spec = json_decode( $raw, true );
		return is_array( $spec ) ? $spec : null;
	}

	/**
	 * Returns the raw contents of one of a block's four generated assets.
	 *
	 * @since 3.7.0
	 *
	 * @param int    $id   Block post ID.
	 * @param string $file One of block.json/render.php/edit.js/style.css.
	 * @return string '' if the file is unknown, missing, or empty.
	 */
	public function get_asset( int $id, string $file ): string {
		if ( ! in_array( $file, self::ASSET_FILES, true ) ) {
			return '';
		}
		return $this->read_file( $this->artifact_dir( $id ) . '/' . $file );
	}

	/**
	 * Returns a summary array for one block.
	 *
	 * @since 3.7.0
	 *
	 * @param int $id Block post ID.
	 * @return array|WP_Error
	 */
	public function summary( int $id ) {
		$post = get_post( $id );
		if ( ! $post || self::POST_TYPE !== $post->post_type ) {
			return new WP_Error( 'not_found', __( 'Block not found.', 'emcp-tools' ) );
		}

		return array(
			'block_id'   => (int) $id,
			'title'      => (string) $post->post_title,
			'block_name' => (string) get_post_meta( $id, self::META_BLOCK_NAME, true ),
			'status'     => ( 'publish' === $post->post_status ) ? 'active' : 'draft',
			'last_error' => (string) get_post_meta( $id, self::META_LAST_ERROR, true ),
			'updated'    => (string) $post->post_modified,
		);
	}

	/**
	 * Lists generated blocks.
	 *
	 * @since 3.7.0
	 *
	 * @param string $status Optional 'active' | 'draft' | 'any' (default 'any').
	 * @return array<int, array>
	 */
	public function list_blocks( string $status = 'any' ): array {
		$post_status = 'any';
		if ( 'active' === $status ) {
			$post_status = 'publish';
		} elseif ( 'draft' === $status ) {
			$post_status = 'draft';
		}

		$query = new WP_Query(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => $post_status,
				'posts_per_page' => 200,
				'orderby'        => 'modified',
				'order'          => 'DESC',
				'no_found_rows'  => true,
			)
		);

		$out = array();
		foreach ( $query->posts as $post ) {
			$summary = $this->summary( (int) $post->ID );
			if ( ! is_wp_error( $summary ) ) {
				$out[] = $summary;
			}
		}
		return $out;
	}

	/**
	 * One page of blocks, plus the totals needed to draw a pager.
	 *
	 * list_blocks() stays as it is for the MCP tools, which want the whole
	 * list in a single call. The admin table renders each row's block.json
	 * and render.php, so it takes a page at a time instead.
	 *
	 * @since 3.15.0
	 *
	 * @param string $status   'active', 'draft', or 'any'.
	 * @param int    $page     1-based page number.
	 * @param int    $per_page Rows per page.
	 * @return array{items:array[],total:int,page:int,pages:int,per_page:int}
	 */
	public function list_blocks_page( string $status = 'any', int $page = 1, int $per_page = EMCP_Tools_Sandbox_List_Query::PER_PAGE ): array {
		$result = EMCP_Tools_Sandbox_List_Query::page( self::POST_TYPE, $status, $page, $per_page );

		$items = array();
		foreach ( $result['ids'] as $emcp_id ) {
			$summary = $this->summary( $emcp_id );
			if ( ! is_wp_error( $summary ) ) {
				$items[] = $summary;
			}
		}

		return array(
			'items'    => $items,
			'total'    => $result['total'],
			'page'     => $result['page'],
			'pages'    => $result['pages'],
			'per_page' => $result['per_page'],
		);
	}

	// -------------------------------------------------------------------------
	// Manifest
	// -------------------------------------------------------------------------

	/**
	 * Rebuilds blocks-manifest.json from the active (published) blocks. Each
	 * entry carries at least `post_id` and `checksum` so a loader can
	 * hash-verify the on-disk assets before registering the block.
	 *
	 * @since 3.7.0
	 */
	public function rebuild_manifest(): void {
		$query = new WP_Query(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'publish',
				'posts_per_page' => 200,
				'no_found_rows'  => true,
			)
		);

		$entries = array();
		foreach ( $query->posts as $post ) {
			$id        = (int) $post->ID;
			$entries[] = array(
				'post_id'    => $id,
				'block_name' => (string) get_post_meta( $id, self::META_BLOCK_NAME, true ),
				'dir'        => $this->sandbox_subdir() . '/' . $id,
				'checksum'   => (string) get_post_meta( $id, self::META_CHECKSUM, true ),
			);
		}

		$this->ensure_sandbox();
		$this->write_file( $this->manifest_path(), (string) wp_json_encode( $entries ) );
	}

	/**
	 * Reads the manifest. Returns an array of active-block entries.
	 *
	 * @since 3.7.0
	 *
	 * @return array<int, array>
	 */
	public function read_manifest(): array {
		$path = $this->manifest_path();
		if ( ! file_exists( $path ) ) {
			return array();
		}
		$raw  = $this->read_file( $path );
		$data = json_decode( $raw, true );
		return is_array( $data ) ? $data : array();
	}

	// -------------------------------------------------------------------------
	// Cloud artifact contract (EMCP_Tools_Sandbox_Artifact)
	// -------------------------------------------------------------------------

	/**
	 * Builds a portable, checksummed bundle for a block — the artifact a cloud
	 * sync would push/pull. Reads the four assets straight off disk (the
	 * source of truth for what actually renders), so the bundle always matches
	 * what's on the filesystem, not just the stored spec.
	 *
	 * @since 3.7.0
	 *
	 * @param int $id Block post ID.
	 * @return array|WP_Error
	 */
	public function to_bundle( int $id ) {
		$summary = $this->summary( $id );
		if ( is_wp_error( $summary ) ) {
			return $summary;
		}

		$dir    = $this->artifact_dir( $id );
		$assets = array(
			'block.json' => $this->read_file( $dir . '/block.json' ),
			'render.php' => $this->read_file( $dir . '/render.php' ),
			'edit.js'    => $this->read_file( $dir . '/edit.js' ),
		);
		$css = $this->read_file( $dir . '/style.css' );
		if ( '' !== $css ) {
			$assets['style.css'] = $css;
		}

		$spec = $this->get_spec( $id ) ?? array();
		$sm   = $this->sync_meta( $id );

		return EMCP_Tools_Sandbox_Bundle::build(
			'block',
			$sm['uuid'],
			array(
				'title'       => $summary['title'],
				'description' => (string) ( $spec['meta']['description'] ?? '' ),
				'author'      => (string) ( wp_get_current_user()->user_login ?? '' ),
				'license'     => 'GPL-2.0-or-later',
			),
			$spec,
			$assets,
			max( 1, $sm['version'] ),
			$sm['updated_at'] ?: gmdate( 'c' )
		);
	}

	/**
	 * Imports a bundle as a brand-new local DRAFT block, stamping the bundle's
	 * uuid + an 'imported' origin. Never overwrites an existing block.
	 *
	 * @since 3.7.0
	 *
	 * @param array $bundle A bundle produced by to_bundle() (or a peer store's
	 *                       bundle rejected here via the kind check).
	 * @return int|WP_Error New local block post ID.
	 */
	public function apply_bundle( array $bundle ) {
		// Imported blocks carry front-end code: only users trusted with unfiltered HTML may add them.
		if ( ! current_user_can( 'unfiltered_html' ) ) {
			return new WP_Error( 'emcp_sandbox_unfiltered_html', __( 'Importing custom widgets and blocks requires the unfiltered_html capability.', 'emcp-tools' ) );
		}
		$valid = EMCP_Tools_Sandbox_Bundle::validate( $bundle );
		if ( is_wp_error( $valid ) ) {
			return $valid;
		}
		if ( 'block' !== $bundle['kind'] ) {
			return new WP_Error( 'kind_mismatch', __( 'Bundle is not a block.', 'emcp-tools' ) );
		}

		$res = $this->create( is_array( $bundle['spec'] ) ? $bundle['spec'] : array(), false );
		if ( is_wp_error( $res ) ) {
			return $res;
		}

		$new_id = (int) $res['block_id'];
		update_post_meta( $new_id, self::META_UUID, sanitize_text_field( (string) $bundle['uuid'] ) );
		update_post_meta( $new_id, self::META_ORIGIN, 'imported' );

		return $new_id;
	}

	/**
	 * @since 3.7.0
	 *
	 * @param int $id Block post ID.
	 * @return string
	 */
	public function checksum( int $id ): string {
		return (string) get_post_meta( $id, self::META_CHECKSUM, true );
	}

	// -------------------------------------------------------------------------
	// Uninstall
	// -------------------------------------------------------------------------

	/**
	 * Deletes all generated blocks and removes this store's own sandbox
	 * subtree + manifest. Called from the plugin's uninstall handler —
	 * generated executable code must not survive uninstall. Leaves the shared
	 * sandbox base (and sibling widget/snippet subtrees) untouched.
	 *
	 * @since 3.7.0
	 */
	public static function uninstall_cleanup(): void {
		$query = new WP_Query(
			array(
				'post_type'      => self::POST_TYPE,
				'post_status'    => 'any',
				'posts_per_page' => -1,
				'fields'         => 'ids',
				'no_found_rows'  => true,
			)
		);
		foreach ( $query->posts as $id ) {
			wp_delete_post( (int) $id, true );
		}

		$store = self::instance();
		$store->rmdir_recursive( $store->subdir_path() );
		$store->delete_file( $store->manifest_path() );
	}
}
