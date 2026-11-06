<?php
/**
 * Business details and location write operations.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Mcp_Write_Trait_Business_Location {

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
}
