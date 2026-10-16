<?php
/**
 * Blocksy blocks integration (Pro).
 *
 * `blocksy-blocks-read`  : list-blocks, get-block-schema
 * `blocksy-blocks-write` : add-block (insert a blocksy/* block)
 *
 * Registers when Blocksy Companion is active AND the license allows Pro code.
 * Blocksy blocks are dynamic (render server-side with theme styling), so add-block
 * just serializes the block comment + caller attributes; only query/tax-query get a
 * generated uniqueId and a scaffolded post-template/tax-template child so the loop
 * renders.
 *
 * @package EMCP_Tools
 * @since   3.9.1
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Blocksy block catalog + insertion (Pro).
 */
class EMCP_Tools_Blocksy_Blocks_Integration extends EMCP_Tools_Theme_Integration {

	protected function capabilities(): array {
		return array( 'supports_patterns' => false, 'supports_preview' => false, 'styles_model' => 'none' );
	}


	public function id(): string {
		return 'blocksy-blocks';
	}

	public function label(): string {
		return __( 'Blocksy Blocks', 'emcp-tools' );
	}

	public function is_available(): bool {
		if ( function_exists( 'emcp_tools_fs' ) && ! emcp_tools_fs()->can_use_premium_code() ) {
			return false;
		}
		return EMCP_Tools_Blocksy_Blocks_Catalog::is_active();
	}

	public function can_read(): bool {
		return current_user_can( 'edit_posts' );
	}
	public function can_write(): bool {
		return current_user_can( 'edit_posts' );
	}

	protected function operations(): array {
		return array(
			'list-blocks'      => array(
				'mode' => 'read',
				'run'  => array( $this, 'execute_list_blocks' ),
				'perm' => array( $this, 'can_read' ),
				'desc' => __( 'Compact catalog of the Blocksy blocks (dynamic content: query/tax-query loops, dynamic-data, about-me, socials, contact-info, share-box, breadcrumbs, search, quote, widgets area). Optional { category (dynamic|content), search }.', 'emcp-tools' ),
			),
			'get-block-schema' => array(
				'mode' => 'read',
				'run'  => array( $this, 'execute_get_block_schema' ),
				'perm' => array( $this, 'can_read' ),
				'desc' => __( 'A Blocksy block\'s registered attributes ({ name } or { names: [...] }, full: true for all). Most content blocks take no attributes; query/tax-query/dynamic-data are configurable.', 'emcp-tools' ),
			),
			'add-block'        => array(
				'mode' => 'write',
				'run'  => array( $this, 'execute_add_block' ),
				'perm' => array( $this, 'can_write' ),
				'desc' => __( 'Insert a Blocksy block ({ post_id, block, attributes?, position? }). Dynamic blocks render with theme styling; query/tax-query get a uniqueId + a scaffolded template child so the loop renders. position: { mode: append|prepend|before|after|inside, path?: [..] }.', 'emcp-tools' ),
			),
		);
	}

	/**
	 * @param array $input { category?, search? }.
	 * @return array
	 */
	public function execute_list_blocks( $input ): array {
		$category = isset( $input['category'] ) ? (string) $input['category'] : '';
		$search   = isset( $input['search'] ) ? (string) $input['search'] : '';
		$blocks   = EMCP_Tools_Blocksy_Blocks_Catalog::blocks_index( $category, $search );
		return array( 'count' => count( $blocks ), 'blocks' => $blocks );
	}

	/**
	 * @param array $input { name?|names?[], full? }.
	 * @return array|WP_Error
	 */
	public function execute_get_block_schema( $input ) {
		$names = array();
		if ( isset( $input['names'] ) && is_array( $input['names'] ) ) {
			$names = array_map( 'strval', $input['names'] );
		} elseif ( isset( $input['name'] ) ) {
			$names = array( (string) $input['name'] );
		}
		if ( empty( $names ) ) {
			return new WP_Error( 'missing_name', __( 'Provide a block "name" or "names" array.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		$full = ! empty( $input['full'] );
		$out  = array();
		foreach ( $names as $name ) {
			$norm         = $this->normalize( $name );
			$out[ $norm ] = $this->schema_for( $norm, $full );
		}
		return ( 1 === count( $out ) ) ? reset( $out ) : array( 'blocks' => $out );
	}

	/**
	 * @param array $input { post_id, block, attributes?, position? }.
	 * @return array|WP_Error
	 */
	public function execute_add_block( $input ) {
		$post_id = absint( $input['post_id'] ?? 0 );
		if ( ! $this->is_available() || ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error( 'forbidden', __( 'You cannot edit this post with Blocksy.', 'emcp-tools' ) );
		}
		$name    = $this->normalize( (string) ( $input['block'] ?? '' ) );

		$post = $post_id ? get_post( $post_id ) : null;
		if ( ! $post ) {
			return new WP_Error( 'not_found', __( 'Post not found.', 'emcp-tools' ), array( 'status' => 404 ) );
		}
		if ( ! EMCP_Tools_Blocksy_Blocks_Catalog::is_known( $name ) ) {
			return new WP_Error( 'unknown_block', sprintf( __( 'Unknown or unavailable Blocksy block: %s', 'emcp-tools' ), $name ), array( 'status' => 404 ) );
		}
		$attrs    = ( isset( $input['attributes'] ) && is_array( $input['attributes'] ) ) ? $input['attributes'] : array();
		if ( $name === 'blocksy/content-block' ) {
			$target = get_post( absint( $attrs['content_block'] ?? 0 ) );
			if ( ! $target || $target->post_type !== 'ct_content_block' || ! current_user_can( 'edit_post', $target->ID ) ) {
				return new WP_Error( 'invalid_content_block', __( 'Choose an accessible native Content Block to embed.', 'emcp-tools' ) );
			}
		}
		$position = ( isset( $input['position'] ) && is_array( $input['position'] ) ) ? $input['position'] : array( 'mode' => 'append' );

		$block  = $this->build_block( $name, $attrs );
		$tree   = EMCP_Tools_Block_Tree::from_markup( (string) $post->post_content );
		// An unresolvable path makes insert() a silent no-op, which would report
		// success while dropping the block. Fail loudly instead.
		if ( ! EMCP_Tools_Block_Tree::position_is_valid( $tree, $position ) ) {
			return new WP_Error( 'invalid_position', __( 'position.path does not resolve to a block in this post. List the blocks in this post first and use a real index path.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		$tree   = EMCP_Tools_Block_Tree::insert( $tree, array( $block ), $position );
		$markup = EMCP_Tools_Block_Tree::to_markup( $tree );

		$result = wp_update_post( array( 'ID' => $post_id, 'post_content' => wp_slash( $markup ) ), true );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$out = array( 'added' => $name, 'post_id' => $post_id );
		if ( isset( $block['attrs']['uniqueId'] ) ) {
			$out['unique_id'] = $block['attrs']['uniqueId'];
		}
		return $out;
	}

	// ── helpers ────────────────────────────────────────────────────────────────

	private function normalize( string $name ): string {
		return ( false === strpos( $name, '/' ) ) ? 'blocksy/' . $name : $name;
	}

	/**
	 * @param string $name Full block name.
	 * @param bool   $full Include raw attributes.
	 * @return array
	 */
	private function schema_for( string $name, bool $full ): array {
		$meta = EMCP_Tools_Blocksy_Blocks_Catalog::meta( $name );
		if ( null === $meta ) {
			return array( 'name' => $name, 'error' => 'unknown_block' );
		}
		$real  = EMCP_Tools_Blocksy_Blocks_Catalog::real_attributes( $name );
		$entry = array(
			'name'        => $name,
			'title'       => $meta['title'],
			'description' => $meta['desc'],
			'category'    => $meta['category'],
			'dynamic'     => true,
			'attributes'  => array_slice( array_keys( $real ), 0, EMCP_Tools_Blocksy_Blocks_Catalog::DEFAULT_CAP ),
		);
		$child = EMCP_Tools_Blocksy_Blocks_Catalog::container_child( $name );
		if ( null !== $child ) {
			$entry['inner_blocks'] = sprintf( __( 'Container: add-block scaffolds a %s child so the loop renders.', 'emcp-tools' ), $child );
		}
		if ( empty( $real ) ) {
			$entry['note'] = __( 'This block takes no attributes — it renders from the theme settings/current context. Just insert it.', 'emcp-tools' );
		}
		if ( $full ) {
			$entry['full_attributes'] = $real;
		}
		if ( $name === 'blocksy/content-block' ) {
			$entry['content_block'] = __( 'Native render callback expects content_block: an existing Content Block post ID. This field is absent from its server registry schema in 2.1.57.', 'emcp-tools' );
		}
		return $entry;
	}

	/**
	 * Build the parsed block: caller attrs (+ uniqueId when the block uses one) and
	 * a scaffolded template child for the loop containers.
	 *
	 * @param string $name  Full block name.
	 * @param array  $attrs Caller attributes.
	 * @return array
	 */
	private function build_block( string $name, array $attrs ): array {
		// Native editor save() emits this placeholder despite server-side rendering.
		if ( 'blocksy/content-block' === $name ) {
			$html = '<div>Blocksy: Content Block Filter</div>';
			return array( 'blockName' => $name, 'attrs' => $attrs, 'innerBlocks' => array(), 'innerHTML' => $html, 'innerContent' => array( $html ) );
		}
		if ( EMCP_Tools_Blocksy_Blocks_Catalog::has_unique_id( $name ) && empty( $attrs['uniqueId'] ) ) {
			$attrs['uniqueId'] = substr( bin2hex( random_bytes( 4 ) ), 0, 6 );
		}

		$child = EMCP_Tools_Blocksy_Blocks_Catalog::container_child( $name );
		if ( null !== $child ) {
			$inner_attrs = array();
			if ( EMCP_Tools_Blocksy_Blocks_Catalog::has_unique_id( $child ) ) {
				$inner_attrs['uniqueId'] = substr( bin2hex( random_bytes( 4 ) ), 0, 6 );
			}
			$inner = array(
				'blockName'    => $child,
				'attrs'        => $inner_attrs,
				'innerBlocks'  => array(),
				'innerHTML'    => '',
				'innerContent' => array(),
			);
			return array(
				'blockName'    => $name,
				'attrs'        => $attrs,
				'innerBlocks'  => array( $inner ),
				'innerHTML'    => '',
				'innerContent' => array( null ),
			);
		}

		return array(
			'blockName'    => $name,
			'attrs'        => $attrs,
			'innerBlocks'  => array(),
			'innerHTML'    => '',
			'innerContent' => array(),
		);
	}
}
