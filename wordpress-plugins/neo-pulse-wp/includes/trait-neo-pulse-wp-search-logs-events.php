<?php
/**
 * Search log event recording and retrieval.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

trait Neo_Pulse_Wp_Search_Logs_Trait_Events {

	/**
	 * @param array<string, mixed> $data Row data.
	 * @return array{ok: bool, event_uid?: string, id?: int, error?: string}
	 */
	public static function insert( array $data ) {
		if ( ! self::is_logging_active() && ! self::is_import_context() ) {
			return array( 'ok' => false, 'error' => 'logging_disabled' );
		}

		$session_id = isset( $data['session_id'] ) ? sanitize_text_field( (string) $data['session_id'] ) : '';
		if ( ! self::is_valid_session_id( $session_id ) ) {
			return array( 'ok' => false, 'error' => 'invalid_session' );
		}

		$query = isset( $data['query'] ) ? sanitize_text_field( (string) $data['query'] ) : '';
		if ( class_exists( 'Neo_Pulse_Wp_Search' ) ) {
			$query = Neo_Pulse_Wp_Search::clamp_query( $query );
		}
		if ( trim( $query ) === '' ) {
			return array( 'ok' => false, 'error' => 'empty_query' );
		}

		$event_uid = isset( $data['event_uid'] ) ? sanitize_text_field( (string) $data['event_uid'] ) : '';
		if ( $event_uid === '' || ! self::is_valid_uuid( $event_uid ) ) {
			$event_uid = self::new_uuid();
		}

		$page_url = isset( $data['page_url'] ) ? esc_url_raw( (string) $data['page_url'] ) : '';
		if ( strlen( $page_url ) > 512 ) {
			$page_url = substr( $page_url, 0, 512 );
		}

		$result_count = isset( $data['result_count'] ) ? max( 0, (int) $data['result_count'] ) : 0;
		$intent       = isset( $data['intent'] ) ? sanitize_key( (string) $data['intent'] ) : '';
		$sentiment    = isset( $data['sentiment'] ) ? sanitize_key( (string) $data['sentiment'] ) : '';

		$results_json = '';
		if ( isset( $data['results'] ) && is_array( $data['results'] ) ) {
			$snapshot = array();
			foreach ( array_slice( $data['results'], 0, 10 ) as $row ) {
				if ( ! is_array( $row ) ) {
					continue;
				}
				$snapshot[] = array(
					'title' => isset( $row['title'] ) ? sanitize_text_field( (string) $row['title'] ) : '',
					'url'   => isset( $row['url'] ) ? esc_url_raw( (string) $row['url'] ) : '',
				);
			}
			$results_json = wp_json_encode( $snapshot );
		}

		global $wpdb;
		$table = self::table_name();
		$now   = current_time( 'mysql', true );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$inserted = $wpdb->insert(
			$table,
			array(
				'event_uid'        => $event_uid,
				'session_id'       => $session_id,
				'page_url'         => $page_url !== '' ? $page_url : null,
				'query'            => $query,
				'query_normalized' => self::normalize_query( $query ),
				'result_count'     => $result_count,
				'intent'           => $intent !== '' ? $intent : null,
				'sentiment'        => $sentiment !== '' ? $sentiment : null,
				'results_json'     => $results_json !== '' ? $results_json : null,
				'created_at'       => $now,
			),
			array( '%s', '%s', '%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s' )
		);

		if ( false === $inserted ) {
			return array( 'ok' => false, 'error' => __( 'Could not save search log.', 'neo-pulse-wp' ) );
		}

		self::maybe_prune_retention();

		return array(
			'ok'        => true,
			'id'        => (int) $wpdb->insert_id,
			'event_uid' => $event_uid,
		);
	}

	/**
	 * @param array<string, mixed> $data Accept data.
	 * @return array{ok: bool, error?: string}
	 */
	public static function record_accept( array $data ) {
		if ( ! self::is_logging_active() ) {
			return array( 'ok' => false, 'error' => 'logging_disabled' );
		}

		$event_uid = isset( $data['event_uid'] ) ? sanitize_text_field( (string) $data['event_uid'] ) : '';
		if ( ! self::is_valid_uuid( $event_uid ) ) {
			return array( 'ok' => false, 'error' => 'invalid_event' );
		}

		$url = isset( $data['url'] ) ? esc_url_raw( (string) $data['url'] ) : '';
		if ( $url === '' ) {
			return array( 'ok' => false, 'error' => 'empty_url' );
		}
		if ( strlen( $url ) > 512 ) {
			$url = substr( $url, 0, 512 );
		}

		$title = isset( $data['title'] ) ? sanitize_text_field( (string) $data['title'] ) : '';
		if ( strlen( $title ) > 255 ) {
			$title = substr( $title, 0, 255 );
		}

		$rank = isset( $data['rank'] ) ? max( 1, (int) $data['rank'] ) : null;

		global $wpdb;
		$table = self::table_name();
		$now   = current_time( 'mysql', true );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$updated = $wpdb->update(
			$table,
			array(
				'accepted_url'   => $url,
				'accepted_title' => $title !== '' ? $title : null,
				'accepted_rank'  => $rank,
				'accepted_at'    => $now,
			),
			array( 'event_uid' => $event_uid ),
			array( '%s', '%s', '%d', '%s' ),
			array( '%s' )
		);

		if ( false === $updated ) {
			return array( 'ok' => false, 'error' => __( 'Could not update search log.', 'neo-pulse-wp' ) );
		}

		return array( 'ok' => true );
	}

	/**
	 * @param array<string, mixed> $args Query args.
	 * @return array{items: array<int, object>, total: int}
	 */
	public static function query( array $args = array() ): array {
		global $wpdb;

		$table  = self::table_name();
		$where  = array( '1=1' );
		$params = array();

		$session = isset( $args['session_id'] ) ? sanitize_text_field( (string) $args['session_id'] ) : '';
		if ( $session !== '' ) {
			$where[]  = 'session_id LIKE %s';
			$params[] = '%' . $wpdb->esc_like( $session ) . '%';
		}

		$date_from = isset( $args['date_from'] ) ? sanitize_text_field( (string) $args['date_from'] ) : '';
		if ( $date_from !== '' && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_from ) ) {
			$where[]  = 'created_at >= %s';
			$params[] = $date_from . ' 00:00:00';
		}

		$date_to = isset( $args['date_to'] ) ? sanitize_text_field( (string) $args['date_to'] ) : '';
		if ( $date_to !== '' && preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_to ) ) {
			$where[]  = 'created_at <= %s';
			$params[] = $date_to . ' 23:59:59';
		}

		$search = isset( $args['search'] ) ? sanitize_text_field( (string) $args['search'] ) : '';
		if ( $search !== '' ) {
			$like     = '%' . $wpdb->esc_like( $search ) . '%';
			$where[]  = '(query LIKE %s OR accepted_url LIKE %s OR session_id LIKE %s)';
			$params[] = $like;
			$params[] = $like;
			$params[] = $like;
		}

		if ( ! empty( $args['accepted_only'] ) ) {
			$where[] = 'accepted_url IS NOT NULL AND accepted_url != %s';
			$params[] = '';
		}

		$where_sql = implode( ' AND ', $where );

		$count_sql = "SELECT COUNT(*) FROM {$table} WHERE {$where_sql}";
		if ( ! empty( $params ) ) {
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			$total = (int) $wpdb->get_var( $wpdb->prepare( $count_sql, $params ) );
		} else {
			// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
			$total = (int) $wpdb->get_var( $count_sql );
		}

		$orderby = isset( $args['orderby'] ) ? sanitize_key( (string) $args['orderby'] ) : 'created_at';
		$allowed = array(
			'query'        => 'query',
			'result_count' => 'result_count',
			'intent'       => 'intent',
			'created_at'   => 'created_at',
		);
		$order_col = isset( $allowed[ $orderby ] ) ? $allowed[ $orderby ] : 'created_at';
		$order     = isset( $args['order'] ) && 'asc' === strtolower( (string) $args['order'] ) ? 'ASC' : 'DESC';

		$per_page = isset( $args['per_page'] ) ? max( 1, min( 200, (int) $args['per_page'] ) ) : 20;
		$page     = isset( $args['page'] ) ? max( 1, (int) $args['page'] ) : 1;
		$offset   = ( $page - 1 ) * $per_page;

		$list_sql    = "SELECT * FROM {$table} WHERE {$where_sql} ORDER BY {$order_col} {$order} LIMIT %d OFFSET %d";
		$list_params = array_merge( $params, array( $per_page, $offset ) );

		// phpcs:ignore WordPress.DB.PreparedSQL.NotPrepared
		$items = $wpdb->get_results( $wpdb->prepare( $list_sql, $list_params ) );

		return array(
			'items' => is_array( $items ) ? $items : array(),
			'total' => $total,
		);
	}

	/**
	 * @param array<string, mixed> $args Query args.
	 * @return array<int, object>
	 */
	public static function query_for_export( array $args = array() ): array {
		$args['per_page'] = isset( $args['per_page'] ) ? (int) $args['per_page'] : 50000;
		$args['page']     = 1;
		$result           = self::query( $args );
		return $result['items'];
	}

	public static function count_events(): int {
		global $wpdb;
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
	}

	public static function delete_event( int $id ): bool {
		global $wpdb;
		if ( $id < 1 ) {
			return false;
		}
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		return (bool) $wpdb->delete( $table, array( 'id' => $id ), array( '%d' ) );
	}

	public static function delete_all_events(): int {
		global $wpdb;
		$table = self::table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return (int) $wpdb->query( "TRUNCATE TABLE {$table}" );
	}
}
