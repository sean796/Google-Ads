<?php
/**
 * Read operations for the `neo-pulse/read` WordPress Abilities API dispatcher.
 *
 * Implements:
 * - get-business-details (shared with Neo Tools)
 * - get-settings
 * - list-locations (shared with Neo Tools)
 * - get-page-schema
 * - preview-output
 * - audit
 * - list-history
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

final class Neo_Pulse_Wp_Mcp_Read {

	/**
	 * Catalog of available read operations.
	 *
	 * @return array<string,mixed>
	 */
	public static function catalog(): array {
		return array(
			'dispatcher' => 'neo-pulse/read',
			'version'    => defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '',
			'locked'     => class_exists( 'Neo_Pulse_Wp_Lock', false ) && Neo_Pulse_Wp_Lock::is_locked(),
			'plan'       => class_exists( 'Neo_Pulse_Wp_License', false ) ? Neo_Pulse_Wp_License::plan() : 'pro_ai',
			'operations' => array(
				'get-business-details' => array(
					'description' => 'Read the shared business details (option neo_business_details, shared with Neo Tools), including logo URLs, coordinates, hours, social profiles, location_source, version, and updated_by.',
					'arguments'   => array(),
				),
				'get-settings'         => array(
					'description' => 'Read Neo Pulse SEO settings (title/description templates per content type, robots rules, default schema types, share image, X card, output state, and active SEO plugins) plus version.',
					'arguments'   => array(),
				),
				'list-locations'       => array(
					'description' => 'List every Location post read through location_source (shared with Neo Tools): id, title, URL, kind (showroom/service_area), own schema type, address, phone, map link, coordinates, GBP profile, hours, and main location flag.',
					'arguments'   => array(),
				),
				'get-page-schema'      => array(
					'description' => 'Read a page or post SEO meta, saved rank_math_schema_* entries (including FAQs), inherited content-type schema rules, and version.',
					'arguments'   => array(
						'post_id' => 'integer (required unless url is given)',
						'url'     => 'string (optional front-end URL or path to resolve to post_id)',
					),
				),
				'preview-output'       => array(
					'description' => 'Preview the final JSON-LD graph, title, meta description, robots, canonical, and social tags for a post_id or URL, plus whether Neo Pulse or another SEO plugin prints live output.',
					'arguments'   => array(
						'post_id' => 'integer (optional if url is given)',
						'url'     => 'string (optional if post_id is given; defaults to home URL)',
					),
				),
				'audit'                => array(
					'description' => 'Audit site-wide SEO, business details, locations, and per-page schema for the 8 Elite Shadings problem classes (foreign business names in FAQs, invalid logos, non-showroom main_location, unreadable hours, Article on pages, login-exposed authors, duplicate entities, leftover staging/ACF values).',
					'arguments'   => array(),
				),
				'list-history'         => array(
					'description' => 'List recent Neo Pulse MCP writes with history IDs for undo.',
					'arguments'   => array(
						'limit' => 'integer (optional, default 50)',
					),
				),
			),
		);
	}

	/**
	 * Dispatch a read operation.
	 *
	 * @param string              $operation Operation name.
	 * @param array<string,mixed> $args      Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	public static function dispatch( string $operation, array $args ) {
		if ( '' === $operation ) {
			return self::catalog();
		}

		switch ( $operation ) {
			case 'get-business-details':
				return self::get_business_details();
			case 'get-settings':
				return self::get_settings();
			case 'list-locations':
				return self::list_locations();
			case 'get-page-schema':
				return self::get_page_schema( $args );
			case 'preview-output':
				return self::preview_output( $args );
			case 'audit':
				return Neo_Pulse_Wp_Mcp_Audit::run();
			case 'list-history':
				if ( ! current_user_can( 'manage_options' ) ) {
					return new WP_Error( 'forbidden', __( 'You do not have permission to view MCP write history.', 'neo-pulse-wp' ), array( 'status' => 403 ) );
				}
				$limit = isset( $args['limit'] ) ? absint( $args['limit'] ) : 50;
				return array(
					'history' => Neo_Pulse_Wp_Mcp_History::list_entries( $limit > 0 ? $limit : 50 ),
				);
			default:
				return new WP_Error(
					'invalid_argument',
					sprintf(
						/* translators: %s: operation name */
						__( 'Unknown neo-pulse/read operation "%s". Call with no operation for the catalog.', 'neo-pulse-wp' ),
						$operation
					),
					array( 'status' => 400 )
				);
		}
	}

	/**
	 * `get-business-details`: shared business details + attachment URLs + version.
	 *
	 * @return array<string,mixed>
	 */
	public static function get_business_details(): array {
		$stored  = Neo_Pulse_Wp_Business::stored();
		$details = Neo_Pulse_Wp_Business::get();
		if ( is_array( $stored ) ) {
			foreach ( $stored as $k => $v ) {
				if ( ! array_key_exists( $k, $details ) ) {
					$details[ $k ] = $v;
				}
			}
		}

		$logo_id       = absint( $details['logo'] ?? 0 );
		$logo_light_id = absint( $details['logo_light'] ?? 0 );
		$logo_icon_id  = absint( $details['logo_icon'] ?? 0 );

		$details['exists']                  = Neo_Pulse_Wp_Business::exists();
		$details['logo_url']                = $logo_id > 0 ? (string) wp_get_attachment_url( $logo_id ) : '';
		$details['logo_light_url']          = $logo_light_id > 0 ? (string) wp_get_attachment_url( $logo_light_id ) : '';
		$details['logo_icon_url']           = $logo_icon_id > 0 ? (string) wp_get_attachment_url( $logo_icon_id ) : '';
		$details['effective_main_location'] = Neo_Pulse_Wp_Business::effective_main_location();
		$details['version']                 = Neo_Pulse_Wp_Business::version_hash();

		return $details;
	}

	/**
	 * Deterministic version hash of `neo_pulse_wp_seo` settings.
	 */
	public static function settings_version_hash(): string {
		$raw = Neo_Pulse_Wp_Seo_Settings::raw();
		return substr( hash( 'sha256', (string) wp_json_encode( $raw ) ), 0, 16 );
	}

	/**
	 * `get-settings`: Neo Pulse SEO settings (excluding business details and any secrets).
	 *
	 * @return array<string,mixed>
	 */
	public static function get_settings(): array {
		$S = 'Neo_Pulse_Wp_Seo_Settings';
		$g = static function ( string $key, $default = '' ): string {
			$val = Neo_Pulse_Wp_Seo_Settings::get( $key, $default );
			return is_scalar( $val ) ? (string) $val : '';
		};

		$post_types = array();
		foreach ( $S::post_types() as $type => $label ) {
			$robots_custom = $S::is_on( 'pt_' . $type . '_custom_robots' );
			$robots_list   = $S::robots_list( $S::get( 'pt_' . $type . '_robots', array() ) );
			$post_types[ $type ] = array(
				'label'                 => $label,
				'title'                 => $g( 'pt_' . $type . '_title' ),
				'description'           => $g( 'pt_' . $type . '_description' ),
				'custom_robots'         => $robots_custom,
				'robots'                => $robots_custom ? ( in_array( 'noindex', $robots_list, true ) ? 'noindex' : 'index' ) : 'default',
				'robots_directives'     => $robots_list,
				'default_rich_snippet'  => $g( 'pt_' . $type . '_default_rich_snippet', 'off' ),
				'default_article_type'  => $g( 'pt_' . $type . '_default_article_type', 'Article' ),
			);
		}

		$taxonomies = array();
		foreach ( $S::taxonomies() as $tax => $label ) {
			$robots_custom = $S::is_on( 'tax_' . $tax . '_custom_robots' );
			$robots_list   = $S::robots_list( $S::get( 'tax_' . $tax . '_robots', array() ) );
			$taxonomies[ $tax ] = array(
				'label'             => $label,
				'title'             => $g( 'tax_' . $tax . '_title' ),
				'description'       => $g( 'tax_' . $tax . '_description' ),
				'custom_robots'     => $robots_custom,
				'robots'            => $robots_custom ? ( in_array( 'noindex', $robots_list, true ) ? 'noindex' : 'index' ) : 'default',
				'robots_directives' => $robots_list,
			);
		}

		$author_custom = $S::is_on( 'author_custom_robots' );
		$author_robots = $S::robots_list( $S::get( 'author_robots', array() ) );

		return array(
			'enabled'          => $S::enabled(),
			'output_active'    => $S::output_active(),
			'other_seo_plugin' => $S::other_seo_plugin(),
			'titles'           => array(
				'title_separator'      => $g( 'title_separator', '-' ),
				'capitalize_titles'    => $S::is_on( 'capitalize_titles' ),
				'homepage_title'       => $g( 'homepage_title' ),
				'homepage_description' => $g( 'homepage_description' ),
				'author_archive_title' => $g( 'author_archive_title' ),
				'author_robots'        => $author_custom ? ( in_array( 'noindex', $author_robots, true ) ? 'noindex' : 'index' ) : 'default',
				'date_archive_title'   => $g( 'date_archive_title' ),
				'search_title'         => $g( 'search_title' ),
				'404_title'            => $g( '404_title' ),
				'website_name'         => $g( 'website_name' ),
			),
			'post_types'       => $post_types,
			'taxonomies'       => $taxonomies,
			'indexing'         => array(
				'noindex_search'             => $S::is_on( 'noindex_search' ),
				'noindex_empty_taxonomies'   => $S::is_on( 'noindex_empty_taxonomies' ),
				'noindex_archive_subpages'   => $S::is_on( 'noindex_archive_subpages' ),
				'noindex_paginated_pages'    => $S::is_on( 'noindex_paginated_pages' ),
				'noindex_password_protected' => $S::is_on( 'noindex_password_protected' ),
			),
			'behaviour'        => array(
				'new_window_external_links' => $S::on( $S::gen( 'new_window_external_links', 'off' ) ),
				'nofollow_external_links'   => $S::on( $S::gen( 'nofollow_external_links', 'off' ) ),
				'disable_date_archives'     => $S::is_on( 'disable_date_archives' ),
				'disable_author_archives'   => $S::is_on( 'disable_author_archives' ),
				'neo_pulse_404_monitor'     => $S::on( $S::get( 'neo_pulse_404_monitor', 'on' ) ),
			),
			'social'           => array(
				'open_graph_image'     => $g( 'open_graph_image' ),
				'open_graph_image_id'  => absint( $S::get( 'open_graph_image_id', 0 ) ),
				'twitter_card_type'    => $g( 'twitter_card_type', 'summary_large_image' ),
				'twitter_author_names' => $g( 'twitter_author_names' ),
			),
			'version'          => self::settings_version_hash(),
		);
	}

	/**
	 * `list-locations`: every Location post read through `location_source`.
	 *
	 * @return array<string,mixed>
	 */
	public static function list_locations(): array {
		$src      = Neo_Pulse_Wp_Business::location_source();
		$main_id  = Neo_Pulse_Wp_Business::effective_main_location();
		$stored_m = (int) ( Neo_Pulse_Wp_Business::get()['main_location'] ?? 0 );
		$country  = (string) ( Neo_Pulse_Wp_Business::get()['address']['country'] ?? '' );
		$hour_map = Neo_Pulse_Wp_Business::location_hour_fields();
		$items    = array();

		foreach ( Neo_Pulse_Wp_Business::location_posts() as $post ) {
			$id       = (int) $post->ID;
			$raw_kind = Neo_Pulse_Wp_Business::location_value( $id, 'kind' );
			$addr_raw = Neo_Pulse_Wp_Business::location_value( $id, 'address' );
			$is_show  = Neo_Pulse_Wp_Business::is_showroom( $id );
			$hours    = array();
			foreach ( $hour_map as $day => $field ) {
				$raw_h         = get_post_meta( $id, $field, true );
				$text_h        = is_scalar( $raw_h ) ? trim( wp_strip_all_tags( (string) $raw_h ) ) : '';
				$hours[ $day ] = array(
					'raw'    => $text_h,
					'parsed' => Neo_Pulse_Wp_Seo_Locations::parse_hours( $text_h ),
				);
			}
			$items[] = array(
				'id'               => $id,
				'title'            => get_the_title( $post ),
				'url'              => (string) get_permalink( $post ),
				'kind'             => $is_show ? 'showroom' : 'service_area',
				'raw_kind'         => $raw_kind,
				'type'             => Neo_Pulse_Wp_Business::location_type( $id ),
				'address_raw'      => $addr_raw,
				'address'          => Neo_Pulse_Wp_Business::address_from_line( $addr_raw, $country ),
				'phone'            => Neo_Pulse_Wp_Business::location_value( $id, 'phone' ),
				'tel'              => Neo_Pulse_Wp_Business::location_value( $id, 'tel' ),
				'map_url'          => Neo_Pulse_Wp_Business::location_value( $id, 'map' ),
				'hours_line'       => Neo_Pulse_Wp_Business::location_value( $id, 'hours_line' ),
				'geo'              => Neo_Pulse_Wp_Business::location_geo( $id ),
				'profile'          => Neo_Pulse_Wp_Business::location_profile( $id ),
				'hours'            => $hours,
				'is_main_location' => $id === $main_id && $main_id > 0,
			);
		}

		return array(
			'location_source'         => $src,
			'stored_main_location'    => $stored_m,
			'effective_main_location' => $main_id,
			'count'                   => count( $items ),
			'locations'               => $items,
		);
	}

	/**
	 * Deterministic version hash of a post's SEO & schema meta.
	 */
	public static function page_version_hash( int $post_id ): string {
		$all = get_post_meta( $post_id );
		$seo = array();
		if ( is_array( $all ) ) {
			ksort( $all );
			foreach ( $all as $k => $v ) {
				if ( 0 === strpos( (string) $k, 'rank_math_' ) || in_array( (string) $k, array( 'faq', 'seo_faq', 'date_modifier', 'seo_date_modifier' ), true ) ) {
					$seo[ (string) $k ] = $v;
				}
			}
		}
		return substr( hash( 'sha256', (string) wp_json_encode( $seo ) ), 0, 16 );
	}

	/**
	 * Resolve a post from `post_id` or `url`.
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return WP_Post|WP_Error
	 */
	public static function resolve_post( array $args ) {
		$post_id = isset( $args['post_id'] ) ? absint( $args['post_id'] ) : 0;
		if ( $post_id < 1 && ! empty( $args['url'] ) && is_string( $args['url'] ) ) {
			$url     = trim( $args['url'] );
			$full    = 0 === strpos( $url, 'http' ) ? $url : home_url( '/' . ltrim( $url, '/' ) );
			$post_id = (int) url_to_postid( $full );
			if ( $post_id < 1 && ( untrailingslashit( $full ) === untrailingslashit( home_url() ) || '/' === $url ) ) {
				$post_id = (int) get_option( 'page_on_front' );
			}
		}
		if ( $post_id < 1 ) {
			return new WP_Error( 'invalid_argument', __( 'Provide a valid post_id or url.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'not_found', __( 'Post not found.', 'neo-pulse-wp' ), array( 'status' => 404 ) );
		}
		return $post;
	}

	/**
	 * `get-page-schema`: SEO meta, saved `rank_math_schema_*` entries, FAQs, and version.
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	public static function get_page_schema( array $args ) {
		$post = self::resolve_post( $args );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		if ( ! current_user_can( 'edit_post', $post->ID ) ) {
			return new WP_Error( 'forbidden', __( 'You do not have permission to read this post.', 'neo-pulse-wp' ), array( 'status' => 403 ) );
		}

		$S      = 'Neo_Pulse_Wp_Seo_Settings';
		$pt     = (string) $post->post_type;
		$all    = get_post_meta( $post->ID );
		$saved  = array();
		if ( is_array( $all ) ) {
			foreach ( $all as $key => $values ) {
				if ( 0 !== strpos( (string) $key, 'rank_math_schema_' ) || ! is_array( $values ) ) {
					continue;
				}
				foreach ( $values as $val ) {
					$saved[ (string) $key ][] = maybe_unserialize( $val );
				}
			}
		}

		$post_snippet = (string) get_post_meta( $post->ID, 'rank_math_rich_snippet', true );
		$pt_snippet   = (string) $S::get( 'pt_' . $pt . '_default_rich_snippet', 'off' );
		$pt_article   = (string) $S::get( 'pt_' . $pt . '_default_article_type', 'Article' );
		$robots       = $S::robots_list( get_post_meta( $post->ID, 'rank_math_robots', true ) );

		return array(
			'post_id'            => (int) $post->ID,
			'post_type'          => $pt,
			'title'              => get_the_title( $post ),
			'url'                => (string) get_permalink( $post ),
			'output_active'      => $S::output_active(),
			'other_seo_plugin'   => $S::other_seo_plugin(),
			'meta'               => array(
				'rank_math_title'         => (string) get_post_meta( $post->ID, 'rank_math_title', true ),
				'rank_math_description'   => (string) get_post_meta( $post->ID, 'rank_math_description', true ),
				'rank_math_focus_keyword' => (string) get_post_meta( $post->ID, 'rank_math_focus_keyword', true ),
				'rank_math_canonical_url' => (string) get_post_meta( $post->ID, 'rank_math_canonical_url', true ),
				'rank_math_robots'        => $robots,
				'effective_robots'        => Neo_Pulse_Wp_Seo_Head::effective_post_robots( $robots, $pt ),
				'rank_math_rich_snippet'  => $post_snippet,
			),
			'type_default_rules' => array(
				'default_rich_snippet' => $pt_snippet,
				'default_article_type' => $pt_article,
				'effective_schema'     => 'off' === $post_snippet ? 'off' : ( 'article' === $pt_snippet ? $pt_article : 'off' ),
			),
			'saved_schemas'      => $saved,
			'extracted_faqs'     => class_exists( 'Neo_Pulse_Wp_Seo_Faq', false ) ? Neo_Pulse_Wp_Seo_Faq::for_post( (int) $post->ID ) : array(),
			'version'            => self::page_version_hash( (int) $post->ID ),
		);
	}

	/**
	 * `preview-output`: exact JSON-LD graph and head tags for a post_id or URL.
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	public static function preview_output( array $args ) {
		$post = null;
		if ( ! empty( $args['post_id'] ) || ! empty( $args['url'] ) ) {
			$resolved = self::resolve_post( $args );
			if ( is_wp_error( $resolved ) ) {
				if ( empty( $args['url'] ) ) {
					return $resolved;
				}
			} else {
				$post = $resolved;
			}
		} elseif ( (int) get_option( 'page_on_front' ) > 0 ) {
			$front = get_post( (int) get_option( 'page_on_front' ) );
			if ( $front instanceof WP_Post ) {
				$post = $front;
			}
		}

		$front_id = (int) get_option( 'page_on_front' );
		$ctx      = array(
			'kind'      => $post instanceof WP_Post ? 'singular' : 'home',
			'post'      => $post,
			'term'      => null,
			'user'      => null,
			'post_type' => $post instanceof WP_Post ? $post->post_type : '',
			'search'    => '',
			'front'     => $post instanceof WP_Post && $front_id > 0 && (int) $post->ID === $front_id,
			'paged'     => 1,
			'subpage'   => 1,
			'max_pages' => 1,
		);

		$canonical              = Neo_Pulse_Wp_Seo_Head::canonical( $ctx );
		$ctx['url']             = $canonical;
		$title                  = Neo_Pulse_Wp_Seo_Head::title( $ctx );
		$ctx['seo_title']       = $title;
		$description            = Neo_Pulse_Wp_Seo_Head::description( $ctx );
		$ctx['seo_description'] = $description;
		$robots                 = Neo_Pulse_Wp_Seo_Head::robots( $ctx );
		$noindex                = in_array( 'noindex', $robots, true );
		$image                  = Neo_Pulse_Wp_Seo_Head::image( $ctx );
		$social                 = Neo_Pulse_Wp_Seo_Head::social( $ctx, $title, $description, $canonical, $image );
		$graph                  = Neo_Pulse_Wp_Seo_Schema::graph( $ctx, $image );

		$other         = Neo_Pulse_Wp_Seo_Settings::other_seo_plugin();
		$output_active = Neo_Pulse_Wp_Seo_Settings::output_active();

		return array(
			'post_id'          => $post instanceof WP_Post ? (int) $post->ID : 0,
			'url'              => $canonical,
			'producer'         => $output_active ? 'neo-pulse' : ( '' !== $other ? $other : 'none' ),
			'output_active'    => $output_active,
			'other_seo_plugin' => $other,
			'title'            => $title,
			'description'      => $description,
			'robots'           => $robots,
			'canonical'        => $noindex ? '' : $canonical,
			'social'           => $social,
			'json_ld'          => array(
				'@context' => 'https://schema.org',
				'@graph'   => array_values( $graph ),
			),
		);
	}
}
