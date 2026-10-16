<?php
/**
 * Backup & Migrate admin REST (spec 8.20): the list, the schedule (9.6) and
 * deletes. The chunked jobs keep their emcp_tools_migrate_* ajax transport.
 * Cookie-only through the base controller.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Backup & Migrate REST controller.
 */
final class EMCP_Tools_Admin_REST_Backup extends EMCP_Tools_Admin_REST_Controller {

	/**
	 * Register the routes (literal routes first).
	 */
	public function register_routes(): void {
		$this->route( 'backup/schedule', array( 'methods' => 'POST', 'callback' => array( $this, 'schedule' ) ) );
		$this->route( 'backup/retention', array( 'methods' => 'POST', 'callback' => array( $this, 'retention' ) ) );
		$this->route( 'backup/storage/check', array( 'methods' => 'POST', 'callback' => array( $this, 'storage_check' ) ) );
		$this->route( 'backup', array( 'methods' => 'GET', 'callback' => array( $this, 'get' ) ) );
		$this->route( 'backup/(?P<id>[A-Za-z0-9_]+)', array( 'methods' => 'DELETE', 'callback' => array( $this, 'delete' ) ) );
	}

	/**
	 * Register the Backup & Migrate screen (Pro bundle).
	 */
	public static function register_screen(): void {
		EMCP_Tools_Admin_Screens::register(
			'migrate',
			array(
				'script' => 'screen-migrate',
				'root'   => 'pro',
				'tabs'   => array( 'migrate' ),
				'boot'   => static function (): array {
					$view = EMCP_Tools_Admin_Screens::current_view();
					return ( new EMCP_Tools_Admin_Backup_Data() )->payload() + array(
						'view' => in_array( $view, array( 'backup', 'restore', 'migrate', 'sync', 'history' ), true ) ? $view : 'backup',
					);
				},
			)
		);
	}

	/**
	 * Why the module cannot answer, or null.
	 *
	 * @return WP_Error|null
	 */
	private static function ready(): ?WP_Error {
		if ( ! function_exists( 'emcp_tools_fs' ) || ! emcp_tools_fs()->can_use_premium_code() ) {
			return new WP_Error( 'emcp_pro_required', __( 'Backup & Migrate needs Neo EMCP.', 'emcp-tools' ), array( 'status' => 403 ) );
		}
		if ( ! class_exists( 'EMCP_Tools_Migrate_Module' ) || ! EMCP_Tools_Migrate_Module::is_enabled() || ! class_exists( 'EMCP_Tools_Scheduled_Backup' ) ) {
			return new WP_Error( 'module_off', __( 'The Backup & Migrate module is switched off.', 'emcp-tools' ), array( 'status' => 404 ) );
		}
		return null;
	}

	/**
	 * GET admin/backup.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function get( $request ) {
		$e = self::ready();
		return $e ? $e : new WP_REST_Response( ( new EMCP_Tools_Admin_Backup_Data() )->payload() );
	}

	/**
	 * POST admin/backup/schedule.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function schedule( $request ) {
		$e = self::ready();
		if ( $e ) {
			return $e;
		}
		$raw = array();
		foreach ( array( 'enabled', 'frequency', 'time', 'type', 'keep' ) as $k ) {
			$v = $request->get_param( $k );
			if ( null !== $v ) {
				$raw[ $k ] = is_scalar( $v ) ? $v : '';
			}
		}
		$saved = EMCP_Tools_Scheduled_Backup::save( $raw );
		if ( is_wp_error( $saved ) ) {
			return new WP_Error( $saved->get_error_code(), $saved->get_error_message(), array( 'status' => 400 ) );
		}
		return new WP_REST_Response(
			array(
				'schedule' => $saved,
				'health'   => EMCP_Tools_Scheduled_Backup::health(),
			)
		);
	}

	/**
	 * POST admin/backup/retention: { keep, max_gb }. Applies the limits now.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function retention( $request ) {
		$e = self::ready();
		if ( $e ) {
			return $e;
		}
		EMCP_Tools_Backup_Retention::save(
			array(
				'keep'   => (int) $request->get_param( 'keep' ),
				'max_gb' => (int) $request->get_param( 'max_gb' ),
			)
		);
		return new WP_REST_Response( ( new EMCP_Tools_Admin_Backup_Data() )->payload() );
	}

	/**
	 * POST admin/backup/storage/check: fetch a test file from the backup folder.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function storage_check( $request ) {
		$e = self::ready();
		if ( $e ) {
			return $e;
		}
		EMCP_Tools_Backup_Location::web_check( true );
		return new WP_REST_Response( ( new EMCP_Tools_Admin_Backup_Data() )->payload() );
	}

	/**
	 * DELETE admin/backup/{id} (needs confirm: true; a running backup is refused).
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error
	 */
	public function delete( $request ) {
		$e = self::ready();
		if ( $e ) {
			return $e;
		}
		if ( true !== rest_sanitize_boolean( $request->get_param( 'confirm' ) ) ) {
			return new WP_Error( 'confirm_required', __( 'Confirm this action to continue.', 'emcp-tools' ), array( 'status' => 400 ) );
		}
		$id     = self::route_param( $request, 'id' );
		$backup = EMCP_Tools_Backup_Engine::get_backup( $id );
		if ( ! $backup ) {
			return new WP_Error( 'not_found', __( 'Backup not found.', 'emcp-tools' ), array( 'status' => 404 ) );
		}
		if ( EMCP_Tools_Backup_Engine::is_backup_busy( $id ) ) {
			return new WP_Error( 'backup_running', __( 'This backup is still running.', 'emcp-tools' ), array( 'status' => 409 ) );
		}
		if ( ! EMCP_Tools_Backup_Engine::delete_backup( $id ) ) {
			return new WP_Error( 'delete_failed', __( 'The backup could not be deleted.', 'emcp-tools' ), array( 'status' => 500 ) );
		}
		return new WP_REST_Response( ( new EMCP_Tools_Admin_Backup_Data() )->payload() );
	}
}
