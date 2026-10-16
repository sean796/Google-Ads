<?php
/**
 * Flow Assist chat message log storage (demo + frontend).
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Chat_Logs {

	const TABLE_VERSION       = '1.2';
	const REPORTS_VERSION     = '1.0';
	const OPTION_KEY          = 'neo_pulse_wp_chat_logs_settings';
	const DB_VERSION_OPTION   = 'neo_pulse_wp_chat_logs_db_version';
	const SESSION_ID_PATTERN  = '/^csess_[0-9]+_[a-z0-9]{6}$/';

	/**
	 * @return string
	 */
	public static function messages_table_name(): string {
		global $wpdb;
		return $wpdb->prefix . 'neo_pulse_wp_chat_messages';
	}

	/**
	 * @return string
	 */
	public static function reports_table_name(): string {
		global $wpdb;
		return $wpdb->prefix . 'neo_pulse_wp_chat_log_reports';
	}

	public static function init(): void {
		add_action( 'plugins_loaded', array( __CLASS__, 'maybe_install' ), 20 );
	}

	public static function maybe_install(): void {
		if ( get_option( self::DB_VERSION_OPTION, '' ) !== self::TABLE_VERSION ) {
			self::install();
		}
	}

	public static function install(): void {
		global $wpdb;

		require_once ABSPATH . 'wp-admin/includes/upgrade.php';

		$charset = $wpdb->get_charset_collate();
		$msgs    = self::messages_table_name();
		$reports = self::reports_table_name();

		$sql_msgs = "CREATE TABLE {$msgs} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			message_uid varchar(36) NOT NULL,
			session_id varchar(64) NOT NULL,
			source varchar(20) NOT NULL DEFAULT 'frontend',
			role varchar(20) NOT NULL DEFAULT 'user',
			content longtext NOT NULL,
			card_type varchar(32) DEFAULT NULL,
			confidence varchar(20) DEFAULT NULL,
			page_url varchar(512) DEFAULT NULL,
			accepted_url varchar(512) DEFAULT NULL,
			accepted_label varchar(255) DEFAULT NULL,
			accepted_type varchar(20) DEFAULT NULL,
			accepted_at datetime DEFAULT NULL,
			input_origin varchar(20) DEFAULT NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY message_uid (message_uid),
			KEY session_id (session_id),
			KEY source (source),
			KEY created_at (created_at)
		) {$charset};";

		$sql_reports = "CREATE TABLE {$reports} (
			id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
			report_uid varchar(36) NOT NULL,
			date_from date NOT NULL,
			date_to date NOT NULL,
			source_filter varchar(20) NOT NULL DEFAULT 'all',
			session_count int(11) unsigned NOT NULL DEFAULT 0,
			message_count int(11) unsigned NOT NULL DEFAULT 0,
			model varchar(80) NOT NULL DEFAULT '',
			body longtext NOT NULL,
			created_at datetime NOT NULL,
			PRIMARY KEY  (id),
			UNIQUE KEY report_uid (report_uid),
			KEY created_at (created_at)
		) {$charset};";

		dbDelta( $sql_msgs );
		dbDelta( $sql_reports );
		update_option( self::DB_VERSION_OPTION, self::TABLE_VERSION, false );

		if ( get_option( self::OPTION_KEY, null ) === null ) {
			add_option(
				self::OPTION_KEY,
				array(
					'logging_enabled' => true,
					'retention_days'  => 90,
				),
				'',
				false
			);
		}
	}

	/**
	 * @return array{logging_enabled: bool, retention_days: int}
	 */
	public static function get_settings(): array {
		$raw = get_option( self::OPTION_KEY, array() );
		if ( ! is_array( $raw ) ) {
			$raw = array();
		}
		$days = isset( $raw['retention_days'] ) ? (int) $raw['retention_days'] : 90;
		if ( $days < 1 ) {
			$days = 90;
		}
		if ( $days > 3650 ) {
			$days = 3650;
		}
		return array(
			'logging_enabled' => ! array_key_exists( 'logging_enabled', $raw ) || ! empty( $raw['logging_enabled'] ),
			'retention_days'  => $days,
		);
	}

	/**
	 * @param array<string, mixed> $settings Settings.
	 */
	public static function save_settings( array $settings ): void {
		$days = isset( $settings['retention_days'] ) ? (int) $settings['retention_days'] : 90;
		if ( $days < 1 ) {
			$days = 90;
		}
		if ( $days > 3650 ) {
			$days = 3650;
		}
		update_option(
			self::OPTION_KEY,
			array(
				'logging_enabled' => ! empty( $settings['logging_enabled'] ),
				'retention_days'  => $days,
			),
			false
		);
	}

	public static function is_logging_active(): bool {
		$settings = self::get_settings();
		return ! empty( $settings['logging_enabled'] );
	}

	/**
	 * @param string $source frontend|demo.
	 */
	public static function should_log_source( string $source ): bool {
		if ( ! self::is_logging_active() ) {
			return false;
		}
		if ( $source === 'demo' ) {
			return true;
		}
		return Neo_Pulse_Wp_Chat::is_enabled();
	}

	/**
	 * @param string $session_id Session id from client.
	 */
	public static function is_valid_session_id( string $session_id ): bool {
		return (bool) preg_match( self::SESSION_ID_PATTERN, $session_id );
	}

	/**
	 * @param string $source frontend|demo.
	 */
	public static function is_valid_source( string $source ): bool {
		return in_array( $source, array( 'frontend', 'demo' ), true );
	}

	/**
	 * @param string $origin typed|starter|topic_chip|template.
	 */
	public static function is_valid_input_origin( string $origin ): bool {
		return in_array( $origin, array( 'typed', 'starter', 'topic_chip', 'template' ), true );
	}

	/**
	 * @param string $origin Raw origin from client or heuristics.
	 */
	public static function sanitize_input_origin( string $origin ): string {
		$origin = sanitize_key( $origin );
		return self::is_valid_input_origin( $origin ) ? $origin : 'typed';
	}

	/**
	 * @param array<string, mixed> $data Row data.
	 * @return array{ok: bool, id?: int, error?: string}
	 */
	public static function insert( array $data ) {
		$source = isset( $data['source'] ) ? sanitize_key( (string) $data['source'] ) : 'frontend';
		if ( ! self::is_valid_source( $source ) ) {
			$source = 'frontend';
		}
		if ( ! self::should_log_source( $source ) && ! self::is_import_context() ) {
			return array( 'ok' => false, 'error' => 'logging_disabled' );
		}

		$session_id = isset( $data['session_id'] ) ? sanitize_text_field( (string) $data['session_id'] ) : '';
		if ( ! self::is_valid_session_id( $session_id ) ) {
			return array( 'ok' => false, 'error' => 'invalid_session' );
		}

		$role = isset( $data['role'] ) ? sanitize_key( (string) $data['role'] ) : 'user';
		if ( ! in_array( $role, array( 'user', 'assistant' ), true ) ) {
			$role = 'user';
		}

		$content = isset( $data['content'] ) ? sanitize_textarea_field( (string) $data['content'] ) : '';
		if ( trim( $content ) === '' ) {
			return array( 'ok' => false, 'error' => 'empty_content' );
		}

		$message_uid = isset( $data['message_uid'] ) ? sanitize_text_field( (string) $data['message_uid'] ) : '';
		if ( $message_uid === '' || ! self::is_valid_uuid( $message_uid ) ) {
			$message_uid = self::new_uuid();
		}

		$card_type   = isset( $data['card_type'] ) ? sanitize_key( (string) $data['card_type'] ) : '';
		$confidence  = isset( $data['confidence'] ) ? sanitize_key( (string) $data['confidence'] ) : '';
		$page_url    = isset( $data['page_url'] ) ? esc_url_raw( (string) $data['page_url'] ) : '';
		if ( strlen( $page_url ) > 512 ) {
			$page_url = substr( $page_url, 0, 512 );
		}

		$input_origin = '';
		if ( $role === 'user' && isset( $data['input_origin'] ) ) {
			$raw_origin = sanitize_key( (string) $data['input_origin'] );
			if ( self::is_valid_input_origin( $raw_origin ) ) {
				$input_origin = $raw_origin;
			}
		}

		global $wpdb;
		$table = self::messages_table_name();
		$now   = current_time( 'mysql', true );
		if ( isset( $data['created_at'] ) && is_string( $data['created_at'] ) && preg_match( '/^\d{4}-\d{2}-\d{2}/', $data['created_at'] ) ) {
			$now = sanitize_text_field( $data['created_at'] );
		}

		$existing = $wpdb->get_var(
			$wpdb->prepare(
				"SELECT id FROM {$table} WHERE message_uid = %s",
				$message_uid
			)
		);
		if ( $existing ) {
			return array( 'ok' => true, 'id' => (int) $existing, 'message_uid' => $message_uid );
		}

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$inserted = $wpdb->insert(
			$table,
			array(
				'message_uid' => $message_uid,
				'session_id'  => $session_id,
				'source'      => $source,
				'role'        => $role,
				'content'     => $content,
				'card_type'   => $card_type !== '' ? $card_type : null,
				'confidence'  => $confidence !== '' ? $confidence : null,
				'page_url'     => $page_url !== '' ? $page_url : null,
				'input_origin' => $input_origin !== '' ? $input_origin : null,
				'created_at'   => $now,
			),
			array( '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s' )
		);

		if ( false === $inserted ) {
			return array( 'ok' => false, 'error' => __( 'Could not save chat log.', 'neo-pulse-wp' ) );
		}

		self::maybe_prune_retention();

		return array(
			'ok'          => true,
			'id'          => (int) $wpdb->insert_id,
			'message_uid' => $message_uid,
		);
	}

	/**
	 * Log user message from chat request body.
	 *
	 * @param array<string, mixed> $meta session_id, source, page_url.
	 */
	public static function log_user_message( string $message, array $meta ): void {
		if ( trim( $message ) === '' ) {
			return;
		}
		$source = isset( $meta['source'] ) ? (string) $meta['source'] : 'frontend';
		if ( ! self::should_log_source( $source ) ) {
			return;
		}
		$session_id = isset( $meta['session_id'] ) ? (string) $meta['session_id'] : '';
		if ( ! self::is_valid_session_id( $session_id ) ) {
			return;
		}
		$row = array(
			'session_id' => $session_id,
			'source'     => isset( $meta['source'] ) ? (string) $meta['source'] : 'frontend',
			'role'       => 'user',
			'content'    => $message,
			'page_url'   => isset( $meta['page_url'] ) ? (string) $meta['page_url'] : '',
		);
		if ( isset( $meta['input_origin'] ) ) {
			$row['input_origin'] = self::sanitize_input_origin( (string) $meta['input_origin'] );
		}
		self::insert( $row );
	}

	/**
	 * Log assistant response card.
	 *
	 * @param array<string, mixed> $card   Response card.
	 * @param array<string, mixed> $meta   session_id, source, page_url.
	 * @return string Message UID when logged.
	 */
	public static function log_assistant_card( array $card, array $meta ): string {
		$source = isset( $meta['source'] ) ? (string) $meta['source'] : 'frontend';
		if ( ! self::should_log_source( $source ) ) {
			return '';
		}
		$session_id = isset( $meta['session_id'] ) ? (string) $meta['session_id'] : '';
		if ( ! self::is_valid_session_id( $session_id ) ) {
			return '';
		}

		$body = isset( $card['body'] ) ? (string) $card['body'] : '';
		$title = isset( $card['title'] ) ? (string) $card['title'] : '';
		$content = trim( $body );
		if ( $content === '' && $title !== '' ) {
			$content = $title;
		}
		if ( $content === '' ) {
			return '';
		}

		$result = self::insert(
			array(
				'session_id' => $session_id,
				'source'     => isset( $meta['source'] ) ? (string) $meta['source'] : 'frontend',
				'role'       => 'assistant',
				'content'    => $content,
				'card_type'  => isset( $card['type'] ) ? (string) $card['type'] : '',
				'confidence' => isset( $card['confidence'] ) ? (string) $card['confidence'] : '',
				'page_url'   => isset( $meta['page_url'] ) ? (string) $meta['page_url'] : '',
			)
		);

		return ! empty( $result['message_uid'] ) ? (string) $result['message_uid'] : '';
	}

	/**
	 * @param array<string, mixed> $data Accept data.
	 * @return array{ok: bool, error?: string}
	 */
	public static function record_accept( array $data ) {
		if ( ! self::is_logging_active() ) {
			return array( 'ok' => false, 'error' => 'logging_disabled' );
		}

		$message_uid = isset( $data['message_uid'] ) ? sanitize_text_field( (string) $data['message_uid'] ) : '';
		if ( ! self::is_valid_uuid( $message_uid ) ) {
			return array( 'ok' => false, 'error' => 'invalid_message' );
		}

		$url = isset( $data['url'] ) ? esc_url_raw( (string) $data['url'] ) : '';
		if ( $url === '' ) {
			return array( 'ok' => false, 'error' => 'empty_url' );
		}
		if ( strlen( $url ) > 512 ) {
			$url = substr( $url, 0, 512 );
		}

		$label = isset( $data['label'] ) ? sanitize_text_field( (string) $data['label'] ) : '';
		if ( strlen( $label ) > 255 ) {
			$label = substr( $label, 0, 255 );
		}

		$type = isset( $data['type'] ) ? sanitize_key( (string) $data['type'] ) : 'link';
		if ( ! in_array( $type, array( 'cta', 'source', 'link' ), true ) ) {
			$type = 'link';
		}

		global $wpdb;
		$table = self::messages_table_name();
		$now   = current_time( 'mysql', true );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$updated = $wpdb->update(
			$table,
			array(
				'accepted_url'   => $url,
				'accepted_label' => $label !== '' ? $label : null,
				'accepted_type'  => $type,
				'accepted_at'    => $now,
			),
			array( 'message_uid' => $message_uid ),
			array( '%s', '%s', '%s', '%s' ),
			array( '%s' )
		);

		if ( false === $updated ) {
			return array( 'ok' => false, 'error' => __( 'Could not update chat log.', 'neo-pulse-wp' ) );
		}

		return array( 'ok' => true );
	}

	/**
	 * Parse logging meta from chat JSON body.
	 *
	 * @param array<string, mixed>|null $body Request body.
	 * @return array{session_id: string, source: string, page_url: string, input_origin: string}
	 */
	public static function parse_meta_from_body( ?array $body ): array {
		if ( ! is_array( $body ) ) {
			return array(
				'session_id'   => '',
				'source'       => 'frontend',
				'page_url'     => '',
				'input_origin' => 'typed',
			);
		}
		$session_id = isset( $body['session_id'] ) ? sanitize_text_field( (string) $body['session_id'] ) : '';
		$source     = isset( $body['source'] ) ? sanitize_key( (string) $body['source'] ) : 'frontend';
		if ( ! self::is_valid_source( $source ) ) {
			$source = 'frontend';
		}
		$page_url = isset( $body['page_url'] ) ? esc_url_raw( (string) $body['page_url'] ) : '';
		$origin   = isset( $body['input_origin'] ) ? self::sanitize_input_origin( (string) $body['input_origin'] ) : 'typed';
		return array(
			'session_id'   => $session_id,
			'source'       => $source,
			'page_url'     => $page_url,
			'input_origin' => $origin,
		);
	}

	/**
	 * @param array<string, mixed> $args Query args.
	 * @return array{items: array<int, object>, total: int}
	 */
	public static function query( array $args = array() ): array {
		global $wpdb;

		$table  = self::messages_table_name();
		$where  = array( '1=1' );
		$params = array();

		$source = isset( $args['source'] ) ? sanitize_key( (string) $args['source'] ) : '';
		if ( $source !== '' && self::is_valid_source( $source ) ) {
			$where[]  = 'source = %s';
			$params[] = $source;
		}

		$role = isset( $args['role'] ) ? sanitize_key( (string) $args['role'] ) : '';
		if ( in_array( $role, array( 'user', 'assistant' ), true ) ) {
			$where[]  = 'role = %s';
			$params[] = $role;
		}

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
			$where[]  = '(content LIKE %s OR session_id LIKE %s)';
			$params[] = $like;
			$params[] = $like;
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
			'session_id' => 'session_id',
			'source'     => 'source',
			'role'       => 'role',
			'created_at' => 'created_at',
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

	public static function count_messages(): int {
		global $wpdb;
		$table = self::messages_table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
	}

	public static function delete_message( int $id ): bool {
		global $wpdb;
		if ( $id < 1 ) {
			return false;
		}
		$table = self::messages_table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		return (bool) $wpdb->delete( $table, array( 'id' => $id ), array( '%d' ) );
	}

	public static function delete_all_messages(): int {
		global $wpdb;
		$table = self::messages_table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return (int) $wpdb->query( "TRUNCATE TABLE {$table}" );
	}

	/**
	 * @param array<int, array<string, mixed>> $rows Parsed CSV rows.
	 * @return array{inserted: int, skipped: int}
	 */
	public static function merge_import( array $rows ): array {
		self::set_import_context( true );
		$inserted = 0;
		$skipped  = 0;
		foreach ( $rows as $row ) {
			$result = self::insert( $row );
			if ( ! empty( $result['ok'] ) ) {
				++$inserted;
			} else {
				++$skipped;
			}
		}
		self::set_import_context( false );
		return array(
			'inserted' => $inserted,
			'skipped'  => $skipped,
		);
	}

	/**
	 * Delete rows older than the retention period. No cron covers this table, so it runs from
	 * the insert path, but at most once every 12 hours instead of on every logged message.
	 */
	public static function maybe_prune_retention(): void {
		$settings = self::get_settings();
		$days     = (int) $settings['retention_days'];
		if ( $days < 1 ) {
			return;
		}
		if ( get_transient( 'neo_pulse_chat_logs_pruned' ) ) {
			return;
		}
		set_transient( 'neo_pulse_chat_logs_pruned', 1, 12 * HOUR_IN_SECONDS );
		$cutoff = gmdate( 'Y-m-d H:i:s', time() - ( $days * DAY_IN_SECONDS ) );
		global $wpdb;
		$table = self::messages_table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$wpdb->query( $wpdb->prepare( "DELETE FROM {$table} WHERE created_at < %s", $cutoff ) );
	}

	/**
	 * @param array<string, mixed> $args Filters.
	 * @return array<int, object>
	 */
	public static function fetch_messages_for_analysis( array $args ): array {
		$defaults = array(
			'date_from'      => gmdate( 'Y-m-d', strtotime( '-30 days' ) ),
			'date_to'        => gmdate( 'Y-m-d' ),
			'source'         => '',
			'per_page'       => 400,
			'page'           => 1,
			'orderby'        => 'created_at',
			'order'          => 'asc',
		);
		$args     = array_merge( $defaults, $args );
		$result   = self::query( $args );
		return $result['items'];
	}

	/**
	 * @return object|null
	 */
	public static function get_report( int $id ) {
		global $wpdb;
		if ( $id < 1 ) {
			return null;
		}
		$table = self::reports_table_name();
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$row = $wpdb->get_row( $wpdb->prepare( "SELECT * FROM {$table} WHERE id = %d", $id ) );
		return $row ? $row : null;
	}

	/**
	 * @return array{items: array<int, object>, total: int}
	 */
	public static function query_reports( int $per_page = 20, int $page = 1 ): array {
		global $wpdb;
		$table   = self::reports_table_name();
		$per_page = max( 1, min( 100, $per_page ) );
		$page     = max( 1, $page );
		$offset   = ( $page - 1 ) * $per_page;

		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$total = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table}" );
		// phpcs:ignore WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$items = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT * FROM {$table} ORDER BY created_at DESC LIMIT %d OFFSET %d",
				$per_page,
				$offset
			)
		);

		return array(
			'items' => is_array( $items ) ? $items : array(),
			'total' => $total,
		);
	}

	/**
	 * @param array<string, mixed> $data Report row.
	 * @return array{ok: bool, id?: int, error?: string}
	 */
	public static function save_report( array $data ) {
		global $wpdb;
		$table = self::reports_table_name();

		$report_uid = isset( $data['report_uid'] ) ? sanitize_text_field( (string) $data['report_uid'] ) : self::new_uuid();
		if ( ! self::is_valid_uuid( $report_uid ) ) {
			$report_uid = self::new_uuid();
		}

		$date_from = isset( $data['date_from'] ) ? sanitize_text_field( (string) $data['date_from'] ) : '';
		$date_to   = isset( $data['date_to'] ) ? sanitize_text_field( (string) $data['date_to'] ) : '';
		if ( ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_from ) || ! preg_match( '/^\d{4}-\d{2}-\d{2}$/', $date_to ) ) {
			return array(
				'ok'    => false,
				'error' => __( 'Invalid date range.', 'neo-pulse-wp' ),
			);
		}

		$source_filter = isset( $data['source_filter'] ) ? sanitize_key( (string) $data['source_filter'] ) : 'all';
		if ( ! in_array( $source_filter, array( 'all', 'frontend', 'demo' ), true ) ) {
			$source_filter = 'all';
		}

		$body = isset( $data['body'] ) ? (string) $data['body'] : '';
		if ( trim( $body ) === '' ) {
			return array(
				'ok'    => false,
				'error' => __( 'Report body is empty.', 'neo-pulse-wp' ),
			);
		}

		$now = current_time( 'mysql', true );

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery
		$inserted = $wpdb->insert(
			$table,
			array(
				'report_uid'     => $report_uid,
				'date_from'      => $date_from,
				'date_to'        => $date_to,
				'source_filter'  => $source_filter,
				'session_count'  => isset( $data['session_count'] ) ? (int) $data['session_count'] : 0,
				'message_count'  => isset( $data['message_count'] ) ? (int) $data['message_count'] : 0,
				'model'          => isset( $data['model'] ) ? sanitize_text_field( (string) $data['model'] ) : '',
				'body'           => $body,
				'created_at'     => $now,
			),
			array( '%s', '%s', '%s', '%s', '%d', '%d', '%s', '%s', '%s' )
		);

		if ( false === $inserted ) {
			return array(
				'ok'    => false,
				'error' => __( 'Could not save report.', 'neo-pulse-wp' ),
			);
		}

		return array( 'ok' => true, 'id' => (int) $wpdb->insert_id );
	}

	public static function delete_report( int $id ): bool {
		global $wpdb;
		if ( $id < 1 ) {
			return false;
		}
		$table = self::reports_table_name();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		return (bool) $wpdb->delete( $table, array( 'id' => $id ), array( '%d' ) );
	}

	public static function new_uuid(): string {
		if ( function_exists( 'wp_generate_uuid4' ) ) {
			return wp_generate_uuid4();
		}
		return sprintf(
			'%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
			wp_rand( 0, 0xffff ),
			wp_rand( 0, 0xffff ),
			wp_rand( 0, 0xffff ),
			wp_rand( 0, 0x0fff ) | 0x4000,
			wp_rand( 0, 0x3fff ) | 0x8000,
			wp_rand( 0, 0xffff ),
			wp_rand( 0, 0xffff ),
			wp_rand( 0, 0xffff )
		);
	}

	private static function is_valid_uuid( string $uuid ): bool {
		return (bool) preg_match(
			'/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i',
			$uuid
		);
	}

	/** @var bool */
	private static $import_context = false;

	public static function set_import_context( bool $enabled ): void {
		self::$import_context = $enabled;
	}

	private static function is_import_context(): bool {
		return self::$import_context;
	}
}
