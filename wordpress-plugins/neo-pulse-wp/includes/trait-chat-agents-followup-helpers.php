<?php
/**
 * Follow-up topic helper lookups and chip text.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Agents_Trait_FollowupHelpers {

	/**
	 * Keep chips that resolve to indexed pages; at most one chip per URL.
	 *
	 * @param array<int,string>              $topics
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<int,string>
	 */
	public static function dedupe_followup_topics_by_url( array $topics, array $site_index ): array {
		$chips = array();
		foreach ( $topics as $topic ) {
			if ( is_string( $topic ) && trim( $topic ) !== '' ) {
				$chips[] = array( 'text' => trim( $topic ) );
			}
		}

		return self::normalize_followup_chips( $chips, array(), array(), '', $site_index );
	}

	/**
	 * @param array<int,array<string,mixed>> $items
	 * @param array<int,array<string,mixed>> $site_index
	 * @param array<int,string>              $exclude_urls
	 */
	private static function build_followup_inventory_summary( array $items, array $site_index, array $exclude_urls = array() ): string {
		$exclude_norm = array();
		foreach ( $exclude_urls as $url ) {
			$norm = Neo_Pulse_Wp_Chat_History::normalize_url( (string) $url );
			if ( $norm !== '' ) {
				$exclude_norm[ $norm ] = true;
			}
		}

		$by_id = array();
		foreach ( array_merge( $items, $site_index ) as $item ) {
			$id = isset( $item['id'] ) ? (int) $item['id'] : 0;
			if ( $id > 0 ) {
				$by_id[ $id ] = $item;
			}
		}
		$lines = array();
		$count = 0;
		foreach ( $by_id as $item ) {
			if ( $count >= 40 ) {
				break;
			}
			$title = isset( $item['title'] ) ? trim( (string) $item['title'] ) : '';
			$url   = isset( $item['url'] ) ? trim( (string) $item['url'] ) : '';
			if ( $title === '' || $url === '' ) {
				continue;
			}
			$url_norm = Neo_Pulse_Wp_Chat_History::normalize_url( $url );
			if ( $url_norm !== '' && isset( $exclude_norm[ $url_norm ] ) ) {
				continue;
			}
			if ( self::is_generic_hub_item( $item ) ) {
				continue;
			}
			$id   = isset( $item['id'] ) ? (int) $item['id'] : 0;
			$type = isset( $item['type'] ) ? (string) $item['type'] : 'page';
			$lines[] = "ID:{$id} | {$title} | {$url} | {$type}";
			++$count;
		}

		return implode( "\n", $lines );
	}

	/**
	 * @param array<int,array<string,mixed>> $site_index
	 */
	private static function resolve_followup_topic_url( string $topic, array $site_index ): string {
		$label = self::followup_topic_label( $topic, $site_index );
		if ( $label === '' ) {
			return '';
		}
		$label_norm = strtolower( $label );
		foreach ( $site_index as $item ) {
			$title = isset( $item['title'] ) ? trim( (string) $item['title'] ) : '';
			if ( $title !== '' && strtolower( $title ) === $label_norm && ! empty( $item['url'] ) ) {
				return (string) $item['url'];
			}
		}
		return '';
	}

	/**
	 * @param array<int,array<string,mixed>> $site_index
	 */
	private static function followup_topic_label( string $topic, array $site_index ): string {
		$topic = trim( wp_strip_all_tags( $topic ) );
		if ( $topic === '' ) {
			return '';
		}
		$prefix = 'tell me about ';
		if ( str_starts_with( strtolower( $topic ), $prefix ) ) {
			$topic = trim( substr( $topic, strlen( $prefix ) ) );
		}
		return $topic;
	}

	/**
	 * @param array{label?:string,url?:string} $link
	 * @param array<int,array<string,mixed>>  $site_index
	 * @return array<string,mixed>|null
	 */
	private static function followup_item_for_link( array $link, array $site_index ): ?array {
		$url = isset( $link['url'] ) ? trim( (string) $link['url'] ) : '';
		if ( $url !== '' ) {
			$url_norm = Neo_Pulse_Wp_Chat_History::normalize_url( $url );
			foreach ( $site_index as $item ) {
				if ( empty( $item['url'] ) ) {
					continue;
				}
				if ( Neo_Pulse_Wp_Chat_History::normalize_url( (string) $item['url'] ) === $url_norm ) {
					return $item;
				}
			}
		}

		$label = isset( $link['label'] ) ? trim( (string) $link['label'] ) : '';
		if ( $label !== '' ) {
			return self::followup_item_for_text( $label, $site_index );
		}

		return null;
	}

	/**
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<string,mixed>|null
	 */
	private static function followup_item_for_text( string $text, array $site_index ): ?array {
		$label = self::followup_topic_label( $text, $site_index );
		if ( $label === '' ) {
			$label = trim( wp_strip_all_tags( $text ) );
		}
		if ( $label === '' ) {
			return null;
		}

		$label_norm = strtolower( $label );
		foreach ( $site_index as $item ) {
			$title = isset( $item['title'] ) ? strtolower( trim( (string) $item['title'] ) ) : '';
			if ( $title !== '' && $title === $label_norm ) {
				return $item;
			}
		}

		$fuzzy = Neo_Pulse_Wp_Chat_Rag::find_fuzzy_topic_pages( $label, $site_index, 1 );
		if ( ! empty( $fuzzy[0] ) && is_array( $fuzzy[0] ) ) {
			return $fuzzy[0];
		}

		return null;
	}

	/**
	 * @param array<string,mixed> $item
	 */
	private static function contextual_chip_text( array $item, string $user_message, string $answer_snippet ): string {
		unset( $user_message, $answer_snippet );

		$title = isset( $item['title'] ) ? trim( (string) $item['title'] ) : '';
		if ( $title === '' || self::is_generic_hub_item( $item ) ) {
			return '';
		}

		$type = isset( $item['type'] ) ? (string) $item['type'] : 'page';
		$short = self::short_title_for_chip( $title );

		if ( $type === 'post' ) {
			if ( str_contains( strtolower( $title ), '?' ) ) {
				return $short;
			}
			if ( preg_match( '/\b(how|what|why|when|where|can|should|do|does|is|are)\b/i', $title ) ) {
				return $short;
			}
			return 'Can you summarize ' . $short . '?';
		}

		if ( preg_match( '/\b(repair|install|service|clean|consult|quote|book|warranty|maintenance)\b/i', $title ) ) {
			return 'What should I know about ' . $short . '?';
		}

		return 'What does ' . $short . ' cover?';
	}

	private static function short_title_for_chip( string $title ): string {
		$title = trim( wp_strip_all_tags( $title ) );
		$title = preg_replace( '/\s*[|\-:]\s*.+$/u', '', $title );
		return trim( (string) $title );
	}

	/**
	 * @param array<string,mixed> $item
	 */
	private static function is_generic_hub_item( array $item ): bool {
		$title = isset( $item['title'] ) ? strtolower( trim( (string) $item['title'] ) ) : '';
		if ( in_array( $title, array( 'blog', 'blogs', 'news', 'articles', 'resources' ), true ) ) {
			return true;
		}

		$url = isset( $item['url'] ) ? strtolower( rtrim( (string) $item['url'], '/' ) ) : '';
		if ( $url !== '' && preg_match( '#/(blog|news|articles?)$#', $url ) ) {
			$type = isset( $item['type'] ) ? (string) $item['type'] : '';
			return $type !== 'post';
		}

		return false;
	}

	/**
	 * @param array<string,mixed> $item
	 */
	private static function related_topic_from_item( array $item ): string {
		return self::contextual_chip_text( $item, '', '' );
	}

	/**
	 * @param array<int,array<string,mixed>> $items
	 * @return array<string,bool>
	 */
	private static function primary_item_url_map( array $items ): array {
		$map = array();
		foreach ( $items as $item ) {
			if ( empty( $item['url'] ) ) {
				continue;
			}
			$map[ strtolower( rtrim( (string) $item['url'], '/' ) ) ] = true;
		}
		return $map;
	}

	/**
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<int,array<string,mixed>>
	 */
	private static function sort_index_for_topic_backfill( array $site_index ): array {
		$pages = array();
		$rest  = array();
		foreach ( $site_index as $item ) {
			if ( isset( $item['type'] ) && (string) $item['type'] === 'page' ) {
				$pages[] = $item;
			} else {
				$rest[] = $item;
			}
		}
		return array_merge( $pages, $rest );
	}
}
