<?php
/**
 * Yelp Fusion reviews preset for the `remote` query source. The Fusion API
 * returns up to 3 review excerpts per business.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class EMCP_Tools_Remote_Preset_Yelp implements EMCP_Tools_Remote_Preset {

	public function key(): string {
		return 'yelp';
	}

	public function label(): string {
		return 'Yelp Reviews (Fusion API)';
	}

	public function key_provider( array $args ): string {
		return 'yelp';
	}

	public function ttl(): int {
		return 6 * HOUR_IN_SECONDS;
	}

	public function controls(): array {
		return array(
			array( 'name' => 'business_id', 'type' => 'text', 'label' => 'Business ID or Alias', 'placeholder' => 'gary-danko-san-francisco', 'description' => 'The last part of the business page URL on yelp.com.' ),
			array( 'name' => 'count', 'type' => 'number', 'label' => 'Number of Reviews', 'default' => 3, 'min' => 1, 'max' => 3, 'description' => 'The Fusion API returns at most 3.' ),
			array(
				'name'    => 'sort',
				'type'    => 'select',
				'label'   => 'Sort',
				'default' => 'yelp_sort',
				'options' => array(
					array( 'value' => 'yelp_sort', 'label' => 'Yelp default' ),
					array( 'value' => 'newest', 'label' => 'Newest' ),
				),
			),
			array( 'name' => 'locale', 'type' => 'text', 'label' => 'Locale', 'default' => 'en_US' ),
		);
	}

	/**
	 * The review row shape shared by the review presets.
	 *
	 * @return array<string, array{type:string}>
	 */
	public static function review_fields(): array {
		$t = array( 'type' => 'text' );
		$u = array( 'type' => 'raw_url' );
		return array(
			'author'        => $t,
			'author_url'    => $u,
			'avatar'        => $u,
			'rating'        => $t,
			'text'          => $t,
			'time'          => $t,
			'relative_time' => $t,
			'url'           => $u,
			'place_name'    => $t,
			'place_rating'  => $t,
			'place_total'   => $t,
			'source'        => $t,
			'index'         => $t,
		);
	}

	public function fields( array $args = array() ): array {
		return self::review_fields();
	}

	public function request( array $args, string $api_key ): ?array {
		$id = preg_replace( '/[^A-Za-z0-9_\-]/', '', (string) ( $args['business_id'] ?? '' ) );
		if ( '' === $id || '' === $api_key ) {
			return null;
		}
		$q = array(
			'limit'  => 3,
			'sort_by' => ( 'newest' === ( $args['sort'] ?? '' ) ) ? 'newest' : 'yelp_sort',
			'locale' => preg_replace( '/[^a-zA-Z_]/', '', (string) ( $args['locale'] ?? 'en_US' ) ) ?: 'en_US',
		);
		return array(
			'url'     => 'https://api.yelp.com/v3/businesses/' . rawurlencode( $id ) . '/reviews?' . http_build_query( $q ),
			'headers' => array( 'Authorization' => 'Bearer ' . $api_key ),
		);
	}

	public function map( array $json, array $args ): array {
		$count = max( 1, min( 3, (int) ( $args['count'] ?? 3 ) ) );
		$out   = array();
		foreach ( (array) ( $json['reviews'] ?? array() ) as $rev ) {
			if ( ! is_array( $rev ) ) {
				continue;
			}
			$ts     = strtotime( (string) ( $rev['time_created'] ?? '' ) );
			$out[] = array(
				'author'        => (string) ( $rev['user']['name'] ?? '' ),
				'author_url'    => (string) ( $rev['user']['profile_url'] ?? '' ),
				'avatar'        => (string) ( $rev['user']['image_url'] ?? '' ),
				'rating'        => (string) (float) ( $rev['rating'] ?? 0 ),
				'text'          => (string) ( $rev['text'] ?? '' ),
				'time'          => $ts ? EMCP_Tools_Remote_Source::time( (int) $ts, (string) get_option( 'date_format', 'F j, Y' ) ) : '',
				'relative_time' => $ts && function_exists( 'human_time_diff' ) ? human_time_diff( (int) $ts ) . ' ago' : '',
				'url'           => (string) ( $rev['url'] ?? '' ),
				'place_name'    => '',
				'place_rating'  => '',
				'place_total'   => (string) ( $json['total'] ?? '' ),
				'source'        => 'Yelp',
			);
			if ( count( $out ) >= $count ) {
				break;
			}
		}
		return $out;
	}
}
