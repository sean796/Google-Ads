<?php
/**
 * A `remote` query preset: knows how to ask one JSON API and turn its answer
 * into flat widget rows.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

interface EMCP_Tools_Remote_Preset {

	/** @return string Preset key (used in specs as `preset`). */
	public function key(): string;

	/** @return string Human label. */
	public function label(): string;

	/** @return string Key-provider slug in EMCP_Tools_Remote_Keys ('' when none is needed). */
	public function key_provider( array $args ): string;

	/** @return array<int, array> Widget-builder control defs, unprefixed (like EMCP_Tools_Widget_Query::controls()). */
	public function controls(): array;

	/** @return array<string, array{type:string}> Row field map. `$args` lets the generic preset derive fields from its map. */
	public function fields( array $args = array() ): array;

	/** @return int Cache lifetime in seconds. */
	public function ttl(): int;

	/**
	 * Build the HTTP request. Return null when the args are insufficient (no
	 * location, no place id): the runtime then yields no rows and an error.
	 *
	 * @param array  $args    Unprefixed settings.
	 * @param string $api_key The provider key ('' when none).
	 * @return array{url:string, headers?:array<string,string>}|null
	 */
	public function request( array $args, string $api_key ): ?array;

	/**
	 * Map decoded JSON to rows (each a flat string map matching fields()).
	 *
	 * @param array $json Decoded body.
	 * @param array $args Unprefixed settings.
	 * @return array<int, array<string, string>>
	 */
	public function map( array $json, array $args ): array;
}
