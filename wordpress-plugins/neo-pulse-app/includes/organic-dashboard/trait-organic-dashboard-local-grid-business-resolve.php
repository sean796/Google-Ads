<?php
/**
 * Connected site Google Maps business resolution and profile caching.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Organic_Dashboard_Local_Grid_Trait_Business_Resolve {

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
}
