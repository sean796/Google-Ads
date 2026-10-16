<?php
/** Native Oxygen nested-tree validation and edits. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

class EMCP_Tools_Oxygen_Tree {
	public static function blank(): array {
		return array( 'root' => array( 'id' => 1, 'data' => array( 'type' => 'root', 'properties' => array() ), 'children' => array() ), '_nextNodeId' => 100, 'status' => 'exported' );
	}

	/** Validate before editing or saving. Resolver returns the installed element schema. */
	public static function validate( array $tree, callable $schema, bool $native = false ) {
		if ( ! isset( $tree['root'] ) || ! is_array( $tree['root'] ) || ( $tree['root']['id'] ?? null ) !== 1 || ( $tree['root']['data']['type'] ?? '' ) !== 'root' ) {
			return new WP_Error( 'invalid_tree', 'Tree must contain root node 1 with type root.' );
		}
		$seen = array(); $types = array(); $constraints = array();
		$walk = function( $node, $parent_rule, $depth, $inside_link = false ) use ( &$walk, &$seen, &$types, &$constraints, $schema, $native ) {
			if ( $depth > 50 || count( $seen ) >= 2000 || ! is_array( $node ) ) { return new WP_Error( 'invalid_tree', 'Tree exceeds 2000 nodes or 50 nesting levels.' ); }
			$id = $node['id'] ?? null;
			if ( ! is_int( $id ) || $id < 1 || $id > 2147483646 || isset( $seen[ $id ] ) ) { return new WP_Error( 'invalid_tree', 'Node IDs must be unique positive integers.' ); }
			$seen[ $id ] = true;
			if ( ! isset( $node['data'], $node['children'] ) || ! is_array( $node['data'] ) || ! is_array( $node['children'] ) || ! array_is_list( $node['children'] ) || ! is_array( $node['data']['properties'] ?? null ) ) {
				return new WP_Error( 'invalid_tree', 'Nodes require data.properties and a children list.' );
			}
			$type = $node['data']['type'] ?? '';
			foreach ( array_keys( $node['data']['properties'] ) as $key ) { if ( ! is_string( $key ) ) { return new WP_Error( 'invalid_tree', 'Properties must be a named object, not a list.' ); } }
			if ( ! is_string( $type ) ) { return new WP_Error( 'invalid_tree', 'Element type must be a string.' ); }
			$rule = 'root';
			if ( $depth > 0 ) {
				$definition = $schema( $type );
				if ( ! $definition ) { return new WP_Error( 'unknown_element', 'Element is not registered: ' . $type ); }
				$types[$type]=($types[$type] ?? 0)+1;
				$constraints[$type]=$definition['nestingRule']['notAllowedWhenNodeTypeIsPresentInTree'] ?? array();
				$rule = $definition['nestingRule']['type'] ?? 'final';
				if (($native || $type === 'OxygenElements\\Component') && $rule === 'final-that-is-allowed-inside-root') { $rule = 'final'; }
				if ( ! in_array( $rule, array( 'section', 'container', 'final', 'container-link', 'final-link' ), true ) ) { return new WP_Error( 'unsupported_nesting', 'This element requires specialized nesting rules: ' . $type ); }
				$is_link = in_array($rule,array('container-link','final-link'),true);
				if ($inside_link && $is_link) { return new WP_Error('invalid_nesting','Links cannot be nested inside another link.'); }
				$inside_link = $inside_link || $is_link;
				if ( in_array($parent_rule,array('final','final-link'),true) || ( 'section' === $rule && 'root' !== $parent_rule ) ) { return new WP_Error( 'invalid_nesting', 'Sections must be at root; leaf elements cannot contain children.' ); }
				if ( !$native && $type !== 'OxygenElements\\Component' && preg_match( '/code|php|shortcode|form|globalblock|component|loop|widget|missingelement/i', $type ) ) { return new WP_Error( 'unsupported_element', 'Code, forms, loops and widget authoring are not supported by this adapter.' ); }
			}
			foreach ( $node['children'] as $child ) {
				$result = $walk( $child, $rule, $depth + 1, $inside_link );
				if ( is_wp_error( $result ) ) { return $result; }
			}
			return true;
		};
		$result = $walk( $tree['root'], '', 0 );
		if ( is_wp_error( $result ) ) { return $result; }
		foreach ($constraints as $type=>$excluded) { foreach ($excluded as $other) { if (($types[$other] ?? 0)>($type===$other?1:0)) { return new WP_Error('invalid_nesting','Native element exclusivity rule violated.'); } } }
		if ( ! is_int( $tree['_nextNodeId'] ?? null ) || $tree['_nextNodeId'] <= max( array_keys( $seen ) ) || $tree['_nextNodeId'] > 2147483647 ) { return new WP_Error( 'invalid_tree', '_nextNodeId must be greater than every node ID.' ); }
		return true;
	}

	public static function find( array $node, int $id ): ?array {
		if ( $node['id'] === $id ) { return $node; }
		foreach ( $node['children'] as $child ) { $found = self::find( $child, $id ); if ( $found ) { return $found; } }
		return null;
	}

	private static function change( array &$node, int $id, callable $callback ): bool {
		if ( $node['id'] === $id ) { $callback( $node ); return true; }
		foreach ( $node['children'] as &$child ) { if ( self::change( $child, $id, $callback ) ) { return true; } }
		return false;
	}

	private static function detach( array &$node, int $id ): bool {
		foreach ( $node['children'] as $index => &$child ) {
			if ( $child['id'] === $id ) { array_splice( $node['children'], $index, 1 ); return true; }
			if ( self::detach( $child, $id ) ) { return true; }
		}
		return false;
	}

	/** Updates merge property groups recursively; numeric lists are replaced. */
	public static function merge( array $base, array $patch ): array {
		foreach ( $patch as $key => $value ) {
			$base[ $key ] = is_array( $value ) && ! array_is_list( $value ) && isset( $base[ $key ] ) && is_array( $base[ $key ] ) ? self::merge( $base[ $key ], $value ) : $value;
		}
		return $base;
	}

	public static function edit( array $tree, string $action, array $args ) {
		$id = (int) ( $args['element_id'] ?? 0 );
		$node = self::find( $tree['root'], $id );
		if ( 'add-element' !== $action && ( ! $node || 1 === $id ) ) { return new WP_Error( 'invalid_element', 'Choose an existing non-root node.' ); }
		if ( 'update-element' === $action ) {
			self::change( $tree['root'], $id, static function( &$target ) use ( $args ) {
				$target['data']['properties'] = self::merge( $target['data']['properties'], $args['properties'] );
				if ( isset( $args['label'] ) ) { $target['data']['properties']['meta']['friendlyName'] = $args['label']; }
			} );
		} elseif ( 'remove-element' === $action ) {
			self::detach( $tree['root'], $id );
		} else {
			$parent_id = (int) ( $args['parent_id'] ?? 1 );
			$parent = self::find( $tree['root'], $parent_id );
			if ( ! $parent || ( $node && self::find( $node, $parent_id ) ) ) { return new WP_Error( 'invalid_parent', 'Parent is missing or would create a cycle.' ); }
			if ( 'add-element' === $action ) {
				$node = array( 'id' => $tree['_nextNodeId']++, 'data' => array( 'type' => $args['type'], 'properties' => $args['properties'] ?? array() ), 'children' => array() );
			} else { self::detach( $tree['root'], $id ); }
			self::change( $tree['root'], $parent_id, static function( &$target ) use ( $node, $args ) {
				array_splice( $target['children'], min( count( $target['children'] ), max( 0, (int) ( $args['position'] ?? count( $target['children'] ) ) ) ), 0, array( $node ) );
			} );
		}
		// The native builder rebuilds its in-memory lookup table when loading exports.
		unset( $tree['_lookupTable'], $tree['exportedLookupTable'] );
		$tree['status'] = 'exported';
		return $tree;
	}
}
