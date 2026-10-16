<?php
/** Supported native Oxygen 6 class properties (verified against selectors.twig). */
if (!defined('ABSPATH')) { exit; }
class EMCP_Tools_Oxygen_Styles {
    public static function paths(): array {
        $paths = array();
        foreach (array(
            'layout'=>array('display','visibility','flex_direction','flex_align.primary_axis','flex_align.cross_axis','grid.simple_grid_template_columns','grid.simple_grid_template_rows','grid_align.primary_axis','grid_align.cross_axis'),
            'typography'=>array('color','font_family','font_weight','text_align','text_transform','style.text_decoration','style.font_style','overflow_wrap','text_wrap'),
            'background'=>array('background_color'),
            'size'=>array('overflow','object_fit','box_sizing'),
            'position'=>array('position','z_index'),
            'flex_child'=>array('flex_grow','flex_shrink','align_self','order'),
        ) as $group=>$keys) { foreach ($keys as $key) { $paths[$group.'.'.$key]='scalar'; } }
        foreach (array('size'=>array('width','height','min_width','min_height','max_width','max_height'), 'typography'=>array('font_size','line_height','letter_spacing'), 'layout'=>array('gap.row','gap.column'), 'position'=>array('top','right','bottom','left'), 'flex_child'=>array('flex_basis')) as $group=>$keys) { foreach ($keys as $key) { $paths[$group.'.'.$key]='unit'; } }
        foreach (array('margin','padding') as $kind) { foreach (array('top','right','bottom','left') as $side) { $paths['spacing.spacing.'.$kind.'.'.$side]='unit'; } }
        return $paths;
    }
    public static function schema(): array {
        return array('format'=>'properties[breakpoint_id][group][property]. Class IDs are applied through element properties.meta.classes.', 'paths'=>self::paths(), 'unit_example'=>array('number'=>24,'unit'=>'px','style'=>'24px'), 'breakpoints'=>\Breakdance\Config\Breakpoints\get_breakpoints(), 'limitations'=>array('Supported core layout, spacing, typography and background controls only.', 'No custom CSS, nested selectors, conditions or arbitrary executable content.'));
    }
    public static function validate(array $properties, array $breakpoints) {
        $paths=self::paths();
        $walk=function($value,$path) use (&$walk,$paths) {
            if ($value===null && isset($paths[$path])) { return true; }
            if (isset($paths[$path])) {
                if ($paths[$path]==='unit') {
                    if (!is_array($value) || !isset($value['number'],$value['unit'],$value['style']) || !is_numeric($value['number']) || !in_array($value['unit'],array('','px','%','rem','em','vw','vh','svh','dvh','ch'),true) || (string)$value['style']!==(string)$value['number'].$value['unit'] || array_diff(array_keys($value),array('number','unit','style'))) { return new WP_Error('invalid_style','Expected a native numeric unit at '.$path); }
                } elseif (!is_scalar($value) || strlen((string)$value)>200 || preg_match('/[;{}<>\\\\]|url\s*\(|expression\s*\(/i',(string)$value)) { return new WP_Error('invalid_style','Invalid scalar at '.$path); }
                return true;
            }
            if (!is_array($value) || array_is_list($value)) { return new WP_Error('invalid_style','Unsupported native style path: '.$path); }
            foreach ($value as $key=>$child) { $r=$walk($child,ltrim($path.'.'.$key,'.')); if (is_wp_error($r)) { return $r; } }
            return true;
        };
        foreach ($properties as $breakpoint=>$values) {
            if (!in_array($breakpoint,$breakpoints,true) || !is_array($values)) { return new WP_Error('invalid_style','Unknown breakpoint or malformed style group.'); }
            if (!$values) { continue; }
            $r=$walk($values,''); if (is_wp_error($r)) { return $r; }
        }
        return true;
    }
}
