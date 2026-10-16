<?php
/**
 * Structured conversation history for Flow Assist chat.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Chat_History {

	/** Longest assistant text kept from browser-sent history on the visitor pipeline. */
	const ASSISTANT_TEXT_MAX = 800;

	const CARD_BODY_SNAPSHOT_MAX = 200;

	/**
	 * @param array<int,array<string,mixed>> $history Raw history from client.
	 * @return array<int,array<string,mixed>>
	 */
	public static function normalize( array $history ): array {
		$out = array();
		foreach ( array_slice( $history, -6 ) as $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			$role = isset( $entry['role'] ) ? sanitize_key( (string) $entry['role'] ) : 'user';
			if ( ! in_array( $role, array( 'user', 'assistant' ), true ) ) {
				continue;
			}
			$turn = array(
				'role'    => $role,
				'content' => isset( $entry['content'] ) ? sanitize_textarea_field( (string) $entry['content'] ) : '',
			);
			if ( $role === 'assistant' && isset( $entry['card'] ) && is_array( $entry['card'] ) ) {
				$card = self::normalize_card_snapshot( $entry['card'] );
				if ( ! empty( $card ) ) {
					$turn['card'] = $card;
				}
			}
			$out[] = $turn;
		}

		return $out;
	}

	/**
	 * History for the public (visitor) pipeline. Assistant turns come back from the browser, so they
	 * are kept only as short context: text trimmed to ASSISTANT_TEXT_MAX characters and card links
	 * limited to this site's own URLs, so a forged turn cannot plant outside links or long
	 * instructions. Other roles are dropped.
	 *
	 * @param array<int,array<string,mixed>> $history Normalized history.
	 * @return array<int,array<string,mixed>>
	 */
	public static function for_visitor( array $history ): array {
		$home = (string) wp_parse_url( home_url( '/' ), PHP_URL_HOST );
		$own  = static function ( $url ) use ( $home ): bool {
			$host = (string) wp_parse_url( (string) $url, PHP_URL_HOST );
			return $host === '' || strcasecmp( preg_replace( '/^www\./i', '', $host ), preg_replace( '/^www\./i', '', $home ) ) === 0;
		};
		$out = array();
		foreach ( $history as $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			$role = $entry['role'] ?? '';
			if ( $role === 'user' ) {
				$out[] = $entry;
				continue;
			}
			if ( $role !== 'assistant' ) {
				continue;
			}
			$text = trim( wp_strip_all_tags( (string) ( $entry['content'] ?? '' ) ) );
			if ( strlen( $text ) > self::ASSISTANT_TEXT_MAX ) {
				$text = substr( $text, 0, self::ASSISTANT_TEXT_MAX ) . '…';
			}
			$clean = array(
				'role'    => 'assistant',
				'content' => $text,
			);
			if ( ! empty( $entry['card'] ) && is_array( $entry['card'] ) ) {
				$card = $entry['card'];
				if ( ! empty( $card['cta']['url'] ) && ! $own( $card['cta']['url'] ) ) {
					unset( $card['cta'] );
				}
				if ( ! empty( $card['links'] ) && is_array( $card['links'] ) ) {
					$card['links'] = array_values(
						array_filter(
							$card['links'],
							static function ( $link ) use ( $own ) {
								return is_array( $link ) && ! empty( $link['url'] ) && $own( $link['url'] );
							}
						)
					);
				}
				unset( $card['body'] );
				$clean['card'] = $card;
			}
			$out[] = $clean;
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $card
	 * @return array<string,mixed>
	 */
	private static function normalize_card_snapshot( array $card ): array {
		$out = array();
		if ( isset( $card['title'] ) && is_string( $card['title'] ) && trim( $card['title'] ) !== '' ) {
			$out['title'] = sanitize_text_field( $card['title'] );
		}
		if ( isset( $card['body'] ) && is_string( $card['body'] ) ) {
			$body = sanitize_textarea_field( trim( $card['body'] ) );
			if ( $body !== '' ) {
				if ( strlen( $body ) > self::CARD_BODY_SNAPSHOT_MAX ) {
					$body = substr( $body, 0, self::CARD_BODY_SNAPSHOT_MAX ) . '…';
				}
				$out['body'] = $body;
			}
		}
		if ( isset( $card['cta'] ) && is_array( $card['cta'] ) && ! empty( $card['cta']['url'] ) ) {
			$url = esc_url_raw( (string) $card['cta']['url'] );
			if ( $url !== '' ) {
				$out['cta'] = array(
					'label' => isset( $card['cta']['label'] ) ? sanitize_text_field( (string) $card['cta']['label'] ) : '',
					'url'   => $url,
				);
			}
		}
		if ( isset( $card['links'] ) && is_array( $card['links'] ) ) {
			$links = array();
			foreach ( array_slice( $card['links'], 0, 4 ) as $link ) {
				if ( ! is_array( $link ) || empty( $link['url'] ) ) {
					continue;
				}
				$url = esc_url_raw( (string) $link['url'] );
				if ( $url === '' ) {
					continue;
				}
				$links[] = array(
					'label' => isset( $link['label'] ) ? sanitize_text_field( (string) $link['label'] ) : '',
					'url'   => $url,
				);
			}
			if ( ! empty( $links ) ) {
				$out['links'] = $links;
			}
		}
		if ( isset( $card['relatedTopics'] ) && is_array( $card['relatedTopics'] ) ) {
			$topics = array();
			foreach ( array_slice( $card['relatedTopics'], 0, 5 ) as $topic ) {
				if ( ! is_string( $topic ) ) {
					continue;
				}
				$topic = sanitize_text_field( trim( $topic ) );
				if ( $topic !== '' ) {
					$topics[] = $topic;
				}
			}
			if ( ! empty( $topics ) ) {
				$out['relatedTopics'] = $topics;
			}
		}

		return $out;
	}

	/**
	 * @param array<int,array<string,mixed>> $history
	 */
	public static function format_for_prompt( array $history ): string {
		$lines = array();
		foreach ( array_slice( $history, -6 ) as $entry ) {
			$role    = isset( $entry['role'] ) ? (string) $entry['role'] : 'user';
			$content = isset( $entry['content'] ) ? trim( (string) $entry['content'] ) : '';
			if ( $content === '' ) {
				continue;
			}
			$line = ucfirst( $role ) . ': ' . $content;
			if ( $role === 'assistant' && ! empty( $entry['card'] ) && is_array( $entry['card'] ) ) {
				$meta = self::card_meta_line( $entry['card'] );
				if ( $meta !== '' ) {
					$line .= ' | ' . $meta;
				}
			}
			$lines[] = $line;
		}

		return implode( "\n", $lines );
	}

	/**
	 * @param array<string,mixed> $card
	 */
	private static function card_meta_line( array $card ): string {
		$parts = array();
		if ( ! empty( $card['cta']['url'] ) ) {
			$label = ! empty( $card['cta']['label'] ) ? (string) $card['cta']['label'] : (string) $card['cta']['url'];
			$parts[] = 'shown_cta: ' . $label . ' → ' . (string) $card['cta']['url'];
		}
		if ( ! empty( $card['links'] ) && is_array( $card['links'] ) ) {
			$url_parts = array();
			foreach ( $card['links'] as $link ) {
				if ( is_array( $link ) && ! empty( $link['url'] ) ) {
					$url_parts[] = (string) $link['url'];
				}
			}
			if ( ! empty( $url_parts ) ) {
				$parts[] = 'shown_links: ' . implode( ', ', $url_parts );
			}
		}
		if ( ! empty( $card['relatedTopics'] ) && is_array( $card['relatedTopics'] ) ) {
			$parts[] = 'chips: ' . implode( ', ', array_map( 'strval', $card['relatedTopics'] ) );
		}

		return implode( ' | ', $parts );
	}

	/**
	 * @param array<int,array<string,mixed>> $history
	 * @return array<int, string>
	 */
	public static function collect_seen_urls( array $history ): array {
		$seen = array();
		foreach ( $history as $entry ) {
			if ( ! is_array( $entry ) || empty( $entry['card'] ) || ! is_array( $entry['card'] ) ) {
				continue;
			}
			$card = $entry['card'];
			if ( ! empty( $card['cta']['url'] ) ) {
				$norm = self::normalize_url( (string) $card['cta']['url'] );
				if ( $norm !== '' ) {
					$seen[ $norm ] = true;
				}
			}
			if ( ! empty( $card['links'] ) && is_array( $card['links'] ) ) {
				foreach ( $card['links'] as $link ) {
					if ( is_array( $link ) && ! empty( $link['url'] ) ) {
						$norm = self::normalize_url( (string) $link['url'] );
						if ( $norm !== '' ) {
							$seen[ $norm ] = true;
						}
					}
				}
			}
		}

		return array_keys( $seen );
	}

	/**
	 * @param array<int,array<string,mixed>> $history
	 * @return array<int, string>
	 */
	public static function collect_seen_topics( array $history ): array {
		$seen = array();
		foreach ( $history as $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			if ( isset( $entry['role'] ) && (string) $entry['role'] === 'user' ) {
				$content = isset( $entry['content'] ) ? trim( (string) $entry['content'] ) : '';
				if ( $content !== '' ) {
					$key = strtolower( $content );
					if ( ! isset( $seen[ $key ] ) ) {
						$seen[ $key ] = $content;
					}
				}
			}
			if ( empty( $entry['card']['relatedTopics'] ) || ! is_array( $entry['card']['relatedTopics'] ) ) {
				continue;
			}
			foreach ( $entry['card']['relatedTopics'] as $topic ) {
				if ( ! is_string( $topic ) ) {
					continue;
				}
				$key = strtolower( trim( $topic ) );
				if ( $key !== '' && ! isset( $seen[ $key ] ) ) {
					$seen[ $key ] = $topic;
				}
			}
		}

		return array_values( $seen );
	}

	public static function normalize_url( string $url ): string {
		$url = trim( $url );
		if ( $url === '' ) {
			return '';
		}

		return strtolower( rtrim( $url, '/' ) );
	}

	/**
	 * @param array<int,string> $topics
	 * @param array<int,string> $exclude_topics
	 * @return array<int,string>
	 */
	public static function filter_topics( array $topics, array $exclude_topics ): array {
		if ( empty( $topics ) || empty( $exclude_topics ) ) {
			return $topics;
		}

		$exclude = array();
		foreach ( $exclude_topics as $topic ) {
			$key = strtolower( trim( (string) $topic ) );
			if ( $key !== '' ) {
				$exclude[ $key ] = true;
			}
		}

		$out = array();
		foreach ( $topics as $topic ) {
			if ( ! is_string( $topic ) ) {
				continue;
			}
			$key = strtolower( trim( $topic ) );
			if ( $key === '' || isset( $exclude[ $key ] ) ) {
				continue;
			}
			$out[] = $topic;
		}

		return $out;
	}
}
