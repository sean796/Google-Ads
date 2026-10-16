<?php
/**
 * Search logs admin pages.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Search_Logs {

	public static function render_search_logs_page(): void {
		require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/admin/class-neo-pulse-wp-search-logs-list-table.php';
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage search logs.', 'neo-pulse-wp' ) );
		}

		$action = isset( $_GET['action'] ) ? sanitize_key( wp_unslash( (string) $_GET['action'] ) ) : 'list';
		switch ( $action ) {
			case 'import-export':
				self::render_search_logs_import_export_page();
				break;
			case 'settings':
				self::render_search_logs_settings_page();
				break;
			default:
				self::render_search_logs_list_page();
		}
	}

	private static function render_search_logs_list_page(): void {
		$list_table = new Neo_Pulse_Wp_Search_Logs_List_Table();
		$list_table->prepare_items();

		$base_url = admin_url( 'admin.php?page=neo-pulse-wp-search-logs' );
		$total    = Neo_Pulse_Wp_Search_Logs::count_events();
		$logging  = Neo_Pulse_Wp_Search_Logs::is_logging_active();

		self::neo_pulse_group_shell_open( 'neo-pulse-wp-search-logs', 'neo-pulse-wp-search-logs' );
		?>
		<div class="wrap">
			<h1 class="wp-heading-inline"><?php esc_html_e( 'Search Logs', 'neo-pulse-wp' ); ?></h1>
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-search-logs&action=import-export' ) ); ?>" class="page-title-action"><?php esc_html_e( 'Export', 'neo-pulse-wp' ); ?></a>
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-search-logs&action=settings' ) ); ?>" class="page-title-action"><?php esc_html_e( 'Settings', 'neo-pulse-wp' ); ?></a>
			<hr class="wp-header-end" />

			<?php if ( ! $logging ) : ?>
				<p class="description neo-pulse-wp-search-logs__note">
					<?php esc_html_e( 'Search logging is disabled. Enable it in Settings to capture queries and accepted answers.', 'neo-pulse-wp' ); ?>
				</p>
			<?php endif; ?>

			<p class="description">
				<?php
				printf(
					/* translators: %d: log count */
					esc_html__( '%d search events stored.', 'neo-pulse-wp' ),
					(int) $total
				);
				?>
			</p>

			<form method="get" class="neo-pulse-wp-search-logs__filter-form">
				<input type="hidden" name="page" value="neo-pulse-wp-search-logs" />
				<div class="neo-pulse-wp-search-logs__filter-row">
					<label>
						<?php esc_html_e( 'From', 'neo-pulse-wp' ); ?>
						<input type="date" name="date_from" value="<?php echo esc_attr( isset( $_GET['date_from'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['date_from'] ) ) : '' ); ?>" />
					</label>
					<label>
						<?php esc_html_e( 'To', 'neo-pulse-wp' ); ?>
						<input type="date" name="date_to" value="<?php echo esc_attr( isset( $_GET['date_to'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['date_to'] ) ) : '' ); ?>" />
					</label>
					<label>
						<input type="checkbox" name="accepted_only" value="1" <?php checked( ! empty( $_GET['accepted_only'] ) ); ?> />
						<?php esc_html_e( 'Accepted answers only', 'neo-pulse-wp' ); ?>
					</label>
					<?php submit_button( __( 'Filter', 'neo-pulse-wp' ), 'secondary', '', false ); ?>
				</div>
				<p class="search-box">
					<label class="screen-reader-text" for="search-log-search-input"><?php esc_html_e( 'Search logs', 'neo-pulse-wp' ); ?></label>
					<input type="search" id="search-log-search-input" name="s" value="<?php echo esc_attr( isset( $_REQUEST['s'] ) ? sanitize_text_field( wp_unslash( (string) $_REQUEST['s'] ) ) : '' ); ?>" />
					<?php submit_button( __( 'Search', 'neo-pulse-wp' ), '', '', false ); ?>
				</p>
			</form>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_BULK_SEARCH_LOGS ); ?>" />
				<?php wp_nonce_field( 'bulk-search-logs' ); ?>
				<?php $list_table->display(); ?>
			</form>
		</div>
		<?php
		self::neo_pulse_group_shell_close();
	}

	private static function render_search_logs_import_export_page(): void {
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-search-logs', 'neo-pulse-wp-search-logs' );
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Export Search Logs', 'neo-pulse-wp' ); ?></h1>
			<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-search-logs' ) ); ?>">&larr; <?php esc_html_e( 'Back to list', 'neo-pulse-wp' ); ?></a></p>

			<div class="neo-pulse-wp-search-logs__panels">
				<div class="neo-pulse-wp-search-logs__panel">
					<h2><?php esc_html_e( 'Export', 'neo-pulse-wp' ); ?></h2>
					<p><?php esc_html_e( 'Download search query history as CSV for training review.', 'neo-pulse-wp' ); ?></p>
					<p><code><?php echo esc_html( Neo_Pulse_Wp_Search_Logs_Csv::HEADER ); ?></code></p>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
						<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_EXPORT_SEARCH_LOGS ); ?>" />
						<?php wp_nonce_field( self::ACTION_EXPORT_SEARCH_LOGS, 'neo_pulse_wp_export_search_logs_nonce' ); ?>
						<label>
							<input type="checkbox" name="accepted_only" value="1" />
							<?php esc_html_e( 'Accepted answers only (training export)', 'neo-pulse-wp' ); ?>
						</label>
						<p><?php submit_button( __( 'Export CSV', 'neo-pulse-wp' ), 'primary', 'submit', false ); ?></p>
					</form>
				</div>
			</div>
		</div>
		<?php
		self::neo_pulse_group_shell_close();
	}

	private static function render_search_logs_settings_page(): void {
		$settings = Neo_Pulse_Wp_Search_Logs::get_settings();
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-search-logs', 'neo-pulse-wp-search-logs' );
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'Search Log Settings', 'neo-pulse-wp' ); ?></h1>
			<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-search-logs' ) ); ?>">&larr; <?php esc_html_e( 'Back to list', 'neo-pulse-wp' ); ?></a></p>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_SEARCH_LOG_SETTINGS ); ?>" />
				<?php wp_nonce_field( self::ACTION_SAVE_SEARCH_LOG_SETTINGS, 'neo_pulse_wp_search_log_settings_nonce' ); ?>
				<table class="form-table">
					<tr>
						<th scope="row"><?php esc_html_e( 'Logging', 'neo-pulse-wp' ); ?></th>
						<td>
							<label>
								<input type="checkbox" name="logging_enabled" value="1" <?php checked( ! empty( $settings['logging_enabled'] ) ); ?> />
								<?php esc_html_e( 'Record search queries and accepted answers', 'neo-pulse-wp' ); ?>
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="search_log_retention_days"><?php esc_html_e( 'Retention (days)', 'neo-pulse-wp' ); ?></label></th>
						<td>
							<input type="number" id="search_log_retention_days" name="retention_days" min="1" max="3650" value="<?php echo (int) $settings['retention_days']; ?>" />
						</td>
					</tr>
				</table>
				<?php submit_button( __( 'Save settings', 'neo-pulse-wp' ) ); ?>
			</form>
		</div>
		<?php
		self::neo_pulse_group_shell_close();
	}
}
