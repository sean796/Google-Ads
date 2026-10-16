<?php
/**
 * mailpoet-read operations. Row keys: desc, args (EMCP_Tools_Op_Args schema), cap (MailPoet's
 * capability for the domain, D4), run (handler method).
 *
 * @package EMCP_Tools
 * @since   3.19.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

$page = array( 'page' => 'int', 'per_page' => 'int' );

return array(
	'get-setup'           => array(
		'desc' => 'MailPoet version and whether EMCP supports it, double opt-in, the sending method\'s name (never its credentials), sender and reply-to, the subscriber limit, the system lists, the active automations and their triggers, and the write operations you may run. Subscriber counts only for users who may manage subscribers.',
		'args' => array(),
		'cap'  => 'mailpoet_access_plugin_admin',
		'run'  => 'op_get_setup',
	),
	'list-subscribers'    => array(
		'desc' => 'Subscribers: filter by search (email or name), status, list_id, tag_id, created_after and created_before (Y-m-d H:i:s, UTC); sort_by id, email, created_at, first_name or last_name; sort_order asc or desc; page and per_page (up to 100). Each carries its version.',
		'args' => array( 'search' => 'string', 'status' => 'enum:subscribed,unconfirmed,unsubscribed,bounced,inactive', 'list_id' => 'int', 'tag_id' => 'int', 'created_after' => 'string', 'created_before' => 'string', 'sort_by' => 'enum:id,email,created_at,first_name,last_name', 'sort_order' => 'enum:asc,desc' ) + $page,
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_list_subscribers',
	),
	'get-subscriber'      => array(
		'desc' => 'One subscriber by subscriber_id or email (any case): profile, status, custom fields (cf_{id}: name, type, value), lists with the membership status, tags, how many emails MailPoet sent them and automation runs they are in, whether they are linked to a WordPress user, and the version writes need.',
		'args' => array( 'subscriber_id' => 'int', 'email' => 'string' ),
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_get_subscriber',
	),
	'list-lists'          => array(
		'desc' => 'Every list with its type (default, or the system lists wp_users and woocommerce_users, which cannot be written), member counts by status, and its version.',
		'args' => array(),
		'cap'  => 'mailpoet_manage_segments',
		'run'  => 'op_list_lists',
	),
	'list-tags'           => array(
		'desc' => 'Every tag with the number of subscribers holding it and its version.',
		'args' => array(),
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_list_tags',
	),
	'list-custom-fields'  => array(
		'desc' => 'Custom field definitions (cf_{id}, name, type, params) with the one version their writes need.',
		'args' => array(),
		'cap'  => 'mailpoet_manage_subscribers',
		'run'  => 'op_list_custom_fields',
	),
	'list-newsletters'    => array(
		'desc' => 'Newsletters: filter by type (standard, welcome, notification, automation, re_engagement), status (draft, scheduled, sending, sent, active) and search in the subject; page and per_page. Each carries its version.',
		'args' => array( 'type' => 'enum:standard,welcome,notification,notification_history,automation,re_engagement', 'status' => 'enum:draft,scheduled,sending,sent,active', 'search' => 'string' ) + $page,
		'cap'  => 'mailpoet_manage_emails',
		'run'  => 'op_list_newsletters',
	),
	'get-newsletter'      => array(
		'desc' => 'One newsletter: subject, preheader, sender, reply-to, lists, status, schedule (site-local time), editor (block or legacy), body (block markup, or the legacy block tree as text), sending status and statistics (sent, opens, clicks, unsubscribes), and its version.',
		'args' => array( 'newsletter_id' => 'int!' ),
		'cap'  => 'mailpoet_manage_emails',
		'run'  => 'op_get_newsletter',
	),
	'get-recipient-count' => array(
		'desc' => 'The live number of recipients a send would reach (globally subscribed, untrashed members subscribed to at least one of the lists, each once): pass newsletter_id or list_ids. send-newsletter needs this number as expected_recipients.',
		'args' => array( 'newsletter_id' => 'int', 'list_ids' => 'ints' ),
		'cap'  => 'mailpoet_manage_emails',
		'run'  => 'op_get_recipient_count',
	),
	'list-automations'    => array(
		'desc' => 'Automations with their status (active, deactivating, draft), triggers, run counts and version.',
		'args' => array( 'status' => 'enum:active,deactivating,draft' ),
		'cap'  => 'mailpoet_manage_automations',
		'run'  => 'op_list_automations',
	),
	'get-automation'      => array(
		'desc' => 'One automation: status, triggers, steps (read only), run counts by status and its version.',
		'args' => array( 'automation_id' => 'int!' ),
		'cap'  => 'mailpoet_manage_automations',
		'run'  => 'op_get_automation',
	),
	'list-forms'          => array(
		'desc' => 'Subscription forms (read only): name, status and the lists they subscribe to.',
		'args' => array(),
		'cap'  => 'mailpoet_manage_forms',
		'run'  => 'op_list_forms',
	),
);
