<?php
/**
 * Blog discovery, gate inventory, and topic scoring for chat RAG.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Rag_Trait_Discovery_Scoring {

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
}
