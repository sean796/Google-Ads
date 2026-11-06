<?php
/**
 * Overseer reports, tasks, export, and settings pages.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Overseer_Reports_Tasks_Admin {

	private static function render_overseer_reports_page(): void {
		$flash  = self::get_and_clear_flash();
		$page   = isset( $_GET['paged'] ) ? max( 1, (int) $_GET['paged'] ) : 1;
		$result = Neo_Pulse_Wp_Overseer_Reports::query( 20, $page );
		self::render_overseer_page_shell_open();
		?>
			<div class="neo-pulse-wp-overseer__titlebar">
			<h1><?php esc_html_e( 'Reports', 'neo-pulse-wp' ); ?></h1>
			</div>

			<?php if ( $flash ) : ?>
				<div class="notice inline notice-<?php echo ! empty( $flash['success'] ) ? 'success' : 'error'; ?> is-dismissible">
					<p><?php echo esc_html( isset( $flash['message'] ) ? (string) $flash['message'] : '' ); ?></p>
				</div>
			<?php endif; ?>

			<?php if ( empty( $result['items'] ) ) : ?>
				<p><?php esc_html_e( 'No reports yet.', 'neo-pulse-wp' ); ?></p>
			<?php else : ?>
				<table class="wp-list-table widefat fixed striped">
					<thead>
						<tr>
							<th><?php esc_html_e( 'Created', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'Range', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'Sessions', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'Events', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'Actions', 'neo-pulse-wp' ); ?></th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ( $result['items'] as $report ) : ?>
							<tr>
								<td><?php echo esc_html( (string) $report->created_at ); ?></td>
								<td><?php echo esc_html( (string) $report->date_from . ' — ' . (string) $report->date_to ); ?></td>
								<td><?php echo (int) $report->session_count; ?></td>
								<td><?php echo (int) $report->event_count; ?></td>
								<td>
									<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-overseer&action=view-report&id=' . (int) $report->id ) ); ?>"><?php esc_html_e( 'View', 'neo-pulse-wp' ); ?></a>
									|
									<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-overseer&action=tasks&report_id=' . (int) $report->id ) ); ?>"><?php esc_html_e( 'Tasks', 'neo-pulse-wp' ); ?></a>
									|
									<a href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=' . self::ACTION_DELETE_OVERSEER_REPORT . '&id=' . (int) $report->id ), self::ACTION_DELETE_OVERSEER_REPORT . '_' . (int) $report->id ) ); ?>" class="submitdelete" onclick="return confirm('<?php echo esc_js( __( 'Delete this report and its tasks?', 'neo-pulse-wp' ) ); ?>');"><?php esc_html_e( 'Delete', 'neo-pulse-wp' ); ?></a>
								</td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
			<?php endif; ?>
		<?php
		self::render_overseer_page_shell_close();
	}

	private static function render_overseer_view_report_page(): void {
		$id     = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0;
		$report = Neo_Pulse_Wp_Overseer_Reports::get( $id );
		self::render_overseer_page_shell_open();
		?>
			<div class="neo-pulse-wp-overseer__titlebar">
			<h1><?php esc_html_e( 'Report', 'neo-pulse-wp' ); ?></h1>
			</div>
			<p>
				<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-overseer&action=reports' ) ); ?>">&larr; <?php esc_html_e( 'Back to reports', 'neo-pulse-wp' ); ?></a>
				|
				<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-overseer&action=tasks&report_id=' . $id ) ); ?>"><?php esc_html_e( 'View tasks', 'neo-pulse-wp' ); ?></a>
			</p>

			<?php if ( ! $report ) : ?>
				<p><?php esc_html_e( 'Report not found.', 'neo-pulse-wp' ); ?></p>
			<?php else : ?>
				<div class="neo-pulse-wp-overseer__panel" style="margin-bottom:1em;">
					<p>
						<strong><?php esc_html_e( 'Date range:', 'neo-pulse-wp' ); ?></strong>
						<?php echo esc_html( (string) $report->date_from . ' — ' . (string) $report->date_to ); ?>
						&nbsp;|&nbsp;
						<strong><?php esc_html_e( 'Sessions:', 'neo-pulse-wp' ); ?></strong> <?php echo (int) $report->session_count; ?>
						&nbsp;|&nbsp;
						<strong><?php esc_html_e( 'Events:', 'neo-pulse-wp' ); ?></strong> <?php echo (int) $report->event_count; ?>
					</p>
					<?php if ( ! empty( $report->gsc_included ) ) : ?>
						<p>
							<strong><?php esc_html_e( 'Google Search Console:', 'neo-pulse-wp' ); ?></strong>
							<?php
							if ( ! empty( $report->gsc_date_from ) && ! empty( $report->gsc_date_to ) ) {
								printf(
									/* translators: 1: start date, 2: end date */
									esc_html__( 'Included (lag-adjusted range %1$s — %2$s)', 'neo-pulse-wp' ),
									esc_html( (string) $report->gsc_date_from ),
									esc_html( (string) $report->gsc_date_to )
								);
							} else {
								esc_html_e( 'Included', 'neo-pulse-wp' );
							}
							?>
						</p>
					<?php endif; ?>
				</div>
				<div class="neo-pulse-wp-overseer__panel neo-pulse-wp-overseer__report-body">
					<?php echo Neo_Pulse_Wp_Markdown::render( (string) $report->body ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>
				</div>
			<?php endif; ?>
		<?php
		self::render_overseer_page_shell_close();
	}

	private static function render_overseer_tasks_page(): void {
		$flash     = self::get_and_clear_flash();
		$report_id = isset( $_GET['report_id'] ) ? (int) $_GET['report_id'] : 0;
		$result    = Neo_Pulse_Wp_Overseer_Tasks::query(
			array(
				'report_id' => $report_id,
				'per_page'  => 50,
				'page'      => 1,
			)
		);
		$fba_url   = admin_url( 'admin.php?page=neo-pulse-wp-backend-assist' );
		self::render_overseer_page_shell_open();
		?>
			<div class="neo-pulse-wp-overseer__titlebar">
			<h1><?php esc_html_e( 'Tasks', 'neo-pulse-wp' ); ?></h1>
			</div>

			<?php if ( $flash ) : ?>
				<div class="notice inline notice-<?php echo ! empty( $flash['success'] ) ? 'success' : 'error'; ?> is-dismissible">
					<p><?php echo esc_html( isset( $flash['message'] ) ? (string) $flash['message'] : '' ); ?></p>
				</div>
			<?php endif; ?>

			<?php if ( $report_id > 0 ) : ?>
				<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-overseer&action=view-report&id=' . $report_id ) ); ?>">&larr; <?php esc_html_e( 'Back to report', 'neo-pulse-wp' ); ?></a></p>
			<?php endif; ?>

			<?php if ( empty( $result['items'] ) ) : ?>
				<p><?php esc_html_e( 'No tasks yet. Run an AI analysis to generate recommendations.', 'neo-pulse-wp' ); ?></p>
			<?php else : ?>
				<table class="wp-list-table widefat fixed striped">
					<thead>
						<tr>
							<th><?php esc_html_e( 'Priority', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'Task', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'Category', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'Status', 'neo-pulse-wp' ); ?></th>
							<th><?php esc_html_e( 'Actions', 'neo-pulse-wp' ); ?></th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ( $result['items'] as $task ) : ?>
							<tr>
								<td><?php echo (int) $task->priority; ?></td>
								<td>
									<strong><?php echo esc_html( (string) $task->title ); ?></strong>
									<?php if ( ! empty( $task->description ) ) : ?>
										<p class="description"><?php echo esc_html( wp_trim_words( (string) $task->description, 30 ) ); ?></p>
									<?php endif; ?>
								</td>
								<td><?php echo esc_html( (string) $task->category ); ?></td>
								<td><?php echo esc_html( (string) $task->status ); ?></td>
								<td>
									<?php if ( 'pending' === (string) $task->status ) : ?>
										<a href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=' . self::ACTION_APPROVE_OVERSEER_TASK . '&id=' . (int) $task->id ), self::ACTION_APPROVE_OVERSEER_TASK . '_' . (int) $task->id ) ); ?>"><?php esc_html_e( 'Approve', 'neo-pulse-wp' ); ?></a>
										|
										<a href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=' . self::ACTION_DISMISS_OVERSEER_TASK . '&id=' . (int) $task->id ), self::ACTION_DISMISS_OVERSEER_TASK . '_' . (int) $task->id ) ); ?>"><?php esc_html_e( 'Dismiss', 'neo-pulse-wp' ); ?></a>
									<?php elseif ( in_array( (string) $task->status, array( 'approved', 'running' ), true ) && ! empty( $task->assist_message ) ) : ?>
										<a href="<?php echo esc_url( $fba_url ); ?>" class="neo-pulse-overseer-run-fba" data-task-id="<?php echo (int) $task->id; ?>" data-prefill="<?php echo esc_attr( (string) $task->assist_message ); ?>"><?php esc_html_e( 'Run in Flow Assist', 'neo-pulse-wp' ); ?></a>
										|
										<a href="<?php echo esc_url( wp_nonce_url( admin_url( 'admin-post.php?action=' . self::ACTION_DONE_OVERSEER_TASK . '&id=' . (int) $task->id ), self::ACTION_DONE_OVERSEER_TASK . '_' . (int) $task->id ) ); ?>"><?php esc_html_e( 'Mark done', 'neo-pulse-wp' ); ?></a>
									<?php elseif ( 'done' === (string) $task->status ) : ?>
										<?php esc_html_e( 'Completed', 'neo-pulse-wp' ); ?>
									<?php else : ?>
										—
									<?php endif; ?>
								</td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
				<script>
				(function(){
					var links=document.querySelectorAll('.neo-pulse-overseer-run-fba');
					for(var i=0;i<links.length;i++){
						links[i].addEventListener('click',function(ev){
							try{
								sessionStorage.setItem('neo-pulse_fba_prefill',this.getAttribute('data-prefill')||'');
								sessionStorage.setItem('neo-pulse_fba_prefill_task_id',this.getAttribute('data-task-id')||'');
							}catch(e){}
						});
					}
				})();
				</script>
			<?php endif; ?>
		<?php
		self::render_overseer_page_shell_close();
	}

	private static function render_overseer_import_export_page(): void {
		$flash = self::get_and_clear_flash();
		self::render_overseer_page_shell_open();
		?>
			<div class="neo-pulse-wp-overseer__titlebar">
			<h1><?php esc_html_e( 'Export', 'neo-pulse-wp' ); ?></h1>
			</div>

			<?php if ( $flash ) : ?>
				<div class="notice inline notice-<?php echo ! empty( $flash['success'] ) ? 'success' : 'error'; ?> is-dismissible">
					<p><?php echo esc_html( isset( $flash['message'] ) ? (string) $flash['message'] : '' ); ?></p>
				</div>
			<?php endif; ?>

			<div class="neo-pulse-wp-overseer__panels">
				<div class="neo-pulse-wp-overseer__panel">
					<h2><?php esc_html_e( 'Export CSV', 'neo-pulse-wp' ); ?></h2>
					<p><?php esc_html_e( 'Download all events including time on page, scroll depth, and interactions.', 'neo-pulse-wp' ); ?></p>
					<p><code><?php echo esc_html( Neo_Pulse_Wp_Overseer_Csv::HEADER ); ?></code></p>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
						<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_EXPORT_OVERSEER ); ?>" />
						<?php wp_nonce_field( self::ACTION_EXPORT_OVERSEER, 'neo_pulse_wp_export_overseer_nonce' ); ?>
						<p>
							<label><?php esc_html_e( 'From', 'neo-pulse-wp' ); ?> <input type="date" name="export_date_from" /></label>
							<label><?php esc_html_e( 'To', 'neo-pulse-wp' ); ?> <input type="date" name="export_date_to" /></label>
						</p>
						<p><button type="submit" class="button button-secondary"><?php esc_html_e( 'Export CSV', 'neo-pulse-wp' ); ?></button></p>
					</form>
				</div>

				<div class="neo-pulse-wp-overseer__panel">
					<h2><?php esc_html_e( 'Clear all visits', 'neo-pulse-wp' ); ?></h2>
					<p><?php esc_html_e( 'Permanently delete every stored event. This cannot be undone.', 'neo-pulse-wp' ); ?></p>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" onsubmit="return confirm('<?php echo esc_js( __( 'Delete all Overseer events?', 'neo-pulse-wp' ) ); ?>');">
						<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_CLEAR_OVERSEER_VISITS ); ?>" />
						<?php wp_nonce_field( self::ACTION_CLEAR_OVERSEER_VISITS, 'neo_pulse_wp_clear_overseer_nonce' ); ?>
						<p><button type="submit" class="button button-link-delete"><?php esc_html_e( 'Clear all visits', 'neo-pulse-wp' ); ?></button></p>
					</form>
				</div>
			</div>
		<?php
		self::render_overseer_page_shell_close();
	}

	private static function render_overseer_settings_page(): void {
		$settings = Neo_Pulse_Wp_Overseer::get_settings();
		$flash    = self::get_and_clear_flash();
		self::render_overseer_page_shell_open();
		?>
			<div class="neo-pulse-wp-overseer__titlebar">
			<h1><?php esc_html_e( 'Settings', 'neo-pulse-wp' ); ?></h1>
			</div>

			<?php if ( $flash ) : ?>
				<div class="notice inline notice-<?php echo ! empty( $flash['success'] ) ? 'success' : 'error'; ?> is-dismissible">
					<p><?php echo esc_html( isset( $flash['message'] ) ? (string) $flash['message'] : '' ); ?></p>
				</div>
			<?php endif; ?>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_OVERSEER_SETTINGS ); ?>" />
				<?php wp_nonce_field( self::ACTION_SAVE_OVERSEER_SETTINGS, 'neo_pulse_wp_overseer_settings_nonce' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><?php esc_html_e( 'Tracking', 'neo-pulse-wp' ); ?></th>
						<td>
							<label for="tracking_enabled">
								<input name="tracking_enabled" id="tracking_enabled" type="checkbox" value="1" <?php checked( ! empty( $settings['tracking_enabled'] ) ); ?> />
								<?php esc_html_e( 'Record analytics via the NEO Pulse Page View tag', 'neo-pulse-wp' ); ?>
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Interactions', 'neo-pulse-wp' ); ?></th>
						<td>
							<label for="track_interactions">
								<input name="track_interactions" id="track_interactions" type="checkbox" value="1" <?php checked( ! empty( $settings['track_interactions'] ) ); ?> />
								<?php esc_html_e( 'Track clicks, form submits, and outbound links', 'neo-pulse-wp' ); ?>
							</label>
							<p>
								<label for="track_outbound_only">
									<input name="track_outbound_only" id="track_outbound_only" type="checkbox" value="1" <?php checked( ! empty( $settings['track_outbound_only'] ) ); ?> />
									<?php esc_html_e( 'Only track outbound links and form submits (skip internal clicks)', 'neo-pulse-wp' ); ?>
								</label>
							</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><label for="retention_days"><?php esc_html_e( 'Retention (days)', 'neo-pulse-wp' ); ?></label></th>
						<td>
							<input name="retention_days" id="retention_days" type="number" min="1" max="3650" value="<?php echo esc_attr( (string) $settings['retention_days'] ); ?>" />
							<p class="description"><?php esc_html_e( 'Events older than this are deleted automatically.', 'neo-pulse-wp' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Privacy', 'neo-pulse-wp' ); ?></th>
						<td>
							<label for="anonymize_ip">
								<input name="anonymize_ip" id="anonymize_ip" type="checkbox" value="1" <?php checked( ! empty( $settings['anonymize_ip'] ) ); ?> />
								<?php esc_html_e( 'Anonymize IP addresses before storage (last IPv4 octet zeroed)', 'neo-pulse-wp' ); ?>
							</label>
							<p class="description"><?php esc_html_e( 'Depending on your region, visitor tracking may require consent under GDPR/CCPA. Form field values are never stored. Conversion events store only which field types were present (email, phone, etc.), not their contents.', 'neo-pulse-wp' ); ?></p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Administrators', 'neo-pulse-wp' ); ?></th>
						<td>
							<label for="exclude_admins">
								<input name="exclude_admins" id="exclude_admins" type="checkbox" value="1" <?php checked( ! empty( $settings['exclude_admins'] ) ); ?> />
								<?php esc_html_e( 'Do not record visits from logged-in administrators', 'neo-pulse-wp' ); ?>
							</label>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'AI Analysis', 'neo-pulse-wp' ); ?></th>
						<td>
							<label for="include_gsc">
								<input name="include_gsc" id="include_gsc" type="checkbox" value="1" <?php checked( ! empty( $settings['include_gsc'] ) ); ?> />
								<?php esc_html_e( 'Include Google Search Console data in AI analysis by default', 'neo-pulse-wp' ); ?>
							</label>
							<p class="description"><?php esc_html_e( 'When connected, search clicks and queries are merged with on-site engagement in generated reports.', 'neo-pulse-wp' ); ?></p>
						</td>
					</tr>
				</table>
				<p class="submit"><button type="submit" class="button button-primary"><?php esc_html_e( 'Save Settings', 'neo-pulse-wp' ); ?></button></p>
			</form>
		<?php
		self::render_overseer_page_shell_close();
	}
}
