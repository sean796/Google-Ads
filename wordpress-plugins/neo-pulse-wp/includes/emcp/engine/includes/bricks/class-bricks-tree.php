<?php
/** Flat Bricks element-tree validation and incremental edits. */
if ( ! defined( 'ABSPATH' ) ) { exit; }

class EMCP_Tools_Bricks_Tree {

	public static function validate( array $elements, callable $schema ) {
		if ( array_values( $elements ) !== $elements || count( $elements ) > 2000 ) {
			return new WP_Error( 'invalid_tree', 'Supply a list of at most 2000 elements.' );
		}
		$index = array();
		foreach ( $elements as $element ) {
			if ( ! is_array( $element ) || isset( $element['cid'] ) ) {
				return new WP_Error( 'unsupported_component', 'Component instances require the Bricks editor in this release.' );
			}
			$id = $element['id'] ?? null;
			if ( ! is_string( $id ) || ! preg_match( '/^[a-z0-9]{6}$/D', $id ) || isset( $index[ $id ] ) ) {
				return new WP_Error( 'invalid_tree', 'Element IDs must be unique six-character lowercase alphanumeric strings.' );
			}
			if ( ! isset( $element['name'], $element['parent'], $element['children'], $element['settings'] )
				|| ! is_string( $element['name'] ) || ! is_array( $element['children'] ) || ! is_array( $element['settings'] )
				|| ( 0 !== $element['parent'] && ! is_string( $element['parent'] ) )
				|| array_values( $element['children'] ) !== $element['children'] ) {
				return new WP_Error( 'invalid_tree', 'Each element needs name, parent (0 or an ID), children (list), and settings (object).' );
			}
			foreach ( array_keys( $element['settings'] ) as $setting ) {
				if ( ! is_string( $setting ) ) { return new WP_Error( 'invalid_tree', 'Settings must be an object with named keys.' ); }
			}
			if ( 'section' === $element['name'] && 0 !== $element['parent'] ) { return new WP_Error( 'invalid_tree', 'Sections must be root elements. For a nested <section> or <aside>, use a div (or block) with tag set to section/aside.' ); }
			$type = $schema( $element['name'] );
			if ( ! $type || is_wp_error( $type ) ) {
				return new WP_Error( 'unknown_element', 'Unregistered Bricks element: ' . $element['name'] );
			}
			if ( $element['children'] && empty( $type['nestable'] ) ) {
				return new WP_Error( 'invalid_tree', 'This element cannot contain children: ' . $id );
			}
			$index[ $id ] = $element;
		}
		$claimed = array();
		foreach ( $index as $id => $element ) {
			foreach ( $element['children'] as $child ) {
				if ( ! is_string( $child ) || ! isset( $index[ $child ] ) || isset( $claimed[ $child ] ) || $index[ $child ]['parent'] !== (string) $id ) {
					return new WP_Error( 'invalid_tree', 'Children must exist, belong to exactly one parent, and agree with their parent field.' );
				}
				$claimed[ $child ] = true;
			}
		}
		foreach ( $index as $id => $element ) {
			if ( 0 !== $element['parent'] && ! isset( $claimed[ $id ] ) ) {
				return new WP_Error( 'invalid_tree', 'A non-root element is missing from its parent children list.' );
			}
			$seen = array();
			$cursor = $id;
			while ( 0 !== $cursor ) {
				if ( isset( $seen[ $cursor ] ) || ! isset( $index[ $cursor ] ) ) {
					return new WP_Error( 'invalid_tree', 'The element tree contains a cycle or a missing parent.' );
				}
				$seen[ $cursor ] = true;
				$cursor = $index[ $cursor ]['parent'];
			}
		}
		return true;
	}

	/** Caller validates the complete resulting tree before saving. */
	public static function edit( array $elements, string $operation, array $args ) {
		$index = array_column( $elements, null, 'id' );
		$id = $args['element_id'] ?? '';
		if ( 'add' === $operation ) {
			$element = $args['element'] ?? null;
			if ( ! is_array( $element ) || empty( $element['id'] ) || ! is_string( $element['id'] ) || isset( $index[ $element['id'] ] ) ) {
				return new WP_Error( 'invalid_element', 'A new element with a unique ID is required.' );
			}
			if ( ! empty( $element['children'] ) ) {
				return new WP_Error( 'invalid_element', 'Add one element at a time with no children, or use set-page-elements for a complete tree.' );
			}
			$id = $element['id'];
			$element['children'] = array();
			$element['settings'] = $element['settings'] ?? array();
			$index[ $id ] = $element;
		} elseif ( ! is_string( $id ) || ! isset( $index[ $id ] ) ) {
			return new WP_Error( 'element_not_found', 'Element not found in this page.' );
		}
		if ( 'update' === $operation ) {
			if ( ! isset( $args['settings'] ) || ! is_array( $args['settings'] ) ) {
				return new WP_Error( 'invalid_settings', 'Supply a settings object. Top-level keys are merged; nested values are replaced.' );
			}
			$index[ $id ]['settings'] = array_replace( $index[ $id ]['settings'], $args['settings'] );
			foreach ( $args['unset_settings'] ?? array() as $key ) { unset( $index[ $id ]['settings'][ $key ] ); }
			if ( isset( $args['label'] ) ) { $index[ $id ]['label'] = sanitize_text_field( $args['label'] ); }
		} elseif ( 'remove' === $operation ) {
			$pending = array( $id );
			while ( $pending ) {
				$remove = array_pop( $pending );
				$pending = array_merge( $pending, $index[ $remove ]['children'] );
				unset( $index[ $remove ] );
			}
			foreach ( $index as &$element ) { $element['children'] = array_values( array_diff( $element['children'], array( $id ) ) ); }
			unset( $element );
		} elseif ( in_array( $operation, array( 'add', 'move' ), true ) ) {
			$parent = 'add' === $operation ? ( $index[ $id ]['parent'] ?? 0 ) : ( $args['parent'] ?? 0 );
			if ( ( 0 !== $parent && ( ! is_string( $parent ) || ! isset( $index[ $parent ] ) ) ) || $parent === $id ) {
				return new WP_Error( 'invalid_parent', 'Choose 0 (root) or an existing parent element.' );
			}
			foreach ( $index as &$element ) { $element['children'] = array_values( array_diff( $element['children'], array( $id ) ) ); }
			unset( $element );
			$index[ $id ]['parent'] = $parent;
			$siblings = 0 === $parent ? array_keys( array_filter( $index, static function( $el ) use ( $id ) { return 0 === $el['parent'] && $el['id'] !== $id; } ) ) : $index[ $parent ]['children'];
			$position = $args['position'] ?? count( $siblings );
			if ( ! is_int( $position ) || $position < 0 || $position > count( $siblings ) ) {
				return new WP_Error( 'invalid_position', 'Position must be between zero and the number of siblings.' );
			}
			array_splice( $siblings, $position, 0, array( $id ) );
			if ( 0 === $parent ) {
				// Root order is stored in the flat array; nested order is in children.
				$roots = array();
				foreach ( $siblings as $root ) { $roots[ $root ] = $index[ $root ]; unset( $index[ $root ] ); }
				$index = $roots + $index;
			} else { $index[ $parent ]['children'] = $siblings; }
		}
		return array_values( $index );
	}
}
