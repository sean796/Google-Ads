<?php
/** Native Divi Theme Builder templates and assignment management. */
if (!defined('ABSPATH')) { exit; }
class EMCP_Tools_Divi_Theme_Builder
{
    public static function read(): array
    {
        $id = et_theme_builder_get_theme_builder_post_id(true,false);
        $templates = $id ? array_values(et_theme_builder_get_theme_builder_templates(true,$id)) : array();
        return array('theme_builder_id'=>$id,'templates'=>$templates,'theme_builder_hash'=>hash('sha256',wp_json_encode(array($id,$templates))),'admin_url'=>admin_url('admin.php?page=et_theme_builder'));
    }
    public static function validate_conditions($values)
    {
        if (!is_array($values) || !array_is_list($values) || count($values)>100) { return new WP_Error('invalid_conditions','Expected at most 100 condition strings.'); }
        $native = et_theme_builder_get_flat_template_settings_options();
        foreach ($values as $value) {
            if (!is_string($value)) { return new WP_Error('invalid_conditions','Conditions must be strings.'); }
            if (isset($native[$value]) && empty($native[$value]['options'])) { continue; }
            $ok = false;
            foreach ($native as $prefix=>$rule) {
                if (empty($rule['options']) || !str_starts_with($value,$prefix)) { continue; }
                $suffix=substr($value,strlen($prefix));
                $role = ($rule['options']['type']??'') === 'user_role';
                if (!$role && (!ctype_digit($suffix) || (int)$suffix<1)) { continue; }
                $choices=et_theme_builder_get_template_setting_child_options($rule,$role?array():array((int)$suffix),'',1,1);
                foreach ($choices as $choice) { if (is_array($choice) && ($choice['id']??'') === $value) { $ok=true; } }
            }
            if (!$ok) { return new WP_Error('invalid_conditions','Unknown or unavailable native assignment: '.$value); }
        }
        return true;
    }
    public static function validate_patch(array $patch)
    {
        if (array_diff(array_keys($patch),array('title','enabled','layouts','use_on','exclude_from'))) { return new WP_Error('invalid_template','Unknown template setting.'); }
        if (isset($patch['title']) && (!is_string($patch['title']) || trim($patch['title']) === '' || sanitize_text_field($patch['title']) !== $patch['title'])) { return new WP_Error('invalid_template','Use a plain-text title.'); }
        if (isset($patch['enabled']) && !is_bool($patch['enabled'])) { return new WP_Error('invalid_template','enabled must be boolean.'); }
        foreach (array('use_on','exclude_from') as $key) { if (isset($patch[$key])) { $r=self::validate_conditions($patch[$key]); if (is_wp_error($r)) { return $r; } } }
        if (isset($patch['layouts'])) {
            if (!is_array($patch['layouts']) || array_diff(array_keys($patch['layouts']),array('header','body','footer'))) { return new WP_Error('invalid_template','Use header, body or footer layout slots.'); }
            foreach ($patch['layouts'] as $kind=>$slot) {
                if (!is_array($slot) || array_diff(array_keys($slot),array('id','enabled'))) { return new WP_Error('invalid_template','A layout accepts id and enabled only.'); }
                if (isset($slot['enabled']) && !is_bool($slot['enabled'])) { return new WP_Error('invalid_template','Layout enabled must be boolean.'); }
                if (isset($slot['id'])) {
                    if (!is_int($slot['id']) || $slot['id']<0) { return new WP_Error('invalid_template','Layout ID must be a nonnegative integer.'); }
                    if ($slot['id'] && (get_post_type($slot['id']) !== 'et_'.$kind.'_layout' || get_post_status($slot['id']) !== 'publish' || !current_user_can('edit_post',$slot['id']))) { return new WP_Error('invalid_template','Layout is unavailable or has the wrong type.'); }
                }
            }
        }
        return true;
    }
    public static function mutate(string $action,array $args)
    {
        if (!add_option('emcp_divi_theme_builder_lock',time(),'',false)) { return new WP_Error('template_locked','A Theme Builder save is in progress.'); }
        try {
            $state=self::read();
            if (!hash_equals($state['theme_builder_hash'],$args['expected_hash'])) { return new WP_Error('stale_templates','Theme Builder changed; re-read first.'); }
            if ($state['theme_builder_id'] && get_option('et_tb_templates_backup_'.$state['theme_builder_id'],false)!==false) { return new WP_Error('template_locked','Divi is currently saving Theme Builder.'); }
            if (et_theme_builder_get_theme_builder_post_id(false,false)) { return new WP_Error('template_locked','Divi has an unsaved Theme Builder draft. Save or discard it in Divi before editing through MCP.'); }
            $id=(int)($args['template_id']??0);
            $existing=null;
            foreach ($state['templates'] as $t) { if ($t['id']===$id) { $existing=$t; } }
            if ($action!=='create-template' && (!$existing || !current_user_can('edit_post',$id))) { return new WP_Error('template_forbidden','Template is not in this Theme Builder or cannot be edited.'); }
            if (!function_exists('wp_check_post_lock')) { require_once ABSPATH.'wp-admin/includes/post.php'; }
            if ($id && wp_check_post_lock($id) || $state['theme_builder_id'] && wp_check_post_lock($state['theme_builder_id'])) { return new WP_Error('template_locked','Theme Builder is being edited.'); }
            if ($action==='remove-template') {
                if (empty($args['confirm']) || $existing['default']) { return new WP_Error('invalid_template','Confirm removal; the default template cannot be removed.'); }
                EMCP_Tools_Divi_Settings::backup('theme-builder',$state);
                if (!wp_trash_post($id)) { return new WP_Error('save_failed','Could not trash template.'); }
                delete_post_meta($state['theme_builder_id'],'_et_template',$id);
            } else {
                $patch=$action==='create-template'?array('title'=>$args['title']):$args['settings'];
                $valid=self::validate_patch($patch);
                if (is_wp_error($valid)) { return $valid; }
                $template=$existing?:array('id'=>0,'default'=>false,'enabled'=>false,'layouts'=>array('header'=>array('id'=>0,'enabled'=>true),'body'=>array('id'=>0,'enabled'=>true),'footer'=>array('id'=>0,'enabled'=>true)),'use_on'=>array(),'exclude_from'=>array());
                $template=EMCP_Tools_Divi_Tree::merge($template,$patch);
                if (!$template['default'] && $template['enabled'] && !$template['use_on']) { return new WP_Error('invalid_template','An enabled custom template needs an explicit use_on assignment.'); }
                $template['default']=$template['default']?'1':'0';
                $template['enabled']=$template['enabled']?'1':'0';
                $template['autogenerated_title']='0';
                EMCP_Tools_Divi_Settings::backup('theme-builder',$state);
                $tb=$state['theme_builder_id']?:et_theme_builder_get_theme_builder_post_id(true,true);
                if (!$tb || is_wp_error($tb)) { return new WP_Error('save_failed','Could not create Theme Builder.'); }
                $new_id=et_theme_builder_store_template($tb,$template,$template['default']==='1');
                if (!$new_id) { return new WP_Error('save_failed','Native template save failed; re-read before retrying.'); }
                if (!$existing) { add_post_meta($tb,'_et_template',$new_id); }
                $id=$new_id;
            }
            EMCP_Tools_Divi_Integration::clear_cache();
            $after=self::read();
            $after['template_id']=$id;
            $after['previous_state']=$state;
            return $after;
        } catch (Throwable $error) { return new WP_Error('save_failed','Template save did not complete. Re-read before retrying; a recovery snapshot may be available.'); }
        finally { delete_option('emcp_divi_theme_builder_lock'); }
    }
}
