<?php
/**
 * GBP location resolution and matching helpers.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Gmb_Posts_Api_Trait_Location_Resolution {

	/**
	 * @return string|WP_Error accounts/{aid}/locations/{lid}
	 */
	private static function resolve_location_parent(
		string $access_token,
		string $location_id,
		string $site_name = '',
		string $site_url = ''
	) {
		$raw = trim( $location_id );
		if ( $raw === '' ) {
			return new WP_Error( 'neo-pulse_gmb_no_location', 'GBP location ID is required.' );
		}

		$cache_key = md5( $raw . '|' . strtolower( $site_name ) . '|' . strtolower( $site_url ) );

		if ( strpos( $raw, 'accounts/' ) === 0 ) {
			if ( self::probe_local_posts_parent( $access_token, $raw ) ) {
				self::$location_parent_cache[ $cache_key ] = $raw;
				return $raw;
			}
			return new WP_Error(
				'neo-pulse_gmb_location_not_found',
				'GBP location cannot publish posts (localPosts API returned not found). Check the profile URL on this property in Integrations.'
			);
		}

		if ( isset( self::$location_parent_cache[ $cache_key ] ) ) {
			return self::$location_parent_cache[ $cache_key ];
		}

		$candidates = Neo_Pulse_App_Gmb_Performance::location_id_post_candidates( $raw );
		if ( empty( $candidates ) ) {
			return new WP_Error( 'neo-pulse_gmb_no_location', 'GBP location ID is invalid.' );
		}

		$accounts = self::list_account_names( $access_token );
		if ( ! $accounts ) {
			return new WP_Error( 'neo-pulse_gmb_no_account', 'No Google Business Profile accounts found.' );
		}

		$records = self::list_all_location_records( $access_token, $accounts );

		if ( $records ) {
			$by_website = self::match_locations_by_site_url( $records, $site_url );
			if ( count( $by_website ) === 1 ) {
				$verified = self::verify_local_posts_parent( $access_token, $by_website[0], $cache_key );
				if ( $verified ) {
					return $verified;
				}
			}

			if ( $site_name !== '' ) {
				$by_title = self::match_locations_by_site_name( $records, $site_name );
				if ( count( $by_title ) === 1 ) {
					$verified = self::verify_local_posts_parent( $access_token, $by_title[0], $cache_key );
					if ( $verified ) {
						return $verified;
					}
				}
				if ( count( $by_title ) > 1 && $candidates ) {
					$by_title_and_url = self::filter_locations_by_candidates( $records, $by_title, $candidates, $raw );
					if ( count( $by_title_and_url ) === 1 ) {
						$verified = self::verify_local_posts_parent( $access_token, $by_title_and_url[0], $cache_key );
						if ( $verified ) {
							return $verified;
						}
					}
				}
			}
		}

		if ( strpos( $raw, 'locations/' ) === 0 ) {
			foreach ( $accounts as $account_name ) {
				$candidate = $account_name . '/' . $raw;
				if ( self::probe_local_posts_parent( $access_token, $candidate ) ) {
					self::$location_parent_cache[ $cache_key ] = $candidate;
					return $candidate;
				}
			}
		}

		foreach ( $candidates as $normalized ) {
			foreach ( $accounts as $account_name ) {
				$candidate = $account_name . '/locations/' . $normalized;
				if ( self::probe_local_posts_parent( $access_token, $candidate ) ) {
					self::$location_parent_cache[ $cache_key ] = $candidate;
					return $candidate;
				}
			}
		}

		if ( $records ) {
			$listed = self::resolve_location_parent_from_directory( $records, $candidates, $raw, $site_name, $site_url );
			if ( ! is_wp_error( $listed ) ) {
				$verified = self::verify_local_posts_parent( $access_token, $listed, $cache_key );
				if ( $verified ) {
					return $verified;
				}
			}
		}

		$catalog = $records ? self::format_location_catalog( $records ) : '';
		$message = 'GBP location was not found in any connected Google account (tried: ' . implode( ', ', $candidates ) . ').';
		if ( $site_name !== '' ) {
			$message .= ' Expected a listing matching "' . $site_name . '".';
		}
		if ( $catalog !== '' ) {
			$message .= ' Connected account locations: ' . $catalog . '.';
		} else {
			$message .= ' Confirm Connect Google Business uses the Google account that owns this profile.';
		}

		return new WP_Error( 'neo-pulse_gmb_location_not_found', $message );
	}

	/**
	 * @param array<int,array<string,mixed>> $records
	 * @param array<int,string> $candidates
	 * @param array<int,string> $location_names
	 * @return array<int,string>
	 */
	private static function filter_locations_by_candidates(
		array $records,
		array $location_names,
		array $candidates,
		string $raw
	): array {
		$out = array();
		foreach ( $records as $record ) {
			$name = (string) ( $record['name'] ?? '' );
			if ( $name === '' || ! in_array( $name, $location_names, true ) ) {
				continue;
			}
			$blob = wp_json_encode( $record );
			if ( ! is_string( $blob ) ) {
				continue;
			}
			foreach ( $candidates as $candidate ) {
				if ( self::location_name_matches_candidate( $name, $candidate, $blob, $raw ) ) {
					$out[] = $name;
					break;
				}
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * @param array<int,array<string,mixed>> $records
	 * @return array<int,string>
	 */
	private static function match_locations_by_site_name( array $records, string $site_name ): array {
		$out = array();
		foreach ( $records as $record ) {
			$name = (string) ( $record['name'] ?? '' );
			if ( $name === '' ) {
				continue;
			}
			$title = (string) ( $record['title'] ?? '' );
			if ( self::location_title_matches_site( $title, $site_name ) ) {
				$out[] = $name;
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * @param array<int,array<string,mixed>> $records
	 * @return array<int,string>
	 */
	private static function match_locations_by_site_url( array $records, string $site_url ): array {
		$site_host = self::normalize_host( $site_url );
		if ( $site_host === '' ) {
			return array();
		}
		$out = array();
		foreach ( $records as $record ) {
			$name = (string) ( $record['name'] ?? '' );
			if ( $name === '' ) {
				continue;
			}
			if ( self::location_website_matches_host( $record, $site_host ) ) {
				$out[] = $name;
			}
		}
		return array_values( array_unique( $out ) );
	}

	private static function normalize_host( string $url ): string {
		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( trim( $url ) );
		if ( $normalized === '' ) {
			return '';
		}
		$host = wp_parse_url( $normalized, PHP_URL_HOST );
		if ( ! is_string( $host ) || $host === '' ) {
			return '';
		}
		$host = strtolower( $host );
		if ( str_starts_with( $host, 'www.' ) ) {
			$host = substr( $host, 4 );
		}
		return $host;
	}

	/**
	 * Cache and return location name only when localPosts API responds.
	 *
	 * @return string|null
	 */
	private static function verify_local_posts_parent(
		string $access_token,
		string $location_name,
		string $cache_key
	): ?string {
		if ( ! self::probe_local_posts_parent( $access_token, $location_name ) ) {
			return null;
		}
		self::$location_parent_cache[ $cache_key ] = $location_name;
		return $location_name;
	}

	/**
	 * @param array<string,mixed> $record
	 */
	private static function location_website_matches_host( array $record, string $site_host ): bool {
		$raw = isset( $record['raw'] ) && is_array( $record['raw'] ) ? $record['raw'] : array();
		$candidates = array();
		if ( ! empty( $raw['websiteUri'] ) ) {
			$candidates[] = (string) $raw['websiteUri'];
		}
		if ( ! empty( $raw['websiteUrl'] ) ) {
			$candidates[] = (string) $raw['websiteUrl'];
		}
		foreach ( $candidates as $website ) {
			$host = self::normalize_host( $website );
			if ( $host !== '' && $host === $site_host ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array<int,array<string,mixed>> $records
	 */
	private static function format_location_catalog( array $records ): string {
		$labels = array();
		foreach ( array_slice( $records, 0, 12 ) as $record ) {
			$title = trim( (string) ( $record['title'] ?? '' ) );
			if ( $title !== '' ) {
				$labels[] = $title;
			}
		}
		return $labels ? implode( '; ', $labels ) : '';
	}

	/**
	 * @param array<int,array<string,mixed>> $records
	 * @param array<int,string> $candidates
	 * @return string|WP_Error
	 */
	private static function resolve_location_parent_from_directory(
		array $records,
		array $candidates,
		string $raw,
		string $site_name,
		string $site_url
	) {
		foreach ( $records as $record ) {
			$name = (string) ( $record['name'] ?? '' );
			if ( $name === '' ) {
				continue;
			}
			$blob = wp_json_encode( $record );
			if ( ! is_string( $blob ) ) {
				continue;
			}
			foreach ( $candidates as $candidate ) {
				if ( self::location_name_matches_candidate( $name, $candidate, $blob, $raw ) ) {
					return $name;
				}
			}
		}

		if ( $site_name !== '' ) {
			$title_matches = self::match_locations_by_site_name( $records, $site_name );
			if ( count( $title_matches ) === 1 ) {
				return $title_matches[0];
			}
		}

		if ( $site_url !== '' ) {
			$url_matches = self::match_locations_by_site_url( $records, $site_url );
			if ( count( $url_matches ) === 1 ) {
				return $url_matches[0];
			}
		}

		return new WP_Error( 'neo-pulse_gmb_location_not_found', 'GBP location not listed in connected accounts.' );
	}

	private static function location_name_matches_candidate( string $name, string $candidate, string $blob, string $raw ): bool {
		if ( str_ends_with( $name, '/locations/' . $candidate ) ) {
			return true;
		}
		if ( strpos( $blob, $candidate ) !== false ) {
			return true;
		}
		return $raw !== '' && strpos( $blob, $raw ) !== false;
	}

	private static function location_title_matches_site( string $title, string $site_name ): bool {
		$title_norm = strtolower( trim( $title ) );
		$site_norm  = strtolower( trim( $site_name ) );
		if ( $title_norm === '' || $site_norm === '' ) {
			return false;
		}
		if ( strpos( $title_norm, $site_norm ) !== false || strpos( $site_norm, $title_norm ) !== false ) {
			return true;
		}
		$site_first = preg_split( '/[\s:\-,]+/', $site_norm );
		$site_token = is_array( $site_first ) && isset( $site_first[0] ) ? trim( (string) $site_first[0] ) : '';
		return strlen( $site_token ) >= 4 && strpos( $title_norm, $site_token ) !== false;
	}
}
