<?php
/**
 * Shared NEO Pulse brand icon (brain — Lucide-style two-hemisphere mark).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Brand_Icon {

	/**
	 * Inline SVG brain icon for the admin bar.
	 *
	 * @param string $color Stroke color.
	 * @param int    $size  Pixel width/height.
	 */
	public static function brand_icon_svg( string $color = '#22d3ee', int $size = 20 ): string {
		$color = sanitize_hex_color( $color );
		if ( ! is_string( $color ) || $color === '' ) {
			$color = '#22d3ee';
		}

		$size = max( 14, min( 32, $size ) );

		return '<svg class="neo-pulse-wp-brand-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' . (int) $size . '" height="' . (int) $size . '" fill="none" stroke="' . esc_attr( $color ) . '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'
			. '<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>'
			. '<path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>'
			. '<path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>'
			. '<path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/>'
			. '<path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/>'
			. '<path d="M3.477 10.896a4 4 0 0 1 .585-.396"/>'
			. '<path d="M19.938 10.5a4 4 0 0 1 .585.396"/>'
			. '<path d="M6 18a4 4 0 0 1-1.967-.516"/>'
			. '<path d="M19.967 17.484A4 4 0 0 1 18 18"/>'
			. '</svg>';
	}
}
