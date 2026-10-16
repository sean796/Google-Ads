<?php
/**
 * robots.txt admin_post save and reset handlers.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Handlers_Robots_Txt {

	const ACTION_SAVE_ROBOTS_TXT  = 'neo_pulse_wp_save_robots_txt';
	const ACTION_RESET_ROBOTS_TXT = 'neo_pulse_wp_reset_robots_txt';

	public static function handle_save_robots_txt(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage robots.txt.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_SAVE_ROBOTS_TXT, 'neo_pulse_wp_robots_txt_nonce' );

		Neo_Pulse_Wp_Robots_Txt::save_content(
			isset( $_POST['neo-pulse_robots_txt_content'] ) ? wp_unslash( (string) $_POST['neo-pulse_robots_txt_content'] ) : ''
		);

		self::set_flash(
			array(
				'kind'    => 'robots-txt',
				'success' => true,
				'message' => __( 'robots.txt saved.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_robots_txt();
	}

	public static function handle_reset_robots_txt(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage robots.txt.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_RESET_ROBOTS_TXT, 'neo_pulse_wp_robots_txt_reset_nonce' );

		Neo_Pulse_Wp_Robots_Txt::reset_settings();

		self::set_flash(
			array(
				'kind'    => 'robots-txt',
				'success' => true,
				'message' => __( 'robots.txt reset to WordPress defaults.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_robots_txt();
	}

	private static function redirect_to_robots_txt(): void {
		self::redirect_to_page( 'neo-pulse-wp-robots-txt' );
	}
}
