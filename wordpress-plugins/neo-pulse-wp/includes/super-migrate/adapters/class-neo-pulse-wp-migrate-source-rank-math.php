<?php
/**
 * Rank Math → NEO Pulse Redirects + SEO meta adapter.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Migrate_Source_Rank_Math implements Neo_Pulse_Wp_Migrate_Adapter {

	const BATCH_REDIRECTS = 25;
	const BATCH_META      = 50;

	public function get_id(): string {
		return 'rank_math';
	}

	public function get_macro_group(): string {
		return 'seo';
	}

	public function get_label(): string {
		return __( 'Rank Math SEO', 'neo-pulse-wp' );
	}

	public function is_available(): bool {
		return self::is_rank_math_present();
	}

	/**
	 * @return array<string, mixed>
	 */
	public function detect(): array {
		$active = self::is_rank_math_present();
		$info   = array(
			'active'  => $active,
			'version' => defined( 'RANK_MATH_VERSION' ) ? RANK_MATH_VERSION : '',
		);
		if ( self::redirections_table_exists() ) {
			global $wpdb;
			$table = self::redirections_table();
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$info['redirect_count'] = (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE status = 'active'" );
		}
		return $info;
	}

	public function get_steps( string $phase ): array {
		if ( ! $this->is_available() ) {
			return array();
		}
		if ( 'crawl' === $phase ) {
			$steps = array();
			if ( self::redirections_table_exists() ) {
				$count = (int) ( $this->detect()['redirect_count'] ?? 0 );
				$steps[] = array(
					'id'    => 'rank_math_crawl_redirects',
					'label' => __( 'Crawl Rank Math redirects', 'neo-pulse-wp' ),
					'total' => max( 1, (int) ceil( max( 1, $count ) / self::BATCH_REDIRECTS ) ),
				);
			}
			$steps[] = array(
				'id'    => 'rank_math_crawl_meta',
				'label' => __( 'Crawl Rank Math post meta', 'neo-pulse-wp' ),
				'total' => max( 1, (int) ceil( $this->count_rank_math_meta_rows() / self::BATCH_META ) ),
			);
			return $steps;
		}
		if ( 'apply' === $phase ) {
			$redirect_batches = max( 1, (int) ceil( count( $this->get_sheet_redirects() ) / self::BATCH_REDIRECTS ) );
			$meta_batches     = max( 1, (int) ceil( count( $this->get_sheet_meta_posts() ) / self::BATCH_META ) );
			$steps            = array(
				array(
					'id'    => 'rank_math_apply_redirects',
					'label' => __( 'Import redirects into NEO Pulse', 'neo-pulse-wp' ),
					'total' => $redirect_batches,
				),
				array(
					'id'    => 'rank_math_apply_meta',
					'label' => __( 'Apply Rank Math SEO meta to posts', 'neo-pulse-wp' ),
					'total' => $meta_batches,
				),
			);
			return $steps;
		}
		return array();
	}

	/**
	 * @param array<string, mixed> $sheet   Flo Sheet.
	 * @param array<string, mixed> $context Job context.
	 */
	public function run_step( string $step_id, string $phase, array &$sheet, array $context ): array {
		$dry    = ! empty( $context['dry_run'] );
		$offset = (int) ( $context['batch_offset'] ?? 0 );

		switch ( $step_id ) {
			case 'rank_math_crawl_redirects':
				return $this->crawl_redirects_batch( $sheet, $offset );
			case 'rank_math_crawl_meta':
				return $this->crawl_meta_batch( $sheet, $offset );
			case 'rank_math_apply_redirects':
				return $this->apply_redirects_batch( $sheet, $offset, $dry );
			case 'rank_math_apply_meta':
				return $this->apply_meta_batch( $sheet, $offset, $dry );
		}

		return array(
			'ok'    => false,
			'error' => __( 'Unknown Rank Math import step.', 'neo-pulse-wp' ),
		);
	}

	private static function redirections_table(): string {
		global $wpdb;
		return $wpdb->prefix . 'rank_math_redirections';
	}

	private static function redirections_table_exists(): bool {
		global $wpdb;
		$table = self::redirections_table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return $wpdb->get_var( $wpdb->prepare( 'SHOW TABLES LIKE %s', $table ) ) === $table;
	}

	/**
	 * @param array<string, mixed> $sheet Flo Sheet.
	 */
	private function crawl_redirects_batch( array &$sheet, int $offset ): array {
		if ( ! self::redirections_table_exists() ) {
			return array(
				'ok'      => true,
				'done'    => true,
				'message' => __( 'Rank Math redirections table not found.', 'neo-pulse-wp' ),
			);
		}

		global $wpdb;
		$table = self::redirections_table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT id, sources, url_to, header_code, status FROM {$table} WHERE status = %s ORDER BY id ASC LIMIT %d OFFSET %d",
				'active',
				self::BATCH_REDIRECTS,
				$offset
			)
		);

		if ( ! is_array( $rows ) || empty( $rows ) ) {
			return array(
				'ok'      => true,
				'done'    => true,
				'message' => __( 'Rank Math redirect crawl complete.', 'neo-pulse-wp' ),
			);
		}

		if ( ! isset( $sheet['sheets']['redirects'] ) || ! is_array( $sheet['sheets']['redirects'] ) ) {
			$sheet['sheets']['redirects'] = array();
		}

		foreach ( $rows as $row ) {
			foreach ( self::expand_rank_math_row( $row ) as $expanded ) {
				$sheet['sheets']['redirects'][] = $expanded;
			}
		}

		return array(
			'ok'      => true,
			'done'    => count( $rows ) < self::BATCH_REDIRECTS,
			'message' => sprintf(
				/* translators: %d: row count */
				__( 'Crawled %d Rank Math redirect(s).', 'neo-pulse-wp' ),
				count( $rows )
			),
			'stats'   => array( 'processed' => count( $rows ) ),
		);
	}

	/**
	 * @param array<string, mixed> $sheet Flo Sheet.
	 */
	private function crawl_meta_batch( array &$sheet, int $offset ): array {
		global $wpdb;

		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT post_id, meta_key, meta_value FROM {$wpdb->postmeta} WHERE meta_key LIKE %s ORDER BY post_id ASC LIMIT %d OFFSET %d",
				$wpdb->esc_like( 'rank_math_' ) . '%',
				self::BATCH_META,
				$offset
			)
		);

		if ( ! is_array( $rows ) || empty( $rows ) ) {
			return array(
				'ok'      => true,
				'done'    => true,
				'message' => __( 'Rank Math meta crawl complete.', 'neo-pulse-wp' ),
			);
		}

		if ( ! isset( $sheet['sheets']['seo_meta']['posts'] ) || ! is_array( $sheet['sheets']['seo_meta']['posts'] ) ) {
			$sheet['sheets']['seo_meta']['posts'] = array();
		}

		$by_post = array();
		foreach ( $rows as $row ) {
			$pid = (int) $row->post_id;
			if ( ! isset( $by_post[ $pid ] ) ) {
				$by_post[ $pid ] = array(
					'post_id' => $pid,
					'meta'    => array(),
				);
			}
			$by_post[ $pid ]['meta'][ (string) $row->meta_key ] = maybe_unserialize( $row->meta_value );
		}

		foreach ( $by_post as $entry ) {
			$sheet['sheets']['seo_meta']['posts'][] = $entry;
		}

		return array(
			'ok'      => true,
			'done'    => count( $rows ) < self::BATCH_META,
			'message' => sprintf(
				/* translators: %d: meta row count */
				__( 'Crawled %d Rank Math meta row(s).', 'neo-pulse-wp' ),
				count( $rows )
			),
			'stats'   => array( 'processed' => count( $rows ) ),
		);
	}

	/**
	 * @param array<string, mixed> $sheet Flo Sheet.
	 */
	private function apply_redirects_batch( array $sheet, int $offset, bool $dry ): array {
		$redirects = $this->get_sheet_redirects();

		if ( empty( $redirects ) && $offset === 0 && ! $dry ) {
			$direct = self::import_redirects_from_database();
			if ( ! empty( $direct['ok'] ) && ! empty( $direct['stats'] ) ) {
				$stats = $direct['stats'];
				return array(
					'ok'      => true,
					'done'    => true,
					'message' => sprintf(
						/* translators: 1: added, 2: updated, 3: skipped */
						__( 'Imported Rank Math redirects: %1$d added, %2$d updated, %3$d skipped.', 'neo-pulse-wp' ),
						(int) ( $stats['added'] ?? 0 ),
						(int) ( $stats['updated'] ?? 0 ),
						(int) ( $stats['skipped'] ?? 0 )
					),
					'stats'   => $stats,
				);
			}
		}

		$batch     = array_slice( $redirects, $offset, self::BATCH_REDIRECTS );
		if ( empty( $batch ) ) {
			return array(
				'ok'      => true,
				'done'    => true,
				'message' => __( 'No redirects to apply.', 'neo-pulse-wp' ),
			);
		}

		$added   = 0;
		$skipped = 0;
		$errors  = 0;

		foreach ( $batch as $row ) {
			if ( ! is_array( $row ) ) {
				++$skipped;
				continue;
			}
			$matching = Neo_Pulse_Wp_Redirects::normalize_matching( $row['matching'] ?? 'exact' );
			$source   = isset( $row['source'] ) ? Neo_Pulse_Wp_Redirects::normalize_source( (string) $row['source'], $matching ) : null;
			if ( ! $source ) {
				++$skipped;
				continue;
			}
			if ( Neo_Pulse_Wp_Redirects::get_by_source( $source, $matching ) ) {
				++$skipped;
				continue;
			}
			if ( $dry ) {
				++$added;
				continue;
			}
			$result = Neo_Pulse_Wp_Redirects::save( $row );
			if ( ! empty( $result['ok'] ) ) {
				++$added;
			} else {
				++$errors;
			}
		}

		$done = ( $offset + count( $batch ) ) >= count( $redirects );

		return array(
			'ok'      => $errors === 0,
			'done'    => $done,
			'message' => sprintf(
				/* translators: 1: added, 2: skipped, 3: errors */
				__( 'Redirects: %1$d added, %2$d skipped, %3$d errors.', 'neo-pulse-wp' ),
				$added,
				$skipped,
				$errors
			),
			'stats'   => array(
				'added'   => $added,
				'skipped' => $skipped,
				'errors'  => $errors,
			),
		);
	}

	/**
	 * @param array<string, mixed> $sheet Flo Sheet.
	 */
	private function apply_meta_batch( array $sheet, int $offset, bool $dry ): array {
		$posts = $this->get_sheet_meta_posts();
		$batch = array_slice( $posts, $offset, self::BATCH_META );
		if ( empty( $batch ) ) {
			return array(
				'ok'      => true,
				'done'    => true,
				'message' => __( 'No Rank Math meta to apply.', 'neo-pulse-wp' ),
			);
		}

		$updated = 0;
		$skipped = 0;

		foreach ( $batch as $row ) {
			if ( ! is_array( $row ) || empty( $row['post_id'] ) || ! is_array( $row['meta'] ?? null ) ) {
				++$skipped;
				continue;
			}
			$post_id = (int) $row['post_id'];
			if ( $post_id < 1 || ! get_post( $post_id ) ) {
				++$skipped;
				continue;
			}
			if ( $dry ) {
				++$updated;
				continue;
			}
			foreach ( $row['meta'] as $key => $value ) {
				update_post_meta( $post_id, (string) $key, $value );
			}
			if ( ! empty( $row['meta']['rank_math_focus_keyword'] ) ) {
				update_post_meta( $post_id, 'keyword_focus', (string) $row['meta']['rank_math_focus_keyword'] );
			}
			++$updated;
		}

		$done = ( $offset + count( $batch ) ) >= count( $posts );

		return array(
			'ok'      => true,
			'done'    => $done,
			'message' => sprintf(
				/* translators: 1: updated, 2: skipped */
				__( 'SEO meta: %1$d updated, %2$d skipped.', 'neo-pulse-wp' ),
				$updated,
				$skipped
			),
			'stats'   => array(
				'updated' => $updated,
				'skipped' => $skipped,
			),
		);
	}

	/**
	 * Every source pattern of a Rank Math rule (the `sources` column is a
	 * serialized list of pattern / comparison / ignore entries).
	 *
	 * @return array<int, array{pattern: string, matching: string, ignore: int}>
	 */
	public static function parse_rank_math_sources( string $sources_raw ): array {
		$sources_raw = trim( $sources_raw );
		if ( $sources_raw === '' ) {
			return array();
		}
		$data = maybe_unserialize( $sources_raw );
		if ( is_string( $data ) ) {
			$data = array( $data );
		}
		if ( ! is_array( $data ) ) {
			return array();
		}
		$out = array();
		foreach ( $data as $item ) {
			if ( is_string( $item ) ) {
				$item = array( 'pattern' => $item );
			}
			if ( ! is_array( $item ) || ! isset( $item['pattern'] ) || '' === trim( (string) $item['pattern'] ) ) {
				continue;
			}
			$out[] = array(
				'pattern'  => (string) $item['pattern'],
				'matching' => Neo_Pulse_Wp_Redirects::normalize_matching( isset( $item['comparison'] ) ? (string) $item['comparison'] : 'exact' ),
				'ignore'   => ! empty( $item['ignore'] ) ? 1 : 0,
			);
		}
		return $out;
	}

	/**
	 * One NEO Pulse row per source pattern of a Rank Math rule.
	 *
	 * @param object $row Rank Math DB row (id, sources, url_to, header_code, status).
	 * @return array<int, array<string, mixed>>
	 */
	public static function expand_rank_math_row( $row ): array {
		$type    = isset( $row->header_code ) ? (int) $row->header_code : 301;
		$is_gone = in_array( $type, Neo_Pulse_Wp_Redirects::GONE_CODES, true );
		$dest    = isset( $row->url_to ) ? trim( (string) $row->url_to ) : '';
		if ( '' === $dest && ! $is_gone ) {
			return array();
		}
		$out = array();
		foreach ( self::parse_rank_math_sources( isset( $row->sources ) ? (string) $row->sources : '' ) as $src ) {
			$out[] = array(
				'source'        => $src['pattern'],
				'matching'      => $src['matching'],
				'ignore'        => $src['ignore'],
				'destination'   => $dest,
				'type'          => $type,
				'status'        => 'active',
				'category'      => __( 'Rank Math', 'neo-pulse-wp' ),
				'_rank_math_id' => isset( $row->id ) ? (int) $row->id : 0,
			);
		}
		return $out;
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	private function get_sheet_redirects(): array {
		$sheet = Neo_Pulse_Wp_Neo_Pulse_Sheet::get();
		return isset( $sheet['sheets']['redirects'] ) && is_array( $sheet['sheets']['redirects'] )
			? $sheet['sheets']['redirects']
			: array();
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	private function get_sheet_meta_posts(): array {
		$sheet = Neo_Pulse_Wp_Neo_Pulse_Sheet::get();
		return isset( $sheet['sheets']['seo_meta']['posts'] ) && is_array( $sheet['sheets']['seo_meta']['posts'] )
			? $sheet['sheets']['seo_meta']['posts']
			: array();
	}

	private function count_rank_math_meta_rows(): int {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		return max( 1, (int) $wpdb->get_var(
			$wpdb->prepare(
				"SELECT COUNT(*) FROM {$wpdb->postmeta} WHERE meta_key LIKE %s",
				$wpdb->esc_like( 'rank_math_' ) . '%'
			)
		) );
	}

	/**
	 * Whether Rank Math SEO (free) is active.
	 */
	public static function is_rank_math_free_active(): bool {
		if ( ! function_exists( 'is_plugin_active' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		return is_plugin_active( 'seo-by-rank-math/rank-math.php' );
	}

	/**
	 * Whether Rank Math SEO PRO is active (separate plugin from free Rank Math).
	 */
	public static function is_rank_math_pro_active(): bool {
		if ( defined( 'RANK_MATH_PRO_VERSION' ) ) {
			return true;
		}
		if ( ! function_exists( 'is_plugin_active' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		return is_plugin_active( 'seo-by-rank-math-pro/rank-math-pro.php' );
	}

	/**
	 * Whether Rank Math (free or Pro) is active.
	 */
	public static function is_rank_math_plugin_active(): bool {
		return self::is_rank_math_free_active() || self::is_rank_math_pro_active();
	}

	/**
	 * Rank Math is present when the plugin is active or the redirections table exists.
	 */
	public static function is_rank_math_present(): bool {
		return self::is_rank_math_plugin_active()
			|| self::redirections_table_exists();
	}

	/**
	 * Active redirect count in Rank Math table, or null when table is missing.
	 */
	public static function rank_math_redirect_count(): ?int {
		if ( ! self::redirections_table_exists() ) {
			return null;
		}

		global $wpdb;
		$table = self::redirections_table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		return (int) $wpdb->get_var( "SELECT COUNT(*) FROM {$table} WHERE status = 'active'" );
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	public static function fetch_redirect_rows(): array {
		if ( ! self::redirections_table_exists() ) {
			return array();
		}

		global $wpdb;
		$table = self::redirections_table();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$db_rows = $wpdb->get_results(
			$wpdb->prepare(
				"SELECT id, sources, url_to, header_code, status FROM {$table} WHERE status = %s ORDER BY id ASC",
				'active'
			)
		);

		if ( ! is_array( $db_rows ) || empty( $db_rows ) ) {
			return array();
		}

		$rows = array();
		foreach ( $db_rows as $row ) {
			foreach ( self::expand_rank_math_row( $row ) as $expanded ) {
				$rows[] = $expanded;
			}
		}

		return $rows;
	}

	/**
	 * Source patterns in Rank Math and how many are not in NEO Pulse yet.
	 *
	 * @return array{total: int, pending: int}
	 */
	public static function redirect_source_counts(): array {
		$rows    = self::fetch_redirect_rows();
		$map     = Neo_Pulse_Wp_Redirects::existing_sources_map();
		$seen    = array();
		$total   = 0;
		$pending = 0;
		foreach ( $rows as $row ) {
			$src = Neo_Pulse_Wp_Redirects::normalize_source( (string) $row['source'], (string) $row['matching'] );
			if ( ! $src || isset( $seen[ $src ] ) ) {
				continue;
			}
			$seen[ $src ] = true;
			++$total;
			if ( ! isset( $map[ $src ] ) ) {
				++$pending;
			}
		}
		return array(
			'total'   => $total,
			'pending' => $pending,
		);
	}

	/**
	 * One-click import of all active Rank Math redirects into NEO Pulse Redirects.
	 *
	 * Every source pattern of a rule becomes its own row (same destination and
	 * type, comparison and ignore-case kept). Sources already stored are left
	 * alone, so running it again only adds what is missing.
	 *
	 * @return array{ok: bool, error?: string, stats?: array<string, int>, imported?: int}
	 */
	public static function import_redirects_from_database(): array {
		if ( ! self::is_rank_math_present() ) {
			return array(
				'ok'    => false,
				'error' => __( 'Rank Math redirections table not found. Is Rank Math SEO installed?', 'neo-pulse-wp' ),
			);
		}

		$rows = self::fetch_redirect_rows();
		if ( empty( $rows ) ) {
			return array(
				'ok'    => false,
				'error' => self::is_rank_math_plugin_active()
					? __( 'No active Rank Math redirects found to import.', 'neo-pulse-wp' )
					: __( 'No Rank Math redirects found in the database.', 'neo-pulse-wp' ),
			);
		}

		require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-redirects.php';
		$stats = Neo_Pulse_Wp_Redirects::import_missing( $rows );
		$ok    = (int) $stats['added'] > 0 || (int) $stats['existing'] > 0;

		return array(
			'ok'       => $ok,
			'stats'    => $stats,
			'imported' => (int) $stats['added'],
			'error'    => $ok ? '' : __( 'Rank Math redirects could not be imported.', 'neo-pulse-wp' ),
		);
	}

	/** @alias import_redirects_from_database — expanded to redirects and meta. */
	public static function import_all_from_database(): array {
		if ( ! self::is_rank_math_present() ) {
			return array(
				'ok'    => false,
				'error' => __( 'Rank Math data not found in the database.', 'neo-pulse-wp' ),
			);
		}

		$redirect_result = self::import_redirects_from_database();
		$stats           = isset( $redirect_result['stats'] ) && is_array( $redirect_result['stats'] )
			? $redirect_result['stats']
			: array();
		$stats['meta_updated']  = 0;
		$stats['meta_skipped']  = 0;

		$adapter = new self();
		$sheet   = array( 'sheets' => array() );

		$meta_offset = 0;
		do {
			$crawl = $adapter->run_step( 'rank_math_crawl_meta', 'crawl', $sheet, array( 'batch_offset' => $meta_offset ) );
			if ( empty( $crawl['ok'] ) ) {
				break;
			}
			$meta_offset += self::BATCH_META;
		} while ( empty( $crawl['done'] ) );

		$apply_offset = 0;
		do {
			$apply_meta = $adapter->run_step( 'rank_math_apply_meta', 'apply', $sheet, array( 'batch_offset' => $apply_offset ) );
			if ( empty( $apply_meta['ok'] ) ) {
				break;
			}
			$stats['meta_updated'] += (int) ( $apply_meta['stats']['updated'] ?? 0 );
			$stats['meta_skipped'] += (int) ( $apply_meta['stats']['skipped'] ?? 0 );
			$apply_offset += self::BATCH_META;
		} while ( empty( $apply_meta['done'] ) );

		$redirect_ok = ! empty( $redirect_result['ok'] ) || (int) ( $stats['meta_updated'] ?? 0 ) > 0;

		return array(
			'ok'       => $redirect_ok,
			'stats'    => $stats,
			'imported' => (int) ( $redirect_result['imported'] ?? 0 ),
			'message'  => sprintf(
				/* translators: 1: redirects added, 2: meta updated */
				__( 'Rank Math import: %1$d redirect(s) added, %2$d post meta updated.', 'neo-pulse-wp' ),
				(int) ( $stats['added'] ?? 0 ),
				(int) ( $stats['meta_updated'] ?? 0 )
			),
			'error'    => $redirect_ok ? '' : (string) ( $redirect_result['error'] ?? __( 'Rank Math import found nothing to migrate.', 'neo-pulse-wp' ) ),
		);
	}
}
