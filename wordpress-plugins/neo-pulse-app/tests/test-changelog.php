<?php
/**
 * Standalone CLI tests for the Changelog route handlers: source packs
 * merge into the commit pool without duplicates, entries save and list
 * newest first, re-saving an entry replaces it, coverage shrinks the
 * uncovered list, and logged-out requests are refused.
 *
 * Run via: php wordpress-plugins/neo-pulse-app/tests/test-changelog.php
 */

$tmp_root = sys_get_temp_dir() . '/neo-pulse-changelog-test-' . getmypid();
$abspath  = $tmp_root . '/site/';

define( 'ABSPATH', $abspath );

function wp_mkdir_p( $dir ) {
	return is_dir( $dir ) || mkdir( $dir, 0777, true );
}
function sanitize_file_name( $name ) {
	return preg_replace( '/[^A-Za-z0-9._-]/', '-', (string) $name );
}
function wp_json_encode( $data, $options = 0 ) {
	return json_encode( $data, $options );
}
function wp_generate_password( $length = 12, $special_chars = true ) {
	unset( $special_chars );
	return substr( bin2hex( random_bytes( $length ) ), 0, $length );
}
function trailingslashit( $value ) {
	return rtrim( (string) $value, '/' ) . '/';
}
function wp_upload_dir() {
	return array( 'basedir' => ABSPATH . 'wp-content/uploads' );
}

putenv( 'NEO_PULSE_DATA_DIR=' . $tmp_root . '/neo-pulse-data' );

/** Boundary stub: the authenticated hub user. */
class Neo_Pulse_App_Auth_Session {
	public static $user = array( 'id' => 7 );
	public static function require_user(): ?array {
		return self::$user;
	}
}

/** Boundary stub: captures the JSON response instead of sending it. */
class Neo_Pulse_App_Api_Dispatcher {
	public static $last = null;
	public static function send_json( $data, int $status = 200 ): void {
		self::$last = array( 'status' => $status, 'data' => $data );
	}
}

require_once dirname( __DIR__ ) . '/includes/storage/class-neo-pulse-data-paths.php';
require_once dirname( __DIR__ ) . '/includes/storage/class-json-file-store.php';
require_once dirname( __DIR__ ) . '/includes/changelog/class-changelog-route-handlers.php';

$failures = array();
function check( $label, $cond ) {
	global $failures;
	if ( ! $cond ) {
		$failures[] = $label;
		echo "FAIL: {$label}\n";
	}
}
function dispatch( $route, $method, $body = array() ) {
	Neo_Pulse_App_Api_Dispatcher::$last = null;
	Neo_Pulse_App_Changelog_Route_Handlers::dispatch_http( $route, $method, $body );
	return Neo_Pulse_App_Api_Dispatcher::$last;
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

$pack = array(
	'commits' => array(
		array( 'hash' => 'aaa111', 'date' => '2026-10-30', 'subject' => 'Add export button', 'body' => '', 'files' => array( 'src/App.tsx' ) ),
		array( 'hash' => 'bbb222', 'date' => '2026-11-02', 'subject' => 'Fix login loop', 'body' => 'Details', 'files' => array( 'src/lib/api.ts' ) ),
		array( 'hash' => 'ccc333', 'date' => '2026-11-05', 'subject' => 'Speed up grid', 'body' => '', 'files' => array() ),
	),
);

// 1. Empty archive: no entries, no commits, nothing covered.
$res = dispatch( '', 'GET' );
check( 'archive responds 200', $res['status'] === 200 && $res['data']['ok'] === true );
check( 'entries start empty', $res['data']['entries'] === array() );
check( 'source starts empty', $res['data']['source']['commitCount'] === 0 && $res['data']['source']['uncoveredCount'] === 0 );
check( 'coveredThrough starts null', $res['data']['source']['coveredThrough'] === null );

// 2. Ingest a source pack.
$res = dispatch( 'source', 'POST', $pack );
check( 'ingest responds 200', $res['status'] === 200 );
check( 'pool holds 3 commits', $res['data']['source']['commitCount'] === 3 );
check( 'all 3 uncovered before any entry', $res['data']['source']['uncoveredCount'] === 3 );
check( 'latest commit date tracked', $res['data']['source']['latestCommitDate'] === '2026-11-05' );

// 3. Re-ingesting the same pack does not duplicate commits.
$res = dispatch( 'source', 'POST', $pack );
check( 're-ingest keeps 3 commits', $res['data']['source']['commitCount'] === 3 );

// 4. The generation feed returns uncovered commits oldest first.
$res = dispatch( 'source', 'GET' );
check( 'feed responds 200', $res['status'] === 200 );
check( 'feed has 3 commits', count( $res['data']['commits'] ) === 3 );
check( 'feed is oldest first', $res['data']['commits'][0]['hash'] === 'aaa111' && $res['data']['commits'][2]['hash'] === 'ccc333' );

// 5. Save an entry covering the first two commits.
$entry = array(
	'id'          => '2026-10-30..2026-11-02',
	'date'        => '2026-11-02',
	'rangeFrom'   => '2026-10-30',
	'rangeTo'     => '2026-11-02',
	'commitCount' => 2,
	'title'       => 'Export button and a login fix',
	'summary'     => 'Two changes shipped.',
	'highlights'  => array( 'Export button added' ),
	'sections'    => array( array( 'heading' => 'Fixes', 'items' => array( 'Login loop fixed' ) ) ),
);
$res = dispatch( 'entry', 'POST', array( 'entry' => $entry ) );
check( 'entry save responds 200', $res['status'] === 200 );
check( 'archive lists the entry', count( $res['data']['entries'] ) === 1 && $res['data']['entries'][0]['title'] === 'Export button and a login fix' );
check( 'coverage leaves 1 uncovered commit', $res['data']['source']['uncoveredCount'] === 1 );
check( 'coveredThrough is the entry range end', $res['data']['source']['coveredThrough'] === '2026-11-02' );

// 6. Re-saving the same entry id replaces it.
$entry['title'] = 'Export button and a login fix (revised)';
$res = dispatch( 'entry', 'POST', array( 'entry' => $entry ) );
check( 're-save keeps one entry', count( $res['data']['entries'] ) === 1 );
check( 're-save updates the title', $res['data']['entries'][0]['title'] === 'Export button and a login fix (revised)' );

// 7. A second entry lists newest first.
$entry2 = $entry;
$entry2['id'] = '2026-11-03..2026-11-05';
$entry2['date'] = '2026-11-05';
$entry2['rangeFrom'] = '2026-11-03';
$entry2['rangeTo'] = '2026-11-05';
$entry2['title'] = 'Grid speed';
dispatch( 'entry', 'POST', array( 'entry' => $entry2 ) );
$res = dispatch( '', 'GET' );
check( 'entries list newest first', $res['data']['entries'][0]['id'] === '2026-11-03..2026-11-05' );
check( 'all commits covered after second entry', $res['data']['source']['uncoveredCount'] === 0 );

// 8. Validation and unknown routes.
$res = dispatch( 'entry', 'POST', array( 'entry' => array( 'id' => 'x' ) ) );
check( 'entry without date and title is a 400', $res['status'] === 400 && $res['data']['ok'] === false );
$res = dispatch( 'source', 'POST', array() );
check( 'source without commits is a 400', $res['status'] === 400 );
$res = dispatch( 'bogus', 'GET' );
check( 'unknown route is a 404', $res['status'] === 404 );

// 9. Logged-out requests are refused.
Neo_Pulse_App_Auth_Session::$user = null;
$res = dispatch( '', 'GET' );
check( 'logged-out request is a 401', $res['status'] === 401 && $res['data']['ok'] === false );

putenv( 'NEO_PULSE_DATA_DIR' );
remove_tree( $tmp_root );

if ( $failures !== array() ) {
	echo 'CHANGELOG TESTS FAILED: ' . count( $failures ) . "\n";
	exit( 1 );
}
echo "ALL CHANGELOG TESTS PASSED\n";
