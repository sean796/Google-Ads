<?php
/**
 * A page helper for the Pro library screens. The admin-ajax handlers this
 * class held are gone (3.18.0): the React screens use the admin REST routes.
 *
 * @package EMCP_Tools
 * @since   2.1.0 (extracted from the bootstrap file)
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Pro library page helper.
 *
 * @since 2.1.0
 */
class EMCP_Tools_Pro_Ajax {

	/**
	 * URL of the most-recently-modified Elementor page (builder mode), or the
	 * site homepage as a fallback. Used by the apply/restore toasts so the user
	 * lands somewhere that actually showcases the change.
	 *
	 * @since 1.8.0
	 *
	 * @return string
	 */
	public static function recent_elementor_page_url(): string {
		$query = new WP_Query(
			array(
				'post_type'      => 'any',
				'post_status'    => 'publish',
				'posts_per_page' => 1,
				'orderby'        => 'modified',
				'order'          => 'DESC',
				'no_found_rows'  => true,
				'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
					array(
						'key'   => '_elementor_edit_mode',
						'value' => 'builder',
					),
				),
			)
		);

		if ( ! empty( $query->posts ) ) {
			$permalink = get_permalink( $query->posts[0] );
			if ( $permalink ) {
				return $permalink;
			}
		}

		return home_url( '/' );
	}
}
