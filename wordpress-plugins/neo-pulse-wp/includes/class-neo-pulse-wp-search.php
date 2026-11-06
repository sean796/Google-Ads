<?php
/**
 * AI-powered search: settings, shortcode, REST endpoint, and ranking.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_wp_search_dir = __DIR__ . '/';
require_once $neo_pulse_wp_search_dir . 'trait-neo-pulse-wp-search-rendering.php';
require_once $neo_pulse_wp_search_dir . 'trait-neo-pulse-wp-search-rest-api.php';
require_once $neo_pulse_wp_search_dir . 'trait-neo-pulse-wp-search-query-ai.php';
require_once $neo_pulse_wp_search_dir . 'trait-neo-pulse-wp-search-ranking.php';
require_once $neo_pulse_wp_search_dir . 'trait-neo-pulse-wp-search-logs-insights.php';

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

	use Neo_Pulse_Wp_Search_Trait_Rendering;
	use Neo_Pulse_Wp_Search_Trait_Rest_Api;
	use Neo_Pulse_Wp_Search_Trait_Query_Ai;
	use Neo_Pulse_Wp_Search_Trait_Ranking;
	use Neo_Pulse_Wp_Search_Trait_Logs_Insights;

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

}
