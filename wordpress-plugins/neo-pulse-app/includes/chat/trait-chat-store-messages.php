<?php
/**
 * Message listing, search, formatting, and creation.
 *
 * @package Neo_Pulse_App
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_App_Chat_Store_Trait_Messages {

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_messages(
		int $channel_id,
		int $after_id,
		int $before_id,
		int $limit,
		string $scope = 'channel',
		int $parent_id = 0
	): array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_chat_messages';
		$limit = max( 1, min( 100, $limit ) );
		$scope = $scope === 'thread' ? 'thread' : 'channel';

		$scope_sql = '';
		$scope_params = array();
		if ( $scope === 'channel' ) {
			$scope_sql = ' AND parent_message_id IS NULL';
		} elseif ( $parent_id > 0 ) {
			$scope_sql = ' AND (id = %d OR parent_message_id = %d)';
			$scope_params = array( $parent_id, $parent_id );
		}

		if ( $after_id > 0 ) {
			$sql = "SELECT * FROM {$table} WHERE channel_id = %d AND id > %d AND deleted_at IS NULL{$scope_sql} ORDER BY id ASC LIMIT %d";
			$params = array_merge( array( $channel_id, $after_id ), $scope_params, array( $limit ) );
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			$rows = $wpdb->get_results( $wpdb->prepare( $sql, ...$params ), ARRAY_A );
		} elseif ( $before_id > 0 ) {
			$sql = "SELECT * FROM {$table} WHERE channel_id = %d AND id < %d AND deleted_at IS NULL{$scope_sql} ORDER BY id DESC LIMIT %d";
			$params = array_merge( array( $channel_id, $before_id ), $scope_params, array( $limit ) );
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			$rows = $wpdb->get_results( $wpdb->prepare( $sql, ...$params ), ARRAY_A );
			if ( is_array( $rows ) ) {
				$rows = array_reverse( $rows );
			}
		} else {
			$sql = "SELECT * FROM {$table} WHERE channel_id = %d AND deleted_at IS NULL{$scope_sql} ORDER BY id DESC LIMIT %d";
			$params = array_merge( array( $channel_id ), $scope_params, array( $limit ) );
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			$rows = $wpdb->get_results( $wpdb->prepare( $sql, ...$params ), ARRAY_A );
			if ( is_array( $rows ) ) {
				$rows = array_reverse( $rows );
			}
		}

		if ( ! is_array( $rows ) ) {
			return array();
		}
		$message_ids = array_map(
			static function ( $row ) {
				return (int) $row['id'];
			},
			$rows
		);
		$channel     = self::get_channel( $channel_id );
		$team_id     = $channel ? (int) $channel['team_id'] : 0;
		$attachments = $team_id > 0 ? Neo_Pulse_App_Chat_Assets::get_for_messages( $message_ids, $team_id ) : array();
		$previews    = Neo_Pulse_App_Chat_Link_Unfurl::get_for_messages( $message_ids );

		$thread_stats = array();
		if ( $scope === 'channel' ) {
			$thread_stats = self::thread_stats_for_channel( $channel_id );
		}

		$out = array();
		foreach ( $rows as $row ) {
			$mid       = (int) $row['id'];
			$formatted = self::format_message_payload( $row );
			$formatted['linkPreviews'] = $previews[ $mid ] ?? array();
			$formatted['attachments']  = $attachments[ $mid ] ?? array();
			if ( $scope === 'channel' && empty( $row['parent_message_id'] ) && isset( $thread_stats[ $mid ] ) ) {
				$formatted['threadReplyCount']    = (int) $thread_stats[ $mid ]['count'];
				$formatted['threadLastReplyAt']   = $thread_stats[ $mid ]['lastAt'];
			}
			$out[] = $formatted;
		}
		return $out;
	}

	/**
	 * @return array<int,array{count:int,lastAt:string|null}>
	 */
	private static function thread_stats_for_channel( int $channel_id ): array {
		global $wpdb;
		$table = $wpdb->prefix . 'neo_pulse_chat_messages';
		$rows  = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT parent_message_id, COUNT(*) AS cnt, MAX(created_at) AS last_at
				FROM {$table}
				WHERE channel_id = %d AND parent_message_id IS NOT NULL AND deleted_at IS NULL
				GROUP BY parent_message_id",
				$channel_id
			),
			ARRAY_A
		);
		if ( ! is_array( $rows ) ) {
			return array();
		}
		$out = array();
		foreach ( $rows as $row ) {
			$root = (int) $row['parent_message_id'];
			$out[ $root ] = array(
				'count'  => (int) $row['cnt'],
				'lastAt' => ! empty( $row['last_at'] ) ? gmdate( 'c', strtotime( (string) $row['last_at'] ) ) : null,
			);
		}
		return $out;
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	public static function search_channel_messages( int $channel_id, string $q, int $limit ): array {
		global $wpdb;
		$q     = trim( $q );
		if ( $q === '' ) {
			return array();
		}
		$table = $wpdb->prefix . 'neo_pulse_chat_messages';
		$limit = max( 1, min( 50, $limit ) );
		$like  = '%' . $wpdb->esc_like( $q ) . '%';
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} WHERE channel_id = %d AND deleted_at IS NULL AND parent_message_id IS NULL AND LOWER(body_plain) LIKE LOWER(%s) ORDER BY id DESC LIMIT %d",
				$channel_id,
				$like,
				$limit
			),
			ARRAY_A
		);
		if ( ! is_array( $rows ) || count( $rows ) === 0 ) {
			return array();
		}
		$rows = array_reverse( $rows );
		$message_ids = array_map(
			static function ( $row ) {
				return (int) $row['id'];
			},
			$rows
		);
		$channel = self::get_channel( $channel_id );
		$team_id = $channel ? (int) $channel['team_id'] : 0;
		$attachments = $team_id > 0 ? Neo_Pulse_App_Chat_Assets::get_for_messages( $message_ids, $team_id ) : array();
		$previews    = Neo_Pulse_App_Chat_Link_Unfurl::get_for_messages( $message_ids );
		$thread_stats = self::thread_stats_for_channel( $channel_id );
		$out = array();
		foreach ( $rows as $row ) {
			$mid       = (int) $row['id'];
			$formatted = self::format_message_payload( $row );
			$formatted['linkPreviews'] = $previews[ $mid ] ?? array();
			$formatted['attachments']  = $attachments[ $mid ] ?? array();
			if ( isset( $thread_stats[ $mid ] ) ) {
				$formatted['threadReplyCount']   = $thread_stats[ $mid ]['count'];
				$formatted['threadLastReplyAt']  = $thread_stats[ $mid ]['lastAt'];
			}
			$out[] = $formatted;
		}
		return $out;
	}

	/**
	 * @param array<string,mixed> $row
	 * @return array<string,mixed>
	 */
	public static function format_message_payload( array $row ): array {
		$user_id = (int) $row['user_id'];
		$user    = Neo_Pulse_App_Teams_Store::get_user_by_id( $user_id );
		return array(
			'id'              => (int) $row['id'],
			'channelId'       => (int) $row['channel_id'],
			'userId'          => $user_id,
			'displayName'     => $user ? (string) $user['display_name'] : 'Unknown',
			'avatarUrl'       => $user ? $user['avatar_url'] : null,
			'bodyHtml'        => (string) $row['body_html'],
			'bodyPlain'       => (string) $row['body_plain'],
			'parentMessageId' => ! empty( $row['parent_message_id'] ) ? (int) $row['parent_message_id'] : null,
			'createdAt'       => gmdate( 'c', strtotime( (string) $row['created_at'] ) ),
			'editedAt'        => ! empty( $row['edited_at'] ) ? gmdate( 'c', strtotime( (string) $row['edited_at'] ) ) : null,
			'deletedAt'       => ! empty( $row['deleted_at'] ) ? gmdate( 'c', strtotime( (string) $row['deleted_at'] ) ) : null,
		);
	}

	public static function html_to_plain( string $html ): string {
		$plain = wp_strip_all_tags( $html );
		$plain = html_entity_decode( $plain, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
		return trim( preg_replace( '/\s+/', ' ', $plain ) );
	}

	/**
	 * @return array<string,mixed>|null
	 */
	/**
	 * @param array<int,int> $attachment_asset_ids
	 * @return array<string,mixed>|null
	 */
	public static function create_message(
		int $channel_id,
		int $user_id,
		string $body_html,
		?int $parent_message_id = null,
		array $attachment_asset_ids = array(),
		array $mentioned_user_ids = array()
	): ?array {
		global $wpdb;
		$body_html  = Neo_Pulse_App_Chat_Mentions::sanitize_chat_body_html( $body_html );
		$body_plain = self::html_to_plain( $body_html );
		if ( $body_plain === '' && count( $attachment_asset_ids ) === 0 ) {
			return null;
		}

		$data = array(
			'channel_id' => $channel_id,
			'user_id'    => $user_id,
			'body_html'  => $body_html,
			'body_plain' => $body_plain,
		);
		$formats = array( '%d', '%d', '%s', '%s' );
		if ( $parent_message_id ) {
			$data['parent_message_id'] = $parent_message_id;
			$formats[]                 = '%d';
		}

		$wpdb->insert(
			$wpdb->prefix . 'neo_pulse_chat_messages',
			$data,
			$formats
		);
		$id = (int) $wpdb->insert_id;
		if ( $id <= 0 ) {
			return null;
		}
		if ( $parent_message_id ) {
			self::mark_thread_read( $channel_id, $user_id, $parent_message_id, $id );
		} else {
			self::mark_read( $channel_id, $user_id, $id );
		}
		$row = $wpdb->get_row(
			$wpdb->prepare( 'SELECT * FROM ' . $wpdb->prefix . 'neo_pulse_chat_messages WHERE id = %d', $id ),
			ARRAY_A
		);
		if ( ! is_array( $row ) ) {
			return null;
		}
		$payload = self::format_message_payload( $row );
		self::enrich_message_payload( $payload, $channel_id, $attachment_asset_ids, $user_id, true );
		$channel = self::get_channel( $channel_id );
		if ( $channel ) {
			Neo_Pulse_App_Chat_Mentions::sync_for_message(
				$id,
				$channel_id,
				(int) $channel['team_id'],
				$user_id,
				$mentioned_user_ids,
				$parent_message_id ?: null
			);
			if ( class_exists( 'Neo_Pulse_App_Push_Events' ) ) {
				Neo_Pulse_App_Push_Events::on_message_created(
					$payload,
					$channel,
					$user_id,
					$parent_message_id ?: null
				);
			}
		}
		return $payload;
	}

	/**
	 * @param array<string,mixed>   $payload
	 * @param array<int,int>        $attachment_asset_ids
	 */
	private static function enrich_message_payload(
		array &$payload,
		int $channel_id,
		array $attachment_asset_ids,
		int $user_id,
		bool $is_new
	): void {
		$channel = self::get_channel( $channel_id );
		if ( ! $channel ) {
			return;
		}
		$team_id    = (int) $channel['team_id'];
		$message_id = (int) $payload['id'];

		if ( count( $attachment_asset_ids ) > 0 ) {
			Neo_Pulse_App_Chat_Assets::link_to_message( $team_id, $channel_id, $message_id, $user_id, $attachment_asset_ids );
		}
		if ( $is_new || ! empty( $payload['bodyHtml'] ) ) {
			Neo_Pulse_App_Chat_Link_Unfurl::process_message( $message_id, (string) $payload['bodyHtml'], $channel_id, $team_id, $user_id );
		}

		$attachments = Neo_Pulse_App_Chat_Assets::get_for_messages( array( $message_id ), $team_id );
		$previews    = Neo_Pulse_App_Chat_Link_Unfurl::get_for_messages( array( $message_id ) );
		$payload['attachments']  = $attachments[ $message_id ] ?? array();
		$payload['linkPreviews'] = $previews[ $message_id ] ?? array();
	}

	/**
	 * @return array<string,mixed>|null
	 */
	public static function get_message( int $message_id ): ?array {
		global $wpdb;
		$row = $wpdb->get_row(
			$wpdb->prepare( 'SELECT * FROM ' . $wpdb->prefix . 'neo_pulse_chat_messages WHERE id = %d', $message_id ),
			ARRAY_A
		);
		return is_array( $row ) ? $row : null;
	}
}
