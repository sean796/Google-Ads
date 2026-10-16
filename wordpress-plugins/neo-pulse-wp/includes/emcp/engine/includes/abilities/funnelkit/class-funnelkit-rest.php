<?php
/**
 * In-process access to FunnelKit's own REST handlers.
 *
 * Funnel Builder (`funnelkit-app`) registers its routes on every REST request.
 * FunnelKit Automations (`autonami-app`) loads its API classes from the request
 * URL, so a call made from inside an MCP request finds nothing; this class loads
 * the classes for the target route first (both the Lite and the Pro loader).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'EMCP_Tools_Captured_Json' ) ) {
	require_once dirname( __DIR__ ) . '/class-captured-json.php';
}

/** @since 3.19.0 */
class EMCP_Tools_FunnelKit_Rest {

	/** Inline export/import cap, bytes. */
	const MAX_BYTES = 2097152;

	/** Route prefixes no operation may reach (spec section 4.4), matched after the namespace. */
	const DENY = array(
		'create-api-key', 'update-api-key', 'delete-api-key', 'get-api-keys', 'connector', 'connectors',
		'license', 'plugin/', 'activate-plugin', 'activate_plugin', 'funnels/activate-plugin',
		'settings/log', 'settings/tools', 'stripe-connect-link', 'square-connect-link', 'setup', 'wizard', 'remove-wizard',
		'upload-file', 'upload-image', 'update-option-data', 'automations/execute-tasks', 'automations/run-tasks',
		'automations/task/', 'transactional-mail/{eid}/resend', 'send-test-sms', 'send-test-whatsapp-message',
		'user-preference', 'db-update', 'block-migrator', 'funnels/tools',
		// Handlers that stream a file or echo and exit (Task 1 `terminates`): never dispatched in-process.
		'funnels/export', 'store-checkout/export', 'contact/export/download', 'export/download',
		'funnels/products/search', 'funnels/customers/search', 'bulk-action/download', 'importer-log/download',
	);

	/** @var callable */
	private $dispatch;

	/** @var callable */
	private $loader;

	/** @var string */
	private $last_message = '';

	/** @var array<string,bool> Automations prefixes already loaded in this request. */
	private static $loaded = array();

	public function __construct( ?callable $dispatch = null, ?callable $loader = null ) {
		$this->dispatch = $dispatch ?? 'rest_do_request';
		$this->loader   = $loader ?? array( __CLASS__, 'load_automations_route' );
	}

	/** Whether a route is on the never-reachable list. */
	public function is_denied( string $route ): bool {
		$path = preg_replace( '#^/(funnelkit-app|autonami-app|autonami-admin|wfacp-admin)/#', '', $route );
		if ( preg_match( '#^v3/contacts/\d+/sendmessage#', (string) $path ) || preg_match( '#^transactional-mail/\d+/resend#', (string) $path ) ) {
			return true;
		}
		foreach ( self::DENY as $prefix ) {
			if ( 0 === strpos( (string) $path, $prefix ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Run a request against FunnelKit as the current user.
	 *
	 * @param string $method HTTP method.
	 * @param string $route  Absolute REST route, for example /funnelkit-app/funnels.
	 * @param array  $params Query (GET) or body (other methods) parameters.
	 * @return mixed|WP_Error Decoded data.
	 */
	public function request( string $method, string $route, array $params = array(), array $files = array() ) {
		if ( $this->is_denied( $route ) ) {
			return new WP_Error( 'route_not_allowed', __( 'This FunnelKit route is not reachable through EMCP.', 'emcp-tools' ) );
		}
		$automations = self::is_automations_route( $route );
		if ( $automations && true !== call_user_func( $this->loader, $route ) ) {
			return new WP_Error( 'funnelkit_loader_unavailable', __( 'FunnelKit Automations could not load its API for this route. Check that FunnelKit Automations is active and up to date.', 'emcp-tools' ) );
		}

		if ( $automations ) {
			self::forget_automations_cache();
		} else {
			self::forget_funnel_builder_cache();
		}

		$request = new WP_REST_Request( strtoupper( $method ), $route );
		if ( 'GET' === strtoupper( $method ) ) {
			$request->set_query_params( $params );
		} else {
			$request->set_body_params( $params );
			$request->set_header( 'content-type', 'application/json' );
			$request->set_body( (string) wp_json_encode( $params ) );
		}

		if ( $files ) {
			$request->set_file_params( $files );
		}
		$response = call_user_func( $this->dispatch, $request );
		if ( is_wp_error( $response ) ) {
			return $response;
		}
		$status = (int) $response->get_status();
		// FunnelKit data can hold PHP objects (create_funnel's 'funnel'); hand back what an MCP client receives.
		$data               = json_decode( (string) wp_json_encode( $response->get_data() ), true );
		$this->last_message = is_array( $data ) ? self::message( $data, '' ) : '';
		return self::unwrap( $data, $status, $automations );
	}

	/**
	 * WFFN_Admin::get_funnel() with no ID returns the funnel it cached earlier in the same PHP
	 * process, so a second create or duplicate in one process (the WP-CLI MCP server, a smoke)
	 * would UPDATE the previous funnel instead of inserting one. Drop that cache before each
	 * Funnel Builder request; FunnelKit rebuilds it on demand.
	 */
	private static function forget_funnel_builder_cache(): void {
		if ( ! function_exists( 'WFFN_Core' ) ) {
			return;
		}
		$admin = WFFN_Core()->admin ?? null;
		if ( ! is_object( $admin ) || ! property_exists( $admin, 'funnel' ) ) {
			return;
		}
		\Closure::bind(
			function () {
				$this->funnel = null;
			},
			$admin,
			get_class( $admin )
		)();
	}

	/**
	 * BWFAN_Automation_V2::get_instance( $id ) keeps the first automation it built for the rest of
	 * the PHP process and ignores later IDs, so in the WP-CLI MCP server a step added to a second
	 * automation would land on the first. Drop it before each Automations request.
	 */
	private static function forget_automations_cache(): void {
		if ( ! class_exists( 'BWFAN_Automation_V2', false ) || ! property_exists( 'BWFAN_Automation_V2', 'ins' ) ) {
			return;
		}
		\Closure::bind(
			static function () {
				self::$ins = null;
			},
			null,
			'BWFAN_Automation_V2'
		)();
	}

	/**
	 * Run a request whose handler answers through wp_send_json() (which echoes the JSON and
	 * exits). For this one call wp_doing_ajax() is true, so wp_send_json() ends in wp_die(),
	 * whose ajax handler is swapped for one that throws; the echoed JSON is captured from an
	 * output buffer and unwrapped like any answer. The REST server's dispatch stack, which the
	 * throw skips popping, is put back. A handler that returns normally is answered as usual.
	 *
	 * @return mixed|WP_Error
	 */
	public function request_captured( string $method, string $route, array $params = array(), array $files = array() ) {
		$out = EMCP_Tools_Captured_Json::run(
			function () use ( $method, $route, $params, $files ) {
				return $this->request( $method, $route, $params, $files );
			}
		);
		if ( is_wp_error( $out ) ) {
			return new WP_Error( 'funnelkit_error', __( 'FunnelKit answered with something that is not JSON.', 'emcp-tools' ) );
		}
		if ( ! $out['sent'] ) {
			return $out['result'];
		}
		$this->last_message = self::message( $out['data'], '' );
		return self::unwrap( $out['data'], 200, false );
	}

	/** The envelope message of the last request (unwrapping drops it; History uses it to tell created from existing records). */
	public function last_message(): string {
		return $this->last_message;
	}

	/** @return mixed|WP_Error */
	private static function unwrap( $data, int $status, bool $automations ) {
		$body_code = is_array( $data ) && isset( $data['code'] ) && is_numeric( $data['code'] ) ? (int) $data['code'] : 0;
		$effective = max( $status, $body_code >= 400 ? $body_code : 0 );
		if ( $effective >= 400 ) {
			return new WP_Error( 'funnelkit_error', self::message( $data, __( 'FunnelKit returned an error.', 'emcp-tools' ) ), array( 'status' => $effective, 'data' => $data ) );
		}
		if ( is_array( $data ) && ( ( array_key_exists( 'success', $data ) && false === $data['success'] ) || ( array_key_exists( 'status', $data ) && false === $data['status'] ) ) ) {
			return new WP_Error( 'funnelkit_refused', self::message( $data, __( 'FunnelKit refused the request.', 'emcp-tools' ) ), array( 'status' => $status, 'data' => $data ) );
		}
		// WFFN_REST_API_Helpers::check_builder_status(): when the template's page builder is not active,
		// FunnelKit answers builder_status() alone (no status key) and creates or changes nothing.
		if ( is_array( $data ) && isset( $data['builders_options'] ) && ! array_key_exists( 'status', $data ) && ! array_key_exists( 'success', $data ) ) {
			$plugin = is_array( $data['builders_options'] ) ? (string) ( $data['builders_options']['slug'] ?? '' ) : '';
			return new WP_Error(
				'builder_unavailable',
				'' !== $plugin
					/* translators: %s: plugin slug. */
					? sprintf( __( 'FunnelKit did nothing: this builder or template needs the %s plugin, which is not active. Activate it, or pick another builder or template.', 'emcp-tools' ), $plugin )
					: __( 'FunnelKit did nothing: the page builder this template needs is not active. Activate it, or pick another builder or template.', 'emcp-tools' ),
				array( 'status' => 409, 'data' => $data )
			);
		}
		if ( $automations && is_array( $data ) && array_key_exists( 'result', $data ) ) {
			return $data['result'];
		}
		return $data;
	}

	private static function message( $data, string $fallback ): string {
		if ( is_array( $data ) ) {
			foreach ( array( 'message', 'msg', 'error' ) as $key ) {
				if ( isset( $data[ $key ] ) && is_string( $data[ $key ] ) && '' !== $data[ $key ] ) {
					return $data[ $key ];
				}
			}
		}
		return $fallback;
	}

	private static function is_automations_route( string $route ): bool {
		$ns = defined( 'BWFAN_API_NAMESPACE' ) ? (string) BWFAN_API_NAMESPACE : 'autonami-app';
		return 0 === strpos( $route, '/' . $ns . '/' ) || 0 === strpos( $route, '/autonami-app/' ) || 0 === strpos( $route, '/autonami-admin/' );
	}

	/**
	 * Memo key for loaded Automations routes: the path after the namespace with numeric
	 * segments as '#'. The Pro loader picks API directories by two segments (contact/export
	 * versus contact/{id}), so the first segment alone is not enough.
	 */
	public static function loader_key( string $route ): string {
		$path = preg_replace( '#^/?(autonami-app|autonami-admin)/#', '', trim( $route ) );
		return (string) preg_replace( '#(^|/)\d+(?=/|$)#', '$1#', trim( (string) $path, '/' ) );
	}

	/**
	 * Load FunnelKit Automations' API classes for a route (Lite and Pro), once per route shape.
	 *
	 * @param string $route Absolute route.
	 * @return bool
	 */
	public static function load_automations_route( string $route ): bool {
		if ( ! class_exists( 'BWFAN_API_Loader' ) && defined( 'BWFAN_PLUGIN_DIR' ) && is_readable( BWFAN_PLUGIN_DIR . '/includes/class-bwfan-api-loader.php' ) ) {
			require_once BWFAN_PLUGIN_DIR . '/includes/class-bwfan-api-loader.php';
		}
		if ( ! class_exists( 'BWFAN_API_Loader' ) || ! method_exists( 'BWFAN_API_Loader', 'register_routes' ) ) {
			return false;
		}
		$prefix = self::loader_key( $route );
		if ( isset( self::$loaded[ $prefix ] ) ) {
			return true;
		}
		$saved = isset( $_GET['rest_route'] ) ? $_GET['rest_route'] : null; // phpcs:ignore WordPress.Security.NonceVerification
		$_GET['rest_route'] = $route; // phpcs:ignore WordPress.Security.NonceVerification
		try {
			BWFAN_API_Loader::register_routes( $route );
			if ( class_exists( 'BWFCRM_API_Loader' ) && method_exists( 'BWFCRM_API_Loader', 'register_routes' ) ) {
				BWFCRM_API_Loader::register_routes();
			}
		} finally {
			if ( null === $saved ) {
				unset( $_GET['rest_route'] ); // phpcs:ignore WordPress.Security.NonceVerification
			} else {
				$_GET['rest_route'] = $saved; // phpcs:ignore WordPress.Security.NonceVerification
			}
		}
		self::$loaded[ $prefix ] = true;
		return true;
	}
}
