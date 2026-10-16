<?php
/**
 * Snapshot & Undo History Store for Neo Pulse MCP writes.
 *
 * Stores before-states in a non-autoloaded option (`neo_pulse_wp_mcp_history`),
 * capped at the last 50 writes or 30 days, never in web-readable uploads.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

final class Neo_Pulse_Wp_Mcp_History {

	const OPTION   = 'neo_pulse_wp_mcp_history';
	const MAX_ROWS = 50;
	const MAX_AGE  = 30 * DAY_IN_SECONDS;

	/**
	 * Record a before-state snapshot prior to a write operation.
	 *
	 * @param string              $operation Operation name.
	 * @param string              $summary   Human-readable summary of what changed.
	 * @param array<string,mixed> $snapshot  Before-state payload needed to undo.
	 * @return string History entry ID.
	 */
	public static function record( string $operation, string $summary, array $snapshot ): string {
		$rows = self::raw_rows();
		$now  = time();
		$id   = 'np_mcp_' . gmdate( 'Ymd_His', $now ) . '_' . substr( md5( uniqid( '', true ) ), 0, 8 );
		$user = function_exists( 'wp_get_current_user' ) ? wp_get_current_user() : null;

		$entry = array(
			'id'         => $id,
			'timestamp'  => $now,
			'date'       => gmdate( 'c', $now ),
			'user_id'    => $user instanceof WP_User ? (int) $user->ID : get_current_user_id(),
			'user_login' => $user instanceof WP_User ? (string) $user->user_login : '',
			'operation'  => $operation,
			'summary'    => $summary,
			'undone'     => false,
			'snapshot'   => $snapshot,
		);

		array_unshift( $rows, $entry );
		$rows = self::prune( $rows, $now );
		update_option( self::OPTION, $rows, false );
		return $id;
	}

	/**
	 * Public list of history entries (without raw snapshot payloads unless requested).
	 *
	 * @param int $limit Max entries to return.
	 * @return array<int,array<string,mixed>>
	 */
	public static function list_entries( int $limit = 50 ): array {
		$rows  = self::raw_rows();
		$limit = max( 1, min( self::MAX_ROWS, $limit ) );
		$out   = array();
		foreach ( array_slice( $rows, 0, $limit ) as $row ) {
			$out[] = array(
				'id'         => (string) ( $row['id'] ?? '' ),
				'timestamp'  => (int) ( $row['timestamp'] ?? 0 ),
				'date'       => (string) ( $row['date'] ?? '' ),
				'user_id'    => (int) ( $row['user_id'] ?? 0 ),
				'user_login' => (string) ( $row['user_login'] ?? '' ),
				'operation'  => (string) ( $row['operation'] ?? '' ),
				'summary'    => (string) ( $row['summary'] ?? '' ),
				'undone'     => ! empty( $row['undone'] ),
			);
		}
		return $out;
	}

	/**
	 * Find a single history entry by ID (including its snapshot).
	 *
	 * @return array<string,mixed>|null
	 */
	public static function get( string $id ): ?array {
		foreach ( self::raw_rows() as $row ) {
			if ( isset( $row['id'] ) && (string) $row['id'] === $id ) {
				return $row;
			}
		}
		return null;
	}

	/**
	 * Mark a history entry as undone.
	 */
	public static function mark_undone( string $id ): void {
		$rows = self::raw_rows();
		foreach ( $rows as $i => $row ) {
			if ( isset( $row['id'] ) && (string) $row['id'] === $id ) {
				$rows[ $i ]['undone']    = true;
				$rows[ $i ]['undone_at'] = time();
				update_option( self::OPTION, $rows, false );
				return;
			}
		}
	}

	/**
	 * @return array<int,array<string,mixed>>
	 */
	private static function raw_rows(): array {
		$raw = get_option( self::OPTION, array() );
		return is_array( $raw ) ? array_values( array_filter( $raw, 'is_array' ) ) : array();
	}

	/**
	 * @param array<int,array<string,mixed>> $rows
	 * @return array<int,array<string,mixed>>
	 */
	private static function prune( array $rows, int $now ): array {
		$cutoff = $now - self::MAX_AGE;
		$kept   = array();
		foreach ( $rows as $row ) {
			$ts = (int) ( $row['timestamp'] ?? 0 );
			if ( $ts > 0 && $ts < $cutoff ) {
				continue;
			}
			$kept[] = $row;
			if ( count( $kept ) >= self::MAX_ROWS ) {
				break;
			}
		}
		return $kept;
	}
}
