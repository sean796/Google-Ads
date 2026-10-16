<?php
/**
 * Shared Business details (option `neo_business_details`), read and written by both Neo Tools and
 * Neo Pulse. Spec: project doc claude/business-details-spec.md. Change the format only in both
 * plugins at once.
 *
 * Neo Pulse keeps its schema and settings code as they were and bridges to the shared option:
 * while the option exists, Neo_Pulse_Wp_Seo_Settings::get() answers the business keys
 * (knowledgegraph_*, local_address, phone_numbers, opening_hours, social profiles, …) from it in
 * Neo Pulse's own format, and saving the SEO settings writes those keys back into it.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

final class Neo_Pulse_Wp_Business {

	const OPTION  = 'neo_business_details';
	const VERSION = 1;
	const ACTION_CREATE = 'neo_pulse_wp_business_create';

	const DAYS = array( 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday' );

	const SOCIAL = array( 'facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok', 'pinterest', 'houzz', 'google' );

	/** Neo Pulse SEO keys answered from the shared option while it exists. */
	const SEO_KEYS = array(
		'knowledgegraph_type',
		'knowledgegraph_name',
		'knowledgegraph_logo',
		'knowledgegraph_logo_id',
		'website_alternate_name',
		'legal_name',
		'local_business_type',
		'url',
		'email',
		'price_range',
		'local_address',
		'phone_numbers',
		'opening_hours',
		'geo_lat',
		'geo_lng',
		'social_url_facebook',
		'social_additional_profiles',
	);

	/** Keys that come from the main location when the site has several. */
	const CONTACT_KEYS = array( 'local_address', 'phone_numbers', 'opening_hours', 'geo_lat', 'geo_lng' );

	/** @var array<string,mixed>|null */
	private static $memo = null;

	public static function init(): void {
		add_action( 'admin_init', array( __CLASS__, 'maybe_create' ) );
		add_action( 'admin_post_' . self::ACTION_CREATE, array( __CLASS__, 'handle_create' ) );
		add_action( 'neo_business_details_saved', array( __CLASS__, 'on_saved' ), 10, 2 );
		add_action( 'update_option_' . self::OPTION, array( __CLASS__, 'forget' ) );
		add_action( 'add_option_' . self::OPTION, array( __CLASS__, 'forget' ) );
		add_action( 'delete_option_' . self::OPTION, array( __CLASS__, 'forget' ) );
	}

	public static function forget(): void {
		self::$memo = null;
	}

	/* ---------- Reading ---------- */

	/**
	 * The stored option, or null while it doesn't exist (an array with a non-empty version).
	 *
	 * @return array<string,mixed>|null
	 */
	public static function stored(): ?array {
		$raw = get_option( self::OPTION );
		return is_array( $raw ) && ! empty( $raw['version'] ) ? $raw : null;
	}

	public static function exists(): bool {
		return null !== self::stored();
	}

	/**
	 * The details for display or output (filter `neo_business_details`), with every key present.
	 *
	 * @return array<string,mixed>
	 */
	public static function get(): array {
		if ( null !== self::$memo ) {
			return self::$memo;
		}
		$stored = self::stored();
		$data   = array_merge( self::blank(), $stored ? $stored : array() );
		/**
		 * Shared business details, as read for display or output.
		 *
		 * @param array<string,mixed> $data Details.
		 */
		$data = apply_filters( 'neo_business_details', $data );
		self::$memo = is_array( $data ) ? array_merge( self::blank(), $data ) : self::blank();
		return self::$memo;
	}

	/**
	 * Every key with an empty value.
	 *
	 * @return array<string,mixed>
	 */
	public static function blank(): array {
		return array(
			'version'         => self::VERSION,
			'updated'         => 0,
			'updated_by'      => '',
			'type'            => 'company',
			'name'            => '',
			'alternate_name'  => '',
			'legal_name'      => '',
			'business_type'   => '',
			'url'             => '',
			'email'           => '',
			'price_range'     => '',
			'logo'            => 0,
			'logo_light'      => 0,
			'logo_icon'       => 0,
			'locations'       => 'one',
			'main_location'   => 0,
			'phones'          => array(),
			'address'         => array( 'street' => '', 'city' => '', 'region' => '', 'postal_code' => '', 'country' => '' ),
			'map_url'         => '',
			'geo'             => array( 'lat' => '', 'lng' => '' ),
			'hours'           => array_fill_keys( self::DAYS, '' ),
			'hours_line'      => '',
			'holiday_hours'   => '',
			'social'          => array_fill_keys( self::SOCIAL, '' ),
			'other_profiles'  => array(),
			'review_url'      => '',
			'review_count'    => 0,
			'location_source' => self::default_location_source(),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function default_location_source(): array {
		$hours = array();
		foreach ( self::DAYS as $day ) {
			$hours[ $day ] = $day . '_hours';
		}
		return array(
			'post_type' => 'location',
			'fields'    => array(
				'phone'      => 'phone_number',
				'tel'        => 'phone_number_link',
				'address'    => 'address',
				'map'        => 'google_maps_link',
				'kind'       => 'showroom_or_service_area',
				'hours_line' => 'condensed_hours_line',
				'lat'        => 'latitude',
				'lng'        => 'longitude',
				'type'       => 'business_type',
				'profile'    => 'google_business_profile',
				'hours'      => $hours,
			),
		);
	}

	public static function several(): bool {
		$d = self::get();
		return 'several' === $d['locations'] && self::effective_main_location() > 0;
	}

	/**
	 * Deterministic version hash of the stored business details option for optimistic concurrency.
	 */
	public static function version_hash(): string {
		$stored = self::stored();
		if ( null === $stored ) {
			return 'none';
		}
		return substr( hash( 'sha256', (string) wp_json_encode( $stored ) ), 0, 16 );
	}

	/**
	 * Whether a location post ID is a valid published showroom (not a service area).
	 */
	public static function is_showroom( int $post_id ): bool {
		if ( $post_id < 1 ) {
			return false;
		}
		$post = get_post( $post_id );
		$type = self::location_source()['post_type'];
		if ( ! $post instanceof WP_Post || 'publish' !== $post->post_status || $type !== $post->post_type ) {
			return false;
		}
		$kind    = strtolower( self::location_value( $post_id, 'kind' ) );
		$address = self::location_value( $post_id, 'address' );
		return false === strpos( $kind, 'service' ) && '' !== $address;
	}

	/**
	 * All published location posts for location_source.post_type.
	 *
	 * @return array<int, WP_Post>
	 */
	public static function location_posts(): array {
		$type = self::location_source()['post_type'];
		if ( ! post_type_exists( $type ) ) {
			return array();
		}
		$posts = get_posts(
			array(
				'post_type'        => $type,
				'post_status'      => 'publish',
				'numberposts'      => 100,
				'orderby'          => 'menu_order title',
				'order'            => 'ASC',
				'suppress_filters' => false,
			)
		);
		return is_array( $posts ) ? $posts : array();
	}

	/**
	 * All published showroom location posts on the site.
	 *
	 * @return array<int, WP_Post>
	 */
	public static function showroom_posts(): array {
		$out = array();
		foreach ( self::location_posts() as $post ) {
			if ( self::is_showroom( (int) $post->ID ) ) {
				$out[] = $post;
			}
		}
		return $out;
	}

	/**
	 * Effective main location ID: the saved main_location when it is a showroom, else the first showroom.
	 */
	public static function effective_main_location(): int {
		$d  = self::get();
		$id = (int) ( $d['main_location'] ?? 0 );
		if ( $id > 0 && self::is_showroom( $id ) ) {
			return $id;
		}
		$showrooms = self::showroom_posts();
		return $showrooms !== array() ? (int) $showrooms[0]->ID : 0;
	}

	/* ---------- Locations (always through location_source) ---------- */

	/**
	 * @return array<string,mixed>
	 */
	public static function location_source(): array {
		$src = self::get()['location_source'];
		$def = self::default_location_source();
		if ( ! is_array( $src ) ) {
			return $def;
		}
		$src['post_type'] = isset( $src['post_type'] ) && is_string( $src['post_type'] ) && $src['post_type'] !== '' ? sanitize_key( $src['post_type'] ) : $def['post_type'];
		$src['fields']    = isset( $src['fields'] ) && is_array( $src['fields'] ) ? array_merge( $def['fields'], $src['fields'] ) : $def['fields'];
		if ( ! is_array( $src['fields']['hours'] ) ) {
			$src['fields']['hours'] = $def['fields']['hours'];
		}
		return $src;
	}

	/**
	 * Field name for a location value ('phone', 'tel', 'address', 'map', 'kind', 'hours_line'), or ''.
	 */
	public static function location_field( string $key ): string {
		$fields = self::location_source()['fields'];
		return isset( $fields[ $key ] ) && is_string( $fields[ $key ] ) ? sanitize_key( $fields[ $key ] ) : '';
	}

	/**
	 * day => field name.
	 *
	 * @return array<string,string>
	 */
	public static function location_hour_fields(): array {
		$out   = array();
		$hours = self::location_source()['fields']['hours'];
		foreach ( self::DAYS as $day ) {
			$out[ $day ] = isset( $hours[ $day ] ) && is_string( $hours[ $day ] ) ? sanitize_key( $hours[ $day ] ) : $day . '_hours';
		}
		return $out;
	}

	public static function location_value( int $post_id, string $key ): string {
		$field = self::location_field( $key );
		if ( $field === '' ) {
			return '';
		}
		$value = get_post_meta( $post_id, $field, true );
		return is_scalar( $value ) ? trim( (string) preg_replace( '/\s+/u', ' ', wp_strip_all_tags( (string) $value ) ) ) : '';
	}

	/**
	 * The main contact details: this option's own for one location, the main location's for several.
	 *
	 * @return array{phones: array<int,array{number:string,label:string}>, address: array<string,string>, map_url: string, hours: array<string,string>}
	 */
	public static function contact(): array {
		$d = self::get();
		if ( ! self::several() ) {
			return array(
				'phones'  => is_array( $d['phones'] ) ? array_values( $d['phones'] ) : array(),
				'address' => is_array( $d['address'] ) ? array_merge( self::blank()['address'], $d['address'] ) : self::blank()['address'],
				'map_url' => (string) $d['map_url'],
				'hours'   => is_array( $d['hours'] ) ? array_merge( self::blank()['hours'], $d['hours'] ) : self::blank()['hours'],
				'geo'     => self::geo_pair( is_array( $d['geo'] ) ? $d['geo'] : array() ),
			);
		}
		$id    = self::effective_main_location();
		$hours = array();
		foreach ( self::location_hour_fields() as $day => $field ) {
			$value         = get_post_meta( $id, $field, true );
			$hours[ $day ] = is_scalar( $value ) ? trim( wp_strip_all_tags( (string) $value ) ) : '';
		}
		$phone   = self::location_value( $id, 'phone' );
		$country = (string) ( $d['address']['country'] ?? '' );
		return array(
			'phones'  => $phone !== '' ? array( array( 'number' => $phone, 'label' => '' ) ) : array(),
			'address' => self::address_from_line( self::location_value( $id, 'address' ), $country ),
			'map_url' => self::location_value( $id, 'map' ),
			'hours'   => $hours,
			'geo'     => self::location_geo( $id ),
		);
	}

	/**
	 * A latitude (max 90) or longitude (max 180) as a plain decimal string, or '' when it isn't one.
	 *
	 * @param mixed $value Value.
	 */
	public static function coordinate( $value, float $max ): string {
		$value = is_scalar( $value ) ? trim( str_replace( ',', '.', (string) $value ) ) : '';
		if ( $value === '' || ! preg_match( '/^-?\d{1,3}(\.\d{1,10})?$/', $value ) || abs( (float) $value ) > $max ) {
			return '';
		}
		return $value;
	}

	/**
	 * Both coordinates, or both empty.
	 *
	 * @param array<string,mixed> $geo lat/lng.
	 * @return array{lat:string,lng:string}
	 */
	public static function geo_pair( array $geo ): array {
		$lat = self::coordinate( $geo['lat'] ?? '', 90 );
		$lng = self::coordinate( $geo['lng'] ?? '', 180 );
		return ( $lat === '' || $lng === '' ) ? array( 'lat' => '', 'lng' => '' ) : array( 'lat' => $lat, 'lng' => $lng );
	}

	/**
	 * A location post's coordinates through location_source.
	 *
	 * @return array{lat:string,lng:string}
	 */
	public static function location_geo( int $post_id ): array {
		return self::geo_pair(
			array(
				'lat' => self::location_value( $post_id, 'lat' ),
				'lng' => self::location_value( $post_id, 'lng' ),
			)
		);
	}

	/**
	 * A location post's own schema.org type (letters only), or ''.
	 */
	public static function location_type( int $post_id ): string {
		return (string) preg_replace( '/[^A-Za-z]/', '', self::location_value( $post_id, 'type' ) );
	}

	/**
	 * A location post's Google Business Profile link, or ''.
	 */
	public static function location_profile( int $post_id ): string {
		$url = self::location_value( $post_id, 'profile' );
		return preg_match( '#^https?://#i', $url ) && filter_var( $url, FILTER_VALIDATE_URL ) ? esc_url_raw( $url ) : '';
	}

	/**
	 * GeoCoordinates for schema, or an empty array.
	 *
	 * @param array{lat:string,lng:string} $geo Coordinates.
	 * @return array<string,string>
	 */
	public static function geo_schema( array $geo ): array {
		if ( '' === ( $geo['lat'] ?? '' ) || '' === ( $geo['lng'] ?? '' ) ) {
			return array();
		}
		return array(
			'@type'     => 'GeoCoordinates',
			'latitude'  => (string) $geo['lat'],
			'longitude' => (string) $geo['lng'],
		);
	}

	/**
	 * Showroom location posts (several locations only).
	 *
	 * @return array<int, WP_Post>
	 */
	public static function showrooms(): array {
		if ( ! self::several() ) {
			return array();
		}
		return self::showroom_posts();
	}

	/**
	 * "street, city, region postal[, country]" → parts. When unsure, the whole line is the street.
	 *
	 * @return array<string,string>
	 */
	public static function address_from_line( string $line, string $country = '' ): array {
		$out = self::blank()['address'];
		if ( trim( $line ) === '' ) {
			return $out;
		}
		$parsed = Neo_Pulse_Wp_Seo_Locations::parse_address( $line, $country );
		$out['street']      = (string) ( $parsed['streetAddress'] ?? '' );
		$out['city']        = (string) ( $parsed['addressLocality'] ?? '' );
		$out['region']      = (string) ( $parsed['addressRegion'] ?? '' );
		$out['postal_code'] = (string) ( $parsed['postalCode'] ?? '' );
		$out['country']     = (string) ( $parsed['addressCountry'] ?? $country );
		return $out;
	}

	/* ---------- Bridge to Neo Pulse's SEO keys ---------- */

	public static function handles( string $key ): bool {
		return in_array( $key, self::SEO_KEYS, true ) && self::exists();
	}

	/**
	 * A Neo Pulse SEO key's value, in Neo Pulse's format, from the shared option.
	 *
	 * @return mixed
	 */
	public static function seo_value( string $key ) {
		$d = self::get();
		switch ( $key ) {
			case 'knowledgegraph_type':
				return 'person' === $d['type'] ? 'person' : 'company';
			case 'knowledgegraph_name':
				return (string) $d['name'] !== '' ? (string) $d['name'] : Neo_Pulse_Wp_Seo_Vars::decode( (string) get_bloginfo( 'name' ) );
			case 'knowledgegraph_logo_id':
				return (int) $d['logo'] > 0 ? (string) (int) $d['logo'] : '';
			case 'knowledgegraph_logo':
				$url = (int) $d['logo'] > 0 ? wp_get_attachment_url( (int) $d['logo'] ) : '';
				if ( ! is_string( $url ) || $url === '' ) {
					// No logo in the shared details: a logo URL Neo Pulse had that isn't a Media Library
					// image (the shared details store images by ID) still goes in the schema.
					$own = Neo_Pulse_Wp_Seo_Settings::titles();
					$url = isset( $own['knowledgegraph_logo'] ) && is_string( $own['knowledgegraph_logo'] ) ? $own['knowledgegraph_logo'] : '';
				}
				return $url;
			case 'website_alternate_name':
				return (string) $d['alternate_name'];
			case 'legal_name':
				return (string) $d['legal_name'];
			case 'geo_lat':
				return self::contact()['geo']['lat'];
			case 'geo_lng':
				return self::contact()['geo']['lng'];
			case 'local_business_type':
				return (string) $d['business_type'];
			case 'url':
				return (string) $d['url'] !== '' ? (string) $d['url'] : home_url();
			case 'email':
				return (string) $d['email'];
			case 'price_range':
				return (string) $d['price_range'];
			case 'local_address':
				$a   = self::contact()['address'];
				$out = array();
				foreach ( array( 'street' => 'streetAddress', 'city' => 'addressLocality', 'region' => 'addressRegion', 'postal_code' => 'postalCode', 'country' => 'addressCountry' ) as $from => $to ) {
					if ( trim( (string) ( $a[ $from ] ?? '' ) ) !== '' ) {
						$out[ $to ] = trim( (string) $a[ $from ] );
					}
				}
				return $out;
			case 'phone_numbers':
				$out = array();
				foreach ( self::contact()['phones'] as $phone ) {
					if ( is_array( $phone ) && trim( (string) ( $phone['number'] ?? '' ) ) !== '' ) {
						$out[] = array(
							'type'   => 'customer support',
							'number' => trim( (string) $phone['number'] ),
						);
					}
				}
				return $out;
			case 'opening_hours':
				$out = array();
				foreach ( self::contact()['hours'] as $day => $text ) {
					foreach ( Neo_Pulse_Wp_Seo_Locations::parse_hours( (string) $text ) as $range ) {
						$out[] = array(
							'day'  => ucfirst( $day ),
							'time' => $range[0] . '-' . $range[1],
						);
					}
				}
				return $out;
			case 'social_url_facebook':
				return (string) ( $d['social']['facebook'] ?? '' );
			case 'social_additional_profiles':
				$lines = array();
				foreach ( self::SOCIAL as $network ) {
					if ( 'facebook' !== $network && ! empty( $d['social'][ $network ] ) ) {
						$lines[] = (string) $d['social'][ $network ];
					}
				}
				foreach ( (array) $d['other_profiles'] as $url ) {
					if ( is_string( $url ) && $url !== '' ) {
						$lines[] = $url;
					}
				}
				return implode( "\n", array_values( array_unique( $lines ) ) );
		}
		return '';
	}

	/**
	 * Apply Neo Pulse-format SEO changes to shared details.
	 *
	 * @param array<string,mixed> $changes Neo Pulse SEO keys (only the bridged ones are used).
	 * @param array<string,mixed> $details Details to change.
	 * @param array<int,string>   $notes   Messages for the person saving.
	 * @return array<string,mixed>
	 */
	public static function apply_seo_changes( array $changes, array $details, array &$notes = array() ): array {
		$several = 'several' === ( $details['locations'] ?? 'one' ) && (int) ( $details['main_location'] ?? 0 ) > 0;
		foreach ( $changes as $key => $value ) {
			if ( ! in_array( $key, self::SEO_KEYS, true ) ) {
				continue;
			}
			if ( $several && in_array( $key, self::CONTACT_KEYS, true ) ) {
				continue; // Comes from the main location.
			}
			switch ( $key ) {
				case 'knowledgegraph_type':
					$details['type'] = 'person' === $value ? 'person' : 'company';
					break;
				case 'knowledgegraph_name':
					$details['name'] = (string) $value;
					break;
				case 'website_alternate_name':
					$details['alternate_name'] = (string) $value;
					break;
				case 'legal_name':
					$details['legal_name'] = (string) $value;
					break;
				case 'geo_lat':
				case 'geo_lng':
					$geo                                           = is_array( $details['geo'] ?? null ) ? $details['geo'] : array();
					$geo[ 'geo_lat' === $key ? 'lat' : 'lng' ]     = (string) $value;
					$details['geo']                                = $geo;
					break;
				case 'local_business_type':
					$details['business_type'] = (string) $value;
					break;
				case 'url':
				case 'email':
				case 'price_range':
					$details[ $key ] = (string) $value;
					break;
				case 'knowledgegraph_logo':
					$url = trim( (string) $value );
					if ( $url === '' ) {
						$details['logo'] = 0;
					} else {
						$id = (int) attachment_url_to_postid( $url );
						if ( $id > 0 ) {
							$details['logo'] = $id;
						} else {
							$notes[] = __( 'The logo was not changed: pick an image from the Media Library (its URL), since the business details store the image itself.', 'neo-pulse-wp' );
						}
					}
					break;
				case 'local_address':
					$value  = is_array( $value ) ? $value : array();
					$details['address'] = array(
						'street'      => (string) ( $value['streetAddress'] ?? '' ),
						'city'        => (string) ( $value['addressLocality'] ?? '' ),
						'region'      => (string) ( $value['addressRegion'] ?? '' ),
						'postal_code' => (string) ( $value['postalCode'] ?? '' ),
						'country'     => (string) ( $value['addressCountry'] ?? '' ),
					);
					break;
				case 'phone_numbers':
					$old    = is_array( $details['phones'] ?? null ) ? array_values( $details['phones'] ) : array();
					$phones = array();
					foreach ( is_array( $value ) ? array_values( $value ) : array() as $i => $row ) {
						$number = is_array( $row ) ? trim( (string) ( $row['number'] ?? '' ) ) : '';
						if ( $number !== '' ) {
							$phones[] = array(
								'number' => $number,
								'label'  => (string) ( $old[ $i ]['label'] ?? '' ),
							);
						}
					}
					$details['phones'] = $phones;
					break;
				case 'opening_hours':
					$ranges = array_fill_keys( self::DAYS, array() );
					foreach ( is_array( $value ) ? $value : array() as $row ) {
						$day = is_array( $row ) ? strtolower( (string) ( $row['day'] ?? '' ) ) : '';
						if ( isset( $ranges[ $day ] ) && preg_match( '/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/', (string) $row['time'], $m ) ) {
							$ranges[ $day ][] = self::clock( (int) $m[1], (int) $m[2] ) . ' - ' . self::clock( (int) $m[3], (int) $m[4] );
						}
					}
					$any   = array_filter( $ranges );
					$hours = array();
					foreach ( $ranges as $day => $list ) {
						$hours[ $day ] = $list !== array() ? implode( ', ', $list ) : ( $any ? 'Closed' : '' );
					}
					$details['hours'] = $hours;
					break;
				case 'social_url_facebook':
					$details['social']['facebook'] = (string) $value;
					break;
				case 'social_additional_profiles':
					$sorted = self::sort_profiles( preg_split( '/\r\n|\r|\n/', (string) $value ) ?: array() );
					foreach ( self::SOCIAL as $network ) {
						if ( 'facebook' !== $network ) {
							$details['social'][ $network ] = $sorted['social'][ $network ] ?? '';
						}
					}
					if ( '' !== ( $sorted['social']['facebook'] ?? '' ) && '' === (string) ( $details['social']['facebook'] ?? '' ) ) {
						$details['social']['facebook'] = $sorted['social']['facebook'];
					}
					$details['other_profiles'] = $sorted['other'];
					break;
			}
		}
		return $details;
	}

	/**
	 * "08:00" → "8:00 am".
	 */
	public static function clock( int $hour, int $minute ): string {
		$suffix = $hour >= 12 ? 'pm' : 'am';
		$h      = $hour % 12;
		$h      = 0 === $h ? 12 : $h;
		return sprintf( '%d:%02d %s', $h, $minute, $suffix );
	}

	/**
	 * Network for a profile URL by its host ('' = not a known network).
	 */
	public static function network( string $url ): string {
		$host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );
		$host = preg_replace( '/^(www|m|business|web)\./', '', $host );
		$path = strtolower( (string) wp_parse_url( $url, PHP_URL_PATH ) );
		if ( $host === '' ) {
			return '';
		}
		$map = array(
			'facebook'  => array( 'facebook.com', 'fb.com', 'fb.me' ),
			'instagram' => array( 'instagram.com' ),
			'linkedin'  => array( 'linkedin.com' ),
			'x'         => array( 'x.com', 'twitter.com' ),
			'youtube'   => array( 'youtube.com', 'youtu.be' ),
			'tiktok'    => array( 'tiktok.com' ),
			'google'    => array( 'g.page', 'maps.app.goo.gl', 'g.co' ),
		);
		foreach ( $map as $network => $hosts ) {
			if ( in_array( $host, $hosts, true ) ) {
				return $network;
			}
		}
		if ( preg_match( '/(^|\.)pinterest\./', $host ) ) {
			return 'pinterest';
		}
		if ( preg_match( '/(^|\.)houzz\./', $host ) ) {
			return 'houzz';
		}
		if ( ( 'google.com' === $host && 0 === strpos( $path, '/maps' ) ) || ( 'goo.gl' === $host && 0 === strpos( $path, '/maps' ) ) ) {
			return 'google';
		}
		return '';
	}

	/**
	 * Profile URLs sorted into networks (first one per network) and the rest.
	 *
	 * @param array<int,string> $urls URLs.
	 * @return array{social: array<string,string>, other: array<int,string>}
	 */
	public static function sort_profiles( array $urls ): array {
		$social = array_fill_keys( self::SOCIAL, '' );
		$other  = array();
		foreach ( $urls as $url ) {
			$url = esc_url_raw( trim( (string) $url ) );
			if ( $url === '' ) {
				continue;
			}
			$network = self::network( $url );
			if ( $network !== '' && $social[ $network ] === '' ) {
				$social[ $network ] = $url;
			} elseif ( ! in_array( $url, $other, true ) && ! in_array( $url, $social, true ) ) {
				$other[] = $url;
			}
		}
		return array(
			'social' => $social,
			'other'  => $other,
		);
	}

	/* ---------- Saving ---------- */

	/**
	 * Clean details the same way Neo Tools 1.11.0-dev.23 does: known keys cleaned by type, and any
	 * unknown keys kept (cleaned as text) so neither plugin erases fields added by the other.
	 *
	 * @param array<string,mixed> $in Details.
	 * @return array<string,mixed>
	 */
	public static function sanitize( array $in ): array {
		$raw_in = $in;
		$b      = self::blank();
		$in     = array_merge( $b, array_intersect_key( $in, $b ) );
		$txt    = static function ( $v ): string {
			return is_scalar( $v ) ? sanitize_text_field( (string) $v ) : '';
		};
		$out = array(
			'version'        => self::VERSION,
			'updated'        => (int) $in['updated'],
			'updated_by'     => in_array( $in['updated_by'], array( 'neo-tools', 'neo-pulse', 'acf' ), true ) ? $in['updated_by'] : '',
			'type'           => 'person' === $in['type'] ? 'person' : 'company',
			'name'           => $txt( $in['name'] ),
			'alternate_name' => $txt( $in['alternate_name'] ),
			'legal_name'     => $txt( $in['legal_name'] ),
			'business_type'  => (string) preg_replace( '/[^A-Za-z]/', '', (string) $in['business_type'] ),
			'url'            => esc_url_raw( (string) $in['url'] ),
			'email'          => (string) sanitize_email( (string) $in['email'] ),
			'price_range'    => $txt( $in['price_range'] ),
			'logo'           => absint( $in['logo'] ),
			'logo_light'     => absint( $in['logo_light'] ),
			'logo_icon'      => absint( $in['logo_icon'] ),
			'locations'      => 'several' === $in['locations'] ? 'several' : 'one',
			'main_location'  => absint( $in['main_location'] ),
			'phones'         => array(),
			'address'        => array(),
			'map_url'        => esc_url_raw( (string) $in['map_url'] ),
			'geo'            => self::geo_pair( is_array( $in['geo'] ) ? $in['geo'] : array() ),
			'hours'          => array(),
			'hours_line'     => $txt( $in['hours_line'] ),
			'holiday_hours'  => $txt( $in['holiday_hours'] ),
			'social'         => array(),
			'other_profiles' => array(),
			'review_url'     => esc_url_raw( (string) $in['review_url'] ),
			'review_count'   => absint( $in['review_count'] ),
			'location_source' => array(),
		);
		foreach ( is_array( $in['phones'] ) ? $in['phones'] : array() as $row ) {
			if ( is_array( $row ) && $txt( $row['number'] ?? '' ) !== '' ) {
				$out['phones'][] = array(
					'number' => $txt( $row['number'] ),
					'label'  => $txt( $row['label'] ?? '' ),
				);
			}
		}
		$address = is_array( $in['address'] ) ? $in['address'] : array();
		foreach ( $b['address'] as $key => $unused ) {
			$out['address'][ $key ] = $txt( $address[ $key ] ?? '' );
		}
		foreach ( array_diff_key( $address, $b['address'] ) as $extra_k => $extra_v ) {
			$clean_k = sanitize_key( (string) $extra_k );
			if ( '' !== $clean_k ) {
				$out['address'][ $clean_k ] = self::sanitize_unknown_value( $extra_v );
			}
		}
		$hours = is_array( $in['hours'] ) ? $in['hours'] : array();
		foreach ( self::DAYS as $day ) {
			$out['hours'][ $day ] = $txt( $hours[ $day ] ?? '' );
		}
		$social = is_array( $in['social'] ) ? $in['social'] : array();
		foreach ( self::SOCIAL as $network ) {
			$out['social'][ $network ] = esc_url_raw( (string) ( $social[ $network ] ?? '' ) );
		}
		foreach ( array_diff_key( $social, $out['social'] ) as $extra_k => $extra_v ) {
			$clean_k = sanitize_key( (string) $extra_k );
			if ( '' !== $clean_k && is_scalar( $extra_v ) ) {
				$out['social'][ $clean_k ] = esc_url_raw( (string) $extra_v );
			}
		}
		foreach ( is_array( $in['other_profiles'] ) ? $in['other_profiles'] : array() as $url ) {
			$url = esc_url_raw( (string) $url );
			if ( $url !== '' ) {
				$out['other_profiles'][] = $url;
			}
		}
		$src    = is_array( $in['location_source'] ) ? $in['location_source'] : array();
		$def    = self::default_location_source();
		$fields = isset( $src['fields'] ) && is_array( $src['fields'] ) ? $src['fields'] : array();
		$out['location_source'] = array(
			'post_type' => isset( $src['post_type'] ) && sanitize_key( (string) $src['post_type'] ) !== '' ? sanitize_key( (string) $src['post_type'] ) : $def['post_type'],
			'fields'    => array(),
		);
		foreach ( $def['fields'] as $key => $default ) {
			if ( 'hours' === $key ) {
				$given = isset( $fields['hours'] ) && is_array( $fields['hours'] ) ? $fields['hours'] : array();
				foreach ( self::DAYS as $day ) {
					$out['location_source']['fields']['hours'][ $day ] = sanitize_key( (string) ( $given[ $day ] ?? $default[ $day ] ) );
				}
			} else {
				$out['location_source']['fields'][ $key ] = sanitize_key( (string) ( $fields[ $key ] ?? $default ) );
			}
		}
		foreach ( array_diff_key( $fields, $def['fields'] ) as $extra_fk => $extra_fv ) {
			$clean_fk = sanitize_key( (string) $extra_fk );
			if ( '' !== $clean_fk && is_scalar( $extra_fv ) ) {
				$out['location_source']['fields'][ $clean_fk ] = sanitize_key( (string) $extra_fv );
			}
		}
		foreach ( array_diff_key( $raw_in, $b ) as $extra_key => $extra_val ) {
			$clean_key = is_string( $extra_key ) ? preg_replace( '/[^a-zA-Z0-9_-]/', '', $extra_key ) : '';
			if ( is_string( $clean_key ) && '' !== $clean_key && ! array_key_exists( $clean_key, $out ) ) {
				$out[ $clean_key ] = self::sanitize_unknown_value( $extra_val );
			}
		}
		return $out;
	}

	/**
	 * Recursively clean unknown fields as text so future fields from either plugin survive saves.
	 *
	 * @param mixed $value Raw unknown value.
	 * @return mixed
	 */
	private static function sanitize_unknown_value( $value ) {
		if ( is_bool( $value ) || is_int( $value ) || is_float( $value ) ) {
			return $value;
		}
		if ( is_scalar( $value ) ) {
			return sanitize_text_field( (string) $value );
		}
		if ( is_array( $value ) ) {
			$clean = array();
			foreach ( $value as $k => $v ) {
				$ck = is_int( $k ) ? $k : (string) preg_replace( '/[^a-zA-Z0-9_-]/', '', (string) $k );
				if ( '' === $ck && ! is_int( $ck ) ) {
					continue;
				}
				$clean[ $ck ] = self::sanitize_unknown_value( $v );
			}
			return $clean;
		}
		return '';
	}

	/**
	 * Save the details (stamped and cleaned) and tell both plugins.
	 *
	 * @param array<string,mixed> $details Details.
	 */
	public static function save( array $details, string $by = 'neo-pulse' ): array {
		$details['updated']    = time();
		$details['updated_by'] = $by;
		$details               = self::sanitize( $details );
		update_option( self::OPTION, $details, true );
		self::$memo = null;
		/**
		 * Fired after the shared business details are saved by either plugin.
		 *
		 * @param array<string,mixed> $details Details as saved.
		 * @param string              $by      'neo-tools', 'neo-pulse' or 'acf'.
		 */
		do_action( 'neo_business_details_saved', $details, $by );
		return $details;
	}

	/**
	 * Saved from anywhere (Neo Tools included): the schema in cached pages is out of date.
	 *
	 * @param mixed $details Details.
	 * @param mixed $by      Who saved.
	 */
	public static function on_saved( $details = null, $by = '' ): void {
		self::$memo = null;
		if ( class_exists( 'Neo_Pulse_Wp_Seo_Settings' ) && Neo_Pulse_Wp_Seo_Settings::output_active() && class_exists( 'Neo_Pulse_Wp_Cache_Flush' ) ) {
			Neo_Pulse_Wp_Cache_Flush::purge_html_caches();
		}
	}

	/* ---------- First run ---------- */

	public static function neo_tools_active(): bool {
		return defined( 'NDET_VERSION' );
	}

	/**
	 * Details built from Neo Pulse's own SEO settings (used once, when the shared option doesn't exist).
	 *
	 * @return array<string,mixed>
	 */
	public static function from_pulse(): array {
		$S       = 'Neo_Pulse_Wp_Seo_Settings';
		$changes = array();
		foreach ( self::SEO_KEYS as $key ) {
			$changes[ $key ] = $S::get( $key, '' );
		}
		$details = self::blank();
		$notes   = array();
		// The logo goes in by ID. A URL that isn't a Media Library image stays in Neo Pulse's own
		// settings and is still used for the schema (see seo_value()).
		$logo_id = (int) $S::get( 'knowledgegraph_logo_id', 0 );
		if ( $logo_id < 1 && '' !== (string) $changes['knowledgegraph_logo'] ) {
			$logo_id = (int) attachment_url_to_postid( (string) $changes['knowledgegraph_logo'] );
		}
		unset( $changes['knowledgegraph_logo_id'], $changes['knowledgegraph_logo'] );
		$details['logo'] = max( 0, $logo_id );
		// Neo Pulse's URL default is the home URL: only keep one that was actually set.
		if ( (string) $changes['url'] === home_url() ) {
			$changes['url'] = '';
		}
		$details = self::apply_seo_changes( $changes, $details, $notes );
		// X / Twitter username → the X profile, when no X profile was given.
		$handle = ltrim( trim( (string) $S::get( 'twitter_author_names', '' ) ), '@' );
		if ( $handle !== '' && '' === $details['social']['x'] && preg_match( '/^[A-Za-z0-9_]{1,15}$/', $handle ) ) {
			$details['social']['x'] = 'https://x.com/' . $handle;
		}
		return $details;
	}

	/**
	 * Create the shared option from Neo Pulse's values, never over an existing one. Returns false when
	 * it already existed.
	 */
	public static function create_from_pulse(): bool {
		if ( self::exists() ) {
			return false;
		}
		self::save( self::from_pulse(), 'neo-pulse' );
		return true;
	}

	/**
	 * First run: on a site without Neo Tools, Neo Pulse starts the shared details from its own values.
	 * With Neo Tools active, its Business details page does that (it compares Neo Pulse, the old ACF
	 * Contact Information page and WordPress settings), so Neo Pulse only offers a button.
	 */
	public static function maybe_create(): void {
		if ( self::exists() || self::neo_tools_active() || ! current_user_can( 'manage_options' ) || wp_doing_ajax() ) {
			return;
		}
		// Only a working NEO Pulse writes site-wide data.
		if ( ! Neo_Pulse_Wp_License::is_licensed( false ) || ( class_exists( 'Neo_Pulse_Wp_Lock', false ) && Neo_Pulse_Wp_Lock::is_locked() ) ) {
			return;
		}
		self::create_from_pulse();
	}

	public static function handle_create(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to do that.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_CREATE );
		$created = self::create_from_pulse();
		wp_safe_redirect(
			add_query_arg(
				array(
					'page'     => 'neo-pulse-wp-seo',
					'business' => $created ? 'created' : 'exists',
				),
				admin_url( 'admin.php' )
			) . '#npwp-seo-business'
		);
		exit;
	}
}
