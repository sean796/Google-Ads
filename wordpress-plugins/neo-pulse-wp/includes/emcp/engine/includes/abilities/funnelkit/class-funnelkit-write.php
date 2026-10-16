<?php
/**
 * funnelkit-write: create and change FunnelKit Funnel Builder funnels, steps,
 * checkout, order bumps, upsells, opt-in, thank-you and store checkout.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_FunnelKit_Write extends EMCP_Tools_FunnelKit_Dispatcher {

	/** @var string[] */
	private $ability_names = array();

	protected function tool_mode(): string {
		return 'write';
	}

	protected function operations(): array {
		return require __DIR__ . '/ops/funnel-builder-write.php';
	}

	/** @return string[] */
	public function get_ability_names(): array {
		return $this->ability_names;
	}

	public function check_permission(): bool {
		return current_user_can( 'manage_woocommerce' );
	}

	public function register(): void {
		if ( ! ( function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code() ) ) {
			return;
		}
		$this->ability_names[] = 'emcp-tools/funnelkit-write';
		emcp_tools_register_ability(
			'emcp-tools/funnelkit-write',
			array(
				'label'               => __( 'FunnelKit Write', 'emcp-tools' ),
				'description'         => __( 'Create and change FunnelKit funnels, steps, checkout products and fields, order bumps, upsells, opt-in, thank-you pages and the store checkout. Disabled by default; enable under Neo EMCP > Tools > Plugins > FunnelKit. Deletes need confirm:true; creates and updates accept dry_run:true. Every write is recorded in History. Call with no operation to list operations.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'run_funnelkit_write' ),
				'permission_callback' => array( $this, 'check_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'operation' => array( 'type' => 'string', 'description' => __( 'The write operation. Omit to list operations.', 'emcp-tools' ) ),
						'arguments' => array( 'type' => 'object', 'description' => __( 'Arguments for the operation, plus confirm and dry_run where listed.', 'emcp-tools' ) ),
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
	public function run_funnelkit_write( $input ) {
		return $this->run( $input );
	}

	/**
	 * Template import. FunnelKit finishes it in the background, so History is recorded when
	 * import-status reports completion: during this call, on a later import-status call
	 * that passes the job, or by the History cron (Task 5).
	 */
	protected function op_import_template( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		if ( $dry_run ) {
			return $this->dry_run_answer( $name, $op, $route, $params, array() );
		}
		// The importer's REST argument is a JSON string mapping step type to template slug.
		$params['steps'] = (string) wp_json_encode( (object) $args['steps'] );
		$history         = $this->history();
		$ticket          = $history->before( $name, (array) $op['history'], $args );
		$rest            = $this->rest();
		$started         = $rest->request( 'POST', $route, $params );
		if ( is_wp_error( $started ) ) {
			return $started;
		}
		$token     = $history->start_job( $ticket, $name, (array) $op['history'], $args, $started, 'import-status', $rest->last_message() );
		$funnel_id = (int) ( is_array( $started ) ? ( $started['funnel_id'] ?? $started['id'] ?? 0 ) : 0 );
		// finalize_job() asks the status filter about the funnel stored in the job, never about a caller's value.
		$change = $this->poll(
			'import-status',
			array( 'funnel_id' => $funnel_id, 'job' => $token ),
			static function () use ( $history, $token ) {
				$answer = $history->finalize_job( $token );
				return null === $answer ? false : $answer;
			}
		);
		if ( ! empty( $change['pending'] ) ) {
			return array( 'operation' => $name, 'result' => $started, 'pending' => $change );
		}
		return array( 'operation' => $name, 'result' => array( 'funnel_id' => $funnel_id ), 'change' => $change );
	}

	/** The read tool, for answers that show the state after a write (tests replace it). */
	protected function reader(): EMCP_Tools_FunnelKit_Integration {
		return new EMCP_Tools_FunnelKit_Integration();
	}

	/**
	 * Checkout products. FunnelKit adds products by ID with its default configuration
	 * (wfacp_add_product), and keeps quantity and discount in the product layout
	 * (wfacp_save_products, which replaces the whole list). So: check every product, add
	 * them, then, when a quantity or discount was asked for, read the list, set those
	 * fields on the newly added entries and save the layout with the current settings.
	 * Both calls are one History entry; the answer carries the saved prices.
	 */
	protected function op_set_checkout_products( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		$preflight = array();
		$wanted    = array();
		foreach ( (array) $args['products'] as $p ) {
			$id      = (int) ( is_array( $p ) ? ( $p['id'] ?? 0 ) : $p );
			$product = $id > 0 && function_exists( 'wc_get_product' ) ? wc_get_product( $id ) : false;
			if ( ! $product ) {
				/* translators: %d: product id. */
				return new WP_Error( 'product_not_found', sprintf( __( 'WooCommerce product %d does not exist.', 'emcp-tools' ), $id ) );
			}
			$item = is_array( $p ) ? $p : array( 'id' => $id );
			// FunnelKit's discount types (WFFN_Common / the checkout product editor).
			if ( isset( $item['discount_type'] ) && ! in_array( $item['discount_type'], array( '', 'percent_discount_reg', 'percent_discount_sale', 'fixed_discount_reg', 'fixed_discount_sale', 'flat_price' ), true ) ) {
				/* translators: %s: discount type. */
				return new WP_Error( 'invalid_argument', sprintf( __( 'Unknown discount_type "%s". Use percent_discount_reg, percent_discount_sale, fixed_discount_reg, fixed_discount_sale or flat_price.', 'emcp-tools' ), (string) $item['discount_type'] ) );
			}
			$regular     = is_numeric( $product->get_regular_price() ) ? (float) $product->get_regular_price() : null;
			$current     = is_numeric( $product->get_price() ) ? (float) $product->get_price() : null;
			$preflight[] = array(
				'id'              => $id,
				'name'            => $product->get_name(),
				'quantity'        => (int) ( $item['quantity'] ?? 1 ),
				'effective_price' => EMCP_Tools_FunnelKit_Integration::calculate_checkout_price( $regular, $current, (string) ( $item['discount_type'] ?? '' ), (float) ( $item['discount_amount'] ?? 0 ) ),
			);
			$wanted[ $id ] = array_intersect_key( $item, array_flip( array( 'quantity', 'discount_type', 'discount_amount' ) ) );
		}
		$add = array( 'products' => array_keys( $wanted ) );
		if ( $dry_run ) {
			return $this->dry_run_answer( $name, $op, $route, $add, array( 'preflight' => array( 'products' => $preflight ) ) );
		}

		$history = $this->history();
		$ticket  = $history ? $history->before( $name, (array) $op['history'], $args ) : null;
		$rest    = $this->rest();
		$added   = $rest->request( 'POST', $route, $add );
		if ( is_wp_error( $added ) ) {
			return $added;
		}
		$new_keys = array();
		foreach ( (array) ( $added['data']['products'] ?? array() ) as $entry ) {
			$new_keys[ (string) ( $entry['id'] ?? '' ) ] = (int) ( $entry['key'] ?? 0 );
		}

		$layout_saved = false;
		if ( array_filter( $wanted ) ) {
			$list = $rest->request( 'GET', $route );
			if ( is_wp_error( $list ) ) {
				return $list;
			}
			$products = array();
			foreach ( (array) ( $list['data']['products'] ?? array() ) as $entry ) {
				$key = (string) ( $entry['id'] ?? '' );
				if ( isset( $new_keys[ $key ] ) && ! empty( $wanted[ $new_keys[ $key ] ] ) ) {
					$entry = array_merge( $entry, $wanted[ $new_keys[ $key ] ] );
				}
				$products[] = $entry;
			}
			$saved = $rest->request( 'POST', $route . '/save-layout', array( 'products' => $products, 'settings' => (array) ( $list['data']['InitialValue'] ?? array() ) ) );
			if ( is_wp_error( $saved ) ) {
				return $saved;
			}
			$layout_saved = true;
		}

		$out = array( 'operation' => $name, 'result' => array( 'added' => array_values( $new_keys ), 'layout_saved' => $layout_saved ) );
		if ( $history && null !== $ticket ) {
			$out['change'] = $history->after( $ticket, $name, (array) $op['history'], $args, $added, $rest->last_message() );
		}
		$out['state'] = $this->reader()->run( array( 'operation' => 'get-checkout-products', 'arguments' => array( 'step_id' => $args['step_id'] ) ) );
		return $out;
	}

	/**
	 * publish-all-steps: WFFN_REST_Funnels::publish_all_steps json_decodes `steps` and publishes
	 * every post ID in it, so the list is built from the funnel's own step list, never passed through.
	 */
	protected function op_publish_all_steps( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		$rows  = EMCP_Tools_FunnelKit_Rows::get()->select( 'bwf_funnels', 'id', array( (int) $args['funnel_id'] ) );
		$list  = $rows ? json_decode( (string) ( $rows[0]['steps'] ?? '' ), true ) : null;
		$steps = array();
		foreach ( is_array( $list ) ? $list : array() as $step ) {
			if ( is_array( $step ) && (int) ( $step['id'] ?? 0 ) > 0 ) {
				$steps[] = array( 'id' => (int) $step['id'], 'type' => (string) ( $step['type'] ?? '' ) );
			}
		}
		if ( ! $steps ) {
			return new WP_Error( 'funnel_not_found', __( 'This funnel has no steps to publish.', 'emcp-tools' ) );
		}
		$params['steps'] = (string) wp_json_encode( $steps );
		if ( $dry_run ) {
			return $this->dry_run_answer( $name, $op, $route, $params, array() );
		}
		return $this->execute( $name, $op, $route, $params, $args );
	}

	/** Step types WFFN_REST_Funnels::get_scratch_templates() adds when a funnel is created. */
	const SCRATCH_STEPS = array( 'landing', 'wc_checkout', 'upsell', 'wc_thankyou', 'optin', 'optin_ty' );

	/**
	 * create-funnel: WFFN_REST_Funnels::create_funnel explode()s `funnel_steps`, a comma-separated
	 * string of step types, and adds each as a blank step with its default title.
	 */
	protected function op_create_funnel( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		if ( array_key_exists( 'funnel_steps', $args ) ) {
			$steps = array_values( (array) $args['funnel_steps'] );
			foreach ( $steps as $step ) {
				if ( ! is_string( $step ) || ! in_array( $step, self::SCRATCH_STEPS, true ) ) {
					/* translators: %s: allowed step types. */
					return new WP_Error( 'invalid_argument', sprintf( __( 'funnel_steps is a list of step types, each one of: %s. FunnelKit gives them default titles; rename them afterwards.', 'emcp-tools' ), implode( ', ', self::SCRATCH_STEPS ) ) );
				}
			}
			if ( ! $steps ) {
				return new WP_Error( 'invalid_argument', __( 'funnel_steps is empty; leave it out to create a funnel without steps.', 'emcp-tools' ) );
			}
			$params['funnel_steps'] = implode( ',', array_unique( $steps ) );
		}
		if ( $dry_run ) {
			return $this->dry_run_answer( $name, $op, $route, $params, array() );
		}
		$out = $this->execute( $name, $op, $route, $params, $args );
		if ( is_array( $out ) && in_array( 'wc_checkout', (array) ( $args['funnel_steps'] ?? array() ), true ) ) {
			$out['note'] = self::blank_checkout_note();
		}
		return $out;
	}

	/** update-step-design: save_design() json_decodes `design` and needs its builder and template. */
	protected function op_update_step_design( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		$design = (array) $args['design'];
		foreach ( array( 'builder', 'template' ) as $key ) {
			if ( ! isset( $design[ $key ] ) || ! is_string( $design[ $key ] ) || '' === $design[ $key ] ) {
				return new WP_Error( 'invalid_argument', __( 'design needs builder and template, for example { "builder": "elementor", "template": "minimalist" }.', 'emcp-tools' ) );
			}
		}
		if ( 'checkout' === $args['type'] ) {
			$design['builder'] = self::checkout_builder( $design['builder'], $design['template'] );
		}
		$params['design'] = (string) wp_json_encode( $design );
		if ( $dry_run ) {
			return $this->dry_run_answer( $name, $op, $route, $params, array() );
		}
		return $this->execute( $name, $op, $route, $params, $args );
	}

	/**
	 * FunnelKit's template list files the checkout's embed form templates (embed_forms_*,
	 * custom_funnel_form_*) under wp_editor, but its checkout importer registers them as
	 * embed_forms (WFACP_Customizer_Embed_Form_Importer), so wp_editor fails the import.
	 */
	public static function checkout_builder( string $builder, string $template ): string {
		return 'wp_editor' === $builder && preg_match( '/^(embed_forms|custom_funnel_form)_/', $template ) ? 'embed_forms' : $builder;
	}

	/** Shown when a checkout step is created without a design. */
	private static function blank_checkout_note(): string {
		return __( 'This checkout step has no design yet. FunnelKit renders an undesigned checkout with its embed form template, which stops the page with a PHP error on FunnelKit free under PHP 8. Apply a design before publishing, for example update-step-design with { "builder": "embed_forms", "template": "embed_forms_1" }.', 'emcp-tools' );
	}

	/** Step post IDs listed on a funnel's row. @return int[] */
	private static function funnel_step_ids( int $funnel_id ): array {
		$rows = EMCP_Tools_FunnelKit_Rows::get()->select( 'bwf_funnels', 'id', array( $funnel_id ) );
		$list = $rows ? json_decode( (string) ( $rows[0]['steps'] ?? '' ), true ) : null;
		$ids  = array();
		foreach ( is_array( $list ) ? $list : array() as $step ) {
			if ( is_array( $step ) && (int) ( $step['id'] ?? 0 ) > 0 ) {
				$ids[] = (int) $step['id'];
			}
		}
		return $ids;
	}

	/**
	 * create-step. With a template, WFFN_REST_Steps::create_step() adds the step first and imports
	 * the template after, so a failed import still leaves the new step: that answers partial_write,
	 * naming the steps that appeared on the funnel, instead of a plain refusal.
	 */
	protected function op_create_step( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		if ( 'wc_checkout' === $args['type'] && isset( $args['builder'], $args['template'] ) ) {
			$params['builder'] = self::checkout_builder( (string) $args['builder'], (string) $args['template'] );
		}
		if ( $dry_run ) {
			return $this->dry_run_answer( $name, $op, $route, $params, array() );
		}
		$funnel_id = (int) $args['funnel_id'];
		$before    = self::funnel_step_ids( $funnel_id );
		try {
			$out = $this->execute( $name, $op, $route, $params, $args );
		} catch ( Throwable $error ) {
			// A third-party hook can throw after a step is stored. Reconcile below without replaying the write.
			$out = new WP_Error( 'funnelkit_request_failed', __( 'FunnelKit did not complete the request. Inspect the funnel before retrying.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		if ( is_wp_error( $out ) ) {
			$left = array_values( array_diff( self::funnel_step_ids( $funnel_id ), $before ) );
			if ( ! $left ) {
				return $out;
			}
			// Not attributed to this call positively (another request may add a step meanwhile), so nothing is deleted.
			$history = $this->history();
			$change  = $history ? $history->after( array( 'irreversible' => __( 'New steps appeared during a failed request. Their ownership could not be confirmed; inspect the funnel before recovery.', 'emcp-tools' ), 'scope' => 'funnel', 'parts' => array( array( 'funnel', $funnel_id ) ) ), $name, (array) $op['history'], $args, null ) : null;
			return new WP_Error(
				'partial_write',
				/* translators: 1: FunnelKit's message, 2: step IDs. */
				sprintf( __( 'FunnelKit did not complete the request (%1$s). New step IDs %2$s appeared on this funnel, but EMCP cannot confirm this request created them. Inspect them before recovery or retry; nothing was deleted automatically.', 'emcp-tools' ), $out->get_error_message(), implode( ', ', $left ) ),
				array( 'status' => 409, 'step_ids' => $left, 'attribution' => 'unverified', 'change' => $change )
			);
		}
		if ( 'wc_checkout' === $args['type'] && empty( $args['template'] ) && empty( $args['duplicate_id'] ) && empty( $args['inherit_from'] ) ) {
			$out['note'] = self::blank_checkout_note();
		}
		return $out;
	}

	/** delete-funnel: WFFN_REST_Funnels::delete_funnel reads `id` as a comma-separated string. */
	protected function op_delete_funnel( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		$params['id'] = (string) $args['id'];
		if ( $dry_run ) {
			return $this->dry_run_answer( $name, $op, $route, $params, array() );
		}
		return $this->execute( $name, $op, $route, $params, $args );
	}

	/** @var EMCP_Tools_FunnelKit_Rest|null Rest client for job status checks (tests replace it). */
	private static $job_rest = null;

	public static function use_job_rest( ?EMCP_Tools_FunnelKit_Rest $rest ): void {
		self::$job_rest = $rest;
	}

	/** FunnelKit's import-status answer, with __done set once it reports completion (see the read tool). */
	public static function import_status( EMCP_Tools_FunnelKit_Rest $rest, int $funnel_id ): array {
		return EMCP_Tools_FunnelKit_Integration::import_status( $rest, $funnel_id );
	}

	/** Cron answer for pending import jobs (filter emcp_tools_funnelkit_job_status, wired in Task 14). */
	public static function job_status( $status, array $job ) {
		if ( null !== $status || 'import-status' !== ( $job['status'] ?? '' ) ) {
			return $status;
		}
		$result    = (array) ( $job['result'] ?? array() );
		$funnel_id = (int) ( $result['funnel_id'] ?? $result['id'] ?? 0 );
		return $funnel_id > 0 ? self::import_status( self::$job_rest ?? new EMCP_Tools_FunnelKit_Rest(), $funnel_id ) : $status;
	}
}
