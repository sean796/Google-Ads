<?php
/**
 * RAG context builder for the NEO Pulse Chat widget.
 *
 * Fetches the site post/page inventory via get_posts(), caches it as a transient,
 * and scores posts against a user query using weighted keyword matching.
 * Supports configurable post types, category exclusions, and a custom knowledge base.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_wp_chat_rag_dir = __DIR__ . '/';
require_once $neo_pulse_wp_chat_rag_dir . 'trait-neo-pulse-wp-chat-rag-discovery-scoring.php';
require_once $neo_pulse_wp_chat_rag_dir . 'trait-neo-pulse-wp-chat-rag-slug-context-fuzzy.php';
require_once $neo_pulse_wp_chat_rag_dir . 'trait-neo-pulse-wp-chat-rag-terms-agent.php';

class Neo_Pulse_Wp_Chat_Rag {

	const CACHE_KEY         = 'neo_pulse_chat_context_cache_v5';
	const BODY_CACHE_PREFIX = 'neo_pulse_chat_body_';
	const FUZZY_MIN_SCORE   = 5.0;
	const CACHE_TTL         = 3600;
	const BODY_CACHE_TTL    = 3600;
	const MAX_RESULTS       = 8;
	const ENRICH_MAX        = 5;
	const POST_BODY_MAX     = 8000;
	const SEO_RESEARCH_MAX  = 4000;
	const AGENT_INDEX_CACHE_KEY = 'neo-pulse_agent_site_index_cache';

	use Neo_Pulse_Wp_Chat_Rag_Trait_Discovery_Scoring;
	use Neo_Pulse_Wp_Chat_Rag_Trait_Slug_Context_Fuzzy;
	use Neo_Pulse_Wp_Chat_Rag_Trait_Terms_Agent;

	/**
	 * Full page body for chat deep-read (rendered WP content, Elementor fallback, FAQ).
	 * Password-protected posts are never read. Internal SEO fields (focus keyword, SEO research)
	 * are only added for God Mode / backend requests, never for visitor-facing answers.
	 *
	 * @param int  $post_id            Post ID.
	 * @param bool $include_seo_fields Add focus keyword + SEO research (backend only).
	 */
	public static function read_post_body_for_chat( int $post_id, bool $include_seo_fields = false ): string {
		if ( $post_id < 1 ) {
			return '';
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post || (string) $post->post_password !== '' ) {
			return '';
		}

		$cache_key = self::BODY_CACHE_PREFIX . $post_id . '_' . md5( (string) $post->post_modified_gmt . ( $include_seo_fields ? '|seo' : '|pub' ) );
		$cached    = get_transient( $cache_key );
		if ( is_string( $cached ) && $cached !== '' ) {
			return $cached;
		}

		$parts = array();
		$body  = Neo_Pulse_Wp_Rest::get_rendered_content_plain( $post_id );
		if ( $body === '' ) {
			$body = Neo_Pulse_Wp_Elementor_Text::extract_page_body_text( $post_id );
		}
		if ( $body !== '' ) {
			$parts[] = $body;
		}

		if ( $include_seo_fields ) {
			$focus = Neo_Pulse_Wp_Ai_Context::read_focus_keyword( $post_id );
			if ( $focus !== '' ) {
				$parts[] = 'Focus keyword: ' . $focus;
			}
		}

		$faq = Neo_Pulse_Wp_Ai_Context::read_field_value( $post_id, 'faq' );
		if ( $faq !== '' ) {
			$parts[] = "FAQ:\n" . $faq;
		}

		if ( $include_seo_fields ) {
			$research = Neo_Pulse_Wp_Ai_Context::read_field_value( $post_id, 'seo_research' );
			if ( $research !== '' ) {
				if ( strlen( $research ) > self::SEO_RESEARCH_MAX ) {
					$research = substr( $research, 0, self::SEO_RESEARCH_MAX ) . '…';
				}
				$parts[] = "SEO research:\n" . $research;
			}
		}

		$text = trim( implode( "\n\n", $parts ) );
		if ( strlen( $text ) > self::POST_BODY_MAX ) {
			$text = substr( $text, 0, self::POST_BODY_MAX ) . '…';
		}

		if ( $text !== '' ) {
			set_transient( $cache_key, $text, self::BODY_CACHE_TTL );
		}

		return $text;
	}

	/**
	 * Build or retrieve the cached site content index.
	 *
	 * @param array $settings Optional chat settings for post type / category filtering.
	 * @return array<int,array{id:int,title:string,url:string,excerpt:string,type:string,categories:string[],tags:string[]}>
	 */
	public static function get_site_index( array $settings = array() ): array {
		return self::filter_index( self::get_raw_site_index( $settings ), $settings );
	}

	/**
	 * Full sitemap-backed index before chat training category/post-type filters.
	 *
	 * @param array<string,mixed> $settings Used when rebuilding cache (excerpt length).
	 * @return array<int,array<string,mixed>>
	 */
	public static function get_raw_site_index( array $settings = array() ): array {
		$cached = get_transient( self::CACHE_KEY );
		$raw    = is_array( $cached ) && ! empty( $cached ) ? $cached : null;

		if ( null === $raw ) {
			$raw = self::build_index( $settings );
			if ( ! empty( $raw ) ) {
				set_transient( self::CACHE_KEY, $raw, self::CACHE_TTL );
			}
		}

		return is_array( $raw ) ? $raw : array();
	}

	/**
	 * Post types allowed in the chat index from training settings.
	 *
	 * @param array<string,mixed> $settings Chat settings.
	 * @return array<int, string>
	 */
	public static function allowed_index_post_types( array $settings = array() ): array {
		$allowed = isset( $settings['indexed_post_types'] ) && is_array( $settings['indexed_post_types'] )
			? array_map( 'sanitize_key', $settings['indexed_post_types'] )
			: array( 'post', 'page' );

		$allowed = array_values( array_filter( $allowed ) );
		if ( empty( $allowed ) ) {
			$allowed = array( 'post', 'page' );
		}

		$out = array();
		foreach ( $allowed as $pt ) {
			if ( post_type_exists( $pt ) ) {
				$out[] = $pt;
			}
		}

		return ! empty( $out ) ? $out : array( 'post', 'page' );
	}

	/**
	 * Whether an index item passes chat training post-type and category filters.
	 *
	 * @param array<string,mixed> $item
	 * @param array<string,mixed> $settings
	 */
	public static function item_passes_index_filters( array $item, array $settings = array() ): bool {
		if ( ! self::item_passes_post_type_filter( $item, $settings ) ) {
			return false;
		}

		$excluded = isset( $settings['excluded_categories'] ) && is_array( $settings['excluded_categories'] )
			? array_map( 'intval', $settings['excluded_categories'] )
			: array();
		$excluded = array_values( array_filter( $excluded ) );
		if ( empty( $excluded ) ) {
			return true;
		}

		$cat_ids = isset( $item['category_ids'] ) && is_array( $item['category_ids'] )
			? array_map( 'intval', $item['category_ids'] )
			: array();

		foreach ( $cat_ids as $cat_id ) {
			if ( in_array( $cat_id, $excluded, true ) ) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Post-type allowlist only (ignores excluded categories).
	 *
	 * @param array<string,mixed> $item
	 * @param array<string,mixed> $settings
	 */
	public static function item_passes_post_type_filter( array $item, array $settings = array() ): bool {
		$type = isset( $item['type'] ) ? sanitize_key( (string) $item['type'] ) : '';
		return $type !== '' && in_array( $type, self::allowed_index_post_types( $settings ), true );
	}

	/**
	 * Apply chat training filters to a sitemap-backed index.
	 *
	 * @param array<int,array<string,mixed>> $index
	 * @param array<string,mixed>            $settings
	 * @return array<int,array<string,mixed>>
	 */
	public static function filter_index( array $index, array $settings = array() ): array {
		if ( empty( $index ) ) {
			return array();
		}

		$out = array();
		foreach ( $index as $item ) {
			if ( is_array( $item ) && self::item_passes_index_filters( $item, $settings ) ) {
				$out[] = $item;
			}
		}

		return $out;
	}

	/**
	 * Score and rank posts by relevance to the user query.
	 */
	public static function retrieve( string $query, int $limit = self::MAX_RESULTS, array $settings = array() ): array {
		$index = self::get_site_index( $settings );
		if ( empty( $index ) ) {
			return array();
		}

		$query = self::normalize_retrieval_query( $query );
		$terms = self::extract_terms( $query );
		if ( empty( $terms ) ) {
			return array_slice( $index, 0, $limit );
		}

		$scored = array();
		foreach ( $index as $item ) {
			$score = self::score_item( $item, $terms );
			if ( $score > 0 ) {
				$item['score'] = $score;
				$scored[]      = $item;
			}
		}

		usort(
			$scored,
			function ( $a, $b ) {
				return $b['score'] <=> $a['score'];
			}
		);

		return array_slice( $scored, 0, $limit );
	}
}
