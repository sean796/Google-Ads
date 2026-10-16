<?php
/** Native Companion Pro Content Blocks. @package EMCP_Tools */
if ( ! defined( 'ABSPATH' ) ) { exit; }

class EMCP_Tools_Blocksy_Content_Integration extends EMCP_Tools_Theme_Integration {
    const POST_TYPE = 'ct_content_block';
    const META = 'blocksy_post_meta_options';
    const TYPES = array('hook','header','footer','single','archive','404','nothing_found','popup','maintenance');
    const RULES = array('everywhere','singulars','archives','404','search','blog','front_page');
    public function id(): string { return 'blocksy-content'; }
    public function label(): string { return __('Blocksy Content Blocks','emcp-tools'); }
    public function is_available(): bool {
        return post_type_exists(self::POST_TYPE) && (!function_exists('emcp_tools_fs') || emcp_tools_fs()->can_use_premium_code());
    }
    public function can_read(): bool { return $this->is_available() && current_user_can('edit_theme_options'); }
    public function can_write(): bool { return $this->can_read() && current_user_can('unfiltered_html'); }
    protected function operations(): array {
        $out=array();
        foreach(array(
            'get-context'=>array('read','Discover native template types, supported display conditions and workflow.'),
            'list-content-blocks'=>array('read','List accessible Content Blocks with pagination: {page?, per_page?}.'),
            'get-content-block'=>array('read','Read native content, type, settings and hash: {post_id}.'),
            'list-hooks'=>array('read','Discover native hook locations.'),
            'create-content-block'=>array('write','Create a disabled draft: {title, template_type}. Build its content with Gutenberg or Blocksy Blocks tools.'),
            'update-content-block'=>array('write','Update a draft: {post_id, expected_hash, title?, content?, settings?}. Curated settings: conditions, location, priority, is_hook_enabled.'),
            'publish-content-block'=>array('write','Explicitly publish a draft: {post_id, expected_hash, confirm:true}. Review native settings and display conditions first.'),
            'unpublish-content-block'=>array('write','Return a published Content Block to draft before editing: {post_id, expected_hash, confirm:true}.'),
        ) as $op=>$d) { $out[$op]=array('mode'=>$d[0],'desc'=>$d[1],'perm'=>array($this,'can_'.$d[0]),'run'=>fn($args)=>$this->execute($op,$args)); }
        return $out;
    }
    private function read(int $id) {
        $post=get_post($id);
        if(!$post || $post->post_type!==self::POST_TYPE || !current_user_can('edit_post',$id)) { return new WP_Error('forbidden',__('Content Block is unavailable or inaccessible.','emcp-tools')); }
        $data=array('post_id'=>$id,'title'=>$post->post_title,'status'=>$post->post_status,'content'=>$post->post_content,'template_type'=>get_post_meta($id,'template_type',true),'settings'=>get_post_meta($id,self::META,true));
        $data['content_hash']=hash('sha256',wp_json_encode($data));
        $data['edit_url']=get_edit_post_link($id,'raw');
        return $data;
    }
    private function hooks(): array {
        return class_exists('Blocksy\\HooksManager') ? (new \Blocksy\HooksManager())->get_all_hooks() : array();
    }
    public function validate_settings(array $values,string $type) {
        foreach($values as $key=>$value) {
            if($key==='is_hook_enabled' && in_array($value,array('yes','no'),true)) { continue; }
            if($key==='priority' && $type==='hook' && is_int($value) && $value>=1 && $value<=100) { continue; }
            if($key==='location' && $type==='hook' && is_string($value) && ($value==='' || in_array($value,array_column($this->hooks(),'hook'),true))) { continue; }
            if($key==='conditions' && is_array($value) && array_is_list($value) && count($value)<=50) {
                foreach($value as $rule) {
                    if(!is_array($rule) || array_diff(array_keys($rule),array('type','rule','payload')) || !in_array($rule['type']??'',array('include','exclude'),true) || !in_array($rule['rule']??'',self::RULES,true) || !empty($rule['payload'])) {
                        return new WP_Error('invalid_conditions',__('Use supported include/exclude rules with an empty payload. Advanced native conditions are read-only.','emcp-tools'));
                    }
                }
                continue;
            }
            return new WP_Error('invalid_setting',sprintf(__('Unsupported Content Block setting: %s','emcp-tools'),$key));
        }
        return $values;
    }
    public function execute(string $op,array $args) {
        if(!$this->can_read()) { return new WP_Error('forbidden',__('Companion Pro Content Blocks are unavailable.','emcp-tools')); }
        if($op==='get-context') { return array('post_type'=>self::POST_TYPE,'template_types'=>self::TYPES,'condition_rules'=>self::RULES,'new_status'=>'draft','new_enabled'=>false,'content_editor'=>'Gutenberg and Blocksy Blocks tools','advanced_settings'=>'Discover and edit in the native editor; MCP preserves them.'); }
        if($op==='list-hooks') { return array('hooks'=>$this->hooks()); }
        if($op==='get-content-block') { return $this->read(absint($args['post_id']??0)); }
        if($op==='list-content-blocks') {
            $query=new WP_Query(array('post_type'=>self::POST_TYPE,'post_status'=>array('publish','draft','pending','private'),'posts_per_page'=>max(1,min(50,absint($args['per_page']??20))),'paged'=>max(1,absint($args['page']??1)),'orderby'=>'ID','order'=>'DESC'));
            $items=array(); foreach($query->posts as $post) { $item=$this->read($post->ID); if(!is_wp_error($item)) { unset($item['content'],$item['settings']); $items[]=$item; } }
            return array('items'=>$items,'page'=>max(1,absint($args['page']??1)),'has_more'=>$query->max_num_pages>max(1,absint($args['page']??1)));
        }
        if(!$this->can_write()) { return new WP_Error('forbidden',__('Content Block writes require unfiltered HTML permission.','emcp-tools')); }
        $cpt=get_post_type_object(self::POST_TYPE);
        if($op==='create-content-block') {
            $type=$args['template_type']??''; $title=is_string($args['title']??null)?sanitize_text_field($args['title']):'';
            if(!in_array($type,self::TYPES,true)||$title==='') { return new WP_Error('invalid_input',__('Provide a title and supported template_type.','emcp-tools')); }
            if(!current_user_can($cpt->cap->create_posts??$cpt->cap->edit_posts)) { return new WP_Error('forbidden',__('Native Content Block creation is not permitted.','emcp-tools')); }
            $id=wp_insert_post(wp_slash(array('post_type'=>self::POST_TYPE,'post_status'=>'draft','post_title'=>$title,'meta_input'=>array('template_type'=>$type,self::META=>array('is_hook_enabled'=>'no','conditions'=>array(),'has_inline_code_editor'=>'no')))),true);
            return is_wp_error($id)?$id:$this->read($id);
        }
        if(!in_array($op,array('update-content-block','publish-content-block','unpublish-content-block'),true)) { return new WP_Error('unknown_operation',__('Unknown Content Block operation.','emcp-tools')); }
        $id=absint($args['post_id']??0); $lock='emcp_blocksy_content_lock_'.$id;
        if(!add_option($lock,time(),'',false)) { return new WP_Error('locked',__('A Content Block save is in progress.','emcp-tools')); }
        try {
            $current=$this->read($id); if(is_wp_error($current)) { return $current; }
            if(($current['settings']['has_inline_code_editor']??'no')!=='no' && $op!=='unpublish-content-block') {
                return new WP_Error('code_mode_read_only',__('Content Blocks using native code mode are read-only through this integration.','emcp-tools'));
            }
            if(!hash_equals($current['content_hash'],(string)($args['expected_hash']??''))) { return new WP_Error('stale_content',__('Read the Content Block again before saving.','emcp-tools')); }
            if(!function_exists('wp_check_post_lock')) { require_once ABSPATH.'wp-admin/includes/post.php'; }
            if(wp_check_post_lock($id)) { return new WP_Error('locked',__('Another user is editing this Content Block.','emcp-tools')); }
            $post=array('ID'=>$id);
            if($op==='update-content-block') {
                if($current['status']!=='draft') { return new WP_Error('draft_required',__('Unpublish this Content Block before editing it.','emcp-tools')); }
                if(isset($args['title'])) { if(!is_string($args['title'])) { return new WP_Error('invalid_title',__('Title must be a string.','emcp-tools')); } $post['post_title']=sanitize_text_field($args['title']); }
                if(isset($args['content'])) { if(!is_string($args['content']) || strlen($args['content'])>1048576) { return new WP_Error('invalid_content',__('Content must be a string under 1 MB.','emcp-tools')); } $post['post_content']=$args['content']; }
                if(isset($args['settings'])) {
                    if(!is_array($args['settings'])) { return new WP_Error('invalid_settings',__('Settings must be an object.','emcp-tools')); }
                    $valid=$this->validate_settings($args['settings'],$current['template_type']); if(is_wp_error($valid)) { return $valid; }
                    $post['meta_input']=array(self::META=>array_merge(is_array($current['settings'])?$current['settings']:array(),$valid));
                }
            } else {
                if(($args['confirm']??false)!==true) { return new WP_Error('confirm_required',__('Pass confirm:true after reviewing the display impact.','emcp-tools')); }
                if(!current_user_can($cpt->cap->publish_posts)) { return new WP_Error('forbidden',__('Native Content Block publication is not permitted.','emcp-tools')); }
                if(!in_array($current['status'],array('draft','publish'),true)) { return new WP_Error('invalid_status',__('Choose a draft or published Content Block.','emcp-tools')); }
                if($op==='publish-content-block' && !in_array($current['template_type'],self::TYPES,true)) { return new WP_Error('unsupported_type',__('This native template type is read-only.','emcp-tools')); }
                $post['post_status']=$op==='publish-content-block'?'publish':'draft';
            }
            $result=wp_update_post(wp_slash($post),true);
            return is_wp_error($result)?$result:$this->read($id);
        } finally { delete_option($lock); }
    }
}
