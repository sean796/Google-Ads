<?php
/**
 * Breadcrumb trail, built the way Rank Math builds it and using its settings
 * (breadcrumbs, breadcrumbs_home, breadcrumbs_home_label, breadcrumbs_separator, …).
 *
 * Used for the BreadcrumbList node in the schema graph and the [rank_math_breadcrumb] shortcode.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Seo_Breadcrumbs {

	public static function enabled(): bool {
		return Neo_Pulse_Wp_Seo_Settings::on( Neo_Pulse_Wp_Seo_Settings::gen( 'breadcrumbs', 'off' ) );
	}

	/**
	 * @param array<string, mixed> $ctx Page context from Neo_Pulse_Wp_Seo_Head::context().
	 * @return array<int, array{name: string, url: string}>
	 */
	public static function trail( array $ctx ): array {
		$S     = 'Neo_Pulse_Wp_Seo_Settings';
		$kind  = (string) ( $ctx['kind'] ?? 'other' );
		$items = array();

		if ( 'home' === $kind || ! empty( $ctx['front'] ) || 'other' === $kind ) {
			return array();
		}

		if ( $S::on( $S::gen( 'breadcrumbs_home', 'on' ) ) ) {
			$link    = trim( (string) $S::gen( 'breadcrumbs_home_link', '' ) );
			$items[] = array(
				'name' => (string) $S::gen( 'breadcrumbs_home_label', __( 'Home', 'neo-pulse-wp' ) ),
				'url'  => $link !== '' ? $link : home_url( '/' ),
			);
		}

		switch ( $kind ) {
			case 'singular':
				$post = $ctx['post'] instanceof WP_Post ? $ctx['post'] : null;
				if ( ! $post ) {
					return array();
				}
				$items = array_merge( $items, self::singular_parents( $post ) );
				$label = trim( (string) get_post_meta( $post->ID, 'rank_math_breadcrumb_title', true ) );
				$items[] = array(
					'name' => $label !== '' ? $label : Neo_Pulse_Wp_Seo_Vars::decode( get_the_title( $post ) ),
					'url'  => (string) get_permalink( $post ),
				);
				break;

			case 'posts_page':
				$post = $ctx['post'] instanceof WP_Post ? $ctx['post'] : null;
				if ( $post ) {
					$items[] = array(
						'name' => Neo_Pulse_Wp_Seo_Vars::decode( get_the_title( $post ) ),
						'url'  => (string) get_permalink( $post ),
					);
				}
				break;

			case 'term':
				$term = $ctx['term'] instanceof WP_Term ? $ctx['term'] : null;
				if ( ! $term ) {
					return array();
				}
				foreach ( array_reverse( get_ancestors( $term->term_id, $term->taxonomy, 'taxonomy' ) ) as $ancestor_id ) {
					$ancestor = get_term( (int) $ancestor_id, $term->taxonomy );
					if ( $ancestor instanceof WP_Term ) {
						$items[] = self::term_item( $ancestor );
					}
				}
				$items[] = self::term_item( $term );
				break;

			case 'pt_archive':
				$object = get_post_type_object( (string) $ctx['post_type'] );
				if ( $object ) {
					$items[] = array(
						'name' => (string) $object->labels->name,
						'url'  => (string) get_post_type_archive_link( $object->name ),
					);
				}
				break;

			case 'author':
				$user = $ctx['user'] instanceof WP_User ? $ctx['user'] : null;
				if ( $user ) {
					$items[] = array(
						'name' => trim( (string) $S::gen( 'breadcrumbs_archive_format', __( 'Archives for', 'neo-pulse-wp' ) ) . ' ' . $user->display_name ),
						'url'  => get_author_posts_url( $user->ID ),
					);
				}
				break;

			case 'date':
				$items[] = array(
					'name' => trim( (string) $S::gen( 'breadcrumbs_archive_format', __( 'Archives for', 'neo-pulse-wp' ) ) . ' ' . Neo_Pulse_Wp_Seo_Vars::archive_date() ),
					'url'  => (string) ( $ctx['url'] ?? '' ),
				);
				break;

			case 'search':
				$items[] = array(
					'name' => trim( (string) $S::gen( 'breadcrumbs_search_format', __( 'You searched for', 'neo-pulse-wp' ) ) . ' ' . (string) $ctx['search'] ),
					'url'  => (string) ( $ctx['url'] ?? get_search_link( (string) $ctx['search'] ) ),
				);
				break;

			case '404':
				$items[] = array(
					'name' => (string) $S::gen( 'breadcrumbs_404_label', __( '404 Error: page not found', 'neo-pulse-wp' ) ),
					'url'  => '',
				);
				break;
		}

		return array_values(
			array_filter(
				$items,
				static function ( array $item ): bool {
					return trim( $item['name'] ) !== '';
				}
			)
		);
	}

	/**
	 * Crumbs between Home and the post: page parents, the post type archive, or the primary term.
	 *
	 * @return array<int, array{name: string, url: string}>
	 */
	private static function singular_parents( WP_Post $post ): array {
		$S     = 'Neo_Pulse_Wp_Seo_Settings';
		$items = array();

		if ( is_post_type_hierarchical( $post->post_type ) ) {
			foreach ( array_reverse( get_post_ancestors( $post ) ) as $ancestor_id ) {
				$items[] = array(
					'name' => Neo_Pulse_Wp_Seo_Vars::decode( get_the_title( (int) $ancestor_id ) ),
					'url'  => (string) get_permalink( (int) $ancestor_id ),
				);
			}
			return $items;
		}

		if ( 'post' === $post->post_type && $S::on( $S::gen( 'breadcrumbs_blog_page', 'off' ) ) ) {
			$blog = (int) get_option( 'page_for_posts' );
			if ( $blog > 0 ) {
				$items[] = array(
					'name' => Neo_Pulse_Wp_Seo_Vars::decode( get_the_title( $blog ) ),
					'url'  => (string) get_permalink( $blog ),
				);
			}
		}

		if ( 'post' !== $post->post_type ) {
			$object = get_post_type_object( $post->post_type );
			$link   = $object && $object->has_archive ? get_post_type_archive_link( $post->post_type ) : false;
			if ( $object && is_string( $link ) && $link !== '' ) {
				$items[] = array(
					'name' => (string) $object->labels->name,
					'url'  => $link,
				);
			}
		}

		$term = Neo_Pulse_Wp_Seo_Vars::primary_term( $post );
		if ( $term ) {
			if ( $S::on( $S::gen( 'breadcrumbs_ancestor_categories', 'off' ) ) ) {
				foreach ( array_reverse( get_ancestors( $term->term_id, $term->taxonomy, 'taxonomy' ) ) as $ancestor_id ) {
					$ancestor = get_term( (int) $ancestor_id, $term->taxonomy );
					if ( $ancestor instanceof WP_Term ) {
						$items[] = self::term_item( $ancestor );
					}
				}
			}
			$items[] = self::term_item( $term );
		}
		return $items;
	}

	/**
	 * @return array{name: string, url: string}
	 */
	private static function term_item( WP_Term $term ): array {
		$label = trim( (string) get_term_meta( $term->term_id, 'rank_math_breadcrumb_title', true ) );
		$link  = get_term_link( $term );
		return array(
			'name' => $label !== '' ? $label : Neo_Pulse_Wp_Seo_Vars::decode( $term->name ),
			'url'  => is_string( $link ) ? $link : '',
		);
	}

	/**
	 * BreadcrumbList node, in the same shape Rank Math prints.
	 *
	 * @param array<int, array{name: string, url: string}> $trail Trail.
	 * @return array<string, mixed>
	 */
	public static function schema_node( array $trail, string $page_url ): array {
		if ( count( $trail ) < 1 || $page_url === '' ) {
			return array();
		}
		$list = array();
		$pos  = 0;
		foreach ( $trail as $item ) {
			++$pos;
			$list[] = array(
				'@type'    => 'ListItem',
				'position' => (string) $pos,
				'item'     => array(
					'@id'  => $item['url'] !== '' ? $item['url'] : $page_url,
					'name' => $item['name'],
				),
			);
		}
		return array(
			'@type'           => 'BreadcrumbList',
			'@id'             => $page_url . '#breadcrumb',
			'itemListElement' => $list,
		);
	}

	/**
	 * [rank_math_breadcrumb] once Rank Math is gone.
	 */
	public static function shortcode(): string {
		if ( ! self::enabled() || ! class_exists( 'Neo_Pulse_Wp_Seo_Head', false ) ) {
			return '';
		}
		$ctx        = Neo_Pulse_Wp_Seo_Head::context();
		$ctx['url'] = Neo_Pulse_Wp_Seo_Head::canonical( $ctx );
		$trail      = self::trail( $ctx );
		if ( $trail === array() ) {
			return '';
		}
		$sep   = (string) Neo_Pulse_Wp_Seo_Settings::gen( 'breadcrumbs_separator', '-' );
		$parts = array();
		$last  = count( $trail ) - 1;
		foreach ( $trail as $i => $item ) {
			$parts[] = ( $i < $last && $item['url'] !== '' )
				? '<a href="' . esc_url( $item['url'] ) . '">' . esc_html( $item['name'] ) . '</a>'
				: '<span class="last">' . esc_html( $item['name'] ) . '</span>';
		}
		return '<nav aria-label="' . esc_attr__( 'Breadcrumbs', 'neo-pulse-wp' ) . '" class="rank-math-breadcrumb"><p>'
			. implode( '<span class="separator"> ' . esc_html( html_entity_decode( $sep, ENT_QUOTES, 'UTF-8' ) ) . ' </span>', $parts )
			. '</p></nav>';
	}
}
