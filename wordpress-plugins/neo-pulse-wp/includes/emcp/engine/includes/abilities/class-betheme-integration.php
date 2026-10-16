<?php
/**
 * BeTheme (Muffin Group) integration: theme options + BeBuilder page content.
 *
 * BeTheme is two products behind one name. The THEME side stores every setting
 * in a single autoloaded `betheme` option, 830 keys on a stock install, read
 * through mfn_opts_get(). The BUILDER side, BeBuilder, stores page content in
 * the `mfn-page-items` post meta.
 *
 * Everything here was read off a live BeTheme 28.5.7 install rather than from
 * documentation, because three details are load-bearing and none of them are
 * written down:
 *
 *  1. An item's settings live in `attr`. The renderer calls
 *     `Mfn_Builder_Items::item_<type>( $item['attr'] )`, and only falls back to
 *     `fields` when `attr` is absent. Writing `fields` alone still saves and
 *     still renders a widget, just an empty one.
 *  2. `size` is REQUIRED on a wrap and on an item. The renderer returns early
 *     on an item with no size, so the item vanishes with no error anywhere.
 *  3. The hierarchy is sections > wraps > items. A section holds wraps, never
 *     items directly.
 *
 * BeTheme's own template system (the `template` post type with
 * mfn_template_type / mfn_template_conditions) is deliberately out of scope: it
 * overlaps Neo EMCP Themer, and shipping tools for both invites exactly the
 * confusion EMCP_Tools_Themer_BeTheme_Conflict exists to warn about.
 *
 * Pro-tier, like every theme integration added after Astra.
 *
 * @package EMCP_Tools
 * @since   3.14.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Two dispatchers over BeTheme: betheme-read and betheme-write.
 *
 * @since 3.14.0
 */
class EMCP_Tools_BeTheme_Integration extends EMCP_Tools_Theme_Integration {

	/** The single option holding every theme setting. */
	const OPTION = 'betheme';

	/** Post meta holding a page's BeBuilder content. */
	const META_ITEMS = 'mfn-page-items';

	/**
	 * Curated settings allowlist: key => { type, label, group }.
	 *
	 * A stock install exposes 830 keys, and they drive every stylesheet the
	 * theme generates, so blanket write access is a good way to make a site
	 * unrecognisable in one call. This is the Astra approach: a typed, labelled
	 * subset covering what an agent is actually asked to change. Verified
	 * against BeTheme 28.5.7.
	 *
	 * @var array<string,array{type:string,label:string,group:string}>
	 */
	const ALLOWLIST = array(
		// colors
		'background-body'            => array( 'type' => 'color', 'label' => 'Body background', 'group' => 'colors' ),
		'background-header'          => array( 'type' => 'color', 'label' => 'Header background', 'group' => 'colors' ),
		'background-footer'          => array( 'type' => 'color', 'label' => 'Footer background', 'group' => 'colors' ),
		'background-highlight'       => array( 'type' => 'color', 'label' => 'Highlight (accent) color', 'group' => 'colors' ),
		'background-subheader'       => array( 'type' => 'color', 'label' => 'Subheader background', 'group' => 'colors' ),
		'background-action-bar'      => array( 'type' => 'color', 'label' => 'Action bar background', 'group' => 'colors' ),
		'background-form'            => array( 'type' => 'color', 'label' => 'Form field background', 'group' => 'colors' ),
		'color-content'              => array( 'type' => 'color', 'label' => 'Body text color', 'group' => 'colors' ),
		'color-headings'             => array( 'type' => 'color', 'label' => 'Heading color', 'group' => 'colors' ),
		'color-menu'                 => array( 'type' => 'color', 'label' => 'Menu link color', 'group' => 'colors' ),

		// typography
		'font-content'               => array( 'type' => 'font', 'label' => 'Body font family', 'group' => 'typography' ),
		'font-headings'              => array( 'type' => 'font', 'label' => 'Headings font family', 'group' => 'typography' ),
		'font-menu'                  => array( 'type' => 'font', 'label' => 'Menu font family', 'group' => 'typography' ),
		'font-title'                 => array( 'type' => 'font', 'label' => 'Page title font family', 'group' => 'typography' ),
		'font-blockquote'            => array( 'type' => 'font', 'label' => 'Blockquote font family', 'group' => 'typography' ),
		'font-lead'                  => array( 'type' => 'font', 'label' => 'Lead paragraph font family', 'group' => 'typography' ),

		// layout
		'layout'                     => array( 'type' => 'string', 'label' => 'Site layout (full-width / boxed)', 'group' => 'layout' ),
		'responsive'                 => array( 'type' => 'bool', 'label' => 'Responsive layout', 'group' => 'layout' ),
		'back-top-top'               => array( 'type' => 'string', 'label' => 'Back to top button', 'group' => 'layout' ),

		// header + footer
		'header-style'               => array( 'type' => 'string', 'label' => 'Header style', 'group' => 'header-footer' ),
		'header-height'              => array( 'type' => 'number', 'label' => 'Header height', 'group' => 'header-footer' ),
		'header-fw'                  => array( 'type' => 'string', 'label' => 'Full-width header', 'group' => 'header-footer' ),
		'logo-img'                   => array( 'type' => 'string', 'label' => 'Logo image URL', 'group' => 'header-footer' ),
		'logo-text'                  => array( 'type' => 'string', 'label' => 'Logo text', 'group' => 'header-footer' ),
		'logo-width'                 => array( 'type' => 'string', 'label' => 'Logo width', 'group' => 'header-footer' ),
		'footer-layout'              => array( 'type' => 'string', 'label' => 'Footer layout', 'group' => 'header-footer' ),
		'footer-style'               => array( 'type' => 'string', 'label' => 'Footer style', 'group' => 'header-footer' ),
		'footer-padding'             => array( 'type' => 'string', 'label' => 'Footer padding', 'group' => 'header-footer' ),

		// blog
		'blog-layout'                => array( 'type' => 'string', 'label' => 'Blog layout', 'group' => 'blog' ),
		'blog-columns'               => array( 'type' => 'number', 'label' => 'Blog columns', 'group' => 'blog' ),
		'blog-posts'                 => array( 'type' => 'number', 'label' => 'Posts per page', 'group' => 'blog' ),
		'blog-author'                => array( 'type' => 'string', 'label' => 'Show post author', 'group' => 'blog' ),
		'blog-comments'              => array( 'type' => 'string', 'label' => 'Show comment count', 'group' => 'blog' ),
		'blog-related'               => array( 'type' => 'number', 'label' => 'Related posts count', 'group' => 'blog' ),
	);

	/** Settings groups, for the `group` filter. */
	const GROUPS = array( 'colors', 'typography', 'layout', 'header-footer', 'blog' );

	/**
	 * @return string
	 */
	public function id(): string {
		return 'betheme';
	}

	/**
	 * @return string
	 */
	public function label(): string {
		return __( 'BeTheme', 'emcp-tools' );
	}

	/**
	 * Registers only when BeTheme is the active theme.
	 *
	 * Keys off the template, not the stylesheet, so a child theme of BeTheme
	 * counts. That is how most production BeTheme sites are built, and checking
	 * the stylesheet would leave them without the tools.
	 *
	 * @return bool
	 */
	public function is_available(): bool {
		return 'betheme' === strtolower( (string) get_template() );
	}

	/**
	 * @return array<string,array{mode:string,run:callable,perm:callable,desc:string}>
	 */
	protected function operations(): array {
		return array(
			'get-context'      => array(
				'mode' => 'read',
				'run'  => array( $this, 'execute_get_context' ),
				'perm' => array( $this, 'can_read' ),
				'desc' => __( 'BeTheme version, whether BeBuilder is usable, the settings groups available, and how many pages already use BeBuilder. Start here.', 'emcp-tools' ),
			),
			'get-settings'     => array(
				'mode' => 'read',
				'run'  => array( $this, 'execute_get_settings' ),
				'perm' => array( $this, 'can_read' ),
				'desc' => __( 'Read curated BeTheme settings with value + type/label/group. Optional { group } (colors|typography|layout|header-footer|blog) or { keys: [...] }; no argument returns all.', 'emcp-tools' ),
			),
			'list-item-types'  => array(
				'mode' => 'read',
				'run'  => array( $this, 'execute_list_item_types' ),
				'perm' => array( $this, 'can_read' ),
				'desc' => __( 'List BeBuilder item types available on this site. Optional { search }. Step 1 of discover, inspect, act.', 'emcp-tools' ),
			),
			'get-item-schema'  => array(
				'mode' => 'read',
				'run'  => array( $this, 'execute_get_item_schema' ),
				'perm' => array( $this, 'can_read' ),
				'desc' => __( 'The settings an item type accepts, read from the theme\'s own renderer. { type } or { types: [...] }. Step 2 before adding an item.', 'emcp-tools' ),
			),
			'get-page'         => array(
				'mode' => 'read',
				'run'  => array( $this, 'execute_get_page' ),
				'perm' => array( $this, 'can_read' ),
				'desc' => __( 'A page\'s BeBuilder structure as sections > wraps > items, with each item\'s uid, type and settings. { post_id }.', 'emcp-tools' ),
			),
			'update-settings'  => array(
				'mode' => 'write',
				'run'  => array( $this, 'execute_update_settings' ),
				'perm' => array( $this, 'can_write' ),
				'desc' => __( 'Write curated BeTheme settings ({ values: { key: value } }). Keys outside the curated list are reported in skipped[] rather than written.', 'emcp-tools' ),
			),
			'set-page'         => array(
				'mode' => 'write',
				'run'  => array( $this, 'execute_set_page' ),
				'perm' => array( $this, 'can_write' ),
				'desc' => __( 'Replace a page\'s whole BeBuilder content. { post_id, sections: [ { attr?, wraps: [ { size, attr?, items: [ { type, size, attr } ] } ] } ] }. Structure is validated before anything is written.', 'emcp-tools' ),
			),
			'add-section'      => array(
				'mode' => 'write',
				'run'  => array( $this, 'execute_add_section' ),
				'perm' => array( $this, 'can_write' ),
				'desc' => __( 'Append one section to a page\'s BeBuilder content, leaving existing sections alone. { post_id, wraps: [...] , attr?, position? }.', 'emcp-tools' ),
			),
		);
	}

	// -----------------------------------------------------------------
	// Read
	// -----------------------------------------------------------------

	/**
	 * @param array $input Unused.
	 * @return array
	 */
	public function execute_get_context( $input ): array {
		unset( $input );
		$theme = wp_get_theme( get_template() );

		return array(
			'theme'            => 'betheme',
			'version'          => $theme instanceof WP_Theme ? (string) $theme->get( 'Version' ) : '',
			'is_child_theme'   => get_template() !== get_stylesheet(),
			'bebuilder_ready'  => class_exists( 'Mfn_Builder_Items' ) && class_exists( 'Mfn_Builder_Front' ),
			'item_types'       => count( $this->item_types() ),
			'settings_groups'  => self::GROUPS,
			'curated_settings' => count( self::ALLOWLIST ),
			'total_settings'   => count( (array) get_option( self::OPTION, array() ) ),
			'pages_using_bebuilder' => $this->count_bebuilder_pages(),
			'note'             => __( 'BeTheme\'s own template system is not covered by these tools; use Neo EMCP Themer, or BeTheme\'s Templates screen directly.', 'emcp-tools' ),
		);
	}

	/**
	 * @param array $input { group?: string, keys?: string[] }.
	 * @return array
	 */
	public function execute_get_settings( $input ): array {
		$group  = isset( $input['group'] ) ? (string) $input['group'] : '';
		$keys   = ( isset( $input['keys'] ) && is_array( $input['keys'] ) ) ? array_map( 'strval', $input['keys'] ) : array();
		$option = (array) get_option( self::OPTION, array() );

		$out = array();
		foreach ( self::ALLOWLIST as $key => $meta ) {
			if ( '' !== $group && $meta['group'] !== $group ) {
				continue;
			}
			if ( $keys && ! in_array( $key, $keys, true ) ) {
				continue;
			}
			$out[ $key ] = array(
				'value' => array_key_exists( $key, $option ) ? $option[ $key ] : null,
				'type'  => $meta['type'],
				'label' => $meta['label'],
				'group' => $meta['group'],
			);
		}

		return array(
			'settings' => $out,
			'count'    => count( $out ),
			'groups'   => self::GROUPS,
		);
	}

	/**
	 * @param array $input { search?: string }.
	 * @return array
	 */
	public function execute_list_item_types( $input ): array {
		$search = isset( $input['search'] ) ? strtolower( trim( (string) $input['search'] ) ) : '';
		$types  = $this->item_types();

		if ( '' !== $search ) {
			$types = array_values(
				array_filter(
					$types,
					static function ( $t ) use ( $search ) {
						return false !== strpos( $t, $search );
					}
				)
			);
		}

		return array(
			'item_types' => $types,
			'count'      => count( $types ),
			'note'       => __( 'Use get-item-schema for a type before adding it. An item is { type, size, attr }, and size is required.', 'emcp-tools' ),
		);
	}

	/**
	 * @param array $input { type?: string, types?: string[] }.
	 * @return array|WP_Error
	 */
	public function execute_get_item_schema( $input ) {
		$types = array();
		if ( isset( $input['types'] ) && is_array( $input['types'] ) ) {
			$types = array_map( 'strval', $input['types'] );
		} elseif ( isset( $input['type'] ) ) {
			$types = array( (string) $input['type'] );
		}
		if ( ! $types ) {
			return new WP_Error( 'missing_type', __( 'Pass { type } or { types: [...] }.', 'emcp-tools' ) );
		}

		$known = $this->item_types();
		$out   = array();
		foreach ( $types as $type ) {
			if ( ! in_array( $type, $known, true ) ) {
				$out[ $type ] = array( 'error' => __( 'Unknown item type on this site.', 'emcp-tools' ) );
				continue;
			}
			$out[ $type ] = $this->item_schema( $type );
		}

		return array( 'schemas' => $out );
	}

	/**
	 * @param array $input { post_id: int }.
	 * @return array|WP_Error
	 */
	public function execute_get_page( $input ) {
		$post_id = isset( $input['post_id'] ) ? absint( $input['post_id'] ) : 0;
		if ( ! $post_id || ! get_post( $post_id ) ) {
			return new WP_Error( 'not_found', __( 'Post not found.', 'emcp-tools' ) );
		}

		$items = get_post_meta( $post_id, self::META_ITEMS, true );
		if ( ! is_array( $items ) ) {
			return array(
				'post_id'      => $post_id,
				'uses_builder' => false,
				'sections'     => array(),
				'note'         => __( 'This page has no BeBuilder content.', 'emcp-tools' ),
			);
		}

		$sections = array();
		foreach ( $items as $s => $section ) {
			$wraps = array();
			foreach ( (array) ( $section['wraps'] ?? array() ) as $w => $wrap ) {
				$wrap_items = array();
				foreach ( (array) ( $wrap['items'] ?? array() ) as $i => $item ) {
					$wrap_items[] = array(
						'index' => $i,
						'uid'   => (string) ( $item['uid'] ?? '' ),
						'type'  => (string) ( $item['type'] ?? '' ),
						'size'  => (string) ( $item['size'] ?? '' ),
						'attr'  => (array) ( $item['attr'] ?? ( $item['fields'] ?? array() ) ),
					);
				}
				$wraps[] = array(
					'index' => $w,
					'size'  => (string) ( $wrap['size'] ?? '' ),
					'attr'  => (array) ( $wrap['attr'] ?? array() ),
					'items' => $wrap_items,
				);
			}
			$sections[] = array(
				'index' => $s,
				'attr'  => (array) ( $section['attr'] ?? array() ),
				'wraps' => $wraps,
			);
		}

		return array(
			'post_id'      => $post_id,
			'uses_builder' => true,
			'sections'     => $sections,
			'count'        => count( $sections ),
		);
	}

	// -----------------------------------------------------------------
	// Write
	// -----------------------------------------------------------------

	/**
	 * @param array $input { values: array<string,mixed> }.
	 * @return array|WP_Error
	 */
	public function execute_update_settings( $input ) {
		$values = ( isset( $input['values'] ) && is_array( $input['values'] ) ) ? $input['values'] : array();
		if ( ! $values ) {
			return new WP_Error( 'missing_values', __( 'Pass { values: { key: value } }.', 'emcp-tools' ) );
		}

		$option  = (array) get_option( self::OPTION, array() );
		$updated = array();
		$skipped = array();

		foreach ( $values as $key => $value ) {
			$key = (string) $key;
			if ( ! isset( self::ALLOWLIST[ $key ] ) ) {
				$skipped[ $key ] = __( 'Not in the curated settings list.', 'emcp-tools' );
				continue;
			}
			$clean = $this->sanitize_setting( $value, self::ALLOWLIST[ $key ]['type'] );
			if ( is_wp_error( $clean ) ) {
				$skipped[ $key ] = $clean->get_error_message();
				continue;
			}
			$option[ $key ]  = $clean;
			$updated[ $key ] = $clean;
		}

		if ( $updated ) {
			update_option( self::OPTION, $option );
			$this->flush_theme_cache();
		}

		return array(
			'updated' => $updated,
			'skipped' => $skipped,
			'note'    => $updated ? __( 'BeTheme regenerates its stylesheet from these values; a caching plugin may need clearing.', 'emcp-tools' ) : '',
		);
	}

	/**
	 * @param array $input { post_id: int, sections: array }.
	 * @return array|WP_Error
	 */
	public function execute_set_page( $input ) {
		$post_id = isset( $input['post_id'] ) ? absint( $input['post_id'] ) : 0;
		if ( ! $post_id || ! get_post( $post_id ) ) {
			return new WP_Error( 'not_found', __( 'Post not found.', 'emcp-tools' ) );
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error( 'forbidden', __( 'You cannot edit that post.', 'emcp-tools' ) );
		}

		$sections = ( isset( $input['sections'] ) && is_array( $input['sections'] ) ) ? $input['sections'] : null;
		if ( null === $sections ) {
			return new WP_Error( 'missing_sections', __( 'Pass { sections: [...] }.', 'emcp-tools' ) );
		}

		$built = $this->build_sections( $sections );
		if ( is_wp_error( $built ) ) {
			return $built;
		}

		update_post_meta( $post_id, self::META_ITEMS, $built );

		return array(
			'post_id'  => $post_id,
			'sections' => count( $built ),
			'items'    => $this->count_items( $built ),
			'edit_url' => get_edit_post_link( $post_id, 'raw' ),
		);
	}

	/**
	 * @param array $input { post_id: int, wraps: array, attr?: array, position?: string }.
	 * @return array|WP_Error
	 */
	public function execute_add_section( $input ) {
		$post_id = isset( $input['post_id'] ) ? absint( $input['post_id'] ) : 0;
		if ( ! $post_id || ! get_post( $post_id ) ) {
			return new WP_Error( 'not_found', __( 'Post not found.', 'emcp-tools' ) );
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error( 'forbidden', __( 'You cannot edit that post.', 'emcp-tools' ) );
		}

		$section = array(
			'attr'  => ( isset( $input['attr'] ) && is_array( $input['attr'] ) ) ? $input['attr'] : array(),
			'wraps' => ( isset( $input['wraps'] ) && is_array( $input['wraps'] ) ) ? $input['wraps'] : array(),
		);

		$built = $this->build_sections( array( $section ) );
		if ( is_wp_error( $built ) ) {
			return $built;
		}

		$existing = get_post_meta( $post_id, self::META_ITEMS, true );
		$existing = is_array( $existing ) ? $existing : array();

		$position = isset( $input['position'] ) ? (string) $input['position'] : 'end';
		$merged   = ( 'start' === $position )
			? array_merge( $built, $existing )
			: array_merge( $existing, $built );

		update_post_meta( $post_id, self::META_ITEMS, $merged );

		return array(
			'post_id'  => $post_id,
			'sections' => count( $merged ),
			'added_at' => 'start' === $position ? 0 : count( $merged ) - 1,
		);
	}

	// -----------------------------------------------------------------
	// Internals
	// -----------------------------------------------------------------

	/**
	 * Validates and normalizes an incoming section tree into what BeTheme
	 * actually renders.
	 *
	 * This is where the two silent-failure traps are closed. `size` is filled in
	 * rather than left missing, because the renderer drops a sizeless item with
	 * no error, and settings are written to `attr`, because that is the key the
	 * renderer reads. A caller that sends `fields` gets it honoured too, since
	 * the theme falls back to it.
	 *
	 * @param array $sections Caller-supplied sections.
	 * @return array|WP_Error
	 */
	protected function build_sections( array $sections ) {
		$known = $this->item_types();
		$out   = array();

		foreach ( $sections as $s => $section ) {
			if ( ! is_array( $section ) ) {
				return new WP_Error( 'bad_section', sprintf( 'Section %d is not an object.', $s ) );
			}
			$wraps = ( isset( $section['wraps'] ) && is_array( $section['wraps'] ) ) ? $section['wraps'] : array();
			if ( ! $wraps ) {
				return new WP_Error( 'empty_section', sprintf( 'Section %d has no wraps. A section holds wraps, and a wrap holds items.', $s ) );
			}

			$built_wraps = array();
			foreach ( $wraps as $w => $wrap ) {
				if ( ! is_array( $wrap ) ) {
					return new WP_Error( 'bad_wrap', sprintf( 'Section %d wrap %d is not an object.', $s, $w ) );
				}
				$items = ( isset( $wrap['items'] ) && is_array( $wrap['items'] ) ) ? $wrap['items'] : array();

				$built_items = array();
				foreach ( $items as $i => $item ) {
					if ( ! is_array( $item ) || empty( $item['type'] ) ) {
						return new WP_Error( 'bad_item', sprintf( 'Section %d wrap %d item %d has no type.', $s, $w, $i ) );
					}
					$type = (string) $item['type'];
					if ( ! in_array( $type, $known, true ) ) {
						return new WP_Error(
							'unknown_item_type',
							sprintf( 'Unknown BeBuilder item type "%s". Use list-item-types to see what this site supports.', $type )
						);
					}

					// attr is what the renderer reads; fields is its fallback.
					$attr = array();
					if ( isset( $item['attr'] ) && is_array( $item['attr'] ) ) {
						$attr = $item['attr'];
					} elseif ( isset( $item['fields'] ) && is_array( $item['fields'] ) ) {
						$attr = $item['fields'];
					}

					$built_items[] = array(
						'uid'  => ! empty( $item['uid'] ) ? (string) $item['uid'] : $this->uid(),
						'type' => $type,
						// Required: the renderer returns early without it.
						'size' => ! empty( $item['size'] ) ? (string) $item['size'] : '1/1',
						'attr' => $attr,
					);
				}

				$built_wraps[] = array(
					'attr'  => ( isset( $wrap['attr'] ) && is_array( $wrap['attr'] ) ) ? $wrap['attr'] : array(),
					// Required, same reason as the item.
					'size'  => ! empty( $wrap['size'] ) ? (string) $wrap['size'] : '1/1',
					'items' => $built_items,
				);
			}

			$out[] = array(
				'attr'  => ( isset( $section['attr'] ) && is_array( $section['attr'] ) ) ? $section['attr'] : array(),
				'wraps' => $built_wraps,
			);
		}

		return $out;
	}

	/**
	 * The item types this install actually supports, from the theme's own class.
	 *
	 * Read at runtime rather than hardcoded, so a BeTheme update that adds or
	 * removes an item is reflected without a plugin release.
	 *
	 * @return string[]
	 */
	protected function item_types(): array {
		static $types = null;
		if ( null !== $types ) {
			return $types;
		}
		$types = array();
		if ( ! class_exists( 'Mfn_Builder_Items' ) ) {
			return $types;
		}
		foreach ( get_class_methods( 'Mfn_Builder_Items' ) as $method ) {
			if ( 0 === strpos( $method, 'item_' ) ) {
				$types[] = substr( $method, 5 );
			}
		}
		sort( $types );
		return $types;
	}

	/**
	 * An item type's accepted settings, read from its renderer.
	 *
	 * Each item is rendered by an `sc_<type>()` function whose shortcode_atts
	 * call IS the field contract, defaults included. Reading it beats shipping
	 * 135 hand-written schemas that would drift with every BeTheme release.
	 * About a quarter of the types take no configuration at all (most of the
	 * WooCommerce ones), and those are reported honestly rather than guessed at.
	 *
	 * @param string $type Item type.
	 * @return array
	 */
	protected function item_schema( string $type ): array {
		$fn = 'sc_' . $type;
		if ( ! function_exists( $fn ) ) {
			return array(
				'type'   => $type,
				'fields' => array(),
				'note'   => __( 'This item is rendered by the theme without a settings contract to read.', 'emcp-tools' ),
			);
		}

		try {
			$ref   = new ReflectionFunction( $fn );
			$lines = file( (string) $ref->getFileName() );
		} catch ( \Throwable $e ) {
			return array( 'type' => $type, 'fields' => array(), 'note' => __( 'Renderer could not be inspected.', 'emcp-tools' ) );
		}
		if ( ! $lines ) {
			return array( 'type' => $type, 'fields' => array(), 'note' => __( 'Renderer source unavailable.', 'emcp-tools' ) );
		}

		$src = implode( '', array_slice( $lines, $ref->getStartLine() - 1, $ref->getEndLine() - $ref->getStartLine() + 1 ) );
		if ( ! preg_match( '/shortcode_atts\s*\(\s*array\s*\((.*?)\)\s*,\s*\$attr/s', $src, $m ) ) {
			return array(
				'type'   => $type,
				'fields' => array(),
				'note'   => __( 'This item takes no configurable settings.', 'emcp-tools' ),
			);
		}

		preg_match_all( '/[\'"]([a-z0-9_]+)[\'"]\s*=>\s*([^,\n]*)/i', $m[1], $hits, PREG_SET_ORDER );
		$fields = array();
		foreach ( $hits as $hit ) {
			$default = trim( $hit[2] );
			$default = trim( $default, "'\"" );
			$fields[ $hit[1] ] = array( 'default' => $default );
		}

		return array(
			'type'   => $type,
			'fields' => $fields,
			'count'  => count( $fields ),
		);
	}

	/**
	 * Sanitizes a setting for its declared type.
	 *
	 * @param mixed  $value Raw value.
	 * @param string $type  Declared type.
	 * @return mixed|WP_Error
	 */
	protected function sanitize_setting( $value, string $type ) {
		switch ( $type ) {
			case 'color':
				$value = trim( (string) $value );
				if ( '' === $value ) {
					return '';
				}
				if ( ! preg_match( '/^#([0-9a-f]{3}|[0-9a-f]{6})$/i', $value ) && ! preg_match( '/^rgba?\([\d\s.,%]+\)$/i', $value ) ) {
					return new WP_Error( 'bad_color', __( 'Expected a hex or rgb(a) color.', 'emcp-tools' ) );
				}
				return $value;

			case 'number':
				if ( ! is_numeric( $value ) ) {
					return new WP_Error( 'bad_number', __( 'Expected a number.', 'emcp-tools' ) );
				}
				return 0 + $value;

			case 'bool':
				return ( $value && 'false' !== $value && '0' !== (string) $value ) ? '1' : '';

			case 'font':
			case 'string':
			default:
				return sanitize_text_field( (string) $value );
		}
	}

	/**
	 * BeTheme caches its generated CSS; a settings change has to invalidate it
	 * or the site keeps serving the old stylesheet.
	 *
	 * @return void
	 */
	protected function flush_theme_cache(): void {
		delete_transient( 'mfn_css' );
		delete_option( 'mfn_css_time' );
		if ( function_exists( 'mfn_opts_setup' ) ) {
			mfn_opts_setup();
		}
	}

	/**
	 * A BeBuilder-style unique id.
	 *
	 * @return string
	 */
	protected function uid(): string {
		return substr( md5( uniqid( 'emcp', true ) ), 0, 9 );
	}

	/**
	 * @param array $sections Built sections.
	 * @return int
	 */
	protected function count_items( array $sections ): int {
		$n = 0;
		foreach ( $sections as $section ) {
			foreach ( (array) ( $section['wraps'] ?? array() ) as $wrap ) {
				$n += count( (array) ( $wrap['items'] ?? array() ) );
			}
		}
		return $n;
	}

	/**
	 * How many posts already carry BeBuilder content.
	 *
	 * @return int
	 */
	protected function count_bebuilder_pages(): int {
		global $wpdb;
		return (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(DISTINCT post_id) FROM {$wpdb->postmeta} WHERE meta_key = %s AND meta_value != ''",
				self::META_ITEMS
			)
		);
	}
}
