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

class Neo_Pulse_Wp_Chat {

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
	 * Everything except "is there a widget on this page": licence, master switch, builders, visitor rules.
	 */
	public static function can_show_frontend_bubble(): bool {
		if ( is_admin() || self::is_off_everywhere() || self::is_page_builder_editing_context() ) {
			return false;
		}
		return self::should_show_for_visitor();
	}

	/**
	 * Front end: the bubble shows where the Elementor widget is placed, where the shortcode is used,
	 * or everywhere when "Show without the widget" is on.
	 */
	private static function frontend_bubble_wanted(): bool {
		if ( self::$widget_design !== null ) {
			return true;
		}
		$settings = self::get_settings();
		if ( ! empty( $settings['show_without_widget'] ) ) {
			return true;
		}
		return self::page_has_chat_shortcode();
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
	 * Whether the chat widget should load for the current frontend visitor.
	 * When logged_in_only is set, guests do not see the widget or receive chat API access.
	 * When admin_only is set, only WordPress administrators see it.
	 */
	public static function should_show_for_visitor(): bool {
		if ( ! Neo_Pulse_Wp_License::is_licensed( false ) ) {
			return false; // Not licensed: no chat (see class-neo-pulse-wp-license.php).
		}
		if ( self::is_off_everywhere() || ! self::is_enabled() ) {
			return false;
		}
		$settings = self::get_settings();
		if ( ! empty( $settings['admin_only'] ) && ! current_user_can( 'manage_options' ) ) {
			return false;
		}
		if ( ! empty( $settings['logged_in_only'] ) && ! is_user_logged_in() ) {
			return false;
		}
		$whitelist = isset( $settings['whitelist_url'] ) ? trim( (string) $settings['whitelist_url'] ) : '';
		if ( $whitelist !== '' && ! wp_doing_ajax() && ! ( defined( 'REST_REQUEST' ) && REST_REQUEST ) && ! self::current_path_matches_whitelist( $whitelist ) ) {
			return false;
		}
		return true;
	}

	/**
	 * Whether the current frontend request includes the chat shortcode.
	 */
	private static function page_has_chat_shortcode(): bool {
		if ( self::$shortcode_rendered ) {
			return true;
		}
		if ( is_admin() ) {
			return false;
		}
		if ( is_singular() ) {
			$post = get_queried_object();
			if ( $post instanceof WP_Post && has_shortcode( $post->post_content, self::SHORTCODE_TAG ) ) {
				return true;
			}
			$post_id = $post instanceof WP_Post ? (int) $post->ID : get_queried_object_id();
			if ( $post_id > 0 ) {
				$elementor_data = get_post_meta( $post_id, '_elementor_data', true );
				if ( is_string( $elementor_data ) && strpos( $elementor_data, '[' . self::SHORTCODE_TAG ) !== false ) {
					return true;
				}
			}
		}
		return false;
	}

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
	 * Compare current request path to a whitelist URL path (trailing slash ignored).
	 * Uses the request URI and the current page permalink so password-protected
	 * pages still match after the visitor enters the page password.
	 */
	public static function normalize_url_path( string $url ): string {
		$url = trim( $url );
		if ( $url === '' ) {
			return '';
		}
		$lower = strtolower( $url );
		$has_scheme = substr( $lower, 0, 7 ) === 'http://' || substr( $lower, 0, 8 ) === 'https://';
		if ( ! $has_scheme && ( ! isset( $url[0] ) || $url[0] !== '/' ) ) {
			$url = 'https://' . $url;
		}
		$path = wp_parse_url( $url, PHP_URL_PATH );
		if ( ! is_string( $path ) || $path === '' ) {
			$path = '/';
		}
		$trimmed = rtrim( $path, '/' );
		return $trimmed === '' ? '/' : $trimmed;
	}

	/**
	 * @param string $whitelist_url Configured frontend URL or path.
	 * @param string $candidate_url Request URI, permalink, or full URL.
	 */
	public static function url_path_matches_whitelist( string $whitelist_url, string $candidate_url ): bool {
		$allowed = self::normalize_url_path( $whitelist_url );
		if ( $allowed === '' ) {
			return false;
		}
		return self::normalize_url_path( $candidate_url ) === $allowed;
	}

	private static function current_path_matches_whitelist( string $whitelist_url ): bool {
		$candidates = array();
		if ( ! empty( $_SERVER['REQUEST_URI'] ) ) {
			$candidates[] = (string) wp_unslash( $_SERVER['REQUEST_URI'] );
		}
		if ( function_exists( 'is_singular' ) && is_singular() && function_exists( 'get_permalink' ) ) {
			$link = get_permalink();
			if ( is_string( $link ) && $link !== '' ) {
				$candidates[] = $link;
			}
		}
		foreach ( $candidates as $candidate ) {
			if ( self::url_path_matches_whitelist( $whitelist_url, $candidate ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Elementor, block editor, and other page-builder UIs (Pulse must not overlay the canvas).
	 */
	public static function is_page_builder_editing_context(): bool {
		if ( class_exists( 'Neo_Pulse_Wp_Search_Elementor_Widget' ) ) {
			if ( Neo_Pulse_Wp_Search_Elementor_Widget::is_elementor_editor_context() ) {
				return true;
			}
		} elseif ( class_exists( '\Elementor\Plugin' ) ) {
			$plugin = \Elementor\Plugin::$instance;
			if ( ( isset( $plugin->editor ) && $plugin->editor->is_edit_mode() )
				|| ( isset( $plugin->preview ) && $plugin->preview->is_preview_mode() ) ) {
				return true;
			}
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only screen detection.
		if ( ! empty( $_GET['action'] ) && sanitize_key( (string) wp_unslash( $_GET['action'] ) ) === 'elementor' ) {
			return true;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( ! empty( $_GET['elementor-preview'] ) || ! empty( $_GET['elementor_library'] ) ) {
			return true;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( ! empty( $_GET['fl_builder'] ) || ! empty( $_GET['et_fb'] ) || ! empty( $_GET['vc_editable'] ) ) {
			return true;
		}

		if ( function_exists( 'get_current_screen' ) ) {
			$screen = get_current_screen();
			if ( $screen instanceof WP_Screen && $screen->is_block_editor() ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Whether the chat sidebar should load on the current screen (frontend or wp-admin).
	 */
	public static function should_show_on_current_screen(): bool {
		if ( ! Neo_Pulse_Wp_License::is_licensed( false ) ) {
			return false; // Not licensed: no chat (see class-neo-pulse-wp-license.php).
		}
		if ( self::is_off_everywhere() || self::is_page_builder_editing_context() ) {
			return false;
		}
		if ( ! self::is_enabled() && ! current_user_can( 'manage_options' ) ) {
			return false;
		}
		if ( is_admin() ) {
			$settings = self::get_settings();
			if ( ! empty( $settings['disable_backend'] ) ) {
				return false;
			}
			return is_user_logged_in();
		}
		return self::should_show_for_visitor() && self::frontend_bubble_wanted();
	}

	/**
	 * Whether chat API endpoints (stream, prefetch) may run for this request.
	 */
	public static function can_use_chat_api(): bool {
		if ( ! Neo_Pulse_Wp_License::is_licensed( true ) ) {
			return false; // Not licensed: no chat (see class-neo-pulse-wp-license.php).
		}
		if ( self::is_off_everywhere() ) {
			return false;
		}
		if ( ! self::is_enabled() && ! current_user_can( 'manage_options' ) ) {
			return false;
		}
		$settings = self::get_settings();
		if ( ! empty( $settings['admin_only'] ) ) {
			return current_user_can( 'manage_options' );
		}
		if ( is_user_logged_in() ) {
			return true;
		}
		return self::should_show_for_visitor();
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
	 * Whether the current user may use God Mode (backend chat pipeline).
	 * Requires the Chat setting, the edit_posts capability and a Neo Digital staff email
	 * (an email alone is not enough: anyone can register with any address on open sites).
	 */
	public static function current_user_can_backend_mode(): bool {
		if ( ! is_user_logged_in() || self::is_off_everywhere() ) {
			return false;
		}
		if ( ! current_user_can( 'edit_posts' ) ) {
			return false;
		}
		$settings = self::get_settings();
		if ( empty( $settings['god_mode_enabled'] ) ) {
			return false;
		}
		return self::current_user_email_is_neodigital();
	}

	/**
	 * God Mode whitelist: Neo Digital staff emails only.
	 */
	public static function current_user_email_is_neodigital(): bool {
		$user  = wp_get_current_user();
		$email = strtolower( trim( (string) $user->user_email ) );
		$at    = strrpos( $email, '@' );
		if ( $at === false ) {
			return false;
		}
		$domain = substr( $email, $at + 1 );
		return $domain === 'neodigital.ca';
	}

	/**
	 * Register REST route for chat messages.
	 */
	public static function register_routes(): void {
		register_rest_route(
			self::REST_NAMESPACE,
			'/chat/accept',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'rest_chat_accept' ),
				'permission_callback' => '__return_true',
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/chat/site-inventory',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'rest_site_inventory' ),
				'permission_callback' => array( __CLASS__, 'can_access_site_inventory' ),
			)
		);
	}

	/**
	 * @return bool
	 */
	public static function can_access_site_inventory(): bool {
		return is_user_logged_in() && current_user_can( 'edit_posts' );
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_site_inventory( WP_REST_Request $request ): WP_REST_Response {
		$include_drafts = rest_sanitize_boolean( $request->get_param( 'include_drafts' ) );
		$format         = sanitize_key( (string) $request->get_param( 'format' ) );
		$query          = sanitize_text_field( (string) $request->get_param( 'query' ) );
		$post_type      = sanitize_key( (string) $request->get_param( 'post_type' ) );
		$limit          = (int) $request->get_param( 'limit' );
		$sort           = sanitize_key( (string) $request->get_param( 'sort' ) );
		$has_filters    = $query !== '' || $post_type !== '' || $limit > 0 || $sort !== '';

		if ( $format === 'csv' ) {
			$csv      = Neo_Pulse_Wp_Site_Inventory::build_csv( $include_drafts );
			$response = new WP_REST_Response( $csv, 200 );
			$response->header( 'Content-Type', 'text/csv; charset=utf-8' );
			$response->header( 'Content-Disposition', 'attachment; filename=' . Neo_Pulse_Wp_Site_Inventory::download_filename() );
			return $response;
		}

		Neo_Pulse_Wp_Site_Inventory::warm( $include_drafts );
		$meta = Neo_Pulse_Wp_Site_Inventory::get_meta();

		if ( $has_filters ) {
			$filters = array( 'include_drafts' => $include_drafts );
			if ( $post_type !== '' ) {
				$filters['post_type'] = $post_type;
			}
			if ( $query !== '' ) {
				$filters['query'] = $query;
			}
			if ( $limit > 0 ) {
				$filters['limit'] = max( 1, min( 50, $limit ) );
			}
			if ( $sort !== '' ) {
				$filters['sort'] = $sort;
			}
			$items = Neo_Pulse_Wp_Site_Inventory::get_items( $filters );
			return new WP_REST_Response(
				array(
					'ok'      => true,
					'count'   => count( $items ),
					'total'   => (int) ( $meta['count'] ?? count( $items ) ),
					'by_type' => isset( $meta['by_type'] ) && is_array( $meta['by_type'] ) ? $meta['by_type'] : array(),
					'items'   => Neo_Pulse_Wp_Site_Inventory::slim_items( $items ),
				),
				200
			);
		}

		return new WP_REST_Response(
			array(
				'ok'        => true,
				'count'     => (int) ( $meta['count'] ?? 0 ),
				'by_type'   => isset( $meta['by_type'] ) && is_array( $meta['by_type'] ) ? $meta['by_type'] : array(),
				'cached_at' => (int) ( $meta['cached_at'] ?? 0 ),
			),
			200
		);
	}

	/**
	 * REST handler: record accepted answer click.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_chat_accept( WP_REST_Request $request ): WP_REST_Response {
		if ( self::is_off_everywhere() ) {
			return new WP_REST_Response( array( 'error' => __( 'Chat is turned off.', 'neo-pulse-wp' ) ), 403 );
		}
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}

		$result = Neo_Pulse_Wp_Chat_Logs::record_accept(
			array(
				'message_uid' => isset( $body['messageId'] ) ? (string) $body['messageId'] : '',
				'url'         => isset( $body['url'] ) ? (string) $body['url'] : '',
				'label'       => isset( $body['label'] ) ? (string) $body['label'] : '',
				'type'        => isset( $body['type'] ) ? (string) $body['type'] : 'link',
			)
		);

		if ( empty( $result['ok'] ) ) {
			$status = ( isset( $result['error'] ) && $result['error'] === 'logging_disabled' ) ? 200 : 400;
			return new WP_REST_Response( $result, $status );
		}

		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

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

	/**
	 * Invalidate RAG cache when posts are saved.
	 */
	public static function on_post_save(): void {
		Neo_Pulse_Wp_Chat_Rag::invalidate_cache();
	}

	/**
	 * AJAX streaming handler: runs the pipeline step-by-step, flushing
	 * NDJSON progress events so the frontend can show live status.
	 *
	 * Each line is a JSON object: {"status":"...","label":"..."} for progress,
	 * or {"status":"done","card":{...}} for the final result.
	 */
	public static function ajax_chat_stream(): void {
		self::verify_chat_ajax_request();

		if ( self::is_off_everywhere() || ( ! self::is_enabled() && ! current_user_can( 'manage_options' ) ) ) {
			self::begin_stream_response();
			self::stream_line( array( 'status' => 'done', 'card' => array(
				'type' => 'not-found', 'title' => 'Disabled', 'body' => 'Chat widget is not enabled.', 'confidence' => 'low',
			) ) );
			wp_die();
		}
		if ( ! self::can_use_chat_api() ) {
			self::begin_stream_response();
			self::stream_line( array( 'status' => 'done', 'card' => array(
				'type' => 'not-found', 'title' => 'Login required', 'body' => 'Chat is available to logged-in users only.', 'confidence' => 'low',
			) ) );
			wp_die();
		}

		$api_key = Neo_Pulse_Wp_OpenRouter::get_api_key();
		if ( $api_key === '' ) {
			self::begin_stream_response();
			self::stream_line( array( 'status' => 'done', 'card' => array(
				'type' => 'not-found', 'title' => 'Not configured', 'body' => 'AI is not configured. Please add an OpenRouter API key.', 'confidence' => 'low',
			) ) );
			wp_die();
		}

		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$raw_body = file_get_contents( 'php://input' );
		$body     = json_decode( $raw_body, true );
		$message  = isset( $body['message'] ) ? sanitize_textarea_field( wp_unslash( $body['message'] ) ) : '';
		$history  = isset( $body['history'] ) && is_array( $body['history'] ) ? $body['history'] : array();

		if ( Neo_Pulse_Wp_Chat_Super_Admin::is_backend_mode_request( is_array( $body ) ? $body : null ) ) {
			$history = Neo_Pulse_Wp_Chat_History::normalize( $history );
			Neo_Pulse_Wp_Chat_Super_Admin::stream_pipeline( $message, $history, is_array( $body ) ? $body : null );
			return;
		}

		$log_meta = Neo_Pulse_Wp_Chat_Logs::parse_meta_from_body( is_array( $body ) ? $body : null );

		self::begin_stream_response();

		if ( trim( $message ) === '' ) {
			self::stream_line( array( 'status' => 'done', 'card' => array(
				'type' => 'not-found', 'title' => 'Empty message', 'body' => 'Message cannot be empty.', 'confidence' => 'low',
			) ) );
			wp_die();
		}

		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'chat_stream', self::STREAM_RATE_MAX, self::RATE_WINDOW ) ) {
			self::stream_line( array( 'status' => 'done', 'card' => self::rate_limited_card() ) );
			wp_die();
		}

		// Visitor pipeline: only the visitor's own turns go back to the model (client-sent
		// assistant turns could carry injected instructions).
		$history  = Neo_Pulse_Wp_Chat_History::for_visitor( Neo_Pulse_Wp_Chat_History::normalize( $history ) );
		$settings = self::get_settings();
		$page_context = self::parse_page_context_from_body( is_array( $body ) ? $body : null, $settings );
		$site_name = get_bloginfo( 'name' );
		$training = array(
			'assistant_name' => self::assistant_name_for_request( $body ?? null, $settings ),
			'system_prompt'  => $settings['system_prompt'],
			'greeting_style' => $settings['greeting_style'],
			'knowledge_base' => $settings['knowledge_base'],
		);

		$prefetch_key = isset( $body['prefetch_key'] ) ? sanitize_text_field( wp_unslash( (string) $body['prefetch_key'] ) ) : '';
		$prefetched   = self::load_prefetch_payload( $prefetch_key, $message, $history );

		if ( is_array( $prefetched ) && ! empty( $prefetched['card'] ) && is_array( $prefetched['card'] ) ) {
			self::stream_prefetched_card( $message, $prefetched, $log_meta, $settings, $history, $page_context );
			wp_die();
		}

		// -- Secretary gate (instant, before RAG / site index) --
		$gate = is_array( $prefetched ) && isset( $prefetched['ack'] ) && is_array( $prefetched['ack'] )
			? $prefetched['ack']
			: Neo_Pulse_Wp_Chat_Agents::phase_ack( $message, $site_name, $training, $history, $settings );
		if ( is_wp_error( $gate ) ) {
			self::stream_line( array( 'status' => 'done', 'card' => array(
				'type' => 'not-found', 'title' => 'Something went wrong', 'body' => self::visitor_error_text(), 'confidence' => 'low',
			) ) );
			wp_die();
		}

		if ( is_array( $gate ) && trim( (string) ( $gate['text'] ?? '' ) ) !== '' ) {
			self::stream_line( array( 'status' => 'ack', 'text' => trim( (string) $gate['text'] ) ) );
		}

		Neo_Pulse_Wp_Chat_Logs::log_user_message( $message, self::enrich_log_meta_for_message( $log_meta, $message, $page_context, $settings ) );

		if ( is_array( $gate ) && ( $gate['action'] ?? '' ) === 'deny' ) {
			$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
			$denial = Neo_Pulse_Wp_Chat_Agents::build_denial_card(
				(string) ( $gate['text'] ?? '' ),
				$message,
				$site_name,
				$site_index,
				$history
			);
			$message_uid = Neo_Pulse_Wp_Chat_Logs::log_assistant_card( $denial, $log_meta );
			if ( $message_uid !== '' ) {
				$denial['message_uid'] = $message_uid;
			}
			self::stream_line( array( 'status' => 'done', 'card' => $denial ) );
			wp_die();
		}

		if ( self::try_stream_template_response( $message, $page_context, $settings, $log_meta, $history ) ) {
			wp_die();
		}

		if ( self::try_stream_blog_discovery_response( $message, $settings, $log_meta, $history ) ) {
			wp_die();
		}

		// -- Instant retrieve (continue path) --
		$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		if ( is_array( $prefetched ) && ! empty( $prefetched['early_retrieved'] ) && is_array( $prefetched['early_retrieved'] ) ) {
			$early_retrieved = $prefetched['early_retrieved'];
		} else {
			$early_retrieved = self::retrieve_early_items( $message, $settings, $page_context );
		}
		if ( Neo_Pulse_Wp_Chat_Links::resolve_lead_action( $message, $site_index ) ) {
			$lead_pages      = Neo_Pulse_Wp_Chat_Links::find_lead_pages( $message, $site_index, 2 );
			$early_retrieved = Neo_Pulse_Wp_Chat_Links::dedupe_items_by_id( array_merge( $lead_pages, $early_retrieved ) );
		}

		self::stream_line( array( 'status' => 'searching', 'label' => 'Searching content…' ) );

		$phase_a = null;
		if ( is_array( $prefetched ) && ! empty( $prefetched['phase_a'] ) && is_array( $prefetched['phase_a'] ) ) {
			$phase_a = $prefetched['phase_a'];
		}
		if ( null === $phase_a ) {
			$phase_a = Neo_Pulse_Wp_Chat_Agents::synthesize_classification_from_retrieve( $message, $early_retrieved );
		}
		if ( null === $phase_a ) {
			$narrow  = Neo_Pulse_Wp_Chat_Agents::build_narrow_candidate_items( $site_index, $message, $early_retrieved, $settings );
			$phase_a = Neo_Pulse_Wp_Chat_Agents::phase_classify( $message, $site_name, $site_index, $narrow );
		}
		if ( is_wp_error( $phase_a ) ) {
			self::stream_line( array( 'status' => 'done', 'card' => array(
				'type' => 'not-found', 'title' => 'Something went wrong', 'body' => self::visitor_error_text(), 'confidence' => 'low',
			) ) );
			wp_die();
		}

		$relevant_items = Neo_Pulse_Wp_Chat_Agents::select_relevant_items( $phase_a, $site_index, $message, $settings, $page_context );

		$enriched_items = self::enrich_relevant_items( $relevant_items, true, $settings );

		// -- Phase B: reason --
		self::stream_line( array( 'status' => 'thinking', 'label' => 'Thinking…' ) );

		$phase_b = Neo_Pulse_Wp_Chat_Agents::phase_reason( $message, $history, $site_name, $enriched_items, $phase_a, $training, $site_index, $page_context );
		if ( is_wp_error( $phase_b ) ) {
			self::stream_line( array( 'status' => 'done', 'card' => array(
				'type' => 'not-found', 'title' => 'Something went wrong', 'body' => self::visitor_error_text(), 'confidence' => 'low',
			) ) );
			wp_die();
		}

		// -- Deterministic card (skip Phase C LLM in stream) --
		self::stream_line( array( 'status' => 'formatting', 'label' => 'Formatting response…' ) );

		$phase_c = Neo_Pulse_Wp_Chat_Agents::build_card_from_answer( $phase_b, $phase_a, $enriched_items, $message, $site_index, $history );

		if ( Neo_Pulse_Wp_Chat_Lead::is_lead_message( $message, $site_index ) && Neo_Pulse_Wp_Chat_Lead::is_enabled( $settings ) ) {
			self::stream_line( array( 'status' => 'formatting', 'label' => 'Preparing next steps…' ) );
			$phase_c = Neo_Pulse_Wp_Chat_Lead::enrich_card( $phase_c, $message, $phase_b, $enriched_items, $site_index, $training, $settings );
		}

		if ( is_array( $phase_c ) ) {
			$phase_c = Neo_Pulse_Wp_Chat_Lead::maybe_attach_contact_human_cta( $phase_c, $message, $phase_a, $settings );
		}

		if ( is_array( $phase_c ) ) {
			$message_uid = Neo_Pulse_Wp_Chat_Logs::log_assistant_card( $phase_c, $log_meta );
			if ( $message_uid !== '' ) {
				$phase_c['message_uid'] = $message_uid;
			}
		}

		$done_payload = array( 'status' => 'done', 'card' => $phase_c );
		if ( isset( $log_meta['source'] ) && $log_meta['source'] === 'demo' && current_user_can( 'manage_options' ) ) {
			$done_payload['debug'] = self::build_demo_debug_payload(
				$message,
				$phase_a,
				$enriched_items,
				$site_index,
				$settings
			);
		}

		self::stream_line( $done_payload );
		self::stream_followup_chips(
			$message,
			is_array( $phase_c ) ? $phase_c : array(),
			$phase_b,
			$enriched_items,
			$site_index,
			$history,
			$page_context
		);
		wp_die();
	}

	/**
	 * Blog discovery fast path: real post URLs from the NEO Pulse post sitemap.
	 *
	 * @param array<string,mixed>              $settings
	 * @param array<string,mixed>              $log_meta
	 * @param array<int,array<string,mixed>>   $history
	 */
	private static function try_stream_blog_discovery_response(
		string $message,
		array $settings,
		array $log_meta,
		array $history
	): bool {
		if ( ! Neo_Pulse_Wp_Chat_Rag::is_site_blog_discovery_query( $message ) ) {
			return false;
		}

		$posts = Neo_Pulse_Wp_Chat_Rag::collect_sitemap_blog_posts( $message, $settings, 5 );
		if ( empty( $posts ) ) {
			return false;
		}

		self::stream_line( array( 'status' => 'formatting', 'label' => 'Finding blog posts…' ) );

		$card = Neo_Pulse_Wp_Chat_Rag::build_blog_discovery_card( $message, $posts, $settings );
		if ( ! is_array( $card ) || empty( $card['body'] ) ) {
			return false;
		}

		$site_index     = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		$seen_urls      = Neo_Pulse_Wp_Chat_History::collect_seen_urls( $history );
		$classification = array(
			'intent'       => 'recommendation',
			'search_terms' => array(),
		);
		$card           = Neo_Pulse_Wp_Chat_Links::attach_to_card(
			$card,
			$message,
			(string) $card['body'],
			$posts,
			$classification,
			$site_index,
			$seen_urls,
			array()
		);

		// The user message was already logged by ajax_chat_stream() before this fast path.
		$message_uid = Neo_Pulse_Wp_Chat_Logs::log_assistant_card( $card, $log_meta );
		if ( $message_uid !== '' ) {
			$card['message_uid'] = $message_uid;
		}

		self::stream_line( array( 'status' => 'done', 'card' => $card ) );

		$followups = Neo_Pulse_Wp_Chat_Rag::blog_discovery_followup_topics( $posts, $settings );
		if ( ! empty( $followups ) ) {
			$payload = array(
				'status'        => 'chips',
				'relatedTopics' => $followups,
			);
			if ( $message_uid !== '' ) {
				$payload['message_uid'] = $message_uid;
			}
			self::stream_line( $payload );
		}

		return true;
	}

	/**
	 * Template fast path: OpenRouter-formatted card from page content, no full RAG pipeline.
	 *
	 * @param array<string,mixed>|null     $page_context
	 * @param array<string,mixed>          $log_meta
	 * @param array<int,array<string,mixed>> $history
	 */
	private static function try_stream_template_response(
		string $message,
		?array $page_context,
		array $settings,
		array $log_meta,
		array $history
	): bool {
		$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		$intent     = Neo_Pulse_Wp_Chat_Suggestion_Templates::match_intent( $message, $page_context, $site_index );
		if ( null === $intent ) {
			return false;
		}

		self::stream_line( array( 'status' => 'formatting', 'label' => 'Formatting response…' ) );

		$card = Neo_Pulse_Wp_Chat_Suggestion_Templates::build_card( $intent, $page_context, $site_index, $settings, $message );
		if ( ! is_array( $card ) || empty( $card ) ) {
			return false;
		}

		$message_uid = Neo_Pulse_Wp_Chat_Logs::log_assistant_card( $card, $log_meta );
		if ( $message_uid !== '' ) {
			$card['message_uid'] = $message_uid;
		}

		self::stream_line(
			array(
				'status'          => 'done',
				'card'            => $card,
				'prefetched'      => true,
				'template_intent' => (string) ( $intent['intent'] ?? '' ),
			)
		);

		$answer = (string) ( $card['body'] ?? '' );
		self::stream_followup_chips(
			$message,
			$card,
			$answer,
			array(),
			$site_index,
			$history,
			$page_context
		);

		return true;
	}

	/**
	 * Generate and stream async follow-up chips after the answer card.
	 *
	 * @param array<string,mixed>              $card
	 * @param array<int,array<string,mixed>>   $items
	 * @param array<int,array<string,mixed>>   $site_index
	 * @param array<int,array<string,mixed>>   $history
	 */
	private static function stream_followup_chips(
		string $user_message,
		array $card,
		string $answer,
		array $items,
		array $site_index,
		array $history,
		?array $page_context = null
	): void {
		unset( $card['relatedTopics'] );

		$type = isset( $card['type'] ) ? (string) $card['type'] : '';
		if ( in_array( $type, array( 'error', 'not-found' ), true ) ) {
			return;
		}
		$answer_text = trim( $answer );
		if ( $answer_text === '' ) {
			$answer_text = trim( (string) ( $card['body'] ?? '' ) );
		}
		if ( $answer_text === '' ) {
			return;
		}

		$topics = Neo_Pulse_Wp_Chat_Agents::generate_followup_topics(
			$user_message,
			$answer_text,
			$items,
			$site_index,
			$history,
			$page_context,
			$card
		);
		if ( empty( $topics ) ) {
			return;
		}

		$payload = array(
			'status'        => 'chips',
			'relatedTopics' => $topics,
		);
		if ( ! empty( $card['message_uid'] ) ) {
			$payload['message_uid'] = (string) $card['message_uid'];
		}
		self::stream_line( $payload );
	}

	/**
	 * AJAX prefetch: secretary ack + early RAG while the visitor is still typing.
	 */
	public static function ajax_chat_prefetch(): void {
		self::verify_chat_ajax_request();

		if ( ! self::passes_chat_access_gates() ) {
			wp_send_json_error( array( 'message' => 'Chat unavailable.' ), 403 );
		}

		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$raw_body = file_get_contents( 'php://input' );
		$body     = json_decode( $raw_body, true );
		$message  = isset( $body['message'] ) ? sanitize_textarea_field( wp_unslash( $body['message'] ) ) : '';
		$history  = isset( $body['history'] ) && is_array( $body['history'] ) ? $body['history'] : array();

		if ( trim( $message ) === '' ) {
			wp_send_json_error( array( 'message' => 'Empty message.' ), 400 );
		}

		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'chat_prefetch', self::PREFETCH_RATE_MAX, self::RATE_WINDOW ) ) {
			wp_send_json_error( array( 'message' => 'Too many requests.' ), 429 );
		}

		$history  = Neo_Pulse_Wp_Chat_History::for_visitor( Neo_Pulse_Wp_Chat_History::normalize( $history ) );
		$settings = self::get_settings();
		$page_context = self::parse_page_context_from_body( is_array( $body ) ? $body : null, $settings );
		$site_name = get_bloginfo( 'name' );
		$training = array(
			'assistant_name' => self::assistant_name_for_request( $body ?? null, $settings ),
			'system_prompt'  => $settings['system_prompt'],
			'greeting_style' => $settings['greeting_style'],
			'knowledge_base' => $settings['knowledge_base'],
		);

		$gate = Neo_Pulse_Wp_Chat_Agents::phase_ack( $message, $site_name, $training, $history, $settings );
		if ( is_wp_error( $gate ) ) {
			wp_send_json_error( array( 'message' => self::visitor_error_text() ), 500 );
		}

		$site_index      = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		$early_retrieved = self::retrieve_early_items( $message, $settings, $page_context );
		if ( Neo_Pulse_Wp_Chat_Links::resolve_lead_action( $message, $site_index ) ) {
			$lead_pages      = Neo_Pulse_Wp_Chat_Links::find_lead_pages( $message, $site_index, 2 );
			$early_retrieved = Neo_Pulse_Wp_Chat_Links::dedupe_items_by_id( array_merge( $lead_pages, $early_retrieved ) );
		}

		$phase_a = Neo_Pulse_Wp_Chat_Agents::synthesize_classification_from_retrieve( $message, $early_retrieved );

		$prefetch_key = wp_generate_password( 32, false, false );
		set_transient(
			self::PREFETCH_TRANSIENT_PREFIX . $prefetch_key,
			array(
				'message'         => $message,
				'history_hash'    => self::prefetch_history_hash( $history ),
				'ack'             => $gate,
				'early_retrieved' => $early_retrieved,
				'phase_a'         => $phase_a,
			),
			self::PREFETCH_TTL
		);

		wp_send_json_success(
			array(
				'message'      => $message,
				'prefetch_key' => $prefetch_key,
				'ack'          => array(
					'action' => isset( $gate['action'] ) ? (string) $gate['action'] : 'continue',
					'text'   => isset( $gate['text'] ) ? (string) $gate['text'] : '',
				),
			)
		);
	}

	/**
	 * AJAX fast ack prefetch: secretary ack only (no RAG) while the visitor types.
	 */
	public static function ajax_chat_ack_prefetch(): void {
		self::verify_chat_ajax_request();

		if ( ! self::passes_chat_access_gates() ) {
			wp_send_json_error( array( 'message' => 'Chat unavailable.' ), 403 );
		}

		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$raw_body = file_get_contents( 'php://input' );
		$body     = json_decode( $raw_body, true );
		$message  = isset( $body['message'] ) ? sanitize_textarea_field( wp_unslash( $body['message'] ) ) : '';
		$history  = isset( $body['history'] ) && is_array( $body['history'] ) ? $body['history'] : array();

		if ( trim( $message ) === '' ) {
			wp_send_json_error( array( 'message' => 'Empty message.' ), 400 );
		}

		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'chat_prefetch', self::PREFETCH_RATE_MAX, self::RATE_WINDOW ) ) {
			wp_send_json_error( array( 'message' => 'Too many requests.' ), 429 );
		}

		$history  = Neo_Pulse_Wp_Chat_History::for_visitor( Neo_Pulse_Wp_Chat_History::normalize( $history ) );
		$settings = self::get_settings();
		$site_name = get_bloginfo( 'name' );
		$training = array(
			'assistant_name' => self::assistant_name_for_request( $body ?? null, $settings ),
			'system_prompt'  => $settings['system_prompt'],
			'greeting_style' => $settings['greeting_style'],
			'knowledge_base' => $settings['knowledge_base'],
		);

		$gate = Neo_Pulse_Wp_Chat_Agents::phase_ack( $message, $site_name, $training, $history, $settings );
		if ( is_wp_error( $gate ) ) {
			wp_send_json_error( array( 'message' => self::visitor_error_text() ), 500 );
		}

		wp_send_json_success(
			array(
				'message' => $message,
				'ack'     => array(
					'action' => isset( $gate['action'] ) ? (string) $gate['action'] : 'continue',
					'text'   => isset( $gate['text'] ) ? (string) $gate['text'] : '',
				),
			)
		);
	}

	/**
	 * AJAX full response prefetch for conversation starters and follow-up chips.
	 */
	public static function ajax_chat_response_prefetch(): void {
		self::verify_chat_ajax_request();

		if ( ! self::passes_chat_access_gates() ) {
			wp_send_json_error( array( 'message' => 'Chat unavailable.' ), 403 );
		}

		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$raw_body = file_get_contents( 'php://input' );
		$body     = json_decode( $raw_body, true );
		$message  = isset( $body['message'] ) ? sanitize_textarea_field( wp_unslash( $body['message'] ) ) : '';
		$history  = isset( $body['history'] ) && is_array( $body['history'] ) ? $body['history'] : array();

		if ( trim( $message ) === '' ) {
			wp_send_json_error( array( 'message' => 'Empty message.' ), 400 );
		}

		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'chat_prefetch', self::PREFETCH_RATE_MAX, self::RATE_WINDOW ) ) {
			wp_send_json_error( array( 'message' => 'Too many requests.' ), 429 );
		}

		$history  = Neo_Pulse_Wp_Chat_History::for_visitor( Neo_Pulse_Wp_Chat_History::normalize( $history ) );
		$settings = self::get_settings();
		$page_context = self::parse_page_context_from_body( is_array( $body ) ? $body : null, $settings );
		$training = array(
			'assistant_name' => self::assistant_name_for_request( $body ?? null, $settings ),
			'system_prompt'  => $settings['system_prompt'],
			'greeting_style' => $settings['greeting_style'],
			'knowledge_base' => $settings['knowledge_base'],
		);

		$result = self::execute_chat_pipeline( $message, $history, $settings, $training, null, $page_context );
		if ( is_wp_error( $result ) ) {
			wp_send_json_error( array( 'message' => self::visitor_error_text() ), 500 );
		}

		$gate = $result['gate'];
		$prefetch_key = wp_generate_password( 32, false, false );
		$prefetch_payload = array(
			'message'         => $message,
			'history_hash'    => self::prefetch_history_hash( $history ),
			'ack'             => $gate,
			'card'            => $result['card'],
			'answer'          => isset( $result['answer'] ) ? (string) $result['answer'] : '',
			'early_retrieved' => $result['early_retrieved'],
			'phase_a'         => $result['phase_a'],
		);
		if ( ! empty( $result['template_intent'] ) ) {
			$prefetch_payload['template_intent'] = (string) $result['template_intent'];
		}
		set_transient(
			self::PREFETCH_TRANSIENT_PREFIX . $prefetch_key,
			$prefetch_payload,
			self::RESPONSE_PREFETCH_TTL
		);

		wp_send_json_success(
			array(
				'message'      => $message,
				'prefetch_key' => $prefetch_key,
				'ready'        => true,
				'ack'          => array(
					'action' => isset( $gate['action'] ) ? (string) $gate['action'] : 'continue',
					'text'   => isset( $gate['text'] ) ? (string) $gate['text'] : '',
				),
			)
		);
	}

	/**
	 * Stream a fully prefetched card (starters / follow-up chips).
	 *
	 * @param array<string,mixed>              $prefetched
	 * @param array<string,mixed>              $log_meta
	 * @param array<string,mixed>              $settings
	 */
	private static function stream_prefetched_card(
		string $message,
		array $prefetched,
		array $log_meta,
		array $settings,
		array $history,
		?array $page_context = null
	): void {
		$gate = isset( $prefetched['ack'] ) && is_array( $prefetched['ack'] )
			? $prefetched['ack']
			: array(
				'action' => 'continue',
				'text'   => '',
			);

		if ( trim( (string) ( $gate['text'] ?? '' ) ) !== '' ) {
			self::stream_line( array( 'status' => 'ack', 'text' => trim( (string) $gate['text'] ) ) );
		}

		Neo_Pulse_Wp_Chat_Logs::log_user_message( $message, self::enrich_log_meta_for_message( $log_meta, $message, $page_context, $settings ) );

		$phase_c = isset( $prefetched['card'] ) && is_array( $prefetched['card'] ) ? $prefetched['card'] : array();
		if ( is_array( $phase_c ) && ! empty( $phase_c ) ) {
			$message_uid = Neo_Pulse_Wp_Chat_Logs::log_assistant_card( $phase_c, $log_meta );
			if ( $message_uid !== '' ) {
				$phase_c['message_uid'] = $message_uid;
			}
		}

		$done_payload = array(
			'status'     => 'done',
			'card'       => $phase_c,
			'prefetched' => true,
		);
		if ( ! empty( $prefetched['template_intent'] ) ) {
			$done_payload['template_intent'] = (string) $prefetched['template_intent'];
		}

		if (
			isset( $log_meta['source'] )
			&& $log_meta['source'] === 'demo'
			&& current_user_can( 'manage_options' )
			&& ! empty( $prefetched['phase_a'] )
			&& is_array( $prefetched['phase_a'] )
		) {
			$site_index     = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
			$enriched_items = isset( $prefetched['early_retrieved'] ) && is_array( $prefetched['early_retrieved'] )
				? $prefetched['early_retrieved']
				: array();
			$done_payload['debug'] = self::build_demo_debug_payload(
				$message,
				$prefetched['phase_a'],
				$enriched_items,
				$site_index,
				$settings
			);
		}

		self::stream_line( $done_payload );

		$site_index     = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		$enriched_items = isset( $prefetched['early_retrieved'] ) && is_array( $prefetched['early_retrieved'] )
			? $prefetched['early_retrieved']
			: array();
		$answer = isset( $prefetched['answer'] ) ? (string) $prefetched['answer'] : (string) ( $phase_c['body'] ?? '' );

		self::stream_followup_chips(
			$message,
			is_array( $phase_c ) ? $phase_c : array(),
			$answer,
			$enriched_items,
			$site_index,
			$history,
			$page_context
		);
	}

	/**
	 * Full chat pipeline (no streaming). Used for response prefetch.
	 *
	 * @param array<int,array<string,mixed>>   $history
	 * @param array<string,mixed>              $settings
	 * @param array<string,mixed>              $training
	 * @param array<string,mixed>|null         $prefetched
	 * @return array{
	 *   gate:array<string,mixed>,
	 *   card:array<string,mixed>,
	 *   phase_a:array<string,mixed>|null,
	 *   early_retrieved:array<int,array<string,mixed>>
	 * }|WP_Error
	 */
	private static function execute_chat_pipeline(
		string $message,
		array $history,
		array $settings,
		array $training,
		?array $prefetched = null,
		?array $page_context = null
	) {
		$site_name = get_bloginfo( 'name' );

		$gate = is_array( $prefetched ) && isset( $prefetched['ack'] ) && is_array( $prefetched['ack'] )
			? $prefetched['ack']
			: Neo_Pulse_Wp_Chat_Agents::phase_ack( $message, $site_name, $training, $history, $settings );
		if ( is_wp_error( $gate ) ) {
			return $gate;
		}

		if ( is_array( $gate ) && ( $gate['action'] ?? '' ) === 'deny' ) {
			$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
			$denial     = Neo_Pulse_Wp_Chat_Agents::build_denial_card(
				(string) ( $gate['text'] ?? '' ),
				$message,
				$site_name,
				$site_index,
				$history
			);

			return array(
				'gate'            => $gate,
				'card'            => $denial,
				'phase_a'         => null,
				'early_retrieved' => array(),
			);
		}

		$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		$intent     = Neo_Pulse_Wp_Chat_Suggestion_Templates::match_intent( $message, $page_context, $site_index );
		if ( is_array( $intent ) ) {
			$card = Neo_Pulse_Wp_Chat_Suggestion_Templates::build_card( $intent, $page_context, $site_index, $settings, $message );
			if ( is_array( $card ) && ! empty( $card ) ) {
				return array(
					'gate'            => $gate,
					'card'            => $card,
					'answer'          => (string) ( $card['body'] ?? '' ),
					'phase_a'         => null,
					'early_retrieved' => array(),
					'template_intent' => (string) ( $intent['intent'] ?? '' ),
				);
			}
		}

		if ( is_array( $prefetched ) && ! empty( $prefetched['early_retrieved'] ) && is_array( $prefetched['early_retrieved'] ) ) {
			$early_retrieved = $prefetched['early_retrieved'];
		} else {
			$early_retrieved = self::retrieve_early_items( $message, $settings, $page_context );
		}
		if ( Neo_Pulse_Wp_Chat_Links::resolve_lead_action( $message, $site_index ) ) {
			$lead_pages      = Neo_Pulse_Wp_Chat_Links::find_lead_pages( $message, $site_index, 2 );
			$early_retrieved = Neo_Pulse_Wp_Chat_Links::dedupe_items_by_id( array_merge( $lead_pages, $early_retrieved ) );
		}

		$phase_a = null;
		if ( is_array( $prefetched ) && ! empty( $prefetched['phase_a'] ) && is_array( $prefetched['phase_a'] ) ) {
			$phase_a = $prefetched['phase_a'];
		}
		if ( null === $phase_a ) {
			$phase_a = Neo_Pulse_Wp_Chat_Agents::synthesize_classification_from_retrieve( $message, $early_retrieved );
		}
		if ( null === $phase_a ) {
			$narrow  = Neo_Pulse_Wp_Chat_Agents::build_narrow_candidate_items( $site_index, $message, $early_retrieved, $settings );
			$phase_a = Neo_Pulse_Wp_Chat_Agents::phase_classify( $message, $site_name, $site_index, $narrow );
		}
		if ( is_wp_error( $phase_a ) ) {
			return $phase_a;
		}

		$relevant_items = Neo_Pulse_Wp_Chat_Agents::select_relevant_items( $phase_a, $site_index, $message, $settings, $page_context );
		$enriched_items = self::enrich_relevant_items( $relevant_items, false, $settings );

		$phase_b = Neo_Pulse_Wp_Chat_Agents::phase_reason( $message, $history, $site_name, $enriched_items, $phase_a, $training, $site_index, $page_context );
		if ( is_wp_error( $phase_b ) ) {
			return $phase_b;
		}

		$phase_c = Neo_Pulse_Wp_Chat_Agents::build_card_from_answer( $phase_b, $phase_a, $enriched_items, $message, $site_index, $history );

		if ( Neo_Pulse_Wp_Chat_Lead::is_lead_message( $message, $site_index ) && Neo_Pulse_Wp_Chat_Lead::is_enabled( $settings ) ) {
			$phase_c = Neo_Pulse_Wp_Chat_Lead::enrich_card( $phase_c, $message, $phase_b, $enriched_items, $site_index, $training, $settings );
		}

		if ( is_array( $phase_c ) ) {
			$phase_c = Neo_Pulse_Wp_Chat_Lead::maybe_attach_contact_human_cta( $phase_c, $message, $phase_a, $settings );
		}

		return array(
			'gate'            => $gate,
			'card'            => is_array( $phase_c ) ? $phase_c : array(),
			'answer'          => $phase_b,
			'phase_a'         => $phase_a,
			'early_retrieved' => $enriched_items,
		);
	}

	/**
	 * AJAX warm current-page context for URL-aware chat.
	 */
	public static function ajax_chat_page_context(): void {
		self::verify_chat_ajax_request();

		if ( ! self::passes_chat_access_gates() ) {
			wp_send_json_error( array( 'message' => 'Chat unavailable.' ), 403 );
		}

		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$raw_body = file_get_contents( 'php://input' );
		$body     = json_decode( $raw_body, true );
		$page_url = isset( $body['page_url'] ) ? esc_url_raw( (string) $body['page_url'] ) : '';
		$post_id  = isset( $body['post_id'] ) ? (int) $body['post_id'] : 0;
		$page_title = isset( $body['page_title'] ) ? sanitize_text_field( wp_unslash( (string) $body['page_title'] ) ) : '';

		if ( $page_url === '' && $post_id < 1 ) {
			wp_send_json_error( array( 'message' => 'Missing page URL.' ), 400 );
		}

		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'chat_prefetch', self::PREFETCH_RATE_MAX, self::RATE_WINDOW ) ) {
			wp_send_json_error( array( 'message' => 'Too many requests.' ), 429 );
		}

		$settings = self::get_settings();
		$result   = Neo_Pulse_Wp_Chat_Page_Context::warm_and_store( $page_url, $post_id, $page_title, $settings );
		wp_send_json_success( $result );
	}

	/**
	 * @param array<string,mixed>|null $body
	 * @param array<string,mixed>      $settings
	 * @return array<string,mixed>|null
	 */
	private static function parse_page_context_from_body( ?array $body, array $settings ): ?array {
		if ( ! is_array( $body ) ) {
			return null;
		}

		$page_url = isset( $body['page_url'] ) ? esc_url_raw( (string) $body['page_url'] ) : '';
		$post_id  = isset( $body['post_id'] ) ? (int) $body['post_id'] : 0;
		$page_title = isset( $body['page_title'] ) ? sanitize_text_field( wp_unslash( (string) $body['page_title'] ) ) : '';
		$key = isset( $body['page_context_key'] ) ? sanitize_text_field( wp_unslash( (string) $body['page_context_key'] ) ) : '';

		if ( $page_url === '' && $post_id < 1 && $key === '' ) {
			return null;
		}

		return Neo_Pulse_Wp_Chat_Page_Context::load( $key, $page_url, $post_id, $page_title, $settings );
	}

	/**
	 * Nonce check for the read-only chat ajax actions (stream, prefetch, page context).
	 * Logged-in users must send a valid nonce. Guests are not required to: full-page caches
	 * serve them stale nonces, and these actions are protected by the per-IP rate limit.
	 */
	private static function verify_chat_ajax_request(): void {
		if ( ! is_user_logged_in() ) {
			return;
		}
		check_ajax_referer( 'neo_pulse_chat_stream', '_nonce' );
	}

	/**
	 * Text shown to visitors when an AI call fails (provider error bodies stay server-side).
	 */
	private static function visitor_error_text(): string {
		return Neo_Pulse_Wp_OpenRouter::generic_error_message() . ' ' . __( 'Please try again in a moment.', 'neo-pulse-wp' );
	}

	/**
	 * Card streamed when a visitor sends too many messages.
	 *
	 * @return array<string,string>
	 */
	private static function rate_limited_card(): array {
		return array(
			'type'       => 'not-found',
			'title'      => __( 'Please slow down', 'neo-pulse-wp' ),
			'body'       => __( 'You have sent a lot of messages in a short time. Please wait a few minutes and try again.', 'neo-pulse-wp' ),
			'confidence' => 'low',
		);
	}

	/**
	 * Shared enabled / visitor / API-key gates for stream + prefetch.
	 */
	private static function passes_chat_access_gates(): bool {
		if ( ! self::can_use_chat_api() ) {
			return false;
		}
		if ( Neo_Pulse_Wp_OpenRouter::get_api_key() === '' ) {
			return false;
		}
		return true;
	}

	/**
	 * @param array<int,array<string,mixed>> $history
	 */
	private static function prefetch_history_hash( array $history ): string {
		return md5( wp_json_encode( array_slice( $history, -10 ) ) );
	}

	/**
	 * @param array<string,mixed>              $settings
	 * @param array<string,mixed>|null         $page_context
	 * @return array<int,array<string,mixed>>
	 */
	private static function retrieve_early_items( string $message, array $settings, ?array $page_context = null ): array {
		$items = Neo_Pulse_Wp_Chat_Rag::retrieve( $message, Neo_Pulse_Wp_Chat_Rag::MAX_RESULTS, $settings );
		$items = Neo_Pulse_Wp_Chat_Rag::merge_blog_discovery_items( $message, $items, $settings );
		return Neo_Pulse_Wp_Chat_Page_Context::merge_into_items( $items, $page_context, $message );
	}

	/**
	 * @param array<int,array<string,mixed>> $history
	 * @return array<string,mixed>|null
	 */
	private static function load_prefetch_payload( string $prefetch_key, string $message, array $history ): ?array {
		$prefetch_key = trim( $prefetch_key );
		if ( $prefetch_key === '' ) {
			return null;
		}

		$stored = get_transient( self::PREFETCH_TRANSIENT_PREFIX . $prefetch_key );
		if ( ! is_array( $stored ) ) {
			return null;
		}

		if ( (string) ( $stored['message'] ?? '' ) !== $message ) {
			return null;
		}

		if ( (string) ( $stored['history_hash'] ?? '' ) !== self::prefetch_history_hash( $history ) ) {
			return null;
		}

		delete_transient( self::PREFETCH_TRANSIENT_PREFIX . $prefetch_key );

		return $stored;
	}

	/**
	 * Demo-only RAG debug snapshot (no full post bodies).
	 *
	 * @param array<string,mixed>              $phase_a
	 * @param array<int,array<string,mixed>>   $enriched_items
	 * @param array<int,array<string,mixed>>   $site_index
	 * @return array<string,mixed>
	 */
	private static function build_demo_debug_payload( string $user_message, array $phase_a, array $enriched_items, array $site_index, array $settings = array() ): array {
		$extra_phrases = isset( $phase_a['search_terms'] ) ? array_values( (array) $phase_a['search_terms'] ) : array();
		$match_terms   = Neo_Pulse_Wp_Chat_Rag::extract_match_terms( $user_message, $extra_phrases );

		$retrieved = array();
		foreach ( $enriched_items as $item ) {
			$retrieved[] = array(
				'id'             => isset( $item['id'] ) ? (int) $item['id'] : 0,
				'title'          => isset( $item['title'] ) ? (string) $item['title'] : '',
				'url'            => isset( $item['url'] ) ? (string) $item['url'] : '',
				'slug'           => isset( $item['slug'] ) ? (string) $item['slug'] : '',
				'type'           => isset( $item['type'] ) ? (string) $item['type'] : '',
				'score'          => Neo_Pulse_Wp_Chat_Rag::fuzzy_page_score( $user_message, $item, $extra_phrases ),
				'slug_term_hits' => Neo_Pulse_Wp_Chat_Rag::count_slug_path_term_hits( $user_message, $item, $extra_phrases ),
				'excerpt_length' => isset( $item['excerpt'] ) ? strlen( (string) $item['excerpt'] ) : 0,
			);
		}

		$primary    = Neo_Pulse_Wp_Chat_Links::pick_primary_topic_link( $user_message, $enriched_items, $site_index, $extra_phrases );
		$topics     = Neo_Pulse_Wp_Chat_Links::pick_topic_links( $user_message, $enriched_items, 3, $site_index, true, $extra_phrases );
		$fuzzy_top  = Neo_Pulse_Wp_Chat_Rag::find_fuzzy_topic_pages( $user_message, $site_index, 5, $extra_phrases );
		$url_hits   = Neo_Pulse_Wp_Chat_Rag::index_url_term_hits( $user_message, $site_index, $extra_phrases );
		$type_counts = array();
		foreach ( $site_index as $item ) {
			$t = isset( $item['type'] ) ? (string) $item['type'] : 'unknown';
			$type_counts[ $t ] = ( $type_counts[ $t ] ?? 0 ) + 1;
		}

		return array(
			'timestamp'              => gmdate( 'c' ),
			'user_message'           => $user_message,
			'match_terms'            => array_values( $match_terms ),
			'index_count'            => count( $site_index ),
			'index_source'           => array(
				'source'     => 'sitemap',
				'post_types' => Neo_Pulse_Wp_Chat_Rag::get_index_post_types( $settings ),
				'type_counts' => $type_counts,
			),
			'phase_a'                => array(
				'intent'       => isset( $phase_a['intent'] ) ? (string) $phase_a['intent'] : '',
				'relevant_ids' => isset( $phase_a['relevant_ids'] ) ? array_map( 'intval', (array) $phase_a['relevant_ids'] ) : array(),
				'search_terms' => $extra_phrases,
			),
			'retrieved_items'        => $retrieved,
			'url_term_hits'          => $url_hits,
			'fuzzy_top_5'            => array_map(
				function ( $item ) {
					return array(
						'id'    => isset( $item['id'] ) ? (int) $item['id'] : 0,
						'title' => isset( $item['title'] ) ? (string) $item['title'] : '',
						'slug'  => isset( $item['slug'] ) ? (string) $item['slug'] : '',
						'url'   => isset( $item['url'] ) ? (string) $item['url'] : '',
						'score' => isset( $item['fuzzy_score'] ) ? (float) $item['fuzzy_score'] : 0,
					);
				},
				$fuzzy_top
			),
			'topic_link_primary'     => null !== $primary ? array(
				'label' => $primary['label'],
				'url'   => $primary['url'],
				'score' => isset( $primary['score'] ) ? (float) $primary['score'] : 0,
			) : null,
			'topic_links'            => array_map(
				function ( $link ) {
					return array(
						'label' => $link['label'],
						'url'   => $link['url'],
						'score' => isset( $link['score'] ) ? (float) $link['score'] : 0,
					);
				},
				$topics
			),
			'enriched_excerpt_lengths' => array_map(
				function ( $item ) {
					return isset( $item['excerpt'] ) ? strlen( (string) $item['excerpt'] ) : 0;
				},
				$enriched_items
			),
		);
	}

	/**
	 * Open an unbuffered NDJSON stream response.
	 */
	public static function stream_begin(): void {
		self::begin_stream_response();
	}

	/**
	 * Flush a single NDJSON line to the output stream.
	 *
	 * @param array $data JSON-serialisable payload.
	 */
	public static function stream_emit( array $data ): void {
		self::stream_line( $data );
	}

	/**
	 * Open an unbuffered NDJSON stream response.
	 */
	private static function begin_stream_response(): void {
		if ( headers_sent() ) {
			return;
		}
		header( 'Content-Type: text/plain; charset=utf-8' );
		header( 'Cache-Control: no-cache' );
		header( 'X-Accel-Buffering: no' );
		if ( function_exists( 'apache_setenv' ) ) {
			apache_setenv( 'no-gzip', '1' ); // @codeCoverageIgnore
		}
		while ( ob_get_level() ) {
			ob_end_flush();
		}
	}

	/**
	 * Flush a single NDJSON line to the output stream.
	 *
	 * @param array $data JSON-serialisable payload.
	 */
	private static function stream_line( array $data ): void {
		if ( isset( $data['card'] ) && is_array( $data['card'] ) ) {
			$data['card'] = Neo_Pulse_Wp_Display_Text::decode_card( $data['card'] );
		}
		echo wp_json_encode( $data ) . "\n";
		if ( ob_get_level() ) {
			ob_flush();
		}
		flush();
	}

	/**
	 * Fetch rendered post content for all relevant items before Phase B.
	 *
	 * @param array $items               Relevant items from select_relevant_items().
	 * @param bool  $emit_reading_events Stream NDJSON reading events when true.
	 * @param array $settings            Chat settings (unused; kept for call-site compat).
	 * @return array Items with excerpt replaced by full page content for reasoning.
	 */
	public static function enrich_relevant_items( array $items, bool $emit_reading_events = false, array $settings = array() ): array {
		if ( empty( $items ) ) {
			return $items;
		}

		$items = array_slice( $items, 0, Neo_Pulse_Wp_Chat_Rag::ENRICH_MAX );

		if ( $emit_reading_events ) {
			self::stream_line(
				array(
					'status' => 'reading',
					'label'  => 'Reading matched pages…',
				)
			);
		}

		foreach ( $items as $i => $item ) {
			$post = get_post( $item['id'] );
			if ( ! $post || $post->post_status !== 'publish' ) {
				continue;
			}

			if ( $emit_reading_events ) {
				self::stream_line(
					array(
						'status' => 'reading',
						'label'  => 'Reading ' . $item['title'] . '…',
					)
				);
			}

			$full = Neo_Pulse_Wp_Chat_Rag::read_post_body_for_chat( $post->ID );
			if ( $full !== '' ) {
				$items[ $i ]['excerpt'] = $full;
			}
		}

		return $items;
	}

	/**
	 * Resolve input_origin for chat log rows (client hint + template intents).
	 *
	 * @param array<string,mixed>      $log_meta
	 * @param array<string,mixed>|null $page_context
	 * @param array<string,mixed>      $settings
	 * @return array<string,mixed>
	 */
	private static function enrich_log_meta_for_message( array $log_meta, string $message, ?array $page_context, array $settings ): array {
		$origin = isset( $log_meta['input_origin'] )
			? Neo_Pulse_Wp_Chat_Logs::sanitize_input_origin( (string) $log_meta['input_origin'] )
			: 'typed';

		$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		if ( Neo_Pulse_Wp_Chat_Suggestion_Templates::match_intent( $message, $page_context, $site_index ) !== null ) {
			$origin = 'template';
		}

		$log_meta['input_origin'] = $origin;
		return $log_meta;
	}
}
