<?php
/**
 * Ultimate Addons for Elementor (UAE) integration.
 *
 * Formerly "Header Footer Elementor". Brainstorm Force rebranded it to Ultimate
 * Addons for Elementor; the wordpress.org slug is still `header-footer-elementor`
 * and every internal identifier still says HFE (the `Header_Footer_Elementor`
 * class, `HFE_VER`, the `elementor-hf` CPT, `ehf_*` meta, the `hfe-` widget
 * prefix), so detection keys off those while the user-facing naming follows the
 * product.
 *
 * UAE is BOTH natures at once, which is why this class is shaped differently
 * from the pure widget packs:
 *
 *  - A widget pack. It registers widgets into Elementor's own registry
 *    (`hfe-*` free, `uael-*` in UAE Pro), so it inherits the pack base's
 *    discovery operations and its widgets are placed with `add-free-widget`.
 *  - A data plugin. It stores header/footer/block templates as an
 *    `elementor-hf` CPT with display conditions in post meta, which nothing
 *    else can write, so it also gets the house write dispatcher
 *    (`uae-read` / `uae-write`) like ACF, WooCommerce, SEO and Forms.
 *
 * Template scope: manage the TEMPLATE RECORD and its display conditions.
 * Building the template's actual content is done with the existing Elementor
 * tools against the returned `template_id`, exactly as with Neo EMCP Themer, so
 * this integration does not duplicate page-building operations.
 *
 * Note on overlap: Neo EMCP Themer is our own builder-agnostic theme builder and
 * covers the same job. This adapter exists for sites that already run UAE; the
 * two are not wired together on purpose, because two systems claiming the same
 * header/footer slot would fight at render time. See
 * EMCP_Tools_Themer_HFE_Conflict for how that is resolved at render time.
 *
 * @package EMCP_Tools
 * @since   3.6.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * UAE widget discovery + template/display-condition integration.
 *
 * @since 3.6.0
 */
class EMCP_Tools_UAE_Integration extends EMCP_Tools_Addon_Pack_Integration {

	const CPT            = 'elementor-hf';
	const META_TYPE      = 'ehf_template_type';
	const META_INCLUDE   = 'ehf_target_include_locations';
	const META_EXCLUDE   = 'ehf_target_exclude_locations';
	const META_ROLES     = 'ehf_target_user_roles';

	/**
	 * Template types UAE supports.
	 *
	 * @var string[]
	 */
	const TYPES = array( 'header', 'footer', 'before_footer', 'custom' );

	/**
	 * @return string
	 */
	public function id(): string {
		return 'uae';
	}

	/**
	 * @return string
	 */
	public function label(): string {
		return 'Ultimate Addons for Elementor (UAE)';
	}

	/**
	 * Widget prefixes. `hfe-` comes from the free plugin (the prefix survived
	 * the rebrand); `uael-` comes from UAE Pro.
	 *
	 * @return string[]
	 */
	public function prefixes(): array {
		return array( 'hfe-', 'uael-' );
	}

	/**
	 * Whether the free plugin is active.
	 *
	 * Detection keys off its own identifiers, which still say HFE: the
	 * wordpress.org slug is `header-footer-elementor`, the class is
	 * `Header_Footer_Elementor` and the CPT is `elementor-hf`.
	 *
	 * This is what gates TEMPLATES. The `elementor-hf` CPT and its `ehf_*`
	 * display-condition meta live in the free plugin, so with UAE Pro alone
	 * there are no templates to read or write.
	 *
	 * @since 3.6.2
	 * @return bool
	 */
	public function templates_available(): bool {
		return class_exists( 'Header_Footer_Elementor' ) || post_type_exists( self::CPT );
	}

	/**
	 * Whether UAE Pro is active.
	 *
	 * UAE Pro ships as a SEPARATE, standalone plugin (slug `ultimate-elementor`,
	 * "Ultimate Addons for Elementor Pro"), not as an add-on layered on the free
	 * plugin. It can be the only one installed, in which case the site has 40+
	 * `uael-*` widgets and no templates at all.
	 *
	 * @since 3.6.2
	 * @return bool
	 */
	public function pro_pack_available(): bool {
		return defined( 'UAEL_VER' ) || class_exists( 'UAEL_Loader' );
	}

	/**
	 * Active when EITHER plugin is present; they are independent.
	 *
	 * @return bool
	 */
	public function is_active(): bool {
		return $this->templates_available() || $this->pro_pack_available();
	}

	/**
	 * @return string
	 */
	final public function write_tool(): string {
		return 'emcp-tools/' . $this->id() . '-write';
	}

	/**
	 * Discovery always; templates only when the free plugin supplies them.
	 *
	 * Every write operation targets the `elementor-hf` CPT, so on a site running
	 * UAE Pro alone the write dispatcher is not registered at all rather than
	 * advertising four operations that cannot work.
	 *
	 * @return string[]
	 */
	public function get_ability_names(): array {
		$names = array( $this->read_tool() );
		if ( $this->templates_available() ) {
			$names[] = $this->write_tool();
		}
		return $names;
	}

	/**
	 * @return bool
	 */
	public function can_read(): bool {
		return current_user_can( 'edit_posts' );
	}

	/**
	 * Templates render site-wide, so writes need theme-level trust.
	 *
	 * @return bool
	 */
	public function can_write(): bool {
		return current_user_can( 'edit_theme_options' );
	}

	/**
	 * Read operations.
	 *
	 * @return array<string, array>
	 */
	protected function read_operations(): array {
		$ops = array(
			// Widget discovery, inherited from the pack base. UAE registers its
			// widgets into Elementor's own registry, so they are PLACED with the
			// ordinary `add-free-widget`; these operations exist only because
			// `list-widgets` serves the curated core catalog and would otherwise
			// never surface them.
			'list-widgets'      => array(
				'run'  => 'op_list_widgets',
				'desc' => 'List UAE widgets registered on this site (hfe-* free, uael-* with UAE Pro). Filter with `search` or `category`. Place them with `add-free-widget`.',
			),
			'get-widget-schema' => array(
				'run'  => 'op_get_widget_schema',
				'desc' => 'Content-bearing controls for a UAE widget by `type` (or `types` for a batch). Pass `full: true` for every control including styling.',
			),
			// Templates.
			'list-templates'    => array(
				'run'  => 'op_list_templates',
				'desc' => 'List UAE header/footer/block templates with their type (header/footer/before_footer/custom), status and display conditions. Filter with `type`.',
			),
			'get-template'      => array(
				'run'  => 'op_get_template',
				'desc' => 'One template by `template_id`: type, status, display conditions, user-role targeting, and whether it has Elementor content yet.',
			),
		);

		// Templates come from the free plugin. On a UAE Pro only site there are
		// none, so drop those operations from the catalog rather than offer an
		// operation that can only fail. Same approach as the ACF CPT/taxonomy
		// operations below ACF 6.1.
		if ( ! $this->templates_available() ) {
			unset( $ops['list-templates'], $ops['get-template'] );
		}

		return $ops;
	}

	/**
	 * Write operations.
	 *
	 * @return array<string, array>
	 */
	protected function write_operations(): array {
		return array(
			'create-template'         => array(
				'run'  => 'op_create_template',
				'desc' => 'Create a UAE template. Args: `title`, `type` (header|footer|before_footer|custom), optional `status`. Build its content afterwards with the Elementor tools using the returned template_id.',
			),
			'update-template'         => array(
				'run'  => 'op_update_template',
				'desc' => 'Update a template\'s `title`, `status` and/or `type`.',
			),
			'set-display-conditions'  => array(
				'run'  => 'op_set_display_conditions',
				'desc' => 'Set where a template shows. Args: `template_id`, `include` (array of location rules, e.g. ["entire-website"]), optional `exclude`, optional `user_roles`.',
			),
			'delete-template'         => array(
				'run'     => 'op_delete_template',
				'desc'    => 'Delete a template. Requires `confirm: true`. Pass `force: true` to bypass trash.',
				'confirm' => true,
			),
		);
	}

	/**
	 * Registers both dispatchers.
	 *
	 * @return void
	 */
	public function register(): void {
		$modes = $this->templates_available() ? array( 'read', 'write' ) : array( 'read' );

		foreach ( $modes as $mode ) {
			$ops  = 'read' === $mode ? $this->read_operations() : $this->write_operations();
			$tool = 'read' === $mode ? $this->read_tool() : $this->write_tool();

			emcp_tools_register_ability(
				$tool,
				array(
					// REQUIRED. wp_register_ability() silently drops abilities
					// registered without a category.
					'category'            => 'emcp-tools',
					'label'               => sprintf( '%s: %s', $this->label(), $mode ),
					'description'         => 'read' === $mode
						? ( $this->templates_available()
							? 'Discover Ultimate Addons for Elementor (UAE, formerly Header Footer Elementor) widgets, and inspect its header/footer/block templates and display conditions. Call with no `operation` to list operations. UAE widgets are PLACED with `add-free-widget`, not from here.'
							: 'Discover Ultimate Addons for Elementor (UAE) widgets registered on this site. Call with no `operation` to list operations. UAE widgets are PLACED with `add-free-widget`, not from here. Template operations are unavailable because only UAE Pro is active; templates come from the free Ultimate Addons for Elementor plugin.' )
						: 'Manage Ultimate Addons for Elementor (UAE) header/footer/block templates and their display conditions. Call with no `operation` to list operations. Template CONTENT is built with the normal Elementor tools against the template_id.',
					'input_schema'        => array(
						'type'       => 'object',
						'properties' => array(
							'operation' => array(
								'type'        => 'string',
								'description' => 'Operation to run. Omit for the catalog.',
								'enum'        => array_keys( $ops ),
							),
							'arguments' => array(
								'type'        => 'object',
								'description' => 'Arguments for the operation.',
							),
						),
					),
					'permission_callback' => array( $this, 'read' === $mode ? 'can_read' : 'can_write' ),
					'execute_callback'    => array( $this, 'read' === $mode ? 'run_read' : 'run_write' ),
				)
			);
		}
	}

	/**
	 * @param mixed $input Tool input.
	 * @return array|WP_Error
	 */
	public function run_read( $input ) {
		return $this->dispatch( $input, $this->read_operations() );
	}

	/**
	 * @param mixed $input Tool input.
	 * @return array|WP_Error
	 */
	public function run_write( $input ) {
		return $this->dispatch( $input, $this->write_operations() );
	}

	/**
	 * Shared dispatcher.
	 *
	 * @param mixed $input Tool input.
	 * @param array $ops   Operation map.
	 * @return array|WP_Error
	 */
	protected function dispatch( $input, array $ops ) {
		$input = is_array( $input ) ? $input : array();
		$op    = isset( $input['operation'] ) ? sanitize_text_field( (string) $input['operation'] ) : '';
		$args  = isset( $input['arguments'] ) && is_array( $input['arguments'] ) ? $input['arguments'] : array();

		if ( ! $this->is_active() ) {
			return new WP_Error( 'plugin_inactive', 'Ultimate Addons for Elementor is not active on this site.' );
		}

		if ( '' === $op ) {
			$catalog = array();
			foreach ( $ops as $name => $spec ) {
				$catalog[] = array(
					'operation'   => $name,
					'description' => $spec['desc'],
					'confirm'     => ! empty( $spec['confirm'] ),
				);
			}
			return array(
				'plugin'     => $this->label(),
				'operations' => $catalog,
			);
		}

		if ( ! isset( $ops[ $op ] ) ) {
			return new WP_Error( 'unknown_operation', sprintf( 'Unknown operation "%s".', $op ) );
		}

		if ( ! empty( $ops[ $op ]['confirm'] ) && empty( $args['confirm'] ) ) {
			return new WP_Error(
				'confirmation_required',
				sprintf( 'Operation "%s" is destructive. Pass confirm: true to proceed.', $op )
			);
		}

		$method = $ops[ $op ]['run'];
		return $this->$method( $args );
	}

	// ---------------------------------------------------------------------
	// Read operations
	// ---------------------------------------------------------------------

	/**
	 * @param array $args Args.
	 * @return array
	 */
	protected function op_list_templates( array $args ): array {
		$type = isset( $args['type'] ) ? sanitize_text_field( (string) $args['type'] ) : '';

		$posts = get_posts(
			array(
				'post_type'      => self::CPT,
				'post_status'    => array( 'publish', 'draft' ),
				'numberposts'    => 100,
				'suppress_filters' => false,
			)
		);

		$out = array();
		foreach ( $posts as $p ) {
			$t = (string) get_post_meta( $p->ID, self::META_TYPE, true );
			if ( '' !== $type && $t !== $type ) {
				continue;
			}
			$out[] = $this->template_summary( $p, $t );
		}

		return array(
			'plugin'    => $this->label(),
			'count'     => count( $out ),
			'templates' => $out,
		);
	}

	/**
	 * @param array $args Args.
	 * @return array|WP_Error
	 */
	protected function op_get_template( array $args ) {
		$id = isset( $args['template_id'] ) ? absint( $args['template_id'] ) : 0;
		$p  = $id ? get_post( $id ) : null;

		if ( ! $p || self::CPT !== $p->post_type ) {
			return new WP_Error( 'not_found', 'No UAE template with that template_id.' );
		}

		$data                 = $this->template_summary( $p, (string) get_post_meta( $p->ID, self::META_TYPE, true ) );
		$data['user_roles']   = (array) get_post_meta( $p->ID, self::META_ROLES, true );
		$data['has_content']  = '' !== (string) get_post_meta( $p->ID, '_elementor_data', true );
		$data['edit_hint']    = 'Build the content with the normal Elementor tools (add-container, add-free-widget, ...) using this template_id as post_id.';

		return $data;
	}

	// ---------------------------------------------------------------------
	// Write operations
	// ---------------------------------------------------------------------

	/**
	 * @param array $args Args.
	 * @return array|WP_Error
	 */
	protected function op_create_template( array $args ) {
		$title = isset( $args['title'] ) ? sanitize_text_field( (string) $args['title'] ) : '';
		$type  = isset( $args['type'] ) ? sanitize_text_field( (string) $args['type'] ) : '';

		if ( '' === $title ) {
			return new WP_Error( 'missing_title', 'Provide a `title`.' );
		}
		if ( ! in_array( $type, self::TYPES, true ) ) {
			return new WP_Error(
				'invalid_type',
				sprintf( 'Invalid `type`. Use one of: %s.', implode( ', ', self::TYPES ) )
			);
		}

		$status = isset( $args['status'] ) ? sanitize_text_field( (string) $args['status'] ) : 'publish';
		$id     = wp_insert_post(
			array(
				'post_title'  => $title,
				'post_type'   => self::CPT,
				'post_status' => in_array( $status, array( 'publish', 'draft' ), true ) ? $status : 'publish',
			),
			true
		);

		if ( is_wp_error( $id ) ) {
			return $id;
		}

		update_post_meta( $id, self::META_TYPE, $type );
		// Mark it as an Elementor document so the builder opens cleanly.
		update_post_meta( $id, '_elementor_edit_mode', 'builder' );

		return array(
			'created'     => true,
			'template_id' => $id,
			'type'        => $type,
			'next'        => 'Set where it appears with `set-display-conditions`, then build content with the Elementor tools using this template_id.',
		);
	}

	/**
	 * @param array $args Args.
	 * @return array|WP_Error
	 */
	protected function op_update_template( array $args ) {
		$id = isset( $args['template_id'] ) ? absint( $args['template_id'] ) : 0;
		$p  = $id ? get_post( $id ) : null;

		if ( ! $p || self::CPT !== $p->post_type ) {
			return new WP_Error( 'not_found', 'No UAE template with that template_id.' );
		}

		$update = array( 'ID' => $id );
		if ( isset( $args['title'] ) ) {
			$update['post_title'] = sanitize_text_field( (string) $args['title'] );
		}
		if ( isset( $args['status'] ) ) {
			$status = sanitize_text_field( (string) $args['status'] );
			if ( ! in_array( $status, array( 'publish', 'draft' ), true ) ) {
				return new WP_Error( 'invalid_status', 'Use status publish or draft.' );
			}
			$update['post_status'] = $status;
		}
		if ( count( $update ) > 1 ) {
			$res = wp_update_post( $update, true );
			if ( is_wp_error( $res ) ) {
				return $res;
			}
		}

		if ( isset( $args['type'] ) ) {
			$type = sanitize_text_field( (string) $args['type'] );
			if ( ! in_array( $type, self::TYPES, true ) ) {
				return new WP_Error(
					'invalid_type',
					sprintf( 'Invalid `type`. Use one of: %s.', implode( ', ', self::TYPES ) )
				);
			}
			update_post_meta( $id, self::META_TYPE, $type );
		}

		return array(
			'updated'  => true,
			'template' => $this->template_summary( get_post( $id ), (string) get_post_meta( $id, self::META_TYPE, true ) ),
		);
	}

	/**
	 * @param array $args Args.
	 * @return array|WP_Error
	 */
	protected function op_set_display_conditions( array $args ) {
		$id = isset( $args['template_id'] ) ? absint( $args['template_id'] ) : 0;
		$p  = $id ? get_post( $id ) : null;

		if ( ! $p || self::CPT !== $p->post_type ) {
			return new WP_Error( 'not_found', 'No UAE template with that template_id.' );
		}
		if ( ! isset( $args['include'] ) && ! isset( $args['exclude'] ) && ! isset( $args['user_roles'] ) ) {
			return new WP_Error( 'nothing_to_set', 'Provide at least one of `include`, `exclude` or `user_roles`.' );
		}

		if ( isset( $args['include'] ) ) {
			update_post_meta( $id, self::META_INCLUDE, $this->normalize_locations( $args['include'] ) );
		}
		if ( isset( $args['exclude'] ) ) {
			update_post_meta( $id, self::META_EXCLUDE, $this->normalize_locations( $args['exclude'] ) );
		}
		if ( isset( $args['user_roles'] ) ) {
			update_post_meta( $id, self::META_ROLES, array_map( 'sanitize_text_field', (array) $args['user_roles'] ) );
		}

		return array(
			'updated'  => true,
			'template' => $this->template_summary( $p, (string) get_post_meta( $id, self::META_TYPE, true ) ),
		);
	}

	/**
	 * @param array $args Args.
	 * @return array|WP_Error
	 */
	protected function op_delete_template( array $args ) {
		$id = isset( $args['template_id'] ) ? absint( $args['template_id'] ) : 0;
		$p  = $id ? get_post( $id ) : null;

		if ( ! $p || self::CPT !== $p->post_type ) {
			return new WP_Error( 'not_found', 'No UAE template with that template_id.' );
		}

		$force = ! empty( $args['force'] );
		$res   = wp_delete_post( $id, $force );

		if ( ! $res ) {
			return new WP_Error( 'delete_failed', 'WordPress refused to delete that template.' );
		}

		return array(
			'deleted'     => true,
			'template_id' => $id,
			'forced'      => $force,
		);
	}

	// ---------------------------------------------------------------------
	// Helpers
	// ---------------------------------------------------------------------

	/**
	 * HFE stores locations as an array under an `include`/`exclude` shaped key.
	 * Accept either a plain list of rule strings or the raw nested shape, and
	 * always persist the nested shape HFE's own reader expects.
	 *
	 * @param mixed $value Caller value.
	 * @return array
	 */
	protected function normalize_locations( $value ): array {
		$value = (array) $value;

		// Already the nested shape: { rule: [...] }.
		if ( isset( $value['rule'] ) ) {
			$value['rule'] = array_map( 'sanitize_text_field', (array) $value['rule'] );
			return $value;
		}

		return array( 'rule' => array_map( 'sanitize_text_field', array_values( $value ) ) );
	}

	/**
	 * @param WP_Post $p    Post.
	 * @param string  $type Template type meta.
	 * @return array
	 */
	protected function template_summary( $p, string $type ): array {
		$include = get_post_meta( $p->ID, self::META_INCLUDE, true );
		$exclude = get_post_meta( $p->ID, self::META_EXCLUDE, true );

		return array(
			'template_id' => $p->ID,
			'title'       => $p->post_title,
			'type'        => $type,
			'status'      => $p->post_status,
			'include'     => is_array( $include ) && isset( $include['rule'] ) ? $include['rule'] : array(),
			'exclude'     => is_array( $exclude ) && isset( $exclude['rule'] ) ? $exclude['rule'] : array(),
		);
	}
}
