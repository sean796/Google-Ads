<?php
/**
 * MailPoet integration: the mailpoet-read and mailpoet-write dispatcher tools. Operation rows live
 * in ops/mailpoet-read.php and ops/mailpoet-write.php; each names MailPoet's capability for its
 * domain (D4) and its handler. Every MailPoet call goes through EMCP_Tools_MailPoet_Api; every write
 * goes through EMCP_Tools_MailPoet_Writer.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'EMCP_Tools_Op_Args' ) ) {
	require_once dirname( __DIR__ ) . '/class-op-args.php';
}

/** @since 3.19.0 */
class EMCP_Tools_MailPoet_Integration {

	const CAPS = array( 'mailpoet_access_plugin_admin', 'mailpoet_manage_subscribers', 'mailpoet_manage_segments', 'mailpoet_manage_emails', 'mailpoet_manage_automations', 'mailpoet_manage_forms' );

	/** @var EMCP_Tools_MailPoet_Api|null Test seam. */
	private static $api_override = null;

	/** @var string[] */
	private $ability_names = array();

	public static function use_api( ?EMCP_Tools_MailPoet_Api $api ): void {
		self::$api_override = $api;
	}

	public static function mailpoet_active(): bool {
		return defined( 'MAILPOET_VERSION' ) && class_exists( '\MailPoet\API\MP\v1\API' );
	}

	public static function shared_api(): EMCP_Tools_MailPoet_Api {
		return self::$api_override ? self::$api_override : new EMCP_Tools_MailPoet_Api();
	}

	protected function api(): EMCP_Tools_MailPoet_Api {
		return self::shared_api();
	}

	/** @return string[] */
	public function get_ability_names(): array {
		return $this->ability_names;
	}

	public function check_read_permission(): bool {
		foreach ( self::CAPS as $cap ) {
			if ( $this->api()->can( $cap ) ) {
				return true;
			}
		}
		return false;
	}

	public function check_write_permission(): bool {
		foreach ( array_slice( self::CAPS, 1 ) as $cap ) {
			if ( $this->api()->can( $cap ) ) {
				return true;
			}
		}
		return false;
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
					'arguments' => array( 'type' => 'object', 'description' => __( 'Arguments for the operation, plus confirm where listed.', 'emcp-tools' ) ),
				),
			);
		};
		$tools = array(
			'emcp-tools/mailpoet-read'  => array(
				'label'       => __( 'MailPoet Read', 'emcp-tools' ),
				'description' => __( 'Read MailPoet: the setup, subscribers with their lists, tags and custom fields, the list, tag and custom field registries, newsletters with their content, schedule and statistics, the live recipient count of a send, automations and forms. Every answer carries the version writes need. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_read',
				'permission'  => 'check_read_permission',
				'operation'   => __( 'The read operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
			),
			'emcp-tools/mailpoet-write' => array(
				'label'       => __( 'MailPoet Write', 'emcp-tools' ),
				'description' => __( 'Run MailPoet: add, change, unsubscribe and erase subscribers, import and tag them in batches, manage lists, tags and custom fields, write newsletters in the block email editor, send tests to yourself, send, schedule, unschedule, pause or resume newsletters, and switch automations on or off. Only the fields you pass change; every write to an existing object needs the version from its read. No automation or welcome email runs unless run_automations:true, and nothing is emailed without confirm:true. Disabled by default; enable under Neo EMCP > Tools > Plugins > MailPoet. Most writes can be undone in History. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_write',
				'permission'  => 'check_write_permission',
				'operation'   => __( 'The write operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => false, 'destructive' => true, 'idempotent' => false ),
			),
		);
		if ( ! $this->api()->supported() ) {
			unset( $tools['emcp-tools/mailpoet-write'] );
		}
		foreach ( $tools as $name => $t ) {
			$this->ability_names[] = $name;
			emcp_tools_register_ability(
				$name,
				array(
					'label'               => $t['label'],
					'description'         => $t['description'],
					'category'            => 'emcp-tools',
					'execute_callback'    => array( $this, $t['callback'] ),
					'permission_callback' => array( $this, $t['permission'] ),
					'input_schema'        => $schema( $t['operation'] ),
					'meta'                => array(
						'annotations'  => $t['annotations'],
						'show_in_rest' => true,
					),
				)
			);
		}
	}

	/** @return array|WP_Error */
	public function run_read( $input ) {
		return $this->run( 'read', $input );
	}

	/** @return array|WP_Error */
	public function run_write( $input ) {
		return $this->run( 'write', $input );
	}

	/** @return array<string,array> */
	protected function operations( string $mode ): array {
		$ops = (array) require __DIR__ . '/ops/mailpoet-' . $mode . '.php';
		if ( ! $this->api()->supported() ) {
			$ops = 'read' === $mode ? array_intersect_key( $ops, array( 'get-setup' => 1 ) ) : array();
		}
		return $ops;
	}

	/** @return array */
	public function catalog( string $mode ): array {
		$ops = array();
		foreach ( $this->operations( $mode ) as $name => $op ) {
			$args     = array();
			$required = array();
			foreach ( (array) $op['args'] as $arg => $type ) {
				$args[ $arg ] = rtrim( (string) $type, '!' );
				if ( '!' === substr( (string) $type, -1 ) ) {
					$required[] = $arg;
				}
			}
			$ops[] = array(
				'name'        => $name,
				'arguments'   => $args,
				'required'    => $required,
				'confirm'     => ! empty( $op['confirm'] ),
				'undo'        => 'write' === $mode ? (string) ( $op['undo'] ?? 'undoable' ) : 'read-only',
				'description' => $op['desc'],
			);
		}
		return array( 'mode' => $mode, 'operations' => $ops );
	}

	/** @return array|WP_Error */
	protected function run( string $mode, $input ) {
		$name = is_array( $input ) && isset( $input['operation'] ) ? str_replace( '_', '-', sanitize_key( (string) $input['operation'] ) ) : '';
		if ( '' === $name ) {
			return $this->catalog( $mode );
		}
		$api = $this->api();
		if ( ! $api->active() ) {
			return new WP_Error( 'mailpoet_inactive', __( 'MailPoet is not active.', 'emcp-tools' ) );
		}
		$ops = $this->operations( $mode );
		if ( ! isset( $ops[ $name ] ) ) {
			if ( ! $api->supported() ) {
				/* translators: %s: MailPoet version. */
				return new WP_Error( 'mailpoet_unsupported_version', sprintf( __( 'This version of MailPoet (%s) is not supported yet; EMCP works with MailPoet 5.x.', 'emcp-tools' ), $api->version_string() ) );
			}
			/* translators: %s: operation name. */
			return new WP_Error( 'unknown_operation', sprintf( __( 'Unknown operation "%s". Call the tool with no operation to list the available operations.', 'emcp-tools' ), $name ) );
		}
		$op   = $ops[ $name ];
		$args = is_array( $input ) && isset( $input['arguments'] ) && is_array( $input['arguments'] ) ? $input['arguments'] : array();

		$confirmed = array_key_exists( 'confirm', $args ) && true === $args['confirm'];
		unset( $args['confirm'] );

		// D4: the domain's capability first, before anything else.
		if ( ! $api->can( (string) $op['cap'] ) ) {
			return self::forbidden( (string) $op['cap'] );
		}
		$clean = EMCP_Tools_Op_Args::validate( (array) $op['args'], $args );
		if ( is_wp_error( $clean ) ) {
			return $clean;
		}
		foreach ( (array) ( $op['nullable'] ?? array() ) as $key ) {
			if ( array_key_exists( $key, $args ) && null === $args[ $key ] ) {
				$clean[ $key ] = '';
			}
		}
		if ( ! method_exists( $this, $op['run'] ) ) {
			return new WP_Error( 'not_ready', __( 'This operation is not available yet.', 'emcp-tools' ) );
		}
		if ( ! empty( $op['confirm'] ) && ! $confirmed ) {
			return self::confirm_required();
		}
		return call_user_func( array( $this, $op['run'] ), $clean, $op, $confirmed );
	}

	public static function confirm_required(): WP_Error {
		return new WP_Error( 'confirmation_required', __( 'This operation deletes something, sends email or starts something. Pass confirm:true in arguments to proceed.', 'emcp-tools' ) );
	}

	public static function forbidden( string $cap ): WP_Error {
		/* translators: %s: MailPoet capability. */
		return new WP_Error( 'forbidden', sprintf( __( 'MailPoet does not allow you to do this (it needs %s).', 'emcp-tools' ), $cap ), array( 'status' => 403 ) );
	}

	protected function writer(): EMCP_Tools_MailPoet_Writer {
		return new EMCP_Tools_MailPoet_Writer( $this->api() );
	}

	// Subscribers (spec 4.2).

	/** @return array|WP_Error */
	public function op_create_subscriber( array $a, array $op = array(), bool $confirmed = false ) {
		return $this->writer()->create_subscriber( $a, $confirmed );
	}

	/** @return array|WP_Error */
	public function op_update_subscriber( array $a ) {
		return $this->writer()->update_subscriber( (int) $a['subscriber_id'], $a['version'] ?? null, ! empty( $a['force'] ), $a );
	}

	/** @return array|WP_Error */
	public function op_set_subscriber_status( array $a, array $op = array(), bool $confirmed = false ) {
		return $this->writer()->set_subscriber_status( (int) $a['subscriber_id'], $a['version'] ?? null, ! empty( $a['force'] ), (string) $a['status'], $confirmed, ! empty( $a['run_automations'] ) );
	}

	/** @return array|WP_Error */
	public function op_send_confirmation_email( array $a ) {
		return $this->writer()->send_confirmation_email( (int) $a['subscriber_id'] );
	}

	// Batches, lists and tags (spec 4.2).

	/** @return array|WP_Error */
	public function op_import_subscribers( array $a ) {
		return $this->writer()->import_subscribers( (array) $a['subscribers'], (string) ( $a['if_exists'] ?? 'merge' ), ! empty( $a['run_automations'] ) );
	}

	/** @return array|WP_Error */
	public function op_tag_subscribers( array $a ) {
		return $this->writer()->tag_subscribers( $a );
	}

	public function op_create_list( array $a ) {
		return $this->writer()->create_segment( 'list', $a );
	}

	public function op_update_list( array $a ) {
		return $this->writer()->update_segment( 'list', (int) $a['list_id'], $a['version'] ?? null, ! empty( $a['force'] ), $a );
	}

	public function op_delete_list( array $a ) {
		return $this->writer()->delete_segment( 'list', (int) $a['list_id'], $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	public function op_create_tag( array $a ) {
		return $this->writer()->create_segment( 'tag', $a );
	}

	public function op_update_tag( array $a ) {
		return $this->writer()->update_segment( 'tag', (int) $a['tag_id'], $a['version'] ?? null, ! empty( $a['force'] ), $a );
	}

	public function op_delete_tag( array $a ) {
		return $this->writer()->delete_segment( 'tag', (int) $a['tag_id'], $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	/** One list's view (as list-lists gives it). */
	public function list_view( int $id ): ?array {
		foreach ( $this->op_list_lists( array() )['items'] as $l ) {
			if ( $l['id'] === $id ) {
				return $l;
			}
		}
		return null;
	}

	/** One tag's view (as list-tags gives it). */
	public function tag_view( int $id ): ?array {
		foreach ( $this->op_list_tags( array() )['items'] as $t ) {
			if ( $t['id'] === $id ) {
				return $t;
			}
		}
		return null;
	}

	// Custom fields (spec 4.2).

	public function op_add_custom_field( array $a ) {
		return $this->writer()->add_custom_field( $a, $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	public function op_update_custom_field( array $a ) {
		return $this->writer()->update_custom_field( (int) $a['field_id'], $a['version'] ?? null, ! empty( $a['force'] ), $a );
	}

	// Newsletters and sending (spec 4.2).

	public function op_create_newsletter( array $a ) {
		return $this->writer()->create_newsletter( $a );
	}

	public function op_update_newsletter( array $a ) {
		return $this->writer()->update_newsletter( (int) $a['newsletter_id'], $a['version'] ?? null, ! empty( $a['force'] ), $a );
	}

	public function op_duplicate_newsletter( array $a ) {
		return $this->writer()->duplicate_newsletter( (int) $a['newsletter_id'] );
	}

	public function op_delete_newsletter( array $a ) {
		return $this->writer()->delete_newsletter( (int) $a['newsletter_id'], $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	public function op_send_test_email( array $a ) {
		return $this->writer()->send_test_email( (int) $a['newsletter_id'] );
	}

	public function op_send_newsletter( array $a ) {
		return $this->writer()->send_newsletter( (int) $a['newsletter_id'], $a['version'] ?? null, ! empty( $a['force'] ), isset( $a['scheduled_at'] ) ? (string) $a['scheduled_at'] : null, (int) $a['expected_recipients'] );
	}

	public function op_unschedule_newsletter( array $a ) {
		return $this->writer()->unschedule_newsletter( (int) $a['newsletter_id'] );
	}

	public function op_pause_newsletter( array $a ) {
		return $this->writer()->sending_action( (int) $a['newsletter_id'], 'pause' );
	}

	public function op_resume_newsletter( array $a ) {
		return $this->writer()->sending_action( (int) $a['newsletter_id'], 'resume' );
	}

	// Automations (D18).

	public function op_set_automation_status( array $a, array $op = array(), bool $confirmed = false ) {
		return $this->writer()->set_automation_status( (int) $a['automation_id'], $a['version'] ?? null, ! empty( $a['force'] ), (string) $a['status'], $confirmed );
	}

	// Erasure (D15).

	public function op_delete_subscriber( array $a ) {
		return $this->writer()->delete_subscriber( (int) $a['subscriber_id'] );
	}

	// Views.

	private static function page( array $a ): array {
		$per  = max( 1, min( 100, (int) ( $a['per_page'] ?? 20 ) ) );
		$page = max( 1, (int) ( $a['page'] ?? 1 ) );
		return array( $page, $per, ( $page - 1 ) * $per );
	}

	/** A subscriber's compact view for lists. */
	public function subscriber_summary( array $r ): array {
		return array(
			'id'         => (int) $r['id'],
			'email'      => (string) $r['email'],
			'first_name' => (string) $r['first_name'],
			'last_name'  => (string) $r['last_name'],
			'status'     => (string) $r['status'],
			'created_at' => $r['created_at'],
			'linked'     => (int) ( $r['wp_user_id'] ?? 0 ) > 0 || (int) ( $r['is_woocommerce_user'] ?? 0 ) > 0,
			'version'    => $this->api()->version_of( 'subscriber', (int) $r['id'] ),
		);
	}

	/** @return array<int,array> custom field id => definition */
	public function field_defs(): array {
		$out = array();
		foreach ( $this->api()->find( 'mailpoet_custom_fields', array() ) as $id => $f ) {
			if ( null !== ( $f['deleted_at'] ?? null ) ) {
				continue;
			}
			$params     = maybe_unserialize( (string) $f['params'] );
			$out[ $id ] = array(
				'id'     => 'cf_' . $id,
				'name'   => (string) $f['name'],
				'type'   => (string) $f['type'],
				'params' => is_array( $params ) ? $params : array(),
			);
		}
		return $out;
	}

	/** A subscriber's full view (spec 4.1). */
	public function subscriber_view( int $id ): ?array {
		$api  = $this->api();
		$rows = $api->rows( 'subscriber', $id );
		$r    = current( $rows['mailpoet_subscribers'] );
		if ( ! $r ) {
			return null;
		}
		$lists = array();
		foreach ( $rows['mailpoet_subscriber_segment'] as $m ) {
			$seg     = $api->row( 'mailpoet_segments', (int) $m['segment_id'] );
			$lists[] = array( 'id' => (int) $m['segment_id'], 'name' => (string) ( $seg['name'] ?? '' ), 'status' => (string) $m['status'] );
		}
		$tags = array();
		foreach ( $rows['mailpoet_subscriber_tag'] as $t ) {
			$tag    = $api->row( 'mailpoet_tags', (int) $t['tag_id'] );
			$tags[] = array( 'id' => (int) $t['tag_id'], 'name' => (string) ( $tag['name'] ?? '' ) );
		}
		$defs   = $this->field_defs();
		$fields = array();
		foreach ( $rows['mailpoet_subscriber_custom_field'] as $v ) {
			$def                                         = $defs[ (int) $v['custom_field_id'] ] ?? array( 'name' => '', 'type' => '' );
			$fields[ 'cf_' . (int) $v['custom_field_id'] ] = array( 'name' => $def['name'], 'type' => $def['type'], 'value' => (string) $v['value'] );
		}
		$counts = $api->subscriber_counts( $id );
		return array(
			'id'            => (int) $r['id'],
			'email'         => (string) $r['email'],
			'first_name'    => (string) $r['first_name'],
			'last_name'     => (string) $r['last_name'],
			'status'        => (string) $r['status'],
			'source'        => (string) $r['source'],
			'created_at'    => $r['created_at'],
			'confirmed_at'  => $r['confirmed_at'],
			'wp_user_id'    => (int) ( $r['wp_user_id'] ?? 0 ),
			'woocommerce'   => (int) ( $r['is_woocommerce_user'] ?? 0 ) > 0,
			'lists'         => $lists,
			'tags'          => $tags,
			'custom_fields' => $fields,
			'emails_sent'   => $counts['emails'],
			'automation_runs' => $counts['runs'],
			'version'       => EMCP_Tools_MailPoet_Api::version( $rows ),
		);
	}

	/** @return array<string,string> a newsletter's options by name */
	public function newsletter_options( int $id ): array {
		$api   = $this->api();
		$names = array();
		foreach ( $api->find( 'mailpoet_newsletter_option_fields', array() ) as $fid => $f ) {
			$names[ $fid ] = (string) $f['name'];
		}
		$out = array();
		foreach ( $api->find( 'mailpoet_newsletter_option', array( 'newsletter_id' => $id ) ) as $o ) {
			$out[ $names[ (int) $o['option_field_id'] ] ?? (string) $o['option_field_id'] ] = (string) $o['value'];
		}
		ksort( $out );
		return $out;
	}

	/** @return int[] */
	public function newsletter_lists( int $id ): array {
		return array_values( array_map( static fn( $r ) => (int) $r['segment_id'], $this->api()->find( 'mailpoet_newsletter_segment', array( 'newsletter_id' => $id ) ) ) );
	}

	/**
	 * scheduledAt is stored in UTC (MailPoet's block editor, EmailApiController::toUtcOptionValue());
	 * answers give it in site time. A value that does not parse is given as stored, as MailPoet does.
	 */
	public static function site_time( $utc ): ?string {
		if ( null === $utc || '' === $utc ) {
			return null;
		}
		$d = DateTime::createFromFormat( '!Y-m-d H:i:s', (string) $utc, new DateTimeZone( 'UTC' ) );
		if ( ! $d || $d->format( 'Y-m-d H:i:s' ) !== (string) $utc ) {
			return (string) $utc;
		}
		return $d->setTimezone( wp_timezone() )->format( 'Y-m-d H:i:s' );
	}

	public function newsletter_view( int $id ): ?array {
		$api  = $this->api();
		$rows = $api->rows( 'newsletter', $id );
		$n    = current( $rows['mailpoet_newsletters'] );
		if ( ! $n || null !== $n['deleted_at'] ) {
			return null;
		}
		$post  = $rows['posts'] ? current( $rows['posts'] ) : null;
		$lists = array();
		foreach ( $this->newsletter_lists( $id ) as $l ) {
			$seg     = $api->row( 'mailpoet_segments', $l );
			$lists[] = array( 'id' => $l, 'name' => (string) ( $seg['name'] ?? '' ) );
		}
		$opts    = $this->newsletter_options( $id );
		$sending = array();
		$s       = $api->rows( 'sending', $id );
		foreach ( $s['mailpoet_sending_queues'] as $q ) {
			$task      = $s['mailpoet_scheduled_tasks'][ (int) $q['task_id'] ] ?? array();
			$sending[] = array( 'task_status' => $task['status'] ?? null, 'scheduled_at' => $task['scheduled_at'] ?? null, 'total' => (int) $q['count_total'], 'processed' => (int) $q['count_processed'] );
		}
		$stat = static function ( string $table ) use ( $api, $id ): int {
			return $api->count_where( $table, array( 'newsletter_id' => $id ) );
		};
		return array(
			'id'               => (int) $n['id'],
			'type'             => (string) $n['type'],
			'name'             => $post ? (string) $post['post_title'] : (string) $n['subject'],
			'subject'          => (string) $n['subject'],
			'preheader'        => (string) $n['preheader'],
			'sender_name'      => (string) $n['sender_name'],
			'sender_address'   => (string) $n['sender_address'],
			'reply_to_name'    => (string) $n['reply_to_name'],
			'reply_to_address' => (string) $n['reply_to_address'],
			'status'           => (string) $n['status'],
			'lists'            => $lists,
			'scheduled'        => '1' === ( $opts['isScheduled'] ?? '0' ),
			'scheduled_at'     => self::site_time( $opts['scheduledAt'] ?? null ),
			'editor'           => $post ? 'block' : 'legacy',
			'body'             => $post ? (string) $post['post_content'] : (string) $n['body'],
			'sent_at'          => $n['sent_at'],
			'sending'          => $sending,
			'statistics'       => array(
				'sent'         => $stat( 'mailpoet_statistics_newsletters' ),
				'opens'        => $stat( 'mailpoet_statistics_opens' ),
				'clicks'       => $stat( 'mailpoet_statistics_clicks' ),
				'unsubscribes' => $stat( 'mailpoet_statistics_unsubscribes' ),
			),
			'version'          => EMCP_Tools_MailPoet_Api::version( $rows ),
		);
	}

	/** @return string[] trigger keys */
	public function automation_triggers( int $id ): array {
		return array_values( array_map( static fn( $r ) => (string) $r['trigger_key'], $this->api()->find( 'mailpoet_automation_triggers', array( 'automation_id' => $id ) ) ) );
	}

	public function automation_view( int $id, bool $steps = false ): ?array {
		$api = $this->api();
		$a   = $api->row( 'mailpoet_automations', $id );
		if ( ! $a || null !== $a['deleted_at'] || 'trash' === $a['status'] ) {
			return null;
		}
		$runs = array();
		foreach ( $api->find( 'mailpoet_automation_runs', array( 'automation_id' => $id ) ) as $r ) {
			$runs[ (string) $r['status'] ] = ( $runs[ (string) $r['status'] ] ?? 0 ) + 1;
		}
		$out = array(
			'id'       => (int) $a['id'],
			'name'     => (string) $a['name'],
			'status'   => (string) $a['status'],
			'triggers' => $this->automation_triggers( $id ),
			'runs'     => $runs,
			'version'  => $api->version_of( 'automation', $id ),
		);
		if ( $steps ) {
			$v            = $api->find( 'mailpoet_automation_versions', array( 'automation_id' => $id ) );
			$latest       = $v ? $v[ max( array_keys( $v ) ) ] : null;
			$out['steps'] = $latest ? (array) json_decode( (string) $latest['steps'], true ) : array();
		}
		return $out;
	}

	// Read handlers.

	/** @return array|WP_Error */
	public function op_list_subscribers( array $a ) {
		list( $page, $per, $offset ) = self::page( $a );
		$f                           = array_intersect_key( $a, array_flip( array( 'search', 'status', 'list_id', 'tag_id', 'created_after', 'created_before', 'sort_by', 'sort_order' ) ) );
		$r                           = $this->api()->subscribers_page( $f + array( 'limit' => $per, 'offset' => $offset ) );
		return array(
			'items'    => array_map( array( $this, 'subscriber_summary' ), $r['rows'] ),
			'total'    => (int) $r['total'],
			'page'     => $page,
			'per_page' => $per,
			'pages'    => (int) ceil( $r['total'] / $per ),
		);
	}

	/** @return array|WP_Error */
	public function op_get_subscriber( array $a ) {
		$id = (int) ( $a['subscriber_id'] ?? 0 );
		if ( ! $id && isset( $a['email'] ) ) {
			$id = (int) $this->api()->subscriber_by_email( (string) $a['email'] );
		}
		$v = $id ? $this->subscriber_view( $id ) : null;
		return $v ? $v : self::not_found( 'subscriber' );
	}

	public static function not_found( string $what ): WP_Error {
		/* translators: %s: what was looked for. */
		return new WP_Error( 'not_found', sprintf( __( 'There is no such MailPoet %s.', 'emcp-tools' ), $what ), array( 'status' => 404 ) );
	}

	public function op_list_lists( array $a ): array {
		$api   = $this->api();
		$items = array();
		foreach ( $api->find( 'mailpoet_segments', array( 'deleted_at' => null ) ) as $id => $s ) {
			if ( 'dynamic' === (string) $s['type'] ) {
				continue;
			}
			$items[] = array(
				'id'          => (int) $id,
				'name'        => (string) $s['name'],
				'type'        => (string) $s['type'],
				'system'      => in_array( (string) $s['type'], EMCP_Tools_MailPoet_Api::SYSTEM_LISTS, true ),
				'description' => (string) $s['description'],
				'members'     => $api->count_where( 'mailpoet_subscriber_segment', array( 'segment_id' => (int) $id ) ),
				'subscribed'  => $api->count_where( 'mailpoet_subscriber_segment', array( 'segment_id' => (int) $id, 'status' => 'subscribed' ) ),
				'version'     => $api->version_of( 'list', (int) $id ),
			);
		}
		return array( 'items' => $items, 'total' => count( $items ) );
	}

	public function op_list_tags( array $a ): array {
		$api   = $this->api();
		$items = array();
		foreach ( $api->find( 'mailpoet_tags', array() ) as $id => $t ) {
			$items[] = array(
				'id'          => (int) $id,
				'name'        => (string) $t['name'],
				'description' => (string) $t['description'],
				'subscribers' => $api->count_where( 'mailpoet_subscriber_tag', array( 'tag_id' => (int) $id ) ),
				'version'     => $api->version_of( 'tag', (int) $id ),
			);
		}
		return array( 'items' => $items, 'total' => count( $items ) );
	}

	public function op_list_custom_fields( array $a ): array {
		return array( 'fields' => array_values( $this->field_defs() ), 'version' => $this->api()->version_of( 'custom_fields', 0 ) );
	}

	public function op_list_newsletters( array $a ): array {
		list( $page, $per, $offset ) = self::page( $a );
		$f                           = array_intersect_key( $a, array_flip( array( 'type', 'status', 'search' ) ) );
		$r                           = $this->api()->newsletters_page( $f + array( 'limit' => $per, 'offset' => $offset ) );
		$items                       = array();
		foreach ( $r['rows'] as $n ) {
			$items[] = array(
				'id'      => (int) $n['id'],
				'type'    => (string) $n['type'],
				'subject' => (string) $n['subject'],
				'status'  => (string) $n['status'],
				'sent_at' => $n['sent_at'],
				'editor'  => (int) ( $n['wp_post_id'] ?? 0 ) > 0 ? 'block' : 'legacy',
				'version' => $this->api()->version_of( 'newsletter', (int) $n['id'] ),
			);
		}
		return array( 'items' => $items, 'total' => (int) $r['total'], 'page' => $page, 'per_page' => $per, 'pages' => (int) ceil( $r['total'] / $per ) );
	}

	/** @return array|WP_Error */
	public function op_get_newsletter( array $a ) {
		$v = $this->newsletter_view( (int) $a['newsletter_id'] );
		return $v ? $v : self::not_found( 'newsletter' );
	}

	/** @return array|WP_Error */
	public function op_get_recipient_count( array $a ) {
		if ( isset( $a['newsletter_id'] ) ) {
			if ( ! $this->api()->row( 'mailpoet_newsletters', (int) $a['newsletter_id'] ) ) {
				return self::not_found( 'newsletter' );
			}
			$lists = $this->newsletter_lists( (int) $a['newsletter_id'] );
		} elseif ( isset( $a['list_ids'] ) ) {
			$lists = (array) $a['list_ids'];
		} else {
			return new WP_Error( 'missing_argument', __( 'Pass newsletter_id or list_ids.', 'emcp-tools' ) );
		}
		$ok = $this->api()->countable( $lists, (int) ( $a['newsletter_id'] ?? 0 ) );
		if ( is_wp_error( $ok ) ) {
			return $ok;
		}
		return array( 'list_ids' => $lists, 'count' => $this->api()->recipient_count( $lists ) );
	}

	public function op_list_automations( array $a ): array {
		$items = array();
		foreach ( array_keys( $this->api()->find( 'mailpoet_automations', array( 'deleted_at' => null ) ) ) as $id ) {
			$v = $this->automation_view( (int) $id );
			if ( $v && ( ! isset( $a['status'] ) || $v['status'] === $a['status'] ) ) {
				$items[] = $v;
			}
		}
		return array( 'items' => $items, 'total' => count( $items ) );
	}

	/** @return array|WP_Error */
	public function op_get_automation( array $a ) {
		$v = $this->automation_view( (int) $a['automation_id'], true );
		return $v ? $v : self::not_found( 'automation' );
	}

	public function op_list_forms( array $a ): array {
		$items = array();
		foreach ( $this->api()->find( 'mailpoet_forms', array( 'deleted_at' => null ) ) as $id => $f ) {
			$settings = maybe_unserialize( (string) $f['settings'] );
			$items[]  = array(
				'id'      => (int) $id,
				'name'    => (string) $f['name'],
				'status'  => (string) ( $f['status'] ?? '' ),
				'list_ids' => array_values( array_map( 'intval', (array) ( is_array( $settings ) ? ( $settings['segments'] ?? array() ) : array() ) ) ),
			);
		}
		return array( 'items' => $items, 'total' => count( $items ) );
	}

	public function op_get_setup( array $a ): array {
		$api    = $this->api();
		$writes = array();
		foreach ( (array) require __DIR__ . '/ops/mailpoet-write.php' as $name => $op ) {
			if ( $api->supported() && $api->can( (string) $op['cap'] ) ) {
				$writes[] = $name;
			}
		}
		$confirm = (array) $api->settings( 'signup_confirmation' );
		$sender  = (array) $api->settings( 'sender' );
		$reply   = (array) $api->settings( 'reply_to' );
		$mta     = (array) $api->settings( 'mta' );
		$system  = array();
		$active  = array();
		if ( $api->supported() ) {
			foreach ( $api->find( 'mailpoet_segments', array( 'type' => EMCP_Tools_MailPoet_Api::SYSTEM_LISTS, 'deleted_at' => null ) ) as $id => $s ) {
				$system[] = array( 'id' => (int) $id, 'name' => (string) $s['name'], 'type' => (string) $s['type'] );
			}
			foreach ( $api->find( 'mailpoet_automations', array( 'status' => 'active', 'deleted_at' => null ) ) as $id => $au ) {
				$active[] = array( 'id' => (int) $id, 'name' => (string) $au['name'], 'triggers' => $this->automation_triggers( (int) $id ) );
			}
		}
		$out = array(
			'version'            => $api->version_string(),
			'supported'          => $api->supported(),
			'double_optin'       => ! empty( $confirm['enabled'] ) && '0' !== (string) $confirm['enabled'],
			'sending_method'     => (string) ( $mta['method'] ?? '' ),
			'sender'             => array( 'name' => (string) ( $sender['name'] ?? '' ), 'address' => (string) ( $sender['address'] ?? '' ) ),
			'reply_to'           => array( 'name' => (string) ( $reply['name'] ?? '' ), 'address' => (string) ( $reply['address'] ?? '' ) ),
			'subscriber_limit'   => $api->supported() ? $api->subscriber_limit() : array(),
			'system_lists'       => $system,
			'active_automations' => $active,
			'write_operations'   => $writes,
			'note'               => __( 'MailPoet sends with its own mailer. EMCP holds MailPoet\'s automations and welcome emails unless run_automations:true, and sends nothing without confirm:true.', 'emcp-tools' ),
		);
		if ( $api->supported() && $api->can( 'mailpoet_manage_subscribers' ) ) {
			$out['subscribers'] = array( 'total' => $api->count_where( 'mailpoet_subscribers', array( 'deleted_at' => null ) ) );
		}
		return $out;
	}
}
