<?php
/**
 * amelia-read operations. Row keys: desc, args (EMCP_Tools_Op_Args schema), cap ("perm:entity",
 * Amelia's capability amelia_{perm}_{entity}, D5; "tool" for any Amelia role but customers), run
 * (handler method).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$status = 'enum:approved,pending,canceled,rejected,no-show';

return array(
	'get-setup'           => array(
		'desc' => 'Amelia version and edition, whether EMCP supports it, the site time zone (every time EMCP takes or gives is site-local, Y-m-d H:i), the currency, the default appointment status, the slot length and booking window in minutes and days, whether a mail sender is configured (without one Amelia sends no email at all), the notification channels set up, the MCP Adapter copy that is loaded, and the write operations you may run.',
		'args' => array(),
		'cap'  => 'tool',
		'run'  => 'op_get_setup',
	),
	'list-categories'     => array(
		'desc' => 'Service categories {id, name, color, position, status, services (count), version}, by position.',
		'args' => array(),
		'cap'  => 'read:services',
		'run'  => 'op_list_categories',
	),
	'list-services'       => array(
		'desc' => 'Services {id, name, category_id, duration (minutes), price, min_capacity, max_capacity, status, employees (ids), version}. Filters: category_id, search. 20 per page, with total.',
		'args' => array( 'category_id' => 'int', 'search' => 'string', 'page' => 'int' ),
		'cap'  => 'read:services',
		'run'  => 'op_list_services',
	),
	'get-service'         => array(
		'desc' => 'One service: name, category, description (raw), duration, time_before and time_after (minutes), price, deposit (0 is off), capacities, color, status, its employees with their own price and capacity, and version. Pass the version to every write on this service.',
		'args' => array( 'service_id' => 'int!' ),
		'cap'  => 'read:services',
		'run'  => 'op_get_service',
	),
	'list-employees'      => array(
		'desc' => 'Employees {id, first_name, last_name, email, status, services (ids), version}. Filters: service_id, search (name or email). 20 per page, with total.',
		'args' => array( 'service_id' => 'int', 'search' => 'string', 'page' => 'int' ),
		'cap'  => 'read:employees',
		'run'  => 'op_list_employees',
	),
	'get-employee'        => array(
		'desc' => 'One employee: profile, services with their own price and capacity, the working week (days monday to sunday with start, end and breaks; a day missing is closed), days off, and version.',
		'args' => array( 'employee_id' => 'int!' ),
		'cap'  => 'read:employees',
		'run'  => 'op_get_employee',
	),
	'list-customers'      => array(
		'desc' => 'Customers {id, first_name, last_name, email, phone, status, version}. Filter: search (name or email). 20 per page, with total.',
		'args' => array( 'search' => 'string', 'page' => 'int' ),
		'cap'  => 'read:customers',
		'run'  => 'op_list_customers',
	),
	'get-customer'        => array(
		'desc' => 'One customer: profile (note raw), version, and counts of upcoming and past appointments and event bookings.',
		'args' => array( 'customer_id' => 'int!' ),
		'cap'  => 'read:customers',
		'run'  => 'op_get_customer',
	),
	'list-appointments'   => array(
		'desc' => 'Appointments {id, service_id, employee_id, start, end, status, bookings: [{id, customer_id, status, persons, payment_status}], version} starting between from and to (site-local Y-m-d or Y-m-d H:i; default today to 30 days ahead). Filters: employee_id, service_id, customer_id, status. Employees see only their own. 20 per page, with total.',
		'args' => array( 'from' => 'string', 'to' => 'string', 'employee_id' => 'int', 'service_id' => 'int', 'customer_id' => 'int', 'status' => $status, 'page' => 'int' ),
		'cap'  => 'read:appointments',
		'run'  => 'op_list_appointments',
	),
	'get-appointment'     => array(
		'desc' => 'One appointment: service, employee, start and end (site-local), status, internal notes, its bookings with persons, price and payment status, and version.',
		'args' => array( 'appointment_id' => 'int!' ),
		'cap'  => 'read:appointments',
		'run'  => 'op_get_appointment',
	),
	'get-availability'    => array(
		'desc' => 'Free start times per day for a service, as Amelia computes them for the admin, between from and to (site-local Y-m-d; default the next 7 days): days: {Y-m-d: [{time, employees}]}. Optional employee_id and persons.',
		'args' => array( 'service_id' => 'int!', 'from' => 'string', 'to' => 'string', 'employee_id' => 'int', 'persons' => 'int' ),
		'cap'  => 'read:appointments',
		'run'  => 'op_get_availability',
	),
	'list-events'         => array(
		'desc' => 'Events {id, name, status (open or cancelled), periods [{start, end}], max_capacity, booked, places_left, version} with a period between from and to (site-local; default today to 90 days ahead). Filters: status, search. 20 per page, with total.',
		'args' => array( 'from' => 'string', 'to' => 'string', 'status' => 'enum:open,cancelled', 'search' => 'string', 'page' => 'int' ),
		'cap'  => 'read:events',
		'run'  => 'op_list_events',
	),
	'get-event'           => array(
		'desc' => 'One event: name, description (raw), status, periods with ids, price, capacity, color, visibility, employees, tags, booking_opens and booking_closes, attendees booked and places left, and version.',
		'args' => array( 'event_id' => 'int!' ),
		'cap'  => 'read:events',
		'run'  => 'op_get_event',
	),
	'list-event-bookings' => array(
		'desc' => 'Attendees of an event {booking_id, customer_id, customer, status, persons, price, payment_status, version}. Filter: status. 20 per page, with total.',
		'args' => array( 'event_id' => 'int!', 'status' => $status, 'page' => 'int' ),
		'cap'  => 'read:events',
		'run'  => 'op_list_event_bookings',
	),
);
