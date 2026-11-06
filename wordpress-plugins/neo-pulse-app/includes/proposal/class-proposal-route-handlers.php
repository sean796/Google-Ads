<?php
/**
 * REST + /api/* routes for proposal endpoints.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Proposal_Route_Handlers {

	const REST_NAMESPACE = 'neo-pulse-app/v1';

	public static function register(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_rest_routes' ) );
	}

	public static function register_rest_routes(): void {
		register_rest_route(
			self::REST_NAMESPACE,
			'/proposal/site-audit',
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => array( __CLASS__, 'handle_site_audit' ),
				'permission_callback' => array( __CLASS__, 'can_access' ),
			)
		);
	}

	/**
	 * @param WP_REST_Request $request
	 */
	public static function can_access( WP_REST_Request $request ): bool {
		return Neo_Pulse_App_Auth_Session::rest_permission( $request );
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{status:int,data:array<string,mixed>}
	 */
	public static function run_site_audit( array $body ): array {
		if ( ! Neo_Pulse_App_Dataforseo_Client::has_credentials() ) {
			return array(
				'status' => 400,
				'data'   => array(
					'success' => false,
					'error'   => 'DATAFORSEO_API_LOGIN / DATAFORSEO_API_PASSWORD are not set on the server',
				),
			);
		}

		$urls = $body['urls'] ?? null;
		if ( ! is_array( $urls ) || $urls === array() ) {
			return array(
				'status' => 400,
				'data'   => array( 'success' => false, 'error' => 'urls array is required' ),
			);
		}
		if ( count( $urls ) > Neo_Pulse_App_Proposal_Site_Audit::MAX_URLS ) {
			return array(
				'status' => 400,
				'data'   => array(
					'success' => false,
					'error'   => 'Maximum ' . Neo_Pulse_App_Proposal_Site_Audit::MAX_URLS . ' URLs per audit',
				),
			);
		}

		try {
			$result = Neo_Pulse_App_Proposal_Site_Audit::run( $urls );
			return array(
				'status' => 200,
				'data'   => array_merge( array( 'success' => true ), $result ),
			);
		} catch ( Exception $e ) {
			return array(
				'status' => 500,
				'data'   => array( 'success' => false, 'error' => $e->getMessage() ),
			);
		}
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response
	 */
	public static function handle_site_audit( WP_REST_Request $request ) {
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}
		$result = self::run_site_audit( $body );
		return new WP_REST_Response( $result['data'], $result['status'] );
	}

	/**
	 * @param string              $subpath Route after proposal/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( $subpath === 'site-audit' && $method === 'POST' ) {
			$result = self::run_site_audit( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['data'], $result['status'] );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'error'  => 'Not found',
				'path'   => 'proposal/' . $subpath,
				'method' => $method,
			),
			404
		);
	}
}
