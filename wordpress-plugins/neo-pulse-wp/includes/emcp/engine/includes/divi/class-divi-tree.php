<?php
/** Native Divi 5 block trees. Node IDs are scoped to the latest read. */
if (!defined('ABSPATH')) { exit; }
class EMCP_Tools_Divi_Tree
{
    public static function parse(string $content)
    {
        $next = 1;
        $stack = array();
        // WP's tolerant parser repairs malformed markup. Refuse it before parsing.
        preg_match_all('/<!--\s+(\/?)wp:([^\s]+)(.*?)-->/s', $content, $tokens, PREG_SET_ORDER);
        foreach ($tokens as $token) {
            $name = $token[2];
            if ($token[1]) {
                if (trim($token[3]) !== '' || array_pop($stack) !== $name) {
                    return new WP_Error('invalid_tree', 'Mismatched Divi block delimiters.');
                }
            } else {
                $tail = trim($token[3]);
                $self = str_ends_with($tail, '/');
                $json = trim($self ? substr($tail, 0, -1) : $tail);
                if ($json !== '' && (!is_array(json_decode($json, true)) || json_last_error() !== JSON_ERROR_NONE)) {
                    return new WP_Error('invalid_tree', 'Invalid block attributes.');
                }
                if (!$self) { $stack[] = $name; }
            }
        }
        if ($stack || strlen($content) > 2000000) { return new WP_Error('invalid_tree', 'Incomplete or oversized content.'); }
        $convert = function ($block) use (&$convert, &$next) {
            if (!is_string($block['blockName']) || !str_starts_with($block['blockName'], 'divi/') || trim($block['innerHTML']) !== '') {
                return new WP_Error('unsupported_content', 'Mixed, legacy or raw HTML content cannot be rewritten by the Divi adapter.');
            }
            $n = array('id' => $next++, 'data' => array('type' => $block['blockName'], 'properties' => array('attributes' => $block['attrs'])), 'children' => array());
            foreach ($block['innerBlocks'] as $child) {
                $child = $convert($child);
                if (is_wp_error($child)) { return $child; }
                $n['children'][] = $child;
            }
            return $n;
        };
        if (trim($content) === '') {
            $root = array('id' => $next++, 'data' => array('type' => 'divi/placeholder', 'properties' => array('attributes' => array())), 'children' => array());
        } else {
            $blocks = array_values(array_filter(parse_blocks($content), static fn($b) => $b['blockName'] !== null || trim($b['innerHTML']) !== ''));
            if (count($blocks) !== 1 || $blocks[0]['blockName'] !== 'divi/placeholder') { return new WP_Error('invalid_tree', 'A single divi/placeholder wrapper is required.'); }
            $root = $convert($blocks[0]);
            if (is_wp_error($root)) { return $root; }
        }
        return array('root' => $root, '_nextNodeId' => $next, 'status' => 'exported');
    }
    public static function serialize(array $tree): string
    {
        $emit = function ($node) use (&$emit) {
            $children = array_map($emit, $node['children']);
            return serialize_block(array('blockName' => $node['data']['type'], 'attrs' => $node['data']['properties']['attributes'], 'innerBlocks' => array(), 'innerHTML' => implode('', $children), 'innerContent' => array(implode('', $children))));
        };
        return $emit($tree['root']);
    }
    public static function validate($tree, callable $schema)
    {
        if (!is_array($tree) || !isset($tree['root'], $tree['_nextNodeId']) || !is_int($tree['_nextNodeId'])) { return new WP_Error('invalid_tree', 'Expected root and integer _nextNodeId.'); }
        $ids = array();
        $walk = function ($node, $parent, $depth) use (&$walk, &$ids, $schema) {
            if ($depth > 32 || count($ids) >= 2000 || !is_array($node) || !isset($node['id'], $node['data']['type'], $node['data']['properties']['attributes'], $node['children']) || !is_int($node['id']) || $node['id'] < 1 || isset($ids[$node['id']]) || !is_array($node['children']) || !array_is_list($node['children']) || !is_array($node['data']['properties']['attributes']) || array_diff(array_keys($node['data']['properties']), array('attributes'))) { return new WP_Error('invalid_tree', 'Invalid, duplicate or excessive nodes.'); }
            $ids[$node['id']] = true;
            $type = $node['data']['type'];
            if (!$parent) {
                if ($node['id'] !== 1 || $type !== 'divi/placeholder') { return new WP_Error('invalid_tree', 'Root must be divi/placeholder with ID 1.'); }
            } else {
                $s = $schema($type);
                if (!$s || empty($s['authoring_supported'])) { return new WP_Error('unsupported_module', 'Module is unavailable for authoring: ' . $type); }
                if (!in_array($parent, $s['allowed_parents'], true)) { return new WP_Error('invalid_nesting', 'Invalid parent for ' . $type); }
                foreach ($node['data']['properties']['attributes'] as $key => $value) {
                    if (!in_array($key, array('builderVersion', 'modulePreset', 'groupPreset'), true) && !isset($s['attributes'][$key])) { return new WP_Error('invalid_attribute', 'Unknown attribute group: ' . $key); }
                }
            }
            $safe = self::safe_values($node['data']['properties']['attributes']);
            if (is_wp_error($safe)) { return $safe; }
            foreach ($node['children'] as $child) {
                $r = $walk($child, $type, $depth + 1);
                if (is_wp_error($r)) { return $r; }
            }
            return true;
        };
        $r = $walk($tree['root'], '', 0);
        if (is_wp_error($r)) { return $r; }
        return $tree['_nextNodeId'] > max(array_keys($ids)) ? true : new WP_Error('invalid_tree', '_nextNodeId must exceed every ID.');
    }
    public static function safe_values($value, int $depth = 0)
    {
        if ($depth > 40 || is_object($value)) { return new WP_Error('invalid_attribute', 'Invalid attribute depth/type.'); }
        if (is_array($value)) {
            foreach ($value as $key => $child) {
                if (is_string($key) && preg_match('/^(?:__proto__|prototype|constructor|on[a-z]+|script|code)$/i', $key)) { return new WP_Error('invalid_attribute', 'Executable attributes are not supported.'); }
                $r = self::safe_values($child, $depth + 1);
                if (is_wp_error($r)) { return $r; }
            }
        } elseif (is_string($value)) {
            if (preg_match('/<\?|<!--|<\s*(?:script|iframe|object|embed)\b|\[\/?[a-zA-Z_]|(?:javascript|vbscript|data)\s*:/i', $value) || wp_kses_post($value) !== $value) { return new WP_Error('invalid_attribute', 'Unsafe HTML, shortcodes or executable URLs are not supported.'); }
        } elseif (!is_scalar($value) && $value !== null) { return new WP_Error('invalid_attribute', 'Attributes must contain JSON values.'); }
        return true;
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
