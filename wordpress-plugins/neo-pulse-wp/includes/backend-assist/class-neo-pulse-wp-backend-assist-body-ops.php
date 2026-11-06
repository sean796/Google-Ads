<?php
/**
 * Backend Assist — deterministic WYSIWYG HTML body operations
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_wp_backend_assist_body_ops_dir = __DIR__ . '/';
require_once $neo_pulse_wp_backend_assist_body_ops_dir . 'trait-neo-pulse-wp-backend-assist-body-ops-sections.php';
require_once $neo_pulse_wp_backend_assist_body_ops_dir . 'trait-neo-pulse-wp-backend-assist-body-ops-describe.php';
require_once $neo_pulse_wp_backend_assist_body_ops_dir . 'trait-neo-pulse-wp-backend-assist-body-ops-tables.php';
require_once $neo_pulse_wp_backend_assist_body_ops_dir . 'trait-neo-pulse-wp-backend-assist-body-ops-section-edits.php';

class Neo_Pulse_Wp_Backend_Assist_Body_Ops {

	use Neo_Pulse_Wp_Backend_Assist_Body_Ops_Trait_Sections;
	use Neo_Pulse_Wp_Backend_Assist_Body_Ops_Trait_Describe;
	use Neo_Pulse_Wp_Backend_Assist_Body_Ops_Trait_Tables;
	use Neo_Pulse_Wp_Backend_Assist_Body_Ops_Trait_Section_Edits;

	/**
	 * @param array<int, array<string, mixed>> $ops
	 * @return string|WP_Error
	 */
	public static function apply_ops( string $html, array $ops ) {
		$before = $html;

		$remove_indexes = array();
		$filtered_ops   = array();
		foreach ( $ops as $op ) {
			if ( ! is_array( $op ) ) {
				continue;
			}
			$name = sanitize_key( (string) ( $op['op'] ?? '' ) );
			if ( $name === 'remove_section' && isset( $op['section_index'] ) ) {
				$remove_indexes[] = (int) $op['section_index'];
				continue;
			}
			$filtered_ops[] = $op;
		}

		if ( $remove_indexes !== array() ) {
			rsort( $remove_indexes );
			foreach ( array_unique( $remove_indexes ) as $idx ) {
				$html = self::remove_section( $html, $idx );
			}
		}

		foreach ( $filtered_ops as $op ) {
			if ( ! is_array( $op ) ) {
				continue;
			}
			$name = sanitize_key( (string) ( $op['op'] ?? '' ) );
			switch ( $name ) {
				case 'remove_section':
					if ( ! empty( $op['heading_match'] ) ) {
						$html = self::remove_section_by_heading( $html, (string) $op['heading_match'] );
					}
					break;
				case 'truncate_after_table':
					$html = self::truncate_after_table( $html, $op );
					break;
				case 'remove_sections_after':
					$html = self::remove_sections_after( $html, $op );
					break;
				case 'strip_json_ld':
					$html = Neo_Pulse_Wp_Backend_Assist_Pipeline_Content_Prep::strip_json_ld_from_html( $html );
					break;
				case 'wrap':
					$html = self::apply_wrap_op( $html, $op );
					break;
				case 'replace_text':
					$html = self::apply_replace_op( $html, $op );
					break;
				case 'replace_heading':
					$html = self::apply_replace_heading( $html, $op );
					break;
				case 'convert_section_to_table':
					$html = self::convert_section_to_table( $html, $op );
					break;
				case 'insert_table_in_section':
					$html = self::insert_table_in_section( $html, $op );
					break;
				case 'replace_section_html':
					$html = self::apply_replace_section_html( $html, $op );
					break;
				case 'convert_list_in_section':
					$html = self::convert_list_in_section( $html, $op );
					break;
				case 'remove_table_in_section':
					$html = self::remove_table_in_section( $html, $op );
					break;
				case 'add_internal_links':
					$html = self::add_internal_links( $html, $op );
					break;
				case 'insert_overview_links':
					$html = self::insert_overview_links( $html, $op );
					break;
				default:
					return new WP_Error(
						'neo-pulse_body_op_unknown',
						sprintf(
							/* translators: %s: operation name */
							__( 'Unknown body edit operation: %s', 'neo-pulse-wp' ),
							$name
						)
					);
			}
		}

		$valid = self::validate_ops_result( $before, $html, $ops );
		if ( is_wp_error( $valid ) ) {
			return $valid;
		}

		return trim( (string) preg_replace( "/\n{3,}/", "\n\n", $html ) );
	}

	/**
	 * @param array<string, mixed> $op
	 */
	private static function apply_wrap_op( string $html, array $op ): string {
		$find = (string) ( $op['find'] ?? '' );
		$tag  = sanitize_key( (string) ( $op['tag'] ?? 'strong' ) );
		if ( $find === '' || ! str_contains( $html, $find ) ) {
			return $html;
		}
		$allowed = array( 'strong', 'em', 'b', 'i', 'a' );
		if ( ! in_array( $tag, $allowed, true ) ) {
			$tag = 'strong';
		}
		if ( $tag === 'a' ) {
			$href = esc_url( (string) ( $op['href'] ?? '' ) );
			if ( $href === '' ) {
				return $html;
			}
			$replacement = '<a href="' . esc_attr( $href ) . '">' . $find . '</a>';
		} else {
			$replacement = '<' . $tag . '>' . $find . '</' . $tag . '>';
		}
		$pos = strpos( $html, $find );
		if ( $pos === false ) {
			return $html;
		}
		return substr_replace( $html, $replacement, $pos, strlen( $find ) );
	}

	/**
	 * @param array<string, mixed> $op
	 */
	private static function apply_replace_op( string $html, array $op ): string {
		$find    = (string) ( $op['find'] ?? '' );
		$replace = (string) ( $op['replace'] ?? '' );
		if ( $find === '' || ! str_contains( $html, $find ) ) {
			return $html;
		}
		$pos = strpos( $html, $find );
		if ( $pos === false ) {
			return $html;
		}
		return substr_replace( $html, $replace, $pos, strlen( $find ) );
	}

	/**
	 * Replace one section heading text in place; body copy stays unchanged.
	 *
	 * @param array<string, mixed> $op
	 */
	public static function apply_replace_heading( string $html, array $op ): string {
		$sec = self::resolve_section( $html, $op );
		if ( $sec === null ) {
			return $html;
		}

		$new_heading = trim( (string) ( $op['new_heading'] ?? '' ) );
		if ( $new_heading === '' ) {
			return $html;
		}

		$chunk = substr( $html, (int) $sec['start'], (int) $sec['end'] - (int) $sec['start'] );
		$parts = self::parse_section_chunk( $chunk );
		if ( $parts === null ) {
			return $html;
		}

		$heading_html = (string) $parts['heading_html'];
		if ( ! preg_match( '/^(<h[23][^>]*>)(.*?)(<\/h[23]>)$/is', $heading_html, $match ) ) {
			return $html;
		}

		$new_heading_html = $match[1] . esc_html( $new_heading ) . $match[3];
		if ( $new_heading_html === $heading_html ) {
			return $html;
		}

		$parts['heading_html'] = $new_heading_html;
		$new_chunk             = self::rebuild_section_chunk( $parts, (string) $parts['body_html'] );
		return substr( $html, 0, (int) $sec['start'] ) . $new_chunk . substr( $html, (int) $sec['end'] );
	}

	/**
	 * @param array<int, array<string, mixed>> $ops
	 * @return true|WP_Error
	 */
	public static function validate_ops_result( string $before, string $after, array $ops ) {
		$remove_only = true;
		foreach ( $ops as $op ) {
			if ( ! is_array( $op ) ) {
				continue;
			}
			$name = sanitize_key( (string) ( $op['op'] ?? '' ) );
			if ( ! in_array( $name, array( 'remove_section', 'strip_json_ld', 'truncate_after_table', 'remove_sections_after' ), true ) ) {
				$remove_only = false;
				break;
			}
		}
		if ( ! $remove_only ) {
			return true;
		}

		$before_sections = self::index_html_sections( $before );
		$after_sections  = self::index_html_sections( $after );
		$removed_indexes = array();
		foreach ( $ops as $op ) {
			if ( ! is_array( $op ) || sanitize_key( (string) ( $op['op'] ?? '' ) ) !== 'remove_section' ) {
				continue;
			}
			if ( isset( $op['section_index'] ) ) {
				$removed_indexes[] = (int) $op['section_index'];
			}
		}

		foreach ( $before_sections as $sec ) {
			if ( in_array( (int) $sec['index'], $removed_indexes, true ) ) {
				continue;
			}
			if ( empty( $sec['has_table'] ) ) {
				continue;
			}
			$heading = strtolower( (string) $sec['heading_text'] );
			$found   = false;
			foreach ( $after_sections as $after_sec ) {
				if ( strtolower( (string) $after_sec['heading_text'] ) !== $heading ) {
					continue;
				}
				if ( ! empty( $after_sec['has_table'] ) ) {
					$found = true;
					break;
				}
			}
			if ( ! $found ) {
				return new WP_Error(
					'neo-pulse_body_op_table_lost',
					__( 'Body edit would remove or reformat a table section. Operation rejected.', 'neo-pulse-wp' )
				);
			}
		}

		return true;
	}
}
