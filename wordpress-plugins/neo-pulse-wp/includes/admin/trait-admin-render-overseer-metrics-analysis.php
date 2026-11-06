<?php
/**
 * Overseer metrics dashboard and AI analysis pages.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Overseer_Metrics_Analysis {

	private static function render_overseer_metrics_page(): void {
		$date_to   = isset( $_GET['date_to'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['date_to'] ) ) : gmdate( 'Y-m-d' );
		$date_from = isset( $_GET['date_from'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['date_from'] ) ) : gmdate( 'Y-m-d', strtotime( '-7 days' ) );
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_from ) ) {
			$date_from = gmdate( 'Y-m-d', strtotime( '-7 days' ) );
		}
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_to ) ) {
			$date_to = gmdate( 'Y-m-d' );
		}

		$summary    = Neo_Pulse_Wp_Overseer::aggregate_summary( $date_from, $date_to );
		$top_pages  = Neo_Pulse_Wp_Overseer::aggregate_by_page( $date_from, $date_to );
		$top_paths  = array_slice( Neo_Pulse_Wp_Overseer::aggregate_paths( $date_from, $date_to ), 0, 10 );
		$top_clicks = array_slice( Neo_Pulse_Wp_Overseer::top_clicked_links( $date_from, $date_to ), 0, 10 );
		$top_goals  = Neo_Pulse_Wp_Overseer_Conversions::aggregate_by_goal( $date_from, $date_to );
		$metrics_url = admin_url( 'admin.php?page=neo-pulse-wp-overseer&action=metrics' );
		self::render_overseer_page_shell_open();
		?>
			<div class="neo-pulse-wp-overseer__titlebar">
			<h1><?php esc_html_e( 'Analytics Dashboard', 'neo-pulse-wp' ); ?></h1>
			</div>

			<form method="get" class="neo-pulse-wp-overseer__filter-form">
				<input type="hidden" name="page" value="neo-pulse-wp-overseer" />
				<input type="hidden" name="action" value="metrics" />
				<div class="neo-pulse-wp-overseer__filter-row">
					<label>
						<?php esc_html_e( 'From', 'neo-pulse-wp' ); ?>
						<input type="date" name="date_from" value="<?php echo esc_attr( $date_from ); ?>" />
					</label>
					<label>
						<?php esc_html_e( 'To', 'neo-pulse-wp' ); ?>
						<input type="date" name="date_to" value="<?php echo esc_attr( $date_to ); ?>" />
					</label>
				</div>
				<div class="neo-pulse-wp-overseer__filter-actions">
					<button type="submit" class="button"><?php esc_html_e( 'Apply', 'neo-pulse-wp' ); ?></button>
					<a class="button" href="<?php echo esc_url( $metrics_url ); ?>"><?php esc_html_e( 'Last 7 days', 'neo-pulse-wp' ); ?></a>
				</div>
			</form>

			<?php
			$load_display = (int) $summary['avg_page_load_ms'] > 0 ? ( (int) $summary['avg_page_load_ms'] ) . 'ms' : '—';
			$metric_groups = array(
				array(
					'title' => __( 'Traffic', 'neo-pulse-wp' ),
					'rows'  => array(
						array( __( 'Sessions', 'neo-pulse-wp' ), (string) (int) $summary['sessions'] ),
						array( __( 'Pageviews', 'neo-pulse-wp' ), (string) (int) $summary['pageviews'] ),
						array( __( 'Bounce rate', 'neo-pulse-wp' ), (int) $summary['bounce_rate_pct'] . '%' ),
						array( __( 'Avg session duration', 'neo-pulse-wp' ), (int) $summary['avg_session_duration_sec'] . 's' ),
					),
				),
				array(
					'title' => __( 'Engagement', 'neo-pulse-wp' ),
					'rows'  => array(
						array( __( 'Avg time on page', 'neo-pulse-wp' ), (int) $summary['avg_time_on_page_sec'] . 's' ),
						array( __( 'Avg active time', 'neo-pulse-wp' ), (int) $summary['avg_active_time_sec'] . 's' ),
						array( __( 'Avg scroll depth', 'neo-pulse-wp' ), (int) $summary['avg_scroll_pct'] . '%' ),
						array( __( 'Exit capture rate', 'neo-pulse-wp' ), (int) $summary['exit_capture_rate_pct'] . '%' ),
					),
				),
				array(
					'title' => __( 'Actions & performance', 'neo-pulse-wp' ),
					'rows'  => array(
						array( __( 'Avg page load', 'neo-pulse-wp' ), $load_display ),
						array( __( 'Clicks', 'neo-pulse-wp' ), (string) (int) $summary['clicks'] ),
						array( __( 'Form submits', 'neo-pulse-wp' ), (string) (int) $summary['form_submits'] ),
						array( __( 'Conversions', 'neo-pulse-wp' ), (string) (int) $summary['conversions'] ),
					),
				),
			);
			?>
			<div class="neo-pulse-wp-overseer__metrics-report">
				<?php foreach ( $metric_groups as $group ) : ?>
					<div class="neo-pulse-wp-overseer__panel neo-pulse-wp-overseer__metrics-group">
						<h2><?php echo esc_html( $group['title'] ); ?></h2>
						<dl class="neo-pulse-wp-overseer__metric-rows">
							<?php foreach ( $group['rows'] as $row ) : ?>
								<div class="neo-pulse-wp-overseer__metric-row">
									<dt><?php echo esc_html( $row[0] ); ?></dt>
									<dd><?php echo esc_html( $row[1] ); ?></dd>
								</div>
							<?php endforeach; ?>
						</dl>
					</div>
				<?php endforeach; ?>
			</div>

			<div class="neo-pulse-wp-overseer__panel neo-pulse-wp-overseer__panel--spaced">
				<h2><?php esc_html_e( 'Conversion goals', 'neo-pulse-wp' ); ?></h2>
				<?php if ( empty( $top_goals ) ) : ?>
					<p>
						<?php esc_html_e( 'No conversion goals configured.', 'neo-pulse-wp' ); ?>
						<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-overseer&action=conversions' ) ); ?>"><?php esc_html_e( 'Add a goal', 'neo-pulse-wp' ); ?></a>
					</p>
				<?php else : ?>
					<table class="neo-pulse-wp-overseer__metrics-table">
						<thead>
							<tr>
								<th><?php esc_html_e( 'Goal', 'neo-pulse-wp' ); ?></th>
								<th><?php esc_html_e( 'Conversions', 'neo-pulse-wp' ); ?></th>
							</tr>
						</thead>
						<tbody>
							<?php foreach ( $top_goals as $goal_row ) : ?>
								<?php if ( (int) $goal_row['count'] < 1 ) { continue; } ?>
								<tr>
									<td><?php echo esc_html( (string) $goal_row['name'] ); ?></td>
									<td><?php echo (int) $goal_row['count']; ?></td>
								</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				<?php endif; ?>
			</div>

			<div class="neo-pulse-wp-overseer__panel neo-pulse-wp-overseer__panel--spaced">
				<h2><?php esc_html_e( 'Top pages', 'neo-pulse-wp' ); ?></h2>
				<?php if ( empty( $top_pages ) ) : ?>
					<p><?php esc_html_e( 'No pageview data for this range.', 'neo-pulse-wp' ); ?></p>
				<?php else : ?>
					<table class="neo-pulse-wp-overseer__metrics-table">
						<thead>
							<tr>
								<th><?php esc_html_e( 'Page', 'neo-pulse-wp' ); ?></th>
								<th><?php esc_html_e( 'Views', 'neo-pulse-wp' ); ?></th>
								<th><?php esc_html_e( 'Avg time', 'neo-pulse-wp' ); ?></th>
								<th><?php esc_html_e( 'Avg active', 'neo-pulse-wp' ); ?></th>
								<th><?php esc_html_e( 'Scroll', 'neo-pulse-wp' ); ?></th>
								<th><?php esc_html_e( 'Exit rate', 'neo-pulse-wp' ); ?></th>
								<th><?php esc_html_e( 'Load', 'neo-pulse-wp' ); ?></th>
								<th><?php esc_html_e( 'Clicks', 'neo-pulse-wp' ); ?></th>
								<th><?php esc_html_e( 'Forms', 'neo-pulse-wp' ); ?></th>
							</tr>
						</thead>
						<tbody>
							<?php foreach ( $top_pages as $row ) : ?>
								<?php
								$avg_ms    = isset( $row->avg_duration_ms ) ? (int) round( (float) $row->avg_duration_ms / 1000 ) : 0;
								$avg_act   = isset( $row->avg_active_ms ) ? (int) round( (float) $row->avg_active_ms / 1000 ) : 0;
								$avg_scroll = isset( $row->avg_scroll_pct ) ? (int) round( (float) $row->avg_scroll_pct ) : 0;
								$avg_load  = isset( $row->avg_page_load_ms ) ? (int) round( (float) $row->avg_page_load_ms ) : 0;
								?>
								<tr>
									<td><?php echo esc_html( Neo_Pulse_Wp_Overseer::normalize_path_url( (string) $row->page_url ) ); ?></td>
									<td><?php echo (int) $row->pageviews; ?></td>
									<td><?php echo $avg_ms > 0 ? esc_html( $avg_ms . 's' ) : '—'; ?></td>
									<td><?php echo $avg_act > 0 ? esc_html( $avg_act . 's' ) : '—'; ?></td>
									<td><?php echo $avg_scroll > 0 ? esc_html( $avg_scroll . '%' ) : '—'; ?></td>
									<td><?php echo isset( $row->exit_rate_pct ) ? esc_html( (int) $row->exit_rate_pct . '%' ) : '—'; ?></td>
									<td><?php echo $avg_load > 0 ? esc_html( $avg_load . 'ms' ) : '—'; ?></td>
									<td><?php echo (int) $row->clicks; ?></td>
									<td><?php echo (int) $row->form_submits; ?></td>
								</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				<?php endif; ?>
			</div>

			<div class="neo-pulse-wp-overseer__panels">
				<div class="neo-pulse-wp-overseer__panel">
					<h2><?php esc_html_e( 'Top navigation paths', 'neo-pulse-wp' ); ?></h2>
					<?php if ( empty( $top_paths ) ) : ?>
						<p><?php esc_html_e( 'No multi-page paths yet.', 'neo-pulse-wp' ); ?></p>
					<?php else : ?>
						<ul>
							<?php foreach ( $top_paths as $path_row ) : ?>
								<li><?php echo esc_html( $path_row['path'] ); ?> — <?php echo (int) $path_row['count']; ?> <?php esc_html_e( 'sessions', 'neo-pulse-wp' ); ?></li>
							<?php endforeach; ?>
						</ul>
					<?php endif; ?>
				</div>
				<div class="neo-pulse-wp-overseer__panel">
					<h2><?php esc_html_e( 'Top clicked elements', 'neo-pulse-wp' ); ?></h2>
					<?php if ( empty( $top_clicks ) ) : ?>
						<p><?php esc_html_e( 'No click data for this range.', 'neo-pulse-wp' ); ?></p>
					<?php else : ?>
						<ul>
							<?php foreach ( $top_clicks as $link ) : ?>
								<li>
									<?php
									echo esc_html(
										sprintf(
											'%s → %s (%d)',
											Neo_Pulse_Wp_Overseer::normalize_path_url( (string) $link->page_url ),
											substr( (string) $link->element_href, 0, 60 ),
											(int) $link->click_count
										)
									);
									?>
								</li>
							<?php endforeach; ?>
						</ul>
					<?php endif; ?>
				</div>
			</div>
		<?php
		self::render_overseer_page_shell_close();
	}

	private static function render_overseer_analysis_page(): void {
		$flash       = self::get_and_clear_flash();
		$date_to     = gmdate( 'Y-m-d' );
		$date_from   = gmdate( 'Y-m-d', strtotime( '-7 days' ) );
		$model       = Neo_Pulse_Wp_Overseer_Analysis::get_model();
		$key_ok      = Neo_Pulse_Wp_OpenRouter::get_body_api_key() !== '';
		$settings    = Neo_Pulse_Wp_Overseer::get_settings();
		$include_gsc = ! empty( $settings['include_gsc'] );
		$gsc_ok      = Neo_Pulse_Wp_Gsc::is_available();
		$gsc_url     = admin_url( 'admin.php?page=neo-pulse-wp-settings&tab=gsc' );
		self::render_overseer_page_shell_open();
		?>
			<div class="neo-pulse-wp-overseer__titlebar">
			<h1><?php esc_html_e( 'AI Analysis', 'neo-pulse-wp' ); ?></h1>
			</div>

			<?php if ( $flash ) : ?>
				<div class="notice inline notice-<?php echo ! empty( $flash['success'] ) ? 'success' : 'error'; ?> is-dismissible">
					<p><?php echo esc_html( isset( $flash['message'] ) ? (string) $flash['message'] : '' ); ?></p>
				</div>
			<?php endif; ?>

			<?php if ( Neo_Pulse_Wp_License::ai_needs_upgrade( false ) ) : ?>
				<div class="notice inline notice-info">
					<p><?php echo esc_html( Neo_Pulse_Wp_License::upgrade_message() ); ?><?php echo Neo_Pulse_Wp_Plan::label_chip( 'npwp-ai-chip' ); // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped -- escaped in label_chip(). ?></p>
				</div>
			<?php elseif ( ! $key_ok ) : ?>
				<div class="notice inline notice-warning">
					<p><?php esc_html_e( 'Add an OpenRouter API key in NEO Pulse WP Settings to run analysis.', 'neo-pulse-wp' ); ?></p>
				</div>
			<?php endif; ?>

			<p class="description">
				<?php
				printf(
					/* translators: %s: model id */
					esc_html__( 'Generates a markdown report and actionable tasks using %s.', 'neo-pulse-wp' ),
					esc_html( $model )
				);
				?>
			</p>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_RUN_OVERSEER_ANALYSIS ); ?>" />
				<?php wp_nonce_field( self::ACTION_RUN_OVERSEER_ANALYSIS, 'neo_pulse_wp_overseer_analysis_nonce' ); ?>
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
						<th scope="row"><?php esc_html_e( 'Search Console', 'neo-pulse-wp' ); ?></th>
						<td>
							<p>
								<?php if ( $gsc_ok ) : ?>
									<span class="neo-pulse-wp-settings__gsc-status neo-pulse-wp-settings__gsc-status--ok"><?php esc_html_e( 'Connected', 'neo-pulse-wp' ); ?></span>
								<?php else : ?>
									<span class="neo-pulse-wp-settings__gsc-status neo-pulse-wp-settings__gsc-status--error"><?php esc_html_e( 'Not configured', 'neo-pulse-wp' ); ?></span>
								<?php endif; ?>
							</p>
							<label for="analysis_include_gsc">
								<input name="analysis_include_gsc" id="analysis_include_gsc" type="checkbox" value="1" <?php checked( $include_gsc ); ?> <?php disabled( ! $gsc_ok ); ?> />
								<?php esc_html_e( 'Include Google Search Console data', 'neo-pulse-wp' ); ?>
							</label>
							<?php if ( ! $gsc_ok ) : ?>
								<p class="description">
									<?php
									printf(
										/* translators: %s: settings URL */
										wp_kses(
											__( 'Connect GSC in <a href="%s">Settings → Search Console</a> to correlate search traffic with on-site engagement.', 'neo-pulse-wp' ),
											array( 'a' => array( 'href' => array() ) )
										),
										esc_url( $gsc_url )
									);
									?>
								</p>
							<?php else : ?>
								<p class="description"><?php esc_html_e( 'GSC dates are lag-adjusted (~3 days) when merged with Overseer page metrics.', 'neo-pulse-wp' ); ?></p>
							<?php endif; ?>
						</td>
					</tr>
				</table>
				<p class="submit">
					<button type="submit" class="button button-primary<?php echo esc_attr( Neo_Pulse_Wp_Plan::needs_ai_class() ); ?>" <?php disabled( ! $key_ok ); ?>>
						<?php esc_html_e( 'Generate report', 'neo-pulse-wp' ); ?>
					</button>
				</p>
			</form>
		<?php
		self::render_overseer_page_shell_close();
	}
}
