<?php
/**
 * Shared engine for the FunnelKit dispatcher tools: operation catalog, argument
 * validation, confirm and dry_run gates, Pro add-on gating and History.
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
abstract class EMCP_Tools_FunnelKit_Dispatcher {

	/** Seconds a call waits on a FunnelKit job before handing back a status operation. */
	const POLL_SECONDS = 60;

	/** @var int Poll budget; tests lower it. */
	protected $poll_seconds = self::POLL_SECONDS;

	/** @return array<string,array> Operation rows (see the plan's schema). */
	abstract protected function operations(): array;

	/** @return string read or write. */
	abstract protected function tool_mode(): string;

	protected function rest(): EMCP_Tools_FunnelKit_Rest {
		return new EMCP_Tools_FunnelKit_Rest();
	}

	protected function history(): ?EMCP_Tools_FunnelKit_History {
		if ( ! class_exists( 'EMCP_Tools_FunnelKit_History' ) ) {
			return null;
		}
		EMCP_Tools_FunnelKit_History::boot();
		return EMCP_Tools_FunnelKit_History::instance();
	}

	protected function addon_active( string $addon ): bool {
		switch ( $addon ) {
			case 'funnel-builder-pro':
				return defined( 'WFFN_PRO_VERSION' );
			case 'automations-pro':
				return defined( 'BWFAN_PRO_VERSION' );
			default:
				return true;
		}
	}

	/** @return array */
	public function catalog(): array {
		$ops = array();
		foreach ( $this->operations() as $name => $op ) {
			if ( '' !== ( $op['pro'] ?? '' ) && ! $this->addon_active( (string) $op['pro'] ) ) {
				continue;
			}
			$required = array();
			$args     = array();
			foreach ( (array) ( $op['args'] ?? array() ) as $arg => $type ) {
				$args[ $arg ] = rtrim( (string) $type, '!' );
				if ( '!' === substr( (string) $type, -1 ) ) {
					$required[] = $arg;
				}
			}
			$ops[] = array(
				'name'        => $name,
				'method'      => $op['method'],
				'route'       => $op['route'],
				'arguments'   => $args,
				'required'    => $required,
				'confirm'     => ! empty( $op['confirm'] ),
				'dry_run'     => ! empty( $op['dry_run'] ),
				'pro'         => (string) ( $op['pro'] ?? '' ),
				'undo'        => isset( $op['history']['irreversible'] ) ? 'not undoable: ' . $op['history']['irreversible'] : ( empty( $op['history'] ) ? 'not recorded' : 'undoable' ),
				'description' => $op['desc'],
			);
		}
		return array( 'mode' => $this->tool_mode(), 'operations' => $ops );
	}

	/**
	 * Ability execute callback.
	 *
	 * @param mixed $input { operation?, arguments? }.
	 * @return array|WP_Error
	 */
	public function run( $input ) {
		$name = is_array( $input ) && isset( $input['operation'] ) ? str_replace( '_', '-', sanitize_key( (string) $input['operation'] ) ) : '';
		if ( '' === $name ) {
			return $this->catalog();
		}
		$ops = $this->operations();
		if ( ! isset( $ops[ $name ] ) ) {
			/* translators: %s: operation name. */
			return new WP_Error( 'unknown_operation', sprintf( __( 'Unknown operation "%s". Call the tool with no operation to list the available operations.', 'emcp-tools' ), $name ) );
		}
		$op = $ops[ $name ];
		if ( '' !== ( $op['pro'] ?? '' ) && ! $this->addon_active( (string) $op['pro'] ) ) {
			return new WP_Error( 'pro_addon_required', __( 'This operation needs the FunnelKit Pro add-on, which is not active.', 'emcp-tools' ) );
		}
		$args = is_array( $input ) && isset( $input['arguments'] ) && is_array( $input['arguments'] ) ? $input['arguments'] : array();

		$dry_run = false;
		if ( array_key_exists( 'dry_run', $args ) ) {
			if ( empty( $op['dry_run'] ) || ! is_bool( $args['dry_run'] ) ) {
				return new WP_Error( 'invalid_argument', __( 'dry_run must be a boolean and is only supported where the operation list says so.', 'emcp-tools' ) );
			}
			$dry_run = $args['dry_run'];
			unset( $args['dry_run'] );
		}
		$confirmed = array_key_exists( 'confirm', $args ) && true === $args['confirm'];
		unset( $args['confirm'] );

		$clean = $this->validate( (array) ( $op['args'] ?? array() ), $args );
		if ( is_wp_error( $clean ) ) {
			return $clean;
		}
		if ( ! empty( $op['confirm'] ) && ! $confirmed && ! $dry_run ) {
			return new WP_Error( 'confirmation_required', __( 'This operation deletes data, sends messages or cannot be undone. Pass confirm:true in arguments to proceed.', 'emcp-tools' ) );
		}

		list( $route, $params ) = self::fill_route( (string) $op['route'], $clean );
		// Handlers that read the raw body (get_body / get_json_params) get the named argument as the whole body.
		if ( ! empty( $op['body'] ) ) {
			$params = (array) ( $clean[ $op['body'] ] ?? array() );
		}

		if ( ! empty( $op['handler'] ) ) {
			return call_user_func( array( $this, $op['handler'] ), $name, $op, $clean, $route, $params, $dry_run );
		}
		if ( $dry_run ) {
			return $this->dry_run_answer( $name, $op, $route, $params, array() );
		}
		return $this->execute( $name, $op, $route, $params, $clean );
	}

	/** Shared dry_run answer; handlers add their own `preflight` fields. */
	protected function dry_run_answer( string $name, array $op, string $route, array $params, array $preflight ): array {
		return array_merge(
			array(
				'dry_run'   => true,
				'operation' => $name,
				'request'   => array( 'method' => $op['method'], 'route' => $route, 'params' => $params ),
				'undo'      => isset( $op['history']['irreversible'] ) ? array( 'available' => false, 'reason' => $op['history']['irreversible'] ) : array( 'available' => ! empty( $op['history'] ) ),
			),
			$preflight
		);
	}

	/**
	 * Send the request, recording History around it for writes.
	 *
	 * @return array|WP_Error
	 */
	protected function execute( string $name, array $op, string $route, array $params, array $args, array $files = array() ) {
		$history = ( 'write' === $op['mode'] && ! empty( $op['history'] ) ) ? $this->history() : null;
		$ticket  = $history ? $history->before( $name, (array) $op['history'], $args ) : null;
		if ( is_wp_error( $ticket ) ) {
			return $ticket;
		}
		$rest   = $this->rest();
		// capture: the handler answers through wp_send_json() (Task 1 'sends-json'), see Rest::request_captured().
		$result = empty( $op['capture'] )
			? $rest->request( (string) $op['method'], $route, $params, $files )
			: $rest->request_captured( (string) $op['method'], $route, $params, $files );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$out = array( 'operation' => $name, 'result' => $result );
		if ( $history && null !== $ticket ) {
			$out['change'] = $history->after( $ticket, $name, (array) $op['history'], $args, $result, $rest->last_message() );
		}
		return $out;
	}

	/**
	 * Delete several records in one FunnelKit request, with one History entry per record, each
	 * undoable alone. Only for deletes that stay inside their scope (Task 1 cascade audit).
	 */
	protected function op_delete_many( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		$ids = array_values( array_unique( array_filter( array_map( 'absint', (array) $args[ $op['history']['key'] ] ) ) ) );
		if ( ! $ids ) {
			return new WP_Error( 'invalid_argument', __( 'Pass at least one ID.', 'emcp-tools' ) );
		}
		$params[ $op['history']['key'] ] = $ids;
		if ( $dry_run ) {
			return $this->dry_run_answer( $name, $op, $route, $params, array( 'preflight' => array( 'count' => count( $ids ) ) ) );
		}
		$history = $this->history();
		$one     = array( 'scope' => (string) $op['history']['scope'], 'key' => 'id' );
		$tickets = array();
		foreach ( $ids as $id ) {
			$tickets[ $id ] = $history ? $history->before( $name, $one, array( 'id' => $id ) ) : null;
		}
		$rest   = $this->rest();
		$result = $rest->request( (string) $op['method'], $route, $params );
		if ( is_wp_error( $result ) ) {
			return $result;
		}
		$changes = array();
		foreach ( $tickets as $id => $ticket ) {
			if ( $history && is_array( $ticket ) ) {
				$changes[ $id ] = $history->after( $ticket, $name, $one, array( 'id' => $id ), $result, $rest->last_message() );
			}
		}
		return array( 'operation' => $name, 'result' => $result, 'changes' => $changes );
	}

	/**
	 * One FunnelKit request per item of `tags` (create-tags answers get-or-create for the whole list),
	 * so each created record has its own reported ID, message and History entry.
	 */
	protected function op_one_per_request( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		$items = array_values( (array) $args['tags'] );
		if ( ! $items ) {
			return new WP_Error( 'invalid_argument', __( 'Pass at least one name.', 'emcp-tools' ) );
		}
		if ( $dry_run ) {
			return $this->dry_run_answer( $name, $op, $route, $params, array( 'preflight' => array( 'requests' => count( $items ) ) ) );
		}
		$done = array();
		foreach ( $items as $item ) {
			$one = $this->execute( $name, $op, $route, array( 'tags' => array( $item ) ), array( 'tags' => array( $item ) ) );
			if ( is_wp_error( $one ) ) {
				return $done ? array( 'operation' => $name, 'items' => $done, 'error' => $one->get_error_message() ) : $one;
			}
			$done[] = $one;
		}
		return array( 'operation' => $name, 'items' => $done );
	}

	/**
	 * Inline JSON import (capped), handed to FunnelKit as the uploaded file it expects. Both importers
	 * read get_file_params()['files'] with file_get_contents( tmp_name ), never move_uploaded_file(),
	 * and refuse a name without the .json extension.
	 */
	protected function op_import_inline( string $name, array $op, array $args, string $route, array $params, bool $dry_run ) {
		$json = (string) wp_json_encode( $args['data'] );
		if ( strlen( $json ) > EMCP_Tools_FunnelKit_Rest::MAX_BYTES ) {
			return self::cap_payload( $args['data'] );
		}
		// FunnelKit's template and automation importers loop and report only the last ID, so one entry per call keeps undo exact.
		if ( ! empty( $op['single'] ) && 1 !== count( (array) $args['data'] ) ) {
			return new WP_Error( 'invalid_argument', __( 'Import one item per call, so History can undo exactly what it created.', 'emcp-tools' ) );
		}
		if ( 'import-funnels' === $name ) {
			foreach ( (array) $args['data'] as $entry ) {
				// import_from_json_data() adds the steps of an entry with an id to that existing funnel.
				if ( ! is_array( $entry ) || ! empty( $entry['id'] ) ) {
					return new WP_Error( 'invalid_argument', __( 'Each imported funnel must be an object without an "id": an id adds its steps to that existing funnel. Pass the export-funnels output as it is.', 'emcp-tools' ) );
				}
			}
		}
		unset( $params['data'] );
		if ( $dry_run ) {
			return $this->dry_run_answer( $name, $op, $route, $params + array( 'file' => strlen( $json ) . ' bytes' ), array() );
		}
		$tmp = wp_tempnam( 'emcp-funnelkit-import.json' );
		if ( ! $tmp || false === file_put_contents( $tmp, $json ) ) { // phpcs:ignore WordPress.WP.AlternativeFunctions
			return new WP_Error( 'import_failed', __( 'Could not write the import to a temporary file.', 'emcp-tools' ) );
		}
		try {
			$files = array(
				'files' => array(
					'name'     => 'emcp-import.json',
					'type'     => 'application/json',
					'tmp_name' => $tmp,
					'error'    => 0,
					'size'     => strlen( $json ),
				),
			);
			return $this->execute( $name, $op, $route, $params, $args, $files );
		} finally {
			wp_delete_file( $tmp );
		}
	}

	/** @return array|WP_Error */
	private function validate( array $schema, array $args ) {
		return EMCP_Tools_Op_Args::validate( $schema, $args );
	}

	/** @return array{0:string,1:array} Route with placeholders filled, and the remaining params. */
	private static function fill_route( string $route, array $args ): array {
		$params = $args;
		$filled = preg_replace_callback(
			'/\{([a-z_]+)\}/',
			static function ( $m ) use ( &$params ) {
				$value = (string) ( $params[ $m[1] ] ?? '' );
				unset( $params[ $m[1] ] );
				return rawurlencode( $value );
			},
			$route
		);
		return array( (string) $filled, $params );
	}

	/**
	 * Wait on a FunnelKit job.
	 *
	 * @param string   $status_operation Operation an agent calls to continue.
	 * @param array    $args             Its arguments.
	 * @param callable $done             Returns the final data, or false while pending.
	 * @param int|null $seconds          Override for tests.
	 * @return mixed
	 */
	protected function poll( string $status_operation, array $args, callable $done, ?int $seconds = null ) {
		$deadline = microtime( true ) + ( null === $seconds ? $this->poll_seconds : $seconds );
		do {
			$result = $done();
			if ( false !== $result ) {
				return $result;
			}
			if ( microtime( true ) >= $deadline ) {
				break;
			}
			usleep( 1000000 );
		} while ( true );
		return array( 'pending' => true, 'status_operation' => $status_operation, 'arguments' => $args );
	}

	/** @return mixed|WP_Error */
	protected static function cap_payload( $data ) {
		$bytes = strlen( (string) wp_json_encode( $data ) );
		if ( $bytes > EMCP_Tools_FunnelKit_Rest::MAX_BYTES ) {
			/* translators: 1: size in bytes, 2: limit in bytes. */
			return new WP_Error( 'payload_too_large', sprintf( __( 'The payload is %1$d bytes, over the %2$d byte limit for one call. Use the FunnelKit admin for this one.', 'emcp-tools' ), $bytes, EMCP_Tools_FunnelKit_Rest::MAX_BYTES ) );
		}
		return $data;
	}
}
