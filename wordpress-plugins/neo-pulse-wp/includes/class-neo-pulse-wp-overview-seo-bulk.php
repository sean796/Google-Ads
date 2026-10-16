<?php
/**
 * Bulk Overview SEO import: one REST request, all rows applied on WordPress (no per-post REST).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers POST /neo-pulse/v1/overview-seo/bulk
 */
class Neo_Pulse_Wp_Overview_Seo_Bulk {

	public static function init(): void {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	public static function register_routes(): void {
		register_rest_route(
			'neo-pulse/v1',
			'/overview-seo/bulk',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'bulk_import' ),
				'permission_callback' => array( __CLASS__, 'permission_check' ),
			)
		);
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return bool|\WP_Error
	 */
	public static function permission_check( $request ) {
		unset( $request );
		if ( ! is_user_logged_in() ) {
			return new \WP_Error(
				'rest_not_logged_in',
				__( 'Authentication required.', 'neo-pulse-wp' ),
				array( 'status' => 401 )
			);
		}
		if ( ! current_user_can( 'edit_posts' ) ) {
			return new \WP_Error(
				'rest_forbidden',
				__( 'You do not have permission to edit posts.', 'neo-pulse-wp' ),
				array( 'status' => 403 )
			);
		}
		return true;
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function bulk_import( $request ) {
		$params = $request->get_json_params();
		$items  = isset( $params['items'] ) && is_array( $params['items'] ) ? $params['items'] : array();
		if ( $items === array() ) {
			return new \WP_Error(
				'neo-pulse_empty',
				__( 'items array is empty.', 'neo-pulse-wp' ),
				array( 'status' => 400 )
			);
		}

		$results = array();
		$ok_count = 0;

		foreach ( $items as $index => $raw ) {
			$row_index = isset( $raw['index'] ) ? (int) $raw['index'] : (int) $index;
			$post_id   = isset( $raw['postId'] ) ? absint( $raw['postId'] ) : 0;
			if ( $post_id < 1 ) {
				$results[] = array(
					'postId' => null,
					'index'  => $row_index,
					'ok'     => false,
					'error'  => 'Invalid postId',
					'method' => 'plugin_bulk',
				);
				continue;
			}

			$applied = self::apply_item( $post_id, $raw );
			if ( is_wp_error( $applied ) ) {
				$results[] = array(
					'postId' => $post_id,
					'index'  => $row_index,
					'ok'     => false,
					'error'  => $applied->get_error_message(),
					'method' => 'plugin_bulk',
				);
				continue;
			}

			$results[] = array(
				'postId' => $post_id,
				'index'  => $row_index,
				'ok'     => true,
				'method' => 'plugin_bulk',
			);
			$ok_count += 1;
		}

		return new \WP_REST_Response(
			array(
				'success' => $ok_count > 0,
				'results' => $results,
				'okCount' => $ok_count,
				'total'   => count( $items ),
			),
			200
		);
	}

	/**
	 * @param int                  $post_id Post ID.
	 * @param array<string,mixed>  $raw     Item payload.
	 * @return true|\WP_Error
	 */
	private static function apply_item( int $post_id, array $raw ) {
		$post = get_post( $post_id );
		if ( ! $post instanceof \WP_Post ) {
			return new \WP_Error( 'neo-pulse_post', __( 'Post not found.', 'neo-pulse-wp' ) );
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return new \WP_Error( 'neo-pulse_forbidden', __( 'You do not have permission to edit this post.', 'neo-pulse-wp' ) );
		}

		$meta = isset( $raw['meta'] ) && is_array( $raw['meta'] ) ? $raw['meta'] : array();
		$acf  = isset( $raw['acf'] ) && is_array( $raw['acf'] ) ? $raw['acf'] : array();

		/*
		 * Allow-list: only the three Rank Math meta keys and the ACF keys in $acf_map
		 * may be written. Anything else is skipped so callers cannot write arbitrary
		 * post meta (e.g. _wp_page_template, _edit_lock, other plugins' keys); the item
		 * only fails when nothing allowed was sent.
		 */
		$meta_keys = array( 'rank_math_title', 'rank_math_description', 'rank_math_focus_keyword' );
		$acf_map   = array(
			'keyword_focus'     => array( 'keyword_focus' ),
			'keyword_focu'      => array( 'keyword_focus' ),
			'faq'               => array( 'faq', 'seo_faq' ),
			'seo_faq'           => array( 'seo_faq', 'faq' ),
			'date_modifier'     => array( 'date_modifier', 'seo_date_modifier' ),
			'seo_date_modifier' => array( 'date_modifier', 'seo_date_modifier' ),
			'seo_research'      => array( 'seo_research' ),
		);

		$rejected = array();
		foreach ( array_keys( $meta ) as $key ) {
			if ( ! in_array( (string) $key, $meta_keys, true ) ) {
				$rejected[] = 'meta.' . (string) $key;
				unset( $meta[ $key ] );
			}
		}
		foreach ( array_keys( $acf ) as $key ) {
			if ( ! is_string( $key ) || ! isset( $acf_map[ $key ] ) ) {
				$rejected[] = 'acf.' . (string) $key;
				unset( $acf[ $key ] );
			}
		}
		if ( $rejected !== array() && $meta === array() && $acf === array() ) {
			return new \WP_Error(
				'neo-pulse_unsupported_keys',
				sprintf(
					/* translators: %s: comma-separated list of rejected keys. */
					__( 'Unsupported keys: %s', 'neo-pulse-wp' ),
					implode( ', ', array_map( 'sanitize_text_field', $rejected ) )
				)
			);
		}

		$did = false;

		if ( isset( $meta['rank_math_title'] ) && is_string( $meta['rank_math_title'] ) ) {
			$title = trim( $meta['rank_math_title'] );
			if ( $title !== '' ) {
				Neo_Pulse_Wp_Ai_Apply::write_title( $post_id, Neo_Pulse_Wp_Ai_Seo_Limits::normalize_title( $title ) );
				$did = true;
			}
		}

		if ( isset( $meta['rank_math_description'] ) && is_string( $meta['rank_math_description'] ) ) {
			$desc = trim( $meta['rank_math_description'] );
			if ( $desc !== '' ) {
				$focus = Neo_Pulse_Wp_Ai_Context::read_focus_keyword( $post_id );
				Neo_Pulse_Wp_Ai_Apply::write_excerpt(
					$post_id,
					Neo_Pulse_Wp_Ai_Seo_Limits::normalize_description( $desc, $focus )
				);
				$did = true;
			}
		}

		if ( isset( $meta['rank_math_focus_keyword'] ) && is_string( $meta['rank_math_focus_keyword'] ) ) {
			$kw = trim( $meta['rank_math_focus_keyword'] );
			if ( $kw !== '' ) {
				Neo_Pulse_Wp_Ai_Apply::write_focus_keyword( $post_id, $kw );
				$did = true;
			}
		}

		foreach ( $acf as $key => $value ) {
			if ( $value === null || $value === '' || ! is_scalar( $value ) ) {
				continue;
			}
			$text = trim( (string) $value );
			if ( $text === '' ) {
				continue;
			}
			foreach ( $acf_map[ $key ] as $target ) {
				Neo_Pulse_Wp_Ai_Apply::write_acf_or_meta( $post_id, $target, $text );
			}
			$did = true;
		}

		if ( ! $did ) {
			return new \WP_Error( 'neo-pulse_empty', __( 'Nothing to update (empty meta and acf).', 'neo-pulse-wp' ) );
		}

		Neo_Pulse_Wp_Ai_Apply::maybe_sync_post_title_from_seo_research( $post_id );

		return true;
	}
}
