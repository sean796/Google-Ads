<?php
/**
 * REST route handlers for /api/overview/* (Node-compatible JSON shapes).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Overview_Route_Handlers {

	public static function register(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	public static function register_routes(): void {
		register_rest_route(
			'overview',
			'/fetch-page-meta',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'fetch_page_meta' ),
				'permission_callback' => '__return_true',
			)
		);
		register_rest_route(
			'overview',
			'/optimize-meta-ai',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'optimize_meta_ai' ),
				'permission_callback' => '__return_true',
			)
		);
		register_rest_route(
			'overview',
			'/seo-brief',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'seo_brief_post' ),
				'permission_callback' => '__return_true',
			)
		);
		register_rest_route(
			'overview',
			'/seo-brief/(?P<filename>[a-zA-Z0-9._-]+)',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'seo_brief_get' ),
				'permission_callback' => '__return_true',
			)
		);
		register_rest_route(
			'overview',
			'/blog-links-log',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'blog_links_log' ),
				'permission_callback' => '__return_true',
			)
		);
		register_rest_route(
			'overview',
			'/studio-snapshot',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'studio_snapshot_get' ),
					'permission_callback' => '__return_true',
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'studio_snapshot_post' ),
					'permission_callback' => '__return_true',
				),
			)
		);
	}

	public static function fetch_page_meta( WP_REST_Request $request ) {
		$result = Neo_Pulse_App_Overview_Fetch_Meta::fetch_page_meta( (array) $request->get_json_params() );
		return new WP_REST_Response( $result['body'], $result['statusCode'] );
	}

	public static function optimize_meta_ai( WP_REST_Request $request ) {
		try {
			$body = (array) $request->get_json_params();
			$result = Neo_Pulse_App_Overview_Meta_Ai::run_optimize_meta_ai(
				array(
					'url'              => $body['url'] ?? '',
					'primaryKeyword'   => $body['primaryKeyword'] ?? '',
					'openRouterApiKey' => $body['openRouterApiKey'] ?? '',
					'wordpress'        => $body['wordpress'] ?? null,
				)
			);
			return rest_ensure_response( $result );
		} catch ( Exception $e ) {
			return new WP_REST_Response( array( 'error' => $e->getMessage() ), 500 );
		}
	}

	public static function seo_brief_post( WP_REST_Request $request ) {
		$result = Neo_Pulse_App_Overview_Seo_Brief::save( (array) $request->get_json_params() );
		return new WP_REST_Response( $result['body'], $result['statusCode'] );
	}

	public static function seo_brief_get( WP_REST_Request $request ) {
		$result = Neo_Pulse_App_Overview_Seo_Brief::serve( (string) $request->get_param( 'filename' ) );
		if ( ! empty( $result['file'] ) ) {
			$response = new WP_REST_Response( file_get_contents( $result['file'] ), 200 );
			$response->header( 'Content-Type', $result['contentType'] );
			$response->header( 'Content-Disposition', 'attachment; filename="' . basename( (string) $request->get_param( 'filename' ) ) . '"' );
			return $response;
		}
		return new WP_REST_Response( $result['body'] ?? array( 'error' => 'Failed' ), $result['statusCode'] ?? 500 );
	}

	public static function blog_links_log( WP_REST_Request $request ) {
		unset( $request );
		return rest_ensure_response( array( 'ok' => true ) );
	}

	private static function studio_snapshot_path( string $site_id, string $source ): string {
		$safe_site   = preg_replace( '/[^a-zA-Z0-9._-]/', '_', trim( $site_id ) );
		$safe_source = in_array( $source, array( 'pages', 'posts', 'sap' ), true ) ? $source : 'pages';
		return Neo_Pulse_App_Data_Paths::subdir( 'overview-studio-snapshots' ) . '/' . $safe_site . '__' . $safe_source . '.json';
	}

	/**
	 * @param array<string,mixed> $params
	 * @return array{ok:bool,snapshot?:array<string,mixed>|null,error?:string}
	 */
	public static function read_studio_snapshot( array $params ): array {
		$site_id = isset( $params['siteId'] ) ? trim( (string) $params['siteId'] ) : '';
		$source  = isset( $params['source'] ) ? trim( (string) $params['source'] ) : 'pages';
		if ( $site_id === '' ) {
			return array( 'ok' => false, 'snapshot' => null );
		}
		$path = self::studio_snapshot_path( $site_id, $source );
		$data = Neo_Pulse_App_Json_File_Store::read( $path, null );
		return array(
			'ok'       => true,
			'snapshot' => is_array( $data ) ? $data : null,
		);
	}

	/**
	 * @param array<string,mixed> $body
	 * @return array{ok:bool,error?:string}
	 */
	public static function write_studio_snapshot( array $body ): array {
		$site_id = isset( $body['siteId'] ) ? trim( (string) $body['siteId'] ) : '';
		$source  = isset( $body['source'] ) ? trim( (string) $body['source'] ) : 'pages';
		$rows    = isset( $body['rows'] ) && is_array( $body['rows'] ) ? $body['rows'] : array();
		if ( $site_id === '' || empty( $rows ) ) {
			return array( 'ok' => false, 'error' => 'siteId and non-empty rows required' );
		}
		$path = self::studio_snapshot_path( $site_id, $source );
		Neo_Pulse_App_Json_File_Store::write(
			$path,
			array(
				'siteId'    => $site_id,
				'source'    => $source,
				'activeUrl' => isset( $body['activeUrl'] ) && is_string( $body['activeUrl'] ) ? trim( $body['activeUrl'] ) : null,
				'rows'      => $rows,
				'updatedAt' => gmdate( 'c' ),
			)
		);
		return array( 'ok' => true );
	}

	public static function studio_snapshot_get( WP_REST_Request $request ) {
		return rest_ensure_response(
			self::read_studio_snapshot(
				array(
					'siteId' => $request->get_param( 'siteId' ),
					'source' => $request->get_param( 'source' ),
				)
			)
		);
	}

	public static function studio_snapshot_post( WP_REST_Request $request ) {
		$res = self::write_studio_snapshot( (array) $request->get_json_params() );
		return new WP_REST_Response( $res, ! empty( $res['ok'] ) ? 200 : 400 );
	}

	/**
	 * @param string              $subpath Route after overview/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( $subpath === 'fetch-page-meta' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Overview_Fetch_Meta::fetch_page_meta( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'optimize-meta-ai' && $method === 'POST' ) {
			try {
				$result = Neo_Pulse_App_Overview_Meta_Ai::run_optimize_meta_ai(
					array(
						'url'              => $body['url'] ?? '',
						'primaryKeyword'   => $body['primaryKeyword'] ?? '',
						'openRouterApiKey' => $body['openRouterApiKey'] ?? '',
						'wordpress'        => $body['wordpress'] ?? null,
					)
				);
				Neo_Pulse_App_Api_Dispatcher::send_json( $result );
			} catch ( Exception $e ) {
				Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => $e->getMessage() ), 500 );
			}
			return;
		}
		if ( $subpath === 'seo-brief' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Overview_Seo_Brief::save( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( preg_match( '#^seo-brief/([a-zA-Z0-9._-]+)$#', $subpath, $m ) && $method === 'GET' ) {
			$r = Neo_Pulse_App_Overview_Seo_Brief::serve( $m[1] );
			if ( ! empty( $r['file'] ) && is_readable( $r['file'] ) ) {
				status_header( 200 );
				header( 'Content-Type: ' . ( $r['contentType'] ?? 'application/json' ) );
				header( 'Content-Disposition: attachment; filename="' . basename( $m[1] ) . '"' );
				readfile( $r['file'] );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'] ?? array( 'error' => 'Failed' ), $r['statusCode'] ?? 500 );
			return;
		}
		if ( $subpath === 'blog-links-log' && $method === 'POST' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'ok' => true ) );
			return;
		}
		if ( $subpath === 'studio-snapshot' && $method === 'GET' ) {
			$res = self::read_studio_snapshot( $_GET );
			Neo_Pulse_App_Api_Dispatcher::send_json( $res, 200 );
			return;
		}
		if ( $subpath === 'studio-snapshot' && $method === 'POST' ) {
			$res = self::write_studio_snapshot( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $res, ! empty( $res['ok'] ) ? 200 : 400 );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => 'Not found', 'path' => 'overview/' . $subpath ), 404 );
	}
}
