<?php
/**
 * Amelia (Lite) integration: the amelia-read and amelia-write dispatcher tools. Operation rows live
 * in ops/amelia-read.php and ops/amelia-write.php; each row names Amelia's capability (D5) and its
 * handler (op_*). Every Amelia call goes through EMCP_Tools_Amelia_Api; every write goes through
 * EMCP_Tools_Amelia_Writer. Times are site-local, durations in minutes (D15).
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
class EMCP_Tools_Amelia_Integration {

	const PER_PAGE = 20;

	/** Amelia's dayIndex (1 is Monday). */
	const DAYS = array( 1 => 'monday', 2 => 'tuesday', 3 => 'wednesday', 4 => 'thursday', 5 => 'friday', 6 => 'saturday', 7 => 'sunday' );

	/** Amelia's event statuses => EMCP's. */
	const EVENT_STATUS = array( 'approved' => 'open', 'rejected' => 'cancelled', 'canceled' => 'cancelled', 'pending' => 'pending' );

	/** @var EMCP_Tools_Amelia_Api|null Test seam. */
	private static $api_override = null;

	/** @var string[] */
	private $ability_names = array();

	public static function use_api( ?EMCP_Tools_Amelia_Api $api ): void {
		self::$api_override = $api;
	}

	public static function amelia_active(): bool {
		return defined( 'AMELIA_VERSION' ) && class_exists( 'AmeliaBooking\Plugin' );
	}

	public static function shared_api(): EMCP_Tools_Amelia_Api {
		return self::$api_override ? self::$api_override : new EMCP_Tools_Amelia_Api();
	}

	protected function api(): EMCP_Tools_Amelia_Api {
		return self::shared_api();
	}

	/** @return string[] */
	public function get_ability_names(): array {
		return $this->ability_names;
	}

	/** An Amelia admin, manager or employee (D5); never a customer or a user Amelia treats as one. */
	public function check_permission(): bool {
		return in_array( $this->api()->current_amelia_role(), array( 'admin', 'manager', 'provider' ), true );
	}

	/** @return true|WP_Error */
	public function refuse_customers() {
		return $this->check_permission() ? true : self::forbidden();
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
			'emcp-tools/amelia-read'  => array(
				'label'       => __( 'Amelia Read', 'emcp-tools' ),
				'description' => __( 'Read the Amelia booking system: the setup and allowed operations, service categories, services with their employees and prices, employees with their working week and days off, customers, appointments by date, employee, service, customer or status, free time slots, events with their periods and attendees. Times are site-local, durations in minutes. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_read',
				'operation'   => __( 'The read operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => true, 'destructive' => false, 'idempotent' => true ),
			),
			'emcp-tools/amelia-write' => array(
				'label'       => __( 'Amelia Write', 'emcp-tools' ),
				'description' => __( 'Run Amelia: create and change service categories, services, employees (working hours, days off) and customers, book, reschedule, approve, cancel or reject appointments, create and change events, open or cancel them and book attendees. Only the fields you pass change; every write to an existing object needs the version from its read. No customer is emailed unless you pass notify:true. Disabled by default; enable under Neo EMCP > Tools > Plugins > Amelia. Deletes need confirm:true. Every write can be undone in History. Call with no operation to list operations.', 'emcp-tools' ),
				'callback'    => 'run_write',
				'operation'   => __( 'The write operation. Omit to list operations.', 'emcp-tools' ),
				'annotations' => array( 'readonly' => false, 'destructive' => true, 'idempotent' => false ),
			),
		);
		if ( ! $this->api()->supported() ) {
			unset( $tools['emcp-tools/amelia-write'] );
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
		$ops = (array) require __DIR__ . '/ops/amelia-' . $mode . '.php';
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
			return new WP_Error( 'amelia_inactive', __( 'Amelia is not active.', 'emcp-tools' ) );
		}
		$allowed = $this->refuse_customers();
		if ( is_wp_error( $allowed ) ) {
			return $allowed;
		}
		$ops = $this->operations( $mode );
		if ( ! isset( $ops[ $name ] ) ) {
			if ( ! $this->api()->supported() ) {
				/* translators: %s: Amelia version. */
				return new WP_Error( 'amelia_unsupported_version', sprintf( __( 'This version of Amelia (%s) is not supported yet; EMCP works with Amelia 2.4 to 2.x.', 'emcp-tools' ), $this->api()->version_string() ) );
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
		if ( ! $this->allows( (string) $op['cap'] ) ) {
			return self::forbidden();
		}
		$object = $this->object_check( $name, $clean );
		if ( is_wp_error( $object ) ) {
			return $object;
		}
		if ( ! method_exists( $this, $op['run'] ) ) {
			return new WP_Error( 'not_ready', __( 'This operation is not available yet.', 'emcp-tools' ) );
		}
		if ( ! empty( $op['confirm'] ) && ! $confirmed ) {
			return new WP_Error( 'confirmation_required', __( 'This operation deletes something. Pass confirm:true in arguments to proceed.', 'emcp-tools' ) );
		}
		return call_user_func( array( $this, $op['run'] ), $clean );
	}

	// Rules (D5).

	protected static function forbidden(): WP_Error {
		return new WP_Error( 'forbidden', __( 'You are not allowed to do this in Amelia.', 'emcp-tools' ), array( 'status' => 403 ) );
	}

	protected static function not_found( string $what, int $id ): WP_Error {
		/* translators: 1: what (service, employee, ...), 2: id. */
		return new WP_Error( 'not_found', sprintf( __( 'There is no Amelia %1$s %2$d.', 'emcp-tools' ), $what, $id ), array( 'status' => 404 ) );
	}

	/** "perm:entity": Amelia's capability amelia_{perm}_{entity}, as Amelia's PermissionsService names it. */
	public function allows( string $rule ): bool {
		if ( 'tool' === $rule ) {
			return $this->check_permission();
		}
		list( $perm, $entity ) = array_pad( explode( ':', $rule, 2 ), 2, '' );
		return $this->api()->can( "amelia_{$perm}_{$entity}" );
	}

	/**
	 * An Amelia employee works on their own appointments only (D5), and on their own profile and
	 * schedule unless Amelia gives them amelia_{perm}_others_employees. Answers the employee id to
	 * restrict to (-1 when the user has no employee row), or 0 for no restriction.
	 */
	protected function own_only( string $perm, string $entity ): int {
		$api = $this->api();
		if ( 'provider' !== $api->current_amelia_role() || ! in_array( $entity, array( 'appointments', 'employees' ), true ) ) {
			return 0;
		}
		if ( 'employees' === $entity && $api->can( "amelia_{$perm}_others_employees" ) ) {
			return 0;
		}
		$id = $api->current_employee_id();
		return $id > 0 ? $id : -1;
	}

	/** Employees: their own appointments, profile and schedule only, the schedule when Amelia allows it (D5). @return true|WP_Error */
	protected function object_check( string $name, array $a ) {
		$appt = $this->own_only( 'write', 'appointments' );
		if ( $appt ) {
			$api = $this->api();
			$emp = 0;
			if ( isset( $a['appointment_id'] ) ) {
				$emp = (int) ( $api->row( 'appointments', (int) $a['appointment_id'] )['providerId'] ?? 0 );
			} elseif ( isset( $a['booking_id'] ) ) {
				$b   = $api->row( 'customer_bookings', (int) $a['booking_id'] );
				$emp = $b && $b['appointmentId'] ? (int) ( $api->row( 'appointments', (int) $b['appointmentId'] )['providerId'] ?? 0 ) : $appt;
			} elseif ( 'create-appointment' === $name ) {
				$emp = (int) $a['employee_id'];
			}
			if ( ( $emp && $emp !== $appt ) || ( isset( $a['employee_id'] ) && 'create-appointment' !== $name && (int) $a['employee_id'] !== $appt && in_array( $name, array( 'reschedule-appointment' ), true ) ) ) {
				return self::forbidden();
			}
		}
		$own = $this->own_only( 'write', 'employees' );
		if ( ! $own ) {
			return true;
		}
		if ( 'create-employee' === $name ) {
			return self::forbidden();
		}
		if ( isset( $a['employee_id'] ) && in_array( $name, array( 'update-employee', 'set-employee-status', 'set-working-hours', 'set-days-off', 'delete-employee' ), true ) ) {
			if ( (int) $a['employee_id'] !== $own ) {
				return self::forbidden();
			}
			if ( in_array( $name, array( 'set-working-hours', 'set-days-off' ), true ) && ! $this->api()->setting( 'roles', 'allowConfigureSchedule' ) ) {
				return self::forbidden();
			}
		}
		return true;
	}

	// Dates (D15).

	/**
	 * A site-local Y-m-d or Y-m-d H:i argument as UTC; a bare date at the end of a range is the
	 * next midnight.
	 *
	 * @return string|WP_Error
	 */
	public static function local_bound( string $value, bool $end, string $field ) {
		$value = trim( $value );
		$d     = DateTimeImmutable::createFromFormat( '!Y-m-d', $value, wp_timezone() );
		if ( $d && $d->format( 'Y-m-d' ) === $value ) {
			$d = $end ? $d->modify( '+1 day' ) : $d;
			return $d->setTimezone( new DateTimeZone( 'UTC' ) )->format( 'Y-m-d H:i:s' );
		}
		$d = DateTimeImmutable::createFromFormat( '!Y-m-d H:i', $value, wp_timezone() );
		if ( $d && $d->format( 'Y-m-d H:i' ) === $value ) {
			return $d->setTimezone( new DateTimeZone( 'UTC' ) )->format( 'Y-m-d H:i:s' );
		}
		/* translators: %s: argument name. */
		return new WP_Error( 'invalid_argument', sprintf( __( 'Argument "%s" must be a site-local date (Y-m-d) or time (Y-m-d H:i).', 'emcp-tools' ), $field ) );
	}

	/** @return array{0: string, 1: string}|WP_Error UTC bounds, defaulting to today plus $days */
	protected static function window( array $a, int $days ) {
		$today = ( new DateTimeImmutable( 'now', wp_timezone() ) )->format( 'Y-m-d' );
		$from  = self::local_bound( (string) ( $a['from'] ?? $today ), false, 'from' );
		if ( is_wp_error( $from ) ) {
			return $from;
		}
		if ( isset( $a['to'] ) ) {
			$to = self::local_bound( (string) $a['to'], true, 'to' );
		} else {
			$to = ( new DateTimeImmutable( $from, new DateTimeZone( 'UTC' ) ) )->modify( '+' . $days . ' days' )->format( 'Y-m-d H:i:s' );
		}
		return is_wp_error( $to ) ? $to : array( $from, $to );
	}

	// Views (spec 4.1; raw stored values, site-local times, minutes).

	protected static function version_of( array $rows ): string {
		return EMCP_Tools_Amelia_Api::version( EMCP_Tools_Amelia_Api::strip_volatile( $rows ) );
	}

	protected static function hm( string $time ): string {
		return substr( $time, 0, 5 );
	}

	protected static function local( $utc ): string {
		return null === $utc || '' === (string) $utc ? '' : EMCP_Tools_Amelia_Api::utc_to_local( (string) $utc );
	}

	protected static function name_of( ?array $user ): string {
		return $user ? trim( $user['firstName'] . ' ' . $user['lastName'] ) : '';
	}

	/** @return array|null */
	public static function category_view( EMCP_Tools_Amelia_Api $api, int $id, ?array $counts = null ): ?array {
		$rows = $api->rows( 'category', $id );
		if ( empty( $rows['categories'][ $id ] ) ) {
			return null;
		}
		$c      = $rows['categories'][ $id ];
		$counts = null === $counts ? $api->service_counts() : $counts;
		return array(
			'id'       => $id,
			'name'     => (string) $c['name'],
			'color'    => (string) $c['color'],
			'position' => (int) $c['position'],
			'status'   => (string) $c['status'],
			'services' => (int) ( $counts[ $id ] ?? 0 ),
			'version'  => self::version_of( $rows ),
		);
	}

	/** @return array|null */
	public static function service_view( EMCP_Tools_Amelia_Api $api, int $id ): ?array {
		$rows = $api->rows( 'service', $id );
		if ( empty( $rows['services'][ $id ] ) ) {
			return null;
		}
		$s     = $rows['services'][ $id ];
		$links = $rows['providers_to_services'];
		uasort( $links, static fn( $a, $b ) => (int) $a['userId'] <=> (int) $b['userId'] );
		$employees = array();
		foreach ( $links as $l ) {
			$employees[] = array(
				'id'           => (int) $l['userId'],
				'name'         => self::name_of( $api->row( 'users', (int) $l['userId'] ) ),
				'price'        => (float) $l['price'],
				'min_capacity' => (int) $l['minCapacity'],
				'max_capacity' => (int) $l['maxCapacity'],
			);
		}
		return array(
			'id'           => $id,
			'name'         => (string) $s['name'],
			'category_id'  => (int) $s['categoryId'],
			'description'  => (string) $s['description'],
			'duration'     => EMCP_Tools_Amelia_Api::to_minutes( (int) $s['duration'] ),
			'time_before'  => EMCP_Tools_Amelia_Api::to_minutes( (int) $s['timeBefore'] ),
			'time_after'   => EMCP_Tools_Amelia_Api::to_minutes( (int) $s['timeAfter'] ),
			'price'        => (float) $s['price'],
			'deposit'      => 'disabled' === (string) ( $s['depositPayment'] ?? 'disabled' ) ? 0.0 : (float) $s['deposit'],
			'min_capacity' => (int) $s['minCapacity'],
			'max_capacity' => (int) $s['maxCapacity'],
			'color'        => (string) $s['color'],
			'status'       => (string) $s['status'],
			'visible'      => (bool) (int) ( $s['show'] ?? 1 ),
			'employees'    => $employees,
			'version'      => self::version_of( $rows ),
		);
	}

	/** @return array|null */
	public static function employee_view( EMCP_Tools_Amelia_Api $api, int $id ): ?array {
		$rows = $api->rows( 'employee', $id );
		if ( empty( $rows['users'][ $id ] ) ) {
			return null;
		}
		$u    = $rows['users'][ $id ];
		$days = $rows['providers_to_weekdays'];
		uasort( $days, static fn( $a, $b ) => (int) $a['dayIndex'] <=> (int) $b['dayIndex'] );
		$week = array();
		foreach ( $days as $wd ) {
			$periods = array();
			$breaks  = array();
			foreach ( $rows['providers_to_periods'] as $p ) {
				if ( (int) $p['weekDayId'] === (int) $wd['id'] ) {
					$periods[] = array( 'start' => self::hm( $p['startTime'] ), 'end' => self::hm( $p['endTime'] ) );
				}
			}
			foreach ( $rows['providers_to_timeouts'] as $t ) {
				if ( (int) $t['weekDayId'] === (int) $wd['id'] ) {
					$breaks[] = array( 'start' => self::hm( $t['startTime'] ), 'end' => self::hm( $t['endTime'] ) );
				}
			}
			usort( $periods, static fn( $a, $b ) => strcmp( $a['start'], $b['start'] ) );
			usort( $breaks, static fn( $a, $b ) => strcmp( $a['start'], $b['start'] ) );
			$week[] = array( 'day' => self::DAYS[ (int) $wd['dayIndex'] ] ?? (string) $wd['dayIndex'], 'start' => self::hm( $wd['startTime'] ), 'end' => self::hm( $wd['endTime'] ), 'periods' => $periods, 'breaks' => $breaks );
		}
		$off = array();
		foreach ( $rows['providers_to_daysoff'] as $d ) {
			$off[] = array( 'id' => (int) $d['id'], 'name' => (string) $d['name'], 'start' => substr( (string) $d['startDate'], 0, 10 ), 'end' => substr( (string) $d['endDate'], 0, 10 ), 'repeat' => (bool) (int) $d['repeat'] );
		}
		$links = $rows['providers_to_services'];
		uasort( $links, static fn( $a, $b ) => (int) $a['serviceId'] <=> (int) $b['serviceId'] );
		$services = array();
		foreach ( $links as $l ) {
			$svc        = $api->row( 'services', (int) $l['serviceId'] );
			$services[] = array( 'id' => (int) $l['serviceId'], 'name' => $svc ? (string) $svc['name'] : '', 'price' => (float) $l['price'], 'min_capacity' => (int) $l['minCapacity'], 'max_capacity' => (int) $l['maxCapacity'] );
		}
		return array(
			'id'          => $id,
			'first_name'  => (string) $u['firstName'],
			'last_name'   => (string) $u['lastName'],
			'email'       => (string) $u['email'],
			'phone'       => (string) $u['phone'],
			'description' => (string) $u['description'],
			'status'      => (string) $u['status'],
			'linked_user' => (int) $u['externalId'],
			'services'    => $services,
			'week'        => $week,
			'days_off'    => $off,
			'version'     => self::version_of( $rows ),
		);
	}

	/** @return array|null */
	public static function customer_view( EMCP_Tools_Amelia_Api $api, int $id ): ?array {
		$rows = $api->rows( 'customer', $id );
		if ( empty( $rows['users'][ $id ] ) ) {
			return null;
		}
		$u = $rows['users'][ $id ];
		return array(
			'id'          => $id,
			'first_name'  => (string) $u['firstName'],
			'last_name'   => (string) $u['lastName'],
			'email'       => (string) $u['email'],
			'phone'       => (string) $u['phone'],
			'note'        => (string) $u['note'],
			'birthday'    => (string) $u['birthday'],
			'gender'      => (string) $u['gender'],
			'status'      => (string) $u['status'],
			'linked_user' => (int) $u['externalId'],
			'version'     => self::version_of( $rows ),
		);
	}

	/** Payment status of each booking (its first payment). @return array<int,string> */
	protected static function payment_status( array $payments ): array {
		ksort( $payments );
		$out = array();
		foreach ( $payments as $p ) {
			$b = (int) $p['customerBookingId'];
			if ( ! isset( $out[ $b ] ) ) {
				$out[ $b ] = (string) $p['status'];
			}
		}
		return $out;
	}

	/** @return array|null */
	public static function appointment_view( EMCP_Tools_Amelia_Api $api, int $id ): ?array {
		$rows = $api->rows( 'appointment', $id );
		if ( empty( $rows['appointments'][ $id ] ) ) {
			return null;
		}
		$a        = $rows['appointments'][ $id ];
		$pay      = self::payment_status( $rows['payments'] );
		$bookings = array();
		ksort( $rows['customer_bookings'] );
		foreach ( $rows['customer_bookings'] as $bid => $b ) {
			$bookings[] = array(
				'id'             => (int) $bid,
				'customer_id'    => (int) $b['customerId'],
				'status'         => (string) $b['status'],
				'persons'        => (int) $b['persons'],
				'price'          => (float) $b['price'],
				'payment_status' => $pay[ $bid ] ?? '',
				'version'        => self::version_of( $api->rows( 'booking', (int) $bid ) ),
			);
		}
		return array(
			'id'             => $id,
			'service_id'     => (int) $a['serviceId'],
			'employee_id'    => (int) $a['providerId'],
			'start'          => self::local( $a['bookingStart'] ),
			'end'            => self::local( $a['bookingEnd'] ),
			'status'         => (string) $a['status'],
			'internal_notes' => (string) $a['internalNotes'],
			'bookings'       => $bookings,
			'version'        => self::version_of( $rows ),
		);
	}

	/** @return array|null */
	public static function event_view( EMCP_Tools_Amelia_Api $api, int $id ): ?array {
		$rows = $api->rows( 'event', $id );
		if ( empty( $rows['events'][ $id ] ) ) {
			return null;
		}
		$e       = $rows['events'][ $id ];
		$periods = array_values( $rows['events_periods'] );
		usort( $periods, static fn( $a, $b ) => strcmp( (string) $a['periodStart'], (string) $b['periodStart'] ) ?: (int) $a['id'] <=> (int) $b['id'] );
		$booked = 0;
		foreach ( $rows['customer_bookings'] as $b ) {
			$booked += in_array( (string) $b['status'], array( 'approved', 'pending' ), true ) ? (int) $b['persons'] : 0;
		}
		$tags = $rows['events_tags'];
		ksort( $tags );
		$employees = array_map( 'intval', array_column( $rows['events_to_providers'], 'userId' ) );
		sort( $employees );
		return array(
			'id'             => $id,
			'name'           => (string) $e['name'],
			'description'    => (string) $e['description'],
			'status'         => self::EVENT_STATUS[ (string) $e['status'] ] ?? (string) $e['status'],
			'periods'        => array_map( static fn( $p ) => array( 'id' => (int) $p['id'], 'start' => self::local( $p['periodStart'] ), 'end' => self::local( $p['periodEnd'] ) ), $periods ),
			'price'          => (float) $e['price'],
			'max_capacity'   => (int) $e['maxCapacity'],
			'color'          => (string) $e['color'],
			'visible'        => (bool) (int) $e['show'],
			'employees'      => $employees,
			'tags'           => array_values( array_map( static fn( $t ) => (string) $t['name'], $tags ) ),
			'booking_opens'  => self::local( $e['bookingOpens'] ?? null ),
			'booking_closes' => self::local( $e['bookingCloses'] ?? null ),
			'booked'         => $booked,
			'places_left'    => max( 0, (int) $e['maxCapacity'] - $booked ),
			'version'        => self::version_of( $rows ),
		);
	}

	/** One customer's booking of an appointment or an event. @return array|null */
	public static function booking_view( EMCP_Tools_Amelia_Api $api, int $id ): ?array {
		$rows = $api->rows( 'booking', $id );
		if ( empty( $rows['customer_bookings'][ $id ] ) ) {
			return null;
		}
		$b      = $rows['customer_bookings'][ $id ];
		$pay    = self::payment_status( $rows['payments'] );
		$period = $rows['customer_bookings_to_events_periods'] ? $api->row( 'events_periods', (int) reset( $rows['customer_bookings_to_events_periods'] )['eventPeriodId'] ) : null;
		return array(
			'booking_id'     => $id,
			'appointment_id' => (int) $b['appointmentId'],
			'event_id'       => $period ? (int) $period['eventId'] : 0,
			'customer_id'    => (int) $b['customerId'],
			'customer'       => self::name_of( $api->row( 'users', (int) $b['customerId'] ) ),
			'status'         => (string) $b['status'],
			'persons'        => (int) $b['persons'],
			'price'          => (float) $b['price'],
			'payment_status' => $pay[ $id ] ?? '',
			'version'        => self::version_of( $rows ),
		);
	}

	// Read handlers (spec 4.1).

	/** @return array */
	protected function op_get_setup( array $a ) {
		$api   = $this->api();
		$write = array();
		if ( $api->supported() ) {
			foreach ( (array) require __DIR__ . '/ops/amelia-write.php' as $name => $op ) {
				if ( $this->allows( (string) $op['cap'] ) ) {
					$write[] = $name;
				}
			}
		}
		$minutes = static fn( $s ) => EMCP_Tools_Amelia_Api::to_minutes( (int) $s );
		return array(
			'amelia_version'             => $api->version_string(),
			'edition'                    => $api->edition(),
			'supported'                  => $api->supported(),
			'timezone'                   => wp_timezone_string(),
			'currency'                   => (string) $api->setting( 'payments', 'currency' ),
			'default_appointment_status' => (string) $api->setting( 'general', 'defaultAppointmentStatus' ),
			'slot_length'                => $minutes( $api->setting( 'general', 'timeSlotLength' ) ),
			'minimum_notice'             => $minutes( $api->setting( 'general', 'minimumTimeRequirementPriorToBooking' ) ),
			'booking_window_days'        => (int) $api->setting( 'general', 'numberOfDaysAvailableForBooking' ),
			'sender_configured'          => $api->sender_configured(),
			'channels'                   => array(
				'email'    => $api->sender_configured(),
				'sms'      => (bool) $api->setting( 'notifications', 'smsSignedIn' ),
				'whatsapp' => (bool) $api->setting( 'notifications', 'whatsAppEnabled' ),
			),
			'employees_set_own_hours'    => (bool) $api->setting( 'roles', 'allowConfigureSchedule' ),
			'mcp_adapter'                => $api->adapter_source(),
			'allowed_operations'         => $write,
		);
	}

	/** @return array */
	protected function op_list_categories( array $a ) {
		$api    = $this->api();
		$counts = $api->service_counts();
		$rows   = array();
		foreach ( $api->category_ids() as $id ) {
			$v = self::category_view( $api, $id, $counts );
			if ( $v ) {
				$rows[] = $v;
			}
		}
		return array( 'categories' => $rows );
	}

	/** @return array */
	protected function op_list_services( array $a ) {
		$api  = $this->api();
		$page = max( 1, (int) ( $a['page'] ?? 1 ) );
		$r    = $api->query( 'service', array_intersect_key( $a, array( 'category_id' => 1, 'search' => 1 ) ), $page, self::PER_PAGE );
		$rows = array();
		foreach ( $r['ids'] as $id ) {
			$v = self::service_view( $api, $id );
			if ( $v ) {
				$rows[] = array( 'id' => $id, 'name' => $v['name'], 'category_id' => $v['category_id'], 'duration' => $v['duration'], 'price' => $v['price'], 'min_capacity' => $v['min_capacity'], 'max_capacity' => $v['max_capacity'], 'status' => $v['status'], 'employees' => array_column( $v['employees'], 'id' ), 'version' => $v['version'] );
			}
		}
		return array( 'services' => $rows, 'page' => $page, 'total' => $r['total'] );
	}

	/** @return array|WP_Error */
	protected function op_get_service( array $a ) {
		$v = self::service_view( $this->api(), (int) $a['service_id'] );
		return $v ? $v : self::not_found( 'service', (int) $a['service_id'] );
	}

	/** @return array */
	protected function op_list_employees( array $a ) {
		$api  = $this->api();
		$page = max( 1, (int) ( $a['page'] ?? 1 ) );
		$own  = $this->own_only( 'read', 'employees' );
		$r    = $api->query( 'employee', array_intersect_key( $a, array( 'service_id' => 1, 'search' => 1 ) ), $page, self::PER_PAGE );
		$rows = array();
		foreach ( $r['ids'] as $id ) {
			if ( $own && $own !== $id ) {
				continue;
			}
			$v = self::employee_view( $api, $id );
			if ( $v ) {
				$rows[] = array( 'id' => $id, 'first_name' => $v['first_name'], 'last_name' => $v['last_name'], 'email' => $v['email'], 'status' => $v['status'], 'services' => array_column( $v['services'], 'id' ), 'version' => $v['version'] );
			}
		}
		return array( 'employees' => $rows, 'page' => $page, 'total' => $own ? count( $rows ) : $r['total'] );
	}

	/** @return array|WP_Error */
	protected function op_get_employee( array $a ) {
		$id  = (int) $a['employee_id'];
		$own = $this->own_only( 'read', 'employees' );
		if ( $own && $own !== $id ) {
			return self::forbidden();
		}
		$v = self::employee_view( $this->api(), $id );
		return $v ? $v : self::not_found( 'employee', $id );
	}

	/** @return array */
	protected function op_list_customers( array $a ) {
		$api  = $this->api();
		$page = max( 1, (int) ( $a['page'] ?? 1 ) );
		$r    = $api->query( 'customer', array_intersect_key( $a, array( 'search' => 1 ) ), $page, self::PER_PAGE );
		$rows = array();
		foreach ( $r['ids'] as $id ) {
			$v = self::customer_view( $api, $id );
			if ( $v ) {
				$rows[] = array( 'id' => $id, 'first_name' => $v['first_name'], 'last_name' => $v['last_name'], 'email' => $v['email'], 'phone' => $v['phone'], 'status' => $v['status'], 'version' => $v['version'] );
			}
		}
		return array( 'customers' => $rows, 'page' => $page, 'total' => $r['total'] );
	}

	/** @return array|WP_Error */
	protected function op_get_customer( array $a ) {
		$id = (int) $a['customer_id'];
		$v  = self::customer_view( $this->api(), $id );
		return $v ? $v + $this->api()->usage( 'customer', $id ) : self::not_found( 'customer', $id );
	}

	/** @return array|WP_Error */
	protected function op_list_appointments( array $a ) {
		$api = $this->api();
		$w   = self::window( $a, 30 );
		if ( is_wp_error( $w ) ) {
			return $w;
		}
		$f   = array_intersect_key( $a, array( 'employee_id' => 1, 'service_id' => 1, 'customer_id' => 1, 'status' => 1 ) ) + array( 'from_utc' => $w[0], 'to_utc' => $w[1] );
		$own = $this->own_only( 'read', 'appointments' );
		if ( $own ) {
			if ( isset( $f['employee_id'] ) && (int) $f['employee_id'] !== $own ) {
				return array( 'appointments' => array(), 'page' => 1, 'total' => 0 );
			}
			$f['employee_id'] = $own;
		}
		$page = max( 1, (int) ( $a['page'] ?? 1 ) );
		$r    = $api->query( 'appointment', $f, $page, self::PER_PAGE );
		$rows = array();
		foreach ( $r['ids'] as $id ) {
			$v = self::appointment_view( $api, $id );
			if ( $v ) {
				unset( $v['internal_notes'] );
				$rows[] = $v;
			}
		}
		return array( 'appointments' => $rows, 'page' => $page, 'total' => $r['total'] );
	}

	/** @return array|WP_Error */
	protected function op_get_appointment( array $a ) {
		$id = (int) $a['appointment_id'];
		$v  = self::appointment_view( $this->api(), $id );
		if ( ! $v ) {
			return self::not_found( 'appointment', $id );
		}
		$own = $this->own_only( 'read', 'appointments' );
		return $own && $own !== $v['employee_id'] ? self::forbidden() : $v;
	}

	/** @return array|WP_Error */
	protected function op_get_availability( array $a ) {
		$api = $this->api();
		$sid = (int) $a['service_id'];
		$svc = self::service_view( $api, $sid );
		if ( ! $svc ) {
			return self::not_found( 'service', $sid );
		}
		$from = (string) ( $a['from'] ?? ( new DateTimeImmutable( 'now', wp_timezone() ) )->format( 'Y-m-d' ) );
		$to   = (string) ( $a['to'] ?? ( new DateTimeImmutable( $from, wp_timezone() ) )->modify( '+6 days' )->format( 'Y-m-d' ) );
		foreach ( array( 'from' => $from, 'to' => $to ) as $k => $v ) {
			if ( is_wp_error( self::local_bound( $v, false, $k ) ) || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $v ) ) {
				/* translators: %s: argument name. */
				return new WP_Error( 'invalid_argument', sprintf( __( 'Argument "%s" must be a site-local date (Y-m-d).', 'emcp-tools' ), $k ) );
			}
		}
		$employees = isset( $a['employee_id'] ) ? array( (int) $a['employee_id'] ) : array_column( $svc['employees'], 'id' );
		$r         = $api->call(
			'time-slots',
			array(
				'serviceId'     => $sid,
				'providerIds'   => $employees,
				'persons'       => (int) ( $a['persons'] ?? 1 ),
				'group'         => (int) ( $a['persons'] ?? 1 ) > 1 ? 1 : 0,
				'startDateTime' => $from . ' 00:00',
				'endDateTime'   => $to . ' 23:59',
			),
			array(),
			'GET'
		);
		if ( is_wp_error( $r ) ) {
			return $r;
		}
		$days = array();
		foreach ( (array) ( $r['slots'] ?? array() ) as $date => $times ) {
			foreach ( (array) $times as $time => $holders ) {
				$who = array();
				foreach ( (array) $holders as $h ) {
					$who[] = (int) ( is_array( $h ) ? ( $h[0] ?? 0 ) : $h );
				}
				$days[ (string) $date ][] = array( 'time' => (string) $time, 'employees' => array_values( array_unique( array_filter( $who ) ) ) );
			}
		}
		return array( 'service_id' => $sid, 'duration' => $svc['duration'], 'days' => $days );
	}

	/** @return array|WP_Error */
	protected function op_list_events( array $a ) {
		$api = $this->api();
		$w   = self::window( $a, 90 );
		if ( is_wp_error( $w ) ) {
			return $w;
		}
		$f = array( 'from_utc' => $w[0], 'to_utc' => $w[1] ) + array_intersect_key( $a, array( 'search' => 1 ) );
		if ( isset( $a['status'] ) ) {
			$f['status'] = 'open' === $a['status'] ? 'approved' : 'rejected';
		}
		$page = max( 1, (int) ( $a['page'] ?? 1 ) );
		$r    = $api->query( 'event', $f, $page, self::PER_PAGE );
		$rows = array();
		foreach ( $r['ids'] as $id ) {
			$v = self::event_view( $api, $id );
			if ( $v ) {
				$rows[] = array( 'id' => $id, 'name' => $v['name'], 'status' => $v['status'], 'periods' => array_map( static fn( $p ) => array( 'start' => $p['start'], 'end' => $p['end'] ), $v['periods'] ), 'max_capacity' => $v['max_capacity'], 'booked' => $v['booked'], 'places_left' => $v['places_left'], 'version' => $v['version'] );
			}
		}
		return array( 'events' => $rows, 'page' => $page, 'total' => $r['total'] );
	}

	/** @return array|WP_Error */
	protected function op_get_event( array $a ) {
		$v = self::event_view( $this->api(), (int) $a['event_id'] );
		return $v ? $v : self::not_found( 'event', (int) $a['event_id'] );
	}

	/** @return array|WP_Error */
	protected function op_list_event_bookings( array $a ) {
		$api = $this->api();
		$id  = (int) $a['event_id'];
		if ( empty( $api->rows( 'event', $id ) ) ) {
			return self::not_found( 'event', $id );
		}
		$page = max( 1, (int) ( $a['page'] ?? 1 ) );
		$r    = $api->query( 'event_booking', array( 'event_id' => $id ) + array_intersect_key( $a, array( 'status' => 1 ) ), $page, self::PER_PAGE );
		$rows = array();
		foreach ( $r['ids'] as $bid ) {
			$v = self::booking_view( $api, $bid );
			if ( $v ) {
				unset( $v['appointment_id'], $v['event_id'] );
				$rows[] = $v;
			}
		}
		return array( 'bookings' => $rows, 'page' => $page, 'total' => $r['total'] );
	}

	// Write handlers (spec 4.2).

	protected function writer(): EMCP_Tools_Amelia_Writer {
		return new EMCP_Tools_Amelia_Writer( $this->api() );
	}

	protected static function changes( array $a, array $control ): array {
		return array_diff_key( $a, array_flip( array_merge( array( 'force', 'version' ), $control ) ) );
	}

	protected static function ver( array $a ): ?string {
		return isset( $a['version'] ) ? (string) $a['version'] : null;
	}

	/** @return array|WP_Error */
	protected function op_create_category( array $a ) {
		return $this->writer()->create_category( $a );
	}

	/** @return array|WP_Error */
	protected function op_update_category( array $a ) {
		return $this->writer()->update_category( (int) $a['category_id'], self::ver( $a ), ! empty( $a['force'] ), self::changes( $a, array( 'category_id' ) ) );
	}

	/** @return array|WP_Error */
	protected function op_create_service( array $a ) {
		return $this->writer()->create_service( $a );
	}

	/** @return array|WP_Error */
	protected function op_update_service( array $a ) {
		return $this->writer()->update_service( (int) $a['service_id'], self::ver( $a ), ! empty( $a['force'] ), self::changes( $a, array( 'service_id' ) ) );
	}

	/** @return array|WP_Error */
	protected function op_set_service_status( array $a ) {
		return $this->writer()->set_service_status( (int) $a['service_id'], self::ver( $a ), ! empty( $a['force'] ), (string) $a['status'] );
	}

	/** @return array|WP_Error */
	protected function op_create_employee( array $a ) {
		return $this->writer()->create_employee( $a );
	}

	/** @return array|WP_Error */
	protected function op_update_employee( array $a ) {
		return $this->writer()->update_employee( (int) $a['employee_id'], self::ver( $a ), ! empty( $a['force'] ), self::changes( $a, array( 'employee_id' ) ) );
	}

	/** @return array|WP_Error */
	protected function op_set_employee_status( array $a ) {
		return $this->writer()->set_employee_status( (int) $a['employee_id'], self::ver( $a ), ! empty( $a['force'] ), (string) $a['status'] );
	}

	/** @return array|WP_Error */
	protected function op_set_working_hours( array $a ) {
		return $this->writer()->set_working_hours( (int) $a['employee_id'], self::ver( $a ), ! empty( $a['force'] ), (array) $a['week'] );
	}

	/** @return array|WP_Error */
	protected function op_set_days_off( array $a ) {
		return $this->writer()->set_days_off( (int) $a['employee_id'], self::ver( $a ), ! empty( $a['force'] ), (array) ( $a['days_off'] ?? array() ) );
	}

	/** @return array|WP_Error */
	protected function op_create_customer( array $a ) {
		return $this->writer()->create_customer( $a );
	}

	/** @return array|WP_Error */
	protected function op_update_customer( array $a ) {
		return $this->writer()->update_customer( (int) $a['customer_id'], self::ver( $a ), ! empty( $a['force'] ), self::changes( $a, array( 'customer_id' ) ) );
	}

	/** @return array|WP_Error */
	protected function op_create_appointment( array $a ) {
		return $this->writer()->create_appointment( $a );
	}

	/** @return array|WP_Error */
	protected function op_reschedule_appointment( array $a ) {
		return $this->writer()->reschedule_appointment( (int) $a['appointment_id'], self::ver( $a ), ! empty( $a['force'] ), self::changes( $a, array( 'appointment_id' ) ) );
	}

	/** @return array|WP_Error */
	protected function op_set_appointment_status( array $a ) {
		return $this->writer()->set_appointment_status( (int) $a['appointment_id'], self::ver( $a ), ! empty( $a['force'] ), (string) $a['status'], ! empty( $a['notify'] ) );
	}

	/** @return array|WP_Error */
	protected function op_update_appointment( array $a ) {
		return $this->writer()->update_appointment( (int) $a['appointment_id'], self::ver( $a ), ! empty( $a['force'] ), self::changes( $a, array( 'appointment_id' ) ) );
	}

	/** @return array|WP_Error */
	protected function op_set_booking_status( array $a ) {
		return $this->writer()->set_booking_status( (int) $a['booking_id'], self::ver( $a ), ! empty( $a['force'] ), (string) $a['status'], ! empty( $a['notify'] ) );
	}

	/** @return array|WP_Error */
	protected function op_create_event( array $a ) {
		return $this->writer()->create_event( $a );
	}

	/** @return array|WP_Error */
	protected function op_update_event( array $a ) {
		return $this->writer()->update_event( (int) $a['event_id'], self::ver( $a ), ! empty( $a['force'] ), self::changes( $a, array( 'event_id' ) ) );
	}

	/** @return array|WP_Error */
	protected function op_set_event_status( array $a ) {
		return $this->writer()->set_event_status( (int) $a['event_id'], self::ver( $a ), ! empty( $a['force'] ), (string) $a['status'], ! empty( $a['notify'] ) );
	}

	/** @return array|WP_Error */
	protected function op_add_event_booking( array $a ) {
		return $this->writer()->add_event_booking( (int) $a['event_id'], $a );
	}

	/** @return array|WP_Error */
	protected function op_delete_category( array $a ) {
		return $this->writer()->delete( 'category', (int) $a['category_id'], self::ver( $a ), ! empty( $a['force'] ) );
	}

	/** @return array|WP_Error */
	protected function op_delete_service( array $a ) {
		return $this->writer()->delete( 'service', (int) $a['service_id'], self::ver( $a ), ! empty( $a['force'] ) );
	}

	/** @return array|WP_Error */
	protected function op_delete_employee( array $a ) {
		return $this->writer()->delete( 'employee', (int) $a['employee_id'], self::ver( $a ), ! empty( $a['force'] ) );
	}

	/** @return array|WP_Error */
	protected function op_delete_customer( array $a ) {
		return $this->writer()->delete( 'customer', (int) $a['customer_id'], self::ver( $a ), ! empty( $a['force'] ) );
	}
}
