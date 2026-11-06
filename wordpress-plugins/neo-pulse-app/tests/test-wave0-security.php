<?php
/**
 * Standalone CLI tests for Wave 0 security contracts:
 * SSRF classifier, sites secret stripping, OAuth state single-use,
 * AgentMail Svix verification, Chekkit token path.
 *
 * Run via: php wordpress-plugins/neo-pulse-app/tests/test-wave0-security.php
 */

define( 'ABSPATH', __DIR__ . '/' );

$GLOBALS['__transients'] = array();
$GLOBALS['__test_user_id'] = 7;

function set_transient( $key, $value, $ttl ) {
	unset( $ttl );
	$GLOBALS['__transients'][ $key ] = $value;
	return true;
}
function get_transient( $key ) {
	return $GLOBALS['__transients'][ $key ] ?? false;
}
function delete_transient( $key ) {
	unset( $GLOBALS['__transients'][ $key ] );
	return true;
}
function wp_generate_password( $length = 12, $special = true, $extra = false ) {
	unset( $special, $extra );
	return substr( bin2hex( random_bytes( max( 8, (int) ( $length / 2 ) ) ) ), 0, $length );
}
function wp_unslash( $value ) {
	return is_string( $value ) ? stripslashes( $value ) : $value;
}
function wp_parse_url( $url, $component = -1 ) {
	return parse_url( $url, $component );
}
function status_header( $code ) {
	unset( $code );
}
function wp_json_encode( $data ) {
	return json_encode( $data );
}

class Neo_Pulse_App_Auth_Session {
	public static function user_id() {
		return $GLOBALS['__test_user_id'];
	}
}

class Neo_Pulse_App_Secrets {
	public static function agentmail_signing_secret(): string {
		return (string) ( getenv( 'TEST_AGENTMAIL_SIGNING' ) ?: '' );
	}
	public static function agentmail_webhook_secret(): string {
		return (string) ( getenv( 'TEST_AGENTMAIL_BEARER' ) ?: '' );
	}
	public static function chekkit_webhook_token(): string {
		return (string) ( getenv( 'TEST_CHEKKIT_TOKEN' ) ?: '' );
	}
}

$fail = 0;
function check( $label, $cond ) {
	global $fail;
	if ( $cond ) {
		echo "ok - $label\n";
	} else {
		$fail++;
		echo "FAIL - $label\n";
	}
}

$root = dirname( __DIR__ ) . '/includes';
require_once $root . '/http/class-ssrf-guard.php';
require_once $root . '/integrations/class-sites-sync.php';
require_once $root . '/gmb/class-gmb-oauth.php';
require_once $root . '/webhook/class-agentmail-webhook.php';
require_once $root . '/webhook/class-chekkit-webhook.php';

// --- SSRF classifier boundary table ---
foreach ( array( '8.8.8.8', '1.1.1.1', '203.0.114.1', '2001:4860:4860::8888' ) as $ip ) {
	check( "public IP allowed $ip", Neo_Pulse_App_Ssrf_Guard::ip_is_public( $ip ) === true );
}
foreach ( array( '127.0.0.1', '10.0.0.5', '172.16.0.9', '172.31.255.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '203.0.113.10', '198.51.100.7', '192.0.2.9', '224.0.0.1', '::1', '::', 'fe80::1', 'fd00::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8' ) as $ip ) {
	$expected = $ip === '::ffff:8.8.8.8';
	check( "IP classification $ip", Neo_Pulse_App_Ssrf_Guard::ip_is_public( $ip ) === $expected );
}
check( 'metadata literal blocked', Neo_Pulse_App_Ssrf_Guard::validate_public_url( 'https://169.254.169.254/latest/meta-data' ) !== null );
check( 'userinfo rejected', Neo_Pulse_App_Ssrf_Guard::validate_public_url( 'https://user:pass@8.8.8.8/' ) !== null );
check( 'localhost rejected', Neo_Pulse_App_Ssrf_Guard::validate_public_url( 'https://localhost/admin' ) !== null );
check( 'http rejected by default', Neo_Pulse_App_Ssrf_Guard::validate_public_url( 'http://8.8.8.8/' ) !== null );
check( 'http allowed when opted in', Neo_Pulse_App_Ssrf_Guard::validate_public_url( 'http://8.8.8.8/', true ) === null );
check( 'public literal allowed', Neo_Pulse_App_Ssrf_Guard::validate_public_url( 'https://8.8.8.8/path' ) === null );

// --- Sites secret stripping and env merge ---
$sites = array(
	array( 'id' => 'wp-1', 'name' => 'Client', 'appPassword' => 'dummy', 'pluginAccessToken' => 'tok', 'slackIncomingWebhookUrl' => 'https://hooks.slack.com/x', 'primaryLocalKeyword' => 'blinds' ),
);
$stripped = Neo_Pulse_App_Sites_Sync::strip_site_secrets( $sites );
check( 'appPassword stripped', ! isset( $stripped[0]['appPassword'] ) );
check( 'pluginAccessToken stripped', ! isset( $stripped[0]['pluginAccessToken'] ) );
check( 'slack webhook stripped', ! isset( $stripped[0]['slackIncomingWebhookUrl'] ) );
check( 'editorial field kept', ( $stripped[0]['primaryLocalKeyword'] ?? '' ) === 'blinds' );
check( 'env creds empty without env', Neo_Pulse_App_Sites_Sync::env_credentials_by_id() === array() );

// --- OAuth state: mint requires user, single use, replay rejected ---
$ref = new ReflectionMethod( 'Neo_Pulse_App_Gmb_Oauth', 'mint_state' );
$ref->setAccessible( true );
$consume = new ReflectionMethod( 'Neo_Pulse_App_Gmb_Oauth', 'consume_state' );
$consume->setAccessible( true );

$GLOBALS['__test_user_id'] = null;
try {
	$ref->invoke( null );
	check( 'mint without user fails', false );
} catch ( RuntimeException $e ) {
	check( 'mint without user fails', true );
}
$GLOBALS['__test_user_id'] = 7;
$state = $ref->invoke( null );
check( 'mint returns state', is_string( $state ) && strlen( $state ) >= 20 );
check( 'first consume passes', $consume->invoke( null, $state ) === true );
check( 'replay consume rejected', $consume->invoke( null, $state ) === false );
check( 'empty state rejected', $consume->invoke( null, '' ) === false );
check( 'unknown state rejected', $consume->invoke( null, 'nope-not-real' ) === false );

// --- AgentMail Svix verification ---
$verify = new ReflectionMethod( 'Neo_Pulse_App_Agentmail_Webhook', 'verify_request' );
$verify->setAccessible( true );

check( 'agentmail unconfigured fails closed', $verify->invoke( null, '{}' ) === false );

$key_raw = random_bytes( 32 );
putenv( 'TEST_AGENTMAIL_SIGNING=whsec_' . base64_encode( $key_raw ) );
$raw = '{"event_type":"message.received"}';
$id = 'msg_test1';
$ts = (string) time();
$sig = 'v1,' . base64_encode( hash_hmac( 'sha256', $id . '.' . $ts . '.' . $raw, $key_raw, true ) );
$_SERVER['HTTP_SVIX_ID'] = $id;
$_SERVER['HTTP_SVIX_TIMESTAMP'] = $ts;
$_SERVER['HTTP_SVIX_SIGNATURE'] = $sig;
check( 'svix valid passes', $verify->invoke( null, $raw ) === true );
check( 'svix tampered body rejected', $verify->invoke( null, $raw . 'x' ) === false );
$_SERVER['HTTP_SVIX_TIMESTAMP'] = (string) ( time() - 3600 );
$old_sig = 'v1,' . base64_encode( hash_hmac( 'sha256', $id . '.' . $_SERVER['HTTP_SVIX_TIMESTAMP'] . '.' . $raw, $key_raw, true ) );
$_SERVER['HTTP_SVIX_SIGNATURE'] = $old_sig;
check( 'svix stale timestamp rejected', $verify->invoke( null, $raw ) === false );
putenv( 'TEST_AGENTMAIL_SIGNING' );

// --- Chekkit token path ---
putenv( 'TEST_CHEKKIT_TOKEN=tok_secret_123' );
ob_start();
Neo_Pulse_App_Chekkit_Webhook::handle( 'POST', array( 'name' => 'A', 'phone' => '1' ), '' );
$out = ob_get_clean();
check( 'chekkit bare path rejects', strpos( (string) $out, 'Unauthorized' ) !== false );
ob_start();
Neo_Pulse_App_Chekkit_Webhook::handle( 'POST', array( 'name' => 'A', 'phone' => '1' ), 'wrong' );
$out = ob_get_clean();
check( 'chekkit wrong token rejects', strpos( (string) $out, 'Unauthorized' ) !== false );
putenv( 'TEST_CHEKKIT_TOKEN' );

if ( $fail > 0 ) {
	echo "FAILED ($fail)\n";
	exit( 1 );
}
echo "PASSED\n";
