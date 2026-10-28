<?php
/**
 * WordPress proxy route dispatch (maps Node /api/wordpress/* actions).
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_App_Wp_Route_Handlers {

	public static function register(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	public static function register_routes(): void {
		register_rest_route(
			'wordpress',
			'/(?P<action>[a-z0-9-]+)',
			array(
				'methods'             => WP_REST_Server::ALLMETHODS,
				'callback'            => array( __CLASS__, 'rest_dispatch' ),
				'permission_callback' => '__return_true',
			)
		);
	}

	/**
	 * @param WP_REST_Request $request REST request.
	 * @return WP_REST_Response
	 */
	public static function rest_dispatch( WP_REST_Request $request ) {
		$action = (string) $request->get_param( 'action' );
		$method = $request->get_method();
		$body   = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = $request->get_body_params();
		}
		if ( ! is_array( $body ) ) {
			$body = array();
		}

		list( $status, $data, $content_type ) = self::normalize_handler_result(
			self::handle( $action, $method, $body )
		);

		if ( $content_type === 'application/x-ndjson' && ! empty( $data['ndjson'] ) && is_array( $data['ndjson'] ) ) {
			$lines    = array();
			foreach ( $data['ndjson'] as $line ) {
				$lines[] = wp_json_encode( $line );
			}
			$response = new WP_REST_Response( implode( "\n", $lines ) . "\n", $status );
			$response->header( 'Content-Type', 'application/x-ndjson' );
			return $response;
		}

		$response = new WP_REST_Response( $data, $status );
		if ( $content_type ) {
			$response->header( 'Content-Type', $content_type );
		}
		return $response;
	}

	/**
	 * @param array<int,mixed> $result Handler return.
	 * @return array{0:int,1:array<string,mixed>,2:string}
	 */
	private static function normalize_handler_result( $result ) {
		$status       = isset( $result[0] ) ? (int) $result[0] : 200;
		$data         = isset( $result[1] ) && is_array( $result[1] ) ? $result[1] : array();
		$content_type = isset( $result[2] ) ? (string) $result[2] : 'application/json; charset=' . get_option( 'blog_charset' );
		return array( $status, $data, $content_type );
	}

	/**
	 * @param string              $action Route action slug.
	 * @param string              $method HTTP method.
	 * @param array<string,mixed> $body   Parsed JSON body.
	 * @return array{0:int,1:array<string,mixed>,2?:string} HTTP status, JSON data, optional content-type.
	 */
	public static function handle( $action, $method, $body ) {
		$action = sanitize_key( str_replace( '/', '-', (string) $action ) );
		$method = strtoupper( (string) $method );
		$body   = is_array( $body ) ? $body : array();

		switch ( $action ) {
			case 'test-connection':
				return Neo_Pulse_App_Wp_Connection::test_connection( $body );

			case 'detect-sitemaps':
				return Neo_Pulse_App_Wp_Sitemap::detect_sitemaps( $body );
			case 'parse-sitemap':
				return Neo_Pulse_App_Wp_Sitemap::parse_sitemap( $body );
			case 'check-future-posts':
				return Neo_Pulse_App_Wp_Sitemap::check_future_posts( $body );

			case 'get-scheduled-posts':
				return Neo_Pulse_App_Wp_Posts_Inventory::get_scheduled_posts( $body );
			case 'get-published-posts':
				return Neo_Pulse_App_Wp_Posts_Inventory::get_published_posts( $body );
			case 'get-site-post-inventory':
				return Neo_Pulse_App_Wp_Posts_Inventory::get_site_post_inventory( $body );
			case 'get-site-inventory-bulk':
				return Neo_Pulse_App_Wp_Posts_Inventory::get_site_inventory_bulk( $body );
			case 'get-posts-list':
				return Neo_Pulse_App_Wp_Posts_Inventory::get_posts_list( $body );
			case 'get-post-types':
				return Neo_Pulse_App_Wp_Posts_Inventory::get_post_types( $body );

			case 'get-post-content':
				return Neo_Pulse_App_Wp_Post_Content::get_post_content( $body );

			case 'resolve-urls':
				return Neo_Pulse_App_Wp_Url_Resolver::resolve_urls( $body );

			case 'create-post':
				if ( $method !== 'POST' ) {
					return self::method_not_allowed( $method, $action );
				}
				return Neo_Pulse_App_Wp_Post_Crud::create_post( $body );
			case 'update-post':
				if ( $method !== 'PUT' && $method !== 'POST' ) {
					return self::method_not_allowed( $method, $action );
				}
				return Neo_Pulse_App_Wp_Post_Crud::update_post( $body );
			case 'reschedule-post-date':
				if ( $method !== 'POST' ) {
					return self::method_not_allowed( $method, $action );
				}
				return Neo_Pulse_App_Wp_Post_Crud::reschedule_post_date( $body );
			case 'get-scheduled-entity-posts':
				return Neo_Pulse_App_Wp_Posts_Inventory::get_scheduled_entity_posts( $body );
			case 'delete-post':
				if ( $method !== 'DELETE' && $method !== 'POST' ) {
					return self::method_not_allowed( $method, $action );
				}
				return Neo_Pulse_App_Wp_Post_Crud::delete_post( $body );

			case 'upload-media':
				return Neo_Pulse_App_Wp_Media::upload_media( $body );
			case 'list-media':
				return Neo_Pulse_App_Wp_Media::list_media( $body );

			case 'resolve-featured-media':
				return Neo_Pulse_App_Wp_Featured_Media::resolve( $body );

			case 'get-post-meta':
				return Neo_Pulse_App_Wp_Meta::get_post_meta( $body );
			case 'update-post-meta':
				return Neo_Pulse_App_Wp_Meta::update_post_meta( $body );
			case 'update-acf-field':
				return Neo_Pulse_App_Wp_Meta::update_acf_field( $body );

			case 'update-overview-seo-item':
				return Neo_Pulse_App_Wp_Bulk_Overview_Seo::update_overview_seo_item( $body );
			case 'bulk-update-overview-seo':
				return Neo_Pulse_App_Wp_Bulk_Overview_Seo::bulk_update_overview_seo( $body );

			case 'get-acf-fields':
				return Neo_Pulse_App_Wp_Acf_Protocol::get_acf_fields( $body );
			case 'get-acf-fields-batch':
				return Neo_Pulse_App_Wp_Acf_Protocol::get_acf_fields_batch( $body );
			case 'get-acf-fields-by-url':
				return Neo_Pulse_App_Wp_Acf_Protocol::get_acf_fields_by_url( $body );
			case 'get-acf-fields-by-url-batch':
				return Neo_Pulse_App_Wp_Acf_Protocol::get_acf_fields_by_url_batch( $body );
			case 'discover-acf-field-groups':
				return Neo_Pulse_App_Wp_Acf_Protocol::discover_acf_field_groups( $body );
			case 'update-acf-fields':
				return Neo_Pulse_App_Wp_Acf_Protocol::update_acf_fields( $body );

			case 'neo-pulse-wp-tool':
				return Neo_Pulse_App_Wp_NeoPulse_Tools::neo_pulse_wp_tool( $body );
			case 'neo-pulse-wp-tools-list':
				return Neo_Pulse_App_Wp_NeoPulse_Tools::neo_pulse_wp_tools_list( $body );

			case 'pulse-assist-stream':
				if ( $method !== 'POST' ) {
					return self::method_not_allowed( $method, $action );
				}
				return Neo_Pulse_App_Wp_Pulse_Assist::stream( $body );
			case 'pulse-assist':
				if ( $method !== 'POST' ) {
					return self::method_not_allowed( $method, $action );
				}
				return Neo_Pulse_App_Wp_Pulse_Assist::assist( $body );
			case 'pulse-assist-undo':
				if ( $method !== 'POST' ) {
					return self::method_not_allowed( $method, $action );
				}
				return Neo_Pulse_App_Wp_Pulse_Assist::undo( $body );
			case 'pulse-assist-step':
				if ( $method !== 'POST' ) {
					return self::method_not_allowed( $method, $action );
				}
				return Neo_Pulse_App_Wp_Pulse_Assist::step( $body );
			case 'pulse-assist-workflow-status':
				if ( $method !== 'GET' && $method !== 'POST' ) {
					return self::method_not_allowed( $method, $action );
				}
				return Neo_Pulse_App_Wp_Pulse_Assist::workflow_status( $body );
			case 'pulse-assist-site-inventory':
				if ( $method !== 'GET' && $method !== 'POST' ) {
					return self::method_not_allowed( $method, $action );
				}
				return Neo_Pulse_App_Wp_Pulse_Assist::site_inventory( $body );

			case 'get-quarter-editorial-counts':
				return Neo_Pulse_App_Wp_Editorial_Counts::get_quarter_editorial_counts( $body );
			case 'get-optimization-activity-counts':
				return Neo_Pulse_App_Wp_Editorial_Counts::get_optimization_activity_counts( $body );

			case 'get-author-usage':
				return Neo_Pulse_App_Wp_Author_Resolver::get_author_usage( $body );

			case 'change-post-url':
				return Neo_Pulse_App_Wp_Change_Post_Url::change( $body );

			default:
				return array(
					404,
					array(
						'success' => false,
						'error'   => 'Not found',
						'action'  => $action,
						'method'  => $method,
					),
				);
		}
	}

	/**
	 * @param string $method HTTP method.
	 * @param string $action Action slug.
	 * @return array{0:int,1:array<string,mixed>}
	 */
	private static function method_not_allowed( $method, $action ) {
		return array(
			405,
			array(
				'success' => false,
				'error'   => 'Method not allowed',
				'method'  => $method,
				'action'  => $action,
			),
		);
	}
}
