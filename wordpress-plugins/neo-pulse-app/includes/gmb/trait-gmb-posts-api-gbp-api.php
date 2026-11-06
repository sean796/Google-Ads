<?php
/**
 * GBP directory lookups and local post API calls.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Gmb_Posts_Api_Trait_Gbp_Api {

	/**
	 * @param array<int,string> $accounts
	 * @return array<int,array<string,mixed>>
	 */
	private static function list_all_location_records( string $access_token, array $accounts ): array {
		$records = array();
		foreach ( $accounts as $account_name ) {
			$page_token = '';
			do {
				$url = self::MYBUSINESS_V4_BASE . '/' . $account_name . '/locations?pageSize=100';
				if ( $page_token !== '' ) {
					$url .= '&pageToken=' . rawurlencode( $page_token );
				}
				$response = wp_remote_get(
					$url,
					array(
						'timeout' => 20,
						'headers' => array( 'Authorization' => 'Bearer ' . $access_token ),
					)
				);
				if ( ! is_wp_error( $response ) ) {
					$code = (int) wp_remote_retrieve_response_code( $response );
					if ( $code >= 200 && $code < 300 ) {
						$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
						if ( is_array( $data ) && ! empty( $data['locations'] ) && is_array( $data['locations'] ) ) {
							foreach ( $data['locations'] as $location ) {
								if ( ! is_array( $location ) || empty( $location['name'] ) ) {
									continue;
								}
								$records[] = array(
									'name'  => (string) $location['name'],
									'title' => (string) ( $location['locationName'] ?? $location['title'] ?? '' ),
									'raw'   => $location,
								);
							}
						}
						$page_token = isset( $data['nextPageToken'] ) ? (string) $data['nextPageToken'] : '';
					} else {
						$page_token = '';
					}
				} else {
					$page_token = '';
				}
				if ( $page_token === '' ) {
					break;
				}
			} while ( $page_token !== '' );
		}

		foreach ( $accounts as $account_name ) {
			$page_token = '';
			do {
				$url = self::BUSINESS_INFO_BASE . '/' . $account_name . '/locations?readMask=name,title,websiteUri,metadata&pageSize=100';
				if ( $page_token !== '' ) {
					$url .= '&pageToken=' . rawurlencode( $page_token );
				}
				$response = wp_remote_get(
					$url,
					array(
						'timeout' => 20,
						'headers' => array( 'Authorization' => 'Bearer ' . $access_token ),
					)
				);
				if ( is_wp_error( $response ) ) {
					break;
				}
				$code = (int) wp_remote_retrieve_response_code( $response );
				if ( $code < 200 || $code >= 300 ) {
					break;
				}
				$data = json_decode( (string) wp_remote_retrieve_body( $response ), true );
				if ( ! is_array( $data ) ) {
					break;
				}
				$locations = isset( $data['locations'] ) && is_array( $data['locations'] ) ? $data['locations'] : array();
				foreach ( $locations as $location ) {
					if ( ! is_array( $location ) || empty( $location['name'] ) ) {
						continue;
					}
					$name = (string) $location['name'];
					$seen = false;
					foreach ( $records as $existing ) {
						if ( ( $existing['name'] ?? '' ) === $name ) {
							$seen = true;
							break;
						}
					}
					if ( $seen ) {
						continue;
					}
					$records[] = array(
						'name'  => $name,
						'title' => (string) ( $location['title'] ?? '' ),
						'raw'   => $location,
					);
				}
				$page_token = isset( $data['nextPageToken'] ) ? (string) $data['nextPageToken'] : '';
			} while ( $page_token !== '' );
		}

		return $records;
	}

	private static function probe_local_posts_parent( string $access_token, string $location_name ): bool {
		$response = wp_remote_get(
			self::MYBUSINESS_V4_BASE . '/' . $location_name . '/localPosts?pageSize=1',
			array(
				'timeout' => 20,
				'headers' => array( 'Authorization' => 'Bearer ' . $access_token ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return false;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		return $code >= 200 && $code < 300;
	}

	/**
	 * @return array<int,string>
	 */
	private static function list_account_names( string $access_token ): array {
		if ( is_array( self::$account_names_cache ) ) {
			return self::$account_names_cache;
		}
		$response = wp_remote_get(
			self::ACCOUNT_MGMT_BASE . '/accounts',
			array(
				'timeout' => 20,
				'headers' => array( 'Authorization' => 'Bearer ' . $access_token ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return array();
		}
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $data ) || empty( $data['accounts'] ) ) {
			return array();
		}
		$out = array();
		foreach ( $data['accounts'] as $account ) {
			if ( is_array( $account ) && ! empty( $account['name'] ) ) {
				$out[] = (string) $account['name'];
			}
		}
		self::$account_names_cache = $out;
		return $out;
	}

	/**
	 * @return array<int,array<string,mixed>>|WP_Error
	 */
	private static function fetch_all_local_posts( string $access_token, string $location_name ) {
		$all        = array();
		$token      = '';
		$page_guard = 0;
		do {
			++$page_guard;
			if ( $page_guard > 20 ) {
				break;
			}
			$url = self::MYBUSINESS_V4_BASE . '/' . $location_name . '/localPosts?pageSize=100';
			if ( $token !== '' ) {
				$url .= '&pageToken=' . rawurlencode( $token );
			}
			$response = wp_remote_get(
				$url,
				array(
					'timeout' => 30,
					'headers' => array( 'Authorization' => 'Bearer ' . $access_token ),
				)
			);
			if ( is_wp_error( $response ) ) {
				return $response;
			}
			$code = (int) wp_remote_retrieve_response_code( $response );
			$data = json_decode( wp_remote_retrieve_body( $response ), true );
			if ( $code === 404 ) {
				return new WP_Error(
					'neo-pulse_gmb_location_not_found',
					'GBP location not found for posting. Re-save the business.google.com profile URL on this property in Integrations.'
				);
			}
			if ( $code === 429 ) {
				return new WP_Error( 'neo-pulse_gmb_quota', 'Google Business Profile quota exceeded. Wait a minute and try again.' );
			}
			if ( $code < 200 || $code >= 300 ) {
				$msg = is_array( $data ) && ! empty( $data['error']['message'] )
					? (string) $data['error']['message']
					: 'HTTP ' . $code;
				return new WP_Error( 'neo-pulse_gmb_api', $msg );
			}
			$batch = is_array( $data ) && ! empty( $data['localPosts'] ) && is_array( $data['localPosts'] )
				? $data['localPosts']
				: array();
			$all   = array_merge( $all, $batch );
			$token = is_array( $data ) && ! empty( $data['nextPageToken'] ) ? (string) $data['nextPageToken'] : '';
		} while ( $token !== '' );

		return $all;
	}

	/**
	 * @param array<string,mixed> $post
	 * @return array<string,mixed>|null
	 */
	private static function map_local_post_row( array $post ): ?array {
		$media_url = '';
		if ( ! empty( $post['media'] ) && is_array( $post['media'] ) ) {
			foreach ( $post['media'] as $media ) {
				if ( is_array( $media ) && ! empty( $media['sourceUrl'] ) ) {
					$media_url = (string) $media['sourceUrl'];
					break;
				}
			}
		}
		return array(
			'name'           => (string) ( $post['name'] ?? '' ),
			'createTime'     => (string) ( $post['createTime'] ?? '' ),
			'updateTime'     => (string) ( $post['updateTime'] ?? '' ),
			'state'          => (string) ( $post['state'] ?? '' ),
			'topicType'      => (string) ( $post['topicType'] ?? '' ),
			'summary'        => (string) ( $post['summary'] ?? '' ),
			'ctaActionType'  => (string) ( $post['callToAction']['actionType'] ?? '' ),
			'ctaUrl'         => (string) ( $post['callToAction']['url'] ?? '' ),
			'mediaSourceUrl' => $media_url,
		);
	}

	/**
	 * @return true|WP_Error
	 */
	private static function create_local_post(
		string $access_token,
		string $location_name,
		string $summary,
		string $cta_url,
		?string $image_url
	) {
		$post_body = array(
			'topicType'    => 'STANDARD',
			'languageCode' => substr( get_locale(), 0, 2 ) ?: 'en',
			'summary'      => $summary,
			'callToAction' => array(
				'actionType' => 'LEARN_MORE',
				'url'        => $cta_url,
			),
		);
		if ( $image_url ) {
			$post_body['media'] = array(
				array(
					'mediaFormat' => 'PHOTO',
					'sourceUrl'   => $image_url,
				),
			);
		}

		$response = wp_remote_post(
			self::MYBUSINESS_V4_BASE . '/' . $location_name . '/localPosts',
			array(
				'timeout' => 30,
				'headers' => array(
					'Authorization' => 'Bearer ' . $access_token,
					'Content-Type'  => 'application/json',
				),
				'body'    => wp_json_encode( $post_body ),
			)
		);
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code === 429 ) {
			return new WP_Error( 'neo-pulse_gmb_quota', 'Google Business Profile quota exceeded. Wait a minute and try again.' );
		}
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $data ) && ! empty( $data['error']['message'] )
				? (string) $data['error']['message']
				: 'Google localPosts create failed (HTTP ' . $code . ').';
			return new WP_Error( 'neo-pulse_gmb_api', $msg );
		}
		return true;
	}
}
