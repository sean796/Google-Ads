<?php
/**
 * WordPress posts inventory and list routes (posts-list.js).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Posts_Inventory {

	const INVENTORY_TIMEOUT = 120;
	const BENCHMARK_AUTO_LARGE_POST_TOTAL = 200;
	const BENCHMARK_AUTO_CAP_POST_ROWS    = 400;
	const BENCHMARK_AUTO_CAP_OTHER_ROWS   = 120;
	const BENCHMARK_AUTO_CAP_TOTAL_ROWS   = 520;

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_scheduled_posts( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return array( 400, array( 'count' => 0, 'error' => 'Missing required fields: siteUrl, username, appPassword' ) );
		}

		$normalized    = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$all_scheduled = array();
		$all_posts     = array();
		$all_flag      = ! empty( $body['allScheduled'] );
		$target_month  = isset( $body['month'] ) ? (int) $body['month'] : (int) gmdate( 'n' ) - 1;
		$target_year   = isset( $body['year'] ) ? (int) $body['year'] : (int) gmdate( 'Y' );
		$warm          = Neo_Pulse_App_Wp_Rest_Client::warm_origin_session( $normalized );
		$page          = 1;
		$has_more      = true;

		while ( $has_more ) {
			$resp = Neo_Pulse_App_Wp_Rest_Client::request(
				'GET',
				$normalized . '/wp-json/wp/v2/posts',
				$username,
				$app_password,
				array(
					'timeout'  => 15,
					'referer'  => $normalized . '/',
					'cookie'   => $warm['cookie'],
					'params'   => array(
						'status'   => 'future',
						'per_page' => 100,
						'page'     => $page,
					),
				)
			);
			if ( $resp['is_wp_error'] ) {
				return array( 200, array( 'count' => 0, 'error' => $resp['error'] ) );
			}
			if ( Neo_Pulse_App_Wp_Url_Normalize::rest_looks_like_siteground_captcha( (int) $resp['status'], $resp['body'] ) ) {
				return array( 502, array( 'count' => 0, 'posts' => array(), 'error' => Neo_Pulse_App_Wp_Url_Normalize::SITEGROUND_REST_BLOCKED_MESSAGE ) );
			}
			if ( (int) $resp['status'] === 401 ) {
				return array( 200, array( 'count' => 0, 'error' => 'Authentication failed.' ) );
			}
			if ( (int) $resp['status'] !== 200 || ! is_array( $resp['body'] ) ) {
				break;
			}
			$posts = $resp['body'];
			if ( ! $posts ) {
				break;
			}
			$all_posts = array_merge( $all_posts, $posts );
			$filtered  = $all_flag ? $posts : array_values(
				array_filter(
					$posts,
					static function ( $post ) use ( $target_month, $target_year ) {
						if ( ! is_array( $post ) || empty( $post['date_gmt'] ) ) {
							return false;
						}
						$ts = strtotime( $post['date_gmt'] . ' UTC' );
						return (int) gmdate( 'n', $ts ) - 1 === $target_month && (int) gmdate( 'Y', $ts ) === $target_year;
					}
				)
			);
			$all_scheduled = array_merge( $all_scheduled, $filtered );
			$total_pages   = (int) ( $resp['headers']['x-wp-totalpages'] ?? 1 );
			if ( $page >= $total_pages || count( $posts ) < 100 ) {
				$has_more = false;
			} else {
				++$page;
			}
		}

		$mapped = array_map(
			static function ( $post ) {
				$url = (string) ( $post['link'] ?? '' );
				return array(
					'id'       => (int) ( $post['id'] ?? 0 ),
					'slug'     => (string) ( $post['slug'] ?? '' ),
					'date_gmt' => (string) ( $post['date_gmt'] ?? '' ),
					'title'    => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['title'] ?? '' ),
					'url'      => $url,
					'link'     => $url,
					'status'   => 'future',
				);
			},
			$all_scheduled
		);

		$payload = array(
			'count'        => count( $mapped ),
			'posts'        => $mapped,
			'month'        => $all_flag ? null : $target_month,
			'year'         => $all_flag ? null : $target_year,
			'allScheduled' => $all_flag,
			'debug'        => array(
				'totalScheduledPosts' => count( $all_posts ),
				'targetMonth'         => $all_flag ? null : $target_month + 1,
				'targetYear'          => $all_flag ? null : $target_year,
			),
		);

		if ( ! empty( $body['includeEntityScheduled'] ) ) {
			list( , $entity_payload ) = self::get_scheduled_entity_posts( $body );
			$payload['entityPosts']            = isset( $entity_payload['posts'] ) && is_array( $entity_payload['posts'] )
				? $entity_payload['posts']
				: array();
			$payload['entityPostTypeEndpoint'] = $entity_payload['postTypeEndpoint'] ?? null;
			$payload['entityScheduledError']   = $entity_payload['error'] ?? null;
		}

		return array( 200, $payload );
	}

	/**
	 * Future posts from the entity/SAP REST collection (manual endpoint or entity sitemap).
	 *
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_scheduled_entity_posts( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return array( 400, array( 'count' => 0, 'error' => 'Missing required fields: siteUrl, username, appPassword' ) );
		}

		$secondary = Neo_Pulse_App_Wp_Url_Normalize::resolve_secondary_rest_collection(
			isset( $body['manualEndpoint'] ) ? $body['manualEndpoint'] : null,
			isset( $body['entitySitemapUrl'] ) ? $body['entitySitemapUrl'] : null
		);
		if ( ! $secondary ) {
			return array(
				200,
				array(
					'count'              => 0,
					'posts'              => array(),
					'postTypeEndpoint'   => null,
					'error'              => 'Entity collection not configured.',
				),
			);
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$warm       = Neo_Pulse_App_Wp_Rest_Client::warm_origin_session( $normalized );
		$all_posts  = array();
		$page       = 1;
		$has_more   = true;

		while ( $has_more ) {
			$resp = Neo_Pulse_App_Wp_Rest_Client::request(
				'GET',
				$normalized . '/wp-json/wp/v2/' . rawurlencode( $secondary ),
				$username,
				$app_password,
				array(
					'timeout' => 15,
					'referer' => $normalized . '/',
					'cookie'  => $warm['cookie'],
					'params'  => array(
						'status'   => 'future',
						'per_page' => 100,
						'page'     => $page,
					),
				)
			);
			if ( $resp['is_wp_error'] ) {
				return array( 200, array( 'count' => 0, 'posts' => array(), 'error' => $resp['error'] ) );
			}
			if ( (int) $resp['status'] === 401 ) {
				return array( 200, array( 'count' => 0, 'posts' => array(), 'error' => 'Authentication failed.' ) );
			}
			if ( (int) $resp['status'] !== 200 || ! is_array( $resp['body'] ) ) {
				break;
			}
			$posts = $resp['body'];
			if ( ! $posts ) {
				break;
			}
			$all_posts   = array_merge( $all_posts, $posts );
			$total_pages = (int) ( $resp['headers']['x-wp-totalpages'] ?? 1 );
			if ( $page >= $total_pages || count( $posts ) < 100 ) {
				$has_more = false;
			} else {
				++$page;
			}
		}

		$mapped = array_map(
			static function ( $post ) use ( $secondary ) {
				$url = (string) ( $post['link'] ?? '' );
				return array(
					'id'                 => (int) ( $post['id'] ?? 0 ),
					'slug'               => (string) ( $post['slug'] ?? '' ),
					'date_gmt'           => (string) ( $post['date_gmt'] ?? '' ),
					'title'              => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['title'] ?? '' ),
					'url'                => $url,
					'link'               => $url,
					'status'             => 'future',
					'postTypeEndpoint'   => $secondary,
				);
			},
			$all_posts
		);

		return array(
			200,
			array(
				'count'            => count( $mapped ),
				'posts'            => $mapped,
				'postTypeEndpoint' => $secondary,
			),
		);
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_published_posts( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$limit        = isset( $body['limit'] ) ? (int) $body['limit'] : 100;
		$offset       = isset( $body['offset'] ) ? (int) $body['offset'] : 0;

		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return array( 400, array( 'count' => 0, 'error' => 'Missing required fields' ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$warm       = Neo_Pulse_App_Wp_Rest_Client::warm_origin_session( $normalized );
		$all        = array();
		$page       = (int) floor( $offset / 100 ) + 1;
		$has_more   = true;

		while ( $has_more && count( $all ) < $limit ) {
			$resp = Neo_Pulse_App_Wp_Rest_Client::request(
				'GET',
				$normalized . '/wp-json/wp/v2/posts',
				$username,
				$app_password,
				array(
					'timeout' => 30,
					'referer' => $normalized . '/',
					'cookie'  => $warm['cookie'],
					'params'  => array(
						'status'   => 'publish',
						'per_page' => min( 100, $limit - count( $all ) ),
						'page'     => $page,
						'_fields'  => 'id,slug,title,date_gmt,excerpt,link',
					),
				)
			);
			if ( Neo_Pulse_App_Wp_Url_Normalize::rest_looks_like_siteground_captcha( (int) $resp['status'], $resp['body'] ) ) {
				return array( 502, array( 'count' => 0, 'posts' => array(), 'error' => Neo_Pulse_App_Wp_Url_Normalize::SITEGROUND_REST_BLOCKED_MESSAGE ) );
			}
			if ( (int) $resp['status'] === 401 ) {
				return array( 200, array( 'count' => 0, 'error' => 'Authentication failed.' ) );
			}
			if ( (int) $resp['status'] !== 200 || ! is_array( $resp['body'] ) ) {
				break;
			}
			foreach ( $resp['body'] as $post ) {
				if ( ! is_array( $post ) ) {
					continue;
				}
				$all[] = array(
					'id'       => (int) ( $post['id'] ?? 0 ),
					'slug'     => (string) ( $post['slug'] ?? '' ),
					'title'    => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['title'] ?? '' ) ?: 'Untitled',
					'date_gmt' => (string) ( $post['date_gmt'] ?? '' ),
					'excerpt'  => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['excerpt'] ?? '' ),
					'link'     => (string) ( $post['link'] ?? '' ),
				);
			}
			$total_pages = (int) ( $resp['headers']['x-wp-totalpages'] ?? 1 );
			if ( $page >= $total_pages || count( $resp['body'] ) < 100 || count( $all ) >= $limit ) {
				$has_more = false;
			} else {
				++$page;
			}
		}

		$slice = array_slice( $all, $offset % 100 );
		if ( ! $slice && ! $all ) {
			return array( 200, array( 'count' => 0, 'error' => 'No published posts found.' ) );
		}
		return array( 200, array( 'count' => count( $slice ), 'posts' => $slice, 'total' => count( $all ) ) );
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_site_post_inventory( $body ) {
		$check = self::require_auth( $body );
		if ( $check ) {
			return $check;
		}
		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( (string) $body['siteUrl'] );
		$collection = ( isset( $body['collection'] ) && $body['collection'] === 'pages' ) ? 'pages' : 'posts';
		$result     = Neo_Pulse_App_Wp_Inventory_Collector::collect(
			$normalized,
			(string) $body['username'],
			(string) $body['appPassword'],
			$collection,
			! empty( $body['includeContent'] ),
			! empty( $body['includeRawAcf'] ),
			false,
			'publish',
			null,
			null
		);
		if ( empty( $result['ok'] ) ) {
			$status = ! empty( $result['siteground'] ) ? 502 : 200;
			return array( $status, array( 'site' => array( 'url' => $normalized ), 'posts' => array(), 'error' => $result['error'] ) );
		}
		$rows = $result['rows'];
		if ( ! empty( $body['includeScheduled'] ) && $collection === 'posts' ) {
			$future = Neo_Pulse_App_Wp_Inventory_Collector::collect( $normalized, (string) $body['username'], (string) $body['appPassword'], 'posts', ! empty( $body['includeContent'] ), ! empty( $body['includeRawAcf'] ), false, 'future', null, null );
			if ( ! empty( $future['ok'] ) ) {
				$rows = Neo_Pulse_App_Wp_Inventory_Collector::merge_rows_by_id( $rows, $future['rows'] );
			}
		}
		return array( 200, array( 'site' => array( 'url' => $normalized ), 'posts' => $rows, 'total' => count( $rows ) ) );
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_site_inventory_bulk( $body ) {
		$check = self::require_auth( $body );
		if ( $check ) {
			return $check;
		}
		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( (string) $body['siteUrl'] );
		$cols       = isset( $body['collections'] ) && is_array( $body['collections'] ) && $body['collections']
			? array_values( array_unique( array_map( 'strval', $body['collections'] ) ) )
			: array( 'posts', 'pages' );
		$include_ids = array();
		if ( ! empty( $body['includeIds'] ) && is_array( $body['includeIds'] ) ) {
			foreach ( $body['includeIds'] as $id ) {
				$n = (int) $id;
				if ( $n > 0 ) {
					$include_ids[] = $n;
				}
			}
			$include_ids = array_values( array_unique( $include_ids ) );
		}

		$rows           = array();
		$errors         = array();
		$truncated      = false;
		$large_site     = false;
		$inventory_auto = ( isset( $body['inventorySizing'] ) && $body['inventorySizing'] === 'auto' );

		foreach ( $cols as $coll ) {
			$rest = ( $coll === 'pages' ) ? 'pages' : ( ( $coll === 'posts' ) ? 'posts' : $coll );
			$max  = null;
			if ( $inventory_auto && $large_site ) {
				$max = ( $rest === 'posts' ) ? self::BENCHMARK_AUTO_CAP_POST_ROWS : self::BENCHMARK_AUTO_CAP_OTHER_ROWS;
				if ( count( $rows ) >= self::BENCHMARK_AUTO_CAP_TOTAL_ROWS ) {
					break;
				}
			}
			$result = Neo_Pulse_App_Wp_Inventory_Collector::collect(
				$normalized,
				(string) $body['username'],
				(string) $body['appPassword'],
				$rest,
				! empty( $body['includeContent'] ),
				! empty( $body['includeRawAcf'] ),
				! empty( $body['includePageHeading'] ),
				'publish',
				$include_ids ? $include_ids : null,
				$max
			);
			if ( empty( $result['ok'] ) ) {
				$errors[ $coll ] = $result['error'];
				continue;
			}
			if ( ! empty( $result['truncated'] ) ) {
				$truncated = true;
			}
			if ( $inventory_auto && $rest === 'posts' && ! empty( $result['wpTotal'] ) && $result['wpTotal'] > self::BENCHMARK_AUTO_LARGE_POST_TOTAL ) {
				$large_site = true;
				$truncated  = true;
			}
			foreach ( $result['rows'] as $row ) {
				$row['collection'] = $coll;
				$rows[]            = $row;
			}
			if ( ! empty( $body['includeScheduled'] ) && ! $include_ids ) {
				$future = Neo_Pulse_App_Wp_Inventory_Collector::collect( $normalized, (string) $body['username'], (string) $body['appPassword'], $rest, ! empty( $body['includeContent'] ), ! empty( $body['includeRawAcf'] ), ! empty( $body['includePageHeading'] ), 'future', null, null );
				if ( empty( $future['ok'] ) ) {
					$errors[ $coll . '_future' ] = $future['error'];
				} else {
					$rows = Neo_Pulse_App_Wp_Inventory_Collector::merge_rows_by_id_with_collection( $rows, $future['rows'], $coll );
				}
			}
		}

		$payload = array(
			'site'  => array( 'url' => $normalized ),
			'rows'  => $rows,
			'total' => count( $rows ),
		);
		if ( $errors ) {
			$payload['errors'] = $errors;
		}
		if ( $truncated ) {
			$payload['truncated'] = true;
		}
		if ( $large_site ) {
			$payload['inventorySizing'] = 'large';
		} elseif ( $inventory_auto ) {
			$payload['inventorySizing'] = 'full';
		}
		return array( 200, $payload );
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_posts_list( $body ) {
		$check = self::require_auth( $body );
		if ( $check ) {
			return $check;
		}
		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( (string) $body['siteUrl'] );
		$post_type  = isset( $body['postType'] ) ? (string) $body['postType'] : 'post';
		$endpoint   = ! empty( $body['postTypeEndpoint'] )
			? (string) $body['postTypeEndpoint']
			: Neo_Pulse_App_Wp_Url_Normalize::get_rest_endpoint( $post_type );
		$page       = isset( $body['page'] ) ? (int) $body['page'] : 1;
		$per_page   = isset( $body['perPage'] ) ? min( 100, (int) $body['perPage'] ) : 100;
		$include_acf = ! empty( $body['includeAcf'] );
		$warm       = Neo_Pulse_App_Wp_Rest_Client::warm_origin_session( $normalized );
		$params     = array(
			'per_page' => $per_page,
			'page'     => $page,
			'_fields'  => $include_acf
				? 'id,slug,title,date_gmt,excerpt,link,status,type,post_type,acf,neo_pulse_fields'
				: 'id,slug,title,date_gmt,excerpt,link,status,type,post_type',
		);
		if ( $include_acf ) {
			$params['context'] = 'edit';
		}
		if ( ! empty( $body['status'] ) ) {
			$params['status'] = (string) $body['status'];
		}
		$resp = Neo_Pulse_App_Wp_Rest_Client::request(
			'GET',
			$normalized . '/wp-json/wp/v2/' . rawurlencode( $endpoint ),
			(string) $body['username'],
			(string) $body['appPassword'],
			array(
				'timeout' => 30,
				'referer' => $normalized . '/',
				'cookie'  => $warm['cookie'],
				'params'  => $params,
			)
		);
		if ( Neo_Pulse_App_Wp_Url_Normalize::rest_looks_like_siteground_captcha( (int) $resp['status'], $resp['body'] ) ) {
			return array( 502, array( 'posts' => array(), 'error' => Neo_Pulse_App_Wp_Url_Normalize::SITEGROUND_REST_BLOCKED_MESSAGE ) );
		}
		if ( (int) $resp['status'] === 401 ) {
			return array( 200, array( 'posts' => array(), 'error' => 'Authentication failed.' ) );
		}
		if ( (int) $resp['status'] === 404 ) {
			return array( 200, array( 'posts' => array(), 'error' => 'Post type endpoint not found: ' . $endpoint ) );
		}
		if ( (int) $resp['status'] !== 200 || ! is_array( $resp['body'] ) ) {
			return array( 500, array( 'posts' => array(), 'error' => 'Unexpected response' ) );
		}
		$posts = array();
		foreach ( $resp['body'] as $post ) {
			if ( ! is_array( $post ) ) {
				continue;
			}
			$row = array(
				'id'        => (int) ( $post['id'] ?? 0 ),
				'slug'      => (string) ( $post['slug'] ?? '' ),
				'title'     => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['title'] ?? '' ) ?: 'Untitled',
				'date_gmt'  => (string) ( $post['date_gmt'] ?? '' ),
				'excerpt'   => Neo_Pulse_App_Wp_Url_Normalize::rendered_text( $post['excerpt'] ?? '' ),
				'link'      => (string) ( $post['link'] ?? '' ),
				'status'    => (string) ( $post['status'] ?? 'publish' ),
				'type'      => (string) ( $post['type'] ?? $post_type ),
				'post_type' => (string) ( $post['post_type'] ?? $post_type ),
			);
			if ( $include_acf ) {
				$acf       = Neo_Pulse_App_Wp_Url_Normalize::rest_acf_from_post( $post );
				$row['acf'] = is_array( $acf ) ? $acf : array();
			}
			$posts[] = $row;
		}
		return array(
			200,
			array(
				'posts'       => $posts,
				'total'       => (int) ( $resp['headers']['x-wp-total'] ?? 0 ),
				'totalPages'  => (int) ( $resp['headers']['x-wp-totalpages'] ?? 1 ),
				'currentPage' => $page,
			),
		);
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_post_types( $body ) {
		$check = self::require_auth( $body );
		if ( $check ) {
			return $check;
		}
		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( (string) $body['siteUrl'] );
		$warm       = Neo_Pulse_App_Wp_Rest_Client::warm_origin_session( $normalized );
		$resp       = Neo_Pulse_App_Wp_Rest_Client::request(
			'GET',
			$normalized . '/wp-json/wp/v2/types',
			(string) $body['username'],
			(string) $body['appPassword'],
			array(
				'timeout' => 10,
				'referer' => $normalized . '/',
				'cookie'  => $warm['cookie'],
			)
		);
		$skip = array( 'attachment', 'revision', 'nav_menu_item', 'custom_css', 'customize_changeset', 'oembed_cache', 'user_request', 'wp_block' );
		if ( ! $resp['is_wp_error'] && (int) $resp['status'] === 200 && is_array( $resp['body'] ) ) {
			$types = array();
			foreach ( $resp['body'] as $name => $info ) {
				if ( in_array( $name, $skip, true ) ) {
					continue;
				}
				$types[] = array(
					'name'     => $name,
					'restBase' => is_array( $info ) && ! empty( $info['rest_base'] ) ? (string) $info['rest_base'] : $name,
					'label'    => is_array( $info ) && ! empty( $info['name'] ) ? (string) $info['name'] : $name,
				);
			}
			return array(
				200,
				array(
					'postTypes' => array_column( $types, 'name' ),
					'types'     => $types,
				),
			);
		}
		return array(
			200,
			array(
				'postTypes' => array( 'post', 'page' ),
				'types'     => array(
					array( 'name' => 'post', 'restBase' => 'posts', 'label' => 'Posts' ),
					array( 'name' => 'page', 'restBase' => 'pages', 'label' => 'Pages' ),
				),
			),
		);
	}

	/**
	 * @param array<string,mixed> $body Body.
	 * @return array{0:int,1:array<string,mixed>}|null
	 */
	private static function require_auth( $body ) {
		if ( empty( $body['siteUrl'] ) || empty( $body['username'] ) || empty( $body['appPassword'] ) ) {
			return array(
				400,
				array(
					'site'  => array( 'url' => '' ),
					'posts' => array(),
					'rows'  => array(),
					'error' => 'Missing required fields: siteUrl, username, appPassword',
				),
			);
		}
		return null;
	}
}
