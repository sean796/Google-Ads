<?php
/**
 * Search Console connection test and property resolution.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Gsc_Trait_Connection {

	/**
	 * Check the service account against Google. Cached for an hour (errors for 10 minutes);
	 * pass true, or flush_stats_cache(), to ask Google again.
	 *
	 * @param bool $force Skip the cache.
	 * @return array{connected:bool,clientEmail:string,property:?string,accessibleCount:int,message:string,error:string}|WP_Error
	 */
	public static function test_connection( $force = false ) {
		$mode = self::mode();
		if ( '' === $mode ) {
			return self::not_set_up_error();
		}

		$site_url = Neo_Pulse_Wp_Api::get_site_url();
		if ( 'own' === $mode ) {
			$creds = self::get_credentials();
			$who   = $creds['client_email'];
		} else {
			$who = 'agency:' . md5( Neo_Pulse_Wp_License::site_key() );
		}
		$cache_sig = md5( $who . '|' . $site_url );
		if ( ! $force ) {
			$cached = get_transient( self::CONNECTION_TRANSIENT );
			if ( is_array( $cached ) && isset( $cached['sig'], $cached['result'] ) && $cached['sig'] === $cache_sig ) {
				$result = $cached['result'];
				if ( is_array( $result ) && ! empty( $result['__error'] ) ) {
					return new WP_Error(
						isset( $result['code'] ) ? (string) $result['code'] : 'neo-pulse_gsc_error',
						isset( $result['message'] ) ? (string) $result['message'] : '',
						isset( $result['data'] ) ? $result['data'] : null
					);
				}
				if ( is_array( $result ) ) {
					return $result;
				}
			}
		}

		$client_email = self::EMAIL_FALLBACK;
		$domain       = '';
		if ( 'own' === $mode ) {
			$sites        = self::list_sites();
			$client_email = $creds['client_email'];
		} else {
			$relay = self::relay( 'sites', array( 'fresh' => (bool) $force ) );
			if ( is_wp_error( $relay ) ) {
				$sites = $relay;
			} else {
				$sites        = isset( $relay['properties'] ) && is_array( $relay['properties'] ) ? $relay['properties'] : array();
				$client_email = ! empty( $relay['clientEmail'] ) ? sanitize_email( (string) $relay['clientEmail'] ) : $client_email;
				$domain       = isset( $relay['domain'] ) ? sanitize_text_field( (string) $relay['domain'] ) : '';
			}
		}

		if ( is_wp_error( $sites ) ) {
			$data = $sites->get_error_data();
			$data = is_array( $data ) ? $data : array();
			$data['clientEmail'] = $client_email;
			$error = new WP_Error( $sites->get_error_code(), $sites->get_error_message(), $data );
			set_transient(
				self::CONNECTION_TRANSIENT,
				array(
					'sig'    => $cache_sig,
					'result' => array(
						'__error' => true,
						'code'    => $error->get_error_code(),
						'message' => $error->get_error_message(),
						'data'    => $data,
					),
				),
				self::CONNECTION_ERROR_TTL
			);
			return $error;
		}

		if ( 'agency' === $mode ) {
			// The relay only lists this key's own domain, so any of them is right; the domain
			// property is preferred as it covers www and non-www. Also works on staging, whose
			// address is not the live domain.
			$match = array(
				'property' => self::preferred_property( $sites ),
				'error'    => '',
			);
		} else {
			$match = self::resolve_property( $site_url, $sites );
		}

		if ( null !== $match['property'] ) {
			$message = 'agency' === $mode
				? __( 'Connected to Google Search Console through Neo Digital.', 'neo-pulse-wp' )
				: __( 'Connected to Google Search Console.', 'neo-pulse-wp' );
			$error   = '';
		} elseif ( 'agency' === $mode ) {
			$message = '';
			$error   = sprintf(
				/* translators: 1: domain, 2: service account email */
				__( 'Neo Digital cannot see a Search Console property for %1$s yet. Add %2$s as a user on that property in Search Console; it can take a few minutes to show up.', 'neo-pulse-wp' ),
				'' !== $domain ? $domain : self::requested_domain( $site_url ),
				$client_email
			);
		} else {
			$message = __( 'Service account is valid but no matching GSC property was found for this site.', 'neo-pulse-wp' );
			$error   = $match['error'];
		}

		$result = array(
			'connected'       => null !== $match['property'],
			'clientEmail'     => $client_email,
			'property'        => $match['property'],
			'accessibleCount' => count( $sites ),
			'mode'            => $mode,
			'message'         => $message,
			'error'           => $error,
		);
		set_transient(
			self::CONNECTION_TRANSIENT,
			array(
				'sig'    => $cache_sig,
				'result' => $result,
			),
			$result['connected'] ? self::CONNECTION_TTL : self::CONNECTION_ERROR_TTL
		);
		return $result;
	}

	/**
	 * Neither a key on this site nor a site key for the Neo Digital relay.
	 */
	private static function not_set_up_error(): WP_Error {
		return new WP_Error(
			'neo-pulse_gsc_missing',
			__( 'Search Console is not set up for this site yet.', 'neo-pulse-wp' ),
			array(
				'clientEmail' => self::EMAIL_FALLBACK,
				'hint'        => sprintf(
					/* translators: %s: service account email */
					__( 'Enter the Neo Digital site key under Settings → Licence, then add %s as a user on this site\'s property in Search Console (Settings → Users and permissions, Restricted is enough).', 'neo-pulse-wp' ),
					self::EMAIL_FALLBACK
				),
			)
		);
	}

	/**
	 * Domain property first, then https, then whatever is left.
	 *
	 * @param array<int,array<string,mixed>> $sites
	 */
	private static function preferred_property( array $sites ): ?string {
		$urls = array();
		foreach ( $sites as $site ) {
			if ( ! empty( $site['siteUrl'] ) ) {
				$urls[] = (string) $site['siteUrl'];
			}
		}
		foreach ( array( 'sc-domain:', 'https://', '' ) as $prefix ) {
			foreach ( $urls as $url ) {
				if ( '' === $prefix || 0 === strpos( $url, $prefix ) ) {
					return $url;
				}
			}
		}
		return null;
	}

	/**
	 * @param array<int,array<string,mixed>> $sites
	 * @return array{property:?string,error:string,requestedDomain:string}
	 */
	private static function resolve_property( string $site_url, array $sites ): array {
		$requested = self::requested_domain( $site_url );
		if ( $requested === '' ) {
			return array(
				'property'        => null,
				'error'           => __( 'Could not determine site hostname.', 'neo-pulse-wp' ),
				'requestedDomain' => '',
			);
		}

		foreach ( $sites as $site ) {
			$raw = isset( $site['siteUrl'] ) ? (string) $site['siteUrl'] : '';
			if ( $raw === '' ) {
				continue;
			}
			$property_domain = self::property_domain( $raw );
			if ( $property_domain !== '' && $property_domain === $requested ) {
				return array(
					'property'        => $raw,
					'error'           => '',
					'requestedDomain' => $requested,
				);
			}
		}

		$candidates = self::generate_property_candidates( $site_url );
		foreach ( $candidates as $candidate ) {
			foreach ( $sites as $site ) {
				if ( isset( $site['siteUrl'] ) && (string) $site['siteUrl'] === $candidate ) {
					return array(
						'property'        => $candidate,
						'error'           => '',
						'requestedDomain' => $requested,
					);
				}
			}
		}

		return array(
			'property'        => null,
			'error'           => sprintf(
				/* translators: 1: domain, 2: number of accessible properties */
				__( 'No GSC property matches %1$s. The service account can access %2$d properties.', 'neo-pulse-wp' ),
				$requested,
				count( $sites )
			),
			'requestedDomain' => $requested,
		);
	}

	private static function requested_domain( string $site_url ): string {
		$host = wp_parse_url( trim( $site_url ), PHP_URL_HOST );
		if ( ! is_string( $host ) || $host === '' ) {
			$host = preg_replace( '#^https?://#i', '', trim( $site_url ) );
			$host = is_string( $host ) ? explode( '/', $host )[0] : '';
		}
		$host = strtolower( trim( (string) $host ) );
		if ( 0 === strpos( $host, 'www.' ) ) {
			$host = substr( $host, 4 );
		}
		return $host;
	}

	private static function property_domain( string $property_url ): string {
		$property_url = strtolower( trim( $property_url ) );
		if ( 0 === strpos( $property_url, 'sc-domain:' ) ) {
			$domain = substr( $property_url, strlen( 'sc-domain:' ) );
		} else {
			$domain = wp_parse_url( $property_url, PHP_URL_HOST );
			if ( ! is_string( $domain ) || $domain === '' ) {
				$domain = preg_replace( '#^https?://#', '', $property_url );
				$domain = is_string( $domain ) ? explode( '/', $domain )[0] : '';
			}
		}
		$domain = strtolower( trim( (string) $domain ) );
		if ( 0 === strpos( $domain, 'www.' ) ) {
			$domain = substr( $domain, 4 );
		}
		return $domain;
	}

	/**
	 * @return array<int,string>
	 */
	private static function generate_property_candidates( string $site_url ): array {
		$url = trim( $site_url );
		if ( $url === '' ) {
			return array();
		}
		if ( ! preg_match( '#^https?://#i', $url ) ) {
			$url = 'https://' . $url;
		}

		$candidates = array();
		$with_slash = substr( $url, -1 ) === '/' ? $url : $url . '/';
		$no_slash   = substr( $url, -1 ) === '/' ? rtrim( $url, '/' ) : $url;
		$candidates[] = $with_slash;
		if ( $no_slash !== $with_slash ) {
			$candidates[] = $no_slash;
		}

		$host = wp_parse_url( $url, PHP_URL_HOST );
		if ( is_string( $host ) && $host !== '' ) {
			$candidates[] = 'sc-domain:' . $host;
			if ( 0 !== strpos( $host, 'www.' ) ) {
				$candidates[] = 'sc-domain:www.' . $host;
				$candidates[] = 'https://www.' . $host . '/';
				$candidates[] = 'https://www.' . $host;
			} else {
				$bare = substr( $host, 4 );
				$candidates[] = 'sc-domain:' . $bare;
				$candidates[] = 'https://' . $bare . '/';
				$candidates[] = 'https://' . $bare;
			}
		}

		return array_values( array_unique( $candidates ) );
	}

	/**
	 * Property of the current connection, or a WP_Error explaining why there is none.
	 *
	 * @return array<string,mixed>|WP_Error Connection (with 'property').
	 */
	public static function connected(): array|WP_Error {
		$connection = self::test_connection();
		if ( is_wp_error( $connection ) ) {
			return $connection;
		}
		if ( empty( $connection['connected'] ) || empty( $connection['property'] ) ) {
			return new WP_Error(
				'neo-pulse_gsc_property',
				'' !== (string) $connection['error'] ? (string) $connection['error'] : (string) $connection['message'],
				$connection
			);
		}
		return $connection;
	}
}
