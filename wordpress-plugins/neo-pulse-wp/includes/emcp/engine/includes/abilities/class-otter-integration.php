<?php
/** Native Otter Gutenberg integration, independent of the active theme/builder. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

class EMCP_Tools_Otter_Integration {
    const PREFIX = 'emcp-tools/otter-';
    const SETTINGS = array('css_module','blocks_animation','block_conditions','patterns_library','dynamic_content','highlight_dynamic','optimize_animations_css','disable_review_schema','review_scale','atomic_wind_blocks');

    public function is_available(): bool {
        return defined('OTTER_BLOCKS_VERSION') && version_compare(OTTER_BLOCKS_VERSION,'3.2.5','>=') && version_compare(OTTER_BLOCKS_VERSION,'3.3','<')
            && class_exists('ThemeIsle\\GutenbergBlocks\\Registration') && function_exists('emcp_tools_fs') && emcp_tools_fs()->can_use_premium_code();
    }

    public static function owns(string $name): bool {
        return strpos($name,'themeisle-blocks/')===0 || strpos($name,'atomic-wind/')===0;
    }

    public static function definitions(): array {
        $str=array('type'=>'string'); $id=array('type'=>'integer','minimum'=>1);
        $post=array('post_id'=>$id); $hash=array('type'=>'string','pattern'=>'^[a-f0-9]{64}$');
        $write=$post+array('expected_hash'=>$hash);
        $path=array('type'=>'array','minItems'=>1,'items'=>array('type'=>'integer','minimum'=>0));
        $position=array('type'=>'object','properties'=>array('mode'=>array('type'=>'string','enum'=>array('append','prepend','before','after','inside')),'path'=>$path),'required'=>array('mode'),'additionalProperties'=>false);
        // Section, write flag, description, properties, required properties.
        return array(
            'get-context'=>array('Discovery',false,'Read native Free/Pro availability and independent Gutenberg integration status.',array(),array()),
            'list-blocks'=>array('Discovery',false,'List installed Otter and Atomic Wind blocks; optional search.',array('search'=>$str),array()),
            'get-block-schema'=>array('Discovery',false,'Read the installed native attribute schema, parent requirements and static markup contract.',array('name'=>$str),array('name')),
            'get-features'=>array('Discovery',false,'Discover native visibility, dynamic data, animations, sticky, CSS and Pro feature availability. No credentials or submissions.',array(),array()),
            'create-page'=>array('Pages',true,'Create an empty draft Gutenberg page.',array('title'=>$str,'slug'=>$str),array('title')),
            'get-post-blocks'=>array('Pages',false,'Read complete mixed Gutenberg markup, block paths and content hash.', $post,array('post_id')),
            'set-page-blocks'=>array('Pages',true,'Replace page content with complete serialized Gutenberg blocks containing Otter blocks. Preserve native save markup; confirmation required.', $write+array('markup'=>$str,'confirm'=>array('type'=>'boolean')),array('post_id','expected_hash','markup','confirm')),
            'publish-page'=>array('Pages',true,'Explicitly publish a page after reviewing its saved blocks and styles.', $write+array('confirm'=>array('type'=>'boolean')),array('post_id','expected_hash','confirm')),
            'add-block'=>array('Blocks',true,'Insert one complete serialized Otter block, including its saved HTML and nested blocks.', $write+array('markup'=>$str,'position'=>$position),array('post_id','expected_hash','markup')),
            'update-block'=>array('Blocks',true,'Replace one Otter block with complete serialized native markup, including children.', $write+array('path'=>$path,'markup'=>$str),array('post_id','expected_hash','path','markup')),
            'move-block'=>array('Blocks',true,'Move an Otter block within a mixed Gutenberg tree.', $write+array('path'=>$path,'position'=>$position),array('post_id','expected_hash','path','position')),
            'remove-block'=>array('Blocks',true,'Remove one Otter block and its children.', $write+array('path'=>$path),array('post_id','expected_hash','path')),
            'list-patterns'=>array('Patterns',false,'List locally registered Otter patterns. Does not fetch remote libraries.',array('search'=>$str),array()),
            'get-pattern'=>array('Patterns',false,'Read registered native pattern markup before insertion or adaptation.',array('name'=>$str),array('name')),
            'insert-pattern'=>array('Patterns',true,'Insert registered pattern markup with regenerated Otter IDs; unavailable blocks are rejected. Remote images are not downloaded.', $write+array('name'=>$str,'position'=>$position),array('post_id','expected_hash','name')),
            'get-page-styles'=>array('Styles',false,'Read native generated CSS and stylesheet URL.', $post,array('post_id')),
            'rebuild-page-styles'=>array('Styles',true,'Regenerate page CSS from native attributes using the installed Otter compiler.', $write,array('post_id','expected_hash')),
            'get-settings'=>array('Settings',false,'Read allowlisted feature switches and their settings hash. Requires manage_options.',array(),array()),
            'update-settings'=>array('Settings',true,'Update allowlisted boolean feature switches. Requires manage_options and settings hash; changes apply on the next request.',array('expected_hash'=>$hash,'settings'=>array('type'=>'object','properties'=>array_fill_keys(self::SETTINGS,array('type'=>'boolean')),'additionalProperties'=>false)),array('expected_hash','settings')),
        );
    }

    public function get_ability_names(): array { return array_map(static fn($s)=>self::PREFIX.$s,array_keys(self::definitions())); }

    public function allowed(array $args=array()): bool {
        return $this->is_available() && EMCP_Tools_Page_Builders::enabled('otter') && current_user_can('edit_posts')
            && (empty($args['post_id']) || current_user_can('edit_post',(int)$args['post_id']));
    }

    public function register(): void {
        foreach(self::definitions() as $slug=>$d) {
            emcp_tools_register_ability(self::PREFIX.$slug,array(
                'label'=>'Otter '.ucwords(str_replace('-',' ',$slug)), 'description'=>$d[2], 'category'=>'emcp-tools',
                'input_schema'=>array('type'=>'object','properties'=>$d[3],'required'=>$d[4],'additionalProperties'=>false),
                'permission_callback'=>fn($a=array())=>$this->allowed((array)$a),
                'execute_callback'=>fn($a=array())=>$this->execute($slug,(array)$a),
                'meta'=>array('show_in_rest'=>true,'annotations'=>array('readonly'=>!$d[1],'destructive'=>in_array($slug,array('set-page-blocks','remove-block','update-block'),true),'idempotent'=>!$d[1]))));
        }
    }

    private function blocks(): array {
        return array_filter(WP_Block_Type_Registry::get_instance()->get_all_registered(),static fn($b)=>self::owns($b->name));
    }

    private function patterns(): array {
        $out=array();
        foreach(WP_Block_Patterns_Registry::get_instance()->get_all_registered() as $p) {
            if(strpos($p['name'],'otter-')===0 || in_array('otter-blocks',$p['categories']??array(),true)) { $out[$p['name']]=$p; }
        }
        return $out;
    }

    private function settings(): array {
        $registered=get_registered_settings(); $out=array();
        foreach(self::SETTINGS as $key) {
            $name='themeisle_blocks_settings_'.$key;
            if(isset($registered[$name])) { $out[$key]=(bool)get_option($name,$registered[$name]['default']??false); }
        }
        return array('settings'=>$out,'settings_hash'=>hash('sha256',wp_json_encode($out)));
    }

    private function page(int $id) {
        $p=get_post($id); if(!$p) { return new WP_Error('not_found','Post not found.'); }
        return array('post_id'=>$id,'status'=>$p->post_status,'permalink'=>get_permalink($id),'editor_url'=>admin_url('post.php?post='.$id.'&action=edit'),'content_hash'=>hash('sha256',$p->post_content.'|'.$p->post_status),'markup'=>$p->post_content,'blocks'=>EMCP_Tools_Block_Tree::summarize(EMCP_Tools_Block_Tree::from_markup($p->post_content)));
    }

    /** Validate actual registered block types, native attribute types, IDs and nesting. */
    public static function validate_tree(array $tree, array $registry, ?string $parent=null, array &$ids=array(), int $depth=0) {
        if($depth>30) { return new WP_Error('invalid_tree','Block nesting exceeds 30 levels.'); }
        foreach($tree as $b) {
            $name=$b['blockName']??'';
            if(!$name || !isset($registry[$name])) { return new WP_Error('unknown_block','Only registered blocks are accepted: '.$name); }
            $type=$registry[$name];
            if(!empty($type->parent) && !in_array($parent,$type->parent,true)) { return new WP_Error('invalid_parent','Invalid parent for '.$name); }
            foreach($b['attrs']??array() as $key=>$value) {
                $schema=$type->get_attributes()[$key]??null;
                if(self::owns($name) && !$schema) { return new WP_Error('unknown_attribute','Unknown native attribute '.$name.'.'.$key); }
                if($schema && function_exists('rest_validate_value_from_schema')) {
                    $valid=rest_validate_value_from_schema($value,$schema,$name.'.'.$key);
                    if(is_wp_error($valid)) { return $valid; }
                }
            }
            if(self::owns($name) && !empty($b['attrs']['id'])) {
                $id=$b['attrs']['id'];
                if(!is_string($id) || !preg_match('/^[A-Za-z][A-Za-z0-9_-]{0,100}$/D',$id) || isset($ids[$id])) { return new WP_Error('duplicate_id','Otter IDs must be valid and unique in the page.'); }
                $ids[$id]=true;
            }
            $result=self::validate_tree($b['innerBlocks']??array(),$registry,$name,$ids,$depth+1);
            if(is_wp_error($result)) { return $result; }
        }
        return true;
    }

    private function parse(string $markup) {
        if(strlen($markup)>2000000 || preg_match('/<\s*(script|iframe|object|embed)\b/i',$markup)) { return new WP_Error('invalid_markup','Use native blocks, without executable embeds, under 2 MB.'); }
        $tree=EMCP_Tools_Block_Tree::from_markup($markup);
        if(!$tree) { return new WP_Error('invalid_markup','Provide serialized Gutenberg blocks.'); }
        return $tree;
    }

    private function css(int $id): array {
        return array('post_id'=>$id,'css'=>get_post_meta($id,'_themeisle_gutenberg_block_styles',true),'url'=>\ThemeIsle\GutenbergBlocks\CSS\CSS_Handler::get_css_url($id));
    }

    /** Small native save examples, verified against the installed 3.2.5 serializers. */
    public static function example(string $name): ?string {
        if($name==='themeisle-blocks/advanced-heading') { return '<!-- wp:themeisle-blocks/advanced-heading {"id":"otter-example-heading","tag":"h2","fontSize":40,"fontSizeMobile":28} --><h2 id="otter-example-heading" class="wp-block-themeisle-blocks-advanced-heading otter-example-heading">Your heading</h2><!-- /wp:themeisle-blocks/advanced-heading -->'; }
        if($name==='themeisle-blocks/business-hours') { return '<!-- wp:themeisle-blocks/business-hours {"id":"otter-example-hours","title":"Opening hours"} --><div id="otter-example-hours" class="wp-block-themeisle-blocks-business-hours"><div class="otter-business-hour__container"><div class="otter-business-hour__title"><span>Opening hours</span></div><div class="otter-business-hour__content"><!-- wp:themeisle-blocks/business-hours-item {"label":"Monday","time":"09:00 to 17:00"} --><div class="wp-block-themeisle-blocks-business-hours-item"><div class="otter-business-hour-item__label"><span>Monday</span></div><div class="otter-business-hour-item__time"><span>09:00 to 17:00</span></div></div><!-- /wp:themeisle-blocks/business-hours-item --></div></div></div><!-- /wp:themeisle-blocks/business-hours -->'; }
        return null;
    }

    public function execute(string $slug,array $a) {
        if(!$this->allowed($a)) { return new WP_Error('otter_forbidden','Otter integration or post permission is unavailable.'); }
        $d=self::definitions()[$slug]??null;
        if(!$d) { return new WP_Error('unknown_tool','Unknown Otter tool.'); }
        if(in_array($slug,array('get-settings','update-settings'),true) && !current_user_can('manage_options')) { return new WP_Error('forbidden','Managing Otter settings requires manage_options.'); }
        if($d[1] && !current_user_can('unfiltered_html')) { return new WP_Error('forbidden','Native block writes require unfiltered_html to preserve saved markup.'); }
        if($slug==='get-context') {
            return array('integration'=>'otter','editor'=>'gutenberg','independent_toggle'=>true,'free_version'=>OTTER_BLOCKS_VERSION,'pro_version'=>defined('OTTER_PRO_VERSION')?OTTER_PRO_VERSION:null,'block_count'=>count($this->blocks()),'site_url'=>home_url(),'native_markup_required'=>true);
        }
        if($slug==='get-settings') { return $this->settings(); }
        if($slug==='update-settings') {
            if(!add_option('emcp_otter_settings_lock',time(),'',false)) { return new WP_Error('settings_locked','Another Otter settings save is in progress.'); }
            try {
                $old=$this->settings();
                if(!hash_equals($old['settings_hash'],(string)($a['expected_hash']??''))) { return new WP_Error('stale_settings','Read get-settings again.'); }
                foreach($a['settings']??array() as $key=>$value) { if(!array_key_exists($key,$old['settings']) || !is_bool($value)) { return new WP_Error('invalid_setting','Use allowlisted boolean feature switches only.'); } }
                foreach($a['settings'] as $key=>$value) { update_option('themeisle_blocks_settings_'.$key,$value); }
                return $this->settings();
            } finally { delete_option('emcp_otter_settings_lock'); }
        }
        if($slug==='list-blocks') {
            $out=array(); foreach($this->blocks() as $name=>$b) {
                if(!empty($a['search']) && stripos($name.' '.$b->title,$a['search'])===false) { continue; }
                $out[]=array('name'=>$name,'title'=>$b->title,'dynamic'=>$b->is_dynamic(),'parent'=>$b->parent,'category'=>$b->category);
            } return array('count'=>count($out),'blocks'=>$out);
        }
        if($slug==='get-block-schema') {
            $b=$this->blocks()[$a['name']]??null;
            if(!$b) { return new WP_Error('unknown_block','Choose a registered Otter block.'); }
            return array('name'=>$b->name,'title'=>$b->title,'attributes'=>$b->get_attributes(),'supports'=>$b->supports,'parent'=>$b->parent,'dynamic'=>$b->is_dynamic(),'example_markup'=>self::example($b->name),'authoring'=>'Static blocks require native Gutenberg save HTML; attributes alone are insufficient. Read a registered pattern or existing block as a reference. Regenerate example IDs before reuse. Updates replace the entire block, including children.');
        }
        if($slug==='get-features') {
            $b=WP_Block_Type_Registry::get_instance()->get_registered('core/paragraph');
            $attrs=$b?$b->get_attributes():array();
            return array('extension_attributes'=>array_intersect_key($attrs,array_flip(array('otterConditions','hasCustomCSS','customCSS','otterID'))),'settings'=>$this->settings()['settings'],'pro_active'=>defined('OTTER_PRO_VERSION'),'woocommerce'=>class_exists('WooCommerce'),'forms'=>'Native form blocks and their registered attributes; credentials, payments and submission records are outside this tool surface.','dynamic_content'=>'Preserve native dynamic text/link/image markup when replacing a block.','animation_and_sticky'=>'Preserve native saved classes/data attributes and inspect the relevant block schema. No independent global animation or sticky setting is written.','atomic_wind'=>'Experimental native blocks are discoverable; their utility CSS is generated in the browser, separately from the classic Otter PHP compiler.','visibility_example'=>array(array(array('type'=>'loggedOutUser'))),'patterns'=>'Locally registered patterns only, including native Pro patterns when available.');
        }
        if(in_array($slug,array('list-patterns','get-pattern'),true)) {
            $patterns=$this->patterns();
            if($slug==='get-pattern') { return $patterns[$a['name']]??new WP_Error('not_found','Registered Otter pattern not found.'); }
            $out=array(); foreach($patterns as $p) {
                if(!empty($a['search']) && stripos($p['name'].' '.$p['title'],$a['search'])===false) { continue; }
                $out[]=array_intersect_key($p,array_flip(array('name','title','description','categories')));
            } return array('count'=>count($out),'patterns'=>$out);
        }
        if($slug==='create-page') {
            if(!current_user_can('edit_pages')) { return new WP_Error('forbidden','Creating pages requires edit_pages.'); }
            $id=wp_insert_post(array('post_type'=>'page','post_status'=>'draft','post_title'=>sanitize_text_field($a['title']),'post_name'=>sanitize_title($a['slug']??'')),true);
            return is_wp_error($id)?$id:$this->page($id);
        }
        $id=(int)($a['post_id']??0); $p=get_post($id);
        if(!$p || in_array($p->post_status,array('trash','auto-draft'),true) || !in_array($p->post_type,array('page','post','wp_block'),true)) { return new WP_Error('invalid_post','Choose an editable page, post or reusable block.'); }
        if($slug==='get-post-blocks') { return $this->page($id); }
        if($slug==='get-page-styles') { return $this->css($id); }
        if(in_array($slug,array('publish-page','set-page-blocks'),true) && ($a['confirm']??false)!==true) { return new WP_Error('confirm_required','Explicit confirmation is required.'); }
        if($slug==='publish-page' && !current_user_can(get_post_type_object($p->post_type)->cap->publish_posts)) { return new WP_Error('forbidden','Publication permission is required.'); }
        $lock='emcp_block_pack_lock_'.$id;
        if(!add_option($lock,time(),'',false)) { return new WP_Error('page_locked','Another block save is in progress.'); }
        try {
            $current=$this->page($id);
            if(!hash_equals($current['content_hash'],(string)($a['expected_hash']??''))) { return new WP_Error('stale_content','Content or status changed; read get-post-blocks again.'); }
            if(!function_exists('wp_check_post_lock')) { require_once ABSPATH.'wp-admin/includes/post.php'; }
            if(wp_check_post_lock($id)) { return new WP_Error('page_locked','Another user is editing this post.'); }
            $tree=EMCP_Tools_Block_Tree::from_markup($current['markup']);
            if($slug==='set-page-blocks') { $tree=$this->parse($a['markup']); }
            elseif(in_array($slug,array('add-block','insert-pattern'),true)) {
                $markup=$a['markup']??'';
                if($slug==='insert-pattern') {
                    $pattern=$this->patterns()[$a['name']]??null;
                    if(!$pattern) { return new WP_Error('not_found','Registered Otter pattern not found.'); }
                    $markup=$pattern['content'];
                    // Update both comment attributes and HTML/CSS references, not just attrs.
                    preg_match_all('/"id":"([A-Za-z][A-Za-z0-9_-]*)"/',$markup,$matches);
                    $replacements=array(); foreach(array_unique($matches[1]) as $old) { $replacements[$old]='otter-'.str_replace('-','',wp_generate_uuid4()); }
                    $markup=strtr($markup,$replacements);
                }
                $new=$this->parse($markup); if(is_wp_error($new)) { return $new; }
                if($slug==='add-block' && (count($new)!==1 || !self::owns($new[0]['blockName']??''))) { return new WP_Error('wrong_block','Provide one serialized Otter block.'); }
                $position=$a['position']??array('mode'=>'append');
                if(!EMCP_Tools_Block_Tree::position_is_valid($tree,$position)) { return new WP_Error('invalid_position','Target block path does not exist.'); }
                $tree=EMCP_Tools_Block_Tree::insert($tree,$new,$position);
            } elseif(in_array($slug,array('update-block','move-block','remove-block'),true)) {
                $path=$a['path']; $node=EMCP_Tools_Block_Tree::at($tree,$path);
                if(!$node || !self::owns($node['blockName']??'')) { return new WP_Error('wrong_block','Choose an Otter block path.'); }
                if($slug==='remove-block') { $tree=EMCP_Tools_Block_Tree::remove($tree,$path); }
                elseif($slug==='move-block') {
                    $pos=$a['position']; $target=$pos['path']??array();
                    if(!EMCP_Tools_Block_Tree::position_is_valid($tree,$pos) || (in_array($pos['mode'],array('inside','before','after'),true) && array_slice($target,0,count($path))===$path)) { return new WP_Error('invalid_position','Cannot move into self/descendants or an unknown target.'); }
                    $tree=EMCP_Tools_Block_Tree::move($tree,$path,$pos);
                } else {
                    $new=$this->parse($a['markup']); if(is_wp_error($new)) { return $new; }
                    if(count($new)!==1 || !self::owns($new[0]['blockName']??'')) { return new WP_Error('wrong_block','Provide one serialized Otter block.'); }
                    $tree=EMCP_Tools_Block_Tree::replace($tree,$path,$new);
                }
            }
            if(is_wp_error($tree)) { return $tree; }
            $valid=self::validate_tree($tree,WP_Block_Type_Registry::get_instance()->get_all_registered());
            if(is_wp_error($valid)) { return $valid; }
            $markup=EMCP_Tools_Block_Tree::to_markup($tree);
            if(strlen($markup)>2000000) { return new WP_Error('invalid_markup','Page exceeds 2 MB.'); }
            if($slug==='set-page-blocks' && !preg_match('/<!-- wp:(themeisle-blocks|atomic-wind)\//',$markup)) { return new WP_Error('wrong_block','This integration requires at least one Otter block.'); }
            $update=array('ID'=>$id,'post_content'=>wp_slash($markup));
            if($slug==='publish-page') { $update['post_status']='publish'; }
            if($slug!=='rebuild-page-styles') {
                wp_save_post_revision($id);
                $result=wp_update_post($update,true); if(is_wp_error($result)) { return $result; }
            }
            try { \ThemeIsle\GutenbergBlocks\CSS\CSS_Handler::generate_css_file($id); }
            catch(\Throwable $e) { return new WP_Error('css_failed','Content was saved, but native CSS compilation failed. Read the page before retrying rebuild-page-styles.'); }
            return array('page'=>$this->page($id),'styles'=>$this->css($id));
        } finally { delete_option($lock); }
    }

    public static function admin_categories(): array {
        $out=array(); foreach(self::definitions() as $slug=>$d) {
            $key='otter_'.strtolower($d[0]);
            if(!isset($out[$key])) { $out[$key]=array('platform'=>'otter','label'=>'Otter: '.$d[0],'pro'=>true,'tools'=>array()); }
            $out[$key]['tools'][self::PREFIX.$slug]=array('label'=>ucwords(str_replace('-',' ',$slug)),'description'=>$d[2],'badges'=>$d[1]?array():array('read-only'),'available'=>(new self())->is_available(),'requires'=>array('name'=>'Otter Blocks 3.2.5+ and Neo EMCP','kind'=>'plugin'));
        } return $out;
    }
}
