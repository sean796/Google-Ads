<?php
/**
 * Which site this is.
 *
 * Some front-end code in Neo Pulse was written for neodigital.ca only: its homepage styling, its
 * accessibility and SEO rewrites, its "Neo Digital" structured data and its llms.txt text. Those
 * parts check is_neo_digital() so they never run on client sites.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Site {

	/**
	 * Hosts that count as Neo Digital's own site (live and WP Engine staging).
	 *
	 * @return string[]
	 */
	public static function neo_digital_hosts(): array {
		return array( 'neodigital.ca', 'www.neodigital.ca', 'neodigital1stg.wpenginepowered.com' );
	}

	public static function is_neo_digital(): bool {
		static $result = null;
		if ( null === $result ) {
			$host   = strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
			$result = in_array( $host, self::neo_digital_hosts(), true );
		}
		return (bool) apply_filters( 'neo_pulse_wp_is_neo_digital_site', $result );
	}

	/**
	 * True on staging / development copies: WordPress environment type other than production,
	 * WP Engine install hosts (*.wpengine.com, *.wpenginepowered.com), or a host with a "staging" /
	 * "stg" label (staging.example.com, example-stg.com, site1stg.example.com; not stgeorge.com).
	 */
	public static function is_staging(): bool {
		static $result = null;
		if ( null === $result ) {
			$result = false;
			if ( function_exists( 'wp_get_environment_type' ) && 'production' !== wp_get_environment_type() ) {
				$result = true;
			} else {
				$host = strtolower( (string) wp_parse_url( home_url(), PHP_URL_HOST ) );
				if ( '' !== $host ) {
					$result = (bool) preg_match( '/\.(wpengine|wpenginepowered)\.com$/', $host )
						|| (bool) preg_match( '/(^|[.-])(staging|stg)(\d*)([.-]|$)/', $host )
						|| (bool) preg_match( '/([a-z0-9]staging|[0-9]stg)[0-9]*\./', $host );
				}
			}
		}
		/**
		 * Override staging detection.
		 *
		 * @param bool $result True when this looks like a staging/development site.
		 */
		return (bool) apply_filters( 'neo_pulse_wp_is_staging', $result );
	}
}
