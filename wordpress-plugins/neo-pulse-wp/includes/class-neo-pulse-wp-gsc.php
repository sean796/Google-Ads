<?php
/**
 * Google Search Console client.
 *
 * Two ways in:
 *  - "agency" (the normal case): the site asks Neo Digital's update server with its site key. The
 *    Google key stays on neodigital.ca, so the client only adds Neo Digital's service account email
 *    as a user in Search Console. The server only answers for this key's own domain.
 *  - "own": a service account JSON saved under Settings → Search Console (Advanced) or in
 *    wp-config.php; the site then talks to Google directly. Takes priority when present.
 *
 * @package Neo_Pulse_Wp
 */

defined( 'ABSPATH' ) || exit;

$neo_pulse_wp_gsc_dir = __DIR__ . '/';
require_once $neo_pulse_wp_gsc_dir . 'trait-neo-pulse-wp-gsc-credentials.php';
require_once $neo_pulse_wp_gsc_dir . 'trait-neo-pulse-wp-gsc-api-transport.php';
require_once $neo_pulse_wp_gsc_dir . 'trait-neo-pulse-wp-gsc-connection.php';
require_once $neo_pulse_wp_gsc_dir . 'trait-neo-pulse-wp-gsc-stats.php';

class Neo_Pulse_Wp_Gsc {

	const TOKEN_URL     = 'https://oauth2.googleapis.com/token';
	const WEBMASTERS    = 'https://www.googleapis.com/webmasters/v3';
	const SCOPE         = 'https://www.googleapis.com/auth/webmasters.readonly';
	const TOKEN_TTL     = 3000;
	const STATS_TTL     = 900;
	const CONNECTION_TTL = HOUR_IN_SECONDS;
	const CONNECTION_ERROR_TTL = 600;
	const EMAIL_FALLBACK = 'neopulse@neopulse-505422.iam.gserviceaccount.com';

	/** Service account JSON pasted under Settings (not autoloaded). */
	const ACCOUNT_OPTION = 'neo_pulse_wp_gsc_service_account';

	/** Cached test_connection() result. */
	const CONNECTION_TRANSIENT = 'neo_pulse_wp_gsc_connection';

	/**
	 * Parsed credentials for this request (null = not resolved yet).
	 *
	 * @var array<string,string>|WP_Error|null
	 */
	private static $credentials = null;

	/**
	 * Where the credentials in use came from: constant, option, file, legacy_file or ''.
	 *
	 * @var string
	 */
	private static $credentials_source = '';

	use Neo_Pulse_Wp_Gsc_Trait_Credentials;
	use Neo_Pulse_Wp_Gsc_Trait_Api_Transport;
	use Neo_Pulse_Wp_Gsc_Trait_Connection;
	use Neo_Pulse_Wp_Gsc_Trait_Stats;
}
