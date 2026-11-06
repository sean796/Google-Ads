<?php
/**
 * Selector, site defaults, and control builder helpers for the NEO Pulse Search Elementor widget.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

use Elementor\Controls_Manager;
use Elementor\Group_Control_Typography;

trait Neo_Pulse_Wp_Search_Elementor_Widget_Trait_Helpers {

	/* ── Selector helpers ─────────────────────────────────────────────────── */

	/**
	 * Variables go on the widget's search wrap and on its panel/backdrop in <body>.
	 *
	 * @return array<string,string>
	 */
	private static function roots( string $css ): array {
		return array(
			'{{WRAPPER}} .neo-pulse-search-wrap' => $css,
			self::PORTAL                         => $css,
		);
	}

	/**
	 * Element selector inside the widget and inside the panel in <body>.
	 */
	private static function sel( string $inner ): string {
		return '{{WRAPPER}} ' . $inner . ', ' . self::PORTAL . ' ' . $inner;
	}

	/**
	 * The site's saved search setup, used as starting values so an untouched widget behaves as before.
	 *
	 * @return array{sidebar:array<string,mixed>,insights:array<string,mixed>,search:array<string,mixed>}
	 */
	private static function site_defaults(): array {
		static $cache = null;
		if ( $cache === null ) {
			$design = class_exists( 'Neo_Pulse_Wp_Ai_Widget_Design' ) ? Neo_Pulse_Wp_Ai_Widget_Design::get_settings() : array();
			$cache  = array(
				'sidebar'  => isset( $design['search_sidebar'] ) && is_array( $design['search_sidebar'] ) ? $design['search_sidebar'] : array(),
				'insights' => isset( $design['search_insights'] ) && is_array( $design['search_insights'] ) ? $design['search_insights'] : array(),
				'search'   => method_exists( 'Neo_Pulse_Wp_Search', 'get_search_settings' ) ? (array) Neo_Pulse_Wp_Search::get_search_settings() : array(),
			);
		}
		return $cache;
	}

	private static function yes_if( bool $on ): string {
		return $on ? 'yes' : '';
	}

	private static function default_display_mode(): string {
		$mode = (string) ( self::site_defaults()['sidebar']['display_mode'] ?? 'inline' );
		return in_array( $mode, array( 'icon_only', 'sidebar' ), true ) ? 'icon_only' : 'inline';
	}

	private static function default_open_as(): string {
		$sidebar = self::site_defaults()['sidebar'];
		if ( ( $sidebar['display_mode'] ?? '' ) === 'sidebar' ) {
			return ( ( $sidebar['sidebar_side'] ?? 'right' ) === 'left' ) ? 'sidebar_left' : 'sidebar_right';
		}
		$open = (string) ( $sidebar['icon_open_as'] ?? 'sidebar_right' );
		return in_array( $open, array( 'sidebar_right', 'sidebar_left', 'modal_center', 'expand_inline' ), true ) ? $open : 'sidebar_right';
	}

	/* ── Control helpers ──────────────────────────────────────────────────── */

	/**
	 * Colour control writing one or more variables.
	 *
	 * @param string|array<int,string> $vars
	 * @param array<string,mixed>      $extra
	 */
	private function color( string $id, string $label, $vars, array $extra = array() ): void {
		$css = '';
		foreach ( (array) $vars as $var ) {
			$css .= $var . ': {{VALUE}};';
		}
		$this->add_control(
			$id,
			array_merge(
				array(
					'label'     => $label,
					'type'      => Controls_Manager::COLOR,
					'selectors' => self::roots( $css ),
				),
				$extra
			)
		);
	}

	/**
	 * Slider control writing one variable.
	 *
	 * @param array<int,string>   $units
	 * @param array<string,mixed> $extra
	 */
	private function slider( string $id, string $label, string $var, int $min, int $max, bool $responsive = true, array $units = array( 'px' ), array $extra = array() ): void {
		$ranges = array(
			'px' => array( 'min' => $min, 'max' => $max ),
			'%'  => array( 'min' => 0, 'max' => 100 ),
			'vw' => array( 'min' => 0, 'max' => 100 ),
			'vh' => array( 'min' => 0, 'max' => 100 ),
			'em' => array( 'min' => 0, 'max' => 10, 'step' => 0.1 ),
		);
		$args   = array_merge(
			array(
				'label'      => $label,
				'type'       => Controls_Manager::SLIDER,
				'size_units' => $units,
				'range'      => array_intersect_key( $ranges, array_flip( $units ) ),
				'selectors'  => self::roots( $var . ': {{SIZE}}{{UNIT}};' ),
			),
			$extra
		);
		if ( $responsive ) {
			$this->add_responsive_control( $id, $args );
		} else {
			$this->add_control( $id, $args );
		}
	}

	private function typography( string $name, string $label, string $inner ): void {
		$this->add_group_control(
			Group_Control_Typography::get_type(),
			array(
				'name'     => $name,
				'label'    => $label,
				'selector' => self::sel( $inner ),
			)
		);
	}

	private function heading( string $id, string $label ): void {
		$this->add_control(
			$id,
			array(
				'label'     => $label,
				'type'      => Controls_Manager::HEADING,
				'separator' => 'before',
			)
		);
	}

	/**
	 * @param array<string,mixed> $extra
	 */
	private function switcher( string $id, string $label, string $default, array $extra = array() ): void {
		$this->add_control(
			$id,
			array_merge(
				array(
					'label'        => $label,
					'type'         => Controls_Manager::SWITCHER,
					'label_on'     => esc_html__( 'Show', 'neo-pulse-wp' ),
					'label_off'    => esc_html__( 'Hide', 'neo-pulse-wp' ),
					'return_value' => 'yes',
					'default'      => $default,
				),
				$extra
			)
		);
	}
}
