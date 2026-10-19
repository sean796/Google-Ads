<?php
/**
 * REST route handlers for /api/gsc/* (Node-compatible JSON shapes).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Gsc_Route_Handlers {

	public static function register(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	public static function register_routes(): void {
		$routes = array(
			array( 'GET', '/service-account-email', 'service_account_email' ),
			array( 'GET', '/test-connection', 'test_connection' ),
			array( 'POST', '/report-date-range', 'report_date_range' ),
			array( 'POST', '/fetch-queries', 'fetch_queries' ),
			array( 'POST', '/fetch-performance-stats', 'fetch_performance_stats' ),
			array( 'POST', '/fetch-page-performance', 'fetch_page_performance' ),
			array( 'POST', '/fetch-pages-performance', 'fetch_pages_performance' ),
			array( 'POST', '/fetch-site-pages-performance', 'fetch_site_pages_performance' ),
			array( 'POST', '/fetch-historical-stats', 'fetch_historical_stats' ),
			array( 'POST', '/fetch-entity-pages-performance', 'fetch_entity_pages_performance' ),
			array( 'POST', '/fetch-reporting-bundle', 'fetch_reporting_bundle' ),
			array( 'POST', '/query-daily-series', 'query_daily_series' ),
			array( 'POST', '/reporting-chat-completion', 'reporting_chat_completion' ),
			array( 'POST', '/top-pages', 'top_pages' ),
			array( 'POST', '/url-inventory', 'url_inventory' ),
			array( 'POST', '/export-overview-quick-wins', 'export_overview_quick_wins' ),
			array( 'POST', '/quick-wins-context', 'quick_wins_context' ),
			array( 'GET', '/quick-wins-csv/(?P<filename>[a-zA-Z0-9._-]+)', 'quick_wins_csv' ),
			array( 'POST', '/check-url-indexing', 'check_url_indexing' ),
			array( 'POST', '/request-url-indexing', 'request_url_indexing' ),
			array( 'POST', '/index-sitemap-urls', 'index_sitemap_urls' ),
			array( 'POST', '/page-indexing-report', 'page_indexing_report' ),
		);

		foreach ( $routes as $route ) {
			register_rest_route(
				'gsc',
				$route[1],
				array(
					'methods'             => $route[0],
					'callback'            => array( __CLASS__, $route[2] ),
					'permission_callback' => '__return_true',
				)
			);
		}
	}

	public static function service_account_email( WP_REST_Request $request ) {
		return rest_ensure_response( array( 'email' => Neo_Pulse_App_Gsc_Service_Account::service_account_email() ) );
	}

	public static function test_connection( WP_REST_Request $request ) {
		$result = Neo_Pulse_App_Gsc_Service_Account::test_connection();
		$code   = ! empty( $result['success'] ) ? 200 : ( ! empty( $result['connected'] ) ? 200 : 500 );
		return new WP_REST_Response( $result, $code );
	}

	public static function report_date_range( WP_REST_Request $request ) {
		$body = $request->get_json_params();
		if ( empty( $body['startDate'] ) || empty( $body['endDate'] ) ) {
			return new WP_REST_Response( array( 'success' => false, 'error' => 'startDate and endDate required' ), 400 );
		}
		Neo_Pulse_App_Gsc_Service_Account::write_report_date_range(
			array(
				'startDate'        => (string) $body['startDate'],
				'endDate'          => (string) $body['endDate'],
				'compareStartDate' => isset( $body['compareStartDate'] ) ? (string) $body['compareStartDate'] : null,
				'compareEndDate'   => isset( $body['compareEndDate'] ) ? (string) $body['compareEndDate'] : null,
			)
		);
		return rest_ensure_response( array( 'success' => true ) );
	}

	public static function fetch_queries( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Queries::fetch_queries( (array) $request->get_json_params() ) );
	}

	public static function fetch_performance_stats( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Performance::fetch_performance_stats( (array) $request->get_json_params() ) );
	}

	public static function fetch_page_performance( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Performance::fetch_page_performance( (array) $request->get_json_params() ) );
	}

	public static function fetch_pages_performance( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Performance_Batch::fetch_pages_performance( (array) $request->get_json_params() ) );
	}

	public static function fetch_site_pages_performance( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Performance_Batch::fetch_site_pages_performance( (array) $request->get_json_params() ) );
	}

	public static function fetch_historical_stats( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Performance_Batch::fetch_historical_stats( (array) $request->get_json_params() ) );
	}

	public static function fetch_entity_pages_performance( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Entity_Performance::fetch_entity_pages_performance( (array) $request->get_json_params() ) );
	}

	public static function fetch_reporting_bundle( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Reporting_Bundle::fetch_reporting_bundle( (array) $request->get_json_params() ) );
	}

	public static function query_daily_series( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Query_Daily::query_daily_series( (array) $request->get_json_params() ) );
	}

	public static function reporting_chat_completion( WP_REST_Request $request ) {
		return self::reporting_chat_completion_body( (array) $request->get_json_params() );
	}

	/**
	 * @param array<string,mixed> $body
	 */
	public static function reporting_chat_completion_body( array $body ): WP_REST_Response {
		$system = isset( $body['system'] ) ? trim( (string) $body['system'] ) : '';
		$user   = isset( $body['user'] ) ? trim( (string) $body['user'] ) : '';
		if ( $system === '' || $user === '' ) {
			return new WP_REST_Response(
				array(
					'ok'    => false,
					'error' => 'system and user are required',
				),
				400
			);
		}

		try {
			$messages = array(
				array(
					'role'    => 'system',
					'content' => $system,
				),
				array(
					'role'    => 'user',
					'content' => $user,
				),
			);
			$opts     = array(
				'model'       => isset( $body['model'] ) ? trim( (string) $body['model'] ) : '',
				'temperature' => isset( $body['temperature'] ) ? (float) $body['temperature'] : 0.5,
				'maxTokens'   => isset( $body['maxTokens'] ) ? (int) $body['maxTokens'] : 8192,
			);

			$response_format = isset( $body['responseFormat'] ) && is_array( $body['responseFormat'] )
				? $body['responseFormat']
				: null;
			$raw_response = self::reporting_chat_completion_request( $messages, $opts, $response_format );

			return rest_ensure_response(
				array(
					'ok'                 => true,
					'content'            => $raw_response['content'],
					'finishReason'       => $raw_response['finishReason'],
					'nativeFinishReason' => $raw_response['nativeFinishReason'],
					'raw'                => $raw_response['raw'],
				)
			);
		} catch ( Exception $e ) {
			return new WP_REST_Response(
				array(
					'ok'    => false,
					'error' => $e->getMessage(),
				),
				500
			);
		}
	}

	/**
	 * @param array<int,array{role:string,content:string}> $messages
	 * @param array{model?:string,temperature?:float,maxTokens?:int} $opts
	 * @param array<string,mixed>|null $response_format
	 * @return array{content:string,finishReason:?string,nativeFinishReason:?string,raw:array<string,mixed>|null}
	 */
	public static function reporting_chat_completion_request_public( array $messages, array $opts, ?array $response_format ): array {
		return self::reporting_chat_completion_request( $messages, $opts, $response_format );
	}

	/**
	 * @param array<int,array{role:string,content:string}> $messages
	 * @param array{model?:string,temperature?:float,maxTokens?:int} $opts
	 * @param array<string,mixed>|null $response_format
	 * @return array{content:string,finishReason:?string,nativeFinishReason:?string,raw:array<string,mixed>|null}
	 */
	private static function reporting_chat_completion_request( array $messages, array $opts, ?array $response_format ): array {
		$api_key = Neo_Pulse_App_Chat_Openrouter::resolve_api_key();
		if ( $api_key === '' ) {
			throw new Exception( 'OpenRouter API key is missing. Add it in Dashboard → API Keys.' );
		}

		$model = isset( $opts['model'] ) && is_string( $opts['model'] ) && trim( $opts['model'] ) !== ''
			? trim( $opts['model'] )
			: Neo_Pulse_App_Chat_Openrouter::DEFAULT_MODEL;

		$payload = array(
			'model'       => $model,
			'messages'    => $messages,
			'temperature' => isset( $opts['temperature'] ) ? (float) $opts['temperature'] : 0.5,
			'max_tokens'  => isset( $opts['maxTokens'] ) ? (int) $opts['maxTokens'] : 8192,
			'stream'      => false,
		);
		if ( is_array( $response_format ) && $response_format !== array() ) {
			$payload['response_format'] = $response_format;
		}

		$response = wp_remote_post(
			Neo_Pulse_App_Chat_Openrouter::CHAT_URL,
			array(
				'timeout' => 180,
				'headers' => Neo_Pulse_App_Openrouter_Attribution::request_headers( $api_key ),
				'body'    => wp_json_encode( $payload ),
			)
		);

		if ( is_wp_error( $response ) ) {
			throw new Exception( $response->get_error_message() );
		}

		$code = (int) wp_remote_retrieve_response_code( $response );
		$raw  = json_decode( wp_remote_retrieve_body( $response ), true );
		if ( $code < 200 || $code >= 300 ) {
			$msg = is_array( $raw ) ? ( $raw['error']['message'] ?? $raw['message'] ?? 'OpenRouter error' ) : 'OpenRouter error';
			throw new Exception( 'OpenRouter ' . $code . ': ' . $msg );
		}

		$content = trim( (string) ( $raw['choices'][0]['message']['content'] ?? '' ) );
		if ( $content === '' ) {
			throw new Exception( 'OpenRouter returned empty content' );
		}

		return array(
			'content'            => $content,
			'finishReason'       => isset( $raw['choices'][0]['finish_reason'] ) ? (string) $raw['choices'][0]['finish_reason'] : null,
			'nativeFinishReason' => isset( $raw['choices'][0]['native_finish_reason'] ) ? (string) $raw['choices'][0]['native_finish_reason'] : null,
			'raw'                => is_array( $raw ) ? $raw : null,
		);
	}

	public static function top_pages( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Performance_Batch::top_pages( (array) $request->get_json_params() ) );
	}

	public static function url_inventory( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Performance_Batch::url_inventory( (array) $request->get_json_params() ) );
	}

	public static function export_overview_quick_wins( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Performance::export_overview_quick_wins( (array) $request->get_json_params() ) );
	}

	public static function quick_wins_context( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Performance::quick_wins_context( (array) $request->get_json_params() ) );
	}

	public static function quick_wins_csv( WP_REST_Request $request ) {
		$filename = (string) $request->get_param( 'filename' );
		$result   = Neo_Pulse_App_Gsc_Performance::serve_quick_wins_csv( $filename );
		if ( ! empty( $result['file'] ) ) {
			$body = file_get_contents( $result['file'] );
			$response = new WP_REST_Response( $body, 200 );
			$response->header( 'Content-Type', $result['contentType'] );
			$response->header( 'Content-Disposition', 'attachment; filename="' . basename( $filename ) . '"' );
			return $response;
		}
		return new WP_REST_Response( $result['body'] ?? array( 'error' => 'Failed' ), $result['statusCode'] ?? 500 );
	}

	public static function check_url_indexing( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Indexing::check_url_indexing( (array) $request->get_json_params() ) );
	}

	public static function request_url_indexing( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Indexing::request_url_indexing( (array) $request->get_json_params() ) );
	}

	public static function index_sitemap_urls( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Indexing::index_sitemap_urls( (array) $request->get_json_params() ) );
	}

	public static function page_indexing_report( WP_REST_Request $request ) {
		return self::from_result( Neo_Pulse_App_Gsc_Indexing::page_indexing_report( (array) $request->get_json_params() ) );
	}

	/** @param array{statusCode:int,body:array<string,mixed>} $result */
	private static function from_result( array $result ): WP_REST_Response {
		return new WP_REST_Response( $result['body'], $result['statusCode'] );
	}

	/**
	 * HTTP dispatch from Neo_Pulse_App_Api_Dispatcher.
	 *
	 * @param string              $subpath Route after gsc/.
	 * @param string              $method  HTTP method.
	 * @param array<string,mixed> $body    JSON body.
	 */
	public static function dispatch_http( string $subpath, string $method, array $body ): void {
		$subpath = trim( $subpath, '/' );
		$method  = strtoupper( $method );

		if ( $subpath === 'credentials-status' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( Neo_Pulse_App_Gsc_Credentials::credentials_status() );
			return;
		}
		if ( $subpath === 'test-and-save' && $method === 'POST' ) {
			$result = Neo_Pulse_App_Gsc_Credentials::test_and_save( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'], $result['statusCode'] );
			return;
		}
		if ( $subpath === 'service-account-email' && $method === 'GET' ) {
			Neo_Pulse_App_Api_Dispatcher::send_json( array( 'email' => Neo_Pulse_App_Gsc_Service_Account::service_account_email() ) );
			return;
		}
		if ( $subpath === 'test-connection' && $method === 'GET' ) {
			$result = Neo_Pulse_App_Gsc_Service_Account::test_connection();
			$code   = ! empty( $result['success'] ) ? 200 : 500;
			Neo_Pulse_App_Api_Dispatcher::send_json( $result, $code );
			return;
		}
		if ( $subpath === 'report-date-range' && $method === 'POST' ) {
			$response = self::report_date_range( new WP_REST_Request( 'POST', '/gsc/report-date-range', array( 'JSON' => wp_json_encode( $body ) ) ) );
			Neo_Pulse_App_Api_Dispatcher::send_json( $response->get_data(), $response->get_status() );
			return;
		}
		if ( $subpath === 'fetch-queries' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Queries::fetch_queries( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'fetch-performance-stats' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Performance::fetch_performance_stats( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'fetch-page-performance' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Performance::fetch_page_performance( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'fetch-pages-performance' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Performance_Batch::fetch_pages_performance( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'fetch-site-pages-performance' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Performance_Batch::fetch_site_pages_performance( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'fetch-historical-stats' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Performance_Batch::fetch_historical_stats( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'fetch-entity-pages-performance' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Entity_Performance::fetch_entity_pages_performance( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'fetch-reporting-bundle' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Reporting_Bundle::fetch_reporting_bundle( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'query-daily-series' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Query_Daily::query_daily_series( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'reporting-chat-completion' && $method === 'POST' ) {
			$response = self::reporting_chat_completion_body( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $response->get_data(), $response->get_status() );
			return;
		}
		if ( $subpath === 'top-pages' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Performance_Batch::top_pages( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'url-inventory' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Performance_Batch::url_inventory( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'export-overview-quick-wins' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Performance::export_overview_quick_wins( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'quick-wins-context' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Performance::quick_wins_context( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( preg_match( '#^quick-wins-csv/([a-zA-Z0-9._-]+)$#', $subpath, $m ) && $method === 'GET' ) {
			$result = Neo_Pulse_App_Gsc_Performance::serve_quick_wins_csv( $m[1] );
			if ( ! empty( $result['file'] ) && is_readable( $result['file'] ) ) {
				status_header( 200 );
				header( 'Content-Type: ' . ( $result['contentType'] ?? 'text/csv' ) );
				header( 'Content-Disposition: attachment; filename="' . basename( $m[1] ) . '"' );
				readfile( $result['file'] );
				return;
			}
			Neo_Pulse_App_Api_Dispatcher::send_json( $result['body'] ?? array( 'error' => 'Failed' ), $result['statusCode'] ?? 500 );
			return;
		}
		if ( $subpath === 'check-url-indexing' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Indexing::check_url_indexing( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'request-url-indexing' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Indexing::request_url_indexing( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'index-sitemap-urls' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Indexing::index_sitemap_urls( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}
		if ( $subpath === 'page-indexing-report' && $method === 'POST' ) {
			$r = Neo_Pulse_App_Gsc_Indexing::page_indexing_report( $body );
			Neo_Pulse_App_Api_Dispatcher::send_json( $r['body'], $r['statusCode'] );
			return;
		}

		Neo_Pulse_App_Api_Dispatcher::send_json( array( 'error' => 'Not found', 'path' => 'gsc/' . $subpath ), 404 );
	}
}
