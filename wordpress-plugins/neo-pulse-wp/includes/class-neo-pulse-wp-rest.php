<?php
/**
 * REST routes: authenticated post content for NEO Pulse server.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers REST routes.
 */
class Neo_Pulse_Wp_Rest {

	/**
	 * Hook registrations.
	 */
	public static function init(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * Register REST API routes.
	 */
	public static function register_routes(): void {
		register_rest_route(
			'neo-pulse/v1',
			'/post-content/(?P<id>\d+)',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'get_post_content' ),
				'permission_callback' => array( __CLASS__, 'post_content_permission_check' ),
				'args'                => array(
					'id' => array(
						'description' => __( 'Post ID.', 'neo-pulse-wp' ),
						'type'        => 'integer',
					),
				),
			)
		);
	}

	/**
	 * Require Application Password (or cookie) auth and ability to edit the post.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return bool|\WP_Error
	 */
	public static function post_content_permission_check( $request ) {
		$id = isset( $request['id'] ) ? (int) $request['id'] : 0;
		if ( $id < 1 ) {
			return new \WP_Error(
				'rest_invalid_param',
				__( 'Invalid post ID.', 'neo-pulse-wp' ),
				array( 'status' => 400 )
			);
		}

		if ( ! is_user_logged_in() ) {
			return new \WP_Error(
				'rest_not_logged_in',
				__( 'Authentication required.', 'neo-pulse-wp' ),
				array( 'status' => 401 )
			);
		}

		if ( ! current_user_can( 'edit_post', $id ) ) {
			return new \WP_Error(
				'rest_forbidden',
				__( 'You do not have permission to access this post.', 'neo-pulse-wp' ),
				array( 'status' => 403 )
			);
		}

		return true;
	}

	/**
	 * Rendered post body as HTML (same path as neo-pulse/v1/post-content).
	 * Password-protected posts return '' unless the current user can edit the post.
	 */
	public static function get_rendered_content_html( int $post_id ): string {
		$post_obj = get_post( $post_id );
		if ( ! $post_obj instanceof \WP_Post ) {
			return '';
		}
		if ( (string) $post_obj->post_password !== '' && ! current_user_can( 'edit_post', $post_id ) ) {
			return '';
		}

		global $post;
		$prev_post = $post;
		$post      = $post_obj;
		setup_postdata( $post );
		$content_html = apply_filters( 'the_content', $post->post_content );
		wp_reset_postdata();
		$post = $prev_post;

		if ( ! is_string( $content_html ) || trim( $content_html ) === '' ) {
			return '';
		}

		return trim( $content_html );
	}

	/**
	 * Rendered post body as plain text (same path as neo-pulse/v1/post-content).
	 * Password-protected posts return '' unless the current user can edit the post (via get_rendered_content_html()).
	 */
	public static function get_rendered_content_plain( int $post_id ): string {
		$content_html = self::get_rendered_content_html( $post_id );
		if ( $content_html === '' ) {
			return '';
		}

		return trim( preg_replace( '/\s+/', ' ', wp_strip_all_tags( $content_html ) ) );
	}

	/**
	 * Return post fields for NEO Pulse Node (same shape consumers expect after wp/v2 mapping).
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function get_post_content( $request ) {
		$id       = (int) $request['id'];
		$post_obj = get_post( $id );

		if ( ! $post_obj instanceof \WP_Post ) {
			return new \WP_Error(
				'rest_post_invalid_id',
				__( 'Post not found.', 'neo-pulse-wp' ),
				array( 'status' => 404 )
			);
		}

		// Also enforced here for internal callers that bypass the route permission callback
		// (e.g. the wp_get_post_content tool): unpublished / password-protected content is
		// only returned to users who can edit the post.
		if ( ! current_user_can( 'edit_post', $id ) ) {
			return new \WP_Error(
				'rest_forbidden',
				__( 'You do not have permission to access this post.', 'neo-pulse-wp' ),
				array( 'status' => 403 )
			);
		}

		$excerpt_raw  = $post_obj->post_excerpt;
		$excerpt_html = $excerpt_raw !== '' ? apply_filters( 'the_excerpt', $excerpt_raw ) : '';

		global $post;
		$prev_post = $post;
		$post      = $post_obj;
		setup_postdata( $post );
		$content_html = apply_filters( 'the_content', $post->post_content );
		wp_reset_postdata();
		$post = $prev_post;

		$title = get_the_title( $post_obj );
		if ( $title === '' ) {
			$title = __( '(No title)', 'neo-pulse-wp' );
		}

		$ptype     = $post_obj->post_type;
		$rest_base = $ptype;
		$pto       = get_post_type_object( $ptype );
		if ( $pto && ! empty( $pto->rest_base ) ) {
			$rest_base = (string) $pto->rest_base;
		}

		$data = array(
			'id'               => (int) $post_obj->ID,
			'slug'             => (string) $post_obj->post_name,
			'title'            => $title,
			'content'          => is_string( $content_html ) ? $content_html : '',
			'excerpt'          => is_string( $excerpt_html ) ? $excerpt_html : '',
			'date_gmt'         => $post_obj->post_date_gmt ?: get_gmt_from_date( $post_obj->post_date ),
			'date'             => $post_obj->post_date,
			'status'           => $post_obj->post_status,
			'link'             => get_permalink( $post_obj ) ?: '',
			'categories'       => wp_get_post_categories( $id ),
			'tags'             => wp_get_post_tags( $id, array( 'fields' => 'ids' ) ),
			'postTypeEndpoint' => $rest_base,
			'postTypeSubtype'  => $ptype,
			'fullData'         => array(
				'source' => 'neo_pulse_wp_plugin',
			),
		);

		return new \WP_REST_Response( $data, 200 );
	}
}
