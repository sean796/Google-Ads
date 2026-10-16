<?php
/** Standalone Breakdance integration. Native APIs verified on 2.8.3. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

class EMCP_Tools_Breakdance_Integration {
	private $schemas = array();

	public static function supported(): bool {
		return defined( 'BREAKDANCE_MODE' ) && 'breakdance' === BREAKDANCE_MODE
			&& defined( '__BREAKDANCE_VERSION' ) && version_compare( __BREAKDANCE_VERSION, '2.8.3', '>=' ) && version_compare( __BREAKDANCE_VERSION, '2.9', '<' )
			&& function_exists( '\Breakdance\Data\save_document' ) && function_exists( '\Breakdance\Elements\get_elements_for_builder' );
	}

	public static function definitions(): array {
		$post = array( 'type' => 'integer', 'minimum' => 1 );
		$object = array( 'type' => 'object', 'additionalProperties' => true );
		$mutation = array( 'post_id' => $post, 'expected_hash' => array( 'type' => 'string', 'pattern' => '^[a-f0-9]{64}$', 'description' => 'Current content_hash from get-page; re-read after each edit.' ) );
		$parent = array( 'parent_id' => $post, 'position' => array( 'type' => 'integer', 'minimum' => 0 ) );
		$page = array( 'page' => $post, 'per_page' => array( 'type' => 'integer', 'minimum' => 1, 'maximum' => 100 ) );
		return array(
			'get-context' => array( 'Discovery', 'Breakdance Context', 'Read installed version, permissions, breakpoints and supported workflow. Start here.', false, array(), array() ),
			'list-elements' => array( 'Discovery', 'List Breakdance Elements', 'List registered native element types and nesting rules. Some specialized elements are read-only in this adapter.', false, array(), array() ),
			'get-element-schema' => array( 'Discovery', 'Breakdance Element Schema', 'Read native controls, defaults and nesting rules for an exact namespaced type, e.g. EssentialElements\\Heading.', false, array( 'type' => array( 'type' => 'string' ) ), array( 'type' ) ),
			'list-pages' => array( 'Pages', 'List Breakdance Pages', 'List editable WordPress pages and their Breakdance status.', false, $page, array() ),
			'get-page' => array( 'Pages', 'Get Breakdance Page', 'Read the native nested tree and content_hash for a page or existing template.', false, array( 'post_id' => $post ), array( 'post_id' ) ),
			'create-page' => array( 'Pages', 'Create Breakdance Draft', 'Create an empty draft using the native Breakdance tree format.', true, array( 'title' => array( 'type' => 'string', 'minLength' => 1 ) ), array( 'title' ) ),
			'set-page-tree' => array( 'Pages', 'Set Breakdance Page Tree', 'Replace a page tree with root, _nextNodeId and nested nodes. Requires expected_hash; preserves template settings and page status.', true, $mutation + array( 'tree' => $object ), array( 'post_id', 'expected_hash', 'tree' ) ),
			'add-element' => array( 'Elements', 'Add Breakdance Element', 'Add a childless native element, allocating a unique ID. Read schema/defaults first; default parent is root 1.', true, $mutation + $parent + array( 'type' => array( 'type' => 'string' ), 'properties' => $object ), array( 'post_id', 'expected_hash', 'type' ) ),
			'update-element' => array( 'Elements', 'Update Breakdance Element', 'Recursively merge named property groups while replacing lists and preserving other properties. Optional label changes its friendly name.', true, $mutation + array( 'element_id' => $post, 'properties' => $object, 'label' => array( 'type' => 'string' ) ), array( 'post_id', 'expected_hash', 'element_id', 'properties' ) ),
			'move-element' => array( 'Elements', 'Move Breakdance Element', 'Move a node and descendants to a parent and sibling position; rejects cycles and invalid nesting.', true, $mutation + $parent + array( 'element_id' => $post ), array( 'post_id', 'expected_hash', 'element_id', 'parent_id' ) ),
			'remove-element' => array( 'Elements', 'Remove Breakdance Element', 'Remove a node and its entire subtree; root cannot be removed.', true, $mutation + array( 'element_id' => $post ), array( 'post_id', 'expected_hash', 'element_id' ) ),
			'list-templates' => array( 'Templates & Design', 'List Breakdance Templates', 'List editable existing templates, headers, footers, popups and global blocks. Creation and conditions are not included.', false, $page, array() ),
			'get-design-system' => array( 'Templates & Design', 'Breakdance Design System', 'Read existing global design settings, classes, presets, variables and breakpoints; no global writes.', false, array(), array() ),
		);
	}

	public static function admin_categories(): array {
		$result = array();
		foreach ( self::definitions() as $slug => $def ) {
			$key = 'breakdance_' . sanitize_key( $def[0] );
			if ( ! isset( $result[ $key ] ) ) { $result[ $key ] = array( 'platform' => 'breakdance', 'pro' => true, 'label' => 'Breakdance: ' . $def[0], 'tools' => array() ); }
			$result[ $key ]['tools'][ 'emcp-tools/breakdance-' . $slug ] = array( 'label' => $def[1], 'description' => $def[2], 'badges' => $def[3] ? array( 'pro' ) : array( 'pro', 'read-only' ), 'available' => self::supported(), 'requires' => array( 'name' => 'Breakdance 2.8.3–2.8.x', 'kind' => 'plugin' ) );
		}
		return $result;
	}

	public function get_ability_names(): array { return array_map( static function( $slug ) { return 'emcp-tools/breakdance-' . $slug; }, array_keys( self::definitions() ) ); }

	public function register(): void {
		foreach ( self::definitions() as $slug => $def ) {
			emcp_tools_register_ability( 'emcp-tools/breakdance-' . $slug, array(
				'label' => $def[1], 'description' => $def[2], 'category' => 'emcp-tools',
				'input_schema' => array( 'type' => 'object', 'properties' => $def[4], 'required' => $def[5], 'additionalProperties' => false ),
				'permission_callback' => function() use ( $def ) { return $this->can_access( $def[3] ); },
				'execute_callback' => function( $args = array() ) use ( $slug ) { return $this->execute( $slug, is_array( $args ) ? $args : array() ); },
				'meta' => array( 'show_in_rest' => true, 'annotations' => array( 'readonly' => ! $def[3], 'destructive' => in_array( $slug, array( 'set-page-tree', 'remove-element' ), true ), 'idempotent' => ! $def[3] ) ),
			) );
		}
	}

	private function can_access( bool $write ): bool {
		return EMCP_Tools_Page_Builders::enabled( 'breakdance' ) && current_user_can( 'edit_posts' ) && \Breakdance\Permissions\hasMinimumPermission( $write ? 'full' : 'edit' );
	}

	private function types(): array {
		return array_values( array_filter( array( 'page', defined( 'BREAKDANCE_TEMPLATE_POST_TYPE' ) ? BREAKDANCE_TEMPLATE_POST_TYPE : '', defined( 'BREAKDANCE_HEADER_POST_TYPE' ) ? BREAKDANCE_HEADER_POST_TYPE : '', defined( 'BREAKDANCE_FOOTER_POST_TYPE' ) ? BREAKDANCE_FOOTER_POST_TYPE : '', defined( 'BREAKDANCE_POPUP_POST_TYPE' ) ? BREAKDANCE_POPUP_POST_TYPE : '', defined( 'BREAKDANCE_BLOCK_POST_TYPE' ) ? BREAKDANCE_BLOCK_POST_TYPE : '' ) ) );
	}

	private function post_allowed( int $id ): bool {
		$type = get_post_type( $id );
		return $id > 0 && in_array( $type, $this->types(), true ) && ! in_array( get_post_status( $id ), array( 'trash', 'auto-draft' ), true ) && current_user_can( 'edit_post', $id ) && \Breakdance\Permissions\isPostTypeAllowed( $type );
	}

	public function element_schema( string $type ): array {
		if ( isset( $this->schemas[ $type ] ) ) { return $this->schemas[ $type ]; }
		if ( ! in_array( $type, \Breakdance\Elements\get_element_classnames(), true ) ) { return array(); }
		$all = \Breakdance\Elements\get_elements_for_builder( array( $type ) );
		$this->schemas[ $type ] = isset( $all[0] ) ? array_intersect_key( $all[0], array_flip( array( 'name', 'slug', 'category', 'defaultProperties', 'defaultChildren', 'controls', 'nestingRule', 'htmlTag', 'settings' ) ) ) : array();
		if ( $this->schemas[ $type ] ) { $this->schemas[ $type ]['universalControls'] = \Breakdance\Elements\UniversalControls\getUniversalControls(); }
		return $this->schemas[ $type ];
	}

	public function execute( string $slug, array $args ) {
		$def = self::definitions()[ $slug ] ?? null;
		if ( ! $def || ! $this->can_access( $def[3] ) ) { return new WP_Error( 'breakdance_forbidden', 'Select the Breakdance integration and use an account with the required builder access.' ); }
		if ( in_array( 'emcp-tools/breakdance-' . $slug, (array) get_option( 'emcp_tools_disabled_tools', array() ), true ) ) { return new WP_Error( 'tool_disabled', 'This Breakdance tool is disabled in Neo EMCP.' ); }
		switch ( $slug ) {
			case 'get-context': return array( 'version' => __BREAKDANCE_VERSION, 'tested_version' => '2.8.3', 'can_write' => $this->can_access( true ), 'breakpoints' => \Breakdance\Config\Breakpoints\get_breakpoints(), 'post_types' => $this->types(), 'workflow' => array( 'Read element schemas and existing design settings.', 'Create draft or read page tree.', 'Pass current content_hash as expected_hash for each edit.', 'Read back and verify frontend/editor.' ), 'limitations' => array( 'Full builder permission required for structural writes.', 'Code, forms, global block instances and specialized nesting authoring are excluded.', 'Global design writes and template creation/conditions are excluded.' ) );
			case 'get-element-schema': return $this->element_schema( $args['type'] ?? '' ) ?: new WP_Error( 'unknown_element', 'Unknown registered element type.' );
			case 'list-elements':
				$out = array();
				foreach ( \Breakdance\Elements\get_element_classnames() as $type ) {
					if ( ! in_array( 'breakdance', $type::availableIn(), true ) ) { continue; }
					$out[] = array( 'type' => $type, 'name' => $type::name(), 'category' => $type::category(), 'nestingRule' => $type::nestingRule() );
				}
				return array( 'elements' => $out );
			case 'get-design-system':
				if ( ! current_user_can( 'edit_theme_options' ) ) { return new WP_Error( 'breakdance_forbidden', 'Design-system access requires edit_theme_options.' ); }
				return array( 'settings' => \Breakdance\Data\get_global_settings_array(), 'breakpoints' => \Breakdance\Config\Breakpoints\get_breakpoints(), 'classes' => json_decode( (string) \Breakdance\Data\get_global_option( 'breakdance_classes_json_string' ), true ), 'presets' => json_decode( (string) \Breakdance\Data\get_global_option( 'presets_json_string' ), true ), 'variables' => \Breakdance\Variables\getVariables() );
			case 'list-pages': case 'list-templates':
				$query = new WP_Query( array( 'post_type' => 'list-pages' === $slug ? 'page' : array_values( array_diff( $this->types(), array( 'page' ) ) ), 'post_status' => array( 'publish', 'draft', 'pending', 'private', 'future' ), 'posts_per_page' => min( 100, max( 1, (int) ( $args['per_page'] ?? 20 ) ) ), 'paged' => max( 1, (int) ( $args['page'] ?? 1 ) ), 'orderby' => 'ID', 'order' => 'DESC', 'perm' => 'editable' ) );
				$out = array();
				foreach ( $query->posts as $post ) { if ( $this->post_allowed( $post->ID ) ) { $out[] = array( 'post_id' => $post->ID, 'title' => $post->post_title, 'status' => $post->post_status, 'post_type' => $post->post_type, 'has_tree' => false !== \Breakdance\Data\get_tree( $post->ID ) ); } }
				return array( 'items' => $out, 'has_more' => $query->max_num_pages > (int) ( $args['page'] ?? 1 ) );
			case 'get-page': return $this->get_page( (int) ( $args['post_id'] ?? 0 ) );
			case 'create-page':
				if ( ! current_user_can( 'edit_pages' ) ) { return new WP_Error( 'breakdance_forbidden', 'Page editing is required.' ); }
				$title = sanitize_text_field( $args['title'] ?? '' );
				if ( '' === trim( $title ) ) { return new WP_Error( 'invalid_title', 'Provide a page title.' ); }
				$id = wp_insert_post( array( 'post_title' => $title, 'post_status' => 'draft', 'post_type' => 'page' ), true );
				if ( is_wp_error( $id ) ) { return $id; }
				\Breakdance\Data\set_meta( $id, '_breakdance_data', array( 'tree_json_string' => wp_json_encode( EMCP_Tools_Breakdance_Tree::blank() ) ) );
				return $this->get_page( $id );
			default: return $this->mutate( $slug, $args );
		}
	}

	private function get_page( int $id ) {
		if ( ! $this->post_allowed( $id ) ) { return new WP_Error( 'breakdance_forbidden', 'Page not found or builder access denied.' ); }
		$tree = \Breakdance\Data\get_tree( $id );
		if ( false === $tree && metadata_exists( 'post', $id, '_breakdance_data' ) ) { return new WP_Error( 'invalid_tree', 'Stored Breakdance data could not be decoded; refusing to replace it with an empty tree.' ); }
		return array( 'post_id' => $id, 'tree' => $tree ?: EMCP_Tools_Breakdance_Tree::blank(), 'has_tree' => false !== $tree, 'content_hash' => hash( 'sha256', wp_json_encode( array( $id, get_post_meta( $id, '_breakdance_data', true ), get_post_meta( $id, '_breakdance_futurelayer_meta', true ), get_post_meta( $id, '_breakdance_template_settings', true ) ) ) ), 'editor_url' => \Breakdance\Admin\get_builder_loader_url( (string) $id ), 'url' => get_permalink( $id ), 'preview_url' => get_preview_post_link( $id ) );
	}

	/** Build a control-path map from native sections, including nested presets. */
	private function property_paths( array $schema ): array {
		$out = array();
		$walk = function( array $controls, string $prefix ) use ( &$walk, &$out ) {
			foreach ( $controls as $control ) {
				$path = $prefix . '.' . $control['slug'];
				if ( ! empty( $control['children'] ) && ( $control['options']['type'] ?? '' ) === 'section' ) { $walk( $control['children'], $path ); }
				else { $out[ $path ] = $control; }
			}
		};
		foreach ( array( 'content', 'design', 'settings' ) as $group ) {
			$walk( $schema['controls'][ $group . 'Sections' ] ?? array(), $group );
			$walk( $schema['universalControls'][ $group . 'Sections' ] ?? array(), $group );
		}
		return $out;
	}

	private function validate_properties( array $tree, array $old ) {
		$walk = function( array $node ) use ( &$walk, $old ) {
			if ( 1 !== $node['id'] ) {
				$before = EMCP_Tools_Breakdance_Tree::find( $old['root'], $node['id'] );
				$prior = $before && $before['data']['type'] === $node['data']['type'] ? $before['data']['properties'] : array();
				$paths = $this->property_paths( $this->element_schema( $node['data']['type'] ) );
				$paths['meta.friendlyName'] = array();
				$check = function( $value, $previous, string $path ) use ( &$check, $paths ) {
					if ( $value === $previous ) { return true; }
					if ( isset( $paths[ $path ] ) ) {
						if ( preg_match( '/php|javascript|code|shortcode|actions/i', $path ) || preg_match( '/<\?php|\[breakdance_dynamic[^\]]*(php|code)/i', wp_json_encode( $value ) ) ) { return new WP_Error( 'unsupported_code', 'Executable properties are not supported.' ); }
						if ( is_array( $value ) ) {
							$valid_breakpoints = array_column( \Breakdance\Config\Breakpoints\get_breakpoints(), 'id' );
							foreach ( array_keys( $value ) as $key ) { if ( is_string( $key ) && strpos( $key, 'breakpoint_' ) === 0 && ! in_array( $key, $valid_breakpoints, true ) ) { return new WP_Error( 'invalid_property', 'Unknown breakpoint: ' . $key ); } }
						}
						return true;
					}
					if ( ! is_array( $value ) || array_is_list( $value ) ) { return new WP_Error( 'invalid_property', 'Unknown property path: ' . $path ); }
					foreach ( $value as $key => $child ) { $result = $check( $child, is_array( $previous ) ? ( $previous[ $key ] ?? null ) : null, ltrim( $path . '.' . $key, '.' ) ); if ( is_wp_error( $result ) ) { return $result; } }
					return true;
				};
				$result = $check( $node['data']['properties'], $prior, '' );
				if ( is_wp_error( $result ) ) { return $result; }
			}
			foreach ( $node['children'] as $child ) { $result = $walk( $child ); if ( is_wp_error( $result ) ) { return $result; } }
			return true;
		};
		return $walk( $tree['root'] );
	}

	private function mutate( string $slug, array $args ) {
		$id = (int) ( $args['post_id'] ?? 0 );
		$state = $this->get_page( $id );
		if ( is_wp_error( $state ) ) { return $state; }
		if ( ! function_exists( 'wp_check_post_lock' ) ) { require_once ABSPATH . 'wp-admin/includes/post.php'; }
		if ( wp_check_post_lock( $id ) ) { return new WP_Error( 'post_locked', 'This page is being edited by another user.' ); }
		$lock = 'emcp_breakdance_lock_' . $id;
		if ( ! add_option( $lock, time(), '', false ) ) { return new WP_Error( 'post_locked', 'An EMCP save is in progress. An administrator can clear the lock after a crashed request.' ); }
		try {
			$state = $this->get_page( $id );
			if ( is_wp_error( $state ) ) { return $state; }
			if ( ! hash_equals( $state['content_hash'], (string) ( $args['expected_hash'] ?? '' ) ) ) { return new WP_Error( 'stale_page', 'Page changed; re-read before editing.' ); }
			$result = EMCP_Tools_Breakdance_Tree::validate( $state['tree'], array( $this, 'element_schema' ) );
			if ( is_wp_error( $result ) ) { return $result; }
			$tree = 'set-page-tree' === $slug ? $args['tree'] : EMCP_Tools_Breakdance_Tree::edit( $state['tree'], $slug, $args );
			if ( is_wp_error( $tree ) ) { return $tree; }
			$result = EMCP_Tools_Breakdance_Tree::validate( $tree, array( $this, 'element_schema' ) );
			if ( is_wp_error( $result ) ) { return $result; }
			$result = $this->validate_properties( $tree, $state['tree'] );
			if ( is_wp_error( $result ) ) { return $result; }
			if ( $tree === $state['tree'] ) { return $state; }
			add_filter( 'wp_save_post_revision_check_for_changes', '__return_false' );
			try { $revision = wp_save_post_revision( $id ); } finally { remove_filter( 'wp_save_post_revision_check_for_changes', '__return_false' ); }
			if ( is_wp_error( $revision ) || ! $revision ) { return new WP_Error( 'revision_failed', 'Enable page revisions before structural editing.' ); }
			$future = \Breakdance\Data\get_meta( $id, '_breakdance_futurelayer_meta' );
			try {
				\Breakdance\Render\DependencyCache::getInstance()->postDependencies = EMPTY_DEPENDENCIES;
				\Breakdance\Data\save_document( wp_json_encode( $tree ), null, $future, null, null, null, null, null, null, $id );
			} catch ( \Throwable $error ) {
				return new WP_Error( 'save_failed', 'Native save failed; re-read the page before retrying. Prior revision: ' . $revision );
			}
			$after = $this->get_page( $id );
			if ( is_wp_error( $after ) || $after['tree'] !== $tree ) { return new WP_Error( 'save_failed', 'Readback differs from the requested tree. Prior revision: ' . $revision ); }
			$after['revision_id'] = $revision;
			$after['css_cache'] = \Breakdance\Data\get_meta( $id, '_breakdance_css_file_paths_cache' );
			return $after;
		} finally { delete_option( $lock ); }
	}
}
