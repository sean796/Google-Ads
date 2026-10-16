<?php
/**
 * Overseer admin pages.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Overseer {

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

	/**
	 * @param object $event Event row.
	 */
	private static function render_timeline_event( $event ): void {
		$type = isset( $event->event_type ) ? (string) $event->event_type : 'pageview';
		$url  = isset( $event->page_url ) ? (string) $event->page_url : '';
		$title = isset( $event->page_title ) ? (string) $event->page_title : '';
		$when = isset( $event->created_at ) ? (string) $event->created_at : '';
		?>
		<li class="neo-pulse-wp-overseer__timeline-item neo-pulse-wp-overseer__timeline-item--<?php echo esc_attr( sanitize_html_class( $type ) ); ?>">
			<div class="neo-pulse-wp-overseer__timeline-meta"><?php echo esc_html( $when ); ?> · <?php echo esc_html( $type ); ?></div>
			<?php if ( in_array( $type, array( 'page_exit', 'page_heartbeat' ), true ) ) : ?>
				<?php
				$sec        = isset( $event->duration_ms ) ? (int) round( (int) $event->duration_ms / 1000 ) : 0;
				$active_sec = isset( $event->active_duration_ms ) ? (int) round( (int) $event->active_duration_ms / 1000 ) : 0;
				$scroll     = isset( $event->scroll_depth_pct ) ? (int) $event->scroll_depth_pct : 0;
				$label      = 'page_heartbeat' === $type ? __( 'Heartbeat', 'neo-pulse-wp' ) : __( 'Left', 'neo-pulse-wp' );
				?>
				<div><?php echo esc_html( sprintf( __( '%1$s %2$s — %3$ds on page (%4$ds active, %5$d%% scroll)', 'neo-pulse-wp' ), $label, Neo_Pulse_Wp_Overseer::normalize_path_url( $url ), $sec, $active_sec, $scroll ) ); ?></div>
			<?php elseif ( 'conversion' === $type ) : ?>
				<div>
					<?php echo esc_html( (string) ( $event->element_text ?? __( 'Conversion', 'neo-pulse-wp' ) ) ); ?>
					<?php
					$signals = self::parse_conversion_client_meta( $event );
					if ( $signals !== '' ) :
						?>
						— <?php echo esc_html( $signals ); ?>
					<?php endif; ?>
				</div>
			<?php elseif ( in_array( $type, array( 'click', 'outbound_click', 'form_submit' ), true ) ) : ?>
				<div>
					<?php echo esc_html( $title !== '' ? $title : Neo_Pulse_Wp_Overseer::normalize_path_url( $url ) ); ?>
					<?php if ( ! empty( $event->element_text ) ) : ?>
						— <?php echo esc_html( (string) $event->element_text ); ?>
					<?php endif; ?>
					<?php if ( ! empty( $event->element_href ) ) : ?>
						→ <?php echo esc_html( (string) $event->element_href ); ?>
					<?php endif; ?>
				</div>
			<?php else : ?>
				<div>
					<a href="<?php echo esc_url( $url ); ?>" target="_blank" rel="noopener noreferrer"><?php echo esc_html( $title !== '' ? $title : $url ); ?></a>
				</div>
			<?php endif; ?>
		</li>
		<?php
	}

	/**
	 * @param object $event Event row.
	 * @return string
	 */
	private static function parse_conversion_client_meta( $event ): string {
		$raw = isset( $event->client_meta ) ? (string) $event->client_meta : '';
		if ( $raw === '' ) {
			return '';
		}
		$meta = json_decode( $raw, true );
		if ( ! is_array( $meta ) || empty( $meta['field_signals'] ) || ! is_array( $meta['field_signals'] ) ) {
			return '';
		}
		return Neo_Pulse_Wp_Overseer_Conversions::format_field_signals( $meta['field_signals'] );
	}

	private static function render_overseer_conversions_page(): void {
		$flash       = self::get_and_clear_flash();
		$edit_id     = isset( $_GET['edit'] ) ? sanitize_key( wp_unslash( (string) $_GET['edit'] ) ) : '';
		$picker_trigger = isset( $_GET['trigger_type'] ) ? sanitize_key( wp_unslash( (string) $_GET['trigger_type'] ) ) : '';
		$editing     = ( $edit_id !== '' && 'new' !== $edit_id ) ? Neo_Pulse_Wp_Overseer_Conversions::get_goal( $edit_id ) : null;
		$goals       = Neo_Pulse_Wp_Overseer_Conversions::get_goals();
		$date_to     = gmdate( 'Y-m-d' );
		$date_from   = gmdate( 'Y-m-d', strtotime( '-30 days' ) );

		$interaction_values = array(
			'page_url_contains' => '',
			'text_contains'     => '',
			'href_contains'     => '',
		);
		$editing_legacy   = $editing && ! Neo_Pulse_Wp_Overseer_Conversions::is_supported_goal( $editing );
		$selected_trigger = (string) array_key_first( Neo_Pulse_Wp_Overseer_Conversions::TRIGGER_TYPES );
		if ( $editing && ! $editing_legacy ) {
			$selected_trigger = Neo_Pulse_Wp_Overseer_Conversions::get_trigger_type( $editing );
		} elseif ( ! $editing && $picker_trigger !== '' && array_key_exists( $picker_trigger, Neo_Pulse_Wp_Overseer_Conversions::TRIGGER_TYPES ) ) {
			$selected_trigger = $picker_trigger;
		}
		if ( $editing && ! empty( $editing['rules'] ) && is_array( $editing['rules'] ) ) {
			foreach ( $editing['rules'] as $rule ) {
				if ( ! is_array( $rule ) ) {
					continue;
				}
				$rule_type = isset( $rule['type'] ) ? sanitize_key( (string) $rule['type'] ) : '';
				if ( isset( $interaction_values[ $rule_type ] ) ) {
					$interaction_values[ $rule_type ] = (string) ( $rule['value'] ?? '' );
				}
			}
		}

		$conversions_url = admin_url( 'admin.php?page=neo-pulse-wp-overseer&action=conversions' );
		self::render_overseer_page_shell_open();
		?>
			<div class="neo-pulse-wp-overseer__titlebar">
				<h1><?php esc_html_e( 'Conversions', 'neo-pulse-wp' ); ?></h1>
				<?php if ( ! $editing && $edit_id === '' ) : ?>
					<a class="page-title-action" href="<?php echo esc_url( add_query_arg( 'edit', 'new', $conversions_url ) ); ?>"><?php esc_html_e( 'Add goal', 'neo-pulse-wp' ); ?></a>
				<?php endif; ?>
			</div>

			<?php if ( $flash ) : ?>
				<div class="notice inline notice-<?php echo ! empty( $flash['success'] ) ? 'success' : 'error'; ?> is-dismissible">
					<p><?php echo esc_html( isset( $flash['message'] ) ? (string) $flash['message'] : '' ); ?></p>
				</div>
			<?php endif; ?>

			<p class="description neo-pulse-wp-overseer__note">
				<?php esc_html_e( 'Choose what counts as a conversion (form attempt, click, or outbound click), then add page URL, link URL, or element text filters. Submitted form values are never stored.', 'neo-pulse-wp' ); ?>
			</p>

			<?php if ( $edit_id !== '' ) : ?>
				<div class="neo-pulse-wp-overseer__panel neo-pulse-wp-overseer__panel--nested">
					<h2><?php echo $editing ? esc_html__( 'Edit conversion goal', 'neo-pulse-wp' ) : esc_html__( 'Add conversion goal', 'neo-pulse-wp' ); ?></h2>
					<?php if ( $editing_legacy ) : ?>
						<div class="notice notice-warning inline">
							<p><?php esc_html_e( 'This goal counted successful NEO Pulse Forms submissions. Forms has been removed, so the goal no longer records conversions. Pick a new trigger and add filters below to keep it, or delete it.', 'neo-pulse-wp' ); ?></p>
						</div>
					<?php endif; ?>
					<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>" id="neo-pulse-conversion-goal-form">
						<input type="hidden" name="action" value="<?php echo esc_attr( self::ACTION_SAVE_OVERSEER_CONVERSION ); ?>" />
						<?php wp_nonce_field( self::ACTION_SAVE_OVERSEER_CONVERSION, 'neo_pulse_wp_overseer_conversion_nonce' ); ?>
						<?php if ( $editing ) : ?>
							<input type="hidden" name="goal_id" value="<?php echo esc_attr( (string) $editing['id'] ); ?>" />
						<?php endif; ?>
						<table class="form-table" role="presentation">
							<tr>
								<th scope="row"><label for="goal_name"><?php esc_html_e( 'Goal name', 'neo-pulse-wp' ); ?></label></th>
								<td><input name="goal_name" id="goal_name" type="text" class="regular-text" required value="<?php echo esc_attr( $editing ? (string) $editing['name'] : '' ); ?>" /></td>
							</tr>
							<tr>
								<th scope="row"><label for="trigger_type"><?php esc_html_e( 'Conversion trigger', 'neo-pulse-wp' ); ?></label></th>
								<td>
									<select name="trigger_type" id="trigger_type">
										<?php foreach ( Neo_Pulse_Wp_Overseer_Conversions::TRIGGER_TYPES as $trigger_slug => $trigger_label ) : ?>
											<option value="<?php echo esc_attr( $trigger_slug ); ?>" <?php selected( $selected_trigger, $trigger_slug ); ?>>
												<?php echo esc_html( (string) $trigger_label ); ?>
											</option>
										<?php endforeach; ?>
									</select>
									<p class="description"><?php esc_html_e( 'Pick the event type first, then configure the matching rules below.', 'neo-pulse-wp' ); ?></p>
								</td>
							</tr>
						</table>

						<div class="neo-pulse-conversion-panel neo-pulse-conversion-panel--interaction" data-trigger-panel="interaction">
							<h3><?php esc_html_e( 'Interaction filters', 'neo-pulse-wp' ); ?></h3>
							<p class="description"><?php esc_html_e( 'Use page URL and/or link URL filters to narrow matches. Element text is optional.', 'neo-pulse-wp' ); ?></p>
							<table class="form-table" role="presentation">
								<tr>
									<th scope="row"><label for="rules_page_url"><?php esc_html_e( 'Page URL contains', 'neo-pulse-wp' ); ?></label></th>
									<td><input name="rules_page_url" id="rules_page_url" type="text" class="regular-text" value="<?php echo esc_attr( $interaction_values['page_url_contains'] ); ?>" placeholder="/contact" /></td>
								</tr>
								<tr>
									<th scope="row"><label for="rules_text"><?php esc_html_e( 'Element text contains', 'neo-pulse-wp' ); ?> <span class="description"><?php esc_html_e( '(optional)', 'neo-pulse-wp' ); ?></span></label></th>
									<td>
										<input name="rules_text" id="rules_text" type="text" class="regular-text" value="<?php echo esc_attr( $interaction_values['text_contains'] ); ?>" placeholder="<?php esc_attr_e( 'Get a quote', 'neo-pulse-wp' ); ?>" />
										<p class="description"><?php esc_html_e( 'Leave blank to match without checking button or link text.', 'neo-pulse-wp' ); ?></p>
									</td>
								</tr>
								<tr>
									<th scope="row"><label for="rules_href"><?php esc_html_e( 'Link URL contains', 'neo-pulse-wp' ); ?></label></th>
									<td><input name="rules_href" id="rules_href" type="text" class="regular-text" value="<?php echo esc_attr( $interaction_values['href_contains'] ); ?>" placeholder="tel:" /></td>
								</tr>
							</table>
						</div>

						<table class="form-table" role="presentation">
							<tr>
								<th scope="row"><?php esc_html_e( 'Match mode', 'neo-pulse-wp' ); ?></th>
								<td>
									<label><input type="radio" name="match_mode" value="all" <?php checked( ! $editing || 'any' !== ( $editing['match_mode'] ?? 'all' ) ); ?> /> <?php esc_html_e( 'All selected rules required', 'neo-pulse-wp' ); ?></label><br />
									<label><input type="radio" name="match_mode" value="any" <?php checked( $editing && 'any' === ( $editing['match_mode'] ?? '' ) ); ?> /> <?php esc_html_e( 'Any selected rule', 'neo-pulse-wp' ); ?></label>
								</td>
							</tr>
							<tr>
								<th scope="row"><?php esc_html_e( 'Enabled', 'neo-pulse-wp' ); ?></th>
								<td>
									<label>
										<input name="goal_enabled" type="checkbox" value="1" <?php checked( ! $editing || ! empty( $editing['enabled'] ) ); ?> />
										<?php esc_html_e( 'Track this goal', 'neo-pulse-wp' ); ?>
									</label>
								</td>
							</tr>
						</table>
						<?php submit_button( $editing ? __( 'Update goal', 'neo-pulse-wp' ) : __( 'Create goal', 'neo-pulse-wp' ) ); ?>
						<a class="button" href="<?php echo esc_url( $conversions_url ); ?>"><?php esc_html_e( 'Cancel', 'neo-pulse-wp' ); ?></a>
					</form>
				</div>
			<?php endif; ?>

			<div class="neo-pulse-wp-overseer__panel">
				<h2><?php esc_html_e( 'Conversion goals', 'neo-pulse-wp' ); ?></h2>
				<?php if ( empty( $goals ) ) : ?>
					<p><?php esc_html_e( 'No conversion goals yet.', 'neo-pulse-wp' ); ?></p>
				<?php else : ?>
					<table class="neo-pulse-wp-overseer__metrics-table">
						<thead>
							<tr>
								<th><?php esc_html_e( 'Goal', 'neo-pulse-wp' ); ?></th>
								<th><?php esc_html_e( 'Trigger', 'neo-pulse-wp' ); ?></th>
								<th><?php esc_html_e( 'Rules', 'neo-pulse-wp' ); ?></th>
								<th><?php esc_html_e( 'Conversions (30d)', 'neo-pulse-wp' ); ?></th>
								<th><?php esc_html_e( 'Status', 'neo-pulse-wp' ); ?></th>
								<th><?php esc_html_e( 'Actions', 'neo-pulse-wp' ); ?></th>
							</tr>
						</thead>
						<tbody>
							<?php foreach ( $goals as $goal ) : ?>
								<?php
								$count = Neo_Pulse_Wp_Overseer_Conversions::count_goal_conversions( (string) $goal['id'], $date_from, $date_to );
								$delete_url = wp_nonce_url(
									add_query_arg(
										array(
											'action'  => self::ACTION_DELETE_OVERSEER_CONVERSION,
											'goal_id' => (string) $goal['id'],
										),
										admin_url( 'admin-post.php' )
									),
									self::ACTION_DELETE_OVERSEER_CONVERSION . '_' . (string) $goal['id']
								);
								?>
								<tr>
									<td><?php echo esc_html( (string) $goal['name'] ); ?></td>
									<td><?php echo esc_html( Neo_Pulse_Wp_Overseer_Conversions::format_trigger_label( Neo_Pulse_Wp_Overseer_Conversions::get_trigger_type( $goal ) ) ); ?></td>
									<td><?php echo esc_html( Neo_Pulse_Wp_Overseer_Conversions::summarize_rules( $goal ) ); ?></td>
									<td><?php echo (int) $count; ?></td>
									<td><?php echo ! empty( $goal['enabled'] ) ? esc_html__( 'On', 'neo-pulse-wp' ) : esc_html__( 'Off', 'neo-pulse-wp' ); ?></td>
									<td>
										<a href="<?php echo esc_url( add_query_arg( 'edit', (string) $goal['id'], $conversions_url ) ); ?>"><?php esc_html_e( 'Edit', 'neo-pulse-wp' ); ?></a>
										|
										<a href="<?php echo esc_url( $delete_url ); ?>" onclick="return confirm('<?php echo esc_js( __( 'Delete this conversion goal?', 'neo-pulse-wp' ) ); ?>');"><?php esc_html_e( 'Delete', 'neo-pulse-wp' ); ?></a>
									</td>
								</tr>
							<?php endforeach; ?>
						</tbody>
					</table>
				<?php endif; ?>
			</div>
		<?php
		self::render_overseer_page_shell_close();
	}

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
