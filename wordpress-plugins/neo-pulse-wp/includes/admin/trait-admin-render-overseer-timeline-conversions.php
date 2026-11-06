<?php
/**
 * Overseer timeline events and conversions pages.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Render_Overseer_Timeline_Conversions {

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
}
