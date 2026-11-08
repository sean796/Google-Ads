<?php
/**
 * Theme functions and definitions.
 *
 * @package HelloElementorChild
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

define( 'HELLO_ELEMENTOR_CHILD_VERSION', '2.1.2' );

/**
 * 1. Load child theme scripts & styles.
 */
function hello_elementor_child_scripts_styles() {
	wp_enqueue_style(
		'hello-elementor-child-style',
		get_stylesheet_directory_uri() . '/style.css',
		array( 'hello-elementor-theme-style' ),
		HELLO_ELEMENTOR_CHILD_VERSION
	);
}
add_action( 'wp_enqueue_scripts', 'hello_elementor_child_scripts_styles', 20 );

/**
 * Read raw ACF/meta value for schema output (never formatted for display).
 */
function hello_elementor_child_get_schema_field( $names ) {
	$post_id = get_queried_object_id();
	if ( ! $post_id ) {
		return '';
	}

	foreach ( (array) $names as $name ) {
		if ( function_exists( 'get_field' ) ) {
			$value = get_field( $name, $post_id, false );
			if ( is_scalar( $value ) && trim( (string) $value ) !== '' ) {
				return trim( (string) $value );
			}
		}

		$meta = get_post_meta( $post_id, $name, true );
		if ( is_scalar( $meta ) && trim( (string) $meta ) !== '' ) {
			return trim( (string) $meta );
		}
	}

	return '';
}

/**
 * PHP 7.4 compatible list-array check (array_is_list is PHP 8.1+).
 */
function hello_elementor_child_is_list_array( $array ) {
	if ( ! is_array( $array ) ) {
		return false;
	}

	$expected = 0;
	foreach ( $array as $key => $_value ) {
		if ( $key !== $expected ) {
			return false;
		}
		$expected++;
	}

	return true;
}

/**
 * FAQ / seo_research are schema-only on the frontend (admin + REST keep raw values).
 */
function hello_elementor_child_hide_schema_fields_on_frontend( $value, $post_id, $field ) {
	if ( is_admin() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
		return $value;
	}

	$name = is_array( $field ) ? (string) ( $field['name'] ?? '' ) : '';
	if ( in_array( $name, array( 'faq', 'seo_research' ), true ) ) {
		return '';
	}

	return $value;
}
add_filter( 'acf/format_value/name=faq', 'hello_elementor_child_hide_schema_fields_on_frontend', 10, 3 );
add_filter( 'acf/format_value/name=seo_research', 'hello_elementor_child_hide_schema_fields_on_frontend', 10, 3 );

/**
 * 2. NEO Pulse redirect & ACF Synchronization + Date Modifier
 */
function sync_acf_metadata_to_post( $post_id ) {
	if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
		return;
	}
	if ( ! is_numeric( $post_id ) ) {
		return;
	}

	if ( ! function_exists( 'get_field' ) ) {
		return;
	}

	if ( class_exists( 'RedirectCsv' ) ) {
		$focus_keyword = get_field( 'focus', $post_id, false );
		if ( ! $focus_keyword ) {
			$focus_keyword = get_field( 'keyword_focus', $post_id, false );
		}
		if ( ! $focus_keyword ) {
			$focus_keyword = get_field( 'keyword_focu', $post_id, false );
		}

		if ( $focus_keyword ) {
			update_post_meta( $post_id, 'neo_pulse_seo_focus_keyword', strtolower( trim( (string) $focus_keyword ) ) );
		}
	}

	$custom_date = get_field( 'date_modifier', $post_id, false );
	if ( ! $custom_date ) {
		$custom_date = get_field( 'seo_date_modifier', $post_id, false );
	}
	if ( $custom_date ) {
		$timestamp = strtotime( (string) $custom_date );
		if ( $timestamp ) {
			$formatted_date     = date( 'Y-m-d H:i:s', $timestamp );
			$formatted_date_gmt = gmdate( 'Y-m-d H:i:s', $timestamp );

			remove_action( 'acf/save_post', 'sync_acf_metadata_to_post', 25 );

			wp_update_post(
				array(
					'ID'                => $post_id,
					'post_modified'     => $formatted_date,
					'post_modified_gmt' => $formatted_date_gmt,
				)
			);

			add_action( 'acf/save_post', 'sync_acf_metadata_to_post', 25 );
		}
	}
}
add_action( 'acf/save_post', 'sync_acf_metadata_to_post', 25 );

/**
 * Parse line-based Q:/A: FAQ text.
 */
function hello_elementor_child_parse_faq_qa_lines( $raw ) {
	$lines   = array_values( array_filter( array_map( 'trim', preg_split( '/\r\n|\r|\n/', (string) $raw ) ) ) );
	$entries = array();
	$current = null;

	foreach ( $lines as $line ) {
		if ( preg_match( '/^Q[:\-]/i', $line ) ) {
			if ( is_array( $current ) ) {
				$entries[] = $current;
			}
			$current = array(
				'question' => trim( (string) preg_replace( '/^Q[:\-]\s*/i', '', $line ) ),
				'answer'   => '',
			);
		} elseif ( preg_match( '/^A[:\-]/i', $line ) ) {
			if ( ! is_array( $current ) ) {
				$current = array(
					'question' => '',
					'answer'   => trim( (string) preg_replace( '/^A[:\-]\s*/i', '', $line ) ),
				);
			} else {
				$current['answer'] = trim( (string) preg_replace( '/^A[:\-]\s*/i', '', $line ) );
			}
		} elseif ( is_array( $current ) && $current['question'] !== '' && $current['answer'] === '' ) {
			$current['question'] = trim( $current['question'] . ' ' . $line );
		} elseif ( is_array( $current ) && $current['answer'] !== '' ) {
			$current['answer'] = trim( $current['answer'] . ' ' . $line );
		} else {
			$current = array(
				'question' => $line,
				'answer'   => '',
			);
		}
	}

	if ( is_array( $current ) ) {
		$entries[] = $current;
	}

	return hello_elementor_child_filter_faq_entries( $entries );
}

/**
 * Parse inline "Q: ... A: ... Q: ... A: ..." blocks.
 */
function hello_elementor_child_parse_faq_inline( $raw ) {
	$text = trim( wp_strip_all_tags( html_entity_decode( (string) $raw, ENT_QUOTES | ENT_HTML5, 'UTF-8' ) ) );
	if ( $text === '' ) {
		return array();
	}

	$entries = array();
	if ( preg_match_all( '/Q[:\-]\s*(.*?)\s*A[:\-]\s*(.*?)(?=\s*Q[:\-]|$)/is', $text, $matches, PREG_SET_ORDER ) ) {
		foreach ( $matches as $match ) {
			$entries[] = array(
				'question' => trim( preg_replace( '/\s+/u', ' ', $match[1] ) ),
				'answer'   => trim( preg_replace( '/\s+/u', ' ', $match[2] ) ),
			);
		}
	}

	return hello_elementor_child_filter_faq_entries( $entries );
}

/**
 * Keep only complete Q/A pairs.
 */
function hello_elementor_child_filter_faq_entries( $entries ) {
	$filtered = array();

	foreach ( (array) $entries as $entry ) {
		$question = trim( (string) ( $entry['question'] ?? '' ) );
		$answer   = trim( wp_strip_all_tags( (string) ( $entry['answer'] ?? '' ) ) );
		if ( $question !== '' && $answer !== '' ) {
			$filtered[] = array(
				'question' => $question,
				'answer'   => $answer,
			);
		}
	}

	return $filtered;
}

/**
 * Plain FAQ blocks: question line, answer line(s), blank line between pairs (no Q:/A: prefixes).
 * Matches NEO Pulse faqPlainTextForWpStorage / serializeFaqEntriesPlain.
 */
function hello_elementor_child_parse_faq_plain_paragraphs( $raw ) {
	$text = trim( (string) $raw );
	if ( $text === '' || preg_match( '/^Q[:\-]/im', $text ) ) {
		return array();
	}

	$blocks = preg_split( '/\n\s*\n/', $text );
	if ( ! is_array( $blocks ) ) {
		return array();
	}

	$entries = array();
	foreach ( $blocks as $block ) {
		$block = trim( (string) $block );
		if ( $block === '' ) {
			continue;
		}
		$lines = array_values( array_filter( array_map( 'trim', preg_split( '/\r\n|\r|\n/', $block ) ) ) );
		if ( empty( $lines ) ) {
			continue;
		}
		$question = (string) $lines[0];
		$answer   = count( $lines ) > 1 ? trim( implode( ' ', array_slice( $lines, 1 ) ) ) : '';
		if ( $question !== '' && $answer !== '' ) {
			$entries[] = array(
				'question' => $question,
				'answer'   => $answer,
			);
		}
	}

	return hello_elementor_child_filter_faq_entries( $entries );
}

/**
 * Parse FAQ from any supported storage format.
 */
function hello_elementor_child_parse_faq_entries( $raw ) {
	$text = trim( (string) $raw );
	if ( $text === '' ) {
		return array();
	}

	$json_text = $text;
	if ( preg_match( '/<script[^>]*>([\s\S]*?)<\/script>/i', $text, $matches ) ) {
		$json_text = trim( $matches[1] );
	}

	$decoded = json_decode( html_entity_decode( $json_text, ENT_QUOTES | ENT_HTML5, 'UTF-8' ), true );
	if ( is_array( $decoded ) ) {
		$entries = array();
		$nodes   = isset( $decoded['@type'] ) ? array( $decoded ) : ( hello_elementor_child_is_list_array( $decoded ) ? $decoded : array( $decoded ) );

		foreach ( $nodes as $node ) {
			if ( ! is_array( $node ) || empty( $node['mainEntity'] ) || ! is_array( $node['mainEntity'] ) ) {
				continue;
			}
			foreach ( $node['mainEntity'] as $item ) {
				if ( ! is_array( $item ) ) {
					continue;
				}
				$question = trim( (string) ( $item['name'] ?? '' ) );
				$answer   = '';
				if ( isset( $item['acceptedAnswer'] ) && is_array( $item['acceptedAnswer'] ) ) {
					$answer = trim( (string) ( $item['acceptedAnswer']['text'] ?? '' ) );
				}
				if ( $question !== '' && $answer !== '' ) {
					$entries[] = array(
						'question' => $question,
						'answer'   => $answer,
					);
				}
			}
		}

		if ( ! empty( $entries ) ) {
			return $entries;
		}
	}

	$entries = hello_elementor_child_parse_faq_plain_paragraphs( $text );
	if ( ! empty( $entries ) ) {
		return $entries;
	}

	$entries = hello_elementor_child_parse_faq_qa_lines( $text );
	if ( ! empty( $entries ) ) {
		return $entries;
	}

	return hello_elementor_child_parse_faq_inline( $text );
}

/**
 * Build FAQPage schema from Q/A entries.
 */
function hello_elementor_child_build_faqpage_schema( $entries ) {
	$main_entity = array();

	foreach ( (array) $entries as $entry ) {
		$question = trim( (string) ( $entry['question'] ?? '' ) );
		$answer   = trim( wp_strip_all_tags( (string) ( $entry['answer'] ?? '' ) ) );
		if ( $question === '' || $answer === '' ) {
			continue;
		}

		$main_entity[] = array(
			'@type'          => 'Question',
			'name'           => $question,
			'acceptedAnswer' => array(
				'@type' => 'Answer',
				'text'  => $answer,
			),
		);
	}

	if ( empty( $main_entity ) ) {
		return null;
	}

	return array(
		'@context'   => 'https://schema.org',
		'@type'      => 'FAQPage',
		'mainEntity' => $main_entity,
	);
}

/**
 * Always return FAQ JSON-LD wrapped in a script tag. Never return raw text.
 */
function hello_elementor_child_render_faq_schema( $raw ) {
	$text = trim( (string) $raw );
	if ( $text === '' ) {
		return '';
	}

	if ( preg_match( '/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/i', $text ) ) {
		return "\n" . $text . "\n";
	}

	$schema = hello_elementor_child_build_faqpage_schema( hello_elementor_child_parse_faq_entries( $text ) );
	if ( ! is_array( $schema ) ) {
		return '';
	}

	$json = wp_json_encode( $schema, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES );
	if ( ! is_string( $json ) || $json === '' ) {
		return '';
	}

	return "\n<script type=\"application/ld+json\">{$json}</script>\n";
}

/**
 * 3. Google Maps shortcode helper (preserve site-specific add_shortcode registrations from source).
 */
function neo_render_directions_map( $atts ) {
	$atts = shortcode_atts(
		array(
			'origin'        => '',
			'destination' => '',
			'mode'          => 'driving',
			'width'         => '100%',
			'height'        => '450',
		),
		$atts
	);

	if ( empty( $atts['origin'] ) && function_exists( 'get_field' ) ) {
		$acf_origin = get_field( 'origin', get_the_ID() );
		if ( ! empty( $acf_origin ) ) {
			$atts['origin'] = $acf_origin;
		}
	}

	if ( empty( $atts['origin'] ) || empty( $atts['destination'] ) ) {
		return '';
	}

	$api_key     = 'YOUR_GOOGLE_MAPS_API_KEY';
	$origin      = rawurlencode( sanitize_text_field( $atts['origin'] ) );
	$destination = rawurlencode( sanitize_text_field( $atts['destination'] ) );
	$mode        = in_array( $atts['mode'], array( 'driving', 'walking', 'bicycling', 'transit' ), true ) ? $atts['mode'] : 'driving';

	$src = "https://www.google.com/maps/embed/v1/directions?key={$api_key}&origin={$origin}&destination={$destination}&mode={$mode}";

	return sprintf(
		'<div class="neo-map-container"><iframe width="%s" height="%s" style="border:0" loading="lazy" allowfullscreen src="%s"></iframe></div>',
		esc_attr( $atts['width'] ),
		esc_attr( $atts['height'] ),
		esc_url( $src )
	);
}

/**
 * 4. SEO & Schema Injections (Frontend)
 */
function inject_custom_acf_schemas() {
	if ( is_admin() ) {
		return;
	}

	$faq_snippet = hello_elementor_child_get_schema_field( array( 'faq' ) );
	if ( $faq_snippet !== '' ) {
		$schema_markup = hello_elementor_child_render_faq_schema( $faq_snippet );
		if ( $schema_markup !== '' ) {
			echo $schema_markup; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		}
	}

	$date_modified = hello_elementor_child_get_schema_field( array( 'date_modifier', 'seo_date_modifier' ) );
	if ( $date_modified !== '' ) {
		$timestamp = strtotime( $date_modified );
		if ( $timestamp ) {
			$iso_date = date( 'c', $timestamp );
			echo "\n<script type=\"application/ld+json\">{\"@context\": \"https://schema.org\",\"@type\": \"WebPage\",\"dateModified\": \"" . esc_js( $iso_date ) . "\"}</script>\n";
		}
	}
}
add_action( 'wp_head', 'inject_custom_acf_schemas', 20 );

/**
 * 5. REST API & ACF Integration (Including seo_research)
 */
add_action(
	'rest_api_init',
	function () {
		$post_types = get_post_types( array( 'public' => true ), 'names' );

		foreach ( $post_types as $type ) {
			register_rest_field(
				$type,
				'acf',
				array(
					'get_callback'    => function ( $object ) {
						$ID = $object['id'] ?? $object['ID'];
						if ( ! function_exists( 'get_fields' ) ) {
							return new stdClass();
						}

						$fields = get_fields( $ID );
						return $fields ? $fields : new stdClass();
					},
					'update_callback' => function ( $value, $object ) {
						$ID = is_array( $object ) ? ( $object['id'] ?? $object['ID'] ) : ( $object->ID ?? null );
						if ( ! $ID || ! is_array( $value ) ) {
							return false;
						}

						foreach ( $value as $key => $val ) {
							if ( function_exists( 'update_field' ) ) {
								update_field( $key, $val, $ID );
							}
							if ( is_scalar( $val ) ) {
								update_post_meta( $ID, $key, wp_slash( (string) $val ) );
							}
						}
						return true;
					},
					'schema'          => array(
						'description' => 'ACF Fields including seo_research',
						'type'        => 'object',
						'context'     => array( 'view', 'edit' ),
					),
				)
			);
		}
	}
);

add_filter( 'acf/rest_api/field_settings/show_in_rest', '__return_true' );
add_filter( 'acf/rest_api/field_settings/editable', '__return_true' );

add_filter(
	'rest_post_dispatch',
	function ( $response ) {
		$response->header( 'Cache-Control', 'no-cache, must-revalidate, max-age=0' );
		return $response;
	},
	10,
	1
);

/**
 * 6. WP ENGINE CACHE MANAGEMENT
 */
add_action(
	'save_post',
	function ( $post_id ) {
		if ( wp_is_post_revision( $post_id ) ) {
			return;
		}

		if ( class_exists( 'WpeCommon' ) ) {
			if ( method_exists( 'WpeCommon', 'purge_memcached' ) ) {
				WpeCommon::purge_memcached();
			}
			if ( method_exists( 'WpeCommon', 'purge_varnish_cache' ) ) {
				WpeCommon::purge_varnish_cache();
			}
		}
	},
	10,
	1
);
