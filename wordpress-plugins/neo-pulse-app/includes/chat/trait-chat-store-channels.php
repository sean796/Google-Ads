<?php
/**
 * Channel creation, access, listing, and channel read state.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Chat_Store_Trait_Channels {

	public static function ensure_default_channels( int $team_id, int $creator_user_id ): void {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_chat_channels';
		$count = (int) $wpdb->get_var(
			$wpdb->prepare( "SELECT COUNT(*) FROM {$table} WHERE team_id = %d AND archived_at IS NULL", $team_id )
		);
		if ( $count > 0 ) {
			return;
		}
		self::create_channel( $team_id, $creator_user_id, 'public', 'general', 'general', array() );
		self::create_channel( $team_id, $creator_user_id, 'public', 'random', 'random', array() );
	}

	/**
	 * @param array<int,int> $member_user_ids
	 * @return array<string,mixed>|null
	 */
	public static function create_channel(
		int $team_id,
		int $creator_user_id,
		string $type,
		string $name,
		string $slug,
		array $member_user_ids
	): ?array {
		global $wpdb;
		$channels = $wpdb->prefix . 'neo_pulse_chat_channels';
		$members  = $wpdb->prefix . 'neo_pulse_chat_channel_members';

		$wpdb->insert(
			$channels,
			array(
				'team_id'    => $team_id,
				'type'       => $type,
				'name'       => $name !== '' ? $name : null,
				'slug'       => $slug !== '' ? $slug : null,
				'created_by' => $creator_user_id,
			),
			array( '%d', '%s', '%s', '%s', '%d' )
		);
		$channel_id = (int) $wpdb->insert_id;
		if ( $channel_id <= 0 ) {
			return null;
		}

		$member_ids = array_unique( array_merge( array( $creator_user_id ), $member_user_ids ) );
		foreach ( $member_ids as $uid ) {
			$wpdb->insert(
				$members,
				array(
					'channel_id' => $channel_id,
					'user_id'      => (int) $uid,
					'role'         => (int) $uid === $creator_user_id ? 'admin' : 'member',
				),
				array( '%d', '%d', '%s' )
			);
		}

		return self::get_channel( $channel_id );
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function get_channel( int $channel_id ): ?array {
		global $wpdb;
		$row = $wpdb->get_row(
			$wpdb->prepare( 'SELECT * FROM ' . $wpdb->prefix . 'neo_pulse_chat_channels WHERE id = %d', $channel_id ),
			ARRAY_A
		);
		return is_array( $row ) ? $row : null;
	}

	public static function user_can_access_channel( int $channel_id, int $team_id, int $user_id ): bool {
		$channel = self::get_channel( $channel_id );
		if ( ! $channel || (int) $channel['team_id'] !== $team_id || ! empty( $channel['archived_at'] ) ) {
			return false;
		}
		$type = (string) $channel['type'];
		if ( $type === 'public' ) {
			return Neo_Pulse_App_Teams_Store::get_membership( $team_id, $user_id ) !== null;
		}
		global $wpdb;
		$exists = $wpdb->get_var(
			$wpdb->prepare(
				'SELECT id FROM ' . $wpdb->prefix . 'neo_pulse_chat_channel_members WHERE channel_id = %d AND user_id = %d',
				$channel_id,
				$user_id
			)
		);
		return (bool) $exists;
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function get_or_create_dm( int $team_id, int $user_id, int $other_user_id ): ?array {
		if ( $user_id === $other_user_id ) {
			return null;
		}
		if ( ! Neo_Pulse_App_Teams_Store::get_membership( $team_id, $other_user_id ) ) {
			return null;
		}

		global $wpdb;
		$channels = $wpdb->prefix . 'neo_pulse_chat_channels';
		$members  = $wpdb->prefix . 'neo_pulse_chat_channel_members';

		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT c.id FROM {$channels} c
				INNER JOIN {$members} m1 ON m1.channel_id = c.id AND m1.user_id = %d
				INNER JOIN {$members} m2 ON m2.channel_id = c.id AND m2.user_id = %d
				WHERE c.team_id = %d AND c.type = 'dm' AND c.archived_at IS NULL
				LIMIT 1",
				$user_id,
				$other_user_id,
				$team_id
			),
			ARRAY_A
		);
		if ( is_array( $rows ) && count( $rows ) > 0 ) {
			return self::get_channel( (int) $rows[0]['id'] );
		}

		return self::create_channel( $team_id, $user_id, 'dm', '', '', array( $other_user_id ) );
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_channels_for_user( int $team_id, int $user_id ): array {
		global $wpdb;
		$channels = $wpdb->prefix . 'neo_pulse_chat_channels';
		$members  = $wpdb->prefix . 'neo_pulse_chat_channel_members';

		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT c.* FROM {$channels} c
				LEFT JOIN {$members} m ON m.channel_id = c.id AND m.user_id = %d
				WHERE c.team_id = %d AND c.archived_at IS NULL
				AND (c.type = 'public' OR m.id IS NOT NULL)
				ORDER BY c.type ASC, c.name ASC",
				$user_id,
				$team_id
			),
			ARRAY_A
		);
		if ( ! is_array( $rows ) ) {
			return array();
		}

		$out = array();
		foreach ( $rows as $row ) {
			$out[] = self::format_channel_payload( $row, $user_id, $team_id );
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>
	 */
	public static function format_channel_payload( array $row, int $user_id, int $team_id ): array {
		$channel_id = (int) $row['id'];
		$type       = (string) $row['type'];
		$name       = (string) ( $row['name'] ?? '' );
		$slug       = (string) ( $row['slug'] ?? '' );
		$dm_user_id = null;
		$dm_label   = $name;

		if ( $type === 'dm' ) {
			global $wpdb;
			$other = $wpdb->get_var(
				$wpdb->prepare(
					'SELECT user_id FROM ' . $wpdb->prefix . 'neo_pulse_chat_channel_members WHERE channel_id = %d AND user_id != %d LIMIT 1',
					$channel_id,
					$user_id
				)
			);
			if ( $other ) {
				$dm_user_id = (int) $other;
				$user       = Neo_Pulse_App_Teams_Store::get_user_by_id( $dm_user_id );
				$dm_label   = $user ? (string) $user['display_name'] : 'Direct message';
			}
		}

		$last_msg           = self::get_last_message( $channel_id );
		$unread             = self::count_unread( $channel_id, $user_id );
		$thread_unread      = self::count_thread_unread( $channel_id, $user_id );
		$topic              = isset( $row['topic'] ) ? (string) $row['topic'] : '';

		return array(
			'id'                   => $channel_id,
			'teamId'               => $team_id,
			'type'                 => $type,
			'name'                 => $type === 'dm' ? $dm_label : $name,
			'slug'                 => $slug !== '' ? $slug : null,
			'topic'                => $topic !== '' ? $topic : null,
			'dmUserId'             => $dm_user_id,
			'createdBy'            => (int) $row['created_by'],
			'createdAt'            => gmdate( 'c', strtotime( (string) $row['created_at'] ) ),
			'unreadCount'          => $unread,
			'threadUnreadCount'    => $thread_unread,
			'lastMessageAt'        => $last_msg ? gmdate( 'c', strtotime( (string) $last_msg['created_at'] ) ) : null,
			'lastMessagePreview'   => $last_msg ? self::preview_plain( (string) $last_msg['body_plain'] ) : null,
		);
	}

	private static function preview_plain( string $plain ): string {
		$plain = trim( preg_replace( '/\s+/', ' ', $plain ) );
		if ( strlen( $plain ) <= 80 ) {
			return $plain;
		}
		return substr( $plain, 0, 77 ) . '...';
	}

	/**
	 * @return array<string,mixed>|null
	 */
	private static function get_last_message( int $channel_id ): ?array {
		global $wpdb;
		$row = $wpdb->get_row(
			$wpdb->prepare(
				'SELECT * FROM ' . $wpdb->prefix . 'neo_pulse_chat_messages WHERE channel_id = %d AND deleted_at IS NULL ORDER BY id DESC LIMIT 1',
				$channel_id
			),
			ARRAY_A
		);
		return is_array( $row ) ? $row : null;
	}

	public static function count_unread( int $channel_id, int $user_id ): int {
		global $wpdb;
		$read_table = $wpdb->prefix . 'neo_pulse_chat_read_state';
		$msg_table  = $wpdb->prefix . 'neo_pulse_chat_messages';
		$last_id    = (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT last_read_message_id FROM {$read_table} WHERE user_id = %d AND channel_id = %d",
				$user_id,
				$channel_id
			)
		);
		return (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$msg_table} WHERE channel_id = %d AND id > %d AND deleted_at IS NULL AND user_id != %d AND parent_message_id IS NULL",
				$channel_id,
				$last_id,
				$user_id
			)
		);
	}

	public static function mark_read( int $channel_id, int $user_id, int $message_id ): void {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_chat_read_state';
		$existing = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT id FROM {$table} WHERE user_id = %d AND channel_id = %d",
				$user_id,
				$channel_id
			)
		);
		$now = current_time( 'mysql', true );
		if ( $existing ) {
			$wpdb->query(
				$wpdb->prepare(
					"UPDATE {$table} SET last_read_message_id = GREATEST(last_read_message_id, %d), updated_at = %s WHERE user_id = %d AND channel_id = %d",
					$message_id,
					$now,
					$user_id,
					$channel_id
				)
			);
		} else {
			$wpdb->insert(
				$table,
				array(
					'user_id'               => $user_id,
					'channel_id'            => $channel_id,
					'last_read_message_id'  => $message_id,
					'updated_at'            => $now,
				),
				array( '%d', '%d', '%d', '%s' )
			);
		}
	}
}
