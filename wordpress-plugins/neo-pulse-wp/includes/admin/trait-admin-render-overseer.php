<?php
/**
 * Overseer admin pages.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_wp_admin_overseer_dir = __DIR__ . '/';
require_once $neo_pulse_wp_admin_overseer_dir . 'trait-admin-render-overseer-timeline-conversions.php';
require_once $neo_pulse_wp_admin_overseer_dir . 'trait-admin-render-overseer-metrics-analysis.php';
require_once $neo_pulse_wp_admin_overseer_dir . 'trait-admin-render-overseer-reports-tasks-admin.php';

trait Neo_Pulse_Wp_Admin_Trait_Render_Overseer {

	use Neo_Pulse_Wp_Admin_Trait_Render_Overseer_Timeline_Conversions;
	use Neo_Pulse_Wp_Admin_Trait_Render_Overseer_Metrics_Analysis;
	use Neo_Pulse_Wp_Admin_Trait_Render_Overseer_Reports_Tasks_Admin;

	public static function render_overseer_page(): void {
		require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/admin/class-neo-pulse-wp-overseer-list-table.php';
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Overseer.', 'neo-pulse-wp' ) );
		}

		$action = isset( $_GET['action'] ) ? sanitize_key( wp_unslash( (string) $_GET['action'] ) ) : 'list';
		switch ( $action ) {
			case 'import-export':
				self::render_overseer_import_export_page();
				return;
			case 'settings':
				self::render_overseer_settings_page();
				return;
			case 'session':
				self::render_overseer_session_page();
				return;
			case 'analysis':
				self::render_overseer_analysis_page();
				return;
			case 'reports':
				self::render_overseer_reports_page();
				return;
			case 'view-report':
				self::render_overseer_view_report_page();
				return;
			case 'tasks':
				self::render_overseer_tasks_page();
				return;
			case 'metrics':
				self::render_overseer_metrics_page();
				return;
			case 'conversions':
				self::render_overseer_conversions_page();
				return;
			default:
				self::render_overseer_list_page();
		}
	}

	/**
	 * @return array<int, array{slug: string, label: string, url: string}>
	 */
	public static function get_overseer_subnav_items(): array {
		return array(
			array(
				'slug'  => 'metrics',
				'label' => __( 'Dashboard', 'neo-pulse-wp' ),
				'url'   => admin_url( 'admin.php?page=neo-pulse-wp-overseer&action=metrics' ),
			),
			array(
				'slug'  => 'list',
				'label' => __( 'Events', 'neo-pulse-wp' ),
				'url'   => admin_url( 'admin.php?page=neo-pulse-wp-overseer' ),
			),
			array(
				'slug'  => 'conversions',
				'label' => __( 'Conversions', 'neo-pulse-wp' ),
				'url'   => admin_url( 'admin.php?page=neo-pulse-wp-overseer&action=conversions' ),
			),
			array(
				'slug'  => 'analysis',
				'label' => __( 'AI Analysis', 'neo-pulse-wp' ),
				'url'   => admin_url( 'admin.php?page=neo-pulse-wp-overseer&action=analysis' ),
			),
			array(
				'slug'  => 'reports',
				'label' => __( 'Reports', 'neo-pulse-wp' ),
				'url'   => admin_url( 'admin.php?page=neo-pulse-wp-overseer&action=reports' ),
			),
			array(
				'slug'  => 'tasks',
				'label' => __( 'Tasks', 'neo-pulse-wp' ),
				'url'   => admin_url( 'admin.php?page=neo-pulse-wp-overseer&action=tasks' ),
			),
			array(
				'slug'  => 'export',
				'label' => __( 'Export', 'neo-pulse-wp' ),
				'url'   => admin_url( 'admin.php?page=neo-pulse-wp-overseer&action=import-export' ),
			),
			array(
				'slug'  => 'settings',
				'label' => __( 'Settings', 'neo-pulse-wp' ),
				'url'   => admin_url( 'admin.php?page=neo-pulse-wp-overseer&action=settings' ),
			),
		);
	}

	private static function render_overseer_page_shell_open( string $header_active = '' ): void {
		self::neo_pulse_group_shell_open( 'neo-pulse-wp-overseer', 'neo-pulse-wp-overseer neo-pulse-wp-overseer-app' );
		self::render_overseer_shell_header( $header_active );
		echo '<div class="neo-pulse-wp-overseer__body">';
	}

	/**
	 * Secondary Overseer section tabs (below the NEO Pulse AI Tools group header).
	 *
	 * @param string $active Active section slug; empty uses current request action.
	 */
	private static function render_overseer_shell_header( string $active = '' ): void {
		if ( $active === '' ) {
			$active = self::neo_pulse_overseer_active_section();
		}
		?>
		<nav class="neo-pulse-wp-overseer__shell-header" aria-label="<?php esc_attr_e( 'Overseer sections', 'neo-pulse-wp' ); ?>">
			<div class="neo-pulse-wp-overseer__shell-nav">
				<?php foreach ( self::get_overseer_subnav_items() as $item ) : ?>
					<a
						class="neo-pulse-wp-overseer__nav-item<?php echo $active === $item['slug'] ? ' is-active' : ''; ?>"
						href="<?php echo esc_url( $item['url'] ); ?>"
					><?php echo esc_html( $item['label'] ); ?></a>
				<?php endforeach; ?>
			</div>
		</nav>
		<?php
	}

	private static function render_overseer_page_shell_close(): void {
		echo '</div>';
		self::neo_pulse_group_shell_close();
	}

	private static function render_overseer_list_page(): void {
		$list_table = new Neo_Pulse_Wp_Overseer_List_Table();
		$list_table->prepare_items();
		$flash      = self::get_and_clear_flash();
		$session    = isset( $_GET['session_id'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['session_id'] ) ) : '';
		$date_from  = isset( $_GET['date_from'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['date_from'] ) ) : '';
		$date_to    = isset( $_GET['date_to'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['date_to'] ) ) : '';
		$total      = Neo_Pulse_Wp_Overseer::count_visits();
		$settings   = Neo_Pulse_Wp_Overseer::get_settings();
		$builtin_id = Neo_Pulse_Wp_Overseer::get_builtin_script_id();
		self::render_overseer_page_shell_open();
		?>
			<div class="neo-pulse-wp-overseer__titlebar">
			<h1 class="wp-heading-inline"><?php esc_html_e( 'Events', 'neo-pulse-wp' ); ?></h1>
			<?php if ( $builtin_id > 0 ) : ?>
				<a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-script-manager&action=edit&id=' . $builtin_id ) ); ?>" class="page-title-action"><?php esc_html_e( 'Page View Tag', 'neo-pulse-wp' ); ?></a>
			<?php endif; ?>
			</div>
			<hr class="wp-header-end" />

			<?php if ( $flash ) : ?>
				<div class="notice inline notice-<?php echo ! empty( $flash['success'] ) ? 'success' : 'error'; ?> is-dismissible">
					<p><?php echo esc_html( isset( $flash['message'] ) ? (string) $flash['message'] : '' ); ?></p>
				</div>
			<?php endif; ?>

			<p class="description neo-pulse-wp-overseer__note">
				<?php
				$tracking_label = ! empty( $settings['tracking_enabled'] )
					? __( 'enabled', 'neo-pulse-wp' )
					: __( 'disabled', 'neo-pulse-wp' );
				printf(
					/* translators: 1: total events, 2: tracking on/off */
					esc_html__( 'First-party analytics: pageviews, time on page, scroll depth, and key interactions. Total events: %1$d. Tracking is %2$s.', 'neo-pulse-wp' ),
					(int) $total,
					esc_html( $tracking_label )
				);
				?>
			</p>

			<?php if ( ! empty( $settings['exclude_admins'] ) ) : ?>
				<div class="notice notice-info inline">
					<p><?php esc_html_e( 'Administrator visits are not recorded while you are logged in. Test in a private window or turn off “exclude admins” in Settings.', 'neo-pulse-wp' ); ?></p>
				</div>
			<?php endif; ?>

			<div class="neo-pulse-wp-overseer__list-tools">
				<form method="get" class="neo-pulse-wp-overseer__filter-form">
					<input type="hidden" name="page" value="neo-pulse-wp-overseer" />
					<label for="neo-pulse-overseer-session" class="screen-reader-text"><?php esc_html_e( 'Session', 'neo-pulse-wp' ); ?></label>
					<input type="search" id="neo-pulse-overseer-session" name="session_id" value="<?php echo esc_attr( $session ); ?>" placeholder="<?php esc_attr_e( 'Session ID', 'neo-pulse-wp' ); ?>" />
					<label for="neo-pulse-overseer-date-from" class="screen-reader-text"><?php esc_html_e( 'From', 'neo-pulse-wp' ); ?></label>
					<input type="date" id="neo-pulse-overseer-date-from" name="date_from" value="<?php echo esc_attr( $date_from ); ?>" aria-label="<?php esc_attr_e( 'From', 'neo-pulse-wp' ); ?>" />
					<label for="neo-pulse-overseer-date-to" class="screen-reader-text"><?php esc_html_e( 'To', 'neo-pulse-wp' ); ?></label>
					<input type="date" id="neo-pulse-overseer-date-to" name="date_to" value="<?php echo esc_attr( $date_to ); ?>" aria-label="<?php esc_attr_e( 'To', 'neo-pulse-wp' ); ?>" />
					<label for="neo-pulse-overseer-search" class="screen-reader-text"><?php esc_html_e( 'Search', 'neo-pulse-wp' ); ?></label>
					<input type="search" id="neo-pulse-overseer-search" name="s" value="<?php echo isset( $_GET['s'] ) ? esc_attr( sanitize_text_field( wp_unslash( (string) $_GET['s'] ) ) ) : ''; ?>" placeholder="<?php esc_attr_e( 'URL, title, IP, session…', 'neo-pulse-wp' ); ?>" />
					<input type="submit" class="button" value="<?php esc_attr_e( 'Filter', 'neo-pulse-wp' ); ?>" />
					<a class="button" href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-overseer' ) ); ?>"><?php esc_html_e( 'Reset', 'neo-pulse-wp' ); ?></a>
				</form>

				<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" class="neo-pulse-wp-overseer__list-form">
					<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_BULK_OVERSEER_VISITS ); ?>" />
					<?php
					if ( $session !== '' ) {
						echo '<input type="hidden" name="session_id" value="' . esc_attr( $session ) . '" />';
					}
					if ( $date_from !== '' ) {
						echo '<input type="hidden" name="date_from" value="' . esc_attr( $date_from ) . '" />';
					}
					if ( $date_to !== '' ) {
						echo '<input type="hidden" name="date_to" value="' . esc_attr( $date_to ) . '" />';
					}
					if ( isset( $_GET['s'] ) && (string) $_GET['s'] !== '' ) {
						echo '<input type="hidden" name="s" value="' . esc_attr( sanitize_text_field( wp_unslash( (string) $_GET['s'] ) ) ) . '" />';
					}
					?>
					<?php $list_table->display(); ?>
				</form>
			</div>
		<?php
		self::render_overseer_page_shell_close();
	}

	private static function render_overseer_session_page(): void {
		$session_id = isset( $_GET['session_id'] ) ? sanitize_text_field( wp_unslash( (string) $_GET['session_id'] ) ) : '';
		$flash      = self::get_and_clear_flash();
		$summary    = Neo_Pulse_Wp_Overseer::get_session_summary( $session_id );
		$timeline   = Neo_Pulse_Wp_Overseer::get_session_timeline( $session_id );
		self::render_overseer_page_shell_open();
		?>
			<div class="neo-pulse-wp-overseer__titlebar">
			<h1><?php esc_html_e( 'Session Timeline', 'neo-pulse-wp' ); ?></h1>
			</div>
			<p><a href="<?php echo esc_url( admin_url( 'admin.php?page=neo-pulse-wp-overseer' ) ); ?>">&larr; <?php esc_html_e( 'Back to events', 'neo-pulse-wp' ); ?></a></p>

			<?php if ( $flash ) : ?>
				<div class="notice inline notice-<?php echo ! empty( $flash['success'] ) ? 'success' : 'error'; ?> is-dismissible">
					<p><?php echo esc_html( isset( $flash['message'] ) ? (string) $flash['message'] : '' ); ?></p>
				</div>
			<?php endif; ?>

			<?php if ( ! $summary ) : ?>
				<p><?php esc_html_e( 'Session not found.', 'neo-pulse-wp' ); ?></p>
			<?php else : ?>
				<div class="neo-pulse-wp-overseer__panel">
					<p>
						<strong><?php esc_html_e( 'Session', 'neo-pulse-wp' ); ?>:</strong> <code><?php echo esc_html( $session_id ); ?></code><br />
						<strong><?php esc_html_e( 'Device', 'neo-pulse-wp' ); ?>:</strong> <?php echo esc_html( (string) $summary->device ); ?>
						<?php if ( ! empty( $summary->ip_address ) ) : ?>
							· <strong><?php esc_html_e( 'IP', 'neo-pulse-wp' ); ?>:</strong> <?php echo esc_html( (string) $summary->ip_address ); ?>
						<?php endif; ?>
						<br />
						<strong><?php esc_html_e( 'Events', 'neo-pulse-wp' ); ?>:</strong> <?php echo (int) $summary->event_count; ?>
						· <strong><?php esc_html_e( 'Pageviews', 'neo-pulse-wp' ); ?>:</strong> <?php echo (int) $summary->pageviews; ?>
						<?php if ( ! empty( $summary->is_bounce ) ) : ?>
							· <strong><?php esc_html_e( 'Bounce', 'neo-pulse-wp' ); ?>:</strong> <?php esc_html_e( 'yes', 'neo-pulse-wp' ); ?>
						<?php endif; ?>
						<br />
						<strong><?php esc_html_e( 'Session duration', 'neo-pulse-wp' ); ?>:</strong> <?php echo (int) $summary->total_duration_sec; ?>s
						· <strong><?php esc_html_e( 'Active time', 'neo-pulse-wp' ); ?>:</strong> <?php echo (int) $summary->active_duration_sec; ?>s
						<?php if ( ! empty( $summary->avg_time_per_page_sec ) ) : ?>
							· <strong><?php esc_html_e( 'Avg per page', 'neo-pulse-wp' ); ?>:</strong> <?php echo (int) $summary->avg_time_per_page_sec; ?>s
						<?php endif; ?>
					</p>
				</div>

				<ol class="neo-pulse-wp-overseer__timeline">
					<?php foreach ( $timeline as $event ) : ?>
						<?php self::render_timeline_event( $event ); ?>
					<?php endforeach; ?>
				</ol>
			<?php endif; ?>
		<?php
		self::render_overseer_page_shell_close();
	}
}
