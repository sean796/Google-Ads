<?php
/**
 * events-calendar-write operations. Row keys: desc, args (EMCP_Tools_Op_Args schema), cap (a cap_*
 * rule of EMCP_Tools_TEC_Integration), run (handler method), confirm.
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$post_status = 'enum:draft,pending,publish,private';

$event_fields = array(
	'title'              => 'string',
	'content'            => 'string',
	'excerpt'            => 'string',
	'status'             => $post_status,
	'start_date'         => 'string',
	'end_date'           => 'string',
	'timezone'           => 'string',
	'all_day'            => 'bool',
	'cost'               => 'string',
	'currency_symbol'    => 'string',
	'currency_position'  => 'enum:prefix,suffix',
	'website'            => 'string',
	'featured_image'     => 'uint',
	'featured'           => 'bool',
	'hide_from_upcoming' => 'bool',
	'show_map'           => 'bool',
	'show_map_link'      => 'bool',
	'categories'         => 'array',
	'tags'               => 'array',
	'venue_id'           => 'uint',
	'organizer_ids'      => 'array',
);

$venue_fields = array(
	'content'        => 'string',
	'status'         => $post_status,
	'address'        => 'string',
	'city'           => 'string',
	'state_province' => 'string',
	'zip'            => 'string',
	'country'        => 'string',
	'phone'          => 'string',
	'website'        => 'string',
	'show_map'       => 'bool',
	'show_map_link'  => 'bool',
);

$organizer_fields = array(
	'content' => 'string',
	'status'  => $post_status,
	'phone'   => 'string',
	'email'   => 'string',
	'website' => 'string',
);

$ref = array( 'version' => 'string', 'force' => 'bool' );

return array(
	'create-event'     => array(
		'desc' => 'Create an event (draft unless status says otherwise): title, start_date and end_date (Y-m-d H:i, or Y-m-d with all_day), timezone (an identifier such as Europe/Paris, or UTC), content (HTML), excerpt, cost, currency_symbol, currency_position, website, featured_image (attachment id), featured, hide_from_upcoming, show_map, show_map_link, categories (term ids), tags (names or ids), venue_id and organizer_ids (existing venues and organizers outside the trash).',
		'args' => array( 'title' => 'string!', 'start_date' => 'string!', 'end_date' => 'string!' ) + $event_fields,
		'cap'  => 'cap_create_event',
		'run'  => 'op_create_event',
	),
	'update-event'     => array(
		'desc' => 'Change an event: only the fields you pass change, the rest is kept. venue_id 0 unlinks the venue, organizer_ids [] removes the organizers, featured_image 0 removes the image. version from get-event; a newer change is a conflict unless force.',
		'args' => array( 'event_id' => 'int!' ) + $ref + $event_fields,
		'cap'  => 'cap_edit_event',
		'run'  => 'op_update_event',
	),
	'set-event-status' => array(
		'desc' => 'Mark an event scheduled, cancelled or postponed, with an optional reason shown on the event page. version from get-event.',
		'args' => array( 'event_id' => 'int!', 'event_status' => 'enum:scheduled,cancelled,postponed!', 'reason' => 'string' ) + $ref,
		'cap'  => 'cap_edit_event',
		'run'  => 'op_set_event_status',
	),
	'trash-event'      => array(
		'desc'    => 'Move an event to the trash (never deleted permanently). Undo gives it back its earlier status. version from get-event. Needs confirm.',
		'args'    => array( 'event_id' => 'int!' ) + $ref,
		'cap'     => 'cap_trash_event',
		'run'     => 'op_trash_event',
		'confirm' => true,
	),
	'create-venue'     => array(
		'desc' => 'Create a venue: title, address, city, state_province, zip, country, phone, website, show_map, show_map_link, content, status (draft unless given).',
		'args' => array( 'title' => 'string!' ) + $venue_fields,
		'cap'  => 'cap_create_venue',
		'run'  => 'op_create_venue',
	),
	'update-venue'     => array(
		'desc' => 'Change a venue: only the fields you pass change. version from get-venue.',
		'args' => array( 'venue_id' => 'int!', 'title' => 'string' ) + $ref + $venue_fields,
		'cap'  => 'cap_edit_venue',
		'run'  => 'op_update_venue',
	),
	'trash-venue'      => array(
		'desc'    => 'Move a venue to the trash. Refused while any event outside the trash links to it (in_use, with the event ids): unlink it from them first. version from get-venue. Needs confirm.',
		'args'    => array( 'venue_id' => 'int!' ) + $ref,
		'cap'     => 'cap_trash_venue',
		'run'     => 'op_trash_venue',
		'confirm' => true,
	),
	'create-organizer' => array(
		'desc' => 'Create an organizer: title, phone, email, website, content, status (draft unless given).',
		'args' => array( 'title' => 'string!' ) + $organizer_fields,
		'cap'  => 'cap_create_organizer',
		'run'  => 'op_create_organizer',
	),
	'update-organizer' => array(
		'desc' => 'Change an organizer: only the fields you pass change. version from get-organizer.',
		'args' => array( 'organizer_id' => 'int!', 'title' => 'string' ) + $ref + $organizer_fields,
		'cap'  => 'cap_edit_organizer',
		'run'  => 'op_update_organizer',
	),
	'trash-organizer'  => array(
		'desc'    => 'Move an organizer to the trash. Refused while any event outside the trash links to it (in_use). version from get-organizer. Needs confirm.',
		'args'    => array( 'organizer_id' => 'int!' ) + $ref,
		'cap'     => 'cap_trash_organizer',
		'run'     => 'op_trash_organizer',
		'confirm' => true,
	),
	'create-category'  => array(
		'desc' => 'Create an event category: name, slug, description, parent (a category id).',
		'args' => array( 'name' => 'string!', 'slug' => 'string', 'description' => 'string', 'parent' => 'uint' ),
		'cap'  => 'cap_category',
		'run'  => 'op_create_category',
	),
	'update-category'  => array(
		'desc' => 'Change an event category: only the fields you pass change. version from list-categories.',
		'args' => array( 'category_id' => 'int!', 'name' => 'string', 'slug' => 'string', 'description' => 'string', 'parent' => 'uint' ) + $ref,
		'cap'  => 'cap_category',
		'run'  => 'op_update_category',
	),
);
