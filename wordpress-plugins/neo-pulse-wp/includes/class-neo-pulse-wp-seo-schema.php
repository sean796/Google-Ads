<?php
/**
 * JSON-LD graph: organisation or person, website, web page, breadcrumbs, author, the page's rich
 * snippet and FAQs from Elementor accordions marked for FAQ schema.
 *
 * Schema stored on posts by Rank Math (rank_math_schema_* meta) is output as-is, with its
 * template variables filled in. Posts without stored schema get the post type's default
 * (Article / BlogPosting) from the settings.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Seo_Schema {

	const DAYS = array(
		'Monday'    => 'Mo',
		'Tuesday'   => 'Tu',
		'Wednesday' => 'We',
		'Thursday'  => 'Th',
		'Friday'    => 'Fr',
		'Saturday'  => 'Sa',
		'Sunday'    => 'Su',
	);

	/**
	 * @param array<string, mixed> $ctx   Page context (with url, seo_title, seo_description).
	 * @param array<string, mixed> $image Social image info.
	 * @return array<int, array<string, mixed>>
	 */
	public static function graph( array $ctx, array $image ): array {
		$S       = 'Neo_Pulse_Wp_Seo_Settings';
		$home    = home_url( '/' );
		$lang    = (string) get_bloginfo( 'language' );
		$site    = (string) $S::get( 'url', '' );
		$site    = $site !== '' ? $site : home_url();
		$person  = 'person' === (string) $S::get( 'knowledgegraph_type', 'company' );
		$org_id  = $home . '#' . ( $person ? 'person' : 'organization' );
		$nodes   = array();
		$address = self::address();

		if ( $address !== array() && ! $person ) {
			$nodes[] = array(
				'@type'   => 'Place',
				'@id'     => $home . '#place',
				'address' => $address,
			);
		}

		$nodes[] = self::organization( $org_id, $site, $person, $address, $lang );

		$website = array(
			'@type'         => 'WebSite',
			'@id'           => $home . '#website',
			'url'           => $site,
			'name'          => (string) $S::get( 'website_name', Neo_Pulse_Wp_Seo_Vars::decode( (string) get_bloginfo( 'name' ) ) ),
			'alternateName' => (string) $S::get( 'website_alternate_name', '' ),
			'publisher'     => array( '@id' => $org_id ),
			'inLanguage'    => $lang,
		);
		if ( 'home' === $ctx['kind'] || ! empty( $ctx['front'] ) ) {
			$website['potentialAction'] = array(
				'@type'       => 'SearchAction',
				'target'      => home_url( '/?s={search_term_string}' ),
				'query-input' => 'required name=search_term_string',
			);
		}
		$nodes[] = $website;

		$url = (string) ( $ctx['url'] ?? '' );
		if ( $url === '' || in_array( $ctx['kind'], array( '404', 'other' ), true ) ) {
			return self::strip_empty( $nodes );
		}

		$post     = $ctx['post'] instanceof WP_Post ? $ctx['post'] : null;
		$singular = 'singular' === $ctx['kind'] && $post;
		$page_id  = $url . '#webpage';

		$primary_image = $singular ? self::primary_image( $post, $image ) : array();
		if ( $primary_image !== array() ) {
			$nodes[] = array(
				'@type'      => 'ImageObject',
				'@id'        => $primary_image['url'],
				'url'        => $primary_image['url'],
				'width'      => $primary_image['width'] > 0 ? (string) $primary_image['width'] : '',
				'height'     => $primary_image['height'] > 0 ? (string) $primary_image['height'] : '',
				'caption'    => $primary_image['alt'],
				'inLanguage' => $lang,
			);
		}

		$types = array(
			'term'       => 'CollectionPage',
			'pt_archive' => 'CollectionPage',
			'date'       => 'CollectionPage',
			'posts_page' => 'CollectionPage',
			'home'       => 'CollectionPage',
			'author'     => 'ProfilePage',
			'search'     => 'SearchResultsPage',
		);
		$webpage = array(
			'@type'      => $types[ $ctx['kind'] ] ?? 'WebPage',
			'@id'        => $page_id,
			'url'        => $url,
			'name'       => (string) ( $ctx['seo_title'] ?? '' ),
			'isPartOf'   => array( '@id' => $home . '#website' ),
			'inLanguage' => $lang,
		);
		if ( 'home' === $ctx['kind'] ) {
			$webpage['about'] = array( '@id' => $org_id );
		}
		if ( $singular ) {
			$webpage['datePublished'] = (string) get_post_time( 'c', false, $post, true );
			$webpage['dateModified']  = (string) get_post_modified_time( 'c', false, $post, true );
			// The SEO team's "last updated" field (the child themes printed it as a separate block).
			$set_date = class_exists( 'Neo_Pulse_Wp_Seo_Faq', false ) ? Neo_Pulse_Wp_Seo_Faq::date_modified( (int) $post->ID ) : '';
			if ( $set_date !== '' ) {
				$webpage['dateModified'] = $set_date;
			}
			if ( ! empty( $ctx['front'] ) ) {
				$webpage['about'] = array( '@id' => $org_id );
			}
			if ( $primary_image !== array() ) {
				$webpage['primaryImageOfPage'] = array( '@id' => $primary_image['url'] );
			}
		}
		// Breadcrumbs (when switched on in Rank Math's settings) and FAQs (ACF fields or accordions) follow the page.
		$extras = array();
		if ( class_exists( 'Neo_Pulse_Wp_Seo_Breadcrumbs', false ) && Neo_Pulse_Wp_Seo_Breadcrumbs::enabled() ) {
			$crumbs = Neo_Pulse_Wp_Seo_Breadcrumbs::schema_node( Neo_Pulse_Wp_Seo_Breadcrumbs::trail( $ctx ), $url );
			if ( $crumbs !== array() ) {
				$webpage['breadcrumb'] = array( '@id' => $crumbs['@id'] );
				$extras[]              = $crumbs;
			}
		}
		if ( $singular && class_exists( 'Neo_Pulse_Wp_Seo_Faq', false ) ) {
			$faq = Neo_Pulse_Wp_Seo_Faq::schema_node( Neo_Pulse_Wp_Seo_Faq::for_post( (int) $post->ID ), $url );
			if ( $faq !== array() ) {
				$extras[] = $faq;
			}
		}
		// Location pages: a showroom gets its own LocalBusiness, a service area adds its town to the
		// business's areaServed.
		if ( $singular && ! $person && class_exists( 'Neo_Pulse_Wp_Seo_Locations', false ) && Neo_Pulse_Wp_Seo_Locations::applies( $post ) ) {
			foreach ( $nodes as $i => $node ) {
				if ( is_array( $node ) && ( $node['@id'] ?? '' ) === $org_id ) {
					$location = Neo_Pulse_Wp_Seo_Locations::build( $post, $url, $node );
					if ( $location['node'] !== array() ) {
						$extras[]         = $location['node'];
						$webpage['about'] = array( '@id' => $location['node']['@id'] );
					}
					if ( $location['area'] !== array() ) {
						$nodes[ $i ]['areaServed'] = $location['area'];
						$webpage['about']          = array( '@id' => $org_id );
					}
					break;
				}
			}
		}
		$nodes[] = $webpage;

		if ( ! $singular ) {
			return self::strip_empty( array_merge( $nodes, $extras ) );
		}

		$snippets = self::stored_snippets( $post, $ctx );
		// Videos Neo Pulse found on its own sit next to the post's default Article, not in place of it.
		if ( $snippets === array() || self::stored_only_neo_pulse_videos( $post ) ) {
			$default = self::default_snippet( $post, $ctx );
			if ( $default !== array() ) {
				array_unshift( $snippets, $default );
			}
		}
		if ( $snippets === array() ) {
			return self::strip_empty( array_merge( $nodes, $extras ) );
		}

		$author_id = (int) $post->post_author;
		$author    = self::author( $author_id, $org_id, $person );
		if ( $author !== array() ) {
			$nodes[] = $author;
		}

		$n = 0;
		foreach ( $snippets as $snippet ) {
			$is_primary = 0 === $n;
			++$n;
			if ( isset( $snippet['author'] ) && is_array( $snippet['author'] ) ) {
				if ( $author !== array() ) {
					$snippet['author'] = array(
						'@id'  => $author['@id'],
						'name' => $author['name'],
					);
				} elseif ( empty( $snippet['author']['name'] ) ) {
					unset( $snippet['author'] );
				}
			}
			if ( self::is_article( $snippet ) ) {
				$snippet['publisher'] = array( '@id' => $org_id );
				if ( ! isset( $snippet['author'] ) && $author !== array() ) {
					$snippet['author'] = array(
						'@id'  => $author['@id'],
						'name' => $author['name'],
					);
				}
			}
			if ( isset( $snippet['image'] ) && is_array( $snippet['image'] ) && empty( $snippet['image']['url'] ) ) {
				unset( $snippet['image'] );
			}
			if ( ! isset( $snippet['image'] ) && $primary_image !== array() ) {
				$snippet['image'] = array( '@id' => $primary_image['url'] );
			}
			$snippet['@id']        = $is_primary ? $url . '#richSnippet' : $url . '#schema-' . $n;
			$snippet['isPartOf']   = array( '@id' => $page_id );
			$snippet['inLanguage'] = $lang;
			if ( $is_primary ) {
				$snippet['mainEntityOfPage'] = array( '@id' => $page_id );
			}
			$nodes[] = $snippet;
		}

		return self::strip_empty( array_merge( $nodes, $extras ) );
	}

	/**
	 * @return array<string, string>
	 */
	public static function address(): array {
		$raw = Neo_Pulse_Wp_Seo_Settings::get( 'local_address', array() );
		if ( ! is_array( $raw ) ) {
			return array();
		}
		$out = array();
		foreach ( array( 'streetAddress', 'addressLocality', 'addressRegion', 'postalCode', 'addressCountry' ) as $key ) {
			if ( isset( $raw[ $key ] ) && trim( (string) $raw[ $key ] ) !== '' ) {
				$out[ $key ] = trim( (string) $raw[ $key ] );
			}
		}
		return $out === array() ? array() : array_merge( array( '@type' => 'PostalAddress' ), $out );
	}

	/**
	 * @param array<string, string> $address PostalAddress.
	 * @return array<string, mixed>
	 */
	private static function organization( string $id, string $site, bool $person, array $address, string $lang ): array {
		$S    = 'Neo_Pulse_Wp_Seo_Settings';
		$home = home_url( '/' );
		$name = (string) $S::get( 'knowledgegraph_name', Neo_Pulse_Wp_Seo_Vars::decode( (string) get_bloginfo( 'name' ) ) );
		$type = 'Person';
		if ( ! $person ) {
			$business = trim( (string) $S::get( 'local_business_type', '' ) );
			$type     = ( $business !== '' && $business !== 'Organization' && $business !== 'off' ) ? array( $business, 'Organization' ) : 'Organization';
		}
		$node = array(
			'@type'   => $type,
			'@id'     => $id,
			'name'    => $name,
			'url'     => $site,
			'sameAs'  => self::same_as(),
			'email'   => (string) $S::get( 'email', '' ),
			'address' => $address,
		);
		if ( ! $person ) {
			$node['legalName'] = (string) $S::get( 'legal_name', '' );
		}

		$logo_id  = (int) $S::get( 'knowledgegraph_logo_id', 0 );
		$logo_url = (string) $S::get( 'knowledgegraph_logo', '' );
		if ( $logo_id > 0 || $logo_url !== '' ) {
			$logo = Neo_Pulse_Wp_Seo_Head::image_info( $logo_id, $logo_url );
			if ( $logo_url !== '' && $logo_id > 0 ) {
				$logo['url'] = $logo_url;
			}
			if ( $logo['url'] !== '' ) {
				$node[ $person ? 'image' : 'logo' ] = array(
					'@type'      => 'ImageObject',
					'@id'        => $home . '#logo',
					'url'        => $logo['url'],
					'contentUrl' => $logo['url'],
					'caption'    => $name,
					'inLanguage' => $lang,
					'width'      => $logo['width'] > 0 ? (string) $logo['width'] : '',
					'height'     => $logo['height'] > 0 ? (string) $logo['height'] : '',
				);
			}
		}

		if ( ! $person ) {
			$phones = $S::get( 'phone_numbers', array() );
			if ( is_array( $phones ) ) {
				$points = array();
				foreach ( $phones as $phone ) {
					if ( is_array( $phone ) && ! empty( $phone['number'] ) ) {
						$points[] = array(
							'@type'       => 'ContactPoint',
							'telephone'   => (string) $phone['number'],
							'contactType' => (string) ( $phone['type'] ?? 'customer support' ),
						);
					}
				}
				$node['contactPoint'] = $points;
			}
			if ( is_array( $type ) ) {
				$node['priceRange']   = (string) $S::get( 'price_range', '' );
				$node['openingHours'] = self::opening_hours();
				$node['geo']          = Neo_Pulse_Wp_Business::geo_schema(
					array(
						'lat' => (string) $S::get( 'geo_lat', '' ),
						'lng' => (string) $S::get( 'geo_lng', '' ),
					)
				);
				if ( Neo_Pulse_Wp_Business::exists() ) {
					$map = Neo_Pulse_Wp_Business::contact()['map_url'];
					if ( $map !== '' && filter_var( $map, FILTER_VALIDATE_URL ) ) {
						$node['hasMap'] = esc_url_raw( $map );
					}
				}
			}
			// Several locations: each showroom, tied to the location page's own node by @id.
			$departments = self::departments( $type, $name, $address );
			if ( $departments !== array() ) {
				$node['department'] = $departments;
			}
			$extra = $S::get( 'additional_info', array() );
			if ( is_array( $extra ) ) {
				foreach ( $extra as $item ) {
					if ( is_array( $item ) && ! empty( $item['type'] ) && isset( $item['value'] ) && trim( (string) $item['value'] ) !== '' ) {
						$node[ (string) $item['type'] ] = trim( (string) $item['value'] );
					}
				}
			}
			if ( $address !== array() ) {
				$node['location'] = array( '@id' => $home . '#place' );
			}
			if ( isset( $node['logo'] ) ) {
				$node['image'] = array( '@id' => $home . '#logo' );
			}
		}
		return $node;
	}

	/**
	 * @return array<int, string>
	 */
	public static function same_as(): array {
		$S   = 'Neo_Pulse_Wp_Seo_Settings';
		$out = array();
		$fb  = trim( (string) $S::get( 'social_url_facebook', '' ) );
		if ( $fb !== '' ) {
			$out[] = $fb;
		}
		// With shared business details the X profile is one of the social profiles already.
		$tw = Neo_Pulse_Wp_Business::exists() ? '' : ltrim( trim( (string) $S::get( 'twitter_author_names', '' ) ), '@' );
		if ( $tw !== '' ) {
			$out[] = 'https://twitter.com/' . $tw;
		}
		foreach ( preg_split( '/\r\n|\r|\n/', (string) $S::get( 'social_additional_profiles', '' ) ) as $line ) {
			$line = trim( (string) $line );
			if ( $line !== '' ) {
				$out[] = $line;
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * Showrooms of a business with several locations (shared business details), as LocalBusiness
	 * nodes with the same @id as each location page's own node.
	 *
	 * @param string|array<int,string> $type    Main entity type.
	 * @param array<string, string>    $address Main PostalAddress (for the country).
	 * @return array<int, array<string, mixed>>
	 */
	private static function departments( $type, string $name, array $address ): array {
		if ( ! class_exists( 'Neo_Pulse_Wp_Business' ) || ! Neo_Pulse_Wp_Business::several() ) {
			return array();
		}
		$local = is_array( $type ) ? (string) reset( $type ) : (string) $type;
		$local = in_array( $local, array( '', 'Organization', 'Person' ), true ) ? 'LocalBusiness' : $local;
		$out   = array();
		foreach ( Neo_Pulse_Wp_Business::showrooms() as $post ) {
			$url   = (string) get_permalink( $post );
			$title = trim( wp_strip_all_tags( get_the_title( $post ) ) );
			$own   = Neo_Pulse_Wp_Business::location_type( $post->ID );
			$prof  = Neo_Pulse_Wp_Business::location_profile( $post->ID );
			$out[] = array(
				'@type'     => $own !== '' ? $own : $local,
				'geo'       => Neo_Pulse_Wp_Business::geo_schema( Neo_Pulse_Wp_Business::location_geo( $post->ID ) ),
				'sameAs'    => $prof !== '' ? array( $prof ) : array(),
				'@id'       => $url . '#localbusiness',
				'name'      => trim( $name . ( $name !== '' && $title !== '' ? ' - ' : '' ) . $title ),
				'url'       => $url,
				'address'   => Neo_Pulse_Wp_Seo_Locations::parse_address( Neo_Pulse_Wp_Business::location_value( $post->ID, 'address' ), (string) ( $address['addressCountry'] ?? '' ) ),
				'telephone' => Neo_Pulse_Wp_Business::location_value( $post->ID, 'phone' ),
			);
		}
		return $out;
	}

	/**
	 * Group days with the same hours: "Mo,Tu,We 09:00-17:00".
	 *
	 * @return array<int, string>
	 */
	public static function opening_hours(): array {
		$hours = Neo_Pulse_Wp_Seo_Settings::get( 'opening_hours', array() );
		if ( ! is_array( $hours ) ) {
			return array();
		}
		$by_time = array();
		foreach ( $hours as $row ) {
			// Closed days are left out (schema.org has no "Closed" value; a day not listed is closed).
			if ( ! is_array( $row ) || empty( $row['day'] ) || ! preg_match( '/^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/', trim( (string) ( $row['time'] ?? '' ) ) ) ) {
				continue;
			}
			$day                         = self::DAYS[ (string) $row['day'] ] ?? (string) $row['day'];
			$by_time[ (string) $row['time'] ][] = $day;
		}
		$out = array();
		foreach ( $by_time as $time => $days ) {
			$out[] = implode( ',', $days ) . ' ' . $time;
		}
		return $out;
	}

	/**
	 * @param array<string, mixed> $image Social image info.
	 * @return array<string, mixed>
	 */
	private static function primary_image( WP_Post $post, array $image ): array {
		if ( empty( $image['default'] ) && (string) $image['url'] !== '' ) {
			return $image;
		}
		if ( preg_match( '/<img[^>]+src=["\']([^"\']+)["\']/i', (string) $post->post_content, $m ) ) {
			$src = html_entity_decode( $m[1], ENT_QUOTES, 'UTF-8' );
			$id  = (int) attachment_url_to_postid( $src );
			if ( $id > 0 ) {
				return Neo_Pulse_Wp_Seo_Head::image_info( $id );
			}
			return Neo_Pulse_Wp_Seo_Head::image_info( 0, $src );
		}
		// Like Rank Math: with no featured image and no image in the content, the site's default
		// sharing image (a Media Library image) becomes the page's primary image.
		if ( ! empty( $image['default'] ) && (int) ( $image['id'] ?? 0 ) > 0 && (string) $image['url'] !== '' ) {
			return $image;
		}
		return array();
	}

	/**
	 * @return array<string, mixed>
	 */
	private static function author( int $user_id, string $org_id, bool $person_site ): array {
		$user = $user_id > 0 ? get_userdata( $user_id ) : false;
		if ( ! $user instanceof WP_User ) {
			return array();
		}
		$url    = get_author_posts_url( $user_id );
		$avatar = get_avatar_url( $user_id, array( 'size' => 96 ) );
		$node   = array(
			'@type'  => 'Person',
			'@id'    => $url,
			'name'   => Neo_Pulse_Wp_Seo_Vars::decode( $user->display_name ),
			'url'    => $url,
			'sameAs' => $user->user_url !== '' ? array( $user->user_url ) : array(),
		);
		if ( is_string( $avatar ) && $avatar !== '' ) {
			$node['image'] = array(
				'@type'      => 'ImageObject',
				'@id'        => $avatar,
				'url'        => $avatar,
				'caption'    => $node['name'],
				'inLanguage' => (string) get_bloginfo( 'language' ),
			);
		}
		if ( ! $person_site ) {
			$node['worksFor'] = array( '@id' => $org_id );
		}
		return $node;
	}

	/**
	 * Schema saved on the post (rank_math_schema_* meta), primary first.
	 *
	 * @param array<string, mixed> $ctx Context.
	 * @return array<int, array<string, mixed>>
	 */
	public static function stored_snippets( WP_Post $post, array $ctx ): array {
		$all = get_post_meta( $post->ID );
		if ( ! is_array( $all ) ) {
			return array();
		}
		$primary = array();
		$others  = array();
		foreach ( $all as $key => $values ) {
			if ( strpos( (string) $key, 'rank_math_schema_' ) !== 0 || ! is_array( $values ) ) {
				continue;
			}
			foreach ( $values as $value ) {
				$schema = maybe_unserialize( $value );
				if ( ! is_array( $schema ) || empty( $schema['@type'] ) ) {
					continue;
				}
				$meta = isset( $schema['metadata'] ) && is_array( $schema['metadata'] ) ? $schema['metadata'] : array();
				unset( $schema['metadata'] );
				$schema = Neo_Pulse_Wp_Seo_Vars::replace_deep( $schema, $ctx );
				if ( ! empty( $meta['isPrimary'] ) ) {
					$primary[] = $schema;
				} else {
					$others[] = $schema;
				}
			}
		}
		return array_merge( $primary, $others );
	}

	/**
	 * Every stored schema on the post was added by Neo Pulse's video detection.
	 */
	public static function stored_only_neo_pulse_videos( WP_Post $post ): bool {
		$all   = get_post_meta( $post->ID );
		$found = false;
		foreach ( is_array( $all ) ? $all : array() as $key => $values ) {
			if ( strpos( (string) $key, 'rank_math_schema_' ) !== 0 ) {
				continue;
			}
			foreach ( (array) $values as $value ) {
				$schema = maybe_unserialize( $value );
				if ( ! is_array( $schema ) || empty( $schema['metadata']['npwpAuto'] ) ) {
					return false;
				}
				$found = true;
			}
		}
		return $found;
	}

	/**
	 * Post type default rich snippet (Article types only).
	 *
	 * @param array<string, mixed> $ctx Context.
	 * @return array<string, mixed>
	 */
	public static function default_snippet( WP_Post $post, array $ctx ): array {
		$S  = 'Neo_Pulse_Wp_Seo_Settings';
		$pt = $post->post_type;
		if ( 'article' !== (string) $S::get( 'pt_' . $pt . '_default_rich_snippet', '' ) || 'off' === (string) get_post_meta( $post->ID, 'rank_math_rich_snippet', true ) ) {
			return array();
		}
		$type    = (string) $S::get( 'pt_' . $pt . '_default_article_type', 'Article' );
		$name    = Neo_Pulse_Wp_Seo_Vars::replace( (string) $S::get( 'pt_' . $pt . '_default_snippet_name' ), $ctx );
		$desc    = Neo_Pulse_Wp_Seo_Vars::replace( (string) $S::get( 'pt_' . $pt . '_default_snippet_desc' ), $ctx, 'text' );
		$section = '';
		if ( 'post' === $pt ) {
			$primary = Neo_Pulse_Wp_Seo_Vars::primary_term( $post );
			$section = $primary ? Neo_Pulse_Wp_Seo_Vars::decode( $primary->name ) : '';
		}
		return array(
			'@type'          => $type !== '' ? $type : 'Article',
			'headline'       => $name,
			'datePublished'  => (string) get_post_time( 'c', false, $post, true ),
			'dateModified'   => (string) get_post_modified_time( 'c', false, $post, true ),
			'articleSection' => $section,
			'author'         => array( '@type' => 'Person' ),
			'description'    => $desc,
			'name'           => $name,
		);
	}

	/**
	 * @param array<string, mixed> $schema Node.
	 */
	private static function is_article( array $schema ): bool {
		$types = (array) $schema['@type'];
		return (bool) array_intersect( $types, array( 'Article', 'BlogPosting', 'NewsArticle', 'TechArticle', 'Report', 'ScholarlyArticle' ) );
	}

	/**
	 * Drop empty strings and arrays so nodes stay tidy.
	 *
	 * @param mixed $data Value.
	 * @return mixed
	 */
	public static function strip_empty( $data ) {
		if ( ! is_array( $data ) ) {
			return $data;
		}
		foreach ( $data as $key => $value ) {
			$value = self::strip_empty( $value );
			if ( ( is_string( $value ) && trim( $value ) === '' ) || ( is_array( $value ) && $value === array() ) || null === $value ) {
				unset( $data[ $key ] );
				continue;
			}
			$data[ $key ] = $value;
		}
		return array_keys( $data ) === range( 0, count( $data ) - 1 ) ? array_values( $data ) : $data;
	}
}
