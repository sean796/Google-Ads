<?php
/**
 * Cloud-fed header notifications: transient-cached fetch + per-user read state.
 *
 * Feeds the admin app-bar notifications bell (see EMCP_Tools_Admin). Fully
 * graceful offline — a down or unreachable Cloud endpoint yields an empty
 * list rather than surfacing an error to the admin UI.
 *
 * @package EMCP_Tools
 * @since   3.10.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Static helpers for fetching Cloud notifications and tracking per-user
 * read state.
 *
 * @since 3.10.0
 */
class EMCP_Tools_Notifications {

	/**
	 * Transient key for the cached notification list.
	 *
	 * @var string
	 */
	const TRANSIENT = 'emcp_tools_notifications';

	/**
	 * User meta key storing the array of notification ids a user has seen.
	 *
	 * @var string
	 */
	const META_READ = '_emcp_tools_read_notifications';

	/**
	 * Cap on how many seen ids are retained per user (oldest dropped first).
	 *
	 * @var int
	 */
	const MAX_SEEN = 200;

	/**
	 * Returns the cached notification list, fetching + caching on a miss.
	 *
	 * @since 3.10.0
	 *
	 * @return array[] Each item: id, title, body, icon, url, cta, level, created_at (all strings).
	 */
	public static function get(): array {
		return array();
	}

	/**
	 * Fetches + sanitizes the notification list from Neo EMCP. Never throws;
	 * any failure (network, non-200, malformed JSON) yields an empty array.
	 *
	 * @since 3.10.0
	 *
	 * @return array[]
	 */
	private static function fetch_remote(): array {
		if ( ! class_exists( 'EMCP_Tools_Cloud' ) ) {
			return array();
		}

		$response = wp_remote_get(
			EMCP_Tools_Cloud::base_url() . '/api/emcp/notifications',
			array( 'timeout' => 6 )
		);

		if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
			return array();
		}

		$body = json_decode( (string) wp_remote_retrieve_body( $response ), true );
		if ( ! is_array( $body ) || ! isset( $body['notifications'] ) || ! is_array( $body['notifications'] ) ) {
			return array();
		}

		$out = array();
		foreach ( $body['notifications'] as $item ) {
			if ( ! is_array( $item ) || empty( $item['id'] ) ) {
				continue;
			}
			$out[] = array(
				'id'         => sanitize_text_field( (string) $item['id'] ),
				'title'      => isset( $item['title'] ) ? sanitize_text_field( (string) $item['title'] ) : '',
				'body'       => isset( $item['body'] ) ? sanitize_text_field( (string) $item['body'] ) : '',
				'icon'       => isset( $item['icon'] ) ? sanitize_html_class( (string) $item['icon'] ) : 'megaphone',
				'url'        => isset( $item['url'] ) ? esc_url_raw( (string) $item['url'] ) : '',
				'cta'        => isset( $item['cta'] ) ? sanitize_text_field( (string) $item['cta'] ) : '',
				'level'      => isset( $item['level'] ) ? sanitize_key( (string) $item['level'] ) : 'info',
				'created_at' => isset( $item['created_at'] ) ? sanitize_text_field( (string) $item['created_at'] ) : '',
			);
		}

		return $out;
	}

	/**
	 * Count of current notifications a given user has not yet seen.
	 *
	 * @since 3.10.0
	 *
	 * @param int $user_id WordPress user id.
	 * @return int
	 */
	public static function unread_count( int $user_id ): int {
		$seen  = self::seen_ids( $user_id );
		$count = 0;
		foreach ( self::get() as $notification ) {
			if ( ! in_array( $notification['id'], $seen, true ) ) {
				++$count;
			}
		}
		return $count;
	}

	/**
	 * Marks the given notification ids as read for a user.
	 *
	 * @since 3.10.0
	 *
	 * @param int      $user_id WordPress user id.
	 * @param string[] $ids     Notification ids to mark read.
	 * @return void
	 */
	public static function mark_read( int $user_id, array $ids ): void {
		if ( $user_id <= 0 ) {
			return;
		}

		$sanitized = array();
		foreach ( $ids as $id ) {
			if ( is_scalar( $id ) && '' !== (string) $id ) {
				$sanitized[] = sanitize_text_field( (string) $id );
			}
		}
		if ( empty( $sanitized ) ) {
			return;
		}

		$seen = array_unique( array_merge( self::seen_ids( $user_id ), $sanitized ) );

		// Cap length, keeping the most recently added ids (drop from the front).
		if ( count( $seen ) > self::MAX_SEEN ) {
			$seen = array_slice( $seen, -self::MAX_SEEN );
		}

		update_user_meta( $user_id, self::META_READ, array_values( $seen ) );
	}

	/**
	 * Whether a user has already seen a given notification id.
	 *
	 * @since 3.10.0
	 *
	 * @param int    $user_id WordPress user id.
	 * @param string $id      Notification id.
	 * @return bool
	 */
	public static function is_read( int $user_id, string $id ): bool {
		return in_array( $id, self::seen_ids( $user_id ), true );
	}

	/**
	 * The raw seen-ids array for a user, always an array of strings.
	 *
	 * @since 3.10.0
	 *
	 * @param int $user_id WordPress user id.
	 * @return string[]
	 */
	private static function seen_ids( int $user_id ): array {
		if ( $user_id <= 0 ) {
			return array();
		}
		$seen = get_user_meta( $user_id, self::META_READ, true );
		return is_array( $seen ) ? array_values( array_map( 'strval', $seen ) ) : array();
	}
}
