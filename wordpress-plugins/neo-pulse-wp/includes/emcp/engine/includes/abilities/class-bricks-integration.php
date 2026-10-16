<?php
/** Standalone Bricks integration. Verified against Bricks 2.3.13 and 2.4.1. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

class EMCP_Tools_Bricks_Integration {
	public static function supported(): bool {
		return 'bricks' === strtolower( get_template() ) && defined( 'BRICKS_VERSION' )
			&& self::version_supported( BRICKS_VERSION )
			&& class_exists( '\Bricks\Elements' ) && class_exists( '\Bricks\Capabilities' );
	}

	/** Keep unverified future minor versions gated until a native smoke passes. */
	public static function version_supported( string $version ): bool {
		return version_compare( $version, '2.3.13', '>=' ) && version_compare( $version, '2.5', '<' );
	}

	/** One definition feeds registration, the Tools screen and default switches. */
	public static function definitions(): array {
		$post = array( 'type' => 'integer', 'minimum' => 1, 'description' => 'WordPress page or Bricks template ID.' );
		$hash = array( 'type' => 'string', 'description' => 'Exact content_hash from bricks-get-page. Re-read after every edit.', 'pattern' => '^[a-f0-9]{64}$' );
		$id = array( 'type' => 'string', 'description' => 'Element ID from the current page tree.' );
		$position = array( 'type' => 'integer', 'minimum' => 0, 'description' => 'Zero-based sibling position; omitted means append.' );
		$parent = array( 'type' => array( 'integer', 'string' ), 'description' => 'Parent element ID or integer 0 for root.' );
		$object = array( 'type' => 'object', 'additionalProperties' => true );
		$mutation = array( 'post_id' => $post, 'expected_hash' => $hash );
		$page = array( 'page' => array( 'type' => 'integer', 'minimum' => 1 ), 'per_page' => array( 'type' => 'integer', 'minimum' => 1, 'maximum' => 100 ) );
		return array(
			'get-context' => array( 'Discovery', 'Bricks Context', 'Read Bricks version, capabilities, breakpoints and the supported editing workflow. Start here.', false, array(), array() ),
			'list-elements' => array( 'Discovery', 'List Bricks Elements', 'Discover registered Bricks elements, including addons, and their nesting support.', false, array(), array() ),
			'get-element-schema' => array( 'Discovery', 'Bricks Element Schema', 'Read runtime Bricks controls, defaults, control groups and nestable child presets. Use exact keys and value shapes from these controls.', false, array( 'name' => array( 'type' => 'string' ) ), array( 'name' ) ),
			'list-pages' => array( 'Pages', 'List Bricks Pages', 'List editable WordPress pages with their Bricks editor status; includes drafts and pages ready for conversion.', false, $page, array() ),
			'get-page' => array( 'Pages', 'Get Bricks Page', 'Read raw page/template elements, their area and content_hash. Component definitions are not expanded.', false, array( 'post_id' => $post ), array( 'post_id' ) ),
			'create-page' => array( 'Pages', 'Create Bricks Draft', 'Create an empty draft page for Bricks. Returns its ID and content_hash for adding elements.', true, array( 'title' => array( 'type' => 'string', 'minLength' => 1 ) ), array( 'title' ) ),
			'set-page-elements' => array( 'Pages', 'Set Bricks Page Elements', 'Replace all elements in the page/template area with a validated flat tree. Requires expected_hash; use [] to clear. Components and executable-code changes are unsupported.', true, $mutation + array( 'elements' => array( 'type' => 'array', 'maxItems' => 2000, 'items' => $object ) ), array( 'post_id', 'expected_hash', 'elements' ) ),
			'add-element' => array( 'Elements', 'Add Bricks Element', 'Insert one native element with id/name/parent/settings and no children. Use a unique six-character lowercase ID. Query its schema first.', true, $mutation + array( 'element' => $object, 'position' => $position ), array( 'post_id', 'expected_hash', 'element' ) ),
			'update-element' => array( 'Elements', 'Update Bricks Element', 'Merge top-level settings keys, replacing nested values in full. Preserves other settings, internal classes and tree links. unset_settings removes named keys.', true, $mutation + array( 'element_id' => $id, 'settings' => $object, 'unset_settings' => array( 'type' => 'array', 'items' => array( 'type' => 'string' ) ), 'label' => array( 'type' => 'string' ) ), array( 'post_id', 'expected_hash', 'element_id', 'settings' ) ),
			'move-element' => array( 'Elements', 'Move Bricks Element', 'Move an element and its subtree to a parent and sibling position. Cycles and non-nestable parents are rejected.', true, $mutation + array( 'element_id' => $id, 'parent' => $parent, 'position' => $position ), array( 'post_id', 'expected_hash', 'element_id', 'parent' ) ),
			'remove-element' => array( 'Elements', 'Remove Bricks Element', 'Remove an element and all descendants from its page/template. Requires the current content_hash.', true, $mutation + array( 'element_id' => $id ), array( 'post_id', 'expected_hash', 'element_id' ) ),
			'list-templates' => array( 'Templates & Design', 'List Bricks Templates', 'Discover editable local Bricks templates and their types. Read/edit existing template elements with the page tools; template creation and conditions are not included.', false, $page, array() ),
			'get-design-system' => array( 'Templates & Design', 'Bricks Design System', 'Read existing global classes, variables, palettes, theme styles and actual breakpoints. Reference existing class IDs; this tool does not modify global data.', false, array(), array() ),
		);
	}

	public static function admin_categories(): array {
		$categories = array();
		foreach ( self::definitions() as $slug => $def ) {
			$key = 'bricks_' . sanitize_key( $def[0] );
			if ( ! isset( $categories[ $key ] ) ) {
				$categories[ $key ] = array( 'platform' => 'bricks', 'pro' => true, 'label' => 'Bricks: ' . $def[0], 'tools' => array() );
			}
			$categories[ $key ]['tools'][ 'emcp-tools/bricks-' . $slug ] = array(
				'label' => $def[1], 'description' => $def[2], 'badges' => $def[3] ? array( 'pro' ) : array( 'pro', 'read-only' ),
				'available' => self::supported(), 'requires' => array( 'name' => 'Bricks 2.3.13 to 2.4.x', 'kind' => 'theme' ),
			);
		}
		return $categories;
	}

	public function get_ability_names(): array {
		return array_map( static function( $slug ) { return 'emcp-tools/bricks-' . $slug; }, array_keys( self::definitions() ) );
	}

	public function register(): void {
		foreach ( self::definitions() as $slug => $def ) {
			emcp_tools_register_ability( 'emcp-tools/bricks-' . $slug, array(
				'label' => $def[1], 'description' => $def[2], 'category' => 'emcp-tools',
				'input_schema' => array( 'type' => 'object', 'properties' => $def[4], 'required' => $def[5], 'additionalProperties' => false ),
				'permission_callback' => function() use ( $def ) { return $this->can_access( $def[3] ); },
				'execute_callback' => function( $args = array() ) use ( $slug ) { return $this->execute( $slug, is_array( $args ) ? $args : array() ); },
				'meta' => array( 'show_in_rest' => true, 'annotations' => array( 'readonly' => ! $def[3], 'destructive' => in_array( $slug, array( 'set-page-elements', 'remove-element' ), true ), 'idempotent' => ! $def[3] ) ),
			) );
		}
	}

	private function can_access( bool $write ): bool {
		if ( ! EMCP_Tools_Page_Builders::enabled( 'bricks' ) || ! current_user_can( 'edit_posts' ) ) { return false; }
		if ( $write ) {
			// Partial/custom roles cannot safely perform arbitrary structural edits.
			return current_user_can( 'administrator' ) || ( current_user_can( 'bricks_full_access' ) && ! current_user_can( 'bricks_no_access' ) );
		}
		return current_user_can( 'administrator' ) || ( ! current_user_can( 'bricks_no_access' ) && ( current_user_can( 'bricks_full_access' ) || current_user_can( 'bricks_edit_content' ) ) );
	}

	public function execute( string $slug, array $args ) {
		if ( in_array( 'emcp-tools/bricks-' . $slug, (array) get_option( 'emcp_tools_disabled_tools', array() ), true ) ) {
			return new WP_Error( 'tool_disabled', 'This Bricks tool is disabled in Neo EMCP.', array( 'status' => 403 ) );
		}
		$def = self::definitions()[ $slug ] ?? null;
		if ( ! $def || ! $this->can_access( $def[3] ) ) { return new WP_Error( 'bricks_forbidden', 'Enable the Bricks integration and use an account with the required builder access.', array( 'status' => 403 ) ); }
		switch ( $slug ) {
			case 'get-context': return array( 'version' => BRICKS_VERSION, 'tested_version' => '2.4.2', 'can_write' => $this->can_access( true ), 'breakpoints' => \Bricks\Breakpoints::get_breakpoints(), 'root_font_size' => $this->root_font_size(), 'native_abilities' => $this->native_abilities_status(), 'workflow' => array( 'Read the design system and element schemas.', 'Check root_font_size before writing rem values: Bricks defaults to html { font-size: 62.5% }, so 1rem is 10px unless a theme style changes it.', 'Create a draft or read an existing page.', 'Supply its current content_hash as expected_hash for each mutation.', 'Write custom CSS with %root%; EMCP resolves it to the persisted element selector on save, as the Bricks builder does.', 'Re-read and inspect the rendered result.' ), 'limitations' => array( 'Structural writes require full builder access.', 'Component instance editing and executable-code changes (code elements, JavaScript interactions, query editors, echo tags) are not included.', 'Global design writes (palettes, global classes, variables, theme styles) and templates, template conditions and popups are not EMCP tools. Use the Bricks abilities listed under native_abilities when they are enabled.' ) );
			case 'list-elements':
				$result = array();
				foreach ( array_keys( \Bricks\Elements::$elements ) as $name ) {
					$type = $this->element_schema( $name );
					$result[] = array_intersect_key( $type, array_flip( array( 'name', 'label', 'category', 'nestable', 'deprecated' ) ) );
				}
				return array( 'elements' => $result );
			case 'get-element-schema':
				$type = $this->element_schema( $args['name'] ?? '' );
				return $type ?: new WP_Error( 'unknown_element', 'Element is not registered in the installed Bricks version.' );
			case 'list-pages': return $this->list_posts( 'page', $args );
			case 'list-templates': return $this->list_posts( 'bricks_template', $args );
			case 'get-design-system':
				if ( ! current_user_can( 'edit_theme_options' ) ) { return new WP_Error( 'bricks_forbidden', 'Design-system access requires edit_theme_options.' ); }
				$data = array( 'breakpoints' => \Bricks\Breakpoints::get_breakpoints() );
				foreach ( array( 'global_classes', 'global_variables', 'color_palette', 'theme_styles', 'global_pseudo_classes' ) as $key ) { $data[ $key ] = get_option( 'bricks_' . $key, array() ); }
				return $data;
			case 'create-page':
				if ( ! current_user_can( 'edit_pages' ) || ! \Bricks\Builder_Permissions::user_has_permission( 'access_builder_page' ) ) { return new WP_Error( 'bricks_forbidden', 'Page creation requires page editing and Bricks page access.' ); }
				$title = sanitize_text_field( $args['title'] ?? '' );
				if ( '' === trim( $title ) ) { return new WP_Error( 'invalid_title', 'Provide a page title.' ); }
				$id = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'draft', 'post_title' => $title ), true );
				if ( is_wp_error( $id ) ) { return $id; }
				update_post_meta( $id, BRICKS_DB_EDITOR_MODE, 'bricks' );
				return $this->get_page( $id );
			case 'get-page': return $this->get_page( (int) ( $args['post_id'] ?? 0 ) );
			default: return $this->mutate( $slug, $args );
		}
	}

	/**
	 * The site's root (html) font size, so rem values are authored against the
	 * real base. Bricks' frontend CSS sets html { font-size: 62.5% } unless a
	 * theme style overrides it with typography.typographyHtml.
	 *
	 * @return array{value: string, rem_px: float|null, source: string}
	 */
	private function root_font_size(): array {
		$value  = '62.5%';
		$source = 'Bricks default';
		foreach ( (array) get_option( 'bricks_theme_styles', array() ) as $style ) {
			$html = $style['settings']['typography']['typographyHtml'] ?? '';
			if ( is_string( $html ) && '' !== trim( $html ) ) {
				$value  = trim( $html );
				$source = 'Theme style: ' . (string) ( $style['label'] ?? 'unnamed' );
				break;
			}
		}
		$px = null;
		if ( preg_match( '/^([\d.]+)\s*(%|px|rem|em)?$/', $value, $m ) ) {
			$number = (float) $m[1];
			$unit   = $m[2] ?? 'px';
			$px     = '%' === $unit ? 16 * $number / 100 : ( in_array( $unit, array( 'rem', 'em' ), true ) ? 16 * $number : $number );
		}
		return array( 'value' => $value, 'rem_px' => null === $px ? null : round( $px, 2 ), 'source' => $source );
	}

	/**
	 * Whether Bricks' own Abilities API (Bricks 2.4+) is available and switched
	 * on. It covers what this integration deliberately leaves out: design-system
	 * writes, templates with conditions, popups and HTML/CSS import.
	 *
	 * @return array
	 */
	private function native_abilities_status(): array {
		$available = class_exists( '\Bricks\Abilities\Manager' ) && function_exists( 'wp_register_ability' );
		$enabled   = $available && \Bricks\Abilities\Manager::is_enabled();
		return array(
			'available'     => $available,
			'enabled'       => $enabled,
			'how_to_enable' => $available && ! $enabled ? 'An administrator turns it on in Bricks > Settings > AI.' : '',
			'use_for'       => array( 'bricks/create-color-palette', 'bricks/create-global-class', 'bricks/list-global-variables', 'bricks/create-theme-style', 'bricks/create-template', 'bricks/get-template-settings', 'bricks/list-popups', 'bricks/commit-site-foundation', 'bricks/commit-html-css-page-import' ),
		);
	}

	/**
	 * Bricks 2.4 stores custom CSS with the builder's %root% token already
	 * replaced by the element's persisted selector (its save pipeline does this,
	 * and the frontend no longer resolves the token). EMCP writes element data
	 * directly, so it resolves the token the same way: the custom CSS ID when
	 * set, otherwise #brxe-{id}; elements inside a component use .brxe-{id}.
	 * Older Bricks versions resolve %root% at render time and are left untouched.
	 *
	 * @param array  $elements Flat element tree.
	 * @param string $version  Bricks version; defaults to the installed one.
	 * @return array
	 */
	private function resolve_root_selectors( array $elements, string $version = '' ): array {
		if ( version_compare( '' === $version ? BRICKS_VERSION : $version, '2.4', '<' ) ) {
			return $elements;
		}
		foreach ( $elements as $i => $element ) {
			if ( empty( $element['settings'] ) || ! is_array( $element['settings'] ) ) {
				continue;
			}
			$css_id   = $element['settings']['_cssId'] ?? '';
			if ( ! empty( $element['parentComponent'] ) ) {
				$selector = '.brxe-' . $element['id'];
			} else {
				$selector = is_string( $css_id ) && '' !== $css_id ? '#' . $css_id : '#brxe-' . $element['id'];
			}
			foreach ( $element['settings'] as $key => $value ) {
				if ( '_cssCustom' === explode( ':', (string) $key, 2 )[0] && is_string( $value ) && false !== strpos( $value, '%root%' ) ) {
					$elements[ $i ]['settings'][ $key ] = str_replace( '%root%', $selector, $value );
				}
			}
		}
		return $elements;
	}

	private function element_schema( string $name ): array {
		if ( ! isset( \Bricks\Elements::$elements[ $name ] ) ) { return array(); }
		$schema = \Bricks\Elements::get_element( array( 'name' => $name ) );
		// Avoid returning class names/callables. Controls remain Bricks' native format.
		return json_decode( wp_json_encode( array_intersect_key( $schema, array_flip( array( 'name', 'label', 'category', 'controls', 'controlGroups', 'nestable', 'nestableChildren', 'deprecated' ) ) ) ), true ) ?: array();
	}

	private function list_posts( string $type, array $args ): array {
		$query = new WP_Query( array( 'post_type' => $type, 'post_status' => array( 'publish', 'draft', 'pending', 'private', 'future' ), 'posts_per_page' => max( 1, min( 100, (int) ( $args['per_page'] ?? 20 ) ) ), 'paged' => max( 1, (int) ( $args['page'] ?? 1 ) ), 'orderby' => 'ID', 'order' => 'DESC', 'perm' => 'editable' ) );
		$result = array();
		foreach ( $query->posts as $post ) {
			if ( ! $this->post_allowed( $post->ID ) ) { continue; }
			$result[] = array( 'post_id' => $post->ID, 'title' => $post->post_title, 'status' => $post->post_status, 'editor' => get_post_meta( $post->ID, BRICKS_DB_EDITOR_MODE, true ), 'template_type' => get_post_meta( $post->ID, BRICKS_DB_TEMPLATE_TYPE, true ) );
		}
		return array( 'items' => $result, 'page' => max( 1, (int) ( $args['page'] ?? 1 ) ), 'has_more' => $query->max_num_pages > (int) ( $args['page'] ?? 1 ) );
	}

	private function post_allowed( int $id ): bool {
		return $id > 0 && in_array( get_post_type( $id ), array( 'page', 'bricks_template' ), true )
			&& current_user_can( 'edit_post', $id ) && \Bricks\Capabilities::current_user_can_use_builder( $id );
	}

	private function area( int $id ): string {
		$type = 'bricks_template' === get_post_type( $id ) ? get_post_meta( $id, BRICKS_DB_TEMPLATE_TYPE, true ) : '';
		return in_array( $type, array( 'header', 'footer' ), true ) ? $type : 'content';
	}

	private function raw_elements( int $id, string $area ): array {
		$value = get_post_meta( $id, \Bricks\Database::get_bricks_data_key( $area ), true );
		return is_array( $value ) ? $value : array();
	}

	private function content_hash( int $id, string $area, array $elements ): string {
		return hash( 'sha256', wp_json_encode( array( $id, $area, $elements, get_post_meta( $id, BRICKS_DB_EDITOR_MODE, true ) ) ) );
	}

	private function get_page( int $id ) {
		if ( ! $this->post_allowed( $id ) ) { return new WP_Error( 'bricks_forbidden', 'Page not found or builder access denied.', array( 'status' => 403 ) ); }
		$area = $this->area( $id );
		$elements = $this->raw_elements( $id, $area );
		return array( 'post_id' => $id, 'area' => $area, 'elements' => $elements, 'content_hash' => $this->content_hash( $id, $area, $elements ), 'editor_url' => add_query_arg( 'bricks', 'run', get_permalink( $id ) ), 'url' => get_permalink( $id ) );
	}

	private function mutate( string $slug, array $args ) {
		$id = (int) ( $args['post_id'] ?? 0 );
		if ( ! $this->post_allowed( $id ) ) { return new WP_Error( 'bricks_forbidden', 'Page not found or builder access denied.' ); }
		if ( ! function_exists( 'wp_check_post_lock' ) ) { require_once ABSPATH . 'wp-admin/includes/post.php'; }
		if ( wp_check_post_lock( $id ) ) { return new WP_Error( 'page_locked', 'Another user is editing this page.' ); }
		$lock = 'emcp_bricks_lock_' . $id;
		if ( ! add_option( $lock, time(), '', false ) ) { return new WP_Error( 'page_locked', 'Another EMCP Bricks write is in progress. If a process crashed, an administrator must clear the stale emcp_bricks_lock_' . $id . ' option.' ); }
		try {
			$area = $this->area( $id );
			$old = $this->raw_elements( $id, $area );
			if ( ! is_string( $args['expected_hash'] ?? null ) || ! hash_equals( $this->content_hash( $id, $area, $old ), $args['expected_hash'] ) ) { return new WP_Error( 'stale_page', 'Page changed. Read it again and retry with the new content_hash.', array( 'status' => 409 ) ); }
			$validate = function( $name ) { return $this->element_schema( $name ); };
			// Refuse unsupported existing structures even on replacement, preventing accidental component loss.
			$valid = EMCP_Tools_Bricks_Tree::validate( $old, $validate );
			if ( is_wp_error( $valid ) ) { return $valid; }
			if ( 'set-page-elements' === $slug ) {
				$new = $args['elements'] ?? null;
				if ( ! is_array( $new ) ) { return new WP_Error( 'invalid_tree', 'Supply an elements array.' ); }
			} else {
				$new = EMCP_Tools_Bricks_Tree::edit( $old, str_replace( '-element', '', $slug ), $args );
				if ( is_wp_error( $new ) ) { return $new; }
			}
			$valid = EMCP_Tools_Bricks_Tree::validate( $new, $validate );
			if ( is_wp_error( $valid ) ) { return $valid; }
			$new = $this->normalize_settings( $new );
			$valid = $this->validate_settings( $new, $old );
			if ( is_wp_error( $valid ) ) { return $valid; }
			$new = $this->resolve_root_selectors( $new );
			// Bricks expects slashed input here, matching its AJAX save route.
			$slashed = wp_slash( $new );
			$checked = \Bricks\Helpers::security_check_elements_before_save( $slashed, $id, $area );
			if ( $checked !== $slashed ) { return new WP_Error( 'bricks_security_rejected', 'Bricks rejected part of this edit. No content was saved.' ); }
			if ( $old === $new ) { return $this->get_page( $id ); }
			$key = \Bricks\Database::get_bricks_data_key( $area );
			$old_mode = get_post_meta( $id, BRICKS_DB_EDITOR_MODE, true );
			// Preserve the previous element tree in a native revision before mutation.
			$force_revision = static function() { return false; };
			add_filter( 'wp_save_post_revision_check_for_changes', $force_revision );
			try { $revision = wp_save_post_revision( $id ); } finally { remove_filter( 'wp_save_post_revision_check_for_changes', $force_revision ); }
			if ( is_wp_error( $revision ) ) { return $revision; }
			if ( $revision ) { update_metadata( 'post', $revision, $key, wp_slash( $old ) ); }
			update_post_meta( $id, $key, $slashed );
			if ( $this->raw_elements( $id, $area ) !== $new ) {
				update_post_meta( $id, $key, wp_slash( $old ) );
				return new WP_Error( 'save_failed', 'Bricks did not store the requested content. Read the page before retrying.', array( 'restored' => $this->raw_elements( $id, $area ) === $old ) );
			}
			update_post_meta( $id, BRICKS_DB_EDITOR_MODE, 'bricks' );
			if ( 'bricks' !== get_post_meta( $id, BRICKS_DB_EDITOR_MODE, true ) ) {
				update_post_meta( $id, $key, wp_slash( $old ) );
				return new WP_Error( 'save_failed', 'Could not enable Bricks rendering; the previous tree was restored.' );
			}
			// Bricks normally has one save per request; MCP batches can save repeatedly.
			\Bricks\Assets::reset_duplication_tracking();
			$result = wp_update_post( array( 'ID' => $id ), true );
			if ( is_wp_error( $result ) ) {
				update_post_meta( $id, $key, wp_slash( $old ) );
				update_post_meta( $id, BRICKS_DB_EDITOR_MODE, $old_mode );
				return $result;
			}
			$response = $this->get_page( $id );
			$response['revision_id'] = $revision ?: null;
			if ( 'file' === \Bricks\Database::get_setting( 'cssLoading' ) && $new && ! is_file( \Bricks\Assets::$css_dir . '/post-' . $id . '.min.css' ) ) {
				$response['warnings'][] = 'Content saved, but Bricks did not generate its CSS file. Check upload-directory permissions and regenerate CSS in Bricks settings.';
			}
			return $response;
		} finally { delete_option( $lock ); }
	}

	/**
	 * Stores settings the way Bricks reads them. Bricks tests checkbox controls with isset(), so a
	 * stored false still switches the option on (for example slider pagination); remove the key instead,
	 * on every breakpoint and state. _importImage is the image Bricks' HTML/CSS converter found; like
	 * Bricks' own import, it becomes an external image when the element has none, then is dropped.
	 *
	 * @param array $elements Flat element tree.
	 * @return array
	 */
	private function normalize_settings( array $elements ): array {
		foreach ( $elements as &$element ) {
			if ( empty( $element['settings'] ) || ! is_array( $element['settings'] ) ) { continue; }
			$import = $element['settings']['_importImage']['url'] ?? '';
			if ( 'image' === ( $element['name'] ?? '' ) && empty( $element['settings']['image'] ) && is_string( $import ) && preg_match( '#^https?://[^/]#i', $import ) ) {
				$parts = explode( '/', explode( '#', explode( '?', $import )[0] )[0] );
				$element['settings']['image'] = array( 'url' => $import, 'external' => true, 'filename' => end( $parts ) );
			}
			unset( $element['settings']['_importImage'] );
			$controls = $this->element_schema( (string) ( $element['name'] ?? '' ) )['controls'] ?? array();
			foreach ( $element['settings'] as $key => $value ) {
				$base = explode( ':', (string) $key, 2 )[0];
				if ( 'checkbox' === ( $controls[ $base ]['type'] ?? '' ) && in_array( $value, array( false, 0, '', 'false', '0' ), true ) ) { unset( $element['settings'][ $key ] ); }
			}
		}
		unset( $element );
		return $elements;
	}

	/**
	 * Validates an _interactions list: each entry an object with string trigger
	 * and action. The javascript action (and any jsFunction) is executable code
	 * and stays an editor-only change. Bricks' frontend applies attribute actions
	 * with a raw setAttribute(), so event-handler attributes (on*) and script URLs
	 * are executable code too.
	 *
	 * @param mixed $value The _interactions setting.
	 * @return true|WP_Error
	 */
	private function validate_interactions( $value ) {
		if ( ! is_array( $value ) ) {
			return new WP_Error( 'invalid_setting_shape', '_interactions must be a list of interaction objects.' );
		}
		foreach ( $value as $interaction ) {
			if ( ! is_array( $interaction ) || ! is_string( $interaction['trigger'] ?? null ) || ! is_string( $interaction['action'] ?? null ) ) {
				return new WP_Error( 'invalid_setting_shape', 'Each interaction needs a string trigger and action, e.g. {"id":"abc123","trigger":"enterView","action":"startAnimation","animationType":"fadeInUp"}.' );
			}
			if ( 'javascript' === $interaction['action'] || isset( $interaction['jsFunction'] ) ) {
				return new WP_Error( 'unsupported_code', 'JavaScript interactions are executable code. Use the Bricks editor for them.' );
			}
			$attribute = strtolower( trim( (string) ( $interaction['actionAttributeKey'] ?? '' ) ) );
			$target    = strtolower( (string) preg_replace( '/[\x00-\x20]+/', '', (string) ( $interaction['actionAttributeValue'] ?? '' ) ) );
			if ( 0 === strpos( $attribute, 'on' ) || 'srcdoc' === $attribute || preg_match( '/^(?:javascript|vbscript|data):/', $target ) ) {
				return new WP_Error( 'unsupported_code', 'Interactions cannot set event-handler attributes (on*), srcdoc or script URLs. Use the Bricks editor for executable code.' );
			}
		}
		return true;
	}

	private function validate_settings( array $elements, array $old ) {
		$previous = array_column( $old, null, 'id' );
		$classes = array_column( (array) get_option( 'bricks_global_classes', array() ), 'id' );
		$breakpoints = array_column( \Bricks\Breakpoints::get_breakpoints(), 'key' );
		$pseudos = array_map( static function( $pseudo ) { return ltrim( (string) $pseudo, ':' ); }, (array) get_option( 'bricks_global_pseudo_classes', array( ':hover', ':active', ':focus' ) ) );
		foreach ( $elements as $element ) {
			$before = $previous[ $element['id'] ] ?? array();
			if ( ( $before['settings'] ?? null ) === $element['settings'] && ( $before['name'] ?? '' ) === $element['name'] ) { continue; }
			$encoded = wp_json_encode( $element['settings'] );
			if ( 'code' === $element['name'] || preg_match( '/"(?:executeCode|queryEditor|useQueryEditor|signature)"|\{echo:|<\?php/i', $encoded ) ) {
				return new WP_Error( 'unsupported_code', 'Use the Bricks editor for executable-code changes.' );
			}
			$controls = $this->element_schema( $element['name'] )['controls'] ?? array();
			foreach ( $element['settings'] as $key => $value ) {
				$parts = explode( ':', (string) $key, 2 );
				$base = $parts[0];
				if ( isset( $parts[1] ) && ! array_key_exists( $key, $before['settings'] ?? array() ) ) {
					$suffix = explode( ':', $parts[1], 2 );
					if ( ! in_array( $parts[1], $pseudos, true ) && ( ! in_array( $suffix[0], $breakpoints, true ) || ( isset( $suffix[1] ) && ! in_array( $suffix[1], $pseudos, true ) ) ) ) {
						return new WP_Error( 'invalid_responsive_setting', 'Unknown breakpoint or state in ' . $key . '. Read the site design system first.' );
					}
				}
				// Interactions and conditions are universal Bricks settings edited in their own
				// panels, so they are not in any element's control list. Accept them with a shape
				// check; JavaScript interactions stay out, like other executable code.
				if ( '_interactions' === $base ) {
					$check = $this->validate_interactions( $value );
					if ( is_wp_error( $check ) ) { return $check; }
					continue;
				}
				if ( '_conditions' === $base ) {
					if ( ! is_array( $value ) || array_filter( $value, static function( $group ) { return ! is_array( $group ); } ) ) {
						return new WP_Error( 'invalid_setting_shape', '_conditions must be a list of condition groups. Read the Bricks conditions reference.' );
					}
					continue;
				}
				// Global class references are set from the class picker, not a control; their
				// IDs are checked against the site's classes below.
				if ( '_cssGlobalClasses' === $key ) { continue; }
				// Keep Bricks internal structural settings (nested tabs/accordions) intact.
				if ( '_hidden' !== $base && ! isset( $controls[ $base ] ) && ! array_key_exists( $key, $before['settings'] ?? array() ) ) {
					return new WP_Error( 'unknown_setting', 'Unknown setting ' . $key . ' on ' . $element['name'] . '. Read bricks-get-element-schema first.' );
				}
				if ( in_array( $base, array( '_padding', '_margin', '_background', '_typography', '_border', '_boxShadow', '_gradient' ), true ) && ! is_array( $value ) ) { return new WP_Error( 'invalid_setting_shape', $key . ' requires an object, not a scalar.' ); }
				if ( '_typography' === $base && is_array( $value ) && array_intersect( array_keys( $value ), array( 'fontSize', 'fontWeight', 'fontFamily', 'lineHeight', 'letterSpacing', 'textAlign' ) ) ) { return new WP_Error( 'invalid_setting_shape', 'Typography uses CSS keys such as font-size and line-height.' ); }
			}
			$references = $element['settings']['_cssGlobalClasses'] ?? array();
			if ( ! is_array( $references ) ) { return new WP_Error( 'missing_global_class', 'Global classes must be a list of existing IDs.' ); }
			foreach ( $references as $reference ) {
				if ( ! is_string( $reference ) || ! in_array( $reference, $classes, true ) ) { return new WP_Error( 'missing_global_class', 'Every referenced global class ID must already exist on this site.' ); }
			}
		}
		return true;
	}
}
