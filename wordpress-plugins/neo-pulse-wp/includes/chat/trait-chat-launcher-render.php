<?php
/**
 * Chat launcher rendering and launcher styles.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Trait_Launcher_Render {

	/**
	 * Shortcode: place AI chat on a specific page (floating bubble + sidebar).
	 *
	 * @param array<string,string>|string $atts Shortcode attributes.
	 * @return string
	 */
	public static function render_shortcode( $atts = array() ): string {
		shortcode_atts( array(), is_array( $atts ) ? $atts : array(), self::SHORTCODE_TAG );
		if ( self::is_off_everywhere() || ! self::is_enabled() ) {
			return '';
		}
		if ( ! is_admin() && ! self::should_show_for_visitor() ) {
			return '';
		}
		self::$shortcode_rendered = true;
		if ( ! is_admin() ) {
			self::enqueue_assets();
		}
		return '';
	}

	/**
	 * Launcher part of neo-pulse-chat-modern.css, printed with the bubble so it is styled before the
	 * rest of the chat loads.
	 */
	public static function modern_launcher_css(): string {
		$file = NEO_PULSE_WP_PLUGIN_DIR . 'assets/frontend/neo-pulse-chat-modern.css';
		$css  = is_readable( $file ) ? (string) file_get_contents( $file ) : ''; // phpcs:ignore WordPress.WP.AlternativeFunctions.file_get_contents_file_get_contents
		$from = strpos( $css, '/* launcher:start' );
		$to   = strpos( $css, '/* launcher:end */' );
		if ( $from === false || $to === false || $to <= $from ) {
			return '';
		}
		$css = substr( $css, $from, $to - $from );
		$css = (string) preg_replace( '#/\*.*?\*/#s', '', $css );
		$css = (string) preg_replace( '/\s+/', ' ', $css );
		return trim( str_replace( array( ' {', '{ ', '; ', ' }', ': ' ), array( '{', '{', ';', '}', ':' ), $css ) );
	}

	/**
	 * Hide the launcher until lazy CSS/JS finish so the unstyled edge tab cannot fill the page.
	 */
	public static function pending_launcher_css(): string {
		return '#neo-pulse-chat-mobile-launcher.fcw-launcher--pending,#neo-pulse-chat-mobile-launcher[hidden]{visibility:hidden!important;pointer-events:none!important;width:0!important;height:0!important;max-width:0!important;max-height:0!important;overflow:hidden!important;padding:0!important;border:0!important;clip:rect(0,0,0,0)!important}';
	}

	/**
	 * Mobile CSS: zero-size fixed root, no off-screen panel translate (prevents horizontal scroll/CLS).
	 */
	public static function mobile_launcher_force_css(): string {
		return '@media (max-width:767px){'
			. 'html,body{overflow-x:hidden!important;max-width:100%!important;width:100%!important;position:relative!important}'
			. '#neo-pulse-chat-mobile-launcher[hidden],.fcw-mobile-launcher[hidden],body:has(#neo-pulse-chat-widget-root.fai-sidebar-root--open) #neo-pulse-chat-mobile-launcher{display:none!important;visibility:hidden!important;pointer-events:none!important}'
			. '#neo-pulse-chat-mobile-launcher,.fcw-mobile-launcher,#neo-pulse-chat-mobile-launcher.fcw-launcher--edge-tab,.fcw-mobile-launcher.fcw-launcher--edge-tab{position:fixed!important;bottom:20px!important;right:16px!important;left:auto!important;top:auto!important;width:56px!important;height:56px!important;min-width:56px!important;max-width:56px!important;z-index:999900!important;pointer-events:auto!important;margin:0!important;padding:0!important;border:0!important;border-radius:50%!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;transform:none!important;box-sizing:border-box!important}'
			. '#neo-pulse-chat-mobile-launcher .fcw-launcher__label,.fcw-mobile-launcher .fcw-launcher__label{display:none!important}'
			. '#neo-pulse-chat-widget-root[hidden],#neo-pulse-chat-widget-root.fcw-mobile-root-closed:not(.fai-sidebar-root--open),#neo-pulse-chat-widget-root.fai-sidebar-root--peek:not(.fai-sidebar-root--open),#neo-pulse-chat-widget-root.fai-sidebar-root--peek-track:not(.fai-sidebar-root--open),#neo-pulse-chat-widget-root.fai-sidebar-root--edge-tab:not(.fai-sidebar-root--open){display:none!important;visibility:hidden!important;position:absolute!important;left:-9999px!important;top:auto!important;width:0!important;height:0!important;max-width:0!important;overflow:hidden!important;pointer-events:none!important;margin:0!important;padding:0!important;border:0!important}'
			. '.fai-sidebar-panel[hidden],.fai-sidebar-backdrop[hidden]{display:none!important;visibility:hidden!important;pointer-events:none!important;transform:none!important}'
			. 'html body #neo-pulse-chat-widget-root.neo-pulse-chat-widget:not(.fai-sidebar-root--open){display:none!important;visibility:hidden!important;position:absolute!important;left:-9999px!important;width:0!important;height:0!important;max-width:0!important;overflow:hidden!important;pointer-events:none!important}'
			. 'html body #neo-pulse-chat-widget-root.neo-pulse-chat-widget.fai-sidebar-root--open{position:fixed!important;inset:0!important;width:auto!important;height:auto!important;max-width:none!important;overflow:visible!important;pointer-events:none!important;z-index:999950!important;display:block!important;visibility:visible!important;left:0!important}'
			. 'html body #neo-pulse-chat-widget-root.neo-pulse-chat-widget.fai-sidebar-root--open .fai-sidebar-panel:not([hidden]){display:flex!important;visibility:visible!important;pointer-events:auto!important;z-index:999960!important;position:fixed!important;inset:0!important;left:0!important;right:0!important;top:0!important;bottom:0!important;width:100%!important;max-width:100vw!important;height:100dvh!important;max-height:100dvh!important;transform:none!important;border:none!important;border-radius:0!important;box-shadow:none!important}'
			. 'html body #neo-pulse-chat-widget-root.neo-pulse-chat-widget.fai-sidebar-root--open .fai-sidebar-backdrop:not([hidden]){pointer-events:auto!important;z-index:999955!important}'
			. '.fcw-contact-human__overlay:not([hidden]){z-index:999999!important}'
			. '}';
	}

	/**
	 * Force Chekkit teaser colors over aggressive theme button styles.
	 */
	private static function chekkit_teaser_force_css(): string {
		return 'html body .fcw-chekkit-teaser__card{background:#ffffff!important;color:#111111!important;border:none!important;box-shadow:0 4px 24px rgba(0,0,0,0.14)!important}'
			. 'html body .fcw-chekkit-teaser__card:hover{background:#ffffff!important;color:#111111!important}'
			. 'html body .fcw-chekkit-teaser__line{color:#111111!important}'
			. 'html body button.fcw-chekkit-teaser__dismiss{background:#ffffff!important;color:#666666!important;border:none!important}'
			. 'html body .fcw-launcher--chekkit,html body #neo-pulse-chat-mobile-launcher.fcw-launcher--chekkit{background:#d8005f!important;color:#ffffff!important;border:none!important}';
	}

	/**
	 * Immediate mobile overflow guard (runs before CSS).
	 */
	public static function render_mobile_guard_script(): void {
		if ( is_admin() || ! self::should_show_on_current_screen() ) {
			return;
		}
		echo "<script id=\"neo-pulse-chat-mobile-guard\">!function(){try{if(!window.matchMedia||!window.matchMedia('(max-width:767px)').matches)return;var d=document.documentElement,b=document.body;d.style.overflowX='hidden';d.style.maxWidth='100%';d.style.width='100%';if(b){b.style.overflowX='hidden';b.style.maxWidth='100%';b.style.width='100%';}var w=document.getElementById('neo-pulse-chat-widget-root');if(w){w.style.display='none';w.style.visibility='hidden';w.style.position='absolute';w.style.left='-9999px';w.style.width='0';w.style.height='0';w.style.overflow='hidden';w.classList.add('fcw-mobile-root-closed');w.classList.remove('fai-sidebar-root--peek','fai-sidebar-root--peek-track','fai-sidebar-root--edge-tab');}var l=document.getElementById('neo-pulse-chat-mobile-launcher');if(l){l.classList.remove('fcw-launcher--edge-tab','fcw-launcher--docked');l.style.zIndex='999900';l.style.position='fixed';l.style.right='16px';l.style.left='auto';l.style.top='auto';l.style.bottom='20px';l.style.width='56px';l.style.height='56px';l.style.borderRadius='50%';l.style.padding='0';l.style.transform='none';}}catch(e){}}();</script>\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}

	/**
	 * Critical mobile CSS in head (before stylesheets) so closed panel never widens the page.
	 */
	public static function render_mobile_launcher_critical_css(): void {
		if ( is_admin() || ! self::should_show_on_current_screen() ) {
			return;
		}
		echo '<style id="neo-pulse-chat-mobile-critical">' . self::pending_launcher_css() . self::mobile_launcher_force_css() . '</style>' . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}

	/**
	 * Last-resort mobile launcher CSS in footer (after theme styles).
	 */
	public static function render_mobile_launcher_force_css(): void {
		if ( is_admin() || ! self::should_show_on_current_screen() ) {
			return;
		}
		echo '<style id="neo-pulse-chat-mobile-force">' . self::mobile_launcher_force_css() . '</style>' . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
	}

	/**
	 * Render the widget mount point in the footer.
	 */
	public static function maybe_render_widget(): void {
		if ( is_admin() ) {
			if ( ! self::should_show_on_current_screen() ) {
				return;
			}
		} elseif ( ! self::should_show_on_current_screen() ) {
			return;
		}

		$in_admin         = is_admin();
		$settings         = self::get_settings();
		$side             = ( isset( $settings['sidebar_side'] ) && 'left' === $settings['sidebar_side'] ) ? 'left' : 'right';
		$transition       = isset( $settings['sidebar_transition'] ) ? (string) $settings['sidebar_transition'] : 'slide';
		if ( ! in_array( $transition, array( 'slide', 'fade', 'none' ), true ) ) {
			$transition = 'slide';
		}
		$tokens           = self::design_tokens();
		$css_vars         = Neo_Pulse_Wp_Ai_Widget_Design::build_chat_css_vars( $tokens );
		$css_vars        .= Neo_Pulse_Wp_Ai_Widget_Design::build_sidebar_css_vars( $settings, $tokens );
		$launcher_label   = isset( $settings['launcher_label'] ) ? trim( (string) $settings['launcher_label'] ) : '';
		if ( $launcher_label === '' ) {
			$launcher_label = sprintf(
				/* translators: %s: assistant display name */
				__( 'Open %s', 'neo-pulse-wp' ),
				isset( $settings['assistant_name'] ) ? (string) $settings['assistant_name'] : 'Pulse Assist'
			);
		}
		$launcher_svg   = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
		$launcher_bg    = (string) ( $tokens['launcher_bg'] ?? $tokens['accent'] ?? 'var(--e-global-color-primary, #2563eb)' );
		$launcher_glow  = (string) ( $tokens['launcher_glow'] ?? $launcher_bg );
		$launcher_text  = (string) ( $tokens['launcher_text'] ?? $tokens['accent_text'] ?? '#ffffff' );
		$panel_height   = max( 320, min( 1200, (int) ( $tokens['panel_max_height'] ?? 560 ) ) );
		$sidebar_width  = max( 280, min( 560, (int) ( $settings['sidebar_width'] ?? 400 ) ) );
		$is_edge_tab    = isset( $settings['launcher_style'] ) && $settings['launcher_style'] === 'edge_tab';
		$hide_launcher  = isset( $settings['launcher_style'] ) && $settings['launcher_style'] === 'none';
		$launcher_class = 'fcw-mobile-launcher fai-sidebar-launcher fcw-launcher';
		if ( $is_edge_tab ) {
			$launcher_class .= ' fcw-launcher--edge-tab';
			if ( $side === 'left' ) {
				$launcher_class .= ' fcw-launcher--side-left';
			}
		}
		$lazy_hide = ! $in_admin && self::should_lazy_load_frontend();
		if ( $lazy_hide ) {
			$launcher_class .= ' fcw-launcher--pending';
		}
		if ( ! $in_admin && ! $is_edge_tab ) {
			$launcher_class .= ' fcw-launcher--modern' . ( $side === 'left' ? ' fcw-launcher--at-left' : '' );
		}
		$custom_icon = self::widget_extra( 'launcher_icon_html' );
		if ( $custom_icon !== '' ) {
			$launcher_svg = $custom_icon;
		}
		$launcher_inner = $launcher_svg;
		if ( $is_edge_tab ) {
			$launcher_inner .= '<span class="fcw-launcher__label">' . esc_html( $launcher_label ) . '</span>';
		}
		// Size and position follow the Elementor widget; without one, the long-standing 56px bottom-right bubble.
		$bubble_size   = 56;
		$bubble_bottom = 20;
		$bubble_pos    = 'right:16px;left:auto';
		if ( self::has_widget_design() ) {
			$bubble_size   = max( 40, min( 96, (int) ( $tokens['launcher_size'] ?? 56 ) ) );
			$bubble_bottom = max( 0, min( 200, (int) ( $tokens['offset_y'] ?? 20 ) ) );
			$offset_x      = max( 0, min( 200, (int) ( $tokens['offset_x'] ?? 16 ) ) );
			$bubble_pos    = $side === 'left' ? 'left:' . $offset_x . 'px;right:auto' : 'right:' . $offset_x . 'px;left:auto';
		}
		$launcher_style = $is_edge_tab
			? sprintf(
				'position:fixed;top:max(180px,calc(var(--wp-admin--admin-bar--height,0px) + 20vh));bottom:max(120px,16vh);height:auto;width:44px;min-width:44px;max-width:44px;%s;z-index:999900;pointer-events:auto;margin:0;padding:16px 8px;border:0;background:%s;color:%s;--fcw-launcher-bg:%s;--fcw-launcher-glow:%s;--fcw-launcher-text:%s;--fcw-panel-max-height:%spx;--fai-sidebar-width:%spx;',
				$side === 'left' ? 'left:0;right:auto' : 'right:0;left:auto',
				esc_attr( $launcher_bg ),
				esc_attr( $launcher_text ),
				esc_attr( $launcher_bg ),
				esc_attr( $launcher_glow ),
				esc_attr( $launcher_text ),
				(int) $panel_height,
				(int) $sidebar_width
			)
			: sprintf(
				'position:fixed;bottom:%5$dpx;%4$s;width:%6$dpx;height:%6$dpx;z-index:999900;pointer-events:auto;margin:0;padding:0;border:0;border-radius:50%%;display:inline-flex;align-items:center;justify-content:center;background:%1$s;color:%2$s;--fcw-launcher-text:%3$s;box-shadow:0 4px 24px rgba(0,0,0,0.12);',
				esc_attr( $launcher_bg ),
				esc_attr( $launcher_text ),
				esc_attr( $launcher_text ),
				$bubble_pos,
				$bubble_bottom,
				$bubble_size
			);
		if ( ! $is_edge_tab ) {
			// Values the modern launcher style reads (size, position, colours, shape).
			$launcher_style .= sprintf(
				'--fcw-bubble-size:%dpx;--fcw-offset-y:%dpx;--fcw-offset-x:%dpx;--fcw-launcher-bg:%s;--fcw-launcher-glow:%s;',
				$bubble_size,
				$bubble_bottom,
				self::has_widget_design() ? max( 0, min( 200, (int) ( $tokens['offset_x'] ?? 16 ) ) ) : 16,
				esc_attr( $launcher_bg ),
				esc_attr( $launcher_glow )
			);
			if ( isset( $tokens['launcher_radius'] ) ) {
				$launcher_style .= '--fcw-launcher-radius:' . max( 0, min( 999, (int) $tokens['launcher_radius'] ) ) . 'px;';
			}
			if ( isset( $tokens['launcher_icon'] ) ) {
				$launcher_style .= '--fcw-launcher-icon:' . max( 12, min( 48, (int) $tokens['launcher_icon'] ) ) . 'px;';
			}
		}

		if ( ! $in_admin ) {
			echo '<style id="neo-pulse-chat-mobile-inline">' . self::pending_launcher_css() . self::mobile_launcher_force_css() . self::modern_launcher_css() . '</style>' . "\n"; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		}

		if ( ! $hide_launcher ) {
			printf(
				'<button type="button" id="neo-pulse-chat-mobile-launcher" class="%1$s" data-fcw-chat-launcher="1" aria-label="%2$s" aria-expanded="false" aria-controls="neo-pulse-chat-widget-root" style="%3$s"%5$s>%4$s</button>' . "\n",
				esc_attr( $launcher_class ),
				esc_attr( $launcher_label ),
				esc_attr( $launcher_style ),
				$launcher_inner, // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
				$lazy_hide ? ' hidden' : ''
			);
		}
		printf(
			'<div id="neo-pulse-chat-widget-root" class="neo-pulse-chat-widget neo-pulse-chat--sidebar neo-pulse-chat--standalone-launcher fcw-mobile-root-closed fai-sidebar-root fai-sidebar-root--%1$s fai-sidebar-root--transition-%2$s%4$s" data-fcw-chat-root="1" aria-hidden="true" hidden style="display:none!important;%3$s"></div>' . "\n",
			esc_attr( $side ),
			esc_attr( $transition ),
			esc_attr( $css_vars ),
			$is_edge_tab ? ' fai-sidebar-root--edge-tab' : ''
		);
	}
}
