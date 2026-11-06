<?php
/**
 * Chat frontend asset loading.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Trait_Assets {

	/**
	 * Enqueue chat widget assets on the frontend when enabled.
	 */
	public static function maybe_enqueue_assets(): void {
		if ( ! self::should_show_on_current_screen() ) {
			return;
		}

		if ( self::should_lazy_load_frontend() ) {
			self::enqueue_lazy_frontend();
			return;
		}

		self::enqueue_assets();
	}

	/**
	 * Public visitors get the launcher HTML plus a tiny loader. Full widget JS waits for tap or idle.
	 */
	public static function should_lazy_load_frontend(): bool {
		return ! is_admin();
	}

	/**
	 * Enqueue chat widget scripts and styles.
	 */
	public static function enqueue_assets(): void {
		$base = plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . 'assets/frontend/';
		$ver  = NEO_PULSE_WP_VERSION;
		$widget_css = NEO_PULSE_WP_PLUGIN_DIR . 'assets/frontend/neo-pulse-chat-widget.css';
		$widget_js  = NEO_PULSE_WP_PLUGIN_DIR . 'assets/frontend/neo-pulse-chat-widget.js';
		if ( is_readable( $widget_css ) ) {
			$ver .= '.' . (string) filemtime( $widget_css );
		}
		$widget_js_ver = NEO_PULSE_WP_VERSION;
		if ( is_readable( $widget_js ) ) {
			$widget_js_ver .= '.' . (string) filemtime( $widget_js );
		}
		$in_admin = is_admin();

		wp_enqueue_style(
			'neo-pulse-chat-widget',
			$base . 'neo-pulse-chat-widget.css',
			array(),
			$ver
		);

		Neo_Pulse_Wp_Voice::enqueue_thinking_card_assets();

		$shared_base   = plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . 'assets/shared/';
		$build_js_path = NEO_PULSE_WP_PLUGIN_DIR . 'assets/shared/neo-pulse-build-harness.js';
		$build_css_path = NEO_PULSE_WP_PLUGIN_DIR . 'assets/shared/neo-pulse-build-harness.css';
		$build_ver     = NEO_PULSE_WP_VERSION;
		if ( is_readable( $build_js_path ) ) {
			$build_ver .= '.' . (string) filemtime( $build_js_path );
		}
		if ( ! wp_style_is( 'neo-pulse-build-harness', 'registered' ) ) {
			wp_register_style(
				'neo-pulse-build-harness',
				$shared_base . 'neo-pulse-build-harness.css',
				array( 'neo-pulse-chat-widget' ),
				is_readable( $build_css_path ) ? $build_ver : NEO_PULSE_WP_VERSION
			);
		}
		wp_enqueue_style( 'neo-pulse-build-harness' );
		if ( ! wp_script_is( 'neo-pulse-build-harness', 'registered' ) ) {
			wp_register_script(
				'neo-pulse-build-harness',
				$shared_base . 'neo-pulse-build-harness.js',
				array( 'neo-pulse-thinking-card' ),
				$build_ver,
				true
			);
		}
		wp_enqueue_script( 'neo-pulse-build-harness' );

		Neo_Pulse_Wp_Search::register_sidebar_assets();

		$mobile = ! $in_admin && wp_is_mobile();
		wp_enqueue_style( 'neo-pulse-ai-sidebar-shell' );
		if ( ! $mobile ) {
			wp_enqueue_style( 'neo-pulse-ai-sidebar-unify' );
		}

		wp_enqueue_style(
			'neo-pulse-chat-chrome',
			$base . 'neo-pulse-chat-chrome.css',
			$mobile ? array( 'neo-pulse-chat-widget' ) : array( 'neo-pulse-chat-widget', 'neo-pulse-ai-sidebar-unify' ),
			$ver
		);

		wp_enqueue_style(
			'neo-pulse-chat-mobile',
			$base . 'neo-pulse-chat-mobile.css',
			array( 'neo-pulse-chat-chrome' ),
			$ver
		);

		wp_add_inline_style( 'neo-pulse-chat-mobile', self::mobile_launcher_force_css() );

		if ( ! $in_admin ) {
			$modern_css = NEO_PULSE_WP_PLUGIN_DIR . 'assets/frontend/neo-pulse-chat-modern.css';
			wp_enqueue_style(
				'neo-pulse-chat-modern',
				$base . 'neo-pulse-chat-modern.css',
				array( 'neo-pulse-chat-mobile' ),
				$ver . ( is_readable( $modern_css ) ? '.' . (string) filemtime( $modern_css ) : '' )
			);
		}

		if ( $in_admin ) {
			wp_add_inline_style(
				'neo-pulse-chat-widget',
				'body.wp-admin .neo-pulse-chat-widget{z-index:100000!important}'
				. 'body.wp-admin .fcw-mobile-launcher{z-index:100000!important}'
				// wp-admin only: the launcher uses the Neo Digital admin palette (lime on ink), whatever the
				// visitor-facing widget design is. Same element, same behaviour; colours only.
				. 'html body.wp-admin #neo-pulse-chat-mobile-launcher,html body.wp-admin #neo-pulse-chat-mobile-launcher.fcw-launcher--chekkit{background:#84bd00!important;color:#02050a!important;border:none!important;box-shadow:0 8px 24px rgba(2,5,10,.35)!important;--fcw-launcher-bg:#84bd00;--fcw-launcher-glow:#97d400;--fcw-launcher-text:#02050a}'
				. 'html body.wp-admin #neo-pulse-chat-mobile-launcher:hover{background:#97d400!important}'
				. 'html body.wp-admin #neo-pulse-chat-mobile-launcher:focus-visible{outline:2px solid #02050a!important;outline-offset:2px!important;box-shadow:0 0 0 4px #84bd00!important}'
			);
		}

		$settings       = self::get_settings();
		$chekkit_enabled = ! isset( $settings['chekkit_enabled'] ) || ! empty( $settings['chekkit_enabled'] );
		$chekkit_teaser  = $chekkit_enabled && ( ! isset( $settings['chekkit_teaser_enabled'] ) || ! empty( $settings['chekkit_teaser_enabled'] ) );
		if ( $chekkit_teaser ) {
			wp_add_inline_style( 'neo-pulse-chat-widget', self::chekkit_teaser_force_css() );
		}

		$voice_enabled  = ! empty( $settings['voice_enabled'] ) && Neo_Pulse_Wp_OpenRouter::get_api_key() !== '';
		$widget_deps    = array( 'neo-pulse-thinking-card', 'neo-pulse-chat-stream', 'neo-pulse-chat-prefetch', 'neo-pulse-chat-debug-log', 'neo-pulse-display-text', 'neo-pulse-markdown', 'neo-pulse-build-harness' );
		if ( $voice_enabled ) {
			Neo_Pulse_Wp_Voice::enqueue_assets();
			$widget_deps[] = 'neo-pulse-voice';
		}
		wp_enqueue_script( 'neo-pulse-ai-sidebar-shell' );
		wp_enqueue_script( 'neo-pulse-ai-sidebar-unify' );
		$widget_deps[] = 'neo-pulse-ai-sidebar-shell';
		$widget_deps[] = 'neo-pulse-ai-sidebar-unify';

		wp_enqueue_script(
			'neo-pulse-chat-widget',
			$base . 'neo-pulse-chat-widget.js',
			$widget_deps,
			$widget_js_ver,
			true
		);

		if ( ! empty( $settings['header_search_opens_sidebar'] ) ) {
			$header_js = NEO_PULSE_WP_PLUGIN_DIR . 'assets/frontend/neo-pulse-chat-header-search.js';
			wp_enqueue_script(
				'neo-pulse-chat-header-search',
				$base . 'neo-pulse-chat-header-search.js',
				array( 'neo-pulse-chat-widget' ),
				is_readable( $header_js ) ? (string) filemtime( $header_js ) : $widget_js_ver,
				true
			);
		}

		if ( is_user_logged_in() ) {
			$can_backend      = self::current_user_can_backend_mode();
			$backend_starters = $can_backend
				? wp_json_encode( Neo_Pulse_Wp_Chat_Super_Admin::get_backend_starters() )
				: '[]';
			wp_add_inline_script(
				'neo-pulse-chat-widget',
				'window.neoPulseChatConfig=window.neoPulseChatConfig||{};'
				. 'window.neoPulseChatConfig.canCopyLog=true;'
				. 'window.neoPulseChatConfig.canBackendMode=' . ( $can_backend ? 'true' : 'false' ) . ';'
				. 'window.neoPulseChatConfig.isLoggedIn=true;'
				. 'window.neoPulseChatConfig.backendStarters=' . $backend_starters . ';',
				'before'
			);
		}

		wp_localize_script(
			'neo-pulse-chat-widget',
			'neoPulseChatConfig',
			self::widget_localize_config( $in_admin, $settings, $voice_enabled, $chekkit_enabled, $chekkit_teaser )
		);
	}

	/**
	 * Frontend: launcher HTML + one small loader. Full widget CSS/JS load on tap or idle.
	 */
	public static function enqueue_lazy_frontend(): void {
		$settings        = self::get_settings();
		$chekkit_enabled = ! isset( $settings['chekkit_enabled'] ) || ! empty( $settings['chekkit_enabled'] );
		$chekkit_teaser  = $chekkit_enabled && ( ! isset( $settings['chekkit_teaser_enabled'] ) || ! empty( $settings['chekkit_teaser_enabled'] ) );
		$voice_enabled   = ! empty( $settings['voice_enabled'] ) && Neo_Pulse_Wp_OpenRouter::get_api_key() !== '';
		$config          = self::widget_localize_config( false, $settings, $voice_enabled, $chekkit_enabled, $chekkit_teaser );
		$assets          = self::frontend_lazy_assets( $config, $settings );

		$lazy_js = NEO_PULSE_WP_PLUGIN_DIR . 'assets/frontend/neo-pulse-chat-lazy.js';
		$ver     = NEO_PULSE_WP_VERSION;
		if ( is_readable( $lazy_js ) ) {
			$ver .= '.' . (string) filemtime( $lazy_js );
		}

		wp_enqueue_script(
			'neo-pulse-chat-lazy',
			plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . 'assets/frontend/neo-pulse-chat-lazy.js',
			array(),
			$ver,
			true
		);

		$lazy = array(
			'config'  => $config,
			'styles'  => $assets['styles'],
			'scripts' => $assets['scripts'],
		);
		if ( ! empty( $config['voiceEnabled'] ) ) {
			$lazy['voiceConfig'] = array(
				'transcribeUrl' => $config['transcribeUrl'],
				'nonce'         => $config['nonce'],
				'voiceNonce'    => $config['streamNonce'],
			);
		}

		wp_localize_script( 'neo-pulse-chat-lazy', 'neoPulseChatLazy', $lazy );
	}

	/**
	 * CSS/JS the lazy loader injects after first tap or idle.
	 *
	 * @param array<string, mixed> $config   Localized widget config.
	 * @param array<string, mixed> $settings Chat settings.
	 * @return array{styles: array<int, string>, scripts: array<int, string>}
	 */
	public static function frontend_lazy_assets( array $config, array $settings ): array {
		// Build harness (God Mode builds) and the copy-log helper are staff tools: keep them out of
		// the public bundle.
		$can_backend = self::current_user_can_backend_mode();
		$logged_in   = is_user_logged_in();

		$styles = array(
			self::versioned_plugin_url( 'assets/frontend/neo-pulse-chat-widget.css' ),
			self::versioned_plugin_url( 'assets/shared/neo-pulse-thinking-card.css' ),
		);
		if ( $can_backend ) {
			$styles[] = self::versioned_plugin_url( 'assets/shared/neo-pulse-build-harness.css' );
		}
		array_push(
			$styles,
			self::versioned_plugin_url( 'assets/shared/neo-pulse-ai-sidebar-shell.css' ),
			self::versioned_plugin_url( 'assets/shared/neo-pulse-ai-sidebar-unify.css' ),
			self::versioned_plugin_url( 'assets/frontend/neo-pulse-chat-chrome.css' ),
			self::versioned_plugin_url( 'assets/frontend/neo-pulse-chat-mobile.css' ),
			self::versioned_plugin_url( 'assets/frontend/neo-pulse-chat-modern.css' )
		);
		$scripts = array(
			self::versioned_plugin_url( 'assets/shared/neo-pulse-thinking-card.js' ),
			self::versioned_plugin_url( 'assets/shared/neo-pulse-chat-stream.js' ),
			self::versioned_plugin_url( 'assets/shared/neo-pulse-chat-prefetch.js' ),
		);
		if ( $logged_in ) {
			$scripts[] = self::versioned_plugin_url( 'assets/shared/neo-pulse-chat-debug-log.js' );
		}
		$scripts[] = self::versioned_plugin_url( 'assets/shared/neo-pulse-display-text.js' );
		$scripts[] = self::versioned_plugin_url( 'assets/shared/neo-pulse-markdown.js' );
		if ( $can_backend ) {
			$scripts[] = self::versioned_plugin_url( 'assets/shared/neo-pulse-build-harness.js' );
		}
		$scripts[] = self::versioned_plugin_url( 'assets/shared/neo-pulse-ai-sidebar-shell.js' );
		$scripts[] = self::versioned_plugin_url( 'assets/shared/neo-pulse-ai-sidebar-unify.js' );
		if ( ! empty( $config['voiceEnabled'] ) ) {
			$styles[]  = self::versioned_plugin_url( 'assets/shared/neo-pulse-voice.css' );
			$scripts[] = self::versioned_plugin_url( 'assets/shared/neo-pulse-voice.js' );
		}
		$scripts[] = self::versioned_plugin_url( 'assets/frontend/neo-pulse-chat-widget.js' );
		if ( ! empty( $settings['header_search_opens_sidebar'] ) ) {
			$scripts[] = self::versioned_plugin_url( 'assets/frontend/neo-pulse-chat-header-search.js' );
		}
		return array(
			'styles'  => $styles,
			'scripts' => $scripts,
		);
	}

	/**
	 * Shared widget localize payload (admin enqueue + frontend lazy).
	 *
	 * @param bool                 $in_admin         Admin screen.
	 * @param array<string, mixed> $settings         Chat settings.
	 * @param bool                 $voice_enabled    Voice on.
	 * @param bool                 $chekkit_enabled  Chekkit on.
	 * @param bool                 $chekkit_teaser   Teaser on.
	 * @return array<string, mixed>
	 */
	public static function widget_localize_config( bool $in_admin, array $settings, bool $voice_enabled, bool $chekkit_enabled, bool $chekkit_teaser ): array {
		$tokens    = self::design_tokens();
		$css_vars  = Neo_Pulse_Wp_Ai_Widget_Design::build_chat_css_vars( $tokens );
		$css_vars .= Neo_Pulse_Wp_Ai_Widget_Design::build_sidebar_css_vars( $settings, $tokens );

		$launcher_label = isset( $settings['launcher_label'] ) ? trim( (string) $settings['launcher_label'] ) : '';
		if ( $launcher_label === '' ) {
			$launcher_label = sprintf(
				/* translators: %s: assistant display name */
				__( 'Open %s', 'neo-pulse-wp' ),
				(string) $settings['assistant_name']
			);
		}

		$assistant_name = (string) $settings['assistant_name'];
		$site_name      = get_bloginfo( 'name' );
		$page_context   = Neo_Pulse_Wp_Chat_Page_Context::for_localize_script();
		$starters       = self::conversation_starters( $settings );
		if ( ! empty( $page_context['postId'] ) ) {
			array_unshift( $starters, __( 'Summarize this page', 'neo-pulse-wp' ) );
			$starters = array_values( array_unique( $starters ) );
		}
		if ( ! empty( $page_context['postId'] ) && ! empty( $page_context['typeLabel'] ) ) {
			$composer_placeholder = sprintf(
				/* translators: %s: page type label, e.g. blog post */
				__( 'Ask about this %s…', 'neo-pulse-wp' ),
				(string) $page_context['typeLabel']
			);
		} elseif ( ! empty( $page_context['postId'] ) ) {
			$composer_placeholder = __( 'Ask about this page…', 'neo-pulse-wp' );
		} else {
			$composer_placeholder = sprintf(
				/* translators: %s: site name */
				__( 'Ask about %s…', 'neo-pulse-wp' ),
				$site_name
			);
		}

		$config = array(
			'acceptUrl'              => esc_url_raw( rest_url( self::REST_NAMESPACE . '/chat/accept' ) ),
			'nonce'                  => wp_create_nonce( 'wp_rest' ),
			'ajaxUrl'                => admin_url( 'admin-ajax.php' ),
			'streamNonce'            => wp_create_nonce( 'neo_pulse_chat_stream' ),
			'transcribeUrl'          => esc_url_raw( rest_url( Neo_Pulse_Wp_Voice::REST_NAMESPACE . '/voice/transcribe' ) ),
			'siteName'               => $site_name,
			'welcomeMessage'         => $settings['welcome_message'],
			'color'                  => $settings['color'],
			'assistantName'          => $assistant_name,
			'greetingStyle'          => isset( $settings['greeting_style'] ) ? (string) $settings['greeting_style'] : 'friendly',
			'cssVars'                => $css_vars,
			'modern'                 => ! $in_admin,
			'poweredUrl'             => NEO_PULSE_WP_POWERED_URL,
			'poweredLogo'            => Neo_Pulse_Wp_Brand::logo_svg(),
			'avatarUrl'              => esc_url_raw( self::widget_extra( 'avatar_url' ) ),
			'headerStatus'           => self::has_widget_design() ? self::widget_extra( 'header_status' ) : __( 'Replies instantly', 'neo-pulse-wp' ),
			'ui'                     => self::design_ui(),
			'voiceEnabled'           => $voice_enabled,
			'voicePtt'               => ! empty( $settings['voice_ptt'] ),
			'micReplacesSend'        => ! empty( $settings['mic_replaces_send'] ),
			'sidebarSide'            => (string) ( $settings['sidebar_side'] ?? 'right' ),
			'sidebarTransition'      => (string) ( $settings['sidebar_transition'] ?? 'slide' ),
			'sidebarWidth'           => (int) ( $settings['sidebar_width'] ?? 400 ),
			'sidebarHeading'         => (string) ( $settings['sidebar_heading'] ?? '' ),
			'sidebarLayout'          => isset( $settings['sidebar_layout'] ) && is_array( $settings['sidebar_layout'] )
				? $settings['sidebar_layout']
				: array( 'chat' ),
			'launcherLabel'          => $launcher_label,
			'launcherStyle'          => ( isset( $settings['launcher_style'] ) && in_array( $settings['launcher_style'], array( 'edge_tab', 'none' ), true ) )
				? (string) $settings['launcher_style']
				: 'circle',
			'greetingLine'           => __( 'Hello', 'neo-pulse-wp' ),
			'greetingSubline'        => __( 'How can I help you today?', 'neo-pulse-wp' ),
			'conversationStarters'   => $starters,
			'composerPlaceholder'    => $composer_placeholder,
			'pageContext'            => $page_context,
			'chekkitEnabled'         => $chekkit_enabled ? 1 : 0,
			'chekkitSubmitUrl'       => $chekkit_enabled
				? esc_url_raw( rest_url( self::REST_NAMESPACE . '/chekkit/contact' ) )
				: '',
			'chekkitCtaLabel'        => isset( $settings['chekkit_cta_label'] ) && trim( (string) $settings['chekkit_cta_label'] ) !== ''
				? (string) $settings['chekkit_cta_label']
				: __( 'Send Us A Text', 'neo-pulse-wp' ),
			'chekkitTeaserEnabled'   => $chekkit_teaser ? 1 : 0,
			'chekkitTeaserAvatarUrl' => esc_url_raw( plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . ( is_readable( NEO_PULSE_WP_PLUGIN_DIR . 'assets/frontend/chekkit-teaser-avatar-96.webp' ) ? 'assets/frontend/chekkit-teaser-avatar-96.webp' : 'assets/frontend/chekkit-teaser-avatar.png' ) ),
			'canCopyLog'             => is_user_logged_in(),
			'isLoggedIn'             => is_user_logged_in(),
			'canBackendMode'         => self::current_user_can_backend_mode(),
			'canAnalytics'           => current_user_can( 'manage_options' ),
			'canEditContent'         => current_user_can( 'edit_posts' ),
			'backendStarters'        => self::current_user_can_backend_mode() ? Neo_Pulse_Wp_Chat_Super_Admin::get_backend_starters() : array(),
			'backendAssistUrl'       => esc_url_raw( rest_url( self::REST_NAMESPACE . '/backend-assist' ) ),
			'backendAssistStepUrl'   => esc_url_raw( rest_url( self::REST_NAMESPACE . '/backend-assist/step' ) ),
			'backendAssistUndoUrl'   => esc_url_raw( rest_url( self::REST_NAMESPACE . '/backend-assist/undo' ) ),
			'isWpAdmin'              => $in_admin,
			'defaultAdminMode'       => ( $in_admin && self::current_user_can_backend_mode() ) ? 'backend' : 'visitor',
			'currentUserId'          => is_user_logged_in() ? get_current_user_id() : 0,
		);
		if ( is_user_logged_in() && current_user_can( 'edit_posts' ) ) {
			$config['siteInventoryUrl']    = esc_url_raw( rest_url( self::REST_NAMESPACE . '/chat/site-inventory' ) );
			$config['siteInventoryCsvUrl'] = esc_url_raw( rest_url( self::REST_NAMESPACE . '/chat/site-inventory?format=csv&include_drafts=1' ) );
		}
		if ( $chekkit_enabled ) {
			$config['contactInfo'] = Neo_Pulse_Wp_Chat_Lead::get_widget_contact_facts( $settings );
		}
		return $config;
	}
}
