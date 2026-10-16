<?php
/** Divi Theme Options: native definitions, partial saves and bounded recovery data. */
if (!defined('ABSPATH')) { exit; }
class EMCP_Tools_Divi_Settings
{
    public static function schema(): array
    {
        $names = array('options', 'epanelMainTabs', 'themename', 'shortname');
        $old = array();
        foreach ($names as $name) { $old[$name] = array_key_exists($name, $GLOBALS) ? array($GLOBALS[$name]) : array(); }
        try {
            $GLOBALS['shortname'] = 'divi';
            $GLOBALS['themename'] = 'Divi';
            require get_template_directory() . '/options_divi.php';
            $definitions = $GLOBALS['options'];
        } finally {
            foreach ($old as $name => $v) { if ($v) { $GLOBALS[$name] = $v[0]; } else { unset($GLOBALS[$name]); } }
        }
        $out = array();
        foreach ($definitions as $d) {
            if (empty($d['id'])) { continue; }
            $id = $d['id'];
            $type = $d['type'] ?? '';
            $secret = $type === 'password' || preg_match('/api_key|username|password|token|secret|license/i', $id);
            $executable = preg_match('/integration_(head|body|single)|adsense|custom_css/', $id);
            $supported = in_array($type, array('checkbox', 'checkbox2', 'text', 'textarea', 'select', 'upload', 'checkboxes', 'different_checkboxes'), true);
            $field = array('label' => html_entity_decode(wp_strip_all_tags($d['name'] ?? $id)), 'control' => $type, 'writable' => !$secret && !$executable && $supported, 'redacted' => (bool) ($secret || $executable));
            if (!$field['redacted']) { $field['default'] = $d['std'] ?? ''; }
            if (isset($d['options'])) { $field['choices'] = array_values(array_is_list($d['options']) ? $d['options'] : array_keys($d['options'])); }
            $out[$id] = $field;
        }
        return $out;
    }
    public static function read(): array
    {
        $schema = self::schema();
        $values = array();
        foreach ($schema as $key => $field) {
            if ($field['redacted']) { continue; }
            $values[$key] = et_get_option($key, $field['default'] ?? '');
        }
        return array('schema' => $schema, 'values' => $values, 'settings_hash' => hash('sha256', wp_json_encode($values)));
    }
    public static function validate_patch(array $patch, array $schema)
    {
        if (!$patch || count($patch) > 100) { return new WP_Error('invalid_settings', 'Provide between 1 and 100 named settings.'); }
        foreach ($patch as $key => $v) {
            $f = $schema[$key] ?? null;
            if (!$f || !$f['writable']) { return new WP_Error('invalid_settings', 'Setting is unavailable for writes: ' . $key); }
            if (in_array($f['control'], array('checkbox','checkbox2'), true)) {
                if (!in_array($v, array('on','off'), true)) { return new WP_Error('invalid_settings', 'Checkbox values must be on or off.'); }
            } elseif ($f['control'] === 'select') {
                if (!in_array($v, $f['choices'], true)) { return new WP_Error('invalid_settings', 'Choose a native select value.'); }
            } elseif (in_array($f['control'], array('checkboxes','different_checkboxes'), true)) {
                if (!is_array($v) || !array_is_list($v) || array_diff($v, $f['choices'] ?? array())) { return new WP_Error('invalid_settings', 'Invalid checkbox list.'); }
            } else {
                if (!is_string($v) || strlen($v) > 10000 || wp_strip_all_tags($v) !== $v || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', $v)) { return new WP_Error('invalid_settings', 'Expected plain text.'); }
                if (($f['control'] === 'upload' || preg_match('/url|_logo$/', $key)) && $v !== '' && (!in_array(wp_parse_url($v, PHP_URL_SCHEME), array('http','https'), true) || esc_url_raw($v) !== $v)) { return new WP_Error('invalid_settings', 'Use an HTTP(S) URL.'); }
            }
        }
        return true;
    }
    public static function update(array $patch, string $hash)
    {
        if (!add_option('emcp_divi_settings_lock', time(), '', false)) { return new WP_Error('settings_locked', 'A settings save is in progress.'); }
        try {
            $state = self::read();
            if (!hash_equals($state['settings_hash'], $hash)) { return new WP_Error('stale_settings', 'Re-read theme options before saving.'); }
            $valid = self::validate_patch($patch, $state['schema']);
            if (is_wp_error($valid)) { return $valid; }
            $before = array_intersect_key($state['values'], $patch);
            self::backup('theme-options', $before);
            foreach ($patch as $key => $value) { et_update_option($key, $value); }
            EMCP_Tools_Divi_Integration::clear_cache();
            $after = self::read();
            foreach ($patch as $key => $value) { if ($after['values'][$key] !== $value) { return new WP_Error('save_failed', 'Settings readback differs. Re-read before retrying; previous values are in the recovery snapshot.'); } }
            $after['previous_values'] = $before;
            return $after;
        } finally { delete_option('emcp_divi_settings_lock'); }
    }
    public static function backup(string $kind, array $value): void
    {
        $backups = (array) get_option('emcp_divi_recovery', array());
        $backups[] = array('time' => time(), 'user_id' => get_current_user_id(), 'kind' => $kind, 'value' => $value);
        update_option('emcp_divi_recovery', array_slice($backups, -20), false);
    }
}
