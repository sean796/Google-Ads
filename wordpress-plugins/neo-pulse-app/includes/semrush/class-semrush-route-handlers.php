<?php
/**
 * REST routes for Semrush (mirrors Node /api/semrush/*).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Semrush_Route_Handlers {

	const REST_NAMESPACE = 'neo-pulse-app/v1';

	public static function register(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_rest_routes' ) );
	}

	public static function register_rest_routes(): void {
		$routes = array(
			'/semrush/bulk-enrichment'                  => array( __CLASS__, 'handle_bulk_enrichment' ),
			'/semrush/overview-json/(?P<filename>[a-zA-Z0-9._-]+)' => array( __CLASS__, 'handle_overview_json' ),
			'/semrush/audit-json/(?P<filename>[a-zA-Z0-9._-]+)'     => array( __CLASS__, 'handle_audit_json' ),
			'/semrush/audit-ai-context'                => array( __CLASS__, 'handle_audit_ai_context' ),
			'/semrush/match-project-for-site'           => array( __CLASS__, 'handle_match_project_for_site' ),
			'/semrush/competitor-research'              => array( __CLASS__, 'handle_competitor_research' ),
			'/semrush/competitor-research/manual-domain' => array( __CLASS__, 'handle_competitor_manual_domain' ),
			'/semrush/site-audit-url'                   => array( __CLASS__, 'handle_site_audit_url' ),
			'/semrush/position-tracking-compare'        => array( __CLASS__, 'handle_position_tracking_compare' ),
		);

		foreach ( $routes as $path => $callback ) {
			$methods = WP_REST_Server::READABLE;
			if ( in_array( $path, array( '/semrush/bulk-enrichment', '/semrush/audit-ai-context', '/semrush/match-project-for-site', '/semrush/competitor-research', '/semrush/competitor-research/manual-domain', '/semrush/site-audit-url', '/semrush/position-tracking-compare' ), true ) ) {
				$methods = WP_REST_Server::CREATABLE;
			}

			register_rest_route(
				self::REST_NAMESPACE,
				$path,
				array(
					'methods'             => $methods,
					'callback'            => $callback,
					'permission_callback' => array( __CLASS__, 'can_access' ),
				)
			);
		}
	}

	/**
	 * @param WP_REST_Request $request
	 */
	public static function can_access( WP_REST_Request $request ): bool {
		return Neo_Pulse_App_Auth_Session::rest_permission( $request );
	}

	/**
	 * @param array<string,mixed> $body JSON body.
	 * @return array<string,mixed>
	 */
	public static function run_bulk_enrichment( array $body ): array {
		$page_url     = isset( $body['pageUrl'] ) ? (string) $body['pageUrl'] : '';
		$seed_keyword = isset( $body['seedKeyword'] ) ? (string) $body['seedKeyword'] : '';
		$database     = ! empty( $body['database'] ) ? (string) $body['database'] : 'us';

		if ( ! Neo_Pulse_App_Semrush_Client::has_api_key() ) {
			$payload = array(
				'skipped' => true,
				'reason'  => 'no_api_key',
			);
		} else {
			try {
				$payload = Neo_Pulse_App_Semrush_Bulk_Enrichment::run(
					array(
						'pageUrl'               => $page_url,
						'seedKeyword'           => $seed_keyword,
						'database'              => $database,
						'portfolioBlockedHosts' => $body['portfolioBlockedHosts'] ?? null,
					)
				);
			} catch ( Exception $e ) {
				$payload = array(
					'skipped'               => false,
					'urlOrganicKeywords'    => array(),
					'phraseRelatedKeywords' => array(),
					'urlOrganicUrls'        => array(),
					'phraseRelatedUrls'     => array(),
					'phraseOrganicUrls'     => array(),
					'externalSemrushUrls'   => array(),
					'keywordOverview'       => null,
					'errors'                => array(
						array(
							'step'    => 'bulk_enrichment',
							'message' => $e->getMessage(),
						),
					),
				);
			}
		}

		$stored                = Neo_Pulse_App_Semrush_Overview_Json::write_overview( $page_url, $seed_keyword, $payload );
		$payload['storedFile'] = $stored;
		return $payload;
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_bulk_enrichment( WP_REST_Request $request ) {
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}
		return new WP_REST_Response( self::run_bulk_enrichment( $body ), 200 );
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_position_tracking_compare( WP_REST_Request $request ) {
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}
		return new WP_REST_Response( Neo_Pulse_App_Semrush_Position_Tracking_Compare::run( $body ), 200 );
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|WP_Error
	 */
	public static function handle_overview_json( WP_REST_Request $request ) {
		$filename = (string) $request->get_param( 'filename' );
		if ( ! Neo_Pulse_App_Semrush_Overview_Json::is_safe_overview_filename( $filename ) ) {
			return new WP_Error( 'neo-pulse_semrush_file', 'Invalid filename', array( 'status' => 400 ) );
		}

		$data = Neo_Pulse_App_Semrush_Overview_Json::read( $filename );
		if ( $data === null ) {
			return new WP_Error( 'neo-pulse_semrush_file', 'File not found', array( 'status' => 404 ) );
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
	public static function handle_audit_json( WP_REST_Request $request ) {
		$filename = (string) $request->get_param( 'filename' );
		if ( ! Neo_Pulse_App_Semrush_Overview_Json::is_safe_audit_filename( $filename ) ) {
			return new WP_Error( 'neo-pulse_semrush_file', 'Invalid filename', array( 'status' => 400 ) );
		}

		$data = Neo_Pulse_App_Semrush_Overview_Json::read( $filename );
		if ( $data === null ) {
			return new WP_Error( 'neo-pulse_semrush_file', 'File not found', array( 'status' => 404 ) );
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
	public static function handle_audit_ai_context( WP_REST_Request $request ) {
		$body     = $request->get_json_params();
		$filename = is_array( $body ) && isset( $body['filename'] ) ? trim( (string) $body['filename'] ) : '';
		$max      = is_array( $body ) && isset( $body['maxChars'] ) && is_numeric( $body['maxChars'] )
			? min( (int) $body['maxChars'], 500000 )
			: 120000;

		if ( $filename === '' || ! Neo_Pulse_App_Semrush_Overview_Json::is_safe_audit_filename( $filename ) ) {
			return new WP_Error( 'neo-pulse_semrush_file', 'Invalid or missing filename', array( 'status' => 400 ) );
		}

		$doc = Neo_Pulse_App_Semrush_Overview_Json::read( $filename );
		if ( $doc === null ) {
			return new WP_Error( 'neo-pulse_semrush_file', 'File not found', array( 'status' => 404 ) );
		}

		return new WP_REST_Response(
			Neo_Pulse_App_Semrush_Overview_Json::compact_audit_context( $doc, $max ),
			200
		);
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response
	 */
	public static function handle_match_project_for_site( WP_REST_Request $request ) {
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}
		$result = self::run_match_project_for_site( $body );
		return new WP_REST_Response( $result['data'], $result['status'] );
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
	public static function handle_site_audit_url( WP_REST_Request $request ) {
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}
		return new WP_REST_Response( self::run_site_audit_url( $body ), 200 );
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{status:int,data:array<string,mixed>}
	 */
	public static function run_match_project_for_site( array $body ): array {
		if ( ! Neo_Pulse_App_Semrush_Client::has_api_key() ) {
			return array(
				'status' => 400,
				'data'   => array( 'error' => 'SEMRUSH_API_KEY is not set on the server' ),
			);
		}
		$site_url = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		if ( trim( $site_url ) === '' ) {
			return array( 'status' => 400, 'data' => array( 'error' => 'siteUrl is required' ) );
		}

		$projects = Neo_Pulse_App_Semrush_Projects_Api::list_projects( array( 'filter' => 'all' ) );
		if ( is_wp_error( $projects ) ) {
			return array( 'status' => 502, 'data' => array( 'error' => $projects->get_error_message() ) );
		}

		$match_result = Neo_Pulse_App_Semrush_Projects_Api::match_project_for_site_url( $site_url, $projects );
		$match        = $match_result['match'];
		$matches      = $match_result['matches'];

		$candidates = array();
		foreach ( array_slice( $projects, 0, 30 ) as $p ) {
			if ( ! is_array( $p ) ) {
				continue;
			}
			$candidates[] = array(
				'project_id'   => (string) ( $p['project_id'] ?? '' ),
				'url'          => is_string( $p['url'] ?? null ) ? $p['url'] : (string) ( $p['domain_unicode'] ?? '' ),
				'project_name' => is_string( $p['project_name'] ?? null ) ? $p['project_name'] : '',
			);
		}

		if ( $match === null ) {
			return array(
				'status' => 422,
				'data'   => array(
					'error'      => "No Semrush project matched this site's hostname. Use the manual project ID field or pick from candidates below.",
					'candidates' => $candidates,
				),
			);
		}

		return array(
			'status' => 200,
			'data'   => array(
				'projectId'    => (string) ( $match['project_id'] ?? '' ),
				'matchedHost'  => is_string( $match['url'] ?? null ) ? $match['url'] : (string) ( $match['domain_unicode'] ?? '' ),
				'projectName'  => is_string( $match['project_name'] ?? null ) ? $match['project_name'] : '',
				'ambiguous'    => count( $matches ) > 1,
				'matchedCount' => count( $matches ),
			),
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{status:int,data:array<string,mixed>}
	 */
	public static function run_competitor_research( array $body ): array {
		if ( ! Neo_Pulse_App_Semrush_Client::has_api_key() ) {
			return array(
				'status' => 400,
				'data'   => array( 'error' => 'SEMRUSH_API_KEY is not set on the server' ),
			);
		}
		$site_url = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		if ( trim( $site_url ) === '' ) {
			return array( 'status' => 400, 'data' => array( 'error' => 'siteUrl is required' ) );
		}
		try {
			$opts = array(
				'siteUrl'               => $site_url,
				'database'              => $body['database'] ?? null,
				'displayLimit'          => $body['displayLimit'] ?? null,
				'portfolioBlockedHosts' => $body['portfolioBlockedHosts'] ?? null,
			);
			if ( isset( $body['enrichmentLimit'] ) ) {
				$opts['enrichmentCap'] = $body['enrichmentLimit'];
			}
			return array(
				'status' => 200,
				'data'   => Neo_Pulse_App_Semrush_Organic_Competitors::run( $opts ),
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
		if ( ! Neo_Pulse_App_Semrush_Client::has_api_key() ) {
			return array(
				'status' => 400,
				'data'   => array( 'error' => 'SEMRUSH_API_KEY is not set on the server' ),
			);
		}
		$site_url    = isset( $body['siteUrl'] ) ? (string) $body['siteUrl'] : '';
		$explicit_db = isset( $body['database'] ) ? trim( (string) $body['database'] ) : '';
		if ( $explicit_db === '' && trim( $site_url ) === '' ) {
			return array(
				'status' => 400,
				'data'   => array(
					'error' => 'siteUrl is required (connected seed site URL) when database is omitted - needed for the correct Semrush regional database.',
				),
			);
		}
		$domain = isset( $body['domain'] ) ? trim( (string) $body['domain'] ) : '';
		if ( $domain === '' ) {
			return array( 'status' => 400, 'data' => array( 'error' => 'domain is required' ) );
		}
		try {
			$result = Neo_Pulse_App_Semrush_Organic_Competitors::run_manual_domain(
				array(
					'siteUrl'  => $site_url,
					'database' => $body['database'] ?? null,
					'domain'   => $domain,
				)
			);
			if ( empty( $result['row'] ) ) {
				$msg = ! empty( $result['errors'][0]['message'] )
					? (string) $result['errors'][0]['message']
					: 'Could not load domain from Semrush';
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
	 * @return array<string,mixed>
	 */
	public static function run_site_audit_url( array $body ): array {
		$page_url   = isset( $body['pageUrl'] ) ? (string) $body['pageUrl'] : '';
		$project_id = isset( $body['projectId'] ) ? trim( (string) $body['projectId'] ) : '';

		if ( ! Neo_Pulse_App_Semrush_Client::has_api_key() ) {
			$payload = array(
				'skipped'     => true,
				'reason'      => 'no_api_key',
				'pageList'    => null,
				'pageInfo'    => null,
				'projectInfo' => null,
				'pageid'      => null,
				'errors'      => array(
					array(
						'step'    => 'config',
						'message' => 'SEMRUSH_API_KEY is not set',
					),
				),
			);
		} else {
			$payload = array(
				'skipped'     => false,
				'pageList'    => null,
				'pageInfo'    => null,
				'projectInfo' => null,
				'pageid'      => null,
				'errors'      => array(
					array(
						'step'    => 'site_audit',
						'message' => 'Site Audit requires Semrush MCP (not available in WordPress plugin).',
					),
				),
			);
		}

		$stored                = Neo_Pulse_App_Semrush_Overview_Json::write_audit( $page_url, $project_id, $payload );
		$payload['storedFile'] = $stored;
		return $payload;
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response
	 */
	public static function handle_mcp_unavailable( WP_REST_Request $request ) {
		unset( $request );
		return new WP_REST_Response(
			array(
				'error' => 'This Semrush endpoint requires the hosted Semrush MCP and is not available in the WordPress plugin yet.',
			),
			501
		);
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response
	 */
	public static function handle_site_audit_stub( WP_REST_Request $request ) {
		unset( $request );
		return new WP_REST_Response( array( 'error' => 'Deprecated handler' ), 501 );
	}

	/**
	 * @param string              $subpath Route after semrush/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );
		$req     = new WP_REST_Request( $method, '/semrush/' . $subpath );
		if ( ! empty( $body ) ) {
			$req->set_body( wp_json_encode( $body ) );
		}

		if ( $subpath === 'bulk-enrichment' && $method === 'POST' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( self::run_bulk_enrichment( $body ), 200 );
			return;
		}
		if ( preg_match( '#^overview-json/([a-zA-Z0-9._-]+)$#', $subpath, $m ) && $method === 'GET' ) {
			$req->set_param( 'filename', $m[1] );
			$response = self::handle_overview_json( $req );
			if ( is_wp_error( $response ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => $response->get_error_message() ), 404 );
				return;
			}
			$data = $response->get_data();
			status_header( 200 );
			header( 'Content-Type: application/json; charset=utf-8' );
			header( 'Content-Disposition: attachment; filename="' . $m[1] . '"' );
			echo wp_json_encode( $data );
			return;
		}
		if ( $subpath === 'audit-ai-context' && $method === 'POST' ) {
			$filename = isset( $body['filename'] ) ? trim( (string) $body['filename'] ) : '';
			$max      = isset( $body['maxChars'] ) && is_numeric( $body['maxChars'] )
				? min( (int) $body['maxChars'], 500000 )
				: 120000;
			if ( $filename === '' || ! Neo_Pulse_App_Semrush_Overview_Json::is_safe_audit_filename( $filename ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => 'Invalid or missing filename' ), 400 );
				return;
			}
			$doc = Neo_Pulse_App_Semrush_Overview_Json::read( $filename );
			if ( $doc === null ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => 'File not found' ), 404 );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( Neo_Pulse_App_Semrush_Overview_Json::compact_audit_context( $doc, $max ), 200 );
			return;
		}
		if ( preg_match( '#^audit-json/([a-zA-Z0-9._-]+)$#', $subpath, $m ) && $method === 'GET' ) {
			$req = new WP_REST_Request( 'GET', '/semrush/audit-json/' . $m[1] );
			$req->set_param( 'filename', $m[1] );
			$response = self::handle_audit_json( $req );
			if ( is_wp_error( $response ) ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => $response->get_error_message() ), 404 );
				return;
			}
			$data = $response->get_data();
			status_header( 200 );
			header( 'Content-Type: application/json; charset=utf-8' );
			header( 'Content-Disposition: attachment; filename="' . $m[1] . '"' );
			echo wp_json_encode( $data );
			return;
		}
		if ( $subpath === 'match-project-for-site' && $method === 'POST' ) {
			$result = self::run_match_project_for_site( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['data'], $result['status'] );
			return;
		}
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
		if ( $subpath === 'site-audit-url' && $method === 'POST' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( self::run_site_audit_url( $body ), 200 );
			return;
		}
		if ( $subpath === 'position-tracking-compare' && $method === 'POST' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( Neo_Pulse_App_Semrush_Position_Tracking_Compare::run( $body ), 200 );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => 'Not found', 'path' => 'semrush/' . $subpath ), 404 );
	}
}
