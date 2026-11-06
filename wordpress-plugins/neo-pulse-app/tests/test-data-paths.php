<?php
/**
 * Standalone CLI tests for the neo-pulse-data root contract (Wave 1, C4):
 * the data root never resolves inside the web-readable uploads dir, the env
 * override wins, and the one-time migration copies, verifies, locks, and
 * empties the legacy uploads folder.
 *
 * Run via: php wordpress-plugins/neo-pulse-app/tests/test-data-paths.php
 */

$tmp_root = sys_get_temp_dir() . '/neo-pulse-data-paths-test-' . getmypid();
$abspath  = $tmp_root . '/site/';

define( 'ABSPATH', $abspath );

$GLOBALS['__options'] = array();

function get_option( $key ) {
	return $GLOBALS['__options'][ $key ] ?? false;
}
function update_option( $key, $value ) {
	$GLOBALS['__options'][ $key ] = $value;
	return true;
}
function add_action( ...$args ) {
	unset( $args );
	return true;
}
function esc_html( $text ) {
	return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
}
function trailingslashit( $value ) {
	return rtrim( (string) $value, '/' ) . '/';
}
function wp_upload_dir() {
	return array( 'basedir' => ABSPATH . 'wp-content/uploads' );
}
function wp_mkdir_p( $dir ) {
	return is_dir( $dir ) || mkdir( $dir, 0777, true );
}
function sanitize_file_name( $name ) {
	return preg_replace( '/[^A-Za-z0-9._-]/', '-', (string) $name );
}

putenv( 'NEO_PULSE_DATA_DIR' );

require_once dirname( __DIR__ ) . '/includes/storage/class-neo-pulse-data-paths.php';
require_once dirname( __DIR__ ) . '/includes/storage/class-neo-pulse-data-migration.php';

$failures = array();
function norm_path( $p ) {
	return rtrim( str_replace( '\\', '/', $p ), '/' );
}
function check( $label, $cond ) {
	global $failures;
	if ( ! $cond ) {
		$failures[] = $label;
		echo "FAIL: {$label}\n";
	}
}
function remove_tree( $dir ) {
	if ( ! is_dir( $dir ) ) {
		return;
	}
	$iterator = new RecursiveIteratorIterator(
		new RecursiveDirectoryIterator( $dir, FilesystemIterator::SKIP_DOTS ),
		RecursiveIteratorIterator::CHILD_FIRST
	);
	foreach ( $iterator as $entry ) {
		if ( $entry->isDir() ) {
			rmdir( $entry->getPathname() );
		} else {
			unlink( $entry->getPathname() );
		}
	}
	rmdir( $dir );
}

// 1. Default root is above the web root, never inside uploads.
$root = Neo_Pulse_App_Data_Paths::root();
check( 'default root is dirname(ABSPATH)/neo-pulse-data', norm_path( $root ) === norm_path( $tmp_root . '/neo-pulse-data' ) );
check( 'default root is not inside uploads', strpos( str_replace( '\\', '/', $root ), 'wp-content/uploads' ) === false );
check( 'default root was created', is_dir( $root ) );

// 2. Env override wins.
$custom = $tmp_root . '/custom-data';
putenv( 'NEO_PULSE_DATA_DIR=' . $custom );
check( 'env override wins', norm_path( Neo_Pulse_App_Data_Paths::root() ) === norm_path( $custom ) );
putenv( 'NEO_PULSE_DATA_DIR' );

// 3. Migration copies, verifies, locks, and empties the legacy folder.
$legacy = wp_upload_dir()['basedir'] . '/neo-pulse-data';
wp_mkdir_p( $legacy . '/teams/1/executions' );
file_put_contents( $legacy . '/index.php', '<?php // silence' );
file_put_contents( $legacy . '/sites.json', '{"sites":[1,2,3]}' );
file_put_contents( $legacy . '/teams/1/executions/5.json', '{"done":true}' );

Neo_Pulse_App_Data_Migration::maybe_migrate();

$moved_sites = $tmp_root . '/neo-pulse-data/sites.json';
$moved_exec  = $tmp_root . '/neo-pulse-data/teams/1/executions/5.json';
check( 'migration set the done flag', (bool) get_option( Neo_Pulse_App_Data_Migration::OPTION_FLAG ) );
check( 'sites.json copied with identical content', is_readable( $moved_sites ) && file_get_contents( $moved_sites ) === '{"sites":[1,2,3]}' );
check( 'nested file copied with identical content', is_readable( $moved_exec ) && file_get_contents( $moved_exec ) === '{"done":true}' );
check( 'legacy data files emptied', ! file_exists( $legacy . '/sites.json' ) && ! file_exists( $legacy . '/teams/1/executions/5.json' ) );
check( 'legacy silence index preserved', is_readable( $legacy . '/index.php' ) );
check( 'legacy folder locked with deny rules', is_readable( $legacy . '/.htaccess' ) && strpos( (string) file_get_contents( $legacy . '/.htaccess' ), 'Require all denied' ) !== false );

// 4. Re-running is a no-op (idempotent).
Neo_Pulse_App_Data_Migration::maybe_migrate();
check( 'second migration run keeps copied data', is_readable( $moved_sites ) && file_get_contents( $moved_sites ) === '{"sites":[1,2,3]}' );

// 5. Fresh install (no legacy folder) still flags done and roots fine.
remove_tree( $legacy );
$GLOBALS['__options'] = array();
Neo_Pulse_App_Data_Migration::maybe_migrate();
check( 'fresh install sets the done flag', (bool) get_option( Neo_Pulse_App_Data_Migration::OPTION_FLAG ) );
check( 'fresh install root still outside uploads', strpos( str_replace( '\\', '/', Neo_Pulse_App_Data_Paths::root() ), 'wp-content/uploads' ) === false );

// 6. A held migration lock makes a concurrent call skip and keep legacy data.
$GLOBALS['__options'] = array();
wp_mkdir_p( $legacy );
file_put_contents( $legacy . '/sites.json', '{"sites":[9]}' );
$lock = fopen( Neo_Pulse_App_Data_Paths::root() . '/.migration.lock', 'c' );
flock( $lock, LOCK_EX );
Neo_Pulse_App_Data_Migration::maybe_migrate();
check( 'held lock keeps the legacy file in place', file_exists( $legacy . '/sites.json' ) );
check( 'held lock leaves the done flag unset', ! get_option( Neo_Pulse_App_Data_Migration::OPTION_FLAG ) );
flock( $lock, LOCK_UN );
fclose( $lock );

remove_tree( $tmp_root );

if ( $failures !== array() ) {
	echo 'DATA PATHS TESTS FAILED: ' . count( $failures ) . "\n";
	exit( 1 );
}
echo "ALL DATA PATHS TESTS PASSED\n";
