<?php
/**
 * funnelkit-automations-read and funnelkit-automations-write: FunnelKit Automations
 * (formerly Autonami) automations, contacts, tags, lists, broadcasts and settings.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_FunnelKit_Automations {

	/** @var string[] */
	private $ability_names = array();

	/** @var EMCP_Tools_FunnelKit_Automations_Tool[] mode => tool */
	private $tools = array();

	public static function automations_active(): bool {
		return defined( 'BWFAN_VERSION' ) && class_exists( 'BWFAN_Core' );
	}

	/** @return string[] */
	public function get_ability_names(): array {
		return $this->ability_names;
	}

	public function check_permission(): bool {
		return current_user_can( 'manage_options' );
	}

	private function tool( string $mode ): EMCP_Tools_FunnelKit_Automations_Tool {
		return $this->tools[ $mode ] ?? ( $this->tools[ $mode ] = new EMCP_Tools_FunnelKit_Automations_Tool( $mode ) );
	}

	/** @param mixed $input */
	public function run_read( $input ) {
		return $this->tool( 'read' )->run( $input );
	}

	/** @param mixed $input */
	public function run_write( $input ) {
		return $this->tool( 'write' )->run( $input );
	}

	public function register(): void {
		if ( ! ( function_exists( 'emcp_tools_fs' ) && emcp_tools_fs()->can_use_premium_code() ) ) {
			return;
		}
		$schema = static function ( string $what ): array {
			return array(
				'type'       => 'object',
				'properties' => array(
					'operation' => array( 'type' => 'string', 'description' => $what ),
					'arguments' => array( 'type' => 'object', 'description' => __( 'Arguments for the operation, plus confirm and dry_run where listed.', 'emcp-tools' ) ),
				),
			);
		};
		$tools = array(
			'emcp-tools/funnelkit-automations-read'  => array(
				'label'       => __( 'FunnelKit Automations Read', 'emcp-tools' ),
				'description' => __( 'Read FunnelKit Automations: automations and their stats, contacts (compact rows), tags, lists, fields, audiences, broadcasts, templates, form feeds, link triggers, carts, email reports and allowlisted settings. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_read',
				'operation'   => __( 'The read operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
			),
			'emcp-tools/funnelkit-automations-write' => array(
				'label'       => __( 'FunnelKit Automations Write', 'emcp-tools' ),
				'description' => __( 'Create and change FunnelKit Automations automations, contacts, tags, lists, fields, broadcasts, templates and settings. Disabled by default; enable under Neo EMCP > Tools > Plugins > FunnelKit. Deletes and anything that sends messages need confirm:true; creates and updates accept dry_run:true. Every write is recorded in History; the operation list says which ones cannot be undone. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_write',
				'operation'   => __( 'The write operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => false, 'destructive' => true, 'idempotent' => false ),
			),
		);
		foreach ( $tools as $name => $t ) {
			$this->ability_names[] = $name;
			emcp_tools_register_ability(
				$name,
				array(
					'label'               => $t['label'],
					'description'         => $t['description'],
					'category'            => 'emcp-tools',
					'execute_callback'    => array( $this, $t['callback'] ),
					'permission_callback' => array( $this, 'check_permission' ),
					'input_schema'        => $schema( $t['operation'] ),
					'meta'                => array(
						'annotations'  => $t['annotations'],
						'show_in_rest' => true,
					),
				)
			);
		}
	}
}

/** One of the two Automations dispatchers. @since 3.19.0 */
class EMCP_Tools_FunnelKit_Automations_Tool extends EMCP_Tools_FunnelKit_Dispatcher {

	/**
	 * Settings keys the tools may read and write (spec 4.5: sender, reply-to, unsubscribe and
	 * compliance texts, tracking and cart abandonment), all present in the live option. Service,
	 * credential, licence and connector keys stay out.
	 */
	const SETTINGS_ALLOWLIST = array(
		'bwfan_email_from_name',
		'bwfan_email_from',
		'bwfan_email_reply_to',
		'bwfan_unsubscribe_page',
		'bwfan_unsubscribe_data_success',
		'bwfan_unsubscribe_email_label',
		'bwfan_unsubscribe_button_text',
		'bwfan_email_footer_setting',
		'bwfan_user_consent',
		'bwfan_user_consent_message',
		'bwfan_ab_enable',
		'bwfan_ab_init_wait_time',
		'bwfan_ab_exclude_users_cart_tracking',
		'bwfan_ab_mark_lost_cart',
		'bwfan_ab_email_consent',
		'bwfan_ab_email_consent_message',
		'bwfan_order_tracking_conversion',
	);

	/** Completion status of a contact export (BWFCRM_Exporter::$EXPORT_SUCCESS). */
	const EXPORT_SUCCESS = 3;

	/** Fields a compact contact row keeps; names, phone numbers and addresses stay out. */
	const CONTACT_FIELDS = array( 'id', 'email', 'status' );

	/** @var string read or write */
	private $mode;

	public function __construct( string $mode ) {
		$this->mode = 'write' === $mode ? 'write' : 'read';
	}

	protected function tool_mode(): string {
		return $this->mode;
	}

	protected function operations(): array {
		$file = __DIR__ . '/ops/automations-' . $this->mode . '.php';
		return is_readable( $file ) ? require $file : array();
	}

	/** GET a read route and unwrap its data. @return array|WP_Error */
	private function fetch( array $op, string $route, array $params ) {
		return $this->rest()->request( (string) $op['method'], $route, $params );
	}

	/** Contact listings as compact rows: id, email, status (when sent), tags and lists as {id, name}. */
	protected function op_compact_contacts( string $name, array $op, array $args, string $route, array $params ) {
		$data = $this->fetch( $op, $route, $params );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$rows = $data;
		foreach ( array( 'contacts', 'recipients', 'data' ) as $key ) {
			if ( is_array( $data ) && isset( $data[ $key ] ) && is_array( $data[ $key ] ) ) {
				$rows = $data[ $key ];
				break;
			}
		}
		$out = array();
		foreach ( is_array( $rows ) ? $rows : array() as $row ) {
			if ( ! is_array( $row ) ) {
				continue;
			}
			$compact = array();
			foreach ( self::CONTACT_FIELDS as $f ) {
				if ( array_key_exists( $f, $row ) ) {
					$compact[ $f ] = 'id' === $f ? (int) $row[ $f ] : $row[ $f ];
				}
			}
			foreach ( array( 'tags', 'lists' ) as $f ) {
				if ( isset( $row[ $f ] ) && is_array( $row[ $f ] ) ) {
					$compact[ $f ] = array_values(
						array_map(
							static fn( $t ) => is_array( $t ) ? array( 'id' => (int) ( $t['ID'] ?? $t['id'] ?? 0 ), 'name' => (string) ( $t['name'] ?? '' ) ) : array( 'id' => (int) $t, 'name' => '' ),
							$row[ $f ]
						)
					);
				}
			}
			$out[] = $compact;
		}
		return array( 'operation' => $name, 'result' => array( 'contacts' => $out, 'count' => count( $out ) ) );
	}

	/** Settings through the allowlist only. */
	protected function op_read_settings( string $name, array $op, array $args, string $route, array $params ) {
		$data = $this->fetch( $op, $route, $params );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$values = is_array( $data['values'] ?? null ) ? $data['values'] : ( is_array( $data ) ? $data : array() );
		return array( 'operation' => $name, 'result' => array( 'settings' => array_intersect_key( $values, array_flip( self::SETTINGS_ALLOWLIST ) ) ) );
	}

	protected function op_export_inline( string $name, array $op, array $args, string $route, array $params ) {
		$data = $this->fetch( $op, $route, $params );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		// Template exports arrive as a JSON string; hand back the list import-templates takes.
		if ( is_string( $data ) && is_array( json_decode( $data, true ) ) ) {
			$data = json_decode( $data, true );
		}
		$data = self::cap_payload( $data );
		return is_wp_error( $data ) ? $data : array( 'operation' => $name, 'result' => $data );
	}

	/** Carts by state: one of the three cart routes. */
	protected function op_list_carts( string $name, array $op, array $args, string $route, array $params ) {
		unset( $params['state'] );
		$data = $this->rest()->request( 'GET', '/autonami-app/carts/' . $args['state'], $params );
		return is_wp_error( $data ) ? $data : array( 'operation' => $name, 'result' => $data );
	}

	/**
	 * Tag or list IDs for a contact. Only existing IDs: FunnelKit creates a term for any name (and
	 * for an unknown ID's value), which would sit outside the contact's undo. Assign sends
	 * {id, value: ''} items (an empty value is never created); remove sends plain IDs.
	 */
	protected function op_term_ids( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		$key = (string) $op['terms'];
		$ids = array();
		foreach ( (array) $args[ $key ] as $item ) {
			$id = is_array( $item ) ? ( $item['id'] ?? $item['ID'] ?? 0 ) : $item;
			if ( ! ( is_int( $id ) || ( is_string( $id ) && ctype_digit( $id ) ) ) || (int) $id < 1 ) {
				/* translators: %s: tags or lists. */
				return new WP_Error( 'invalid_argument', sprintf( __( 'Pass existing %s by ID (list-tags, list-lists). Create new ones with create-tags or create-list first.', 'emcp-tools' ), $key ) );
			}
			$ids[] = (int) $id;
		}
		$ids            = array_values( array_unique( $ids ) );
		$params[ $key ] = 'DELETE' === $op['method'] ? $ids : array_map( static fn( $id ) => array( 'id' => $id, 'value' => '' ), $ids );
		if ( $dry_run ) {
			return $this->dry_run_answer( $name, $op, $route, $params, array() );
		}
		return $this->execute( $name, $op, $route, $params, $args );
	}

	/** delete-automations: one request, an audit entry, and on dry_run the contact runs each automation would lose. */
	protected function op_delete_automations( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		$ids = array_values( array_unique( array_filter( array_map( 'absint', (array) $args['automation_ids'] ) ) ) );
		if ( ! $ids ) {
			return new WP_Error( 'invalid_argument', __( 'Pass at least one automation ID.', 'emcp-tools' ) );
		}
		$params['automation_ids'] = $ids;
		if ( $dry_run ) {
			$runs = array();
			foreach ( $ids as $id ) {
				$stats       = $this->rest()->request( 'GET', '/autonami-app/automations-stats/' . $id );
				$runs[ $id ] = is_wp_error( $stats ) ? null : $stats;
			}
			return $this->dry_run_answer( $name, $op, $route, $params, array( 'preflight' => array( 'contact_runs' => $runs ) ) );
		}
		return $this->execute( $name, $op, $route, $params, $args );
	}

	/** Event rules, after checking the event against list-events. */
	protected function op_event_rules( string $name, array $op, array $args, string $route, array $params ) {
		$events = $this->rest()->request( 'GET', '/autonami-app/events', array() );
		if ( is_wp_error( $events ) ) {
			return $events;
		}
		$slugs = array();
		foreach ( (array) $events as $group ) {
			foreach ( (array) ( is_array( $group ) ? ( $group['events'] ?? array() ) : array() ) as $list ) {
				foreach ( (array) $list as $slug => $event ) {
					$slugs[] = (string) ( is_array( $event ) && isset( $event['slug'] ) ? $event['slug'] : $slug );
				}
			}
		}
		if ( ! in_array( $args['event'], $slugs, true ) ) {
			/* translators: %s: event slug. */
			return new WP_Error( 'invalid_argument', sprintf( __( 'Unknown event "%s". Call list-events for the event slugs.', 'emcp-tools' ), $args['event'] ) );
		}
		$data = $this->fetch( $op, $route, $params );
		return is_wp_error( $data ) ? $data : array( 'operation' => $name, 'result' => $data );
	}

	/** Broadcast send or schedule: step 4 with a schedule time; dry_run reports the recipient count. */
	protected function op_send_broadcast( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		$current = $this->rest()->request( 'GET', $route );
		if ( is_wp_error( $current ) ) {
			return $current;
		}
		$time   = 'send-broadcast' === $name ? current_time( 'mysql' ) : (string) $args['schedule_time'];
		$params = array( 'step' => 4, 'data' => array( 'schedule_time' => $time ) );
		if ( $dry_run ) {
			return $this->dry_run_answer( $name, $op, $route, $params, array( 'preflight' => array( 'recipients' => (int) ( $current['count'] ?? 0 ), 'schedule_time' => $time ) ) );
		}
		return $this->execute( $name, $op, $route, $params, $args );
	}

	/**
	 * Allowlisted settings, merged into the stored option: save_settings replaces the whole option,
	 * so every other key goes back as stored. The option is read through Rows, as History reads it.
	 */
	protected function op_update_settings( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		$extra = array_diff( array_keys( (array) $args['settings'] ), self::SETTINGS_ALLOWLIST );
		if ( $extra ) {
			/* translators: %s: setting keys. */
			return new WP_Error( 'argument_not_allowed', sprintf( __( 'These settings cannot be changed through EMCP: %s.', 'emcp-tools' ), implode( ', ', $extra ) ) );
		}
		$stored = EMCP_Tools_FunnelKit_Rows::get()->option( 'bwfan_global_settings', false );
		$stored = is_array( $stored['value'] ) ? $stored['value'] : array();
		if ( $dry_run ) {
			$changes = array();
			foreach ( (array) $args['settings'] as $key => $value ) {
				$changes[ $key ] = array(
					'from' => $stored[ $key ] ?? null,
					'to'   => $value,
				);
			}
			return $this->dry_run_answer( $name, $op, $route, array( 'changes' => $changes ), array() );
		}
		$out = $this->execute( $name, $op, $route, array( 'bwfan_global_settings' => array_merge( $stored, (array) $args['settings'] ) ), $args );
		if ( is_array( $out ) && array_key_exists( 'result', $out ) ) {
			// save_settings answers with the whole option; only allowlisted keys go back to the agent.
			$values        = is_array( $out['result']['values'] ?? null ) ? $out['result']['values'] : array();
			$out['result'] = array( 'settings' => array_intersect_key( $values, array_flip( self::SETTINGS_ALLOWLIST ) ) );
		}
		return $out;
	}

	protected function op_send_test_email( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		if ( ! is_email( (string) $args['email'] ) ) {
			return new WP_Error( 'invalid_argument', __( 'email must be one valid address.', 'emcp-tools' ) );
		}
		return $dry_run ? $this->dry_run_answer( $name, $op, $route, $params, array() ) : $this->execute( $name, $op, $route, $params, $args );
	}

	/** Transactional mail type, checked against list-transactional-mails before sending. */
	protected function op_transactional_mail( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		$mails = $this->rest()->request( 'GET', '/autonami-app/transactional-mails' );
		if ( is_wp_error( $mails ) ) {
			return $mails;
		}
		$types = array();
		foreach ( (array) $mails as $key => $mail ) {
			$types[] = (string) ( is_array( $mail ) && isset( $mail['type'] ) ? $mail['type'] : $key );
		}
		if ( ! in_array( (string) $args['type'], $types, true ) ) {
			/* translators: %s: mail type. */
			return new WP_Error( 'invalid_argument', sprintf( __( 'Unknown transactional mail "%s". Call list-transactional-mails for the types.', 'emcp-tools' ), $args['type'] ) );
		}
		return $dry_run ? $this->dry_run_answer( $name, $op, $route, $params, array() ) : $this->execute( $name, $op, $route, $params, $args );
	}

	/** Start or stop a bulk action; dry_run reports how many contacts it matches. */
	protected function op_run_bulk_action( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		if ( $dry_run ) {
			$action = $this->rest()->request( 'GET', '/autonami-app/bulk-action/' . (int) $args['bulk_action_id'] );
			if ( is_wp_error( $action ) ) {
				return $action;
			}
			return $this->dry_run_answer( $name, $op, $route, $params, array( 'preflight' => array( 'matched_contacts' => (int) ( $action['count'] ?? 0 ) ) ) );
		}
		return $this->execute( $name, $op, $route, $params, $args );
	}

	/**
	 * import-automations: import_automation() accepts only a real HTTP upload (is_uploaded_file),
	 * so EMCP calls BWFAN_Core()->automations->import() as that handler does, one automation per call.
	 */
	protected function op_import_automation( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		$data = (array) $args['data'];
		if ( 1 !== count( $data ) ) {
			return new WP_Error( 'invalid_argument', __( 'Import one automation per call, so History can undo exactly what it created.', 'emcp-tools' ) );
		}
		$data = self::cap_payload( $data );
		if ( is_wp_error( $data ) ) {
			return $data;
		}
		$version = (int) ( $args['version'] ?? 0 );
		if ( $dry_run ) {
			return $this->dry_run_answer( $name, $op, $route, array( 'version' => $version, 'automations' => 1 ), array() );
		}
		$history = $this->history();
		$ticket  = $history ? $history->before( $name, (array) $op['history'], $args ) : null;
		if ( is_wp_error( $ticket ) ) {
			return $ticket;
		}
		$id = $this->import_automation_natively( $data, $version );
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		if ( ! is_numeric( $id ) || (int) $id < 1 ) {
			$found = is_array( $id ) && isset( $id['version'] ) ? (string) $id['version'] : '';
			if ( '' !== $found ) {
				/* translators: %s: automation version found in the file. */
				return new WP_Error( 'funnelkit_refused', sprintf( __( 'FunnelKit could not import this automation (file version %s). Pass the version export-automations used, or leave it out.', 'emcp-tools' ), $found ) );
			}
			return new WP_Error( 'funnelkit_refused', __( 'FunnelKit could not import this automation.', 'emcp-tools' ) );
		}
		$result = array( 'automation_id' => (int) $id );
		$out    = array(
			'operation' => $name,
			'result'    => $result,
		);
		if ( $history && is_array( $ticket ) ) {
			$out['change'] = $history->after( $ticket, $name, (array) $op['history'], $args, $result );
		}
		return $out;
	}

	/** @return mixed Automation ID, an array with 'version' on a version mismatch, or false. */
	protected function import_automation_natively( array $data, int $version ) {
		if ( ! function_exists( 'BWFAN_Core' ) || ! is_object( BWFAN_Core()->automations ?? null ) ) {
			return new WP_Error( 'funnelkit_loader_unavailable', __( 'FunnelKit Automations is not loaded.', 'emcp-tools' ) );
		}
		return BWFAN_Core()->automations->import( $data, '', array(), false, $version );
	}

	/** Contact export: start, wait, then read the file from FunnelKit's export folder. Personal data, so confirm is required. */
	protected function op_export_contacts( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		if ( $dry_run ) {
			return $this->dry_run_answer( $name, $op, $route, $params, array() );
		}
		$started = $this->execute( $name, $op, $route, $params, $args ); // Records the audit entry.
		if ( is_wp_error( $started ) ) {
			return $started;
		}
		$export_id = (int) ( $started['result']['id'] ?? $started['result']['export_id'] ?? 0 );
		if ( $export_id <= 0 ) {
			return new WP_Error( 'funnelkit_error', __( 'FunnelKit did not return an export ID.', 'emcp-tools' ) );
		}
		$rest = $this->rest();
		$done = $this->poll(
			'get-contact-export',
			array( 'export_id' => $export_id ),
			static function () use ( $rest, $export_id ) {
				// Each status read also runs a slice of the export (get_export_data runs the action).
				$s = $rest->request( 'GET', '/autonami-app/contact/export/' . $export_id );
				return ( is_array( $s ) && self::export_finished( $s ) ) ? $s : false;
			}
		);
		if ( ! empty( $done['pending'] ) ) {
			return array(
				'operation' => $name,
				'pending'   => $done,
				'change'    => $started['change'] ?? null,
			);
		}
		$csv = self::read_export_file( $export_id );
		if ( is_wp_error( $csv ) ) {
			return $csv;
		}
		return array(
			'operation' => $name,
			'result'    => array( 'export_id' => $export_id, 'csv' => $csv ),
			'change'    => $started['change'] ?? null,
		);
	}

	/** Collect a finished contact export (one status check, no waiting); pending while FunnelKit is still writing it. */
	protected function op_get_contact_export( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		$export_id = (int) $args['export_id'];
		$status    = $this->rest()->request( 'GET', $route );
		if ( is_wp_error( $status ) ) {
			return $status;
		}
		if ( ! is_array( $status ) || ! self::export_finished( $status ) ) {
			return array(
				'operation' => $name,
				'pending'   => array( 'pending' => true, 'status_operation' => 'get-contact-export', 'arguments' => array( 'export_id' => $export_id ) ),
			);
		}
		$csv = self::read_export_file( $export_id );
		if ( is_wp_error( $csv ) ) {
			return $csv;
		}
		$history = $this->history();
		$change  = $history ? $history->after( $history->before( $name, (array) $op['history'], $args ), $name, (array) $op['history'], $args, array( 'export_id' => $export_id ) ) : null;
		return array(
			'operation' => $name,
			'result'    => array( 'export_id' => $export_id, 'csv' => $csv ),
			'change'    => $change,
		);
	}

	/** get_export_data() answers the export row; status 3 is BWFCRM_Exporter::$EXPORT_SUCCESS. */
	private static function export_finished( array $status ): bool {
		return self::EXPORT_SUCCESS === (int) ( $status['status'] ?? 0 );
	}

	/**
	 * Read a finished contact export, located as FunnelKit's download handler locates it
	 * (basename of the stored file, in BWFCRM_EXPORT_DIR or its backup), bounded, without streaming.
	 *
	 * @return string|WP_Error
	 */
	public static function read_export_file( int $export_id ) {
		if ( ! class_exists( 'BWFAN_Model_Import_Export' ) || ! defined( 'BWFCRM_EXPORT_DIR' ) ) {
			return new WP_Error( 'funnelkit_loader_unavailable', __( 'FunnelKit Automations Pro is not loaded.', 'emcp-tools' ) );
		}
		$export = BWFAN_Model_Import_Export::get( $export_id );
		$meta   = is_array( $export ) ? json_decode( (string) ( $export['meta'] ?? '' ), true ) : null;
		if ( ! is_array( $meta ) || empty( $meta['file'] ) ) {
			return new WP_Error( 'export_not_ready', __( 'The export file is not ready yet.', 'emcp-tools' ) );
		}
		$file = basename( (string) $meta['file'] );
		$dirs = array( BWFCRM_EXPORT_DIR );
		if ( defined( 'BWFCRM_EXPORT_DIR_BACKUP' ) ) {
			$dirs[] = BWFCRM_EXPORT_DIR_BACKUP;
		}
		foreach ( $dirs as $dir ) {
			$base = realpath( $dir );
			$path = realpath( $dir . '/' . $file );
			if ( false === $base || false === $path || ! is_file( $path ) ) {
				continue;
			}
			if ( 0 !== strpos( wp_normalize_path( $path ), trailingslashit( wp_normalize_path( $base ) ) ) ) {
				continue; // A symlink out of the export folder.
			}
			$size = filesize( $path );
			if ( false === $size ) {
				return new WP_Error( 'export_unreadable', __( 'The export file could not be read.', 'emcp-tools' ) );
			}
			if ( $size > EMCP_Tools_FunnelKit_Rest::MAX_BYTES ) {
				/* translators: 1: size in bytes, 2: limit in bytes. */
				return new WP_Error( 'payload_too_large', sprintf( __( 'The export is %1$d bytes, over the %2$d byte limit for one call. Download it from FunnelKit > Contacts > Export.', 'emcp-tools' ), $size, EMCP_Tools_FunnelKit_Rest::MAX_BYTES ) );
			}
			$data = file_get_contents( $path ); // phpcs:ignore WordPress.WP.AlternativeFunctions
			return false === $data ? new WP_Error( 'export_unreadable', __( 'The export file could not be read.', 'emcp-tools' ) ) : $data;
		}
		return new WP_Error( 'export_not_found', __( 'The export file was not found.', 'emcp-tools' ) );
	}
}
