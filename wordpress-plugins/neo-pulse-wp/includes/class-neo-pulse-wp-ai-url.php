<?php
/**
 * Change post slug from Content Optimizer with optional NEO Pulse 301 redirect.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Ai_Url {

	/**
	 * Update published post slug; optionally create a 301 redirect from old to new URL.
	 *
	 * @param int    $post_id         Post ID.
	 * @param string $new_slug        Raw slug input.
	 * @param bool   $create_redirect Whether to add NEO Pulse redirect.
	 * @return array<string, mixed>|WP_Error
	 */
	public static function change_url( int $post_id, string $new_slug, bool $create_redirect ) {
		if ( $post_id < 1 || ! current_user_can( 'edit_post', $post_id ) ) {
			return new WP_Error(
				'neo-pulse_forbidden',
				__( 'You do not have permission to edit this post.', 'neo-pulse-wp' ),
				array( 'status' => 403 )
			);
		}

		// Check the redirect permission before anything changes, so a refused redirect never
		// leaves the slug changed with no redirect from the old URL.
		if ( $create_redirect && ! current_user_can( 'manage_options' ) ) {
			return new WP_Error(
				'neo-pulse_redirect_forbidden',
				__( 'You do not have permission to create redirects.', 'neo-pulse-wp' ),
				array( 'status' => 403 )
			);
		}

		$post = get_post( $post_id );
		if ( ! $post instanceof WP_Post ) {
			return new WP_Error(
				'neo-pulse_not_found',
				__( 'Post not found.', 'neo-pulse-wp' ),
				array( 'status' => 404 )
			);
		}

		if ( $post->post_status !== 'publish' ) {
			return new WP_Error(
				'neo-pulse_not_published',
				__( 'URL changes are only available for published posts.', 'neo-pulse-wp' ),
				array( 'status' => 400 )
			);
		}

		$slug = sanitize_title( $new_slug );
		if ( $slug === '' ) {
			return new WP_Error(
				'neo-pulse_invalid_slug',
				__( 'Enter a valid URL slug.', 'neo-pulse-wp' ),
				array( 'status' => 400 )
			);
		}

		if ( $slug === $post->post_name ) {
			return new WP_Error(
				'neo-pulse_unchanged_slug',
				__( 'The new slug is the same as the current slug.', 'neo-pulse-wp' ),
				array( 'status' => 400 )
			);
		}

		$old_permalink = get_permalink( $post_id );
		$old_permalink = is_string( $old_permalink ) ? $old_permalink : '';

		$updated = wp_update_post(
			array(
				'ID'        => $post_id,
				'post_name' => $slug,
			),
			true
		);

		if ( is_wp_error( $updated ) ) {
			return $updated;
		}

		clean_post_cache( $post_id );

		$new_permalink = get_permalink( $post_id );
		$new_permalink = is_string( $new_permalink ) ? $new_permalink : '';

		$redirect_result = null;
		if ( $create_redirect ) {
			$source = Neo_Pulse_Wp_Redirects_Csv::normalize_relative_path( $old_permalink );
			if ( ! $source ) {
				return new WP_Error(
					'neo-pulse_pretty_permalinks',
					__( 'Enable pretty permalinks before adding a redirect. The current URL cannot be used as a redirect source.', 'neo-pulse-wp' ),
					array( 'status' => 400 )
				);
			}

			$destination = Neo_Pulse_Wp_Redirects_Csv::resolve_destination_url( $new_permalink );
			if ( ! $destination ) {
				$destination = $new_permalink;
			}

			$saved = Neo_Pulse_Wp_Redirects::save(
				array(
					'source'      => $source,
					'destination' => $destination,
					'type'        => 301,
					'category'    => __( 'Content Optimizer', 'neo-pulse-wp' ),
					'status'      => 'active',
					'matching'    => 'exact',
				)
			);

			if ( empty( $saved['ok'] ) ) {
				return new WP_Error(
					'neo-pulse_redirect_failed',
					isset( $saved['error'] ) ? (string) $saved['error'] : __( 'Redirect could not be saved.', 'neo-pulse-wp' ),
					array( 'status' => 400 )
				);
			}

			$row = Neo_Pulse_Wp_Redirects::get( (int) $saved['id'] );
			$redirect_result = array(
				'id'          => (int) $saved['id'],
				'source'      => $row ? (string) $row->source : $source,
				'destination' => $row ? (string) $row->destination : $destination,
				'type'        => 301,
			);
		}

		return array(
			'ok'              => true,
			'slug'            => $slug,
			'permalink'       => $new_permalink,
			'oldPermalink'    => $old_permalink,
			'redirectCreated' => null !== $redirect_result,
			'redirect'        => $redirect_result,
		);
	}
}
