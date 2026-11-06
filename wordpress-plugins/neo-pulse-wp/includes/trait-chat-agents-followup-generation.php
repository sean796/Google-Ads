<?php
/**
 * Follow-up topic generation.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Agents_Trait_FollowupGeneration {

	/**
	 * Hybrid follow-up chips: deterministic topic links first, OpenRouter backfill.
	 *
	 * @param array<int,array<string,mixed>> $items
	 * @param array<int,array<string,mixed>> $site_index
	 * @param array<string,mixed>|null       $page_context
	 * @return array<int,string>
	 */
	public static function generate_followup_topics(
		string $user_message,
		string $answer,
		array $items,
		array $site_index,
		array $history,
		?array $page_context = null,
		?array $card = null
	): array {
		$pool = ! empty( $items ) ? $items : $site_index;
		if ( empty( $pool ) && empty( $site_index ) ) {
			return array();
		}

		$snippet = substr( self::plain_text_from_markdown( $answer ), 0, 800 );
		if ( $snippet === '' ) {
			return array();
		}

		$context     = self::build_followup_context( $user_message, $items, $site_index, $history, $page_context, $card );
		$inventory   = self::build_followup_inventory_summary( $pool, $site_index, $context['exclude_urls'] );
		$topics      = self::request_followup_topics_openrouter(
			$user_message,
			$snippet,
			$inventory,
			self::MIN_RELATED_TOPICS,
			array(),
			$context,
			$site_index
		);

		if ( count( $topics ) < self::MIN_RELATED_TOPICS ) {
			$needed = self::MIN_RELATED_TOPICS - count( $topics );
			$topics = array_merge(
				$topics,
				self::deterministic_followup_topics(
					$user_message,
					$snippet,
					$pool,
					$site_index,
					$page_context,
					$context['exclude_urls'],
					$topics
				)
			);
			$topics = array_slice( $topics, 0, self::MAX_RELATED_TOPICS );
		}

		if ( count( $topics ) < self::MIN_RELATED_TOPICS ) {
			$needed = self::MIN_RELATED_TOPICS - count( $topics );
			$retry  = self::request_followup_topics_openrouter(
				$user_message,
				$snippet,
				$inventory,
				$needed,
				$topics,
				$context,
				$site_index
			);
			$topics = array_slice( array_merge( $topics, $retry ), 0, self::MAX_RELATED_TOPICS );
		}

		return array_slice( $topics, 0, self::MAX_RELATED_TOPICS );
	}

	/**
	 * @param array<int,array<string,mixed>>   $items
	 * @param array<int,array<string,mixed>>   $site_index
	 * @param array<int,array<string,mixed>>   $history
	 * @param array<string,mixed>|null         $page_context
	 * @param array<string,mixed>|null         $card
	 * @return array{exclude_urls:array<int,string>,history_block:string,prior_topics:array<int,string>}
	 */
	private static function build_followup_context(
		string $user_message,
		array $items,
		array $site_index,
		array $history,
		?array $page_context,
		?array $card
	): array {
		$exclude_urls = Neo_Pulse_Wp_Chat_History::collect_seen_urls( $history );
		$url_seen     = array();
		foreach ( $exclude_urls as $url ) {
			$norm = Neo_Pulse_Wp_Chat_History::normalize_url( (string) $url );
			if ( $norm !== '' ) {
				$url_seen[ $norm ] = true;
			}
		}

		$add_url = static function ( string $url ) use ( &$url_seen, &$exclude_urls ): void {
			$norm = Neo_Pulse_Wp_Chat_History::normalize_url( $url );
			if ( $norm === '' || isset( $url_seen[ $norm ] ) ) {
				return;
			}
			$url_seen[ $norm ]  = true;
			$exclude_urls[]     = $url;
		};

		if ( is_array( $page_context ) && ! empty( $page_context['url'] ) ) {
			$add_url( (string) $page_context['url'] );
		}

		foreach ( $items as $item ) {
			if ( ! empty( $item['url'] ) ) {
				$add_url( (string) $item['url'] );
			}
		}

		if ( is_array( $card ) ) {
			if ( ! empty( $card['cta']['url'] ) ) {
				$add_url( (string) $card['cta']['url'] );
			}
			if ( ! empty( $card['links'] ) && is_array( $card['links'] ) ) {
				foreach ( $card['links'] as $link ) {
					if ( is_array( $link ) && ! empty( $link['url'] ) ) {
						$add_url( (string) $link['url'] );
					}
				}
			}
		}

		$intent = Neo_Pulse_Wp_Chat_Suggestion_Templates::match_intent( $user_message, $page_context, $site_index );
		if ( is_array( $intent ) && ! empty( $intent['url'] ) ) {
			$add_url( (string) $intent['url'] );
		}

		$prior_topics = Neo_Pulse_Wp_Chat_History::collect_seen_topics( $history );
		$history_block = Neo_Pulse_Wp_Chat_History::format_for_prompt( array_slice( $history, -6 ) );

		return array(
			'exclude_urls'  => $exclude_urls,
			'history_block' => $history_block,
			'prior_topics'  => $prior_topics,
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $items
	 * @param array<int,array<string,mixed>> $site_index
	 * @param array<string,mixed>|null       $page_context
	 * @param array<int,string>              $exclude_urls
	 * @param array<int,string>              $existing
	 * @return array<int,string>
	 */
	private static function deterministic_followup_topics(
		string $user_message,
		string $answer_snippet,
		array $items,
		array $site_index,
		?array $page_context,
		array $exclude_urls,
		array $existing = array()
	): array {
		$query = trim( $user_message . ' ' . $answer_snippet );
		if ( $query === '' ) {
			return array();
		}

		$links  = Neo_Pulse_Wp_Chat_Links::pick_topic_links( $query, $items, 4, $site_index, true, array(), $exclude_urls );
		$topics = array();
		$seen   = array();
		foreach ( $existing as $topic ) {
			if ( is_string( $topic ) && trim( $topic ) !== '' ) {
				$seen[ strtolower( trim( $topic ) ) ] = true;
			}
		}

		foreach ( $links as $link ) {
			if ( count( $topics ) >= self::MAX_RELATED_TOPICS ) {
				break;
			}
			$item = self::followup_item_for_link( $link, $site_index );
			if ( ! is_array( $item ) ) {
				continue;
			}
			$text = self::contextual_chip_text( $item, $user_message, $answer_snippet );
			$key  = strtolower( trim( $text ) );
			if ( $text === '' || isset( $seen[ $key ] ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$topics[]     = $text;
		}

		if (
			count( $topics ) < self::MIN_RELATED_TOPICS
			&& is_array( $page_context )
			&& ! empty( $page_context['post_id'] )
			&& ! self::is_page_summary_request( $user_message )
		) {
			$topics[] = 'Summarize this page';
		}

		return $topics;
	}

	private static function is_page_summary_request( string $message ): bool {
		$lower = strtolower( trim( $message ) );
		if ( $lower === 'summarize this page' ) {
			return true;
		}
		if ( ! str_contains( $lower, 'summarize' ) && ! str_contains( $lower, 'summary' ) ) {
			return false;
		}
		return Neo_Pulse_Wp_Chat_Page_Context::message_targets_current_page( $lower );
	}

	/**
	 * @param array<int,string> $existing
	 * @return array<int,string>
	 */
	private static function request_followup_topics_openrouter(
		string $user_message,
		string $answer_snippet,
		string $inventory,
		int $need_more = 0,
		array $existing = array(),
		array $context = array(),
		array $site_index = array()
	): array {
		$history_block = isset( $context['history_block'] ) ? trim( (string) $context['history_block'] ) : '';
		$prior_topics  = isset( $context['prior_topics'] ) && is_array( $context['prior_topics'] ) ? $context['prior_topics'] : array();
		$exclude_urls  = isset( $context['exclude_urls'] ) && is_array( $context['exclude_urls'] ) ? $context['exclude_urls'] : array();

		$system = <<<'PROMPT'
You suggest follow-up chat chips for a website assistant.
Output ONLY valid JSON: {"chips":[{"text":"natural short question","page_id":123}]}

Rules:
- Each chip must be a natural next question a visitor would ask after the assistant answer (not "Tell me about {page title}").
- Write chips as concise questions (roughly 4–12 words). Use sentence case.
- Each chip must map to a distinct page_id from SITE PAGES.
- Do not suggest pages already covered in RECENT CONVERSATION or EXCLUDED URLS.
- Do not repeat chip text from PRIOR CHIPS or re-ask what the user just asked.
- For blog posts, ask about the article topic (e.g. "What should I know before I get started?"), never generic hub labels like "Blog".
- For service pages, suggest a logical adjacent service or FAQ (e.g. after repairs, suggest warranty or booking).
- Return exactly 2 chips when at least 2 distinct eligible pages exist.
PROMPT;

		$user = "User question:\n{$user_message}\n\nAssistant answer:\n{$answer_snippet}\n\nSITE PAGES:\n{$inventory}";
		if ( $history_block !== '' ) {
			$user .= "\n\nRECENT CONVERSATION:\n{$history_block}";
		}
		if ( ! empty( $prior_topics ) ) {
			$user .= "\n\nPRIOR CHIPS (do not repeat):\n" . implode( "\n", $prior_topics );
		}
		if ( ! empty( $exclude_urls ) ) {
			$user .= "\n\nEXCLUDED URLS (already shown; do not suggest):\n" . implode( "\n", $exclude_urls );
		}
		if ( $need_more > 0 && ! empty( $existing ) ) {
			$user .= "\n\nAlready chosen (do not duplicate these pages):\n" . implode( "\n", $existing );
			$user .= "\n\nReturn {$need_more} additional chip(s) to reach 2 total, each with a distinct page_id.";
		}

		$result = self::call_openrouter( self::FAST_MODEL, $system, $user, self::FOLLOWUP_MAX_TOKENS, 0.2 );
		if ( is_wp_error( $result ) ) {
			return array();
		}

		$parsed = self::parse_json_response( (string) $result );
		if ( null === $parsed ) {
			return array();
		}

		$chips = array();
		if ( ! empty( $parsed['chips'] ) && is_array( $parsed['chips'] ) ) {
			$chips = $parsed['chips'];
		} elseif ( ! empty( $parsed['relatedTopics'] ) && is_array( $parsed['relatedTopics'] ) ) {
			foreach ( $parsed['relatedTopics'] as $topic ) {
				if ( is_string( $topic ) && trim( $topic ) !== '' ) {
					$chips[] = array( 'text' => trim( $topic ) );
				}
			}
		}

		if ( empty( $chips ) ) {
			return array();
		}

		return self::normalize_followup_chips( $chips, $exclude_urls, $prior_topics, $user_message, $site_index );
	}

	/**
	 * @param array<int,array<string,mixed>> $chips
	 * @param array<int,string>              $exclude_urls
	 * @param array<int,string>              $prior_topics
	 * @param array<int,array<string,mixed>> $site_index
	 * @return array<int,string>
	 */
	private static function normalize_followup_chips(
		array $chips,
		array $exclude_urls,
		array $prior_topics,
		string $user_message,
		array $site_index
	): array {
		if ( empty( $site_index ) ) {
			$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index();
		}

		$by_id = array();
		foreach ( $site_index as $item ) {
			$id = isset( $item['id'] ) ? (int) $item['id'] : 0;
			if ( $id > 0 ) {
				$by_id[ $id ] = $item;
			}
		}

		$url_seen = array();
		foreach ( $exclude_urls as $url ) {
			$norm = Neo_Pulse_Wp_Chat_History::normalize_url( (string) $url );
			if ( $norm !== '' ) {
				$url_seen[ $norm ] = true;
			}
		}

		$text_seen = array();
		foreach ( $prior_topics as $topic ) {
			$key = strtolower( trim( (string) $topic ) );
			if ( $key !== '' ) {
				$text_seen[ $key ] = true;
			}
		}

		$out = array();
		foreach ( $chips as $chip ) {
			if ( ! is_array( $chip ) ) {
				continue;
			}
			$text = isset( $chip['text'] ) ? trim( wp_strip_all_tags( (string) $chip['text'] ) ) : '';
			if ( $text === '' ) {
				continue;
			}

			$item = null;
			$page_id = isset( $chip['page_id'] ) ? (int) $chip['page_id'] : 0;
			if ( $page_id > 0 && isset( $by_id[ $page_id ] ) ) {
				$item = $by_id[ $page_id ];
			}
			if ( ! is_array( $item ) ) {
				$item = self::followup_item_for_text( $text, $site_index );
			}
			if ( ! is_array( $item ) || empty( $item['url'] ) ) {
				continue;
			}
			if ( self::is_generic_hub_item( $item ) ) {
				continue;
			}

			$url_norm = Neo_Pulse_Wp_Chat_History::normalize_url( (string) $item['url'] );
			if ( $url_norm === '' || isset( $url_seen[ $url_norm ] ) ) {
				continue;
			}

			$text_key = strtolower( $text );
			if ( isset( $text_seen[ $text_key ] ) || self::should_skip_related_topic( $text, $user_message, array(), $text_seen ) ) {
				continue;
			}

			$url_seen[ $url_norm ]  = true;
			$text_seen[ $text_key ] = true;
			$out[]                  = $text;
			if ( count( $out ) >= self::MAX_RELATED_TOPICS ) {
				break;
			}
		}

		return $out;
	}
}
