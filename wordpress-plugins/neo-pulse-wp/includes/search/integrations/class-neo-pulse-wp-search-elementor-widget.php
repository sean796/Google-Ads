<?php
/**
 * Elementor NEO Pulse Search widget (0.9.236).
 *
 * Every part of the search is styled here: the icon button, the search field, the panel or popup,
 * pills, cards, the AI line and "Powered by". Style controls set --nps-* variables (see
 * assets/search/neo-pulse-search.css) on the widget and on the panel once the search script moves it
 * to <body>, so changes show live in the editor and on the site.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

use Elementor\Controls_Manager;
use Elementor\Group_Control_Box_Shadow;
use Elementor\Group_Control_Typography;
use Elementor\Widget_Base;

$neo_pulse_wp_search_elementor_widget_dir = __DIR__ . '/';
require_once $neo_pulse_wp_search_elementor_widget_dir . 'trait-neo-pulse-wp-search-elementor-widget-helpers.php';
require_once $neo_pulse_wp_search_elementor_widget_dir . 'trait-neo-pulse-wp-search-elementor-widget-content-controls.php';
require_once $neo_pulse_wp_search_elementor_widget_dir . 'trait-neo-pulse-wp-search-elementor-widget-style-controls.php';
require_once $neo_pulse_wp_search_elementor_widget_dir . 'trait-neo-pulse-wp-search-elementor-widget-output.php';

class Neo_Pulse_Wp_Search_Elementor_Widget extends Widget_Base {

	/**
	 * The panel and backdrop are moved to <body> (front end and editor preview) and carry the widget ID.
	 */
	const PORTAL = 'body > .nps-root[data-neo-pulse-el="{{ID}}"]';

	use Neo_Pulse_Wp_Search_Elementor_Widget_Trait_Helpers;
	use Neo_Pulse_Wp_Search_Elementor_Widget_Trait_Content_Controls;
	use Neo_Pulse_Wp_Search_Elementor_Widget_Trait_Style_Controls;
	use Neo_Pulse_Wp_Search_Elementor_Widget_Trait_Output;

	public function get_name(): string {
		return 'neo-pulse_search';
	}

	public function get_title(): string {
		return esc_html__( 'NEO Pulse Search', 'neo-pulse-wp' );
	}

	public function get_icon(): string {
		return 'eicon-search';
	}

	/**
	 * @return array<int,string>
	 */
	public function get_categories(): array {
		return array( 'neo-pulse' );
	}

	/**
	 * @return array<int,string>
	 */
	public function get_keywords(): array {
		return array( 'search', 'ai', 'neo-pulse', 'site search' );
	}

	/**
	 * @return array<int,string>
	 */
	public function get_style_depends(): array {
		return array( 'neo-pulse-ai-sidebar-shell', 'neo-pulse-search' );
	}

	/**
	 * @return array<int,string>
	 */
	public function get_script_depends(): array {
		return array( 'neo-pulse-ai-sidebar-shell', 'neo-pulse-ai-sidebar-unify', 'neo-pulse-search', 'neo-pulse-search-elementor-preview' );
	}

	/**
	 * Output depends on site search settings and live insights, so Elementor must not cache it.
	 */
	protected function is_dynamic_content(): bool {
		return true;
	}

}
