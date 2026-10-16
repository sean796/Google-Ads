<?php
/**
 * DataForSEO SERP fetch for SEO research briefs.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Dataforseo {

	const API_BASE = 'https://api.dataforseo.com/v3';

	/**
	 * @param string              $endpoint Path after /v3 (e.g. serp/google/organic/live/advanced).
	 * @param array<int,mixed>    $tasks
	 * @param int                 $timeout
	 * @return array<string,mixed>|WP_Error
	 */
	public static function post_live( string $endpoint, array $tasks, int $timeout = 120 ) {
		$creds = Neo_Pulse_Wp_Research_Keys::dataforseo();
		if ( $creds['login'] === '' || $creds['password'] === '' ) {
			return new WP_Error(
				'neo-pulse_dfs_missing',
				__( 'DataForSEO credentials are not configured. Add your login and API password under NEO Pulse WP → Settings.', 'neo-pulse-wp' )
			);
		}

		$endpoint = ltrim( $endpoint, '/' );
		$url      = self::API_BASE . '/' . $endpoint;
		$response = wp_remote_post(
			$url,
			array(
				'timeout' => max( 10, min( 300, $timeout ) ),
				'headers' => array(
					'Authorization' => 'Basic ' . base64_encode( $creds['login'] . ':' . $creds['password'] ),
					'Content-Type'  => 'application/json; charset=utf-8',
					'Accept'        => 'application/json',
				),
				'body'    => wp_json_encode( array_values( $tasks ) ),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );

		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $data ) && ! empty( $data['status_message'] )
				? (string) $data['status_message']
				: ( $raw !== '' ? $raw : sprintf( 'HTTP %d', $code ) );
			return new WP_Error( 'neo-pulse_dfs_http', $msg, array( 'status' => $code ) );
		}

		if ( ! is_array( $data ) ) {
			return new WP_Error( 'neo-pulse_dfs_bad_json', __( 'DataForSEO returned an unexpected response.', 'neo-pulse-wp' ) );
		}

		if ( ! empty( $data['tasks'][0]['status_code'] ) && (int) $data['tasks'][0]['status_code'] !== 20000 ) {
			$task_row = $data['tasks'][0];
			$msg      = isset( $task_row['status_message'] ) ? (string) $task_row['status_message'] : __( 'DataForSEO task failed.', 'neo-pulse-wp' );
			if ( ! self::is_benign_empty_task( $task_row ) ) {
				return new WP_Error( 'neo-pulse_dfs_task', $msg );
			}
		}

		return $data;
	}

	/**
	 * @return array<string,mixed>|WP_Error
	 */
	public static function fetch_serp_organic_live_advanced( string $keyword, array $options = array() ) {
		$keyword = trim( $keyword );
		if ( $keyword === '' ) {
			return new WP_Error( 'neo-pulse_dfs_keyword', __( 'Focus keyword is required for SERP lookup.', 'neo-pulse-wp' ) );
		}

		$task = array(
			'keyword'                     => $keyword,
			'location_code'               => isset( $options['location_code'] ) ? (int) $options['location_code'] : 2840,
			'language_code'               => isset( $options['language_code'] ) ? (string) $options['language_code'] : 'en',
			'depth'                       => isset( $options['depth'] ) ? (int) $options['depth'] : 10,
			'device'                      => 'desktop',
			'os'                          => 'windows',
			'people_also_ask_click_depth' => isset( $options['people_also_ask_click_depth'] ) ? (int) $options['people_also_ask_click_depth'] : 4,
		);

		return self::post_live( 'serp/google/organic/live/advanced', array( $task ), 120 );
	}

	/**
	 * Related keywords for an outline seed.
	 *
	 * @return array<int, string>|WP_Error
	 */
	public static function fetch_related_keywords( string $keyword, array $options = array() ) {
		$keyword = trim( $keyword );
		if ( $keyword === '' ) {
			return new WP_Error( 'neo-pulse_dfs_keyword', __( 'Focus keyword is required for related phrases.', 'neo-pulse-wp' ) );
		}

		$task = array(
			'keyword'       => $keyword,
			'location_code' => isset( $options['location_code'] ) ? (int) $options['location_code'] : 2124,
			'language_code' => isset( $options['language_code'] ) ? (string) $options['language_code'] : 'en',
			'limit'         => isset( $options['limit'] ) ? (int) $options['limit'] : 20,
		);

		$data = self::post_live( 'dataforseo_labs/google/related_keywords/live', array( $task ), 60 );
		if ( is_wp_error( $data ) ) {
			return $data;
		}

		$out  = array();
		$seen = array();
		$items = $data['tasks'][0]['result'][0]['items'] ?? array();
		if ( ! is_array( $items ) ) {
			return array();
		}
		foreach ( $items as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$phrase = '';
			if ( ! empty( $item['keyword_data']['keyword'] ) ) {
				$phrase = trim( (string) $item['keyword_data']['keyword'] );
			} elseif ( ! empty( $item['keyword'] ) ) {
				$phrase = trim( (string) $item['keyword'] );
			}
			if ( $phrase === '' ) {
				continue;
			}
			$key = strtolower( $phrase );
			if ( isset( $seen[ $key ] ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$out[]        = $phrase;
		}

		return $out;
	}

	/**
	 * @param array<string,mixed> $task
	 */
	private static function is_benign_empty_task( array $task ): bool {
		if ( empty( $task['status_code'] ) || (int) $task['status_code'] === 20000 ) {
			return false;
		}
		$sm = strtolower( (string) ( $task['status_message'] ?? '' ) );
		return strpos( $sm, 'no search result' ) !== false
			|| strpos( $sm, 'no results' ) !== false
			|| strpos( $sm, 'no data' ) !== false
			|| strpos( $sm, 'not found' ) !== false;
	}
}
