<?php
/**
 * amelia-write operations. Row keys as in amelia-read.php, plus confirm. Every write to an existing
 * object takes the version from its read; force overrides only a version conflict. Times are
 * site-local Y-m-d H:i, durations in minutes. notify defaults to false (D10).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ver     = array( 'version' => 'string', 'force' => 'bool' );
$service = array( 'name' => 'string', 'category_id' => 'int', 'description' => 'string', 'duration' => 'int', 'time_before' => 'uint', 'time_after' => 'uint', 'price' => 'number', 'deposit' => 'number', 'min_capacity' => 'int', 'max_capacity' => 'int', 'color' => 'string', 'visible' => 'bool', 'employees' => 'array' );
$person  = array( 'first_name' => 'string', 'last_name' => 'string', 'email' => 'string', 'phone' => 'string' );
$event   = array( 'name' => 'string', 'description' => 'string', 'periods' => 'array', 'price' => 'number', 'max_capacity' => 'int', 'color' => 'string', 'visible' => 'bool', 'employees' => 'array', 'tags' => 'array', 'booking_opens' => 'string', 'booking_closes' => 'string' );
$booking = 'enum:approved,pending,canceled,rejected';

return array(
	'create-category'        => array(
		'desc' => 'Create a service category: name, color (#rrggbb), position.',
		'args' => array( 'name' => 'string!', 'color' => 'string', 'position' => 'uint' ),
		'cap'  => 'write:services',
		'run'  => 'op_create_category',
	),
	'update-category'        => array(
		'desc' => 'Change a category: only the fields you pass change.',
		'args' => array( 'category_id' => 'int!', 'name' => 'string', 'color' => 'string', 'position' => 'uint' ) + $ver,
		'cap'  => 'write:services',
		'run'  => 'op_update_category',
	),
	'delete-category'        => array(
		'desc' => 'Delete a category with no services. Needs confirm:true.',
		'args' => array( 'category_id' => 'int!' ) + $ver,
		'cap'  => 'delete:services',
		'run'  => 'op_delete_category',
		'confirm' => true,
	),
	'create-service'         => array(
		'desc' => 'Create a service: name, category_id, duration (minutes), price, and optionally description, time_before and time_after (minutes), deposit (a fixed amount; 0 is off), min_capacity and max_capacity (above 1 for group bookings), color, visible, employees (ids, or {id, price, min_capacity, max_capacity} for an employee\'s own price and capacity).',
		'args' => array( 'name' => 'string!', 'category_id' => 'int!', 'duration' => 'int!', 'price' => 'number!' ) + $service,
		'cap'  => 'write:services',
		'run'  => 'op_create_service',
	),
	'update-service'         => array(
		'desc' => 'Change a service: only the fields you pass change; employees replaces the list and keeps each named employee\'s own price unless you give one. apply_to_employees:true pushes the service price and capacity to every employee.',
		'args' => array( 'service_id' => 'int!', 'apply_to_employees' => 'bool' ) + $service + $ver,
		'cap'  => 'write:services',
		'run'  => 'op_update_service',
	),
	'set-service-status'     => array(
		'desc' => 'Show or hide a service on the booking form: status visible or hidden.',
		'args' => array( 'service_id' => 'int!', 'status' => 'enum:visible,hidden!' ) + $ver,
		'cap'  => 'write:services',
		'run'  => 'op_set_service_status',
	),
	'delete-service'         => array(
		'desc' => 'Delete a service that has no appointments at all. Needs confirm:true.',
		'args' => array( 'service_id' => 'int!' ) + $ver,
		'cap'  => 'delete:services',
		'run'  => 'op_delete_service',
		'confirm' => true,
	),
	'create-employee'        => array(
		'desc' => 'Create an employee: first_name, last_name, email, and optionally phone, description, services (ids, or {id, price, min_capacity, max_capacity}). No WordPress user is created or linked. Set the working week with set-working-hours: without one the employee has no free slots.',
		'args' => array( 'first_name' => 'string!', 'last_name' => 'string!', 'email' => 'string!', 'phone' => 'string', 'description' => 'string', 'services' => 'array' ),
		'cap'  => 'write:employees',
		'run'  => 'op_create_employee',
	),
	'update-employee'        => array(
		'desc' => 'Change an employee\'s profile or services: only the fields you pass change; the working week and days off stay. An empty phone or description clears it.',
		'args' => array( 'employee_id' => 'int!', 'description' => 'string', 'services' => 'array' ) + $person + $ver,
		'cap'  => 'write:employees',
		'run'  => 'op_update_employee',
	),
	'set-employee-status'    => array(
		'desc' => 'Show or hide an employee: status visible or hidden.',
		'args' => array( 'employee_id' => 'int!', 'status' => 'enum:visible,hidden!' ) + $ver,
		'cap'  => 'write:employees',
		'run'  => 'op_set_employee_status',
	),
	'set-working-hours'      => array(
		'desc' => 'Replace an employee\'s working week: week is a list of {day (monday to sunday), start, end (H:i), breaks: [{start, end}]}. A day you leave out is closed; breaks must fall inside the day.',
		'args' => array( 'employee_id' => 'int!', 'week' => 'array!' ) + $ver,
		'cap'  => 'write:employees',
		'run'  => 'op_set_working_hours',
	),
	'set-days-off'           => array(
		'desc' => 'Replace an employee\'s days off: days_off is a list of {name, start, end (Y-m-d), repeat (every year)}. An empty list removes them all.',
		'args' => array( 'employee_id' => 'int!', 'days_off' => 'array' ) + $ver,
		'cap'  => 'write:employees',
		'run'  => 'op_set_days_off',
	),
	'delete-employee'        => array(
		'desc' => 'Delete an employee who never had an appointment or event. Their WordPress user, if any, stays. Needs confirm:true.',
		'args' => array( 'employee_id' => 'int!' ) + $ver,
		'cap'  => 'delete:employees',
		'run'  => 'op_delete_employee',
		'confirm' => true,
	),
	'create-customer'        => array(
		'desc' => 'Create a customer: first_name, last_name, and optionally email, phone, note, birthday (Y-m-d), gender (male, female). No WordPress user is created.',
		'args' => array( 'first_name' => 'string!', 'last_name' => 'string!', 'email' => 'string', 'phone' => 'string', 'note' => 'string', 'birthday' => 'string', 'gender' => 'enum:male,female' ),
		'cap'  => 'write:customers',
		'run'  => 'op_create_customer',
	),
	'update-customer'        => array(
		'desc' => 'Change a customer: only the fields you pass change; an empty phone or note clears it.',
		'args' => array( 'customer_id' => 'int!', 'note' => 'string', 'birthday' => 'string', 'gender' => 'enum:male,female' ) + $person + $ver,
		'cap'  => 'write:customers',
		'run'  => 'op_update_customer',
	),
	'delete-customer'        => array(
		'desc' => 'Delete a customer who never had an appointment or event booking. Their WordPress user, if any, stays. Needs confirm:true.',
		'args' => array( 'customer_id' => 'int!' ) + $ver,
		'cap'  => 'delete:customers',
		'run'  => 'op_delete_customer',
		'confirm' => true,
	),
	'create-appointment'     => array(
		'desc' => 'Book an appointment: service_id, employee_id, customer_id, start (site-local Y-m-d H:i), and optionally persons, internal_notes, status (approved or pending; Amelia\'s default otherwise), notify (default false: the customer is not emailed; Amelia still emails the employee when a sender is configured). The slot must be free in the employee\'s working hours (time_slot_unavailable otherwise). A second customer in a group service\'s booked slot joins that appointment (merged:true).',
		'args' => array( 'service_id' => 'int!', 'employee_id' => 'int!', 'customer_id' => 'int!', 'start' => 'string!', 'persons' => 'int', 'internal_notes' => 'string', 'status' => 'enum:approved,pending', 'notify' => 'bool' ),
		'cap'  => 'write:appointments',
		'run'  => 'op_create_appointment',
	),
	'reschedule-appointment' => array(
		'desc' => 'Move an appointment: start (site-local Y-m-d H:i), optionally employee_id, notify (default false).',
		'args' => array( 'appointment_id' => 'int!', 'start' => 'string!', 'employee_id' => 'int', 'notify' => 'bool' ) + $ver,
		'cap'  => 'write:appointments',
		'run'  => 'op_reschedule_appointment',
	),
	'set-appointment-status' => array(
		'desc' => 'Approve, set pending, cancel or reject an appointment, notify (default false). Amelia stores a cancelled appointment with its end equal to its start; approving it again restores the end.',
		'args' => array( 'appointment_id' => 'int!', 'status' => $booking . '!', 'notify' => 'bool' ) + $ver,
		'cap'  => 'write:appointments',
		'run'  => 'op_set_appointment_status',
	),
	'update-appointment'     => array(
		'desc' => 'Change an appointment\'s internal_notes or persons (only what you pass changes).',
		'args' => array( 'appointment_id' => 'int!', 'internal_notes' => 'string', 'persons' => 'int' ) + $ver,
		'cap'  => 'write:appointments',
		'run'  => 'op_update_appointment',
	),
	'set-booking-status'     => array(
		'desc' => 'Change one customer\'s booking in a group appointment or an event: status approved, pending, canceled or rejected, notify (default false).',
		'args' => array( 'booking_id' => 'int!', 'status' => $booking . '!', 'notify' => 'bool' ) + $ver,
		'cap'  => 'write:appointments',
		'run'  => 'op_set_booking_status',
	),
	'create-event'           => array(
		'desc' => 'Create an event: name, periods ([{start, end}] site-local Y-m-d H:i), and optionally description, price, max_capacity, color, visible, employees (ids), tags (names), booking_opens and booking_closes.',
		'args' => array( 'name' => 'string!', 'periods' => 'array!' ) + $event,
		'cap'  => 'write:events',
		'run'  => 'op_create_event',
	),
	'update-event'           => array(
		'desc' => 'Change an event: only the fields you pass change; periods replaces the list (give a period\'s id to keep it).',
		'args' => array( 'event_id' => 'int!' ) + $event + $ver,
		'cap'  => 'write:events',
		'run'  => 'op_update_event',
	),
	'set-event-status'       => array(
		'desc' => 'Open or cancel an event: status open or cancelled, notify (default false; Amelia emails the attendees about a cancellation when a sender is configured, and the answer says who).',
		'args' => array( 'event_id' => 'int!', 'status' => 'enum:open,cancelled!', 'notify' => 'bool' ) + $ver,
		'cap'  => 'write:events',
		'run'  => 'op_set_event_status',
	),
	'add-event-booking'      => array(
		'desc' => 'Book a customer onto an event: event_id, customer_id, persons (default 1), notify (default false). Payment is left pending on site, as Amelia does for the admin.',
		'args' => array( 'event_id' => 'int!', 'customer_id' => 'int!', 'persons' => 'int', 'notify' => 'bool' ),
		'cap'  => 'write:events',
		'run'  => 'op_add_event_booking',
	),
);
