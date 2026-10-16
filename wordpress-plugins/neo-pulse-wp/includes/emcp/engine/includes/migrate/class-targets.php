<?php
/**
 * Paired migration targets + pairing-code codec.
 *
 * A "target" is a live site this source has paired with: its URL, the shared
 * HMAC secret (stored encrypted via EMCP_Tools_Secret), the destination's
 * reported capabilities (max upload size, limits), and the last sync time.
 * Pairing is bootstrapped out-of-band with a one-time base64 pairing code the
 * admin carries to the connector; the code is short-lived and single-use.
 *
 * @package EMCP_Tools
 * @since   3.13.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Migration targets store + pairing codec.
 *
 * @since 3.13.0
 */
class EMCP_Tools_Migrate_Targets {

	/** Default pairing-code lifetime (seconds). */
	const PAIR_TTL = 900;

	/**
	 * The targets table name.
	 *
	 * @return string
	 */
	public static function table() {
		global $wpdb;
		return $wpdb->prefix . 'emcp_migrate_targets';
	}

	/**
	 * Generate a fresh shared secret (hex, 64 chars).
	 *
	 * @return string
	 */
	public static function generate_secret() {
		return bin2hex( random_bytes( 32 ) );
	}

	/**
	 * Encode a one-time pairing code.
	 *
	 * @param string $live_url   Destination site URL (https).
	 * @param string $secret     Shared HMAC secret.
	 * @param int    $expires_at Unix expiry.
	 * @return string base64 payload.
	 */
	public static function make_pairing_code( $live_url, $secret, $expires_at ) {
		return base64_encode( wp_json_encode( array(
			'v'          => 1,
			'live_url'   => untrailingslashit( $live_url ),
			'secret'     => $secret,
			'expires_at' => (int) $expires_at,
		) ) );
	}

	/**
	 * Decode + validate a pairing code.
	 *
	 * @param string   $code Pairing code.
	 * @param int|null $now  Current time (injectable for tests).
	 * @return array|WP_Error Payload {live_url, secret, expires_at} or error.
	 */
	public static function parse_pairing_code( $code, $now = null ) {
		$now  = null === $now ? time() : (int) $now;
		$json = base64_decode( (string) $code, true );
		if ( false === $json ) {
			return new WP_Error( 'emcp_pair_b64', __( 'Invalid pairing code (not base64).', 'emcp-tools' ) );
		}
		$data = json_decode( $json, true );
		if ( ! is_array( $data ) ) {
			return new WP_Error( 'emcp_pair_json', __( 'Invalid pairing code (bad payload).', 'emcp-tools' ) );
		}
		if ( empty( $data['live_url'] ) || empty( $data['secret'] ) || empty( $data['expires_at'] ) ) {
			return new WP_Error( 'emcp_pair_fields', __( 'Pairing code is missing required fields.', 'emcp-tools' ) );
		}
		if ( 0 !== stripos( (string) $data['live_url'], 'https://' ) ) {
			return new WP_Error( 'emcp_pair_https', __( 'The destination URL must use HTTPS.', 'emcp-tools' ) );
		}
		if ( (int) $data['expires_at'] < $now ) {
			return new WP_Error( 'emcp_pair_expired', __( 'This pairing code has expired.', 'emcp-tools' ) );
		}
		return array(
			'live_url'   => untrailingslashit( (string) $data['live_url'] ),
			'secret'     => (string) $data['secret'],
			'expires_at' => (int) $data['expires_at'],
		);
	}

	/**
	 * Insert a target. Secret is encrypted at rest.
	 *
	 * @param array $target {live_url, secret, caps?}
	 * @return int Insert id (0 on failure).
	 */
	public static function save( $target ) {
		global $wpdb;
		$wpdb->insert(
			self::table(),
			array(
				'live_url'   => untrailingslashit( $target['live_url'] ),
				'secret_enc' => EMCP_Tools_Secret::encrypt( (string) $target['secret'] ),
				'caps'       => isset( $target['caps'] ) ? wp_json_encode( $target['caps'] ) : null,
				'created_at' => current_time( 'mysql', true ),
			),
			array( '%s', '%s', '%s', '%s' )
		);
		return (int) $wpdb->insert_id;
	}

	/**
	 * Get a target with its secret decrypted.
	 *
	 * @param int $id Target id.
	 * @return object|null Row with ->secret (plain) + ->caps (array).
	 */
	public static function get( $id ) {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		$row = $wpdb->get_row( $wpdb->prepare( 'SELECT * FROM ' . self::table() . ' WHERE id = %d', (int) $id ) );
		if ( ! $row ) {
			return null;
		}
		$row->secret = EMCP_Tools_Secret::decrypt( (string) $row->secret_enc );
		$row->caps   = $row->caps ? json_decode( $row->caps, true ) : array();
		return $row;
	}

	/**
	 * All targets (without decrypting secrets).
	 *
	 * @return array
	 */
	public static function all() {
		global $wpdb;
		// phpcs:ignore WordPress.DB.DirectDatabaseQuery.DirectQuery,WordPress.DB.DirectDatabaseQuery.NoCaching
		return (array) $wpdb->get_results( 'SELECT id, live_url, caps, last_sync, created_at FROM ' . self::table() . ' ORDER BY id DESC' );
	}

	/**
	 * Record the destination's reported capabilities.
	 *
	 * @param int   $id   Target id.
	 * @param array $caps Capabilities.
	 */
	public static function update_caps( $id, $caps ) {
		global $wpdb;
		$wpdb->update( self::table(), array( 'caps' => wp_json_encode( $caps ) ), array( 'id' => (int) $id ), array( '%s' ), array( '%d' ) );
	}

	/**
	 * Stamp a successful sync.
	 *
	 * @param int $id Target id.
	 */
	public static function touch_sync( $id ) {
		global $wpdb;
		$wpdb->update( self::table(), array( 'last_sync' => current_time( 'mysql', true ) ), array( 'id' => (int) $id ), array( '%s' ), array( '%d' ) );
	}

	/**
	 * Delete a target.
	 *
	 * @param int $id Target id.
	 */
	public static function delete( $id ) {
		global $wpdb;
		$wpdb->delete( self::table(), array( 'id' => (int) $id ), array( '%d' ) );
	}
}
