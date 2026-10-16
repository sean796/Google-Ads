<?php
/**
 * NEO Pulse Voice: REST endpoint for speech-to-text (push-to-talk input).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Voice {

	const REST_NAMESPACE = 'neo-pulse/v1';

	/** Transcriptions per IP per window for visitors (editors are exempt). */
	const RATE_LIMIT_MAX = 10;

	const RATE_LIMIT_WINDOW = 300;

	/**
	 * Hook registrations.
	 */
	public static function init(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
		add_filter( 'autoptimize_filter_js_exclude', array( __CLASS__, 'autoptimize_exclude_voice_scripts' ) );
	}

	/**
	 * Keep voice scripts out of Autoptimize bundles.
	 *
	 * @param string $exclude Comma-separated exclude list.
	 * @return string
	 */
	public static function autoptimize_exclude_voice_scripts( $exclude ): string {
		if ( ! is_string( $exclude ) ) {
			$exclude = '';
		}
		$needles = array( 'neo-pulse-voice', 'neo-pulse-thinking-card', 'neo-pulse-chat-widget', 'neo-pulse-markdown' );
		foreach ( $needles as $needle ) {
			if ( strpos( $exclude, $needle ) === false ) {
				$exclude .= ( $exclude !== '' ? ', ' : '' ) . $needle;
			}
		}
		return $exclude;
	}

	/**
	 * Register voice REST routes.
	 */
	public static function register_routes(): void {
		register_rest_route(
			self::REST_NAMESPACE,
			'/voice/transcribe',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'rest_transcribe' ),
				'permission_callback' => array( __CLASS__, 'rest_permission' ),
			)
		);
	}

	/**
	 * @param WP_REST_Request $request
	 * @return bool
	 */
	public static function rest_permission( WP_REST_Request $request ): bool {
		if ( ! Neo_Pulse_Wp_License::is_licensed( false ) ) {
			return false; // Not licensed: no AI voice (see class-neo-pulse-wp-license.php).
		}
		// Editors also dictate in wp-admin (Backend Assist), outside the chat widget.
		if ( current_user_can( 'edit_posts' ) ) {
			return true;
		}
		// Everyone else gets exactly the chat's access rules (off everywhere, enabled,
		// logged-in only, admin only, whitelist, licence) plus the chat nonce.
		if ( ! Neo_Pulse_Wp_Chat::can_use_chat_api() ) {
			return false;
		}
		return self::verify_voice_nonce( $request );
	}

	/**
	 * @param WP_REST_Request $request
	 */
	private static function verify_voice_nonce( WP_REST_Request $request ): bool {
		$nonce = $request->get_header( 'x_neo_pulse_voice_nonce' );
		if ( ! is_string( $nonce ) || $nonce === '' ) {
			$params = $request->get_json_params();
			if ( is_array( $params ) && isset( $params['voice_nonce'] ) ) {
				$nonce = (string) $params['voice_nonce'];
			}
		}
		if ( $nonce === '' ) {
			return false;
		}
		return (bool) wp_verify_nonce( $nonce, 'neo_pulse_chat_stream' );
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response
	 */
	public static function rest_transcribe( WP_REST_Request $request ): WP_REST_Response {
		if ( Neo_Pulse_Wp_OpenRouter::get_api_key() === '' ) {
			return new WP_REST_Response(
				array( 'error' => __( 'OpenRouter API key is not configured.', 'neo-pulse-wp' ) ),
				503
			);
		}

		if ( Neo_Pulse_Wp_OpenRouter::rate_limit_exceeded( 'voice', self::RATE_LIMIT_MAX, self::RATE_LIMIT_WINDOW ) ) {
			return new WP_REST_Response(
				array( 'error' => __( 'Too many voice messages. Please wait a few minutes and try again.', 'neo-pulse-wp' ) ),
				429
			);
		}

		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}

		$audio_b64 = isset( $body['audio_base64'] ) ? (string) $body['audio_base64'] : '';
		if ( $audio_b64 !== '' && strpos( $audio_b64, ',' ) !== false ) {
			$parts     = explode( ',', $audio_b64, 2 );
			$audio_b64 = $parts[1];
		}
		$audio_b64 = preg_replace( '/\s+/', '', $audio_b64 );

		if ( $audio_b64 === '' ) {
			return new WP_REST_Response(
				array( 'error' => __( 'Audio data is required.', 'neo-pulse-wp' ) ),
				400
			);
		}

		if ( strlen( $audio_b64 ) > Neo_Pulse_Wp_OpenRouter::MAX_AUDIO_BASE64_BYTES ) {
			return new WP_REST_Response(
				array( 'error' => __( 'Audio recording is too large.', 'neo-pulse-wp' ) ),
				413
			);
		}

		$format = isset( $body['format'] ) ? sanitize_key( (string) $body['format'] ) : 'webm';

		$result = Neo_Pulse_Wp_OpenRouter::transcribe_audio( $audio_b64, $format );
		if ( is_wp_error( $result ) ) {
			// Provider error bodies are for staff only; visitors get a plain message.
			$message = current_user_can( 'edit_posts' ) || $result->get_error_code() === 'neo-pulse_openrouter_transcribe_empty'
				? $result->get_error_message()
				: __( 'Voice input is unavailable right now. Please type your message.', 'neo-pulse-wp' );
			return new WP_REST_Response(
				array( 'error' => $message ),
				502
			);
		}

		return new WP_REST_Response(
			array( 'text' => sanitize_textarea_field( $result ) ),
			200
		);
	}

	/**
	 * Enqueue thinking-card script (loading checklist UI).
	 *
	 * @param bool $in_footer Load script in footer.
	 */
	public static function enqueue_thinking_card_assets( bool $in_footer = true ): void {
		$base         = plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . 'assets/shared/';
		$thinking_js  = NEO_PULSE_WP_PLUGIN_DIR . 'assets/shared/neo-pulse-thinking-card.js';
		$thinking_css = NEO_PULSE_WP_PLUGIN_DIR . 'assets/shared/neo-pulse-thinking-card.css';
		$thinking_ver = NEO_PULSE_WP_VERSION;
		if ( is_readable( $thinking_js ) ) {
			$thinking_ver .= '.' . (string) filemtime( $thinking_js );
		}

		if ( ! wp_style_is( 'neo-pulse-thinking-card', 'registered' ) ) {
			wp_register_style(
				'neo-pulse-thinking-card',
				$base . 'neo-pulse-thinking-card.css',
				array(),
				is_readable( $thinking_css ) ? $thinking_ver : NEO_PULSE_WP_VERSION
			);
		}
		wp_enqueue_style( 'neo-pulse-thinking-card' );

		if ( ! wp_script_is( 'neo-pulse-thinking-card', 'registered' ) ) {
			wp_register_script(
				'neo-pulse-thinking-card',
				$base . 'neo-pulse-thinking-card.js',
				array(),
				$thinking_ver,
				$in_footer
			);
		}
		wp_enqueue_script( 'neo-pulse-thinking-card' );

		$stream_js  = NEO_PULSE_WP_PLUGIN_DIR . 'assets/shared/neo-pulse-chat-stream.js';
		$stream_ver = NEO_PULSE_WP_VERSION;
		if ( is_readable( $stream_js ) ) {
			$stream_ver .= '.' . (string) filemtime( $stream_js );
		}
		if ( ! wp_script_is( 'neo-pulse-chat-stream', 'registered' ) ) {
			wp_register_script(
				'neo-pulse-chat-stream',
				$base . 'neo-pulse-chat-stream.js',
				array( 'neo-pulse-thinking-card' ),
				$stream_ver,
				$in_footer
			);
		}
		wp_enqueue_script( 'neo-pulse-chat-stream' );

		$prefetch_js  = NEO_PULSE_WP_PLUGIN_DIR . 'assets/shared/neo-pulse-chat-prefetch.js';
		$prefetch_ver = NEO_PULSE_WP_VERSION;
		if ( is_readable( $prefetch_js ) ) {
			$prefetch_ver .= '.' . (string) filemtime( $prefetch_js );
		}
		if ( ! wp_script_is( 'neo-pulse-chat-prefetch', 'registered' ) ) {
			wp_register_script(
				'neo-pulse-chat-prefetch',
				$base . 'neo-pulse-chat-prefetch.js',
				array(),
				$prefetch_ver,
				$in_footer
			);
		}
		wp_enqueue_script( 'neo-pulse-chat-prefetch' );

		$debug_log_js  = NEO_PULSE_WP_PLUGIN_DIR . 'assets/shared/neo-pulse-chat-debug-log.js';
		$debug_log_ver = NEO_PULSE_WP_VERSION;
		if ( is_readable( $debug_log_js ) ) {
			$debug_log_ver .= '.' . (string) filemtime( $debug_log_js );
		}
		if ( ! wp_script_is( 'neo-pulse-chat-debug-log', 'registered' ) ) {
			wp_register_script(
				'neo-pulse-chat-debug-log',
				$base . 'neo-pulse-chat-debug-log.js',
				array(),
				$debug_log_ver,
				$in_footer
			);
		}
		wp_enqueue_script( 'neo-pulse-chat-debug-log' );

		$display_text_js  = NEO_PULSE_WP_PLUGIN_DIR . 'assets/shared/neo-pulse-display-text.js';
		$display_text_ver = NEO_PULSE_WP_VERSION;
		if ( is_readable( $display_text_js ) ) {
			$display_text_ver .= '.' . (string) filemtime( $display_text_js );
		}
		if ( ! wp_script_is( 'neo-pulse-display-text', 'registered' ) ) {
			wp_register_script(
				'neo-pulse-display-text',
				$base . 'neo-pulse-display-text.js',
				array(),
				$display_text_ver,
				$in_footer
			);
		}

		$markdown_js = NEO_PULSE_WP_PLUGIN_DIR . 'assets/shared/neo-pulse-markdown.js';
		$markdown_ver = NEO_PULSE_WP_VERSION;
		if ( is_readable( $markdown_js ) ) {
			$markdown_ver .= '.' . (string) filemtime( $markdown_js );
		}
		if ( ! wp_script_is( 'neo-pulse-markdown', 'registered' ) ) {
			wp_register_script(
				'neo-pulse-markdown',
				$base . 'neo-pulse-markdown.js',
				array( 'neo-pulse-display-text' ),
				$markdown_ver,
				$in_footer
			);
		}
	}

	/**
	 * Enqueue shared voice assets (admin or frontend).
	 *
	 * @param array<string, mixed> $config Extra config merged into neoPulseVoiceConfig.
	 * @param bool                $in_footer Load script in footer (false = head, for admin pages with inline JS).
	 */
	public static function enqueue_assets( array $config = array(), bool $in_footer = true ): void {
		$base     = plugin_dir_url( NEO_PULSE_WP_PLUGIN_FILE ) . 'assets/shared/';
		$ver      = NEO_PULSE_WP_VERSION;
		$js_path  = NEO_PULSE_WP_PLUGIN_DIR . 'assets/shared/neo-pulse-voice.js';
		$css_path = NEO_PULSE_WP_PLUGIN_DIR . 'assets/shared/neo-pulse-voice.css';
		if ( is_readable( $js_path ) ) {
			$ver .= '.' . (string) filemtime( $js_path );
		}

		self::enqueue_thinking_card_assets( $in_footer );

		wp_enqueue_style(
			'neo-pulse-voice',
			$base . 'neo-pulse-voice.css',
			array( 'neo-pulse-thinking-card' ),
			is_readable( $css_path ) ? $ver : NEO_PULSE_WP_VERSION
		);

		wp_register_script(
			'neo-pulse-voice',
			$base . 'neo-pulse-voice.js',
			array( 'neo-pulse-thinking-card' ),
			$ver,
			$in_footer
		);

		wp_enqueue_script( 'neo-pulse-voice' );

		$defaults = array(
			'transcribeUrl' => esc_url_raw( rest_url( self::REST_NAMESPACE . '/voice/transcribe' ) ),
			'nonce'         => wp_create_nonce( 'wp_rest' ),
			'voiceNonce'    => wp_create_nonce( 'neo_pulse_chat_stream' ),
		);

		wp_localize_script(
			'neo-pulse-voice',
			'neoPulseVoiceConfig',
			array_merge( $defaults, $config )
		);
	}
}
