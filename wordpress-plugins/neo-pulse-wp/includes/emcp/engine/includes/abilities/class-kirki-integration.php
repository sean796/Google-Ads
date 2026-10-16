<?php
/** Standalone Kirki 6 visual builder integration. */
if (!defined('ABSPATH')) { exit; }
class EMCP_Tools_Kirki_Integration {
    const META = array('blocks'=>'kirki','styles'=>'kirki_global_style_block_random','used_styles'=>'kirki_used_style_block_ids','used_local_styles'=>'kirki_used_style_block_ids_random','used_fonts'=>'kirki_used_font_list');
    public static function supported(): bool {
        return defined('KIRKI_VERSION') && version_compare(KIRKI_VERSION,'6.3.1','>=') && version_compare(KIRKI_VERSION,'6.4','<') && class_exists('Kirki\\App\\Managers\\PageManager');
    }
    public static function definitions(): array {
        $id=array('type'=>'integer','minimum'=>1); $s=array('type'=>'string'); $obj=array('type'=>'object','additionalProperties'=>true);
        $edit=array('post_id'=>$id,'expected_hash'=>array('type'=>'string','pattern'=>'^[a-f0-9]{64}$'));
        $page=array('page'=>$id,'per_page'=>array('type'=>'integer','minimum'=>1,'maximum'=>100));
        return array(
            'get-context'=>array('Discovery','Kirki Context','Read site, installed versions, permissions and integration scope.',false,array(),array()),
            'list-elements'=>array('Discovery','Kirki Elements','Read the verified native starter element catalog.',false,array(),array()),
            'get-element-schema'=>array('Discovery','Kirki Element Schema','Read starter data and native graph/style contracts.',false,array('type'=>$s),array('type')),
            'list-pages'=>array('Pages','Kirki Pages','List accessible WordPress pages and Kirki editor state.',false,$page,array()),
            'get-page'=>array('Pages','Read Kirki Page','Read the latest native graph, local styles, staged versions and content hash.',false,array('post_id'=>$id),array('post_id')),
            'create-page'=>array('Pages','Create Kirki Draft','Create a native Kirki canvas draft.',true,array('title'=>array('type'=>'string','minLength'=>1)),array('title')),
            'set-page-content'=>array('Pages','Save Kirki Content','Save a validated native graph and local styles to staging; does not publish.',true,$edit+array('blocks'=>$obj,'styles'=>$obj),array('post_id','expected_hash','blocks')),
            'add-element'=>array('Elements','Add Kirki Element','Append one native element to an existing parent and stage the result.',true,$edit+array('parent_id'=>$s,'element'=>$obj),array('post_id','expected_hash','parent_id','element')),
            'update-element'=>array('Elements','Update Kirki Element','Merge top-level native properties into one element and stage the result.',true,$edit+array('element_id'=>$s,'properties'=>$obj),array('post_id','expected_hash','element_id','properties')),
            'set-page-styles'=>array('Styles','Save Kirki Page Styles','Replace page-local responsive style blocks and stage the result.',true,$edit+array('styles'=>$obj),array('post_id','expected_hash','styles')),
            'get-design-system'=>array('Styles','Kirki Design System','Read global classes, variables, viewports and registered fonts.',false,array(),array()),
            'publish-page'=>array('Versions','Publish Kirki Page','Publish the latest staged native content and the WordPress page.',true,$edit,array('post_id','expected_hash')),
            'restore-version'=>array('Versions','Restore Kirki Version','Restore a known native version into a new unpublished stage.',true,$edit+array('version'=>$id),array('post_id','expected_hash','version')),
            'list-library'=>array('Library','Kirki Local Library','Discover local components, header/footer symbols, templates, popups and utility pages.',false,$page,array()),
            'get-library-item'=>array('Library','Read Kirki Library Item','Read a local library document in its native envelope and its template conditions.',false,array('post_id'=>$id),array('post_id')),
            'get-page-settings'=>array('Settings','Kirki Page Settings','Read page identity, SEO and disabled header/footer symbols.',false,array('post_id'=>$id),array('post_id')),
            'set-page-canvas'=>array('Settings','Kirki Canvas Template','Switch a Kirki page between full canvas and the default theme template.',true,$edit+array('full_canvas'=>array('type'=>'boolean')),array('post_id','expected_hash','full_canvas')),
            'list-collections'=>array('CMS','Kirki Collections','Discover Content Manager collections through its native API.',false,$page,array()),
            'get-collection'=>array('CMS','Kirki Collection Schema','Read a collection definition and its native fields.',false,array('collection_id'=>$id),array('collection_id')),
        );
    }
    public static function admin_categories(): array {
        $out=array(); foreach(self::definitions() as $slug=>$d) {
            $key='kirki_'.sanitize_key($d[0]);
            if(!isset($out[$key])) { $out[$key]=array('platform'=>'kirki','pro'=>true,'label'=>'Kirki: '.$d[0],'tools'=>array()); }
            $out[$key]['tools']['emcp-tools/kirki-'.$slug]=array('label'=>$d[1],'description'=>$d[2],'badges'=>$d[3]?array('pro'):array('pro','read-only'),'available'=>self::supported(),'requires'=>array('name'=>'Kirki 6.3.1–6.3.x','kind'=>'plugin'));
        } return $out;
    }
    public function get_ability_names(): array { return array_map(static fn($s)=>'emcp-tools/kirki-'.$s,array_keys(self::definitions())); }
    public function register(): void {
        foreach(self::definitions() as $slug=>$d) {
            emcp_tools_register_ability('emcp-tools/kirki-'.$slug,array('label'=>$d[1],'description'=>$d[2],'category'=>'emcp-tools',
                'input_schema'=>array('type'=>'object','properties'=>$d[4],'required'=>$d[5],'additionalProperties'=>false),
                'permission_callback'=>fn()=>$this->can_access(),'execute_callback'=>fn($a=array())=>$this->execute($slug,is_array($a)?$a:array()),
                'meta'=>array('show_in_rest'=>true,'annotations'=>array('readonly'=>!$d[3],'destructive'=>$d[3]&&$slug!=='create-page','idempotent'=>!$d[3]))));
        }
    }
    private function can_access(): bool {
        return self::supported() && EMCP_Tools_Page_Builders::enabled('kirki') && current_user_can('edit_pages') && function_exists('Kirki\\Framework\\user') && \Kirki\Framework\user()->has_access(array('full'));
    }
    private function allowed(int $id,bool $library=false): bool {
        $types=$library?array('kirki_symbol','kirki_template','kirki_popup','kirki_utility'):array('page');
        return in_array(get_post_type($id),$types,true) && !in_array(get_post_status($id),array(false,'trash','auto-draft'),true) && current_user_can('edit_post',$id);
    }
    private function meta(int $id,string $key,$default=array()) { return \Kirki\App\Models\PostMeta::get_meta_value($id,$key,$default); }
    /** Read without calling native resource constructors that create a stage on GET. */
    private function state(int $id) {
        if(!$this->allowed($id) || $this->meta($id,'kirki_editor_mode','')!=='kirki') { return new WP_Error('invalid_page','Choose an accessible Kirki canvas page.'); }
        $versions=$this->meta($id,'kirki_stage_versions'); $latest=null;
        foreach($versions as $v) { if(is_array($v) && (!$latest || (int)$v['version']>(int)$latest['version'])) { $latest=$v; } }
        $stage=$latest && empty($latest['publish']) ? (int)$latest['version'] : false;
        $data=array(); foreach(self::META as $field=>$key) { $data[$field]=$this->meta($id,$stage?'staged_'.$stage.'_'.$key:$key); }
        $data['blocks']=$data['blocks']['blocks']??array();
        $data+=array('post_id'=>$id,'title'=>get_the_title($id),'status'=>get_post_status($id),'canvas_template'=>$this->meta($id,'_wp_page_template','default'),'versions'=>$versions,'stage_version'=>$stage,'url'=>get_permalink($id),'editor_url'=>\Kirki\App\Supports\PageUrl::create($id)->get_editor_url());
        $data['content_hash']=hash('sha256',wp_json_encode($data)); return $data;
    }
    private function global_data(string $key) {
        $id=(int)get_option('KIRKI_GLOBAL_DATA_POST_TYPE_ID',get_option('DROIP_GLOBAL_DATA_POST_TYPE_ID',0));
        return $id?$this->meta($id,$key):get_option($key,array());
    }
    private function design(): array {
        $controller=$this->global_data('kirki_user_controller'); $saved=$this->global_data('kirki_user_saved_data');
        return array('styles'=>$this->global_data('kirki_class_manager_style_blocks'),'viewports'=>$controller['viewport']['list']??\Kirki\HelperFunctions::get_initial_view_ports()['list'],'variables'=>$saved['variableData']??array(),'fonts'=>$this->global_data('kirki_user_custom_fonts'));
    }
    public function execute(string $slug,array $args) {
        if(!$this->can_access()) { return new WP_Error('kirki_forbidden','Select Kirki and grant WordPress page editing plus native Kirki full access.'); }
        if(!isset(self::definitions()[$slug])) { return new WP_Error('unknown_tool','Unknown Kirki tool.'); }
        // Native properties can include HTML, scripts, dynamic fields and form actions.
        if(self::definitions()[$slug][3] && !current_user_can('unfiltered_html')) { return new WP_Error('kirki_forbidden','Native Kirki content writes require unfiltered_html.'); }
        try {
            switch($slug) {
                case 'get-context': return array('site_url'=>home_url(),'version'=>KIRKI_VERSION,'pro_version'=>defined('KIRKI_PRO_VERSION')?KIRKI_PRO_VERSION:null,'skill'=>'emcp-kirki','writes_allowed'=>current_user_can('unfiltered_html'),'scope'=>'Canvas pages, native element graphs, local responsive styles, staged publication/restoration; read-only local library, design system and CMS discovery. Shared components, template assignments, global settings and CMS mutations are not implemented.');
                case 'list-elements': return array('elements'=>array_keys(EMCP_Tools_Kirki_Document::starters()),'note'=>'Verified starters; native graphs may preserve other installed element types.');
                case 'get-element-schema':
                    $starter=EMCP_Tools_Kirki_Document::starters()[$args['type']]??null;
                    return $starter?array('starter'=>$starter,'required_identity'=>array('id','parentId'),'graph'=>'Flat ID-keyed map with root. Children and parentId must agree.','styles'=>'ID-keyed {id,type:class,name,variant:{md:CSS,tablet:CSS,mobile:CSS}}. Reference IDs in styleIds.'):new WP_Error('unknown_element','No verified starter for this element. Read an existing native page for advanced elements.');
                case 'get-page': return $this->state((int)$args['post_id']);
                case 'get-design-system': return $this->design();
                case 'list-pages': case 'list-library':
                    $library=$slug==='list-library'; $types=$library?array('kirki_symbol','kirki_template','kirki_popup','kirki_utility'):array('page');
                    $q=new WP_Query(array('post_type'=>$types,'post_status'=>array('publish','draft','private','pending'),'posts_per_page'=>$args['per_page']??30,'paged'=>$args['page']??1,'perm'=>'editable','orderby'=>'ID','order'=>'DESC'));
                    $items=array(); foreach($q->posts as $p) { if($this->allowed($p->ID,$library)) { $items[]=array('post_id'=>$p->ID,'title'=>$p->post_title,'type'=>$p->post_type,'status'=>$p->post_status,'kirki'=>$this->meta($p->ID,'kirki_editor_mode','')==='kirki','category'=>$library?($this->meta($p->ID,'kirki')['category']??null):null); } }
                    return array('items'=>$items,'has_more'=>$q->max_num_pages>($args['page']??1));
                case 'get-library-item':
                    $id=(int)$args['post_id']; if(!$this->allowed($id,true) || !current_user_can('edit_theme_options')) { return new WP_Error('kirki_forbidden','Library access requires edit_theme_options and document access.'); }
                    return array('post_id'=>$id,'type'=>get_post_type($id),'title'=>get_the_title($id),'content'=>$this->meta($id,'kirki'),'styles'=>$this->meta($id,'kirki_global_style_block_random'),'conditions'=>$this->meta($id,'kirki_template_conditions'),'collection_type'=>$this->meta($id,'kirki_template_collection_type',''));
                case 'get-page-settings':
                    $id=(int)$args['post_id']; if(!$this->allowed($id)) { return new WP_Error('kirki_forbidden','Page access denied.'); }
                    return array('title'=>get_the_title($id),'slug'=>get_post_field('post_name',$id),'description'=>get_post_field('post_excerpt',$id),'seo'=>$this->meta($id,'kirki_page_seo_settings'),'disabled_symbols'=>$this->meta($id,'kirki_disabled_page_symbols'));
                case 'list-collections': case 'get-collection':
                    if(!current_user_can('edit_theme_options')) { return new WP_Error('kirki_forbidden','CMS discovery requires edit_theme_options.'); }
                    $path='/kirki/v1/content-manager/collections'.($slug==='get-collection'?'/'.(int)$args['collection_id']:'');
                    $request=new WP_REST_Request('GET',$path);
                    if($slug==='list-collections') { $request->set_query_params(array('page'=>$args['page']??1,'limit'=>$args['per_page']??30)); }
                    $r=rest_do_request($request);
                    return $r->is_error()?$r->as_error():$r->get_data();
                case 'create-page':
                    $title=sanitize_text_field($args['title']); if(!trim($title)) { return new WP_Error('invalid_title','Provide a title.'); }
                    $type=get_post_type_object('page'); if(!$type || !current_user_can($type->cap->create_posts)) { return new WP_Error('kirki_forbidden','Page creation is unavailable.'); }
                    $dto=\Kirki\App\DTO\Page\PagePayloadDTO::from_array(array('post_title'=>$title,'post_type'=>'kirki_page','blocks'=>array('blocks'=>EMCP_Tools_Kirki_Document::blank())));
                    $post=(new \Kirki\App\Services\PageService())->save($dto); clean_post_cache($post->ID);
                    return $this->state((int)$post->ID);
                default: return $this->write($slug,$args);
            }
        } catch(Throwable $e) { return new WP_Error('kirki_native_error','Kirki could not complete the operation. Read the document again before retrying.'); }
    }
    private function write(string $slug,array $args) {
        $id=(int)$args['post_id']; $lock='emcp_kirki_lock_'.$id;
        if(!$this->allowed($id)) { return new WP_Error('kirki_forbidden','Page access denied.'); }
        if(!function_exists('wp_check_post_lock')) { require_once ABSPATH.'wp-admin/includes/post.php'; }
        if(wp_check_post_lock($id) || !add_option($lock,time(),'',false)) { return new WP_Error('page_locked','The page has an active editor or EMCP save.'); }
        try {
            $before=$this->state($id); if(is_wp_error($before)) { return $before; }
            if(!hash_equals($before['content_hash'],$args['expected_hash']??'')) { return new WP_Error('stale_content','Page changed. Read it again before saving.'); }
            $manager=new \Kirki\App\Managers\PageManager();
            if($slug==='set-page-canvas') {
                \Kirki\App\Models\PostMeta::update_meta_value($id,'_wp_page_template',$args['full_canvas']?\Kirki\App\Supports\Canvas::get_full_canvas_template_path():'default');
                clean_post_cache($id); return $this->state($id);
            }
            if($slug==='restore-version') {
                if(!in_array((int)$args['version'],array_map('intval',array_column($before['versions'],'version')),true)) { return new WP_Error('invalid_version','Choose a version returned by get-page.'); }
                $manager->restore_stage_version($id,(int)$args['version']); clean_post_cache($id); return $this->state($id);
            }
            if($slug==='publish-page') {
                $type=get_post_type_object('page'); if(!current_user_can($type->cap->publish_posts)) { return new WP_Error('kirki_forbidden','Publishing requires publish_pages.'); }
                if($before['stage_version']) {
                    // Preserve the previous published snapshot before replacing base metadata.
                    foreach($before['versions'] as $v) { if(!empty($v['publish'])) { foreach(self::META as $key) { \Kirki\App\Models\PostMeta::update_meta_value($id,'staged_'.(int)$v['version'].'_'.$key,$this->meta($id,$key)); } } }
                    foreach(self::META as $key) { \Kirki\App\Models\PostMeta::update_meta_value($id,$key,$this->meta($id,'staged_'.$before['stage_version'].'_'.$key)); }
                    $manager->publish_stage_version($id);
                }
                $r=wp_update_post(array('ID'=>$id,'post_status'=>'publish'),true); if(is_wp_error($r)) { return $r; }
                clean_post_cache($id); return $this->state($id);
            }
            $blocks=$before['blocks']; $styles=$args['styles']??$before['styles'];
            if($slug==='set-page-content') { $blocks=$args['blocks']; }
            elseif(in_array($slug,array('add-element','update-element'),true)) { $blocks=EMCP_Tools_Kirki_Document::edit($blocks,$slug,$args); if(is_wp_error($blocks)) { return $blocks; } }
            elseif($slug!=='set-page-styles') { return new WP_Error('unknown_tool','Unknown write operation.'); }
            $valid=EMCP_Tools_Kirki_Document::validate($blocks,$styles,$this->design()['styles']); if(is_wp_error($valid)) { return $valid; }
            // Preserve a bounded recovery image before changing an existing unpublished stage.
            $history=get_post_meta($id,'_emcp_kirki_recovery',true); $history=is_array($history)?$history:array();
            $history[]=array('time'=>time(),'state'=>$before); update_post_meta($id,'_emcp_kirki_recovery',wp_slash(array_slice($history,-5)));
            $stage=$manager->get_most_recent_stage_version($id,true);
            $manager->save_blocks($id,array('blocks'=>$blocks),$stage);
            $manager->save_style_blocks($id,$styles,$stage);
            $manager->save_used_style_block_ids($id,array_keys($styles),$stage);
            $manager->save_used_global_style_block_ids($id,$before['used_styles'],$stage);
            $manager->save_used_font_list($id,$before['used_fonts'],$stage);
            $manager->set_last_edited_datetime_of_stage_version($id);
            clean_post_cache($id); $after=$this->state($id);
            if(is_wp_error($after) || $after['blocks']!==$blocks || $after['styles']!==$styles || $after['status']!==$before['status']) { return new WP_Error('readback_failed','Readback differed; inspect the page and recovery image before retrying.'); }
            return $after;
        } finally { delete_option($lock); }
    }
}
