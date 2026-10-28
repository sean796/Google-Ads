<?php
/**
 * POST /api/openrouter/chat-completion (JSON or SSE stream).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Openrouter_Chat_Completion_Route {

	/**
	 * @param string               $subpath Path after openrouter/.
	 * @param string               $method  HTTP method.
	 * @param array<string,mixed>  $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		if ( $subpath === 'models' && $method === 'GET' ) {
			if ( class_exists( 'Neo_Pulse_App_Openrouter_Models_Catalog_Route' ) ) {
				Neo_Pulse_App_Openrouter_Models_Catalog_Route::send_catalog();
				return;
			}
		}
		if ( $subpath === 'chat-completion' && $method === 'POST' ) {
			self::chat_completion( $body );
			return;
		}
		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'    => false,
				'error' => 'Not found',
				'path'  => 'openrouter/' . $subpath,
			),
			404
		);
	}

	/**
	 * @param array<string,mixed> $body Request JSON.
	 */
	public static function chat_completion( array $body ): void {
		$api_key = isset( $body['apiKey'] ) ? trim( (string) $body['apiKey'] ) : '';
		if ( $api_key === '' && isset( $body['openRouterApiKey'] ) ) {
			$api_key = trim( (string) $body['openRouterApiKey'] );
		}
		if ( $api_key !== '' && class_exists( 'Neo_Pulse_App_Chat_Openrouter' ) ) {
			Neo_Pulse_App_Chat_Openrouter::use_request_api_key( $api_key );
		}

		$resolved = class_exists( 'Neo_Pulse_App_Chat_Openrouter' )
			? Neo_Pulse_App_Chat_Openrouter::api_key_from_request( $body )
			: '';
		if ( $resolved === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'OpenRouter API key is missing. Add it in Dashboard → API Keys.',
				),
				500
			);
			return;
		}

		$messages = self::normalize_messages( $body );
		if ( count( $messages ) === 0 ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'messages, or system and user, are required',
				),
				400
			);
			return;
		}

		$model = isset( $body['model'] ) ? trim( (string) $body['model'] ) : '';
		if ( $model === '' && class_exists( 'Neo_Pulse_App_Chat_Openrouter' ) ) {
			$model = Neo_Pulse_App_Chat_Openrouter::DEFAULT_MODEL;
		}

		$payload = array(
			'model'       => $model,
			'messages'    => $messages,
			'temperature' => isset( $body['temperature'] ) ? (float) $body['temperature'] : 0.5,
			'max_tokens'  => isset( $body['maxTokens'] ) ? (int) $body['maxTokens'] : ( isset( $body['max_tokens'] ) ? (int) $body['max_tokens'] : 8192 ),
			'stream'      => ! empty( $body['stream'] ),
		);
		if ( isset( $body['models'] ) && is_array( $body['models'] ) && count( $body['models'] ) > 0 ) {
			$payload['models'] = array_values( array_filter( $body['models'], 'is_string' ) );
		}
		if ( isset( $body['topP'] ) ) {
			$payload['top_p'] = (float) $body['topP'];
		} elseif ( isset( $body['top_p'] ) ) {
			$payload['top_p'] = (float) $body['top_p'];
		}
		if ( isset( $body['responseFormat'] ) && is_array( $body['responseFormat'] ) ) {
			$payload['response_format'] = $body['responseFormat'];
		} elseif ( isset( $body['response_format'] ) && is_array( $body['response_format'] ) ) {
			$payload['response_format'] = $body['response_format'];
		}
		if ( isset( $body['modalities'] ) && is_array( $body['modalities'] ) ) {
			$payload['modalities'] = $body['modalities'];
		}
		if ( isset( $body['image_config'] ) && is_array( $body['image_config'] ) ) {
			$payload['image_config'] = $body['image_config'];
		}
		if ( isset( $body['tools'] ) && is_array( $body['tools'] ) ) {
			$payload['tools'] = $body['tools'];
		}
		if ( isset( $body['tool_choice'] ) ) {
			$payload['tool_choice'] = $body['tool_choice'];
		} elseif ( isset( $body['toolChoice'] ) ) {
			$payload['tool_choice'] = $body['toolChoice'];
		}
		if ( isset( $body['reasoning'] ) && is_array( $body['reasoning'] ) ) {
			$payload['reasoning'] = $body['reasoning'];
		} else {
			$payload['reasoning'] = array( 'effort' => 'low' );
		}
		if ( ! empty( $payload['response_format'] ) && is_array( $payload['response_format'] ) && $payload['max_tokens'] < 4096 ) {
			$payload['max_tokens'] = 4096;
		}
		if ( isset( $body['webSearchOptions'] ) && is_array( $body['webSearchOptions'] ) ) {
			$payload['web_search_options'] = $body['webSearchOptions'];
		} elseif ( isset( $body['web_search_options'] ) && is_array( $body['web_search_options'] ) ) {
			$payload['web_search_options'] = $body['web_search_options'];
		}

		if ( ! empty( $payload['stream'] ) ) {
			self::stream_openrouter( $payload, $resolved );
			return;
		}

		try {
			$result = self::json_openrouter( $payload, $resolved );
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'                 => true,
					'content'            => $result['content'],
					'parsed'             => $result['parsed'],
					'finishReason'       => $result['finishReason'],
					'nativeFinishReason' => $result['nativeFinishReason'],
					'raw'                => $result['raw'],
				)
			);
		} catch ( Exception $e ) {
			$err_code = $e->getCode();
			$status_code = ( $err_code >= 400 && $err_code <= 599 ) ? $err_code : 500;
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'         => false,
					'error'      => $e->getMessage(),
					'statusCode' => $status_code,
				),
				$status_code
			);
		}
	}

	/**
	 * @param array<string,mixed> $body Request JSON.
	 * @return array<int,array<string,mixed>>
	 */
	private static function normalize_messages( array $body ): array {
		if ( isset( $body['messages'] ) && is_array( $body['messages'] ) && count( $body['messages'] ) > 0 ) {
			$from_messages = self::normalize_messages_array( $body['messages'] );
			if ( count( $from_messages ) > 0 ) {
				return $from_messages;
			}
		}

		$system = isset( $body['system'] ) ? trim( (string) $body['system'] ) : '';
		$user   = isset( $body['user'] ) ? trim( (string) $body['user'] ) : '';
		if ( $user === '' && isset( $body['userMessage'] ) ) {
			$user = trim( (string) $body['userMessage'] );
		}
		if ( $user === '' && isset( $body['user_message'] ) ) {
			$user = trim( (string) $body['user_message'] );
		}

		if ( $system !== '' && $user !== '' ) {
			return array(
				array(
					'role'    => 'system',
					'content' => $system,
				),
				array(
					'role'    => 'user',
					'content' => $user,
				),
			);
		}
		if ( $user !== '' ) {
			return array(
				array(
					'role'    => 'user',
					'content' => $user,
				),
			);
		}
		if ( $system !== '' ) {
			return array(
				array(
					'role'    => 'system',
					'content' => $system,
				),
			);
		}

		return array();
	}

	/**
	 * @param array<int,mixed> $messages Raw messages from JSON body.
	 * @return array<int,array<string,mixed>>
	 */
	private static function normalize_messages_array( array $messages ): array {
		$out = array();
		foreach ( $messages as $msg ) {
			if ( ! is_array( $msg ) ) {
				continue;
			}
			$role = isset( $msg['role'] ) ? trim( (string) $msg['role'] ) : '';
			if ( $role === '' ) {
				continue;
			}
			$content = $msg['content'] ?? null;
			if ( is_string( $content ) ) {
				$content = trim( $content );
				if ( $content === '' && ! isset( $msg['tool_calls'] ) ) {
					continue;
				}
			} elseif ( $content === null && ! isset( $msg['tool_calls'] ) ) {
				continue;
			}
			$entry = array(
				'role'    => $role,
				'content' => is_array( $content ) ? $content : ( $content === null ? null : (string) $content ),
			);
			if ( isset( $msg['tool_calls'] ) && is_array( $msg['tool_calls'] ) ) {
				$entry['tool_calls'] = $msg['tool_calls'];
			}
			if ( isset( $msg['tool_call_id'] ) && is_string( $msg['tool_call_id'] ) && $msg['tool_call_id'] !== '' ) {
				$entry['tool_call_id'] = $msg['tool_call_id'];
			}
			if ( isset( $msg['name'] ) && is_string( $msg['name'] ) && $msg['name'] !== '' ) {
				$entry['name'] = $msg['name'];
			}
			$out[] = $entry;
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $payload OpenRouter body.
	 * @param string              $api_key Key.
	 * @return array{content:string,parsed:?array<string,mixed>,finishReason:?string,nativeFinishReason:?string,raw:array<string,mixed>|null}
	 */
	private static function json_openrouter( array $payload, string $api_key ): array {
		$response = wp_remote_post(
			Neo_Pulse_App_Chat_Openrouter::CHAT_URL,
			array(
				'timeout' => 300,
				'headers' => Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key ),
				'body'    => wp_json_encode( $payload ),
			)
		);

		if ( is_wp_error( $response ) ) {
			throw new Exception( $response->get_error_message() );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 ) {
			$msg  = is_array( $raw ) ? ( $raw['error']['message'] ?? $raw['message'] ?? 'OpenRouter error' ) : 'OpenRouter error';
			$meta = is_array( $raw['error']['metadata'] ?? null ) ? $raw['error']['metadata'] : array();
			$detail = '';
			if ( ! empty( $meta['provider_name'] ) && is_string( $meta['provider_name'] ) ) {
				$detail .= ' [' . $meta['provider_name'] . ']';
			}
			if ( ! empty( $meta['raw'] ) && is_string( $meta['raw'] ) ) {
				$detail .= ' ' . mb_substr( $meta['raw'], 0, 300 );
			}
			throw new Exception( 'OpenRouter ' . $code . ': ' . $msg . $detail, $code );
		}

		$message    = is_array( $raw['choices'][0]['message'] ?? null ) ? $raw['choices'][0]['message'] : array();
		$content    = self::message_text_content( $message );
		$reasoning  = self::message_reasoning_text( $message );
		$structured = ! empty( $payload['response_format'] ) && is_array( $payload['response_format'] );
		$tool_calls = $message['tool_calls'] ?? null;
		$has_tool_calls = is_array( $tool_calls ) && count( $tool_calls ) > 0;
		$parsed     = self::parsed_object_from_structured_content( $content, $payload, is_array( $raw ) ? $raw : null );
		if ( $parsed === null && $structured && $reasoning !== '' ) {
			$parsed = self::parsed_object_from_structured_content( $reasoning, $payload, null );
		}
		if ( $content === '' && ! $structured && $reasoning !== '' ) {
			$content = $reasoning;
		}
		if ( is_array( $parsed ) ) {
			$content = wp_json_encode( $parsed );
		} elseif ( $structured && $parsed === null && $content !== '' && ! self::text_is_json_object( $content ) ) {
			if ( $reasoning !== '' ) {
				$parsed = self::decode_json_object_from_text( $reasoning );
				if ( is_array( $parsed ) ) {
					$content = wp_json_encode( $parsed );
				}
			}
			if ( $parsed === null && $content !== '' ) {
				$parsed = array( 'text' => $content, 'content' => $content );
			}
		}
		$finish = isset( $raw['choices'][0]['finish_reason'] ) ? (string) $raw['choices'][0]['finish_reason'] : '';
		if ( $content === '' && $parsed === null && ! $has_tool_calls && empty( $message['images'] ) && empty( $payload['modalities'] ) ) {
			if ( $reasoning !== '' ) {
				$content = $reasoning;
			}
		}

		return array(
			'content'            => $content,
			'parsed'             => $parsed,
			'finishReason'       => isset( $raw['choices'][0]['finish_reason'] ) ? (string) $raw['choices'][0]['finish_reason'] : null,
			'nativeFinishReason' => isset( $raw['choices'][0]['native_finish_reason'] ) ? (string) $raw['choices'][0]['native_finish_reason'] : null,
			'raw'                => is_array( $raw ) ? $raw : null,
		);
	}

	/**
	 * @param array<string,mixed> $message OpenRouter assistant message.
	 */
	private static function message_text_content( array $message ): string {
		$content = $message['content'] ?? '';
		if ( is_string( $content ) ) {
			return trim( $content );
		}
		if ( ! is_array( $content ) ) {
			return '';
		}
		$parts = array();
		foreach ( $content as $part ) {
			if ( ! is_array( $part ) ) {
				continue;
			}
			if ( isset( $part['text'] ) && is_string( $part['text'] ) ) {
				$text = trim( $part['text'] );
				if ( $text !== '' ) {
					$parts[] = $text;
				}
			}
		}
		return trim( implode( "\n", $parts ) );
	}

	/**
	 * Reasoning models (e.g. DeepSeek V4.1 Flash) may leave assistant content empty and put output in reasoning.
	 *
	 * @param array<string,mixed> $message OpenRouter assistant message.
	 */
	private static function message_reasoning_text( array $message ): string {
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
			if ( ! is_array( $detail ) ) {
				continue;
			}
			if ( isset( $detail['text'] ) && is_string( $detail['text'] ) ) {
				$text = trim( $detail['text'] );
				if ( $text !== '' ) {
					$parts[] = $text;
				}
			}
		}
		return trim( implode( "\n", $parts ) );
	}

	/**
	 * @param array<string,mixed>|null $openrouter_raw Full OpenRouter JSON body.
	 */
	private static function parsed_object_from_structured_content( string $content, array $payload, ?array $openrouter_raw = null ): ?array {
		if ( empty( $payload['response_format'] ) || ! is_array( $payload['response_format'] ) ) {
			return null;
		}
		$from_message = self::parsed_object_from_openrouter_message( $openrouter_raw );
		if ( $from_message !== null ) {
			return $from_message;
		}
		$text = trim( $content );
		if ( $text === '' ) {
			return null;
		}
		if ( str_starts_with( $text, '```' ) ) {
			$text = preg_replace( '/^```(?:json)?\s*/i', '', $text );
			$text = preg_replace( '/\s*```\s*$/m', '', $text );
			$text = trim( (string) $text );
		}
		return self::decode_json_object_from_text( $text );
	}

	/**
	 * Parse a JSON object from assistant text (whole string or first `{` … last `}` slice).
	 *
	 * @return array<string,mixed>|null
	 */
	private static function decode_json_object_from_text( string $text ): ?array {
		$text = trim( $text );
		if ( $text === '' ) {
			return null;
		}
		if ( str_starts_with( $text, '```' ) ) {
			$text = preg_replace( '/^```(?:json)?\s*/i', '', $text );
			$text = preg_replace( '/\s*```\s*$/m', '', $text );
			$text = trim( (string) $text );
		}
		$decoded = json_decode( $text, true );
		if ( is_array( $decoded ) ) {
			return $decoded;
		}
		$start = strpos( $text, '{' );
		$end   = strrpos( $text, '}' );
		if ( $start === false || $end === false || $end <= $start ) {
			return null;
		}
		$slice   = substr( $text, $start, $end - $start + 1 );
		$decoded = json_decode( $slice, true );
		return is_array( $decoded ) ? $decoded : null;
	}

	private static function text_is_json_object( string $text ): bool {
		return self::decode_json_object_from_text( $text ) !== null;
	}

	/**
	 * Provider-native structured object on the assistant message (when present).
	 *
	 * @param array<string,mixed>|null $openrouter_raw Full OpenRouter JSON body.
	 * @return array<string,mixed>|null
	 */
	private static function parsed_object_from_openrouter_message( ?array $openrouter_raw ): ?array {
		if ( $openrouter_raw === null ) {
			return null;
		}
		$message = $openrouter_raw['choices'][0]['message'] ?? null;
		if ( ! is_array( $message ) ) {
			return null;
		}
		$parsed = $message['parsed'] ?? null;
		if ( is_array( $parsed ) ) {
			return $parsed;
		}
		return null;
	}

	/**
	 * @param array<string,mixed> $payload OpenRouter body.
	 * @param string              $api_key Key.
	 */
	private static function stream_openrouter( array $payload, string $api_key ): void {
		if ( ! function_exists( 'curl_init' ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'OpenRouter streaming requires curl',
				),
				500
			);
			return;
		}

		while ( ob_get_level() > 0 ) {
			ob_end_clean();
		}
		@set_time_limit( 0 );
		ignore_user_abort( true );
		status_header( 200 );
		header( 'Content-Type: text/event-stream' );
		header( 'Cache-Control: no-cache' );
		header( 'X-Accel-Buffering: no' );

		$headers = Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key );
		$curl_headers = array();
		foreach ( $headers as $name => $value ) {
			$curl_headers[] = $name . ': ' . $value;
		}

		$ch = curl_init( Neo_Pulse_App_Chat_Openrouter::CHAT_URL );
		if ( $ch === false ) {
			echo "data: " . wp_json_encode( array( 'error' => array( 'message' => 'Could not start OpenRouter stream' ) ) ) . "\n\n";
			return;
		}

		curl_setopt( $ch, CURLOPT_POST, true );
		curl_setopt( $ch, CURLOPT_HTTPHEADER, $curl_headers );
		curl_setopt( $ch, CURLOPT_POSTFIELDS, wp_json_encode( $payload ) );
		// A long completion is expected while streaming; only give up when no bytes arrive for two minutes.
		curl_setopt( $ch, CURLOPT_CONNECTTIMEOUT, 30 );
		curl_setopt( $ch, CURLOPT_LOW_SPEED_LIMIT, 1 );
		curl_setopt( $ch, CURLOPT_LOW_SPEED_TIME, 120 );
		curl_setopt( $ch, CURLOPT_RETURNTRANSFER, false );
		curl_setopt(
			$ch,
			CURLOPT_WRITEFUNCTION,
			static function ( $ch, $data ) {
				echo $data;
				if ( function_exists( 'flush' ) ) {
					flush();
				}
				return strlen( $data );
			}
		);

		curl_exec( $ch );
		curl_close( $ch );
	}
}
