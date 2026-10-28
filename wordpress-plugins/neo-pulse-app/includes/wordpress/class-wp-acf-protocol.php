<?php
/**
 * Custom fields protocol routes (NEO Pulse native fields + WP REST acf).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Acf_Protocol {

	const BATCH_MAX = 100;

	/**
	 * Map NEO Pulse meta_hub keys to standard custom field keys.
	 *
	 * @param array<string,mixed> $meta_hub Values from Neo_Pulse_Wp_Ai_Context::meta_hub_values.
	 * @return array<string,string>
	 */
	public static function fields_from_pulse_meta_hub( array $meta_hub ): array {
		$out = array();
		$map = array(
			'focusKeyword'    => 'keyword_focus',
			'seoTitle'        => 'seo_title',
			'metaDescription' => 'meta_description',
			'seoResearch'     => 'seo_research',
			'faq'             => 'faq',
			'pageUrl'         => 'page_url',
		);
		foreach ( $map as $hub_k => $field_k ) {
			if ( isset( $meta_hub[ $hub_k ] ) && is_scalar( $meta_hub[ $hub_k ] ) ) {
				$val = trim( (string) $meta_hub[ $hub_k ] );
				if ( '' !== $val ) {
					$out[ $field_k ] = $val;
				}
			}
		}
		return $out;
	}

	/**
	 * Sync SEO and custom fields through `POST /wp-json/neo-pulse/v1/overview-seo/bulk`.
	 *
	 * @param string              $normalized   Normalized site URL.
	 * @param string              $username     Username.
	 * @param string              $app_password Application password.
	 * @param int                 $post_id      Post ID.
	 * @param array<string,mixed> $fields       Custom fields map.
	 * @return array{ok:bool,error?:string}
	 */
	public static function write_via_pulse_overview_bulk( string $normalized, string $username, string $app_password, int $post_id, array $fields ): array {
		$meta = array();
		$acf  = array();

		foreach ( $fields as $k => $v ) {
			if ( null === $v || ! is_scalar( $v ) ) {
				continue;
			}
			$str = trim( (string) $v );
			if ( '' === $str ) {
				continue;
			}
			switch ( (string) $k ) {
				case 'seo_title':
				case 'rank_math_title':
					$meta['rank_math_title'] = $str;
					break;
				case 'meta_description':
				case 'seo_meta_description':
				case 'rank_math_description':
					$meta['rank_math_description'] = $str;
					break;
				case 'keyword_focus':
				case 'focus_keyword':
				case 'rank_math_focus_keyword':
					$meta['rank_math_focus_keyword'] = $str;
					$acf['keyword_focus']            = $str;
					break;
				case 'faq':
				case 'seo_faq':
					$acf[ (string) $k ] = $str;
					break;
				case 'date_modifier':
				case 'seo_date_modifier':
					$acf[ (string) $k ] = $str;
					break;
				case 'seo_research':
					$acf['seo_research'] = $str;
					break;
			}
		}

		if ( array() === $meta && array() === $acf ) {
			return array( 'ok' => true );
		}

		$resp = Neo_Pulse_App_Wp_Rest_Client::request(
			'POST',
			$normalized . '/wp-json/neo-pulse/v1/overview-seo/bulk',
			$username,
			$app_password,
			array(
				'timeout' => 60,
				'body'    => array(
					'items' => array(
						array(
							'index'  => 0,
							'postId' => $post_id,
							'meta'   => $meta,
							'acf'    => $acf,
						),
					),
				),
			)
		);

		if ( $resp['is_wp_error'] || (int) $resp['status'] < 200 || (int) $resp['status'] >= 300 ) {
			$err = is_array( $resp['body'] ) && ! empty( $resp['body']['message'] )
				? (string) $resp['body']['message']
				: ( $resp['error'] ?: 'NEO Pulse bulk SEO write failed' );
			return array( 'ok' => false, 'error' => $err );
		}

		$row_ok = ! empty( $resp['body']['results'][0]['ok'] ) || ! empty( $resp['body']['success'] );
		if ( ! $row_ok ) {
			$row_err = (string) ( $resp['body']['results'][0]['error'] ?? 'NEO Pulse rejected field write' );
			return array( 'ok' => false, 'error' => $row_err );
		}

		return array( 'ok' => true );
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_acf_fields( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$post_id      = isset( $body['postId'] ) ? $body['postId'] : null;
		$post_type    = isset( $body['postType'] ) ? (string) $body['postType'] : 'post';
		$endpoint     = isset( $body['postTypeEndpoint'] ) ? $body['postTypeEndpoint'] : null;

		if ( $site_url === '' || $username === '' || $app_password === '' || $post_id === null || $post_id === '' ) {
			return array( 400, array( 'success' => false, 'error' => 'Missing required fields: siteUrl, username, appPassword, postId' ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$result     = self::fetch_acf_for_post_id( $normalized, $username, $app_password, $post_id, $post_type, $endpoint );
		return array( 200, $result );
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_acf_fields_batch( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$items        = isset( $body['items'] ) && is_array( $body['items'] ) ? $body['items'] : null;

		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return array( 400, array( 'error' => 'Missing required fields: siteUrl, username, appPassword' ) );
		}
		if ( ! is_array( $items ) || ! $items ) {
			return array( 400, array( 'error' => 'items must be a non-empty array' ) );
		}
		if ( count( $items ) > self::BATCH_MAX ) {
			return array( 400, array( 'error' => 'items length must be <= ' . self::BATCH_MAX ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$results    = array();
		foreach ( $items as $item ) {
			if ( ! is_array( $item ) ) {
				continue;
			}
			$post_id = isset( $item['postId'] ) ? $item['postId'] : null;
			$r       = self::fetch_acf_for_post_id(
				$normalized,
				$username,
				$app_password,
				$post_id,
				isset( $item['postType'] ) ? $item['postType'] : 'post',
				isset( $item['postTypeEndpoint'] ) ? $item['postTypeEndpoint'] : null
			);
			$id_num    = Neo_Pulse_App_Wp_Url_Normalize::normalize_post_id( $post_id );
			$results[] = array_merge(
				array( 'postId' => $id_num !== null ? $id_num : $post_id ),
				$r
			);
		}
		return array( 200, array( 'results' => $results ) );
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function update_acf_fields( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$post_id      = Neo_Pulse_App_Wp_Url_Normalize::normalize_post_id( isset( $body['postId'] ) ? $body['postId'] : null );
		$fields       = isset( $body['fields'] ) && is_array( $body['fields'] ) ? $body['fields'] : null;
		$post_type    = isset( $body['postType'] ) ? (string) $body['postType'] : 'post';
		$endpoint     = isset( $body['postTypeEndpoint'] ) ? $body['postTypeEndpoint'] : null;
		$options      = isset( $body['options'] ) && is_array( $body['options'] ) ? $body['options'] : array();

		if ( $site_url === '' || $username === '' || $app_password === '' || $post_id === null || ! is_array( $fields ) ) {
			return array( 400, array( 'success' => false, 'error' => 'Missing required fields: siteUrl, username, appPassword, postId, fields', 'updated' => array(), 'failed' => array() ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$collection = Neo_Pulse_App_Wp_Url_Normalize::resolve_wp_v2_collection_endpoint( $endpoint, $post_type );
		$validation = self::validate_acf_setup( $normalized, $username, $app_password, $collection, $post_id );

		$results = array(
			'success'     => true,
			'updated'     => array(),
			'failed'      => array(),
			'method'      => 'neo-pulse-fields',
			'diagnostics' => array( 'validation' => $validation ),
		);

		if ( ! empty( $options['validateOnly'] ) ) {
			return array(
				200,
				array(
					'success'       => ! empty( $validation['hasAcfSupport'] ),
					'validation'    => $validation,
					'wouldUpdate'   => array_keys( $fields ),
					'currentValues' => isset( $validation['acfFields'] ) ? $validation['acfFields'] : array(),
				),
			);
		}

		$acf_payload = array();
		foreach ( $fields as $name => $value ) {
			$serialized = self::serialize_acf_value( $value );
			if ( $serialized === null || $serialized === '' ) {
				continue;
			}
			if ( in_array( $name, array( 'seo_extra_image', 'extra_image' ), true ) && ( $serialized === '' || $serialized === 0 ) ) {
				continue;
			}
			$acf_payload[ (string) $name ] = $serialized;
		}

		if ( ! $acf_payload ) {
			return array( 200, array_merge( $results, array( 'success' => false, 'error' => 'No valid fields to update' ) ) );
		}

		// 1. Write SEO & core Pulse fields via native /wp-json/neo-pulse/v1/overview-seo/bulk.
		$pulse_sync = self::write_via_pulse_overview_bulk( $normalized, $username, $app_password, $post_id, $acf_payload );

		// 2. Write custom fields (e.g. seo_extra_text, description_of_area, origin) via WP REST collection.
		$url  = $normalized . '/wp-json/wp/v2/' . rawurlencode( $collection ) . '/' . $post_id;
		$resp = Neo_Pulse_App_Wp_Rest_Client::request(
			'POST',
			$url,
			$username,
			$app_password,
			array(
				'timeout' => 30,
				'body'    => array( 'neo_pulse_fields' => $acf_payload ),
			)
		);

		$wp_ok = ! $resp['is_wp_error'] && (int) $resp['status'] >= 200 && (int) $resp['status'] < 300;
		if ( ! $wp_ok && empty( $pulse_sync['ok'] ) ) {
			$msg = is_array( $resp['body'] ) && ! empty( $resp['body']['message'] )
				? (string) $resp['body']['message']
				: ( $pulse_sync['error'] ?? ( $resp['error'] ?: 'Field update failed' ) );
			return array(
				200,
				array(
					'success'     => false,
					'updated'     => array(),
					'failed'      => array_map(
						static function ( $name ) use ( $msg ) {
							return array( 'field' => $name, 'error' => $msg );
						},
						array_keys( $fields )
					),
					'error'       => $msg,
					'diagnostics' => $results['diagnostics'],
				),
			);
		}

		$results['updated'] = array_keys( $fields );
		$results['success'] = true;
		return array( 200, $results );
	}

	/**
	 * @param mixed $value Field value.
	 * @return mixed
	 */
	public static function serialize_acf_value( $value ) {
		if ( $value === null ) {
			return '';
		}
		if ( is_bool( $value ) || is_numeric( $value ) || is_array( $value ) ) {
			return $value;
		}
		return (string) $value;
	}

	/**
	 * @param string   $normalized Site URL.
	 * @param string   $username User.
	 * @param string   $app_password Password.
	 * @param string   $collection REST collection.
	 * @param int|null $post_id Post ID.
	 * @return array<string,mixed>
	 */
	public static function validate_acf_setup( $normalized, $username, $app_password, $collection, $post_id = null ) {
		$result = array(
			'hasAcfSupport'    => true,
			'acfFields'        => array(),
			'postTypeEndpoint' => $collection,
			'hasPermission'    => false,
			'errors'           => array(),
			'warnings'         => array(),
		);

		if ( $post_id !== null ) {
			$fetched = self::fetch_acf_for_post_id( $normalized, $username, $app_password, $post_id, $collection, $collection );
			if ( ! empty( $fetched['success'] ) ) {
				$result['hasPermission'] = true;
				$result['acfFields']     = is_array( $fetched['fields'] ?? null ) ? $fetched['fields'] : array();
			} elseif ( ! empty( $fetched['error'] ) ) {
				$result['errors'][] = (string) $fetched['error'];
			}
			return $result;
		}

		$list_url = $normalized . '/wp-json/wp/v2/' . rawurlencode( $collection ) . '?per_page=1&context=edit';
		$resp     = Neo_Pulse_App_Wp_Rest_Client::request( 'GET', $list_url, $username, $app_password, array( 'timeout' => 10 ) );
		if ( ! $resp['is_wp_error'] && (int) $resp['status'] === 200 ) {
			$result['hasPermission'] = true;
			if ( is_array( $resp['body'] ) && ! empty( $resp['body'][0] ) ) {
				$acf                 = Neo_Pulse_App_Wp_Url_Normalize::rest_acf_from_post( $resp['body'][0] );
				$result['acfFields'] = is_array( $acf ) ? $acf : array();
			}
		}
		return $result;
	}

	/**
	 * @param string      $normalized Site URL.
	 * @param string      $username User.
	 * @param string      $app_password Password.
	 * @param mixed       $post_id_raw Post ID.
	 * @param string      $post_type Post type.
	 * @param string|null $endpoint Endpoint override.
	 * @return array<string,mixed>
	 */
	private static function fetch_acf_for_post_id( $normalized, $username, $app_password, $post_id_raw, $post_type, $endpoint ) {
		$post_id = Neo_Pulse_App_Wp_Url_Normalize::normalize_post_id( $post_id_raw );
		$result  = array(
			'success'  => false,
			'fields'   => array(),
			'fullPost' => null,
			'error'    => null,
		);
		if ( $post_id === null ) {
			$result['error'] = 'Invalid postId';
			return $result;
		}

		$collection = Neo_Pulse_App_Wp_Url_Normalize::resolve_wp_v2_collection_endpoint( $endpoint, $post_type );
		$url        = $normalized . '/wp-json/wp/v2/' . rawurlencode( $collection ) . '/' . $post_id . '?context=edit';
		$resp       = Neo_Pulse_App_Wp_Rest_Client::request( 'GET', $url, $username, $app_password, array( 'timeout' => 15 ) );

		if ( $resp['is_wp_error'] ) {
			$result['error'] = $resp['error'];
			return $result;
		}
		if ( (int) $resp['status'] !== 200 || ! is_array( $resp['body'] ) ) {
			$result['error'] = is_array( $resp['body'] ) && ! empty( $resp['body']['message'] ) ? (string) $resp['body']['message'] : 'Fetch failed';
			return $result;
		}

		$acf    = Neo_Pulse_App_Wp_Url_Normalize::rest_acf_from_post( $resp['body'] );
		$fields = is_array( $acf ) ? $acf : array();

		// Enrich with NEO Pulse native meta_hub values via wp_get_post when keyword_focus / seo_research / faq are stored in post meta.
		if ( empty( $fields['keyword_focus'] ) || empty( $fields['seo_research'] ) ) {
			$pulse_post = Neo_Pulse_App_Wp_NeoPulse_Tools::execute_tool(
				$normalized,
				$username,
				$app_password,
				'wp_get_post',
				array( 'post_id' => $post_id )
			);
			$meta_hub = isset( $pulse_post['data']['meta_hub'] ) && is_array( $pulse_post['data']['meta_hub'] )
				? $pulse_post['data']['meta_hub']
				: ( isset( $pulse_post['meta_hub'] ) && is_array( $pulse_post['meta_hub'] ) ? $pulse_post['meta_hub'] : array() );
			if ( $meta_hub !== array() ) {
				$hub_fields = self::fields_from_pulse_meta_hub( $meta_hub );
				$fields     = Neo_Pulse_App_Wp_Url_Normalize::merge_rest_field_objects( $fields, $hub_fields );
			}
		}

		$result['success']                    = true;
		$result['fields']                     = $fields;
		$resp['body']['neo_pulse_fields']     = $fields;
		$result['fullPost']                   = $resp['body'];
		return $result;
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_acf_fields_by_url( $body ) {
		return Neo_Pulse_App_Wp_Acf_By_Url::get_acf_fields_by_url( $body );
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function get_acf_fields_by_url_batch( $body ) {
		return Neo_Pulse_App_Wp_Acf_By_Url::get_acf_fields_by_url_batch( $body );
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function discover_acf_field_groups( $body ) {
		return Neo_Pulse_App_Wp_Acf_Discovery::discover_acf_field_groups( $body );
	}
}
