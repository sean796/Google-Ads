<?php
/**
 * AI Chat server relay for providers that refuse browser requests.
 *
 * The AI Chat normally talks to the model provider straight from the browser.
 * Some gateways (OpenCode Go) answer no CORS preflight on their inference
 * routes, so a browser request can never reach them, and they ask clients to
 * identify themselves with their own User-Agent, which a browser cannot set.
 * For a provider flagged `relay` in EMCP_Tools_AI_Providers, the browser posts
 * the finished request body here and this class forwards it, streaming the
 * provider's SSE response back as it arrives.
 *
 * Safety: the destination URL is ALWAYS taken from the static provider table,
 * chosen by the API kind (chat / responses / messages). Nothing in the request
 * can name a host, so the relay cannot be pointed anywhere else. The API key is
 * read server-side from the current user's encrypted store and never leaves the
 * server on this path.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Builds and forwards relayed AI Chat requests.
 *
 * @since 3.18.0
 */
class EMCP_Tools_AI_Chat_Relay {

	/** API kinds and the provider field holding each endpoint URL. */
	const KINDS = array(
		'chat'      => 'chat_url',
		'responses' => 'responses_url',
		'messages'  => 'messages_url',
	);

	/** Longest session id forwarded to the provider. */
	const SESSION_MAX = 64;

	/** Seconds a relayed request may run (long tool-heavy turns stream for a while). */
	const TIMEOUT = 300;

	/** Relayed replies one user may stream at the same time. */
	const MAX_STREAMS = 2;

	/** Lifetime of a slot claim: outlives the longest request, then self-expires. */
	const SLOT_TTL = 360;

	/**
	 * Transport override for tests: callable( string $url, array $args, callable $on_chunk ).
	 *
	 * @var callable|null
	 */
	public static $transport = null;

	/**
	 * Output override for tests: object with start(), write( string ), finish().
	 *
	 * @var object|null
	 */
	public static $emitter = null;

	/**
	 * Which API a model speaks on a provider: 'responses', 'messages', 'chat',
	 * or 'unsupported'.
	 *
	 * A provider may route some models to its Responses or Messages endpoint by
	 * id pattern; everything else uses the provider's primary format. Models on
	 * an API the chat cannot speak (e.g. Google generateContent on OpenCode Zen)
	 * match `unsupported_model_pattern` and are never sent anywhere.
	 *
	 * @since 3.18.0
	 * @param array  $cfg   Provider config.
	 * @param string $model Model id.
	 * @return string
	 */
	public static function api_kind_for( array $cfg, string $model ): string {
		if ( '' !== self::unsupported_reason( $cfg, $model ) ) {
			return 'unsupported';
		}
		if ( self::matches( $cfg, 'responses', $model ) ) {
			return 'responses';
		}
		if ( self::matches( $cfg, 'messages', $model ) ) {
			return 'messages';
		}
		return 'anthropic' === ( $cfg['format'] ?? '' ) ? 'messages' : 'chat';
	}

	/**
	 * Why a model may not be relayed on a provider, or '' when it may.
	 *
	 * `unsupported_model_pattern`: the model speaks an API the chat has no
	 * adapter for. `client_only_model_pattern`: the gateway allows the model
	 * only in its own client (OpenCode's free models).
	 *
	 * @since 3.18.0
	 * @param array  $cfg   Provider config.
	 * @param string $model Model id.
	 * @return string
	 */
	public static function unsupported_reason( array $cfg, string $model ): string {
		if ( '' === $model ) {
			return '';
		}
		$checks = array(
			/* translators: %s: model id. */
			'client_only_model_pattern' => __( 'Model %s is one of OpenCode\'s free models, which are only for OpenCode\'s own client. Pick another model.', 'emcp-tools' ),
			/* translators: %s: model id. */
			'unsupported_model_pattern' => __( 'Model %s uses an API that AI Chat does not support yet. Pick another model.', 'emcp-tools' ),
		);
		foreach ( $checks as $field => $message ) {
			$pattern = (string) ( $cfg[ $field ] ?? '' );
			if ( '' !== $pattern && 1 === preg_match( '#' . str_replace( '#', '\#', $pattern ) . '#i', $model ) ) {
				return sprintf( $message, $model );
			}
		}
		return '';
	}

	/**
	 * Whether a model id matches a provider's routing pattern for an API kind.
	 *
	 * @param array  $cfg   Provider config.
	 * @param string $kind  'responses' | 'messages'.
	 * @param string $model Model id.
	 * @return bool
	 */
	private static function matches( array $cfg, string $kind, string $model ): bool {
		$url     = (string) ( $cfg[ $kind . '_url' ] ?? '' );
		$pattern = (string) ( $cfg[ $kind . '_model_pattern' ] ?? '' );
		if ( '' === $url || '' === $pattern || '' === $model ) {
			return false;
		}
		return 1 === preg_match( '#' . str_replace( '#', '\#', $pattern ) . '#i', $model );
	}

	/**
	 * The endpoint URL a provider serves an API kind on, or '' when it has none.
	 *
	 * The Anthropic provider keeps its Messages endpoint in `chat_url`.
	 *
	 * @since 3.18.0
	 * @param array  $cfg  Provider config.
	 * @param string $kind API kind.
	 * @return string
	 */
	public static function endpoint_for( array $cfg, string $kind ): string {
		if ( ! isset( self::KINDS[ $kind ] ) ) {
			return '';
		}
		if ( 'messages' === $kind && 'anthropic' === ( $cfg['format'] ?? '' ) ) {
			return (string) ( $cfg['chat_url'] ?? '' );
		}
		return (string) ( $cfg[ self::KINDS[ $kind ] ] ?? '' );
	}

	/**
	 * Reduces a client session id to a safe header value.
	 *
	 * @since 3.18.0
	 * @param string $session Raw session id.
	 * @return string
	 */
	public static function sanitize_session( string $session ): string {
		$clean = (string) preg_replace( '/[^A-Za-z0-9_\-]/', '', $session );
		return substr( $clean, 0, self::SESSION_MAX );
	}

	/**
	 * The User-Agent relayed requests identify with.
	 *
	 * @since 3.18.0
	 * @return string
	 */
	public static function user_agent(): string {
		$version = defined( 'EMCP_TOOLS_VERSION' ) ? (string) EMCP_TOOLS_VERSION : 'dev';
		return 'emcp-tools-ai-chat/' . $version;
	}

	/**
	 * Request headers for one API kind on a provider.
	 *
	 * Auth follows the endpoint, not the provider: an Anthropic-style Messages
	 * endpoint reads `x-api-key`, the OpenAI-style ones read a Bearer token.
	 *
	 * @since 3.18.0
	 * @param array  $cfg     Provider config.
	 * @param string $kind    API kind.
	 * @param string $key     API key (plaintext).
	 * @param string $session Sanitized session id ('' for none).
	 * @return array<string,string>
	 */
	public static function headers_for( array $cfg, string $kind, string $key, string $session = '' ): array {
		$headers = array(
			'Content-Type'    => 'application/json',
			'Accept'          => 'text/event-stream, application/json',
			'Accept-Encoding' => 'identity',
			'User-Agent'      => self::user_agent(),
		);
		foreach ( (array) ( $cfg['headers'] ?? array() ) as $name => $value ) {
			$headers[ (string) $name ] = (string) $value;
		}
		if ( 'messages' === $kind ) {
			$headers['x-api-key']         = $key;
			$headers['anthropic-version'] = '2023-06-01';
		} else {
			$headers['Authorization'] = 'Bearer ' . $key;
		}
		$header = (string) ( $cfg['session_header'] ?? '' );
		if ( '' !== $header && '' !== $session ) {
			$headers[ $header ] = $session;
		}
		return $headers;
	}

	/**
	 * Builds the upstream request for a relayed call.
	 *
	 * @since 3.18.0
	 * @param string          $provider Provider id.
	 * @param string          $kind     API kind the client used.
	 * @param object|array    $body     Request body (objects kept as objects so `{}` survives).
	 * @param string          $key      API key (plaintext).
	 * @param string          $session  Raw session id.
	 * @return array{url:string,args:array}|\WP_Error
	 */
	public static function build_request( string $provider, string $kind, $body, string $key, string $session = '' ) {
		$cfg = EMCP_Tools_AI_Providers::get( $provider );
		if ( null === $cfg ) {
			return new \WP_Error( 'unknown_provider', __( 'Unknown provider.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		if ( empty( $cfg['relay'] ) ) {
			return new \WP_Error( 'relay_not_supported', __( 'This provider is called directly from the browser.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		if ( '' === $key ) {
			return new \WP_Error( 'no_key', __( 'No API key stored for this provider.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		if ( ! is_object( $body ) && ! is_array( $body ) ) {
			return new \WP_Error( 'bad_request', __( 'A request body is required.', 'emcp-tools' ), array( 'status' => 400 ) );
		}

		$model = is_object( $body ) ? ( $body->model ?? '' ) : ( $body['model'] ?? '' );
		$model = is_string( $model ) ? trim( $model ) : '';
		if ( '' === $model ) {
			return new \WP_Error( 'bad_request', __( 'A model is required.', 'emcp-tools' ), array( 'status' => 400 ) );
		}

		// The provider decides which API a model speaks; a mismatch would only
		// earn a format error upstream, so refuse it here with a clear message.
		$expected = self::api_kind_for( $cfg, $model );
		if ( 'unsupported' === $expected ) {
			return new \WP_Error( 'unsupported_model', self::unsupported_reason( $cfg, $model ), array( 'status' => 400 ) );
		}
		if ( $kind !== $expected ) {
			return new \WP_Error(
				'wrong_api',
				/* translators: 1: model id, 2: API kind. */
				sprintf( __( 'Model %1$s uses the %2$s API on this provider.', 'emcp-tools' ), $model, $expected ),
				array( 'status' => 400 )
			);
		}

		$url = self::endpoint_for( $cfg, $kind );
		if ( 0 !== strpos( $url, 'https://' ) ) {
			return new \WP_Error( 'relay_not_supported', __( 'This provider has no secure endpoint for that API.', 'emcp-tools' ), array( 'status' => 400 ) );
		}

		return array(
			'url'  => $url,
			'args' => array(
				'method'             => 'POST',
				'timeout'            => self::TIMEOUT,
				'redirection'        => 0,
				'sslverify'          => true,
				'reject_unsafe_urls' => true,
				'decompress'         => false,
				'headers'            => self::headers_for( $cfg, $kind, $key, self::sanitize_session( $session ) ),
				'body'               => (string) wp_json_encode( $body ),
			),
		);
	}

	/**
	 * Decides from the first bytes whether the provider is streaming.
	 *
	 * @since 3.18.0
	 * @param string $head Response bytes received so far.
	 * @return string 'sse' (stream it), 'error' (buffer it), 'wait' (need more bytes).
	 */
	public static function classify_start( string $head ): string {
		$trimmed = ltrim( $head );
		if ( '' === $trimmed ) {
			return 'wait';
		}
		foreach ( array( 'data:', 'event:', 'id:', 'retry:', ':' ) as $prefix ) {
			if ( 0 === strpos( $trimmed, $prefix ) ) {
				return 'sse';
			}
			// A prefix split across chunks: wait for the rest.
			if ( strlen( $trimmed ) < strlen( $prefix ) && 0 === strpos( $prefix, $trimmed ) ) {
				return 'wait';
			}
		}
		return 'error';
	}

	/**
	 * REST callback: forward one chat request and stream the answer back.
	 *
	 * Reads the raw JSON body (not the parsed params) so empty JSON objects in
	 * tool schemas stay objects instead of turning into arrays.
	 *
	 * @since 3.18.0
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error|null Null once a stream has been sent.
	 */
	public static function handle( \WP_REST_Request $request ) {
		$payload = json_decode( (string) $request->get_body() );
		if ( ! is_object( $payload ) ) {
			return new \WP_Error( 'bad_request', __( 'Invalid request.', 'emcp-tools' ), array( 'status' => 400 ) );
		}

		$provider = is_string( $payload->provider ?? null ) ? sanitize_key( $payload->provider ) : '';
		$kind     = is_string( $payload->api ?? null ) ? sanitize_key( $payload->api ) : '';
		$session  = is_string( $payload->session ?? null ) ? $payload->session : '';
		$body     = $payload->body ?? null;

		$built = self::build_request( $provider, $kind, $body, EMCP_Tools_AI_Chat_Provider::get_key( $provider ), $session );
		if ( is_wp_error( $built ) ) {
			return $built;
		}

		// Each relayed reply holds a PHP worker for up to TIMEOUT seconds, so a
		// user gets a small number of them at once.
		$user_id = (int) get_current_user_id();
		$token   = self::acquire_slot( $user_id );
		if ( '' === $token ) {
			return new \WP_Error(
				'relay_busy',
				/* translators: %d: number of concurrent replies allowed. */
				sprintf( __( 'You already have %d AI Chat replies streaming. Wait for one to finish, then try again.', 'emcp-tools' ), self::MAX_STREAMS ),
				array( 'status' => 429 )
			);
		}
		$release = static function () use ( $user_id, $token ): void {
			self::release_slot( $user_id, $token );
		};
		// The stream ends in exit, which skips finally; the shutdown handler
		// still runs then. Releasing twice is harmless.
		register_shutdown_function( $release );
		try {
			return self::forward( $built['url'], $built['args'] );
		} finally {
			$release();
		}
	}

	/**
	 * Transient key holding a user's open relay slots.
	 *
	 * @param int $user_id User.
	 * @return string
	 */
	private static function slots_key( int $user_id ): string {
		return 'emcp_ai_relay_slots_' . $user_id;
	}

	/**
	 * Live (unexpired) slots for a user: token => expiry timestamp.
	 *
	 * @param int $user_id User.
	 * @return array<string,int>
	 */
	private static function live_slots( int $user_id ): array {
		$slots = get_transient( self::slots_key( $user_id ) );
		$slots = is_array( $slots ) ? $slots : array();
		$now   = time();
		return array_filter(
			$slots,
			static function ( $expires ) use ( $now ): bool {
				return (int) $expires > $now;
			}
		);
	}

	/**
	 * Claims one relay slot for a user.
	 *
	 * Best effort, not atomic: it bounds a user's own parallel tabs, it is not
	 * a security boundary (the route is already admin-only). Stale slots expire
	 * on their own after the request timeout.
	 *
	 * @since 3.18.0
	 * @param int $user_id User.
	 * @return string Slot token, or '' when the user is at the limit.
	 */
	public static function acquire_slot( int $user_id ): string {
		$slots = self::live_slots( $user_id );
		if ( count( $slots ) >= self::MAX_STREAMS ) {
			return '';
		}
		$token           = bin2hex( random_bytes( 8 ) );
		$slots[ $token ] = time() + self::SLOT_TTL;
		set_transient( self::slots_key( $user_id ), $slots, self::SLOT_TTL );
		return $token;
	}

	/**
	 * Frees a relay slot. Safe to call more than once.
	 *
	 * @since 3.18.0
	 * @param int    $user_id User.
	 * @param string $token   Slot token.
	 */
	public static function release_slot( int $user_id, string $token ): void {
		$slots = self::live_slots( $user_id );
		if ( ! isset( $slots[ $token ] ) ) {
			return;
		}
		unset( $slots[ $token ] );
		if ( empty( $slots ) ) {
			delete_transient( self::slots_key( $user_id ) );
			return;
		}
		set_transient( self::slots_key( $user_id ), $slots, self::SLOT_TTL );
	}

	/**
	 * An SSE `error` event the chat adapters turn into a visible error.
	 *
	 * Starts with a blank line so a provider event cut off mid-line is closed
	 * first and cannot swallow this one.
	 *
	 * @since 3.18.0
	 * @param string $message Error text.
	 * @return string
	 */
	public static function error_event( string $message ): string {
		$data = array(
			'type'  => 'error',
			'error' => array(
				'type'    => 'relay_error',
				'message' => $message,
			),
		);
		return "\n\nevent: error\ndata: " . wp_json_encode( $data ) . "\n\n";
	}

	/**
	 * Why a stream that already started did not finish cleanly, or ''.
	 *
	 * @since 3.18.0
	 * @param array|\WP_Error $response Transport result.
	 * @return string
	 */
	public static function stream_failure( $response ): string {
		if ( is_wp_error( $response ) ) {
			/* translators: %s: transport error. */
			return sprintf( __( 'The connection to the provider broke off before the reply finished: %s', 'emcp-tools' ), $response->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $response );
		if ( $code < 200 || $code >= 300 ) {
			/* translators: %d: HTTP status code. */
			return sprintf( __( 'The provider returned HTTP %d.', 'emcp-tools' ), $code );
		}
		return '';
	}

	/**
	 * Sends the request and relays the reply: a 2xx SSE stream is written
	 * through as it arrives; anything else (an error body) is returned as JSON
	 * with the provider's status code. A stream that breaks after it started
	 * ends with an SSE `error` event, never a clean-looking end.
	 *
	 * @since 3.18.0
	 * @param string $url  Endpoint.
	 * @param array  $args HTTP args.
	 * @return \WP_REST_Response|\WP_Error|null
	 */
	public static function forward( string $url, array $args ) {
		$emitter  = self::$emitter ? self::$emitter : self::default_emitter();
		$mode     = '';
		$head     = '';
		$on_chunk = static function ( string $data, int $status = 0 ) use ( &$mode, &$head, $emitter ): void {
			if ( 'stream' === $mode ) {
				$emitter->write( $data );
				return;
			}
			if ( 'buffer' === $mode ) {
				return;
			}
			$head .= $data;
			// A known non-2xx status is an error even when the body looks like SSE.
			if ( $status > 0 && ( $status < 200 || $status >= 300 ) ) {
				$mode = 'buffer';
				return;
			}
			$class = self::classify_start( $head );
			if ( 'sse' === $class ) {
				$mode = 'stream';
				$emitter->start();
				$emitter->write( $head );
				$head = '';
			} elseif ( 'error' === $class ) {
				$mode = 'buffer';
			}
		};

		if ( function_exists( 'set_time_limit' ) ) {
			@set_time_limit( self::TIMEOUT + 30 ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}

		$transport = self::$transport ? self::$transport : array( __CLASS__, 'default_transport' );
		$response  = call_user_func( $transport, $url, $args, $on_chunk );

		if ( 'stream' === $mode ) {
			if ( '' !== $head ) {
				$emitter->write( $head );
			}
			// Timeout, dropped connection, or a status only known at the end.
			$failure = self::stream_failure( $response );
			if ( '' !== $failure ) {
				$emitter->write( self::error_event( $failure ) );
			}
			$emitter->finish();
			return null;
		}

		if ( is_wp_error( $response ) ) {
			return new \WP_Error( 'relay_failed', $response->get_error_message(), array( 'status' => 502 ) );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = (string) wp_remote_retrieve_body( $response );
		$json = json_decode( $raw, true );
		$ok   = $code >= 200 && $code < 300;

		// A stream that never came through the chunk hook (another transport):
		// hand the whole body over in one go; the browser parses it the same way.
		if ( $ok && 'sse' === self::classify_start( $raw ) ) {
			$emitter->start();
			$emitter->write( $raw );
			$emitter->finish();
			return null;
		}

		// The relay always asks for a stream; a plain 2xx body is not a reply
		// the chat can use.
		if ( $ok ) {
			return new \WP_Error( 'not_streamed', __( 'The provider did not stream a reply.', 'emcp-tools' ), array( 'status' => 502 ) );
		}

		if ( ! is_array( $json ) ) {
			$json = array(
				'error' => array(
					/* translators: %d: HTTP status code. */
					'message' => sprintf( __( 'The provider returned HTTP %d.', 'emcp-tools' ), $code ),
				),
			);
		}
		$status = ( $code >= 400 && $code < 600 ) ? $code : 502;
		return new \WP_REST_Response( $json, $status );
	}

	/**
	 * Real transport: the WordPress HTTP API, with each received chunk handed to
	 * `$on_chunk` through the Requests progress hook, together with the HTTP
	 * status read from the cURL handle (0 when unknown, e.g. without cURL).
	 *
	 * @since 3.18.0
	 * @param string   $url      Endpoint.
	 * @param array    $args     HTTP args.
	 * @param callable $on_chunk Receives ( string $chunk, int $status ).
	 * @return array|\WP_Error
	 */
	public static function default_transport( string $url, array $args, callable $on_chunk ) {
		$handle  = null;
		$capture = static function ( $h ) use ( &$handle ): void {
			$handle = $h;
		};
		$hook    = static function ( $data ) use ( $on_chunk, &$handle ): void {
			$status = 0;
			if ( null !== $handle && function_exists( 'curl_getinfo' ) ) {
				$status = (int) curl_getinfo( $handle, CURLINFO_RESPONSE_CODE );
			}
			$on_chunk( (string) $data, $status );
		};
		add_action( 'http_api_curl', $capture, 10, 1 );
		add_action( 'requests-request.progress', $hook, 10, 1 );
		try {
			$response = wp_remote_request( $url, $args );
		} finally {
			remove_action( 'requests-request.progress', $hook, 10 );
			remove_action( 'http_api_curl', $capture, 10 );
		}
		return $response;
	}

	/**
	 * Writes the stream to the browser: SSE headers, no buffering, flush per chunk.
	 *
	 * @return object
	 */
	private static function default_emitter() {
		return new class() {
			/** @var bool */
			private $started = false;

			public function start(): void {
				if ( $this->started ) {
					return;
				}
				$this->started = true;
				// Bounded: a buffer that refuses removal must not spin forever.
				for ( $i = ob_get_level(); $i > 0; $i-- ) {
					if ( ! @ob_end_clean() ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
						break;
					}
				}
				if ( ! headers_sent() ) {
					status_header( 200 );
					nocache_headers();
					header( 'Content-Type: text/event-stream; charset=utf-8' );
					header( 'X-Accel-Buffering: no' );
				}
			}

			public function write( string $data ): void {
				echo $data; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- raw SSE bytes from the provider.
				flush();
			}

			public function finish(): void {
				exit;
			}
		};
	}
}
