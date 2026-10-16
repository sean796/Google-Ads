<?php
/**
 * MCP tools for Backup / Migrate / Sync (Pro).
 *
 * Four abilities over the existing engines: create-backup + list-backups
 * (non-destructive, on by default) and migrate-site + sync-to-live (destructive
 * pushes to a paired live target, disabled by default, require `confirm:true`).
 * Registered only when the Migrate module is enabled + premium; self-gates in
 * register(). Executors lazy-load the engine classes so an MCP call works
 * regardless of the module's init boot timing.
 *
 * @package EMCP_Tools
 * @since   3.15.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Backup / Migrate / Sync abilities.
 *
 * @since 3.15.0
 */
class EMCP_Tools_Migrate_Abilities {

	/** @var string[] */
	private $ability_names = array();

	/**
	 * @return string[]
	 */
	public function get_ability_names(): array {
		return $this->ability_names;
	}

	/**
	 * Register the group (self-gated on premium).
	 */
	public function register(): void {
		if ( ! function_exists( 'emcp_tools_fs' ) || ! emcp_tools_fs()->can_use_premium_code() ) {
			return;
		}
		$this->register_create_backup();
		$this->register_list_backups();
		$this->register_migrate_site();
		$this->register_sync_to_live();
		$this->register_list_syncable_changes();
		$this->register_sync_content_item();
		$this->register_discard_sync_change();
	}

	/**
	 * Admin-only permission for every tool in this group.
	 *
	 * @return bool
	 */
	public function check_manage_permission(): bool {
		return current_user_can( 'manage_options' );
	}

	/**
	 * Ensure the migrate engine classes are loaded (defensive lazy-load).
	 */
	private function ensure_engines(): void {
		if ( class_exists( 'EMCP_Tools_Backup_Engine' ) && class_exists( 'EMCP_Tools_Migration_Engine' ) ) {
			return;
		}
		if ( ! class_exists( 'EMCP_Tools_Pro_Loader' ) ) {
			return;
		}
		foreach ( array( 'class-logger', 'class-helper', 'class-environment', 'class-packager', 'class-job-manager', 'class-backup-lease', 'class-background-processor', 'class-backup-manifest', 'class-db-exporter', 'class-file-archiver', 'class-backup-engine', 'class-backup-runner', 'class-scheduled-backup', 'class-hmac', 'class-targets', 'class-migration-engine', 'class-sync-engine', 'class-sync-queue', 'class-content-media', 'class-content-bundle', 'class-content-sync' ) as $f ) {
			$path = EMCP_Tools_Pro_Loader::path( 'includes/migrate/' . $f . '.php' );
			if ( '' !== $path ) {
				require_once $path;
			}
		}
	}

	// ---------------------------------------------------------------------
	// create-backup
	// ---------------------------------------------------------------------

	private function register_create_backup(): void {
		$this->ability_names[] = 'emcp-tools/create-backup';
		emcp_tools_register_ability(
			'emcp-tools/create-backup',
			array(
				'label'               => __( 'Create Backup', 'emcp-tools' ),
				'description'         => __( 'Creates a portable .emcp backup of this site and returns its id, size and a download URL. Choose the scope with type: full (database + files), database, or files. Non-destructive; runs to completion before returning.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_create_backup' ),
				'permission_callback' => array( $this, 'check_manage_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'type' => array( 'type' => 'string', 'enum' => array( 'full', 'database', 'files' ), 'description' => __( 'Backup scope. Default full.', 'emcp-tools' ) ),
						'name' => array( 'type' => 'string', 'description' => __( 'Optional label.', 'emcp-tools' ) ),
					),
				),
				'output_schema'       => array( 'type' => 'object' ),
				'meta'                => array(
					'annotations'  => array( 'readonly' => false, 'destructive' => false, 'idempotent' => false ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * @param array $input Tool input.
	 * @return array|WP_Error
	 */
	public function execute_create_backup( $input ) {
		$this->ensure_engines();
		if ( ! class_exists( 'EMCP_Tools_Backup_Engine' ) ) {
			return new \WP_Error( 'unavailable', __( 'Backup engine unavailable.', 'emcp-tools' ) );
		}
		$type = isset( $input['type'] ) && in_array( $input['type'], array( 'full', 'database', 'files' ), true ) ? $input['type'] : 'full';
		$name = isset( $input['name'] ) ? sanitize_text_field( (string) $input['name'] ) : '';

		$backup_id = $this->run_backup_to_completion( array( 'type' => $type, 'name' => $name ) );
		if ( is_wp_error( $backup_id ) ) {
			return $backup_id;
		}
		$rec = EMCP_Tools_Backup_Engine::get_backup( $backup_id );
		if ( ! $rec ) {
			return new \WP_Error( 'backup_missing', __( 'Backup completed but its record was not found.', 'emcp-tools' ) );
		}
		return array(
			'backup_id'    => $rec->backup_id,
			'name'         => $rec->name,
			'type'         => $rec->type,
			'status'       => $rec->status,
			'size'         => EMCP_Tools_Helper::format_bytes( (int) $rec->total_size ),
			'download_url' => class_exists( 'EMCP_Tools_Migrate_Module' ) ? admin_url( 'admin.php?page=emcp-tools-migrate&view=history' ) : '',
		);
	}

	/**
	 * Drive a backup job to completion in-process.
	 *
	 * @param array $args Backup args.
	 * @return string|WP_Error Backup id.
	 */
	private function run_backup_to_completion( $args ) {
		// phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged,Squiz.PHP.DiscouragedFunctions
		@set_time_limit( 0 );
		$engine = new EMCP_Tools_Backup_Engine();
		$job_id = $engine->start( array( 'source' => 'mcp' ) + (array) $args );
		if ( is_wp_error( $job_id ) ) {
			return $job_id;
		}
		$job   = EMCP_Tools_Job_Manager::get_job( $job_id );
		$data  = $job ? json_decode( $job->data, true ) : array();
		$guard = 0;
		// This loop owns the job lease for its whole run (spec 9.6).
		$owner = 'mcp-' . wp_generate_password( 12, false );
		try {
			while ( $guard++ < 100000 ) {
				$res = $engine->run_chunk_sync( $job_id, $data, $owner );
				if ( is_wp_error( $res ) ) {
					// This loop gives up: the job and its record must not stay `running`.
					EMCP_Tools_Job_Manager::update_job(
						$job_id,
						array(
							'status'       => 'failed',
							'current_step' => substr( $res->get_error_message(), 0, 191 ),
						)
					);
					if ( ! empty( $data['backup_id'] ) ) {
						EMCP_Tools_Backup_Engine::mark_backup( (string) $data['backup_id'], 'failed' );
						EMCP_Tools_Backup_Engine::delete_backup_files( (string) $data['backup_id'] );
					}
					return $res;
				}
				if ( true === $res ) {
					break;
				}
				$data = is_array( $res ) ? $res : $data;
			}
		} finally {
			EMCP_Tools_Backup_Lease::release( $job_id, $owner );
		}
		// Resolve the backup id from the job data.
		return isset( $data['backup_id'] ) ? $data['backup_id'] : ( $job ? '' : '' );
	}

	// ---------------------------------------------------------------------
	// list-backups
	// ---------------------------------------------------------------------

	private function register_list_backups(): void {
		$this->ability_names[] = 'emcp-tools/list-backups';
		emcp_tools_register_ability(
			'emcp-tools/list-backups',
			array(
				'label'               => __( 'List Backups', 'emcp-tools' ),
				'description'         => __( 'Lists this site\'s .emcp backups (id, name, type, status, size, created). Read-only.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_list_backups' ),
				'permission_callback' => array( $this, 'check_manage_permission' ),
				'input_schema'        => array( 'type' => 'object', 'properties' => array() ),
				'output_schema'       => array( 'type' => 'object', 'properties' => array( 'backups' => array( 'type' => 'array', 'items' => array( 'type' => 'object' ) ) ) ),
				'meta'                => array(
					'annotations'  => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * @param array $input Tool input.
	 * @return array|WP_Error
	 */
	public function execute_list_backups( $input ) {
		$this->ensure_engines();
		if ( ! class_exists( 'EMCP_Tools_Backup_Engine' ) ) {
			return new \WP_Error( 'unavailable', __( 'Backup engine unavailable.', 'emcp-tools' ) );
		}
		$out = array();
		foreach ( EMCP_Tools_Backup_Engine::get_backups() as $b ) {
			$out[] = array(
				'backup_id'  => $b->backup_id,
				'name'       => $b->name,
				'type'       => $b->type,
				'status'     => $b->status,
				'size'       => EMCP_Tools_Helper::format_bytes( (int) $b->total_size ),
				'created_at' => $b->created_at,
			);
		}
		return array( 'backups' => $out );
	}

	// ---------------------------------------------------------------------
	// migrate-site
	// ---------------------------------------------------------------------

	private function register_migrate_site(): void {
		$this->ability_names[] = 'emcp-tools/migrate-site';
		emcp_tools_register_ability(
			'emcp-tools/migrate-site',
			array(
				'label'               => __( 'Migrate Site to Live', 'emcp-tools' ),
				'description'         => __( 'Pushes this whole site to a paired live target and restores it there — DESTRUCTIVE on the destination (its database and files are replaced). Requires confirm:true. Pair the target first on the Migrate tab (list its id via the admin).', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_migrate_site' ),
				'permission_callback' => array( $this, 'check_manage_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'target_id' => array( 'type' => 'integer', 'description' => __( 'Paired target id.', 'emcp-tools' ) ),
						'backup_id' => array( 'type' => 'string', 'description' => __( 'Optional existing full backup to push. If omitted, a fresh full backup is created first.', 'emcp-tools' ) ),
						'confirm'   => array( 'type' => 'boolean', 'description' => __( 'Must be true — this overwrites the live site.', 'emcp-tools' ) ),
					),
					'required'   => array( 'target_id', 'confirm' ),
				),
				'output_schema'       => array( 'type' => 'object' ),
				'meta'                => array(
					'annotations'  => array( 'readonly' => false, 'destructive' => true, 'idempotent' => false ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * @param array $input Tool input.
	 * @return array|WP_Error
	 */
	public function execute_migrate_site( $input ) {
		if ( empty( $input['confirm'] ) || true !== $input['confirm'] ) {
			return new \WP_Error( 'confirm_required', __( 'This overwrites the live site. Pass confirm:true to proceed.', 'emcp-tools' ) );
		}
		$this->ensure_engines();
		$target_id = isset( $input['target_id'] ) ? (int) $input['target_id'] : 0;
		if ( ! $target_id || ! class_exists( 'EMCP_Tools_Migration_Engine' ) ) {
			return new \WP_Error( 'bad_target', __( 'A valid paired target_id is required.', 'emcp-tools' ) );
		}

		// Resolve the .emcp: an existing backup, or a fresh full one.
		$rec = null;
		if ( ! empty( $input['backup_id'] ) ) {
			$rec = EMCP_Tools_Backup_Engine::get_backup( sanitize_text_field( (string) $input['backup_id'] ) );
			if ( ! $rec || 'completed' !== $rec->status ) {
				return new \WP_Error( 'no_backup', __( 'The given backup_id was not found or is not complete.', 'emcp-tools' ) );
			}
		} else {
			$backup_id = $this->run_backup_to_completion( array( 'type' => 'full', 'name' => 'Migration push' ) );
			if ( is_wp_error( $backup_id ) ) {
				return $backup_id;
			}
			$rec = EMCP_Tools_Backup_Engine::get_backup( $backup_id );
		}
		// file_paths holds the bare archive filename; it lives in the backup's own
		// directory (get_backup_dir()/<backup_id>/<filename>), the same resolution
		// the download + admin push use. (Defensive: accept an absolute path too.)
		$paths = $rec ? json_decode( (string) $rec->file_paths, true ) : array();
		$name  = is_array( $paths ) && ! empty( $paths[0] ) ? (string) $paths[0] : '';
		$emcp  = '';
		if ( '' !== $name && $rec ) {
			$emcp = is_file( $name )
				? $name
				: EMCP_Tools_Environment::get_backup_dir() . '/' . $rec->backup_id . '/' . $name;
		}
		if ( ! $emcp || ! is_file( $emcp ) ) {
			return new \WP_Error( 'no_archive', __( 'Backup archive not found.', 'emcp-tools' ) );
		}

		$res = EMCP_Tools_Migration_Engine::push( $target_id, $emcp );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$r = EMCP_Tools_Migration_Engine::trigger_restore( $target_id, $res['upload_id'] );
		if ( is_wp_error( $r ) ) {
			return $r;
		}
		EMCP_Tools_Migrate_Targets::touch_sync( $target_id );
		$target = EMCP_Tools_Migrate_Targets::get( $target_id );
		return array(
			'upload_id' => $res['upload_id'],
			'target'    => $target ? $target->live_url : '',
			'message'   => __( 'Site transferred; restore started on the live target.', 'emcp-tools' ),
		);
	}

	// ---------------------------------------------------------------------
	// sync-to-live
	// ---------------------------------------------------------------------

	private function register_sync_to_live(): void {
		$this->ability_names[] = 'emcp-tools/sync-to-live';
		emcp_tools_register_ability(
			'emcp-tools/sync-to-live',
			array(
				'label'               => __( 'Sync to Live', 'emcp-tools' ),
				'description'         => __( 'Pushes a chosen scope to a paired live target — full (db + all files) or selective (chosen tables and/or file areas). Only the pushed scope is replaced on the destination; a files-only sync never rewrites the live database. DESTRUCTIVE for the pushed scope. Requires confirm:true.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_sync_to_live' ),
				'permission_callback' => array( $this, 'check_manage_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'target_id' => array( 'type' => 'integer', 'description' => __( 'Paired target id.', 'emcp-tools' ) ),
						'scope'      => array(
							'type'        => 'object',
							'description' => __( 'Omit for a full sync. Otherwise { db: "all"|"none"|[table names], files: "all"|"none"|["themes","plugins","uploads"] }.', 'emcp-tools' ),
							'properties'  => array(
								'db'    => array( 'description' => __( '"all" | "none" | array of table names.', 'emcp-tools' ) ),
								'files' => array( 'description' => __( '"all" | "none" | array of areas.', 'emcp-tools' ) ),
							),
						),
						'confirm'   => array( 'type' => 'boolean', 'description' => __( 'Must be true — this overwrites the selected scope on the live site.', 'emcp-tools' ) ),
					),
					'required'   => array( 'target_id', 'confirm' ),
				),
				'output_schema'       => array( 'type' => 'object' ),
				'meta'                => array(
					'annotations'  => array( 'readonly' => false, 'destructive' => true, 'idempotent' => false ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * @param array $input Tool input.
	 * @return array|WP_Error
	 */
	public function execute_sync_to_live( $input ) {
		if ( empty( $input['confirm'] ) || true !== $input['confirm'] ) {
			return new \WP_Error( 'confirm_required', __( 'This overwrites the selected scope on the live site. Pass confirm:true to proceed.', 'emcp-tools' ) );
		}
		$this->ensure_engines();
		$target_id = isset( $input['target_id'] ) ? (int) $input['target_id'] : 0;
		if ( ! $target_id || ! class_exists( 'EMCP_Tools_Sync_Engine' ) || ! class_exists( 'EMCP_Tools_Migration_Engine' ) ) {
			return new \WP_Error( 'bad_target', __( 'A valid paired target_id is required.', 'emcp-tools' ) );
		}
		$scope = isset( $input['scope'] ) && is_array( $input['scope'] ) ? $input['scope'] : array( 'db' => 'all', 'files' => 'all' );

		$work = ( class_exists( 'EMCP_Tools_Migrate_Module' ) ? EMCP_Tools_Migrate_Module::backup_dir() : trailingslashit( WP_CONTENT_DIR ) . 'emcp-backups/' ) . 'sync-tmp';
		$emcp = EMCP_Tools_Sync_Engine::build_scoped_emcp( $scope, $work );
		if ( is_wp_error( $emcp ) ) {
			return $emcp;
		}
		$res = EMCP_Tools_Migration_Engine::push( $target_id, $emcp );
		@unlink( $emcp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		$r = EMCP_Tools_Migration_Engine::trigger_restore( $target_id, $res['upload_id'] );
		if ( is_wp_error( $r ) ) {
			return $r;
		}
		EMCP_Tools_Migrate_Targets::touch_sync( $target_id );
		$target = EMCP_Tools_Migrate_Targets::get( $target_id );
		return array(
			'upload_id' => $res['upload_id'],
			'target'    => $target ? $target->live_url : '',
			'scope'     => EMCP_Tools_Sync_Engine::normalize_scope( $scope ),
			'message'   => __( 'Scope transferred; restore started on the live target.', 'emcp-tools' ),
		);
	}

	// ---------------------------------------------------------------------
	// list-syncable-changes
	// ---------------------------------------------------------------------

	private function register_list_syncable_changes(): void {
		$this->ability_names[] = 'emcp-tools/list-syncable-changes';
		emcp_tools_register_ability(
			'emcp-tools/list-syncable-changes',
			array(
				'label'               => __( 'List Syncable Changes', 'emcp-tools' ),
				'description'         => __( 'Lists pages/posts/CPTs that changed locally since they were last synced to a paired live target (kind = new|updated). Pass target_id (defaults to the first paired target). Read-only.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_list_syncable_changes' ),
				'permission_callback' => array( $this, 'check_manage_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'target_id' => array( 'type' => 'integer', 'description' => __( 'Paired target id (default: first paired target).', 'emcp-tools' ) ),
						'search'    => array( 'type' => 'string' ),
						'page'      => array( 'type' => 'integer' ),
						'per_page'  => array( 'type' => 'integer' ),
					),
				),
				'output_schema'       => array( 'type' => 'object' ),
				'meta'                => array(
					'annotations'  => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * @param array $input Tool input.
	 * @return array|\WP_Error
	 */
	public function execute_list_syncable_changes( $input ) {
		$this->ensure_engines();
		if ( ! class_exists( 'EMCP_Tools_Sync_Queue' ) ) {
			return new \WP_Error( 'unavailable', __( 'Content sync is unavailable.', 'emcp-tools' ) );
		}
		$target_id = isset( $input['target_id'] ) ? (int) $input['target_id'] : 0;
		if ( ! $target_id && class_exists( 'EMCP_Tools_Migrate_Targets' ) ) {
			$targets   = EMCP_Tools_Migrate_Targets::all();
			$target_id = $targets ? (int) $targets[0]->id : 0;
		}
		$res = EMCP_Tools_Sync_Queue::pending( $target_id, array(
			'paged'    => isset( $input['page'] ) ? max( 1, (int) $input['page'] ) : 1,
			'per_page' => isset( $input['per_page'] ) ? min( 100, max( 1, (int) $input['per_page'] ) ) : 50,
			'search'   => isset( $input['search'] ) ? sanitize_text_field( (string) $input['search'] ) : '',
		) );
		return array(
			'target_id' => $target_id,
			'total'     => $res['total'],
			'items'     => $res['items'],
		);
	}

	// ---------------------------------------------------------------------
	// sync-content-item
	// ---------------------------------------------------------------------

	private function register_sync_content_item(): void {
		$this->ability_names[] = 'emcp-tools/sync-content-item';
		emcp_tools_register_ability(
			'emcp-tools/sync-content-item',
			array(
				'label'               => __( 'Sync Content Item to Live', 'emcp-tools' ),
				'description'         => __( 'Pushes ONE page/post/CPT — its content, fields, and attached media — to a paired live target, upserting it there and remapping media ids/URLs. Overwrites only that item on the live site; the rest is untouched. Requires confirm:true. Give post_id (or uid) + target_id.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_sync_content_item' ),
				'permission_callback' => array( $this, 'check_manage_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'target_id' => array( 'type' => 'integer', 'description' => __( 'Paired target id.', 'emcp-tools' ) ),
						'post_id'   => array( 'type' => 'integer', 'description' => __( 'Local post id to sync.', 'emcp-tools' ) ),
						'uid'       => array( 'type' => 'string', 'description' => __( 'Sync uid (alternative to post_id).', 'emcp-tools' ) ),
						'confirm'   => array( 'type' => 'boolean', 'description' => __( 'Must be true — this overwrites the item on the live site.', 'emcp-tools' ) ),
					),
					'required'   => array( 'target_id', 'confirm' ),
				),
				'output_schema'       => array( 'type' => 'object' ),
				'meta'                => array(
					'annotations'  => array( 'readonly' => false, 'destructive' => true, 'idempotent' => false ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * @param array $input Tool input.
	 * @return array|\WP_Error
	 */
	public function execute_sync_content_item( $input ) {
		if ( empty( $input['confirm'] ) || true !== $input['confirm'] ) {
			return new \WP_Error( 'confirm_required', __( 'Syncing overwrites this item on the live site. Pass confirm:true to proceed.', 'emcp-tools' ) );
		}
		$this->ensure_engines();
		if ( ! class_exists( 'EMCP_Tools_Content_Sync' ) ) {
			return new \WP_Error( 'unavailable', __( 'Content sync is unavailable.', 'emcp-tools' ) );
		}
		$target_id = isset( $input['target_id'] ) ? (int) $input['target_id'] : 0;
		$post_id   = isset( $input['post_id'] ) ? (int) $input['post_id'] : 0;
		if ( ! $post_id && ! empty( $input['uid'] ) ) {
			$post_id = EMCP_Tools_Sync_Queue::find_by_uid( sanitize_text_field( (string) $input['uid'] ) );
		}
		if ( ! $target_id || ! $post_id ) {
			return new \WP_Error( 'bad_input', __( 'A target_id and a post_id (or uid) are required.', 'emcp-tools' ) );
		}
		$res = EMCP_Tools_Content_Sync::push_item( $target_id, $post_id );
		if ( is_wp_error( $res ) ) {
			return $res;
		}
		return $res;
	}

	// ---------------------------------------------------------------------
	// discard-sync-change
	// ---------------------------------------------------------------------

	private function register_discard_sync_change(): void {
		$this->ability_names[] = 'emcp-tools/discard-sync-change';
		emcp_tools_register_ability(
			'emcp-tools/discard-sync-change',
			array(
				'label'               => __( 'Discard Sync Change', 'emcp-tools' ),
				'description'         => __( 'Dismisses an item from the changes-to-sync list for a target until it changes again. Local only — does not touch the live site. Give post_id (or uid); target_id optional.', 'emcp-tools' ),
				'category'            => 'emcp-tools',
				'execute_callback'    => array( $this, 'execute_discard_sync_change' ),
				'permission_callback' => array( $this, 'check_manage_permission' ),
				'input_schema'        => array(
					'type'       => 'object',
					'properties' => array(
						'target_id' => array( 'type' => 'integer' ),
						'post_id'   => array( 'type' => 'integer' ),
						'uid'       => array( 'type' => 'string' ),
					),
				),
				'output_schema'       => array( 'type' => 'object' ),
				'meta'                => array(
					'annotations'  => array( 'readonly' => false, 'destructive' => false, 'idempotent' => true ),
					'show_in_rest' => true,
				),
			)
		);
	}

	/**
	 * @param array $input Tool input.
	 * @return array|\WP_Error
	 */
	public function execute_discard_sync_change( $input ) {
		$this->ensure_engines();
		if ( ! class_exists( 'EMCP_Tools_Sync_Queue' ) ) {
			return new \WP_Error( 'unavailable', __( 'Content sync is unavailable.', 'emcp-tools' ) );
		}
		$target_id = isset( $input['target_id'] ) ? (int) $input['target_id'] : 0;
		$post_id   = isset( $input['post_id'] ) ? (int) $input['post_id'] : 0;
		if ( ! $post_id && ! empty( $input['uid'] ) ) {
			$post_id = EMCP_Tools_Sync_Queue::find_by_uid( sanitize_text_field( (string) $input['uid'] ) );
		}
		if ( ! $post_id ) {
			return new \WP_Error( 'bad_input', __( 'A post_id (or uid) is required.', 'emcp-tools' ) );
		}
		EMCP_Tools_Sync_Queue::discard( $post_id, $target_id );
		return array( 'discarded' => true, 'post_id' => $post_id, 'target_id' => $target_id );
	}

}
