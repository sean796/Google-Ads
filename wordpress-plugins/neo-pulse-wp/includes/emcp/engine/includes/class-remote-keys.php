<?php
/**
 * Site-level API keys for the Widget Builder's `remote` data source.
 *
 * One encrypted option per provider (EMCP_Tools_Secret, same as the stock-image
 * keys), each overridable by a PHP constant. Keys live here, on the Connection
 * tab, and never in a widget's settings: a generated widget names a preset, and
 * the runtime looks the key up at request time.
 *
 * Free tree on purpose: the admin form that edits the keys is free code; the
 * runtime that spends them is Pro.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Remote-provider key registry.
 *
 * @since 3.18.0
 */
class EMCP_Tools_Remote_Keys {

	/** Option name prefix; the provider slug is appended. */
	const OPTION_PREFIX = 'emcp_tools_remote_key_';

	/**
	 * Providers that take a key. Generic JSON slots let a widget call any REST
	 * API with a bearer/header key without that key entering the widget.
	 *
	 * @return array<string, array{label:string, url:string, const:string, hint:string}>
	 */
	public static function providers(): array {
		$out = array(
			'openweather'   => array(
				'label' => 'OpenWeather',
				'url'   => 'https://home.openweathermap.org/api_keys',
				'const' => 'EMCP_TOOLS_REMOTE_KEY_OPENWEATHER',
				'hint'  => 'Powers the Weather widget (free tier is enough).',
			),
			'google_places' => array(
				'label' => 'Google Places',
				'url'   => 'https://console.cloud.google.com/apis/library/places-backend.googleapis.com',
				'const' => 'EMCP_TOOLS_REMOTE_KEY_GOOGLE_PLACES',
				'hint'  => 'Powers the Google Reviews widget (Places API, Place Details).',
			),
			'yelp'          => array(
				'label' => 'Yelp Fusion',
				'url'   => 'https://www.yelp.com/developers/v3/manage_app',
				'const' => 'EMCP_TOOLS_REMOTE_KEY_YELP',
				'hint'  => 'Powers the Yelp Reviews widget.',
			),
		);
		for ( $i = 1; $i <= 3; $i++ ) {
			$out[ 'json_' . $i ] = array(
				'label' => 'Generic API key ' . $i,
				'url'   => '',
				'const' => 'EMCP_TOOLS_REMOTE_KEY_JSON_' . $i,
				'hint'  => 'A key slot the generic JSON preset can send as a header or query parameter.',
			);
		}
		return $out;
	}

	/**
	 * @param string $slug Provider slug.
	 * @return string Option name ('' for an unknown slug).
	 */
	public static function option( string $slug ): string {
		return isset( self::providers()[ $slug ] ) ? self::OPTION_PREFIX . $slug : '';
	}

	/**
	 * The decrypted key for a provider (constant wins over the option).
	 *
	 * @param string $slug Provider slug.
	 * @return string
	 */
	public static function get( string $slug ): string {
		$p = self::providers()[ $slug ] ?? null;
		if ( ! $p ) {
			return '';
		}
		if ( defined( $p['const'] ) && '' !== (string) constant( $p['const'] ) ) {
			return (string) constant( $p['const'] );
		}
		$stored = (string) get_option( self::option( $slug ), '' );
		if ( '' === $stored ) {
			return '';
		}
		return class_exists( 'EMCP_Tools_Secret' ) ? EMCP_Tools_Secret::decrypt_if_needed( $stored ) : $stored;
	}

	/**
	 * @param string $slug Provider slug.
	 * @return bool
	 */
	public static function has( string $slug ): bool {
		return '' !== self::get( $slug );
	}

	/**
	 * All option names (for the settings registration loop).
	 *
	 * @return string[]
	 */
	public static function options(): array {
		$out = array();
		foreach ( array_keys( self::providers() ) as $slug ) {
			$out[] = self::OPTION_PREFIX . $slug;
		}
		return $out;
	}
}
