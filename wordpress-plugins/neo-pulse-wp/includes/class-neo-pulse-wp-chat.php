<?php
/**
 * NEO Pulse Chat Widget: frontend injection and chat endpoints.
 *
 * When enabled in Settings > Chat Widget, injects a chat panel host in wp_footer
 * that merges with the AI Search magnifying-glass sidebar. Messages stream through
 * admin-ajax (neo_pulse_chat_stream) using RAG + sub-agent reasoning.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_wp_chat_dir = __DIR__ . '/chat/';
require_once $neo_pulse_wp_chat_dir . 'trait-chat-access-and-rest.php';
require_once $neo_pulse_wp_chat_dir . 'trait-chat-assets.php';
require_once $neo_pulse_wp_chat_dir . 'trait-chat-launcher-render.php';
require_once $neo_pulse_wp_chat_dir . 'trait-chat-stream.php';
require_once $neo_pulse_wp_chat_dir . 'trait-chat-prefetch.php';
require_once $neo_pulse_wp_chat_dir . 'trait-chat-stream-helpers.php';

class Neo_Pulse_Wp_Chat {

	use Neo_Pulse_Wp_Chat_Trait_Access_And_Rest;
	use Neo_Pulse_Wp_Chat_Trait_Assets;
	use Neo_Pulse_Wp_Chat_Trait_Launcher_Render;
	use Neo_Pulse_Wp_Chat_Trait_Stream;
	use Neo_Pulse_Wp_Chat_Trait_Prefetch;
	use Neo_Pulse_Wp_Chat_Trait_Stream_Helpers;

	const OPTION_KEY              = 'neo_pulse_wp_chat_settings';
	const REST_NAMESPACE          = 'neo-pulse/v1';
	const SHORTCODE_TAG           = 'neo-pulse_chat';
	const PREFETCH_TRANSIENT_PREFIX = 'neo_pulse_chat_pf_';
	const PREFETCH_TTL            = 60;
	const RESPONSE_PREFETCH_TTL   = 120;

	/** Per-IP limits for visitors (editors exempt): messages, and prefetch calls combined. */
	const STREAM_RATE_MAX         = 20;
	const PREFETCH_RATE_MAX       = 240;
	const RATE_WINDOW             = 300;

	/** @var bool */
	private static $shortcode_rendered = false;

	/**
	 * Design from the NEO Pulse Chat Elementor widget on this page (null = no widget rendered).
	 *
	 * @var array{tokens:array<string,mixed>,ui:array<string,bool>,sidebar:array<string,mixed>,el_id:string}|null
	 */
	private static $widget_design = null;

	const WIDGET_MIGRATION_KEY = 'neo_pulse_wp_chat_widget_migrated';

	/**
	 * Hook registrations.
	 */
	public static function init(): void {
		add_shortcode( self::SHORTCODE_TAG, array( __CLASS__, 'render_shortcode' ) );
		self::maybe_migrate_to_widget();
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
		add_action( 'wp_head', array( __CLASS__, 'render_mobile_guard_script' ), 0 );
		add_action( 'wp_head', array( __CLASS__, 'render_mobile_launcher_critical_css' ), 1 );
		add_action( 'wp_footer', array( __CLASS__, 'maybe_render_widget' ), 1 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'maybe_enqueue_assets' ) );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'maybe_enqueue_assets' ) );
		add_action( 'admin_footer', array( __CLASS__, 'maybe_render_widget' ), 1 );
		add_action( 'wp_footer', array( __CLASS__, 'render_mobile_launcher_force_css' ), 99999 );
		add_action( 'save_post', array( __CLASS__, 'on_post_save' ), 10, 0 );

		add_action( 'wp_ajax_neo_pulse_chat_stream', array( __CLASS__, 'ajax_chat_stream' ) );
		add_action( 'wp_ajax_nopriv_neo_pulse_chat_stream', array( __CLASS__, 'ajax_chat_stream' ) );
		add_action( 'wp_ajax_neo_pulse_chat_prefetch', array( __CLASS__, 'ajax_chat_prefetch' ) );
		add_action( 'wp_ajax_nopriv_neo_pulse_chat_prefetch', array( __CLASS__, 'ajax_chat_prefetch' ) );
		add_action( 'wp_ajax_neo_pulse_chat_ack_prefetch', array( __CLASS__, 'ajax_chat_ack_prefetch' ) );
		add_action( 'wp_ajax_nopriv_neo_pulse_chat_ack_prefetch', array( __CLASS__, 'ajax_chat_ack_prefetch' ) );
		add_action( 'wp_ajax_neo_pulse_chat_response_prefetch', array( __CLASS__, 'ajax_chat_response_prefetch' ) );
		add_action( 'wp_ajax_nopriv_neo_pulse_chat_response_prefetch', array( __CLASS__, 'ajax_chat_response_prefetch' ) );
		add_action( 'wp_ajax_neo_pulse_chat_page_context', array( __CLASS__, 'ajax_chat_page_context' ) );
		add_action( 'wp_ajax_nopriv_neo_pulse_chat_page_context', array( __CLASS__, 'ajax_chat_page_context' ) );
		if ( self::is_off_everywhere() ) {
			wp_clear_scheduled_hook( Neo_Pulse_Wp_Chat_Starters::CRON_HOOK );
			wp_clear_scheduled_hook( Neo_Pulse_Wp_Chat_Starters::GENERATE_HOOK );
		} else {
			Neo_Pulse_Wp_Chat_Starters::maybe_schedule();
		}
	}

	/**
	 * Whether the chat widget is enabled.
	 */
	public static function is_enabled(): bool {
		$stored = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $stored ) || ! array_key_exists( 'enabled', $stored ) ) {
			return false;
		}
		return ! empty( $stored['enabled'] );
	}

	/**
	 * Master off switch: no chat anywhere (front end, wp-admin, search panel Chat tab,
	 * shortcode, God Mode, chat API) for anyone, administrators included.
	 * Set on Chat > General, or force it with define( 'NEO_PULSE_WP_CHAT_OFF', true ) in wp-config.php.
	 */
	public static function is_off_everywhere(): bool {
		if ( defined( 'NEO_PULSE_WP_CHAT_OFF' ) && NEO_PULSE_WP_CHAT_OFF ) {
			return true;
		}
		// NEO Pulse Pro (without AI): no chat anywhere; its settings and history are kept for an upgrade.
		if ( Neo_Pulse_Wp_License::ai_needs_upgrade( false ) ) {
			return true;
		}
		$stored = get_option( self::OPTION_KEY, array() );
		return is_array( $stored ) && ! empty( $stored['off_everywhere'] );
	}

	/**
	 * 0.9.235: the front-end bubble moved into the NEO Pulse Chat Elementor widget. Sites that already
	 * had chat switched on keep the site-wide bubble (and its saved styling) until a widget is placed.
	 */
	private static function maybe_migrate_to_widget(): void {
		if ( get_option( self::WIDGET_MIGRATION_KEY, '' ) === '1' ) {
			return;
		}
		$stored = get_option( self::OPTION_KEY, array() );
		if ( is_array( $stored ) && ! empty( $stored['enabled'] ) && ! array_key_exists( 'show_without_widget', $stored ) ) {
			$stored['show_without_widget'] = true;
			update_option( self::OPTION_KEY, $stored );
		}
		update_option( self::WIDGET_MIGRATION_KEY, '1', true );
	}

	/**
	 * Called by the NEO Pulse Chat Elementor widget while the page renders.
	 *
	 * @param array<string,mixed> $design tokens / ui / sidebar from the widget.
	 * @param string              $el_id  Elementor element ID.
	 */
	public static function apply_widget_design( array $design, string $el_id ): void {
		if ( self::$widget_design !== null ) {
			return; // First widget on the page wins.
		}
		self::$widget_design = array(
			'tokens'  => isset( $design['tokens'] ) && is_array( $design['tokens'] ) ? $design['tokens'] : array(),
			'ui'      => isset( $design['ui'] ) && is_array( $design['ui'] ) ? $design['ui'] : array(),
			'sidebar' => isset( $design['sidebar'] ) && is_array( $design['sidebar'] ) ? $design['sidebar'] : array(),
			'extra'   => isset( $design['extra'] ) && is_array( $design['extra'] ) ? $design['extra'] : array(),
			'el_id'   => $el_id,
		);
	}

	public static function has_widget_design(): bool {
		return self::$widget_design !== null;
	}

	/**
	 * Extra widget settings that are not colours: launcher icon markup, avatar image, header status line.
	 */
	public static function widget_extra( string $key ): string {
		if ( self::$widget_design === null || is_admin() ) {
			return '';
		}
		return isset( self::$widget_design['extra'][ $key ] ) ? (string) self::$widget_design['extra'][ $key ] : '';
	}

	/**
	 * Chat colour/size tokens: saved site design, overridden by the Elementor widget on this page.
	 *
	 * @return array<string,mixed>
	 */
	public static function design_tokens(): array {
		if ( is_admin() ) {
			return Neo_Pulse_Wp_Ai_Widget_Design::resolve( 'chat' );
		}
		$tokens = self::public_base_tokens();
		if ( self::$widget_design !== null ) {
			$tokens = array_merge( $tokens, self::$widget_design['tokens'] );
		}
		return $tokens;
	}

	/**
	 * Starting tokens for the public chat (0.9.236): sizes only. Colours and font from the old site-wide
	 * chat design are dropped so every site starts from the default look (accent = the site's main
	 * Elementor colour, text in the site font); only colours set on the NEO Pulse Chat widget apply.
	 *
	 * @return array<string,mixed>
	 */
	public static function public_base_tokens(): array {
		$tokens = Neo_Pulse_Wp_Ai_Widget_Design::resolve( 'chat' );
		foreach ( array_merge( Neo_Pulse_Wp_Ai_Widget_Design::color_token_keys(), array( 'font_family', 'shadow' ) ) as $key ) {
			unset( $tokens[ $key ] );
		}
		return $tokens;
	}

	/**
	 * Which chat parts are shown (header, avatar, chips...).
	 *
	 * @return array<string,bool>
	 */
	public static function design_ui(): array {
		$design = Neo_Pulse_Wp_Ai_Widget_Design::get_settings();
		$ui     = isset( $design['chat_ui'] ) && is_array( $design['chat_ui'] ) ? $design['chat_ui'] : array();
		if ( self::$widget_design !== null && ! is_admin() ) {
			$ui = array_merge( $ui, self::$widget_design['ui'] );
		}
		return $ui;
	}

	/**
	 * Load the chat for a widget rendered after wp_enqueue_scripts (scripts print in the footer).
	 */
	public static function enqueue_for_widget(): void {
		if ( ! self::can_show_frontend_bubble() ) {
			return;
		}
		// Re-localize even if already enqueued so the widget's design replaces the site default.
		self::enqueue_lazy_frontend();
	}

	/**
	 * Versioned plugin-relative URL for lazy injection.
	 *
	 * @param string $relative Path from plugin root.
	 */
	public static function versioned_plugin_url( string $relative ): string {
		$url = plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . ltrim( $relative, '/' );
		$abs = NEO_PULSE_WP_PLUGIN_DIR . ltrim( $relative, '/' );
		$ver = NEO_PULSE_WP_VERSION;
		if ( is_readable( $abs ) ) {
			$ver .= '.' . (string) filemtime( $abs );
		}
		return $url . '?ver=' . rawurlencode( $ver );
	}

	/**
	 * Name the AI uses for itself, from the server-side chat setting. The browser-sent
	 * assistant_name is ignored: it went straight into the system prompt (prompt injection).
	 *
	 * @param mixed               $body     Decoded request body (unused; kept for call-site compat).
	 * @param array<string,mixed> $settings Chat settings.
	 */
	public static function assistant_name_for_request( $body, array $settings ): string {
		// The chat widget sends the name shown in its header. It reaches the prompt, so only a plain
		// short name is accepted (letters, numbers, spaces and - ' . &); anything else falls back.
		if ( is_array( $body ) && isset( $body['assistant_name'] ) && is_string( $body['assistant_name'] ) ) {
			$sent = trim( sanitize_text_field( wp_unslash( $body['assistant_name'] ) ) );
			if ( $sent !== '' && preg_match( "/^[\\p{L}\\p{N} .'&-]{1,40}$/u", $sent ) ) {
				return $sent;
			}
		}
		$name = trim( sanitize_text_field( (string) ( $settings['assistant_name'] ?? '' ) ) );
		if ( $name === '' ) {
			$name = 'Pulse Assist';
		}
		return function_exists( 'mb_substr' ) ? mb_substr( $name, 0, 60 ) : substr( $name, 0, 60 );
	}

	/**
	 * Get all chat settings with defaults.
	 *
	 * @return array{enabled:bool,welcome_message:string,color:string}
	 */
	public static function get_settings(): array {
		$defaults = array(
			'enabled'             => false,
			'off_everywhere'      => false,
			'show_without_widget' => false,
			'disable_backend'       => false,
			'logged_in_only'        => false,
			'admin_only'            => false,
			'whitelist_url'       => '',
			'welcome_message'     => __( 'Hi! Ask me anything about this website.', 'neo-pulse-wp' ),
			'color'               => '#3b82f6',
			'assistant_name'      => 'Pulse Assist',
			'system_prompt'       => '',
			'greeting_style'      => 'friendly',
			'knowledge_base'      => array(),
			'indexed_post_types'  => array( 'post', 'page' ),
			'excluded_categories' => array(),
			'full_content'        => false,
			'voice_enabled'       => true,
			'voice_ptt'           => true,
			'mic_replaces_send'   => true,
			'lead_conversion_enabled' => true,
			'god_mode_enabled'       => true,
			'chekkit_enabled'        => true,
			'chekkit_teaser_enabled' => true,
			'chekkit_cta_label'      => __( 'Send Us A Text', 'neo-pulse-wp' ),
			'chekkit_event_type'     => 'contact_request',
			'chekkit_webhook_url'    => Neo_Pulse_Wp_Chekkit::DEFAULT_WEBHOOK_URL,
		);

		$stored = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}

		$merged = array_merge( $defaults, $stored );
		if ( isset( $merged['chekkit_cta_label'] ) && trim( (string) $merged['chekkit_cta_label'] ) === 'Talk To A Human' ) {
			$merged['chekkit_cta_label'] = __( 'Send Us A Text', 'neo-pulse-wp' );
		}
		if ( ! isset( $merged['assistant_name'] ) || trim( (string) $merged['assistant_name'] ) === '' || trim( (string) $merged['assistant_name'] ) === 'Flow Assist' ) {
			$merged['assistant_name'] = 'Pulse Assist';
		}
		$sidebar = Neo_Pulse_Wp_Ai_Widget_Design::resolve_sidebar_config( 'chat', $stored );
		$merged  = array_merge( $merged, $sidebar );
		if ( self::$widget_design !== null && ! is_admin() ) {
			$merged = array_merge( $merged, self::$widget_design['sidebar'] );
			if ( ! empty( self::$widget_design['tokens']['accent'] ) ) {
				$merged['color'] = (string) self::$widget_design['tokens']['accent'];
			}
		}

		return $merged;
	}

	/**
	 * Context-aware conversation starters for the empty state.
	 *
	 * @param array<string,mixed> $settings
	 * @return array<int, string>
	 */
	public static function conversation_starters( array $settings = array() ): array {
		return Neo_Pulse_Wp_Chat_Starters::get( $settings );
	}

	/**
	 * Save chat settings.
	 *
	 * @param array $settings
	 */
	public static function save_settings( array $settings ): void {
		// Merge onto the raw stored option, not get_settings(): that adds derived defaults
		// (sidebar config, widget design) which must not be frozen into the option.
		$current = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $current ) ) {
			$current = array();
		}
		$merged = array_merge( $current, $settings );
		update_option( self::OPTION_KEY, $merged );
	}

	/**
	 * Invalidate RAG cache when posts are saved.
	 */
	public static function on_post_save(): void {
		Neo_Pulse_Wp_Chat_Rag::invalidate_cache();
	}
}
