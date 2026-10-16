<?php
/**
 * Overseer admin POST handlers.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Handlers_Overseer {

	const ACTION_EXPORT_OVERSEER       = 'neo_pulse_wp_export_overseer';
	const ACTION_SAVE_OVERSEER_SETTINGS = 'neo_pulse_wp_save_overseer_settings';
	const ACTION_SAVE_OVERSEER_CONVERSION = 'neo_pulse_wp_save_overseer_conversion';
	const ACTION_DELETE_OVERSEER_CONVERSION = 'neo_pulse_wp_delete_overseer_conversion';
	const ACTION_DELETE_OVERSEER_VISIT = 'neo_pulse_wp_delete_overseer_visit';
	const ACTION_BULK_OVERSEER_VISITS  = 'neo_pulse_wp_bulk_overseer_visits';
	const ACTION_CLEAR_OVERSEER_VISITS = 'neo_pulse_wp_clear_overseer_visits';
	const ACTION_RUN_OVERSEER_ANALYSIS = 'neo_pulse_wp_run_overseer_analysis';
	const ACTION_DELETE_OVERSEER_REPORT = 'neo_pulse_wp_delete_overseer_report';
	const ACTION_APPROVE_OVERSEER_TASK  = 'neo_pulse_wp_approve_overseer_task';
	const ACTION_DISMISS_OVERSEER_TASK  = 'neo_pulse_wp_dismiss_overseer_task';
	const ACTION_DONE_OVERSEER_TASK     = 'neo_pulse_wp_done_overseer_task';

	public static function handle_delete_overseer_visit(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Overseer.', 'neo-pulse-wp' ) );
		}
		$id = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0;
		check_admin_referer( self::ACTION_DELETE_OVERSEER_VISIT . '_' . $id );

		if ( $id > 0 ) {
			Neo_Pulse_Wp_Overseer::delete_visit( $id );
		}

		self::set_flash(
			array(
				'kind'    => 'overseer',
				'success' => true,
				'message' => __( 'Visit deleted.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_overseer( 'list', 0, self::overseer_list_redirect_query() );
	}

	public static function handle_bulk_overseer_visits(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Overseer.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( 'bulk-overseer-visits' );

		$action = isset( $_REQUEST['action'] ) && '-1' !== $_REQUEST['action']
			? sanitize_key( wp_unslash( (string) $_REQUEST['action'] ) )
			: '';
		if ( $action === '' && isset( $_REQUEST['action2'] ) && '-1' !== $_REQUEST['action2'] ) {
			$action = sanitize_key( wp_unslash( (string) $_REQUEST['action2'] ) );
		}

		$ids     = isset( $_REQUEST['overseer_visit_ids'] ) ? array_map( 'intval', (array) wp_unslash( $_REQUEST['overseer_visit_ids'] ) ) : array();
		$deleted = 0;
		if ( $action === 'delete' ) {
			foreach ( $ids as $visit_id ) {
				if ( $visit_id > 0 && Neo_Pulse_Wp_Overseer::delete_visit( $visit_id ) ) {
					++$deleted;
				}
			}
		}

		self::set_flash(
			array(
				'kind'    => 'overseer',
				'success' => $deleted > 0,
				'message' => $deleted > 0
					? sprintf(
						/* translators: %d: number of visits deleted */
						_n( '%d visit deleted.', '%d visits deleted.', $deleted, 'neo-pulse-wp' ),
						$deleted
					)
					: __( 'No visits were deleted.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_overseer( 'list', 0, self::overseer_list_redirect_query() );
	}

	public static function handle_clear_overseer_visits(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Overseer.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_CLEAR_OVERSEER_VISITS, 'neo_pulse_wp_clear_overseer_nonce' );

		$deleted = Neo_Pulse_Wp_Overseer::delete_all_visits();

		self::set_flash(
			array(
				'kind'    => 'overseer',
				'success' => true,
				'message' => $deleted > 0
					? sprintf(
						/* translators: %d: number of visits deleted */
						_n( 'All visits cleared (%d visit deleted).', 'All visits cleared (%d visits deleted).', $deleted, 'neo-pulse-wp' ),
						$deleted
					)
					: __( 'No visits were deleted.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_overseer( 'import-export' );
	}

	public static function handle_export_overseer(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Overseer.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_EXPORT_OVERSEER, 'neo_pulse_wp_export_overseer_nonce' );

		$date_from = isset( $_POST['export_date_from'] ) ? sanitize_text_field( wp_unslash( (string) $_POST['export_date_from'] ) ) : '';
		$date_to   = isset( $_POST['export_date_to'] ) ? sanitize_text_field( wp_unslash( (string) $_POST['export_date_to'] ) ) : '';

		$args = array();
		if ( $date_from !== '' && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_from ) ) {
			$args['date_from'] = $date_from;
		}
		if ( $date_to !== '' && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_to ) ) {
			$args['date_to'] = $date_to;
		}

		$rows     = Neo_Pulse_Wp_Overseer::query_for_export( $args );
		$csv      = Neo_Pulse_Wp_Overseer_Csv::build( $rows );
		$filename = 'neo-pulse-overseer-visits-' . gmdate( 'Y-m-d' ) . '.csv';

		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename=' . $filename );
		echo $csv; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped
		exit;
	}

	public static function handle_save_overseer_settings(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Overseer.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_SAVE_OVERSEER_SETTINGS, 'neo_pulse_wp_overseer_settings_nonce' );

		Neo_Pulse_Wp_Overseer::save_settings(
			array(
				'tracking_enabled'    => ! empty( $_POST['tracking_enabled'] ),
				'retention_days'      => isset( $_POST['retention_days'] ) ? (int) $_POST['retention_days'] : 90,
				'anonymize_ip'        => ! empty( $_POST['anonymize_ip'] ),
				'exclude_admins'      => ! empty( $_POST['exclude_admins'] ),
				'track_interactions'  => ! empty( $_POST['track_interactions'] ),
				'track_outbound_only' => ! empty( $_POST['track_outbound_only'] ),
				'include_gsc'         => ! empty( $_POST['include_gsc'] ),
			)
		);

		Neo_Pulse_Wp_Overseer::sync_builtin_script();

		self::set_flash(
			array(
				'kind'    => 'overseer',
				'success' => true,
				'message' => __( 'Overseer settings saved.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_overseer( 'settings' );
	}

	public static function handle_save_overseer_conversion(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Overseer.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_SAVE_OVERSEER_CONVERSION, 'neo_pulse_wp_overseer_conversion_nonce' );

		$trigger_type = isset( $_POST['trigger_type'] ) ? sanitize_key( wp_unslash( (string) $_POST['trigger_type'] ) ) : '';
		if ( ! array_key_exists( $trigger_type, Neo_Pulse_Wp_Overseer_Conversions::TRIGGER_TYPES ) ) {
			$trigger_type = (string) array_key_first( Neo_Pulse_Wp_Overseer_Conversions::TRIGGER_TYPES );
		}

		$rules           = array();
		$interaction_map = array(
			'rules_page_url' => 'page_url_contains',
			'rules_text'     => 'text_contains',
			'rules_href'     => 'href_contains',
		);
		foreach ( $interaction_map as $post_key => $rule_type ) {
			if ( ! isset( $_POST[ $post_key ] ) ) {
				continue;
			}
			$value = trim( sanitize_text_field( wp_unslash( (string) $_POST[ $post_key ] ) ) );
			if ( $value !== '' ) {
				$rules[] = array(
					'type'  => $rule_type,
					'value' => $value,
				);
			}
		}

		$goal_id = isset( $_POST['goal_id'] ) ? sanitize_key( wp_unslash( (string) $_POST['goal_id'] ) ) : '';
		$payload = array(
			'id'           => $goal_id,
			'name'         => isset( $_POST['goal_name'] ) ? wp_unslash( (string) $_POST['goal_name'] ) : '',
			'enabled'      => ! empty( $_POST['goal_enabled'] ),
			'trigger_type' => $trigger_type,
			'form_id'      => 0,
			'match_mode'   => isset( $_POST['match_mode'] ) ? sanitize_key( wp_unslash( (string) $_POST['match_mode'] ) ) : 'all',
			'rules'        => $rules,
		);

		$saved = Neo_Pulse_Wp_Overseer_Conversions::save_goal( $payload );
		self::set_flash(
			array(
				'kind'    => 'overseer',
				'success' => (bool) $saved,
				'message' => $saved
					? __( 'Conversion goal saved.', 'neo-pulse-wp' )
					: __( 'Could not save conversion goal. Check the trigger and add at least one rule.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_overseer( 'conversions' );
	}

	public static function handle_delete_overseer_conversion(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Overseer.', 'neo-pulse-wp' ) );
		}
		$goal_id = isset( $_GET['goal_id'] ) ? sanitize_key( wp_unslash( (string) $_GET['goal_id'] ) ) : '';
		check_admin_referer( self::ACTION_DELETE_OVERSEER_CONVERSION . '_' . $goal_id );

		$deleted = $goal_id !== '' && Neo_Pulse_Wp_Overseer_Conversions::delete_goal( $goal_id );
		self::set_flash(
			array(
				'kind'    => 'overseer',
				'success' => $deleted,
				'message' => $deleted
					? __( 'Conversion goal deleted.', 'neo-pulse-wp' )
					: __( 'Conversion goal not found.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_overseer( 'conversions' );
	}

	/**
	 * @return array<string, string>
	 */
	private static function overseer_list_redirect_query(): array {
		$query = array();
		if ( isset( $_REQUEST['session_id'] ) && (string) $_REQUEST['session_id'] !== '' ) {
			$query['session_id'] = sanitize_text_field( wp_unslash( (string) $_REQUEST['session_id'] ) );
		}
		if ( isset( $_REQUEST['date_from'] ) && (string) $_REQUEST['date_from'] !== '' ) {
			$query['date_from'] = sanitize_text_field( wp_unslash( (string) $_REQUEST['date_from'] ) );
		}
		if ( isset( $_REQUEST['date_to'] ) && (string) $_REQUEST['date_to'] !== '' ) {
			$query['date_to'] = sanitize_text_field( wp_unslash( (string) $_REQUEST['date_to'] ) );
		}
		if ( isset( $_REQUEST['s'] ) && (string) $_REQUEST['s'] !== '' ) {
			$query['s'] = sanitize_text_field( wp_unslash( (string) $_REQUEST['s'] ) );
		}
		if ( isset( $_REQUEST['orderby'] ) && (string) $_REQUEST['orderby'] !== '' ) {
			$query['orderby'] = sanitize_key( wp_unslash( (string) $_REQUEST['orderby'] ) );
		}
		if ( isset( $_REQUEST['order'] ) && (string) $_REQUEST['order'] !== '' ) {
			$query['order'] = sanitize_key( wp_unslash( (string) $_REQUEST['order'] ) );
		}
		return $query;
	}

	public static function handle_run_overseer_analysis(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Overseer.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_RUN_OVERSEER_ANALYSIS, 'neo_pulse_wp_overseer_analysis_nonce' );

		$date_from = isset( $_POST['analysis_date_from'] ) ? sanitize_text_field( wp_unslash( (string) $_POST['analysis_date_from'] ) ) : '';
		$date_to   = isset( $_POST['analysis_date_to'] ) ? sanitize_text_field( wp_unslash( (string) $_POST['analysis_date_to'] ) ) : '';

		$result = Neo_Pulse_Wp_Overseer_Analysis::run(
			array(
				'date_from'   => $date_from,
				'date_to'     => $date_to,
				'include_gsc' => ! empty( $_POST['analysis_include_gsc'] ),
			)
		);

		if ( empty( $result['ok'] ) ) {
			self::set_flash(
				array(
					'kind'    => 'overseer',
					'success' => false,
					'message' => isset( $result['error'] ) ? (string) $result['error'] : __( 'Analysis failed.', 'neo-pulse-wp' ),
				)
			);
			self::redirect_to_overseer( 'analysis' );
		}

		self::redirect_to_overseer( 'view-report', (int) $result['report_id'] );
	}

	public static function handle_delete_overseer_report(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Overseer.', 'neo-pulse-wp' ) );
		}
		$id = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0;
		check_admin_referer( self::ACTION_DELETE_OVERSEER_REPORT . '_' . $id );

		if ( $id > 0 ) {
			Neo_Pulse_Wp_Overseer_Reports::delete( $id );
		}

		self::set_flash(
			array(
				'kind'    => 'overseer',
				'success' => true,
				'message' => __( 'Report deleted.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_overseer( 'reports' );
	}

	public static function handle_approve_overseer_task(): void {
		self::handle_overseer_task_status( self::ACTION_APPROVE_OVERSEER_TASK, 'approved', __( 'Task approved.', 'neo-pulse-wp' ) );
	}

	public static function handle_dismiss_overseer_task(): void {
		self::handle_overseer_task_status( self::ACTION_DISMISS_OVERSEER_TASK, 'dismissed', __( 'Task dismissed.', 'neo-pulse-wp' ) );
	}

	public static function handle_done_overseer_task(): void {
		self::handle_overseer_task_status( self::ACTION_DONE_OVERSEER_TASK, 'done', __( 'Task marked done.', 'neo-pulse-wp' ) );
	}

	/**
	 * @param string $action Action name.
	 * @param string $status New status.
	 * @param string $message Flash message.
	 */
	private static function handle_overseer_task_status( string $action, string $status, string $message ): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage Overseer.', 'neo-pulse-wp' ) );
		}
		$id = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0;
		check_admin_referer( $action . '_' . $id );

		if ( $id > 0 ) {
			Neo_Pulse_Wp_Overseer_Tasks::update_status( $id, $status );
		}

		$task = Neo_Pulse_Wp_Overseer_Tasks::get( $id );
		$query = array();
		if ( $task && ! empty( $task->report_id ) ) {
			$query['report_id'] = (int) $task->report_id;
		}

		self::set_flash(
			array(
				'kind'    => 'overseer',
				'success' => true,
				'message' => $message,
			)
		);
		self::redirect_to_overseer( 'tasks', 0, $query );
	}
}
