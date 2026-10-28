<?php
/**
 * Multi-Site Native NEO Pulse MCP Client for Neo Pulse App.
 *
 * Connects to any client WordPress site's native `/wp-json/neo-mcp/v1/mcp` and
 * `/wp-json/neo-pulse/v1/tools/*` endpoints using Application Password Basic Auth,
 * lists tools, fetches `neo-pulse/*` and `neo-tools/*` dispatcher catalogs, and
 * executes tool calls or multi-step batches server-side.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

final class Neo_Pulse_App_Emcp_Site_Client {

	/**
	 * Normalize a tool name between slash (`neo-pulse/read`), underscore (`neo-pulse_read`),
	 * and hyphen (`neo-pulse-read`) forms based on what the target MCP server exposes.
	 *
	 * @param string            $requested Requested tool name.
	 * @param array<int,string> $available Tool names from tools/list.
	 */
	public static function resolve_tool_name( string $requested, array $available ): string {
		$requested = trim( $requested );
		if ( in_array( $requested, $available, true ) ) {
			return $requested;
		}
		$hyphen = str_replace( array( '/', '_' ), '-', $requested );
		if ( in_array( $hyphen, $available, true ) ) {
			return $hyphen;
		}
		$underscore = str_replace( '/', '_', $requested );
		if ( in_array( $underscore, $available, true ) ) {
			return $underscore;
		}
		if ( false !== strpos( $requested, '-' ) && false === strpos( $requested, '/' ) ) {
			$prefixes = array( 'neo-pulse-', 'neo-tools-', 'neo-mcp-', 'core-' );
			foreach ( $prefixes as $prefix ) {
				if ( 0 === strpos( $requested, $prefix ) ) {
					$slash = substr( $prefix, 0, -1 ) . '/' . substr( $requested, strlen( $prefix ) );
					if ( in_array( $slash, $available, true ) ) {
						return $slash;
					}
					$under = substr( $prefix, 0, -1 ) . '_' . substr( $requested, strlen( $prefix ) );
					if ( in_array( $under, $available, true ) ) {
						return $under;
					}
				}
			}
		}
		return $requested;
	}

	/**
	 * Resolve MCP server URL and Authorization header from request payload.
	 *
	 * @param array<string,mixed> $body Request body.
	 * @return array{mcp_url:string,authorization:string,site_url:string}|WP_Error
	 */
	public static function resolve_connection( array $body ) {
		$site_url = isset( $body['siteUrl'] ) ? trim( (string) $body['siteUrl'] ) : '';
		$username = isset( $body['username'] ) ? trim( (string) $body['username'] ) : '';
		$app_pass = isset( $body['appPassword'] ) ? trim( (string) $body['appPassword'] ) : '';
		$auth_hdr = isset( $body['authorization'] ) ? trim( (string) $body['authorization'] ) : '';

		if ( '' === $site_url ) {
			return new WP_Error( 'emcp_missing_site', 'siteUrl is required.', array( 'status' => 400 ) );
		}

		$normalized = rtrim( $site_url, '/' );
		if ( ! preg_match( '#^https?://#i', $normalized ) ) {
			$normalized = 'https://' . $normalized;
		}
		$base_site = (string) preg_replace( '#/wp-json/.*$#i', '', $normalized );
		$mcp_url   = preg_match( '#/wp-json/(mcp|neo-mcp)/#i', $normalized )
			? $normalized
			: $base_site . '/wp-json/neo-mcp/v1/mcp';

		if ( '' === $auth_hdr ) {
			if ( '' === $username || '' === $app_pass ) {
				return new WP_Error( 'emcp_missing_auth', 'username and appPassword are required to connect to the site MCP server.', array( 'status' => 400 ) );
			}
			$auth_hdr = 'Basic ' . base64_encode( $username . ':' . $app_pass );
		}

		return array(
			'site_url'      => $base_site,
			'mcp_url'       => $mcp_url,
			'authorization' => $auth_hdr,
		);
	}

	/**
	 * Extract site root URL from an MCP endpoint URL.
	 */
	private static function site_root_from_mcp_url( string $mcp_url ): string {
		return rtrim( (string) preg_replace( '#/wp-json/.*$#i', '', $mcp_url ), '/' );
	}

	/**
	 * Open an MCP session and return the session ID (or '' for stateless `/wp-json/neo-mcp/v1/mcp`).
	 *
	 * @return string|WP_Error
	 */
	public static function open_session( string $mcp_url, string $authorization ) {
		$init = self::rpc(
			$mcp_url,
			$authorization,
			'initialize',
			array(
				'protocolVersion' => '2024-11-05',
				'capabilities'    => (object) array(),
				'clientInfo'      => array(
					'name'    => 'neo-pulse-native-mcp',
					'version' => '1.0.0',
				),
			),
			1,
			''
		);
		if ( isset( $init['error'] ) ) {
			return new WP_Error( 'emcp_init_failed', (string) $init['error'], array( 'status' => 502 ) );
		}
		$session = (string) ( $init['session'] ?? '' );
		if ( '' !== $session ) {
			self::rpc(
				$mcp_url,
				$authorization,
				'notifications/initialized',
				(object) array(),
				null,
				$session
			);
		}
		return $session;
	}

	/**
	 * Fetch native `neo-pulse/v1/tools/list` tools (`wp_*`) for blog posting, SEO, and page design.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	private static function fetch_native_pulse_tools( string $site_root, string $authorization ): array {
		if ( '' === $site_root ) {
			return array();
		}
		$res = wp_remote_post(
			$site_root . '/wp-json/neo-pulse/v1/tools/list',
			array(
				'timeout' => 30,
				'headers' => array(
					'Authorization' => $authorization,
					'Content-Type'  => 'application/json',
					'Accept'        => 'application/json',
				),
				'body'    => wp_json_encode( (object) array() ),
			)
		);
		if ( is_wp_error( $res ) || (int) wp_remote_retrieve_response_code( $res ) !== 200 ) {
			return array();
		}
		$decoded = json_decode( (string) wp_remote_retrieve_body( $res ), true );
		if ( ! is_array( $decoded ) || empty( $decoded['tools'] ) || ! is_array( $decoded['tools'] ) ) {
			return array();
		}
		$out = array();
		foreach ( $decoded['tools'] as $tool ) {
			if ( ! is_array( $tool ) || empty( $tool['name'] ) ) {
				continue;
			}
			$risk = (string) ( $tool['risk'] ?? 'read' );
			$out[] = array(
				'name'        => (string) $tool['name'],
				'description' => isset( $tool['description'] ) ? (string) $tool['description'] : '',
				'inputSchema' => isset( $tool['inputSchema'] ) && is_array( $tool['inputSchema'] ) ? $tool['inputSchema'] : array( 'type' => 'object' ),
				'annotations' => array(
					'readonly'    => 'read' === $risk,
					'destructive' => 'destructive' === $risk,
					'idempotent'  => 'read' === $risk,
				),
			);
		}
		return $out;
	}

	/**
	 * Execute a native `wp_*` tool via `POST /wp-json/neo-pulse/v1/tools/execute`.
	 *
	 * @param array<string,mixed> $arguments Tool params.
	 * @return array<string,mixed>|WP_Error
	 */
	private static function execute_native_pulse_tool( string $site_root, string $authorization, string $tool, array $arguments ) {
		$params = $arguments;
		if ( ! isset( $params['confirm'] ) ) {
			$params['confirm'] = true;
		}
		$res = wp_remote_post(
			$site_root . '/wp-json/neo-pulse/v1/tools/execute',
			array(
				'timeout' => 180,
				'headers' => array(
					'Authorization' => $authorization,
					'Content-Type'  => 'application/json',
					'Accept'        => 'application/json',
				),
				'body'    => wp_json_encode(
					array(
						'tool'   => $tool,
						'params' => $params,
					)
				),
			)
		);
		if ( is_wp_error( $res ) ) {
			return new WP_Error( 'pulse_tool_failed', $res->get_error_message(), array( 'status' => 502 ) );
		}
		$code    = (int) wp_remote_retrieve_response_code( $res );
		$raw     = (string) wp_remote_retrieve_body( $res );
		$decoded = json_decode( $raw, true );
		if ( $code < 200 || $code >= 300 || ( is_array( $decoded ) && isset( $decoded['ok'] ) && ! $decoded['ok'] ) ) {
			$msg = is_array( $decoded ) && ! empty( $decoded['error'] )
				? (string) $decoded['error']
				: sprintf( 'NEO Pulse tool %s HTTP %d: %s', $tool, $code, substr( $raw, 0, 300 ) );
			return new WP_Error( 'pulse_tool_failed', $msg, array( 'status' => 400 ) );
		}
		return array(
			'tool'      => $tool,
			'operation' => '',
			'data'      => is_array( $decoded ) && array_key_exists( 'data', $decoded ) ? $decoded['data'] : $decoded,
		);
	}

	/**
	 * Fetch `tools/list`, native `wp_*` tools, and dispatcher catalogs (`neo-pulse/*`, `neo-tools/*`).
	 *
	 * @return array<string,mixed>|WP_Error
	 */
	public static function fetch_catalog( string $mcp_url, string $authorization ) {
		$site_root    = self::site_root_from_mcp_url( $mcp_url );
		$native_tools = self::fetch_native_pulse_tools( $site_root, $authorization );

		$session = self::open_session( $mcp_url, $authorization );
		$tools   = array();
		$names   = array();

		if ( ! is_wp_error( $session ) ) {
			$list_res = self::rpc(
				$mcp_url,
				$authorization,
				'tools/list',
				(object) array(),
				2,
				$session
			);
			if ( ! isset( $list_res['error'] ) ) {
				$raw_tools = $list_res['raw']['result']['tools'] ?? array();
				if ( is_array( $raw_tools ) ) {
					foreach ( $raw_tools as $t ) {
						if ( is_array( $t ) && ! empty( $t['name'] ) ) {
							$tools[] = $t;
							$names[] = (string) $t['name'];
						}
					}
				}
			}
		}

		foreach ( $native_tools as $nt ) {
			$n = (string) ( $nt['name'] ?? '' );
			if ( '' !== $n && ! in_array( $n, $names, true ) ) {
				$tools[] = $nt;
				$names[] = $n;
			}
		}

		if ( array() === $tools && is_wp_error( $session ) ) {
			return $session;
		}

		$dispatchers = array(
			'neoPulseRead'  => 'neo-pulse/read',
			'neoPulseWrite' => 'neo-pulse/write',
			'neoToolsRead'  => 'neo-tools/read',
			'neoToolsWrite' => 'neo-tools/write',
		);
		$catalogs    = array();
		$rpc_id      = 3;
		foreach ( $dispatchers as $key => $target_name ) {
			$resolved = self::resolve_tool_name( $target_name, $names );
			if ( ! is_wp_error( $session ) && in_array( $resolved, $names, true ) ) {
				$call = self::rpc(
					$mcp_url,
					$authorization,
					'tools/call',
					array(
						'name'      => $resolved,
						'arguments' => (object) array(),
					),
					$rpc_id++,
					$session
				);
				$catalogs[ $key ] = $call['data'] ?? null;
			} else {
				$catalogs[ $key ] = null;
			}
		}

		return array(
			'mcpUrl'        => $mcp_url,
			'toolCount'     => count( $tools ),
			'tools'         => $tools,
			'neoPulseRead'  => $catalogs['neoPulseRead'],
			'neoPulseWrite' => $catalogs['neoPulseWrite'],
			'neoToolsRead'  => $catalogs['neoToolsRead'],
			'neoToolsWrite' => $catalogs['neoToolsWrite'],
		);
	}

	/**
	 * Execute a single tool or dispatcher operation.
	 *
	 * @param string              $mcp_url       MCP endpoint URL.
	 * @param string              $authorization Authorization header.
	 * @param string              $tool          Tool name (e.g. `neo-pulse/read` or `wp_create_post`).
	 * @param string              $operation     Optional dispatcher operation name.
	 * @param array<string,mixed> $arguments     Tool or operation arguments.
	 * @return array<string,mixed>|WP_Error
	 */
	public static function execute_tool(
		string $mcp_url,
		string $authorization,
		string $tool,
		string $operation = '',
		array $arguments = array()
	) {
		$trimmed_tool = trim( $tool );
		$site_root    = self::site_root_from_mcp_url( $mcp_url );

		if ( 0 === strpos( $trimmed_tool, 'wp_' ) && '' !== $site_root ) {
			return self::execute_native_pulse_tool( $site_root, $authorization, $trimmed_tool, $arguments );
		}

		$session = self::open_session( $mcp_url, $authorization );
		if ( is_wp_error( $session ) ) {
			return $session;
		}

		$list_res  = self::rpc( $mcp_url, $authorization, 'tools/list', (object) array(), 2, $session );
		$raw_tools = $list_res['raw']['result']['tools'] ?? array();
		$names     = array();
		if ( is_array( $raw_tools ) ) {
			foreach ( $raw_tools as $t ) {
				if ( is_array( $t ) && ! empty( $t['name'] ) ) {
					$names[] = (string) $t['name'];
				}
			}
		}

		$resolved_tool = self::resolve_tool_name( $trimmed_tool, $names );
		$payload_args  = '' !== $operation
			? array(
				'operation' => $operation,
				'arguments' => (object) $arguments,
			)
			: ( array() === $arguments ? (object) array() : $arguments );

		$call = self::rpc(
			$mcp_url,
			$authorization,
			'tools/call',
			array(
				'name'      => $resolved_tool,
				'arguments' => $payload_args,
			),
			3,
			$session
		);

		if ( isset( $call['error'] ) ) {
			return new WP_Error( 'emcp_call_failed', (string) $call['error'], array( 'status' => 400 ) );
		}

		return array(
			'tool'      => $resolved_tool,
			'operation' => $operation,
			'data'      => $call['data'],
		);
	}

	/**
	 * Low-level JSON-RPC call over HTTP.
	 *
	 * @param mixed $params
	 * @return array{session:string,raw?:mixed,data?:mixed,error?:string}
	 */
	private static function rpc( string $mcp_url, string $authorization, string $method, $params, ?int $id, string $session ): array {
		$headers = array(
			'Authorization' => $authorization,
			'Content-Type'  => 'application/json',
			'Accept'        => 'application/json, text/event-stream',
		);
		if ( '' !== $session ) {
			$headers['Mcp-Session-Id'] = $session;
		}

		$body = array(
			'jsonrpc' => '2.0',
			'method'  => $method,
			'params'  => $params,
		);
		if ( null !== $id ) {
			$body['id'] = $id;
		}

		$res = wp_remote_post(
			$mcp_url,
			array(
				'timeout' => 120,
				'headers' => $headers,
				'body'    => wp_json_encode( $body ),
			)
		);

		if ( is_wp_error( $res ) ) {
			return array(
				'session' => $session,
				'error'   => $res->get_error_message(),
			);
		}

		$code        = (int) wp_remote_retrieve_response_code( $res );
		$new_session = (string) wp_remote_retrieve_header( $res, 'mcp-session-id' );
		if ( '' === $new_session ) {
			$new_session = $session;
		}

		$raw_text = (string) wp_remote_retrieve_body( $res );
		$parsed   = self::parse_rpc_body( $raw_text );

		if ( $code < 200 || $code >= 300 ) {
			return array(
				'session' => $new_session,
				'error'   => sprintf( 'MCP HTTP %d: %s', $code, substr( $raw_text, 0, 300 ) ),
			);
		}

		if ( is_array( $parsed ) && isset( $parsed['error'] ) ) {
			$err_msg = is_array( $parsed['error'] ) && isset( $parsed['error']['message'] )
				? (string) $parsed['error']['message']
				: (string) wp_json_encode( $parsed['error'] );
			return array(
				'session' => $new_session,
				'error'   => $err_msg,
			);
		}

		return array(
			'session' => $new_session,
			'raw'     => $parsed,
			'data'    => self::extract_tool_payload( $parsed ),
		);
	}

	/**
	 * @param mixed $rpc
	 * @return mixed
	 */
	private static function extract_tool_payload( $rpc ) {
		if ( ! is_array( $rpc ) ) {
			return $rpc;
		}
		if ( isset( $rpc['result']['structuredContent'] ) && is_array( $rpc['result']['structuredContent'] ) ) {
			return $rpc['result']['structuredContent'];
		}
		$content = $rpc['result']['content'] ?? null;
		if ( ! is_array( $content ) ) {
			return $rpc['result'] ?? $rpc;
		}
		$texts = array();
		foreach ( $content as $part ) {
			if ( is_array( $part ) && 'text' === ( $part['type'] ?? '' ) && isset( $part['text'] ) ) {
				$texts[] = (string) $part['text'];
			}
		}
		if ( array() === $texts ) {
			return $rpc['result'] ?? $rpc;
		}
		$joined  = implode( "\n", $texts );
		$decoded = json_decode( $joined, true );
		return null !== $decoded ? $decoded : array( 'text' => $joined );
	}

	/**
	 * @return mixed
	 */
	private static function parse_rpc_body( string $text ) {
		$trim = trim( $text );
		if ( '' === $trim ) {
			return null;
		}
		if ( '{' === $trim[0] ) {
			return json_decode( $trim, true );
		}
		$last = null;
		foreach ( preg_split( '/\r\n|\n/', $trim ) ?: array() as $line ) {
			if ( 0 !== strpos( $line, 'data:' ) ) {
				continue;
			}
			$payload = trim( substr( $line, 5 ) );
			if ( '' === $payload || '[DONE]' === $payload ) {
				continue;
			}
			$last = json_decode( $payload, true );
		}
		return $last;
	}
}
