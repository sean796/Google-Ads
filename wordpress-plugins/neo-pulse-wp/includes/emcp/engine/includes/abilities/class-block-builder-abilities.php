<?php
/**
 * Block Builder MCP abilities — let AI agents generate custom Gutenberg blocks.
 *
 * Eight Pro-gated tools. The agent submits a structured spec; the plugin-owned
 * generator (never the agent) compiles it into four block assets
 * (block.json/render.php/edit.js/style.css) stored in an isolated uploads
 * sandbox and loaded into WordPress. See:
 *   - EMCP_Tools_Block_Generator (spec -> block assets)
 *   - EMCP_Tools_Block_Store     (CPT + sandbox + manifest)
 *   - EMCP_Tools_Block_Loader    (manifest-driven safe load)
 *
 * All tools self-guard on Pro access (get_ability_names()/register() are no-ops
 * without a license) so they never enter the MCP surface on free sites. This is
 * the block-authoring counterpart to EMCP_Tools_Widget_Builder_Abilities and is
 * structurally identical — see that class for the pattern this mirrors.
 *
 * @package EMCP_Tools
 * @since   3.7.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers and implements the block-builder abilities.
 *
 * @since 3.7.0
 */
class EMCP_Tools_Block_Builder_Abilities {

	/**
	 * Registered ability names.
	 *
	 * @var string[]
	 */
	private $ability_names = array();

	/**
	 * Whether these tools should register/run (Pro gate).
	 *
	 * @since 3.7.0
	 *
	 * @return bool
	 */
	private function has_access(): bool {
		return function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code();
	}

	/**
	 * Ability names (empty on free sites).
	 *
	 * @since 3.7.0
	 *
	 * @return string[]
	 */
	public function get_ability_names(): array {
		if ( ! $this->has_access() ) {
			return array();
		}
		return array(
			'emcp-tools/list-block-control-types',
			'emcp-tools/validate-block-spec',
			'emcp-tools/create-custom-block',
			'emcp-tools/update-custom-block',
			'emcp-tools/get-custom-block',
			'emcp-tools/list-custom-blocks',
			'emcp-tools/set-block-status',
			'emcp-tools/delete-custom-block',
		);
	}

	/**
	 * Registers all abilities (Pro only).
	 *
	 * @since 3.7.0
	 */
	public function register(): void {
		if ( ! $this->has_access() ) {
			return;
		}
		$this->register_list_block_control_types();
		$this->register_validate_block_spec();
		$this->register_create_custom_block();
		$this->register_update_custom_block();
		$this->register_get_custom_block();
		$this->register_list_custom_blocks();
		$this->register_set_block_status();
		$this->register_delete_custom_block();
	}

	// -------------------------------------------------------------------------
	// Permissions
	// -------------------------------------------------------------------------

	/**
	 * Read permission (discovery/validation).
	 *
	 * @return bool
	 */
	public function check_read_permission(): bool {
		return $this->has_access() && current_user_can( 'edit_posts' );
	}

	/**
	 * Manage permission (list/get/delete).
	 *
	 * @return bool
	 */
	public function check_manage_permission(): bool {
		return $this->has_access() && current_user_can( 'manage_options' );
	}

	/**
	 * Write permission (create/update/activate). Mirrors the code-snippet bar:
	 * manage_options + unfiltered_html.
	 *
	 * @return bool
	 */
	public function check_write_permission(): bool {
		return $this->has_access() && current_user_can( 'manage_options' ) && current_user_can( 'unfiltered_html' );
	}

	// -------------------------------------------------------------------------
	// Shared schema fragments
	// -------------------------------------------------------------------------

	/**
	 * JSON-schema fragment describing a block spec.
	 *
	 * @return array
	 */
	private function spec_schema(): array {
		return array(
			'type'        => 'object',
			'description' => __( 'Block definition. Call list-block-control-types first for the supported attribute types and template syntax.', 'emcp-tools' ),
			'properties'  => array(
				'meta'          => array(
					'type'       => 'object',
					'properties' => array(
						'title'       => array(
							'type'        => 'string',
							'description' => __( 'Block display title (required).', 'emcp-tools' ),
						),
						'category'    => array(
							'type'        => 'string',
							'description' => __( 'Ignored: every generated block registers into a single "emcp-custom" inserter category, not spec-configurable.', 'emcp-tools' ),
						),
						'icon'        => array(
							'type'        => 'string',
							'description' => __( 'Dashicon slug shown in the block inserter, e.g. block-default.', 'emcp-tools' ),
						),
						'description' => array(
							'type'        => 'string',
							'description' => __( 'Shown in the block inserter tooltip.', 'emcp-tools' ),
						),
						'keywords'    => array(
							'type'        => 'array',
							'items'       => array( 'type' => 'string' ),
							'description' => __( 'Search keywords for the block inserter.', 'emcp-tools' ),
						),
					),
					'required'   => array( 'title' ),
				),
				'attributes'    => array(
					'type'        => 'array',
					'description' => __( 'Block attributes. Each: { name, type, default?, label?, help?, group?, options? (select), min?/max?/step? (number), media_types? (media) }. See list-block-control-types.', 'emcp-tools' ),
					'items'       => array(
						'type'       => 'object',
						'properties' => array(
							'name'    => array( 'type' => 'string' ),
							'type'    => array( 'type' => 'string' ),
							// Any type: a string/number/boolean, or an array/object for
							// structured defaults. Must be a schema OBJECT — an empty PHP
							// array() would encode as JSON `[]`, which is not a valid
							// JSON-Schema for a property (strict 2020-12 clients reject it).
							'default' => array(
								'description' => __( 'Default value; its type should match the attribute type.', 'emcp-tools' ),
							),
							'control' => array( 'type' => 'string' ),
							'label'   => array( 'type' => 'string' ),
							'options' => array( 'type' => 'array' ),
							'help'    => array( 'type' => 'string' ),
						),
						'required'   => array( 'name', 'type' ),
					),
				),
				'html_template' => array(
					'type'        => 'string',
					'description' => __( 'HTML using {{attribute_name}} placeholders, {{#if name}}…{{/if}} conditionals, and {{#each repeater}}…{{/each}} loops. Values are escaped automatically by attribute type.', 'emcp-tools' ),
				),
				'supports'      => array(
					'type'        => 'object',
					'description' => __( 'Optional native style panels for the block: align, color, spacing, typography, border, shadow, dimensions, background. Each is true or an object of sub-features (e.g. {"color":{"text":true,"background":true}}). They apply to the root element of the template on the front end.', 'emcp-tools' ),
				),
				'styles'        => array(
					'type'        => 'string',
					'description' => __( 'Optional base CSS for the block, served as its own style.css and enqueued only when the block is on the page.', 'emcp-tools' ),
				),
				'scripts'       => array(
					'type'        => 'string',
					'description' => __( 'Reserved. The block editor script (edit.js) is always generated by the plugin from the attribute list, never from spec input.', 'emcp-tools' ),
				),
				'example'       => array(
					'type'        => 'object',
					'description' => __( 'Optional example attributes shown in the block inserter preview.', 'emcp-tools' ),
				),
			),
			'required'    => array( 'meta', 'attributes', 'html_template' ),
		);
	}

	/**
	 * Output-schema fragment for a block summary.
	 *
	 * @return array
	 */
	private function summary_schema(): array {
		return array(
			'type'       => 'object',
			'properties' => array(
				'block_id'   => array( 'type' => 'integer' ),
				'title'      => array( 'type' => 'string' ),
				'block_name' => array( 'type' => 'string' ),
				'status'     => array( 'type' => 'string' ),
				'last_error' => array( 'type' => 'string' ),
				'updated'    => array( 'type' => 'string' ),
			),
		);
	}

	// -------------------------------------------------------------------------
	// list-block-control-types
	// -------------------------------------------------------------------------

	/**
	 * Registers list-block-control-types.
	 *
	 * @since 3.7.0
	 */
	private function register_list_block_control_types(): void {
		$this->ability_names[] = 'emcp-tools/list-block-control-types';
		emcp_tools_register_ability(
			'emcp-tools/list-block-control-types',
			array(
				'label'               => __( 'List Block Control Types', 'emcp-tools' ),
				'description'         => __( 'Returns the attribute types and template syntax supported by the block builder, so you can construct a valid block spec.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_list_block_control_types' ),
				'permission_callback' => array( $this, 'check_read_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(),
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'control_types'     => array( 'type' => 'array' ),
						'template_syntax'   => array( 'type' => 'string' ),
						'attribute_options' => array( 'type' => 'string' ),
						'supports'          => array( 'type' => 'array' ),
					),
				),
				'meta'                => array(
					'annotations'  => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * Executes list-block-control-types.
	 *
	 * @param array $input Tool input.
	 * @return array|WP_Error
	 */
	public function execute_list_block_control_types( $input ) {
		if ( ! $this->has_access() ) {
			return $this->no_license();
		}
		$out = array();
		foreach ( EMCP_Tools_Block_Generator::attribute_types() as $type => $meta ) {
			$out[] = array(
				'type'        => $type,
				'json_type'   => $meta['json_type'],
				'control'     => $meta['control'],
				'description' => $meta['desc'],
			);
		}
		return array(
			'control_types'     => $out,
			'template_syntax'   => __( 'Use {{attribute_name}} to output an attribute value (auto-escaped by type), {{#if name}}…{{/if}} for conditionals (boolean attributes are truthy/falsy), and {{#each repeater_name}}…{{/each}} to loop a repeater (reference its fields by name inside). A media attribute also exposes {{name_alt}} and {{name_id}}. Give the template ONE root element: the editor\'s block supports (colors, spacing, typography, border, shadow, the Additional CSS class, alignment) are merged into it on the front end.', 'emcp-tools' ),
			'attribute_options' => __( 'Every attribute: name, type, default, label. Optional: help (hint shown under the control), group (sidebar panel title; attributes sharing a group share a panel, the first panel opens by default). number: min, max, step. select: options [{value,label}]. media: media_types (["image"] default; also "video", "audio", "application").', 'emcp-tools' ),
			'supports'          => array_keys( EMCP_Tools_Block_Generator::supported_supports() ),
		);
	}

	// -------------------------------------------------------------------------
	// validate-block-spec
	// -------------------------------------------------------------------------

	/**
	 * Registers validate-block-spec.
	 *
	 * @since 3.7.0
	 */
	private function register_validate_block_spec(): void {
		$this->ability_names[] = 'emcp-tools/validate-block-spec';
		emcp_tools_register_ability(
			'emcp-tools/validate-block-spec',
			array(
				'label'               => __( 'Validate Block Spec', 'emcp-tools' ),
				'description'         => __( 'Validates a block spec and dry-runs the code generator without saving anything. Returns whether it is valid and any error.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_validate_block_spec' ),
				'permission_callback' => array( $this, 'check_read_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array( 'spec' => $this->spec_schema() ),
					'required'   => array( 'spec' ),
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'valid' => array( 'type' => 'boolean' ),
						'error' => array( 'type' => 'string' ),
					),
				),
				'meta'                => array(
					'annotations'  => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * Executes validate-block-spec.
	 *
	 * @param array $input Tool input.
	 * @return array|WP_Error
	 */
	public function execute_validate_block_spec( $input ) {
		if ( ! $this->has_access() ) {
			return $this->no_license();
		}
		$spec = isset( $input['spec'] ) && is_array( $input['spec'] ) ? $input['spec'] : array();

		$valid = EMCP_Tools_Block_Generator::validate_spec( $spec );
		if ( ! is_wp_error( $valid ) ) {
			$valid = EMCP_Tools_Block_Generator::reserved_name_error( $spec ) ?? true;
		}
		if ( is_wp_error( $valid ) ) {
			return array( 'valid' => false, 'error' => $valid->get_error_message() );
		}
		// Dry-run the generator (token lint) without persisting; id 0, no overrides.
		$assets = EMCP_Tools_Block_Generator::generate( $spec, 0, array() );
		if ( is_wp_error( $assets ) ) {
			return array( 'valid' => false, 'error' => $assets->get_error_message() );
		}
		return array( 'valid' => true, 'error' => '' );
	}

	// -------------------------------------------------------------------------
	// create-custom-block
	// -------------------------------------------------------------------------

	/**
	 * Registers create-custom-block.
	 *
	 * @since 3.7.0
	 */
	private function register_create_custom_block(): void {
		$this->ability_names[] = 'emcp-tools/create-custom-block';
		emcp_tools_register_ability(
			'emcp-tools/create-custom-block',
			array(
				'label'               => __( 'Create Custom Block', 'emcp-tools' ),
				'description'         => __( 'Generates a custom Gutenberg block from a spec and stores it in an isolated sandbox as an INACTIVE DRAFT. It is not available on the site until a site administrator reviews and activates it in Neo EMCP, Sandbox, Blocks. Tell the user where to activate it.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_create_custom_block' ),
				'permission_callback' => array( $this, 'check_write_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'spec' => $this->spec_schema(),
					),
					'required'   => array( 'spec' ),
				),
				'output_schema'       => $this->summary_schema(),
				'meta'                => array(
					'annotations'  => array( 'readonly' => false, 'destructive' => false, 'idempotent' => false ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * Executes create-custom-block.
	 *
	 * @param array $input Tool input.
	 * @return array|WP_Error
	 */
	public function execute_create_custom_block( $input ) {
		if ( ! $this->has_access() ) {
			return $this->no_license();
		}
		$spec = isset( $input['spec'] ) && is_array( $input['spec'] ) ? $input['spec'] : array();
		$reserved = EMCP_Tools_Block_Generator::reserved_name_error( $spec );
		if ( $reserved ) {
			return $reserved;
		}
		// Always a draft over MCP: only an administrator activates (2026-09-27).
		$result = EMCP_Tools_Block_Store::instance()->create( $spec, false );
		if ( is_array( $result ) ) {
			$result['note'] = __( 'Saved as an INACTIVE draft. A site administrator must activate it in Neo EMCP, Sandbox, Blocks before it can be placed.', 'emcp-tools' );
		}
		return $result;
	}

	// -------------------------------------------------------------------------
	// update-custom-block
	// -------------------------------------------------------------------------

	/**
	 * Registers update-custom-block.
	 *
	 * @since 3.7.0
	 */
	private function register_update_custom_block(): void {
		$this->ability_names[] = 'emcp-tools/update-custom-block';
		emcp_tools_register_ability(
			'emcp-tools/update-custom-block',
			array(
				'label'               => __( 'Update Custom Block', 'emcp-tools' ),
				'description'         => __( 'Replaces a custom block\'s spec and regenerates its assets in place.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_update_custom_block' ),
				'permission_callback' => array( $this, 'check_write_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'block_id' => array(
							'type'        => 'integer',
							'description' => __( 'The block post ID returned by create/list.', 'emcp-tools' ),
						),
						'spec'     => $this->spec_schema(),
					),
					'required'   => array( 'block_id', 'spec' ),
				),
				'output_schema'       => $this->summary_schema(),
				'meta'                => array(
					'annotations'  => array( 'readonly' => false, 'destructive' => false, 'idempotent' => false ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * Executes update-custom-block.
	 *
	 * @param array $input Tool input.
	 * @return array|WP_Error
	 */
	public function execute_update_custom_block( $input ) {
		if ( ! $this->has_access() ) {
			return $this->no_license();
		}
		$block_id = absint( $input['block_id'] ?? 0 );
		$spec     = isset( $input['spec'] ) && is_array( $input['spec'] ) ? $input['spec'] : array();
		if ( ! $block_id ) {
			return new WP_Error( 'missing_params', __( 'block_id is required.', 'emcp-tools' ) );
		}
		$reserved = EMCP_Tools_Block_Generator::reserved_name_error( $spec );
		if ( $reserved ) {
			return $reserved;
		}
		return EMCP_Tools_Block_Store::instance()->update( $block_id, $spec );
	}

	// -------------------------------------------------------------------------
	// get-custom-block
	// -------------------------------------------------------------------------

	/**
	 * Registers get-custom-block.
	 *
	 * @since 3.7.0
	 */
	private function register_get_custom_block(): void {
		$this->ability_names[] = 'emcp-tools/get-custom-block';
		emcp_tools_register_ability(
			'emcp-tools/get-custom-block',
			array(
				'label'               => __( 'Get Custom Block', 'emcp-tools' ),
				'description'         => __( 'Returns a custom block\'s spec, generated render.php, status, and any last error.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_get_custom_block' ),
				'permission_callback' => array( $this, 'check_manage_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'block_id' => array( 'type' => 'integer' ),
					),
					'required'   => array( 'block_id' ),
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'block'         => $this->summary_schema(),
						'spec'          => array( 'type' => 'object' ),
						'generated_php' => array( 'type' => 'string' ),
					),
				),
				'meta'                => array(
					'annotations'  => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * Executes get-custom-block.
	 *
	 * @param array $input Tool input.
	 * @return array|WP_Error
	 */
	public function execute_get_custom_block( $input ) {
		if ( ! $this->has_access() ) {
			return $this->no_license();
		}
		$block_id = absint( $input['block_id'] ?? 0 );
		$store    = EMCP_Tools_Block_Store::instance();
		$summary  = $store->summary( $block_id );
		if ( is_wp_error( $summary ) ) {
			return $summary;
		}
		return array(
			'block'         => $summary,
			'spec'          => $store->get_spec( $block_id ) ?? array(),
			'generated_php' => $store->get_asset( $block_id, 'render.php' ),
		);
	}

	// -------------------------------------------------------------------------
	// list-custom-blocks
	// -------------------------------------------------------------------------

	/**
	 * Registers list-custom-blocks.
	 *
	 * @since 3.7.0
	 */
	private function register_list_custom_blocks(): void {
		$this->ability_names[] = 'emcp-tools/list-custom-blocks';
		emcp_tools_register_ability(
			'emcp-tools/list-custom-blocks',
			array(
				'label'               => __( 'List Custom Blocks', 'emcp-tools' ),
				'description'         => __( 'Lists all custom blocks generated by the block builder, with their status.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_list_custom_blocks' ),
				'permission_callback' => array( $this, 'check_manage_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'status' => array(
							'type'        => 'string',
							'enum'        => array( 'active', 'draft', 'any' ),
							'description' => __( 'Filter by status. Default: any.', 'emcp-tools' ),
						),
					),
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'blocks' => array( 'type' => 'array', 'items' => $this->summary_schema() ),
					),
				),
				'meta'                => array(
					'annotations'  => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * Executes list-custom-blocks.
	 *
	 * @param array $input Tool input.
	 * @return array|WP_Error
	 */
	public function execute_list_custom_blocks( $input ) {
		if ( ! $this->has_access() ) {
			return $this->no_license();
		}
		$status = isset( $input['status'] ) ? sanitize_key( $input['status'] ) : 'any';
		if ( ! in_array( $status, array( 'active', 'draft', 'any' ), true ) ) {
			$status = 'any';
		}
		return array( 'blocks' => EMCP_Tools_Block_Store::instance()->list_blocks( $status ) );
	}

	// -------------------------------------------------------------------------
	// set-block-status
	// -------------------------------------------------------------------------

	/**
	 * Registers set-block-status.
	 *
	 * @since 3.7.0
	 */
	private function register_set_block_status(): void {
		$this->ability_names[] = 'emcp-tools/set-block-status';
		emcp_tools_register_ability(
			'emcp-tools/set-block-status',
			array(
				'label'               => __( 'Set Block Status', 'emcp-tools' ),
				'description'         => __( 'Returns a custom block to an inactive draft (status draft). Activation is admin-only: a site administrator activates blocks in Neo EMCP, Sandbox, Blocks.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_set_block_status' ),
				'permission_callback' => array( $this, 'check_write_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'block_id' => array( 'type' => 'integer' ),
						'status'   => array(
							'type' => 'string',
							'enum' => array( 'draft' ), // activation is admin-only
						),
					),
					'required'   => array( 'block_id', 'status' ),
				),
				'output_schema'       => $this->summary_schema(),
				'meta'                => array(
					'annotations'  => array( 'readonly' => false, 'destructive' => false, 'idempotent' => true ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * Executes set-block-status.
	 *
	 * @param array $input Tool input.
	 * @return array|WP_Error
	 */
	public function execute_set_block_status( $input ) {
		if ( ! $this->has_access() ) {
			return $this->no_license();
		}
		$block_id = absint( $input['block_id'] ?? 0 );
		$status   = isset( $input['status'] ) ? sanitize_key( $input['status'] ) : '';
		if ( 'active' === $status ) {
			return new WP_Error( 'activation_requires_admin', __( 'Blocks are activated by a site administrator in Neo EMCP, Sandbox, Blocks. This tool can only return a block to draft.', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		if ( ! $block_id || 'draft' !== $status ) {
			return new WP_Error( 'missing_params', __( 'block_id and a valid status are required.', 'emcp-tools' ) );
		}
		return EMCP_Tools_Block_Store::instance()->set_status( $block_id, $status );
	}

	// -------------------------------------------------------------------------
	// delete-custom-block
	// -------------------------------------------------------------------------

	/**
	 * Registers delete-custom-block.
	 *
	 * @since 3.7.0
	 */
	private function register_delete_custom_block(): void {
		$this->ability_names[] = 'emcp-tools/delete-custom-block';
		emcp_tools_register_ability(
			'emcp-tools/delete-custom-block',
			array(
				'label'               => __( 'Delete Custom Block', 'emcp-tools' ),
				'description'         => __( 'Permanently deletes a custom block: its record and its sandbox files. Destructive.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_delete_custom_block' ),
				'permission_callback' => array( $this, 'check_manage_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'block_id' => array( 'type' => 'integer' ),
					),
					'required'   => array( 'block_id' ),
				),
				'output_schema'       => array(
					'type'       => 'object',
					'properties' => array(
						'success'  => array( 'type' => 'boolean' ),
						'block_id' => array( 'type' => 'integer' ),
					),
				),
				'meta'                => array(
					'annotations'  => array( 'readonly' => false, 'destructive' => true, 'idempotent' => true ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * Executes delete-custom-block.
	 *
	 * @param array $input Tool input.
	 * @return array|WP_Error
	 */
	public function execute_delete_custom_block( $input ) {
		if ( ! $this->has_access() ) {
			return $this->no_license();
		}
		$block_id = absint( $input['block_id'] ?? 0 );
		if ( ! $block_id ) {
			return new WP_Error( 'missing_params', __( 'block_id is required.', 'emcp-tools' ) );
		}
		return EMCP_Tools_Block_Store::instance()->delete( $block_id );
	}

	// -------------------------------------------------------------------------
	// Helpers
	// -------------------------------------------------------------------------

	/**
	 * Standard no-license error.
	 *
	 * @return WP_Error
	 */
	private function no_license(): WP_Error {
		return new WP_Error( 'no_license', __( 'A valid Neo EMCP license is required to use the block builder.', 'emcp-tools' ) );
	}
}
