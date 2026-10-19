<?php
/**
 * HFCM / WPCode → Script Manager adapter.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Migrate_Source_Hfcm implements Neo_Pulse_Wp_Migrate_Adapter {

	const BATCH_SCRIPTS = 10;

	/** @var string */
	private static $last_fetch_debug = '';

	/** @var string */
	private static $last_fetch_source = '';

	/** @var array<int, string> */
	private static $last_tables_tried = array();

	public function get_id(): string {
		return 'hfcm';
	}

	public function get_macro_group(): string {
		return 'performance';
	}

	public function get_label(): string {
		return __( 'Header Footer Code Manager / WPCode', 'neo-pulse-wp' );
	}

	public function is_available(): bool {
		return ! empty( $this->detect()['active'] );
	}

	/**
	 * @return array<string, mixed>
	 */
	public function detect(): array {
		$hfcm_count   = self::hfcm_snippet_count();
		$hfcm         = null !== $hfcm_count || self::is_hfcm_plugin_active();
		$wpcode       = post_type_exists( 'wpcode' );
		$ihaf         = self::ihaf_has_content();

		$active = $hfcm || $wpcode || $ihaf;
		$info   = array(
			'active'        => $active,
			'source'        => $hfcm ? 'hfcm' : ( $wpcode ? 'wpcode' : ( $ihaf ? 'ihaf' : '' ) ),
			'plugin_active' => self::is_hfcm_plugin_active(),
		);

		if ( null !== $hfcm_count ) {
			$info['snippet_count'] = $hfcm_count;
		} elseif ( $wpcode ) {
			$counts = wp_count_posts( 'wpcode' );
			$info['snippet_count'] = is_object( $counts ) ? (int) ( $counts->publish ?? 0 ) : 0;
		} elseif ( $ihaf ) {
			$info['snippet_count'] = count( self::ihaf_legacy_rows() );
		}

		return $info;
	}

	public function get_steps( string $phase ): array {
		if ( ! $this->is_available() ) {
			return array();
		}
		$count = (int) ( $this->detect()['snippet_count'] ?? 1 );
		$batches = max( 1, (int) ceil( max( 1, $count ) / self::BATCH_SCRIPTS ) );

		if ( 'crawl' === $phase ) {
			return array(
				array(
					'id'    => 'hfcm_crawl_scripts',
					'label' => __( 'Crawl HFCM / WPCode snippets', 'neo-pulse-wp' ),
					'total' => $batches,
				),
			);
		}
		if ( 'apply' === $phase ) {
			return array(
				array(
					'id'    => 'hfcm_apply_scripts',
					'label' => __( 'Import snippets into Script Manager', 'neo-pulse-wp' ),
					'total' => max( 1, (int) ceil( count( $this->get_sheet_scripts() ) / self::BATCH_SCRIPTS ) ),
				),
			);
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

		if ( 'hfcm_crawl_scripts' === $step_id ) {
			return $this->crawl_scripts_batch( $sheet, $offset );
		}
		if ( 'hfcm_apply_scripts' === $step_id ) {
			return $this->apply_scripts_batch( $sheet, $offset, $dry );
		}

		return array(
			'ok'    => false,
			'error' => __( 'Unknown HFCM import step.', 'neo-pulse-wp' ),
		);
	}

	private static function hfcm_table_suffix(): string {
		if ( class_exists( 'NNR_HFCM_PRO', false ) && ! empty( NNR_HFCM_PRO::$nnr_hfcm_table ) ) {
			return (string) NNR_HFCM_PRO::$nnr_hfcm_table;
		}
		if ( class_exists( 'NNR_HFCM', false ) && ! empty( NNR_HFCM::$nnr_hfcm_table ) ) {
			return (string) NNR_HFCM::$nnr_hfcm_table;
		}

		return 'hfcm_scripts';
	}

	private static function hfcm_resolve_table_name( string $name ): string {
		global $wpdb;

		if ( '' === $name ) {
			return $wpdb->prefix . 'hfcm_scripts';
		}

		// Some installs store the fully-qualified table name in the plugin constant.
		if ( false !== strpos( $name, 'hfcm' ) && ( 0 === strpos( $name, $wpdb->prefix ) || 0 === strpos( $name, $wpdb->base_prefix ) ) ) {
			return $name;
		}

		return $wpdb->prefix . ltrim( $name, '_' );
	}

	private static function hfcm_table(): string {
		return self::hfcm_resolve_table_name( self::hfcm_table_suffix() );
	}

	/**
	 * @return array<int, string>
	 */
	private static function hfcm_candidate_tables(): array {
		global $wpdb;

		$tables = array(
			self::hfcm_table(),
			$wpdb->prefix . 'hfcm_scripts',
		);
		if ( $wpdb->base_prefix !== $wpdb->prefix ) {
			$tables[] = $wpdb->base_prefix . 'hfcm_scripts';
		}

		$wpdb->suppress_errors( true );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching
		$discovered = $wpdb->get_col( "SHOW TABLES LIKE '%hfcm%'" );
		$wpdb->suppress_errors( false );
		if ( is_array( $discovered ) ) {
			$tables = array_merge( $tables, $discovered );
		}

		return array_values( array_unique( array_filter( $tables ) ) );
	}

	/**
	 * @param mixed $rows Query rows.
	 * @return array<int, array<string, mixed>>
	 */
	private static function normalize_db_rows( $rows ): array {
		if ( ! is_array( $rows ) ) {
			return array();
		}

		$out = array();
		foreach ( $rows as $row ) {
			if ( is_array( $row ) ) {
				$out[] = $row;
			} elseif ( is_object( $row ) ) {
				$out[] = (array) $row;
			}
		}

		return $out;
	}

	private static function hfcm_load_snippets_list_class(): void {
		foreach ( array( 'NNR_HFCM_PRO_Snippets_List', 'NNR_HFCM_Snippets_List' ) as $class ) {
			if ( class_exists( $class, false ) ) {
				return;
			}
		}

		if ( ! defined( 'WP_PLUGIN_DIR' ) ) {
			return;
		}

		$files = glob( WP_PLUGIN_DIR . '/*/includes/class-hfcm*-snippets-list.php' );
		if ( ! is_array( $files ) ) {
			return;
		}

		foreach ( $files as $file ) {
			if ( is_readable( $file ) ) {
				require_once $file;
			}
		}
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	private static function hfcm_fetch_via_plugin_api(): array {
		self::hfcm_load_snippets_list_class();

		foreach ( array( 'NNR_HFCM_PRO_Snippets_List', 'NNR_HFCM_Snippets_List' ) as $class ) {
			if ( ! class_exists( $class, false ) || ! method_exists( $class, 'get_snippets' ) ) {
				continue;
			}

			$rows = $class::get_snippets( 9999, 1, 'all' );
			$rows = self::normalize_db_rows( $rows );
			if ( ! empty( $rows ) ) {
				self::$last_fetch_source = $class . '::get_snippets';
				return $rows;
			}
		}

		return array();
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	private static function hfcm_query_table_rows( string $table ): array {
		global $wpdb;

		if ( '' === $table ) {
			return array();
		}

		$wpdb->suppress_errors( true );
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
		$rows = $wpdb->get_results( "SELECT * FROM `{$table}` ORDER BY script_id ASC", ARRAY_A );
		if ( ! is_array( $rows ) || empty( $rows ) ) {
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$rows = self::normalize_db_rows( $wpdb->get_results( "SELECT * FROM `{$table}` ORDER BY script_id ASC" ) );
		}
		$wpdb->suppress_errors( false );

		if ( ! is_array( $rows ) ) {
			self::$last_fetch_debug = $wpdb->last_error ? (string) $wpdb->last_error : 'Query returned a non-array result.';
			return array();
		}

		if ( ! empty( $rows ) ) {
			self::$last_fetch_source = 'table:' . $table;
		}

		return $rows;
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	public static function hfcm_fetch_db_rows(): array {
		self::$last_fetch_debug  = '';
		self::$last_fetch_source = '';
		self::$last_tables_tried = array();

		$via_api = self::hfcm_fetch_via_plugin_api();
		if ( ! empty( $via_api ) ) {
			return $via_api;
		}

		foreach ( self::hfcm_candidate_tables() as $table ) {
			self::$last_tables_tried[] = $table;
			$rows                      = self::hfcm_query_table_rows( $table );
			if ( ! empty( $rows ) ) {
				return $rows;
			}
		}

		return array();
	}

	public static function hfcm_table_name_for_display(): string {
		return self::hfcm_table();
	}

	public static function hfcm_last_fetch_debug(): string {
		$parts = array();
		if ( self::$last_fetch_source !== '' ) {
			$parts[] = 'source=' . self::$last_fetch_source;
		}
		if ( ! empty( self::$last_tables_tried ) ) {
			$parts[] = 'tables=' . implode( ', ', self::$last_tables_tried );
		}
		if ( self::$last_fetch_debug !== '' ) {
			$parts[] = self::$last_fetch_debug;
		}

		return implode( '; ', array_filter( $parts ) );
	}

	/**
	 * Whether Header Footer Code Manager (free or pro) is active.
	 */
	public static function is_hfcm_plugin_active(): bool {
		if ( class_exists( 'NNR_HFCM', false ) || class_exists( 'NNR_HFCM_PRO', false ) ) {
			return true;
		}
		if ( ! function_exists( 'is_plugin_active' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$bootstrap_files = array(
			'header-footer-code-manager/99robots-header-footer-code-manager.php',
			'99robots-header-footer-code-manager-pro/99robots-header-footer-code-manager-pro.php',
			'header-footer-code-manager-pro/99robots-header-footer-code-manager-pro.php',
		);
		foreach ( $bootstrap_files as $file ) {
			if ( is_plugin_active( $file ) ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Snippet count from the HFCM table, or null when the table is not queryable.
	 */
	public static function hfcm_snippet_count(): ?int {
		self::hfcm_load_snippets_list_class();
		foreach ( array( 'NNR_HFCM_PRO_Snippets_List', 'NNR_HFCM_Snippets_List' ) as $class ) {
			if ( class_exists( $class, false ) && method_exists( $class, 'record_count' ) ) {
				$count = $class::record_count( 'all' );
				if ( is_numeric( $count ) ) {
					return (int) $count;
				}
			}
		}

		global $wpdb;
		foreach ( self::hfcm_candidate_tables() as $table ) {
			$wpdb->suppress_errors( true );
			// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery, WordPress.DB.DirectDatabaseQuery.NoCaching, WordPress.DB.PreparedSQL.InterpolatedNotPrepared
			$count = $wpdb->get_var( "SELECT COUNT(*) FROM `{$table}`" );
			$wpdb->suppress_errors( false );
			if ( is_numeric( $count ) ) {
				return (int) $count;
			}
		}

		$rows = self::hfcm_fetch_db_rows();
		if ( ! empty( $rows ) ) {
			return count( $rows );
		}

		return null;
	}

	private static function hfcm_table_exists(): bool {
		return null !== self::hfcm_snippet_count();
	}

	/**
	 * HFCM is present when the plugin is active or the snippets table exists.
	 */
	public static function is_hfcm_present(): bool {
		return self::is_hfcm_plugin_active() || self::hfcm_table_exists();
	}

	/**
	 * @param array<string, mixed> $sheet Flo Sheet.
	 */
	private function crawl_scripts_batch( array &$sheet, int $offset ): array {
		$rows = array();

		if ( self::hfcm_table_exists() || self::is_hfcm_plugin_active() ) {
			$db_rows = self::hfcm_fetch_db_rows();
			if ( ! empty( $db_rows ) ) {
				$batch_rows = array_slice( $db_rows, $offset, self::BATCH_SCRIPTS );
				$snippets   = array();
				foreach ( $batch_rows as $db_row ) {
					if ( ! is_array( $db_row ) ) {
						continue;
					}
					$snippets[] = self::hfcm_row_to_snippet( $db_row );
				}
				$parsed = Neo_Pulse_Wp_Script_Manager_Import::hfcm_snippets_to_rows( $snippets );
				if ( ! empty( $parsed['error'] ) || empty( $parsed['rows'] ) ) {
					return array(
						'ok'    => false,
						'error' => $parsed['error'] ?? __( 'HFCM snippets were found but could not be converted for import.', 'neo-pulse-wp' ),
					);
				}
				$rows = $parsed['rows'];
				foreach ( $rows as &$row ) {
					$row['category'] = __( 'HFCM', 'neo-pulse-wp' );
				}
				unset( $row );
			} elseif ( self::is_hfcm_plugin_active() && $offset === 0 ) {
				$error = sprintf(
					/* translators: %s: database table name */
					__( 'HFCM is active but no snippets could be read from `%s`.', 'neo-pulse-wp' ),
					self::hfcm_table()
				);
				$debug = self::hfcm_last_fetch_debug();
				if ( $debug !== '' ) {
					$error .= ' ' . sprintf(
						/* translators: %s: debug details */
						__( 'Debug: %s', 'neo-pulse-wp' ),
						$debug
					);
				}
				return array(
					'ok'    => false,
					'error' => $error,
				);
			}
		} elseif ( post_type_exists( 'wpcode' ) ) {
			$posts = get_posts(
				array(
					'post_type'      => 'wpcode',
					'post_status'    => 'publish',
					'posts_per_page' => self::BATCH_SCRIPTS,
					'offset'         => $offset,
					'orderby'        => 'ID',
					'order'          => 'ASC',
				)
			);
			foreach ( $posts as $post ) {
				$row = self::wpcode_post_to_row( $post );
				if ( $row ) {
					$rows[] = $row;
				}
			}
		} elseif ( $offset === 0 && ! self::is_hfcm_present() ) {
			$rows = self::ihaf_legacy_rows();
		}

		if ( empty( $rows ) ) {
			return array(
				'ok'      => true,
				'done'    => true,
				'message' => __( 'No third-party snippets found to crawl.', 'neo-pulse-wp' ),
			);
		}

		if ( ! isset( $sheet['sheets']['scripts'] ) || ! is_array( $sheet['sheets']['scripts'] ) ) {
			$sheet['sheets']['scripts'] = array();
		}
		foreach ( $rows as $row ) {
			$sheet['sheets']['scripts'][] = $row;
		}

		return array(
			'ok'      => true,
			'done'    => count( $rows ) < self::BATCH_SCRIPTS,
			'message' => sprintf(
				/* translators: %d: snippet count */
				__( 'Crawled %d snippet(s).', 'neo-pulse-wp' ),
				count( $rows )
			),
			'stats'   => array( 'processed' => count( $rows ) ),
		);
	}

	/**
	 * Import every snippet from the installed HFCM database table.
	 *
	 * @return array{ok: bool, error?: string, stats?: array{added: int, updated: int, skipped: int}, warnings?: array<int, string>, imported?: int}
	 */
	public static function import_all_from_database(): array {
		if ( ! self::is_hfcm_present() ) {
			return array(
				'ok'    => false,
				'error' => __( 'HFCM database table not found. Is Header Footer Code Manager installed?', 'neo-pulse-wp' ),
			);
		}

		$db_rows = self::hfcm_fetch_db_rows();
		if ( empty( $db_rows ) ) {
			$error = sprintf(
				/* translators: 1: table name, 2: snippet count hint */
				__( 'No HFCM snippets found in `%1$s`. %2$s', 'neo-pulse-wp' ),
				self::hfcm_table(),
				self::is_hfcm_plugin_active()
					? __( 'Check that HFCM Pro snippets exist under HFCM → All Snippets.', 'neo-pulse-wp' )
					: ''
			);
			$debug = self::hfcm_last_fetch_debug();
			if ( $debug !== '' ) {
				$error .= ' ' . sprintf(
					/* translators: %s: debug details */
					__( 'Debug: %s', 'neo-pulse-wp' ),
					$debug
				);
			}
			return array(
				'ok'    => false,
				'error' => $error,
			);
		}

		$snippets = array();
		foreach ( $db_rows as $db_row ) {
			if ( ! is_array( $db_row ) ) {
				continue;
			}
			$snippets[] = self::hfcm_row_to_snippet( $db_row );
		}

		$parsed = Neo_Pulse_Wp_Script_Manager_Import::hfcm_snippets_to_rows( $snippets );
		if ( ! empty( $parsed['error'] ) || empty( $parsed['rows'] ) ) {
			return array(
				'ok'    => false,
				'error' => $parsed['error'] ?? __( 'HFCM snippets could not be converted for import.', 'neo-pulse-wp' ),
			);
		}

		$rows = $parsed['rows'];
		// While HFCM is still active its snippets already run: import them switched off.
		$hfcm_on = self::is_hfcm_plugin_active();
		foreach ( $rows as &$row ) {
			$row['category'] = __( 'HFCM', 'neo-pulse-wp' );
			if ( $hfcm_on ) {
				$row['status'] = 'inactive';
			}
		}
		unset( $row );
		if ( $hfcm_on ) {
			$parsed['warnings']   = isset( $parsed['warnings'] ) && is_array( $parsed['warnings'] ) ? $parsed['warnings'] : array();
			$parsed['warnings'][] = __( 'Header Footer Code Manager is still active, so the imported scripts were saved switched off. Deactivate HFCM, then switch them on in Script Manager.', 'neo-pulse-wp' );
		}

		$stats = Neo_Pulse_Wp_Script_Manager::merge_import( $rows );

		$ok = ( (int) ( $stats['added'] ?? 0 ) + (int) ( $stats['updated'] ?? 0 ) ) > 0;
		if ( ! $ok && ! empty( $stats['errors'] ) ) {
			return array(
				'ok'       => false,
				'error'    => implode( ' ', array_slice( $stats['errors'], 0, 3 ) ),
				'stats'    => $stats,
				'warnings' => isset( $parsed['warnings'] ) && is_array( $parsed['warnings'] ) ? $parsed['warnings'] : array(),
			);
		}

		return array(
			'ok'        => true,
			'stats'     => $stats,
			'warnings'  => isset( $parsed['warnings'] ) && is_array( $parsed['warnings'] ) ? $parsed['warnings'] : array(),
			'imported'  => count( $rows ),
		);
	}

	/**
	 * @param array<string, mixed> $sheet Flo Sheet.
	 */
	private function apply_scripts_batch( array &$sheet, int $offset, bool $dry ): array {
		$scripts = isset( $sheet['sheets']['scripts'] ) && is_array( $sheet['sheets']['scripts'] )
			? $sheet['sheets']['scripts']
			: array();

		if ( empty( $scripts ) && $offset === 0 && self::hfcm_table_exists() && ! $dry ) {
			$direct = self::import_all_from_database();
			if ( ! empty( $direct['ok'] ) && ! empty( $direct['stats'] ) ) {
				$stats = $direct['stats'];
				return array(
					'ok'      => true,
					'done'    => true,
					'message' => sprintf(
						/* translators: 1: added, 2: updated, 3: skipped */
						__( 'Imported HFCM scripts: %1$d added, %2$d updated, %3$d skipped.', 'neo-pulse-wp' ),
						(int) $stats['added'],
						(int) $stats['updated'],
						(int) $stats['skipped']
					),
					'stats'   => $stats,
				);
			}
		}
		$batch   = array_slice( $scripts, $offset, self::BATCH_SCRIPTS );
		if ( empty( $batch ) ) {
			return array(
				'ok'      => true,
				'done'    => true,
				'message' => __( 'No scripts to import.', 'neo-pulse-wp' ),
			);
		}
		if ( $dry ) {
			return array(
				'ok'      => true,
				'done'    => ( $offset + count( $batch ) ) >= count( $scripts ),
				'message' => sprintf(
					/* translators: %d: script count */
					__( 'Dry run: would import %d script(s).', 'neo-pulse-wp' ),
					count( $batch )
				),
				'stats'   => array( 'would_import' => count( $batch ) ),
			);
		}

		$hfcm_on = self::is_hfcm_plugin_active();
		if ( $hfcm_on ) {
			foreach ( $batch as &$script_row ) {
				if ( is_array( $script_row ) ) {
					$script_row['status'] = 'inactive';
				}
			}
			unset( $script_row );
		}
		$stats = Neo_Pulse_Wp_Script_Manager::merge_import( $batch );
		$done  = ( $offset + count( $batch ) ) >= count( $scripts );

		return array(
			'ok'      => true,
			'done'    => $done,
			'message' => sprintf(
				/* translators: 1: added, 2: updated, 3: skipped */
				__( 'Scripts: %1$d added, %2$d updated, %3$d skipped.', 'neo-pulse-wp' ),
				(int) $stats['added'],
				(int) $stats['updated'],
				(int) $stats['skipped']
			) . ( $hfcm_on ? ' ' . __( 'Header Footer Code Manager is still active, so they were saved switched off.', 'neo-pulse-wp' ) : '' ),
			'stats'   => $stats,
		);
	}

	/**
	 * Normalize one HFCM DB row into legacy export snippet shape for parse_hfcm_export().
	 *
	 * @param array<string, mixed> $row HFCM DB row.
	 * @return array<string, mixed>
	 */
	public static function hfcm_row_to_snippet( array $row ): array {
		$snippet = $row;

		$name = '';
		if ( isset( $row['name'] ) && (string) $row['name'] !== '' ) {
			$name = (string) $row['name'];
		} elseif ( isset( $row['snippet_name'] ) && (string) $row['snippet_name'] !== '' ) {
			$name = (string) $row['snippet_name'];
		} else {
			$name = __( 'Imported snippet', 'neo-pulse-wp' );
		}

		$snippet['name'] = $name;
		unset( $snippet['script_id'] );

		foreach ( array( 'snippet', 'location', 'status', 'snippet_type', 'device_type', 'display_on' ) as $key ) {
			if ( isset( $snippet[ $key ] ) ) {
				$snippet[ $key ] = (string) $snippet[ $key ];
			}
		}

		if ( isset( $row['priority'] ) && is_numeric( $row['priority'] ) ) {
			$snippet['priority'] = (int) $row['priority'];
		}

		if ( ! isset( $snippet['snippet'] ) ) {
			$snippet['snippet'] = '';
		}

		// HFCM stores raw JS; wrap so NEO Pulse outputs valid header/footer markup.
		$type = isset( $snippet['snippet_type'] ) ? strtolower( (string) $snippet['snippet_type'] ) : '';
		$code = trim( (string) $snippet['snippet'] );
		if ( 'js' === $type && $code !== '' && stripos( $code, '<script' ) === false ) {
			$snippet['snippet'] = '<script>' . $code . '</script>';
		} elseif ( 'css' === $type && $code !== '' && stripos( $code, '<style' ) === false ) {
			$snippet['snippet'] = '<style>' . $code . '</style>';
		}

		return $snippet;
	}

	/**
	 * @param WP_Post $post WPCode post.
	 * @return array<string, mixed>|null
	 */
	private static function wpcode_post_to_row( $post ): ?array {
		if ( ! $post instanceof WP_Post ) {
			return null;
		}
		$code = get_post_meta( $post->ID, '_wpcode_code', true );
		if ( ! is_string( $code ) || trim( $code ) === '' ) {
			$code = $post->post_content;
		}
		$location = get_post_meta( $post->ID, '_wpcode_location', true );
		$placement = 'header';
		if ( is_string( $location ) ) {
			if ( strpos( $location, 'footer' ) !== false ) {
				$placement = 'footer';
			} elseif ( strpos( $location, 'body' ) !== false ) {
				$placement = 'body_open';
			}
		}
		return array(
			'name'      => $post->post_title,
			'code'      => (string) $code,
			'placement' => $placement,
			'status'    => $post->post_status === 'publish' ? 'active' : 'inactive',
			'category'  => __( 'WPCode', 'neo-pulse-wp' ),
		);
	}

	private static function ihaf_has_content(): bool {
		foreach ( array( 'ihaf_insert_header', 'ihaf_insert_body', 'ihaf_insert_footer' ) as $option ) {
			$code = get_option( $option, '' );
			if ( is_string( $code ) && trim( $code ) !== '' ) {
				return true;
			}
		}
		return false;
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	private static function ihaf_legacy_rows(): array {
		$rows = array();
		$map  = array(
			'ihaf_insert_header' => 'header',
			'ihaf_insert_body'   => 'body_open',
			'ihaf_insert_footer' => 'footer',
		);
		foreach ( $map as $option => $placement ) {
			$code = get_option( $option, '' );
			if ( ! is_string( $code ) || trim( $code ) === '' ) {
				continue;
			}
			$rows[] = array(
				'name'      => ucfirst( str_replace( array( 'ihaf_insert_', '_' ), array( '', ' ' ), $option ) ),
				'code'      => $code,
				'placement' => $placement,
				'status'    => 'active',
				'category'  => __( 'WPCode Legacy', 'neo-pulse-wp' ),
			);
		}
		return $rows;
	}

	/**
	 * @return array<int, array<string, mixed>>
	 */
	private function get_sheet_scripts(): array {
		$sheet = Neo_Pulse_Wp_Neo_Pulse_Sheet::get();
		return isset( $sheet['sheets']['scripts'] ) && is_array( $sheet['sheets']['scripts'] )
			? $sheet['sheets']['scripts']
			: array();
	}
}
