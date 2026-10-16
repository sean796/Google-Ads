<?php
/**
 * fluentcrm-read operations. Row keys: desc, args (EMCP_Tools_Op_Args schema), cap (FluentCRM's
 * fcrm_* permission, D6; several joined by + must all hold; "tool" for anyone who may read), via
 * (the FluentCRM ability or REST route the read runs), kind (what each answer's version covers),
 * run (handler method).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$page    = array( 'page' => 'int', 'per_page' => 'int' );
$sort    = array( 'sort_by' => 'string', 'sort_type' => 'enum:ASC,DESC' );
$segment = array( 'search' => 'string', 'ids' => 'array', 'include_counts' => 'bool', 'include_last_used' => 'bool' ) + $sort + $page;

return array(
	'get-setup'                 => array(
		'desc' => 'FluentCRM version and whether EMCP supports it, whether FluentCRM\'s own AI access (Settings > MCP) is on and its own MCP server\'s endpoint, the automation triggers and goals that are live, whether user sync is on, double opt-in and sender settings, contact statuses, the number of custom fields, and the write operations you may run. Answers while FluentCRM\'s AI access is off; nothing else does.',
		'args' => array(),
		'cap'  => 'tool',
		'run'  => 'op_get_setup',
	),
	'list-contacts'             => array(
		'desc' => 'FluentCRM\'s list-contacts: filter by search, emails (exact, up to 100), tags, lists (ids, slugs or titles), statuses, contact_type, created_after, created_before, or advanced_filters (see get-contact-filter-schema); sort and page. Each contact carries its version.',
		'args' => array( 'search' => 'string', 'emails' => 'array', 'tags' => 'array', 'lists' => 'array', 'statuses' => 'array', 'contact_type' => 'enum:lead,customer', 'created_after' => 'string', 'created_before' => 'string', 'advanced_filters' => 'array', 'include_custom_fields' => 'bool' ) + $sort + $page,
		'cap'  => 'fcrm_read_contacts',
		'via'  => 'list-contacts',
		'kind' => 'contact',
		'run'  => 'op_ability_read',
	),
	'get-contact-filter-schema' => array(
		'desc' => 'FluentCRM\'s reference for advanced_filters: every property, operator and value type, with an example.',
		'args' => array(),
		'cap'  => 'fcrm_read_contacts',
		'via'  => 'get-contact-filter-schema',
		'run'  => 'op_ability_read',
	),
	'get-contact'               => array(
		'desc' => 'One contact by contact_id or email: profile, custom fields, tags, lists, and by default notes, email history and automations (include picks sections). Carries the version every write to this contact needs.',
		'args' => array( 'contact_id' => 'int', 'email' => 'string', 'include' => 'array', 'body_format' => 'enum:text,html,both', 'notes_limit' => 'int', 'note_body_max_chars' => 'int', 'automations_limit' => 'int', 'email_history_limit' => 'int' ),
		'cap'  => 'fcrm_read_contacts',
		'via'  => 'get-contact',
		'kind' => 'contact',
		'run'  => 'op_ability_read',
	),
	'list-tags'                 => array(
		'desc' => 'The tag registry: search, resolve ids, slugs or titles (ids), counts and last use on request, sorted and paged. Each tag carries its version.',
		'args' => $segment,
		'cap'  => 'fcrm_read_contacts',
		'via'  => 'list-tags',
		'kind' => 'tag',
		'run'  => 'op_ability_read',
	),
	'list-lists'                => array(
		'desc' => 'The list registry, as list-tags. Each list carries its version.',
		'args' => $segment,
		'cap'  => 'fcrm_read_contacts',
		'via'  => 'list-lists',
		'kind' => 'list',
		'run'  => 'op_ability_read',
	),
	'list-custom-fields'        => array(
		'desc' => 'Contact custom fields {slug, label, type, options, group}, with the version add-custom-field and update-custom-field need.',
		'args' => array(),
		'cap'  => 'fcrm_read_contacts',
		'via'  => 'GET custom-fields/contacts',
		'kind' => 'custom_fields',
		'run'  => 'op_rest_read',
	),
	'list-campaigns'            => array(
		'desc' => 'Email campaigns: search, statuses, stats on request (include_stats), one-off sends on request (include_one_offs), sorted and paged. Each campaign carries its version.',
		'args' => array( 'search' => 'string', 'statuses' => 'array', 'include_stats' => 'bool', 'include_one_offs' => 'bool' ) + $sort + $page,
		'cap'  => 'fcrm_read_emails',
		'via'  => 'list-campaigns',
		'kind' => 'campaign',
		'run'  => 'op_ability_read',
	),
	'get-campaign'              => array(
		'desc' => 'One campaign: subject, body, settings, recipients, schedule, and on request stats, A/B subjects, link report and recipients_estimate (schedule-campaign needs that count). Carries its version.',
		'args' => array( 'campaign_id' => 'int!', 'include' => 'array', 'body_format' => 'enum:text,html,both' ),
		'cap'  => 'fcrm_read_emails',
		'via'  => 'get-campaign',
		'kind' => 'campaign',
		'run'  => 'op_ability_read',
	),
	'list-templates'            => array(
		'desc' => 'Email templates, paged.',
		'args' => array( 'search' => 'string' ) + $page,
		'cap'  => 'fcrm_read_emails',
		'via'  => 'GET templates',
		'run'  => 'op_rest_read',
	),
	'get-template'              => array(
		'desc' => 'One email template with its subject, body and design settings, and its version.',
		'args' => array( 'template_id' => 'int!' ),
		'cap'  => 'fcrm_read_emails+fcrm_manage_emails',
		'via'  => 'GET templates/{template_id}',
		'kind' => 'template',
		'run'  => 'op_rest_read',
	),
	'preview-email'             => array(
		'desc' => 'Render a campaign or a draft subject and body against a contact (FluentCRM\'s render-email-preview). Needs contact read access too, as the result shows the contact\'s data.',
		'args' => array( 'campaign_id' => 'int', 'subject' => 'string', 'body' => 'string', 'pre_header' => 'string', 'design_template' => 'string', 'against_contact_id' => 'int', 'against_contact_email' => 'string', 'is_transactional' => 'enum:yes,no', 'disable_footer' => 'enum:yes,no' ),
		'cap'  => 'fcrm_read_emails+fcrm_read_contacts',
		'via'  => 'render-email-preview',
		'run'  => 'op_ability_read',
	),
	'list-automations'          => array(
		'desc' => 'Automations with status, trigger and counts (include_last_enrolled on request). Each carries its version.',
		'args' => array( 'search' => 'string', 'statuses' => 'array', 'include_last_enrolled' => 'bool' ) + $sort + $page,
		'cap'  => 'fcrm_read_funnels',
		'via'  => 'list-automations',
		'kind' => 'automation',
		'run'  => 'op_ability_read',
	),
	'get-automation'            => array(
		'desc' => 'One automation with its steps and report (email bodies only with include_bodies), and its version.',
		'args' => array( 'funnel_id' => 'int!', 'include' => 'array', 'include_bodies' => 'bool' ),
		'cap'  => 'fcrm_read_funnels',
		'via'  => 'get-automation',
		'kind' => 'automation',
		'run'  => 'op_ability_read',
	),
	'list-automation-contacts'  => array(
		'desc' => 'Contacts in an automation by status (active, waiting, completed, cancelled, skipped; default active).',
		'args' => array( 'funnel_id' => 'int!', 'statuses' => 'array' ) + $page,
		'cap'  => 'fcrm_read_funnels',
		'via'  => 'list-funnel-subscribers',
		'run'  => 'op_ability_read',
	),
);
