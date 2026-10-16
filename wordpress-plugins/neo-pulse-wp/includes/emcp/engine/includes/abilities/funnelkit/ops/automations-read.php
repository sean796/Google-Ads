<?php
/**
 * funnelkit-automations-read operations.
 *
 * @package EMCP_Tools
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ns = '/autonami-app';

return array(
	// Automations.
	'list-automations'        => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/automations', 'args' => array( 'search' => 'string', 'status' => 'string', 'category' => 'string', 'limit' => 'int', 'offset' => 'string', 'version' => 'string' ), 'desc' => 'Automations with status and counts.' ),
	'search-automations'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/search/automations', 'args' => array( 'search' => 'string!', 'ids' => 'string', 'limit' => 'int', 'offset' => 'string', 'version' => 'string' ), 'desc' => 'Search automations.' ),
	'get-automation'          => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/automation/{automation_id}', 'args' => array( 'automation_id' => 'int!' ), 'desc' => 'One automation: event, rules and steps.' ),
	'get-automation-contacts' => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/automation/{automation_id}/contacts', 'args' => array( 'automation_id' => 'int!', 'type' => 'string', 'search' => 'string', 'limit' => 'int', 'offset' => 'string' ), 'handler' => 'op_compact_contacts', 'desc' => 'Contacts in an automation (compact rows).' ),
	'get-automation-step-contacts' => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/automation/{automation_id}/step/{step_id}/contacts', 'args' => array( 'automation_id' => 'int!', 'step_id' => 'int!', 'type' => 'string', 'path' => 'string', 'limit' => 'int', 'offset' => 'string' ), 'handler' => 'op_compact_contacts', 'desc' => 'Contacts at one automation step.' ),
	'get-automation-stats'    => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/automations-stats/{automation_id}', 'args' => array( 'automation_id' => 'int!' ), 'desc' => 'Stats of one automation.' ),
	'get-automations-stats'   => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/automations-stats', 'args' => array( 'automation_ids' => 'string!', 'version' => 'string' ), 'desc' => 'Stats of several automations (comma-separated ids).' ),
	'get-step-analytics'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/automation/{automation_id}/analytics/{step_id}', 'args' => array( 'automation_id' => 'int!', 'step_id' => 'int!', 'mode' => 'string' ), 'desc' => 'Analytics of one automation step.' ),
	'get-automation-conversions' => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/automation/{automation_id}/conversions', 'args' => array( 'automation_id' => 'int!' ), 'desc' => 'Orders attributed to an automation.' ),
	'get-automation-recipients' => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/automation/{automation_id}/recipients', 'args' => array( 'automation_id' => 'int!' ), 'handler' => 'op_compact_contacts', 'desc' => 'Who an automation messaged (compact rows).' ),
	'list-events'             => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/events', 'args' => array(), 'desc' => 'Events an automation can start on.' ),
	'list-actions'            => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/actions', 'args' => array(), 'desc' => 'Actions an automation step can run.' ),
	'get-event-rules'         => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/automation/event-rules/{event}', 'args' => array( 'event' => 'slug!', 'automation_id' => 'int' ), 'handler' => 'op_event_rules', 'desc' => 'Rules available for an event.' ),
	'list-recipes'            => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/recipes', 'args' => array( 'sync' => 'bool' ), 'desc' => 'Automation recipes in FunnelKit\'s library.' ),
	'task-history'            => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/automations/task-history', 'args' => array( 'automation_id' => 'int', 'status' => 'string', 'action_slug' => 'string', 'search' => 'string', 'limit' => 'int', 'offset' => 'string' ), 'desc' => 'Tasks automations have run.' ),

	// Contacts.
	'list-contacts'           => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/contacts/listing', 'args' => array( 'search' => 'string', 'filters' => 'json', 'audience_id' => 'int', 'order' => 'enum:asc,desc', 'order_by' => 'string', 'only_count' => 'bool' ), 'handler' => 'op_compact_contacts', 'desc' => 'Contacts as compact rows: id, email, status, tags, lists.' ),
	'get-contact'             => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/contacts/{contact_id}', 'args' => array( 'contact_id' => 'int!' ), 'desc' => 'One contact in full.' ),
	'get-contact-tags'        => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/contacts/{contact_id}/tags', 'args' => array( 'contact_id' => 'int!' ), 'desc' => 'A contact\'s tags.' ),
	'get-contact-lists'       => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/contacts/{contact_id}/lists', 'args' => array( 'contact_id' => 'int!', 'search' => 'string' ), 'desc' => 'A contact\'s lists.' ),
	'get-contact-notes'       => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/contacts/{contact_id}/notes', 'args' => array( 'contact_id' => 'int!', 'limit' => 'int', 'offset' => 'string' ), 'desc' => 'A contact\'s notes.' ),
	'get-contact-automations' => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/contact/{contact_id}/automations', 'args' => array( 'contact_id' => 'int!', 'limit' => 'int', 'offset' => 'string' ), 'desc' => 'Automations a contact is in.' ),
	'get-contact-funnels'     => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/contacts/{contact_id}/funnels', 'args' => array( 'contact_id' => 'int!', 'limit' => 'int', 'offset' => 'string' ), 'desc' => 'Funnels a contact went through.' ),
	'get-contact-orders'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/contacts/{contact_id}/orders', 'args' => array( 'contact_id' => 'int!', 'limit' => 'int', 'offset' => 'string' ), 'desc' => 'A contact\'s orders.' ),
	'get-contact-engagements' => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/contacts/{contact_id}/engagements', 'args' => array( 'contact_id' => 'int!', 'mode' => 'string', 'limit' => 'int', 'offset' => 'string' ), 'desc' => 'Messages sent to a contact.' ),

	// Taxonomy.
	'list-tags'               => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/tags', 'args' => array( 'search' => 'string', 'ids' => 'string', 'limit' => 'int', 'offset' => 'string' ), 'desc' => 'Tags.' ),
	'list-lists'              => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/lists', 'args' => array( 'search' => 'string', 'ids' => 'string', 'limit' => 'int', 'offset' => 'string' ), 'desc' => 'Lists.' ),
	'list-fields'             => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/fields', 'args' => array( 'type' => 'string', 'all' => 'bool' ), 'desc' => 'Contact fields.' ),
	'list-field-groups'       => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/groupfields', 'args' => array(), 'desc' => 'Field groups with their fields.' ),
	'list-audiences'          => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/audiences', 'args' => array( 'search' => 'string', 'ids' => 'string', 'limit' => 'int', 'offset' => 'string' ), 'pro' => 'automations-pro', 'desc' => 'Audiences (saved segments).' ),
	'get-audience'            => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/audience/{audience_id}', 'args' => array( 'audience_id' => 'int!' ), 'pro' => 'automations-pro', 'desc' => 'One audience.' ),

	// Messaging (Pro).
	'list-broadcasts'         => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/broadcasts', 'args' => array( 'search' => 'string', 'status' => 'string', 'type' => 'string', 'category' => 'string', 'order' => 'enum:ASC,DESC' ), 'pro' => 'automations-pro', 'desc' => 'Broadcasts.' ),
	'get-broadcast'           => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/broadcast/{campaign_id}', 'args' => array( 'campaign_id' => 'int!' ), 'pro' => 'automations-pro', 'desc' => 'One broadcast.' ),
	'get-broadcast-stats'     => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/broadcast/{campaign_id}/stats', 'args' => array( 'campaign_id' => 'int!' ), 'pro' => 'automations-pro', 'desc' => 'Broadcast stats.' ),
	'list-templates'          => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/templates', 'args' => array( 'search' => 'string', 'mode' => 'string', 'category' => 'string', 'ids' => 'string', 'limit' => 'int', 'offset' => 'string' ), 'pro' => 'automations-pro', 'desc' => 'Email templates.' ),
	'get-template'            => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/template/{template_id}', 'args' => array( 'template_id' => 'int!' ), 'pro' => 'automations-pro', 'desc' => 'One email template.' ),
	'list-form-feeds'         => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/form-feeds', 'args' => array( 'search' => 'string', 'status' => 'string', 'category' => 'string' ), 'pro' => 'automations-pro', 'desc' => 'Form feeds (form to list/tag connections).' ),
	'get-form-feed'           => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/form-feeds/{feed_id}', 'args' => array( 'feed_id' => 'int!' ), 'pro' => 'automations-pro', 'desc' => 'One form feed.' ),
	'list-link-triggers'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/link-triggers', 'args' => array( 'search' => 'string', 'status' => 'string', 'category' => 'string', 'ids' => 'string', 'limit' => 'int', 'offset' => 'string' ), 'pro' => 'automations-pro', 'desc' => 'Link triggers.' ),
	'get-link-trigger'        => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/link-trigger/{link_id}', 'args' => array( 'link_id' => 'int!' ), 'pro' => 'automations-pro', 'desc' => 'One link trigger.' ),
	'list-transactional-mails' => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/transactional-mails', 'args' => array(), 'pro' => 'automations-pro', 'desc' => 'WooCommerce transactional emails FunnelKit manages.' ),
	'list-bulk-actions'       => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/bulk-actions', 'args' => array( 'search' => 'string', 'status' => 'string', 'ids' => 'string', 'limit' => 'int', 'offset' => 'string' ), 'pro' => 'automations-pro', 'desc' => 'Bulk actions.' ),
	'get-bulk-action'         => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/bulk-action/{bulk_action_id}', 'args' => array( 'bulk_action_id' => 'int!' ), 'pro' => 'automations-pro', 'desc' => 'One bulk action and its progress.' ),

	// Reports.
	'list-carts'              => array( 'mode' => 'read', 'method' => 'GET', 'route' => '', 'composite' => array( $ns . '/carts/recoverable', $ns . '/carts/recovered', $ns . '/carts/lost' ), 'args' => array( 'state' => 'enum:recoverable,recovered,lost!', 'search' => 'string', 'limit' => 'int', 'offset' => 'string' ), 'handler' => 'op_list_carts', 'desc' => 'Abandoned carts by state.' ),
	'cart-analytics'          => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/analytics/carts', 'args' => array(), 'desc' => 'Cart recovery analytics.' ),
	'dashboard'               => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/dashboard', 'args' => array(), 'desc' => 'Automations dashboard.' ),
	'email-reports'           => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/analytics/emails/tabular', 'args' => array( 'after' => 'string', 'before' => 'string', 'type' => 'string', 'mode' => 'string', 'limit' => 'int', 'offset' => 'string' ), 'pro' => 'automations-pro', 'desc' => 'Email performance.' ),
	'email-activity'          => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/v3/email-activity', 'args' => array( 'search' => 'string', 'filters' => 'json' ), 'desc' => 'Recent email activity.' ),

	// Settings and exports.
	'get-automations-settings' => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/settings', 'args' => array(), 'handler' => 'op_read_settings', 'desc' => 'Automations settings (allowlisted keys only).' ),
	'list-unsubscribers'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/settings/unsubscribers', 'args' => array( 'search' => 'string', 'limit' => 'int', 'offset' => 'string' ), 'desc' => 'Unsubscribed addresses.' ),
	'export-automations'      => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/automations/export', 'args' => array( 'ids' => 'string!', 'version' => 'string' ), 'handler' => 'op_export_inline', 'desc' => 'Export automations as JSON (inline, up to 2 MB).' ),
	'export-templates'        => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/templates/export', 'args' => array( 'ids' => 'string!' ), 'pro' => 'automations-pro', 'handler' => 'op_export_inline', 'desc' => 'Export email templates as JSON.' ),
	'contact-import-status'   => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/contacts/import/{id}/status', 'args' => array( 'id' => 'int!' ), 'desc' => 'Progress of a contact import.' ),
	'contact-export-status'   => array( 'mode' => 'read', 'method' => 'GET', 'route' => $ns . '/contact/export/{export_id}', 'args' => array( 'export_id' => 'int!' ), 'desc' => 'Progress of a contact export.' ),
);
