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
			self::models_catalog( $body );
			return;
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

	const MODELS_CACHE_KEY = 'neo_pulse_openrouter_models_v1';
	const MODELS_URL         = 'https://openrouter.ai/api/v1/models';

	/**
	 * GET /api/openrouter/models — normalized catalog with pricing (24h transient cache).
	 *
	 * @param array<string,mixed> $body Request JSON (optional; key usually from header).
	 */
	public static function models_catalog( array $body ): void {
		$api_key = self::resolve_openrouter_key( $body );
		if ( $api_key === '' && class_exists( 'Neo_Pulse_App_Chat_Openrouter' ) ) {
			$api_key = Neo_Pulse_App_Chat_Openrouter::resolve_api_key();
		}

		$cached = get_transient( self::MODELS_CACHE_KEY );
		if ( is_array( $cached ) && isset( $cached['models'] ) && is_array( $cached['models'] ) ) {
			$models = self::merge_ollama_models( $cached['models'] );
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'       => true,
					'models'   => $models,
					'cachedAt' => isset( $cached['cachedAt'] ) ? (string) $cached['cachedAt'] : gmdate( 'c' ),
				)
			);
			return;
		}

		$headers = $api_key !== ''
			? Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key )
			: Neo_Pulse_App_Openrouter_Attribution::request_headers_public();

		$response = wp_remote_get(
			self::MODELS_URL,
			array(
				'timeout' => 60,
				'headers' => $headers,
			)
		);

		if ( is_wp_error( $response ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => $response->get_error_message(),
				),
				500
			);
			return;
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $raw ) ) {
			$msg = is_array( $raw ) ? ( $raw['error']['message'] ?? $raw['message'] ?? 'OpenRouter models error' ) : 'OpenRouter models error';
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'OpenRouter ' . $code . ': ' . $msg,
				),
				500
			);
			return;
		}

		$data = isset( $raw['data'] ) && is_array( $raw['data'] ) ? $raw['data'] : array();
		$models = array();
		foreach ( $data as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$normalized = self::normalize_openrouter_model_row( $row );
			if ( $normalized !== null ) {
				$models[] = $normalized;
			}
		}

		usort(
			$models,
			static function ( $a, $b ) {
				return strcasecmp( (string) ( $a['name'] ?? '' ), (string) ( $b['name'] ?? '' ) );
			}
		);

		$cached_at = gmdate( 'c' );
		set_transient(
			self::MODELS_CACHE_KEY,
			array(
				'models'   => $models,
				'cachedAt' => $cached_at,
			),
			DAY_IN_SECONDS
		);

		$models = self::merge_ollama_models( $models );

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'ok'       => true,
				'models'   => $models,
				'cachedAt' => $cached_at,
			)
		);
	}

	/**
	 * @param array<int,array<string,mixed>> $models OpenRouter catalog rows.
	 * @return array<int,array<string,mixed>>
	 */
	private static function merge_ollama_models( array $models ): array {
		$ollama = self::fetch_ollama_catalog_entries();
		if ( count( $ollama ) === 0 ) {
			return $models;
		}

		$ids = array();
		foreach ( $models as $row ) {
			if ( isset( $row['id'] ) ) {
				$ids[ (string) $row['id'] ] = true;
			}
		}

		foreach ( $ollama as $row ) {
			$id = (string) ( $row['id'] ?? '' );
			if ( $id === '' || isset( $ids[ $id ] ) ) {
				continue;
			}
			$models[] = $row;
			$ids[ $id ] = true;
		}

		usort(
			$models,
			static function ( $a, $b ) {
				return strcasecmp( (string) ( $a['name'] ?? '' ), (string) ( $b['name'] ?? '' ) );
			}
		);

		return $models;
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	private static function fetch_ollama_catalog_entries(): array {
		if ( ! class_exists( 'Neo_Pulse_App_Secrets' ) ) {
			return array();
		}

		$base = Neo_Pulse_App_Secrets::ollama_base_url();
		if ( $base === '' ) {
			return array();
		}

		$headers = array( 'Content-Type' => 'application/json' );
		$auth    = Neo_Pulse_App_Secrets::ollama_auth();
		if ( $auth !== '' ) {
			$headers['Authorization'] = 'Bearer ' . $auth;
		}

		$response = wp_remote_get(
			$base . '/api/tags',
			array(
				'timeout' => 30,
				'headers' => $headers,
			)
		);

		if ( is_wp_error( $response ) ) {
			return array();
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 || ! is_array( $raw ) ) {
			return array();
		}

		$tags = isset( $raw['models'] ) && is_array( $raw['models'] ) ? $raw['models'] : array();
		$out  = array();
		foreach ( $tags as $tag ) {
			if ( ! is_array( $tag ) ) {
				continue;
			}
			$id = isset( $tag['name'] ) ? trim( (string) $tag['name'] ) : '';
			if ( $id === '' ) {
				continue;
			}
			$out[] = array(
				'id'                    => $id,
				'name'                  => $id,
				'promptUsdPerToken'     => null,
				'completionUsdPerToken' => null,
				'imageUsdPerToken'      => null,
				'contextLength'         => null,
				'textOutput'            => true,
				'imageOutput'           => false,
				'local'                 => true,
			);
		}

		return $out;
	}

	/**
	 * Ollama model ids do not use provider/model slashes.
	 */
	private static function is_ollama_model_id( string $model ): bool {
		$model = trim( $model );
		return $model !== '' && ! str_contains( $model, '/' );
	}

	/**
	 * @return array<string,string>
	 */
	private static function ollama_request_headers(): array {
		$headers = array( 'Content-Type' => 'application/json' );
		if ( class_exists( 'Neo_Pulse_App_Secrets' ) ) {
			$auth = Neo_Pulse_App_Secrets::ollama_auth();
			if ( $auth !== '' ) {
				$headers['Authorization'] = 'Bearer ' . $auth;
			}
		}
		return $headers;
	}

	private static function ollama_chat_completions_url(): string {
		if ( ! class_exists( 'Neo_Pulse_App_Secrets' ) ) {
			return '';
		}
		$base = Neo_Pulse_App_Secrets::ollama_base_url();
		if ( $base === '' ) {
			return '';
		}
		return $base . '/v1/chat/completions';
	}

	/**
	 * @param array<string,mixed> $row OpenRouter model object.
	 * @return array<string,mixed>|null
	 */
	private static function normalize_openrouter_model_row( array $row ): ?array {
		$id = isset( $row['id'] ) ? trim( (string) $row['id'] ) : '';
		if ( $id === '' ) {
			return null;
		}

		$text_output  = self::model_supports_text_output( $row );
		$image_output = self::model_supports_image_output( $row );
		if ( ! $text_output && ! $image_output ) {
			return null;
		}

		$pricing = isset( $row['pricing'] ) && is_array( $row['pricing'] ) ? $row['pricing'] : array();
		$prompt  = self::parse_usd_per_token( $pricing['prompt'] ?? null );
		$completion = self::parse_usd_per_token( $pricing['completion'] ?? null );
		$image   = self::parse_usd_per_token( $pricing['image'] ?? null );

		$name = isset( $row['name'] ) ? trim( (string) $row['name'] ) : $id;
		$context = isset( $row['context_length'] ) ? (int) $row['context_length'] : 0;

		return array(
			'id'                     => $id,
			'name'                   => $name !== '' ? $name : $id,
			'promptUsdPerToken'      => $prompt,
			'completionUsdPerToken'  => $completion,
			'imageUsdPerToken'       => $image,
			'contextLength'          => $context > 0 ? $context : null,
			'textOutput'             => $text_output,
			'imageOutput'            => $image_output,
		);
	}

	/**
	 * @param mixed $value OpenRouter pricing field (USD per token string).
	 */
	private static function parse_usd_per_token( $value ): ?float {
		if ( $value === null || $value === '' ) {
			return null;
		}
		$num = (float) $value;
		if ( ! is_finite( $num ) || $num < 0 ) {
			return null;
		}
		return $num;
	}

	/**
	 * @param array<string,mixed> $row Model row.
	 */
	private static function model_supports_text_output( array $row ): bool {
		$arch = isset( $row['architecture'] ) && is_array( $row['architecture'] ) ? $row['architecture'] : array();
		$out  = isset( $arch['output_modalities'] ) && is_array( $arch['output_modalities'] ) ? $arch['output_modalities'] : null;
		if ( is_array( $out ) && count( $out ) > 0 ) {
			foreach ( $out as $mod ) {
				$m = strtolower( (string) $mod );
				if ( str_contains( $m, 'text' ) ) {
					return true;
				}
			}
			return false;
		}
		$id = strtolower( (string) ( $row['id'] ?? '' ) );
		if ( preg_match( '/(^|\/)((flux|stable-diffusion|dall-e|midjourney)[^/]*|.*-image(-preview)?)$/i', $id ) ) {
			return false;
		}
		return true;
	}

	/**
	 * @param array<string,mixed> $row Model row.
	 */
	private static function model_supports_image_output( array $row ): bool {
		$arch = isset( $row['architecture'] ) && is_array( $row['architecture'] ) ? $row['architecture'] : array();
		$out  = isset( $arch['output_modalities'] ) && is_array( $arch['output_modalities'] ) ? $arch['output_modalities'] : null;
		if ( is_array( $out ) ) {
			foreach ( $out as $mod ) {
				if ( str_contains( strtolower( (string) $mod ), 'image' ) ) {
					return true;
				}
			}
		}
		$pricing = isset( $row['pricing'] ) && is_array( $row['pricing'] ) ? $row['pricing'] : array();
		$image   = self::parse_usd_per_token( $pricing['image'] ?? null );
		if ( $image !== null && $image > 0 ) {
			return true;
		}
		$id = strtolower( (string) ( $row['id'] ?? '' ) );
		return str_contains( $id, 'image' ) || str_contains( $id, 'flux' );
	}

	/**
	 * @param array<string,mixed> $body Request JSON.
	 */
	private static function resolve_openrouter_key( array $body ): string {
		if ( ! class_exists( 'Neo_Pulse_App_Secrets' ) ) {
			return '';
		}
		return trim( Neo_Pulse_App_Secrets::openrouter_api_key_for_request( $body ) );
	}

	/**
	 * @param array<string,mixed> $body Request JSON.
	 */
	public static function chat_completion( array $body ): void {
		if ( class_exists( 'Neo_Pulse_App_Chat_Openrouter' ) ) {
			Neo_Pulse_App_Chat_Openrouter::clear_request_api_key();
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

		$use_ollama = self::is_ollama_model_id( $model ) && self::ollama_chat_completions_url() !== '';
		$resolved   = trim( self::resolve_openrouter_key( $body ) );

		if ( $use_ollama ) {
			if ( self::ollama_chat_completions_url() === '' ) {
				Neo_Pulse_App_Api_Dispatcher::send_json(
					array(
						'ok'    => false,
						'error' => 'Ollama base URL is not configured.',
					),
					500
				);
				return;
			}
		} elseif ( $resolved === '' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => 'OpenRouter API key is missing. Add it in Dashboard → API Keys.',
				),
				500
			);
			return;
		}

		$payload = array(
			'model'       => $model,
			'messages'    => $messages,
			'temperature' => isset( $body['temperature'] ) ? (float) $body['temperature'] : 0.5,
			'max_tokens'  => isset( $body['maxTokens'] ) ? (int) $body['maxTokens'] : ( isset( $body['max_tokens'] ) ? (int) $body['max_tokens'] : 8192 ),
			'stream'      => ! empty( $body['stream'] ),
		);
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
		if ( isset( $body['size'] ) && is_string( $body['size'] ) && trim( $body['size'] ) !== '' ) {
			$payload['size'] = trim( $body['size'] );
		}
		if ( isset( $body['tools'] ) && is_array( $body['tools'] ) ) {
			$payload['tools'] = $body['tools'];
		}
		if ( isset( $body['tool_choice'] ) ) {
			$payload['tool_choice'] = $body['tool_choice'];
		} elseif ( isset( $body['toolChoice'] ) ) {
			$payload['tool_choice'] = $body['toolChoice'];
		}
		if ( isset( $body['webSearchOptions'] ) && is_array( $body['webSearchOptions'] ) ) {
			$payload['web_search_options'] = $body['webSearchOptions'];
		} elseif ( isset( $body['web_search_options'] ) && is_array( $body['web_search_options'] ) ) {
			$payload['web_search_options'] = $body['web_search_options'];
		}

		if ( ! empty( $payload['stream'] ) ) {
			if ( $use_ollama ) {
				self::stream_chat_completion( self::ollama_chat_completions_url(), self::ollama_request_headers(), $payload, 'Ollama' );
			} else {
				self::stream_chat_completion(
					Neo_Pulse_App_Chat_Openrouter::CHAT_URL,
					Neo_Pulse_App_Openrouter_Attribution::request_headers( $resolved ),
					$payload,
					'OpenRouter'
				);
			}
			return;
		}

		try {
			if ( $use_ollama ) {
				$result = self::json_chat_completion(
					self::ollama_chat_completions_url(),
					self::ollama_request_headers(),
					$payload,
					'Ollama'
				);
			} else {
				$result = self::json_chat_completion(
					Neo_Pulse_App_Chat_Openrouter::CHAT_URL,
					Neo_Pulse_App_Openrouter_Attribution::request_headers( $resolved ),
					$payload,
					'OpenRouter'
				);
			}
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'                 => true,
					'content'            => $result['content'],
					'finishReason'       => $result['finishReason'],
					'nativeFinishReason' => $result['nativeFinishReason'],
					'raw'                => $result['raw'],
				)
			);
		} catch ( Exception $e ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => $e->getMessage(),
				),
				500
			);
		}
	}

	/**
	 * @param array<string,mixed> $body Request JSON.
	 * @return array<int,array<string,mixed>>
	 */
	private static function normalize_messages( array $body ): array {
		if ( isset( $body['messages'] ) && is_array( $body['messages'] ) && count( $body['messages'] ) > 0 ) {
			$out = array();
			foreach ( $body['messages'] as $msg ) {
				if ( ! is_array( $msg ) ) {
					continue;
				}
				$role = isset( $msg['role'] ) ? trim( (string) $msg['role'] ) : '';
				if ( $role === '' ) {
					continue;
				}
				$content = $msg['content'] ?? null;
				$entry   = array(
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
		$system = isset( $body['system'] ) ? trim( (string) $body['system'] ) : '';
		$user   = isset( $body['user'] ) ? trim( (string) $body['user'] ) : '';
		if ( $system === '' || $user === '' ) {
			return array();
		}
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

	/**
	 * @param array<string,mixed>        $payload OpenAI-compatible body.
	 * @param array<string,string>       $headers Request headers.
	 * @param string                     $label   Provider label for errors.
	 * @return array{content:string,finishReason:?string,nativeFinishReason:?string,raw:array<string,mixed>|null}
	 */
	private static function json_chat_completion( string $url, array $headers, array $payload, string $label ): array {
		$response = wp_remote_post(
			$url,
			array(
				'timeout' => 300,
				'headers' => $headers,
				'body'    => wp_json_encode( $payload ),
			)
		);

		if ( is_wp_error( $response ) ) {
			throw new Exception( $response->get_error_message() );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $raw ) ? ( $raw['error']['message'] ?? $raw['message'] ?? $label . ' error' ) : $label . ' error';
			throw new Exception( $label . ' ' . $code . ': ' . $msg );
		}

		$message  = isset( $raw['choices'][0]['message'] ) && is_array( $raw['choices'][0]['message'] )
			? $raw['choices'][0]['message']
			: array();
		$content  = trim( (string) ( $message['content'] ?? '' ) );
		if ( $content === '' ) {
			$content = trim( (string) ( $message['reasoning'] ?? '' ) );
		}
		$tool_calls = $message['tool_calls'] ?? null;
		$has_tool_calls = is_array( $tool_calls ) && count( $tool_calls ) > 0;
		if ( $content === '' && ! $has_tool_calls && empty( $message['images'] ) && empty( $payload['modalities'] ) ) {
			throw new Exception( $label . ' returned empty content' );
		}

		return array(
			'content'            => $content,
			'finishReason'       => isset( $raw['choices'][0]['finish_reason'] ) ? (string) $raw['choices'][0]['finish_reason'] : null,
			'nativeFinishReason' => isset( $raw['choices'][0]['native_finish_reason'] ) ? (string) $raw['choices'][0]['native_finish_reason'] : null,
			'raw'                => is_array( $raw ) ? $raw : null,
		);
	}

	/**
	 * @param array<string,mixed>  $payload OpenAI-compatible body.
	 * @param array<string,string> $headers Request headers.
	 */
	private static function stream_chat_completion( string $url, array $headers, array $payload, string $label ): void {
		if ( ! function_exists( 'curl_init' ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json(
				array(
					'ok'    => false,
					'error' => $label . ' streaming requires curl',
				),
				500
			);
			return;
		}

		while ( ob_get_level() > 0 ) {
			ob_end_clean();
		}
		@set_time_limit( 300 );
		ignore_user_abort( true );
		status_header( 200 );
		header( 'Content-Type: text/event-stream' );
		header( 'Cache-Control: no-cache' );
		header( 'X-Accel-Buffering: no' );

		$curl_headers = array();
		foreach ( $headers as $name => $value ) {
			$curl_headers[] = $name . ': ' . $value;
		}

		$ch = curl_init( $url );
		if ( $ch === false ) {
			echo "data: " . wp_json_encode( array( 'error' => array( 'message' => 'Could not start ' . $label . ' stream' ) ) ) . "\n\n";
			return;
		}

		curl_setopt( $ch, CURLOPT_POST, true );
		curl_setopt( $ch, CURLOPT_HTTPHEADER, $curl_headers );
		curl_setopt( $ch, CURLOPT_POSTFIELDS, wp_json_encode( $payload ) );
		curl_setopt( $ch, CURLOPT_TIMEOUT, 300 );
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
