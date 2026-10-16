<?php
/**
 * OpenRouter multi-turn agent with Novamira ability tools.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Openrouter_Agent {

	const MAX_ITERATIONS = 24;

	/**
	 * @param callable(string,array<string,mixed>): array<string,mixed>|WP_Error $ability_executor
	 * @param array<int,string>                                                 $allowlist Ability names (novamira/…)
	 * @return array{content:string,tool_calls_made:int,messages:array<int,array<string,mixed>>}|WP_Error
	 */
	public static function run_loop(
		string $model,
		string $system_prompt,
		string $user_prompt,
		array $allowlist,
		callable $ability_executor
	) {
		$key = Neo_Pulse_Wp_OpenRouter::get_api_key();
		if ( $key === '' ) {
			return new WP_Error( 'neo-pulse_openrouter_key', __( 'OpenRouter API key not configured.', 'neo-pulse-wp' ) );
		}

		Neo_Pulse_Wp_OpenRouter::maybe_extend_time_limit();

		$tools = self::tools_from_allowlist( $allowlist );
		if ( $tools === array() ) {
			return new WP_Error( 'neo-pulse_novamira_agent', __( 'No Novamira tools available for the design agent.', 'neo-pulse-wp' ) );
		}

		$allow_map = array();
		foreach ( $allowlist as $name ) {
			$allow_map[ self::tool_name_from_ability( $name ) ] = $name;
		}

		$messages = array(
			array( 'role' => 'system', 'content' => $system_prompt ),
			array( 'role' => 'user', 'content' => $user_prompt ),
		);

		$tool_calls_made = 0;
		$content         = '';

		for ( $i = 0; $i < self::MAX_ITERATIONS; $i++ ) {
			$body = array(
				'model'    => $model,
				'messages' => $messages,
				'tools'    => $tools,
				'tool_choice' => 'auto',
			);

			$response = wp_remote_post(
				Neo_Pulse_Wp_OpenRouter::API_URL,
				array(
					'timeout' => Neo_Pulse_Wp_OpenRouter::get_timeout(),
					'headers' => Neo_Pulse_Wp_OpenRouter::request_headers( $key ),
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
				if ( is_array( $data ) && isset( $data['error']['message'] ) ) {
					$msg = (string) $data['error']['message'];
				}
				return new WP_Error( 'neo-pulse_novamira_agent', $msg ?: sprintf( 'OpenRouter HTTP %d', $code ) );
			}

			$message = is_array( $data ) && isset( $data['choices'][0]['message'] ) && is_array( $data['choices'][0]['message'] )
				? $data['choices'][0]['message']
				: array();

			$messages[] = $message;

			$tool_calls = isset( $message['tool_calls'] ) && is_array( $message['tool_calls'] ) ? $message['tool_calls'] : array();
			if ( $tool_calls === array() ) {
				$content = trim( (string) ( $message['content'] ?? '' ) );
				return array(
					'content'         => $content,
					'tool_calls_made' => $tool_calls_made,
					'messages'        => $messages,
				);
			}

			foreach ( $tool_calls as $call ) {
				if ( ! is_array( $call ) ) {
					continue;
				}
				$fn          = isset( $call['function'] ) && is_array( $call['function'] ) ? $call['function'] : array();
				$tool_id     = (string) ( $call['id'] ?? '' );
				$tool_key    = (string) ( $fn['name'] ?? '' );
				$args_raw    = (string) ( $fn['arguments'] ?? '{}' );
				$ability_name = $allow_map[ $tool_key ] ?? '';

				if ( $ability_name === '' ) {
					$messages[] = array(
						'role'         => 'tool',
						'tool_call_id' => $tool_id,
						'content'      => wp_json_encode(
							array(
								'error' => sprintf(
									/* translators: %s: tool name */
									__( 'Tool %s is not allowlisted.', 'neo-pulse-wp' ),
									$tool_key
								),
							)
						),
					);
					continue;
				}

				$args = json_decode( $args_raw, true );
				if ( ! is_array( $args ) ) {
					$args = array();
				}

				++$tool_calls_made;
				$result = $ability_executor( $ability_name, $args );
				if ( is_wp_error( $result ) ) {
					$payload = array( 'error' => $result->get_error_message() );
				} else {
					$payload = $result;
				}

				$messages[] = array(
					'role'         => 'tool',
					'tool_call_id' => $tool_id,
					'content'      => wp_json_encode( $payload ),
				);
			}
		}

		return new WP_Error(
			'neo-pulse_novamira_agent',
			sprintf(
				/* translators: %d: max iterations */
				__( 'Novamira design agent exceeded %d iterations.', 'neo-pulse-wp' ),
				self::MAX_ITERATIONS
			)
		);
	}

	/**
	 * @param array<int,string> $allowlist
	 * @return array<int,array<string,mixed>>
	 */
	public static function tools_from_allowlist( array $allowlist ): array {
		$tools = array();
		foreach ( $allowlist as $ability_name ) {
			if ( ! is_string( $ability_name ) || $ability_name === '' ) {
				continue;
			}
			$schema = self::ability_input_schema( $ability_name );
			$tools[] = array(
				'type'     => 'function',
				'function' => array(
					'name'        => self::tool_name_from_ability( $ability_name ),
					'description' => self::ability_description( $ability_name ),
					'parameters'  => $schema,
				),
			);
		}
		return $tools;
	}

	public static function tool_name_from_ability( string $ability_name ): string {
		$safe = preg_replace( '/[^a-zA-Z0-9_\-]/', '_', $ability_name );
		return is_string( $safe ) && $safe !== '' ? $safe : 'novamira_tool';
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function ability_input_schema( string $ability_name ): array {
		if ( ! function_exists( 'wp_get_ability' ) ) {
			return array( 'type' => 'object', 'properties' => new stdClass() );
		}
		$ability = wp_get_ability( $ability_name );
		if ( ! is_object( $ability ) || ! method_exists( $ability, 'get_input_schema' ) ) {
			return array( 'type' => 'object', 'properties' => new stdClass() );
		}
		$schema = $ability->get_input_schema();
		if ( ! is_array( $schema ) || $schema === array() ) {
			return array( 'type' => 'object', 'properties' => new stdClass() );
		}
		return $schema;
	}

	private static function ability_description( string $ability_name ): string {
		if ( ! function_exists( 'wp_get_ability' ) ) {
			return $ability_name;
		}
		$ability = wp_get_ability( $ability_name );
		if ( is_object( $ability ) && method_exists( $ability, 'get_description' ) ) {
			$desc = trim( (string) $ability->get_description() );
			if ( $desc !== '' ) {
				return $desc;
			}
		}
		return $ability_name;
	}
}
