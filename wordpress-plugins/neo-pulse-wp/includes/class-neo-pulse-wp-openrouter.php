<?php
/**
 * OpenRouter client for NEO Pulse WP AI wands.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_OpenRouter {

	const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

	const TRANSCRIBE_API_URL = 'https://openrouter.ai/api/v1/audio/transcriptions';

	const DEFAULT_MODEL = 'google/gemini-2.5-flash-lite';

	const TRANSCRIBE_MODEL = 'google/chirp-3';

	const APP_TITLE = 'NEO Pulse WP';

	const DEFAULT_HTTP_REFERER = 'https://neodigital.ca/neo-pulse-wp';

	const MAX_AUDIO_BASE64_BYTES = 5242880;

	/**
	 * @return string
	 */
	public static function get_api_key(): string {
		if ( defined( 'NEO_PULSE_WP_OPENROUTER_API_KEY' ) && NEO_PULSE_WP_OPENROUTER_API_KEY !== '' ) {
			return trim( (string) NEO_PULSE_WP_OPENROUTER_API_KEY );
		}
		$agency = Neo_Pulse_Wp_Api::get_agency_openrouter_api_key();
		if ( $agency !== '' ) {
			return $agency;
		}
		$file_key = self::get_neo_pulse_data_openrouter_key();
		if ( $file_key !== '' ) {
			return $file_key;
		}
		return '';
	}

	/**
	 * OpenRouter key synced from neodigital.ca (email-worker-keys.json).
	 *
	 * @return string
	 */
	private static function get_neo_pulse_data_openrouter_key(): string {
		if ( ! class_exists( 'Neo_Pulse_App_Data_Paths' ) || ! class_exists( 'Neo_Pulse_App_Json_File_Store' ) ) {
			return '';
		}
		$keys = Neo_Pulse_App_Json_File_Store::read( Neo_Pulse_App_Data_Paths::root() . '/email-worker-keys.json' );
		if ( is_array( $keys ) && ! empty( $keys['openRouterApiKey'] ) ) {
			return trim( (string) $keys['openRouterApiKey'] );
		}
		return '';
	}

	/**
	 * Body harness: wp-config or agency settings only.
	 *
	 * @return string
	 */
	public static function get_body_api_key(): string {
		if ( defined( 'NEO_PULSE_WP_OPENROUTER_API_KEY' ) && NEO_PULSE_WP_OPENROUTER_API_KEY !== '' ) {
			return trim( (string) NEO_PULSE_WP_OPENROUTER_API_KEY );
		}
		return Neo_Pulse_Wp_Api::get_agency_openrouter_api_key();
	}

	/**
	 * @return string
	 */
	public static function get_model(): string {
		if ( defined( 'NEO_PULSE_WP_OPENROUTER_MODEL' ) && NEO_PULSE_WP_OPENROUTER_MODEL !== '' ) {
			return trim( (string) NEO_PULSE_WP_OPENROUTER_MODEL );
		}

		return self::DEFAULT_MODEL;
	}

	/**
	 * @return string
	 */
	public static function get_http_referer(): string {
		if ( defined( 'NEO_PULSE_WP_OPENROUTER_HTTP_REFERER' ) && NEO_PULSE_WP_OPENROUTER_HTTP_REFERER !== '' ) {
			return trim( (string) NEO_PULSE_WP_OPENROUTER_HTTP_REFERER );
		}
		return self::DEFAULT_HTTP_REFERER;
	}

	/**
	 * @return string
	 */
	public static function get_app_title(): string {
		return self::APP_TITLE;
	}

	/**
	 * OpenRouter app attribution headers (HTTP-Referer + X-Title).
	 *
	 * @return array<string, string>
	 */
	public static function attribution_headers(): array {
		return array(
			'HTTP-Referer' => self::get_http_referer(),
			'X-Title'      => self::get_app_title(),
		);
	}

	/**
	 * @param string $api_key
	 * @return array<string, string>
	 */
	public static function request_headers( string $api_key ): array {
		return array_merge(
			array(
				'Content-Type'  => 'application/json',
				'Authorization' => 'Bearer ' . $api_key,
			),
			self::attribution_headers()
		);
	}

	/**
	 * @return int
	 */
	public static function get_timeout(): int {
		$timeout = (int) apply_filters( 'neo_pulse_wp_openrouter_timeout', (int) apply_filters( 'neo_pulse_wp_enhance_remote_timeout', 180 ) );
		if ( $timeout < 10 ) {
			$timeout = 10;
		}
		if ( $timeout > 300 ) {
			$timeout = 300;
		}
		return $timeout;
	}

	public static function maybe_extend_time_limit(): void {
		$limit = (int) apply_filters( 'neo_pulse_wp_enhance_time_limit', 300 );
		if ( $limit > 0 && function_exists( 'set_time_limit' ) ) {
			set_time_limit( $limit );
		}
	}

	public static function get_openrouter_source(): string {
		if ( defined( 'NEO_PULSE_WP_OPENROUTER_API_KEY' ) && NEO_PULSE_WP_OPENROUTER_API_KEY !== '' ) {
			return 'wp-config';
		}
		if ( Neo_Pulse_Wp_Api::get_agency_openrouter_api_key() !== '' ) {
			return 'site';
		}
		return '';
	}

	public static function clear_credentials_cache(): void {
	}

	/**
	 * @param string $system_prompt
	 * @param string $user_prompt
	 * @param int    $max_tokens
	 * @param float  $temperature
	 * @param string|null          $model Model id; null uses the configured default.
	 * @param array<string, mixed> $extra Extra request body fields (e.g. response_format). Cannot override model or messages.
	 * @return string|WP_Error
	 */
	public static function complete( string $system_prompt, string $user_prompt, int $max_tokens = 4096, float $temperature = 0.7, ?string $model = null, array $extra = array() ) {
		$key = self::get_api_key();
		if ( $key === '' ) {
			return new WP_Error(
				'neo-pulse_openrouter_key',
				__( 'OpenRouter API key is not configured. Add your key in NEO Pulse WP Settings or wp-config.php.', 'neo-pulse-wp' )
			);
		}

		self::maybe_extend_time_limit();

		$model_id = $model !== null && trim( $model ) !== '' ? trim( $model ) : self::get_model();

		unset( $extra['model'], $extra['messages'] );
		$body = array_merge(
			array(
				'model'       => $model_id,
				'messages'    => array(
					array(
						'role'    => 'system',
						'content' => $system_prompt,
					),
					array(
						'role'    => 'user',
						'content' => $user_prompt,
					),
				),
				'temperature' => $temperature,
				'max_tokens'  => $max_tokens,
			),
			$extra
		);

		$response = wp_remote_post(
			self::API_URL,
			array(
				'timeout' => self::get_timeout(),
				'headers' => self::request_headers( $key ),
				'body'    => wp_json_encode( $body ),
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
			if ( is_array( $data ) ) {
				if ( isset( $data['error']['message'] ) && is_string( $data['error']['message'] ) ) {
					$msg = $data['error']['message'];
				} elseif ( isset( $data['message'] ) && is_string( $data['message'] ) ) {
					$msg = $data['message'];
				}
			}
			if ( $msg === '' ) {
				$msg = $raw !== '' ? $raw : sprintf( 'HTTP %d', $code );
			}
			return self::http_error( $code, $msg );
		}

		$text = '';
		if ( is_array( $data ) && isset( $data['choices'][0]['message']['content'] ) ) {
			$text = trim( (string) $data['choices'][0]['message']['content'] );
		}
		if ( $text === '' ) {
			return new WP_Error( 'neo-pulse_openrouter_empty', __( 'AI returned empty content.', 'neo-pulse-wp' ) );
		}

		return $text;
	}

	/**
	 * Generic message shown when an AI call fails (never the raw provider body).
	 */
	public static function generic_error_message(): string {
		return __( 'The assistant is unavailable right now.', 'neo-pulse-wp' );
	}

	/**
	 * OpenRouter HTTP failure: generic message; the provider detail stays in the error data.
	 * Site administrators also see a short version of the detail so they can fix keys/credits.
	 */
	private static function http_error( int $code, string $detail ): WP_Error {
		$detail  = sprintf( 'OpenRouter %1$d: %2$s', $code, $detail );
		$message = self::generic_error_message();
		if ( function_exists( 'current_user_can' ) && current_user_can( 'manage_options' ) ) {
			$short   = function_exists( 'mb_substr' ) ? mb_substr( wp_strip_all_tags( $detail ), 0, 300 ) : substr( wp_strip_all_tags( $detail ), 0, 300 );
			$message .= ' (' . $short . ')';
		}
		return new WP_Error(
			'neo-pulse_openrouter_http',
			$message,
			array(
				'status' => $code,
				'detail' => $detail,
			)
		);
	}

	/**
	 * Hashed client key for per-IP limits. Uses REMOTE_ADDR only (forwarded headers are spoofable).
	 */
	public static function client_ip_hash(): string {
		$ip = isset( $_SERVER['REMOTE_ADDR'] ) ? sanitize_text_field( wp_unslash( (string) $_SERVER['REMOTE_ADDR'] ) ) : '';
		return substr( hash_hmac( 'sha256', $ip, wp_salt( 'nonce' ) ), 0, 24 );
	}

	/**
	 * Per-IP sliding-window counter for public (unauthenticated) endpoints.
	 * Records this request and returns true when the client is over the limit.
	 * Logged-in users who can edit posts are exempt.
	 *
	 * @param string $bucket Counter name (requests in the same bucket share the limit).
	 * @param int    $max    Requests allowed per window.
	 * @param int    $window Window length in seconds.
	 */
	public static function rate_limit_exceeded( string $bucket, int $max, int $window ): bool {
		if ( is_user_logged_in() && current_user_can( 'edit_posts' ) ) {
			return false;
		}
		$max    = max( 1, $max );
		$window = max( 1, $window );
		$key    = 'neo_pulse_rl_' . sanitize_key( $bucket ) . '_' . self::client_ip_hash();
		$now    = time();
		$hits   = get_transient( $key );
		$recent = array();
		if ( is_array( $hits ) ) {
			foreach ( $hits as $t ) {
				$t = (int) $t;
				if ( $t > $now - $window ) {
					$recent[] = $t;
				}
			}
		}
		if ( count( $recent ) >= $max ) {
			return true;
		}
		$recent[] = $now;
		set_transient( $key, $recent, $window );
		return false;
	}

	/**
	 * Completion that also shows the model an image (vision models such as Gemini Flash).
	 *
	 * @param string $image_url Data URL (data:image/jpeg;base64,…) or public https URL.
	 * @param int    $timeout   Seconds; 0 uses the usual timeout.
	 * @return string|WP_Error
	 */
	public static function complete_with_image( string $system_prompt, string $user_prompt, string $image_url, int $max_tokens = 800, float $temperature = 0.3, int $timeout = 0, ?string $model = null ) {
		$key = self::get_api_key();
		if ( $key === '' ) {
			return new WP_Error( 'neo-pulse_openrouter_key', __( 'OpenRouter API key is not configured.', 'neo-pulse-wp' ) );
		}
		$model_id = $model !== null && trim( $model ) !== '' ? trim( $model ) : self::get_model();
		$response = wp_remote_post(
			self::API_URL,
			array(
				'timeout' => $timeout > 0 ? $timeout : self::get_timeout(),
				'headers' => self::request_headers( $key ),
				'body'    => wp_json_encode(
					array(
						'model'       => $model_id,
						'messages'    => array(
							array(
								'role'    => 'system',
								'content' => $system_prompt,
							),
							array(
								'role'    => 'user',
								'content' => array(
									array(
										'type' => 'text',
										'text' => $user_prompt,
									),
									array(
										'type'      => 'image_url',
										'image_url' => array( 'url' => $image_url ),
									),
								),
							),
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
			return new WP_Error( 'neo-pulse_openrouter_http', sprintf( 'OpenRouter %1$d: %2$s', $code, self::extract_api_error_message( is_array( $data ) ? $data : null, (string) $raw, $code ) ) );
		}
		$text = is_array( $data ) && isset( $data['choices'][0]['message']['content'] ) ? trim( (string) $data['choices'][0]['message']['content'] ) : '';
		if ( $text === '' ) {
			return new WP_Error( 'neo-pulse_openrouter_empty', __( 'AI returned empty content.', 'neo-pulse-wp' ) );
		}
		return $text;
	}

	/**
	 * Chat log analysis: agency/wp-config key only.
	 *
	 * @param string $system_prompt System prompt.
	 * @param string $user_prompt   User prompt.
	 * @param string $model         OpenRouter model id.
	 * @param int    $max_tokens    Max tokens.
	 * @param float  $temperature   Temperature.
	 * @return string|WP_Error
	 */
	public static function complete_agency_only(
		string $system_prompt,
		string $user_prompt,
		string $model,
		int $max_tokens = 4096,
		float $temperature = 0.7
	) {
		$key = self::get_body_api_key();
		if ( $key === '' ) {
			return new WP_Error(
				'neo-pulse_openrouter_key',
				__( 'OpenRouter API key is not configured. Add your key in NEO Pulse WP Settings.', 'neo-pulse-wp' )
			);
		}

		$model = trim( $model );
		if ( $model === '' ) {
			$model = 'google/gemini-2.5-flash';
		}

		self::maybe_extend_time_limit();

		$response = wp_remote_post(
			self::API_URL,
			array(
				'timeout' => self::get_timeout(),
				'headers' => self::request_headers( $key ),
				'body'    => wp_json_encode(
					array(
						'model'       => $model,
						'messages'    => array(
							array(
								'role'    => 'system',
								'content' => $system_prompt,
							),
							array(
								'role'    => 'user',
								'content' => $user_prompt,
							),
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
			if ( is_array( $data ) ) {
				if ( isset( $data['error']['message'] ) && is_string( $data['error']['message'] ) ) {
					$msg = $data['error']['message'];
				} elseif ( isset( $data['message'] ) && is_string( $data['message'] ) ) {
					$msg = $data['message'];
				}
			}
			if ( $msg === '' ) {
				$msg = $raw !== '' ? $raw : sprintf( 'HTTP %d', $code );
			}
			return new WP_Error( 'neo-pulse_openrouter_http', sprintf( 'OpenRouter %1$d: %2$s', $code, $msg ) );
		}

		$text = '';
		if ( is_array( $data ) && isset( $data['choices'][0]['message']['content'] ) ) {
			$text = trim( (string) $data['choices'][0]['message']['content'] );
		}
		if ( $text === '' ) {
			return new WP_Error( 'neo-pulse_openrouter_empty', __( 'AI returned empty content.', 'neo-pulse-wp' ) );
		}

		return $text;
	}

	/**
	 * @return array{content:string,finish_reason:string}|WP_Error
	 */
	public static function complete_chat( string $system_prompt, string $user_prompt, int $max_tokens = 4096, float $temperature = 0.7 ) {
		$key = self::get_body_api_key();
		if ( $key === '' ) {
			$key = self::get_api_key();
		}
		if ( $key === '' ) {
			return new WP_Error(
				'neo-pulse_openrouter_key',
				__( 'OpenRouter API key is not configured.', 'neo-pulse-wp' )
			);
		}

		self::maybe_extend_time_limit();

		$response = wp_remote_post(
			self::API_URL,
			array(
				'timeout' => self::get_timeout(),
				'headers' => self::request_headers( $key ),
				'body'    => wp_json_encode(
					array(
						'model'       => self::get_model(),
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
			if ( is_array( $data ) && isset( $data['error']['message'] ) && is_string( $data['error']['message'] ) ) {
				$msg = $data['error']['message'];
			} elseif ( is_array( $data ) && isset( $data['message'] ) && is_string( $data['message'] ) ) {
				$msg = $data['message'];
			}
			if ( $msg === '' ) {
				$msg = $raw !== '' ? $raw : sprintf( 'HTTP %d', $code );
			}
			return new WP_Error( 'neo-pulse_openrouter_http', sprintf( 'OpenRouter %1$d: %2$s', $code, $msg ) );
		}

		$text = '';
		$finish = '';
		if ( is_array( $data ) && isset( $data['choices'][0]['message']['content'] ) ) {
			$text = trim( (string) $data['choices'][0]['message']['content'] );
			if ( isset( $data['choices'][0]['finish_reason'] ) ) {
				$finish = (string) $data['choices'][0]['finish_reason'];
			}
		}
		if ( $text === '' ) {
			return new WP_Error( 'neo-pulse_openrouter_empty', __( 'AI returned empty content.', 'neo-pulse-wp' ) );
		}

		return array(
			'content'       => $text,
			'finish_reason' => $finish,
		);
	}

	/**
	 * @return array<string, string>|WP_Error
	 */
	private static function get_audio_request_headers() {
		$key = self::get_api_key();
		if ( $key === '' ) {
			return new WP_Error(
				'neo-pulse_openrouter_key',
				__( 'OpenRouter API key is not configured.', 'neo-pulse-wp' )
			);
		}

		return self::request_headers( $key );
	}

	/**
	 * @param string $base64 Raw base64 audio (no data: prefix).
	 * @param string $format webm|wav|mp3|ogg|m4a|flac|aac
	 * @return string|WP_Error
	 */
	public static function transcribe_audio( string $base64, string $format = 'webm' ) {
		$headers = self::get_audio_request_headers();
		if ( is_wp_error( $headers ) ) {
			return $headers;
		}

		$format = strtolower( preg_replace( '/[^a-z0-9]/', '', $format ) );
		$allowed = array( 'webm', 'wav', 'mp3', 'ogg', 'm4a', 'flac', 'aac' );
		if ( ! in_array( $format, $allowed, true ) ) {
			$format = 'webm';
		}

		self::maybe_extend_time_limit();

		$response = wp_remote_post(
			self::TRANSCRIBE_API_URL,
			array(
				'timeout' => self::get_timeout(),
				'headers' => $headers,
				'body'    => wp_json_encode(
					array(
						'model'       => self::TRANSCRIBE_MODEL,
						'input_audio' => array(
							'data'   => $base64,
							'format' => $format,
						),
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
			$msg = self::extract_api_error_message( $data, $raw, $code );
			return new WP_Error( 'neo-pulse_openrouter_transcribe', $msg );
		}

		$text = '';
		if ( is_array( $data ) && isset( $data['text'] ) ) {
			$text = trim( (string) $data['text'] );
		}
		if ( $text === '' ) {
			return new WP_Error( 'neo-pulse_openrouter_transcribe_empty', __( 'No speech detected.', 'neo-pulse-wp' ) );
		}

		return $text;
	}

	/**
	 * @param array<string, mixed>|null $data
	 */
	private static function extract_api_error_message( ?array $data, string $raw, int $code ): string {
		$msg = '';
		if ( is_array( $data ) ) {
			if ( isset( $data['error']['message'] ) && is_string( $data['error']['message'] ) ) {
				$msg = $data['error']['message'];
			} elseif ( isset( $data['message'] ) && is_string( $data['message'] ) ) {
				$msg = $data['message'];
			}
		}
		if ( $msg === '' ) {
			$msg = $raw !== '' ? $raw : sprintf( 'HTTP %d', $code );
		}
		return sprintf( 'OpenRouter %1$d: %2$s', $code, $msg );
	}
}
