<?php
/**
 * Agency DataForSEO + Semrush credentials for SEO research (server-side only).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Research_Keys {

	/**
	 * @return array{login:string,password:string}
	 */
	public static function dataforseo(): array {
		$site = Neo_Pulse_Wp_Api::get_agency_dataforseo_credentials();
		if ( $site['login'] !== '' && $site['password'] !== '' ) {
			return $site;
		}

		$login = '';
		$pass  = '';

		if ( defined( 'NEO_PULSE_WP_DATAFORSEO_LOGIN' ) && NEO_PULSE_WP_DATAFORSEO_LOGIN !== '' ) {
			$login = trim( (string) NEO_PULSE_WP_DATAFORSEO_LOGIN );
		}
		if ( defined( 'NEO_PULSE_WP_DATAFORSEO_PASSWORD' ) && NEO_PULSE_WP_DATAFORSEO_PASSWORD !== '' ) {
			$pass = trim( (string) NEO_PULSE_WP_DATAFORSEO_PASSWORD );
		}

		if ( $login === '' ) {
			$login = $site['login'];
		}
		if ( $pass === '' ) {
			$pass = $site['password'];
		}

		return array(
			'login'    => $login,
			'password' => $pass,
		);
	}

	public static function dataforseo_configured(): bool {
		$c = self::dataforseo();
		return $c['login'] !== '' && $c['password'] !== '';
	}

	/**
	 * @return string wp-config|site|''
	 */
	public static function get_dataforseo_source(): string {
		$site = Neo_Pulse_Wp_Api::get_agency_dataforseo_credentials();
		if ( $site['login'] !== '' && $site['password'] !== '' ) {
			return 'site';
		}
		if ( defined( 'NEO_PULSE_WP_DATAFORSEO_LOGIN' ) && NEO_PULSE_WP_DATAFORSEO_LOGIN !== ''
			&& defined( 'NEO_PULSE_WP_DATAFORSEO_PASSWORD' ) && NEO_PULSE_WP_DATAFORSEO_PASSWORD !== '' ) {
			return 'wp-config';
		}
		if ( $site['login'] !== '' || $site['password'] !== '' ) {
			return 'site';
		}
		return '';
	}

	/**
	 * @return string
	 */
	public static function semrush_api_key(): string {
		if ( defined( 'NEO_PULSE_WP_SEMRUSH_API_KEY' ) && NEO_PULSE_WP_SEMRUSH_API_KEY !== '' ) {
			return trim( (string) NEO_PULSE_WP_SEMRUSH_API_KEY );
		}
		return '';
	}

	public static function research_configured(): bool {
		return self::dataforseo_configured();
	}
}
