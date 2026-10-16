<?php
/**
 * Pro dynamic sources: the ones needing per-field configuration, plus the two
 * cross-cutting behaviours Elementor Pro charges for (fallback and formatting).
 *
 * custom_field() previously lived in the free provider but was absent from the
 * catalog, so it was unreachable. It moves here rather than being gated in
 * place, because shipping Pro-only logic inside the free build is misleading.
 *
 * @package EMCP_Tools
 * @since   3.13.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @since 3.13.0
 */
class EMCP_Tools_Themer_Dynamic_Pro {

	/** Attach to the free catalog and resolver seams. */
	public static function init(): void {
		if ( ! function_exists( 'emcp_tools_fs' ) || ! emcp_tools_fs()->can_use_premium_code() ) {
			return;
		}
		add_filter( 'emcp_themer_dynamic_sources', array( __CLASS__, 'sources' ) );
		// Resolve first, then let the fallback run on whatever came back.
		add_filter( 'emcp_themer_dynamic_value', array( __CLASS__, 'value' ), 10, 3 );
		add_filter( 'emcp_themer_dynamic_value', array( __CLASS__, 'apply_fallback' ), 20, 3 );
	}

	/**
	 * Register the Pro source definitions.
	 *
	 * @param array $sources Free sources.
	 * @return array
	 */
	public static function sources( array $sources ): array {
		$pro = array(
			'custom-field'  => array( 'label' => __( 'Custom Field', 'emcp-tools' ), 'icon' => 'admin-generic', 'type' => 'text', 'args' => array( 'key' ) ),
			'author-name'   => array( 'label' => __( 'Author Name', 'emcp-tools' ), 'icon' => 'admin-users', 'type' => 'text', 'args' => array() ),
			'author-bio'    => array( 'label' => __( 'Author Bio', 'emcp-tools' ), 'icon' => 'admin-users', 'type' => 'text', 'args' => array() ),
			'author-url'    => array( 'label' => __( 'Author URL', 'emcp-tools' ), 'icon' => 'admin-links', 'type' => 'url', 'args' => array() ),
			'author-avatar' => array( 'label' => __( 'Author Avatar', 'emcp-tools' ), 'icon' => 'admin-users', 'type' => 'image', 'args' => array() ),
			'term-name'     => array( 'label' => __( 'Term Name', 'emcp-tools' ), 'icon' => 'category', 'type' => 'text', 'args' => array( 'taxonomy' ) ),
			'term-url'      => array( 'label' => __( 'Term URL', 'emcp-tools' ), 'icon' => 'admin-links', 'type' => 'url', 'args' => array( 'taxonomy' ) ),
		);
		// Every Pro source accepts a fallback, and that is the whole point of the
		// tier: a template that degrades gracefully when a field is empty.
		foreach ( $pro as $key => $def ) {
			$def['args']  = array_merge( (array) $def['args'], array( 'fallback' ) );
			$pro[ $key ]  = $def;
		}
		return array_merge( $sources, $pro );
	}

	/**
	 * Resolve a Pro source.
	 *
	 * @param mixed  $value Current value (null when unresolved).
	 * @param string $key   Source key.
	 * @param array  $args  Source args.
	 * @return mixed
	 */
	public static function value( $value, string $key, array $args ) {
		// Same resolution as the free sources, preview fallback included.
		$post_id = EMCP_Tools_Themer_Dynamic::current_post_id();

		switch ( $key ) {
			case 'custom-field':
				$meta = isset( $args['key'] ) ? (string) $args['key'] : '';
				if ( '' === $meta || ! $post_id ) {
					return '';
				}
				return self::field_value( $post_id, $meta );
			case 'author-name':
				return $post_id ? (string) get_the_author_meta( 'display_name', self::author_id( $post_id ) ) : '';
			case 'author-bio':
				return $post_id ? (string) get_the_author_meta( 'description', self::author_id( $post_id ) ) : '';
			case 'author-url':
				return $post_id ? (string) get_author_posts_url( self::author_id( $post_id ) ) : '';
			case 'author-avatar':
				// An avatar is not a Media Library attachment, so it has no id;
				// Elementor Pro's own Author Profile Picture tag returns the same
				// shape. Before 3.18.0 this source had no resolver and was empty.
				// Null when there is no avatar, so the fallback below can apply.
				$url = $post_id ? (string) get_avatar_url( self::author_id( $post_id ) ) : '';
				return '' === $url ? null : array( 'id' => 0, 'url' => $url, 'alt' => '' );
			case 'term-name':
				$term = self::term_for( $post_id, $args );
				return $term ? (string) $term->name : '';
			case 'term-url':
				$term = self::term_for( $post_id, $args );
				if ( ! $term ) {
					return '';
				}
				$link = get_term_link( $term );
				return is_wp_error( $link ) ? '' : (string) $link;
		}
		return $value;
	}

	/**
	 * The term a term source shows.
	 *
	 * The post's OWN term comes first, so a Loop Grid card on a category
	 * archive shows its own category rather than the archive's. Only when the
	 * post has none (or there is no post, as on the archive itself) does the
	 * queried term answer, and only when it is in the asked taxonomy.
	 *
	 * @param int   $post_id Post id, 0 when none.
	 * @param array $args    Source args; `taxonomy` defaults to category.
	 * @return object|null A term, or null.
	 */
	private static function term_for( int $post_id, array $args ) {
		$tax = isset( $args['taxonomy'] ) && is_string( $args['taxonomy'] ) ? sanitize_key( $args['taxonomy'] ) : '';
		if ( '' === $tax ) {
			$tax = 'category';
		}
		if ( $post_id ) {
			$terms = get_the_terms( $post_id, $tax );
			if ( is_array( $terms ) && $terms ) {
				$first = reset( $terms );
				if ( is_object( $first ) && isset( $first->term_id ) ) {
					return $first;
				}
			}
		}
		$queried = get_queried_object();
		if ( is_object( $queried ) && isset( $queried->term_id, $queried->taxonomy ) && $tax === $queried->taxonomy ) {
			return $queried;
		}
		return null;
	}

	/**
	 * Read a custom field, preferring ACF when it is active.
	 *
	 * ACF stores its own representation alongside postmeta, and a repeater or
	 * relationship read through get_post_meta() comes back as an internal
	 * reference rather than a usable value. Ask ACF first when it is present.
	 *
	 * @param int    $post_id Post id.
	 * @param string $key     Field name or meta key.
	 * @return string
	 */
	private static function field_value( int $post_id, string $key ): string {
		if ( function_exists( 'get_field' ) ) {
			$v = get_field( $key, $post_id );
			if ( null !== $v && '' !== $v ) {
				return is_scalar( $v ) ? (string) $v : '';
			}
		}
		$v = get_post_meta( $post_id, $key, true );
		return is_scalar( $v ) ? (string) $v : '';
	}

	/**
	 * @param int $post_id Post id.
	 * @return int
	 */
	private static function author_id( int $post_id ): int {
		return (int) get_post_field( 'post_author', $post_id );
	}

	/**
	 * Substitute a fallback when a source resolves empty.
	 *
	 * @param mixed  $value Resolved value.
	 * @param string $key   Source key.
	 * @param array  $args  Source args.
	 * @return mixed
	 */
	public static function apply_fallback( $value, string $key, array $args ) {
		$fallback = $args['fallback'] ?? '';
		if ( is_array( $fallback ) ) {
			// A MEDIA or URL control value.
			$fallback = isset( $fallback['url'] ) && is_string( $fallback['url'] ) ? $fallback['url'] : '';
		}
		$fallback = is_scalar( $fallback ) ? trim( (string) $fallback ) : '';
		if ( '' === $fallback ) {
			return $value;
		}

		$def = EMCP_Tools_Themer_Dynamic_Catalog::get( $key );
		if ( $def && 'image' === $def['type'] ) {
			// An image value with no URL is as empty as a missing one.
			$empty = null === $value || '' === $value || ( is_array( $value ) && '' === (string) ( $value['url'] ?? '' ) );
			return $empty ? array( 'id' => 0, 'url' => $fallback, 'alt' => '' ) : $value;
		}
		if ( null === $value || '' === $value ) {
			return $fallback;
		}
		return $value;
	}

	/**
	 * Format a scalar value. Non-scalars, such as the image array, pass through.
	 *
	 * @param mixed  $value Value.
	 * @param string $type  Value type.
	 * @param array  $args  Source args.
	 * @return mixed
	 */
	public static function format( $value, string $type, array $args ) {
		if ( ! is_string( $value ) || '' === $value ) {
			return $value;
		}
		$format = isset( $args['format'] ) ? (string) $args['format'] : '';
		if ( '' === $format ) {
			return $value;
		}
		if ( 'date' === $type ) {
			$ts = strtotime( $value );
			return false === $ts ? $value : (string) gmdate( $format, $ts );
		}
		return $value;
	}
}
