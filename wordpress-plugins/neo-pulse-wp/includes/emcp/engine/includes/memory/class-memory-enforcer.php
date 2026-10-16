<?php
/**
 * Project-memory guardrail enforcement.
 *
 * Approved (`publish`) guidance entries with `severity = block` and a concrete
 * `target` become hard write-blocks: before any non-read-only ability runs, its
 * name + input are matched against the block targets, and a match refuses the
 * write. This is the enforcement half of Agent Project Memory — `severity=block`
 * was advisory until now.
 *
 * Targets are `key:value` (matching the `remember` tool's documented shape):
 *   - `tool:delete-media`   → block that tool
 *   - `post_id:42`          → block writes whose input targets post 42
 *   - `post_type:page`      → block writes to a post of that type
 * A bare target (no colon) is treated as a tool slug.
 *
 * @package EMCP_Tools
 * @since   3.10.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Memory guardrail enforcer.
 *
 * @since 3.10.0
 */
class EMCP_Tools_Memory_Enforcer {

	/**
	 * Hook the write-veto filter. Wired by the Memory module's register(), so it
	 * only runs when the module is active (the runtime kill-switch).
	 */
	public function register(): void {
		add_filter( 'emcp_tools_before_write', array( $this, 'guard' ), 10, 3 );
	}

	/**
	 * Veto a write when an approved block-guardrail matches it.
	 *
	 * @param null|WP_Error $veto  Current veto (null = allow).
	 * @param string        $name  Ability name.
	 * @param array         $input Ability input.
	 * @return null|WP_Error
	 */
	public function guard( $veto, $name, $input ) {
		if ( is_wp_error( $veto ) || ! class_exists( 'EMCP_Tools_Memory_Store' ) ) {
			return $veto;
		}
		foreach ( EMCP_Tools_Memory_Store::instance()->list_guidance( 'publish' ) as $g ) {
			if ( 'block' !== ( $g['severity'] ?? '' ) ) {
				continue;
			}
			$target = trim( (string) ( $g['target'] ?? '' ) );
			if ( '' === $target ) {
				continue;
			}
			if ( self::target_matches( $target, (string) $name, (array) $input ) ) {
				return new WP_Error(
					'blocked_by_memory',
					sprintf(
						/* translators: %s: guardrail title */
						__( 'Blocked by an approved project-memory guardrail: %s', 'emcp-tools' ),
						(string) ( $g['title'] ?? $target )
					)
				);
			}
		}
		return $veto;
	}

	/**
	 * Pure: does a block target match this ability call?
	 *
	 * @param string $target Target string (key:value or a bare tool slug).
	 * @param string $name   Ability name (e.g. emcp-tools/delete-media).
	 * @param array  $input  Ability input.
	 * @return bool
	 */
	public static function target_matches( string $target, string $name, array $input ): bool {
		$target = trim( $target );
		if ( '' === $target ) {
			return false;
		}
		$slug = ( false !== strpos( $name, '/' ) ) ? substr( $name, strrpos( $name, '/' ) + 1 ) : $name;

		if ( false === strpos( $target, ':' ) ) {
			return $target === $slug || $target === $name; // bare = tool slug.
		}

		list( $key, $val ) = array_map( 'trim', explode( ':', $target, 2 ) );
		$key = strtolower( $key );

		if ( 'tool' === $key ) {
			return $val === $slug || $val === $name;
		}
		if ( 'post_id' === $key || 'id' === $key ) {
			$id = (string) ( $input['post_id'] ?? $input['id'] ?? '' );
			return '' !== $id && $id === $val;
		}
		if ( 'post_type' === $key ) {
			$id = (int) ( $input['post_id'] ?? $input['id'] ?? 0 );
			return $id > 0 && function_exists( 'get_post_type' ) && (string) get_post_type( $id ) === $val;
		}
		return false; // Unknown key → do not block.
	}
}
