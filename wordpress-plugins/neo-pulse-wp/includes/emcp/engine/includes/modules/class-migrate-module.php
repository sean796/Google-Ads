<?php
/**
 * Backup & Migrate as a Pro module.
 *
 * Full-site backup to a portable `.emcp` archive + restore (Phase 1); local→live
 * migration via a thin connector, and 1-way sync, land in later phases. The
 * module owns all wiring — the custom tables, the admin "Backup & Migrate" tab,
 * the background job hooks, and (later) the REST + MCP surface — booted by the
 * modules registry on `init` only when active, so turning it off is a true kill
 * switch. On by default for Pro; free builds never load this file.
 *
 * @package EMCP_Tools
 * @since   3.12.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Backup & Migrate module.
 *
 * @since 3.12.0
 */
class EMCP_Tools_Migrate_Module extends EMCP_Tools_Module {

	const ID              = 'migrate';
	const DB_VERSION      = 4;
	const DB_VERSION_OPT  = 'emcp_tools_migrate_db_version';

	public function id(): string {
		return self::ID;
	}

	public function title(): string {
		return __( 'Backup & Migrate', 'emcp-tools' );
	}

	public function description(): string {
		return __( 'Back up your whole site to a portable .emcp file and restore it, plus migrate a local site to a live server and sync changes. Full suite of backup, sync, and migrate functionality.', 'emcp-tools' );
	}

	public function tier(): string {
		return 'pro';
	}

	/** Modules screen group. */
	public function group(): string {
		return 'site';
	}

	/** Modules screen icon. */
	public function icon(): string {
		return 'database-backup';
	}

	public function default_active(): bool {
		return false;
	}

	/** Disabled in standalone Neo EMCP. */
	public function is_available(): bool {
		return false;
	}

	/** No overlay settings — the module configures on its own admin tab. */
	public function render_settings(): void {}

	/** The Backup & Migrate admin tab is the config surface. */
	public function settings_url(): string {
		return '';
	}

	/**
	 * Disabled in standalone Neo EMCP.
	 *
	 * @return bool
	 */
	public static function is_enabled(): bool {
		return false;
	}

	/**
	 * Disabled in standalone Neo EMCP.
	 */
	public function register(): void {
		return;
		add_action( 'init', array( __CLASS__, 'install_tables' ), 20 );

		$dir = trailingslashit( dirname( __DIR__ ) ) . 'migrate/';
		// A visitor's page view needs only the sync id stamp (content can be saved from
		// the front end). Everything else is admin-ajax, admin-post, REST or cron, and
		// those requests load it all, so the scheduler's self-checks still run there.
		if ( class_exists( 'EMCP_Tools_Bootstrap' ) && ! EMCP_Tools_Bootstrap::needs_mcp_surface() ) {
			if ( is_readable( $dir . 'class-sync-queue.php' ) ) {
				require_once $dir . 'class-sync-queue.php';
			}
			add_action( 'save_post', array( $this, 'stamp_sync_uid' ), 20, 2 );
			return;
		}
		foreach ( array( 'class-logger.php', 'class-helper.php', 'class-environment.php', 'class-backup-location.php', 'class-backup-retention.php', 'class-packager.php', 'class-job-manager.php', 'class-backup-lease.php', 'class-background-processor.php', 'class-backup-manifest.php', 'class-db-exporter.php', 'class-file-archiver.php', 'class-backup-engine.php', 'class-backup-runner.php', 'class-scheduled-backup.php', 'class-backup-attention.php', 'class-db-importer.php', 'class-file-extractor.php', 'class-search-replace.php', 'class-restore-engine.php', 'class-hmac.php', 'class-targets.php', 'class-connector-builder.php', 'class-migration-engine.php', 'class-sync-engine.php', 'class-sync-queue.php', 'class-content-media.php', 'class-content-bundle.php', 'class-content-sync.php' ) as $emcp_file ) {
			if ( is_readable( $dir . $emcp_file ) ) {
				require_once $dir . $emcp_file;
			}
		}

		if ( class_exists( 'EMCP_Tools_Job_Manager' ) ) {
			EMCP_Tools_Job_Manager::register_ajax_handlers();
		}
		if ( class_exists( 'EMCP_Tools_Backup_Engine' ) ) {
			( new EMCP_Tools_Backup_Engine() )->register_ajax();
			add_action( 'emcp_tools_migrate_job_cancelled', array( 'EMCP_Tools_Backup_Engine', 'on_job_cancelled' ) );
		}
		if ( class_exists( 'EMCP_Tools_Restore_Engine' ) ) {
			( new EMCP_Tools_Restore_Engine() )->register_ajax();
		}
		// Scheduled backups: the recurring start, the worker tick, hourly recovery (spec 9.6).
		if ( class_exists( 'EMCP_Tools_Backup_Retention' ) ) {
			EMCP_Tools_Backup_Retention::init();
		}
		if ( class_exists( 'EMCP_Tools_Scheduled_Backup' ) ) {
			EMCP_Tools_Scheduled_Backup::init();
			add_filter( 'emcp_tools_attention_checks', array( 'EMCP_Tools_Backup_Attention', 'add' ) );
		}

		// Serve the connector ZIP (migration destination plugin).
		add_action( 'admin_post_emcp_tools_download_connector', array( 'EMCP_Tools_Connector_Builder', 'stream_download' ) );

		// Migration admin AJAX.
		add_action( 'wp_ajax_emcp_tools_migrate_pair', array( $this, 'ajax_pair' ) );
		add_action( 'wp_ajax_emcp_tools_migrate_list_targets', array( $this, 'ajax_list_targets' ) );
		add_action( 'wp_ajax_emcp_tools_migrate_cleanup_target', array( $this, 'ajax_cleanup_target' ) );
		add_action( 'wp_ajax_emcp_tools_migrate_push_chunk', array( $this, 'ajax_push_chunk' ) );
		add_action( 'wp_ajax_emcp_tools_migrate_push_progress', array( $this, 'ajax_push_progress' ) );
		add_action( 'wp_ajax_emcp_tools_migrate_remote_status', array( $this, 'ajax_remote_status' ) );
		add_action( 'wp_ajax_emcp_tools_migrate_sync_meta', array( $this, 'ajax_sync_meta' ) );
		add_action( 'wp_ajax_emcp_tools_migrate_sync_start', array( $this, 'ajax_sync_start' ) );
		// Content sync (change-driven).
		add_action( 'wp_ajax_emcp_tools_migrate_sync_changes', array( $this, 'ajax_sync_changes' ) );
		add_action( 'wp_ajax_emcp_tools_migrate_sync_discard', array( $this, 'ajax_sync_discard' ) );
		add_action( 'wp_ajax_emcp_tools_migrate_sync_item', array( $this, 'ajax_sync_item' ) );
		// Stamp a stable sync UID on syncable content as it's saved.
		add_action( 'save_post', array( $this, 'stamp_sync_uid' ), 20, 2 );
	}

	/** Guard: nonce + manage_options for every migration AJAX call. */
	private function ajax_guard(): void {
		check_ajax_referer( 'emcp_tools_migrate_nonce', 'nonce' );
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Permission denied.', 'emcp-tools' ) ) );
		}
	}

	/** AJAX: pair a live destination (posts directly to its armed connector). */
	public function ajax_pair(): void {
		$this->ajax_guard();
		$dest = isset( $_POST['live_url'] ) ? esc_url_raw( wp_unslash( $_POST['live_url'] ) ) : '';
		if ( 0 !== stripos( $dest, 'https://' ) ) {
			wp_send_json_error( array( 'message' => __( 'The destination URL must use HTTPS.', 'emcp-tools' ) ) );
		}
		$dest = untrailingslashit( $dest );
		// The destination shows a one-time pairing code when its admin arms the
		// window; it authenticates this request. Without it an open window would
		// accept a secret from any caller on the internet (site takeover).
		$code = isset( $_POST['pair_code'] ) ? sanitize_text_field( wp_unslash( $_POST['pair_code'] ) ) : '';
		$code = strtoupper( trim( $code ) );
		if ( '' === $code ) {
			wp_send_json_error( array( 'message' => __( 'Enter the pairing code shown on the destination site.', 'emcp-tools' ) ) );
		}
		$secret = EMCP_Tools_Migrate_Targets::generate_secret();
		$body   = wp_json_encode( array(
			'live_url'   => untrailingslashit( site_url() ),
			'secret'     => $secret,
			'pair_code'  => $code,
			'expires_at' => time() + EMCP_Tools_Migrate_Targets::PAIR_TTL,
		) );

		// Try the pretty /wp-json/ route first, then the permalink-independent
		// ?rest_route= form. Right after a full migration the destination's
		// rewrite rules can be stale, so /wp-json/ may not reach the REST route
		// (a 200 homepage or a 404) — the fallback pairs anyway.
		$urls   = array(
			$dest . '/wp-json/emcp-connector/v1/pair',
			$dest . '/?rest_route=/emcp-connector/v1/pair',
		);
		$result = null;
		$last   = '';
		foreach ( $urls as $url ) {
			$r = $this->attempt_pair( $url, $body );
			if ( ! empty( $r['ok'] ) ) {
				$result = $r;
				break;
			}
			$last = $r['msg'];
			// The connector answered (e.g. "not armed") — a real reply, don't retry.
			if ( ! empty( $r['reached'] ) ) {
				break;
			}
		}

		// A connector older than 1.1 ignores the pairing code entirely, so it
		// would have accepted that request from anyone who reached it while the
		// window was open. Refuse to build a relationship on it.
		if ( $result && (int) ( $result['data']['schema'] ?? 0 ) < 2 ) {
			wp_send_json_error( array( 'message' => __(
				'The destination is running an outdated connector that does not verify pairing codes. Download the connector again from this page and re-install it on the destination, then pair.',
				'emcp-tools'
			) ) );
		}

		if ( ! $result ) {
			wp_send_json_error( array( 'message' => sprintf(
				/* translators: 1: reason */
				__( 'Pairing failed: %s. Make sure the connector plugin is installed and active on the destination and that you clicked "Arm pairing" there.', 'emcp-tools' ),
				$last
			) ) );
		}

		$data = $result['data'];
		$id   = EMCP_Tools_Migrate_Targets::save( array(
			'live_url' => $dest,
			'secret'   => $secret,
			'caps'     => isset( $data['capabilities'] ) ? $data['capabilities'] : array(),
		) );
		wp_send_json_success( array( 'id' => $id, 'message' => __( 'Paired.', 'emcp-tools' ) ) );
	}

	/**
	 * One pairing attempt against a specific URL form.
	 *
	 * @param string $url  Full /pair URL.
	 * @param string $body JSON body.
	 * @return array{ok:bool,reached:bool,data?:array,msg?:string}
	 */
	private function attempt_pair( $url, $body ) {
		$resp = wp_remote_post( $url, array(
			'timeout' => 25,
			'headers' => array( 'Content-Type' => 'application/json' ),
			'body'    => $body,
		) );
		if ( is_wp_error( $resp ) ) {
			return array( 'ok' => false, 'reached' => false, 'msg' => $resp->get_error_message() );
		}
		$code = (int) wp_remote_retrieve_response_code( $resp );
		$data = json_decode( wp_remote_retrieve_body( $resp ), true );
		if ( is_array( $data ) && ! empty( $data['paired'] ) ) {
			return array( 'ok' => true, 'reached' => true, 'data' => $data );
		}
		// The connector was reached if it returned its own JSON (a paired flag or
		// an emcp_conn_* error) — then the message is meaningful (e.g. not armed).
		$reached = is_array( $data ) && ( array_key_exists( 'paired', $data ) || ( isset( $data['code'] ) && 0 === strpos( (string) $data['code'], 'emcp_conn' ) ) );
		$msg     = ( is_array( $data ) && isset( $data['message'] ) )
			? $data['message']
			: sprintf( /* translators: 1: HTTP code */ __( 'the destination did not return a valid connector response (HTTP %d)', 'emcp-tools' ), $code );
		return array( 'ok' => false, 'reached' => $reached, 'msg' => $msg );
	}

	/** AJAX: list paired targets. */
	public function ajax_list_targets(): void {
		$this->ajax_guard();
		$out = array();
		foreach ( EMCP_Tools_Migrate_Targets::all() as $t ) {
			$out[] = array( 'id' => (int) $t->id, 'live_url' => $t->live_url, 'last_sync' => $t->last_sync );
		}
		wp_send_json_success( array( 'targets' => $out ) );
	}

	/**
	 * AJAX: remove the connector from the live site (zero residue).
	 *
	 * Asks the connector to unpair, purge staged data, deactivate, and — by
	 * default — delete itself, then forgets the target locally. If the connector
	 * is unreachable we still forget the target (with a warning) so the source is
	 * clean either way.
	 */
	public function ajax_cleanup_target(): void {
		$this->ajax_guard();
		$id     = isset( $_POST['id'] ) ? (int) $_POST['id'] : 0;
		$remove = ! isset( $_POST['remove'] ) || (bool) $_POST['remove'];
		if ( ! $id ) {
			wp_send_json_error( array( 'message' => __( 'Missing target id.', 'emcp-tools' ) ) );
		}

		$resp    = EMCP_Tools_Migration_Engine::cleanup( $id, $remove );
		$warning = '';
		if ( is_wp_error( $resp ) ) {
			// Remote unreachable — still forget it locally so the source is clean.
			$warning = $resp->get_error_message();
			$resp    = array( 'cleaned' => false );
		}

		EMCP_Tools_Migrate_Targets::delete( $id );

		if ( '' !== $warning ) {
			wp_send_json_success( array(
				'message' => sprintf(
					/* translators: %s: reason */
					__( 'Target removed here, but the connector could not be reached (%s). Deactivate/delete it manually on the live site.', 'emcp-tools' ),
					$warning
				),
				'remote'  => $resp,
			) );
		}

		$deleted = ! empty( $resp['deleted'] );
		wp_send_json_success( array(
			'message' => $deleted
				? __( 'Connector deleted from the live site and unpaired. Nothing left behind.', 'emcp-tools' )
				: __( 'Connector deactivated and unpaired on the live site. (Delete it from the Plugins screen for full removal.)', 'emcp-tools' ),
			'remote'  => $resp,
		) );
	}

	/**
	 * Resolve a completed backup's absolute .emcp path (bare filename -> its dir).
	 *
	 * @param string $backup_id Backup id.
	 * @return string|WP_Error
	 */
	private function resolve_backup_archive( $backup_id ) {
		$backup = EMCP_Tools_Backup_Engine::get_backup( $backup_id );
		if ( ! $backup || 'completed' !== $backup->status ) {
			return new WP_Error( 'no_backup', __( 'Backup not found or not complete.', 'emcp-tools' ) );
		}
		$paths = json_decode( (string) $backup->file_paths, true );
		$name  = is_array( $paths ) && ! empty( $paths[0] ) ? (string) $paths[0] : '';
		$emcp  = '';
		if ( '' !== $name ) {
			$emcp = is_file( $name ) ? $name : EMCP_Tools_Environment::get_backup_dir() . '/' . $backup->backup_id . '/' . $name;
		}
		if ( ! $emcp || ! is_file( $emcp ) ) {
			return new WP_Error( 'no_archive', __( 'Backup archive file is missing.', 'emcp-tools' ) );
		}
		return $emcp;
	}

	/**
	 * AJAX: push ONE time-bounded slice of the backup to the target, then report
	 * where it stopped. The browser drives this repeatedly (offset carried
	 * forward) so no single request runs long enough to hit a host's per-request
	 * timeout (mod_fcgid/nginx/php-fpm) - the cause of the mid-transfer 500. On
	 * completion it triggers the remote restore.
	 */
	public function ajax_push_chunk(): void {
		$this->ajax_guard();
		$target_id = isset( $_POST['target_id'] ) ? (int) $_POST['target_id'] : 0;
		$backup_id = isset( $_POST['backup_id'] ) ? sanitize_text_field( wp_unslash( $_POST['backup_id'] ) ) : '';
		$offset    = isset( $_POST['offset'] ) ? max( 0, (int) $_POST['offset'] ) : 0;

		$emcp = $this->resolve_backup_archive( $backup_id );
		if ( is_wp_error( $emcp ) ) {
			wp_send_json_error( array( 'message' => $emcp->get_error_message() ) );
		}

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		@ignore_user_abort( true );
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged,Squiz.PHP.DiscouragedFunctions
		@set_time_limit( 0 );

		$window = EMCP_Tools_Environment::get_safe_execution_time();
		$res    = EMCP_Tools_Migration_Engine::push_window( $target_id, $emcp, $offset, $window, function ( $sent, $total ) {
			update_option( 'emcp_tools_migrate_push_progress', array( 'phase' => 'transfer', 'sent' => (int) $sent, 'total' => (int) $total ), false );
		} );
		if ( is_wp_error( $res ) ) {
			wp_send_json_error( array( 'message' => $res->get_error_message() ) );
		}

		if ( empty( $res['done'] ) ) {
			wp_send_json_success( array( 'done' => false, 'offset' => (int) $res['offset'], 'total' => (int) $res['total'] ) );
		}

		// Transfer complete - kick off the remote restore.
		update_option( 'emcp_tools_migrate_push_progress', array( 'phase' => 'restore', 'sent' => (int) $res['total'], 'total' => (int) $res['total'] ), false );
		$r = EMCP_Tools_Migration_Engine::trigger_restore( $target_id, $res['upload_id'] );
		if ( is_wp_error( $r ) ) {
			wp_send_json_error( array( 'message' => $r->get_error_message() ) );
		}
		EMCP_Tools_Migrate_Targets::touch_sync( $target_id );
		wp_send_json_success( array( 'done' => true, 'offset' => (int) $res['total'], 'total' => (int) $res['total'] ) );
	}

	/** AJAX: source-side push progress (polled during the long push request). */
	public function ajax_push_progress(): void {
		$this->ajax_guard();
		$p = get_option( 'emcp_tools_migrate_push_progress' );
		wp_send_json_success( is_array( $p ) ? $p : array( 'phase' => 'idle', 'sent' => 0, 'total' => 0 ) );
	}

	/** AJAX: remote restore status on the destination. */
	public function ajax_remote_status(): void {
		$this->ajax_guard();
		$target_id = isset( $_POST['target_id'] ) ? (int) $_POST['target_id'] : 0;
		$status    = EMCP_Tools_Migration_Engine::poll_status( $target_id );
		if ( is_wp_error( $status ) ) {
			wp_send_json_error( array( 'message' => $status->get_error_message() ) );
		}
		wp_send_json_success( $status );
	}

	/** AJAX: syncable tables + file roots for the Sync UI. */
	public function ajax_sync_meta(): void {
		$this->ajax_guard();
		$tables = array();
		foreach ( EMCP_Tools_Sync_Engine::syncable_tables() as $t ) {
			$tables[] = array( 'name' => $t['name'], 'size' => EMCP_Tools_Helper::format_bytes( (int) $t['size'] ), 'rows' => (int) $t['rows'] );
		}
		wp_send_json_success( array(
			'tables' => $tables,
			'roots'  => EMCP_Tools_Sync_Engine::syncable_file_roots(),
		) );
	}

	/** AJAX: build a scoped .emcp, push it, and trigger the remote restore. */
	public function ajax_sync_start(): void {
		$this->ajax_guard();
		$target_id = isset( $_POST['target_id'] ) ? (int) $_POST['target_id'] : 0;
		if ( ! $target_id ) {
			wp_send_json_error( array( 'message' => __( 'Choose a destination.', 'emcp-tools' ) ) );
		}

		// Scope: db = 'all'|'none'|string[]; files = 'all'|'none'|string[].
		$db    = isset( $_POST['db'] ) ? wp_unslash( $_POST['db'] ) : 'all'; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		$files = isset( $_POST['files'] ) ? wp_unslash( $_POST['files'] ) : 'all'; // phpcs:ignore WordPress.Security.ValidatedSanitizedInput.InputNotSanitized
		$db    = is_array( $db ) ? array_map( 'sanitize_text_field', $db ) : sanitize_text_field( $db );
		$files = is_array( $files ) ? array_map( 'sanitize_text_field', $files ) : sanitize_text_field( $files );

		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		@ignore_user_abort( true );
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged,Squiz.PHP.DiscouragedFunctions
		@set_time_limit( 0 );

		update_option( 'emcp_tools_migrate_push_progress', array( 'phase' => 'building', 'sent' => 0, 'total' => 0 ), false );
		$work = self::backup_dir() . 'sync-tmp';
		$emcp = EMCP_Tools_Sync_Engine::build_scoped_emcp( array( 'db' => $db, 'files' => $files ), $work );
		if ( is_wp_error( $emcp ) ) {
			wp_send_json_error( array( 'message' => $emcp->get_error_message() ) );
		}

		update_option( 'emcp_tools_migrate_push_progress', array( 'phase' => 'transfer', 'sent' => 0, 'total' => (int) filesize( $emcp ) ), false );
		$res = EMCP_Tools_Migration_Engine::push( $target_id, $emcp, function ( $sent, $total ) {
			update_option( 'emcp_tools_migrate_push_progress', array( 'phase' => 'transfer', 'sent' => (int) $sent, 'total' => (int) $total ), false );
		} );
		@unlink( $emcp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		if ( is_wp_error( $res ) ) {
			wp_send_json_error( array( 'message' => $res->get_error_message() ) );
		}

		update_option( 'emcp_tools_migrate_push_progress', array( 'phase' => 'restore', 'sent' => (int) $res['total'], 'total' => (int) $res['total'] ), false );
		$r = EMCP_Tools_Migration_Engine::trigger_restore( $target_id, $res['upload_id'] );
		if ( is_wp_error( $r ) ) {
			wp_send_json_error( array( 'message' => $r->get_error_message() ) );
		}
		EMCP_Tools_Migrate_Targets::touch_sync( $target_id );
		wp_send_json_success( array( 'upload_id' => $res['upload_id'], 'message' => __( 'Synced. Restore started on the live site.', 'emcp-tools' ) ) );
	}

	/**
	 * Stamp a stable sync UID on syncable content as it is saved, so the item can
	 * be matched on the live site later regardless of slug/ID changes.
	 *
	 * @param int     $post_id Post id.
	 * @param WP_Post $post    Post object.
	 * @return void
	 */
	public function stamp_sync_uid( $post_id, $post ): void {
		if ( wp_is_post_revision( $post_id ) || wp_is_post_autosave( $post_id ) ) {
			return;
		}
		if ( ! $post instanceof WP_Post ) {
			$post = get_post( $post_id );
		}
		if ( ! $post || ! class_exists( 'EMCP_Tools_Sync_Queue' ) ) {
			return;
		}
		if ( ! in_array( $post->post_type, EMCP_Tools_Sync_Queue::syncable_post_types(), true ) ) {
			return;
		}
		if ( ! in_array( $post->post_status, EMCP_Tools_Sync_Queue::syncable_statuses(), true ) ) {
			return;
		}
		EMCP_Tools_Sync_Queue::ensure_uid( (int) $post_id );
	}

	/** AJAX: the "changes to sync" list for a target. */
	public function ajax_sync_changes(): void {
		$this->ajax_guard();
		if ( ! class_exists( 'EMCP_Tools_Sync_Queue' ) ) {
			wp_send_json_error( array( 'message' => __( 'Content sync is unavailable.', 'emcp-tools' ) ) );
		}
		$target_id = isset( $_POST['target_id'] ) ? (int) $_POST['target_id'] : 0;
		$paged     = isset( $_POST['paged'] ) ? max( 1, (int) $_POST['paged'] ) : 1;
		$search    = isset( $_POST['search'] ) ? sanitize_text_field( wp_unslash( $_POST['search'] ) ) : '';
		$res = EMCP_Tools_Sync_Queue::pending( $target_id, array( 'paged' => $paged, 'per_page' => 20, 'search' => $search ) );
		wp_send_json_success( $res );
	}

	/** AJAX: dismiss an item from the sync list until it changes again. */
	public function ajax_sync_discard(): void {
		$this->ajax_guard();
		if ( ! class_exists( 'EMCP_Tools_Sync_Queue' ) ) {
			wp_send_json_error( array( 'message' => __( 'Content sync is unavailable.', 'emcp-tools' ) ) );
		}
		$target_id = isset( $_POST['target_id'] ) ? (int) $_POST['target_id'] : 0;
		$post_id   = isset( $_POST['post_id'] ) ? (int) $_POST['post_id'] : 0;
		if ( ! $post_id ) {
			wp_send_json_error( array( 'message' => __( 'Missing item.', 'emcp-tools' ) ) );
		}
		EMCP_Tools_Sync_Queue::discard( $post_id, $target_id );
		wp_send_json_success();
	}

	/** AJAX: push one content item to a target, then mark it synced. */
	public function ajax_sync_item(): void {
		$this->ajax_guard();
		if ( ! class_exists( 'EMCP_Tools_Content_Sync' ) ) {
			wp_send_json_error( array( 'message' => __( 'Content sync is unavailable.', 'emcp-tools' ) ) );
		}
		$target_id = isset( $_POST['target_id'] ) ? (int) $_POST['target_id'] : 0;
		$post_id   = isset( $_POST['post_id'] ) ? (int) $_POST['post_id'] : 0;
		if ( ! $target_id || ! $post_id ) {
			wp_send_json_error( array( 'message' => __( 'Choose a destination and an item.', 'emcp-tools' ) ) );
		}
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		@ignore_user_abort( true );
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged,Squiz.PHP.DiscouragedFunctions
		@set_time_limit( 0 );
		$res = EMCP_Tools_Content_Sync::push_item( $target_id, $post_id );
		if ( is_wp_error( $res ) ) {
			wp_send_json_error( array( 'message' => $res->get_error_message() ) );
		}
		wp_send_json_success( $res );
	}

	/**
	 * URL that streams the connector ZIP (nonce-protected).
	 *
	 * @return string
	 */
	public static function connector_download_url(): string {
		return wp_nonce_url(
			admin_url( 'admin-post.php?action=emcp_tools_download_connector' ),
			'emcp_tools_download_connector'
		);
	}

	/**
	 * The protected backups directory (EMCP_Tools_Backup_Location: outside the
	 * web root when possible, else an unguessable folder in wp-content).
	 *
	 * @return string Absolute path, trailing slash.
	 */
	public static function backup_dir(): string {
		if ( ! class_exists( 'EMCP_Tools_Backup_Location' ) ) {
			require_once dirname( __DIR__ ) . '/migrate/class-backup-location.php';
		}
		return trailingslashit( EMCP_Tools_Backup_Location::dir() );
	}

	/**
	 * Create/upgrade the module's tables. The backup folder is created on
	 * first use (EMCP_Tools_Backup_Location), not on every request.
	 */
	public static function install_tables(): void {
		if ( (int) get_option( self::DB_VERSION_OPT, 0 ) >= self::DB_VERSION ) {
			return;
		}
		if ( ! function_exists( 'dbDelta' ) ) {
			$upgrade = ABSPATH . 'wp-admin/includes/upgrade.php';
			if ( is_readable( $upgrade ) ) {
				require_once $upgrade;
			}
		}
		if ( function_exists( 'dbDelta' ) ) {
			global $wpdb;
			$charset = method_exists( $wpdb, 'get_charset_collate' ) ? $wpdb->get_charset_collate() : '';
			$backups = $wpdb->prefix . 'emcp_migrate_backups';
			$jobs    = $wpdb->prefix . 'emcp_migrate_jobs';
			dbDelta(
				"CREATE TABLE {$backups} (
					id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
					backup_id VARCHAR(64) NOT NULL,
					name VARCHAR(255) NULL,
					type VARCHAR(20) NOT NULL DEFAULT 'full',
					source VARCHAR(20) NOT NULL DEFAULT 'manual',
					status VARCHAR(20) NOT NULL DEFAULT 'pending',
					total_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
					db_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
					files_size BIGINT UNSIGNED NOT NULL DEFAULT 0,
					chunk_count INT NOT NULL DEFAULT 0,
					storage_destinations LONGTEXT NULL,
					file_paths LONGTEXT NULL,
					manifest LONGTEXT NULL,
					started_at DATETIME NULL,
					completed_at DATETIME NULL,
					created_at DATETIME NOT NULL,
					PRIMARY KEY (id),
					UNIQUE KEY backup_unique (backup_id),
					KEY status_idx (status),
					KEY source_idx (source)
				) {$charset};"
			);
			dbDelta(
				"CREATE TABLE {$jobs} (
					id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
					job_id VARCHAR(64) NOT NULL,
					type VARCHAR(30) NOT NULL,
					status VARCHAR(20) NOT NULL DEFAULT 'queued',
					progress_percent TINYINT UNSIGNED NOT NULL DEFAULT 0,
					current_step VARCHAR(191) NULL,
					data LONGTEXT NULL,
					attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
					max_attempts TINYINT UNSIGNED NOT NULL DEFAULT 3,
					heartbeat DATETIME NULL,
					created_at DATETIME NOT NULL,
					PRIMARY KEY (id),
					UNIQUE KEY job_unique (job_id),
					KEY status_idx (status)
				) {$charset};"
			);
			$targets = $wpdb->prefix . 'emcp_migrate_targets';
			dbDelta(
				"CREATE TABLE {$targets} (
					id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
					live_url VARCHAR(255) NOT NULL,
					secret_enc TEXT NULL,
					caps LONGTEXT NULL,
					last_sync DATETIME NULL,
					created_at DATETIME NOT NULL,
					PRIMARY KEY (id)
				) {$charset};"
			);
		}
		update_option( self::DB_VERSION_OPT, self::DB_VERSION, false );
	}

	/**
	 * Safe browser→server upload chunk size (bytes).
	 *
	 * Deliberately conservative: a large binary POST to admin-ajax is exactly
	 * what trips shared-host post_max_size limits, ModSecurity rules, and proxy
	 * body caps (surfacing as a 500), which defeats the point of chunking. We
	 * cap at 4 MB, leave a 20% margin below the host's reported limit for
	 * multipart overhead, and never floor ABOVE that limit. Filterable for hosts
	 * that can take bigger chunks.
	 *
	 * @return int
	 */
	public static function upload_chunk_size(): int {
		$limit = function_exists( 'wp_max_upload_size' ) ? (int) wp_max_upload_size() : 0;
		$size  = self::compute_chunk_size( $limit );
		/** Allow hosts with generous limits to push larger chunks. */
		return (int) apply_filters( 'emcp_tools_migrate_upload_chunk_size', $size, $limit );
	}

	/**
	 * Pure chunk-size math (unit-tested).
	 *
	 * The uploader sends each chunk as a RAW multipart blob (like All-in-One WP
	 * Migration) — no base64, so no browser memory blow-up. We size the chunk to
	 * the host's own PHP upload limit (`wp_max_upload_size()` = min(post_max_size,
	 * upload_max_filesize)) with a 10% margin for multipart overhead, capped at
	 * 48 MB. The large cap is deliberate: a 400 MB backup then uploads in ~10
	 * requests instead of ~90, which avoids the mod_fcgid/php-cgi WORKER CHURN a
	 * burst of tiny POSTs causes (the real source of the intermittent "chunk N →
	 * 500"), while staying under the common single-request ceilings the browser
	 * can't see from PHP — mod_fcgid `FcgidMaxRequestLen` (~64-77 MB) and
	 * Cloudflare's 100 MB body limit. When a chunk is still rejected (a stricter
	 * host, an nginx `client_max_body_size`), the JS uploader HALVES the chunk
	 * and retries — so this value is only the starting point, not a hard limit.
	 * The floor never exceeds the host's safe headroom.
	 *
	 * @param int $limit wp_max_upload_size() in bytes (0 = unknown).
	 * @return int
	 */
	public static function compute_chunk_size( int $limit ): int {
		$cap  = 48 * 1024 * 1024;
		$safe = $limit > 0 ? (int) ( $limit * 0.9 ) : $cap;
		$size = min( $cap, $safe );
		// Sane floor, but never above the host's safe headroom.
		return (int) max( min( 512 * 1024, $safe ), $size );
	}

	/**
	 * Documentation URL for raising server upload limits.
	 *
	 * Filterable so the page can move without a plugin release.
	 *
	 * @param string $anchor Optional #anchor.
	 * @return string
	 */
	public static function docs_url( string $anchor = '' ): string {
		$url = 'https://emcptools.com/docs/backup-migrate/server-limits/';
		if ( '' !== $anchor ) {
			$url .= '#' . $anchor;
		}
		return (string) apply_filters( 'emcp_tools_migrate_docs_url', $url, $anchor );
	}

	/**
	 * Current vs recommended server limits, for the Restore panel's info box.
	 *
	 * Each row: label, current (display), recommended (display), ok (bool). The
	 * uploader adapts to whatever the host allows (it halves the chunk on a
	 * rejection), so these are guidance for uploading big backups in fewer, faster
	 * requests — not hard requirements.
	 *
	 * @return array<int,array<string,mixed>>
	 */
	public static function server_limits(): array {
		$to_bytes = static function ( $v ): int {
			$v = trim( (string) $v );
			return '' === $v ? 0 : (int) wp_convert_hr_to_bytes( $v );
		};

		$upload   = $to_bytes( ini_get( 'upload_max_filesize' ) );
		$post     = $to_bytes( ini_get( 'post_max_size' ) );
		$mem_raw  = trim( (string) ini_get( 'memory_limit' ) );
		$mem      = $to_bytes( $mem_raw );
		$mem_unl  = ( '-1' === $mem_raw );
		$exec     = (int) ini_get( 'max_execution_time' );

		return array(
			array(
				'label'       => __( 'Upload max filesize', 'emcp-tools' ),
				'current'     => size_format( $upload ),
				'recommended' => __( '64 MB or more', 'emcp-tools' ),
				'ok'          => $upload >= 64 * 1024 * 1024,
			),
			array(
				'label'       => __( 'Post max size', 'emcp-tools' ),
				'current'     => size_format( $post ),
				'recommended' => __( '64 MB or more', 'emcp-tools' ),
				'ok'          => $post >= 64 * 1024 * 1024,
			),
			array(
				'label'       => __( 'Memory limit', 'emcp-tools' ),
				'current'     => $mem_unl ? __( 'Unlimited', 'emcp-tools' ) : size_format( $mem ),
				'recommended' => __( '256 MB or more', 'emcp-tools' ),
				'ok'          => $mem_unl || $mem >= 256 * 1024 * 1024,
			),
			array(
				'label'       => __( 'Max execution time', 'emcp-tools' ),
				'current'     => 0 === $exec ? __( 'Unlimited', 'emcp-tools' ) : $exec . 's',
				'recommended' => __( '300s or more', 'emcp-tools' ),
				'ok'          => 0 === $exec || $exec >= 300,
			),
		);
	}

}
