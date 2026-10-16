<?php
/**
 * WooCommerce Pro integration — two dispatcher tools (woo-read / woo-write)
 * over the full wc/v3 REST surface via internal rest_do_request().
 *
 * Operations map to Woo's own REST routes; dispatch() templates the route,
 * builds a WP_REST_Request, and lets Woo's controllers execute it as the
 * authenticated admin (no privilege escalation, HPOS-safe, always current).
 *
 * @package EMCP_Tools
 * @since   3.4.2
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * @since 3.4.2
 */
class EMCP_Tools_Woo_Integration {

	/** @var string[] */
	private $ability_names = array();

	/** WooCommerce active? */
	public static function woo_active(): bool {
		return class_exists( 'WooCommerce' ) || function_exists( 'WC' );
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
		$this->register_read_dispatcher();
		$this->register_write_dispatcher();
	}

	// -------------------------------------------------------------------------
	// Dispatcher tools
	// -------------------------------------------------------------------------

	private function register_read_dispatcher(): void {
		$this->ability_names[] = 'emcp-tools/woo-read';
		emcp_tools_register_ability(
			'emcp-tools/woo-read',
			array(
				'label'               => __( 'WooCommerce Read', 'emcp-tools' ),
				'description'         => __( 'Read WooCommerce data: products, native brands, variations, orders, refunds, customers, coupons, reports, settings, shipping, taxes, webhooks, and system status. Call with no "operation" to list the available read operations and their arguments, then call again with { operation, arguments }.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'run_woo_read' ),
				'permission_callback' => array( $this, 'check_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'operation' => array( 'type' => 'string', 'description' => __( 'The read operation to run. Omit to list operations (e.g. list-products, get-order, list-customers, report-sales).', 'emcp-tools' ) ),
						'arguments' => array( 'type' => 'object', 'description' => __( 'Arguments for the chosen operation (see the catalog returned when operation is omitted).', 'emcp-tools' ) ),
					),
				),
				'meta'                => array(
					'annotations'  => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
					'show_in_rest' => true,
				),
			)
		);
	}

	private function register_write_dispatcher(): void {
		$this->ability_names[] = 'emcp-tools/woo-write';
		emcp_tools_register_ability(
			'emcp-tools/woo-write',
			array(
				'label'               => __( 'WooCommerce Write', 'emcp-tools' ),
				'description'         => __( 'Create, update, and delete WooCommerce data: products, orders, refunds, customers, coupons, settings, shipping, taxes, and webhooks. Also create/update native brands with validated logo attachments and dry_run:true preflight. Disabled by default, enable under Neo EMCP → Tools → Plugins → WooCommerce. Money/irreversible operations (refunds, deletes, batch) require confirm:true. Call with no "operation" to list the available write operations and their arguments.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'run_woo_write' ),
				'permission_callback' => array( $this, 'check_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'operation' => array( 'type' => 'string', 'description' => __( 'The write operation to run. Omit to list operations (e.g. create-product, update-order, create-refund).', 'emcp-tools' ) ),
						'arguments' => array( 'type' => 'object', 'description' => __( 'Arguments for the chosen operation. Refunds/deletes/batch require confirm:true.', 'emcp-tools' ) ),
					),
				),
				'meta'                => array(
					'annotations'  => array( 'readonly' => false, 'destructive' => true, 'idempotent' => false ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/** @param mixed $input */
	public function run_woo_read( $input ) {
		return $this->dispatch( 'read', $input );
	}

	/** @param mixed $input */
	public function run_woo_write( $input ) {
		return $this->dispatch( 'write', $input );
	}

	/** Dispatcher permission: the WooCommerce shop-manager capability. */
	public function check_permission(): bool {
		return current_user_can( 'manage_woocommerce' );
	}

	// -------------------------------------------------------------------------
	// Dispatch
	// -------------------------------------------------------------------------

	/**
	 * Route an operation to Woo's REST controller after gating.
	 *
	 * @param string $mode  'read' or 'write'.
	 * @param mixed  $input { operation, arguments }.
	 * @return mixed
	 */
	private function dispatch( string $mode, $input ) {
		$operation = ( is_array( $input ) && isset( $input['operation'] ) )
			? str_replace( '_', '-', sanitize_key( (string) $input['operation'] ) )
			: '';

		if ( '' === $operation ) {
			return $this->operations_catalog( $mode );
		}

		$ops = $this->operations();
		if ( ! isset( $ops[ $operation ] ) || $ops[ $operation ]['mode'] !== $mode ) {
			return new \WP_Error(
				'unknown_operation',
				sprintf(
					/* translators: 1: mode (read/write), 2: operation name */
					__( 'Unknown WooCommerce %1$s operation "%2$s". Call woo-%1$s with no operation to list the available operations.', 'emcp-tools' ),
					$mode,
					$operation
				)
			);
		}

		$op   = $ops[ $operation ];
		$args = ( is_array( $input ) && isset( $input['arguments'] ) && is_array( $input['arguments'] ) )
			? $input['arguments']
			: array();

		if ( ! empty( $op['confirm'] ) && ( ! isset( $args['confirm'] ) || true !== $args['confirm'] ) ) {
			return new \WP_Error(
				'confirmation_required',
				__( 'This WooCommerce operation is irreversible or moves money. Pass confirm:true in arguments to proceed.', 'emcp-tools' )
			);
		}
		unset( $args['confirm'] );

		if ( ! empty( $op['handler'] ) ) {
			$handler = $op['handler'];
			return $this->$handler( $args );
		}

		$is_brand = in_array( $operation, array( 'list-brands', 'get-brand', 'create-brand', 'update-brand' ), true );
		if ( $is_brand ) {
			$prepared = $this->prepare_brand( $operation, $args );
			if ( is_wp_error( $prepared ) ) {
				return $prepared;
			}
			if ( true === ( $args['dry_run'] ?? false ) ) {
				return array( 'dry_run' => true, 'operation' => $operation, 'taxonomy' => 'product_brand', 'arguments' => $prepared, 'validation' => 'passed', 'seo' => self::brand_seo_guidance() );
			}
			$args = $prepared;
		}

		$built = self::build_route( $op['route'], $args );
		if ( is_wp_error( $built ) ) {
			return $built;
		}
		list( $route, $rest ) = $built;

		$request = new \WP_REST_Request( $op['method'], '/wc/v3/' . $route );
		if ( 'GET' === $op['method'] || 'DELETE' === $op['method'] ) {
			if ( 'DELETE' === $op['method'] && ! isset( $rest['force'] ) ) {
				$rest['force'] = true; // Permanently delete (Woo trashes otherwise).
			}
			$request->set_query_params( $rest );
		} else {
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( wp_json_encode( $rest ) );
		}

		$response = $this->do_rest( $request );
		if ( is_wp_error( $response ) ) {
			return $response;
		}

		$data   = $response->get_data();
		$status = $response->get_status();
		if ( $status >= 400 ) {
			$message = is_array( $data ) && isset( $data['message'] ) ? (string) $data['message'] : __( 'WooCommerce returned an error.', 'emcp-tools' );
			return new \WP_Error( 'woo_error', $message, array( 'status' => $status, 'data' => $data ) );
		}
		if ( $is_brand && is_array( $data ) ) {
			return 'list-brands' === $operation ? array_map( array( $this, 'brand_result' ), $data ) : $this->brand_result( $data );
		}
		return $data;
	}

	/** Preview an idempotent product import from agent-normalized rows. */
	public function execute_plan_product_import( $input ) {
		$items = EMCP_Tools_Structured_Import::normalize_items( $input['items'] ?? null );
		if ( is_wp_error( $items ) ) {
			return $items;
		}
		$plan = $this->build_product_import_plan( $items );
		return array(
			'dry_run'   => true,
			'valid'     => $plan['valid'],
			'plan_hash' => EMCP_Tools_Structured_Import::plan_hash( 'woo-products-v1', $items ),
			'total'     => count( $items ),
			'summary'   => $plan['summary'],
			'results'   => $plan['results'],
		);
	}

	/** Apply a product import whose exact payload was previously previewed. */
	public function execute_upsert_products( $input ) {
		$items = EMCP_Tools_Structured_Import::normalize_items( $input['items'] ?? null );
		if ( is_wp_error( $items ) ) {
			return $items;
		}
		$expected = EMCP_Tools_Structured_Import::plan_hash( 'woo-products-v1', $items );
		$matched  = EMCP_Tools_Structured_Import::require_plan_hash( $input['plan_hash'] ?? '', $expected );
		if ( is_wp_error( $matched ) ) {
			return $matched;
		}
		$plan = $this->build_product_import_plan( $items );
		if ( ! $plan['valid'] ) {
			return new \WP_Error( 'import_validation_failed', __( 'The product import is invalid. Nothing was written.', 'emcp-tools' ), array( 'plan_hash' => $expected, 'results' => $plan['results'] ) );
		}

		$create = array();
		$update = array();
		$refs   = array( 'create' => array(), 'update' => array() );
		foreach ( $plan['prepared'] as $prepared ) {
			$data       = $prepared['data'];
			$variations = $data['variations'] ?? array();
			unset( $data['variations'] );
			if ( 'create' === $prepared['action'] ) {
				$create[]         = $data;
				$refs['create'][] = array( 'item' => $prepared['item'], 'variations' => $variations );
			} else {
				$data['id']       = $prepared['product_id'];
				$update[]         = $data;
				$refs['update'][] = array( 'item' => $prepared['item'], 'variations' => $variations );
			}
		}

		$batch = $this->wc_request( 'POST', 'products/batch', array( 'create' => $create, 'update' => $update ) );
		if ( is_wp_error( $batch ) ) {
			return $batch;
		}
		$results = array();
		foreach ( array( 'create' => 'created', 'update' => 'updated' ) as $bucket => $status ) {
			foreach ( (array) ( $batch[ $bucket ] ?? array() ) as $index => $product ) {
				$ref = $refs[ $bucket ][ $index ] ?? null;
				if ( ! $ref ) { continue; }
				if ( isset( $product['error'] ) ) {
					$results[] = $this->product_import_error_result( $ref['item'], $product['error'] );
					continue;
				}
				$product_id = absint( $product['id'] ?? 0 );
				$variation_results = $this->apply_product_variations( $product_id, $ref['variations'] );
				$verified = $product_id ? $this->wc_request( 'GET', 'products/' . $product_id, array() ) : new \WP_Error( 'missing_product_id', __( 'WooCommerce did not return a product id.', 'emcp-tools' ) );
				if ( is_wp_error( $verified ) ) {
					$results[] = $this->product_import_error_result( $ref['item'], $verified );
					continue;
				}
				$results[] = array(
					'client_ref' => $ref['item']['client_ref'],
					'source'     => $ref['item']['source'],
					'status'     => $status,
					'id'         => $product_id,
					'sku'        => (string) ( $verified['sku'] ?? '' ),
					'name'       => (string) ( $verified['name'] ?? '' ),
					'type'       => (string) ( $verified['type'] ?? '' ),
					'variations' => $variation_results,
				);
			}
		}
		return array( 'applied' => true, 'plan_hash' => $expected, 'total' => count( $items ), 'results' => $results );
	}

	/** Build the create/update decision table without mutating WooCommerce. */
	private function build_product_import_plan( array $items ): array {
		$results  = array();
		$prepared = array();
		$seen_sku = array();
		$summary  = array( 'create' => 0, 'update' => 0, 'error' => 0 );
		foreach ( $items as $item ) {
			$data   = $item['data'];
			$errors = array();
			$id     = absint( $data['id'] ?? 0 );
			$sku    = trim( (string) ( $data['sku'] ?? '' ) );
			$type   = sanitize_key( (string) ( $data['type'] ?? 'simple' ) );
			if ( ! $id && '' === $sku ) { $errors[] = 'product_id_or_sku_required'; }
			if ( ! in_array( $type, array( 'simple', 'variable' ), true ) ) { $errors[] = 'unsupported_product_type'; }
			if ( '' !== $sku ) {
				$key = strtolower( $sku );
				if ( isset( $seen_sku[ $key ] ) ) { $errors[] = 'duplicate_source_sku'; }
				$seen_sku[ $key ] = true;
			}

			$existing_id = 0;
			if ( $id ) {
				$product = function_exists( 'wc_get_product' ) ? wc_get_product( $id ) : false;
				if ( ! $product ) { $errors[] = 'product_id_not_found'; }
				else {
					$existing_id = $id;
					if ( '' !== $sku && method_exists( $product, 'get_sku' ) && (string) $product->get_sku() !== $sku ) { $errors[] = 'product_id_sku_mismatch'; }
				}
			} elseif ( '' !== $sku && function_exists( 'wc_get_product_id_by_sku' ) ) {
				$existing_id = absint( wc_get_product_id_by_sku( $sku ) );
			}
			$action = $existing_id ? 'update' : 'create';
			if ( 'create' === $action && '' === trim( (string) ( $data['name'] ?? '' ) ) ) { $errors[] = 'name_required_for_create'; }
			if ( isset( $data['images'] ) && is_array( $data['images'] ) ) {
				foreach ( $data['images'] as $image ) {
					$image_id = absint( is_array( $image ) ? ( $image['id'] ?? 0 ) : 0 );
					if ( ! $image_id || 'attachment' !== get_post_type( $image_id ) || ( function_exists( 'wp_attachment_is_image' ) && ! wp_attachment_is_image( $image_id ) ) ) { $errors[] = 'invalid_image_attachment'; break; }
				}
			}
			if ( 'simple' === $type && ! empty( $data['variations'] ) ) { $errors[] = 'variations_require_variable_product'; }
			if ( 'variable' === $type ) {
				foreach ( (array) ( $data['variations'] ?? array() ) as $variation ) {
					if ( ! is_array( $variation ) || ( empty( $variation['id'] ) && '' === trim( (string) ( $variation['sku'] ?? '' ) ) ) ) { $errors[] = 'variation_id_or_sku_required'; break; }
					$variation_id = absint( $variation['id'] ?? 0 );
					if ( ! $variation_id && ! empty( $variation['sku'] ) && function_exists( 'wc_get_product_id_by_sku' ) ) {
						$variation_id = absint( wc_get_product_id_by_sku( (string) $variation['sku'] ) );
					}
					if ( $variation_id ) {
						$variation_product = function_exists( 'wc_get_product' ) ? wc_get_product( $variation_id ) : false;
						if ( ! $variation_product || ! method_exists( $variation_product, 'get_parent_id' ) ) {
							$errors[] = 'variation_not_found';
							break;
						}
						if ( ! $existing_id || (int) $variation_product->get_parent_id() !== $existing_id ) {
							$errors[] = 'variation_parent_mismatch';
							break;
						}
					}
				}
			}
			$status = $errors ? 'error' : $action;
			$summary[ $errors ? 'error' : $action ]++;
			$results[] = array( 'client_ref' => $item['client_ref'], 'source' => $item['source'], 'status' => $status, 'product_id' => $existing_id ?: null, 'sku' => $sku, 'errors' => array_values( array_unique( $errors ) ) );
			if ( ! $errors ) { $prepared[] = array( 'item' => $item, 'data' => $data, 'action' => $action, 'product_id' => $existing_id ); }
		}
		return array( 'valid' => 0 === $summary['error'], 'summary' => $summary, 'results' => $results, 'prepared' => $prepared );
	}

	/** Apply variations after the parent exists, preserving the same ID/SKU rules. */
	private function apply_product_variations( int $product_id, array $variations ): array {
		if ( ! $variations ) { return array(); }
		$create = array(); $update = array();
		foreach ( $variations as $variation ) {
			$id = absint( $variation['id'] ?? 0 );
			if ( ! $id && ! empty( $variation['sku'] ) && function_exists( 'wc_get_product_id_by_sku' ) ) { $id = absint( wc_get_product_id_by_sku( (string) $variation['sku'] ) ); }
			if ( $id ) { $variation['id'] = $id; $update[] = $variation; } else { $create[] = $variation; }
		}
		$out = $this->wc_request( 'POST', 'products/' . $product_id . '/variations/batch', array( 'create' => $create, 'update' => $update ) );
		return is_wp_error( $out ) ? array( array( 'status' => 'error', 'error' => $out->get_error_code(), 'message' => $out->get_error_message() ) ) : $out;
	}

	/** Execute one internal Woo REST request and normalize errors. */
	private function wc_request( string $method, string $route, array $arguments ) {
		$request = new \WP_REST_Request( $method, '/wc/v3/' . ltrim( $route, '/' ) );
		if ( 'GET' === $method ) { $request->set_query_params( $arguments ); }
		else { $request->set_header( 'Content-Type', 'application/json' ); $request->set_body( wp_json_encode( $arguments ) ); }
		$response = $this->do_rest( $request );
		if ( is_wp_error( $response ) ) { return $response; }
		$data = $response->get_data();
		if ( $response->get_status() >= 400 ) { return new \WP_Error( 'woo_error', (string) ( $data['message'] ?? __( 'WooCommerce returned an error.', 'emcp-tools' ) ), array( 'status' => $response->get_status(), 'data' => $data ) ); }
		return $data;
	}

	private function product_import_error_result( array $item, $error ): array {
		if ( is_wp_error( $error ) ) { $code = $error->get_error_code(); $message = $error->get_error_message(); }
		else { $code = (string) ( $error['code'] ?? 'woo_error' ); $message = (string) ( $error['message'] ?? __( 'WooCommerce returned an error.', 'emcp-tools' ) ); }
		return array( 'client_ref' => $item['client_ref'], 'source' => $item['source'], 'status' => 'error', 'error' => $code, 'message' => $message );
	}

	/** Native Brands only; never guess a third-party taxonomy or meta contract. */
	protected function brands_available(): bool {
		return taxonomy_exists( 'product_brand' ) && isset( rest_get_server()->get_routes()['/wc/v3/products/brands'] );
	}

	/** Match the taxonomy permissions used by Woo's term controllers, including dry runs. */
	protected function can_write_brands( string $operation ): bool {
		$taxonomy = get_taxonomy( 'product_brand' );
		$capability = 'create-brand' === $operation ? 'manage_terms' : 'edit_terms';
		return $taxonomy && current_user_can( $taxonomy->cap->$capability );
	}

	private static function brand_seo_guidance(): string {
		return 'Use the active SEO plugin dispatcher get-term-seo/update-term-seo with term_id for SEO title, description, canonical and focus keyword, then read back. Brand description is archive content, not an SEO meta description. No SEO fields were written by this operation.';
	}

	/** Preflight is read-only: no taxonomy, media or SEO mutation on dry_run. */
	private function prepare_brand( string $operation, array $args ) {
		if ( ! $this->check_permission() ) {
			return new \WP_Error( 'forbidden', __( 'WooCommerce access requires manage_woocommerce.', 'emcp-tools' ) );
		}
		if ( ! $this->brands_available() ) {
			return new \WP_Error( 'brands_unsupported', __( 'Native WooCommerce Brands (product_brand and /wc/v3/products/brands) is unavailable. Enable WooCommerce Brands; third-party brand taxonomies are not modified.', 'emcp-tools' ) );
		}
		$write = in_array( $operation, array( 'create-brand', 'update-brand' ), true );
		if ( array_key_exists( 'dry_run', $args ) && ( ! $write || ! is_bool( $args['dry_run'] ) ) ) {
			return new \WP_Error( 'invalid_argument', __( 'dry_run must be a boolean and is only supported for brand writes.', 'emcp-tools' ) );
		}
		unset( $args['dry_run'] );
		if ( 'get-brand' === $operation || 'update-brand' === $operation ) {
			if ( ! isset( $args['id'] ) || ! is_int( $args['id'] ) || $args['id'] < 1 ) {
				return new \WP_Error( 'invalid_argument', __( 'A positive integer brand id is required.', 'emcp-tools' ) );
			}
			if ( ! get_term_by( 'id', $args['id'], 'product_brand' ) ) {
				return new \WP_Error( 'brand_not_found', __( 'No native WooCommerce brand has this id.', 'emcp-tools' ) );
			}
		}
		if ( ! $write ) {
			return $args;
		}
		if ( ! $this->can_write_brands( $operation ) ) {
			return new \WP_Error( 'forbidden', __( 'You cannot manage this brand taxonomy.', 'emcp-tools' ) );
		}
		$unknown = array_diff( array_keys( $args ), array( 'id', 'name', 'slug', 'description', 'logo_attachment_id', 'image' ) );
		if ( $unknown || ( 'create-brand' === $operation && isset( $args['id'] ) ) ) {
			return new \WP_Error( 'invalid_argument', __( 'Brand writes accept name, slug, description, logo_attachment_id (or image.id), dry_run, and id for updates. Use the SEO term tools for SEO fields.', 'emcp-tools' ) );
		}
		if ( 'create-brand' === $operation && ! isset( $args['name'] ) ) {
			return new \WP_Error( 'missing_argument', __( 'Brand name is required.', 'emcp-tools' ) );
		}
		foreach ( array( 'name', 'slug', 'description' ) as $field ) {
			if ( ! array_key_exists( $field, $args ) ) {
				continue;
			}
			if ( ! is_string( $args[ $field ] ) ) {
				return new \WP_Error( 'invalid_argument', __( 'Brand name, slug and description must be strings.', 'emcp-tools' ) );
			}
			$args[ $field ] = 'description' === $field ? wp_kses_post( $args[ $field ] ) : ( 'slug' === $field ? sanitize_title( $args[ $field ] ) : sanitize_text_field( $args[ $field ] ) );
			if ( 'description' !== $field && '' === trim( $args[ $field ] ) ) {
				return new \WP_Error( 'invalid_argument', __( 'Brand name and slug cannot be blank.', 'emcp-tools' ) );
			}
		}
		if ( 'create-brand' === $operation && ! isset( $args['slug'] ) ) {
			$args['slug'] = sanitize_title( $args['name'] );
		}
		foreach ( array( 'name', 'slug' ) as $field ) {
			if ( isset( $args[ $field ] ) ) {
				$existing = get_term_by( $field, $args[ $field ], 'product_brand' );
				if ( $existing && (int) $existing->term_id !== ( $args['id'] ?? 0 ) ) {
					return new \WP_Error( 'brand_exists', __( 'A brand with this name or slug already exists. Read it and explicitly update its id.', 'emcp-tools' ), array( 'term_id' => (int) $existing->term_id ) );
				}
			}
		}
		if ( array_key_exists( 'logo_attachment_id', $args ) ) {
			if ( array_key_exists( 'image', $args ) ) {
				return new \WP_Error( 'invalid_argument', __( 'Use either logo_attachment_id or image.id, not both.', 'emcp-tools' ) );
			}
			$args['image'] = array( 'id' => $args['logo_attachment_id'] );
			unset( $args['logo_attachment_id'] );
		}
		if ( array_key_exists( 'image', $args ) ) {
			$image = $args['image'];
			if ( ! is_array( $image ) || array_diff( array_keys( $image ), array( 'id' ) ) || ! isset( $image['id'] ) || ! is_int( $image['id'] ) || $image['id'] < 0 ) {
				return new \WP_Error( 'invalid_logo', __( 'Use an existing image attachment id (0 removes the logo). Remote URLs are not accepted: use sideload-image first. Edit attachment title/alt separately.', 'emcp-tools' ) );
			}
			if ( $image['id'] > 0 && ( 'attachment' !== get_post_type( $image['id'] ) || ! wp_attachment_is_image( $image['id'] ) ) ) {
				return new \WP_Error( 'invalid_logo', __( 'The logo id must reference an existing image attachment.', 'emcp-tools' ) );
			}
			if ( $image['id'] > 0 && ! current_user_can( 'read_post', $image['id'] ) ) {
				return new \WP_Error( 'forbidden', __( 'You cannot access this logo attachment.', 'emcp-tools' ) );
			}
		}
		return $args;
	}

	/** Preserve Woo fields and add the identifiers needed by the media/SEO workflow. */
	private function brand_result( array $data ): array {
		if ( ! isset( $data['id'] ) ) {
			return $data;
		}
		$url = get_term_link( (int) $data['id'], 'product_brand' );
		$data['term_id'] = (int) $data['id'];
		$data['taxonomy'] = 'product_brand';
		$data['url'] = is_wp_error( $url ) ? null : $url;
		$data['logo_attachment_id'] = (int) ( $data['image']['id'] ?? 0 );
		$data['seo'] = self::brand_seo_guidance();
		return $data;
	}

	/**
	 * Execute a REST request against Woo's controllers. Seam so tests can
	 * override without a live WooCommerce install.
	 *
	 * @param \WP_REST_Request $request Request.
	 * @return \WP_REST_Response|\WP_Error
	 */
	protected function do_rest( $request ) {
		return rest_do_request( $request );
	}

	/**
	 * Substitute {placeholder} path segments from $args; return [ $route,
	 * $leftoverArgs ] or WP_Error when a required placeholder has no argument.
	 *
	 * @param string $template Route template, e.g. 'orders/{order_id}/refunds/{id}'.
	 * @param array  $args     Operation arguments.
	 * @return array|\WP_Error
	 */
	public static function build_route( string $template, array $args ) {
		$missing = array();
		$route   = preg_replace_callback(
			'/\{([a-z_]+)\}/',
			static function ( $m ) use ( &$args, &$missing ) {
				$key = $m[1];
				if ( ! isset( $args[ $key ] ) || '' === $args[ $key ] ) {
					$missing[] = $key;
					return $m[0];
				}
				$val = $args[ $key ];
				unset( $args[ $key ] );
				return rawurlencode( (string) $val );
			},
			$template
		);

		if ( ! empty( $missing ) ) {
			return new \WP_Error(
				'missing_argument',
				sprintf(
					/* translators: %s: comma-separated argument names */
					__( 'Missing required argument(s): %s.', 'emcp-tools' ),
					implode( ', ', $missing )
				)
			);
		}
		return array( $route, $args );
	}

	// -------------------------------------------------------------------------
	// Operation catalog
	// -------------------------------------------------------------------------

	/**
	 * The full operation map: name => { mode, method, route, desc, confirm? }.
	 *
	 * @return array<string,array<string,mixed>>
	 */
	private function operations(): array {
		return array(
			// PRODUCTS.
			'plan-product-import' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'products/import-plan', 'handler' => 'execute_plan_product_import', 'desc' => __( 'Validate and plan up to 100 agent-parsed product rows without writing. arguments: { items:[{client_ref,source?,data:{id|sku,...}}] }. Returns plan_hash.', 'emcp-tools' ) ),
			'upsert-products' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'products/import-upsert', 'handler' => 'execute_upsert_products', 'confirm' => true, 'desc' => __( 'Create or update up to 100 products by ID first or exact SKU second. arguments: { items:[...], plan_hash, confirm:true }. Never matches by name and never deletes.', 'emcp-tools' ) ),
			'list-products'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products', 'desc' => __( 'List/search products. arguments: filters (search, category, sku, status, per_page, page, orderby…).', 'emcp-tools' ) ),
			'get-product'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/{id}', 'desc' => __( 'Get one product. arguments: { id }.', 'emcp-tools' ) ),
			'create-product' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'products', 'desc' => __( 'Create a product. arguments: { name, type, regular_price, sku, … }.', 'emcp-tools' ) ),
			'update-product' => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'products/{id}', 'desc' => __( 'Update a product (incl. stock). arguments: { id, … }.', 'emcp-tools' ) ),
			'delete-product' => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'products/{id}', 'confirm' => true, 'desc' => __( 'Permanently delete a product. arguments: { id, confirm:true }.', 'emcp-tools' ) ),
			'batch-products' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'products/batch', 'confirm' => true, 'desc' => __( 'Batch create/update/delete products. arguments: { create:[…], update:[…], delete:[ids], confirm:true }.', 'emcp-tools' ) ),

			// PRODUCT VARIATIONS.
			'list-variations'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/{product_id}/variations', 'desc' => __( 'List a product\'s variations. arguments: { product_id }.', 'emcp-tools' ) ),
			'get-variation'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/{product_id}/variations/{id}', 'desc' => __( 'Get one variation. arguments: { product_id, id }.', 'emcp-tools' ) ),
			'create-variation' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'products/{product_id}/variations', 'desc' => __( 'Create a variation. arguments: { product_id, regular_price, attributes, … }.', 'emcp-tools' ) ),
			'update-variation' => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'products/{product_id}/variations/{id}', 'desc' => __( 'Update a variation. arguments: { product_id, id, … }.', 'emcp-tools' ) ),
			'delete-variation' => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'products/{product_id}/variations/{id}', 'confirm' => true, 'desc' => __( 'Delete a variation. arguments: { product_id, id, confirm:true }.', 'emcp-tools' ) ),

			// ORDERS.
			'list-orders'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'orders', 'desc' => __( 'List/search orders. arguments: filters (status, customer, after, before, per_page…).', 'emcp-tools' ) ),
			'get-order'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'orders/{id}', 'desc' => __( 'Get one order (line items, totals, customer, status). arguments: { id }.', 'emcp-tools' ) ),
			'create-order' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'orders', 'desc' => __( 'Create an order. arguments: { line_items:[…], customer_id, status, … }.', 'emcp-tools' ) ),
			'update-order' => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'orders/{id}', 'desc' => __( 'Update an order (incl. set status). arguments: { id, status, … }.', 'emcp-tools' ) ),
			'delete-order' => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'orders/{id}', 'confirm' => true, 'desc' => __( 'Permanently delete an order. arguments: { id, confirm:true }.', 'emcp-tools' ) ),
			'batch-orders' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'orders/batch', 'confirm' => true, 'desc' => __( 'Batch create/update/delete orders. arguments: { create, update, delete, confirm:true }.', 'emcp-tools' ) ),

			// ORDER NOTES.
			'list-order-notes'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'orders/{order_id}/notes', 'desc' => __( 'List an order\'s notes. arguments: { order_id }.', 'emcp-tools' ) ),
			'get-order-note'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'orders/{order_id}/notes/{id}', 'desc' => __( 'Get one order note. arguments: { order_id, id }.', 'emcp-tools' ) ),
			'create-order-note' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'orders/{order_id}/notes', 'desc' => __( 'Add a note to an order. arguments: { order_id, note, customer_note? }.', 'emcp-tools' ) ),
			'delete-order-note' => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'orders/{order_id}/notes/{id}', 'desc' => __( 'Delete an order note. arguments: { order_id, id }.', 'emcp-tools' ) ),

			// REFUNDS (create MOVES MONEY).
			'list-refunds'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'orders/{order_id}/refunds', 'desc' => __( 'List an order\'s refunds. arguments: { order_id }.', 'emcp-tools' ) ),
			'get-refund'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'orders/{order_id}/refunds/{id}', 'desc' => __( 'Get one refund. arguments: { order_id, id }.', 'emcp-tools' ) ),
			'create-refund' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'orders/{order_id}/refunds', 'confirm' => true, 'desc' => __( 'Refund an order (MOVES MONEY). arguments: { order_id, amount, reason?, api_refund?, line_items?, confirm:true }.', 'emcp-tools' ) ),
			'delete-refund' => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'orders/{order_id}/refunds/{id}', 'confirm' => true, 'desc' => __( 'Delete a refund record. arguments: { order_id, id, confirm:true }.', 'emcp-tools' ) ),

			// CUSTOMERS (PII).
			'list-customers'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'customers', 'desc' => __( 'List/search customers. arguments: filters (search, email, role, per_page…).', 'emcp-tools' ) ),
			'get-customer'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'customers/{id}', 'desc' => __( 'Get one customer (PII: email, addresses). arguments: { id }.', 'emcp-tools' ) ),
			'customer-downloads' => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'customers/{customer_id}/downloads', 'desc' => __( 'List a customer\'s downloadable products. arguments: { customer_id }.', 'emcp-tools' ) ),
			'create-customer'   => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'customers', 'desc' => __( 'Create a customer. arguments: { email, first_name, last_name, … }.', 'emcp-tools' ) ),
			'update-customer'   => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'customers/{id}', 'desc' => __( 'Update a customer. arguments: { id, … }.', 'emcp-tools' ) ),
			'delete-customer'   => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'customers/{id}', 'confirm' => true, 'desc' => __( 'Permanently delete a customer (GDPR). arguments: { id, confirm:true, reassign? }.', 'emcp-tools' ) ),

			// COUPONS.
			'list-coupons'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'coupons', 'desc' => __( 'List coupons. arguments: filters (search, code, per_page…).', 'emcp-tools' ) ),
			'get-coupon'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'coupons/{id}', 'desc' => __( 'Get one coupon. arguments: { id }.', 'emcp-tools' ) ),
			'create-coupon' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'coupons', 'desc' => __( 'Create a coupon. arguments: { code, discount_type, amount, … }.', 'emcp-tools' ) ),
			'update-coupon' => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'coupons/{id}', 'desc' => __( 'Update a coupon. arguments: { id, … }.', 'emcp-tools' ) ),
			'delete-coupon' => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'coupons/{id}', 'confirm' => true, 'desc' => __( 'Delete a coupon. arguments: { id, confirm:true }.', 'emcp-tools' ) ),

			// REPORTS (read-only).
			'list-reports'            => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'reports', 'desc' => __( 'List available reports. No arguments.', 'emcp-tools' ) ),
			'report-sales'            => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'reports/sales', 'desc' => __( 'Sales report. arguments: { period } or { date_min, date_max }.', 'emcp-tools' ) ),
			'report-top-sellers'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'reports/top_sellers', 'desc' => __( 'Top sellers report. arguments: { period }.', 'emcp-tools' ) ),
			'report-orders-totals'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'reports/orders/totals', 'desc' => __( 'Order counts by status. No arguments.', 'emcp-tools' ) ),
			'report-products-totals'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'reports/products/totals', 'desc' => __( 'Product counts by type. No arguments.', 'emcp-tools' ) ),
			'report-customers-totals' => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'reports/customers/totals', 'desc' => __( 'Customer counts. No arguments.', 'emcp-tools' ) ),
			'report-coupons-totals'   => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'reports/coupons/totals', 'desc' => __( 'Coupon counts. No arguments.', 'emcp-tools' ) ),
			'report-reviews-totals'   => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'reports/reviews/totals', 'desc' => __( 'Review counts. No arguments.', 'emcp-tools' ) ),

			// SETTINGS.
			'list-setting-groups' => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'settings', 'desc' => __( 'List settings groups. No arguments.', 'emcp-tools' ) ),
			'get-settings'        => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'settings/{group}', 'desc' => __( 'Get a group\'s options. arguments: { group } (e.g. general, products, tax, shipping…).', 'emcp-tools' ) ),
			'get-setting'         => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'settings/{group}/{id}', 'desc' => __( 'Get one setting. arguments: { group, id }.', 'emcp-tools' ) ),
			'update-setting'      => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'settings/{group}/{id}', 'desc' => __( 'Update one setting. arguments: { group, id, value }.', 'emcp-tools' ) ),
			'batch-settings'      => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'settings/{group}/batch', 'desc' => __( 'Batch update a group\'s settings. arguments: { group, update:[{id,value}] }.', 'emcp-tools' ) ),

			// PAYMENT GATEWAYS.
			'list-gateways'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'payment_gateways', 'desc' => __( 'List payment gateways. No arguments.', 'emcp-tools' ) ),
			'get-gateway'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'payment_gateways/{id}', 'desc' => __( 'Get a gateway. arguments: { id }.', 'emcp-tools' ) ),
			'update-gateway' => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'payment_gateways/{id}', 'desc' => __( 'Update a gateway (enable/settings). arguments: { id, enabled?, settings? }.', 'emcp-tools' ) ),

			// PRODUCT CATEGORIES.
			'list-categories'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/categories', 'desc' => __( 'List product categories. arguments: filters.', 'emcp-tools' ) ),
			'get-category'     => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/categories/{id}', 'desc' => __( 'Get one product category. arguments: { id }.', 'emcp-tools' ) ),
			'create-category'  => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'products/categories', 'desc' => __( 'Create a product category. arguments: { name, parent?, … }.', 'emcp-tools' ) ),
			'update-category'  => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'products/categories/{id}', 'desc' => __( 'Update a product category. arguments: { id, … }.', 'emcp-tools' ) ),
			'delete-category'  => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'products/categories/{id}', 'confirm' => true, 'desc' => __( 'Delete a product category. arguments: { id, confirm:true }.', 'emcp-tools' ) ),

			// NATIVE PRODUCT BRANDS (#137).
			'list-brands' => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/brands', 'desc' => __( 'List native WooCommerce brands. arguments: { search?, slug?, page?, per_page?, hide_empty? }. Returns term_id, taxonomy, archive URL and logo attachment id.', 'emcp-tools' ) ),
			'get-brand' => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/brands/{id}', 'desc' => __( 'Read a native WooCommerce brand. arguments: { id }. Use the active SEO plugin get-term-seo with term_id to inspect SEO metadata.', 'emcp-tools' ) ),
			'create-brand' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'products/brands', 'desc' => __( 'Create a native brand. arguments: { name, slug?, description?, logo_attachment_id?, dry_run? }. Refuses duplicate names/slugs. Logo must be an existing image attachment: use sideload-image first. SEO fields belong in the active SEO plugin update-term-seo, not this operation.', 'emcp-tools' ) ),
			'update-brand' => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'products/brands/{id}', 'desc' => __( 'Update a native brand. arguments: { id, name?, slug?, description?, logo_attachment_id?, dry_run? }. Omitted values are preserved; logo_attachment_id=0 removes the logo. dry_run validates without writing. Read back with get-brand and get-term-seo after changes.', 'emcp-tools' ) ),

			// PRODUCT TAGS.
			'list-tags'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/tags', 'desc' => __( 'List product tags. arguments: filters.', 'emcp-tools' ) ),
			'get-tag'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/tags/{id}', 'desc' => __( 'Get one product tag. arguments: { id }.', 'emcp-tools' ) ),
			'create-tag' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'products/tags', 'desc' => __( 'Create a product tag. arguments: { name, … }.', 'emcp-tools' ) ),
			'update-tag' => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'products/tags/{id}', 'desc' => __( 'Update a product tag. arguments: { id, … }.', 'emcp-tools' ) ),
			'delete-tag' => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'products/tags/{id}', 'confirm' => true, 'desc' => __( 'Delete a product tag. arguments: { id, confirm:true }.', 'emcp-tools' ) ),

			// PRODUCT ATTRIBUTES.
			'list-attributes'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/attributes', 'desc' => __( 'List global product attributes. No arguments.', 'emcp-tools' ) ),
			'get-attribute'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/attributes/{id}', 'desc' => __( 'Get one attribute. arguments: { id }.', 'emcp-tools' ) ),
			'create-attribute' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'products/attributes', 'desc' => __( 'Create a global attribute. arguments: { name, type?, … }.', 'emcp-tools' ) ),
			'update-attribute' => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'products/attributes/{id}', 'desc' => __( 'Update an attribute. arguments: { id, … }.', 'emcp-tools' ) ),
			'delete-attribute' => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'products/attributes/{id}', 'confirm' => true, 'desc' => __( 'Delete an attribute. arguments: { id, confirm:true }.', 'emcp-tools' ) ),

			// ATTRIBUTE TERMS.
			'list-attribute-terms'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/attributes/{attribute_id}/terms', 'desc' => __( 'List an attribute\'s terms. arguments: { attribute_id }.', 'emcp-tools' ) ),
			'get-attribute-term'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/attributes/{attribute_id}/terms/{id}', 'desc' => __( 'Get one attribute term. arguments: { attribute_id, id }.', 'emcp-tools' ) ),
			'create-attribute-term' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'products/attributes/{attribute_id}/terms', 'desc' => __( 'Create an attribute term. arguments: { attribute_id, name, … }.', 'emcp-tools' ) ),
			'update-attribute-term' => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'products/attributes/{attribute_id}/terms/{id}', 'desc' => __( 'Update an attribute term. arguments: { attribute_id, id, … }.', 'emcp-tools' ) ),
			'delete-attribute-term' => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'products/attributes/{attribute_id}/terms/{id}', 'confirm' => true, 'desc' => __( 'Delete an attribute term. arguments: { attribute_id, id, confirm:true }.', 'emcp-tools' ) ),

			// PRODUCT REVIEWS.
			'list-reviews'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/reviews', 'desc' => __( 'List product reviews. arguments: filters (product, status…).', 'emcp-tools' ) ),
			'get-review'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/reviews/{id}', 'desc' => __( 'Get one review. arguments: { id }.', 'emcp-tools' ) ),
			'create-review' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'products/reviews', 'desc' => __( 'Create a review. arguments: { product_id, review, reviewer, reviewer_email, rating }.', 'emcp-tools' ) ),
			'update-review' => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'products/reviews/{id}', 'desc' => __( 'Update a review (incl. status). arguments: { id, … }.', 'emcp-tools' ) ),
			'delete-review' => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'products/reviews/{id}', 'confirm' => true, 'desc' => __( 'Delete a review. arguments: { id, confirm:true }.', 'emcp-tools' ) ),

			// PRODUCT SHIPPING CLASSES.
			'list-shipping-classes'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/shipping_classes', 'desc' => __( 'List product shipping classes. No arguments.', 'emcp-tools' ) ),
			'get-shipping-class'     => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'products/shipping_classes/{id}', 'desc' => __( 'Get one shipping class. arguments: { id }.', 'emcp-tools' ) ),
			'create-shipping-class'  => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'products/shipping_classes', 'desc' => __( 'Create a shipping class. arguments: { name, … }.', 'emcp-tools' ) ),
			'update-shipping-class'  => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'products/shipping_classes/{id}', 'desc' => __( 'Update a shipping class. arguments: { id, … }.', 'emcp-tools' ) ),
			'delete-shipping-class'  => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'products/shipping_classes/{id}', 'confirm' => true, 'desc' => __( 'Delete a shipping class. arguments: { id, confirm:true }.', 'emcp-tools' ) ),

			// SHIPPING ZONES.
			'list-shipping-zones' => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'shipping/zones', 'desc' => __( 'List shipping zones. No arguments.', 'emcp-tools' ) ),
			'get-shipping-zone'   => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'shipping/zones/{id}', 'desc' => __( 'Get one shipping zone. arguments: { id }.', 'emcp-tools' ) ),
			'create-shipping-zone' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'shipping/zones', 'desc' => __( 'Create a shipping zone. arguments: { name, order? }.', 'emcp-tools' ) ),
			'update-shipping-zone' => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'shipping/zones/{id}', 'desc' => __( 'Update a shipping zone. arguments: { id, … }.', 'emcp-tools' ) ),
			'delete-shipping-zone' => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'shipping/zones/{id}', 'confirm' => true, 'desc' => __( 'Delete a shipping zone. arguments: { id, confirm:true }.', 'emcp-tools' ) ),

			// SHIPPING ZONE LOCATIONS + METHODS.
			'get-zone-locations'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'shipping/zones/{zone_id}/locations', 'desc' => __( 'Get a zone\'s locations. arguments: { zone_id }.', 'emcp-tools' ) ),
			'update-zone-locations' => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'shipping/zones/{zone_id}/locations', 'desc' => __( 'Replace a zone\'s locations. arguments: { zone_id, locations:[{code,type}] }.', 'emcp-tools' ) ),
			'list-zone-methods'     => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'shipping/zones/{zone_id}/methods', 'desc' => __( 'List a zone\'s shipping methods. arguments: { zone_id }.', 'emcp-tools' ) ),
			'get-zone-method'       => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'shipping/zones/{zone_id}/methods/{instance_id}', 'desc' => __( 'Get one zone method. arguments: { zone_id, instance_id }.', 'emcp-tools' ) ),
			'create-zone-method'    => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'shipping/zones/{zone_id}/methods', 'desc' => __( 'Add a method to a zone. arguments: { zone_id, method_id (e.g. flat_rate), settings? }.', 'emcp-tools' ) ),
			'update-zone-method'    => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'shipping/zones/{zone_id}/methods/{instance_id}', 'desc' => __( 'Update a zone method. arguments: { zone_id, instance_id, settings?, enabled? }.', 'emcp-tools' ) ),
			'delete-zone-method'    => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'shipping/zones/{zone_id}/methods/{instance_id}', 'confirm' => true, 'desc' => __( 'Remove a method from a zone. arguments: { zone_id, instance_id, confirm:true }.', 'emcp-tools' ) ),
			'list-shipping-methods' => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'shipping_methods', 'desc' => __( 'List available shipping method types. No arguments.', 'emcp-tools' ) ),
			'get-shipping-method'   => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'shipping_methods/{id}', 'desc' => __( 'Get one shipping method type. arguments: { id }.', 'emcp-tools' ) ),

			// TAXES + TAX CLASSES.
			'list-taxes'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'taxes', 'desc' => __( 'List tax rates. arguments: filters.', 'emcp-tools' ) ),
			'get-tax'         => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'taxes/{id}', 'desc' => __( 'Get one tax rate. arguments: { id }.', 'emcp-tools' ) ),
			'create-tax'      => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'taxes', 'desc' => __( 'Create a tax rate. arguments: { country?, rate, name, … }.', 'emcp-tools' ) ),
			'update-tax'      => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'taxes/{id}', 'desc' => __( 'Update a tax rate. arguments: { id, … }.', 'emcp-tools' ) ),
			'delete-tax'      => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'taxes/{id}', 'confirm' => true, 'desc' => __( 'Delete a tax rate. arguments: { id, confirm:true }.', 'emcp-tools' ) ),
			'batch-taxes'     => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'taxes/batch', 'confirm' => true, 'desc' => __( 'Batch create/update/delete tax rates. arguments: { create, update, delete, confirm:true }.', 'emcp-tools' ) ),
			'list-tax-classes' => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'taxes/classes', 'desc' => __( 'List tax classes. No arguments.', 'emcp-tools' ) ),
			'create-tax-class' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'taxes/classes', 'desc' => __( 'Create a tax class. arguments: { name }.', 'emcp-tools' ) ),
			'delete-tax-class' => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'taxes/classes/{slug}', 'confirm' => true, 'desc' => __( 'Delete a tax class. arguments: { slug, confirm:true }.', 'emcp-tools' ) ),

			// WEBHOOKS.
			'list-webhooks'  => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'webhooks', 'desc' => __( 'List webhooks. arguments: filters.', 'emcp-tools' ) ),
			'get-webhook'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'webhooks/{id}', 'desc' => __( 'Get one webhook. arguments: { id }.', 'emcp-tools' ) ),
			'create-webhook' => array( 'mode' => 'write', 'method' => 'POST', 'route' => 'webhooks', 'desc' => __( 'Create a webhook. arguments: { name, topic, delivery_url, … }.', 'emcp-tools' ) ),
			'update-webhook' => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'webhooks/{id}', 'desc' => __( 'Update a webhook. arguments: { id, … }.', 'emcp-tools' ) ),
			'delete-webhook' => array( 'mode' => 'write', 'method' => 'DELETE', 'route' => 'webhooks/{id}', 'confirm' => true, 'desc' => __( 'Delete a webhook. arguments: { id, confirm:true }.', 'emcp-tools' ) ),

			// SYSTEM STATUS + DATA (read-only).
			'system-status'       => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'system_status', 'desc' => __( 'Full system status report (environment, database, active plugins, theme). No arguments.', 'emcp-tools' ) ),
			'list-system-tools'   => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'system_status/tools', 'desc' => __( 'List system status tools. No arguments.', 'emcp-tools' ) ),
			'run-system-tool'     => array( 'mode' => 'write', 'method' => 'PUT', 'route' => 'system_status/tools/{id}', 'confirm' => true, 'desc' => __( 'Run a system status tool (e.g. clear_transients). arguments: { id, confirm:true }.', 'emcp-tools' ) ),
			'list-data'           => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'data', 'desc' => __( 'List data endpoints (countries, currencies, continents). No arguments.', 'emcp-tools' ) ),
			'list-countries'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'data/countries', 'desc' => __( 'List countries + states. No arguments.', 'emcp-tools' ) ),
			'list-currencies'     => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'data/currencies', 'desc' => __( 'List currencies. No arguments.', 'emcp-tools' ) ),
			'get-current-currency' => array( 'mode' => 'read', 'method' => 'GET', 'route' => 'data/currencies/current', 'desc' => __( 'Get the store\'s current currency. No arguments.', 'emcp-tools' ) ),
		);
	}

	/**
	 * Discovery catalog for a mode: every matching operation with a description.
	 *
	 * @param string $mode 'read' or 'write'.
	 * @return array<string,mixed>
	 */
	private function operations_catalog( string $mode ): array {
		$operations = array();
		foreach ( $this->operations() as $name => $op ) {
			if ( $op['mode'] !== $mode ) {
				continue;
			}
			$operations[] = array(
				'name'        => $name,
				'method'      => $op['method'],
				'route'       => 'wc/v3/' . $op['route'],
				'confirm'     => ! empty( $op['confirm'] ),
				'description' => $op['desc'],
			);
		}
		return array(
			'mode'       => $mode,
			'operations' => $operations,
			'note'       => 'write' === $mode
				? __( 'Call woo-write with { operation, arguments }. Write access requires the woo-write tool enabled (Neo EMCP → Tools → Plugins → WooCommerce). Operations marked confirm require confirm:true.', 'emcp-tools' )
				: __( 'Call woo-read with { operation, arguments }. Omit operation to see this list.', 'emcp-tools' ),
		);
	}
}
