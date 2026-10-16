<?php
/**
 * AI Chat built-in controls — the capability, safety, and tool-access switches
 * shown in the left column of the AI Chat settings screen.
 *
 * These are site policy rather than per-user preference (the AI Chat page is
 * already capability-gated), so they live in one option. Every switch is
 * ENFORCED SERVER-SIDE in EMCP_Tools_AI_Chat_Controller — the UI merely
 * reflects state. A toggle that only hid a button would be security theatre:
 * the chat runs in the browser and can call the REST routes directly.
 *
 * Tool access stores the DISABLED group ids rather than the enabled ones, so a
 * tool group added in a later release is available by default instead of
 * silently switched off for existing installs.
 *
 * @package EMCP_Tools
 * @since   3.6.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Reads/writes the AI Chat built-in control settings.
 *
 * @since 3.6.0
 */
class EMCP_Tools_AI_Chat_Settings {

	/**
	 * Option holding the settings array.
	 */
	const OPTION = 'emcp_tools_ai_chat_settings';

	/**
	 * Defaults — everything permissive except that destructive actions always
	 * ask first. Safe-by-default: approval ON.
	 *
	 * @since 3.6.0
	 * @return array{web_fetch:bool,approve_destructive:bool,disabled_groups:string[]}
	 */
	public static function defaults(): array {
		return array(
			'web_fetch'           => true,
			'approve_destructive' => true,
			'disabled_groups'     => array(),
		);
	}

	/**
	 * All settings, merged over the defaults.
	 *
	 * @since 3.6.0
	 * @return array
	 */
	public static function all(): array {
		$stored = get_option( self::OPTION, array() );
		if ( ! is_array( $stored ) ) {
			$stored = array();
		}
		return self::sanitize( array_merge( self::defaults(), $stored ) );
	}

	/**
	 * Normalises an arbitrary array into the stored shape.
	 *
	 * @since 3.6.0
	 * @param array $in Raw values.
	 * @return array
	 */
	public static function sanitize( array $in ): array {
		$defaults = self::defaults();

		$groups = array();
		if ( isset( $in['disabled_groups'] ) && is_array( $in['disabled_groups'] ) ) {
			$known = array_keys( EMCP_Tools_AI_Chat_Tool_Groups::group_defs() );
			foreach ( $in['disabled_groups'] as $g ) {
				$g = sanitize_key( (string) $g );
				if ( '' !== $g && in_array( $g, $known, true ) ) {
					$groups[] = $g;
				}
			}
			$groups = array_values( array_unique( $groups ) );
		}

		return array(
			'web_fetch'           => ! empty( $in['web_fetch'] ),
			'approve_destructive' => isset( $in['approve_destructive'] )
				? ! empty( $in['approve_destructive'] )
				: $defaults['approve_destructive'],
			'disabled_groups'     => $groups,
		);
	}

	/**
	 * Applies a partial update and persists it.
	 *
	 * @since 3.6.0
	 * @param array $patch Keys to change.
	 * @return array The full, saved settings.
	 */
	public static function update( array $patch ): array {
		$merged = self::sanitize( array_merge( self::all(), $patch ) );
		update_option( self::OPTION, $merged, false );
		return $merged;
	}

	/**
	 * Whether the assistant may fetch web pages (the `web_fetch` built-in tool).
	 *
	 * @since 3.6.0
	 * @return bool
	 */
	public static function web_fetch_enabled(): bool {
		$all = self::all();
		return ! empty( $all['web_fetch'] );
	}

	/**
	 * Whether destructive tool calls must be approved by the user first.
	 *
	 * @since 3.6.0
	 * @return bool
	 */
	public static function approval_required(): bool {
		$all = self::all();
		return ! empty( $all['approve_destructive'] );
	}

	/**
	 * Whether a tool group may be loaded/called at all.
	 *
	 * Unknown groups (core tools, anything unclassified) are always allowed —
	 * only the explicitly-listed groups are gated.
	 *
	 * @since 3.6.0
	 * @param string $group Group id.
	 * @return bool
	 */
	public static function group_enabled( string $group ): bool {
		if ( '' === $group ) {
			return true;
		}
		$all = self::all();
		return ! in_array( $group, $all['disabled_groups'], true );
	}

	/**
	 * Whether a specific ability is reachable, by classifying it into a group.
	 *
	 * @since 3.6.0
	 * @param string $ability_name Fully-qualified ability name or slug.
	 * @return bool
	 */
	public static function ability_allowed( string $ability_name ): bool {
		$slug  = ( false !== strpos( $ability_name, '/' ) )
			? substr( $ability_name, strpos( $ability_name, '/' ) + 1 )
			: $ability_name;
		$group = EMCP_Tools_AI_Chat_Tool_Groups::classify( $slug );

		return self::group_enabled( (string) $group );
	}

	/**
	 * Client-facing shape for the settings screen.
	 *
	 * @since 3.6.0
	 * @return array
	 */
	public static function for_client(): array {
		$all = self::all();
		return array(
			'webFetch'           => (bool) $all['web_fetch'],
			'approveDestructive' => (bool) $all['approve_destructive'],
			'disabledGroups'     => array_values( $all['disabled_groups'] ),
		);
	}
}
