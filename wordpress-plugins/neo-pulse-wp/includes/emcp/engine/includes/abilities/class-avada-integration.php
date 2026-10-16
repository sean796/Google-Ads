<?php

/** Standalone Avada Builder integration, native shortcode storage. */
if (!defined('ABSPATH')) {
    exit;
}
class EMCP_Tools_Avada_Integration
{
    private $native_settings_ready = false;
    private function prepare_settings(): void
    {
        if ($this->native_settings_ready) {
            return;
        }
        // Avada lazily loads its option definitions outside the native editor.
        // Populate request-local defaults without changing saved global settings.
        if (class_exists('Avada_Options')) {
            Avada_Options::get_instance();
        }
        awb_get_fusion_settings()->reset_all_options();
        $this->native_settings_ready = true;
    }
    public static function supported(): bool
    {
        return defined('FUSION_BUILDER_VERSION') && version_compare(FUSION_BUILDER_VERSION, '3.16.1', '>=') && version_compare(FUSION_BUILDER_VERSION, '3.17', '<') && function_exists('awb_maybe_init_element_maps') && class_exists('FusionBuilder') && class_exists('Avada');
    }
    public static function definitions(): array
    {
        $post = array('type' => 'integer', 'minimum' => 1);
        $object = array('type' => 'object', 'additionalProperties' => true);
        $mutation = array('post_id' => $post, 'expected_hash' => array(
            'type' => 'string',
            'pattern' => '^[a-f0-9]{64}$',
            'description' => 'Current content_hash from get-page; re-read after each edit.',
        ));
        $parent = array('parent_id' => $post, 'position' => array('type' => 'integer', 'minimum' => 0));
        $page = array('page' => $post, 'per_page' => array(
            'type' => 'integer',
            'minimum' => 1,
            'maximum' => 100,
        ));
        return array(
            'list-core-content' => array('Avada Core', 'Avada Core Content', 'Discover existing portfolio items, FAQs and slider groups for Core display elements. Does not change source content.', false, $page + array('kind' => array('type' => 'string', 'enum' => array('portfolio', 'faq', 'slider'))), array('kind')),
            'get-context' => array('Discovery', 'Avada Context', 'Read installed version, permissions, supported types and storage contract. Start here.', false, array(), array()),
            'list-elements' => array('Discovery', 'List Avada Elements', 'List registered native element types and nesting rules. Some specialized elements are read-only in this adapter.', false, array(), array()),
            'get-element-schema' => array('Discovery', 'Avada Element Schema', 'Read native controls, defaults and nesting rules for a native shortcode type, e.g. fusion_title.', false, array('type' => array('type' => 'string')), array('type')),
            'list-pages' => array('Pages', 'List Avada Pages', 'List editable WordPress pages and their Avada status.', false, $page, array()),
            'get-page' => array('Pages', 'Get Avada Page', 'Read the native nested tree and content_hash for a page or existing template.', false, array('post_id' => $post), array('post_id')),
            'create-page' => array('Pages', 'Create Avada Draft', 'Create an empty draft with Avada Builder enabled.', true, array('title' => array('type' => 'string', 'minLength' => 1)), array('title')),
            'set-page-tree' => array('Pages', 'Set Avada Page Tree', 'Replace a page tree with root, _nextNodeId and nested nodes. Requires expected_hash; preserves template settings and page status.', true, $mutation + array('tree' => $object), array('post_id', 'expected_hash', 'tree')),
            'add-element' => array('Elements', 'Add Avada Element', 'Add a childless native element, allocating a unique ID. Read schema/defaults first; default parent is root 1.', true, $mutation + $parent + array('type' => array('type' => 'string'), 'properties' => $object), array('post_id', 'expected_hash', 'type')),
            'update-element' => array('Elements', 'Update Avada Element', 'Recursively merge named property groups while replacing lists and preserving other properties. IDs are scoped to the latest read.', true, $mutation + array('element_id' => $post, 'properties' => $object), array('post_id', 'expected_hash', 'element_id', 'properties')),
            'move-element' => array('Elements', 'Move Avada Element', 'Move a node and descendants to a parent and sibling position; rejects cycles and invalid nesting.', true, $mutation + $parent + array('element_id' => $post), array('post_id', 'expected_hash', 'element_id', 'parent_id')),
            'remove-element' => array('Elements', 'Remove Avada Element', 'Remove a node and its entire subtree; root cannot be removed.', true, $mutation + array('element_id' => $post), array('post_id', 'expected_hash', 'element_id')),
            'list-templates' => array('Templates & Design', 'List Avada Templates', 'List editable non-global library items and layout sections. Creation and conditions are not included.', false, $page, array()),
            'get-design-system' => array('Templates & Design', 'Avada Design System', 'Read allowlisted typography, colors, widths and breakpoint settings; no global writes.', false, array(), array()),
        );
    }
    public static function admin_categories(): array
    {
        $result = array();
        foreach (self::definitions() as $slug => $def) {
            $key = 'avada_' . sanitize_key($def[0]);
            if (!isset($result[$key])) {
                $result[$key] = array(
                    'platform' => 'avada',
                    'pro' => true,
                    'label' => 'Avada: ' . $def[0],
                    'tools' => array(),
                );
            }
            $result[$key]['tools']['emcp-tools/avada-' . $slug] = array(
                'label' => $def[1],
                'description' => $def[2],
                'badges' => $def[3] ? array('pro') : array('pro', 'read-only'),
                'available' => self::supported(),
                'requires' => array('name' => 'Avada 3.16.1–3.16.x', 'kind' => 'plugin'),
            );
        }
        return $result;
    }
    public function get_ability_names(): array
    {
        return array_map(static function ($slug) {
            return 'emcp-tools/avada-' . $slug;
        }, array_keys(self::definitions()));
    }
    public function register(): void
    {
        foreach (self::definitions() as $slug => $def) {
            emcp_tools_register_ability('emcp-tools/avada-' . $slug, array(
                'label' => $def[1],
                'description' => $def[2],
                'category' => 'emcp-tools',
                'input_schema' => array(
                    'type' => 'object',
                    'properties' => $def[4],
                    'required' => $def[5],
                    'additionalProperties' => false,
                ),
                'permission_callback' => function () use ($def) {
                    return $this->can_access($def[3]);
                },
                'execute_callback' => function ($args = array()) use ($slug) {
                    return $this->execute($slug, is_array($args) ? $args : array());
                },
                'meta' => array('show_in_rest' => true, 'annotations' => array(
                    'readonly' => !$def[3],
                    'destructive' => in_array($slug, array('set-page-tree', 'remove-element'), true),
                    'idempotent' => !$def[3],
                )),
            ));
        }
    }
    private function can_access(bool $write): bool
    {
        return self::supported() && EMCP_Tools_Page_Builders::enabled('avada') && current_user_can('edit_pages') && current_user_can(apply_filters('awb_role_manager_access_capability', 'edit_', 'page', 'backed_builder_edit'));
    }
    private function types(): array
    {
        return array_values(array_intersect(array('page', 'fusion_template', 'fusion_element', 'fusion_tb_section'), FusionBuilder::allowed_post_types()));
    }
    private function post_allowed(int $id): bool
    {
        return in_array(get_post_type($id), $this->types(), true) && !in_array(get_post_status($id), array('trash', 'auto-draft'), true) && current_user_can('edit_post', $id) && current_user_can(apply_filters('awb_role_manager_access_capability', 'edit_post', get_post_type($id), 'backed_builder_edit', $id), $id) && 'yes' !== get_post_meta($id, '_fusion_is_global', true);
    }
    private function maps(): array
    {
        $this->prepare_settings();
        // Core can load before the theme on REST/CLI requests. Its native loader is
        // idempotent and respects the theme's disabled Portfolio/FAQ settings.
        if (function_exists('fusion_init_shortcodes')) {
            fusion_init_shortcodes();
        }
        awb_maybe_init_element_maps();
        foreach (array(
            'fusion_faq' => 'fusion_element_faq',
            'fusion_portfolio' => 'fusion_element_portfolio',
            'fusion_fusionslider' => 'fusion_element_fusionslider',
        ) as $type => $callback) {
            if (!isset($GLOBALS['all_fusion_builder_elements'][$type]) && is_callable($callback)) {
                call_user_func($callback);
            }
        }
        return (array) ($GLOBALS['all_fusion_builder_elements'] ?? array());
    }
    public function element_schema(string $type): array
    {
        $m = $this->maps()[$type] ?? array();
        if (!$m) {
            return array();
        }
        $fields = array();
        // Native saves include compatibility attributes no longer shown in the
        // current control panel. Keep scalar defaults in the storage schema.
        foreach ($m['defaults'] ?? array() as $name => $default) {
            if (is_scalar($default)) {
                $fields[$name] = array(
                    'type' => 'native_attribute',
                    'param_name' => $name,
                    'default' => $default,
                );
            }
        }
        if (in_array($type, array('fusion_builder_column', 'fusion_builder_column_inner'), true)) {
            $fields['first'] = array(
                'type' => 'native_attribute',
                'param_name' => 'first',
                'default' => '',
            );
        }
        $params = apply_filters('fusion_builder_element_params', $m['params'] ?? array(), $type);
        foreach ($params as $p) {
            if (empty($p['param_name'])) {
                continue;
            }
            $field = array_intersect_key($p, array_flip(array('type', 'heading', 'description', 'param_name', 'value', 'default', 'responsive', 'dependency', 'choices', 'remove_from_atts')));
            $fields[$p['param_name']] = $field;
            // Composite UI controls serialize their individual choices, not the group.
            $parts = ($p['type'] ?? '') === 'typography' ? $p['choices'] ?? array() : (($p['type'] ?? '') === 'dimension' ? array_combine(array_keys($p['value'] ?? array()), array_keys($p['value'] ?? array())) : array());
            foreach ($parts as $part => $name) {
                if (!is_string($name) || $name === '') {
                    continue;
                }
                $names = $part === 'font-family' ? array('fusion_font_family_' . $name, 'fusion_font_variant_' . $name) : array($name);
                foreach ($names as $name) {
                    $fields[$name] = array(
                        'type' => 'textfield',
                        'param_name' => $name,
                        'default' => $p['default'][$part] ?? '',
                        'source_control' => $p['param_name'],
                    ) + (isset($p['responsive']) ? array('responsive' => $p['responsive']) : array());
                }
            }
        }
        $enabled_elements = $GLOBALS['fusion_builder_enabled_elements'] ?? '';
        $enabled = $enabled_elements === '' || in_array($type, (array) $enabled_elements, true) || str_starts_with($type, 'fusion_builder_');
        return array(
            'type' => $type,
            'name' => wp_strip_all_tags($m['name'] ?? $type),
            'provider' => in_array($type, array('fusion_faq', 'fusion_portfolio', 'fusion_fusionslider', 'fusion_privacy'), true) ? 'avada-core' : 'avada-builder',
            'fields' => $fields,
            'enabled' => $enabled,
            'authoring_supported' => $enabled && in_array($type, EMCP_Tools_Avada_Tree::supported_types(), true),
            'multi' => $m['multi'] ?? null,
            'element_child' => $m['element_child'] ?? null,
            'allowed_parents' => EMCP_Tools_Avada_Tree::allowed_parents($type),
        );
    }
    public function execute(string $slug, array $args)
    {
        $def = self::definitions()[$slug] ?? null;
        if (!$def || !$this->can_access($def[3])) {
            return new WP_Error('avada_forbidden', 'Select Avada and use an account with native builder access.');
        }
        if (in_array('emcp-tools/avada-' . $slug, (array) get_option('emcp_tools_disabled_tools', array()), true)) {
            return new WP_Error('tool_disabled', 'This Avada tool is disabled.');
        }
        switch ($slug) {
            case 'get-context':
                return array(
                    'version' => FUSION_BUILDER_VERSION,
                    'theme' => get_template(),
                    'core_version' => defined('FUSION_CORE_VERSION') ? FUSION_CORE_VERSION : null,
                    'can_write' => $this->can_access(true),
                    'post_types' => $this->types(),
                    'storage' => 'post_content shortcodes',
                    'node_ids' => 'Temporary IDs scoped to content_hash; use returned IDs after every write.',
                    'authoring_types' => EMCP_Tools_Avada_Tree::supported_types(),
                    'limitations' => array('Forms, code, global elements, dynamic data and specialized nesting are read-only.', 'Global options, Core source content and template conditions are read-only.'),
                );
            case 'list-core-content':
                return $this->core_content($args);
            case 'list-elements':
                $out = array();
                foreach ($this->maps() as $type => $map) {
                    $s = $this->element_schema($type);
                    unset($s['fields']);
                    $out[] = $s;
                }
                return array('elements' => $out);
            case 'get-element-schema':
                return $this->element_schema($args['type'] ?? '') ?: new WP_Error('unknown_element', 'Unknown element.');
            case 'get-design-system':
                if (!current_user_can('edit_theme_options')) {
                    return new WP_Error('avada_forbidden', 'Design discovery requires edit_theme_options.');
                }
                $this->prepare_settings();
                $settings = awb_get_fusion_settings();
                $out = array();
                foreach (array('primary_color', 'body_typography', 'h1_typography', 'h2_typography', 'h3_typography', 'site_width', 'content_break_point', 'visibility_small', 'visibility_medium') as $key) {
                    $out[$key] = $settings->get($key);
                }
                return array('settings' => $out);
            case 'list-pages':
            case 'list-templates':
                $types = $slug === 'list-pages' ? array('page') : array_values(array_diff($this->types(), array('page')));
                if (!$types) {
                    return array('items' => array(), 'has_more' => false);
                }
                $q = new WP_Query(array(
                    'post_type' => $types,
                    'post_status' => array('publish', 'draft', 'private', 'pending', 'future'),
                    'posts_per_page' => min(100, max(1, (int) ($args['per_page'] ?? 20))),
                    'paged' => max(1, (int) ($args['page'] ?? 1)),
                    'orderby' => 'ID',
                    'order' => 'DESC',
                    'perm' => 'editable',
                ));
                $out = array();
                foreach ($q->posts as $p) {
                    if ($this->post_allowed($p->ID)) {
                        $out[] = array(
                            'post_id' => $p->ID,
                            'title' => $p->post_title,
                            'status' => $p->post_status,
                            'builder_active' => get_post_meta($p->ID, 'fusion_builder_status', true) === 'active',
                        );
                    }
                }
                return array('items' => $out, 'has_more' => $q->max_num_pages > (int) ($args['page'] ?? 1));
            case 'get-page':
                return $this->get_page((int) $args['post_id']);
            case 'create-page':
                if (!in_array('page', $this->types(), true)) {
                    return new WP_Error('avada_forbidden', 'Builder is disabled for pages.');
                }
                $title = sanitize_text_field($args['title'] ?? '');
                if (trim($title) === '') {
                    return new WP_Error('invalid_title', 'Provide a title.');
                }
                $id = wp_insert_post(array(
                    'post_type' => 'page',
                    'post_status' => 'draft',
                    'post_title' => $title,
                    'meta_input' => array('fusion_builder_status' => 'active'),
                ), true);
                return is_wp_error($id) ? $id : $this->get_page($id);
            default:
                return $this->mutate($slug, $args);
        }
    }
    private function core_content(array $args)
    {
        if (!defined('FUSION_CORE_VERSION')) {
            return new WP_Error('core_unavailable', 'Activate Avada Core to discover its content.');
        }
        $kind = $args['kind'] ?? '';
        $page = max(1, (int) ($args['page'] ?? 1));
        $limit = min(100, max(1, (int) ($args['per_page'] ?? 20)));
        if ($kind === 'slider') {
            if (!taxonomy_exists('slide-page')) {
                return array('items' => array(), 'has_more' => false);
            }
            $taxonomy = get_taxonomy('slide-page');
            if (!current_user_can($taxonomy->cap->manage_terms)) {
                return new WP_Error('avada_forbidden', 'Slider discovery requires native taxonomy permissions.');
            }
            $terms = get_terms(array(
                'taxonomy' => 'slide-page',
                'hide_empty' => false,
                'number' => $limit + 1,
                'offset' => ($page - 1) * $limit,
                'orderby' => 'term_id',
                'order' => 'ASC',
            ));
            if (is_wp_error($terms)) {
                return $terms;
            }
            $more = count($terms) > $limit;
            $out = array();
            foreach (array_slice($terms, 0, $limit) as $term) {
                $out[] = array(
                    'id' => $term->term_id,
                    'name' => $term->name,
                    'slug' => $term->slug,
                    'slide_count' => $term->count,
                );
            }
            return array('items' => $out, 'has_more' => $more);
        }
        $type = array('portfolio' => 'avada_portfolio', 'faq' => 'avada_faq')[$kind] ?? null;
        if (!$type) {
            return new WP_Error('invalid_kind', 'Choose portfolio, faq or slider.');
        }
        if (!post_type_exists($type)) {
            return array('items' => array(), 'has_more' => false);
        }
        $q = new WP_Query(array(
            'post_type' => $type,
            'post_status' => array('publish', 'draft', 'private', 'pending', 'future'),
            'posts_per_page' => $limit,
            'paged' => $page,
            'orderby' => 'ID',
            'order' => 'DESC',
            'perm' => 'editable',
        ));
        $out = array();
        foreach ($q->posts as $post) {
            if (!current_user_can('edit_post', $post->ID)) {
                continue;
            }
            $taxonomies = array();
            foreach (get_object_taxonomies($type) as $taxonomy) {
                $terms = wp_get_post_terms($post->ID, $taxonomy);
                if (!is_wp_error($terms)) {
                    $taxonomies[$taxonomy] = array_map(static fn($term) => array(
                        'id' => $term->term_id,
                        'name' => $term->name,
                        'slug' => $term->slug,
                    ), $terms);
                }
            }
            $out[] = array(
                'post_id' => $post->ID,
                'title' => $post->post_title,
                'status' => $post->post_status,
                'url' => get_permalink($post),
                'terms' => $taxonomies,
            );
        }
        return array('items' => $out, 'has_more' => $q->max_num_pages > $page);
    }
    private function get_page(int $id)
    {
        if (!$this->post_allowed($id)) {
            return new WP_Error('avada_forbidden', 'Page is unavailable or cannot be edited.');
        }
        $content = get_post_field('post_content', $id);
        $tree = EMCP_Tools_Avada_Tree::parse($content);
        return array(
            'post_id' => $id,
            'status' => get_post_status($id),
            'content' => $content,
            'tree' => is_wp_error($tree) ? null : $tree,
            'parse_error' => is_wp_error($tree) ? $tree->get_error_message() : null,
            'content_hash' => hash('sha256', wp_json_encode(array($id, $content, get_post_meta($id, 'fusion_builder_status', true), get_post_meta($id, '_fusion_is_global', true)))),
            'editor_url' => add_query_arg('fb-edit', '1', get_permalink($id)),
            'preview_url' => get_preview_post_link($id),
            'url' => get_permalink($id),
        );
    }
    private function validate_properties(array $tree)
    {
        $walk = function ($n) use (&$walk) {
            if ($n['id'] !== 1) {
                $s = $this->element_schema($n['data']['type']);
                if (!$s['authoring_supported']) {
                    return new WP_Error('unsupported_element', 'Element is disabled or discovery-only.');
                }
                $fields = $s['fields'];
                $attributes = $n['data']['properties']['attributes'];
                if ($n['data']['type'] === 'fusion_fusionslider' && !get_term_by('slug', $attributes['name'] ?? '', 'slide-page')) {
                    return new WP_Error('invalid_attribute', 'Choose an existing Avada Slider group slug in the name attribute.');
                }
                if (in_array($n['data']['type'], array('fusion_faq', 'fusion_portfolio'), true) && !in_array($attributes['post_status'] ?? 'publish', array('', 'publish'), true)) {
                    return new WP_Error('invalid_attribute', 'Core display elements may query published content only.');
                }
                foreach ($n['data']['properties']['attributes'] as $k => $v) {
                    $base = preg_replace('/_(small|medium)$/', '', $k);
                    $p = $fields[$k] ?? null;
                    if (!$p && isset($fields[$base]['responsive'])) {
                        $p = $fields[$base];
                    }
                    if (!$p || !empty($p['remove_from_atts']) || preg_match('/code|script|dynamic|logics|attributes|render|global|^on[a-z]/i', $k)) {
                        return new WP_Error('invalid_attribute', 'Unsupported attribute: ' . $k);
                    }
                    if (preg_match('/javascript\s*:|data\s*:|<\?|awb-dynamic|fusion_dynamic/i', $v)) {
                        return new WP_Error('invalid_attribute', 'Executable or dynamic values are not supported.');
                    }
                }
            }
            foreach ($n['children'] as $c) {
                $r = $walk($c);
                if (is_wp_error($r)) {
                    return $r;
                }
            }
            return true;
        };
        return $walk($tree['root']);
    }
    private function mutate(string $slug, array $args)
    {
        $id = (int) ($args['post_id'] ?? 0);
        $state = $this->get_page($id);
        if (is_wp_error($state)) {
            return $state;
        }
        if (!function_exists('wp_check_post_lock')) {
            require_once ABSPATH . 'wp-admin/includes/post.php';
        }
        if (wp_check_post_lock($id)) {
            return new WP_Error('post_locked', 'Page is being edited.');
        }
        $lock = 'emcp_avada_lock_' . $id;
        if (!add_option($lock, time(), '', false)) {
            return new WP_Error('post_locked', 'An EMCP save is in progress.');
        }
        $revision = null;
        try {
            $state = $this->get_page($id);
            if (is_wp_error($state)) {
                return $state;
            }
            if (!hash_equals($state['content_hash'], (string) ($args['expected_hash'] ?? ''))) {
                return new WP_Error('stale_page', 'Page changed; re-read before editing.');
            }
            if (!$state['tree']) {
                return new WP_Error('invalid_tree', $state['parse_error']);
            }
            $old = $state['tree'];
            $r = EMCP_Tools_Avada_Tree::validate($old, array($this, 'element_schema'));
            if (is_wp_error($r)) {
                return $r;
            }
            if ($slug === 'add-element') {
                $args['properties'] = array_merge(array('attributes' => array(), 'content' => ''), $args['properties'] ?? array());
            }
            $tree = $slug === 'set-page-tree' ? $args['tree'] : EMCP_Tools_Avada_Tree::edit($old, $slug, $args);
            if (is_wp_error($tree)) {
                return $tree;
            }
            $r = EMCP_Tools_Avada_Tree::validate($tree, array($this, 'element_schema'));
            if (is_wp_error($r)) {
                return $r;
            }
            $r = $this->validate_properties($tree);
            if (is_wp_error($r)) {
                return $r;
            }
            if ($tree === $old) {
                return $state;
            }
            $content = EMCP_Tools_Avada_Tree::serialize($tree);
            if (strlen($content) > 1000000) {
                return new WP_Error('invalid_tree', 'Content exceeds 1 MB.');
            }
            add_filter('wp_save_post_revision_check_for_changes', '__return_false');
            try {
                $revision = wp_save_post_revision($id);
            } finally {
                remove_filter('wp_save_post_revision_check_for_changes', '__return_false');
            }
            if (is_wp_error($revision) || !$revision) {
                return new WP_Error('revision_failed', 'Enable revisions before editing.');
            }
            $result = wp_update_post(wp_slash(array('ID' => $id, 'post_content' => $content)), true);
            if (is_wp_error($result)) {
                return $result;
            }
            update_post_meta($id, 'fusion_builder_status', 'active');
            if (class_exists('Fusion_Dynamic_CSS')) {
                Fusion_Dynamic_CSS::get_instance()->reset_post_transient($id);
            }
            $after = $this->get_page($id);
            if (is_wp_error($after) || $after['content'] !== $content) {
                return new WP_Error('save_failed', 'Readback mismatch. Re-read before retrying. Prior revision: ' . $revision);
            }
            $after['revision_id'] = $revision;
            return $after;
        } catch (Throwable $error) {
            return new WP_Error('save_failed', 'Save did not finish. Re-read before retrying.', array('post_id' => $id, 'revision_id' => is_int($revision) ? $revision : null));
        } finally {
            delete_option($lock);
        }
    }
}
