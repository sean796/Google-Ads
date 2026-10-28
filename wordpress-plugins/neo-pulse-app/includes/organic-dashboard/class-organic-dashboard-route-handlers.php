<?php
/**
 * HTTP dispatch for /api/organic-dashboard/*.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Organic_Dashboard_Route_Handlers {

	/**
	 * @param string              $subpath Route after organic-dashboard/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( $subpath === 'fetch' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Organic_Dashboard_Bundle::fetch( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'fetch-part' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Organic_Dashboard_Bundle::fetch_part( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'reporting-highlights' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Organic_Dashboard_Reporting_Highlights::generate( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'client-report/save' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Organic_Dashboard_Client_Report_Share::save( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'client-report/load' && $method === 'GET' ) {
			$deck_id = isset( $_GET['deckId'] ) ? (string) wp_unslash( $_GET['deckId'] ) : '';
			if ( $deck_id === '' && isset( $_GET['hash'] ) ) {
				$deck_id = (string) wp_unslash( $_GET['hash'] );
			}
			$site_id = isset( $_GET['siteId'] ) ? (string) wp_unslash( $_GET['siteId'] ) : '';
			$result  = Neo_Pulse_App_Organic_Dashboard_Client_Report_Share::load( $deck_id, $site_id );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}

		if ( $subpath === 'client-report/open' && $method === 'GET' ) {
			Neo_Pulse_App_Organic_Dashboard_Client_Report_Share::open_link_preview();
			return;
		}

		if ( str_starts_with( $subpath, 'local-grid/' ) ) {
			$dfs_creds = Neo_Pulse_App_Secrets::dataforseo_from_request( $body );
			if ( $dfs_creds['password'] !== '' ) {
				Neo_Pulse_App_Secrets::use_request_dataforseo_credentials( $dfs_creds );
			}
			try {
				$grid_action = substr( $subpath, strlen( 'local-grid/' ) );
				if ( $grid_action === 'resolve-business' && $method === 'POST' ) {
					$result = Neo_Pulse_App_Organic_Dashboard_Local_Grid::resolve_business( $body );
					Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
					return;
				}
				if ( $grid_action === 'geocode-address' && $method === 'POST' ) {
					$result = Neo_Pulse_App_Organic_Dashboard_Local_Grid::geocode_address( $body );
					Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
					return;
				}
				if ( $grid_action === 'scan-batch' && $method === 'POST' ) {
					$result = Neo_Pulse_App_Organic_Dashboard_Local_Grid::scan_batch( $body );
					Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
					return;
				}
				if ( $grid_action === 'history' && $method === 'GET' ) {
					$site_id = isset( $_GET['siteId'] ) ? (string) wp_unslash( $_GET['siteId'] ) : '';
					$result  = Neo_Pulse_App_Organic_Dashboard_Local_Grid::list_history( $site_id );
					Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
					return;
				}
				if ( $grid_action === 'scan' && $method === 'GET' ) {
					$site_id = isset( $_GET['siteId'] ) ? (string) wp_unslash( $_GET['siteId'] ) : '';
					$scan_id = isset( $_GET['scanId'] ) ? (string) wp_unslash( $_GET['scanId'] ) : '';
					$result  = Neo_Pulse_App_Organic_Dashboard_Local_Grid::load_scan( $site_id, $scan_id );
					Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
					return;
				}
				if ( $grid_action === 'map-image' && $method === 'GET' ) {
					$site_id = isset( $_GET['siteId'] ) ? (string) wp_unslash( $_GET['siteId'] ) : '';
					$scan_id = isset( $_GET['scanId'] ) ? (string) wp_unslash( $_GET['scanId'] ) : '';
					$result  = Neo_Pulse_App_Organic_Dashboard_Local_Grid::serve_map_image( $site_id, $scan_id );
					if ( ! empty( $result['file'] ) && is_readable( $result['file'] ) ) {
						status_header( 200 );
						header( 'Content-Type: ' . ( $result['contentType'] ?? 'image/png' ) );
						header( 'Cache-Control: private, max-age=3600' );
						readfile( $result['file'] );
						return;
					}
					Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'] ?? array( 'error' => 'Not found' ), $result['statusCode'] ?? 404 );
					return;
				}
				if ( $grid_action === 'map-image' && $method === 'POST' ) {
					$result = Neo_Pulse_App_Organic_Dashboard_Local_Grid::save_map_image( $body );
					Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
					return;
				}
				if ( $grid_action === 'report-narrative' && $method === 'POST' ) {
					$result = Neo_Pulse_App_Organic_Dashboard_Local_Grid::report_narrative( $body );
					Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
					return;
				}
				if ( $grid_action === 'save' && $method === 'POST' ) {
					$result = Neo_Pulse_App_Organic_Dashboard_Local_Grid::save_scan( $body );
					Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
					return;
				}
				if ( $grid_action === 'delete' && $method === 'POST' ) {
					$result = Neo_Pulse_App_Organic_Dashboard_Local_Grid::delete_scan( $body );
					Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
					return;
				}
				if ( $grid_action === 'workspace' && $method === 'GET' ) {
					$site_id = isset( $_GET['siteId'] ) ? (string) wp_unslash( $_GET['siteId'] ) : '';
					$result  = Neo_Pulse_App_Organic_Dashboard_Local_Grid::load_workspace( $site_id );
					Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
					return;
				}
				if ( $grid_action === 'workspace' && $method === 'POST' ) {
					$result = Neo_Pulse_App_Organic_Dashboard_Local_Grid::save_workspace( $body );
					Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
					return;
				}
			} finally {
				Neo_Pulse_App_Secrets::clear_request_dataforseo_credentials();
			}
		}

		Neo_Pulse_App_Api_Dispatcher::send_json(
			array(
				'error' => 'Not found',
				'path'  => 'organic-dashboard/' . $subpath,
			),
			404
		);
	}
}
