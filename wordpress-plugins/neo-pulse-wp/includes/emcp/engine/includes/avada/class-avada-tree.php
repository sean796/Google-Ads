<?php

/** EMCP tree representation of native Avada shortcodes. IDs are scoped to a read. */
if (!defined('ABSPATH')) {
    exit;
}
class EMCP_Tools_Avada_Tree
{
    public static function blank(): array
    {
        return array(
            'root' => array(
                'id' => 1,
                'data' => array('type' => 'root', 'properties' => array()),
                'children' => array(),
            ),
            '_nextNodeId' => 2,
            'status' => 'exported',
        );
    }
    public static function supported_types(): array
    {
        return array('fusion_builder_container', 'fusion_builder_row', 'fusion_builder_column', 'fusion_builder_row_inner', 'fusion_builder_column_inner', 'fusion_text', 'fusion_title', 'fusion_button', 'fusion_imageframe', 'fusion_separator', 'fusion_fontawesome', 'fusion_menu_anchor', 'fusion_faq', 'fusion_portfolio', 'fusion_fusionslider');
    }
    public static function allowed_parents(string $type): array
    {
        if (!in_array($type, self::supported_types(), true)) {
            return array();
        }
        return array(
            'fusion_builder_container' => array('root'),
            'fusion_builder_row' => array('fusion_builder_container'),
            'fusion_builder_column' => array('fusion_builder_row'),
            'fusion_builder_row_inner' => array('fusion_builder_column'),
            'fusion_builder_column_inner' => array('fusion_builder_row_inner'),
        )[$type] ?? array('fusion_builder_column', 'fusion_builder_column_inner');
    }
    public static function parse(string $content)
    {
        if (strlen($content) > 1000000) {
            return new WP_Error('invalid_tree', 'Content exceeds 1 MB.');
        }
        $tree = self::blank();
        $stack = array();
        $stack[] =& $tree['root'];
        $tokens = preg_split('/(\[\/?fusion_[a-z0-9_]+(?:\s[^\]]*)?\])/s', $content, -1, PREG_SPLIT_DELIM_CAPTURE | PREG_SPLIT_NO_EMPTY);
        foreach ($tokens as $token) {
            $node =& $stack[count($stack) - 1];
            if (preg_match('/^\[(\/?)(fusion_[a-z0-9_]+)([^\]]*)\]$/s', $token, $m)) {
                if ($m[1] === '/') {
                    if (count($stack) < 2 || $node['data']['type'] !== $m[2] || trim($m[3]) !== '') {
                        return new WP_Error('invalid_tree', 'Unbalanced shortcode nesting.');
                    }
                    array_pop($stack);
                } else {
                    if ($tree['_nextNodeId'] > 2001 || count($stack) > 50) {
                        return new WP_Error('invalid_tree', 'Tree exceeds limits.');
                    }
                    $raw = trim($m[3]);
                    $self = substr($raw, -1) === '/';
                    if ($self) {
                        $raw = rtrim(substr($raw, 0, -1));
                    }
                    $attrs = self::parse_attributes($raw);
                    if (is_wp_error($attrs)) {
                        return $attrs;
                    }
                    foreach ($attrs as $key => $value) {
                        if (!is_string($key)) {
                            return new WP_Error('invalid_tree', 'Unnamed shortcode attribute.');
                        }
                    }
                    $node['children'][] = array(
                        'id' => $tree['_nextNodeId']++,
                        'data' => array('type' => $m[2], 'properties' => array('attributes' => $attrs, 'content' => '')),
                        'children' => array(),
                    );
                    if (!$self) {
                        $stack[] =& $node['children'][count($node['children']) - 1];
                    }
                }
            } else {
                if (str_contains($token, '[') || str_contains($token, ']')) {
                    return new WP_Error('invalid_tree', 'Unsupported or malformed shortcode content.');
                }
                if (count($stack) === 1) {
                    if (trim($token) !== '') {
                        return new WP_Error('invalid_tree', 'Mixed WordPress content cannot be replaced.');
                    }
                } else {
                    $node['data']['properties']['content'] .= $token;
                }
            }
            unset($node);
        }
        if (count($stack) !== 1) {
            return new WP_Error('invalid_tree', 'Unclosed shortcode.');
        }
        return $tree;
    }
    private static function parse_attributes(string $raw)
    {
        $attrs = array();
        $offset = 0;
        while ($offset < strlen($raw)) {
            if (trim(substr($raw, $offset)) === '') {
                break;
            }
            if (!preg_match('/\G\s*([a-z][a-z0-9_-]*)\s*=\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([^\s"\x27]+))/i', $raw, $m, PREG_UNMATCHED_AS_NULL, $offset)) {
                return new WP_Error('invalid_tree', 'Malformed shortcode attributes.');
            }
            $key = strtolower($m[1]);
            $value = $m[2] ?? $m[3] ?? $m[4];
            // Live Builder can repeat a column's type attribute on save.
            // Equal duplicates are unambiguous; conflicting values are not.
            if (array_key_exists($key, $attrs) && $attrs[$key] !== $value) {
                return new WP_Error('invalid_tree', 'Conflicting duplicate shortcode attribute.');
            }
            $attrs[$key] = $value;
            $offset += strlen($m[0]);
            if ($offset < strlen($raw) && !ctype_space($raw[$offset])) {
                return new WP_Error('invalid_tree', 'Attributes must be separated by whitespace.');
            }
        }
        return $attrs;
    }
    public static function validate(array $tree, callable $schema)
    {
        if (($tree['root']['id'] ?? null) !== 1 || ($tree['root']['data']['type'] ?? '') !== 'root') {
            return new WP_Error('invalid_tree', 'Root must be node 1.');
        }
        $seen = array();
        $walk = function ($n, $parent, $depth) use (&$walk, &$seen, $schema) {
            if (!is_array($n) || $depth > 50 || count($seen) >= 2000) {
                return new WP_Error('invalid_tree', 'Tree exceeds limits.');
            }
            $id = $n['id'] ?? null;
            $type = $n['data']['type'] ?? '';
            $props = $n['data']['properties'] ?? null;
            if (!is_int($id) || $id < 1 || $id > 2147483646 || isset($seen[$id]) || !is_array($props) || !is_array($n['children'] ?? null) || !array_is_list($n['children'])) {
                return new WP_Error('invalid_tree', 'Invalid node envelope or duplicate ID.');
            }
            $seen[$id] = true;
            if ($depth) {
                if (!in_array($type, self::supported_types(), true) || !$schema($type)) {
                    return new WP_Error('unsupported_element', 'Element is not enabled for authoring: ' . $type);
                }
                $parents = array(
                    'fusion_builder_container' => array('root'),
                    'fusion_builder_row' => array('fusion_builder_container'),
                    'fusion_builder_column' => array('fusion_builder_row'),
                    'fusion_builder_row_inner' => array('fusion_builder_column'),
                    'fusion_builder_column_inner' => array('fusion_builder_row_inner'),
                );
                if (!in_array($parent, self::allowed_parents($type), true)) {
                    return new WP_Error('invalid_nesting', 'Invalid parent for ' . $type);
                }
                if (!is_array($props['attributes'] ?? null) || !is_string($props['content'] ?? null) || array_diff(array_keys($props), array('attributes', 'content'))) {
                    return new WP_Error('invalid_tree', 'Properties require attributes and content only.');
                }
                if (isset($parents[$type]) && trim($props['content']) !== '' || !isset($parents[$type]) && $n['children']) {
                    return new WP_Error('invalid_nesting', 'Structural elements contain children; content elements contain text.');
                }
                if (preg_match('/[\[\]]/', $props['content']) || wp_kses_post($props['content']) !== $props['content']) {
                    return new WP_Error('invalid_content', 'Only safe HTML without embedded shortcodes is supported.');
                }
                foreach ($props['attributes'] as $k => $v) {
                    if (!is_string($k) || !preg_match('/^[a-z][a-z0-9_-]*$/', $k) || !is_string($v) || preg_match('/[\[\]<>\\\\]/', $v) || str_contains($v, '"') && str_contains($v, "'")) {
                        return new WP_Error('invalid_attribute', 'Attributes must be named strings without markup, brackets, backslashes or mixed quotes.');
                    }
                }
            }
            foreach ($n['children'] as $child) {
                $r = $walk($child, $type, $depth + 1);
                if (is_wp_error($r)) {
                    return $r;
                }
            }
            return true;
        };
        $r = $walk($tree['root'], '', 0);
        if (is_wp_error($r)) {
            return $r;
        }
        if (!is_int($tree['_nextNodeId'] ?? null) || $tree['_nextNodeId'] <= max(array_keys($seen)) || $tree['_nextNodeId'] > 2147483647) {
            return new WP_Error('invalid_tree', 'Invalid next node ID.');
        }
        return true;
    }
    public static function serialize(array $tree): string
    {
        $emit = function ($n) use (&$emit) {
            $out = '';
            if ($n['data']['type'] === 'root') {
                foreach ($n['children'] as $c) {
                    $out .= $emit($c);
                }
                return $out;
            }
            $out = '[' . $n['data']['type'];
            foreach ($n['data']['properties']['attributes'] as $k => $v) {
                $q = str_contains($v, '"') ? "'" : '"';
                $out .= ' ' . $k . '=' . $q . $v . $q;
            }
            $out .= ']' . $n['data']['properties']['content'];
            foreach ($n['children'] as $c) {
                $out .= $emit($c);
            }
            return $out . '[/' . $n['data']['type'] . ']';
        };
        return $emit($tree['root']);
    }
    public static function find(array $node, int $id): ?array
    {
        if ($node['id'] === $id) {
            return $node;
        }
        foreach ($node['children'] as $child) {
            $found = self::find($child, $id);
            if ($found) {
                return $found;
            }
        }
        return null;
    }
    private static function change(array &$node, int $id, callable $callback): bool
    {
        if ($node['id'] === $id) {
            $callback($node);
            return true;
        }
        foreach ($node['children'] as &$child) {
            if (self::change($child, $id, $callback)) {
                return true;
            }
        }
        return false;
    }
    private static function detach(array &$node, int $id): bool
    {
        foreach ($node['children'] as $index => &$child) {
            if ($child['id'] === $id) {
                array_splice($node['children'], $index, 1);
                return true;
            }
            if (self::detach($child, $id)) {
                return true;
            }
        }
        return false;
    }
    /** Updates merge property groups recursively; numeric lists are replaced. */
    public static function merge(array $base, array $patch): array
    {
        foreach ($patch as $key => $value) {
            $base[$key] = is_array($value) && !array_is_list($value) && isset($base[$key]) && is_array($base[$key]) ? self::merge($base[$key], $value) : $value;
        }
        return $base;
    }
    public static function edit(array $tree, string $action, array $args)
    {
        $id = (int) ($args['element_id'] ?? 0);
        $node = self::find($tree['root'], $id);
        if ('add-element' !== $action && (!$node || 1 === $id)) {
            return new WP_Error('invalid_element', 'Choose an existing non-root node.');
        }
        if ('update-element' === $action) {
            self::change($tree['root'], $id, static function (&$target) use ($args) {
                $target['data']['properties'] = self::merge($target['data']['properties'], $args['properties']);
            });
        } elseif ('remove-element' === $action) {
            self::detach($tree['root'], $id);
        } else {
            $parent_id = (int) ($args['parent_id'] ?? 1);
            $parent = self::find($tree['root'], $parent_id);
            if (!$parent || $node && self::find($node, $parent_id)) {
                return new WP_Error('invalid_parent', 'Parent is missing or would create a cycle.');
            }
            if ('add-element' === $action) {
                $node = array(
                    'id' => $tree['_nextNodeId']++,
                    'data' => array('type' => $args['type'], 'properties' => $args['properties'] ?? array()),
                    'children' => array(),
                );
            } else {
                self::detach($tree['root'], $id);
            }
            self::change($tree['root'], $parent_id, static function (&$target) use ($node, $args) {
                array_splice($target['children'], min(count($target['children']), max(0, (int) ($args['position'] ?? count($target['children'])))), 0, array($node));
            });
        }
        $tree['status'] = 'exported';
        return $tree;
    }
}
