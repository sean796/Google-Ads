<?php
/**
 * Context-aware conversation starters for the chat empty state.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Chat_Starters {

	const CACHE_KEY       = 'neo_pulse_chat_starters_v2';
	const CACHE_TTL       = DAY_IN_SECONDS;
	const MAX_COUNT       = 3;
	const FAST_MODEL      = 'google/gemini-2.5-flash-lite';
	const MAX_TOKENS      = 512;
	const CRON_HOOK       = 'neo_pulse_wp_refresh_chat_starters';
	const GENERATE_HOOK   = 'neo_pulse_wp_generate_chat_starters';
	const FAIL_KEY        = 'neo_pulse_chat_starters_failed';
	const FAIL_TTL        = HOUR_IN_SECONDS;
	const RECENCY_DAYS    = 45;
	const RECENCY_LIMIT   = 200;
	const RECENCY_LINE_MAX = 240;

	public static function maybe_schedule(): void {
		add_action( self::CRON_HOOK, array( __CLASS__, 'refresh' ) );
		add_action( self::GENERATE_HOOK, array( __CLASS__, 'generate_in_background' ) );
		if ( ! wp_next_scheduled( self::CRON_HOOK ) ) {
			wp_schedule_event( time(), 'daily', self::CRON_HOOK );
		}
	}

	public static function invalidate_cache(): void {
		delete_transient( self::CACHE_KEY );
	}

	/**
	 * Rebuild starters into the daily cache (WP-Cron).
	 */
	public static function refresh(): void {
		self::invalidate_cache();
		delete_transient( self::FAIL_KEY );
		self::generate_and_store();
	}

	/**
	 * One-off background build scheduled by get() when the cache is empty (WP-Cron).
	 */
	public static function generate_in_background(): void {
		$cached = get_transient( self::CACHE_KEY );
		if ( is_array( $cached ) && ! empty( $cached ) ) {
			return;
		}
		self::generate_and_store();
	}

	/**
	 * Starters for the chat empty state. Never calls the AI during a page render: when the cache
	 * is empty it returns no starters and schedules one background build.
	 *
	 * @param array<string,mixed> $settings Chat settings (unused here; kept for call-site compat).
	 * @return array<int,string>
	 */
	public static function get( array $settings = array() ): array {
		unset( $settings );
		$cached = get_transient( self::CACHE_KEY );
		if ( is_array( $cached ) && ! empty( $cached ) ) {
			return self::normalize_list( $cached );
		}

		if ( ! get_transient( self::FAIL_KEY ) && ! wp_next_scheduled( self::GENERATE_HOOK ) ) {
			wp_schedule_single_event( time(), self::GENERATE_HOOK );
		}

		return array();
	}

	/**
	 * Generate starters and cache them; a failure is remembered for an hour so it is not retried
	 * on every request.
	 *
	 * @param array<string,mixed> $settings Chat settings for index build.
	 * @return array<int,string>
	 */
	private static function generate_and_store( array $settings = array() ): array {
		if ( empty( $settings ) ) {
			$settings = Neo_Pulse_Wp_Chat::get_settings();
		}

		$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		$site_name  = get_bloginfo( 'name' );
		$generated  = self::generate( $site_index, $site_name, $settings );
		if ( is_wp_error( $generated ) || empty( $generated ) ) {
			set_transient( self::FAIL_KEY, 1, self::FAIL_TTL );
			return array();
		}

		delete_transient( self::FAIL_KEY );
		set_transient( self::CACHE_KEY, $generated, self::CACHE_TTL );
		return self::normalize_list( $generated );
	}

	/**
	 * @param array<int,array<string,mixed>> $site_index
	 * @param array<string,mixed>            $settings
	 * @return array<int,string>|WP_Error
	 */
	public static function generate( array $site_index, string $site_name, array $settings = array() ): array|WP_Error {
		if ( empty( $site_index ) ) {
			return new WP_Error( 'neo_pulse_chat_starters_empty', __( 'Site index is empty.', 'neo-pulse-wp' ) );
		}

		$inventory = self::build_inventory_block( $site_index );
		$kb_block  = self::build_knowledge_block( $settings );
		$recency   = self::build_recency_block();

		$system = <<<'PROMPT'
You suggest conversation starter questions for a website chat widget empty state.

Return ONLY valid JSON:
{"starters": ["question 1", "question 2", "question 3"]}

Rules:
- Exactly 3 short visitor questions (max 12 words each).
- Ground every question in the SITE INVENTORY or KNOWLEDGE BASE. Do not invent pages, products, or services.
- Mix helpful discovery (products, services, locations) with action intent (booking, contact, quote) when the inventory supports it.
- Use natural visitor phrasing, not SEO keyword stuffing.
- If RECENT VISITOR QUESTIONS is present, prefer themes that appear there and that the inventory or knowledge base can answer.
- Ignore summarize-the-page prompts, near-duplicate lines, and questions the site cannot answer.
- Do not copy a recent visitor line unless it is grounded in inventory or knowledge base.
- Output ONLY JSON, no markdown fences.
PROMPT;

		$user = "Site name: {$site_name}\n\nSITE INVENTORY:\n{$inventory}";
		if ( $kb_block !== '' ) {
			$user .= "\n\nKNOWLEDGE BASE:\n{$kb_block}";
		}
		if ( $recency !== '' ) {
			$user .= "\n\nRECENT VISITOR QUESTIONS (last 45 days):\n{$recency}";
		}
		$user .= "\n\nPrefer recent visitor themes that inventory or knowledge base can answer. Return exactly 3 starters as JSON.";

		$result = self::call_openrouter( $system, $user );
		if ( is_wp_error( $result ) ) {
			return $result;
		}

		$parsed = self::parse_json_response( (string) $result );
		if ( null === $parsed || empty( $parsed['starters'] ) || ! is_array( $parsed['starters'] ) ) {
			return new WP_Error( 'neo_pulse_chat_starters_parse', __( 'Starter generation returned invalid JSON.', 'neo-pulse-wp' ) );
		}

		return self::normalize_list( $parsed['starters'] );
	}

	/**
	 * @param array<int,array<string,mixed>> $site_index
	 */
	private static function build_inventory_block( array $site_index ): string {
		$lines = array();
		foreach ( array_slice( $site_index, 0, 48 ) as $item ) {
			if ( empty( $item['title'] ) ) {
				continue;
			}
			$url   = isset( $item['url'] ) ? (string) $item['url'] : '';
			$type  = isset( $item['type'] ) ? (string) $item['type'] : '';
			$kw    = ! empty( $item['focus_keyword'] ) ? ' | kw:' . (string) $item['focus_keyword'] : '';
			$lines[] = '- ' . (string) $item['title'] . ( $type !== '' ? " ({$type})" : '' ) . ( $url !== '' ? ' → ' . $url : '' ) . $kw;
		}
		return implode( "\n", $lines );
	}

	/**
	 * @param array<string,mixed> $settings
	 */
	private static function build_knowledge_block( array $settings ): string {
		$kb = isset( $settings['knowledge_base'] ) && is_array( $settings['knowledge_base'] ) ? $settings['knowledge_base'] : array();
		if ( empty( $kb ) ) {
			return '';
		}

		$lines = array();
		foreach ( array_slice( $kb, 0, 12 ) as $entry ) {
			if ( ! is_array( $entry ) ) {
				continue;
			}
			$q = isset( $entry['question'] ) ? trim( (string) $entry['question'] ) : '';
			$a = isset( $entry['answer'] ) ? trim( (string) $entry['answer'] ) : '';
			if ( $q === '' && $a === '' ) {
				continue;
			}
			$lines[] = $q !== '' ? "Q: {$q}\nA: {$a}" : $a;
		}

		return implode( "\n\n", $lines );
	}

	/**
	 * Recent frontend visitor questions for the starter prompt.
	 */
	private static function build_recency_block(): string {
		if ( ! class_exists( 'Neo_Pulse_Wp_Chat_Logs', false ) ) {
			return '';
		}

		$from   = gmdate( 'Y-m-d', time() - ( self::RECENCY_DAYS * DAY_IN_SECONDS ) );
		$result = Neo_Pulse_Wp_Chat_Logs::query(
			array(
				'source'    => 'frontend',
				'role'      => 'user',
				'date_from' => $from,
				'per_page'  => self::RECENCY_LIMIT,
				'orderby'  => 'created_at',
				'order'    => 'desc',
			)
		);
		$items = isset( $result['items'] ) && is_array( $result['items'] ) ? $result['items'] : array();
		$lines = array();
		$n     = 1;
		foreach ( $items as $item ) {
			$content = '';
			if ( is_object( $item ) && isset( $item->content ) ) {
				$content = (string) $item->content;
			} elseif ( is_array( $item ) && isset( $item['content'] ) ) {
				$content = (string) $item['content'];
			}
			$content = trim( wp_strip_all_tags( $content ) );
			if ( $content === '' ) {
				continue;
			}
			if ( strlen( $content ) > self::RECENCY_LINE_MAX ) {
				$content = substr( $content, 0, self::RECENCY_LINE_MAX );
			}
			$lines[] = $n . '. ' . $content;
			++$n;
		}

		return empty( $lines ) ? '' : implode( "\n", $lines );
	}

	/**
	 * @param array<int,mixed> $starters
	 * @return array<int,string>
	 */
	private static function normalize_list( array $starters ): array {
		$out = array();
		foreach ( $starters as $starter ) {
			if ( ! is_string( $starter ) ) {
				continue;
			}
			$starter = trim( sanitize_text_field( $starter ) );
			if ( $starter === '' ) {
				continue;
			}
			$out[] = $starter;
			if ( count( $out ) >= self::MAX_COUNT ) {
				break;
			}
		}
		return $out;
	}

	/**
	 * @return string|WP_Error
	 */
	private static function call_openrouter( string $system_prompt, string $user_prompt ) {
		$key = Neo_Pulse_Wp_OpenRouter::get_api_key();
		if ( $key === '' ) {
			return new WP_Error( 'neo-pulse_openrouter_key', __( 'OpenRouter API key is not configured.', 'neo-pulse-wp' ) );
		}

		Neo_Pulse_Wp_OpenRouter::maybe_extend_time_limit();

		$response = wp_remote_post(
			Neo_Pulse_Wp_OpenRouter::API_URL,
			array(
				'timeout' => Neo_Pulse_Wp_OpenRouter::get_timeout(),
				'headers' => Neo_Pulse_Wp_OpenRouter::request_headers( $key ),
				'body'    => wp_json_encode(
					array(
						'model'       => self::FAST_MODEL,
						'messages'    => array(
							array( 'role' => 'system', 'content' => $system_prompt ),
							array( 'role' => 'user', 'content' => $user_prompt ),
						),
						'temperature' => 0.3,
						'max_tokens'  => self::MAX_TOKENS,
					)
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$data = json_decode( wp_remote_retrieve_body( $response ), true );

		if ( $code < 200 || $code >= 300 || ! is_array( $data ) || empty( $data['choices'][0]['message']['content'] ) ) {
			return new WP_Error( 'neo_pulse_chat_starters_ai', __( 'Starter generation failed.', 'neo-pulse-wp' ) );
		}

		return trim( (string) $data['choices'][0]['message']['content'] );
	}

	/**
	 * @return array|null
	 */
	private static function parse_json_response( string $text ): ?array {
		$text    = trim( $text );
		$text    = preg_replace( '/^```(?:json)?\s*/i', '', $text );
		$text    = preg_replace( '/\s*```$/', '', $text );
		$text    = trim( $text );
		$decoded = json_decode( $text, true );
		return is_array( $decoded ) ? $decoded : null;
	}
}
