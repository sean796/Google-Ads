<?php
/** Standalone native Divi 5 pages, library, Theme Builder and Theme Options. */
if (!defined('ABSPATH')) { exit; }
use ET\Builder\Packages\ModuleLibrary\ModuleRegistration;
use ET\Builder\Framework\UserRole\UserRole;
use ET\Builder\Packages\GlobalData\GlobalData;
class EMCP_Tools_Divi_Integration
{
    public static function supported(): bool
    {
        return defined('ET_BUILDER_VERSION') && version_compare(ET_BUILDER_VERSION, '5.13', '>=') && version_compare(ET_BUILDER_VERSION, '5.14', '<') && function_exists('et_builder_d5_enabled') && et_builder_d5_enabled() && class_exists(ModuleRegistration::class) && strtolower(get_template()) === 'divi';
    }
    public static function definitions(): array
    {
        $id = array('type' => 'integer', 'minimum' => 1);
        $text = array('type' => 'string', 'minLength' => 1);
        $object = array('type' => 'object', 'additionalProperties' => true);
        $hash = array('type' => 'string', 'pattern' => '^[a-f0-9]{64}$');
        $post = array('post_id' => $id);
        $edit = $post + array('expected_hash' => $hash);
        $paging = array('page' => $id, 'per_page' => array('type' => 'integer', 'minimum' => 1, 'maximum' => 100));
        $global = array('expected_hash' => $hash);
        return array(
            'get-context' => array('Discovery','Divi Context','Read Divi version, permissions, scope and storage contract. Start here.',false,array(),array()),
            'list-elements' => array('Discovery','Divi Modules','Discover installed native modules and authoring support.',false,array(),array()),
            'get-element-schema' => array('Discovery','Divi Module Schema','Read installed module attributes, native defaults and allowed parents.',false,array('type'=>$text),array('type')),
            'list-pages' => array('Pages','Divi Pages','List accessible pages and their builder state.',false,$paging,array()),
            'get-page' => array('Pages','Read Divi Layout','Read a page, library item or Theme Builder layout as a native tree and content_hash.',false,$post,array('post_id')),
            'create-page' => array('Pages','Create Divi Draft','Create an empty Divi 5 draft page.',true,array('title'=>$text),array('title')),
            'set-page-tree' => array('Pages','Set Divi Layout','Replace a Divi 5 tree with a current expected_hash; preserves status and creates a revision.',true,$edit+array('tree'=>$object),array('post_id','expected_hash','tree')),
            'add-element' => array('Elements','Add Divi Module','Add a native module to a parent; read its schema first.',true,$edit+array('parent_id'=>$id,'position'=>array('type'=>'integer','minimum'=>0),'type'=>$text,'properties'=>$object),array('post_id','expected_hash','parent_id','type')),
            'update-element' => array('Elements','Update Divi Module','Merge attribute groups, replacing arrays; preserves unrelated attributes.',true,$edit+array('element_id'=>$id,'properties'=>$object),array('post_id','expected_hash','element_id','properties')),
            'move-element' => array('Elements','Move Divi Module','Move a module with descendants; refuses cycles and invalid nesting.',true,$edit+array('element_id'=>$id,'parent_id'=>$id,'position'=>array('type'=>'integer','minimum'=>0)),array('post_id','expected_hash','element_id','parent_id')),
            'remove-element' => array('Elements','Remove Divi Module','Remove a module and its descendants.',true,$edit+array('element_id'=>$id),array('post_id','expected_hash','element_id')),
            'list-library' => array('Library & Design','Divi Library','List accessible local Divi library layouts.',false,$paging,array()),
            'create-library-layout' => array('Library & Design','Create Library Layout','Create an unattached native library layout; edit with page tools.',true,array('title'=>$text),array('title')),
            'get-design-system' => array('Library & Design','Divi Design System','Read native global colors, variables, presets and breakpoint settings.',false,array(),array()),
            'get-theme-options' => array('Theme Options','Divi Theme Options','Read native option schema and safe values. Credentials and executable fields are redacted.',false,array(),array()),
            'update-theme-options' => array('Theme Options','Update Divi Theme Options','Apply validated partial settings, preserving unrelated options; expected_hash is settings_hash.',true,$global+array('settings'=>$object),array('expected_hash','settings')),
            'get-theme-builder' => array('Theme Builder','Divi Theme Builder','Read native templates, header/body/footer references, assignments and theme_builder_hash.',false,array(),array()),
            'list-template-conditions' => array('Theme Builder','Divi Template Conditions','Discover native assignment rules, including parameterized post/term conditions.',false,array(),array()),
            'create-theme-layout' => array('Theme Builder','Create Theme Layout','Create an unattached header, body or footer layout; edit with page tools.',true,array('title'=>$text,'kind'=>array('type'=>'string','enum'=>array('header','body','footer'))),array('title','kind')),
            'create-template' => array('Theme Builder','Create Divi Template','Create a disabled non-default template; attach layouts and assignments explicitly before enabling.',true,$global+array('title'=>$text),array('expected_hash','title')),
            'update-template' => array('Theme Builder','Update Divi Template','Partially update title, layout references, enabled state and use_on/exclude_from conditions using native storage.',true,$global+array('template_id'=>$id,'settings'=>$object),array('expected_hash','template_id','settings')),
            'remove-template' => array('Theme Builder','Remove Divi Template','Detach and trash one non-default template; shared layout posts are preserved.',true,$global+array('template_id'=>$id,'confirm'=>array('type'=>'boolean','const'=>true)),array('expected_hash','template_id','confirm')),
        );
    }
    public static function admin_categories(): array
    {
        $out = array();
        foreach (self::definitions() as $slug => $d) {
            $key = 'divi_' . sanitize_key($d[0]);
            if (!isset($out[$key])) { $out[$key] = array('platform'=>'divi','pro'=>true,'label'=>'Divi: '.$d[0],'tools'=>array()); }
            $out[$key]['tools']['emcp-tools/divi-'.$slug] = array('label'=>$d[1],'description'=>$d[2],'badges'=>$d[3]?array('pro'):array('pro','read-only'),'available'=>self::supported(),'requires'=>array('name'=>'Divi 5.13.x','kind'=>'theme'));
        }
        return $out;
    }
    public function get_ability_names(): array { return array_map(static fn($s) => 'emcp-tools/divi-'.$s, array_keys(self::definitions())); }
    public function register(): void
    {
        foreach (self::definitions() as $slug => $d) {
            emcp_tools_register_ability('emcp-tools/divi-'.$slug, array('label'=>$d[1],'description'=>$d[2],'category'=>'emcp-tools',
                'input_schema'=>array('type'=>'object','properties'=>$d[4],'required'=>$d[5],'additionalProperties'=>false),
                'permission_callback'=>fn()=>$this->can_access($slug),
                'execute_callback'=>fn($args=array())=>$this->execute($slug, is_array($args)?$args:array()),
                'meta'=>array('show_in_rest'=>true,'annotations'=>array('readonly'=>!$d[3],'destructive'=>in_array($slug,array('set-page-tree','remove-element','remove-template','update-template','update-theme-options'),true),'idempotent'=>!$d[3]))));
        }
    }
    private function can_access(string $slug): bool
    {
        if (!self::supported() || !EMCP_Tools_Page_Builders::enabled('divi') || !current_user_can('edit_pages') || !UserRole::can_current_user_use_visual_builder()) { return false; }
        if (in_array(self::definitions()[$slug][0] ?? '', array('Theme Builder','Theme Options'),true)) {
            return current_user_can('manage_options') && current_user_can('edit_theme_options') && current_user_can('edit_others_posts') && (!function_exists('et_pb_is_allowed') || et_pb_is_allowed('theme_builder'));
        }
        return true;
    }
    public static function module_schema(string $type): array
    {
        $meta = ModuleRegistration::get_core_module_metadata($type);
        if (!$meta) { return array(); }
        $all = ModuleRegistration::get_all_core_modules_metadata();
        $parents = array();
        foreach ($all as $m) { if (in_array($type, $m['childrenName'] ?? array(),true) || ($m['childModuleName'] ?? '') === $type) { $parents[] = $m['name']; } }
        if ($type === 'divi/section') { $parents = array('divi/placeholder'); }
        elseif ($type === 'divi/row') { $parents = array('divi/section','divi/column','divi/group'); }
        elseif ($type === 'divi/row-inner') { $parents = array('divi/column','divi/group'); }
        elseif ($type === 'divi/column') { $parents = array('divi/row'); }
        elseif ($type === 'divi/column-inner') { $parents = array('divi/row-inner'); }
        elseif (!$parents) { $parents = array('divi/column','divi/column-inner','divi/group'); }
        $blocked = array('divi/code','divi/shortcode','divi/signup','divi/contact-form','divi/contact-field','divi/payment-button','divi/global-layout','divi/canvas-portal');
        $role_allowed = !function_exists('et_pb_is_allowed') || et_pb_is_allowed($meta['d4Shortcode'] ?? $type);
        return array('type'=>$type,'name'=>$meta['title']??$type,'attributes'=>$meta['attributes']??array(),'defaults'=>ModuleRegistration::get_default_attrs($type),'allowed_parents'=>array_values(array_unique($parents)),'children'=>$meta['childrenName']??array(),'authoring_supported'=>$role_allowed && !in_array($type,$blocked,true), 'note'=>!$role_allowed?'Discovery only: disabled by the Divi role editor.':(in_array($type,$blocked,true)?'Discovery only: executable, external-action or shared-instance configuration.':'Native module; dependent plugins/content must be available.'));
    }
    private function post_allowed(int $id): bool
    {
        $type = get_post_type($id);
        if (!in_array($type,array('page','post','et_pb_layout','et_header_layout','et_body_layout','et_footer_layout'),true) || !current_user_can('edit_post',$id) || in_array(get_post_status($id),array(false,'trash','auto-draft'),true)) { return false; }
        if (str_starts_with($type,'et_')) { return $this->can_access('get-theme-builder'); }
        return true;
    }
    private function get_page(int $id)
    {
        if (!$this->post_allowed($id)) { return new WP_Error('divi_forbidden','Layout is unavailable or cannot be edited.'); }
        $content = get_post_field('post_content',$id);
        $tree = EMCP_Tools_Divi_Tree::parse($content);
        return array('post_id'=>$id,'status'=>get_post_status($id),'post_type'=>get_post_type($id),'tree'=>is_wp_error($tree)?null:$tree,'parse_error'=>is_wp_error($tree)?$tree->get_error_message():null,
            'content_hash'=>hash('sha256',wp_json_encode(array($id,$content,get_post_status($id),get_post_meta($id,'_et_pb_use_builder',true)))),'content'=>$content,
            'editor_url'=>add_query_arg(array('et_fb'=>1),get_permalink($id)),'preview_url'=>get_preview_post_link($id),'url'=>get_permalink($id));
    }
    public static function clear_cache($id = 'all'): void
    {
        if (class_exists('ET_Core_PageResource')) { ET_Core_PageResource::remove_static_resources($id,'all'); }
        if (function_exists('et_theme_builder_clear_wp_cache')) { et_theme_builder_clear_wp_cache($id); }
    }
    private function create(string $title, string $type='page')
    {
        if (!in_array($type,array('page','et_pb_layout','et_header_layout','et_body_layout','et_footer_layout'),true) || trim(sanitize_text_field($title)) === '') { return new WP_Error('invalid_post','Choose a title and supported layout type.'); }
        if ($type !== 'page' && !$this->can_access('get-theme-builder')) { return new WP_Error('divi_forbidden','Theme-management permission required.'); }
        $attrs = array('post_type'=>$type,'post_title'=>sanitize_text_field($title),'post_status'=>$type==='page'?'draft':'publish','post_content'=>'<!-- wp:divi/placeholder /-->');
        $id = str_starts_with($type,'et_') && $type !== 'et_pb_layout' ? et_theme_builder_insert_layout(wp_slash($attrs)) : wp_insert_post(wp_slash($attrs),true);
        if (is_wp_error($id)) { return $id; }
        et_builder_enable_for_post($id);
        if ($type === 'et_pb_layout') { wp_set_object_terms($id,'layout','layout_type'); }
        return $this->get_page($id);
    }
    private function list_posts(array $types, array $args): array
    {
        $q = new WP_Query(array('post_type'=>$types,'post_status'=>array('publish','draft','pending','private','future'),'posts_per_page'=>$args['per_page']??20,'paged'=>$args['page']??1,'orderby'=>'ID','order'=>'DESC','perm'=>'editable'));
        $out = array();
        foreach ($q->posts as $p) { if ($this->post_allowed($p->ID)) { $out[] = array('post_id'=>$p->ID,'title'=>$p->post_title,'status'=>$p->post_status,'type'=>$p->post_type,'builder_enabled'=>get_post_meta($p->ID,'_et_pb_use_builder',true)==='on'); } }
        return array('items'=>$out,'has_more'=>$q->max_num_pages>($args['page']??1));
    }
    public function execute(string $slug, array $args)
    {
        if (!$this->can_access($slug)) { return new WP_Error('divi_forbidden','Divi integration or required permission is unavailable.'); }
        switch ($slug) {
            case 'get-context': return array('version'=>ET_BUILDER_VERSION,'theme'=>get_template(),'site_url'=>home_url(),'can_write'=>current_user_can('edit_pages'),'can_manage_theme'=>$this->can_access('get-theme-builder'),'storage'=>'Divi 5 native blocks in post_content; root is divi/placeholder.','tested_version'=>'5.13.x','skill'=>'emcp-divi','capabilities'=>array('pages','library','theme-layouts','template-assignments','theme-options','design-discovery'));
            case 'list-elements':
                $out = array();
                foreach (ModuleRegistration::get_all_core_modules_metadata() as $m) { $s=self::module_schema($m['name']); $out[]=array_intersect_key($s,array_flip(array('type','name','allowed_parents','authoring_supported','note'))); }
                return array('elements'=>$out);
            case 'get-element-schema': return self::module_schema($args['type']) ?: new WP_Error('unknown_module','Unknown installed Divi module.');
            case 'list-pages': return $this->list_posts(array('page','post'),$args);
            case 'list-library': return $this->list_posts(array('et_pb_layout'),$args);
            case 'get-page': return $this->get_page($args['post_id']);
            case 'create-page': return $this->create($args['title']);
            case 'create-library-layout': return $this->create($args['title'],'et_pb_layout');
            case 'create-theme-layout': return $this->create($args['title'],'et_'.$args['kind'].'_layout');
            case 'get-theme-options': return EMCP_Tools_Divi_Settings::read();
            case 'update-theme-options': return EMCP_Tools_Divi_Settings::update($args['settings'],$args['expected_hash']);
            case 'get-design-system': return array('colors'=>GlobalData::get_global_colors(),'variables'=>GlobalData::get_global_variables(),'presets'=>get_option('et_divi_builder_global_presets_d5',array()),'breakpoints'=>get_option('et_divi_builder_breakpoints',array()),'default_breakpoints'=>array('desktop','tablet','phone'));
            case 'get-theme-builder': return EMCP_Tools_Divi_Theme_Builder::read();
            case 'list-template-conditions': return array('conditions'=>array_values(et_theme_builder_get_flat_template_settings_options()));
            case 'create-template': case 'update-template': case 'remove-template': return EMCP_Tools_Divi_Theme_Builder::mutate($slug,$args);
            case 'set-page-tree': case 'add-element': case 'update-element': case 'move-element': case 'remove-element': return $this->mutate($slug,$args);
        }
        return new WP_Error('invalid_operation','Unknown Divi operation.');
    }
    private function mutate(string $slug, array $args)
    {
        $id = (int) $args['post_id'];
        $state = $this->get_page($id);
        if (is_wp_error($state)) { return $state; }
        if (!function_exists('wp_check_post_lock')) { require_once ABSPATH.'wp-admin/includes/post.php'; }
        if (wp_check_post_lock($id)) { return new WP_Error('post_locked','The layout is being edited.'); }
        $lock = 'emcp_divi_page_lock_'.$id;
        if (!add_option($lock,time(),'',false)) { return new WP_Error('post_locked','A layout save is in progress.'); }
        $revision = null;
        try {
            $state = $this->get_page($id);
            if (is_wp_error($state)) { return $state; }
            if (!hash_equals($state['content_hash'],(string)$args['expected_hash'])) { return new WP_Error('stale_page','Layout changed; re-read before editing.'); }
            if (!$state['tree']) { return new WP_Error('unsupported_content',$state['parse_error']); }
            // Existing unsupported modules must not be silently removed during a replacement.
            $r = EMCP_Tools_Divi_Tree::validate($state['tree'],array(self::class,'module_schema'));
            if (is_wp_error($r)) { return $r; }
            if ($slug === 'add-element') { $args['properties'] = array_merge(array('attributes'=>array('builderVersion'=>ET_BUILDER_VERSION)),$args['properties']??array()); }
            $tree = $slug === 'set-page-tree' ? $args['tree'] : EMCP_Tools_Divi_Tree::edit($state['tree'],$slug,$args);
            if (is_wp_error($tree)) { return $tree; }
            $r = EMCP_Tools_Divi_Tree::validate($tree,array(self::class,'module_schema'));
            if (is_wp_error($r)) { return $r; }
            $stamp = function (&$n) use (&$stamp) { if ($n['id'] !== 1) { $n['data']['properties']['attributes']['builderVersion']=ET_BUILDER_VERSION; } foreach ($n['children'] as &$child) { $stamp($child); } };
            $stamp($tree['root']);
            $content = EMCP_Tools_Divi_Tree::serialize($tree);
            if (strlen($content)>2000000) { return new WP_Error('invalid_tree','Content exceeds 2 MB.'); }
            if ($content === $state['content']) { return $state; }
            add_filter('wp_save_post_revision_check_for_changes','__return_false');
            try { $revision=wp_save_post_revision($id); } finally { remove_filter('wp_save_post_revision_check_for_changes','__return_false'); }
            if (is_wp_error($revision) || !$revision) { return new WP_Error('revision_failed','Enable revisions before editing.'); }
            $r=wp_update_post(wp_slash(array('ID'=>$id,'post_content'=>$content)),true);
            if (is_wp_error($r)) { return $r; }
            et_builder_enable_for_post($id);
            self::clear_cache($id);
            $after=$this->get_page($id);
            if (is_wp_error($after) || $after['content']!==$content) { return new WP_Error('save_failed','Readback mismatch; re-read before retrying.',array('revision_id'=>$revision)); }
            $after['revision_id']=$revision;
            return $after;
        } catch (Throwable $e) { return new WP_Error('save_failed','Save did not complete. Re-read before retrying.',array('revision_id'=>$revision)); }
        finally { delete_option($lock); }
    }
}
