<?php
/**
 * Standalone CLI tests for the Agent Library route handlers: the state
 * payload matches the app contract, toggles persist to the private data
 * root, settings save the model, and the stored OpenRouter key never
 * appears in a response (only configured plus the last four characters).
 * The store's locked update is covered too: increments never get lost.
 *
 * Run via: php wordpress-plugins/neo-pulse-app/tests/test-agent-library.php
 */

$tmp_root = sys_get_temp_dir() . '/neo-pulse-agent-library-test-' . getmypid();
$abspath  = $tmp_root . '/site/';

define( 'ABSPATH', $abspath );

function wp_mkdir_p( $dir ) {
	return is_dir( $dir ) || mkdir( $dir, 0777, true );
}
function sanitize_file_name( $name ) {
	return preg_replace( '/[^A-Za-z0-9._-]/', '-', (string) $name );
}
function sanitize_text_field( $value ) {
	return trim( (string) preg_replace( '/[\r\n\t ]+/', ' ', strip_tags( (string) $value ) ) );
}
function sanitize_email( $value ) {
	return trim( (string) $value );
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

/** Boundary stub: the server-resolved OpenRouter key. */
class Neo_Pulse_App_Secrets {
	public static $key = '';
	public static function openrouter_api_key(): string {
		return self::$key;
	}
}

require_once dirname( __DIR__ ) . '/includes/storage/class-neo-pulse-data-paths.php';
require_once dirname( __DIR__ ) . '/includes/storage/class-json-file-store.php';
require_once dirname( __DIR__ ) . '/includes/agent-library/class-agent-library-route-handlers.php';

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
	Neo_Pulse_App_Agent_Library_Route_Handlers::dispatch_http( $route, $method, $body );
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

// 1. Fresh state: catalog served, no overrides, key unconfigured.
$res = dispatch( '', 'GET' );
check( 'state responds 200', $res['status'] === 200 );
check( 'state ok flag', $res['data']['ok'] === true );
check( 'catalog has the 4 hub agents', count( $res['data']['hubAgents'] ) === 4 );
check( 'catalog first agent is meeting-notes', $res['data']['hubAgents'][0]['id'] === 'meeting-notes' );
check( 'catalog rows are slack-hub domain', $res['data']['hubAgents'][0]['domain'] === 'slack-hub' );
check( 'overrides start empty', $res['data']['overrides'] === array() || $res['data']['overrides'] == new stdClass() );
check( 'key unconfigured without a server key', $res['data']['settings']['openRouter']['configured'] === false );
check( 'suffix null without a key', $res['data']['settings']['openRouter']['suffix'] === null );
check( 'default model is the hub flash model', $res['data']['settings']['openRouterModel'] === 'deepseek/deepseek-v4.1-flash' );

// 2. The server-resolved key drives configured plus suffix (never the key itself).
Neo_Pulse_App_Secrets::$key = 'sk-or-server-1234567890abcd';
$res = dispatch( '', 'GET' );
check( 'server key marks configured', $res['data']['settings']['openRouter']['configured'] === true );
check( 'suffix is the last four of the server key', $res['data']['settings']['openRouter']['suffix'] === 'abcd' );
check( 'response never contains the full server key', strpos( (string) json_encode( $res['data'] ), 'sk-or-server-1234567890abcd' ) === false );

// 3. Toggle persists to the private data root and sticks across reads.
$res = dispatch( 'toggle', 'POST', array( 'agentId' => 'write', 'enabled' => false ) );
check( 'toggle responds 200', $res['status'] === 200 );
check( 'toggle echoes the override', $res['data']['overrides']['write'] === false );
$stored_path = Neo_Pulse_App_Data_Paths::agent_library_path();
check( 'state file lives in the private data root', strpos( str_replace( '\\', '/', $stored_path ), 'neo-pulse-data' ) !== false );
check( 'state file is not under uploads', strpos( str_replace( '\\', '/', $stored_path ), 'wp-content/uploads' ) === false );
$res = dispatch( '', 'GET' );
check( 'override persists across requests', $res['data']['overrides']['write'] === false );

// 4. Toggle validation.
$res = dispatch( 'toggle', 'POST', array( 'enabled' => true ) );
check( 'toggle without agentId is a 400', $res['status'] === 400 && $res['data']['ok'] === false );
$res = dispatch( 'toggle', 'POST', array( 'agentId' => 'write' ) );
check( 'toggle without enabled is a 400', $res['status'] === 400 && $res['data']['ok'] === false );

// 5. Settings save the model and the key override; the key stays server-side.
$res = dispatch( 'settings', 'POST', array( 'openRouterApiKey' => 'sk-or-override-xyz9876', 'openRouterModel' => 'openai/gpt-5.2' ) );
check( 'settings responds 200', $res['status'] === 200 );
check( 'settings saves the model', $res['data']['settings']['openRouterModel'] === 'openai/gpt-5.2' );
check( 'override key marks configured', $res['data']['settings']['openRouter']['configured'] === true );
check( 'suffix is the last four of the override key', $res['data']['settings']['openRouter']['suffix'] === '9876' );
check( 'response never contains the full override key', strpos( (string) json_encode( $res['data'] ), 'sk-or-override-xyz9876' ) === false );
$stored = json_decode( (string) file_get_contents( $stored_path ), true );
check( 'override key persists server-side', ( $stored['settings']['openRouterApiKey'] ?? '' ) === 'sk-or-override-xyz9876' );

// 6. An empty settings save changes nothing (matches the client contract).
$res = dispatch( 'settings', 'POST', array() );
check( 'empty settings save keeps the model', $res['data']['settings']['openRouterModel'] === 'openai/gpt-5.2' );
check( 'empty settings save keeps the key suffix', $res['data']['settings']['openRouter']['suffix'] === '9876' );

// 7. Unknown routes 404; logged-out requests 401.
$res = dispatch( 'bogus', 'GET' );
check( 'unknown route is a 404', $res['status'] === 404 && $res['data']['ok'] === false );
$res = dispatch( '', 'POST' );
check( 'wrong method on the root route is a 404', $res['status'] === 404 );
Neo_Pulse_App_Auth_Session::$user = null;
$res = dispatch( '', 'GET' );
check( 'logged-out request is a 401', $res['status'] === 401 && $res['data']['ok'] === false );

// 8. The locked store update reads the freshest value under the lock, so
// back-to-back read-modify-write cycles never lose a change.
$counter_path = $tmp_root . '/neo-pulse-data/counter.json';
Neo_Pulse_App_Json_File_Store::write( $counter_path, array( 'count' => 1 ) );
$increment = static function ( $current ) {
	return array( 'count' => ( isset( $current['count'] ) ? (int) $current['count'] : 0 ) + 1 );
};
check( 'first locked update succeeds', Neo_Pulse_App_Json_File_Store::update( $counter_path, $increment ) === true );
check( 'second locked update succeeds', Neo_Pulse_App_Json_File_Store::update( $counter_path, $increment ) === true );
$after = Neo_Pulse_App_Json_File_Store::read( $counter_path );
check( 'locked updates never lose an increment', ( $after['count'] ?? 0 ) === 3 );
$seen_null = false;
Neo_Pulse_App_Json_File_Store::update(
	$tmp_root . '/neo-pulse-data/fresh.json',
	static function ( $current ) use ( &$seen_null ) {
		$seen_null = $current === null;
		return array( 'created' => true );
	}
);
check( 'update on a missing file passes null to the mutator', $seen_null );
$aborted = Neo_Pulse_App_Json_File_Store::update(
	$counter_path,
	static function () {
		return null;
	}
);
$after_abort = Neo_Pulse_App_Json_File_Store::read( $counter_path );
check( 'a mutator returning a non-array aborts without writing', $aborted === false && ( $after_abort['count'] ?? 0 ) === 3 );

putenv( 'NEO_PULSE_DATA_DIR' );
remove_tree( $tmp_root );

if ( $failures !== array() ) {
	echo 'AGENT LIBRARY TESTS FAILED: ' . count( $failures ) . "\n";
	exit( 1 );
}
echo "ALL AGENT LIBRARY TESTS PASSED\n";
