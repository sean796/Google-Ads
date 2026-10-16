<?php
/**
 * Chat logs admin pages.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Chat_Logs {

	public static function render_chat_logs_page(): void {
		require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/admin/class-neo-pulse-wp-chat-logs-list-table.php';
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage chat logs.', 'neo-pulse-wp' ) );
		}

		$action = isset( $_GET['action'] ) ? sanitize_key( wp_unslash( (string) $_GET['action'] ) ) : 'list';
		switch ( $action ) {
			case 'import-export':
				self::render_chat_logs_import_export_page();
				return;
			case 'settings':
				self::render_chat_logs_settings_page();
				return;
			case 'analysis':
				self::render_chat_logs_analysis_page();
				return;
			case 'reports':
				self::render_chat_logs_reports_page();
				return;
			case 'view-report':
				self::render_chat_logs_view_report_page();
				return;
			default:
				self::render_chat_logs_list_page();
		}
	}

	private static function render_chat_logs_list_page(): void {
		$list_table = new Neo_Pulse_Wp_Chat_Logs_List_Table();
		$list_table->prepare_items();
		$source     = isset( $_GET['chat_log_source'] ) ? sanitize_key( wp_unslash( (string) $_GET['chat_log_source'] ) ) : '';
		$role       = isset( $_GET['chat_log_role'] ) ? sanitize_key( wp_unslash( (string) $_GET['chat_log_role'] ) ) : '';
		$session    = isset( $_GET['session_id'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['session_id'] ) ) : '';
		$date_from  = isset( $_GET['date_from'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['date_from'] ) ) : '';
		$date_to    = isset( $_GET['date_to'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['date_to'] ) ) : '';
		$base_url   = admin_url( 'admin.php?page=neo-pulse-wp-chat-logs' );
		$total      = Neo_Pulse_Wp_Chat_Logs::count_messages();
		$key_ok     = Neo_Pulse_Wp_OpenRouter::get_body_api_key() !== '';
		$analysis_from = ( $date_from !== '' && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_from ) )
			? $date_from
			: gmdate( 'Y-m-d', strtotime( '-7 days' ) );
		$analysis_to   = ( $date_to !== '' && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_to ) )
			? $date_to
			: gmdate( 'Y-m-d' );
		$analysis_source = in_array( $source, array( 'frontend', 'demo' ), true ) ? $source : 'all';
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-chat-logs', 'neo-pulse-wp-chat-logs' );
		?>
			<h1 class="wp-heading-inline"><?php esc_html_e( 'Chat Logs', 'neo-pulse-wp' ); ?></h1>
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-chat-logs&action=reports' ) ); ?>" class="page-title-action"><?php esc_html_e( 'Reports', 'neo-pulse-wp' ); ?></a>
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-chat-logs&action=import-export' ) ); ?>" class="page-title-action"><?php esc_html_e( 'Import & Export', 'neo-pulse-wp' ); ?></a>
			<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-chat-logs&action=settings' ) ); ?>" class="page-title-action"><?php esc_html_e( 'Settings', 'neo-pulse-wp' ); ?></a>
			<hr class="wp-header-end" />

			<p class="description neo-pulse-wp-chat-logs__note">
				<?php
				printf(
					/* translators: %d: total message count */
					esc_html__( 'Flow Assist messages from the frontend widget and admin demo are stored on this site. Total messages: %d.', 'neo-pulse-wp' ),
					(int) $total
				);
				?>
			</p>

			<div class="neo-pulse-wp-chat-logs__ai-bar">
				<h2><?php esc_html_e( 'AI review', 'neo-pulse-wp' ); ?></h2>
				<p class="description">
					<?php esc_html_e( 'Analyze logged conversations for training and content recommendations, or download bulk generator CSVs for post and page knowledge gaps in the selected period.', 'neo-pulse-wp' ); ?>
				</p>
				<?php if ( ! $key_ok ) : ?>
					<div class="notice notice-warning inline">
						<p><?php esc_html_e( 'Add an OpenRouter API key in NEO Pulse WP Settings (agency key or wp-config). Analysis uses your site key only, not NEO Pulse cloud.', 'neo-pulse-wp' ); ?></p>
					</div>
				<?php endif; ?>
				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-chat-logs__ai-bar-form">
					<?php wp_nonce_field( self::ACTION_RUN_CHAT_LOG_ANALYSIS, 'neo_pulse_wp_chat_log_analysis_nonce' ); ?>
					<?php wp_nonce_field( self::ACTION_GENERATE_CHAT_LOG_POSTS_GAP_CSV, 'neo_pulse_wp_chat_log_posts_gap_csv_nonce' ); ?>
					<?php wp_nonce_field( self::ACTION_GENERATE_CHAT_LOG_PAGES_GAP_CSV, 'neo_pulse_wp_chat_log_pages_gap_csv_nonce' ); ?>
					<div class="neo-pulse-wp-chat-logs__ai-bar-fields">
						<label>
							<?php esc_html_e( 'From', 'neo-pulse-wp' ); ?>
							<input type="date" name="analysis_date_from" value="<?php echo esc_attr( $analysis_from ); ?>" required />
						</label>
						<label>
							<?php esc_html_e( 'To', 'neo-pulse-wp' ); ?>
							<input type="date" name="analysis_date_to" value="<?php echo esc_attr( $analysis_to ); ?>" required />
						</label>
						<label>
							<?php esc_html_e( 'Source', 'neo-pulse-wp' ); ?>
							<select name="analysis_source">
								<option value="all" <?php selected( $analysis_source, 'all' ); ?>><?php esc_html_e( 'All', 'neo-pulse-wp' ); ?></option>
								<option value="frontend" <?php selected( $analysis_source, 'frontend' ); ?>><?php esc_html_e( 'Frontend', 'neo-pulse-wp' ); ?></option>
								<option value="demo" <?php selected( $analysis_source, 'demo' ); ?>><?php esc_html_e( 'Demo', 'neo-pulse-wp' ); ?></option>
							</select>
						</label>
					</div>
					<div class="neo-pulse-wp-chat-logs__ai-bar-actions">
						<button type="submit" class="button neo-pulse-wp-chat-logs__gap-btn" name="action" value="<?php echo esc_attr( self::ACTION_GENERATE_CHAT_LOG_POSTS_GAP_CSV ); ?>" aria-label="<?php esc_attr_e( 'Posts knowledge gap', 'neo-pulse-wp' ); ?>" <?php disabled( ! $key_ok ); ?>>
							<span class="neo-pulse-wp-chat-logs__gap-icon" aria-hidden="true">P</span>
							<span aria-hidden="true"><?php esc_html_e( 'osts knowledge gap', 'neo-pulse-wp' ); ?></span>
						</button>
						<button type="submit" class="button neo-pulse-wp-chat-logs__gap-btn" name="action" value="<?php echo esc_attr( self::ACTION_GENERATE_CHAT_LOG_PAGES_GAP_CSV ); ?>" aria-label="<?php esc_attr_e( 'Pages knowledge gap', 'neo-pulse-wp' ); ?>" <?php disabled( ! $key_ok ); ?>>
							<span class="neo-pulse-wp-chat-logs__gap-icon" aria-hidden="true">P</span>
							<span aria-hidden="true"><?php esc_html_e( 'ages knowledge gap', 'neo-pulse-wp' ); ?></span>
						</button>
						<button type="submit" class="button" name="action" value="<?php echo esc_attr( self::ACTION_RUN_CHAT_LOG_ANALYSIS ); ?>" <?php disabled( ! $key_ok ); ?>>
							<?php esc_html_e( 'Generate AI report', 'neo-pulse-wp' ); ?>
						</button>
						<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-chat-logs&action=reports' ) ); ?>"><?php esc_html_e( 'View past reports', 'neo-pulse-wp' ); ?></a>
						<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-chat-logs&action=analysis' ) ); ?>"><?php esc_html_e( 'Advanced', 'neo-pulse-wp' ); ?></a>
					</div>
				</form>
			</div>

			<form method="get" class="neo-pulse-wp-chat-logs__filter-form">
				<input type="hidden" name="page" value="neo-pulse-wp-chat-logs" />
				<div class="neo-pulse-wp-chat-logs__filter-row">
					<label>
						<?php esc_html_e( 'Source', 'neo-pulse-wp' ); ?>
						<select name="chat_log_source">
							<option value=""><?php esc_html_e( 'All', 'neo-pulse-wp' ); ?></option>
							<option value="frontend" <?php selected( $source, 'frontend' ); ?>><?php esc_html_e( 'Frontend', 'neo-pulse-wp' ); ?></option>
							<option value="demo" <?php selected( $source, 'demo' ); ?>><?php esc_html_e( 'Demo', 'neo-pulse-wp' ); ?></option>
						</select>
					</label>
					<label>
						<?php esc_html_e( 'Role', 'neo-pulse-wp' ); ?>
						<select name="chat_log_role">
							<option value=""><?php esc_html_e( 'All', 'neo-pulse-wp' ); ?></option>
							<option value="user" <?php selected( $role, 'user' ); ?>><?php esc_html_e( 'User', 'neo-pulse-wp' ); ?></option>
							<option value="assistant" <?php selected( $role, 'assistant' ); ?>><?php esc_html_e( 'Assistant', 'neo-pulse-wp' ); ?></option>
						</select>
					</label>
					<label>
						<?php esc_html_e( 'Session', 'neo-pulse-wp' ); ?>
						<input type="search" name="session_id" value="<?php echo esc_attr( $session ); ?>" placeholder="<?php esc_attr_e( 'csess_…', 'neo-pulse-wp' ); ?>" />
					</label>
					<label>
						<?php esc_html_e( 'From', 'neo-pulse-wp' ); ?>
						<input type="date" name="date_from" value="<?php echo esc_attr( $date_from ); ?>" />
					</label>
					<label>
						<?php esc_html_e( 'To', 'neo-pulse-wp' ); ?>
						<input type="date" name="date_to" value="<?php echo esc_attr( $date_to ); ?>" />
					</label>
				</div>
				<div class="neo-pulse-wp-chat-logs__filter-actions">
					<button type="submit" class="button"><?php esc_html_e( 'Filter', 'neo-pulse-wp' ); ?></button>
					<a class="button" href="<?php echo esc_url( $base_url ); ?>"><?php esc_html_e( 'Reset', 'neo-pulse-wp' ); ?></a>
				</div>
			</form>

			<?php $list_table->search_box( __( 'Search Messages', 'neo-pulse-wp' ), 'chat_log' ); ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_BULK_CHAT_LOGS ); ?>" />
				<?php wp_nonce_field( 'bulk-chat-logs' ); ?>
				<?php if ( $source !== '' ) : ?>
					<input type="hidden" name="chat_log_source" value="<?php echo esc_attr( $source ); ?>" />
				<?php endif; ?>
				<?php if ( $role !== '' ) : ?>
					<input type="hidden" name="chat_log_role" value="<?php echo esc_attr( $role ); ?>" />
				<?php endif; ?>
				<?php if ( $session !== '' ) : ?>
					<input type="hidden" name="session_id" value="<?php echo esc_attr( $session ); ?>" />
				<?php endif; ?>
				<?php if ( $date_from !== '' ) : ?>
					<input type="hidden" name="date_from" value="<?php echo esc_attr( $date_from ); ?>" />
				<?php endif; ?>
				<?php if ( $date_to !== '' ) : ?>
					<input type="hidden" name="date_to" value="<?php echo esc_attr( $date_to ); ?>" />
				<?php endif; ?>
				<?php if ( isset( $_GET['s'] ) && (string) $_GET['s'] !== '' ) : ?>
					<input type="hidden" name="s" value="<?php echo esc_attr( sanitize_text_field( wp_unslash( (string) $_GET['s'] ) ) ); ?>" />
				<?php endif; ?>
				<?php if ( isset( $_GET['orderby'] ) && (string) $_GET['orderby'] !== '' ) : ?>
					<input type="hidden" name="orderby" value="<?php echo esc_attr( sanitize_key( wp_unslash( (string) $_GET['orderby'] ) ) ); ?>" />
				<?php endif; ?>
				<?php if ( isset( $_GET['order'] ) && (string) $_GET['order'] !== '' ) : ?>
					<input type="hidden" name="order" value="<?php echo esc_attr( sanitize_key( wp_unslash( (string) $_GET['order'] ) ) ); ?>" />
				<?php endif; ?>
				<?php $list_table->display(); ?>
			</form>
		<?php
		self::neo_pulse_group_shell_close();
	}

	private static function render_chat_logs_import_export_page(): void {
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-chat-logs', 'neo-pulse-wp-chat-logs' );
		?>
			<h1><?php esc_html_e( 'Import & Export', 'neo-pulse-wp' ); ?></h1>
			<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-chat-logs' ) ); ?>">&larr; <?php esc_html_e( 'Back to list', 'neo-pulse-wp' ); ?></a></p>

			<div class="neo-pulse-wp-chat-logs__panels">
				<div class="neo-pulse-wp-chat-logs__panel">
					<h2><?php esc_html_e( 'Import CSV', 'neo-pulse-wp' ); ?></h2>
					<p><?php esc_html_e( 'Upload a chat log CSV export. Rows with the same message_uid are skipped.', 'neo-pulse-wp' ); ?></p>
					<p><code><?php echo esc_html( Neo_Pulse_Wp_Chat_Logs_Csv::HEADER ); ?></code></p>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" enctype="multipart/form-data">
						<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_IMPORT_CHAT_LOGS ); ?>" />
						<?php wp_nonce_field( self::ACTION_IMPORT_CHAT_LOGS, 'neo_pulse_wp_import_chat_logs_nonce' ); ?>
						<p>
							<label>
								<input type="checkbox" name="replace_all" value="1" />
								<?php esc_html_e( 'Delete all existing messages before import', 'neo-pulse-wp' ); ?>
							</label>
						</p>
						<p><input type="file" name="chat_log_csv" accept=".csv,text/csv" required /></p>
						<p><button type="submit" class="button button-primary"><?php esc_html_e( 'Import CSV', 'neo-pulse-wp' ); ?></button></p>
					</form>
				</div>

				<div class="neo-pulse-wp-chat-logs__panel">
					<h2><?php esc_html_e( 'Export CSV', 'neo-pulse-wp' ); ?></h2>
					<p><?php esc_html_e( 'Download messages as CSV for backup or analysis in a spreadsheet.', 'neo-pulse-wp' ); ?></p>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
						<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_EXPORT_CHAT_LOGS ); ?>" />
						<?php wp_nonce_field( self::ACTION_EXPORT_CHAT_LOGS, 'neo_pulse_wp_export_chat_logs_nonce' ); ?>
						<p>
							<label><?php esc_html_e( 'Source', 'neo-pulse-wp' ); ?>
								<select name="export_source">
									<option value=""><?php esc_html_e( 'All', 'neo-pulse-wp' ); ?></option>
									<option value="frontend"><?php esc_html_e( 'Frontend', 'neo-pulse-wp' ); ?></option>
									<option value="demo"><?php esc_html_e( 'Demo', 'neo-pulse-wp' ); ?></option>
								</select>
							</label>
						</p>
						<p>
							<label><?php esc_html_e( 'From', 'neo-pulse-wp' ); ?> <input type="date" name="export_date_from" /></label>
							<label><?php esc_html_e( 'To', 'neo-pulse-wp' ); ?> <input type="date" name="export_date_to" /></label>
						</p>
						<p><button type="submit" class="button button-secondary"><?php esc_html_e( 'Export CSV', 'neo-pulse-wp' ); ?></button></p>
					</form>
				</div>
			</div>
		<?php
		self::neo_pulse_group_shell_close();
	}

	private static function render_chat_logs_settings_page(): void {
		$settings = Neo_Pulse_Wp_Chat_Logs::get_settings();
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-chat-logs', 'neo-pulse-wp-chat-logs' );
		?>
			<h1><?php esc_html_e( 'Chat Log Settings', 'neo-pulse-wp' ); ?></h1>
			<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-chat-logs' ) ); ?>">&larr; <?php esc_html_e( 'Back to list', 'neo-pulse-wp' ); ?></a></p>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_CHAT_LOG_SETTINGS ); ?>" />
				<?php wp_nonce_field( self::ACTION_SAVE_CHAT_LOG_SETTINGS, 'neo_pulse_wp_chat_log_settings_nonce' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><?php esc_html_e( 'Logging', 'neo-pulse-wp' ); ?></th>
						<td>
							<label for="logging_enabled">
								<input name="logging_enabled" id="logging_enabled" type="checkbox" value="1" <?php checked( ! empty( $settings['logging_enabled'] ) ); ?> />
								<?php esc_html_e( 'Store Flow Assist messages (frontend when chat is enabled; demo always)', 'neo-pulse-wp' ); ?>
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="retention_days"><?php esc_html_e( 'Retention (days)', 'neo-pulse-wp' ); ?></label></th>
						<td>
							<input name="retention_days" id="retention_days" type="number" min="1" max="3650" value="<?php echo esc_attr( (string) $settings['retention_days'] ); ?>" />
							<p class="description"><?php esc_html_e( 'Messages older than this are deleted automatically when new messages are logged.', 'neo-pulse-wp' ); ?></p>
						</td>
					</tr>
				</table>
				<p class="submit"><button type="submit" class="button button-primary"><?php esc_html_e( 'Save Settings', 'neo-pulse-wp' ); ?></button></p>
			</form>
		<?php
		self::neo_pulse_group_shell_close();
	}

	private static function render_chat_logs_analysis_page(): void {
		$date_to   = gmdate( 'Y-m-d' );
		$date_from = gmdate( 'Y-m-d', strtotime( '-7 days' ) );
		$model     = Neo_Pulse_Wp_Chat_Logs_Analysis::get_model();
		$key_ok    = Neo_Pulse_Wp_OpenRouter::get_body_api_key() !== '';
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-chat-logs', 'neo-pulse-wp-chat-logs' );
		?>
			<h1><?php esc_html_e( 'AI Chat Review', 'neo-pulse-wp' ); ?></h1>
			<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-chat-logs' ) ); ?>">&larr; <?php esc_html_e( 'Back to list', 'neo-pulse-wp' ); ?></a></p>

			<?php if ( ! $key_ok ) : ?>
				<div class="notice inline notice-warning">
					<p><?php esc_html_e( 'Add an OpenRouter API key in NEO Pulse WP Settings (agency key or wp-config). Analysis uses your site key only, not NEO Pulse cloud.', 'neo-pulse-wp' ); ?></p>
				</div>
			<?php endif; ?>

			<p class="description">
				<?php
				printf(
					/* translators: %s: model id */
					esc_html__( 'Generates a markdown report using %s via OpenRouter, grouped by conversation session.', 'neo-pulse-wp' ),
					esc_html( $model )
				);
				?>
			</p>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-chat-logs__analysis-form">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_RUN_CHAT_LOG_ANALYSIS ); ?>" />
				<?php wp_nonce_field( self::ACTION_RUN_CHAT_LOG_ANALYSIS, 'neo_pulse_wp_chat_log_analysis_nonce' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><label for="analysis_date_from"><?php esc_html_e( 'From', 'neo-pulse-wp' ); ?></label></th>
						<td><input type="date" name="analysis_date_from" id="analysis_date_from" value="<?php echo esc_attr( $date_from ); ?>" required /></td>
					</tr>
					<tr>
						<th scope="row"><label for="analysis_date_to"><?php esc_html_e( 'To', 'neo-pulse-wp' ); ?></label></th>
						<td><input type="date" name="analysis_date_to" id="analysis_date_to" value="<?php echo esc_attr( $date_to ); ?>" required /></td>
					</tr>
					<tr>
						<th scope="row"><label for="analysis_source"><?php esc_html_e( 'Source', 'neo-pulse-wp' ); ?></label></th>
						<td>
							<select name="analysis_source" id="analysis_source">
								<option value="all"><?php esc_html_e( 'All', 'neo-pulse-wp' ); ?></option>
								<option value="frontend"><?php esc_html_e( 'Frontend', 'neo-pulse-wp' ); ?></option>
								<option value="demo"><?php esc_html_e( 'Demo', 'neo-pulse-wp' ); ?></option>
							</select>
						</td>
					</tr>
				</table>
				<p class="submit">
					<button type="submit" class="button button-primary" <?php disabled( ! $key_ok ); ?>>
						<?php esc_html_e( 'Generate report', 'neo-pulse-wp' ); ?>
					</button>
				</p>
			</form>
		<?php
		self::neo_pulse_group_shell_close();
	}

	private static function render_chat_logs_reports_page(): void {
		$page   = isset( $_GET['paged'] ) ? max( 1, (int) $_GET['paged'] ) : 1;
		$result = Neo_Pulse_Wp_Chat_Logs::query_reports( 20, $page );
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-chat-logs', 'neo-pulse-wp-chat-logs' );
		?>
			<h1><?php esc_html_e( 'Analysis Reports', 'neo-pulse-wp' ); ?></h1>
			<p>
				<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-chat-logs' ) ); ?>">&larr; <?php esc_html_e( 'Back to list', 'neo-pulse-wp' ); ?></a>
				|
				<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-chat-logs&action=analysis' ) ); ?>"><?php esc_html_e( 'New analysis', 'neo-pulse-wp' ); ?></a>
			</p>

			<?php if ( empty( $result['items'] ) ) : ?>
				<p><?php esc_html_e( 'No reports yet. Run an analysis from the AI Analysis screen.', 'neo-pulse-wp' ); ?></p>
			<?php else : ?>
				<table class="wp-list-table widefat fixed striped">
					<thead>
						<tr>
							<th><?php esc_html_e( 'Created', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'Range', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'Source', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'Sessions', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'Messages', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'Actions', 'neo-pulse-wp' ); ?></th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ( $result['items'] as $report ) : ?>
							<tr>
								<td><?php echo esc_html( (string) $report->created_at ); ?></td>
								<td><?php echo esc_html( (string) $report->date_from . ' — ' . (string) $report->date_to ); ?></td>
								<td><?php echo esc_html( (string) $report->source_filter ); ?></td>
								<td><?php echo esc_html( number_format_i18n( (int) $report->session_count ) ); ?></td>
								<td><?php echo esc_html( number_format_i18n( (int) $report->message_count ) ); ?></td>
								<td>
									<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-chat-logs&action=view-report&id=' . (int) $report->id ) ); ?>"><?php esc_html_e( 'View', 'neo-pulse-wp' ); ?></a>
									|
									<a href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=' . self::ACTION_DELETE_CHAT_LOG_REPORT . '&id=' . (int) $report->id ), self::ACTION_DELETE_CHAT_LOG_REPORT . '_' . (int) $report->id ) ); ?>" class="submitdelete" onclick="return confirm('<?php echo esc_js( __( 'Delete this report?', 'neo-pulse-wp' ) ); ?>');"><?php esc_html_e( 'Delete', 'neo-pulse-wp' ); ?></a>
								</td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
			<?php endif; ?>
		<?php
		self::neo_pulse_group_shell_close();
	}

	private static function render_chat_logs_view_report_page(): void {
		$id = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0;
		$report = Neo_Pulse_Wp_Chat_Logs::get_report( $id );
		if ( ! $report ) {
			wp_die( esc_html__( 'Report not found.', 'neo-pulse-wp' ) );
		}
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-chat-logs', 'neo-pulse-wp-chat-logs' );
		?>
			<h1><?php esc_html_e( 'Analysis Report', 'neo-pulse-wp' ); ?></h1>
			<p>
				<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-chat-logs&action=reports' ) ); ?>">&larr; <?php esc_html_e( 'All reports', 'neo-pulse-wp' ); ?></a>
			</p>
			<p class="description">
				<?php
				printf(
					/* translators: 1: date from, 2: date to, 3: source filter, 4: model */
					esc_html__( '%1$s to %2$s · Source: %3$s · Model: %4$s · %5$d sessions · %6$d messages', 'neo-pulse-wp' ),
					esc_html( (string) $report->date_from ),
					esc_html( (string) $report->date_to ),
					esc_html( (string) $report->source_filter ),
					esc_html( (string) $report->model ),
					(int) $report->session_count,
					(int) $report->message_count
				);
				?>
			</p>
			<div class="neo-pulse-wp-chat-logs__report-body"><?php echo Neo_Pulse_Wp_Markdown::render( (string) $report->body ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?></div>
		<?php
		self::neo_pulse_group_shell_close();
	}
}
