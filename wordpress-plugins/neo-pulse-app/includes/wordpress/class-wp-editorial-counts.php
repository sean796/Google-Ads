<?php
/**
 * Editorial quarter counts and optimization activity counts.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Editorial_Counts {

	const MAX_SCAN_PAGES = 500;

	/** SAP pages live in the `service-area` post type on every Neo Digital site (REST base `service-area`). */
	const SAP_REST_COLLECTION = 'service-area';

	/**
	 * Manual endpoint or entity sitemap override wins; otherwise the SAP post type.
	 *
	 * @param array<string,mixed> $body Request body.
	 * @return string
	 */
	private static function resolve_sap_collection( $body ) {
		$resolved = Neo_Pulse_App_Wp_Url_Normalize::resolve_secondary_rest_collection(
			isset( $body['manualEndpoint'] ) ? $body['manualEndpoint'] : null,
			isset( $body['entitySitemapUrl'] ) ? $body['entitySitemapUrl'] : null
		);
		return $resolved ? $resolved : self::SAP_REST_COLLECTION;
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_quarter_editorial_counts( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$after        = isset( $body['after'] ) ? (string) $body['after'] : '';
		$before       = isset( $body['before'] ) ? (string) $body['before'] : '';

		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return array( 400, self::quarter_error( 'Missing required fields: siteUrl, username, appPassword' ) );
		}
		if ( $after === '' || $before === '' ) {
			return array( 400, self::quarter_error( 'Missing required fields: after, before (ISO8601 range for the quarter)' ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		if ( ! preg_match( '#^https?://#i', $normalized ) ) {
			return array( 400, self::quarter_error( 'Invalid site URL format.' ) );
		}

		$secondary        = self::resolve_sap_collection( $body );
		$entity_configured = true;
		$warm              = Neo_Pulse_App_Wp_Rest_Client::warm_origin_session( $normalized );
		$ctx               = array(
			'normalized'   => $normalized,
			'username'     => $username,
			'app_password' => $app_password,
			'cookie'       => $warm['cookie'],
			'after'        => $after,
			'before'       => $before,
		);

		$posts_rs = self::fetch_published_scheduled_pair( $ctx, 'posts' );
		if ( empty( $posts_rs['ok'] ) ) {
			if ( ! empty( $posts_rs['siteground'] ) ) {
				return array( 502, self::quarter_error( (string) $posts_rs['error'], $entity_configured ) );
			}
			return array( 200, self::quarter_error( (string) $posts_rs['error'], $entity_configured ) );
		}

		$entity_published        = null;
		$entity_scheduled        = null;
		$entity_counts_available = false;

		if ( $secondary ) {
			$entity_rs = self::fetch_published_scheduled_pair( $ctx, $secondary );
			if ( empty( $entity_rs['ok'] ) ) {
				if ( isset( $entity_rs['error'] ) && $entity_rs['error'] === 'not_found' ) {
					$entity_published        = 0;
					$entity_scheduled        = 0;
					$entity_counts_available = true;
				} elseif ( ! empty( $entity_rs['siteground'] ) ) {
					return array( 502, self::quarter_error( (string) $entity_rs['error'], $entity_configured ) );
				}
			} else {
				$entity_published        = (int) $entity_rs['published'];
				$entity_scheduled        = (int) $entity_rs['scheduled'];
				$entity_counts_available = true;
			}
		}

		$published_sum = (int) $posts_rs['published'] + ( $entity_counts_available ? (int) $entity_published : 0 );
		$scheduled_sum = (int) $posts_rs['scheduled'] + ( $entity_counts_available ? (int) $entity_scheduled : 0 );

		$out = array(
			'ok'                    => true,
			'postsPublished'        => (int) $posts_rs['published'],
			'postsScheduled'        => (int) $posts_rs['scheduled'],
			'entityPublished'       => $entity_published,
			'entityScheduled'       => $entity_scheduled,
			'entityConfigured'      => $entity_configured,
			'entityCountsAvailable' => $entity_counts_available,
			'published'             => $published_sum,
			'scheduled'             => $scheduled_sum,
		);
		if ( $secondary ) {
			$out['entityCollection'] = $secondary;
		}
		return array( 200, $out );
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_optimization_activity_counts( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$after        = isset( $body['after'] ) ? (string) $body['after'] : '';
		$before       = isset( $body['before'] ) ? (string) $body['before'] : '';

		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return array( 400, self::optimization_error( 'Missing required fields: siteUrl, username, appPassword' ) );
		}
		if ( $after === '' || $before === '' ) {
			return array( 400, self::optimization_error( 'Missing required fields: after, before (ISO8601 range for the editorial period)' ) );
		}

		$bounds = self::parse_period_bounds( $after, $before );
		if ( ! $bounds ) {
			return array( 400, self::optimization_error( 'Invalid after/before period bounds.' ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		if ( ! preg_match( '#^https?://#i', $normalized ) ) {
			return array( 400, self::optimization_error( 'Invalid site URL format.' ) );
		}

		$secondary        = self::resolve_sap_collection( $body );
		$entity_configured = true;
		$warm              = Neo_Pulse_App_Wp_Rest_Client::warm_origin_session( $normalized );
		$ctx               = array(
			'normalized'   => $normalized,
			'username'     => $username,
			'app_password' => $app_password,
			'cookie'       => $warm['cookie'],
			'start_ms'     => $bounds['startMs'],
			'end_ms'       => $bounds['endMs'],
		);

		$posts_rs = self::count_published_with_date_modifier( $ctx, 'posts' );
		if ( empty( $posts_rs['ok'] ) ) {
			if ( ! empty( $posts_rs['siteground'] ) ) {
				return array( 502, self::optimization_error( (string) $posts_rs['error'] ) );
			}
			return array( 200, self::optimization_error( (string) $posts_rs['error'] ) );
		}

		$entity_optimized        = 0;
		$entity_counts_available = false;

		if ( $secondary ) {
			$entity_rs = self::count_published_with_date_modifier( $ctx, $secondary );
			if ( empty( $entity_rs['ok'] ) ) {
				if ( isset( $entity_rs['error'] ) && $entity_rs['error'] === 'not_found' ) {
					$entity_optimized        = 0;
					$entity_counts_available = true;
				} elseif ( ! empty( $entity_rs['siteground'] ) ) {
					return array( 502, self::optimization_error( (string) $entity_rs['error'] ) );
				} else {
					return array( 200, self::optimization_error( (string) $entity_rs['error'] ) );
				}
			} else {
				$entity_optimized        = (int) $entity_rs['count'];
				$entity_counts_available = true;
			}
		}

		$total = (int) $posts_rs['count'] + ( $entity_counts_available ? $entity_optimized : 0 );
		$out   = array(
			'ok'                    => true,
			'postsOptimized'        => (int) $posts_rs['count'],
			'pagesOptimized'        => 0,
			'entityOptimized'       => $entity_counts_available ? $entity_optimized : null,
			'entityConfigured'      => $entity_configured,
			'entityCountsAvailable' => $entity_counts_available,
			'totalOptimized'        => $total,
		);
		if ( $secondary ) {
			$out['entityCollection'] = $secondary;
		}
		return array( 200, $out );
	}

	/**
	 * @param array<string,mixed> $ctx Request context.
	 * @param string              $collection REST collection.
	 * @return array<string,mixed>
	 */
	private static function fetch_published_scheduled_pair( $ctx, $collection ) {
		$pub = self::fetch_collection_status_total( $ctx, $collection, 'publish' );
		if ( empty( $pub['ok'] ) ) {
			return $pub;
		}
		$fut = self::fetch_collection_status_total( $ctx, $collection, 'future' );
		if ( empty( $fut['ok'] ) ) {
			return $fut;
		}
		return array(
			'ok'        => true,
			'published' => (int) $pub['total'],
			'scheduled' => (int) $fut['total'],
		);
	}

	/**
	 * @param array<string,mixed> $ctx Request context.
	 * @param string              $status Post status.
	 * @return array<string,mixed>
	 */
	private static function fetch_collection_status_total( $ctx, $collection, $status ) {
		$url  = $ctx['normalized'] . '/wp-json/wp/v2/' . rawurlencode( $collection );
		$resp = Neo_Pulse_App_Wp_Rest_Client::request(
			'GET',
			$url,
			$ctx['username'],
			$ctx['app_password'],
			array(
				'timeout'      => 20,
				'referer'      => $ctx['normalized'] . '/',
				'cookie'       => $ctx['cookie'],
				'content_type' => false,
				'params'       => array(
					'status'   => $status,
					'after'    => $ctx['after'],
					'before'   => $ctx['before'],
					'per_page' => 1,
					'page'     => 1,
					'_fields'  => 'id',
				),
			)
		);

		if ( $resp['is_wp_error'] ) {
			$msg = Neo_Pulse_App_Wp_Rest_Client::transport_error_message( $resp );
			return array( 'ok' => false, 'error' => $msg ?: $resp['error'] );
		}

		$status_code = (int) $resp['status'];
		if ( $status_code === 200 ) {
			return array( 'ok' => true, 'total' => self::read_wp_total( $resp['headers'] ) );
		}
		if ( $status_code === 401 ) {
			return array( 'ok' => false, 'error' => 'Authentication failed. Check username and application password.' );
		}
		if ( $status_code === 403 ) {
			return array( 'ok' => false, 'error' => 'Access forbidden for this post type or status.' );
		}
		if ( $status_code === 404 ) {
			return array( 'ok' => false, 'error' => 'not_found' );
		}
		if ( Neo_Pulse_App_Wp_Url_Normalize::rest_looks_like_siteground_captcha( $status_code, $resp['body'] ) ) {
			return array(
				'ok'         => false,
				'error'      => Neo_Pulse_App_Wp_Url_Normalize::SITEGROUND_REST_BLOCKED_MESSAGE,
				'siteground' => true,
			);
		}
		return array( 'ok' => false, 'error' => 'WordPress API error: ' . $status_code );
	}

	/**
	 * @param array<string,mixed> $ctx Request context.
	 * @param string              $collection REST collection.
	 * @return array<string,mixed>
	 */
	private static function count_published_with_date_modifier( $ctx, $collection ) {
		$url   = $ctx['normalized'] . '/wp-json/wp/v2/' . rawurlencode( $collection );
		$page  = 1;
		$total = 0;

		while ( true ) {
			if ( $page > self::MAX_SCAN_PAGES ) {
				return array(
					'ok'    => false,
					'error' => 'Too many published items to scan in one request. Raise the server limit or narrow usage.',
				);
			}

			$resp = Neo_Pulse_App_Wp_Rest_Client::request(
				'GET',
				$url,
				$ctx['username'],
				$ctx['app_password'],
				array(
					'timeout'      => 45,
					'referer'      => $ctx['normalized'] . '/',
					'cookie'       => $ctx['cookie'],
					'content_type' => false,
					'params'       => array(
						'status'   => 'publish',
						'per_page' => 100,
						'page'     => $page,
						'_fields'  => 'id,acf,date_gmt,date',
					),
				)
			);

			if ( $resp['is_wp_error'] ) {
				$msg = Neo_Pulse_App_Wp_Rest_Client::transport_error_message( $resp );
				return array( 'ok' => false, 'error' => $msg ?: $resp['error'] );
			}

			$status_code = (int) $resp['status'];
			if ( $status_code === 200 && is_array( $resp['body'] ) ) {
				$rows = $resp['body'];
				foreach ( $rows as $row ) {
					if ( is_array( $row ) && self::row_counts_toward_optimization( $row, $ctx['start_ms'], $ctx['end_ms'] ) ) {
						++$total;
					}
				}
				if ( count( $rows ) < 100 ) {
					return array( 'ok' => true, 'count' => $total );
				}
				++$page;
				continue;
			}
			if ( $status_code === 401 ) {
				return array( 'ok' => false, 'error' => 'Authentication failed. Check username and application password.' );
			}
			if ( $status_code === 403 ) {
				return array( 'ok' => false, 'error' => 'Access forbidden for this post type or status.' );
			}
			if ( $status_code === 404 ) {
				return array( 'ok' => false, 'error' => 'not_found' );
			}
			if ( Neo_Pulse_App_Wp_Url_Normalize::rest_looks_like_siteground_captcha( $status_code, $resp['body'] ) ) {
				return array(
					'ok'         => false,
					'error'      => Neo_Pulse_App_Wp_Url_Normalize::SITEGROUND_REST_BLOCKED_MESSAGE,
					'siteground' => true,
				);
			}
			return array( 'ok' => false, 'error' => 'WordPress API error: ' . $status_code );
		}
	}

	/**
	 * @param array<string,mixed> $row Post row.
	 * @param int                 $start_ms Period start.
	 * @param int                 $end_ms Period end.
	 * @return bool
	 */
	private static function row_counts_toward_optimization( $row, $start_ms, $end_ms ) {
		$acf = isset( $row['acf'] ) && is_array( $row['acf'] ) ? $row['acf'] : null;
		if ( ! $acf || ! array_key_exists( 'date_modifier', $acf ) ) {
			return false;
		}
		$raw = is_string( $acf['date_modifier'] ) ? trim( $acf['date_modifier'] ) : trim( (string) $acf['date_modifier'] );
		if ( $raw === '' ) {
			return false;
		}
		$ms = self::parse_date_modifier_to_ms( $raw );
		if ( ! is_finite( $ms ) || $ms < $start_ms || $ms >= $end_ms ) {
			return false;
		}
		return ! self::date_modifier_matches_published_utc_day( $row, $ms );
	}

	/**
	 * @param string $after_iso After ISO8601.
	 * @param string $before_iso Before ISO8601.
	 * @return array{startMs:int,endMs:int}|null
	 */
	private static function parse_period_bounds( $after_iso, $before_iso ) {
		$start = strtotime( trim( $after_iso ) );
		$end   = strtotime( trim( $before_iso ) );
		if ( ! $start || ! $end || $end <= $start ) {
			return null;
		}
		return array(
			'startMs' => (int) ( $start * 1000 ),
			'endMs'   => (int) ( $end * 1000 ),
		);
	}

	/**
	 * @param string $raw date_modifier value.
	 * @return float
	 */
	private static function parse_date_modifier_to_ms( $raw ) {
		if ( preg_match( '/^\d{4}-\d{2}-\d{2}$/', $raw ) ) {
			list( $y, $mo, $d ) = array_map( 'intval', explode( '-', $raw ) );
			return (float) gmmktime( 0, 0, 0, $mo, $d, $y ) * 1000;
		}
		$ts = strtotime( $raw );
		return $ts ? (float) ( $ts * 1000 ) : NAN;
	}

	/**
	 * @param array<string,mixed> $row Post row.
	 * @param float               $dm_ms date_modifier ms.
	 * @return bool
	 */
	private static function date_modifier_matches_published_utc_day( $row, $dm_ms ) {
		$pub_raw = isset( $row['date_gmt'] ) ? $row['date_gmt'] : ( isset( $row['date'] ) ? $row['date'] : null );
		if ( $pub_raw === null || $pub_raw === '' ) {
			return false;
		}
		$pub_ms = strtotime( trim( (string) $pub_raw ) );
		if ( ! $pub_ms ) {
			return false;
		}
		return self::utc_calendar_day_key( $dm_ms ) === self::utc_calendar_day_key( (float) ( $pub_ms * 1000 ) );
	}

	/**
	 * @param float $ms Epoch ms.
	 * @return string
	 */
	private static function utc_calendar_day_key( $ms ) {
		if ( ! is_finite( $ms ) ) {
			return '';
		}
		$sec = (int) floor( $ms / 1000 );
		return gmdate( 'Y-m-d', $sec );
	}

	/**
	 * @param array<string,string> $headers Response headers.
	 * @return int
	 */
	private static function read_wp_total( $headers ) {
		$raw = isset( $headers['x-wp-total'] ) ? $headers['x-wp-total'] : '0';
		$n   = (int) $raw;
		return $n >= 0 ? $n : 0;
	}

	/**
	 * @param string $message Error message.
	 * @param bool   $entity_configured Entity configured flag.
	 * @return array<string,mixed>
	 */
	private static function quarter_error( $message, $entity_configured = false ) {
		return array(
			'ok'                    => false,
			'postsPublished'        => null,
			'postsScheduled'        => null,
			'entityPublished'       => null,
			'entityScheduled'       => null,
			'entityConfigured'      => $entity_configured,
			'entityCountsAvailable' => false,
			'published'             => null,
			'scheduled'             => null,
			'error'                 => $message,
		);
	}

	/**
	 * @param string $message Error message.
	 * @return array<string,mixed>
	 */
	private static function optimization_error( $message ) {
		return array(
			'ok'                    => false,
			'postsOptimized'        => null,
			'pagesOptimized'        => null,
			'entityOptimized'       => null,
			'entityConfigured'      => false,
			'entityCountsAvailable' => false,
			'totalOptimized'        => null,
			'error'                 => $message,
		);
	}
}
