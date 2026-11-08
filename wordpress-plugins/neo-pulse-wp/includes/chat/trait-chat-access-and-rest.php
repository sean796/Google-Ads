<?php
/**
 * Chat access checks and REST endpoints.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Chat_Trait_Access_And_Rest {

	/**
	 * Everything except "is there a widget on this page": licence, master switch, builders, visitor rules.
	 */
	public static function can_show_frontend_bubble(): bool {
		if ( is_admin() || self::is_off_everywhere() || self::is_page_builder_editing_context() ) {
			return false;
		}
		return self::should_show_for_visitor();
	}

	/**
	 * Front end: the bubble shows where the Elementor widget is placed, where the shortcode is used,
	 * or everywhere when "Show without the widget" is on.
	 */
	private static function frontend_bubble_wanted(): bool {
		if ( self::$widget_design !== null ) {
			return true;
		}
		$settings = self::get_settings();
		if ( ! empty( $settings['show_without_widget'] ) ) {
			return true;
		}
		return self::page_has_chat_shortcode();
	}

	/**
	 * Whether the chat widget should load for the current frontend visitor.
	 * When logged_in_only is set, guests do not see the widget or receive chat API access.
	 * When admin_only is set, only WordPress administrators see it.
	 */
	public static function should_show_for_visitor(): bool {
		if ( ! Neo_Pulse_Wp_License::is_licensed( false ) ) {
			return false; // Not licensed: no chat (see class-neo-pulse-wp-license.php).
		}
		if ( self::is_off_everywhere() || ! self::is_enabled() ) {
			return false;
		}
		$settings = self::get_settings();
		if ( ! empty( $settings['admin_only'] ) && ! current_user_can( 'manage_options' ) ) {
			return false;
		}
		if ( ! empty( $settings['logged_in_only'] ) && ! is_user_logged_in() ) {
			return false;
		}
		$whitelist = isset( $settings['whitelist_url'] ) ? trim( (string) $settings['whitelist_url'] ) : '';
		if ( $whitelist !== '' && ! wp_doing_ajax() && ! ( defined( 'REST_REQUEST' ) && REST_REQUEST ) && ! self::current_path_matches_whitelist( $whitelist ) ) {
			return false;
		}
		return true;
	}

	/**
	 * Whether the current frontend request includes the chat shortcode.
	 */
	private static function page_has_chat_shortcode(): bool {
		if ( self::$shortcode_rendered ) {
			return true;
		}
		if ( is_admin() ) {
			return false;
		}
		if ( is_singular() ) {
			$post = get_queried_object();
			if ( $post instanceof WP_Post && has_shortcode( $post->post_content, self::SHORTCODE_TAG ) ) {
				return true;
			}
			$post_id = $post instanceof WP_Post ? (int) $post->ID : get_queried_object_id();
			if ( $post_id > 0 ) {
				$elementor_data = get_post_meta( $post_id, '_elementor_data', true );
				if ( is_string( $elementor_data ) && strpos( $elementor_data, '[' . self::SHORTCODE_TAG ) !== false ) {
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Compare current request path to a whitelist URL path (trailing slash ignored).
	 * Uses the request URI and the current page permalink so password-protected
	 * pages still match after the visitor enters the page password.
	 */
	public static function normalize_url_path( string $url ): string {
		$url = trim( $url );
		if ( $url === '' ) {
			return '';
		}
		$lower = strtolower( $url );
		$has_scheme = substr( $lower, 0, 7 ) === 'http://' || substr( $lower, 0, 8 ) === 'https://';
		if ( ! $has_scheme && ( ! isset( $url[0] ) || $url[0] !== '/' ) ) {
			$url = 'https://' . $url;
		}
		$path = wp_parse_url( $url, PHP_URL_PATH );
		if ( ! is_string( $path ) || $path === '' ) {
			$path = '/';
		}
		$trimmed = rtrim( $path, '/' );
		return $trimmed === '' ? '/' : $trimmed;
	}

	/**
	 * @param string $whitelist_url Configured frontend URL or path.
	 * @param string $candidate_url Request URI, permalink, or full URL.
	 */
	public static function url_path_matches_whitelist( string $whitelist_url, string $candidate_url ): bool {
		$allowed = self::normalize_url_path( $whitelist_url );
		if ( $allowed === '' ) {
			return false;
		}
		return self::normalize_url_path( $candidate_url ) === $allowed;
	}

	private static function current_path_matches_whitelist( string $whitelist_url ): bool {
		$candidates = array();
		if ( ! empty( $_SERVER['REQUEST_URI'] ) ) {
			$candidates[] = (string) wp_unslash( $_SERVER['REQUEST_URI'] );
		}
		if ( function_exists( 'is_singular' ) && is_singular() && function_exists( 'get_permalink' ) ) {
			$link = get_permalink();
			if ( is_string( $link ) && $link !== '' ) {
				$candidates[] = $link;
			}
		}
		foreach ( $candidates as $candidate ) {
			if ( self::url_path_matches_whitelist( $whitelist_url, $candidate ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Elementor, block editor, and other page-builder UIs (Pulse must not overlay the canvas).
	 */
	public static function is_page_builder_editing_context(): bool {
		if ( class_exists( 'Neo_Pulse_Wp_Search_Elementor_Widget' ) ) {
			if ( Neo_Pulse_Wp_Search_Elementor_Widget::is_elementor_editor_context() ) {
				return true;
			}
		} elseif ( class_exists( '\Elementor\Plugin' ) ) {
			$plugin = \Elementor\Plugin::$instance;
			if ( ( isset( $plugin->editor ) && $plugin->editor->is_edit_mode() )
				|| ( isset( $plugin->preview ) && $plugin->preview->is_preview_mode() ) ) {
				return true;
			}
		}

		// phpcs:ignore WordPress.Security.NonceVerification.Recommended -- read-only screen detection.
		if ( ! empty( $_GET['action'] ) && sanitize_key( (string) wp_unslash( $_GET['action'] ) ) === 'elementor' ) {
			return true;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( ! empty( $_GET['elementor-preview'] ) || ! empty( $_GET['elementor_library'] ) ) {
			return true;
		}
		// phpcs:ignore WordPress.Security.NonceVerification.Recommended
		if ( ! empty( $_GET['fl_builder'] ) || ! empty( $_GET['et_fb'] ) || ! empty( $_GET['vc_editable'] ) ) {
			return true;
		}

		if ( function_exists( 'get_current_screen' ) ) {
			$screen = get_current_screen();
			if ( $screen instanceof WP_Screen && $screen->is_block_editor() ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Whether the chat sidebar should load on the current screen (frontend or wp-admin).
	 */
	public static function should_show_on_current_screen(): bool {
		if ( ! Neo_Pulse_Wp_License::is_licensed( false ) ) {
			return false; // Not licensed: no chat (see class-neo-pulse-wp-license.php).
		}
		if ( self::is_off_everywhere() || self::is_page_builder_editing_context() ) {
			return false;
		}
		if ( ! self::is_enabled() && ! current_user_can( 'manage_options' ) ) {
			return false;
		}
		if ( is_admin() ) {
			$settings = self::get_settings();
			if ( ! empty( $settings['disable_backend'] ) ) {
				return false;
			}
			return is_user_logged_in();
		}
		return self::should_show_for_visitor() && self::frontend_bubble_wanted();
	}

	/**
	 * Whether chat API endpoints (stream, prefetch) may run for this request.
	 */
	public static function can_use_chat_api(): bool {
		if ( ! Neo_Pulse_Wp_License::is_licensed( true ) ) {
			return false; // Not licensed: no chat (see class-neo-pulse-wp-license.php).
		}
		if ( self::is_off_everywhere() ) {
			return false;
		}
		if ( ! self::is_enabled() && ! current_user_can( 'manage_options' ) ) {
			return false;
		}
		$settings = self::get_settings();
		if ( ! empty( $settings['admin_only'] ) ) {
			return current_user_can( 'manage_options' );
		}
		if ( is_user_logged_in() ) {
			return true;
		}
		return self::should_show_for_visitor();
	}

	/**
	 * Whether the current user may use God Mode (backend chat pipeline).
	 * Requires the Chat setting, the edit_posts capability and a Neo Digital staff email
	 * (an email alone is not enough: anyone can register with any address on open sites).
	 */
	public static function current_user_can_backend_mode(): bool {
		if ( ! is_user_logged_in() || self::is_off_everywhere() ) {
			return false;
		}
		if ( ! current_user_can( 'edit_posts' ) ) {
			return false;
		}
		$settings = self::get_settings();
		if ( empty( $settings['god_mode_enabled'] ) ) {
			return false;
		}
		return self::current_user_email_is_neodigital();
	}

	/**
	 * God Mode whitelist: Neo Digital staff emails only.
	 */
	public static function current_user_email_is_neodigital(): bool {
		$user  = wp_get_current_user();
		$email = strtolower( trim( (string) $user->user_email ) );
		$at    = strrpos( $email, '@' );
		if ( $at === false ) {
			return false;
		}
		$domain = substr( $email, $at + 1 );
		return $domain === 'neodigital.ca';
	}

	/**
	 * Register REST route for chat messages.
	 */
	public static function register_routes(): void {
		register_rest_route(
			self::REST_NAMESPACE,
			'/chat/accept',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'rest_chat_accept' ),
				'permission_callback' => '__return_true',
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/chat/site-inventory',
			array(
				'methods'             => 'GET',
				'callback'            => array( __CLASS__, 'rest_site_inventory' ),
				'permission_callback' => array( __CLASS__, 'can_access_site_inventory' ),
			)
		);

		register_rest_route(
			self::REST_NAMESPACE,
			'/chat/settings',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'rest_chat_settings_get' ),
					'permission_callback' => array( __CLASS__, 'can_manage_chat_settings' ),
				),
				array(
					'methods'             => 'POST',
					'callback'            => array( __CLASS__, 'rest_chat_settings_update' ),
					'permission_callback' => array( __CLASS__, 'can_manage_chat_settings' ),
				),
			)
		);
	}

	/**
	 * @return bool
	 */
	public static function can_manage_chat_settings(): bool {
		return is_user_logged_in() && current_user_can( 'manage_options' );
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_chat_settings_get( WP_REST_Request $request ): WP_REST_Response {
		unset( $request );
		$settings = self::get_settings();
		return new WP_REST_Response(
			array(
				'enabled'        => ! empty( $settings['enabled'] ),
				'logged_in_only' => ! empty( $settings['logged_in_only'] ),
			),
			200
		);
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public static function rest_chat_settings_update( WP_REST_Request $request ) {
		$params = $request->get_json_params();
		if ( ! is_array( $params ) ) {
			$params = array();
		}
		$patch = array();
		if ( array_key_exists( 'enabled', $params ) ) {
			$patch['enabled'] = ! empty( $params['enabled'] );
		}
		if ( array_key_exists( 'logged_in_only', $params ) ) {
			$patch['logged_in_only'] = ! empty( $params['logged_in_only'] );
		}
		if ( $patch === array() ) {
			return new WP_Error( 'neo_pulse_chat_settings', __( 'No settings to update.', 'neo-pulse-wp' ), array( 'status' => 400 ) );
		}
		self::save_settings( $patch );
		$settings = self::get_settings();
		return new WP_REST_Response(
			array(
				'enabled'        => ! empty( $settings['enabled'] ),
				'logged_in_only' => ! empty( $settings['logged_in_only'] ),
			),
			200
		);
	}

	/**
	 * @return bool
	 */
	public static function can_access_site_inventory(): bool {
		return is_user_logged_in() && current_user_can( 'edit_posts' );
	}

	/**
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_site_inventory( WP_REST_Request $request ): WP_REST_Response {
		$include_drafts = rest_sanitize_boolean( $request->get_param( 'include_drafts' ) );
		$format         = sanitize_key( (string) $request->get_param( 'format' ) );
		$query          = sanitize_text_field( (string) $request->get_param( 'query' ) );
		$post_type      = sanitize_key( (string) $request->get_param( 'post_type' ) );
		$limit          = (int) $request->get_param( 'limit' );
		$sort           = sanitize_key( (string) $request->get_param( 'sort' ) );
		$has_filters    = $query !== '' || $post_type !== '' || $limit > 0 || $sort !== '';

		if ( $format === 'csv' ) {
			$csv      = Neo_Pulse_Wp_Site_Inventory::build_csv( $include_drafts );
			$response = new WP_REST_Response( $csv, 200 );
			$response->header( 'Content-Type', 'text/csv; charset=utf-8' );
			$response->header( 'Content-Disposition', 'attachment; filename=' . Neo_Pulse_Wp_Site_Inventory::download_filename() );
			return $response;
		}

		Neo_Pulse_Wp_Site_Inventory::warm( $include_drafts );
		$meta = Neo_Pulse_Wp_Site_Inventory::get_meta();

		if ( $has_filters ) {
			$filters = array( 'include_drafts' => $include_drafts );
			if ( $post_type !== '' ) {
				$filters['post_type'] = $post_type;
			}
			if ( $query !== '' ) {
				$filters['query'] = $query;
			}
			if ( $limit > 0 ) {
				$filters['limit'] = max( 1, min( 50, $limit ) );
			}
			if ( $sort !== '' ) {
				$filters['sort'] = $sort;
			}
			$items = Neo_Pulse_Wp_Site_Inventory::get_items( $filters );
			return new WP_REST_Response(
				array(
					'ok'      => true,
					'count'   => count( $items ),
					'total'   => (int) ( $meta['count'] ?? count( $items ) ),
					'by_type' => isset( $meta['by_type'] ) && is_array( $meta['by_type'] ) ? $meta['by_type'] : array(),
					'items'   => Neo_Pulse_Wp_Site_Inventory::slim_items( $items ),
				),
				200
			);
		}

		return new WP_REST_Response(
			array(
				'ok'        => true,
				'count'     => (int) ( $meta['count'] ?? 0 ),
				'by_type'   => isset( $meta['by_type'] ) && is_array( $meta['by_type'] ) ? $meta['by_type'] : array(),
				'cached_at' => (int) ( $meta['cached_at'] ?? 0 ),
			),
			200
		);
	}

	/**
	 * REST handler: record accepted answer click.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response
	 */
	public static function rest_chat_accept( WP_REST_Request $request ): WP_REST_Response {
		if ( self::is_off_everywhere() ) {
			return new WP_REST_Response( array( 'error' => __( 'Chat is turned off.', 'neo-pulse-wp' ) ), 403 );
		}
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			$body = array();
		}

		$result = Neo_Pulse_Wp_Chat_Logs::record_accept(
			array(
				'message_uid' => isset( $body['messageId'] ) ? (string) $body['messageId'] : '',
				'url'         => isset( $body['url'] ) ? (string) $body['url'] : '',
				'label'       => isset( $body['label'] ) ? (string) $body['label'] : '',
				'type'        => isset( $body['type'] ) ? (string) $body['type'] : 'link',
			)
		);

		if ( empty( $result['ok'] ) ) {
			$status = ( isset( $result['error'] ) && $result['error'] === 'logging_disabled' ) ? 200 : 400;
			return new WP_REST_Response( $result, $status );
		}

		return new WP_REST_Response( array( 'ok' => true ), 200 );
	}
}
