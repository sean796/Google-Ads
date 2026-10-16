<?php
/**
 * Bulk Edit / Quick Edit content type switch handler.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Content_Tools_Handlers {

	public static function register_content_tools_handlers(): void {
		add_action( 'save_post', array( __CLASS__, 'save_bulk_edit_content_type' ), 10, 2 );
	}

	/**
	 * @param int|mixed     $post_id Post ID.
	 * @param WP_Post|mixed $post    Post object (unused).
	 */
	public static function save_bulk_edit_content_type( $post_id, $post ): void {
		unset( $post );
		$post_id = (int) $post_id;
		if ( $post_id < 1 || ! isset( $_REQUEST['neo-pulse_new_post_type'] ) ) {
			return;
		}
		if ( ! isset( $_REQUEST['_inline_edit'] ) && empty( $_REQUEST['bulk_edit'] ) ) {
			return;
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		$new_type = sanitize_key( wp_unslash( (string) $_REQUEST['neo-pulse_new_post_type'] ) );
		if ( $new_type === '' || $new_type === '-1' ) {
			return;
		}

		Neo_Pulse_Wp_Content_Tools::switch_post_type( $post_id, $new_type );
	}
}
