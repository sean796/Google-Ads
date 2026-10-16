<?php
/**
 * Blocksy blocks catalog (Blocksy Companion `blocksy/*` blocks).
 *
 * Blocksy's blocks are DYNAMIC content blocks (author box, socials, breadcrumbs,
 * search, share box, dynamic-data, and the query/tax-query loops) — not design
 * blocks. Most render with theme styling and take no attributes, so insertion is
 * trivial (the block comment). Only `query`/`tax-query` carry a `uniqueId` and act
 * as containers (query -> post-template, tax-query -> tax-template). Verified live
 * on Blocksy 2.1.52 + Blocksy Companion.
 *
 * @package EMCP_Tools
 * @since   3.9.1
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registry-backed catalog for the Blocksy blocks.
 */
class EMCP_Tools_Blocksy_Blocks_Catalog {

	/**
	 * Curated top-level (placeable) blocks. `post-template` / `tax-template` are
	 * children (parent query/tax-query) and are scaffolded by add-block, not listed.
	 *
	 * @var array<string,array{title:string,desc:string,category:string}>
	 */
	const BLOCKS = array(
		'content-block'   => array( 'title' => 'Content Block', 'desc' => 'Embed an existing accessible Companion Pro Content Block using content_block (post ID).', 'category' => 'dynamic' ),
		'query'           => array( 'title' => 'Query Loop', 'desc' => 'A dynamic loop of posts/CPT with design, order, pagination, slideshow. Container — add-block scaffolds a post-template child.', 'category' => 'dynamic' ),
		'tax-query'       => array( 'title' => 'Taxonomy Query', 'desc' => 'A dynamic loop of taxonomy terms. Container — scaffolds a tax-template child.', 'category' => 'dynamic' ),
		'dynamic-data'    => array( 'title' => 'Dynamic Data', 'desc' => 'Renders a dynamic field (post/term/author/site data) — title, excerpt, meta, custom field, etc.', 'category' => 'dynamic' ),
		'about-me'        => array( 'title' => 'About Me', 'desc' => 'The author/about box (avatar, name, description) from theme settings.', 'category' => 'content' ),
		'socials'         => array( 'title' => 'Socials', 'desc' => 'Social network icons from the theme social settings.', 'category' => 'content' ),
		'contact-info'    => array( 'title' => 'Contact Info', 'desc' => 'Contact details (address, phone, email, hours) from theme settings.', 'category' => 'content' ),
		'share-box'       => array( 'title' => 'Share Box', 'desc' => 'Social share buttons for the current post.', 'category' => 'content' ),
		'breadcrumbs'     => array( 'title' => 'Breadcrumbs', 'desc' => 'The breadcrumb trail for the current page.', 'category' => 'content' ),
		'search'          => array( 'title' => 'Search', 'desc' => 'A Blocksy search field/box.', 'category' => 'content' ),
		'quote'           => array( 'title' => 'Quote', 'desc' => 'A styled pull-quote.', 'category' => 'content' ),
		'widgets-wrapper' => array( 'title' => 'Widgets Area', 'desc' => 'Renders a widget area (sidebar) inline.', 'category' => 'content' ),
	);

	/** Blocks that carry a uniqueId (add-block generates one). */
	const HAS_UNIQUE_ID = array( 'query', 'tax-query' );

	/** Container -> child block that add-block scaffolds so the loop renders. */
	const CONTAINER_CHILD = array(
		'query'     => 'blocksy/post-template',
		'tax-query' => 'blocksy/tax-template',
	);

	const DEFAULT_CAP = 30;

	/**
	 * @return bool Whether Blocksy Companion (the blocks source) is active.
	 */
	public static function is_active(): bool {
		return self::block_exists( 'blocksy/query' );
	}

	/**
	 * @param string $name Full block name.
	 * @return bool
	 */
	public static function block_exists( string $name ): bool {
		if ( isset( $GLOBALS['_blocksy_registered'] ) ) {
			return in_array( $name, (array) $GLOBALS['_blocksy_registered'], true );
		}
		return class_exists( 'WP_Block_Type_Registry' )
			&& null !== WP_Block_Type_Registry::get_instance()->get_registered( $name );
	}

	/**
	 * @param string $name Full block name.
	 * @return string slug.
	 */
	public static function slug( string $name ): string {
		return ( 0 === strpos( $name, 'blocksy/' ) ) ? substr( $name, 8 ) : $name;
	}

	/**
	 * @param string $name Full block name.
	 * @return array|null
	 */
	public static function meta( string $name ): ?array {
		$slug = self::slug( $name );
		return self::BLOCKS[ $slug ] ?? null;
	}

	/**
	 * @param string $name Full block name.
	 * @return bool
	 */
	public static function has_unique_id( string $name ): bool {
		return in_array( self::slug( $name ), self::HAS_UNIQUE_ID, true );
	}

	/**
	 * @param string $name Full block name.
	 * @return string|null Child block name for a container, or null.
	 */
	public static function container_child( string $name ): ?string {
		return self::CONTAINER_CHILD[ self::slug( $name ) ] ?? null;
	}

	/**
	 * Compact block index (curated).
	 *
	 * @param string $category Optional category filter.
	 * @param string $search   Optional search.
	 * @return array<int,array>
	 */
	public static function blocks_index( string $category = '', string $search = '' ): array {
		$search = strtolower( trim( $search ) );
		$out    = array();
		foreach ( self::BLOCKS as $slug => $meta ) {
			$name = 'blocksy/' . $slug;
			if ( ! self::block_exists( $name ) ) {
				continue;
			}
			if ( '' !== $category && $meta['category'] !== $category ) {
				continue;
			}
			$hay = strtolower( $meta['title'] . ' ' . $meta['desc'] . ' ' . $slug );
			if ( '' !== $search && false === strpos( $hay, $search ) ) {
				continue;
			}
			$out[] = array(
				'name'        => $name,
				'title'       => $meta['title'],
				'description' => $meta['desc'],
				'category'    => $meta['category'],
				'container'   => null !== self::container_child( $name ),
			);
		}
		return $out;
	}

	/**
	 * A block's registered attributes (name => default) from the live registry.
	 *
	 * @param string $name Full block name.
	 * @return array<string,mixed>
	 */
	public static function real_attributes( string $name ): array {
		if ( ! class_exists( 'WP_Block_Type_Registry' ) ) {
			return array();
		}
		$bt = WP_Block_Type_Registry::get_instance()->get_registered( $name );
		if ( ! $bt || empty( $bt->attributes ) ) {
			return array();
		}
		$out = array();
		foreach ( (array) $bt->attributes as $key => $def ) {
			$out[ $key ] = is_array( $def ) && array_key_exists( 'default', $def ) ? $def['default'] : null;
		}
		return $out;
	}

	/**
	 * @param string $name Full block name.
	 * @return bool Whether it is a known top-level Blocksy block.
	 */
	public static function is_known( string $name ): bool {
		return isset( self::BLOCKS[ self::slug( $name ) ] ) && self::block_exists( $name );
	}
}
