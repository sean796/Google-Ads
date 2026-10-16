<?php
/**
 * One-click move from Header Footer Code Manager (free or Pro) to Script Manager.
 *
 * Reads HFCM's own table, imports every snippet with the same on/off state, placement and page
 * targeting, then deactivates HFCM so nothing is output twice. If a snippet cannot be carried
 * over (a PHP snippet other than "disable comments", an admin-area or shortcode-only snippet
 * that is switched on), everything else is still imported but HFCM is left on and the snippet
 * is listed so it can be dealt with by hand.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

class Neo_Pulse_Wp_Script_Manager_Hfcm {

	/** HFCM script_id => array of Script Manager row IDs created from it. */
	const MAP_OPTION = 'neo_pulse_wp_hfcm_import_map';

	const CATEGORY = 'HFCM';

	private static function load_adapter(): void {
		require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/super-migrate/interface-neo-pulse-wp-migrate-adapter.php';
		require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/super-migrate/adapters/class-neo-pulse-wp-migrate-source-hfcm.php';
	}

	/**
	 * Raw HFCM rows (empty when HFCM was never installed).
	 *
	 * @return array<int, array<string, mixed>>
	 */
	public static function hfcm_rows(): array {
		self::load_adapter();
		return Neo_Pulse_Wp_Migrate_Source_Hfcm::hfcm_fetch_db_rows();
	}

	/**
	 * Active HFCM plugin files (free and Pro).
	 *
	 * @return array<int, string>
	 */
	public static function active_plugin_files(): array {
		if ( ! function_exists( 'get_plugins' ) || ! function_exists( 'is_plugin_active' ) ) {
			require_once ABSPATH . 'wp-admin/includes/plugin.php';
		}
		$files = array();
		foreach ( get_plugins() as $file => $data ) {
			$name = isset( $data['Name'] ) ? strtolower( (string) $data['Name'] ) : '';
			if ( false === strpos( strtolower( $file ), 'header-footer-code-manager' ) && false === strpos( $name, 'header footer code manager' ) ) {
				continue;
			}
			if ( is_plugin_active( $file ) ) {
				$files[] = $file;
			}
		}
		return $files;
	}

	/**
	 * @return array<string, array<int, int>>
	 */
	private static function import_map(): array {
		$map = get_option( self::MAP_OPTION, array() );
		return is_array( $map ) ? $map : array();
	}

	/**
	 * What would happen to each HFCM snippet.
	 *
	 * Outcomes: import (switched on), import_off (comes in switched off), comments (handled by
	 * Neo Tools' Disable comments switch), skip (switched-off snippet that can't be imported, so nothing is
	 * lost), done (already imported), blocker (switched on but can't be carried over).
	 *
	 * @return array{items: array<int, array<string, mixed>>, plugin_active: bool, importable: int, blockers: int, pending: int}
	 */
	public static function plan(): array {
		$map   = self::import_map();
		$items = array();
		foreach ( self::hfcm_rows() as $row ) {
			$id     = isset( $row['script_id'] ) ? (int) $row['script_id'] : 0;
			$name   = isset( $row['name'] ) && '' !== (string) $row['name'] ? (string) $row['name'] : __( 'Untitled snippet', 'neo-pulse-wp' );
			$type   = strtolower( (string) ( $row['snippet_type'] ?? 'html' ) );
			$on     = 'active' === strtolower( (string) ( $row['status'] ?? 'active' ) );
			$where  = strtolower( (string) ( $row['display_on'] ?? 'all' ) );
			$item   = array(
				'id'       => $id,
				'name'     => $name,
				'type'     => $type,
				'location' => (string) ( $row['location'] ?? 'header' ),
				'active'   => $on,
				'outcome'  => 'import',
				'note'     => '',
			);

			if ( $id > 0 && isset( $map[ (string) $id ] ) ) {
				$item['outcome'] = 'done';
			} elseif ( 'php' === $type ) {
				$code = self::decode( (string) ( $row['snippet'] ?? '' ) );
				if ( self::looks_like_disable_comments_snippet( $code ) ) {
					$item['outcome'] = $on ? 'comments' : 'skip';
					$item['note']    = __( 'Replaced by Neo Tools → Disable comments, which is switched on during the import.', 'neo-pulse-wp' );
				} else {
					$item['outcome'] = $on ? 'blocker' : 'skip';
					$item['note']    = __( 'PHP snippet. Script Manager only outputs HTML and JavaScript, so this needs moving into a plugin or the theme.', 'neo-pulse-wp' );
				}
			} elseif ( in_array( $where, array( 'admin', 'manual' ), true ) ) {
				$item['outcome'] = $on ? 'blocker' : 'skip';
				$item['note']    = 'admin' === $where
					? __( 'Runs in the WordPress admin, which Script Manager does not do.', 'neo-pulse-wp' )
					: __( 'Placed with an HFCM shortcode, which stops working once HFCM is off.', 'neo-pulse-wp' );
			} else {
				$converted = self::to_rows( $row );
				if ( empty( $converted['rows'] ) ) {
					$item['outcome'] = $on ? 'blocker' : 'skip';
					$item['note']    = __( 'Empty snippet.', 'neo-pulse-wp' );
				} else {
					$item['outcome'] = 'active' === $converted['rows'][0]['status'] ? 'import' : 'import_off';
					$item['note']    = implode( ' ', $converted['notes'] );
				}
			}
			$items[] = $item;
		}

		$count = static function ( array $outcomes ) use ( $items ): int {
			return count(
				array_filter(
					$items,
					static function ( $i ) use ( $outcomes ) {
						return in_array( $i['outcome'], $outcomes, true );
					}
				)
			);
		};

		return array(
			'items'         => $items,
			'plugin_active' => ! empty( self::active_plugin_files() ),
			'importable'    => $count( array( 'import', 'import_off', 'comments' ) ),
			'blockers'      => $count( array( 'blocker' ) ),
			'pending'       => $count( array( 'import', 'import_off', 'comments', 'blocker' ) ),
		);
	}

	/**
	 * Import everything that can be imported; deactivate HFCM when nothing switched-on is left behind.
	 *
	 * Rows are saved switched off first and only switched on once HFCM is no longer active, so a
	 * snippet never runs twice (from HFCM and from Script Manager). When HFCM has to stay on
	 * (blockers or save errors), the imported rows stay off; "held_inactive" says how many.
	 *
	 * @return array{ok: bool, imported: int, comments: bool, deactivated: bool, blockers: array<int, string>, errors: array<int, string>, held_inactive: int}
	 */
	public static function run(): array {
		$plan     = self::plan();
		$map      = self::import_map();
		$rows_by  = array();
		foreach ( self::hfcm_rows() as $row ) {
			$rows_by[ (int) ( $row['script_id'] ?? 0 ) ] = $row;
		}

		$imported    = 0;
		$comments    = false;
		$errors      = array();
		$blockers    = array();
		$to_activate = array();

		foreach ( $plan['items'] as $item ) {
			$id = (int) $item['id'];
			switch ( $item['outcome'] ) {
				case 'blocker':
					$blockers[] = $item['name'];
					break;
				case 'comments':
					$comments = true;
					$map[ (string) $id ] = array();
					break;
				case 'import':
				case 'import_off':
					if ( ! isset( $rows_by[ $id ] ) ) {
						break;
					}
					$converted = self::to_rows( $rows_by[ $id ] );
					$new_ids   = array();
					foreach ( $converted['rows'] as $data ) {
						$data['name']   = self::unique_name( (string) $data['name'] );
						$wanted_active  = 'active' === ( $data['status'] ?? 'active' );
						$data['status'] = 'inactive';
						$result         = Neo_Pulse_Wp_Script_Manager::save( $data );
						if ( empty( $result['ok'] ) ) {
							$errors[] = sprintf( '%1$s: %2$s', $data['name'], (string) ( $result['error'] ?? __( 'could not be saved', 'neo-pulse-wp' ) ) );
							continue;
						}
						$new_ids[] = (int) $result['id'];
						if ( $wanted_active ) {
							$to_activate[] = (int) $result['id'];
						}
						++$imported;
					}
					if ( ! empty( $new_ids ) ) {
						$map[ (string) $id ] = $new_ids;
					}
					break;
			}
		}

		update_option( self::MAP_OPTION, $map, false );

		if ( $comments ) {
			// Neo Tools owns comment disabling (ndet_disable_comments).
			update_option( 'ndet_disable_comments', 1 );
		}

		$deactivated = false;
		if ( empty( $errors ) && empty( $blockers ) ) {
			$files = self::active_plugin_files();
			if ( ! empty( $files ) ) {
				deactivate_plugins( $files );
				$deactivated = empty( self::active_plugin_files() );
			}
		}

		// Switch the imported snippets on only once HFCM no longer runs them.
		$held_inactive = 0;
		if ( ! empty( $to_activate ) ) {
			if ( empty( self::active_plugin_files() ) ) {
				Neo_Pulse_Wp_Script_Manager::bulk_action( $to_activate, 'activate' );
			} else {
				$held_inactive = count( $to_activate );
			}
		}

		return array(
			'ok'            => empty( $errors ),
			'imported'      => $imported,
			'comments'      => $comments,
			'deactivated'   => $deactivated,
			'blockers'      => $blockers,
			'errors'        => $errors,
			'held_inactive' => $held_inactive,
		);
	}

	/**
	 * HFCM (free and Pro) stores snippet code HTML-escaped.
	 */
	private static function decode( string $code ): string {
		return html_entity_decode( $code, ENT_QUOTES | ENT_HTML5, 'UTF-8' );
	}

	private static function unique_name( string $name ): string {
		$name = Neo_Pulse_Wp_Script_Manager::normalize_name( $name );
		if ( ! Neo_Pulse_Wp_Script_Manager::get_by_name( $name ) ) {
			return $name;
		}
		$suffix = 2;
		while ( Neo_Pulse_Wp_Script_Manager::get_by_name( $name . ' (HFCM ' . $suffix . ')' ) ) {
			++$suffix;
		}
		return $name . ' (HFCM ' . $suffix . ')';
	}

	/**
	 * Convert one HFCM row to Script Manager rows (one per placement).
	 *
	 * @param array<string, mixed> $row HFCM row.
	 * @return array{rows: array<int, array<string, mixed>>, notes: array<int, string>}
	 */
	public static function to_rows( array $row ): array {
		$notes = array();
		$code  = trim( self::decode( (string) ( $row['snippet'] ?? '' ) ) );
		if ( '' === $code ) {
			return array( 'rows' => array(), 'notes' => $notes );
		}

		$type = strtolower( (string) ( $row['snippet_type'] ?? 'html' ) );
		if ( 'js' === $type && false === stripos( $code, '<script' ) && false === stripos( $code, '<noscript' ) ) {
			$code = "<script>\n" . $code . "\n</script>";
		} elseif ( 'css' === $type && false === stripos( $code, '<style' ) ) {
			$code = "<style>\n" . $code . "\n</style>";
		}

		$status = 'active' === strtolower( (string) ( $row['status'] ?? 'active' ) ) ? 'active' : 'inactive';

		$include = self::empty_targets();
		$exclude = self::empty_targets();
		$mode    = 'all';
		$where   = strtolower( (string) ( $row['display_on'] ?? 'all' ) );

		switch ( $where ) {
			case 's_pages':
				$include['posts'] = self::id_list( $row['s_pages'] ?? '' );
				break;
			case 's_posts':
				$include['posts'] = self::id_list( $row['s_posts'] ?? '' );
				break;
			case 's_custom_posts':
				$include['post_types'] = self::slug_list( $row['s_custom_posts'] ?? '' );
				break;
			case 's_categories':
				$terms = self::id_list( $row['s_categories'] ?? '' );
				if ( $terms ) {
					$include['taxonomies'][] = array( 'taxonomy' => 'category', 'terms' => $terms );
				}
				break;
			case 's_tags':
				$terms = self::id_list( $row['s_tags'] ?? '' );
				if ( $terms ) {
					$include['taxonomies'][] = array( 'taxonomy' => 'post_tag', 'terms' => $terms );
				}
				break;
			case 's_is_home':
				$include['special'] = array( 'front_page', 'blog' );
				break;
			case 's_is_search':
				$include['special'] = array( 'search' );
				break;
			case 's_is_archive':
				$include['special'] = array( 'archive' );
				break;
			case 'latest_posts':
				$count            = max( 1, (int) ( $row['lp_count'] ?? 5 ) );
				$include['posts'] = get_posts(
					array(
						'numberposts' => $count,
						'fields'      => 'ids',
						'post_status' => 'publish',
					)
				);
				$notes[] = sprintf(
					/* translators: %d: number of posts */
					__( 'Set to the %d latest posts as of the import; it will not follow new posts.', 'neo-pulse-wp' ),
					$count
				);
				break;
			default:
				$exclude['posts'] = array_merge( self::id_list( $row['ex_pages'] ?? '' ), self::id_list( $row['ex_posts'] ?? '' ) );
				break;
		}

		if ( 'all' !== $where && '' !== $where ) {
			$mode = 'include';
			$has  = ! empty( $include['posts'] ) || ! empty( $include['post_types'] ) || ! empty( $include['taxonomies'] ) || ! empty( $include['special'] );
			if ( ! $has ) {
				// HFCM shows a "selected pages" snippet with no pages selected nowhere. Keep it that way.
				$status  = 'inactive';
				$notes[] = __( 'Set to specific pages in HFCM but none were selected, so it was not showing anywhere. Imported switched off.', 'neo-pulse-wp' );
				$mode    = 'all';
			}
		}

		$device = strtolower( (string) ( $row['device_type'] ?? 'both' ) );
		$device = in_array( $device, array( 'mobile', 'desktop' ), true ) ? $device : 'all';

		$display_to = strtolower( (string) ( $row['display_to'] ?? 'all' ) );
		$logged_in  = 'logged-in' === $display_to ? 'only' : ( 'non-logged-in' === $display_to ? 'exclude' : 'all' );

		$location = strtolower( (string) ( $row['location'] ?? 'header' ) );
		switch ( $location ) {
			case 'footer':
				$placements = array( 'footer' );
				break;
			case 'body_open':
			case 'before_content':
				$placements = array( 'body' );
				if ( 'before_content' === $location ) {
					$notes[] = __( 'HFCM placed this before the post content; Script Manager puts it at the top of the page body.', 'neo-pulse-wp' );
				}
				break;
			case 'after_content':
				$placements = array( 'footer' );
				$notes[]    = __( 'HFCM placed this after the post content; Script Manager puts it in the footer.', 'neo-pulse-wp' );
				break;
			case 'everywhere':
				$placements = array( 'header' );
				break;
			default:
				$placements = array( 'header' );
		}

		$name     = isset( $row['name'] ) && '' !== (string) $row['name'] ? (string) $row['name'] : __( 'Imported snippet', 'neo-pulse-wp' );
		$priority = isset( $row['priority'] ) && is_numeric( $row['priority'] ) ? (int) $row['priority'] : 10;

		$rows = array();
		foreach ( $placements as $placement ) {
			$rows[] = array(
				'name'          => $name,
				'placement'     => $placement,
				'code'          => $code,
				'status'        => $status,
				'priority'      => max( 0, min( 9999, $priority ) ),
				'category'      => self::CATEGORY,
				'display_rules' => array(
					'mode'      => $mode,
					'include'   => $include,
					'exclude'   => $exclude,
					'device'    => $device,
					'logged_in' => $logged_in,
				),
			);
		}

		return array( 'rows' => $rows, 'notes' => $notes );
	}

	/**
	 * @return array<string, array<int, mixed>>
	 */
	private static function empty_targets(): array {
		return array(
			'posts'      => array(),
			'post_types' => array(),
			'taxonomies' => array(),
			'archives'   => array(),
			'special'    => array(),
		);
	}

	/**
	 * HFCM stores ID lists as JSON ("[12,34]") or comma-separated text.
	 *
	 * @param mixed $raw Raw list.
	 * @return array<int, int>
	 */
	private static function id_list( $raw ): array {
		$items = is_array( $raw ) ? $raw : json_decode( (string) $raw, true );
		if ( ! is_array( $items ) ) {
			$items = preg_split( '/[\s,]+/', (string) $raw );
		}
		$ids = array();
		foreach ( (array) $items as $item ) {
			$id = is_array( $item ) ? (int) ( $item['id'] ?? 0 ) : (int) $item;
			if ( $id > 0 ) {
				$ids[] = $id;
			}
		}
		return array_values( array_unique( $ids ) );
	}

	/**
	 * @param mixed $raw Raw list.
	 * @return array<int, string>
	 */
	private static function slug_list( $raw ): array {
		$items = is_array( $raw ) ? $raw : json_decode( (string) $raw, true );
		if ( ! is_array( $items ) ) {
			$items = preg_split( '/[\s,]+/', (string) $raw );
		}
		$out = array();
		foreach ( (array) $items as $item ) {
			$slug = sanitize_key( is_array( $item ) ? (string) ( $item['slug'] ?? '' ) : (string) $item );
			if ( '' !== $slug ) {
				$out[] = $slug;
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * Whether a PHP snippet is the standard "disable comments" snippet.
	 *
	 * @param string $code Decoded PHP code.
	 */
	public static function looks_like_disable_comments_snippet( string $code ): bool {
		$code = strtolower( $code );
		return false !== strpos( $code, 'comments_open' )
			&& ( false !== strpos( $code, 'edit-comments.php' ) || false !== strpos( $code, 'remove_post_type_support' ) );
	}
}
