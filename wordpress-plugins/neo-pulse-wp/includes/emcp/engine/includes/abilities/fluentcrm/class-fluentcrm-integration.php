<?php
/**
 * FluentCRM integration: the fluentcrm-read and fluentcrm-write dispatcher tools. Operation rows
 * live in ops/fluentcrm-read.php and ops/fluentcrm-write.php; each names FluentCRM's permission
 * (D6), the FluentCRM ability or route it runs (D2) and its handler. Every FluentCRM call goes
 * through EMCP_Tools_FluentCRM_Api; every write goes through EMCP_Tools_FluentCRM_Writer.
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
class EMCP_Tools_FluentCRM_Integration {

	const READ_PERMS  = array( 'fcrm_view_dashboard', 'fcrm_read_contacts', 'fcrm_read_emails', 'fcrm_read_funnels', 'fcrm_manage_settings' );
	const WRITE_PERMS = array( 'fcrm_manage_contacts', 'fcrm_manage_contacts_delete', 'fcrm_manage_contact_cats', 'fcrm_manage_contact_cats_delete', 'fcrm_manage_emails', 'fcrm_manage_email_delete', 'fcrm_manage_email_templates', 'fcrm_write_funnels', 'fcrm_manage_settings' );

	/** @var EMCP_Tools_FluentCRM_Api|null Test seam. */
	private static $api_override = null;

	/** @var string[] */
	private $ability_names = array();

	public static function use_api( ?EMCP_Tools_FluentCRM_Api $api ): void {
		self::$api_override = $api;
	}

	public static function fluentcrm_active(): bool {
		return defined( 'FLUENTCRM_PLUGIN_VERSION' ) && function_exists( 'fluentCrmDb' );
	}

	public static function shared_api(): EMCP_Tools_FluentCRM_Api {
		return self::$api_override ? self::$api_override : new EMCP_Tools_FluentCRM_Api();
	}

	protected function api(): EMCP_Tools_FluentCRM_Api {
		return self::shared_api();
	}

	/** @return string[] */
	public function get_ability_names(): array {
		return $this->ability_names;
	}

	private function any_of( array $perms ): bool {
		foreach ( $perms as $p ) {
			if ( $this->api()->can( $p ) ) {
				return true;
			}
		}
		return false;
	}

	public function check_read_permission(): bool {
		return $this->any_of( self::READ_PERMS );
	}

	public function check_write_permission(): bool {
		return $this->any_of( self::WRITE_PERMS );
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
			'emcp-tools/fluentcrm-read'  => array(
				'label'       => __( 'FluentCRM Read', 'emcp-tools' ),
				'description' => __( 'Read FluentCRM: the setup, contacts with FluentCRM\'s filters, one contact with notes, email history and automations, the tag, list and custom field registries, campaigns with recipients estimates and stats, email templates, email previews, automations and the contacts in them. Every answer carries the version writes need. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_read',
				'permission'  => 'check_read_permission',
				'operation'   => __( 'The read operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
			),
			'emcp-tools/fluentcrm-write' => array(
				'label'       => __( 'FluentCRM Write', 'emcp-tools' ),
				'description' => __( 'Run FluentCRM: create, change and erase contacts, import and tag them in batches, manage tags, lists, custom fields and notes, write campaigns and templates, send tests, schedule, pause or resume campaigns, publish automations and move contacts in them. Only the fields you pass change; every write to an existing object needs the version from its read. No automation runs unless run_automations:true, and nothing is emailed without confirm:true. Disabled by default; enable under Neo EMCP > Tools > Plugins > FluentCRM. Most writes can be undone in History. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_write',
				'permission'  => 'check_write_permission',
				'operation'   => __( 'The write operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => false, 'destructive' => true, 'idempotent' => false ),
			),
		);
		if ( ! $this->api()->supported() ) {
			unset( $tools['emcp-tools/fluentcrm-write'] );
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
		$ops = (array) require __DIR__ . '/ops/fluentcrm-' . $mode . '.php';
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
			return new WP_Error( 'fluentcrm_inactive', __( 'FluentCRM is not active.', 'emcp-tools' ) );
		}
		$ops = $this->operations( $mode );
		if ( ! isset( $ops[ $name ] ) ) {
			if ( ! $api->supported() ) {
				/* translators: %s: FluentCRM version. */
				return new WP_Error( 'fluentcrm_unsupported_version', sprintf( __( 'This version of FluentCRM (%s) is not supported yet; EMCP works with FluentCRM 3.x.', 'emcp-tools' ), $api->version_string() ) );
			}
			/* translators: %s: operation name. */
			return new WP_Error( 'unknown_operation', sprintf( __( 'Unknown operation "%s". Call the tool with no operation to list the available operations.', 'emcp-tools' ), $name ) );
		}
		if ( 'get-setup' !== $name && ! $api->mcp_enabled() ) {
			return EMCP_Tools_FluentCRM_Api::mcp_disabled();
		}
		$op   = $ops[ $name ];
		$args = is_array( $input ) && isset( $input['arguments'] ) && is_array( $input['arguments'] ) ? $input['arguments'] : array();

		$confirmed = array_key_exists( 'confirm', $args ) && true === $args['confirm'];
		unset( $args['confirm'] );

		$clean = EMCP_Tools_Op_Args::validate( (array) $op['args'], $args );
		if ( is_wp_error( $clean ) ) {
			return $clean;
		}
		// An explicit null clears a field where the row allows it (Op_Args drops nulls).
		foreach ( (array) ( $op['nullable'] ?? array() ) as $key ) {
			if ( array_key_exists( $key, $args ) && null === $args[ $key ] ) {
				$clean[ $key ] = '';
			}
		}
		if ( ! $this->allows( (string) $op['cap'] ) ) {
			return self::forbidden( (string) $op['cap'] );
		}
		if ( ! method_exists( $this, $op['run'] ) ) {
			return new WP_Error( 'not_ready', __( 'This operation is not available yet.', 'emcp-tools' ) );
		}
		if ( ! empty( $op['confirm'] ) && ! $confirmed ) {
			return new WP_Error( 'confirmation_required', __( 'This operation deletes something, sends email or starts sending. Pass confirm:true in arguments to proceed.', 'emcp-tools' ) );
		}
		return call_user_func( array( $this, $op['run'] ), $clean, $op, $confirmed );
	}

	// Rules (D6).

	protected static function forbidden( string $perm = '' ): WP_Error {
		/* translators: %s: FluentCRM permission. */
		return new WP_Error( 'forbidden', '' !== $perm && 'tool' !== $perm ? sprintf( __( 'FluentCRM does not allow you to do this (it needs %s).', 'emcp-tools' ), str_replace( '+', ' and ', $perm ) ) : __( 'FluentCRM does not allow you to do this.', 'emcp-tools' ), array( 'status' => 403 ) );
	}

	/** "tool": anyone who may use the tool; otherwise every fcrm_* permission joined by +. */
	public function allows( string $rule ): bool {
		if ( 'tool' === $rule ) {
			return $this->check_read_permission() || $this->check_write_permission();
		}
		foreach ( explode( '+', $rule ) as $perm ) {
			if ( ! $this->api()->can( $perm ) ) {
				return false;
			}
		}
		return true;
	}

	// Views: FluentCRM's answers with versions (D11).

	/** Adds `version` to the answer itself when it has an id, and to each item that has one. */
	public function with_versions( string $kind, array $answer ): array {
		$api = $this->api();
		if ( isset( $answer['id'] ) && is_numeric( $answer['id'] ) ) {
			$answer['version'] = $api->version_of( $kind, (int) $answer['id'] );
		}
		if ( isset( $answer['items'] ) && is_array( $answer['items'] ) ) {
			foreach ( $answer['items'] as $i => $item ) {
				if ( is_array( $item ) && isset( $item['id'] ) && is_numeric( $item['id'] ) ) {
					$answer['items'][ $i ]['version'] = $api->version_of( $kind, (int) $item['id'] );
				}
			}
		}
		return $answer;
	}

	// Read handlers.

	/** @return array|WP_Error */
	public function op_ability_read( array $a, array $op ) {
		$r = $this->api()->ability( (string) $op['via'], $a );
		if ( is_wp_error( $r ) || empty( $op['kind'] ) ) {
			return $r;
		}
		return $this->with_versions( (string) $op['kind'], $r );
	}

	/** @return array|WP_Error */
	public function op_rest_read( array $a, array $op ) {
		list( $method, $route ) = explode( ' ', (string) $op['via'], 2 );
		$params                 = $a;
		if ( false !== strpos( $route, '{template_id}' ) ) {
			$route = str_replace( '{template_id}', (string) (int) $a['template_id'], $route );
			unset( $params['template_id'] );
		}
		$r = $this->api()->rest( $method, $route, $params );
		if ( is_wp_error( $r ) ) {
			return $r;
		}
		if ( 'custom_fields' === ( $op['kind'] ?? '' ) ) {
			$r['version'] = $this->api()->version_of( 'custom_fields', 0 );
		} elseif ( 'template' === ( $op['kind'] ?? '' ) ) {
			$r['version'] = $this->api()->version_of( 'template', (int) $a['template_id'] );
		}
		return $r;
	}

	protected function writer(): EMCP_Tools_FluentCRM_Writer {
		return new EMCP_Tools_FluentCRM_Writer( $this->api() );
	}

	// Contacts (spec 4.2).

	/** @return array|WP_Error */
	public function op_create_contact( array $a ) {
		return $this->writer()->create_contact( $a );
	}

	/** @return array|WP_Error */
	public function op_update_contact( array $a ) {
		return $this->writer()->update_contact( (int) $a['contact_id'], $a['version'] ?? null, ! empty( $a['force'] ), $a );
	}

	/** @return array|WP_Error */
	public function op_import_contacts( array $a ) {
		return $this->writer()->import_contacts( (array) $a['contacts'], (string) ( $a['if_exists'] ?? 'merge' ), ! empty( $a['create_missing'] ), ! empty( $a['run_automations'] ) );
	}

	/** @return array|WP_Error */
	public function op_tag_contacts( array $a ) {
		return $this->writer()->tag_contacts( $a );
	}

	// Tags and lists.

	public function op_create_tag( array $a ) {
		return $this->writer()->create_segment( 'tag', $a );
	}

	public function op_update_tag( array $a ) {
		return $this->writer()->update_segment( 'tag', (int) $a['tag_id'], $a['version'] ?? null, ! empty( $a['force'] ), $a );
	}

	public function op_delete_tag( array $a ) {
		return $this->writer()->delete_segment( 'tag', (int) $a['tag_id'], $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	public function op_merge_tags( array $a ) {
		return $this->writer()->merge_segments( 'tag', (array) $a['from_tag_ids'], (int) $a['to_tag_id'], ! empty( $a['run_automations'] ) );
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

	public function op_merge_lists( array $a ) {
		return $this->writer()->merge_segments( 'list', (array) $a['from_list_ids'], (int) $a['to_list_id'], ! empty( $a['run_automations'] ) );
	}

	// Custom fields, notes, templates.

	public function op_add_custom_field( array $a ) {
		return $this->writer()->add_custom_field( $a, $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	public function op_update_custom_field( array $a ) {
		return $this->writer()->update_custom_field( (string) $a['slug'], $a, $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	public function op_add_note( array $a ) {
		return $this->writer()->add_note( $a );
	}

	public function op_update_note( array $a ) {
		return $this->writer()->update_note( (int) $a['note_id'], $a['version'] ?? null, ! empty( $a['force'] ), $a );
	}

	public function op_delete_note( array $a ) {
		return $this->writer()->delete_note( (int) $a['note_id'], $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	public function op_create_template( array $a ) {
		return $this->writer()->create_template( $a );
	}

	public function op_update_template( array $a ) {
		return $this->writer()->update_template( (int) $a['template_id'], $a['version'] ?? null, ! empty( $a['force'] ), $a );
	}

	public function op_delete_template( array $a ) {
		return $this->writer()->delete_template( (int) $a['template_id'], $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	// Campaigns and sends.

	public function op_create_campaign( array $a ) {
		return $this->writer()->create_campaign( $a );
	}

	public function op_update_campaign( array $a ) {
		return $this->writer()->update_campaign( (int) $a['campaign_id'], $a['version'] ?? null, ! empty( $a['force'] ), $a );
	}

	public function op_schedule_campaign( array $a ) {
		return $this->writer()->schedule_campaign( (int) $a['campaign_id'], $a['version'] ?? null, ! empty( $a['force'] ), $a['scheduled_at'] ?? null, (int) $a['expected_recipients'] );
	}

	public function op_unschedule_campaign( array $a ) {
		return $this->writer()->unschedule_campaign( (int) $a['campaign_id'] );
	}

	public function op_pause_campaign( array $a ) {
		return $this->writer()->campaign_action( (int) $a['campaign_id'], 'pause' );
	}

	public function op_resume_campaign( array $a ) {
		return $this->writer()->campaign_action( (int) $a['campaign_id'], 'resume' );
	}

	public function op_duplicate_campaign( array $a ) {
		return $this->writer()->duplicate_campaign( (int) $a['campaign_id'], (string) ( $a['new_title'] ?? '' ) );
	}

	public function op_delete_campaign( array $a ) {
		return $this->writer()->delete_campaign( (int) $a['campaign_id'], $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	public function op_send_test_email( array $a ) {
		return $this->writer()->send_test_email( $a );
	}

	public function op_send_email_to_contact( array $a ) {
		return $this->writer()->send_email_to_contact( (int) $a['contact_id'], $a );
	}

	public function op_delete_contact( array $a, array $op = array(), bool $confirmed = false ) {
		return $this->writer()->delete_contact( (int) $a['contact_id'], $confirmed );
	}

	// Automations.

	public function op_set_automation_status( array $a, array $op = array(), bool $confirmed = false ) {
		return $this->writer()->set_automation_status( (int) $a['funnel_id'], $a['version'] ?? null, ! empty( $a['force'] ), (string) $a['status'], $confirmed );
	}

	public function op_set_contact_automation( array $a, array $op = array(), bool $confirmed = false ) {
		return $this->writer()->set_contact_automation( (int) $a['funnel_id'], (int) $a['contact_id'], (string) $a['action'], isset( $a['advance_to_sequence_id'] ) ? (int) $a['advance_to_sequence_id'] : null, $confirmed );
	}

	/** @return array */
	public function op_get_setup( array $a ) {
		$api      = $this->api();
		$settings = $api->settings();
		$fields   = $api->rows( 'custom_fields', 0 )['fc_meta'] ?? array();
		$list     = $fields ? (array) maybe_unserialize( current( $fields )['value'] ) : array();
		$writes   = array();
		foreach ( (array) require __DIR__ . '/ops/fluentcrm-write.php' as $name => $op ) {
			if ( $api->supported() && $this->allows( (string) $op['cap'] ) ) {
				$writes[] = $name;
			}
		}
		return array(
			'version'          => $api->version_string(),
			'supported'        => $api->supported(),
			'fluentcrm_mcp'    => $api->own_server(),
			'live_triggers'    => $api->trigger_names(),
			'user_sync'        => $api->user_sync(),
			'double_optin'     => (array) ( $settings['double_optin'] ?? array() ),
			'sender'           => (array) ( $settings['sender'] ?? array() ),
			'statuses'         => EMCP_Tools_FluentCRM_Api::STATUSES,
			'custom_fields'    => count( $list ),
			'write_operations' => $writes,
			'note'             => __( 'FluentCRM\'s own MCP server (fluentcrm_mcp.endpoint) runs automations on every tag or list change and keeps no EMCP History. Use EMCP\'s FluentCRM tools for undoable writes that run automations only when asked.', 'emcp-tools' ),
		);
	}
}
