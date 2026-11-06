<?php
/**
 * Team chat DB schema and data access.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_app_chat_store_dir = __DIR__ . '/';
require_once $neo_pulse_app_chat_store_dir . 'trait-chat-store-channels.php';
require_once $neo_pulse_app_chat_store_dir . 'trait-chat-store-messages.php';
require_once $neo_pulse_app_chat_store_dir . 'trait-chat-store-updates-threads.php';

class Neo_Pulse_App_Chat_Store {

	use Neo_Pulse_App_Chat_Store_Trait_Channels;
	use Neo_Pulse_App_Chat_Store_Trait_Messages;
	use Neo_Pulse_App_Chat_Store_Trait_Updates_Threads;

	public static function install_tables(): void {
		global $wpdb;
		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset  = $wpdb->get_charset_collate();
		$channels = $wpdb->prefix . 'neo_pulse_chat_channels';
		$members  = $wpdb->prefix . 'neo_pulse_chat_channel_members';
		$messages = $wpdb->prefix . 'neo_pulse_chat_messages';
		$read     = $wpdb->prefix . 'neo_pulse_chat_read_state';

		dbDelta(
			"CREATE TABLE {$channels} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				team_id bigint(20) unsigned NOT NULL,
				type varchar(16) NOT NULL DEFAULT 'public',
				name varchar(255) DEFAULT NULL,
				slug varchar(255) DEFAULT NULL,
				created_by bigint(20) unsigned NOT NULL,
				created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				archived_at datetime DEFAULT NULL,
				topic text DEFAULT NULL,
				PRIMARY KEY (id),
				KEY team_id (team_id),
				KEY team_slug (team_id, slug)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$members} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				channel_id bigint(20) unsigned NOT NULL,
				user_id bigint(20) unsigned NOT NULL,
				role varchar(16) NOT NULL DEFAULT 'member',
				joined_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				UNIQUE KEY channel_user (channel_id, user_id),
				KEY user_id (user_id)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$messages} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				channel_id bigint(20) unsigned NOT NULL,
				user_id bigint(20) unsigned NOT NULL,
				body_html longtext NOT NULL,
				body_plain longtext NOT NULL,
				parent_message_id bigint(20) unsigned DEFAULT NULL,
				created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				edited_at datetime DEFAULT NULL,
				deleted_at datetime DEFAULT NULL,
				PRIMARY KEY (id),
				KEY channel_created (channel_id, created_at),
				KEY channel_id (channel_id)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$read} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				user_id bigint(20) unsigned NOT NULL,
				channel_id bigint(20) unsigned NOT NULL,
				last_read_message_id bigint(20) unsigned NOT NULL DEFAULT 0,
				updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				UNIQUE KEY user_channel (user_id, channel_id)
			) {$charset};"
		);

		$assets = $wpdb->prefix . 'neo_pulse_chat_assets';
		$previews = $wpdb->prefix . 'neo_pulse_chat_link_previews';
		$activity = $wpdb->prefix . 'neo_pulse_chat_activity_log';

		dbDelta(
			"CREATE TABLE {$assets} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				team_id bigint(20) unsigned NOT NULL,
				channel_id bigint(20) unsigned NOT NULL,
				message_id bigint(20) unsigned NOT NULL DEFAULT 0,
				user_id bigint(20) unsigned NOT NULL,
				file_name varchar(255) NOT NULL,
				mime varchar(128) NOT NULL,
				bytes bigint(20) unsigned NOT NULL DEFAULT 0,
				storage_path varchar(512) NOT NULL,
				created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				deleted_at datetime DEFAULT NULL,
				PRIMARY KEY (id),
				KEY team_channel (team_id, channel_id),
				KEY message_id (message_id)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$previews} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				message_id bigint(20) unsigned NOT NULL,
				url varchar(2048) NOT NULL,
				title varchar(512) DEFAULT NULL,
				description text DEFAULT NULL,
				image_url varchar(2048) DEFAULT NULL,
				site_name varchar(255) DEFAULT NULL,
				fetched_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				KEY message_id (message_id)
			) {$charset};"
		);

		dbDelta(
			"CREATE TABLE {$activity} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				team_id bigint(20) unsigned NOT NULL,
				channel_id bigint(20) unsigned NOT NULL,
				payload_json text NOT NULL,
				created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				KEY team_channel_created (team_id, channel_id, created_at)
			) {$charset};"
		);

		$thread_read = $wpdb->prefix . 'neo_pulse_chat_thread_read_state';
		dbDelta(
			"CREATE TABLE {$thread_read} (
				id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
				user_id bigint(20) unsigned NOT NULL,
				channel_id bigint(20) unsigned NOT NULL,
				thread_root_id bigint(20) unsigned NOT NULL,
				last_read_message_id bigint(20) unsigned NOT NULL DEFAULT 0,
				updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
				PRIMARY KEY (id),
				UNIQUE KEY user_channel_thread (user_id, channel_id, thread_root_id)
			) {$charset};"
		);

		Neo_Pulse_App_Chat_Typing::install_table();
		Neo_Pulse_App_Chat_Calls::install_tables();
		Neo_Pulse_App_Chat_Mentions::install_tables();
		Neo_Pulse_App_Chat_Preferences::install_tables();
	}
}
