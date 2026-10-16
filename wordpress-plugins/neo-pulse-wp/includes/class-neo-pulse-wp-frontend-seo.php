<?php
/**
 * neodigital.ca leftovers: a few hard-coded old-URL redirects.
 *
 * The head output this class used to print (title override, meta description,
 * Open Graph / Twitter tags, JSON-LD) ran on top of Rank Math and duplicated
 * it. It is gone: once Pulse SEO output is on, Neo_Pulse_Wp_Seo_Head prints
 * all of that for every site.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Frontend_Seo {

	public static function init_redirects(): void {
		add_action( 'template_redirect', array( __CLASS__, 'redirect_leftover_urls' ), 1 );
	}

	/**
	 * @return array<string, string>
	 */
	public static function leftover_redirects(): array {
		return array(
			'/digital-marketing-guide'  => '/blog/digital-marketing-guide/',
			'/digital-marketing-guide/' => '/blog/digital-marketing-guide/',
			'/service-area/edmonton-window-treatment-seo-104-avenue-edmonton-2'  => '/service-area/edmonton-window-treatment-seo-104-avenue-edmonton/',
			'/service-area/edmonton-window-treatment-seo-104-avenue-edmonton-2/' => '/service-area/edmonton-window-treatment-seo-104-avenue-edmonton/',
		);
	}

	public static function redirect_leftover_urls(): void {
		if ( ! isset( $_SERVER['REQUEST_URI'] ) ) {
			return;
		}
		$path = (string) wp_parse_url( (string) wp_unslash( $_SERVER['REQUEST_URI'] ), PHP_URL_PATH );
		$map  = self::leftover_redirects();
		if ( ! isset( $map[ $path ] ) ) {
			return;
		}
		wp_safe_redirect( home_url( $map[ $path ] ), 301 );
		exit;
	}
}
