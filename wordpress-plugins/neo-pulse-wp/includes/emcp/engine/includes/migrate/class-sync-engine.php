<?php
/**
 * One-way sync: build a SCOPED .emcp (chosen tables and/or file roots) to push
 * to a paired live target, so an established site isn't wholesale-overwritten.
 *
 * Reuses the Phase-1 DB exporter + packager to build the archive and the Phase-2
 * migration engine to transfer + restore it. The connector applies only what the
 * archive contains (partial restore), and skips search-replace when no database
 * is present (a files-only sync must not touch the live DB).
 *
 * @package EMCP_Tools
 * @since   3.14.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Sync engine (source side).
 *
 * @since 3.14.0
 */
class EMCP_Tools_Sync_Engine {

	/** Named file roots the UI offers. */
	const ROOTS = array(
		'themes'  => 'wp-content/themes',
		'plugins' => 'wp-content/plugins',
		'uploads' => 'wp-content/uploads',
	);

	/** Paths never packed (caches, other backups, the connector's own dirs). */
	const EXCLUDES = array(
		'wp-content/cache',
		'wp-content/emcp-backups',
		'wp-content/emcp-backups-*',
		'wp-content/emcp-connector-inbox',
		'wp-content/emcp-connector-inbox-*',
		'wp-content/emcp-connector-work-*',
		'wp-content/emcp-connector-work',
		'wp-content/uploads/emcp-originals',
		'node_modules',
	);

	/**
	 * Normalize a caller scope into `{db, files}`.
	 *
	 * @param array $in Raw scope.
	 * @return array {db: 'all'|string[], files: 'all'|'none'|string[]}.
	 */
	public static function normalize_scope( $in ) {
		$in = is_array( $in ) ? $in : array();

		// Database.
		$db = isset( $in['db'] ) ? $in['db'] : 'all';
		if ( is_array( $db ) ) {
			$db = array_values( array_unique( array_filter( array_map( 'strval', $db ) ) ) );
			if ( empty( $db ) ) {
				$db = 'none';
			}
		} elseif ( 'none' !== $db ) {
			$db = 'all';
		}

		// Files.
		$files = isset( $in['files'] ) ? $in['files'] : 'all';
		if ( is_array( $files ) ) {
			$files = array_values( array_unique( array_filter( array_map( 'strval', $files ) ) ) );
			if ( empty( $files ) ) {
				$files = 'none';
			}
		} elseif ( ! in_array( $files, array( 'all', 'none' ), true ) ) {
			$files = 'all';
		}

		return array( 'db' => $db, 'files' => $files );
	}

	/**
	 * Resolve a file-root key or safe relative path to an ABSPATH-relative dir.
	 *
	 * @param string $root Root key or relative path.
	 * @return string|null Relative path, or null if unknown/unsafe.
	 */
	public static function file_root_path( $root ) {
		$root = (string) $root;
		if ( '' === $root ) {
			return null;
		}
		if ( isset( self::ROOTS[ $root ] ) ) {
			return self::ROOTS[ $root ];
		}
		// A pass-through relative path: no traversal, no absolute, must exist under ABSPATH.
		$norm = str_replace( '\\', '/', $root );
		if ( false !== strpos( $norm, '..' ) ) {
			return null;
		}
		if ( 0 === strpos( $norm, '/' ) || preg_match( '#^[a-zA-Z]:#', $norm ) ) {
			return null; // absolute.
		}
		return untrailingslashit( ltrim( $norm, '/' ) );
	}

	/**
	 * Tables available to sync (name + size), for the UI.
	 *
	 * @return array
	 */
	public static function syncable_tables() {
		global $wpdb;
		$out = array();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.NotPrepared
		$rows = $wpdb->get_results( 'SHOW TABLE STATUS', ARRAY_A );
		foreach ( (array) $rows as $r ) {
			if ( 0 !== strpos( $r['Name'], $wpdb->prefix ) ) {
				continue;
			}
			$out[] = array(
				'name' => $r['Name'],
				'rows' => (int) $r['Rows'],
				'size' => (int) $r['Data_length'] + (int) $r['Index_length'],
			);
		}
		return $out;
	}

	/**
	 * The named file roots (label + key), for the UI.
	 *
	 * @return array
	 */
	public static function syncable_file_roots() {
		$out = array();
		foreach ( self::ROOTS as $key => $rel ) {
			$out[] = array( 'key' => $key, 'label' => ucfirst( $key ), 'path' => $rel );
		}
		return $out;
	}

	/**
	 * Build a scoped `.emcp` in $out_dir. Returns its path.
	 *
	 * @param array  $scope   Caller scope (normalized internally).
	 * @param string $out_dir Directory to write the archive + temp SQL.
	 * @return string|WP_Error
	 */
	public static function build_scoped_emcp( $scope, $out_dir ) {
		$scope = self::normalize_scope( $scope );
		if ( 'none' === $scope['db'] && 'none' === $scope['files'] ) {
			return new WP_Error( 'emcp_sync_empty', __( 'Nothing selected to sync.', 'emcp-tools' ) );
		}
		// Resolve chosen tables first: an empty list means "all tables" to the exporter,
		// so a selection that matches nothing must stop here, not push the whole database.
		$tables = ( is_array( $scope['db'] ) ) ? self::resolve_tables( $scope['db'] ) : array();
		if ( is_array( $scope['db'] ) && ! $tables ) {
			return new WP_Error( 'emcp_sync_no_tables', __( 'None of the chosen tables exist on this site.', 'emcp-tools' ) );
		}
		if ( ! EMCP_Tools_Helper::ensure_directory( $out_dir ) ) {
			return new WP_Error( 'emcp_sync_dir', __( 'Cannot create the sync working directory.', 'emcp-tools' ) );
		}

		global $wpdb;
		$manifest = array(
			'version'   => defined( 'EMCP_TOOLS_VERSION' ) ? EMCP_TOOLS_VERSION : '',
			'type'      => 'sync',
			'scope'     => $scope,
			'wordpress' => array(
				'site_url'  => site_url(),
				'home_url'  => home_url(),
				'db_prefix' => $wpdb->prefix,
			),
		);

		$pkg   = trailingslashit( $out_dir ) . 'sync-' . gmdate( 'Ymd-His' ) . '.emcp';
		$state = EMCP_Tools_Packager::init_stream( $pkg, $manifest );

		// Database.
		if ( 'none' !== $scope['db'] ) {
			$sql_file = trailingslashit( $out_dir ) . 'database.sql';
			$res      = EMCP_Tools_DB_Exporter::export( $sql_file, $tables );
			if ( is_wp_error( $res ) ) {
				return $res;
			}
			$state = EMCP_Tools_Packager::add_file( $state, $sql_file, 'database.sql' );
			@unlink( $sql_file ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		}

		// Files.
		if ( 'none' !== $scope['files'] ) {
			$roots = ( 'all' === $scope['files'] ) ? array( 'wp-content' ) : self::resolve_roots( $scope['files'] );
			foreach ( $roots as $rel ) {
				$state = self::add_tree( $state, $rel );
			}
		}

		if ( ! EMCP_Tools_Packager::finalize( $state ) ) {
			return new WP_Error( 'emcp_sync_finalize', __( 'Failed to finalize the sync archive.', 'emcp-tools' ) );
		}
		return $pkg;
	}

	/**
	 * Resolve requested table names to existing prefixed tables.
	 *
	 * @param array $names Requested names (prefixed or not).
	 * @return array
	 */
	private static function resolve_tables( $names ) {
		global $wpdb;
		$all = array();
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching,WordPress.DB.PreparedSQL.NotPrepared
		foreach ( (array) $wpdb->get_col( 'SHOW TABLES' ) as $t ) {
			$all[ $t ] = true;
		}
		$out = array();
		foreach ( $names as $n ) {
			$candidate = isset( $all[ $n ] ) ? $n : $wpdb->prefix . $n;
			if ( isset( $all[ $candidate ] ) ) {
				$out[] = $candidate;
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * Resolve requested file roots to safe ABSPATH-relative dirs.
	 *
	 * @param array $roots Requested roots.
	 * @return array
	 */
	private static function resolve_roots( $roots ) {
		$out = array();
		foreach ( $roots as $r ) {
			$rel = self::file_root_path( $r );
			if ( null !== $rel ) {
				$out[] = $rel;
			}
		}
		return array_values( array_unique( $out ) );
	}

	/**
	 * Add every file under an ABSPATH-relative dir to the package.
	 *
	 * @param array  $state Package state.
	 * @param string $rel   ABSPATH-relative directory.
	 * @return array Updated state.
	 */
	private static function add_tree( $state, $rel ) {
		$base = trailingslashit( ABSPATH ) . $rel;
		if ( ! is_dir( $base ) ) {
			return $state;
		}
		$it = new RecursiveIteratorIterator(
			new RecursiveDirectoryIterator( $base, FilesystemIterator::SKIP_DOTS ),
			RecursiveIteratorIterator::LEAVES_ONLY
		);
		$abspath = wp_normalize_path( trailingslashit( ABSPATH ) );
		foreach ( $it as $file ) {
			if ( ! $file->isFile() ) {
				continue;
			}
			$abs      = wp_normalize_path( $file->getPathname() );
			$relative = ltrim( str_replace( $abspath, '', $abs ), '/' );
			if ( EMCP_Tools_Helper::is_path_excluded( $relative, array_merge( self::EXCLUDES, class_exists( 'EMCP_Tools_Backup_Location' ) ? EMCP_Tools_Backup_Location::excludes() : array() ) ) ) {
				continue;
			}
			$prefix = dirname( $relative );
			$state  = EMCP_Tools_Packager::add_file( $state, $abs, basename( $relative ), '.' === $prefix ? '' : $prefix );
		}
		return $state;
	}
}
