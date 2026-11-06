<?php
/**
 * Chat streaming and pipeline helpers.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Trait_Stream_Helpers {

	/**
	 * Full chat pipeline (no streaming). Used for response prefetch.
	 *
	 * @param array<int,array<string,mixed>>   $history
	 * @param array<string,mixed>              $settings
	 * @param array<string,mixed>              $training
	 * @param array<string,mixed>|null         $prefetched
	 * @return array{
	 *   gate:array<string,mixed>,
	 *   card:array<string,mixed>,
	 *   phase_a:array<string,mixed>|null,
	 *   early_retrieved:array<int,array<string,mixed>>
	 * }|WP_Error
	 */
	private static function execute_chat_pipeline(
		string $message,
		array $history,
		array $settings,
		array $training,
		?array $prefetched = null,
		?array $page_context = null
	) {
		$site_name = get_bloginfo( 'name' );

		$gate = is_array( $prefetched ) && isset( $prefetched['ack'] ) && is_array( $prefetched['ack'] )
			? $prefetched['ack']
			: Neo_Pulse_Wp_Chat_Agents::phase_ack( $message, $site_name, $training, $history, $settings );
		if ( is_wp_error( $gate ) ) {
			return $gate;
		}

		if ( is_array( $gate ) && ( $gate['action'] ?? '' ) === 'deny' ) {
			$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
			$denial     = Neo_Pulse_Wp_Chat_Agents::build_denial_card(
				(string) ( $gate['text'] ?? '' ),
				$message,
				$site_name,
				$site_index,
				$history
			);

			return array(
				'gate'            => $gate,
				'card'            => $denial,
				'phase_a'         => null,
				'early_retrieved' => array(),
			);
		}

		$site_index = Neo_Pulse_Wp_Chat_Rag::get_site_index( $settings );
		$intent     = Neo_Pulse_Wp_Chat_Suggestion_Templates::match_intent( $message, $page_context, $site_index );
		if ( is_array( $intent ) ) {
			$card = Neo_Pulse_Wp_Chat_Suggestion_Templates::build_card( $intent, $page_context, $site_index, $settings, $message );
			if ( is_array( $card ) && ! empty( $card ) ) {
				return array(
					'gate'            => $gate,
					'card'            => $card,
					'answer'          => (string) ( $card['body'] ?? '' ),
					'phase_a'         => null,
					'early_retrieved' => array(),
					'template_intent' => (string) ( $intent['intent'] ?? '' ),
				);
			}
		}

		if ( is_array( $prefetched ) && ! empty( $prefetched['early_retrieved'] ) && is_array( $prefetched['early_retrieved'] ) ) {
			$early_retrieved = $prefetched['early_retrieved'];
		} else {
			$early_retrieved = self::retrieve_early_items( $message, $settings, $page_context );
		}
		if ( Neo_Pulse_Wp_Chat_Links::resolve_lead_action( $message, $site_index ) ) {
			$lead_pages      = Neo_Pulse_Wp_Chat_Links::find_lead_pages( $message, $site_index, 2 );
			$early_retrieved = Neo_Pulse_Wp_Chat_Links::dedupe_items_by_id( array_merge( $lead_pages, $early_retrieved ) );
		}

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
			return $phase_a;
		}

		$relevant_items = Neo_Pulse_Wp_Chat_Agents::select_relevant_items( $phase_a, $site_index, $message, $settings, $page_context );
		$enriched_items = self::enrich_relevant_items( $relevant_items, false, $settings );

		$phase_b = Neo_Pulse_Wp_Chat_Agents::phase_reason( $message, $history, $site_name, $enriched_items, $phase_a, $training, $site_index, $page_context );
		if ( is_wp_error( $phase_b ) ) {
			return $phase_b;
		}

		$phase_c = Neo_Pulse_Wp_Chat_Agents::build_card_from_answer( $phase_b, $phase_a, $enriched_items, $message, $site_index, $history );

		if ( Neo_Pulse_Wp_Chat_Lead::is_lead_message( $message, $site_index ) && Neo_Pulse_Wp_Chat_Lead::is_enabled( $settings ) ) {
			$phase_c = Neo_Pulse_Wp_Chat_Lead::enrich_card( $phase_c, $message, $phase_b, $enriched_items, $site_index, $training, $settings );
		}

		if ( is_array( $phase_c ) ) {
			$phase_c = Neo_Pulse_Wp_Chat_Lead::maybe_attach_contact_human_cta( $phase_c, $message, $phase_a, $settings );
		}

		return array(
			'gate'            => $gate,
			'card'            => is_array( $phase_c ) ? $phase_c : array(),
			'answer'          => $phase_b,
			'phase_a'         => $phase_a,
			'early_retrieved' => $enriched_items,
		);
	}

	/**
	 * AJAX warm current-page context for URL-aware chat.
	 */
	public static function ajax_chat_page_context(): void {
		self::verify_chat_ajax_request();

		if ( ! self::passes_chat_access_gates() ) {
			wp_send_json_error( array( 'message' => 'Chat unavailable.' ), 403 );
		}

		// phpcs:ignore WordPress.Security.ValidatedSanitizedInput
		$raw_body = file_get_contents( 'php://input' );
		$body     = json_decode( $raw_body, true );
		$page_url = isset( $body['page_url'] ) ? esc_url_raw( (string) $body['page_url'] ) : '';
		$post_id  = isset( $body['post_id'] ) ? (int) $body['post_id'] : 0;
		$page_title = isset( $body['page_title'] ) ? sanitize_text_field( wp_unslash( (string) $body['page_title'] ) ) : '';

		if ( $page_url === '' && $post_id < 1 ) {
			wp_send_json_error( array( 'message' => 'Missing page URL.' ), 400 );
		}

		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'chat_prefetch', self::PREFETCH_RATE_MAX, self::RATE_WINDOW ) ) {
			wp_send_json_error( array( 'message' => 'Too many requests.' ), 429 );
		}

		$settings = self::get_settings();
		$result   = Neo_Pulse_Wp_Chat_Page_Context::warm_and_store( $page_url, $post_id, $page_title, $settings );
		wp_send_json_success( $result );
	}

	/**
	 * @param array<string,mixed>|null $body
	 * @param array<string,mixed>      $settings
	 * @return array<string,mixed>|null
	 */
	private static function parse_page_context_from_body( ?array $body, array $settings ): ?array {
		if ( ! is_array( $body ) ) {
			return null;
		}

		$page_url = isset( $body['page_url'] ) ? esc_url_raw( (string) $body['page_url'] ) : '';
		$post_id  = isset( $body['post_id'] ) ? (int) $body['post_id'] : 0;
		$page_title = isset( $body['page_title'] ) ? sanitize_text_field( wp_unslash( (string) $body['page_title'] ) ) : '';
		$key = isset( $body['page_context_key'] ) ? sanitize_text_field( wp_unslash( (string) $body['page_context_key'] ) ) : '';

		if ( $page_url === '' && $post_id < 1 && $key === '' ) {
			return null;
		}

		return Neo_Pulse_Wp_Chat_Page_Context::load( $key, $page_url, $post_id, $page_title, $settings );
	}

	/**
	 * Nonce check for the read-only chat ajax actions (stream, prefetch, page context).
	 * Logged-in users must send a valid nonce. Guests are not required to: full-page caches
	 * serve them stale nonces, and these actions are protected by the per-IP rate limit.
	 */
	private static function verify_chat_ajax_request(): void {
		if ( ! is_user_logged_in() ) {
			return;
		}
		check_ajax_referer( 'neo_pulse_chat_stream', '_nonce' );
	}

	/**
	 * Text shown to visitors when an AI call fails (provider error bodies stay server-side).
	 */
	private static function visitor_error_text(): string {
		return Neo_Pulse_Wp_OpenRouter::generic_error_message() . ' ' . __( 'Please try again in a moment.', 'neo-pulse-wp' );
	}

	/**
	 * Card streamed when a visitor sends too many messages.
	 *
	 * @return array<string,string>
	 */
	private static function rate_limited_card(): array {
		return array(
			'type'       => 'not-found',
			'title'      => __( 'Please slow down', 'neo-pulse-wp' ),
			'body'       => __( 'You have sent a lot of messages in a short time. Please wait a few minutes and try again.', 'neo-pulse-wp' ),
			'confidence' => 'low',
		);
	}

	/**
	 * Demo-only RAG debug snapshot (no full post bodies).
	 *
	 * @param array<string,mixed>              $phase_a
	 * @param array<int,array<string,mixed>>   $enriched_items
	 * @param array<int,array<string,mixed>>   $site_index
	 * @return array<string,mixed>
	 */
	private static function build_demo_debug_payload( string $user_message, array $phase_a, array $enriched_items, array $site_index, array $settings = array() ): array {
		$extra_phrases = isset( $phase_a['search_terms'] ) ? array_values( (array) $phase_a['search_terms'] ) : array();
		$match_terms   = Neo_Pulse_Wp_Chat_Rag::extract_match_terms( $user_message, $extra_phrases );

		$retrieved = array();
		foreach ( $enriched_items as $item ) {
			$retrieved[] = array(
				'id'             => isset( $item['id'] ) ? (int) $item['id'] : 0,
				'title'          => isset( $item['title'] ) ? (string) $item['title'] : '',
				'url'            => isset( $item['url'] ) ? (string) $item['url'] : '',
				'slug'           => isset( $item['slug'] ) ? (string) $item['slug'] : '',
				'type'           => isset( $item['type'] ) ? (string) $item['type'] : '',
				'score'          => Neo_Pulse_Wp_Chat_Rag::fuzzy_page_score( $user_message, $item, $extra_phrases ),
				'slug_term_hits' => Neo_Pulse_Wp_Chat_Rag::count_slug_path_term_hits( $user_message, $item, $extra_phrases ),
				'excerpt_length' => isset( $item['excerpt'] ) ? strlen( (string) $item['excerpt'] ) : 0,
			);
		}

		$primary    = Neo_Pulse_Wp_Chat_Links::pick_primary_topic_link( $user_message, $enriched_items, $site_index, $extra_phrases );
		$topics     = Neo_Pulse_Wp_Chat_Links::pick_topic_links( $user_message, $enriched_items, 3, $site_index, true, $extra_phrases );
		$fuzzy_top  = Neo_Pulse_Wp_Chat_Rag::find_fuzzy_topic_pages( $user_message, $site_index, 5, $extra_phrases );
		$url_hits   = Neo_Pulse_Wp_Chat_Rag::index_url_term_hits( $user_message, $site_index, $extra_phrases );
		$type_counts = array();
		foreach ( $site_index as $item ) {
			$t = isset( $item['type'] ) ? (string) $item['type'] : 'unknown';
			$type_counts[ $t ] = ( $type_counts[ $t ] ?? 0 ) + 1;
		}

		return array(
			'timestamp'              => gmdate( 'c' ),
			'user_message'           => $user_message,
			'match_terms'            => array_values( $match_terms ),
			'index_count'            => count( $site_index ),
			'index_source'           => array(
				'source'     => 'sitemap',
				'post_types' => Neo_Pulse_Wp_Chat_Rag::get_index_post_types( $settings ),
				'type_counts' => $type_counts,
			),
			'phase_a'                => array(
				'intent'       => isset( $phase_a['intent'] ) ? (string) $phase_a['intent'] : '',
				'relevant_ids' => isset( $phase_a['relevant_ids'] ) ? array_map( 'intval', (array) $phase_a['relevant_ids'] ) : array(),
				'search_terms' => $extra_phrases,
			),
			'retrieved_items'        => $retrieved,
			'url_term_hits'          => $url_hits,
			'fuzzy_top_5'            => array_map(
				function ( $item ) {
					return array(
						'id'    => isset( $item['id'] ) ? (int) $item['id'] : 0,
						'title' => isset( $item['title'] ) ? (string) $item['title'] : '',
						'slug'  => isset( $item['slug'] ) ? (string) $item['slug'] : '',
						'url'   => isset( $item['url'] ) ? (string) $item['url'] : '',
						'score' => isset( $item['fuzzy_score'] ) ? (float) $item['fuzzy_score'] : 0,
					);
				},
				$fuzzy_top
			),
			'topic_link_primary'     => null !== $primary ? array(
				'label' => $primary['label'],
				'url'   => $primary['url'],
				'score' => isset( $primary['score'] ) ? (float) $primary['score'] : 0,
			) : null,
			'topic_links'            => array_map(
				function ( $link ) {
					return array(
						'label' => $link['label'],
						'url'   => $link['url'],
						'score' => isset( $link['score'] ) ? (float) $link['score'] : 0,
					);
				},
				$topics
			),
			'enriched_excerpt_lengths' => array_map(
				function ( $item ) {
					return isset( $item['excerpt'] ) ? strlen( (string) $item['excerpt'] ) : 0;
				},
				$enriched_items
			),
		);
	}

	/**
	 * Open an unbuffered NDJSON stream response.
	 */
	public static function stream_begin(): void {
		self::begin_stream_response();
	}

	/**
	 * Flush a single NDJSON line to the output stream.
	 *
	 * @param array $data JSON-serialisable payload.
	 */
	public static function stream_emit( array $data ): void {
		self::stream_line( $data );
	}

	/**
	 * Open an unbuffered NDJSON stream response.
	 */
	private static function begin_stream_response(): void {
		if ( headers_sent() ) {
			return;
		}
		header( 'Content-Type: text/plain; charset=utf-8' );
		header( 'Cache-Control: no-cache' );
		header( 'X-Accel-Buffering: no' );
		if ( function_exists( 'apache_setenv' ) ) {
			apache_setenv( 'no-gzip', '1' ); // @codeCoverageIgnore
		}
		while ( ob_get_level() ) {
			ob_end_flush();
		}
	}

	/**
	 * Flush a single NDJSON line to the output stream.
	 *
	 * @param array $data JSON-serialisable payload.
	 */
	private static function stream_line( array $data ): void {
		if ( isset( $data['card'] ) && is_array( $data['card'] ) ) {
			$data['card'] = Neo_Pulse_Wp_Display_Text::decode_card( $data['card'] );
		}
		echo wp_json_encode( $data ) . "\n";
		if ( ob_get_level() ) {
			ob_flush();
		}
		flush();
	}
}
