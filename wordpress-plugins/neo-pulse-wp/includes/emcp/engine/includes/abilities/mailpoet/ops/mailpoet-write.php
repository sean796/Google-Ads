<?php
/**
 * mailpoet-write operations. Row keys as in mailpoet-read.php, plus confirm (always needed),
 * nullable (arguments an explicit null clears) and undo (undoable or irreversible). Every write to
 * an existing object takes the version from its read; force overrides only a version conflict.
 * run_automations defaults to false (D5); nothing is emailed without confirm (D6).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$ver   = array( 'version' => 'string', 'force' => 'bool' );
$auto  = array( 'run_automations' => 'bool' );
$names = array( 'first_name' => 'string', 'last_name' => 'string' );
$mail  = array( 'subject' => 'string', 'preheader' => 'string', 'sender_name' => 'string', 'sender_address' => 'string', 'reply_to_name' => 'string', 'reply_to_address' => 'string', 'list_ids' => 'ints', 'content' => 'string' );

return array(
	'create-subscriber'       => array(
		'desc' => 'Add a subscriber: email, first_name, last_name, custom_fields {cf_{id}: value}, list_ids, tag_ids. Their status is MailPoet\'s (unconfirmed while double opt-in is on). Nothing is emailed and no automation or welcome email starts unless asked: send_confirmation:true (with confirm:true) sends MailPoet\'s confirmation email, run_automations:true lets automations and welcome emails run. An existing email (any case) is subscriber_exists.',
		'args' => array( 'email' => 'string!', 'custom_fields' => 'object', 'list_ids' => 'ints', 'tag_ids' => 'ints', 'send_confirmation' => 'bool' ) + $names + $auto,
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_create_subscriber',
		'undo' => 'undoable',
	),
	'update-subscriber'       => array(
		'desc' => 'Change a subscriber: only the fields you pass change; "" or null clears a name or a custom field value. add_lists, remove_lists, add_tags, remove_tags change memberships one by one. MailPoet\'s consent record (source, IPs, confirmation) is never touched. Subscribers of WordPress users and WooCommerce customers take their email and names from the user (synced_subscriber).',
		'args' => array( 'subscriber_id' => 'int!', 'email' => 'string', 'custom_fields' => 'object', 'add_lists' => 'ints', 'remove_lists' => 'ints', 'add_tags' => 'ints', 'remove_tags' => 'ints' ) + $names + $auto + $ver,
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_update_subscriber',
		'nullable' => array( 'first_name', 'last_name' ),
		'undo' => 'undoable',
	),
	'set-subscriber-status'   => array(
		'desc' => 'unsubscribed: MailPoet\'s own unsubscribe from every list (cannot be undone). subscribed: only from unconfirmed, a manual confirmation, with confirm:true; never for someone who unsubscribed, bounced or went inactive (consent_required).',
		'args' => array( 'subscriber_id' => 'int!', 'status' => 'enum:subscribed,unsubscribed!' ) + $auto + $ver,
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_set_subscriber_status',
		'undo' => 'undoable when confirming; irreversible when unsubscribing',
	),
	'send-confirmation-email' => array(
		'desc' => 'Send MailPoet\'s double opt-in email again to an unconfirmed subscriber. Needs confirm:true.',
		'args' => array( 'subscriber_id' => 'int!' ),
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_send_confirmation_email',
		'confirm' => true,
		'undo' => 'irreversible',
	),
	'delete-subscriber'       => array(
		'desc' => 'Erase a subscriber with their memberships, custom field values and tags. Cannot be undone, and earlier History entries about them lose their data. Subscribers of WordPress users and WooCommerce customers cannot be deleted here. Needs confirm:true.',
		'args' => array( 'subscriber_id' => 'int!' ),
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_delete_subscriber',
		'confirm' => true,
		'undo' => 'irreversible',
	),
	'import-subscribers'      => array(
		'desc' => 'Create or update up to 200 subscribers in one call: rows {email, first_name, last_name, custom_fields, list_ids, tag_ids}; if_exists merge (default) or skip. Nothing is emailed and no automation runs unless run_automations:true. One History entry, undone per row.',
		'args' => array( 'subscribers' => 'array!', 'if_exists' => 'enum:merge,skip' ) + $auto,
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_import_subscribers',
		'undo' => 'undoable',
	),
	'tag-subscribers'         => array(
		'desc' => 'Add or remove tags and lists for up to 200 subscribers: subscriber_ids, or filter {search, status, list_id, tag_id}. dry_run:true answers the count and the ids only. One History entry, undone per row.',
		'args' => array( 'subscriber_ids' => 'ints', 'filter' => 'object', 'add_tags' => 'ints', 'remove_tags' => 'ints', 'add_lists' => 'ints', 'remove_lists' => 'ints', 'dry_run' => 'bool' ) + $auto,
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_tag_subscribers',
		'undo' => 'undoable',
	),
	'create-list'             => array(
		'desc' => 'Create a list: name (unique) and description.',
		'args' => array( 'name' => 'string!', 'description' => 'string' ),
		'cap'  => 'mailpoet_manage_segments',
		'run'  => 'op_create_list',
		'undo' => 'undoable',
	),
	'update-list'             => array(
		'desc' => 'Rename a list or change its description. The system lists cannot be written.',
		'args' => array( 'list_id' => 'int!', 'name' => 'string', 'description' => 'string' ) + $ver,
		'cap'  => 'mailpoet_manage_segments',
		'run'  => 'op_update_list',
		'undo' => 'undoable',
	),
	'delete-list'             => array(
		'desc' => 'Delete a list with up to 500 members (too_many_subscribers above that), its memberships and newsletter links. Undo puts the list, its links and the memberships back, never one a subscriber left since. Needs confirm:true.',
		'args' => array( 'list_id' => 'int!' ) + $ver,
		'cap'  => 'mailpoet_manage_segments',
		'run'  => 'op_delete_list',
		'confirm' => true,
		'undo' => 'undoable',
	),
	'create-tag'              => array(
		'desc' => 'Create a tag: name (unique) and description.',
		'args' => array( 'name' => 'string!', 'description' => 'string' ),
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_create_tag',
		'undo' => 'undoable',
	),
	'update-tag'              => array(
		'desc' => 'Rename a tag or change its description.',
		'args' => array( 'tag_id' => 'int!', 'name' => 'string', 'description' => 'string' ) + $ver,
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_update_tag',
		'undo' => 'undoable',
	),
	'delete-tag'              => array(
		'desc' => 'Delete a tag held by up to 500 subscribers. Needs confirm:true.',
		'args' => array( 'tag_id' => 'int!' ) + $ver,
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_delete_tag',
		'confirm' => true,
		'undo' => 'undoable',
	),
	'add-custom-field'        => array(
		'desc' => 'Add a custom field: name, type (text, textarea, date, select, radio, checkbox) and params {label, required, validate, date_type, date_format, values [{value}] for select and radio}.',
		'args' => array( 'name' => 'string!', 'type' => 'enum:text,textarea,date,select,radio,checkbox!', 'params' => 'object' ) + $ver,
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_add_custom_field',
		'undo' => 'undoable',
	),
	'update-custom-field'     => array(
		'desc' => 'Change a custom field\'s name or params; its type never changes.',
		'args' => array( 'field_id' => 'int!', 'name' => 'string', 'type' => 'string', 'params' => 'object' ) + $ver,
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_update_custom_field',
		'undo' => 'undoable',
	),
	'create-newsletter'       => array(
		'desc' => 'Create a standard newsletter draft in MailPoet\'s block email editor: subject, name (the campaign name MailPoet lists it by; defaults to the subject), preheader, sender and reply-to, list_ids, content (block markup, filtered as WordPress filters your posts).',
		'args' => array( 'subject' => 'string!', 'name' => 'string' ) + $mail,
		'cap'  => 'mailpoet_manage_emails',
		'run'  => 'op_create_newsletter',
		'undo' => 'undoable',
	),
	'update-newsletter'       => array(
		'desc' => 'Change a draft newsletter (not_a_draft otherwise): only the fields you pass. Newsletters made in MailPoet\'s legacy editor keep their body (legacy_editor).',
		'args' => array( 'newsletter_id' => 'int!', 'name' => 'string' ) + $mail + $ver,
		'cap'  => 'mailpoet_manage_emails',
		'run'  => 'op_update_newsletter',
		'undo' => 'undoable',
	),
	'duplicate-newsletter'    => array(
		'desc' => 'Copy a newsletter as a new draft.',
		'args' => array( 'newsletter_id' => 'int!' ),
		'cap'  => 'mailpoet_manage_emails',
		'run'  => 'op_duplicate_newsletter',
		'undo' => 'undoable',
	),
	'delete-newsletter'       => array(
		'desc' => 'Delete a draft newsletter. Needs confirm:true.',
		'args' => array( 'newsletter_id' => 'int!' ) + $ver,
		'cap'  => 'mailpoet_manage_emails',
		'run'  => 'op_delete_newsletter',
		'confirm' => true,
		'undo' => 'undoable',
	),
	'send-test-email'         => array(
		'desc' => 'Send a preview of a newsletter to your own email address only (any other address passed is ignored). Needs confirm:true.',
		'args' => array( 'newsletter_id' => 'int!', 'subscriber' => 'string' ),
		'cap'  => 'mailpoet_manage_emails',
		'run'  => 'op_send_test_email',
		'confirm' => true,
		'undo' => 'irreversible',
	),
	'send-newsletter'         => array(
		'desc' => 'Send a draft newsletter to its lists now, or at scheduled_at (site-local Y-m-d H:i, in the future). expected_recipients must equal get-recipient-count (recipients_mismatch otherwise, nothing queued). A send now cannot be undone; a scheduled send can be undone until 120 seconds before it. Needs confirm:true.',
		'args' => array( 'newsletter_id' => 'int!', 'expected_recipients' => 'uint!', 'scheduled_at' => 'string' ) + $ver,
		'cap'  => 'mailpoet_manage_emails',
		'run'  => 'op_send_newsletter',
		'confirm' => true,
		'undo' => 'undoable when scheduled; irreversible when sent now',
	),
	'unschedule-newsletter'   => array(
		'desc' => 'Take a scheduled newsletter back to draft. Refused once sending started (sending_started) or within 120 seconds of the send (sending_imminent: pause it instead). Cannot be undone; schedule again with send-newsletter.',
		'args' => array( 'newsletter_id' => 'int!' ),
		'cap'  => 'mailpoet_manage_emails',
		'run'  => 'op_unschedule_newsletter',
		'undo' => 'irreversible',
	),
	'pause-newsletter'        => array(
		'desc' => 'Pause a newsletter that is sending. Cannot be undone; resume it with resume-newsletter.',
		'args' => array( 'newsletter_id' => 'int!' ),
		'cap'  => 'mailpoet_manage_emails',
		'run'  => 'op_pause_newsletter',
		'undo' => 'irreversible',
	),
	'resume-newsletter'       => array(
		'desc' => 'Resume a paused newsletter. Needs confirm:true; cannot be undone.',
		'args' => array( 'newsletter_id' => 'int!' ),
		'cap'  => 'mailpoet_manage_emails',
		'run'  => 'op_resume_newsletter',
		'confirm' => true,
		'undo' => 'irreversible',
	),
	'set-automation-status'   => array(
		'desc' => 'active (with confirm:true; MailPoet checks every step, and the automation is live from the next request), deactivating (running runs finish) or draft. Activation can be undone back to draft; deactivating and draft cannot.',
		'args' => array( 'automation_id' => 'int!', 'status' => 'enum:active,deactivating,draft!' ) + $ver,
		'cap'  => 'mailpoet_manage_automations',
		'run'  => 'op_set_automation_status',
		'undo' => 'undoable when activating; irreversible otherwise',
	),
);
