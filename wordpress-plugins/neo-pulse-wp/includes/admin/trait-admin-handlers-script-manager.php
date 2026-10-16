<?php
/**
 * Script Manager admin POST handlers.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Admin_Trait_Handlers_Script_Manager {

	const ACTION_SAVE_SCRIPT           = 'neo_pulse_wp_save_script';
	const ACTION_DELETE_SCRIPT         = 'neo_pulse_wp_delete_script';
	const ACTION_BULK_SCRIPTS          = 'neo_pulse_wp_bulk_scripts';
	const ACTION_IMPORT_SCRIPTS        = 'neo_pulse_wp_import_scripts';
	const ACTION_IMPORT_SCRIPTS_HFCM   = 'neo_pulse_wp_import_scripts_hfcm';
	const ACTION_IMPORT_SCRIPTS_HFCM_DB = 'neo_pulse_wp_import_scripts_hfcm_db';
	const ACTION_EXPORT_SCRIPTS        = 'neo_pulse_wp_export_scripts';
	const ACTION_EXPORT_SCRIPTS_JSON   = 'neo_pulse_wp_export_scripts_json';
	const ACTION_SAVE_SCRIPT_SETTINGS  = 'neo_pulse_wp_save_script_settings';
	const ACTION_SCRIPT_ROW            = 'neo_pulse_wp_script_row';

	public static function script_admin_post_url( string $action, array $query = array() ): string {
		$query = array_merge(
			array( 'action' => $action ),
			$query
		);

		return admin_url( add_query_arg( $query, 'admin-post.php' ) );
	}

	/**
	 * @param string               $action    admin_post action.
	 * @param string               $nonce_key Referer query arg.
	 * @param array<string, mixed> $query     Extra query args.
	 */
	public static function script_admin_post_nonce_url( string $action, string $nonce_key, array $query = array() ): string {
		return wp_nonce_url(
			self::script_admin_post_url( $action, $query ),
			$action,
			$nonce_key
		);
	}

	/**
	 * Saving raw script code needs unfiltered_html (off for non-super-admins on multisite and
	 * when DISALLOW_UNFILTERED_HTML is set).
	 */
	private static function require_unfiltered_html_for_scripts(): void {
		if ( ! current_user_can( 'unfiltered_html' ) ) {
			wp_die( esc_html__( 'Saving script code needs the "unfiltered_html" capability, which your account does not have on this site.', 'neo-pulse-wp' ) );
		}
	}

	public static function handle_script_row_action(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage scripts.', 'neo-pulse-wp' ) );
		}

		$id = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0;
		$op = isset( $_GET['script_op'] ) ? sanitize_key( wp_unslash( (string) $_GET['script_op'] ) ) : '';
		if ( $id < 1 || ! in_array( $op, array( 'trash', 'restore', 'activate', 'deactivate', 'delete' ), true ) ) {
			wp_die( esc_html__( 'Invalid script action.', 'neo-pulse-wp' ) );
		}

		check_admin_referer( 'neo_pulse_wp_script_row_' . $op . '_' . $id );

		$block = self::overseer_builtin_block_message( $id, $op );
		if ( $block !== null ) {
			self::set_flash(
				array(
					'kind'    => 'scripts',
					'success' => false,
					'message' => $block,
				)
			);
			self::redirect_to_script_manager( 'list' );
			return;
		}

		$changed  = Neo_Pulse_Wp_Script_Manager::bulk_action( array( $id ), $op );
		$messages = array(
			'trash'      => __( 'Script moved to trash.', 'neo-pulse-wp' ),
			'restore'    => __( 'Script restored.', 'neo-pulse-wp' ),
			'activate'   => __( 'Script activated.', 'neo-pulse-wp' ),
			'deactivate' => __( 'Script deactivated.', 'neo-pulse-wp' ),
			'delete'     => __( 'Script deleted permanently.', 'neo-pulse-wp' ),
		);

		self::set_flash(
			array(
				'kind'    => 'scripts',
				'success' => $changed > 0,
				'message' => $changed > 0
					? ( isset( $messages[ $op ] ) ? $messages[ $op ] : __( 'Script updated.', 'neo-pulse-wp' ) )
					: __( 'Script could not be updated.', 'neo-pulse-wp' ),
			)
		);

		$status = 'trash';
		if ( in_array( $op, array( 'restore', 'activate', 'deactivate' ), true ) ) {
			$status = 'activate' === $op ? 'active' : ( 'deactivate' === $op ? 'inactive' : 'active' );
		} elseif ( 'trash' === $op ) {
			$status = 'trash';
		} elseif ( 'delete' === $op ) {
			$status = 'all';
		}

		self::redirect_to_script_manager( 'list', 0, array( 'script_status' => $status ) );
	}

	public static function handle_save_script(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage scripts.', 'neo-pulse-wp' ) );
		}
		self::require_unfiltered_html_for_scripts();
		check_admin_referer( self::ACTION_SAVE_SCRIPT, 'neo_pulse_wp_script_nonce' );

		$id = isset( $_POST['script_id'] ) ? (int) $_POST['script_id'] : 0;

		$rules_json = isset( $_POST['script_display_rules'] ) ? (string) wp_unslash( $_POST['script_display_rules'] ) : '';
		$rules      = $rules_json !== '' ? json_decode( $rules_json, true ) : Neo_Pulse_Wp_Script_Manager_Rules::defaults();

		$data = array(
			'id'            => $id,
			'name'          => isset( $_POST['script_name'] ) ? (string) wp_unslash( $_POST['script_name'] ) : '',
			'placement'     => isset( $_POST['script_placement'] ) ? (string) wp_unslash( $_POST['script_placement'] ) : 'header',
			'code'          => isset( $_POST['script_code'] ) ? (string) wp_unslash( $_POST['script_code'] ) : '',
			'priority'      => isset( $_POST['script_priority'] ) ? (int) $_POST['script_priority'] : 10,
			'category'      => isset( $_POST['script_category'] ) ? (string) wp_unslash( $_POST['script_category'] ) : '',
			'status'        => isset( $_POST['script_status_field'] ) ? (string) wp_unslash( $_POST['script_status_field'] ) : 'active',
			'display_rules' => is_array( $rules ) ? $rules : Neo_Pulse_Wp_Script_Manager_Rules::defaults(),
		);

		$result = Neo_Pulse_Wp_Script_Manager::save( $data );
		if ( empty( $result['ok'] ) ) {
			self::set_flash(
				array(
					'kind'    => 'scripts',
					'success' => false,
					'message' => isset( $result['error'] ) ? (string) $result['error'] : __( 'Could not save script.', 'neo-pulse-wp' ),
				)
			);
			self::redirect_to_script_manager( $id > 0 ? 'edit' : 'new', $id > 0 ? $id : 0 );
		}

		self::set_flash(
			array(
				'kind'    => 'scripts',
				'success' => true,
				'message' => $id > 0 ? __( 'Script updated.', 'neo-pulse-wp' ) : __( 'Script created.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_script_manager( 'list' );
	}

	public static function handle_delete_script(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage scripts.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_DELETE_SCRIPT, 'neo_pulse_wp_delete_script_nonce' );

		$id = isset( $_GET['id'] ) ? (int) $_GET['id'] : 0;
		$block = $id > 0 ? self::overseer_builtin_block_message( $id, 'delete' ) : null;
		if ( $block !== null ) {
			self::set_flash(
				array(
					'kind'    => 'scripts',
					'success' => false,
					'message' => $block,
				)
			);
			self::redirect_to_script_manager( 'list' );
			return;
		}

		$deleted = false;
		if ( $id > 0 ) {
			$deleted = Neo_Pulse_Wp_Script_Manager::delete( $id );
		}

		self::set_flash(
			array(
				'kind'    => 'scripts',
				'success' => $deleted,
				'message' => $deleted
					? __( 'Script deleted permanently.', 'neo-pulse-wp' )
					: __( 'Script could not be deleted.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_script_manager( 'list' );
		return;
	}

	public static function handle_bulk_scripts(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage scripts.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( 'bulk-scripts' );

		$action = '';
		if ( isset( $_REQUEST['script_bulk_action'] ) && '-1' !== $_REQUEST['script_bulk_action'] ) {
			$action = sanitize_key( wp_unslash( (string) $_REQUEST['script_bulk_action'] ) );
		} elseif ( isset( $_REQUEST['script_bulk_action2'] ) && '-1' !== $_REQUEST['script_bulk_action2'] ) {
			$action = sanitize_key( wp_unslash( (string) $_REQUEST['script_bulk_action2'] ) );
		}

		$ids     = isset( $_REQUEST['script_ids'] ) ? array_map( 'intval', (array) wp_unslash( $_REQUEST['script_ids'] ) ) : array();
		$blocked = 0;
		if ( in_array( $action, array( 'trash', 'delete' ), true ) ) {
			$allowed = array();
			foreach ( $ids as $script_id ) {
				if ( self::overseer_builtin_block_message( $script_id, $action ) !== null ) {
					++$blocked;
					continue;
				}
				$allowed[] = $script_id;
			}
			$ids = $allowed;
		}
		$changed = 0;
		if ( in_array( $action, array( 'trash', 'restore', 'activate', 'deactivate', 'delete' ), true ) ) {
			$changed = Neo_Pulse_Wp_Script_Manager::bulk_action( $ids, $action );
		}

		$message = $changed > 0
			? sprintf(
				/* translators: %d: number of scripts updated */
				_n( '%d script updated.', '%d scripts updated.', $changed, 'neo-pulse-wp' ),
				$changed
			)
			: __( 'No scripts were updated.', 'neo-pulse-wp' );
		if ( $blocked > 0 ) {
			$message .= ' ' . __( 'The built-in NEO Pulse Page View tag was not removed. Disable tracking in Overseer settings first.', 'neo-pulse-wp' );
		}

		self::set_flash(
			array(
				'kind'    => 'scripts',
				'success' => $changed > 0,
				'message' => $message,
			)
		);

		$status = isset( $_REQUEST['script_status'] ) ? sanitize_key( wp_unslash( (string) $_REQUEST['script_status'] ) ) : 'all';
		self::redirect_to_script_manager( 'list', 0, array( 'script_status' => $status ) );
	}

	/**
	 * @param int    $id  Script ID.
	 * @param string $op  trash|delete|restore|activate|deactivate.
	 * @return string|null Error message when blocked.
	 */
	private static function overseer_builtin_block_message( int $id, string $op ): ?string {
		if ( ! class_exists( 'Neo_Pulse_Wp_Overseer', false ) ) {
			return null;
		}
		if ( ! Neo_Pulse_Wp_Overseer::is_builtin_script_id( $id ) ) {
			return null;
		}
		if ( ! Neo_Pulse_Wp_Overseer::is_builtin_protected() ) {
			return null;
		}
		if ( ! in_array( $op, array( 'trash', 'delete' ), true ) ) {
			return null;
		}
		return __( 'The built-in NEO Pulse Page View tag cannot be removed while Overseer tracking is enabled. Disable tracking in Overseer settings first.', 'neo-pulse-wp' );
	}

	public static function handle_import_scripts(): void {
		self::handle_script_import_upload(
			self::ACTION_IMPORT_SCRIPTS,
			'neo_pulse_wp_import_scripts_nonce',
			'script_import_file',
			__( 'Choose a NEO Pulse JSON or CSV file to import.', 'neo-pulse-wp' ),
			static function ( string $file_text, string $filename ): array {
				return Neo_Pulse_Wp_Script_Manager_Import::parse_file( $file_text, $filename );
			}
		);
	}

	public static function handle_import_scripts_hfcm(): void {
		self::handle_script_import_upload(
			self::ACTION_IMPORT_SCRIPTS_HFCM,
			'neo_pulse_wp_import_scripts_hfcm_nonce',
			'script_hfcm_import_file',
			__( 'Choose an HFCM export JSON file.', 'neo-pulse-wp' ),
			static function ( string $file_text, string $filename ): array {
				unset( $filename );
				return Neo_Pulse_Wp_Script_Manager_Import::parse_hfcm_export( $file_text );
			}
		);
	}

	public static function handle_import_scripts_hfcm_db(): void {
		if ( ! current_user_can( 'manage_options' ) || ! current_user_can( 'activate_plugins' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage scripts and plugins.', 'neo-pulse-wp' ) );
		}
		self::require_unfiltered_html_for_scripts();
		check_admin_referer( self::ACTION_IMPORT_SCRIPTS_HFCM_DB, 'neo_pulse_wp_import_scripts_hfcm_db_nonce' );

		$result = Neo_Pulse_Wp_Script_Manager_Hfcm::run();

		$parts = array();
		$parts[] = sprintf(
			/* translators: %d: number of scripts imported */
			_n( 'Imported %d script from HFCM.', 'Imported %d scripts from HFCM.', (int) $result['imported'], 'neo-pulse-wp' ),
			(int) $result['imported']
		);
		if ( $result['comments'] ) {
			$parts[] = __( 'Turned on Neo Tools "Disable comments" to replace the HFCM PHP snippet.', 'neo-pulse-wp' );
		}
		if ( $result['deactivated'] ) {
			$parts[] = __( 'Header Footer Code Manager has been deactivated, so nothing runs twice. You can delete it from Plugins once you have checked the site.', 'neo-pulse-wp' );
		} elseif ( ! empty( $result['blockers'] ) ) {
			$parts[] = sprintf(
				/* translators: %s: snippet names */
				__( 'HFCM was left on because these switched-on snippets can\'t move to Script Manager: %s. Deal with them, then run the import again to finish.', 'neo-pulse-wp' ),
				implode( ', ', $result['blockers'] )
			);
		}
		if ( ! empty( $result['errors'] ) ) {
			$parts[] = __( 'HFCM was left on because some scripts could not be saved:', 'neo-pulse-wp' ) . ' ' . implode( '; ', array_slice( $result['errors'], 0, 3 ) );
		}
		if ( ! empty( $result['held_inactive'] ) ) {
			$held    = (int) $result['held_inactive'];
			$parts[] = sprintf(
				/* translators: %d: number of imported scripts saved switched off */
				_n(
					'%d imported script was saved switched off because HFCM is still active; switch it on in Script Manager after deactivating HFCM.',
					'%d imported scripts were saved switched off because HFCM is still active; switch them on in Script Manager after deactivating HFCM.',
					$held,
					'neo-pulse-wp'
				),
				$held
			);
		}

		self::set_flash(
			array(
				'kind'    => 'scripts',
				'success' => ! empty( $result['ok'] ) && empty( $result['blockers'] ),
				'message' => implode( ' ', $parts ),
			)
		);
		self::redirect_to_script_manager( 'list' );
	}

	/**
	 * Whether to offer the HFCM move, and what it would do.
	 *
	 * @return array<string, mixed>
	 */
	public static function hfcm_database_import_status(): array {
		$plan = Neo_Pulse_Wp_Script_Manager_Hfcm::plan();
		$plan['available'] = $plan['pending'] > 0 || $plan['plugin_active'];
		return $plan;
	}

	/**
	 * @param string                                                                 $action Action name.
	 * @param string                                                                 $nonce_key Nonce field name.
	 * @param string                                                                 $file_field $_FILES key.
	 * @param string                                                                 $missing_file_message Flash when no file.
	 * @param callable(string,string):array{rows:array,error?:string,warnings?:array} $parser Parser callback.
	 */
	private static function handle_script_import_upload(
		string $action,
		string $nonce_key,
		string $file_field,
		string $missing_file_message,
		callable $parser
	): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage scripts.', 'neo-pulse-wp' ) );
		}
		self::require_unfiltered_html_for_scripts();
		check_admin_referer( $action, $nonce_key );

		if ( empty( $_FILES[ $file_field ]['tmp_name'] ) || ! is_uploaded_file( $_FILES[ $file_field ]['tmp_name'] ) ) {
			self::set_flash(
				array(
					'kind'    => 'scripts',
					'success' => false,
					'message' => $missing_file_message,
				)
			);
			self::redirect_to_script_manager( 'import-export' );
		}

		$filename  = isset( $_FILES[ $file_field ]['name'] ) ? (string) $_FILES[ $file_field ]['name'] : '';
		$file_text = file_get_contents( $_FILES[ $file_field ]['tmp_name'] );
		if ( ! is_string( $file_text ) || $file_text === '' ) {
			self::set_flash(
				array(
					'kind'    => 'scripts',
					'success' => false,
					'message' => __( 'Could not read the uploaded file.', 'neo-pulse-wp' ),
				)
			);
			self::redirect_to_script_manager( 'import-export' );
		}

		$parsed = $parser( $file_text, $filename );
		if ( ! empty( $parsed['error'] ) ) {
			self::set_flash(
				array(
					'kind'    => 'scripts',
					'success' => false,
					'message' => (string) $parsed['error'],
				)
			);
			self::redirect_to_script_manager( 'import-export' );
		}

		$stats   = Neo_Pulse_Wp_Script_Manager::merge_import( $parsed['rows'] );
		$message = self::format_script_import_message(
			$stats,
			array(
				'warnings' => isset( $parsed['warnings'] ) ? $parsed['warnings'] : array(),
				'errors'   => isset( $stats['errors'] ) ? $stats['errors'] : array(),
			)
		);

		self::set_flash(
			array(
				'kind'    => 'scripts',
				'success' => ( (int) ( $stats['added'] ?? 0 ) + (int) ( $stats['updated'] ?? 0 ) ) > 0,
				'message' => $message,
			)
		);
		self::redirect_to_script_manager( 'import-export' );
	}

	/**
	 * @param array{added: int, updated: int, skipped: int, errors?: array<int, string>} $stats Import stats.
	 * @param array{warnings?: array<int, string>, errors?: array<int, string>}           $parsed Parse result.
	 */
	private static function format_script_import_message( array $stats, array $parsed ): string {
		$message = sprintf(
			/* translators: 1: added count, 2: updated count, 3: skipped count */
			__( 'Import complete: %1$d added, %2$d updated, %3$d skipped.', 'neo-pulse-wp' ),
			(int) $stats['added'],
			(int) $stats['updated'],
			(int) $stats['skipped']
		);

		$errors = array();
		if ( ! empty( $parsed['errors'] ) && is_array( $parsed['errors'] ) ) {
			$errors = array_merge( $errors, $parsed['errors'] );
		}
		if ( ! empty( $stats['errors'] ) && is_array( $stats['errors'] ) ) {
			$errors = array_merge( $errors, $stats['errors'] );
		}
		$errors = array_values( array_unique( array_map( 'strval', $errors ) ) );
		if ( ! empty( $errors ) ) {
			$message .= ' ' . implode( ' ', array_slice( $errors, 0, 3 ) );
			if ( count( $errors ) > 3 ) {
				$message .= ' ' . sprintf(
					/* translators: %d: extra error count */
					__( '(%d more errors.)', 'neo-pulse-wp' ),
					count( $errors ) - 3
				);
			}
		}

		if ( ! empty( $parsed['warnings'] ) && is_array( $parsed['warnings'] ) ) {
			$message .= ' ' . implode( ' ', array_map( 'strval', array_slice( $parsed['warnings'], 0, 3 ) ) );
			if ( count( $parsed['warnings'] ) > 3 ) {
				$message .= ' ' . sprintf(
					/* translators: %d: extra warning count */
					__( '(%d more notices.)', 'neo-pulse-wp' ),
					count( $parsed['warnings'] ) - 3
				);
			}
		}

		return $message;
	}

	public static function handle_export_scripts(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage scripts.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_EXPORT_SCRIPTS, 'neo_pulse_wp_export_scripts_nonce' );

		$rows = Neo_Pulse_Wp_Script_Manager::export_rows();
		$csv  = Neo_Pulse_Wp_Script_Manager_Csv::build( $rows );
		$filename = 'neo-pulse-scripts-' . gmdate( 'Y-m-d' ) . '.csv';

		nocache_headers();
		header( 'Content-Type: text/csv; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename=' . $filename );
		echo $csv;
		exit;
	}

	public static function handle_export_scripts_json(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage scripts.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_EXPORT_SCRIPTS_JSON, 'neo_pulse_wp_export_scripts_json_nonce' );

		$rows = Neo_Pulse_Wp_Script_Manager::export_rows();
		$json = Neo_Pulse_Wp_Script_Manager_Import::build_json_export( $rows );
		$filename = 'neo-pulse-scripts-' . gmdate( 'Y-m-d' ) . '.json';

		nocache_headers();
		header( 'Content-Type: application/json; charset=utf-8' );
		header( 'Content-Disposition: attachment; filename=' . $filename );
		echo $json;
		exit;
	}

	public static function handle_save_script_settings(): void {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You do not have permission to manage scripts.', 'neo-pulse-wp' ) );
		}
		check_admin_referer( self::ACTION_SAVE_SCRIPT_SETTINGS, 'neo_pulse_wp_script_settings_nonce' );

		Neo_Pulse_Wp_Script_Manager::save_settings(
			array(
				'default_category'     => isset( $_POST['default_script_category'] ) ? (string) wp_unslash( $_POST['default_script_category'] ) : '',
				'customizer_preview'   => ! empty( $_POST['customizer_preview'] ),
			)
		);

		self::set_flash(
			array(
				'kind'    => 'scripts',
				'success' => true,
				'message' => __( 'Script Manager settings saved.', 'neo-pulse-wp' ),
			)
		);
		self::redirect_to_script_manager( 'settings' );
	}
}
