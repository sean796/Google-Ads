<?php
/**
 * Redirect storage, matching, and front-end execution.
 *
 * Matching modes follow NEO Pulse redirect's comparison types: exact, contains, start,
 * end and regex. Exact rows are stored normalised (lowercase, trailing slash,
 * no leading slash, optional "?query") and looked up with one indexed query;
 * every other active row is loaded once into a transient that is cleared on
 * every write.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_wp_redirects_dir = __DIR__ . '/';
require_once $neo_pulse_wp_redirects_dir . 'trait-neo-pulse-wp-redirects-storage.php';
require_once $neo_pulse_wp_redirects_dir . 'trait-neo-pulse-wp-redirects-writes.php';
require_once $neo_pulse_wp_redirects_dir . 'trait-neo-pulse-wp-redirects-matching.php';

class Neo_Pulse_Wp_Redirects {

	const TABLE_VERSION = '1.0';
	const OPTION_KEY    = 'neo_pulse_wp_redirects_settings';

	/** Transient holding all active non-exact rows. */
	const NON_EXACT_CACHE_KEY = 'neo_pulse_wp_redirects_non_exact';

	/** Supported matching modes (same names as NEO Pulse redirect comparisons). */
	const MATCH_TYPES = array( 'exact', 'contains', 'start', 'end', 'regex' );

	/** Supported HTTP status codes. */
	const STATUS_CODES = array( 301, 302, 307, 308, 410, 451 );

	/** Status codes that need no destination (content gone). */
	const GONE_CODES = array( 410, 451 );

	/** @var array<string, true>|null Active exact sources, loaded once per request by is_redirected(). */
	private static $active_exact = null;

	use Neo_Pulse_Wp_Redirects_Trait_Storage;
	use Neo_Pulse_Wp_Redirects_Trait_Writes;
	use Neo_Pulse_Wp_Redirects_Trait_Matching;

	/**
	 * @return string
	 */
	public static function table_name(): string {
		global $wpdb;
		return $wpdb->prefix . 'neo_pulse_wp_redirects';
	}

	public static function init(): void {
		add_action( 'template_redirect', array( __CLASS__, 'maybe_redirect' ), 1 );
		add_action( 'template_redirect', array( __CLASS__, 'maybe_fallback_home' ), 20 );
		add_action( 'plugins_loaded', array( __CLASS__, 'maybe_install' ), 20 );
	}
}
