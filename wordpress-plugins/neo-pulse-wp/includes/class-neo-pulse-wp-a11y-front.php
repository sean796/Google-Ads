<?php
/**
 * neodigital.ca front end: skip link and the Elementor 4 waypoint shim.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_A11y_Front {

	public static function init(): void {
		add_action( 'wp_head', array( __CLASS__, 'print_skip_css' ), 1 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_elementor_waypoint_shim' ), 20 );
		add_action( 'wp_body_open', array( __CLASS__, 'print_skip_link' ), 0 );
		add_action( 'wp_footer', array( __CLASS__, 'print_skip_target_script' ), 1 );
	}

	/**
	 * Ygency counters call elementorFrontend.waypoint, removed in Elementor 4.
	 */
	public static function enqueue_elementor_waypoint_shim(): void {
		if ( ! defined( 'ELEMENTOR_VERSION' ) ) {
			return;
		}
		$deps = array( 'jquery' );
		if ( wp_script_is( 'elementor-frontend', 'registered' ) ) {
			$deps[] = 'elementor-frontend';
		}
		wp_enqueue_script(
			'neo-pulse-elementor-waypoint',
			plugins_url( 'assets/frontend/neo-pulse-elementor-waypoint.js', NEO_PULSE_WP_PLUGIN_FILE ),
			$deps,
			NEO_PULSE_WP_VERSION,
			true
		);
	}

	public static function skip_css(): string {
		return '<style id="neo-pulse-a11y-skip">.neo-pulse-skip-link{position:absolute;left:8px;top:-48px;z-index:100000;padding:8px 12px;background:#84bd00;color:#02050A}.neo-pulse-skip-link:focus{top:8px}</style>';
	}

	public static function print_skip_css(): void {
		echo self::skip_css() . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- static markup.
	}

	/**
	 * Skip link to #content (Hello Elementor's main element id).
	 */
	public static function print_skip_link(): void {
		echo '<a class="neo-pulse-skip-link" href="#content">' . esc_html__( 'Skip to content', 'neo-pulse-wp' ) . '</a>' . "\n";
	}

	/**
	 * When the page has no #content, point the skip link at <main> instead.
	 */
	public static function print_skip_target_script(): void {
		echo "<script id=\"neo-pulse-skip-target\">(function(){var l=document.querySelector('.neo-pulse-skip-link');if(!l||document.getElementById('content')){return;}var m=document.querySelector('main,[role=\"main\"]');if(!m){return;}if(m.id){l.setAttribute('href','#'+m.id);}else{m.id='content';}})();</script>\n";
	}
}
