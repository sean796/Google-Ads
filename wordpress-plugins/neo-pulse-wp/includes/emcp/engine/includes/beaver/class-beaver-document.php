<?php
/** Validate Beaver's flat native node map before any mutation. */
if (!defined('ABSPATH')) { exit; }
class EMCP_Tools_Beaver_Document {
    public static function modules(): array { return array('heading','rich-text','button','photo','icon','separator','html','accordion','tabs','numbers','callout','cta','testimonials','pricing-table','button-group'); }
    public static function validate(array $nodes, ?array $enabled=null) {
        if(count($nodes)>2000 || strlen(json_encode($nodes))>2000000) { return new WP_Error('invalid_layout','Layout exceeds 2000 nodes or 2 MB.'); }
        $positions=array();
        foreach($nodes as $id=>$n) {
            $id=(string)$id;
            if(!preg_match('/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/',$id) || !is_array($n) || ($n['node']??null)!==$id) { return new WP_Error('invalid_layout','Use unique node IDs matching their map keys.'); }
            $type=$n['type']??''; $parent=$n['parent']??null;
            if(!in_array($type,array('row','column-group','column','module'),true) || !array_key_exists('parent',$n) || !is_int($n['position']??null) || $n['position']<0) { return new WP_Error('invalid_layout','Every node needs a native type, parent and nonnegative integer position.'); }
            if($parent!==null && (!is_string($parent) || !isset($nodes[$parent]))) { return new WP_Error('invalid_layout','Missing parent.'); }
            $parent_type=$parent===null?'root':($nodes[$parent]['type']??'');
            $allowed=array('row'=>array('root'),'column-group'=>array('row','column'),'column'=>array('column-group'),'module'=>array('row','column'));
            if(!in_array($parent_type,$allowed[$type],true)) { return new WP_Error('invalid_layout','Invalid native node nesting.'); }
            $pos=($parent??'root').':'.$n['position']; if(isset($positions[$pos])) { return new WP_Error('invalid_layout','Sibling positions must be unique.'); } $positions[$pos]=true;
            foreach(array('global','dynamic','template_id','template_node_id','template_root_node') as $key) { if(!empty($n[$key])) { return new WP_Error('shared_layout','Shared and dynamic template references are read-only in this adapter.'); } }
            if($type==='column-group') { if(!empty($n['settings'])) { return new WP_Error('invalid_layout','Column groups have empty settings.'); } }
            elseif(!is_array($n['settings']??null)) { return new WP_Error('invalid_layout','Node settings must be an object.'); }
            if($type==='module') {
                $module=$n['settings']['type']??'';
                if(!in_array($module,self::modules(),true) || ($enabled!==null && !in_array($module,$enabled,true))) { return new WP_Error('unsupported_module','Module unavailable or outside verified authoring scope: '.$module); }
            }
            if($type==='column' && isset($n['settings']['size']) && (!is_numeric($n['settings']['size']) || $n['settings']['size']<=0 || $n['settings']['size']>100)) { return new WP_Error('invalid_layout','Column size must be greater than zero and at most 100.'); }
            $seen=array($id=>true); $ancestor=$parent;
            while($ancestor!==null) {
                if(isset($seen[$ancestor]) || count($seen)>30) { return new WP_Error('invalid_layout','Cyclic or excessively deep layout.'); }
                $seen[$ancestor]=true; $ancestor=$nodes[$ancestor]['parent']??null;
            }
        }
        return true;
    }
    public static function edit(array $nodes,string $action,array $args) {
        $id=$args['node_id']??'';
        if($action==='add-node') {
            $node=$args['node']; $id=$node['node']??'';
            if(isset($nodes[$id])) { return new WP_Error('duplicate_node','Node ID already exists.'); }
            $nodes[$id]=$node;
        } else {
            if(!isset($nodes[$id])) { return new WP_Error('missing_node','Unknown node ID.'); }
            if($action==='update-node') { $nodes[$id]['settings']=array_replace($nodes[$id]['settings'],$args['settings']); }
            elseif($action==='move-node') { $nodes[$id]['parent']=$args['parent_id']??null; $nodes[$id]['position']=$args['position']; }
            elseif($action==='remove-node') {
                $remove=array($id=>true);
                do { $changed=false; foreach($nodes as $key=>$node) { if(!isset($remove[$key]) && isset($remove[$node['parent']??''])) { $remove[$key]=true; $changed=true; } } } while($changed);
                $nodes=array_diff_key($nodes,$remove);
            } else { return new WP_Error('invalid_action','Unknown node edit.'); }
        }
        return $nodes;
    }
}
