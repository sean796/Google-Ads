<?php
/**
 * CSS var builders + color helpers for AI widget design.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Ai_Widget_Design_Css {

	/**
	 * Default light Site Branding fallback (identical for chat + search).
	 *
	 * @return array<string,mixed>
	 */
	public static function fallback_palette(): array {
		return array(
			'bg'                   => '#ffffff',
			'bg_elevated'          => '#f8fafc',
			'card_bg'              => '#ffffff',
			'dropdown_bg'          => '#ffffff',
			'input_bg'             => '#ffffff',
			'header_bg'            => '#f8fafc',
			'launcher_bg'          => '#3b82f6',
			'launcher_glow'        => '#3b82f6',
			'launcher_text'        => '#ffffff',
			'text'                 => '#1e293b',
			'text_secondary'       => '#475569',
			'text_muted'           => '#64748b',
			'link'                 => '#2563eb',
			'placeholder'          => '#94a3b8',
			'border'               => '#cbd5e1',
			'border_hover'         => '#94a3b8',
			'focus_ring'           => '#3b82f6',
			'accent'               => '#3b82f6',
			'accent_text'          => '#ffffff',
			'highlight'            => '#06b6d4',
			'button_bg'            => '#3b82f6',
			'button_text'          => '#ffffff',
			'button_hover'         => '#2563eb',
			'user_bubble_bg'       => '#3b82f6',
			'user_bubble_text'     => '#ffffff',
			'assistant_bubble_bg'  => '#f1f5f9',
			'assistant_bubble_text'=> '#1e293b',
			'thinking_border'      => '#06b6d4',
			'mic_idle'             => '#3b82f6',
			'mic_recording'        => '#22c55e',
			'send_bg'              => '#3b82f6',
			'result_hover'         => '#f1f5f9',
			'score_color'          => '#64748b',
			'banner_bg'            => '#eff6ff',
			'banner_text'          => '#1e40af',
			'powered_text'         => '#64748b',
			'powered_icon'         => '#3b82f6',
			'icon_color'           => '#3b82f6',
			'button_border'        => '#cbd5e1',
			'form_border'          => '#cbd5e1',
			'input_text'           => '#1e293b',
			'radius'               => 8,
			'radius_sm'            => 6,
			'font_size'            => 16,
			'font_family'          => 'Lato',
			'shadow'               => '0 4px 24px rgba(0, 0, 0, 0.12)',
			'launcher_size'        => 56,
			'panel_width'          => 380,
			'panel_max_height'     => 560,
			'offset_x'             => 20,
			'offset_y'             => 20,
			'z_index'              => 999999,
		);
	}

	/**
	 * @return string[]
	 */
	public static function color_token_keys(): array {
		return array(
			'bg', 'bg_elevated', 'card_bg', 'dropdown_bg', 'input_bg', 'header_bg', 'launcher_bg', 'launcher_glow', 'launcher_text',
			'text', 'text_secondary', 'text_muted', 'link', 'placeholder',
			'border', 'border_hover', 'focus_ring',
			'accent', 'accent_text', 'highlight', 'button_bg', 'button_text', 'button_hover',
			'user_bubble_bg', 'user_bubble_text', 'assistant_bubble_bg', 'assistant_bubble_text',
			'thinking_border', 'mic_idle', 'mic_recording', 'send_bg',
			'result_hover', 'score_color', 'banner_bg', 'banner_text',
			'powered_text', 'powered_icon', 'icon_color', 'button_border', 'form_border', 'input_text',
		);
	}

	/**
	 * Keys Site Branding may overlay from the Elementor kit (brand roles only).
	 *
	 * @return string[]
	 */
	public static function site_branding_token_keys(): array {
		return array(
			'accent', 'accent_text', 'button_bg', 'button_text', 'button_hover',
			'send_bg', 'mic_idle', 'focus_ring', 'link',
			'user_bubble_bg', 'bg_elevated', 'header_bg', 'assistant_bubble_bg',
			'result_hover', 'highlight', 'thinking_border', 'banner_bg', 'banner_text',
			'text', 'assistant_bubble_text', 'text_secondary', 'text_muted',
			'placeholder', 'border', 'border_hover', 'score_color',
		);
	}

	/**
	 * @return string[]
	 */
	public static function shape_token_keys(): array {
		return array(
			'radius', 'radius_sm', 'font_size', 'font_family', 'shadow',
			'launcher_size', 'panel_width', 'panel_max_height', 'offset_x', 'offset_y', 'z_index',
		);
	}

	/**
	 * @return array<string,bool>
	 */
	public static function default_chat_visibility(): array {
		return array(
			'header' => true, 'avatar' => true, 'assistant_name' => true,
			'close_button' => true, 'welcome_message' => true, 'thinking_card' => true,
			'source_pills' => false, 'cta_buttons' => true, 'suggestion_chips' => true,
			'confidence' => false, 'type_badge' => false, 'powered_by' => true, 'send_button' => true,
			'mic_button' => true, 'voice_toast' => true,
		);
	}

	/**
	 * @return array<string,bool>
	 */
	public static function default_search_visibility(): array {
		return array(
			'search_icon' => true, 'submit_button' => true, 'clear_button' => true,
			'ai_banner' => true, 'relevance_scores' => true, 'powered_by' => true,
			'dropdown_shadow' => true, 'empty_state' => true,
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function defaults(): array {
		$palette = self::fallback_palette();
		return array(
			'style_scope'     => 'both',
			'color_source'    => 'site_branding',
			'shared'          => $palette,
			'chat'            => $palette,
			'search'          => $palette,
			'chat_ui'         => self::default_chat_visibility(),
			'search_ui'       => self::default_search_visibility(),
			'search_sidebar'  => self::default_search_sidebar_config(),
			'chat_sidebar'    => self::default_chat_sidebar_config(),
			'search_insights' => self::default_search_insights_config(),
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function default_search_sidebar_config(): array {
		return array(
			'display_mode'       => 'inline',
			'sidebar_side'       => 'right',
			'sidebar_transition' => 'slide',
			'sidebar_width'      => 400,
			'sidebar_heading'    => '',
			'sidebar_layout'     => array( 'heading', 'search', 'results', 'popular_terms' ),
			'launcher_icon'      => 'search',
			'icon_open_as'       => 'sidebar_right',
			'modal_max_width'    => 560,
			'launcher_label'     => '',
			'panel_layout'       => 'compact',
			'sidebar_subtitle'   => '',
			'panel_offset_top'   => 64,
			'panel_offset_top_unit' => 'px',
			'panel_content_align' => 'left',
			'backdrop_opacity'    => 35,
			'header_search_opens_sidebar' => false,
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function default_search_insights_config(): array {
		return array(
			'logging_enabled'             => true,
			'show_popular_terms'          => true,
			'show_popular_pages_overseer' => false,
			'show_popular_pages_search'   => false,
			'insights_days'               => 30,
			'popular_terms_limit'         => 5,
		);
	}

	/**
	 * @param array<string,mixed> $raw
	 * @return array<string,mixed>
	 */
	public static function sanitize_search_insights_config( array $raw ): array {
		$defaults = self::default_search_insights_config();
		return array(
			'logging_enabled'             => ! array_key_exists( 'logging_enabled', $raw ) || ! empty( $raw['logging_enabled'] ),
			'show_popular_terms'          => ! array_key_exists( 'show_popular_terms', $raw ) || ! empty( $raw['show_popular_terms'] ),
			'show_popular_pages_overseer' => ! empty( $raw['show_popular_pages_overseer'] ),
			'show_popular_pages_search'   => ! empty( $raw['show_popular_pages_search'] ),
			'insights_days'               => isset( $raw['insights_days'] ) ? max( 1, min( 365, (int) $raw['insights_days'] ) ) : (int) $defaults['insights_days'],
			'popular_terms_limit'         => isset( $raw['popular_terms_limit'] ) ? max( 1, min( 20, (int) $raw['popular_terms_limit'] ) ) : (int) $defaults['popular_terms_limit'],
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function default_chat_sidebar_config(): array {
		return array(
			'sidebar_side'       => 'right',
			'sidebar_transition' => 'slide',
			'sidebar_width'      => 400,
			'sidebar_heading'    => '',
			'sidebar_layout'     => array( 'contact_human', 'chat' ),
			'launcher_style'     => 'circle',
			'launcher_label'     => '',
			'header_search_opens_sidebar' => false,
		);
	}

	/**
	 * @param array<string,mixed> $raw
	 * @param string              $widget 'search' | 'chat'
	 * @return array<string,mixed>
	 */
	public static function sanitize_sidebar_config( array $raw, string $widget ): array {
		$defaults = $widget === 'search'
			? self::default_search_sidebar_config()
			: self::default_chat_sidebar_config();

		$out = $defaults;

		if ( $widget === 'search' ) {
			$mode = isset( $raw['display_mode'] ) ? (string) $raw['display_mode'] : $defaults['display_mode'];
			$out['display_mode'] = in_array( $mode, array( 'sidebar', 'icon_only' ), true ) ? $mode : 'inline';
		}

		$side = isset( $raw['sidebar_side'] ) ? (string) $raw['sidebar_side'] : $defaults['sidebar_side'];
		$out['sidebar_side'] = ( $side === 'left' ) ? 'left' : 'right';

		$transition = isset( $raw['sidebar_transition'] ) ? (string) $raw['sidebar_transition'] : $defaults['sidebar_transition'];
		$out['sidebar_transition'] = in_array( $transition, array( 'slide', 'fade', 'none' ), true )
			? $transition
			: 'slide';

		$out['sidebar_width'] = isset( $raw['sidebar_width'] )
			? max( 280, min( 560, (int) $raw['sidebar_width'] ) )
			: (int) $defaults['sidebar_width'];

		$out['sidebar_heading'] = isset( $raw['sidebar_heading'] )
			? sanitize_text_field( (string) $raw['sidebar_heading'] )
			: (string) $defaults['sidebar_heading'];

		$layout_keys = $widget === 'search'
			? array( 'heading', 'search', 'popular_terms', 'popular_topics', 'results' )
			: array( 'heading', 'contact_human', 'chat' );
		$layout = array();
		if ( isset( $raw['sidebar_layout'] ) && is_array( $raw['sidebar_layout'] ) ) {
			foreach ( $raw['sidebar_layout'] as $section ) {
				$key = sanitize_key( (string) $section );
				if ( in_array( $key, $layout_keys, true ) ) {
					$layout[] = $key;
				}
			}
		} elseif ( isset( $raw['sidebar_layout'] ) && is_string( $raw['sidebar_layout'] ) ) {
			foreach ( explode( ',', $raw['sidebar_layout'] ) as $section ) {
				$key = sanitize_key( trim( $section ) );
				if ( $key !== '' && in_array( $key, $layout_keys, true ) ) {
					$layout[] = $key;
				}
			}
		}
		if ( empty( $layout ) ) {
			$layout = $widget === 'search'
				? array( 'search', 'results' )
				: array( 'chat' );
		}
		$out['sidebar_layout'] = array_values( array_unique( $layout ) );

		if ( $widget === 'chat' ) {
			$style = isset( $raw['launcher_style'] ) ? (string) $raw['launcher_style'] : (string) $defaults['launcher_style'];
			$out['launcher_style'] = in_array( $style, array( 'edge_tab', 'none' ), true ) ? $style : 'circle';

			$out['launcher_label'] = isset( $raw['launcher_label'] )
				? sanitize_text_field( (string) $raw['launcher_label'] )
				: (string) $defaults['launcher_label'];
			if ( in_array( $out['launcher_label'], array( 'Open Flow Assist', 'Flow Assist' ), true ) ) {
				$out['launcher_label'] = '';
			}

			$out['header_search_opens_sidebar'] = ! empty( $raw['header_search_opens_sidebar'] );
		}

		if ( $widget === 'search' ) {
			$out['launcher_icon'] = class_exists( 'Neo_Pulse_Wp_Search_Icons' )
				? Neo_Pulse_Wp_Search_Icons::sanitize_id( (string) ( $raw['launcher_icon'] ?? $defaults['launcher_icon'] ) )
				: 'search';

			$open_as = isset( $raw['icon_open_as'] ) ? (string) $raw['icon_open_as'] : (string) $defaults['icon_open_as'];
			$allowed = array( 'sidebar_left', 'sidebar_right', 'modal_center', 'expand_inline' );
			$out['icon_open_as'] = in_array( $open_as, $allowed, true ) ? $open_as : 'sidebar_right';

			if ( $out['display_mode'] === 'icon_only' ) {
				if ( $out['icon_open_as'] === 'sidebar_left' ) {
					$out['sidebar_side'] = 'left';
				} elseif ( $out['icon_open_as'] === 'sidebar_right' ) {
					$out['sidebar_side'] = 'right';
				}
			}

			$out['modal_max_width'] = isset( $raw['modal_max_width'] )
				? max( 320, min( 720, (int) $raw['modal_max_width'] ) )
				: (int) $defaults['modal_max_width'];

			$out['launcher_label'] = isset( $raw['launcher_label'] )
				? sanitize_text_field( (string) $raw['launcher_label'] )
				: (string) $defaults['launcher_label'];

			$panel_layout = isset( $raw['panel_layout'] ) ? (string) $raw['panel_layout'] : (string) $defaults['panel_layout'];
			$out['panel_layout'] = in_array( $panel_layout, array( 'compact', 'discovery' ), true ) ? $panel_layout : 'compact';

			$out['sidebar_subtitle'] = isset( $raw['sidebar_subtitle'] )
				? sanitize_text_field( (string) $raw['sidebar_subtitle'] )
				: (string) $defaults['sidebar_subtitle'];

			$offset_unit = isset( $raw['panel_offset_top_unit'] ) ? (string) $raw['panel_offset_top_unit'] : (string) $defaults['panel_offset_top_unit'];
			$out['panel_offset_top_unit'] = in_array( $offset_unit, array( 'px', 'vh', '%' ), true ) ? $offset_unit : 'px';

			$offset_raw = isset( $raw['panel_offset_top'] ) ? (int) $raw['panel_offset_top'] : (int) $defaults['panel_offset_top'];
			if ( $out['panel_offset_top_unit'] === 'px' ) {
				$out['panel_offset_top'] = max( 0, min( 400, $offset_raw ) );
			} else {
				$out['panel_offset_top'] = max( 0, min( 80, $offset_raw ) );
			}

			$align = isset( $raw['panel_content_align'] ) ? (string) $raw['panel_content_align'] : (string) $defaults['panel_content_align'];
			$out['panel_content_align'] = ( $align === 'center' ) ? 'center' : 'left';

			$out['backdrop_opacity'] = isset( $raw['backdrop_opacity'] )
				? max( 0, min( 100, (int) $raw['backdrop_opacity'] ) )
				: (int) $defaults['backdrop_opacity'];

			$out['header_search_opens_sidebar'] = ! empty( $raw['header_search_opens_sidebar'] );

			if ( $out['panel_layout'] === 'discovery' && ( ! isset( $raw['sidebar_width'] ) || (int) $raw['sidebar_width'] <= 400 ) ) {
				$out['sidebar_width'] = max( 520, (int) $out['sidebar_width'] );
			}
		}

		return $out;
	}

	/**
	 * @param array<string,mixed> $config
	 */
	public static function format_panel_offset_top( array $config ): string {
		$unit  = isset( $config['panel_offset_top_unit'] ) ? (string) $config['panel_offset_top_unit'] : 'px';
		$unit  = in_array( $unit, array( 'px', 'vh', '%' ), true ) ? $unit : 'px';
		$value = isset( $config['panel_offset_top'] ) ? (int) $config['panel_offset_top'] : 64;
		if ( $unit === 'px' ) {
			$value = max( 0, min( 400, $value ) );
		} else {
			$value = max( 0, min( 80, $value ) );
		}
		return $value . $unit;
	}

	/**
	 * @param array<string,mixed> $config
	 * @param array<string,mixed> $tokens
	 */
	public static function build_sidebar_css_vars( array $config, array $tokens = array() ): string {
		$width   = max( 280, (int) ( $config['sidebar_width'] ?? 400 ) );
		$z_index = max( 1, (int) ( $tokens['z_index'] ?? 999999 ) );
		$parts   = array(
			'--fai-sidebar-width:' . $width . 'px',
			'--fai-sidebar-z-index:' . $z_index,
			'--fbs-panel-offset-top:' . esc_attr( self::format_panel_offset_top( $config ) ),
			'--fbs-backdrop-opacity:' . max( 0, min( 100, (int) ( $config['backdrop_opacity'] ?? 35 ) ) ) . '%',
			'--fai-sidebar-bg:' . esc_attr( (string) ( $tokens['bg'] ?? '#ffffff' ) ),
			'--fai-sidebar-text:' . esc_attr( (string) ( $tokens['text'] ?? '#1e293b' ) ),
			'--fai-sidebar-text-muted:' . esc_attr( (string) ( $tokens['text_muted'] ?? '#64748b' ) ),
			'--fai-sidebar-hover:' . esc_attr( (string) ( $tokens['result_hover'] ?? '#f1f5f9' ) ),
			'--fai-sidebar-launcher-bg:' . esc_attr( (string) ( $tokens['launcher_bg'] ?? $tokens['accent'] ?? '#3b82f6' ) ),
			'--fai-sidebar-launcher-text:' . esc_attr( (string) ( $tokens['launcher_text'] ?? $tokens['accent_text'] ?? '#ffffff' ) ),
		);
		return implode( ';', $parts ) . ';';
	}

	/**
	 * Build inline CSS custom properties for chat (--fcw-*).
	 *
	 * @param array<string,mixed>|null $tokens
	 */
	public static function build_chat_css_vars( ?array $tokens = null ): string {
		$t = $tokens ?? self::resolve( 'chat' );
		$map = array(
			'bg' => 'bg', 'bg_elevated' => 'bg-elevated', 'card_bg' => 'card-bg',
			'input_bg' => 'input-bg', 'header_bg' => 'header-bg', 'launcher_bg' => 'launcher-bg',
			'launcher_glow' => 'launcher-glow', 'launcher_text' => 'launcher-text',
			'text' => 'text', 'text_secondary' => 'text-secondary', 'text_muted' => 'text-muted',
			'link' => 'link', 'placeholder' => 'placeholder',
			'border' => 'border', 'border_hover' => 'border-hover', 'focus_ring' => 'focus-ring',
			'accent' => 'accent', 'accent_text' => 'accent-text', 'highlight' => 'highlight',
			'button_bg' => 'button-bg', 'button_text' => 'button-text', 'button_hover' => 'button-hover',
			'user_bubble_bg' => 'user-bubble-bg', 'user_bubble_text' => 'user-bubble-text',
			'assistant_bubble_bg' => 'assistant-bubble-bg', 'assistant_bubble_text' => 'assistant-bubble-text',
			'thinking_border' => 'thinking-border', 'mic_idle' => 'mic-idle',
			'mic_recording' => 'mic-recording', 'send_bg' => 'send-bg',
			'powered_text' => 'powered', 'powered_icon' => 'powered-icon',
			'icon_color' => 'icon', 'button_border' => 'button-border',
			'form_border' => 'form-border', 'input_text' => 'input-text',
			'shadow' => 'shadow', 'font_family' => 'font-family',
		);
		$parts = array();
		foreach ( $map as $key => $css ) {
			if ( ! isset( $t[ $key ] ) ) {
				continue;
			}
			$parts[] = '--fcw-' . $css . ':' . esc_attr( (string) $t[ $key ] );
		}
		$parts[] = '--fcw-radius:' . (int) ( $t['radius'] ?? 8 ) . 'px';
		$parts[] = '--fcw-radius-sm:' . (int) ( $t['radius_sm'] ?? 6 ) . 'px';
		$parts[] = '--fcw-font-size:' . max( 16, (int) ( $t['font_size'] ?? 16 ) ) . 'px';
		$parts[] = '--fcw-bubble-size:' . max( 40, (int) ( $t['launcher_size'] ?? 56 ) ) . 'px';
		$parts[] = '--fcw-panel-width:' . max( 280, (int) ( $t['panel_width'] ?? 380 ) ) . 'px';
		$parts[] = '--fcw-panel-max-height:' . max( 320, (int) ( $t['panel_max_height'] ?? 560 ) ) . 'px';
		$parts[] = '--fcw-offset-x:' . max( 0, (int) ( $t['offset_x'] ?? 20 ) ) . 'px';
		$parts[] = '--fcw-offset-y:' . max( 0, (int) ( $t['offset_y'] ?? 20 ) ) . 'px';
		$parts[] = '--fcw-z-index:' . max( 1, (int) ( $t['z_index'] ?? 999999 ) );
		// Shapes from the NEO Pulse Chat widget; the stylesheet has defaults when these are not set.
		$shapes = array(
			'panel_radius'    => array( 'panel-radius', 0, 48, 'px' ),
			'msg_radius'      => array( 'msg-radius', 0, 32, 'px' ),
			'pill_radius'     => array( 'pill-radius', 0, 999, 'px' ),
			'composer_radius' => array( 'composer-radius', 0, 40, 'px' ),
			'head_size'       => array( 'head-size', 12, 32, 'px' ),
			'bd_opacity'      => array( 'bd-opacity', 0, 100, '%' ),
			'bd_blur'         => array( 'bd-blur', 0, 24, 'px' ),
		);
		foreach ( $shapes as $key => $shape ) {
			if ( isset( $t[ $key ] ) && $t[ $key ] !== '' ) {
				$parts[] = '--fcw-' . $shape[0] . ':' . max( $shape[1], min( $shape[2], (int) $t[ $key ] ) ) . $shape[3];
			}
		}
		if ( ! empty( $t['bd_color'] ) ) {
			$parts[] = '--fcw-bd-color:' . esc_attr( (string) $t['bd_color'] );
		}
		return implode( ';', $parts ) . ';';
	}

	/**
	 * Build inline CSS custom properties for search (--fbs-*).
	 *
	 * @param array<string,mixed>|null $tokens
	 * @param array<string,mixed>      $instance
	 */
	public static function build_search_css_vars( ?array $tokens = null, array $instance = array() ): string {
		$t = $tokens ?? self::resolve( 'search' );
		$max_width = isset( $instance['max_width'] ) && $instance['max_width'] !== ''
			? (string) $instance['max_width']
			: '520px';

		$parts = array(
			'--fbs-primary:' . esc_attr( (string) ( $t['accent'] ?? '#3b82f6' ) ),
			'--fbs-bg:' . esc_attr( (string) ( $t['bg'] ?? '#ffffff' ) ),
			'--fbs-radius:' . (int) ( $t['radius'] ?? 8 ) . 'px',
			'--fbs-font-size:' . max( 16, (int) ( $t['font_size'] ?? 16 ) ) . 'px',
			'--fbs-text:' . esc_attr( (string) ( $t['text'] ?? '#1e293b' ) ),
			'--fbs-text-muted:' . esc_attr( (string) ( $t['text_muted'] ?? '#64748b' ) ),
			'--fbs-text-secondary:' . esc_attr( (string) ( $t['text_secondary'] ?? '#475569' ) ),
			'--fbs-border:' . esc_attr( (string) ( $t['border'] ?? '#cbd5e1' ) ),
			'--fbs-border-hover:' . esc_attr( (string) ( $t['border_hover'] ?? '#94a3b8' ) ),
			'--fbs-hover:' . esc_attr( (string) ( $t['result_hover'] ?? '#f1f5f9' ) ),
			'--fbs-dropdown-bg:' . esc_attr( (string) ( $t['dropdown_bg'] ?? $t['bg'] ?? '#ffffff' ) ),
			'--fbs-dropdown-radius:' . (int) ( $t['radius'] ?? 8 ) . 'px',
			'--fbs-max-width:' . esc_attr( $max_width ),
			'--fbs-shadow:' . esc_attr( (string) ( $t['shadow'] ?? '0 4px 24px rgba(0, 0, 0, 0.12)' ) ),
			'--fbs-input-bg:' . esc_attr( (string) ( $t['input_bg'] ?? '#ffffff' ) ),
			'--fbs-placeholder:' . esc_attr( (string) ( $t['placeholder'] ?? '#94a3b8' ) ),
			'--fbs-button-bg:' . esc_attr( (string) ( $t['button_bg'] ?? $t['accent'] ?? '#3b82f6' ) ),
			'--fbs-button-text:' . esc_attr( (string) ( $t['button_text'] ?? '#ffffff' ) ),
			'--fbs-button-hover:' . esc_attr( (string) ( $t['button_hover'] ?? '#2563eb' ) ),
			'--fbs-focus-ring:' . esc_attr( (string) ( $t['focus_ring'] ?? '#3b82f6' ) ),
			'--fbs-link:' . esc_attr( (string) ( $t['link'] ?? '#2563eb' ) ),
			'--fbs-score:' . esc_attr( (string) ( $t['score_color'] ?? '#64748b' ) ),
			'--fbs-banner-bg:' . esc_attr( (string) ( $t['banner_bg'] ?? '#eff6ff' ) ),
			'--fbs-banner-text:' . esc_attr( (string) ( $t['banner_text'] ?? '#1e40af' ) ),
			'--fbs-powered:' . esc_attr( (string) ( $t['powered_text'] ?? $t['text_muted'] ?? '#64748b' ) ),
			'--fbs-powered-icon:' . esc_attr( (string) ( $t['powered_icon'] ?? $t['accent'] ?? '#3b82f6' ) ),
			'--fbs-icon:' . esc_attr( (string) ( $t['icon_color'] ?? $t['accent'] ?? '#3b82f6' ) ),
			'--fbs-button-border:' . esc_attr( (string) ( $t['button_border'] ?? $t['border'] ?? '#cbd5e1' ) ),
			'--fbs-form-border:' . esc_attr( (string) ( $t['form_border'] ?? $t['border'] ?? '#cbd5e1' ) ),
			'--fbs-input-text:' . esc_attr( (string) ( $t['input_text'] ?? $t['text'] ?? '#1e293b' ) ),
			'--fbs-font-family:' . esc_attr( (string) ( $t['font_family'] ?? 'Lato' ) ),
		);
		return implode( ';', $parts ) . ';';
	}

	/**
	 * CSS custom property names synced from Elementor wrap to portaled preview panel.
	 *
	 * @return array<int,string>
	 */
	public static function get_search_portal_css_var_names(): array {
		return array(
			'--fbs-primary',
			'--fbs-bg',
			'--fbs-radius',
			'--fbs-font-size',
			'--fbs-text',
			'--fbs-text-muted',
			'--fbs-text-secondary',
			'--fbs-border',
			'--fbs-border-hover',
			'--fbs-hover',
			'--fbs-dropdown-bg',
			'--fbs-dropdown-radius',
			'--fbs-max-width',
			'--fbs-shadow',
			'--fbs-input-bg',
			'--fbs-placeholder',
			'--fbs-button-bg',
			'--fbs-button-text',
			'--fbs-button-hover',
			'--fbs-focus-ring',
			'--fbs-link',
			'--fbs-score',
			'--fbs-banner-bg',
			'--fbs-banner-text',
			'--fbs-powered',
			'--fbs-powered-icon',
			'--fbs-icon',
			'--fbs-button-border',
			'--fbs-form-border',
			'--fbs-input-text',
			'--fbs-font-family',
			'--fbs-launcher-bg',
			'--fbs-launcher-color',
			'--fbs-launcher-hover-bg',
			'--fbs-launcher-size',
			'--fbs-launcher-radius',
			'--fbs-launcher-border',
			'--fbs-modal-max-width',
			'--fbs-backdrop-color',
			'--fbs-insight-chip-bg',
			'--fbs-insight-chip-hover',
			'--fbs-panel-bg',
			'--fbs-panel-text',
			'--fbs-panel-text-muted',
			'--fbs-panel-offset-top',
			'--fai-sidebar-width',
			'--fai-sidebar-z-index',
			'--fai-sidebar-bg',
			'--fai-sidebar-text',
			'--fai-sidebar-text-muted',
			'--fai-sidebar-hover',
			'--fai-sidebar-launcher-bg',
			'--fai-sidebar-launcher-text',
		);
	}

	/**
	 * Accept #RRGGBB or rgba(r,g,b,a) with numeric channels only.
	 */
	public static function sanitize_color_value( string $value ): string {
		$value = trim( $value );
		$hex   = sanitize_hex_color( $value );
		if ( $hex ) {
			return $hex;
		}
		if ( strpos( $value, 'rgba(' ) !== 0 && strpos( $value, 'rgb(' ) !== 0 ) {
			return '';
		}
		$inner = substr( $value, strpos( $value, '(' ) + 1 );
		$inner = rtrim( $inner, ')' );
		$parts = array_map( 'trim', explode( ',', $inner ) );
		if ( count( $parts ) < 3 || count( $parts ) > 4 ) {
			return '';
		}
		$r = (int) $parts[0];
		$g = (int) $parts[1];
		$b = (int) $parts[2];
		if ( $r < 0 || $r > 255 || $g < 0 || $g > 255 || $b < 0 || $b > 255 ) {
			return '';
		}
		if ( count( $parts ) === 3 ) {
			return sprintf( 'rgb(%d,%d,%d)', $r, $g, $b );
		}
		$a = (float) $parts[3];
		if ( $a < 0 || $a > 1 ) {
			return '';
		}
		return sprintf( 'rgba(%d,%d,%d,%s)', $r, $g, $b, rtrim( rtrim( number_format( $a, 3, '.', '' ), '0' ), '.' ) );
	}

	/**
	 * Darken a hex color by percent (0-100).
	 */
	public static function darken_hex( string $hex, int $percent ): string {
		$rgb = self::hex_to_rgb( $hex );
		if ( ! $rgb ) {
			return $hex;
		}
		$f = max( 0, min( 100, $percent ) ) / 100;
		return sprintf(
			'#%02x%02x%02x',
			(int) max( 0, $rgb[0] * ( 1 - $f ) ),
			(int) max( 0, $rgb[1] * ( 1 - $f ) ),
			(int) max( 0, $rgb[2] * ( 1 - $f ) )
		);
	}

	/**
	 * Mix hex toward white by percent (0-100 toward white).
	 */
	public static function mix_hex_white( string $hex, int $percent ): string {
		$rgb = self::hex_to_rgb( $hex );
		if ( ! $rgb ) {
			return $hex;
		}
		$f = max( 0, min( 100, $percent ) ) / 100;
		return sprintf(
			'#%02x%02x%02x',
			(int) ( $rgb[0] + ( 255 - $rgb[0] ) * $f ),
			(int) ( $rgb[1] + ( 255 - $rgb[1] ) * $f ),
			(int) ( $rgb[2] + ( 255 - $rgb[2] ) * $f )
		);
	}

	/**
	 * sRGB relative luminance (0 = black, 1 = white).
	 */
	public static function relative_luminance( string $hex ): float {
		$rgb = self::hex_to_rgb( $hex );
		if ( ! $rgb ) {
			return 0.0;
		}
		$channels = array();
		foreach ( $rgb as $value ) {
			$v = $value / 255;
			$channels[] = $v <= 0.03928 ? $v / 12.92 : pow( ( $v + 0.055 ) / 1.055, 2.4 );
		}
		return 0.2126 * $channels[0] + 0.7152 * $channels[1] + 0.0722 * $channels[2];
	}

	/**
	 * @return array{0:int,1:int,2:int}|null
	 */
	private static function hex_to_rgb( string $hex ): ?array {
		$hex = sanitize_hex_color( $hex );
		if ( ! $hex || strlen( $hex ) !== 7 ) {
			return null;
		}
		return array(
			hexdec( substr( $hex, 1, 2 ) ),
			hexdec( substr( $hex, 3, 2 ) ),
			hexdec( substr( $hex, 5, 2 ) ),
		);
	}
}
