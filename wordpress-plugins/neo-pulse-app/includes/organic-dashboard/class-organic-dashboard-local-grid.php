<?php
/**
 * Server-side DataForSEO Google Maps Local Grid Studio service and scan storage.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Organic_Dashboard_Local_Grid {

	const SUBDIR = 'local-grid';

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

	/**
	 * Resolve a connected site's Google Maps business profile and coordinates automatically.
	 *
	 * @param array<string,mixed> $body Request payload.
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function resolve_business( array $body ): array {
		$site_id       = isset( $body['siteId'] ) ? trim( (string) $body['siteId'] ) : '';
		$force_refresh = ! empty( $body['forceRefresh'] );

		if ( $site_id !== '' && ! $force_refresh && empty( $body['query'] ) ) {
			$cached = Neo_Pulse_App_Json_File_Store::read( self::profile_path( $site_id ) );
			if ( is_array( $cached ) && ! empty( $cached['business']['latitude'] ) && ! empty( $cached['business']['longitude'] ) ) {
				return array(
					'statusCode' => 200,
					'body'       => array(
						'ok'               => true,
						'cached'           => true,
						'business'         => $cached['business'],
						'candidates'       => $cached['candidates'] ?? array( $cached['business'] ),
						'suggestedKeyword' => $cached['suggestedKeyword'] ?? 'blinds near me',
					),
				);
			}
		}

		if ( ! Neo_Pulse_App_Dataforseo_Client::has_credentials() ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'DataForSEO credentials are not configured on the server.',
				),
			);
		}

		$site_name  = isset( $body['siteName'] ) ? trim( (string) $body['siteName'] ) : '';
		$nap_name   = isset( $body['napName'] ) ? trim( (string) $body['napName'] ) : '';
		$site_url   = isset( $body['siteUrl'] ) ? trim( (string) $body['siteUrl'] ) : '';
		$want_host  = self::normalize_host( $site_url );
		$gbp_id     = isset( $body['gbpLocationId'] ) ? trim( (string) $body['gbpLocationId'] ) : '';
		$city       = isset( $body['city'] ) ? trim( (string) $body['city'] ) : '';
		$state      = isset( $body['state'] ) ? trim( (string) $body['state'] ) : '';
		$zip        = isset( $body['zip'] ) ? trim( (string) $body['zip'] ) : '';
		$country    = isset( $body['country'] ) ? trim( (string) $body['country'] ) : '';
		$address    = isset( $body['address'] ) ? trim( (string) $body['address'] ) : '';
		$query      = isset( $body['query'] ) ? trim( (string) $body['query'] ) : '';
		$loc_name   = isset( $body['locationName'] ) ? trim( (string) $body['locationName'] ) : '';
		$loc_coord  = isset( $body['locationCoordinate'] ) ? trim( (string) $body['locationCoordinate'] ) : '';
		$lang       = Neo_Pulse_App_Dataforseo_Client::ensure_language_code( $body['languageCode'] ?? 'en' );

		if ( $zip === '' && $address !== '' ) {
			if ( preg_match( '/\b([A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)\b/', $address, $m ) ) {
				$zip = strtoupper( $m[1] );
			} elseif ( preg_match( '/\b(\d{5})(?:-\d{4})?\b/', $address, $m ) ) {
				$zip = $m[1];
			}
		}
		if ( $city === '' && $address !== '' && preg_match( '/([A-Za-z][A-Za-z\s.\'-]{1,40}),\s*([A-Z]{2}|Alberta|British Columbia|Manitoba|Ontario|Saskatchewan|Quebec)\b/i', $address, $m ) ) {
			$city  = trim( $m[1] );
			$state = $state !== '' ? $state : trim( $m[2] );
		}

		// Try live homepage JSON-LD extraction if we still lack city/zip/coord and have siteUrl
		if ( $loc_coord === '' && $city === '' && $zip === '' && $site_url !== '' && class_exists( 'Neo_Pulse_App_Seo_Http' ) && class_exists( 'Neo_Pulse_App_Local_Business_Schema_Extract' ) ) {
			$parsed_url = Neo_Pulse_App_Seo_Http::safe_parse_url( $site_url );
			if ( $parsed_url ) {
				$html_res = Neo_Pulse_App_Seo_Http::fetch_html( $parsed_url, 8 );
				if ( ! empty( $html_res['ok'] ) && ! empty( $html_res['html'] ) ) {
					$extracted = Neo_Pulse_App_Local_Business_Schema_Extract::extract_local_business_address_from_html( (string) $html_res['html'] );
					if ( is_array( $extracted ) ) {
						if ( ! empty( $extracted['lat'] ) && ! empty( $extracted['lng'] ) ) {
							$loc_coord = sprintf( '%.6f,%.6f,12z', (float) $extracted['lat'], (float) $extracted['lng'] );
						}
						if ( ! empty( $extracted['label'] ) && $address === '' ) {
							$address = (string) $extracted['label'];
							if ( preg_match( '/\b([A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d)\b/', $address, $m ) ) {
								$zip = strtoupper( $m[1] );
							}
							if ( preg_match( '/([A-Za-z][A-Za-z\s.\'-]{1,40}),\s*([A-Z]{2})\b/', $address, $m ) ) {
								$city  = trim( $m[1] );
								$state = trim( $m[2] );
							}
						}
					}
				}
			}
		}

		if ( $loc_coord === '' && $address !== '' ) {
			$nom = self::nominatim_geocode( $address );
			if ( $nom !== null ) {
				$loc_coord = sprintf( '%.6f,%.6f,13z', $nom['lat'], $nom['lng'] );
			}
		}

		if ( $loc_coord === '' && ( $zip !== '' || $city !== '' ) && class_exists( 'Neo_Pulse_App_Postal_Geocode' ) ) {
			$cc = $country !== '' ? $country : ( str_ends_with( $want_host, '.ca' ) ? 'CA' : '' );
			$geo_hit = Neo_Pulse_App_Postal_Geocode::lookup(
				array(
					'postalCode'  => $zip,
					'city'        => $city,
					'region'      => $state,
					'countryCode' => $cc,
				)
			);
			if ( is_array( $geo_hit ) && isset( $geo_hit['lat'], $geo_hit['lng'] ) ) {
				$loc_coord = sprintf( '%.6f,%.6f,12z', (float) $geo_hit['lat'], (float) $geo_hit['lng'] );
				if ( $city === '' && ! empty( $geo_hit['placeName'] ) ) {
					$city = (string) $geo_hit['placeName'];
				}
			}
		}

		if ( $query === '' ) {
			if ( $gbp_id !== '' && preg_match( '/^\d+$/', $gbp_id ) ) {
				$query = 'cid:' . $gbp_id;
			} else {
				$base_name = $nap_name !== '' ? $nap_name : $site_name;
				$loc_suffix = $address !== '' ? $address : $city;
				$query     = trim( $base_name . ( $loc_suffix !== '' ? ' ' . $loc_suffix : '' ) );
				if ( $query === '' && $want_host !== '' ) {
					$query = $want_host;
				}
			}
		}

		if ( $query === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'Connected site has no name or URL to resolve.',
				),
			);
		}

		$is_id_lookup = str_starts_with( $query, 'cid:' ) || str_starts_with( $query, 'place_id:' );

		if ( $is_id_lookup ) {
			$gmb_body = array(
				'keyword'       => $query,
				'language_code' => $lang,
			);
			if ( $loc_coord !== '' ) {
				$gmb_body['location_coordinate'] = $loc_coord;
			} elseif ( $loc_name !== '' ) {
				$gmb_body['location_name'] = $loc_name;
			} else {
				$gmb_body['location_name'] = str_ends_with( $want_host, '.ca' ) ? 'Canada' : 'United States';
			}

			$res = Neo_Pulse_App_Dataforseo_Mcp_Router::dispatch(
				'DataForSEO_business_data_google_my_business_info_live',
				$gmb_body
			);
			if ( ! is_wp_error( $res ) ) {
				$candidates = self::extract_business_candidates( $res );
				if ( ! empty( $candidates ) ) {
					$chosen    = self::pick_best_candidate_for_host( $candidates, $want_host );
					$suggested = self::build_suggested_keyword( $chosen, $city );
					self::maybe_cache_profile( $site_id, $chosen, $candidates, $suggested );
					return array(
						'statusCode' => 200,
						'body'       => array(
							'ok'               => true,
							'business'         => $chosen,
							'candidates'       => $candidates,
							'suggestedKeyword' => $suggested,
						),
					);
				}
			}
		}

		$task = array(
			'keyword'       => $query,
			'language_code' => $lang,
			'depth'         => 15,
			'search_places' => true,
		);
		if ( $loc_coord !== '' ) {
			$task['location_coordinate'] = $loc_coord;
		} elseif ( $loc_name !== '' && isset( Neo_Pulse_App_Dataforseo_Client::LOCATION_MAP[ $loc_name ] ) ) {
			$task['location_code'] = Neo_Pulse_App_Dataforseo_Client::LOCATION_MAP[ $loc_name ];
		} else {
			$inferred_country = str_ends_with( $want_host, '.ca' ) ? 'Canada' : 'United States';
			$task['location_code'] = Neo_Pulse_App_Dataforseo_Client::location_code_from_name(
				$loc_name !== '' ? $loc_name : $inferred_country
			);
		}

		$res = Neo_Pulse_App_Dataforseo_Client::post(
			'serp/google/maps/live/advanced',
			array( $task ),
			array( 'timeout' => 90000 )
		);
		if ( is_wp_error( $res ) ) {
			return array(
				'statusCode' => 502,
				'body'       => array(
					'ok'    => false,
					'error' => $res->get_error_message(),
				),
			);
		}

		$candidates = self::extract_business_candidates( $res );
		$chosen     = self::pick_best_candidate_for_host( $candidates, $want_host );

		// If we have a target website domain and the initial Maps search didn't find a matching domain, query with the domain directly
		if ( $want_host !== '' && ( $chosen === null || ! self::candidate_matches_host( $chosen, $want_host ) ) ) {
			$domain_task            = $task;
			$domain_task['keyword'] = trim( ( $site_name !== '' ? $site_name . ' ' : '' ) . $want_host );
			$res2                   = Neo_Pulse_App_Dataforseo_Client::post(
				'serp/google/maps/live/advanced',
				array( $domain_task ),
				array( 'timeout' => 90000 )
			);
			if ( ! is_wp_error( $res2 ) ) {
				$domain_candidates = self::extract_business_candidates( $res2 );
				if ( ! empty( $domain_candidates ) ) {
					$candidates = array_merge( $domain_candidates, $candidates );
					$chosen     = self::pick_best_candidate_for_host( $candidates, $want_host );
				}
			}
		}

		$suggested = $chosen ? self::build_suggested_keyword( $chosen, $city ) : ( $city !== '' ? $city . ' local search' : 'blinds near me' );
		if ( $chosen && $site_id !== '' ) {
			self::maybe_cache_profile( $site_id, $chosen, $candidates, $suggested );
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'               => true,
				'business'         => $chosen,
				'candidates'       => $candidates,
				'suggestedKeyword' => $suggested,
			),
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $candidates
	 * @return array<string,mixed>|null
	 */
	private static function pick_best_candidate_for_host( array $candidates, string $want_host ): ?array {
		if ( empty( $candidates ) ) {
			return null;
		}
		if ( $want_host !== '' ) {
			foreach ( $candidates as $c ) {
				if ( self::candidate_matches_host( $c, $want_host ) ) {
					return $c;
				}
			}
		}
		return $candidates[0];
	}

	/**
	 * @param array<string,mixed> $candidate
	 */
	private static function candidate_matches_host( array $candidate, string $want_host ): bool {
		if ( $want_host === '' ) {
			return false;
		}
		$cand_host = self::normalize_host( (string) ( $candidate['websiteUrl'] ?? '' ) );
		if ( $cand_host === '' ) {
			return false;
		}
		return $cand_host === $want_host || str_ends_with( $cand_host, '.' . $want_host ) || str_ends_with( $want_host, '.' . $cand_host );
	}

	/**
	 * @param array<string,mixed>            $business
	 * @param array<int,array<string,mixed>> $candidates
	 */
	private static function maybe_cache_profile( string $site_id, array $business, array $candidates, string $suggested_keyword ): void {
		if ( $site_id === '' ) {
			return;
		}
		Neo_Pulse_App_Json_File_Store::write(
			self::profile_path( $site_id ),
			array(
				'siteId'           => $site_id,
				'updatedAt'        => gmdate( 'c' ),
				'business'         => $business,
				'candidates'       => array_slice( $candidates, 0, 10 ),
				'suggestedKeyword' => $suggested_keyword,
			)
		);
	}

	/**
	 * Run a batch of coordinate points (1 center pin by default, up to 10 per batch) against DataForSEO Maps Live.
	 *
	 * @param array<string,mixed> $body Request payload.
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function scan_batch( array $body ): array {
		if ( ! Neo_Pulse_App_Dataforseo_Client::has_credentials() ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'DataForSEO credentials are not configured on the server.',
				),
			);
		}

		$keyword = isset( $body['keyword'] ) ? trim( (string) $body['keyword'] ) : '';
		$points  = isset( $body['points'] ) && is_array( $body['points'] ) ? array_slice( $body['points'], 0, 10 ) : array();
		$zoom    = isset( $body['zoom'] ) && is_numeric( $body['zoom'] ) ? max( 10, min( 20, (int) $body['zoom'] ) ) : 14;
		$lang    = Neo_Pulse_App_Dataforseo_Client::ensure_language_code( $body['languageCode'] ?? 'en' );

		if ( $keyword === '' || empty( $points ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'Keyword and at least one coordinate point are required.',
				),
			);
		}

		$valid_points = array();
		foreach ( $points as $pt ) {
			if ( ! is_array( $pt ) ) {
				continue;
			}
			$lat = isset( $pt['latitude'] ) && is_numeric( $pt['latitude'] ) ? (float) $pt['latitude'] : null;
			$lng = isset( $pt['longitude'] ) && is_numeric( $pt['longitude'] ) ? (float) $pt['longitude'] : null;
			if ( $lat === null || $lng === null || $lat < -90 || $lat > 90 || $lng < -180 || $lng > 180 ) {
				continue;
			}
			$valid_points[] = array(
				'pointId'            => isset( $pt['pointId'] ) ? (string) $pt['pointId'] : sprintf( '%.5f_%.5f', $lat, $lng ),
				'row'                => isset( $pt['row'] ) ? (int) $pt['row'] : 0,
				'col'                => isset( $pt['col'] ) ? (int) $pt['col'] : 0,
				'latitude'           => $lat,
				'longitude'          => $lng,
				'distanceFromCenter' => isset( $pt['distanceFromCenter'] ) && is_numeric( $pt['distanceFromCenter'] )
					? (float) $pt['distanceFromCenter']
					: 0.0,
			);
		}

		if ( empty( $valid_points ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'No valid latitude/longitude coordinates in points batch.',
				),
			);
		}

		$raw_responses = self::execute_maps_tasks( $keyword, $lang, $zoom, $valid_points );
		$results       = array();

		foreach ( $valid_points as $idx => $pt ) {
			$raw = $raw_responses[ $idx ] ?? null;
			if ( is_wp_error( $raw ) ) {
				$results[] = array(
					'pointId'            => $pt['pointId'],
					'row'                => $pt['row'],
					'col'                => $pt['col'],
					'latitude'           => $pt['latitude'],
					'longitude'          => $pt['longitude'],
					'distanceFromCenter' => $pt['distanceFromCenter'],
					'error'              => $raw->get_error_message(),
					'items'              => array(),
				);
				continue;
			}

			$check = is_array( $raw ) ? Neo_Pulse_App_Dataforseo_Client::assert_task_ok( $raw, true ) : new WP_Error( 'dfs_empty', 'Empty response' );
			if ( is_wp_error( $check ) ) {
				$results[] = array(
					'pointId'            => $pt['pointId'],
					'row'                => $pt['row'],
					'col'                => $pt['col'],
					'latitude'           => $pt['latitude'],
					'longitude'          => $pt['longitude'],
					'distanceFromCenter' => $pt['distanceFromCenter'],
					'error'              => $check->get_error_message(),
					'items'              => array(),
				);
				continue;
			}

			$results[] = array(
				'pointId'            => $pt['pointId'],
				'row'                => $pt['row'],
				'col'                => $pt['col'],
				'latitude'           => $pt['latitude'],
				'longitude'          => $pt['longitude'],
				'distanceFromCenter' => $pt['distanceFromCenter'],
				'error'              => null,
				'items'              => self::extract_serp_pin_items( $raw ),
			);
		}

		$all_failed  = true;
		$first_error = '';
		foreach ( $results as $r ) {
			if ( empty( $r['error'] ) ) {
				$all_failed = false;
				break;
			}
			if ( $first_error === '' ) {
				$first_error = (string) $r['error'];
			}
		}

		if ( $all_failed && $first_error !== '' ) {
			return array(
				'statusCode' => 422,
				'body'       => array(
					'ok'    => false,
					'error' => $first_error,
				),
			);
		}

		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'      => true,
				'keyword' => $keyword,
				'results' => $results,
			),
		);
	}

	/**
	 * Execute one or multiple DataForSEO Maps SERP tasks (parallel when > 1).
	 *
	 * @param string                         $keyword Keyword.
	 * @param string                         $lang    Language code.
	 * @param int                            $zoom    Map zoom (e.g. 15).
	 * @param array<int,array<string,mixed>> $points  Validated points.
	 * @return array<int,array<string,mixed>|WP_Error>
	 */
	private static function execute_maps_tasks( string $keyword, string $lang, int $zoom, array $points ): array {
		$endpoint = 'serp/google/maps/live/advanced';
		if ( count( $points ) === 1 ) {
			$pt   = $points[0];
			$task = array(
				'keyword'             => $keyword,
				'location_coordinate' => sprintf( '%.7f,%.7f,%dz', $pt['latitude'], $pt['longitude'], $zoom ),
				'language_code'       => $lang,
				'depth'               => 20,
				'search_this_area'    => false,
			);
			return array( Neo_Pulse_App_Dataforseo_Client::post( $endpoint, array( $task ), array( 'timeout' => 90000 ) ) );
		}

		$creds   = Neo_Pulse_App_Dataforseo_Client::credentials();
		$url     = Neo_Pulse_App_Dataforseo_Client::API_BASE . '/' . $endpoint;
		$headers = array(
			'Authorization' => 'Basic ' . base64_encode( $creds['login'] . ':' . $creds['password'] ),
			'Content-Type'  => 'application/json; charset=utf-8',
			'Accept'        => 'application/json',
		);

		if ( class_exists( 'WpOrg\Requests\Requests' ) ) {
			$requests = array();
			foreach ( $points as $idx => $pt ) {
				$task = array(
					'keyword'             => $keyword,
					'location_coordinate' => sprintf( '%.7f,%.7f,%dz', $pt['latitude'], $pt['longitude'], $zoom ),
					'language_code'       => $lang,
					'depth'               => 20,
					'search_this_area'    => false,
				);
				$requests[ $idx ] = array(
					'url'     => $url,
					'headers' => $headers,
					'data'    => wp_json_encode( array( $task ) ),
					'type'    => 'POST',
					'options' => array( 'timeout' => 90 ),
				);
			}

			$multi = \WpOrg\Requests\Requests::request_multiple( $requests );

			// Retry batch with server_dataforseo_credentials if browser-supplied key returned 40100
			$first_resp    = $multi[0] ?? null;
			$first_decoded = ( is_object( $first_resp ) && isset( $first_resp->body ) ) ? json_decode( (string) $first_resp->body, true ) : null;
			$is_auth_err   = ( is_object( $first_resp ) && (int) ( $first_resp->status_code ?? 0 ) === 401 )
				|| ( is_array( $first_decoded ) && ( (int) ( $first_decoded['status_code'] ?? 0 ) === 40100 || (int) ( $first_decoded['tasks'][0]['status_code'] ?? 0 ) === 40100 ) );

			if ( $is_auth_err && method_exists( 'Neo_Pulse_App_Secrets', 'server_dataforseo_credentials' ) ) {
				$server_creds = Neo_Pulse_App_Secrets::server_dataforseo_credentials();
				if ( $server_creds['login'] !== '' && $server_creds['password'] !== '' ) {
					$retry_headers = array(
						'Authorization' => 'Basic ' . base64_encode( $server_creds['login'] . ':' . $server_creds['password'] ),
						'Content-Type'  => 'application/json; charset=utf-8',
						'Accept'        => 'application/json',
					);
					foreach ( $requests as $idx => $_req ) {
						$requests[ $idx ]['headers'] = $retry_headers;
					}
					$multi = \WpOrg\Requests\Requests::request_multiple( $requests );
				}
			}

			$out = array();
			foreach ( $points as $idx => $_pt ) {
				$resp = $multi[ $idx ] ?? null;
				if ( is_object( $resp ) && isset( $resp->body, $resp->status_code ) ) {
					$code    = (int) $resp->status_code;
					$decoded = json_decode( (string) $resp->body, true );
					if ( $code >= 200 && $code < 300 && is_array( $decoded ) ) {
						$out[ $idx ] = $decoded;
					} else {
						$msg = is_array( $decoded ) && ! empty( $decoded['status_message'] )
							? (string) $decoded['status_message']
							: sprintf( 'HTTP %d', $code );
						$out[ $idx ] = new WP_Error( 'neo-pulse_dfs_http', $msg );
					}
				} else {
					$msg         = is_object( $resp ) && method_exists( $resp, 'getMessage' ) ? $resp->getMessage() : 'Request failed';
					$out[ $idx ] = new WP_Error( 'neo-pulse_dfs_req', $msg );
				}
			}
			return $out;
		}

		$out = array();
		foreach ( $points as $idx => $pt ) {
			$task = array(
				'keyword'             => $keyword,
				'location_coordinate' => sprintf( '%.7f,%.7f,%dz', $pt['latitude'], $pt['longitude'], $zoom ),
				'language_code'       => $lang,
				'depth'               => 20,
				'search_this_area'    => false,
			);
			$out[ $idx ] = Neo_Pulse_App_Dataforseo_Client::post( $endpoint, array( $task ), array( 'timeout' => 90000 ) );
		}
		return $out;
	}

	/**
	 * Extract top-20 `maps_search` items from a DataForSEO Maps SERP response.
	 *
	 * @param array<string,mixed> $raw DataForSEO response.
	 * @return array<int,array<string,mixed>>
	 */
	private static function extract_serp_pin_items( array $raw ): array {
		$items = $raw['tasks'][0]['result'][0]['items'] ?? array();
		if ( ! is_array( $items ) ) {
			return array();
		}

		$out  = array();
		$rank = 0;
		foreach ( $items as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$type = isset( $item['type'] ) ? (string) $item['type'] : '';
			if ( $type !== 'maps_search' && $type !== 'google_business_info' ) {
				continue;
			}
			$rank++;
			if ( $rank > 20 ) {
				break;
			}
			$cid        = isset( $item['cid'] ) ? trim( (string) $item['cid'] ) : '';
			$g_place    = isset( $item['place_id'] ) ? trim( (string) $item['place_id'] ) : '';
			$place_id   = $cid !== '' ? $cid : $g_place;
			$add_cats   = isset( $item['additional_categories'] ) && is_array( $item['additional_categories'] )
				? implode( ', ', array_filter( array_map( 'strval', $item['additional_categories'] ) ) )
				: '';
			$rating_val = isset( $item['rating']['value'] ) && is_numeric( $item['rating']['value'] )
				? (float) $item['rating']['value']
				: null;
			$votes_cnt  = isset( $item['rating']['votes_count'] ) && is_numeric( $item['rating']['votes_count'] )
				? (int) $item['rating']['votes_count']
				: null;
			$domain     = isset( $item['domain'] ) ? trim( (string) $item['domain'] ) : '';
			$url        = isset( $item['url'] ) ? trim( (string) $item['url'] ) : '';
			$web_url    = $domain !== '' ? $domain : $url;

			$out[] = array(
				'rank'                => isset( $item['rank_group'] ) && (int) $item['rank_group'] > 0 ? (int) $item['rank_group'] : $rank,
				'business'            => trim( (string) ( $item['title'] ?? $item['original_title'] ?? '' ) ),
				'address'             => trim( (string) ( $item['address'] ?? '' ) ),
				'placeId'             => $place_id,
				'cid'                 => $cid,
				'googlePlaceId'       => $g_place,
				'websiteUrl'          => $web_url,
				'primaryCategory'     => trim( (string) ( $item['category'] ?? '' ) ),
				'secondaryCategories' => $add_cats,
				'rating'              => $rating_val,
				'reviews'             => $votes_cnt,
				'googleUrl'           => $cid !== '' ? 'https://www.google.com/maps?cid=' . $cid : 'https://www.google.com/maps?cid=',
				'itemLat'             => isset( $item['latitude'] ) && is_numeric( $item['latitude'] ) ? (float) $item['latitude'] : null,
				'itemLng'             => isset( $item['longitude'] ) && is_numeric( $item['longitude'] ) ? (float) $item['longitude'] : null,
			);
		}
		return $out;
	}

	/**
	 * Extract business profile candidates for lookup.
	 *
	 * @param array<string,mixed> $raw DataForSEO response.
	 * @return array<int,array<string,mixed>>
	 */
	private static function extract_business_candidates( array $raw ): array {
		$pin_items  = self::extract_serp_pin_items( $raw );
		$candidates = array();
		foreach ( $pin_items as $item ) {
			if ( $item['business'] === '' ) {
				continue;
			}
			$candidates[] = array(
				'business'            => $item['business'],
				'address'             => $item['address'],
				'placeId'             => $item['placeId'],
				'cid'                 => $item['cid'],
				'googlePlaceId'       => $item['googlePlaceId'],
				'websiteUrl'          => $item['websiteUrl'],
				'primaryCategory'     => $item['primaryCategory'],
				'secondaryCategories' => $item['secondaryCategories'],
				'rating'              => $item['rating'],
				'reviews'             => $item['reviews'],
				'latitude'            => $item['itemLat'],
				'longitude'           => $item['itemLng'],
			);
		}
		return $candidates;
	}

	/**
	 * @param string $site_id Optional site ID for client-scoped workspace.
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function load_workspace( string $site_id = '' ): array {
		$site_id = trim( $site_id );
		$path    = self::workspace_path( $site_id );
		$data    = Neo_Pulse_App_Json_File_Store::read( $path );
		if ( ! is_array( $data ) && $site_id !== '' ) {
			// Fallback to legacy global workspace if client-specific does not exist yet
			$global_data = Neo_Pulse_App_Json_File_Store::read( self::workspace_path() );
			if ( is_array( $global_data ) && ! empty( $global_data['panels'] ) ) {
				$site_panels = array_values(
					array_filter(
						$global_data['panels'],
						function ( $p ) use ( $site_id ) {
							return is_array( $p ) && ( $p['siteId'] ?? '' ) === $site_id;
						}
					)
				);
				if ( ! empty( $site_panels ) ) {
					$data = array(
						'version'       => 1,
						'updatedAt'     => gmdate( 'c' ),
						'activePanelId' => $site_panels[0]['id'] ?? '',
						'panels'        => $site_panels,
					);
				}
			}
		}
		if ( ! is_array( $data ) ) {
			return array(
				'statusCode' => 200,
				'body'       => array(
					'ok'        => true,
					'workspace' => null,
				),
			);
		}
		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'        => true,
				'workspace' => $data,
			),
		);
	}

	/**
	 * @param array<string,mixed> $body Request payload.
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function save_workspace( array $body ): array {
		$site_id   = isset( $body['siteId'] ) ? trim( (string) $body['siteId'] ) : '';
		$workspace = isset( $body['workspace'] ) && is_array( $body['workspace'] ) ? $body['workspace'] : null;
		if ( $workspace === null ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'workspace object is required.',
				),
			);
		}
		if ( ( $workspace['version'] ?? null ) !== 1 ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'Unsupported workspace version.',
				),
			);
		}
		$panels = isset( $workspace['panels'] ) && is_array( $workspace['panels'] ) ? $workspace['panels'] : array();
		if ( empty( $panels ) || count( $panels ) > 12 ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'Workspace must include 1–12 panels.',
				),
			);
		}
		$active_panel_id = isset( $workspace['activePanelId'] ) ? trim( (string) $workspace['activePanelId'] ) : '';
		$normalized      = array();
		foreach ( $panels as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$id = isset( $row['id'] ) ? trim( (string) $row['id'] ) : '';
			if ( $id === '' ) {
				continue;
			}
			$row_site_id = isset( $row['siteId'] ) ? trim( (string) $row['siteId'] ) : '';
			if ( $row_site_id === '' ) {
				continue;
			}
			if ( $site_id === '' ) {
				$site_id = $row_site_id;
			}
			$normalized[] = array(
				'id'             => substr( $id, 0, 64 ),
				'siteId'         => substr( $row_site_id, 0, 96 ),
				'layoutLocked'   => ! empty( $row['layoutLocked'] ),
				'layoutSnapshot' => isset( $row['layoutSnapshot'] ) && is_array( $row['layoutSnapshot'] ) ? $row['layoutSnapshot'] : null,
			);
		}
		if ( empty( $normalized ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'No valid panels in workspace.',
				),
			);
		}
		$active_ok = false;
		foreach ( $normalized as $panel ) {
			if ( $panel['id'] === $active_panel_id ) {
				$active_ok = true;
				break;
			}
		}
		if ( ! $active_ok ) {
			$active_panel_id = $normalized[0]['id'];
		}
		$doc = array(
			'version'       => 1,
			'updatedAt'     => gmdate( 'c' ),
			'activePanelId' => $active_panel_id,
			'panels'        => $normalized,
		);
		Neo_Pulse_App_Json_File_Store::write( self::workspace_path( $site_id ), $doc );
		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'        => true,
				'workspace' => $doc,
			),
		);
	}

	public static function list_history( string $site_id ): array {
		$site_id = trim( $site_id );
		if ( $site_id === '' ) {
			return array( 'statusCode' => 400, 'body' => array( 'ok' => false, 'error' => 'siteId is required.' ) );
		}
		$index = Neo_Pulse_App_Json_File_Store::read( self::index_path( $site_id ) );
		$scans = is_array( $index ) && isset( $index['scans'] ) && is_array( $index['scans'] ) ? $index['scans'] : array();
		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'    => true,
				'scans' => array_values( $scans ),
			),
		);
	}

	public static function load_scan( string $site_id, string $scan_id ): array {
		$site_id = trim( $site_id );
		$scan_id = trim( $scan_id );
		if ( $site_id === '' || $scan_id === '' ) {
			return array( 'statusCode' => 400, 'body' => array( 'ok' => false, 'error' => 'siteId and scanId are required.' ) );
		}
		$doc = Neo_Pulse_App_Json_File_Store::read( self::scan_path( $site_id, $scan_id ) );
		if ( ! is_array( $doc ) ) {
			return array( 'statusCode' => 404, 'body' => array( 'ok' => false, 'error' => 'Scan not found.' ) );
		}
		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'   => true,
				'scan' => $doc,
			),
		);
	}

	public static function save_scan( array $body ): array {
		$site_id = isset( $body['siteId'] ) ? trim( (string) $body['siteId'] ) : '';
		$scan    = isset( $body['scan'] ) && is_array( $body['scan'] ) ? $body['scan'] : null;
		if ( $site_id === '' || $scan === null || empty( $scan['scanId'] ) ) {
			return array( 'statusCode' => 400, 'body' => array( 'ok' => false, 'error' => 'siteId and scan with scanId are required.' ) );
		}
		$scan_id = (string) $scan['scanId'];
		Neo_Pulse_App_Json_File_Store::write( self::scan_path( $site_id, $scan_id ), $scan );

		$summary = array(
			'scanId'          => $scan_id,
			'siteId'          => $site_id,
			'scanDateIso'     => (string) ( $scan['scanDateIso'] ?? gmdate( 'c' ) ),
			'scanDateLabel'   => (string) ( $scan['scanDateLabel'] ?? gmdate( 'M j, Y g:i A' ) ),
			'keyword'         => (string) ( $scan['keyword'] ?? '' ),
			'scanSize'        => (string) ( $scan['scanSize'] ?? '1x1' ),
			'shape'           => (string) ( $scan['shape'] ?? 'circle' ),
			'distance'        => isset( $scan['distance'] ) ? (float) $scan['distance'] : 1.0,
			'distanceMeasure' => (string) ( $scan['distanceMeasure'] ?? 'mile' ),
			'targetBusiness'  => (string) ( $scan['targetBusiness']['business'] ?? '' ),
			'pointCount'      => isset( $scan['points'] ) && is_array( $scan['points'] ) ? count( $scan['points'] ) : 0,
			'avgRank'         => isset( $scan['summary']['avgRank'] ) && is_numeric( $scan['summary']['avgRank'] ) ? (float) $scan['summary']['avgRank'] : null,
			'tarp'            => isset( $scan['summary']['tarp'] ) && is_numeric( $scan['summary']['tarp'] ) ? (float) $scan['summary']['tarp'] : null,
		);

		$index_file = self::index_path( $site_id );
		$index      = Neo_Pulse_App_Json_File_Store::read( $index_file );
		$existing   = is_array( $index ) && isset( $index['scans'] ) && is_array( $index['scans'] ) ? $index['scans'] : array();
		$next       = array( $summary );
		foreach ( $existing as $row ) {
			if ( is_array( $row ) && ( $row['scanId'] ?? '' ) !== $scan_id ) {
				$next[] = $row;
			}
		}
		usort(
			$next,
			static function ( $a, $b ) {
				return strcmp( (string) ( $b['scanDateIso'] ?? '' ), (string) ( $a['scanDateIso'] ?? '' ) );
			}
		);
		Neo_Pulse_App_Json_File_Store::write( $index_file, array( 'scans' => array_slice( $next, 0, 100 ) ) );

		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'          => true,
				'scanSummary' => $summary,
			),
		);
	}

	/**
	 * Persist a PNG snapshot of the Local Grid map (base64 data URL from the browser).
	 *
	 * @param array<string,mixed> $body
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function save_map_image( array $body ): array {
		$site_id = isset( $body['siteId'] ) ? trim( (string) $body['siteId'] ) : '';
		$scan_id = isset( $body['scanId'] ) ? trim( (string) $body['scanId'] ) : '';
		$data_url = isset( $body['imageDataUrl'] ) ? trim( (string) $body['imageDataUrl'] ) : '';
		if ( $site_id === '' || $scan_id === '' || $data_url === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'siteId, scanId, and imageDataUrl are required.',
				),
			);
		}
		if ( ! preg_match( '#^data:image/(png|jpeg);base64,(.+)$#', $data_url, $m ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'imageDataUrl must be a PNG or JPEG data URL.',
				),
			);
		}
		$raw = base64_decode( $m[2], true );
		if ( $raw === false || strlen( $raw ) < 32 ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'Could not decode map snapshot.',
				),
			);
		}
		if ( strlen( $raw ) > 4 * 1024 * 1024 ) {
			return array(
				'statusCode' => 413,
				'body'       => array(
					'ok'    => false,
					'error' => 'Map snapshot is too large.',
				),
			);
		}
		$path = self::map_image_path( $site_id, $scan_id );
		$dir  = dirname( $path );
		if ( ! is_dir( $dir ) && ! wp_mkdir_p( $dir ) ) {
			return array(
				'statusCode' => 500,
				'body'       => array(
					'ok'    => false,
					'error' => 'Could not store map snapshot.',
				),
			);
		}
		if ( file_put_contents( $path, $raw ) === false ) {
			return array(
				'statusCode' => 500,
				'body'       => array(
					'ok'    => false,
					'error' => 'Could not write map snapshot.',
				),
			);
		}
		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok' => true,
			),
		);
	}

	/**
	 * @return array{statusCode:int,body?:array<string,mixed>,file?:string,contentType?:string}
	 */
	public static function serve_map_image( string $site_id, string $scan_id ): array {
		$site_id = trim( $site_id );
		$scan_id = trim( $scan_id );
		if ( $site_id === '' || $scan_id === '' ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'ok'    => false,
					'error' => 'siteId and scanId are required.',
				),
			);
		}
		$path = self::map_image_path( $site_id, $scan_id );
		if ( ! is_readable( $path ) ) {
			return array(
				'statusCode' => 404,
				'body'       => array(
					'ok'    => false,
					'error' => 'Map snapshot not found.',
				),
			);
		}
		return array(
			'statusCode'  => 200,
			'file'        => $path,
			'contentType' => 'image/png',
		);
	}

	public static function delete_scan( array $body ): array {
		$site_id = isset( $body['siteId'] ) ? trim( (string) $body['siteId'] ) : '';
		$scan_id = isset( $body['scanId'] ) ? trim( (string) $body['scanId'] ) : '';
		if ( $site_id === '' || $scan_id === '' ) {
			return array( 'statusCode' => 400, 'body' => array( 'ok' => false, 'error' => 'siteId and scanId are required.' ) );
		}
		$path = self::scan_path( $site_id, $scan_id );
		if ( file_exists( $path ) ) {
			@unlink( $path );
		}
		$map_png = self::map_image_path( $site_id, $scan_id );
		if ( file_exists( $map_png ) ) {
			@unlink( $map_png );
		}
		$index_file = self::index_path( $site_id );
		$index      = Neo_Pulse_App_Json_File_Store::read( $index_file );
		$existing   = is_array( $index ) && isset( $index['scans'] ) && is_array( $index['scans'] ) ? $index['scans'] : array();
		$filtered   = array_values(
			array_filter(
				$existing,
				static function ( $row ) use ( $scan_id ) {
					return is_array( $row ) && ( $row['scanId'] ?? '' ) !== $scan_id;
				}
			)
		);
		Neo_Pulse_App_Json_File_Store::write( $index_file, array( 'scans' => $filtered ) );
		return array(
			'statusCode' => 200,
			'body'       => array(
				'ok'    => true,
				'scans' => $filtered,
			),
		);
	}

	/**
	 * Client report narrative for a saved Local Grid scan (OpenRouter, same contract as reporting highlights).
	 *
	 * @param array<string,mixed> $body siteId, siteName, siteUrl (optional), localGrid snapshot block.
	 * @return array{statusCode:int,body:array<string,mixed>}
	 */
	public static function report_narrative( array $body ): array {
		$site_id = isset( $body['siteId'] ) ? trim( (string) $body['siteId'] ) : '';
		$site_name = isset( $body['siteName'] ) ? trim( (string) $body['siteName'] ) : '';
		$site_url  = isset( $body['siteUrl'] ) ? trim( (string) $body['siteUrl'] ) : '';
		$local_grid = isset( $body['localGrid'] ) && is_array( $body['localGrid'] ) ? $body['localGrid'] : null;

		if ( $site_id === '' || $local_grid === null || empty( $local_grid['scanId'] ) ) {
			return array(
				'statusCode' => 400,
				'body'       => array(
					'success' => false,
					'error'   => 'siteId and localGrid.scanId are required.',
				),
			);
		}

		if ( class_exists( 'Neo_Pulse_App_Chat_Openrouter' ) ) {
			$request_key = Neo_Pulse_App_Chat_Openrouter::api_key_from_request( $body );
			if ( $request_key !== '' ) {
				Neo_Pulse_App_Chat_Openrouter::use_request_api_key( $request_key );
			}
		}

		try {
			$snapshot = array(
				'siteName'        => $site_name !== '' ? $site_name : 'This site',
				'siteUrl'         => $site_url,
				'showCompare'     => false,
				'reportStructure' => 'period_progress',
				'localGrid'       => $local_grid,
			);

			$result = Neo_Pulse_App_Organic_Dashboard_Reporting_Highlights::generate_local_grid_report_narrative(
				$body,
				$site_id,
				$snapshot
			);

			if ( (int) ( $result['statusCode'] ?? 500 ) !== 200 ) {
				$error = is_array( $result['body'] ?? null ) && is_string( $result['body']['error'] ?? null )
					? (string) $result['body']['error']
					: 'Local grid narrative could not be generated.';
				return array(
					'statusCode' => (int) ( $result['statusCode'] ?? 502 ),
					'body'       => array(
						'success' => false,
						'error'   => $error,
					),
				);
			}

			$list = isset( $result['body']['highlights']['localGridNarrative'] ) && is_array( $result['body']['highlights']['localGridNarrative'] )
				? $result['body']['highlights']['localGridNarrative']
				: array();

			return array(
				'statusCode' => 200,
				'body'       => array(
					'success'            => true,
					'localGridNarrative' => $list,
				),
			);
		} catch ( Exception $e ) {
			return array(
				'statusCode' => 500,
				'body'       => array(
					'success' => false,
					'error'   => $e->getMessage(),
				),
			);
		} finally {
			if ( class_exists( 'Neo_Pulse_App_Chat_Openrouter' ) ) {
				Neo_Pulse_App_Chat_Openrouter::clear_request_api_key();
			}
		}
	}
}
