<?php
/**
 * Search Console relay and API request transport.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Gsc_Trait_Api_Transport {

	/**
	 * Ask Neo Digital's update server (Search Console relay) with this site's key.
	 *
	 * @param string              $endpoint 'sites' or 'query'.
	 * @param array<string,mixed> $body     JSON body.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function relay( string $endpoint, array $body ) {
		$key = class_exists( 'Neo_Pulse_Wp_License', false ) ? Neo_Pulse_Wp_License::site_key() : '';
		if ( '' === $key ) {
			return self::not_set_up_error();
		}
		$response = wp_remote_post(
			Neo_Pulse_Wp_License::server_url() . '/gsc/' . $endpoint,
			array(
				'timeout' => 'query' === $endpoint ? 60 : 30,
				'headers' => array(
					'Content-Type'   => 'application/json',
					'Accept'         => 'application/json',
					'X-Neo-Site-Key' => $key,
				),
				'body'    => wp_json_encode( $body ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return new WP_Error( 'neo-pulse_gsc_relay', __( 'The Neo Digital server could not be reached for Search Console data. Try again in a few minutes.', 'neo-pulse-wp' ) );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $data ) ) {
			$server_code = is_array( $data ) && ! empty( $data['code'] ) ? sanitize_key( (string) $data['code'] ) : 'http_' . $code;
			$message     = is_array( $data ) && ! empty( $data['message'] ) ? sanitize_text_field( (string) $data['message'] ) : sprintf( 'HTTP %d', $code );
			return new WP_Error( 'neo-pulse_gsc_' . $server_code, $message );
		}
		return $data;
	}

	/**
	 * @return array<int,array<string,mixed>>|WP_Error
	 */
	private static function list_sites() {
		$token = self::get_access_token();
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$response = wp_remote_get(
			self::WEBMASTERS . '/sites',
			array(
				'timeout' => 45,
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Accept'        => 'application/json',
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );

		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $data ) && ! empty( $data['error']['message'] )
				? (string) $data['error']['message']
				: ( $raw !== '' ? $raw : sprintf( 'HTTP %d', $code ) );
			return new WP_Error( 'neo-pulse_gsc_sites', $msg );
		}

		$entries = array();
		if ( is_array( $data ) && ! empty( $data['siteEntry'] ) && is_array( $data['siteEntry'] ) ) {
			foreach ( $data['siteEntry'] as $site ) {
				if ( ! is_array( $site ) || empty( $site['siteUrl'] ) ) {
					continue;
				}
				$entries[] = array(
					'siteUrl'         => (string) $site['siteUrl'],
					'permissionLevel' => isset( $site['permissionLevel'] ) ? (string) $site['permissionLevel'] : '',
				);
			}
		}

		return $entries;
	}

	/**
	 * Several search analytics queries for one property, sent in parallel where possible.
	 *
	 * @param array<string,array<string,mixed>> $bodies Request bodies keyed by name.
	 * @return array<string,array<string,mixed>|WP_Error> Results keyed like $bodies.
	 */
	public static function query_batch( string $property, array $bodies ): array {
		$results = array();
		if ( count( $bodies ) > 1 && class_exists( '\WpOrg\Requests\Requests' ) && apply_filters( 'neo_pulse_wp_gsc_parallel', true ) ) {
			$requests = self::batch_requests( $property, $bodies );
			if ( is_array( $requests ) ) {
				try {
					$responses = \WpOrg\Requests\Requests::request_multiple(
						$requests,
						array(
							'timeout'         => 60,
							'connect_timeout' => 10,
							'verify'          => ABSPATH . WPINC . '/certificates/ca-bundle.crt',
						)
					);
				} catch ( \Throwable $e ) {
					$responses = array();
				}
				foreach ( $bodies as $name => $body ) {
					$response = $responses[ $name ] ?? null;
					if ( $response instanceof \WpOrg\Requests\Response ) {
						$parsed = self::parse_query_response( (int) $response->status_code, (string) $response->body, 'agency' === self::mode() );
						// Network or server hiccup: one more try the ordinary way.
						$results[ $name ] = is_wp_error( $parsed ) && $response->status_code >= 500
							? self::search_analytics_query( $property, $body )
							: $parsed;
					} else {
						$results[ $name ] = self::search_analytics_query( $property, $body );
					}
				}
				return $results;
			}
		}
		foreach ( $bodies as $name => $body ) {
			$results[ $name ] = self::search_analytics_query( $property, $body );
		}
		return $results;
	}

	/**
	 * Requests::request_multiple() descriptors for query_batch(), or null to go one by one.
	 *
	 * @param array<string,array<string,mixed>> $bodies
	 * @return array<string,array<string,mixed>>|null
	 */
	private static function batch_requests( string $property, array $bodies ): ?array {
		if ( 'agency' === self::mode() ) {
			$url     = Neo_Pulse_Wp_License::server_url() . '/gsc/query';
			$headers = array(
				'Content-Type'   => 'application/json',
				'Accept'         => 'application/json',
				'X-Neo-Site-Key' => Neo_Pulse_Wp_License::site_key(),
			);
		} else {
			$token = self::get_access_token();
			if ( is_wp_error( $token ) ) {
				return null;
			}
			$url     = self::WEBMASTERS . '/sites/' . rawurlencode( $property ) . '/searchAnalytics/query';
			$headers = array(
				'Authorization' => 'Bearer ' . $token,
				'Content-Type'  => 'application/json',
				'Accept'        => 'application/json',
			);
		}
		$requests = array();
		foreach ( $bodies as $name => $body ) {
			$payload           = 'agency' === self::mode() ? array( 'property' => $property, 'request' => $body ) : $body;
			$requests[ $name ] = array(
				'url'     => $url,
				'type'    => 'POST',
				'headers' => $headers,
				'data'    => wp_json_encode( $payload ),
			);
		}
		return $requests;
	}

	/**
	 * Decode a search analytics answer (from Google, or from the relay with its {code,message} errors).
	 *
	 * @return array<string,mixed>|WP_Error
	 */
	private static function parse_query_response( int $code, string $raw, bool $from_relay ) {
		$data = json_decode( $raw, true );
		if ( $code >= 200 && $code < 300 && is_array( $data ) ) {
			return $data;
		}
		if ( $from_relay ) {
			$server_code = is_array( $data ) && ! empty( $data['code'] ) ? sanitize_key( (string) $data['code'] ) : 'http_' . $code;
			$message     = is_array( $data ) && ! empty( $data['message'] ) ? sanitize_text_field( (string) $data['message'] ) : sprintf( 'HTTP %d', $code );
			return new WP_Error( 'neo-pulse_gsc_' . $server_code, $message );
		}
		$message = is_array( $data ) && ! empty( $data['error']['message'] ) ? (string) $data['error']['message'] : sprintf( 'HTTP %d', $code );
		return new WP_Error( 'neo-pulse_gsc_query', $message );
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>|WP_Error
	 */
	private static function search_analytics_query( string $property, array $body ) {
		if ( 'agency' === self::mode() ) {
			return self::relay(
				'query',
				array(
					'property' => $property,
					'request'  => $body,
				)
			);
		}

		$token = self::get_access_token();
		if ( is_wp_error( $token ) ) {
			return $token;
		}

		$url = self::WEBMASTERS . '/sites/' . rawurlencode( $property ) . '/searchAnalytics/query';
		$response = wp_remote_post(
			$url,
			array(
				'timeout' => 60,
				'headers' => array(
					'Authorization' => 'Bearer ' . $token,
					'Content-Type'  => 'application/json',
					'Accept'        => 'application/json',
				),
				'body'    => wp_json_encode( $body ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );

		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $data ) && ! empty( $data['error']['message'] )
				? (string) $data['error']['message']
				: ( $raw !== '' ? $raw : sprintf( 'HTTP %d', $code ) );
			return new WP_Error( 'neo-pulse_gsc_query', $msg );
		}

		return is_array( $data ) ? $data : array();
	}
}
