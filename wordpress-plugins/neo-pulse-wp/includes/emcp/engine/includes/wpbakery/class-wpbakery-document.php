<?php
/** Lossless native shortcode validation for the verified WPBakery core subset. */
if (!defined('ABSPATH')) { exit; }
class EMCP_Tools_WPBakery_Document {
    public static function parents(): array {
        return array(
            'vc_row'=>array('root'), 'vc_column'=>array('vc_row'),
            'vc_row_inner'=>array('vc_column'), 'vc_column_inner'=>array('vc_row_inner'),
            'vc_column_text'=>array('vc_column','vc_column_inner'),
            'vc_custom_heading'=>array('vc_column','vc_column_inner'),
            'vc_btn'=>array('vc_column','vc_column_inner'),
            'vc_single_image'=>array('vc_column','vc_column_inner'),
            'vc_icon'=>array('vc_column','vc_column_inner'),
            'vc_separator'=>array('vc_column','vc_column_inner'),
            'vc_text_separator'=>array('vc_column','vc_column_inner'),
            'vc_empty_space'=>array('vc_column','vc_column_inner'),
            'vc_video'=>array('vc_column','vc_column_inner'),
            'vc_progress_bar'=>array('vc_column','vc_column_inner'),
            'vc_pie'=>array('vc_column','vc_column_inner'),
        );
    }
    public static function validate_css(string $css) {
        return strlen($css)>200000 || str_contains($css,'<') ? new WP_Error('invalid_css','Use CSS only, without HTML tags, at most 200 KB.') : true;
    }
    public static function containers(): array { return array('vc_row','vc_column','vc_row_inner','vc_column_inner'); }
    /** Validate complete coverage: never silently discard unknown shortcodes or text. */
    public static function validate(string $content, ?callable $allowed=null) {
        if(strlen($content)>1000000) { return new WP_Error('invalid_content','Content exceeds 1 MB.'); }
        preg_match_all('/\[(\/?)([a-zA-Z_][\w-]*)([^\]]*)\]/s',$content,$matches,PREG_SET_ORDER|PREG_OFFSET_CAPTURE);
        $stack=array('root'); $end=0; $count=0;
        foreach($matches as $m) {
            $between=substr($content,$end,$m[0][1]-$end); $parent=end($stack);
            if(trim($between)!=='' && $parent!=='vc_column_text') { return new WP_Error('invalid_content','Text belongs inside vc_column_text; malformed or unknown markup is not editable.'); }
            if(str_contains($between,'[') || str_contains($between,']')) { return new WP_Error('invalid_content','Literal square brackets must be HTML entities.'); }
            $type=$m[2][0]; $closing=$m[1][0]==='/'; $attrs=trim($m[3][0]); $end=$m[0][1]+strlen($m[0][0]);
            if(!isset(self::parents()[$type])) { return new WP_Error('unsupported_element','Unsupported shortcode: '.$type.'. Raw content remains readable.'); }
            if($closing) {
                if($attrs!=='' || $parent!==$type) { return new WP_Error('invalid_content','Mismatched closing shortcode: '.$type); }
                array_pop($stack); continue;
            }
            if(++$count>2000 || count($stack)>30) { return new WP_Error('invalid_content','Layout is too large.'); }
            if(!in_array($parent,self::parents()[$type],true)) { return new WP_Error('invalid_nesting','Invalid parent for '.$type); }
            if($allowed && !$allowed($type)) { return new WP_Error('element_forbidden','Element is unavailable or restricted: '.$type); }
            $self_closing=str_ends_with($attrs,'/'); if($self_closing) { $attrs=rtrim(substr($attrs,0,-1)); }
            // Match every attribute byte, including quoted values. Reject duplicates and injected markup.
            $offset=0; $seen=array();
            while($offset<strlen($attrs)) {
                if(!preg_match('/\G\s*([a-zA-Z_][\w-]*)\s*=\s*("[^"<>\[\]]*"|\'[^\'<>\[\]]*\'|[^\s"\'<>\[\]=]+)\s*/s',$attrs,$a,0,$offset)) { return new WP_Error('invalid_attributes','Use named, safely quoted shortcode attributes.'); }
                $key=strtolower($a[1]); if(isset($seen[$key])) { return new WP_Error('invalid_attributes','Duplicate attribute: '.$key); }
                $seen[$key]=true; $offset+=strlen($a[0]);
            }
            if(in_array($type,self::containers(),true) || $type==='vc_column_text') {
                if($self_closing) { return new WP_Error('invalid_content','Containers and text require closing tags.'); }
                $stack[]=$type;
            }
        }
        if(count($stack)!==1 || trim(substr($content,$end))!=='') { return new WP_Error('invalid_content','Unclosed shortcodes or trailing text.'); }
        return true;
    }
}
