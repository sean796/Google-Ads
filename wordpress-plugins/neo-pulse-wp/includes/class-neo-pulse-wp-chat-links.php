<?php
/**
 * Deterministic link grep and card attachment for NEO Pulse Chat.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_wp_chat_links_dir = __DIR__ . '/chat/';
require_once $neo_pulse_wp_chat_links_dir . 'trait-chat-links-lead-and-service-area.php';
require_once $neo_pulse_wp_chat_links_dir . 'trait-chat-links-topic-grep.php';
require_once $neo_pulse_wp_chat_links_dir . 'trait-chat-links-body-pool.php';
require_once $neo_pulse_wp_chat_links_dir . 'trait-chat-links-list-lines.php';
require_once $neo_pulse_wp_chat_links_dir . 'trait-chat-links-markdown-repair.php';

class Neo_Pulse_Wp_Chat_Links {

	use Neo_Pulse_Wp_Chat_Links_Trait_Lead_And_Service_Area;
	use Neo_Pulse_Wp_Chat_Links_Trait_Topic_Grep;
	use Neo_Pulse_Wp_Chat_Links_Trait_Body_Pool;
	use Neo_Pulse_Wp_Chat_Links_Trait_List_Lines;
	use Neo_Pulse_Wp_Chat_Links_Trait_Markdown_Repair;

	/**
	 * Prompt block listing title → URL for retrieved items.
	 *
	 * @param array<int,array<string,mixed>> $items RAG items with title + url.
	 */
	public static function build_links_context_block( array $items ): string {
		$lines = array();
		foreach ( $items as $item ) {
			if ( empty( $item['url'] ) || empty( $item['title'] ) ) {
				continue;
			}
			$lines[] = '- ' . $item['title'] . ' → ' . $item['url'];
		}
		return implode( "\n", $lines );
	}

	/**
	 * LINKS AVAILABLE block with lead pages prepended for Phase B.
	 *
	 * @param array<int,array<string,mixed>> $items
	 * @param array<int,array<string,mixed>> $site_index
	 */
	public static function build_links_context_block_for_reason( string $message, array $items, array $site_index ): string {
		$lead   = self::find_lead_pages( $message, $site_index, 3 );
		$fuzzy  = Neo_Pulse_Wp_Chat_Rag::find_fuzzy_topic_pages( $message, $site_index, 12 );
		$merged = self::dedupe_items_by_id( array_merge( $lead, $items, $fuzzy ) );
		return self::build_links_context_block( $merged );
	}

	/**
	 * @param array<int,array<string,mixed>> $items
	 * @return array<int,array{label:string,url:string,icon:string}>
	 */
	public static function items_to_links( array $items ): array {
		$links = array();
		foreach ( $items as $item ) {
			if ( empty( $item['url'] ) || empty( $item['title'] ) ) {
				continue;
			}
			$links[] = array(
				'label' => (string) $item['title'],
				'url'   => (string) $item['url'],
				'icon'  => ( isset( $item['type'] ) && $item['type'] === 'post' ) ? 'post' : 'page',
			);
		}
		return $links;
	}

	/**
	 * @param array<int,array<string,mixed>> $items
	 * @return array<int,array<string,mixed>>
	 */
	public static function dedupe_items_by_id( array $items ): array {
		$out = array();
		foreach ( $items as $item ) {
			if ( ! is_array( $item ) || empty( $item['id'] ) ) {
				continue;
			}
			$out[ (int) $item['id'] ] = $item;
		}
		return array_values( $out );
	}

	/**
	 * @param array<int,array{label:string,url:string,icon:string}> ...$groups
	 * @return array<int,array{label:string,url:string,icon:string}>
	 */
	private static function merge_link_groups( array ...$groups ): array {
		$merged = array();
		$seen   = array();
		foreach ( $groups as $group ) {
			foreach ( $group as $link ) {
				if ( empty( $link['url'] ) ) {
					continue;
				}
				$norm = strtolower( rtrim( (string) $link['url'], '/' ) );
				if ( isset( $seen[ $norm ] ) ) {
					continue;
				}
				$seen[ $norm ] = true;
				$merged[]      = $link;
			}
		}
		return $merged;
	}

	/**
	 * Merge grep results into a card; set CTA and inline markdown links when missing.
	 *
	 * @param array<string,mixed>              $card
	 * @param array<int,array<string,mixed>>   $items
	 * @param array<string,mixed>              $classification
	 * @return array<string,mixed>
	 */
	public static function attach_to_card( array $card, string $user_message, string $answer, array $items, array $classification, array $site_index = array(), array $exclude_urls = array(), array $exclude_topics = array(), bool $skip_body_links = false ): array {
		$intent       = isset( $classification['intent'] ) ? (string) $classification['intent'] : 'question';
		$topic_intent = in_array( $intent, array( 'question', 'support' ), true );
		$phrases      = self::phrase_context( $classification );
		$site_url     = home_url( '/' );

		$lead_action = self::resolve_lead_action( $user_message, $site_index );
		$lead_pages  = $lead_action ? self::find_lead_pages( $user_message, $site_index, 3 ) : array();
		$lead_links  = self::items_to_links( $lead_pages );
		$card_type   = isset( $card['type'] ) ? (string) $card['type'] : '';

		if ( $topic_intent && $card_type !== 'lead' ) {
			$link_pool    = self::dedupe_items_by_id( array_merge( $items, $lead_pages ) );
			if ( empty( $link_pool ) ) {
				$link_pool = $site_index;
			}
			$primary_link = self::pick_primary_topic_link( $user_message, $items, $link_pool, $phrases, $exclude_urls );
			$topic_links  = self::pick_topic_links( $user_message, $items, 2, $link_pool, true, $phrases, $exclude_urls );

			$primary_arr = array();
			if ( null !== $primary_link ) {
				$primary_arr[] = array(
					'label' => $primary_link['label'],
					'url'   => $primary_link['url'],
					'icon'  => isset( $primary_link['icon'] ) ? $primary_link['icon'] : 'page',
				);
			}

			$merged = self::merge_link_groups( $lead_links, $primary_arr, $topic_links );
			$merged = self::filter_links_to_index( $merged, $site_index, $items );
			$merged = self::filter_excluded_urls( $merged, $exclude_urls );

			if ( ! empty( $merged ) ) {
				$card['links'] = array_slice( $merged, 0, 4 );
				$card['cta']   = array(
					'label' => $merged[0]['label'],
					'url'   => $merged[0]['url'],
				);
			} else {
				unset( $card['cta'] );
				$card['links'] = array();
			}

			if ( ! empty( $card['body'] ) && ! $skip_body_links ) {
				$card['body'] = self::apply_body_product_links(
					(string) $card['body'],
					$user_message,
					$items,
					$site_index,
					$lead_pages,
					$phrases
				);
			}

			return self::finalize_card_topics( $card, $user_message, $items, $site_index, $exclude_topics );
		}

		$greped   = self::grep_links_for_suggestion( $user_message, $answer, $items, $classification, $site_index );
		$existing = isset( $card['links'] ) && is_array( $card['links'] ) ? $card['links'] : array();
		$prefixed = self::merge_link_groups( $lead_links, $existing, $greped );
		$merged   = self::filter_links_to_index( self::merge_links( $prefixed, array(), $site_url ), $site_index, $items );
		$merged   = self::filter_excluded_urls( $merged, $exclude_urls );

		$card['links'] = $merged;

		if ( ! ( is_array( $card['cta'] ?? null ) && ! empty( $card['cta']['url'] ) ) && ! empty( $merged ) && ( in_array( $intent, array( 'navigation', 'recommendation' ), true ) || $card_type === 'lead' ) ) {
			$card['cta'] = array(
				'label' => $merged[0]['label'],
				'url'   => $merged[0]['url'],
			);
		} elseif ( is_array( $card['cta'] ?? null ) && ! empty( $card['cta']['url'] ) ) {
			$cta_allowed = self::filter_links_to_index( array( $card['cta'] ), $site_index, $items );
			$cta_allowed = self::filter_excluded_urls( $cta_allowed, $exclude_urls );
			if ( empty( $cta_allowed ) ) {
				unset( $card['cta'] );
			}
		}

		if ( ! empty( $card['body'] ) && ! $skip_body_links ) {
			$card['body'] = self::apply_body_product_links(
				(string) $card['body'],
				$user_message,
				$items,
				$site_index,
				$lead_pages,
				$phrases
			);
		}

		return self::finalize_card_topics( $card, $user_message, $items, $site_index, $exclude_topics );
	}

	/**
	 * One deterministic link pass for template cards (summarize / tell-me-about).
	 * AI body is plain text; URLs come from the page outline and site index pool.
	 *
	 * @param array<int,array<string,mixed>> $pool
	 * @param array<int,array<string,mixed>> $site_index
	 */
	public static function finalize_template_body_links( string $body, string $source, array $pool, array $site_index ): string {
		if ( $body === '' ) {
			return $body;
		}

		$body = self::normalize_list_line_markdown( $body );
		$body = self::strip_inline_markdown_links( $body );

		$links = self::extract_markdown_link_map( $source );
		$seen  = array();
		foreach ( $links as $link ) {
			$key = strtolower( (string) $link['phrase'] );
			$seen[ $key ] = true;
		}

		foreach ( self::unlinked_list_labels( $body ) as $label ) {
			$key = strtolower( $label );
			if ( isset( $seen[ $key ] ) ) {
				continue;
			}
			$match = self::best_pool_item_for_label( $label, $pool );
			if ( null === $match || empty( $match['url'] ) ) {
				continue;
			}
			$links[] = array(
				'phrase' => $label,
				'url'    => (string) $match['url'],
			);
			$seen[ $key ] = true;
		}

		if ( ! empty( $links ) ) {
			$body = self::apply_resolved_link_map( $body, $links );
		}

		$body = self::repair_malformed_markdown_links( $body );
		$body = self::strip_links_from_list_descriptions( $body );
		$body = self::strip_heading_markdown_links( $body );
		$body = self::strip_bracket_citations( $body );

		return self::dedupe_body_markdown_urls( $body );
	}

	/**
	 * Dedupe history chips then set related topics from the card.
	 *
	 * @param array<string,mixed>          $card
	 * @param array<int,array<string,mixed>> $items
	 * @param array<int,array<string,mixed>> $site_index
	 * @param array<int,string>            $exclude_topics
	 * @return array<string,mixed>
	 */
	private static function finalize_card_topics( array $card, string $user_message, array $items, array $site_index, array $exclude_topics ): array {
		unset( $user_message, $items, $site_index, $exclude_topics );
		unset( $card['relatedTopics'] );

		return $card;
	}

	/**
	 * @param array<string,mixed> $card
	 * @param array<int,string>   $exclude_topics
	 * @return array<string,mixed>
	 */
	private static function apply_topic_dedupe( array $card, array $exclude_topics ): array {
		if ( empty( $card['relatedTopics'] ) || ! is_array( $card['relatedTopics'] ) || empty( $exclude_topics ) ) {
			return $card;
		}

		$filtered = Neo_Pulse_Wp_Chat_History::filter_topics( $card['relatedTopics'], $exclude_topics );
		if ( empty( $filtered ) ) {
			unset( $card['relatedTopics'] );
		} else {
			$card['relatedTopics'] = $filtered;
		}

		return $card;
	}

	/**
	 * @param array<int,array{label:string,url:string,icon?:string}> $links
	 * @param array<int,string>                                      $exclude_urls
	 * @return array<int,array{label:string,url:string,icon?:string}>
	 */
	private static function filter_excluded_urls( array $links, array $exclude_urls ): array {
		if ( empty( $links ) || empty( $exclude_urls ) ) {
			return $links;
		}

		$exclude = array();
		foreach ( $exclude_urls as $url ) {
			$norm = Neo_Pulse_Wp_Chat_History::normalize_url( (string) $url );
			if ( $norm !== '' ) {
				$exclude[ $norm ] = true;
			}
		}

		$out = array();
		foreach ( $links as $link ) {
			if ( ! is_array( $link ) || empty( $link['url'] ) ) {
				continue;
			}
			$norm = Neo_Pulse_Wp_Chat_History::normalize_url( (string) $link['url'] );
			if ( $norm === '' || isset( $exclude[ $norm ] ) ) {
				continue;
			}
			$out[] = $link;
		}

		return $out;
	}
}
