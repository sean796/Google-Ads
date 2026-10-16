<?php
/** Blocksy theme settings, separate from Companion content. @package EMCP_Tools */
if ( ! defined( 'ABSPATH' ) ) { exit; }

class EMCP_Tools_Blocksy_Theme_Integration extends EMCP_Tools_Theme_Integration {
    /** Native layout sliders verified against Blocksy 2.1.57. */
    const SETTINGS = array(
        'maxSiteWidth' => array(1290,700,1900),
        'narrowContainerWidth' => array(750,400,1000),
        'wideOffset' => array(130,20,200),
    );
    public function id(): string { return 'blocksy-theme'; }
    public function label(): string { return __('Blocksy Theme','emcp-tools'); }
    public function is_available(): bool {
        return get_template()==='blocksy' && (!function_exists('emcp_tools_fs') || emcp_tools_fs()->can_use_premium_code());
    }
    public function can_read(): bool { return $this->is_available() && current_user_can('edit_theme_options'); }
    public function can_write(): bool { return $this->can_read(); }
    protected function operations(): array {
        $out=array();
        foreach(array(
            'get-context'=>array('read','Read active Blocksy theme and Companion availability.'),
            'get-settings'=>array('read','Read curated native layout sliders with defaults, limits and a settings hash.'),
            'get-design-settings'=>array('read','Read saved palette, typography, responsive spacing and header/footer placements. These complex settings are read-only.'),
            'update-settings'=>array('write','Update layout sliders: {values:{key:number}, expected_hash}. Unknown keys or out-of-range values are refused.'),
        ) as $op=>$d) { $out[$op]=array('mode'=>$d[0],'desc'=>$d[1],'perm'=>array($this,'can_'.$d[0]),'run'=>fn($args)=>$this->execute($op,$args)); }
        return $out;
    }
    private function settings(): array {
        $out=array();
        foreach(self::SETTINGS as $key=>$spec) { $out[$key]=array('value'=>get_theme_mod($key,$spec[0]),'default'=>$spec[0],'min'=>$spec[1],'max'=>$spec[2],'unit'=>'px'); }
        return array('settings'=>$out,'settings_hash'=>hash('sha256',wp_json_encode($out)));
    }
    public function execute(string $op,array $args) {
        if(!$this->can_read()) { return new WP_Error('forbidden',__('Blocksy theme access is unavailable.','emcp-tools')); }
        if($op==='get-context') { return array('theme'=>get_template(),'stylesheet'=>get_stylesheet(),'version'=>wp_get_theme('blocksy')->get('Version'),'companion'=>class_exists('Blocksy\\ExtensionsManager'),'content_blocks'=>post_type_exists('ct_content_block'),'blocks_integration'=>'blocksy-blocks','companion_tools'=>'blocksy-extensions-read, blocksy-content-read'); }
        if($op==='get-settings') { return $this->settings(); }
        if($op==='get-design-settings') {
            $keys=array('colorPalette','typography','h1Typography','h2Typography','h3Typography','h4Typography','h5Typography','h6Typography','contentAreaSpacing','contentEdgeSpacing','header_placements','footer_placements');
            $values=array(); foreach($keys as $key) { $values[$key]=get_theme_mod($key,null); }
            return array('saved_settings'=>$values,'note'=>__('Null means no saved override; native defaults apply. Complex design settings are read-only.','emcp-tools'));
        }
        if($op!=='update-settings') { return new WP_Error('unknown_operation',__('Unknown Blocksy theme operation.','emcp-tools')); }
        $values=$args['values']??null;
        if(!is_array($values)||!$values) { return new WP_Error('invalid_values',__('Provide layout setting values.','emcp-tools')); }
        foreach($values as $key=>$value) {
            if(!isset(self::SETTINGS[$key]) || (!is_int($value)&&!is_float($value)) || !is_finite((float)$value) || $value<self::SETTINGS[$key][1] || $value>self::SETTINGS[$key][2]) {
                return new WP_Error('invalid_setting',sprintf(__('Unknown or out-of-range setting: %s','emcp-tools'),$key));
            }
        }
        if(!add_option('emcp_blocksy_theme_lock',time(),'',false)) { return new WP_Error('locked',__('A theme save is in progress.','emcp-tools')); }
        try {
            if(!hash_equals($this->settings()['settings_hash'],(string)($args['expected_hash']??''))) { return new WP_Error('stale_content',__('Read theme settings again before saving.','emcp-tools')); }
            foreach($values as $key=>$value) { set_theme_mod($key,$value); }
            if(function_exists('blocksy_manager') && isset(blocksy_manager()->db) && method_exists(blocksy_manager()->db,'wipe_cache')) { blocksy_manager()->db->wipe_cache(); }
            do_action('blocksy:dynamic-css:refresh-caches');
            return $this->settings();
        } finally { delete_option('emcp_blocksy_theme_lock'); }
    }
}
