<?php
/**
 * REST routes for NEO Pulse AI editor wands.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Ai_Rest {

	public static function init(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	public static function register_routes(): void {
		register_rest_route(
			'neo-pulse/v1',
			'/ai/status',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'status' ),
				'permission_callback' => array( __CLASS__, 'logged_in_permission' ),
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
			'/ai/preview',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'preview' ),
				'permission_callback' => array( __CLASS__, 'edit_post_permission' ),
				'args'                => array(
					'post_id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
					'field'   => array(
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => 'sanitize_key',
					),
				),
			)
		);

		register_rest_route(
			'neo-pulse/v1',
			'/ai/apply',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'apply' ),
				'permission_callback' => array( __CLASS__, 'edit_post_permission' ),
				'args'                => array(
					'post_id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
					'field'   => array(
						'type'              => 'string',
						'required'          => true,
						'sanitize_callback' => 'sanitize_key',
					),
					'value'   => array(
						'type'     => 'string',
						'required' => true,
					),
				),
			)
		);

		register_rest_route(
			'neo-pulse/v1',
			'/ai/save-meta',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'save_meta' ),
				'permission_callback' => array( __CLASS__, 'edit_post_permission' ),
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
			'/ai/gsc-suggestions',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'gsc_suggestions' ),
				'permission_callback' => array( __CLASS__, 'edit_post_permission' ),
				'args'                => array(
					'post_id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
					'focus_keyword' => array(
						'type'              => 'string',
						'required'          => false,
						'sanitize_callback' => 'sanitize_text_field',
					),
				),
			)
		);

		register_rest_route(
			'neo-pulse/v1',
			'/ai/seo-research-brief',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'seo_research_brief' ),
				'permission_callback' => array( __CLASS__, 'edit_post_permission' ),
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
			'/ai/change-url',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'change_url' ),
				'permission_callback' => array( __CLASS__, 'edit_post_permission' ),
				'args'                => array(
					'post_id' => array(
						'type'              => 'integer',
						'required'          => true,
						'sanitize_callback' => 'absint',
					),
				),
			)
		);
	}

	/**
	 * @return bool|\WP_Error
	 */
	public static function logged_in_permission() {
		if ( ! is_user_logged_in() ) {
			return new WP_Error( 'rest_not_logged_in', __( 'Authentication required.', 'neo-pulse-wp' ), array( 'status' => 401 ) );
		}
		return true;
	}

	/**
	 * @param WP_REST_Request $request
	 * @return bool|\WP_Error
	 */
	public static function edit_post_permission( $request ) {
		if ( ! is_user_logged_in() ) {
			return new WP_Error( 'rest_not_logged_in', __( 'Authentication required.', 'neo-pulse-wp' ), array( 'status' => 401 ) );
		}
		$post_id = (int) $request->get_param( 'post_id' );
		if ( $post_id < 1 || ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error( 'rest_forbidden', __( 'You do not have permission to edit this post.', 'neo-pulse-wp' ), array( 'status' => 403 ) );
		}
		return true;
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|\WP_Error
	 */
	public static function status( $request ) {
		$post_id = (int) $request->get_param( 'post_id' );
		return new WP_REST_Response( Neo_Pulse_Wp_Ai_Gate::get_status( $post_id ), 200 );
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|\WP_Error
	 */
	public static function preview( $request ) {
		$post_id   = (int) $request->get_param( 'post_id' );
		$field     = sanitize_key( (string) $request->get_param( 'field' ) );
		$body      = $request->get_json_params();
		$overrides = self::parse_preview_context( $body );
		$faq_step  = is_array( $body ) && ! empty( $body['faqStep'] ) ? sanitize_key( (string) $body['faqStep'] ) : '';

		if ( $field === 'faq' && $faq_step !== '' ) {
			$result = Neo_Pulse_Wp_Ai_Enhance::preview_faq_step( $post_id, $faq_step, $overrides, is_array( $body ) ? $body : array() );
		} else {
			$result = Neo_Pulse_Wp_Ai_Enhance::preview( $post_id, $field, $overrides );
		}
		if ( is_wp_error( $result ) ) {
			return self::error_response( $result );
		}
		return new WP_REST_Response( $result, 200 );
	}

	/**
	 * @param mixed $body
	 * @return array<string,string>
	 */
	private static function parse_preview_context( $body ): array {
		if ( ! is_array( $body ) || empty( $body['context'] ) || ! is_array( $body['context'] ) ) {
			return array();
		}
		$out  = array();
		$keys = array( 'seoResearch', 'focusKeyword', 'seoTitle', 'metaDescription', 'faq', 'pageUrl' );
		foreach ( $keys as $key ) {
			if ( array_key_exists( $key, $body['context'] ) ) {
				$out[ $key ] = (string) $body['context'][ $key ];
			}
		}
		return $out;
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|\WP_Error
	 */
	public static function apply( $request ) {
		$post_id = (int) $request->get_param( 'post_id' );
		$field   = sanitize_key( (string) $request->get_param( 'field' ) );
		$value   = (string) $request->get_param( 'value' );
		$result  = Neo_Pulse_Wp_Ai_Apply::apply( $post_id, $field, $value );
		if ( is_wp_error( $result ) ) {
			return self::error_response( $result );
		}

		return new WP_REST_Response( $result, 200 );
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|\WP_Error
	 */
	public static function save_meta( $request ) {
		$post_id = (int) $request->get_param( 'post_id' );
		$body    = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}

		$fields = array();
		foreach ( array( 'seoTitle', 'metaDescription', 'focusKeyword', 'seoResearch', 'faq', 'pageUrl' ) as $key ) {
			if ( array_key_exists( $key, $body ) ) {
				$fields[ $key ] = (string) $body[ $key ];
			}
		}

		$result = Neo_Pulse_Wp_Ai_Apply::save_meta( $post_id, $fields );
		if ( is_wp_error( $result ) ) {
			return self::error_response( $result );
		}

		return new WP_REST_Response( $result, 200 );
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|\WP_Error
	 */
	public static function gsc_suggestions( $request ) {
		$post_id = (int) $request->get_param( 'post_id' );
		$focus   = sanitize_text_field( (string) $request->get_param( 'focus_keyword' ) );
		if ( $focus === '' ) {
			$focus = Neo_Pulse_Wp_Ai_Context::read_focus_keyword( $post_id );
		}
		$result = Neo_Pulse_Wp_Ai_Gsc::get_suggestions( $post_id, $focus );
		if ( is_wp_error( $result ) ) {
			return self::error_response( $result );
		}
		return new WP_REST_Response( $result, 200 );
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response|\WP_Error
	 */
	public static function seo_research_brief( $request ) {
		$post_id = (int) $request->get_param( 'post_id' );
		$body    = $request->get_json_params();
		$focus   = '';
		if ( is_array( $body ) && isset( $body['focusKeyword'] ) ) {
			$focus = sanitize_text_field( (string) $body['focusKeyword'] );
		}
		$result = Neo_Pulse_Wp_Ai_Seo_Research::build_brief( $post_id, $focus );
		if ( is_wp_error( $result ) ) {
			return self::error_response( $result );
		}
		return new WP_REST_Response( $result, 200 );
	}

	/**
	 * @param WP_REST_Request $request
	 * @return WP_REST_Response
	 */
	public static function change_url( $request ) {
		$post_id = (int) $request->get_param( 'post_id' );
		$body    = $request->get_json_params();
		$slug    = '';
		$create  = false;
		if ( is_array( $body ) ) {
			if ( isset( $body['slug'] ) ) {
				$slug = sanitize_text_field( (string) $body['slug'] );
			}
			if ( isset( $body['create_redirect'] ) ) {
				$create = (bool) $body['create_redirect'];
			}
		}

		$result = Neo_Pulse_Wp_Ai_Url::change_url( $post_id, $slug, $create );
		if ( is_wp_error( $result ) ) {
			return self::error_response( $result );
		}
		return new WP_REST_Response( $result, 200 );
	}

	/**
	 * @param WP_Error $error
	 * @return WP_REST_Response
	 */
	private static function error_response( WP_Error $error ): WP_REST_Response {
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
