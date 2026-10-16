<?php
/**
 * fluentcrm-write operations. Row keys as in fluentcrm-read.php, plus confirm, nullable (arguments
 * an explicit null clears) and undo (undoable or irreversible). Every write to an existing object
 * takes the version from its read; force overrides only a version conflict. run_automations
 * defaults to false (D7); nothing sends without confirm (D8).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ver     = array( 'version' => 'string', 'force' => 'bool' );
$auto    = array( 'run_automations' => 'bool' );
$contact = array( 'first_name' => 'string', 'last_name' => 'string', 'prefix' => 'string', 'phone' => 'string', 'status' => 'enum:subscribed,pending,unsubscribed,transactional,bounced,complained,spammed', 'contact_type' => 'enum:lead,customer', 'address' => 'object', 'date_of_birth' => 'string', 'timezone' => 'string', 'source' => 'string', 'custom_fields' => 'object' );
$clears  = array( 'first_name', 'last_name', 'prefix', 'phone', 'date_of_birth', 'timezone' );
$segment = array( 'title' => 'string', 'slug' => 'string', 'description' => 'string' );
$mail    = array( 'subject' => 'string', 'body' => 'string', 'pre_header' => 'string', 'design_template' => 'string', 'is_transactional' => 'enum:yes,no', 'disable_footer' => 'enum:yes,no' );
$camp    = array( 'title' => 'string', 'email_subject' => 'string', 'email_pre_header' => 'string', 'email_body' => 'string', 'design_template' => 'string', 'settings' => 'object', 'recipients' => 'object', 'exclude_recipients' => 'object', 'subjects' => 'array', 'label_ids' => 'array', 'utm' => 'object' );
$tpl     = array( 'title' => 'string', 'subject' => 'string', 'body' => 'string', 'design_template' => 'string', 'settings' => 'object' );

return array(
	'create-contact'        => array(
		'desc' => 'Create a contact: email, fields, address {line_1, line_2, city, state, postal_code, country}, custom_fields {slug: value}, tags and lists (ids, slugs or titles). An existing email (any case) is contact_exists. No automation runs unless run_automations:true; double_optin:true sends FluentCRM\'s confirmation email to a contact that is not subscribed.',
		'args' => array( 'email' => 'string!', 'tags' => 'array', 'lists' => 'array', 'double_optin' => 'bool' ) + $contact + $auto,
		'cap'  => 'fcrm_manage_contacts',
		'run'  => 'op_create_contact',
		'undo' => 'undoable',
	),
	'update-contact'        => array(
		'desc' => 'Change a contact: only the fields you pass change; "" or null clears a field, a custom field included ([] clears a multiple choice). new_email renames it; add_tags, remove_tags, add_lists, remove_lists by id, slug or title; status_change_reason adds FluentCRM\'s audit note. No automation runs unless run_automations:true.',
		'args' => array( 'contact_id' => 'int!', 'new_email' => 'string', 'add_tags' => 'array', 'remove_tags' => 'array', 'add_lists' => 'array', 'remove_lists' => 'array', 'status_change_reason' => 'string' ) + $contact + $auto + $ver,
		'cap'  => 'fcrm_manage_contacts',
		'run'  => 'op_update_contact',
		'nullable' => $clears,
		'undo' => 'undoable',
	),
	'delete-contact'        => array(
		'desc' => 'Erase a contact with everything FluentCRM keeps about them (email history, notes, custom fields, tags, lists, automations). Cannot be undone, and earlier History entries for the contact lose their data. Needs confirm:true.',
		'args' => array( 'contact_id' => 'int!' ),
		'cap'  => 'fcrm_manage_contacts_delete',
		'run'  => 'op_delete_contact',
		'confirm' => true,
		'undo' => 'irreversible',
	),
	'import-contacts'       => array(
		'desc' => 'Create or update up to 200 contacts in one call: rows {email, contact fields such as first_name and phone on the row itself, address, custom_fields, tags, lists} (unknown keys are refused); if_exists merge (default) or skip; missing tags and lists are created only with create_missing:true. One History entry, undone per row.',
		'args' => array( 'contacts' => 'array!', 'if_exists' => 'enum:merge,skip', 'create_missing' => 'bool' ) + $auto,
		'cap'  => 'fcrm_manage_contacts',
		'run'  => 'op_import_contacts',
		'undo' => 'undoable',
	),
	'tag-contacts'          => array(
		'desc' => 'Add or remove tags and lists on up to 200 contacts, given as contact_ids or a filter (the list-contacts filters). dry_run:true gives FluentCRM\'s count and changes nothing.',
		'args' => array( 'contact_ids' => 'ints', 'filter' => 'object', 'add_tags' => 'array', 'remove_tags' => 'array', 'add_lists' => 'array', 'remove_lists' => 'array', 'dry_run' => 'bool' ) + $auto,
		'cap'  => 'fcrm_manage_contacts',
		'run'  => 'op_tag_contacts',
		'undo' => 'undoable',
	),
	'create-tag'            => array(
		'desc' => 'Create a tag: title, slug, description.',
		'args' => array( 'title' => 'string!', 'slug' => 'string', 'description' => 'string' ),
		'cap'  => 'fcrm_manage_contact_cats',
		'run'  => 'op_create_tag',
		'undo' => 'undoable',
	),
	'update-tag'            => array(
		'desc' => 'Rename a tag: only the fields you pass change.',
		'args' => array( 'tag_id' => 'int!' ) + $segment + $ver,
		'cap'  => 'fcrm_manage_contact_cats',
		'run'  => 'op_update_tag',
		'undo' => 'undoable',
	),
	'delete-tag'            => array(
		'desc' => 'Delete a tag; its contacts lose it. Up to 500 attached contacts. Needs confirm:true.',
		'args' => array( 'tag_id' => 'int!' ) + $ver,
		'cap'  => 'fcrm_manage_contact_cats_delete',
		'run'  => 'op_delete_tag',
		'confirm' => true,
		'undo' => 'undoable',
	),
	'merge-tags'            => array(
		'desc' => 'Move every contact of the from tags to the to tag and delete the from tags. Up to 500 attached contacts. Needs confirm:true.',
		'args' => array( 'from_tag_ids' => 'ints!', 'to_tag_id' => 'int!' ) + $auto,
		'cap'  => 'fcrm_manage_contact_cats_delete',
		'run'  => 'op_merge_tags',
		'confirm' => true,
		'undo' => 'undoable',
	),
	'create-list'           => array(
		'desc' => 'Create a list: title, slug, description.',
		'args' => array( 'title' => 'string!', 'slug' => 'string', 'description' => 'string' ),
		'cap'  => 'fcrm_manage_contact_cats',
		'run'  => 'op_create_list',
		'undo' => 'undoable',
	),
	'update-list'           => array(
		'desc' => 'Rename a list: only the fields you pass change.',
		'args' => array( 'list_id' => 'int!' ) + $segment + $ver,
		'cap'  => 'fcrm_manage_contact_cats',
		'run'  => 'op_update_list',
		'undo' => 'undoable',
	),
	'delete-list'           => array(
		'desc' => 'Delete a list; its contacts lose it. Up to 500 attached contacts. Needs confirm:true.',
		'args' => array( 'list_id' => 'int!' ) + $ver,
		'cap'  => 'fcrm_manage_contact_cats_delete',
		'run'  => 'op_delete_list',
		'confirm' => true,
		'undo' => 'undoable',
	),
	'merge-lists'           => array(
		'desc' => 'Move every contact of the from lists to the to list and delete the from lists. Up to 500 attached contacts. Needs confirm:true.',
		'args' => array( 'from_list_ids' => 'ints!', 'to_list_id' => 'int!' ) + $auto,
		'cap'  => 'fcrm_manage_contact_cats_delete',
		'run'  => 'op_merge_lists',
		'confirm' => true,
		'undo' => 'undoable',
	),
	'add-custom-field'      => array(
		'desc' => 'Add a contact custom field: label, slug, type (text, textarea, number, single-select, multi-select, radio, checkbox, date, date_time), options for choice types, group. The other fields stay as they are.',
		'args' => array( 'label' => 'string!', 'slug' => 'slug', 'type' => 'enum:text,textarea,number,single-select,multi-select,radio,checkbox,date,date_time', 'options' => 'array', 'group' => 'string' ) + $ver,
		'cap'  => 'fcrm_manage_settings',
		'run'  => 'op_add_custom_field',
		'undo' => 'undoable',
	),
	'update-custom-field'   => array(
		'desc' => 'Change a custom field\'s label, options or group. Its slug and type never change.',
		'args' => array( 'slug' => 'slug!', 'label' => 'string', 'options' => 'array', 'group' => 'string' ) + $ver,
		'cap'  => 'fcrm_manage_settings',
		'run'  => 'op_update_custom_field',
		'undo' => 'undoable',
	),
	'add-note'              => array(
		'desc' => 'Add a note to a contact: type (note, call, email, meeting, quote), title, description.',
		'args' => array( 'contact_id' => 'int!', 'type' => 'enum:note,call,email,meeting,quote', 'title' => 'string!', 'description' => 'string!' ),
		'cap'  => 'fcrm_manage_contacts',
		'run'  => 'op_add_note',
		'undo' => 'undoable',
	),
	'update-note'           => array(
		'desc' => 'Change a note: only the fields you pass change.',
		'args' => array( 'note_id' => 'int!', 'type' => 'enum:note,call,email,meeting,quote', 'title' => 'string', 'description' => 'string' ) + $ver,
		'cap'  => 'fcrm_manage_contacts',
		'run'  => 'op_update_note',
		'undo' => 'undoable',
	),
	'delete-note'           => array(
		'desc' => 'Delete a note.',
		'args' => array( 'note_id' => 'int!' ) + $ver,
		'cap'  => 'fcrm_manage_contacts_delete',
		'run'  => 'op_delete_note',
		'undo' => 'undoable',
	),
	'create-campaign'       => array(
		'desc' => 'Create a campaign draft: title, subject, pre-header, body, design template, recipients and exclude_recipients {tags, lists}, settings (sender, footer, trackers), A/B subjects, labels, UTM. Nothing is sent.',
		'args' => $camp,
		'cap'  => 'fcrm_manage_emails',
		'run'  => 'op_create_campaign',
		'undo' => 'undoable',
	),
	'update-campaign'       => array(
		'desc' => 'Change a campaign draft: only the fields you pass change. A campaign that is not a draft is refused.',
		'args' => array( 'campaign_id' => 'int!' ) + $camp + $ver,
		'cap'  => 'fcrm_manage_emails',
		'run'  => 'op_update_campaign',
		'undo' => 'undoable',
	),
	'schedule-campaign'     => array(
		'desc' => 'Send a campaign now or at a site-local time (Y-m-d H:i, in the future). expected_recipients must equal get-campaign\'s recipients_estimate count, or nothing is queued. Needs confirm:true. Undo withdraws the queue while nothing is sent.',
		'args' => array( 'campaign_id' => 'int!', 'scheduled_at' => 'string', 'expected_recipients' => 'uint!' ) + $ver,
		'cap'  => 'fcrm_manage_emails',
		'run'  => 'op_schedule_campaign',
		'confirm' => true,
		'undo' => 'undoable',
	),
	'unschedule-campaign'   => array(
		'desc' => 'Take a scheduled campaign back to draft while none of its emails has left the queue (emails_sent otherwise). Cannot be undone: schedule it again with confirm.',
		'args' => array( 'campaign_id' => 'int!' ),
		'cap'  => 'fcrm_manage_emails',
		'run'  => 'op_unschedule_campaign',
		'undo' => 'irreversible',
	),
	'pause-campaign'        => array(
		'desc' => 'Pause a sending campaign. Cannot be undone: resume it with confirm.',
		'args' => array( 'campaign_id' => 'int!' ),
		'cap'  => 'fcrm_manage_emails',
		'run'  => 'op_pause_campaign',
		'undo' => 'irreversible',
	),
	'resume-campaign'       => array(
		'desc' => 'Resume a paused campaign; sending continues. Needs confirm:true. Cannot be undone.',
		'args' => array( 'campaign_id' => 'int!' ),
		'cap'  => 'fcrm_manage_emails',
		'run'  => 'op_resume_campaign',
		'confirm' => true,
		'undo' => 'irreversible',
	),
	'duplicate-campaign'    => array(
		'desc' => 'Copy a campaign as a new draft, optionally with new_title.',
		'args' => array( 'campaign_id' => 'int!', 'new_title' => 'string' ),
		'cap'  => 'fcrm_manage_emails',
		'run'  => 'op_duplicate_campaign',
		'undo' => 'undoable',
	),
	'delete-campaign'       => array(
		'desc' => 'Delete a campaign draft. Needs confirm:true.',
		'args' => array( 'campaign_id' => 'int!' ) + $ver,
		'cap'  => 'fcrm_manage_email_delete',
		'run'  => 'op_delete_campaign',
		'confirm' => true,
		'undo' => 'undoable',
	),
	'send-test-email'       => array(
		'desc' => 'Send a test of a campaign (campaign_id) or of a draft subject and body to your own address. Needs confirm:true.',
		'args' => array( 'campaign_id' => 'int' ) + $mail,
		'cap'  => 'fcrm_manage_emails',
		'run'  => 'op_send_test_email',
		'confirm' => true,
		'undo' => 'irreversible',
	),
	'send-email-to-contact' => array(
		'desc' => 'Send one email to one contact now (SmartCodes resolve). Needs confirm:true. Cannot be undone.',
		'args' => array( 'contact_id' => 'int!', 'subject' => 'string!', 'body' => 'string!', 'pre_header' => 'string', 'design_template' => 'string', 'is_transactional' => 'enum:yes,no', 'disable_footer' => 'enum:yes,no', 'title' => 'string' ),
		'cap'  => 'fcrm_manage_emails',
		'run'  => 'op_send_email_to_contact',
		'confirm' => true,
		'undo' => 'irreversible',
	),
	'create-template'       => array(
		'desc' => 'Create an email template: title, subject, body, design template, settings.',
		'args' => $tpl,
		'cap'  => 'fcrm_manage_email_templates',
		'run'  => 'op_create_template',
		'undo' => 'undoable',
	),
	'update-template'       => array(
		'desc' => 'Change an email template: only the fields you pass change.',
		'args' => array( 'template_id' => 'int!' ) + $tpl + $ver,
		'cap'  => 'fcrm_manage_email_templates',
		'run'  => 'op_update_template',
		'undo' => 'undoable',
	),
	'delete-template'       => array(
		'desc' => 'Delete an email template. Needs confirm:true.',
		'args' => array( 'template_id' => 'int!' ) + $ver,
		'cap'  => 'fcrm_manage_email_templates+fcrm_manage_email_delete',
		'run'  => 'op_delete_template',
		'confirm' => true,
		'undo' => 'undoable',
	),
	'set-automation-status' => array(
		'desc' => 'Publish an automation (its triggers go live and enrolled contacts continue from their due steps; needs confirm:true) or set it to draft (cannot be undone: publish it again with confirm).',
		'args' => array( 'funnel_id' => 'int!', 'status' => 'enum:published,draft!' ) + $ver,
		'cap'  => 'fcrm_write_funnels',
		'run'  => 'op_set_automation_status',
		'undo' => 'publish undoable, draft irreversible',
	),
	'set-contact-automation' => array(
		'desc' => 'Move one contact in an automation: cancel, resume, or advance to a step (advance_to_sequence_id). resume and advance need confirm:true (they can send). Cannot be undone.',
		'args' => array( 'funnel_id' => 'int!', 'contact_id' => 'int!', 'action' => 'enum:cancel,resume,advance!', 'advance_to_sequence_id' => 'int' ),
		'cap'  => 'fcrm_write_funnels',
		'run'  => 'op_set_contact_automation',
		'undo' => 'irreversible',
	),
);
