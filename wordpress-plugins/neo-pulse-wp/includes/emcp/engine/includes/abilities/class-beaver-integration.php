<?php
/** Standalone Beaver Builder integration using native staged node maps. */
if (!defined('ABSPATH')) { exit; }
class EMCP_Tools_Beaver_Integration {
    public static function supported(): bool {
        return defined('FL_BUILDER_VERSION') && version_compare(FL_BUILDER_VERSION,'2.11.1','>=') && version_compare(FL_BUILDER_VERSION,'2.12','<') && class_exists('FLBuilderModel');
    }
    public static function definitions(): array {
        $id=array('type'=>'integer','minimum'=>1); $s=array('type'=>'string'); $obj=array('type'=>'object','additionalProperties'=>true);
        $edit=array('post_id'=>$id,'expected_hash'=>array('type'=>'string','pattern'=>'^[a-f0-9]{64}$'));
        $page=array('page'=>$id,'per_page'=>array('type'=>'integer','minimum'=>1,'maximum'=>100));
        return array(
            'get-context'=>array('Discovery','Beaver Builder Context','Read version, supported scope, edition and optional Themer availability.',false,array(),array()),
            'list-modules'=>array('Discovery','Beaver Builder Modules','Discover installed module types and whether they support authoring.',false,array(),array()),
            'get-module-schema'=>array('Discovery','Beaver Module Schema','Read native module form fields and defaults.',false,array('type'=>$s),array('type')),
            'get-node-schema'=>array('Discovery','Beaver Layout Node Schema','Read row or column controls and defaults.',false,array('type'=>array('type'=>'string','enum'=>array('row','column'))),array('type')),
            'list-pages'=>array('Pages','Beaver Builder Pages','List accessible pages and native builder state.',false,$page,array()),
            'get-page'=>array('Pages','Read Beaver Page','Read staged and published native nodes, settings and hash without changing the draft.',false,array('post_id'=>$id),array('post_id')),
            'create-page'=>array('Pages','Create Beaver Draft','Create an empty WordPress draft with Beaver Builder enabled.',true,array('title'=>array('type'=>'string','minLength'=>1)),array('title')),
            'set-page-layout'=>array('Pages','Stage Beaver Layout','Validate and replace the native draft node map; does not publish.',true,$edit+array('nodes'=>$obj),array('post_id','expected_hash','nodes')),
            'add-node'=>array('Elements','Add Beaver Node','Add one native node with a unique ID and sibling position to the draft.',true,$edit+array('node'=>$obj),array('post_id','expected_hash','node')),
            'update-node'=>array('Elements','Update Beaver Node','Merge named settings into a draft node; nested setting values replace as a whole.',true,$edit+array('node_id'=>$s,'settings'=>$obj),array('post_id','expected_hash','node_id','settings')),
            'move-node'=>array('Elements','Move Beaver Node','Move a node and descendants to an allowed parent and unused sibling position.',true,$edit+array('node_id'=>$s,'parent_id'=>array('type'=>array('string','null')),'position'=>array('type'=>'integer','minimum'=>0)),array('post_id','expected_hash','node_id','parent_id','position')),
            'remove-node'=>array('Elements','Remove Beaver Node','Remove a node and descendants from the draft.',true,$edit+array('node_id'=>$s),array('post_id','expected_hash','node_id')),
            'get-page-styles'=>array('Styles','Beaver Page Styles','Read published and draft page-local CSS.',false,array('post_id'=>$id),array('post_id')),
            'set-page-styles'=>array('Styles','Stage Beaver Page CSS','Stage page-local CSS, preserving other layout settings.',true,$edit+array('css'=>$s),array('post_id','expected_hash','css')),
            'get-design-system'=>array('Styles','Beaver Design Settings','Read native responsive breakpoints and layout spacing defaults; no global writes.',false,array(),array()),
            'list-library'=>array('Library','Beaver Saved Library','Discover saved layouts, rows, columns, modules and optional Themer documents.',false,$page,array()),
            'get-library-item'=>array('Library','Read Beaver Library Item','Read a permitted local library document and whether it can be applied as a detached layout.',false,array('post_id'=>$id),array('post_id')),
            'save-template'=>array('Library','Save Beaver Layout Template','Create a local non-global full-layout template from the current draft.',true,$edit+array('name'=>array('type'=>'string','minLength'=>1)),array('post_id','expected_hash','name')),
            'apply-template'=>array('Library','Stage Beaver Saved Layout','Copy an accessible local full-layout template into the page draft; shared references are rejected.',true,$edit+array('template_id'=>$id),array('post_id','expected_hash','template_id')),
            'list-revisions'=>array('Recovery','Beaver Recovery Snapshots','Read the latest ten EMCP draft snapshots.',false,array('post_id'=>$id),array('post_id')),
            'restore-revision'=>array('Recovery','Restore Beaver Snapshot','Restore an EMCP content/CSS snapshot to the draft without publishing.',true,$edit+array('revision_id'=>$s),array('post_id','expected_hash','revision_id')),
            'publish-page'=>array('Publishing','Publish Beaver Page','Publish staged native nodes and settings, regenerate assets and publish the WordPress page.',true,$edit,array('post_id','expected_hash')),
        );
    }
    public static function admin_categories(): array {
        $out=array(); foreach(self::definitions() as $slug=>$d) {
            $key='beaver_'.sanitize_key($d[0]);
            if(!isset($out[$key])) { $out[$key]=array('platform'=>'beaver','pro'=>true,'label'=>'Beaver Builder: '.$d[0],'tools'=>array()); }
            $out[$key]['tools']['emcp-tools/beaver-'.$slug]=array('label'=>$d[1],'description'=>$d[2],'badges'=>$d[3]?array('pro'):array('pro','read-only'),'available'=>self::supported(),'requires'=>array('name'=>'Beaver Builder 2.11.1–2.11.x','kind'=>'plugin'));
        } return $out;
    }
    public function get_ability_names(): array { return array_map(static fn($s)=>'emcp-tools/beaver-'.$s,array_keys(self::definitions())); }
    public function register(): void {
        foreach(self::definitions() as $slug=>$d) {
            emcp_tools_register_ability('emcp-tools/beaver-'.$slug,array('label'=>$d[1],'description'=>$d[2],'category'=>'emcp-tools',
                'input_schema'=>array('type'=>'object','properties'=>$d[4],'required'=>$d[5],'additionalProperties'=>false),
                'permission_callback'=>fn()=>$this->can_access(),'execute_callback'=>fn($a=array())=>$this->execute($slug,is_array($a)?$a:array()),
                'meta'=>array('show_in_rest'=>true,'annotations'=>array('readonly'=>!$d[3],'destructive'=>$d[3]&&$slug!=='create-page','idempotent'=>!$d[3]))));
        }
    }
    private function can_access(): bool {
        if(self::supported()) {
            // WP-CLI/MCP selects its user after plugins can cache an anonymous role list.
            // Re-register the identical definition to invalidate only Beaver's request-local cache.
            $registered=FLBuilderUserAccess::get_registered_settings();
            if(isset($registered['builder_access'])) { FLBuilderUserAccess::register_setting('builder_access',$registered['builder_access']); }
        }
        return self::supported() && EMCP_Tools_Page_Builders::enabled('beaver') && current_user_can('edit_pages') && FLBuilderUserAccess::current_user_can('builder_access') && in_array('page',FLBuilderModel::get_post_types(),true);
    }
    private function allowed(int $id,bool $library=false): bool {
        return in_array(get_post_type($id),$library?array('fl-builder-template','fl-theme-layout'):array('page'),true) && !in_array(get_post_status($id),array(false,'trash','auto-draft'),true) && current_user_can('edit_post',$id);
    }
    private function json($value): array { return json_decode(wp_json_encode($value),true)?:array(); }
    private function state(int $id) {
        if(!$this->allowed($id)) { return new WP_Error('beaver_forbidden','Page access denied.'); }
        $published=$this->json(get_post_meta($id,'_fl_builder_data',true));
        $published_settings=$this->json(get_post_meta($id,'_fl_builder_data_settings',true));
        $draft=metadata_exists('post',$id,'_fl_builder_draft');
        $nodes=$draft?$this->json(get_post_meta($id,'_fl_builder_draft',true)):$published;
        $settings=metadata_exists('post',$id,'_fl_builder_draft_settings')?$this->json(get_post_meta($id,'_fl_builder_draft_settings',true)):$published_settings;
        $data=array('post_id'=>$id,'title'=>get_the_title($id),'status'=>get_post_status($id),'builder_enabled'=>(bool)get_post_meta($id,'_fl_builder_enabled',true),'nodes'=>$nodes,'settings'=>$settings,'published_nodes'=>$published,'published_settings'=>$published_settings,'has_draft'=>$draft);
        $data['content_hash']=hash('sha256',wp_json_encode($data)); $data['url']=get_permalink($id); $data['editor_url']=FLBuilderModel::get_edit_url($id);
        $valid=EMCP_Tools_Beaver_Document::validate($nodes,FLBuilderModel::get_enabled_modules()); $data['editable']=!is_wp_error($valid); $data['validation_error']=is_wp_error($valid)?$valid->get_error_message():null;
        return $data;
    }
    private function library(int $id) {
        if(!$this->allowed($id,true) || !current_user_can('edit_theme_options')) { return new WP_Error('beaver_forbidden','Library access requires edit_theme_options and document access.'); }
        $nodes=$this->json(get_post_meta($id,'_fl_builder_data',true)); $valid=EMCP_Tools_Beaver_Document::validate($nodes,FLBuilderModel::get_enabled_modules());
        return array('post_id'=>$id,'title'=>get_the_title($id),'post_type'=>get_post_type($id),'template_type'=>FLBuilderModel::get_user_template_type($id),'global'=>(bool)get_post_meta($id,'_fl_builder_template_global',true),'nodes'=>$nodes,'settings'=>$this->json(get_post_meta($id,'_fl_builder_data_settings',true)),'editable'=>!is_wp_error($valid));
    }
    /** Convert only native object boundaries; typography arrays stay arrays. */
    private function prepare(array $nodes): array {
        $prepared=array();
        foreach($nodes as $id=>$node) {
            $n=(object)$node;
            if($n->type==='column-group') { $n->settings=''; }
            else {
                $defaults=FLBuilderModel::get_node_defaults((object)array('type'=>$n->type,'settings'=>(object)$n->settings));
                $n->settings=(object)array_replace((array)$defaults,$n->settings);
                if($n->type==='module') {
                    if(!isset($n->version)) { $n->version=(int)FLBuilderModuleDeprecations::get_module_version($n->settings->type); }
                    $n->settings=FLBuilderModel::merge_nested_module_defaults($n->settings->type,$n->settings);
                    if($n->settings->type==='photo' && ($n->settings->photo_source??'library')==='library' && empty($n->settings->photo_src)) {
                        $photo=wp_get_attachment_image_src((int)($n->settings->photo??0),$n->settings->photo_size??'full');
                        if($photo) { $n->settings->photo_src=$photo[0]; }
                    }
                    $module=FLBuilderModel::create_module_instance($n->settings->type); $module->node=$id; $module->settings=$n->settings;
                    $n->settings=$module->update($n->settings);
                }
            }
            $prepared[$id]=$n;
        }
        return FLBuilderModel::clean_layout_data($prepared);
    }
    public function execute(string $slug,array $args) {
        if(!$this->can_access()) { return new WP_Error('beaver_forbidden','Select Beaver Builder and grant native builder access plus WordPress page editing.'); }
        $def=self::definitions()[$slug]??null; if(!$def) { return new WP_Error('unknown_tool','Unknown Beaver tool.'); }
        if($def[3] && (!current_user_can('unfiltered_html') || !FLBuilderUserAccess::current_user_can('unrestricted_editing'))) { return new WP_Error('beaver_forbidden','Writes require unfiltered_html and native unrestricted editing.'); }
        try {
            switch($slug) {
                case 'get-context': return array('site_url'=>home_url(),'version'=>FL_BUILDER_VERSION,'lite'=>defined('FL_BUILDER_LITE')?(bool)FL_BUILDER_LITE:null,'themer_available'=>class_exists('FLThemeBuilder'),'skill'=>'emcp-beaver','authoring_modules'=>EMCP_Tools_Beaver_Document::modules(),'scope'=>'Native row/column layouts, listed core modules, draft staging, page CSS, local full-layout template copies, explicit publication and EMCP recovery. Shared/dynamic nodes, Themer documents and global design settings are read-only.');
                case 'list-modules':
                    $out=array(); $enabled=FLBuilderModel::get_enabled_modules();
                    foreach(FLBuilderModel::$modules as $type=>$m) { $out[]=array('type'=>$type,'name'=>$m->name,'category'=>$m->category,'enabled'=>in_array($type,$enabled,true),'editable'=>in_array($type,$enabled,true)&&in_array($type,EMCP_Tools_Beaver_Document::modules(),true)); } return array('modules'=>$out);
                case 'get-module-schema':
                    $type=$args['type']; $m=FLBuilderModel::$modules[$type]??null;
                    if(!$m) { return new WP_Error('unknown_module','Module not installed.'); }
                    return array('type'=>$type,'fields'=>FLBuilderModel::get_settings_form_fields($m->form),'defaults'=>FLBuilderModel::get_module_defaults($type),'editable'=>in_array($type,EMCP_Tools_Beaver_Document::modules(),true)&&in_array($type,FLBuilderModel::get_enabled_modules(),true));
                case 'get-node-schema':
                    $type=$args['type']==='column'?'col':'row'; $form=FLBuilderModel::get_settings_form($type);
                    return array('fields'=>FLBuilderModel::get_settings_form_fields($form['tabs']),'defaults'=>$type==='row'?FLBuilderModel::get_row_defaults():FLBuilderModel::get_col_defaults());
                case 'get-page': return $this->state((int)$args['post_id']);
                case 'get-page-styles': case 'list-revisions':
                    $id=(int)$args['post_id']; $state=$this->state($id); if(is_wp_error($state)) { return $state; }
                    return $slug==='list-revisions'?array('revisions'=>get_post_meta($id,'_emcp_beaver_recovery',true)?:array()):array('draft_css'=>$state['settings']['css']??'','published_css'=>$state['published_settings']['css']??'');
                case 'get-design-system':
                    $g=(array)FLBuilderModel::get_global_settings(); return array_intersect_key($g,array_flip(array('row_width','row_width_unit','responsive_enabled','responsive_breakpoint','medium_breakpoint','large_breakpoint','row_margins','row_padding','column_margins','column_padding','module_margins')));
                case 'list-pages': case 'list-library':
                    $library=$slug==='list-library'; if($library && !current_user_can('edit_theme_options')) { return new WP_Error('beaver_forbidden','Library access requires edit_theme_options.'); }
                    $q=new WP_Query(array('post_type'=>$library?array('fl-builder-template','fl-theme-layout'):array('page'),'post_status'=>array('draft','publish','private','pending'),'posts_per_page'=>$args['per_page']??30,'paged'=>$args['page']??1,'perm'=>'editable','orderby'=>'ID','order'=>'DESC'));
                    $out=array(); foreach($q->posts as $p) { if($this->allowed($p->ID,$library)) { $out[]=array('post_id'=>$p->ID,'title'=>$p->post_title,'status'=>$p->post_status,'post_type'=>$p->post_type,'beaver'=>(bool)get_post_meta($p->ID,'_fl_builder_enabled',true),'template_type'=>$library?FLBuilderModel::get_user_template_type($p->ID):null); } } return array('items'=>$out,'has_more'=>$q->max_num_pages>($args['page']??1));
                case 'get-library-item': return $this->library((int)$args['post_id']);
                case 'create-page':
                    if(!current_user_can(get_post_type_object('page')->cap->create_posts)) { return new WP_Error('beaver_forbidden','Cannot create pages.'); }
                    $title=sanitize_text_field($args['title']); if(!trim($title)) { return new WP_Error('invalid_title','Provide a title.'); }
                    $id=wp_insert_post(wp_slash(array('post_title'=>$title,'post_type'=>'page','post_status'=>'draft')),true); if(is_wp_error($id)) { return $id; }
                    update_post_meta($id,'_fl_builder_enabled',true); FLBuilderModel::update_layout_data(array(),'draft',$id); return $this->state($id);
                default: return $this->write($slug,$args);
            }
        } catch(Throwable $e) { return new WP_Error('beaver_native_error','Beaver Builder could not complete the operation. Read the page and recovery snapshots before retrying.'); }
    }
    private static function canonical($value) {
        if(!is_array($value)) { return $value; }
        foreach($value as $key=>$item) { $value[$key]=self::canonical($item); }
        if(!array_is_list($value)) { ksort($value); }
        return $value;
    }
    private static function difference($a,$b,string $path='nodes'): string {
        if(is_array($a) && is_array($b)) {
            foreach($a as $k=>$v) { if(!array_key_exists($k,$b)) { return $path.'.'.$k.' missing'; } if($v!==$b[$k]) { return self::difference($v,$b[$k],$path.'.'.$k); } }
            return $path.' extra keys: '.implode(',',array_diff(array_keys($b),array_keys($a)));
        }
        return $path.' value differs ('.gettype($a).'/'.gettype($b).')';
    }
    private function write(string $slug,array $args) {
        $id=(int)$args['post_id']; if(!$this->allowed($id)) { return new WP_Error('beaver_forbidden','Page access denied.'); }
        if(!function_exists('wp_check_post_lock')) { require_once ABSPATH.'wp-admin/includes/post.php'; }
        $lock='emcp_beaver_lock_'.$id;
        if(wp_check_post_lock($id) || !add_option($lock,time(),'',false)) { return new WP_Error('page_locked','Another editor or EMCP save has the page locked.'); }
        // Native update caches slashed values; rendering in this same request must use the unslashed persisted data.
        $fresh=static function($data,$status,$post_id) use($id) { if((int)$post_id!==$id) { return $data; } $raw=get_post_meta($id,$status==='published'?'_fl_builder_data':'_fl_builder_draft',true); return is_array($raw)?$raw:array(); };
        add_filter('fl_builder_layout_data',$fresh,99,3);
        $old_post=$GLOBALS['post']??null; FLBuilderModel::set_post_id($id); $GLOBALS['post']=get_post($id);
        try {
            $before=$this->state($id); if(is_wp_error($before)) { return $before; }
            if(!hash_equals($before['content_hash'],$args['expected_hash']??'')) { return new WP_Error('stale_content','Page changed. Read it again before saving.'); }
            if(!$before['builder_enabled']) { return new WP_Error('invalid_page','Use a native Beaver Builder page.'); }
            $nodes=$before['nodes']; $settings=$before['settings'];
            $history=get_post_meta($id,'_emcp_beaver_recovery',true); $history=is_array($history)?$history:array();
            if($slug==='set-page-layout') { $nodes=$args['nodes']; }
            elseif(in_array($slug,array('add-node','update-node','move-node','remove-node'),true)) { $nodes=EMCP_Tools_Beaver_Document::edit($nodes,$slug,$args); if(is_wp_error($nodes)) { return $nodes; } }
            elseif($slug==='set-page-styles') { $settings['css']=$args['css']; }
            elseif($slug==='apply-template') {
                $t=$this->library((int)$args['template_id']); if(is_wp_error($t)) { return $t; }
                if($t['post_type']!=='fl-builder-template' || $t['template_type']!=='layout' || $t['global']) { return new WP_Error('invalid_template','Choose a local non-global full-layout template.'); }
                $nodes=$t['nodes']; $settings=$t['settings'];
            } elseif($slug==='restore-revision') {
                $found=null; foreach($history as $entry) { if($entry['revision_id']===$args['revision_id']) { $found=$entry; break; } }
                if(!$found) { return new WP_Error('invalid_revision','Choose a known EMCP snapshot.'); } $nodes=$found['nodes']; $settings=$found['settings'];
            } elseif(!in_array($slug,array('publish-page','save-template'),true)) { return new WP_Error('unknown_tool','Unknown write operation.'); }
            if($slug==='publish-page' && !current_user_can(get_post_type_object('page')->cap->publish_posts)) { return new WP_Error('beaver_forbidden','Publishing requires publish_pages.'); }
            $valid=EMCP_Tools_Beaver_Document::validate($nodes,FLBuilderModel::get_enabled_modules()); if(is_wp_error($valid)) { return $valid; }
            if(strlen($settings['css']??'')>200000 || str_contains($settings['css']??'','<')) { return new WP_Error('invalid_css','Use at most 200 KB of CSS without HTML tags.'); }
            if($slug==='save-template') {
                $type=get_post_type_object('fl-builder-template'); $name=sanitize_text_field($args['name']);
                if(!$type || !current_user_can('edit_theme_options') || !current_user_can($type->cap->create_posts) || !current_user_can($type->cap->publish_posts)) { return new WP_Error('beaver_forbidden','Template creation requires native template creation/publication and theme editing permissions.'); }
                if(!trim($name)) { return new WP_Error('invalid_title','Provide a template name.'); }
                $source=static fn()=>$before['has_draft']?'draft':'published'; add_filter('fl_builder_node_status',$source);
                try { $created=FLBuilderModel::save_user_template(array('name'=>$name,'category'=>'uncategorized')); } finally { remove_filter('fl_builder_node_status',$source); }
                return $this->library((int)$created['postId']);
            }
            $history[]=array('revision_id'=>wp_generate_uuid4(),'time'=>time(),'nodes'=>$before['nodes'],'settings'=>$before['settings']);
            update_post_meta($id,'_emcp_beaver_recovery',wp_slash(array_slice($history,-10)));
            $prepared=$this->prepare($nodes); $expected=$this->json($prepared);
            FLBuilderModel::update_layout_data($prepared,'draft',$id);
            // Native updater merges settings; delete only this draft-settings record to restore exact snapshots.
            FLBuilderModel::delete_layout_settings('draft',$id); FLBuilderModel::update_layout_settings($settings,'draft',$id);
            FLBuilderModel::delete_all_asset_cache($id);
            if($slug==='publish-page') {
                // Native save renders fallback content using draft nodes, then copies data/settings to published.
                $draft=static fn()=>'draft'; add_filter('fl_builder_node_status',$draft);
                try { FLBuilderModel::save_layout(false); } finally { remove_filter('fl_builder_node_status',$draft); }
                $r=wp_update_post(array('ID'=>$id,'post_status'=>'publish'),true); if(is_wp_error($r)) { return $r; }
                // save_layout already rendered assets. Rendering twice in one request would
                // hit Beaver's CSS de-duplication cache and omit module/custom styles.
            }
            clean_post_cache($id); $after=$this->state($id);
            if(is_wp_error($after) || self::canonical($after['nodes'])!==self::canonical($expected) || ($after['settings']['css']??'')!==($settings['css']??'')) { return new WP_Error('readback_failed','Native readback differed: '.self::difference($expected,is_wp_error($after)?array():$after['nodes']).'. Inspect recovery snapshots before retrying.'); }
            if($slug!=='publish-page' && ($after['published_nodes']!==$before['published_nodes'] || $after['published_settings']!==$before['published_settings'] || $after['status']!==$before['status'])) { return new WP_Error('readback_failed','Staged save unexpectedly changed published content.'); }
            return $after;
        } finally { remove_filter('fl_builder_layout_data',$fresh,99); FLBuilderModel::reset_post_id(); $GLOBALS['post']=$old_post; delete_option($lock); }
    }
}
