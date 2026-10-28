<?php
/**
 * Bulk overview SEO writes (POST /bulk-update-overview-seo, /update-overview-seo-item).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Bulk_Overview_Seo {

	const WP_REST_BATCH_V1_MAX = 25;

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function update_overview_seo_item( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$item         = isset( $body['item'] ) && is_array( $body['item'] ) ? $body['item'] : null;

		if ( $site_url === '' || $username === '' || $app_password === '' || ! $item ) {
			return array(
				400,
				array(
					'success' => false,
					'ok'      => false,
					'error'   => 'Missing required fields: siteUrl, username, appPassword, item',
				),
			);
		}

		$post_id = Neo_Pulse_App_Wp_Url_Normalize::normalize_post_id( isset( $item['postId'] ) ? $item['postId'] : null );
		if ( $post_id === null ) {
			return array( 400, array( 'success' => false, 'ok' => false, 'postId' => null, 'error' => 'Invalid postId' ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$run_item   = array(
			'index'            => 0,
			'postId'           => $post_id,
			'postType'         => isset( $item['postType'] ) ? $item['postType'] : 'post',
			'postTypeEndpoint' => isset( $item['postTypeEndpoint'] ) ? $item['postTypeEndpoint'] : null,
			'acf'              => isset( $item['acf'] ) ? $item['acf'] : null,
			'postTitle'        => isset( $item['postTitle'] ) ? $item['postTitle'] : null,
			'postExcerpt'      => isset( $item['postExcerpt'] ) ? $item['postExcerpt'] : null,
			'postContent'      => isset( $item['postContent'] ) ? $item['postContent'] : null,
		);
		$results = self::bulk_write_items( $normalized, $username, $app_password, array( $run_item ) );
		$r       = isset( $results[0] ) ? $results[0] : array( 'ok' => false, 'error' => 'No result returned.' );

		return array(
			200,
			array(
				'success'    => ! empty( $r['ok'] ),
				'ok'         => ! empty( $r['ok'] ),
				'postId'     => $post_id,
				'error'      => isset( $r['error'] ) ? $r['error'] : null,
				'method'     => isset( $r['method'] ) ? $r['method'] : 'batch_v1',
				'httpStatus' => isset( $r['httpStatus'] ) ? $r['httpStatus'] : null,
			),
		);
	}

	/**
	 * One JSON response for up to 25 posts (WordPress batch/v1 limit).
	 *
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function bulk_update_overview_seo( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$items        = isset( $body['items'] ) && is_array( $body['items'] ) ? $body['items'] : null;

		if ( $site_url === '' || $username === '' || $app_password === '' || ! is_array( $items ) ) {
			return array( 400, array( 'success' => false, 'error' => 'Missing required fields: siteUrl, username, appPassword, items[]' ) );
		}
		if ( ! $items ) {
			return array( 400, array( 'success' => false, 'error' => 'items array is empty' ) );
		}
		if ( count( $items ) > self::WP_REST_BATCH_V1_MAX ) {
			return array( 400, array( 'success' => false, 'error' => 'items max is 25 (WordPress batch/v1 limit)' ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$to_run     = array();
		$skipped    = array();

		foreach ( $items as $index => $raw ) {
			$post_id = Neo_Pulse_App_Wp_Url_Normalize::normalize_post_id( isset( $raw['postId'] ) ? $raw['postId'] : null );
			if ( $post_id === null ) {
				$skipped[] = array( 'index' => $index, 'error' => 'Invalid postId', 'skip' => true );
				continue;
			}
			$to_run[] = array(
				'index'            => $index,
				'postId'           => $post_id,
				'postType'         => isset( $raw['postType'] ) ? $raw['postType'] : 'post',
				'postTypeEndpoint' => isset( $raw['postTypeEndpoint'] ) ? $raw['postTypeEndpoint'] : null,
				'acf'              => isset( $raw['acf'] ) ? $raw['acf'] : null,
				'postTitle'        => isset( $raw['postTitle'] ) ? $raw['postTitle'] : null,
				'postExcerpt'      => isset( $raw['postExcerpt'] ) ? $raw['postExcerpt'] : null,
				'postContent'      => isset( $raw['postContent'] ) ? $raw['postContent'] : null,
			);
		}

		$run_results = self::bulk_write_items( $normalized, $username, $app_password, $to_run );

		$results = array();
		foreach ( $skipped as $s ) {
			$results[] = array(
				'postId' => null,
				'index'  => $s['index'],
				'ok'     => false,
				'error'  => isset( $s['error'] ) ? $s['error'] : 'Skipped',
			);
		}
		foreach ( $run_results as $r ) {
			$results[] = $r;
		}
		usort(
			$results,
			static function ( $a, $b ) {
				return ( $a['index'] ?? 0 ) <=> ( $b['index'] ?? 0 );
			}
		);

		$ok_count = count(
			array_filter(
				$results,
				static function ( $x ) {
					return ! empty( $x['ok'] );
				}
			)
		);

		$first_error = isset( $results[0]['error'] ) ? (string) $results[0]['error'] : '';
		if ( $results && $ok_count === 0 && $first_error === self::BATCH_V1_MISSING ) {
			return array(
				502,
				array(
					'success' => false,
					'error'   => self::BATCH_V1_MISSING,
					'results' => $results,
					'okCount' => 0,
					'total'   => count( $items ),
				),
			);
		}

		return array(
			200,
			array(
				'success' => $ok_count > 0 || ! $results,
				'results' => $results,
				'okCount' => $ok_count,
				'total'   => count( $items ),
			),
		);
	}

	const BATCH_V1_MISSING =
		'WordPress REST batch/v1 is required (WordPress 5.6+). POST /wp-json/batch/v1 writes up to 25 posts in one request.';

	/**
	 * One WordPress core POST /wp-json/batch/v1 for this request (max 25 posts).
	 *
	 * @param string                         $normalized Site URL.
	 * @param string                         $username User.
	 * @param string                         $app_password Password.
	 * @param array<int,array<string,mixed>> $to_run Items.
	 * @return array<int,array<string,mixed>>
	 */
	public static function bulk_write_items( $normalized, $username, $app_password, $to_run ) {
		if ( ! $to_run ) {
			return array();
		}

		self::sync_pulse_overview_bulk_slice( $normalized, $username, $app_password, $to_run );

		return self::write_batch_v1_slice(
			$normalized . '/wp-json/batch/v1',
			$username,
			$app_password,
			$to_run
		);
	}

	/**
	 * Sync SEO title, excerpt, focus keyword, FAQ, date_modifier, and seo_research via
	 * native `POST /wp-json/neo-pulse/v1/overview-seo/bulk` on the site.
	 *
	 * @param string                         $normalized   Normalized site URL.
	 * @param string                         $username     Username.
	 * @param string                         $app_password Application password.
	 * @param array<int,array<string,mixed>> $to_run       Items.
	 */
	private static function sync_pulse_overview_bulk_slice( $normalized, $username, $app_password, $to_run ): void {
		$pulse_items = array();
		foreach ( $to_run as $item ) {
			$meta = array();
			$acf  = Neo_Pulse_App_Wp_Overview_Seo_Item::direct_acf_from_client( isset( $item['acf'] ) ? $item['acf'] : array() );

			if ( ! empty( $item['postTitle'] ) && is_string( $item['postTitle'] ) && trim( $item['postTitle'] ) !== '' ) {
				$meta['rank_math_title'] = Neo_Pulse_App_Wp_Overview_Seo_Item::aligned_title( trim( $item['postTitle'] ), $acf );
			}
			if ( ! empty( $item['postExcerpt'] ) && is_string( $item['postExcerpt'] ) && trim( $item['postExcerpt'] ) !== '' ) {
				$meta['rank_math_description'] = trim( $item['postExcerpt'] );
			}
			if ( ! empty( $acf['keyword_focus'] ) ) {
				$meta['rank_math_focus_keyword'] = $acf['keyword_focus'];
			}

			$allowed_acf = array();
			foreach ( array( 'keyword_focus', 'keyword_focu', 'faq', 'seo_faq', 'date_modifier', 'seo_date_modifier', 'seo_research' ) as $k ) {
				if ( ! empty( $acf[ $k ] ) ) {
					$allowed_acf[ $k ] = $acf[ $k ];
				}
			}

			if ( $meta || $allowed_acf ) {
				$pulse_items[] = array(
					'index'  => (int) ( $item['index'] ?? 0 ),
					'postId' => (int) $item['postId'],
					'meta'   => $meta,
					'acf'    => $allowed_acf,
				);
			}
		}

		if ( ! $pulse_items ) {
			return;
		}

		Neo_Pulse_App_Wp_Rest_Client::request(
			'POST',
			$normalized . '/wp-json/neo-pulse/v1/overview-seo/bulk',
			$username,
			$app_password,
			array(
				'timeout' => Neo_Pulse_App_Wp_Overview_Seo_Item::WRITE_TIMEOUT,
				'body'    => array( 'items' => $pulse_items ),
			)
		);
	}

	/**
	 * @param string                         $url batch/v1 URL.
	 * @param string                         $username User.
	 * @param string                         $app_password Password.
	 * @param array<int,array<string,mixed>> $slice Items in this request.
	 * @return array<int,array<string,mixed>>
	 */
	private static function write_batch_v1_slice( $url, $username, $app_password, $slice ) {
		$requests = array();
		$sent     = array();
		$skipped  = array();
		foreach ( $slice as $item ) {
			$request = Neo_Pulse_App_Wp_Overview_Seo_Item::to_batch_v1_request( $item );
			if ( ! $request ) {
				$skipped[] = array(
					'postId' => $item['postId'],
					'index'  => $item['index'],
					'ok'     => false,
					'error'  => 'Nothing to update (empty title, excerpt, content, and acf)',
					'method' => 'batch_v1',
				);
				continue;
			}
			$requests[] = $request;
			$sent[]     = $item;
		}

		if ( ! $requests ) {
			return $skipped;
		}

		$resp = Neo_Pulse_App_Wp_Rest_Client::request(
			'POST',
			$url,
			$username,
			$app_password,
			array(
				'timeout'      => Neo_Pulse_App_Wp_Overview_Seo_Item::WRITE_TIMEOUT,
				'max_attempts' => 1,
				'body'         => array( 'requests' => $requests ),
			)
		);

		$mapped = self::map_batch_v1_response( $sent, $resp );
		return array_merge( $skipped, $mapped );
	}

	/**
	 * @param array<int,array<string,mixed>>                             $sent Items sent.
	 * @param array{status:int,body:mixed,is_wp_error:bool,error:string} $resp Client response.
	 * @return array<int,array<string,mixed>>
	 */
	private static function map_batch_v1_response( $sent, $resp ) {
		$status = (int) $resp['status'];
		if ( ! empty( $resp['is_wp_error'] ) || $status === 404 ) {
			return self::fail_slice( $sent, self::BATCH_V1_MISSING, $status ?: null );
		}
		// 207 Multi-Status is the WordPress batch envelope success.
		if ( $status !== 207 && ( $status < 200 || $status >= 300 ) ) {
			$message = Neo_Pulse_App_Wp_Overview_Seo_Item::wp_put_error_message( $resp );
			return self::fail_slice( $sent, $message, $status );
		}

		$body      = isset( $resp['body'] ) && is_array( $resp['body'] ) ? $resp['body'] : array();
		$responses = isset( $body['responses'] ) && is_array( $body['responses'] ) ? $body['responses'] : array();

		$mapped = array();
		foreach ( $sent as $i => $item ) {
			$entry     = isset( $responses[ $i ] ) && is_array( $responses[ $i ] ) ? $responses[ $i ] : null;
			$http      = $entry && isset( $entry['status'] ) ? (int) $entry['status'] : null;
			$ok        = $http !== null && $http >= 200 && $http < 300;
			$error     = null;
			if ( ! $ok ) {
				if ( $entry && isset( $entry['body'] ) ) {
					$error = Neo_Pulse_App_Wp_Overview_Seo_Item::wp_put_error_message(
						array(
							'status'      => $http ?? 0,
							'body'        => $entry['body'],
							'is_wp_error' => false,
						)
					);
				} else {
					$error = 'WordPress batch/v1 returned no result for this row.';
				}
			}
			$mapped[] = array(
				'postId'     => $item['postId'],
				'index'      => $item['index'],
				'ok'         => $ok,
				'error'      => $error,
				'method'     => 'batch_v1',
				'httpStatus' => $http,
			);
		}
		return $mapped;
	}

	/**
	 * @param array<int,array<string,mixed>> $payload Items sent.
	 * @param string                         $error Error.
	 * @param int|null                       $status HTTP status.
	 * @return array<int,array<string,mixed>>
	 */
	private static function fail_slice( $payload, $error, $status ) {
		$out = array();
		foreach ( $payload as $item ) {
			$out[] = array(
				'postId'     => $item['postId'],
				'index'      => $item['index'],
				'ok'         => false,
				'error'      => $error,
				'method'     => 'batch_v1',
				'httpStatus' => $status,
			);
		}
		return $out;
	}
}
