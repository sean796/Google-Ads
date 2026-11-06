<?php
/**
 * Message edits, channel updates, and thread read state.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Chat_Store_Trait_Updates_Threads {

	/**
	 * @return array<string,mixed>|null
	 */
	/**
	 * @param array<int,int> $attachment_asset_ids
	 * @return array<string,mixed>|null
	 */
	public static function edit_message(
		int $message_id,
		int $user_id,
		string $body_html,
		array $attachment_asset_ids = array(),
		array $mentioned_user_ids = array()
	): ?array {
		global $wpdb;
		$row = self::get_message( $message_id );
		if ( ! $row || ! empty( $row['deleted_at'] ) || (int) $row['user_id'] !== $user_id ) {
			return null;
		}
		$channel_id = (int) $row['channel_id'];
		$body_html  = Neo_Pulse_App_Chat_Mentions::sanitize_chat_body_html( $body_html );
		$body_plain = self::html_to_plain( $body_html );
		if ( $body_plain === '' && count( $attachment_asset_ids ) === 0 ) {
			$existing = Neo_Pulse_App_Chat_Assets::get_for_messages( array( $message_id ), (int) ( self::get_channel( $channel_id )['team_id'] ?? 0 ) );
			if ( count( $existing[ $message_id ] ?? array() ) === 0 ) {
				return null;
			}
		}
		$now = current_time( 'mysql', true );
		$wpdb->update(
			$wpdb->prefix . 'neo_pulse_chat_messages',
			array(
				'body_html'  => $body_html,
				'body_plain' => $body_plain,
				'edited_at'  => $now,
			),
			array( 'id' => $message_id ),
			array( '%s', '%s', '%s' ),
			array( '%d' )
		);
		Neo_Pulse_App_Chat_Link_Unfurl::clear_for_message( $message_id );

		$updated_row = self::get_message( $message_id );
		if ( ! is_array( $updated_row ) ) {
			return null;
		}
		$payload = self::format_message_payload( $updated_row );
		self::enrich_message_payload( $payload, $channel_id, $attachment_asset_ids, $user_id, true );
		$channel = self::get_channel( $channel_id );
		if ( $channel ) {
			$thread_root = ! empty( $updated_row['parent_message_id'] ) ? (int) $updated_row['parent_message_id'] : null;
			Neo_Pulse_App_Chat_Mentions::sync_for_message(
				$message_id,
				$channel_id,
				(int) $channel['team_id'],
				$user_id,
				$mentioned_user_ids,
				$thread_root
			);
		}
		return $payload;
	}

	public static function delete_message( int $message_id, int $user_id, bool $is_admin ): bool {
		$row = self::get_message( $message_id );
		if ( ! $row || ! empty( $row['deleted_at'] ) ) {
			return false;
		}
		if ( (int) $row['user_id'] !== $user_id && ! $is_admin ) {
			return false;
		}
		$channel    = self::get_channel( (int) $row['channel_id'] );
		$team_id    = $channel ? (int) $channel['team_id'] : 0;
		$channel_id = (int) $row['channel_id'];
		if ( $team_id > 0 ) {
			Neo_Pulse_App_Chat_Assets::soft_delete_for_message( $team_id, $channel_id, $message_id, (int) $row['user_id'] );
			Neo_Pulse_App_Chat_Activity_Log::purge_shared_for_message( $team_id, $channel_id, $message_id, (int) $row['user_id'] );
			Neo_Pulse_App_Chat_Link_Unfurl::clear_for_message( $message_id );
			Neo_Pulse_App_Chat_Mentions::purge_for_message( $message_id );
		}
		global $wpdb;
		return (bool) $wpdb->update(
			$wpdb->prefix . 'neo_pulse_chat_messages',
			array( 'deleted_at' => current_time( 'mysql', true ) ),
			array( 'id' => $message_id ),
			array( '%s' ),
			array( '%d' )
		);
	}

	public static function unique_channel_slug( int $team_id, string $name ): string {
		global $wpdb;
		$base = sanitize_title( $name );
		if ( $base === '' ) {
			$base = 'channel';
		}
		$slug = $base;
		$i    = 2;
		$table = $wpdb->prefix . 'neo_pulse_chat_channels';
		while ( $wpdb->get_var( $wpdb->prepare( "SELECT id FROM {$table} WHERE team_id = %d AND slug = %s", $team_id, $slug ) ) ) {
			$slug = $base . '-' . $i;
			++$i;
		}
		return $slug;
	}

	/**
	 * @param array<int,int> $member_user_ids
	 */
	public static function add_channel_members( int $channel_id, array $member_user_ids ): void {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_chat_channel_members';
		foreach ( $member_user_ids as $uid ) {
			$uid = (int) $uid;
			$exists = $wpdb->get_var(
				$wpdb->prepare( "SELECT id FROM {$table} WHERE channel_id = %d AND user_id = %d", $channel_id, $uid )
			);
			if ( ! $exists ) {
				$wpdb->insert(
					$table,
					array(
						'channel_id' => $channel_id,
						'user_id'    => $uid,
						'role'       => 'member',
					),
					array( '%d', '%d', '%s' )
				);
			}
		}
	}

	public static function patch_channel( int $channel_id, array $updates ): bool {
		global $wpdb;
		$allowed = array();
		$formats = array();
		if ( isset( $updates['name'] ) ) {
			$allowed['name'] = sanitize_text_field( (string) $updates['name'] );
			$formats[]       = '%s';
		}
		if ( isset( $updates['archived'] ) && $updates['archived'] ) {
			$allowed['archived_at'] = current_time( 'mysql', true );
			$formats[]              = '%s';
		}
		if ( array_key_exists( 'topic', $updates ) ) {
			$allowed['topic'] = sanitize_text_field( (string) $updates['topic'] );
			$formats[]        = '%s';
		}
		if ( count( $allowed ) === 0 ) {
			return false;
		}
		return (bool) $wpdb->update(
			$wpdb->prefix . 'neo_pulse_chat_channels',
			$allowed,
			array( 'id' => $channel_id ),
			$formats,
			array( '%d' )
		);
	}

	public static function mark_thread_read( int $channel_id, int $user_id, int $thread_root_id, int $message_id ): void {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_chat_thread_read_state';
		$existing = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT id FROM {$table} WHERE user_id = %d AND channel_id = %d AND thread_root_id = %d",
				$user_id,
				$channel_id,
				$thread_root_id
			)
		);
		$now = current_time( 'mysql', true );
		if ( $existing ) {
			$wpdb->query(
				$wpdb->prepare(
					"UPDATE {$table} SET last_read_message_id = GREATEST(last_read_message_id, %d), updated_at = %s WHERE user_id = %d AND channel_id = %d AND thread_root_id = %d",
					$message_id,
					$now,
					$user_id,
					$channel_id,
					$thread_root_id
				)
			);
		} else {
			$wpdb->insert(
				$table,
				array(
					'user_id'              => $user_id,
					'channel_id'           => $channel_id,
					'thread_root_id'       => $thread_root_id,
					'last_read_message_id' => $message_id,
					'updated_at'           => $now,
				),
				array( '%d', '%d', '%d', '%d', '%s' )
			);
		}
	}

	public static function count_thread_unread( int $channel_id, int $user_id ): int {
		$threads = self::threads_with_unread( $channel_id, $user_id );
		$sum     = 0;
		foreach ( $threads as $t ) {
			$sum += (int) ( $t['unreadCount'] ?? 0 );
		}
		return $sum;
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function threads_with_unread( int $channel_id, int $user_id ): array {
		global $wpdb;
		$msg_table   = $wpdb->prefix . 'neo_pulse_chat_messages';
		$read_table  = $wpdb->prefix . 'neo_pulse_chat_thread_read_state';

		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT m.parent_message_id AS thread_root_id, COUNT(*) AS unread_count, MAX(m.created_at) AS last_reply_at
				FROM {$msg_table} m
				LEFT JOIN {$read_table} r ON r.thread_root_id = m.parent_message_id AND r.user_id = %d AND r.channel_id = %d
				WHERE m.channel_id = %d AND m.parent_message_id IS NOT NULL AND m.deleted_at IS NULL AND m.user_id != %d
				AND m.id > COALESCE(r.last_read_message_id, 0)
				GROUP BY m.parent_message_id",
				$user_id,
				$channel_id,
				$channel_id,
				$user_id
			),
			ARRAY_A
		);
		if ( ! is_array( $rows ) ) {
			return array();
		}
		$out = array();
		foreach ( $rows as $row ) {
			$count = (int) $row['unread_count'];
			if ( $count <= 0 ) {
				continue;
			}
			$out[] = array(
				'threadRootId'  => (int) $row['thread_root_id'],
				'unreadCount'   => $count,
				'lastReplyAt'   => ! empty( $row['last_reply_at'] ) ? gmdate( 'c', strtotime( (string) $row['last_reply_at'] ) ) : null,
			);
		}
		return $out;
	}

	public static function thread_unread_map( int $channel_id, int $user_id ): array {
		$map = array();
		foreach ( self::threads_with_unread( $channel_id, $user_id ) as $t ) {
			$map[ (int) $t['threadRootId'] ] = (int) $t['unreadCount'];
		}
		return $map;
	}

	public static function activity_thread_root( int $message_id ): ?int {
		$row = self::get_message( $message_id );
		if ( ! $row || empty( $row['parent_message_id'] ) ) {
			return null;
		}
		return (int) $row['parent_message_id'];
	}

	public static function enrich_messages_thread_unread( array $messages, int $channel_id, int $user_id ): array {
		$map = self::thread_unread_map( $channel_id, $user_id );
		foreach ( $messages as &$msg ) {
			$root = (int) ( $msg['id'] ?? 0 );
			if ( isset( $map[ $root ] ) ) {
				$msg['threadUnreadCount'] = $map[ $root ];
			}
		}
		unset( $msg );
		return $messages;
	}
}
