<?php
/**
 * The Events Calendar (free) integration: the events-calendar-read and events-calendar-write
 * dispatcher tools. Operation rows live in ops/tec-read.php and ops/tec-write.php; each row names
 * its own rule (cap_*) and handler (op_*). Every TEC call goes through EMCP_Tools_TEC_Api (TEC's
 * ORM, D2); every write goes through EMCP_Tools_TEC_Writer.
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
class EMCP_Tools_TEC_Integration {

	const PER_PAGE = 20;

	/** Statuses a list covers when none (or any) is asked for. */
	const LIST_STATUSES = array( 'publish', 'future', 'draft', 'pending', 'private' );

	/** TEC's plural capability names per kind (spike item 6). */
	const PLURAL = array( 'event' => 'tribe_events', 'venue' => 'tribe_venues', 'organizer' => 'tribe_organizers' );

	/** @var EMCP_Tools_TEC_Api|null Test seam. */
	private static $api_override = null;

	/** @var string[] */
	private $ability_names = array();

	public static function use_api( ?EMCP_Tools_TEC_Api $api ): void {
		self::$api_override = $api;
	}

	public static function tec_active(): bool {
		return class_exists( 'Tribe__Events__Main' );
	}

	public static function shared_api(): EMCP_Tools_TEC_Api {
		return self::$api_override ? self::$api_override : new EMCP_Tools_TEC_Api();
	}

	protected function api(): EMCP_Tools_TEC_Api {
		return self::shared_api();
	}

	/** @return string[] */
	public function get_ability_names(): array {
		return $this->ability_names;
	}

	public function check_permission(): bool {
		return $this->api()->can( 'edit_tribe_events' );
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
			'emcp-tools/events-calendar-read'  => array(
				'label'       => __( 'The Events Calendar Read', 'emcp-tools' ),
				'description' => __( 'Read The Events Calendar: the setup and allowed operations, events by date range, status, category, venue, organizer or search, one event with its venue, organizers, categories, tags, event status and version, venues, organizers and event categories. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_read',
				'operation'   => __( 'The read operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
			),
			'emcp-tools/events-calendar-write' => array(
				'label'       => __( 'The Events Calendar Write', 'emcp-tools' ),
				'description' => __( 'Build The Events Calendar events: create and change events (only the fields you pass change) with their date, time zone, venue, organizers, categories and tags, publish them, mark them cancelled or postponed, move them to the trash, and create and change venues, organizers and event categories. Every write to an existing object needs the version from its read. Disabled by default; enable under Neo EMCP > Tools > Plugins > The Events Calendar. Trashing needs confirm:true. Every write can be undone in History. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_write',
				'operation'   => __( 'The write operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => false, 'destructive' => true, 'idempotent' => false ),
			),
		);
		if ( ! $this->api()->supported() ) {
			unset( $tools['emcp-tools/events-calendar-write'] );
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
		$ops = (array) require __DIR__ . '/ops/tec-' . $mode . '.php';
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
				'undo'        => 'write' === $mode ? 'undoable' : 'read-only',
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
		if ( ! $this->api()->active() ) {
			return new WP_Error( 'tec_inactive', __( 'The Events Calendar is not active.', 'emcp-tools' ) );
		}
		$ops = $this->operations( $mode );
		if ( ! isset( $ops[ $name ] ) ) {
			if ( ! $this->api()->supported() ) {
				/* translators: %s: TEC version. */
				return new WP_Error( 'tec_unsupported_version', sprintf( __( 'This version of The Events Calendar (%s) is not supported yet; EMCP works with The Events Calendar 6.x.', 'emcp-tools' ), $this->api()->version_string() ) );
			}
			/* translators: %s: operation name. */
			return new WP_Error( 'unknown_operation', sprintf( __( 'Unknown operation "%s". Call the tool with no operation to list the available operations.', 'emcp-tools' ), $name ) );
		}
		$op   = $ops[ $name ];
		$args = is_array( $input ) && isset( $input['arguments'] ) && is_array( $input['arguments'] ) ? $input['arguments'] : array();

		$confirmed = array_key_exists( 'confirm', $args ) && true === $args['confirm'];
		unset( $args['confirm'] );

		$clean = EMCP_Tools_Op_Args::validate( (array) $op['args'], $args );
		if ( is_wp_error( $clean ) ) {
			return $clean;
		}
		if ( ! method_exists( $this, $op['cap'] ) || ! method_exists( $this, $op['run'] ) ) {
			return new WP_Error( 'not_ready', __( 'This operation is not available yet.', 'emcp-tools' ) );
		}
		$allowed = call_user_func( array( $this, $op['cap'] ), $clean );
		if ( is_wp_error( $allowed ) ) {
			return $allowed;
		}
		if ( ! empty( $op['confirm'] ) && ! $confirmed ) {
			return new WP_Error( 'confirmation_required', __( 'This operation moves something to the trash. Pass confirm:true in arguments to proceed.', 'emcp-tools' ) );
		}
		return call_user_func( array( $this, $op['run'] ), $clean );
	}

	// Rules (D5, D21).

	protected static function forbidden(): WP_Error {
		return new WP_Error( 'forbidden', __( 'You are not allowed to do this in The Events Calendar.', 'emcp-tools' ), array( 'status' => 403 ) );
	}

	protected static function not_found( string $what, int $id ): WP_Error {
		/* translators: 1: what (event, venue, ...), 2: id. */
		return new WP_Error( 'not_found', sprintf( __( 'There is no %1$s %2$d.', 'emcp-tools' ), $what, $id ), array( 'status' => 404 ) );
	}

	/** @return true|WP_Error */
	protected function cap_tool( array $args ) {
		return $this->check_permission() ? true : self::forbidden();
	}

	/** D21: published to anyone the tool lets in, private with read_post, the rest with edit_post. */
	public static function can_read_object( EMCP_Tools_TEC_Api $api, int $id ): bool {
		$status = $api->post_status( $id );
		if ( 'publish' === $status ) {
			return true;
		}
		return 'private' === $status ? $api->can( 'read_post', $id ) : $api->can( 'edit_post', $id );
	}

	/** @return true|WP_Error */
	protected function cap_read( string $kind, int $id ) {
		if ( EMCP_Tools_TEC_Api::TYPES[ $kind ] !== $this->api()->post_type( $id ) ) {
			return self::not_found( $kind, $id );
		}
		return self::can_read_object( $this->api(), $id ) ? true : self::forbidden();
	}

	/** @return true|WP_Error */
	protected function cap_read_event( array $args ) {
		return $this->cap_read( 'event', (int) $args['event_id'] );
	}

	/** @return true|WP_Error */
	protected function cap_read_venue( array $args ) {
		return $this->cap_read( 'venue', (int) $args['venue_id'] );
	}

	/** @return true|WP_Error */
	protected function cap_read_organizer( array $args ) {
		return $this->cap_read( 'organizer', (int) $args['organizer_id'] );
	}

	/**
	 * D21 in a list: the statuses the user sees on every post, and those they see only on their own,
	 * built into the query so totals are right.
	 *
	 * @return array{status: string[], own_only_statuses: string[], own_author: int}
	 */
	public static function list_scope( EMCP_Tools_TEC_Api $api, string $kind, ?string $status ): array {
		$plural    = self::PLURAL[ $kind ];
		$requested = ( null === $status || 'any' === $status ) ? self::LIST_STATUSES : array( $status );
		$all       = array();
		$own       = array();
		foreach ( $requested as $s ) {
			if ( 'publish' === $s ) {
				$all[] = $s;
			} elseif ( 'private' === $s ) {
				if ( $api->can( 'read_private_' . $plural ) ) {
					$all[] = $s;
				} else {
					$own[] = $s;
				}
			} elseif ( $api->can( 'edit_others_' . $plural ) ) {
				$all[] = $s;
			} else {
				$own[] = $s;
			}
		}
		return array( 'status' => $all, 'own_only_statuses' => $own, 'own_author' => $api->user_id() );
	}

	// Views (spec 4.1, D17: raw values).

	protected static function truthy( $v ): bool {
		return in_array( strtolower( (string) $v ), array( '1', 'yes', 'true', 'on' ), true );
	}

	/** EMCP field => value, from the raw state through the field map. */
	public static function mapped( string $kind, array $raw ): array {
		$out = array();
		foreach ( EMCP_Tools_TEC_Api::field_map( $kind ) as $field => $row ) {
			list( $store, $key, , $type ) = $row;
			if ( 'post' === $store ) {
				$v = $raw['post'][ $key ] ?? '';
			} elseif ( 'term' === $store ) {
				$v = array_map( 'intval', (array) ( $raw['terms'][ $key ] ?? array() ) );
			} elseif ( 'metas' === $store ) {
				$v = array_values( array_filter( array_map( 'intval', (array) ( $raw['meta'][ $key ] ?? array() ) ) ) );
			} else {
				$v = $raw['meta'][ $key ][0] ?? '';
			}
			switch ( $type ) {
				case 'bool':
					$v = self::truthy( $v );
					break;
				case 'int':
					$v = (int) $v;
					break;
			}
			$out[ $field ] = $v;
		}
		return $out;
	}

	protected static function linked( EMCP_Tools_TEC_Api $api, int $id, string $type ): array {
		return $type === $api->post_type( $id ) ? array( 'id' => $id, 'title' => $api->title( $id ) ) : array( 'id' => $id, 'missing' => true );
	}

	/** @return array|null {event, venue, organizers, categories, tags, event_status, reason, url, edit_url, version} */
	public static function event_view( EMCP_Tools_TEC_Api $api, int $id ): ?array {
		$raw = $api->fields( $id );
		if ( ! $raw || EMCP_Tools_TEC_Api::EVENT !== $api->post_type( $id ) ) {
			return null;
		}
		$f      = self::mapped( 'event', $raw );
		$status = (string) ( $raw['meta'][ EMCP_Tools_TEC_Api::STATUS_KEY ][0] ?? '' );
		$cats   = array();
		foreach ( $f['categories'] as $c ) {
			$cat    = $api->category( $c );
			$cats[] = array( 'id' => $c, 'name' => $cat ? $cat['name'] : '' );
		}
		$tags = array();
		foreach ( $f['tags'] as $t ) {
			$tags[] = array( 'id' => $t, 'name' => $api->tag_name( $t ) );
		}
		return array(
			'event'        => $f,
			'venue'        => $f['venue_id'] ? self::linked( $api, $f['venue_id'], EMCP_Tools_TEC_Api::VENUE ) : null,
			'organizers'   => array_map( fn( $o ) => self::linked( $api, $o, EMCP_Tools_TEC_Api::ORGANIZER ), $f['organizer_ids'] ),
			'categories'   => $cats,
			'tags'         => $tags,
			'event_status' => array( 'canceled' => 'cancelled', 'postponed' => 'postponed' )[ $status ] ?? 'scheduled',
			'reason'       => (string) ( $raw['meta'][ EMCP_Tools_TEC_Api::REASON_KEY ][0] ?? '' ),
			'url'          => $api->url( $id ),
			'edit_url'     => admin_url( 'post.php?post=' . $id . '&action=edit' ),
			'version'      => EMCP_Tools_TEC_Api::version( EMCP_Tools_TEC_Api::strip_volatile( $raw ) ),
		);
	}

	/** Venues and organizers. @return array|null */
	public static function linked_view( EMCP_Tools_TEC_Api $api, string $kind, int $id ): ?array {
		$raw = $api->fields( $id );
		if ( ! $raw || EMCP_Tools_TEC_Api::TYPES[ $kind ] !== $api->post_type( $id ) ) {
			return null;
		}
		return array(
			$kind      => self::mapped( $kind, $raw ),
			'events'   => $api->linked_events( $id, $kind ),
			'url'      => $api->viewable( EMCP_Tools_TEC_Api::TYPES[ $kind ] ) ? $api->url( $id ) : '',
			'edit_url' => admin_url( 'post.php?post=' . $id . '&action=edit' ),
			'version'  => EMCP_Tools_TEC_Api::version( EMCP_Tools_TEC_Api::strip_volatile( $raw ) ),
		);
	}

	/** @return array|null category with its version (D23) */
	public static function category_view( EMCP_Tools_TEC_Api $api, int $id ): ?array {
		$c = $api->category( $id );
		if ( ! $c ) {
			return null;
		}
		$c['version'] = EMCP_Tools_TEC_Api::version( array_intersect_key( $c, array( 'name' => 1, 'slug' => 1, 'description' => 1, 'parent' => 1, 'meta' => 1 ) ) );
		unset( $c['meta'] );
		return $c;
	}

	// Read handlers (spec 4.1).

	/** @return array */
	protected function op_get_setup( array $a ) {
		$api   = $this->api();
		$write = array();
		if ( $api->supported() ) {
			foreach ( (array) require __DIR__ . '/ops/tec-write.php' as $name => $op ) {
				if ( 'cap_category' === $op['cap'] && ! $api->can( 'publish_tribe_events' ) ) {
					continue;
				}
				if ( ! $this->check_permission() ) {
					continue;
				}
				$write[] = $name;
			}
		}
		return array(
			'tec_version'        => $api->version_string(),
			'supported'          => $api->supported(),
			'may_create'         => $api->can( 'edit_tribe_events' ),
			'may_publish'        => $api->can( 'publish_tribe_events' ),
			'allowed_operations' => $write,
		) + $api->settings();
	}

	/** @return array */
	protected function op_list_events( array $a ) {
		$api     = $this->api();
		$filters = self::list_scope( $api, 'event', $a['status'] ?? null ) + array_intersect_key( $a, array_flip( array( 'start_after', 'end_before', 'search', 'category', 'venue_id', 'organizer_id', 'featured' ) ) );
		$page    = max( 1, (int) ( $a['page'] ?? 1 ) );
		$r       = $api->query( 'event', $filters, $page, self::PER_PAGE );
		$rows    = array();
		foreach ( $r['ids'] as $id ) {
			$v = self::event_view( $api, $id );
			if ( ! $v ) {
				continue;
			}
			$rows[] = array(
				'id'           => $id,
				'title'        => $v['event']['title'],
				'status'       => $v['event']['status'],
				'start'        => $v['event']['start_date'],
				'end'          => $v['event']['end_date'],
				'timezone'     => $v['event']['timezone'],
				'all_day'      => $v['event']['all_day'],
				'venue'        => $v['venue'],
				'organizers'   => $v['organizers'],
				'categories'   => $v['categories'],
				'event_status' => $v['event_status'],
				'url'          => $v['url'],
				'edit_url'     => $v['edit_url'],
			);
		}
		return array( 'events' => $rows, 'page' => $page, 'total' => $r['total'] );
	}

	/** @return array|WP_Error */
	protected function op_get_event( array $a ) {
		$v = self::event_view( $this->api(), (int) $a['event_id'] );
		return $v ? $v : self::not_found( 'event', (int) $a['event_id'] );
	}

	/** @return array */
	protected function list_linked( string $kind, array $a ): array {
		$api     = $this->api();
		$filters = self::list_scope( $api, $kind, $a['status'] ?? null ) + array_intersect_key( $a, array( 'search' => 1 ) );
		$page    = max( 1, (int) ( $a['page'] ?? 1 ) );
		$r       = $api->query( $kind, $filters, $page, self::PER_PAGE );
		$rows    = array();
		foreach ( $r['ids'] as $id ) {
			$v = self::linked_view( $api, $kind, $id );
			if ( ! $v ) {
				continue;
			}
			$row = array( 'id' => $id, 'title' => $v[ $kind ]['title'], 'status' => $v[ $kind ]['status'] );
			if ( 'venue' === $kind ) {
				$row += array( 'city' => $v[ $kind ]['city'], 'country' => $v[ $kind ]['country'] );
			} else {
				$row += array( 'email' => $v[ $kind ]['email'] );
			}
			$rows[] = $row + array( 'events' => count( $v['events'] ), 'version' => $v['version'] );
		}
		return array( $kind . 's' => $rows, 'page' => $page, 'total' => $r['total'] );
	}

	/** @return array */
	protected function op_list_venues( array $a ) {
		return $this->list_linked( 'venue', $a );
	}

	/** @return array */
	protected function op_list_organizers( array $a ) {
		return $this->list_linked( 'organizer', $a );
	}

	/** @return array|WP_Error */
	protected function op_get_venue( array $a ) {
		$v = self::linked_view( $this->api(), 'venue', (int) $a['venue_id'] );
		return $v ? $v : self::not_found( 'venue', (int) $a['venue_id'] );
	}

	/** @return array|WP_Error */
	protected function op_get_organizer( array $a ) {
		$v = self::linked_view( $this->api(), 'organizer', (int) $a['organizer_id'] );
		return $v ? $v : self::not_found( 'organizer', (int) $a['organizer_id'] );
	}

	/** @return array */
	protected function op_list_categories( array $a ) {
		$rows = array();
		foreach ( $this->api()->categories( (string) ( $a['search'] ?? '' ) ) as $id ) {
			$v = self::category_view( $this->api(), $id );
			if ( $v ) {
				$rows[] = $v;
			}
		}
		return array( 'categories' => $rows );
	}

	// Write rules (D5): TEC's own mapped capabilities, checked here because TEC's ORM checks none.

	protected function publishes( array $args ): bool {
		return in_array( (string) ( $args['status'] ?? '' ), array( 'publish', 'private' ), true );
	}

	/** @return true|WP_Error */
	protected function cap_create( string $kind, array $args ) {
		$plural = self::PLURAL[ $kind ];
		if ( ! $this->api()->can( 'edit_' . $plural ) ) {
			return self::forbidden();
		}
		return $this->publishes( $args ) && ! $this->api()->can( 'publish_' . $plural ) ? self::forbidden() : true;
	}

	/** @return true|WP_Error */
	protected function cap_edit( string $kind, int $id, array $args ) {
		if ( EMCP_Tools_TEC_Api::TYPES[ $kind ] !== $this->api()->post_type( $id ) ) {
			return self::not_found( $kind, $id );
		}
		if ( 'trash' === $this->api()->post_status( $id ) ) {
			/* translators: %s: kind. */
			return new WP_Error( 'in_trash', sprintf( __( 'This %s is in the trash; undo its trash in History first.', 'emcp-tools' ), $kind ), array( 'status' => 409 ) );
		}
		if ( ! $this->api()->can( 'edit_post', $id ) ) {
			return self::forbidden();
		}
		return $this->publishes( $args ) && ! $this->api()->can( 'publish_' . self::PLURAL[ $kind ] ) ? self::forbidden() : true;
	}

	/** @return true|WP_Error */
	protected function cap_create_event( array $args ) {
		return $this->cap_create( 'event', $args );
	}

	/** @return true|WP_Error */
	protected function cap_edit_event( array $args ) {
		return $this->cap_edit( 'event', (int) $args['event_id'], $args );
	}

	protected function writer(): EMCP_Tools_TEC_Writer {
		return new EMCP_Tools_TEC_Writer( $this->api() );
	}

	protected static function changes( array $a, array $control ): array {
		return array_diff_key( $a, array_flip( array_merge( array( 'force', 'version' ), $control ) ) );
	}

	// Write handlers: events (spec 4.2).

	/** @return array|WP_Error */
	protected function op_create_event( array $a ) {
		return $this->writer()->create_event( self::changes( $a, array() ) );
	}

	/** @return array|WP_Error */
	protected function op_update_event( array $a ) {
		return $this->writer()->update_event( (int) $a['event_id'], $a['version'] ?? null, ! empty( $a['force'] ), self::changes( $a, array( 'event_id' ) ) );
	}

	/** @return array|WP_Error */
	protected function op_set_event_status( array $a ) {
		return $this->writer()->set_event_status( (int) $a['event_id'], $a['version'] ?? null, ! empty( $a['force'] ), (string) $a['event_status'], (string) ( $a['reason'] ?? '' ) );
	}

	/** @return true|WP_Error */
	protected function cap_trash( string $kind, int $id ) {
		if ( EMCP_Tools_TEC_Api::TYPES[ $kind ] !== $this->api()->post_type( $id ) ) {
			return self::not_found( $kind, $id );
		}
		if ( 'trash' === $this->api()->post_status( $id ) ) {
			/* translators: %s: kind. */
			return new WP_Error( 'in_trash', sprintf( __( 'This %s is in the trash already.', 'emcp-tools' ), $kind ), array( 'status' => 409 ) );
		}
		return $this->api()->can( 'delete_post', $id ) ? true : self::forbidden();
	}

	/** @return true|WP_Error */
	protected function cap_trash_event( array $args ) {
		return $this->cap_trash( 'event', (int) $args['event_id'] );
	}

	/** @return true|WP_Error */
	protected function cap_create_venue( array $args ) {
		return $this->cap_create( 'venue', $args );
	}

	/** @return true|WP_Error */
	protected function cap_edit_venue( array $args ) {
		return $this->cap_edit( 'venue', (int) $args['venue_id'], $args );
	}

	/** @return true|WP_Error */
	protected function cap_trash_venue( array $args ) {
		return $this->cap_trash( 'venue', (int) $args['venue_id'] );
	}

	/** @return true|WP_Error */
	protected function cap_create_organizer( array $args ) {
		return $this->cap_create( 'organizer', $args );
	}

	/** @return true|WP_Error */
	protected function cap_edit_organizer( array $args ) {
		return $this->cap_edit( 'organizer', (int) $args['organizer_id'], $args );
	}

	/** @return true|WP_Error */
	protected function cap_trash_organizer( array $args ) {
		return $this->cap_trash( 'organizer', (int) $args['organizer_id'] );
	}

	// Write handlers: trash, venues, organizers (spec 4.2).

	/** @return array|WP_Error */
	protected function op_trash_event( array $a ) {
		return $this->writer()->trash( 'event', (int) $a['event_id'], $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	/** @return array|WP_Error */
	protected function op_trash_venue( array $a ) {
		return $this->writer()->trash( 'venue', (int) $a['venue_id'], $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	/** @return array|WP_Error */
	protected function op_trash_organizer( array $a ) {
		return $this->writer()->trash( 'organizer', (int) $a['organizer_id'], $a['version'] ?? null, ! empty( $a['force'] ) );
	}

	/** @return array|WP_Error */
	protected function op_create_venue( array $a ) {
		return $this->writer()->create_linked( 'venue', self::changes( $a, array() ) );
	}

	/** @return array|WP_Error */
	protected function op_update_venue( array $a ) {
		return $this->writer()->update_linked( 'venue', (int) $a['venue_id'], $a['version'] ?? null, ! empty( $a['force'] ), self::changes( $a, array( 'venue_id' ) ) );
	}

	/** @return array|WP_Error */
	protected function op_create_organizer( array $a ) {
		return $this->writer()->create_linked( 'organizer', self::changes( $a, array() ) );
	}

	/** @return array|WP_Error */
	protected function op_update_organizer( array $a ) {
		return $this->writer()->update_linked( 'organizer', (int) $a['organizer_id'], $a['version'] ?? null, ! empty( $a['force'] ), self::changes( $a, array( 'organizer_id' ) ) );
	}

	// Categories (D16, D23).

	/** @return true|WP_Error */
	protected function cap_category( array $args ) {
		if ( ! $this->api()->can( 'publish_tribe_events' ) ) {
			return self::forbidden();
		}
		if ( isset( $args['category_id'] ) && ! $this->api()->category( (int) $args['category_id'] ) ) {
			return self::not_found( 'event category', (int) $args['category_id'] );
		}
		return true;
	}

	/** @return array|WP_Error */
	protected function op_create_category( array $a ) {
		return $this->writer()->create_category( self::changes( $a, array() ) );
	}

	/** @return array|WP_Error */
	protected function op_update_category( array $a ) {
		return $this->writer()->update_category( (int) $a['category_id'], $a['version'] ?? null, ! empty( $a['force'] ), self::changes( $a, array( 'category_id' ) ) );
	}
}
