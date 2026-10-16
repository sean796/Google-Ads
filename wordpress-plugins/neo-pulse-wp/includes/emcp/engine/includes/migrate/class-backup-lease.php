<?php
/**
 * The backup job lease (spec 9.6 point 3): one owner drives a backup job at
 * a time. The browser, the MCP loop and the scheduled tick all run chunks
 * through run(), which claims or renews the lease before the chunk and
 * re-checks ownership before that chunk's progress is saved.
 *
 * @package EMCP_Tools
 * @since   3.18.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Backup lease.
 */
final class EMCP_Tools_Backup_Lease {

	const TTL = 60;

	/** @var EMCP_Tools_Lease|null */
	private static $lease = null;
	/** @var callable|null */
	private static $mutex_acquire = null;
	/** @var callable|null */
	private static $mutex_release = null;

	/**
	 * Test seam for the per-process chunk mutex.
	 *
	 * @param callable|null $acquire ( $job_id ) => bool.
	 * @param callable|null $release ( $job_id ) => void.
	 */
	public static function use_mutex( ?callable $acquire, ?callable $release ): void {
		self::$mutex_acquire = $acquire;
		self::$mutex_release = $release;
	}

	/**
	 * The MySQL lock held while one process runs one chunk. The lease says who
	 * owns the job; this says a chunk is running right now, so a retried
	 * request from the same owner, or a taker after the lease expired during a
	 * long chunk, cannot replay work that is still in progress. MySQL frees it
	 * when the process dies.
	 *
	 * @param string $job_id Job id.
	 * @return string
	 */
	private static function mutex_name( string $job_id ): string {
		global $wpdb;
		return 'emcp_bk_' . md5( ( isset( $wpdb->prefix ) ? $wpdb->prefix : '' ) . $job_id );
	}

	private static function mutex_acquire( string $job_id ): bool {
		if ( self::$mutex_acquire ) {
			return (bool) ( self::$mutex_acquire )( $job_id );
		}
		global $wpdb;
		if ( ! isset( $wpdb ) || ! is_object( $wpdb ) || ! method_exists( $wpdb, 'get_var' ) ) {
			return true;
		}
		return '1' === (string) $wpdb->get_var( $wpdb->prepare( 'SELECT GET_LOCK( %s, 0 )', self::mutex_name( $job_id ) ) );
	}

	private static function mutex_release( string $job_id ): void {
		if ( self::$mutex_release ) {
			( self::$mutex_release )( $job_id );
			return;
		}
		global $wpdb;
		if ( isset( $wpdb ) && is_object( $wpdb ) && method_exists( $wpdb, 'query' ) ) {
			$wpdb->query( $wpdb->prepare( 'SELECT RELEASE_LOCK( %s )', self::mutex_name( $job_id ) ) );
		}
	}

	/**
	 * Test seam.
	 *
	 * @param EMCP_Tools_Lease|null $lease Lease, or null for the options store.
	 */
	public static function use_lease( ?EMCP_Tools_Lease $lease ): void {
		self::$lease = $lease;
	}

	public static function lease(): EMCP_Tools_Lease {
		if ( null === self::$lease ) {
			self::$lease = new EMCP_Tools_Lease();
		}
		return self::$lease;
	}

	public static function name( string $job_id ): string {
		return 'backup-job-' . $job_id;
	}

	/**
	 * The chunk request's owner: the tab's token, or a per-user owner for the
	 * legacy screen that sends none.
	 *
	 * @return string
	 */
	public static function owner_from_request(): string {
		// phpcs:ignore WordPress.Security.NonceVerification.Missing -- the chunk action verified the nonce.
		$raw   = isset( $_POST['owner'] ) && is_string( $_POST['owner'] ) ? (string) wp_unslash( $_POST['owner'] ) : '';
		$owner = substr( (string) preg_replace( '/[^A-Za-z0-9_.:-]/', '', $raw ), 0, 64 );
		return '' !== $owner ? $owner : 'ajax-user-' . get_current_user_id();
	}

	/**
	 * Run one chunk as $owner.
	 *
	 * @param string   $job_id  Job id.
	 * @param string   $owner   Owner token.
	 * @param callable $chunk   () => true|array|WP_Error.
	 * @param callable $persist ( $result ) => void, called only while the lease is still held.
	 * @return true|array|WP_Error
	 */
	public static function run( string $job_id, string $owner, callable $chunk, callable $persist ) {
		$name  = self::name( $job_id );
		$lease = self::lease();
		if ( ! self::mutex_acquire( $job_id ) ) {
			return new WP_Error( 'lease_busy', __( 'This backup is being processed elsewhere.', 'emcp-tools' ) );
		}
		try {
			if ( ! $lease->acquire( $name, $owner, self::TTL ) ) {
				return new WP_Error( 'lease_busy', __( 'This backup is being processed elsewhere.', 'emcp-tools' ) );
			}
			$result = $chunk();
			if ( is_wp_error( $result ) ) {
				return $result;
			}
			if ( ! $lease->renew( $name, $owner, self::TTL ) ) {
				return new WP_Error( 'lease_lost', __( 'This backup is now being processed elsewhere.', 'emcp-tools' ) );
			}
			$persist( $result );
			return $result;
		} finally {
			self::mutex_release( $job_id );
		}
	}

	/**
	 * Release the lease if $owner holds it.
	 *
	 * @param string $job_id Job id.
	 * @param string $owner  Owner token.
	 */
	public static function release( string $job_id, string $owner ): void {
		self::lease()->release( self::name( $job_id ), $owner );
	}
}
