<?php
/**
 * FunnelKit Funnel Builder read integration (funnelkit-read).
 *
 * Uses FunnelKit's own internal REST controllers so serialized checkout meta is
 * decoded by the plugin that owns it. Compact summaries are returned by default;
 * get-funnel-page supports detail=full for the complete decoded configuration.
 * Operations are data rows (funnelkit/ops/funnel-builder-read.php) run by the
 * shared FunnelKit dispatcher; the original five keep their handlers below.
 *
 * @package EMCP_Tools
 * @since   3.16.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.16.0 */
class EMCP_Tools_FunnelKit_Integration extends EMCP_Tools_FunnelKit_Dispatcher {

	/** @var string[] */
	private $ability_names = array();

	/** FunnelKit Funnel Builder active? */
	public static function funnelkit_active(): bool {
		return defined( 'WFFN_VERSION' ) && function_exists( 'WFFN_Core' );
	}

	/** Pro gate. */
	private static function can_use_premium(): bool {
		return function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code();
	}

	/** @return string[] */
	public function get_ability_names(): array {
		return $this->ability_names;
	}

	public function register(): void {
		if ( ! self::can_use_premium() ) {
			return;
		}

		$this->ability_names[] = 'emcp-tools/funnelkit-read';
		emcp_tools_register_ability(
			'emcp-tools/funnelkit-read',
			array(
				'label'               => __( 'FunnelKit Read', 'emcp-tools' ),
				'description'         => __( 'Read FunnelKit funnels, steps, checkout products with effective prices and fields, order bumps, upsells, A/B experiments, analytics, orders, leads and exports. Call with no operation to list the available operations.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'run_funnelkit_read' ),
				'permission_callback' => array( $this, 'check_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'operation' => array(
							'type'        => 'string',
							'description' => __( 'The read operation to run. Omit to list operations.', 'emcp-tools' ),
						),
						'arguments' => array(
							'type'        => 'object',
							'description' => __( 'Arguments for the chosen operation. get-funnel-page accepts detail: summary|full.', 'emcp-tools' ),
						),
					),
				),
				'meta'                => array(
					'annotations'  => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/** FunnelKit uses the WooCommerce shop-manager capability for its admin APIs. */
	public function check_permission(): bool {
		return current_user_can( 'manage_woocommerce' );
	}

	protected function tool_mode(): string {
		return 'read';
	}

	protected function operations(): array {
		return require __DIR__ . '/funnelkit/ops/funnel-builder-read.php';
	}

	/** @param mixed $input */
	public function run_funnelkit_read( $input ) {
		return $this->run( $input );
	}

	// The original five operations keep their handlers (validated arguments in, same answers out).

	protected function op_list_funnels( string $name, array $op, array $args ) {
		return $this->list_funnels( $args );
	}

	protected function op_get_funnel( string $name, array $op, array $args ) {
		return $this->get_funnel( $args );
	}

	protected function op_get_funnel_page( string $name, array $op, array $args ) {
		return $this->get_funnel_page( $args );
	}

	protected function op_get_checkout_products( string $name, array $op, array $args ) {
		return $this->get_checkout_products( $args );
	}

	protected function op_get_checkout_fields( string $name, array $op, array $args ) {
		return $this->get_checkout_fields( $args );
	}

	/**
	 * Several GETs in one operation (an order bump's design, products and rules; an upsell's
	 * offers and rules). Every placeholder takes the operation's single ID argument.
	 */
	protected function run_composite( string $name, array $op, array $args ) {
		$id    = (int) reset( $args );
		$parts = array();
		foreach ( (array) $op['composite'] as $route ) {
			$filled = (string) preg_replace( '/\{[a-z_]+\}/', (string) $id, $route );
			$last   = basename( $route );
			$key    = '{' === substr( $last, 0, 1 ) ? 'design' : $last;
			$data   = $this->rest()->request( 'GET', $filled );
			if ( is_wp_error( $data ) ) {
				return $data;
			}
			$parts[ $key ] = $data;
		}
		return array( 'operation' => $name, 'result' => $parts );
	}

	/** Order bumps of a funnel: wc_order_bump substeps of its checkout steps. */
	protected function op_list_order_bumps( string $name, array $op, array $args ) {
		$funnel = $this->rest()->request( 'GET', '/funnelkit-app/funnels/' . (int) $args['funnel_id'] );
		if ( is_wp_error( $funnel ) ) {
			return $funnel;
		}
		$items = array();
		foreach ( (array) ( $funnel['steps'] ?? array() ) as $step ) {
			foreach ( (array) ( $step['substeps']['wc_order_bump'] ?? array() ) as $bump ) {
				$bump_id = (int) ( is_array( $bump ) ? ( $bump['id'] ?? 0 ) : $bump );
				if ( $bump_id <= 0 ) {
					continue;
				}
				$title   = is_array( $bump ) ? (string) ( $bump['title'] ?? $bump['_data']['title'] ?? '' ) : '';
				$items[] = array(
					'bump_id'          => $bump_id,
					'title'            => '' !== $title ? $title : (string) get_the_title( $bump_id ),
					'checkout_step_id' => (int) ( $step['id'] ?? 0 ),
				);
			}
		}
		return array( 'operation' => $name, 'items' => $items );
	}

	/** One analytics section; FunnelKit registers a literal route per section. */
	protected function op_analytics_section( string $name, array $op, array $args ) {
		$query = array_intersect_key( $args, array_flip( array( 'after', 'before', 'limit', 'offset' ) ) );
		$data  = $this->rest()->request( 'GET', '/funnelkit-app/funnel-analytics/' . (int) $args['id'] . '/' . $args['section'], $query );
		return is_wp_error( $data ) ? $data : array( 'operation' => $name, 'result' => $data );
	}

	/** An export whose handler answers normally (export-checkout), capped at 2 MB. */
	protected function op_export_inline( string $name, array $op, array $args, string $route, array $params ) {
		$data = $this->rest()->request( (string) $op['method'], $route, $params );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$data = self::cap_payload( $data );
		return is_wp_error( $data ) ? $data : array( 'operation' => $name, 'result' => $data );
	}

	/**
	 * Funnel export, built as WFFN_REST_Funnels::export_funnels builds it (that handler echoes and exits).
	 *
	 * @return array|WP_Error
	 */
	protected function op_export_funnels( string $name, array $op, array $args ) {
		return $this->native_export( $name, (string) $args['ids'], false );
	}

	/** Store checkout export, built as WFFN_REST_Store_Checkout::export_funnels builds it. */
	protected function op_export_store_checkout( string $name, array $op, array $args ) {
		return $this->native_export( $name, (string) $args['ids'], true );
	}

	/** @return array|WP_Error */
	private function native_export( string $name, string $ids, bool $store_checkout ) {
		if ( ! function_exists( 'WFFN_Core' ) || ! class_exists( 'WFFN_Funnel' ) ) {
			return new WP_Error( 'funnelkit_loader_unavailable', __( 'Funnel Builder is not loaded.', 'emcp-tools' ) );
		}
		do_action( 'wffn_load_api_export_class' );
		$export = array();
		foreach ( array_values( array_filter( array_map( 'absint', explode( ',', $ids ) ) ) ) as $key => $id ) {
			$funnel = WFFN_Core()->admin->get_funnel( $id );
			if ( ! $funnel instanceof WFFN_Funnel || ! $funnel->get_id() ) {
				/* translators: %d: funnel id. */
				return new WP_Error( 'funnel_not_found', sprintf( __( 'Funnel %d does not exist.', 'emcp-tools' ), $id ) );
			}
			$steps = $funnel->get_steps( true );
			if ( $store_checkout && ! in_array( 'wc_checkout', wp_list_pluck( $steps, 'type' ), true ) ) {
				$bumps = WFFN_Common::get_store_checkout_global_substeps( $funnel->get_id() );
				if ( is_array( $bumps ) && $bumps ) {
					array_unshift( $steps, array( 'id' => 0, 'type' => WFFN_Common::store_native_checkout_slug(), 'substeps' => $bumps ) );
				}
			}
			$export[ $key ] = array( 'title' => $funnel->get_title(), 'steps' => array() );
			foreach ( $steps as $k => $step ) {
				if ( $store_checkout && WFFN_Common::store_native_checkout_slug() === ( $step['type'] ?? '' ) ) {
					// WFFN_REST_Store_Checkout::maybe_have_substeps_export() is a public instance method.
					$data = WFFN_REST_Store_Checkout::get_instance()->maybe_have_substeps_export( $step );
				} else {
					$integration = WFFN_Core()->steps->get_integration_object( $step['type'] );
					if ( ! is_object( $integration ) ) {
						/* translators: %s: step type. */
						return new WP_Error( 'funnelkit_error', sprintf( __( 'Funnel Builder cannot export steps of type %s.', 'emcp-tools' ), (string) $step['type'] ) );
					}
					$data = $integration->get_export_data( $step );
				}
				$export[ $key ]['steps'][ $k ] = $data;
			}
		}
		$export = self::cap_payload( apply_filters( 'wffn_export_data', $export ) );
		return is_wp_error( $export ) ? $export : array( 'operation' => $name, 'result' => $export );
	}

	/**
	 * import-status, and with job: finish that import's History record once its own funnel
	 * has completed. A job may only be finished through the funnel it imported.
	 */
	protected function op_import_status( string $name, array $op, array $args ) {
		$funnel_id = (int) $args['funnel_id'];
		if ( ! empty( $args['job'] ) ) {
			$job     = class_exists( 'EMCP_Tools_FunnelKit_History' ) ? EMCP_Tools_FunnelKit_History::instance()->job( (string) $args['job'] ) : null;
			$result  = (array) ( $job['result'] ?? array() );
			$belongs = (int) ( $result['funnel_id'] ?? $result['id'] ?? 0 );
			if ( null === $job || 'import-template' !== ( $job['op'] ?? '' ) || $belongs !== $funnel_id ) {
				return new WP_Error( 'invalid_argument', __( 'That job does not belong to this funnel import.', 'emcp-tools' ) );
			}
		}
		$out = array( 'operation' => $name, 'result' => self::import_status( $this->rest(), $funnel_id ) );
		if ( ! empty( $args['job'] ) ) {
			$change = EMCP_Tools_FunnelKit_History::instance()->finalize_job( (string) $args['job'] );
			if ( null !== $change ) {
				$out['change'] = $change;
			}
		}
		return $out;
	}

	/**
	 * FunnelKit's import-status answer with __done set. WFFN_REST_Funnels::funnel_import_status()
	 * answers HTTP 200 { status: false, success: false } while the import runs (which the REST
	 * client reports as a refusal) and { status: true, redirect } once it has finished.
	 */
	public static function import_status( EMCP_Tools_FunnelKit_Rest $rest, int $funnel_id ): array {
		$s = $rest->request( 'GET', '/funnelkit-app/funnels/' . $funnel_id . '/import-status' );
		if ( is_wp_error( $s ) ) {
			return 'funnelkit_refused' === $s->get_error_code() ? array( 'running' => true, '__done' => false ) : array( 'error' => $s->get_error_message(), '__done' => false );
		}
		if ( ! is_array( $s ) ) {
			return array( '__done' => false );
		}
		$s['__done'] = true === ( $s['status'] ?? null );
		return $s;
	}

	/** @return array<string,mixed>|\WP_Error */
	private function list_funnels( array $args ) {
		$limit  = isset( $args['limit'] ) ? absint( $args['limit'] ) : 20;
		$offset = isset( $args['offset'] ) ? absint( $args['offset'] ) : 0;
		if ( $limit < 1 || $limit > 100 ) {
			return new \WP_Error( 'invalid_argument', __( 'limit must be between 1 and 100.', 'emcp-tools' ) );
		}

		$query = array(
			'limit'           => $limit,
			'offset'          => $offset,
			'need_steps_data' => 'yes',
		);
		foreach ( array( 'status', 's', 'categories' ) as $key ) {
			if ( isset( $args[ $key ] ) && is_scalar( $args[ $key ] ) ) {
				$query[ $key ] = sanitize_text_field( (string) $args[ $key ] );
			}
		}

		$data = $this->rest_get( '/funnelkit-app/funnels', $query );
		if ( is_wp_error( $data ) || ! is_array( $data ) ) {
			return $data;
		}

		if ( isset( $data['items'] ) && is_array( $data['items'] ) ) {
			foreach ( $data['items'] as &$funnel ) {
				$funnel['id'] = isset( $funnel['id'] ) ? (int) $funnel['id'] : 0;
				if ( isset( $funnel['steps_data'] ) && is_array( $funnel['steps_data'] ) ) {
					$funnel['steps_data'] = self::summarize_steps( $funnel['steps_data'] );
				}
				unset( $funnel['__funnel'] );
			}
			unset( $funnel );
		}

		return $data;
	}

	/** @return array<string,mixed>|\WP_Error */
	private function get_funnel( array $args ) {
		$funnel_id = self::positive_id( $args, 'funnel_id' );
		if ( is_wp_error( $funnel_id ) ) {
			return $funnel_id;
		}

		$data = $this->rest_get( '/funnelkit-app/funnels/' . $funnel_id );
		if ( is_wp_error( $data ) || ! is_array( $data ) ) {
			return $data;
		}
		$data['id'] = isset( $data['id'] ) ? (int) $data['id'] : $funnel_id;
		if ( isset( $data['steps'] ) && is_array( $data['steps'] ) ) {
			$data['steps'] = self::summarize_steps( $data['steps'] );
		}
		return $data;
	}

	/** @return array<string,mixed>|\WP_Error */
	private function get_funnel_page( array $args ) {
		$step_id = self::positive_id( $args, 'step_id' );
		if ( is_wp_error( $step_id ) ) {
			return $step_id;
		}
		$detail = isset( $args['detail'] ) ? sanitize_key( (string) $args['detail'] ) : 'summary';
		if ( ! in_array( $detail, array( 'summary', 'full' ), true ) ) {
			return new \WP_Error( 'invalid_argument', __( 'detail must be summary or full.', 'emcp-tools' ) );
		}

		$type = $this->detect_step_type( $step_id );
		if ( is_wp_error( $type ) ) {
			return $type;
		}
		$base   = '/funnelkit-app/funnel-' . $type . '/' . $step_id;
		$design = $this->rest_get( $base . '/design' );
		if ( is_wp_error( $design ) ) {
			return $design;
		}

		$step = is_array( $design ) ? ( $design['data']['step'] ?? array() ) : array();
		$out  = array(
			'step_id'       => $step_id,
			'type'          => $type,
			'post_type'     => get_post_type( $step_id ),
			'title'         => $step['post_title'] ?? null,
			'slug'          => $step['post_name'] ?? null,
			'status'        => $step['status'] ?? null,
			'modified'      => $step['post_modified_date'] ?? null,
			'view_url'      => $step['view_link'] ?? null,
			'edit_url'      => $step['edit_link'] ?? ( $step['post_edit_link'] ?? null ),
			'design'        => $step['design'] ?? null,
			'funnel'        => is_array( $design ) ? ( $design['data']['funnel_data'] ?? null ) : null,
			'detail'        => $detail,
		);

		if ( 'wc_checkout' === $type ) {
			$products = $this->get_checkout_products( array( 'step_id' => $step_id ) );
			$fields   = $this->get_checkout_fields( array( 'step_id' => $step_id ) );
			if ( ! is_wp_error( $products ) ) {
				$out['checkout_products'] = $products;
			}
			if ( ! is_wp_error( $fields ) ) {
				$out['checkout_fields'] = $fields;
			}
		}

		if ( 'full' === $detail ) {
			$out['configuration'] = array(
				'design'    => $design,
				'customize' => $this->optional_rest_get( $base . '/customize' ),
				'settings'  => $this->optional_rest_get( $base . '/settings' ),
			);
			if ( 'wc_checkout' === $type ) {
				$out['configuration']['checkout_products'] = $this->optional_rest_get( '/funnelkit-app/funnel-checkout/' . $step_id . '/products' );
				$out['configuration']['checkout_fields']   = $this->optional_rest_get( '/funnelkit-app/funnel-checkout/' . $step_id . '/form_fields' );
			}
		}

		return $out;
	}

	/** @return array<string,mixed>|\WP_Error */
	private function get_checkout_products( array $args ) {
		$step_id = self::positive_id( $args, 'step_id' );
		if ( is_wp_error( $step_id ) ) {
			return $step_id;
		}
		$data = $this->rest_get( '/funnelkit-app/funnel-checkout/' . $step_id . '/products' );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$payload  = is_array( $data ) ? ( $data['data'] ?? array() ) : array();
		$products = array();
		foreach ( (array) ( $payload['products'] ?? array() ) as $product ) {
			$product_id = absint( $product['key'] ?? 0 );
			$regular   = self::numeric_price( $product['regular_price'] ?? null );
			$sale      = self::numeric_price( $product['sale_price'] ?? null );
			$current   = $sale && $sale > 0 ? $sale : $regular;
			if ( $product_id > 0 && function_exists( 'wc_get_product' ) ) {
				$wc_product = wc_get_product( $product_id );
				if ( $wc_product instanceof \WC_Product && is_numeric( $wc_product->get_price() ) ) {
					$current = (float) $wc_product->get_price();
				}
			}
			$quantity = max( 1, absint( $product['quantity'] ?? 1 ) );
			$charged  = self::calculate_checkout_price(
				$regular,
				$current,
				(string) ( $product['discount_type'] ?? '' ),
				(float) ( $product['discount_amount'] ?? 0 )
			);
			$products[] = array(
				'product_id'           => $product_id,
				'checkout_item_id'     => (string) ( $product['id'] ?? '' ),
				'title'                => (string) ( $product['title'] ?? '' ),
				'product_type'         => (string) ( $product['product_type'] ?? ( $product['type'] ?? '' ) ),
				'quantity'             => $quantity,
				'regular_price'        => $regular,
				'current_product_price' => $current,
				'discount_type'        => (string) ( $product['discount_type'] ?? '' ),
				'discount_amount'      => (float) ( $product['discount_amount'] ?? 0 ),
				'checkout_unit_price'  => $charged,
				'checkout_line_price'  => null === $charged ? null : $charged * $quantity,
				'currency_symbol'      => html_entity_decode( (string) ( $product['currency_symbol'] ?? '' ), ENT_QUOTES | ENT_HTML5, 'UTF-8' ),
				'in_stock'             => (bool) ( $product['product_stock_status'] ?? $product['stock'] ?? false ),
				'status'               => (string) ( $product['product_status'] ?? '' ),
			);
		}

		return array(
			'step_id'        => $step_id,
			'count'          => count( $products ),
			'selection_mode' => $payload['InitialValue']['add_to_cart_setting'] ?? null,
			'products'       => $products,
		);
	}

	/** @return array<string,mixed>|\WP_Error */
	private function get_checkout_fields( array $args ) {
		$step_id = self::positive_id( $args, 'step_id' );
		if ( is_wp_error( $step_id ) ) {
			return $step_id;
		}
		$data = $this->rest_get( '/funnelkit-app/funnel-checkout/' . $step_id . '/form_fields' );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$fields = is_array( $data ) ? ( $data['data']['fields'] ?? array() ) : array();
		return self::summarize_checkout_fields( $step_id, is_array( $fields ) ? $fields : array() );
	}

	/** Detect FunnelKit's route type with its own public mapper. */
	protected function detect_step_type( int $step_id ) {
		$post_type = get_post_type( $step_id );
		if ( ! is_string( $post_type ) || '' === $post_type || ! class_exists( 'WFFN_Common' ) ) {
			return new \WP_Error( 'funnelkit_page_not_found', __( 'No FunnelKit page exists for this step_id.', 'emcp-tools' ) );
		}
		$type = WFFN_Common::get_step_type( $post_type );
		if ( ! in_array( $type, array( 'wc_checkout', 'wc_upsells', 'wc_thankyou', 'landing', 'optin', 'optin_ty' ), true ) ) {
			return new \WP_Error( 'unsupported_funnelkit_page', __( 'This post is not a supported FunnelKit funnel page.', 'emcp-tools' ) );
		}
		return $type;
	}

	/** Execute a FunnelKit REST request; overridable in unit tests. */
	protected function do_rest( $request ) {
		return rest_do_request( $request );
	}

	/** The shared REST client, dispatching through do_rest() so tests can replace FunnelKit's answers. */
	protected function rest(): EMCP_Tools_FunnelKit_Rest {
		return new EMCP_Tools_FunnelKit_Rest(
			function ( $request ) {
				return $this->do_rest( $request );
			}
		);
	}

	/** @return mixed|\WP_Error */
	private function rest_get( string $route, array $query = array() ) {
		return $this->rest()->request( 'GET', $route, $query );
	}

	/** Keep optional full-payload sections self-describing without failing the page read. */
	private function optional_rest_get( string $route ) {
		$data = $this->rest_get( $route );
		if ( ! is_wp_error( $data ) ) {
			return $data;
		}
		return array(
			'error'   => $data->get_error_code(),
			'message' => $data->get_error_message(),
			'data'    => $data->get_error_data(),
		);
	}

	/** @return int|\WP_Error */
	private static function positive_id( array $args, string $key ) {
		$value = $args[ $key ] ?? null;
		if ( ! is_int( $value ) && ! ( is_string( $value ) && ctype_digit( $value ) ) ) {
			/* translators: %s: Input argument name. */
			return new \WP_Error( 'missing_argument', sprintf( __( '%s must be a positive integer.', 'emcp-tools' ), $key ) );
		}
		$value = (int) $value;
		if ( $value < 1 ) {
			/* translators: %s: Input argument name. */
			return new \WP_Error( 'missing_argument', sprintf( __( '%s must be a positive integer.', 'emcp-tools' ), $key ) );
		}
		return $value;
	}

	private static function numeric_price( $value ): ?float {
		return is_numeric( $value ) ? (float) $value : null;
	}

	/** Exact FunnelKit checkout discount calculation, expressed with numeric inputs. */
	public static function calculate_checkout_price( ?float $regular, ?float $current, string $type, float $amount ): ?float {
		if ( null === $regular || null === $current ) {
			return null;
		}
		switch ( $type ) {
			case 'fixed_discount_reg':
				$price = 0.0 === $amount ? $regular : $regular - $amount;
				break;
			case 'fixed_discount_sale':
				$price = 0.0 === $amount ? $current : $current - $amount;
				break;
			case 'percent_discount_reg':
				$price = 0.0 === $amount ? $current : $regular - ( $amount / 100 * $regular );
				break;
			case 'percent_discount_sale':
				$price = 0.0 === $amount ? $current : $current - ( $amount / 100 * $current );
				break;
			case 'flat_price':
				$price = $amount > 0 ? $amount : $current;
				break;
			default:
				$price = $current;
		}
		return max( 0, $price );
	}

	/** Preserve FunnelKit's saved step order and expose it explicitly. */
	private static function summarize_steps( array $steps ): array {
		$out = array();
		foreach ( array_values( $steps ) as $position => $step ) {
			$out[] = array(
				'position' => $position + 1,
				'id'       => absint( $step['id'] ?? 0 ),
				'type'     => (string) ( $step['type'] ?? '' ),
				'title'    => (string) ( $step['_data']['title'] ?? '' ),
				'status'   => $step['_data']['status'] ?? null,
				'view_url' => $step['_data']['view_link'] ?? ( $step['_data']['view'] ?? null ),
				'edit_url' => $step['_data']['edit'] ?? null,
				'substeps' => isset( $step['substeps'] ) && is_array( $step['substeps'] ) ? count( $step['substeps'] ) : 0,
			);
		}
		return $out;
	}

	/** Summarize decoded checkout fieldsets without the large available-field catalog. */
	public static function summarize_checkout_fields( int $step_id, array $fields ): array {
		$fieldsets   = array();
		$field_count = 0;
		foreach ( (array) ( $fields['fieldsets'] ?? array() ) as $step_slug => $groups ) {
			foreach ( (array) $groups as $group_position => $group ) {
				$items = array();
				foreach ( (array) ( $group['fields'] ?? array() ) as $field_position => $field ) {
					$items[] = array(
						'position'    => $field_position + 1,
						'id'          => (string) ( $field['id'] ?? $field['key'] ?? '' ),
						'label'       => (string) ( $field['label'] ?? $field['data_label'] ?? '' ),
						'type'        => (string) ( $field['type'] ?? '' ),
						'field_type'  => (string) ( $field['field_type'] ?? '' ),
						'required'    => self::boolean_value( $field['required'] ?? false ),
						'placeholder' => (string) ( $field['placeholder'] ?? '' ),
					);
					++$field_count;
				}
				$fieldsets[] = array(
					'step'       => (string) $step_slug,
					'position'   => $group_position + 1,
					'name'       => (string) ( $group['name'] ?? '' ),
					'subheading' => (string) ( $group['sub_heading'] ?? '' ),
					'fields'     => $items,
				);
			}
		}
		return array(
			'step_id'        => $step_id,
			'active_layout'  => self::active_checkout_layout( (array) ( $fields['steps'] ?? array() ) ),
			'field_count'    => $field_count,
			'active_fields'  => array_values( (array) ( $fields['active_fields'] ?? array() ) ),
			'fieldsets'      => $fieldsets,
			'custom_fields'  => array_values( (array) ( $fields['custom_fields'] ?? array() ) ),
			'shipping_enabled' => (bool) ( $fields['is_shipping_enabled'] ?? false ),
		);
	}

	private static function active_checkout_layout( array $steps ): ?string {
		foreach ( $steps as $slug => $step ) {
			if ( 'yes' === ( $step['active'] ?? '' ) ) {
				return (string) $slug;
			}
		}
		return null;
	}

	/** Normalize the boolean-like values returned by FunnelKit's form schema. */
	private static function boolean_value( $value ): bool {
		if ( is_bool( $value ) ) {
			return $value;
		}
		if ( is_int( $value ) || is_float( $value ) ) {
			return 1 === (int) $value;
		}
		return in_array( strtolower( trim( (string) $value ) ), array( '1', 'true', 'yes', 'on' ), true );
	}
}
