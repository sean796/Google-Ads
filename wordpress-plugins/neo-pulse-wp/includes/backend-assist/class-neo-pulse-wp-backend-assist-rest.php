<?php
/**
 * Backend Assist — REST route registration and entrypoints
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Backend_Assist_Rest {

	public static function register_routes(): void {
		$admin_perm = function () {
			return current_user_can( 'edit_posts' );
		};

		register_rest_route( Neo_Pulse_Wp_Backend_Assist_Context::REST_NAMESPACE, '/backend-assist', array(
			'methods'             => 'POST',
			'callback'            => array( 'Neo_Pulse_Wp_Backend_Assist', 'rest_handle' ),
			'permission_callback' => $admin_perm,
		) );

		register_rest_route( Neo_Pulse_Wp_Backend_Assist_Context::REST_NAMESPACE, '/backend-assist/step', array(
			'methods'             => 'POST',
			'callback'            => array( 'Neo_Pulse_Wp_Backend_Assist', 'rest_step_handle' ),
			'permission_callback' => $admin_perm,
		) );

		register_rest_route( Neo_Pulse_Wp_Backend_Assist_Context::REST_NAMESPACE, '/backend-assist/workflow/(?P<workflow_id>[a-zA-Z0-9_]+)/status', array(
			'methods'             => 'GET',
			'callback'            => array( 'Neo_Pulse_Wp_Backend_Assist', 'rest_workflow_status' ),
			'permission_callback' => $admin_perm,
		) );

		register_rest_route( Neo_Pulse_Wp_Backend_Assist_Context::REST_NAMESPACE, '/backend-assist/sessions', array(
			array(
				'methods'             => 'GET',
				'callback'            => array( 'Neo_Pulse_Wp_Backend_Assist', 'rest_sessions_list' ),
				'permission_callback' => $admin_perm,
			),
			array(
				'methods'             => 'POST',
				'callback'            => array( 'Neo_Pulse_Wp_Backend_Assist', 'rest_sessions_save' ),
				'permission_callback' => $admin_perm,
			),
			array(
				'methods'             => 'DELETE',
				'callback'            => array( 'Neo_Pulse_Wp_Backend_Assist', 'rest_sessions_clear' ),
				'permission_callback' => $admin_perm,
			),
		) );

		register_rest_route( Neo_Pulse_Wp_Backend_Assist_Context::REST_NAMESPACE, '/backend-assist/undo', array(
			'methods'             => 'POST',
			'callback'            => array( 'Neo_Pulse_Wp_Backend_Assist', 'rest_undo_handle' ),
			'permission_callback' => $admin_perm,
		) );

		register_rest_route( Neo_Pulse_Wp_Backend_Assist_Context::REST_NAMESPACE, '/backend-assist/sessions/(?P<id>[a-zA-Z0-9_-]+)', array(
			array(
				'methods'             => 'GET',
				'callback'            => array( 'Neo_Pulse_Wp_Backend_Assist', 'rest_session_get' ),
				'permission_callback' => $admin_perm,
			),
			array(
				'methods'             => 'DELETE',
				'callback'            => array( 'Neo_Pulse_Wp_Backend_Assist', 'rest_session_delete' ),
				'permission_callback' => $admin_perm,
			),
		) );
	}
	public static function rest_handle( WP_REST_Request $request ): WP_REST_Response {
		$api_key = Neo_Pulse_Wp_OpenRouter::get_api_key();
		if ( $api_key === '' ) {
			return new WP_REST_Response(
				array( 'error' => __( 'OpenRouter API key is not configured.', 'neo-pulse-wp' ) ),
				503
			);
		}

		$body    = $request->get_json_params();
		$message = isset( $body['message'] ) ? sanitize_textarea_field( wp_unslash( $body['message'] ) ) : '';
		$history = Neo_Pulse_Wp_Backend_Assist_Cards::normalize_history( isset( $body['history'] ) && is_array( $body['history'] ) ? $body['history'] : array() );
		$mode    = isset( $body['mode'] ) ? sanitize_text_field( $body['mode'] ) : '';

		if ( trim( $message ) === '' ) {
			return new WP_REST_Response(
				array( 'error' => __( 'Message cannot be empty.', 'neo-pulse-wp' ) ),
				400
			);
		}

		$builder_ctx = isset( $body['builder_context'] ) && is_array( $body['builder_context'] ) ? $body['builder_context'] : null;
		if ( null === $builder_ctx && class_exists( 'Neo_Pulse_Wp_Chat_Super_Admin' ) ) {
			$submode       = isset( $body['admin_submode'] ) ? sanitize_key( (string) $body['admin_submode'] ) : ( $mode !== '' ? $mode : 'ask' );
			$builder_ctx   = Neo_Pulse_Wp_Chat_Super_Admin::build_builder_context_from_request( is_array( $body ) ? $body : null, $submode );
		}
		Neo_Pulse_Wp_Backend_Assist_Context::$builder_context = $builder_ctx;

		if ( $mode === 'plan' ) {
			$card = Neo_Pulse_Wp_Backend_Assist_Pipeline::run_plan( $message, $history );
		} elseif ( $mode === 'build' ) {
			$card = Neo_Pulse_Wp_Backend_Assist_Build_Harness::run_build( $message, $history );
		} else {
			$card = Neo_Pulse_Wp_Backend_Assist_Pipeline::run_pipeline( $message, $history );
		}

		Neo_Pulse_Wp_Backend_Assist_Context::$builder_context = null;

		if ( class_exists( 'Neo_Pulse_Wp_Chat_Super_Admin' ) && is_array( $card ) ) {
			$card = Neo_Pulse_Wp_Chat_Super_Admin::map_card_for_frontend_public( $card );
		}

		return new WP_REST_Response( $card, 200 );
	}
	public static function rest_step_handle( WP_REST_Request $request ): WP_REST_Response {
		$api_key = Neo_Pulse_Wp_OpenRouter::get_api_key();
		if ( $api_key === '' ) {
			return new WP_REST_Response(
				array( 'error' => __( 'OpenRouter API key is not configured.', 'neo-pulse-wp' ) ),
				503
			);
		}

		$body         = $request->get_json_params();
		$workflow_id  = isset( $body['workflow_id'] ) ? sanitize_text_field( $body['workflow_id'] ) : '';
		$step_index   = isset( $body['step_index'] ) ? absint( $body['step_index'] ) : 0;
		$message      = isset( $body['message'] ) ? sanitize_textarea_field( wp_unslash( $body['message'] ) ) : '';
		$history      = Neo_Pulse_Wp_Backend_Assist_Cards::normalize_history( isset( $body['history'] ) && is_array( $body['history'] ) ? $body['history'] : array() );

		if ( $workflow_id === '' ) {
			return new WP_REST_Response( array( 'error' => __( 'workflow_id is required.', 'neo-pulse-wp' ) ), 400 );
		}

		$builder_ctx = isset( $body['builder_context'] ) && is_array( $body['builder_context'] ) ? $body['builder_context'] : null;
		Neo_Pulse_Wp_Backend_Assist_Context::$builder_context = $builder_ctx;

		$result = Neo_Pulse_Wp_Backend_Assist_Workflow::execute_workflow_step( $workflow_id, $step_index, $message, $history );

		Neo_Pulse_Wp_Backend_Assist_Context::$builder_context = null;

		if ( isset( $result['error'] ) ) {
			$code = isset( $result['http_status'] ) ? (int) $result['http_status'] : 400;
			unset( $result['http_status'] );
			return new WP_REST_Response( $result, $code );
		}

		return new WP_REST_Response( $result, 200 );
	}
	public static function rest_workflow_status( WP_REST_Request $request ): WP_REST_Response {
		$workflow_id = sanitize_text_field( (string) $request->get_param( 'workflow_id' ) );
		$workflow    = Neo_Pulse_Wp_Backend_Assist_Workflow::load_workflow( $workflow_id );

		if ( null === $workflow ) {
			return new WP_REST_Response(
				array( 'error' => __( 'Workflow not found.', 'neo-pulse-wp' ) ),
				404
			);
		}

		$outline_titles = array();
		if ( ! empty( $workflow['outline'] ) && is_array( $workflow['outline'] ) ) {
			foreach ( $workflow['outline'] as $sec ) {
				if ( is_array( $sec ) && ! empty( $sec['title'] ) ) {
					$outline_titles[] = (string) $sec['title'];
				}
			}
		}

		return new WP_REST_Response(
			array(
				'steps'          => Neo_Pulse_Wp_Backend_Assist_Workflow::workflow_steps_for_card( $workflow['steps'] ),
				'outline_titles' => $outline_titles,
			),
			200
		);
	}

	public static function rest_undo_handle( WP_REST_Request $request ): WP_REST_Response {
		$body    = $request->get_json_params();
		$post_id = isset( $body['post_id'] ) ? absint( $body['post_id'] ) : 0;

		if ( $post_id < 1 ) {
			return new WP_REST_Response(
				array( 'error' => __( 'post_id is required.', 'neo-pulse-wp' ) ),
				400
			);
		}

		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_REST_Response(
				array( 'error' => __( 'You do not have permission to edit this post.', 'neo-pulse-wp' ) ),
				403
			);
		}

		$result = Neo_Pulse_Wp_Backend_Assist::tool_restore_post_revision( array( 'post_id' => $post_id ) );
		if ( empty( $result['success'] ) ) {
			return new WP_REST_Response(
				array( 'error' => isset( $result['error'] ) ? (string) $result['error'] : __( 'Undo failed.', 'neo-pulse-wp' ) ),
				400
			);
		}

		$card = Neo_Pulse_Wp_Backend_Assist_Cards::action_card( $result, 'restore_post_revision' );
		$card = Neo_Pulse_Wp_Backend_Assist_Cards::enrich_card( $card, 'restore_post_revision', $result );

		return new WP_REST_Response( $card, 200 );
	}
}
