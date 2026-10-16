<?php
/**
 * Plugin settings accessors (site OpenRouter / DataForSEO keys, legacy API base) and the clean-up of
 * the retired NEO Pulse Node API credentials.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

/**
 * Settings accessors.
 */
class Neo_Pulse_Wp_Api {

	const OPTION_KEY = 'neo_pulse_wp_settings';


	/** Option that recorded which user the old pairing created that password for. */
	const LEGACY_AUTO_SETUP_OPTION = 'neo_pulse_wp_auto_setup_user';

	/**
	 * Remove the plain-text credentials the retired NEO Pulse Node API pairing stored (WordPress username
	 * and Application Password in neo_pulse_wp_settings) and the auto-setup marker. The Application
	 * Password itself is left in place: an external app may still sign in with it; revoke it under
	 * Users → Profile if it is no longer needed. Safe to run more than once.
	 */
	public static function cleanup_legacy_credentials(): void {
		$settings = get_option( self::OPTION_KEY, null );
		if ( is_array( $settings ) && ( array_key_exists( 'wp_username', $settings ) || array_key_exists( 'app_password', $settings ) ) ) {
			unset( $settings['wp_username'], $settings['app_password'] );
			update_option( self::OPTION_KEY, $settings, false );
		}
		delete_option( self::LEGACY_AUTO_SETUP_OPTION );
	}

	/**
	 * Legacy Node API origin from the NEO_PULSE_WP_DEFAULT_API_BASE constant / filter ('' when unset).
	 */
	public static function get_default_api_base(): string {
		$default = defined( 'NEO_PULSE_WP_DEFAULT_API_BASE' ) ? (string) NEO_PULSE_WP_DEFAULT_API_BASE : '';
		$default = (string) apply_filters( 'neo_pulse_wp_default_api_base', $default );
		return self::normalize_neo_pulse_api_base( $default );
	}

	public static function normalize_neo_pulse_api_base( string $url ): string {
		$url = trim( $url );
		if ( $url === '' ) {
			return '';
		}
		if ( ! preg_match( '#^https?://#i', $url ) ) {
			$url = 'https://' . ltrim( $url, '/' );
		}
		$parts = wp_parse_url( $url );
		if ( ! is_array( $parts ) || empty( $parts['host'] ) ) {
			return '';
		}
		$scheme = isset( $parts['scheme'] ) ? strtolower( (string) $parts['scheme'] ) : 'https';
		$host   = strtolower( (string) $parts['host'] );
		$port   = isset( $parts['port'] ) ? (int) $parts['port'] : null;
		$out    = $scheme . '://' . $host;
		if ( $port && ( ( 'http' === $scheme && 80 !== $port ) || ( 'https' === $scheme && 443 !== $port ) ) ) {
			$out .= ':' . $port;
		}
		return untrailingslashit( $out );
	}

	/**
	 * @return array{api_base:string,agency_openrouter_api_key:string,agency_dataforseo_login:string,agency_dataforseo_password:string}
	 */
	public static function get_settings(): array {
		$defaults = array(
			'api_base'                    => '',
			'agency_openrouter_api_key'   => '',
			'agency_dataforseo_login'     => '',
			'agency_dataforseo_password'  => '',
		);
		$saved = get_option( self::OPTION_KEY, array() );

		return wp_parse_args( (array) $saved, $defaults );
	}

	/**
	 * Legacy Node API base URL (saved setting, else the build default). Used by Neo_Pulse_Wp_Ai_Backend.
	 *
	 * @return array{api_base:string,source:string}
	 */
	public static function get_effective_settings(): array {
		$saved = self::get_settings();
		$base  = '';
		if ( isset( $saved['api_base'] ) && trim( (string) $saved['api_base'] ) !== '' ) {
			$base = self::normalize_neo_pulse_api_base( (string) $saved['api_base'] );
		} else {
			$base = self::get_default_api_base();
		}

		return array(
			'api_base' => $base,
			'source'   => 'saved',
		);
	}

	public static function get_agency_openrouter_api_key(): string {
		$s = self::get_settings();
		return isset( $s['agency_openrouter_api_key'] ) ? trim( (string) $s['agency_openrouter_api_key'] ) : '';
	}

	/**
	 * @param string $api_key Empty string clears the stored key.
	 */
	public static function save_agency_openrouter_api_key( string $api_key ): void {
		$prev   = self::get_settings();
		$merged = array_merge(
			$prev,
			array(
				'agency_openrouter_api_key' => sanitize_text_field( trim( $api_key ) ),
			)
		);
		update_option( self::OPTION_KEY, $merged, false );
		Neo_Pulse_Wp_OpenRouter::clear_credentials_cache();
	}

	public static function get_agency_dataforseo_login(): string {
		$s = self::get_settings();
		return isset( $s['agency_dataforseo_login'] ) ? trim( (string) $s['agency_dataforseo_login'] ) : '';
	}

	public static function get_agency_dataforseo_password(): string {
		$s = self::get_settings();
		return isset( $s['agency_dataforseo_password'] ) ? trim( (string) $s['agency_dataforseo_password'] ) : '';
	}

	/**
	 * @return array{login:string,password:string}
	 */
	public static function get_agency_dataforseo_credentials(): array {
		return array(
			'login'    => self::get_agency_dataforseo_login(),
			'password' => self::get_agency_dataforseo_password(),
		);
	}

	/**
	 * @param string $login Empty clears stored login.
	 * @param string $password Empty clears stored password.
	 */
	public static function save_agency_dataforseo_credentials( string $login, string $password ): void {
		$prev   = self::get_settings();
		$merged = array_merge(
			$prev,
			array(
				'agency_dataforseo_login'    => sanitize_text_field( trim( $login ) ),
				'agency_dataforseo_password' => sanitize_text_field( trim( $password ) ),
			)
		);
		update_option( self::OPTION_KEY, $merged, false );
	}

	public static function get_site_url(): string {
		return (string) apply_filters( 'neo_pulse_wp_site_url', home_url() );
	}

	/**
	 * Local WordPress site dashboard (no cloud pairing).
	 *
	 * @return array{ok:bool,dashboard:?array<string,mixed>,error:string,error_code:string}
	 */
	public static function fetch_plugin_dashboard_state(): array {
		$dashboard = array(
			'ok'       => true,
			'client'   => array(
				'name'    => get_bloginfo( 'name' ),
				'siteUrl' => self::get_site_url(),
			),
		);

		return array(
			'ok'         => true,
			'dashboard'  => $dashboard,
			'error'      => '',
			'error_code' => '',
		);
	}
}
