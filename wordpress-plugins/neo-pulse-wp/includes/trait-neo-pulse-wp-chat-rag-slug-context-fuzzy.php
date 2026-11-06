<?php
/**
 * Slug and URL helpers, context formatting, sitemap index building, and fuzzy page matching for chat RAG.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Rag_Trait_Slug_Context_Fuzzy {

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
}
