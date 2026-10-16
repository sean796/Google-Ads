<?php
/** Standalone Thrive Architect integration using the native REST save pipeline. */
if (!defined('ABSPATH')) { exit; }
class EMCP_Tools_Thrive_Integration {
    public static function supported(): bool {
        return defined('TVE_VERSION') && version_compare(TVE_VERSION,'11.0','>=') && version_compare(TVE_VERSION,'11.1','<') && defined('TVE_TCB_ROOT_PATH') && class_exists('TCB_Editor_Ajax') && class_exists('DOMDocument') && is_file(TVE_TCB_ROOT_PATH.'inc/classes/rest/class-tcb-content-rest.php');
    }
    public static function definitions(): array {
        $id=array('type'=>'integer','minimum'=>1); $str=array('type'=>'string');
        $key=array('type'=>'string','pattern'=>'^(root|(?:id|data-css):[a-zA-Z0-9_-]+)$');
        $edit=array('post_id'=>$id,'expected_hash'=>array('type'=>'string','pattern'=>'^[a-f0-9]{64}$'));
        return array(
            'get-context'=>array('Discovery','Thrive Context','Read version, target site and supported scope.',false,array(),array()),
            'list-elements'=>array('Discovery','Thrive Elements','Discover installed native element identifiers and availability.',false,array(),array()),
            'get-element-schema'=>array('Discovery','Thrive Element Schema','Read native controls and starter HTML for an installed element.',false,array('type'=>$str),array('type')),
            'list-pages'=>array('Pages','Thrive Pages','List accessible pages and Architect state.',false,array('page'=>$id,'per_page'=>array('type'=>'integer','minimum'=>1,'maximum'=>100)),array()),
            'get-page'=>array('Pages','Read Thrive Page','Read native HTML, page CSS, settings, element keys and content_hash.',false,array('post_id'=>$id),array('post_id')),
            'create-page'=>array('Pages','Create Thrive Draft','Create a draft and initialize it through the native Architect save pipeline.',true,array('title'=>array('type'=>'string','minLength'=>1)),array('title')),
            'set-page-content'=>array('Pages','Save Thrive Content','Save native HTML and optional CSS with a current hash; preserve omitted page settings.',true,$edit+array('html'=>$str,'inline_css'=>$str,'custom_css'=>$str),array('post_id','expected_hash','html')),
            'add-element'=>array('Elements','Add Thrive Element','Append native element HTML to a container key (or root). Read its native schema first.',true,$edit+array('parent_key'=>$key,'html'=>$str),array('post_id','expected_hash','parent_key','html')),
            'replace-element'=>array('Elements','Replace Thrive Element','Replace one keyed element with native HTML; retain needed classes, keys and descendants.',true,$edit+array('element_key'=>$key,'html'=>$str),array('post_id','expected_hash','element_key','html')),
            'move-element'=>array('Elements','Move Thrive Element','Append an existing element to a container; reject cycles.',true,$edit+array('element_key'=>$key,'parent_key'=>$key),array('post_id','expected_hash','element_key','parent_key')),
            'remove-element'=>array('Elements','Remove Thrive Element','Remove one keyed element and its descendants.',true,$edit+array('element_key'=>$key),array('post_id','expected_hash','element_key')),
            'list-library'=>array('Library','Thrive Library','Discover accessible local content templates and symbols without changing shared content.',false,array('page'=>$id,'per_page'=>array('type'=>'integer','minimum'=>1,'maximum'=>100)),array()),
        );
    }
    public static function admin_categories(): array {
        $out=array(); foreach(self::definitions() as $slug=>$d) {
            $key='thrive_'.sanitize_key($d[0]);
            if(!isset($out[$key])) { $out[$key]=array('platform'=>'thrive','pro'=>true,'label'=>'Thrive Architect: '.$d[0],'tools'=>array()); }
            $out[$key]['tools']['emcp-tools/thrive-'.$slug]=array('label'=>$d[1],'description'=>$d[2],'badges'=>$d[3]?array('pro'):array('pro','read-only'),'available'=>self::supported(),'requires'=>array('name'=>'Thrive Architect 11.0.x','kind'=>'plugin'));
        } return $out;
    }
    public function get_ability_names(): array { return array_map(static fn($s)=>'emcp-tools/thrive-'.$s,array_keys(self::definitions())); }
    public function register(): void {
        foreach(self::definitions() as $slug=>$d) {
            emcp_tools_register_ability('emcp-tools/thrive-'.$slug,array('label'=>$d[1],'description'=>$d[2],'category'=>'emcp-tools',
                'input_schema'=>array('type'=>'object','properties'=>$d[4],'required'=>$d[5],'additionalProperties'=>false),
                'permission_callback'=>fn()=>$this->can_access(), 'execute_callback'=>fn($args=array())=>$this->execute($slug,is_array($args)?$args:array()),
                'meta'=>array('show_in_rest'=>true,'annotations'=>array('readonly'=>!$d[3],'destructive'=>$d[3]&&$slug!=='create-page','idempotent'=>!$d[3]))));
        }
    }
    private function can_access(): bool {
        return self::supported() && EMCP_Tools_Page_Builders::enabled('thrive') && current_user_can('edit_pages') && function_exists('tcb_has_external_cap') && tcb_has_external_cap();
    }
    private function permission(int $id) {
        if(!class_exists('TCB_Content_REST')) { require_once TVE_TCB_ROOT_PATH.'inc/classes/rest/class-tcb-content-rest.php'; }
        if(!in_array(get_post_type($id),array('page','post'),true) || in_array(get_post_status($id),array(false,'trash','auto-draft'),true)) { return new WP_Error('invalid_post','Choose an editable post or page.'); }
        $req=new WP_REST_Request('POST'); $req['id']=$id; return TCB_Content_REST::permission_check($req);
    }
    private function state(int $id) {
        $permission=$this->permission($id); if(is_wp_error($permission)) { return $permission; }
        $template=get_post_meta($id,'tve_landing_page',true); $suffix=$template?'_'.$template:'';
        $read=static fn($key)=>get_post_meta($id,$key.$suffix,true);
        $globals=$read('tve_globals');
        $payload=array('tve_content'=>(string)$read('tve_updated_post'),'inline_rules'=>(string)$read('tve_custom_css'),'tve_custom_css'=>(string)$read('tve_user_custom_css'),
            'tve_globals'=>is_array($globals)?$globals:array(),'custom_font_classes'=>is_array($globals)?($globals['font_cls']??array()):array(),
            'tve_landing_page'=>$template?:0,'page_events'=>tve_get_post_meta($id,'tve_page_events',true)?:array(),
            'has_icons'=>tve_get_post_meta($id,'thrive_icon_pack',true),'tve_has_masonry'=>tve_get_post_meta($id,'tve_has_masonry',true),
            'tve_has_typefocus'=>tve_get_post_meta($id,'tve_has_typefocus',true),'tve_has_wistia_popover'=>tve_get_post_meta($id,'tve_has_wistia_popover',true));
        // Scripts are preserved internally, never accepted from clients or exposed as settings.
        $payload['tve_global_scripts']=get_post_meta($id,'tve_global_scripts',true)?:array();
        $extra=array('header'=>get_post_meta($id,'_tve_header',true),'footer'=>get_post_meta($id,'_tve_footer',true),'enabled'=>get_post_meta($id,'tcb_editor_enabled',true),'ready'=>get_post_meta($id,'tcb2_ready',true));
        return array('post_id'=>$id,'status'=>get_post_status($id),'payload'=>$payload,'extra'=>$extra,'content_hash'=>hash('sha256',wp_json_encode(array($id,get_post_status($id),get_post_field('post_content',$id),$payload,$extra))));
    }
    private function page(int $id) {
        $s=$this->state($id); if(is_wp_error($s)) { return $s; } $p=$s['payload'];
        $elements=EMCP_Tools_Thrive_Content::elements($p['tve_content']);
        return array('post_id'=>$id,'status'=>$s['status'],'html'=>$p['tve_content'],'inline_css'=>$p['inline_rules'],'custom_css'=>$p['tve_custom_css'],
            'settings'=>array('landing_page'=>$p['tve_landing_page'],'globals'=>$p['tve_globals'],'header_id'=>$s['extra']['header'],'footer_id'=>$s['extra']['footer']),
            'elements'=>is_wp_error($elements)?array():$elements,'edit_error'=>is_wp_error($elements)?$elements->get_error_message():null,'content_hash'=>$s['content_hash'],
            'preview_url'=>get_preview_post_link($id),'url'=>get_permalink($id),'editor_url'=>tcb_get_editor_url($id));
    }
    private function schema(string $type) {
        $element=(new TCB_Elements())->get($type); if(!$element) { return new WP_Error('unknown_element','Unknown installed element.'); }
        $safe=in_array($type,array('text','section','contentbox','button','image','divider','columns','column'),true);
        $result=array('type'=>$type,'name'=>$element->name(),'identifier'=>$element->identifier(),'available'=>$element->is_available(),'authoring_supported'=>$safe,'controls'=>$element->own_components());
        if($safe) { $result['starter_html']=$element->layout(); }
        return $result;
    }
    public function execute(string $slug,array $args) {
        if(!$this->can_access()) { return new WP_Error('thrive_forbidden','Thrive integration or required capability is unavailable.'); }
        if($slug==='get-context') { return array('site_url'=>home_url(),'version'=>TVE_VERSION,'tested_version'=>'11.0.x','skill'=>'emcp-thrive','storage'=>'Native HTML and CSS in Thrive post meta; writes use TCB_Content_REST.','scope'=>'Architect pages and local library discovery. Thrive Theme Builder, forms, scripts and shared symbol editing are not included.'); }
        if($slug==='get-element-schema') { return $this->schema($args['type']); }
        if($slug==='list-elements') { $out=array(); foreach((new TCB_Elements())->get() as $type=>$el) { $out[]=array('type'=>$type,'name'=>$el->name(),'identifier'=>$el->identifier(),'available'=>$el->is_available()); } return array('elements'=>$out); }
        if($slug==='list-pages' || $slug==='list-library') {
            $types=$slug==='list-pages'?array('page','post'):array_values(array_filter(array('tcb_symbol','tcb_content_template'), 'post_type_exists'));
            if(!$types) { return array('items'=>array()); }
            $q=new WP_Query(array('post_type'=>$types,'post_status'=>array('publish','draft','private','pending'),'posts_per_page'=>$args['per_page']??30,'paged'=>$args['page']??1,'perm'=>'editable','orderby'=>'ID','order'=>'DESC'));
            $out=array(); foreach($q->posts as $p) { if(current_user_can('edit_post',$p->ID)) { $out[]=array('post_id'=>$p->ID,'title'=>$p->post_title,'type'=>$p->post_type,'status'=>$p->post_status,'architect_enabled'=>(bool)get_post_meta($p->ID,'tcb_editor_enabled',true)); } } return array('items'=>$out,'has_more'=>$q->max_num_pages>($args['page']??1));
        }
        if($slug==='get-page') { return $this->page($args['post_id']); }
        if($slug==='create-page') {
            $title=sanitize_text_field($args['title']); if(trim($title)==='' || !current_user_can('edit_pages') || !tve_is_post_type_editable('page')) { return new WP_Error('invalid_page','A title and an Architect-editable page type are required.'); }
            $id=wp_insert_post(wp_slash(array('post_type'=>'page','post_status'=>'draft','post_title'=>$title)),true); if(is_wp_error($id)) { return $id; }
            $s=$this->state($id); if(is_wp_error($s)) { return $s; }
            $result=$this->save('set-page-content',array('post_id'=>$id,'expected_hash'=>$s['content_hash'],'html'=>'<div class="thrv_wrapper thrv_text_element" data-css="emcp-intro"><p>Start building your page.</p></div>'));
            if(is_wp_error($result)) { $result->add_data(array('created_draft_id'=>$id)); } return $result;
        }
        if(isset(self::definitions()[$slug]) && self::definitions()[$slug][3]) { return $this->save($slug,$args); }
        return new WP_Error('unknown_tool','Unknown Thrive operation.');
    }
    private function save(string $slug,array $args) {
        $id=(int)$args['post_id']; $lock='emcp_thrive_lock_'.$id;
        $permission=$this->permission($id); if(is_wp_error($permission)) { return $permission; }
        if(!add_option($lock,time(),'',false)) { return new WP_Error('page_locked','Another EMCP save is in progress.'); }
        try {
            $s=$this->state($id); if(is_wp_error($s)) { return $s; }
            if(!hash_equals($s['content_hash'],$args['expected_hash'])) { return new WP_Error('stale_content','Page changed; read it again before saving.'); }
            if(!function_exists('wp_check_post_lock')) { require_once ABSPATH.'wp-admin/includes/post.php'; }
            if(wp_check_post_lock($id)) { return new WP_Error('page_locked','This page is being edited by another user.'); }
            $payload=$s['payload'];
            if(!$s['extra']['enabled'] && trim(get_post_field('post_content',$id))!=='') { return new WP_Error('unsupported_content','Existing non-Architect content must be migrated in the native editor first.'); }
            $valid=EMCP_Tools_Thrive_Content::parse($payload['tve_content']); if(is_wp_error($valid)) { return $valid; }
            $html=$slug==='set-page-content'?$args['html']:EMCP_Tools_Thrive_Content::edit($payload['tve_content'],$slug,$args);
            if(is_wp_error($html)) { return $html; }
            $valid=EMCP_Tools_Thrive_Content::parse($html); if(is_wp_error($valid)) { return $valid; }
            foreach(array('inline_css'=>'inline_rules','custom_css'=>'tve_custom_css') as $arg=>$field) {
                if(isset($args[$arg])) { $valid=EMCP_Tools_Thrive_Content::css($args[$arg]); if(is_wp_error($valid)) { return $valid; } $payload[$field]=$args[$arg]; }
            }
            // Native revision hooks include Thrive metadata. Keep a bounded explicit before-image too.
            $backups=get_post_meta($id,'_emcp_thrive_recovery',true); $backups=is_array($backups)?$backups:array();
            $backups[]=array('time'=>time(),'state'=>$s); update_post_meta($id,'_emcp_thrive_recovery',wp_slash(array_slice($backups,-5)));
            $payload['tve_content']=$html; $payload['tve_stripped_content']=wp_strip_all_tags($html);
            $req=new WP_REST_Request('POST'); $req->set_url_params(array('id'=>$id)); $req->set_body_params($payload);
            if(!$s['extra']['ready'] && trim(get_post_field('post_content',$id))==='' && $s['payload']['tve_content']==='') { tcb_post($id)->migrate(false); }
            // Thrive's landing-page pipeline temporarily replaces save_post hooks.
            $old_hook=isset($GLOBALS['wp_filter']['save_post'])?clone $GLOBALS['wp_filter']['save_post']:null;
            try { $response=TCB_Content_REST::save_content($req); }
            finally { if($old_hook!==null) { $GLOBALS['wp_filter']['save_post']=$old_hook; } else { unset($GLOBALS['wp_filter']['save_post']); } }
            if(is_wp_error($response)) { return $response; }
            if($response->get_status()>=400 || empty($response->get_data()['success'])) { return new WP_Error('save_failed','Native save failed; read the page before retrying.'); }
            $after=$this->page($id); if(is_wp_error($after)) { return $after; }
            if($after['html']!==$html || $after['status']!==$s['status']) { return new WP_Error('readback_mismatch','Native save changed content or status unexpectedly. Read back before retrying.'); }
            return $after;
        } catch(Throwable $e) { return new WP_Error('save_failed','Save did not complete; read back before retrying.'); }
        finally { delete_option($lock); }
    }
}
