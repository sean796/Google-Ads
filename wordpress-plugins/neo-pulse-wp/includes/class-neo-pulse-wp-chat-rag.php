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

	/**
	 * Visitor is asking for this site's blog posts or articles (not off-topic blogging advice).
	 */
	public static function is_site_blog_discovery_query( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === '' ) {
			return false;
		}

		$content_markers = array( 'blog', 'blogs', 'article', 'articles', 'blog post', 'blog posts' );
		$has_content     = false;
		foreach ( $content_markers as $marker ) {
			if ( str_contains( $lower, $marker ) ) {
				$has_content = true;
				break;
			}
		}
		if ( ! $has_content ) {
			if ( preg_match( '/\bposts?\b/', $lower ) && preg_match( '/\b(read|recommend|suggest|find|show|list|beginner|start|learn|which|what|any|good|best)\b/', $lower ) ) {
				$has_content = true;
			}
		}
		if ( ! $has_content ) {
			return false;
		}

		if ( preg_match( '/\b(recommend|suggest|which|what|best|good|beginner|start|learn|read|find|show|list|any|looking for|searching for)\b/', $lower ) ) {
			return true;
		}
		if ( preg_match( '/\bblogs?\s+(about|on|for)\b/', $lower ) ) {
			return true;
		}

		return false;
	}

	/**
	 * Prioritize blog posts and the blog index when the visitor asks for reading recommendations.
	 *
	 * @param array<int,array<string,mixed>> $retrieved
	 * @return array<int,array<string,mixed>>
	 */
	public static function merge_blog_discovery_items( string $message, array $retrieved, array $settings = array(), int $post_limit = 6 ): array {
		if ( ! self::is_site_blog_discovery_query( $message ) ) {
			return $retrieved;
		}

		$posts    = self::collect_sitemap_blog_posts( $message, $settings, $post_limit );
		$blog_hub = self::find_blog_hub_page( $settings );
		$boosted  = array();

		if ( is_array( $blog_hub ) ) {
			$boosted[] = $blog_hub;
		}
		$boosted = array_merge( $boosted, $posts );

		if ( empty( $boosted ) ) {
			return $retrieved;
		}

		return Neo_Pulse_Wp_Chat_Links::dedupe_items_by_id( array_merge( $boosted, $retrieved ) );
	}

	/**
	 * Blog posts from the NEO Pulse post sitemap (category exclusions do not apply).
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public static function collect_sitemap_blog_posts( string $message, array $settings = array(), int $limit = 6 ): array {
		if ( ! in_array( 'post', self::allowed_index_post_types( $settings ), true ) ) {
			return array();
		}

		$raw       = self::get_raw_site_index( $settings );
		$terms     = self::extract_terms( $message );
		$msg_lower = strtolower( $message );
		$scored    = array();

		foreach ( $raw as $item ) {
			if ( ! is_array( $item ) || (string) ( $item['type'] ?? '' ) !== 'post' ) {
				continue;
			}
			if ( ! self::item_passes_post_type_filter( $item, $settings ) ) {
				continue;
			}

			$score = self::score_item( $item, $terms );
			$hay   = strtolower( (string) ( $item['title'] ?? '' ) . ' ' . (string) ( $item['excerpt'] ?? '' ) );
			if ( str_contains( $msg_lower, 'beginner' ) || str_contains( $msg_lower, 'start' ) ) {
				foreach ( array( 'beginner', 'guide', 'tips', 'basics', 'intro', 'how to', 'explained' ) as $hint ) {
					if ( str_contains( $hay, $hint ) ) {
						$score += 4.0;
						break;
					}
				}
			}
			if ( $score <= 0 ) {
				$score = 1.0;
			}
			$item['score'] = $score;
			$scored[]      = $item;
		}

		usort(
			$scored,
			function ( $a, $b ) {
				return ( $b['score'] ?? 0 ) <=> ( $a['score'] ?? 0 );
			}
		);

		return array_slice( $scored, 0, max( 1, $limit ) );
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function find_blog_hub_page( array $settings = array() ): ?array {
		foreach ( self::get_site_index( $settings ) as $item ) {
			if ( (string) ( $item['type'] ?? '' ) !== 'page' ) {
				continue;
			}
			$url = self::item_url_path_lower( $item );
			if ( str_contains( $url, '/blog' ) || str_contains( strtolower( (string) ( $item['title'] ?? '' ) ), 'blog' ) ) {
				return $item;
			}
		}

		return null;
	}

	/**
	 * Deterministic blog recommendation card from real sitemap post URLs.
	 *
	 * @param array<int,array<string,mixed>> $posts From collect_sitemap_blog_posts().
	 * @return array<string,mixed>|null
	 */
	public static function build_blog_discovery_card( string $message, array $posts, array $settings = array() ): ?array {
		if ( empty( $posts ) ) {
			return null;
		}

		$site_name = get_bloginfo( 'name' );
		$blog_hub  = self::find_blog_hub_page( $settings );
		$lines     = array( 'Here are some blog posts from ' . $site_name . ' to get you started:' );

		foreach ( array_slice( $posts, 0, 5 ) as $post ) {
			if ( empty( $post['title'] ) || empty( $post['url'] ) ) {
				continue;
			}
			$reason = trim( (string) ( $post['excerpt'] ?? '' ) );
			if ( $reason === '' ) {
				$reason = 'Read more on our site.';
			} else {
				$reason = wp_trim_words( wp_strip_all_tags( $reason ), 18, '…' );
			}
			$lines[] = '- ' . (string) $post['title'] . ': ' . $reason;
		}

		if ( is_array( $blog_hub ) && ! empty( $blog_hub['url'] ) ) {
			$lines[] = '';
			$lines[] = 'Browse our Blog page for more posts and ideas.';
		}

		$links = array();
		foreach ( array_slice( $posts, 0, 5 ) as $post ) {
			if ( empty( $post['url'] ) || empty( $post['title'] ) ) {
				continue;
			}
			$links[] = array(
				'label' => (string) $post['title'],
				'url'   => (string) $post['url'],
				'icon'  => 'post',
			);
		}

		$card = array(
			'type'       => 'recommendation',
			'title'      => $site_name . ' blog posts',
			'body'       => implode( "\n", $lines ),
			'links'      => array_slice( $links, 0, 4 ),
			'confidence' => 'high',
		);

		if ( is_array( $blog_hub ) && ! empty( $blog_hub['url'] ) ) {
			$card['cta'] = array(
				'label' => (string) ( $blog_hub['title'] ?? 'Blog' ),
				'url'   => (string) $blog_hub['url'],
			);
		} elseif ( ! empty( $links[0]['url'] ) ) {
			$card['cta'] = array(
				'label' => (string) $links[0]['label'],
				'url'   => (string) $links[0]['url'],
			);
		}

		return $card;
	}

	/**
	 * Follow-up chip labels from additional sitemap blog posts.
	 *
	 * @param array<int,array<string,mixed>> $shown_posts Posts already listed in the card.
	 * @return array<int,string>
	 */
	public static function blog_discovery_followup_topics( array $shown_posts, array $settings = array(), int $limit = 4 ): array {
		$shown_ids = array();
		foreach ( $shown_posts as $post ) {
			if ( ! empty( $post['id'] ) ) {
				$shown_ids[ (int) $post['id'] ] = true;
			}
		}

		$topics = array();
		foreach ( self::collect_sitemap_blog_posts( 'blog posts', $settings, 12 ) as $post ) {
			$id = (int) ( $post['id'] ?? 0 );
			if ( $id > 0 && isset( $shown_ids[ $id ] ) ) {
				continue;
			}
			$title = trim( (string) ( $post['title'] ?? '' ) );
			if ( $title === '' ) {
				continue;
			}
			$topics[] = $title;
			if ( count( $topics ) >= $limit ) {
				break;
			}
		}

		return $topics;
	}

	/**
	 * Compact inventory for the secretary gate prompt (full sitemap, not category-filtered).
	 */
	public static function build_gate_subjects_block( array $settings = array(), int $max_items = 96 ): string {
		$raw = self::get_raw_site_index( $settings );
		if ( empty( $raw ) ) {
			return '';
		}

		$lines = array();
		foreach ( $raw as $item ) {
			if ( ! is_array( $item ) || empty( $item['title'] ) ) {
				continue;
			}
			$type  = isset( $item['type'] ) ? sanitize_key( (string) $item['type'] ) : 'page';
			$title = trim( (string) $item['title'] );
			if ( $title === '' ) {
				continue;
			}
			$slug = isset( $item['slug'] ) ? trim( (string) $item['slug'] ) : '';
			$line = '- [' . $type . '] ' . $title;
			if ( $slug !== '' ) {
				$line .= ' (' . $slug . ')';
			}
			$lines[] = $line;
			if ( count( $lines ) >= $max_items ) {
				break;
			}
		}

		return implode( "\n", $lines );
	}

	/**
	 * Find a site index item by URL (normalized, trailing-slash tolerant).
	 *
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<string,mixed>|null
	 */
	public static function find_index_item_by_url( string $page_url, array $site_index = array() ): ?array {
		$page_url = esc_url_raw( trim( $page_url ) );
		if ( $page_url === '' ) {
			return null;
		}

		if ( empty( $site_index ) ) {
			$site_index = self::get_site_index();
		}

		$target = Neo_Pulse_Wp_Chat_History::normalize_url( $page_url );
		if ( $target === '' ) {
			return null;
		}

		foreach ( $site_index as $item ) {
			if ( empty( $item['url'] ) ) {
				continue;
			}
			$candidate = Neo_Pulse_Wp_Chat_History::normalize_url( (string) $item['url'] );
			if ( $candidate === $target ) {
				return $item;
			}
		}

		return null;
	}

	/**
	 * Score an index item against a user message.
	 */
	public static function score_message_item( string $message, array $item ): float {
		return self::score_topic_match( $message, $item );
	}

	/**
	 * Topic-aware score: base field weights plus multi-term slug/path bonus and page preference.
	 *
	 * @param array<string,mixed> $item
	 */
	public static function score_topic_match( string $message, array $item, array $extra_phrases = array() ): float {
		$terms       = self::extract_terms( $message );
		$match_terms = self::extract_match_terms( $message, $extra_phrases );
		if ( empty( $terms ) && empty( $match_terms ) ) {
			return 0.0;
		}

		$score       = self::score_item( $item, $terms );
		$slug_lower  = self::item_slug_lower( $item );
		$url_path    = self::item_url_path_lower( $item );
		$path_hyphen = self::item_url_path_hyphen_lower( $item );

		$slug_hits    = 0;
		$phrase_parts = array();
		foreach ( $match_terms as $term ) {
			$in_slug   = $slug_lower !== '' && strpos( $slug_lower, $term ) !== false;
			$in_path   = $url_path !== '' && strpos( $url_path, $term ) !== false;
			$in_hyphen = $path_hyphen !== '' && strpos( $path_hyphen, $term ) !== false;
			if ( $in_slug || $in_path || $in_hyphen ) {
				++$slug_hits;
				if ( $in_slug && strpos( $term, '-' ) === false && strlen( $term ) >= 3 ) {
					$phrase_parts[] = $term;
				}
			}
		}

		if ( $slug_hits >= 2 ) {
			$score += 5.0 * ( $slug_hits - 1 );
			if ( count( $phrase_parts ) >= 2 ) {
				$hyphen_phrase = implode( '-', $phrase_parts );
				if ( $slug_lower !== '' && strpos( $slug_lower, $hyphen_phrase ) !== false ) {
					$score += 3.0;
				}
			}
		}

		$score += self::slug_focus_score( $message, $item, $extra_phrases );

		if ( $slug_hits > 0 && isset( $item['type'] ) && (string) $item['type'] === 'page' ) {
			$score += 6.0;
		}

		$slug_segments = self::slug_segments( $item );
		if ( count( $slug_segments ) >= 3 && isset( $item['type'] ) && (string) $item['type'] === 'post' && $slug_hits > 0 ) {
			$score -= 4.0;
		}

		return $score;
	}

	/**
	 * Slug focus ratio scaled for tie-break sorting (higher = more specific).
	 *
	 * @param array<string,mixed> $item
	 */
	public static function slug_focus_score( string $message, array $item, array $extra_phrases = array() ): float {
		$match_terms = self::extract_match_terms( $message, $extra_phrases );
		if ( empty( $match_terms ) ) {
			return 0.0;
		}

		$slug_lower = self::item_slug_lower( $item );
		if ( $slug_lower === '' ) {
			return 0.0;
		}

		$segments = array_filter( explode( '-', $slug_lower ) );
		if ( empty( $segments ) ) {
			return 0.0;
		}

		$matching = 0;
		foreach ( $segments as $segment ) {
			foreach ( $match_terms as $term ) {
				if ( $segment === $term || strpos( $segment, $term ) !== false || strpos( $term, $segment ) !== false ) {
					++$matching;
					break;
				}
			}
		}

		$ratio = $matching / count( $segments );
		$score = $ratio * 10.0;

		$non_matching = count( $segments ) - $matching;
		$score       -= 3.0 * $non_matching;

		return $score;
	}

	/**
	 * Count query terms that hit slug or URL path.
	 *
	 * @param array<string,mixed> $item
	 */
	public static function count_slug_path_term_hits( string $message, array $item, array $extra_phrases = array() ): int {
		$match_terms = self::extract_match_terms( $message, $extra_phrases );
		return self::count_match_term_slug_path_hits( $item, $match_terms );
	}

	/**
	 * @param array<string,mixed> $item
	 * @return array<int,string>
	 */
	private static function slug_segments( array $item ): array {
		$slug_lower = self::item_slug_lower( $item );
		if ( $slug_lower === '' ) {
			return array();
		}
		return array_values( array_filter( explode( '-', $slug_lower ) ) );
	}

	/**
	 * @param array<string,mixed> $item
	 */
	private static function item_slug_lower( array $item ): string {
		$slug = strtolower( (string) ( $item['slug'] ?? '' ) );
		if ( $slug === '' && ! empty( $item['url'] ) ) {
			$path = wp_parse_url( (string) $item['url'], PHP_URL_PATH );
			if ( is_string( $path ) && $path !== '' ) {
				$slug = strtolower( trim( basename( untrailingslashit( $path ) ), '/' ) );
			}
		}
		return $slug;
	}

	/**
	 * @param array<string,mixed> $item
	 */
	private static function item_url_path_lower( array $item ): string {
		if ( empty( $item['url'] ) ) {
			return '';
		}
		$parsed = wp_parse_url( (string) $item['url'], PHP_URL_PATH );
		if ( ! is_string( $parsed ) || $parsed === '' ) {
			return '';
		}
		return strtolower( str_replace( '-', ' ', $parsed ) );
	}

	private static function item_url_path_hyphen_lower( array $item ): string {
		if ( empty( $item['url'] ) ) {
			return '';
		}
		$parsed = wp_parse_url( (string) $item['url'], PHP_URL_PATH );
		if ( ! is_string( $parsed ) || $parsed === '' ) {
			return '';
		}
		return strtolower( trim( $parsed, '/' ) );
	}

	/**
	 * Whether any query term hits the item slug or URL path.
	 *
	 * @param array<string,mixed> $item
	 */
	public static function item_has_topic_slug_match( string $message, array $item, array $extra_phrases = array() ): bool {
		$match_terms = self::extract_match_terms( $message, $extra_phrases );
		if ( empty( $match_terms ) ) {
			return false;
		}
		return self::terms_hit_slug_or_path( $item, $match_terms );
	}

	/**
	 * Inject slug/URL-matched pages from the full index when missing from retrieval.
	 *
	 * @param array<int,array<string,mixed>> $items
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<int,array<string,mixed>>
	 */
	public static function ensure_topic_pages_in_items( string $user_message, array $items, array $site_index, int $limit = 3, array $extra_phrases = array() ): array {
		$user_message = trim( $user_message );
		if ( $user_message === '' || empty( $site_index ) ) {
			return $items;
		}

		$existing = array();
		foreach ( $items as $item ) {
			$existing[ (int) $item['id'] ] = true;
		}

		$inject = array();
		foreach ( self::find_fuzzy_topic_pages( $user_message, $site_index, $limit, $extra_phrases ) as $item ) {
			if ( isset( $existing[ (int) $item['id'] ] ) ) {
				continue;
			}
			$inject[] = $item;
		}

		if ( empty( $inject ) ) {
			return $items;
		}

		return array_slice( array_merge( $inject, $items ), 0, self::MAX_RESULTS );
	}

	/**
	 * @param array<string,mixed> $item
	 * @param array<int,string>   $terms
	 */
	private static function item_has_slug_or_path_match( array $item, array $terms ): bool {
		$slug_lower = strtolower( (string) ( $item['slug'] ?? '' ) );
		$url_path   = '';
		if ( ! empty( $item['url'] ) ) {
			$parsed = wp_parse_url( (string) $item['url'], PHP_URL_PATH );
			if ( is_string( $parsed ) && $parsed !== '' ) {
				$url_path = strtolower( str_replace( '-', ' ', $parsed ) );
			}
		}
		if ( $slug_lower === '' && $url_path === '' ) {
			return false;
		}
		foreach ( $terms as $term ) {
			if ( $slug_lower !== '' && strpos( $slug_lower, $term ) !== false ) {
				return true;
			}
			if ( $url_path !== '' && strpos( $url_path, $term ) !== false ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Format retrieved items as context string for the LLM.
	 * Prepends knowledge base entries when provided.
	 *
	 * @param array $items         Retrieved items from retrieve().
	 * @param array $knowledge_base Optional KB entries from training settings.
	 * @return string
	 */
	public static function format_context( array $items, array $knowledge_base = array() ): string {
		$parts = array();

		if ( ! empty( $knowledge_base ) ) {
			foreach ( $knowledge_base as $kb ) {
				$q = isset( $kb['question'] ) ? $kb['question'] : '';
				$a = isset( $kb['answer'] ) ? $kb['answer'] : '';
				$p = isset( $kb['priority'] ) && $kb['priority'] === 'high' ? 'HIGH PRIORITY' : 'KNOWLEDGE BASE';
				if ( $q !== '' || $a !== '' ) {
					$parts[] = "[{$p}] Q: {$q}\nA: {$a}";
				}
			}
		}

		foreach ( $items as $i => $item ) {
			$parts[] = "PAGE: {$item['title']}\nURL: {$item['url']}\nType: {$item['type']}\n{$item['excerpt']}";
		}

		return implode( "\n\n", $parts );
	}

	/**
	 * Build the full site index from NEO Pulse sitemap post types (every XML sitemap URL).
	 */
	private static function build_index( array $settings = array() ): array {
		if ( ! class_exists( 'Neo_Pulse_Wp_Sitemap_Generator', false ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-sitemap-generator.php';
		}
		if ( ! class_exists( 'Neo_Pulse_Wp_Sitemap_Settings', false ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-sitemap-settings.php';
		}

		$config       = Neo_Pulse_Wp_Sitemap_Settings::get_config();
		$full_content = ! empty( $settings['full_content'] );
		$trim_length  = $full_content ? 120 : 40;
		$index        = array();

		foreach ( Neo_Pulse_Wp_Sitemap_Generator::collect_all_posts( $config ) as $row ) {
			$post = $row['post'];
			$pt   = sanitize_key( (string) $row['type'] );
			if ( ! ( $post instanceof WP_Post ) ) {
				continue;
			}

			$mapped = self::map_post_to_index_item( $post, $pt, $trim_length );
			if ( null !== $mapped ) {
				$index[] = $mapped;
			}
		}

		return $index;
	}

	/**
	 * @return array<string,mixed>|null
	 */
	private static function map_post_to_index_item( WP_Post $post, string $post_type, int $trim_length = 40 ): ?array {
		if ( (string) $post->post_password !== '' ) {
			return null; // Password-protected: keep out of the visitor chat index.
		}
		$url = get_permalink( $post );
		if ( ! $url ) {
			return null;
		}

		$cats    = array();
		$cat_ids = array();
		$tags    = array();

		if ( is_object_in_taxonomy( $post_type, 'category' ) ) {
			$cat_terms = get_the_terms( $post->ID, 'category' );
			if ( is_array( $cat_terms ) ) {
				$cats    = wp_list_pluck( $cat_terms, 'name' );
				$cat_ids = array_map( 'intval', wp_list_pluck( $cat_terms, 'term_id' ) );
			}
		}
		if ( is_object_in_taxonomy( $post_type, 'post_tag' ) ) {
			$tag_terms = get_the_terms( $post->ID, 'post_tag' );
			if ( is_array( $tag_terms ) ) {
				$tags = wp_list_pluck( $tag_terms, 'name' );
			}
		}

		if ( has_excerpt( $post->ID ) ) {
			$excerpt = wp_strip_all_tags( get_the_excerpt( $post ) );
		} else {
			$excerpt = wp_trim_words( wp_strip_all_tags( $post->post_content ), $trim_length, '...' );
		}

		return array(
			'id'            => $post->ID,
			'title'         => Neo_Pulse_Wp_Display_Text::decode( get_the_title( $post ) ),
			'url'           => $url,
			'slug'          => (string) $post->post_name,
			'excerpt'       => Neo_Pulse_Wp_Display_Text::decode( $excerpt ),
			'type'          => $post_type,
			'categories'    => $cats,
			'category_ids'  => $cat_ids,
			'tags'          => $tags,
			'focus_keyword' => Neo_Pulse_Wp_Ai_Context::read_focus_keyword( $post->ID ),
		);
	}

	/**
	 * Post types backing the chat site index (sitemap XML ∩ chat training selection).
	 *
	 * @param array<string,mixed> $settings Optional chat settings.
	 * @return array<int, string>
	 */
	public static function get_index_post_types( array $settings = array() ): array {
		if ( ! class_exists( 'Neo_Pulse_Wp_Sitemap_Generator', false ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-sitemap-generator.php';
		}
		if ( ! class_exists( 'Neo_Pulse_Wp_Sitemap_Settings', false ) ) {
			require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-sitemap-settings.php';
		}

		$config        = Neo_Pulse_Wp_Sitemap_Settings::get_config();
		$sitemap_types = Neo_Pulse_Wp_Sitemap_Generator::enabled_post_types( $config );
		$allowed       = self::allowed_index_post_types( $settings );

		return array_values( array_intersect( $sitemap_types, $allowed ) );
	}

	/**
	 * Fuzzy score from slug, URL path, and title term overlap (no content gate).
	 *
	 * @param array<string,mixed> $item
	 */
	public static function fuzzy_page_score( string $message, array $item, array $extra_phrases = array() ): float {
		$match_terms = self::extract_match_terms( $message, $extra_phrases );
		if ( empty( $match_terms ) ) {
			return 0.0;
		}

		$slug_lower  = self::item_slug_lower( $item );
		$url_path    = self::item_url_path_lower( $item );
		$path_hyphen = self::item_url_path_hyphen_lower( $item );
		$title_lower = strtolower( wp_strip_all_tags( (string) ( $item['title'] ?? '' ) ) );
		$score       = 0.0;

		foreach ( $match_terms as $term ) {
			$term_len = strlen( $term );
			if ( $term_len < 2 ) {
				continue;
			}

			$hit_slug   = $slug_lower !== '' && strpos( $slug_lower, $term ) !== false;
			$hit_path   = $url_path !== '' && strpos( $url_path, $term ) !== false;
			$hit_hyphen = $path_hyphen !== '' && strpos( $path_hyphen, $term ) !== false;
			$hit_title  = $title_lower !== '' && strpos( $title_lower, $term ) !== false;

			if ( $hit_slug || $hit_path || $hit_hyphen || $hit_title ) {
				$score += (float) $term_len;
			}

			if ( strpos( $term, '-' ) !== false && strpos( $term, ' ' ) === false && ( $hit_slug || $hit_hyphen ) ) {
				$score += 15.0;
			}
		}

		if ( $score > 0 && isset( $item['type'] ) && (string) $item['type'] === 'page' ) {
			$score += 8.0;
		}

		return $score;
	}

	/**
	 * Scan the full site index and return top fuzzy matches.
	 *
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<int,array<string,mixed>>
	 */
	public static function find_fuzzy_topic_pages( string $message, array $site_index, int $limit = 3, array $extra_phrases = array() ): array {
		$message = trim( $message );
		if ( $message === '' || empty( $site_index ) || $limit < 1 ) {
			return array();
		}

		$scored = array();
		foreach ( $site_index as $item ) {
			if ( empty( $item['url'] ) ) {
				continue;
			}
			$fuzzy = self::fuzzy_page_score( $message, $item, $extra_phrases );
			if ( $fuzzy < self::FUZZY_MIN_SCORE ) {
				continue;
			}
			$item['fuzzy_score'] = $fuzzy;
			$scored[]            = $item;
		}

		if ( empty( $scored ) ) {
			return array();
		}

		usort(
			$scored,
			function ( $a, $b ) {
				return ( $b['fuzzy_score'] ?? 0 ) <=> ( $a['fuzzy_score'] ?? 0 );
			}
		);

		return array_slice( $scored, 0, $limit );
	}

	/**
	 * All index items whose slug or URL path hits any match term.
	 *
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<int,array<string,mixed>>
	 */
	public static function index_url_term_hits( string $message, array $site_index, array $extra_phrases = array() ): array {
		$match_terms = self::extract_match_terms( $message, $extra_phrases );
		if ( empty( $match_terms ) || empty( $site_index ) ) {
			return array();
		}

		$hits = array();
		foreach ( $site_index as $item ) {
			if ( empty( $item['url'] ) ) {
				continue;
			}
			if ( ! self::terms_hit_slug_or_path( $item, $match_terms ) ) {
				continue;
			}
			$hits[] = array(
				'id'    => isset( $item['id'] ) ? (int) $item['id'] : 0,
				'title' => isset( $item['title'] ) ? (string) $item['title'] : '',
				'slug'  => isset( $item['slug'] ) ? (string) $item['slug'] : '',
				'url'   => (string) $item['url'],
				'score' => self::fuzzy_page_score( $message, $item, $extra_phrases ),
			);
		}

		usort(
			$hits,
			function ( $a, $b ) {
				return ( $b['score'] ?? 0 ) <=> ( $a['score'] ?? 0 );
			}
		);

		return $hits;
	}

	/**
	 * Strip chip-style prefixes so retrieval focuses on the topic phrase.
	 */
	public static function normalize_retrieval_query( string $query ): string {
		$query = trim( $query );
		if ( preg_match( '/^tell me about\s+/i', $query ) ) {
			$query = preg_replace( '/^tell me about\s+/i', '', $query );
		}
		return trim( $query );
	}

	/**
	 * Extract meaningful search terms from a query string.
	 *
	 * @return array<int,string>
	 */
	public static function extract_terms( string $query ): array {
		$stop_words = array(
			'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'for',
			'of', 'and', 'or', 'but', 'not', 'with', 'this', 'that', 'from',
			'by', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
			'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
			'may', 'might', 'can', 'i', 'you', 'we', 'they', 'he', 'she',
			'me', 'my', 'your', 'what', 'where', 'when', 'how', 'which',
			'who', 'whom', 'about', 'up', 'out', 'so', 'if', 'then', 'than',
			'too', 'very', 'just', 'more', 'also', 'any', 'each', 'all',
		);

		$query  = self::normalize_retrieval_query( $query );
		$query  = strtolower( trim( $query ) );
		$query  = preg_replace( '/[^\w\s]/', ' ', $query );
		$words  = preg_split( '/\s+/', $query, -1, PREG_SPLIT_NO_EMPTY );
		$terms  = array();

		foreach ( $words as $w ) {
			if ( strlen( $w ) >= 2 && ! in_array( $w, $stop_words, true ) ) {
				$terms[] = $w;
			}
		}

		return array_unique( $terms );
	}

	/**
	 * Singles plus hyphenated/spaced bigrams for slug and URL path matching.
	 *
	 * @param array<int,string> $extra_phrases Phase A search_terms or other multi-word phrases.
	 * @return array<int,string>
	 */
	public static function extract_match_terms( string $query, array $extra_phrases = array() ): array {
		$stop_words = array(
			'a', 'an', 'the', 'is', 'it', 'in', 'on', 'at', 'to', 'for',
			'of', 'and', 'or', 'but', 'not', 'with', 'this', 'that', 'from',
			'by', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
			'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
			'may', 'might', 'can', 'i', 'you', 'we', 'they', 'he', 'she',
			'me', 'my', 'your', 'what', 'where', 'when', 'how', 'which',
			'who', 'whom', 'about', 'up', 'out', 'so', 'if', 'then', 'than',
			'too', 'very', 'just', 'more', 'also', 'any', 'each', 'all',
		);

		$terms   = self::extract_terms( $query );
		$normalized = strtolower( trim( self::normalize_retrieval_query( $query ) ) );
		$normalized = preg_replace( '/[^\w\s]/', ' ', $normalized );
		$words   = preg_split( '/\s+/', $normalized, -1, PREG_SPLIT_NO_EMPTY );

		for ( $i = 0; $i < count( $words ) - 1; $i++ ) {
			$w1 = $words[ $i ];
			$w2 = $words[ $i + 1 ];
			if ( strlen( $w1 ) < 2 || strlen( $w2 ) < 2 ) {
				continue;
			}
			if ( in_array( $w1, $stop_words, true ) || in_array( $w2, $stop_words, true ) ) {
				continue;
			}
			$terms[] = $w1 . '-' . $w2;
			$terms[] = $w1 . ' ' . $w2;
		}

		foreach ( $extra_phrases as $phrase ) {
			$phrase = strtolower( trim( (string) $phrase ) );
			if ( $phrase === '' ) {
				continue;
			}
			$terms[] = $phrase;
			$terms[] = str_replace( ' ', '-', $phrase );
			foreach ( self::extract_terms( $phrase ) as $part ) {
				$terms[] = $part;
			}
		}

		return array_values( array_unique( array_filter( $terms ) ) );
	}

	/**
	 * @param array<int,string> $match_terms
	 */
	public static function terms_hit_slug_or_path( array $item, array $match_terms ): bool {
		if ( empty( $match_terms ) ) {
			return false;
		}
		$slug_lower  = self::item_slug_lower( $item );
		$url_path    = self::item_url_path_lower( $item );
		$path_hyphen = self::item_url_path_hyphen_lower( $item );
		foreach ( $match_terms as $term ) {
			if ( $slug_lower !== '' && strpos( $slug_lower, $term ) !== false ) {
				return true;
			}
			if ( $url_path !== '' && strpos( $url_path, $term ) !== false ) {
				return true;
			}
			if ( $path_hyphen !== '' && strpos( $path_hyphen, $term ) !== false ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @param array<int,string> $match_terms
	 */
	public static function count_match_term_slug_path_hits( array $item, array $match_terms ): int {
		if ( empty( $match_terms ) ) {
			return 0;
		}
		$slug_lower  = self::item_slug_lower( $item );
		$url_path    = self::item_url_path_lower( $item );
		$path_hyphen = self::item_url_path_hyphen_lower( $item );
		$hits        = 0;
		foreach ( $match_terms as $term ) {
			$matched = ( $slug_lower !== '' && strpos( $slug_lower, $term ) !== false )
				|| ( $url_path !== '' && strpos( $url_path, $term ) !== false )
				|| ( $path_hyphen !== '' && strpos( $path_hyphen, $term ) !== false );
			if ( $matched ) {
				++$hits;
			}
		}
		return $hits;
	}

	/**
	 * Score a single index item against the extracted terms.
	 * Title 3x, excerpt 2x, slug/URL path 2x, focus keyword 2x, categories/tags 1x.
	 */
	private static function score_item( array $item, array $terms ): float {
		$score         = 0.0;
		$title_lower   = strtolower( (string) ( $item['title'] ?? '' ) );
		$excerpt_lower = strtolower( (string) ( $item['excerpt'] ?? '' ) );
		$cats_lower    = strtolower( implode( ' ', $item['categories'] ?? array() ) );
		$tags_lower    = strtolower( implode( ' ', $item['tags'] ?? array() ) );
		$slug_lower    = strtolower( (string) ( $item['slug'] ?? '' ) );
		$url_path      = '';
		if ( ! empty( $item['url'] ) ) {
			$parsed = wp_parse_url( (string) $item['url'], PHP_URL_PATH );
			if ( is_string( $parsed ) && $parsed !== '' ) {
				$url_path = strtolower( str_replace( '-', ' ', $parsed ) );
			}
		}
		$focus_lower = strtolower( (string) ( $item['focus_keyword'] ?? '' ) );

		foreach ( $terms as $term ) {
			if ( $title_lower !== '' && strpos( $title_lower, $term ) !== false ) {
				$score += 3.0;
			}
			if ( $excerpt_lower !== '' && strpos( $excerpt_lower, $term ) !== false ) {
				$score += 2.0;
			}
			if ( $slug_lower !== '' && strpos( $slug_lower, $term ) !== false ) {
				$score += 2.0;
			}
			if ( $url_path !== '' && strpos( $url_path, $term ) !== false ) {
				$score += 2.0;
			}
			if ( $focus_lower !== '' && strpos( $focus_lower, $term ) !== false ) {
				$score += 2.0;
			}
			if ( $cats_lower !== '' && strpos( $cats_lower, $term ) !== false ) {
				$score += 1.0;
			}
			if ( $tags_lower !== '' && strpos( $tags_lower, $term ) !== false ) {
				$score += 1.0;
			}
		}

		return $score;
	}

	/**
	 * Invalidate the cached index (call on post save, training save, etc.).
	 */
	public static function invalidate_cache(): void {
		delete_transient( self::CACHE_KEY );
		delete_transient( self::AGENT_INDEX_CACHE_KEY );
		delete_transient( self::AGENT_INDEX_CACHE_KEY . '_drafts' );
		Neo_Pulse_Wp_Chat_Starters::invalidate_cache();
		Neo_Pulse_Wp_Chat_Lead::invalidate_widget_contact_cache();
	}

	const AGENT_INDEX_CACHE_KEY = 'neo-pulse_agent_site_index_cache';

	/**
	 * Site index for MCP/agents: published + optional drafts, with SEO fields.
	 *
	 * @param bool $include_drafts Include non-publish statuses.
	 * @return array<int, array<string, mixed>>
	 */
	public static function get_agent_site_index( bool $include_drafts = false ): array {
		$cache_key = self::AGENT_INDEX_CACHE_KEY . ( $include_drafts ? '_drafts' : '' );
		$cached    = get_transient( $cache_key );
		if ( is_array( $cached ) && ! empty( $cached ) ) {
			return $cached;
		}

		$statuses = $include_drafts
			? array( 'publish', 'draft', 'pending', 'future', 'private' )
			: array( 'publish' );

		$post_types = apply_filters( 'neo_pulse_wp_agent_index_post_types', array( 'post', 'page' ) );
		$index      = array();

		foreach ( $post_types as $pt ) {
			if ( ! post_type_exists( $pt ) ) {
				continue;
			}
			$page = 1;
			do {
				$items = get_posts(
					array(
						'post_type'      => $pt,
						'post_status'    => $statuses,
						'posts_per_page' => 100,
						'paged'          => $page,
						'orderby'        => 'modified',
						'order'          => 'DESC',
					)
				);
				foreach ( $items as $post ) {
					$focus = Neo_Pulse_Wp_Ai_Context::read_focus_keyword( $post->ID );
					$research = Neo_Pulse_Wp_Ai_Context::read_field_value( $post->ID, 'seo_research' );
					$index[] = array(
						'id'             => $post->ID,
						'title'          => get_the_title( $post ),
						'url'            => get_permalink( $post ),
						'excerpt'        => (string) $post->post_password !== ''
							? ''
							: ( has_excerpt( $post->ID )
								? wp_strip_all_tags( get_the_excerpt( $post ) )
								: wp_trim_words( wp_strip_all_tags( $post->post_content ), 40, '...' ) ),
						'type'           => $pt,
						'status'         => $post->post_status,
						'focus_keyword'  => $focus,
						'has_seo_research' => $research !== '',
						'modified'       => $post->post_modified_gmt,
					);
				}
				$page++;
			} while ( count( $items ) === 100 );
		}

		if ( ! empty( $index ) ) {
			set_transient( $cache_key, $index, self::CACHE_TTL );
		}

		return $index;
	}

	/**
	 * Search agent site index (same scoring as visitor RAG).
	 *
	 * @param string $query Query.
	 * @param int    $limit Max results.
	 * @return array<int, array<string, mixed>>
	 */
	public static function retrieve_agent( string $query, int $limit = self::MAX_RESULTS ): array {
		$index = self::get_agent_site_index( false );
		if ( empty( $index ) ) {
			return array();
		}

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
				return ( $b['score'] ?? 0 ) <=> ( $a['score'] ?? 0 );
			}
		);

		return array_slice( $scored, 0, $limit );
	}
}
