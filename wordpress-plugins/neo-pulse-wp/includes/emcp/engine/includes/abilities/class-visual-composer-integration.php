<?php
/** Visual Composer Website Builder: native documents with paired render artifacts. */
if (!defined('ABSPATH')) { exit; }

class EMCP_Tools_Visual_Composer_Integration {
    const DRAFT = '_emcp_visual_composer_draft';
    const HISTORY = '_emcp_visual_composer_history';
    public static function supported(): bool {
        return defined('VCV_VERSION') && version_compare(VCV_VERSION,'45.16.2','>=') && version_compare(VCV_VERSION,'45.17','<') && function_exists('vchelper');
    }
    public static function definitions(): array {
        $id=array('type'=>'integer','minimum'=>1); $s=array('type'=>'string'); $obj=array('type'=>'object','additionalProperties'=>true);
        $page=array('post_id'=>$id); $edit=$page+array('expected_hash'=>array('type'=>'string','pattern'=>'^[a-f0-9]{64}$'));
        return array(
            'get-context'=>array('Discovery','Visual Composer Context','Read installed version, native access and optional feature availability.',false,array(),array()),
            'list-elements'=>array('Discovery','Visual Composer Elements','Discover installed elements without downloading Hub assets.',false,array(),array()),
            'get-element-schema'=>array('Discovery','Visual Composer Element Schema','Read the installed element attribute schema and native defaults.',false,array('tag'=>$s),array('tag')),
            'list-pages'=>array('Pages','Visual Composer Pages','List accessible native pages.',false,array('page'=>$id),array()),
            'get-page'=>array('Pages','Read Visual Composer Page','Read native published content, staged document, editor URL and current hash.',false,$page,array('post_id')),
            'create-page'=>array('Pages','Create Visual Composer Draft','Create an empty native draft page.',true,array('title'=>array('type'=>'string','minLength'=>1)),array('title')),
            'stage-document'=>array('Pages','Stage Visual Composer Document','Stage paired native elements, rendered HTML and page CSS. All three artifacts are required. Does not change the live page. Read the skill and schemas first.',true,$edit+array('elements'=>$obj,'html'=>$s,'css'=>$s),array('post_id','expected_hash','elements','html','css')),
            'get-page-styles'=>array('Styles','Visual Composer Page Styles','Read staged and published page CSS.',false,$page,array('post_id')),
            'get-design-settings'=>array('Styles','Visual Composer Design Settings','Read global custom CSS. Global settings remain read-only.',false,array(),array()),
            'list-library'=>array('Library','Visual Composer Library','List accessible local templates and available optional theme documents.',false,array('page'=>$id),array()),
            'get-library-item'=>array('Library','Read Visual Composer Library Item','Read an accessible local template or optional theme document.',false,$page,array('post_id')),
            'apply-template'=>array('Library','Stage Visual Composer Template','Copy a local custom template and its rendered artifacts into a draft. Hub downloads and linked/global templates are not changed.',true,$edit+array('template_id'=>$id),array('post_id','expected_hash','template_id')),
            'list-revisions'=>array('Recovery','Visual Composer Recovery Snapshots','Read the latest ten staged document snapshots.',false,$page,array('post_id')),
            'restore-revision'=>array('Recovery','Restore Visual Composer Snapshot','Restore a complete paired document snapshot into staging.',true,$edit+array('revision_id'=>$s),array('post_id','expected_hash','revision_id')),
            'discard-draft'=>array('Recovery','Discard Visual Composer Staging','Discard EMCP staging and retain the native published document.',true,$edit+array('confirm'=>array('type'=>'boolean','const'=>true)),array('post_id','expected_hash','confirm')),
            'publish-page'=>array('Publishing','Publish Visual Composer Page','Publish the staged element document, HTML and CSS together. Requires confirmation and native publication permission.',true,$edit+array('confirm'=>array('type'=>'boolean','const'=>true)),array('post_id','expected_hash','confirm')),
        );
    }
    public static function admin_categories(): array {
        $out=array(); foreach(self::definitions() as $slug=>$d) {
            $key='visual_composer_'.sanitize_key($d[0]);
            if(!isset($out[$key])) { $out[$key]=array('platform'=>'visual-composer','pro'=>true,'label'=>'Visual Composer: '.$d[0],'tools'=>array()); }
            $out[$key]['tools']['emcp-tools/visual-composer-'.$slug]=array('label'=>$d[1],'description'=>$d[2],'badges'=>$d[3]?array('pro'):array('pro','read-only'),'available'=>self::supported(),'requires'=>array('name'=>'Visual Composer 45.16.2–45.16.x','kind'=>'plugin'));
        } return $out;
    }
    public function get_ability_names(): array { return array_map(static fn($s)=>'emcp-tools/visual-composer-'.$s,array_keys(self::definitions())); }
    public function register(): void {
        foreach(self::definitions() as $slug=>$d) {
            emcp_tools_register_ability('emcp-tools/visual-composer-'.$slug,array('label'=>$d[1],'description'=>$d[2],'category'=>'emcp-tools',
                'input_schema'=>array('type'=>'object','properties'=>$d[4],'required'=>$d[5],'additionalProperties'=>false),
                'permission_callback'=>fn()=>$this->access(),'execute_callback'=>fn($a=array())=>$this->execute($slug,is_array($a)?$a:array()),
                'meta'=>array('show_in_rest'=>true,'annotations'=>array('readonly'=>!$d[3],'destructive'=>$d[3]&&$slug!=='create-page','idempotent'=>!$d[3]))));
        }
    }
    private function access(): bool {
        return self::supported() && function_exists('emcp_tools_fs') && emcp_tools_fs()->can_use_premium_code()
            && EMCP_Tools_Page_Builders::enabled('visual-composer') && current_user_can('edit_posts') && current_user_can('unfiltered_html');
    }
    private function allowed(int $id,bool $library=false): bool {
        $p=get_post($id); $types=$library?array('vcv_templates','vcv_headers','vcv_footers','vcv_sidebars','vcv_layouts','vcv_popups'):array('page');
        return $p && in_array($p->post_type,$types,true) && $p->post_status!=='trash' && current_user_can('edit_post',$id)
            && (!$library || current_user_can('edit_theme_options')) && vchelper('AccessUserCapabilities')->canEdit($id);
    }
    private function native(int $id): array {
        $p=get_post($id); $raw=(string)get_post_meta($id,'vcv-pageContent',true); $doc=json_decode(rawurldecode($raw),true);
        return array('elements'=>is_array($doc['elements']??null)?$doc['elements']:array(),'html'=>$p->post_content,
            'css'=>(string)get_post_meta($id,'vcvSettingsSourceCustomCss',true),
            'source_css'=>(string)get_post_meta($id,'vcvSourceCss',true),
            'assets'=>get_post_meta($id,'vcvSourceAssetsFiles',true), 'raw_document'=>$raw);
    }
    public function state(int $id,bool $library=false) {
        if(!$this->allowed($id,$library)) { return new WP_Error('visual_composer_forbidden',__('Native document access denied.','emcp-tools')); }
        $p=get_post($id); $native=$this->native($id); $draft=get_post_meta($id,self::DRAFT,true);
        $hash=hash('sha256',wp_json_encode(array($native,$draft,$p->post_status,$p->post_modified_gmt,get_post_meta($id,'_vcv-pageDesignOptionsData',true),get_post_meta($id,'_vcv-pageDesignOptionsCompiledCss',true))));
        return array('post_id'=>$id,'title'=>$p->post_title,'status'=>$p->post_status,'content_hash'=>$hash,'published'=>$native,'draft'=>is_array($draft)?$draft:null,'editor_url'=>vchelper('Frontend')->getFrontendUrl($id),'permalink'=>get_permalink($id));
    }
    /** Extract inert JSON from a vendor bundle. Never execute vendor JavaScript. */
    public static function schema(string $tag) {
        $elements=vchelper('HubElements')->getElements();
        if(!isset($elements[$tag])) { return new WP_Error('unknown_element',__('Element is not installed.','emcp-tools')); }
        $path=$elements[$tag]['elementRealPath']??'';
        $files=array(rtrim($path,'/\\').'/settings.json',dirname(rtrim($path,'/\\')).'/public/dist/element.bundle.js');
        foreach($files as $file) {
            if(!is_file($file) || filesize($file)>8000000) { continue; }
            $text=file_get_contents($file);
            if(str_ends_with($file,'.json')) { $schema=json_decode($text,true); if(is_array($schema)) { return $schema; } }
            foreach(explode("\n",$text) as $line) {
                $line=trim($line);
                if(!str_starts_with($line,'eval(') || !str_ends_with($line,');')) { continue; }
                $encoded=substr($line,5,-2);
                $source=json_decode($encoded,true);
                if(!is_string($source) || !str_contains($source,'/'.$tag.'/settings.json')) { continue; }
                if(preg_match("/JSON\\.parse\\('((?:[^'\\\\]|\\\\.)*)'\\)/s",$source,$json)) {
                    $schema=json_decode(stripcslashes($json[1]),true);
                    if(is_array($schema)) { return $schema; }
                }
            }
        }
        return new WP_Error('schema_unavailable',__('This installed element does not expose a readable local schema. Use the native editor.','emcp-tools'));
    }
    /** Validate the flat native graph and paired rendering before saving. */
    public static function validate(array $elements,string $html,string $css,array $installed) {
        if(count($elements)>500 || strlen($html)+strlen($css)+strlen(wp_json_encode($elements))>2000000) { return new WP_Error('document_too_large','Document exceeds the authoring limit.'); }
        if(str_contains(strtolower($html),'<script') || preg_match('/<\/?style\b/i',$css)) { return new WP_Error('invalid_render','Keep scripts out of HTML and style tags out of CSS.'); }
        $positions=array();
        foreach($elements as $id=>$el) {
            if(!is_array($el) || !preg_match('/^[a-zA-Z0-9_-]{1,64}$/',(string)$id) || (string)($el['id']??'')!==(string)$id || !isset($installed[$el['tag']??''])) { return new WP_Error('invalid_element','Each keyed element needs a matching ID and installed tag.'); }
            if(!isset($el['order']) || !is_int($el['order']) || $el['order']<0) { return new WP_Error('invalid_order','Each element needs a nonnegative integer order.'); }
            $position=(string)($el['parent']??'').':'.$el['order'];
            if(isset($positions[$position])) { return new WP_Error('invalid_order','Sibling orders must be unique.'); } $positions[$position]=true;
            if(!preg_match('/\bid\s*=\s*([\'"])el-'.preg_quote((string)$id,'/').'\1/',$html)) { return new WP_Error('missing_render','Rendered HTML must contain every native element ID.'); }
            if($el['tag']==='column' && (($elements[$el['parent']??'']['tag']??'')!=='row')) { return new WP_Error('invalid_parent','Columns must belong to rows.'); }
            $seen=array($id=>true); $parent=$el['parent']??false;
            while($parent!==false && $parent!==null && $parent!=='') {
                if(!is_string($parent) || isset($seen[$parent]) || !isset($elements[$parent])) { return new WP_Error('invalid_parent','Element parents must exist and cannot form cycles.'); }
                $seen[$parent]=true; $parent=$elements[$parent]['parent']??false;
            }
        }
        return true;
    }
    public function execute(string $slug,array $args=array()) {
        if(!$this->access()) { return new WP_Error('visual_composer_forbidden',__('Visual Composer integration access denied.','emcp-tools')); }
        try {
            switch($slug) {
                case 'get-context': return array('version'=>VCV_VERSION,'document_contract'=>'Native flat elements map plus matching rendered HTML and page-local CSS. Rendering is browser-side; no PHP compiler is available.','page_access'=>vchelper('AccessUserCapabilities')->isEditorEnabled('page'),'optional_types'=>array_values(array_filter(array('vcv_headers','vcv_footers','vcv_sidebars','vcv_layouts','vcv_popups'),'post_type_exists')),'global_writes'=>false);
                case 'list-elements':
                    $out=array(); foreach(vchelper('HubElements')->getElements() as $tag=>$e) { $out[]=array('tag'=>$tag,'name'=>$e['settings']['name']??$tag,'description'=>$e['settings']['metaDescription']??'','third_party'=>!empty($e['thirdParty'])); } return array('elements'=>$out);
                case 'get-element-schema': return self::schema((string)($args['tag']??''));
                case 'get-page': return $this->state((int)$args['post_id']);
                case 'get-library-item': return $this->state((int)$args['post_id'],true);
                case 'get-page-styles': case 'list-revisions':
                    $s=$this->state((int)$args['post_id']); if(is_wp_error($s)) { return $s; }
                    return $slug==='list-revisions'?array('revisions'=>get_post_meta((int)$args['post_id'],self::HISTORY,true)?:array()):array('published_css'=>$s['published']['css'],'draft_css'=>$s['draft']['css']??null);
                case 'get-design-settings':
                    if(!current_user_can('edit_theme_options')) { return new WP_Error('visual_composer_forbidden','Theme access required.'); }
                    return array('global_css'=>vchelper('Options')->get('settingsGlobalCss',''),'global_writes'=>false);
                case 'list-pages': case 'list-library':
                    $lib=$slug==='list-library'; $types=$lib?array('vcv_templates','vcv_headers','vcv_footers','vcv_sidebars','vcv_layouts','vcv_popups'):array('page');
                    $q=new WP_Query(array('post_type'=>$types,'post_status'=>array('draft','publish','private','pending'),'posts_per_page'=>30,'paged'=>max(1,(int)($args['page']??1)),'orderby'=>'ID','order'=>'DESC'));
                    $out=array(); foreach($q->posts as $p) { if($this->allowed($p->ID,$lib) && ($lib || get_post_meta($p->ID,'vcv-pageContent',true))) { $out[]=array('post_id'=>$p->ID,'title'=>$p->post_title,'status'=>$p->post_status,'type'=>$p->post_type); } } return array('items'=>$out,'has_more'=>$q->max_num_pages>($args['page']??1));
                case 'create-page':
                    if(!current_user_can(get_post_type_object('page')->cap->create_posts) || !vchelper('AccessUserCapabilities')->isEditorEnabled('page')) { return new WP_Error('visual_composer_forbidden','Native page creation denied.'); }
                    $title=sanitize_text_field($args['title']??''); if(!trim($title)) { return new WP_Error('invalid_title','Provide a title.'); }
                    $id=wp_insert_post(wp_slash(array('post_type'=>'page','post_status'=>'draft','post_title'=>$title)),true); if(is_wp_error($id)) { return $id; }
                    update_post_meta($id,'vcv-pageContent',rawurlencode(wp_json_encode(array('elements'=>new stdClass()))));
                    update_post_meta($id,'vcv-be-editor','fe'); return $this->state($id);
                default: return $this->write($slug,$args);
            }
        } catch(Throwable $e) { return new WP_Error('visual_composer_native_error',__('Visual Composer could not complete this operation. Read the document before retrying.','emcp-tools')); }
    }
    private function write(string $slug,array $args) {
        if(!in_array($slug,array('stage-document','apply-template','restore-revision','discard-draft','publish-page'),true)) { return new WP_Error('unknown_operation','Unknown operation.'); }
        $id=(int)($args['post_id']??0); if(!$this->allowed($id)) { return new WP_Error('visual_composer_forbidden','Page access denied.'); }
        if(!function_exists('wp_check_post_lock')) { require_once ABSPATH.'wp-admin/includes/post.php'; }
        $lock='emcp_visual_composer_lock_'.$id;
        if(wp_check_post_lock($id) || !add_option($lock,time(),'',false)) { return new WP_Error('page_locked','Another editor or save has this document locked.'); }
        try {
            $state=$this->state($id); if(is_wp_error($state)) { return $state; }
            if(!hash_equals($state['content_hash'],(string)($args['expected_hash']??''))) { return new WP_Error('stale_content','Read the page again before saving.'); }
            if(!$state['published']['raw_document']) { return new WP_Error('invalid_page','Use a native Visual Composer page.'); }
            $current=$state['draft']??$state['published'];
            if(in_array($slug,array('discard-draft','publish-page'),true) && ($args['confirm']??false)!==true) { return new WP_Error('confirm_required','Explicit confirmation required.'); }
            $next=$current;
            if($slug==='stage-document') { $next=array('elements'=>$args['elements']??array(),'html'=>(string)($args['html']??''),'css'=>(string)($args['css']??''),'source_css'=>'','assets'=>array()); }
            if($slug==='apply-template') {
                $template=(int)($args['template_id']??0);
                if(!$this->allowed($template,true) || get_post_type($template)!=='vcv_templates' || get_post_meta($template,'_vcv-type',true)!=='custom') { return new WP_Error('invalid_template','Choose an accessible local custom template.'); }
                $next=$this->native($template);
            }
            if($slug==='restore-revision') {
                $found=false; foreach((array)get_post_meta($id,self::HISTORY,true) as $r) { if(($r['id']??'')===($args['revision_id']??'')) { $next=$r['document']; $found=true; break; } }
                if(!$found) { return new WP_Error('revision_not_found','Snapshot not found.'); }
            }
            $valid=self::validate($next['elements'],$next['html'],$next['css'],vchelper('HubElements')->getElements()); if(is_wp_error($valid)) { return $valid; }
            if($slug==='publish-page') {
                if(!current_user_can(get_post_type_object('page')->cap->publish_posts)) { return new WP_Error('visual_composer_forbidden','Publish permission required.'); }
                if(!$state['draft']) { return new WP_Error('missing_draft','Stage the paired document first.'); }
            }
            $history=get_post_meta($id,self::HISTORY,true); $history=is_array($history)?$history:array();
            array_unshift($history,array('id'=>wp_generate_uuid4(),'time'=>gmdate('c'),'document'=>$current)); update_post_meta($id,self::HISTORY,wp_slash(array_slice($history,0,10)));
            if($slug==='discard-draft') { delete_post_meta($id,self::DRAFT); return $this->state($id); }
            if($slug!=='publish-page') { update_post_meta($id,self::DRAFT,wp_slash($next)); return $this->state($id); }
            // Save only page-local artifacts. The native AJAX endpoint also mutates global assets.
            $backup=array();
            foreach(array('vcv-pageContent','vcvSettingsSourceCustomCss','vcvSourceCss','vcvSourceAssetsFiles','vcv-be-editor') as $key) {
                $backup[$key]=array('exists'=>metadata_exists('post',$id,$key),'value'=>get_post_meta($id,$key,true));
            }
            try {
                $result=wp_update_post(wp_slash(array('ID'=>$id,'post_content'=>$next['html'],'post_status'=>'publish')),true);
                if(is_wp_error($result)) { return $result; }
                update_post_meta($id,'vcv-pageContent',rawurlencode(wp_json_encode(array('elements'=>(object)$next['elements']))));
                update_post_meta($id,'vcvSettingsSourceCustomCss',wp_slash($next['css']));
                update_post_meta($id,'vcvSourceCss',wp_slash(($next['source_css']??'')."\n".$next['css']));
                update_post_meta($id,'vcvSourceAssetsFiles',wp_slash($next['assets']??array()));
                update_post_meta($id,'vcv-be-editor','fe');
                $assets=vchelper('Assets')->generateSourceCssFile(array(),array('sourceId'=>$id));
                if(empty($assets['sourceBundleCssFileUrl'])) { throw new RuntimeException('Asset generation failed.'); }
                clean_post_cache($id);
                $saved=$this->native($id);
                if($saved['elements']!==$next['elements'] || $saved['html']!==$next['html'] || $saved['css']!==$next['css']) { throw new RuntimeException('Saved document did not match.'); }
                vcevent('vcv:api:postSaved',array('sourceId'=>$id,'post'=>get_post($id)));
            } catch(Throwable $e) {
                wp_update_post(wp_slash(array('ID'=>$id,'post_content'=>$state['published']['html'],'post_status'=>$state['status'])),true);
                foreach($backup as $key=>$saved) { if($saved['exists']) { update_post_meta($id,$key,wp_slash($saved['value'])); } else { delete_post_meta($id,$key); } }
                vchelper('Assets')->generateSourceCssFile(array(),array('sourceId'=>$id));
                return new WP_Error('publish_failed',__('Publication failed. Previous content was restored and staging retained; read the page before retrying.','emcp-tools'));
            }
            delete_post_meta($id,self::DRAFT);
            return $this->state($id);
        } finally { delete_option($lock); }
    }
}
