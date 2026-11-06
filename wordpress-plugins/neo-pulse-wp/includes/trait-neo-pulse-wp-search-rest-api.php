<?php
/**
 * Search REST routes and main search handler.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Search_Trait_Rest_Api {

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
}
