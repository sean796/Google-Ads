<?php
/**
 * Google Places "Place Details" reviews preset for the `remote` query source.
 * Uses the Places API (legacy Place Details endpoint), which returns up to 5
 * reviews for a place.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class EMCP_Tools_Remote_Preset_Google_Reviews implements EMCP_Tools_Remote_Preset {

	public function key(): string {
		return 'google_reviews';
	}

	public function label(): string {
		return 'Google Reviews (Places API)';
	}

	public function key_provider( array $args ): string {
		return 'google_places';
	}

	public function ttl(): int {
		return 6 * HOUR_IN_SECONDS;
	}

	public function controls(): array {
		return array(
			array( 'name' => 'place_id', 'type' => 'text', 'label' => 'Place ID', 'placeholder' => 'ChIJ…', 'description' => 'Find it with the Place ID Finder on developers.google.com.' ),
			array(
				'name'    => 'min_rating',
				'type'    => 'select',
				'label'   => 'Minimum Rating',
				'default' => '0',
				'options' => array(
					array( 'value' => '0', 'label' => 'All' ),
					array( 'value' => '3', 'label' => '3 stars and up' ),
					array( 'value' => '4', 'label' => '4 stars and up' ),
					array( 'value' => '5', 'label' => '5 stars only' ),
				),
			),
			array( 'name' => 'count', 'type' => 'number', 'label' => 'Number of Reviews', 'default' => 5, 'min' => 1, 'max' => 5, 'description' => 'The Places API returns at most 5.' ),
			array(
				'name'    => 'sort',
				'type'    => 'select',
				'label'   => 'Sort',
				'default' => 'most_relevant',
				'options' => array(
					array( 'value' => 'most_relevant', 'label' => 'Most relevant' ),
					array( 'value' => 'newest', 'label' => 'Newest' ),
				),
			),
			array( 'name' => 'lang', 'type' => 'text', 'label' => 'Language Code', 'default' => 'en' ),
		);
	}

	public function fields( array $args = array() ): array {
		return EMCP_Tools_Remote_Preset_Yelp::review_fields();
	}

	public function request( array $args, string $api_key ): ?array {
		$pid = preg_replace( '/[^A-Za-z0-9_\-]/', '', (string) ( $args['place_id'] ?? '' ) );
		if ( '' === $pid || '' === $api_key ) {
			return null;
		}
		$q = array(
			'place_id'       => $pid,
			'fields'         => 'name,rating,user_ratings_total,url,reviews',
			'reviews_sort'   => ( 'newest' === ( $args['sort'] ?? '' ) ) ? 'newest' : 'most_relevant',
			'language'       => preg_replace( '/[^a-z\-]/i', '', (string) ( $args['lang'] ?? 'en' ) ) ?: 'en',
			'key'            => $api_key,
		);
		return array( 'url' => 'https://maps.googleapis.com/maps/api/place/details/json?' . http_build_query( $q ) );
	}

	public function map( array $json, array $args ): array {
		$r = isset( $json['result'] ) && is_array( $json['result'] ) ? $json['result'] : array();
		if ( ! $r ) {
			return array();
		}
		$min   = (float) ( $args['min_rating'] ?? 0 );
		$count = max( 1, min( 5, (int) ( $args['count'] ?? 5 ) ) );
		$out   = array();
		foreach ( (array) ( $r['reviews'] ?? array() ) as $rev ) {
			if ( ! is_array( $rev ) ) {
				continue;
			}
			$rating = (float) ( $rev['rating'] ?? 0 );
			if ( $rating < $min ) {
				continue;
			}
			$out[] = array(
				'author'        => (string) ( $rev['author_name'] ?? '' ),
				'author_url'    => (string) ( $rev['author_url'] ?? '' ),
				'avatar'        => (string) ( $rev['profile_photo_url'] ?? '' ),
				'rating'        => (string) $rating,
				'text'          => (string) ( $rev['text'] ?? '' ),
				'time'          => EMCP_Tools_Remote_Source::time( (int) ( $rev['time'] ?? 0 ), (string) get_option( 'date_format', 'F j, Y' ) ),
				'relative_time' => (string) ( $rev['relative_time_description'] ?? '' ),
				'url'           => (string) ( $r['url'] ?? '' ),
				'place_name'    => (string) ( $r['name'] ?? '' ),
				'place_rating'  => (string) ( $r['rating'] ?? '' ),
				'place_total'   => (string) ( $r['user_ratings_total'] ?? '' ),
				'source'        => 'Google',
			);
			if ( count( $out ) >= $count ) {
				break;
			}
		}
		return $out;
	}
}
