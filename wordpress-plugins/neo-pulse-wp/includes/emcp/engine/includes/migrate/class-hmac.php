<?php
/**
 * HMAC signing for the migration transport.
 *
 * Every packet and control call between the source (this Pro plugin) and the
 * destination connector is HMAC-SHA256 signed with the paired shared secret.
 * The canonical strings defined here are the exact contract the connector
 * re-implements inline — keep the two byte-identical (ConnectorAuthTest guards
 * parity). Signing binds the upload id, byte offset, total size, and a hash of
 * the body, so a packet cannot be replayed at a different position or with
 * altered bytes.
 *
 * @package EMCP_Tools
 * @since   3.13.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Migration transport HMAC.
 *
 * @since 3.13.0
 */
class EMCP_Tools_Migrate_HMAC {

	/** Max allowed clock skew (seconds) for control-call timestamps. */
	const SKEW = 300;

	/**
	 * Canonical string for a data packet.
	 *
	 * @param string $upload_id Stable id for the transfer.
	 * @param int    $offset    Byte offset this packet begins at.
	 * @param int    $total     Total transfer size in bytes.
	 * @param string $body      Raw packet bytes.
	 * @return string
	 */
	public static function packet_canonical( $upload_id, $offset, $total, $body ) {
		return self::packet_canonical_hashed( $upload_id, $offset, $total, hash( 'sha256', $body ) );
	}

	/**
	 * Canonical string for a data packet whose body hash is already known.
	 *
	 * Identical output to packet_canonical(); this variant exists so the
	 * receiving end can hash a stream instead of holding the whole packet in
	 * memory to hash it. Keep both, and keep them here and in the connector
	 * byte-identical.
	 *
	 * @param string $upload_id Stable id for the transfer.
	 * @param int    $offset    Byte offset this packet begins at.
	 * @param int    $total     Total transfer size in bytes.
	 * @param string $body_hash Hex sha256 of the raw packet bytes.
	 * @return string
	 */
	public static function packet_canonical_hashed( $upload_id, $offset, $total, $body_hash ) {
		return implode( "\n", array( (string) $upload_id, (int) $offset, (int) $total, (string) $body_hash ) );
	}

	/**
	 * Canonical string for a control call (pair/restore/status trigger).
	 *
	 * @param string $action    Action name.
	 * @param int    $ts        Unix timestamp (for the replay window).
	 * @param string $json_body Raw JSON request body ('' if none).
	 * @return string
	 */
	public static function control_canonical( $action, $ts, $json_body ) {
		return implode( "\n", array( (string) $action, (int) $ts, hash( 'sha256', (string) $json_body ) ) );
	}

	/**
	 * Sign a canonical string.
	 *
	 * @param string $canonical Canonical string.
	 * @param string $secret    Shared secret.
	 * @return string Hex HMAC-SHA256.
	 */
	public static function sign( $canonical, $secret ) {
		return hash_hmac( 'sha256', $canonical, (string) $secret );
	}

	/**
	 * Constant-time verify.
	 *
	 * @param string $canonical Canonical string.
	 * @param string $secret    Shared secret.
	 * @param string $sig       Provided signature.
	 * @return bool
	 */
	public static function verify( $canonical, $secret, $sig ) {
		return hash_equals( self::sign( $canonical, $secret ), (string) $sig );
	}

	/**
	 * Is a control-call timestamp within the allowed skew window?
	 *
	 * @param int $ts   Timestamp claimed by the caller.
	 * @param int $now  Current time.
	 * @param int $skew Allowed skew (seconds).
	 * @return bool
	 */
	public static function within_window( $ts, $now, $skew = self::SKEW ) {
		return abs( (int) $now - (int) $ts ) <= (int) $skew;
	}
}
