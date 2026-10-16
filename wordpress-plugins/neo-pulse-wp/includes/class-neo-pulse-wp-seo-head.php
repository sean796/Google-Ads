<?php
/**
 * Front-end SEO tags: title, meta description, robots, canonical, Open Graph, Twitter, JSON-LD.
 *
 * Replaces Rank Math's front-end output once the site switches it on (Neo Pulse → SEO Settings)
 * and no other SEO plugin is active. Reads the same per-post data Rank Math stored.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Seo_Head {

	/** True once this request's head printed a schema graph containing a FAQPage. */
	private static bool $printed_faqpage = false;

	public static function printed_faqpage(): bool {
		return self::$printed_faqpage;
	}

	/** @var array<string, mixed>|null */
	private static $data = null;

	public static function init(): void {
		Neo_Pulse_Wp_Seo_Compare::init();
		add_action( 'deactivated_plugin', array( __CLASS__, 'purge_on_handover' ) );
		add_action( 'activated_plugin', array( __CLASS__, 'purge_on_handover' ) );
		if ( ! Neo_Pulse_Wp_Seo_Settings::output_active() ) {
			return;
		}
		add_filter( 'pre_get_document_title', array( __CLASS__, 'filter_title' ), 15 );
		add_filter( 'wp_robots', array( __CLASS__, 'filter_robots' ), 20 );
		add_action( 'wp', array( __CLASS__, 'remove_duplicate_tags' ), 99 );
		add_action( 'wp_head', array( __CLASS__, 'print_head' ), 1 );
	}

	/**
	 * Rank Math switched off or on while Neo Pulse SEO is enabled: cached pages still carry the
	 * old tags, so clear the page caches (NitroPack, WP Engine).
	 *
	 * @param mixed $plugin Plugin file.
	 */
	public static function purge_on_handover( $plugin ): void {
		if ( ! is_string( $plugin ) || strpos( $plugin, 'seo-by-rank-math' ) === false || ! Neo_Pulse_Wp_Seo_Settings::enabled() ) {
			return;
		}
		if ( class_exists( 'Neo_Pulse_Wp_Cache_Flush', false ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}
	}

	public static function reset(): void {
		self::$data = null;
	}

	/**
	 * Everything Neo Pulse would print for the current request.
	 *
	 * @return array<string, mixed>
	 */
	public static function data(): array {
		if ( null !== self::$data ) {
			return self::$data;
		}
		$ctx                    = self::context();
		$canonical              = self::canonical( $ctx );
		$ctx['url']             = $canonical;
		$title                  = self::title( $ctx );
		$ctx['seo_title']       = $title;
		$description            = self::description( $ctx );
		$ctx['seo_description'] = $description;
		$robots                 = self::robots( $ctx );
		$noindex                = in_array( 'noindex', $robots, true );
		$image                  = self::image( $ctx );
		$social                 = self::social( $ctx, $title, $description, $canonical, $image );

		self::$data = array(
			'kind'        => (string) $ctx['kind'],
			'title'       => $title,
			'description' => $description,
			'robots'      => $robots,
			'canonical'   => $noindex ? '' : $canonical,
			'social'      => $social,
			'schema'      => Neo_Pulse_Wp_Seo_Schema::graph( $ctx, $image ),
		);
		return self::$data;
	}

	/**
	 * @return array<string, mixed>
	 */
	public static function context(): array {
		global $wp_query;
		$ctx = array(
			'kind'      => 'other',
			'post'      => null,
			'term'      => null,
			'user'      => null,
			'post_type' => '',
			'search'    => '',
			'front'     => false,
			'paged'     => max( 1, (int) get_query_var( 'paged' ) ),
			'subpage'   => max( 1, (int) get_query_var( 'page' ) ),
			'max_pages' => $wp_query instanceof WP_Query ? max( 1, (int) $wp_query->max_num_pages ) : 1,
		);

		if ( is_front_page() && is_home() ) {
			$ctx['kind'] = 'home';
		} elseif ( is_home() ) {
			$ctx['kind'] = 'posts_page';
			$page        = get_post( (int) get_option( 'page_for_posts' ) );
			if ( $page instanceof WP_Post ) {
				$ctx['post']      = $page;
				$ctx['post_type'] = 'page';
			}
		} elseif ( is_singular() ) {
			$object = get_queried_object();
			if ( $object instanceof WP_Post ) {
				$ctx['kind']      = 'singular';
				$ctx['post']      = $object;
				$ctx['post_type'] = $object->post_type;
				$ctx['front']     = is_front_page();
				// Split posts (<!--nextpage-->) and paged static front pages use "page".
				$ctx['paged'] = max( (int) $ctx['paged'], (int) $ctx['subpage'] );
			}
		} elseif ( is_category() || is_tag() || is_tax() ) {
			$object = get_queried_object();
			if ( $object instanceof WP_Term ) {
				$ctx['kind'] = 'term';
				$ctx['term'] = $object;
			}
		} elseif ( is_author() ) {
			$object = get_queried_object();
			if ( $object instanceof WP_User ) {
				$ctx['kind'] = 'author';
				$ctx['user'] = $object;
			}
		} elseif ( is_post_type_archive() ) {
			$pt               = get_query_var( 'post_type' );
			$ctx['kind']      = 'pt_archive';
			$ctx['post_type'] = is_array( $pt ) ? (string) reset( $pt ) : (string) $pt;
		} elseif ( is_date() ) {
			$ctx['kind'] = 'date';
		} elseif ( is_search() ) {
			$ctx['kind']   = 'search';
			$ctx['search'] = (string) get_search_query( false );
		} elseif ( is_404() ) {
			$ctx['kind'] = '404';
		}
		return $ctx;
	}

	/**
	 * @param array<string, mixed> $ctx Context.
	 */
	public static function title( array $ctx ): string {
		$S    = 'Neo_Pulse_Wp_Seo_Settings';
		$post = $ctx['post'];
		$tpl  = '';
		switch ( $ctx['kind'] ) {
			case 'home':
				$tpl = (string) $S::get( 'homepage_title' );
				break;
			case 'singular':
			case 'posts_page':
				if ( $post instanceof WP_Post ) {
					$tpl = trim( (string) get_post_meta( $post->ID, 'rank_math_title', true ) );
					if ( $tpl === '' ) {
						$tpl = (string) $S::get( 'pt_' . $post->post_type . '_title' );
					}
				}
				break;
			case 'term':
				$term = $ctx['term'];
				$tpl  = trim( (string) get_term_meta( $term->term_id, 'rank_math_title', true ) );
				if ( $tpl === '' ) {
					$tpl = (string) $S::get( 'tax_' . $term->taxonomy . '_title' );
				}
				break;
			case 'author':
				$tpl = trim( (string) get_user_meta( $ctx['user']->ID, 'rank_math_title', true ) );
				if ( $tpl === '' ) {
					$tpl = (string) $S::get( 'author_archive_title' );
				}
				break;
			case 'pt_archive':
				$tpl = (string) $S::get( 'pt_' . $ctx['post_type'] . '_archive_title' );
				break;
			case 'date':
				$tpl = (string) $S::get( 'date_archive_title' );
				break;
			case 'search':
				$tpl = (string) $S::get( 'search_title' );
				break;
			case '404':
				$tpl = (string) $S::get( '404_title' );
				break;
		}
		$title = Neo_Pulse_Wp_Seo_Vars::replace( $tpl, $ctx );
		if ( $title !== '' && $S::is_on( 'capitalize_titles' ) ) {
			$title = ucwords( $title );
		}
		return $title;
	}

	/**
	 * @param array<string, mixed> $ctx Context.
	 */
	public static function description( array $ctx ): string {
		$S    = 'Neo_Pulse_Wp_Seo_Settings';
		$post = $ctx['post'];
		$tpl  = '';
		switch ( $ctx['kind'] ) {
			case 'home':
				$tpl = (string) $S::get( 'homepage_description' );
				break;
			case 'singular':
			case 'posts_page':
				if ( $post instanceof WP_Post ) {
					$tpl = trim( (string) get_post_meta( $post->ID, 'rank_math_description', true ) );
					if ( $tpl === '' ) {
						$tpl = (string) $S::get( 'pt_' . $post->post_type . '_description' );
					}
				}
				break;
			case 'term':
				$term = $ctx['term'];
				$tpl  = trim( (string) get_term_meta( $term->term_id, 'rank_math_description', true ) );
				if ( $tpl === '' ) {
					$tpl = (string) $S::get( 'tax_' . $term->taxonomy . '_description' );
				}
				break;
			case 'author':
				$tpl = trim( (string) get_user_meta( $ctx['user']->ID, 'rank_math_description', true ) );
				if ( $tpl === '' ) {
					$tpl = (string) $S::get( 'author_archive_description' );
				}
				break;
			case 'pt_archive':
				$tpl = (string) $S::get( 'pt_' . $ctx['post_type'] . '_archive_description' );
				break;
		}
		return Neo_Pulse_Wp_Seo_Vars::replace( $tpl, $ctx, 'text' );
	}

	/**
	 * Robots directives in output order, e.g. follow, index, max-snippet:-1.
	 *
	 * @param array<string, mixed> $ctx Context.
	 * @return array<int, string>
	 */
	public static function robots( array $ctx ): array {
		$S        = 'Neo_Pulse_Wp_Seo_Settings';
		$robots   = array();
		$advanced = null;
		$post     = $ctx['post'];
		$paged    = (int) $ctx['paged'];

		switch ( $ctx['kind'] ) {
			case 'singular':
			case 'posts_page':
				if ( $post instanceof WP_Post ) {
					$pt     = $post->post_type;
					$robots = $S::robots_list( get_post_meta( $post->ID, 'rank_math_robots', true ) );
					$adv    = get_post_meta( $post->ID, 'rank_math_advanced_robots', true );
					if ( is_array( $adv ) && $adv !== array() ) {
						$advanced = $adv;
					}
					if ( $robots === array() && $S::is_on( 'pt_' . $pt . '_custom_robots' ) ) {
						$robots = $S::robots_list( $S::get( 'pt_' . $pt . '_robots', array() ) );
						if ( null === $advanced ) {
							$advanced = $S::get( 'pt_' . $pt . '_advanced_robots', null );
						}
					}
					if ( $post->post_password !== '' && $S::is_on( 'noindex_password_protected' ) ) {
						$robots[] = 'noindex';
					}
				}
				if ( 'singular' === $ctx['kind'] && $paged > 1 && $S::is_on( 'noindex_paginated_pages' ) ) {
					$robots[] = 'noindex';
				}
				if ( 'posts_page' === $ctx['kind'] && $paged > 1 && $S::is_on( 'noindex_archive_subpages' ) ) {
					$robots[] = 'noindex';
				}
				break;
			case 'home':
				if ( $S::is_on( 'homepage_custom_robots' ) ) {
					$robots   = $S::robots_list( $S::get( 'homepage_robots', array() ) );
					$advanced = $S::get( 'homepage_advanced_robots', null );
				}
				if ( $paged > 1 && $S::is_on( 'noindex_archive_subpages' ) ) {
					$robots[] = 'noindex';
				}
				break;
			case 'term':
				$term   = $ctx['term'];
				$robots = $S::robots_list( get_term_meta( $term->term_id, 'rank_math_robots', true ) );
				if ( $robots === array() && $S::is_on( 'tax_' . $term->taxonomy . '_custom_robots' ) ) {
					$robots   = $S::robots_list( $S::get( 'tax_' . $term->taxonomy . '_robots', array() ) );
					$advanced = $S::get( 'tax_' . $term->taxonomy . '_advanced_robots', null );
				}
				if ( $S::is_on( 'noindex_empty_taxonomies' ) && (int) $term->count === 0 ) {
					$robots[] = 'noindex';
				}
				break;
			case 'author':
				$robots = $S::robots_list( get_user_meta( $ctx['user']->ID, 'rank_math_robots', true ) );
				if ( $robots === array() && $S::is_on( 'author_custom_robots' ) ) {
					$robots   = $S::robots_list( $S::get( 'author_robots', array() ) );
					$advanced = $S::get( 'author_advanced_robots', null );
				}
				break;
			case 'pt_archive':
				break;
			case 'date':
				$robots   = $S::robots_list( $S::get( 'date_archive_robots', array() ) );
				$advanced = $S::get( 'date_advanced_robots', null );
				break;
			case 'search':
				if ( $S::is_on( 'noindex_search' ) ) {
					$robots[] = 'noindex';
				}
				break;
			case '404':
				$robots[] = 'noindex';
				break;
		}

		if ( in_array( $ctx['kind'], array( 'term', 'author', 'pt_archive', 'date' ), true ) && $paged > 1 && $S::is_on( 'noindex_archive_subpages' ) ) {
			$robots[] = 'noindex';
		}

		if ( $robots === array() || ! array_intersect( $robots, array( 'index', 'noindex', 'nofollow', 'follow' ) ) ) {
			$robots = array_merge( $S::robots_list( $S::get( 'robots_global', array( 'index' ) ) ), $robots );
		}
		if ( null === $advanced || ! is_array( $advanced ) ) {
			$advanced = $S::get( 'advanced_robots_global', array() );
		}

		$noindex  = in_array( 'noindex', $robots, true );
		$nofollow = in_array( 'nofollow', $robots, true );
		$out      = array( $nofollow ? 'nofollow' : 'follow', $noindex ? 'noindex' : 'index' );
		foreach ( $robots as $item ) {
			if ( ! in_array( $item, array( 'index', 'noindex', 'follow', 'nofollow' ), true ) ) {
				$out[] = $item;
			}
		}
		if ( ! $noindex && is_array( $advanced ) ) {
			foreach ( array( 'max-snippet', 'max-video-preview', 'max-image-preview' ) as $key ) {
				if ( isset( $advanced[ $key ] ) && (string) $advanced[ $key ] !== '' ) {
					$out[] = $key . ':' . (string) $advanced[ $key ];
				}
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * @param array<string, mixed> $ctx Context.
	 */
	public static function canonical( array $ctx ): string {
		$post  = $ctx['post'];
		$paged = (int) $ctx['paged'];
		$base  = '';
		switch ( $ctx['kind'] ) {
			case 'home':
				$base = home_url( '/' );
				break;
			case 'search':
				// Used for og:url and the schema; the canonical tag itself is left out while search
				// results are noindex (as Rank Math does).
				$base = get_search_link( (string) $ctx['search'] );
				break;
			case 'singular':
				if ( ! $post instanceof WP_Post ) {
					return '';
				}
				$custom = trim( (string) get_post_meta( $post->ID, 'rank_math_canonical_url', true ) );
				if ( $custom !== '' ) {
					return $custom;
				}
				if ( ! empty( $ctx['front'] ) ) {
					// Paginated static front page: home/page/N/ (handled below).
					$base = home_url( '/' );
					break;
				}
				$link = get_permalink( $post );
				$link = is_string( $link ) ? $link : '';
				$sub  = (int) ( $ctx['subpage'] ?? 1 );
				if ( $link !== '' && $sub > 1 ) {
					// Split post (<!--nextpage-->): permalink/N/ or ?page=N, as WordPress links it.
					return get_option( 'permalink_structure' )
						? trailingslashit( $link ) . user_trailingslashit( (string) $sub, 'single_paged' )
						: add_query_arg( 'page', $sub, $link );
				}
				$base = $link;
				break;
			case 'posts_page':
				$link = $post instanceof WP_Post ? get_permalink( $post ) : '';
				$base = is_string( $link ) ? $link : '';
				break;
			case 'term':
				$custom = trim( (string) get_term_meta( $ctx['term']->term_id, 'rank_math_canonical_url', true ) );
				if ( $custom !== '' ) {
					return $custom;
				}
				$link = get_term_link( $ctx['term'] );
				$base = is_string( $link ) ? $link : '';
				break;
			case 'author':
				$base = get_author_posts_url( $ctx['user']->ID );
				break;
			case 'pt_archive':
				$link = get_post_type_archive_link( (string) $ctx['post_type'] );
				$base = is_string( $link ) ? $link : '';
				break;
			case 'date':
				if ( is_day() ) {
					$base = get_day_link( (int) get_query_var( 'year' ), (int) get_query_var( 'monthnum' ), (int) get_query_var( 'day' ) );
				} elseif ( is_month() ) {
					$base = get_month_link( (int) get_query_var( 'year' ), (int) get_query_var( 'monthnum' ) );
				} else {
					$base = get_year_link( (int) get_query_var( 'year' ) );
				}
				break;
		}
		if ( $base === '' || $paged < 2 ) {
			return $base;
		}
		if ( get_option( 'permalink_structure' ) ) {
			return user_trailingslashit( trailingslashit( $base ) . 'page/' . $paged );
		}
		return add_query_arg( 'paged', $paged, $base );
	}

	/**
	 * Image for social cards: Facebook image set on the post, featured image, first content image,
	 * then the site default.
	 *
	 * @param array<string, mixed> $ctx Context.
	 * @return array{url: string, width: int, height: int, alt: string, type: string, id: int, default: bool}
	 */
	public static function image( array $ctx ): array {
		$post = $ctx['post'];
		$id   = 0;
		$url  = '';
		if ( $post instanceof WP_Post && 'singular' === $ctx['kind'] ) {
			$id  = (int) get_post_meta( $post->ID, 'rank_math_facebook_image_id', true );
			$url = $id > 0 ? '' : trim( (string) get_post_meta( $post->ID, 'rank_math_facebook_image', true ) );
			if ( $id < 1 && $url === '' ) {
				$id = (int) get_post_thumbnail_id( $post );
			}
			if ( $id < 1 && $url === '' ) {
				$cache = get_post_meta( $post->ID, 'rank_math_og_content_image', true );
				if ( is_array( $cache ) && ! empty( $cache['images'] ) && is_array( $cache['images'] ) ) {
					$id = (int) reset( $cache['images'] );
				}
			}
		} elseif ( 'term' === $ctx['kind'] ) {
			$id  = (int) get_term_meta( $ctx['term']->term_id, 'rank_math_facebook_image_id', true );
			$url = $id > 0 ? '' : trim( (string) get_term_meta( $ctx['term']->term_id, 'rank_math_facebook_image', true ) );
		}
		$default = false;
		if ( $id < 1 && $url === '' ) {
			$id      = (int) Neo_Pulse_Wp_Seo_Settings::get( 'open_graph_image_id', 0 );
			$url     = $id > 0 ? '' : (string) Neo_Pulse_Wp_Seo_Settings::get( 'open_graph_image', '' );
			$default = true;
		}
		return self::image_info( $id, $url, $default );
	}

	/**
	 * @return array{url: string, width: int, height: int, alt: string, type: string, id: int, default: bool}
	 */
	public static function image_info( int $id, string $url = '', bool $default = false ): array {
		$info = array(
			'url'     => $url,
			'width'   => 0,
			'height'  => 0,
			'alt'     => '',
			'type'    => '',
			'id'      => $id,
			'default' => $default,
		);
		if ( $id > 0 ) {
			$src = wp_get_attachment_image_url( $id, 'full' );
			if ( is_string( $src ) && $src !== '' ) {
				$info['url'] = $src;
				$meta        = wp_get_attachment_metadata( $id );
				if ( is_array( $meta ) ) {
					$info['width']  = (int) ( $meta['width'] ?? 0 );
					$info['height'] = (int) ( $meta['height'] ?? 0 );
				}
				$info['alt']  = trim( (string) get_post_meta( $id, '_wp_attachment_image_alt', true ) );
				$info['type'] = (string) get_post_mime_type( $id );
			}
		}
		if ( $info['type'] === '' && $info['url'] !== '' ) {
			$type         = wp_check_filetype( (string) wp_parse_url( $info['url'], PHP_URL_PATH ) );
			$info['type'] = is_string( $type['type'] ?? null ) ? (string) $type['type'] : '';
		}
		return $info;
	}

	/**
	 * Open Graph and Twitter tags as [attribute, key, value] rows.
	 *
	 * @param array<string, mixed> $ctx   Context.
	 * @param array<string, mixed> $image Image info.
	 * @return array<int, array{0: string, 1: string, 2: string}>
	 */
	public static function social( array $ctx, string $title, string $description, string $url, array $image ): array {
		$S        = 'Neo_Pulse_Wp_Seo_Settings';
		$post     = $ctx['post'] instanceof WP_Post ? $ctx['post'] : null;
		$singular = 'singular' === $ctx['kind'] && $post;
		$article  = $singular && empty( $ctx['front'] );
		$rows     = array();

		$og_title = $title;
		$og_desc  = $description;
		if ( $singular ) {
			$fb_title = trim( (string) get_post_meta( $post->ID, 'rank_math_facebook_title', true ) );
			$fb_desc  = trim( (string) get_post_meta( $post->ID, 'rank_math_facebook_description', true ) );
			$og_title = $fb_title !== '' ? Neo_Pulse_Wp_Seo_Vars::replace( $fb_title, $ctx ) : $title;
			$og_desc  = $fb_desc !== '' ? Neo_Pulse_Wp_Seo_Vars::replace( $fb_desc, $ctx, 'text' ) : $description;
		}

		$rows[] = array( 'property', 'og:locale', (string) get_locale() );
		// Rank Math's rule: website for the homepage and blog page, profile for authors, article otherwise.
		if ( ! empty( $ctx['front'] ) || in_array( $ctx['kind'], array( 'home', 'posts_page' ), true ) ) {
			$og_type = 'website';
		} elseif ( 'author' === $ctx['kind'] ) {
			$og_type = 'profile';
		} else {
			$og_type = 'article';
		}
		$rows[] = array( 'property', 'og:type', $og_type );
		$rows[] = array( 'property', 'og:title', $og_title );
		$rows[] = array( 'property', 'og:description', $og_desc );
		$rows[] = array( 'property', 'og:url', $url );
		$rows[] = array( 'property', 'og:site_name', (string) $S::get( 'website_name', Neo_Pulse_Wp_Seo_Vars::decode( (string) get_bloginfo( 'name' ) ) ) );
		$facebook = trim( (string) $S::get( 'social_url_facebook', '' ) );
		if ( $article && $facebook !== '' ) {
			$rows[] = array( 'property', 'article:publisher', $facebook );
		}
		if ( $article && 'post' === $post->post_type ) {
			$tags = get_the_terms( $post, 'post_tag' );
			if ( is_array( $tags ) ) {
				foreach ( $tags as $tag ) {
					$rows[] = array( 'property', 'article:tag', Neo_Pulse_Wp_Seo_Vars::decode( $tag->name ) );
				}
			}
			$section = Neo_Pulse_Wp_Seo_Vars::primary_term( $post );
			if ( $section ) {
				$rows[] = array( 'property', 'article:section', Neo_Pulse_Wp_Seo_Vars::decode( $section->name ) );
			}
		}
		if ( $singular ) {
			$rows[] = array( 'property', 'og:updated_time', (string) get_post_modified_time( 'c', false, $post, true ) );
		}
		if ( $image['url'] !== '' ) {
			$rows[] = array( 'property', 'og:image', $image['url'] );
			if ( strpos( $image['url'], 'https://' ) === 0 ) {
				$rows[] = array( 'property', 'og:image:secure_url', $image['url'] );
			}
			if ( $image['width'] > 0 && $image['height'] > 0 ) {
				$rows[] = array( 'property', 'og:image:width', (string) $image['width'] );
				$rows[] = array( 'property', 'og:image:height', (string) $image['height'] );
			}
			$alt = $image['alt'] !== '' ? $image['alt'] : ( $singular && empty( $image['default'] ) ? Neo_Pulse_Wp_Seo_Vars::decode( (string) get_the_title( $post ) ) : '' );
			if ( $alt !== '' ) {
				$rows[] = array( 'property', 'og:image:alt', $alt );
			}
			if ( $image['type'] !== '' ) {
				$rows[] = array( 'property', 'og:image:type', $image['type'] );
			}
		}
		if ( $singular ) {
			$rows[] = array( 'property', 'article:published_time', (string) get_post_time( 'c', false, $post, true ) );
			$rows[] = array( 'property', 'article:modified_time', (string) get_post_modified_time( 'c', false, $post, true ) );
		}

		$tw_title = $og_title;
		$tw_desc  = $og_desc;
		$tw_image = $image['url'];
		$card     = (string) $S::get( 'twitter_card_type', 'summary_large_image' );
		if ( $singular && 'off' === (string) get_post_meta( $post->ID, 'rank_math_twitter_use_facebook', true ) ) {
			$t = trim( (string) get_post_meta( $post->ID, 'rank_math_twitter_title', true ) );
			$d = trim( (string) get_post_meta( $post->ID, 'rank_math_twitter_description', true ) );
			$i = trim( (string) get_post_meta( $post->ID, 'rank_math_twitter_image', true ) );
			$c = trim( (string) get_post_meta( $post->ID, 'rank_math_twitter_card_type', true ) );
			$tw_title = $t !== '' ? Neo_Pulse_Wp_Seo_Vars::replace( $t, $ctx ) : $tw_title;
			$tw_desc  = $d !== '' ? Neo_Pulse_Wp_Seo_Vars::replace( $d, $ctx, 'text' ) : $tw_desc;
			$tw_image = $i !== '' ? $i : $tw_image;
			$card     = $c !== '' ? $c : $card;
		}
		$rows[] = array( 'name', 'twitter:card', $card );
		$rows[] = array( 'name', 'twitter:title', $tw_title );
		$rows[] = array( 'name', 'twitter:description', $tw_desc );
		$handle = ltrim( trim( (string) $S::get( 'twitter_author_names', '' ) ), '@' );
		if ( $handle !== '' ) {
			$rows[] = array( 'name', 'twitter:site', '@' . $handle );
			$rows[] = array( 'name', 'twitter:creator', '@' . $handle );
		}
		if ( $tw_image !== '' ) {
			$rows[] = array( 'name', 'twitter:image', $tw_image );
		}
		if ( $singular && $S::is_on( 'pt_' . $post->post_type . '_slack_enhanced_sharing' ) ) {
			$rows[] = array( 'name', 'twitter:label1', __( 'Written by', 'neo-pulse-wp' ) );
			$rows[] = array( 'name', 'twitter:data1', Neo_Pulse_Wp_Seo_Vars::decode( (string) get_the_author_meta( 'display_name', (int) $post->post_author ) ) );
			$rows[] = array( 'name', 'twitter:label2', __( 'Time to read', 'neo-pulse-wp' ) );
			$rows[] = array( 'name', 'twitter:data2', self::reading_time( $post ) );
		}

		return array_values(
			array_filter(
				$rows,
				static function ( array $row ): bool {
					return trim( $row[2] ) !== '';
				}
			)
		);
	}

	public static function reading_time( WP_Post $post ): string {
		$text    = wp_strip_all_tags( strip_shortcodes( (string) $post->post_content ) );
		$words   = str_word_count( $text );
		$minutes = (int) ceil( $words / 200 );
		if ( $minutes < 1 ) {
			return __( 'Less than a minute', 'neo-pulse-wp' );
		}
		/* translators: %d: minutes */
		return sprintf( _n( '%d minute', '%d minutes', $minutes, 'neo-pulse-wp' ), $minutes );
	}

	/**
	 * Robots a post ends up with from its own list, else the post type default, else the site
	 * default (the singular rules of robots(), without pagination).
	 *
	 * @param array<int, string> $post_robots Stored rank_math_robots list.
	 * @return array<int, string>
	 */
	public static function effective_post_robots( array $post_robots, string $post_type ): array {
		$S      = 'Neo_Pulse_Wp_Seo_Settings';
		$robots = $post_robots;
		if ( $robots === array() && $S::is_on( 'pt_' . $post_type . '_custom_robots' ) ) {
			$robots = $S::robots_list( $S::get( 'pt_' . $post_type . '_robots', array() ) );
		}
		if ( $robots === array() || ! array_intersect( $robots, array( 'index', 'noindex', 'nofollow', 'follow' ) ) ) {
			$robots = array_merge( $S::robots_list( $S::get( 'robots_global', array( 'index' ) ) ), $robots );
		}
		return array_values( array_unique( $robots ) );
	}

	/**
	 * Same address, ignoring scheme, "www.", case, trailing slash and encoding.
	 */
	private static function same_url( string $a, string $b ): bool {
		$norm = static function ( string $url ): string {
			$url = strtolower( rawurldecode( trim( $url ) ) );
			$url = (string) preg_replace( '#^https?://(www\.)?#', '', $url );
			return untrailingslashit( $url );
		};
		return $norm( $a ) === $norm( $b );
	}

	/**
	 * One answer to "should search engines index this post?" for sitemaps, IndexNow and the editor:
	 * published, no password, not noindex (own setting, post type default or site default), no
	 * canonical pointing somewhere else, and not the source of an active redirect.
	 *
	 * @param mixed $post Post or ID.
	 */
	public static function is_indexable_post( $post ): bool {
		$post = get_post( $post );
		if ( ! $post instanceof WP_Post || 'publish' !== $post->post_status || '' !== (string) $post->post_password ) {
			return false;
		}
		$own = Neo_Pulse_Wp_Seo_Settings::robots_list( get_post_meta( $post->ID, 'rank_math_robots', true ) );
		if ( in_array( 'noindex', self::effective_post_robots( $own, (string) $post->post_type ), true ) ) {
			return false;
		}
		if ( '1' === (string) get_post_meta( $post->ID, '_yoast_wpseo_meta-robots-noindex', true ) ) {
			return false;
		}
		$link = get_permalink( $post );
		if ( ! is_string( $link ) || $link === '' ) {
			return false;
		}
		$canonical = trim( (string) get_post_meta( $post->ID, 'rank_math_canonical_url', true ) );
		if ( $canonical !== '' && ! self::same_url( $canonical, $link ) ) {
			return false;
		}
		if ( class_exists( 'Neo_Pulse_Wp_Redirects', false ) ) {
			$path  = wp_parse_url( $link, PHP_URL_PATH );
			$query = wp_parse_url( $link, PHP_URL_QUERY );
			if ( is_string( $path ) && Neo_Pulse_Wp_Redirects::is_redirected( rawurldecode( $path ), is_string( $query ) ? $query : '' ) ) {
				return false;
			}
		}
		return true;
	}

	/**
	 * Term counterpart: not noindex (own setting, taxonomy default, site default), not an empty
	 * term while empty terms are noindex, and no canonical pointing elsewhere.
	 *
	 * @param mixed $term Term or term ID.
	 */
	public static function is_indexable_term( $term ): bool {
		$term = $term instanceof WP_Term ? $term : get_term( (int) $term );
		if ( ! $term instanceof WP_Term ) {
			return false;
		}
		$S      = 'Neo_Pulse_Wp_Seo_Settings';
		$robots = $S::robots_list( get_term_meta( $term->term_id, 'rank_math_robots', true ) );
		if ( $robots === array() && $S::is_on( 'tax_' . $term->taxonomy . '_custom_robots' ) ) {
			$robots = $S::robots_list( $S::get( 'tax_' . $term->taxonomy . '_robots', array() ) );
		}
		if ( $robots === array() || ! array_intersect( $robots, array( 'index', 'noindex', 'nofollow', 'follow' ) ) ) {
			$robots = array_merge( $S::robots_list( $S::get( 'robots_global', array( 'index' ) ) ), $robots );
		}
		if ( in_array( 'noindex', $robots, true ) ) {
			return false;
		}
		if ( $S::is_on( 'noindex_empty_taxonomies' ) && (int) $term->count === 0 ) {
			return false;
		}
		$link = get_term_link( $term );
		if ( ! is_string( $link ) || $link === '' ) {
			return false;
		}
		$canonical = trim( (string) get_term_meta( $term->term_id, 'rank_math_canonical_url', true ) );
		return $canonical === '' || self::same_url( $canonical, $link );
	}

	/**
	 * @param mixed $title Title from WordPress or an earlier filter.
	 * @return mixed
	 */
	public static function filter_title( $title ) {
		$ours = (string) self::data()['title'];
		return $ours !== '' ? esc_html( $ours ) : $title;
	}

	/**
	 * @param mixed $robots Directives from WordPress.
	 * @return array<string, mixed>
	 */
	public static function filter_robots( $robots ): array {
		if ( ! is_array( $robots ) ) {
			$robots = array();
		}
		if ( '0' === (string) get_option( 'blog_public' ) || ! did_action( 'wp' ) || is_admin() || is_embed() || is_feed() ) {
			return $robots;
		}
		if ( 'other' === self::data()['kind'] ) {
			return $robots;
		}
		$out = array();
		foreach ( self::data()['robots'] as $item ) {
			$parts = explode( ':', (string) $item, 2 );
			$out[ $parts[0] ] = isset( $parts[1] ) ? $parts[1] : true;
		}
		return $out;
	}

	/**
	 * Remove tags Neo Pulse prints itself: core canonical and the Hello Elementor theme description.
	 */
	public static function remove_duplicate_tags(): void {
		foreach ( array( 'rel_canonical', 'hello_elementor_add_description_meta_tag' ) as $callback ) {
			$priority = has_action( 'wp_head', $callback );
			if ( false !== $priority ) {
				remove_action( 'wp_head', $callback, (int) $priority );
			}
		}
	}

	public static function print_head(): void {
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in head_html().
		echo self::head_html( self::data() );
	}

	/**
	 * @param array<string, mixed> $data From data().
	 */
	public static function head_html( array $data ): string {
		$out = "\n<!-- SEO by Neo Pulse -->\n";
		if ( (string) $data['description'] !== '' ) {
			$out .= '<meta name="description" content="' . esc_attr( (string) $data['description'] ) . '"/>' . "\n";
		}
		if ( (string) $data['canonical'] !== '' ) {
			$out .= '<link rel="canonical" href="' . esc_url( (string) $data['canonical'] ) . '" />' . "\n";
		}
		foreach ( $data['social'] as $row ) {
			$out .= '<meta ' . $row[0] . '="' . esc_attr( $row[1] ) . '" content="' . esc_attr( $row[2] ) . '" />' . "\n";
		}
		$json = self::schema_json( $data['schema'] );
		if ( $json !== '' ) {
			$out .= '<script type="application/ld+json" class="neo-pulse-seo-schema">' . $json . '</script>' . "\n";
			if ( false !== strpos( $json, '"FAQPage"' ) ) {
				self::$printed_faqpage = true;
			}
		}
		return $out . "<!-- /SEO by Neo Pulse -->\n";
	}

	/**
	 * @param mixed $graph Schema graph nodes.
	 */
	public static function schema_json( $graph ): string {
		if ( ! is_array( $graph ) || $graph === array() ) {
			return '';
		}
		$json = wp_json_encode(
			array(
				'@context' => 'https://schema.org',
				'@graph'   => array_values( $graph ),
			),
			JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG
		);
		return is_string( $json ) ? str_replace( '</', '<\/', $json ) : '';
	}
}
