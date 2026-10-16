<?php
/**
 * Sitemap rewrite rules, request handling, shortcode, and REST.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

/**
 * Front-end sitemap delivery and REST API.
 */
class Neo_Pulse_Wp_Sitemap {

	const QUERY_VAR = 'neo-pulse_sitemap';

	/**
	 * Hook registrations.
	 */
	public static function init(): void {
		add_action( 'init', array( __CLASS__, 'register_rewrites' ), 5 );
		if ( class_exists( 'Neo_Pulse_Wp_Sitemap_Style', false ) ) {
			Neo_Pulse_Wp_Sitemap_Style::init();
		}
		add_filter( 'query_vars', array( __CLASS__, 'register_query_vars' ) );
		add_action( 'template_redirect', array( __CLASS__, 'maybe_serve_sitemap' ), 0 );
		add_filter( 'wp_sitemaps_enabled', array( __CLASS__, 'maybe_disable_core_sitemaps' ) );
		add_shortcode( 'neo-pulse_sitemap', array( __CLASS__, 'shortcode_html_sitemap' ) );
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
		add_action( 'save_post', array( __CLASS__, 'flush_cache_on_content_change' ), 20, 1 );
		add_action( 'deleted_post', array( __CLASS__, 'flush_cache_on_content_change' ), 20, 1 );
		add_action( 'created_term', array( __CLASS__, 'flush_cache_on_term_change' ), 20, 1 );
		add_action( 'edited_term', array( __CLASS__, 'flush_cache_on_term_change' ), 20, 1 );
		add_action( 'delete_term', array( __CLASS__, 'flush_cache_on_term_change' ), 20, 1 );
	}

	/**
	 * @param mixed $enabled Core sitemap enabled flag.
	 * @return bool
	 */
	public static function maybe_disable_core_sitemaps( $enabled ): bool {
		$config = Neo_Pulse_Wp_Sitemap_Settings::get_config();
		if ( ! empty( $config['general']['enabled'] ) ) {
			return false;
		}
		return (bool) $enabled;
	}

	/**
	 * @return array<int, string>
	 */
	public static function index_rewrite_patterns(): array {
		return array(
			'^sitemap_index\.xml$',
			'^sitemap\.xml$',
		);
	}

	public static function register_rewrites(): void {
		foreach ( self::index_rewrite_patterns() as $pattern ) {
			add_rewrite_rule( $pattern, 'index.php?' . self::QUERY_VAR . '=index', 'top' );
		}
		add_rewrite_rule( '^([a-z0-9_-]+)-sitemap([0-9]+)?\.xml$', 'index.php?' . self::QUERY_VAR . '=child&neo-pulse_sitemap_type=$matches[1]&neo-pulse_sitemap_page=$matches[2]', 'top' );
	}

	/**
	 * @param mixed $vars Query vars.
	 * @return mixed
	 */
	public static function register_query_vars( $vars ) {
		if ( ! is_array( $vars ) ) {
			return $vars;
		}
		$vars[] = self::QUERY_VAR;
		$vars[] = 'neo-pulse_sitemap_type';
		$vars[] = 'neo-pulse_sitemap_page';
		return $vars;
	}

	public static function maybe_serve_sitemap(): void {
		$config = Neo_Pulse_Wp_Sitemap_Settings::get_config();
		if ( empty( $config['general']['enabled'] ) ) {
			return;
		}

		$kind = get_query_var( self::QUERY_VAR );
		if ( ! is_string( $kind ) || $kind === '' ) {
			return;
		}

		if ( 'index' === $kind ) {
			self::output_xml( self::get_index_xml( $config ) );
		}

		if ( 'child' === $kind ) {
			$type = sanitize_key( (string) get_query_var( 'neo-pulse_sitemap_type' ) );
			$page = max( 1, (int) get_query_var( 'neo-pulse_sitemap_page' ) );
			if ( $page < 1 ) {
				$page = 1;
			}
			$xml = self::get_child_xml( $type, $page, $config );
			if ( $xml === null ) {
				status_header( 404 );
				exit;
			}
			self::output_xml( $xml );
		}
	}

	/**
	 * @param array<string, mixed> $config Settings config.
	 */
	private static function get_index_xml( array $config ): string {
		$key = Neo_Pulse_Wp_Sitemap_Cache::cache_key( 'index' );
		$cached = Neo_Pulse_Wp_Sitemap_Cache::get( $key );
		if ( $cached !== null ) {
			return $cached;
		}
		$xml = Neo_Pulse_Wp_Sitemap_Generator::build_index( $config );
		Neo_Pulse_Wp_Sitemap_Cache::set( $key, $xml );
		return $xml;
	}

	/**
	 * @param array<string, mixed> $config Settings config.
	 */
	private static function get_child_xml( string $type, int $page, array $config ): ?string {
		$is_post_type = isset( $config['post_types'][ $type ] ) && ! empty( $config['post_types'][ $type ]['include_xml'] );
		$is_taxonomy  = isset( $config['taxonomies'][ $type ] ) && ! empty( $config['taxonomies'][ $type ]['include_xml'] );

		if ( ! $is_post_type && ! $is_taxonomy ) {
			return null;
		}

		$key    = Neo_Pulse_Wp_Sitemap_Cache::cache_key( $is_post_type ? 'post_type' : 'taxonomy', $type, $page );
		$cached = Neo_Pulse_Wp_Sitemap_Cache::get( $key );
		if ( $cached !== null ) {
			return $cached;
		}

		if ( $is_post_type ) {
			$max_pages = Neo_Pulse_Wp_Sitemap_Generator::post_type_page_count( $type, $config );
			if ( $page > $max_pages ) {
				return null;
			}
			$xml = Neo_Pulse_Wp_Sitemap_Generator::build_post_type_sitemap( $type, $page, $config );
		} else {
			$max_pages = Neo_Pulse_Wp_Sitemap_Generator::taxonomy_page_count( $type, $config );
			if ( $page > $max_pages ) {
				return null;
			}
			$xml = Neo_Pulse_Wp_Sitemap_Generator::build_taxonomy_sitemap( $type, $page, $config );
		}

		Neo_Pulse_Wp_Sitemap_Cache::set( $key, $xml );
		return $xml;
	}

	private static function output_xml( string $xml ): void {
		status_header( 200 );
		header( 'Content-Type: application/xml; charset=UTF-8' );
		header( 'X-Robots-Tag: noindex, follow', true );
		if ( class_exists( 'Neo_Pulse_Wp_Sitemap_Style', false ) ) {
			// Browsers show a styled table; search engines read the XML as before.
			$xml = Neo_Pulse_Wp_Sitemap_Style::add_to( $xml );
		}
		// phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- XML payload.
		echo $xml;
		exit;
	}

	/**
	 * @param array<string, string>|string $atts Shortcode attributes.
	 */
	public static function shortcode_html_sitemap( $atts = array() ): string {
		$config = Neo_Pulse_Wp_Sitemap_Settings::get_config();
		if ( empty( $config['html']['enabled'] ) ) {
			return '';
		}
		return Neo_Pulse_Wp_Sitemap_Generator::build_html( $config );
	}

	public static function flush_cache_on_content_change( $post_id ): void {
		if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
			return;
		}
		Neo_Pulse_Wp_Sitemap_Cache::flush_all();
	}

	public static function flush_cache_on_term_change( $term_id ): void {
		unset( $term_id );
		Neo_Pulse_Wp_Sitemap_Cache::flush_all();
	}

	public static function flush_rewrites(): void {
		self::register_rewrites();
		flush_rewrite_rules();
	}

	/**
	 * Register REST API routes.
	 */
	public static function register_routes(): void {
		register_rest_route(
			'neo-pulse/v1',
			'/sitemap',
			array(
				array(
					'methods'             => 'GET',
					'callback'            => array( __CLASS__, 'rest_get' ),
					'permission_callback' => array( __CLASS__, 'manage_permission' ),
				),
				array(
					'methods'             => 'PUT',
					'callback'            => array( __CLASS__, 'rest_put' ),
					'permission_callback' => array( __CLASS__, 'manage_permission' ),
				),
			)
		);

		register_rest_route(
			'neo-pulse/v1',
			'/sitemap/flush',
			array(
				'methods'             => 'POST',
				'callback'            => array( __CLASS__, 'rest_flush' ),
				'permission_callback' => array( __CLASS__, 'manage_permission' ),
			)
		);
	}

	/**
	 * @return bool|\WP_Error
	 */
	public static function manage_permission() {
		if ( ! is_user_logged_in() ) {
			return new WP_Error(
				'rest_not_logged_in',
				__( 'Authentication required.', 'neo-pulse-wp' ),
				array( 'status' => 401 )
			);
		}
		if ( ! current_user_can( 'manage_options' ) ) {
			return new WP_Error(
				'rest_forbidden',
				__( 'You do not have permission to manage sitemap settings.', 'neo-pulse-wp' ),
				array( 'status' => 403 )
			);
		}
		return true;
	}

	/**
	 * @return \WP_REST_Response
	 */
	public static function rest_get(): WP_REST_Response {
		$config = Neo_Pulse_Wp_Sitemap_Settings::get_config();
		return new WP_REST_Response(
			array(
				'ok'        => true,
				'config'    => $config,
				'indexUrl'  => Neo_Pulse_Wp_Sitemap_Settings::index_url(),
				'conflicts' => Neo_Pulse_Wp_Sitemap_Settings::conflicting_plugins(),
			),
			200
		);
	}

	/**
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	public static function rest_put( $request ) {
		$body = $request->get_json_params();
		if ( ! is_array( $body ) ) {
			return new WP_Error(
				'rest_invalid_param',
				__( 'Invalid JSON body.', 'neo-pulse-wp' ),
				array( 'status' => 400 )
			);
		}

		$config = isset( $body['config'] ) && is_array( $body['config'] )
			? Neo_Pulse_Wp_Sitemap_Settings::sanitize_config( $body['config'] )
			: Neo_Pulse_Wp_Sitemap_Settings::sanitize_config( $body );

		$previous = Neo_Pulse_Wp_Sitemap_Settings::get_config();
		Neo_Pulse_Wp_Sitemap_Settings::save_config( $config );
		Neo_Pulse_Wp_Sitemap_Cache::flush_all();

		if ( (int) ( $previous['general']['links_per_sitemap'] ?? 200 ) !== (int) ( $config['general']['links_per_sitemap'] ?? 200 ) ) {
			self::flush_rewrites();
		}

		return new WP_REST_Response(
			array(
				'ok'       => true,
				'config'   => $config,
				'indexUrl' => Neo_Pulse_Wp_Sitemap_Settings::index_url(),
			),
			200
		);
	}

	/**
	 * @return \WP_REST_Response
	 */
	public static function rest_flush(): WP_REST_Response {
		Neo_Pulse_Wp_Sitemap_Cache::flush_all();
		return new WP_REST_Response(
			array(
				'ok'      => true,
				'message' => __( 'Sitemap cache flushed.', 'neo-pulse-wp' ),
			),
			200
		);
	}
}
