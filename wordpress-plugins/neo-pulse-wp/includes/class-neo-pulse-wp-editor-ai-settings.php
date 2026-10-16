<?php
/**
 * Which post types get the NEO Pulse editor AI (wands, SEO research, body tools).
 *
 * Set under NEO Pulse → Settings → Editor AI. This used to be the "Content Optimizer" toggles
 * on the Sitemap screen; sites upgraded from there keep their choice (see legacy_post_types()).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

final class Neo_Pulse_Wp_Editor_Ai_Settings {

	const OPTION = 'neo_pulse_wp_editor_ai';

	/**
	 * @return array<int,string>
	 */
	public static function post_types(): array {
		$saved = get_option( self::OPTION );
		if ( is_array( $saved ) && isset( $saved['post_types'] ) && is_array( $saved['post_types'] ) ) {
			return array_values( array_filter( array_map( 'sanitize_key', $saved['post_types'] ) ) );
		}
		return self::legacy_post_types();
	}

	/**
	 * @param array<int,string> $types
	 */
	public static function save_post_types( array $types ): void {
		$public = array_keys( get_post_types( array( 'public' => true ) ) );
		$clean  = array_values( array_intersect( array_unique( array_map( 'sanitize_key', $types ) ), $public ) );
		update_option( self::OPTION, array( 'post_types' => $clean ), false );
	}

	/**
	 * What the old Sitemap toggles allowed: posts and pages always, plus any type switched on there.
	 *
	 * @return array<int,string>
	 */
	public static function legacy_post_types(): array {
		$from_sitemap = class_exists( 'Neo_Pulse_Wp_Sitemap_Settings', false )
			? Neo_Pulse_Wp_Sitemap_Settings::content_optimizer_post_types()
			: array();
		return array_values( array_unique( array_merge( array( 'post', 'page' ), $from_sitemap ) ) );
	}

	/**
	 * Store the legacy choice once, so later Sitemap saves (which no longer carry it) can't lose it.
	 */
	public static function maybe_migrate(): void {
		if ( get_option( self::OPTION, null ) === null ) {
			self::save_post_types( self::legacy_post_types() );
		}
	}
}
