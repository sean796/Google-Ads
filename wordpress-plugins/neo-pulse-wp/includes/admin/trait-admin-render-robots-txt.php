<?php
/**
 * robots.txt admin page.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Robots_Txt {

	public static function render_robots_txt_page(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage robots.txt.', 'neo-pulse-wp' ) );
		}

		$content = Neo_Pulse_Wp_Robots_Txt::get_content();
		$content = $content !== '' ? $content : Neo_Pulse_Wp_Robots_Txt::default_content();
		$form_id  = 'neo-pulse-wp-robots-txt-form';

		self::neo_pulse_group_shell_open( 'neo-pulse-wp-robots-txt', 'neo-pulse-wp-robots-txt neo-pulse-wp-panel-page', 'robots-txt' );
		?>
		<h1 class="neo-pulse-wp-panel-content__title"><?php esc_html_e( 'robots.txt', 'neo-pulse-wp' ); ?></h1>

		<div class="neo-pulse-wp-panel-info-box">
			<strong><?php esc_html_e( 'Live URL:', 'neo-pulse-wp' ); ?></strong>
			<a href="<?php echo esc_url( Neo_Pulse_Wp_Robots_Txt::preview_url() ); ?>" target="_blank" rel="noopener noreferrer"><?php echo esc_html( Neo_Pulse_Wp_Robots_Txt::preview_url() ); ?></a>
		</div>

		<?php if ( Neo_Pulse_Wp_Robots_Txt::has_physical_file() ) : ?>
			<div class="notice inline notice-warning neo-pulse-wp-acf-shell-notice">
				<p><?php esc_html_e( 'A physical robots.txt file exists in the site root. It overrides NEO Pulse and WordPress virtual robots.txt output.', 'neo-pulse-wp' ); ?></p>
			</div>
		<?php endif; ?>

		<form id="<?php echo esc_attr( $form_id ); ?>" method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-settings__form neo-pulse-schema-form">
			<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_ROBOTS_TXT ); ?>" />
			<?php wp_nonce_field( self::ACTION_SAVE_ROBOTS_TXT, 'neo_pulse_wp_robots_txt_nonce' ); ?>

			<?php
			self::panel_form_group_open();
			self::panel_form_field_textarea(
				'neo-pulse_robots_txt_content',
				'neo-pulse_robots_txt_content',
				__( 'Rules', 'neo-pulse-wp' ),
				$content,
				'full',
				18
			);
			self::panel_form_group_close();
			?>
		</form>

		<?php
		self::panel_footer_save(
			'editor',
			$form_id,
			self::ACTION_RESET_ROBOTS_TXT,
			self::ACTION_RESET_ROBOTS_TXT,
			'neo_pulse_wp_robots_txt_reset_nonce',
			'neo-pulse_robots_txt_tab'
		);
		self::neo_pulse_group_shell_close();
	}
}
