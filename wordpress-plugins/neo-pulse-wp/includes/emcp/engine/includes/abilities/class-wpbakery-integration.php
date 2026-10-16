<?php
/** Standalone WPBakery Page Builder integration. */
if (!defined('ABSPATH')) { exit; }
class EMCP_Tools_WPBakery_Integration {
    public static function supported(): bool {
        return defined('WPB_VC_VERSION') && version_compare(WPB_VC_VERSION,'9.0.1','>=') && version_compare(WPB_VC_VERSION,'9.1','<') && class_exists('WPBMap') && function_exists('wpbakery');
    }
    public static function definitions(): array {
        $id=array('type'=>'integer','minimum'=>1); $s=array('type'=>'string');
        $edit=array('post_id'=>$id,'expected_hash'=>array('type'=>'string','pattern'=>'^[a-f0-9]{64}$'));
        $page=array('page'=>$id,'per_page'=>array('type'=>'integer','minimum'=>1,'maximum'=>100));
        $template=array('template_id'=>$s,'source'=>array('type'=>'string','enum'=>array('user','default')));
        return array(
            'get-context'=>array('Discovery','WPBakery Context','Read installed version, permissions and authoring scope.',false,array(),array()),
            'list-elements'=>array('Discovery','WPBakery Elements','List installed elements, native access and supported authoring types.',false,array(),array()),
            'get-element-schema'=>array('Discovery','WPBakery Element Schema','Read native element controls, defaults and nesting rules.',false,array('type'=>$s),array('type')),
            'list-pages'=>array('Pages','WPBakery Pages','List accessible pages and their native editor state.',false,$page,array()),
            'get-page'=>array('Pages','Read WPBakery Page','Read native shortcodes, page CSS, editor links and current hash.',false,array('post_id'=>$id),array('post_id')),
            'create-page'=>array('Pages','Create WPBakery Draft','Create an empty native WPBakery draft.',true,array('title'=>array('type'=>'string','minLength'=>1)),array('title')),
            'set-page-content'=>array('Pages','Save WPBakery Layout','Replace native shortcodes after validating the verified core subset; preserves publication status.',true,$edit+array('content'=>$s),array('post_id','expected_hash','content')),
            'replace-fragment'=>array('Elements','Edit WPBakery Fragment','Replace one unique exact shortcode fragment, validating the entire resulting layout.',true,$edit+array('find'=>array('type'=>'string','minLength'=>1),'replacement'=>$s),array('post_id','expected_hash','find','replacement')),
            'get-page-styles'=>array('Styles','WPBakery Page Styles','Read custom page CSS and generated element CSS.',false,array('post_id'=>$id),array('post_id')),
            'set-page-styles'=>array('Styles','Save WPBakery Page CSS','Replace page-local CSS; rejects style closing tags.',true,$edit+array('css'=>$s),array('post_id','expected_hash','css')),
            'list-templates'=>array('Templates','WPBakery Templates','List native saved and default templates; no remote library downloads.',false,array(),array()),
            'get-template'=>array('Templates','Read WPBakery Template','Read one native saved or default template and authoring compatibility.',false,$template,array('template_id','source')),
            'apply-template'=>array('Templates','Apply WPBakery Template','Replace page content with a validated native local/default template.',true,$edit+$template,array('post_id','expected_hash','template_id','source')),
            'get-settings'=>array('Settings','WPBakery Settings','Read enabled post types and native editor/template access; no global changes.',false,array(),array()),
            'list-revisions'=>array('Recovery','WPBakery Recovery Snapshots','Read the latest 10 EMCP snapshots including content and page CSS.',false,array('post_id'=>$id),array('post_id')),
            'restore-revision'=>array('Recovery','Restore WPBakery Snapshot','Restore content and page CSS from an EMCP snapshot; preserves publication status.',true,$edit+array('revision_id'=>$s),array('post_id','expected_hash','revision_id')),
            'publish-page'=>array('Pages','Publish WPBakery Page','Explicitly publish a validated WPBakery page.',true,$edit,array('post_id','expected_hash')),
        );
    }
    public static function admin_categories(): array {
        $out=array(); foreach(self::definitions() as $slug=>$d) {
            $key='wpbakery_'.sanitize_key($d[0]);
            if(!isset($out[$key])) { $out[$key]=array('platform'=>'wpbakery','pro'=>true,'label'=>'WPBakery: '.$d[0],'tools'=>array()); }
            $out[$key]['tools']['emcp-tools/wpbakery-'.$slug]=array('label'=>$d[1],'description'=>$d[2],'badges'=>$d[3]?array('pro'):array('pro','read-only'),'available'=>self::supported(),'requires'=>array('name'=>'WPBakery 9.0.1–9.0.x','kind'=>'plugin'));
        } return $out;
    }
    public function get_ability_names(): array { return array_map(static fn($s)=>'emcp-tools/wpbakery-'.$s,array_keys(self::definitions())); }
    public function register(): void {
        foreach(self::definitions() as $slug=>$d) {
            emcp_tools_register_ability('emcp-tools/wpbakery-'.$slug,array('label'=>$d[1],'description'=>$d[2],'category'=>'emcp-tools',
                'input_schema'=>array('type'=>'object','properties'=>$d[4],'required'=>$d[5],'additionalProperties'=>false),
                'permission_callback'=>fn()=>$this->can_access(),'execute_callback'=>fn($a=array())=>$this->execute($slug,is_array($a)?$a:array()),
                'meta'=>array('show_in_rest'=>true,'annotations'=>array('readonly'=>!$d[3],'destructive'=>$d[3]&&$slug!=='create-page','idempotent'=>!$d[3]))));
        }
    }
    private function can_access(): bool {
        return self::supported() && EMCP_Tools_Page_Builders::enabled('wpbakery') && current_user_can('edit_pages') && in_array('page',vc_editor_post_types(),true) && vc_user_access()->part('backend_editor')->checkStateAny(true,null)->get();
    }
    private function allowed(int $id): bool {
        return get_post_type($id)==='page' && !in_array(get_post_status($id),array(false,'trash','auto-draft'),true) && current_user_can('edit_post',$id) && vc_user_access()->canEdit($id)->get();
    }
    private function validate(string $content) {
        WPBMap::addAllMappedShortcodes();
        return EMCP_Tools_WPBakery_Document::validate($content,static fn($type)=>WPBMap::getShortCode($type) && vc_user_access_check_shortcode_all($type));
    }
    private function state(int $id) {
        if(!$this->allowed($id)) { return new WP_Error('wpbakery_forbidden','Page access denied.'); }
        $data=array('post_id'=>$id,'title'=>get_the_title($id),'status'=>get_post_status($id),'content'=>(string)get_post_field('post_content',$id,'raw'),'css'=>(string)get_post_meta($id,'_wpb_post_custom_css',true),'builder_enabled'=>get_post_meta($id,'_wpb_vc_js_status',true)==='true');
        $data['content_hash']=hash('sha256',wp_json_encode($data));
        $data['url']=get_permalink($id); $data['editor_url']=admin_url('post.php?post='.$id.'&action=edit');
        $data['frontend_editor_url']=admin_url('post.php?vc_action=vc_inline&post_id='.$id.'&post_type=page');
        $valid=$this->validate($data['content']); $data['editable']=!is_wp_error($valid); $data['validation_error']=is_wp_error($valid)?$valid->get_error_message():null;
        return $data;
    }
    private function templates_allowed(): bool { return vc_user_access()->part('templates')->checkStateAny(true,null)->get(); }
    private function template(array $args) {
        if(!$this->templates_allowed()) { return new WP_Error('wpbakery_forbidden','Native template access denied.'); }
        $panel=wpbakery()->templatesPanelEditor();
        $data=$args['source']==='default' ? $panel->getDefaultTemplate($args['template_id']) : (($panel->getUserTemplates()?:array())[$args['template_id']]??false);
        if(!$data) { return new WP_Error('invalid_template','Unknown template.'); }
        $content=(string)($data['template']??$data['content']??''); $valid=$this->validate($content);
        return array('name'=>$data['name']??'','content'=>$content,'editable'=>!is_wp_error($valid),'validation_error'=>is_wp_error($valid)?$valid->get_error_message():null);
    }
    public function execute(string $slug,array $args) {
        if(!$this->can_access()) { return new WP_Error('wpbakery_forbidden','Select WPBakery and grant native backend editor and WordPress page access.'); }
        $definition=self::definitions()[$slug]??null;
        if(!$definition) { return new WP_Error('unknown_tool','Unknown WPBakery tool.'); }
        if($definition[3] && (!current_user_can('unfiltered_html') || !vc_user_access()->part('unfiltered_html')->checkStateAny(true,null)->get())) { return new WP_Error('wpbakery_forbidden','Writes require WordPress and native unfiltered HTML permission.'); }
        try {
            switch($slug) {
                case 'get-context': return array('version'=>WPB_VC_VERSION,'site_url'=>home_url(),'skill'=>'emcp-wpbakery','authoring_types'=>array_keys(EMCP_Tools_WPBakery_Document::parents()),'scope'=>'Native page shortcodes, page CSS, local/default template application, explicit publication and EMCP recovery. Other registered elements remain readable. Global settings, grid design, remote library downloads and saved-template mutations are not implemented.');
                case 'get-settings': return array('post_types'=>vc_editor_post_types(),'templates_allowed'=>$this->templates_allowed(),'frontend_editor_allowed'=>vc_user_access()->part('frontend_editor')->checkStateAny(true,null)->get());
                case 'list-elements': case 'get-element-schema':
                    WPBMap::addAllMappedShortcodes();
                    if($slug==='get-element-schema') {
                        $map=WPBMap::getShortCode($args['type']);
                        if(!$map || !vc_user_access_check_shortcode_edit($args['type'])) { return new WP_Error('unknown_element','Element unavailable or restricted.'); }
                        return array('schema'=>$map,'allowed_parents'=>EMCP_Tools_WPBakery_Document::parents()[$args['type']]??null,'defaults'=>vc_map_get_attributes($args['type'],array()));
                    }
                    $out=array(); foreach(WPBMap::getShortCodes() as $type=>$map) { if(vc_user_access_check_shortcode_edit($type)) { $out[]=array('type'=>$type,'name'=>$map['name']??$type,'category'=>$map['category']??'','editable'=>isset(EMCP_Tools_WPBakery_Document::parents()[$type]) && vc_user_access_check_shortcode_all($type)); } } return array('elements'=>$out);
                case 'list-pages':
                    $q=new WP_Query(array('post_type'=>'page','post_status'=>array('publish','draft','private','pending'),'posts_per_page'=>$args['per_page']??30,'paged'=>$args['page']??1,'perm'=>'editable','orderby'=>'ID','order'=>'DESC'));
                    $out=array(); foreach($q->posts as $p) { if($this->allowed($p->ID)) { $out[]=array('post_id'=>$p->ID,'title'=>$p->post_title,'status'=>$p->post_status,'wpbakery'=>get_post_meta($p->ID,'_wpb_vc_js_status',true)==='true'); } } return array('items'=>$out,'has_more'=>$q->max_num_pages>($args['page']??1));
                case 'get-page': return $this->state((int)$args['post_id']);
                case 'get-page-styles': case 'list-revisions':
                    $id=(int)$args['post_id']; if(!$this->allowed($id)) { return new WP_Error('wpbakery_forbidden','Page access denied.'); }
                    if($slug==='list-revisions') { return array('revisions'=>get_post_meta($id,'_emcp_wpbakery_recovery',true)?:array()); }
                    return array('css'=>get_post_meta($id,'_wpb_post_custom_css',true),'element_css'=>get_post_meta($id,'_wpb_shortcodes_custom_css',true),'default_css'=>get_post_meta($id,'_wpb_shortcodes_default_css',true));
                case 'list-templates':
                    if(!$this->templates_allowed()) { return new WP_Error('wpbakery_forbidden','Native template access denied.'); }
                    $panel=wpbakery()->templatesPanelEditor(); $out=array();
                    foreach(array('user'=>$panel->getUserTemplates(),'default'=>$panel->getDefaultTemplates()) as $source=>$items) { foreach((array)$items as $id=>$t) { if(!is_array($t)) { continue; } $out[]=array('template_id'=>(string)$id,'source'=>$source,'name'=>$t['name']??''); } } return array('templates'=>$out);
                case 'get-template': return $this->template($args);
                case 'create-page':
                    if(!current_user_can(get_post_type_object('page')->cap->create_posts)) { return new WP_Error('wpbakery_forbidden','Cannot create pages.'); }
                    $title=sanitize_text_field($args['title']); if(!trim($title)) { return new WP_Error('invalid_title','Provide a title.'); }
                    $id=wp_insert_post(wp_slash(array('post_type'=>'page','post_status'=>'draft','post_title'=>$title)),true); if(is_wp_error($id)) { return $id; }
                    update_post_meta($id,'_wpb_vc_js_status','true'); update_post_meta($id,'_wpb_vc_editor_type','backend'); return $this->state($id);
                default: return $this->write($slug,$args);
            }
        } catch(Throwable $e) { return new WP_Error('wpbakery_native_error','WPBakery could not complete the operation. Read the page again before retrying.'); }
    }
    private function write(string $slug,array $args) {
        $id=(int)$args['post_id']; if(!$this->allowed($id)) { return new WP_Error('wpbakery_forbidden','Page access denied.'); }
        if(!function_exists('wp_check_post_lock')) { require_once ABSPATH.'wp-admin/includes/post.php'; }
        $lock='emcp_wpbakery_lock_'.$id;
        if(wp_check_post_lock($id) || !add_option($lock,time(),'',false)) { return new WP_Error('page_locked','Another editor or EMCP save has the page locked.'); }
        try {
            $before=$this->state($id); if(is_wp_error($before)) { return $before; }
            if(!hash_equals($before['content_hash'],$args['expected_hash']??'')) { return new WP_Error('stale_content','Page changed. Read it again before saving.'); }
            if(!$before['builder_enabled']) { return new WP_Error('invalid_page','Use a native WPBakery page.'); }
            $content=$before['content']; $css=$before['css']; $status=$before['status'];
            $history=get_post_meta($id,'_emcp_wpbakery_recovery',true); $history=is_array($history)?$history:array();
            if($slug==='set-page-content') { $content=$args['content']; }
            elseif($slug==='replace-fragment') {
                if(($args['find']??'')==='' || substr_count($content,$args['find'])!==1) { return new WP_Error('ambiguous_fragment','Find must match exactly once.'); }
                $content=str_replace($args['find'],$args['replacement'],$content);
            } elseif($slug==='set-page-styles') { $css=$args['css']; }
            elseif($slug==='apply-template') { $t=$this->template($args); if(is_wp_error($t)) { return $t; } $content=$t['content']; }
            elseif($slug==='restore-revision') {
                $snapshot=null; foreach($history as $entry) { if($entry['revision_id']===$args['revision_id']) { $snapshot=$entry; break; } }
                if(!$snapshot) { return new WP_Error('invalid_revision','Choose an existing EMCP recovery snapshot.'); }
                $content=$snapshot['content']; $css=$snapshot['css'];
            } elseif($slug==='publish-page') {
                if(!current_user_can(get_post_type_object('page')->cap->publish_posts)) { return new WP_Error('wpbakery_forbidden','Publishing requires publish_pages.'); } $status='publish';
            } else { return new WP_Error('unknown_tool','Unknown write operation.'); }
            $valid=$this->validate($content); if(is_wp_error($valid)) { return $valid; }
            $valid=EMCP_Tools_WPBakery_Document::validate_css($css); if(is_wp_error($valid)) { return $valid; }
            $history[]=array('revision_id'=>wp_generate_uuid4(),'time'=>time(),'content'=>$before['content'],'css'=>$before['css']);
            update_post_meta($id,'_emcp_wpbakery_recovery',wp_slash(array_slice($history,-10)));
            $result=wp_update_post(wp_slash(array('ID'=>$id,'post_content'=>$content,'post_status'=>$status)),true); if(is_wp_error($result)) { return $result; }
            update_post_meta($id,'_wpb_post_custom_css',wp_slash($css));
            update_post_meta($id,'_wpb_vc_js_status','true');
            wpbakery()->postAdmin()->set_optimized_css_flag($id);
            wpbakery()->buildShortcodesCss($id,'custom'); wpbakery()->buildShortcodesCss($id,'default');
            clean_post_cache($id); $after=$this->state($id);
            if(is_wp_error($after) || $after['content']!==$content || $after['css']!==$css || $after['status']!==$status) { return new WP_Error('readback_failed','Readback differed; inspect the page and recovery snapshots before retrying.'); }
            return $after;
        } finally { delete_option($lock); }
    }
}
