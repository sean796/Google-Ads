<?php
/**
 * OpenRouter transport and related-topic normalization.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Agents_Trait_OpenrouterRelated {

	/**
	 * Call OpenRouter with a specific model.
	 *
	 * @return string|WP_Error
	 */
	private static function call_openrouter( string $model, string $system_prompt, string $user_prompt, int $max_tokens = 8192, float $temperature = 0.5 ) {
		$key = Neo_Pulse_Wp_OpenRouter::get_api_key();
		if ( $key === '' ) {
			return new WP_Error(
				'neo-pulse_openrouter_key',
				__( 'OpenRouter API key is not configured. Add it in NEO Pulse WP Settings > Editor AI.', 'neo-pulse-wp' )
			);
		}

		Neo_Pulse_Wp_OpenRouter::maybe_extend_time_limit();

		$response = wp_remote_post(
			Neo_Pulse_Wp_OpenRouter::API_URL,
			array(
				'timeout' => Neo_Pulse_Wp_OpenRouter::get_timeout(),
				'headers' => Neo_Pulse_Wp_OpenRouter::request_headers( $key ),
				'body'    => wp_json_encode(
					array(
						'model'       => $model,
						'messages'    => array(
							array( 'role' => 'system', 'content' => $system_prompt ),
							array( 'role' => 'user', 'content' => $user_prompt ),
						),
						'temperature' => $temperature,
						'max_tokens'  => $max_tokens,
					)
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = wp_remote_retrieve_body( $response );
		$data = json_decode( $raw, true );

		if ( $code < 200 || $code >= 300 ) {
			$msg = '';
			if ( is_array( $data ) && isset( $data['error']['message'] ) ) {
				$msg = (string) $data['error']['message'];
			}
			if ( $msg === '' ) {
				$msg = sprintf( 'HTTP %d', $code );
			}
			return new WP_Error( 'neo_pulse_chat_ai', $msg );
		}

		$text          = '';
		$finish_reason = '';
		if ( is_array( $data ) && isset( $data['choices'][0]['message']['content'] ) ) {
			$text = trim( (string) $data['choices'][0]['message']['content'] );
			if ( isset( $data['choices'][0]['finish_reason'] ) ) {
				$finish_reason = strtolower( trim( (string) $data['choices'][0]['finish_reason'] ) );
			}
		}

		if ( $text === '' ) {
			return new WP_Error( 'neo_pulse_chat_empty', __( 'AI returned empty content.', 'neo-pulse-wp' ) );
		}

		if ( self::is_truncated_finish_reason( $finish_reason ) ) {
			return new WP_Error(
				'neo_pulse_chat_truncated',
				__( 'AI response was cut off before completion. Please try again.', 'neo-pulse-wp' )
			);
		}

		return $text;
	}

	/**
	 * OpenRouter/model finish reasons that mean output hit the token cap.
	 */
	private static function is_truncated_finish_reason( string $finish_reason ): bool {
		if ( $finish_reason === '' ) {
			return false;
		}
		if ( $finish_reason === 'length' ) {
			return true;
		}
		return str_contains( $finish_reason, 'max_tokens' ) || str_contains( $finish_reason, 'length' );
	}

	/**
	 * Parse a JSON string from an LLM response, stripping markdown fences.
	 *
	 * @return array|null
	 */
	private static function parse_json_response( string $text ): ?array {
		$text = trim( $text );
		$text = preg_replace( '/^```(?:json)?\s*/i', '', $text );
		$text = preg_replace( '/\s*```$/', '', $text );
		$text = trim( $text );

		$decoded = json_decode( $text, true );
		return is_array( $decoded ) ? $decoded : null;
	}

	/**
	 * Normalize related topics from the card; no backfill.
	 *
	 * @param array<string,mixed>              $card
	 * @param array<int,array<string,mixed>>     $items
	 * @param array<int,array<string,mixed>>     $site_index
	 * @param array<int,string>                $exclude_topics
	 * @return array<string,mixed>
	 */
	public static function ensure_minimum_related_topics( array $card, string $user_message, array $items, array $site_index, array $exclude_topics ): array {
		unset( $items, $site_index );

		$topics = isset( $card['relatedTopics'] ) && is_array( $card['relatedTopics'] ) ? $card['relatedTopics'] : array();
		$topics = self::normalize_related_topics( $topics, $user_message, $exclude_topics );

		if ( ! empty( $topics ) ) {
			$card['relatedTopics'] = array_slice( $topics, 0, self::MAX_RELATED_TOPICS );
		} else {
			unset( $card['relatedTopics'] );
		}

		return $card;
	}

	/**
	 * @param array<int,string> $topics
	 * @return array<int,string>
	 */
	private static function normalize_related_topics( array $topics, string $user_message, array $exclude_topics ): array {
		$out  = array();
		$seen = array();
		foreach ( $topics as $topic ) {
			if ( ! is_string( $topic ) ) {
				continue;
			}
			$topic = trim( $topic );
			if ( $topic === '' ) {
				continue;
			}
			$key = strtolower( $topic );
			if ( isset( $seen[ $key ] ) ) {
				continue;
			}
			if ( self::should_skip_related_topic( $topic, $user_message, $exclude_topics, $seen ) ) {
				continue;
			}
			$seen[ $key ] = true;
			$out[]        = $topic;
		}
		return $out;
	}

	/**
	 * @param array<int,string> $topics
	 * @return array<string,bool>
	 */
	private static function related_topic_key_map( array $topics ): array {
		$map = array();
		foreach ( $topics as $topic ) {
			if ( ! is_string( $topic ) ) {
				continue;
			}
			$key = strtolower( trim( $topic ) );
			if ( $key !== '' ) {
				$map[ $key ] = true;
			}
		}
		return $map;
	}

	/**
	 * @param array<string,bool> $seen
	 */
	private static function should_skip_related_topic( string $topic, string $user_message, array $exclude_topics, array $seen, bool $relax_exclude = false ): bool {
		$key = strtolower( trim( $topic ) );
		if ( $key === '' || isset( $seen[ $key ] ) ) {
			return true;
		}
		if ( self::topic_matches_user_message( $topic, $user_message ) ) {
			return true;
		}
		if ( $relax_exclude ) {
			return false;
		}
		foreach ( $exclude_topics as $exclude ) {
			if ( ! is_string( $exclude ) ) {
				continue;
			}
			if ( strtolower( trim( $exclude ) ) === $key ) {
				return true;
			}
		}
		return false;
	}

	private static function topic_matches_user_message( string $topic, string $message ): bool {
		$topic_norm   = strtolower( trim( $topic ) );
		$message_norm = strtolower( trim( $message ) );
		if ( $topic_norm === '' || $message_norm === '' ) {
			return false;
		}
		if ( $topic_norm === $message_norm ) {
			return true;
		}
		$prefix = 'tell me about ';
		if ( str_starts_with( $topic_norm, $prefix ) ) {
			$label = trim( substr( $topic_norm, strlen( $prefix ) ) );
			if ( $label !== '' && ( $message_norm === $label || str_contains( $message_norm, $label ) || str_contains( $label, $message_norm ) ) ) {
				return true;
			}
		}
		if ( str_starts_with( $message_norm, $prefix ) ) {
			$label = trim( substr( $message_norm, strlen( $prefix ) ) );
			if ( $label !== '' && ( $topic_norm === $label || str_contains( $topic_norm, $label ) || str_contains( $label, $topic_norm ) ) ) {
				return true;
			}
		}
		return false;
	}

	private static function related_topic_from_label( string $label ): string {
		$label = trim( wp_strip_all_tags( $label ) );
		if ( $label === '' ) {
			return '';
		}
		return 'Tell me about ' . $label;
	}
}
