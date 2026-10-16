<?php
/**
 * GenerateBlocks (V2) native adapter (Pro), independent of GeneratePress.
 *
 * `generateblocks-read`  : list-blocks, get-block-schema (real attrs + the styles model)
 * `generateblocks-write` : add-block (insert a V2 block with a generated uniqueId,
 *                          a styles object, a self-compiled `css` string, and content)
 *
 * Registers when GenerateBlocks is active AND the license allows Pro code. GB V2
 * blocks store styling in a `styles` object and render the PRE-COMPILED `css`
 * attribute (GB does not compile styles server-side), so add-block builds the
 * styles object AND compiles the matching `css` (via the catalog) keyed to the
 * block's `.gb-<type>-<uniqueId>` selector. Text content is RichText in the saved
 * HTML. Verified live on GB 2.4.0.
 *
 * @package EMCP_Tools
 * @since   3.9.1
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * GenerateBlocks V2 catalog + insertion integration (Pro).
 */
class EMCP_Tools_GenerateBlocks_Integration extends EMCP_Tools_Theme_Integration {

	protected function capabilities(): array {
		return array( 'supports_patterns' => false, 'supports_preview' => false, 'styles_model' => 'styles-object' );
	}


	public function id(): string {
		return 'generateblocks';
	}

	public function label(): string {
		return __( 'GenerateBlocks', 'emcp-tools' );
	}

	public function is_available(): bool {
		if ( function_exists( 'emcp_tools_fs' ) && ! emcp_tools_fs()->can_use_premium_code() ) {
			return false;
		}
		return EMCP_Tools_GenerateBlocks_Catalog::is_active();
	}

	// Building content, not theme options.
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
				'desc' => __( 'Compact catalog of the GenerateBlocks V2 blocks (element, text, media, shape, looper, query). Optional { category (layout|content|media|dynamic), search }.', 'emcp-tools' ),
			),
			'get-block-schema' => array(
				'mode' => 'read',
				'run'  => array( $this, 'execute_get_block_schema' ),
				'perm' => array( $this, 'can_read' ),
				'desc' => __( 'A GB block\'s registered attributes + the styles model: all styling goes in a `styles` object (camelCase CSS keys); text is RichText `content`; each block has a `uniqueId`. Lists the friendly flat style keys add-block accepts.', 'emcp-tools' ),
			),
			'add-block'        => array(
				'mode' => 'write',
				'run'  => array( $this, 'execute_add_block' ),
				'perm' => array( $this, 'can_write' ),
				'desc' => __( 'Insert a GenerateBlocks V2 block ({ post_id, block, tag_name?, content?, styles?, raw_styles?, media_id?, position? }). A uniqueId is generated, `styles` is built from the friendly flat `styles` (+ raw_styles camelCase passthrough), the matching `css` is compiled for you, and text `content` is placed in the markup. position: { mode: append|prepend|before|after|inside, path?: [..] }.', 'emcp-tools' ),
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
		$blocks   = EMCP_Tools_GenerateBlocks_Catalog::blocks_index( $category, $search );
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
	 * @param array $input { post_id, block, tag_name?, content?, styles?, raw_styles?, media_id?, position? }.
	 * @return array|WP_Error
	 */
	public function execute_add_block( $input ) {
		$post_id = absint( $input['post_id'] ?? 0 );
		$name    = $this->normalize( (string) ( $input['block'] ?? '' ) );

		$post = $post_id ? get_post( $post_id ) : null;
		if ( ! $post ) {
			return new WP_Error( 'not_found', __( 'Post not found.', 'emcp-tools' ), array( 'status' => 404 ) );
		}
		$meta = EMCP_Tools_GenerateBlocks_Catalog::meta( $name );
		if ( null === $meta || ! EMCP_Tools_GenerateBlocks_Catalog::block_exists( $name ) ) {
			return new WP_Error( 'unknown_block', sprintf( /* translators: %s: block name. */ __( 'Unknown or unavailable GenerateBlocks block: %s', 'emcp-tools' ), $name ), array( 'status' => 404 ) );
		}

		$block    = $this->build_block( $name, $meta, $input );
		$position = ( isset( $input['position'] ) && is_array( $input['position'] ) ) ? $input['position'] : array( 'mode' => 'append' );

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
		return array(
			'added'     => $name,
			'unique_id' => $block['attrs']['uniqueId'],
			'post_id'   => $post_id,
			'note'      => __( 'Renders on the front end (content + compiled css). GenerateBlocks recompiles the css in the editor from the styles object; opening the block in the editor may prompt "Attempt recovery" once, which preserves the content and styles.', 'emcp-tools' ),
		);
	}

	// ── helpers ────────────────────────────────────────────────────────────────

	private function normalize( string $name ): string {
		return ( false === strpos( $name, '/' ) ) ? 'generateblocks/' . $name : $name;
	}

	/**
	 * @param string $name Full block name.
	 * @param bool   $full Include raw registered attributes.
	 * @return array
	 */
	private function schema_for( string $name, bool $full ): array {
		$meta = EMCP_Tools_GenerateBlocks_Catalog::meta( $name );
		if ( null === $meta ) {
			return array( 'name' => $name, 'error' => 'unknown_block' );
		}
		$entry = array(
			'name'            => $name,
			'title'           => $meta['title'],
			'description'     => $meta['desc'],
			'category'        => $meta['category'],
			'default_tag'     => $meta['tag'],
			'styles_model'    => __( 'All visual styling goes in a `styles` object (camelCase CSS keys, e.g. backgroundColor, paddingTop). add-block builds it from a friendly flat `styles` map and compiles the matching css for you.', 'emcp-tools' ),
			'flat_style_keys' => array_keys( EMCP_Tools_GenerateBlocks_Catalog::STYLE_MAP ),
		);
		if ( ! empty( $meta['text'] ) ) {
			$entry['content'] = __( 'This block renders RichText `content` (the text). Set tag_name (h1..h6, p, span, a) and content.', 'emcp-tools' );
		}
		$real = EMCP_Tools_GenerateBlocks_Catalog::real_attributes( $name );
		$entry['attributes'] = array_slice( array_keys( $real ), 0, EMCP_Tools_GenerateBlocks_Catalog::DEFAULT_CAP );
		if ( $full ) {
			$entry['full_attributes'] = $real;
		}
		return $entry;
	}

	/**
	 * Build the parsed block: uniqueId + styles + compiled css + content markup.
	 *
	 * @param string $name  Full block name.
	 * @param array  $meta  Catalog meta.
	 * @param array  $input Tool input.
	 * @return array
	 */
	private function build_block( string $name, array $meta, array $input ): array {
		$slug = EMCP_Tools_GenerateBlocks_Catalog::slug( $name );
		$uid  = substr( bin2hex( random_bytes( 4 ) ), 0, 8 );

		$tag = $meta['tag'];
		if ( ! empty( $input['tag_name'] ) && preg_match( '/^[a-z][a-z0-9]{0,9}$/', strtolower( (string) $input['tag_name'] ) ) ) {
			$tag = strtolower( (string) $input['tag_name'] );
		}

		// styles = friendly flat + raw camelCase passthrough.
		$flat   = ( isset( $input['styles'] ) && is_array( $input['styles'] ) ) ? $input['styles'] : array();
		$styles = EMCP_Tools_GenerateBlocks_Catalog::to_styles( $flat );
		if ( isset( $input['raw_styles'] ) && is_array( $input['raw_styles'] ) ) {
			$styles = array_merge( $styles, $input['raw_styles'] );
		}

		$selector = EMCP_Tools_GenerateBlocks_Catalog::selector( $name, $uid );
		$css      = isset( $input['css'] ) ? (string) $input['css'] : EMCP_Tools_GenerateBlocks_Catalog::compile_css( $selector, $styles );

		$attrs = array( 'uniqueId' => $uid, 'tagName' => $tag, 'styles' => (object) $styles, 'css' => $css );
		if ( 'media' === $slug && ! empty( $input['media_id'] ) ) {
			$attrs['mediaId'] = absint( $input['media_id'] );
		}

		$cls = EMCP_Tools_GenerateBlocks_Catalog::element_class( $name, $uid );

		// Text: RichText content in the saved HTML.
		if ( ! empty( $meta['text'] ) ) {
			$content        = isset( $input['content'] ) ? wp_kses_post( (string) $input['content'] ) : '';
			$attrs['content'] = $content;
			$inner            = sprintf( '<%1$s class="%2$s">%3$s</%1$s>', $tag, esc_attr( $cls ), $content );
			return $this->block_array( $name, $attrs, array(), array( $inner ) );
		}

		// Media: an <img> inside the figure when a media id is given.
		if ( 'media' === $slug && ! empty( $attrs['mediaId'] ) && function_exists( 'wp_get_attachment_image' ) ) {
			$img   = wp_get_attachment_image( $attrs['mediaId'], 'full' );
			$inner = sprintf( '<%1$s class="%2$s">%3$s</%1$s>', $tag, esc_attr( $cls ), $img );
			return $this->block_array( $name, $attrs, array(), array( $inner ) );
		}

		// Container (element/shape/…): an empty wrapper split into open/close chunks
		// so children can be inserted INSIDE it (position: { mode: inside }).
		$open  = sprintf( '<%1$s class="%2$s">', $tag, esc_attr( $cls ) );
		$close = sprintf( '</%1$s>', $tag );
		return array(
			'blockName'    => $name,
			'attrs'        => $attrs,
			'innerBlocks'  => array(),
			'innerHTML'    => $open . $close,
			'innerContent' => array( $open, $close ),
		);
	}

	/**
	 * A leaf parsed block (content in innerHTML).
	 *
	 * @param string $name         Block name.
	 * @param array  $attrs        Attributes.
	 * @param array  $inner_blocks Inner blocks.
	 * @param array  $inner_content Inner content chunks.
	 * @return array
	 */
	private function block_array( string $name, array $attrs, array $inner_blocks, array $inner_content ): array {
		return array(
			'blockName'    => $name,
			'attrs'        => $attrs,
			'innerBlocks'  => $inner_blocks,
			'innerHTML'    => implode( '', array_filter( $inner_content, 'is_string' ) ),
			'innerContent' => $inner_content,
		);
	}
}
