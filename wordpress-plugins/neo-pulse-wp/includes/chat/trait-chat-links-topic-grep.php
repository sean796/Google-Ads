<?php
/**
 * Chat topic link search and scoring.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Links_Trait_Topic_Grep {

	/**
	 * Grep site items for URLs relevant to the user message and drafted answer.
	 *
	 * @param array<int,array<string,mixed>> $items
	 * @param array<string,mixed>            $classification Phase A output.
	 * @return array<int,array{label:string,url:string,icon:string}>
	 */
	public static function grep_links_for_suggestion( string $user_message, string $answer, array $items, array $classification, array $site_index = array() ): array {
		$intent       = isset( $classification['intent'] ) ? (string) $classification['intent'] : 'question';
		$site_url     = home_url( '/' );
		$found        = array();
		$order        = array();
		$topic_intent = in_array( $intent, array( 'question', 'support' ), true );
		$phrases      = self::phrase_context( $classification );

		if ( $topic_intent ) {
			foreach ( self::pick_topic_links( $user_message, $items, 3, $site_index, true, $phrases ) as $link ) {
				$item = array(
					'title' => $link['label'],
					'url'   => $link['url'],
					'type'  => ( isset( $link['icon'] ) && $link['icon'] === 'post' ) ? 'post' : 'page',
				);
				self::add_link( $found, $order, $item, $site_url );
			}
		} else {
			foreach ( $items as $item ) {
				if ( empty( $item['url'] ) || empty( $item['title'] ) ) {
					continue;
				}
				if ( self::title_mentioned_in_text( (string) $item['title'], $answer ) ) {
					self::add_link( $found, $order, $item, $site_url );
				}
			}

			$harness_items = self::to_harness_items( $items );
			$query         = trim( $user_message . ' ' . $answer );
			$greped        = Neo_Pulse_Wp_Harness_Links::grep_linkable_posts( $harness_items, $query, 8 );
			foreach ( $greped as $post ) {
				$item = self::from_harness_post( $post, $items );
				if ( null !== $item ) {
					self::add_link( $found, $order, $item, $site_url );
				}
			}

			if ( in_array( $intent, array( 'navigation', 'recommendation' ), true ) ) {
				foreach ( array_slice( $items, 0, 3 ) as $item ) {
					if ( ! empty( $item['url'] ) && ! empty( $item['title'] ) ) {
						self::add_link( $found, $order, $item, $site_url );
					}
				}
			}
		}

		$links = array();
		foreach ( $order as $norm ) {
			if ( isset( $found[ $norm ] ) ) {
				$links[] = $found[ $norm ];
			}
		}

		return self::filter_links_to_index( $links, $site_index );
	}

	/**
	 * Rank items by slug/title/URL match to the user message.
	 *
	 * @param array<int,array<string,mixed>> $items
	 * @return array<int,array{label:string,url:string,icon:string}>
	 */
	public static function pick_topic_links( string $user_message, array $items, int $limit = 3, array $site_index = array(), bool $strict = false, array $extra_phrases = array(), array $exclude_urls = array() ): array {
		$user_message = trim( $user_message );
		$pool         = ! empty( $site_index ) ? $site_index : $items;
		if ( $user_message === '' || empty( $pool ) ) {
			return array();
		}

		$exclude = array();
		foreach ( $exclude_urls as $url ) {
			$norm = Neo_Pulse_Wp_Chat_History::normalize_url( (string) $url );
			if ( $norm !== '' ) {
				$exclude[ $norm ] = true;
			}
		}

		$fetch_limit = max( $limit * 8, 12 );
		$links       = array();
		foreach ( Neo_Pulse_Wp_Chat_Rag::find_fuzzy_topic_pages( $user_message, $pool, $fetch_limit, $extra_phrases ) as $item ) {
			$norm = Neo_Pulse_Wp_Chat_History::normalize_url( (string) ( $item['url'] ?? '' ) );
			if ( $norm === '' || isset( $exclude[ $norm ] ) ) {
				continue;
			}
			$phrases = self::anchor_phrases_for_item( $item );
			$label   = ! empty( $phrases[0] ) ? $phrases[0] : (string) ( $item['title'] ?? '' );
			if ( $label === '' ) {
				continue;
			}
			$links[] = array(
				'label' => ucwords( $label ),
				'url'   => (string) $item['url'],
				'icon'  => ( isset( $item['type'] ) && $item['type'] === 'post' ) ? 'post' : 'page',
				'score' => (float) ( $item['fuzzy_score'] ?? 0 ),
			);
			if ( count( $links ) >= $limit ) {
				break;
			}
		}

		return $links;
	}

	/**
	 * Best fuzzy-matched service/topic page for CTA.
	 *
	 * @param array<int,array<string,mixed>> $items
	 * @return array{label:string,url:string,icon:string,score:float}|null
	 */
	public static function pick_primary_topic_link( string $user_message, array $items, array $site_index = array(), array $extra_phrases = array(), array $exclude_urls = array() ): ?array {
		$links = self::pick_topic_links( $user_message, $items, 1, $site_index, true, $extra_phrases, $exclude_urls );
		return ! empty( $links ) ? $links[0] : null;
	}

	/**
	 * @param array<string,mixed> $classification
	 * @return array<int,string>
	 */
	private static function phrase_context( array $classification ): array {
		return isset( $classification['search_terms'] ) ? array_values( (array) $classification['search_terms'] ) : array();
	}

	/**
	 * @param array<int,array<string,mixed>> $pool
	 * @return array<int,array{item:array<string,mixed>,score:float}>
	 */
	private static function score_topic_pool( string $user_message, array $pool, bool $strict, array $extra_phrases = array() ): array {
		$scored = array();
		foreach ( $pool as $item ) {
			if ( empty( $item['url'] ) ) {
				continue;
			}
			$has_slug  = Neo_Pulse_Wp_Chat_Rag::item_has_topic_slug_match( $user_message, $item, $extra_phrases );
			$term_hits = Neo_Pulse_Wp_Chat_Rag::count_slug_path_term_hits( $user_message, $item, $extra_phrases );
			$score     = Neo_Pulse_Wp_Chat_Rag::score_topic_match( $user_message, $item, $extra_phrases );

			if ( $strict ) {
				if ( ! $has_slug || $score <= 0 ) {
					continue;
				}
				if ( $term_hits < 2 && ! self::has_strong_single_slug_match( $user_message, $item, $extra_phrases ) ) {
					continue;
				}
			} elseif ( ! $has_slug && $score < 6.0 ) {
				continue;
			} elseif ( $score <= 0 ) {
				continue;
			}

			$scored[] = array(
				'item'  => $item,
				'score' => $score,
			);
		}

		if ( empty( $scored ) ) {
			return array();
		}

		usort(
			$scored,
			function ( $a, $b ) use ( $user_message, $extra_phrases ) {
				$score_cmp = ( $b['score'] ?? 0 ) <=> ( $a['score'] ?? 0 );
				if ( $score_cmp !== 0 ) {
					return $score_cmp;
				}
				return Neo_Pulse_Wp_Chat_Rag::slug_focus_score( $user_message, $b['item'], $extra_phrases ) <=> Neo_Pulse_Wp_Chat_Rag::slug_focus_score( $user_message, $a['item'], $extra_phrases );
			}
		);

		return $scored;
	}

	/**
	 * Single-segment procedure slugs (e.g. invisalign) qualify with one strong term hit.
	 *
	 * @param array<string,mixed> $item
	 */
	private static function has_strong_single_slug_match( string $user_message, array $item, array $extra_phrases = array() ): bool {
		$match_terms = Neo_Pulse_Wp_Chat_Rag::extract_match_terms( $user_message, $extra_phrases );
		if ( empty( $match_terms ) ) {
			return false;
		}
		$slug = isset( $item['slug'] ) ? strtolower( (string) $item['slug'] ) : '';
		if ( $slug === '' && ! empty( $item['url'] ) ) {
			$path = wp_parse_url( (string) $item['url'], PHP_URL_PATH );
			if ( is_string( $path ) && $path !== '' ) {
				$slug = strtolower( trim( basename( untrailingslashit( $path ) ), '/' ) );
			}
		}
		if ( $slug === '' ) {
			return false;
		}
		foreach ( $match_terms as $term ) {
			if ( strlen( $term ) < 4 ) {
				continue;
			}
			if ( $slug === $term || strpos( $slug, $term ) !== false ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Natural anchor phrases from slug/title (longest first).
	 *
	 * @param array<string,mixed> $item
	 * @return array<int,string>
	 */
	public static function anchor_phrases_for_item( array $item ): array {
		$phrases = array();
		$slug    = isset( $item['slug'] ) ? trim( (string) $item['slug'] ) : '';

		if ( $slug === '' && ! empty( $item['url'] ) ) {
			$path = wp_parse_url( (string) $item['url'], PHP_URL_PATH );
			if ( is_string( $path ) && $path !== '' ) {
				$slug = trim( basename( untrailingslashit( $path ) ), '/' );
			}
		}

		if ( $slug !== '' ) {
			$phrases[] = str_replace( '-', ' ', $slug );
			$parts     = array_filter( explode( '-', $slug ) );
			if ( count( $parts ) >= 2 ) {
				$phrases[] = str_replace( '-', ' ', implode( '-', array_slice( $parts, -2 ) ) );
			}
			if ( count( $parts ) >= 1 ) {
				$phrases[] = str_replace( '-', ' ', end( $parts ) );
			}
		}

		if ( ! empty( $item['title'] ) ) {
			$title = trim( (string) $item['title'] );
			if ( $title !== '' ) {
				$phrases[] = $title;
				$stripped  = trim( preg_replace( '/[®™©]/u', '', $title ) );
				if ( $stripped !== '' && strcasecmp( $stripped, $title ) !== 0 ) {
					$phrases[] = $stripped;
				}
			}
		}

		if ( ! empty( $item['focus_keyword'] ) ) {
			$kw = trim( (string) $item['focus_keyword'] );
			if ( $kw !== '' ) {
				$phrases[] = $kw;
			}
		}

		$unique = array();
		foreach ( $phrases as $phrase ) {
			$phrase = trim( preg_replace( '/\s+/', ' ', $phrase ) );
			if ( strlen( $phrase ) < 3 ) {
				continue;
			}
			$key = strtolower( $phrase );
			if ( ! isset( $unique[ $key ] ) ) {
				$unique[ $key ] = $phrase;
			}
		}

		$out = array_values( $unique );
		usort(
			$out,
			function ( $a, $b ) {
				return strlen( $b ) <=> strlen( $a );
			}
		);

		return $out;
	}

	/**
	 * @param array{label:string,url:string,icon?:string} $link
	 * @param array<int,array<string,mixed>>              $items
	 * @return array<string,mixed>
	 */
	private static function link_to_item( array $link, array $items, array $site_index = array() ): array {
		$url_norm = strtolower( rtrim( (string) $link['url'], '/' ) );
		$pools    = array_merge( $items, $site_index );
		foreach ( $pools as $item ) {
			if ( empty( $item['url'] ) ) {
				continue;
			}
			if ( strtolower( rtrim( (string) $item['url'], '/' ) ) === $url_norm ) {
				return $item;
			}
		}
		return array(
			'title' => isset( $link['label'] ) ? (string) $link['label'] : '',
			'url'   => (string) $link['url'],
			'type'  => ( isset( $link['icon'] ) && $link['icon'] === 'post' ) ? 'post' : 'page',
		);
	}

	private static function title_mentioned_in_text( string $title, string $text ): bool {
		$title = trim( $title );
		if ( $title === '' || $text === '' ) {
			return false;
		}
		return stripos( $text, $title ) !== false;
	}

	/**
	 * @param array<int,array<string,mixed>> $items
	 * @return array<int,array<string,mixed>>
	 */
	private static function to_harness_items( array $items ): array {
		$out = array();
		foreach ( $items as $item ) {
			if ( empty( $item['url'] ) ) {
				continue;
			}
			$slug = '';
			$path = wp_parse_url( (string) $item['url'], PHP_URL_PATH );
			if ( is_string( $path ) && $path !== '' ) {
				$slug = trim( basename( untrailingslashit( $path ) ), '/' );
			}
			$out[] = array(
				'id'      => isset( $item['id'] ) ? (int) $item['id'] : 0,
				'title'   => isset( $item['title'] ) ? (string) $item['title'] : '',
				'excerpt' => isset( $item['excerpt'] ) ? (string) $item['excerpt'] : '',
				'slug'    => $slug,
				'link'    => (string) $item['url'],
			);
		}
		return $out;
	}

	/**
	 * @param array<string,mixed>              $post
	 * @param array<int,array<string,mixed>>   $original_items
	 * @return array<string,mixed>|null
	 */
	private static function from_harness_post( array $post, array $original_items ): ?array {
		$link = isset( $post['link'] ) ? (string) $post['link'] : '';
		foreach ( $original_items as $item ) {
			if ( isset( $item['url'] ) && (string) $item['url'] === $link ) {
				return $item;
			}
		}
		if ( $link !== '' && ! empty( $post['title'] ) ) {
			return array(
				'id'    => isset( $post['id'] ) ? (int) $post['id'] : 0,
				'title' => (string) $post['title'],
				'url'   => $link,
				'type'  => 'page',
			);
		}
		return null;
	}

	/**
	 * @param array<string,array{label:string,url:string,icon:string}> $found
	 * @param array<int,string>                                        $order
	 * @param array<string,mixed>                                      $item
	 */
	private static function add_link( array &$found, array &$order, array $item, string $site_url ): void {
		$url = trim( (string) $item['url'] );
		if ( $url === '' ) {
			return;
		}
		$norm = Neo_Pulse_Wp_Harness_Links::normalize_internal_url( $site_url, $url );
		if ( $norm === '' ) {
			$norm = strtolower( rtrim( $url, '/' ) );
		}
		if ( isset( $found[ $norm ] ) ) {
			return;
		}
		$found[ $norm ] = array(
			'label' => (string) $item['title'],
			'url'   => $url,
			'icon'  => ( isset( $item['type'] ) && $item['type'] === 'post' ) ? 'post' : 'page',
		);
		$order[]        = $norm;
	}

	/**
	 * @param array<int,array{label:string,url:string,icon?:string}> $existing
	 * @param array<int,array{label:string,url:string,icon:string}>  $greped
	 * @return array<int,array{label:string,url:string,icon:string}>
	 */
	private static function merge_links( array $existing, array $greped, string $site_url ): array {
		$found = array();
		$order = array();

		foreach ( $existing as $link ) {
			if ( ! is_array( $link ) || empty( $link['url'] ) ) {
				continue;
			}
			$item = array(
				'title' => isset( $link['label'] ) ? (string) $link['label'] : '',
				'url'   => (string) $link['url'],
				'type'  => ( isset( $link['icon'] ) && $link['icon'] === 'post' ) ? 'post' : 'page',
			);
			self::add_link( $found, $order, $item, $site_url );
			$norm = end( $order );
			if ( is_string( $norm ) && isset( $found[ $norm ] ) ) {
				if ( ! empty( $link['label'] ) ) {
					$found[ $norm ]['label'] = (string) $link['label'];
				}
				if ( ! empty( $link['icon'] ) ) {
					$found[ $norm ]['icon'] = (string) $link['icon'];
				}
			}
		}

		foreach ( $greped as $link ) {
			$item = array(
				'title' => $link['label'],
				'url'   => $link['url'],
				'type'  => ( isset( $link['icon'] ) && $link['icon'] === 'post' ) ? 'post' : 'page',
			);
			self::add_link( $found, $order, $item, $site_url );
		}

		$merged = array();
		foreach ( $order as $norm ) {
			if ( isset( $found[ $norm ] ) ) {
				$merged[] = $found[ $norm ];
			}
		}
		return $merged;
	}
}
