<?php
/**
 * Generic JSON preset for the `remote` query source: any HTTPS endpoint that
 * returns JSON, an optional dot path to the item array, and a `field=path` map
 * that names the row fields. The optional key comes from one of the generic
 * key slots and is sent as a header or query parameter, never stored in the
 * widget.
 *
 * Because the row fields are declared by the widget author, this preset is
 * the escape hatch for tickers (currency, crypto, stocks), status pages, and
 * any REST API without its own preset.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class EMCP_Tools_Remote_Preset_Json implements EMCP_Tools_Remote_Preset {

	const MAX_FIELDS = 40;

	public function key(): string {
		return 'json';
	}

	public function label(): string {
		return 'Generic JSON API';
	}

	public function key_provider( array $args ): string {
		$slot = (string) ( $args['key_slot'] ?? '' );
		return in_array( $slot, array( 'json_1', 'json_2', 'json_3' ), true ) ? $slot : '';
	}

	public function ttl(): int {
		return 15 * MINUTE_IN_SECONDS;
	}

	public function controls(): array {
		return array(
			array( 'name' => 'url', 'type' => 'text', 'label' => 'Endpoint URL (https)', 'input_type' => 'url', 'placeholder' => 'https://api.example.com/v1/items' ),
			array( 'name' => 'items_path', 'type' => 'text', 'label' => 'Items Path', 'placeholder' => 'data.items', 'description' => 'Dot path to the array of items. Leave empty when the response is the array itself; an object becomes a single row.' ),
			array( 'name' => 'map', 'type' => 'textarea', 'label' => 'Field Map', 'rows' => 6, 'placeholder' => "title=name\nprice=quote.USD.price\nimage_url=logo", 'description' => 'One row field per line: field=dot.path. Names ending in url, image or avatar are treated as links.' ),
			array( 'name' => 'ttl', 'type' => 'number', 'label' => 'Cache (minutes)', 'default' => 15, 'min' => 1, 'max' => 1440 ),
			array(
				'name'    => 'key_slot',
				'type'    => 'select',
				'label'   => 'API Key',
				'default' => '',
				'options' => array(
					array( 'value' => '', 'label' => 'None' ),
					array( 'value' => 'json_1', 'label' => 'Generic API key 1 (Connection tab)' ),
					array( 'value' => 'json_2', 'label' => 'Generic API key 2' ),
					array( 'value' => 'json_3', 'label' => 'Generic API key 3' ),
				),
			),
			array(
				'name'    => 'key_in',
				'type'    => 'select',
				'label'   => 'Send Key As',
				'default' => 'bearer',
				'options' => array(
					array( 'value' => 'bearer', 'label' => 'Authorization: Bearer header' ),
					array( 'value' => 'header', 'label' => 'Custom header (name below)' ),
					array( 'value' => 'query', 'label' => 'Query parameter (name below)' ),
				),
			),
			array( 'name' => 'key_name', 'type' => 'text', 'label' => 'Header / Parameter Name', 'placeholder' => 'X-API-Key or api_key' ),
		);
	}

	/**
	 * Row fields come from the author's map. Without a map (e.g. at validation
	 * time before the user fills the panel) a `value` field is exposed so the
	 * template still compiles.
	 *
	 * @param array $args Unprefixed settings (or the spec `defaults`).
	 * @return array<string, array{type:string}>
	 */
	public function fields( array $args = array() ): array {
		$out = array();
		foreach ( self::parse_map( (string) ( $args['map'] ?? '' ) ) as $field => $path ) {
			$out[ $field ] = array( 'type' => self::is_link_name( $field ) ? 'raw_url' : 'text' );
		}
		if ( ! $out ) {
			$out['value'] = array( 'type' => 'text' );
		}
		$out['index'] = array( 'type' => 'text' );
		return $out;
	}

	/**
	 * "title=name\nprice=quote.USD.price" => [ 'title' => 'name', ... ].
	 *
	 * @param string $map Raw map text.
	 * @return array<string, string>
	 */
	public static function parse_map( string $map ): array {
		$out = array();
		foreach ( preg_split( '/\r\n|\r|\n/', $map ) as $line ) {
			$line = trim( $line );
			if ( '' === $line || false === strpos( $line, '=' ) ) {
				continue;
			}
			list( $field, $path ) = array_map( 'trim', explode( '=', $line, 2 ) );
			$field                = sanitize_key( $field );
			if ( '' === $field || 'index' === $field ) {
				continue;
			}
			$out[ $field ] = $path;
			if ( count( $out ) >= self::MAX_FIELDS ) {
				break;
			}
		}
		return $out;
	}

	/**
	 * @param string $field Field name.
	 * @return bool Whether the field is a link/image (escaped as a URL).
	 */
	public static function is_link_name( string $field ): bool {
		return (bool) preg_match( '/(^|_)(url|link|href|image|img|avatar|thumbnail|icon)$/', $field );
	}

	public function request( array $args, string $api_key ): ?array {
		$url = trim( (string) ( $args['url'] ?? '' ) );
		if ( '' === $url ) {
			return null; // the runtime enforces https and reports it precisely.
		}
		$headers = array();
		if ( '' !== $api_key ) {
			$mode = (string) ( $args['key_in'] ?? 'bearer' );
			$name = preg_replace( '/[^A-Za-z0-9_\-]/', '', (string) ( $args['key_name'] ?? '' ) );
			if ( 'query' === $mode && '' !== $name ) {
				$url .= ( false === strpos( $url, '?' ) ? '?' : '&' ) . rawurlencode( $name ) . '=' . rawurlencode( $api_key );
			} elseif ( 'header' === $mode && '' !== $name ) {
				$headers[ $name ] = $api_key;
			} else {
				$headers['Authorization'] = 'Bearer ' . $api_key;
			}
		}
		return array( 'url' => $url, 'headers' => $headers );
	}

	public function map( array $json, array $args ): array {
		$items = EMCP_Tools_Remote_Source::pluck( $json, trim( (string) ( $args['items_path'] ?? '' ) ) );
		if ( null === $items ) {
			return array();
		}
		if ( ! is_array( $items ) ) {
			return is_scalar( $items ) ? array( array( 'value' => (string) $items ) ) : array();
		}
		if ( array() === $items ) {
			return array(); // an empty list is "no items", not one blank row.
		}
		// An object (associative array) is a single row; a list is many rows.
		$is_list = array_keys( $items ) === range( 0, count( $items ) - 1 );
		$rows    = $is_list ? $items : array( $items );
		$map     = self::parse_map( (string) ( $args['map'] ?? '' ) );
		$out     = array();
		foreach ( $rows as $item ) {
			if ( ! is_array( $item ) ) {
				$out[] = array( 'value' => is_scalar( $item ) ? (string) $item : '' );
				continue;
			}
			$row = array();
			if ( $map ) {
				foreach ( $map as $field => $path ) {
					$v = EMCP_Tools_Remote_Source::pluck( $item, $path );
					if ( null === $v && '' === $path ) {
						$v = $item;
					}
					$row[ $field ] = is_scalar( $v ) ? (string) $v : ( is_array( $v ) ? (string) wp_json_encode( $v ) : '' );
				}
			} else {
				$row['value'] = (string) wp_json_encode( $item );
			}
			$out[] = $row;
		}
		return $out;
	}
}
