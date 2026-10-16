<?php
/**
 * OpenWeather "current weather" preset for the `remote` query source.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class EMCP_Tools_Remote_Preset_OpenWeather implements EMCP_Tools_Remote_Preset {

	public function key(): string {
		return 'openweather';
	}

	public function label(): string {
		return 'OpenWeather (current conditions)';
	}

	public function key_provider( array $args ): string {
		return 'openweather';
	}

	public function ttl(): int {
		return 10 * MINUTE_IN_SECONDS;
	}

	public function controls(): array {
		return array(
			array( 'name' => 'location', 'type' => 'text', 'label' => 'Location', 'default' => 'London,GB', 'placeholder' => 'City,CC or lat,lon', 'description' => 'A city name with country code (Paris,FR) or coordinates (48.85,2.35).' ),
			array(
				'name'    => 'units',
				'type'    => 'select',
				'label'   => 'Units',
				'default' => 'metric',
				'options' => array(
					array( 'value' => 'metric', 'label' => 'Celsius, m/s' ),
					array( 'value' => 'imperial', 'label' => 'Fahrenheit, mph' ),
				),
			),
			array( 'name' => 'lang', 'type' => 'text', 'label' => 'Language Code', 'default' => 'en', 'placeholder' => 'en' ),
		);
	}

	public function fields( array $args = array() ): array {
		$t = array( 'type' => 'text' );
		return array(
			'city'        => $t,
			'country'     => $t,
			'temp'        => $t,
			'feels_like'  => $t,
			'temp_min'    => $t,
			'temp_max'    => $t,
			'humidity'    => $t,
			'pressure'    => $t,
			'wind'        => $t,
			'wind_unit'   => $t,
			'temp_unit'   => $t,
			'condition'   => $t,
			'description' => $t,
			'icon'        => $t,
			'icon_url'    => array( 'type' => 'raw_url' ),
			'sunrise'     => $t,
			'sunset'      => $t,
			'updated'     => $t,
			'index'       => $t,
		);
	}

	public function request( array $args, string $api_key ): ?array {
		$loc = trim( (string) ( $args['location'] ?? '' ) );
		if ( '' === $loc || '' === $api_key ) {
			return null;
		}
		$units = ( 'imperial' === ( $args['units'] ?? '' ) ) ? 'imperial' : 'metric';
		$lang  = preg_replace( '/[^a-z_]/i', '', (string) ( $args['lang'] ?? 'en' ) ) ?: 'en';
		$q     = array( 'appid' => $api_key, 'units' => $units, 'lang' => $lang );
		if ( preg_match( '/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/', $loc, $m ) ) {
			$q['lat'] = $m[1];
			$q['lon'] = $m[2];
		} else {
			$q['q'] = $loc;
		}
		return array( 'url' => 'https://api.openweathermap.org/data/2.5/weather?' . http_build_query( $q ) );
	}

	public function map( array $json, array $args ): array {
		if ( ! isset( $json['main'] ) ) {
			return array();
		}
		$imperial = ( 'imperial' === ( $args['units'] ?? '' ) );
		$w        = isset( $json['weather'][0] ) && is_array( $json['weather'][0] ) ? $json['weather'][0] : array();
		$icon     = (string) ( $w['icon'] ?? '' );
		$round    = static fn( $v ) => is_numeric( $v ) ? (string) round( (float) $v ) : '';
		return array(
			array(
				'city'        => (string) ( $json['name'] ?? '' ),
				'country'     => (string) ( $json['sys']['country'] ?? '' ),
				'temp'        => $round( $json['main']['temp'] ?? null ),
				'feels_like'  => $round( $json['main']['feels_like'] ?? null ),
				'temp_min'    => $round( $json['main']['temp_min'] ?? null ),
				'temp_max'    => $round( $json['main']['temp_max'] ?? null ),
				'humidity'    => (string) ( $json['main']['humidity'] ?? '' ),
				'pressure'    => (string) ( $json['main']['pressure'] ?? '' ),
				'wind'        => $round( $json['wind']['speed'] ?? null ),
				'wind_unit'   => $imperial ? 'mph' : 'm/s',
				'temp_unit'   => $imperial ? '°F' : '°C',
				'condition'   => (string) ( $w['main'] ?? '' ),
				'description' => ucfirst( (string) ( $w['description'] ?? '' ) ),
				'icon'        => $icon,
				'icon_url'    => $icon ? 'https://openweathermap.org/img/wn/' . rawurlencode( $icon ) . '@2x.png' : '',
				'sunrise'     => EMCP_Tools_Remote_Source::time( (int) ( $json['sys']['sunrise'] ?? 0 ) ),
				'sunset'      => EMCP_Tools_Remote_Source::time( (int) ( $json['sys']['sunset'] ?? 0 ) ),
				'updated'     => EMCP_Tools_Remote_Source::time( (int) ( $json['dt'] ?? 0 ) ),
			),
		);
	}
}
