<?php
/**
 * DataForSEO Maps scan batch execution and SERP result extraction.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Organic_Dashboard_Local_Grid_Trait_Scan_Execution {

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
}
