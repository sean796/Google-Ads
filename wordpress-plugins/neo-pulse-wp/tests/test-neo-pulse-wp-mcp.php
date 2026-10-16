<?php
/**
 * Standalone CLI test suite for Neo Pulse MCP (`neo-pulse/read`, `neo-pulse/write`),
 * `Neo_Pulse_Wp_Business::sanitize()` unknown-key preservation, showroom-only
 * `main_location` validation, and `Neo_Pulse_Wp_Emcp_Guards`.
 *
 * Run via: php wordpress-plugins/neo-pulse-wp/tests/test-neo-pulse-wp-mcp.php
 */

define( 'ABSPATH', __DIR__ . '/' );
define( 'DAY_IN_SECONDS', 86400 );
define( 'HOUR_IN_SECONDS', 3600 );
define( 'MINUTE_IN_SECONDS', 60 );
define( 'NEO_PULSE_WP_VERSION', '0.9.266' );
define( 'NEO_PULSE_WP_PLUGIN_FILE', dirname( __DIR__ ) . '/neo-pulse-wp.php' );
define( 'NEO_PULSE_WP_PLUGIN_DIR', dirname( __DIR__ ) . '/' );

class WP_Error {
	private $code;
	private $message;
	private $data;

	public function __construct( $code = '', $message = '', $data = '' ) {
		$this->code    = (string) $code;
		$this->message = (string) $message;
		$this->data    = $data;
	}

	public function get_error_code(): string {
		return $this->code;
	}

	public function get_error_message(): string {
		return $this->message;
	}

	public function get_error_data() {
		return $this->data;
	}
}

class WP_Post {
	public $ID          = 0;
	public $post_type   = 'page';
	public $post_status = 'publish';
	public $post_title  = '';
	public $post_author = 1;
	public $post_content = '';
	public $post_password = '';

	public function __construct( array $props = array() ) {
		foreach ( $props as $k => $v ) {
			$this->$k = $v;
		}
	}
}

class WP_User {
	public $ID           = 1;
	public $user_login   = 'sean';
	public $display_name = 'Sean Craig';
	public $user_url     = '';
}

function is_wp_error( $thing ): bool {
	return $thing instanceof WP_Error;
}

$GLOBALS['__test_options']   = array();
$GLOBALS['__test_posts']     = array();
$GLOBALS['__test_post_meta'] = array();
$GLOBALS['__test_abilities'] = array();
$GLOBALS['__test_categories']= array();
$GLOBALS['__test_filters']   = array();

function get_option( string $name, $default = false ) {
	return array_key_exists( $name, $GLOBALS['__test_options'] ) ? $GLOBALS['__test_options'][ $name ] : $default;
}

function update_option( string $name, $value, $autoload = null ): bool {
	unset( $autoload );
	$GLOBALS['__test_options'][ $name ] = $value;
	return true;
}

function delete_option( string $name ): bool {
	unset( $GLOBALS['__test_options'][ $name ] );
	return true;
}

function add_action( string $tag, $callback, int $priority = 10, int $accepted_args = 1 ): void {
	add_filter( $tag, $callback, $priority, $accepted_args );
}

function do_action( string $tag, ...$args ): void {
	unset( $tag, $args );
}

function add_filter( string $tag, $callback, int $priority = 10, int $accepted_args = 1 ): void {
	unset( $accepted_args );
	$GLOBALS['__test_filters'][ $tag ][ $priority ][] = $callback;
}

function apply_filters( string $tag, $value, ...$args ) {
	if ( empty( $GLOBALS['__test_filters'][ $tag ] ) ) {
		return $value;
	}
	ksort( $GLOBALS['__test_filters'][ $tag ] );
	foreach ( $GLOBALS['__test_filters'][ $tag ] as $callbacks ) {
		foreach ( $callbacks as $cb ) {
			$value = call_user_func( $cb, $value, ...$args );
		}
	}
	return $value;
}

function __( string $text, string $domain = 'default' ): string {
	unset( $domain );
	return $text;
}

function sanitize_text_field( string $str ): string {
	return trim( strip_tags( $str ) );
}

function sanitize_key( string $key ): string {
	return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( $key ) );
}

function sanitize_email( string $email ): string {
	return filter_var( trim( $email ), FILTER_VALIDATE_EMAIL ) ? trim( $email ) : '';
}

function esc_url_raw( string $url ): string {
	$url = trim( $url );
	return preg_match( '#^https?://#i', $url ) ? $url : '';
}

function absint( $maybeint ): int {
	return abs( (int) $maybeint );
}

function wp_strip_all_tags( string $text ): string {
	return trim( strip_tags( $text ) );
}

function wp_kses_post( string $text ): string {
	return trim( $text );
}

function wp_check_invalid_utf8( string $text ): string {
	return $text;
}

function wp_json_encode( $data, int $flags = 0 ) {
	return json_encode( $data, $flags );
}

function maybe_unserialize( $val ) {
	return $val;
}

function home_url( string $path = '/' ): string {
	return 'https://blindswebsitet.wpenginepowered.com/' . ltrim( $path, '/' );
}

function admin_url( string $path = '' ): string {
	return 'https://blindswebsitet.wpenginepowered.com/wp-admin/' . ltrim( $path, '/' );
}

function plugin_dir_path( string $file ): string {
	return rtrim( dirname( $file ), '/\\' ) . '/';
}

function plugin_dir_url( string $file ): string {
	unset( $file );
	return 'https://blindswebsitet.wpenginepowered.com/wp-content/plugins/neo-pulse-wp/';
}

function plugin_basename( string $file ): string {
	unset( $file );
	return 'neo-pulse-wp/neo-pulse-wp.php';
}

function wp_parse_url( string $url, int $component = -1 ) {
	return parse_url( $url, $component );
}

function current_user_can( string $cap, ...$args ): bool {
	unset( $cap, $args );
	return true;
}

function get_current_user_id(): int {
	return 1;
}

function wp_get_current_user(): WP_User {
	return new WP_User();
}

function get_bloginfo( string $show = '' ): string {
	return 'language' === $show ? 'en-CA' : 'DRC Blinds';
}

function wp_specialchars_decode( string $str ): string {
	return html_entity_decode( $str );
}

function post_type_exists( string $post_type ): bool {
	return in_array( $post_type, array( 'post', 'page', 'location' ), true );
}

function get_post_types( array $args = array(), string $output = 'names' ): array {
	unset( $args, $output );
	return array(
		'post'     => (object) array( 'labels' => (object) array( 'name' => 'Posts' ) ),
		'page'     => (object) array( 'labels' => (object) array( 'name' => 'Pages' ) ),
		'location' => (object) array( 'labels' => (object) array( 'name' => 'Locations' ) ),
	);
}

function get_taxonomies( array $args = array(), string $output = 'names' ): array {
	unset( $args, $output );
	return array(
		'category' => (object) array( 'labels' => (object) array( 'name' => 'Categories' ) ),
	);
}

function get_post( $post ) {
	if ( $post instanceof WP_Post ) {
		return $post;
	}
	$id = (int) $post;
	return $GLOBALS['__test_posts'][ $id ] ?? null;
}

function get_posts( array $args = array() ): array {
	$pt  = $args['post_type'] ?? 'post';
	$out = array();
	foreach ( $GLOBALS['__test_posts'] as $post ) {
		if ( is_array( $pt ) ? in_array( $post->post_type, $pt, true ) : $post->post_type === $pt ) {
			$out[] = ( isset( $args['fields'] ) && 'ids' === $args['fields'] ) ? $post->ID : $post;
		}
	}
	return $out;
}

function get_the_title( $post ): string {
	$p = get_post( $post );
	return $p instanceof WP_Post ? $p->post_title : '';
}

function get_permalink( $post ): string {
	$p = get_post( $post );
	return $p instanceof WP_Post ? home_url( '/loc-' . $p->ID . '/' ) : home_url( '/' );
}

function get_post_meta( int $post_id, string $key = '', bool $single = false ) {
	if ( '' === $key ) {
		$all = array();
		foreach ( $GLOBALS['__test_post_meta'][ $post_id ] ?? array() as $mk => $mv ) {
			$all[ $mk ] = array( $mv );
		}
		return $all;
	}
	if ( ! isset( $GLOBALS['__test_post_meta'][ $post_id ][ $key ] ) ) {
		return $single ? '' : array();
	}
	return $single ? $GLOBALS['__test_post_meta'][ $post_id ][ $key ] : array( $GLOBALS['__test_post_meta'][ $post_id ][ $key ] );
}

function update_post_meta( int $post_id, string $key, $value ): bool {
	$GLOBALS['__test_post_meta'][ $post_id ][ $key ] = $value;
	return true;
}

function delete_post_meta( int $post_id, string $key ): bool {
	unset( $GLOBALS['__test_post_meta'][ $post_id ][ $key ] );
	return true;
}

function metadata_exists( string $meta_type, int $object_id, string $meta_key ): bool {
	unset( $meta_type );
	return isset( $GLOBALS['__test_post_meta'][ $object_id ][ $meta_key ] );
}

function wp_get_attachment_url( int $id ): string {
	return $id > 0 ? home_url( '/wp-content/uploads/logo-' . $id . '.png' ) : '';
}

function wp_get_attachment_image_url( int $id ): string {
	return wp_get_attachment_url( $id );
}

function wp_get_attachment_metadata( int $id ): array {
	return $id > 0 ? array( 'width' => 600, 'height' => 200 ) : array();
}

function get_post_mime_type( int $id ): string {
	return $id > 0 ? 'image/png' : '';
}

function attachment_url_to_postid( string $url ): int {
	return false !== strpos( $url, 'logo-42' ) ? 42 : 0;
}

function get_users( array $args = array() ): array {
	unset( $args );
	return array( 1 );
}

function get_userdata( int $user_id ) {
	return 1 === $user_id ? new WP_User() : false;
}

function count_user_posts( int $userid ): int {
	unset( $userid );
	return 1;
}

function get_author_posts_url( int $author_id ): string {
	return home_url( '/author/' . $author_id . '/' );
}

function get_avatar_url( int $id_or_email ): string {
	unset( $id_or_email );
	return home_url( '/avatar.png' );
}

function get_post_time( string $d, bool $gmt, $post ): string {
	unset( $d, $gmt, $post );
	return '2026-10-15T12:00:00+00:00';
}

function get_post_modified_time( string $d, bool $gmt, $post ): string {
	unset( $d, $gmt, $post );
	return '2026-10-15T12:00:00+00:00';
}

function get_locale(): string {
	return 'en_CA';
}

function wp_register_ability_category( string $slug, array $args ): void {
	$GLOBALS['__test_categories'][ $slug ] = $args;
}

function wp_register_ability( string $name, array $args ): void {
	$GLOBALS['__test_abilities'][ $name ] = $args;
}

require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-vars.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-locations.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-settings.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-schema.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-compare.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-head.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-seo-faq.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-business.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/class-neo-pulse-wp-mcp.php';
require_once NEO_PULSE_WP_PLUGIN_DIR . 'includes/emcp/class-neo-pulse-wp-emcp-guards.php';

function assert_true( bool $cond, string $msg ): void {
	if ( ! $cond ) {
		fwrite( STDERR, "FAIL: {$msg}\n" );
		exit( 1 );
	}
}

// 1. Test unknown key preservation in Neo_Pulse_Wp_Business::sanitize()
$sanitized = Neo_Pulse_Wp_Business::sanitize(
	array(
		'name'                  => 'Blind Magic',
		'legal_name'            => 'Blind Magic Window Coverings Ltd.',
		'geo'                   => array( 'lat' => '53.5461', 'lng' => '-113.4937' ),
		'future_neo_tools_key'  => 'kept_safely',
		'future_nested_setting' => array( 'tier' => 'gold' ),
	)
);
assert_true( 'kept_safely' === ( $sanitized['future_neo_tools_key'] ?? '' ), 'Unknown top-level scalar key must survive sanitize()' );
assert_true( 'gold' === ( $sanitized['future_nested_setting']['tier'] ?? '' ), 'Unknown nested array key must survive sanitize()' );
assert_true( '53.5461' === $sanitized['geo']['lat'] && '-113.4937' === $sanitized['geo']['lng'], 'Valid coordinates must be kept' );

// 2. Test showroom vs service area validation
$GLOBALS['__test_posts'][101] = new WP_Post(
	array(
		'ID'          => 101,
		'post_type'   => 'location',
		'post_status' => 'publish',
		'post_title'  => 'Edmonton Showroom',
	)
);
update_post_meta( 101, 'showroom_or_service_area', 'Showroom' );
update_post_meta( 101, 'address', '10945 120 St NW, Edmonton, AB T5H 3P9' );
update_post_meta( 101, 'monday_hours', '9:00 am - 5:00 pm' );

$GLOBALS['__test_posts'][102] = new WP_Post(
	array(
		'ID'          => 102,
		'post_type'   => 'location',
		'post_status' => 'publish',
		'post_title'  => 'Beaumont Service Area',
	)
);
update_post_meta( 102, 'showroom_or_service_area', 'Service Area' );

assert_true( Neo_Pulse_Wp_Business::is_showroom( 101 ), 'Post 101 must be recognized as a showroom' );
assert_true( ! Neo_Pulse_Wp_Business::is_showroom( 102 ), 'Post 102 (Service Area) must NOT be a showroom' );

// 3. Test neo-pulse/read and neo-pulse/write registration & catalog
Neo_Pulse_Wp_Mcp::register_category();
Neo_Pulse_Wp_Mcp::register_abilities();
assert_true( isset( $GLOBALS['__test_categories']['neo-pulse'] ), 'Category neo-pulse must be registered' );
assert_true( isset( $GLOBALS['__test_abilities']['neo-pulse/read'] ), 'Ability neo-pulse/read must be registered' );
assert_true( isset( $GLOBALS['__test_abilities']['neo-pulse/write'] ), 'Ability neo-pulse/write must be registered' );

$read_catalog = Neo_Pulse_Wp_Mcp::read( array() );
assert_true( isset( $read_catalog['operations']['get-business-details'] ), 'Read catalog must include get-business-details' );
assert_true( isset( $read_catalog['operations']['audit'] ), 'Read catalog must include audit' );

$write_catalog = Neo_Pulse_Wp_Mcp::write( array() );
assert_true( isset( $write_catalog['operations']['update-business-details'] ), 'Write catalog must include update-business-details' );
assert_true( isset( $write_catalog['operations']['undo'] ), 'Write catalog must include undo' );

// 4. Test update-business-details requires create: true when option doesn't exist
$missing_create = Neo_Pulse_Wp_Mcp::write(
	array(
		'operation' => 'update-business-details',
		'arguments' => array( 'name' => 'Blind Magic' ),
	)
);
assert_true( is_wp_error( $missing_create ) && 'invalid_argument' === $missing_create->get_error_code(), 'Must refuse creating business details without create: true' );

// 5. Test dry_run changes nothing
$dry = Neo_Pulse_Wp_Mcp::write(
	array(
		'operation' => 'update-business-details',
		'arguments' => array(
			'create'  => true,
			'dry_run' => true,
			'name'    => 'Blind Magic',
		),
	)
);
assert_true( ! is_wp_error( $dry ) && true === $dry['dry_run'], 'dry_run must succeed' );
assert_true( ! Neo_Pulse_Wp_Business::exists(), 'dry_run must not write the option' );

// 6. Test real write, expected_version conflict, non-showroom refusal, and undo
$created = Neo_Pulse_Wp_Mcp::write(
	array(
		'operation' => 'update-business-details',
		'arguments' => array(
			'create'             => true,
			'name'               => 'Blind Magic',
			'legal_name'         => 'Blind Magic Ltd.',
			'custom_unknown_key' => 'survives_pulse_save',
		),
	)
);
assert_true( ! is_wp_error( $created ) && ! empty( $created['ok'] ), 'Real create write must succeed' );
assert_true( 'survives_pulse_save' === ( $created['data']['custom_unknown_key'] ?? '' ), 'Unknown key must survive MCP write' );

$v1 = $created['version'];

// Stale expected_version must return conflict
$conflict = Neo_Pulse_Wp_Mcp::write(
	array(
		'operation' => 'update-business-details',
		'arguments' => array(
			'expected_version' => 'stale_hash',
			'price_range'      => '$$',
		),
	)
);
assert_true( is_wp_error( $conflict ) && 'conflict' === $conflict->get_error_code(), 'Stale expected_version must return conflict' );

// Non-showroom main_location must return invalid_argument
$bad_main = Neo_Pulse_Wp_Mcp::write(
	array(
		'operation' => 'update-business-details',
		'arguments' => array(
			'expected_version' => $v1,
			'locations'        => 'several',
			'main_location'    => 102,
		),
	)
);
assert_true( is_wp_error( $bad_main ) && 'invalid_argument' === $bad_main->get_error_code(), 'Service Area as main_location must be refused' );

// Undo restores state
$undone = Neo_Pulse_Wp_Mcp::write(
	array(
		'operation' => 'undo',
		'arguments' => array( 'id' => $created['history_id'] ),
	)
);
assert_true( ! is_wp_error( $undone ) && ! empty( $undone['ok'] ), 'Undo must succeed' );
assert_true( ! Neo_Pulse_Wp_Business::exists(), 'Undo of initial create must remove the option' );

// 7. Test Ownership & Secret Guards
$veto_secret = Neo_Pulse_Wp_Emcp_Guards::check_option_write_allowed( 'neo_pulse_wp_site_key' );
assert_true( is_wp_error( $veto_secret ) && 'forbidden' === $veto_secret->get_error_code(), 'Secret option write must be forbidden' );

$veto_owned = Neo_Pulse_Wp_Emcp_Guards::check_option_write_allowed( 'neo_business_details' );
assert_true( is_wp_error( $veto_owned ) && 'owned_by_neo_plugin' === $veto_owned->get_error_code(), 'Owned option raw write must be refused' );

$masked = Neo_Pulse_Wp_Emcp_Guards::redact_secrets_after_execute(
	array(
		'neo_pulse_wp_site_key' => 'nd_live_secret_9876',
		'normal_field'          => 'keep_me',
	),
	'emcp-tools/get-settings',
	array(),
	true
);
assert_true( 'set (****9876)' === $masked['neo_pulse_wp_site_key'], 'Secret key must be masked to last 4 chars' );
assert_true( 'keep_me' === $masked['normal_field'], 'Normal fields must be untouched' );

echo "ALL NEO PULSE MCP & EMCP GUARD TESTS PASSED.\n";
