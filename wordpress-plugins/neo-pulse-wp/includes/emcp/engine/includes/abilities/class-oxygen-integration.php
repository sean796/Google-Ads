<?php
/** Standalone Oxygen integration. Native APIs verified on 6.1.3. */
if ( ! defined( 'ABSPATH' ) ) { exit; }
require_once dirname(__DIR__).'/oxygen/class-oxygen-conditions.php';
require_once dirname(__DIR__).'/oxygen/class-oxygen-design.php';
require_once dirname(__DIR__).'/oxygen/class-oxygen-library.php';
require_once dirname(__DIR__).'/oxygen/trait-oxygen-library.php';

class EMCP_Tools_Oxygen_Integration {
	use EMCP_Tools_Oxygen_Library_Operations;
	private $schemas = array();
	private $native_write = false;
	private $reference_budget = 0;

	private function template_categories(): array {
		$controller = \Breakdance\Themeless\ThemelessController::getInstance();
		if (!$controller->templateTypeCategories) { bdox_run_action('breakdance_register_template_types_and_conditions'); }
		return $controller->templateTypeCategories;
	}

	private function manage_document(array $args) {
		$id=(int)$args['post_id'];
		if (!current_user_can('edit_theme_options') || !current_user_can('delete_post',$id)) { return new WP_Error('oxygen_forbidden','Document management requires edit_theme_options and delete_post.'); }
		$lock='emcp_oxygen_lock_'.$id;
		if (!add_option($lock,time(),'',false)) { return new WP_Error('post_locked','An EMCP save is in progress.'); }
		try {
			$state=$this->get_page($id,true); if (is_wp_error($state)) { return $state; }
			if (!hash_equals($state['content_hash'],$args['expected_hash'])) { return new WP_Error('stale_page','Read the document again.'); }
			if (!function_exists('wp_check_post_lock')) { require_once ABSPATH.'wp-admin/includes/post.php'; }
			if (wp_check_post_lock($id)) { return new WP_Error('post_locked','Document is being edited by another user.'); }
			switch ($args['operation']) {
				case 'rename':
					$title=sanitize_text_field($args['title'] ?? ''); if (!trim($title)) { return new WP_Error('invalid_title','Provide a title.'); }
					$result=wp_update_post(array('ID'=>$id,'post_title'=>$title),true); break;
				case 'trash': $result=wp_trash_post($id); break;
				case 'restore':
					if ($state['status']!=='trash') { return new WP_Error('invalid_status','Only trashed documents can be restored.'); }
					$result=wp_untrash_post($id); break;
				default: return new WP_Error('invalid_operation','Unknown document operation.');
			}
			if (!$result || is_wp_error($result)) { return new WP_Error('save_failed','Native document operation failed.'); }
			return $this->get_page($id,true);
		} finally { delete_option($lock); }
	}

	private function library_types(): array {
		return array('template'=>BREAKDANCE_TEMPLATE_POST_TYPE, 'header'=>BREAKDANCE_HEADER_POST_TYPE, 'footer'=>BREAKDANCE_FOOTER_POST_TYPE, 'component'=>BREAKDANCE_BLOCK_POST_TYPE);
	}

	private function create_library_item(array $args, ?array $tree = null, ?array $settings = null, $future = null) {
		$type = $this->library_types()[$args['kind'] ?? ''] ?? null;
		if (in_array($args['kind'] ?? '',array('page','post'),true)) { $type = $args['kind']; }
		$object = $type ? get_post_type_object($type) : null;
		if (!current_user_can('edit_theme_options') || !$object || !current_user_can($object->cap->create_posts) || (!in_array($type,array('page','post'),true) && !current_user_can($object->cap->publish_posts)) || !\Breakdance\Permissions\isPostTypeAllowed($type)) {
			return new WP_Error('oxygen_forbidden','Creating library items requires native post-type access, creation capability and edit_theme_options.');
		}
		$title = sanitize_text_field($args['title'] ?? '');
		if (!trim($title)) { return new WP_Error('invalid_title','Provide a title.'); }
		$tree = $tree ?? EMCP_Tools_Oxygen_Tree::blank();
		if (in_array($type, array(BREAKDANCE_TEMPLATE_POST_TYPE, BREAKDANCE_HEADER_POST_TYPE, BREAKDANCE_FOOTER_POST_TYPE), true)) {
			$settings = array_merge(array('type'=>'everywhere','priority'=>0,'ruleGroups'=>array()), $settings ?? array(), array('disabled'=>true));
		}
		$id = wp_insert_post(array('post_type'=>$type,'post_title'=>$title,'post_status'=>'draft'), true);
		if (is_wp_error($id)) { return $id; }
		try { \Breakdance\Data\save_document(wp_json_encode($tree), $settings === null ? null : wp_json_encode($settings), $future, null, null, null, null, null, null, $id); }
		catch (\Throwable $error) { return new WP_Error('save_failed','Library draft initialization failed. Inspect draft '.$id.' before retrying.'); }
		$state = $this->get_page($id);
		if (is_wp_error($state) || $state['tree'] !== $tree) { return new WP_Error('save_failed','Library draft readback failed. Inspect draft '.$id.'.'); }
		return $state;
	}

	private function copy_library_item(array $args) {
		$source = (int)($args['source_id'] ?? 0);
		$state = $this->get_page($source);
		if (is_wp_error($state)) { return $state; }
		if (!hash_equals($state['content_hash'], $args['expected_hash'] ?? '')) { return new WP_Error('stale_page','Source changed; read it again before copying.'); }
		// Reuse only trees supported by this adapter, retaining class IDs on this site.
		$valid = EMCP_Tools_Oxygen_Tree::validate($state['tree'], array($this,'element_schema'));
		if (is_wp_error($valid)) { return $valid; }
		$valid = $this->validate_components($state['tree']['root'], $source);
		if (is_wp_error($valid)) { return $valid; }
		$kind = get_post_type($source) === 'page' ? 'page' : array_search(get_post_type($source), $this->library_types(), true);
		return $this->create_library_item(array('kind'=>$kind,'title'=>$args['title']), $state['tree'], \Breakdance\Themeless\getTemplateSettingsFromDatabase($source), \Breakdance\Data\get_meta($source,'_oxygen_futurelayer_meta'));
	}

	private function update_template_settings(array $args) {
		$id = (int)($args['post_id'] ?? 0);
		if (!current_user_can('edit_theme_options') || !in_array(get_post_type($id), array(BREAKDANCE_TEMPLATE_POST_TYPE,BREAKDANCE_HEADER_POST_TYPE,BREAKDANCE_FOOTER_POST_TYPE), true)) { return new WP_Error('oxygen_forbidden','Choose a template, header or footer with edit_theme_options access.'); }
		$state = $this->get_page($id);
		if (is_wp_error($state)) { return $state; }
		$patch = $args['settings'] ?? array();
		if (!is_array($patch) || array_diff(array_keys($patch),array('type','priority','disabled','ruleGroups','parentId')) || (isset($patch['priority']) && !is_int($patch['priority'])) || (isset($patch['disabled']) && !is_bool($patch['disabled']))) { return new WP_Error('invalid_settings','Supported settings: type, priority, disabled, ruleGroups and parentId.'); }
		if (isset($patch['ruleGroups'])) { $valid = EMCP_Tools_Oxygen_Conditions::validate($patch['ruleGroups'], EMCP_Tools_Oxygen_Conditions::catalog()); if (is_wp_error($valid)) { return $valid; } }
		if (isset($patch['parentId'])) {
			$parent=$patch['parentId']; $seen=array($id);
			if (!is_int($parent) || $parent<0) { return new WP_Error('invalid_parent','Parent must be a nonnegative template ID.'); }
			while ($parent) {
				if (in_array($parent,$seen,true) || count($seen)>50 || get_post_type($parent)!==BREAKDANCE_TEMPLATE_POST_TYPE || !$this->post_allowed($parent)) { return new WP_Error('invalid_parent','Template parent is inaccessible or creates an inheritance cycle.'); }
				$seen[]=$parent; $parent=(int)(\Breakdance\Themeless\getTemplateSettingsFromDatabase($parent)['parentId'] ?? 0);
			}
		}
		if (isset($patch['type']) && (!is_string($patch['type']) || !\Breakdance\Themeless\findTemplateType($patch['type'], $this->template_categories()))) { return new WP_Error('invalid_settings','Choose a registered location from get-template-schema.'); }
		if (!function_exists('wp_check_post_lock')) { require_once ABSPATH.'wp-admin/includes/post.php'; }
		if (wp_check_post_lock($id)) { return new WP_Error('post_locked','Template is being edited by another user.'); }
		$lock = 'emcp_oxygen_lock_'.$id;
		if (!add_option($lock,time(),'',false)) { return new WP_Error('post_locked','An EMCP save is in progress.'); }
		try {
			$state = $this->get_page($id);
			if (is_wp_error($state)) { return $state; }
			if (!hash_equals($state['content_hash'],$args['expected_hash'] ?? '')) { return new WP_Error('stale_page','Template changed; read it again.'); }
			$settings = array_replace(\Breakdance\Themeless\getTemplateSettingsFromDatabase($id) ?: array(), $patch);
			add_filter('wp_save_post_revision_check_for_changes','__return_false');
			try { $revision = wp_save_post_revision($id); } finally { remove_filter('wp_save_post_revision_check_for_changes','__return_false'); }
			if (is_wp_error($revision) || !$revision) { return new WP_Error('revision_failed','Enable revisions before template editing.'); }
			update_metadata('post',$revision,'_emcp_oxygen_template_settings',\Breakdance\Themeless\getTemplateSettingsFromDatabase($id));
			try { \Breakdance\Data\save_document(wp_json_encode($state['tree']),wp_json_encode($settings),\Breakdance\Data\get_meta($id,'_oxygen_futurelayer_meta'),null,null,null,null,null,null,$id); }
			catch (\Throwable $error) { return new WP_Error('save_failed','Native template save failed. Prior revision: '.$revision); }
			if (\Breakdance\Themeless\getTemplateSettingsFromDatabase($id) !== $settings) { return new WP_Error('save_failed','Template settings readback failed. Prior revision: '.$revision); }
			return $this->get_page($id) + array('revision_id'=>$revision);
		} finally { delete_option($lock); }
	}

	private function design_hash(): string {
		return hash('sha256', wp_json_encode(array(\Breakdance\Data\get_global_option('oxy_selectors_json_string'), \Breakdance\Data\get_global_option('oxy_selectors_collections_json_string'))));
	}

	private function save_class(array $args) {
		if (!current_user_can('edit_theme_options')) { return new WP_Error('oxygen_forbidden','Class editing requires edit_theme_options.'); }
		if (!preg_match('/^[a-zA-Z_][a-zA-Z0-9_-]{0,99}$/D',$args['name']??'')) { return new WP_Error('invalid_class','Provide a CSS class name without the leading dot.'); }
		$valid=EMCP_Tools_Oxygen_Styles::validate($args['properties'],array_column(\Breakdance\Config\Breakpoints\get_breakpoints(),'id'));
		if (is_wp_error($valid)) { return $valid; }
		$lock='emcp_oxygen_design_lock';
		if (!add_option($lock,time(),'',false)) { return new WP_Error('design_locked','Another EMCP class save is in progress.'); }
		try {
			if (!hash_equals($this->design_hash(),$args['expected_hash']??'')) { return new WP_Error('stale_design','Classes changed; read the design system again.'); }
			$classes=\Breakdance\Data\get_global_option('oxy_selectors_json_string') ?: array();
			// Avoid warming Oxygen's static selector cache before its native save.
			$collections=\Breakdance\Data\get_global_option('oxy_selectors_collections_json_string') ?: array_values(array_unique(array_column($classes,'collection')));
			$id=$args['class_id']??''; $index=null;
			foreach ($classes as $key=>$class) {
				if ($class['id']===$id) { $index=$key; }
				if ($class['name']===$args['name'] && $class['id']!==$id) { return new WP_Error('duplicate_class','This class name already exists.'); }
			}
			if ($id && $index===null) { return new WP_Error('unknown_class','Class ID not found.'); }
			if ($index!==null && (($classes[$index]['type']??'')!=='class' || !empty($classes[$index]['locked']))) { return new WP_Error('class_locked','Only unlocked CSS classes can be edited.'); }
			$class=$index===null ? array('id'=>wp_generate_uuid4(),'name'=>$args['name'],'type'=>'class','collection'=>'EMCP','children'=>array(),'locked'=>false) : $classes[$index];
			$class['name']=$args['name']; $class['properties']=$args['properties'];
			if ($index===null) { $classes[]=$class; if (!in_array('EMCP',$collections,true)) { $collections[]='EMCP'; } } else { $classes[$index]=$class; }
			try { \Breakdance\BreakdanceOxygen\Selectors\saveSelectors(wp_json_encode(array('selectors'=>$classes,'collections'=>$collections))); }
			catch (\Throwable $error) { return new WP_Error('save_failed','Native class save failed; read the design system before retrying. Oxygen global revisions retain prior non-empty styles.'); }
			if (\Breakdance\Data\get_global_option('oxy_selectors_json_string')!==$classes) { return new WP_Error('save_failed','Class readback differs; read design system again.'); }
			return array('class'=>$class,'content_hash'=>$this->design_hash(),'scope'=>'Global: changes affect all elements using this class.');
		} finally { delete_option($lock); }
	}

	public static function supported(): bool {
		return defined( 'BREAKDANCE_MODE' ) && 'oxygen' === BREAKDANCE_MODE
			&& defined( '__BREAKDANCE_VERSION' ) && version_compare( __BREAKDANCE_VERSION, '6.1.3', '>=' ) && version_compare( __BREAKDANCE_VERSION, '6.2', '<' )
			&& function_exists( '\Breakdance\Data\save_document' ) && function_exists( '\Breakdance\Elements\get_elements_for_builder' );
	}

	public static function definitions(): array {
		$post = array( 'type' => 'integer', 'minimum' => 1 );
		$object = array( 'type' => 'object', 'additionalProperties' => true );
		$mutation = array( 'post_id' => $post, 'expected_hash' => array( 'type' => 'string', 'pattern' => '^[a-f0-9]{64}$', 'description' => 'Current content_hash from get-page; re-read after each edit.' ) );
		$parent = array( 'parent_id' => $post, 'position' => array( 'type' => 'integer', 'minimum' => 0 ) );
		$page = array( 'page' => $post, 'per_page' => array( 'type' => 'integer', 'minimum' => 1, 'maximum' => 100 ) );
		return array(
			'configure-design-library' => array('Design Library','Configure Oxygen Design Library','Update sharing flags, registered provider URLs or password using the current library hash. Passwords are never returned.',true,array('expected_hash'=>array('type'=>'string'),'settings'=>$object,'sets'=>array('type'=>'array','items'=>array('type'=>'string')),'password'=>array('type'=>'string')),array('expected_hash')),
			'browse-design-library' => array('Design Library','Browse Oxygen Design Set','Fetch the catalog of a registered provider through safe HTTP.',false,array('provider_index'=>array('type'=>'integer','minimum'=>0)),array('provider_index')),
			'export-design-library' => array('Design Library','Export Oxygen Designs','Export selected local IDs and dependencies, with variables and selectors. Set provider_index for a remote set and template_ids for remote library record IDs. Up to 100 documents.',false,array('post_ids'=>array('type'=>'array','minItems'=>1,'maxItems'=>100,'items'=>$post),'provider_index'=>array('type'=>'integer','minimum'=>0),'template_ids'=>array('type'=>'array','items'=>$post)),array('post_ids')),
			'import-design-library' => array('Design Library','Import Oxygen Designs','Import an exported bundle with dependency and design ID remapping. Pages are drafts and templates disabled. Pass both target design hashes and a unique request_id; replay returns the original result, including any partial failure and recovery revisions. Class selectors are namespaced; global selectors require separate explicit design editing.',true,array('bundle'=>$object,'bundle_hash'=>array('type'=>'string'),'variables_hash'=>array('type'=>'string'),'selectors_hash'=>array('type'=>'string'),'request_id'=>array('type'=>'string','minLength'=>1,'maxLength'=>100)),array('bundle','bundle_hash','variables_hash','selectors_hash','request_id')),
			'get-dynamic-schema' => array('Dynamic & Interactions','Oxygen Dynamic Data and Interactions','Discover installed dynamic fields and interaction triggers/actions with native controls.',false,array(),array()),
			'set-native-document' => array('Advanced Authoring','Save Native Oxygen Document','Save a complete native tree including code, loops, interactions and installed extension elements. Requires unfiltered_html and full builder access; native schemas, nesting, references and revisions are checked. Executable controls run with the site privileges.',true,$mutation+array('tree'=>$object),array('post_id','expected_hash','tree')),
			'manage-document' => array('Templates','Manage Oxygen Document','Rename, trash or restore a page or native library item. Requires the current document hash; get-page can read trashed records.',true,$mutation+array('operation'=>array('type'=>'string','enum'=>array('rename','trash','restore')),'title'=>array('type'=>'string')),array('post_id','expected_hash','operation')),
			'get-design-state' => array('Global Design','Oxygen Global Design State','Read an entire native design scope and its independent hash.',false,array('scope'=>array('type'=>'string','enum'=>array('variables','selectors','settings','preferences'))),array('scope')),
			'get-global-schema' => array('Global Design','Oxygen Global Design Schema','Read installed global controls, preferences and native selector CSS mapping.',false,array(),array()),
			'save-design-state' => array('Global Design','Save Oxygen Global Design','Replace a native global design scope, including collections. Requires current scope hash and unfiltered_html; affects all site usages and creates a complete prior-document revision.',true,array('scope'=>array('type'=>'string','enum'=>array('variables','selectors','settings','preferences')),'data'=>$object,'expected_hash'=>array('type'=>'string','pattern'=>'^[a-f0-9]{64}$')),array('scope','data','expected_hash')),
			'list-design-revisions' => array('Revisions','Oxygen Global Design Revisions','List complete prior design documents saved by EMCP, including collections and preferences.',false,array(),array()),
			'restore-design-revision' => array('Revisions','Restore Oxygen Global Design','Restore a complete prior global document with the current scope hash. Creates a new revision before restoration.',true,array('revision_id'=>array('type'=>'string'),'expected_hash'=>array('type'=>'string','pattern'=>'^[a-f0-9]{64}$')),array('revision_id','expected_hash')),
			'get-component-properties' => array('Components','Oxygen Component Properties','Read exposed properties and defaults from a component master.',false,array('component_id'=>$post),array('component_id')),
			'define-component-property' => array('Components','Define Oxygen Component Property','Expose a native control or child visibility on a component element. Replaces the definition with the same key.',true,$mutation+array('element_id'=>$post,'key'=>array('type'=>'string','pattern'=>'^[a-zA-Z][a-zA-Z0-9_-]{0,63}$'),'path'=>array('type'=>'string'),'label'=>array('type'=>'string'),'enabled'=>array('type'=>'boolean')),array('post_id','expected_hash','element_id','key','path','label')),
			'get-condition-values' => array('Templates','Oxygen Condition Values','Search native selectable values for a registered condition.',false,array('slug'=>array('type'=>'string'),'search'=>array('type'=>'string')),array('slug')),
			'list-revisions' => array('Revisions','Oxygen Page Revisions','Read native Oxygen revisions for an editable document.',false,array('post_id'=>$post),array('post_id')),
			'restore-revision' => array('Revisions','Restore Oxygen Page Revision','Restore a native tree revision belonging to this document. Optionally restore an EMCP template-settings snapshot; otherwise preserve current settings. Advanced trees require unfiltered_html.',true,$mutation+array('revision_id'=>$post,'restore_template_settings'=>array('type'=>'boolean')),array('post_id','expected_hash','revision_id')),
			'insert-component' => array('Components','Insert Oxygen Component','Insert an existing component with optional exposed-property overrides. Cyclic references are rejected.',true,$mutation + $parent + array('component_id'=>$post,'overrides'=>$object),array('post_id','expected_hash','component_id')),
			'get-template-schema' => array( 'Templates', 'Oxygen Template Locations', 'Read native template locations and supported settings for templates, headers and footers.', false, array(), array() ),
			'create-template' => array( 'Templates', 'Create Oxygen Template or Component', 'Create a native template, header, footer or component. Oxygen publishes library records; templates start disabled. Edit its tree with the page/element tools.', true, array( 'title' => array('type'=>'string','minLength'=>1), 'kind'=>array('type'=>'string','enum'=>array('template','header','footer','component')) ), array('title','kind') ),
			'update-template-settings' => array( 'Templates', 'Update Oxygen Template Settings', 'Patch location, priority, disabled state, ruleGroups and parentId using the page content_hash. Omitted settings are preserved. Enabling changes site-wide template matching.', true, $mutation + array('settings'=>array('type'=>'object','properties'=>array('type'=>array('type'=>'string'),'priority'=>array('type'=>'integer'),'disabled'=>array('type'=>'boolean'),'ruleGroups'=>array('type'=>'array','items'=>array('type'=>'array','items'=>$object)),'parentId'=>array('type'=>'integer','minimum'=>0)),'additionalProperties'=>false)), array('post_id','expected_hash','settings') ),
			'get-design-library' => array( 'Design Library', 'Oxygen Design Library', 'Read registered design-set URLs and local library settings without revealing passwords or fetching remote sets.', false, array(), array() ),
			'copy-library-item' => array( 'Design Library', 'Copy Local Oxygen Design', 'Copy a readable local page, template, header, footer or component. Pages become drafts; Oxygen publishes library records. Template matching is disabled on the copy. Classes and component references remain shared.', true, array('source_id'=>$post,'expected_hash'=>array('type'=>'string','pattern'=>'^[a-f0-9]{64}$'),'title'=>array('type'=>'string','minLength'=>1)), array('source_id','expected_hash','title') ),
			'get-context' => array( 'Discovery', 'Oxygen Context', 'Read installed version, permissions, breakpoints and supported workflow. Start here.', false, array(), array() ),
			'list-elements' => array( 'Discovery', 'List Oxygen Elements', 'List registered native element types and nesting rules. Use set-native-document for advanced elements.', false, array(), array() ),
			'get-element-schema' => array( 'Discovery', 'Oxygen Element Schema', 'Read native controls, defaults and nesting rules for an exact namespaced type, e.g. OxygenElements\\Text.', false, array( 'type' => array( 'type' => 'string' ) ), array( 'type' ) ),
			'list-pages' => array( 'Pages', 'List Oxygen Pages', 'List editable WordPress pages and their Oxygen status.', false, $page, array() ),
			'get-page' => array( 'Pages', 'Get Oxygen Page', 'Read the native nested tree and content_hash for a page or existing template.', false, array( 'post_id' => $post ), array( 'post_id' ) ),
			'create-page' => array( 'Pages', 'Create Oxygen Draft', 'Create an empty draft using the native Oxygen tree format.', true, array( 'title' => array( 'type' => 'string', 'minLength' => 1 ) ), array( 'title' ) ),
			'set-page-tree' => array( 'Pages', 'Set Oxygen Page Tree', 'Replace a page tree with root, _nextNodeId and nested nodes. Requires expected_hash; preserves template settings and page status.', true, $mutation + array( 'tree' => $object ), array( 'post_id', 'expected_hash', 'tree' ) ),
			'add-element' => array( 'Elements', 'Add Oxygen Element', 'Add a childless native element, allocating a unique ID. Read schema/defaults first; default parent is root 1.', true, $mutation + $parent + array( 'type' => array( 'type' => 'string' ), 'properties' => $object ), array( 'post_id', 'expected_hash', 'type' ) ),
			'update-element' => array( 'Elements', 'Update Oxygen Element', 'Recursively merge named property groups while replacing lists and preserving other properties. Optional label changes its friendly name.', true, $mutation + array( 'element_id' => $post, 'properties' => $object, 'label' => array( 'type' => 'string' ) ), array( 'post_id', 'expected_hash', 'element_id', 'properties' ) ),
			'move-element' => array( 'Elements', 'Move Oxygen Element', 'Move a node and descendants to a parent and sibling position; rejects cycles and invalid nesting.', true, $mutation + $parent + array( 'element_id' => $post ), array( 'post_id', 'expected_hash', 'element_id', 'parent_id' ) ),
			'remove-element' => array( 'Elements', 'Remove Oxygen Element', 'Remove a node and its entire subtree; root cannot be removed.', true, $mutation + array( 'element_id' => $post ), array( 'post_id', 'expected_hash', 'element_id' ) ),
			'get-style-schema' => array('Templates & Design', 'Oxygen Style Schema', 'Read supported native class style paths, value shapes and breakpoint layout.', false, array(), array()),
			'save-class' => array('Templates & Design', 'Save Oxygen Class', 'Create or replace one native CSS class. Requires full access, edit_theme_options and current design-system content_hash. Existing class changes affect every use.', true, array('expected_hash'=>array('type'=>'string','pattern'=>'^[a-f0-9]{64}$','description'=>'Current content_hash from oxygen-get-design-system, not the page hash.'), 'class_id'=>array('type'=>'string'), 'name'=>array('type'=>'string'), 'properties'=>$object), array('expected_hash','name','properties')),
			'list-templates' => array( 'Templates', 'List Oxygen Templates', 'List editable templates, headers, footers and components. Read get-page for native settings and tree.', false, $page, array() ),
			'get-design-system' => array( 'Templates & Design', 'Oxygen Design System', 'Read global settings, native classes, variables, collections and breakpoints, plus content_hash for save-class.', false, array(), array() ),
		);
	}

	public static function admin_categories(): array {
		$result = array();
		foreach ( self::definitions() as $slug => $def ) {
			$key = 'oxygen_' . sanitize_key( $def[0] );
			if ( ! isset( $result[ $key ] ) ) { $result[ $key ] = array( 'platform' => 'oxygen', 'pro' => true, 'label' => 'Oxygen: ' . $def[0], 'tools' => array() ); }
			$result[ $key ]['tools'][ 'emcp-tools/oxygen-' . $slug ] = array( 'label' => $def[1], 'description' => $def[2], 'badges' => $def[3] ? array( 'pro' ) : array( 'pro', 'read-only' ), 'available' => self::supported(), 'requires' => array( 'name' => 'Oxygen 6.1.3–6.1.x', 'kind' => 'plugin' ) );
		}
		return $result;
	}

	public function get_ability_names(): array { return array_map( static function( $slug ) { return 'emcp-tools/oxygen-' . $slug; }, array_keys( self::definitions() ) ); }

	public function register(): void {
		foreach ( self::definitions() as $slug => $def ) {
			emcp_tools_register_ability( 'emcp-tools/oxygen-' . $slug, array(
				'label' => $def[1], 'description' => $def[2], 'category' => 'emcp-tools',
				'input_schema' => array( 'type' => 'object', 'properties' => $def[4], 'required' => $def[5], 'additionalProperties' => false ),
				'permission_callback' => function() use ( $def ) { return $this->can_access( $def[3] ); },
				'execute_callback' => function( $args = array() ) use ( $slug ) { return $this->execute( $slug, is_array( $args ) ? $args : array() ); },
				'meta' => array( 'show_in_rest' => true, 'annotations' => array( 'readonly' => ! $def[3], 'destructive' => in_array( $slug, array( 'set-page-tree', 'set-native-document', 'remove-element', 'manage-document', 'save-design-state', 'restore-design-revision', 'restore-revision', 'update-template-settings', 'import-design-library' ), true ), 'idempotent' => ! $def[3] ) ),
			) );
		}
	}

	private function can_access( bool $write ): bool {
		return EMCP_Tools_Page_Builders::enabled( 'oxygen' ) && current_user_can( 'edit_posts' ) && \Breakdance\Permissions\hasMinimumPermission( $write ? 'full' : 'edit' );
	}

	private function types(): array {
		return array_values( array_filter( array( 'page', 'post', defined( 'BREAKDANCE_TEMPLATE_POST_TYPE' ) ? BREAKDANCE_TEMPLATE_POST_TYPE : '', defined( 'BREAKDANCE_HEADER_POST_TYPE' ) ? BREAKDANCE_HEADER_POST_TYPE : '', defined( 'BREAKDANCE_FOOTER_POST_TYPE' ) ? BREAKDANCE_FOOTER_POST_TYPE : '', defined( 'BREAKDANCE_BLOCK_POST_TYPE' ) ? BREAKDANCE_BLOCK_POST_TYPE : '' ) ) );
	}

	private function post_allowed( int $id, bool $allow_trash = false ): bool {
		$type = get_post_type( $id );
		return $id > 0 && in_array( $type, $this->types(), true ) && ! in_array( get_post_status( $id ), $allow_trash ? array('auto-draft') : array( 'trash', 'auto-draft' ), true ) && current_user_can( 'edit_post', $id ) && \Breakdance\Permissions\isPostTypeAllowed( $type );
	}

	public function element_schema( string $type ): array {
		if ( isset( $this->schemas[ $type ] ) ) { return $this->schemas[ $type ]; }
		if ( ! in_array( $type, \Breakdance\Elements\get_element_classnames(), true ) || ! in_array('oxygen', $type::availableIn(), true) ) { return array(); }
		$all = \Breakdance\Elements\get_elements_for_builder( array( $type ) );
		$this->schemas[ $type ] = isset( $all[0] ) ? array_intersect_key( $all[0], array_flip( array( 'name', 'slug', 'category', 'defaultProperties', 'defaultChildren', 'controls', 'nestingRule', 'htmlTag', 'settings' ) ) ) : array();
		if ( $this->schemas[ $type ] ) { $this->schemas[ $type ]['universalControls'] = \Breakdance\Elements\UniversalControls\getUniversalControls(); $this->schemas[$type]['oxygenMeta'] = array('classes'=>'Array of existing Oxygen class IDs; read get-design-system.', 'tag'=>'settings.advanced.tag, one of htmlTag.options or default.'); }
		return $this->schemas[ $type ];
	}

	public function execute( string $slug, array $args ) {
		$def = self::definitions()[ $slug ] ?? null;
		if ( ! $def || ! $this->can_access( $def[3] ) ) { return new WP_Error( 'oxygen_forbidden', 'Select the Oxygen integration and use an account with the required builder access.' ); }
		if ( in_array( 'emcp-tools/oxygen-' . $slug, (array) get_option( 'emcp_tools_disabled_tools', array() ), true ) ) { return new WP_Error( 'tool_disabled', 'This Oxygen tool is disabled in Neo EMCP.' ); }
		switch ( $slug ) {
			case 'configure-design-library': case 'browse-design-library': case 'export-design-library': case 'import-design-library':
				if (!current_user_can('edit_theme_options')) { return new WP_Error('oxygen_forbidden','Library access requires edit_theme_options.'); }
				if ($slug==='configure-design-library') { return EMCP_Tools_Oxygen_Library::configure($args); }
				if ($slug==='browse-design-library') { return EMCP_Tools_Oxygen_Library::request($args['provider_index'],'breakdance_get_design_set'); }
				if ($slug==='export-design-library') { return $this->export_library($args); }
				return $this->import_library($args);
			case 'get-dynamic-schema': return array('fields'=>\Breakdance\DynamicData\get_dynamic_fields_for_builder(null),'interactions'=>\Breakdance\Interactions\getInteractionsData());
			case 'set-native-document':
				if (!current_user_can('unfiltered_html')) { return new WP_Error('oxygen_forbidden','Native advanced authoring requires unfiltered_html.'); }
				$this->native_write=true;
				try { return $this->mutate('set-page-tree',$args); } finally { $this->native_write=false; }
			case 'manage-document': return $this->manage_document($args);
			case 'get-design-state': case 'get-global-schema': case 'save-design-state': case 'list-design-revisions': case 'restore-design-revision':
				if (!current_user_can('edit_theme_options')) { return new WP_Error('oxygen_forbidden','Global design access requires edit_theme_options.'); }
				if ($slug==='get-design-state') { return EMCP_Tools_Oxygen_Design::read($args['scope']); }
				if ($slug==='save-design-state') { return EMCP_Tools_Oxygen_Design::save($args['scope'],$args['data'],$args['expected_hash']); }
				if ($slug==='get-global-schema') { return array('settings_controls'=>\Breakdance\GlobalSettings\globalSettingsControlSections(),'preference_defaults'=>\Breakdance\Preferences\getDefaultPreferences(),'selector_css_mapping'=>\Breakdance\BreakdanceOxygen\Selectors\cssTemplate(),'variable_format'=>array('id'=>'unique string','cssVariableName'=>'CSS identifier without --','label'=>'string','type'=>'native variable type','value'=>'native responsive value','dynamicData'=>null,'collection'=>'existing collection'),'note'=>'Oxygen core disables Breakdance global settings; optional extensions may supply settings controls. Selectors include breakpoint-first properties and children with pseudo selectors.'); }
				$history=(array)get_option('emcp_oxygen_design_revisions',array());
				if ($slug==='list-design-revisions') { return array('revisions'=>array_map(static fn($id,$entry)=>array('id'=>$id,'scope'=>$entry['scope'],'time'=>$entry['time'],'author'=>$entry['author']),array_keys($history),array_values($history))); }
				$entry=$history[$args['revision_id']] ?? null;
				if (!$entry) { return new WP_Error('invalid_revision','Global revision not found.'); }
				return EMCP_Tools_Oxygen_Design::save($entry['scope'],$entry['data'],$args['expected_hash']);
			case 'get-component-properties': return $this->component_properties((int)$args['component_id']);
			case 'define-component-property': return $this->define_component_property($args);
			case 'get-condition-values':
				$condition=\Breakdance\Themeless\findCondition($args['slug'],EMCP_Tools_Oxygen_Conditions::catalog());
				if (!$condition) { return new WP_Error('invalid_condition','Unknown condition slug.'); }
				return \Breakdance\Themeless\getConditionValuesWithSearch($args['search'] ?? '',$args['slug']);
			case 'list-revisions':
				if (!$this->post_allowed((int)$args['post_id'])) { return new WP_Error('oxygen_forbidden','Document access denied.'); }
				return \Breakdance\Revisions\ajax_retrieve((int)$args['post_id']);
			case 'restore-revision':
				$revision_id=(int)$args['revision_id'];
				$revision=wp_get_post_revision($revision_id);
				if (!$revision || (int)$revision->post_parent!==(int)$args['post_id']) { return new WP_Error('invalid_revision','Revision must belong to this document.'); }
				$settings=null;
				if (!empty($args['restore_template_settings'])) { $settings=get_metadata('post',(int)$args['revision_id'],'_emcp_oxygen_template_settings',true); if (!is_array($settings)) { return new WP_Error('invalid_revision','This revision has no EMCP template-settings snapshot.'); } }
				$args['tree']=\Breakdance\Data\get_tree((int)$args['revision_id']);
				if (!$args['tree']) { return new WP_Error('invalid_revision','Revision has no native tree.'); }
				$this->native_write=current_user_can('unfiltered_html');
				try { $restored=$this->mutate('set-page-tree',$args); } finally { $this->native_write=false; }
				if (is_wp_error($restored) || empty($args['restore_template_settings'])) { return $restored; }
				$settings+=array('parentId'=>0,'ruleGroups'=>array());
				return $this->update_template_settings(array('post_id'=>$args['post_id'],'expected_hash'=>$restored['content_hash'],'settings'=>array_intersect_key($settings,array_flip(array('type','priority','disabled','ruleGroups','parentId')))));
			case 'insert-component':
				$block=$this->component_reference((int)$args['component_id'],$args['overrides'] ?? array());
				if (is_wp_error($block)) { return $block; }
				$args['type'] = 'OxygenElements\\Component';
				$args['properties'] = array('content'=>array('content'=>array('block'=>$block)));
				return $this->mutate('add-element',$args);
			case 'get-template-schema':
				return array('locations'=>\Breakdance\Themeless\convertPhpTemplateTypesCategoriesToJsTemplateTypeCategories($this->template_categories()), 'editable_settings'=>array('type','priority','disabled','ruleGroups','parentId'), 'conditions'=>EMCP_Tools_Oxygen_Conditions::schema());
			case 'create-template': return $this->create_library_item($args);
			case 'copy-library-item': return $this->copy_library_item($args);
			case 'update-template-settings': return $this->update_template_settings($args);
			case 'get-design-library':
				if (!current_user_can('edit_theme_options')) { return new WP_Error('oxygen_forbidden','Design Library access requires edit_theme_options.'); }
				return EMCP_Tools_Oxygen_Library::state();
			case 'get-context': return array( 'version' => __BREAKDANCE_VERSION, 'tested_version' => '6.1.3', 'can_write' => $this->can_access( true ), 'breakpoints' => \Breakdance\Config\Breakpoints\get_breakpoints(), 'post_types' => $this->types(), 'workflow' => array( 'Read element schemas and existing design settings.', 'Create draft or read page tree.', 'Pass current content_hash as expected_hash for each edit.', 'Read back and verify frontend/editor.' ), 'limitations' => array( 'Native advanced documents and global design writes require unfiltered_html and separately enabled tools.', 'Remote Design Library uses WordPress safe HTTP; provider media URLs remain external. Imports retain the current homepage and disable imported template matching.', 'Installed Oxygen 6.1.x schemas are the authority; optional extension features depend on their registered controls.' ) );
			case 'get-element-schema': return $this->element_schema( $args['type'] ?? '' ) ?: new WP_Error( 'unknown_element', 'Unknown registered element type.' );
			case 'list-elements':
				$out = array();
				foreach ( \Breakdance\Elements\get_element_classnames() as $type ) {
					if ( ! in_array( 'oxygen', $type::availableIn(), true ) ) { continue; }
					$out[] = array( 'type' => $type, 'name' => $type::name(), 'category' => $type::category(), 'nestingRule' => $type::nestingRule() );
				}
				return array( 'elements' => $out );
			case 'get-style-schema': return EMCP_Tools_Oxygen_Styles::schema();
			case 'save-class': return $this->save_class($args);
			case 'get-design-system':
				if ( ! current_user_can( 'edit_theme_options' ) ) { return new WP_Error( 'oxygen_forbidden', 'Design-system access requires edit_theme_options.' ); }
				return array( 'settings' => \Breakdance\Data\get_global_settings_array(), 'breakpoints' => \Breakdance\Config\Breakpoints\get_breakpoints(), 'classes' => \Breakdance\BreakdanceOxygen\Selectors\getOxySelectors(), 'collections' => \Breakdance\BreakdanceOxygen\Selectors\getOxySelectorsCollections(), 'content_hash' => $this->design_hash(), 'presets' => json_decode( (string) \Breakdance\Data\get_global_option( 'presets_json_string' ), true ), 'variables' => \Breakdance\Variables\getVariables() );
			case 'list-pages': case 'list-templates':
				$query = new WP_Query( array( 'post_type' => 'list-pages' === $slug ? 'page' : array_values( array_diff( $this->types(), array( 'page' ) ) ), 'post_status' => array( 'publish', 'draft', 'pending', 'private', 'future' ), 'posts_per_page' => min( 100, max( 1, (int) ( $args['per_page'] ?? 20 ) ) ), 'paged' => max( 1, (int) ( $args['page'] ?? 1 ) ), 'orderby' => 'ID', 'order' => 'DESC', 'perm' => 'editable' ) );
				$out = array();
				foreach ( $query->posts as $post ) { if ( $this->post_allowed( $post->ID ) ) { $out[] = array( 'post_id' => $post->ID, 'title' => $post->post_title, 'status' => $post->post_status, 'post_type' => $post->post_type, 'has_tree' => false !== \Breakdance\Data\get_tree( $post->ID ) ); } }
				return array( 'items' => $out, 'has_more' => $query->max_num_pages > (int) ( $args['page'] ?? 1 ) );
			case 'get-page': return $this->get_page( (int) ( $args['post_id'] ?? 0 ), true );
			case 'create-page':
				if ( ! current_user_can( 'edit_pages' ) || !\Breakdance\Permissions\isPostTypeAllowed('page') ) { return new WP_Error( 'oxygen_forbidden', 'Page editing and native page-type access are required.' ); }
				$title = sanitize_text_field( $args['title'] ?? '' );
				if ( '' === trim( $title ) ) { return new WP_Error( 'invalid_title', 'Provide a page title.' ); }
				$id = wp_insert_post( array( 'post_title' => $title, 'post_status' => 'draft', 'post_type' => 'page' ), true );
				if ( is_wp_error( $id ) ) { return $id; }
				try { \Breakdance\Data\save_document(wp_json_encode(EMCP_Tools_Oxygen_Tree::blank()), null, null, null, null, null, null, null, null, $id); } catch (\Throwable $error) { return new WP_Error('save_failed','Native draft initialization failed. Draft ID: '.$id); }
				return $this->get_page( $id );
			default: return $this->mutate( $slug, $args );
		}
	}

	private function get_page( int $id, bool $allow_trash = false ) {
		if ( ! $this->post_allowed( $id, $allow_trash ) ) { return new WP_Error( 'oxygen_forbidden', 'Page not found or builder access denied.' ); }
		$tree = \Breakdance\Data\get_tree( $id );
		if ( false === $tree && metadata_exists( 'post', $id, '_oxygen_data' ) ) { return new WP_Error( 'invalid_tree', 'Stored Oxygen data could not be decoded; refusing to replace it with an empty tree.' ); }
		return array( 'post_id' => $id, 'post_type'=>get_post_type($id), 'title'=>get_the_title($id), 'status'=>get_post_status($id), 'template_settings'=>\Breakdance\Themeless\getTemplateSettingsFromDatabase($id), 'tree' => $tree ?: EMCP_Tools_Oxygen_Tree::blank(), 'has_tree' => false !== $tree, 'content_hash' => hash( 'sha256', wp_json_encode( array( $id, get_the_title($id), get_post_status($id), get_post_meta( $id, '_oxygen_data', true ), get_post_meta( $id, '_oxygen_futurelayer_meta', true ), get_post_meta( $id, '_oxygen_template_settings', true ) ) ) ), 'editor_url' => \Breakdance\Admin\get_builder_loader_url( (string) $id ), 'url' => get_permalink( $id ), 'preview_url' => get_preview_post_link( $id ) );
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
				$before = EMCP_Tools_Oxygen_Tree::find( $old['root'], $node['id'] );
				$prior = $before && $before['data']['type'] === $node['data']['type'] ? $before['data']['properties'] : array();
				$paths = $this->property_paths( $this->element_schema( $node['data']['type'] ) );
				$paths['meta.friendlyName'] = array();
				$paths['meta.classes'] = array();
				$paths['meta.component.editableProperties'] = array();
				$schema = $this->element_schema($node['data']['type']);
				$paths['settings.advanced.tag'] = array();
				$properties = $node['data']['properties'];
				if (isset($properties['meta']['component']['editableProperties'])) {
					$valid=$this->validate_component_definitions($properties['meta']['component']['editableProperties'],$paths);
					if (is_wp_error($valid)) { return $valid; }
				}
				if (isset($properties['settings']['advanced']['tag']) && !in_array($properties['settings']['advanced']['tag'], array_merge(array($schema['htmlTag']['default']), $schema['htmlTag']['options'] ?: array()), true)) { return new WP_Error('invalid_tag','Tag is not supported by this element.'); }
				if (isset($properties['meta']['classes'])) {
					$ids = array_column(\Breakdance\BreakdanceOxygen\Selectors\getOxySelectors(), 'id');
					if (!is_array($properties['meta']['classes']) || !array_is_list($properties['meta']['classes'])) { return new WP_Error('invalid_class','Classes must be a list of existing Oxygen IDs.'); }
					foreach ($properties['meta']['classes'] as $class) { if (!is_string($class) || !in_array($class,$ids,true)) { return new WP_Error('invalid_class','Unknown Oxygen class ID.'); } }
				}
				$check = function( $value, $previous, string $path ) use ( &$check, $paths ) {
					if ( $value === $previous ) { return true; }
					if ( isset( $paths[ $path ] ) ) {
						if ( !$this->native_write && (preg_match( '/php|javascript|code|shortcode|actions|interactions/i', $path ) || preg_match( '/<\?php|\[(?:oxygen|breakdance)_dynamic|<script\b|\bon[a-z]+\s*=|javascript\s*:/i', wp_json_encode( $value ) ) )) { return new WP_Error( 'unsupported_code', 'Executable properties are not supported.' ); }
						if ($path==='settings.advanced.attributes') {
							if (!is_array($value)) { return new WP_Error('invalid_property','Attributes require a list.'); }
							foreach ($value as $attribute) { if (!is_array($attribute) || !preg_match('/^(?:aria-[a-z-]+|data-[a-z-]+|title|role|alt)$/D',$attribute['name']??'') || !is_scalar($attribute['value']??null)) { return new WP_Error('invalid_property','Only accessibility, data, title, role and alt attributes are supported.'); } }
						}
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
		$lock = 'emcp_oxygen_lock_' . $id;
		if ( ! add_option( $lock, time(), '', false ) ) { return new WP_Error( 'post_locked', 'An EMCP save is in progress. An administrator can clear the lock after a crashed request.' ); }
		try {
			$state = $this->get_page( $id );
			if ( is_wp_error( $state ) ) { return $state; }
			if ( ! hash_equals( $state['content_hash'], (string) ( $args['expected_hash'] ?? '' ) ) ) { return new WP_Error( 'stale_page', 'Page changed; re-read before editing.' ); }
			$result = EMCP_Tools_Oxygen_Tree::validate( $state['tree'], array( $this, 'element_schema' ), $this->native_write );
			if ( is_wp_error( $result ) ) { return $result; }
			$tree = 'set-page-tree' === $slug ? $args['tree'] : EMCP_Tools_Oxygen_Tree::edit( $state['tree'], $slug, $args );
			if ( is_wp_error( $tree ) ) { return $tree; }
			$result = EMCP_Tools_Oxygen_Tree::validate( $tree, array( $this, 'element_schema' ), $this->native_write );
			if ( is_wp_error( $result ) ) { return $result; }
			$valid_components = $this->validate_components($tree['root'], $id);
			if (is_wp_error($valid_components)) { return $valid_components; }
			$result = $this->validate_properties( $tree, $state['tree'] );
			if ( is_wp_error( $result ) ) { return $result; }
			if ( $tree === $state['tree'] ) { return $state; }
			add_filter( 'wp_save_post_revision_check_for_changes', '__return_false' );
			try { $revision = wp_save_post_revision( $id ); } finally { remove_filter( 'wp_save_post_revision_check_for_changes', '__return_false' ); }
			if ( is_wp_error( $revision ) || ! $revision ) { return new WP_Error( 'revision_failed', 'Enable page revisions before structural editing.' ); }
			$future = \Breakdance\Data\get_meta( $id, '_oxygen_futurelayer_meta' );
			try {
				\Breakdance\Render\DependencyCache::getInstance()->postDependencies = EMPTY_DEPENDENCIES;
				\Breakdance\Data\save_document( wp_json_encode( $tree ), null, $future, null, null, null, null, null, null, $id );
			} catch ( \Throwable $error ) {
				return new WP_Error( 'save_failed', 'Native save failed; re-read the page before retrying. Prior revision: ' . $revision );
			}
			$after = $this->get_page( $id );
			if ( is_wp_error( $after ) || $after['tree'] !== $tree ) { return new WP_Error( 'save_failed', 'Readback differs from the requested tree. Prior revision: ' . $revision ); }
			$after['revision_id'] = $revision;
			$after['css_cache'] = \Breakdance\Data\get_meta( $id, '_oxygen_css_file_paths_cache' );
			return $after;
		} finally { delete_option( $lock ); }
	}

	private function validate_component_definitions($definitions, array $paths) {
		if (!is_array($definitions) || !array_is_list($definitions) || count($definitions)>100) { return new WP_Error('invalid_component','Expected a list of at most 100 property definitions.'); }
		$seen=array();
		foreach ($definitions as $definition) {
			if (!is_array($definition) || array_diff(array_keys($definition),array('enabled','label','controlPath','propertyKey')) || !is_string($definition['propertyKey'] ?? null) || !preg_match('/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/D',$definition['propertyKey']) || !is_string($definition['controlPath'] ?? null) || !is_string($definition['label'] ?? null) || (isset($definition['enabled']) && !is_bool($definition['enabled']))) { return new WP_Error('invalid_component','Malformed property definition.'); }
			$path=$definition['controlPath'];
			if (isset($seen[$definition['propertyKey']]) || !isset($paths[$path]) || strpos($path,'meta.')===0 || ($paths[$path]['options']['type'] ?? '') === 'component_chooser') { return new WP_Error('invalid_component','Property keys must be unique and paths must reference native controls.'); }
			$seen[$definition['propertyKey']]=true;
		}
		return true;
	}

	private function component_properties(int $id) {
		if (get_post_type($id)!==BREAKDANCE_BLOCK_POST_TYPE || !$this->post_allowed($id)) { return new WP_Error('invalid_component','Choose an editable Oxygen component.'); }
		$state=$this->get_page($id); if (is_wp_error($state)) { return $state; }
		$properties=array();
		$walk=function($node) use (&$walk,&$properties) {
			foreach ($node['data']['properties']['meta']['component']['editableProperties'] ?? array() as $definition) {
				if (($definition['enabled'] ?? true)!==true) { continue; }
				$value=$node['data']['properties'];
				foreach (explode('.',$definition['controlPath']) as $key) { $value=is_array($value)?($value[$key] ?? null):null; }
				$properties[]=array_merge($definition,array('nodeId'=>$node['id'],'default'=>$value));
			}
			foreach ($node['children'] as $child) { $walk($child); }
		};
		$walk($state['tree']['root']);
		return array('component_id'=>$id,'properties'=>$properties,'content_hash'=>$state['content_hash']);
	}

	private function define_component_property(array $args) {
		$state=$this->get_page((int)$args['post_id']);
		if (is_wp_error($state)) { return $state; }
		if (get_post_type((int)$args['post_id'])!==BREAKDANCE_BLOCK_POST_TYPE) { return new WP_Error('invalid_component','Expose properties only on a component master.'); }
		$node=EMCP_Tools_Oxygen_Tree::find($state['tree']['root'],(int)$args['element_id']);
		if (!$node || $node['id']===1) { return new WP_Error('invalid_element','Choose a component element.'); }
		$definitions=$node['data']['properties']['meta']['component']['editableProperties'] ?? array();
		$definitions=array_values(array_filter($definitions,static fn($item)=>$item['propertyKey']!==$args['key']));
		$definitions[]=array('propertyKey'=>$args['key'],'controlPath'=>$args['path'],'label'=>$args['label'],'enabled'=>$args['enabled'] ?? true);
		$args['properties']=array('meta'=>array('component'=>array('editableProperties'=>$definitions)));
		return $this->mutate('update-element',$args);
	}

	private function component_reference(int $id, array $overrides) {
		$schema=$this->component_properties($id); if (is_wp_error($schema)) { return $schema; }
		$targets=array(); $available=array();
		foreach ($schema['properties'] as $property) {
			$available[$property['propertyKey']]=true;
			$targets[]=array('nodeId'=>$property['nodeId'],'propertyKey'=>$property['propertyKey'],'controlPath'=>$property['controlPath']);
		}
		if (array_diff(array_keys($overrides),array_keys($available))) { return new WP_Error('invalid_component','Override references an unexposed property.'); }
		return array('componentId'=>$id,'targets'=>$targets,'properties'=>$overrides);
	}

	/** Walk component references with ancestor IDs, allowing reuse but never cycles. */
	private function validate_components(array $node, int $document_id, array $ancestors=array()) {
		if (!$ancestors) { $ancestors=array($document_id); $this->reference_budget=0; }
		if (++$this->reference_budget>10000) { return new WP_Error('invalid_component','Expanded reference graph exceeds 10000 nodes.'); }
		if (($node['data']['type'] ?? '') === 'OxygenElements\\Component') {
			$block=$node['data']['properties']['content']['content']['block'] ?? array();
			if (!is_array($block) || !is_int($block['componentId'] ?? null) || !is_array($block['properties'] ?? array()) || !is_array($block['targets'] ?? array())) { return new WP_Error('invalid_component','Malformed component reference.'); }
			$id=$block['componentId'];
			if (in_array($id,$ancestors,true) || count($ancestors)>30) { return new WP_Error('invalid_component','Component cycle or nesting limit exceeded.'); }
			$expected=$this->component_reference($id,$block['properties'] ?? array());
			if (is_wp_error($expected)) { return $expected; }
			foreach ($block['targets'] ?? array() as $target) { if (!in_array($target,$expected['targets'],true)) { return new WP_Error('invalid_component','Component target is not exposed by the master.'); } }
			$source=\Breakdance\Data\get_tree($id);
			if (!$source) { return new WP_Error('invalid_component','Component has no native tree.'); }
			$valid=EMCP_Tools_Oxygen_Tree::validate($source,array($this,'element_schema'),$this->native_write); if (is_wp_error($valid)) { return $valid; }
			if (array_diff(array_keys($block['properties'] ?? array()),array_column($block['targets'] ?? array(),'propertyKey'))) { return new WP_Error('invalid_component','Each override must have an exposed target.'); }
			$effective=$source;
			foreach ($block['targets'] ?? array() as $target) {
				if (!array_key_exists($target['propertyKey'],$block['properties'] ?? array())) { continue; }
				$patch=$block['properties'][$target['propertyKey']];
				foreach (array_reverse(explode('.',$target['controlPath'])) as $part) { $patch=array($part=>$patch); }
				$effective=EMCP_Tools_Oxygen_Tree::edit($effective,'update-element',array('element_id'=>$target['nodeId'],'properties'=>$patch));
				if (is_wp_error($effective)) { return $effective; }
			}
			$valid=$this->validate_properties($effective,$source); if (is_wp_error($valid)) { return $valid; }
			$valid=$this->validate_components($effective['root'],$id,array_merge($ancestors,array($id))); if (is_wp_error($valid)) { return $valid; }
		}
		if (($node['data']['type'] ?? '') !== 'OxygenElements\\Component') {
			foreach (EMCP_Tools_Oxygen_Library::references($node['data']['properties'] ?? array()) as $id) {
				if (in_array($id,$ancestors,true) || count($ancestors)>30 || get_post_type($id)!==BREAKDANCE_BLOCK_POST_TYPE || !$this->post_allowed($id)) { return new WP_Error('invalid_component','Repeated-block reference is inaccessible, has the wrong type or creates a cycle.'); }
				$source=\Breakdance\Data\get_tree($id);
				if (!$source) { return new WP_Error('invalid_component','Referenced block has no native tree.'); }
				$valid=EMCP_Tools_Oxygen_Tree::validate($source,array($this,'element_schema'),$this->native_write); if (is_wp_error($valid)) { return $valid; }
				$valid=$this->validate_components($source['root'],$id,array_merge($ancestors,array($id))); if (is_wp_error($valid)) { return $valid; }
			}
		}
		foreach ($node['children'] as $child) { $valid=$this->validate_components($child,$document_id,$ancestors); if (is_wp_error($valid)) { return $valid; } }
		return true;
	}
}
