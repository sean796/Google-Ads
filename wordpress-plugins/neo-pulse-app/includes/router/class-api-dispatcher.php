<?php
/**
 * Early /api/* dispatcher (Node-compatible paths, no wp-json prefix change).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Api_Dispatcher {

	public static function init(): void {
		add_filter( 'redirect_canonical', array( __CLASS__, 'skip_api_redirect' ), 10, 2 );
		add_action( 'init', array( __CLASS__, 'register_rewrites' ) );
		add_action( 'init', array( __CLASS__, 'maybe_dispatch_early' ), 0 );
		add_filter( 'query_vars', array( __CLASS__, 'query_vars' ) );
		add_action( 'parse_request', array( __CLASS__, 'maybe_dispatch' ), 0 );
	}

	/**
	 * WordPress adds trailing slashes to /api/* and breaks the headless dispatcher.
	 *
	 * @param string|false $redirect_url  Canonical redirect target.
	 * @param string       $requested_url Original request URL.
	 * @return string|false
	 */
	public static function skip_api_redirect( $redirect_url, string $requested_url ) {
		$path = (string) parse_url( $requested_url, PHP_URL_PATH );
		if ( $path === '/api' || str_starts_with( $path, '/api/' ) ) {
			return false;
		}
		return $redirect_url;
	}

	public static function maybe_dispatch_early(): void {
		$route = self::resolve_route_from_request();
		if ( $route === null ) {
			return;
		}
		while ( ob_get_level() > 0 ) {
			ob_end_clean();
		}
		self::dispatch( $route );
		exit;
	}

	public static function register_rewrites(): void {
		add_rewrite_rule( '^api/(.*)?', 'index.php?neo-pulse_api_route=$matches[1]', 'top' );
	}

	/**
	 * @param string[] $vars Query vars.
	 * @return string[]
	 */
	public static function query_vars( $vars ) {
		$vars[] = 'neo-pulse_api_route';
		return $vars;
	}

	/**
	 * @param WP $wp WordPress environment.
	 */
	public static function maybe_dispatch( $wp ): void {
		unset( $wp );
		$route = self::resolve_route();
		if ( $route === null ) {
			return;
		}
		while ( ob_get_level() > 0 ) {
			ob_end_clean();
		}
		self::dispatch( $route );
		exit;
	}

	/**
	 * @return string|null Route after /api/ without leading slash.
	 */
	private static function resolve_route(): ?string {
		$route = self::resolve_route_from_request();
		if ( $route !== null ) {
			return $route;
		}
		$qv = get_query_var( 'neo-pulse_api_route', null );
		if ( is_string( $qv ) && $qv !== '' ) {
			return trim( $qv, '/' );
		}
		return null;
	}

	public static function resolve_route_from_request(): ?string {
		$uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
		$path = (string) parse_url( $uri, PHP_URL_PATH );
		if ( preg_match( '#^/api/(.+)$#', $path, $m ) ) {
			return trim( $m[1], '/' );
		}
		return null;
	}

	/**
	 * @param string $route Path after api/.
	 */
	public static function dispatch( string $route ): void {
		$method = isset( $_SERVER['REQUEST_METHOD'] ) ? strtoupper( (string) $_SERVER['REQUEST_METHOD'] ) : 'GET';
		if ( $method === 'OPTIONS' ) {
			self::apply_cors_headers();
			status_header( 204 );
			exit;
		}

		$body = self::read_json_body();

		if ( preg_match( '#^wordpress/(bulk-update-overview-seo|get-site-inventory-bulk|get-site-post-inventory)#', $route ) ) {
			@set_time_limit( 300 );
		}

		if ( preg_match( '#^mcp/DataForSEO_#', $route ) && $method === 'POST' ) {
			@set_time_limit( 300 );
		}

		if ( preg_match( '#^wordpress/([a-z0-9-]+)$#i', $route, $m ) ) {
			self::send_handler_result( Neo_Pulse_App_Wp_Route_Handlers::handle( $m[1], $method, $body ) );
			return;
		}

		if ( 0 === strpos( $route, 'gsc/' ) ) {
			Neo_Pulse_App_Gsc_Route_Handlers::dispatch_http( substr( $route, 4 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'ga/' ) ) {
			Neo_Pulse_App_Ga_Route_Handlers::dispatch_http( substr( $route, 3 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'organic-dashboard/' ) ) {
			@set_time_limit( 180 );
			Neo_Pulse_App_Organic_Dashboard_Route_Handlers::dispatch_http( substr( $route, 18 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'gmb/' ) ) {
			Neo_Pulse_App_Gmb_Route_Handlers::dispatch_http( substr( $route, 4 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'google-ads/' ) ) {
			Neo_Pulse_App_Google_Ads_Route_Handlers::dispatch_http( substr( $route, 11 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'google-mcp/' ) ) {
			Neo_Pulse_App_Google_Mcp_Route_Handlers::dispatch_http( substr( $route, 11 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'overview/' ) ) {
			Neo_Pulse_App_Overview_Route_Handlers::dispatch_http( substr( $route, 9 ), $method, $body );
			return;
		}

		if ( preg_match( '#^mcp/(DataForSEO_[a-zA-Z0-9_]+)$#', $route, $m ) && $method === 'POST' ) {
			self::run_with_dataforseo_request_credentials(
				$body,
				function () use ( $m, $body ) {
					self::send_json( Neo_Pulse_App_Dataforseo_Route_Handlers::handle_mcp_tool( $m[1], $body ) );
				}
			);
			return;
		}

		if ( preg_match( '#^mcp/DataForSEO_serp_dump_download/([a-zA-Z0-9._-]+)$#', $route, $m ) && $method === 'GET' ) {
			Neo_Pulse_App_Dataforseo_Route_Handlers::send_serp_dump_file( $m[1] );
			return;
		}

		if ( preg_match( '#^dataforseo/serp-dump/([a-zA-Z0-9._-]+)$#', $route, $m ) && $method === 'GET' ) {
			Neo_Pulse_App_Dataforseo_Route_Handlers::send_serp_dump_file( $m[1] );
			return;
		}

		if ( 0 === strpos( $route, 'dataforseo/' ) ) {
			self::run_with_dataforseo_request_credentials(
				$body,
				function () use ( $route, $method, $body ) {
					Neo_Pulse_App_Dataforseo_Route_Handlers::dispatch_http( substr( $route, 11 ), $method, $body );
				}
			);
			return;
		}

		if ( 0 === strpos( $route, 'proposal/' ) ) {
			Neo_Pulse_App_Proposal_Route_Handlers::dispatch_http( substr( $route, 9 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'seo/' ) ) {
			Neo_Pulse_App_Seo_Route_Handlers::dispatch_http( substr( $route, 4 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'vertical-benchmarks/' ) ) {
			Neo_Pulse_App_Vertical_Benchmark_Route_Handlers::dispatch_http( substr( $route, 20 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'site-scraper/' ) ) {
			Neo_Pulse_App_Site_Scraper_Route_Handlers::dispatch_http( substr( $route, 13 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'knowledge-model/' ) ) {
			Neo_Pulse_App_Knowledge_Model_Route_Handlers::dispatch_http( substr( $route, 16 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'semrush/' ) ) {
			Neo_Pulse_App_Semrush_Route_Handlers::dispatch_http( substr( $route, 8 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'images/' ) ) {
			Neo_Pulse_App_Images_Route_Handlers::dispatch_http( substr( $route, 7 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'video/' ) ) {
			@set_time_limit( 300 );
			Neo_Pulse_App_Video_Route_Handlers::dispatch_http( substr( $route, 6 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'elementor/' ) ) {
			@set_time_limit( 180 );
			Neo_Pulse_App_Elementor_Route_Handlers::dispatch_http( substr( $route, 10 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'integrations/' ) ) {
			Neo_Pulse_App_Integrations_Route_Handlers::dispatch_http( substr( $route, 13 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'proposal/' ) ) {
			Neo_Pulse_App_Proposal_Route_Handlers::dispatch_http( substr( $route, 9 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'push/' ) || $route === 'push' ) {
			$push_route = $route === 'push' ? '' : substr( $route, 5 );
			Neo_Pulse_App_Push_Route_Handlers::dispatch_http( $push_route, $method, $body );
			return;
		}

		if ( preg_match( '#^agent-runs/\d+/process$#', $route ) && $method === 'POST' ) {
			@set_time_limit( 900 );
		}

		if ( 0 === strpos( $route, 'agent-runs/' ) || $route === 'agent-runs' ) {
			$agent_runs_route = $route === 'agent-runs' ? '' : substr( $route, 11 );
			Neo_Pulse_App_Agent_Runs_Route_Handlers::dispatch_http( $agent_runs_route, $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'pulse-assist/' ) || $route === 'pulse-assist' ) {
			$assist_route = $route === 'pulse-assist' ? '' : substr( $route, 13 );
			Neo_Pulse_App_Pulse_Assist_Route_Handlers::dispatch_http( $assist_route, $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'internal/emcp/' ) ) {
			@set_time_limit( 180 );
			Neo_Pulse_App_Hub_Internal_Emcp_Route_Handlers::dispatch_http( substr( $route, 14 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'emcp/' ) ) {
			@set_time_limit( 240 );
			Neo_Pulse_App_Emcp_Route_Handlers::dispatch_http( substr( $route, 5 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'auth/' ) ) {
			Neo_Pulse_App_Auth_Route_Handlers::dispatch( substr( $route, 5 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'teams/' ) || $route === 'teams' ) {
			$teams_route = $route === 'teams' ? '' : substr( $route, 6 );
			Neo_Pulse_App_Teams_Route_Handlers::dispatch( $teams_route, $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'manager-cloud-settings/' ) ) {
			Neo_Pulse_App_Manager_Route_Handlers::dispatch_cloud( substr( $route, 23 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'manager-wordpress-properties/' ) ) {
			Neo_Pulse_App_Manager_Route_Handlers::dispatch_properties( substr( $route, 28 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'hosting/' ) || $route === 'hosting' ) {
			$hosting_route = $route === 'hosting' ? '' : substr( $route, 8 );
			Neo_Pulse_App_Hosting_Route_Handlers::dispatch_http( $hosting_route, $method, $body );
			return;
		}

		if ( $route === 'bulk/validate-internal-links' && $method === 'POST' ) {
			Neo_Pulse_App_Bulk_Validate_Links::stream( $body );
			return;
		}

		if ( $route === 'wikipedia/api' && $method === 'GET' ) {
			Neo_Pulse_App_Wikipedia_Proxy::proxy_query();
			return;
		}

		if ( 0 === strpos( $route, 'ollama/' ) ) {
			@set_time_limit( 300 );
			Neo_Pulse_App_Ollama_Route::dispatch_http( substr( $route, 7 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'openrouter/' ) ) {
			@set_time_limit( 300 );
			Neo_Pulse_App_Openrouter_Chat_Completion_Route::dispatch_http( substr( $route, 11 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'proxy/' ) ) {
			Neo_Pulse_App_Url_Text_Proxy::dispatch_http( substr( $route, 6 ), $method, $body );
			return;
		}

		if ( $route === 'entity-maps-image/generate' && $method === 'POST' ) {
			self::send_json( Neo_Pulse_App_Entity_Maps_Image::generate( $body ) );
			return;
		}

		if ( 0 === strpos( $route, 'local-dominator/' ) ) {
			Neo_Pulse_App_Local_Dominator_Route_Handlers::dispatch_http( substr( $route, 16 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'chatgpt-audit/' ) ) {
			Neo_Pulse_App_ChatGpt_Audit_Route_Handlers::dispatch_http( substr( $route, 14 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'browser-automation/' ) ) {
			Neo_Pulse_App_Browser_Automation_Route_Handlers::dispatch_http( substr( $route, 19 ), $method, $body );
			return;
		}

		if ( $route === 'residential-proxy/status' && $method === 'GET' ) {
			Neo_Pulse_App_Browser_Automation_Route_Handlers::dispatch_proxy_status( $method );
			return;
		}

		if ( $route === 'bulk/abort-dataforseo' && $method === 'POST' ) {
			self::send_json( array( 'success' => true, 'aborted' => true ) );
			return;
		}

		if ( 0 === strpos( $route, 'seo/' ) ) {
			Neo_Pulse_App_Seo_Route_Handlers::dispatch_http( substr( $route, 4 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'vertical-benchmarks/' ) ) {
			Neo_Pulse_App_Vertical_Benchmark_Route_Handlers::dispatch_http( substr( $route, 20 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'site-scraper/' ) ) {
			Neo_Pulse_App_Site_Scraper_Route_Handlers::dispatch_http( substr( $route, 13 ), $method, $body );
			return;
		}

		if ( 0 === strpos( $route, 'knowledge-model/' ) ) {
			Neo_Pulse_App_Knowledge_Model_Route_Handlers::dispatch_http( substr( $route, 16 ), $method, $body );
			return;
		}

		self::send_json(
			array(
				'success' => false,
				'error'   => 'Not found',
				'path'    => '/api/' . $route,
				'method'  => $method,
			),
			404
		);
	}

	/**
	 * @return array<string,mixed>
	 */
	private static function read_json_body(): array {
		$raw = file_get_contents( 'php://input' );
		if ( ! is_string( $raw ) || $raw === '' ) {
			return array();
		}
		$data = json_decode( $raw, true );
		return is_array( $data ) ? $data : array();
	}

	/**
	 * @param array<int,mixed> $result status, data, optional content-type.
	 */
	public static function send_handler_result( $result ): void {
		$status = isset( $result[0] ) ? (int) $result[0] : 200;
		$data   = isset( $result[1] ) && is_array( $result[1] ) ? $result[1] : array();
		$type   = isset( $result[2] ) ? (string) $result[2] : 'application/json; charset=utf-8';

		self::send_json( $data, $status, $type );
	}

	/**
	 * @param mixed $data Response body.
	 */
	public static function send_json( $data, int $status = 200, string $content_type = 'application/json; charset=utf-8' ): void {
		while ( ob_get_level() > 0 ) {
			ob_end_clean();
		}
		self::apply_cors_headers();
		status_header( $status );
		header( 'Content-Type: ' . $content_type );
		echo wp_json_encode( $data );
	}

	/**
	 * Dashboard Settings DataForSEO key (header or body) for this request only.
	 *
	 * @param array<string,mixed> $body
	 * @param callable():void     $fn
	 */
	private static function run_with_dataforseo_request_credentials( array $body, callable $fn ): void {
		$dfs_creds = Neo_Pulse_App_Secrets::dataforseo_from_request( $body );
		if ( $dfs_creds['password'] !== '' ) {
			Neo_Pulse_App_Secrets::use_request_dataforseo_credentials( $dfs_creds );
		}
		try {
			$fn();
		} finally {
			Neo_Pulse_App_Secrets::clear_request_dataforseo_credentials();
		}
	}

	private static function apply_cors_headers(): void {
		$origin = isset( $_SERVER['HTTP_ORIGIN'] ) ? trim( (string) wp_unslash( $_SERVER['HTTP_ORIGIN'] ) ) : '';
		if ( $origin === '' ) {
			return;
		}

		$allowed = array(
			'https://neodigital.ca',
			'https://www.neodigital.ca',
			'https://app.neodigital.ca',
			'https://ld.neodigital.ca',
		);

		if ( defined( 'NEO_PULSE_APP_CORS_ORIGINS' ) && is_string( NEO_PULSE_APP_CORS_ORIGINS ) ) {
			foreach ( explode( ',', NEO_PULSE_APP_CORS_ORIGINS ) as $item ) {
				$item = trim( $item );
				if ( $item !== '' ) {
					$allowed[] = $item;
				}
			}
		}

		$host = (string) wp_parse_url( $origin, PHP_URL_HOST );
		$ok   = in_array( $origin, $allowed, true )
			|| ( $host !== '' && ( str_ends_with( $host, '.onrender.com' ) || str_ends_with( $host, '.neodigital.ca' ) ) );

		if ( ! $ok ) {
			return;
		}

		header( 'Access-Control-Allow-Origin: ' . $origin );
		header( 'Vary: Origin' );
		header( 'Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS' );
		header( 'Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, X-DataForSEO-Api-Key' );
		header( 'Access-Control-Allow-Credentials: true' );
	}
}
