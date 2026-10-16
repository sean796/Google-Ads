<?php
/**
 * The only class that touches Amelia (spec 4.3): Amelia's own Slim controllers run in-process the
 * way Amelia's abilities run them (D2), Amelia's tables read for views, versions and before-images,
 * the statements this process sends to them recorded for attribution after a throw (D7), and the
 * direct restores undo and recovery need (D13). Unit tests swap in Fake_Amelia_Api, which replaces
 * only the storage primitives and the controller invocation.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/** @since 3.19.0 */
class EMCP_Tools_Amelia_Api {

	/** EMCP's controller names => Amelia's classes under AmeliaBooking\Application\Controller. */
	const CONTROLLERS = array(
		'get-category'              => 'Bookable\Category\GetCategoryController',
		'add-category'              => 'Bookable\Category\AddCategoryController',
		'update-category'           => 'Bookable\Category\UpdateCategoryController',
		'delete-category'           => 'Bookable\Category\DeleteCategoryController',
		'category-delete-effect'    => 'Bookable\Category\GetCategoryDeleteEffectController',
		'get-service'               => 'Bookable\Service\GetServiceController',
		'add-service'               => 'Bookable\Service\AddServiceController',
		'update-service'            => 'Bookable\Service\UpdateServiceController',
		'update-service-status'     => 'Bookable\Service\UpdateServiceStatusController',
		'delete-service'            => 'Bookable\Service\DeleteServiceController',
		'service-delete-effect'     => 'Bookable\Service\GetServiceDeleteEffectController',
		'get-employee'              => 'User\Provider\GetProviderController',
		'add-employee'              => 'User\Provider\AddProviderController',
		'update-employee'           => 'User\Provider\UpdateProviderController',
		'update-employee-status'    => 'User\Provider\UpdateProviderStatusController',
		'get-customer'              => 'User\Customer\GetCustomerController',
		'add-customer'              => 'User\Customer\AddCustomerController',
		'update-customer'           => 'User\Customer\UpdateCustomerController',
		'delete-user'               => 'User\DeleteUserController',
		'user-delete-effect'        => 'User\GetUserDeleteEffectController',
		'time-slots'                => 'Booking\Appointment\GetTimeSlotsController',
		'get-appointment'           => 'Booking\Appointment\GetAppointmentController',
		'add-appointment'           => 'Booking\Appointment\AddAppointmentController',
		'update-appointment'        => 'Booking\Appointment\UpdateAppointmentController',
		'update-appointment-time'   => 'Booking\Appointment\UpdateAppointmentTimeController',
		'update-appointment-status' => 'Booking\Appointment\UpdateAppointmentStatusController',
		'update-booking-status'     => 'Booking\Appointment\UpdateBookingStatusController',
		'add-booking'               => 'Booking\Appointment\AddBookingController',
		'get-event'                 => 'Booking\Event\GetEventController',
		'add-event'                 => 'Booking\Event\AddEventController',
		'update-event'              => 'Booking\Event\UpdateEventController',
		'update-event-status'       => 'Booking\Event\UpdateEventStatusController',
		'update-event-booking'      => 'Booking\Event\UpdateEventBookingController',
	);

	/** Amelia's 409 answers by the key in their data (or their message) => EMCP's codes. */
	const CONFLICTS = array(
		'timeSlotUnavailable'   => 'time_slot_unavailable',
		'customerAlreadyBooked'   => 'customer_already_booked',
		'eventBookingUnavailable' => 'event_full',
		'Email already exist.'  => 'email_exists',
	);

	/** Columns Amelia changes on its own, never in a version (D12). */
	const VOLATILE = array( 'error', 'created', 'actionsCompleted', 'usedTokens' );

	/** The tables an object spans (D12, spec 4.3), in the order rows() reads them. */
	const KINDS = array(
		'category'    => array( 'categories' ),
		'service'     => array( 'services', 'providers_to_services' ),
		'employee'    => array( 'users', 'providers_to_services', 'providers_to_weekdays', 'providers_to_periods', 'providers_to_periods_services', 'providers_to_periods_location', 'providers_to_timeouts', 'providers_to_daysoff', 'providers_to_specialdays', 'providers_to_specialdays_periods', 'providers_to_specialdays_periods_services', 'providers_to_specialdays_periods_location', 'providers_to_locations' ),
		'customer'    => array( 'users' ),
		'appointment' => array( 'appointments', 'customer_bookings', 'customer_bookings_to_extras', 'payments' ),
		'event'       => array( 'events', 'events_periods', 'events_tags', 'events_to_providers', 'events_to_tickets', 'customer_bookings_to_events_periods', 'customer_bookings', 'customer_bookings_to_events_tickets', 'payments' ),
		'booking'     => array( 'customer_bookings', 'customer_bookings_to_events_periods', 'customer_bookings_to_events_tickets', 'customer_bookings_to_extras', 'payments' ),
	);

	/** @var object|null Amelia's container, built once per process. */
	private static $container = null;

	// Environment.

	public function active(): bool {
		return defined( 'AMELIA_VERSION' ) && class_exists( 'AmeliaBooking\Plugin' );
	}

	public function version_string(): string {
		return defined( 'AMELIA_VERSION' ) ? (string) AMELIA_VERSION : '';
	}

	/** Amelia 2.4 to below 3 (D18). */
	public function supported(): bool {
		$v = $this->version_string();
		return $this->active() && '' !== $v && version_compare( $v, '2.4', '>=' ) && version_compare( $v, '3.0', '<' );
	}

	/** Lite, or the licence level of a premium build. */
	public function edition(): string {
		if ( class_exists( 'AmeliaBooking\Infrastructure\Licence\Licence' ) ) {
			return (string) \AmeliaBooking\Infrastructure\Licence\Licence::getLicence();
		}
		return '';
	}

	// Controllers (D2).

	public function controller( string $name ): string {
		return isset( self::CONTROLLERS[ $name ] ) ? 'AmeliaBooking\Application\Controller\\' . self::CONTROLLERS[ $name ] : '';
	}

	/**
	 * Runs one Amelia controller and decodes its answer. Any throwable: ROLLBACK on the shared
	 * connection (Amelia opens transactions on $wpdb and some handlers leave them open, spike item 6)
	 * and amelia_error.
	 *
	 * @return array|WP_Error Amelia's data
	 */
	public function call( string $name, array $params = array(), array $route = array(), string $method = 'POST' ) {
		$class = $this->controller( $name );
		if ( '' === $class ) {
			return new WP_Error( 'amelia_error', 'Unknown Amelia controller ' . $name . '.' );
		}
		try {
			$r = $this->invoke( $class, $params, $route, $method );
		} catch ( \Throwable $e ) {
			$this->rollback();
			/* translators: %s: Amelia's error message. */
			return new WP_Error( 'amelia_error', sprintf( __( 'Amelia could not complete this: %s', 'emcp-tools' ), $e->getMessage() ), array( 'exception' => get_class( $e ) ) );
		}
		$status  = (int) ( $r['status'] ?? 500 );
		$data    = $r['data'] ?? array();
		$message = (string) ( $r['message'] ?? '' );
		if ( $status >= 200 && $status < 300 ) {
			return is_array( $data ) ? $data : array( 'value' => $data );
		}
		if ( 403 === $status ) {
			return new WP_Error( 'forbidden', __( 'Amelia does not allow you to do this.', 'emcp-tools' ), array( 'status' => 403, 'amelia_message' => $message ) );
		}
		if ( 409 === $status ) {
			foreach ( self::CONFLICTS as $key => $code ) {
				if ( ( is_array( $data ) && ! empty( $data[ $key ] ) ) || $message === $key ) {
					return new WP_Error( $code, '' !== $message ? $message : $code, array( 'status' => 409 ) );
				}
			}
			if ( 0 === strpos( $name, 'delete-' ) ) {
				return new WP_Error( 'in_use', '' !== $message ? $message : __( 'Amelia refused the delete.', 'emcp-tools' ), array( 'status' => 409 ) );
			}
		}
		/* translators: %s: Amelia's message. */
		return new WP_Error( 'amelia_refused', sprintf( __( 'Amelia refused this: %s', 'emcp-tools' ), '' !== $message ? $message : (string) $status ), array( 'status' => $status ) );
	}

	/**
	 * A server request, the controller, $validApiCall = true: AmeliaAbilitiesRegistrar::invokeApplication().
	 *
	 * @return array{status: int, message: string, data: mixed}
	 */
	protected function invoke( string $class, array $params, array $route, string $method ): array {
		if ( null === self::$container ) {
			self::$container = require AMELIA_PATH . '/src/Infrastructure/ContainerConfig/container.php';
		}
		$uri = 'http://127.0.0.1/';
		if ( 'GET' === $method && $params ) {
			$uri .= '?' . http_build_query( $params );
		}
		$request = ( new \Slim\Psr7\Factory\ServerRequestFactory() )->createServerRequest( $method, $uri )->withHeader( 'Content-Type', 'application/json' );
		if ( 'GET' !== $method ) {
			$request = $request->withParsedBody( $params );
		}
		$controller = new $class( self::$container );
		$response   = $controller( $request, ( new \Slim\Psr7\Factory\ResponseFactory() )->createResponse(), $route, true );
		$body       = json_decode( (string) $response->getBody(), true );
		return array(
			'status'  => (int) $response->getStatusCode(),
			'message' => is_array( $body ) ? (string) ( $body['message'] ?? '' ) : '',
			'data'    => is_array( $body ) && array_key_exists( 'data', $body ) ? $body['data'] : $body,
		);
	}

	// Storage primitives (the fake replaces these).

	/** @return array<int,array> id => row */
	protected function select( string $table, string $column, array $values ): array {
		global $wpdb;
		$values = array_values( array_unique( array_map( 'intval', $values ) ) );
		if ( ! $values ) {
			return array();
		}
		$column = preg_replace( '/[^A-Za-z]/', '', $column );
		$sql    = 'SELECT * FROM ' . $this->table( $table ) . " WHERE `{$column}` IN (" . implode( ',', $values ) . ') ORDER BY id';
		$out    = array();
		foreach ( (array) $wpdb->get_results( $sql, ARRAY_A ) as $row ) { // phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			$out[ (int) $row['id'] ] = $row;
		}
		return $out;
	}

	protected function replace_row( string $table, array $row ): bool {
		global $wpdb;
		return false !== $wpdb->replace( $this->table( $table ), $row );
	}

	protected function delete_row( string $table, int $id ): bool {
		global $wpdb;
		return false !== $wpdb->delete( $this->table( $table ), array( 'id' => $id ) );
	}

	protected function begin(): void {
		global $wpdb;
		$wpdb->query( 'START TRANSACTION' );
	}

	protected function commit(): void {
		global $wpdb;
		$wpdb->query( 'COMMIT' );
	}

	public function rollback(): void {
		global $wpdb;
		if ( $wpdb ) {
			$wpdb->query( 'ROLLBACK' );
		}
	}

	protected function table( string $name ): string {
		global $wpdb;
		return $wpdb->prefix . 'amelia_' . preg_replace( '/[^a-z_]/', '', $name );
	}

	// Rows (D12, D13).

	protected static function ids( array $rows, string $column = 'id' ): array {
		return array_values( array_unique( array_map( 'intval', array_column( $rows, $column ) ) ) );
	}

	/**
	 * Every row of an object across its tables, raw as stored (UTC, seconds): table => id => row.
	 * Empty when the object does not exist.
	 *
	 * @return array<string,array<int,array>>
	 */
	public function rows( string $kind, int $id ): array {
		$s = array( $this, 'select' );
		$t = array_fill_keys( self::KINDS[ $kind ] ?? array(), array() );
		switch ( $kind ) {
			case 'category':
				$t['categories'] = $s( 'categories', 'id', array( $id ) );
				if ( ! $t['categories'] ) {
					return array();
				}
				break;
			case 'service':
				$t['services'] = $s( 'services', 'id', array( $id ) );
				if ( ! $t['services'] ) {
					return array();
				}
				$t['providers_to_services'] = $s( 'providers_to_services', 'serviceId', array( $id ) );
				break;
			case 'employee':
			case 'customer':
				$users = $s( 'users', 'id', array( $id ) );
				$type  = 'employee' === $kind ? 'provider' : 'customer';
				if ( ! $users || $type !== $users[ $id ]['type'] ) {
					return array();
				}
				$t['users'] = $users;
				if ( 'customer' === $kind ) {
					break;
				}
				$t['providers_to_services']                     = $s( 'providers_to_services', 'userId', array( $id ) );
				$t['providers_to_weekdays']                     = $s( 'providers_to_weekdays', 'userId', array( $id ) );
				$t['providers_to_periods']                      = $s( 'providers_to_periods', 'weekDayId', self::ids( $t['providers_to_weekdays'] ) );
				$t['providers_to_periods_services']             = $s( 'providers_to_periods_services', 'periodId', self::ids( $t['providers_to_periods'] ) );
				$t['providers_to_periods_location']             = $s( 'providers_to_periods_location', 'periodId', self::ids( $t['providers_to_periods'] ) );
				$t['providers_to_timeouts']                     = $s( 'providers_to_timeouts', 'weekDayId', self::ids( $t['providers_to_weekdays'] ) );
				$t['providers_to_daysoff']                      = $s( 'providers_to_daysoff', 'userId', array( $id ) );
				$t['providers_to_specialdays']                  = $s( 'providers_to_specialdays', 'userId', array( $id ) );
				$t['providers_to_specialdays_periods']          = $s( 'providers_to_specialdays_periods', 'specialDayId', self::ids( $t['providers_to_specialdays'] ) );
				$t['providers_to_specialdays_periods_services'] = $s( 'providers_to_specialdays_periods_services', 'periodId', self::ids( $t['providers_to_specialdays_periods'] ) );
				$t['providers_to_specialdays_periods_location'] = $s( 'providers_to_specialdays_periods_location', 'periodId', self::ids( $t['providers_to_specialdays_periods'] ) );
				$t['providers_to_locations']                    = $s( 'providers_to_locations', 'userId', array( $id ) );
				break;
			case 'appointment':
				$t['appointments'] = $s( 'appointments', 'id', array( $id ) );
				if ( ! $t['appointments'] ) {
					return array();
				}
				$t['customer_bookings']           = $s( 'customer_bookings', 'appointmentId', array( $id ) );
				$b                                = self::ids( $t['customer_bookings'] );
				$t['customer_bookings_to_extras'] = $s( 'customer_bookings_to_extras', 'customerBookingId', $b );
				$t['payments']                    = $s( 'payments', 'customerBookingId', $b );
				break;
			case 'event':
				$t['events'] = $s( 'events', 'id', array( $id ) );
				if ( ! $t['events'] ) {
					return array();
				}
				$t['events_periods']                      = $s( 'events_periods', 'eventId', array( $id ) );
				$t['events_tags']                         = $s( 'events_tags', 'eventId', array( $id ) );
				$t['events_to_providers']                 = $s( 'events_to_providers', 'eventId', array( $id ) );
				$t['events_to_tickets']                   = $s( 'events_to_tickets', 'eventId', array( $id ) );
				$t['customer_bookings_to_events_periods'] = $s( 'customer_bookings_to_events_periods', 'eventPeriodId', self::ids( $t['events_periods'] ) );
				$b                                        = self::ids( $t['customer_bookings_to_events_periods'], 'customerBookingId' );
				$t['customer_bookings']                   = $s( 'customer_bookings', 'id', $b );
				$t['customer_bookings_to_events_tickets'] = $s( 'customer_bookings_to_events_tickets', 'customerBookingId', $b );
				$t['payments']                            = $s( 'payments', 'customerBookingId', $b );
				break;
			case 'booking':
				$t['customer_bookings'] = $s( 'customer_bookings', 'id', array( $id ) );
				if ( ! $t['customer_bookings'] ) {
					return array();
				}
				$t['customer_bookings_to_events_periods'] = $s( 'customer_bookings_to_events_periods', 'customerBookingId', array( $id ) );
				$t['customer_bookings_to_events_tickets'] = $s( 'customer_bookings_to_events_tickets', 'customerBookingId', array( $id ) );
				$t['customer_bookings_to_extras']         = $s( 'customer_bookings_to_extras', 'customerBookingId', array( $id ) );
				$t['payments']                            = $s( 'payments', 'customerBookingId', array( $id ) );
				break;
			default:
				return array();
		}
		return $t;
	}

	/** One row of a table by id, or null. */
	public function row( string $table, int $id ): ?array {
		$r = $this->select( $table, 'id', array( $id ) );
		return $r[ $id ] ?? null;
	}

	/** Rows of a table by a column. @return array<int,array> */
	public function rows_where( string $table, string $column, array $values ): array {
		return $this->select( $table, $column, $values );
	}

	/**
	 * Puts every before-image row back (by id) and deletes the rows present now whose ids the
	 * before-image lacks (Amelia replaces child rows with new ids, spike item 8), in one transaction.
	 */
	public function restore_rows( array $before, array $current ): bool {
		$this->begin();
		foreach ( $current as $table => $rows ) {
			foreach ( array_diff( array_keys( (array) $rows ), array_keys( (array) ( $before[ $table ] ?? array() ) ) ) as $id ) {
				if ( ! $this->delete_row( $table, (int) $id ) ) {
					$this->rollback();
					return false;
				}
			}
		}
		foreach ( $before as $table => $rows ) {
			foreach ( (array) $rows as $row ) {
				if ( ! $this->replace_row( $table, $row ) ) {
					$this->rollback();
					return false;
				}
			}
		}
		$this->commit();
		return true;
	}

	/** Deletes rows (table => id => row, or table => ids) in one transaction. */
	public function delete_rows( array $rows ): bool {
		$this->begin();
		foreach ( $rows as $table => $list ) {
			foreach ( (array) $list as $k => $v ) {
				$id = is_array( $v ) ? (int) ( $v['id'] ?? $k ) : (int) $v;
				if ( ! $this->delete_row( $table, $id ) ) {
					$this->rollback();
					return false;
				}
			}
		}
		$this->commit();
		return true;
	}

	// Attribution (D7).

	/**
	 * Runs $fn while recording this process's INSERT, REPLACE, UPDATE and DELETE statements on
	 * Amelia's tables. The query filter runs before a statement executes and before
	 * wpdb::flush(), so an insert stays pending until the next statement's filter or the end of
	 * the call; it completed when last_query is that statement, last_error is empty, rows_affected
	 * is 1 and insert_id is above 0. Ids are per table.
	 *
	 * @return array{result: mixed, error: ?WP_Error, inserted: array<string,int[]>, updated: string[], deleted: string[], uncertain: string[]}
	 */
	public function capture( callable $fn ): array {
		if ( ! class_exists( 'EMCP_Tools_Query_Capture' ) ) {
			require_once dirname( __DIR__ ) . '/class-query-capture.php';
		}
		$c = EMCP_Tools_Query_Capture::run(
			array( 'prefix' => 'amelia_', 'tables' => array() ),
			$fn,
			function () {
				$this->rollback();
			}
		);
		$error = $c['error'];
		if ( $c['throwable'] ) {
			$error = new WP_Error( 'amelia_error', $c['throwable']->getMessage(), array( 'exception' => get_class( $c['throwable'] ) ) );
		}
		return array(
			'result'    => $c['result'],
			'error'     => $error,
			'inserted'  => $c['inserted'],
			'updated'   => $c['updated'],
			'deleted'   => $c['deleted'],
			'uncertain' => $c['uncertain'],
		);
	}

	// Lists (spec 4.1), restricted inside the query.

	/**
	 * @param array $f kind filters (see EMCP_Tools_Amelia_Integration)
	 * @return array{ids: int[], total: int}
	 */
	public function query( string $kind, array $f, int $page, int $per_page ): array {
		global $wpdb;
		$p     = $wpdb->prefix . 'amelia_';
		$where = array( '1=1' );
		$args  = array();
		$join  = '';
		$like  = static fn( string $s ) => '%' . $wpdb->esc_like( $s ) . '%';
		switch ( $kind ) {
			case 'service':
				$from  = "{$p}services o";
				$order = 'o.position, o.name, o.id';
				if ( ! empty( $f['category_id'] ) ) {
					$where[] = 'o.categoryId = %d';
					$args[]  = (int) $f['category_id'];
				}
				if ( ! empty( $f['search'] ) ) {
					$where[] = 'o.name LIKE %s';
					$args[]  = $like( $f['search'] );
				}
				break;
			case 'employee':
			case 'customer':
				$from    = "{$p}users o";
				$order   = 'o.firstName, o.lastName, o.id';
				$where[] = 'o.type = %s';
				$args[]  = 'employee' === $kind ? 'provider' : 'customer';
				if ( ! empty( $f['service_id'] ) ) {
					$where[] = "EXISTS (SELECT 1 FROM {$p}providers_to_services ps WHERE ps.userId = o.id AND ps.serviceId = %d)";
					$args[]  = (int) $f['service_id'];
				}
				if ( ! empty( $f['search'] ) ) {
					$where[] = '(o.firstName LIKE %s OR o.lastName LIKE %s OR o.email LIKE %s)';
					array_push( $args, $like( $f['search'] ), $like( $f['search'] ), $like( $f['search'] ) );
				}
				break;
			case 'appointment':
				$from    = "{$p}appointments o";
				$order   = 'o.bookingStart, o.id';
				$where[] = 'o.bookingStart >= %s AND o.bookingStart < %s';
				array_push( $args, (string) $f['from_utc'], (string) $f['to_utc'] );
				foreach ( array( 'employee_id' => 'providerId', 'service_id' => 'serviceId' ) as $k => $col ) {
					if ( ! empty( $f[ $k ] ) ) {
						$where[] = "o.{$col} = %d";
						$args[]  = (int) $f[ $k ];
					}
				}
				if ( ! empty( $f['customer_id'] ) ) {
					$where[] = "EXISTS (SELECT 1 FROM {$p}customer_bookings b WHERE b.appointmentId = o.id AND b.customerId = %d)";
					$args[]  = (int) $f['customer_id'];
				}
				if ( ! empty( $f['status'] ) ) {
					$where[] = 'o.status = %s';
					$args[]  = (string) $f['status'];
				}
				break;
			case 'event':
				$from    = "{$p}events o";
				$order   = "(SELECT MIN(ep.periodStart) FROM {$p}events_periods ep WHERE ep.eventId = o.id), o.id";
				$where[] = "EXISTS (SELECT 1 FROM {$p}events_periods ep WHERE ep.eventId = o.id AND ep.periodEnd > %s AND ep.periodStart < %s)";
				array_push( $args, (string) $f['from_utc'], (string) $f['to_utc'] );
				if ( ! empty( $f['status'] ) ) {
					$where[] = 'o.status = %s';
					$args[]  = (string) $f['status'];
				}
				if ( ! empty( $f['search'] ) ) {
					$where[] = 'o.name LIKE %s';
					$args[]  = $like( $f['search'] );
				}
				break;
			case 'event_booking':
				$from    = "{$p}customer_bookings o";
				$order   = 'o.id';
				$where[] = "o.id IN (SELECT l.customerBookingId FROM {$p}customer_bookings_to_events_periods l JOIN {$p}events_periods ep ON ep.id = l.eventPeriodId WHERE ep.eventId = %d)";
				$args[]  = (int) $f['event_id'];
				if ( ! empty( $f['status'] ) ) {
					$where[] = 'o.status = %s';
					$args[]  = (string) $f['status'];
				}
				break;
			default:
				return array( 'ids' => array(), 'total' => 0 );
		}
		$sql   = "FROM {$from} {$join} WHERE " . implode( ' AND ', $where );
		$total = (int) $wpdb->get_var( $args ? $wpdb->prepare( "SELECT COUNT(*) {$sql}", $args ) : "SELECT COUNT(*) {$sql}" ); // phpcs:ignore WordPress.DB.PreparedSQL
		$limit = sprintf( ' ORDER BY %s LIMIT %d OFFSET %d', $order, $per_page, ( max( 1, $page ) - 1 ) * $per_page );
		$ids   = $wpdb->get_col( $args ? $wpdb->prepare( "SELECT o.id {$sql}{$limit}", $args ) : "SELECT o.id {$sql}{$limit}" ); // phpcs:ignore WordPress.DB.PreparedSQL
		return array( 'ids' => array_map( 'intval', (array) $ids ), 'total' => $total );
	}

	/** Every category id, by position. @return int[] */
	public function category_ids(): array {
		global $wpdb;
		return array_map( 'intval', (array) $wpdb->get_col( "SELECT id FROM {$wpdb->prefix}amelia_categories ORDER BY position, id" ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
	}

	/** Services per category id. @return array<int,int> */
	public function service_counts(): array {
		global $wpdb;
		$out = array();
		foreach ( (array) $wpdb->get_results( "SELECT categoryId, COUNT(*) n FROM {$wpdb->prefix}amelia_services GROUP BY categoryId", ARRAY_A ) as $r ) { // phpcs:ignore WordPress.DB.DirectDatabaseQuery
			$out[ (int) $r['categoryId'] ] = (int) $r['n'];
		}
		return $out;
	}

	/**
	 * Appointments and event bookings of a customer (or an employee), split past and upcoming
	 * (D14 and get-customer).
	 *
	 * @return array{appointments_upcoming: int, appointments_past: int, event_bookings: int}
	 */
	public function usage( string $kind, int $id ): array {
		global $wpdb;
		$p   = $wpdb->prefix . 'amelia_';
		$now = gmdate( 'Y-m-d H:i:s' );
		if ( 'employee' === $kind ) {
			$up   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$p}appointments WHERE providerId = %d AND bookingStart >= %s", $id, $now ) );
			$past = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$p}appointments WHERE providerId = %d AND bookingStart < %s", $id, $now ) );
			$ev   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$p}events_to_providers WHERE userId = %d", $id ) );
		} else {
			$up   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$p}customer_bookings b JOIN {$p}appointments a ON a.id = b.appointmentId WHERE b.customerId = %d AND a.bookingStart >= %s", $id, $now ) );
			$past = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$p}customer_bookings b JOIN {$p}appointments a ON a.id = b.appointmentId WHERE b.customerId = %d AND a.bookingStart < %s", $id, $now ) );
			$ev   = (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$p}customer_bookings WHERE customerId = %d AND appointmentId IS NULL", $id ) );
		}
		return array( 'appointments_upcoming' => $up, 'appointments_past' => $past, 'event_bookings' => $ev );
	}

	/** Appointments of a service (any time). */
	public function service_use( int $id ): int {
		global $wpdb;
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT COUNT(*) FROM {$wpdb->prefix}amelia_appointments WHERE serviceId = %d", $id ) );
	}

	/** Approved or pending appointments of an employee overlapping [start, end) in UTC, other than $except. @return int[] */
	public function overlapping( int $employee_id, string $start_utc, string $end_utc, array $except = array() ): array {
		global $wpdb;
		$ids = $wpdb->get_col( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}amelia_appointments WHERE providerId = %d AND status IN ('approved','pending') AND bookingStart < %s AND bookingEnd > %s", $employee_id, $end_utc, $start_utc ) );
		return array_values( array_diff( array_map( 'intval', (array) $ids ), array_map( 'intval', $except ) ) );
	}

	/** The Amelia user holding an email, or 0. */
	public function user_by_email( string $email ): int {
		global $wpdb;
		return (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}amelia_users WHERE email = %s", $email ) );
	}

	// Notifications (D10).

	public function notification_mark(): int {
		global $wpdb;
		return (int) $wpdb->get_var( "SELECT MAX(id) FROM {$wpdb->prefix}amelia_notifications_log" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
	}

	/** @return array<int,array{recipient: string, channel: string, user_id: int}> */
	public function notifications_since( int $mark ): array {
		global $wpdb;
		$p    = $wpdb->prefix . 'amelia_';
		$rows = $wpdb->get_results( $wpdb->prepare( "SELECT l.userId, n.type, n.sendTo FROM {$p}notifications_log l JOIN {$p}notifications n ON n.id = l.notificationId WHERE l.id > %d AND l.sent = 1 ORDER BY l.id", $mark ), ARRAY_A );
		$out  = array();
		foreach ( (array) $rows as $r ) {
			$out[] = array( 'recipient' => 'provider' === $r['sendTo'] ? 'employee' : 'customer', 'channel' => (string) $r['type'], 'user_id' => (int) $r['userId'] );
		}
		return $out;
	}

	/**
	 * Runs $fn with every customer message held through Amelia's own filters (skipSending on
	 * amelia_manipulate_email_data and amelia_manipulate_sms_data): D10, no customer is emailed
	 * unless the agent asks. Employees' messages are left to Amelia and reported. Held messages
	 * are logged by Amelia without sent = 1, so notifications_since() leaves them out.
	 *
	 * @return mixed $fn's answer
	 */
	public function hold_customer_messages( callable $fn ) {
		$email = function ( $data ) {
			if ( is_array( $data ) && $this->is_customer_contact( (string) ( $data['email'] ?? '' ), '' ) ) {
				$data['skipSending'] = true;
			}
			return $data;
		};
		$sms   = function ( $data ) {
			if ( is_array( $data ) && $this->is_customer_contact( '', (string) ( $data['to'] ?? '' ) ) ) {
				$data['skipSending'] = true;
			}
			return $data;
		};
		add_filter( 'amelia_manipulate_email_data', $email, PHP_INT_MAX );
		add_filter( 'amelia_manipulate_sms_data', $sms, PHP_INT_MAX );
		try {
			return $fn();
		} finally {
			remove_filter( 'amelia_manipulate_email_data', $email, PHP_INT_MAX );
			remove_filter( 'amelia_manipulate_sms_data', $sms, PHP_INT_MAX );
		}
	}

	/** Whether an email or phone belongs to an Amelia customer. */
	public function is_customer_contact( string $email, string $phone ): bool {
		global $wpdb;
		if ( '' !== $email ) {
			return (bool) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}amelia_users WHERE email = %s AND type = 'customer'", $email ) );
		}
		return '' !== $phone && (bool) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}amelia_users WHERE phone = %s AND type = 'customer'", $phone ) );
	}

	// Settings (spike item 21: read through an allowlist only).

	public function setting( string $group, string $key ) {
		$all = json_decode( (string) get_option( 'amelia_settings', '' ), true );
		return is_array( $all ) && isset( $all[ $group ] ) && is_array( $all[ $group ] ) ? ( $all[ $group ][ $key ] ?? null ) : null;
	}

	public function sender_configured(): bool {
		return '' !== trim( (string) $this->setting( 'notifications', 'senderEmail' ) );
	}

	/** Amelia's booking-form cache (spike item 22). */
	public function rebuild_stash(): void {
		if ( ! $this->setting( 'activation', 'stash' ) || null === self::$container && ! defined( 'AMELIA_PATH' ) ) {
			return;
		}
		try {
			if ( null === self::$container ) {
				self::$container = require AMELIA_PATH . '/src/Infrastructure/ContainerConfig/container.php';
			}
			self::$container->get( 'application.stash.service' )->setStash();
		} catch ( \Throwable $e ) {
			$this->rollback();
		}
	}

	/** The MCP Adapter copy that is loaded (D3), when the free check exists. */
	public function adapter_source(): array {
		return class_exists( 'EMCP_Tools_Adapter_Bootstrap' ) && method_exists( 'EMCP_Tools_Adapter_Bootstrap', 'core_source' ) ? (array) EMCP_Tools_Adapter_Bootstrap::core_source() : array();
	}

	// People.

	public function can( string $cap ): bool {
		return 'admin' === $this->current_amelia_role() || current_user_can( $cap );
	}

	/** Amelia's own rule (UserRoles::getUserAmeliaRole): admin, manager, provider, customer, or none. */
	public function current_amelia_role(): string {
		$u = wp_get_current_user();
		if ( ! $u || empty( $u->ID ) ) {
			return 'none';
		}
		$roles = (array) ( $u->roles ?? array() );
		if ( in_array( 'administrator', $roles, true ) || ( function_exists( 'is_super_admin' ) && is_super_admin( $u->ID ) ) ) {
			return 'admin';
		}
		foreach ( array( 'wpamelia-manager' => 'manager', 'wpamelia-provider' => 'provider', 'wpamelia-customer' => 'customer' ) as $role => $name ) {
			if ( in_array( $role, $roles, true ) ) {
				return $name;
			}
		}
		return 'none';
	}

	/** The one employee Amelia Lite schedules: its first that is not disabled (applyLiteLicenseRestriction), or 0. */
	public function lite_employee(): int {
		global $wpdb;
		return (int) $wpdb->get_var( "SELECT id FROM {$wpdb->prefix}amelia_users WHERE type = 'provider' AND status NOT LIKE 'disabled' ORDER BY id ASC LIMIT 1" ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
	}

	/** The employee row linked to the current WordPress user, or 0. */
	public function current_employee_id(): int {
		global $wpdb;
		$uid = get_current_user_id();
		return $uid ? (int) $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$wpdb->prefix}amelia_users WHERE externalId = %d AND type = 'provider'", $uid ) ) : 0;
	}

	// Units and times (D15; Amelia stores seconds and UTC).

	public static function to_seconds( int $minutes ): int {
		return $minutes * 60;
	}

	public static function to_minutes( int $seconds ): int {
		return intdiv( $seconds, 60 );
	}

	/** Site-local 'Y-m-d H:i' (or with seconds) => UTC 'Y-m-d H:i:s'. */
	public static function local_to_utc( string $local ): string {
		$d = new DateTimeImmutable( $local, wp_timezone() );
		return $d->setTimezone( new DateTimeZone( 'UTC' ) )->format( 'Y-m-d H:i:s' );
	}

	/** UTC 'Y-m-d H:i:s' => site-local 'Y-m-d H:i'. */
	public static function utc_to_local( string $utc ): string {
		if ( '' === $utc ) {
			return '';
		}
		$d = new DateTimeImmutable( $utc, new DateTimeZone( 'UTC' ) );
		return $d->setTimezone( wp_timezone() )->format( 'Y-m-d H:i' );
	}

	// Versions.

	/** 16 hex characters of sha256 over the canonical JSON (keys sorted). */
	public static function version( array $rows ): string {
		return substr( hash( 'sha256', (string) wp_json_encode( self::canonical( $rows ) ) ), 0, 16 );
	}

	protected static function canonical( $v ) {
		if ( is_array( $v ) ) {
			if ( array_keys( $v ) !== range( 0, count( $v ) - 1 ) ) {
				ksort( $v );
			}
			return array_map( array( __CLASS__, 'canonical' ), $v );
		}
		return null === $v ? null : (string) $v;
	}

	/** Rows minus the columns Amelia changes on its own (D12). */
	public static function strip_volatile( array $rows ): array {
		foreach ( $rows as $table => $list ) {
			foreach ( (array) $list as $id => $row ) {
				foreach ( self::VOLATILE as $col ) {
					unset( $rows[ $table ][ $id ][ $col ] );
				}
			}
		}
		return $rows;
	}
}
