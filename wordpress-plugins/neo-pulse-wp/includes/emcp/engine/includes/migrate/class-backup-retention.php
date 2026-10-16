<?php
/**
 * Retention for every backup, and a daily cleanup of what backups leave behind.
 *
 * Scheduled backups keep their own "keep N" setting. This adds a limit for
 * the rest (backups made by hand or by an AI agent over MCP, which used to
 * pile up forever), an optional size cap over all completed backups, and a
 * daily sweep of day-old leftovers: folders of failed or vanished backups,
 * abandoned restore uploads and sync scratch space. It also moves backups out
 * of the old wp-content/emcp-backups folder (EMCP_Tools_Backup_Location).
 *
 * @package EMCP_Tools
 * @since   3.20.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

final class EMCP_Tools_Backup_Retention {

	const OPTION   = 'emcp_tools_backup_retention';
	const CRON     = 'emcp_tools_backup_cleanup';
	const MOVED_AT = 'emcp_tools_backup_legacy_try';
	const ID_RE    = '/^emcp_\d{8}_\d{6}_[a-f0-9]{8}$/';

	/** Wire the hooks (from the Migrate module's register()). */
	public static function init(): void {
		add_action( 'emcp_tools_backup_completed', array( __CLASS__, 'apply' ) );
		add_action( self::CRON, array( __CLASS__, 'daily' ) );
		add_action( 'admin_init', array( __CLASS__, 'maybe_move_legacy' ) );
		if ( function_exists( 'wp_next_scheduled' ) && ! wp_next_scheduled( self::CRON ) ) {
			wp_schedule_event( time() + HOUR_IN_SECONDS, 'daily', self::CRON );
		}
	}

	/** Remove the cron (module switched off). */
	public static function unschedule(): void {
		if ( function_exists( 'wp_clear_scheduled_hook' ) ) {
			wp_clear_scheduled_hook( self::CRON );
		}
	}

	/**
	 * Stored limits.
	 *
	 * @return array{keep: int, max_gb: int}
	 */
	public static function get(): array {
		$raw = get_option( self::OPTION, array() );
		return self::sanitize( is_array( $raw ) ? $raw : array() );
	}

	/**
	 * Clamp limits: keep 1 to 100 backups, cap 0 (off) to 5000 GB.
	 *
	 * @param array $raw Input.
	 * @return array{keep: int, max_gb: int}
	 */
	public static function sanitize( array $raw ): array {
		return array(
			'keep'   => max( 1, min( 100, (int) ( $raw['keep'] ?? 10 ) ) ),
			'max_gb' => max( 0, min( 5000, (int) ( $raw['max_gb'] ?? 0 ) ) ),
		);
	}

	/**
	 * Save limits and apply them now.
	 *
	 * @param array $raw Input.
	 * @return array{keep: int, max_gb: int}
	 */
	public static function save( array $raw ): array {
		$clean = self::sanitize( $raw );
		update_option( self::OPTION, $clean, false );
		self::apply();
		return $clean;
	}

	/**
	 * Backups the limits remove. Pure.
	 *
	 * Manual and MCP backups beyond `keep` go first (scheduled ones follow
	 * their own setting); then, with a size cap, the oldest completed backups
	 * of any kind until the rest fit. The newest backup always stays.
	 *
	 * @param array $rows     Records (backup_id, status, source, created_at, total_size).
	 * @param array $settings Limits.
	 * @return string[] Backup ids, oldest first.
	 */
	public static function to_delete( array $rows, array $settings ): array {
		$done = array_values( array_filter( $rows, static fn( $r ) => 'completed' === ( $r['status'] ?? '' ) ) );
		usort(
			$done,
			static fn( $a, $b ) => strcmp( (string) $b['created_at'] . $b['backup_id'], (string) $a['created_at'] . $a['backup_id'] )
		);
		$gone  = array();
		$other = array_values( array_filter( $done, static fn( $r ) => 'scheduled' !== ( $r['source'] ?? '' ) ) );
		foreach ( array_slice( $other, max( 1, (int) $settings['keep'] ) ) as $r ) {
			$gone[ $r['backup_id'] ] = true;
		}
		$cap = (int) $settings['max_gb'] * 1073741824;
		if ( $cap > 0 ) {
			$left  = array_values( array_filter( $done, static fn( $r ) => ! isset( $gone[ $r['backup_id'] ] ) ) );
			$total = array_sum( array_map( static fn( $r ) => (int) ( $r['total_size'] ?? 0 ), $left ) );
			for ( $i = count( $left ) - 1; $i > 0 && $total > $cap; $i-- ) {
				$gone[ $left[ $i ]['backup_id'] ] = true;
				$total                           -= (int) ( $left[ $i ]['total_size'] ?? 0 );
			}
		}
		$order = array_reverse( array_column( $done, 'backup_id' ) );
		return array_values( array_filter( $order, static fn( $id ) => isset( $gone[ $id ] ) ) );
	}

	/**
	 * Every backup record.
	 *
	 * @return array
	 */
	private static function rows(): array {
		global $wpdb;
		$rows = $wpdb->get_results( 'SELECT backup_id, status, source, created_at, total_size FROM ' . $wpdb->prefix . 'emcp_migrate_backups', ARRAY_A ); // phpcs:ignore WordPress.DB
		return is_array( $rows ) ? $rows : array();
	}

	/**
	 * Apply the limits (after every backup, on save and daily).
	 *
	 * @return int Deleted.
	 */
	public static function apply(): int {
		if ( ! class_exists( 'EMCP_Tools_Backup_Engine' ) ) {
			return 0;
		}
		$n = 0;
		foreach ( self::to_delete( self::rows(), self::get() ) as $id ) {
			if ( ! EMCP_Tools_Backup_Engine::is_backup_busy( $id ) && EMCP_Tools_Backup_Engine::delete_backup( $id ) ) {
				++$n;
			}
		}
		return $n;
	}

	/**
	 * Delete day-old leftovers in the backup folder. A backup folder stays
	 * while its record exists; uploads in use by a restore stay.
	 *
	 * @param string   $dir        Backup folder.
	 * @param string[] $record_ids Backup ids that have a record.
	 * @param string[] $active     Absolute paths a running job uses.
	 * @param int      $now        Time.
	 * @return string[] Deleted entries, relative to $dir.
	 */
	public static function cleanup_dir( string $dir, array $record_ids, array $active, int $now ): array {
		$dir    = rtrim( str_replace( '\\', '/', $dir ), '/' );
		$before = $now - DAY_IN_SECONDS;
		$active = array_map( static fn( $p ) => str_replace( '\\', '/', (string) $p ), $active );
		$gone   = array();
		if ( ! is_dir( $dir ) ) {
			return $gone;
		}
		foreach ( (array) scandir( $dir ) as $entry ) {
			$path = $dir . '/' . $entry;
			if ( ! is_dir( $path ) || in_array( $entry, array( '.', '..' ), true ) || (int) @filemtime( $path ) > $before ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors
				continue;
			}
			if ( ( 1 === preg_match( self::ID_RE, $entry ) && ! in_array( $entry, $record_ids, true ) ) || 'sync-tmp' === $entry ) {
				self::remove_tree( $path );
				$gone[] = $entry;
			}
		}
		if ( is_dir( $dir . '/uploads' ) ) {
			foreach ( (array) scandir( $dir . '/uploads' ) as $file ) {
				$path = $dir . '/uploads/' . $file;
				if ( is_file( $path ) && ! in_array( $file, array( '.htaccess', 'index.php', 'index.html', 'web.config' ), true )
					&& ! in_array( $path, $active, true ) && (int) @filemtime( $path ) <= $before ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors
					@unlink( $path ); // phpcs:ignore WordPress.PHP.NoSilencedErrors, WordPress.WP.AlternativeFunctions
					$gone[] = 'uploads/' . $file;
				}
			}
		}
		return $gone;
	}

	/**
	 * Remove a folder and everything in it.
	 *
	 * @param string $dir Folder.
	 */
	private static function remove_tree( string $dir ): void {
		$items = new RecursiveIteratorIterator( new RecursiveDirectoryIterator( $dir, FilesystemIterator::SKIP_DOTS ), RecursiveIteratorIterator::CHILD_FIRST );
		foreach ( $items as $item ) {
			$item->isDir() ? @rmdir( $item->getPathname() ) : @unlink( $item->getPathname() ); // phpcs:ignore WordPress.PHP.NoSilencedErrors, WordPress.WP.AlternativeFunctions
		}
		@rmdir( $dir ); // phpcs:ignore WordPress.PHP.NoSilencedErrors, WordPress.WP.AlternativeFunctions
	}

	/**
	 * Absolute paths running jobs use, and whether any job runs.
	 *
	 * @return array{busy: bool, paths: string[]}
	 */
	private static function jobs(): array {
		$paths = array();
		$jobs  = class_exists( 'EMCP_Tools_Job_Manager' ) ? (array) EMCP_Tools_Job_Manager::get_active_jobs() : array();
		foreach ( $jobs as $job ) {
			$data = json_decode( (string) ( $job->data ?? '' ), true );
			foreach ( array( 'emcp_source', 'backup_file' ) as $key ) {
				if ( is_array( $data ) && ! empty( $data[ $key ] ) ) {
					$paths[] = (string) $data[ $key ];
				}
			}
		}
		$token = EMCP_Tools_Backup_Location::dir() . '/restore-token.php';
		return array( 'busy' => $jobs || file_exists( $token ) || file_exists( EMCP_Tools_Backup_Location::legacy_dir() . '/restore-token.php' ), 'paths' => $paths );
	}

	/**
	 * Daily: move old backups, delete leftovers and failed partial backups,
	 * apply the limits.
	 *
	 * @return array{moved: int, left: int, cleaned: int, deleted: int}
	 */
	public static function daily(): array {
		$jobs  = self::jobs();
		$move  = EMCP_Tools_Backup_Location::migrate_legacy( $jobs['busy'] );
		$rows  = self::rows();
		$clean = 0;
		foreach ( $rows as $r ) {
			if ( in_array( $r['status'] ?? '', array( 'failed', 'cancelled' ), true ) && strtotime( (string) $r['created_at'] . ' UTC' ) < time() - DAY_IN_SECONDS && class_exists( 'EMCP_Tools_Backup_Engine' ) ) {
				EMCP_Tools_Backup_Engine::delete_backup_files( (string) $r['backup_id'] );
			}
		}
		if ( ! $jobs['busy'] ) {
			$clean = count( self::cleanup_dir( EMCP_Tools_Backup_Location::dir(), array_column( $rows, 'backup_id' ), $jobs['paths'], time() ) );
		}
		EMCP_Tools_Backup_Location::web_check();
		return $move + array( 'cleaned' => $clean, 'deleted' => self::apply() );
	}

	/** On wp-admin pages, try moving old backups at most once an hour. */
	public static function maybe_move_legacy(): void {
		if ( ! current_user_can( 'manage_options' ) || ! is_dir( EMCP_Tools_Backup_Location::legacy_dir() ) || get_transient( self::MOVED_AT ) ) {
			return;
		}
		set_transient( self::MOVED_AT, 1, HOUR_IN_SECONDS );
		$moved = EMCP_Tools_Backup_Location::migrate_legacy( self::jobs()['busy'] );
		if ( $moved['moved'] > 0 ) {
			delete_option( EMCP_Tools_Backup_Location::CHECK_OPTION );
		}
	}

	/**
	 * Disk used by completed backups and pending restore uploads.
	 *
	 * @return int Bytes.
	 */
	public static function usage(): int {
		$bytes = 0;
		foreach ( self::rows() as $r ) {
			$bytes += 'completed' === ( $r['status'] ?? '' ) ? (int) ( $r['total_size'] ?? 0 ) : 0;
		}
		$uploads = EMCP_Tools_Backup_Location::dir() . '/uploads';
		foreach ( is_dir( $uploads ) ? (array) scandir( $uploads ) : array() as $file ) {
			$bytes += is_file( $uploads . '/' . $file ) ? (int) filesize( $uploads . '/' . $file ) : 0;
		}
		return $bytes;
	}
}
