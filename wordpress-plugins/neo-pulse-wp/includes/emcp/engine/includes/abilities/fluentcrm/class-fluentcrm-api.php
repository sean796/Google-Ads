<?php
/**
 * The only class that touches FluentCRM (spec 4.3): FluentCRM's own abilities and fluent-crm/v2
 * REST controllers in-process (D2), the automation hold (D7), mail counting (D8), the transaction
 * level reset and statement capture (D9), an object's rows across FluentCRM's and WordPress's
 * tables for versions and before-images (D11), and direct row writes for undo and recovery.
 *
 * Rows are keyed by the real table name without the WordPress prefix (fc_subscribers, posts,
 * postmeta, usermeta), each row by its primary key. Keys starting with # are synthetic (counts)
 * and never written back.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( ! class_exists( 'EMCP_Tools_Query_Capture' ) ) {
	require_once dirname( __DIR__ ) . '/class-query-capture.php';
}

/** @since 3.19.0 */
class EMCP_Tools_FluentCRM_Api {

	const NS            = 'fluent-crm/';
	const REST          = '/fluent-crm/v2/';
	const TAG           = 'FluentCrm\App\Models\Tag';
	const LISTS         = 'FluentCrm\App\Models\Lists';
	const CAMPAIGN      = 'FluentCrm\App\Models\Campaign';
	const FUNNEL_HANDLER = 'FluentCrm\App\Hooks\Handlers\FunnelHandler';
	const STATUSES      = array( 'subscribed', 'pending', 'unsubscribed', 'transactional', 'bounced', 'complained', 'spammed' );
	/** FluentCRM's campaign email statuses that are still in the queue (D18). */
	const QUEUED        = array( 'draft', 'pending', 'scheduled', 'scheduling' );
	/** Columns FluentCRM changes on its own (D11). */
	const VOLATILE      = array( 'updated_at', 'last_activity' );
	/** Statement capture scope (D9, D15). */
	const SCOPE         = array( 'prefix' => 'fc_', 'tables' => array( 'posts', 'postmeta', 'usermeta', 'users' ) );

	/** @var int wp_mail() calls seen since the counter was installed (D8). */
	private static $mails = 0;
	private static $counting = false;

	// Environment.

	public function active(): bool {
		return defined( 'FLUENTCRM_PLUGIN_VERSION' ) && function_exists( 'fluentCrmDb' );
	}

	public function version_string(): string {
		return defined( 'FLUENTCRM_PLUGIN_VERSION' ) ? (string) FLUENTCRM_PLUGIN_VERSION : '';
	}

	/** FluentCRM 3.x (D17). */
	public function supported(): bool {
		$v = $this->version_string();
		return $this->active() && version_compare( $v, '3.0', '>=' ) && version_compare( $v, '4.0', '<' );
	}

	/** FluentCRM's Settings > MCP switch (D3). */
	public function mcp_enabled(): bool {
		return function_exists( 'fluentcrm_get_option' ) && 'yes' === fluentcrm_get_option( 'mcp_enabled', 'yes' );
	}

	/** @return array{enabled: bool, endpoint: string} FluentCRM's own MCP server (D5). */
	public function own_server(): array {
		$endpoint = class_exists( 'FluentCrm\App\Modules\MCP\MCPInit' ) ? (string) \FluentCrm\App\Modules\MCP\MCPInit::getEndpointUrl() : '';
		return array( 'enabled' => $this->mcp_enabled(), 'endpoint' => $endpoint );
	}

	/** FluentCRM's user sync (D15). */
	public function user_sync(): bool {
		return class_exists( 'FluentCrm\App\Services\Helper' ) && (bool) \FluentCrm\App\Services\Helper::isUserSyncEnabled();
	}

	/** @return array{double_optin: array, sender: array} */
	protected function fluent_settings(): array {
		$optin  = function_exists( 'fluentcrm_get_option' ) ? (array) fluentcrm_get_option( 'double_optin_settings', array() ) : array();
		$email  = function_exists( 'fluentcrm_get_option' ) ? (array) fluentcrm_get_option( 'email_settings', array() ) : array();
		return array(
			'double_optin' => array_intersect_key( $optin, array_flip( array( 'email_subject', 'after_confirm_behavior' ) ) ),
			'sender'       => array_intersect_key( $email, array_flip( array( 'from_name', 'from_email', 'reply_to_name', 'reply_to_email' ) ) ),
		);
	}

	public function settings(): array {
		return $this->fluent_settings();
	}

	/** FluentCRM's permission check (D6). */
	public function can( string $permission ): bool {
		return class_exists( 'FluentCrm\App\Services\PermissionManager' ) && \FluentCrm\App\Services\PermissionManager::currentUserCan( $permission );
	}

	// Calls (D2, D3).

	/** @return array|WP_Error */
	public function ability( string $name, array $input ) {
		if ( ! $this->mcp_enabled() ) {
			return self::mcp_disabled();
		}
		try {
			$r = $this->execute_ability( $name, $input );
		} catch ( \Throwable $e ) {
			$this->level_reset();
			/* translators: 1: ability, 2: message. */
			return new WP_Error( 'fluentcrm_error', sprintf( __( 'FluentCRM failed while running %1$s: %2$s', 'emcp-tools' ), self::NS . $name, $e->getMessage() ) );
		}
		if ( null === $r ) {
			/* translators: %s: ability name. */
			return new WP_Error( 'fluentcrm_unavailable', sprintf( __( 'FluentCRM does not offer %s on this site.', 'emcp-tools' ), self::NS . $name ) );
		}
		if ( is_wp_error( $r ) ) {
			$code = $r->get_error_code();
			if ( 'ability_invalid_permissions' === $code ) {
				return new WP_Error( 'forbidden', __( 'FluentCRM does not allow you to do this.', 'emcp-tools' ), array( 'status' => 403 ) );
			}
			if ( 'ability_invalid_input' === $code ) {
				return new WP_Error( 'invalid_argument', $r->get_error_message() );
			}
			return $r;
		}
		return is_array( $r ) ? $r : array( 'result' => $r );
	}

	/** @return mixed|null null when FluentCRM does not register the ability. */
	protected function execute_ability( string $name, array $input ) {
		$a = function_exists( 'wp_get_ability' ) ? wp_get_ability( self::NS . $name ) : null;
		return $a ? $a->execute( $input ) : null;
	}

	/** @return array|WP_Error a fluent-crm/v2 route in-process (D2). */
	public function rest( string $method, string $route, array $params = array() ) {
		if ( ! $this->mcp_enabled() ) {
			return self::mcp_disabled();
		}
		try {
			$r = $this->rest_dispatch( strtoupper( $method ), ltrim( $route, '/' ), $params );
		} catch ( \Throwable $e ) {
			$this->level_reset();
			/* translators: 1: route, 2: message. */
			return new WP_Error( 'fluentcrm_error', sprintf( __( 'FluentCRM failed on %1$s: %2$s', 'emcp-tools' ), $route, $e->getMessage() ) );
		}
		return is_wp_error( $r ) ? $r : (array) $r;
	}

	/** @return array|WP_Error */
	protected function rest_dispatch( string $method, string $route, array $params ) {
		$req = new WP_REST_Request( $method, self::REST . $route );
		if ( 'GET' === $method ) {
			$req->set_query_params( $params );
		} else {
			$req->set_body_params( $params );
		}
		$res  = rest_do_request( $req );
		$data = $res->get_data();
		if ( $res->is_error() || $res->get_status() >= 400 ) {
			$msg  = is_array( $data ) ? (string) ( $data['message'] ?? '' ) : '';
			$code = 404 === $res->get_status() ? 'not_found' : ( 403 === $res->get_status() || 401 === $res->get_status() ? 'forbidden' : 'fluentcrm_refused' );
			return new WP_Error( $code, '' !== $msg ? $msg : __( 'FluentCRM refused the request.', 'emcp-tools' ), array( 'status' => $res->get_status(), 'errors' => is_array( $data ) ? ( $data['errors'] ?? null ) : null ) );
		}
		return (array) $data;
	}

	public static function mcp_disabled(): WP_Error {
		return new WP_Error( 'fluentcrm_mcp_disabled', __( 'FluentCRM\'s AI access is switched off on this site (FluentCRM > Settings > MCP). Switch it on there to let EMCP work with FluentCRM.', 'emcp-tools' ), array( 'status' => 403 ) );
	}

	// Automation hold (D7).

	/** @return string[] trigger and goal names FluentCRM listens on. */
	public function trigger_names(): array {
		return array_values( array_unique( array_filter( array_map( 'strval', (array) get_option( 'fluentcrm_funnel_settings', array() ) ) ) ) );
	}

	/** @return array<int,array{0:int,1:callable,2:int}> priority, callback, accepted args */
	protected function hook_callbacks( string $hook ): array {
		global $wp_filter;
		$out = array();
		if ( empty( $wp_filter[ $hook ] ) || ! is_object( $wp_filter[ $hook ] ) ) {
			return $out;
		}
		foreach ( (array) $wp_filter[ $hook ]->callbacks as $prio => $list ) {
			foreach ( (array) $list as $entry ) {
				$out[] = array( (int) $prio, $entry['function'], (int) $entry['accepted_args'] );
			}
		}
		return $out;
	}

	private static function is_funnel_handler( $cb ): bool {
		if ( $cb instanceof \Closure ) {
			$owner = ( new \ReflectionFunction( $cb ) )->getClosureThis();
			return $owner && is_a( $owner, self::FUNNEL_HANDLER );
		}
		return is_array( $cb ) && is_object( $cb[0] ?? null ) && is_a( $cb[0], self::FUNNEL_HANDLER );
	}

	/**
	 * Runs $fn with FluentCRM's automation callbacks removed from every trigger and goal it listens
	 * on, and puts them back afterwards, a throw included (D7).
	 *
	 * @return mixed|WP_Error automation_hold_unavailable when a listed trigger has no FluentCRM callback to hold.
	 */
	public function hold_automations( callable $fn ) {
		$held = array();
		foreach ( $this->trigger_names() as $hook ) {
			$found = false;
			foreach ( $this->hook_callbacks( $hook ) as $c ) {
				if ( self::is_funnel_handler( $c[1] ) ) {
					$found  = true;
					$held[] = array( $hook, $c[1], $c[0], $c[2] );
				}
			}
			if ( ! $found ) {
				/* translators: %s: hook name. */
				return new WP_Error( 'automation_hold_unavailable', sprintf( __( 'EMCP could not hold FluentCRM\'s automations for %s, so nothing was written. Pass run_automations:true to let them run.', 'emcp-tools' ), $hook ) );
			}
		}
		foreach ( $held as $h ) {
			remove_action( $h[0], $h[1], $h[2] );
		}
		try {
			return $fn();
		} finally {
			foreach ( $held as $h ) {
				add_action( $h[0], $h[1], $h[2], $h[3] );
			}
		}
	}

	// Email and automation reports (D7, D8).

	/** Starts counting wp_mail() calls (once per process) and returns the current count. */
	public function mail_mark(): int {
		if ( ! self::$counting ) {
			add_filter( 'wp_mail', array( __CLASS__, 'count_mail' ), PHP_INT_MAX );
			self::$counting = true;
		}
		return self::$mails;
	}

	/** @internal wp_mail filter. */
	public static function count_mail( $atts ) {
		++self::$mails;
		return $atts;
	}

	public function mails_since( int $mark ): int {
		return max( 0, self::$mails - $mark );
	}

	/** @return array{sent: int, queued: int} */
	public function email_report( int $mark, array $captured ): array {
		$queued = 0;
		foreach ( (array) ( $captured['inserted']['campaign_emails'] ?? array() ) as $id ) {
			$row = $this->row( 'fc_campaign_emails', (int) $id );
			if ( $row && in_array( (string) $row['status'], self::QUEUED, true ) ) {
				++$queued;
			}
		}
		return array( 'sent' => $this->mails_since( $mark ), 'queued' => $queued );
	}

	/** @return array[] {funnel_id, contact_id, status} of the enrolments the call created. */
	public function automations_entered( array $captured ): array {
		$out = array();
		foreach ( (array) ( $captured['inserted']['funnel_subscribers'] ?? array() ) as $id ) {
			$row = $this->row( 'fc_funnel_subscribers', (int) $id );
			if ( $row ) {
				$out[] = array( 'funnel_id' => (int) $row['funnel_id'], 'contact_id' => (int) $row['subscriber_id'], 'status' => (string) $row['status'] );
			}
		}
		return $out;
	}

	// Transactions (D9).

	protected function transaction_level(): int {
		if ( ! function_exists( 'fluentCrmDb' ) ) {
			return 0;
		}
		try {
			return (int) fluentCrmDb()->connection()->transactionLevel();
		} catch ( \Throwable $e ) {
			return 0;
		}
	}

	protected function level_down(): void {
		fluentCrmDb()->connection()->rollBack();
	}

	protected function raw_rollback(): void {
		global $wpdb;
		$wpdb->query( 'ROLLBACK' );
	}

	/** Rolls WPFluent's level back to 0 and the connection with it; true when something was open. */
	public function level_reset(): bool {
		$open = false;
		for ( $i = 0; $i < 10 && $this->transaction_level() > 0; $i++ ) {
			$open = true;
			try {
				$this->level_down();
			} catch ( \Throwable $e ) {
				break;
			}
		}
		if ( $open ) {
			$this->raw_rollback();
		}
		return $open;
	}

	/** @return array statement capture over SCOPE; a throw resets the level (D9). */
	public function capture( callable $fn ): array {
		return EMCP_Tools_Query_Capture::run(
			self::SCOPE,
			$fn,
			function () {
				$this->level_reset();
			}
		);
	}

	/**
	 * WordPress-table statements count as the write's only when they name the object it leased (D9,
	 * D15): a posts insert that is now an fc_template post, postmeta of a leased or captured
	 * template, usermeta first_name / last_name of a leased user. Never the users table.
	 *
	 * @param array $leased {template_ids: int[], user_ids: int[]}
	 * @return true|WP_Error
	 */
	public function wp_rows_attributed( array $captured, array $leased ) {
		$templates = array_map( 'intval', (array) ( $leased['template_ids'] ?? array() ) );
		$users     = array_map( 'intval', (array) ( $leased['user_ids'] ?? array() ) );
		$bad       = static function ( string $table ): WP_Error {
			/* translators: %s: table. */
			return new WP_Error( 'attribution_uncertain', sprintf( __( 'A change in %s during the FluentCRM call could not be tied to this write, so EMCP left it as it is.', 'emcp-tools' ), $table ), array( 'tables' => array( $table ) ) );
		};
		$inserted = (array) ( $captured['inserted'] ?? array() );
		foreach ( (array) ( $inserted['posts'] ?? array() ) as $id ) {
			$p = current( $this->select( 'posts', array( 'ID' => (int) $id ) ) );
			if ( ! $p || 'fc_template' !== ( $p['post_type'] ?? '' ) ) {
				return $bad( 'posts' );
			}
			$templates[] = (int) $id;
		}
		if ( ! empty( $inserted['users'] ) || ! empty( $captured['statements']['users'] ) ) {
			return $bad( 'users' );
		}
		$known = array(
			'postmeta' => array_map( 'intval', (array) ( $leased['meta_ids'] ?? array() ) ),
			'usermeta' => array_map( 'intval', (array) ( $leased['umeta_ids'] ?? array() ) ),
		);
		foreach ( array( 'posts', 'postmeta', 'usermeta' ) as $table ) {
			foreach ( (array) ( $captured['statements'][ $table ] ?? array() ) as $sql ) {
				if ( ! $this->where_names_leased( $table, (string) $sql, $templates, $users, $known[ $table ] ?? array() ) ) {
					return $bad( $table );
				}
			}
		}
		foreach ( (array) ( $inserted['postmeta'] ?? array() ) as $id ) {
			$m = current( $this->select( 'postmeta', array( 'meta_id' => (int) $id ) ) );
			if ( ! $m || ! in_array( (int) $m['post_id'], $templates, true ) ) {
				return $bad( 'postmeta' );
			}
		}
		foreach ( (array) ( $inserted['usermeta'] ?? array() ) as $id ) {
			$m = current( $this->select( 'usermeta', array( 'umeta_id' => (int) $id ) ) );
			if ( ! $m || ! in_array( (int) $m['user_id'], $users, true ) || ! in_array( $m['meta_key'], array( 'first_name', 'last_name' ), true ) ) {
				return $bad( 'usermeta' );
			}
		}
		return true;
	}

	/**
	 * The conditions of a statement's WHERE clause, read outside string literals: a list of
	 * [column, values] for `col = int`, `col = 'literal'` and `col IN (ints)` joined by AND only.
	 * null for anything else (OR, comparisons, functions, subqueries, a trailing clause, comments,
	 * no WHERE, a repeated column), so an unusual statement is never attributed (security review).
	 *
	 * @return array<string,array>|null column => values
	 */
	public static function where_conditions( string $sql ): ?array {
		return EMCP_Tools_Query_Capture::where_conditions( $sql );
	}

	/** Whether a captured UPDATE / DELETE on a WordPress table touches only the leased object (D9, D15). */
	private function where_names_leased( string $table, string $sql, array $templates, array $users, array $known_meta ): bool {
		$c = self::where_conditions( $sql );
		if ( null === $c ) {
			return false;
		}
		$cols = array_keys( $c );
		sort( $cols );
		$ints_in = static fn( array $vals, array $allowed ) => array() !== $vals && ! array_diff( array_map( 'intval', $vals ), $allowed ) && count( array_filter( $vals, 'is_int' ) ) === count( $vals );
		if ( 'posts' === $table ) {
			if ( array( 'post_parent', 'post_type' ) === $cols ) {
				// wp_delete_post() detaching the deleted template's own attachments, and nothing else.
				return 1 === count( $c['post_parent'] ) && $ints_in( $c['post_parent'], $templates ) && array( 'attachment' ) === $c['post_type'];
			}
			return array( 'id' ) === $cols && 1 === count( $c['id'] ) && $ints_in( $c['id'], $templates );
		}
		$owner_col = 'postmeta' === $table ? 'post_id' : 'user_id';
		$id_col    = 'postmeta' === $table ? 'meta_id' : 'umeta_id';
		$owners    = 'postmeta' === $table ? $templates : $users;
		$keys_ok   = static fn( array $keys ) => 'postmeta' === $table || ! array_diff( $keys, array( 'first_name', 'last_name' ) );
		if ( array( $id_col ) === $cols ) {
			foreach ( $c[ $id_col ] as $mid ) {
				if ( ! is_int( $mid ) ) {
					return false;
				}
				if ( in_array( $mid, $known_meta, true ) ) {
					continue;
				}
				$row = current( $this->select( $table, array( $id_col => $mid ) ) );
				if ( ! $row || ! in_array( (int) $row[ $owner_col ], $owners, true ) || ! $keys_ok( array( (string) $row['meta_key'] ) ) ) {
					return false;
				}
			}
			return true;
		}
		if ( array( 'meta_key', $owner_col ) === $cols || array( $owner_col, 'meta_key' ) === $cols ) {
			return 1 === count( $c[ $owner_col ] ) && $ints_in( $c[ $owner_col ], $owners ) && 1 === count( $c['meta_key'] ) && is_string( $c['meta_key'][0] ) && $keys_ok( $c['meta_key'] );
		}
		if ( 'postmeta' === $table && array( $owner_col ) === $cols ) {
			return 1 === count( $c[ $owner_col ] ) && $ints_in( $c[ $owner_col ], $owners );
		}
		return false;
	}

	// Rows (D11).

	public static function pk( string $table ): string {
		return array( 'posts' => 'ID', 'postmeta' => 'meta_id', 'usermeta' => 'umeta_id', 'users' => 'ID' )[ $table ] ?? 'id';
	}

	/** @param array $where column => value or values. @return array<int,array> pk => row */
	protected function select( string $table, array $where ): array {
		global $wpdb;
		$sql  = array();
		$args = array();
		foreach ( $where as $col => $val ) {
			$col = preg_replace( '/[^A-Za-z0-9_]/', '', (string) $col );
			if ( is_array( $val ) ) {
				if ( array() === $val ) {
					return array();
				}
				$sql[] = "`{$col}` IN (" . implode( ',', array_fill( 0, count( $val ), '%s' ) ) . ')';
				$args  = array_merge( $args, array_map( 'strval', $val ) );
			} else {
				$sql[]  = "`{$col}` = %s";
				$args[] = (string) $val;
			}
		}
		$pk    = self::pk( $table );
		$query = "SELECT * FROM `{$wpdb->prefix}{$table}`" . ( $sql ? ' WHERE ' . implode( ' AND ', $sql ) : '' ) . " ORDER BY `{$pk}`";
		$rows  = $args ? $wpdb->get_results( $wpdb->prepare( $query, $args ), ARRAY_A ) : $wpdb->get_results( $query, ARRAY_A ); // phpcs:ignore WordPress.DB.PreparedSQL
		$out   = array();
		foreach ( (array) $rows as $r ) {
			$out[ (int) $r[ $pk ] ] = $r;
		}
		return $out;
	}

	/**
	 * Every row of an object across its tables.
	 *
	 * @param string $kind contact, tag, list, note, campaign, campaign_queue, template, automation, enrolment, custom_fields.
	 */
	public function rows( string $kind, int $id ): array {
		switch ( $kind ) {
			case 'contact':
				$rows = array(
					'fc_subscribers'      => $this->select( 'fc_subscribers', array( 'id' => $id ) ),
					'fc_subscriber_pivot' => $this->select( 'fc_subscriber_pivot', array( 'subscriber_id' => $id ) ),
					// Custom field values only: FluentCRM keeps its own per-contact options here too (the
					// _secure_managed_hash its unsubscribe links use, added when it renders mail), which
					// are no change to the contact and which an undo must not take away.
					'fc_subscriber_meta'  => $this->select( 'fc_subscriber_meta', array( 'subscriber_id' => $id, 'object_type' => 'custom_field' ) ),
				);
				$uid  = (int) ( current( $rows['fc_subscribers'] )['user_id'] ?? 0 );
				if ( $uid > 0 && $this->user_sync() ) {
					$rows['usermeta'] = $this->select( 'usermeta', array( 'user_id' => $uid, 'meta_key' => array( 'first_name', 'last_name' ) ) );
				}
				return $rows;
			case 'tag':
			case 'list':
				$table = 'tag' === $kind ? 'fc_tags' : 'fc_lists';
				return array(
					$table                => $this->select( $table, array( 'id' => $id ) ),
					'fc_subscriber_pivot' => $this->select( 'fc_subscriber_pivot', array( 'object_type' => 'tag' === $kind ? self::TAG : self::LISTS, 'object_id' => $id ) ),
				);
			case 'note':
				return array( 'fc_subscriber_notes' => $this->select( 'fc_subscriber_notes', array( 'id' => $id ) ) );
			case 'campaign':
				$counts = array();
				foreach ( $this->select( 'fc_campaign_emails', array( 'campaign_id' => $id ) ) as $e ) {
					$counts[ (string) $e['status'] ] = ( $counts[ (string) $e['status'] ] ?? 0 ) + 1;
				}
				ksort( $counts );
				return array(
					'fc_campaigns'      => $this->select( 'fc_campaigns', array( 'id' => $id ) ),
					'fc_meta'           => $this->select( 'fc_meta', array( 'object_type' => self::CAMPAIGN, 'object_id' => $id ) ),
					'fc_term_relations' => $this->select( 'fc_term_relations', array( 'object_type' => self::CAMPAIGN, 'object_id' => $id ) ),
					'#email_rows'       => $counts,
				);
			case 'campaign_queue':
				return array( 'fc_campaign_emails' => $this->select( 'fc_campaign_emails', array( 'campaign_id' => $id, 'status' => self::QUEUED ) ) );
			case 'template':
				$post = $this->select( 'posts', array( 'ID' => $id, 'post_type' => 'fc_template' ) );
				return array(
					'posts'    => $post,
					'postmeta' => $post ? $this->select( 'postmeta', array( 'post_id' => $id ) ) : array(),
				);
			case 'automation':
				return array( 'fc_funnels' => $this->select( 'fc_funnels', array( 'id' => $id ) ) );
			case 'enrolment':
				return array( 'fc_funnel_subscribers' => $this->select( 'fc_funnel_subscribers', array( 'id' => $id ) ) );
			case 'custom_fields':
				return array( 'fc_meta' => $this->select( 'fc_meta', array( 'object_type' => 'option', 'key' => 'contact_custom_fields' ) ) );
		}
		return array();
	}

	/** 16 hex of sha256 over the rows, keys sorted, volatile columns dropped (D11). */
	public static function version( array $rows ): string {
		$norm = static function ( $v ) use ( &$norm ) {
			if ( ! is_array( $v ) ) {
				return null === $v ? null : (string) $v;
			}
			foreach ( self::VOLATILE as $col ) {
				unset( $v[ $col ] );
			}
			ksort( $v );
			return array_map( $norm, $v );
		};
		return substr( hash( 'sha256', (string) wp_json_encode( $norm( $rows ) ) ), 0, 16 );
	}

	public function version_of( string $kind, int $id ): string {
		return self::version( $this->rows( $kind, $id ) );
	}

	// Direct writes: undo and recovery only (D13).

	protected function replace_row( string $table, array $row ): bool {
		global $wpdb;
		return false !== $wpdb->replace( $wpdb->prefix . $table, $row );
	}

	protected function delete_row( string $table, int $id ): bool {
		global $wpdb;
		return false !== $wpdb->delete( $wpdb->prefix . $table, array( self::pk( $table ) => $id ) );
	}

	protected function begin(): void {
		global $wpdb;
		$wpdb->query( 'START TRANSACTION' );
	}

	protected function commit(): void {
		global $wpdb;
		$wpdb->query( 'COMMIT' );
	}

	/** Caches FluentCRM and WordPress keep for rows written directly. */
	protected function flush_caches( array $rows ): void {
		foreach ( array_keys( (array) ( $rows['posts'] ?? array() ) ) as $id ) {
			clean_post_cache( (int) $id );
		}
		foreach ( (array) ( $rows['usermeta'] ?? array() ) as $r ) {
			wp_cache_delete( (int) $r['user_id'], 'user_meta' );
		}
	}

	/**
	 * Puts $before back: rows in $before written as they were, rows in $current but not in $before
	 * deleted, in one transaction. Synthetic # keys are skipped.
	 */
	public function restore_rows( array $before, array $current = array() ): bool {
		$this->begin();
		foreach ( $before as $table => $rows ) {
			if ( '#' === substr( (string) $table, 0, 1 ) ) {
				continue;
			}
			foreach ( (array) $rows as $row ) {
				if ( ! $this->replace_row( (string) $table, (array) $row ) ) {
					$this->raw_rollback();
					return false;
				}
			}
		}
		$gone = array();
		foreach ( $current as $table => $rows ) {
			if ( '#' === substr( (string) $table, 0, 1 ) ) {
				continue;
			}
			foreach ( array_keys( (array) $rows ) as $id ) {
				if ( ! isset( $before[ $table ][ $id ] ) && ! $this->delete_row( (string) $table, (int) $id ) ) {
					$this->raw_rollback();
					return false;
				}
				if ( 'fc_subscribers' === (string) $table && ! isset( $before[ $table ][ $id ] ) ) {
					$gone[] = (int) $id;
				}
			}
		}
		// A contact removed by the restore takes FluentCRM's own meta for it along (no orphan rows).
		foreach ( $gone as $cid ) {
			foreach ( array_keys( $this->select( 'fc_subscriber_meta', array( 'subscriber_id' => $cid ) ) ) as $mid ) {
				if ( ! $this->delete_row( 'fc_subscriber_meta', (int) $mid ) ) {
					$this->raw_rollback();
					return false;
				}
			}
		}
		$this->commit();
		$this->flush_caches( $before + $current );
		return true;
	}

	/** Deletes these rows, in one transaction. */
	public function delete_rows( array $rows ): bool {
		$this->begin();
		foreach ( $rows as $table => $list ) {
			if ( '#' === substr( (string) $table, 0, 1 ) ) {
				continue;
			}
			foreach ( array_keys( (array) $list ) as $id ) {
				if ( ! $this->delete_row( (string) $table, (int) $id ) ) {
					$this->raw_rollback();
					return false;
				}
			}
		}
		$this->commit();
		$this->flush_caches( $rows );
		return true;
	}

	// Campaign queues (D18).

	/** FluentCRM's campaign processing lock, never waiting (CampaignProcessor's own key). */
	public function campaign_lock( int $id ): bool {
		return class_exists( 'FluentCrm\App\Services\Helper' ) && (bool) \FluentCrm\App\Services\Helper::acquireDbLock( '_fluentcrm_lock_campaign_processing_' . $id, 90 );
	}

	public function campaign_unlock( int $id ): void {
		if ( class_exists( 'FluentCrm\App\Services\Helper' ) ) {
			\FluentCrm\App\Services\Helper::releaseDbLock( '_fluentcrm_lock_campaign_processing_' . $id );
		}
	}

	/**
	 * Takes a campaign's queue back while none of its emails has left it (D18): in one transaction,
	 * the campaign's email rows locked FOR UPDATE (FluentCRM's sender claims rows the same way), then
	 * emails_sent when any row is past the queue, else the queued rows deleted and the campaign set
	 * back to draft with no schedule. Called with campaign_lock() held.
	 *
	 * @return array{withdrawn: int}|WP_Error
	 */
	public function withdraw_queue_rows( int $id ) {
		global $wpdb;
		$emails = $wpdb->prefix . 'fc_campaign_emails';
		$camps  = $wpdb->prefix . 'fc_campaigns';
		$wpdb->query( 'START TRANSACTION' );
		$rows = (array) $wpdb->get_results( $wpdb->prepare( "SELECT id, status FROM `{$emails}` WHERE campaign_id = %d FOR UPDATE", $id ), ARRAY_A );
		foreach ( $rows as $r ) {
			if ( ! in_array( (string) $r['status'], self::QUEUED, true ) ) {
				$wpdb->query( 'ROLLBACK' );
				return new WP_Error( 'emails_sent', __( 'An email of this campaign has already left the queue, so it cannot be taken back. Pause the campaign instead.', 'emcp-tools' ), array( 'status' => 409 ) );
			}
		}
		$in  = implode( ',', array_fill( 0, count( self::QUEUED ), '%s' ) );
		$del = $wpdb->query( $wpdb->prepare( "DELETE FROM `{$emails}` WHERE campaign_id = %d AND status IN ({$in})", array_merge( array( $id ), self::QUEUED ) ) ); // phpcs:ignore WordPress.DB.PreparedSQL
		$upd = $wpdb->query( $wpdb->prepare( "UPDATE `{$camps}` SET status = 'draft', scheduled_at = NULL WHERE id = %d", $id ) );
		if ( false === $del || false === $upd ) {
			$wpdb->query( 'ROLLBACK' );
			return new WP_Error( 'fluentcrm_error', __( 'The campaign queue could not be taken back; nothing changed.', 'emcp-tools' ) );
		}
		$wpdb->query( 'COMMIT' );
		return array( 'withdrawn' => count( $rows ) );
	}

	// Contacts (D10, D15).

	/** Capabilities that make a WordPress user an administrator for the Users domain rule (D15). */
	const ADMIN_CAPS = array( 'manage_options', 'promote_users', 'edit_users', 'delete_users', 'manage_network' );

	/** @return array{ID: int, email: string, admin: bool, first_name: string, last_name: string}|null */
	protected function user_lookup( string $field, $value ): ?array {
		$u = 'email' === $field ? get_user_by( 'email', (string) $value ) : get_user_by( 'id', (int) $value );
		if ( ! $u ) {
			return null;
		}
		$admin = false;
		foreach ( self::ADMIN_CAPS as $cap ) {
			$admin = $admin || user_can( $u, $cap );
		}
		return array(
			'ID'         => (int) $u->ID,
			'email'      => (string) $u->user_email,
			'admin'      => $admin,
			'first_name' => (string) get_user_meta( (int) $u->ID, 'first_name', true ),
			'last_name'  => (string) get_user_meta( (int) $u->ID, 'last_name', true ),
		);
	}

	/**
	 * What FluentCRM's save callback will do to a linked WordPress user (D15): it picks the user by
	 * the contact's resulting email, else by user_id, writes that user's names when the resulting
	 * non-empty names differ, and with fluentcrm_update_wp_user_email_on_change rewrites the user's
	 * email when no user has the resulting email; on every save, whatever fields were named.
	 *
	 * @param array $after the contact's resulting email, first_name and last_name.
	 * @return array{user_id: int, relink: bool, admin: bool, names_change: bool, email_sync: bool}
	 */
	public function sync_effect( int $contact_id, array $after ): array {
		$none = array( 'user_id' => 0, 'relink' => false, 'admin' => false, 'names_change' => false, 'email_sync' => false );
		$row  = $this->row( 'fc_subscribers', $contact_id );
		$uid  = (int) ( $row['user_id'] ?? 0 );
		if ( ! $row || $uid <= 0 || ! $this->user_sync() ) {
			return $none;
		}
		$by_email = $this->user_lookup( 'email', (string) ( $after['email'] ?? $row['email'] ) );
		$user     = $by_email ? $by_email : $this->user_lookup( 'id', $uid );
		if ( ! $user ) {
			return $none;
		}
		$names = false;
		foreach ( array( 'first_name', 'last_name' ) as $k ) {
			$v     = (string) ( $after[ $k ] ?? $row[ $k ] ?? '' );
			$names = $names || ( '' !== $v && $v !== $user[ $k ] );
		}
		return array(
			'user_id'      => $user['ID'],
			'relink'       => $user['ID'] !== $uid,
			'admin'        => $user['admin'],
			'names_change' => $names,
			'email_sync'   => ! $by_email && (bool) apply_filters( 'fluentcrm_update_wp_user_email_on_change', false ),
		);
	}

	/**
	 * Clears fields FluentCRM's own path cannot (D10): core columns through the model's save,
	 * custom fields through syncCustomFieldValues( [slug => ''], true ), which deletes the meta row.
	 *
	 * @return true|WP_Error
	 */
	public function clear_fields( int $contact_id, array $core, array $custom ) {
		if ( ! class_exists( 'FluentCrm\App\Models\Subscriber' ) ) {
			return new WP_Error( 'fluentcrm_unavailable', __( 'FluentCRM\'s contact model is not available.', 'emcp-tools' ) );
		}
		$s = \FluentCrm\App\Models\Subscriber::find( $contact_id );
		if ( ! $s ) {
			return new WP_Error( 'not_found', __( 'There is no such FluentCRM contact.', 'emcp-tools' ), array( 'status' => 404 ) );
		}
		if ( $core ) {
			foreach ( $core as $f ) {
				$s->{$f} = 'date_of_birth' === $f ? null : '';
			}
			$s->save();
		}
		if ( $custom ) {
			$s->syncCustomFieldValues( array_fill_keys( $custom, '' ), true );
		}
		return true;
	}

	/** @return array{slug: string, label: string, type: string, options?: array}[] the stored custom field list. */
	public function custom_field_list(): array {
		$row = current( $this->select( 'fc_meta', array( 'object_type' => 'option', 'key' => 'contact_custom_fields' ) ) );
		return $row ? array_values( (array) maybe_unserialize( $row['value'] ) ) : array();
	}

	public function contact_by_email( string $email ): ?int {
		$ids = $this->email_lookup( strtolower( trim( $email ) ) );
		return $ids ? (int) $ids[0] : null;
	}

	/** Case-insensitive email lookup the database collation gives (the fake overrides it). @return int[] */
	protected function email_lookup( string $email ): array {
		global $wpdb;
		return array_map( 'intval', (array) $wpdb->get_col( $wpdb->prepare( "SELECT id FROM `{$wpdb->prefix}fc_subscribers` WHERE LOWER(TRIM(email)) = %s", $email ) ) );
	}

	/** Later real work on a contact (D13). @return array{emails: int, automations: int, notes_by_others: int, user_id: int} */
	public function contact_counts( int $id, int $author ): array {
		$notes = 0;
		foreach ( $this->select( 'fc_subscriber_notes', array( 'subscriber_id' => $id ) ) as $n ) {
			if ( (int) ( $n['created_by'] ?? 0 ) !== $author ) {
				++$notes;
			}
		}
		return array(
			'emails'          => count( $this->select( 'fc_campaign_emails', array( 'subscriber_id' => $id ) ) ),
			'automations'     => count( $this->select( 'fc_funnel_subscribers', array( 'subscriber_id' => $id ) ) ),
			'notes_by_others' => $notes,
			'user_id'         => (int) ( $this->row( 'fc_subscribers', $id )['user_id'] ?? 0 ),
		);
	}

	/**
	 * Tag or list references to ids (Review Focus 1): integers are ids, strings are titles or slugs
	 * (a numeric string such as "2024" too), matched without regard to case.
	 *
	 * @return array{ids: int[], unknown: array}
	 */
	public function resolve_refs( string $kind, array $refs ): array {
		$table   = 'tag' === $kind ? 'fc_tags' : 'fc_lists';
		$ids     = array();
		$unknown = array();
		foreach ( $refs as $ref ) {
			if ( is_int( $ref ) ) {
				if ( $this->row( $table, $ref ) ) {
					$ids[] = $ref;
				} else {
					$unknown[] = $ref;
				}
				continue;
			}
			$name = trim( (string) $ref );
			$hit  = 0;
			foreach ( $this->segment_rows( $table ) as $id => $r ) {
				if ( strtolower( (string) $r['title'] ) === strtolower( $name ) || strtolower( (string) $r['slug'] ) === strtolower( $name ) ) {
					$hit = (int) $id;
					break;
				}
			}
			if ( $hit ) {
				$ids[] = $hit;
			} else {
				$unknown[] = $ref;
			}
		}
		return array( 'ids' => array_values( array_unique( $ids ) ), 'unknown' => $unknown );
	}

	/** @return array<int,array> every tag or list row (registries are small). */
	protected function segment_rows( string $table ): array {
		return $this->select( $table, array() );
	}

	public function row( string $table, int $id ): ?array {
		$r = $this->select( $table, array( self::pk( $table ) => $id ) );
		return $r ? current( $r ) : null;
	}

	/** @return array<int,array> rows of a table matching $where (lookups for the writer). */
	public function find( string $table, array $where ): array {
		return $this->select( $table, $where );
	}

	// Automations (D19).

	/** FluentCRM's own refresh of the live trigger and goal index (fluentcrm_funnel_settings). */
	public function reset_funnel_indexes(): void {
		if ( class_exists( self::FUNNEL_HANDLER ) && method_exists( self::FUNNEL_HANDLER, 'resetFunnelIndexes' ) ) {
			$h = self::FUNNEL_HANDLER;
			( new $h() )->resetFunnelIndexes();
		}
	}

	/** The trigger and goal names an automation listens to. */
	public function automation_triggers( int $funnel ): array {
		$f     = $this->row( 'fc_funnels', $funnel );
		$names = $f && '' !== (string) $f['trigger_name'] ? array( (string) $f['trigger_name'] ) : array();
		foreach ( $this->find( 'fc_funnel_sequences', array( 'funnel_id' => $funnel, 'type' => 'benchmark' ) ) as $seq ) {
			$names[] = (string) $seq['action_name'];
		}
		return array_values( array_unique( $names ) );
	}

	/**
	 * Enrolments by state: active, waiting, and due (active with a next execution time already
	 * passed, which FluentCRM's processor runs on its next pass once the automation is published).
	 *
	 * @return array{active:int,waiting:int,due:int}
	 */
	public function enrolment_counts( int $funnel ): array {
		global $wpdb;
		$t   = $wpdb->prefix . 'fc_funnel_subscribers';
		$row = $wpdb->get_row(
			$wpdb->prepare(
				// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared -- table name from the prefix.
				"SELECT SUM(status = 'active') AS active, SUM(status = 'waiting') AS waiting, SUM(status = 'active' AND next_execution_time IS NOT NULL AND next_execution_time <> '' AND next_execution_time <= %s) AS due FROM {$t} WHERE funnel_id = %d",
				current_time( 'mysql' ),
				$funnel
			),
			ARRAY_A
		);
		return array(
			'active'  => (int) ( $row['active'] ?? 0 ),
			'waiting' => (int) ( $row['waiting'] ?? 0 ),
			'due'     => (int) ( $row['due'] ?? 0 ),
		);
	}
}
