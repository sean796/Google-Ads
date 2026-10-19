<?php
/**
 * Reads the active Elementor kit's global colours (used by the AI widget designer).
 *
 * Reads elementor_active_kit + _elementor_page_settings. Does not import page templates or _elementor_data.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Migrate_Elementor_Global_Css {

	const KIT_OPTION = 'elementor_active_kit';

	/**
	 * @return int
	 */
	public static function kit_id(): int {
		return (int) get_option( self::KIT_OPTION, 0 );
	}

	/**
	 * @return array<string, mixed>
	 */
	public static function read_kit_settings(): array {
		$kit_id = self::kit_id();
		if ( $kit_id < 1 ) {
			return array();
		}
		$settings = get_post_meta( $kit_id, '_elementor_page_settings', true );
		return is_array( $settings ) ? $settings : array();
	}

	/**
	 * @param array<string, mixed> $settings
	 * @return array<string, mixed>
	 */
	public static function map_colors( array $settings ): array {
		$out = array(
			'gc_color_primary'   => '',
			'gc_color_secondary' => '',
			'gc_color_accent'    => '',
			'gc_color_text'      => '',
			'gc_custom_colors'   => array(),
		);

		$system = isset( $settings['system_colors'] ) && is_array( $settings['system_colors'] ) ? $settings['system_colors'] : array();
		foreach ( $system as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$id    = sanitize_key( (string) ( $row['_id'] ?? '' ) );
			$color = sanitize_hex_color( (string) ( $row['color'] ?? '' ) );
			if ( ! $color ) {
				continue;
			}
			if ( $id === 'primary' ) {
				$out['gc_color_primary'] = $color;
			} elseif ( $id === 'secondary' ) {
				$out['gc_color_secondary'] = $color;
			} elseif ( $id === 'accent' ) {
				$out['gc_color_accent'] = $color;
			} elseif ( $id === 'text' ) {
				$out['gc_color_text'] = $color;
			}
		}

		$custom = isset( $settings['custom_colors'] ) && is_array( $settings['custom_colors'] ) ? $settings['custom_colors'] : array();
		foreach ( $custom as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$color = sanitize_hex_color( (string) ( $row['color'] ?? '' ) );
			if ( ! $color ) {
				continue;
			}
			$out['gc_custom_colors'][] = array(
				'name'  => sanitize_text_field( (string) ( $row['title'] ?? $row['_id'] ?? '' ) ),
				'color' => $color,
			);
		}

		return $out;
	}
}
