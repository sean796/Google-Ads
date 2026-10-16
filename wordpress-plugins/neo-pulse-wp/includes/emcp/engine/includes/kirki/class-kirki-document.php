<?php
/** Kirki 6 native flat element graph contracts. */
if (!defined('ABSPATH')) { exit; }
class EMCP_Tools_Kirki_Document {
    public static function blank(): array {
        return array('root'=>array('id'=>'root','name'=>'root','title'=>'Body','accept'=>'*','children'=>array(),'styleIds'=>array()));
    }
    public static function starters(): array {
        $out=array();
        foreach(array('section'=>'section','div'=>'div','container'=>'div','heading'=>'h1','paragraph'=>'p','text'=>'span','button'=>'a','image'=>'img') as $name=>$tag) {
            $p=array('tag'=>$tag);
            if(in_array($name,array('heading','paragraph','text'),true)) { $p['contents']=array('Your text'); }
            if($name==='button') { $p['type']='href'; $p['attributes']=array('href'=>'#','target'=>''); }
            if($name==='image') { $p+=array('noEndTag'=>true,'load'=>'lazy','attributes'=>array('src'=>'','alt'=>'')); }
            $out[$name]=array('name'=>$name,'title'=>ucfirst($name),'source'=>'kirki','visibility'=>true,'collapse'=>false,'className'=>'','properties'=>$p,'children'=>array(),'styleIds'=>array());
            if(isset($p['contents']) || $name==='image') { unset($out[$name]['children']); }
        }
        return $out;
    }
    /** Validate references before handing a graph to Kirki's recursive renderer. */
    public static function validate(array $blocks, array $styles, array $global_styles=array()) {
        if(!isset($blocks['root']) || count($blocks)>5000 || strlen(wp_json_encode(array($blocks,$styles)))>4000000) { return new WP_Error('invalid_graph','Provide a root and at most 5000 elements / 4 MB.'); }
        $edges=array(); $parents=array();
        foreach($blocks as $id=>$node) {
            if(!is_string($id) || !preg_match('/^[a-zA-Z0-9_-]{1,100}$/D',$id) || !is_array($node) || ($node['id']??null)!==$id || !is_string($node['name']??null)) { return new WP_Error('invalid_graph','Every element needs a matching string ID and name.'); }
            if($id==='root' && $node['name']!=='root') { return new WP_Error('invalid_graph','Root must be the native root element.'); }
            if($id!=='root' && !is_array($node['properties']??null)) { return new WP_Error('invalid_graph','Element properties must be an object.'); }
            $children=$node['children']??array();
            if(!is_array($children) || !array_is_list($children)) { return new WP_Error('invalid_graph','Children must be an ordered ID list.'); }
            $contents=$node['properties']['contents']??array();
            if(is_array($contents)) { foreach($contents as $content) { if(is_array($content) && isset($content['id'])) { $children[]=$content['id']; } } }
            $edges[$id]=array();
            foreach($children as $child) {
                if(!is_string($child) || !isset($blocks[$child]) || $child==='root') { return new WP_Error('invalid_graph','A child reference is missing or points to root.'); }
                // Rich text can reference the same inline child in contents and children.
                if(in_array($child,$edges[$id],true)) { continue; }
                if(isset($parents[$child]) && $parents[$child]!==$id) { return new WP_Error('invalid_graph','An element cannot have two parents.'); }
                if(($blocks[$child]['parentId']??null)!==$id) { return new WP_Error('invalid_graph','parentId must match the owning element.'); }
                $parents[$child]=$id; $edges[$id][]=$child;
            }
            $refs=$node['styleIds']??array(); $classes=$node['properties']['classesIds']??array();
            if(!is_array($refs) || !is_array($classes)) { return new WP_Error('invalid_styles','Style references must be arrays.'); }
            foreach(array_merge($refs,$classes) as $ref) { if(!is_string($ref) || (!isset($styles[$ref]) && !isset($global_styles[$ref]))) { return new WP_Error('invalid_styles','A referenced style is missing.'); } }
        }
        $seen=array(); $walk=function($id,$depth) use (&$walk,&$seen,$edges) {
            if($depth>100 || isset($seen[$id])) { return false; }
            $seen[$id]=true; foreach($edges[$id] as $child) { if(!$walk($child,$depth+1)) { return false; } } return true;
        };
        if(!$walk('root',0) || count($seen)!==count($blocks)) { return new WP_Error('invalid_graph','The graph contains a cycle, orphan or excessive nesting.'); }
        foreach($styles as $id=>$style) {
            if(!is_array($style) || ($style['id']??null)!==$id || !in_array($style['type']??'',array('class','tag'),true) || !isset($style['name']) || !is_array($style['variant']??null)) { return new WP_Error('invalid_styles','Styles need matching IDs, type, name and a variant map.'); }
            foreach($style['variant'] as $variant=>$css) { if(!is_string($variant) || !is_string($css)) { return new WP_Error('invalid_styles','Variant values must be CSS declaration strings.'); } }
        }
        return true;
    }
    public static function edit(array $blocks,string $operation,array $args) {
        $id=$args['element_id']??''; $parent=$args['parent_id']??'root';
        if($operation==='add-element') {
            $node=$args['element']; $id=$node['id']??'';
            if(!$id || isset($blocks[$id]) || !isset($blocks[$parent]['children']) || !empty($node['children'])) { return new WP_Error('invalid_element','Add one new element to an existing container; use set-page-content for subtrees.'); }
            $node['parentId']=$parent; $blocks[$id]=$node; $blocks[$parent]['children'][]=$id;
        } elseif($operation==='update-element') {
            if($id==='root' || !isset($blocks[$id])) { return new WP_Error('invalid_element','Choose an existing non-root element.'); }
            $patch=$args['properties']; $blocks[$id]['properties']=array_replace($blocks[$id]['properties'],$patch);
        } else { return new WP_Error('invalid_operation','Unknown graph operation.'); }
        return $blocks;
    }
}
