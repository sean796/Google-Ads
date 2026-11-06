<?php
/**
 * Ask and Plan execution, LLM card handling, and card sanitizing.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Pulse_Assist_Ask_Trait_Run_Llm {

	/**
	 * @param array<int,array<string,mixed>> $history
	 * @param array<string,mixed>            $body
	 * @return array<string,mixed>
	 */
	private static function run_for_submode( string $submode, string $message, array $history, array $body, ?array $research = null, ?array $data_research = null ) {
		if ( $submode === 'plan' ) {
			return self::run_plan( $message, $history, $body, $research, $data_research );
		}
		return self::run_ask( $message, $history, $body, $research, $data_research );
	}

	/**
	 * @param array<int,array<string,mixed>> $history
	 * @param array<string,mixed>            $body
	 * @param array<string,mixed>|null       $research
	 * @return array<string,mixed>
	 */
	private static function run_ask( string $message, array $history, array $body, ?array $research = null, ?array $data_research = null ) {
		$listing_card = self::try_inventory_listing_card( $message, $data_research );
		if ( is_array( $listing_card ) ) {
			return $listing_card;
		}

		$card = self::llm_card(
			$message,
			$history,
			$body,
			'answer',
			self::ask_system_prompt( $body, $research, $data_research ),
			$research
		);
		if ( ! isset( $card['type'] ) ) {
			$card['type'] = 'answer';
		}
		return $card;
	}

	/**
	 * @param array<string,mixed>|null $data_research
	 * @return array<string,mixed>|null
	 */
	private static function try_inventory_listing_card( string $message, ?array $data_research ) {
		if ( $data_research === null || empty( $data_research['leadAgentUsed'] ) ) {
			return null;
		}

		$slice_team = isset( $data_research['sliceTeam'] ) && is_array( $data_research['sliceTeam'] ) ? $data_research['sliceTeam'] : array();
		if ( count( $slice_team ) !== 1 || sanitize_key( (string) ( $slice_team[0]['slice'] ?? '' ) ) !== 'inventory' ) {
			return null;
		}

		$tool_ids = isset( $data_research['toolIds'] ) && is_array( $data_research['toolIds'] ) ? $data_research['toolIds'] : array();
		$inventory_tool = '';
		foreach ( $tool_ids as $tool_id ) {
			$id = sanitize_key( (string) $tool_id );
			if ( str_starts_with( $id, 'inventory_' ) ) {
				$inventory_tool = $id;
				break;
			}
		}
		if ( $inventory_tool === '' || in_array( $inventory_tool, array( 'inventory_grade', 'inventory_audit', 'inventory_grep', 'inventory_meta' ), true ) ) {
			return null;
		}

		$rows = isset( $data_research['rows'] ) && is_array( $data_research['rows'] ) ? $data_research['rows'] : array();
		$kind = 'default';
		if ( $inventory_tool === 'inventory_scheduled' || Neo_Pulse_App_Platform_Data_Intent_Checklist::wants_scheduled_listing( $message ) ) {
			$kind = 'scheduled';
		} elseif ( Neo_Pulse_App_Platform_Data_Intent_Checklist::wants_draft_listing( $message ) ) {
			$kind = 'draft';
		}

		$body_text = Neo_Pulse_App_Platform_Data_Lead_Agent::inventory_listing_markdown( $rows, $kind );
		if ( $kind === 'scheduled' && count( $rows ) > 0 ) {
			$body_text = "Here are the next scheduled posts:\n\n" . $body_text;
		} elseif ( $kind === 'draft' && count( $rows ) > 0 ) {
			$body_text = "Here are the draft posts:\n\n" . $body_text;
		}

		$related = array();
		if ( $kind === 'scheduled' ) {
			$related = array(
				'Show draft posts',
				'List recently published posts',
				'How do I schedule posts in WordPress?',
			);
		} elseif ( $kind === 'draft' ) {
			$related = array(
				'Show scheduled posts',
				'List recently published posts',
				'How do I publish a draft?',
			);
		} else {
			$related = array(
				'Show scheduled posts',
				'Show draft posts',
				'List recently published posts',
			);
		}

		return array(
			'type'          => 'answer',
			'title'         => '',
			'body'          => $body_text,
			'confidence'    => 'high',
			'relatedTopics' => $related,
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $history
	 * @param array<string,mixed>            $body
	 * @param array<string,mixed>|null       $research
	 * @return array<string,mixed>
	 */
	private static function run_plan( string $message, array $history, array $body, ?array $research = null, ?array $data_research = null ) {
		$card = self::llm_card(
			$message,
			$history,
			$body,
			'plan',
			self::plan_system_prompt( $body, $research, $data_research ),
			$research
		);
		$card['type'] = 'plan';
		if ( empty( $card['title'] ) ) {
			$card['title'] = 'Plan preview';
		}
		$card['body'] = ( isset( $card['body'] ) ? (string) $card['body'] : '' ) . "\n\nThis is a read-only preview. Switch to Build when write actions are available.";
		return $card;
	}

	/**
	 * @param array<int,array<string,mixed>> $history
	 * @param array<string,mixed>            $body
	 * @param array<string,mixed>|null       $research
	 * @return array<string,mixed>
	 */
	private static function llm_card( string $message, array $history, array $body, string $default_type, string $system_prompt, ?array $research = null ) {
		$messages = self::chat_messages( $system_prompt, $history, $message );
		$raw      = Neo_Pulse_App_Chat_Openrouter::chat_text(
			$messages,
			array(
				'temperature' => 0.35,
				'maxTokens'   => 1400,
			)
		);

		if ( $raw === '' ) {
			return self::error_card( 'OpenRouter did not return a response. Check your API key and try again.' );
		}

		$parsed = self::parse_json_card( $raw );
		if ( ! is_array( $parsed ) ) {
			$fallback_body = self::strip_brand_preamble( $raw );
			if ( trim( $fallback_body ) === '' ) {
				return self::error_card( 'Assist returned an unreadable response. Try asking again.' );
			}
			return array(
				'type'          => $default_type,
				'title'         => '',
				'body'          => $fallback_body,
				'confidence'    => 'medium',
				'relatedTopics' => array(),
			);
		}

		$title     = isset( $parsed['title'] ) ? sanitize_text_field( (string) $parsed['title'] ) : '';
		$body_text = isset( $parsed['body'] ) ? self::sanitize_assist_body( (string) $parsed['body'] ) : '';
		if ( $body_text === '' && isset( $parsed['answer'] ) ) {
			$body_text = self::sanitize_assist_body( (string) $parsed['answer'] );
		}
		$body_text = self::strip_brand_preamble( $body_text );
		$title     = self::sanitize_card_title( $title );

		$card = array(
			'type'          => isset( $parsed['type'] ) ? sanitize_key( (string) $parsed['type'] ) : $default_type,
			'title'         => $title,
			'body'          => $body_text,
			'confidence'    => 'medium',
			'relatedTopics' => self::sanitize_topics( isset( $parsed['relatedTopics'] ) ? $parsed['relatedTopics'] : array() ),
		);
		if ( isset( $parsed['links'] ) && is_array( $parsed['links'] ) ) {
			$card['links'] = self::sanitize_links( $parsed['links'] );
		}
		$card = self::normalize_card_structured_fields( $card );
		$card = self::finalize_card( $card, $message, $body, $research );
		if ( trim( (string) ( $card['body'] ?? '' ) ) === '' ) {
			return self::error_card( 'Assist did not return an answer body. Try asking again.' );
		}
		return $card;
	}

	private static function sanitize_assist_body( string $body ): string {
		$body = wp_check_invalid_utf8( $body );
		return trim( $body );
	}

	private static function truncate_debug_block( string $block ): string {
		$block = trim( $block );
		if ( $block === '' ) {
			return '';
		}
		if ( strlen( $block ) <= 1200 ) {
			return $block;
		}
		return substr( $block, 0, 1200 ) . '…';
	}

	private static function sanitize_card_title( string $title ): string {
		$t = trim( $title );
		if ( $t === '' ) {
			return '';
		}
		$plain = strtolower( preg_replace( '/[#*_`\[\]()]/', '', $t ) );
		if ( str_contains( $plain, 'neo pulse assist' ) ) {
			return '';
		}
		return $t;
	}

	private static function strip_brand_preamble( string $body ): string {
		$prev = '';
		while ( $prev !== $body ) {
			$prev = $body;
			$body = self::strip_brand_preamble_once( $body );
		}
		return $body;
	}

	private static function strip_brand_preamble_once( string $body ): string {
		$lines = preg_split( '/\r\n|\r|\n/', $body );
		if ( ! is_array( $lines ) ) {
			return $body;
		}
		while ( count( $lines ) > 0 ) {
			$line = trim( (string) $lines[0] );
			if ( $line === '' ) {
				array_shift( $lines );
				continue;
			}
			$plain = trim( preg_replace( '/[#*_`\[\]()]/', '', $line ) );
			if ( stripos( $plain, 'NEO Pulse Assist' ) !== false && strlen( $plain ) < 100 ) {
				array_shift( $lines );
				continue;
			}
			break;
		}
		return implode( "\n", $lines );
	}

	/**
	 * @param mixed $links
	 * @return array<int,array<string,mixed>>
	 */
	private static function sanitize_links( $links ) {
		if ( ! is_array( $links ) ) {
			return array();
		}
		$out = array();
		foreach ( $links as $link ) {
			if ( ! is_array( $link ) ) {
				continue;
			}
			$row = array();
			if ( ! empty( $link['label'] ) && is_scalar( $link['label'] ) ) {
				$row['label'] = sanitize_text_field( (string) $link['label'] );
			}
			if ( ! empty( $link['url'] ) && is_scalar( $link['url'] ) ) {
				$url = (string) $link['url'];
				if ( preg_match( '/^pulse:nav\//', $url ) || preg_match( '/^#/', $url ) ) {
					$row['url'] = sanitize_text_field( $url );
				} elseif ( preg_match( '/^https?:\/\//i', $url ) ) {
					$row['url'] = esc_url_raw( $url );
				}
			}
			if ( ! empty( $link['action'] ) && is_scalar( $link['action'] ) ) {
				$row['action'] = sanitize_key( (string) $link['action'] );
			}
			if ( ! empty( $row['label'] ) || ! empty( $row['url'] ) ) {
				$out[] = $row;
			}
			if ( count( $out ) >= 4 ) {
				break;
			}
		}
		return $out;
	}

	/**
	 * @param mixed $raw
	 * @return array<string,mixed>|null
	 */
	private static function parse_json_card( $raw ) {
		$text = trim( (string) $raw );
		if ( $text === '' ) {
			return null;
		}
		if ( preg_match( '/```(?:json)?\s*([\s\S]*?)```/i', $text, $m ) ) {
			$text = trim( $m[1] );
		}
		$decoded = json_decode( $text, true );
		if ( is_array( $decoded ) ) {
			return $decoded;
		}
		$start = strpos( $text, '{' );
		$end   = strrpos( $text, '}' );
		if ( $start !== false && $end !== false && $end > $start ) {
			$decoded = json_decode( substr( $text, $start, $end - $start + 1 ), true );
			if ( is_array( $decoded ) ) {
				return $decoded;
			}
		}
		return null;
	}
}
