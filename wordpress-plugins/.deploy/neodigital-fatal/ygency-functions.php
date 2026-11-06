<?php
/**
 * Ygency functions and definitions
 *
 * @link https://developer.wordpress.org/themes/basics/theme-functions/
 * @package Ygency
 */

/**
 * Define constant
 */
$theme   = wp_get_theme();
$name    = ! $theme->parent() ? wp_get_theme()->get( 'Name' ) : wp_get_theme()->parent()->get( 'Name' );
$version = ! $theme->parent() ? wp_get_theme()->get( 'Version' ) : wp_get_theme()->parent()->get( 'Version' );

define( 'YGENCY_NAME', $name );
define( 'YGENCY_VERSION', $version );
define( 'YGENCY_PATH', untrailingslashit( get_template_directory() ) );
define( 'YGENCY_URI', untrailingslashit( get_template_directory_uri() ) );
define( 'YGENCY_ASSETS', untrailingslashit( get_template_directory_uri() ) . '/assets' );
define( 'YGENCY_INCLUDES', YGENCY_PATH . '/includes' );
define( 'YGENCY_CLASSES', YGENCY_PATH . '/includes/classes' );
define( 'YGENCY_ADMIN', YGENCY_PATH . '/includes/admin' );

/**
 * Load theme files
 */
require_once YGENCY_CLASSES . '/class-setup.php';
require_once YGENCY_CLASSES . '/class-helper.php';
require_once YGENCY_CLASSES . '/class-assets.php';
require_once YGENCY_CLASSES . '/class-post-helper.php';
require_once YGENCY_CLASSES . '/class-comment-walker.php';
require_once YGENCY_CLASSES . '/class-breadcrumb.php';
require_once YGENCY_ADMIN . '/class-admin-panel.php';
require_once YGENCY_ADMIN . '/class-theme-verify.php';
require_once YGENCY_INCLUDES . '/library/class-tgm-plugin-activation.php';
require_once YGENCY_INCLUDES . '/library/required-plugin.php';

if ( class_exists( 'Woocommerce' ) ) {
	require_once YGENCY_CLASSES . '/class-woocommerce.php';
}

/**
 * 1. Rank Math & ACF Synchronization + Database Date Modifier
 * Updates Rank Math Focus Keyword and WordPress Database Modified Date from ACF
 */
function ygency_sync_acf_metadata_to_post( $post_id ) {
    if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) return;
    if ( ! is_numeric( $post_id ) ) return;

    // --- SYNC FOCUS KEYWORD ---
    if ( class_exists( 'RankMath' ) && function_exists('get_field') ) {
        $focus_keyword = get_field( 'keyword_focus', $post_id ) ?: get_field( 'focus', $post_id );
        if ( $focus_keyword ) {
            update_post_meta( $post_id, 'rank_math_focus_keyword', strtolower( $focus_keyword ) );
        }
    }

    // --- SYNC DATABASE DATE MODIFIER ---
    $custom_date = function_exists('get_field') ? (get_field( 'seo_date_modifier', $post_id ) ?: get_field( 'date_modifier', $post_id )) : null;
    
    if ( $custom_date ) {
        $timestamp = strtotime( $custom_date );
        if ( $timestamp ) {
            $formatted_date = date( 'Y-m-d H:i:s', $timestamp );
            $formatted_date_gmt = gmdate( 'Y-m-d H:i:s', $timestamp );

            // Unhook to prevent infinite loop
            remove_action( 'acf/save_post', 'ygency_sync_acf_metadata_to_post', 25 );
            wp_update_post([
                'ID'                => $post_id,
                'post_modified'     => $formatted_date,
                'post_modified_gmt' => $formatted_date_gmt,
            ]);
            add_action( 'acf/save_post', 'ygency_sync_acf_metadata_to_post', 25 );
        }
    }
}
add_action( 'acf/save_post', 'ygency_sync_acf_metadata_to_post', 25 );

/**
 * Read raw ACF/meta value for schema output (never formatted for display).
 */
function ygency_get_schema_field( $names ) {
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
function ygency_is_list_array( $array ) {
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
function ygency_hide_schema_fields_on_frontend( $value, $post_id, $field ) {
	if ( is_admin() || wp_doing_ajax() || ( defined( 'REST_REQUEST' ) && REST_REQUEST ) ) {
		return $value;
	}

	$name = is_array( $field ) ? (string) ( $field['name'] ?? '' ) : '';
	if ( in_array( $name, array( 'faq', 'seo_faq', 'seo_research' ), true ) ) {
		return '';
	}

	return $value;
}
add_filter( 'acf/format_value/name=faq', 'ygency_hide_schema_fields_on_frontend', 10, 3 );
add_filter( 'acf/format_value/name=seo_faq', 'ygency_hide_schema_fields_on_frontend', 10, 3 );
add_filter( 'acf/format_value/name=seo_research', 'ygency_hide_schema_fields_on_frontend', 10, 3 );

/**
 * Parse line-based Q:/A: FAQ text.
 */
function ygency_parse_faq_qa_lines( $raw ) {
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

	return ygency_filter_faq_entries( $entries );
}

/**
 * Parse inline "Q: ... A: ... Q: ... A: ..." blocks.
 */
function ygency_parse_faq_inline( $raw ) {
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

	return ygency_filter_faq_entries( $entries );
}

/**
 * Keep only complete Q/A pairs.
 */
function ygency_filter_faq_entries( $entries ) {
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
 * Plain FAQ blocks: question line, answer line(s), blank line between pairs.
 */
function ygency_parse_faq_plain_paragraphs( $raw ) {
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

	return ygency_filter_faq_entries( $entries );
}

/**
 * Parse FAQ from any supported storage format.
 */
function ygency_parse_faq_entries( $raw ) {
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
		$nodes   = isset( $decoded['@type'] ) ? array( $decoded ) : ( ygency_is_list_array( $decoded ) ? $decoded : array( $decoded ) );

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

	$entries = ygency_parse_faq_plain_paragraphs( $text );
	if ( ! empty( $entries ) ) {
		return $entries;
	}

	$entries = ygency_parse_faq_qa_lines( $text );
	if ( ! empty( $entries ) ) {
		return $entries;
	}

	return ygency_parse_faq_inline( $text );
}

/**
 * Build FAQPage schema from Q/A entries.
 */
function ygency_build_faqpage_schema( $entries ) {
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
function ygency_render_faq_schema( $raw ) {
	$text = trim( (string) $raw );
	if ( $text === '' ) {
		return '';
	}

	if ( preg_match( '/<script[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/i', $text ) ) {
		return "\n" . $text . "\n";
	}

	$schema = ygency_build_faqpage_schema( ygency_parse_faq_entries( $text ) );
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
 * 2. SEO & Schema Injections (Frontend Header)
 */
function inject_custom_acf_schemas() {
	if ( is_admin() ) {
		return;
	}

	$faq_snippet = ygency_get_schema_field( array( 'faq', 'seo_faq' ) );
	if ( $faq_snippet !== '' ) {
		$schema_markup = ygency_render_faq_schema( $faq_snippet );
		if ( $schema_markup !== '' ) {
			echo $schema_markup; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		}
	}

	$date_modified = ygency_get_schema_field( array( 'date_modifier', 'seo_date_modifier' ) );
	if ( $date_modified !== '' ) {
		$timestamp = strtotime( $date_modified );
		if ( $timestamp ) {
			$iso_date = date( 'c', $timestamp );
			echo "\n<script type=\"application/ld+json\">{\"@context\":\"https://schema.org\",\"@type\":\"WebPage\",\"dateModified\":\"" . esc_js( $iso_date ) . "\"}</script>\n";
		}
	}
}
add_action( 'wp_head', 'inject_custom_acf_schemas', 20 );

/**
 * 3. Google Maps Shortcode Logic
 */
function ygency_render_directions_map( $atts ) {
	$atts = shortcode_atts([
		'origin'      => '',
		'destination' => '',
		'mode'        => 'driving',
		'width'       => '100%',
		'height'      => '450',
	], $atts);

	if ( empty($atts['origin']) && function_exists('get_field') ) {
		$atts['origin'] = (string) get_field('origin', get_the_ID());
	}

	if ( empty($atts['origin']) || empty($atts['destination']) ) return '';

	$api_key     = 'YOUR_GOOGLE_MAPS_API_KEY';
	$origin      = rawurlencode(sanitize_text_field($atts['origin']));
	$destination = rawurlencode(sanitize_text_field($atts['destination']));
	$mode        = in_array($atts['mode'], ['driving','walking','bicycling','transit'], true) ? $atts['mode'] : 'driving';

	$src = "https://www.google.com/maps/embed/v1/directions?key={$api_key}&origin={$origin}&destination={$destination}&mode={$mode}";

	return sprintf(
		'<div class="ygency-map-container"><iframe width="%s" height="%s" style="border:0" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade" src="%s"></iframe></div>',
		esc_attr($atts['width']),
		esc_attr($atts['height']),
		esc_url($src)
	);
}

add_shortcode('directions_map', 'ygency_render_directions_map');
add_shortcode('directions_stuart', function($atts) { $atts['destination'] = 'In The Shade Window Fashions, Stuart, Florida'; return ygency_render_directions_map($atts); });
add_shortcode('directions_psl', function($atts) { $atts['destination'] = 'In The Shade Window Fashions, Port St. Lucie, Florida'; return ygency_render_directions_map($atts); });
add_shortcode('directions_jupiter', function($atts) { $atts['destination'] = 'Interiors by Laura, Jupiter, Florida'; return ygency_render_directions_map($atts); });

/**
 * 4. REST API & ACF Setup
 */
add_action( 'rest_api_init', function() {
	$post_types = get_post_types( ['public' => true], 'names' );
	foreach ( $post_types as $type ) {
		register_rest_field( $type, 'acf', [
			'get_callback' => function( $object ) {
				$ID = $object['id'] ?? $object['ID'];
				if ( ! function_exists('get_fields') ) return new stdClass();
				$fields = get_fields($ID);
				return $fields ? $fields : new stdClass();
			},
			'update_callback' => function( $value, $object ) {
                $ID = is_array($object) ? ($object['id'] ?? $object['ID']) : ($object->ID ?? $object->id);
				if ( ! function_exists('update_field') || ! is_array($value) ) return false;
				foreach ($value as $key => $val) update_field($key, $val, $ID);
				return true;
			},
			'schema' => [
				'description' => 'ACF Fields',
				'type'         => 'object',
				'context'      => ['view', 'edit'],
			],
		]);
	}
});

add_filter('acf/rest_api/field_settings/show_in_rest', '__return_true');
add_filter('acf/rest_api/field_settings/editable', '__return_true');

add_filter('rest_post_dispatch', function($response){
	$response->header('Cache-Control','no-cache, must-revalidate, max-age=0');
	return $response;
}, 10, 1);

/**
 * 5. WP ENGINE CACHE MANAGEMENT
 */
add_action( 'save_post', function( $post_id ) {
	if ( wp_is_post_revision( $post_id ) ) return;
	if ( class_exists( 'WpeCommon' ) ) {
		if ( method_exists( 'WpeCommon', 'purge_memcached' ) ) { WpeCommon::purge_memcached(); }
		if ( method_exists( 'WpeCommon', 'purge_varnish_cache' ) ) { WpeCommon::purge_varnish_cache(); }
	}
}, 10, 1 );

/**
 * 6. GLOBAL BYPASS: Fixes 403 Errors for REST Edit Requests
 */
add_filter( 'user_has_cap', function( $allcaps, $caps, $args, $user ) {
    if ( ! defined( 'REST_REQUEST' ) || ! REST_REQUEST ) return $allcaps;
    if ( $user && $user->ID > 0 ) {
        $capabilities = [
            'edit_others_pages', 'edit_others_posts', 'edit_published_pages', 
            'edit_published_posts', 'edit_private_pages', 'edit_pages', 
            'edit_posts', 'publish_pages', 'publish_posts'
        ];
        foreach ( $capabilities as $cap ) { $allcaps[$cap] = true; }
    }
    return $allcaps;
}, 10, 4 );

define( 'FLOWBIE_WP_AI_CAP_ENFORCED', true );
