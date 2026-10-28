<?php
/**
 * ACF field group discovery (NEO Pulse export, ACF REST, sample scan).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Acf_Discovery {

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	public static function discover_acf_field_groups( $body ) {
		$site_url     = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$username     = isset( $body['username'] ) ? (string) $body['username'] : '';
		$app_password = isset( $body['appPassword'] ) ? (string) $body['appPassword'] : '';
		$post_type    = isset( $body['postType'] ) ? (string) $body['postType'] : 'post';
		$endpoint     = isset( $body['postTypeEndpoint'] ) ? $body['postTypeEndpoint'] : null;
		$sample_size  = isset( $body['sampleSize'] ) ? (int) $body['sampleSize'] : 10;

		if ( $site_url === '' || $username === '' || $app_password === '' ) {
			return array( 400, array( 'success' => false, 'error' => 'Missing required fields: siteUrl, username, appPassword' ) );
		}

		$normalized = Neo_Pulse_App_Wp_Url_Normalize::normalize_url( $site_url );
		$collection = Neo_Pulse_App_Wp_Url_Normalize::resolve_wp_v2_collection_endpoint( $endpoint, $post_type );
		$result     = array(
			'success'     => false,
			'fieldGroups' => array(),
			'fields'      => array(),
			'method'      => null,
			'error'       => null,
		);

		$ping = Neo_Pulse_App_Wp_NeoPulse_Tools::ping_public( $normalized, $username, $app_password );
		if ( ! empty( $ping['ok'] ) ) {
			$starter = self::default_neo_pulse_fields_export();
			$parsed  = self::parse_neo_pulse_fields_export_json( wp_json_encode( $starter ) );
			if ( $parsed && ! empty( $parsed['fields'] ) ) {
				return array(
					200,
					array(
						'success'     => true,
						'fieldGroups' => $parsed['fieldGroups'],
						'fields'      => $parsed['fields'],
						'method'      => 'neo_pulse_fields_export',
						'error'       => null,
					),
				);
			}
		}

		$groups_url = $normalized . '/wp-json/wp/v2/acf-field-group?per_page=100';
		$groups_rs  = Neo_Pulse_App_Wp_Rest_Client::request( 'GET', $groups_url, $username, $app_password, array( 'timeout' => 30 ) );
		if ( ! $groups_rs['is_wp_error'] && (int) $groups_rs['status'] === 200 && is_array( $groups_rs['body'] ) ) {
			$all_fields = array();
			foreach ( $groups_rs['body'] as $group ) {
				if ( ! is_array( $group ) || empty( $group['fields'] ) || ! is_array( $group['fields'] ) ) {
					continue;
				}
				foreach ( $group['fields'] as $field ) {
					if ( ! is_array( $field ) || empty( $field['name'] ) ) {
						continue;
					}
					$title        = isset( $group['title']['rendered'] ) ? $group['title']['rendered'] : ( isset( $group['title'] ) ? $group['title'] : '' );
					$all_fields[] = array(
						'name'       => (string) $field['name'],
						'label'      => isset( $field['label'] ) ? (string) $field['label'] : (string) $field['name'],
						'type'       => isset( $field['type'] ) ? (string) $field['type'] : 'text',
						'groupId'    => isset( $group['id'] ) ? $group['id'] : null,
						'groupTitle' => (string) $title,
						'location'   => isset( $group['location'] ) && is_array( $group['location'] ) ? $group['location'] : array(),
					);
				}
			}
			return array(
				200,
				array(
					'success'     => true,
					'fieldGroups' => $groups_rs['body'],
					'fields'      => $all_fields,
					'method'      => 'acf_rest_api',
					'error'       => null,
				),
			);
		}

		$posts_url = $normalized . '/wp-json/wp/v2/' . rawurlencode( $collection ) . '?per_page=' . max( 1, min( 100, $sample_size ) ) . '&context=edit&_fields=id,title,acf,neo_pulse_fields';
		$scan_rs   = Neo_Pulse_App_Wp_Rest_Client::request( 'GET', $posts_url, $username, $app_password, array( 'timeout' => 30 ) );
		if ( ! $scan_rs['is_wp_error'] && (int) $scan_rs['status'] === 200 && is_array( $scan_rs['body'] ) ) {
			$field_map = array();
			foreach ( $scan_rs['body'] as $post ) {
				$acf = Neo_Pulse_App_Wp_Url_Normalize::rest_acf_from_post( is_array( $post ) ? $post : null );
				if ( ! is_array( $acf ) ) {
					continue;
				}
				foreach ( $acf as $name => $value ) {
					if ( ! isset( $field_map[ $name ] ) ) {
						$field_map[ $name ] = array(
							'name'            => (string) $name,
							'label'           => ucwords( str_replace( '_', ' ', (string) $name ) ),
							'type'            => self::infer_field_type( $value ),
							'sampleValue'     => $value,
							'occurrenceCount' => 0,
						);
					}
					++$field_map[ $name ]['occurrenceCount'];
				}
			}
			$result['success'] = true;
			$result['fields']  = array_values( $field_map );
			$result['method']  = 'sample_scan';
			return array( 200, $result );
		}

		if ( ! $scan_rs['is_wp_error'] && is_array( $scan_rs['body'] ) && ! empty( $scan_rs['body']['message'] ) ) {
			$result['error'] = (string) $scan_rs['body']['message'];
		} elseif ( $scan_rs['is_wp_error'] ) {
			$result['error'] = $scan_rs['error'];
		}
		return array( 200, $result );
	}

	/**
	 * Built-in NEO Pulse custom field groups (SEO, Extra Text, FAQ, Research, and Location fields).
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public static function default_neo_pulse_fields_export() {
		return array(
			array(
				'key'      => 'group_neo_pulse_seo_fields',
				'title'    => 'NEO Pulse SEO & Content Fields',
				'fields'   => array(
					array( 'name' => 'keyword_focus', 'label' => 'Keyword Focus', 'type' => 'text' ),
					array( 'name' => 'seo_title', 'label' => 'SEO Title', 'type' => 'text' ),
					array( 'name' => 'meta_description', 'label' => 'Meta Description', 'type' => 'textarea' ),
					array( 'name' => 'seo_extra_text', 'label' => 'Extra Text', 'type' => 'wysiwyg' ),
					array( 'name' => 'extra_text', 'label' => 'Extra Text (Legacy)', 'type' => 'wysiwyg' ),
					array( 'name' => 'seo_extra_image', 'label' => 'Extra Image', 'type' => 'image' ),
					array( 'name' => 'faq', 'label' => 'FAQ Schema', 'type' => 'textarea' ),
					array( 'name' => 'seo_faq', 'label' => 'SEO FAQ', 'type' => 'textarea' ),
					array( 'name' => 'seo_research', 'label' => 'SEO Research Brief', 'type' => 'textarea' ),
					array( 'name' => 'date_modifier', 'label' => 'Date Modifier', 'type' => 'date_picker' ),
					array( 'name' => 'seo_date_modifier', 'label' => 'SEO Date Modifier', 'type' => 'date_picker' ),
					array( 'name' => 'seo_prompt_modifier', 'label' => 'SEO Prompt Modifier', 'type' => 'textarea' ),
					array( 'name' => 'origin', 'label' => 'Origin / Entity', 'type' => 'text' ),
					array( 'name' => 'page_url', 'label' => 'Page URL', 'type' => 'url' ),
				),
				'location' => array(),
			),
			array(
				'key'      => 'group_neo_pulse_location_fields',
				'title'    => 'NEO Pulse Location & Service Area Fields',
				'fields'   => array(
					array( 'name' => 'showroom_or_service_area', 'label' => 'Showroom or Service Area', 'type' => 'select' ),
					array( 'name' => 'location_name_google_maps', 'label' => 'Location Name (Google Maps)', 'type' => 'text' ),
					array( 'name' => 'description_of_area', 'label' => 'Description of Area', 'type' => 'wysiwyg' ),
					array( 'name' => 'description_of_area_pt_2', 'label' => 'Description of Area (Part 2)', 'type' => 'wysiwyg' ),
					array( 'name' => 'address', 'label' => 'Address', 'type' => 'text' ),
					array( 'name' => 'phone_number', 'label' => 'Phone Number', 'type' => 'text' ),
					array( 'name' => 'phone_number_link', 'label' => 'Phone Number Link', 'type' => 'text' ),
					array( 'name' => 'google_maps_link', 'label' => 'Google Maps Link', 'type' => 'url' ),
					array( 'name' => 'condensed_hours_line', 'label' => 'Condensed Hours Line', 'type' => 'text' ),
					array( 'name' => 'latitude', 'label' => 'Latitude', 'type' => 'text' ),
					array( 'name' => 'longitude', 'label' => 'Longitude', 'type' => 'text' ),
					array( 'name' => 'business_type', 'label' => 'Business Type', 'type' => 'text' ),
					array( 'name' => 'google_business_profile', 'label' => 'Google Business Profile', 'type' => 'url' ),
				),
				'location' => array(),
			),
		);
	}

	/**
	 * @param mixed $value Field sample value.
	 * @return string
	 */
	public static function infer_field_type( $value ) {
		if ( $value === null ) {
			return 'null';
		}
		if ( is_bool( $value ) ) {
			return 'true_false';
		}
		if ( is_int( $value ) || is_float( $value ) ) {
			return 'number';
		}
		if ( is_array( $value ) ) {
			if ( $value && is_array( reset( $value ) ) ) {
				return 'repeater';
			}
			return 'select';
		}
		if ( is_string( $value ) ) {
			if ( preg_match( '/^#?[0-9a-fA-F]{3,6}$/', $value ) ) {
				return 'color_picker';
			}
			if ( preg_match( '/^https?:\/\//', $value ) ) {
				return 'url';
			}
			if ( filter_var( $value, FILTER_VALIDATE_EMAIL ) ) {
				return 'email';
			}
			return 'text';
		}
		return 'text';
	}

	/**
	 * @param string $json_string NEO Pulse fields export JSON.
	 * @return array{fieldGroups:array<int,array<string,mixed>>,fields:array<int,array<string,mixed>>}|null
	 */
	public static function parse_neo_pulse_fields_export_json( $json_string ) {
		if ( ! is_string( $json_string ) || $json_string === '' ) {
			return null;
		}
		$parsed = json_decode( $json_string, true );
		if ( ! is_array( $parsed ) ) {
			return null;
		}
		$field_groups = array();
		$fields       = array();
		foreach ( $parsed as $item ) {
			if ( ! is_array( $item ) || empty( $item['fields'] ) || ! is_array( $item['fields'] ) ) {
				continue;
			}
			$group_key    = isset( $item['key'] ) && is_string( $item['key'] ) ? $item['key'] : '';
			$group_title  = isset( $item['title'] ) && is_string( $item['title'] ) && trim( $item['title'] ) !== '' ? $item['title'] : ( $group_key ?: 'Field group' );
			$group_fields = array();
			foreach ( $item['fields'] as $field ) {
				self::flatten_acf_export_fields( $field, $group_key, $group_title, $group_fields );
			}
			$field_groups[] = array(
				'key'      => $group_key,
				'title'    => $group_title,
				'fields'   => $group_fields,
				'location' => isset( $item['location'] ) && is_array( $item['location'] ) ? $item['location'] : array(),
			);
			$fields = array_merge( $fields, $group_fields );
		}
		return array(
			'fieldGroups' => $field_groups,
			'fields'      => $fields,
		);
	}

	/**
	 * @param mixed  $field Field node.
	 * @param string $group_key Group key.
	 * @param string $group_title Group title.
	 * @param array<int,array<string,mixed>> $out Output fields.
	 */
	private static function flatten_acf_export_fields( $field, $group_key, $group_title, &$out ) {
		if ( ! is_array( $field ) ) {
			return;
		}
		$name   = isset( $field['name'] ) && is_string( $field['name'] ) ? trim( $field['name'] ) : '';
		$type   = isset( $field['type'] ) && is_string( $field['type'] ) ? $field['type'] : 'text';
		$layout = array( 'tab', 'accordion', 'message', 'group', 'clone' );
		if ( $name !== '' && ! in_array( $type, $layout, true ) ) {
			$out[] = array(
				'name'       => $name,
				'label'      => ( isset( $field['label'] ) && is_string( $field['label'] ) && trim( $field['label'] ) !== '' ) ? $field['label'] : $name,
				'type'       => $type,
				'groupId'    => $group_key,
				'groupTitle' => $group_title,
				'location'   => array(),
			);
		}
		if ( ! empty( $field['sub_fields'] ) && is_array( $field['sub_fields'] ) ) {
			foreach ( $field['sub_fields'] as $sub ) {
				self::flatten_acf_export_fields( $sub, $group_key, $group_title, $out );
			}
		}
		if ( ! empty( $field['layouts'] ) && is_array( $field['layouts'] ) ) {
			foreach ( $field['layouts'] as $layout_row ) {
				if ( is_array( $layout_row ) && ! empty( $layout_row['sub_fields'] ) && is_array( $layout_row['sub_fields'] ) ) {
					foreach ( $layout_row['sub_fields'] as $sub ) {
						self::flatten_acf_export_fields( $sub, $group_key, $group_title, $out );
					}
				}
			}
		}
	}
}
