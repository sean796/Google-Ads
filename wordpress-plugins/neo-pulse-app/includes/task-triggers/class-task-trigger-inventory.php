<?php
/**
 * Resolve WordPress inventory URLs for trigger scan buckets.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Task_Trigger_Inventory {

	/**
	 * @return array{urls:array<int,string>,error?:string}
	 */
	public static function urls_for_bucket( string $site_id, string $bucket, int $limit = 5000 ): array {
		$auth = Neo_Pulse_App_Task_Execution_Site_Resolver::wordpress_auth( $site_id );
		if ( ! $auth ) {
			return array( 'urls' => array(), 'error' => 'Could not resolve WordPress site.' );
		}
		$collections = self::collections_for_bucket( $bucket );
		$body        = array(
			'siteUrl'        => (string) $auth['siteUrl'],
			'username'       => (string) $auth['username'],
			'appPassword'    => (string) $auth['appPassword'],
			'collections'    => $collections,
			'includeContent' => false,
			'includeRawPostFields'  => false,
		);
		list( $status, $data ) = Neo_Pulse_App_Wp_Posts_Inventory::get_site_inventory_bulk( $body );
		if ( $status < 200 || $status >= 300 || ! is_array( $data ) ) {
			return array( 'urls' => array(), 'error' => 'Could not load WordPress inventory.' );
		}
		$rows = isset( $data['rows'] ) && is_array( $data['rows'] ) ? $data['rows'] : array();
		$urls = array();
		foreach ( $rows as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			if ( $bucket === 'sap' ) {
				$type = sanitize_key( (string) ( $row['type'] ?? '' ) );
				if ( $type === 'pages' || $type === 'posts' ) {
					continue;
				}
			}
			$url = esc_url_raw( trim( (string) ( $row['url'] ?? $row['link'] ?? '' ) ) );
			if ( $url === '' ) {
				continue;
			}
			$urls[] = $url;
			if ( count( $urls ) >= $limit ) {
				break;
			}
		}
		return array( 'urls' => array_values( array_unique( $urls ) ) );
	}

	/**
	 * @return array<int,string>
	 */
	private static function collections_for_bucket( string $bucket ): array {
		$bucket = sanitize_key( $bucket );
		if ( $bucket === 'pages' ) {
			return array( 'pages' );
		}
		if ( $bucket === 'posts' ) {
			return array( 'posts' );
		}
		if ( $bucket === 'sap' ) {
			return array( 'posts', 'pages' );
		}
		return array( 'posts', 'pages' );
	}

	/**
	 * @param array<int,string> $urls
	 * @return array<int,string>
	 */
	public static function pick_stand_in_urls( array $urls ): array {
		return array_values( $urls );
	}
}
