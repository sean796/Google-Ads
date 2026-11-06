<?php
/**
 * Shared SSRF guard for server-side fetches of user-influenced URLs.
 *
 * Validates the scheme, rejects userinfo and localhost forms, classifies
 * literal IPs against private and reserved ranges, resolves every DNS
 * record for a hostname and requires all of them to be public, and
 * follows redirects manually with full revalidation per hop.
 *
 * Residual risk (stated, not hidden): validating DNS and then letting the
 * HTTP layer resolve again leaves a DNS-rebinding window. Closing it fully
 * needs a custom transport with resolved-IP pinning, which the WordPress
 * HTTP API does not offer.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Ssrf_Guard {

	/** IPv4 private and reserved CIDRs as [base, prefix bits]. */
	private const IPV4_BLOCKED = array(
		array( '0.0.0.0', 8 ),
		array( '10.0.0.0', 8 ),
		array( '100.64.0.0', 10 ),
		array( '127.0.0.0', 8 ),
		array( '169.254.0.0', 16 ),
		array( '172.16.0.0', 12 ),
		array( '192.0.0.0', 24 ),
		array( '192.0.2.0', 24 ),
		array( '192.168.0.0', 16 ),
		array( '198.18.0.0', 15 ),
		array( '198.51.100.0', 24 ),
		array( '203.0.113.0', 24 ),
		array( '224.0.0.0', 4 ),
		array( '240.0.0.0', 4 ),
	);

	public static function ip_is_public( string $ip ): bool {
		$packed = inet_pton( $ip );
		if ( $packed === false ) {
			return false;
		}
		if ( strlen( $packed ) === 4 ) {
			foreach ( self::IPV4_BLOCKED as $cidr ) {
				if ( self::ipv4_in( $packed, $cidr[0], (int) $cidr[1] ) ) {
					return false;
				}
			}
			return true;
		}
		// IPv6.
		if ( $packed === inet_pton( '::' ) || $packed === inet_pton( '::1' ) ) {
			return false;
		}
		// IPv4-mapped IPv6: classify the embedded IPv4.
		if ( substr( $packed, 0, 12 ) === "\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xff\xff" ) {
			$octets = unpack( 'C4', substr( $packed, 12, 4 ) );
			if ( ! is_array( $octets ) ) {
				return false;
			}
			return self::ip_is_public( implode( '.', $octets ) );
		}
		$first = ord( $packed[0] );
		$second = ord( $packed[1] );
		if ( ( $first & 0xfe ) === 0xfc ) {
			return false; // fc00::/7 unique local.
		}
		if ( $first === 0xfe && ( $second & 0xc0 ) === 0x80 ) {
			return false; // fe80::/10 link local.
		}
		if ( $first === 0xff ) {
			return false; // ff00::/8 multicast.
		}
		if ( substr( $packed, 0, 4 ) === inet_pton( '2001:db8::' ) ) {
			return false; // Documentation range (first 32 bits compared via prefix below too).
		}
		if ( substr( $packed, 0, 8 ) === "\x01\x00\x00\x00\x00\x00\x00\x00" ) {
			return false; // 100::/64 discard.
		}
		return true;
	}

	private static function ipv4_in( string $packed, string $base, int $bits ): bool {
		$base_packed = inet_pton( $base );
		if ( $base_packed === false ) {
			return false;
		}
		$bytes = intdiv( $bits, 8 );
		$rem   = $bits % 8;
		if ( $bytes > 0 && substr( $packed, 0, $bytes ) !== substr( $base_packed, 0, $bytes ) ) {
			return false;
		}
		if ( $rem === 0 ) {
			return true;
		}
		$mask = ( 0xff << ( 8 - $rem ) ) & 0xff;
		return ( ord( $packed[ $bytes ] ) & $mask ) === ( ord( $base_packed[ $bytes ] ) & $mask );
	}

	/**
	 * Returns an error string, or null when the URL is a public https URL.
	 */
	public static function validate_public_url( string $url, bool $allow_http = false ): ?string {
		$scheme_pattern = $allow_http ? '#^https?://#i' : '#^https://#i';
		if ( $url === '' || ! preg_match( $scheme_pattern, $url ) ) {
			return $allow_http ? 'url must be an http(s) URL' : 'url must be an https URL';
		}
		$parts = wp_parse_url( $url );
		if ( ! is_array( $parts ) || empty( $parts['host'] ) ) {
			return 'url host is invalid';
		}
		if ( isset( $parts['user'] ) || isset( $parts['pass'] ) ) {
			return 'url must not contain credentials';
		}
		$host = strtolower( trim( (string) $parts['host'], "[] \t" ) );
		$host = rtrim( $host, '.' );
		if ( $host === 'localhost' || str_ends_with( $host, '.localhost' ) ) {
			return 'url host is not allowed';
		}
		// Local development exception only, never on the production hub.
		$local_ok = function_exists( 'wp_get_environment_type' ) && wp_get_environment_type() === 'local';
		if ( filter_var( $host, FILTER_VALIDATE_IP ) ) {
			if ( $local_ok && ( $host === '127.0.0.1' || $host === '::1' ) ) {
				return null;
			}
			return self::ip_is_public( $host ) ? null : 'url host is not allowed';
		}
		$ips = self::resolve_host( $host );
		if ( $ips === array() ) {
			return 'url host could not be resolved';
		}
		foreach ( $ips as $ip ) {
			if ( ! self::ip_is_public( $ip ) ) {
				if ( $local_ok && ( $ip === '127.0.0.1' || $ip === '::1' ) ) {
					continue;
				}
				return 'url host is not allowed';
			}
		}
		return null;
	}

	/**
	 * @return string[] All A and AAAA addresses for a hostname.
	 */
	private static function resolve_host( string $host ): array {
		$ips = array();
		if ( function_exists( 'dns_get_record' ) ) {
			$records = @dns_get_record( $host, DNS_A + DNS_AAAA );
			if ( is_array( $records ) ) {
				foreach ( $records as $record ) {
					if ( ! empty( $record['ip'] ) ) {
						$ips[] = (string) $record['ip'];
					}
					if ( ! empty( $record['ipv6'] ) ) {
						$ips[] = (string) $record['ipv6'];
					}
				}
			}
		}
		if ( $ips === array() ) {
			$v4 = gethostbynamel( $host );
			if ( is_array( $v4 ) ) {
				$ips = array_map( 'strval', $v4 );
			}
		}
		return array_values( array_unique( $ips ) );
	}

	/**
	 * GET with manual redirects. Every hop is revalidated.
	 *
	 * @param array<string,mixed> $args wp_remote_get args (redirection is forced to 0).
	 * @return array|\WP_Error
	 */
	public static function get( string $url, array $args = array(), int $max_hops = 3, bool $allow_http = false ) {
		$current = $url;
		for ( $hop = 0; $hop <= $max_hops; $hop++ ) {
			$check = self::validate_public_url( $current, $allow_http );
			if ( $check !== null ) {
				return new WP_Error( 'neo_pulse_ssrf_blocked', $check );
			}
			$args['redirection'] = 0;
			$response = wp_remote_get( $current, $args );
			if ( is_wp_error( $response ) ) {
				return $response;
			}
			$code = (int) wp_remote_retrieve_response_code( $response );
			if ( $code < 300 || $code >= 400 ) {
				return $response;
			}
			$location = wp_remote_retrieve_header( $response, 'location' );
			if ( ! is_string( $location ) || $location === '' ) {
				return $response;
			}
			$current = self::resolve_location( $current, $location );
			if ( $current === '' ) {
				return new WP_Error( 'neo_pulse_ssrf_blocked', 'Invalid redirect location.' );
			}
		}
		return new WP_Error( 'neo_pulse_ssrf_blocked', 'Too many redirects.' );
	}

	private static function resolve_location( string $current, string $location ): string {
		if ( preg_match( '#^https?://#i', $location ) ) {
			return $location;
		}
		$parts = wp_parse_url( $current );
		if ( ! is_array( $parts ) || empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
			return '';
		}
		$base = $parts['scheme'] . '://' . $parts['host'] . ( isset( $parts['port'] ) ? ':' . $parts['port'] : '' );
		if ( str_starts_with( $location, '/' ) ) {
			return $base . $location;
		}
		$path = isset( $parts['path'] ) ? (string) $parts['path'] : '/';
		$dir  = substr( $path, 0, (int) strrpos( $path, '/' ) + 1 );
		return $base . $dir . $location;
	}
}
