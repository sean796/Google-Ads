<?php
/**
 * Content type switch for native WordPress content (Bulk Edit "Content type").
 *
 * Duplicating posts is left to Neo Tools, which has its own duplicator.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Content_Tools {

	/**
	 * Public post types that are not ordinary content (media, builder templates, block editor
	 * internals, Elementor floating buttons / landing pages) and must never be switched to or from.
	 *
	 * @var array<int, string>
	 */
	const EXCLUDED_POST_TYPES = array(
		'attachment',
		'elementor_library',
		'wp_block',
		'wp_navigation',
		'e-floating-buttons',
		'e-landing-page',
	);

	/**
	 * Public content types offered in the Bulk Edit "Content type" switcher.
	 *
	 * @return array<string, WP_Post_Type>
	 */
	public static function get_switchable_post_types(): array {
		$types = get_post_types( array( 'public' => true ), 'objects' );
		if ( ! is_array( $types ) ) {
			return array();
		}
		foreach ( self::EXCLUDED_POST_TYPES as $slug ) {
			unset( $types[ $slug ] );
		}
		return $types;
	}

	public static function is_switchable_post_type( string $post_type ): bool {
		return $post_type !== '' && isset( self::get_switchable_post_types()[ $post_type ] );
	}

	public static function user_can_switch( int $post_id, string $new_type ): bool {
		if ( $post_id < 1 || ! self::is_switchable_post_type( $new_type ) ) {
			return false;
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return false;
		}
		$target = get_post_type_object( $new_type );
		if ( ! $target instanceof WP_Post_Type ) {
			return false;
		}
		return current_user_can( $target->cap->edit_posts );
	}

	/**
	 * @return int|WP_Error
	 */
	public static function switch_post_type( int $post_id, string $new_type ) {
		if ( ! self::user_can_switch( $post_id, $new_type ) ) {
			return new WP_Error( 'neo-pulse_forbidden', __( 'You cannot switch this content type.', 'neo-pulse-wp' ) );
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error( 'neo-pulse_missing_post', __( 'Content not found.', 'neo-pulse-wp' ) );
		}
		if ( ! self::is_switchable_post_type( $post->post_type ) ) {
			return new WP_Error( 'neo-pulse_forbidden', __( 'You cannot switch this content type.', 'neo-pulse-wp' ) );
		}

		$old_type = $post->post_type;
		if ( $old_type === $new_type ) {
			return $post_id;
		}

		$updated = wp_update_post(
			array(
				'ID'        => $post_id,
				'post_type' => $new_type,
			),
			true
		);
		if ( is_wp_error( $updated ) ) {
			return $updated;
		}

		self::reconcile_taxonomies( $post_id, $old_type, $new_type );

		/** This action is documented in includes/class-neo-pulse-wp-content-tools.php */
		do_action( 'neo_pulse_wp_post_type_switched', $post_id, $old_type, $new_type );

		return (int) $updated;
	}

	private static function reconcile_taxonomies( int $post_id, string $old_type, string $new_type ): void {
		$old_taxonomies = get_object_taxonomies( $old_type );
		$new_taxonomies = get_object_taxonomies( $new_type );
		$compatible     = array_intersect( $old_taxonomies, $new_taxonomies );

		foreach ( $old_taxonomies as $taxonomy ) {
			if ( in_array( $taxonomy, $compatible, true ) ) {
				continue;
			}
			wp_set_object_terms( $post_id, array(), $taxonomy );
		}
	}
}
