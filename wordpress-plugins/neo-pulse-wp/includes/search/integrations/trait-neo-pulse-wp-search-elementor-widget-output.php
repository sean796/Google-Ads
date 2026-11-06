<?php
/**
 * Rendering and settings mapping for the NEO Pulse Search Elementor widget.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Search_Elementor_Widget_Trait_Output {

	/* ── Output ───────────────────────────────────────────────────────────── */

	protected function render(): void {
		$settings = $this->get_settings_for_display();
		$raw      = $this->get_data( 'settings' );
		$instance = self::map_settings( is_array( $settings ) ? $settings : array(), is_array( $raw ) ? $raw : array() );

		$icon = isset( $settings['launcher_icon_new'] ) && is_array( $settings['launcher_icon_new'] ) ? $settings['launcher_icon_new'] : array();
		if ( ! empty( $icon['value'] ) && class_exists( '\Elementor\Icons_Manager' ) ) {
			ob_start();
			\Elementor\Icons_Manager::render_icon( $icon, array( 'aria-hidden' => 'true' ) );
			$html = trim( (string) ob_get_clean() );
			if ( $html !== '' ) {
				$instance['launcher_icon_html'] = $html;
			}
		}

		if ( self::is_elementor_editor_context() ) {
			$instance['elementor_edit_context'] = true;
			$instance['preview_state']          = (string) ( $settings['preview_state'] ?? 'suggestions' );
		}

		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- Markup built and escaped by the renderer.
		echo Neo_Pulse_Wp_Search::render_instance( $instance );
	}

	public static function is_elementor_editor_context(): bool {
		if ( ! class_exists( '\Elementor\Plugin' ) ) {
			return false;
		}
		$plugin = \Elementor\Plugin::$instance;
		if ( isset( $plugin->editor ) && $plugin->editor->is_edit_mode() ) {
			return true;
		}
		if ( isset( $plugin->preview ) && $plugin->preview->is_preview_mode() ) {
			return true;
		}
		return false;
	}

	/**
	 * Widget settings → render instance. $raw holds only what was saved on the widget, used to carry
	 * values from controls that no longer exist (older versions of this widget).
	 *
	 * @param array<string,mixed> $settings Settings with defaults filled in.
	 * @param array<string,mixed> $raw      Saved settings only.
	 * @return array<string,mixed>
	 */
	public static function map_settings( array $settings, array $raw = array() ): array {
		$instance = array();

		// Show as: old "Full-height sidebar" is an icon button that opens a side panel.
		$display = (string) ( $settings['display_mode'] ?? '' );
		$open_as = (string) ( $settings['icon_open_as'] ?? '' );
		if ( $display === 'sidebar' ) {
			$display = 'icon_only';
			$open_as = ( ( $raw['sidebar_side'] ?? ( self::site_defaults()['sidebar']['sidebar_side'] ?? 'right' ) ) === 'left' ) ? 'sidebar_left' : 'sidebar_right';
		}
		if ( ! in_array( $display, array( 'inline', 'icon_only' ), true ) ) {
			$display = self::default_display_mode();
		}
		if ( ! in_array( $open_as, array( 'sidebar_right', 'sidebar_left', 'modal_center', 'expand_inline' ), true ) ) {
			$open_as = self::default_open_as();
		}
		$instance['display_mode'] = $display;
		$instance['icon_open_as'] = $open_as;

		// Text: blank means the site's search settings.
		foreach ( array( 'placeholder', 'button_label' ) as $key ) {
			if ( isset( $settings[ $key ] ) && trim( (string) $settings[ $key ] ) !== '' ) {
				$instance[ $key ] = (string) $settings[ $key ];
			}
		}
		if ( isset( $settings['max_results'] ) && $settings['max_results'] !== '' && $settings['max_results'] !== null ) {
			$instance['max_results'] = (int) $settings['max_results'];
		}

		// Icon button.
		foreach ( array( 'launcher_text', 'launcher_label' ) as $key ) {
			if ( isset( $settings[ $key ] ) ) {
				$instance[ $key ] = (string) $settings[ $key ];
			}
		}
		if ( ! empty( $raw['launcher_icon'] ) ) {
			$instance['launcher_icon'] = Neo_Pulse_Wp_Search_Icons::sanitize_id( (string) $raw['launcher_icon'] );
		}

		// Panel.
		$show_heading = $settings['show_heading'] ?? 'yes';
		if ( ! array_key_exists( 'show_heading', $raw ) && array_key_exists( 'sidebar_layout_heading', $raw ) ) {
			$show_heading = $raw['sidebar_layout_heading'];
		}
		$instance['show_heading']       = ( $show_heading === 'yes' ) ? 'yes' : 'no';
		$instance['sidebar_heading']    = (string) ( $settings['sidebar_heading'] ?? '' );
		$instance['sidebar_subtitle']   = (string) ( $settings['sidebar_subtitle'] ?? '' );
		$instance['sidebar_transition'] = (string) ( $settings['sidebar_transition'] ?? 'slide' );

		// Older widgets: "Hero" preset keeps its larger bar.
		if ( ( $raw['layout_preset'] ?? '' ) === 'hero' ) {
			$instance['layout'] = 'hero';
		}

		// Suggestions.
		foreach ( array( 'popular_terms', 'popular_pages_overseer', 'popular_pages_search' ) as $key ) {
			$instance[ 'show_' . $key ] = ( ( $settings[ 'show_' . $key ] ?? '' ) === 'yes' ) ? 'yes' : 'no';
			if ( isset( $settings[ 'label_' . $key ] ) && trim( (string) $settings[ 'label_' . $key ] ) !== '' ) {
				$instance[ 'label_' . $key ] = (string) $settings[ 'label_' . $key ];
			}
		}
		if ( isset( $settings['popular_terms_limit'] ) && $settings['popular_terms_limit'] !== '' ) {
			$instance['popular_terms_limit'] = (int) $settings['popular_terms_limit'];
		}

		// Switches (yes / no).
		foreach ( array( 'show_field_icon', 'show_thumbnails', 'show_excerpt', 'show_type_tag', 'show_match_score', 'show_best_match', 'show_pinned_terms', 'show_ai_banner', 'show_powered_by', 'combine_with_chat' ) as $key ) {
			$instance[ $key ] = ( ( $settings[ $key ] ?? '' ) === 'yes' ) ? 'yes' : 'no';
		}

		return $instance;
	}
}
