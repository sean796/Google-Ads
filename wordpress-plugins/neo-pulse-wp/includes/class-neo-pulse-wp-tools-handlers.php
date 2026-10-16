<?php
/**
 * Tool handler implementations for Neo_Pulse_Wp_Tools.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Tools_Handlers {

	/**
	 * Build an internal REST request whose params are readable via get_json_params()
	 * (JSON body + Content-Type header) and via get_param() (body params).
	 *
	 * @param string               $method HTTP method.
	 * @param string               $route  Route.
	 * @param array<string, mixed> $params Body params.
	 * @return WP_REST_Request
	 */
	private static function json_request( string $method, string $route, array $params ): WP_REST_Request {
		$req = new WP_REST_Request( $method, $route );
		$req->set_header( 'Content-Type', 'application/json' );
		$req->set_body( (string) wp_json_encode( $params ) );
		$req->set_body_params( $params );
		return $req;
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_ping( array $params ): array {
		return array(
			'ok'      => true,
			'name'    => 'NEO Pulse WP',
			'version' => NEO_PULSE_WP_VERSION,
		);
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_whoami( array $params ) {
		$user = wp_get_current_user();
		return array(
			'ok'       => true,
			'id'       => (int) $user->ID,
			'username' => $user->user_login,
			'roles'    => $user->roles,
			'caps'     => array(
				'edit_posts'      => current_user_can( 'edit_posts' ),
				'manage_options'  => current_user_can( 'manage_options' ),
				'publish_posts'   => current_user_can( 'publish_posts' ),
			),
		);
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_site_dashboard( array $params ): array {
		$rs = Neo_Pulse_Wp_Api::fetch_plugin_dashboard_state();
		return array( 'ok' => ! empty( $rs['ok'] ), 'dashboard' => $rs );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_site_index( array $params ): array {
		// Drafts/private items in the index belong to all authors: editors only.
		$include_drafts = ! empty( $params['include_drafts'] ) && current_user_can( 'edit_others_posts' );
		$limit          = isset( $params['limit'] ) ? max( 1, min( 500, (int) $params['limit'] ) ) : 500;
		$index          = Neo_Pulse_Wp_Chat_Rag::get_agent_site_index( $include_drafts );
		return array( 'ok' => true, 'count' => count( $index ), 'items' => array_slice( $index, 0, $limit ) );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_site_index_search( array $params ): array {
		$query = isset( $params['query'] ) ? (string) $params['query'] : '';
		$limit = isset( $params['limit'] ) ? max( 1, min( 50, (int) $params['limit'] ) ) : 8;
		$items = Neo_Pulse_Wp_Chat_Rag::retrieve_agent( $query, $limit );
		return array( 'ok' => true, 'query' => $query, 'items' => $items );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_openrouter_status( array $params ): array {
		return array(
			'ok'        => true,
			'configured' => Neo_Pulse_Wp_OpenRouter::get_api_key() !== '',
		);
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_chat_settings_get( array $params ): array {
		$settings = Neo_Pulse_Wp_Chat::get_settings();
		return array(
			'ok'             => true,
			'enabled'        => ! empty( $settings['enabled'] ),
			'logged_in_only' => ! empty( $settings['logged_in_only'] ),
		);
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_chat_settings_update( array $params ) {
		$patch = array();
		if ( array_key_exists( 'enabled', $params ) ) {
			$patch['enabled'] = ! empty( $params['enabled'] );
		}
		if ( array_key_exists( 'logged_in_only', $params ) ) {
			$patch['logged_in_only'] = ! empty( $params['logged_in_only'] );
		}
		if ( array_key_exists( 'header_search_opens_sidebar', $params ) ) {
			$patch['header_search_opens_sidebar'] = ! empty( $params['header_search_opens_sidebar'] );
		}
		if ( empty( $patch ) ) {
			return new WP_Error( 'neo_pulse_chat_settings', __( 'No settings to update.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		Neo_Pulse_Wp_Chat::save_settings( $patch );
		if ( array_key_exists( 'header_search_opens_sidebar', $patch ) ) {
			$design = Neo_Pulse_Wp_Ai_Widget_Design::get_settings();
			if ( ! isset( $design['chat_sidebar'] ) || ! is_array( $design['chat_sidebar'] ) ) {
				$design['chat_sidebar'] = Neo_Pulse_Wp_Ai_Widget_Design::default_chat_sidebar_config();
			}
			$design['chat_sidebar']['header_search_opens_sidebar'] = ! empty( $patch['header_search_opens_sidebar'] );
			Neo_Pulse_Wp_Ai_Widget_Design::save( $design );
		}
		$settings = Neo_Pulse_Wp_Chat::get_settings();
		return array(
			'ok'                           => true,
			'enabled'                      => ! empty( $settings['enabled'] ),
			'logged_in_only'               => ! empty( $settings['logged_in_only'] ),
			'header_search_opens_sidebar'  => ! empty( $settings['header_search_opens_sidebar'] ),
		);
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_list_posts( array $params ): array {
		$result = Neo_Pulse_Wp_Backend_Assist::tool_list_posts( $params );
		return array_merge( array( 'ok' => ! empty( $result['success'] ) ), $result );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_get_post( array $params ): array {
		$result = Neo_Pulse_Wp_Backend_Assist::tool_get_post( $params );
		return array_merge( array( 'ok' => ! empty( $result['success'] ) ), $result );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_get_post_content( array $params ) {
		$post_id = isset( $params['post_id'] ) ? (int) $params['post_id'] : 0;
		$req = new WP_REST_Request( 'GET', '/neo-pulse/v1/post-content/' . $post_id );
		$req->set_url_params( array( 'id' => $post_id ) );
		$res = Neo_Pulse_Wp_Rest::get_post_content( $req );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		return array( 'ok' => true, 'post' => $res->get_data() );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_create_post( array $params ): array {
		$result = Neo_Pulse_Wp_Backend_Assist::tool_create_post( $params );
		return array_merge( array( 'ok' => ! empty( $result['success'] ) ), $result );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_create_page( array $params ): array {
		$result = Neo_Pulse_Wp_Backend_Assist::tool_create_page( $params );
		return array_merge( array( 'ok' => ! empty( $result['success'] ) ), $result );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_update_post( array $params ) {
		$post_id = isset( $params['post_id'] ) ? (int) $params['post_id'] : 0;
		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_tools', __( 'post_id is required.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		$update = array( 'ID' => $post_id );
		if ( isset( $params['title'] ) ) {
			$update['post_title'] = sanitize_text_field( (string) $params['title'] );
		}
		if ( isset( $params['status'] ) ) {
			$status = sanitize_key( (string) $params['status'] );
			if ( ! in_array( $status, array( 'draft', 'pending', 'publish', 'private', 'future' ), true ) ) {
				return new WP_Error( 'neo-pulse_tools', __( 'Unsupported status.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
			}
			if ( in_array( $status, array( 'publish', 'private', 'future' ), true ) ) {
				$type_obj = get_post_type_object( (string) get_post_type( $post_id ) );
				if ( ! $type_obj || ! current_user_can( $type_obj->cap->publish_posts ) ) {
					return new WP_Error( 'rest_forbidden', __( 'You do not have permission to publish this content.', 'neo-pulse-wp' ), array( 'status' => 403 ) );
				}
			}
			$update['post_status'] = $status;
		}
		if ( isset( $params['excerpt'] ) ) {
			$update['post_excerpt'] = sanitize_textarea_field( (string) $params['excerpt'] );
		}
		if ( isset( $params['slug'] ) ) {
			$update['post_name'] = sanitize_title( (string) $params['slug'] );
		}
		$rs = wp_update_post( $update, true );
		if ( is_wp_error( $rs ) ) {
			return $rs;
		}
		$post = get_post( $post_id );
		return array(
			'ok'       => true,
			'post_id'  => $post_id,
			'title'    => $post instanceof WP_Post ? $post->post_title : '',
			'edit_url' => get_edit_post_link( $post_id, 'raw' ),
			'view_url' => get_permalink( $post_id ),
		);
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_add_content( array $params ): array {
		$result = Neo_Pulse_Wp_Backend_Assist::tool_add_content( $params );
		return array_merge( array( 'ok' => ! empty( $result['success'] ) ), $result );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_replace_content( array $params ) {
		$post_id = isset( $params['post_id'] ) ? (int) $params['post_id'] : 0;
		$content = isset( $params['content'] ) ? (string) $params['content'] : '';
		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_tools', __( 'post_id is required.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		self::maybe_snapshot_revision( $post_id );
		$rs = wp_update_post(
			array(
				'ID'           => $post_id,
				'post_content' => $content,
			),
			true
		);
		if ( is_wp_error( $rs ) ) {
			return $rs;
		}
		return array( 'ok' => true, 'post_id' => $post_id );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_delete_post( array $params ) {
		$post_id = isset( $params['post_id'] ) ? (int) $params['post_id'] : 0;
		$force   = ! empty( $params['force'] );
		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_tools', __( 'post_id is required.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		$rs = $force ? wp_delete_post( $post_id, true ) : wp_trash_post( $post_id );
		if ( ! $rs ) {
			return new WP_Error( 'neo-pulse_tools', __( 'Delete failed.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		return array( 'ok' => true, 'post_id' => $post_id, 'force' => $force );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_resolve_url( array $params ) {
		$url = isset( $params['url'] ) ? (string) $params['url'] : '';
		if ( $url === '' ) {
			return new WP_Error( 'neo-pulse_tools', __( 'url is required.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		$post_id = url_to_postid( $url );
		if ( $post_id < 1 ) {
			$path = wp_parse_url( $url, PHP_URL_PATH );
			if ( is_string( $path ) && $path !== '' ) {
				$posts = get_posts(
					array(
						'name'           => basename( untrailingslashit( $path ) ),
						'post_type'      => 'any',
						'post_status'    => 'any',
						'posts_per_page' => 1,
					)
				);
				if ( ! empty( $posts[0] ) ) {
					$post_id = (int) $posts[0]->ID;
				}
			}
		}
		if ( $post_id > 0 && get_post_status( $post_id ) !== 'publish' && ! current_user_can( 'edit_post', $post_id ) ) {
			$post_id = 0;
		}
		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_tools', __( 'No post found for URL.', 'neo-pulse-wp' ), array( 'status' => 404 ) );
		}
		return array( 'ok' => true, 'post_id' => $post_id, 'url' => get_permalink( $post_id ) );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_ai_status( array $params ) {
		$post_id = isset( $params['post_id'] ) ? (int) $params['post_id'] : 0;
		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_tools', __( 'post_id is required.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		return array( 'ok' => true, 'status' => Neo_Pulse_Wp_Ai_Gate::get_status( $post_id ) );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_ai_preview_field( array $params ) {
		$post_id = isset( $params['post_id'] ) ? (int) $params['post_id'] : 0;
		$field   = isset( $params['field'] ) ? sanitize_key( (string) $params['field'] ) : '';
		if ( $post_id < 1 || $field === '' ) {
			return new WP_Error( 'neo-pulse_tools', __( 'post_id and field are required.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		$overrides = isset( $params['context'] ) && is_array( $params['context'] ) ? $params['context'] : array();
		$result    = Neo_Pulse_Wp_Ai_Enhance::preview( $post_id, $field, $overrides );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return array_merge( array( 'ok' => true ), $result );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_ai_apply_field( array $params ) {
		$post_id = isset( $params['post_id'] ) ? (int) $params['post_id'] : 0;
		$field   = isset( $params['field'] ) ? sanitize_key( (string) $params['field'] ) : '';
		$value   = isset( $params['value'] ) ? (string) $params['value'] : '';
		if ( $post_id < 1 || $field === '' ) {
			return new WP_Error( 'neo-pulse_tools', __( 'post_id and field are required.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		$result = Neo_Pulse_Wp_Ai_Apply::apply( $post_id, $field, $value );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return array_merge( array( 'ok' => true ), $result );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_ai_save_meta( array $params ) {
		$post_id = isset( $params['post_id'] ) ? (int) $params['post_id'] : 0;
		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_tools', __( 'post_id is required.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		$fields = array();
		foreach ( array( 'seoTitle', 'metaDescription', 'focusKeyword', 'seoResearch', 'faq', 'pageUrl' ) as $key ) {
			if ( array_key_exists( $key, $params ) ) {
				$fields[ $key ] = (string) $params[ $key ];
			}
		}
		$result = Neo_Pulse_Wp_Ai_Apply::save_meta( $post_id, $fields );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return array_merge( array( 'ok' => true ), $result );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_ai_gsc_suggestions( array $params ) {
		$post_id = isset( $params['post_id'] ) ? (int) $params['post_id'] : 0;
		$focus   = isset( $params['focus_keyword'] ) ? sanitize_text_field( (string) $params['focus_keyword'] ) : '';
		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_tools', __( 'post_id is required.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		$result = Neo_Pulse_Wp_Ai_Gsc::get_suggestions( $post_id, $focus );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return array_merge( array( 'ok' => true ), $result );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_ai_seo_research_brief( array $params ) {
		$post_id = isset( $params['post_id'] ) ? (int) $params['post_id'] : 0;
		$focus   = isset( $params['focusKeyword'] ) ? sanitize_text_field( (string) $params['focusKeyword'] ) : '';
		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_tools', __( 'post_id is required.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		$result = Neo_Pulse_Wp_Ai_Seo_Research::build_brief( $post_id, $focus );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return array_merge( array( 'ok' => true ), $result );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_ai_optimize_meta_bundle( array $params ) {
		$post_id = isset( $params['post_id'] ) ? (int) $params['post_id'] : 0;
		$apply   = ! isset( $params['apply'] ) || ! empty( $params['apply'] );
		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_tools', __( 'post_id is required.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		$result = Neo_Pulse_Wp_Ai_Meta::run_optimize_meta( $post_id, isset( $params['primary_keyword'] ) ? (string) $params['primary_keyword'] : null );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		if ( $apply && ! empty( $result['optimizedMeta'] ) && is_array( $result['optimizedMeta'] ) ) {
			$om = $result['optimizedMeta'];
			$fields = array();
			if ( ! empty( $om['rank_math_title'] ) ) {
				$fields['seoTitle'] = (string) $om['rank_math_title'];
			}
			if ( ! empty( $om['rank_math_description'] ) ) {
				$fields['metaDescription'] = (string) $om['rank_math_description'];
			}
			if ( ! empty( $om['rank_math_focus_keyword'] ) ) {
				$fields['focusKeyword'] = (string) $om['rank_math_focus_keyword'];
			}
			if ( ! empty( $fields ) ) {
				Neo_Pulse_Wp_Ai_Apply::save_meta( $post_id, $fields );
			}
		}
		return array_merge( array( 'ok' => true, 'applied' => $apply ), $result );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_ai_lint_post( array $params ) {
		$post_id = isset( $params['post_id'] ) ? (int) $params['post_id'] : 0;
		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_tools', __( 'post_id is required.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		$issues   = array();
		$focus    = Neo_Pulse_Wp_Ai_Context::read_focus_keyword( $post_id );
		$research = Neo_Pulse_Wp_Ai_Context::read_field_value( $post_id, 'seo_research' );
		if ( $focus === '' ) {
			$issues[] = 'missing_focus_keyword';
		}
		if ( $research === '' ) {
			$issues[] = 'missing_seo_research';
		}
		$gate = Neo_Pulse_Wp_Ai_Gate::collect_reasons( $post_id );
		return array(
			'ok'     => true,
			'issues' => $issues,
			'gate'   => $gate,
			'ai'     => Neo_Pulse_Wp_Ai_Gate::get_status( $post_id ),
		);
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_body_sections( array $params ) {
		$req = new WP_REST_Request( 'GET', '/neo-pulse/v1/ai/body/sections' );
		$req->set_param( 'post_id', (int) ( $params['post_id'] ?? 0 ) );
		$res = Neo_Pulse_Wp_Ai_Body_Rest::sections_from_post( $req );
		return $res->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_body_posts_inventory( array $params ) {
		$req = new WP_REST_Request( 'GET', '/neo-pulse/v1/ai/body/posts-inventory' );
		$req->set_param( 'post_id', (int) ( $params['post_id'] ?? 0 ) );
		$res = Neo_Pulse_Wp_Ai_Body_Rest::posts_inventory( $req );
		return $res->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_body_plan( array $params ) {
		$post_id = (int) ( $params['post_id'] ?? 0 );
		$result  = Neo_Pulse_Wp_Ai_Body::plan( $post_id );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return is_array( $result ) ? $result : array( 'ok' => true );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_body_session_get( array $params ) {
		$post_id = (int) ( $params['post_id'] ?? 0 );
		$result  = Neo_Pulse_Wp_Ai_Body::get_session( $post_id );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return is_array( $result ) ? $result : array( 'ok' => true );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_body_session_delete( array $params ) {
		$post_id = (int) ( $params['post_id'] ?? 0 );
		$result  = Neo_Pulse_Wp_Ai_Body::clear_session( $post_id );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return is_array( $result ) ? $result : array( 'ok' => true );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_body_section_preview( array $params ) {
		$req = self::json_request( 'POST', '/neo-pulse/v1/ai/body/section/preview', $params );
		$res = Neo_Pulse_Wp_Ai_Body_Rest::section_preview( $req );
		return $res->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_body_section_apply( array $params ) {
		$post_id = (int) ( $params['post_id'] ?? 0 );
		self::maybe_snapshot_revision( $post_id );
		$req = self::json_request( 'POST', '/neo-pulse/v1/ai/body/section/apply', $params );
		$res = Neo_Pulse_Wp_Ai_Body_Rest::section_apply( $req );
		return $res->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_body_suggest_link( array $params ) {
		$req = self::json_request( 'POST', '/neo-pulse/v1/ai/body/suggest-link', $params );
		$res = Neo_Pulse_Wp_Ai_Body_Rest::suggest_link( $req );
		return $res->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_body_insert_element( array $params ) {
		$req = self::json_request( 'POST', '/neo-pulse/v1/ai/body/insert-element', $params );
		$res = Neo_Pulse_Wp_Ai_Body_Rest::insert_element( $req );
		return $res->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_image_seo_status( array $params ): array {
		return array( 'ok' => true, 'status' => Neo_Pulse_Wp_Image_Seo_Gate::get_status() );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_image_seo_list( array $params ): array {
		$result = Neo_Pulse_Wp_Image_Seo::query_attachments(
			array(
				'page'        => (int) ( $params['page'] ?? 1 ),
				'per_page'    => (int) ( $params['per_page'] ?? 20 ),
				'search'      => (string) ( $params['search'] ?? '' ),
				'missing_alt' => ! empty( $params['missing_alt'] ),
			)
		);
		return array_merge( array( 'ok' => true ), $result );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_image_seo_get_attachment( array $params ) {
		$id = (int) ( $params['attachment_id'] ?? $params['id'] ?? 0 );
		if ( $id < 1 ) {
			return new WP_Error( 'neo-pulse_tools', __( 'attachment_id is required.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		return array( 'ok' => true, 'row' => Neo_Pulse_Wp_Image_Seo::attachment_row( $id ) );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_image_seo_preview( array $params ) {
		$id = (int) ( $params['attachment_id'] ?? 0 );
		$result = Neo_Pulse_Wp_Image_Seo_Ai::preview(
			$id,
			(int) ( $params['post_id'] ?? 0 ),
			! isset( $params['use_ai'] ) || ! empty( $params['use_ai'] )
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return array_merge( array( 'ok' => true ), $result );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_image_seo_apply( array $params ) {
		$id     = (int) ( $params['attachment_id'] ?? 0 );
		$values = isset( $params['fields'] ) && is_array( $params['fields'] ) ? $params['fields'] : array();
		if ( empty( $values ) && isset( $params['values'] ) && is_array( $params['values'] ) ) {
			$values = $params['values'];
		}
		$result = Neo_Pulse_Wp_Image_Seo_Ai::apply(
			$id,
			$values,
			isset( $params['overwrite_mode'] ) ? sanitize_key( (string) $params['overwrite_mode'] ) : null,
			isset( $params['field_keys'] ) && is_array( $params['field_keys'] ) ? $params['field_keys'] : null
		);
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		return array_merge( array( 'ok' => true ), is_array( $result ) ? $result : array() );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_image_seo_bulk( array $params ) {
		$req = self::json_request( 'POST', '/neo-pulse/v1/image-seo/bulk', $params );
		$res = Neo_Pulse_Wp_Image_Seo_Rest::bulk( $req );
		return $res->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_sitemap_get( array $params ): array {
		return Neo_Pulse_Wp_Sitemap::rest_get()->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_sitemap_put( array $params ) {
		$req = self::json_request( 'PUT', '/neo-pulse/v1/sitemap', array( 'config' => $params['config'] ?? $params ) );
		$res = Neo_Pulse_Wp_Sitemap::rest_put( $req );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		return $res->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_sitemap_flush( array $params ): array {
		return Neo_Pulse_Wp_Sitemap::rest_flush( new WP_REST_Request( 'POST', '/neo-pulse/v1/sitemap/flush' ) )->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_redirects_list( array $params ): array {
		$req = new WP_REST_Request( 'GET', '/neo-pulse/v1/redirects' );
		foreach ( array( 'page', 'per_page', 'search', 'status' ) as $k ) {
			if ( isset( $params[ $k ] ) ) {
				$req->set_param( $k, $params[ $k ] );
			}
		}
		return Neo_Pulse_Wp_Redirects_Rest::list_redirects( $req )->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_redirects_get( array $params ) {
		$id = (int) ( $params['id'] ?? 0 );
		$req = new WP_REST_Request( 'GET', '/neo-pulse/v1/redirects/' . $id );
		$req->set_param( 'id', $id );
		$res = Neo_Pulse_Wp_Redirects_Rest::get_redirect( $req );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		return $res->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_redirects_create( array $params ): array {
		$req = self::json_request( 'POST', '/neo-pulse/v1/redirects', $params );
		return Neo_Pulse_Wp_Redirects_Rest::create_redirect( $req )->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_redirects_update( array $params ): array {
		$id  = (int) ( $params['id'] ?? 0 );
		$req = self::json_request( 'PUT', '/neo-pulse/v1/redirects/' . $id, $params );
		$req->set_param( 'id', $id );
		return Neo_Pulse_Wp_Redirects_Rest::update_redirect( $req )->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_redirects_delete( array $params ): array {
		$id  = (int) ( $params['id'] ?? 0 );
		$req = new WP_REST_Request( 'DELETE', '/neo-pulse/v1/redirects/' . $id );
		$req->set_param( 'id', $id );
		$req->set_param( 'force', ! empty( $params['force'] ) );
		return Neo_Pulse_Wp_Redirects_Rest::delete_redirect( $req )->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_scripts_list( array $params ): array {
		$req = new WP_REST_Request( 'GET', '/neo-pulse/v1/scripts' );
		foreach ( array( 'page', 'per_page', 'search', 'status', 'category', 'placement' ) as $k ) {
			if ( isset( $params[ $k ] ) ) {
				$req->set_param( $k, $params[ $k ] );
			}
		}
		return Neo_Pulse_Wp_Script_Manager_Rest::list_scripts( $req )->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_scripts_get( array $params ) {
		$id  = (int) ( $params['id'] ?? 0 );
		$req = new WP_REST_Request( 'GET', '/neo-pulse/v1/scripts/' . $id );
		$req->set_param( 'id', $id );
		$res = Neo_Pulse_Wp_Script_Manager_Rest::get_script( $req );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		return $res->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_scripts_create( array $params ): array {
		$req = self::json_request( 'POST', '/neo-pulse/v1/scripts', $params );
		return Neo_Pulse_Wp_Script_Manager_Rest::create_script( $req )->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_scripts_update( array $params ): array {
		$id  = (int) ( $params['id'] ?? 0 );
		$req = self::json_request( 'PUT', '/neo-pulse/v1/scripts/' . $id, $params );
		$req->set_param( 'id', $id );
		return Neo_Pulse_Wp_Script_Manager_Rest::update_script( $req )->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_scripts_delete( array $params ): array {
		$id  = (int) ( $params['id'] ?? 0 );
		$req = new WP_REST_Request( 'DELETE', '/neo-pulse/v1/scripts/' . $id );
		$req->set_param( 'id', $id );
		$req->set_param( 'force', ! empty( $params['force'] ) );
		return Neo_Pulse_Wp_Script_Manager_Rest::delete_script( $req )->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_gmb_status( array $params ): array {
		return Neo_Pulse_Wp_Gmb_Rest::connection_status()->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_gmb_locations( array $params ): array {
		return array(
			'ok'          => true,
			'configured'  => Neo_Pulse_Wp_Gmb::is_configured(),
			'connected'   => Neo_Pulse_Wp_Gmb::is_connected(),
			'location_id' => Neo_Pulse_Wp_Gmb::get_location_id(),
			'account_id'  => Neo_Pulse_Wp_Gmb::get_account_id(),
		);
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_gmb_create_post( array $params ) {
		$post_id = (int) ( $params['post_id'] ?? 0 );
		$body    = isset( $params['summary'] ) ? array( 'summary' => (string) $params['summary'] ) : array();
		$req     = self::json_request( 'POST', '/neo-pulse/v1/ai/gmb-post', $body );
		$req->set_param( 'post_id', $post_id );
		$res = Neo_Pulse_Wp_Gmb_Rest::create_social_post( $req );
		return $res->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_assist_chat( array $params ): array {
		$req = self::json_request( 'POST', '/neo-pulse/v1/backend-assist', $params );
		$res = Neo_Pulse_Wp_Backend_Assist::rest_handle( $req );
		$data = $res->get_data();
		return is_array( $data ) ? array_merge( array( 'ok' => true ), array( 'card' => $data ) ) : array( 'ok' => true );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_assist_workflow_status( array $params ) {
		$workflow_id = isset( $params['workflow_id'] ) ? sanitize_text_field( (string) $params['workflow_id'] ) : '';
		if ( $workflow_id === '' ) {
			return new WP_Error( 'neo-pulse_tools', __( 'workflow_id is required.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		$req = new WP_REST_Request( 'GET', '/neo-pulse/v1/backend-assist/workflow/' . $workflow_id . '/status' );
		$req->set_param( 'workflow_id', $workflow_id );
		return Neo_Pulse_Wp_Backend_Assist::rest_workflow_status( $req )->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_assist_workflow_step( array $params ) {
		$req = self::json_request( 'POST', '/neo-pulse/v1/backend-assist/step', $params );
		return Neo_Pulse_Wp_Backend_Assist::rest_step_handle( $req )->get_data();
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>
	 */
	public static function wp_audit_list( array $params ): array {
		$limit = isset( $params['limit'] ) ? (int) $params['limit'] : 50;
		return array( 'ok' => true, 'entries' => Neo_Pulse_Wp_Tools_Audit::list_recent( $limit ) );
	}

	/**
	 * @param array<string, mixed> $params Params.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function wp_revision_restore( array $params ) {
		$post_id = (int) ( $params['post_id'] ?? 0 );
		if ( $post_id < 1 ) {
			return new WP_Error( 'neo-pulse_tools', __( 'post_id is required.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		$key = 'neo-pulse_agent_rev_' . $post_id;
		$rev = get_post_meta( $post_id, $key, true );
		if ( ! is_array( $rev ) || empty( $rev['content'] ) ) {
			return new WP_Error( 'neo-pulse_tools', __( 'No agent snapshot found for this post.', 'neo-pulse-wp' ), array( 'status' => 404 ) );
		}
		wp_update_post(
			array(
				'ID'           => $post_id,
				'post_content' => (string) $rev['content'],
			)
		);
		delete_post_meta( $post_id, $key );
		return array( 'ok' => true, 'post_id' => $post_id );
	}

	/**
	 * @param int $post_id Post ID.
	 */
	private static function maybe_snapshot_revision( int $post_id ): void {
		if ( $post_id < 1 ) {
			return;
		}
		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return;
		}
		$key = 'neo-pulse_agent_rev_' . $post_id;
		if ( get_post_meta( $post_id, $key, true ) ) {
			return;
		}
		update_post_meta(
			$post_id,
			$key,
			array(
				'content'   => $post->post_content,
				'saved_at'  => gmdate( 'c' ),
			)
		);
	}
}
