<?php
/**
 * Template variables used in SEO titles, descriptions and schema (%title%, %sep%, %sitename%, …).
 *
 * Same variable names as Rank Math, so templates and per-post values written by Rank Math keep
 * working. Unknown variables are removed rather than printed.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Seo_Vars {

	/**
	 * @param string               $template Template text.
	 * @param array<string, mixed> $ctx      Page context from Neo_Pulse_Wp_Seo_Head::context().
	 * @param string               $mode     'title' (tidy spacing and separators), 'text' (tidy spacing) or 'raw'.
	 */
	public static function replace( string $template, array $ctx, string $mode = 'title' ): string {
		if ( $template === '' ) {
			return '';
		}
		$out = $template;
		if ( strpos( $template, '%' ) !== false ) {
			$out = preg_replace_callback(
				'/%([a-z0-9_]+)(?:\(([^)%]*)\))?%/i',
				static function ( array $m ) use ( $ctx ): string {
					$value = self::value( strtolower( $m[1] ), isset( $m[2] ) ? (string) $m[2] : '', $ctx );
					return null === $value ? '' : (string) $value;
				},
				$template
			);
			if ( ! is_string( $out ) ) {
				$out = $template;
			}
		}
		if ( 'raw' === $mode ) {
			return $out;
		}
		return self::clean( $out, 'title' === $mode );
	}

	/**
	 * Replace variables in every string of a schema array.
	 *
	 * @param mixed                $data Schema value.
	 * @param array<string, mixed> $ctx  Page context.
	 * @return mixed
	 */
	public static function replace_deep( $data, array $ctx ) {
		if ( is_array( $data ) ) {
			foreach ( $data as $key => $value ) {
				$data[ $key ] = self::replace_deep( $value, $ctx );
			}
			return $data;
		}
		if ( is_string( $data ) && strpos( $data, '%' ) !== false ) {
			return trim( self::replace( $data, $ctx, 'raw' ) );
		}
		return $data;
	}

	/**
	 * Remove HTML tags (not text such as "I <3 NY"), collapse spaces and, for titles, stray separators.
	 */
	public static function clean( string $text, bool $title = true ): string {
		$text = (string) preg_replace( '#<(script|style)[^>]*>.*?</\1>#is', ' ', $text );
		$text = (string) preg_replace( '#</?[a-z][^>]*>#i', '', $text );
		$text = preg_replace( '/\s+/u', ' ', $text );
		$text = is_string( $text ) ? trim( $text ) : '';
		$sep  = Neo_Pulse_Wp_Seo_Settings::separator();
		if ( $title && $sep !== '' && $text !== '' ) {
			$q    = preg_quote( $sep, '/' );
			$text = (string) preg_replace( '/(?:\s*' . $q . '\s*){2,}/u', ' ' . $sep . ' ', $text );
			$text = (string) preg_replace( '/^(?:\s*' . $q . '\s*)+|(?:\s*' . $q . '\s*)+$/u', '', $text );
			$text = trim( $text );
		}
		return $text;
	}

	/**
	 * @param array<string, mixed> $ctx Page context.
	 * @return string|null
	 */
	public static function value( string $name, string $arg, array $ctx ) {
		$post = isset( $ctx['post'] ) && $ctx['post'] instanceof WP_Post ? $ctx['post'] : null;
		$term = isset( $ctx['term'] ) && $ctx['term'] instanceof WP_Term ? $ctx['term'] : null;
		$user = isset( $ctx['user'] ) && $ctx['user'] instanceof WP_User ? $ctx['user'] : null;

		switch ( $name ) {
			case 'sep':
				return Neo_Pulse_Wp_Seo_Settings::separator();
			case 'sitename':
				return self::decode( (string) get_bloginfo( 'name' ) );
			case 'sitedesc':
				return self::decode( (string) get_bloginfo( 'description' ) );
			case 'title':
				return self::title( $ctx );
			case 'parent_title':
				if ( $post && $post->post_parent > 0 ) {
					return self::decode( get_the_title( $post->post_parent ) );
				}
				return '';
			case 'excerpt':
				if ( $post ) {
					return self::excerpt( $post );
				}
				return $term ? self::term_description( $term ) : '';
			case 'excerpt_only':
				return $post ? self::decode( wp_strip_all_tags( (string) $post->post_excerpt ) ) : '';
			case 'term':
				return $term ? self::decode( $term->name ) : '';
			case 'term_description':
				return $term ? self::term_description( $term ) : '';
			case 'name':
			case 'post_author':
			case 'author':
				if ( $user ) {
					return self::decode( $user->display_name );
				}
				if ( $post ) {
					return self::decode( (string) get_the_author_meta( 'display_name', (int) $post->post_author ) );
				}
				return '';
			case 'user_description':
				$uid = $user ? $user->ID : ( $post ? (int) $post->post_author : 0 );
				return $uid ? self::decode( (string) get_the_author_meta( 'description', $uid ) ) : '';
			case 'userid':
				return (string) ( $user ? $user->ID : ( $post ? (int) $post->post_author : '' ) );
			case 'search_query':
				return isset( $ctx['search'] ) ? (string) $ctx['search'] : '';
			case 'date':
				if ( ( $ctx['kind'] ?? '' ) === 'date' && $arg === '' ) {
					return self::archive_date();
				}
				return $post ? self::post_date( $post, $arg, false ) : '';
			case 'modified':
				return $post ? self::post_date( $post, $arg, true ) : '';
			case 'currentyear':
				return wp_date( 'Y' );
			case 'currentmonth':
				return wp_date( 'F' );
			case 'currentday':
				return wp_date( 'jS' );
			case 'currentdate':
				return wp_date( (string) get_option( 'date_format' ) );
			case 'currenttime':
				return wp_date( (string) get_option( 'time_format' ) );
			case 'category':
				return $post ? self::first_term_name( $post, 'category' ) : '';
			case 'categories':
				return $post ? self::term_names( $post, 'category' ) : '';
			case 'tag':
				return $post ? self::first_term_name( $post, 'post_tag' ) : '';
			case 'tags':
				return $post ? self::term_names( $post, 'post_tag' ) : '';
			case 'primary_category':
			case 'primary_taxonomy_terms':
				$primary = $post ? self::primary_term( $post ) : null;
				return $primary ? self::decode( $primary->name ) : '';
			case 'focuskw':
			case 'keywords':
				if ( ! $post ) {
					return '';
				}
				$kw = (string) get_post_meta( $post->ID, 'rank_math_focus_keyword', true );
				if ( $name === 'focuskw' ) {
					$parts = explode( ',', $kw );
					return trim( (string) $parts[0] );
				}
				return trim( $kw );
			case 'seo_title':
				return isset( $ctx['seo_title'] ) ? (string) $ctx['seo_title'] : '';
			case 'seo_description':
				return isset( $ctx['seo_description'] ) ? (string) $ctx['seo_description'] : '';
			case 'url':
				return isset( $ctx['url'] ) ? (string) $ctx['url'] : '';
			case 'post_thumbnail':
				if ( $post ) {
					$thumb = get_the_post_thumbnail_url( $post, 'full' );
					return is_string( $thumb ) ? $thumb : '';
				}
				return '';
			case 'id':
				return $post ? (string) $post->ID : '';
			case 'pt_single':
			case 'pt_plural':
				$pt = $post ? $post->post_type : (string) ( $ctx['post_type'] ?? '' );
				$object = $pt !== '' ? get_post_type_object( $pt ) : null;
				if ( ! $object ) {
					return '';
				}
				return $name === 'pt_single' ? (string) $object->labels->singular_name : (string) $object->labels->name;
			case 'page':
				$paged = (int) ( $ctx['paged'] ?? 1 );
				if ( $paged < 2 ) {
					return '';
				}
				$max = max( $paged, (int) ( $ctx['max_pages'] ?? $paged ) );
				/* translators: 1: page number, 2: total pages */
				return Neo_Pulse_Wp_Seo_Settings::separator() . ' ' . sprintf( __( 'Page %1$d of %2$d', 'neo-pulse-wp' ), $paged, $max );
			case 'pagenumber':
				return (string) max( 1, (int) ( $ctx['paged'] ?? 1 ) );
			case 'pagetotal':
				return (string) max( 1, (int) ( $ctx['max_pages'] ?? 1 ) );
			case 'org_name':
				return (string) Neo_Pulse_Wp_Seo_Settings::get( 'knowledgegraph_name', get_bloginfo( 'name' ) );
			case 'org_logo':
				return (string) Neo_Pulse_Wp_Seo_Settings::get( 'knowledgegraph_logo', '' );
			case 'org_url':
				return (string) Neo_Pulse_Wp_Seo_Settings::get( 'url', home_url() );
			case 'customfield':
				if ( $post && $arg !== '' ) {
					$value = get_post_meta( $post->ID, $arg, true );
					return is_scalar( $value ) ? (string) $value : '';
				}
				return '';
			case 'filename':
				if ( $post && $post->post_type === 'attachment' ) {
					return (string) pathinfo( (string) get_attached_file( $post->ID ), PATHINFO_FILENAME );
				}
				return '';
			case 'archive_title':
				return self::title( $ctx );
			case 'term_hierarchy':
				if ( $term ) {
					$names = array();
					foreach ( array_reverse( get_ancestors( $term->term_id, $term->taxonomy, 'taxonomy' ) ) as $ancestor ) {
						$parent = get_term( (int) $ancestor, $term->taxonomy );
						if ( $parent instanceof WP_Term ) {
							$names[] = self::decode( $parent->name );
						}
					}
					$names[] = self::decode( $term->name );
					return implode( ' ' . Neo_Pulse_Wp_Seo_Settings::separator() . ' ', $names );
				}
				return '';
			case 'wc_price':
			case 'wc_sku':
			case 'wc_shortdesc':
				if ( $post && function_exists( 'wc_get_product' ) ) {
					$product = wc_get_product( $post->ID );
					if ( $product ) {
						if ( 'wc_price' === $name ) {
							return self::decode( wp_strip_all_tags( wc_price( (float) $product->get_price() ) ) );
						}
						if ( 'wc_sku' === $name ) {
							return (string) $product->get_sku();
						}
						return self::decode( wp_strip_all_tags( (string) $product->get_short_description() ) );
					}
				}
				return '';
		}
		return null;
	}

	/**
	 * @param array<string, mixed> $ctx Page context.
	 */
	public static function title( array $ctx ): string {
		$post = isset( $ctx['post'] ) && $ctx['post'] instanceof WP_Post ? $ctx['post'] : null;
		$kind = (string) ( $ctx['kind'] ?? '' );
		switch ( $kind ) {
			case 'term':
				return isset( $ctx['term'] ) && $ctx['term'] instanceof WP_Term ? self::decode( $ctx['term']->name ) : '';
			case 'author':
				return isset( $ctx['user'] ) && $ctx['user'] instanceof WP_User ? self::decode( $ctx['user']->display_name ) : '';
			case 'pt_archive':
				$object = get_post_type_object( (string) ( $ctx['post_type'] ?? '' ) );
				return $object ? self::decode( (string) $object->labels->name ) : '';
			case 'date':
				return self::archive_date();
			case 'search':
				return (string) ( $ctx['search'] ?? '' );
			case 'home':
				return self::decode( (string) get_bloginfo( 'name' ) );
		}
		return $post ? self::decode( (string) get_the_title( $post ) ) : '';
	}

	public static function excerpt( WP_Post $post ): string {
		if ( $post->post_password !== '' ) {
			return '';
		}
		$excerpt = trim( wp_strip_all_tags( (string) $post->post_excerpt ) );
		if ( $excerpt === '' ) {
			$content = strip_shortcodes( (string) $post->post_content );
			$content = preg_replace( '#<(script|style)[^>]*>.*?</\1>#is', ' ', $content );
			$content = wp_strip_all_tags( (string) $content );
			$content = self::decode( $content );
			$content = trim( (string) preg_replace( '/\s+/u', ' ', $content ) );
			if ( function_exists( 'mb_strlen' ) && mb_strlen( $content ) > 160 ) {
				$cut     = mb_substr( $content, 0, 160 );
				$space   = mb_strrpos( $cut, ' ' );
				$content = $space !== false && $space > 100 ? mb_substr( $cut, 0, $space ) : $cut;
			}
			$excerpt = $content;
		}
		return self::decode( $excerpt );
	}

	public static function term_description( WP_Term $term ): string {
		return self::decode( trim( wp_strip_all_tags( (string) $term->description ) ) );
	}

	/**
	 * @param string $format PHP date format; Rank Math writes "Y-m-dTH:i:sP" meaning ISO 8601.
	 */
	public static function post_date( WP_Post $post, string $format, bool $modified ): string {
		if ( $format === '' ) {
			$format = (string) get_option( 'date_format' );
		}
		if ( strpos( $format, 'dTH' ) !== false ) {
			$format = 'c';
		}
		$value = $modified ? get_post_modified_time( $format, false, $post, true ) : get_post_time( $format, false, $post, true );
		return is_string( $value ) ? $value : '';
	}

	public static function archive_date(): string {
		if ( is_day() ) {
			return (string) get_the_date();
		}
		if ( is_month() ) {
			return trim( (string) single_month_title( ' ', false ) );
		}
		if ( is_year() ) {
			return (string) get_query_var( 'year' );
		}
		return '';
	}

	public static function first_term_name( WP_Post $post, string $taxonomy ): string {
		$terms = get_the_terms( $post, $taxonomy );
		if ( ! is_array( $terms ) || $terms === array() ) {
			return '';
		}
		return self::decode( $terms[0]->name );
	}

	public static function term_names( WP_Post $post, string $taxonomy ): string {
		$terms = get_the_terms( $post, $taxonomy );
		if ( ! is_array( $terms ) ) {
			return '';
		}
		return implode( ', ', array_map( static function ( $t ) {
			return self::decode( $t->name );
		}, $terms ) );
	}

	/**
	 * Primary term for the post type's primary taxonomy (Rank Math's rank_math_primary_{tax}).
	 */
	public static function primary_term( WP_Post $post ): ?WP_Term {
		$taxonomy = (string) Neo_Pulse_Wp_Seo_Settings::get( 'pt_' . $post->post_type . '_primary_taxonomy', $post->post_type === 'post' ? 'category' : '' );
		if ( $taxonomy === '' || $taxonomy === 'off' || ! taxonomy_exists( $taxonomy ) ) {
			return null;
		}
		$primary = (int) get_post_meta( $post->ID, 'rank_math_primary_' . $taxonomy, true );
		if ( $primary > 0 ) {
			$term = get_term( $primary, $taxonomy );
			if ( $term instanceof WP_Term ) {
				return $term;
			}
		}
		$terms = get_the_terms( $post, $taxonomy );
		return is_array( $terms ) && isset( $terms[0] ) && $terms[0] instanceof WP_Term ? $terms[0] : null;
	}

	public static function decode( string $text ): string {
		return html_entity_decode( $text, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	}
}
