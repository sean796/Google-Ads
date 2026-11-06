<?php
/**
 * Chat streaming responses.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Trait_Stream {

	/**
	 * AJAX streaming handler: runs the pipeline step-by-step, flushing
	 * NDJSON progress events so the frontend can show live status.
	 *
	 * Each line is a JSON object: {"status":"...","label":"..."} for progress,
	 * or {"status":"done","card":{...}} for the final result.
	 */
	public static function ajax_chat_stream(): void {
		self::verify_chat_ajax_request();

		if ( self::is_off_everywhere() || ( ! self::is_enabled() && ! current_user_can( 'manage_options' ) ) ) {
			self::begin_stream_response();
			self::stream_line( array( 'status' => 'done', 'card' => array(
				'type' => 'not-found', 'title' => 'Disabled', 'body' => 'Chat widget is not enabled.', 'confidence' => 'low',
			) ) );
			wp_die();
		}
		if ( ! self::can_use_chat_api() ) {
			self::begin_stream_response();
			self::stream_line( array( 'status' => 'done', 'card' => array(
				'type' => 'not-found', 'title' => 'Login required', 'body' => 'Chat is available to logged-in users only.', 'confidence' => 'low',
			) ) );
			wp_die();
		}

		$api_key = Neo_Pulse_Wp_OpenRouter::get_api_key();
		if ( $api_key === '' ) {
			self::begin_stream_response();
			self::stream_line( array( 'status' => 'done', 'card' => array(
				'type' => 'not-found', 'title' => 'Not configured', 'body' => 'AI is not configured. Please add an OpenRouter API key.', 'confidence' => 'low',
			) ) );
			wp_die();
		}

		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$raw_body = file_get_contents( 'php://input' );
		$body     = json_decode( $raw_body, true );
		$message  = isset( $body['message'] ) ? sanitize_textarea_field( wp_unslash( $body['message'] ) ) : '';
		$history  = isset( $body['history'] ) && is_array( $body['history'] ) ? $body['history'] : array();

		if ( Neo_Pulse_Wp_Chat_Super_Admin::is_backend_mode_request( is_array( $body ) ? $body : null ) ) {
			$history = Neo_Pulse_Wp_Chat_History::normalize( $history );
			Neo_Pulse_Wp_Chat_Super_Admin::stream_pipeline( $message, $history, is_array( $body ) ? $body : null );
			return;
		}

		$log_meta = Neo_Pulse_Wp_Chat_Logs::parse_meta_from_body( is_array( $body ) ? $body : null );

		self::begin_stream_response();

		if ( trim( $message ) === '' ) {
			self::stream_line( array( 'status' => 'done', 'card' => array(
				'type' => 'not-found', 'title' => 'Empty message', 'body' => 'Message cannot be empty.', 'confidence' => 'low',
			) ) );
			wp_die();
		}

		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'chat_stream', self::STREAM_RATE_MAX, self::RATE_WINDOW ) ) {
			self::stream_line( array( 'status' => 'done', 'card' => self::rate_limited_card() ) );
			wp_die();
		}

		// Visitor pipeline: only the visitor's own turns go back to the model (client-sent
		// assistant turns could carry injected instructions).
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

		$prefetch_key = isset( $body['prefetch_key'] ) ? sanitize_text_field( wp_unslash( (string) $body['prefetch_key'] ) ) : '';
		$prefetched   = self::load_prefetch_payload( $prefetch_key, $message, $history );

		if ( is_array( $prefetched ) && ! empty( $prefetched['card'] ) && is_array( $prefetched['card'] ) ) {
			self::stream_prefetched_card( $message, $prefetched, $log_meta, $settings, $history, $page_context );
			wp_die();
		}

		// -- Secretary gate (instant, before RAG / site index) --
		$gate = is_array( $prefetched ) && isset( $prefetched['ack'] ) && is_array( $prefetched['ack'] )
			? $prefetched['ack']
			: Neo_Pulse_Wp_Chat_Agents::phase_ack( $message, $site_name, $training, $history, $settings );
		if ( is_wp_error( $gate ) ) {
			self::stream_line( array( 'status' => 'done', 'card' => array(
				'type' => 'not-found', 'title' => 'Something went wrong', 'body' => self::visitor_error_text(), 'confidence' => 'low',
			) ) );
			wp_die();
		}

		if ( is_array( $gate ) && trim( (string) ( $gate['text'] ?? '' ) ) !== '' ) {
			self::stream_line( array( 'status' => 'ack', 'text' => trim( (string) $gate['text'] ) ) );
		}

		Neo_Pulse_Wp_Chat_Logs::log_user_message( $message, self::enrich_log_meta_for_message( $log_meta, $message, $page_context, $settings ) );

		if ( is_array( $gate ) && ( $gate['action'] ?? '' ) === 'deny' ) {
			$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
			$denial = Neo_Pulse_Wp_Chat_Agents::build_denial_card(
				(string) ( $gate['text'] ?? '' ),
				$message,
				$site_name,
				$site_index,
				$history
			);
			$message_uid = Neo_Pulse_Wp_Chat_Logs::log_assistant_card( $denial, $log_meta );
			if ( $message_uid !== '' ) {
				$denial['message_uid'] = $message_uid;
			}
			self::stream_line( array( 'status' => 'done', 'card' => $denial ) );
			wp_die();
		}

		if ( self::try_stream_template_response( $message, $page_context, $settings, $log_meta, $history ) ) {
			wp_die();
		}

		if ( self::try_stream_blog_discovery_response( $message, $settings, $log_meta, $history ) ) {
			wp_die();
		}

		// -- Instant retrieve (continue path) --
		$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		if ( is_array( $prefetched ) && ! empty( $prefetched['early_retrieved'] ) && is_array( $prefetched['early_retrieved'] ) ) {
			$early_retrieved = $prefetched['early_retrieved'];
		} else {
			$early_retrieved = self::retrieve_early_items( $message, $settings, $page_context );
		}
		if ( Neo_Pulse_Wp_Chat_Links::resolve_lead_action( $message, $site_index ) ) {
			$lead_pages      = Neo_Pulse_Wp_Chat_Links::find_lead_pages( $message, $site_index, 2 );
			$early_retrieved = Neo_Pulse_Wp_Chat_Links::dedupe_items_by_id( array_merge( $lead_pages, $early_retrieved ) );
		}

		self::stream_line( array( 'status' => 'searching', 'label' => 'Searching content…' ) );

		$phase_a = null;
		if ( is_array( $prefetched ) && ! empty( $prefetched['phase_a'] ) && is_array( $prefetched['phase_a'] ) ) {
			$phase_a = $prefetched['phase_a'];
		}
		if ( null === $phase_a ) {
			$phase_a = Neo_Pulse_Wp_Chat_Agents::synthesize_classification_from_retrieve( $message, $early_retrieved );
		}
		if ( null === $phase_a ) {
			$narrow  = Neo_Pulse_Wp_Chat_Agents::build_narrow_candidate_items( $site_index, $message, $early_retrieved, $settings );
			$phase_a = Neo_Pulse_Wp_Chat_Agents::phase_classify( $message, $site_name, $site_index, $narrow );
		}
		if ( is_wp_error( $phase_a ) ) {
			self::stream_line( array( 'status' => 'done', 'card' => array(
				'type' => 'not-found', 'title' => 'Something went wrong', 'body' => self::visitor_error_text(), 'confidence' => 'low',
			) ) );
			wp_die();
		}

		$relevant_items = Neo_Pulse_Wp_Chat_Agents::select_relevant_items( $phase_a, $site_index, $message, $settings, $page_context );

		$enriched_items = self::enrich_relevant_items( $relevant_items, true, $settings );

		// -- Phase B: reason --
		self::stream_line( array( 'status' => 'thinking', 'label' => 'Thinking…' ) );

		$phase_b = Neo_Pulse_Wp_Chat_Agents::phase_reason( $message, $history, $site_name, $enriched_items, $phase_a, $training, $site_index, $page_context );
		if ( is_wp_error( $phase_b ) ) {
			self::stream_line( array( 'status' => 'done', 'card' => array(
				'type' => 'not-found', 'title' => 'Something went wrong', 'body' => self::visitor_error_text(), 'confidence' => 'low',
			) ) );
			wp_die();
		}

		// -- Deterministic card (skip Phase C LLM in stream) --
		self::stream_line( array( 'status' => 'formatting', 'label' => 'Formatting response…' ) );

		$phase_c = Neo_Pulse_Wp_Chat_Agents::build_card_from_answer( $phase_b, $phase_a, $enriched_items, $message, $site_index, $history );

		if ( Neo_Pulse_Wp_Chat_Lead::is_lead_message( $message, $site_index ) && Neo_Pulse_Wp_Chat_Lead::is_enabled( $settings ) ) {
			self::stream_line( array( 'status' => 'formatting', 'label' => 'Preparing next steps…' ) );
			$phase_c = Neo_Pulse_Wp_Chat_Lead::enrich_card( $phase_c, $message, $phase_b, $enriched_items, $site_index, $training, $settings );
		}

		if ( is_array( $phase_c ) ) {
			$phase_c = Neo_Pulse_Wp_Chat_Lead::maybe_attach_contact_human_cta( $phase_c, $message, $phase_a, $settings );
		}

		if ( is_array( $phase_c ) ) {
			$message_uid = Neo_Pulse_Wp_Chat_Logs::log_assistant_card( $phase_c, $log_meta );
			if ( $message_uid !== '' ) {
				$phase_c['message_uid'] = $message_uid;
			}
		}

		$done_payload = array( 'status' => 'done', 'card' => $phase_c );
		if ( isset( $log_meta['source'] ) && $log_meta['source'] === 'demo' && current_user_can( 'manage_options' ) ) {
			$done_payload['debug'] = self::build_demo_debug_payload(
				$message,
				$phase_a,
				$enriched_items,
				$site_index,
				$settings
			);
		}

		self::stream_line( $done_payload );
		self::stream_followup_chips(
			$message,
			is_array( $phase_c ) ? $phase_c : array(),
			$phase_b,
			$enriched_items,
			$site_index,
			$history,
			$page_context
		);
		wp_die();
	}

	/**
	 * Blog discovery fast path: real post URLs from the NEO Pulse post sitemap.
	 *
	 * @param array<string,mixed>              $settings
	 * @param array<string,mixed>              $log_meta
	 * @param array<int,array<string,mixed>>   $history
	 */
	private static function try_stream_blog_discovery_response(
		string $message,
		array $settings,
		array $log_meta,
		array $history
	): bool {
		if ( ! Neo_Pulse_Wp_Chat_Rag::is_site_blog_discovery_query( $message ) ) {
			return false;
		}

		$posts = Neo_Pulse_Wp_Chat_Rag::collect_sitemap_blog_posts( $message, $settings, 5 );
		if ( empty( $posts ) ) {
			return false;
		}

		self::stream_line( array( 'status' => 'formatting', 'label' => 'Finding blog posts…' ) );

		$card = Neo_Pulse_Wp_Chat_Rag::build_blog_discovery_card( $message, $posts, $settings );
		if ( ! is_array( $card ) || empty( $card['body'] ) ) {
			return false;
		}

		$site_index     = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		$seen_urls      = Neo_Pulse_Wp_Chat_History::collect_seen_urls( $history );
		$classification = array(
			'intent'       => 'recommendation',
			'search_terms' => array(),
		);
		$card           = Neo_Pulse_Wp_Chat_Links::attach_to_card(
			$card,
			$message,
			(string) $card['body'],
			$posts,
			$classification,
			$site_index,
			$seen_urls,
			array()
		);

		// The user message was already logged by ajax_chat_stream() before this fast path.
		$message_uid = Neo_Pulse_Wp_Chat_Logs::log_assistant_card( $card, $log_meta );
		if ( $message_uid !== '' ) {
			$card['message_uid'] = $message_uid;
		}

		self::stream_line( array( 'status' => 'done', 'card' => $card ) );

		$followups = Neo_Pulse_Wp_Chat_Rag::blog_discovery_followup_topics( $posts, $settings );
		if ( ! empty( $followups ) ) {
			$payload = array(
				'status'        => 'chips',
				'relatedTopics' => $followups,
			);
			if ( $message_uid !== '' ) {
				$payload['message_uid'] = $message_uid;
			}
			self::stream_line( $payload );
		}

		return true;
	}

	/**
	 * Template fast path: OpenRouter-formatted card from page content, no full RAG pipeline.
	 *
	 * @param array<string,mixed>|null     $page_context
	 * @param array<string,mixed>          $log_meta
	 * @param array<int,array<string,mixed>> $history
	 */
	private static function try_stream_template_response(
		string $message,
		?array $page_context,
		array $settings,
		array $log_meta,
		array $history
	): bool {
		$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		$intent     = Neo_Pulse_Wp_Chat_Suggestion_Templates::match_intent( $message, $page_context, $site_index );
		if ( null === $intent ) {
			return false;
		}

		self::stream_line( array( 'status' => 'formatting', 'label' => 'Formatting response…' ) );

		$card = Neo_Pulse_Wp_Chat_Suggestion_Templates::build_card( $intent, $page_context, $site_index, $settings, $message );
		if ( ! is_array( $card ) || empty( $card ) ) {
			return false;
		}

		$message_uid = Neo_Pulse_Wp_Chat_Logs::log_assistant_card( $card, $log_meta );
		if ( $message_uid !== '' ) {
			$card['message_uid'] = $message_uid;
		}

		self::stream_line(
			array(
				'status'          => 'done',
				'card'            => $card,
				'prefetched'      => true,
				'template_intent' => (string) ( $intent['intent'] ?? '' ),
			)
		);

		$answer = (string) ( $card['body'] ?? '' );
		self::stream_followup_chips(
			$message,
			$card,
			$answer,
			array(),
			$site_index,
			$history,
			$page_context
		);

		return true;
	}

	/**
	 * Generate and stream async follow-up chips after the answer card.
	 *
	 * @param array<string,mixed>              $card
	 * @param array<int,array<string,mixed>>   $items
	 * @param array<int,array<string,mixed>>   $site_index
	 * @param array<int,array<string,mixed>>   $history
	 */
	private static function stream_followup_chips(
		string $user_message,
		array $card,
		string $answer,
		array $items,
		array $site_index,
		array $history,
		?array $page_context = null
	): void {
		unset( $card['relatedTopics'] );

		$type = isset( $card['type'] ) ? (string) $card['type'] : '';
		if ( in_array( $type, array( 'error', 'not-found' ), true ) ) {
			return;
		}
		$answer_text = trim( $answer );
		if ( $answer_text === '' ) {
			$answer_text = trim( (string) ( $card['body'] ?? '' ) );
		}
		if ( $answer_text === '' ) {
			return;
		}

		$topics = Neo_Pulse_Wp_Chat_Agents::generate_followup_topics(
			$user_message,
			$answer_text,
			$items,
			$site_index,
			$history,
			$page_context,
			$card
		);
		if ( empty( $topics ) ) {
			return;
		}

		$payload = array(
			'status'        => 'chips',
			'relatedTopics' => $topics,
		);
		if ( ! empty( $card['message_uid'] ) ) {
			$payload['message_uid'] = (string) $card['message_uid'];
		}
		self::stream_line( $payload );
	}

	/**
	 * Fetch rendered post content for all relevant items before Phase B.
	 *
	 * @param array $items               Relevant items from select_relevant_items().
	 * @param bool  $emit_reading_events Stream NDJSON reading events when true.
	 * @param array $settings            Chat settings (unused; kept for call-site compat).
	 * @return array Items with excerpt replaced by full page content for reasoning.
	 */
	public static function enrich_relevant_items( array $items, bool $emit_reading_events = false, array $settings = array() ): array {
		if ( empty( $items ) ) {
			return $items;
		}

		$items = array_slice( $items, 0, Neo_Pulse_Wp_Chat_Rag::ENRICH_MAX );

		if ( $emit_reading_events ) {
			self::stream_line(
				array(
					'status' => 'reading',
					'label'  => 'Reading matched pages…',
				)
			);
		}

		foreach ( $items as $i => $item ) {
			$post = get_post( $item['id'] );
			if ( ! $post || $post->post_status !== 'publish' ) {
				continue;
			}

			if ( $emit_reading_events ) {
				self::stream_line(
					array(
						'status' => 'reading',
						'label'  => 'Reading ' . $item['title'] . '…',
					)
				);
			}

			$full = Neo_Pulse_Wp_Chat_Rag::read_post_body_for_chat( $post->ID );
			if ( $full !== '' ) {
				$items[ $i ]['excerpt'] = $full;
			}
		}

		return $items;
	}

	/**
	 * Resolve input_origin for chat log rows (client hint + template intents).
	 *
	 * @param array<string,mixed>      $log_meta
	 * @param array<string,mixed>|null $page_context
	 * @param array<string,mixed>      $settings
	 * @return array<string,mixed>
	 */
	private static function enrich_log_meta_for_message( array $log_meta, string $message, ?array $page_context, array $settings ): array {
		$origin = isset( $log_meta['input_origin'] )
			? Neo_Pulse_Wp_Chat_Logs::sanitize_input_origin( (string) $log_meta['input_origin'] )
			: 'typed';

		$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		if ( Neo_Pulse_Wp_Chat_Suggestion_Templates::match_intent( $message, $page_context, $site_index ) !== null ) {
			$origin = 'template';
		}

		$log_meta['input_origin'] = $origin;
		return $log_meta;
	}
}
