<?php
/**
 * Write operations for the `neo-pulse/write` WordPress Abilities API dispatcher.
 *
 * Implements:
 * - update-business-details (shared with Neo Tools)
 * - update-location
 * - set-page-faqs
 * - set-page-schema
 * - set-type-rules
 * - update-settings
 * - undo
 *
 * Every write goes through the plugin's own save functions, supports `dry_run: true`,
 * checks `expected_version` for optimistic concurrency, records a before-state snapshot
 * in `neo_pulse_wp_mcp_history`, and reads back the stored result.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

final class Neo_Pulse_Wp_Mcp_Write {

	/**
	 * Catalog of available write operations.
	 *
	 * @return array<string,mixed>
	 */
	public static function catalog(): array {
		return array(
			'dispatcher' => 'neo-pulse/write',
			'version'    => defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '',
			'locked'     => class_exists( 'Neo_Pulse_Wp_Lock', false ) && Neo_Pulse_Wp_Lock::is_locked(),
			'plan'       => class_exists( 'Neo_Pulse_Wp_License', false ) ? Neo_Pulse_Wp_License::plan() : 'pro_ai',
			'operations' => array(
				'update-business-details' => array(
					'description' => 'Patch the shared business details (option neo_business_details, shared with Neo Tools). Only sent fields change; unknown keys are kept. Supports dry_run, expected_version, and create: true.',
					'arguments'   => array(
						'expected_version' => 'string (optional version hash from get-business-details)',
						'create'           => 'boolean (optional; required true if neo_business_details does not exist yet)',
						'dry_run'          => 'boolean (optional; preview before/after without writing)',
						'type'             => 'company | person',
						'name'             => 'string',
						'alternate_name'   => 'string',
						'legal_name'       => 'string',
						'business_type'    => 'string (schema.org letters only, e.g. HomeGoodsStore)',
						'url'              => 'string (URL)',
						'email'            => 'string (email)',
						'price_range'      => 'string',
						'logo'             => 'integer (attachment ID)',
						'logo_light'       => 'integer (attachment ID)',
						'logo_icon'        => 'integer (attachment ID)',
						'locations'        => 'one | several',
						'main_location'    => 'integer (must be a showroom Location post ID)',
						'phones'           => 'array of { number, label } (one-location sites only)',
						'address'          => 'object { street, city, region, postal_code, country } (one-location sites only)',
						'map_url'          => 'string (URL)',
						'geo'              => 'object { lat, lng } (both decimal degrees or both empty; one-location sites only)',
						'hours'            => 'object { monday..sunday => string } (one-location sites only)',
						'social'           => 'object { facebook, instagram, linkedin, x, youtube, tiktok, pinterest, houzz, google }',
						'other_profiles'   => 'array of URL strings',
						'review_url'       => 'string (URL)',
						'review_count'     => 'integer',
					),
				),
				'update-location'         => array(
					'description' => 'Update an existing Location post through location_source (address, phone, map_url, kind, type, geo, profile, hours). Supports dry_run.',
					'arguments'   => array(
						'post_id'    => 'integer (required Location post ID)',
						'dry_run'    => 'boolean (optional)',
						'address'    => 'string',
						'phone'      => 'string',
						'tel'        => 'string',
						'map_url'    => 'string (http/https URL)',
						'kind'       => 'Showroom | Service Area',
						'type'       => 'string (schema.org letters only, e.g. HomeGoodsStore)',
						'lat'        => 'string (decimal degrees)',
						'lng'        => 'string (decimal degrees)',
						'profile'    => 'string (Google Business Profile http/https URL)',
						'hours_line' => 'string',
						'hours'      => 'object { monday..sunday => string }',
					),
				),
				'set-page-faqs'           => array(
					'description' => 'Replace a page or post FAQ schema (rank_math_schema_FAQPage). Pass an empty faqs list to clear it. Supports dry_run and expected_version.',
					'arguments'   => array(
						'post_id'          => 'integer (required unless url is given)',
						'url'              => 'string (optional URL)',
						'faqs'             => 'array of { question, answer }',
						'expected_version' => 'string (optional version from get-page-schema)',
						'dry_run'          => 'boolean (optional)',
					),
				),
				'set-page-schema'         => array(
					'description' => 'Set per-page schema type (off, default, WebPage, Article, BlogPosting, NewsArticle) on a post. Supports dry_run and expected_version.',
					'arguments'   => array(
						'post_id'          => 'integer (required unless url is given)',
						'url'              => 'string (optional URL)',
						'type'             => 'off | default | WebPage | Article | BlogPosting | NewsArticle',
						'expected_version' => 'string (optional version from get-page-schema)',
						'dry_run'          => 'boolean (optional)',
					),
				),
				'set-type-rules'          => array(
					'description' => 'Set site-wide schema, title, description, or robots rules per content type (e.g. Pages: no Article). Supports dry_run and expected_version.',
					'arguments'   => array(
						'rules'            => 'object { [post_type]: { schema?: "off"|"Article"|"BlogPosting"|"NewsArticle", robots?: "default"|"index"|"noindex", title?: string, description?: string } }',
						'expected_version' => 'string (optional version from get-settings)',
						'dry_run'          => 'boolean (optional)',
					),
				),
				'update-settings'         => array(
					'description' => 'Patch Neo Pulse SEO settings (titles, indexing, behaviour, social, enabled) through the settings screen sanitiser. Supports dry_run and expected_version.',
					'arguments'   => array(
						'titles'           => 'object (optional)',
						'indexing'         => 'object (optional)',
						'behaviour'        => 'object (optional)',
						'social'           => 'object (optional)',
						'enabled'          => 'boolean (optional)',
						'expected_version' => 'string (optional version from get-settings)',
						'dry_run'          => 'boolean (optional)',
					),
				),
				'undo'                    => array(
					'description' => 'Restore a previous Neo Pulse MCP write by history ID, refusing on conflict unless force: true.',
					'arguments'   => array(
						'id'      => 'string (required history ID from list-history)',
						'force'   => 'boolean (optional; ignore version conflict)',
						'dry_run' => 'boolean (optional)',
					),
				),
			),
		);
	}

	/**
	 * Dispatch a write operation.
	 *
	 * @param string              $operation Operation name.
	 * @param array<string,mixed> $args      Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	public static function dispatch( string $operation, array $args ) {
		if ( '' === $operation ) {
			return self::catalog();
		}

		if ( class_exists( 'Neo_Pulse_Wp_Lock', false ) && Neo_Pulse_Wp_Lock::is_locked() ) {
			return new WP_Error( 'locked', Neo_Pulse_Wp_Lock::locked_message(), array( 'status' => 403 ) );
		}

		switch ( $operation ) {
			case 'update-business-details':
				return self::update_business_details( $args );
			case 'update-location':
				return self::update_location( $args );
			case 'set-page-faqs':
				return self::set_page_faqs( $args );
			case 'set-page-schema':
				return self::set_page_schema( $args );
			case 'set-type-rules':
				return self::set_type_rules( $args );
			case 'update-settings':
				return self::update_settings( $args );
			case 'undo':
				return self::undo( $args );
			default:
				return new WP_Error(
					'invalid_argument',
					sprintf(
						/* translators: %s: operation name */
						__( 'Unknown neo-pulse/write operation "%s". Call with no operation for the catalog.', 'neo-pulse-wp' ),
						$operation
					),
					array( 'status' => 400 )
				);
		}
	}

	/**
	 * `update-business-details`: patch shared `neo_business_details`.
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function update_business_details( array $args ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new WP_Error( 'forbidden', __( 'You do not have permission to update business details.', 'neo-pulse-wp' ), array( 'status' => 403 ) );
		}

		$exists  = Neo_Pulse_Wp_Business::exists();
		$cur_ver = Neo_Pulse_Wp_Business::version_hash();

		if ( ! empty( $args['expected_version'] ) && (string) $args['expected_version'] !== $cur_ver ) {
			return new WP_Error(
				'conflict',
				sprintf( 'Business details changed since version %s (current version is %s). Re-read get-business-details and retry.', (string) $args['expected_version'], $cur_ver ),
				array( 'status' => 409, 'current_version' => $cur_ver )
			);
		}

		if ( ! $exists && empty( $args['create'] ) ) {
			return new WP_Error(
				'invalid_argument',
				__( 'Shared business details do not exist yet. Pass create: true to create them.', 'neo-pulse-wp' ),
				array( 'status' => 400 )
			);
		}

		$before_stored = Neo_Pulse_Wp_Business::stored();
		$current       = $exists && is_array( $before_stored ) ? array_merge( Neo_Pulse_Wp_Business::blank(), $before_stored ) : Neo_Pulse_Wp_Business::from_pulse();
		$next          = $current;

		$locations_mode = isset( $args['locations'] ) ? ( 'several' === $args['locations'] ? 'several' : 'one' ) : (string) ( $current['locations'] ?? 'one' );
		if ( 'several' === $locations_mode ) {
			foreach ( array( 'address', 'phones', 'hours', 'geo' ) as $contact_field ) {
				if ( array_key_exists( $contact_field, $args ) ) {
					return new WP_Error(
						'invalid_argument',
						sprintf( 'This business has several locations; change %s on the main location via update-location.', $contact_field ),
						array( 'status' => 400 )
					);
				}
			}
		}

		if ( array_key_exists( 'main_location', $args ) ) {
			$main_id = absint( $args['main_location'] );
			if ( $main_id > 0 && ! Neo_Pulse_Wp_Business::is_showroom( $main_id ) ) {
				return new WP_Error(
					'invalid_argument',
					sprintf( 'main_location (#%d) must be a published showroom Location post, not a service area.', $main_id ),
					array( 'status' => 400 )
				);
			}
			$next['main_location'] = $main_id;
		}

		if ( array_key_exists( 'business_type', $args ) ) {
			$raw_bt = trim( (string) $args['business_type'] );
			if ( '' !== $raw_bt && ! preg_match( '/^[A-Za-z]+$/', $raw_bt ) ) {
				return new WP_Error( 'invalid_argument', 'business_type must contain letters only (e.g. HomeGoodsStore).', array( 'status' => 400 ) );
			}
			$next['business_type'] = $raw_bt;
		}

		if ( array_key_exists( 'geo', $args ) ) {
			if ( ! is_array( $args['geo'] ) ) {
				return new WP_Error( 'invalid_argument', 'geo must be an object with lat and lng.', array( 'status' => 400 ) );
			}
			$raw_lat = trim( (string) ( $args['geo']['lat'] ?? '' ) );
			$raw_lng = trim( (string) ( $args['geo']['lng'] ?? '' ) );
			if ( ( '' === $raw_lat ) !== ( '' === $raw_lng ) ) {
				return new WP_Error( 'invalid_argument', 'Provide both geo.lat and geo.lng, or leave both empty.', array( 'status' => 400 ) );
			}
			if ( '' !== $raw_lat ) {
				$clean_lat = Neo_Pulse_Wp_Business::coordinate( $raw_lat, 90 );
				$clean_lng = Neo_Pulse_Wp_Business::coordinate( $raw_lng, 180 );
				if ( '' === $clean_lat || '' === $clean_lng ) {
					return new WP_Error( 'invalid_argument', 'geo.lat and geo.lng must be valid decimal degrees within [-90..90] and [-180..180].', array( 'status' => 400 ) );
				}
				$next['geo'] = array( 'lat' => $clean_lat, 'lng' => $clean_lng );
			} else {
				$next['geo'] = array( 'lat' => '', 'lng' => '' );
			}
		}

		$patch_scalars = array( 'type', 'name', 'alternate_name', 'legal_name', 'url', 'email', 'price_range', 'logo', 'logo_light', 'logo_icon', 'locations', 'map_url', 'hours_line', 'holiday_hours', 'review_url', 'review_count' );
		foreach ( $patch_scalars as $key ) {
			if ( array_key_exists( $key, $args ) ) {
				$next[ $key ] = $args[ $key ];
			}
		}

		if ( isset( $args['address'] ) && is_array( $args['address'] ) ) {
			$next['address'] = array_merge( is_array( $current['address'] ?? null ) ? $current['address'] : array(), $args['address'] );
		}
		if ( isset( $args['phones'] ) && is_array( $args['phones'] ) ) {
			$next['phones'] = $args['phones'];
		}
		if ( isset( $args['hours'] ) && is_array( $args['hours'] ) ) {
			$next['hours'] = array_merge( is_array( $current['hours'] ?? null ) ? $current['hours'] : array(), $args['hours'] );
		}
		if ( isset( $args['social'] ) && is_array( $args['social'] ) ) {
			$next['social'] = array_merge( is_array( $current['social'] ?? null ) ? $current['social'] : array(), $args['social'] );
		}
		if ( isset( $args['other_profiles'] ) && is_array( $args['other_profiles'] ) ) {
			$next['other_profiles'] = $args['other_profiles'];
		}
		if ( isset( $args['location_source'] ) && is_array( $args['location_source'] ) ) {
			$next['location_source'] = $args['location_source'];
		}

		// Preserve any additional unknown keys passed in args (excluding control flags).
		$control_keys = array( 'expected_version', 'create', 'dry_run' );
		foreach ( $args as $k => $v ) {
			if ( ! in_array( (string) $k, $control_keys, true ) && ! array_key_exists( (string) $k, $next ) ) {
				$next[ (string) $k ] = $v;
			}
		}

		$preview_after = Neo_Pulse_Wp_Business::sanitize( $next );
		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'      => true,
				'would_change' => $before_stored !== $preview_after,
				'before'       => $before_stored,
				'after'        => $preview_after,
				'version'      => $cur_ver,
			);
		}

		$history_id = Neo_Pulse_Wp_Mcp_History::record(
			'update-business-details',
			'Updated shared business details',
			array(
				'kind'   => 'option',
				'option' => Neo_Pulse_Wp_Business::OPTION,
				'existed'=> $exists,
				'value'  => $before_stored,
			)
		);

		Neo_Pulse_Wp_Business::save( $next, 'neo-pulse' );
		$stored_after = Neo_Pulse_Wp_Mcp_Read::get_business_details();

		return array(
			'ok'         => true,
			'history_id' => $history_id,
			'version'    => $stored_after['version'],
			'data'       => $stored_after,
		);
	}

	/**
	 * `update-location`: change an existing Location post's fields through `location_source`.
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function update_location( array $args ) {
		$post_id = isset( $args['post_id'] ) ? absint( $args['post_id'] ) : 0;
		if ( $post_id < 1 ) {
			return new WP_Error( 'invalid_argument', 'post_id is required for update-location.', array( 'status' => 400 ) );
		}
		$post      = get_post( $post_id );
		$loc_src   = Neo_Pulse_Wp_Business::location_source();
		$post_type = (string) $loc_src['post_type'];
		if ( ! $post instanceof WP_Post || $post_type !== $post->post_type ) {
			return new WP_Error( 'not_found', sprintf( 'Location post #%d (%s) not found.', $post_id, $post_type ), array( 'status' => 404 ) );
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error( 'forbidden', 'You do not have permission to edit this location post.', array( 'status' => 403 ) );
		}

		$fields   = $loc_src['fields'];
		$hour_map = Neo_Pulse_Wp_Business::location_hour_fields();
		$updates  = array();

		if ( array_key_exists( 'lat', $args ) || array_key_exists( 'lng', $args ) ) {
			$raw_lat = trim( (string) ( $args['lat'] ?? '' ) );
			$raw_lng = trim( (string) ( $args['lng'] ?? '' ) );
			if ( ( '' === $raw_lat ) !== ( '' === $raw_lng ) ) {
				return new WP_Error( 'invalid_argument', 'Provide both lat and lng for location coordinates, or leave both empty.', array( 'status' => 400 ) );
			}
			if ( '' !== $raw_lat ) {
				$c_lat = Neo_Pulse_Wp_Business::coordinate( $raw_lat, 90 );
				$c_lng = Neo_Pulse_Wp_Business::coordinate( $raw_lng, 180 );
				if ( '' === $c_lat || '' === $c_lng ) {
					return new WP_Error( 'invalid_argument', 'Location lat and lng must be valid decimal degrees.', array( 'status' => 400 ) );
				}
				$updates[ $fields['lat'] ] = $c_lat;
				$updates[ $fields['lng'] ] = $c_lng;
			} else {
				$updates[ $fields['lat'] ] = '';
				$updates[ $fields['lng'] ] = '';
			}
		}

		if ( array_key_exists( 'type', $args ) ) {
			$raw_type = trim( (string) $args['type'] );
			if ( '' !== $raw_type && ! preg_match( '/^[A-Za-z]+$/', $raw_type ) ) {
				return new WP_Error( 'invalid_argument', 'Location type must contain letters only (e.g. HomeGoodsStore).', array( 'status' => 400 ) );
			}
			$updates[ $fields['type'] ] = $raw_type;
		}

		foreach ( array( 'profile' => 'profile', 'map_url' => 'map', 'map' => 'map' ) as $arg_k => $field_k ) {
			if ( array_key_exists( $arg_k, $args ) ) {
				$u = trim( (string) $args[ $arg_k ] );
				if ( '' !== $u && ( ! preg_match( '#^https?://#i', $u ) || ! filter_var( $u, FILTER_VALIDATE_URL ) ) ) {
					return new WP_Error( 'invalid_argument', sprintf( '%s must be an http(s) URL.', $arg_k ), array( 'status' => 400 ) );
				}
				$updates[ $fields[ $field_k ] ] = '' !== $u ? esc_url_raw( $u ) : '';
			}
		}

		foreach ( array( 'address' => 'address', 'phone' => 'phone', 'tel' => 'tel', 'kind' => 'kind', 'hours_line' => 'hours_line' ) as $arg_k => $field_k ) {
			if ( array_key_exists( $arg_k, $args ) && ! empty( $fields[ $field_k ] ) ) {
				$updates[ $fields[ $field_k ] ] = sanitize_text_field( (string) $args[ $arg_k ] );
			}
		}

		if ( isset( $args['hours'] ) && is_array( $args['hours'] ) ) {
			foreach ( Neo_Pulse_Wp_Business::DAYS as $day ) {
				if ( array_key_exists( $day, $args['hours'] ) && ! empty( $hour_map[ $day ] ) ) {
					$updates[ $hour_map[ $day ] ] = sanitize_text_field( (string) $args['hours'][ $day ] );
				}
			}
		}

		$before_meta = array();
		foreach ( array_keys( $updates ) as $meta_key ) {
			$before_meta[ $meta_key ] = get_post_meta( $post_id, $meta_key, true );
		}

		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'      => true,
				'post_id'      => $post_id,
				'would_change' => $before_meta !== $updates,
				'before'       => $before_meta,
				'after'        => $updates,
			);
		}

		$history_id = Neo_Pulse_Wp_Mcp_History::record(
			'update-location',
			sprintf( 'Updated location #%d (%s)', $post_id, get_the_title( $post ) ),
			array(
				'kind'    => 'post_meta',
				'post_id' => $post_id,
				'meta'    => $before_meta,
			)
		);

		foreach ( $updates as $meta_key => $meta_val ) {
			update_post_meta( $post_id, $meta_key, $meta_val );
		}
		Neo_Pulse_Wp_Business::forget();
		if ( Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}

		$all_locations = Neo_Pulse_Wp_Mcp_Read::list_locations();
		$stored_loc    = null;
		foreach ( $all_locations['locations'] as $loc ) {
			if ( (int) $loc['id'] === $post_id ) {
				$stored_loc = $loc;
				break;
			}
		}

		return array(
			'ok'         => true,
			'history_id' => $history_id,
			'post_id'    => $post_id,
			'data'       => $stored_loc,
		);
	}

	/**
	 * `set-page-faqs`: replace or clear `rank_math_schema_FAQPage` on a post.
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function set_page_faqs( array $args ) {
		$post = Neo_Pulse_Wp_Mcp_Read::resolve_post( $args );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		if ( ! current_user_can( 'edit_post', $post->ID ) ) {
			return new WP_Error( 'forbidden', 'You do not have permission to edit this post.', array( 'status' => 403 ) );
		}
		if ( ! isset( $args['faqs'] ) || ! is_array( $args['faqs'] ) ) {
			return new WP_Error( 'invalid_argument', 'faqs array is required (pass an empty array to clear).', array( 'status' => 400 ) );
		}

		$cur_ver = Neo_Pulse_Wp_Mcp_Read::page_version_hash( (int) $post->ID );
		if ( ! empty( $args['expected_version'] ) && (string) $args['expected_version'] !== $cur_ver ) {
			return new WP_Error(
				'conflict',
				sprintf( 'Page schema meta changed since version %s (current version is %s).', (string) $args['expected_version'], $cur_ver ),
				array( 'status' => 409, 'current_version' => $cur_ver )
			);
		}

		$entities = array();
		foreach ( $args['faqs'] as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$q = trim( wp_strip_all_tags( (string) ( $row['question'] ?? $row['q'] ?? '' ) ) );
			$a = trim( wp_kses_post( (string) ( $row['answer'] ?? $row['a'] ?? '' ) ) );
			if ( '' === $q || '' === $a ) {
				return new WP_Error( 'invalid_argument', 'Each FAQ item must have a non-empty question and answer.', array( 'status' => 400 ) );
			}
			$entities[] = array(
				'@type'          => 'Question',
				'name'           => $q,
				'acceptedAnswer' => array(
					'@type' => 'Answer',
					'text'  => $a,
				),
			);
		}

		$before_val = get_post_meta( $post->ID, 'rank_math_schema_FAQPage', true );
		$after_val  = array() === $entities
			? null
			: array(
				'@type'      => 'FAQPage',
				'metadata'   => array(
					'title'     => 'FAQ',
					'type'      => 'template',
					'isPrimary' => false,
				),
				'mainEntity' => $entities,
			);

		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'      => true,
				'post_id'      => (int) $post->ID,
				'would_change' => $before_val !== $after_val,
				'before'       => '' === $before_val ? null : $before_val,
				'after'        => $after_val,
				'version'      => $cur_ver,
			);
		}

		$history_id = Neo_Pulse_Wp_Mcp_History::record(
			'set-page-faqs',
			sprintf( 'Updated FAQ schema on post #%d (%s)', (int) $post->ID, get_the_title( $post ) ),
			array(
				'kind'    => 'post_meta',
				'post_id' => (int) $post->ID,
				'meta'    => array( 'rank_math_schema_FAQPage' => $before_val ),
			)
		);

		if ( null === $after_val ) {
			delete_post_meta( $post->ID, 'rank_math_schema_FAQPage' );
		} else {
			update_post_meta( $post->ID, 'rank_math_schema_FAQPage', $after_val );
		}

		if ( Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}

		$read_back = Neo_Pulse_Wp_Mcp_Read::get_page_schema( array( 'post_id' => (int) $post->ID ) );

		return array(
			'ok'         => true,
			'history_id' => $history_id,
			'version'    => is_array( $read_back ) ? ( $read_back['version'] ?? '' ) : '',
			'data'       => $read_back,
		);
	}

	/**
	 * `set-page-schema`: set per-page schema type (`off`, `default`, `WebPage`, `Article`, `BlogPosting`, `NewsArticle`).
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function set_page_schema( array $args ) {
		$post = Neo_Pulse_Wp_Mcp_Read::resolve_post( $args );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		if ( ! current_user_can( 'edit_post', $post->ID ) ) {
			return new WP_Error( 'forbidden', 'You do not have permission to edit this post.', array( 'status' => 403 ) );
		}

		$type    = isset( $args['type'] ) ? trim( (string) $args['type'] ) : '';
		$allowed = array( 'off', 'default', 'WebPage', 'Article', 'BlogPosting', 'NewsArticle' );
		if ( ! in_array( $type, $allowed, true ) ) {
			return new WP_Error( 'invalid_argument', 'type must be one of: off, default, WebPage, Article, BlogPosting, NewsArticle.', array( 'status' => 400 ) );
		}

		$cur_ver = Neo_Pulse_Wp_Mcp_Read::page_version_hash( (int) $post->ID );
		if ( ! empty( $args['expected_version'] ) && (string) $args['expected_version'] !== $cur_ver ) {
			return new WP_Error(
				'conflict',
				sprintf( 'Page schema meta changed since version %s (current version is %s).', (string) $args['expected_version'], $cur_ver ),
				array( 'status' => 409, 'current_version' => $cur_ver )
			);
		}

		$before_meta = array(
			'rank_math_rich_snippet'   => get_post_meta( $post->ID, 'rank_math_rich_snippet', true ),
			'rank_math_schema_Article' => get_post_meta( $post->ID, 'rank_math_schema_Article', true ),
		);

		$after_meta = array(
			'rank_math_rich_snippet'   => '',
			'rank_math_schema_Article' => '',
		);
		if ( 'off' === $type || 'WebPage' === $type ) {
			$after_meta['rank_math_rich_snippet'] = 'off';
		} elseif ( in_array( $type, array( 'Article', 'BlogPosting', 'NewsArticle' ), true ) ) {
			$after_meta['rank_math_rich_snippet']   = 'article';
			$after_meta['rank_math_schema_Article'] = array(
				'@type'          => $type,
				'metadata'       => array(
					'title'     => 'Article',
					'type'      => 'template',
					'isPrimary' => true,
				),
				'headline'       => '%seo_title%',
				'datePublished'  => '%date(Y-m-dTH:i:sP)%',
				'dateModified'   => '%modified(Y-m-dTH:i:sP)%',
				'author'         => array(
					'@type' => 'Person',
					'name'  => '%name%',
				),
				'description'    => '%seo_description%',
			);
		}

		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'      => true,
				'post_id'      => (int) $post->ID,
				'would_change' => $before_meta !== $after_meta,
				'before'       => $before_meta,
				'after'        => $after_meta,
				'version'      => $cur_ver,
			);
		}

		$history_id = Neo_Pulse_Wp_Mcp_History::record(
			'set-page-schema',
			sprintf( 'Set page schema to %s on post #%d (%s)', $type, (int) $post->ID, get_the_title( $post ) ),
			array(
				'kind'    => 'post_meta',
				'post_id' => (int) $post->ID,
				'meta'    => $before_meta,
			)
		);

		foreach ( $after_meta as $mk => $mv ) {
			if ( '' === $mv || null === $mv ) {
				delete_post_meta( $post->ID, $mk );
			} else {
				update_post_meta( $post->ID, $mk, $mv );
			}
		}

		if ( Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}

		$read_back = Neo_Pulse_Wp_Mcp_Read::get_page_schema( array( 'post_id' => (int) $post->ID ) );

		return array(
			'ok'         => true,
			'history_id' => $history_id,
			'version'    => is_array( $read_back ) ? ( $read_back['version'] ?? '' ) : '',
			'data'       => $read_back,
		);
	}

	/**
	 * `set-type-rules`: site-wide rules per content type (e.g. `pt_page_default_rich_snippet = off`).
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function set_type_rules( array $args ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new WP_Error( 'forbidden', 'You do not have permission to change content type SEO rules.', array( 'status' => 403 ) );
		}
		if ( empty( $args['rules'] ) || ! is_array( $args['rules'] ) ) {
			return new WP_Error( 'invalid_argument', 'rules object is required for set-type-rules.', array( 'status' => 400 ) );
		}

		$cur_ver = Neo_Pulse_Wp_Mcp_Read::settings_version_hash();
		if ( ! empty( $args['expected_version'] ) && (string) $args['expected_version'] !== $cur_ver ) {
			return new WP_Error(
				'conflict',
				sprintf( 'SEO settings changed since version %s (current version is %s).', (string) $args['expected_version'], $cur_ver ),
				array( 'status' => 409, 'current_version' => $cur_ver )
			);
		}

		$changes = array();
		foreach ( $args['rules'] as $type => $rule ) {
			$type = sanitize_key( (string) $type );
			if ( '' === $type || ! post_type_exists( $type ) || ! is_array( $rule ) ) {
				return new WP_Error( 'invalid_argument', sprintf( 'Invalid post type "%s" in rules.', (string) $type ), array( 'status' => 400 ) );
			}
			if ( array_key_exists( 'title', $rule ) ) {
				$changes[ 'pt_' . $type . '_title' ] = Neo_Pulse_Wp_Seo_Settings::clean_input( $rule['title'] );
			}
			if ( array_key_exists( 'description', $rule ) ) {
				$changes[ 'pt_' . $type . '_description' ] = Neo_Pulse_Wp_Seo_Settings::clean_input( $rule['description'] );
			}
			if ( array_key_exists( 'robots', $rule ) ) {
				$choice = (string) $rule['robots'];
				if ( 'index' === $choice || 'noindex' === $choice ) {
					$current = Neo_Pulse_Wp_Seo_Settings::robots_list( Neo_Pulse_Wp_Seo_Settings::get( 'pt_' . $type . '_robots', array() ) );
					$others  = array_values( array_diff( $current, array( 'index', 'noindex' ) ) );
					$changes[ 'pt_' . $type . '_custom_robots' ] = 'on';
					$changes[ 'pt_' . $type . '_robots' ]        = array_merge( array( $choice ), $others );
				} else {
					$changes[ 'pt_' . $type . '_custom_robots' ] = 'off';
				}
			}
			if ( array_key_exists( 'schema', $rule ) ) {
				$schema = (string) $rule['schema'];
				if ( in_array( $schema, array( 'Article', 'BlogPosting', 'NewsArticle' ), true ) ) {
					$changes[ 'pt_' . $type . '_default_rich_snippet' ] = 'article';
					$changes[ 'pt_' . $type . '_default_article_type' ] = $schema;
				} elseif ( in_array( $schema, array( 'off', 'none', 'WebPage', '' ), true ) ) {
					$changes[ 'pt_' . $type . '_default_rich_snippet' ] = 'off';
				} else {
					return new WP_Error( 'invalid_argument', sprintf( 'Unsupported schema type "%s" for %s.', $schema, $type ), array( 'status' => 400 ) );
				}
			}
		}

		$before_raw = Neo_Pulse_Wp_Seo_Settings::raw();
		$before_sub = array();
		foreach ( array_keys( $changes ) as $k ) {
			$before_sub[ $k ] = Neo_Pulse_Wp_Seo_Settings::get( $k, '' );
		}

		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'      => true,
				'would_change' => $before_sub !== $changes,
				'before'       => $before_sub,
				'after'        => $changes,
				'version'      => $cur_ver,
			);
		}

		$history_id = Neo_Pulse_Wp_Mcp_History::record(
			'set-type-rules',
			'Updated content-type SEO/schema rules',
			array(
				'kind'   => 'option',
				'option' => Neo_Pulse_Wp_Seo_Settings::OPTION,
				'existed'=> ! empty( $before_raw ),
				'value'  => $before_raw,
			)
		);

		Neo_Pulse_Wp_Seo_Settings::save_titles( $changes );
		if ( Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}

		$after_settings = Neo_Pulse_Wp_Mcp_Read::get_settings();

		return array(
			'ok'         => true,
			'history_id' => $history_id,
			'version'    => $after_settings['version'],
			'data'       => $after_settings,
		);
	}

	/**
	 * `update-settings`: patch non-business SEO settings through the same sanitising as the settings screen.
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function update_settings( array $args ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new WP_Error( 'forbidden', 'You do not have permission to update SEO settings.', array( 'status' => 403 ) );
		}

		$cur_ver = Neo_Pulse_Wp_Mcp_Read::settings_version_hash();
		if ( ! empty( $args['expected_version'] ) && (string) $args['expected_version'] !== $cur_ver ) {
			return new WP_Error(
				'conflict',
				sprintf( 'SEO settings changed since version %s (current version is %s).', (string) $args['expected_version'], $cur_ver ),
				array( 'status' => 409, 'current_version' => $cur_ver )
			);
		}

		$title_changes   = array();
		$general_changes = array();

		$titles_in = isset( $args['titles'] ) && is_array( $args['titles'] ) ? $args['titles'] : $args;
		foreach ( array( 'title_separator', 'homepage_title', 'homepage_description', 'author_archive_title', 'date_archive_title', 'search_title', '404_title', 'website_name' ) as $k ) {
			if ( array_key_exists( $k, $titles_in ) ) {
				$val = Neo_Pulse_Wp_Seo_Settings::clean_input( $titles_in[ $k ] );
				if ( 'title_separator' === $k && '' === $val ) {
					$val = '-';
				}
				$title_changes[ $k ] = $val;
			}
		}
		if ( array_key_exists( 'capitalize_titles', $titles_in ) ) {
			$title_changes['capitalize_titles'] = ! empty( $titles_in['capitalize_titles'] ) && 'off' !== $titles_in['capitalize_titles'] ? 'on' : 'off';
		}

		$indexing_in = isset( $args['indexing'] ) && is_array( $args['indexing'] ) ? $args['indexing'] : $args;
		foreach ( array( 'noindex_search', 'noindex_empty_taxonomies', 'noindex_archive_subpages', 'noindex_paginated_pages', 'noindex_password_protected' ) as $k ) {
			if ( array_key_exists( $k, $indexing_in ) ) {
				$title_changes[ $k ] = ! empty( $indexing_in[ $k ] ) && 'off' !== $indexing_in[ $k ] ? 'on' : 'off';
			}
		}

		$behaviour_in = isset( $args['behaviour'] ) && is_array( $args['behaviour'] ) ? $args['behaviour'] : $args;
		foreach ( array( 'disable_date_archives', 'disable_author_archives', 'neo_pulse_404_monitor' ) as $k ) {
			if ( array_key_exists( $k, $behaviour_in ) ) {
				$title_changes[ $k ] = ! empty( $behaviour_in[ $k ] ) && 'off' !== $behaviour_in[ $k ] ? 'on' : 'off';
			}
		}
		foreach ( array( 'new_window_external_links', 'nofollow_external_links' ) as $k ) {
			if ( array_key_exists( $k, $behaviour_in ) ) {
				$general_changes[ $k ] = ! empty( $behaviour_in[ $k ] ) && 'off' !== $behaviour_in[ $k ] ? 'on' : 'off';
			}
		}

		$social_in = isset( $args['social'] ) && is_array( $args['social'] ) ? $args['social'] : $args;
		if ( array_key_exists( 'open_graph_image', $social_in ) ) {
			$og_url                                = esc_url_raw( Neo_Pulse_Wp_Seo_Settings::clean_input( $social_in['open_graph_image'] ) );
			$title_changes['open_graph_image']     = $og_url;
			$title_changes['open_graph_image_id']  = '' !== $og_url ? (string) attachment_url_to_postid( $og_url ) : '';
		}
		if ( array_key_exists( 'twitter_card_type', $social_in ) ) {
			$title_changes['twitter_card_type'] = 'summary' === $social_in['twitter_card_type'] ? 'summary' : 'summary_large_image';
		}
		if ( array_key_exists( 'twitter_author_names', $social_in ) ) {
			$title_changes['twitter_author_names'] = Neo_Pulse_Wp_Seo_Settings::clean_input( $social_in['twitter_author_names'] );
		}

		$before_raw = Neo_Pulse_Wp_Seo_Settings::raw();

		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'         => true,
				'would_change'    => array() !== $title_changes || array() !== $general_changes || array_key_exists( 'enabled', $args ),
				'title_changes'   => $title_changes,
				'general_changes' => $general_changes,
				'enabled'         => array_key_exists( 'enabled', $args ) ? (bool) $args['enabled'] : Neo_Pulse_Wp_Seo_Settings::enabled(),
				'version'         => $cur_ver,
			);
		}

		$history_id = Neo_Pulse_Wp_Mcp_History::record(
			'update-settings',
			'Updated Neo Pulse SEO settings',
			array(
				'kind'   => 'option',
				'option' => Neo_Pulse_Wp_Seo_Settings::OPTION,
				'existed'=> ! empty( $before_raw ),
				'value'  => $before_raw,
			)
		);

		if ( array() !== $title_changes ) {
			Neo_Pulse_Wp_Seo_Settings::save_titles( $title_changes );
		}
		if ( array() !== $general_changes ) {
			Neo_Pulse_Wp_Seo_Settings::save_general( $general_changes );
		}
		if ( array_key_exists( 'enabled', $args ) ) {
			Neo_Pulse_Wp_Seo_Settings::set_enabled( (bool) $args['enabled'] );
		}
		if ( Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}

		$after_settings = Neo_Pulse_Wp_Mcp_Read::get_settings();

		return array(
			'ok'         => true,
			'history_id' => $history_id,
			'version'    => $after_settings['version'],
			'data'       => $after_settings,
		);
	}

	/**
	 * `undo`: restore a previous write by history ID.
	 *
	 * @param array<string,mixed> $args Arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function undo( array $args ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new WP_Error( 'forbidden', 'You do not have permission to undo MCP writes.', array( 'status' => 403 ) );
		}
		$id = isset( $args['id'] ) ? sanitize_text_field( (string) $args['id'] ) : '';
		if ( '' === $id ) {
			return new WP_Error( 'invalid_argument', 'History id is required for undo.', array( 'status' => 400 ) );
		}

		$entry = Neo_Pulse_Wp_Mcp_History::get( $id );
		if ( null === $entry ) {
			return new WP_Error( 'not_found', sprintf( 'History entry "%s" not found.', $id ), array( 'status' => 404 ) );
		}
		if ( ! empty( $entry['undone'] ) && empty( $args['force'] ) ) {
			return new WP_Error( 'conflict', sprintf( 'History entry "%s" was already undone.', $id ), array( 'status' => 409 ) );
		}

		$snap = isset( $entry['snapshot'] ) && is_array( $entry['snapshot'] ) ? $entry['snapshot'] : array();
		$kind = (string) ( $snap['kind'] ?? '' );

		if ( ! empty( $args['dry_run'] ) ) {
			return array(
				'dry_run'   => true,
				'id'        => $id,
				'operation' => (string) ( $entry['operation'] ?? '' ),
				'snapshot'  => $snap,
			);
		}

		if ( 'option' === $kind ) {
			$option = (string) ( $snap['option'] ?? '' );
			if ( Neo_Pulse_Wp_Business::OPTION === $option ) {
				if ( empty( $snap['existed'] ) || ! is_array( $snap['value'] ) ) {
					delete_option( Neo_Pulse_Wp_Business::OPTION );
					Neo_Pulse_Wp_Business::forget();
				} else {
					Neo_Pulse_Wp_Business::save( $snap['value'], 'neo-pulse' );
				}
			} elseif ( Neo_Pulse_Wp_Seo_Settings::OPTION === $option ) {
				if ( empty( $snap['existed'] ) || ! is_array( $snap['value'] ) ) {
					delete_option( Neo_Pulse_Wp_Seo_Settings::OPTION );
					Neo_Pulse_Wp_Seo_Settings::flush_cache();
				} else {
					Neo_Pulse_Wp_Seo_Settings::save_raw( $snap['value'] );
				}
			}
		} elseif ( 'post_meta' === $kind ) {
			$post_id = (int) ( $snap['post_id'] ?? 0 );
			$meta    = isset( $snap['meta'] ) && is_array( $snap['meta'] ) ? $snap['meta'] : array();
			if ( $post_id > 0 ) {
				foreach ( $meta as $mk => $mv ) {
					if ( '' === $mv || null === $mv ) {
						delete_post_meta( $post_id, (string) $mk );
					} else {
						update_post_meta( $post_id, (string) $mk, $mv );
					}
				}
			}
		} else {
			return new WP_Error( 'invalid_argument', 'Unsupported snapshot kind.', array( 'status' => 400 ) );
		}

		if ( Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}

		Neo_Pulse_Wp_Mcp_History::mark_undone( $id );

		return array(
			'ok'        => true,
			'undone_id' => $id,
			'operation' => (string) ( $entry['operation'] ?? '' ),
		);
	}
}
