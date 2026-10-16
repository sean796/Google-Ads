<?php
/** Native Architect HTML inspection and narrowly scoped element edits. */
if (!defined('ABSPATH')) { exit; }
class EMCP_Tools_Thrive_Content {
    public static function css(string $css) {
        if (strlen($css)>300000 || preg_match('/[<>\\\\]|\/\*|@import|url\s*\(|expression\s*\(|javascript|vbscript|behavior\s*:|-moz-binding/i',$css)) {
            return new WP_Error('unsafe_css','Use plain CSS without imports, URLs, escapes or executable content.');
        }
        return true;
    }
    public static function parse(string $html) {
        if (strlen($html)>1000000 || preg_match('/<\?|<!|\[\/?[a-zA-Z_]/',$html)) { return new WP_Error('unsupported_html','Oversized content, comments, shortcodes and declarations cannot be rewritten.'); }
        $doc=new DOMDocument('1.0','UTF-8');
        $before=libxml_use_internal_errors(true);
        try { $ok=$doc->loadHTML('<?xml encoding="UTF-8"><html><body><div id="emcp-thrive-root">'.$html.'</div></body></html>',LIBXML_NONET); }
        finally { libxml_clear_errors(); libxml_use_internal_errors($before); }
        if (!$ok) { return new WP_Error('invalid_html','Cannot parse native content.'); }
        $root=$doc->getElementById('emcp-thrive-root');
        $xpath=new DOMXPath($doc);
        $ids=array();
        foreach ($xpath->query('//*') as $el) {
            if (in_array($el->tagName,array('html','body'),true) || $el===$root) { continue; }
            if (!in_array(strtolower($el->tagName),array('div','span','p','h1','h2','h3','h4','h5','h6','a','img','br','hr','strong','em','b','i','u','s','ul','ol','li','blockquote','small','sup','sub','table','thead','tbody','tr','th','td'),true)) { return new WP_Error('unsupported_html','Unsupported native markup: '.$el->tagName); }
            foreach ($el->attributes as $attr) {
                $name=strtolower($attr->name); $value=$attr->value;
                if (!in_array($name,array('class','id','style','title','href','target','rel','src','alt','width','height','loading','decoding','colspan','rowspan','role','tabindex','data-css','data-tag','data-element-name','data-tcb_hover_state_parent','data-width','data-height','data-id','aria-label','aria-hidden','aria-expanded'),true)) { return new WP_Error('unsupported_attribute','Unsupported attribute: '.$name); }
                if ($name==='id' || $name==='data-css') {
                    if (!preg_match('/^[a-zA-Z0-9_-]+$/',$value) || ($name==='id' && $value==='emcp-thrive-root') || isset($ids[$name.':'.$value])) { return new WP_Error('invalid_element','Element IDs and data-css keys must be unique simple identifiers; emcp-thrive-root is reserved.'); }
                    $ids[$name.':'.$value]=true;
                }
                if (in_array($name,array('href','src'),true) && preg_match('/^(?:https?:\/\/|\/(?!\/)|#[a-zA-Z0-9_-]*$|mailto:|tel:)/i',trim($value))!==1) { return new WP_Error('unsafe_url','Use HTTP(S), local, fragment, email or phone URLs.'); }
                if ($name==='style' && is_wp_error($r=self::css($value))) { return $r; }
                if ($name==='class' && preg_match('/(?:thrv_(?:lead|html|shortcode)|tve-(?:leads|shortcode)|tcb-(?:symbol|dynamic)|thrive-shortcode)/i',$value)) { return new WP_Error('unsupported_html','Forms, executable and shared/dynamic elements are discovery-only.'); }
            }
        }
        if ($doc->getElementsByTagName('body')->item(0)->childNodes->length!==1) { return new WP_Error('invalid_html','Content escapes its root.'); }
        return array($doc,$root);
    }
    public static function html(DOMNode $root): string {
        $html=''; foreach ($root->childNodes as $child) { $html.=$root->ownerDocument->saveHTML($child); } return $html;
    }
    public static function elements(string $html) {
        $parsed=self::parse($html); if (is_wp_error($parsed)) { return $parsed; }
        [$doc,$root]=$parsed; $out=array();
        foreach ((new DOMXPath($doc))->query('.//*[@data-css or @id]',$root) as $el) {
            $out[]=array('key'=>$el->hasAttribute('data-css')?'data-css:'.$el->getAttribute('data-css'):'id:'.$el->getAttribute('id'),'tag'=>$el->tagName,'classes'=>$el->getAttribute('class'),'text'=>mb_substr(trim($el->textContent),0,160));
        }
        return $out;
    }
    private static function find(DOMDocument $doc,DOMNode $root,string $key) {
        if ($key==='root') { return $root; }
        if (!preg_match('/^(id|data-css):([a-zA-Z0-9_-]+)$/',$key,$m)) { return null; }
        $nodes=(new DOMXPath($doc))->query('.//*[@'.$m[1].'="'.$m[2].'"]',$root);
        return $nodes->length===1?$nodes->item(0):null;
    }
    public static function edit(string $html,string $action,array $args) {
        $parsed=self::parse($html); if (is_wp_error($parsed)) { return $parsed; }
        [$doc,$root]=$parsed;
        $node=self::find($doc,$root,$args['element_key']??'root');
        if (!$node || ($action!=='add-element' && $node===$root)) { return new WP_Error('invalid_element','Choose one current element key from get-page.'); }
        if ($action==='remove-element') { $node->parentNode->removeChild($node); }
        elseif ($action==='move-element') {
            $parent=self::find($doc,$root,$args['parent_key']);
            if (!$parent || !in_array($parent->nodeName,array('div','body'),true)) { return new WP_Error('invalid_parent','Choose a native container.'); }
            for ($p=$parent;$p;$p=$p->parentNode) { if ($p===$node) { return new WP_Error('invalid_move','Cannot move an element into itself or a descendant.'); } }
            $parent->appendChild($node);
        } else {
            $fragment=self::parse($args['html']); if (is_wp_error($fragment)) { return $fragment; }
            if ($action==='replace-element') {
                if ($fragment[1]->childNodes->length!==1 || !($fragment[1]->firstChild instanceof DOMElement)) { return new WP_Error('invalid_fragment','Replacement must have exactly one element.'); }
                $node->parentNode->replaceChild($doc->importNode($fragment[1]->firstChild,true),$node);
            } else {
                $parent=self::find($doc,$root,$args['parent_key']);
                if (!$parent || !in_array($parent->nodeName,array('div','body'),true)) { return new WP_Error('invalid_parent','Choose a native container.'); }
                foreach (iterator_to_array($fragment[1]->childNodes) as $child) { $parent->appendChild($doc->importNode($child,true)); }
            }
        }
        $result=self::html($root); $valid=self::parse($result);
        return is_wp_error($valid)?$valid:$result;
    }
}
