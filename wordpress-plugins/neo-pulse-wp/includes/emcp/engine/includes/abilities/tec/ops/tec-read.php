<?php
/**
 * events-calendar-read operations. Row keys: desc, args (EMCP_Tools_Op_Args schema), cap (a cap_*
 * rule of EMCP_Tools_TEC_Integration), run (handler method).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$status = 'enum:any,publish,future,draft,pending,private,trash';

return array(
	'get-setup'       => array(
		'desc' => 'The Events Calendar version and whether EMCP supports it, the time zone mode and site time zone, the enabled views and default view, events per page, the date formats, whether you may create and publish events, and the write operations you may run.',
		'args' => array(),
		'cap'  => 'cap_tool',
		'run'  => 'op_get_setup',
	),
	'list-events'     => array(
		'desc' => 'Events {id, title, status, start, end, timezone, all_day, venue, organizers, categories, event_status, url, edit_url}, by start date. Filters: start_after and end_before (Y-m-d or Y-m-d H:i), status (default every status but trash; other authors\' unpublished events only for users who may edit them), search, category, venue_id, organizer_id, featured. 20 per page, with total.',
		'args' => array( 'start_after' => 'string', 'end_before' => 'string', 'status' => $status, 'search' => 'string', 'category' => 'int', 'venue_id' => 'int', 'organizer_id' => 'int', 'featured' => 'bool', 'page' => 'int' ),
		'cap'  => 'cap_tool',
		'run'  => 'op_list_events',
	),
	'get-event'       => array(
		'desc' => 'One event: its fields (the names create-event and update-event take), its venue and organizers, categories, tags, event status and reason, url, edit_url and version. Pass the version to every write on this event.',
		'args' => array( 'event_id' => 'int!' ),
		'cap'  => 'cap_read_event',
		'run'  => 'op_get_event',
	),
	'list-venues'     => array(
		'desc' => 'Venues {id, title, status, city, country, events (linked events outside the trash), version}, by title. status, search. 20 per page, with total.',
		'args' => array( 'status' => $status, 'search' => 'string', 'page' => 'int' ),
		'cap'  => 'cap_tool',
		'run'  => 'op_list_venues',
	),
	'get-venue'       => array(
		'desc' => 'One venue: address fields, phone, website, map settings, the events linking to it, and version.',
		'args' => array( 'venue_id' => 'int!' ),
		'cap'  => 'cap_read_venue',
		'run'  => 'op_get_venue',
	),
	'list-organizers' => array(
		'desc' => 'Organizers {id, title, status, email, events (linked events outside the trash), version}, by title. status, search. 20 per page, with total.',
		'args' => array( 'status' => $status, 'search' => 'string', 'page' => 'int' ),
		'cap'  => 'cap_tool',
		'run'  => 'op_list_organizers',
	),
	'get-organizer'   => array(
		'desc' => 'One organizer: phone, email, website, the events linking to it, and version.',
		'args' => array( 'organizer_id' => 'int!' ),
		'cap'  => 'cap_read_organizer',
		'run'  => 'op_get_organizer',
	),
	'list-categories' => array(
		'desc' => 'Event categories {id, name, slug, parent, description, count, version}, by name. search. Pass a category version to update-category.',
		'args' => array( 'search' => 'string' ),
		'cap'  => 'cap_tool',
		'run'  => 'op_list_categories',
	),
);
