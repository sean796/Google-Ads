<?php
/**
 * OpenRouter chat + audio transcription for team chat (FLO bot).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Chat_Openrouter {

	const CHAT_URL         = 'https://openrouter.ai/api/v1/chat/completions';
	const TRANSCRIBE_URL   = 'https://openrouter.ai/api/v1/audio/transcriptions';
	const DEFAULT_MODEL    = 'google/gemini-2.5-flash-lite';
	const TRANSCRIBE_MODEL = 'google/chirp-3';

	/** @var string Per-request OpenRouter key from client header/body. */
	private static $request_api_key = '';

	public static function use_request_api_key( string $key ): void {
		self::$request_api_key = trim( $key );
	}

	public static function clear_request_api_key(): void {
		self::$request_api_key = '';
	}

	/** Same key resolution as chat/Assist (request scope, then server secrets). */
	public static function resolve_api_key(): string {
		return self::resolve_key();
	}

	/**
	 * @param array<int,array{role:string,content:string}> $messages
	 * @param array{model?:string,temperature?:float,maxTokens?:int} $opts
	 * @return array<string,mixed>
	 */
	/**
	 * Plain-text chat completion (no response_format).
	 *
	 * @param array<int,array{role:string,content:string}> $messages
	 * @param array{model?:string,temperature?:float,maxTokens?:int} $opts
	 */
	public static function text_completion( array $messages, array $opts = array() ): string {
		$api_key = self::resolve_key();
		if ( $api_key === '' ) {
			throw new Exception( 'OpenRouter API key is missing. Add it in Dashboard → API Keys.' );
		}

		$model = isset( $opts['model'] ) && is_string( $opts['model'] ) && trim( $opts['model'] ) !== ''
			? trim( $opts['model'] )
			: self::DEFAULT_MODEL;

		$response = wp_remote_post(
			self::CHAT_URL,
			array(
				'timeout' => 120,
				'headers' => Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key ),
				'body'    => wp_json_encode(
					array(
						'model'       => $model,
						'messages'    => $messages,
						'temperature' => isset( $opts['temperature'] ) ? (float) $opts['temperature'] : 0.5,
						'max_tokens'  => isset( $opts['maxTokens'] ) ? (int) $opts['maxTokens'] : 8192,
					)
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			throw new Exception( $response->get_error_message() );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$json = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $json ) ? ( $json['error']['message'] ?? $json['message'] ?? 'OpenRouter error' ) : 'OpenRouter error';
			throw new Exception( 'OpenRouter ' . $code . ': ' . $msg );
		}

		$content = trim( (string) ( $json['choices'][0]['message']['content'] ?? '' ) );
		if ( $content === '' ) {
			throw new Exception( 'OpenRouter returned empty content' );
		}
		return $content;
	}

	public static function json_completion( array $messages, array $opts = array() ): array {
		$api_key = self::resolve_key();
		if ( $api_key === '' ) {
			throw new Exception( 'OpenRouter API key is missing. Add it in Dashboard → API Keys.' );
		}

		$model = isset( $opts['model'] ) && is_string( $opts['model'] ) && trim( $opts['model'] ) !== ''
			? trim( $opts['model'] )
			: self::DEFAULT_MODEL;

		$response_format = array( 'type' => 'json_object' );
		if ( isset( $opts['responseFormat'] ) && is_array( $opts['responseFormat'] ) && $opts['responseFormat'] !== array() ) {
			$response_format = $opts['responseFormat'];
		}
		$reasoning = isset( $opts['reasoning'] ) && is_array( $opts['reasoning'] )
			? $opts['reasoning']
			: array( 'effort' => 'none', 'exclude' => true );
		$max_tokens = isset( $opts['maxTokens'] ) ? max( 4096, (int) $opts['maxTokens'] ) : 4096;

		$response = wp_remote_post(
			self::CHAT_URL,
			array(
				'timeout' => 120,
				'headers' => Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key ),
				'body'    => wp_json_encode(
					array(
						'model'           => $model,
						'messages'        => $messages,
						'temperature'     => isset( $opts['temperature'] ) ? (float) $opts['temperature'] : 0.2,
						'max_tokens'      => $max_tokens,
						'response_format' => $response_format,
						'reasoning'       => $reasoning,
					)
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			throw new Exception( $response->get_error_message() );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$json = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $json ) ? ( $json['error']['message'] ?? $json['message'] ?? 'OpenRouter error' ) : 'OpenRouter error';
			throw new Exception( 'OpenRouter ' . $code . ': ' . $msg );
		}

		return self::parse_json_completion_response( wp_remote_retrieve_body( $response ), $code );
	}

	/**
	 * Run multiple JSON completions concurrently (curl_multi).
	 *
	 * @param array<int,array{messages:array<int,array{role:string,content:string}>,opts?:array{model?:string,temperature?:float,maxTokens?:int}}> $jobs
	 * @param array{onComplete?:callable(int,array{parsed:array<string,mixed>|null,error:string,ms:int}):void} $options
	 * @return array<int,array{parsed:array<string,mixed>|null,error:string,ms:int}>
	 */
	public static function json_completion_parallel( array $jobs, array $options = array() ): array {
		$api_key = self::resolve_key();
		if ( $api_key === '' ) {
			throw new Exception( 'OpenRouter API key is missing. Add it in Dashboard → API Keys.' );
		}
		if ( count( $jobs ) === 0 ) {
			return array();
		}

		$on_complete = isset( $options['onComplete'] ) && is_callable( $options['onComplete'] )
			? $options['onComplete']
			: null;

		if ( ! function_exists( 'curl_multi_init' ) ) {
			$results = array();
			foreach ( $jobs as $i => $job ) {
				$started = microtime( true );
				try {
					$messages = isset( $job['messages'] ) && is_array( $job['messages'] ) ? $job['messages'] : array();
					$opts     = isset( $job['opts'] ) && is_array( $job['opts'] ) ? $job['opts'] : array();
					$results[ $i ] = array(
						'parsed' => self::json_completion( $messages, $opts ),
						'error'  => '',
						'ms'     => (int) round( ( microtime( true ) - $started ) * 1000 ),
					);
				} catch ( Exception $e ) {
					$results[ $i ] = array(
						'parsed' => null,
						'error'  => $e->getMessage(),
						'ms'     => (int) round( ( microtime( true ) - $started ) * 1000 ),
					);
				}
				if ( $on_complete ) {
					$on_complete( $i, $results[ $i ] );
				}
			}
			return $results;
		}

		$mh            = curl_multi_init();
		$handles       = array();
		$handle_index  = array();
		$headers       = Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key );
		$started       = microtime( true );
		$started_at    = array();
		$results       = array();
		$batch_ms      = 0;

		foreach ( $jobs as $i => $job ) {
			$messages = isset( $job['messages'] ) && is_array( $job['messages'] ) ? $job['messages'] : array();
			$opts     = isset( $job['opts'] ) && is_array( $job['opts'] ) ? $job['opts'] : array();
			$model    = isset( $opts['model'] ) && is_string( $opts['model'] ) && trim( $opts['model'] ) !== ''
				? trim( $opts['model'] )
				: self::DEFAULT_MODEL;
			$response_format = array( 'type' => 'json_object' );
			if ( isset( $opts['responseFormat'] ) && is_array( $opts['responseFormat'] ) && $opts['responseFormat'] !== array() ) {
				$response_format = $opts['responseFormat'];
			}
			$reasoning = isset( $opts['reasoning'] ) && is_array( $opts['reasoning'] )
				? $opts['reasoning']
				: array( 'effort' => 'none', 'exclude' => true );
			$body = wp_json_encode(
				array(
					'model'           => $model,
					'messages'        => $messages,
					'temperature'     => isset( $opts['temperature'] ) ? (float) $opts['temperature'] : 0.2,
					'max_tokens'      => isset( $opts['maxTokens'] ) ? (int) $opts['maxTokens'] : 4096,
					'response_format' => $response_format,
					'reasoning'       => $reasoning,
				)
			);
			$ch = curl_init( self::CHAT_URL );
			$curl_headers = array();
			foreach ( $headers as $key => $value ) {
				$curl_headers[] = $key . ': ' . $value;
			}
			curl_setopt_array(
				$ch,
				array(
					CURLOPT_POST           => true,
					CURLOPT_POSTFIELDS     => $body,
					CURLOPT_HTTPHEADER     => $curl_headers,
					CURLOPT_RETURNTRANSFER => true,
					CURLOPT_TIMEOUT        => 120,
				)
			);
			curl_multi_add_handle( $mh, $ch );
			$handles[ $i ]                    = $ch;
			$handle_index[ spl_object_id( $ch ) ] = $i;
			$started_at[ $i ]                 = microtime( true );
		}

		$pending = $handles;
		$running = null;

		$finish_handle = static function ( $ch ) use ( &$pending, &$results, $handle_index, $started_at, $started, $on_complete, $mh ) {
			$oid = spl_object_id( $ch );
			$i   = isset( $handle_index[ $oid ] ) ? (int) $handle_index[ $oid ] : null;
			if ( $i === null || isset( $results[ $i ] ) ) {
				return;
			}

			$raw  = curl_multi_getcontent( $ch );
			$code = (int) curl_getinfo( $ch, CURLINFO_HTTP_CODE );
			curl_multi_remove_handle( $mh, $ch );
			curl_close( $ch );
			unset( $pending[ $i ] );

			$ms = isset( $started_at[ $i ] ) ? (int) round( ( microtime( true ) - $started_at[ $i ] ) * 1000 ) : (int) round( ( microtime( true ) - $started ) * 1000 );
			try {
				$results[ $i ] = array(
					'parsed' => self::parse_json_completion_response( $raw, $code ),
					'error'  => '',
					'ms'     => $ms,
				);
			} catch ( Exception $e ) {
				$results[ $i ] = array(
					'parsed' => null,
					'error'  => $e->getMessage(),
					'ms'     => $ms,
				);
			}

			if ( $on_complete ) {
				$on_complete( $i, $results[ $i ] );
			}
		};

		do {
			$status = curl_multi_exec( $mh, $running );
			while ( $info = curl_multi_info_read( $mh ) ) {
				if ( $info['msg'] !== CURLMSG_DONE ) {
					continue;
				}
				$finish_handle( $info['handle'] );
			}
			if ( $running ) {
				curl_multi_select( $mh, 0.5 );
			}
		} while ( $running && $status === CURLM_OK );

		foreach ( $pending as $i => $ch ) {
			$finish_handle( $ch );
		}

		$batch_ms = (int) round( ( microtime( true ) - $started ) * 1000 );
		curl_multi_close( $mh );

		foreach ( array_keys( $handles ) as $i ) {
			if ( ! isset( $results[ $i ] ) ) {
				$results[ $i ] = array(
					'parsed' => null,
					'error'  => 'Parallel slice did not return a response',
					'ms'     => $batch_ms,
				);
				if ( $on_complete ) {
					$on_complete( $i, $results[ $i ] );
				}
			}
		}

		ksort( $results );
		return $results;
	}

	/**
	 * Run multiple plain-text completions concurrently (curl_multi).
	 *
	 * @param array<int,array{messages:array<int,array{role:string,content:string}>,opts?:array{model?:string,temperature?:float,maxTokens?:int}}> $jobs
	 * @param array{onComplete?:callable(int,array{content:string,error:string,ms:int}):void} $options
	 * @return array<int,array{content:string,error:string,ms:int}>
	 */
	public static function text_completion_parallel( array $jobs, array $options = array() ): array {
		$api_key = self::resolve_key();
		if ( $api_key === '' ) {
			throw new Exception( 'OpenRouter API key is missing. Add it in Dashboard → API Keys.' );
		}
		if ( count( $jobs ) === 0 ) {
			return array();
		}

		$on_complete = isset( $options['onComplete'] ) && is_callable( $options['onComplete'] )
			? $options['onComplete']
			: null;

		if ( ! function_exists( 'curl_multi_init' ) ) {
			$results = array();
			foreach ( $jobs as $i => $job ) {
				$started = microtime( true );
				try {
					$messages      = isset( $job['messages'] ) && is_array( $job['messages'] ) ? $job['messages'] : array();
					$opts          = isset( $job['opts'] ) && is_array( $job['opts'] ) ? $job['opts'] : array();
					$results[ $i ] = array(
						'content' => self::text_completion( $messages, $opts ),
						'error'   => '',
						'ms'      => (int) round( ( microtime( true ) - $started ) * 1000 ),
					);
				} catch ( Exception $e ) {
					$results[ $i ] = array(
						'content' => '',
						'error'   => $e->getMessage(),
						'ms'      => (int) round( ( microtime( true ) - $started ) * 1000 ),
					);
				}
				if ( $on_complete ) {
					$on_complete( $i, $results[ $i ] );
				}
			}
			return $results;
		}

		$mh           = curl_multi_init();
		$handles      = array();
		$handle_index = array();
		$headers      = Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key );
		$started      = microtime( true );
		$started_at   = array();
		$results      = array();

		foreach ( $jobs as $i => $job ) {
			$messages = isset( $job['messages'] ) && is_array( $job['messages'] ) ? $job['messages'] : array();
			$opts     = isset( $job['opts'] ) && is_array( $job['opts'] ) ? $job['opts'] : array();
			$model    = isset( $opts['model'] ) && is_string( $opts['model'] ) && trim( $opts['model'] ) !== ''
				? trim( $opts['model'] )
				: self::DEFAULT_MODEL;
			$body     = wp_json_encode(
				array(
					'model'       => $model,
					'messages'    => $messages,
					'temperature' => isset( $opts['temperature'] ) ? (float) $opts['temperature'] : 0.5,
					'max_tokens'  => isset( $opts['maxTokens'] ) ? (int) $opts['maxTokens'] : 8192,
				)
			);
			$ch           = curl_init( self::CHAT_URL );
			$curl_headers = array();
			foreach ( $headers as $key => $value ) {
				$curl_headers[] = $key . ': ' . $value;
			}
			curl_setopt_array(
				$ch,
				array(
					CURLOPT_POST           => true,
					CURLOPT_POSTFIELDS     => $body,
					CURLOPT_HTTPHEADER     => $curl_headers,
					CURLOPT_RETURNTRANSFER => true,
					CURLOPT_TIMEOUT        => 120,
				)
			);
			curl_multi_add_handle( $mh, $ch );
			$handles[ $i ]                        = $ch;
			$handle_index[ spl_object_id( $ch ) ] = $i;
			$started_at[ $i ]                     = microtime( true );
		}

		$pending = $handles;
		$running = null;

		$finish_handle = static function ( $ch ) use ( &$pending, &$results, $handle_index, $started_at, $started, $on_complete, $mh ) {
			$oid = spl_object_id( $ch );
			$i   = isset( $handle_index[ $oid ] ) ? (int) $handle_index[ $oid ] : null;
			if ( $i === null || isset( $results[ $i ] ) ) {
				return;
			}

			$raw  = curl_multi_getcontent( $ch );
			$code = (int) curl_getinfo( $ch, CURLINFO_HTTP_CODE );
			curl_multi_remove_handle( $mh, $ch );
			curl_close( $ch );
			unset( $pending[ $i ] );

			$ms = isset( $started_at[ $i ] ) ? (int) round( ( microtime( true ) - $started_at[ $i ] ) * 1000 ) : (int) round( ( microtime( true ) - $started ) * 1000 );
			try {
				$results[ $i ] = array(
					'content' => self::parse_text_completion_response( $raw, $code ),
					'error'   => '',
					'ms'      => $ms,
				);
			} catch ( Exception $e ) {
				$results[ $i ] = array(
					'content' => '',
					'error'   => $e->getMessage(),
					'ms'      => $ms,
				);
			}

			if ( $on_complete ) {
				$on_complete( $i, $results[ $i ] );
			}
		};

		do {
			$status = curl_multi_exec( $mh, $running );
			while ( $info = curl_multi_info_read( $mh ) ) {
				if ( $info['msg'] !== CURLMSG_DONE ) {
					continue;
				}
				$finish_handle( $info['handle'] );
			}
			if ( $running ) {
				curl_multi_select( $mh, 0.5 );
			}
		} while ( $running && $status === CURLM_OK );

		foreach ( $pending as $ch ) {
			$finish_handle( $ch );
		}

		$batch_ms = (int) round( ( microtime( true ) - $started ) * 1000 );
		curl_multi_close( $mh );

		foreach ( array_keys( $handles ) as $i ) {
			if ( ! isset( $results[ $i ] ) ) {
				$results[ $i ] = array(
					'content' => '',
					'error'   => 'Parallel slice did not return a response',
					'ms'      => $batch_ms,
				);
				if ( $on_complete ) {
					$on_complete( $i, $results[ $i ] );
				}
			}
		}

		ksort( $results );
		return $results;
	}

	private static function parse_text_completion_response( string $raw, int $code ): string {
		$json = json_decode( $raw, true );
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $json ) ? ( $json['error']['message'] ?? $json['message'] ?? 'OpenRouter error' ) : 'OpenRouter error';
			throw new Exception( 'OpenRouter ' . $code . ': ' . $msg );
		}
		$content = trim( (string) ( $json['choices'][0]['message']['content'] ?? '' ) );
		if ( $content === '' ) {
			throw new Exception( 'OpenRouter returned empty content' );
		}
		return $content;
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function parse_json_completion_response( string $raw, int $code ): array {
		$json = json_decode( $raw, true );
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $json ) ? ( $json['error']['message'] ?? $json['message'] ?? 'OpenRouter error' ) : 'OpenRouter error';
			throw new Exception( 'OpenRouter ' . $code . ': ' . $msg );
		}

		$message = is_array( $json['choices'][0]['message'] ?? null ) ? $json['choices'][0]['message'] : array();
		$content = self::extract_message_text( $message );
		if ( isset( $message['parsed'] ) ) {
			$parsed_msg = $message['parsed'];
			if ( is_array( $parsed_msg ) ) {
				return $parsed_msg;
			}
			if ( is_object( $parsed_msg ) ) {
				$as_array = json_decode( wp_json_encode( $parsed_msg ), true );
				if ( is_array( $as_array ) ) {
					return $as_array;
				}
			}
		}
		if ( $content !== '' ) {
			$json_text = self::extract_json_object_text( $content );
			$parsed    = json_decode( $json_text, true );
			if ( is_array( $parsed ) ) {
				return $parsed;
			}
		}
		$reasoning = self::extract_message_reasoning( $message );
		if ( $reasoning !== '' ) {
			$json_text = self::extract_json_object_text( $reasoning );
			$parsed    = json_decode( $json_text, true );
			if ( is_array( $parsed ) ) {
				return $parsed;
			}
		}
		$finish = isset( $json['choices'][0]['finish_reason'] ) ? (string) $json['choices'][0]['finish_reason'] : '';
		if ( $content === '' && $reasoning === '' ) {
			throw new Exception(
				'OpenRouter returned empty content'
				. ( $finish !== '' ? ' (finish_reason=' . $finish . ')' : '' )
			);
		}
		if ( $finish === 'length' ) {
			throw new Exception( 'OpenRouter cut the structured reply at max_tokens (finish_reason=length)' );
		}

		throw new Exception(
			'OpenRouter response was not valid JSON'
			. ( $finish !== '' ? ' (finish_reason=' . $finish . ')' : '' )
		);
	}

	/**
	 * @param array<string,mixed> $message
	 */
	private static function extract_message_text( array $message ): string {
		$content = $message['content'] ?? '';
		if ( is_string( $content ) ) {
			return trim( $content );
		}
		if ( ! is_array( $content ) ) {
			return '';
		}
		$parts = array();
		foreach ( $content as $part ) {
			if ( is_array( $part ) && isset( $part['text'] ) && is_string( $part['text'] ) ) {
				$text = trim( $part['text'] );
				if ( $text !== '' ) {
					$parts[] = $text;
				}
			}
		}
		return trim( implode( "\n", $parts ) );
	}

	/**
	 * @param array<string,mixed> $message
	 */
	private static function extract_message_reasoning( array $message ): string {
		if ( isset( $message['reasoning'] ) && is_string( $message['reasoning'] ) ) {
			$text = trim( $message['reasoning'] );
			if ( $text !== '' ) {
				return $text;
			}
		}
		$details = $message['reasoning_details'] ?? null;
		if ( ! is_array( $details ) ) {
			return '';
		}
		$parts = array();
		foreach ( $details as $detail ) {
			if ( is_array( $detail ) && isset( $detail['text'] ) && is_string( $detail['text'] ) ) {
				$text = trim( $detail['text'] );
				if ( $text !== '' ) {
					$parts[] = $text;
				}
			}
		}
		return trim( implode( "\n", $parts ) );
	}

	private static function extract_json_object_text( string $content ): string {
		$content = trim( $content );
		if ( preg_match( '/```(?:json)?\\s*(\\{[\\s\\S]*\\})\\s*```/i', $content, $matches ) ) {
			return trim( $matches[1] );
		}
		$start = strpos( $content, '{' );
		$end   = strrpos( $content, '}' );
		if ( $start !== false && $end !== false && $end > $start ) {
			return substr( $content, $start, $end - $start + 1 );
		}
		return $content;
	}

	/**
	 * @param array<string,mixed> $body
	 */
	public static function api_key_from_request( array $body = array() ): string {
		$header = isset( $_SERVER['HTTP_X_OPENROUTER_API_KEY'] )
			? trim( (string) wp_unslash( $_SERVER['HTTP_X_OPENROUTER_API_KEY'] ) )
			: '';
		if ( $header !== '' ) {
			return $header;
		}
		if ( ! empty( $body['openRouterApiKey'] ) && is_string( $body['openRouterApiKey'] ) ) {
			$body_key = trim( $body['openRouterApiKey'] );
			if ( $body_key !== '' ) {
				return $body_key;
			}
		}
		return self::resolve_key();
	}

	/**
	 * @param array<int,array{role:string,content:string}> $messages
	 */
	public static function chat_text( array $messages, array $opts = array() ): string {
		$api_key = self::resolve_key();
		if ( $api_key === '' ) {
			return '';
		}

		$model = isset( $opts['model'] ) && is_string( $opts['model'] ) && trim( $opts['model'] ) !== ''
			? trim( $opts['model'] )
			: self::DEFAULT_MODEL;

		$response = wp_remote_post(
			self::CHAT_URL,
			array(
				'timeout' => 90,
				'headers' => Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key ),
				'body'    => wp_json_encode(
					array(
						'model'       => $model,
						'messages'    => $messages,
						'temperature' => isset( $opts['temperature'] ) ? (float) $opts['temperature'] : 0.4,
						'max_tokens'  => isset( $opts['maxTokens'] ) ? (int) $opts['maxTokens'] : 1024,
					)
				),
			)
		);

		if ( is_wp_error( $response ) ) {
			return '';
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$json = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $json ) ) {
			return '';
		}

		return trim( (string) ( $json['choices'][0]['message']['content'] ?? '' ) );
	}

	public static function transcribe_audio( string $base64, string $format = 'webm' ): string {
		$api_key = self::resolve_key();
		if ( $api_key === '' || $base64 === '' ) {
			return '';
		}

		$format = strtolower( preg_replace( '/[^a-z0-9]/', '', $format ) );
		$allowed = array( 'webm', 'wav', 'mp3', 'ogg', 'm4a', 'flac', 'aac' );
		if ( ! in_array( $format, $allowed, true ) ) {
			$format = 'webm';
		}

		$response = wp_remote_post(
			self::TRANSCRIBE_URL,
			array(
				'timeout' => 120,
				'headers' => Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key ),
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
			return '';
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$json = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $json ) ) {
			return '';
		}

		return trim( (string) ( $json['text'] ?? '' ) );
	}

	private static function resolve_key(): string {
		if ( self::$request_api_key !== '' ) {
			return self::$request_api_key;
		}
		$header = isset( $_SERVER['HTTP_X_OPENROUTER_API_KEY'] )
			? trim( (string) wp_unslash( $_SERVER['HTTP_X_OPENROUTER_API_KEY'] ) )
			: '';
		if ( $header !== '' ) {
			return $header;
		}
		if ( class_exists( 'Neo_Pulse_App_Secrets' ) ) {
			$key = trim( Neo_Pulse_App_Secrets::openrouter_api_key() );
			if ( $key !== '' ) {
				return $key;
			}
		}
		if ( class_exists( 'Neo_Pulse_Wp_OpenRouter' ) ) {
			$key = trim( Neo_Pulse_Wp_OpenRouter::get_api_key() );
			if ( $key !== '' ) {
				return $key;
			}
		}
		return '';
	}
}
