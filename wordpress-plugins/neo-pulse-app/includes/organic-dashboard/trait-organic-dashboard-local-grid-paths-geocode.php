<?php
/**
 * Local grid file paths, host and keyword helpers, and server-side geocoding.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Organic_Dashboard_Local_Grid_Trait_Paths_Geocode {

	/**
	 * Sanitize siteId into a safe directory/file slug.
	 */
	public static function safe_key( string $raw ): string {
		$clean = preg_replace( '/[^a-zA-Z0-9_-]/', '-', trim( $raw ) );
		return $clean !== null && $clean !== '' ? substr( $clean, 0, 96 ) : 'default-site';
	}

	private static function index_path( string $site_id ): string {
		$key = self::safe_key( $site_id );
		return Neo_Pulse_App_Data_Paths::file( self::SUBDIR . '/' . $key, 'index.json' );
	}

	private static function profile_path( string $site_id ): string {
		$key = self::safe_key( $site_id );
		return Neo_Pulse_App_Data_Paths::file( self::SUBDIR . '/' . $key, 'profile.json' );
	}

	private static function workspace_path( string $site_id = '' ): string {
		if ( $site_id !== '' ) {
			$site_key = self::safe_key( $site_id );
			return Neo_Pulse_App_Data_Paths::file( self::SUBDIR . '/' . $site_key, 'workspace.json' );
		}
		return Neo_Pulse_App_Data_Paths::file( self::SUBDIR, 'workspace.json' );
	}

	private static function scan_path( string $site_id, string $scan_id ): string {
		$site_key = self::safe_key( $site_id );
		$scan_key = self::safe_key( $scan_id );
		return Neo_Pulse_App_Data_Paths::file( self::SUBDIR . '/' . $site_key, $scan_key . '.json' );
	}

	private static function map_image_path( string $site_id, string $scan_id ): string {
		$site_key = self::safe_key( $site_id );
		$scan_key = self::safe_key( $scan_id );
		return Neo_Pulse_App_Data_Paths::file( self::SUBDIR . '/' . $site_key, $scan_key . '.map.png' );
	}

	private static function normalize_host( string $url_or_host ): string {
		$raw = strtolower( trim( $url_or_host ) );
		if ( $raw === '' ) {
			return '';
		}
		$raw = preg_replace( '#^https?://#', '', $raw );
		$raw = preg_replace( '#^www\.#', '', $raw );
		$parts = explode( '/', (string) $raw );
		return trim( $parts[0] ?? '' );
	}

	/**
	 * Suggest a clean default local keyword from the resolved business category and city.
	 *
	 * @param array<string,mixed> $business Resolved business array.
	 * @param string              $city_fallback Fallback city name.
	 */
	private static function build_suggested_keyword( array $business, string $city_fallback = '' ): string {
		$cat  = strtolower( trim( (string) ( $business['primaryCategory'] ?? '' ) ) );
		$addr = trim( (string) ( $business['address'] ?? '' ) );
		$city = trim( $city_fallback );

		if ( $city === '' && preg_match( '/,\s*([A-Za-z\s.\'-]+),\s*[A-Z]{2}\b/', $addr, $m ) ) {
			$city = trim( $m[1] );
		}

		if ( str_contains( $cat, 'account' ) || str_contains( $cat, 'tax' ) || str_contains( $cat, 'bookkeep' ) ) {
			return $city !== '' ? $city . ' tax advisors' : 'tax advisors near me';
		}
		if ( str_contains( $cat, 'blind' ) || str_contains( $cat, 'window treatment' ) || str_contains( $cat, 'curtain' ) || str_contains( $cat, 'shade' ) ) {
			return 'blinds near me';
		}
		if ( str_contains( $cat, 'dental' ) || str_contains( $cat, 'dentist' ) ) {
			return $city !== '' ? 'dentist ' . $city : 'dentist near me';
		}
		if ( $cat !== '' ) {
			return $city !== '' ? strtolower( $business['primaryCategory'] ) . ' ' . $city : strtolower( $business['primaryCategory'] ) . ' near me';
		}
		return $city !== '' ? $city . ' local business' : 'blinds near me';
	}

	/**
	 * Geocode a street address or city/postal string to exact latitude/longitude on the server.
	 *
	 * @param array<string,mixed> $body Request payload.
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function geocode_address( array $body ): array {
		$address = isset( $body['address'] ) ? trim( (string) $body['address'] ) : '';
		$city    = isset( $body['city'] ) ? trim( (string) $body['city'] ) : '';
		$state   = isset( $body['state'] ) ? trim( (string) $body['state'] ) : '';
		$zip     = isset( $body['zip'] ) ? trim( (string) $body['zip'] ) : '';
		$country = isset( $body['country'] ) ? trim( (string) $body['country'] ) : '';

		// Support direct "lat, lng" coordinate input in the address box
		if ( preg_match( '/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/', $address, $coord_m ) ) {
			$lat = (float) $coord_m[1];
			$lng = (float) $coord_m[2];
			if ( $lat >= -90 && $lat <= 90 && $lng >= -180 && $lng <= 180 ) {
				return array(
					'statusCode' => 200,
					'body'       => array(
						'ok'        => true,
						'latitude'  => $lat,
						'longitude' => $lng,
						'label'     => sprintf( '%.6f, %.6f', $lat, $lng ),
						'source'    => 'coordinates',
					),
				);
			}
		}

		$full_query = $address !== ''
			? $address
			: implode( ', ', array_filter( array( $city, $state, $zip, $country ) ) );

		if ( $full_query === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'Address is required to center the map.',
				),
			);
		}

		$nom = self::nominatim_geocode( $full_query );
		if ( $nom !== null ) {
			return array(
				'statusCode' => 200,
				'body'       => array(
					'ok'        => true,
					'latitude'  => $nom['lat'],
					'longitude' => $nom['lng'],
					'label'     => $nom['label'],
					'source'    => 'nominatim',
				),
			);
		}

		if ( $zip === '' && preg_match( '/\b([A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)\b/', $full_query, $m ) ) {
			$zip = strtoupper( $m[1] );
		} elseif ( $zip === '' && preg_match( '/\b(\d{5})(?:-\d{4})?\b/', $full_query, $m ) ) {
			$zip = $m[1];
		}
		if ( $city === '' && preg_match( '/([A-Za-z][A-Za-z\s.\'-]{1,40}),\s*([A-Z]{2}|Alberta|British Columbia|Manitoba|Ontario|Saskatchewan|Quebec)\b/i', $full_query, $m ) ) {
			$city  = trim( $m[1] );
			$state = $state !== '' ? $state : trim( $m[2] );
		}

		if ( ( $zip !== '' || $city !== '' ) && class_exists( 'Neo_Pulse_App_Postal_Geocode' ) ) {
			$hit = Neo_Pulse_App_Postal_Geocode::lookup(
				array(
					'postalCode'  => $zip,
					'city'        => $city,
					'region'      => $state,
					'countryCode' => $country,
				)
			);
			if ( is_array( $hit ) && isset( $hit['lat'], $hit['lng'] ) ) {
				return array(
					'statusCode' => 200,
					'body'       => array(
						'ok'        => true,
						'latitude'  => (float) $hit['lat'],
						'longitude' => (float) $hit['lng'],
						'label'     => $full_query,
						'source'    => 'postal_centroid',
					),
				);
			}
		}

		if ( Neo_Pulse_App_Dataforseo_Client::has_credentials() ) {
			$res = Neo_Pulse_App_Dataforseo_Client::post(
				'serp/google/maps/live/advanced',
				array(
					array(
						'keyword'       => $full_query,
						'location_code' => 2124,
						'language_code' => 'en',
						'depth'         => 5,
						'search_places' => true,
					),
				),
				array( 'timeout' => 30000 )
			);
			if ( ! is_wp_error( $res ) ) {
				$cands = self::extract_business_candidates( $res );
				if ( ! empty( $cands[0]['latitude'] ) && ! empty( $cands[0]['longitude'] ) ) {
					return array(
						'statusCode' => 200,
						'body'       => array(
							'ok'        => true,
							'latitude'  => (float) $cands[0]['latitude'],
							'longitude' => (float) $cands[0]['longitude'],
							'label'     => $cands[0]['address'] ?: $full_query,
							'source'    => 'dataforseo_maps',
						),
					);
				}
			}
		}

		return array(
			'statusCode' => 404,
			'body'       => array(
				'ok'    => false,
				'error' => 'Could not resolve coordinates for "' . $full_query . '".',
			),
		);
	}

	/**
	 * Fast street-level geocoding via OpenStreetMap Nominatim.
	 *
	 * @return array{lat:float,lng:float,label:string}|null
	 */
	private static function nominatim_geocode( string $query ): ?array {
		$q = trim( $query );
		if ( $q === '' ) {
			return null;
		}
		$url = 'https://nominatim.openstreetmap.org/search?' . http_build_query(
			array(
				'format' => 'jsonv2',
				'limit'  => 1,
				'q'      => $q,
			)
		);
		$resp = wp_remote_get(
			$url,
			array(
				'timeout' => 5,
				'headers' => array(
					'User-Agent' => 'NeoPulseLocalGridStudio/1.0 (https://neodigital.ca)',
					'Accept'     => 'application/json',
				),
			)
		);
		if ( is_wp_error( $resp ) || (int) wp_remote_retrieve_response_code( $resp ) !== 200 ) {
			return null;
		}
		$decoded = json_decode( (string) wp_remote_retrieve_body( $resp ), true );
		if ( ! is_array( $decoded ) || empty( $decoded[0] ) || ! is_array( $decoded[0] ) ) {
			return null;
		}
		$first = $decoded[0];
		if ( ! isset( $first['lat'], $first['lon'] ) || ! is_numeric( $first['lat'] ) || ! is_numeric( $first['lon'] ) ) {
			return null;
		}
		return array(
			'lat'   => (float) $first['lat'],
			'lng'   => (float) $first['lon'],
			'label' => isset( $first['display_name'] ) ? (string) $first['display_name'] : $q,
		);
	}
}
