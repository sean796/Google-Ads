<?php
/**
 * REST routes for DataForSEO (mirrors Node /api/mcp and /api/dataforseo paths).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Dataforseo_Route_Handlers {

	const REST_NAMESPACE = 'neo-pulse-app/v1';

	public static function register(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_rest_routes' ) );
	}

	public static function register_rest_routes(): void {
		register_rest_route(
			self::REST_NAMESPACE,
			'/mcp/(?P<tool>DataForSEO_[a-zA-Z0-9_]+)',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'handle_mcp_post' ),
				'permission_callback' => array( __CLASS__, 'can_access' ),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/mcp/DataForSEO_serp_dump_download/(?P<filename>[a-zA-Z0-9._-]+)',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'handle_serp_dump_download' ),
				'permission_callback' => array( __CLASS__, 'can_access' ),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/dataforseo/serp-dump/(?P<filename>[a-zA-Z0-9._-]+)',
			array(
				'methods'             => WP_REST_Server::READABLE,
				'callback'            => array( __CLASS__, 'handle_serp_dump_download' ),
				'permission_callback' => array( __CLASS__, 'can_access' ),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/dataforseo/google-images',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'handle_google_images' ),
				'permission_callback' => array( __CLASS__, 'can_access' ),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/dataforseo/llm-responses-live',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'handle_llm_responses_live' ),
				'permission_callback' => array( __CLASS__, 'can_access' ),
			)
		);

		$competitor_routes = array(
			'/dataforseo/competitor-research'              => 'handle_competitor_research',
			'/dataforseo/competitor-research/manual-domain' => 'handle_competitor_manual_domain',
			'/dataforseo/seed-ranked-keywords'             => 'handle_seed_ranked_keywords',
		);
		foreach ( $competitor_routes as $path => $callback ) {
			register_rest_route(
				self::REST_NAMESPACE,
				$path,
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( __CLASS__, $callback ),
					'permission_callback' => array( __CLASS__, 'can_access' ),
				)
			);
		}
	}

	/**
	 * @param WP_REST_Request $request
	 */
	public static function can_access( WP_REST_Request $request ): bool {
		unset( $request );
		return true;
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_mcp_post( WP_REST_Request $request ) {
		$tool = (string) $request->get_param( 'tool' );
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}

		if ( ! Neo_Pulse_App_Dataforseo_Mcp_Router::is_supported( $tool ) ) {
			return new WP_Error( 'neo-pulse_dfs_tool', 'Unknown DataForSEO MCP tool.', array( 'status' => 404 ) );
		}

		$result = Neo_Pulse_App_Dataforseo_Mcp_Router::dispatch( $tool, $body );
		if ( is_wp_error( $result ) ) {
			if ( $tool === 'DataForSEO_llm_responses_live' ) {
				return new WP_REST_Response(
					array(
						'skipped' => true,
						'reason'  => 'dfs_llm_unavailable',
						'tool'    => $tool,
						'tasks'   => array(),
					),
					200
				);
			}
			$status = 500;
			$data   = $result->get_error_data();
			if ( is_array( $data ) && isset( $data['status'] ) ) {
				$status = (int) $data['status'];
			}
			return new WP_REST_Response(
				array(
					'error'   => $result->get_error_message(),
					'tool'    => $tool,
					'details' => $data,
				),
				$status
			);
		}

		return new WP_REST_Response( $result, 200 );
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_serp_dump_download( WP_REST_Request $request ) {
		$filename = (string) $request->get_param( 'filename' );
		if ( ! Neo_Pulse_App_Dataforseo_Serp_Dumps::is_safe_filename( $filename ) ) {
			return new WP_Error( 'neo-pulse_dfs_dump', 'Invalid filename', array( 'status' => 400 ) );
		}

		$data = Neo_Pulse_App_Dataforseo_Serp_Dumps::read( $filename );
		if ( $data === null ) {
			return new WP_Error( 'neo-pulse_dfs_dump', 'File not found', array( 'status' => 404 ) );
		}

		$response = new WP_REST_Response( $data, 200 );
		$response->header( 'Content-Type', 'application/json; charset=utf-8' );
		$response->header( 'Content-Disposition', 'attachment; filename="' . $filename . '"' );
		return $response;
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_google_images( WP_REST_Request $request ) {
		$body    = $request->get_json_params();
		$keyword = is_array( $body ) && isset( $body['keyword'] ) ? (string) $body['keyword'] : '';
		$options = is_array( $body ) ? $body : array();

		$result = Neo_Pulse_App_Dataforseo_Google_Images::fetch( $keyword, $options );
		if ( is_wp_error( $result ) ) {
			return new WP_REST_Response(
				array( 'error' => $result->get_error_message() ),
				502
			);
		}

		return new WP_REST_Response( $result, 200 );
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_llm_responses_live( WP_REST_Request $request ) {
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}
		$result = self::handle_llm_responses_live_body( $body );
		if ( isset( $result['error'] ) && ! isset( $result['tasks'] ) ) {
			return new WP_REST_Response( $result, 502 );
		}
		return new WP_REST_Response( $result, 200 );
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array<string,mixed>
	 */
	public static function handle_llm_responses_live_body( array $body ): array {
		$result = Neo_Pulse_App_Dataforseo_Mcp_Router::run_llm_responses_live( $body );
		if ( is_wp_error( $result ) ) {
			return array( 'error' => $result->get_error_message() );
		}
		return is_array( $result ) ? $result : array( 'result' => $result );
	}

	/**
	 * @param string              $tool MCP tool name.
	 * @param array<string,mixed> $body Request body.
	 * @return array<string,mixed>
	 */
	public static function handle_mcp_tool( string $tool, array $body ): array {
		$res = self::handle_mcp_tool_with_status( $tool, $body );
		return $res['data'];
	}

	/**
	 * @param string              $tool MCP tool name.
	 * @param array<string,mixed> $body Request body.
	 * @return array{status:int,data:array<string,mixed>}
	 */
	public static function handle_mcp_tool_with_status( string $tool, array $body ): array {
		if ( ! Neo_Pulse_App_Dataforseo_Mcp_Router::is_supported( $tool ) ) {
			return array(
				'status' => 404,
				'data'   => array( 'error' => 'Unknown DataForSEO MCP tool.', 'tool' => $tool ),
			);
		}
		$result = Neo_Pulse_App_Dataforseo_Mcp_Router::dispatch( $tool, $body );
		if ( is_wp_error( $result ) ) {
			if ( $tool === 'DataForSEO_llm_responses_live' ) {
				return array(
					'status' => 200,
					'data'   => array(
						'skipped' => true,
						'reason'  => 'dfs_llm_unavailable',
						'tool'    => $tool,
						'tasks'   => array(),
					),
				);
			}
			$status = 500;
			$data   = $result->get_error_data();
			if ( is_array( $data ) && isset( $data['status'] ) ) {
				$status = (int) $data['status'];
			} elseif ( is_array( $data ) && isset( $data['status_code'] ) ) {
				$code = (int) $data['status_code'];
				if ( $code === 40200 || $code === 40210 ) {
					$status = 402;
				} elseif ( $code >= 40000 && $code < 50000 ) {
					return array(
						'status' => 200,
						'data'   => array(
							'skipped' => true,
							'reason'  => 'dfs_task_skipped',
							'tool'    => $tool,
							'tasks'   => array(),
						),
					);
				}
			}
			return array(
				'status' => $status,
				'data'   => array(
					'error'   => $result->get_error_message(),
					'tool'    => $tool,
					'details' => $data,
				),
			);
		}
		return array(
			'status' => 200,
			'data'   => is_array( $result ) ? $result : array( 'result' => $result ),
		);
	}

	public static function send_serp_dump_file( string $filename ): void {
		if ( ! Neo_Pulse_App_Dataforseo_Serp_Dumps::is_safe_filename( $filename ) ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => 'Invalid filename' ), 400 );
			return;
		}
		$data = Neo_Pulse_App_Dataforseo_Serp_Dumps::read( $filename );
		if ( $data === null ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => 'File not found' ), 404 );
			return;
		}
		status_header( 200 );
		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename="' . $filename . '"' );
		echo wp_json_encode( $data );
	}

	/**
	 * @param array<string,mixed> $body Request body.
	 * @return array<string,mixed>
	 */
	public static function handle_google_images_body( array $body ): array {
		$keyword = isset( $body['keyword'] ) ? (string) $body['keyword'] : '';
		$result  = Neo_Pulse_App_Dataforseo_Google_Images::fetch( $keyword, $body );
		if ( is_wp_error( $result ) ) {
			return array( 'error' => $result->get_error_message() );
		}
		return is_array( $result ) ? $result : array();
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response
	 */
	public static function handle_competitor_research( WP_REST_Request $request ) {
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}
		$result = self::run_competitor_research( $body );
		return new WP_REST_Response( $result['data'], $result['status'] );
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response
	 */
	public static function handle_competitor_manual_domain( WP_REST_Request $request ) {
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}
		$result = self::run_competitor_manual_domain( $body );
		return new WP_REST_Response( $result['data'], $result['status'] );
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response
	 */
	public static function handle_seed_ranked_keywords( WP_REST_Request $request ) {
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}
		$result = self::run_seed_ranked_keywords( $body );
		return new WP_REST_Response( $result['data'], $result['status'] );
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{status:int,data:array<string,mixed>}
	 */
	public static function run_competitor_research( array $body ): array {
		if ( ! Neo_Pulse_App_Dataforseo_Client::has_credentials() ) {
			return array(
				'status' => 400,
				'data'   => array(
					'error' => 'DATAFORSEO_API_LOGIN / DATAFORSEO_API_PASSWORD are not set on the server',
				),
			);
		}
		$site_url = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		if ( trim( $site_url ) === '' ) {
			return array( 'status' => 400, 'data' => array( 'error' => 'siteUrl is required' ) );
		}
		try {
			$opts = array(
				'siteUrl'               => $site_url,
				'displayLimit'          => $body['displayLimit'] ?? null,
				'portfolioBlockedHosts' => $body['portfolioBlockedHosts'] ?? null,
			);
			if ( isset( $body['enrichmentLimit'] ) ) {
				$opts['enrichmentCap'] = $body['enrichmentLimit'];
			}
			return array(
				'status' => 200,
				'data'   => Neo_Pulse_App_Dataforseo_Organic_Competitors::run( $opts ),
			);
		} catch ( Exception $e ) {
			return array( 'status' => 502, 'data' => array( 'error' => $e->getMessage() ) );
		}
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{status:int,data:array<string,mixed>}
	 */
	public static function run_competitor_manual_domain( array $body ): array {
		if ( ! Neo_Pulse_App_Dataforseo_Client::has_credentials() ) {
			return array(
				'status' => 400,
				'data'   => array(
					'error' => 'DATAFORSEO_API_LOGIN / DATAFORSEO_API_PASSWORD are not set on the server',
				),
			);
		}
		$domain = isset( $body['domain'] ) ? trim( (string) $body['domain'] ) : '';
		if ( $domain === '' ) {
			return array( 'status' => 400, 'data' => array( 'error' => 'domain is required' ) );
		}
		try {
			$result = Neo_Pulse_App_Dataforseo_Organic_Competitors::run_manual_domain(
				array(
					'siteUrl' => isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '',
					'domain'  => $domain,
				)
			);
			if ( empty( $result['row'] ) ) {
				$msg = ! empty( $result['errors'][0]['message'] )
					? (string) $result['errors'][0]['message']
					: 'Could not load domain from DataForSEO';
				return array(
					'status' => 422,
					'data'   => array(
						'error'  => $msg,
						'errors' => $result['errors'] ?? array(),
					),
				);
			}
			return array(
				'status' => 200,
				'data'   => array(
					'row'              => $result['row'],
					'enrichment'       => $result['enrichment'],
					'domainOrganicCsv' => $result['domainOrganicCsv'],
					'errors'           => $result['errors'],
				),
			);
		} catch ( Exception $e ) {
			return array( 'status' => 502, 'data' => array( 'error' => $e->getMessage() ) );
		}
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{status:int,data:array<string,mixed>}
	 */
	public static function run_seed_ranked_keywords( array $body ): array {
		if ( ! Neo_Pulse_App_Dataforseo_Client::has_credentials() ) {
			return array(
				'status' => 400,
				'data'   => array(
					'error' => 'DATAFORSEO_API_LOGIN / DATAFORSEO_API_PASSWORD are not set on the server',
				),
			);
		}
		$site_url = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		if ( trim( $site_url ) === '' ) {
			return array( 'status' => 400, 'data' => array( 'error' => 'siteUrl is required' ) );
		}
		try {
			return array(
				'status' => 200,
				'data'   => Neo_Pulse_App_Dataforseo_Organic_Competitors::run_seed_ranked_keywords_only( $site_url ),
			);
		} catch ( Exception $e ) {
			return array( 'status' => 502, 'data' => array( 'error' => $e->getMessage() ) );
		}
	}

	/**
	 * @param string              $subpath Route after dataforseo/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( $subpath === 'competitor-research' && $method === 'POST' ) {
			$result = self::run_competitor_research( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['data'], $result['status'] );
			return;
		}
		if ( $subpath === 'competitor-research/manual-domain' && $method === 'POST' ) {
			$result = self::run_competitor_manual_domain( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['data'], $result['status'] );
			return;
		}
		if ( $subpath === 'seed-ranked-keywords' && $method === 'POST' ) {
			$result = self::run_seed_ranked_keywords( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['data'], $result['status'] );
			return;
		}
		if ( $subpath === 'google-images' && $method === 'POST' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( self::handle_google_images_body( $body ), 200 );
			return;
		}
		if ( $subpath === 'llm-responses-live' && $method === 'POST' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( self::handle_llm_responses_live_body( $body ), 200 );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'error'  => 'Not found',
				'path'   => 'dataforseo/' . $subpath,
				'method' => $method,
			),
			404
		);
	}
}
