<?php
/**
 * Schema for location pages built from the ACF "Location Fields" used across client sites.
 *
 * - Showroom pages (type field "Showroom", the "showroom" post type, or any location page with an
 *   address) get their own LocalBusiness node: name, address, phone, email, opening hours and map,
 *   tied to the main business with parentOrganization.
 * - Service-area pages (type field "Service Area", or no address) add the town to the business's
 *   areaServed. No address is invented for them.
 *
 * Field names differ a little between sites, so each value is read from the first field that is
 * filled in. Hours are free text; a day whose hours cannot be read with certainty is left out
 * rather than printed wrong.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Seo_Locations {

	const POST_TYPES = array( 'location', 'locations', 'showroom' );

	const FIELDS = array(
		'type'    => array( 'showroom_or_service_area' ),
		'address' => array( 'address', 'full_address', 'location_address' ),
		'phone'   => array( 'phone_number', 'location_phone' ),
		'email'   => array( 'email_address' ),
		'map'     => array( 'google_maps_link', 'location_google_maps_link' ),
		'place'   => array( 'google_place_id' ),
		'area'    => array( 'location_name_google_maps' ),
	);

	const DAYS = array(
		'monday'    => 'Monday',
		'tuesday'   => 'Tuesday',
		'wednesday' => 'Wednesday',
		'thursday'  => 'Thursday',
		'friday'    => 'Friday',
		'saturday'  => 'Saturday',
		'sunday'    => 'Sunday',
	);

	/**
	 * @return array<int, string>
	 */
	public static function post_types(): array {
		$types = self::POST_TYPES;
		if ( class_exists( 'Neo_Pulse_Wp_Business' ) && Neo_Pulse_Wp_Business::exists() ) {
			$types[] = Neo_Pulse_Wp_Business::location_source()['post_type'];
		}
		$types = apply_filters( 'neo_pulse_wp_seo_location_post_types', array_values( array_unique( $types ) ) );
		return array_values( array_filter( array_map( 'strval', (array) $types ) ) );
	}

	/**
	 * Only location pages that use the location fields: a post type that happens to be called
	 * "location" but stores something else is left alone.
	 */
	public static function applies( WP_Post $post ): bool {
		if ( ! in_array( $post->post_type, self::post_types(), true ) ) {
			return false;
		}
		foreach ( array( 'type', 'address', 'area' ) as $key ) {
			if ( self::field( $post->ID, $key ) !== '' ) {
				return true;
			}
		}
		return false;
	}

	private static function field( int $post_id, string $key ): string {
		$names = self::FIELDS[ $key ];
		// Shared business details say which fields hold what (location_source); they come first.
		$shared = array(
			'type'    => 'kind',
			'address' => 'address',
			'phone'   => 'phone',
			'map'     => 'map',
		);
		if ( isset( $shared[ $key ] ) && class_exists( 'Neo_Pulse_Wp_Business' ) && Neo_Pulse_Wp_Business::exists() ) {
			$field = Neo_Pulse_Wp_Business::location_field( $shared[ $key ] );
			if ( $field !== '' ) {
				$names = array_values( array_unique( array_merge( array( $field ), $names ) ) );
			}
		}
		foreach ( $names as $name ) {
			$value = get_post_meta( $post_id, $name, true );
			if ( is_scalar( $value ) ) {
				$value = trim( (string) preg_replace( '/\s+/u', ' ', wp_strip_all_tags( (string) $value ) ) );
				if ( $value !== '' ) {
					return $value;
				}
			}
		}
		return '';
	}

	/**
	 * "showroom" or "area".
	 */
	public static function kind( WP_Post $post ): string {
		$type = strtolower( self::field( $post->ID, 'type' ) );
		if ( strpos( $type, 'service' ) !== false ) {
			return 'area';
		}
		if ( strpos( $type, 'showroom' ) !== false || 'showroom' === $post->post_type ) {
			return 'showroom';
		}
		return self::field( $post->ID, 'address' ) !== '' ? 'showroom' : 'area';
	}

	/**
	 * Schema for one location page.
	 *
	 * @param array<string, mixed> $org Main business node (for the type, name and country).
	 * @return array{node: array<string, mixed>, area: array<string, mixed>}
	 */
	public static function build( WP_Post $post, string $url, array $org ): array {
		$out = array(
			'node' => array(),
			'area' => array(),
		);
		if ( ! self::applies( $post ) ) {
			return $out;
		}
		$title = trim( wp_strip_all_tags( get_the_title( $post ) ) );
		if ( 'area' === self::kind( $post ) ) {
			$name = self::field( $post->ID, 'area' );
			$name = $name !== '' ? $name : $title;
			if ( $name !== '' ) {
				$out['area'] = array(
					'@type' => 'City',
					'name'  => $name,
				);
			}
			return $out;
		}

		$address = self::field( $post->ID, 'address' );
		if ( $address === '' ) {
			return $out;
		}
		$country  = is_array( $org['address'] ?? null ) ? (string) ( $org['address']['addressCountry'] ?? '' ) : '';
		$org_name = (string) ( $org['name'] ?? '' );
		$type     = $org['@type'] ?? 'LocalBusiness';
		$type     = is_array( $type ) ? (string) reset( $type ) : (string) $type;
		$type     = in_array( $type, array( '', 'Organization', 'Person' ), true ) ? 'LocalBusiness' : $type;
		$own      = class_exists( 'Neo_Pulse_Wp_Business' ) ? Neo_Pulse_Wp_Business::location_type( $post->ID ) : '';
		$type     = $own !== '' ? $own : $type; // A location's own type (shared business details' location_source).
		$profile  = class_exists( 'Neo_Pulse_Wp_Business' ) ? Neo_Pulse_Wp_Business::location_profile( $post->ID ) : '';

		$node = array(
			'@type'              => $type,
			'@id'                => $url . '#localbusiness',
			'name'               => trim( $org_name . ( $org_name !== '' && $title !== '' ? ' - ' : '' ) . $title ),
			'url'                => $url,
			'address'            => self::parse_address( $address, $country ),
			'telephone'          => self::phone( self::field( $post->ID, 'phone' ) ),
			'email'              => is_email( self::field( $post->ID, 'email' ) ) ? self::field( $post->ID, 'email' ) : '',
			'hasMap'             => self::map_url( $post->ID ),
			'openingHoursSpecification' => self::opening_hours( $post->ID ),
			'geo'                => class_exists( 'Neo_Pulse_Wp_Business' ) ? Neo_Pulse_Wp_Business::geo_schema( Neo_Pulse_Wp_Business::location_geo( $post->ID ) ) : array(),
			'sameAs'             => $profile !== '' ? array( $profile ) : array(),
		);
		if ( ! empty( $org['@id'] ) ) {
			$node['parentOrganization'] = array( '@id' => (string) $org['@id'] );
		}
		if ( ! empty( $org['logo']['@id'] ) ) {
			$node['image'] = array( '@id' => (string) $org['logo']['@id'] );
		}
		if ( ! empty( $org['priceRange'] ) ) {
			$node['priceRange'] = (string) $org['priceRange'];
		}
		$out['node'] = $node;
		return $out;
	}

	private static function phone( string $phone ): string {
		return trim( (string) preg_replace( '/\s*-\s*/', '-', (string) preg_replace( '/\s+/', ' ', $phone ) ) );
	}

	private static function map_url( int $post_id ): string {
		$map = self::field( $post_id, 'map' );
		if ( $map !== '' && preg_match( '#^https?://#i', $map ) && filter_var( $map, FILTER_VALIDATE_URL ) ) {
			return esc_url_raw( $map );
		}
		$place = self::field( $post_id, 'place' );
		return preg_match( '/^[A-Za-z0-9_-]{10,}$/', $place ) ? 'https://www.google.com/maps/place/?q=place_id:' . $place : '';
	}

	/**
	 * One-line address ("street, city, PROV postal[, country]") as a PostalAddress. When the line
	 * cannot be split with confidence, the whole line goes in streetAddress.
	 *
	 * @return array<string, string>
	 */
	public static function parse_address( string $line, string $default_country = '' ): array {
		$line    = trim( (string) preg_replace( '/\s{2,}/', ', ', trim( $line ) ) );
		$parts   = array_values( array_filter( array_map( 'trim', explode( ',', $line ) ), 'strlen' ) );
		$country = '';
		$map     = array(
			'canada'                   => 'CA',
			'ca'                       => 'CA',
			'united states'            => 'US',
			'united states of america' => 'US',
			'usa'                      => 'US',
			'us'                       => 'US',
		);
		if ( count( $parts ) > 1 && isset( $map[ strtolower( (string) end( $parts ) ) ] ) ) {
			$country = $map[ strtolower( (string) array_pop( $parts ) ) ];
		}
		$postal_re = '([A-Z]\d[A-Z]\s?\d[A-Z]\d|\d{5}(?:-\d{4})?)';
		$region    = '';
		$postal    = '';
		$last      = (string) end( $parts );
		if ( preg_match( '/^([A-Z]{2})\s+' . $postal_re . '$/i', $last, $m ) ) {
			$region = strtoupper( $m[1] );
			$postal = strtoupper( $m[2] );
			array_pop( $parts );
		} elseif ( count( $parts ) > 2 && preg_match( '/^' . $postal_re . '$/i', $last, $m ) && preg_match( '/^[A-Z]{2}$/i', (string) $parts[ count( $parts ) - 2 ] ) ) {
			$postal = strtoupper( $m[1] );
			array_pop( $parts );
			$region = strtoupper( (string) array_pop( $parts ) );
		} elseif ( preg_match( '/^([A-Z]{2})$/i', $last ) ) {
			$region = strtoupper( $last );
			array_pop( $parts );
		}
		$out = array( '@type' => 'PostalAddress' );
		if ( $region !== '' && count( $parts ) >= 2 ) {
			$out['addressLocality'] = (string) array_pop( $parts );
			$out['streetAddress']   = implode( ', ', $parts );
			$out['addressRegion']   = $region;
			if ( $postal !== '' ) {
				$out['postalCode'] = $postal;
			}
		} else {
			$out['streetAddress'] = $line;
		}
		if ( $country === '' && $postal !== '' ) {
			$country = ctype_digit( substr( $postal, 0, 1 ) ) ? 'US' : 'CA';
		}
		if ( $country === '' && $region !== '' ) {
			$country = in_array( $region, array( 'AB', 'BC', 'MB', 'NB', 'NL', 'NS', 'NT', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT' ), true ) ? 'CA' : 'US';
		}
		$country = $country !== '' ? $country : $default_country;
		if ( $country !== '' ) {
			$out['addressCountry'] = $country;
		}
		return $out;
	}

	/**
	 * monday_hours … sunday_hours → OpeningHoursSpecification, days with the same hours grouped.
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public static function opening_hours( int $post_id ): array {
		$groups = array();
		$fields = class_exists( 'Neo_Pulse_Wp_Business' ) && Neo_Pulse_Wp_Business::exists() ? Neo_Pulse_Wp_Business::location_hour_fields() : array();
		foreach ( self::DAYS as $key => $day ) {
			$raw = get_post_meta( $post_id, $fields[ $key ] ?? $key . '_hours', true );
			foreach ( self::parse_hours( is_scalar( $raw ) ? (string) $raw : '' ) as $range ) {
				$groups[ $range[0] . '-' . $range[1] ][] = $day;
			}
		}
		$out = array();
		foreach ( $groups as $span => $days ) {
			list( $opens, $closes ) = explode( '-', $span );
			$out[]                  = array(
				'@type'     => 'OpeningHoursSpecification',
				'dayOfWeek' => count( $days ) === 1 ? $days[0] : $days,
				'opens'     => $opens,
				'closes'    => $closes,
			);
		}
		return $out;
	}

	/**
	 * Opening ranges in a day's text as [ "HH:MM", "HH:MM" ] pairs. "Closed", "By appointment",
	 * empty or anything unclear gives no ranges.
	 *
	 * @return array<int, array{0: string, 1: string}>
	 */
	public static function parse_hours( string $raw ): array {
		$text = strtolower( trim( wp_strip_all_tags( $raw ) ) );
		$text = str_replace( array( "\u{202F}", "\u{00A0}", "\u{2009}" ), ' ', $text );
		$text = str_replace( array( "\u{2013}", "\u{2014}", ' to ' ), '-', $text );
		$text = str_replace( array( 'a.m.', 'p.m.', 'a.m', 'p.m' ), array( 'am', 'pm', 'am', 'pm' ), $text );
		$text = str_replace( array( 'noon', 'midnight' ), array( '12pm', '12am' ), $text );
		if ( $text === '' || ! preg_match( '/\d/', $text ) ) {
			return array();
		}
		$out = array();
		foreach ( array_map( 'trim', preg_split( '/[,;&]|\band\b/', $text ) ?: array() ) as $segment ) {
			if ( ! preg_match( '/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/', $segment, $m ) ) {
				return array();
			}
			$m         = array_pad( $m, 7, '' ); // Unmatched trailing groups are left out.
			$start_mer = $m[3];
			$end_mer   = $m[6];
			if ( $end_mer === '' && $start_mer === '' ) {
				// "9 to 5", "10-4": business hours without am/pm, read as a morning start and an
				// afternoon close. Anything else without am/pm stays unread.
				$from = (int) $m[1];
				$to   = (int) $m[4];
				if ( $from >= 5 && $from <= 11 && ( 12 === $to || ( $to >= 1 && $to < $from ) ) ) {
					$start_mer = 'am';
					$end_mer   = 'pm';
				}
			}
			if ( $end_mer === '' ) {
				return array();
			}
			$end   = self::to_minutes( (int) $m[4], (int) ( $m[5] !== '' ? $m[5] : 0 ), $end_mer );
			$start = null;
			if ( $start_mer !== '' ) {
				$start = self::to_minutes( (int) $m[1], (int) ( $m[2] !== '' ? $m[2] : 0 ), $start_mer );
			} else {
				// "1-4:30 pm": same half of the day as the closing time when that gives a sensible range.
				$start = self::to_minutes( (int) $m[1], (int) ( $m[2] !== '' ? $m[2] : 0 ), $end_mer );
				if ( null !== $start && null !== $end && $start >= $end ) {
					$start = self::to_minutes( (int) $m[1], (int) ( $m[2] !== '' ? $m[2] : 0 ), 'am' );
				}
			}
			if ( null === $start || null === $end || $start >= $end ) {
				return array();
			}
			$out[] = array( sprintf( '%02d:%02d', intdiv( $start, 60 ), $start % 60 ), sprintf( '%02d:%02d', intdiv( $end, 60 ), $end % 60 ) );
		}
		return $out;
	}

	private static function to_minutes( int $hour, int $minute, string $meridiem ): ?int {
		if ( $hour < 1 || $hour > 12 || $minute > 59 ) {
			return null;
		}
		$hour = $hour % 12;
		if ( 'pm' === $meridiem ) {
			$hour += 12;
		}
		return $hour * 60 + $minute;
	}
}
