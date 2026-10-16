<?php
/**
 * Shared Chat + Search widget design: Site Branding, tokens, CSS vars.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

require_once __DIR__ . '/class-neo-pulse-wp-ai-widget-design-css.php';

class Neo_Pulse_Wp_Ai_Widget_Design {

	use Neo_Pulse_Wp_Ai_Widget_Design_Css;

	const OPTION_KEY       = 'neo_pulse_wp_ai_widgets_design';
	const MIGRATION_KEY    = 'neo_pulse_wp_ai_widgets_design_migrated_v1';
	const MIGRATION_V2_KEY = 'neo_pulse_wp_ai_widgets_design_migrated_v2';
	const MIGRATION_V3_KEY = 'neo_pulse_wp_ai_widgets_design_migrated_v3';

	/** @var array<string,mixed>|null */
	private static $settings_cache = null;

	/** @var array<string,array<string,mixed>> */
	private static $resolved_cache = array();

	/**
	 * Bootstrap: migrate once, invalidate on Elementor kit changes.
	 */
	public static function init(): void {
		self::maybe_migrate();
		self::maybe_migrate_chat_card_simplify();
		self::maybe_migrate_chat_type_badge_off();
		add_action( 'updated_post_meta', array( __CLASS__, 'on_post_meta_updated' ), 10, 4 );
		add_action( 'added_post_meta', array( __CLASS__, 'on_post_meta_updated' ), 10, 4 );
		add_action( 'elementor/core/files/clear_cache', array( __CLASS__, 'clear_resolve_cache' ) );
	}

	/**
	 * @param int    $meta_id
	 * @param int    $post_id
	 * @param string $meta_key
	 * @param mixed  $meta_value
	 */
	public static function on_post_meta_updated( $meta_id, $post_id, $meta_key, $meta_value ): void {
		unset( $meta_id, $meta_value );
		if ( (string) $meta_key !== '_elementor_page_settings' ) {
			return;
		}
		$kit_id = (int) get_option( 'elementor_active_kit', 0 );
		if ( $kit_id > 0 && (int) $post_id === $kit_id ) {
			self::clear_resolve_cache();
			if ( class_exists( 'Neo_Pulse_Wp_Search' ) ) {
				Neo_Pulse_Wp_Search::purge_public_caches();
			}
		}
	}

	public static function clear_resolve_cache(): void {
		self::$resolved_cache = array();
		self::$settings_cache = null;
	}

	/**
	 * @return array<string,mixed>
	 */
	public static function get_settings(): array {
		if ( self::$settings_cache !== null ) {
			return self::$settings_cache;
		}
		self::maybe_migrate();
		$defaults = self::defaults();
		$stored   = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		$merged = wp_parse_args( $stored, $defaults );
		$merged['style_scope']  = ( $merged['style_scope'] === 'individual' ) ? 'individual' : 'both';
		$merged['color_source'] = ( $merged['color_source'] === 'custom' ) ? 'custom' : 'site_branding';
		foreach ( array( 'shared', 'chat', 'search' ) as $bag ) {
			$merged[ $bag ] = self::sanitize_token_bag(
				isset( $merged[ $bag ] ) && is_array( $merged[ $bag ] ) ? $merged[ $bag ] : array(),
				$defaults['shared']
			);
		}
		$merged['chat_ui']   = self::sanitize_visibility_map(
			isset( $merged['chat_ui'] ) && is_array( $merged['chat_ui'] ) ? $merged['chat_ui'] : array(),
			self::default_chat_visibility()
		);
		$merged['search_ui'] = self::sanitize_visibility_map(
			isset( $merged['search_ui'] ) && is_array( $merged['search_ui'] ) ? $merged['search_ui'] : array(),
			self::default_search_visibility()
		);
		$merged['search_sidebar'] = self::sanitize_sidebar_config(
			isset( $merged['search_sidebar'] ) && is_array( $merged['search_sidebar'] ) ? $merged['search_sidebar'] : array(),
			'search'
		);
		$merged['chat_sidebar'] = self::sanitize_sidebar_config(
			isset( $merged['chat_sidebar'] ) && is_array( $merged['chat_sidebar'] ) ? $merged['chat_sidebar'] : array(),
			'chat'
		);
		$merged['search_insights'] = self::sanitize_search_insights_config(
			isset( $merged['search_insights'] ) && is_array( $merged['search_insights'] ) ? $merged['search_insights'] : array()
		);
		self::$settings_cache = $merged;
		return $merged;
	}

	/**
	 * @param array<string,mixed> $data
	 */
	public static function save( array $data ): void {
		$current = self::get_settings();
		$out     = $current;

		if ( isset( $data['style_scope'] ) ) {
			$out['style_scope'] = ( $data['style_scope'] === 'individual' ) ? 'individual' : 'both';
		}
		if ( isset( $data['color_source'] ) ) {
			$out['color_source'] = ( $data['color_source'] === 'custom' ) ? 'custom' : 'site_branding';
		}

		foreach ( array( 'shared', 'chat', 'search' ) as $bag ) {
			if ( isset( $data[ $bag ] ) && is_array( $data[ $bag ] ) ) {
				$out[ $bag ] = self::sanitize_token_bag( $data[ $bag ], $current[ $bag ] );
			}
		}
		if ( isset( $data['chat_ui'] ) && is_array( $data['chat_ui'] ) ) {
			$out['chat_ui'] = self::sanitize_visibility_map( $data['chat_ui'], self::default_chat_visibility() );
		}
		if ( isset( $data['search_ui'] ) && is_array( $data['search_ui'] ) ) {
			$out['search_ui'] = self::sanitize_visibility_map( $data['search_ui'], self::default_search_visibility() );
		}
		if ( isset( $data['search_sidebar'] ) && is_array( $data['search_sidebar'] ) ) {
			$out['search_sidebar'] = self::sanitize_sidebar_config( $data['search_sidebar'], 'search' );
		}
		if ( isset( $data['chat_sidebar'] ) && is_array( $data['chat_sidebar'] ) ) {
			$out['chat_sidebar'] = self::sanitize_sidebar_config( $data['chat_sidebar'], 'chat' );
		}
		if ( isset( $data['search_insights'] ) && is_array( $data['search_insights'] ) ) {
			$out['search_insights'] = self::sanitize_search_insights_config( $data['search_insights'] );
		}

		// When styling both, keep bags in sync from shared.
		if ( $out['style_scope'] === 'both' && isset( $data['shared'] ) && is_array( $data['shared'] ) ) {
			$out['chat']   = $out['shared'];
			$out['search'] = $out['shared'];
		}

		update_option( self::OPTION_KEY, $out, false );
		self::clear_resolve_cache();
		self::$settings_cache = $out;

		if ( class_exists( 'Neo_Pulse_Wp_Search' ) ) {
			Neo_Pulse_Wp_Search::purge_public_caches();
		}
	}

	/**
	 * Resolve sidebar config for a widget (global defaults).
	 *
	 * @param string              $widget 'search' | 'chat'
	 * @param array<string,mixed> $instance Per-instance overrides.
	 * @return array<string,mixed>
	 */
	public static function resolve_sidebar_config( string $widget, array $instance = array() ): array {
		$widget   = ( $widget === 'search' ) ? 'search' : 'chat';
		$key      = $widget . '_sidebar';
		$settings = self::get_settings();
		$global   = isset( $settings[ $key ] ) && is_array( $settings[ $key ] )
			? $settings[ $key ]
			: ( $widget === 'search' ? self::default_search_sidebar_config() : self::default_chat_sidebar_config() );

		$merged = $global;
		$keys   = array(
			'display_mode',
			'sidebar_side',
			'sidebar_transition',
			'sidebar_width',
			'sidebar_heading',
			'sidebar_subtitle',
			'sidebar_layout',
			'launcher_icon',
			'icon_open_as',
			'modal_max_width',
			'launcher_label',
			'launcher_style',
			'panel_layout',
			'panel_offset_top',
			'panel_offset_top_unit',
			'panel_content_align',
			'backdrop_opacity',
			'header_search_opens_sidebar',
		);
		foreach ( $keys as $field ) {
			if ( array_key_exists( $field, $instance ) && $instance[ $field ] !== '' ) {
				$merged[ $field ] = $instance[ $field ];
			}
		}

		return self::sanitize_sidebar_config( $merged, $widget );
	}

	/**
	 * Resolve search insights toggles (global + per-instance Elementor overrides).
	 *
	 * @param array<string,mixed> $instance
	 * @return array<string,mixed>
	 */
	public static function resolve_search_insights( array $instance = array() ): array {
		$settings = self::get_settings();
		$global   = isset( $settings['search_insights'] ) && is_array( $settings['search_insights'] )
			? $settings['search_insights']
			: self::default_search_insights_config();

		$merged = $global;
		$keys   = array(
			'logging_enabled',
			'show_popular_terms',
			'show_popular_pages_overseer',
			'show_popular_pages_search',
			'insights_days',
			'popular_terms_limit',
		);
		foreach ( $keys as $field ) {
			if ( ! array_key_exists( $field, $instance ) ) {
				continue;
			}
			$value = $instance[ $field ];
			if ( in_array( $field, array( 'insights_days', 'popular_terms_limit' ), true ) ) {
				$merged[ $field ] = (int) $value;
			} elseif ( $value === 'yes' || $value === true || $value === 1 || $value === '1' ) {
				$merged[ $field ] = true;
			} elseif ( $value === 'no' || $value === false || $value === 0 || $value === '0' || $value === '' ) {
				$merged[ $field ] = false;
			}
		}

		if ( ! Neo_Pulse_Wp_Search_Logs::is_logging_active() ) {
			$merged['logging_enabled'] = false;
		}

		return self::sanitize_search_insights_config( $merged );
	}

	/**
	 * Resolve tokens for a widget.
	 *
	 * @param string $widget 'chat' | 'search'.
	 * @return array<string,mixed>
	 */
	public static function resolve( string $widget = 'shared' ): array {
		$widget = in_array( $widget, array( 'chat', 'search', 'shared' ), true ) ? $widget : 'shared';
		if ( isset( self::$resolved_cache[ $widget ] ) ) {
			return self::$resolved_cache[ $widget ];
		}

		$settings = self::get_settings();
		$bag_key  = 'shared';
		if ( $settings['style_scope'] === 'individual' && ( $widget === 'chat' || $widget === 'search' ) ) {
			$bag_key = $widget;
		}

		$base = isset( $settings[ $bag_key ] ) && is_array( $settings[ $bag_key ] )
			? $settings[ $bag_key ]
			: self::fallback_palette();

		self::$resolved_cache[ $widget ] = $base;
		return $base;
	}

	/**
	 * Map Elementor kit system colors into design tokens.
	 *
	 * @return array<string,string>
	 */
	public static function palette_from_elementor_kit(): array {
		if ( ! class_exists( 'Neo_Pulse_Wp_Migrate_Elementor_Global_Css' ) ) {
			$file = NEO_PULSE_WP_PLUGIN_DIR . 'includes/super-migrate/class-neo-pulse-wp-migrate-elementor-global-css.php';
			if ( is_readable( $file ) ) {
				require_once $file;
			}
		}
		if ( ! class_exists( 'Neo_Pulse_Wp_Migrate_Elementor_Global_Css' ) ) {
			return array();
		}

		$kit = Neo_Pulse_Wp_Migrate_Elementor_Global_Css::read_kit_settings();
		if ( empty( $kit ) ) {
			return array();
		}

		$mapped = Neo_Pulse_Wp_Migrate_Elementor_Global_Css::map_colors( $kit );
		$primary   = (string) ( $mapped['gc_color_primary'] ?? '' );
		$secondary = (string) ( $mapped['gc_color_secondary'] ?? '' );
		$accent    = (string) ( $mapped['gc_color_accent'] ?? '' );
		$text      = (string) ( $mapped['gc_color_text'] ?? '' );

		$out = array();
		if ( $primary !== '' ) {
			$out['accent']       = $primary;
			$out['button_bg']    = $primary;
			$out['send_bg']      = $primary;
			$out['mic_idle']     = $primary;
			$out['focus_ring']   = $primary;
			$out['link']         = $primary;
			$out['user_bubble_bg'] = $primary;
			$out['button_hover'] = self::darken_hex( $primary, 12 );
		}
		if ( $secondary !== '' ) {
			$out['bg_elevated']         = $secondary;
			$out['header_bg']           = $secondary;
			$out['assistant_bubble_bg'] = $secondary;
			$out['result_hover']        = $secondary;
		}
		if ( $accent !== '' ) {
			$out['highlight']       = $accent;
			$out['thinking_border'] = $accent;
			$out['banner_bg']       = self::mix_hex_white( $accent, 88 );
			$out['banner_text']     = self::darken_hex( $accent, 35 );
		}
		if ( $text !== '' ) {
			$out['text']                  = $text;
			$out['assistant_bubble_text'] = $text;
			$out['input_text']            = $text;
			$out['text_secondary']        = self::mix_hex_white( $text, 35 );
			$out['text_muted']            = self::mix_hex_white( $text, 55 );
			$out['placeholder']           = self::mix_hex_white( $text, 65 );
			$out['border']                = self::mix_hex_white( $text, 75 );
			$out['border_hover']          = self::mix_hex_white( $text, 55 );
			$out['score_color']           = self::mix_hex_white( $text, 45 );

			if ( self::relative_luminance( $text ) > 0.55 ) {
				$surface  = ( $secondary !== '' && self::relative_luminance( $secondary ) < 0.35 )
					? $secondary
					: '#121212';
				$elevated = ( $secondary !== '' && self::relative_luminance( $secondary ) < 0.45 )
					? self::mix_hex_white( $secondary, 8 )
					: '#1a1a1a';
				$out['bg']          = $surface;
				$out['card_bg']     = $surface;
				$out['dropdown_bg'] = $elevated;
				$out['input_bg']    = $elevated;
				if ( $secondary === '' ) {
					$out['bg_elevated']  = $elevated;
					$out['header_bg']    = $elevated;
					$out['result_hover'] = '#222222';
				}
			}
		}

		return $out;
	}

	/**
	 * Elementor kit colors for admin swatches.
	 *
	 * @return array<int,array{id:string,title:string,color:string}>
	 */
	public static function elementor_color_swatches(): array {
		if ( ! class_exists( 'Neo_Pulse_Wp_Migrate_Elementor_Global_Css' ) ) {
			$file = NEO_PULSE_WP_PLUGIN_DIR . 'includes/super-migrate/class-neo-pulse-wp-migrate-elementor-global-css.php';
			if ( is_readable( $file ) ) {
				require_once $file;
			}
		}
		if ( ! class_exists( 'Neo_Pulse_Wp_Migrate_Elementor_Global_Css' ) ) {
			return array();
		}

		$kit = Neo_Pulse_Wp_Migrate_Elementor_Global_Css::read_kit_settings();
		$out = array();
		$system = isset( $kit['system_colors'] ) && is_array( $kit['system_colors'] ) ? $kit['system_colors'] : array();
		foreach ( $system as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$color = sanitize_hex_color( (string) ( $row['color'] ?? '' ) );
			if ( ! $color ) {
				continue;
			}
			$out[] = array(
				'id'    => sanitize_key( (string) ( $row['_id'] ?? '' ) ),
				'title' => sanitize_text_field( (string) ( $row['title'] ?? $row['_id'] ?? 'Color' ) ),
				'color' => $color,
			);
		}
		$custom = isset( $kit['custom_colors'] ) && is_array( $kit['custom_colors'] ) ? $kit['custom_colors'] : array();
		foreach ( $custom as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$color = sanitize_hex_color( (string) ( $row['color'] ?? '' ) );
			if ( ! $color ) {
				continue;
			}
			$out[] = array(
				'id'    => sanitize_key( (string) ( $row['_id'] ?? '' ) ),
				'title' => sanitize_text_field( (string) ( $row['title'] ?? $row['_id'] ?? 'Custom' ) ),
				'color' => $color,
			);
		}
		return $out;
	}

	/**
	 * One-time migration from legacy chat/search color fields.
	 */
	public static function maybe_migrate(): void {
		if ( get_option( self::MIGRATION_KEY, '' ) === '1' ) {
			return;
		}

		$defaults = self::defaults();
		$shared   = $defaults['shared'];

		$chat = get_option( 'neo_pulse_wp_chat_settings', array() );
		if ( is_array( $chat ) && ! empty( $chat['color'] ) ) {
			$c = sanitize_hex_color( (string) $chat['color'] );
			if ( $c ) {
				$shared['accent']      = $c;
				$shared['button_bg']   = $c;
				$shared['launcher_bg'] = $c;
				$shared['send_bg']     = $c;
				$shared['mic_idle']    = $c;
				$shared['user_bubble_bg'] = $c;
				$shared['focus_ring']  = $c;
				$shared['link']        = $c;
			}
		}

		$search = get_option( 'neo_pulse_wp_search_settings', array() );
		if ( is_array( $search ) ) {
			if ( ! empty( $search['primary_color'] ) ) {
				$c = sanitize_hex_color( (string) $search['primary_color'] );
				if ( $c ) {
					$shared['accent']    = $c;
					$shared['button_bg'] = $c;
					$shared['focus_ring'] = $c;
				}
			}
			if ( ! empty( $search['bg_color'] ) ) {
				$c = sanitize_hex_color( (string) $search['bg_color'] );
				if ( $c ) {
					$shared['bg'] = $c;
					$shared['input_bg'] = $c;
					$shared['dropdown_bg'] = $c;
					$shared['card_bg'] = $c;
				}
			}
			if ( isset( $search['border_radius'] ) ) {
				$shared['radius'] = max( 0, min( 50, (int) $search['border_radius'] ) );
			}
			if ( isset( $search['font_size'] ) ) {
				$shared['font_size'] = max( 16, min( 24, (int) $search['font_size'] ) );
			}
		}

		$existing = get_option( self::OPTION_KEY, null );
		if ( ! is_array( $existing ) ) {
			$payload = $defaults;
			$payload['shared'] = $shared;
			$payload['chat']   = $shared;
			$payload['search'] = $shared;
			// Keep Site Branding as default source; migrated hex sits under custom bags for when switched.
			update_option( self::OPTION_KEY, $payload, false );
		}

		update_option( self::MIGRATION_KEY, '1', false );
	}

	/**
	 * Hide source pills + confidence on answer cards (CTA + suggestion chips only).
	 */
	public static function maybe_migrate_chat_card_simplify(): void {
		if ( get_option( self::MIGRATION_V2_KEY, '' ) === '1' ) {
			return;
		}

		$stored = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		if ( ! isset( $stored['chat_ui'] ) || ! is_array( $stored['chat_ui'] ) ) {
			$stored['chat_ui'] = array();
		}
		$stored['chat_ui']['source_pills'] = false;
		$stored['chat_ui']['confidence']   = false;
		update_option( self::OPTION_KEY, $stored, false );
		update_option( self::MIGRATION_V2_KEY, '1', false );
		self::clear_resolve_cache();
	}

	/**
	 * Hide internal type badge (NAVIGATION, answer, etc.) on customer answer cards.
	 */
	public static function maybe_migrate_chat_type_badge_off(): void {
		if ( get_option( self::MIGRATION_V3_KEY, '' ) === '1' ) {
			return;
		}

		$stored = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		if ( ! isset( $stored['chat_ui'] ) || ! is_array( $stored['chat_ui'] ) ) {
			$stored['chat_ui'] = array();
		}
		$stored['chat_ui']['type_badge'] = false;
		update_option( self::OPTION_KEY, $stored, false );
		update_option( self::MIGRATION_V3_KEY, '1', false );
		self::clear_resolve_cache();
	}

	/**
	 * @param array<string,mixed> $bag
	 * @param array<string,mixed> $defaults
	 * @return array<string,mixed>
	 */
	public static function sanitize_token_bag( array $bag, array $defaults ): array {
		$out = $defaults;
		foreach ( self::color_token_keys() as $key ) {
			if ( ! isset( $bag[ $key ] ) ) {
				continue;
			}
			$san = self::sanitize_color_value( (string) $bag[ $key ] );
			if ( $san !== '' ) {
				$out[ $key ] = $san;
			}
		}
		if ( isset( $bag['radius'] ) ) {
			$out['radius'] = max( 0, min( 50, (int) $bag['radius'] ) );
		}
		if ( isset( $bag['radius_sm'] ) ) {
			$out['radius_sm'] = max( 0, min( 50, (int) $bag['radius_sm'] ) );
		}
		if ( isset( $bag['font_size'] ) ) {
			$out['font_size'] = max( 16, min( 24, (int) $bag['font_size'] ) );
		}
		if ( isset( $bag['font_family'] ) ) {
			$out['font_family'] = sanitize_text_field( (string) $bag['font_family'] );
		}
		if ( isset( $bag['shadow'] ) ) {
			$out['shadow'] = sanitize_text_field( (string) $bag['shadow'] );
		}
		if ( isset( $bag['launcher_size'] ) ) {
			$out['launcher_size'] = max( 40, min( 80, (int) $bag['launcher_size'] ) );
		}
		if ( isset( $bag['panel_width'] ) ) {
			$out['panel_width'] = max( 280, min( 560, (int) $bag['panel_width'] ) );
		}
		if ( isset( $bag['panel_max_height'] ) ) {
			$out['panel_max_height'] = max( 320, min( 1200, (int) $bag['panel_max_height'] ) );
		}
		if ( isset( $bag['offset_x'] ) ) {
			$out['offset_x'] = max( 0, min( 120, (int) $bag['offset_x'] ) );
		}
		if ( isset( $bag['offset_y'] ) ) {
			$out['offset_y'] = max( 0, min( 120, (int) $bag['offset_y'] ) );
		}
		if ( isset( $bag['z_index'] ) ) {
			$out['z_index'] = max( 1, min( 2147483647, (int) $bag['z_index'] ) );
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $map
	 * @param array<string,bool>  $defaults
	 * @return array<string,bool>
	 */
	public static function sanitize_visibility_map( array $map, array $defaults ): array {
		$out = $defaults;
		foreach ( array_keys( $defaults ) as $key ) {
			if ( array_key_exists( $key, $map ) ) {
				$out[ $key ] = ! empty( $map[ $key ] );
			}
		}
		return $out;
	}

}
