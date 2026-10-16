<?php
/**
 * AI Chat provider registry — the LLM backends the chat can talk to.
 *
 * Anthropic has its own Messages API. OpenAI-compatible providers share the
 * Chat Completions adapter, while current reasoning models on the native OpenAI
 * provider use its Responses endpoint for function-tool support.
 *
 * @package EMCP_Tools
 * @since   3.1.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Static registry of supported providers + their endpoints/auth/format.
 *
 * @since 3.1.0
 */
class EMCP_Tools_AI_Providers {

	/**
	 * All providers, keyed by id. `format` selects the JS adapter; `auth` selects
	 * the header style ('x-api-key' | 'bearer'); `model_filter` (optional) is a
	 * PCRE applied to model ids to hide non-chat models.
	 *
	 * @since 3.1.0
	 * @return array<string,array>
	 */
	public static function all(): array {
		return array(
			'anthropic'  => array(
				'label'        => 'Anthropic (Claude)',
				'format'       => 'anthropic',
				'chat_url'     => 'https://api.anthropic.com/v1/messages',
				'models_url'   => 'https://api.anthropic.com/v1/models?limit=1000',
				'auth'         => 'x-api-key',
				'headers'      => array(
					'anthropic-version'                         => '2023-06-01',
					'anthropic-dangerous-direct-browser-access' => 'true',
				),
				'key_hint'     => 'sk-ant-...',
				'console_url'  => 'https://console.anthropic.com/settings/keys',
				'default_rx'   => 'sonnet',
				'model_filter' => '',
			),
			'openai'     => array(
				'label'                   => 'OpenAI',
				'format'                  => 'openai',
				'chat_url'                => 'https://api.openai.com/v1/chat/completions',
				'responses_url'           => 'https://api.openai.com/v1/responses',
				'responses_model_pattern' => '^(?:gpt-5\\.6(?:-|$)|gpt-6-astra(?:-|$))',
				'responses_reasoning_effort' => 'low',
				'responses_max_output_tokens' => 12000,
				'models_url'             => 'https://api.openai.com/v1/models',
				'auth'                   => 'bearer',
				'headers'                => array(),
				'key_hint'               => 'sk-...',
				'console_url'            => 'https://platform.openai.com/api-keys',
				'default_rx'             => 'gpt-4o',
				'model_filter'           => '/^(gpt-|o[1-9]|chatgpt)/i',
			),
			'openrouter' => array(
				'label'        => 'OpenRouter',
				'format'       => 'openai',
				'chat_url'     => 'https://openrouter.ai/api/v1/chat/completions',
				'models_url'   => 'https://openrouter.ai/api/v1/models',
				'auth'         => 'bearer',
				'headers'      => array(
					'HTTP-Referer' => 'https://emcptools.com',
					'X-Title'      => 'Neo EMCP',
				),
				'key_hint'     => 'sk-or-...',
				'console_url'  => 'https://openrouter.ai/keys',
				'default_rx'   => 'claude.*sonnet',
				'model_filter' => '',
			),
			'gemini'     => array(
				'label'        => 'Google Gemini',
				'format'       => 'openai',
				'chat_url'     => 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
				'models_url'   => 'https://generativelanguage.googleapis.com/v1beta/openai/models',
				'auth'         => 'bearer',
				'headers'      => array(),
				'key_hint'     => 'AIza...',
				'console_url'  => 'https://aistudio.google.com/apikey',
				'default_rx'   => 'gemini-[0-9].*(flash|pro)',
				'model_filter' => '/gemini/i',
			),
			'deepseek'   => array(
				'label'        => 'DeepSeek',
				'format'       => 'openai',
				'chat_url'     => 'https://api.deepseek.com/chat/completions',
				'models_url'   => 'https://api.deepseek.com/models',
				'auth'         => 'bearer',
				'headers'      => array(),
				'key_hint'     => 'sk-...',
				'console_url'  => 'https://platform.deepseek.com/api_keys',
				'default_rx'   => 'deepseek-chat',
				'model_filter' => '',
			),
			'moonshot'   => array(
				'label'        => 'Moonshot (Kimi)',
				'format'       => 'openai',
				'chat_url'     => 'https://api.moonshot.ai/v1/chat/completions',
				'models_url'   => 'https://api.moonshot.ai/v1/models',
				'auth'         => 'bearer',
				'headers'      => array(),
				'key_hint'     => 'sk-...',
				'console_url'  => 'https://platform.moonshot.ai/console/api-keys',
				'default_rx'   => 'kimi|moonshot-v1-8k',
				'model_filter' => '',
			),
			'zai'        => array(
				'label'        => 'Z.ai (GLM)',
				'format'       => 'openai',
				'chat_url'     => 'https://api.z.ai/api/paas/v4/chat/completions',
				'models_url'   => 'https://api.z.ai/api/paas/v4/models',
				'auth'         => 'bearer',
				'headers'      => array(),
				'key_hint'     => 'xxxxx.xxxxx',
				'console_url'  => 'https://z.ai/manage-apikey/apikey-list',
				'default_rx'   => 'glm-4',
				'model_filter' => '',
			),
			// OpenCode Go (https://opencode.ai/docs/go/): one key, three wire
			// formats chosen per model. Grok, GPT and Muse Spark models speak the
			// Responses API, MiniMax and Qwen 3.6+ speak the Anthropic Messages API
			// (x-api-key auth), everything else Chat Completions (Bearer auth).
			// Its inference routes answer no CORS preflight and ask clients to send
			// their own User-Agent plus a session header, so chat requests go
			// through the server relay (EMCP_Tools_AI_Chat_Relay), never the browser.
			'opencode-go' => array(
				'label'                      => 'OpenCode Go',
				'format'                     => 'openai',
				'chat_url'                   => 'https://opencode.ai/zen/go/v1/chat/completions',
				'responses_url'              => 'https://opencode.ai/zen/go/v1/responses',
				'responses_model_pattern'    => '^(?:grok-|gpt-|muse-spark-)',
				// Empty: not every Responses model behind the gateway takes a
				// reasoning effort, so none is sent.
				'responses_reasoning_effort' => '',
				'responses_max_output_tokens' => 12000,
				'messages_url'               => 'https://opencode.ai/zen/go/v1/messages',
				'messages_model_pattern'     => '^(?:minimax-|qwen3\\.[678]-)',
				'models_url'                 => 'https://opencode.ai/zen/go/v1/models',
				'auth'                       => 'bearer',
				'headers'                    => array(),
				'key_hint'                   => 'OpenCode Go API key',
				'console_url'                => 'https://opencode.ai/auth',
				'default_rx'                 => 'kimi-k2\\.6|glm-5\\.1',
				'model_filter'               => '',
				'relay'                      => true,
				'session_header'             => 'x-opencode-session',
				// Shown on the provider card. /models needs no key, so Connect cannot
				// verify one; the first chat does.
				'note'                       => __( 'Your key is first checked when you send your first chat. OpenCode states that Go is designed for OpenCode and similar coding agents.', 'emcp-tools' ),
			),
			// OpenCode Zen (https://opencode.ai/docs/zen/): OpenCode's pay-as-you-go
			// gateway. Same relay and routing code as Go, its own model split: GPT,
			// Grok and Muse Spark on Responses, Claude and Qwen 3.5+ on Messages
			// (x-api-key), the rest (DeepSeek, MiniMax, GLM, Kimi, the free models)
			// on Chat Completions. Gemini uses Google's generateContent API and Jev
			// a structured-decision API; neither is supported here, so both are
			// dropped from the model list and refused by the relay. So are its free
			// models, which OpenCode allows only in its own client.
			'opencode-zen' => array(
				'label'                      => 'OpenCode Zen',
				'format'                     => 'openai',
				'chat_url'                   => 'https://opencode.ai/zen/v1/chat/completions',
				'responses_url'              => 'https://opencode.ai/zen/v1/responses',
				'responses_model_pattern'    => '^(?:gpt-|grok-|muse-spark-)',
				// GPT takes an effort (low keeps it fast and cheap, as on the OpenAI
				// preset); Grok and Muse Spark get none.
				'responses_reasoning_effort' => 'low',
				'responses_reasoning_model_pattern' => '^gpt-',
				'responses_max_output_tokens' => 12000,
				'messages_url'               => 'https://opencode.ai/zen/v1/messages',
				'messages_model_pattern'     => '^(?:claude-|qwen3\.[5678]-)',
				'unsupported_model_pattern'  => '^(?:gemini-|jev-)',
				// OpenCode's free models (Big Pickle, *-free) are refused outside
				// OpenCode's own client, and the docs say some may train on the data.
				'client_only_model_pattern'  => '(?:-free$|^big-pickle$)',
				// Claude, and GPT 5/6 except the text-only Codex Spark, take images.
				'vision_model_pattern'       => '^(?:claude-|gpt-(?:5|6)(?!\.3-codex-spark))',
				'models_url'                 => 'https://opencode.ai/zen/v1/models',
				'auth'                       => 'bearer',
				'headers'                    => array(),
				'key_hint'                   => 'OpenCode Zen API key',
				'console_url'                => 'https://opencode.ai/auth',
				'default_rx'                 => 'claude-sonnet-4-6|claude-sonnet|kimi-k2\.6',
				// Keep-filter: models on APIs the chat cannot speak, and the free
				// OpenCode-only models, never reach the picker.
				'model_filter'               => '/^(?!gemini-|jev-|big-pickle$)(?!.*-free$)/i',
				'relay'                      => true,
				'session_header'             => 'x-opencode-session',
				'note'                       => __( 'Your key is first checked when you send your first chat.', 'emcp-tools' ),
			),
			// Local runtime. No API key and no cloud account: the model list is
			// probed over loopback, so it only appears when Ollama is actually
			// reachable from this site (see EMCP_Tools_AI_Providers::local_available()).
			'ollama'     => array(
				'label'        => 'Ollama (local)',
				'format'       => 'openai',
				'chat_url'     => 'http://localhost:11434/v1/chat/completions',
				'models_url'   => 'http://localhost:11434/v1/models',
				'auth'         => 'none',
				'headers'      => array(),
				'key_hint'     => '',
				'console_url'  => 'https://ollama.com/download',
				'default_rx'   => 'llama|qwen|mistral',
				// Local runtimes host embedding/reranker models alongside chat
				// models; those can't hold a conversation, so keep them out of the
				// picker. (Keep-filter — negative lookahead drops the matches.)
				'model_filter' => '/^(?!.*(?:embed|rerank))/i',
				'local'        => true,
			),
			'lmstudio'   => array(
				'label'        => 'LM Studio (local)',
				'format'       => 'openai',
				'chat_url'     => 'http://localhost:1234/v1/chat/completions',
				'models_url'   => 'http://localhost:1234/v1/models',
				'auth'         => 'none',
				'headers'      => array(),
				'key_hint'     => '',
				'console_url'  => 'https://lmstudio.ai/',
				'default_rx'   => 'qwen|llama|mistral|gemma',
				'model_filter' => '/^(?!.*(?:embed|rerank))/i',
				'local'        => true,
			),
		);
	}

	/**
	 * Model ids that accept image input. Best-effort — covers the common cloud
	 * multimodal families and the local vision runtimes (llava, moondream,
	 * qwen*-vl, llama3.2-vision, minicpm-v, pixtral, gemma-3, internvl, …).
	 */
	const VISION_MODEL_RX = '/(?:[\-_.\/]vl\b|-vl-|vlm|vision|llava|bakllava|moondream|minicpm-?v|cogvlm|internvl|pixtral|gemma-?3|gpt-4o|gpt-4\.1|gpt-4-turbo|chatgpt-4o)/i';

	/**
	 * Whether a model can accept image input.
	 *
	 * Anthropic and Gemini are multimodal across their whole current line-up;
	 * everything else is matched by id. A false result is what triggers the AI
	 * Chat's local vision-describe fallback, so this leans toward NOT claiming
	 * vision it can't deliver.
	 *
	 * @since 3.6.0
	 * @param string $provider Provider id.
	 * @param string $model_id Model id.
	 * @return bool
	 */
	public static function model_supports_vision( string $provider, string $model_id ): bool {
		if ( in_array( $provider, array( 'anthropic', 'gemini' ), true ) ) {
			return true;
		}
		$id = strtolower( trim( $model_id ) );
		if ( '' === $id ) {
			return false;
		}
		// A gateway can name the families it serves with image input.
		$cfg = self::get( $provider );
		$rx  = (string) ( $cfg['vision_model_pattern'] ?? '' );
		if ( '' !== $rx && preg_match( '#' . str_replace( '#', '\#', $rx ) . '#i', $id ) ) {
			return true;
		}
		// Text-only reasoning minis + non-chat models never take images.
		if ( preg_match( '/o1-mini|o3-mini|embed|rerank|whisper|tts|dall-e|image-|moderation/', $id ) ) {
			return false;
		}
		return (bool) preg_match( self::VISION_MODEL_RX, $id );
	}

	/**
	 * Ids of providers that run on the user's own machine (no cloud account).
	 *
	 * @since 3.6.0
	 * @return string[]
	 */
	public static function local_ids(): array {
		$out = array();
		foreach ( self::all() as $id => $p ) {
			if ( ! empty( $p['local'] ) ) {
				$out[] = $id;
			}
		}
		return $out;
	}

	/**
	 * Whether a provider needs no API key.
	 *
	 * @since 3.6.0
	 * @param string $id Provider id.
	 * @return bool
	 */
	public static function is_local( string $id ): bool {
		$p = self::get( $id );
		return null !== $p && ! empty( $p['local'] );
	}

	/**
	 * Whether a local provider is actually running and reachable right now.
	 *
	 * Probes the models endpoint over loopback with a short timeout. Cached in a
	 * transient so the settings screen never blocks on a dead port. Note the
	 * probe runs from the SERVER — chat requests run from the browser, so a
	 * usable local provider needs both on the same machine (the normal local-dev
	 * case). On remote hosting this simply returns false and the card is hidden.
	 *
	 * @since 3.6.0
	 * @param string $id    Provider id.
	 * @param bool   $fresh Skip the cache.
	 * @return bool
	 */
	public static function local_available( string $id, bool $fresh = false ): bool {
		if ( ! self::is_local( $id ) ) {
			return false;
		}

		$cache_key = 'emcp_ai_local_' . $id;
		if ( ! $fresh ) {
			$cached = get_transient( $cache_key );
			if ( false !== $cached ) {
				return '1' === $cached;
			}
		}

		$cfg      = self::get( $id );
		$response = wp_remote_get(
			$cfg['models_url'],
			array(
				'timeout'   => 2,
				'sslverify' => false,
			)
		);
		$ok = ! is_wp_error( $response ) && 200 === (int) wp_remote_retrieve_response_code( $response );

		// Short TTL: users start/stop Ollama freely, so don't cache a miss for long.
		set_transient( $cache_key, $ok ? '1' : '0', $ok ? 5 * MINUTE_IN_SECONDS : MINUTE_IN_SECONDS );

		return $ok;
	}

	/**
	 * @since 3.1.0
	 * @param string $id Provider id.
	 * @return array|null
	 */
	public static function get( string $id ): ?array {
		$all = self::all();
		return isset( $all[ $id ] ) ? $all[ $id ] : null;
	}

	/**
	 * @since 3.1.0
	 * @param string $id Provider id.
	 * @return bool
	 */
	public static function exists( string $id ): bool {
		return null !== self::get( $id );
	}

	/**
	 * @since 3.1.0
	 * @return string[]
	 */
	public static function ids(): array {
		return array_keys( self::all() );
	}

	/**
	 * Config safe to expose to the browser (no secrets — there are none here).
	 * Strips nothing today, but kept as the single client-facing shape.
	 *
	 * @since 3.1.0
	 * @return array<string,array>
	 */
	public static function for_client(): array {
		$out = array();
		foreach ( self::all() as $id => $p ) {
			$out[ $id ] = array(
				'label'                 => $p['label'],
				'format'                => $p['format'],
				'chatUrl'               => $p['chat_url'],
				'responsesUrl'          => (string) ( $p['responses_url'] ?? '' ),
				'responsesModelPattern' => (string) ( $p['responses_model_pattern'] ?? '' ),
				'responsesReasoningEffort' => (string) ( $p['responses_reasoning_effort'] ?? '' ),
				// Optional: only model ids matching this get the effort ('' = all).
				'responsesReasoningModelPattern' => (string) ( $p['responses_reasoning_model_pattern'] ?? '' ),
				'responsesMaxOutputTokens' => (int) ( $p['responses_max_output_tokens'] ?? 0 ),
				'messagesUrl'           => (string) ( $p['messages_url'] ?? '' ),
				'messagesModelPattern'  => (string) ( $p['messages_model_pattern'] ?? '' ),
				// Chat requests for this provider go through the site's relay route.
				'relay'                 => ! empty( $p['relay'] ),
				'note'                  => (string) ( $p['note'] ?? '' ),
				'auth'                  => $p['auth'],
				'headers'               => $p['headers'],
				'keyHint'               => $p['key_hint'],
				'consoleUrl'            => $p['console_url'],
				'local'                 => ! empty( $p['local'] ),
			);
		}
		return $out;
	}
}
