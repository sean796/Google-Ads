<?php
/**
 * Image SEO settings save handler.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Handlers_Image_Seo {

	const ACTION_SAVE_IMAGE_SEO = 'neo_pulse_wp_save_image_seo';

	const ACTION_BULK_IMAGE_SEO = 'neo_pulse_wp_bulk_image_seo';

	public static function handle_save_image_seo(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Image SEO settings.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_SAVE_IMAGE_SEO, 'neo_pulse_wp_image_seo_nonce' );

		$config = Neo_Pulse_Wp_Image_Seo::sanitize_config( wp_unslash( $_POST ) );
		Neo_Pulse_Wp_Image_Seo::save_config( $config );

		$tab = isset( $_POST['neo-pulse_image_seo_tab'] ) ? sanitize_key( wp_unslash( (string) $_POST['neo-pulse_image_seo_tab'] ) ) : 'library';

		self::set_flash(
			array(
				'kind'    => 'image-seo',
				'success' => true,
				'message' => __( 'Image SEO settings saved.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_image_seo( $tab );
	}

	public static function handle_bulk_image_seo(): void {
		if ( ! current_user_can( 'upload_files' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage media.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( 'bulk-images' );

		$action = '';
		if ( isset( $_REQUEST['image_seo_bulk_action'] ) && '-1' !== (string) $_REQUEST['image_seo_bulk_action'] ) {
			$action = sanitize_key( wp_unslash( (string) $_REQUEST['image_seo_bulk_action'] ) );
		} elseif ( isset( $_REQUEST['image_seo_bulk_action2'] ) && '-1' !== (string) $_REQUEST['image_seo_bulk_action2'] ) {
			$action = sanitize_key( wp_unslash( (string) $_REQUEST['image_seo_bulk_action2'] ) );
		}

		if ( $action !== 'optimize_ai' ) {
			self::redirect_to_image_seo( 'library' );
		}

		$ids = isset( $_REQUEST['attachment_ids'] ) ? array_map( 'absint', (array) wp_unslash( $_REQUEST['attachment_ids'] ) ) : array();
		$ids = array_values( array_filter( $ids ) );
		if ( empty( $ids ) ) {
			self::set_flash(
				array(
					'kind'    => 'image-seo',
					'success' => false,
					'message' => __( 'No images selected.', 'neo-pulse-wp' ),
				)
			);
			self::redirect_to_image_seo( 'library' );
		}

		if ( function_exists( 'set_time_limit' ) ) {
			set_time_limit( 300 );
		}

		$config = Neo_Pulse_Wp_Image_Seo::get_config();
		$ok     = 0;
		$failed = 0;
		foreach ( $ids as $id ) {
			$check = Neo_Pulse_Wp_Image_Seo_Gate::can_edit_attachment( $id );
			if ( is_wp_error( $check ) ) {
				++$failed;
				continue;
			}

			$preview = Neo_Pulse_Wp_Image_Seo_Ai::preview( $id, 0, true, null, null, $config );
			if ( is_wp_error( $preview ) ) {
				$preview = Neo_Pulse_Wp_Image_Seo_Ai::preview( $id, 0, false, null, null, $config );
			}
			if ( is_wp_error( $preview ) ) {
				++$failed;
				continue;
			}

			$apply = Neo_Pulse_Wp_Image_Seo_Ai::apply( $id, $preview['proposed'], null, null );
			if ( is_wp_error( $apply ) || ! empty( $apply['skipped'] ) ) {
				++$failed;
				continue;
			}
			++$ok;
		}

		self::set_flash(
			array(
				'kind'    => 'image-seo',
				'success' => $ok > 0,
				'message' => sprintf(
					/* translators: 1: optimized count, 2: total selected */
					__( 'Optimized %1$d of %2$d images.', 'neo-pulse-wp' ),
					$ok,
					count( $ids )
				),
			)
		);
		self::redirect_to_image_seo( 'library' );
	}

	private static function redirect_to_image_seo( string $tab = 'library' ): void {
		self::redirect_to_page( 'neo-pulse-wp-image-seo', array( 'tab' => $tab ) );
	}
}
