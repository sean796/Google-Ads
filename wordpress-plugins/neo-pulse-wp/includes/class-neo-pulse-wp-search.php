<?php
/**
 * AI-powered search: settings, shortcode, REST endpoint, and ranking.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Search {

	const OPTION_KEY = 'neo_pulse_wp_search_settings';

	const DEFAULT_OPENROUTER_MODEL = 'deepseek/deepseek-v4.1-flash';

	const SETTINGS_MIGRATION_KEY = 'neo_pulse_wp_search_settings_migrated_v2';

	const REST_NAMESPACE = 'neo-pulse/v1';

	/** Per-IP sliding limit (editors exempt): searches per minute. Over it the search is refused. */
	const RATE_LIMIT_MAX = 30;

	const RATE_LIMIT_WINDOW = 60;

	/** Per-IP AI searches per day (editors exempt). Over it the visitor still gets plain search results. */
	const RATE_LIMIT_DAY_MAX = 100;

	/** Longest search sent anywhere (characters); longer input is cut. */
	const MAX_QUERY_LENGTH = 100;

	/** Default site-wide AI searches per day; over it every search runs without AI until midnight. */
	const DEFAULT_DAILY_AI_CAP = 500;

	/** Today's AI search count: array{day:string,count:int}. */
	const AI_USAGE_OPTION = 'neo_pulse_wp_search_ai_usage';

	/** Search log / accept writes per IP per 5 minutes. */
	const LOG_RATE_LIMIT_MAX = 60;

	const LOG_RATE_LIMIT_WINDOW = 300;

	/** AI query analysis is cached per normalised query (a cached answer costs nothing and ignores the caps). */
	const AI_CACHE_TTL = DAY_IN_SECONDS;

	/** @var array<string,mixed>|null */
	private static ?array $settings_cache = null;

	// ── Settings CRUD ────────────────────────────────────────────

	/**
	 * @return array<string,mixed>
	 */
	public static function get_search_settings(): array {
		if ( self::$settings_cache !== null ) {
			return self::$settings_cache;
		}

		$defaults = array(
			'placeholder'         => 'Search this site…',
			'max_results'         => 8,
			'post_types'          => array( 'post', 'page' ),
			'content_type_labels' => array(
				'post' => 'Blogs',
			),
			'button_label'        => 'Search',
			'openrouter_model'    => self::DEFAULT_OPENROUTER_MODEL,
			// Site-wide AI searches per day (0 = search never uses AI).
			'daily_ai_cap'        => self::DEFAULT_DAILY_AI_CAP,
			// Popular searches: always shown first / never shown (one search per entry).
			'pinned_terms'        => array(),
			'hidden_terms'        => array(),
			// Result order by content type: post type => 1 (first) … 9 (last). Missing types use
			// type_priority_default(): pages first, blog posts last, everything else in between.
			'type_priority'       => array(),
			// balanced: the order is a strong lean, a near-exact match can still rise above it.
			// strict: every result of a higher type shows before any of a lower one.
			'priority_mode'       => 'balanced',
			// Leave out pages search engines are told to skip (noindex, redirected, other canonical).
			'indexable_only'      => true,
		);

		$saved = get_option( self::OPTION_KEY, array() );
		self::$settings_cache = wp_parse_args( is_array( $saved ) ? $saved : array(), $defaults );
		if ( ! is_array( self::$settings_cache['content_type_labels'] ) ) {
			self::$settings_cache['content_type_labels'] = $defaults['content_type_labels'];
		}

		return self::$settings_cache;
	}

	/**
	 * OpenRouter model for AI search (query intent, popular terms). Does not affect chat or editor wands.
	 *
	 * @return string
	 */
	public static function get_openrouter_model(): string {
		$settings = self::get_search_settings();
		$model    = isset( $settings['openrouter_model'] ) ? trim( (string) $settings['openrouter_model'] ) : '';
		if ( $model !== '' ) {
			return $model;
		}
		if ( defined( 'NEO_PULSE_WP_SEARCH_OPENROUTER_MODEL' ) && NEO_PULSE_WP_SEARCH_OPENROUTER_MODEL !== '' ) {
			return trim( (string) NEO_PULSE_WP_SEARCH_OPENROUTER_MODEL );
		}
		return Neo_Pulse_Wp_OpenRouter::get_model();
	}

	/**
	 * @param array<string,mixed> $data Settings to merge.
	 */
	public static function save_search_settings( array $data ): void {
		$current = self::get_search_settings();
		$merged  = wp_parse_args( $data, $current );

		$merged['placeholder']   = sanitize_text_field( (string) $merged['placeholder'] );
		$merged['button_label']  = sanitize_text_field( (string) $merged['button_label'] );
		$merged['max_results']   = max( 1, min( 20, (int) $merged['max_results'] ) );
		$merged['daily_ai_cap']  = max( 0, min( 100000, (int) $merged['daily_ai_cap'] ) );
		// The old Appearance tab's colour and size keys are no longer used (the widget styles search),
		// and the automatic front-page hero search was removed.
		unset( $merged['primary_color'], $merged['bg_color'], $merged['border_radius'], $merged['font_size'], $merged['auto_front_page'] );

		if ( ! is_array( $merged['post_types'] ) ) {
			$merged['post_types'] = array( 'post', 'page' );
		}
		$merged['post_types'] = array_values( array_filter(
			array_map( 'sanitize_key', $merged['post_types'] )
		) );
		if ( empty( $merged['post_types'] ) ) {
			$merged['post_types'] = array( 'post', 'page' );
		}

		$labels = array();
		if ( isset( $merged['content_type_labels'] ) && is_array( $merged['content_type_labels'] ) ) {
			foreach ( $merged['content_type_labels'] as $slug => $label ) {
				$key = sanitize_key( (string) $slug );
				$text = sanitize_text_field( (string) $label );
				if ( $key !== '' && $text !== '' ) {
					$labels[ $key ] = $text;
				}
			}
		}
		$merged['content_type_labels'] = $labels;

		if ( array_key_exists( 'openrouter_model', $data ) ) {
			$merged['openrouter_model'] = sanitize_text_field( trim( (string) $data['openrouter_model'] ) );
		}

		$priority = array();
		if ( isset( $merged['type_priority'] ) && is_array( $merged['type_priority'] ) ) {
			foreach ( $merged['type_priority'] as $type => $rank ) {
				$key = sanitize_key( (string) $type );
				if ( $key !== '' && is_numeric( $rank ) ) {
					$priority[ $key ] = max( 1, min( 9, (int) $rank ) );
				}
			}
		}
		$merged['type_priority']  = $priority;
		$merged['priority_mode']  = 'strict' === ( $merged['priority_mode'] ?? '' ) ? 'strict' : 'balanced';
		$merged['indexable_only'] = ! empty( $merged['indexable_only'] );

		$merged['pinned_terms'] = Neo_Pulse_Wp_Search_Popular::sanitize_list( $merged['pinned_terms'] ?? array(), Neo_Pulse_Wp_Search_Popular::MAX_PINNED );
		$merged['hidden_terms'] = Neo_Pulse_Wp_Search_Popular::sanitize_list( $merged['hidden_terms'] ?? array(), Neo_Pulse_Wp_Search_Popular::MAX_HIDDEN );

		update_option( self::OPTION_KEY, $merged, false );
		self::$settings_cache = $merged;
		self::purge_public_caches();
	}

	/**
	 * @param bool $purge Purge public caches. Pass false when save_search_settings() runs right after (it purges).
	 */
	public static function reset_search_settings( bool $purge = true ): void {
		delete_option( self::OPTION_KEY );
		self::$settings_cache = null;
		if ( $purge ) {
			self::purge_public_caches();
		}
	}

	/**
	 * Built-in label overrides (e.g. post → Blogs).
	 *
	 * @return array<string,string>
	 */
	public static function default_content_type_labels(): array {
		return array(
			'post' => 'Blogs',
		);
	}

	/**
	 * Fallback label when no custom name is saved.
	 */
	public static function default_content_type_label( string $post_type ): string {
		$builtins = self::default_content_type_labels();
		if ( isset( $builtins[ $post_type ] ) ) {
			return $builtins[ $post_type ];
		}
		$obj = get_post_type_object( $post_type );
		if ( $obj && ! empty( $obj->labels->singular_name ) ) {
			return (string) $obj->labels->singular_name;
		}
		return ucwords( str_replace( array( '-', '_' ), ' ', $post_type ) );
	}

	/**
	 * Display label for a result content type (search dropdown).
	 */
	public static function content_type_label( string $post_type ): string {
		$settings = self::get_search_settings();
		$labels   = isset( $settings['content_type_labels'] ) && is_array( $settings['content_type_labels'] )
			? $settings['content_type_labels']
			: array();
		if ( ! empty( $labels[ $post_type ] ) ) {
			return (string) $labels[ $post_type ];
		}
		return self::default_content_type_label( $post_type );
	}

	// ── Bootstrap ────────────────────────────────────────────────

	public static function init(): void {
		add_shortcode( 'neo-pulse_search', array( __CLASS__, 'render_shortcode' ) );
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
		add_action( 'plugins_loaded', array( __CLASS__, 'maybe_migrate_settings' ), 30 );
		add_action( 'init', array( __CLASS__, 'register_search_assets' ), 5 );
		add_action( 'wp_enqueue_scripts', array( __CLASS__, 'register_search_assets' ) );

		require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/search/integrations/class-neo-pulse-wp-search-elementor.php';
		Neo_Pulse_Wp_Search_Elementor::init();
	}

	/**
	 * One-time cache purge after the search settings migration.
	 */
	public static function maybe_migrate_settings(): void {
		if ( get_option( self::SETTINGS_MIGRATION_KEY, '' ) === '1' ) {
			return;
		}

		update_option( self::SETTINGS_MIGRATION_KEY, '1', false );
		self::purge_public_caches();
	}

	/**
	 * Flush asset caches so logged-in and guest HTML stay in sync after search changes.
	 */
	public static function purge_public_caches(): void {
		if ( class_exists( 'Neo_Pulse_Wp_Cache_Flush', false ) ) {
			Neo_Pulse_Wp_Cache_Flush::flush_all();
			return;
		}
		if ( function_exists( 'wp_cache_flush' ) ) {
			wp_cache_flush();
		}
	}

	// ── Shortcode ────────────────────────────────────────────────

	/**
	 * @param array<string,string>|string $atts Shortcode attributes.
	 * @return string
	 */
	public static function render_shortcode( $atts = array() ): string {
		$atts = shortcode_atts(
			array(
				'layout' => '',
				'slot'   => '',
			),
			is_array( $atts ) ? $atts : array(),
			'neo-pulse_search'
		);

		return self::render_instance( $atts );
	}

	/**
	 * Render a search instance (shortcode, Elementor widget, or programmatic).
	 *
	 * @param array<string,mixed> $instance Per-instance overrides.
	 * @return string
	 */
	public static function render_instance( array $instance = array() ): string {
		$settings   = self::merge_instance_settings( $instance );
		$sidebar    = Neo_Pulse_Wp_Ai_Widget_Design::resolve_sidebar_config( 'search', $instance );
		$insights   = Neo_Pulse_Wp_Ai_Widget_Design::resolve_search_insights( $instance );
		$options    = Neo_Pulse_Wp_Search_Render::options( $instance, $settings, $sidebar, $insights );
		$rest_url   = rest_url( self::REST_NAMESPACE . '/search' );
		// Logged-out visitors get no REST nonce: search is public, and a nonce baked into a cached
		// page (or a tab left open) expires after 12-24 h, after which WordPress refuses the request.
		$nonce      = is_user_logged_in() ? wp_create_nonce( 'wp_rest' ) : '';

		self::enqueue_search_assets(
			array(
				'display_mode' => $options['mode'] === 'icon' ? 'icon_only' : 'inline',
				'icon_open_as' => $options['open_as'],
			)
		);

		return Neo_Pulse_Wp_Search_Render::render( $options, $rest_url, $nonce );
	}

	/**
	 * Merge global search settings with per-instance overrides.
	 *
	 * @param array<string,mixed> $instance
	 * @return array<string,mixed>
	 */
	private static function merge_instance_settings( array $instance ): array {
		$global    = self::get_search_settings();
		$use_global = ! isset( $instance['use_global_settings'] )
			|| $instance['use_global_settings'] === 'yes'
			|| $instance['use_global_settings'] === true;

		if ( $use_global ) {
			$merged = $global;
		} else {
			$merged = wp_parse_args( $instance, $global );
		}

		$content_keys = array( 'placeholder', 'button_label', 'max_results' );
		foreach ( $content_keys as $key ) {
			if ( isset( $instance[ $key ] ) && $instance[ $key ] !== '' ) {
				$merged[ $key ] = $instance[ $key ];
			}
		}

		// Only content keys are used by the renderer; styling comes from the widget's --nps-* variables.
		$merged['placeholder']  = sanitize_text_field( (string) $merged['placeholder'] );
		$merged['button_label'] = sanitize_text_field( (string) $merged['button_label'] );
		$merged['max_results']  = max( 1, min( 20, (int) $merged['max_results'] ) );

		return $merged;
	}


	/**
	 * Register shared sidebar shell assets.
	 */
	public static function register_sidebar_assets(): void {
		$base_url = plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE );
		$ver      = self::search_asset_version();

		wp_register_style(
			'neo-pulse-ai-sidebar-shell',
			$base_url . 'assets/shared/neo-pulse-ai-sidebar-shell.css',
			array(),
			$ver
		);

		wp_register_script(
			'neo-pulse-ai-sidebar-shell',
			$base_url . 'assets/shared/neo-pulse-ai-sidebar-shell.js',
			array(),
			$ver,
			true
		);

		wp_register_style(
			'neo-pulse-ai-sidebar-unify',
			$base_url . 'assets/shared/neo-pulse-ai-sidebar-unify.css',
			array( 'neo-pulse-ai-sidebar-shell' ),
			$ver
		);

		wp_register_script(
			'neo-pulse-ai-sidebar-unify',
			$base_url . 'assets/shared/neo-pulse-ai-sidebar-unify.js',
			array( 'neo-pulse-ai-sidebar-shell' ),
			$ver,
			true
		);
	}

	/**
	 * Register front-end search assets (for Elementor depends + lazy enqueue).
	 */
	public static function register_search_assets(): void {
		$asset_ver = self::search_asset_version();
		$base_url  = plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE );

		self::register_sidebar_assets();

		wp_register_style(
			'neo-pulse-search',
			$base_url . 'assets/search/neo-pulse-search.css',
			array( 'neo-pulse-ai-sidebar-shell' ),
			$asset_ver
		);

		wp_register_script(
			'neo-pulse-search',
			$base_url . 'assets/search/neo-pulse-search.js',
			array(),
			$asset_ver,
			true
		);
	}

	/**
	 * Enqueue registered search assets.
	 *
	 * @param array<string,mixed> $sidebar Optional sidebar config.
	 */
	public static function enqueue_search_assets( array $sidebar = array() ): void {
		$display_mode = ! empty( $sidebar['display_mode'] ) ? (string) $sidebar['display_mode'] : '';
		$is_sidebar   = $display_mode === 'sidebar';
		$icon_open_as = (string) ( $sidebar['icon_open_as'] ?? 'sidebar_right' );
		$needs_shell  = $is_sidebar || ( $display_mode === 'icon_only' && $icon_open_as !== 'expand_inline' );
		self::register_search_assets();
		if ( $needs_shell ) {
			self::register_sidebar_assets();
			wp_deregister_script( 'neo-pulse-search' );
			wp_register_script(
				'neo-pulse-search',
				plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . 'assets/search/neo-pulse-search.js',
				array( 'neo-pulse-ai-sidebar-shell', 'neo-pulse-ai-sidebar-unify' ),
				self::search_asset_version(),
				true
			);
		}
		wp_enqueue_style( 'neo-pulse-search' );
		if ( $needs_shell ) {
			wp_enqueue_style( 'neo-pulse-ai-sidebar-shell' );
			wp_enqueue_script( 'neo-pulse-ai-sidebar-shell' );
			wp_enqueue_script( 'neo-pulse-ai-sidebar-unify' );
		}
		wp_enqueue_script( 'neo-pulse-search' );
	}

	/**
	 * Cache-bust front-end search assets when files change.
	 */
	public static function search_asset_version(): string {
		$css = NEO_PULSE_WP_PLUGIN_DIR . 'assets/search/neo-pulse-search.css';
		$js  = NEO_PULSE_WP_PLUGIN_DIR . 'assets/search/neo-pulse-search.js';
		$ver = defined( 'NEO_PULSE_WP_VERSION' ) ? NEO_PULSE_WP_VERSION : '1';
		if ( is_readable( $css ) ) {
			$ver .= '.' . (string) filemtime( $css );
		}
		if ( is_readable( $js ) ) {
			$ver .= '.' . (string) filemtime( $js );
		}
		return $ver;
	}

	/**
	 * Admin "try it" demo on the Search screen: a plain search bar with the site settings.
	 * The renderer builds its own wrapper and styles.
	 *
	 * @param string              $rest_url Search REST endpoint.
	 * @param string              $nonce    wp_rest nonce.
	 * @param array<string,mixed> $settings Search settings.
	 * @param array<string,mixed> $instance Widget instance overrides.
	 * @param array<string,mixed> $sidebar  Sidebar config (resolved from $instance when empty).
	 * @param array<string,mixed> $insights Insights config (resolved from $instance when empty).
	 */
	public static function render_search_markup( string $rest_url, string $nonce, array $settings, array $instance = array(), array $sidebar = array(), array $insights = array() ): string {
		$sidebar  = $sidebar ? $sidebar : Neo_Pulse_Wp_Ai_Widget_Design::resolve_sidebar_config( 'search', $instance );
		$insights = $insights ? $insights : Neo_Pulse_Wp_Ai_Widget_Design::resolve_search_insights( $instance );
		$options  = Neo_Pulse_Wp_Search_Render::options( array_merge( array( 'display_mode' => 'inline' ), $instance ), $settings, $sidebar, $insights );
		return Neo_Pulse_Wp_Search_Render::render( $options, $rest_url, $nonce );
	}


	// ── REST API ─────────────────────────────────────────────────

	public static function register_routes(): void {
		register_rest_route(
			self::REST_NAMESPACE,
			'/search',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'handle_search' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'query' => array(
						'required'          => true,
						'type'              => 'string',
						'sanitize_callback' => 'sanitize_text_field',
					),
					'per_page' => array(
						'type'              => 'integer',
						'default'           => 0,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/search/log',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'handle_search_log' ),
				'permission_callback' => '__return_true',
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/search/accept',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'handle_search_accept' ),
				'permission_callback' => '__return_true',
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/search/insights',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'handle_search_insights' ),
				'permission_callback' => '__return_true',
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/search/word-ready',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'handle_search_word_ready' ),
				'permission_callback' => '__return_true',
				'args'                => array(
					'query' => array(
						'required'          => true,
						'type'              => 'string',
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			)
		);
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function handle_search_word_ready( WP_REST_Request $request ): WP_REST_Response {
		// 0.9.253: decided in code, never by AI. The browser now checks locally and only older cached
		// pages still call this endpoint.
		$query_text = self::clamp_query( (string) $request->get_param( 'query' ) );
		return new WP_REST_Response( array( 'ready' => $query_text !== '' && self::local_word_ready( $query_text ) ), 200 );
	}

	/**
	 * Trim a search and cut it to MAX_QUERY_LENGTH characters.
	 */
	public static function clamp_query( string $query ): string {
		$query = trim( $query );
		if ( function_exists( 'mb_substr' ) ) {
			return trim( mb_substr( $query, 0, self::MAX_QUERY_LENGTH ) );
		}
		return trim( substr( $query, 0, self::MAX_QUERY_LENGTH ) );
	}

	/**
	 * Site-wide AI search cap for today (filterable).
	 */
	public static function daily_ai_cap(): int {
		$settings = self::get_search_settings();
		$cap      = isset( $settings['daily_ai_cap'] ) ? (int) $settings['daily_ai_cap'] : self::DEFAULT_DAILY_AI_CAP;
		/**
		 * Site-wide AI searches allowed per day. 0 turns AI off for search.
		 *
		 * @param int $cap Cap from Search settings.
		 */
		return max( 0, (int) apply_filters( 'neo_pulse_wp_search_daily_ai_cap', $cap ) );
	}

	/**
	 * AI searches used today (site time zone).
	 */
	public static function ai_searches_today(): int {
		$usage = get_option( self::AI_USAGE_OPTION );
		if ( ! is_array( $usage ) || ( $usage['day'] ?? '' ) !== wp_date( 'Y-m-d' ) ) {
			return 0;
		}
		return (int) ( $usage['count'] ?? 0 );
	}

	/**
	 * Count one AI search against today's cap. False when the cap is already reached.
	 */
	private static function take_daily_ai_slot(): bool {
		$cap  = self::daily_ai_cap();
		$used = self::ai_searches_today();
		if ( $used >= $cap ) {
			return false;
		}
		update_option( self::AI_USAGE_OPTION, array( 'day' => wp_date( 'Y-m-d' ), 'count' => $used + 1 ), false );
		return true;
	}

	/**
	 * Licensed site with an OpenRouter key: AI query analysis may run.
	 */
	private static function ai_search_available(): bool {
		return Neo_Pulse_Wp_License::has_ai( false ) && Neo_Pulse_Wp_OpenRouter::get_api_key() !== '';
	}

	/**
	 * Non-AI "has the visitor finished a word?": the input ends in a space or punctuation,
	 * or the last word is at least three characters.
	 */
	private static function local_word_ready( string $query ): bool {
		if ( $query === '' ) {
			return false;
		}
		if ( preg_match( '/[\s\p{P}]$/u', $query ) ) {
			return true;
		}
		$words = preg_split( '/\s+/u', trim( $query ) );
		$last  = is_array( $words ) && ! empty( $words ) ? (string) end( $words ) : '';
		$len   = function_exists( 'mb_strlen' ) ? mb_strlen( $last ) : strlen( $last );
		return $len >= 3;
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_search( WP_REST_Request $request ) {
		$query_text = self::clamp_query( (string) $request->get_param( 'query' ) );
		if ( $query_text === '' ) {
			return new WP_Error( 'neo-pulse_search_empty', 'Query cannot be empty.', array( 'status' => 400 ) );
		}

		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'search', self::RATE_LIMIT_MAX, self::RATE_LIMIT_WINDOW ) ) {
			return new WP_Error( 'neo-pulse_search_rate', 'Too many requests. Please wait a moment.', array( 'status' => 429 ) );
		}

		$settings  = self::get_search_settings();
		$per_page  = (int) $request->get_param( 'per_page' );
		if ( $per_page < 1 || $per_page > 20 ) {
			$per_page = (int) $settings['max_results'];
		}

		$ai_analysis = self::openrouter_analyze( $query_text, self::ai_search_available() );

		$search_terms = self::build_search_queries( $query_text, $ai_analysis );

		$all_results = array();
		$seen_ids    = array();

		foreach ( $search_terms as $term ) {
			$batch = self::wp_query_search( $term, $per_page * 2, $settings['post_types'] );
			foreach ( $batch as $item ) {
				if ( ! isset( $seen_ids[ $item['id'] ] ) ) {
					$seen_ids[ $item['id'] ] = true;
					$all_results[]            = $item;
				}
			}
		}

		$ranked = self::rank_results( $all_results, $ai_analysis, $per_page, $query_text );

		return new WP_REST_Response(
			array(
				'results'  => $ranked,
				'analysis' => array(
					'intent'    => isset( $ai_analysis['intent'] ) ? $ai_analysis['intent'] : 'unknown',
					'sentiment' => isset( $ai_analysis['sentiment'] ) ? $ai_analysis['sentiment'] : 'neutral',
					'keywords'  => isset( $ai_analysis['keywords'] ) ? $ai_analysis['keywords'] : array(),
				),
				'meta'     => array(
					'query' => $query_text,
					'total' => count( $ranked ),
				),
			),
			200
		);
	}

	// ── Build search queries from AI analysis ────────────────────

	/**
	 * Build multiple search queries: the AI keywords first, then the original.
	 *
	 * @param string $original_query
	 * @param array{intent:string,keywords:array<string>,sentiment:string} $ai
	 * @return array<int,string>
	 */
	private static function build_search_queries( string $original_query, array $ai ): array {
		$queries  = array();
		$keywords = isset( $ai['keywords'] ) ? $ai['keywords'] : array();

		if ( ! empty( $keywords ) ) {
			$queries[] = implode( ' ', $keywords );
		}

		$queries[] = $original_query;

		foreach ( $keywords as $kw ) {
			$kw = trim( $kw );
			if ( $kw !== '' && stripos( $original_query, $kw ) === false ) {
				$queries[] = $kw;
			}
		}

		return array_unique( $queries );
	}

	// ── WP_Query search ──────────────────────────────────────────

	/**
	 * @param string        $query
	 * @param int           $limit
	 * @param array<string> $post_types
	 * @return array<int,array<string,mixed>>
	 */
	private static function wp_query_search( string $query, int $limit, array $post_types ): array {
		$args = array(
			's'              => $query,
			'post_type'      => $post_types,
			'post_status'    => 'publish',
			'posts_per_page' => $limit,
			'orderby'        => 'relevance',
			'order'          => 'DESC',
			'no_found_rows'  => true,
		);

		$wp_query = new WP_Query( $args );
		$results  = array();
		$position = 0;

		$indexable_only = ! empty( self::get_search_settings()['indexable_only'] )
			&& class_exists( 'Neo_Pulse_Wp_Seo_Head' )
			&& method_exists( 'Neo_Pulse_Wp_Seo_Head', 'is_indexable_post' );

		foreach ( $wp_query->posts as $post ) {
			// Thank-you pages, noindex pages and pages that redirect or point their canonical elsewhere
			// aren't meant to be landed on, so search leaves them out.
			if ( $indexable_only && ! Neo_Pulse_Wp_Seo_Head::is_indexable_post( $post ) ) {
				continue;
			}
			++$position;
			$results[] = array(
				'id'         => $post->ID,
				'title'      => html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' ),
				'url'        => get_permalink( $post ),
				'slug'       => $post->post_name,
				// Password-protected posts never expose their text in results.
				'excerpt'    => (string) $post->post_password !== ''
					? ''
					: html_entity_decode( wp_trim_words( $post->post_excerpt !== '' ? $post->post_excerpt : $post->post_content, 30, '…' ), ENT_QUOTES, 'UTF-8' ),
				'type'       => $post->post_type,
				'type_label' => self::content_type_label( $post->post_type ),
				'thumb'      => (string) get_the_post_thumbnail_url( $post, 'thumbnail' ),
				'base_rank'  => $position,
			);
		}

		return $results;
	}

	// ── OpenRouter sentiment / intent ────────────────────────────

	/**
	 * AI intent and keywords for a search. A cached answer is always used. A new AI call needs
	 * $allow_ai, a free slot in today's site-wide cap and the visitor's daily allowance; otherwise
	 * the plain (no-AI) analysis is returned and the search still runs.
	 *
	 * @param string $query
	 * @param bool   $allow_ai Licensed site with an AI key.
	 * @return array{intent:string,keywords:array<string>,sentiment:string}
	 */
	private static function openrouter_analyze( string $query, bool $allow_ai = true ): array {
		$fallback = array(
			'intent'    => 'informational',
			'keywords'  => array_filter( explode( ' ', strtolower( $query ) ) ),
			'sentiment' => 'neutral',
		);

		if ( Neo_Pulse_Wp_OpenRouter::get_api_key() === '' ) {
			return $fallback;
		}

		$cache_key = 'neo_pulse_srch_ai_' . md5( Neo_Pulse_Wp_Search_Logs::normalize_query( $query ) . '|' . self::get_openrouter_model() );
		$cached    = get_transient( $cache_key );
		if ( is_array( $cached ) && isset( $cached['intent'], $cached['keywords'], $cached['sentiment'] ) ) {
			return $cached;
		}

		if ( ! $allow_ai ) {
			return $fallback;
		}
		// Per-visitor daily allowance first (it doesn't use a site slot), then the site-wide cap.
		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'search_day', self::RATE_LIMIT_DAY_MAX, DAY_IN_SECONDS ) ) {
			return $fallback;
		}
		if ( ! self::take_daily_ai_slot() ) {
			return $fallback;
		}

		$system = 'You are a WordPress site search assistant. Given a user search query, respond with ONLY valid JSON (no markdown, no explanation): {"intent":"informational|navigational|transactional","keywords":["keyword1","keyword2"],"sentiment":"positive|neutral|negative"}. Rules for keywords: extract 2-4 terms that should be used to FIND the right WordPress content. Prefer terms that match static PAGES and service/location URLs (contact, services, service-area city names), not blog post topics, unless the user clearly wants articles. For navigational queries like "contact page", keywords should be the page name (e.g. ["contact"]). For location queries, include city or "service area" terms. Think: page TITLE, SLUG, or URL path segment.';

		$result = Neo_Pulse_Wp_OpenRouter::complete( $system, $query, 150, 0.1, self::get_openrouter_model() );

		if ( is_wp_error( $result ) ) {
			return $fallback;
		}

		$text = trim( (string) $result );
		if ( strpos( $text, '```' ) !== false ) {
			$text = preg_replace( '/```(?:json)?\s*/i', '', $text );
			$text = preg_replace( '/```/', '', $text );
			$text = trim( $text );
		}

		$parsed = json_decode( $text, true );
		if ( ! is_array( $parsed ) ) {
			return $fallback;
		}

		$analysis = array(
			'intent'    => isset( $parsed['intent'] ) && is_string( $parsed['intent'] ) ? $parsed['intent'] : $fallback['intent'],
			'keywords'  => isset( $parsed['keywords'] ) && is_array( $parsed['keywords'] ) ? array_map( 'strval', $parsed['keywords'] ) : $fallback['keywords'],
			'sentiment' => isset( $parsed['sentiment'] ) && is_string( $parsed['sentiment'] ) ? $parsed['sentiment'] : $fallback['sentiment'],
		);
		set_transient( $cache_key, $analysis, self::AI_CACHE_TTL );

		return $analysis;
	}

	// ── Ranking ──────────────────────────────────────────────────

	/**
	 * Boost pages and service-area URLs over blog posts (filterable).
	 *
	 * @param array<string,mixed> $item Result row with type, slug, url.
	 * @return int
	 */
	private static function content_priority_boost( array $item ): int {
		$type = isset( $item['type'] ) ? (string) $item['type'] : '';
		$slug = isset( $item['slug'] ) ? strtolower( (string) $item['slug'] ) : '';

		// The order set in Search → General: the top level gets +45, the bottom -18, levels in
		// between are spread evenly (the same range the fixed page/post bonuses used before).
		$levels = self::priority_levels();
		$level  = self::priority_level( $type );
		$count  = count( $levels );
		$boost  = $count > 1 ? (int) round( 45 - ( 63 * $level / ( $count - 1 ) ) ) : 0;

		if ( $type === 'page' && self::is_money_page_slug( $slug ) ) {
			$boost += 25;
		}

		/**
		 * Adjust content-type priority boost for a search result.
		 *
		 * @param int                 $boost Points added to relevance score.
		 * @param array<string,mixed> $item  Result row.
		 */
		return (int) apply_filters( 'neo_pulse_wp_search_content_boost', $boost, $item );
	}

	/**
	 * Default place in the result order for a content type: pages first, blog posts last.
	 */
	private static function type_priority_default( string $type ): int {
		if ( 'page' === $type ) {
			return 1;
		}
		return 'post' === $type ? 9 : 5;
	}

	/**
	 * Place in the result order (1 first … 9 last) for a content type.
	 */
	public static function type_priority( string $type ): int {
		$set = self::get_search_settings()['type_priority'] ?? array();
		return is_array( $set ) && isset( $set[ $type ] ) ? (int) $set[ $type ] : self::type_priority_default( $type );
	}

	/**
	 * The distinct priority numbers used by the searched content types, best first.
	 *
	 * @return array<int,int>
	 */
	private static function priority_levels(): array {
		static $levels = null;
		if ( null === $levels ) {
			$levels = array();
			foreach ( (array) self::get_search_settings()['post_types'] as $type ) {
				$levels[] = self::type_priority( (string) $type );
			}
			$levels = array_values( array_unique( $levels ) );
			sort( $levels );
		}
		return $levels;
	}

	/**
	 * 0 for the best level, 1 for the next, and so on.
	 */
	private static function priority_level( string $type ): int {
		$index = array_search( self::type_priority( $type ), self::priority_levels(), true );
		return false === $index ? max( 0, count( self::priority_levels() ) - 1 ) : (int) $index;
	}

	/**
	 * @param string $slug Post slug.
	 */
	private static function is_money_page_slug( string $slug ): bool {
		if ( $slug === '' ) {
			return false;
		}

		$money_slugs = apply_filters(
			'neo_pulse_wp_search_money_page_slugs',
			array(
				'contact',
				'about',
				'about-us',
				'services',
				'our-services',
				'service',
				'pricing',
				'quote',
				'get-started',
				'locations',
				'team',
				'careers',
				'work-with-us',
				'portfolio',
				'our-work',
			)
		);

		foreach ( $money_slugs as $needle ) {
			$needle = strtolower( (string) $needle );
			if ( $needle === '' ) {
				continue;
			}
			if ( $slug === $needle || strpos( $slug, $needle ) !== false ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * @param string $url  Permalink.
	 * @param string $slug Post slug.
	 */
	private static function is_service_area_url( string $url, string $slug ): bool {
		if ( strpos( $url, '/service-area/' ) !== false || strpos( $url, '/service-areas/' ) !== false ) {
			return true;
		}
		if ( strpos( $slug, 'service-area' ) !== false || strpos( $slug, 'service_area' ) !== false ) {
			return true;
		}
		return false;
	}

	/**
	 * @param array<int,array<string,mixed>> $wp_results
	 * @param array{intent:string,keywords:array<string>,sentiment:string} $ai
	 * @param int    $limit
	 * @param string $query What the visitor typed (for the match percentage).
	 * @return array<int,array<string,mixed>>
	 */
	private static function rank_results( array $wp_results, array $ai, int $limit, string $query = '' ): array {
		if ( empty( $wp_results ) ) {
			return array();
		}

		$keywords = array_map( 'strtolower', $ai['keywords'] );
		$intent   = $ai['intent'];
		$terms    = self::match_terms( $query !== '' ? $query : implode( ' ', $keywords ) );

		foreach ( $wp_results as &$item ) {
			$score       = max( 0, 100 - ( (int) $item['base_rank'] * 3 ) );
			$title_lower = strtolower( (string) $item['title'] );
			$url_lower   = isset( $item['url'] ) ? strtolower( (string) $item['url'] ) : '';
			$slug_lower  = isset( $item['slug'] ) ? strtolower( (string) $item['slug'] ) : '';
			$haystack    = $title_lower . ' ' . strtolower( (string) $item['excerpt'] ) . ' ' . $slug_lower;

			$score += self::content_priority_boost( $item );

			foreach ( $keywords as $kw ) {
				if ( $kw === '' ) {
					continue;
				}
				if ( stripos( $title_lower, $kw ) !== false ) {
					$score += 40;
				}
				if ( stripos( $haystack, $kw ) !== false ) {
					$score += 15;
				}
				if ( stripos( $url_lower, $kw ) !== false ) {
					$score += 20;
				}
			}

			if ( $intent === 'navigational' ) {
				if ( $item['type'] === 'page' || self::is_service_area_url( $url_lower, $slug_lower ) ) {
					$score += 25;
				}
				if ( $item['type'] === 'post' ) {
					$score -= 12;
				}
				foreach ( $keywords as $kw ) {
					if ( $kw !== '' && stripos( $title_lower, $kw ) !== false ) {
						$score += 30;
					}
				}
			}

			if ( $intent === 'transactional' ) {
				if ( $item['type'] === 'page' || self::is_service_area_url( $url_lower, $slug_lower ) ) {
					$score += 22;
				}
				if ( in_array( $item['type'], array( 'product', 'download' ), true ) ) {
					$score += 25;
				}
				if ( $item['type'] === 'post' ) {
					$score -= 10;
				}
			}

			if ( $intent === 'informational' && $item['type'] === 'post' ) {
				$score += 8;
			}

			// How closely the result matches what was typed (0-100), shown as "95% match".
			// It also counts towards the ranking, so better matches sit higher.
			$item['match'] = self::match_percent( $terms, $title_lower, $slug_lower . ' ' . $url_lower, strtolower( (string) $item['excerpt'] ) );
			$item['score'] = $score + $item['match'];
			unset( $item['base_rank'] );
		}
		unset( $item );

		$strict = 'strict' === ( self::get_search_settings()['priority_mode'] ?? 'balanced' );
		usort( $wp_results, static function ( $a, $b ) use ( $strict ) {
			if ( $strict ) {
				$by_type = self::priority_level( (string) $a['type'] ) - self::priority_level( (string) $b['type'] );
				if ( 0 !== $by_type ) {
					return $by_type;
				}
			}
			return (int) $b['score'] - (int) $a['score'];
		} );

		$wp_results = array_slice( $wp_results, 0, $limit );

		// Keep the percentages in step with the order: a lower result never shows a higher match.
		$ceiling = 100;
		foreach ( $wp_results as &$item ) {
			$item['match'] = min( $ceiling, (int) $item['match'] );
			$ceiling       = $item['match'];
		}
		unset( $item );

		return $wp_results;
	}

	/**
	 * Words in the search that carry meaning (lowercase, no filler words, no repeats).
	 *
	 * @return array<int,string>
	 */
	private static function match_terms( string $query ): array {
		static $filler = array(
			'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'can', 'do', 'does', 'for', 'from', 'get', 'how', 'i',
			'in', 'is', 'it', 'me', 'my', 'of', 'on', 'or', 'our', 'the', 'to', 'we', 'what', 'where', 'which', 'who',
			'why', 'with', 'you', 'your',
		);
		$query = function_exists( 'mb_strtolower' ) ? mb_strtolower( $query ) : strtolower( $query );
		$words = preg_split( '/[^\p{L}\p{N}]+/u', $query, -1, PREG_SPLIT_NO_EMPTY );
		$terms = array();
		foreach ( (array) $words as $word ) {
			if ( ( strlen( $word ) < 2 && ! ctype_digit( $word ) ) || in_array( $word, $filler, true ) ) {
				continue;
			}
			$terms[ $word ] = true;
		}
		if ( empty( $terms ) ) {
			foreach ( (array) $words as $word ) {
				$terms[ $word ] = true;
			}
		}
		return array_keys( $terms );
	}

	/**
	 * Match percentage for one result: each search word scores by where it appears (title best, then
	 * the address, then the description; a shared word stem counts for less), averaged over the words.
	 * Every result returned matched the search somehow, so the floor is 20%.
	 *
	 * @param array<int,string> $terms
	 */
	private static function match_percent( array $terms, string $title, string $address, string $excerpt ): int {
		if ( empty( $terms ) ) {
			return 0;
		}
		$total = 0.0;
		foreach ( $terms as $term ) {
			$stem = self::match_stem( $term );
			if ( self::has_word( $title, $term ) ) {
				$weight = 1.0;
			} elseif ( self::has_word( $address, $term ) ) {
				$weight = 0.85;
			} elseif ( self::has_word( $excerpt, $term ) ) {
				$weight = 0.7;
			} elseif ( $stem !== '' && strpos( $title, $stem ) !== false ) {
				$weight = 0.6;
			} elseif ( $stem !== '' && ( strpos( $address, $stem ) !== false || strpos( $excerpt, $stem ) !== false ) ) {
				$weight = 0.4;
			} else {
				$weight = 0.0;
			}
			$total += $weight;
		}
		$coverage = $total / count( $terms );
		return (int) round( 20 + 80 * $coverage );
	}

	/**
	 * Whole-word (or word-start) match, so "blind" counts in "blinds" but "art" doesn't count in "start".
	 */
	private static function has_word( string $text, string $term ): bool {
		return $text !== '' && (bool) preg_match( '/(?<![\p{L}\p{N}])' . preg_quote( $term, '/' ) . '/u', $text );
	}

	/**
	 * Rough word stem ("motorized" → "motoriz", "blinds" → "blind") for partial credit.
	 */
	private static function match_stem( string $term ): string {
		if ( strlen( $term ) < 5 ) {
			return '';
		}
		$stem = preg_replace( '/(ing|ed|es|s|er|ers|ly)$/', '', $term );
		return strlen( (string) $stem ) >= 4 ? (string) $stem : '';
	}


	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_search_log( WP_REST_Request $request ) {
		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'search_log', self::LOG_RATE_LIMIT_MAX, self::LOG_RATE_LIMIT_WINDOW ) ) {
			return new WP_REST_Response( array( 'ok' => false, 'error' => 'rate_limited' ), 429 );
		}

		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}

		$result = Neo_Pulse_Wp_Search_Logs::insert(
			array(
				'session_id'   => isset( $body['session_id'] ) ? (string) $body['session_id'] : '',
				'page_url'     => isset( $body['page_url'] ) ? (string) $body['page_url'] : '',
				'query'        => isset( $body['query'] ) ? (string) $body['query'] : '',
				'result_count' => isset( $body['result_count'] ) ? (int) $body['result_count'] : 0,
				'intent'       => isset( $body['intent'] ) ? (string) $body['intent'] : '',
				'sentiment'    => isset( $body['sentiment'] ) ? (string) $body['sentiment'] : '',
				'results'      => isset( $body['results'] ) && is_array( $body['results'] ) ? $body['results'] : array(),
			)
		);

		if ( empty( $result['ok'] ) ) {
			$status = ( isset( $result['error'] ) && $result['error'] === 'logging_disabled' ) ? 200 : 400;
			return new WP_REST_Response( $result, $status );
		}

		return new WP_REST_Response(
			array(
				'ok'       => true,
				'eventUid' => $result['event_uid'],
			),
			200
		);
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_search_accept( WP_REST_Request $request ) {
		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'search_log', self::LOG_RATE_LIMIT_MAX, self::LOG_RATE_LIMIT_WINDOW ) ) {
			return new WP_REST_Response( array( 'ok' => false, 'error' => 'rate_limited' ), 429 );
		}

		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}

		// Accepted pages feed the public "Others also found" list, so only real, public pages
		// on this site count, and the title always comes from the post (never from the browser).
		$post = self::public_post_for_url( isset( $body['url'] ) ? (string) $body['url'] : '' );
		if ( null === $post ) {
			return new WP_REST_Response( array( 'ok' => false, 'error' => 'invalid_url' ), 400 );
		}
		$permalink = get_permalink( $post );

		$result = Neo_Pulse_Wp_Search_Logs::record_accept(
			array(
				'event_uid' => isset( $body['eventUid'] ) ? (string) $body['eventUid'] : '',
				'url'       => is_string( $permalink ) && $permalink !== '' ? $permalink : (string) $body['url'],
				'title'     => html_entity_decode( get_the_title( $post ), ENT_QUOTES, 'UTF-8' ),
				'rank'      => isset( $body['rank'] ) ? (int) $body['rank'] : 0,
			)
		);

		if ( empty( $result['ok'] ) ) {
			$status = ( isset( $result['error'] ) && $result['error'] === 'logging_disabled' ) ? 200 : 400;
			return new WP_REST_Response( $result, $status );
		}

		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}

	/**
	 * Published, non-password post on this site for a URL, or null.
	 */
	private static function public_post_for_url( string $url ): ?WP_Post {
		$url = esc_url_raw( trim( $url ) );
		if ( $url === '' ) {
			return null;
		}
		$host = wp_parse_url( $url, PHP_URL_HOST );
		$home = wp_parse_url( home_url(), PHP_URL_HOST );
		if ( ! is_string( $host ) || ! is_string( $home ) || strtolower( $host ) !== strtolower( $home ) ) {
			return null;
		}
		$post_id = url_to_postid( $url );
		if ( $post_id < 1 ) {
			return null;
		}
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post || $post->post_status !== 'publish' || (string) $post->post_password !== '' ) {
			return null;
		}
		return $post;
	}

	/**
	 * Public insights lists (aggregates only). Days come from the site settings, never the request;
	 * the widget picks its sections and a list size of 1–12, so the cache stays small and bounded.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function handle_search_insights( WP_REST_Request $request ): WP_REST_Response {
		$insights = Neo_Pulse_Wp_Ai_Widget_Design::resolve_search_insights( array() );
		$days     = max( 1, min( 365, (int) ( $insights['insights_days'] ?? 30 ) ) );
		$limit    = max( 1, min( 12, (int) ( $insights['popular_terms_limit'] ?? 5 ) ) );
		$req_lim  = $request->get_param( 'limit' );
		if ( is_scalar( $req_lim ) && (int) $req_lim > 0 ) {
			$limit = min( 12, (int) $req_lim );
		}

		// The widget says which sections it shows (each widget has its own switches).
		$asked = $request->get_param( 'sections' );
		if ( is_string( $asked ) && $asked !== '' ) {
			$asked = array_map( 'trim', explode( ',', $asked ) );
			$insights['show_popular_terms']          = in_array( 'popular_terms', $asked, true );
			$insights['show_popular_pages_overseer'] = in_array( 'popular_pages_overseer', $asked, true );
			$insights['show_popular_pages_search']   = in_array( 'popular_pages_search', $asked, true );
		}

		$payload = array(
			'popularTerms'            => array(),
			'popularPagesOverseer'    => array(),
			'popularPagesFromSearch'  => array(),
		);

		if ( ! empty( $insights['show_popular_terms'] ) ) {
			$payload['popularTerms'] = Neo_Pulse_Wp_Search_Popular::terms( $days, $limit, (string) $request->get_param( 'pinned' ) !== '0' );
		}
		if ( ! empty( $insights['show_popular_pages_overseer'] ) ) {
			$payload['popularPagesOverseer'] = Neo_Pulse_Wp_Search_Logs::aggregate_popular_pages_overseer( $days, $limit );
		}
		if ( ! empty( $insights['show_popular_pages_search'] ) ) {
			$payload['popularPagesFromSearch'] = Neo_Pulse_Wp_Search_Logs::aggregate_popular_pages_from_search( $days, $limit );
		}
		foreach ( array( 'popularPagesOverseer', 'popularPagesFromSearch' ) as $list ) {
			$payload[ $list ] = self::with_page_details( $payload[ $list ] );
		}

		return new WP_REST_Response( $payload, 200 );
	}

	/**
	 * Add a thumbnail and a type label ("Page", "Blog") to popular page rows.
	 *
	 * @param array<int,array<string,mixed>> $rows
	 * @return array<int,array<string,mixed>>
	 */
	private static function with_page_details( array $rows ): array {
		foreach ( $rows as $i => $row ) {
			$post_id = isset( $row['url'] ) ? url_to_postid( (string) $row['url'] ) : 0;
			$rows[ $i ]['thumb']      = $post_id ? (string) get_the_post_thumbnail_url( $post_id, 'thumbnail' ) : '';
			$rows[ $i ]['type_label'] = $post_id ? self::content_type_label( (string) get_post_type( $post_id ) ) : '';
		}
		return $rows;
	}
}
