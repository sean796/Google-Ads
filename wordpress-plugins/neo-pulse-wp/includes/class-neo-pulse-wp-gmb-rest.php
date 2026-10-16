<?php
/**
 * REST routes for Google Business Profile posting from the editor sidebar.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Gmb_Rest {

	public static function init(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	public static function register_routes(): void {
		register_rest_route(
			'neo-pulse/v1',
			'/ai/gmb-post',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'create_social_post' ),
				// Publishing to the business's Google profile is an admin action, not an editor one.
				'permission_callback' => array( __CLASS__, 'publish_permission' ),
				'args'                => array(
					'post_id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);

		register_rest_route(
			'neo-pulse/v1',
			'/ai/social-preview',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'social_preview' ),
				'permission_callback' => array( 'Neo_Pulse_Wp_Ai_Rest', 'edit_post_permission' ),
				'args'                => array(
					'post_id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);

		register_rest_route(
			'neo-pulse/v1',
			'/ai/social-generate',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'social_generate' ),
				'permission_callback' => array( 'Neo_Pulse_Wp_Ai_Rest', 'edit_post_permission' ),
				'args'                => array(
					'post_id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);

		register_rest_route(
			'neo-pulse/v1',
			'/gmb/status',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'connection_status' ),
				'permission_callback' => function () {
					return current_user_can( 'edit_posts' );
				},
			)
		);
	}

	/**
	 * Permission for /ai/gmb-post: manage_options plus the usual edit-this-post check.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return bool|WP_Error
	 */
	public static function publish_permission( $request ) {
		if ( ! current_user_can( 'manage_options' ) ) {
			return new WP_Error(
				'rest_forbidden',
				__( 'Only administrators can publish to Google Business Profile.', 'neo-pulse-wp' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}
		return Neo_Pulse_Wp_Ai_Rest::edit_post_permission( $request );
	}

	/**
	 * POST /neo-pulse/v1/ai/social-preview
	 *
	 * Return post data + platform constraints for the Social Media Module modal.
	 */
	public static function social_preview( WP_REST_Request $request ): WP_REST_Response {
		$post_id = (int) $request->get_param( 'post_id' );
		$data    = Neo_Pulse_Wp_Gmb::get_post_preview_data( $post_id );
		if ( is_wp_error( $data ) ) {
			return self::wp_error_response( $data );
		}

		return new WP_REST_Response(
			array(
				'ok'          => true,
				'post'        => $data,
				'platforms'   => Neo_Pulse_Wp_Gmb::PLATFORM_CONSTRAINTS,
				'gmb_status'  => array(
					'configured' => Neo_Pulse_Wp_Gmb::is_configured(),
					'connected'  => Neo_Pulse_Wp_Gmb::is_connected(),
				),
			),
			200
		);
	}

	/**
	 * POST /neo-pulse/v1/ai/social-generate
	 *
	 * Generate platform-optimized copy without publishing.
	 */
	public static function social_generate( WP_REST_Request $request ): WP_REST_Response {
		$post_id  = (int) $request->get_param( 'post_id' );
		$body     = $request->get_json_params();
		$platform = is_array( $body ) && isset( $body['platform'] ) ? sanitize_text_field( (string) $body['platform'] ) : 'gmb';

		$valid_platforms = array_keys( Neo_Pulse_Wp_Gmb::PLATFORM_CONSTRAINTS );
		if ( ! in_array( $platform, $valid_platforms, true ) ) {
			$platform = 'gmb';
		}

		$summary = Neo_Pulse_Wp_Gmb::summarize_post( $post_id, $platform );
		if ( is_wp_error( $summary ) ) {
			return self::wp_error_response( $summary );
		}

		$constraints = Neo_Pulse_Wp_Gmb::PLATFORM_CONSTRAINTS[ $platform ];

		return new WP_REST_Response(
			array(
				'ok'          => true,
				'summary'     => $summary,
				'platform'    => $platform,
				'char_count'  => mb_strlen( $summary ),
				'max_chars'   => $constraints['max_chars'],
			),
			200
		);
	}

	/**
	 * POST /neo-pulse/v1/ai/gmb-post
	 *
	 * Publish to Google Business Profile. Accepts optional pre-generated summary and platform.
	 */
	public static function create_social_post( WP_REST_Request $request ): WP_REST_Response {
		$post_id = (int) $request->get_param( 'post_id' );
		$body    = $request->get_json_params();

		if ( ! Neo_Pulse_Wp_Gmb::is_configured() ) {
			return self::error_response( 'Configure GMB Client ID and Secret in NEO Pulse WP Settings → GMB.', 503 );
		}

		if ( ! Neo_Pulse_Wp_Gmb::is_connected() ) {
			return self::error_response( 'Google Business Profile is not connected. Use Connect in Settings → GMB.', 401 );
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return self::error_response( 'Post not found.', 404 );
		}

		$summary = is_array( $body ) && ! empty( $body['summary'] ) ? sanitize_textarea_field( (string) $body['summary'] ) : '';
		if ( $summary === '' ) {
			$summary = Neo_Pulse_Wp_Gmb::summarize_post( $post_id );
			if ( is_wp_error( $summary ) ) {
				return self::wp_error_response( $summary );
			}
		}

		$cta_url   = get_permalink( $post_id );
		$image_url = get_the_post_thumbnail_url( $post_id, 'large' );
		if ( ! $image_url ) {
			$image_url = null;
		}

		$result = Neo_Pulse_Wp_Gmb::create_local_post( $summary, $cta_url, $image_url );
		if ( is_wp_error( $result ) ) {
			return self::wp_error_response( $result );
		}

		return new WP_REST_Response(
			array(
				'ok'        => true,
				'summary'   => $summary,
				'post_name' => $result['post_name'] ?? '',
				'cta_url'   => $cta_url,
				'image_url' => $image_url,
			),
			200
		);
	}

	/**
	 * GET /neo-pulse/v1/gmb/status
	 */
	public static function connection_status(): WP_REST_Response {
		return new WP_REST_Response(
			array(
				'configured'  => Neo_Pulse_Wp_Gmb::is_configured(),
				'connected'   => Neo_Pulse_Wp_Gmb::is_connected(),
				'location_id' => Neo_Pulse_Wp_Gmb::get_location_id(),
				'redirect_uri' => Neo_Pulse_Wp_Gmb::get_redirect_uri(),
			),
			200
		);
	}

	private static function error_response( string $message, int $status = 400 ): WP_REST_Response {
		return new WP_REST_Response(
			array( 'ok' => false, 'error' => $message ),
			$status
		);
	}

	private static function wp_error_response( WP_Error $error ): WP_REST_Response {
		$data   = $error->get_error_data();
		$status = is_array( $data ) && isset( $data['status'] ) ? (int) $data['status'] : 400;
		return new WP_REST_Response(
			array(
				'ok'    => false,
				'error' => $error->get_error_message(),
				'code'  => $error->get_error_code(),
			),
			$status
		);
	}
}
