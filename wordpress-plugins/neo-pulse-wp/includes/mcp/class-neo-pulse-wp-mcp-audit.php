<?php
/**
 * Site-wide SEO & Schema Audit (`neo-pulse/read` -> `audit`).
 *
 * Implements the 8 generalized checks from the Elite Shadings audit in
 * EMCP-INTEGRATION-HANDOFF.md.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

final class Neo_Pulse_Wp_Mcp_Audit {

	/** Known portfolio/template brand names that can leak when content or ACF options are cloned. */
	const KNOWN_PORTFOLIO_BRANDS = array(
		'Blind Magic',
		'In The Shade',
		"Designer's Resource Centre",
		'Designers Resource Centre',
		'Shutter Spot',
		'Superior Blinds',
		'Elite Shadings',
		'Tailored Interiors',
		'Blinds West',
		'Advance Blinds',
		'DM Interiors',
	);

	/**
	 * Run all 8 audit checks and return structured findings.
	 *
	 * @return array<string,mixed>
	 */
	public static function run(): array {
		$findings = array();

		self::check_foreign_schema_text( $findings );
		self::check_logo( $findings );
		self::check_business_details( $findings );
		self::check_locations( $findings );
		self::check_article_and_authors( $findings );
		self::check_duplicate_entities( $findings );
		self::check_other_seo_plugins( $findings );
		self::check_leftover_cross_site_values( $findings );

		return array(
			'ok'            => true,
			'site_url'      => home_url( '/' ),
			'finding_count' => count( $findings ),
			'findings'      => $findings,
		);
	}

	/**
	 * 1. FAQ or other saved schema text naming a business other than the site's own.
	 *
	 * @param array<int,array<string,mixed>> $findings Collected findings.
	 */
	private static function check_foreign_schema_text( array &$findings ): void {
		$own_names = array_filter(
			array(
				strtolower( trim( (string) Neo_Pulse_Wp_Business::get()['name'] ) ),
				strtolower( trim( (string) Neo_Pulse_Wp_Business::get()['legal_name'] ) ),
				strtolower( trim( (string) Neo_Pulse_Wp_Business::get()['alternate_name'] ) ),
				strtolower( trim( (string) get_bloginfo( 'name' ) ) ),
			)
		);

		$foreign_brands = array();
		foreach ( self::KNOWN_PORTFOLIO_BRANDS as $brand ) {
			$lower = strtolower( $brand );
			$is_own = false;
			foreach ( $own_names as $own ) {
				if ( '' !== $own && ( false !== strpos( $own, $lower ) || false !== strpos( $lower, $own ) ) ) {
					$is_own = true;
					break;
				}
			}
			if ( ! $is_own ) {
				$foreign_brands[] = $brand;
			}
		}

		if ( array() === $foreign_brands ) {
			return;
		}

		$posts = get_posts(
			array(
				'post_type'      => array_keys( Neo_Pulse_Wp_Seo_Settings::post_types() ),
				'post_status'    => 'publish',
				'posts_per_page' => 250,
				'fields'         => 'ids',
			)
		);

		foreach ( is_array( $posts ) ? $posts : array() as $post_id ) {
			$post_id = (int) $post_id;
			$all     = get_post_meta( $post_id );
			if ( ! is_array( $all ) ) {
				continue;
			}
			$haystacks = array();
			foreach ( $all as $key => $values ) {
				if ( 0 === strpos( (string) $key, 'rank_math_schema_' ) || in_array( (string) $key, array( 'faq', 'seo_faq' ), true ) ) {
					$haystacks[ (string) $key ] = wp_json_encode( $values );
				}
			}
			foreach ( $haystacks as $meta_key => $blob ) {
				if ( ! is_string( $blob ) || '' === $blob ) {
					continue;
				}
				foreach ( $foreign_brands as $brand ) {
					if ( false !== stripos( $blob, $brand ) ) {
						$findings[] = array(
							'check'       => 1,
							'code'        => 'foreign_business_in_schema',
							'severity'    => 'error',
							'post_id'     => $post_id,
							'url'         => (string) get_permalink( $post_id ),
							'meta_key'    => $meta_key,
							'foreign_name'=> $brand,
							'message'     => sprintf(
								'Post #%d (%s) carries "%s" inside %s, which appears to be copied from another site.',
								$post_id,
								get_the_title( $post_id ),
								$brand,
								$meta_key
							),
							'fix_tool'    => 'neo-pulse/write',
							'fix_op'      => 'set-page-faqs',
						);
					}
				}
			}
		}
	}

	/**
	 * 2. Logo missing, or a favicon/site icon used as the logo.
	 *
	 * @param array<int,array<string,mixed>> $findings Collected findings.
	 */
	private static function check_logo( array &$findings ): void {
		$d         = Neo_Pulse_Wp_Business::get();
		$logo_id   = (int) ( $d['logo'] ?? 0 );
		$logo_url  = (string) Neo_Pulse_Wp_Seo_Settings::get( 'knowledgegraph_logo', '' );
		$site_icon = (int) get_option( 'site_icon', 0 );

		if ( $logo_id < 1 && '' === $logo_url ) {
			$findings[] = array(
				'check'    => 2,
				'code'     => 'logo_missing',
				'severity' => 'error',
				'message'  => 'Business logo is missing from the shared business details.',
				'fix_tool' => 'neo-pulse/write',
				'fix_op'   => 'update-business-details',
			);
			return;
		}

		if ( $logo_id > 0 && $site_icon > 0 && $logo_id === $site_icon ) {
			$findings[] = array(
				'check'    => 2,
				'code'     => 'logo_is_site_icon',
				'severity' => 'warning',
				'logo_id'  => $logo_id,
				'message'  => 'The site icon (favicon) attachment is set as the business logo.',
				'fix_tool' => 'neo-pulse/write',
				'fix_op'   => 'update-business-details',
			);
		}

		$check_url = $logo_id > 0 ? (string) wp_get_attachment_url( $logo_id ) : $logo_url;
		if ( '' !== $check_url && false !== stripos( basename( (string) wp_parse_url( $check_url, PHP_URL_PATH ) ), 'favicon' ) ) {
			$findings[] = array(
				'check'    => 2,
				'code'     => 'logo_filename_favicon',
				'severity' => 'warning',
				'logo_url' => $check_url,
				'message'  => 'The business logo file name contains "favicon". Use the full brand logo instead.',
				'fix_tool' => 'neo-pulse/write',
				'fix_op'   => 'update-business-details',
			);
		}

		if ( $logo_id > 0 ) {
			$meta = wp_get_attachment_metadata( $logo_id );
			$w    = is_array( $meta ) ? (int) ( $meta['width'] ?? 0 ) : 0;
			$h    = is_array( $meta ) ? (int) ( $meta['height'] ?? 0 ) : 0;
			if ( $w > 0 && $w === $h && $w <= 512 ) {
				$findings[] = array(
					'check'    => 2,
					'code'     => 'logo_square_small_icon',
					'severity' => 'warning',
					'logo_id'  => $logo_id,
					'width'    => $w,
					'height'   => $h,
					'message'  => sprintf( 'The business logo (#%d) is square and %dx%dpx (likely a favicon/icon).', $logo_id, $w, $h ),
					'fix_tool' => 'neo-pulse/write',
					'fix_op'   => 'update-business-details',
				);
			}
		}
	}

	/**
	 * 3. Business details missing phone, address, sameAs or email; shared details not created yet;
	 *    main_location that isn't a showroom; "one location" chosen on a site with 2+ showrooms.
	 *
	 * @param array<int,array<string,mixed>> $findings Collected findings.
	 */
	private static function check_business_details( array &$findings ): void {
		if ( ! Neo_Pulse_Wp_Business::exists() ) {
			$findings[] = array(
				'check'    => 3,
				'code'     => 'shared_business_details_missing',
				'severity' => 'error',
				'message'  => 'Shared business details (option neo_business_details) have not been created yet.',
				'fix_tool' => 'neo-pulse/write',
				'fix_op'   => 'update-business-details',
			);
		}

		$d         = Neo_Pulse_Wp_Business::get();
		$contact   = Neo_Pulse_Wp_Business::contact();
		$same_as   = Neo_Pulse_Wp_Seo_Schema::same_as();
		$showrooms = Neo_Pulse_Wp_Business::showroom_posts();

		if ( empty( $contact['phones'] ) ) {
			$findings[] = array(
				'check'    => 3,
				'code'     => 'business_phone_missing',
				'severity' => 'warning',
				'message'  => 'Business details are missing a phone number.',
				'fix_tool' => 'neo-pulse/write',
				'fix_op'   => 'update-business-details',
			);
		}
		if ( '' === trim( (string) ( $contact['address']['street'] ?? '' ) ) || '' === trim( (string) ( $contact['address']['city'] ?? '' ) ) ) {
			$findings[] = array(
				'check'    => 3,
				'code'     => 'business_address_incomplete',
				'severity' => 'warning',
				'message'  => 'Business details are missing a street address or city.',
				'fix_tool' => 'neo-pulse/write',
				'fix_op'   => 'update-business-details',
			);
		}
		if ( array() === $same_as ) {
			$findings[] = array(
				'check'    => 3,
				'code'     => 'business_same_as_missing',
				'severity' => 'warning',
				'message'  => 'Business details have no social profiles (sameAs).',
				'fix_tool' => 'neo-pulse/write',
				'fix_op'   => 'update-business-details',
			);
		}
		if ( '' === trim( (string) ( $d['email'] ?? '' ) ) ) {
			$findings[] = array(
				'check'    => 3,
				'code'     => 'business_email_missing',
				'severity' => 'warning',
				'message'  => 'Business details are missing an email address.',
				'fix_tool' => 'neo-pulse/write',
				'fix_op'   => 'update-business-details',
			);
		}

		$saved_main = (int) ( $d['main_location'] ?? 0 );
		if ( 'several' === ( $d['locations'] ?? 'one' ) && $saved_main > 0 && ! Neo_Pulse_Wp_Business::is_showroom( $saved_main ) ) {
			$findings[] = array(
				'check'         => 3,
				'code'          => 'main_location_not_showroom',
				'severity'      => 'error',
				'main_location' => $saved_main,
				'message'       => sprintf( 'main_location (#%d) is not a showroom location post.', $saved_main ),
				'fix_tool'      => 'neo-pulse/write',
				'fix_op'        => 'update-business-details',
			);
		}

		if ( 'one' === ( $d['locations'] ?? 'one' ) && count( $showrooms ) >= 2 ) {
			$findings[] = array(
				'check'          => 3,
				'code'           => 'one_location_with_multiple_showrooms',
				'severity'       => 'warning',
				'showroom_count' => count( $showrooms ),
				'message'        => sprintf( '"One location" is selected in business details, but the site has %d published showrooms.', count( $showrooms ) ),
				'fix_tool'       => 'neo-pulse/write',
				'fix_op'         => 'update-business-details',
			);
		}
	}

	/**
	 * 4. Locations with no address, no hours, unreadable hours, or plain LocalBusiness when a more
	 *    specific type is set for the business.
	 *
	 * @param array<int,array<string,mixed>> $findings Collected findings.
	 */
	private static function check_locations( array &$findings ): void {
		$biz_type  = trim( (string) ( Neo_Pulse_Wp_Business::get()['business_type'] ?? '' ) );
		$hour_map  = Neo_Pulse_Wp_Business::location_hour_fields();
		$locations = Neo_Pulse_Wp_Business::location_posts();

		foreach ( $locations as $post ) {
			$id      = (int) $post->ID;
			$title   = get_the_title( $post );
			$kind    = strtolower( Neo_Pulse_Wp_Business::location_value( $id, 'kind' ) );
			$is_area = false !== strpos( $kind, 'service' );
			if ( $is_area ) {
				continue;
			}

			$addr = Neo_Pulse_Wp_Business::location_value( $id, 'address' );
			if ( '' === $addr ) {
				$findings[] = array(
					'check'    => 4,
					'code'     => 'location_missing_address',
					'severity' => 'error',
					'post_id'  => $id,
					'message'  => sprintf( 'Location "%s" (#%d) has no address.', $title, $id ),
					'fix_tool' => 'neo-pulse/write',
					'fix_op'   => 'update-location',
				);
			}

			$any_hours  = false;
			$unreadable = array();
			foreach ( $hour_map as $day => $field ) {
				$raw  = get_post_meta( $id, $field, true );
				$text = is_scalar( $raw ) ? trim( wp_strip_all_tags( (string) $raw ) ) : '';
				if ( '' === $text ) {
					continue;
				}
				$lower = strtolower( $text );
				if ( in_array( $lower, array( 'closed', 'by appointment', 'by appointment only' ), true ) ) {
					$any_hours = true;
					continue;
				}
				$parsed = Neo_Pulse_Wp_Seo_Locations::parse_hours( $text );
				if ( array() === $parsed ) {
					$unreadable[ $day ] = $text;
				} else {
					$any_hours = true;
				}
			}

			if ( ! $any_hours && array() === $unreadable ) {
				$findings[] = array(
					'check'    => 4,
					'code'     => 'location_missing_hours',
					'severity' => 'warning',
					'post_id'  => $id,
					'message'  => sprintf( 'Showroom location "%s" (#%d) has no opening hours.', $title, $id ),
					'fix_tool' => 'neo-pulse/write',
					'fix_op'   => 'update-location',
				);
			}
			if ( array() !== $unreadable ) {
				$findings[] = array(
					'check'      => 4,
					'code'       => 'location_unreadable_hours',
					'severity'   => 'warning',
					'post_id'    => $id,
					'unreadable' => $unreadable,
					'message'    => sprintf( 'Showroom location "%s" (#%d) has unreadable opening hours on %s.', $title, $id, implode( ', ', array_keys( $unreadable ) ) ),
					'fix_tool'   => 'neo-pulse/write',
					'fix_op'     => 'update-location',
				);
			}

			$loc_type = Neo_Pulse_Wp_Business::location_type( $id );
			if ( 'LocalBusiness' === $loc_type && '' !== $biz_type && ! in_array( $biz_type, array( 'Organization', 'LocalBusiness' ), true ) ) {
				$findings[] = array(
					'check'    => 4,
					'code'     => 'location_generic_type',
					'severity' => 'warning',
					'post_id'  => $id,
					'message'  => sprintf( 'Location "%s" (#%d) uses plain LocalBusiness while the business is "%s".', $title, $id, $biz_type ),
					'fix_tool' => 'neo-pulse/write',
					'fix_op'   => 'update-location',
				);
			}
		}
	}

	/**
	 * 5. Homepage or other pages output as Article (pt_page_default_rich_snippet), and any
	 *    Article/Person author whose display_name equals their WordPress login.
	 *
	 * @param array<int,array<string,mixed>> $findings Collected findings.
	 */
	private static function check_article_and_authors( array &$findings ): void {
		$page_snippet = (string) Neo_Pulse_Wp_Seo_Settings::get( 'pt_page_default_rich_snippet', 'off' );
		if ( 'article' === $page_snippet ) {
			$findings[] = array(
				'check'    => 5,
				'code'     => 'pages_default_to_article',
				'severity' => 'warning',
				'message'  => 'Pages are set to output as Article by default (pt_page_default_rich_snippet = article). Set page schema rules to off so pages output as WebPage.',
				'fix_tool' => 'neo-pulse/write',
				'fix_op'   => 'set-type-rules',
			);
		}

		$author_ids = get_users(
			array(
				'who'    => 'authors',
				'fields' => 'ID',
			)
		);
		if ( empty( $author_ids ) ) {
			$author_ids = get_users( array( 'fields' => 'ID', 'number' => 50 ) );
		}
		foreach ( is_array( $author_ids ) ? $author_ids : array() as $uid ) {
			$user = get_userdata( (int) $uid );
			if ( ! $user instanceof WP_User ) {
				continue;
			}
			if ( '' !== $user->user_login && strtolower( trim( $user->display_name ) ) === strtolower( trim( $user->user_login ) ) ) {
				$count = count_user_posts( (int) $user->ID, array( 'post', 'page' ), true );
				if ( $count > 0 ) {
					$findings[] = array(
						'check'      => 5,
						'code'       => 'author_display_name_exposes_login',
						'severity'   => 'warning',
						'user_id'    => (int) $user->ID,
						'user_login' => (string) $user->user_login,
						'message'    => sprintf( 'Author #%d has display_name equal to WordPress login "%s", which exposes the login in Article/Person schema. Set a public display name.', (int) $user->ID, (string) $user->user_login ),
					);
				}
			}
		}
	}

	/**
	 * 6. More than one business entity on a page.
	 *
	 * @param array<int,array<string,mixed>> $findings Collected findings.
	 */
	private static function check_duplicate_entities( array &$findings ): void {
		$front_id = (int) get_option( 'page_on_front' );
		if ( $front_id < 1 ) {
			return;
		}
		$preview = Neo_Pulse_Wp_Mcp_Read::preview_output( array( 'post_id' => $front_id ) );
		if ( is_wp_error( $preview ) || empty( $preview['json_ld']['@graph'] ) || ! is_array( $preview['json_ld']['@graph'] ) ) {
			return;
		}
		$org_nodes = 0;
		foreach ( $preview['json_ld']['@graph'] as $node ) {
			if ( ! is_array( $node ) ) {
				continue;
			}
			$types = (array) ( $node['@type'] ?? array() );
			if ( in_array( 'Organization', $types, true ) || in_array( 'LocalBusiness', $types, true ) ) {
				++$org_nodes;
			}
		}
		if ( $org_nodes > 1 ) {
			$findings[] = array(
				'check'     => 6,
				'code'      => 'multiple_business_entities_on_page',
				'severity'  => 'warning',
				'post_id'   => $front_id,
				'org_nodes' => $org_nodes,
				'message'   => sprintf( 'Front page (#%d) outputs %d top-level Organization/LocalBusiness nodes in its schema graph.', $front_id, $org_nodes ),
			);
		}
	}

	/**
	 * 7. Another SEO plugin still active alongside Neo Pulse's output.
	 *
	 * @param array<int,array<string,mixed>> $findings Collected findings.
	 */
	private static function check_other_seo_plugins( array &$findings ): void {
		$other = Neo_Pulse_Wp_Seo_Settings::other_seo_plugin();
		if ( '' !== $other ) {
			$findings[] = array(
				'check'            => 7,
				'code'             => 'other_seo_plugin_active',
				'severity'         => Neo_Pulse_Wp_Seo_Settings::enabled() ? 'error' : 'warning',
				'other_seo_plugin' => $other,
				'message'          => sprintf( '%s is still active alongside Neo Pulse.', $other ),
			);
		}
	}

	/**
	 * 8. Values left over from another site in business details or old ACF Contact Information fields.
	 *
	 * @param array<int,array<string,mixed>> $findings Collected findings.
	 */
	private static function check_leftover_cross_site_values( array &$findings ): void {
		$contact    = Neo_Pulse_Wp_Business::contact();
		$biz_city   = strtolower( trim( (string) ( $contact['address']['city'] ?? '' ) ) );
		$biz_region = strtoupper( trim( (string) ( $contact['address']['region'] ?? '' ) ) );

		$acf_addr  = trim( (string) get_option( 'options_ci_address', '' ) );
		$acf_phone = trim( (string) get_option( 'options_ci_phone', '' ) );
		$acf_email = trim( (string) get_option( 'options_ci_email', '' ) );

		if ( '' !== $acf_addr && '' !== $biz_city && false === stripos( $acf_addr, $biz_city ) ) {
			$findings[] = array(
				'check'       => 8,
				'code'        => 'leftover_acf_contact_address',
				'severity'    => 'warning',
				'acf_address' => $acf_addr,
				'biz_city'    => $biz_city,
				'message'     => sprintf( 'Old ACF Contact Information (options_ci_address = "%s") does not match the business city ("%s") and may be left over from another site.', $acf_addr, $biz_city ),
			);
		}

		$biz_phone = isset( $contact['phones'][0]['number'] ) ? (string) $contact['phones'][0]['number'] : '';
		$biz_area  = self::area_code( $biz_phone );
		$acf_area  = self::area_code( $acf_phone );
		if ( '' !== $biz_area && '' !== $acf_area && $biz_area !== $acf_area && '800' !== $acf_area && '888' !== $acf_area && '877' !== $acf_area ) {
			$findings[] = array(
				'check'     => 8,
				'code'      => 'leftover_acf_contact_phone',
				'severity'  => 'warning',
				'acf_phone' => $acf_phone,
				'biz_phone' => $biz_phone,
				'message'   => sprintf( 'Old ACF Contact Information phone (%s) has a different area code from the business phone (%s) and may be left over from another site.', $acf_phone, $biz_phone ),
			);
		}

		if ( '' !== $acf_email && false !== strpos( $acf_email, '@' ) ) {
			$site_host = strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
			$site_host = (string) preg_replace( '/^www\./', '', $site_host );
			$email_dom = strtolower( substr( strrchr( $acf_email, '@' ), 1 ) );
			if ( '' !== $site_host && '' !== $email_dom && false === strpos( $site_host, '.wpenginepowered.com' ) && $email_dom !== $site_host && ! in_array( $email_dom, array( 'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com' ), true ) ) {
				$findings[] = array(
					'check'     => 8,
					'code'      => 'leftover_acf_contact_email',
					'severity'  => 'warning',
					'acf_email' => $acf_email,
					'site_host' => $site_host,
					'message'   => sprintf( 'Old ACF Contact Information email (%s) uses domain "%s" on site "%s".', $acf_email, $email_dom, $site_host ),
				);
			}
		}
		unset( $biz_region );
	}

	private static function area_code( string $phone ): string {
		$digits = (string) preg_replace( '/\D+/', '', $phone );
		if ( 11 === strlen( $digits ) && '1' === $digits[0] ) {
			$digits = substr( $digits, 1 );
		}
		return strlen( $digits ) >= 10 ? substr( $digits, 0, 3 ) : '';
	}
}
