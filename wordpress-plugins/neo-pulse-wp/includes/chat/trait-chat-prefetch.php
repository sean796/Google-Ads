<?php
/**
 * Chat prefetch endpoints and payload loading.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Trait_Prefetch {

	/**
	 * AJAX prefetch: secretary ack + early RAG while the visitor is still typing.
	 */
	public static function ajax_chat_prefetch(): void {
		self::verify_chat_ajax_request();

		if ( ! self::passes_chat_access_gates() ) {
			wp_send_json_error( array( 'message' => 'Chat unavailable.' ), 403 );
		}

		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$raw_body = file_get_contents( 'php://input' );
		$body     = json_decode( $raw_body, true );
		$message  = isset( $body['message'] ) ? sanitize_textarea_field( wp_unslash( $body['message'] ) ) : '';
		$history  = isset( $body['history'] ) && is_array( $body['history'] ) ? $body['history'] : array();

		if ( trim( $message ) === '' ) {
			wp_send_json_error( array( 'message' => 'Empty message.' ), 400 );
		}

		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'chat_prefetch', self::PREFETCH_RATE_MAX, self::RATE_WINDOW ) ) {
			wp_send_json_error( array( 'message' => 'Too many requests.' ), 429 );
		}

		$history  = Neo_Pulse_Wp_Chat_History::for_visitor( Neo_Pulse_Wp_Chat_History::normalize( $history ) );
		$settings = self::get_settings();
		$page_context = self::parse_page_context_from_body( is_array( $body ) ? $body : null, $settings );
		$site_name = get_bloginfo( 'name' );
		$training = array(
			'assistant_name' => self::assistant_name_for_request( $body ?? null, $settings ),
			'system_prompt'  => $settings['system_prompt'],
			'greeting_style' => $settings['greeting_style'],
			'knowledge_base' => $settings['knowledge_base'],
		);

		$gate = Neo_Pulse_Wp_Chat_Agents::phase_ack( $message, $site_name, $training, $history, $settings );
		if ( is_wp_error( $gate ) ) {
			wp_send_json_error( array( 'message' => self::visitor_error_text() ), 500 );
		}

		$site_index      = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		$early_retrieved = self::retrieve_early_items( $message, $settings, $page_context );
		if ( Neo_Pulse_Wp_Chat_Links::resolve_lead_action( $message, $site_index ) ) {
			$lead_pages      = Neo_Pulse_Wp_Chat_Links::find_lead_pages( $message, $site_index, 2 );
			$early_retrieved = Neo_Pulse_Wp_Chat_Links::dedupe_items_by_id( array_merge( $lead_pages, $early_retrieved ) );
		}

		$phase_a = Neo_Pulse_Wp_Chat_Agents::synthesize_classification_from_retrieve( $message, $early_retrieved );

		$prefetch_key = wp_generate_password( 32, false, false );
		set_transient(
			self::PREFETCH_TRANSIENT_PREFIX . $prefetch_key,
			array(
				'message'         => $message,
				'history_hash'    => self::prefetch_history_hash( $history ),
				'ack'             => $gate,
				'early_retrieved' => $early_retrieved,
				'phase_a'         => $phase_a,
			),
			self::PREFETCH_TTL
		);

		wp_send_json_success(
			array(
				'message'      => $message,
				'prefetch_key' => $prefetch_key,
				'ack'          => array(
					'action' => isset( $gate['action'] ) ? (string) $gate['action'] : 'continue',
					'text'   => isset( $gate['text'] ) ? (string) $gate['text'] : '',
				),
			)
		);
	}

	/**
	 * AJAX fast ack prefetch: secretary ack only (no RAG) while the visitor types.
	 */
	public static function ajax_chat_ack_prefetch(): void {
		self::verify_chat_ajax_request();

		if ( ! self::passes_chat_access_gates() ) {
			wp_send_json_error( array( 'message' => 'Chat unavailable.' ), 403 );
		}

		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$raw_body = file_get_contents( 'php://input' );
		$body     = json_decode( $raw_body, true );
		$message  = isset( $body['message'] ) ? sanitize_textarea_field( wp_unslash( $body['message'] ) ) : '';
		$history  = isset( $body['history'] ) && is_array( $body['history'] ) ? $body['history'] : array();

		if ( trim( $message ) === '' ) {
			wp_send_json_error( array( 'message' => 'Empty message.' ), 400 );
		}

		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'chat_prefetch', self::PREFETCH_RATE_MAX, self::RATE_WINDOW ) ) {
			wp_send_json_error( array( 'message' => 'Too many requests.' ), 429 );
		}

		$history  = Neo_Pulse_Wp_Chat_History::for_visitor( Neo_Pulse_Wp_Chat_History::normalize( $history ) );
		$settings = self::get_settings();
		$site_name = get_bloginfo( 'name' );
		$training = array(
			'assistant_name' => self::assistant_name_for_request( $body ?? null, $settings ),
			'system_prompt'  => $settings['system_prompt'],
			'greeting_style' => $settings['greeting_style'],
			'knowledge_base' => $settings['knowledge_base'],
		);

		$gate = Neo_Pulse_Wp_Chat_Agents::phase_ack( $message, $site_name, $training, $history, $settings );
		if ( is_wp_error( $gate ) ) {
			wp_send_json_error( array( 'message' => self::visitor_error_text() ), 500 );
		}

		wp_send_json_success(
			array(
				'message' => $message,
				'ack'     => array(
					'action' => isset( $gate['action'] ) ? (string) $gate['action'] : 'continue',
					'text'   => isset( $gate['text'] ) ? (string) $gate['text'] : '',
				),
			)
		);
	}

	/**
	 * AJAX full response prefetch for conversation starters and follow-up chips.
	 */
	public static function ajax_chat_response_prefetch(): void {
		self::verify_chat_ajax_request();

		if ( ! self::passes_chat_access_gates() ) {
			wp_send_json_error( array( 'message' => 'Chat unavailable.' ), 403 );
		}

		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$raw_body = file_get_contents( 'php://input' );
		$body     = json_decode( $raw_body, true );
		$message  = isset( $body['message'] ) ? sanitize_textarea_field( wp_unslash( $body['message'] ) ) : '';
		$history  = isset( $body['history'] ) && is_array( $body['history'] ) ? $body['history'] : array();

		if ( trim( $message ) === '' ) {
			wp_send_json_error( array( 'message' => 'Empty message.' ), 400 );
		}

		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'chat_prefetch', self::PREFETCH_RATE_MAX, self::RATE_WINDOW ) ) {
			wp_send_json_error( array( 'message' => 'Too many requests.' ), 429 );
		}

		$history  = Neo_Pulse_Wp_Chat_History::for_visitor( Neo_Pulse_Wp_Chat_History::normalize( $history ) );
		$settings = self::get_settings();
		$page_context = self::parse_page_context_from_body( is_array( $body ) ? $body : null, $settings );
		$training = array(
			'assistant_name' => self::assistant_name_for_request( $body ?? null, $settings ),
			'system_prompt'  => $settings['system_prompt'],
			'greeting_style' => $settings['greeting_style'],
			'knowledge_base' => $settings['knowledge_base'],
		);

		$result = self::execute_chat_pipeline( $message, $history, $settings, $training, null, $page_context );
		if ( is_wp_error( $result ) ) {
			wp_send_json_error( array( 'message' => self::visitor_error_text() ), 500 );
		}

		$gate = $result['gate'];
		$prefetch_key = wp_generate_password( 32, false, false );
		$prefetch_payload = array(
			'message'         => $message,
			'history_hash'    => self::prefetch_history_hash( $history ),
			'ack'             => $gate,
			'card'            => $result['card'],
			'answer'          => isset( $result['answer'] ) ? (string) $result['answer'] : '',
			'early_retrieved' => $result['early_retrieved'],
			'phase_a'         => $result['phase_a'],
		);
		if ( ! empty( $result['template_intent'] ) ) {
			$prefetch_payload['template_intent'] = (string) $result['template_intent'];
		}
		set_transient(
			self::PREFETCH_TRANSIENT_PREFIX . $prefetch_key,
			$prefetch_payload,
			self::RESPONSE_PREFETCH_TTL
		);

		wp_send_json_success(
			array(
				'message'      => $message,
				'prefetch_key' => $prefetch_key,
				'ready'        => true,
				'ack'          => array(
					'action' => isset( $gate['action'] ) ? (string) $gate['action'] : 'continue',
					'text'   => isset( $gate['text'] ) ? (string) $gate['text'] : '',
				),
			)
		);
	}

	/**
	 * Stream a fully prefetched card (starters / follow-up chips).
	 *
	 * @param array<string,mixed>              $prefetched
	 * @param array<string,mixed>              $log_meta
	 * @param array<string,mixed>              $settings
	 */
	private static function stream_prefetched_card(
		string $message,
		array $prefetched,
		array $log_meta,
		array $settings,
		array $history,
		?array $page_context = null
	): void {
		$gate = isset( $prefetched['ack'] ) && is_array( $prefetched['ack'] )
			? $prefetched['ack']
			: array(
				'action' => 'continue',
				'text'   => '',
			);

		if ( trim( (string) ( $gate['text'] ?? '' ) ) !== '' ) {
			self::stream_line( array( 'status' => 'ack', 'text' => trim( (string) $gate['text'] ) ) );
		}

		Neo_Pulse_Wp_Chat_Logs::log_user_message( $message, self::enrich_log_meta_for_message( $log_meta, $message, $page_context, $settings ) );

		$phase_c = isset( $prefetched['card'] ) && is_array( $prefetched['card'] ) ? $prefetched['card'] : array();
		if ( is_array( $phase_c ) && ! empty( $phase_c ) ) {
			$message_uid = Neo_Pulse_Wp_Chat_Logs::log_assistant_card( $phase_c, $log_meta );
			if ( $message_uid !== '' ) {
				$phase_c['message_uid'] = $message_uid;
			}
		}

		$done_payload = array(
			'status'     => 'done',
			'card'       => $phase_c,
			'prefetched' => true,
		);
		if ( ! empty( $prefetched['template_intent'] ) ) {
			$done_payload['template_intent'] = (string) $prefetched['template_intent'];
		}

		if (
			isset( $log_meta['source'] )
			&& $log_meta['source'] === 'demo'
			&& current_user_can( 'manage_options' )
			&& ! empty( $prefetched['phase_a'] )
			&& is_array( $prefetched['phase_a'] )
		) {
			$site_index     = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
			$enriched_items = isset( $prefetched['early_retrieved'] ) && is_array( $prefetched['early_retrieved'] )
				? $prefetched['early_retrieved']
				: array();
			$done_payload['debug'] = self::build_demo_debug_payload(
				$message,
				$prefetched['phase_a'],
				$enriched_items,
				$site_index,
				$settings
			);
		}

		self::stream_line( $done_payload );

		$site_index     = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		$enriched_items = isset( $prefetched['early_retrieved'] ) && is_array( $prefetched['early_retrieved'] )
			? $prefetched['early_retrieved']
			: array();
		$answer = isset( $prefetched['answer'] ) ? (string) $prefetched['answer'] : (string) ( $phase_c['body'] ?? '' );

		self::stream_followup_chips(
			$message,
			is_array( $phase_c ) ? $phase_c : array(),
			$answer,
			$enriched_items,
			$site_index,
			$history,
			$page_context
		);
	}

	/**
	 * Shared enabled / visitor / API-key gates for stream + prefetch.
	 */
	private static function passes_chat_access_gates(): bool {
		if ( ! self::can_use_chat_api() ) {
			return false;
		}
		if ( Neo_Pulse_Wp_OpenRouter::get_api_key() === '' ) {
			return false;
		}
		return true;
	}

	/**
	 * @param array<int,array<string,mixed>> $history
	 */
	private static function prefetch_history_hash( array $history ): string {
		return md5( wp_json_encode( array_slice( $history, -10 ) ) );
	}

	/**
	 * @param array<string,mixed>              $settings
	 * @param array<string,mixed>|null         $page_context
	 * @return array<int,array<string,mixed>>
	 */
	private static function retrieve_early_items( string $message, array $settings, ?array $page_context = null ): array {
		$items = Neo_Pulse_Wp_Chat_Rag::retrieve( $message, Neo_Pulse_Wp_Chat_Rag::MAX_RESULTS, $settings );
		$items = Neo_Pulse_Wp_Chat_Rag::merge_blog_discovery_items( $message, $items, $settings );
		return Neo_Pulse_Wp_Chat_Page_Context::merge_into_items( $items, $page_context, $message );
	}

	/**
	 * @param array<int,array<string,mixed>> $history
	 * @return array<string,mixed>|null
	 */
	private static function load_prefetch_payload( string $prefetch_key, string $message, array $history ): ?array {
		$prefetch_key = trim( $prefetch_key );
		if ( $prefetch_key === '' ) {
			return null;
		}

		$stored = get_transient( self::PREFETCH_TRANSIENT_PREFIX . $prefetch_key );
		if ( ! is_array( $stored ) ) {
			return null;
		}

		if ( (string) ( $stored['message'] ?? '' ) !== $message ) {
			return null;
		}

		if ( (string) ( $stored['history_hash'] ?? '' ) !== self::prefetch_history_hash( $history ) ) {
			return null;
		}

		delete_transient( self::PREFETCH_TRANSIENT_PREFIX . $prefetch_key );

		return $stored;
	}
}
