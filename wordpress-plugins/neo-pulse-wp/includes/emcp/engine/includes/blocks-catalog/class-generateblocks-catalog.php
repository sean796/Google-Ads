<?php
/**
 * GenerateBlocks (2.x / "V2") catalog + style compiler.
 *
 * GB V2 blocks (element/text/media/shape/…) store all styling in a `styles`
 * OBJECT attribute (camelCase CSS keys) plus a `uniqueId`, and GB's front-end
 * render emits the PRE-COMPILED `css` attribute — it does NOT compile `styles`
 * server-side. So to insert a styled block headlessly we build the `styles`
 * object AND compile the matching `css` string ourselves, keyed to the block's
 * `.gb-<type>-<uniqueId>` selector (verified live on GB 2.4.0). Text content is a
 * RichText attribute rendered into the saved HTML.
 *
 * @package EMCP_Tools
 * @since   3.9.1
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Catalog + style compiler for GenerateBlocks V2.
 */
class EMCP_Tools_GenerateBlocks_Catalog {

	const DEFAULT_CAP = 20;

	/**
	 * The V2 blocks worth building with, in curated order. `element` is the
	 * generic container; `text` covers headings/paragraphs/inline; `media` is
	 * images; `shape` is inline SVG; the loop/query blocks are dynamic.
	 *
	 * @var array<string,array{title:string,desc:string,tag:string,text?:bool,category:string}>
	 */
	const BLOCKS = array(
		'element' => array( 'title' => 'Element', 'desc' => 'Generic container/box (div by default). The V2 replacement for Container/Grid — holds inner blocks; style with the styles object (display:flex/grid for layout).', 'tag' => 'div', 'category' => 'layout' ),
		'text'    => array( 'title' => 'Text', 'desc' => 'Heading, paragraph, or inline text — the tag is set by tagName (h1..h6, p, span, a…). The text is RichText content.', 'tag' => 'p', 'text' => true, 'category' => 'content' ),
		'media'   => array( 'title' => 'Media', 'desc' => 'An image (set mediaId). Style via the styles object.', 'tag' => 'figure', 'category' => 'media' ),
		'shape'   => array( 'title' => 'Shape', 'desc' => 'An inline SVG shape/divider.', 'tag' => 'span', 'category' => 'media' ),
		'looper'  => array( 'title' => 'Looper', 'desc' => 'Repeats its inner Loop Item over a query (dynamic).', 'tag' => 'div', 'category' => 'dynamic' ),
		'query'   => array( 'title' => 'Query', 'desc' => 'A WP_Query wrapper for dynamic loops (dynamic).', 'tag' => 'div', 'category' => 'dynamic' ),
	);

	/**
	 * Friendly flat style key => GB camelCase `styles` key. Values pass through as
	 * CSS strings; bare numbers on a size key get "px" appended. Anything not here
	 * can be passed in a raw `styles` object.
	 *
	 * @var array<string,string>
	 */
	const STYLE_MAP = array(
		'background_color' => 'backgroundColor',
		'color'            => 'color',
		'font_size'        => 'fontSize',
		'font_weight'      => 'fontWeight',
		'line_height'      => 'lineHeight',
		'text_align'       => 'textAlign',
		'text_transform'   => 'textTransform',
		'letter_spacing'   => 'letterSpacing',
		'padding_top'      => 'paddingTop',
		'padding_right'    => 'paddingRight',
		'padding_bottom'   => 'paddingBottom',
		'padding_left'     => 'paddingLeft',
		'margin_top'       => 'marginTop',
		'margin_right'     => 'marginRight',
		'margin_bottom'    => 'marginBottom',
		'margin_left'      => 'marginLeft',
		'width'            => 'width',
		'max_width'        => 'maxWidth',
		'min_height'       => 'minHeight',
		'height'           => 'height',
		'border_radius'    => 'borderRadius',
		'border'           => 'border',
		'box_shadow'       => 'boxShadow',
		'display'          => 'display',
		'flex_direction'   => 'flexDirection',
		'justify_content'  => 'justifyContent',
		'align_items'      => 'alignItems',
		'flex_wrap'        => 'flexWrap',
		'gap'              => 'gap',
		'grid_template_columns' => 'gridTemplateColumns',
		'opacity'          => 'opacity',
		'z_index'          => 'zIndex',
		'position'         => 'position',
		'overflow'         => 'overflow',
	);

	/** Keys whose bare-number values get "px" appended. */
	const PX_KEYS = array( 'fontSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'width', 'maxWidth', 'minHeight', 'height', 'borderRadius', 'gap', 'letterSpacing' );

	/**
	 * @return bool Whether GenerateBlocks is active.
	 */
	public static function is_active(): bool {
		return defined( 'GENERATEBLOCKS_VERSION' )
			|| ( function_exists( 'is_plugin_active' ) && is_plugin_active( 'generateblocks/plugin.php' ) );
	}

	/**
	 * Compact block list.
	 *
	 * @param string $category Optional category filter.
	 * @param string $search   Optional search.
	 * @return array<int,array>
	 */
	public static function blocks_index( string $category = '', string $search = '' ): array {
		$search = strtolower( trim( $search ) );
		$out    = array();
		foreach ( self::BLOCKS as $slug => $meta ) {
			$name = 'generateblocks/' . $slug;
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
				'default_tag' => $meta['tag'],
				'has_content' => ! empty( $meta['text'] ),
			);
		}
		return $out;
	}

	/**
	 * @param string $name Full block name.
	 * @return bool
	 */
	public static function block_exists( string $name ): bool {
		if ( isset( $GLOBALS['_generateblocks_registered'] ) ) {
			return in_array( $name, (array) $GLOBALS['_generateblocks_registered'], true );
		}
		return class_exists( 'WP_Block_Type_Registry' )
			&& null !== WP_Block_Type_Registry::get_instance()->get_registered( $name );
	}

	/**
	 * @param string $name Full block name.
	 * @return string block slug (element/text/…) or ''.
	 */
	public static function slug( string $name ): string {
		return ( 0 === strpos( $name, 'generateblocks/' ) ) ? substr( $name, 15 ) : $name;
	}

	/**
	 * @param string $name Full block name.
	 * @return array|null curated meta.
	 */
	public static function meta( string $name ): ?array {
		$slug = self::slug( $name );
		return self::BLOCKS[ $slug ] ?? null;
	}

	/**
	 * A block's registered attributes (name => default), from the live registry.
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
	 * The `.gb-<type>-<uniqueId>` CSS selector for a block instance.
	 *
	 * @param string $name Full block name.
	 * @param string $uid  Unique id.
	 * @return string
	 */
	public static function selector( string $name, string $uid ): string {
		return '.gb-' . self::slug( $name ) . '-' . $uid;
	}

	/**
	 * The element's class list (matches GB's own save output).
	 *
	 * @param string $name Full block name.
	 * @param string $uid  Unique id.
	 * @return string
	 */
	public static function element_class( string $name, string $uid ): string {
		$slug = self::slug( $name );
		return 'gb-' . $slug . ' gb-' . $slug . '-' . $uid;
	}

	/**
	 * Map a friendly flat-styles array to a GB camelCase `styles` object. Unknown
	 * keys already in camelCase pass through, so a raw styles object also works.
	 *
	 * @param array $flat Flat styles.
	 * @return array<string,string> camelCase styles.
	 */
	public static function to_styles( array $flat ): array {
		$styles = array();
		foreach ( $flat as $key => $value ) {
			if ( '' === (string) $value && 0 !== $value ) {
				continue;
			}
			$css_key = self::STYLE_MAP[ $key ] ?? $key; // allow raw camelCase passthrough.
			$val     = (string) $value;
			if ( is_numeric( $value ) && in_array( $css_key, self::PX_KEYS, true ) ) {
				$val = $value . 'px';
			}
			$styles[ $css_key ] = $val;
		}
		return $styles;
	}

	/**
	 * Compile a flat camelCase styles object into a CSS rule for a selector.
	 * (Flat only — no nested states/media; those can be added via a raw css.)
	 *
	 * @param string $selector CSS selector.
	 * @param array  $styles   camelCase styles.
	 * @return string CSS rule, or '' when empty.
	 */
	public static function compile_css( string $selector, array $styles ): string {
		$decls = array();
		foreach ( $styles as $key => $value ) {
			if ( '' === (string) $value ) {
				continue;
			}
			$prop    = strtolower( preg_replace( '/([a-z0-9])([A-Z])/', '$1-$2', (string) $key ) );
			$decls[] = $prop . ':' . $value;
		}
		return empty( $decls ) ? '' : $selector . '{' . implode( ';', $decls ) . ';}';
	}
}
